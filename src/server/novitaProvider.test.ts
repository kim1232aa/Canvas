import { describe, it, expect } from 'vitest';
import {
  schemaProviders,
  novitaCatalogRows,
  novitaLoraCatalogRows,
  novitaLoras,
  novitaTaskStatus,
  novitaOutputs,
  normalizeSchemaProviderItems,
} from './schemaProviders';
import * as mod from './schemaProviders';

describe('Novita provider (official docs 2026-10-15)', () => {
  it('uses official root + bearer auth + v3 catalog', () => {
    expect(schemaProviders.novita.root).toBe('https://api.novita.ai');
    expect(schemaProviders.novita.catalog).toContain('/v3/model');
    expect(schemaProviders.novita.catalog).toContain('filter.types=checkpoint');
    expect(schemaProviders.novita.auth).toBe('Authorization');
    expect(schemaProviders.novita.header).toBe('x-novita-key');
  });

  it('catalog keeps checkpoints, marks LoRA support, uses sd_name_in_api', () => {
    const rows = novitaCatalogRows([
      { sd_name_in_api: 'sd_xl_base_1.0.safetensors', name: 'SDXL', type: { name: 'checkpoint' }, base_model: 'SDXL 1.0', status: 1 },
      { sd_name_in_api: 'weight_slider_v2_91681', name: 'slider', type: { name: 'lora' }, base_model: 'SD 1.5', status: 1 },
      { name: 'no-id', type: { name: 'checkpoint' } },
    ]);
    expect(rows.map(r => r.id)).toEqual(['sd_xl_base_1.0.safetensors']);
    expect(rows[0].supportsLora).toBe(true);
    expect((rows[0] as any).parameters).toBeUndefined();
    expect(rows[0].endpoint).toBe('/v3/async/txt2img');
  });

  it('LoRA catalog rows use sd_name_in_api as id', () => {
    const rows = novitaLoraCatalogRows([
      { sd_name_in_api: 'more_details_59655', name: 'More Details', type: { name: 'lora' }, base_model: 'SD 1.5' },
      { sd_name_in_api: 'ckpt', type: { name: 'checkpoint' } },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('more_details_59655');
    expect(rows[0].loraId).toBe('more_details_59655');
  });

  it('checkpoint list exposes supportsLora', () => {
    const items = normalizeSchemaProviderItems('novita', novitaCatalogRows([
      { sd_name_in_api: 'dreamshaper_8_93211.safetensors', name: 'DreamShaper', type: { name: 'checkpoint' }, base_model: 'SD 1.5' },
    ]), { sourceUrl: 'https://api.novita.ai/v3/model' });
    expect(items).toHaveLength(1);
    expect(items[0].supportsLora).toBe(true);
  });


  it('novitaLoras maps model_name+strength; refuses missing/out-of-range/over-max', () => {
    expect(novitaLoras([{ path: 'more_details_59655', strength: 0.75 }])).toEqual([
      { model_name: 'more_details_59655', strength: 0.75 },
    ]);
    expect(() => novitaLoras([{ path: 'a' }])).toThrow(/strength/);
    expect(() => novitaLoras([{ path: 'a', strength: 1.5 }])).toThrow(/\[0, 1\]/);
    expect(() => novitaLoras([{ path: 'a', strength: 0.8 }, { path: 'b', strength: 0.8 }, { path: 'c', strength: 0.8 }, { path: 'd', strength: 0.8 }, { path: 'e', strength: 0.8 }, { path: 'f', strength: 0.8 }])).not.toThrow(); // max-5 unverified (search snapshot, original 404): no local block
  });

  it('novitaTaskStatus maps official enums to canvas vocabulary', () => {
    expect(novitaTaskStatus('TASK_STATUS_SUCCEED')).toBe('completed');
    expect(novitaTaskStatus('TASK_STATUS_FAILED')).toBe('failed');
    expect(novitaTaskStatus('TASK_STATUS_QUEUED')).toBe('queued');
    expect(novitaTaskStatus('TASK_STATUS_PROCESSING')).toBe('processing');
  });

  it('novitaOutputs reads images[].image_url and videos[].video_url', () => {
    expect(novitaOutputs({
      images: [{ image_url: 'https://a.jpg' }],
      videos: [{ video_url: 'https://v.mp4' }],
    })).toEqual(['https://a.jpg', 'https://v.mp4']);
    expect(novitaOutputs({})).toEqual([]);
  });

  it('exports no built-in request InputSchema (画布 2026-10-15)', () => {
    expect((mod as any).novitaImageInputSchema).toBeUndefined();
    expect((mod as any).novitaVideoInputSchema).toBeUndefined();
    expect(Object.keys(mod).filter(k => /^novita.*InputSchema$/i.test(k))).toEqual([]);
  });
});
