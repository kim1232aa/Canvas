import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMediaStore } from './mediaStore';
import { registerSchemaProviderRoutes } from './schemaProviders';
import { MEDIA_INPUT_ROUTES } from './mediaContract';

let dir: string;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jDioAAAAASUVORK5CYII=', 'base64');
const DATA_URL = `data:image/png;base64,${PNG.toString('base64')}`;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-wire-review-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

async function withFixture(
  store: ReturnType<typeof createMediaStore>,
  upstream: (url: string, init?: RequestInit) => Promise<Response>,
  run: (baseUrl: string, calls: Array<{ url: string; init?: RequestInit }>) => Promise<void>,
) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const app = express();
  app.use((req, _res, next) => {
    try {
      if (req.method === 'POST' && MEDIA_INPUT_ROUTES.test(req.path)) {
        req.body = store.resolveInput(req.body);
      }
      next();
    } catch (error) {
      next(error);
    }
  });

  registerSchemaProviderRoutes(app, {
    fetch: async (_meta, url, init) => {
      calls.push({ url, init });
      return upstream(url, init);
    },
    key: () => 'test-key',
    record: (item) => item,
    durable: async (url) => ({ ok: true, dataUrl: url }),
  });

  const baseUrl = 'http://schema-provider-wire.fixture';
  const originalFetch = globalThis.fetch;
  const router = (app as any)._router;
  const layers: any[] = router?.stack || [];
  const matchRoute = (pattern: string, pathname: string) => {
    const expected = pattern.split('/').filter(Boolean);
    const actual = pathname.split('/').filter(Boolean);
    if (expected.length !== actual.length) return undefined;
    const params: Record<string, string> = {};
    for (let i = 0; i < expected.length; i++) {
      if (expected[i].startsWith(':')) params[expected[i].slice(1)] = decodeURIComponent(actual[i]);
      else if (expected[i] !== actual[i]) return undefined;
    }
    return params;
  };

  const fixtureFetch: typeof fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
    const raw = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const url = new URL(raw, baseUrl);
    if (url.origin !== baseUrl) return originalFetch(input as any, init);
    const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toLowerCase();
    const layer = layers.find((candidate) => {
      const route = candidate.route;
      return route && route.methods?.[method] && typeof route.path === 'string' && matchRoute(route.path, url.pathname);
    });
    if (!layer) return new Response(JSON.stringify({ error: `Fixture route not found: ${method.toUpperCase()} ${url.pathname}` }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    const params = matchRoute(layer.route.path, url.pathname) || {};
    const headers = Object.fromEntries(new Headers(init.headers || (input instanceof Request ? input.headers : undefined)).entries());
    let body: any = undefined;
    const rawBody = init.body ?? (input instanceof Request ? await input.clone().text() : undefined);
    if (typeof rawBody === 'string' && rawBody) {
      try { body = JSON.parse(rawBody); } catch { body = rawBody; }
    }
    const req: any = { method: method.toUpperCase(), path: url.pathname, params, query: Object.fromEntries(url.searchParams.entries()), headers, body };

    try {
      if (req.method === 'POST' && MEDIA_INPUT_ROUTES.test(req.path)) {
        req.body = store.resolveInput(req.body);
      }
    } catch (err: any) {
      return new Response(JSON.stringify({ ok: false, error: err.message, errorSource: err.errorSource || 'local' }), { status: err.status || 400, headers: { 'Content-Type': 'application/json' } });
    }

    let response: Response | undefined;
    const res: any = {
      statusCode: 200,
      status(code: number) { this.statusCode = code; return this; },
      json(payload: unknown) {
        response = new Response(JSON.stringify(payload), { status: this.statusCode, headers: { 'Content-Type': 'application/json' } });
        return this;
      },
    };
    const next = () => { if (!response) response = new Response(JSON.stringify({ error: 'Fixture route passed to next()' }), { status: 404, headers: { 'Content-Type': 'application/json' } }); };
    for (const routeLayer of layer.route.stack) await routeLayer.handle(req, res, next);
    return response || new Response(null, { status: res.statusCode || 204 });
  };
  globalThis.fetch = fixtureFetch;

  try {
    await run(baseUrl, calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

describe('schema provider submit wire review (item 8)', () => {
  it('restores media before MuAPI parameter mapping and sends data URL upstream while preserving prompt and custom JSON text', async () => {
    const store = createMediaStore(dir);
    const mediaUrl = store.saveDataUrl(DATA_URL);

    let upstreamBody: any;
    await withFixture(store, async (url, init) => {
      if (url.endsWith('/api/v1/models')) {
        return Response.json({
          models: [{
            name: 'img2img-model',
            endpoint: '/api/v1/img2img',
            endpoint_url: 'img2img_run',
            group_of: 'image',
          }],
        });
      }
      if (url.endsWith('/openapi.json')) {
        return Response.json({
          paths: {
            '/api/v1/img2img_run': {
              post: {
                requestBody: {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          prompt: { type: 'string' },
                          image: { type: 'string' },
                          notes: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        });
      }
      if (init?.method === 'POST' && url.endsWith('/api/v1/img2img_run')) {
        upstreamBody = JSON.parse(init.body as string);
        return Response.json({ request_id: 'muapi-task-123' });
      }
      throw new Error(`Unexpected URL: ${url}`);
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/schema-provider/muapi/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'img2img_run',
          prompt: `keep this prompt with ${mediaUrl} literally`,
          image_url: mediaUrl,
          custom_parameters: {
            notes: `custom notes containing ${mediaUrl}`,
          },
        }),
      });

      const body = await response.json() as any;
      expect(response.status).toBe(200);
      expect(body.taskId).toBe('muapi-task-123');
      expect(upstreamBody.image).toBe(DATA_URL);
      expect(upstreamBody.prompt).toBe(`keep this prompt with ${mediaUrl} literally`);
      expect(upstreamBody.notes).toBe(`custom notes containing ${mediaUrl}`);
    });
  });

  it('restores media before WaveSpeed parameter mapping without modifying non-media strings', async () => {
    const store = createMediaStore(dir);
    const mediaUrl = store.saveDataUrl(DATA_URL);

    let upstreamBody: any;
    await withFixture(store, async (url, init) => {
      if (url.endsWith('/api/v3/models')) {
        return Response.json({
          data: [{
            model_id: 'wavespeed-i2i',
            api_schema: {
              api_schemas: [{
                type: 'model_run',
                method: 'POST',
                server: 'https://api.wavespeed.ai',
                api_path: '/api/v3/wavespeed-i2i',
                request_schema: {
                  type: 'object',
                  properties: {
                    prompt: { type: 'string' },
                    image: { type: 'string' },
                  },
                },
              }],
            },
          }],
        });
      }
      if (init?.method === 'POST' && url.endsWith('/api/v3/wavespeed-i2i')) {
        upstreamBody = JSON.parse(init.body as string);
        return Response.json({ data: { id: 'wavespeed-task-456' } });
      }
      throw new Error(`Unexpected URL: ${url}`);
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/schema-provider/wavespeed/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'wavespeed-i2i',
          prompt: `wavespeed prompt: ${mediaUrl}`,
          image_url: mediaUrl,
        }),
      });

      const body = await response.json() as any;
      expect(response.status).toBe(200);
      expect(body.taskId).toBe('wavespeed-task-456');
      expect(upstreamBody.image).toBe(DATA_URL);
      expect(upstreamBody.prompt).toBe(`wavespeed prompt: ${mediaUrl}`);
    });
  });

  it('rejects private short-ref in Sogni with clear 400 without pretending it was uploaded to public cloud', async () => {
    const store = createMediaStore(dir);
    const mediaUrl = store.saveDataUrl(DATA_URL);

    await withFixture(store, async () => {
      throw new Error('Upstream must not be called when Sogni input is invalid');
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/schema-provider/sogni/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'krea-2-turbo',
          prompt: 'test prompt',
          image_url: mediaUrl,
        }),
      });

      const body = await response.json() as any;
      expect(response.status).toBe(400);
      expect(body.errorSource).toBe('local');
      expect(body.error).toContain('Sogni 当前集成没有已核实的私有图片上传流程');
      expect(body.error).toContain('公网图片 URL');
    });
  });

  it('allows public HTTPS URL in Sogni submit and places it into media_references', async () => {
    const store = createMediaStore(dir);
    let upstreamBody: any;
    await withFixture(store, async (url, init) => {
      if (init?.method === 'POST' && url.endsWith('/v1/creative-agent/workflows')) {
        upstreamBody = JSON.parse(init.body as string);
        return Response.json({ data: { workflow: { workflowId: 'sogni-wf-789' } } }, { status: 201 });
      }
      throw new Error(`Unexpected URL: ${url}`);
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/schema-provider/sogni/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'krea-2-turbo',
          prompt: 'sogni test prompt',
          image_url: 'https://example.com/public-image.png',
          denoise: 0.7,
        }),
      });

      const body = await response.json() as any;
      expect(response.status).toBe(201);
      expect(body.taskId).toBe('sogni-wf-789');
      expect(upstreamBody.media_references).toEqual([{ kind: 'image', url: 'https://example.com/public-image.png' }]);
      expect(upstreamBody.input.steps[0].arguments.starting_image_strength).toBe(0.7);
    });
  });
});
