// Iron rule 3: Together/Novita/Venice no built-in Schema fallback; WaveSpeed no guessed /api/v3/<model> endpoint.
import express from 'express';
import { describe, expect, it } from 'vitest';
import { registerSchemaProviderRoutes, schemaUnavailableBlock, officialOpenApiSources, openApiPathRequestSchema, applyModelSpecConstraints } from './schemaProviders';
import { buildLocalRejectionHistoryItem, isGenerationRoute } from './failedAttemptHistory';

async function submit(provider: string, catalog: any, model: string, bodyExtra: Record<string, unknown> = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = []; const records: any[] = [];
  const app = express();
  registerSchemaProviderRoutes(app as any, {
    fetch: async (_m: any, url: string, init?: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify(catalog), { status: 200 }); },
    key: () => 'k', record: (i: any) => { records.push(i); return i; }, durable: async (u: string) => ({ ok: true, dataUrl: u }),
  } as any);
  const layer = (app as any)._router.stack.find((l: any) => l.route?.path === '/api/schema-provider/:provider/submit');
  let status = 200; let payload: any;
  const res: any = { status(c: number) { status = c; return this; }, json(p: any) { payload = p; return this; } };
  await layer.route.stack[0].handle({ method: 'POST', path: `/api/schema-provider/${provider}/submit`, params: { provider }, query: {}, headers: {}, body: { model, prompt: 'p', steps: 8, ...bodyExtra } }, res, () => {});
  return { status, payload, records, posts: calls.filter((c) => c.init?.method === 'POST') };
}

