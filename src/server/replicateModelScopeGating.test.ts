import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildReplicatePredictionRequest } from './replicateImageContract';
import { buildModelScopeImagePayload, MODELSCOPE_IMAGE_SCHEMA_FIELDS } from './modelScopeImageContract';
import { resolveHistoryParameters, historyParameterSourceLabel } from '../utils/historyParameters';

// Live official flux-schnell Input properties (GET https://replicate.com/api/models/black-forest-labs/flux-schnell/versions, 2026-10-15).
const SCHNELL_PROPS = Object.fromEntries(['seed','prompt','go_fast','megapixels','num_outputs','aspect_ratio','output_format','output_quality','num_inference_steps','disable_safety_checker'].map((k) => [k, {}]));
const filled = { prompt: 'p', negative_prompt: 'blurry', cfg: 3.5, steps: 4, seed: 7, aspect_ratio: '16:9', width: 1024, height: 768 };

describe('Replicate declared-field gate (generic, schema-driven)', () => {
  it('live schemaProps: undeclared negative_prompt / cfg are omitted (not thrown), labelled 该端点不支持', () => {
    const r = buildReplicatePredictionRequest({ model: 'black-forest-labs/flux-schnell', ...filled }, undefined, SCHNELL_PROPS);
    const input = r.payload.input as Record<string, unknown>;
    expect(input).toEqual({ prompt: 'p', aspect_ratio: '16:9', seed: 7, num_inference_steps: 4 });
    for (const k of ['negative_prompt', 'guidance', 'guidance_scale', 'width', 'height']) expect(k in input).toBe(false);
    expect(r.omitted!.map((o) => o.from).sort()).toEqual(['cfg', 'height', 'negative_prompt', 'width']);
    expect(r.omitted!.every((o) => /^该端点不支持/.test(o.reason))).toBe(true);
    expect(r.schemaFields).toEqual(Object.keys(SCHNELL_PROPS));
  });
  it('same gate without schemaProps (PROVIDER_SCHEMA row) — previously leaked negative_prompt + guidance_scale', () => {
    const r = buildReplicatePredictionRequest({ model: 'black-forest-labs/flux-schnell', ...filled });
    const input = r.payload.input as Record<string, unknown>;
    expect('negative_prompt' in input).toBe(false);
    expect('guidance_scale' in input).toBe(false);
    expect('guidance' in input).toBe(false);
  });
  it('a schema that declares guidance gets cfg→guidance; one that declares negative_prompt keeps it (no model-name branch)', () => {
    const r = buildReplicatePredictionRequest({ model: 'someone/custom-model', ...filled }, undefined, { prompt: {}, guidance: {}, negative_prompt: {} });
    expect(r.payload.input).toEqual({ prompt: 'p', guidance: 3.5, negative_prompt: 'blurry' });
    expect(r.omitted!.map((o) => o.from).sort()).toEqual(['aspect_ratio', 'height', 'seed', 'steps', 'width']);
  });
  it('history shows 该端点不支持 for cfg / negative when schemaFields lack them', () => {
    const r = buildReplicatePredictionRequest({ model: 'black-forest-labs/flux-schnell', ...filled }, undefined, SCHNELL_PROPS);
    const h = resolveHistoryParameters({ id: 'x', status: 'success', url: '', provider: 'replicate', model: 'm', loras: [],
      requestMetadata: { requestedParameters: filled, actualParameters: r.payload, schemaFields: r.schemaFields } } as any);
    expect(historyParameterSourceLabel(h.cfg.source)).toBe('该端点不支持 · 未发送') // clean-1029 #5;
    expect(historyParameterSourceLabel(h.negativePrompt.source)).toBe('该端点不支持 · 未发送') // clean-1029 #5;
  });
  it('route forwards schemaFields into history metadata', () => {
    expect(readFileSync('src/server/routes/replicateRoutes.ts', 'utf8')).toContain('schemaFields: mapped.schemaFields');
  });
});

describe('ModelScope API-Inference gate (official param table)', () => {
  it('declared fields only; sampler/scheduler/denoise omitted 该端点不支持; cfg→guidance', () => {
    const r = buildModelScopeImagePayload({ model: 'Qwen/Qwen-Image', prompt: 'p', negative_prompt: 'n', cfg: 4, steps: 30, seed: 1, width: 1024, height: 1024, sampler_name: 'euler', scheduler: 'karras', denoise: 0.7 });
    expect(r.payload).toEqual({ model: 'Qwen/Qwen-Image', prompt: 'p', negative_prompt: 'n', guidance: 4, steps: 30, seed: 1, size: '1024x1024' });
    expect(r.omitted.map((o) => o.from)).toEqual(['sampler_name', 'scheduler', 'denoise']);
    expect(r.omitted.every((o) => o.reason.startsWith('该端点不支持'))).toBe(true);
    expect(r.parameterMappings).toContainEqual({ from: 'cfg', to: 'guidance', value: 4 });
    for (const k of Object.keys(r.payload)) expect(MODELSCOPE_IMAGE_SCHEMA_FIELDS as readonly string[]).toContain(k);
  });
  it('explicit guidance wins over cfg; no cfg key ever sent', () => {
    const r = buildModelScopeImagePayload({ model: 'm', prompt: 'p', guidance: 3.5, cfg: 7 });
    expect(r.payload.guidance).toBe(3.5);
    expect('cfg' in r.payload).toBe(false);
  });
  it('history labels sampler / scheduler 该端点不支持', () => {
    const r = buildModelScopeImagePayload({ model: 'm', prompt: 'p', sampler_name: 'euler', scheduler: 'karras' });
    const h = resolveHistoryParameters({ id: 'x', status: 'success', url: '', provider: 'modelscope', model: 'm', loras: [],
      requestMetadata: { requestedParameters: { sampler_name: 'euler', scheduler: 'karras' }, actualParameters: r.payload, schemaFields: r.schemaFields } } as any);
    expect(historyParameterSourceLabel(h.sampler.source)).toBe('该端点不支持 · 未发送') // clean-1029 #5;
    expect(historyParameterSourceLabel(h.scheduler.source)).toBe('该端点不支持 · 未发送') // clean-1029 #5;
  });
  it('server route uses the builder and records omissions + schemaFields', () => {
    const src = readFileSync('server.ts', 'utf8');
    expect(src).toContain('buildModelScopeImagePayload({ ...req.body, prompt: finalPrompt })');
    expect(src).toContain('parameterOmissions: msOmissions, schemaFields: msSchemaFields');
    expect(src).not.toContain("'cfg','denoise','sampler_name','scheduler']) if(isProvided(req.body[field])) payload[field]");
  });
});
