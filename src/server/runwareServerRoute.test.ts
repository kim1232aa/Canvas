import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { describe, expect, it } from 'vitest';

const serverSource = readFileSync(new URL('../../server.ts', import.meta.url), 'utf8');

describe('Server Runware and ModelsLab Routes Contract', () => {
  it('Runware route is registered in LARGE_BODY_ROUTES and calls buildRunwareImageRequest', () => {
    expect(serverSource).toContain("'/api/engine/runware/generate'");
    expect(serverSource).toContain('buildRunwareImageRequest');
    expect(serverSource).toContain('inspectRunwareImageResponseBody');
    expect(serverSource).toContain("provider: 'runware'");
  });

  it('ModelsLab route is registered in LARGE_BODY_ROUTES and calls buildModelsLabImageRequest', () => {
    expect(serverSource).toContain("'/api/engine/modelslab/generate'");
    expect(serverSource).toContain('buildModelsLabImageRequest');
    expect(serverSource).toContain('parseModelsLabResponse');
    expect(serverSource).toContain("provider: 'modelslab'");
  });

  it('supports runware and modelslab in AUTH_META and POOL_KEY_FIELDS', () => {
    expect(serverSource).toContain("runware: { settings: ['runwareKey'], env: 'runwareKey' }");
    expect(serverSource).toContain("modelslab: { settings: ['modelslabKey'], env: 'modelslabKey' }");
    expect(serverSource).toContain("headerPrefix: 'x-runware'");
    expect(serverSource).toContain("headerPrefix: 'x-modelslab'");
    expect(serverSource).toContain("VALID_STRATEGY_PROVIDERS = new Set([\n  'muapi',");
    expect(serverSource).toContain("'runware'");
    expect(serverSource).toContain("'modelslab'");
  });

  it('masks apiKey in ModelsLab responses and uses official fetch contract for async jobs', () => {
    expect(serverSource).toContain('sanitizeModelsLabPayload');
    expect(serverSource).toContain('buildModelsLabFetchRequest');
  });

  it('keeps 2xx semantic/protocol failures tied to the real first-response status and endpoint', () => {
    expect(serverSource).toContain('inspectRunwareImageResponseBody(receivedBody, upstream.status');
    expect(serverSource).toContain('inspectModelsLabImageResponseBody(receivedBody, upstream.status');
    expect(serverSource).toContain('upstreamStatus: inspected.upstreamStatus');
    expect(serverSource).toContain("inspected.kind === 'semantic-error' ? 'upstream' : 'upstream-protocol'");
    expect(serverSource).toContain('rawResponse: inspected.rawResponse');
    expect(serverSource).toContain('endpoint,');
  });
});

// ---------------------------------------------------------------------------
// Real key-probe execution: the server.ts function is sliced out and run with a
// stubbed upstreamFetch, so the URL / method / body asserted here is the one the
// provider would actually receive. Probe sources verified 2026-11-08:
// - Runware modelSearch: https://runware.ai/docs/models-api/model-search
// - ModelsLab model_list: https://docs.modelslab.com/image-generation/model-operation/model-list
// - Mage GET /v1/account: https://docs.mage.space/api/endpoints/get-account
// - DeepInfra GET /v1/me: https://docs.deepinfra.com/api-reference/account/me
// ---------------------------------------------------------------------------

function sliceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = start < 0 ? -1 : source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end <= start) throw new Error(`slice not found: ${startMarker}`);
  return source.slice(start, end);
}

function compileSlices(vars: Record<string, unknown>, code: string, exportNames: string[]) {
  const js = transformSync(code, { loader: 'ts' }).code;
  const factory = new Function(...Object.keys(vars), `${js}\nreturn {${exportNames.map((n) => `${n}: typeof ${n} !== 'undefined' ? ${n} : undefined`).join(',')}};`);
  return factory(...Object.values(vars));
}

const probeSource = sliceBetween(serverSource, 'async function testSingleProviderKey(', "app.post('/api/test-provider'");

type ProbeHarness = { run: (provider: string, key: string) => Promise<any>; calls: Array<{ url: string; init: any; meta: any }> };

