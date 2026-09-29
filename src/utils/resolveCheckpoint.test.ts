import { describe, expect, it } from 'vitest';
import { Connection, NodeInstance } from '../types/graph';
import {
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
    expect(r.message).toMatch(/该端点不支持 LoRA/);
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
    expect(compat.message).toMatch(/该端点不支持 LoRA/);
    expect(compat.message).not.toMatch(/Z-Image|架构不匹配|Tongyi/);
  });

  it('validateLoraCompatibility with wrong canvas default would previously mismatch — endpoint check wins first', () => {
    // Even if someone passed Z-Image as checkpoint by mistake with fal provider+schnell...
    // When checkpoint IS schnell, we get endpoint message.
    const compat = validateLoraCompatibility('fal-ai/flux/schnell', 'Flux.1 D', 'koda', 'fal');
    expect(compat.message).not.toContain('Tongyi-MAI/Z-Image-Turbo');
  });
});
