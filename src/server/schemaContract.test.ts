/**
 * Provider contract tests: canvas-filled params declared by docs/provider-schema-drafts/*.json
 * MUST appear in actualRequest (mapped names), and schemaSendHint must never badge them「不会发送」.
 * Uses the real /api/schema-provider/:provider/submit builder with an upstream fixture (no network, no keys).
 */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { describe, expect, it } from 'vitest';
import { registerSchemaProviderRoutes, sogniSchemaSource } from './schemaProviders';
import { sogniGenerateImageSchemaFixture } from './fixtures/sogniGenerateImageSchema';
import { isSchemaOmitCandidate } from '../utils/schemaSendHint';

const draft = (id: string) => JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../docs/provider-schema-drafts', id + '.json'), 'utf8'));

async function withFixture(
  upstream: (url: string, init?: RequestInit) => Promise<Response>,
  run: (baseUrl: string, calls: Array<{ url: string; init?: RequestInit; meta?: any }>) => Promise<void>,
  key: (provider: string, override?: string) => string = () => '',
  durable: (url: string) => Promise<any> = async (url) => ({ ok: true, dataUrl: url }),
  record: (item: any) => any = (item) => item,
) {
  const calls: Array<{ url: string; init?: RequestInit; meta?: any }> = [];
  const app = express();
  registerSchemaProviderRoutes(app, {
    fetch: async (meta, url, init) => {
      calls.push({ url, init, meta });
      if(url===sogniSchemaSource)return json(sogniGenerateImageSchemaFixture);
      return upstream(url, init);
    },
    key,
    record,
    durable,
  });

  const baseUrl = 'http://schema-provider.fixture';
  const originalFetch = globalThis.fetch;
  const router = (app as any)._router;
  const layers: any[] = router?.stack || [];
  const matchRoute = (pattern: string, pathname: string) => {
    const expected = pattern.split('/').filter(Boolean);
    const actual = pathname.split('/').filter(Boolean);
    if (expected.length !== actual.length) return undefined;
    const params: Record<string, string> = {};
    for (let i = 0; i < expected.length; i++) {
      if (expected[i].startsWith(':')) params[expected[i].slice(1)] = decodeURIComponent(actual[i]);
      else if (expected[i] !== actual[i]) return undefined;
    }
    return params;
  };

  const fixtureFetch: typeof fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
    const raw = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const url = new URL(raw, baseUrl);
    if (url.origin !== baseUrl) return originalFetch(input as any, init);
    const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toLowerCase();
    const layer = layers.find((candidate) => {
      const route = candidate.route;
      return route && route.methods?.[method] && typeof route.path === 'string' && matchRoute(route.path, url.pathname);
    });
    if (!layer) return new Response(JSON.stringify({ error: `Fixture route not found: ${method.toUpperCase()} ${url.pathname}` }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    const params = matchRoute(layer.route.path, url.pathname) || {};
    const headers = Object.fromEntries(new Headers(init.headers || (input instanceof Request ? input.headers : undefined)).entries());
    let body: any = undefined;
    const rawBody = init.body ?? (input instanceof Request ? await input.clone().text() : undefined);
    if (typeof rawBody === 'string' && rawBody) {
      try { body = JSON.parse(rawBody); } catch { body = rawBody; }
    }
    const req: any = { method: method.toUpperCase(), path: url.pathname, params, query: Object.fromEntries(url.searchParams.entries()), headers, body };
    let response: Response | undefined;
    const res: any = {
      statusCode: 200,
      status(code: number) { this.statusCode = code; return this; },
      json(payload: unknown) {
        response = new Response(JSON.stringify(payload), { status: this.statusCode, headers: { 'Content-Type': 'application/json' } });
        return this;
      },
    };
    const next = () => { if (!response) response = new Response(JSON.stringify({ error: 'Fixture route passed to next()' }), { status: 404, headers: { 'Content-Type': 'application/json' } }); };
    for (const routeLayer of layer.route.stack) await routeLayer.handle(req, res, next);
    return response || new Response(null, { status: res.statusCode || 204 });
  };
  globalThis.fetch = fixtureFetch;

  try {
    await run(baseUrl, calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}


const submit = async (baseUrl: string, provider: string, body: any) => {
  const r = await fetch(`${baseUrl}/api/schema-provider/${provider}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json() as Promise<any>;
};
/** Declared Schema props the UI sees (custom_parameters._canvas.schemaProperties). */
const hintCustom = (props: string[]) => JSON.stringify({ _canvas: { schemaProperties: props } });
/** Canvas field → declared draft param name (only what the draft lists). */
const CANVAS = { seed: 42, steps: 6, cfg: 3.5, width: 1024, height: 768, negative_prompt: 'blurry' } as const;
const expectNoOmitBadge = (provider: string, declared: string[], fields: string[]) => {
  for (const f of fields) expect(isSchemaOmitCandidate(provider, f, hintCustom(declared)), `${provider}.${f} badged 不会发送`).toBe(false);
};
const sentFalse = (ar: any, from: string) => ar.mapping.find((m: any) => m.from === from && m.sent === false);

describe('provider contract: declared fields must be sent', () => {
  it('Krea bfl/flux-1-dev: steps, guidance_scale(cfg), seed, width, height, styles[{id,strength}]', async () => {
    const p = draft('krea').image.parametersByEndpoint['bfl/flux-1-dev'];
    const declared = Object.keys(p).filter((k) => p[k]?.supported !== false);
    const properties: any = { prompt: { type: 'string' } };
    for (const k of declared) properties[k] = k === 'styles' ? { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, strength: { type: 'number' } } } } : { type: 'number' };
    const openapi = { paths: { '/generate/image/bfl/flux-1-dev': { post: { summary: 'Flux.1 Dev', requestBody: { content: { 'application/json': { schema: { type: 'object', properties } } } } } } } };
    let upstream: any;
    await withFixture(async (url, init) => {
      if (url.endsWith('/openapi.json')) return json(openapi);
      upstream = JSON.parse(String(init?.body || '{}'));
      return json({ job_id: 'k1' });
    }, async (baseUrl) => {
      const b = await submit(baseUrl, 'krea', { model: 'image/bfl/flux-1-dev', prompt: 'x', seed: 42, steps: 6, cfg: 3.5, width: 1024, height: 768, loras: [{ name: 'style-1', strength: 0.85 }] });
      expect(b.actualRequest.parameters).toMatchObject({ seed: 42, steps: 6, guidance_scale: 3.5, width: 1024, height: 768, styles: [{ id: 'style-1', strength: 0.85 }] });
      expect(upstream).toMatchObject(b.actualRequest.parameters);
      for (const f of ['seed', 'steps', 'cfg', 'width', 'height']) expect(sentFalse(b.actualRequest, f)).toBeUndefined();
      expectNoOmitBadge('krea', Object.keys(properties), ['seed', 'steps', 'cfg', 'width', 'height']);
    }, () => 'k');
  });

  for (const model of ['alibaba/z-image-turbo-lora', 'blackforestlabs/flux-2-lora']) {
    it(`AIMLAPI ${model}: seed, num_inference_steps(steps), image_size(width/height), loras[{path,scale}]`, async () => {
      const d = draft('aimlapi').image;
      // `_`-prefixed draft keys are annotations (e.g. `_notDeclared`), not Schema fields.
      const declared = [...Object.keys(d.parametersCommon), ...Object.keys(d.parametersByModel[model]), 'loras'].filter((k) => !k.startsWith('_'));
      const hasCfg = declared.includes('guidance_scale');
      let upstream: any;
      await withFixture(async (url, init) => {
        // AIMLAPI Schema = catalog info.docsJson official OpenAPI (no built-in fallback); fixture built from the draft-declared fields.
        const docsJson = `https://api.aimlapi.com/docs-json?model=${encodeURIComponent(model)}`;
        if (url.includes('/models')) return json({ data: [{ id: model, type: 'image', modalities: { output: ['image'] }, info: { docsJson } }] });
        if (url === docsJson) return json({ openapi: '3.0.0', paths: { '/v1/images/generations': { post: { requestBody: { content: { 'application/json': { schema: { type: 'object', properties: Object.fromEntries(['model', 'prompt', ...declared].map((k) => [k, k === 'loras' ? { type: 'array', maxItems: 3, items: { type: 'object', properties: { path: { type: 'string' }, scale: { type: 'number', minimum: 0, maximum: 4 } } } } : k === 'image_size' ? { anyOf: [{ type: 'object', properties: { width: { type: 'integer', minimum: 512, maximum: 2048 }, height: { type: 'integer', minimum: 512, maximum: 2048 } } }] } : {}])) } } } } } } } });
        upstream = JSON.parse(String(init?.body || '{}'));
        return json({ id: 'a1', data: [{ url: 'https://fixture.invalid/a.png' }] });
      }, async (baseUrl) => {
        const b = await submit(baseUrl, 'aimlapi', { model, prompt: 'x', seed: 42, steps: 6, ...(hasCfg ? { cfg: 3.5 } : {}), width: 1024, height: 768, loras: [{ path: 'ostris/z_image_turbo_childrens_drawings', strength: 0.85 }] });
        expect(b.actualRequest.parameters).toMatchObject({ model, seed: 42, num_inference_steps: 6, image_size: { width: 1024, height: 768 }, loras: [{ path: 'ostris/z_image_turbo_childrens_drawings', scale: 0.85 }], ...(hasCfg ? { guidance_scale: 3.5 } : {}) });
        expect(upstream).toMatchObject(b.actualRequest.parameters);
        for (const f of ['seed', 'steps', 'width', 'height', ...(hasCfg ? ['cfg'] : [])]) expect(sentFalse(b.actualRequest, f), `${f} sent:false`).toBeUndefined();
        // Draft-declared fields must be a subset of the Schema the UI receives; the hint uses that real Schema.
        const uiSchema = Object.keys(b.inputSchema.properties);
        for (const k of declared) expect(uiSchema, `draft field ${k} missing from inputSchema`).toContain(k);
        expectNoOmitBadge('aimlapi', uiSchema, ['seed', 'steps', 'width', 'height', ...(hasCfg ? ['cfg'] : [])]);
      }, () => 'k');
    });
  }

  it('Novita: HTML declaration (config) present → request IS sent to /v3/async/txt2img (画布 03:25)', async () => {
    let posts = 0;
    await withFixture(async (url, init) => {
      if ((init?.method || 'GET').toUpperCase() === 'POST') { posts++; return json({}); }
      return json({ models: [{ type: { name: 'checkpoint' }, sd_name_in_api: 'sdxl_base.safetensors' }] });
    }, async (baseUrl) => {
      const b = await submit(baseUrl, 'novita', { model: 'sdxl_base.safetensors', prompt: 'x', ...CANVAS });
      expect(String(b.error || '')).not.toContain('没有发出去');
      expect(posts).toBe(1);
    }, () => 'k');
  });

  it('undeclared fields may be flagged: Krea ideogram has no steps/guidance_scale', () => {
    const p = draft('krea').image.parametersByEndpoint['ideogram/ideogram-4.5'];
    const declared = Object.keys(p).filter((k) => p[k] !== false && p[k]?.supported !== false);
    expect(isSchemaOmitCandidate('krea', 'steps', hintCustom(declared))).toBe(true);
    expect(isSchemaOmitCandidate('krea', 'cfg', hintCustom(declared))).toBe(true);
    expect(isSchemaOmitCandidate('krea', 'seed', hintCustom(declared))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 16-provider extension (2026-10-15): remaining 11 drafts. Schema-route providers go through the real
// /api/schema-provider route; the others through their real request builder / route handler with local fixtures.
// No network, no keys (fixture key 'k'), no .env.
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { getFieldSpec } from '../schemas/providerSchema';
import { buildReplicatePredictionRequest } from './replicateImageContract';
import { handleReplicateGenerate } from './routes/replicateRoutes';
import { falImageFieldGate, FalSchemaMissingError } from './falImageContract';
import { loadFalLiveProps } from './fixtures/liveSchemaFixtures';
import { buildModelScopeLoras } from '../schemas/modelScopeLoras';
import { buildModelScopeImagePayload } from './modelScopeImageContract';
import { buildTensorModelJob, tamsVideoUnsupported } from '../schemas/tensorModelApi';
import { buildOpenWorksRequest, openWorksInputSchema, openWorksMediaKind, openWorksCatalogItems, parseOpenWorksCatalog, OPENWORKS_PROBE_RESULTS } from './openWorksProvider';
import { schemaSendStatus } from '../utils/schemaSendStatus';
import { schemaChoiceFields } from '../components/SchemaChoiceControls';
import { buildNanoImagePayload } from '../schemas/nanoImageApi';
import { buildCivitaiImageRequest } from './civitaiImageContract';
import { loadCivitaiImageGenOpenApi } from './fixtures/liveSchemaFixtures';
const oa = () => loadCivitaiImageGenOpenApi();
import { ModelScopeDriver } from '../engines/drivers/ModelScopeDriver';

const serverSrc = readFileSync(path.resolve(__dirname, '../../server.ts'), 'utf8');
const videoRouteSrc = readFileSync(path.resolve(__dirname, './routes/videoGenerateRoute.ts'), 'utf8');
const routeWiringSrc = serverSrc + '\n' + videoRouteSrc;
const unsupportedLabel = (p: any, model: string, f: any) => getFieldSpec(p, model, f)?.status === 'unsupported';

describe('provider contract (16): schema-route providers', () => {
  const WS_MODEL = 'wavespeed-ai/krea-v2/turbo-lora';
  const wsRow = { model_id: WS_MODEL, category: 'text-to-image', api_schema: { api_schemas: [{ type: 'model_run', method: 'POST', server: 'https://api.wavespeed.ai', api_path: `/api/v3/${WS_MODEL}`,
    request_schema: { properties: { prompt: { type: 'string' }, seed: { type: 'integer' }, aspect_ratio: { type: 'string' }, resolution: { type: 'string', enum: ['1k', '2k'] }, strength: { type: 'number' },
      loras: { type: 'array', maxItems: 3, items: { type: 'object', properties: { path: { type: 'string' }, scale: { type: 'number' } } } } } } }] } };

  it('P0-1: unfilled fields with an upstream default are NOT sent (no default injection); filled custom field IS sent', async () => {
    let upstream: any;
    await withFixture(async (url, init) => {
      if (url.includes('/api/v3/models')) return json({ code: 200, data: [wsRow] });
      upstream = JSON.parse(String(init?.body || '{}'));
      return json({ code: 200, data: { id: 'w3' } });
    }, async (baseUrl) => {
      const b = await submit(baseUrl, 'wavespeed', { model: WS_MODEL, prompt: 'x', seed: 1 });
      expect(Object.keys(upstream).sort()).toEqual(['prompt', 'seed']);
      expect(upstream).toEqual(b.actualRequest.parameters);
      const c = await submit(baseUrl, 'wavespeed', { model: WS_MODEL, prompt: 'x', custom_parameters: { resolution: '2k' } });
      expect(upstream.resolution).toBe('2k');
      expect(c.actualRequest.parameters.resolution).toBe('2k');
    }, () => 'k');
  });

  it('WaveSpeed billing: code 1407 body is surfaced verbatim (no rewrite)', async () => {
    const raw = JSON.stringify({ code: 1407, message: 'insufficient_credits', data: null });
    await withFixture(async (url) => {
      if (url.includes('/api/v3/models')) return json({ code: 200, data: [wsRow] });
      return new Response(raw, { status: 200, headers: { 'Content-Type': 'application/json' } });
    }, async (baseUrl) => {
      const b = await submit(baseUrl, 'wavespeed', { model: WS_MODEL, prompt: 'x', seed: 1 });
      expect(b.ok).toBe(false);
      expect(b.rawResponse).toBe(raw);
      expect(b.error).toContain(raw);
      expect(b.actualRequest.parameters).toMatchObject({ seed: 1 });
    }, () => 'k');
  });

  const muDoc = { paths: {
    '/api/v1/krea-v2-turbo-lora': { post: { requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { prompt: {}, seed: { type: 'integer' }, aspect_ratio: {}, loras: { type: 'array', maxItems: 3, items: { type: 'object', properties: { path: {}, scale: {} } } } } } } } } } },
    '/api/v1/flux-2-klein-4b-text-to-image-lora': { post: { requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { prompt: {}, seed: {}, width: {}, height: {}, lora_list: { type: 'array', items: { type: 'object', properties: { path: {}, scale: {} } } } } } } } } } },
    '/api/v1/flux_dev_lora_image': { post: { requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { prompt: {}, seed: {}, num_inference_steps: {}, guidance_scale: {}, width: {}, height: {}, lora_url: {}, lora_weight: {} } } } } } } },
  } };
  const muFixture = (onSubmit: (url: string, body: any) => Response) => async (url: string, init?: RequestInit) => {
    if (url.endsWith('/openapi.json')) return json(muDoc);
    if (url.endsWith('/api/v1/models')) return json({ models: Object.keys(muDoc.paths).map((p) => ({ name: p.split('/').pop(), endpoint_url: p.split('/').pop(), group_of: 'image' })) });
    return onSubmit(url, JSON.parse(String(init?.body || '{}')));
  };

  it('MuAPI sandbox: is_test mock result is NOT reported as completed', async () => {
    await withFixture(async (url, init) => {
      if (url.includes('/predictions/')) return json({ status: 'completed', outputs: ['https://mock.invalid/x.png'], is_test: true });
      return muFixture(() => json({ request_id: 'sb1' }))(url, init);
    }, async (baseUrl) => {
      const s = await submit(baseUrl, 'muapi', { model: 'krea-v2-turbo-lora', prompt: 'x' });
      const poll = await (await fetch(`${baseUrl}${s.pollUrl}`)).json() as any;
      expect(poll.status).toBe('sandbox_mock');
      expect(poll.outputs).toEqual([]);
      expect(poll.rawResponse.is_test).toBe(true);
    }, () => 'k');
  });

  it('Sogni billing: waiting_for_user + insufficient_credit → poll status , no history record (not completed)', async () => {
    const task = { data: { workflow: { workflowId: 's2', status: 'waiting_for_user', waitingReason: 'insufficient_credit', steps: [] } } };
    const records: any[] = [];
    await withFixture(async (url) => url.includes('/workflows/s2') ? json(task) : json({ data: { workflow: { workflowId: 's2' } } }), async (baseUrl) => {
      const s = await submit(baseUrl, 'sogni', { model: 'krea-2-turbo', prompt: 'x' });
      expect(s.taskId).toBe('s2');
      expect(s.credentialRef).toBeTruthy();
      const pollRes = await fetch(`${baseUrl}${s.pollUrl}`, { headers: { 'x-canvas-credential-ref': s.credentialRef } });
      // history write is async on the poll route; flush one macrotask
      await new Promise((r) => setTimeout(r, 0));
      const poll = await pollRes.json() as any;
      expect(poll.status).toBe('waiting_for_user');
      expect(poll.waitingReason).toBe('insufficient_credit');
      expect(poll.rawResponse).toEqual(task);
      // Failed runs are not history (雁 2026-11-04): the verbatim task body goes to the node only.
      expect(poll.historyItem).toBeUndefined();
      expect(records).toHaveLength(0);
    }, () => 'k', async (url) => ({ ok: true, dataUrl: url }), (item) => { records.push(item); return item; });
  });
});

