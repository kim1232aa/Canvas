import { describe, expect, it } from 'vitest';
import { Connection, NodeInstance } from '../types/graph';
import {
  isCanvasFieldUnsupported,
  isFalLoraEndpointError,
  isLoraUnsupportedOnEndpoint,
  resolveActiveCheckpoint,
  resolveCheckpointForNode,
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

  it('isCanvasFieldUnsupported: openai_compat / grok_compat grey seed/negative/WH', () => {
    expect(isCanvasFieldUnsupported('openai_compat', 'gpt-image-2', 'seed')).toBe(true);
    expect(isCanvasFieldUnsupported('openai_compat', 'gpt-image-2', 'negative_prompt')).toBe(true);
    expect(isCanvasFieldUnsupported('openai_compat', 'gpt-image-2', 'width')).toBe(true);
    expect(isCanvasFieldUnsupported('grok_compat', 'grok-imagine-image', 'seed')).toBe(true);
    expect(isCanvasFieldUnsupported('grok_compat', 'grok-imagine-image', 'height')).toBe(true);
    expect(isCanvasFieldUnsupported('fal', 'fal-ai/flux/dev', 'seed')).toBe(false);
  });
});
