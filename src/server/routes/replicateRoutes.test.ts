import { describe, expect, it, vi } from 'vitest';
import {
  handleReplicateGenerate,
  handleReplicateModelInfo,
  registerReplicateRoutes,
  type ReplicateRouteDeps,
} from './replicateRoutes';

function createMockDeps(overrides: Partial<ReplicateRouteDeps> = {}): {
  deps: ReplicateRouteDeps;
  recordedResults: any[];
  persistedCalls: any[];
  fetchCalls: any[];
} {
  const recordedResults: any[] = [];
  const persistedCalls: any[] = [];
  const fetchCalls: any[] = [];

  const rawUpstreamFetch =
    overrides.upstreamFetch ||
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'pred_default',
        status: 'succeeded',
        output: ['https://replicate.delivery/out.png'],
      }),
      text: async () => '',
    }));

  const wrappedUpstreamFetch = vi.fn(async (meta: any, url: string, options: any) => {
    fetchCalls.push({ meta, url, options });
    return rawUpstreamFetch(meta, url, options);
  });

  const defaultDeps: ReplicateRouteDeps = {
    resolveProviderAuth: vi.fn(() => ({
      apiKey: 'r8_test_key_123',
      baseUrl: 'https://api.replicate.com/v1',
    })),
    upstreamFetch: wrappedUpstreamFetch,
    keyPoolManager: {
      recordResult: vi.fn((...args: any[]) => {
        recordedResults.push(args);
      }),
    },
    respondWithGeneratedImages: vi.fn(async (res: any, images: unknown[], metadata: any, options: any) => {
      persistedCalls.push({ images, metadata, options });
      return res.json({
        ...options.response,
        imageUrl: images[0],
        mediaUrl: images[0],
      });
    }),
    sleep: vi.fn(async () => {}),
  };

  const deps = { ...defaultDeps, ...overrides, upstreamFetch: wrappedUpstreamFetch };
  return { deps, recordedResults, persistedCalls, fetchCalls };
}

function createMockRes() {
  const res: any = {
    statusCode: 200,
    data: null,
    status: (code: number) => {
      res.statusCode = code;
      return res;
    },
    json: (body: any) => {
      res.data = body;
      return res;
    },
  };
  return res;
}

