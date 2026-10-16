import { describe, expect, it, vi } from 'vitest';
import { handleReplicateGenerate } from './routes/replicateRoutes';
import { buildReplicatePredictionRequest, ReplicateSchemaMissingError } from './replicateImageContract';

function mockRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (b: any) => { res.body = b; return res; };
  return res;
}
const resp = (status: number, body: string) => ({ ok: status < 400, status, text: async () => body, json: async () => JSON.parse(body) });
function deps(fetchImpl: any) {
  return {
    resolveProviderAuth: () => ({ apiKey: 'test-key', baseUrl: 'https://api.replicate.com/v1' }),
    upstreamFetch: vi.fn(fetchImpl),
    keyPoolManager: { recordResult: vi.fn() },
    respondWithGeneratedImages: vi.fn(),
  } as any;
}

describe('Replicate no-schema local block (iron rule 4)', () => {
  it('contract: no live schema and no table row -> throws, nothing built', () => {
    expect(() => buildReplicatePredictionRequest({ model: 'someone/unknown-model', prompt: 'x', cfg: 3 }))
      .toThrow(ReplicateSchemaMissingError);
    expect(() => buildReplicatePredictionRequest({ model: 'someone/unknown-model', prompt: 'x' }))
      .toThrow('本地拦截：拿不到该模型 Schema，未发送 /predictions（model=someone/unknown-model）');
  });

  it('route: schema fetch 404 -> blocked, body passed through verbatim, no prediction POST', async () => {
    const upstreamBody = '{"title":"Not found","detail":"Model not found","status":404}';
    const d = deps(async () => resp(404, upstreamBody));
    const res = mockRes();
    await handleReplicateGenerate(d)({ path: '/api/engine/replicate/generate', body: { model: 'someone/unknown-model', prompt: 'x', negative_prompt: 'n', cfg: 3 } } as any, res);
    expect(res.statusCode).toBe(404);
    const [first, second] = res.body.error.split('\n');
    expect(first.startsWith(`HTTP 404: ${upstreamBody}`)).toBe(true);
    expect(second).toBe('本地拦截：拿不到该模型 Schema，未发送 /predictions（model=someone/unknown-model）');
    expect(res.body.upstreamStatus).toBe(404);
    expect(res.body.errorSource).toBe('upstream');
    expect(res.body.blocked).toBe('schema_missing');
    expect(res.body.schemaFetch).toEqual({ url: 'https://api.replicate.com/v1/models/someone/unknown-model', status: 404, body: upstreamBody });
    expect(res.body.actualRequest).toBeNull();
    expect(res.body.notSent).toBe(true);
    const calls = d.upstreamFetch.mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][2].method).toBe('GET');
    expect(calls.some((c: any[]) => String(c[1]).endsWith('/predictions'))).toBe(false);
  });

  it('route: schema 200 without Input properties -> blocked, no prediction POST', async () => {
    const d = deps(async () => resp(200, '{"name":"m","latest_version":null}'));
    const res = mockRes();
    await handleReplicateGenerate(d)({ path: '/x', body: { model: 'a/b', prompt: 'x' } } as any, res);
    expect(res.statusCode).toBe(422);
    expect(res.body.blocked).toBe('schema_missing');
    expect(res.body.error.split('\n')[0].startsWith('HTTP 200: {"name":"m","latest_version":null}')).toBe(true);
    expect(d.upstreamFetch.mock.calls.some((c: any[]) => String(c[1]).endsWith('/predictions'))).toBe(false);
  });

  it('route: bare version hash with no schema source -> blocked with zero upstream calls', async () => {
    const d = deps(async () => resp(500, ''));
    const res = mockRes();
    await handleReplicateGenerate(d)({ path: '/x', body: { model: 'a'.repeat(64), prompt: 'x' } } as any, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error.split('\n')[0]).toContain('无上游请求');
    expect(res.body.error).toContain('本地拦截：拿不到该模型 Schema，未发送 /predictions');
    expect(d.upstreamFetch).not.toHaveBeenCalled();
  });

  it('route: schema GET network error -> 502, says no upstream response, no prediction POST', async () => {
    const d = deps(async () => { throw new Error('ECONNRESET'); });
    const res = mockRes();
    await handleReplicateGenerate(d)({ path: '/x', body: { model: 'a/b', prompt: 'x' } } as any, res);
    expect(res.statusCode).toBe(502);
    expect(res.body.error.split('\n')[0]).toBe('无上游响应：Schema 拉取网络错误 https://api.replicate.com/v1/models/a/b: ECONNRESET');
    expect(res.body.errorSource).toBe('network');
    expect(d.upstreamFetch).toHaveBeenCalledTimes(1);
  });

  it('history: middleware local-block item keeps upstream 404 status and verbatim error', async () => {
    const { buildFailedAttemptHistoryItem, buildLocalRejectionHistoryItem } = await import('./failedAttemptHistory');
    const err = 'HTTP 404: {"detail":"nf"} (u)\n本地拦截：拿不到该模型 Schema，未发送 /predictions（model=a/b）';
    const body = { error: err, actualRequest: null, notSent: true };
    const ctx = { traces: [{ method: 'GET', endpoint: 'u', status: 404 }], submissions: [] } as any;
    expect(buildFailedAttemptHistoryItem(ctx, { model: 'a/b' }, 404, body)).toBeNull();
    const item = buildLocalRejectionHistoryItem('/api/engine/replicate/generate', { model: 'a/b', prompt: 'x' }, 404, body);
    expect(item.httpStatus).toBe(404);
    expect(item.error.split('\n')[0]).toBe('HTTP 404: {"detail":"nf"} (u)');
    expect(item.actualRequest).toBeUndefined();
  });

  it('route: live schema found -> only declared fields go to prediction endpoint', async () => {
    const schema = JSON.stringify({ latest_version: { openapi_schema: { components: { schemas: { Input: { properties: { prompt: {}, seed: {} } } } } } } });
    const d = deps(async (_m: any, url: string) => url.endsWith('/predictions')
      ? resp(422, '{"detail":"stop here"}') : resp(200, schema));
    const res = mockRes();
    await handleReplicateGenerate(d)({ path: '/x', body: { model: 'a/b', prompt: 'x', seed: 1, cfg: 3 } } as any, res);
    const post = d.upstreamFetch.mock.calls.find((c: any[]) => String(c[1]).endsWith('/predictions'));
    expect(JSON.parse(post[2].body).input).toEqual({ prompt: 'x', seed: 1 });
    expect(res.body.parameterOmissions.map((o: any) => o.from)).toEqual(['cfg']);
  });

  it('history: local-block item mirrors route-provided errorSource/upstreamStatus; defaults to local otherwise', async () => {
    const { buildLocalRejectionHistoryItem } = await import('./failedAttemptHistory');
    const body = { error: 'HTTP 404: x (u)\n本地拦截', errorSource: 'upstream', upstreamStatus: 404 };
    const up = buildLocalRejectionHistoryItem('/api/engine/replicate/generate', { model: 'a/b' }, 404, body, { errorSource: 'upstream', upstreamStatus: 404 });
    expect(up.errorSource).toBe('upstream');
    expect(up.upstreamStatus).toBe(404);
    const net = buildLocalRejectionHistoryItem('/x', { model: 'a/b' }, 502, body, { errorSource: 'network' });
    expect(net.errorSource).toBe('network');
    expect(net.upstreamStatus).toBeUndefined();
    const legacy = buildLocalRejectionHistoryItem('/x', { model: 'a/b' }, 400, { error: 'e' });
    expect(legacy.errorSource).toBe('local');
    expect('upstreamStatus' in legacy).toBe(false);
  });
});
