import { describe, it, expect } from 'vitest';
import {
  PRESET_MODEL_VERIFICATIONS,
  isLegacyPresetRecommendation,
  getPresetModelVerification,
} from './presetModelSelection';

describe('presetModelSelection helper', () => {
  it('covers all 34 presets in PRESET_MODEL_VERIFICATIONS', () => {
    const keys = Object.keys(PRESET_MODEL_VERIFICATIONS);
    expect(keys.length).toBe(34);
    for (const key of keys) {
      const v = PRESET_MODEL_VERIFICATIONS[key];
      expect(v.presetId).toBe(key);
      expect(v.provider).toBeTruthy();
      expect(v.verificationDate).toBe('2026-11-06');
      expect(v.officialSource).toBeTruthy();
      expect(['verified_current', 'needs_selection']).toContain(v.status);
    }
  });

  it('identifies obsolete models that must not be recommended in built-in presets', () => {
    expect(isLegacyPresetRecommendation('dreamshaper_8_93211.safetensors')).toBe(true);
    expect(isLegacyPresetRecommendation('SVD-XT')).toBe(true);
    expect(isLegacyPresetRecommendation('flux-schnell')).toBe(true);
    expect(isLegacyPresetRecommendation('fal-ai/flux-lora')).toBe(true);
    expect(isLegacyPresetRecommendation('wavespeed-ai/flux-dev-lora')).toBe(true);
    expect(isLegacyPresetRecommendation('fal-ai/wan-t2v')).toBe(true);
  });

  it('does not flag verified current models as legacy', () => {
    expect(isLegacyPresetRecommendation('moss-image')).toBe(false);
    expect(isLegacyPresetRecommendation('fal-ai/krea-2/turbo/lora')).toBe(false);
    expect(isLegacyPresetRecommendation('renderartist/Technically-Color-Z-Image-Turbo')).toBe(false);
    expect(isLegacyPresetRecommendation('black-forest-labs/FLUX-2-klein-9b')).toBe(false);
    expect(isLegacyPresetRecommendation('fal-ai/kling-video/v3/standard/text-to-video')).toBe(false);
    expect(isLegacyPresetRecommendation('fal-ai/kling-video/v3/standard/image-to-video')).toBe(false);
  });

  it('retrieves verification metadata by preset id', () => {
    const v = getPresetModelVerification('std-nanogpt-t2i');
    expect(v).toBeDefined();
    expect(v?.model).toBe('moss-image');
    expect(v?.status).toBe('verified_current');
  });
});
