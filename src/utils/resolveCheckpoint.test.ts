import { describe, expect, it } from 'vitest';
import { Connection, NodeInstance } from '../types/graph';
import {
  canvasWidgetFieldKey,
  isCanvasFieldUnsupported,
  isCanvasWidgetUnsupported,
  isFalLoraEndpointError,
  isLoraUnsupportedOnEndpoint,
  resolveActiveCheckpoint,
  resolveCheckpointForNode,
  sanitizeFrameLoras,
  filterRealLoraEntries,
  isRealLoraEntry,
  omitUnsupportedGenerateFields,
  resolveGenerateLorasPayload,
  resolveCheckpointModelProvider,
  applyCheckpointModelSelection,
} from './resolveCheckpoint';
import { validateLoraCompatibility } from './baseModelMatcher';

const node = (id: string, type: string, values: Record<string, any> = {}): NodeInstance => ({
  id,
  type,
  title: type,
  pos: { x: 0, y: 0 },
  inputs: [],
  outputs: [],
  values,
});

describe('resolveCheckpoint — B1 Fal schnell + LoRA', () => {
  it('resolveActiveCheckpoint uses selected FalAIEngineNode.model, never Z-Image-Turbo', () => {
    const nodes = [
      node('fal-1', 'FalAIEngineNode', { model: 'fal-ai/flux/schnell' }),
      node('ckpt-zombie', 'CheckpointLoaderSimple', { ckpt_name: 'Tongyi-MAI/Z-Image-Turbo' }),
    ];
    const r = resolveActiveCheckpoint(nodes, [], 'fal-1');
    expect(r.checkpoint).toBe('fal-ai/flux/schnell');
    expect(r.provider).toBe('fal');
    expect(r.checkpoint).not.toContain('Z-Image');
  });

  it('resolveActiveCheckpoint uses sole Fal engine when nothing selected', () => {
    const nodes = [node('fal-1', 'FalAIEngineNode', { model: 'fal-ai/flux/schnell' })];
    const r = resolveActiveCheckpoint(nodes, [], null);
    expect(r.checkpoint).toBe('fal-ai/flux/schnell');
  });

  it('resolveCheckpointForNode walks LoRA → FalAIEngineNode edge', () => {
    const nodes = [
      node('lora-1', 'LoRALoader', { lora_name: 'koda', base_model: 'Flux.1 D', strength_model: 1 }),
      node('fal-1', 'FalAIEngineNode', { model: 'fal-ai/flux/schnell' }),
    ];
    const conns: Connection[] = [
      {
        id: 'c1',
        fromNodeId: 'lora-1',
        fromSocketId: 'MODEL',
        toNodeId: 'fal-1',
        toSocketId: 'lora',
        type: 'MODEL',
      },
    ];
    const r = resolveCheckpointForNode('lora-1', nodes, conns);
    expect(r.checkpoint).toBe('fal-ai/flux/schnell');
    expect(r.provider).toBe('fal');
    expect(r.engineNodeId).toBe('fal-1');
  });

  it('isLoraUnsupportedOnEndpoint: fal-ai/flux/schnell marks loras unsupported', () => {
    const r = isLoraUnsupportedOnEndpoint('fal', 'fal-ai/flux/schnell');
    expect(r.unsupported).toBe(true);
    expect(r.message).toMatch(/该服务商不支持/);
    expect(r.message).toContain('fal-ai/flux/schnell');
  });

  it('validateLoraCompatibility: schnell + LoRA → 端点不支持 LoRA, not Z-Image mismatch', () => {
    const compat = validateLoraCompatibility(
      'fal-ai/flux/schnell',
      'Flux.1 D',
      'koda',
      'fal'
    );
    expect(compat.isCompatible).toBe(false);
    expect(compat.endpointUnsupported).toBe(true);
    expect(compat.message).toMatch(/该服务商不支持/);
    expect(compat.message).not.toMatch(/Z-Image|架构不匹配|Tongyi/);
  });

  it('validateLoraCompatibility with wrong canvas default would previously mismatch — endpoint check wins first', () => {
    // Even if someone passed Z-Image as checkpoint by mistake with fal provider+schnell...
    // When checkpoint IS schnell, we get endpoint message.
    const compat = validateLoraCompatibility('fal-ai/flux/schnell', 'Flux.1 D', 'koda', 'fal');
    expect(compat.message).not.toContain('Tongyi-MAI/Z-Image-Turbo');
  });

  it('B1-r2b: orphan LoRA + sole Fal + zombie Checkpoint uses Fal schnell, never Z-Image', () => {
    const nodes = [
      node('lora-1', 'LoRALoader', { lora_name: 'koda', base_model: 'Flux.1 D', strength_model: 1 }),
      node('fal-1', 'FalAIEngineNode', { model: 'fal-ai/flux/schnell' }),
      node('ckpt-zombie', 'CheckpointLoaderSimple', { ckpt_name: 'Tongyi-MAI/Z-Image-Turbo' }),
      node('ksampler-1', 'KSampler', { steps: 20 }),
    ];
    const conns: Connection[] = [
      {
        id: 'c-ckpt',
        fromNodeId: 'ckpt-zombie',
        fromSocketId: 'MODEL',
        toNodeId: 'ksampler-1',
        toSocketId: 'model',
        type: 'MODEL',
      },
    ];

    const forLora = resolveCheckpointForNode('lora-1', nodes, conns);
    expect(forLora.checkpoint).toBe('fal-ai/flux/schnell');
    expect(forLora.provider).toBe('fal');
    expect(forLora.engineNodeId).toBe('fal-1');
    expect(forLora.checkpoint).not.toContain('Z-Image');

    const active = resolveActiveCheckpoint(nodes, conns, 'lora-1');
    expect(active.checkpoint).toBe('fal-ai/flux/schnell');
    expect(active.provider).toBe('fal');

    const compat = validateLoraCompatibility(forLora.checkpoint, 'Flux.1 D', 'koda', forLora.provider);
    expect(compat.endpointUnsupported).toBe(true);
    expect(compat.message).toMatch(/该服务商不支持/);
    expect(compat.message).not.toMatch(/Z-Image|架构不匹配|Tongyi/);
  });

  it('isFalLoraEndpointError: paints Fal HTTP/endpoint messages, not Hugging Face loras 400', () => {
    expect(isFalLoraEndpointError('HTTP 400: 该端点不支持 LoRA（Fal.ai 端点 fal-ai/flux/schnell 的官方 schema 无 loras 字段）')).toBe(true);
    expect(isFalLoraEndpointError('该端点不支持 LoRA（fal 端点 fal-ai/flux/schnell 的官方 schema 无 loras 字段）')).toBe(true);
    expect(isFalLoraEndpointError('该服务商不支持（fal / fal-ai/flux/schnell 的官方 schema 无 loras 字段）')).toBe(true);
    expect(isFalLoraEndpointError('该服务商不支持: loras（Hugging Face）')).toBe(false);
    expect(isFalLoraEndpointError('HTTP 400: 该服务商不支持: loras（Hugging Face）')).toBe(false);
  });
});

