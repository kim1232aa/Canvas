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

  it('detects PNG/JPEG/WebP by bytes, preserves URLs, and reports unknown base64', () => {
    const png=Buffer.from([137,80,78,71,13,10,26,10,0]).toString('base64');
    const jpeg=Buffer.from([0xff,0xd8,0xff,0xd9]).toString('base64');
    const webp=Buffer.from('RIFF\x04\x00\x00\x00WEBP','binary').toString('base64');
    expect(togetherImageOutputs({ data: [
      { url: 'https://a' },{ b64_json: png },{ b64_json: jpeg },{ b64_json: webp },
    ] })).toEqual([
      'https://a',`data:image/png;base64,${png}`,`data:image/jpeg;base64,${jpeg}`,`data:image/webp;base64,${webp}`,
    ]);
    expect(() => togetherImageOutputs({ data: [{ b64_json: 'abc' }] })).toThrow(/未推断 MIME/);
    expect(() => togetherImageOutputs({ data: [{ b64_json: '%%%=' }] })).toThrow(/有效 Base64/);
    const bad={data:[{b64_json:'abc'}]};
    try { togetherImageOutputs(bad); throw new Error('expected malformed-image rejection'); }
    catch(e:any) { expect(e).toMatchObject({status:502,errorSource:'upstream-protocol',rawResponse:bad,endpoint:'https://api.together.ai/v1/images/generations'}); }
    try { togetherImageOutputs(bad,'https://custom.example/images'); throw new Error('expected malformed-image rejection'); }
    catch(e:any) { expect(e.endpoint).toBe('https://custom.example/images'); }
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
