import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { GeminiDriver } from './GeminiDriver';
import { NormalizedGenerateParams } from '../types';
import { EngineRegistry } from '../EngineRegistry';

describe('GeminiDriver', () => {
  const driver = new GeminiDriver();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('已注册', () => {
    expect(EngineRegistry.getDriver('gemini')?.id).toBe('gemini');
  });

  it('即使 params 带 Civitai 导入 seed 也不写入请求体，结果 seed 恒为 null', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        imageUrl: 'data:image/png;base64,aaa',
        model: 'gemini-3.1-flash-image',
        historyItem: { seed: 999 },
      }),
    });

    const params: NormalizedGenerateParams = {
      prompt: 'a fox',
      model: 'gemini-3.1-flash-image',
      seed: 1847392847561,
      aspectRatio: '16:9',
      imageSize: '1K',
    };

    const res = await driver.generate(params, { geminiKey: 'gk-test' });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toBe('/api/gemini/generate');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('gemini-3.1-flash-image');
    expect(body.prompt).toBe('a fox');
    expect(body.aspect_ratio).toBe('16:9');
    expect(body.image_size).toBe('1K');
    expect(body.seed).toBeUndefined();
    expect(res.seed).toBeNull();
  });
});
