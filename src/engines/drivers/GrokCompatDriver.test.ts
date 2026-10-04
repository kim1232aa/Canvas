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

  it('图像请求不转发 seed/negative/steps/cfg/loras/width/height', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ imageUrl: 'https://cdn.example/a.png', model: 'grok-imagine-image' }), { status: 200 }));

    const params: NormalizedGenerateParams = {
      prompt: 'cat',
      model: 'grok-imagine-image',
      seed: 9,
      steps: 30,
      cfg: 4,
      width: 1024,
      height: 1024,
      negative_prompt: 'blur',
      loras: [{ name: 'x', strength: 1 }],
      aspectRatio: '16:9',
      extraParams: { resolution: '1k' },
    };

    await driver.generate(params, {
      grokCompatKey: 'sk-grok',
      grokCompatBaseUrl: 'https://relay.example',
    });

    const [url, init] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toBe('/api/engine/grok_compat/generate');
    expect(init.headers['x-grok-compat-key']).toBe('sk-grok');
    expect(init.headers['x-grok-compat-base-url']).toBe('https://relay.example');
    const body = JSON.parse(init.body);
    expect(body.aspect_ratio).toBe('16:9');
    expect(body.resolution).toBe('1k');
    expect(body.seed).toBeUndefined();
    expect(body.width).toBeUndefined();
    expect(body.height).toBeUndefined();
    expect(body.negative_prompt).toBeUndefined();
    expect(body.loras).toBeUndefined();
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

  it('HTTP 503 grok_media_no_eligible_account 原样抛出，不换 provider', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        error: 'Grok 兼容中转失败 [503]: {"error":{"code":"grok_media_no_eligible_account"}}',
      }), { status: 503 }));

    await expect(
      driver.generate({ prompt: 'x', model: 'grok-imagine-image' }, { grokCompatKey: 'sk-grok' }),
    ).rejects.toThrow(/HTTP 503[\s\S]*grok_media_no_eligible_account/);
  });
});
