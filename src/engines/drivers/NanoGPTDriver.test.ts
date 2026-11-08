import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NanoGPTDriver } from './NanoGPTDriver';
import { EngineRegistry } from '../EngineRegistry';

vi.mock('../../services/executionTrace', () => ({ tracedFetch: vi.fn() }));
import { tracedFetch } from '../../services/executionTrace';

describe('NanoGPTDriver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates model is required', async () => {
    const driver = new NanoGPTDriver();
    await expect(driver.generate({ prompt: 'test' } as any, {})).rejects.toThrow('模型为必填项');
    expect(tracedFetch).not.toHaveBeenCalled();
  });

  it('declares video capabilities, sends only official fields per video-generation docs, and routes to /api/video/generate', async () => {
    const driver = new NanoGPTDriver();
    expect(driver.capabilities).toContain('text2video');
    expect(driver.capabilities).toContain('img2video');

    vi.mocked(tracedFetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        videoUrl: 'https://example.com/video.mp4',
        provider: 'NanoGPT',
        model: 'wan-2.1-t2v',
        actualModel: 'wan-2.1-t2v',
        actualProvider: 'NanoGPT',
        seed: 42,
      }),
    } as any);

    const result = await driver.generate(
      {
        model: 'wan-2.1-t2v',
        prompt: 'a dog dancing',
        isVideo: true,
        videoDuration: 5,
        aspectRatio: '16:9',
        seed: 42,
        steps: 25,
        cfg: 7.0,
        sampler_name: 'Euler a',
        scheduler: 'normal',
        negative_prompt: 'bad quality',
      } as any,
      { nanogptKey: 'key-123' }
    );

    expect(tracedFetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(tracedFetch).mock.calls[0];
    expect(url).toBe('/api/video/generate');
    expect((init?.headers as any)['x-nanogpt-key']).toBe('key-123');

    const body = JSON.parse(init?.body as string);
    expect(body.provider).toBe('nanogpt');
    expect(body.model).toBe('wan-2.1-t2v');
    expect(body.prompt).toBe('a dog dancing');
    expect(body.duration).toBe(5);
    expect(body.aspect_ratio).toBe('16:9');
    expect(body.seed).toBe(42);

    // Official video-generation fields are supported
    expect(body.negative_prompt).toBe('bad quality');
    expect(body.num_inference_steps).toBe(25);
    expect(body.cfg_scale).toBe(7.0);

    // Un-spec'd fields (sampler/scheduler) are omitted
    expect(body).not.toHaveProperty('sampler_name');
    expect(body).not.toHaveProperty('scheduler');

    expect(result.mediaUrl).toBe('https://example.com/video.mp4');
    expect(result.mediaType).toBe('video');
    expect(result.provider).toBe('NanoGPT');
    expect(result.seed).toBe(42);
  });

  it('video branch preserves numeric 0 for seed, fps, num_frames, steps, cfg, and duration without duplicate steps/cfg', async () => {
    const driver = new NanoGPTDriver();
    vi.mocked(tracedFetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        videoUrl: 'https://example.com/video.mp4',
        model: 'wan-2.1-t2v',
        provider: 'NanoGPT',
      }),
    } as any);

    await driver.generate(
      {
        model: 'wan-2.1-t2v',
        prompt: 'test zero values',
        isVideo: true,
        seed: 0,
        videoDuration: 0,
        steps: 0,
        cfg: 0,
        videoFps: 0,
        videoFrames: 0,
      } as any,
      { nanogptKey: 'key-123' }
    );

    const [, init] = vi.mocked(tracedFetch).mock.calls.at(-1)!;
    const body = JSON.parse(init?.body as string);
    expect(body.seed).toBe(0);
    expect(body.duration).toBe(0);
    expect(body.num_inference_steps).toBe(0);
    expect(body.cfg_scale).toBe(0);
    expect(body.fps).toBe(0);
    expect(body.num_frames).toBe(0);
    expect(body).not.toHaveProperty('steps');
    expect(body).not.toHaveProperty('cfg');
  });

  it('video branch surfaces HTTP status, endpoint, and verbatim body on failure without invented messages', async () => {
    const driver = new NanoGPTDriver();

    vi.mocked(tracedFetch).mockResolvedValueOnce({
      ok: false,
      status: 402,
      text: async () => '{"error":"Insufficient balance, please top up"}',
    } as any);

    await expect(
      driver.generate(
        {
          model: 'wan-2.1-t2v',
          prompt: 'test prompt',
          isVideo: true,
        } as any,
        { nanogptKey: 'key-123' }
      )
    ).rejects.toThrow(/NanoGPT 视频路由 \/api\/video\/generate 返回 HTTP 402: \{"error":"Insufficient balance, please top up"\}/);
  });

  it('video branch throws with raw response when videoUrl is missing, without fallback to mediaUrl or default names', async () => {
    const driver = new NanoGPTDriver();

    vi.mocked(tracedFetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        mediaUrl: 'https://example.com/fallback.mp4', // Should not be accepted as videoUrl
        provider: 'FakeProvider',
      }),
    } as any);

    await expect(
      driver.generate(
        {
          model: 'wan-2.1-t2v',
          prompt: 'test prompt',
          isVideo: true,
        } as any,
        { nanogptKey: 'key-123' }
      )
    ).rejects.toThrow(/NanoGPT 视频路由返回缺少 videoUrl: \{"mediaUrl":"https:\/\/example\.com\/fallback\.mp4","provider":"FakeProvider"\}/);
  });

  it('routes image requests to /api/nanogpt/generate and returns exact response fields', async () => {
    const driver = new NanoGPTDriver();

    vi.mocked(tracedFetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        imageUrl: 'https://example.com/image.png',
        model: 'flux-schnell',
        provider: 'NanoGPT',
      }),
    } as any);

    const result = await driver.generate(
      {
        model: 'flux-schnell',
        prompt: 'cyberpunk street',
      } as any,
      { nanogptKey: 'key-123' }
    );

    expect(tracedFetch).toHaveBeenCalledTimes(1);
    const [url] = vi.mocked(tracedFetch).mock.calls[0];
    expect(url).toBe('/api/nanogpt/generate');
    expect(result.mediaUrl).toBe('https://example.com/image.png');
    expect(result.model).toBe('flux-schnell');
    expect(result.provider).toBe('NanoGPT');
  });

  it('image branch surfaces HTTP status, endpoint, and verbatim body on failure (including non-JSON or raw text)', async () => {
    const driver = new NanoGPTDriver();

    vi.mocked(tracedFetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => '{"error":{"message":"Invalid session","type":"invalid_request_error","code":"invalid_api_key"}}',
    } as any);

    await expect(
      driver.generate(
        {
          model: 'flux-schnell',
          prompt: 'test prompt',
        } as any,
        { nanogptKey: 'key-123' }
      )
    ).rejects.toThrow(/NanoGPT 图像路由 \/api\/nanogpt\/generate 返回 HTTP 401: \{"error":\{"message":"Invalid session","type":"invalid_request_error","code":"invalid_api_key"\}\}/);
  });

  it('image branch throws with raw JSON when a 200 response has only mediaUrl (no imageUrl)', async () => {
    const driver = new NanoGPTDriver();

    vi.mocked(tracedFetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        mediaUrl: 'https://example.com/wrong-key.png',
        model: 'flux-schnell',
        provider: 'NanoGPT',
      }),
    } as any);

    await expect(
      driver.generate(
        {
          model: 'flux-schnell',
          prompt: 'test prompt',
        } as any,
        { nanogptKey: 'key-123' }
      )
    ).rejects.toThrow(/NanoGPT 图像路由返回缺少 imageUrl: \{"mediaUrl":"https:\/\/example\.com\/wrong-key\.png","model":"flux-schnell","provider":"NanoGPT"\}/);
  });

  it('image branch throws with raw response when model is missing from response', async () => {
    const driver = new NanoGPTDriver();

    vi.mocked(tracedFetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        imageUrl: 'https://example.com/image.png',
        provider: 'NanoGPT',
      }),
    } as any);

    await expect(
      driver.generate(
        {
          model: 'flux-schnell',
          prompt: 'test prompt',
        } as any,
        { nanogptKey: 'key-123' }
      )
    ).rejects.toThrow(/NanoGPT 图像路由返回缺少 model: \{"imageUrl":"https:\/\/example\.com\/image\.png","provider":"NanoGPT"\}/);
  });

  it('image branch throws with raw response when provider is missing (does not fall back to this.name)', async () => {
    const driver = new NanoGPTDriver();

    vi.mocked(tracedFetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        imageUrl: 'https://example.com/image.png',
        model: 'flux-schnell',
      }),
    } as any);

    await expect(
      driver.generate(
        {
          model: 'flux-schnell',
          prompt: 'test prompt',
        } as any,
        { nanogptKey: 'key-123' }
      )
    ).rejects.toThrow(/NanoGPT 图像路由返回缺少 provider: \{"imageUrl":"https:\/\/example\.com\/image\.png","model":"flux-schnell"\}/);
  });

  it('routes through EngineRegistry when targetProvider is nanogpt and isVideo is true', async () => {
    vi.mocked(tracedFetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        videoUrl: 'https://example.com/video.mp4',
        provider: 'NanoGPT',
        model: 'wan-2.1-t2v',
      }),
    } as any);

    const result = await EngineRegistry.generate(
      'video',
      {
        model: 'wan-2.1-t2v',
        prompt: 'sunset ocean',
        targetProvider: 'nanogpt',
        isVideo: true,
      } as any,
      { nanogptKey: 'key-123' }
    );

    expect(tracedFetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(tracedFetch).mock.calls[0];
    expect(url).toBe('/api/video/generate');
    expect(result.mediaUrl).toBe('https://example.com/video.mp4');
  });
});

describe('NanoGPTDriver batchSize', () => {
  it('forwards params.batchSize as n on the image route and omits n when unset or 0', async () => {
    const res = { ok: true, json: async () => ({ imageUrl: 'https://example.com/i.png', model: 'm', provider: 'NanoGPT' }) };
    vi.mocked(tracedFetch).mockResolvedValue(res as any);
    const d = new NanoGPTDriver();
    await d.generate({ prompt: 'a lighthouse at dusk', model: 'm', batchSize: 3 } as any, {});
    await d.generate({ prompt: 'a lighthouse at dusk', model: 'm' } as any, {});
    await d.generate({ prompt: 'a lighthouse at dusk', model: 'm', batchSize: 0 } as any, {});
    const bodies = vi.mocked(tracedFetch).mock.calls.map((c: any[]) => JSON.parse(c[1].body));
    expect(bodies[0].n).toBe(3);
    expect(bodies[1].n).toBeUndefined();
    expect(bodies[2].n).toBeUndefined();
  });
});
