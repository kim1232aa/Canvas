import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../services/api', () => ({ getStoredApiKeys: () => ({}) }));
import { ensureModelSchema } from '../services/modelSchemaCache';
import { fieldCapability } from './fieldCapability';

const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const falSchema = json('../server/fixtures/fal-openapi-fal-ai__flux-lora.json').components.schemas.FluxLoraInput;
const falProps = falSchema.properties;
const replicateSchema = json('../../docs/evidence/replicate-flux-dev-lora-openapi-2026-10-16.json').latest_version.openapi_schema.components.schemas.Input;
const replicateProps = replicateSchema.properties;
const wavespeedCatalog = json('../server/__fixtures__wavespeed-live-2026-10-15.json');
const live = (propertiesObj: Record<string, unknown>, inputSchema?: Record<string, unknown>) => ({
  schemaEntry: { status: 'ready' as const, propertiesObj, ...(inputSchema ? { inputSchema } : {}) },
});
const supported = { capability: 'supported', source: 'live-schema' };
const unsupported = { capability: 'unsupported', source: 'live-schema' };
const staticUnsupported = { capability: 'unsupported', source: 'static-spec' };
const unknown = { capability: 'unknown', source: 'none' };

describe('fieldCapability', () => {
  it('uses the fal flux-lora live OpenAPI fixture for positive matches and exact static-spec for unsupported fields when OpenAPI omits additionalProperties:false', () => {
    for (const field of ['seed', 'steps', 'cfg', 'loras', 'width', 'height', 'output_format', 'num_images']) {
      expect(fieldCapability('fal', 'fal-ai/flux-lora', field, live(falProps, falSchema)), field).toEqual(supported);
    }
    for (const field of ['negative_prompt', 'sampler', 'scheduler']) {
      expect(fieldCapability('fal', 'fal-ai/flux-lora', field, live(falProps, falSchema)), field).toEqual(staticUnsupported);
    }
    // FluxLoraInput has no additionalProperties:false: absent fields are unknown absent exact static evidence.
    expect(fieldCapability('fal', 'fal-ai/flux-lora', 'denoise', live(falProps, falSchema))).toEqual(unknown);
    expect(fieldCapability('fal', 'fal-ai/flux-lora', 'enable_safety_checker', live(falProps, falSchema))).toEqual(supported);
  });

  it('uses a real open fal OpenAPI schema: prompt/steps alias/safety setting declared, arbitrary missing field unknown', () => {
    expect(fieldCapability('fal', 'fal-ai/flux-lora', 'prompt', live(falProps, falSchema))).toEqual(supported);
    expect(fieldCapability('fal', 'fal-ai/flux-lora', 'steps', live(falProps, falSchema))).toEqual(supported);
    expect(fieldCapability('fal', 'fal-ai/flux-lora', 'enable_safety_checker', live(falProps, falSchema))).toEqual(supported);
    expect(fieldCapability('fal', 'fal-ai/flux-lora', 'not_in_schema', live(falProps, falSchema))).toEqual(unknown);
  });

  it('uses an explicit additionalProperties:false schema to prove a missing field unsupported', () => {
    expect(fieldCapability('wavespeed', 'model', 'steps', { schemaEntry: {
      status: 'ready', propertiesObj: { prompt: {} }, inputSchema: { type: 'object', properties: { prompt: {} }, additionalProperties: false },
    } })).toEqual(unsupported);
  });

  it('uses the Replicate flux-dev-lora OpenAPI fixture for positive matches and static-spec for unsupported fields', () => {
    for (const field of ['seed', 'steps', 'cfg', 'loras', 'aspect_ratio']) {
      expect(fieldCapability('replicate', 'black-forest-labs/flux-dev-lora', field, live(replicateProps, replicateSchema)), field).toEqual(supported);
    }
    for (const field of ['width', 'height', 'negative_prompt', 'sampler', 'scheduler']) {
      expect(fieldCapability('replicate', 'black-forest-labs/flux-dev-lora', field, live(replicateProps, replicateSchema)), field).toEqual(staticUnsupported);
    }
  });

  it.each([
    ['nanogpt', 'flux-schnell', 'seed', 'unsupported'],
    ['nanogpt', 'flux-schnell', 'resolution', 'supported'],
    ['runware', 'alibaba:qwen-image@3.0', 'loras', 'unsupported'],
    ['runware', 'alibaba:qwen-image@3.0', 'cfg', 'supported'],
    ['gemini', 'gemini-3.1-flash-image', 'seed', 'unsupported'],
    ['gemini', 'gemini-3.1-flash-image', 'aspect_ratio', 'supported'],
    ['fal', 'fal-ai/flux-lora', 'sampler', 'unsupported'],
    ['modelscope', 'modelscope-hosted-image', 'seed', 'supported'],
    ['modelscope', 'modelscope-hosted-image', 'steps', 'unknown'],
  ])('reads the existing static row %s / %s / %s', (provider, model, field, capability) => {
    expect(fieldCapability(provider, model, field)).toEqual({ capability, source: 'static-spec' });
  });

  it('uses WaveSpeed live catalog fixtures (closed additionalProperties:false), not a provider-name rule', () => {
    for (const row of wavespeedCatalog.data) {
      const reqSchema = row.api_schema.api_schemas[0].request_schema;
      const props = reqSchema.properties;
      expect(fieldCapability('wavespeed', row.model_id, 'seed', live(props, reqSchema))).toEqual(supported);
      expect(fieldCapability('wavespeed', row.model_id, 'loras', live(props, reqSchema))).toEqual(supported);
    }
    const krea = wavespeedCatalog.data[0];
    const kreaSchema = krea.api_schema.api_schemas[0].request_schema;
    const props = kreaSchema.properties;
    expect(fieldCapability('wavespeed', krea.model_id, 'width', live(props, kreaSchema))).toEqual(unsupported);
    expect(fieldCapability('wavespeed', krea.model_id, 'steps', live(props, kreaSchema))).toEqual(unsupported);
    expect(fieldCapability('wavespeed', krea.model_id, 'seed')).toEqual(unknown);
    expect(fieldCapability('unlisted-provider', krea.model_id, 'seed', live(props, kreaSchema))).toEqual(supported);
  });

  it('lets ready closed live schema override contradictory static specs, while open live schema does not fabricate unsupported', () => {
    expect(fieldCapability('nanogpt', 'flux-schnell', 'seed', live(falProps, falSchema))).toEqual(supported);
    expect(fieldCapability('runware', 'alibaba:qwen-image@3.0', 'cfg', live({}, { additionalProperties: false }))).toEqual(unsupported);
    expect(fieldCapability('runware', 'alibaba:qwen-image@3.0', 'cfg', live({}))).toEqual(unknown);
  });

  it.each(['loading', 'error'] as const)('returns unknown for %s even with a static declaration', (status) => {
    expect(fieldCapability('nanogpt', 'flux-schnell', 'seed', { schemaEntry: { status, propertiesObj: falProps } })).toEqual(unknown);
  });

  it('does not guess unsupported for missing models, missing fields or incomplete ready entries', () => {
    expect(fieldCapability('video', 'fal-ai/flux-lora', 'seed')).toEqual(unknown);
    expect(fieldCapability('nanogpt', 'not-in-table', 'seed')).toEqual(unknown);
    expect(fieldCapability('nanogpt', 'flux-schnell', 'prompt')).toEqual(unknown);
    expect(fieldCapability('wavespeed', 'model', 'seed', { schemaEntry: { status: 'ready', properties: ['prompt'] } })).toEqual(unknown);
  });

  it('keeps hand-filled custom_parameters keys unknown rather than unsupported, including false and zero', () => {
    const closedEmpty = live({}, { additionalProperties: false });
    for (const [field, value] of [['sampler', 'euler'], ['seed', 0], ['enable_sync_mode', false]] as const) {
      expect(fieldCapability('fal', 'fal-ai/flux-lora', field, {
        ...closedEmpty, customParameters: JSON.stringify({ [field]: value }),
      })).toEqual(unknown);
    }
    expect(fieldCapability('nanogpt', 'flux-schnell', 'seed', { customParameters: '{"seed":0}' })).toEqual(unknown);
    expect(fieldCapability('fal', 'fal-ai/flux-lora', 'sampler', { ...live(falProps, falSchema), customParameters: '{"sampler_name":"euler"}' })).toEqual(unknown);
    expect(fieldCapability('fal', 'fal-ai/flux-lora', 'sampler', { ...live(falProps, falSchema), customParameters: '{invalid' })).toEqual(staticUnsupported);
    expect(fieldCapability('fal', 'fal-ai/flux-lora', 'sampler', { ...live(falProps, falSchema), customParameters: '{"sampler":""}' })).toEqual(staticUnsupported);
  });

  it('keeps positive schema evidence when the same key is hand-filled', () => {
    expect(fieldCapability('fal', 'fal-ai/flux-lora', 'seed', { ...live(falProps, falSchema), customParameters: '{"seed":0}' })).toEqual(supported);
    expect(fieldCapability('runware', 'alibaba:qwen-image@3.0', 'cfg', { customParameters: '{"cfg":3}' })).toEqual({ capability: 'supported', source: 'static-spec' });
  });

  it('does not promote static unverified declarations to supported', () => {
    expect(fieldCapability('modelscope', 'modelscope-hosted-image', 'steps')).toEqual({ capability: 'unknown', source: 'static-spec' });
    expect(fieldCapability('nanogpt', 'flux-dev', 'seed')).toEqual({ capability: 'unknown', source: 'static-spec' });
  });

  it('requires a closed complete input schema to reject missing fields without exact static evidence', () => {
    const props = wavespeedCatalog.data[0].api_schema.api_schemas[0].request_schema.properties;
    for (const inputSchema of [
      undefined,
      { properties: props },
      { properties: props, additionalProperties: true },
      { properties: props, additionalProperties: {} },
      { properties: props, additionalProperties: false, $ref: '#/Input' },
      { properties: props, additionalProperties: false, anyOf: [{ properties: { steps: {} } }] },
      { properties: props, additionalProperties: false, oneOf: [{ properties: { steps: {} } }] },
      { properties: props, additionalProperties: false, allOf: [{ $ref: '#/Input' }] },
    ]) {
      expect(fieldCapability('wavespeed', 'wavespeed-ai/krea-v2/turbo-lora', 'steps', { schemaEntry: { status: 'ready', propertiesObj: props, inputSchema } })).toEqual(unknown);
    }
    const inputSchema = wavespeedCatalog.data[0].api_schema.api_schemas[0].request_schema;
    expect(fieldCapability('wavespeed', 'wavespeed-ai/krea-v2/turbo-lora', 'steps', { schemaEntry: { status: 'ready', propertiesObj: props, inputSchema } })).toEqual(unsupported);
    expect(fieldCapability('nanogpt', 'flux-schnell', 'steps', live(props))).toEqual(staticUnsupported);
  });

  it('does not use custom JSON evidence belonging to another provider or model', () => {
    for (const scope of [{ provider: 'fal', model: 'fal-ai/flux-lora' }, { provider: 'nanogpt', model: 'flux-dev' }]) {
      expect(fieldCapability('nanogpt', 'flux-schnell', 'seed', { customParameters: JSON.stringify({ seed: 0, _canvas: { scope } }) })).toEqual(staticUnsupported);
    }
  });

  it('reads the actual model schema cache without requiring a context', async () => {
    const closedFalSchema = { ...falSchema, additionalProperties: false };
    const fetchSchema = vi.fn(async () => new Response(JSON.stringify({ inputSchema: closedFalSchema }), { status: 200 }));
    ensureModelSchema('fal', 'fal-ai/flux-lora', fetchSchema as typeof fetch);
    expect(fieldCapability('fal', 'fal-ai/flux-lora', 'sampler')).toEqual(unknown);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fieldCapability('fal', 'fal-ai/flux-lora', 'cfg')).toEqual(supported);
    expect(fieldCapability('fal', 'fal-ai/flux-lora', 'sampler')).toEqual(unsupported);
  });
});
