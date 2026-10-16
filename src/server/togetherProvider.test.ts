import { describe, it, expect } from 'vitest';
import {
  schemaProviders,
  togetherCatalogRows,
  togetherImageOutputs,
  togetherVideoOutputs,
  normalizeSchemaProviderItems,
} from './schemaProviders';
import * as mod from './schemaProviders';

describe('Together provider (official docs 2026-10-15)', () => {
  it('uses official root + bearer auth + videoRoot v2', () => {
    expect(schemaProviders.together.root).toBe('https://api.together.ai/v1');
    expect(schemaProviders.together.catalog).toBe('/models');
    expect(schemaProviders.together.auth).toBe('Authorization');
    expect((schemaProviders.together as any).videoRoot).toBe('https://api.together.ai/v2');
  });

  it('catalog keeps only image/video models with NO built-in parameters', () => {
    const rows = togetherCatalogRows([
      { id: 'black-forest-labs/FLUX.2-dev', type: 'image', display_name: 'FLUX.2 Dev', organization: 'Black Forest Labs' },
      { id: 'minimax/video-01-director', type: 'video', display_name: 'MiniMax Director' },
      { id: 'meta-llama/Llama-3.3-70B', type: 'chat' },
    ]);
    expect(rows.map(r => r.id)).toEqual(['black-forest-labs/FLUX.2-dev', 'minimax/video-01-director']);
    expect(rows[0].endpoint).toBe('/images/generations');
    expect((rows[0] as any).parameters).toBeUndefined();
    expect(rows[1].endpoint).toBe('/videos');
    expect((rows[1] as any).parameters).toBeUndefined();
  });

  it('checkpoint list leaves supportsLora undecided (image_loras blocked by officialUnavailableParams at submit)', () => {
    const items = normalizeSchemaProviderItems('together', togetherCatalogRows([
      { id: 'black-forest-labs/FLUX.2-dev', type: 'image', display_name: 'FLUX.2 Dev' },
    ]), { sourceUrl: 'https://api.together.ai/v1/models' });
    expect(items).toHaveLength(1);
    expect(items[0].supportsLora).toBeUndefined();
  });

  it('image outputs from data[].url or b64_json', () => {
    expect(togetherImageOutputs({ data: [{ url: 'https://a' }, { b64_json: 'abc' }] })).toEqual([
      'https://a',
      'data:image/jpeg;base64,abc',
    ]);
    expect(togetherImageOutputs({ data: [] })).toEqual([]);
  });

  it('video outputs from outputs.video_url', () => {
    expect(togetherVideoOutputs({ outputs: { video_url: 'https://v', cost: 1 } })).toEqual(['https://v']);
    expect(togetherVideoOutputs({ status: 'in_progress' })).toEqual([]);
  });


  it('exports no built-in request InputSchema (画布 2026-10-15)', () => {
    expect((mod as any).togetherImageInputSchema).toBeUndefined();
    expect((mod as any).togetherVideoInputSchema).toBeUndefined();
    expect(Object.keys(mod).filter(k => /^together.*InputSchema$/i.test(k))).toEqual([]);
  });
});
