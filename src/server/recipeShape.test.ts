import { describe, it, expect } from 'vitest';
import express from 'express';
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
  registerSchemaProviderRoutes,
  sogniSchemaSource,
} from './schemaProviders';
import { buildRunwareImageRequest } from './runwareImageContract';
import { buildModelsLabImageRequest } from './modelsLabImageContract';
import { buildFalVideoRequest } from './falVideoContract';
import { extractWorkflowParameters } from '../utils/graphEngine';
import { spatialRequestParameters, explicitLoraPath } from '../utils/frontendParameters';
import { workflowFrame } from '../utils/workflowFrame';
import { normalizeLoraPayloadItem } from '../utils/resourceSelection';
import { sogniGenerateImageSchemaFixture } from './fixtures/sogniGenerateImageSchema';
import { unmappedLorasNotice } from '../engines/drivers/SchemaProviderDriver';
import type { NodeInstance, Connection } from '../types/graph';

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

    it('Phase B: unknown loras item properties report unverified without guessing path/scale', () => {
      const unknownItemSchema = {
        loras: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              repo_id: { type: 'string' },
              weight: { type: 'number' },
            },
          },
        },
      };
      const spec = inspectTargetSchemaForLoras('fal', 'unknown-model', unknownItemSchema);
      expect(spec.status).toBe('unverified');
      expect(spec.format).toBe('custom');

      const recipe: CivitaiRecipeInput = {
        baseModel: 'Flux.1 D',
        loras: [{ name: 'Test LoRA', downloadUrl: 'https://civitai.com/api/download/models/1527024', civitaiId: '1527024', strength: 0.3 }],
      };
      const adapted = adaptCivitaiRecipeToProvider(recipe, 'fal', {
        targetModel: 'unknown-model',
        targetSchema: unknownItemSchema,
      });
      expect(adapted.loras[0].status).toBe('unverified');

      const unmapped: Array<{ item: any; reason: string }> = [];
      const mapped = mapSchemaLoraItems(recipe.loras || [], unknownItemSchema.loras.items, {}, 'unknown-model', unmapped);
      expect(mapped).toEqual([]);
      expect(unmapped).toHaveLength(1);
    });

    it('Phase B: Replicate model schema declaring loras array uses loras path instead of hardcoded lora_weights', () => {
      const replicateLorasSchema = {
        loras: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              scale: { type: 'number' },
            },
          },
        },
      };
      const spec = inspectTargetSchemaForLoras('replicate', 'custom-replicate-flux-lora', replicateLorasSchema);
      expect(spec.status).toBe('supported');
      expect(spec.field).toBe('loras');
      expect(spec.format).toBe('download_url');

      const recipe: CivitaiRecipeInput = {
        baseModel: 'Flux.1 D',
        loras: [{ name: 'Test LoRA', downloadUrl: 'https://civitai.com/api/download/models/1527024', civitaiId: '1527024', strength: 0.3 }],
      };
      const adapted = adaptCivitaiRecipeToProvider(recipe, 'replicate', {
        targetModel: 'custom-replicate-flux-lora',
        targetSchema: replicateLorasSchema,
      });
      expect(adapted.loras[0].status).toBe('compatible');
      expect(adapted.loras[0].reason).toContain('path');
      expect(adapted.loras[0].reason).not.toContain('lora_weights');
    });

    it('Phase B: target provider without schema honestly returns unverified (e.g. Runware)', () => {
      const recipe: CivitaiRecipeInput = {
        baseModel: 'Flux.1 D',
        loras: [{ name: 'Test LoRA', civitaiId: '1527024', strength: 0.3 }],
      };
      const adapted = adaptCivitaiRecipeToProvider(recipe, 'runware', {
        targetModel: 'runware:100@1',
        targetSchema: undefined,
      });
      expect(adapted.loras[0].status).toBe('unverified');
      expect(adapted.loras[0].reason).toContain('缺少实时 Schema 规范');
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

  describe('7. Real Canvas Graph (collect -> serialize -> route final body) & P1-3 Regression Suite', () => {
    const buildStandardGraph = (provider: string, ckptName: string, loraValues: Record<string, any>[]): { nodes: NodeInstance[]; connections: Connection[] } => {
      const nodes: NodeInstance[] = [
        {
          id: 'ckpt-1',
          type: 'CheckpointLoaderSimple',
          title: 'Checkpoint',
          pos: { x: 0, y: 0 },
          inputs: [],
          outputs: [{ id: 'MODEL', name: 'MODEL', type: 'MODEL' }, { id: 'CLIP', name: 'CLIP', type: 'CLIP' }, { id: 'VAE', name: 'VAE', type: 'VAE' }],
          values: { ckpt_name: ckptName, targetProvider: provider },
        },
      ];
      const connections: Connection[] = [];
      let prevModel = 'ckpt-1';
      let prevClip = 'ckpt-1';
      loraValues.forEach((lv, i) => {
        const lid = `lora-${i + 1}`;
        nodes.push({
          id: lid,
          type: 'LoRALoader',
          title: `LoRA ${i + 1}`,
          pos: { x: 200 * (i + 1), y: 0 },
          inputs: [{ id: 'model', name: 'model', type: 'MODEL' }, { id: 'clip', name: 'clip', type: 'CLIP' }],
          outputs: [{ id: 'MODEL', name: 'MODEL', type: 'MODEL' }, { id: 'CLIP', name: 'CLIP', type: 'CLIP' }],
          values: lv,
        });
        connections.push(
          { id: `c-m-${i}`, fromNodeId: prevModel, fromSocketId: 'MODEL', toNodeId: lid, toSocketId: 'model', type: 'MODEL' },
          { id: `c-c-${i}`, fromNodeId: prevClip, fromSocketId: 'CLIP', toNodeId: lid, toSocketId: 'clip', type: 'CLIP' }
        );
        prevModel = lid;
        prevClip = lid;
      });
      nodes.push(
        {
          id: 'pos-1',
          type: 'CLIPTextEncode',
          title: 'Positive',
          pos: { x: 400, y: 0 },
          inputs: [{ id: 'clip', name: 'clip', type: 'CLIP' }],
          outputs: [{ id: 'CONDITIONING', name: 'CONDITIONING', type: 'CONDITIONING' }],
          values: { text: 'a dramatic portrait' },
        },
        {
          id: 'neg-1',
          type: 'CLIPTextEncodeNegative',
          title: 'Negative',
          pos: { x: 400, y: 150 },
          inputs: [{ id: 'clip', name: 'clip', type: 'CLIP' }],
          outputs: [{ id: 'CONDITIONING', name: 'CONDITIONING', type: 'CONDITIONING' }],
          values: { text: 'blurry' },
        },
        {
          id: 'lat-1',
          type: 'EmptyLatentImage',
          title: 'Latent',
          pos: { x: 400, y: 300 },
          inputs: [],
          outputs: [{ id: 'LATENT', name: 'LATENT', type: 'LATENT' }],
          values: { width: 1024, height: 1024, batch_size: 1 },
        },
        {
          id: 'ks-1',
          type: 'KSampler',
          title: 'KSampler',
          pos: { x: 700, y: 0 },
          inputs: [
            { id: 'model', name: 'model', type: 'MODEL' },
            { id: 'positive', name: 'positive', type: 'CONDITIONING' },
            { id: 'negative', name: 'negative', type: 'CONDITIONING' },
            { id: 'latent_image', name: 'latent_image', type: 'LATENT' },
          ],
          outputs: [{ id: 'LATENT', name: 'LATENT', type: 'LATENT' }],
          values: { seed: 42, control_after_generate: 'fixed', steps: 20, cfg: 3.5, sampler_name: 'euler', scheduler: 'simple', denoise: 1 },
        },
        {
          id: 'save-1',
          type: 'SaveImage',
          title: 'Save',
          pos: { x: 1000, y: 0 },
          inputs: [{ id: 'images', name: 'images', type: 'IMAGE' }],
          outputs: [],
          values: {},
        }
      );
      connections.push(
        { id: 'c-pos', fromNodeId: prevClip, fromSocketId: 'CLIP', toNodeId: 'pos-1', toSocketId: 'clip', type: 'CLIP' },
        { id: 'c-neg', fromNodeId: prevClip, fromSocketId: 'CLIP', toNodeId: 'neg-1', toSocketId: 'clip', type: 'CLIP' },
        { id: 'c-ks-m', fromNodeId: prevModel, fromSocketId: 'MODEL', toNodeId: 'ks-1', toSocketId: 'model', type: 'MODEL' },
        { id: 'c-ks-p', fromNodeId: 'pos-1', fromSocketId: 'CONDITIONING', toNodeId: 'ks-1', toSocketId: 'positive', type: 'CONDITIONING' },
        { id: 'c-ks-n', fromNodeId: 'neg-1', fromSocketId: 'CONDITIONING', toNodeId: 'ks-1', toSocketId: 'negative', type: 'CONDITIONING' },
        { id: 'c-ks-l', fromNodeId: 'lat-1', fromSocketId: 'LATENT', toNodeId: 'ks-1', toSocketId: 'latent_image', type: 'LATENT' },
        { id: 'c-save', fromNodeId: 'ks-1', fromSocketId: 'LATENT', toNodeId: 'save-1', toSocketId: 'images', type: 'IMAGE' }
      );
      return { nodes, connections };
    };

    const serializeCanvasLoras = (nodes: NodeInstance[], connections: Connection[]) => {
      const extracted = extractWorkflowParameters(nodes, connections, 'save-1');
      return extracted.loras.map((l: any) =>
        normalizeLoraPayloadItem(
          {
            ...l,
            name: l.name,
            path: explicitLoraPath(l),
            downloadUrl: l.downloadUrl,
            air: l.air,
            modelId: l.modelId,
            versionId: l.versionId,
            styleId: l.styleId,
            catalogId: l.catalogId,
            sd_name_in_api: l.sd_name_in_api,
            provider: extracted.targetProvider,
            strength: l.modelStrength,
            modelStrength: l.modelStrength,
            clipStrength: l.clipStrength,
            civitaiId: l.civitaiId,
            triggers: l.triggerWords,
            baseModel: l.baseModel,
          },
          extracted.targetProvider
        )
      );
    };

    it('Sogni real canvas LoRALoader node with lora_name krea2-fever-dream-mood is preserved end-to-end while HTTP URLs are rejected', () => {
      const { nodes, connections } = buildStandardGraph('sogni', 'krea-2-turbo', [
        { lora_name: 'krea2-fever-dream-mood', strength_model: 0.8, strength_clip: 0.8, civitai_id: '' },
        { lora_name: 'https://civitai.com/api/download/models/1527024', download_url: 'https://civitai.com/api/download/models/1527024', strength_model: 0.3 },
      ]);
      const lorasPayload = serializeCanvasLoras(nodes, connections);
      const unmapped: Array<{ item: any; reason: string }> = [];
      const res = sogniLoras(lorasPayload, unmapped);

      expect(res.ids).toEqual(['krea2-fever-dream-mood']);
      expect(res.strengths).toEqual([0.8]);
      expect(unmapped).toHaveLength(1);
      expect(unmapped[0].reason).toContain('不支持外部 HTTP(S) URL');

      // Also verify string URL input to sogniLoras is rejected
      const unmappedStr: Array<{ item: any; reason: string }> = [];
      const resStr = sogniLoras(['https://civitai.com/api/download/models/1527024'], unmappedStr);
      expect(resStr.ids).toEqual([]);
      expect(resStr.strengths).toEqual([]);
      expect(unmappedStr).toHaveLength(1);

      // Also verify workflowFrame -> spatialRequestParameters preserves Sogni LoRA
      const frame = workflowFrame(nodes, connections);
      expect(frame).toBeTruthy();
      const spatialParams = spatialRequestParameters(frame!);
      const resSpatial = sogniLoras(spatialParams.loras || []);
      expect(resSpatial.ids).toEqual(['krea2-fever-dream-mood']);
      expect(resSpatial.strengths).toEqual([0.8]);
    });

    it('sogniLoras never silently turns invalid strength into 1; passes raw value for upstream validation or omits when unset', () => {
      const resUnset = sogniLoras([{ name: 'krea2-detail-enhancer' }]);
      expect(resUnset.ids).toEqual(['krea2-detail-enhancer']);
      expect(resUnset.strengths).toEqual([]);

      const resInvalid = sogniLoras([{ name: 'krea2-detail-enhancer', strength: 'not-a-number' }]);
      expect(resInvalid.ids).toEqual(['krea2-detail-enhancer']);
      expect(resInvalid.strengths).toEqual(['not-a-number']);
    });

    it('Novita real canvas LoRALoader node with add_detail.safetensors is preserved when not a foreign Civitai resource, while foreign Civitai filename is rejected', () => {
      const { nodes, connections } = buildStandardGraph('novita', 'sd_xl_base_1.0.safetensors', [
        { lora_name: 'add_detail.safetensors', strength_model: 0.75, strength_clip: 0.75, civitai_id: '' },
        { lora_name: 'civitai_foreign.safetensors', strength_model: 0.5, civitai_id: '1527024', import_source_provider: 'civitai' },
      ]);
      const lorasPayload = serializeCanvasLoras(nodes, connections);
      const unmapped: Array<{ item: any; reason: string }> = [];
      const res = novitaLoras(lorasPayload, unmapped);

      expect(res).toEqual([{ model_name: 'add_detail.safetensors', strength: 0.75 }]);
      expect(unmapped).toHaveLength(1);
      expect(unmapped[0].reason).toContain('Novita LoRA 缺少 model_name');
    });

    it('mapSchemaLoraItems allows explicit non-Civitai numeric target IDs, HF owner/repo paths, l.name fallback, and preserves declared extra fields like trigger_word', () => {
      // 1. Explicit numeric target ID (e.g. TensorArt / custom catalog ID) when not a foreign Civitai resource
      const idSchema = {
        type: 'object',
        properties: {
          id: { type: 'string' },
          strength: { type: 'number' },
          trigger_word: { type: 'string' },
          transformer: { type: 'string' },
        },
      };
      const { nodes, connections } = buildStandardGraph('muapi', 'custom-id-model', [
        {
          lora_name: '1015214543296590260',
          id: '1015214543296590260',
          strength_model: 0.8,
          trigger_word: 'neon_cyber',
          transformer: 'high',
        },
      ]);
      const lorasPayload = serializeCanvasLoras(nodes, connections);
      const mappedId = mapSchemaLoraItems(lorasPayload, idSchema, {}, 'custom-id-model');
      expect(mappedId).toEqual([
        {
          id: '1015214543296590260',
          strength: 0.8,
          trigger_word: 'neon_cyber',
          transformer: 'high',
        },
      ]);

      // 2. Foreign Civitai numeric ID without target id is still rejected
      const foreignNumeric = [{ name: 'civitai-lora.safetensors', civitaiId: '1527024', import_source_provider: 'civitai', strength: 0.8 }];
      const unmappedForeign: Array<{ item: any; reason: string }> = [];
      expect(mapSchemaLoraItems(foreignNumeric, idSchema, {}, 'custom-id-model', unmappedForeign)).toEqual([]);
      expect(unmappedForeign).toHaveLength(1);

      // 3. HuggingFace owner/repo in path and l.name fallback
      const pathSchema = {
        type: 'object',
        properties: {
          path: { type: 'string' },
          scale: { type: 'number' },
          trigger_word: { type: 'string' },
        },
      };
      const hfCanvas = serializeCanvasLoras(
        ...(() => {
          const g = buildStandardGraph('fal', 'fal-ai/flux-lora', [
            { lora_name: 'ostris/flux-dev-lora-test', strength_model: 0.65, trigger_words: 'ostris_style' },
          ]);
          return [g.nodes, g.connections] as const;
        })()
      );
      const mappedHf = mapSchemaLoraItems(hfCanvas, pathSchema, {}, 'fal-ai/flux-lora');
      expect(mappedHf).toEqual([
        {
          path: 'ostris/flux-dev-lora-test',
          scale: 0.65,
          trigger_word: 'ostris_style',
        },
      ]);
    });

    it('Runware imported canvas graph preserves air, modelId, and versionId through extractWorkflowParameters and workflowFrame -> buildRunwareImageRequest', () => {
      const { nodes, connections } = buildStandardGraph('runware', 'runware:100@1', [
        {
          lora_name: 'cinematic-1940s.safetensors',
          strength_model: 0.3,
          strength_clip: 0.3,
          civitai_id: 'urn:air:flux1:lora:civitai:1351798@1527024',
          model_id: 1351798,
          version_id: 1527024,
          air: 'urn:air:flux1:lora:civitai:1351798@1527024',
          download_url: 'https://civitai.com/api/download/models/1527024',
        },
      ]);
      const lorasPayload = serializeCanvasLoras(nodes, connections);
      expect(lorasPayload[0]).toMatchObject({
        air: 'urn:air:flux1:lora:civitai:1351798@1527024',
        modelId: 1351798,
        versionId: 1527024,
      });
      const req = buildRunwareImageRequest({
        model: 'runware:100@1',
        prompt: 'cinematic scene',
        loras: lorasPayload,
      });
      expect(req.payload[0].lora).toEqual([{ model: 'civitai:1351798@1527024', weight: 0.3 }]);

      const frame = workflowFrame(nodes, connections);
      const spatial = spatialRequestParameters(frame!);
      expect(spatial.loras?.[0]).toMatchObject({
        air: 'urn:air:flux1:lora:civitai:1351798@1527024',
        modelId: 1351798,
        versionId: 1527024,
      });

      // Also verify when civitai_id holds bare versionId ('1527024') alongside model_id/version_id/air
      const reqWithBareCivitaiId = buildRunwareImageRequest({
        model: 'runware:100@1',
        prompt: 'cinematic scene',
        loras: [
          {
            name: 'cinematic-1940s.safetensors',
            civitaiId: '1527024',
            modelId: '1351798',
            versionId: '1527024',
            air: 'urn:air:flux1:lora:civitai:1351798@1527024',
            downloadUrl: 'https://civitai.com/api/download/models/1527024',
            strength: 0.3,
          },
        ],
      });
      expect(reqWithBareCivitaiId.payload[0].lora).toEqual([{ model: 'civitai:1351798@1527024', weight: 0.3 }]);

      // And verify bare versionId or filename without modelId/AIR is rejected instead of sent as Runware AIR or ModelsLab lora_model
      const reqRunwareUnmapped = buildRunwareImageRequest({
        model: 'runware:100@1',
        prompt: 'cinematic scene',
        loras: [
          {
            name: 'cinematic-1940s.safetensors',
            civitaiId: '1527024',
            downloadUrl: 'https://civitai.com/api/download/models/1527024',
            strength: 0.3,
          },
        ],
      });
      expect(reqRunwareUnmapped.payload[0].lora).toBeUndefined();
      expect(reqRunwareUnmapped.unmappedLoras).toHaveLength(1);

      const reqModelsLabUnmapped = buildModelsLabImageRequest(
        {
          model: 'flux',
          prompt: 'cinematic scene',
          loras: [
            {
              name: 'cinematic-1940s.safetensors',
              civitaiId: '1527024',
              downloadUrl: 'https://civitai.com/api/download/models/1527024',
              strength: 0.8,
            },
          ],
        },
        'test-key'
      );
      expect(reqModelsLabUnmapped.payload.lora_model).toBeUndefined();
      expect(reqModelsLabUnmapped.unmappedLoras).toHaveLength(1);
    });

    it('unmappedLorasNotice surfaces omitted LoRA names, source values, and reasons for historyWarning / UI visibility', () => {
      const submitBody = {
        actualRequest: {
          mapping: [
            {
              from: 'loras',
              to: 'styles',
              unmappedLoras: [
                {
                  item: {
                    name: 'cinematic-1940s.safetensors',
                    downloadUrl: 'https://civitai.com/api/download/models/1527024',
                    civitaiId: '1527024',
                  },
                  reason: 'Krea LoRA 缺少 styleId',
                },
              ],
            },
          ],
        },
      };
      const notice = unmappedLorasNotice(submitBody);
      expect(notice).toBeTruthy();
      expect(notice).toContain('未发送（未挂载）');
      expect(notice).toContain('cinematic-1940s.safetensors');
      expect(notice).toContain('https://civitai.com/api/download/models/1527024');
      expect(notice).toContain('Krea LoRA 缺少 styleId');
    });

    it('Sogni mixed LoRAs (some with explicit strength 0 / 0.3, another unset) preserves filled strengths and reports unset item as unmapped without fabricating 1 or swallowing filled strengths', () => {
      const mixedLoras = [
        { name: 'krea2-detail-enhancer', strength: 0 },
        { name: 'krea2-warm-light', strength: 0.3 },
        { name: 'krea2-candid' }, // unset strength alongside filled strengths
      ];
      const unmapped: Array<{ item: any; reason: string }> = [];
      const res = sogniLoras(mixedLoras, unmapped);

      expect(res.ids).toEqual(['krea2-detail-enhancer', 'krea2-warm-light']);
      expect(res.strengths).toEqual([0, 0.3]);
      expect(unmapped).toHaveLength(1);
      expect(unmapped[0].item).toMatchObject({ name: 'krea2-candid' });
      expect(unmapped[0].reason).toContain('按位等长对齐');
      expect(unmapped[0].reason).toContain('krea2-candid');

      // Verify user-visible notice via unmappedLorasNotice
      const notice = unmappedLorasNotice({
        actualRequest: {
          mapping: [{ from: 'loras', to: 'loras + loraStrengths', unmappedLoras: unmapped }],
        },
      });
      expect(notice).toContain('krea2-candid');
      expect(notice).toContain('按位等长对齐');
    });

    it('Fal Wan 2.2 video graph preserves declared transformer and weight_name fields from LoRALoader nodes through to buildFalVideoRequest final payload', () => {
      const nodes: NodeInstance[] = [
        {
          id: 'lora-high',
          type: 'LoRALoader',
          title: 'Wan 2.2 High Noise LoRA',
          pos: { x: 0, y: 0 },
          inputs: [{ id: 'model', name: 'model', type: 'MODEL' }],
          outputs: [{ id: 'MODEL', name: 'MODEL', type: 'MODEL' }],
          values: {
            lora_name: 'https://huggingface.co/test/wan22-high/resolve/main/high.safetensors',
            download_url: 'https://huggingface.co/test/wan22-high/resolve/main/high.safetensors',
            strength_model: 0.9,
            transformer: 'high',
            weight_name: 'high.safetensors',
          },
        },
        {
          id: 'lora-low',
          type: 'LoRALoader',
          title: 'Wan 2.2 Low Noise LoRA',
          pos: { x: 200, y: 0 },
          inputs: [{ id: 'model', name: 'model', type: 'MODEL' }],
          outputs: [{ id: 'MODEL', name: 'MODEL', type: 'MODEL' }],
          values: {
            lora_name: 'https://huggingface.co/test/wan22-low/resolve/main/low.safetensors',
            download_url: 'https://huggingface.co/test/wan22-low/resolve/main/low.safetensors',
            strength_model: 0.7,
            transformer: 'low',
          },
        },
        {
          id: 'vid-1',
          type: 'AIVideoNode',
          title: 'Wan 2.2 Video',
          pos: { x: 450, y: 0 },
          inputs: [{ id: 'prompt', name: 'prompt', type: 'STRING' }, { id: 'lora', name: 'lora', type: 'MODEL' }],
          outputs: [{ id: 'video', name: 'video', type: 'VIDEO' }],
          values: {
            targetProvider: 'fal',
            provider: 'fal',
            model: 'fal-ai/wan/v2.2-a14b/text-to-video/lora',
            prompt: 'cinematic drone shot over neon Tokyo',
            steps: 27,
            cfg: 3.5,
            seed: 100,
          },
        },
      ];
      const connections: Connection[] = [
        { id: 'c1', fromNodeId: 'lora-high', fromSocketId: 'MODEL', toNodeId: 'lora-low', toSocketId: 'model', type: 'MODEL' },
        { id: 'c2', fromNodeId: 'lora-low', fromSocketId: 'MODEL', toNodeId: 'vid-1', toSocketId: 'lora', type: 'MODEL' },
      ];

      const extracted = extractWorkflowParameters(nodes, connections, 'vid-1');
      const lorasPayload = extracted.loras.map((l: any) =>
        normalizeLoraPayloadItem(
          {
            ...l,
            name: l.name,
            path: explicitLoraPath(l),
            downloadUrl: l.downloadUrl,
            strength: l.modelStrength,
            modelStrength: l.modelStrength,
          },
          'fal'
        )
      );

      const wan22LiveProps = {
        prompt: { type: 'string' },
        num_inference_steps: { type: 'integer' },
        guidance_scale: { type: 'number' },
        seed: { type: 'integer' },
        loras: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              scale: { type: 'number' },
              weight_name: { type: 'string' },
              transformer: { type: 'string', enum: ['high', 'low', 'both'], default: 'high' },
            },
          },
        },
      };

      const built = buildFalVideoRequest(
        'fal-ai/wan/v2.2-a14b/text-to-video/lora',
        {
          prompt: extracted.positivePrompt,
          steps: extracted.steps,
          cfg: extracted.cfg,
          seed: extracted.seed,
          loras: lorasPayload,
        },
        wan22LiveProps
      );

      expect(built.payload.loras).toEqual([
        {
          path: 'https://huggingface.co/test/wan22-low/resolve/main/low.safetensors',
          scale: 0.7,
          transformer: 'low',
        },
        {
          path: 'https://huggingface.co/test/wan22-high/resolve/main/high.safetensors',
          scale: 0.9,
          transformer: 'high',
          weight_name: 'high.safetensors',
        },
      ]);
    });

    it('SchemaProvider submit routes LoRA items with target_field into specialized schema arrays (e.g. high_noise_loras, low_noise_loras) while default loras go to generic loras array', async () => {
      const app = express();
      app.use(express.json());
      const openapi = {
        paths: {
          '/api/v3/wavespeed-ai/wan-2.2/t2v-480p-lora': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        prompt: { type: 'string' },
                        loras: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, scale: { type: 'number' } } } },
                        high_noise_loras: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, scale: { type: 'number' } } } },
                        low_noise_loras: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, scale: { type: 'number' } } } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      let submittedBody: any;
      registerSchemaProviderRoutes(app, {
        fetch: async (_meta, url, init) => {
          if (url.endsWith('/api/v3/models')) {
            return new Response(
              JSON.stringify({
                data: [
                  {
                    model_id: 'wavespeed-ai/wan-2.2/t2v-480p-lora',
                    api_schema: {
                      api_schemas: [
                        {
                          type: 'model_run',
                          method: 'POST',
                          server: 'https://api.wavespeed.ai',
                          api_path: '/api/v3/wavespeed-ai/wan-2.2/t2v-480p-lora',
                          request_schema: openapi.paths['/api/v3/wavespeed-ai/wan-2.2/t2v-480p-lora'].post.requestBody.content['application/json'].schema,
                        },
                      ],
                    },
                  },
                ],
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          if (init?.method === 'POST') {
            submittedBody = JSON.parse(String(init?.body || '{}'));
            return new Response(JSON.stringify({ code: 200, data: { id: 'task-ws-target' } }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return new Response(JSON.stringify({}), { status: 200 });
        },
        key: () => 'ws-test-key',
        record: (item: any) => item,
        durable: async (url: string) => ({ ok: true, dataUrl: url }),
      });

      const { createServer } = await import('node:http');
      const server = createServer(app);
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const port = (server.address() as any).port;

      try {
        const resp = await fetch(`http://127.0.0.1:${port}/api/schema-provider/wavespeed/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'wavespeed-ai/wan-2.2/t2v-480p-lora',
            prompt: 'a cinematic portrait in the rain',
            loras: [
              { path: 'https://cdn.example/general.safetensors', scale: 0.8 },
              { path: 'https://cdn.example/high.safetensors', scale: 0.9, target_field: 'high_noise_loras' },
              { path: 'https://cdn.example/low.safetensors', scale: 0.7, target_field: 'low_noise_loras' },
              { path: 'https://cdn.example/bad.safetensors', scale: 0.5, target_field: 'undeclared_expert_field' },
            ],
          }),
        });
        const resJson = await resp.json();
        expect(resp.status).toBe(200);

        // Verify payload partitioned cleanly into declared fields
        expect(submittedBody.loras).toEqual([{ path: 'https://cdn.example/general.safetensors', scale: 0.8 }]);
        expect(submittedBody.high_noise_loras).toEqual([{ path: 'https://cdn.example/high.safetensors', scale: 0.9 }]);
        expect(submittedBody.low_noise_loras).toEqual([{ path: 'https://cdn.example/low.safetensors', scale: 0.7 }]);

        // Verify undeclared target_field reported in unmappedLoras trace
        const unmapped = resJson.actualRequest.mapping.find((m: any) => m.from === 'loras')?.unmappedLoras;
        expect(unmapped).toHaveLength(1);
        expect(unmapped[0].item.path).toBe('https://cdn.example/bad.safetensors');
        expect(unmapped[0].reason).toContain('undeclared_expert_field');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });
});
