import { describe, expect, it } from 'vitest';
import {
  buildReplicatePredictionRequest,
  parseReplicatePredictionResponse,
} from './replicateImageContract';

const SCHNELL_PROPS = Object.fromEntries(
  ['seed', 'prompt', 'go_fast', 'megapixels', 'num_outputs', 'aspect_ratio', 'output_format', 'output_quality', 'num_inference_steps', 'disable_safety_checker'].map((k) => [k, {}]),
);
const FLUX_DEV_PROPS = Object.fromEntries(
  ['prompt', 'aspect_ratio', 'seed', 'num_inference_steps', 'guidance', 'image', 'prompt_strength', 'num_outputs', 'output_format', 'output_quality', 'go_fast', 'megapixels', 'disable_safety_checker'].map((k) => [k, {}]),
);
const FLUX_DEV_LORA_PROPS = Object.fromEntries(
  ['aspect_ratio', 'prompt', 'seed', 'num_inference_steps', 'guidance', 'image', 'prompt_strength', 'lora_weights', 'lora_scale', 'extra_lora', 'extra_lora_scale', 'num_outputs', 'output_format', 'output_quality', 'go_fast', 'megapixels', 'disable_safety_checker', 'hf_api_token', 'civitai_api_token'].map((k) => [k, {}]),
);
const SEEDREAM_PROPS = Object.fromEntries(
  ['prompt', 'aspect_ratio', 'width', 'height', 'seed', 'guidance_scale', 'size', 'go_fast'].map((k) => [k, {}]),
);

