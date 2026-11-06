import { describe, expect, it, vi } from 'vitest';
import {
  handleExtractCivitaiWorkflow,
  resolveCivitaiVersionInfo,
  resolveCivitaiVersionByHash,
  fetchCivitaiRealImageMeta,
  type CivitaiWorkflowDeps,
} from './civitaiWorkflowRoute';
import { handleCivitaiModelVersion, type CivitaiModelRouteDeps } from './civitaiModelRoutes';
import { isRawBaseModelArchitectureText } from '../../utils/civitaiImportMap';

function createMockWorkflowDeps(upstreamFetchMock: any): CivitaiWorkflowDeps {
  return {
    getSettings: () => ({ civitaiToken: 'test_token' }),
    defaultKeys: {},
    upstreamFetch: upstreamFetchMock,
  };
}

function createMockModelDeps(upstreamFetchMock: any): CivitaiModelRouteDeps {
  return {
    getSettings: () => ({ civitaiToken: 'test_token' }),
    defaultKeys: {},
    upstreamFetch: upstreamFetchMock,
  };
}

function createMockRes() {
  const res: any = {
    statusCode: 200,
    data: null,
    status: (code: number) => {
      res.statusCode = code;
      return res;
    },
    json: (body: any) => {
      res.data = body;
      return res;
    },
  };
  return res;
}

