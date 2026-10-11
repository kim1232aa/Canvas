import { afterEach, describe, expect, it } from 'vitest';
import { VideoDriver } from '../engines/drivers/VideoDriver';
import { buildFalVideoRequest } from './falVideoContract';

const i2v = 'fal-ai/kling-video/v3/standard/image-to-video';
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

describe('Fal video site-to-wire contract', () => {
  it('runs the actual driver body through the server builder', async () => {
    let payload: Record<string, unknown> | undefined;
    globalThis.fetch = async (_url, init) => {
      payload = buildFalVideoRequest(i2v, JSON.parse(String(init?.body))).payload;
      return new Response(JSON.stringify({ videoUrl: 'https://example.com/out.mp4' }));
    };
    await new VideoDriver().generate({ model: i2v, prompt: 'orbit', image_url: 'https://example.com/start.png', videoDuration: 5, targetProvider: 'fal' }, {});
    expect(payload).toMatchObject({ start_image_url: 'https://example.com/start.png', duration: '5' });
    expect(payload).not.toHaveProperty('image_url');
  });
  it('accepts both image aliases and rejects conflict, missing image, and T2V references', () => {
    expect(buildFalVideoRequest(i2v, { image_url: 'a' }).payload.start_image_url).toBe('a');
    expect(() => buildFalVideoRequest(i2v, { image_url: 'a', start_image_url: 'b' })).toThrow(/不一致/);
    expect(() => buildFalVideoRequest(i2v, {})).toThrow(/必填/);
    for (const field of ['image_url', 'start_image_url']) expect(() => buildFalVideoRequest(i2v.replace('image-to-video', 'text-to-video'), { [field]: 'a' })).toThrow(/参考图/);
  });
  it('checks aliases before overrides and validates the actual Wan wire', () => {
    expect(() => buildFalVideoRequest(i2v, { image_url: 'a', start_image_url: 'b', custom_parameters: { image_url: 'b' } })).toThrow(/不一致/);
    expect(() => buildFalVideoRequest('fal-ai/wan-i2v', { image_url: 'a', custom_parameters: { frames_per_second: 30 } })).toThrow(/5.*24/);
    expect(() => buildFalVideoRequest(i2v, { image_url: 'a', custom_parameters: { seed: 1 } })).toThrow(/seed/);
    expect(() => buildFalVideoRequest(i2v, { image_url: 'a', custom_parameters: { provider: 'other' } })).toThrow(/路由/);
    const built = buildFalVideoRequest(i2v, { image_url: 'a', custom_parameters: { start_image_url: 'b' } });
    expect(built.beforeCustom.start_image_url).toBe('a');
    expect(built.payload.start_image_url).toBe('b');
    expect(built.overrides.start_image_url).toEqual({ before: 'a', after: 'b' });
  });
  it('validates final required images, references and custom Wan aliases', () => {
    expect(() => buildFalVideoRequest(i2v, { image_url: 'a', custom_parameters: { start_image_url: null } })).toThrow(/必填/);
    expect(() => buildFalVideoRequest('fal-ai/wan-i2v', {})).toThrow(/必填/);
    expect(() => buildFalVideoRequest('fal-ai/wan/v2.7/image-to-video', {})).toThrow(/image_url.*video_url/);
    expect(buildFalVideoRequest('fal-ai/wan/v2.7/image-to-video', { custom_parameters: { video_url: 'a' } }).payload.video_url).toBe('a');
    expect(() => buildFalVideoRequest(i2v.replace('image-to-video', 'text-to-video'), { image_url: 'a', custom_parameters: { image_url: null } })).toThrow(/参考图/);
    expect(buildFalVideoRequest('fal-ai/wan-i2v', { image_url: 'a', custom_parameters: { fps: 20 } }).payload).toMatchObject({ frames_per_second: 20 });
    expect(() => buildFalVideoRequest('fal-ai/wan-i2v', { image_url: 'a', custom_parameters: { duration: 5 } })).toThrow(/duration/);
  });
  it('preserves unknown fields and custom overrides with trace', () => {
    const built = buildFalVideoRequest('fal-ai/unknown/image-to-video', { image_url: 'a', cfg: 2, fps: 30, num_frames: 120, resolution: '8k', custom_parameters: { generate_audio: false, end_image_url: 'b', multi_prompt: [{ prompt: 'shot' }], cfg: 3 } });
    expect(built.payload).toMatchObject({ fps: 30, num_frames: 120, resolution: '8k', guidance_scale: 3, generate_audio: false, end_image_url: 'b' });
    expect(built.beforeCustom.guidance_scale).toBe(2);
    expect(built.overrides.guidance_scale).toEqual({ before: 2, after: 3 });
  });
  it('maps custom guidance aliases without overwriting conflicting sources', () => {
    expect(buildFalVideoRequest(i2v, { image_url: 'a', custom_parameters: { cfg: 0.7 } }).payload).toMatchObject({ cfg_scale: 0.7 });
    expect(() => buildFalVideoRequest(i2v, { image_url: 'a', custom_parameters: { cfg: 0.5, guidance_scale: 0.7 } })).toThrow(/cfg.*guidance_scale/);
    expect(() => buildFalVideoRequest(i2v, { image_url: 'a', cfg: 0.5, custom_parameters: { guidance_scale: 0.7 } })).toThrow(/cfg.*guidance_scale/);
  });
  it('rejects unsupported seed, malformed custom object and competing guidance aliases', () => {
    expect(() => buildFalVideoRequest(i2v, { image_url: 'a', seed: 1 })).toThrow(/seed/);
    for (const custom_parameters of [null, [], 'abc']) expect(() => buildFalVideoRequest(i2v, { image_url: 'a', custom_parameters })).toThrow(/object|对象/);
    expect(() => buildFalVideoRequest('fal-ai/wan-i2v', { image_url: 'a', cfg: 2, guidance_scale: 3 })).toThrow(/cfg.*guidance_scale/);
  });
  it('limits Wan 2.1 fps and frames only and maps its actual wire', () => {
    expect(buildFalVideoRequest('fal-ai/wan-i2v', { image_url: 'a', fps: 24, num_frames: 100 }).payload).toMatchObject({ frames_per_second: 24, num_frames: 100 });
    expect(() => buildFalVideoRequest('fal-ai/wan-i2v', { image_url: 'a', fps: 25 })).toThrow(/5.*24/);
    expect(() => buildFalVideoRequest('fal-ai/wan-i2v', { image_url: 'a', num_frames: 80 })).toThrow(/81.*100/);
  });
});