describe('provider contract (16): builder / route-handler providers', () => {

  it('TAMS: seed→inputInitialize.seed, steps/cfg/size→diffusion.*, LoRA→diffusion.lora.items[{loraModel,weight}]; non-64 rejected; video rejected locally', () => {
    const job = buildTensorModelJob({ model: '600000000000000001', prompt: 'x', seed: 42, steps: 20, cfg: 7, width: 1024, height: 768, negative_prompt: 'blurry', loras: [{ tensorartId: '700000000000000001', strength: 0.8 }] }, 'r1');
    expect(job.stages[0].inputInitialize).toEqual({ seed: '42' });
    expect(job.stages[1].diffusion).toMatchObject({ steps: 20, cfgScale: 7, width: 1024, height: 768, negativePrompts: [{ text: 'blurry' }], lora: { items: [{ loraModel: '700000000000000001', weight: 0.8 }] } });
    expect(JSON.stringify(job)).not.toContain('strength');
    expect(() => buildTensorModelJob({ model: '600000000000000001', prompt: 'x', width: 1000, height: 768 }, 'r2')).toThrow(/64/);
    expect(tamsVideoUnsupported('600000000000000001')).toMatch(/没有通用视频生成接口/);
    expect(tamsVideoUnsupported('text2video_tool')).toBeUndefined();
    expect(readFileSync(path.resolve(__dirname, './routes/videoGenerateRoute.ts'), 'utf8')).toContain('if (tamsVideoRefusal) return res.status(400)');
  });

  it('NanoGPT: LoRA sent as filled without supported_parameters.loras; declared seed sent; billing text verbatim', () => {
    const ep = { supported_parameters: { seed: { min: 0 }, resolutions: ['1024x768'] } };
    const { payload } = buildNanoImagePayload({ model: 'm', prompt: 'x', seed: 42, width: 1024, height: 768 }, ep);
    expect(payload).toMatchObject({ seed: 42, resolution: '1024x768' });
    expect(buildNanoImagePayload({ model: 'm', prompt: 'x', loras: [{ path: 'https://a', strength: 1 }] }, ep).payload.loras).toEqual([{ path: 'https://a', scale: 1 }]);
    expect(serverSrc).toContain('error: `NanoGPT 生图失败 [${response.status}]: ${errorText}`');
  });

});