describe('resolveCheckpoint — canvas NodeItem grey (compat)', () => {
  it('resolveCheckpointForNode: KSampler walks to openai_compat CheckpointLoaderSimple', () => {
    const nodes = [
      node('ckpt-1', 'CheckpointLoaderSimple', {
        ckpt_name: 'gpt-image-2',
        targetProvider: 'openai_compat',
      }),
      node('ks-1', 'KSampler', { seed: 42, steps: 20 }),
      node('lat-1', 'EmptyLatentImage', { width: 1024, height: 1024 }),
      node('neg-1', 'CLIPTextEncodeNegative', { text: 'blurry' }),
    ];
    const conns: Connection[] = [
      {
        id: 'c1',
        fromNodeId: 'ckpt-1',
        fromSocketId: 'MODEL',
        toNodeId: 'ks-1',
        toSocketId: 'model',
        type: 'MODEL',
      },
    ];
    const forKs = resolveCheckpointForNode('ks-1', nodes, conns);
    expect(forKs.checkpoint).toBe('gpt-image-2');
    expect(forKs.provider).toBe('openai_compat');

    const forLat = resolveCheckpointForNode('lat-1', nodes, conns);
    expect(forLat.checkpoint).toBe('gpt-image-2');
    expect(forLat.provider).toBe('openai_compat');

    const forNeg = resolveCheckpointForNode('neg-1', nodes, conns);
    expect(forNeg.provider).toBe('openai_compat');
  });

  it('isCanvasFieldUnsupported: openai_compat / grok_compat / gemini grey seed/negative/WH', () => {
    expect(isCanvasFieldUnsupported('openai_compat', 'gpt-image-2', 'seed')).toBe(true);
    expect(isCanvasFieldUnsupported('openai_compat', 'gpt-image-2', 'negative_prompt')).toBe(true);
    expect(isCanvasFieldUnsupported('openai_compat', 'gpt-image-2', 'width')).toBe(true);
    expect(isCanvasFieldUnsupported('grok_compat', 'grok-imagine-image', 'seed')).toBe(true);
    expect(isCanvasFieldUnsupported('grok_compat', 'grok-imagine-image', 'height')).toBe(true);
    expect(isCanvasFieldUnsupported('gemini', 'gemini-3.1-flash-image', 'seed')).toBe(true);
    expect(isCanvasFieldUnsupported('gemini', '', 'seed')).toBe(true);
    expect(isCanvasFieldUnsupported('gemini', 'gemini-3.1-flash-image', 'negative_prompt')).toBe(true);
    expect(isCanvasFieldUnsupported('fal', 'fal-ai/flux/dev', 'seed')).toBe(false);
  });

  it('canvasWidgetFieldKey maps KSampler widgets to schema FieldKeys', () => {
    expect(canvasWidgetFieldKey('steps')).toBe('steps');
    expect(canvasWidgetFieldKey('cfg')).toBe('cfg');
    expect(canvasWidgetFieldKey('cfg_scale')).toBe('cfg');
    expect(canvasWidgetFieldKey('sampler_name')).toBe('sampler');
    expect(canvasWidgetFieldKey('sampler')).toBe('sampler');
    expect(canvasWidgetFieldKey('scheduler')).toBe('scheduler');
    expect(canvasWidgetFieldKey('denoise')).toBe('denoise');
    expect(canvasWidgetFieldKey('control_after_generate')).toBeUndefined();
  });

  it('isCanvasFieldUnsupported: openai_compat / grok_compat grey steps/CFG/sampler/scheduler/denoise', () => {
    expect(isCanvasFieldUnsupported('openai_compat', 'gpt-image-2', 'steps')).toBe(true);
    expect(isCanvasFieldUnsupported('openai_compat', 'gpt-image-2', 'cfg')).toBe(true);
    expect(isCanvasFieldUnsupported('openai_compat', 'gpt-image-2', 'sampler')).toBe(true);
    expect(isCanvasFieldUnsupported('openai_compat', 'gpt-image-2', 'scheduler')).toBe(true);
    expect(isCanvasWidgetUnsupported('openai_compat', 'gpt-image-2', 'sampler_name')).toBe(true);
    expect(isCanvasWidgetUnsupported('openai_compat', 'gpt-image-2', 'cfg_scale')).toBe(true);
    expect(isCanvasWidgetUnsupported('openai_compat', 'gpt-image-2', 'denoise')).toBe(true);
    expect(isCanvasFieldUnsupported('gemini', 'gemini-3.1-flash-image', 'denoise')).toBe(true);
    expect(isCanvasFieldUnsupported('gemini', 'gemini-3.1-flash-image', 'sampler')).toBe(true);
    expect(isCanvasFieldUnsupported('gemini', 'gemini-3.1-flash-image', 'scheduler')).toBe(true);
    expect(isCanvasFieldUnsupported('gemini', '', 'sampler')).toBe(true);
    expect(isCanvasFieldUnsupported('gemini', 'Tongyi-MAI/Z-Image-Turbo', 'steps')).toBe(true);
    expect(isCanvasFieldUnsupported('fal', 'fal-ai/flux/dev', 'denoise')).toBe(false);
    expect(isCanvasFieldUnsupported('grok_compat', 'grok-imagine-image', 'steps')).toBe(true);
    expect(isCanvasFieldUnsupported('grok_compat', 'grok-imagine-image', 'cfg')).toBe(true);
    expect(isCanvasFieldUnsupported('grok_compat', 'grok-imagine-image', 'sampler')).toBe(true);
    expect(isCanvasFieldUnsupported('grok_compat', 'grok-imagine-image', 'scheduler')).toBe(true);
    expect(isCanvasFieldUnsupported('fal', 'fal-ai/flux/dev', 'steps')).toBe(false);
    expect(isCanvasFieldUnsupported('fal', 'fal-ai/flux/dev', 'sampler')).toBe(true);
  });
});