describe('Civitai Routes and Workflow Contract Tests', () => {
  describe('isRawBaseModelArchitectureText helper', () => {
    it('identifies raw base model architecture names correctly', () => {
      expect(isRawBaseModelArchitectureText('SDXL 1.0')).toBe(true);
      expect(isRawBaseModelArchitectureText('SD 1.5')).toBe(true);
      expect(isRawBaseModelArchitectureText('Flux.1 D')).toBe(true);
      expect(isRawBaseModelArchitectureText('Pony')).toBe(true);
      expect(isRawBaseModelArchitectureText('Illustrious')).toBe(true);
      expect(isRawBaseModelArchitectureText('Wan 2.1')).toBe(true);
    });

    it('does not classify concrete filenames, AIRs, or Civitai IDs as raw architecture text', () => {
      expect(isRawBaseModelArchitectureText('sdxl_base_1.0.safetensors')).toBe(false);
      expect(isRawBaseModelArchitectureText('v1-5-pruned-emaonly.safetensors')).toBe(false);
      expect(isRawBaseModelArchitectureText('urn:air:sdxl:checkpoint:civitai:101055@128078')).toBe(false);
      expect(isRawBaseModelArchitectureText('civitai:101055@128078')).toBe(false);
      expect(isRawBaseModelArchitectureText('101055@128078')).toBe(false);
      expect(isRawBaseModelArchitectureText('128078')).toBe(false);
      expect(isRawBaseModelArchitectureText('')).toBe(false);
    });
  });

  describe('HIGH 1: /api/civitai/model-version route validation', () => {
    it('rejects invalid non-numeric versionId with HTTP 400', async () => {
      const mockFetch = vi.fn();
      const handler = handleCivitaiModelVersion(createMockModelDeps(mockFetch));

      const req = { params: { versionId: 'abc' }, query: {}, headers: {} } as any;
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data).toMatchObject({
        error: expect.stringContaining('versionId 必须为纯数字'),
        errorSource: 'local',
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects missing versionId with HTTP 400', async () => {
      const mockFetch = vi.fn();
      const handler = handleCivitaiModelVersion(createMockModelDeps(mockFetch));

      const req = { params: {}, query: {}, headers: {} } as any;
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data.errorSource).toBe('local');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('accepts valid numeric versionId and queries upstream', async () => {
      const mockFetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 12345, name: 'v1.0' }),
      }));
      const handler = handleCivitaiModelVersion(createMockModelDeps(mockFetch));

      const req = { params: { versionId: '12345' }, query: {}, headers: {} } as any;
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.data).toMatchObject({ id: 12345, name: 'v1.0' });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'civitai', model: '12345' }),
        'https://civitai.com/api/v1/model-versions/12345',
        expect.any(Object)
      );
    });
  });

  describe('HIGH 2: Model URL input dispatch priority over imageId', () => {
    it('routes civitai model URL with query versionId to model-version even if imageId is set', async () => {
      const mockFetch = vi.fn(async (_meta: any, url: string) => {
        if (url.includes('/api/v1/model-versions/456')) {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                id: 456,
                modelId: 123,
                name: 'v2.0',
                baseModel: 'SDXL 1.0',
                model: { id: 123, name: 'SuperModel', type: 'Checkpoint' },
                trainedWords: ['super trigger'],
                images: [{ url: 'https://image.civitai.com/preview.jpg' }],
              }),
          };
        }
        throw new Error(`Unexpected url: ${url}`);
      });

      const handler = handleExtractCivitaiWorkflow(createMockWorkflowDeps(mockFetch));
      const req = {
        body: {
          url: 'https://civitai.com/models/123?modelVersionId=456',
          imageId: '789', // Should not override model URL
          engine: 'civitai',
        },
      } as any;
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.preset.name).toContain('SuperModel');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'civitai', route: 'workflow-extract-version', model: '456' }),
        'https://civitai.com/api/v1/model-versions/456',
        expect.any(Object)
      );
    });
  });

  describe('HIGH 3: Upstream error transparency without .slice(0, 500) truncation', () => {
    it('returns HTTP 502 with errorSource upstream and full rawResponse on JSON parse error in model-version', async () => {
      const corruptRaw = '<!DOCTYPE html><html><head><title>502 Bad Gateway</title></head><body><h1>Bad Gateway from Cloudflare</h1>' + 'A'.repeat(600) + '</body></html>';
      const mockFetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => corruptRaw,
      }));

      const handler = handleCivitaiModelVersion(createMockModelDeps(mockFetch));
      const req = { params: { versionId: '99999' }, query: {}, headers: {} } as any;
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(502);
      expect(res.data).toMatchObject({
        errorSource: 'upstream',
        status: 200,
        endpoint: 'https://civitai.com/api/v1/model-versions/99999',
        rawResponse: corruptRaw,
      });
      // Verify rawResponse is NOT truncated to 500 characters
      expect(res.data.rawResponse.length).toBeGreaterThan(600);
      expect(res.data.stack).toBeDefined();
    });

    it('returns upstream HTTP status and details on upstream HTTP failure', async () => {
      const errorPayload = '{"message":"Model version not found"}';
      const mockFetch = vi.fn(async () => ({
        ok: false,
        status: 404,
        text: async () => errorPayload,
      }));

      const handler = handleCivitaiModelVersion(createMockModelDeps(mockFetch));
      const req = { params: { versionId: '40404' }, query: {}, headers: {} } as any;
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.data).toMatchObject({
        errorSource: 'upstream',
        status: 404,
        rawResponse: errorPayload,
        details: errorPayload,
      });
    });
  });

  describe('HIGH 4: parsedUpstreamData validation and trivial fragment rejection', () => {
    it('rejects trivial parameter fragments like "Steps: 20" with HTTP 400', async () => {
      const mockFetch = vi.fn();
      const handler = handleExtractCivitaiWorkflow(createMockWorkflowDeps(mockFetch));

      const req = {
        body: {
          rawText: 'Steps: 20\nSampler: Euler a\nCFG scale: 7',
        },
      } as any;
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data).toMatchObject({
        error: expect.stringContaining('仅包含零散参数片段'),
        errorSource: 'local',
      });
      expect(res.data.success).toBeUndefined();
    });

    it('rejects empty model structure from upstream with HTTP 400', async () => {
      const mockFetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 111, modelVersions: [] }),
      }));

      const handler = handleExtractCivitaiWorkflow(createMockWorkflowDeps(mockFetch));
      const req = {
        body: {
          url: 'https://civitai.com/models/111',
        },
      } as any;
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data).toMatchObject({
        error: expect.stringContaining('未包含可用版本数据'),
        errorSource: 'upstream',
      });
    });
  });

  describe('HIGH 5: Checkpoint vs LoRA separation, multi-version note, raw baseModel check', () => {
    it('does not create LoRALoader for Checkpoint model; notes default version selection when multi-version', async () => {
      const mockFetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: 888,
            name: 'Master Checkpoint',
            type: 'Checkpoint',
            creator: { username: 'MasterArtist' },
            modelVersions: [
              { id: 1001, name: 'v2.0 Latest', baseModel: 'SDXL 1.0', files: [{ name: 'master_v2.safetensors' }] },
              { id: 1000, name: 'v1.0 Initial', baseModel: 'SDXL 1.0', files: [{ name: 'master_v1.safetensors' }] },
            ],
          }),
      }));

      const handler = handleExtractCivitaiWorkflow(createMockWorkflowDeps(mockFetch));
      const req = {
        body: {
          url: 'https://civitai.com/models/888',
          engine: 'civitai',
        },
      } as any;
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.data.success).toBe(true);

      const preset = res.data.preset;
      // Multi-version never picks versions[0] ("多版本不取 first")
      expect(preset.name).toContain('含 2 个版本，待显式选择 versionId');
      expect(preset.description).toContain('该模型包含 2 个版本');
      expect(preset.description).toContain('严禁默认取第一个版本 (versions[0])');

      // Verify selectedMultiVersion metadata
      expect(preset.selectedMultiVersion).toMatchObject({
        id: null,
        name: '',
        isDefaultLatest: false,
        requiresExplicitSelection: true,
        totalVersionsCount: 2,
      });
      expect(res.data.otherMetadata.selectedMultiVersion).toMatchObject({
        id: null,
        requiresExplicitSelection: true,
      });
      expect(res.data.parsedMeta.selectedMultiVersion).toMatchObject({
        id: null,
        requiresExplicitSelection: true,
      });

      // Never construct LoRALoader for Checkpoint model
      const loraNodes = preset.nodes.filter((n: any) => n.type === 'LoRALoader');
      expect(loraNodes).toHaveLength(0);

      // Checkpoint loader node exists with empty ckpt_name requiring explicit version selection
      const ckptNode = preset.nodes.find((n: any) => n.type === 'CheckpointLoaderSimple');
      expect(ckptNode).toBeDefined();
      expect(ckptNode.values.ckpt_name).toBe('');
      expect(ckptNode.values.import_requires_model_selection).toBe(true);
    });

    it('creates LoRALoader for LoRA model and clears checkpoint if only raw baseModel text is present', async () => {
      const mockFetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: 777,
            name: 'Cyberpunk LoRA',
            type: 'LORA',
            creator: { username: 'CyberCreator' },
            modelVersions: [
              {
                id: 2001,
                name: 'v1.0',
                baseModel: 'SDXL 1.0',
                trainedWords: ['cyberpunk, neon'],
                files: [{ name: 'cyberpunk_lora.safetensors' }],
              },
            ],
          }),
      }));

      const handler = handleExtractCivitaiWorkflow(createMockWorkflowDeps(mockFetch));
      const req = {
        body: {
          url: 'https://civitai.com/models/777',
          engine: 'civitai',
        },
      } as any;
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      const preset = res.data.preset;

      // LoRALoader MUST be constructed for LoRA model
      const loraNode = preset.nodes.find((n: any) => n.type === 'LoRALoader');
      expect(loraNode).toBeDefined();
      expect(loraNode.values.lora_name).toBe('cyberpunk_lora.safetensors');

      // CheckpointLoaderSimple must NOT use "SDXL 1.0" as ckpt_name!
      const ckptNode = preset.nodes.find((n: any) => n.type === 'CheckpointLoaderSimple');
      expect(ckptNode).toBeDefined();
      expect(ckptNode.values.ckpt_name).toBe('');
      expect(ckptNode.values.import_source_model).toBe('SDXL 1.0');
      expect(ckptNode.values.import_requires_model_selection).toBe(true);

      // Spatial frame params checkpoint must also be empty
      expect(preset.spatialFrames[0].params.checkpoint).toBe('');
      expect(res.data.parsedMeta.checkpoint).toBe('');
    });
  });

  describe('Civitai media type detection', () => {
    it.each([
      ['positive prompt', { prompt: 'a portrait in wan 2 style', Model: 'pixel-wave' }],
      ['model label', { prompt: 'a portrait', Model: 'wan 2' }],
      ['MiniMax prompt', { prompt: 'a portrait with hailuo framing', Model: 'pixel-wave' }],
    ])('does not infer video from the %s without video media metadata', async (_label, meta) => {
      const restData = {
        items: [
          {
            id: 12,
            username: 'tester',
            baseModel: 'SDXL 1.0',
            meta,
          },
        ],
      };
      const mockFetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(restData),
        json: async () => restData,
      }));
      const handler = handleExtractCivitaiWorkflow(createMockWorkflowDeps(mockFetch));
      const res = createMockRes();

      await handler({ body: { url: 'https://civitai.com/images/1234567' } } as any, res);

      expect(res.statusCode).toBe(200);
      expect(res.data.parsedMeta.mediaType).toBe('image');
      expect(res.data.preset.nodes.some((node: any) => node.type === 'AIVideoNode')).toBe(false);
      expect(res.data.preset.nodes.some((node: any) => node.type === 'KSampler')).toBe(true);
    });
  });

  describe('Civitai CLIP Skip import transparency', () => {
    it('preserves raw Clip skip as source metadata and explicitly reports that it was not sent', async () => {
      const handler = handleExtractCivitaiWorkflow(createMockWorkflowDeps(vi.fn()));
      const res = createMockRes();

      await handler({
        body: {
          rawText: 'a portrait\nNegative prompt: blur\nSteps: 20, CFG scale: 7, Clip skip: 2, Model: pixel-wave',
          engine: 'civitai',
        },
      } as any, res);

      expect(res.statusCode).toBe(200);
      expect(res.data.otherMetadata.clipSkip).toBe(2);
      expect(res.data.preset.importWarnings).toEqual([
        expect.objectContaining({ field: 'clipSkip', value: 2, sent: false }),
      ]);
      expect(res.data.preset.spatialFrames[0].prompt).not.toMatch(/Clip skip/i);
    });

    it('preserves image meta.clipSkip and reports the unmapped parameter', async () => {
      const restData = {
        items: [
          {
            id: 1234567,
            username: 'tester',
            baseModel: 'SDXL 1.0',
            meta: { prompt: 'a portrait', Model: 'pixel-wave', clipSkip: 3, resources: [] },
          },
        ],
      };
      const mockFetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(restData),
        json: async () => restData,
      }));
      const handler = handleExtractCivitaiWorkflow(createMockWorkflowDeps(mockFetch));
      const res = createMockRes();

      await handler({ body: { url: 'https://civitai.com/images/1234567' } } as any, res);

      expect(res.statusCode).toBe(200);
      expect(res.data.otherMetadata.clipSkip).toBe(3);
      expect(res.data.preset.importWarnings).toEqual([
        expect.objectContaining({ field: 'clipSkip', value: 3, sent: false }),
      ]);
    });
  });

  describe('HIGH 6: No artificial fallback defaults', () => {
    it('does not forge artificial defaults for duration, fps, aspect_ratio, denoise, or fake VAE', async () => {
      const mockFetch = vi.fn();
      const handler = handleExtractCivitaiWorkflow(createMockWorkflowDeps(mockFetch));

      // Import via raw parameters that specify only prompt and steps
      const req = {
        body: {
          rawText: 'A beautiful mountain landscape at sunset\nSteps: 30, CFG scale: 7, Model: my_checkpoint.safetensors',
          engine: 'civitai',
        },
      } as any;
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      const otherMetadata = res.data.otherMetadata;

      // No fake VAE
      expect(otherMetadata.vae).toBeNull();

      // No fake denoise
      expect(otherMetadata.denoise).toBeNull();

      // No fake video duration
      expect(otherMetadata.duration).toBeNull();

      // KSampler node must not have forged denoise
      const ksamplerNode = res.data.preset.nodes.find((n: any) => n.type === 'KSampler');
      expect(ksamplerNode).toBeDefined();
      expect(ksamplerNode.values.denoise).toBeUndefined();
    });
  });

  describe('HIGH 7: Cross-provider adaptation in extract-workflow response', () => {
    it('returns preset.providerAdaptation and preset.currentAdaptation with per-field outcomes', async () => {
      const mockFetch = vi.fn();
      const handler = handleExtractCivitaiWorkflow(createMockWorkflowDeps(mockFetch));

      const req = {
        body: {
          rawText:
            'masterpiece, 1girl, portrait, sunset <lora:AsianMix:0.8>\nNegative prompt: blurry, bad anatomy\nSteps: 25, Sampler: DPM++ 2M, Schedule type: Karras, CFG scale: 7, Seed: 12345, Size: 1024x1024, Model: sdxl_base_1.0.safetensors',
          engine: 'fal',
        },
      } as any;
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.data.success).toBe(true);

      const preset = res.data.preset;
      expect(preset.providerAdaptation).toBeDefined();
      expect(preset.currentAdaptation).toBeDefined();
      expect(preset.currentAdaptation.provider).toBe('fal');

      // Check per-field adaptation details on Fal
      expect(preset.currentAdaptation.fields.prompt.status).toBe('mapped');
      expect(preset.currentAdaptation.fields.size.mappedValue).toEqual({ width: 1024, height: 1024 });
      expect(preset.currentAdaptation.fields.steps.targetField).toBe('num_inference_steps');
      expect(preset.currentAdaptation.fields.cfg.targetField).toBe('guidance_scale');

      // Also verifies other provider adaptations are precomputed
      expect(preset.providerAdaptation.civitai).toBeDefined();
      expect(preset.providerAdaptation.replicate).toBeDefined();
      expect(preset.providerAdaptation.wavespeed).toBeDefined();
      expect(preset.providerAdaptation.tensorart).toBeDefined();
      expect(preset.providerAdaptation.modelscope).toBeDefined();
    });
  });

  describe('P1-2: Civitai REST image meta resolution (modelId@versionId and canonical AIR)', () => {
    it('resolves modelId via GET /api/v1/model-versions/{id} from REST-shaped fixture without modelId', async () => {
      const mockFetch = vi.fn(async (_meta: any, url: string) => {
        if (url.includes('/api/v1/images?imageId=64399178')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              items: [
                {
                  id: 64399178,
                  url: 'https://image.civitai.com/preview.jpg',
                  baseModel: 'Flux.1 D',
                  meta: {
                    prompt: 'A close-up portrait',
                    civitaiResources: [
                      { type: 'checkpoint', modelVersionId: 691639, modelVersionName: 'Dev' },
                      { type: 'lora', modelVersionId: 1527024, modelVersionName: 'Cinematic 1940s', weight: 0.3 },
                    ],
                  },
                },
              ],
            }),
          };
        }
        if (url.includes('691639')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: 691639,
              modelId: 618692,
              name: 'Dev',
              baseModel: 'Flux.1 D',
              air: 'urn:air:flux1:checkpoint:civitai:618692@691639',
              downloadUrl: 'https://civitai.com/api/download/models/691639',
              downloadUrls: ['https://civitai.com/api/download/models/691639'],
              canGenerate: true,
            }),
          };
        }
        if (url.includes('1527024')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: 1527024,
              modelId: 1351798,
              name: 'Cinematic 1940s',
              baseModel: 'Flux.1 D',
              air: 'urn:air:flux1:lora:civitai:1351798@1527024',
              downloadUrl: 'https://civitai.com/api/download/models/1527024',
              downloadUrls: ['https://civitai.com/api/download/models/1527024'],
              canGenerate: true,
            }),
          };
        }
        return { ok: false, status: 404, text: async () => 'Not found' };
      });

      const handler = handleExtractCivitaiWorkflow(createMockWorkflowDeps(mockFetch));
      const req = { body: { imageId: '64399178', engine: 'civitai' } } as any;
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.data.success).toBe(true);

      const preset = res.data.preset;
      // Checkpoint must have canonical AIR with both modelId (618692) and versionId (691639)
      const ckptNode = preset.nodes.find((n: any) => n.type === 'CheckpointLoaderSimple');
      expect(ckptNode.values.ckpt_name).toBe('urn:air:flux1:checkpoint:civitai:618692@691639');

      // LoRA node must have canonical AIR with both modelId (1351798) and versionId (1527024)
      const loraNode = preset.nodes.find((n: any) => n.type === 'LoRALoader');
      expect(loraNode).toBeDefined();
      expect(loraNode.values.civitai_id).toBe('urn:air:flux1:lora:civitai:1351798@1527024');

      // Fal download URL must use the version id (1527024), never the model id
      expect(preset.providerAdaptation.fal.loras[0].sendableUrlOrId).toBe('https://civitai.com/api/download/models/1527024');
      expect(preset.providerAdaptation.fal.loras[0].sendableUrlOrId).not.toContain('1351798');
    });
  });

  describe('P1-3: Chained LoRALoader nodes for all imported LoRAs', () => {
    it('creates chained LoRALoader nodes in series when multiple LoRAs are imported', async () => {
      const mockFetch = vi.fn(async (_meta: any, url: string) => {
        if (url.includes('/api/v1/images?imageId=64399178')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              items: [
                {
                  id: 64399178,
                  baseModel: 'Flux.1 D',
                  meta: {
                    prompt: 'A close-up portrait',
                    civitaiResources: [
                      { type: 'checkpoint', modelVersionId: 691639 },
                      { type: 'lora', modelVersionId: 1527024, modelVersionName: 'Cinematic 1940s', weight: 0.3 },
                      { type: 'lora', modelVersionId: 1526912, modelVersionName: 'Cinematic Octane', weight: 0.2 },
                    ],
                  },
                },
              ],
            }),
          };
        }
        if (url.includes('/api/v1/model-versions/691639')) {
          return { ok: true, status: 200, json: async () => ({ id: 691639, modelId: 618692, air: 'urn:air:flux1:checkpoint:civitai:618692@691639' }) };
        }
        if (url.includes('/api/v1/model-versions/1527024')) {
          return { ok: true, status: 200, json: async () => ({ id: 1527024, modelId: 1351798, air: 'urn:air:flux1:lora:civitai:1351798@1527024' }) };
        }
        if (url.includes('/api/v1/model-versions/1526912')) {
          return { ok: true, status: 200, json: async () => ({ id: 1526912, modelId: 1351600, air: 'urn:air:flux1:lora:civitai:1351600@1526912' }) };
        }
        return { ok: false, status: 404, text: async () => 'Not found' };
      });

      const handler = handleExtractCivitaiWorkflow(createMockWorkflowDeps(mockFetch));
      const req = { body: { imageId: '64399178', engine: 'civitai' } } as any;
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      const preset = res.data.preset;

      // Both LoRAs must become nodes
      const loraNodes = preset.nodes.filter((n: any) => n.type === 'LoRALoader');
      expect(loraNodes).toHaveLength(2);
      expect(loraNodes[0].values.strength_model).toBe(0.3);
      expect(loraNodes[1].values.strength_model).toBe(0.2);

      // Verify connection chain: ckpt -> lora1 -> lora2 -> ksampler
      const m1 = preset.connections.find((c: any) => c.fromNodeId === 'node-imp-1' && c.toNodeId === 'node-imp-lora-1' && c.toSocketId === 'model');
      expect(m1).toBeDefined();

      const m2 = preset.connections.find((c: any) => c.fromNodeId === 'node-imp-lora-1' && c.toNodeId === 'node-imp-lora-2' && c.toSocketId === 'model');
      expect(m2).toBeDefined();

      const m3 = preset.connections.find((c: any) => c.fromNodeId === 'node-imp-lora-2' && c.toNodeId === 'node-imp-6' && c.toSocketId === 'model');
      expect(m3).toBeDefined();
    });
  });

  describe('P2-3: Real token consent verification', () => {
    it('does NOT append token when consent is false and marks requireAuth LoRA requires_consent', async () => {
      const mockFetch = vi.fn(async (_meta: any, url: string) => {
        if (url.includes('/api/v1/images?imageId=64399178')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              items: [
                {
                  id: 64399178,
                  baseModel: 'Flux.1 D',
                  meta: {
                    prompt: 'portrait',
                    civitaiResources: [{ type: 'lora', modelVersionId: 1527024, weight: 0.8 }],
                  },
                },
              ],
            }),
          };
        }
        if (url.includes('/api/v1/model-versions/mini/1527024')) {
          return { ok: true, status: 200, json: async () => ({ air: 'urn:air:flux1:lora:civitai:1351798@1527024', requireAuth: true, baseModel: 'Flux.1 D', downloadUrls: ['https://civitai.com/api/download/models/1527024'] }) };
        }
        if (url.includes('/api/v1/model-versions/1527024')) {
          return { ok: true, status: 200, json: async () => ({ id: 1527024, modelId: 1351798, baseModel: 'Flux.1 D', downloadUrl: 'https://civitai.com/api/download/models/1527024' }) };
        }
        return { ok: false, status: 404, text: async () => 'Not found' };
      });

      const handler = handleExtractCivitaiWorkflow(createMockWorkflowDeps(mockFetch));
      const req = { body: { imageId: '64399178', engine: 'fal', consentCivitaiToken: false } } as any;
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      const falAdaptation = res.data.preset.currentAdaptation;
      expect(falAdaptation.loras[0].requiresAuthConsent).toBe(true);
      expect(falAdaptation.loras[0].status).toBe('requires_consent');
      expect(falAdaptation.loras[0].sendableUrlOrId).toBeUndefined();
    });

    it('appends token to third-party URL when consent is explicitly granted', async () => {
      const mockFetch = vi.fn(async (_meta: any, url: string) => {
        if (url.includes('/api/v1/images?imageId=64399178')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              items: [
                {
                  id: 64399178,
                  baseModel: 'Flux.1 D',
                  meta: {
                    prompt: 'portrait',
                    civitaiResources: [{ type: 'lora', modelVersionId: 1527024, weight: 0.8 }],
                  },
                },
              ],
            }),
          };
        }
        if (url.includes('/api/v1/model-versions/mini/1527024')) {
          return { ok: true, status: 200, json: async () => ({ air: 'urn:air:flux1:lora:civitai:1351798@1527024', requireAuth: true, baseModel: 'Flux.1 D', downloadUrls: ['https://civitai.com/api/download/models/1527024'] }) };
        }
        if (url.includes('/api/v1/model-versions/1527024')) {
          return { ok: true, status: 200, json: async () => ({ id: 1527024, modelId: 1351798, baseModel: 'Flux.1 D', downloadUrl: 'https://civitai.com/api/download/models/1527024' }) };
        }
        return { ok: false, status: 404, text: async () => 'Not found' };
      });

      const handler = handleExtractCivitaiWorkflow(createMockWorkflowDeps(mockFetch));
      const req = {
        body: { imageId: '64399178', engine: 'fal', consentCivitaiToken: true },
        headers: { 'x-civitai-token': 'user_secret_token_123' },
      } as any;
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      const falAdaptation = res.data.preset.currentAdaptation;
      expect(falAdaptation.loras[0].status).toBe('compatible');
      expect(falAdaptation.loras[0].sendableUrlOrId).toContain('https://civitai.com/api/download/models/1527024?token=user_secret_token_123');

      // P2-4: verify node in preset also has token in download_url
      const loraNode = res.data.preset.nodes.find((n: any) => n.type === 'LoRALoader');
      expect(loraNode).toBeDefined();
      expect(loraNode.values.download_url).toBe('https://civitai.com/api/download/models/1527024?token=user_secret_token_123');
    });

    it('P2-1 & P2-2: preserves known weights from resources/prompt and reports 404 hashes in warnings', async () => {
      const mockFetch = vi.fn(async (_meta: any, url: string) => {
        if (url.includes('/api/v1/images')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              items: [
                {
                  id: 11346154,
                  baseModel: 'SD 1.5',
                  meta: {
                    prompt: 'a photo <lora:backlight_slider_v10:-1.5>, <lora:contrast_slider_v10:2>',
                    sampler: 'Euler a',
                    clipSkip: 2,
                    resources: [
                      { hash: '0ba50a104a1b', name: 'contrast_slider_v10', type: 'lora', weight: 2 },
                      { hash: 'bce77b76fba3', name: 'backlight_slider_v10', type: 'lora' },
                    ],
                    hashes: {
                      model: '93f7411be9',
                      'lora:contrast_slider_v10': '0ba50a104a1b',
                      'lora:backlight_slider_v10': 'bce77b76fba3',
                      'lora:missing_404_lora': 'deadbeef404',
                    },
                  },
                },
              ],
            }),
          };
        }
        if (url.includes('by-hash/93f7411be9')) {
          return { ok: true, status: 200, json: async () => ({ id: 393843, modelId: 94809, name: 'realcartoon3d_v15', baseModel: 'SD 1.5' }) };
        }
        if (url.includes('by-hash/0ba50a104a1b')) {
          return { ok: true, status: 200, json: async () => ({ id: 10001, modelId: 20001, name: 'contrast_slider_v10', baseModel: 'SD 1.5' }) };
        }
        if (url.includes('by-hash/bce77b76fba3')) {
          return { ok: true, status: 200, json: async () => ({ id: 10002, modelId: 20002, name: 'backlight_slider_v10', baseModel: 'SD 1.5' }) };
        }
        if (url.includes('by-hash/deadbeef404')) {
          return { ok: false, status: 404, text: async () => 'Model not found' };
        }
        if (url.includes('/api/v1/model-versions/mini/')) {
          return { ok: true, status: 200, json: async () => ({ canGenerate: true }) };
        }
        if (url.includes('/api/v1/model-versions/')) {
          return { ok: true, status: 200, json: async () => ({ id: 10001, modelId: 20001, baseModel: 'SD 1.5' }) };
        }
        return { ok: false, status: 404, text: async () => 'Not found' };
      });

      const handler = handleExtractCivitaiWorkflow(createMockWorkflowDeps(mockFetch));
      const res = createMockRes();

      await handler({ body: { imageId: '11346154', engine: 'civitai' } } as any, res);

      expect(res.statusCode).toBe(200);
      const loras = res.data.preset.currentAdaptation.loras;
      const contrast = loras.find((l: any) => l.name.includes('contrast'));
      const backlight = loras.find((l: any) => l.name.includes('backlight'));

      // P2-1: weights must be preserved!
      expect(contrast).toBeDefined();
      expect(contrast.originalStrength).toBe(2);
      expect(contrast.scale).toBe(2);

      expect(backlight).toBeDefined();
      expect(backlight.originalStrength).toBe(-1.5);
      expect(backlight.scale).toBe(-1.5);

      // P2-2: 404 hash must be in importWarnings, never silently dropped!
      const warnings = res.data.preset.importWarnings;
      expect(warnings.some((w: any) => w.reason?.includes('deadbeef404'))).toBe(true);

      // M11: SD 1.5 clipSkip is now mapped to clipSkip and will be sent
      expect(res.data.preset.currentAdaptation.fields.clipSkip.status).toBe('mapped');
      expect(res.data.preset.currentAdaptation.fields.clipSkip.targetField).toBe('clipSkip');
      expect(warnings.some((w: any) => w.field === 'clipSkip')).toBe(false);

      // P1-1 (a): Euler a on sdcpp must map to euler_a on KSampler
      const ksampler = res.data.preset.nodes.find((n: any) => n.type === 'KSampler');
      expect(ksampler).toBeDefined();
      expect(ksampler.values.sampler_name).toBe('euler_a');
      expect(ksampler.values.clip_skip).toBe(2);
    });
  });

  describe('M24: Stop swallowing errors, stop fabricating downloadUrl/requireAuth, remove HTML fallback', () => {
    describe('Endpoint 1: GET /api/v1/model-versions/{id} (full version endpoint)', () => {
      it('returns failure with endpoint, status 404, and body verbatim on 404; does not fabricate downloadUrl or requireAuth', async () => {
        const body404 = '{"error":"No model version with id 99999"}';
        const stubbedFetch = vi.fn(async (_meta: any, url: string) => {
          if (url === 'https://civitai.com/api/v1/model-versions/99999') {
            return { ok: false, status: 404, text: async () => body404 };
          }
          throw new Error(`Unexpected url: ${url}`);
        });

        const result: any = await resolveCivitaiVersionInfo(99999, stubbedFetch);

        expect(result.success).toBe(false);
        expect(result.endpoint).toBe('https://civitai.com/api/v1/model-versions/99999');
        expect(result.status).toBe(404);
        expect(result.rawResponse).toBe(body404);
        expect(result.details).toBe(body404);
        expect(result.errorSource).toBe('upstream');
        expect(result.downloadUrl).toBeUndefined();
        expect(result.requireAuth).toBeUndefined();
      });

      it('returns failure with endpoint, status 500, and body verbatim on 500; does not fabricate downloadUrl or requireAuth', async () => {
        const body500 = '{"error":"Internal Server Error in model version service"}';
        const stubbedFetch = vi.fn(async (_meta: any, url: string) => {
          if (url === 'https://civitai.com/api/v1/model-versions/99999') {
            return { ok: false, status: 500, text: async () => body500 };
          }
          throw new Error(`Unexpected url: ${url}`);
        });

        const result: any = await resolveCivitaiVersionInfo(99999, stubbedFetch);

        expect(result.success).toBe(false);
        expect(result.endpoint).toBe('https://civitai.com/api/v1/model-versions/99999');
        expect(result.status).toBe(500);
        expect(result.rawResponse).toBe(body500);
        expect(result.details).toBe(body500);
        expect(result.errorSource).toBe('upstream');
        expect(result.downloadUrl).toBeUndefined();
        expect(result.requireAuth).toBeUndefined();
      });

      it('returns failure with endpoint, status 502, and network error verbatim on network failure; does not fabricate downloadUrl or requireAuth', async () => {
        const stubbedFetch = vi.fn(async () => {
          throw new Error('connect ECONNREFUSED 104.18.22.45:443');
        });

        const result: any = await resolveCivitaiVersionInfo(99999, stubbedFetch);

        expect(result.success).toBe(false);
        expect(result.endpoint).toBe('https://civitai.com/api/v1/model-versions/99999');
        expect(result.status).toBe(502);
        expect(result.error).toContain('connect ECONNREFUSED 104.18.22.45:443');
        expect(result.errorSource).toBe('network');
        expect(result.downloadUrl).toBeUndefined();
        expect(result.requireAuth).toBeUndefined();
      });
    });

    describe('Endpoint 2: GET /api/v1/model-versions/mini/{id} (mini version endpoint)', () => {
      it('returns failure with mini endpoint, status 404, and body verbatim when mini endpoint answers 404', async () => {
        const fullBody = JSON.stringify({ id: 99999, modelId: 88888, name: 'v1.0', baseModel: 'SDXL 1.0' });
        const miniBody404 = '{"error":"Mini model version not found"}';
        const stubbedFetch = vi.fn(async (_meta: any, url: string) => {
          if (url === 'https://civitai.com/api/v1/model-versions/99999') {
            return { ok: true, status: 200, text: async (): Promise<string> => fullBody, json: async () => JSON.parse(fullBody) };
          }
          if (url === 'https://civitai.com/api/v1/model-versions/mini/99999') {
            return { ok: false, status: 404, text: async (): Promise<string> => miniBody404 };
          }
          throw new Error(`Unexpected url: ${url}`);
        });

        const result: any = await resolveCivitaiVersionInfo(99999, stubbedFetch);

        expect(result.success).toBe(false);
        expect(result.endpoint).toBe('https://civitai.com/api/v1/model-versions/mini/99999');
        expect(result.status).toBe(404);
        expect(result.rawResponse).toBe(miniBody404);
        expect(result.details).toBe(miniBody404);
        expect(result.errorSource).toBe('upstream');
        expect(result.downloadUrl).toBeUndefined();
        expect(result.requireAuth).toBeUndefined();
      });

      it('returns failure with mini endpoint, status 500, and body verbatim when mini endpoint answers 500', async () => {
        const fullBody = JSON.stringify({ id: 99999, modelId: 88888, name: 'v1.0', baseModel: 'SDXL 1.0' });
        const miniBody500 = '{"error":"Mini endpoint database timeout 500"}';
        const stubbedFetch = vi.fn(async (_meta: any, url: string) => {
          if (url === 'https://civitai.com/api/v1/model-versions/99999') {
            return { ok: true, status: 200, text: async (): Promise<string> => fullBody, json: async () => JSON.parse(fullBody) };
          }
          if (url === 'https://civitai.com/api/v1/model-versions/mini/99999') {
            return { ok: false, status: 500, text: async (): Promise<string> => miniBody500 };
          }
          throw new Error(`Unexpected url: ${url}`);
        });

        const result: any = await resolveCivitaiVersionInfo(99999, stubbedFetch);

        expect(result.success).toBe(false);
        expect(result.endpoint).toBe('https://civitai.com/api/v1/model-versions/mini/99999');
        expect(result.status).toBe(500);
        expect(result.rawResponse).toBe(miniBody500);
        expect(result.details).toBe(miniBody500);
        expect(result.errorSource).toBe('upstream');
        expect(result.downloadUrl).toBeUndefined();
        expect(result.requireAuth).toBeUndefined();
      });

      it('returns failure with mini endpoint, status 502, and network error verbatim when mini endpoint throws network failure', async () => {
        const fullBody = JSON.stringify({ id: 99999, modelId: 88888, name: 'v1.0', baseModel: 'SDXL 1.0' });
        const stubbedFetch = vi.fn(async (_meta: any, url: string) => {
          if (url === 'https://civitai.com/api/v1/model-versions/99999') {
            return { ok: true, status: 200, text: async () => fullBody, json: async () => JSON.parse(fullBody) };
          }
          if (url === 'https://civitai.com/api/v1/model-versions/mini/99999') {
            throw new Error('socket hang up on mini endpoint');
          }
          throw new Error(`Unexpected url: ${url}`);
        });

        const result: any = await resolveCivitaiVersionInfo(99999, stubbedFetch);

        expect(result.success).toBe(false);
        expect(result.endpoint).toBe('https://civitai.com/api/v1/model-versions/mini/99999');
        expect(result.status).toBe(502);
        expect(result.error).toContain('socket hang up on mini endpoint');
        expect(result.errorSource).toBe('network');
        expect(result.downloadUrl).toBeUndefined();
        expect(result.requireAuth).toBeUndefined();
      });
    });

    describe('Endpoint 3: GET /api/v1/model-versions/by-hash/{hash} (hash lookup endpoint)', () => {
      it('returns failure with hash endpoint, status 404, and body verbatim on 404; does not fabricate downloadUrl or requireAuth', async () => {
        const hashBody404 = '{"error":"Model not found by hash deadbeef123"}';
        const stubbedFetch = vi.fn(async (_meta: any, url: string) => {
          if (url.includes('/api/v1/model-versions/by-hash/deadbeef123')) {
            return { ok: false, status: 404, text: async () => hashBody404 };
          }
          throw new Error(`Unexpected url: ${url}`);
        });

        const result: any = await resolveCivitaiVersionByHash('deadbeef123', stubbedFetch);

        expect(result.success).toBe(false);
        expect(result.endpoint).toBe('https://civitai.com/api/v1/model-versions/by-hash/deadbeef123');
        expect(result.status).toBe(404);
        expect(result.rawResponse).toBe(hashBody404);
        expect(result.details).toBe(hashBody404);
        expect(result.errorSource).toBe('upstream');
        expect(result.downloadUrl).toBeUndefined();
        expect(result.requireAuth).toBeUndefined();
      });

      it('returns failure with hash endpoint, status 500, and body verbatim on 500; does not fabricate downloadUrl or requireAuth', async () => {
        const hashBody500 = '{"error":"Civitai hash index internal error 500"}';
        const stubbedFetch = vi.fn(async (_meta: any, url: string) => {
          if (url.includes('/api/v1/model-versions/by-hash/deadbeef123')) {
            return { ok: false, status: 500, text: async () => hashBody500 };
          }
          throw new Error(`Unexpected url: ${url}`);
        });

        const result: any = await resolveCivitaiVersionByHash('deadbeef123', stubbedFetch);

        expect(result.success).toBe(false);
        expect(result.endpoint).toBe('https://civitai.com/api/v1/model-versions/by-hash/deadbeef123');
        expect(result.status).toBe(500);
        expect(result.rawResponse).toBe(hashBody500);
        expect(result.details).toBe(hashBody500);
        expect(result.errorSource).toBe('upstream');
        expect(result.downloadUrl).toBeUndefined();
        expect(result.requireAuth).toBeUndefined();
      });

      it('returns failure with hash endpoint, status 502, and network error verbatim on network failure; does not fabricate downloadUrl or requireAuth', async () => {
        const stubbedFetch = vi.fn(async () => {
          throw new Error('getaddrinfo EAI_AGAIN civitai.com');
        });

        const result: any = await resolveCivitaiVersionByHash('deadbeef123', stubbedFetch);

        expect(result.success).toBe(false);
        expect(result.endpoint).toBe('https://civitai.com/api/v1/model-versions/by-hash/deadbeef123');
        expect(result.status).toBe(502);
        expect(result.error).toContain('getaddrinfo EAI_AGAIN civitai.com');
        expect(result.errorSource).toBe('network');
        expect(result.downloadUrl).toBeUndefined();
        expect(result.requireAuth).toBeUndefined();
      });
    });

    describe('Endpoint 4: GET /api/v1/images (fetchCivitaiRealImageMeta - REST only, no HTML fallback)', () => {
      it('returns failure with REST endpoint, status 404, and body verbatim on 404; NEVER requests HTML page', async () => {
        const requestedUrls: string[] = [];
        const imgBody404 = '{"items":[]}';
        const stubbedFetch = vi.fn(async (_meta: any, url: string) => {
          requestedUrls.push(url);
          if (url.includes('/api/v1/images')) {
            return { ok: true, status: 200, text: async () => imgBody404, json: async () => JSON.parse(imgBody404) };
          }
          throw new Error(`Unexpected url: ${url}`);
        });

        const result = await fetchCivitaiRealImageMeta('999999', stubbedFetch);

        expect(result.error).toBe('Civitai 图片 #999999 未在官方图片库找到 (items 为空)');
        expect(result.status).toBe(404);
        expect(result.endpoint).toBe('https://civitai.com/api/v1/images?imageId=999999&withMeta=true');
        expect(result.errorSource).toBe('upstream');

        // Strictly verify that NO HTML scraping request was made
        expect(requestedUrls.some((u) => u.includes('civitai.com/images/999999'))).toBe(false);
        expect(requestedUrls.length).toBe(1);
      });

      it('returns failure with REST endpoint, status 500, and body verbatim on 500; NEVER requests HTML page', async () => {
        const requestedUrls: string[] = [];
        const imgBody500 = '{"error":"Internal error in images service 500"}';
        const stubbedFetch = vi.fn(async (_meta: any, url: string) => {
          requestedUrls.push(url);
          if (url.includes('/api/v1/images')) {
            return { ok: false, status: 500, text: async () => imgBody500 };
          }
          throw new Error(`Unexpected url: ${url}`);
        });

        const result = await fetchCivitaiRealImageMeta('999999', stubbedFetch);

        expect(result.error).toBe('Civitai images 上游响应 HTTP 500');
        expect(result.status).toBe(500);
        expect(result.endpoint).toBe('https://civitai.com/api/v1/images?imageId=999999&withMeta=true');
        expect(result.rawResponse).toBe(imgBody500);
        expect(result.details).toBe(imgBody500);
        expect(result.errorSource).toBe('upstream');

        // Strictly verify that NO HTML scraping request was made
        expect(requestedUrls.some((u) => u.includes('civitai.com/images/999999'))).toBe(false);
        expect(requestedUrls.length).toBe(1);
      });

      it('returns failure with REST endpoint, status 502, and network error verbatim on network failure; NEVER requests HTML page', async () => {
        const requestedUrls: string[] = [];
        const stubbedFetch = vi.fn(async (_meta: any, url: string) => {
          requestedUrls.push(url);
          throw new Error('read ECONNRESET on images endpoint');
        });

        const result = await fetchCivitaiRealImageMeta('999999', stubbedFetch);

        expect(result.error).toContain('Civitai images API 网络错误: read ECONNRESET on images endpoint');
        expect(result.status).toBe(502);
        expect(result.endpoint).toBe('https://civitai.com/api/v1/images?imageId=999999&withMeta=true');
        expect(result.errorSource).toBe('network');

        // Strictly verify that NO HTML scraping request was made
        expect(requestedUrls.some((u) => u.includes('civitai.com/images/999999'))).toBe(false);
        expect(requestedUrls.length).toBe(1);
      });
    });

    describe('End-to-end /api/civitai/extract-workflow: handles unresolved version without fabricated downloadUrl/requireAuth', () => {
      it('surfaces upstream 404 in warnings and unresolved status without inventing downloadUrl or requireAuth: false', async () => {
        const stubbedFetch = vi.fn(async (_meta: any, url: string) => {
          if (url.includes('/api/v1/images?imageId=55555')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                items: [
                  {
                    id: 55555,
                    baseModel: 'Flux.1 D',
                    meta: {
                      prompt: 'masterpiece portrait',
                      civitaiResources: [
                        { type: 'checkpoint', modelVersionId: 691639, modelVersionName: 'Dev' },
                        { type: 'lora', modelVersionId: 404040, modelVersionName: 'MissingLoRA', weight: 0.7 },
                      ],
                    },
                  },
                ],
              }),
            };
          }
          if (url.includes('691639')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                id: 691639,
                modelId: 618692,
                name: 'Dev',
                baseModel: 'Flux.1 D',
                air: 'urn:air:flux1:checkpoint:civitai:618692@691639',
                downloadUrl: 'https://civitai.com/api/download/models/691639',
              }),
            };
          }
          if (url.includes('404040')) {
            return {
              ok: false,
              status: 404,
              text: async () => '{"error":"Model version 404040 not found"}',
            };
          }
          throw new Error(`Unexpected url: ${url}`);
        });

        const handler = handleExtractCivitaiWorkflow(createMockWorkflowDeps(stubbedFetch));
        const res = createMockRes();

        await handler({ body: { imageId: '55555', engine: 'civitai' } } as any, res);

        expect(res.statusCode).toBe(200);
        expect(res.data.success).toBe(true);

        const loraNode = res.data.preset.nodes.find((n: any) => n.type === 'LoRALoader');
        expect(loraNode).toBeDefined();

        // Must NOT invent download_url
        expect(loraNode.values.download_url).toBeUndefined();

        // Must be marked unresolved with the verbatim upstream error
        expect(loraNode.values.import_unresolved_resource).toBe(true);
        expect(loraNode.values.resourceVerified).toBe(false);
        expect(loraNode.values.unresolvedReason).toContain('404');
        expect(loraNode.values.unresolvedReason).toContain('https://civitai.com/api/v1/model-versions/404040');

        // Warnings must include the upstream failure verbatim
        const warnings = res.data.preset.importWarnings;
        expect(warnings.some((w: any) => w.reason?.includes('404040') && w.reason?.includes('404'))).toBe(true);
      });
    });
  });
});
