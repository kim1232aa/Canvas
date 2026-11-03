import { afterEach, describe, expect, it, vi } from 'vitest';
import { MageDriver } from './MageDriver';
import { NormalizedGenerateParams } from '../types';

describe('MageDriver', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('posts to /api/engine/mage/generate with official fields and headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          mediaUrl: 'https://example.test/mage.png',
          model: 'mango-v3',
          seed: 11,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    globalThis.fetch = fetchMock;

    const params: NormalizedGenerateParams = {
      prompt: 'Editorial portrait in soft daylight, 35mm film look',
      model: 'mango-v3',
      seed: 11,
      aspectRatio: '4:5',
      apiKey: 'fixture-mage-key',
      baseUrl: 'https://api.mage.space',
      extraParams: { resolution: '2K' },
      workflowSnapshot: { nodes: [] },
      // Board-local EmptyLatent / sampler shells — must NOT reach Mage route body
      width: 1024,
      height: 1280,
      steps: 20,
      cfg: 7,
      negative_prompt: 'blurry',
      sampler_name: 'euler',
      scheduler: 'normal',
      denoise: 1,
    };

    const result = await new MageDriver().generate(params, { mageKey: 'pool-unused' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/engine/mage/generate');
    expect(init.method).toBe('POST');
    expect(init.headers['x-mage-key']).toBe('fixture-mage-key');
    expect(init.headers['x-mage-base-url']).toBe('https://api.mage.space');
    const body = JSON.parse(init.body);
    expect(body.prompt).toBe('Editorial portrait in soft daylight, 35mm film look');
    expect(body.model_id).toBe('mango-v3');
    expect(body.aspect_ratio).toBe('4:5');
    expect(body.resolution).toBe('2K');
    expect(body.seed).toBe(11);
    expect(body.loras).toEqual([]);
    // User-filled width/height are forwarded as-is (Mango additionalProperties:true pass-through).
    expect(body.width).toBe(1024);
    expect(body.height).toBeDefined();
    for (const banned of [
      'steps',
      'cfg',
      'negative_prompt',
      'sampler_name',
      'scheduler',
      'denoise',
    ]) {
      expect(body).not.toHaveProperty(banned);
    }
    expect(result).toMatchObject({
      mediaUrl: 'https://example.test/mage.png',
      mediaType: 'image',
      provider: 'Mage',
      providerId: 'mage',
      model: 'mango-v3',
      seed: 11,
    });
  });

  it('refuses loras before sending', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    await expect(
      new MageDriver().generate(
        {
          prompt: 'x',
          model: 'mango-v3',
          loras: [{ name: 'fake', strength: 1 }],
        },
        { mageKey: 'k' }
      )
    ).rejects.toThrow(/无 LoRA/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces upstream billing errors verbatim', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'Mage 图像接口上游 HTTP 402: {"error":{"code":"payment_required","message":"buy Gem"}}',
        }),
        { status: 402, headers: { 'Content-Type': 'application/json' } }
      )
    );
    await expect(
      new MageDriver().generate({ prompt: 'x', model: 'mango-v3' }, { mageKey: 'k' })
    ).rejects.toThrow(/402|payment_required|buy Gem/);
  });

  it('uses pool key when apiKey omitted', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ imageUrl: 'https://example.test/from-pool.png' }), { status: 200 })
    );
    const result = await new MageDriver().generate(
      { prompt: 'quiet', model: 'mango-v3' },
      { mageKey: 'pool-fixture-key' }
    );
    const [, init] = (globalThis.fetch as any).mock.calls[0];
    expect(init.headers['x-mage-key']).toBe('pool-fixture-key');
    expect(result.mediaUrl).toBe('https://example.test/from-pool.png');
  });
});
