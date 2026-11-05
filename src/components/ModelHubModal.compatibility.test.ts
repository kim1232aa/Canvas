import { describe, expect, it } from 'vitest';
import { checkHubLoraCompatibility, detectModelArchitecture } from './ModelHubModal';

describe('ModelHubModal LoRA Architecture Compatibility Checking', () => {
  describe('detectModelArchitecture', () => {
    it('identifies Qwen architecture', () => {
      expect(detectModelArchitecture('Comfy-Org/Qwen-Image-2.1')).toBe('qwen');
      expect(detectModelArchitecture('qwen-image')).toBe('qwen');
    });

    it('identifies Z-Image architecture', () => {
      expect(detectModelArchitecture('renderartist/Technically-Color-Z-Image-Turbo')).toBe('z-image');
      expect(detectModelArchitecture('Z-Image')).toBe('z-image');
      expect(detectModelArchitecture('z_image')).toBe('z-image');
    });

    it('identifies FLUX.1 architecture', () => {
      expect(detectModelArchitecture('black-forest-labs/FLUX.1-schnell')).toBe('flux');
      expect(detectModelArchitecture('image/bfl/flux-1-dev')).toBe('flux');
      expect(detectModelArchitecture('FLUX.1 [dev]')).toBe('flux');
    });

    it('identifies SD 1.5 architecture', () => {
      expect(detectModelArchitecture('meinahentai_v4_70340.safetensors')).toBe('sd15');
      expect(detectModelArchitecture('SD 1.5')).toBe('sd15');
      expect(detectModelArchitecture('dreamshaper_8_93211.safetensors')).toBe('sd15');
    });

    it('identifies SDXL and Wan architectures', () => {
      expect(detectModelArchitecture('SDXL 1.0')).toBe('sdxl');
      expect(detectModelArchitecture('Wan 2.1 (视频)')).toBe('wan');
    });
  });

  describe('checkHubLoraCompatibility', () => {
    it('detects cross-architecture mismatch between Qwen base and Z-Image LoRA', () => {
      const res = checkHubLoraCompatibility(
        'Comfy-Org/Qwen-Image-2.1',
        'Z-Image',
        'renderartist/Technically-Color-Z-Image-Turbo'
      );
      expect(res.compatible).toBe(false);
      expect(res.isMismatch).toBe(true);
      expect(res.ckptArch).toBe('qwen');
      expect(res.loraArch).toBe('z-image');
      expect(res.chipLabel).toContain('架构不兼容');
      expect(res.chipLabel).toContain('Z-Image ≠ qwen');
    });

    it('confirms compatibility for Krea Flux.1 Dev + h0lyvi3v2 (flux style)', () => {
      const res = checkHubLoraCompatibility('image/bfl/flux-1-dev', 'flux_dev', 'h0lyvi3v2');
      expect(res.compatible).toBe(true);
      expect(res.isMismatch).toBe(false);
      expect(res.chipLabel).toBe('兼容 flux_dev');
    });

    it('confirms compatibility for Novita V4 (SD 1.5) + weight_slider_v2 (SD 1.5)', () => {
      const res = checkHubLoraCompatibility(
        'meinahentai_v4_70340.safetensors',
        'SD 1.5',
        'weight_slider_v2_91681'
      );
      expect(res.compatible).toBe(true);
      expect(res.isMismatch).toBe(false);
      expect(res.chipLabel).toBe('兼容 SD 1.5');
    });

    it('confirms compatibility for FLUX base + FLUX LoRA', () => {
      const res = checkHubLoraCompatibility(
        'black-forest-labs/FLUX.1-schnell',
        'FLUX.1',
        'nerogar/lora/watercolor.safetensors'
      );
      expect(res.compatible).toBe(true);
      expect(res.isMismatch).toBe(false);
      expect(res.chipLabel).toBe('兼容 FLUX.1');
    });

    it('handles missing currentCheckpoint gracefully', () => {
      const res = checkHubLoraCompatibility(undefined, 'FLUX.1', 'flux-lora');
      expect(res.compatible).toBe(true);
      expect(res.isMismatch).toBe(false);
      expect(res.chipLabel).toBe('FLUX.1');
    });
  });
});
