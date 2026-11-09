import {describe,expect,it} from 'vitest';
import {
  canvasFieldMatchesSchema,
  isSchemaDrivenProvider,
  isDeclaredSchemaFieldOmitted,
  isSchemaFieldsOnlyEnabled,
  isSchemaOmitCandidate,
  readDeclaredSchemaProperties,
} from './schemaSendHint';

const fluxProps = {
  prompt: {},
  seed: {},
  steps: {},
  width: {},
  height: {},
  guidance_scale: {},
  strength: {},
  styles: {},
};

const closedFluxCtx = {
  schemaEntry: {
    status: 'ready' as const,
    propertiesObj: fluxProps,
    inputSchema: { type: 'object', properties: fluxProps, additionalProperties: false },
  },
};

describe('schemaSendHint', () => {
  it('recognizes schema-driven providers', () => {
    expect(isSchemaDrivenProvider('wavespeed')).toBe(true);
    expect(isSchemaDrivenProvider('krea')).toBe(true);
    expect(isSchemaDrivenProvider('fal')).toBe(false);
  });

  it('defaults schemaFieldsOnly to enabled when JSON missing or invalid', () => {
    expect(isSchemaFieldsOnlyEnabled(undefined)).toBe(true);
    expect(isSchemaFieldsOnlyEnabled('{"_canvas":{"schemaFieldsOnly":false}}')).toBe(false);
  });

  it('never fakes 不会发送 without declared Schema properties', () => {
    expect(isSchemaOmitCandidate('krea', 'steps')).toBe(false);
    expect(isSchemaOmitCandidate('krea', 'cfg')).toBe(false);
    expect(isSchemaOmitCandidate('wavespeed', 'steps')).toBe(false);
  });

  it('Krea flux-1-dev: steps/seed/cfg/width/height/denoise match Schema — not omit', () => {
    const custom = JSON.stringify({ _canvas: { schemaProperties: Object.keys(fluxProps) } });
    expect(isSchemaOmitCandidate('krea', 'steps', custom)).toBe(false);
    expect(isSchemaOmitCandidate('krea', 'seed', custom)).toBe(false);
    expect(isSchemaOmitCandidate('krea', 'cfg', custom)).toBe(false); // → guidance_scale
    expect(isSchemaOmitCandidate('krea', 'width', custom)).toBe(false);
    expect(isSchemaOmitCandidate('krea', 'height', custom)).toBe(false);
    expect(isSchemaOmitCandidate('krea', 'denoise', custom)).toBe(false); // → strength
    expect(canvasFieldMatchesSchema('cfg', fluxProps)).toBe(true);
  });

  it('open/array-only schemaProperties never guesses omit; closed inputSchema (additionalProperties:false) or schemaClosed omits absent sampler/scheduler', () => {
    const custom = JSON.stringify({ _canvas: { schemaProperties: Object.keys(fluxProps) } });
    // Array-only list has no closure proof -> unknown (false)
    expect(isSchemaOmitCandidate('krea', 'sampler', custom)).toBe(false);
    expect(isSchemaOmitCandidate('krea', 'scheduler', custom)).toBe(false);
    // Closed schema entry proves sampler/scheduler are unsupported -> true
    expect(isSchemaOmitCandidate('krea', 'sampler', custom, undefined, closedFluxCtx)).toBe(true);
    expect(isSchemaOmitCandidate('krea', 'scheduler', custom, undefined, closedFluxCtx)).toBe(true);
    expect(isSchemaOmitCandidate('krea', 'cfg', custom, undefined, closedFluxCtx)).toBe(false);
    // schemaClosed: true evidence also proves sampler/scheduler are unsupported -> true
    const closedCustom = JSON.stringify({ _canvas: { schemaProperties: Object.keys(fluxProps), schemaClosed: true } });
    expect(isSchemaOmitCandidate('krea', 'sampler', closedCustom)).toBe(true);
    expect(isSchemaOmitCandidate('krea', 'scheduler', closedCustom)).toBe(true);
    expect(isSchemaOmitCandidate('krea', 'cfg', closedCustom)).toBe(false);
  });

  it('live OpenAPI provider without additionalProperties:false returns false (unknown) for array-only schemaProperties', () => {
    for (const provider of ['replicate', 'muapi', 'together', 'aimlapi', 'novita', 'venice', 'wavespeed', 'krea']) {
      const custom = JSON.stringify({ _canvas: { schemaProperties: ['prompt', 'seed'] } });
      expect(isSchemaOmitCandidate(provider, 'steps', custom)).toBe(false);
      expect(isSchemaOmitCandidate(provider, 'cfg', custom)).toBe(false);
      expect(isSchemaOmitCandidate(provider, 'sampler', custom)).toBe(false);
    }
  });

  it('reads schemaProperties from custom_parameters._canvas', () => {
    expect(readDeclaredSchemaProperties(JSON.stringify({ _canvas: { schemaProperties: ['steps', 'seed'] } }))).toEqual(
      new Set(['steps', 'seed']),
    );
  });

  it('Krea flux-1-dev: loras/styles match Schema — not omit', () => {
    const custom = JSON.stringify({ _canvas: { schemaProperties: Object.keys(fluxProps) } });
    expect(isSchemaOmitCandidate('krea', 'loras', custom)).toBe(false);
    expect(isSchemaOmitCandidate('krea', 'styles', custom)).toBe(false);
    expect(canvasFieldMatchesSchema('loras', fluxProps)).toBe(true);
  });

  it('resolves fal and static-spec providers without the badge-provider gate', () => {
    expect(isSchemaOmitCandidate('fal', 'sampler', undefined, ['prompt', 'seed'], { model: 'fal-ai/flux-lora' })).toBe(true);
    expect(isSchemaOmitCandidate('fal', 'cfg', undefined, ['guidance_scale'], { model: 'fal-ai/flux-lora' })).toBe(false);
    expect(isSchemaOmitCandidate('nanogpt', 'seed', undefined, undefined, { model: 'flux-schnell' })).toBe(true);
    expect(isSchemaOmitCandidate('nanogpt', 'seed', undefined, undefined, { model: 'flux-dev' })).toBe(false); // unverified -> unknown -> false
    expect(isSchemaOmitCandidate('runware', 'loras', undefined, undefined, { model: 'alibaba:qwen-image@3.0' })).toBe(true);
  });

  it('never hides custom JSON keys or fields while the schema is loading or failed', () => {
    expect(isSchemaOmitCandidate('fal', 'sampler', '{"sampler_name":"euler"}', ['prompt'], { model: 'fal-ai/flux-lora' })).toBe(false);
    for (const flag of ['schemaLoading', 'schemaUnavailable']) {
      const cp = JSON.stringify({ _canvas: { [flag]: true, schemaProperties: ['prompt'] } });
      expect(isSchemaOmitCandidate('nanogpt', 'seed', cp, undefined, { model: 'flux-schnell' })).toBe(false);
      expect(isDeclaredSchemaFieldOmitted('seed', cp)).toBe(false);
    }
  });

  it('schemaFieldsOnly false disables omit badges', () => {
    const custom = JSON.stringify({ _canvas: { schemaFieldsOnly: false, schemaProperties: Object.keys(fluxProps) } });
    expect(isSchemaOmitCandidate('krea', 'sampler', custom, undefined, closedFluxCtx)).toBe(false);
  });
});
