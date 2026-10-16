// WaveSpeed per-model sizing (Krea resolution+aspect_ratio vs size "W*H") + Together serverless LoRA local block.
// Fixture = live GET https://api.wavespeed.ai/api/v3/models model_run request_schema, captured 2026-10-15 JST (trimmed to 3 rows).
import express from 'express';
import { describe, expect, it } from 'vitest';
import catalog from './__fixtures__wavespeed-live-2026-10-15.json';
import { registerSchemaProviderRoutes, schemaProviders, sizeStringSeparator, schemaConstraintViolation, officialOpenApiSources, loraLocalBlockMessage, officialUnavailableMessage, matchOfficialUnavailable } from './schemaProviders';
import { userFacingApiFailure, describeApiFailure } from '../utils/apiFailure';
import { buildLocalRejectionHistoryItem } from './failedAttemptHistory';
import { isSchemaOmitCandidate } from '../utils/schemaSendHint';
import { schemaChoiceFields } from '../components/SchemaChoiceControls';

async function submit(provider: string, body: any, cat: any = catalog) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const app = express();
  registerSchemaProviderRoutes(app as any, {
    fetch: async (_m: any, url: string, init?: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify(init?.method === 'POST' ? { code: 200, data: { id: 't1' } } : cat), { status: 200 }); },
    key: () => 'k', record: (i: any) => i, durable: async (u: string) => ({ ok: true, dataUrl: u }),
  } as any);
  const layer = (app as any)._router.stack.find((l: any) => l.route?.path === '/api/schema-provider/:provider/submit');
  let status = 200; let payload: any;
  const res: any = { status(c: number) { status = c; return this; }, json(p: any) { payload = p; return this; } };
  await layer.route.stack[0].handle({ method: 'POST', path: `/api/schema-provider/${provider}/submit`, params: { provider }, query: {}, headers: {}, body }, res, () => {});
  const posts = calls.filter((c) => c.init?.method === 'POST');
  return { status, payload, posts, sent: posts[0] ? JSON.parse(String(posts[0].init!.body)) : undefined, calls };
}
const lora = [{ path: 'https://example.com/a.safetensors', strength: 0.8 }];
const schemaOf = (id: string) => (catalog as any).data.find((r: any) => r.model_id === id).api_schema.api_schemas[0].request_schema;

describe('WaveSpeed Krea family: resolution + aspect_ratio, no size', () => {
  it('turbo-lora sends filled aspect_ratio + resolution 2k + loras{path,scale}; width/height/steps/cfg/output_format marked unsent', async () => {
    const r = await submit('wavespeed', { model: 'wavespeed-ai/krea-v2/turbo-lora', prompt: 'p', seed: 42, denoise: 0.7, width: 1024, height: 1024, steps: 20, cfg: 7, output_format: 'png',
      custom_parameters: { aspect_ratio: '16:9', resolution: '2k' }, loras: lora });
    expect(r.status).toBe(200);
    expect(r.sent).toEqual({ prompt: 'p', seed: 42, aspect_ratio: '16:9', resolution: '2k', loras: [{ path: 'https://example.com/a.safetensors', scale: 0.8 }] });
    expect(r.sent).not.toHaveProperty('size');
    const unsent = r.payload.actualRequest.mapping.filter((m: any) => m.sent === false).map((m: any) => m.from).sort();
    expect(unsent).toEqual(['cfg', 'denoise', 'height', 'output_format', 'steps', 'width']);
  });
  it('canvas-level aspect_ratio/resolution (not custom JSON) also reach the request', async () => {
    const r = await submit('wavespeed', { model: 'wavespeed-ai/krea-v2/turbo-lora', prompt: 'p', aspect_ratio: '3:2', resolution: '2k' });
    expect(r.sent).toMatchObject({ aspect_ratio: '3:2', resolution: '2k' });
  });
  it('resolution outside official enum → local 400, no POST, local_blocked', async () => {
    const r = await submit('wavespeed', { model: 'wavespeed-ai/krea-v2/turbo-lora', prompt: 'p', resolution: '4k' });
    expect(r.status).toBe(400); expect(r.posts).toEqual([]); expect(r.payload.error).toContain('["1k","2k"]');
    expect(buildLocalRejectionHistoryItem('/api/schema-provider/wavespeed/submit', { model: 'm' }, r.status, r.payload).status).toBe('local_blocked');
  });
  it('4 LoRAs > official maxItems 3 → local 400, no POST', async () => {
    const r = await submit('wavespeed', { model: 'wavespeed-ai/krea-v2/turbo-lora', prompt: 'p', loras: [...lora, ...lora, ...lora, ...lora] });
    expect(r.status).toBe(400); expect(r.posts).toEqual([]); expect(r.payload.error).toContain('maxItems');
  });
  it('panel exposes aspect_ratio + resolution enum controls from the Schema', () => {
    const f = schemaChoiceFields(schemaOf('wavespeed-ai/krea-v2/turbo-lora'));
    expect(f.find((x) => x.key === 'resolution')?.enumValues).toEqual(['1k', '2k']);
    expect(f.find((x) => x.key === 'aspect_ratio')?.enumValues).toContain('16:9');
  });
  it('badges: width/height/output_format 该端点不支持 on Krea; aspect_ratio/resolution not', () => {
    const props = Object.keys(schemaOf('wavespeed-ai/krea-v2/turbo-lora').properties);
    for (const f of ['width', 'height', 'output_format', 'steps', 'cfg']) expect(isSchemaOmitCandidate('wavespeed', f, '{}', props)).toBe(true);
    for (const f of ['aspect_ratio', 'resolution', 'seed']) expect(isSchemaOmitCandidate('wavespeed', f, '{}', props)).toBe(false);
  });
});

