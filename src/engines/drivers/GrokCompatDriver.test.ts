import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { GrokCompatDriver } from './GrokCompatDriver';
import { NormalizedGenerateParams } from '../types';
import { EngineRegistry } from '../EngineRegistry';

describe('GrokCompatDriver', () => {
  const driver = new GrokCompatDriver();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('已注册且能力含 reasoning + 图/视频', () => {
    expect(EngineRegistry.getDriver('grok_compat')?.id).toBe('grok_compat');
    expect(driver.capabilities).toEqual(['text2img', 'img2img', 'text2video', 'img2video', 'reasoning']);
  });

  it('视频模型走 /api/video/generate 且 provider=grok_compat，不静默换商', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ videoUrl: 'https://relay.example/v1/videos/1/content', model: 'grok-imagine-video' }), { status: 200 }));

    await driver.generate(
      { prompt: 'orbit', model: 'grok-imagine-video', videoDuration: 4, aspectRatio: '16:9' },
      { grokCompatKey: 'sk-grok', grokCompatBaseUrl: 'https://relay.example' },
    );

    const [url, init] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toBe('/api/video/generate');
    const body = JSON.parse(init.body);
    expect(body.provider).toBe('grok_compat');
    expect(body.model).toBe('grok-imagine-video');
    expect(body.duration).toBe(4);
  });

  it('视频分支透传所有画布参数 (seed, negative_prompt, steps, cfg, loras, width, height, fps, custom_parameters)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ videoUrl: 'https://relay.example/v1/videos/1/content', model: 'grok-imagine-video', seed: 4242 }), { status: 200 }));

    const res = await driver.generate(
      {
        prompt: 'orbit video',
        negative_prompt: 'ugly, blurry',
        model: 'grok-imagine-video',
        isVideo: true,
        videoDuration: 5,
        videoFps: 30,
        aspectRatio: '16:9',
        seed: 4242,
        steps: 25,
        cfg: 7.5,
        width: 1280,
        height: 720,
        loras: [{ name: 'cyber-lora', strength: 0.8 } as any],
        extraParams: { custom_parameters: { custom_field: 'custom_val' } },
      },
      { grokCompatKey: 'sk-grok', grokCompatBaseUrl: 'https://relay.example' },
    );

    const [url, init] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toBe('/api/video/generate');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      provider: 'grok_compat',
      model: 'grok-imagine-video',
      prompt: 'orbit video',
      negative_prompt: 'ugly, blurry',
      duration: 5,
      fps: 30,
      aspect_ratio: '16:9',
      seed: 4242,
      steps: 25,
      cfg: 7.5,
      width: 1280,
      height: 720,
      loras: [{ name: 'cyber-lora', strength: 0.8 }],
      custom_parameters: { custom_field: 'custom_val' },
    });
    expect(res.seed).toBe(4242);
  });

  it('视频分支保留数值 0 (fps, num_frames, steps, cfg, seed, duration, width, height) 不被 truthy 吞掉', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ videoUrl: 'https://relay.example/v1/videos/1/content', model: 'grok-imagine-video' }), { status: 200 }));

    await driver.generate(
      {
        prompt: 'test zeros',
        model: 'grok-imagine-video',
        isVideo: true,
        videoDuration: 0,
        videoFps: 0,
        videoFrames: 0,
        seed: 0,
        steps: 0,
        cfg: 0,
        width: 0,
        height: 0,
        denoise: 0,
      },
      { grokCompatKey: 'sk-grok' }
    );

    const [, init] = (globalThis.fetch as any).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.duration).toBe(0);
    expect(body.fps).toBe(0);
    expect(body.num_frames).toBe(0);
    expect(body.seed).toBe(0);
    expect(body.steps).toBe(0);
    expect(body.cfg).toBe(0);
    expect(body.width).toBe(0);
    expect(body.height).toBe(0);
    expect(body.denoise).toBe(0);
  });

  it('HTTP 503 grok_media_no_eligible_account 原样抛出，不换 provider', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        error: 'Grok 兼容中转失败 [503]: {"error":{"code":"grok_media_no_eligible_account"}}',
      }), { status: 503 }));

    await expect(
      driver.generate({ prompt: 'x', model: 'grok-imagine-image' }, { grokCompatKey: 'sk-grok' }),
    ).rejects.toThrow(/HTTP 503[\s\S]*grok_media_no_eligible_account/);
  });
});

describe('GrokCompatDriver batchSize', () => {
  it('forwards params.batchSize as n on images and omits n when unset or 0', async () => {
    const d = new GrokCompatDriver();
    globalThis.fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ imageUrl: 'data:image/png;base64,aaa', model: 'grok-imagine-image' }), { status: 200 }));
    await d.generate({ prompt: 'a lighthouse at dusk', model: 'grok-imagine-image', batchSize: 2 }, { grokCompatKey: 'sk', grokCompatBaseUrl: 'https://relay.example' });
    await d.generate({ prompt: 'a lighthouse at dusk', model: 'grok-imagine-image' }, { grokCompatKey: 'sk', grokCompatBaseUrl: 'https://relay.example' });
    await d.generate({ prompt: 'a lighthouse at dusk', model: 'grok-imagine-image', batchSize: 0 }, { grokCompatKey: 'sk', grokCompatBaseUrl: 'https://relay.example' });
    const bodies = (globalThis.fetch as any).mock.calls.map((c: any[]) => JSON.parse(c[1].body));
    expect(bodies[0].n).toBe(2);
    expect(bodies[1]).not.toHaveProperty('n');
    expect(bodies[2]).not.toHaveProperty('n');
  });
});
