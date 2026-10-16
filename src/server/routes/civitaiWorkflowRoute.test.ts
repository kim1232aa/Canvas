import { describe, expect, it, vi } from 'vitest';
import { handleExtractCivitaiWorkflow, type CivitaiWorkflowDeps } from './civitaiWorkflowRoute';
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
});
