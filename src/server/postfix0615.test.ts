// Fixes for /workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-postfix-0615 FAIL (generic, Schema-driven).
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import catalog from './__fixtures__wavespeed-live-2026-10-15.json';
import { registerSchemaProviderRoutes, buildTaskFailureHistoryItem } from './schemaProviders';
import { rescopeCustomParameters } from '../utils/customParameterScope';
import { sharedGetJson, clearSharedGet, beginSharedGetAction } from '../services/sharedGet';
import { otherSentParameters } from '../utils/historyParameters';
import { schemaChoiceFields } from '../components/SchemaChoiceControls';
import { FIELD_STATUS_LABEL } from '../components/FieldStatusBadge';
import { hasReferenceImageInput } from '../utils/graphEngine';

function app(fetchImpl: (url: string, init?: RequestInit) => Response, records: any[] = []) {
  const a = express();
  registerSchemaProviderRoutes(a as any, { fetch: async (_m: any, url: string, init?: RequestInit) => fetchImpl(url, init), key: () => 'k', record: (i: any) => { records.push(i); return i; }, durable: async (u: string) => ({ ok: true, dataUrl: u }) } as any);
  const route = (path: string, method: string) => (a as any)._router.stack.find((l: any) => l.route?.path === path && l.route.methods[method]).route.stack[0].handle;
  const call = async (path: string, method: string, req: any) => {
    let status = 200; let payload: any; let done!: () => void; const finished = new Promise<void>((r) => { done = r; });
    const res: any = { statusCode: 200, status(c: number) { status = c; this.statusCode = c; return this; }, json(p: any) { payload = p; done(); return this; } };
    await route(path, method)({ method: method.toUpperCase(), headers: {}, query: {}, ...req }, res, () => {});
    await finished; return { status, payload };
  };
  return call;
}
const ws = (url: string, init?: RequestInit, poll?: any) => {
  if (init?.method === 'POST') return new Response(JSON.stringify({ code: 200, data: { id: 'task-1' } }), { status: 200 });
  if (url.includes('/predictions/')) return new Response(JSON.stringify(poll), { status: 200 });
  return new Response(JSON.stringify(catalog), { status: 200 });
};
const schemaOf = (id: string) => (catalog as any).data.find((r: any) => r.model_id === id).api_schema.api_schemas[0].request_schema;

describe('1. custom_parameters scoped to the current model Schema', () => {
  it('server: leftover Krea aspect_ratio/resolution in custom JSON are not sent to z-image (size model) — 该端点不支持', async () => {
    const call = app((u, i) => ws(u, i));
    const r = await call('/api/schema-provider/:provider/submit', 'post', { params: { provider: 'wavespeed' }, body: { model: 'wavespeed-ai/z-image/turbo-lora', prompt: 'p', width: 768, height: 1344, custom_parameters: { aspect_ratio: '16:9', resolution: '2k' } } });
    expect(r.payload.actualRequest.parameters).toEqual({ prompt: 'p', size: '768*1344' });
    const m = r.payload.actualRequest.mapping.filter((x: any) => x.from.startsWith('custom_parameters.'));
    expect(m.every((x: any) => x.sent === false && /该端点不支持/.test(x.reason))).toBe(true);
  });
  it('front: switching provider/model drops the previous model\'s undeclared keys, keeps declared, records scope', () => {
    const krea = JSON.stringify({ aspect_ratio: '16:9', resolution: '2k', _canvas: { scope: { provider: 'wavespeed', model: 'wavespeed-ai/krea-v2/turbo-lora' } } });
    const out = JSON.parse(rescopeCustomParameters(krea, 'venice', 'venice-sd35', ['prompt', 'width', 'height', 'format', 'lora_strength'])!);
    expect(out).toEqual({ _canvas: { scope: { provider: 'venice', model: 'venice-sd35' }, schemaProperties: ['prompt', 'width', 'height', 'format', 'lora_strength'] } });
    const z = JSON.parse(rescopeCustomParameters(krea, 'wavespeed', 'wavespeed-ai/z-image/turbo-lora', Object.keys(schemaOf('wavespeed-ai/z-image/turbo-lora').properties))!);
    expect(z.aspect_ratio).toBeUndefined(); expect(z.resolution).toBeUndefined();
    // same model → nothing dropped; Schema matching off → nothing dropped; invalid JSON → untouched (null)
    expect(JSON.parse(rescopeCustomParameters(krea, 'wavespeed', 'wavespeed-ai/krea-v2/turbo-lora', ['aspect_ratio'])!).resolution).toBe('2k');
    expect(JSON.parse(rescopeCustomParameters(JSON.stringify({ x: 1, _canvas: { schemaFieldsOnly: false } }), 'venice', 'm', ['prompt'])!).x).toBe(1);
    expect(rescopeCustomParameters('{bad', 'venice', 'm', [])).toBeNull();
  });
});

