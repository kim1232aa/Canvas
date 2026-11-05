import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleVideoCancel, registerVideoGenerateRoutes } from './videoGenerateRoute.ts';
import { resetVideoJobStatusForTests, updateVideoJobStatus } from '../videoJobStatus.ts';

function mockRes() {
  const res: any = new EventEmitter();
  res.statusCode = 200;
  res.data = undefined;
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: any) => { res.data = body; return res; };
  return res;
}

afterEach(() => {
  resetVideoJobStatusForTests();
  vi.restoreAllMocks();
});

describe('handleVideoCancel', () => {
  it('sends the documented Civitai PUT with JSON Content-Type, the stored key, and the canceled body', async () => {
    updateVideoJobStatus({
      jobId: 'wf1', provider: 'civitai', phase: 'running', budgetMs: 600_000, credential: 'stored-civitai-key',
    });
    const seen: Array<{ url: string; options: any; meta: any }> = [];
    const getNextKey = vi.fn(() => 'pool-next-key');
    const handler = handleVideoCancel({
      upstreamFetch: vi.fn(async (meta: any, url: string, options: any) => {
        seen.push({ url, options, meta });
        return new Response('{"status":"canceled"}', { status: 200 });
      }),
      keyPoolManager: { getNextKey, recordResult: vi.fn() },
    } as any);
    const res = mockRes();
    await handler({ body: { provider: 'civitai', jobId: 'wf1' } } as any, res);
    expect(res.statusCode).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe('https://orchestration.civitai.com/v2/consumer/workflows/wf1');
    expect(seen[0].options.method).toBe('PUT');
    expect(seen[0].options.headers['Content-Type']).toBe('application/json');
    expect(seen[0].options.headers.Authorization).toBe('Bearer stored-civitai-key');
    expect(JSON.parse(seen[0].options.body)).toEqual({ status: 'canceled' });
    expect(getNextKey).not.toHaveBeenCalled();
  });

  it('uses the stored Fal cancel_url and ignores a client URL on another host', async () => {
    updateVideoJobStatus({
      jobId: 'req-1',
      provider: 'fal',
      phase: 'running',
      budgetMs: 600_000,
      credential: 'stored-fal-key',
      cancelUrl: 'https://queue.fal.run/fal-ai/wan/requests/req-1/cancel',
    });
    const seen: Array<{ url: string; options: any }> = [];
    const handler = handleVideoCancel({
      upstreamFetch: vi.fn(async (_meta: any, url: string, options: any) => {
        seen.push({ url, options });
        return new Response('{"status":"CANCELLATION_REQUESTED"}', { status: 202 });
      }),
    });
    const res = mockRes();
    await handler({
      body: { provider: 'fal', jobId: 'req-1', cancelUrl: 'https://attacker.example/steal' },
    } as any, res);
    expect(res.statusCode).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe('https://queue.fal.run/fal-ai/wan/requests/req-1/cancel');
    expect(seen[0].options.method).toBe('PUT');
    expect(seen[0].options.headers.Authorization).toBe('Key stored-fal-key');
    expect(seen[0].options.body).toBeUndefined();
  });

  it('returns 409 and sends no request when Fal has no stored cancel_url', async () => {
    updateVideoJobStatus({
      jobId: 'req-bare', provider: 'fal', phase: 'running', budgetMs: 600_000, credential: 'stored-fal-key',
    });
    const seen: unknown[] = [];
    const handler = handleVideoCancel({
      upstreamFetch: vi.fn(async (...args: unknown[]) => {
        seen.push(args);
        return new Response('nope', { status: 200 });
      }),
    });
    const res = mockRes();
    await handler({
      body: { provider: 'fal', jobId: 'req-bare', cancelUrl: 'https://attacker.example/steal' },
    } as any, res);
    expect(res.statusCode).toBe(409);
    expect(res.data.cancelled).toBe(false);
    expect(String(res.data.error)).toContain('cancel_url');
    expect(seen).toEqual([]);
  });

  it('returns 409 and sends no request when there is no job record', async () => {
    const seen: unknown[] = [];
    const handler = handleVideoCancel({
      upstreamFetch: vi.fn(async (...args: unknown[]) => {
        seen.push(args);
        return new Response('nope', { status: 200 });
      }),
    });
    const res = mockRes();
    await handler({ body: { provider: 'civitai', jobId: 'missing' } } as any, res);
    expect(res.statusCode).toBe(409);
    expect(res.data.cancelled).toBe(false);
    expect(seen).toEqual([]);
  });

  it('returns 409 and sends no request when the claimed provider does not match the stored job', async () => {
    updateVideoJobStatus({
      jobId: 'wf1', provider: 'civitai', phase: 'running', budgetMs: 600_000, credential: 'stored-civitai-key',
    });
    const seen: unknown[] = [];
    const handler = handleVideoCancel({
      upstreamFetch: vi.fn(async (...args: unknown[]) => {
        seen.push(args);
        return new Response('nope', { status: 200 });
      }),
    });
    const res = mockRes();
    await handler({ body: { provider: 'krea', jobId: 'wf1' } } as any, res);
    expect(res.statusCode).toBe(409);
    expect(res.data.cancelled).toBe(false);
    expect(String(res.data.error)).toContain('krea');
    expect(String(res.data.error)).toContain('civitai');
    expect(seen).toEqual([]);
  });

  it('cancels Replicate at the stored cancel URL, not api.replicate.com', async () => {
    updateVideoJobStatus({
      jobId: 'pred_custom',
      provider: 'replicate',
      phase: 'running',
      budgetMs: 600_000,
      credential: 'r8_stored',
      cancelUrl: 'https://replicate.example.test/v1/predictions/pred_custom/cancel',
    });
    const seen: Array<{ url: string; options: any }> = [];
    const handler = handleVideoCancel({
      upstreamFetch: vi.fn(async (_meta: any, url: string, options: any) => {
        seen.push({ url, options });
        return new Response('{"status":"canceled"}', { status: 200 });
      }),
    });
    const res = mockRes();
    await handler({ body: { provider: 'replicate', jobId: 'pred_custom' } } as any, res);
    expect(res.statusCode).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe('https://replicate.example.test/v1/predictions/pred_custom/cancel');
    expect(seen[0].options.method).toBe('POST');
    expect(seen[0].options.headers.Authorization).toBe('Bearer r8_stored');
  });
});