describe('sanitizeFrameLoras', () => {
  it('keeps LoRA values even when schema marks loras unsupported (no silent wipe)', () => {
    const left = [{ name: 'x.safetensors', modelStrength: 0.7 }];
    expect(sanitizeFrameLoras('gemini', 'gemini-2.5-flash-image', left)).toEqual(left);
    expect(sanitizeFrameLoras('agnes', 'agnes-image-2.5-flash', left)).toEqual(left);
    expect(sanitizeFrameLoras('huggingface', 'huggingface-text-to-image', left)).toEqual(left);
    expect(sanitizeFrameLoras('nanogpt', 'flux-schnell', left)).toEqual(left);
    expect(sanitizeFrameLoras('fal', 'fal-ai/flux/schnell', left)).toEqual(left);
  });
  it('keeps LoRAs for providers outside schema', () => {
    const left = [{ name: 'x.safetensors', modelStrength: 0.7 }];
    expect(sanitizeFrameLoras('modelscope', 'Tongyi-MAI/Z-Image-Turbo', left)).toEqual(left);
  });
});

describe('Fal / Agnes / HF / NanoGPT grey on engine switch (schema-driven)', () => {
  const left = [{ name: 'koda.safetensors', modelStrength: 0.8 }];

  it('switching to Agnes greys unsupported fields including loras/negative without deleting values', () => {
    for (const model of ['agnes-image-2.5-flash', '', 'Tongyi-MAI/Z-Image-Turbo']) {
      expect(isCanvasFieldUnsupported('agnes', model, 'loras'), `loras@${model}`).toBe(true);
      expect(isCanvasFieldUnsupported('agnes', model, 'negative_prompt'), `neg@${model}`).toBe(true);
      expect(isCanvasFieldUnsupported('agnes', model, 'seed'), `seed@${model}`).toBe(true);
      expect(isCanvasFieldUnsupported('agnes', model, 'steps'), `steps@${model}`).toBe(true);
      expect(isCanvasFieldUnsupported('agnes', model, 'cfg'), `cfg@${model}`).toBe(true);
      expect(isCanvasFieldUnsupported('agnes', model, 'sampler'), `sampler@${model}`).toBe(true);
      expect(isCanvasFieldUnsupported('agnes', model, 'scheduler'), `scheduler@${model}`).toBe(true);
      // width/height stay editable (mapped to Agnes size)
      expect(isCanvasFieldUnsupported('agnes', model, 'width'), `w@${model}`).toBe(false);
      expect(isCanvasFieldUnsupported('agnes', model, 'height'), `h@${model}`).toBe(false);
    }
    expect(sanitizeFrameLoras('agnes', 'agnes-image-2.5-flash', left)).toEqual(left);
    const badge = isLoraUnsupportedOnEndpoint('agnes', 'agnes-image-2.5-flash');
    expect(badge.unsupported).toBe(true);
    expect(badge.message).toMatch(/该服务商不支持/);
  });

  it('switching to Hugging Face greys loras (not negative/seed/steps) and keeps values', () => {
    expect(isCanvasFieldUnsupported('huggingface', '', 'loras')).toBe(true);
    expect(isCanvasFieldUnsupported('huggingface', 'black-forest-labs/FLUX.1-dev', 'loras')).toBe(true);
    expect(isCanvasFieldUnsupported('huggingface', 'black-forest-labs/FLUX.1-dev', 'denoise')).toBe(true);
    expect(isCanvasFieldUnsupported('huggingface', 'black-forest-labs/FLUX.1-dev', 'sampler')).toBe(true);
    // HF text-to-image docs support these:
    expect(isCanvasFieldUnsupported('huggingface', 'black-forest-labs/FLUX.1-dev', 'negative_prompt')).toBe(false);
    expect(isCanvasFieldUnsupported('huggingface', 'black-forest-labs/FLUX.1-dev', 'seed')).toBe(false);
    expect(isCanvasFieldUnsupported('huggingface', 'black-forest-labs/FLUX.1-dev', 'steps')).toBe(false);
    expect(isCanvasFieldUnsupported('huggingface', 'black-forest-labs/FLUX.1-dev', 'width')).toBe(false);
    expect(sanitizeFrameLoras('huggingface', '', left)).toEqual(left);
    const badge = isLoraUnsupportedOnEndpoint('huggingface', 'Tongyi-MAI/Z-Image-Turbo');
    expect(badge.unsupported).toBe(true);
    expect(badge.message).toMatch(/该服务商不支持/);
  });

  it('Fal flux/schnell greys loras/negative/sampler; flux-lora keeps loras editable', () => {
    expect(isCanvasFieldUnsupported('fal', 'fal-ai/flux/schnell', 'loras')).toBe(true);
    expect(isCanvasFieldUnsupported('fal', 'fal-ai/flux/schnell', 'negative_prompt')).toBe(true);
    expect(isCanvasFieldUnsupported('fal', 'fal-ai/flux/schnell', 'sampler')).toBe(true);
    expect(isCanvasFieldUnsupported('fal', 'fal-ai/flux/schnell', 'seed')).toBe(false);
    expect(isCanvasFieldUnsupported('fal', 'fal-ai/flux/schnell', 'steps')).toBe(false);
    expect(isCanvasFieldUnsupported('fal', 'fal-ai/flux-lora', 'loras')).toBe(false);
    expect(isCanvasFieldUnsupported('fal', 'fal-ai/flux-lora', 'negative_prompt')).toBe(true);
    // empty / foreign checkpoint falls back to first fal model (flux-lora) for non-lora fields
    expect(isCanvasFieldUnsupported('fal', '', 'sampler')).toBe(true);
    // empty Fal must NOT treat flux-lora fallback as a real LoRA-capable selection
    expect(isCanvasFieldUnsupported('fal', '', 'loras')).toBe(true);
    expect(sanitizeFrameLoras('fal', 'fal-ai/flux/schnell', left)).toEqual(left);
  });

  it('empty Fal checkpoint: LoRA greys 该服务商不支持; values kept; not sent; flux-lora stays usable', () => {
    const left = [{ name: 'koda.safetensors', modelStrength: 0.8 }];

    const emptyBadge = isLoraUnsupportedOnEndpoint('fal', '');
    expect(emptyBadge.unsupported).toBe(true);
    expect(emptyBadge.message).toMatch(/该服务商不支持/);

    const emptyCompat = validateLoraCompatibility('', 'Flux.1 D', 'koda', 'fal');
    expect(emptyCompat.isCompatible).toBe(false);
    expect(emptyCompat.endpointUnsupported).toBe(true);
    expect(emptyCompat.message).toMatch(/该服务商不支持/);
    expect(emptyCompat.message).not.toMatch(/兼容/);

    // Real fal-ai/flux-lora selection must still allow LoRA
    const fluxLoraBadge = isLoraUnsupportedOnEndpoint('fal', 'fal-ai/flux-lora');
    expect(fluxLoraBadge.unsupported).toBe(false);
    const fluxLoraCompat = validateLoraCompatibility('fal-ai/flux-lora', 'Flux.1 D', 'koda', 'fal');
    expect(fluxLoraCompat.endpointUnsupported).not.toBe(true);
    expect(fluxLoraCompat.isCompatible).toBe(true);

    // flux/dev stays unsupported
    const devBadge = isLoraUnsupportedOnEndpoint('fal', 'fal-ai/flux/dev');
    expect(devBadge.unsupported).toBe(true);
    expect(devBadge.message).toMatch(/该服务商不支持/);

    expect(sanitizeFrameLoras('fal', '', left)).toEqual(left);
    const omitted = omitUnsupportedGenerateFields('fal', '', {
      prompt: 'hi',
      loras: left,
      seed: 1,
    });
    expect(omitted.prompt).toBe('hi');
    expect(omitted.loras).toBeUndefined();
    expect(omitted.seed).toBe(1); // seed still via flux-lora fallback for non-lora fields
  });

  it('ModelScope mismatch message states why + next step; does not imply values cleared', () => {
    const compat = validateLoraCompatibility(
      'Tongyi-MAI/Z-Image-Turbo',
      'Flux.1 D',
      '[Flux1] Asian Mix Lora - Krea/Dev.safetensors',
      'modelscope_ai'
    );
    expect(compat.isCompatible).toBe(false);
    expect(compat.endpointUnsupported).not.toBe(true);
    expect(compat.message).toMatch(/底模架构不匹配/);
    expect(compat.message).toMatch(/Z-Image-Turbo/);
    expect(compat.message).toMatch(/Flux\.1 D|FLUX/);
    expect(compat.message).toMatch(/请自行选择/);
    expect(compat.message).toMatch(/保留现有 LoRA \/ seed/);
    expect(compat.message).toMatch(/负向与采样器按导入原样/);
    expect(compat.message).toMatch(/空或「未指定」都算原样/);
    expect(compat.message).not.toMatch(/已保留当前 LoRA \/ 负向 \/ seed/);
    expect(compat.message).not.toMatch(/已清空|已清除|已删除/);
  });

  it('NanoGPT flux-schnell greys loras and negative; keeps seed; does not wipe LoRAs', () => {
    for (const model of ['flux-schnell', '', 'some-civitai-leftover.safetensors']) {
      expect(isCanvasFieldUnsupported('nanogpt', model, 'loras'), `loras@${model}`).toBe(true);
      expect(isCanvasFieldUnsupported('nanogpt', model, 'negative_prompt'), `neg@${model}`).toBe(true);
      expect(isCanvasFieldUnsupported('nanogpt', model, 'steps'), `steps@${model}`).toBe(true);
      expect(isCanvasFieldUnsupported('nanogpt', model, 'cfg'), `cfg@${model}`).toBe(true);
      expect(isCanvasFieldUnsupported('nanogpt', model, 'width'), `w@${model}`).toBe(true);
      expect(isCanvasFieldUnsupported('nanogpt', model, 'seed'), `seed@${model}`).toBe(false);
    }
    expect(sanitizeFrameLoras('nanogpt', 'flux-schnell', left)).toEqual(left);
    const badge = isLoraUnsupportedOnEndpoint('nanogpt', 'flux-schnell');
    expect(badge.unsupported).toBe(true);
    expect(badge.message).toMatch(/该服务商不支持/);
    const compat = validateLoraCompatibility('flux-schnell', 'Flux.1 S', 'koda', 'nanogpt');
    expect(compat.isCompatible).toBe(false);
    expect(compat.endpointUnsupported).toBe(true);
  });

  it('SenseNova greys loras/WH/seed and kills green 底模兼容 badge path; keeps LoRA values', () => {
    const left = [{ name: 'koda.safetensors', modelStrength: 0.8 }];
    for (const model of ['deepseek-v4-flash', '', 'civitai-leftover.safetensors']) {
      expect(isCanvasFieldUnsupported('sensenova', model, 'loras'), `loras@${model}`).toBe(true);
      expect(isCanvasFieldUnsupported('sensenova', model, 'width'), `w@${model}`).toBe(true);
      expect(isCanvasFieldUnsupported('sensenova', model, 'height'), `h@${model}`).toBe(true);
      expect(isCanvasFieldUnsupported('sensenova', model, 'seed'), `seed@${model}`).toBe(true);
      expect(isCanvasFieldUnsupported('sensenova', model, 'negative_prompt'), `neg@${model}`).toBe(true);
    }
    expect(sanitizeFrameLoras('sensenova', 'deepseek-v4-flash', left)).toEqual(left);
    const badge = isLoraUnsupportedOnEndpoint('sensenova', 'deepseek-v4-flash');
    expect(badge.unsupported).toBe(true);
    expect(badge.message).toMatch(/该服务商不支持/);
    const compat = validateLoraCompatibility('deepseek-v4-flash', 'Flux.1 D', 'koda', 'sensenova');
    expect(compat.isCompatible).toBe(false);
    expect(compat.endpointUnsupported).toBe(true);
    const omitted = omitUnsupportedGenerateFields('sensenova', 'deepseek-v4-flash', {
      prompt: 'hi',
      width: 1024,
      height: 1024,
      seed: 1,
      loras: left,
      negative_prompt: 'blurry',
    });
    expect(omitted.prompt).toBe('hi');
    expect(omitted.width).toBeUndefined();
    expect(omitted.seed).toBeUndefined();
    expect(omitted.loras).toBeUndefined();
    expect(omitted.negative_prompt).toBeUndefined();
  });

  it('Tensor.Art banana2 greys width/height/seed/steps/cfg/loras; keeps stored LoRAs; omits from payload', () => {
    const left = [{ name: 'koda.safetensors', modelStrength: 0.8 }];
    for (const model of ['strong_text2image_nano_banana2', '', 'civitai-leftover.safetensors']) {
      expect(isCanvasFieldUnsupported('tensorart', model, 'loras'), `loras@${model}`).toBe(true);
      expect(isCanvasFieldUnsupported('tensorart', model, 'width'), `w@${model}`).toBe(true);
      expect(isCanvasFieldUnsupported('tensorart', model, 'height'), `h@${model}`).toBe(true);
      expect(isCanvasFieldUnsupported('tensorart', model, 'seed'), `seed@${model}`).toBe(true);
      expect(isCanvasFieldUnsupported('tensorart', model, 'steps'), `steps@${model}`).toBe(true);
      expect(isCanvasFieldUnsupported('tensorart', model, 'cfg'), `cfg@${model}`).toBe(true);
    }
    expect(sanitizeFrameLoras('tensorart', 'strong_text2image_nano_banana2', left)).toEqual(left);
    const badge = isLoraUnsupportedOnEndpoint('tensorart', 'strong_text2image_nano_banana2');
    expect(badge.unsupported).toBe(true);
    expect(badge.message).toMatch(/该服务商不支持/);
    const compat = validateLoraCompatibility('strong_text2image_nano_banana2', 'Flux.1 D', 'koda', 'tensorart');
    expect(compat.isCompatible).toBe(false);
    expect(compat.endpointUnsupported).toBe(true);
    const omitted = omitUnsupportedGenerateFields('tensorart', 'strong_text2image_nano_banana2', {
      prompt: 'hi',
      width: 1024,
      height: 1024,
      seed: 1,
      steps: 20,
      cfg: 7,
      loras: left,
      negative_prompt: 'blurry',
    });
    expect(omitted.prompt).toBe('hi');
    expect(omitted.width).toBeUndefined();
    expect(omitted.height).toBeUndefined();
    expect(omitted.seed).toBeUndefined();
    expect(omitted.steps).toBeUndefined();
    expect(omitted.cfg).toBeUndefined();
    expect(omitted.loras).toBeUndefined();
    expect(omitted.negative_prompt).toBeUndefined();
  });

  it('omitUnsupportedGenerateFields drops unsupported keys but leaves supported', () => {
    const agnes = omitUnsupportedGenerateFields('agnes', 'agnes-image-2.5-flash', {
      prompt: 'hi',
      negative_prompt: 'blurry',
      seed: 42,
      steps: 20,
      cfg: 7,
      width: 1024,
      height: 1024,
      loras: left,
      sampler_name: 'euler',
    });
    expect(agnes.prompt).toBe('hi');
    expect(agnes.width).toBe(1024);
    expect(agnes.height).toBe(1024);
    expect(agnes.negative_prompt).toBeUndefined();
    expect(agnes.seed).toBeUndefined();
    expect(agnes.steps).toBeUndefined();
    expect(agnes.cfg).toBeUndefined();
    expect(agnes.loras).toBeUndefined();
    expect(agnes.sampler_name).toBeUndefined();

    const nano = omitUnsupportedGenerateFields('nanogpt', 'flux-schnell', {
      prompt: 'hi',
      negative_prompt: 'blurry',
      seed: 99,
      loras: left,
      width: 512,
    });
    expect(nano.seed).toBe(99);
    expect(nano.negative_prompt).toBeUndefined();
    expect(nano.loras).toBeUndefined();
    expect(nano.width).toBeUndefined();

    const hf = omitUnsupportedGenerateFields('huggingface', 'black-forest-labs/FLUX.1-dev', {
      prompt: 'hi',
      negative_prompt: 'blurry',
      seed: 1,
      steps: 28,
      loras: left,
      sampler_name: 'euler',
    });
    expect(hf.negative_prompt).toBe('blurry');
    expect(hf.seed).toBe(1);
    expect(hf.steps).toBe(28);
    expect(hf.loras).toBeUndefined();
    expect(hf.sampler_name).toBeUndefined();
  });
});


