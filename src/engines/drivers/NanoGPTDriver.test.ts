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

  it('declares video capabilities, sends only official fields, and routes to /api/video/generate', async () => {
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

    // Un-spec fields must be omitted
    expect(body).not.toHaveProperty('steps');
    expect(body).not.toHaveProperty('cfg');
    expect(body).not.toHaveProperty('sampler_name');
    expect(body).not.toHaveProperty('scheduler');
    expect(body).not.toHaveProperty('negative_prompt');

    expect(result.mediaUrl).toBe('https://example.com/video.mp4');
    expect(result.mediaType).toBe('video');
    expect(result.provider).toBe('NanoGPT');
    expect(result.seed).toBe(42);
  });

  it('surfaces HTTP status, endpoint, and verbatim body on failure without invented messages', async () => {
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
    ).rejects.toThrow(/NanoGPT 视频路由 \/api\/video\/generate 返回 HTTP 402: Insufficient balance, please top up/);
  });

  it('throws with raw response when videoUrl is missing, without fallback to mediaUrl or default names', async () => {
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

  it('routes image requests to /api/nanogpt/generate', async () => {
    const driver = new NanoGPTDriver();

    vi.mocked(tracedFetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        imageUrl: 'https://example.com/image.png',
        model: 'flux-schnell',
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
