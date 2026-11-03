import { afterEach, describe, expect, it, vi } from 'vitest';
import { MageDriver } from './MageDriver';
import { NormalizedGenerateParams } from '../types';

describe('MageDriver', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
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
