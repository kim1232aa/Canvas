import { describe, it, expect } from 'vitest';
import {
  adaptCivitaiRecipeToProvider,
  buildAllProviderAdaptations,
  type CivitaiRecipeInput,
} from './civitaiImportMap';

describe('Cross-Provider Civitai Recipe Adaptation Engine', () => {
  const sampleSdxlRecipe: CivitaiRecipeInput = {
    checkpoint: 'urn:air:sdxl:checkpoint:civitai:101055@128078',
    baseModel: 'SDXL 1.0',
    prompt: 'masterpiece, 1girl, scenic landscape, sunset',
    negativePrompt: 'worst quality, blurry, bad anatomy',
    steps: 25,
    cfg: 7,
    sampler: 'dpmpp_2m',
    scheduler: 'karras',
    seed: 1234567,
    clipSkip: 2,
    width: 1024,
    height: 1024,
    denoise: null,
    loras: [
      {
        name: 'AsianMix SDXL',
        displayName: 'AsianMix SDXL v1.0',
        civitaiId: '123456',
        air: 'urn:air:sdxl:lora:civitai:123456@789012',
        strength: 0.8,
        clipStrength: 0.8,
        baseModel: 'SDXL 1.0',
        downloadUrl: 'https://civitai.com/api/download/models/789012',
        requireAuth: false,
      },
    ],
  };

  const sampleFluxRecipe: CivitaiRecipeInput = {
    checkpoint: 'urn:air:flux1:checkpoint:civitai:618692@691639',
    baseModel: 'Flux.1 D',
    prompt: 'photorealistic street photo of a person in Tokyo rain',
    negativePrompt: 'blurry, distorted',
    steps: 28,
    cfg: 3.5,
    sampler: 'euler',
    scheduler: 'simple',
    seed: 987654321,
    clipSkip: null,
    width: 1024,
    height: 768,
    denoise: null,
    loras: [
      {
        name: 'Tokyo Street LoRA',
        displayName: 'Tokyo Street Film',
        civitaiId: '555111',
        air: 'urn:air:flux1:lora:civitai:555111@666222',
        strength: 0.85,
        baseModel: 'Flux.1 D',
        downloadUrl: 'https://civitai.com/api/download/models/666222',
        requireAuth: true,
      },
    ],
  };

  describe('1. Civitai Native Engine Adaptation', () => {
    it('preserves valid AIR model and maps SDXL parameters correctly', () => {
      const result = adaptCivitaiRecipeToProvider(sampleSdxlRecipe, 'civitai');
      expect(result.isCompatible).toBe(true);
      expect(result.fields.checkpoint.status).toBe('mapped');
      expect(result.fields.checkpoint.targetField).toBe('model');
      expect(result.fields.checkpoint.mappedValue).toBe('urn:air:sdxl:checkpoint:civitai:101055@128078');

      // SDXL clipSkip must be marked unsupported (official doc: "Sending clipSkip on an SDXL request will 400")
      expect(result.fields.clipSkip.status).toBe('unsupported');
      expect(result.fields.clipSkip.humanMessage).toContain('Sending clipSkip on an SDXL request will 400');
      expect(result.unsupportedFields).toContain('clipSkip');

      // Negative prompt supported on SDXL
      expect(result.fields.negativePrompt.status).toBe('mapped');
      expect(result.fields.negativePrompt.targetField).toBe('negativePrompt');

      // LoRA format is AIR
      expect(result.loras[0].status).toBe('compatible');
      expect(result.loras[0].targetFormat).toBe('air');
      expect(result.loras[0].sendableUrlOrId).toBe('urn:air:sdxl:lora:civitai:123456@789012');
    });

    it('requires explicit selection when checkpoint is merely a raw architecture text', () => {
      const rawArchRecipe: CivitaiRecipeInput = {
        ...sampleSdxlRecipe,
        checkpoint: 'SDXL 1.0',
      };
      const result = adaptCivitaiRecipeToProvider(rawArchRecipe, 'civitai');
      expect(result.baseModelStatus).toBe('requires_selection');
      expect(result.fields.checkpoint.status).toBe('manual_selection');
      expect(result.fields.checkpoint.humanMessage).toContain('仅为基础架构标签');
    });

    it('intercepts negative prompt on Flux.1 Comfy recipe', () => {
      const result = adaptCivitaiRecipeToProvider(sampleFluxRecipe, 'civitai');
      expect(result.fields.negativePrompt.status).toBe('unsupported');
      expect(result.fields.negativePrompt.humanMessage).toContain('FLUX.1 Comfy 官方配方无 negativePrompt 字段');
      expect(result.unsupportedFields).toContain('negativePrompt');
    });

    it('detects architecture mismatch between base model and LoRA', () => {
      const mismatchRecipe: CivitaiRecipeInput = {
        ...sampleSdxlRecipe,
        loras: [
          {
            name: 'Flux LoRA on SDXL Base',
            baseModel: 'Flux.1 D',
            strength: 0.8,
            civitaiId: '999',
          },
        ],
      };
      const result = adaptCivitaiRecipeToProvider(mismatchRecipe, 'civitai');
      expect(result.isCompatible).toBe(false);
      expect(result.loras[0].status).toBe('architecture_mismatch');
      expect(result.loras[0].reason).toContain('不匹配');
    });
  });

  describe('2. Fal.ai Adaptation', () => {
    it('adapts SDXL recipe to Fal.ai with public download URL and image_size', () => {
      const result = adaptCivitaiRecipeToProvider(sampleSdxlRecipe, 'fal');
      expect(result.fields.checkpoint.status).toBe('manual_selection');
      expect(result.fields.size.targetField).toBe('image_size');
      expect(result.fields.size.mappedValue).toEqual({ width: 1024, height: 1024 });
      expect(result.fields.steps.targetField).toBe('num_inference_steps');
      expect(result.fields.cfg.targetField).toBe('guidance_scale');

      // LoRA becomes download URL
      expect(result.loras[0].status).toBe('compatible');
      expect(result.loras[0].targetFormat).toBe('download_url');
      expect(result.loras[0].sendableUrlOrId).toBe('https://civitai.com/api/download/models/789012');
    });

    it('marks requireAuth LoRA as requires_consent to prevent leaking user API token without consent', () => {
      const result = adaptCivitaiRecipeToProvider(sampleFluxRecipe, 'fal', { allowTokenInUrl: false });
      expect(result.loras[0].requiresAuthConsent).toBe(true);
      expect(result.loras[0].status).toBe('requires_consent');
      expect(result.loras[0].reason).toContain('严禁在未经用户显式 UI 授权时向 Fal.ai 附带 Civitai API Token');
    });

    it('allows download URL when token consent is granted', () => {
      const result = adaptCivitaiRecipeToProvider(sampleFluxRecipe, 'fal', { allowTokenInUrl: true });
      expect(result.loras[0].status).toBe('compatible');
      expect(result.loras[0].sendableUrlOrId).toContain('https://civitai.com/api/download/models/666222');
    });

    it('marks negative_prompt unsupported on fal-ai/flux-lora', () => {
      const result = adaptCivitaiRecipeToProvider(sampleFluxRecipe, 'fal');
      expect(result.fields.negativePrompt.status).toBe('unsupported');
      expect(result.fields.negativePrompt.humanMessage).toContain('fal-ai/flux-lora 官方 Schema 无 negative_prompt 字段');
    });
  });

  describe('3. Replicate Adaptation', () => {
    it('adapts Flux recipe to Replicate with aspect_ratio, guidance, and max 2 LoRAs', () => {
      const multiLoraRecipe: CivitaiRecipeInput = {
        ...sampleFluxRecipe,
        width: 1024,
        height: 768, // ~ 4:3
        loras: [
          { name: 'LoRA 1', civitaiId: '111', baseModel: 'Flux.1 D', strength: 0.8 },
          { name: 'LoRA 2', civitaiId: '222', baseModel: 'Flux.1 D', strength: 0.6 },
          { name: 'LoRA 3 (excess)', civitaiId: '333', baseModel: 'Flux.1 D', strength: 0.5 },
        ],
      };
      const result = adaptCivitaiRecipeToProvider(multiLoraRecipe, 'replicate', { allowTokenInUrl: true });
      expect(result.fields.size.mappedValue).toEqual({ aspect_ratio: '4:3', megapixels: '1' });
      expect(result.fields.cfg.targetField).toBe('guidance');
      expect(result.fields.steps.targetField).toBe('num_inference_steps');
      expect(result.fields.negativePrompt.status).toBe('unsupported');

      // 1st and 2nd LoRA mapped
      expect(result.loras[0].status).toBe('compatible');
      expect(result.loras[0].reason).toContain('lora_weights');
      expect(result.loras[1].status).toBe('compatible');
      expect(result.loras[1].reason).toContain('extra_lora');

      // 3rd LoRA unsupported (Replicate schema limit)
      expect(result.loras[2].status).toBe('unsupported');
      expect(result.loras[2].reason).toContain('最多仅支持 2 个 LoRA');
    });
  });

  describe('4. WaveSpeed Adaptation', () => {
    it('maps size to width*height format and requires exact architecture match', () => {
      const result = adaptCivitaiRecipeToProvider(sampleSdxlRecipe, 'wavespeed');
      expect(result.fields.size.mappedValue).toBe('1024*1024');
      expect(result.fields.steps.targetField).toBe('num_inference_steps');
      expect(result.fields.cfg.targetField).toBe('guidance_scale');
      expect(result.loras[0].targetFormat).toBe('download_url');
      expect(result.loras[0].sendableUrlOrId).toBe('https://civitai.com/api/download/models/789012');
    });
  });

  describe('5. ModelScope (CN & AI) Adaptation', () => {
    it('flags external LoRA as requires_reselection and maps size to WxH', () => {
      const result = adaptCivitaiRecipeToProvider(sampleSdxlRecipe, 'modelscope');
      expect(result.fields.size.mappedValue).toBe('1024x1024');
      expect(result.fields.steps.targetField).toBe('steps');
      expect(result.fields.cfg.targetField).toBe('guidance');
      expect(result.fields.sampler.status).toBe('unsupported');
      expect(result.fields.scheduler.status).toBe('unsupported');

      // ModelScope requires internal repo IDs
      expect(result.loras[0].status).toBe('requires_reselection');
      expect(result.loras[0].reason).toContain('仅支持魔搭社区内部的 LoRA 仓库 ID');
    });
  });

  describe('6. Novita AI Adaptation', () => {
    it('merges scheduler into sampler_name and supports clip_skip', () => {
      const result = adaptCivitaiRecipeToProvider(sampleSdxlRecipe, 'novita');
      expect(result.fields.sampler.targetField).toBe('sampler_name');
      expect(result.fields.sampler.mappedValue).toBe('dpmpp_2m Karras');
      expect(result.fields.scheduler.status).toBe('unsupported'); // Merged
      expect(result.fields.clipSkip.status).toBe('mapped');
      expect(result.fields.clipSkip.targetField).toBe('clip_skip');
      expect(result.loras[0].status).toBe('requires_reselection');
      expect(result.loras[0].reason).toContain('sd_name_in_api');
    });
  });

  describe('7. Tensor.Art TAMS Adaptation', () => {
    it('maps all parameters to TAMS diffusion.* structure and supports clipSkip', () => {
      const result = adaptCivitaiRecipeToProvider(sampleSdxlRecipe, 'tensorart');
      expect(result.fields.prompt.targetField).toBe('diffusion.prompts[0].text');
      expect(result.fields.negativePrompt.targetField).toBe('diffusion.negativePrompts[0].text');
      expect(result.fields.steps.targetField).toBe('diffusion.steps');
      expect(result.fields.cfg.targetField).toBe('diffusion.cfgScale');
      expect(result.fields.sampler.targetField).toBe('diffusion.sampler');
      expect(result.fields.scheduler.targetField).toBe('diffusion.scheduleName');
      expect(result.fields.clipSkip.targetField).toBe('diffusion.clipSkip');
      expect(result.fields.clipSkip.status).toBe('mapped');
      expect(result.fields.seed.targetField).toBe('stages[INPUT_INITIALIZE].inputInitialize.seed');
      expect(result.loras[0].status).toBe('requires_reselection');
    });
  });

  describe('8. Sogni & NanoGPT & Hugging Face Adaptations', () => {
    it('Sogni marks steps and sampler unsupported, requires Sogni catalog ID for LoRA', () => {
      const result = adaptCivitaiRecipeToProvider(sampleSdxlRecipe, 'sogni');
      expect(result.fields.steps.status).toBe('unsupported');
      expect(result.fields.sampler.status).toBe('unsupported');
      expect(result.fields.cfg.targetField).toBe('guidance');
      expect(result.loras[0].status).toBe('requires_reselection');
      expect(result.loras[0].reason).toContain('Sogni 仅支持其官方目录');
    });

    it('NanoGPT standard endpoint marks loras and negativePrompt unsupported', () => {
      const result = adaptCivitaiRecipeToProvider(sampleSdxlRecipe, 'nanogpt');
      expect(result.loras[0].status).toBe('unsupported');
      expect(result.fields.negativePrompt.status).toBe('unsupported');
      expect(result.fields.steps.status).toBe('unsupported');
    });

    it('Hugging Face Inference Providers maps to parameters.* and marks loras unsupported', () => {
      const result = adaptCivitaiRecipeToProvider(sampleSdxlRecipe, 'huggingface');
      expect(result.fields.prompt.targetField).toBe('inputs');
      expect(result.fields.negativePrompt.targetField).toBe('parameters.negative_prompt');
      expect(result.fields.steps.targetField).toBe('parameters.num_inference_steps');
      expect(result.fields.cfg.targetField).toBe('parameters.guidance_scale');
      expect(result.fields.scheduler.targetField).toBe('parameters.scheduler');
      expect(result.loras[0].status).toBe('unsupported');
    });
  });

  describe('9. buildAllProviderAdaptations', () => {
    it('produces a complete map across all supported providers without error', () => {
      const map = buildAllProviderAdaptations(sampleSdxlRecipe);
      const expectedProviders = [
        'civitai',
        'fal',
        'replicate',
        'wavespeed',
        'huggingface',
        'modelscope',
        'modelscope_ai',
        'nanogpt',
        'novita',
        'sogni',
        'aimlapi',
        'muapi',
        'tensorart',
        'video',
      ];
      for (const p of expectedProviders) {
        expect(map[p]).toBeDefined();
        expect(map[p].provider).toBe(p);
        expect(map[p].fields).toBeDefined();
        expect(map[p].loras).toBeDefined();
      }
    });
  });
});
