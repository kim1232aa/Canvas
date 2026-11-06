import { describe, it, expect } from 'vitest';
import {
  adaptCivitaiRecipeToProvider,
  normalizeEcosystem,
  PROVIDER_LORA_CAPS,
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
  aimlapiLoras,
  sogniLoras,
} from './schemaProviders';
import { buildRunwareImageRequest } from './runwareImageContract';
import { buildModelsLabImageRequest } from './modelsLabImageContract';

describe('Mission M27: Recipe Shape, LoRA Resource Identity, and Target Schema Alignment', () => {
  describe('1. Target-ID vs URL/AIR namespace confusion & Probe Verification', () => {
    it('Probe 1: mapSchemaLoraItems does NOT write civitai numeric ID into url field', () => {
      const itemSchema = {
        type: 'object',
        properties: {
          url: { type: 'string' },
          scale: { type: 'number' },
        },
      };
      // LoRA only has civitaiId '222', no downloadUrl/url
      const loras = [{ civitaiId: '222', scale: 0.5 }];
      const result = mapSchemaLoraItems(loras, itemSchema, {}, 'test-model');
      // Must NOT produce [{ url: '222', scale: 0.5 }] — sends nothing for it
      expect(result).toEqual([]);
    });

    it('Probe 2: mapSchemaLoraItems does NOT invent path when schema declares air', () => {
      const itemSchema = {
        type: 'object',
        properties: {
          air: { type: 'string' },
          strength: { type: 'number' },
        },
      };
      // LoRA has downloadUrl/path but no AIR
      const loras = [
        {
          path: 'https://civitai.com/api/download/models/222',
          downloadUrl: 'https://civitai.com/api/download/models/222',
          strength: 0.5,
        },
      ];
      const result = mapSchemaLoraItems(loras, itemSchema, {}, 'test-model');
      // Must NOT produce [{ path: 'https://...', strength: 0.5 }] — sends nothing for it
      expect(result).toEqual([]);
    });

    it('mapSchemaLoraItems correctly maps valid AIR when schema declares air', () => {
      const itemSchema = {
        type: 'object',
        properties: {
          air: { type: 'string' },
          strength: { type: 'number' },
        },
      };
      const loras = [
        {
          air: 'urn:air:flux1:lora:civitai:111@222',
          strength: 0.75,
        },
      ];
      const result = mapSchemaLoraItems(loras, itemSchema, {}, 'test-model');
      expect(result).toEqual([{ air: 'urn:air:flux1:lora:civitai:111@222', strength: 0.75 }]);
    });

    it('mapSchemaLoraItems correctly maps genuine HTTP URL when schema declares url/path', () => {
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

    it('kreaStyles rejects Civitai filename and numeric civitaiId, recording in unmapped trace', () => {
      const importedCanvasLora = {
        name: 'cinematic-1940s.safetensors',
        downloadUrl: 'https://civitai.com/api/download/models/1527024',
        civitaiId: '1527024',
        strength: 0.3,
      };
      const unmapped: Array<{ item: any; reason: string }> = [];
      const styles = kreaStyles([importedCanvasLora], unmapped);
      expect(styles).toEqual([]);
      expect(unmapped).toHaveLength(1);
      expect(unmapped[0].reason).toContain('Krea LoRA 缺少 styleId');
    });

    it('kreaStyles preserves scale / strength: 0', () => {
      const lora = { styleId: 'style-uuid-42', strength: 0 };
      const styles = kreaStyles([lora]);
      expect(styles).toEqual([{ id: 'style-uuid-42', strength: 0 }]);
    });

    it('novitaLoras rejects Civitai filename and numeric civitaiId without throwing local error', () => {
      const importedCanvasLora = {
        name: 'cinematic-1940s.safetensors',
        downloadUrl: 'https://civitai.com/api/download/models/1527024',
        civitaiId: '1527024',
        strength: 0.3,
      };
      const unmapped: Array<{ item: any; reason: string }> = [];
      expect(() => novitaLoras([importedCanvasLora])).not.toThrow();
      const result = novitaLoras([importedCanvasLora], unmapped);
      expect(result).toEqual([]);
      expect(unmapped).toHaveLength(1);
      expect(unmapped[0].reason).toContain('Novita LoRA 缺少 model_name');
    });

    it('novitaLoras preserves strength: 0', () => {
      const lora = { model_name: 'sd_model_v1.safetensors', strength: 0 };
      const result = novitaLoras([lora]);
      expect(result).toEqual([{ model_name: 'sd_model_v1.safetensors', strength: 0 }]);
    });

    it('aimlapiLoras maps downloadUrl correctly and never outputs numeric civitaiId as path', () => {
      const importedCanvasLora = {
        name: 'cinematic-1940s.safetensors',
        downloadUrl: 'https://civitai.com/api/download/models/1527024',
        civitaiId: '1527024',
        strength: 0.3,
      };
      const result = aimlapiLoras([importedCanvasLora]);
      expect(result).toEqual([
        { path: 'https://civitai.com/api/download/models/1527024', scale: 0.3 },
      ]);

      const numericOnly = {
        name: 'cinematic-1940s.safetensors',
        civitaiId: '1527024',
        strength: 0.3,
      };
      const unmapped: Array<{ item: any; reason: string }> = [];
      const resNumeric = aimlapiLoras([numericOnly], unmapped);
      expect(resNumeric).toEqual([]);
      expect(unmapped).toHaveLength(1);
      expect(unmapped[0].reason).toContain('AIMLAPI LoRA 缺少合法的 path');
    });

    it('aimlapiLoras preserves scale: 0', () => {
      const lora = { path: 'https://example.com/lora.safetensors', scale: 0 };
      const result = aimlapiLoras([lora]);
      expect(result).toEqual([{ path: 'https://example.com/lora.safetensors', scale: 0 }]);
    });

    it('sogniLoras rejects Civitai filename and numeric civitaiId, recording in unmapped trace', () => {
      const importedCanvasLora = {
        name: 'cinematic-1940s.safetensors',
        downloadUrl: 'https://civitai.com/api/download/models/1527024',
        civitaiId: '1527024',
        strength: 0.3,
      };
      const unmapped: Array<{ item: any; reason: string }> = [];
      const res = sogniLoras([importedCanvasLora], unmapped);
      expect(res.ids).toEqual([]);
      expect(res.strengths).toEqual([]);
      expect(unmapped).toHaveLength(1);
      expect(unmapped[0].reason).toContain('Sogni LoRA 缺少目录 catalogId');
    });

    it('sogniLoras accepts native catalog id and preserves strength: 0', () => {
      const lora = { id: 'krea2-detail-enhancer', strength: 0 };
      const res = sogniLoras([lora]);
      expect(res.ids).toEqual(['krea2-detail-enhancer']);
      expect(res.strengths).toEqual([0]);
    });

    it('mapSchemaLoraItems preserves scale: 0 and strength: 0', () => {
      const itemSchema = {
        type: 'object',
        properties: {
          path: { type: 'string' },
          scale: { type: 'number' },
        },
      };
      const loras = [
        {
          downloadUrl: 'https://civitai.com/api/download/models/54321',
          scale: 0,
        },
      ];
      const result = mapSchemaLoraItems(loras, itemSchema, {}, 'test-model');
      expect(result).toEqual([{ path: 'https://civitai.com/api/download/models/54321', scale: 0 }]);
    });

    it('PROVIDER_LORA_CAPS does not contain static Replicate cap; caps derived dynamically from schema', () => {
      expect((PROVIDER_LORA_CAPS as any).replicate).toBeUndefined();
      const spec = inspectTargetSchemaForLoras('replicate', 'black-forest-labs/flux-dev-lora', undefined);
      expect(spec.maxItems).toBeUndefined();
      expect(spec.status).toBe('unverified');
    });

    it('kreaStyles omits invalid external URL without throwing local error (no local gate)', () => {
      const lorasWithoutStyleId = [
        {
          path: 'https://civitai.com/api/download/models/998877',
          strength: 0.8,
        },
      ];
      // Must NOT throw; sends nothing for this entry, letting upstream decide
      expect(() => kreaStyles(lorasWithoutStyleId)).not.toThrow();
      expect(kreaStyles(lorasWithoutStyleId)).toEqual([]);
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
      const replicateSchema = {
        lora_weights: { type: 'string' },
        extra_lora: { type: 'string' },
      };
      const result = adaptCivitaiRecipeToProvider(recipe, 'replicate', {
        targetSchema: replicateSchema,
      });
      expect(result.loras[0].status).toBe('compatible');
      expect(result.loras[0].sendableUrlOrId).toBe(
        'https://civitai.com/api/download/models/11111?format=SafeTensor'
      );
      expect(result.loras[0].sendableUrlOrId).not.toContain('civitai.com/models/99999');
    });
  });

  describe('3. Dynamic LoRA caps driven by live schema, not blanket provider limits', () => {
    it('derives Replicate maxItems 2 when schema declares extra_lora', () => {
      const schemaWithExtra = {
        lora_weights: { type: 'string' },
        extra_lora: { type: 'string' },
      };
      const spec = inspectTargetSchemaForLoras('replicate', 'black-forest-labs/flux-dev-lora', schemaWithExtra);
      expect(spec.maxItems).toBe(2);
    });

    it('derives Replicate maxItems 1 when schema does NOT declare extra_lora', () => {
      const schemaWithoutExtra = {
        lora_weights: { type: 'string' },
      };
      const spec = inspectTargetSchemaForLoras('replicate', 'single-lora-model', schemaWithoutExtra);
      expect(spec.maxItems).toBe(1);
    });

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
      expect(result.loras.every((l) => l.status === 'compatible')).toBe(true);
      expect(result.warnings.some((w) => w.includes('超过上限'))).toBe(false);
    });
  });

  describe('4. Ecosystem distinctness and no fabricated AIRs', () => {
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

    it('unknown ecosystem returns undefined from buildCivitaiCanonicalAir (never fabricated AIR or sdxl)', () => {
      const unknownEco = normalizeEcosystem('BrandNewModel 2026');
      expect(unknownEco).toBe('unknown');

      const canonicalAir = buildCivitaiCanonicalAir(12345, 67890, unknownEco);
      expect(canonicalAir).toBeUndefined();
    });

    it('importer reports requires_reselection honestly when canonical AIR cannot be built', () => {
      const recipe: CivitaiRecipeInput = {
        checkpoint: 'Unknown-Model',
        baseModel: 'BrandNewModel 2026',
        loras: [
          {
            name: 'Mystery LoRA',
            modelId: 111,
            versionId: 222,
            baseModel: 'BrandNewModel 2026',
            strength: 0.8,
          },
        ],
      };
      const result = adaptCivitaiRecipeToProvider(recipe, 'civitai');
      expect(result.loras[0].status).toBe('requires_reselection');
      expect(result.loras[0].reason).toContain('基础架构未知');
      expect(result.loras[0].air).toBeUndefined();
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
      const result = adaptCivitaiRecipeToProvider(recipe, 'civitai');
      expect(result.fields.cfg.mappedValue).toBe(0);
      expect(result.fields.cfg.status).toBe('mapped');
      expect(result.fields.seed.mappedValue).toBe(0);
      expect(result.fields.seed.status).toBe('mapped');
    });
  });

  describe('6. Honest nonblocking status for missing schemas or unverified providers', () => {
    it('reports unverified rather than false blanket unsupported when no live schema is loaded', () => {
      const recipe: CivitaiRecipeInput = {
        checkpoint: 'custom-model',
        loras: [{ name: 'L1', civitaiId: '100', strength: 0.8 }],
      };
      const result = adaptCivitaiRecipeToProvider(recipe, 'unconfigured_provider');
      expect(result.loras[0].status).toBe('unverified');
      expect(result.loras[0].reason).toContain('未选择目标模型');
      expect(result.loras[0].reason).not.toContain('官方标准生图接口未提供 loras');
    });
  });
});