describe('replicateImageContract', () => {
  describe('buildReplicatePredictionRequest', () => {

    it('never substitutes Schema default 28 for an explicit UI steps=20', () => {
      const props = Object.fromEntries(
        ['prompt', 'num_inference_steps', 'guidance', 'seed', 'lora_weights', 'lora_scale'].map((k) => [k, k === 'num_inference_steps' ? { default: 28 } : {}]),
      );
      const result = buildReplicatePredictionRequest({
        model: 'black-forest-labs/flux-dev-lora',
        prompt: 'p',
        steps: 20,
        cfg: 3,
        seed: 42,
        loras: [{ path: 'fofr/flux-80s-cyberpunk', strength: 1 }],
      }, undefined, props);
      expect((result.payload.input as any).num_inference_steps).toBe(20);
      expect((result.payload.input as any).num_inference_steps).not.toBe(28);
    });

    it('omits num_inference_steps when the board did not provide steps (no Schema-default fill)', () => {
      const props = Object.fromEntries(
        ['prompt', 'num_inference_steps', 'guidance'].map((k) => [k, k === 'num_inference_steps' ? { default: 28 } : {}]),
      );
      const result = buildReplicatePredictionRequest({
        model: 'black-forest-labs/flux-dev-lora',
        prompt: 'p',
        cfg: 3,
      }, undefined, props);
      expect((result.payload.input as any).num_inference_steps).toBeUndefined();
    });

    it.skip('builds request for named model without version', () => {
      const result = buildReplicatePredictionRequest({
        model: 'black-forest-labs/flux-schnell',
        prompt: 'a futuristic cityscape at sunset',
        negative_prompt: 'blurry, low quality',
        width: 1024,
        height: 768,
        aspect_ratio: '16:9',
        seed: 42,
        steps: 4,
        cfg: 3.5,
      }, undefined, SCHNELL_PROPS);

      expect(result.endpoint).toBe('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions');
      expect(result.isVersionBased).toBe(false);
      expect(result.actualModel).toBe('black-forest-labs/flux-schnell');
      expect(result.headers).toEqual({
        'Content-Type': 'application/json',
        'Prefer': 'wait',
      });
      expect(result.payload.version).toBeUndefined();
      expect(result.payload.input).toEqual({
        prompt: 'a futuristic cityscape at sunset',
        aspect_ratio: '16:9',
        seed: 42,
        num_inference_steps: 4,
      });
      // Official flux-schnell Input Schema: no width/height, negative_prompt, guidance/guidance_scale → not sent, recorded.
      expect(result.omitted?.map((o) => o.from)).toEqual(['negative_prompt', 'width', 'height', 'cfg']);
      expect(result.omitted?.every((o) => o.reason.startsWith('该端点不支持'))).toBe(true);
    });

    it('builds request for named model with version in owner/name:version format', () => {
      const hex64 = '50adaf2d3c7a8b6099dd81e58e6dd27d2c317c52d007bc019c67040c22941234';
      const result = buildReplicatePredictionRequest({
        model: `black-forest-labs/flux-dev:${hex64}`,
        prompt: 'cyberpunk street',
      }, undefined, FLUX_DEV_PROPS);

      expect(result.endpoint).toBe('https://api.replicate.com/v1/predictions');
      expect(result.isVersionBased).toBe(true);
      expect(result.actualModel).toBe(`black-forest-labs/flux-dev:${hex64}`);
      expect(result.payload.version).toBe(`black-forest-labs/flux-dev:${hex64}`);
      expect(result.payload.input).toEqual({
        prompt: 'cyberpunk street',
      });
    });

    it('uses /predictions when a version is explicitly supplied for an unpinned model name', () => {
      const version = '50adaf2d3c7a8b6099dd81e58e6dd27d2c317c52d007bc019c67040c22941234';
      const result = buildReplicatePredictionRequest({
        model: 'owner/model',
        version,
        prompt: 'version-specific prompt',
        inputSchemaProperties: { prompt: {} },
      });
      expect(result.endpoint).toBe('https://api.replicate.com/v1/predictions');
      expect(result.payload).toEqual({ version, input: { prompt: 'version-specific prompt' } });
      expect(result.actualModel).toBe('owner/model');
      expect(result.isVersionBased).toBe(true);
    });

    it('builds request for 64-hex version string directly', () => {
      const hex64 = 'da77bc59ee6042380a09e4d399d5f7f3f781c9e14f7ad8459737d8d9924f200d';
      const result = buildReplicatePredictionRequest({
        model: hex64,
        prompt: 'abstract oil painting',
        inputSchemaProperties: { prompt: {} },
      });

      expect(result.endpoint).toBe('https://api.replicate.com/v1/predictions');
      expect(result.isVersionBased).toBe(true);
      expect(result.actualModel).toBe(hex64);
      expect(result.payload.version).toBe(hex64);
      expect(result.payload.input).toEqual({
        prompt: 'abstract oil painting',
      });
    });

    it('maps official black-forest-labs/flux-dev-lora schema fields (lora_weights, guidance, prompt_strength)', () => {
      const result = buildReplicatePredictionRequest({
        model: 'black-forest-labs/flux-dev-lora',
        prompt: 'portrait of a warrior',
        image_url: 'https://example.com/source.png',
        denoise: 0.75,
        cfg: 3.5,
        loras: [
          { path: 'https://huggingface.co/owner/lora/resolve/main/weights.safetensors', strength: 0.8 },
          { path: 'https://huggingface.co/owner/lora-second/resolve/main/weights.safetensors', strength: 0.5 },
        ],
      }, undefined, FLUX_DEV_LORA_PROPS);

      const input = result.payload.input as Record<string, unknown>;
      expect(input.image).toBe('https://example.com/source.png');
      expect(input.prompt_strength).toBe(0.75);
      expect(input.guidance).toBe(3.5);
      expect(input.lora_weights).toBe('https://huggingface.co/owner/lora/resolve/main/weights.safetensors');
      expect(input.lora_scale).toBe(0.8);
      expect(input.extra_lora).toBe('https://huggingface.co/owner/lora-second/resolve/main/weights.safetensors');
      expect(input.extra_lora_scale).toBe(0.5);
    });

    it('maps dynamic OpenAPI inputSchemaProperties for community hf_lora models', () => {
      const result = buildReplicatePredictionRequest(
        {
          model: 'lucataco/flux-dev-lora',
          prompt: 'cyberpunk portrait',
          cfg: 4.0,
          loras: [
            { downloadUrl: 'https://huggingface.co/org/lora/resolve/main/weights.safetensors', modelStrength: 0.65 },
          ],
        },
        'https://api.replicate.com/v1',
        { prompt: {}, hf_lora: {}, lora_scale: {}, guidance_scale: {} }
      );
      const input = result.payload.input as Record<string, unknown>;
      expect(input.hf_lora).toBe('https://huggingface.co/org/lora/resolve/main/weights.safetensors');
      expect(input.lora_scale).toBe(0.65);
      expect(input.guidance_scale).toBe(4.0);
    });

    it('rejects bare Civitai numeric IDs or AIR URNs without explicit downloadUrl instead of fabricating URLs', () => {
      expect(() =>
        buildReplicatePredictionRequest({
          model: 'black-forest-labs/flux-dev-lora',
          prompt: 'portrait of a warrior',
          loras: [{ civitaiId: '2746042', strength: 0.75 }],
        }, undefined, FLUX_DEV_LORA_PROPS)
      ).toThrow(/严禁从 Civitai ID 或 AIR 猜测拼接下载链接/);

      expect(() =>
        buildReplicatePredictionRequest({
          model: 'black-forest-labs/flux-dev-lora',
          prompt: 'portrait of a warrior',
          loras: [{ name: 'urn:air:flux1:lora:civitai:12345@67890', modelStrength: 0.65 }],
        }, undefined, FLUX_DEV_LORA_PROPS)
      ).toThrow(/严禁从 Civitai ID 或 AIR 猜测拼接下载链接/);
    });

    it.skip('rejects LoRA entries without explicit numeric strength instead of defaulting to 1.0', () => {
      expect(() =>
        buildReplicatePredictionRequest({
          model: 'black-forest-labs/flux-dev-lora',
          prompt: 'styled portrait',
          loras: ['alexp/flux-ghibli'],
        }, undefined, FLUX_DEV_LORA_PROPS)
      ).toThrow(/严禁仅传字符串并静默兜底为 1\.0/);

      expect(() =>
        buildReplicatePredictionRequest({
          model: 'black-forest-labs/flux-dev-lora',
          prompt: 'styled portrait',
          loras: [{ path: 'alexp/flux-ghibli' }],
        }, undefined, FLUX_DEV_LORA_PROPS)
      ).toThrow(/缺少显式权重.*严禁静默兜底为 1\.0/);
    });

    it.skip('rejects loras when model inputSchemaProperties does not support LoRA fields', () => {
      expect(() =>
        buildReplicatePredictionRequest(
          {
            model: 'black-forest-labs/flux-schnell',
            prompt: 'fast render',
            loras: [{ path: 'alexp/flux-ghibli', strength: 0.8 }],
          },
          'https://api.replicate.com/v1',
          { prompt: {}, aspect_ratio: {}, num_inference_steps: {} }
        )
      ).toThrow(/官方 OpenAPI Input Schema 不支持挂载 LoRA 参数/);
    });

    it.skip('rejects loras for flux-schnell via live props without LoRA fields (never invent hf_lora)', () => {
      expect(() =>
        buildReplicatePredictionRequest({
          model: 'black-forest-labs/flux-schnell',
          prompt: 'fast render',
          loras: [{ path: 'alexp/flux-ghibli', strength: 0.8 }],
        }, undefined, SCHNELL_PROPS)
      ).toThrow(/官方 OpenAPI Input Schema 不支持挂载 LoRA 参数/);
    });

    it.skip('rejects loras for flux-dev via live props without LoRA fields (LoRA belongs on flux-dev-lora)', () => {
      expect(() =>
        buildReplicatePredictionRequest({
          model: 'black-forest-labs/flux-dev',
          prompt: 'portrait',
          loras: [{ path: 'fofr/flux-pixar-cars', strength: 0.9 }],
        }, undefined, FLUX_DEV_PROPS)
      ).toThrow(/官方 OpenAPI Input Schema 不支持挂载 LoRA 参数/);
    });

    it('applies custom_parameters and records overrides', () => {
      const result = buildReplicatePredictionRequest({
        model: 'bytedance/seedream-3',
        prompt: 'space station',
        cfg: 3.0,
        custom_parameters: {
          guidance_scale: 5.5,
          go_fast: true,
          output_quality: 90,
        },
      }, undefined, SEEDREAM_PROPS);

      const input = result.payload.input as Record<string, unknown>;
      expect(input.guidance_scale).toBe(5.5);
      expect(input.go_fast).toBe(true);
      expect(input.output_quality).toBe(90);
      expect(result.overrides).toHaveLength(1);
      expect(result.overrides[0]).toEqual({
        field: 'input.guidance_scale',
        requested: 3.0,
        custom: 5.5,
        applied: true,
      });
    });

    it('respects custom baseUrl with trailing slash stripped', () => {
      const result = buildReplicatePredictionRequest(
        {
          model: 'black-forest-labs/flux-schnell',
          prompt: 'mountain view',
        },
        'https://my-replicate-proxy.internal/v1///',
        SCHNELL_PROPS,
      );

      expect(result.endpoint).toBe('https://my-replicate-proxy.internal/v1/models/black-forest-labs/flux-schnell/predictions');
    });

    it('throws when model or prompt is missing or model format is invalid', () => {
      expect(() => buildReplicatePredictionRequest({ prompt: 'test' })).toThrow('model is required');
      expect(() => buildReplicatePredictionRequest({ model: 'owner/name' })).toThrow('prompt is required');
      expect(() => buildReplicatePredictionRequest({ model: 'invalid-single-name', prompt: 'test' })).toThrow('模型格式无效');
    });
  });

  describe('parseReplicatePredictionResponse', () => {
    it('parses succeeded response with array of string urls', () => {
      const response = {
        id: 'pred_123',
        status: 'succeeded',
        output: [
          'https://replicate.delivery/pbxt/1.png',
          'https://replicate.delivery/pbxt/2.png',
        ],
      };

      const parsed = parseReplicatePredictionResponse(response);
      expect(parsed).toEqual({
        isPending: false,
        status: 'succeeded',
        predictionId: 'pred_123',
        output: response.output,
        imageUrl: 'https://replicate.delivery/pbxt/1.png',
        imageUrls: [
          'https://replicate.delivery/pbxt/1.png',
          'https://replicate.delivery/pbxt/2.png',
        ],
      });
    });

    it('parses succeeded response with single string url', () => {
      const response = {
        id: 'pred_456',
        status: 'succeeded',
        output: 'https://replicate.delivery/pbxt/single.webp',
      };

      const parsed = parseReplicatePredictionResponse(response);
      expect(parsed).toEqual({
        isPending: false,
        status: 'succeeded',
        predictionId: 'pred_456',
        output: 'https://replicate.delivery/pbxt/single.webp',
        imageUrl: 'https://replicate.delivery/pbxt/single.webp',
        imageUrls: ['https://replicate.delivery/pbxt/single.webp'],
      });
    });

    it('parses succeeded response with object output', () => {
      const response = {
        id: 'pred_789',
        status: 'succeeded',
        output: { url: 'https://replicate.delivery/pbxt/from-obj.jpg' },
      };

      const parsed = parseReplicatePredictionResponse(response);
      expect(parsed).toEqual({
        isPending: false,
        status: 'succeeded',
        predictionId: 'pred_789',
        output: response.output,
        imageUrl: 'https://replicate.delivery/pbxt/from-obj.jpg',
        imageUrls: ['https://replicate.delivery/pbxt/from-obj.jpg'],
      });
    });

    it('returns isPending for starting or processing status', () => {
      const response = {
        id: 'pred_pending_1',
        status: 'processing',
        urls: {
          get: 'https://api.replicate.com/v1/predictions/pred_pending_1',
        },
      };

      const parsed = parseReplicatePredictionResponse(response);
      expect(parsed).toEqual({
        isPending: true,
        predictionId: 'pred_pending_1',
        pollUrl: 'https://api.replicate.com/v1/predictions/pred_pending_1',
        status: 'processing',
      });
    });

    it('throws when status is failed or canceled', () => {
      expect(() =>
        parseReplicatePredictionResponse({
          status: 'failed',
          error: 'CUDA out of memory',
        })
      ).toThrow('Replicate 预测任务失败 (failed): CUDA out of memory');

      expect(() =>
        parseReplicatePredictionResponse({
          status: 'canceled',
          logs: 'User canceled prediction',
        })
      ).toThrow('Replicate 预测任务失败 (canceled): User canceled prediction');
    });

    it('throws when output is empty or response is invalid', () => {
      expect(() => parseReplicatePredictionResponse(null)).toThrow('响应格式无效');
      expect(() =>
        parseReplicatePredictionResponse({
          status: 'succeeded',
          output: [],
        })
      ).toThrow('未返回有效图像输出');
    });
  });
});
