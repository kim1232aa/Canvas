import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { VideoDriver } from './VideoDriver';
import { NormalizedGenerateParams } from '../types';

describe('VideoDriver (F3/F4) 参数转发与错误处理', () => {
  const driver = new VideoDriver();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('F3: 完整转发 fps, negative_prompt, steps, cfg, loras 到 /api/video/generate', async () => {
    let interceptedBody: any = null;
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: any) => {
      interceptedBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          videoUrl: 'https://cdn.fal.media/output.mp4',
          provider: 'Fal.ai (fal-ai/wan-t2v)',
          model: 'fal-ai/wan-t2v',
          seed: 42,
          historyItem: { seed: 42 },
        }),
      };
    });
    globalThis.fetch = fetchMock;

    const params: NormalizedGenerateParams = {
      prompt: 'a cinematic soaring drone shot',
      negative_prompt: 'shaky camera, blurry, low resolution',
      model: 'fal-ai/wan-t2v',
      targetProvider: 'fal',
      isVideo: true,
      videoDuration: 5,
      videoFps: 24,
      aspectRatio: '16:9',
      steps: 30,
      cfg: 6.0,
      seed: 42,
      loras: [
        {
          name: 'wan-motion-lora',
          path: 'https://example.com/lora.safetensors',
          strength: 0.8,
        },
      ],
    };

    const res = await driver.generate(params, { falKey: 'test-key' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/video/generate');
    expect(init.headers['x-fal-key']).toBe('test-key');

    expect(interceptedBody.prompt).toBe('a cinematic soaring drone shot');
    expect(interceptedBody.negative_prompt).toBe('shaky camera, blurry, low resolution');
    expect(interceptedBody.model).toBe('fal-ai/wan-t2v');
    expect(interceptedBody.provider).toBe('fal');
    expect(interceptedBody.duration).toBe(5);
    expect(interceptedBody.fps).toBe(24);
    expect(interceptedBody.aspect_ratio).toBe('16:9');
    expect(interceptedBody.steps).toBe(30);
    expect(interceptedBody.cfg).toBe(6.0);
    expect(interceptedBody.seed).toBe(42);
    expect(interceptedBody.loras[0].name).toBe('wan-motion-lora');
    expect(interceptedBody.loras[0].path).toBe('https://example.com/lora.safetensors');
    expect(interceptedBody.loras[0].strength).toBe(0.8);

    expect(res.mediaUrl).toBe('https://cdn.fal.media/output.mp4');
    expect(res.seed).toBe(42);
  });

  it('F4: 空 provider 抛出明确异常，绝不静默回退 Fal', async () => {
    const params: NormalizedGenerateParams = {
      prompt: 'test prompt',
      model: 'fal-ai/wan-t2v',
      targetProvider: '',
      provider: '',
      isVideo: true,
    };

    await expect(driver.generate(params, {})).rejects.toThrow(/视频服务商 \(Provider\) 未设置，拒绝回退到 Fal/);
  });

  it('Grok 兼容中转不透传 seed', async () => {
    let interceptedBody: any = null;
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: any) => {
      interceptedBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          videoUrl: 'https://example.com/grok.mp4',
          provider: 'Grok 兼容中转',
          model: 'grok-imagine-video',
        }),
      };
    });
    globalThis.fetch = fetchMock;

    const params: NormalizedGenerateParams = {
      prompt: 'a futuristic robot walking',
      model: 'grok-imagine-video',
      targetProvider: 'grok_compat',
      isVideo: true,
      seed: 12345,
    };

    await driver.generate(params, { grokCompatKey: 'test-key' });
    expect(interceptedBody.seed).toBeUndefined();
  });

  it('零虚假成功: 上游报错原样透传状态码与错误信息', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: '该服务商不支持: loras（Fal.ai Video fal-ai/kling-video/v1/standard/text-to-video）',
      }),
    });
    globalThis.fetch = fetchMock;

    const params: NormalizedGenerateParams = {
      prompt: 'test',
      model: 'fal-ai/kling-video/v1/standard/text-to-video',
      targetProvider: 'fal',
      isVideo: true,
    };

    await expect(driver.generate(params, { falKey: 'test-key' })).rejects.toThrow(
      /该服务商不支持: loras/
    );
  });
});
