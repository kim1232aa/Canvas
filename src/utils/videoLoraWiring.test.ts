import { describe, expect, it } from 'vitest';
import { WORKFLOW_PRESETS } from '../constants/presets';
import { extractWorkflowParameters } from './graphEngine';
import { buildFalVideoRequest } from '../server/falVideoContract';
import { inlineFalItemRefs } from '../server/falImageContract';
import { buildReplicatePredictionRequest } from '../server/replicateImageContract';

const FAL_W22_I2V_LORA = 'https://huggingface.co/ostris/wan22_i2v_14b_orbit_shot_lora/resolve/main/wan22_14b_i2v_orbit_high_noise.safetensors';
const WS_W22_I2V_LORA = 'https://huggingface.co/dustin2050/lexy-vox-i2v-lora-training-wan2.2/resolve/main/lexy_vox_i2v_v2_diffusers.safetensors';
const W21 = 'https://huggingface.co/Remade-AI/matrix-shot/resolve/main/matrix_shot.safetensors';
const extract = (id: string) => {
  const preset = WORKFLOW_PRESETS.find((x) => x.id === id);
  expect(preset, `current preset ${id}`).toBeDefined();
  const p = preset!;
  const video = p.nodes.find((n) => n.type === 'AIVideoNode');
  const reference = p.nodes.find((n) => n.type === 'LoadImage');
  const lora = p.nodes.find((n) => n.type === 'LoRALoader');
  expect(video, `${id} video node`).toBeDefined();
  expect(lora, `${id} LoRA node`).toBeDefined();
  expect(p.connections).toContainEqual(expect.objectContaining({ fromNodeId: lora!.id, toNodeId: video!.id, toSocketId: 'lora' }));
  if (video!.values.require_reference_image) expect(reference, `${id} reference image node`).toBeDefined();
  const nodes = p.nodes.map((n) => ({
    ...n,
    values: {
      ...n.values,
      ...(n.type === 'LoadImage' ? { image_url: 'https://example.com/ref.png' } : {}),

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
  it('a user-configured Replicate graph requires a model and preserves custom/legacy model + LoRA, including strength 0 in the request', () => {
    const p = WORKFLOW_PRESETS.find((preset) => preset.id === 'std-fal-i2v');
    expect(p, 'current I2V graph fixture with reference and LoRA sockets').toBeDefined();
    const video = p!.nodes.find((n) => n.type === 'AIVideoNode');
    const lora = p!.nodes.find((n) => n.type === 'LoRALoader');
    expect(video, 'video fixture').toBeDefined();
    expect(lora, 'wired LoRA fixture').toBeDefined();
    const userGraph = (model: string, strength: number) => p!.nodes.map((n) => ({
      ...n,
      values: n.type === 'AIVideoNode'
        ? { targetProvider: 'replicate', model, seed: 24231881, cfg: 4, prompt: 'A woman on a rooftop, cinematic wide shot, slow matrix-style orbit', require_reference_image: true }
        : { ...n.values, ...(n.type === 'LoadImage' ? { image_url: 'https://example.com/ref.png' } : {}), ...(n.type === 'LoRALoader' ? { lora_name: W21, strength_model: strength, strength_clip: strength } : {}) },
    }));
    expect(() => extractWorkflowParameters(userGraph('', 1), p!.connections, video!.id)).toThrow('请先选择模型');
    for (const model of ['wan-video/wan2.1-with-lora', 'user-owner/custom-video-lora']) {
      for (const strength of [1, 0]) {
        const x = extractWorkflowParameters(userGraph(model, strength), p!.connections, video!.id);
        expect(x).toMatchObject({ checkpointModel: model, videoProvider: 'replicate', seed: 24231881, cfg: 4, initImageUrl: 'https://example.com/ref.png', isVideo: true });
        expect(x.size).toBeUndefined();
        expect(x.loras.map((l) => [l.name, l.modelStrength, l.clipStrength])).toEqual([[W21, strength, strength]]);
        const request = buildReplicatePredictionRequest({ model: x.checkpointModel, prompt: x.positivePrompt, seed: x.seed, cfg: x.cfg, image_url: x.initImageUrl, loras: x.loras }, 'https://api.replicate.com/v1', { prompt: {}, image_url: {}, seed: {}, guidance_scale: {}, lora_url: {}, lora_strength_model: {} });
        expect(request.actualModel).toBe(model);
        expect(request.endpoint).toBe(`https://api.replicate.com/v1/models/${model}/predictions`);
        expect(request.payload.input).toMatchObject({ image_url: 'https://example.com/ref.png', seed: 24231881, guidance_scale: 4, lora_url: W21, lora_strength_model: strength });
      }
    }
  });
  it('WaveSpeed T2V preset size is the live Schema enum value 832*480 (sent with * separator)', () => {
    expect(extract('std-wavespeed-t2v').size).toBe('832*480');
  });
  it('civitai extracts the AIR LoRA', () => {
    const x = extract('std-civitai-i2v');
    expect(x.loras.map((l) => l.name)).toEqual(['urn:air:wanvideo-22-i2v-a14b:lora:civitai:1902817@2153813']);
    expect(x.seed).toBe(1715864103);
  });
  it.each([1, 0])('Fal maps LoRA path/scale including strength %s using the documented item Schema', (strength) => {
    const doc = { components: { schemas: { LoRAWeight: { properties: { path: {}, scale: {}, weight_name: {}, transformer: {} } } } } };
    const props = inlineFalItemRefs({ prompt: {}, image_url: {}, loras: { type: 'array', items: { $ref: '#/components/schemas/LoRAWeight' } }, seed: {}, guidance_scale: {} }, doc);
    const out = buildFalVideoRequest('fal-ai/wan/v2.2-a14b/image-to-video/lora', { prompt: 'A lighthouse above rough seas, cinematic wide shot, slow orbit', image_url: 'https://example.com/ref.png', loras: [{ name: FAL_W22_I2V_LORA, strength, modelStrength: strength }], seed: 7, cfg: 3.5 }, props).payload;
    expect(out.loras).toEqual([{ path: FAL_W22_I2V_LORA, scale: strength }]);
    expect(out.guidance_scale).toBe(3.5);
    expect(out.seed).toBe(7);
    expect(out.image_url).toBe('https://example.com/ref.png');
  });
  it('Replicate maps the single LoRA slot from an injected model Schema without guessing a payload shape', () => {
    const request = buildReplicatePredictionRequest({ model: 'user-owner/single-lora-fixture', prompt: 'A lighthouse above rough seas, cinematic wide shot, slow orbit', loras: [{ name: W21, path: W21, strength: 1 }] }, 'https://api.replicate.com/v1', { prompt: {}, lora_url: {}, lora_strength_model: {}, seed: {} });
    expect(request.payload.input).toMatchObject({ lora_url: W21, lora_strength_model: 1 });
  });
});