describe('WaveSpeed size family: size "W*H" + output_format, no aspect_ratio/resolution', () => {
  for (const id of ['wavespeed-ai/z-image/turbo-lora', 'wavespeed-ai/flux-dev-lora']) {
    it(`${id}: width/height pack to size "W*H"; aspect_ratio/resolution unsent`, async () => {
      const r = await submit('wavespeed', { model: id, prompt: 'p', width: 768, height: 1344, output_format: 'webp', aspect_ratio: '16:9', resolution: '2k', loras: lora });
      expect(r.status).toBe(200);
      expect(r.sent.size).toBe('768*1344'); expect(r.sent.output_format).toBe('webp');
      expect(r.sent).not.toHaveProperty('aspect_ratio'); expect(r.sent).not.toHaveProperty('resolution');
      expect(r.sent).not.toHaveProperty('width'); expect(r.sent).not.toHaveProperty('height');
      const unsent = r.payload.actualRequest.mapping.filter((m: any) => m.sent === false).map((m: any) => m.from).sort();
      expect(unsent).toEqual(['aspect_ratio', 'resolution']);
      const props = Object.keys(schemaOf(id).properties);
      expect(isSchemaOmitCandidate('wavespeed', 'width', '{}', props)).toBe(false);
      expect(isSchemaOmitCandidate('wavespeed', 'aspect_ratio', '{}', props)).toBe(true);
    });
  }
  it('size per-side range 256~1536 enforced locally (no clamp)', async () => {
    const r = await submit('wavespeed', { model: 'wavespeed-ai/z-image/turbo-lora', prompt: 'p', width: 2048, height: 1024 });
    expect(r.status).toBe(400); expect(r.posts).toEqual([]); expect(r.payload.error).toContain('2048');
  });
  it('only width filled → local 400, no auto-fill', async () => {
    const r = await submit('wavespeed', { model: 'wavespeed-ai/z-image/turbo-lora', prompt: 'p', width: 1024 });
    expect(r.status).toBe(400); expect(r.posts).toEqual([]);
  });
  it('no width/height → size not sent (upstream default applies, not ours)', async () => {
    const r = await submit('wavespeed', { model: 'wavespeed-ai/z-image/turbo-lora', prompt: 'p' });
    expect(r.sent).toEqual({ prompt: 'p' });
  });
  it('sizeStringSeparator reads separator from Schema default only', () => {
    expect(sizeStringSeparator({ type: 'string', default: '1024*1024' })).toBe('*');
    expect(sizeStringSeparator({ type: 'string', enum: ['1024x1024'], default: '1024x1024' })).toBeNull();
    expect(sizeStringSeparator({ type: 'string' })).toBeNull();
    expect(schemaConstraintViolation('size', '100*100', { type: 'string', default: '1024*1024', minimum: 256, maximum: 1536 })).toContain('100');
  });
});