describe('no Schema/endpoint fallback (iron rule 3)', () => {
  it('helper: local 400, 未出站 prefix, source URL, no-fallback wording', () => {
    for (const p of ['Together', 'Novita', 'Venice']) {
      const e: any = schemaUnavailableBlock(p, 'm', '目录项没有 parameters', 'https://x/models');
      expect(e.status).toBe(400); expect(e.errorSource).toBe('local');
      expect(e.message).toMatch(/^未出站，本地拦截：/); expect(e.message).toContain('https://x/models');
      expect(e.message).toContain('不使用内置 Schema');
    }
  });
  it('WaveSpeed row without model_run → local 400, no POST, no guessed endpoint, local_blocked history', async () => {
    const r = await submit('wavespeed', { code: 200, data: [{ model_id: 'vendor/m', type: 'text-to-image' }] }, 'vendor/m');
    expect(r.status).toBe(400);
    expect(r.payload.errorSource).toBe('local');
    expect(r.payload.error).toContain('未出站，本地拦截');
    expect(r.payload.error).toContain('model_run');
    expect(r.payload.error).toContain('https://api.wavespeed.ai/api/v3/models');
    expect(JSON.stringify(r.payload)).not.toContain('/api/v3/vendor/m');
    expect(r.posts).toEqual([]);
    // server.ts middleware turns local 4xx on generation routes into local_blocked history
    expect(isGenerationRoute('/api/schema-provider/wavespeed/submit')).toBe(true);
    const h = buildLocalRejectionHistoryItem('/api/schema-provider/wavespeed/submit', { model: 'vendor/m', prompt: 'p' }, r.status, r.payload);
    expect(h.status).toBe('local_blocked'); expect(h.upstreamStatus ?? null).toBeNull();
    expect(JSON.stringify(h)).toContain('未出站，本地拦截');
  });
  it('WaveSpeed model_run without request_schema → local 400, no POST', async () => {
    const r = await submit('wavespeed', { code: 200, data: [{ model_id: 'vendor/m', api_schema: { api_schemas: [{ type: 'model_run', method: 'POST', server: 'https://api.wavespeed.ai', api_path: '/api/v3/vendor/m' }] } }] }, 'vendor/m');
    expect(r.status).toBe(400); expect(r.payload.error).toContain('request_schema'); expect(r.posts).toEqual([]);
  });
  it('novita: no OpenAPI but HTML declaration in config → POST /v3/async/txt2img with request{model_name,loras} (2026-10-16)', async () => {
    const r = await submit('novita', { models: [{ sd_name_in_api: 'sd_xl_base_1.0.safetensors', type: { name: 'checkpoint' } }] }, 'sd_xl_base_1.0.safetensors', {
      prompt: 'lighthouse', seed: 42, steps: 20, cfg: 7, loras: [{ path: 'more_details_59655', strength: 0.75 }],
    });
    expect(r.posts.length).toBe(1);
    expect(r.posts[0].url).toContain('/v3/async/txt2img');
    const reqBody = JSON.parse(String(r.posts[0].init?.body || '{}'));
    expect(reqBody.request).toBeTruthy();
    expect(reqBody.request.model_name).toBe('sd_xl_base_1.0.safetensors');
    expect(reqBody.request.prompt).toBe('lighthouse');
    expect(reqBody.request.loras).toEqual([{ model_name: 'more_details_59655', strength: 0.75 }]);
    expect(reqBody.request.seed).toBe(42);
    expect(reqBody.request.steps).toBe(20);
    expect(reqBody.request.guidance_scale).toBe(7);
    expect(String(r.payload?.error || '')).not.toContain('未出站，本地拦截');
  });
  for (const [p, catalog, model, specUrl] of [
    ['together', [{ id: 'black-forest-labs/FLUX.2-dev', type: 'image' }], 'black-forest-labs/FLUX.2-dev', officialOpenApiSources.together],
    ['venice', { data: [{ id: 'venice-sd35', type: 'image', model_spec: { name: 'SD35' } }] }, 'venice-sd35', officialOpenApiSources.venice],
  ] as const) {
    it(`${p}: official OpenAPI fetch fails → local 400 with URL + upstream text verbatim, no POST, no built-in`, async () => {
      const calls: string[] = []; const posts: string[] = [];
      const app = express();
      registerSchemaProviderRoutes(app as any, {
        fetch: async (_m: any, url: string, init?: RequestInit) => { calls.push(url); if (init?.method === 'POST') posts.push(url); return url === specUrl ? new Response('spec gone', { status: 503 }) : new Response(JSON.stringify(catalog), { status: 200 }); },
        key: () => 'k', record: (i: any) => i, durable: async (u: string) => ({ ok: true, dataUrl: u }),
      } as any);
      const layer = (app as any)._router.stack.find((l: any) => l.route?.path === '/api/schema-provider/:provider/submit');
      let status = 200; let payload: any;
      const res: any = { status(c: number) { status = c; return this; }, json(x: any) { payload = x; return this; } };
      await layer.route.stack[0].handle({ method: 'POST', path: `/api/schema-provider/${p}/submit`, params: { provider: p }, query: {}, headers: {}, body: { model, prompt: 'p' } }, res, () => {});
      expect(calls).toContain(specUrl);
      expect(status).toBe(400); expect(payload.errorSource).toBe('local');
      expect(payload.error).toContain('未出站，本地拦截'); expect(payload.error).toContain(specUrl);
      expect(payload.error).toContain('HTTP 503 spec gone');
      expect(JSON.stringify(payload)).not.toContain('docs-openapi'); expect(posts).toEqual([]);
    });
  }
  it('openApiPathRequestSchema resolves $ref; applyModelSpecConstraints only overlays upstream-returned keys', () => {
    const doc = { paths: { '/image/generate': { post: { requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/G' } } } } } } }, components: { schemas: { G: { type: 'object', properties: { prompt: { type: 'string' }, steps: { type: 'integer' }, aspect_ratio: { type: 'string' }, seed: { type: 'integer' } } } } } };
    const s = openApiPathRequestSchema(doc, '/image/generate');
    expect(Object.keys(s.properties)).toEqual(['prompt', 'steps', 'aspect_ratio', 'seed']);
    expect(openApiPathRequestSchema(doc, '/nope')).toBeNull();
    const o = applyModelSpecConstraints(s, { steps: { default: 25, max: 30 }, aspectRatios: ['1:1'], promptCharacterLimit: 1500 });
    expect(o.properties.steps).toMatchObject({ maximum: 30, default: 25 });
    expect(o.properties.aspect_ratio.enum).toEqual(['1:1']); expect(o.properties.prompt.maxLength).toBe(1500);
    expect(o.properties.seed).toEqual({ type: 'integer' }); expect(o.properties.resolution).toBeUndefined();
    expect(s.properties.steps.maximum).toBeUndefined();
  });
});
