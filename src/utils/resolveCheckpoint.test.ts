import { describe, expect, it } from 'vitest';
import { Connection, NodeInstance } from '../types/graph';
import {
  canvasWidgetFieldKey,
  isCanvasFieldUnsupported,
  isCanvasWidgetUnsupported,
  isFalLoraEndpointError,
  isLoraUnsupportedOnEndpoint,
  LORA_UNSUPPORTED_MESSAGE,
  LORA_UNSUPPORTED_EMPTY_CHECKPOINT,
  LORA_UNSUPPORTED_UNKNOWN_MODEL,
  LORA_UNSUPPORTED_TITLE,
  resolveActiveCheckpoint,
  resolveCheckpointForNode,
  sanitizeFrameLoras,
  filterRealLoraEntries,
  isRealLoraEntry,
  omitUnsupportedGenerateFields,
  resolveGenerateLorasPayload,
  checkLoraArchitectureCompatibility,
  getArchitectureFamily,
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

  it('validateLoraCompatibility with wrong canvas default would previously mismatch — endpoint check wins first', () => {
    // Even if someone passed Z-Image as checkpoint by mistake with fal provider+schnell...
    // When checkpoint IS schnell, we get endpoint message.
    const compat = validateLoraCompatibility('fal-ai/flux/schnell', 'Flux.1 D', 'koda', 'fal');
    expect(compat.message).not.toContain('Tongyi-MAI/Z-Image-Turbo');
  });

  it('isFalLoraEndpointError: paints Fal HTTP/endpoint messages, not Hugging Face loras 400', () => {
    expect(isFalLoraEndpointError('HTTP 400: 该端点不支持 LoRA（Fal.ai 端点 fal-ai/flux/schnell 的官方 schema 无 loras 字段）')).toBe(true);
    expect(isFalLoraEndpointError('该端点不支持 LoRA（fal 端点 fal-ai/flux/schnell 的官方 schema 无 loras 字段）')).toBe(true);
    expect(isFalLoraEndpointError('该服务商不支持（fal / fal-ai/flux/schnell 的官方 schema 无 loras 字段）')).toBe(true);
    expect(isFalLoraEndpointError(LORA_UNSUPPORTED_MESSAGE)).toBe(true);
    expect(isFalLoraEndpointError(LORA_UNSUPPORTED_TITLE)).toBe(true);
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

  it('Z-Image checkpoint + Flux LoRA: family guess is unverified, never 底模架构不匹配', () => {
    const compat = validateLoraCompatibility('Tongyi-MAI/Z-Image-Turbo', 'Flux.1 D', '[Flux1] Asian Mix Lora - Krea/Dev.safetensors', 'modelscope_ai');
    expect(compat.isCompatible).toBe(true);
    expect(compat.verification).toBe('unverified');
    expect(compat.message).not.toMatch(/底模架构不匹配/);
  });

  it('Tensor model IDs retain LoRA and sampler parameters through the canvas payload', () => {
    const model='613045163490732233';
    const loras=[{name:'672797109289765558',modelStrength:0.8}];
    for(const field of ['loras','width','height','seed','steps','cfg'] as const) {
      expect(isCanvasFieldUnsupported('tensorart',model,field)).toBe(false);
    }
    expect(sanitizeFrameLoras('tensorart',model,loras)).toEqual(loras);
    expect(isLoraUnsupportedOnEndpoint('tensorart',model).unsupported).toBe(false);
    const input={prompt:'hi',width:1024,height:1024,seed:1,steps:20,cfg:7,loras,negative_prompt:'blurry'};
    expect(omitUnsupportedGenerateFields('tensorart',model,input)).toEqual(input);
  });

  it('omitUnsupportedGenerateFields preserves all explicitly supplied values for runtime validation', () => {
    const agnes = omitUnsupportedGenerateFields('agnes', 'agnes-image-2.5-flash', {
      prompt: 'hi',
      negative_prompt: 'blurry',
      seed: 42,
      steps: 20,
      cfg: 7,
      width: 1024,
      height: 1024,
      loras: [],
      sampler_name: 'euler',
    });
    expect(agnes.prompt).toBe('hi');
    expect(agnes.width).toBe(1024);
    expect(agnes.height).toBe(1024);
    expect(agnes.negative_prompt).toBe('blurry');
    expect(agnes.seed).toBe(42);
    expect(agnes.steps).toBe(20);
    expect(agnes.cfg).toBe(7);
    expect(agnes.loras).toEqual([]);
    expect(agnes.sampler_name).toBe('euler');

    const nano = omitUnsupportedGenerateFields('nanogpt', 'flux-schnell', {
      prompt: 'hi',
      negative_prompt: 'blurry',
      seed: 99,
      loras: [],
      width: 512,
    });
    expect(nano.seed).toBe(99);
    expect(nano.negative_prompt).toBe('blurry');
    expect(nano.loras).toEqual([]);
    expect(nano.width).toBe(512);

    const hf = omitUnsupportedGenerateFields('huggingface', 'black-forest-labs/FLUX.1-dev', {
      prompt: 'hi',
      negative_prompt: 'blurry',
      seed: 1,
      steps: 28,
      loras: [],
      sampler_name: 'euler',
    });
    expect(hf.negative_prompt).toBe('blurry');
    expect(hf.seed).toBe(1);
    expect(hf.steps).toBe(28);
    expect(hf.loras).toEqual([]);
    expect(hf.sampler_name).toBe('euler');
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

describe('schema-agnostic payload preservation', () => {
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

  it('preserves an explicitly supplied empty LoRA array and other explicit fields', () => {
    const lorasPayload = resolveGenerateLorasPayload('openai_compat', 'gpt-image-2', []);
    expect(lorasPayload).toEqual([]);
    const omitted = omitUnsupportedGenerateFields('openai_compat', 'gpt-image-2', {
      prompt: 'hi',
      model: 'gpt-image-2',
      seed: 123,
      negative_prompt: 'blur',
      steps: 20,
      cfg: 7,
      loras: lorasPayload,
    });
    expect(omitted.loras).toEqual([]);
    expect(omitted.seed).toBe(123);
    expect(omitted.negative_prompt).toBe('blur');
    expect(omitted.steps).toBe(20);
    expect(omitted.cfg).toBe(7);
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

  it('preserves mixed empty-name and real LoRA entries exactly as supplied', () => {
    const mixed = [...emptyName, ...namedLoRA];
    expect(resolveGenerateLorasPayload('openai_compat', 'gpt-image-2', mixed)).toEqual(mixed);
  });

  it('preserves whitespace-name entries for endpoint validation', () => {
    const lorasPayload = resolveGenerateLorasPayload('openai_compat', 'gpt-image-2', emptyName);
    expect(lorasPayload).toEqual(emptyName);
    const omitted = omitUnsupportedGenerateFields('openai_compat', 'gpt-image-2', {
      prompt: 'hi',
      model: 'gpt-image-2',
      loras: emptyName,
    });
    expect(omitted.loras).toEqual(emptyName);
  });

  it('preserves mixed LoRA entries through payload and omission helpers', () => {
    const mixed = [...emptyName, ...real];
    const lorasPayload = resolveGenerateLorasPayload('openai_compat', 'gpt-image-2', mixed);
    expect(lorasPayload).toEqual(mixed);
    const omitted = omitUnsupportedGenerateFields('openai_compat', 'gpt-image-2', {
      prompt: 'hi',
      model: 'gpt-image-2',
      loras: mixed,
    });
    expect(omitted.loras).toEqual(mixed);
  });

  it('passes LoRA to even statically marked unsupported endpoints for runtime validation', () => {
    expect(resolveGenerateLorasPayload('fal', 'fal-ai/flux/schnell', real)).toEqual(real);
    expect(omitUnsupportedGenerateFields('fal', 'fal-ai/flux/schnell', {prompt: 'hi', loras: real})).toEqual({prompt: 'hi', loras: real});
  });

  it('other providers keep named "LoRA" entries when loras are supported (unchanged)', () => {
    // fal-ai/flux-lora supports loras — must not strip a real name "LoRA" for non-openai_compat
    const kept = resolveGenerateLorasPayload('fal', 'fal-ai/flux-lora', namedLoRA);
    expect(kept).toEqual(namedLoRA);
  });
});

describe('checkLoraArchitectureCompatibility & ReplicateEngineNode resolution', () => {
  it('resolves ReplicateEngineNode as active checkpoint and walks LoRA connection', () => {
    const nodes = [
      node('lora-1', 'LoRALoader', { lora_name: '[Krea2 Turbo] AsianMix Lora', base_model: 'Krea2 Turbo', strength_model: 1 }),
      node('rep-1', 'ReplicateEngineNode', { model: 'black-forest-labs/flux-dev' }),
    ];
    const conns: Connection[] = [
      {
        id: 'c1',
        fromNodeId: 'lora-1',
        fromSocketId: 'MODEL',
        toNodeId: 'rep-1',
        toSocketId: 'lora',
        type: 'MODEL',
      },
    ];

    const active = resolveActiveCheckpoint(nodes, conns, 'rep-1');
    expect(active.checkpoint).toBe('black-forest-labs/flux-dev');
    expect(active.provider).toBe('replicate');

    const forLora = resolveCheckpointForNode('lora-1', nodes, conns);
    expect(forLora.checkpoint).toBe('black-forest-labs/flux-dev');
    expect(forLora.provider).toBe('replicate');
    expect(forLora.engineNodeId).toBe('rep-1');
  });

  it('correctly classifies model architecture families', () => {
    expect(getArchitectureFamily('black-forest-labs/flux-dev')).toBe('flux');
    expect(getArchitectureFamily('FLUX.1')).toBe('flux');
    expect(getArchitectureFamily('Flux.1 D')).toBe('flux');
    expect(getArchitectureFamily('Krea2 Turbo')).toBe('sdxl');
    expect(getArchitectureFamily('krea 2 turbo')).toBe('sdxl');
    expect(getArchitectureFamily('stabilityai/stable-diffusion-xl-base-1.0')).toBe('sdxl');
    expect(getArchitectureFamily('SDXL 1.0')).toBe('sdxl');
    expect(getArchitectureFamily('runwayml/stable-diffusion-v1-5')).toBe('sd15');
    expect(getArchitectureFamily('stabilityai/stable-diffusion-3.5-large')).toBe('sd35');
    expect(getArchitectureFamily('Wan-AI/Wan2.1-T2V-14B')).toBe('wan21');
  });

  it('flags cross-architecture mismatch between FLUX.1 checkpoint and Krea2 Turbo / SDXL LoRA', () => {
    const res = checkLoraArchitectureCompatibility(
      'black-forest-labs/flux-dev',
      undefined,
      { name: '[Krea2 Turbo] AsianMix Lora', baseModel: 'Krea2 Turbo' }
    );
    expect(res.compatible).toBe(false);
    expect(res.ckptFamily).toBe('flux');
    expect(res.loraFamily).toBe('sdxl');
    expect(res.reason).toBe(
      'LoRA [[Krea2 Turbo] AsianMix Lora] (baseModel: Krea2 Turbo) 与底模 [black-forest-labs/flux-dev] (baseModel: FLUX.1) 架构不兼容，未发送至上游。'
    );
  });

  it('allows matching architectures: FLUX + FLUX, SDXL + SDXL', () => {
    const fluxRes = checkLoraArchitectureCompatibility(
      'black-forest-labs/flux-dev',
      'FLUX.1',
      { name: 'flux-realism-lora', baseModel: 'Flux.1 D' }
    );
    expect(fluxRes.compatible).toBe(true);

    const sdxlRes = checkLoraArchitectureCompatibility(
      'stabilityai/stable-diffusion-xl-base-1.0',
      'SDXL 1.0',
      { name: '[Krea2 Turbo] AsianMix Lora', baseModel: 'Krea2 Turbo' }
    );
    expect(sdxlRes.compatible).toBe(true);
  });

  it('resolveGenerateLorasPayload preserves all LoRAs without silent filtering so runtime/graphEngine rejects explicitly', () => {
    const loras = [
      { name: '[Krea2 Turbo] AsianMix Lora', baseModel: 'Krea2 Turbo', strength: 0.8 },
      { name: 'flux-detailer', baseModel: 'Flux.1 D', strength: 1.0 },
    ];
    const preserved = resolveGenerateLorasPayload('replicate', 'black-forest-labs/flux-dev', loras);
    expect(preserved).toHaveLength(2);
    expect(preserved).toEqual(loras);
  });
});