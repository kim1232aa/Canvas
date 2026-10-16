/**
 * Provider contract tests: canvas-filled params declared by docs/provider-schema-drafts/*.json
 * MUST appear in actualRequest (mapped names), and schemaSendHint must never badge them「不会发送」.
 * Uses the real /api/schema-provider/:provider/submit builder with an upstream fixture (no network, no keys).
 */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { describe, expect, it } from 'vitest';
import { registerSchemaProviderRoutes } from './schemaProviders';
import { isSchemaOmitCandidate } from '../utils/schemaSendHint';

const draft = (id: string) => JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../docs/provider-schema-drafts', id + '.json'), 'utf8'));

async function withFixture(
  upstream: (url: string, init?: RequestInit) => Promise<Response>,
  run: (baseUrl: string, calls: Array<{ url: string; init?: RequestInit }>) => Promise<void>,
  key: (provider: string, override?: string) => string = () => '',
  durable: (url: string) => Promise<any> = async (url) => ({ ok: true, dataUrl: url }),
  record: (item: any) => any = (item) => item,
) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const app = express();
  registerSchemaProviderRoutes(app, {
    fetch: async (_meta, url, init) => {
      calls.push({ url, init });
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

  it('Together: no built-in Schema → local 400 未出站, no POST (画布 2026-10-15)', async () => {
    let posts = 0;
    await withFixture(async (url, init) => {
      if ((init?.method || 'GET').toUpperCase() === 'POST') { posts++; return json({}); }
      return json([{ id: 'black-forest-labs/FLUX.1-dev', type: 'image' }]);
    }, async (baseUrl) => {
      const b = await submit(baseUrl, 'together', { model: 'black-forest-labs/FLUX.1-dev', prompt: 'x', ...CANVAS });
      expect(b.errorSource).toBe('local');
      expect(String(b.error)).toContain('未出站，本地拦截');
      expect(JSON.stringify(b)).not.toContain('docs-openapi');
      expect(posts).toBe(0);
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
      expect(String(b.error || '')).not.toContain('未出站，本地拦截');
      expect(posts).toBe(1);
    }, () => 'k');
  });

  it('Venice: no built-in Schema → local 400 未出站, no POST (画布 2026-10-15)', async () => {
    let posts = 0;
    await withFixture(async (url, init) => {
      if ((init?.method || 'GET').toUpperCase() === 'POST') { posts++; return json({}); }
      return json({ data: [{ id: 'flux-dev', type: 'image', model_spec: {} }] });
    }, async (baseUrl) => {
      const b = await submit(baseUrl, 'venice', { model: 'flux-dev', prompt: 'x', ...CANVAS });
      expect(b.errorSource).toBe('local');
      expect(String(b.error)).toContain('未出站，本地拦截');
      expect(JSON.stringify(b)).not.toContain('docs-openapi');
      expect(posts).toBe(0);
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
import { falImageFieldGate } from './falImageContract';
import { buildModelScopeLoras } from '../schemas/modelScopeLoras';
import { buildModelScopeImagePayload } from './modelScopeImageContract';
import { buildTensorModelJob, tamsVideoUnsupported } from '../schemas/tensorModelApi';
import { buildOpenWorksRequest, openWorksInputSchema, openWorksCatalogItems, parseOpenWorksCatalog, OPENWORKS_PROBE_RESULTS } from './openWorksProvider';
import { schemaSendStatus } from '../utils/schemaSendStatus';
import { buildNanoImagePayload } from '../schemas/nanoImageApi';
import { buildCivitaiImageRequest } from './civitaiImageContract';
import { ModelScopeDriver } from '../engines/drivers/ModelScopeDriver';

const serverSrc = readFileSync(path.resolve(__dirname, '../../server.ts'), 'utf8');
const unsupportedLabel = (p: any, model: string, f: any) => getFieldSpec(p, model, f)?.status === 'unsupported';

describe('provider contract (16): schema-route providers', () => {
  const WS_MODEL = 'wavespeed-ai/krea-v2/turbo-lora';
  const wsRow = { model_id: WS_MODEL, category: 'text-to-image', api_schema: { api_schemas: [{ type: 'model_run', method: 'POST', server: 'https://api.wavespeed.ai', api_path: `/api/v3/${WS_MODEL}`,
    request_schema: { properties: { prompt: { type: 'string' }, seed: { type: 'integer' }, aspect_ratio: { type: 'string' }, resolution: { type: 'string', enum: ['1k', '2k'] }, strength: { type: 'number' },
      loras: { type: 'array', maxItems: 3, items: { type: 'object', properties: { path: { type: 'string' }, scale: { type: 'number' } } } } } } }] } };

  it('WaveSpeed krea-v2/turbo-lora: seed + loras[{path,scale}] sent; steps/cfg NOT sent and badged 不会发送', async () => {
    const declared = Object.keys(wsRow.api_schema.api_schemas[0].request_schema.properties);
    let upstream: any;
    await withFixture(async (url, init) => {
      if (url.includes('/api/v3/models')) return json({ code: 200, data: [wsRow] });
      upstream = JSON.parse(String(init?.body || '{}'));
      return json({ code: 200, data: { id: 'w1' } });
    }, async (baseUrl, calls) => {
      const b = await submit(baseUrl, 'wavespeed', { model: WS_MODEL, prompt: 'x', seed: 42, steps: 6, cfg: 3.5, loras: [{ path: 'owner/lora', strength: 0.9 }] });
      expect(b.actualRequest.parameters).toMatchObject({ seed: 42, loras: [{ path: 'owner/lora', scale: 0.9 }] });
      expect(b.actualRequest.parameters).not.toHaveProperty('num_inference_steps');
      expect(b.actualRequest.parameters).not.toHaveProperty('guidance_scale');
      expect(upstream).toEqual(b.actualRequest.parameters);
      expect(sentFalse(b.actualRequest, 'steps')).toBeTruthy();
      expect(sentFalse(b.actualRequest, 'cfg')).toBeTruthy();
      expect(sentFalse(b.actualRequest, 'seed')).toBeUndefined();
      expect(isSchemaOmitCandidate('wavespeed', 'steps', hintCustom(declared))).toBe(true);
      expect(isSchemaOmitCandidate('wavespeed', 'cfg', hintCustom(declared))).toBe(true);
      expectNoOmitBadge('wavespeed', declared, ['seed']);
      expect(String((calls.at(-1)!.init!.headers as any).Authorization)).toBe('Bearer k');
    }, () => 'k');
  });

  it('P0 aspect: filled aspect_ratio/resolution reach WaveSpeed when declared; undeclared output_format is sent:false; off-enum resolution blocked with official enum', async () => {
    let upstream: any;
    await withFixture(async (url, init) => {
      if (url.includes('/api/v3/models')) return json({ code: 200, data: [wsRow] });
      upstream = JSON.parse(String(init?.body || '{}'));
      return json({ code: 200, data: { id: 'w2' } });
    }, async (baseUrl) => {
      const b = await submit(baseUrl, 'wavespeed', { model: WS_MODEL, prompt: 'x', seed: 1, aspect_ratio: '16:9', resolution: '2k', output_format: 'png' });
      expect(b.actualRequest.parameters).toMatchObject({ aspect_ratio: '16:9', resolution: '2k' });
      expect(b.actualRequest.parameters).not.toHaveProperty('output_format');
      expect(sentFalse(b.actualRequest, 'output_format')).toBeTruthy();
      expect(upstream).toEqual(b.actualRequest.parameters);
      const bad = await submit(baseUrl, 'wavespeed', { model: WS_MODEL, prompt: 'x', resolution: '4K' });
      expect(bad.errorSource).toBe('local'); expect(bad.error).toContain('["1k","2k"]');
    }, () => 'k');
  });

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

  it('MuAPI: per-endpoint LoRA field (loras / lora_list / lora_url+lora_weight), x-api-key auth, declared fields sent', async () => {
    const bodies: Record<string, any> = {};
    await withFixture(muFixture((url, body) => { bodies[url.split('/').pop()!] = body; return json({ request_id: 'm-' + url.split('/').pop() }); }), async (baseUrl, calls) => {
      const lora = [{ path: 'https://hf.co/a.safetensors', strength: 0.8 }];
      const a = await submit(baseUrl, 'muapi', { model: 'krea-v2-turbo-lora', prompt: 'x', seed: 42, steps: 6, cfg: 3.5, loras: lora });
      expect(a.actualRequest.parameters).toMatchObject({ seed: 42, loras: [{ path: lora[0].path, scale: 0.8 }] });
      expect(sentFalse(a.actualRequest, 'steps')).toBeTruthy();
      expect(sentFalse(a.actualRequest, 'cfg')).toBeTruthy();
      const b = await submit(baseUrl, 'muapi', { model: 'flux-2-klein-4b-text-to-image-lora', prompt: 'x', seed: 42, width: 1024, height: 768, loras: lora });
      expect(b.actualRequest.parameters).toMatchObject({ seed: 42, width: 1024, height: 768, lora_list: [{ path: lora[0].path, scale: 0.8 }] });
      expect(b.actualRequest.parameters).not.toHaveProperty('loras');
      const c = await submit(baseUrl, 'muapi', { model: 'flux_dev_lora_image', prompt: 'x', seed: 42, steps: 6, cfg: 3.5, width: 1024, height: 768, loras: lora });
      expect(c.actualRequest.parameters).toMatchObject({ seed: 42, num_inference_steps: 6, guidance_scale: 3.5, width: 1024, height: 768, lora_url: lora[0].path, lora_weight: 0.8 });
      expectNoOmitBadge('muapi', Object.keys(muDoc.paths['/api/v1/flux_dev_lora_image'].post.requestBody.content['application/json'].schema.properties), ['seed', 'steps', 'cfg', 'width', 'height']);
      expect(bodies['krea-v2-turbo-lora']).toEqual(a.actualRequest.parameters);
      expect(bodies['flux_dev_lora_image']).toEqual(c.actualRequest.parameters);
      const two = await submit(baseUrl, 'muapi', { model: 'flux_dev_lora_image', prompt: 'x', loras: [...lora, { path: 'https://hf.co/b.safetensors', strength: 0.5 }] });
      expect(two.error).toMatch(/lora_url/);
      expect((calls.at(-1)!.init!.headers as any)['x-api-key']).toBe('k');
    }, () => 'k');
  });

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

  it('Sogni krea-2-turbo: loras + loraStrengths equal length; seed/guidance/negativePrompt sent; steps 不会发送; incompatible model refused locally', async () => {
    const declared = ['prompt', 'model', 'width', 'height', 'numberOfVariations', 'negativePrompt', 'starting_image_strength', 'sourceImageIndex', 'seed', 'guidance', 'aspectRatio', 'loras', 'loraStrengths'];
    let upstream: any;
    await withFixture(async (_url, init) => { upstream = JSON.parse(String(init?.body || '{}')); return json({ data: { workflow: { workflowId: 's1' } } }); }, async (baseUrl, calls) => {
      const b = await submit(baseUrl, 'sogni', { model: 'krea-2-turbo', prompt: 'x', ...CANVAS, loras: [{ path: 'krea2-detail-enhancer', strength: 3 }, { path: 'krea2-amateur', strength: -2 }] });
      const args = b.actualRequest.parameters.input.steps[0].arguments;
      expect(args).toMatchObject({ model: 'krea-2-turbo', seed: 42, guidance: 3.5, width: 1024, height: 768, negativePrompt: 'blurry', loras: ['krea2-detail-enhancer', 'krea2-amateur'], loraStrengths: [3, -2] });
      expect(args.loras.length).toBe(args.loraStrengths.length);
      expect(upstream).toEqual(b.actualRequest.parameters);
      expect(sentFalse(b.actualRequest, 'steps')).toBeTruthy();
      expect(isSchemaOmitCandidate('sogni', 'steps', hintCustom(declared))).toBe(true);
      expectNoOmitBadge('sogni', declared, ['seed', 'cfg', 'width', 'height', 'negative_prompt']);
      const n = calls.length;
      const bad = await submit(baseUrl, 'sogni', { model: 'z-turbo', prompt: 'x', loras: [{ path: 'krea2-amateur', strength: 1 }] });
      expect(bad.error).toMatch(/不接受 LoRA/);
      const noStrength = await submit(baseUrl, 'sogni', { model: 'krea-2-turbo', prompt: 'x', loras: [{ path: 'krea2-amateur' }] });
      expect(noStrength.error).toMatch(/显式强度/);
      expect(calls.length).toBe(n);
    }, () => 'k');
  });

  it('Sogni billing: waiting_for_user + insufficient_credit passed through verbatim (not completed)', async () => {
    const task = { data: { workflow: { workflowId: 's2', status: 'waiting_for_user', waitingReason: 'insufficient_credit', steps: [] } } };
    await withFixture(async (url) => url.includes('/workflows/s2') ? json(task) : json({ data: { workflow: { workflowId: 's2' } } }), async (baseUrl) => {
      const s = await submit(baseUrl, 'sogni', { model: 'krea-2-turbo', prompt: 'x' });
      const poll = await (await fetch(`${baseUrl}${s.pollUrl}`)).json() as any;
      expect(poll.status).toBe('waiting_for_user');
      expect(poll.waitingReason).toBe('insufficient_credit');
      expect(poll.rawResponse).toEqual(task);
    }, () => 'k');
  });
});

describe('provider contract (16): builder / route-handler providers', () => {
  it('Replicate flux-dev-lora: steps→num_inference_steps, cfg→guidance, seed, LoRA→lora_weights+extra_lora; width/height not sent; 3rd LoRA refused', async () => {
    const d = draft('replicate');
    expect(d.lora.maxLoras).toBe(2);
    const two = [{ path: 'owner/a', strength: 0.8 }, { path: 'owner/b', strength: 0.4 }];
    const body = { model: 'black-forest-labs/flux-dev-lora', prompt: 'x', seed: 42, steps: 6, cfg: 3.5, width: 1024, height: 768, aspect_ratio: '4:3', loras: two };
    const built = buildReplicatePredictionRequest(body);
    expect(built.payload.input).toMatchObject({ seed: 42, num_inference_steps: 6, guidance: 3.5, aspect_ratio: '4:3', lora_weights: 'owner/a', lora_scale: 0.8, extra_lora: 'owner/b', extra_lora_scale: 0.4 });
    expect(built.payload.input).not.toHaveProperty('width');
    expect(built.omitted!.map((o) => o.from)).toEqual(['width', 'height']);
    for (const f of ['seed', 'steps', 'cfg', 'loras']) expect(unsupportedLabel('replicate', 'black-forest-labs/flux-dev-lora', f), f).toBe(false);
    for (const f of ['width', 'height']) expect(unsupportedLabel('replicate', 'black-forest-labs/flux-dev-lora', f)).toBe(true);
    expect(() => buildReplicatePredictionRequest({ ...body, loras: [...two, { path: 'owner/c', strength: 0.2 }] })).toThrow(/最多 2 个 LoRA/);
    // real route handler with fixture upstream: upstream body === actualRequest, failure body verbatim
    const sent: any[] = [];
    const raw = '{"detail":"You have insufficient credit to run this model."}';
    const res: any = { statusCode: 200, body: undefined, status(c: number) { this.statusCode = c; return this; }, json(p: any) { this.body = p; return this; } };
    await handleReplicateGenerate({
      resolveProviderAuth: () => ({ apiKey: 'k', baseUrl: 'https://api.replicate.com/v1' }),
      upstreamFetch: async (_m: any, url: string, init: any) => { sent.push({ url, init }); return new Response(raw, { status: 402 }); },
      keyPoolManager: { recordResult: () => {} }, respondWithGeneratedImages: async () => { throw new Error('must not succeed'); },
    } as any)({ body, path: '/api/replicate/generate', headers: {} } as any, res);
    expect(JSON.parse(sent[0].init.body)).toEqual(res.body.actualRequest);
    expect(res.statusCode).toBe(402);
    expect(res.body.rawResponse).toBe(raw);
    expect(res.body.parameterOmissions.map((o: any) => o.from)).toEqual(['width', 'height']);
  });

  it('fal flux-lora: steps/cfg/seed sent; krea-2 turbo lora: steps/cfg NOT sent + labeled, 4th LoRA refused; Authorization: Key', () => {
    const flux = falImageFieldGate('fal-ai/flux-lora', { steps: 6, cfg: 3.5, seed: 42 }, [{ path: 'a', scale: 1 }]);
    expect(flux.send).toEqual({ num_inference_steps: 6, guidance_scale: 3.5, seed: 42 });
    expect(flux.omitted).toEqual([]);
    const krea = falImageFieldGate('fal-ai/krea-2/turbo/lora', { steps: 6, cfg: 3.5, seed: 42 }, [1, 2, 3].map((i) => ({ path: 'p' + i, scale: 1 })));
    expect(krea.send).toEqual({ seed: 42 });
    expect(krea.omitted.map((o) => o.from)).toEqual(['steps', 'cfg']);
    for (const f of ['steps', 'cfg']) expect(unsupportedLabel('fal', 'fal-ai/krea-2/turbo/lora', f)).toBe(true);
    expect(unsupportedLabel('fal', 'fal-ai/krea-2/turbo/lora', 'seed')).toBe(false);
    expect(() => falImageFieldGate('fal-ai/krea-2/turbo/lora', {}, [1, 2, 3, 4].map((i) => ({ path: 'p' + i, scale: 1 })))).toThrow(/最多 3 个/);
    expect(() => falImageFieldGate('fal-ai/flux/schnell', {}, [{ path: 'a', scale: 1 }])).toThrow(/没有 loras/);
    // route wiring: gate is used, auth header is Key, upstream errors pass text verbatim
    expect(serverSrc).toContain('falGate = falImageFieldGate(endpoint,');
    expect(serverSrc.match(/'Authorization': `Key \$\{falKey\}`/g)?.length).toBeGreaterThanOrEqual(2);
    expect(serverSrc).not.toMatch(/Authorization['"]?: `Bearer \$\{falKey\}`/);
    expect(serverSrc).toContain('`Fal.ai 接口执行失败 [${response.status}]: ${errorText}`');
  });

  it('ModelScope: steps/guidance(cfg)/seed/size WxH sent; LoRA map 0.6/0.4 ok, 0.6/0.6 rejected (no normalize); video rejected locally', async () => {
    const bodies: any[] = [];
    const orig = globalThis.fetch;
    globalThis.fetch = (async (_u: any, init: any) => { bodies.push(JSON.parse(init.body)); return json({ imageUrl: 'https://fixture.invalid/m.png' }); }) as any;
    try {
      await new ModelScopeDriver().generate({ prompt: 'x', model: 'Qwen/Qwen-Image', seed: 42, steps: 6, cfg: 3.5, width: 1024, height: 768, loras: [{ name: 'a', path: 'o/a', strength: 0.6 }, { name: 'b', path: 'o/b', strength: 0.4 }] } as any, { modelscopeToken: 'k' });
    } finally { globalThis.fetch = orig; }
    expect(bodies[0]).toMatchObject({ seed: 42, steps: 6, guidance: 3.5, width: 1024, height: 768 });
    expect(serverSrc).toContain('buildModelScopeImagePayload(');
    expect(buildModelScopeImagePayload(bodies[0]).payload).toMatchObject({ size: '1024x768', guidance: 3.5, steps: 6, seed: 42 });
    expect(buildModelScopeLoras(bodies[0].loras)).toEqual({ 'o/a': 0.6, 'o/b': 0.4 });
    expect(() => buildModelScopeLoras([{ path: 'o/a', strength: 0.6 }, { path: 'o/b', strength: 0.6 }])).toThrow(/恰好为 1.0/);
    expect(serverSrc).toContain('ModelScope API-Inference 当前没有已接入的视频生成接口');
  });

  it('HuggingFace standard: seed/steps/cfg/size declared; LoRA refused unless explicit fal-ai route', () => {
    for (const f of ['seed', 'steps', 'cfg', 'width', 'height']) expect(unsupportedLabel('huggingface', 'black-forest-labs/FLUX.1-dev', f), f).toBe(false);
    expect(serverSrc).toContain("if (hfProvider !== 'fal-ai' && rejectUnsupported(res, 'HF Inference / Z-Image Space', req.body, ['loras'])) return;");
  });

  it('Civitai: flux1 → loras map; flux2Dev → [{air,strength}]; krea v2 LoRA/size refused', async () => {
    const get = async () => new Response('{}', { status: 404 });
    const f1 = await buildCivitaiImageRequest({ model: 'urn:air:flux1:checkpoint:civitai:1@2', prompt: 'x', seed: 42, steps: 20, cfg: 3.5, width: 1024, height: 1024, loras: [{ civitaiId: 'urn:air:flux1:lora:civitai:5@6', strength: 0.7 }] }, get);
    expect(f1.payload).toMatchObject({ ecosystem: 'flux1', seed: 42, steps: 20, cfgScale: 3.5, width: 1024, height: 1024, loras: { 'urn:air:flux1:lora:civitai:5@6': 0.7 } });
    const f2 = await buildCivitaiImageRequest({ model: 'urn:air:flux2:checkpoint:civitai:1@2', engine: 'flux2', ecosystem: 'dev', prompt: 'x', seed: 42, loras: [{ civitaiId: 'urn:air:flux2:lora:civitai:5@6', strength: 0.7 }] }, get);
    expect(f2.payload.loras).toEqual([{ air: 'urn:air:flux2:lora:civitai:5@6', strength: 0.7 }]);
    await expect(buildCivitaiImageRequest({ model: 'turbo', comfyModel: 'turbo', ecosystem: 'krea2', engine: 'comfy', prompt: 'x', loras: [{ civitaiId: 'urn:air:krea2:lora:civitai:1@2', strength: 1 }] }, get)).rejects.toThrow(/不接受 LoRA/);
    await expect(buildCivitaiImageRequest({ model: 'turbo', comfyModel: 'turbo', ecosystem: 'krea2', engine: 'comfy', prompt: 'x', width: 1024, height: 1024 }, get)).rejects.toThrow(/宽高/);
    for (const f of ['loras', 'width', 'height', 'negative_prompt']) expect(unsupportedLabel('civitai', 'comfy:krea2', f)).toBe(true);
  });

  it('TAMS: seed→inputInitialize.seed, steps/cfg/size→diffusion.*, LoRA→diffusion.lora.items[{loraModel,weight}]; non-64 rejected; video rejected locally', () => {
    const job = buildTensorModelJob({ model: '600000000000000001', prompt: 'x', seed: 42, steps: 20, cfg: 7, width: 1024, height: 768, negative_prompt: 'blurry', loras: [{ tensorartId: '700000000000000001', strength: 0.8 }] }, 'r1');
    expect(job.stages[0].inputInitialize).toEqual({ seed: '42' });
    expect(job.stages[1].diffusion).toMatchObject({ steps: 20, cfgScale: 7, width: 1024, height: 768, negativePrompts: [{ text: 'blurry' }], lora: { items: [{ loraModel: '700000000000000001', weight: 0.8 }] } });
    expect(JSON.stringify(job)).not.toContain('strength');
    expect(() => buildTensorModelJob({ model: '600000000000000001', prompt: 'x', width: 1000, height: 768 }, 'r2')).toThrow(/64/);
    expect(tamsVideoUnsupported('600000000000000001')).toMatch(/没有通用视频生成接口/);
    expect(tamsVideoUnsupported('text2video_tool')).toBeUndefined();
    expect(serverSrc).toContain('if (tamsVideoRefusal) return res.status(400)');
  });

  it('NanoGPT: LoRA refused without supported_parameters.loras; declared seed sent; billing text verbatim', () => {
    const ep = { supported_parameters: { seed: { min: 0 }, resolutions: ['1024x768'] } };
    const { payload } = buildNanoImagePayload({ model: 'm', prompt: 'x', seed: 42, width: 1024, height: 768 }, ep);
    expect(payload).toMatchObject({ seed: 42, resolution: '1024x768' });
    expect(() => buildNanoImagePayload({ model: 'm', prompt: 'x', loras: [{ path: 'https://a', strength: 1 }] }, ep)).toThrow(/未声明 loras/);
    expect(serverSrc).toContain('error: `NanoGPT 生图失败 [${response.status}]: ${errorText}`');
  });

  it('OpenWorks (generic Schema): live catalog → image/video models; Schema from upstream inputs; positional POST /task; probe-gated seed/steps/cfg/LoRA blocked locally', () => {
    const live = JSON.parse(readFileSync(path.resolve(__dirname, '../../docs/evidence/openworks-tool-list-2026-10-15.json'), 'utf8'));
    const entries = parseOpenWorksCatalog(200, JSON.stringify(live));
    const items = openWorksCatalogItems(entries, 'src');
    expect(items).toHaveLength(23);
    expect(items.filter((m: any) => m.mediaKind === 'video').map((m: any) => m.id).sort()).toEqual(['image2video_ltx23', 'image2video_wan22', 'image2video_wan25', 'image2video_wan27', 'live_wallpaper', 'text2video_ltx23', 'text2video_wan22', 'text2video_wan27']);
    expect(JSON.stringify(items)).not.toMatch(/工具|[Tt]ool/);
    expect(openWorksCatalogItems([{ name: 'a', inputs: [], outputs: [{ type: 'FILE', format: 'audio' }] }], 's')).toEqual([]);
    // catalog 500 verbatim
    const raw500 = '{"code":"13","message":"mapping.json timeout"}';
    expect(() => parseOpenWorksCatalog(500, raw500)).toThrow(raw500);

    const photo = entries.find((e: any) => e.name === 'photoreal_studio_z_image');
    const schema = openWorksInputSchema(photo);
    expect(Object.keys(schema.properties)).toEqual(['prompt', 'image width', 'image height', 'result image count']);
    const ok = buildOpenWorksRequest('photoreal_studio_z_image', schema, { prompt: 'cat', width: 1024, custom_parameters: { 'image width': 768, 'image height': 1024, 'result image count': 1, _canvas: { schemaFieldsOnly: true } } });
    expect(ok.ok && ok.parameters).toEqual({ toolName: 'photoreal_studio_z_image', inputs: [{ type: 'STRING', value: 'cat' }, { type: 'INTEGER', value: 768 }, { type: 'INTEGER', value: 1024 }, { type: 'INTEGER', value: 1 }] });
    expect(ok.mapping.find((m) => m.from === 'width')).toMatchObject({ to: null, sent: false });
    // badges: same Schema → width/seed/steps/cfg 不会发送, prompt 会发送
    const props = Object.keys(schema.properties);
    expect(schemaSendStatus('openworks', 'seed', 42, undefined, props)).toBe('not_sent');
    expect(schemaSendStatus('openworks', 'steps', 6, undefined, props)).toBe('not_sent');
    expect(schemaSendStatus('openworks', 'cfg', 3.5, undefined, props)).toBe('not_sent');
    expect(schemaSendStatus('openworks', 'width', 1024, undefined, props)).toBe('not_sent');
    expect(schemaSendStatus('openworks', 'prompt', 'cat', undefined, props)).toBe('will_send');
    // live probe (canvas-e2e-tensorart-probe): upstream 200 but ignored → blocked locally, upstream text quoted; unprobed models blocked as unproven
    expect(Object.values(OPENWORKS_PROBE_RESULTS.photoreal_studio_z_image).every((p: any) => p.verdict === 'ignored')).toBe(true);
    expect((buildOpenWorksRequest('photoreal_studio_z_image', schema, { prompt: 'x', seed: 42 }) as any).error).toMatch(/不生效[\s\S]*上游原文「\{"code":"0"/);
    expect((buildOpenWorksRequest('text2video_wan22', openWorksInputSchema(entries.find((e: any) => e.name === 'text2video_wan22')), { prompt: 'x', seed: 1 }) as any).error).toMatch(/没有「上游接受且出图变化」的实测结果/);
    const gated = buildOpenWorksRequest('photoreal_studio_z_image', schema, { prompt: 'x', seed: 42, steps: 6, cfg: 3.5, loras: [{ name: 'l', strength: 1 }] });
    expect(gated.ok).toBe(false);
    expect((gated as any).error).toMatch(/loras[\s\S]*seed[\s\S]*steps[\s\S]*cfg[\s\S]*未出站，本地拦截/);
    // missing required → local block, no placeholders
    expect((buildOpenWorksRequest('photoreal_studio_z_image', schema, { prompt: 'x' }) as any).error).toMatch(/image width[\s\S]*不会用空串\/null 占位[\s\S]*未出站，本地拦截/);
    // unknown JSON key / wrong type → local block
    expect((buildOpenWorksRequest('photoreal_studio_z_image', schema, { custom_parameters: { prompt: 'x', 'image width': 1, 'image height': 1, 'result image count': 1, seedish: 1 } }) as any).error).toMatch(/seedish/);
    expect((buildOpenWorksRequest('photoreal_studio_z_image', schema, { custom_parameters: { prompt: 'x', 'image width': '768', 'image height': 1, 'result image count': 1 } }) as any).error).toMatch(/须为整数/);
    // video: ARRAY item schema required props validated generically, URL passed as given
    const wan = openWorksInputSchema(entries.find((e: any) => e.name === 'image2video_wan27'));
    const keys = Object.keys(wan.properties);
    const img = { url: 'https://cdn.example.com/u/a.png', mimeType: 'image/png' };
    const v = buildOpenWorksRequest('image2video_wan27', wan, { prompt: 'x', custom_parameters: { [keys[1]]: '720P', [keys[2]]: '5', [keys[3]]: [img] } });
    expect(v.ok && v.parameters.inputs).toEqual([{ type: 'STRING', value: 'x' }, { type: 'STRING', value: '720P' }, { type: 'STRING', value: '5' }, { type: 'ARRAY', value: [img] }]);
    expect((buildOpenWorksRequest('image2video_wan27', wan, { prompt: 'x', custom_parameters: { [keys[1]]: '720P', [keys[2]]: '5', [keys[3]]: [{ url: img.url }] } }) as any).error).toMatch(/mimeType/);
  });

  it('OpenWorks de-tool: no tool layer left in server / canvas UI; TAMS routes keep local refusals', () => {
    expect(serverSrc).not.toMatch(/planOpenWorksVideoTask|buildTensorArtInputs|parseOpenWorksToolList|fetchTensorArtToolsList|\/api\/tensorart\/tools|\/api\/tensorart\/upload|tensorOpenWorksInputs/);
    expect(serverSrc).not.toMatch(/OpenWorks 工具|OpenWorks Tool|工具 Key|工具 key/);
    expect(serverSrc).toContain('if (tamsVideoRefusal) return res.status(400)');
    expect(serverSrc).toContain("registerOpenWorksRoutes(app as any");
    for (const f of ['../components/BackendSettingsModal.tsx', '../components/ParameterInspector.tsx', '../components/ProviderMatrixModal.tsx', '../engines/drivers/TensorArtDriver.ts', '../utils/videoProvider.ts', '../App.tsx']) {
      expect(readFileSync(path.resolve(__dirname, f), 'utf8')).not.toMatch(/OpenWorks[^'`\n]{0,12}工具|仅用于工具|工具接口|旧工具/);
    }
    const ow = readFileSync(path.resolve(__dirname, './openWorksProvider.ts'), 'utf8');
    expect(ow).not.toMatch(/description\.includes|toLowerCase\(\)\.includes\('(prompt|width|seed)/);
  });

});
