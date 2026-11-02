import { describe, it, expect } from 'vitest';
import {
  schemaProviders,
  aimlapiCatalogRows,
  aimlapiImageOutputs,
  aimlapiVideoOutputs,
  aimlapiLoras,
  normalizeSchemaProviderItems,
} from './schemaProviders';

describe('AIMLAPI provider (official docs 2026-10-15)', () => {
  it('uses official root + bearer auth + videoRoot v2', () => {
    expect(schemaProviders.aimlapi.root).toBe('https://api.aimlapi.com/v1');
    expect(schemaProviders.aimlapi.catalog).toContain('/models');
    expect(schemaProviders.aimlapi.auth).toBe('Authorization');
    expect(schemaProviders.aimlapi.header).toBe('x-aimlapi-key');
    expect((schemaProviders.aimlapi as any).videoRoot).toBe('https://api.aimlapi.com/v2');
  });

  it('catalog keeps image/video, leaves undocumented capabilities and schemas unknown, and drops chat', () => {
    const rows = aimlapiCatalogRows([
      { id: 'alibaba/z-image-turbo-lora', type: 'openai/image-generations', tags: ['playground:image'], modalities: { output: ['image'] }, info: { name: 'Z Image Turbo LoRA', developer: 'Alibaba' } },
      { id: 'openai/gpt-4o', type: 'openai/chat-completions', tags: ['playground:chat'], modalities: { output: ['text'] }, info: { name: 'GPT-4o' } },
      { id: 'pixverse/v5.5/image-to-video', type: 'internal/video-generations/submit', tags: ['playground:video'], modalities: { output: ['video'] }, info: { name: 'Pixverse' } },
      { id: 'flux/schnell', type: 'openai/image-generations', tags: ['playground:image'], modalities: { output: ['image'] }, info: { name: 'Flux Schnell' } },
    ]);
    expect(rows.map(r => r.id).sort()).toEqual(['alibaba/z-image-turbo-lora', 'flux/schnell', 'pixverse/v5.5/image-to-video'].sort());
    const z = rows.find(r => r.id === 'alibaba/z-image-turbo-lora')!;
    expect(z.supportsLora).toBeUndefined();
    expect(z.parameters).toBeUndefined();
    expect(z.endpoint).toBe('/images/generations');
    const v = rows.find(r => r.id.startsWith('pixverse'))!;
    expect(v.category).toBe('text-to-video');
    expect(v.parameters).toBeUndefined();
    expect(rows.find(r => r.id === 'flux/schnell')!.supportsLora).toBeUndefined();
  });

  it('checkpoint list preserves upstream-declared LoRA support and schema', () => {
    const parameters = { type: 'object', properties: { loras: { type: 'array' } } };
    const items = normalizeSchemaProviderItems('aimlapi', aimlapiCatalogRows([
      { id: 'blackforestlabs/flux-2-lora', type: 'openai/image-generations', tags: ['playground:image'], modalities: { output: ['image'] }, supportsLora: true, parameters, info: { name: 'Flux 2 LoRA' } },
      { id: 'vendor/image-model', type: 'openai/image-generations', tags: ['playground:image'], modalities: { output: ['image'] }, parameters, info: { name: 'Schema Declares LoRA' } },
    ]), { sourceUrl: 'https://api.aimlapi.com/v1/models' });
    expect(items).toHaveLength(2);
    expect(items.map(item => item.supportsLora)).toEqual([true, true]);
    expect(items[0].metadata.parameters).toBe(parameters);
    expect(items[1].metadata.parameters).toBe(parameters);
  });

  it('preserves an explicit upstream false and leaves absent capability unknown even when the id says lora', () => {
    const items = normalizeSchemaProviderItems('aimlapi', aimlapiCatalogRows([
      { id: 'vendor/actually-lora-unverified', type: 'image', modalities: { output: ['image'] }, supportsLora: false },
      { id: 'vendor/unknown-lora-model', type: 'image', modalities: { output: ['image'] } },
    ]), { sourceUrl: 'https://api.aimlapi.com/v1/models' });
    expect(items.map(item => item.supportsLora)).toEqual([false, undefined]);
  });

  it('detects PNG/JPEG/WebP by bytes, preserves URLs, and reports unknown base64', () => {
    const png=Buffer.from([137,80,78,71,13,10,26,10,0]).toString('base64');
    const jpeg=Buffer.from([0xff,0xd8,0xff,0xd9]).toString('base64');
    const webp=Buffer.from('RIFF\x04\x00\x00\x00WEBP','binary').toString('base64');
    expect(aimlapiImageOutputs({ data: [
      { url: 'https://a' },{ b64_json: png },{ b64_json: jpeg },{ b64_json: webp },
    ] })).toEqual([
      'https://a',`data:image/png;base64,${png}`,`data:image/jpeg;base64,${jpeg}`,`data:image/webp;base64,${webp}`,
    ]);
    expect(() => aimlapiImageOutputs({ data: [{ b64_json: 'abc' }] })).toThrow(/未推断 MIME/);
    expect(() => aimlapiImageOutputs({ data: [{ b64_json: '%%%=' }] })).toThrow(/有效 Base64/);
  });

  it('video outputs from video.url', () => {
    expect(aimlapiVideoOutputs({ status: 'completed', video: { url: 'https://v.mp4' } })).toEqual(['https://v.mp4']);
    expect(aimlapiVideoOutputs({ status: 'queued' })).toEqual([]);
  });

  it('aimlapiLoras maps path+scale and refuses missing/out-of-range scale', () => {
    expect(aimlapiLoras([{ path: 'ostris/z_image_turbo_childrens_drawings', strength: 0.85 }])).toEqual([
      { path: 'ostris/z_image_turbo_childrens_drawings', scale: 0.85 },
    ]);
    expect(() => aimlapiLoras([{ path: 'a/b' }])).toThrow(/scale/);
    expect(() => aimlapiLoras([{ path: 'a/b', scale: 5 }])).toThrow(/\[0, 4\]/);
    // trace-fix2 #5: count limit is no longer hard-coded here — submit reads loras.maxItems via schemaLoraMaxItems.
    expect(aimlapiLoras([{ path: 'a', scale: 1 }, { path: 'b', scale: 1 }, { path: 'c', scale: 1 }, { path: 'd', scale: 1 }])).toHaveLength(4);
  });
});
