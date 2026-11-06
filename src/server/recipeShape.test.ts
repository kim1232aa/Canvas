import { describe, it, expect } from 'vitest';
import {
  adaptCivitaiRecipeToProvider,
  normalizeEcosystem,
  type CivitaiRecipeInput,
} from '../utils/civitaiImportMap';
import {
  inspectTargetSchemaForLoras,
  buildSendableLoraUrl,
  buildCivitaiCanonicalAir,
} from '../utils/civitaiTargetSchema';
import {
  mapSchemaLoraItems,
  kreaStyles,
  novitaLoras,
} from './schemaProviders';
import { buildRunwareImageRequest } from './runwareImageContract';
import { buildModelsLabImageRequest } from './modelsLabImageContract';

describe('Mission M27: Recipe Shape, LoRA Resource Identity, and Target Schema Alignment', () => {
  describe('1. Target-ID vs URL/AIR namespace confusion', () => {
    it('kreaStyles prioritizes native style ID (styleId/id) over name/path/civitaiId', () => {
      const lorasWithStyleId = [
        {
          id: 'krea-style-uuid-1234',
          name: 'Civitai Watercolor LoRA',
          civitaiId: '998877',
          path: 'https://civitai.com/api/download/models/998877',
          strength: 0.8,
        },
      ];
      const styles = kreaStyles(lorasWithStyleId);
      expect(styles).toEqual([{ id: 'krea-style-uuid-1234', strength: 0.8 }]);
    });

    it('kreaStyles throws transparent local error when given external civitai ID or URL without Krea style ID', () => {
      const lorasWithoutStyleId = [
        {
          civitaiId: '998877',
          path: 'https://civitai.com/api/download/models/998877',
          strength: 0.8,
        },
      ];
      expect(() => kreaStyles(lorasWithoutStyleId)).toThrow(/style ID/);
    });

    it('mapSchemaLoraItems respects target id property and does not put download URL into id', () => {
      const itemSchema = {
        type: 'object',
        properties: {
          id: { type: 'string' },
          strength: { type: 'number' },
        },
      };
      const loras = [
        {
          id: 'catalog-style-42',
          path: 'https://example.com/weights.safetensors',
          downloadUrl: 'https://example.com/weights.safetensors',
          strength: 0.75,
        },
      ];
      const result = mapSchemaLoraItems(loras, itemSchema, {}, 'test-model');
      expect(result).toEqual([{ id: 'catalog-style-42', strength: 0.75 }]);
    });

    it('mapSchemaLoraItems respects target path/url property and uses downloadUrl', () => {
      const itemSchema = {
        type: 'object',
        properties: {
          path: { type: 'string' },
          scale: { type: 'number' },
        },
      };
      const loras = [
        {
          civitaiId: '54321',
          name: 'MyLora',
          downloadUrl: 'https://civitai.com/api/download/models/54321',
          strength: 0.9,
        },
      ];
      const result = mapSchemaLoraItems(loras, itemSchema, {}, 'test-model');
      expect(result).toEqual([{ path: 'https://civitai.com/api/download/models/54321', scale: 0.9 }]);
    });

    it('novitaLoras prioritizes model_name / sd_name_in_api over raw URL or numeric civitaiId', () => {
      const loras = [
        {
          model_name: 'v1-5-pruned-emaonly.safetensors',
          civitaiId: '12345',
          path: 'https://civitai.com/api/download/models/12345',
          strength: 0.7,
        },
      ];
      const result = novitaLoras(loras);
      expect(result).toEqual([{ model_name: 'v1-5-pruned-emaonly.safetensors', strength: 0.7 }]);
    });
  });

  describe('2. Exact version URLs with query strings and token security', () => {
    it('buildSendableLoraUrl appends token with & when URL already has existing query params', () => {
      const rawUrl = 'https://civitai.com/api/download/models/12345?type=Model&format=SafeTensor';
      const result = buildSendableLoraUrl(rawUrl, {
        allowTokenInUrl: true,
        civitaiToken: 'my_secret_token',
        requireAuth: true,
      });
      expect(result.url).toBe(
        'https://civitai.com/api/download/models/12345?type=Model&format=SafeTensor&token=my_secret_token'
      );
      expect(result.url).not.toContain('??');
    });

    it('buildSendableLoraUrl refuses to attach token without user consent', () => {
      const rawUrl = 'https://civitai.com/api/download/models/12345';
      const result = buildSendableLoraUrl(rawUrl, {
        allowTokenInUrl: false,
        civitaiToken: 'my_secret_token',
        requireAuth: true,
      });
      expect(result.requiresConsent).toBe(true);
      expect(result.url).toBeUndefined();
    });

    it('Replicate adaptation never uses unversioned HTML page URL civitai.com/models/{id}', () => {
      const recipe: CivitaiRecipeInput = {
        checkpoint: 'FLUX.1-dev',
        baseModel: 'FLUX.1 D',
        loras: [
          {
            name: 'Exact LoRA',
            modelId: 99999,
            versionId: 11111,
            civitaiId: '11111',
            baseModel: 'FLUX.1 D',
            strength: 0.8,
            downloadUrl: 'https://civitai.com/api/download/models/11111?format=SafeTensor',
          },
        ],
      };
      const result = adaptCivitaiRecipeToProvider(recipe, 'replicate');
      expect(result.loras[0].status).toBe('compatible');
      expect(result.loras[0].sendableUrlOrId).toBe(
        'https://civitai.com/api/download/models/11111?format=SafeTensor'
      );
      expect(result.loras[0].sendableUrlOrId).not.toContain('civitai.com/models/99999');
    });
  });

  describe('3. Dynamic LoRA caps driven by live schema, not blanket provider limits', () => {
    it('allows >3 LoRAs when live endpoint schema declares maxItems: 5 or higher', () => {
      const recipe: CivitaiRecipeInput = {
        checkpoint: 'flux-dev',
        baseModel: 'FLUX.1 D',
        loras: [
          { name: 'L1', civitaiId: '1', strength: 0.5, downloadUrl: 'https://c/1' },
          { name: 'L2', civitaiId: '2', strength: 0.5, downloadUrl: 'https://c/2' },
          { name: 'L3', civitaiId: '3', strength: 0.5, downloadUrl: 'https://c/3' },
          { name: 'L4', civitaiId: '4', strength: 0.5, downloadUrl: 'https://c/4' },
          { name: 'L5', civitaiId: '5', strength: 0.5, downloadUrl: 'https://c/5' },
        ],
      };
      const customSchema = {
        loras: {
          type: 'array',
          maxItems: 5,
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              scale: { type: 'number' },
            },
          },
        },
      };
      const result = adaptCivitaiRecipeToProvider(recipe, 'fal', {
        targetSchema: customSchema,
      });
      // All 5 should be compatible because schema maxItems is 5, not old cap 3!
      expect(result.loras.every((l) => l.status === 'compatible')).toBe(true);
      expect(result.warnings.some((w) => w.includes('超过上限'))).toBe(false);
    });

    it('enforces schema-declared maxItems when exceeded and cites schema', () => {
      const recipe: CivitaiRecipeInput = {
        checkpoint: 'flux-dev',
        baseModel: 'FLUX.1 D',
        loras: [
          { name: 'L1', civitaiId: '1', strength: 0.5, downloadUrl: 'https://c/1' },
          { name: 'L2', civitaiId: '2', strength: 0.5, downloadUrl: 'https://c/2' },
          { name: 'L3', civitaiId: '3', strength: 0.5, downloadUrl: 'https://c/3' },
        ],
      };
      const result = adaptCivitaiRecipeToProvider(recipe, 'replicate', {
        customLoraCap: 2,
      });
      expect(result.loras[0].status).toBe('compatible');
      expect(result.loras[1].status).toBe('compatible');
      expect(result.loras[2].status).toBe('unsupported');
      expect(result.loras[2].reason).toContain('最多仅支持 2 个 LoRA');
    });
  });

  describe('4. Ecosystem distinctness and no sdxl fallback', () => {
    it('distinguishes Krea from Z-Image and never conflates them', () => {
      expect(normalizeEcosystem('Krea 2 RAW')).toBe('krea');
      expect(normalizeEcosystem('Z-Image Turbo')).toBe('zimage');
      expect(normalizeEcosystem('zimage')).toBe('zimage');
    });

    it('distinguishes FLUX.1 and FLUX.2', () => {
      expect(normalizeEcosystem('FLUX.1 D')).toBe('flux1');
      expect(normalizeEcosystem('FLUX.2 Klein')).toBe('flux2');
    });

    it('distinguishes Wan 2.1 and Wan', () => {
      expect(normalizeEcosystem('Wan 2.1 14B')).toBe('wan21');
      expect(normalizeEcosystem('Wan 1.0')).toBe('wan');
    });

    it('unknown ecosystem never defaults to sdxl', () => {
      const unknownEco = normalizeEcosystem('BrandNewModel 2026');
      expect(unknownEco).toBe('unknown');

      const canonicalAir = buildCivitaiCanonicalAir(12345, 67890, unknownEco);
      expect(canonicalAir).toBe('urn:air:civitai:lora:12345@67890');
      expect(canonicalAir).not.toContain('sdxl');
    });
  });

  describe('5. CFG 0, seed 0, and strength 0 preservation across wire contracts', () => {
    it('Runware contract preserves CFGScale: 0 for all models', () => {
      const req = buildRunwareImageRequest({
        model: 'civitai:133005@782002',
        prompt: 'a cinematic portrait',
        cfg: 0,
      });
      expect(req.payload[0].CFGScale).toBe(0);
    });

    it('Runware contract preserves seed: 0 and LoRA weight: 0', () => {
      const req = buildRunwareImageRequest({
        model: 'runware:100@1',
        prompt: 'a landscape',
        seed: 0,
        loras: [{ civitaiId: 'urn:air:flux1:lora:civitai:123@456', weight: 0 }],
      });
      expect(req.payload[0].seed).toBe(0);
      expect(req.payload[0].lora).toEqual([{ model: 'civitai:123@456', weight: 0 }]);
    });

    it('Runware contract does not throw local error on empty prompt (aligned with M18)', () => {
      expect(() => {
        buildRunwareImageRequest({
          model: 'runware:100@1',
          prompt: '',
        });
      }).not.toThrow(/提示词为必填项/);
    });

    it('ModelsLab contract preserves guidance_scale: 0', () => {
      const req = buildModelsLabImageRequest(
        {
          model_id: 'midjourney',
          prompt: 'a futuristic city',
          cfg: 0,
        },
        'test-key'
      );
      expect(req.payload.guidance_scale).toBe(0);
    });

    it('ModelsLab contract preserves seed: 0 and LoRA strength: 0', () => {
      const req = buildModelsLabImageRequest(
        {
          model_id: 'midjourney',
          prompt: 'test prompt',
          seed: 0,
          loras: [{ name: 'cyberpunk-lora', strength: 0 }],
        },
        'test-key'
      );
      expect(req.payload.seed).toBe(0);
      expect(req.payload.lora_strength).toBe(0);
    });

    it('ModelsLab contract does not throw local error on empty prompt (aligned with M18)', () => {
      expect(() => {
        buildModelsLabImageRequest(
          {
            model_id: 'midjourney',
            prompt: '',
          },
          'test-key'
        );
      }).not.toThrow(/提示词为必填项/);
    });

    it('importer adaptation preserves cfg: 0 and seed: 0 as mapped', () => {
      const recipe: CivitaiRecipeInput = {
        checkpoint: 'FLUX.1-schnell',
        baseModel: 'FLUX.1 S',
        cfg: 0,
        seed: 0,
      };
      const result = adaptCivitaiRecipeToProvider(recipe, 'fal');
      expect(result.fields.cfg.mappedValue).toBe(0);
      expect(result.fields.cfg.status).toBe('mapped');
      expect(result.fields.seed.mappedValue).toBe(0);
      expect(result.fields.seed.status).toBe('mapped');
    });
  });

  describe('6. Honest nonblocking status for missing schemas or unverified providers', () => {
    it('reports unverified rather than false blanket unsupported for unconfigured provider', () => {
      const recipe: CivitaiRecipeInput = {
        checkpoint: 'custom-model',
        loras: [{ name: 'L1', civitaiId: '100', strength: 0.8 }],
      };
      const result = adaptCivitaiRecipeToProvider(recipe, 'some_new_inference_provider');
      expect(result.loras[0].status).toBe('unverified');
      expect(result.loras[0].reason).toContain('未配置显式 LoRA Schema');
      expect(result.loras[0].reason).not.toContain('官方标准生图接口未提供 loras');
    });
  });
});
