import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { persistGeneratedImages } from './multiImageHistory';
import { buildRunwareImageRequest, inspectRunwareImageResponseBody } from './runwareImageContract';
import { buildModelsLabImageRequest, parseModelsLabResponse, buildModelsLabFetchRequest, sanitizeModelsLabPayload, inspectModelsLabPollBody, inspectModelsLabImageResponseBody } from './modelsLabImageContract';

const source = readFileSync(new URL('../../server.ts', import.meta.url), 'utf8');

const UNMAPPED = {
  name: 'cinematic-1940s.safetensors',
  civitaiId: '1527024',
  downloadUrl: 'https://civitai.com/api/download/models/1527024',
  strength: 0.3,
};

async function invoke(provider: 'runware' | 'modelslab', body: Record<string, unknown>, upstream: { ok: boolean; status: number; body: unknown }) {
  const marker = `app.post('/api/engine/${provider}/generate'`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`route marker missing: ${marker}`);
  const nextBoundary = provider === 'modelslab'
    ? source.indexOf('\nregisterReplicateRoutes(', start + marker.length)
    : source.indexOf('\napp.post(', start + marker.length);
  const end = nextBoundary > start ? nextBoundary : source.length;
  const routes = new Map<string, Function>();
  const sent: any[] = [];
  const records: any[] = [];
  const scope: Record<string, unknown> = {
    app: { post: (path: string, callback: Function) => routes.set(path, callback) },
    resolveProviderAuth: () => ({ apiKey: 'fixture-key', baseUrl: provider === 'runware' ? 'https://api.runware.ai/v1' : 'https://modelslab.com' }),
    sanitizeGenerationMetadata: (value: unknown) => value,
    keyPoolManager: { recordResult: () => {}, getNextKey: () => 'fixture-key' },
    upstreamFetch: async (_meta: unknown, url: string, options: any) => {
      sent.push({ url, body: JSON.parse(options.body) });
      const text = typeof upstream.body === 'string' ? upstream.body : JSON.stringify(upstream.body);
      return {
        ok: upstream.ok,
        status: upstream.status,
        text: async () => text,
        json: async () => (typeof upstream.body === 'string' ? JSON.parse(upstream.body) : upstream.body),
      };
    },
    buildRunwareImageRequest,
    inspectRunwareImageResponseBody,
    buildModelsLabImageRequest,
    parseModelsLabResponse,
    buildModelsLabFetchRequest,
    sanitizeModelsLabPayload,
    inspectModelsLabPollBody,
    inspectModelsLabImageResponseBody,
    respondWithGeneratedImages: async (res: any, images: unknown[], metadata: any, options: any) => {
      const result = await persistGeneratedImages(images, metadata, {
        persist: async (url: string) => ({ ok: true as const, dataUrl: '/api/media/' + String(url).split('/').pop() }),
        record: (item: any) => { const record = { ...item, id: String(records.length) }; records.push(record); return record; },
      });
      const historyWarnings = [options.response?.historyWarning, result.historyWarning].filter((item: unknown): item is string => typeof item === 'string' && item.length > 0);
      return res.json({
        ...options.response,
        historyItems: result.historyItems,
        transientOutputs: result.transientOutputs,
        ...(historyWarnings.length ? { historyWarning: historyWarnings.join('；') } : {}),
      });
    },
  };
  const code = (await transform(source.slice(start, end), { loader: 'ts', format: 'cjs' })).code;
  new Function(...Object.keys(scope), code)(...Object.values(scope));
  let response: any;
  let status = 200;
  const res: any = {
    status(code: number) { status = code; return res; },
    json(value: unknown) { response = value; return res; },
  };
  await routes.get(`/api/engine/${provider}/generate`)?.({ body, path: `/api/engine/${provider}/generate`, headers: {} }, res);
  return { status, response, records, sent };
}

