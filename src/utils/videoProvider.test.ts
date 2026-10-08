import { describe, it, expect } from 'vitest';
import {
  applyAIVideoModelSelection,
  assertAIVideoProviderReady,
  resolveAIVideoModelProvider,
} from './videoProvider';

describe('F4 / soft-visual-4 videoProvider — model select syncs provider; empty clears; mismatch friendly', () => {
  it('resolveAIVideoModelProvider reads provider from AIVideoNode schema options', () => {
    expect(resolveAIVideoModelProvider('fal-ai/wan-t2v')).toBe('fal');
    expect(resolveAIVideoModelProvider('fal-ai/wan/v2.7/text-to-video')).toBe('fal');
    expect(resolveAIVideoModelProvider('text2video_wan27')).toBeUndefined();
    expect(()=>assertAIVideoProviderReady('text2video_wan27','tensorart')).toThrow(/工具不是视频模型/);
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
      { model: 'fal-ai/wan-t2v', targetProvider: 'fal', provider: 'fal' },
      'agnes-video-2.5-flash'
    );
    expect(next.model).toBe('agnes-video-2.5-flash');
    expect(next.targetProvider).toBe('agnes');
    expect(next.provider).toBe('agnes');
  });

  it('applyAIVideoModelSelection clears provider when model is emptied (no leftover Fal)', () => {
    const next = applyAIVideoModelSelection(
      { model: 'fal-ai/wan-t2v', targetProvider: 'fal', provider: 'fal', prompt: 'keep' },
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
    expect(() => assertAIVideoProviderReady('fal-ai/wan-t2v', '')).toThrow(/视频服务商|不会回退到 Fal/);
    expect(() => assertAIVideoProviderReady('fal-ai/wan-t2v', undefined)).toThrow(/视频服务商/);
    expect(() => assertAIVideoProviderReady('fal-ai/wan-t2v', '   ')).toThrow(/视频服务商/);
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
    expect(assertAIVideoProviderReady('fal-ai/wan-t2v', 'fal')).toBe('fal');
    expect(assertAIVideoProviderReady('fal-ai/ltx-video', 'fal')).toBe('fal');
  });

  it('assertAIVideoProviderReady accepts custom model with explicit non-empty provider', () => {
    expect(assertAIVideoProviderReady('my-custom-endpoint', 'nanogpt')).toBe('nanogpt');
  });
});