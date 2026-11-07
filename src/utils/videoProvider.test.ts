import { describe, it, expect } from 'vitest';
import { NODE_DEFINITIONS } from '../constants/nodes';
import { AI_VIDEO_ASPECT_RATIOS, AI_VIDEO_MODEL_REGISTRY } from '../constants/videoModels';
import {
  applyAIVideoModelSelection,
  aspectRatioForVideoRequest,
  assertAIVideoProviderReady,
  resolveAIVideoModelProvider,
} from './videoProvider';

describe('F4 / soft-visual-4 videoProvider — model select syncs provider; empty clears; mismatch friendly', () => {
  it('resolveAIVideoModelProvider reads provider from AIVideoNode schema options', () => {
    expect(resolveAIVideoModelProvider('fal-ai/wan/v2.2-a14b/text-to-video/lora')).toBe('fal');
    expect(resolveAIVideoModelProvider('fal-ai/wan/v2.7/text-to-video')).toBe('fal');
    expect(resolveAIVideoModelProvider('text2video_wan27')).toBeUndefined();
    expect(()=>assertAIVideoProviderReady('text2video_wan27','tensorart')).toThrow(/OpenWorks 视频模型请在模型中心选择「Tensor.Art OpenWorks」服务商[\s\S]*不会回退到 Fal/);
    expect(resolveAIVideoModelProvider('agnes-video-2.5-flash')).toBe('agnes');
    expect(resolveAIVideoModelProvider('grok-imagine-video')).toBe('grok_compat');
    expect(resolveAIVideoModelProvider('custom-unknown-endpoint')).toBeUndefined();
    expect(resolveAIVideoModelProvider('')).toBeUndefined();
  });

  it('applyAIVideoModelSelection atomically sets model + targetProvider + provider', () => {
    const next = applyAIVideoModelSelection(
      { targetProvider: '', prompt: 'keep me' },
      'agnes-video-2.5-flash'
    );
    expect(next.model).toBe('agnes-video-2.5-flash');
    expect(next.targetProvider).toBe('agnes');
    expect(next.provider).toBe('agnes');
    expect(next.prompt).toBe('keep me');
  });

  it('applyAIVideoModelSelection switching Fal → Agnes updates provider atomically', () => {
    const next = applyAIVideoModelSelection(
      { model: 'fal-ai/wan/v2.2-a14b/text-to-video/lora', targetProvider: 'fal', provider: 'fal' },
      'agnes-video-2.5-flash'
    );
    expect(next.model).toBe('agnes-video-2.5-flash');
    expect(next.targetProvider).toBe('agnes');
    expect(next.provider).toBe('agnes');
  });

  it('applyAIVideoModelSelection clears provider when model is emptied (no leftover Fal)', () => {
    const next = applyAIVideoModelSelection(
      { model: 'fal-ai/wan/v2.2-a14b/text-to-video/lora', targetProvider: 'fal', provider: 'fal', prompt: 'keep' },
      ''
    );
    expect(next.model).toBe('');
    expect(next.targetProvider).toBe('');
    expect(next.provider).toBe('');
    expect(next.prompt).toBe('keep');
  });

  it('applyAIVideoModelSelection clears provider on whitespace-only model', () => {
    const next = applyAIVideoModelSelection(
      { model: 'text2video_wan27', targetProvider: 'tensorart', provider: 'tensorart' },
      '   '
    );
    expect(next.targetProvider).toBe('');
    expect(next.provider).toBe('');
  });

  it('applyAIVideoModelSelection does not invent provider for unknown custom model', () => {
    const next = applyAIVideoModelSelection(
      { targetProvider: 'fal', provider: 'fal' },
      'my-custom-video-endpoint'
    );
    expect(next.model).toBe('my-custom-video-endpoint');
    // leave existing provider as-is when schema has no option provider (non-empty model)
    expect(next.targetProvider).toBe('fal');
    expect(next.provider).toBe('fal');
  });

  it('assertAIVideoProviderReady rejects empty provider', () => {
    expect(() => assertAIVideoProviderReady('fal-ai/wan/v2.2-a14b/text-to-video/lora', '')).toThrow(/视频服务商|不会回退到 Fal/);
    expect(() => assertAIVideoProviderReady('fal-ai/wan/v2.2-a14b/text-to-video/lora', undefined)).toThrow(/视频服务商/);
    expect(() => assertAIVideoProviderReady('fal-ai/wan/v2.2-a14b/text-to-video/lora', '   ')).toThrow(/视频服务商/);
  });

  it('assertAIVideoProviderReady rejects schema mismatch with friendly Chinese only', () => {
    expect(() => assertAIVideoProviderReady('agnes-video-2.5-flash', 'fal')).toThrow(/服务商不一致/);
    try {
      assertAIVideoProviderReady('agnes-video-2.5-flash', 'fal');
      expect.unreachable('should throw');
    } catch (e: any) {
      const msg = String(e.message);
      expect(msg).not.toMatch(/targetProvider/);
      expect(msg).toMatch(/Agnes/);
      expect(msg).toMatch(/Fal\.ai/);
      expect(msg).toMatch(/不会回退到 Fal/);
      // raw underscore / lowercase provider ids must not appear as the house name
      expect(msg).not.toMatch(/属于\s*agnes/);
      expect(msg).not.toMatch(/当前选的是\s*fal[^.]/);
    }
  });

  it('assertAIVideoProviderReady accepts explicit Fal when model is Fal', () => {
    expect(assertAIVideoProviderReady('fal-ai/wan/v2.2-a14b/text-to-video/lora', 'fal')).toBe('fal');
    expect(assertAIVideoProviderReady('fal-ai/ltx-video', 'fal')).toBe('fal');
  });

  it('assertAIVideoProviderReady accepts custom model with explicit non-empty provider', () => {
    expect(assertAIVideoProviderReady('my-custom-endpoint', 'nanogpt')).toBe('nanogpt');
  });

  it('every video provider option has a real model, and no empty or Wan 2.1 option is shipped', () => {
    const def = NODE_DEFINITIONS.AIVideoNode;
    const providers = def.widgets.find((w) => w.name === 'targetProvider')!.options!.map((o) => String(o.value)).filter(Boolean);
    const models = def.widgets.find((w) => w.name === 'model')!.options!;
    const aspects = def.widgets.find((w) => w.name === 'aspect_ratio')!.options!;
    for (const provider of providers) {
      expect(models.some((o) => o.provider === provider && String(o.value).trim()), provider).toBe(true);
    }
    expect(models.filter((o) => String(o.value).trim()).every((o) => providers.includes(String(o.provider)))).toBe(true);
    expect(models.some((o) => o.value === '')).toBe(true);
    expect(models.filter((o) => o.value !== '').every((o) => String(o.value).trim() && String(o.description).startsWith('https://'))).toBe(true);
    expect(JSON.stringify(models)).not.toMatch(/wan-?2\.1|Wan 2\.1|v2\.1/i);
    expect(aspects.map((o) => o.value).filter(Boolean)).toEqual([...AI_VIDEO_ASPECT_RATIOS]);
    expect(AI_VIDEO_MODEL_REGISTRY.every((entry) => entry.sourceUrl.startsWith('https://'))).toBe(true);
  });

  it('sends aspect_ratio only when the loaded schema or the official registry declares it', () => {
    expect(aspectRatioForVideoRequest('agnes-video-2.5', '16:9')).toBe('16:9');
    expect(aspectRatioForVideoRequest('wavespeed-ai/wan-2.2/t2v-720p-lora', '16:9')).toBeUndefined();
    expect(aspectRatioForVideoRequest('fal-ai/minimax/video-01', '16:9', { loaded: true, declaresAspectRatio: true })).toBe('16:9');
    expect(aspectRatioForVideoRequest('agnes-video-2.5', '16:9', { loaded: true, declaresAspectRatio: false })).toBeUndefined();
    expect(aspectRatioForVideoRequest('my-custom-endpoint', '21:9')).toBe('21:9');
    expect(aspectRatioForVideoRequest('agnes-video-2.5', '  ')).toBeUndefined();
  });
});