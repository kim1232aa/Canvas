import { describe, expect, it } from 'vitest';
import { buildFalVideoRequest } from './falVideoContract';

// Shape of the live OpenAPI for fal-ai/wan-i2v-lora after inlineFalItemRefs (LoraWeight {path, weight_name, scale}).
const props = {
  prompt: {}, image_url: {}, seed: {}, guide_scale: {}, frames_per_second: {}, num_frames: {}, resolution: { enum: ['480p', '720p'] }, aspect_ratio: { enum: ['auto', '16:9', '9:16', '1:1'] },
  loras: { type: 'array', items: { properties: { path: { type: 'string' }, weight_name: { type: 'string' }, scale: { type: 'number' } }, required: ['path'] } },
};
const canvasLora = { name: 'https://hf.co/m.safetensors', path: 'https://hf.co/m.safetensors', strength: 1, modelStrength: 1, clipStrength: 1, civitaiId: '', triggers: '' };

describe('Fal video outgoing body', () => {
  it('LoRA items carry exactly the live Schema item keys ({path, scale}); no _canvas; user values all sent', () => {
    const { payload } = buildFalVideoRequest('fal-ai/wan-i2v-lora', {
      prompt: 'p', image_url: 'https://x/a.png', seed: 24231881, cfg: 4, fps: 16, num_frames: 81, resolution: '480p', aspect_ratio: '16:9', duration: 5,
      loras: [canvasLora],
      custom_parameters: { _canvas: { scope: { provider: 'fal' }, schemaProperties: ['prompt'] }, loras: [canvasLora] },
    }, props);
    expect(payload.loras).toEqual([{ path: 'https://hf.co/m.safetensors', scale: 1 }]);
    expect(payload).not.toHaveProperty('_canvas');
    expect(JSON.stringify(payload)).not.toMatch(/modelStrength|clipStrength|civitaiId|triggers/);
    expect(payload).toMatchObject({ seed: 24231881, guide_scale: 4, frames_per_second: 16, num_frames: 81, resolution: '480p', aspect_ratio: '16:9', image_url: 'https://x/a.png' });
    expect(payload).toHaveProperty('duration', 5); // undeclared user value still goes out as filled
  });
});