describe('GET /api/video/status', () => {
  it('looks up by jobId or nodeId and never returns the submit key', () => {
    updateVideoJobStatus({
      jobId: 'j-a', provider: 'krea', phase: 'running', upstreamStatus: 'one', budgetMs: 600_000,
      credential: 'secret-a', nodeId: 'node-a',
    });
    updateVideoJobStatus({
      jobId: 'j-b', provider: 'krea', phase: 'running', upstreamStatus: 'two', budgetMs: 600_000,
      credential: 'secret-b', nodeId: 'node-b',
    });
    const app: any = { posts: [], gets: [] };
    app.post = () => {};
    app.get = (_path: string, handler: Function) => { app.gets.push(handler); };
    registerVideoGenerateRoutes(app, {} as any);
    const handler = app.gets[0];
    const read = (query: Record<string, string>) => {
      const res = mockRes();
      handler({ query } as any, res);
      return res;
    };
    const byJob = read({ jobId: 'j-a' });
    expect(byJob.data.jobId).toBe('j-a');
    expect(byJob.data.text).toContain('one');
    expect(byJob.data.credential).toBeUndefined();
    const byNode = read({ nodeId: 'node-b' });
    expect(byNode.data.jobId).toBe('j-b');
    expect(byNode.data.credential).toBeUndefined();
    const missing = read({ provider: 'krea' });
    expect(missing.statusCode).toBe(400);
    expect(missing.data.jobId).toBeUndefined();
  });
});
