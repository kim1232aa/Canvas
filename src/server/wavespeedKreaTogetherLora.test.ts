// WaveSpeed per-model sizing (Krea resolution+aspect_ratio vs size "W*H") + Together serverless LoRA local block.
// Fixture = live GET https://api.wavespeed.ai/api/v3/models model_run request_schema, captured 2026-10-15 JST (trimmed to 3 rows).
import express from 'express';
import { describe, expect, it } from 'vitest';
import catalog from './__fixtures__wavespeed-live-2026-10-15.json';
import { registerSchemaProviderRoutes, schemaProviders, sizeStringSeparator, schemaConstraintViolation, officialOpenApiSources, loraLocalBlockMessage, officialUnavailableMessage, matchOfficialUnavailable } from './schemaProviders';
import { userFacingApiFailure, describeApiFailure } from '../utils/apiFailure';
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
  it('canvas-level aspect_ratio/resolution (not custom JSON) also reach the request', async () => {
    const r = await submit('wavespeed', { model: 'wavespeed-ai/krea-v2/turbo-lora', prompt: 'p', aspect_ratio: '3:2', resolution: '2k' });
    expect(r.sent).toMatchObject({ aspect_ratio: '3:2', resolution: '2k' });
  });
  it('panel exposes aspect_ratio + resolution enum controls from the Schema', () => {
    const f = schemaChoiceFields(schemaOf('wavespeed-ai/krea-v2/turbo-lora'));
    expect(f.find((x) => x.key === 'resolution')?.enumValues).toEqual(['1k', '2k']);
    expect(f.find((x) => x.key === 'aspect_ratio')?.enumValues).toContain('16:9');
  });
  // 官方证据: https://wavespeed.ai/models/wavespeed-ai/krea-v2/turbo-lora (Key inputs: prompt, image, aspect_ratio, resolution, seed, loras; request_schema.additionalProperties === false)
  it('badges: width/height/output_format 该端点不支持 on Krea; aspect_ratio/resolution not', () => {
    const reqSchema = schemaOf('wavespeed-ai/krea-v2/turbo-lora');
    const props = Object.keys(reqSchema.properties);
    const custom = JSON.stringify({ _canvas: { schemaProperties: props, schemaClosed: reqSchema.additionalProperties === false } });
    for (const f of ['width', 'height', 'output_format', 'steps', 'cfg']) expect(isSchemaOmitCandidate('wavespeed', f, custom, reqSchema)).toBe(true);
    for (const f of ['aspect_ratio', 'resolution', 'seed']) expect(isSchemaOmitCandidate('wavespeed', f, custom, reqSchema)).toBe(false);
  });
});

describe('WaveSpeed size family: size "W*H" + output_format, no aspect_ratio/resolution', () => {
  for (const id of ['wavespeed-ai/z-image/turbo-lora', 'wavespeed-ai/flux-dev-lora']) {
  }
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
  it('matchOfficialUnavailable hits even when Schema properties exist (not rule D)', () => {
    const props = { prompt: { type: 'string' }, image_loras: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, scale: { type: 'number' } } } } };
    const hit = matchOfficialUnavailable(schemaProviders.together, props, true);
    expect(hit?.blockText).toBe('官方参数指南：image_loras no longer available');
    expect(officialUnavailableMessage(hit!).split('\n')[1]).toBe('官方参数指南：image_loras no longer available');
    expect(matchOfficialUnavailable(schemaProviders.together, props, false)).toBeUndefined();
  });
  it('Venice local LoRA block is table data with its upstream evidence', () => {
    const withBlock = Object.entries(schemaProviders).filter(([, v]) => (v as any).loraLocalBlock).map(([k]) => k);
    expect(withBlock).toContain('venice');
    expect((schemaProviders.venice as any).loraLocalBlock.docQuote).toContain("Unrecognized key(s) in object: 'loras'");
  });
});
