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

  it('fal-ai/flux/schnell + LoRA 在发送前按 providerSchema 拦截，不发出请求', async () => {
    const fetchMock = vi.fn();
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
      '该端点不支持 LoRA（Fal.ai (GPU 云端加速) 端点 fal-ai/flux/schnell 的官方 schema 无 loras 字段）'
    );

    // 确保绝不发出网络请求
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('若到达服务端并返回 400，前端必须暴露 HTTP 状态码与 reason，不许吞错', async () => {
    // 模拟服务端返回 400
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: '该端点不支持 LoRA（Fal.ai 端点 fal-ai/flux/schnell 的官方 schema 无 loras 字段）',
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
      /HTTP 400: 该端点不支持 LoRA/
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
