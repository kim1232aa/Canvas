import { afterEach, describe, expect, it } from 'vitest';
import { VideoDriver } from '../engines/drivers/VideoDriver';
import { buildFalVideoRequest } from './falVideoContract';
import { FalSchemaMissingError } from './falImageContract';
import { loadFalLiveProps, falVideoProps } from './fixtures/liveSchemaFixtures';

const i2v = 'fal-ai/kling-video/v3/standard/image-to-video';
const t2v = 'fal-ai/kling-video/v3/standard/text-to-video';
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const klingI2v = () => loadFalLiveProps(i2v);
const klingT2v = () => loadFalLiveProps(t2v);
const wanI2v = () => loadFalLiveProps('fal-ai/wan-i2v');
const wan27 = () => loadFalLiveProps('fal-ai/wan/v2.7/image-to-video');

describe('Fal video site-to-wire contract', () => {
  it('runs the actual driver body through the server builder', async () => {
    let payload: Record<string, unknown> | undefined;
    globalThis.fetch = async (_url, init) => {
      payload = buildFalVideoRequest(i2v, JSON.parse(String(init?.body)), klingI2v()).payload;
      return new Response(JSON.stringify({ videoUrl: 'https://example.com/out.mp4' }));
    };
    await new VideoDriver().generate({ model: i2v, prompt: 'orbit', image_url: 'https://example.com/start.png', videoDuration: 5, targetProvider: 'fal' }, {});
    expect(payload).toMatchObject({ start_image_url: 'https://example.com/start.png', duration: '5' });
    expect(payload).not.toHaveProperty('image_url');
  });
  it('maps custom guidance aliases without overwriting conflicting sources', () => {
    expect(buildFalVideoRequest(i2v, { image_url: 'a', custom_parameters: { cfg: 0.7 } }, klingI2v()).payload).toMatchObject({ cfg_scale: 0.7 });
    expect(() => buildFalVideoRequest(i2v, { image_url: 'a', custom_parameters: { cfg: 0.5, guidance_scale: 0.7 } }, klingI2v())).toThrow(/cfg.*guidance_scale/);
    expect(() => buildFalVideoRequest(i2v, { image_url: 'a', cfg: 0.5, custom_parameters: { guidance_scale: 0.7 } }, klingI2v())).toThrow(/cfg.*guidance_scale/);
  });
  it('maps Wan 2.1 fps/frames wire; no local range refuse (Schema/upstream)', () => {
    expect(buildFalVideoRequest('fal-ai/wan-i2v', { image_url: 'a', fps: 24, num_frames: 100 }, wanI2v()).payload).toMatchObject({ frames_per_second: 24, num_frames: 100 });
    expect(buildFalVideoRequest('fal-ai/wan-i2v', { image_url: 'a', fps: 25 }, wanI2v()).payload).toMatchObject({ frames_per_second: 25 });
    expect(buildFalVideoRequest('fal-ai/wan-i2v', { image_url: 'a', num_frames: 80 }, wanI2v()).payload).toMatchObject({ num_frames: 80 });
  });
});
