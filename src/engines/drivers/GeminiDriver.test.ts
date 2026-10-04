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

  it('按调用者提供的画幅和图像尺寸发送，结果不捏造 seed', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        imageUrl: 'data:image/png;base64,aaa',
        model: 'gemini-3.1-flash-image',
        historyItem: { seed: 999 },
      }), { status: 200 }));

    const params: NormalizedGenerateParams = {
      prompt: 'a fox',
      model: 'gemini-3.1-flash-image',
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

 it('explicit unsupported seed is sent for a visible API rejection', async () => {
   const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'该服务商不支持: seed'}), { status: 400 }));
   vi.stubGlobal('fetch',fetchMock);
   await expect(new GeminiDriver().generate({model:'gemini-3.1-flash-image',prompt:'fox',seed:42},{})).rejects.toThrow(/seed/);
   expect(JSON.parse(fetchMock.mock.calls[0][1].body).seed).toBe(42);
   vi.unstubAllGlobals();
 });
