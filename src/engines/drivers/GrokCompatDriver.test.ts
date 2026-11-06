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

  it('HTTP 503 grok_media_no_eligible_account 原样抛出，不换 provider', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        error: 'Grok 兼容中转失败 [503]: {"error":{"code":"grok_media_no_eligible_account"}}',
      }), { status: 503 }));

    await expect(
      driver.generate({ prompt: 'x', model: 'grok-imagine-image' }, { grokCompatKey: 'sk-grok' }),
    ).rejects.toThrow(/HTTP 503[\s\S]*grok_media_no_eligible_account/);
  });
});