function probeHarness(options: { baseUrl?: string; respond?: (url: string) => any; respondEach?: Array<(url: string) => any> }): ProbeHarness {
  const calls: ProbeHarness['calls'] = [];
  const upstreamFetch = async (meta: any, url: string, init: any = {}) => {
    calls.push({ url, init, meta });
    const responder = options.respondEach?.shift() || options.respond;
    return responder ? responder(url) : { ok: true, status: 200, text: async () => '{"data":[]}', json: async () => ({ data: [] }) };
  };
  const slice = compileSlices(
    {
      upstreamFetch,
      keyPoolManager: { maskKey: (key: string) => `${key.slice(0, 4)}...${key.slice(-4)}` },
      getProviderBaseUrl: () => ({ baseUrl: options.baseUrl ?? 'https://api.example.test' }),
      crypto: { randomUUID: () => '11111111-1111-4111-8111-111111111111' },
      falReadOnlyKeyCheck: async () => ({ status: 'active', message: '' }),
      probeModelScopeKey: async () => ({ status: 'ok', latency: 0, message: '' }),
      probeOpenAICompatModelsKey: async () => ({ status: 'ok', latency: 0, message: '' }),
      probeTamsKey: async () => ({ status: 'ok', latency: 0, message: '' }),
    },
    probeSource,
    ['testSingleProviderKey'],
  );
  return { run: (provider, key) => slice.testSingleProviderKey(provider, key, '/api/test-provider'), calls };
}

describe('server.ts testSingleProviderKey probes real read-only endpoints', () => {
  it('runware sends POST modelSearch instead of the old hardcoded unsupported status', async () => {
    const h = probeHarness({ baseUrl: 'https://api.runware.ai/v1' });
    const result = await h.run('runware', 'rw-live-1234567890');
    expect(result.status).toBe('ok');
    expect(result.status).not.toBe('unsupported');
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].url).toBe('https://api.runware.ai/v1');
    expect(h.calls[0].init.method).toBe('POST');
    expect(h.calls[0].init.headers.Authorization).toBe('Bearer rw-live-1234567890');
    const body = JSON.parse(h.calls[0].init.body);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ taskType: 'modelSearch', taskUUID: '11111111-1111-4111-8111-111111111111' });
    expect(body[0].search.length).toBeGreaterThanOrEqual(2);
    expect(body[0].search.length).toBeLessThanOrEqual(48);
    expect(result.message).toContain('modelSearch');
  });

  it('runware keeps the upstream status and verbatim body on rejection', async () => {
    const h = probeHarness({ baseUrl: 'https://api.runware.ai/v1', respond: () => ({ ok: false, status: 401, text: async () => '{"errors":["invalid api key"]}' }) });
    const result = await h.run('runware', 'rw-bad-1234567890');
    expect(result.status).toBe('error');
    expect(result.message).toContain('HTTP 401');
    expect(result.message).toContain('invalid api key');
  });

  it('modelslab posts the documented /api/v4/dreambooth/model_list body', async () => {
    const h = probeHarness({ baseUrl: 'https://modelslab.com', respond: () => ({ ok: true, status: 200, text: async () => '[{"model_id":"midjourney"},{"model_id":"anything-v3"}]' }) });
    const result = await h.run('modelslab', 'ml-live-1234567890');
    expect(result.status).toBe('ok');
    expect(h.calls[0].url).toBe('https://modelslab.com/api/v4/dreambooth/model_list');
    expect(h.calls[0].init.method).toBe('POST');
    expect(JSON.parse(h.calls[0].init.body)).toEqual({ key: 'ml-live-1234567890' });
    expect(result.message).toContain('2 个公开模型');
  });

  it('deepinfra probes GET https://api.deepinfra.com/v1/me with the bearer key', async () => {
    const h = probeHarness({});
    const result = await h.run('deepinfra', 'di-live-1234567890');
    expect(result.status).toBe('ok');
    expect(h.calls[0].url).toBe('https://api.deepinfra.com/v1/me');
    expect(h.calls[0].init.headers.Authorization).toBe('Bearer di-live-1234567890');
    expect(result.message).toContain('HTTP 200');
  });

  it('mage probes GET {baseUrl}/v1/account and reports the Gems balance', async () => {
    const h = probeHarness({ baseUrl: 'https://api.mage.space', respond: () => ({ ok: true, status: 200, text: async () => '{"balance":{"gems":2500}}' }) });
    const result = await h.run('mage', 'mage_sk_live_1234567890');
    expect(result.status).toBe('ok');
    expect(result.message).not.toContain('未知模型服务商');
    expect(h.calls[0].url).toBe('https://api.mage.space/v1/account');
    expect(h.calls[0].init.headers.Authorization).toBe('Bearer mage_sk_live_1234567890');
    expect(result.message).toContain('2500');
  });

  it('mage normalizes a base URL that already ends with /v1', async () => {
    const h = probeHarness({ baseUrl: 'https://api.mage.space/v1' });
    await h.run('mage', 'mage_sk_live_1234567890');
    expect(h.calls[0].url).toBe('https://api.mage.space/v1/account');
  });
});

