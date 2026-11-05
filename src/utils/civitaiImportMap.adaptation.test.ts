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
      const result = adaptCivitaiRecipeToProvider({ ...sampleFluxRecipe, engine: 'comfy' }, 'civitai');
      expect(result.fields.negativePrompt.status).toBe('unsupported');
      expect(result.fields.negativePrompt.humanMessage).toContain('FLUX.1 comfy 引擎官方配方不支持负向提示词');
      expect(result.unsupportedFields).toContain('negativePrompt');
    });

    it('allows negative prompt on Flux.1 sdcpp recipe', () => {
      const result = adaptCivitaiRecipeToProvider({ ...sampleFluxRecipe, engine: 'sdcpp' }, 'civitai');
      expect(result.fields.negativePrompt.status).toBe('mapped');
      expect(result.fields.negativePrompt.targetField).toBe('negativePrompt');
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
      expect(result.loras[0].reason).toContain('严禁在未经用户显式 UI 授权时向');
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

  describe('10. P1-4 & P2 Findings Verification Tests', () => {
    it('P1-4: unknown architecture reports "架构未知，无法确认兼容" and isCompatible is false', () => {
      const unknownRecipe: CivitaiRecipeInput = {
        prompt: 'test prompt',
        baseModel: '', // unknown architecture
        loras: [{ name: 'SomeLoRA', strength: 0.8, versionId: '123' }],
      };
      const result = adaptCivitaiRecipeToProvider(unknownRecipe, 'fal');
      expect(result.isCompatible).toBe(false);
      expect(result.baseModelStatus).toBe('requires_selection');
      expect(result.baseModelMessage).toContain('架构未知，无法确认兼容');
    });

    it('P1-4: LoRA with no weight or versionId is marked requires_reselection and does NOT forge scale 1', () => {
      const missingWeightRecipe: CivitaiRecipeInput = {
        baseModel: 'SDXL 1.0',
        loras: [
          { name: 'LoRA Without Weight', civitaiId: '111', strength: null },
          { name: 'LoRA Without VersionId', strength: 0.8 },
        ],
      };
      const result = adaptCivitaiRecipeToProvider(missingWeightRecipe, 'fal');
      expect(result.loras[0].status).toBe('requires_reselection');
      expect(result.loras[0].scale).toBeUndefined();
      expect(result.loras[0].reason).toContain('缺少显式 LoRA 权重参数，禁止静默兜底 1.0');

      expect(result.loras[1].status).toBe('requires_reselection');
      expect(result.loras[1].reason).toContain('缺少官方模型版本 ID');
    });

    it('P1-1 (Round 3): SD 1.5 clipSkip on Civitai is marked unsupported with honest reason (CivitaiDriver not mapped)', () => {
      const sd15Recipe: CivitaiRecipeInput = {
        baseModel: 'SD 1.5',
        clipSkip: 2,
        checkpoint: 'urn:air:sd1:checkpoint:civitai:94809@393843',
      };
      const result = adaptCivitaiRecipeToProvider(sd15Recipe, 'civitai');
      expect(result.fields.clipSkip.status).toBe('unsupported');
      expect(result.fields.clipSkip.humanMessage).toContain('尚未发送，原因：CivitaiDriver / civitaiImageContract 尚未映射 clipSkip');
      expect(result.unsupportedFields).toContain('clipSkip');
      expect(result.warnings.some((w) => w.includes('CivitaiDriver / civitaiImageContract 尚未映射'))).toBe(true);
    });

    it('P2-2: prompt-inferred LoRA tag is marked requires_reselection with prompt inference warning', () => {
      const promptInferredRecipe: CivitaiRecipeInput = {
        baseModel: 'SDXL 1.0',
        loras: [
          { name: 'asianMix', strength: 0.85, inferredFromPrompt: true },
        ],
      };
      const result = adaptCivitaiRecipeToProvider(promptInferredRecipe, 'fal');
      expect(result.loras[0].status).toBe('requires_reselection');
      expect(result.loras[0].inferredFromPrompt).toBe(true);
      expect(result.loras[0].reason).toContain('从提示词标签 <lora:...> 推断，未经验证');
      expect(result.loras[0].sendableUrlOrId).toBeUndefined();
    });

    it('P2-3: consent with token appends ?token= to outbound third-party URL', () => {
      const authRecipe: CivitaiRecipeInput = {
        baseModel: 'Flux.1 D',
        loras: [
          { name: 'AuthLoRA', versionId: '999888', strength: 0.8, requireAuth: true },
        ],
      };
      const withToken = adaptCivitaiRecipeToProvider(authRecipe, 'fal', { allowTokenInUrl: true, civitaiToken: 'my_civitai_token_abc' });
      expect(withToken.loras[0].status).toBe('compatible');
      expect(withToken.loras[0].sendableUrlOrId).toBe('https://civitai.com/api/download/models/999888?token=my_civitai_token_abc');
    });

    it('P2-4: Fal fal-ai/lora supports clip_skip and scheduler on SDXL', () => {
      const sdxlRecipe: CivitaiRecipeInput = {
        baseModel: 'SDXL 1.0',
        clipSkip: 2,
        sampler: 'dpmpp_2m',
        scheduler: 'karras',
      };
      const result = adaptCivitaiRecipeToProvider(sdxlRecipe, 'fal');
      expect(result.fields.clipSkip.status).toBe('mapped');
      expect(result.fields.clipSkip.targetField).toBe('clip_skip');
      expect(result.fields.scheduler.status).toBe('mapped');
      expect(result.fields.scheduler.targetField).toBe('scheduler');
    });

    it('P1-1 (a): Civitai sdcpp maps Euler a to euler_a, comfy maps to euler_ancestral', () => {
      const recipeSdcpp: CivitaiRecipeInput = {
        baseModel: 'SDXL 1.0',
        sampler: 'Euler a',
        engine: 'sdcpp',
      };
      const resSdcpp = adaptCivitaiRecipeToProvider(recipeSdcpp, 'civitai');
      expect(resSdcpp.fields.sampler.targetField).toBe('sampleMethod');
      expect(resSdcpp.fields.sampler.mappedValue).toBe('euler_a');

      const recipeComfy: CivitaiRecipeInput = {
        baseModel: 'SDXL 1.0',
        sampler: 'Euler a',
        engine: 'comfy',
      };
      const resComfy = adaptCivitaiRecipeToProvider(recipeComfy, 'civitai');
      expect(resComfy.fields.sampler.targetField).toBe('sampler');
      expect(resComfy.fields.sampler.mappedValue).toBe('euler_ancestral');
    });

    it('P1-1 (b): canGenerate === false is unsupported on Civitai but allowed on third-party (Fal)', () => {
      const recipeWithNoGenLora: CivitaiRecipeInput = {
        baseModel: 'Pony V6',
        loras: [
          { name: 'Kenva', versionId: '454703', modelId: '366990', strength: 0.8, canGenerate: false, air: 'urn:air:sdxl:lora:civitai:366990@454703' },
        ],
      };
      const civitaiResult = adaptCivitaiRecipeToProvider(recipeWithNoGenLora, 'civitai');
      expect(civitaiResult.loras[0].status).toBe('unsupported');
      expect(civitaiResult.loras[0].reason).toContain('canGenerate: false');
      expect(civitaiResult.warnings.some((w) => w.includes('canGenerate: false'))).toBe(true);

      const falResult = adaptCivitaiRecipeToProvider(recipeWithNoGenLora, 'fal');
      expect(falResult.loras[0].status).toBe('compatible');
      expect(falResult.loras[0].sendableUrlOrId).toContain('https://civitai.com/api/download/models/454703');
    });

    it('P2-2: hash404Warnings are preserved in provider warnings', () => {
      const recipeWithHash404: CivitaiRecipeInput = {
        baseModel: 'SDXL 1.0',
        hash404Warnings: ['哈希未在 Civitai 找到: LORA:sdxl/sinfully_stylish_sdxl (033c44dfb8)'],
      };
      const result = adaptCivitaiRecipeToProvider(recipeWithHash404, 'civitai');
      expect(result.warnings).toContain('哈希未在 Civitai 找到: LORA:sdxl/sinfully_stylish_sdxl (033c44dfb8)');
    });
  });
});
