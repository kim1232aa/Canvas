import { describe, expect, it, vi } from 'vitest';
import {
  MODELSCOPE_PROBE_URLS,
  TAMS_PROBE_MODEL_ID,
  probeModelScopeKey,
  probeOpenAICompatModelsKey,
  probeTamsKey,
  type KeyProbeDeps,
} from './keyTestProbes';

const BODY_401 = '{"error":"invalid api key","code":"AUTH_401"}';
const BODY_404 = '{"error":"no such endpoint","path":"/models"}';

function response(status: number, body: string): Response {
  return new Response(body, { status, headers: { 'content-type': 'application/json' } });
}

function deps(handler: KeyProbeDeps['upstreamFetch'], extra: Partial<KeyProbeDeps> = {}): {
  deps: KeyProbeDeps;
  calls: Array<{ meta: any; url: string; init?: RequestInit }>;
} {
  const calls: Array<{ meta: any; url: string; init?: RequestInit }> = [];
  return {
    calls,
    deps: {
      upstreamFetch: vi.fn(async (meta, url, init) => {
        calls.push({ meta, url, init });
        return handler(meta, url, init);
      }),
      resolveBaseUrl: (provider) => ({
        baseUrl: provider === 'agnes' ? 'https://apihub.agnes-ai.com/v1/' : 'https://token.sensenova.cn/v1',
      }),
      resolveTamsOrigin: () => 'https://ap-east-1.tensorart.cloud',
      now: () => 1_000,
      ...extra,
    },
  };
}

describe('ModelScope key probe', () => {
  it.each([
    ['modelscope', MODELSCOPE_PROBE_URLS.modelscope, 'modelscope'],
    ['modelscope_cn', MODELSCOPE_PROBE_URLS.modelscope_cn, 'modelscope'],
    ['modelscope_ai', MODELSCOPE_PROBE_URLS.modelscope_ai, 'modelscope_ai'],
  ] as const)('GET %s 200 hits %s and never reports unsupported', async (provider, url, sentProvider) => {
    const { deps: d, calls } = deps(async () => response(200, '{"data":[]}'));
    const result = await probeModelScopeKey(d, provider, 'ms-token-12345678', '/api/test-provider');

    expect(calls).toEqual([
      {
        meta: { provider: sentProvider, route: '/api/test-provider', model: 'models', key: 'ms-token-12345678' },
        url,
        init: { headers: { Authorization: 'Bearer ms-token-12345678' } },
      },
    ]);
    expect(result.status).toBe('ok');
    expect(result.message).toContain(`HTTP 200 · ${url}`);
    expect(result.message).not.toMatch(/unsupported|未能核实/);
  });

  it.each([401, 404])('propagates HTTP %s and the verbatim body', async (status) => {
    const body = status === 401 ? BODY_401 : BODY_404;
    const { deps: d } = deps(async () => response(status, body));
    const result = await probeModelScopeKey(d, 'modelscope_ai', 'ms-token-12345678', '/api/cloud-keys/test-single');

    expect(result.status).toBe('error');
    expect(result.message).toBe(`HTTP ${status} · ${MODELSCOPE_PROBE_URLS.modelscope_ai} · 原始响应：${body}`);
    expect(result.message).not.toMatch(/unsupported|未能核实|SD1\.5/);
  });

  it('does not send a request when no token is configured', async () => {
    const { deps: d, calls } = deps(async () => response(200, '{}'));
    const result = await probeModelScopeKey(d, 'modelscope', '', '/api/test-provider');
    expect(calls).toHaveLength(0);
    expect(result).toMatchObject({ status: 'error', latency: 0 });
    expect(result.message).toContain('未发送请求');
  });
});

