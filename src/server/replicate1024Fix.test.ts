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
  it('a real routing key inside custom JSON is still refused', () => {
    expect(() => buildReplicatePredictionRequest(canvasBody({ provider: 'x' }), 'https://api.replicate.com/v1', liveProps)).toThrow(/路由\/凭据字段：input\.provider/);
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
