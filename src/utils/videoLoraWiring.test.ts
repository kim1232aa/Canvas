import { describe, expect, it } from 'vitest';
import { WORKFLOW_PRESETS } from '../constants/presets';
import { extractWorkflowParameters } from './graphEngine';
import { buildFalVideoRequest } from '../server/falVideoContract';
import { inlineFalItemRefs } from '../server/falImageContract';
import { buildReplicatePredictionRequest } from '../server/replicateImageContract';

const W21 = 'https://huggingface.co/Remade-AI/matrix-shot/resolve/main/matrix_shot.safetensors';
const extract = (id: string) => {
  const p = WORKFLOW_PRESETS.find((x) => x.id === id)!;
  const nodes = p.nodes.map((n) => ({ ...n, values: { ...n.values, ...(n.type === 'LoadImage' ? { image_url: 'https://example.com/ref.png' } : {}) } }));
  return extractWorkflowParameters(nodes as any, p.connections as any, `${id}-vid`);
};

describe('video LoRA wiring (LoRALoader → AIVideoNode.lora)', () => {
  it.each(['std-fal-i2v', 'std-wavespeed-i2v', 'std-muapi-i2v', 'std-replicate-i2v'])('%s extracts the recipe LoRA, seed and cfg as filled', (id) => {
    const x = extract(id);
    expect(x.loras.map((l) => [l.name, l.modelStrength])).toEqual([[W21, 1]]);
    expect(x.seed).toBe(24231881);
    expect(x.cfg).toBe(4);
    // WaveSpeed: recipe 688x480 mapped to live Schema enum 832*480 (upstream 400 otherwise).
    expect(x.size).toBe(id === 'std-wavespeed-i2v' ? '832*480' : '688x480');
  });
  it('WaveSpeed preset size is the live Schema enum value 832*480 (sent with * separator)', () => {
    expect(extract('std-wavespeed-i2v').size).toBe('832*480');
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