describe('Agnes / SenseNova key probe', () => {
  it.each([
    ['agnes', 'https://apihub.agnes-ai.com/v1/models'],
    ['sensenova', 'https://token.sensenova.cn/v1/models'],
  ] as const)('GET %s 200 uses the configured ${baseUrl}/models', async (provider, url) => {
    const { deps: d, calls } = deps(async () => response(200, '{"data":[{"id":"m"}]}'));
    const result = await probeOpenAICompatModelsKey(d, provider, 'sk-live-12345678', '/api/test-provider');

    expect(calls[0]).toMatchObject({
      meta: { provider, route: '/api/test-provider', model: 'models', key: 'sk-live-12345678' },
      url,
      init: { headers: { Authorization: 'Bearer sk-live-12345678' } },
    });
    expect(result.status).toBe('ok');
    expect(result.message).toContain(`HTTP 200 · ${url}`);
    expect(result.status).not.toBe('unsupported');
  });

  it.each([
    ['agnes', 401, BODY_401],
    ['agnes', 404, BODY_404],
    ['sensenova', 401, BODY_401],
    ['sensenova', 404, BODY_404],
  ] as const)('%s HTTP %s keeps the status and the verbatim body', async (provider, status, body) => {
    const { deps: d } = deps(async () => response(status, body));
    const result = await probeOpenAICompatModelsKey(d, provider, 'sk-live-12345678', '/api/test-provider');
    const url = provider === 'agnes' ? 'https://apihub.agnes-ai.com/v1/models' : 'https://token.sensenova.cn/v1/models';

    expect(result.status).toBe('error');
    expect(result.message).toBe(`HTTP ${status} · ${url} · 原始响应：${body}`);
    expect(result.message).not.toMatch(/unsupported|官方文档仅列出/);
  });

  it('reports a missing base URL locally and sends nothing', async () => {
    const { deps: d, calls } = deps(async () => response(200, '{}'), {
      resolveBaseUrl: () => ({ baseUrl: '', error: '未配置 agnes Base URL（AGNES_BASE_URL / 设置面板）。' }),
    });
    const result = await probeOpenAICompatModelsKey(d, 'agnes', 'sk-live-12345678', '/api/test-provider');
    expect(calls).toHaveLength(0);
    expect(result.message).toContain('未配置 agnes Base URL');
    expect(result.message).toContain('未发送请求');
  });
});

describe('TAMS key probe', () => {
  const url = `https://ap-east-1.tensorart.cloud/v1/models/${TAMS_PROBE_MODEL_ID}`;

  it('prints the model name the upstream actually returned', async () => {
    const body = JSON.stringify({ model: { id: TAMS_PROBE_MODEL_ID, name: 'Realistic Vision', modelType: 'CHECKPOINT' } });
    const { deps: d, calls } = deps(async () => response(200, body));
    const result = await probeTamsKey(d, 'tams-bearer-12345678', '/api/test-provider');

    expect(calls[0]).toMatchObject({
      meta: { provider: 'tensorart', route: '/api/test-provider', model: TAMS_PROBE_MODEL_ID, key: 'tams-bearer-12345678' },
      url,
      init: { headers: { Authorization: 'Bearer tams-bearer-12345678' } },
    });
    expect(result.status).toBe('ok');
    expect(result.message).toContain('上游返回模型名：Realistic Vision');
    expect(result.message).toContain(`原始响应：${body}`);
    expect(result.message).not.toContain('SD1.5');
  });

  it('says the model name was not returned instead of inventing SD1.5', async () => {
    const body = JSON.stringify({ model: { id: TAMS_PROBE_MODEL_ID, modelType: 'CHECKPOINT' } });
    const { deps: d } = deps(async () => response(200, body));
    const result = await probeTamsKey(d, 'tams-bearer-12345678', '/api/test-provider');

    expect(result.status).toBe('ok');
    expect(result.message).toContain('HTTP 200');
    expect(result.message).toContain('上游未返回 model.name');
    expect(result.message).toContain(`原始响应：${body}`);
    expect(result.message).not.toMatch(/SD1\.5|SD 1\.5/);
  });

  it.each([401, 404])('HTTP %s returns the real status and the verbatim body', async (status) => {
    const body = status === 401 ? BODY_401 : BODY_404;
    const { deps: d } = deps(async () => response(status, body));
    const result = await probeTamsKey(d, 'tams-bearer-12345678', '/api/test-provider');

    expect(result.status).toBe('error');
    expect(result.message).toBe(`HTTP ${status} · ${url} · 原始响应：${body}`);
    expect(result.message).not.toMatch(/SD1\.5|鉴权成功/);
  });
});
