import { describe, expect, it } from 'vitest';
import { falVideoImageField, isKlingV3, klingV3Duration } from './falVideoContract';
import { getFieldSpec, valueStatus } from '../schemas/providerSchema';

const V3_I2V = 'fal-ai/kling-video/v3/standard/image-to-video';
const V3_T2V = 'fal-ai/kling-video/v3/standard/text-to-video';
const V1_I2V = 'fal-ai/kling-video/v1/standard/image-to-video';

describe('Fal Kling V3 official contract', () => {
  it('only V3 endpoints are Kling V3', () => {
    expect(isKlingV3(V3_I2V)).toBe(true);
    expect(isKlingV3(V3_T2V)).toBe(true);
    expect(isKlingV3(V1_I2V)).toBe(false);
    expect(isKlingV3('fal-ai/wan-i2v')).toBe(false);
  });

  it('reference image field: V3 image-to-video uses start_image_url, V1 keeps image_url', () => {
    expect(falVideoImageField(V3_I2V)).toBe('start_image_url');
    expect(falVideoImageField(V1_I2V)).toBe('image_url');
    expect(falVideoImageField('fal-ai/wan-i2v')).toBe('image_url');
  });

  it('V3 duration is a string enum "3".."15"', () => {
    expect(klingV3Duration(5)).toBe('5');
    expect(klingV3Duration('12')).toBe('12');
    expect(klingV3Duration(3)).toBe('3');
    expect(klingV3Duration(15)).toBe('15');
    expect(() => klingV3Duration(2)).toThrow(/3–15/);
    expect(() => klingV3Duration(16)).toThrow(/3–15/);
    expect(() => klingV3Duration(4.5)).toThrow(/3–15/);
    expect(() => klingV3Duration('abc')).toThrow(/3–15/);
  });

  it('schema table has V3 entries: cfg_scale wire, negative_prompt supported, no local block', () => {
    for (const id of [V3_I2V, V3_T2V]) {
      expect(getFieldSpec('fal', id, 'cfg')?.status, id).toBe('supported');
      expect(getFieldSpec('fal', id, 'cfg')?.wire, id).toBe('cfg_scale');
      expect(getFieldSpec('fal', id, 'negative_prompt')?.status, id).toBe('supported');
    }
  });

  it('V3 text-to-video aspect_ratio is the official 16:9 / 9:16 / 1:1 enum', () => {
    expect(valueStatus('fal', V3_T2V, 'aspect_ratio', '16:9')).toBe('supported');
    expect(valueStatus('fal', V3_T2V, 'aspect_ratio', '1:1')).toBe('supported');
    expect(valueStatus('fal', V3_T2V, 'aspect_ratio', '4:3')).toBe('unsupported');
  });

  it('V3 image-to-video has no official aspect_ratio field', () => {
    expect(getFieldSpec('fal', V3_I2V, 'aspect_ratio')?.status).toBe('unsupported');
  });
});
