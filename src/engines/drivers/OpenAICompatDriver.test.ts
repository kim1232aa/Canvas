import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { OpenAICompatDriver } from './OpenAICompatDriver';
import { NormalizedGenerateParams } from '../types';
import { EngineRegistry } from '../EngineRegistry';

describe('OpenAICompatDriver', () => {
  const driver = new OpenAICompatDriver();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('已注册且能力仅为 text2img + img2img', () => {
    expect(EngineRegistry.getDriver('openai_compat')?.id).toBe('openai_compat');
    expect(driver.capabilities).toEqual(['text2img', 'img2img']);
  });

  it('缺少模型 → 抛 模型为必填项', async () => {
    await expect(driver.generate({ prompt: 'x', model: '' } as NormalizedGenerateParams, {})).rejects.toThrow(
      /模型为必填项/,
    );
  });

  it('转发 key/baseUrl 头；有真实 LoRA 时写入 loras，仍不写 seed/negative/steps/cfg', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ imageUrl: 'data:image/png;base64,aaa', model: 'gpt-image-2' }),
    });

    const params: NormalizedGenerateParams = {
      prompt: 'tiny red square',
      model: 'gpt-image-2',
      seed: 123,
      steps: 20,
      cfg: 7,
      negative_prompt: 'blur',
      loras: [{ name: 'x', strength: 1 }],
      extraParams: { size: '1024x1024', quality: 'low' },
    };

    await driver.generate(params, {
      openaiCompatKey: 'sk-test',
      openaiCompatBaseUrl: 'https://relay.example/v1',
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toBe('/api/engine/openai_compat/generate');
    expect(init.headers['x-openai-compat-key']).toBe('sk-test');
    expect(init.headers['x-openai-compat-base-url']).toBe('https://relay.example/v1');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('gpt-image-2');
    expect(body.prompt).toBe('tiny red square');
    expect(body.size).toBe('1024x1024');
    expect(body.quality).toBe('low');
    expect(body.seed).toBeUndefined();
    expect(body.negative_prompt).toBeUndefined();
    expect(body.steps).toBeUndefined();
    expect(body.cfg).toBeUndefined();
    expect(body.loras).toHaveLength(1);
    expect(body.loras[0]).toEqual(expect.objectContaining({ name: 'x', strength: 1 }));
  });

  it('loras: [] 时请求体不含 loras 键', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ imageUrl: 'data:image/png;base64,aaa', model: 'gpt-image-2' }),
    });

    await driver.generate(
      { prompt: 'tiny red square', model: 'gpt-image-2', loras: [] },
      { openaiCompatKey: 'sk-test' },
    );

    const [, init] = (globalThis.fetch as any).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(Object.prototype.hasOwnProperty.call(body, 'loras')).toBe(false);
    expect(body.loras).toBeUndefined();
  });

  it('省略 loras 时请求体不含 loras 键', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ imageUrl: 'data:image/png;base64,aaa', model: 'gpt-image-2' }),
    });

    await driver.generate(
      { prompt: 'tiny red square', model: 'gpt-image-2' },
      { openaiCompatKey: 'sk-test' },
    );

    const [, init] = (globalThis.fetch as any).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(Object.prototype.hasOwnProperty.call(body, 'loras')).toBe(false);
    expect(body.loras).toBeUndefined();
  });

  it('上游 400 moderation_blocked 必须带状态码与响应体', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'OpenAI 兼容中转失败 [400]: {"error":{"code":"moderation_blocked"}}' }),
    });

    await expect(
      driver.generate({ prompt: 'x', model: 'gpt-image-2' }, { openaiCompatKey: 'sk-test' }),
    ).rejects.toThrow(/HTTP 400:.*moderation_blocked/);
  });
});
