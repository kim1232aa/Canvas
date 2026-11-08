import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { handleReplicateGenerate } from './routes/replicateRoutes';
import { buildReplicatePredictionRequest, extractReplicateInputProperties } from './replicateImageContract';
import { resolveHistoryParameters, historyParameterSourceLabel, notSentLoraLabel, requestedNotSentLoras } from '../utils/historyParameters';

const liveRaw = readFileSync('docs/evidence/replicate-flux-dev-lora-openapi-2026-10-16.json', 'utf8');
const liveProps = extractReplicateInputProperties(JSON.parse(liveRaw))!;
const declared = Object.keys(liveProps);
const MODEL = 'black-forest-labs/flux-dev-lora';
const canvasBody = (custom: Record<string, unknown>) => ({
  model: MODEL, prompt: 'a red apple', negative_prompt: 'blurry, low quality', width: 512, height: 512, denoise: 1,
  sampler_name: 'euler_ancestral', steps: 28, cfg: 3, seed: 7, loras: [{ name: 'fofr/flux-pixar-cars', path: 'fofr/flux-pixar-cars', strength: 0.85 }],
  custom_parameters: custom,
});
const meta = { scope: { provider: 'replicate', model: MODEL }, schemaProperties: declared };
function mockRes() { const r: any = {}; r.status = (c: number) => { r.statusCode = c; return r; }; r.json = (b: any) => { r.body = b; return r; }; return r; }
const resp = (status: number, body: string) => ({ ok: status < 400, status, text: async () => body, json: async () => JSON.parse(body) });
const deps = () => ({ resolveProviderAuth: () => ({ apiKey: 'k', baseUrl: 'https://api.replicate.com/v1' }), upstreamFetch: vi.fn(async (_c: any, url: string) => String(url).endsWith('/predictions') ? resp(402, '{"detail":"Insufficient credit"}') : resp(200, liveRaw)), keyPoolManager: { recordResult: vi.fn() }, respondWithGeneratedImages: vi.fn() }) as any;

describe('#3 root _canvas metadata never becomes input._canvas', () => {
  it('builder: _canvas.scope.provider passes guard and is not sent', () => {
    const r = buildReplicatePredictionRequest(canvasBody({ lora_scale: 0.85, _canvas: meta }), 'https://api.replicate.com/v1', liveProps);
    expect((r.payload.input as any)._canvas).toBeUndefined();
    expect(JSON.stringify(r.payload)).not.toContain('_canvas');
    expect((r.payload.input as any).lora_weights).toBe('fofr/flux-pixar-cars');
  });
  // Replicate wraps top-level custom JSON into `input` (replicateImageContract), so `{provider:'x'}` is the model's own
  // input parameter, not a route. Only a top-level key of the final payload (reachable via `version`/`input` in custom) can
  // redirect or re-credential the request; prototype keys are refused at any depth.
  it('custom {provider} is a nested model input: kept verbatim, endpoint/headers/credentials unchanged', () => {
    const control = buildReplicatePredictionRequest(canvasBody({ lora_scale: 0.85 }), 'https://api.replicate.com/v1', liveProps);
    for (const custom of [{ provider: 'x' }, { input: { provider: 'x' } }]) {
      const r = buildReplicatePredictionRequest(canvasBody(custom), 'https://api.replicate.com/v1', liveProps);
      expect((r.payload.input as any).provider).toBe('x');
      expect(Object.keys(r.payload).sort()).toEqual(Object.keys(control.payload).sort());
      expect((r.payload as any).provider).toBeUndefined();
      expect(r.endpoint).toBe(control.endpoint);
      expect(r.endpoint.startsWith('https://api.replicate.com/v1/')).toBe(true);
      expect(r.headers).toEqual(control.headers);
    }
  });
  it('a real top-level routing/credential key in custom JSON is still refused', () => {
    // `version` / `input` in custom keep it unwrapped, so its remaining keys are payload-root keys.
    for (const [custom, field] of [
      [{ version: 'a'.repeat(64), endpoint: 'https://evil.test/predictions' }, 'endpoint'],
      [{ input: { prompt: 'p' }, base_url: 'https://evil.test' }, 'base_url'],
      [{ input: { prompt: 'p' }, headers: { Authorization: 'Bearer stolen' } }, 'headers'],
      [{ input: { prompt: 'p' }, api_key: 'stolen' }, 'api_key'],
    ] as const) {
      expect(() => buildReplicatePredictionRequest(canvasBody({ ...custom }), 'https://api.replicate.com/v1', liveProps)).toThrow(new RegExp(`路由/凭据字段：${field}`));
    }
  });
  it('prototype keys inside custom JSON are refused at any depth, input or nested', () => {
    for (const raw of ['{"__proto__":{"polluted":true}}', '{"input":{"constructor":{"polluted":true}}}', '{"nested":{"prototype":{"polluted":true}}}']) {
      expect(() => buildReplicatePredictionRequest(canvasBody(JSON.parse(raw)), 'https://api.replicate.com/v1', liveProps)).toThrow(/路由\/凭据字段：.*(__proto__|constructor|prototype)/);
    }
    expect(({} as any).polluted).toBeUndefined();
  });
  it('route: nested custom {provider} reaches input of the real POST; endpoint, Authorization and body root are not redirected', async () => {
    const d = deps(); const res = mockRes();
    await handleReplicateGenerate(d)({ path: '/api/engine/replicate/generate', body: canvasBody({ provider: 'x' }) } as any, res);
    const post = d.upstreamFetch.mock.calls.find((c: any[]) => c[2]?.method === 'POST');
    expect(post).toBeDefined();
    expect(post[1]).toBe(`https://api.replicate.com/v1/models/${MODEL}/predictions`);
    expect(post[2].headers.Authorization).toBe('Bearer k');
    const sent = JSON.parse(post[2].body);
    expect(sent.input.provider).toBe('x');
    expect(sent.provider).toBeUndefined();
    expect(res.statusCode).toBe(402);
    expect(res.body.endpoint).toBe(post[1]);
    expect(res.body.actualRequest.input.provider).toBe('x');
  });
  it('route: a top-level credential key is refused locally, nothing is POSTed, the reason names the field', async () => {
    const d = deps(); const res = mockRes();
    await handleReplicateGenerate(d)({ path: '/api/engine/replicate/generate', body: canvasBody({ input: { prompt: 'p' }, api_key: 'stolen' }) } as any, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.errorSource).toBe('local');
    expect(res.body.error).toContain('路由/凭据字段：api_key');
    expect(d.upstreamFetch.mock.calls.some((c: any[]) => c[2]?.method === 'POST')).toBe(false);
  });
  it('route: with _canvas the POST goes out (402 verbatim), not a local block', async () => {
    const d = deps(); const res = mockRes();
    await handleReplicateGenerate(d)({ path: '/api/engine/replicate/generate', body: canvasBody({ lora_scale: 0.85, _canvas: meta }) } as any, res);
    expect(res.statusCode).toBe(402);
    expect(res.body.actualRequest.input._canvas).toBeUndefined();
  });
});

describe('#4 outbound and local cards share one verdict', () => {
  it('old record without Schema → 未发送（Schema 未记录）, no guess', () => {
    const r = resolveHistoryParameters({ status: 'failed', requestMetadata: { actualRequest: { input: { prompt: 'p', seed: 7 } } } } as any);
    expect(historyParameterSourceLabel(r.sampler.source)).toBe('未发送（Schema 未记录）');
  });
});
