import { describe, expect, it } from 'vitest';
import {
  buildReplicatePredictionRequest,
  parseReplicatePredictionResponse,
} from './replicateImageContract';

describe('replicateImageContract', () => {
  describe('buildReplicatePredictionRequest', () => {
    it('builds request for named model without version', () => {
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
      });

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
        negative_prompt: 'blurry, low quality',
        width: 1024,
        height: 768,
        aspect_ratio: '16:9',
        seed: 42,
        num_inference_steps: 4,
        guidance_scale: 3.5,
      });
    });

    it('builds request for named model with version in owner/name:version format', () => {
      const hex64 = '50adaf2d3c7a8b6099dd81e58e6dd27d2c317c52d007bc019c67040c22941234';
      const result = buildReplicatePredictionRequest({
        model: `black-forest-labs/flux-dev:${hex64}`,
        prompt: 'cyberpunk street',
      });

      expect(result.endpoint).toBe('https://api.replicate.com/v1/models/black-forest-labs/flux-dev/predictions');
      expect(result.isVersionBased).toBe(true);
      expect(result.actualModel).toBe(`black-forest-labs/flux-dev:${hex64}`);
      expect(result.payload.version).toBe(hex64);
      expect(result.payload.input).toEqual({
        prompt: 'cyberpunk street',
      });
    });

    it('builds request for 64-hex version string directly', () => {
      const hex64 = 'da77bc59ee6042380a09e4d399d5f7f3f781c9e14f7ad8459737d8d9924f200d';
      const result = buildReplicatePredictionRequest({
        model: hex64,
        prompt: 'abstract oil painting',
      });

      expect(result.endpoint).toBe('https://api.replicate.com/v1/predictions');
      expect(result.isVersionBased).toBe(true);
      expect(result.actualModel).toBe(hex64);
      expect(result.payload.version).toBe(hex64);
      expect(result.payload.input).toEqual({
        prompt: 'abstract oil painting',
      });
    });

    it('maps image_url and loras correctly', () => {
      const result = buildReplicatePredictionRequest({
        model: 'black-forest-labs/flux-dev',
        prompt: 'portrait of a warrior',
        image_url: 'https://example.com/source.png',
        loras: [
          { path: 'https://huggingface.co/owner/lora', strength: 0.8 },
          { path: 'https://huggingface.co/owner/lora-second', strength: 0.5 },
        ],
      });

      const input = result.payload.input as Record<string, unknown>;
      expect(input.image).toBe('https://example.com/source.png');
      expect(input.hf_lora).toBe('https://huggingface.co/owner/lora');
      expect(input.lora_scale).toBe(0.8);
    });

    it('resolves civitaiId or versionId to official civitai download URL for hf_lora', () => {
      const result = buildReplicatePredictionRequest({
        model: 'black-forest-labs/flux-dev',
        prompt: 'portrait of a warrior',
        loras: [
          { civitaiId: '2746042', strength: 0.75 },
        ],
      });

      const input = result.payload.input as Record<string, unknown>;
      expect(input.hf_lora).toBe('https://civitai.com/api/download/models/2746042');
      expect(input.lora_scale).toBe(0.75);
    });

    it('maps input_image when explicitly provided and handles string loras', () => {
      const result = buildReplicatePredictionRequest({
        model: 'black-forest-labs/flux-redux',
        prompt: 'styled portrait',
        input_image: 'https://example.com/init.png',
        loras: ['alexp/flux-ghibli'],
      });

      const input = result.payload.input as Record<string, unknown>;
      expect(input.input_image).toBe('https://example.com/init.png');
      expect(input.hf_lora).toBe('alexp/flux-ghibli');
      expect(input.lora_scale).toBe(1.0);
    });

    it('applies custom_parameters and records overrides', () => {
      const result = buildReplicatePredictionRequest({
        model: 'black-forest-labs/flux-schnell',
        prompt: 'space station',
        cfg: 3.0,
        custom_parameters: {
          guidance_scale: 5.5,
          go_fast: true,
          output_quality: 90,
        },
      });

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
        'https://my-replicate-proxy.internal/v1///'
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