describe('isRealLoraEntry / filterRealLoraEntries', () => {
  it('rejects empty, whitespace-only, and missing-name entries', () => {
    expect(isRealLoraEntry({ name: '' })).toBe(false);
    expect(isRealLoraEntry({ name: '   ' })).toBe(false);
    expect(isRealLoraEntry({ path: 'https://x', civitaiId: '1' })).toBe(false);
  });

  it('accepts name "LoRA" (case variants) as a legitimate real name', () => {
    expect(isRealLoraEntry({ name: 'LoRA' })).toBe(true);
    expect(isRealLoraEntry({ name: 'lora' })).toBe(true);
    expect(isRealLoraEntry({ name: 'LORA' })).toBe(true);
    expect(isRealLoraEntry({ name: ' LoRA ' })).toBe(true);
  });

  it('accepts a real trimmed name even when path/civitaiId also exist', () => {
    expect(isRealLoraEntry({
      name: '[Flux1] Asian Mix Lora - Krea/Dev.safetensors',
      path: 'https://civitai.com/api/download/models/854154',
      civitaiId: '854154',
    })).toBe(true);
    expect(isRealLoraEntry({ name: 'x' })).toBe(true);
  });
});

describe('resolveGenerateLorasPayload — openai_compat App/graph path', () => {
  const real = [{ name: 'x', strength: 1, modelStrength: 1, clipStrength: 1 }];
  const namedLoRA = [{
    name: 'LoRA',
    path: 'https://civitai.com/api/download/models/854154',
    strength: 1,
    modelStrength: 1,
    clipStrength: 1,
    civitaiId: '854154',
    triggers: [] as string[],
  }];
  const emptyName = [{
    name: '   ',
    path: 'https://civitai.com/api/download/models/854154',
    strength: 1,
    civitaiId: '854154',
  }];

  it('empty list → no loras after omit (POST body must not contain loras)', () => {
    const lorasPayload = resolveGenerateLorasPayload('openai_compat', 'gpt-image-2', []);
    expect(lorasPayload).toBeUndefined();
    const omitted = omitUnsupportedGenerateFields('openai_compat', 'gpt-image-2', {
      prompt: 'hi',
      model: 'gpt-image-2',
      seed: 123,
      negative_prompt: 'blur',
      steps: 20,
      cfg: 7,
      loras: lorasPayload,
    });
    expect(omitted.loras).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(
      JSON.parse(JSON.stringify(omitted)),
      'loras',
    )).toBe(false);
    expect(omitted.seed).toBeUndefined();
    expect(omitted.negative_prompt).toBeUndefined();
    expect(omitted.steps).toBeUndefined();
    expect(omitted.cfg).toBeUndefined();
  });

  it('real entry named exactly "LoRA" → kept through filter / payload / omit', () => {
    expect(filterRealLoraEntries(namedLoRA)).toEqual(namedLoRA);
    const lorasPayload = resolveGenerateLorasPayload('openai_compat', 'gpt-image-2', namedLoRA);
    expect(lorasPayload).toEqual(namedLoRA);
    const omitted = omitUnsupportedGenerateFields('openai_compat', 'gpt-image-2', {
      prompt: 'hi',
      model: 'gpt-image-2',
      loras: lorasPayload,
    });
    expect(omitted.loras).toEqual(namedLoRA);
  });

  it('mixed empty + real → only real survive', () => {
    const mixed = [...emptyName, ...namedLoRA];
    expect(resolveGenerateLorasPayload('openai_compat', 'gpt-image-2', mixed)).toEqual(namedLoRA);
  });

  it('empty / whitespace-only name → omit loras key', () => {
    const lorasPayload = resolveGenerateLorasPayload('openai_compat', 'gpt-image-2', emptyName);
    expect(lorasPayload).toBeUndefined();
    const omitted = omitUnsupportedGenerateFields('openai_compat', 'gpt-image-2', {
      prompt: 'hi',
      model: 'gpt-image-2',
      loras: emptyName,
    });
    expect(omitted.loras).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(
      JSON.parse(JSON.stringify(omitted)),
      'loras',
    )).toBe(false);
  });

  it('one real LoRA → name/strength survive omit to reach OpenAICompatDriver', () => {
    expect(isCanvasFieldUnsupported('openai_compat', 'gpt-image-2', 'loras')).toBe(true);
    const lorasPayload = resolveGenerateLorasPayload('openai_compat', 'gpt-image-2', real);
    expect(lorasPayload).toEqual(real);
    const omitted = omitUnsupportedGenerateFields('openai_compat', 'gpt-image-2', {
      prompt: 'hi',
      model: 'gpt-image-2',
      seed: 123,
      negative_prompt: 'blur',
      steps: 20,
      cfg: 7,
      loras: lorasPayload,
    });
    expect(omitted.loras).toEqual(real);
    expect(omitted.loras![0]).toEqual(expect.objectContaining({ name: 'x', strength: 1 }));
    expect(omitted.seed).toBeUndefined();
    expect(omitted.negative_prompt).toBeUndefined();
    expect(omitted.steps).toBeUndefined();
    expect(omitted.cfg).toBeUndefined();
  });

  it('mix of empty-name + real → keep only real entries', () => {
    const mixed = [...emptyName, ...real];
    const lorasPayload = resolveGenerateLorasPayload('openai_compat', 'gpt-image-2', mixed);
    expect(lorasPayload).toEqual(real);
    const omitted = omitUnsupportedGenerateFields('openai_compat', 'gpt-image-2', {
      prompt: 'hi',
      model: 'gpt-image-2',
      loras: mixed,
    });
    expect(omitted.loras).toEqual(real);
  });

  it('other providers still wipe unsupported loras (Fal schnell)', () => {
    const wiped = resolveGenerateLorasPayload('fal', 'fal-ai/flux/schnell', real);
    expect(wiped).toBeUndefined();
    const omitted = omitUnsupportedGenerateFields('fal', 'fal-ai/flux/schnell', {
      prompt: 'hi',
      loras: real,
    });
    expect(omitted.loras).toBeUndefined();
  });

  it('other providers keep named "LoRA" entries when loras are supported (unchanged)', () => {
    // fal-ai/flux-lora supports loras — must not strip a real name "LoRA" for non-openai_compat
    const kept = resolveGenerateLorasPayload('fal', 'fal-ai/flux-lora', namedLoRA);
    expect(kept).toEqual(namedLoRA);
  });
});

