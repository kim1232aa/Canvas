import { describe, it, expect } from 'vitest';
import { kreaCatalogRows, kreaJobOutputs, kreaStyles, normalizeSchemaProviderItems, schemaProviders } from './schemaProviders';

// Shape mirrors official https://api.krea.ai/openapi.json (fetched 2026-10-15).
const doc = {
  paths: {
    '/generate/image/bfl/flux-1-dev': { post: { summary: 'Flux.1 Dev', requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/F' } } } } } },
    '/generate/image/google/nano-banana': { post: { summary: 'Nano Banana', requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { prompt: { type: 'string' } } } } } } } },
    '/generate/video/kling/kling-2.5': { post: { summary: 'Kling 2.5' } },
    '/generate/enhance/krea/enhance': { post: { summary: 'Enhance' } },
    '/jobs/{id}': { get: {} },
  },
  components: { schemas: { F: { type: 'object', properties: { prompt: { type: 'string' }, seed: { type: 'number' }, steps: { type: 'integer' }, width: { type: 'number' }, height: { type: 'number' }, guidance_scale: { type: 'number' }, strength: { type: 'number' }, styles: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, strength: { type: 'number', minimum: -2, maximum: 2 } } } } } } } },
};

describe('Krea provider (official OpenAPI)', () => {
  it('uses official root + bearer auth, no private endpoints', () => {
    expect(schemaProviders.krea.root).toBe('https://api.krea.ai');
    expect(schemaProviders.krea.catalog).toBe('/openapi.json');
    expect(schemaProviders.krea.auth).toBe('Authorization');
  });
  it('catalog = POST /generate/image|video only, with resolved schema', () => {
    const rows = kreaCatalogRows(doc);
    expect(rows.map(r => r.id)).toEqual(['image/bfl/flux-1-dev', 'image/google/nano-banana', 'video/kling/kling-2.5']);
    expect(rows[0].endpoint).toBe('/generate/image/bfl/flux-1-dev');
    expect(rows[0].parameters.properties.styles).toBeTruthy();
  });
  it('checkpoint list keeps image endpoints and flags styles(LoRA) support from schema', () => {
    const items = normalizeSchemaProviderItems('krea', kreaCatalogRows(doc), { sourceUrl: 'x' });
    expect(items.map((i: any) => [i.id, i.supportsLora])).toEqual([['image/bfl/flux-1-dev', true], ['image/google/nano-banana', false]]);
  });
  it('LoRA list maps GET /styles items (id/title/models/cover)', () => {
    const items = normalizeSchemaProviderItems('krea', [{ id: 'abc', title: 'Watercolor', models: ['flux_dev'], cover_url: 'https://c/x.png', owner: { name: 'u' } }], { lora: true, sourceUrl: 's' });
    expect(items[0]).toMatchObject({ id: 'abc', name: 'Watercolor', type: 'LoRA', baseModel: 'flux_dev', imageUrl: 'https://c/x.png', creator: 'u' });
  });
  it('canvas LoRA nodes → styles[{id,strength}]; out-of-range strength refused', () => {
    expect(kreaStyles([{ name: 'abc', strength: 0.8 }])).toEqual([{ id: 'abc', strength: 0.8 }]);
    expect(() => kreaStyles([{ name: 'abc', strength: 3 }])).toThrow(/\[-2, 2\]/);
    expect(() => kreaStyles([{ strength: 1 }])).toThrow(/style ID/);
  });
  it('job outputs from result.urls (string[] or {url}[])', () => {
    expect(kreaJobOutputs({ result: { urls: ['https://a'] } })).toEqual(['https://a']);
    expect(kreaJobOutputs({ result: { urls: [{ type: 'preview', url: 'https://b' }] } })).toEqual(['https://b']);
    expect(kreaJobOutputs({ result: null })).toEqual([]);
  });
});