// ---------------------------------------------------------------------------
// respondWithGeneratedImages / recordHistoryItem media truth: video stays video.
// ---------------------------------------------------------------------------

const respondSource = sliceBetween(serverSource, 'async function respondWithGeneratedImages(', 'async function recordAdditionalImages(');
const historySource = sliceBetween(serverSource, 'const recordHistoryItem = async', '// Persist every returned image;');

function mediaResponseHarness() {
  const persisted: any[] = [];
  const persistGeneratedImages = async (_images: unknown[], metadata: any) => {
    persisted.push(metadata);
    const item = { url: '/api/media/out-1.mp4', id: 'hist_1' };
    return { first: item, historyItems: [item], transientOutputs: [] };
  };
  const slice = compileSlices(
    {
      persistGeneratedImages,
      requireDurableHistoryMediaUrl: async () => ({ ok: true, dataUrl: '/api/media/out-1.mp4' }),
      recordHistoryItem: async (item: any) => item,
    },
    respondSource,
    ['respondWithGeneratedImages'],
  );
  const res: any = {
    code: 200,
    body: null,
    status(code: number) { this.code = code; return this; },
    json(body: any) { this.body = body; return this; },
  };
  return { respond: slice.respondWithGeneratedImages, persisted, res };
}

describe('respondWithGeneratedImages media kind', () => {
  it('marks replicate video outputs as video in both the response and history metadata', async () => {
    const h = mediaResponseHarness();
    await h.respond(h.res, ['https://upstream.example/video.mp4'], { provider: 'Replicate', requestMetadata: { requestedParameters: { isVideo: true } } }, { label: 'Replicate' });
    expect(h.res.body.mediaType).toBe('video');
    expect(h.res.body.videoUrl).toBe('/api/media/out-1.mp4');
    expect(h.res.body.mediaUrl).toBe('/api/media/out-1.mp4');
    expect(h.persisted[0].mediaType).toBe('video');
  });

  it('keeps image outputs labelled image with no videoUrl', async () => {
    const h = mediaResponseHarness();
    await h.respond(h.res, ['https://upstream.example/image.png'], { provider: 'Runware', requestMetadata: { requestedParameters: { isVideo: false } } }, { label: 'Runware' });
    expect(h.res.body.mediaType).toBe('image');
    expect(h.res.body).not.toHaveProperty('videoUrl');
    expect(h.persisted[0].mediaType).toBeUndefined();
  });

  it('recordHistoryItem derives videoUrl from the durable url when mediaType is video', async () => {
    const slice = compileSlices(
      {
        generationContext: { getStore: () => undefined },
        sentHistoryNumbers: () => ({}),
        externalizeMedia: async (value: any) => value,
        writeJsonFile: () => {},
        keyUsagesFromTrace: () => [],
        generationHistory: [],
        MAX_HISTORY_COUNT: 500,
        HISTORY_FILE: 'history.json',
      },
      historySource,
      ['recordHistoryItem'],
    );
    const video = await slice.recordHistoryItem({ url: '/api/media/v.mp4', mediaType: 'video' });
    expect(video.mediaType).toBe('video');
    expect(video.videoUrl).toBe('/api/media/v.mp4');
    const image = await slice.recordHistoryItem({ url: '/api/media/i.png' });
    expect(image.mediaType).toBeUndefined();
    expect(image.videoUrl).toBeUndefined();
  });
});
