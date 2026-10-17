import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { handleReplicateGenerate } from './routes/replicateRoutes';
import { buildReplicatePredictionRequest, extractReplicateInputProperties } from './replicateImageContract';
import { buildLocalRejectionHistoryItem, buildFailedAttemptHistoryItem } from './failedAttemptHistory';
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

describe('#1/#2/#6 local block: 拟发送 = same builder body, LoRA one Schema-based status', () => {
  it('route attaches Schema-mapped proposedRequest (no negative/width/sampler/_canvas), explicitly excluding rejected custom JSON', async () => {
    const d = deps(); const res = mockRes();
    const body = canvasBody({ provider: 'evil', _canvas: meta });
    await handleReplicateGenerate(d)({ path: '/api/engine/replicate/generate', body } as any, res);
    expect(res.statusCode).toBe(400);
    const p = res.body.proposedRequest;
    expect(p.customParametersExcluded).toMatch(/input\.provider/);
    const text = JSON.stringify(p.parameters);
    for (const k of ['negative_prompt', '"width"', '"height"', 'sampler_name', 'denoise', '_canvas']) expect(text).not.toContain(k);
    expect(p.parameters.input).toMatchObject({ seed: 7, num_inference_steps: 28, guidance: 3, lora_weights: 'fofr/flux-pixar-cars', lora_scale: 0.85 });
    expect(d.upstreamFetch.mock.calls.some((c: any[]) => String(c[1]).endsWith('/predictions'))).toBe(false);

    const item: any = buildLocalRejectionHistoryItem('/api/engine/replicate/generate', body, 400, res.body);
    expect(item.requestMetadata.intendedRequest.parameters).toEqual(p.parameters);
    const r = resolveHistoryParameters(item);
    expect(r.seed.source).toBe('intended'); expect(r.steps.source).toBe('intended'); expect(r.cfg.source).toBe('intended');
    for (const k of ['sampler', 'scheduler', 'negativePrompt'] as const) expect(historyParameterSourceLabel(r[k].source)).toBe('该端点不支持 · 未发送');
    expect(historyParameterSourceLabel(r.size.source)).toBe('未发送'); // aspect_ratio in Schema
    expect(historyParameterSourceLabel(r.width.source)).toBe('该端点不支持 · 未发送');
    expect(historyParameterSourceLabel(r.height.source)).toBe('该端点不支持 · 未发送');
    const loras = requestedNotSentLoras(item);
    expect(loras.map((l) => l.name)).toEqual(['fofr/flux-pixar-cars']);
    expect(notSentLoraLabel(item, 'fofr/flux-pixar-cars')).toBe('拟发送（未出站）');
  });
});

describe('#4 outbound and local cards share one verdict', () => {
  it('402 card: route top-level schemaFields recorded → sampler/size/negative 该端点不支持', () => {
    const body = canvasBody({ lora_scale: 0.85 });
    const sent = buildReplicatePredictionRequest(body, 'https://api.replicate.com/v1', liveProps);
    const item: any = buildFailedAttemptHistoryItem({ traces: [{ endpoint: sent.endpoint, method: 'POST', status: 402 }], submissions: [] } as any, body, 402,
      { error: 'x', actualRequest: sent.payload, schemaFields: sent.schemaFields });
    expect(item.requestMetadata.schemaFields).toEqual(sent.schemaFields);
    expect(item.requestMetadata.actualRequest).toEqual(sent.payload); // 1035: bare body not augmented
    const r = resolveHistoryParameters(item);
    for (const k of ['sampler', 'scheduler', 'negativePrompt'] as const) expect(historyParameterSourceLabel(r[k].source)).toBe('该端点不支持 · 未发送');
    expect(historyParameterSourceLabel(r.size.source)).toBe('未发送'); // aspect_ratio in Schema
  });
  it('old record without Schema → 未发送（Schema 未记录）, no guess', () => {
    const r = resolveHistoryParameters({ status: 'failed', requestMetadata: { actualRequest: { input: { prompt: 'p', seed: 7 } } } } as any);
    expect(historyParameterSourceLabel(r.sampler.source)).toBe('未发送（Schema 未记录）');
  });
});
