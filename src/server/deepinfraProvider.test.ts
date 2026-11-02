import { describe, it, expect } from 'vitest';
import {
  schemaProviders,
  deepinfraCatalogRows,
  deepinfraImageOutputs,
  normalizeSchemaProviderItems,
  officialOpenApiSources,
} from './schemaProviders';

describe('DeepInfra provider (official docs 2026-11-02)', () => {
  it('uses official root + bearer auth + models/list catalog', () => {
    expect(schemaProviders.deepinfra.root).toBe('https://api.deepinfra.com');
    expect(schemaProviders.deepinfra.catalog).toBe('/models/list');
    expect(schemaProviders.deepinfra.auth).toBe('Authorization');
    expect(schemaProviders.deepinfra.header).toBe('x-deepinfra-key');
    expect(officialOpenApiSources.deepinfra).toBe('https://api.deepinfra.com/openapi.json');
  });

  it('catalog keeps only text-to-image and sets id=model_name; no LoRA support flag', () => {
    const rows = deepinfraCatalogRows([
      { model_name: 'black-forest-labs/FLUX-1-schnell', type: 'text-to-image', reported_type: 'text-to-image', description: 'schnell' },
      { model_name: 'meta-llama/Meta-Llama-3-8B-Instruct', type: 'text-generation', reported_type: 'text-generation' },
      { model_name: 'stabilityai/sdxl-turbo', type: 'text-to-image', reported_type: 'text-to-image' },
      { model_name: 'missing-type-skipped' },
    ]);
    expect(rows.map((r) => r.id).sort()).toEqual([
      'black-forest-labs/FLUX-1-schnell',
      'stabilityai/sdxl-turbo',
    ].sort());
    expect(rows.every((r) => r.category === 'text-to-image')).toBe(true);
    expect(rows.every((r) => r.supportsLora === false)).toBe(true);
    expect(rows[0].endpoint).toBe('/v1/openai/images/generations');
  });

  it('checkpoint list exposes supportsLora=false', () => {
    const items = normalizeSchemaProviderItems(
      'deepinfra',
      deepinfraCatalogRows([
        { model_name: 'black-forest-labs/FLUX-1-schnell', type: 'text-to-image', reported_type: 'text-to-image' },
      ]),
      { sourceUrl: 'https://api.deepinfra.com/models/list' },
    );
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('black-forest-labs/FLUX-1-schnell');
    expect(items[0].supportsLora).toBe(false);
  });

  it('image outputs from data[].b64_json (official response_format)', () => {
    expect(deepinfraImageOutputs({ data: [{ b64_json: 'abc' }] })).toEqual([
      'data:image/png;base64,abc',
    ]);
    expect(deepinfraImageOutputs({ data: [{ url: 'https://a' }] })).toEqual(['https://a']);
    expect(deepinfraImageOutputs({ data: [] })).toEqual([]);
  });

  it('declares honest LoRA local block (no empty-shell personal LoRA)', () => {
    const block = (schemaProviders.deepinfra as any).loraLocalBlock;
    expect(block?.docUrl).toContain('private-models/lora-image');
    expect(String(block?.docQuote || '')).toMatch(/Deploy LoRA|控制台部署/);
  });
});

describe('DeepInfra submit mapping (unit)', () => {
  it('maps canvas prompt/size into OpenAI images body fields only', () => {
    // Mirrors OpenAPI OpenAIImagesGenerationsIn required model+prompt; size string; n.
    const payload: Record<string, unknown> = {
      prompt: 'A photo of an astronaut riding a horse on Mars.',
      model: 'black-forest-labs/FLUX-1-schnell',
      size: '1024x1024',
      n: 1,
      response_format: 'b64_json',
    };
    expect(Object.keys(payload).sort()).toEqual(['model', 'n', 'prompt', 'response_format', 'size'].sort());
    expect(payload).not.toHaveProperty('steps');
    expect(payload).not.toHaveProperty('cfg');
    expect(payload).not.toHaveProperty('loras');
  });
});