async function submitTogether(body: any, catalogRows: any[]) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const spec = { paths: { '/images/generations': { post: { requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { prompt: { type: 'string' }, model: { type: 'string' }, width: { type: 'integer' }, height: { type: 'integer' }, image_loras: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, scale: { type: 'number' } }, required: ['path'] } } } } } } } } } } };
  const app = express();
  registerSchemaProviderRoutes(app as any, {
    fetch: async (_m: any, url: string, init?: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify(url === officialOpenApiSources.together ? spec : catalogRows), { status: 200 }); },
    key: () => 'k', record: (i: any) => i, durable: async (u: string) => ({ ok: true, dataUrl: u }),
  } as any);
  const layer = (app as any)._router.stack.find((l: any) => l.route?.path === '/api/schema-provider/:provider/submit');
  let status = 200; let payload: any;
  const res: any = { status(c: number) { status = c; return this; }, json(p: any) { payload = p; return this; } };
  await layer.route.stack[0].handle({ method: 'POST', path: '/api/schema-provider/together/submit', params: { provider: 'together' }, query: {}, headers: {}, body }, res, () => {});
  return { status, payload, posts: calls.filter((c) => c.init?.method === 'POST') };
}

describe('Together image_loras = officialUnavailable (not rule D); Venice loraLocalBlock is table data', () => {
  it('Together + LoRA: Schema still has image_loras path+scale but officialUnavailableParams blocks locally', async () => {
    const r = await submitTogether({ model: 'black-forest-labs/FLUX.2-dev', prompt: 'p', loras: lora }, [{ id: 'black-forest-labs/FLUX.2-dev', type: 'image' }]);
    expect((schemaProviders.together as any).loraLocalBlock).toBeUndefined();
    expect((schemaProviders.together as any).officialUnavailableParams?.[0]?.field).toBe('image_loras');
    expect(r.posts).toHaveLength(0); // no generation POST
    expect(r.status).toBe(400);
    expect(String(r.payload?.error || '')).toContain('官方参数指南：image_loras no longer available');
    expect(String(r.payload?.error || '')).toContain('No longer available');
    expect(r.payload?.errorSource).toBe('local');
    expect(r.payload?.blockedField?.field).toBe('image_loras');
  });
  it('matchOfficialUnavailable hits even when Schema properties exist (not rule D)', () => {
    const props = { prompt: { type: 'string' }, image_loras: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, scale: { type: 'number' } } } } };
    const hit = matchOfficialUnavailable(schemaProviders.together, props, true);
    expect(hit?.blockText).toBe('官方参数指南：image_loras no longer available');
    expect(officialUnavailableMessage(hit!).split('\n')[1]).toBe('官方参数指南：image_loras no longer available');
    expect(matchOfficialUnavailable(schemaProviders.together, props, false)).toBeUndefined();
  });
  it('rule is table data: only Venice (live 400 Unrecognized key loras) carries loraLocalBlock', () => {
    const withBlock = Object.entries(schemaProviders).filter(([, v]) => (v as any).loraLocalBlock).map(([k]) => k);
    expect(withBlock).toEqual(['venice']);
    expect((schemaProviders.venice as any).loraLocalBlock.docQuote).toContain("Unrecognized key(s) in object: 'loras'");
  });
  it('local block text: first line 本地拦截 · 未发请求, no HTTP 400 in UI text', () => {
    const payload = { errorSource: 'local', error: loraLocalBlockMessage('Venice', (schemaProviders.venice as any).loraLocalBlock) };
    expect(payload.error.split('\n')[0]).toBe('本地拦截 · 已读 Schema、未发生成'); // clean-1333 #3
    expect(userFacingApiFailure(400, payload, '/api/schema-provider/venice/submit')).not.toMatch(/HTTP 400/);
    expect(describeApiFailure(400, payload, '/api/schema-provider/venice/submit')).not.toMatch(/HTTP 400/);
    expect(buildLocalRejectionHistoryItem('/api/schema-provider/venice/submit', { model: 'm' }, 400, payload).status).toBe('local_blocked');
  });
});
