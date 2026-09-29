import { describe, it, expect } from 'vitest';
import { getSpatialFrameLoraBanner } from '../utils/spatialFrameLoraBanner';
import { validateModelCompatibility } from '../utils/baseModelMatcher';
import { isLoraUnsupportedOnEndpoint } from '../utils/resolveCheckpoint';

const fluxLora = {
  name: '[Flux1] Asian Mix Lora - Krea/Dev.safetensors',
  baseModel: 'Flux.1 D',
  modelStrength: 0.8,
};

describe('SpatialFrameItem LoRA visible copy (same sentences as node/inspector)', () => {
  it('ModelScope Z-Image + Flux LoRA mismatch: frame banner includes full compat.message', () => {
    const banner = getSpatialFrameLoraBanner(
      'modelscope_ai',
      'Tongyi-MAI/Z-Image-Turbo',
      [fluxLora]
    );
    expect(banner).not.toBeNull();
    expect(banner!.kind).toBe('mismatch');
    expect(banner!.title).toBe('LoRA 架构与底模不匹配');

    const compat = validateModelCompatibility(
      'Tongyi-MAI/Z-Image-Turbo',
      fluxLora.baseModel,
      fluxLora.name,
      'modelscope_ai'
    );
    expect(banner!.message).toBe(compat.message);
    expect(banner!.message).toMatch(/底模架构不匹配/);
    expect(banner!.message).toMatch(/Z-Image-Turbo/);
    expect(banner!.message).toMatch(/Flux\.1 D|FLUX/);
    expect(banner!.message).toMatch(/请自行选择/);
    expect(banner!.message).toMatch(/保留现有 LoRA \/ seed/);
    expect(banner!.message).toMatch(/负向与采样器按导入原样/);
    expect(banner!.message).toMatch(/空或「未指定」都算原样/);
    expect(banner!.message).not.toMatch(/已保留当前 LoRA \/ 负向 \/ seed/);
    expect(banner!.message).not.toMatch(/已保留负向/);
    // Must be body text candidate — not the short chip alone
    expect(banner!.message.length).toBeGreaterThan(20);
  });

  it('Fal empty checkpoint: frame banner includes fuller unsupported sentence, not only 4-char chip', () => {
    const banner = getSpatialFrameLoraBanner('fal', '', [fluxLora]);
    expect(banner).not.toBeNull();
    expect(banner!.kind).toBe('unsupported');
    expect(banner!.title).toBe('该服务商不支持');

    const endpoint = isLoraUnsupportedOnEndpoint('fal', '');
    expect(endpoint.unsupported).toBe(true);
    expect(banner!.message).toBe(endpoint.message);
    expect(banner!.message).toBe(
      '该服务商不支持（未选择具体模型 / checkpoint，无法确认 LoRA 支持）'
    );
    expect(banner!.message.length).toBeGreaterThan('该服务商不支持'.length);
  });

  it('fal-ai/flux-lora stays usable (no unsupported banner); flux/dev stays grey unsupported', () => {
    const usable = getSpatialFrameLoraBanner('fal', 'fal-ai/flux-lora', [fluxLora]);
    expect(usable === null || usable.kind !== 'unsupported').toBe(true);

    const greyDev = getSpatialFrameLoraBanner('fal', 'fal-ai/flux/dev', [fluxLora]);
    expect(greyDev?.kind).toBe('unsupported');
    expect(greyDev?.message).toMatch(/该服务商不支持/);

    const greySchnell = getSpatialFrameLoraBanner('fal', 'fal-ai/flux/schnell', [fluxLora]);
    expect(greySchnell?.kind).toBe('unsupported');
    expect(greySchnell?.message).toMatch(/该服务商不支持/);
  });

  it('returns null when no loras', () => {
    expect(getSpatialFrameLoraBanner('fal', '', [])).toBeNull();
  });
});
