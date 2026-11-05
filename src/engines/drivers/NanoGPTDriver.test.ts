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

  it('declares video capabilities and routes video requests to /api/video/generate', async () => {
    const driver = new NanoGPTDriver();
    expect(driver.capabilities).toContain('text2video');
    expect(driver.capabilities).toContain('img2video');

    vi.mocked(tracedFetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        videoUrl: 'https://example.com/video.mp4',
        provider: 'NanoGPT',
        model: 'wan-2.1-t2v',
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

    expect(result.mediaUrl).toBe('https://example.com/video.mp4');
    expect(result.mediaType).toBe('video');
    expect(result.seed).toBe(42);
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
