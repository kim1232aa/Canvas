import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelsLabDriver } from './ModelsLabDriver';
import { NormalizedGenerateParams } from '../types';

describe('ModelsLabDriver', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('posts generation to /api/engine/modelslab/generate with payload and headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      mediaUrl: 'https://example.test/modelslab.png',
      model: 'flux',
      seed: 42,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    globalThis.fetch = fetchMock;

    const params: NormalizedGenerateParams = {
      prompt: 'a violet fox',
      negative_prompt: 'blur',
      model: 'flux',
      width: 768,
      height: 1024,
      steps: 28,
      cfg: 3.5,
      seed: 7,
      scheduler: 'Euler',
      loras: [{ name: 'detail-lora', strength: 0.6 }],
      apiKey: 'fixture-modelslab-key',
      baseUrl: 'https://modelslab.example',
      workflowSnapshot: { nodes: [] },
    };

    const result = await new ModelsLabDriver().generate(params, { modelslabKey: 'pool-key-not-used' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/engine/modelslab/generate');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'x-canvas-origin': 'browser-ui', // Canvas UI origin tag (本机直调 labelling, reverify3)
      'x-modelslab-key': 'fixture-modelslab-key',
      'x-modelslab-base-url': 'https://modelslab.example',
    });
    expect(JSON.parse(init.body)).toEqual({
      model: 'flux',
      prompt: 'a violet fox',
      negative_prompt: 'blur',
      width: 768,
      height: 1024,
      steps: 28,
      cfg: 3.5,
      seed: 7,
      scheduler: 'Euler',
      loras: [{
        name: 'detail-lora',
        path: undefined,
        url: undefined,
        strength: 0.6,
        modelStrength: 0.6,
        clipStrength: 0.6,
        civitaiId: undefined,
        triggers: undefined,
      }],
      workflowSnapshot: { nodes: [] },
    });
    expect(result).toMatchObject({
      mediaUrl: 'https://example.test/modelslab.png',
      mediaType: 'image',
      provider: 'ModelsLab',
      providerId: 'modelslab',
      model: 'flux',
      requestedModel: 'flux',
      seed: 42,
    });
    expect(result.rawResponse.mediaUrl).toBe('https://example.test/modelslab.png');
  });

  it('uses the pool key and imageUrl when the call does not override them', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      imageUrl: 'https://example.test/from-image-url.png',
    }), { status: 200 }));

    const result = await new ModelsLabDriver().generate(
      { prompt: 'quiet harbor', model: 'sdxl' },
      { modelslabKey: 'pool-fixture-key' },
    );

    const [, init] = (globalThis.fetch as any).mock.calls[0];
    expect(init.headers['x-modelslab-key']).toBe('pool-fixture-key');
    expect(init.headers['x-modelslab-base-url']).toBeUndefined();
    expect(result.mediaUrl).toBe('https://example.test/from-image-url.png');
    expect(result.seed).toBeNull();
  });

  it('rejects a missing model before sending a request', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    await expect(new ModelsLabDriver().generate(
      { prompt: 'no model', model: '   ' },
      { modelslabKey: 'unused' },
    )).rejects.toThrow('模型为必填项（model is required）');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('parses an upstream failure and throws its error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'ModelsLab 上游拒绝了该模型',
      details: 'model flux is unavailable',
    }), { status: 502, headers: { 'Content-Type': 'application/json' } }));

    await expect(new ModelsLabDriver().generate(
      { prompt: 'broken upstream', model: 'flux' },
      { modelslabKey: 'fixture-key' },
    )).rejects.toThrow('model flux is unavailable');
  });

  it('keeps a non-JSON upstream failure readable', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(
      '<html>gateway down</html>',
      { status: 502, headers: { 'Content-Type': 'text/html' } },
    ));

    await expect(new ModelsLabDriver().generate(
      { prompt: 'html failure', model: 'sdxl' },
      {},
    )).rejects.toThrow('ModelsLab 上游请求失败: <html>gateway down</html>');
  });
});
