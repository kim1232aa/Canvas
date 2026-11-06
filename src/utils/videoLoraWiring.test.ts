import { describe, expect, it } from 'vitest';
import { WORKFLOW_PRESETS } from '../constants/presets';
import { extractWorkflowParameters } from './graphEngine';
import { buildFalVideoRequest } from '../server/falVideoContract';
import { inlineFalItemRefs } from '../server/falImageContract';
import { buildReplicatePredictionRequest } from '../server/replicateImageContract';

const FAL_W22_I2V_LORA = 'https://huggingface.co/ostris/wan22_i2v_14b_orbit_shot_lora/resolve/main/wan22_14b_i2v_orbit_high_noise.safetensors';
const WS_W22_I2V_LORA = 'https://huggingface.co/dustin2050/lexy-vox-i2v-lora-training-wan2.2/resolve/main/lexy_vox_i2v_v2_diffusers.safetensors';
const W21 = 'https://huggingface.co/Remade-AI/matrix-shot/resolve/main/matrix_shot.safetensors';
const extract = (id: string, overrides?: { model?: string; loraName?: string; loraStrength?: number }) => {
  const p = WORKFLOW_PRESETS.find((x) => x.id === id)!;
  const nodes = p.nodes.map((n) => ({
    ...n,
    values: {
      ...n.values,
      ...(n.type === 'LoadImage' ? { image_url: 'https://example.com/ref.png' } : {}),
      ...(n.type === 'AIVideoNode' && overrides?.model !== undefined ? { model: overrides.model } : {}),
      ...(n.type === 'LoRALoader' && overrides?.loraName !== undefined ? { lora_name: overrides.loraName } : {}),
      ...(n.type === 'LoRALoader' && overrides?.loraStrength !== undefined ? { strength_model: overrides.loraStrength, strength_clip: overrides.loraStrength } : {}),
    },
  }));
  return extractWorkflowParameters(nodes as any, p.connections as any, `${id}-vid`);
};

describe('video LoRA wiring (LoRALoader → AIVideoNode.lora)', () => {
  it('std-fal-i2v extracts the verified Wan 2.2 HIGH-noise LoRA, seed and cfg as filled', () => {
    const x = extract('std-fal-i2v');
    expect(x.loras.map((l) => [l.name, l.modelStrength])).toEqual([[FAL_W22_I2V_LORA, 1]]);
    expect(x.seed).toBe(24231881);
    expect(x.cfg).toBe(3.5);
    expect(x.size).toBeUndefined();
  });
  it('std-wavespeed-i2v extracts the verified Wan 2.2 Diffusers LoRA, seed 42 and videoDuration 5 as filled', () => {
    const x = extract('std-wavespeed-i2v');
    expect(x.loras.map((l) => [l.name, l.modelStrength])).toEqual([[WS_W22_I2V_LORA, 1]]);
    expect(x.seed).toBe(42);
    expect(x.videoDuration).toBe(5);
  });
  it('std-replicate-i2v requires explicit user model selection, and preserves manual legacy/custom model + LoRA wiring (including strength 0)', () => {
    expect(() => extract('std-replicate-i2v')).toThrow('请先选择模型');
    const x = extract('std-replicate-i2v', { model: 'wan-video/wan2.1-with-lora', loraName: W21, loraStrength: 1 });
    expect(x.loras.map((l) => [l.name, l.modelStrength])).toEqual([[W21, 1]]);
    expect(x.seed).toBe(24231881);
    expect(x.cfg).toBe(4);
    expect(x.size).toBeUndefined();
    const zero = extract('std-replicate-i2v', { model: 'wan-video/wan2.1-with-lora', loraName: W21, loraStrength: 0 });
    expect(zero.loras.map((l) => [l.name, l.modelStrength])).toEqual([[W21, 0]]);
  });
  it('WaveSpeed T2V preset size is the live Schema enum value 832*480 (sent with * separator)', () => {
    expect(extract('std-wavespeed-t2v').size).toBe('832*480');
  });
  it('civitai extracts the AIR LoRA', () => {
    const x = extract('std-civitai-i2v');
    expect(x.loras.map((l) => l.name)).toEqual(['urn:air:wanvideo-22-i2v-a14b:lora:civitai:1902817@2153813']);
    expect(x.seed).toBe(1715864103);
  });
  it('Fal maps loras into the live item Schema (LoraWeight path/scale)', () => {
    const doc = { components: { schemas: { LoraWeight: { properties: { path: {}, scale: {}, weight_name: {} } } } } };
    const props = inlineFalItemRefs({ prompt: {}, image_url: {}, loras: { type: 'array', items: { $ref: '#/components/schemas/LoraWeight' } }, seed: {}, guide_scale: {} }, doc);
    const out = buildFalVideoRequest('fal-ai/wan-i2v-lora', { prompt: 'p', loras: [{ name: W21, strength: 1, modelStrength: 1 }], seed: 7, cfg: 4 }, props).payload;
    expect(out.loras).toEqual([{ path: W21, scale: 1 }]);
    expect(out.guide_scale).toBe(4);
    expect(out.seed).toBe(7);
  });
  it('Replicate fills a Schema-declared single lora_url slot + its strength key', () => {
    const r = buildReplicatePredictionRequest({ model: 'wan-video/wan2.1-with-lora', prompt: 'p', loras: [{ name: W21, path: W21, strength: 1 }] } as any, 'https://api.replicate.com', { prompt: {}, lora_url: {}, lora_strength_model: {}, lora_strength_clip: {}, seed: {} } as any);
    const input = (r as any).body?.input ?? (r as any).payload?.input ?? (r as any).input;
    expect(input.lora_url).toBe(W21);
    expect(input.lora_strength_model).toBe(1);
  });
});
