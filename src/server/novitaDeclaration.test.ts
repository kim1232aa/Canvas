import { describe, it, expect } from 'vitest';
import { loadProviderDeclaration, novitaLoras } from './schemaProviders';
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
  it('no declaration for video → null (block stays)', () => {
    expect(loadProviderDeclaration('novita', '/v3/async/txt2video')).toBeNull();
  });
  it('strength outside [0,1] blocks locally, no clamping', () => {
    expect(() => novitaLoras([{ name: 'x', strength: 1.2 }])).toThrow(/超出官方范围 \[0, 1\]/);
    expect(novitaLoras([{ name: 'x', strength: 0.85 }])).toEqual([{ model_name: 'x', strength: 0.85 }]);
  });
});
