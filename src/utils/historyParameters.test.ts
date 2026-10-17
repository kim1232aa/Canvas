import { describe, expect, it } from 'vitest';
import type { GenerationHistoryItem } from '../types/providers';
import { extractEmbeddedGenerationParameters, resolveHistoryParameters, sentHistoryLoras, historyParameterSourceLabel } from './historyParameters';

const baseItem = (): GenerationHistoryItem => ({
  id: 'hist-1',
  url: '',
  prompt: 'robot',
  negativePrompt: null,
  provider: 'Civitai 官方原生生成引擎',
  model: 'urn:air:sd1:checkpoint:civitai:4384@128713',
  seed: null,
  steps: null,
  cfg: null,
  timestamp: 1,
  loras: [],
});

function utf16DataUrl(text: string): string {
  const bytes = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    bytes[i * 2] = text.charCodeAt(i);
    bytes[i * 2 + 1] = 0;
  }
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

describe('history generation parameter provenance', () => {
  it('uses Civitai upstream effective defaults instead of calling them unfilled', () => {
    const item = baseItem();
    item.requestMetadata = {
      route: '/api/engine/civitai/generate',
      submissions: [{
        endpoint: 'https://orchestration.civitai.com/v2/consumer/workflows?wait=100',
        parameters: { steps: [{ $type: 'imageGen', input: { engine: 'sdcpp', prompt: 'robot', model: item.model } }] },
        status: 200,
      }],
      executionTrace: [{
        endpoint: 'https://orchestration.civitai.com/v2/consumer/workflows?wait=100',
        responseBody: JSON.stringify({
          status: 'succeeded',
          steps: [{ input: { width: 512, height: 512, sampleMethod: 'euler', schedule: 'discrete', steps: 20, cfgScale: 7 } }],
        }),
      }],
    } as any;

    const params = resolveHistoryParameters(item);
    expect(params.steps).toMatchObject({ value: 20, source: 'upstream' });
    expect(params.cfg).toMatchObject({ value: 7, source: 'upstream' });
    expect(params.sampler).toMatchObject({ value: 'euler', source: 'upstream' });
    expect(params.scheduler).toMatchObject({ value: 'discrete', source: 'upstream' });
    expect(params.width).toMatchObject({ value: 512, source: 'upstream' });
    expect(params.height).toMatchObject({ value: 512, source: 'upstream' });
    expect(params.negativePrompt.source).toBe('schema-unrecorded');
  });

  it('recovers seed and WebUI-style fields from embedded image generation metadata', () => {
    const url = utf16DataUrl('Prompt text\nSteps: 20, Sampler: Euler, CFG scale: 7, Seed: 1021568893, Size: 512x512');
    const params = extractEmbeddedGenerationParameters(url);
    expect(params).toMatchObject({
      seed: 1021568893,
      steps: 20,
      sampler: 'Euler',
      cfg: 7,
      width: 512,
      height: 512,
    });
  });

  it('distinguishes a requested value that was not sent from an upstream-confirmed value', () => {
    const item = baseItem();
    item.requestMetadata = {
      requestedParameters: { steps: 30, negative_prompt: 'bad hands' },
      submissions: [{ endpoint: 'https://example.test', parameters: { prompt: 'robot' }, status: 200 }],
    } as any;

    const params = resolveHistoryParameters(item);
    expect(params.steps).toMatchObject({ source: 'schema-unrecorded', requested: 30 });
    expect(params.negativePrompt).toMatchObject({ source: 'schema-unrecorded', requested: 'bad hands' });
  });

  it('labels metadata-less old records separately instead of pretending they were not sent', () => {
    const params = resolveHistoryParameters(baseItem());
    expect(params.seed.source).toBe('unknown');
    expect(params.steps.source).toBe('unknown');
  });
});

describe('failed AIMLAPI history row (image_size alias + LoRA from actualRequest)', () => {
  const item: any = { id: 'h', url: '', timestamp: 1, prompt: 'p', seed: null, steps: null, cfg: null, loras: [], status: 'failed',
    requestMetadata: { actualRequest: { endpoint: 'https://api.aimlapi.com/v1/images/generations', parameters: { prompt: 'p', num_inference_steps: 8, seed: 424242, image_size: { width: 1024, height: 768 }, loras: [{ path: 'ostris/z_image_turbo_childrens_drawings', scale: 0.85 }] } } } };
  it('size comes from image_size and is 实际发送, not 未发送', () => {
    const r = resolveHistoryParameters(item);
    expect(r.width).toMatchObject({ value: 1024, source: 'sent' });
    expect(r.height).toMatchObject({ value: 768, source: 'sent' });
    expect(r.cfg.source).toBe('schema-unrecorded');
    expect(item.requestMetadata.actualRequest.parameters).not.toHaveProperty('width');
  });
  it('LoRA row from actualRequest loras[{path,scale}]', () => {
    expect(sentHistoryLoras(item)).toEqual([{ name: 'ostris/z_image_turbo_childrens_drawings', strength: 0.85 }]);
  });
});


