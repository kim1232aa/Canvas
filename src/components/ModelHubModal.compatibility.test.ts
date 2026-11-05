import { describe, expect, it } from 'vitest';
import { checkHubLoraCompatibility, normalizeArchitectureFamily } from './ModelHubModal';

describe('ModelHubModal LoRA Architecture Compatibility Checking', () => {
  describe('normalizeArchitectureFamily (strict metadata-driven normalization)', () => {
    it('normalizes official FLUX.1 architecture metadata distinctly from FLUX.2', () => {
      expect(normalizeArchitectureFamily('FLUX.1')).toBe('flux-1');
      expect(normalizeArchitectureFamily('Flux.1 D')).toBe('flux-1');
      expect(normalizeArchitectureFamily('Flux.1 S')).toBe('flux-1');
      expect(normalizeArchitectureFamily('flux_dev')).toBe('flux-1');
      expect(normalizeArchitectureFamily('flux_schnell')).toBe('flux-1');
      expect(normalizeArchitectureFamily('FLUX.1 [dev]')).toBe('flux-1');
      expect(normalizeArchitectureFamily('black-forest-labs/FLUX.1-dev')).toBe('flux-1');
      expect(normalizeArchitectureFamily('black-forest-labs/FLUX.1-schnell')).toBe('flux-1');

      // FLUX.2 is a distinct architecture family, NOT collapsed into FLUX.1
      expect(normalizeArchitectureFamily('FLUX.2')).toBe('flux-2');
      expect(normalizeArchitectureFamily('Flux.2 D')).toBe('flux-2');
      expect(normalizeArchitectureFamily('Flux.2 Klein 9B')).toBe('flux-2');
      expect(normalizeArchitectureFamily('black-forest-labs/FLUX.2-klein-base-9B')).toBe('flux-2');

      // bfl is a vendor path segment, NOT an architecture
      expect(normalizeArchitectureFamily('bfl')).toBe('unknown');

      // Generic versionless 'flux' cannot determine version compatibility
      expect(normalizeArchitectureFamily('flux')).toBe('unknown');
    });

    it('normalizes official SDXL architecture metadata', () => {
      expect(normalizeArchitectureFamily('SDXL 1.0')).toBe('sdxl');
      expect(normalizeArchitectureFamily('sdxl')).toBe('sdxl');
      expect(normalizeArchitectureFamily('stable-diffusion-xl')).toBe('sdxl');
    });

    it('normalizes official SD 1.5 architecture metadata', () => {
      expect(normalizeArchitectureFamily('SD 1.5')).toBe('sd15');
      expect(normalizeArchitectureFamily('sd1.5')).toBe('sd15');
      expect(normalizeArchitectureFamily('stable-diffusion-v1-5')).toBe('sd15');
    });

    it('normalizes official Qwen and Z-Image architecture metadata', () => {
      expect(normalizeArchitectureFamily('Qwen-Image')).toBe('qwen');
      expect(normalizeArchitectureFamily('Qwen-Image-2.1')).toBe('qwen');
      expect(normalizeArchitectureFamily('Z-Image')).toBe('z-image');
      expect(normalizeArchitectureFamily('Z-Image-Turbo')).toBe('z-image');
    });

    it('normalizes official Wan 2.1 video architecture distinctly from Wan 2.2', () => {
      expect(normalizeArchitectureFamily('Wan 2.1')).toBe('wan-2.1');
      expect(normalizeArchitectureFamily('wan-2.1')).toBe('wan-2.1');
      expect(normalizeArchitectureFamily('wan video 14b t2v')).toBe('wan-2.1');

      // Wan 2.2 is distinct from Wan 2.1
      expect(normalizeArchitectureFamily('Wan 2.2')).toBe('wan-2.2');
      expect(normalizeArchitectureFamily('wan-2.2')).toBe('wan-2.2');
      expect(normalizeArchitectureFamily('Wan Video 2.2 T2V-A14B')).toBe('wan-2.2');

      // Generic 'wan' without version is unknown
      expect(normalizeArchitectureFamily('wan')).toBe('unknown');
    });

    it('does NOT contain model name whitelists or fuzzy false matches', () => {
      // Model names without architecture metadata must NOT be guessed as whitelists
      expect(normalizeArchitectureFamily('dreamshaper')).toBe('unknown');
      expect(normalizeArchitectureFamily('meinahentai')).toBe('unknown');
      expect(normalizeArchitectureFamily('juggernaut-xl')).toBe('unknown');
      // Substring false positive guard: 'swan' or 'wand' must NOT match 'wan'
      expect(normalizeArchitectureFamily('swan')).toBe('unknown');
      expect(normalizeArchitectureFamily('wand')).toBe('unknown');
      expect(normalizeArchitectureFamily(undefined)).toBe('unknown');
      expect(normalizeArchitectureFamily('')).toBe('unknown');
    });
  });

  describe('checkHubLoraCompatibility', () => {
    it('metadata-driven match: FLUX.1 base + FLUX.1 LoRA', () => {
      const res = checkHubLoraCompatibility('FLUX.1', 'flux_dev');
      expect(res.status).toBe('compatible');
      expect(res.compatible).toBe(true);
      expect(res.isMismatch).toBe(false);
      expect(res.isUnknown).toBe(false);
      expect(res.chipLabel).toBe('兼容 flux_dev');
    });

    it('metadata-driven match: Novita V4 (SD 1.5) + weight_slider (SD 1.5)', () => {
      const res = checkHubLoraCompatibility('SD 1.5', 'SD 1.5');
      expect(res.status).toBe('compatible');
      expect(res.compatible).toBe(true);
      expect(res.isMismatch).toBe(false);
      expect(res.isUnknown).toBe(false);
      expect(res.chipLabel).toBe('兼容 SD 1.5');
    });

    it('metadata-driven match: Civitai SDXL base + SDXL LoRA', () => {
      const res = checkHubLoraCompatibility('SDXL 1.0', 'SDXL 1.0');
      expect(res.status).toBe('compatible');
      expect(res.compatible).toBe(true);
      expect(res.chipLabel).toBe('兼容 SDXL 1.0');
    });

    it('metadata-driven mismatch: FLUX.1 base + FLUX.2 LoRA must fail compatibility', () => {
      const res = checkHubLoraCompatibility('FLUX.1', 'FLUX.2');
      expect(res.status).toBe('mismatch');
      expect(res.compatible).toBe(false);
      expect(res.isMismatch).toBe(true);
      expect(res.isUnknown).toBe(false);
      expect(res.chipLabel).toBe('架构不兼容 (FLUX.2 ≠ FLUX.1)');
    });

    it('metadata-driven mismatch: Wan 2.1 base + Wan 2.2 LoRA must fail compatibility', () => {
      const res = checkHubLoraCompatibility('Wan 2.1', 'Wan 2.2');
      expect(res.status).toBe('mismatch');
      expect(res.compatible).toBe(false);
      expect(res.isMismatch).toBe(true);
      expect(res.isUnknown).toBe(false);
      expect(res.chipLabel).toBe('架构不兼容 (Wan 2.2 ≠ Wan 2.1)');
    });

    it('metadata-driven mismatch: Qwen base + Z-Image LoRA', () => {
      const res = checkHubLoraCompatibility('Qwen-Image-2.1', 'Z-Image');
      expect(res.status).toBe('mismatch');
      expect(res.compatible).toBe(false);
      expect(res.isMismatch).toBe(true);
      expect(res.isUnknown).toBe(false);
      expect(res.chipLabel).toBe('架构不兼容 (Z-Image ≠ Qwen-Image-2.1)');
    });

    it('metadata-driven mismatch: FLUX base + SD 1.5 LoRA', () => {
      const res = checkHubLoraCompatibility('FLUX.1', 'SD 1.5');
      expect(res.status).toBe('mismatch');
      expect(res.compatible).toBe(false);
      expect(res.isMismatch).toBe(true);
      expect(res.isUnknown).toBe(false);
      expect(res.chipLabel).toBe('架构不兼容 (SD 1.5 ≠ FLUX.1)');
    });

    it('unknown case: vendor token bfl produces unknown chip', () => {
      const res = checkHubLoraCompatibility('bfl', 'FLUX.1');
      expect(res.status).toBe('unknown');
      expect(res.compatible).toBe(false);
      expect(res.isMismatch).toBe(false);
      expect(res.isUnknown).toBe(true);
      expect(res.chipLabel).toBe('架构未知，无法判断兼容');
    });

    it('unknown case: checkpoint has no base-model metadata -> neutral chip, never claims compatible/incompatible', () => {
      const res = checkHubLoraCompatibility(undefined, 'FLUX.1');
      expect(res.status).toBe('unknown');
      expect(res.compatible).toBe(false);
      expect(res.isMismatch).toBe(false);
      expect(res.isUnknown).toBe(true);
      expect(res.chipLabel).toBe('架构未知，无法判断兼容');
    });

    it('unknown case: LoRA has no base-model metadata -> neutral chip, never claims compatible/incompatible', () => {
      const res = checkHubLoraCompatibility('SDXL 1.0', undefined);
      expect(res.status).toBe('unknown');
      expect(res.compatible).toBe(false);
      expect(res.isMismatch).toBe(false);
      expect(res.isUnknown).toBe(true);
      expect(res.chipLabel).toBe('架构未知，无法判断兼容');
    });

    it('unknown case: both sides lack metadata -> neutral chip', () => {
      const res = checkHubLoraCompatibility(undefined, undefined);
      expect(res.status).toBe('unknown');
      expect(res.compatible).toBe(false);
      expect(res.isMismatch).toBe(false);
      expect(res.isUnknown).toBe(true);
      expect(res.chipLabel).toBe('架构未知，无法判断兼容');
    });

    it('unknown case: uncataloged custom architecture -> neutral chip', () => {
      const res = checkHubLoraCompatibility('CustomCheckpoint99', 'CustomLora88');
      expect(res.status).toBe('unknown');
      expect(res.compatible).toBe(false);
      expect(res.isMismatch).toBe(false);
      expect(res.isUnknown).toBe(true);
      expect(res.chipLabel).toBe('架构未知，无法判断兼容');
    });
  });
});
