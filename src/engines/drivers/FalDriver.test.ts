import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { FalDriver } from './FalDriver';
import { NormalizedGenerateParams } from '../types';

describe('FalDriver LoRA 校验与错误处理', () => {
  const driver = new FalDriver();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fal-ai/flux/schnell + LoRA POSTs /api/fal/generate and surfaces HTTP 400 from the server', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: '该服务商不支持（Fal.ai 端点 fal-ai/flux/schnell 的官方 schema 无 loras 字段）',
        unsupported: ['loras'],
        endpoint: 'fal-ai/flux/schnell',
      }),
    });
    globalThis.fetch = fetchMock;

    const params: NormalizedGenerateParams = {
      prompt: 'a futuristic astronaut',
      model: 'fal-ai/flux/schnell',
      loras: [
        {
          name: 'koda',
          path: 'https://civitai.com/api/download/models/12345',
          strength: 1.0,
          modelStrength: 1.0,
        },
      ],
    };

    await expect(driver.generate(params, { falKey: 'test-key' })).rejects.toThrow(
      /HTTP 400: 该服务商不支持/
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/fal/generate');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('fal-ai/flux/schnell');
    expect(body.loras).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'https://civitai.com/api/download/models/12345' })])
    );
  });

  it('若到达服务端并返回 400，前端必须暴露 HTTP 状态码与 reason，不许吞错', async () => {
    // 模拟服务端返回 400
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: '该服务商不支持（Fal.ai 端点 fal-ai/flux/schnell 的官方 schema 无 loras 字段）',
        unsupported: ['loras'],
        endpoint: 'fal-ai/flux/schnell',
      }),
    });

    // 直接调用 executeGenerate（绕过 BaseEngineDriver 前置拦截），模拟穿透至服务端后的场景
    const params: NormalizedGenerateParams = {
      prompt: 'a futuristic astronaut',
      model: 'fal-ai/flux-lora', // flux-lora 支持 LoRA，可通过前置拦截
      loras: [
        {
          name: 'koda',
          path: 'https://civitai.com/api/download/models/12345',
          strength: 1.0,
        },
      ],
    };

    await expect(driver.generate(params, { falKey: 'test-key' })).rejects.toThrow(
      /HTTP 400: 该服务商不支持/
    );
  });

  it('支持 LoRA 的端点（如 fal-ai/flux-lora）正常发起请求', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        imageUrl: 'https://fal.media/files/test.png',
        model: 'fal-ai/flux-lora',
        seed: 42,
      }),
    });

    const params: NormalizedGenerateParams = {
      prompt: 'a test image',
      model: 'fal-ai/flux-lora',
      loras: [
        {
          name: 'test-lora',
          path: 'https://example.com/lora.safetensors',
          strength: 0.8,
        },
      ],
    };

    const res = await driver.generate(params, { falKey: 'test-key' });
    expect(res.mediaUrl).toBe('https://fal.media/files/test.png');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
