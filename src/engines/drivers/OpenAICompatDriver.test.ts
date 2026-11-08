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

  it('loras: [] 时请求体不含 loras 键', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ imageUrl: 'data:image/png;base64,aaa', model: 'gpt-image-2' }), { status: 200 }));

    await driver.generate(
      { prompt: 'tiny red square', model: 'gpt-image-2', loras: [] },
      { openaiCompatKey: 'sk-test' },
    );

    const [, init] = (globalThis.fetch as any).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(Object.prototype.hasOwnProperty.call(body, 'loras')).toBe(false);
    expect(body.loras).toBeUndefined();
  });

  it('真实名为 "LoRA" 的条目 → 请求体保留 loras（不当作占位符剥离）', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ imageUrl: 'data:image/png;base64,aaa', model: 'gpt-image-2' }), { status: 200 }));

    await driver.generate(
      {
        prompt: 'tiny red square',
        model: 'gpt-image-2',
        loras: [{
          name: 'LoRA',
          path: 'https://civitai.com/api/download/models/854154',
          strength: 1,
          civitaiId: '854154',
        }],
      },
      { openaiCompatKey: 'sk-test' },
    );

    const [, init] = (globalThis.fetch as any).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.loras).toHaveLength(1);
    expect(body.loras[0].name).toBe('LoRA');
  });

  it('省略 loras 时请求体不含 loras 键', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ imageUrl: 'data:image/png;base64,aaa', model: 'gpt-image-2' }), { status: 200 }));

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
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'OpenAI 兼容中转失败 [400]: {"error":{"code":"moderation_blocked"}}' }), { status: 400 }));

    await expect(
      driver.generate({ prompt: 'x', model: 'gpt-image-2' }, { openaiCompatKey: 'sk-test' }),
    ).rejects.toThrow(/HTTP 400[\s\S]*moderation_blocked/);
  });
});

describe('OpenAICompatDriver batchSize', () => {
  it('forwards params.batchSize as n (over extraParams.n) and omits n when unset or 0', async () => {
    const d = new OpenAICompatDriver();
    globalThis.fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ imageUrl: 'data:image/png;base64,aaa', model: 'gpt-image-2' }), { status: 200 }));
    await d.generate({ prompt: 'tiny red square', model: 'gpt-image-2', batchSize: 3, extraParams: { n: 1 } }, { openaiCompatKey: 'sk' });
    await d.generate({ prompt: 'tiny red square', model: 'gpt-image-2' }, { openaiCompatKey: 'sk' });
    await d.generate({ prompt: 'tiny red square', model: 'gpt-image-2', batchSize: 0 }, { openaiCompatKey: 'sk' });
    const bodies = (globalThis.fetch as any).mock.calls.map((c: any[]) => JSON.parse(c[1].body));
    expect(bodies[0].n).toBe(3);
    expect(bodies[1]).not.toHaveProperty('n');
    expect(bodies[2]).not.toHaveProperty('n');
  });
});
