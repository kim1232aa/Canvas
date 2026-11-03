import { describe, it, expect } from 'vitest';
import { loadProviderDeclaration, novitaLoras, novitaImg2VideoDedicatedModels } from './schemaProviders';
describe('Novita HTML declaration (config data)', () => {
  it('loads txt2img declaration with model_name + per-field source + fetch date', () => {
    const d = loadProviderDeclaration('novita', '/v3/async/txt2img');
    expect(d).toBeTruthy();
    expect(d.inputSchema.properties.model_name).toBeTruthy();
    expect(Object.values(d.inputSchema.properties).every((f: any) => f['x-liveConfirmed'] === false)).toBe(true);
    for (const k of ['model_name','prompt','seed','steps','guidance_scale','sampler_name','loras']) {
      expect(d.inputSchema.properties[k]['x-source']).toMatch(/^https:\/\//);
      expect(d.inputSchema.properties[k]['x-fetchedAt']).toBe('2026-10-16');
      expect(String(d.inputSchema.properties[k].description || '')).not.toContain('待确认');
    }
    expect(JSON.stringify(d.inputSchema.properties.loras)).toContain('搜索快照，原页 404');
  });
  it('no declaration for txt2video → null (checkpoint video path stays blocked)', () => {
    expect(loadProviderDeclaration('novita', '/v3/async/txt2video')).toBeNull();
  });
  it('loads img2video declaration for dedicated SVD models (not /v3/model checkpoints)', () => {
    const d = loadProviderDeclaration('novita', '/v3/async/img2video');
    expect(d).toBeTruthy();
    expect(d.endpointPath).toBe('/v3/async/img2video');
    expect(d.requestWrapper).toBeNull();
    expect(novitaImg2VideoDedicatedModels(d)).toEqual(['SVD-XT', 'SVD']);
    expect(d.inputSchema.properties.model_name.enum).toEqual(['SVD-XT', 'SVD']);
    for (const k of ['model_name', 'image_file', 'frames_num', 'frames_per_second', 'seed', 'steps', 'image_file_resize_mode']) {
      expect(d.inputSchema.properties[k], k).toBeTruthy();
      expect(d.inputSchema.properties[k]['x-source']).toMatch(/^https:\/\//);
      expect(d.inputSchema.properties[k]['x-fetchedAt']).toBe('2026-11-03');
      expect(d.inputSchema.properties[k]['x-liveConfirmed']).toBe(false);
    }
    expect(d.sources.some((s: string) => s.includes('javascript-sdk'))).toBe(true);
  });
  it.skip('strength outside [0,1] blocks locally, no clamping', () => {
    expect(() => novitaLoras([{ name: 'x', strength: 1.2 }])).toThrow(/超出官方范围 \[0, 1\]/);
    expect(novitaLoras([{ name: 'x', strength: 0.85 }])).toEqual([{ model_name: 'x', strength: 0.85 }]);
  });
});
