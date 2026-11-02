import { describe, it, expect } from 'vitest';
import {
  schemaProviders,
  veniceCatalogRows,
  veniceImageOutputs,
  veniceVideoStatus,
  normalizeSchemaProviderItems,
  makeSchemaProviderReader,
  parseVeniceImageResponse,
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

  it('preserves the requested JSON image format and rejects arbitrary base64', () => {
    const png=Buffer.from([137,80,78,71,13,10,26,10]).toString('base64');
    const jpeg=Buffer.from([0xff,0xd8,0xff,0xd9]).toString('base64');
    const webp=Buffer.from('RIFF\x04\x00\x00\x00WEBP','binary').toString('base64');
    expect(veniceImageOutputs({ images: [png, 'https://x/y.png', 'abc='] },'png')).toEqual([
      `data:image/png;base64,${png}`,
      'https://x/y.png',
    ]);
    expect(veniceImageOutputs({ images: [jpeg] },'jpeg')).toEqual([`data:image/jpeg;base64,${jpeg}`]);
    expect(veniceImageOutputs({ images: [webp] },'webp')).toEqual([`data:image/webp;base64,${webp}`]);
    expect(veniceImageOutputs({ images: [`data:image/png;base64,${png}`] })).toEqual([`data:image/png;base64,${png}`]);
    expect(veniceImageOutputs({ images: ['abc='] })).toEqual([]);
    expect(veniceImageOutputs({ images: [] })).toEqual([]);
  });

  it('accepts only valid Venice image binary with its actual content type', async () => {
    const png=Buffer.from([137,80,78,71,13,10,26,10,0]);
    const {data,status}=await parseVeniceImageResponse(new Response(png,{headers:{'Content-Type':'image/png'}}),'https://api.venice.ai/api/v1/image/generate');
    expect(status).toBe(200);
    expect(veniceImageOutputs({images:[`data:${data.contentType};base64,${data.base64}`]})).toEqual([`data:image/png;base64,${png.toString('base64')}`]);
  });

  it('retains Venice upstream errors and rejects malformed image bodies', async () => {
    await expect(parseVeniceImageResponse(new Response('upstream failed',{status:502,headers:{'Content-Type':'text/plain'}}),'https://api.venice.ai/api/v1/image/generate')).rejects.toMatchObject({status:502,rawResponse:'upstream failed',errorSource:'upstream'});
    await expect(parseVeniceImageResponse(new Response('not an image',{headers:{'Content-Type':'image/png'}}),'https://api.venice.ai/api/v1/image/generate')).rejects.toMatchObject({status:200,errorSource:'upstream-protocol'});
    const otherProviderRead=makeSchemaProviderReader('together',async()=>new Response('binary',{headers:{'Content-Type':'image/png'}}) as any,'key','/test');
    await expect(otherProviderRead('https://api.together.ai/v1/images/generations')).rejects.toMatchObject({status:200,errorSource:'upstream-protocol'});
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
