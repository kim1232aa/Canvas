import { describe, it, expect } from 'vitest';
import {
  schemaProviders,
  veniceCatalogRows,
  veniceImageOutputs,
  veniceVideoStatus,
  normalizeSchemaProviderItems,
} from './schemaProviders';
import * as mod from './schemaProviders';

describe('Venice provider (official docs 2026-10-15)', () => {
  it('uses official root + bearer auth + /models?type=all catalog', () => {
    expect(schemaProviders.venice.root).toBe('https://api.venice.ai/api/v1');
    expect(schemaProviders.venice.catalog).toBe('/models?type=all');
    expect(schemaProviders.venice.auth).toBe('Authorization');
    expect(schemaProviders.venice.header).toBe('x-venice-key');
  });

  it('catalog keeps only image/video with NO built-in parameters', () => {
    const rows = veniceCatalogRows([
      { id: 'venice-sd35', type: 'image', model_spec: { name: 'Venice SD35' }, owned_by: 'venice.ai' },
      { id: 'gemini-omni-flash-1-1-text-to-video', type: 'video', model_spec: { name: 'Gemini Omni', constraints: { model_type: 'text-to-video' } } },
      { id: 'some-chat', type: 'text' },
    ]);
    expect(rows.map(r => r.id)).toEqual(['venice-sd35', 'gemini-omni-flash-1-1-text-to-video']);
    expect(rows[0].endpoint).toBe('/image/generate');
    expect((rows[0] as any).parameters).toBeUndefined();
    expect(rows[1].endpoint).toBe('/video/queue');
    expect((rows[1] as any).parameters).toBeUndefined();
  });

  it('checkpoint list marks supportsLora=false (no custom loras[])', () => {
    const items = normalizeSchemaProviderItems('venice', veniceCatalogRows([
      { id: 'venice-sd35', type: 'image', model_spec: { name: 'Venice SD35' } },
    ]), { sourceUrl: 'https://api.venice.ai/api/v1/models?type=all' });
    expect(items).toHaveLength(1);
    expect(items[0].supportsLora).toBe(false);
  });

  it('image outputs from images[] base64', () => {
    expect(veniceImageOutputs({ images: ['abc=', 'https://x/y.png'] })).toEqual([
      'data:image/webp;base64,abc=',
      'https://x/y.png',
    ]);
    expect(veniceImageOutputs({ images: [] })).toEqual([]);
  });

  it('video status maps PROCESSING/COMPLETED', () => {
    expect(veniceVideoStatus('PROCESSING')).toBe('processing');
    expect(veniceVideoStatus('COMPLETED')).toBe('completed');
  });


  it('exports no built-in request InputSchema (画布 2026-10-15)', () => {
    expect((mod as any).veniceImageInputSchema).toBeUndefined();
    expect((mod as any).veniceVideoInputSchema).toBeUndefined();
    expect(Object.keys(mod).filter(k => /^venice.*InputSchema$/i.test(k))).toEqual([]);
  });
});
