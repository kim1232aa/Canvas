import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildReplicatePredictionRequest } from './replicateImageContract';
import { buildModelScopeImagePayload, MODELSCOPE_IMAGE_SCHEMA_FIELDS } from './modelScopeImageContract';
import { resolveHistoryParameters, historyParameterSourceLabel } from '../utils/historyParameters';

// Live official flux-schnell Input properties (GET https://replicate.com/api/models/black-forest-labs/flux-schnell/versions, 2026-10-15).
const SCHNELL_PROPS = Object.fromEntries(['seed','prompt','go_fast','megapixels','num_outputs','aspect_ratio','output_format','output_quality','num_inference_steps','disable_safety_checker'].map((k) => [k, {}]));
const filled = { prompt: 'p', negative_prompt: 'blurry', cfg: 3.5, steps: 4, seed: 7, aspect_ratio: '16:9', width: 1024, height: 768 };

describe('Replicate declared-field gate (generic, schema-driven)', () => {
  it('route forwards schemaFields into history metadata', () => {
    expect(readFileSync('src/server/routes/replicateRoutes.ts', 'utf8')).toContain('schemaFields: mapped.schemaFields');
  });
});

describe('ModelScope API-Inference gate (official param table)', () => {
  it('explicit guidance wins over cfg; no cfg key ever sent', () => {
    const r = buildModelScopeImagePayload({ model: 'm', prompt: 'p', guidance: 3.5, cfg: 7 });
    expect(r.payload.guidance).toBe(3.5);
    expect('cfg' in r.payload).toBe(false);
  });
  it('server route uses the builder and records omissions + schemaFields', () => {
    const src = readFileSync('server.ts', 'utf8');
    expect(src).toContain('buildModelScopeImagePayload({ ...req.body, prompt: finalPrompt })');
    expect(src).toContain('parameterOmissions: msOmissions, schemaFields: msSchemaFields');
    expect(src).not.toContain("'cfg','denoise','sampler_name','scheduler']) if(isProvided(req.body[field])) payload[field]");
  });
});