describe('replicateRoutes', () => {
  describe('handleReplicateGenerate', () => {
    it('returns 400 when provider auth fails', async () => {
      const { deps } = createMockDeps({
        resolveProviderAuth: vi.fn(() => ({
          apiKey: '',
          baseUrl: '',
          error: '未配置 replicate API 密钥',
        })),
      });

      const handler = handleReplicateGenerate(deps);
      const req: any = { body: { model: 'owner/name', prompt: 'test', inputSchemaProperties: { prompt: {} } }, path: '/api/engine/replicate/generate' };
      const res = createMockRes();

      await handler(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.data.error).toBe('未配置 replicate API 密钥');
      expect(res.data.errorSource).toBe('local');
    });

    it('returns 400 when request body fails contract validation', async () => {
      const { deps } = createMockDeps();
      const handler = handleReplicateGenerate(deps);
      const req: any = { body: { model: '' }, path: '/api/engine/replicate/generate' };
      const res = createMockRes();

      await handler(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.data.error).toContain('model is required');
      expect(res.data.errorSource).toBe('local');
    });

    it('generates image successfully on immediate succeeded response', async () => {
      const { deps, recordedResults, persistedCalls, fetchCalls } = createMockDeps();
      const handler = handleReplicateGenerate(deps);

      const req: any = {
        body: {
          model: 'black-forest-labs/flux-schnell',
          prompt: 'futuristic motorcycle',
          width: 1024,
          height: 768,
        },
        path: '/api/engine/replicate/generate',
      };
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(fetchCalls).toHaveLength(1);
      expect(fetchCalls[0].url).toBe('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions');
      expect(fetchCalls[0].options.headers.Authorization).toBe('Bearer r8_test_key_123');
      expect(fetchCalls[0].options.headers.Prefer).toBe('wait');

      expect(persistedCalls).toHaveLength(1);
      expect(persistedCalls[0].images).toEqual(['https://replicate.delivery/out.png']);
      expect(persistedCalls[0].metadata.provider).toBe('Replicate');
      expect(persistedCalls[0].metadata.model).toBe('black-forest-labs/flux-schnell');

      expect(recordedResults).toHaveLength(1);
      expect(recordedResults[0][0]).toBe('replicate');
      expect(recordedResults[0][2]).toBe(true); // success
    });

    it('polls until succeeded when initial response is processing', async () => {
      let pollCount = 0;
      const { deps, fetchCalls, persistedCalls, recordedResults } = createMockDeps({
        upstreamFetch: vi.fn(async (_meta: any, url: string) => {
          if (url.includes('/models/')) {
            return {
              ok: true,
              status: 201,
              json: async () => ({
                id: 'pred_async_123',
                status: 'processing',
                urls: { get: 'https://api.replicate.com/v1/predictions/pred_async_123' },
              }),
            };
          }
          pollCount++;
          if (pollCount === 1) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                id: 'pred_async_123',
                status: 'processing',
              }),
            };
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: 'pred_async_123',
              status: 'succeeded',
              output: ['https://replicate.delivery/async-out.png'],
            }),
          };
        }),
      });

      const handler = handleReplicateGenerate(deps);
      const req: any = {
        body: { model: 'owner/name', prompt: 'test', inputSchemaProperties: { prompt: {} } },
        path: '/api/engine/replicate/generate',
      };
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(fetchCalls).toHaveLength(3); // 1 initial + 2 polls
      expect(persistedCalls[0].images).toEqual(['https://replicate.delivery/async-out.png']);
      expect(recordedResults[0][2]).toBe(true);
    });

    it('preserves full upstream error transparency on 402 Insufficient Credit without fallback', async () => {
      const { deps, recordedResults } = createMockDeps({
        upstreamFetch: vi.fn(async () => ({
          ok: false,
          status: 402,
          text: async () => 'You have insufficient credit. Please add a payment method.',
        })),
      });

      const handler = handleReplicateGenerate(deps);
      const req: any = {
        body: { model: 'owner/name', prompt: 'test', inputSchemaProperties: { prompt: {} } },
        path: '/api/engine/replicate/generate',
      };
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(402);
      expect(res.data.error).toContain('HTTP 402');
      expect(res.data.rawResponse).toBe('You have insufficient credit. Please add a payment method.');
      expect(res.data.errorSource).toBe('upstream');

      expect(recordedResults).toHaveLength(1);
      expect(recordedResults[0][2]).toBe(false); // failed
      expect(recordedResults[0][5]).toBe(402); // status code
    });

    it('handles polling failure when task fails during processing', async () => {
      const { deps, recordedResults } = createMockDeps({
        upstreamFetch: vi.fn(async (_meta: any, url: string) => {
          if (url.includes('/models/')) {
            return {
              ok: true,
              status: 201,
              json: async () => ({
                id: 'pred_async_err',
                status: 'starting',
                urls: { get: 'https://api.replicate.com/v1/predictions/pred_async_err' },
              }),
            };
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: 'pred_async_err',
              status: 'failed',
              error: 'OOM killed during inference',
            }),
          };
        }),
      });

      const handler = handleReplicateGenerate(deps);
      const req: any = {
        body: { model: 'owner/name', prompt: 'test', inputSchemaProperties: { prompt: {} } },
        path: '/api/engine/replicate/generate',
      };
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(502);
      expect(res.data.error).toContain('OOM killed during inference');
      expect(res.data.errorSource).toBe('upstream');
      expect(recordedResults[0][2]).toBe(false);
    });

    it('exposes polling 5xx error immediately without silent loop swallowing', async () => {
      const { deps, recordedResults } = createMockDeps({
        upstreamFetch: vi.fn(async (_meta: any, url: string) => {
          if (url.includes('/models/')) {
            return {
              ok: true,
              status: 201,
              json: async () => ({
                id: 'pred_async_503',
                status: 'starting',
                urls: { get: 'https://api.replicate.com/v1/predictions/pred_async_503' },
              }),
            };
          }
          return {
            ok: false,
            status: 503,
            text: async () => 'Service Unavailable: upstream worker crashed',
          };
        }),
      });

      const handler = handleReplicateGenerate(deps);
      const req: any = {
        body: { model: 'owner/name', prompt: 'test', inputSchemaProperties: { prompt: {} } },
        path: '/api/engine/replicate/generate',
      };
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(503);
      expect(res.data.error).toContain('HTTP 503');
      expect(res.data.rawResponse).toContain('upstream worker crashed');
      expect(res.data.errorSource).toBe('upstream');
      expect(recordedResults[0][2]).toBe(false);
    });

    it('handles network error cleanly', async () => {
      const { deps, recordedResults } = createMockDeps({
        upstreamFetch: vi.fn(async () => {
          throw new Error('fetch failed: ECONNREFUSED');
        }),
      });

      const handler = handleReplicateGenerate(deps);
      const req: any = {
        body: { model: 'owner/name', prompt: 'test', inputSchemaProperties: { prompt: {} } },
        path: '/api/engine/replicate/generate',
      };
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(502);
      expect(res.data.error).toContain('网络/协议错误');
      expect(res.data.errorSource).toBe('network');
      expect(recordedResults[0][2]).toBe(false);
    });
  });

  describe('handleReplicateModelInfo', () => {
    it('queries model info by model=owner/name query param', async () => {
      const { deps, fetchCalls } = createMockDeps({
        upstreamFetch: vi.fn(async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            owner: 'black-forest-labs',
            name: 'flux-schnell',
            description: 'Fast 12B flux model',
          }),
        })),
      });

      const handler = handleReplicateModelInfo(deps);
      const req: any = {
        query: { model: 'black-forest-labs/flux-schnell' },
        path: '/api/replicate/model-info',
      };
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.data.owner).toBe('black-forest-labs');
      expect(res.data.name).toBe('flux-schnell');
      expect(fetchCalls[0].url).toBe('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell');
      expect(fetchCalls[0].options.headers.Authorization).toBe('Bearer r8_test_key_123');
    });

    it('returns 400 when model and owner are missing', async () => {
      const { deps } = createMockDeps();
      const handler = handleReplicateModelInfo(deps);
      const req: any = { query: {}, path: '/api/replicate/model-info' };
      const res = createMockRes();

      await handler(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.data.error).toContain('必填参数');
    });

    it('returns upstream status when model does not exist (404)', async () => {
      const { deps } = createMockDeps({
        upstreamFetch: vi.fn(async () => ({
          ok: false,
          status: 404,
          text: async () => 'Model not found',
        })),
      });

      const handler = handleReplicateModelInfo(deps);
      const req: any = {
        query: { owner: 'owner', name: 'not-exist' },
        path: '/api/replicate/model-info',
      };
      const res = createMockRes();

      await handler(req, res);
      expect(res.statusCode).toBe(404);
      expect(res.data.error).toContain('404');
    });
  });

  describe('registerReplicateRoutes', () => {
    it('registers both engine and alias generate routes and model-info', () => {
      const routes = new Map<string, Function>();
      const app = {
        post: vi.fn((paths: string | string[], cb: Function) => {
          const list = Array.isArray(paths) ? paths : [paths];
          list.forEach((p) => routes.set(`POST ${p}`, cb));
        }),
        get: vi.fn((path: string, cb: Function) => {
          routes.set(`GET ${path}`, cb);
        }),
      };

      const { deps } = createMockDeps();
      registerReplicateRoutes(app, deps);

      expect(routes.has('POST /api/engine/replicate/generate')).toBe(true);
      expect(routes.has('POST /api/replicate/generate')).toBe(true);
      expect(routes.has('GET /api/replicate/model-info')).toBe(true);
    });
  });
});