describe('ModelScope / ModelScope AI provider resolution & capabilities', () => {
  it('resolveCheckpointModelProvider maps ModelScope models to modelscope', () => {
    expect(resolveCheckpointModelProvider('Tongyi-MAI/Z-Image-Turbo')).toBe('modelscope');
    expect(resolveCheckpointModelProvider('AI-ModelScope/stable-diffusion-xl-base-1.0')).toBe('modelscope');
    expect(resolveCheckpointModelProvider('AI-ModelScope/flux.1-dev')).toBe('modelscope');
    expect(resolveCheckpointModelProvider('damo/wan2.1-t2i-1.3b')).toBe('modelscope');
    expect(resolveCheckpointModelProvider('Kwai-Kolors/Kolors')).toBe('modelscope');
    expect(resolveCheckpointModelProvider('fal-ai/flux/schnell')).toBe('fal');
    expect(resolveCheckpointModelProvider('gemini-2.5-flash-image')).toBe('gemini');
    expect(resolveCheckpointModelProvider('')).toBeUndefined();
  });

  it('applyCheckpointModelSelection atomically updates ckpt_name and targetProvider', () => {
    const updated = applyCheckpointModelSelection({ someVal: 123 }, 'Tongyi-MAI/Z-Image-Turbo');
    expect(updated.ckpt_name).toBe('Tongyi-MAI/Z-Image-Turbo');
    expect(updated.targetProvider).toBe('modelscope');
    expect(updated.someVal).toBe(123);
  });

  it('isLoraUnsupportedOnEndpoint returns false for ModelScope Z-Image-Turbo but true for HF Space', () => {
    const msBadge = isLoraUnsupportedOnEndpoint('modelscope', 'Tongyi-MAI/Z-Image-Turbo');
    expect(msBadge.unsupported).toBe(false);

    const msAiBadge = isLoraUnsupportedOnEndpoint('modelscope_ai', 'Tongyi-MAI/Z-Image-Turbo');
    expect(msAiBadge.unsupported).toBe(false);

    const hfBadge = isLoraUnsupportedOnEndpoint('huggingface', 'Tongyi-MAI/Z-Image-Turbo');
    expect(hfBadge.unsupported).toBe(true);
    expect(hfBadge.message).toMatch(/该服务商不支持/);
  });

  it('ModelScope canvas fields: keeps negative/seed/steps/cfg/width/height/loras, greys sampler/scheduler/denoise', () => {
    const model = 'Tongyi-MAI/Z-Image-Turbo';
    expect(isCanvasFieldUnsupported('modelscope', model, 'negative_prompt')).toBe(false);
    expect(isCanvasFieldUnsupported('modelscope', model, 'seed')).toBe(false);
    expect(isCanvasFieldUnsupported('modelscope', model, 'steps')).toBe(false);
    expect(isCanvasFieldUnsupported('modelscope', model, 'cfg')).toBe(false);
    expect(isCanvasFieldUnsupported('modelscope', model, 'width')).toBe(false);
    expect(isCanvasFieldUnsupported('modelscope', model, 'height')).toBe(false);
    expect(isCanvasFieldUnsupported('modelscope', model, 'loras')).toBe(false);

    expect(isCanvasFieldUnsupported('modelscope', model, 'sampler')).toBe(true);
    expect(isCanvasFieldUnsupported('modelscope', model, 'scheduler')).toBe(true);
    expect(isCanvasFieldUnsupported('modelscope', model, 'denoise')).toBe(true);
  });
});
