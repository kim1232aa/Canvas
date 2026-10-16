import { describe, expect, it, vi } from 'vitest';
import {
  handleSenseNovaChat,
  handleSenseNovaGenerate,
  registerSenseNovaRoutes,
  type SenseNovaRouteDeps,
} from './sensenovaRoutes';
import { buildSenseNovaImageRequest } from '../senseNovaImageContract';

function createMockDeps(overrides: Partial<SenseNovaRouteDeps> = {}): {
  deps: SenseNovaRouteDeps;
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
        data: [{ b64_json: 'abc123' }],
      }),
      text: async () => '',
    }));

  const wrappedUpstreamFetch = vi.fn(async (meta: any, url: string, options: any) => {
    fetchCalls.push({ meta, url, options });
    return rawUpstreamFetch(meta, url, options);
  });

  const defaultDeps: SenseNovaRouteDeps = {
    resolveProviderAuth: vi.fn(() => ({
      apiKey: 'sn_test_key',
      baseUrl: 'https://token.sensenova.cn/v1',
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
      });
    }),
    sanitizeGenerationMetadata: (v: any) => v,
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

describe('sensenovaRoutes', () => {
  describe('handleSenseNovaChat', () => {
    it('returns 400 when provider auth fails', async () => {
      const { deps } = createMockDeps({
        resolveProviderAuth: vi.fn(() => ({
          apiKey: '',
          baseUrl: '',
          error: '未配置 sensenova API 密钥',
        })),
      });
      const handler = handleSenseNovaChat(deps);
      const req: any = { body: { model: 'DeepSeek-V3', messages: [] }, path: '/api/sensenova/chat' };
      const res = createMockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.data.error).toBe('未配置 sensenova API 密钥');
    });

    it('returns 400 when model is missing', async () => {
      const { deps } = createMockDeps();
      const handler = handleSenseNovaChat(deps);
      const req: any = { body: { messages: [] }, path: '/api/sensenova/chat' };
      const res = createMockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.data.error).toContain('model is required');
    });

    it('returns chat content and reasoning from upstream', async () => {
      const { deps, fetchCalls, recordedResults } = createMockDeps({
        upstreamFetch: vi.fn(async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            model: 'DeepSeek-V3',
            choices: [{ message: { content: 'hello', reasoning: 'think' } }],
            usage: { total_tokens: 9 },
          }),
          text: async () => '',
        })),
      });
      const handler = handleSenseNovaChat(deps);
      const req: any = {
        body: { model: 'DeepSeek-V3', messages: [{ role: 'user', content: 'hi' }], temperature: 0.2 },
        path: '/api/engine/sensenova/chat',
      };
      const res = createMockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.data.content).toBe('hello');
      expect(res.data.reasoningContent).toBe('think');
      expect(fetchCalls[0].url).toBe('https://token.sensenova.cn/v1/chat/completions');
      expect(recordedResults[0][2]).toBe(true);
    });
  });

  describe('handleSenseNovaGenerate', () => {
    it('returns 400 when provider auth fails', async () => {
      const { deps } = createMockDeps({
        resolveProviderAuth: vi.fn(() => ({
          apiKey: '',
          baseUrl: '',
          error: '未配置 sensenova API 密钥',
        })),
      });
      const handler = handleSenseNovaGenerate(deps);
      const req: any = {
        body: { model: 'sensenova-u1.5-lite', prompt: 'lantern' },
        path: '/api/engine/sensenova/generate',
      };
      const res = createMockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.data.error).toBe('未配置 sensenova API 密钥');
      expect(res.data.errorSource).toBe('local');
    });

    it('returns 400 when body fails contract validation', async () => {
      const { deps } = createMockDeps();
      const handler = handleSenseNovaGenerate(deps);
      const req: any = { body: { model: '' }, path: '/api/sensenova/generate' };
      const res = createMockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.data.errorSource).toBe('local');
      expect(String(res.data.error)).toMatch(/SenseNova/);
    });

    it('uses buildSenseNovaImageRequest and persists images on success', async () => {
      const { deps, persistedCalls, fetchCalls, recordedResults } = createMockDeps();
      const handler = handleSenseNovaGenerate(deps);
      const body = { model: 'sensenova-u1.5-lite', prompt: 'paper lantern workshop', width: 1024, height: 768 };
      const expected = buildSenseNovaImageRequest(body);
      const req: any = { body, path: '/api/engine/sensenova/generate' };
      const res = createMockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(fetchCalls[0].url).toBe(`https://token.sensenova.cn/v1${expected.endpoint}`);
      const sent = JSON.parse(fetchCalls[0].options.body);
      expect(sent).toMatchObject(expected.payload);
      expect(persistedCalls).toHaveLength(1);
      expect(persistedCalls[0].metadata.provider).toBe('SenseNova U1.5 Lite');
      expect(persistedCalls[0].metadata.model).toBe(expected.actualModel);
      expect(recordedResults[0][0]).toBe('sensenova');
      expect(recordedResults[0][2]).toBe(true);
    });

    it('preserves upstream HTTP status without fallback', async () => {
      const { deps, recordedResults } = createMockDeps({
        upstreamFetch: vi.fn(async () => ({
          ok: false,
          status: 402,
          text: async () => 'Insufficient credit',
          json: async () => ({}),
        })),
      });
      const handler = handleSenseNovaGenerate(deps);
      const req: any = {
        body: { model: 'sensenova-u1.5-lite', prompt: 'x' },
        path: '/api/sensenova/generate',
      };
      const res = createMockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(402);
      expect(res.data.errorSource).toBe('upstream');
      expect(res.data.error).toContain('402');
      expect(recordedResults[0][2]).toBe(false);
    });
  });

  describe('registerSenseNovaRoutes', () => {
    it('registers chat and generate engine + alias paths', () => {
      const routes = new Map<string, Function>();
      const app = {
        post: vi.fn((paths: string | string[], cb: Function) => {
          const list = Array.isArray(paths) ? paths : [paths];
          list.forEach((p) => routes.set(`POST ${p}`, cb));
        }),
      };
      const { deps } = createMockDeps();
      registerSenseNovaRoutes(app, deps);
      expect(routes.has('POST /api/engine/sensenova/chat')).toBe(true);
      expect(routes.has('POST /api/sensenova/chat')).toBe(true);
      expect(routes.has('POST /api/engine/sensenova/generate')).toBe(true);
      expect(routes.has('POST /api/sensenova/generate')).toBe(true);
    });
  });
});
