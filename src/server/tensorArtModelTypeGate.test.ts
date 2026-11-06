import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';
import { buildTensorModelJob } from '../schemas/tensorModelApi';

describe('server.ts TAMS modelType !== CHECKPOINT regression (Task 5)', () => {
  it('does not reject non-CHECKPOINT modelType (DEFAULT) and proceeds to /v1/jobs', async () => {
    const serverSource = readFileSync(new URL('../../server.ts', import.meta.url), 'utf8');
    const marker = "app.post(['/api/tensorart/generate'";
    const start = serverSource.indexOf(marker);
    const end = serverSource.indexOf('\napp.post(', start + marker.length);
    const snippet = serverSource.slice(start, end);

    const calls: Array<{ url: string; method: string; body?: any }> = [];
    const scope: Record<string, unknown> = {
      app: { post: (_paths: string[], handler: Function) => { (scope as any).handler = handler; } },
      resolveTamsBearerKey: () => 'mock-bearer-token',
      resolveTensorArtKey: () => 'mock-bearer-token',
      isOpenWorksAccessKey: () => false,
      TAMS_BEARER_REQUIRED_HINT: 'hint',
      buildTensorModelJob,
      crypto: { randomUUID: () => 'uuid-123' },
      resolveTamsModelApiOrigin: () => 'https://tams.tensor.art',
      upstreamFetch: async (_meta: unknown, url: string, options: any) => {
        const method = options?.method || 'GET';
        const body = options?.body ? JSON.parse(options.body) : undefined;
        calls.push({ url, method, body });
        if (url.includes('/v1/models/')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ model: { id: '613045163490732233', modelType: 'DEFAULT' } }),
          };
        }
        if (url.includes('/v1/jobs')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ job: { id: 'job-123', status: 'SUCCESS', successInfo: { images: [{ url: 'https://example.com/out.png' }] } } }),
          };
        }
        return { ok: false, status: 404, text: async () => 'not found' };
      },
      keyPoolManager: { recordResult: () => {} },
      generationContext: { getStore: () => ({ traces: [] }) },
      recordHistoryItem: async () => ({ id: 'h1' }),
      requireDurableHistoryMediaUrl: async () => ({ ok: true, dataUrl: 'data:...' }),
    };

    const code = (await transform(snippet, { loader: 'ts' })).code;
    const fn = new Function(...Object.keys(scope), code);
    fn(...Object.values(scope));

    let resStatus = 200;
    let resJson: any = null;
    const req = {
      setTimeout: () => {},
      headers: { 'x-tensorart-key': 'token' },
      body: { model: '613045163490732233', prompt: 'cat', width: 1024, height: 1024 },
      path: '/api/tensorart/generate',
    };
    const res = {
      setTimeout: () => {},
      status: (s: number) => { resStatus = s; return res; },
      json: (j: any) => { resJson = j; return res; },
    };

    let handlerError: any = null;
    try {
      await (scope as any).handler(req, res);
    } catch (e: any) {
      handlerError = e;
    }

    if (handlerError) {
      expect(handlerError.message).not.toContain('所选模型不是 CHECKPOINT');
    }

    // Must have queried metadata AND submitted to /v1/jobs with POST (not stopped by modelType)
    expect(calls.some((c) => c.url.includes('/v1/models/613045163490732233'))).toBe(true);
    expect(calls.some((c) => c.url.includes('/v1/jobs') && c.method === 'POST')).toBe(true);
    expect(resStatus).not.toBe(400);
  });
});
