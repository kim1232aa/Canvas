import { afterEach, describe, expect, it, vi } from 'vitest';
import { MageDriver } from './MageDriver';
import { ReplicateDriver } from './ReplicateDriver';
import { SenseNovaDriver } from './SenseNovaDriver';
import { tracedFetch } from '../../services/executionTrace';
import { plainErrorMessage } from '../../utils/apiFailure';
import { summarizeErrorMessage } from '../../components/NodeErrorDisclosure';

vi.mock('../../services/executionTrace', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/executionTrace')>();
  return {
    ...actual,
    tracedFetch: vi.fn((...args: Parameters<typeof actual.tracedFetch>) => actual.tracedFetch(...args)),
  };
});

describe('MageDriver', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.mocked(tracedFetch).mockReset();
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

  it('does not stringify object error field to [object Object] and attaches numeric status and verbatim responseBody', async () => {
    const rawBody = JSON.stringify({ error: { code: 'payment_required', message: 'x' } });
    vi.mocked(tracedFetch).mockResolvedValueOnce(
      new Response(rawBody, { status: 402, headers: { 'Content-Type': 'application/json' } })
    );

    const err = await new MageDriver()
      .generate({ prompt: 'a cinematic lighthouse at dusk', model: 'mango-v3' }, { mageKey: 'k' })
      .catch((e) => e);

    expect({
      message: err?.message,
      status: err?.status,
      responseBody: err?.responseBody,
    }).toEqual({
      message: 'HTTP 402: {"code":"payment_required","message":"x"}',
      status: 402,
      responseBody: rawBody,
    });
  });

  it('traces Mage 402 httpErrorFromResponse error through App.tsx:1534 and NodeItem.tsx:505 status banner path', async () => {
    const rawBody = JSON.stringify({ error: { code: 'payment_required', message: 'buy Gem' } });
    vi.mocked(tracedFetch).mockResolvedValueOnce(
      new Response(rawBody, { status: 402, headers: { 'Content-Type': 'application/json' } })
    );

    const err = await new MageDriver()
      .generate({ prompt: 'a cinematic lighthouse at dusk', model: 'mango-v3' }, { mageKey: 'k' })
      .catch((e) => e);

    expect(err?.status).toBe(402);
    expect(err?.responseBody).toBe(rawBody);

    // App.tsx:1467-1469 & 1532-1534 node state assignment on target node:
    const upstreamMsg = plainErrorMessage(err);
    const appErrorStatusCode = (err as any)?.upstreamStatus ?? (err as any)?.appStatus;
    const node = {
      id: 'mage-node-1',
      errorMessage: upstreamMsg,
      errorStatusCode: appErrorStatusCode,
    };

    // App.tsx:1534 only reads err.upstreamStatus ?? err.appStatus, so err.status (402) is lost on node.errorStatusCode:
    expect(node.errorStatusCode).toBeUndefined();

    // NodeItem.tsx:505: statusCode = (node as any).errorStatusCode || traceResp?.upstreamStatus || traceResp?.status || lastErr?.status || undefined
    const traceResp: any = {};
    const lastErr: any = undefined;
    const nodeItemStatusCode =
      (node as any).errorStatusCode || traceResp?.upstreamStatus || traceResp?.status || lastErr?.status || undefined;
    expect(nodeItemStatusCode).toBeUndefined();

    // NodeErrorDisclosure.tsx:32-33 summarizeErrorMessage still parses HTTP 402 from node.errorMessage ("HTTP 402: ..."):
    const summary = summarizeErrorMessage(node.errorMessage, 'Mage', nodeItemStatusCode);
    expect(summary.statusCode).toBe(402);
    expect(summary.headline).toBe('【Mage】HTTP 402: {"code":"payment_required","message":"buy Gem"}');
  });
});

describe('Restored commit 6234053 driver error regressions (Replicate, Mage, SenseNova)', () => {
  afterEach(() => {
    vi.mocked(tracedFetch).mockReset();
    vi.restoreAllMocks();
  });

  it('ReplicateDriver preserves error status and raw response data on failure', async () => {
    const rawBody = JSON.stringify({
      error: 'Replicate Insufficient credit',
      details: 'You have insufficient credit to run this model',
      upstreamStatus: 402,
    });
    vi.mocked(tracedFetch).mockResolvedValueOnce(
      new Response(rawBody, { status: 402, headers: { 'Content-Type': 'application/json' } })
    );

    await expect(
      new ReplicateDriver().generate(
        { model: 'black-forest-labs/flux-schnell', prompt: 'cinematic portrait in rain' },
        {}
      )
    ).rejects.toMatchObject({
      status: 402,
      responseBody: rawBody,
      data: expect.objectContaining({ upstreamStatus: 402 }),
    });
  });

  it('MageDriver preserves error status and raw response data on failure', async () => {
    const rawBody = JSON.stringify({
      error: { code: 'payment_required', message: 'The Mage API needs payment' },
      status: 402,
    });
    vi.mocked(tracedFetch).mockResolvedValueOnce(
      new Response(rawBody, { status: 402, headers: { 'Content-Type': 'application/json' } })
    );

    await expect(
      new MageDriver().generate({ model: 'mango-v3', prompt: 'cinematic portrait in rain' }, {})
    ).rejects.toMatchObject({
      message: 'HTTP 402: {"code":"payment_required","message":"The Mage API needs payment"}',
      status: 402,
      responseBody: rawBody,
      data: expect.objectContaining({ status: 402 }),
    });
  });

  it('SenseNovaDriver preserves error status and raw response data on failure', async () => {
    const rawBody = JSON.stringify({
      error: '未配置 sensenova API 密钥',
      errorSource: 'local',
    });
    vi.mocked(tracedFetch).mockResolvedValueOnce(
      new Response(rawBody, { status: 400, headers: { 'Content-Type': 'application/json' } })
    );

    await expect(
      new SenseNovaDriver().generate({ model: 'sensenova-u1.5-lite', prompt: 'cinematic portrait in rain' }, {})
    ).rejects.toMatchObject({
      status: 400,
      responseBody: rawBody,
      data: expect.objectContaining({ errorSource: 'local' }),
    });
  });
});
