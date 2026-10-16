import { describe, it, expect } from 'vitest';
import {
  schemaProviders,
  aimlapiCatalogRows,
  aimlapiImageOutputs,
  aimlapiVideoOutputs,
  aimlapiImageInputSchema,
  aimlapiLoraImageInputSchema,
  aimlapiVideoInputSchema,
  aimlapiLoras,
  aimlapiModelSupportsLora,
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

  it('catalog keeps image/video, marks LoRA models, drops chat', () => {
    const rows = aimlapiCatalogRows([
      { id: 'alibaba/z-image-turbo-lora', type: 'openai/image-generations', tags: ['playground:image'], modalities: { output: ['image'] }, info: { name: 'Z Image Turbo LoRA', developer: 'Alibaba' } },
      { id: 'openai/gpt-4o', type: 'openai/chat-completions', tags: ['playground:chat'], modalities: { output: ['text'] }, info: { name: 'GPT-4o' } },
      { id: 'pixverse/v5.5/image-to-video', type: 'internal/video-generations/submit', tags: ['playground:video'], modalities: { output: ['video'] }, info: { name: 'Pixverse' } },
      { id: 'flux/schnell', type: 'openai/image-generations', tags: ['playground:image'], modalities: { output: ['image'] }, info: { name: 'Flux Schnell' } },
    ]);
    expect(rows.map(r => r.id).sort()).toEqual(['alibaba/z-image-turbo-lora', 'flux/schnell', 'pixverse/v5.5/image-to-video'].sort());
    const z = rows.find(r => r.id === 'alibaba/z-image-turbo-lora')!;
    expect(z.supportsLora).toBe(true);
    expect(z.parameters).toBe(aimlapiLoraImageInputSchema);
    expect(z.endpoint).toBe('/images/generations');
    const v = rows.find(r => r.id.startsWith('pixverse'))!;
    expect(v.category).toBe('text-to-video');
    expect(v.parameters).toBe(aimlapiVideoInputSchema);
    expect(rows.find(r => r.id === 'flux/schnell')!.supportsLora).toBe(false);
  });

  it('checkpoint list exposes supportsLora from catalog row', () => {
    const items = normalizeSchemaProviderItems('aimlapi', aimlapiCatalogRows([
      { id: 'blackforestlabs/flux-2-lora', type: 'openai/image-generations', tags: ['playground:image'], modalities: { output: ['image'] }, info: { name: 'Flux 2 LoRA' } },
    ]), { sourceUrl: 'https://api.aimlapi.com/v1/models' });
    expect(items).toHaveLength(1);
    expect(items[0].supportsLora).toBe(true);
  });

  it('image outputs from data[].url or b64_json', () => {
    expect(aimlapiImageOutputs({ data: [{ url: 'https://a' }, { b64_json: 'abc' }] })).toEqual([
      'https://a',
      'data:image/png;base64,abc',
    ]);
  });

  it('video outputs from video.url', () => {
    expect(aimlapiVideoOutputs({ status: 'completed', video: { url: 'https://v.mp4' } })).toEqual(['https://v.mp4']);
    expect(aimlapiVideoOutputs({ status: 'queued' })).toEqual([]);
  });

  it('LoRA schema declares path+scale; non-LoRA schema does not', () => {
    expect((aimlapiLoraImageInputSchema as any).properties.loras.maxItems).toBe(3);
    expect((aimlapiLoraImageInputSchema as any).properties.loras.items.properties.scale.maximum).toBe(4);
    expect((aimlapiImageInputSchema as any).properties.loras).toBeUndefined();
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

  it('aimlapiModelSupportsLora detects official LoRA model ids', () => {
    expect(aimlapiModelSupportsLora('alibaba/z-image-turbo-lora')).toBe(true);
    expect(aimlapiModelSupportsLora('blackforestlabs/flux-2-lora')).toBe(true);
    expect(aimlapiModelSupportsLora('flux/schnell')).toBe(false);
  });
});
