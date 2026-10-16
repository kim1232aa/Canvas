import { describe, expect, it } from 'vitest';
import { applyModelSpecConstraints } from './schemaProviders';

// Shape from live https://api.venice.ai/api/v1/swagger.yaml GenerateImageRequest (2026-10-15) — subset.
const base = { type: 'object', properties: {
  prompt: { type: 'string' }, width: { type: 'integer', maximum: 1280 }, height: { type: 'integer', maximum: 1280 },
  aspect_ratio: { type: 'string' }, resolution: { type: 'string' }, quality: { type: 'string', enum: ['low', 'medium', 'high'] },
  format: { type: 'string', enum: ['jpeg', 'png', 'webp'], default: 'webp' }, steps: { type: 'integer' },
} };

describe('per-model sizing from catalog constraints (generic, no model names)', () => {
  it('pixel model (live venice-sd35 constraints): keeps width/height, drops aspect_ratio/resolution/quality, keeps format enum', () => {
    const o = applyModelSpecConstraints(base, { promptCharacterLimit: 1500, steps: { default: 25, max: 30 }, widthHeightDivisor: 16 });
    expect(Object.keys(o.properties).sort()).toEqual(['format', 'height', 'prompt', 'steps', 'width']);
    expect(o.properties.format.enum).toEqual(['jpeg', 'png', 'webp']);
    expect(o['x-modelSpecOmitted'].aspect_ratio).toContain('像素模型');
  });
  it('ratio model w/o tiers (live qwen-image-2 constraints): drops width/height/resolution/quality, aspect_ratio enum + default', () => {
    const ar = ['1:1', '3:2', '16:9', '21:9', '9:16', '2:3', '3:4', '4:5'];
    const o = applyModelSpecConstraints(base, { aspectRatios: ar, defaultAspectRatio: '1:1', widthHeightDivisor: 1, steps: { default: 20, max: 50 } });
    expect(o.properties.width).toBeUndefined(); expect(o.properties.height).toBeUndefined();
    expect(o.properties.resolution).toBeUndefined(); expect(o.properties.quality).toBeUndefined();
    expect(o.properties.aspect_ratio).toMatchObject({ enum: ar, default: '1:1' });
    expect(o.properties.format.enum).toEqual(['jpeg', 'png', 'webp']);
  });
  it('ratio + resolution tiers + qualities (live gpt-image-2 constraints)', () => {
    const o = applyModelSpecConstraints(base, { aspectRatios: ['1:1'], resolutions: ['1K', '2K', '4K'], defaultResolution: '1K', qualities: ['low', 'medium', 'high'], widthHeightDivisor: 1 });
    expect(o.properties.resolution).toMatchObject({ enum: ['1K', '2K', '4K'], default: '1K' });
    expect(o.properties.quality.enum).toEqual(['low', 'medium', 'high']);
    expect(o.properties.width).toBeUndefined();
  });
  it('no constraints → schema untouched (never invents)', () => {
    expect(applyModelSpecConstraints(base, undefined)).toBe(base);
  });
});