describe('2. one GET per real change', () => {
  afterEach(() => { vi.unstubAllGlobals(); clearSharedGet(); });
  it('7 sequential consumers of the same model-schema (node+inspector remounts) → 1 network call; force → 1 more; other model → new', async () => {
    const f = vi.fn(async () => new Response('{"inputSchema":{"properties":{"prompt":{}}}}', { status: 200 }));
    vi.stubGlobal('fetch', f);
    const url = '/api/model-schema?provider=wavespeed&model=wavespeed-ai%2Fkrea-v2%2Fturbo';
    for (let i = 0; i < 7; i++) await sharedGetJson(url, { 'x-wavespeed-key': 'K' });
    expect(f).toHaveBeenCalledTimes(1);
    await sharedGetJson(url, { 'x-wavespeed-key': 'K' }, { force: true });
    expect(f).toHaveBeenCalledTimes(2);
    await sharedGetJson(url.replace('turbo', 'turbo-lora'), { 'x-wavespeed-key': 'K' });
    await sharedGetJson(url, { 'x-wavespeed-key': 'OTHER' });
    expect(f).toHaveBeenCalledTimes(4);
  });
  // clean-0903: "next call" = next user ACTION. A second caller inside the same action gets the same verbatim failure.
  it('failures are memoised for the action; the next action (beginSharedGetAction) retries', async () => {
    const f = vi.fn(async () => new Response('{"error":"boom"}', { status: 500 }));
    vi.stubGlobal('fetch', f);
    const e1 = await sharedGetJson('/api/model-schema?provider=x&model=y').catch((e) => e);
    const e2 = await sharedGetJson('/api/model-schema?provider=x&model=y').catch((e) => e);
    expect(f).toHaveBeenCalledTimes(1);
    expect(e2).toBe(e1);
    beginSharedGetAction();
    await expect(sharedGetJson('/api/model-schema?provider=x&model=y')).rejects.toBeTruthy();
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe('3. every async run writes history (upstream task failure)', () => {
  it('WaveSpeed task status=failed → ONE failed history item with verbatim upstream error + actualRequest', async () => {
    const records: any[] = [];
    const poll = { code: 200, data: { id: 'task-1', status: 'failed', error: 'Failed to load LoRA: Could not download the input from huggingface.co (HTTP 401).', outputs: [] } };
    const call = app((u, i) => ws(u, i, poll), records);
    await call('/api/schema-provider/:provider/submit', 'post', { params: { provider: 'wavespeed' }, body: { model: 'wavespeed-ai/krea-v2/turbo-lora', prompt: 'p', custom_parameters: { aspect_ratio: '16:9', resolution: '2k' }, loras: [{ path: 'https://huggingface.co/krea/krea2-realism-lora', strength: 0.8 }] } });
    const p1 = await call('/api/schema-provider/:provider/tasks/:taskId', 'get', { params: { provider: 'wavespeed', taskId: 'task-1' } });
    await call('/api/schema-provider/:provider/tasks/:taskId', 'get', { params: { provider: 'wavespeed', taskId: 'task-1' } });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ status: 'failed', provider: 'WaveSpeed', model: 'wavespeed-ai/krea-v2/turbo-lora', prompt: 'p' });
    expect(records[0].error).toContain('Failed to load LoRA'); // verbatim, no path rewrite
    expect(records[0].requestMetadata.actualRequest.parameters).toMatchObject({ aspect_ratio: '16:9', resolution: '2k', loras: [{ path: 'https://huggingface.co/krea/krea2-realism-lora', scale: 0.8 }] });
    expect(p1.payload.historyItem).toBeTruthy();
  });
  it('builder keeps upstream body verbatim', () => {
    const h = buildTaskFailureHistoryItem('X', { model: 'm', actualRequest: { endpoint: 'e', parameters: {} } }, { status: 'failed', error: 'E', rawResponse: { a: 1 } }, 200);
    expect(h.upstreamResponseBody).toBe('{"a":1}'); expect(h.status).toBe('failed');
  });
});

describe('4. strength only with an image input', () => {
  it('denoise + image_url → strength sent', async () => {
    const call = app((u, i) => ws(u, i));
    const r = await call('/api/schema-provider/:provider/submit', 'post', { params: { provider: 'wavespeed' }, body: { model: 'wavespeed-ai/krea-v2/turbo-lora', prompt: 'p', denoise: 0.6, image_url: 'https://x/y.png' } });
    expect(r.payload.actualRequest.parameters).toMatchObject({ strength: 0.6, image: 'https://x/y.png' });
  });
  it('hasReferenceImageInput follows edges only', () => {
    const nodes = [{ id: 'k', type: 'KSampler' }, { id: 'l', type: 'LoadImage', values: { image_url: 'u' } }];
    expect(hasReferenceImageInput(nodes, [], 'k')).toBe(false);
    expect(hasReferenceImageInput(nodes, [{ fromNodeId: 'l', toNodeId: 'k', toSocketId: 'image' }], 'k')).toBe(true);
  });
});

describe('5/7/10 history + badges + output_format', () => {
  it('success card lists every other sent param from actualRequest', () => {
    const item: any = { status: 'completed', url: 'u', requestMetadata: { actualRequest: { endpoint: 'e', parameters: { prompt: 'p', seed: 1, aspect_ratio: '16:9', resolution: '2k', strength: 0.6, loras: [{ path: 'a', scale: 0.8 }] } } } };
    expect(otherSentParameters(item)).toEqual([{ key: 'resolution', value: '2k' }, { key: 'strength', value: '0.6' }]); // fix5: aspect_ratio covered by size row
  });
  it('unsupported badge text is 该端点不支持', () => { expect(FIELD_STATUS_LABEL.not_sent).toBe('Schema 不支持，不发送'); /* clean-1029 #3 */ });
  it('z-image declares output_format → Schema panel offers it; Krea does not declare it', () => {
    expect(schemaChoiceFields(schemaOf('wavespeed-ai/z-image/turbo-lora')).find((f) => f.key === 'output_format')?.enumValues).toEqual(['jpeg', 'png', 'webp']);
    expect(schemaChoiceFields(schemaOf('wavespeed-ai/krea-v2/turbo-lora')).find((f) => f.key === 'output_format')).toBeUndefined();
  });
});
