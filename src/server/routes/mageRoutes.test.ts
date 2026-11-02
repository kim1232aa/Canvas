import { describe, expect, it, vi } from 'vitest';
import { handleMageGenerate, type MageRouteDeps } from './mageRoutes';

function createHarness(upstreamFetch: MageRouteDeps['upstreamFetch']) {
  const recorded: any[][] = [];
  const deps: MageRouteDeps = {
    resolveProviderAuth: vi.fn(() => ({ apiKey: 'mage-test-key', baseUrl: 'https://api.mage.space' })),
    upstreamFetch,
    keyPoolManager: { recordResult: vi.fn((...args: any[]) => recorded.push(args)) },
    respondWithGeneratedImages: vi.fn(async (res: any, images: unknown[], _metadata: any, _options: any) => res.json({ images })),
    sleep: vi.fn(async () => {}),
  };
  const res: any = {
    statusCode: 200,
    data: null,
    status(code: number) { this.statusCode = code; return this; },
    json(body: any) { this.data = body; return this; },
  };
  return { deps, recorded, res };
}

const req: any = { body: { model_id: 'mango-v3', prompt: 'test prompt' }, path: '/api/engine/mage/generate' };

describe('mageRoutes response parsing', () => {
  it('preserves malformed submit response text and the actual upstream status', async () => {
    const raw = '{"message":"provider detail"';
    const { deps, recorded, res } = createHarness(vi.fn(async () => ({ ok: true, status: 201, text: async () => raw })));

    await handleMageGenerate(deps)(req, res);

    expect(res.statusCode).toBe(502);
    expect(res.data.rawResponse).toBe(raw);
    expect(res.data.upstreamStatus).toBe(201);
    expect(res.data.error).toContain('JSON 解析失败');
    expect(recorded[0][5]).toBe(201);
  });

  it('preserves malformed poll response text and the actual upstream status', async () => {
    const raw = 'poll provider detail: invalid JSON';
    const { deps, recorded, res } = createHarness(vi.fn(async (_meta: any, url: string) => url.endsWith('/generate')
      ? { ok: true, status: 200, text: async () => JSON.stringify({ status: 'in_progress', request_id: 'req-poll' }) }
      : { ok: true, status: 206, text: async () => raw }));

    await handleMageGenerate(deps)(req, res);

    expect(res.statusCode).toBe(502);
    expect(res.data.rawResponse).toBe(raw);
    expect(res.data.upstreamStatus).toBe(206);
    expect(res.data.error).toContain('JSON 解析失败');
    expect(recorded[0][5]).toBe(206);
  });
});
