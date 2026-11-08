import { describe, expect, it, vi } from 'vitest';
import {
  handleReplicateGenerate,
  handleReplicateModelInfo,
  registerReplicateRoutes,
  replicateHistoryLoras,
  type ReplicateRouteDeps,
} from './replicateRoutes';
import { readVideoJobStatus, resetVideoJobStatusForTests } from '../videoJobStatus';

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
      text: async () => JSON.stringify({
        id: 'pred_default',
        status: 'succeeded',
        output: ['https://replicate.delivery/out.png'],
      }),
    }));

  const wrappedUpstreamFetch = vi.fn(async (meta: any, url: string, options: any) => {
    fetchCalls.push({ meta, url, options });
    const response = await rawUpstreamFetch(meta, url, options);
    if (typeof response.text === 'function') return response;
    return { ...response, text: async () => JSON.stringify(await response.json()) };
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
      // Models with a static PROVIDER_SCHEMA row must still GET live openapi_schema before POST.
      const schemaBody = JSON.stringify({
        latest_version: {
          openapi_schema: {
            components: {
              schemas: {
                Input: {
                  type: 'object',
                  properties: {
                    prompt: { type: 'string' },
                    aspect_ratio: { type: 'string' },
                    seed: { type: 'integer' },
                    num_inference_steps: { type: 'integer' },
                    num_outputs: { type: 'integer' },
                    output_format: { type: 'string' },
                    go_fast: { type: 'boolean' },
                    megapixels: { type: 'string' },
                    output_quality: { type: 'integer' },
                    disable_safety_checker: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      });
      const predBody = JSON.stringify({
        id: 'pred_default',
        status: 'succeeded',
        output: ['https://replicate.delivery/out.png'],
      });
      const { deps, recordedResults, persistedCalls, fetchCalls } = createMockDeps({
        upstreamFetch: vi.fn(async (_meta: any, url: string, options: any) => {
          if (url === 'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell' && options?.method === 'GET') {
            return { ok: true, status: 200, text: async () => schemaBody };
          }
          if (url === 'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions' && options?.method === 'POST') {
            return { ok: true, status: 200, text: async () => predBody };
          }
          throw new Error(`unexpected Replicate request ${options?.method} ${url}`);
        }),
      });
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
      expect(fetchCalls.map((c) => [c.options.method, c.url])).toEqual([
        ['GET', 'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell'],
        ['POST', 'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions'],
      ]);
      expect(fetchCalls[1].options.headers.Authorization).toBe('Bearer r8_test_key_123');
      expect(fetchCalls[1].options.headers.Prefer).toBe('wait');
      expect(res.data.schemaSource).toBe('replicate-live-schema');

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
      expect(fetchCalls).toHaveLength(4); // 1 model GET (route: is_official/latest_version) + 1 initial + 2 polls
      expect(persistedCalls[0].images).toEqual(['https://replicate.delivery/async-out.png']);
      expect(recordedResults[0][2]).toBe(true);
    });

    it('reads a pinned version schema and submits/polls that version through the official /predictions route', async () => {
      const version = '50adaf2d3c7a8b6099dd81e58e6dd27d2c317c52d007bc019c67040c22941234';
      const model = `custom-owner/custom-model:${version}`;
      const base = 'https://api.replicate.com/v1';
      const schemaUrl = `${base}/models/custom-owner/custom-model/versions/${version}`;
      const pollUrl = `${base}/predictions/pred_versioned`;
      const schemaResponse = JSON.stringify({
        openapi_schema: {
          components: {
            schemas: {
              Input: { type: 'object', properties: { prompt: { type: 'string' } } },
            },
          },
        },
      });
      const submitResponse = JSON.stringify({ id: 'pred_versioned', status: 'starting', urls: { get: pollUrl } });
      const pollResponse = JSON.stringify({ id: 'pred_versioned', status: 'succeeded', output: ['https://replicate.delivery/versioned.png'] });
      const { deps, fetchCalls, persistedCalls } = createMockDeps({
        upstreamFetch: vi.fn(async (_meta: any, url: string, options: any) => {
          if (url === schemaUrl && options.method === 'GET') return { ok: true, status: 200, text: async () => schemaResponse };
          if (url === `${base}/predictions` && options.method === 'POST') return { ok: true, status: 201, text: async () => submitResponse };
          if (url === pollUrl && options.method === 'GET') return { ok: true, status: 200, text: async () => pollResponse };
          throw new Error(`unexpected Replicate request ${options.method} ${url}`);
        }),
      });
      const handler = handleReplicateGenerate(deps);
      const req: any = { body: { model, prompt: 'pinned version prompt' }, path: '/api/engine/replicate/generate' };
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(fetchCalls.map((call) => [call.options.method, call.url])).toEqual([
        ['GET', schemaUrl],
        ['POST', `${base}/predictions`],
        ['GET', pollUrl],
      ]);
      expect(JSON.parse(String(fetchCalls[1].options.body))).toEqual({
        version: model,
        input: { prompt: 'pinned version prompt' },
      });
      expect(persistedCalls[0].images).toEqual(['https://replicate.delivery/versioned.png']);
    });

    it('allows caller-declared Input schema after pinned-schema lookup fails and labels it unverified', async () => {
      const version = '50adaf2d3c7a8b6099dd81e58e6dd27d2c317c52d007bc019c67040c22941234';
      const model = `custom-owner/custom-model:${version}`;
      const base = 'https://api.replicate.com/v1';
      const schemaUrl = `${base}/models/custom-owner/custom-model/versions/${version}`;
      const pollUrl = `${base}/predictions/pred_caller_schema`;
      const { deps, fetchCalls } = createMockDeps({
        upstreamFetch: vi.fn(async (_meta: any, url: string, options: any) => {
          if (url === schemaUrl && options.method === 'GET') return { ok: false, status: 404, text: async () => 'version schema unavailable' };
          if (url === `${base}/predictions` && options.method === 'POST') return {
            ok: true, status: 201,
            text: async () => JSON.stringify({ id: 'pred_caller_schema', status: 'starting', urls: { get: pollUrl } }),
          };
          if (url === pollUrl && options.method === 'GET') return {
            ok: true, status: 200,
            text: async () => JSON.stringify({ id: 'pred_caller_schema', status: 'succeeded', output: ['https://replicate.delivery/caller-schema.png'] }),
          };
          throw new Error(`unexpected Replicate request ${options.method} ${url}`);
        }),
      });
      const handler = handleReplicateGenerate(deps);
      const req: any = {
        body: { model, prompt: 'caller schema prompt', inputSchemaProperties: { prompt: { type: 'string' } } },
        path: '/api/engine/replicate/generate',
      };
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(fetchCalls.map((call) => [call.options.method, call.url])).toEqual([
        ['GET', schemaUrl],
        ['POST', `${base}/predictions`],
        ['GET', pollUrl],
      ]);
      expect(JSON.parse(String(fetchCalls[1].options.body))).toEqual({ version: model, input: { prompt: 'caller schema prompt' } });
      expect(res.data.schemaSource).toBe('caller-inputSchemaProperties');
      expect(res.data.schemaValidation).toContain('not verified against the requested version');
      expect(res.data.schemaFetch).toMatchObject({ url: schemaUrl, status: 404, body: 'version schema unavailable' });
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

    it('preserves malformed submit response text and the actual upstream status', async () => {
      const raw = '{"message":"provider detail"';
      const { deps, recordedResults } = createMockDeps({
        upstreamFetch: vi.fn(async () => ({ ok: true, status: 201, text: async () => raw })),
      });
      const handler = handleReplicateGenerate(deps);
      const req: any = {
        body: { model: 'owner/name', prompt: 'test', inputSchemaProperties: { prompt: {} } },
        path: '/api/engine/replicate/generate',
      };
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(502);
      expect(res.data.rawResponse).toBe(raw);
      expect(res.data.upstreamStatus).toBe(201);
      expect(res.data.error).toContain('JSON 解析失败');
      expect(recordedResults[0][5]).toBe(201);
    });

    it('preserves malformed poll response text and the actual upstream status', async () => {
      const raw = 'poll provider detail: invalid JSON';
      const { deps, recordedResults } = createMockDeps({
        upstreamFetch: vi.fn(async (_meta: any, url: string) => url.includes('/models/')
          ? { ok: true, status: 201, text: async () => JSON.stringify({ id: 'pred_poll', status: 'processing', urls: { get: 'https://api.replicate.com/v1/predictions/pred_poll' } }) }
          : { ok: true, status: 206, text: async () => raw }),
      });
      const handler = handleReplicateGenerate(deps);
      const req: any = {
        body: { model: 'owner/name', prompt: 'test', inputSchemaProperties: { prompt: {} } },
        path: '/api/engine/replicate/generate',
      };
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(502);
      expect(res.data.rawResponse).toBe(raw);
      expect(res.data.upstreamStatus).toBe(206);
      expect(res.data.error).toContain('JSON 解析失败');
      expect(recordedResults[0][5]).toBe(206);
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

  it('clears a video job record when a poll fetch throws', async () => {
    resetVideoJobStatusForTests();
    const { deps } = createMockDeps({
      upstreamFetch: vi.fn(async (_meta: any, url: string, options: any) => {
        if (options?.method === 'POST') {
          return {
            ok: true,
            status: 201,
            text: async () => JSON.stringify({
              id: 'pred_vid',
              status: 'starting',
              urls: {
                get: 'https://api.replicate.com/v1/predictions/pred_vid',
                cancel: 'https://api.replicate.com/v1/predictions/pred_vid/cancel',
              },
            }),
          };
        }
        throw new Error('poll 502');
      }),
    });
    const handler = handleReplicateGenerate(deps);
    const res = createMockRes();
    await handler({
      body: {
        model: 'wan-video/wan2.1-with-lora',
        prompt: 'orbit',
        isVideo: true,
        inputSchemaProperties: { prompt: { type: 'string' } },
      },
      path: '/api/engine/replicate/generate',
    } as any, res);
    expect(res.statusCode).toBe(502);
    expect(readVideoJobStatus('pred_vid')).toBeUndefined();
    resetVideoJobStatusForTests();
  });
});

describe('replicateHistoryLoras', () => {
  it('keeps the single lora_weights / hf_lora slot with lora_scale', () => {
    expect(replicateHistoryLoras({ lora_weights: 'owner/repo-a', lora_scale: 0.8 })).toEqual([{ name: 'owner/repo-a', strength: 0.8 }]);
    expect(replicateHistoryLoras({ hf_lora: 'owner/repo-b', lora_scale: 0.5 })).toEqual([{ name: 'owner/repo-b', strength: 0.5 }]);
  });
  it('records both LoRAs of the two-slot contract with their own scales', () => {
    expect(replicateHistoryLoras({ lora_weights: 'owner/a', lora_scale: 0.8, extra_lora: 'owner/b', extra_lora_scale: 0.3 })).toEqual([
      { name: 'owner/a', strength: 0.8 },
      { name: 'owner/b', strength: 0.3 },
    ]);
  });
  it('records the lora_url single-URL slot with lora_strength_model', () => {
    expect(replicateHistoryLoras({ lora_url: 'https://example.test/w.safetensors', lora_strength_model: 1.2 })).toEqual([{ name: 'https://example.test/w.safetensors', strength: 1.2 }]);
  });
  it('records overflow loras and uses null (not a made-up number) when no strength was sent', () => {
    expect(replicateHistoryLoras({ lora_weights: 'owner/a', loras: [{ path: 'owner/c', scale: 0.4 }, 'owner/d'] })).toEqual([
      { name: 'owner/a', strength: null },
      { name: 'owner/c', strength: 0.4 },
      { name: 'owner/d', strength: null },
    ]);
    expect(replicateHistoryLoras({ prompt: 'x' })).toEqual([]);
  });
});

describe('handleReplicateGenerate history LoRAs', () => {
  it('writes both extra_lora LoRAs and the lora_url slot into the history record sent to respondWithGeneratedImages', async () => {
    const run = async (inputSchemaProperties: Record<string, unknown>, loras: unknown[]) => {
      const { deps, persistedCalls } = createMockDeps({
        upstreamFetch: vi.fn(async (_m: any, url: string, options: any) => {
          if (options?.method === 'GET' && url.endsWith('/models/owner/name')) return { ok: true, status: 200, text: async () => JSON.stringify({ is_official: true }) };
          return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'p', status: 'succeeded', output: ['https://replicate.delivery/o.png'] }) };
        }),
      });
      const res = createMockRes();
      await handleReplicateGenerate(deps)({ body: { model: 'owner/name', prompt: 'a lighthouse at dusk, oil painting', inputSchemaProperties, loras }, path: '/api/engine/replicate/generate' } as any, res);
      expect(res.statusCode).toBe(200);
      return persistedCalls[0].metadata.loras;
    };
    expect(await run(
      { prompt: {}, lora_weights: {}, lora_scale: {}, extra_lora: {}, extra_lora_scale: {} },
      [{ name: 'a', path: 'owner/a', strength: 0.8 }, { name: 'b', path: 'owner/b', strength: 0.3 }],
    )).toEqual([{ name: 'owner/a', strength: 0.8 }, { name: 'owner/b', strength: 0.3 }]);
    expect(await run(
      { prompt: {}, lora_url: {}, lora_strength_model: {} },
      [{ name: 'w', path: 'https://example.test/w.safetensors', strength: 1.2 }],
    )).toEqual([{ name: 'https://example.test/w.safetensors', strength: 1.2 }]);
  });
});