describe('Runware and ModelsLab routes surface unmapped LoRAs', () => {
  it('Runware success keeps unmapped LoRAs in response, requestMetadata, and historyWarning', async () => {
    const result = await invoke('runware', {
      model: 'runware:100@1',
      prompt: 'portrait',
      loras: [
        { name: 'urn:air:flux1:lora:civitai:1351798@1527024', strength: 0.4 },
        UNMAPPED,
      ],
    }, {
      ok: true,
      status: 200,
      body: { data: [{ taskType: 'imageInference', taskUUID: 'task-1', imageURL: 'https://im.runware.ai/a.png', seed: 7, cost: 0.01 }] },
    });

    expect(result.status).toBe(200);
    expect(result.sent[0].body[0].lora).toEqual([{ model: 'civitai:1351798@1527024', weight: 0.4 }]);
    expect(result.response.unmappedLoras).toHaveLength(1);
    expect(result.response.unmappedLoras[0].item).toMatchObject(UNMAPPED);
    expect(result.response.historyWarning).toContain('unmappedLoras');
    expect(result.records[0].requestMetadata.unmappedLoras).toEqual(result.response.unmappedLoras);
    expect(result.records[0].historyWarning).toContain('1 个 LoRA');
  });

  it('Runware upstream error still returns the unmapped LoRAs next to actualRequest', async () => {
    const result = await invoke('runware', {
      model: 'runware:100@1',
      prompt: 'portrait',
      loras: [UNMAPPED],
    }, { ok: false, status: 422, body: 'invalid model' });

    expect(result.status).toBe(422);
    expect(result.response.actualRequest).toBeDefined();
    expect(result.response.unmappedLoras).toHaveLength(1);
    expect(result.response.unmappedLoras[0].reason).toContain('AIR');
    expect(JSON.stringify(result.response.actualRequest)).not.toContain('cinematic-1940s');
  });

  it('ModelsLab success keeps unmapped LoRAs in response, requestMetadata, and historyWarning', async () => {
    const result = await invoke('modelslab', {
      model_id: 'sdxl',
      prompt: 'portrait',
      loras: [
        { model: 'detail-xl-lora', strength: 0.6 },
        UNMAPPED,
      ],
    }, {
      ok: true,
      status: 200,
      body: { status: 'success', output: ['https://modelslab.example/a.png'], id: 9 },
    });

    expect(result.status).toBe(200);
    expect(result.sent[0].body.lora_model).toBe('detail-xl-lora');
    expect(result.sent[0].body.key).toBe('fixture-key');
    expect(result.response.actualRequest.key).not.toBe('fixture-key');
    expect(result.response.unmappedLoras).toHaveLength(1);
    expect(result.response.unmappedLoras[0].item).toMatchObject(UNMAPPED);
    expect(result.response.historyWarning).toContain('unmappedLoras');
    expect(result.records[0].requestMetadata.unmappedLoras).toEqual(result.response.unmappedLoras);
  });

  it('ModelsLab upstream error still returns the unmapped LoRAs next to actualRequest', async () => {
    const result = await invoke('modelslab', {
      model_id: 'sdxl',
      prompt: 'portrait',
      loras: [UNMAPPED],
    }, { ok: false, status: 400, body: 'bad lora' });

    expect(result.status).toBe(400);
    expect(result.response.actualRequest).toBeDefined();
    expect(result.response.unmappedLoras).toHaveLength(1);
    expect(result.response.actualRequest).not.toHaveProperty('lora_model');
  });

  it('a fully mapped request does not invent unmappedLoras or a warning', async () => {
    const result = await invoke('runware', {
      model: 'runware:100@1',
      prompt: 'portrait',
      loras: [{ name: 'civitai:1@2', strength: 0.5 }],
    }, {
      ok: true,
      status: 200,
      body: { data: [{ taskType: 'imageInference', taskUUID: 'task-2', imageURL: 'https://im.runware.ai/b.png' }] },
    });
    expect(result.response.unmappedLoras).toBeUndefined();
    expect(result.response.historyWarning).toBeUndefined();
    expect(result.records[0].requestMetadata.unmappedLoras).toBeUndefined();
  });
});
