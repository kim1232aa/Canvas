import { describe, expect, it } from 'vitest';
import {
  checkpointMatchesCloudProvider,
  checkpointNodeTitle,
  friendlyProviderLabel,
  isNonComfyCloudProvider,
  ksamplerNodeTitle,
  PROVIDER_TITLE_LABEL,
  spatialFrameModelLabel,
} from './providerLabels';

describe('checkpointNodeTitle', () => {
  it('uses friendly labels — never raw GROK_COMPAT / OPENAI_COMPAT', () => {
    expect(checkpointNodeTitle('grok_compat')).toBe(`加载底模 (${PROVIDER_TITLE_LABEL.grok_compat})`);
    expect(checkpointNodeTitle('openai_compat')).toBe(`加载底模 (${PROVIDER_TITLE_LABEL.openai_compat})`);
    expect(checkpointNodeTitle('gemini')).toBe(`加载底模 (${PROVIDER_TITLE_LABEL.gemini})`);
    expect(checkpointNodeTitle('grok_compat')).not.toMatch(/GROK_COMPAT/);
    expect(checkpointNodeTitle('openai_compat')).not.toMatch(/OPENAI_COMPAT/);
  });

  it('tracks provider switch away from grok', () => {
    const stuck = checkpointNodeTitle('grok_compat');
    const after = checkpointNodeTitle('openai_compat');
    expect(stuck).toContain('Grok');
    expect(after).toContain('OpenAI');
    expect(after).not.toContain('Grok');
  });

  it('falls back to checkpoint short name when provider empty', () => {
    expect(checkpointNodeTitle('', 'foo/bar/baz')).toBe('加载底模 (baz)');
    expect(checkpointNodeTitle(undefined, undefined)).toBe('加载底模');
  });
});

describe('spatialFrameModelLabel / leftover Comfy under Gemini', () => {
  it('isNonComfyCloudProvider covers gemini/openai/grok', () => {
    expect(isNonComfyCloudProvider('gemini')).toBe(true);
    expect(isNonComfyCloudProvider('openai_compat')).toBe(true);
    expect(isNonComfyCloudProvider('grok_compat')).toBe(true);
    expect(isNonComfyCloudProvider('fal')).toBe(false);
    expect(isNonComfyCloudProvider('modelscope')).toBe(false);
  });

  it('rejects MODELSCOPE / FLUX leftovers when engine is Gemini', () => {
    expect(checkpointMatchesCloudProvider('gemini', 'Tongyi-MAI/Z-Image-Turbo')).toBe(false);
    expect(checkpointMatchesCloudProvider('gemini', 'black-forest-labs/FLUX.1-schnell')).toBe(false);
    expect(checkpointMatchesCloudProvider('gemini', 'fal-ai/flux/dev')).toBe(false);
    expect(checkpointMatchesCloudProvider('gemini', 'gemini-3.1-flash-image')).toBe(true);
    expect(spatialFrameModelLabel('gemini', 'Tongyi-MAI/Z-Image-Turbo')).toBe('未选择模型');
    expect(spatialFrameModelLabel('gemini', 'FLUX.1-schnell')).toBe('未选择模型');
    expect(spatialFrameModelLabel('gemini', 'gemini-3.1-flash-image')).toBe('gemini-3.1-flash-image');
    expect(spatialFrameModelLabel('gemini', '')).toBe('未选择模型');
  });

  it('friendlyProviderLabel never returns raw underscore ids for known houses', () => {
    expect(friendlyProviderLabel('tensorart')).toBe('Tensor.Art');
    expect(friendlyProviderLabel('fal')).toBe('Fal.ai');
    expect(friendlyProviderLabel('grok_compat')).toBe('Grok 兼容中转');
  });
});

describe('ksamplerNodeTitle — omit step advertising when steps unsupported', () => {
  it('strips N 步 / 极速 when steps unsupported', () => {
    expect(ksamplerNodeTitle('KSampler (8 步极速)', true)).toBe('KSampler');
    expect(ksamplerNodeTitle('KSampler (8 步极速采样)', true)).toBe('KSampler');
    expect(ksamplerNodeTitle('KSampler 采样器 (FLUX Schnell 极速 4 步)', true)).not.toMatch(/\d+\s*步/);
    expect(ksamplerNodeTitle('KSampler 采样器 (FLUX Schnell 极速 4 步)', true)).not.toMatch(/极速/);
    expect(ksamplerNodeTitle('KSampler (10 步极速)', true)).toBe('KSampler');
  });

  it('keeps title unchanged when steps are supported', () => {
    expect(ksamplerNodeTitle('KSampler (8 步极速)', false)).toBe('KSampler (8 步极速)');
    expect(ksamplerNodeTitle('KSampler (Fal 极速采样)', false)).toBe('KSampler (Fal 极速采样)');
  });

  it('keeps non-step titles even when steps unsupported', () => {
    expect(ksamplerNodeTitle('KSampler (Tensor.Art 调度)', true)).toBe('KSampler (Tensor.Art 调度)');
    expect(ksamplerNodeTitle('KSampler', true)).toBe('KSampler');
  });
});