describe('Novita nested request envelope (chips must follow actualRequest path)', () => {
  const novitaItem: any = {
    id: 'novita-0958', status: 'failed', url: '', provider: 'novita',
    model: 'dreamshaper_8_93211.safetensors', prompt: 'a lighthouse',
    negativePrompt: null, seed: null, steps: null, cfg: null, loras: [],
    requestMetadata: {
      actualRequest: {
        endpoint: 'https://api.novita.ai/v3/async/txt2img',
        parameters: {
          extra: { response_image_type: 'jpeg' },
          request: {
            prompt: 'a lighthouse on a cliff at sunset, detailed',
            negative_prompt: 'blurry, low quality',
            width: 512, height: 512, steps: 20, guidance_scale: 7, seed: 42,
            sampler_name: 'Euler a',
            loras: [{ model_name: 'more_details_59655', strength: 0.75 }],
            model_name: 'dreamshaper_8_93211.safetensors',
          },
        },
        schemaFields: [
          'prompt', 'negative_prompt', 'width', 'height', 'steps', 'guidance_scale',
          'seed', 'sampler_name', 'loras', 'model_name',
        ],
      },
    },
  };

  it('nested request.steps/seed/guidance_scale/sampler/size/negative → 实际发送, never 未发送', () => {
    const r = resolveHistoryParameters(novitaItem);
    expect(r.steps).toMatchObject({ value: 20, source: 'sent' });
    expect(r.seed).toMatchObject({ value: 42, source: 'sent' });
    expect(r.cfg).toMatchObject({ value: 7, source: 'sent' });
    expect(r.sampler).toMatchObject({ value: 'Euler a', source: 'sent' });
    expect(r.width).toMatchObject({ value: 512, source: 'sent' });
    expect(r.height).toMatchObject({ value: 512, source: 'sent' });
    expect(r.negativePrompt).toMatchObject({ value: 'blurry, low quality', source: 'sent' });
    for (const k of ['steps', 'seed', 'cfg', 'sampler', 'width', 'height', 'negativePrompt'] as const) {
      expect(historyParameterSourceLabel(r[k].source)).toBe('实际发送');
      expect(historyParameterSourceLabel(r[k].source)).not.toBe('未发送');
    }
  });

  it('nested request.loras[{model_name,strength}] → sentHistoryLoras (no mismatch from missing top-level)', () => {
    expect(sentHistoryLoras(novitaItem)).toEqual([
      { name: 'more_details_59655', strength: 0.75 },
    ]);
  });
});

describe('Replicate flat input envelope (same generic nest rule)', () => {
  it('parameters.input.num_inference_steps/guidance/seed → sent', () => {
    const item: any = {
      id: 'rep', status: 'failed', url: '', loras: [],
      requestMetadata: {
        actualRequest: {
          endpoint: 'https://api.replicate.com/v1/predictions',
          parameters: {
            input: {
              prompt: 'p', num_inference_steps: 28, guidance: 3, seed: 9,
              lora_weights: 'https://example/lora.safetensors', lora_scale: 0.8,
            },
          },
        },
      },
    };
    const r = resolveHistoryParameters(item);
    expect(r.steps).toMatchObject({ value: 28, source: 'sent' });
    expect(r.cfg).toMatchObject({ value: 3, source: 'sent' });
    expect(r.seed).toMatchObject({ value: 9, source: 'sent' });
  });
});


describe('aspect_ratio-only endpoint: canvas width/height → 该端点不支持 · 未发送', () => {
  const schemaProps = ['prompt', 'seed', 'num_inference_steps', 'guidance', 'aspect_ratio', 'lora_weights'];

  it('local_blocked: user-set width/height are unsupported (not plain 未发送); size row stays 未发送 via aspect_ratio alias', () => {
    const blocked: any = {
      id: 'ar-only-blocked', status: 'local_blocked', provider: 'replicate',
      model: 'black-forest-labs/flux-dev-lora', url: '', timestamp: 1,
      requestMetadata: {
        intendedRequest: {
          model: 'black-forest-labs/flux-dev-lora',
          width: 1024, height: 768, steps: 28, cfg: 3, seed: 7,
          negative_prompt: 'blurry',
          custom_parameters: { _canvas: { schemaProperties: schemaProps } },
        },
      },
    };
    const r = resolveHistoryParameters(blocked);
    expect(r.width.source).toBe('unsupported');
    expect(r.height.source).toBe('unsupported');
    expect(historyParameterSourceLabel(r.width.source)).toBe('该端点不支持 · 未发送');
    expect(historyParameterSourceLabel(r.height.source)).toBe('该端点不支持 · 未发送');
    expect(historyParameterSourceLabel(r.width.source)).not.toBe('未发送');
    // size row: Schema lists aspect_ratio ⇒ unfilled ratio is plain 未发送 (fix5), not folded into unsupported
    expect(r.size.source).toBe('not-sent');
    expect(historyParameterSourceLabel(r.size.source)).toBe('未发送');
  });

  it('failed outbound: sent aspect_ratio → size 实际发送; requested width/height still unsupported', () => {
    const sent: any = {
      id: 'ar-only-sent', status: 'failed', provider: 'replicate',
      model: 'black-forest-labs/flux-dev-lora', url: '', timestamp: 1,
      requestMetadata: {
        schemaFields: schemaProps,
        actualRequest: {
          input: { prompt: 'p', seed: 7, num_inference_steps: 28, guidance: 3, aspect_ratio: '16:9' },
        },
        requestedParameters: { width: 1024, height: 576 },
      },
    };
    const r = resolveHistoryParameters(sent);
    expect(r.size).toMatchObject({ value: '16:9', source: 'sent' });
    expect(historyParameterSourceLabel(r.size.source)).toBe('实际发送');
    expect(r.width.source).toBe('unsupported');
    expect(r.height.source).toBe('unsupported');
    expect(historyParameterSourceLabel(r.width.source)).toBe('该端点不支持 · 未发送');
  });
});
