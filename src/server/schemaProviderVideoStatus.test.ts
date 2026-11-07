import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { registerSchemaProviderRoutes } from './schemaProviders';
import { registerVideoGenerateRoutes } from './routes/videoGenerateRoute';
import { resetVideoJobStatusForTests } from './videoJobStatus';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const KREA_OPENAPI = {
  paths: {
    '/generate/video/kling/kling-2.5': {
      post: {
        summary: 'Kling 2.5',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { prompt: { type: 'string' } } } } } },
      },
    },
    '/generate/image/krea/krea-2': {
      post: {
        summary: 'Krea 2',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { prompt: { type: 'string' } } } } } },
      },
    },
  },
};

function stubVideoDeps(): any {
  return {
    isProvided: () => false,
    forwardUnmappedFields: () => false,
    normalizeFalEndpoint: (m: string) => m,
    resolveProviderAuth: () => ({ apiKey: '', baseUrl: '' }),
    upstreamFetch: async () => new Response('unused', { status: 500 }),
    keyPoolManager: { getNextKey: () => '', recordResult: () => {} },
    recordHistoryItem: async () => ({}),
    requireDurableHistoryMediaUrl: async () => ({ ok: true, dataUrl: '' }),
    generationContext: { getStore: () => undefined },
  };
}

async function dispatch(app: express.Express, req: {
  method: string;
  path: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: unknown;
}): Promise<{ status: number; body: any }> {
  const method = req.method.toLowerCase();
  const layer = (app as any)._router.stack.find((candidate: any) => {
    const route = candidate.route;
    return route && route.methods?.[method] && route.path === req.path;
  });
  if (!layer) throw new Error(`no route ${req.method} ${req.path}`);
  let status = 200;
  let payload: any;
  const res: any = {
    statusCode: 200,
    status(code: number) { status = code; this.statusCode = code; return this; },
    json(body: unknown) { payload = body; return this; },
  };
  await layer.route.stack[0].handle({
    method: req.method,
    path: req.path,
    params: req.params || {},
    query: req.query || {},
    headers: req.headers || {},
    body: req.body,
  }, res, () => {});
  return { status, body: payload };
}

describe('schema-provider video status is written on the server', () => {
  afterEach(() => resetVideoJobStatusForTests());

  it('submit with isVideo records the task, poll updates it, a terminal status clears it, and GET /api/video/status sees the record', async () => {
    resetVideoJobStatusForTests();
    let polls = 0;
    const app = express();
    registerSchemaProviderRoutes(app, {
      fetch: async (_meta, url, init) => {
        if (url.endsWith('/openapi.json')) return json(KREA_OPENAPI);
        if (init?.method === 'POST' && String(url).includes('/generate/video/')) return json({ job_id: 'krea-job-1' });
        if (String(url).includes('/jobs/krea-job-1')) {
          polls += 1;
          return polls === 1
            ? json({ status: 'processing' })
            : json({ status: 'completed', result: { urls: ['https://krea.example/v.mp4'] } });
        }
        throw new Error(`unexpected ${url}`);
      },
      key: () => 'krea-secret',
      record: (item) => item,
      durable: async (url) => ({ ok: true, dataUrl: url }),
    });
    registerVideoGenerateRoutes(app, stubVideoDeps());

    const submitted = await dispatch(app, {
      method: 'POST',
      path: '/api/schema-provider/:provider/submit',
      params: { provider: 'krea' },
      headers: { 'x-krea-key': 'krea-secret' },
      body: {
        model: 'video/kling/kling-2.5',
        prompt: 'a lantern',
        isVideo: true,
        workflowSnapshot: { executingNodeId: 'node-a' },
      },
    });
    expect(submitted.status).toBe(200);
    expect(submitted.body.taskId).toBe('krea-job-1');

    const byJob = await dispatch(app, { method: 'GET', path: '/api/video/status', query: { jobId: 'krea-job-1' } });
    expect(byJob.status).toBe(200);
    expect(byJob.body).toMatchObject({ jobId: 'krea-job-1', provider: 'krea', nodeId: 'node-a' });
    expect(byJob.body.credential).toBeUndefined();
    expect(String(byJob.body.text)).toContain('已提交');

    const byNode = await dispatch(app, { method: 'GET', path: '/api/video/status', query: { nodeId: 'node-a' } });
    expect(byNode.body.jobId).toBe('krea-job-1');

    const firstPoll = await dispatch(app, {
      method: 'GET',
      path: '/api/schema-provider/:provider/tasks/:taskId',
      params: { provider: 'krea', taskId: 'krea-job-1' },
      headers: { 'x-krea-key': 'krea-secret' },
    });
    expect(firstPoll.body.status).toBe('processing');
    const running = await dispatch(app, { method: 'GET', path: '/api/video/status', query: { jobId: 'krea-job-1' } });
    expect(String(running.body.text)).toContain('processing');

    const done = await dispatch(app, {
      method: 'GET',
      path: '/api/schema-provider/:provider/tasks/:taskId',
      params: { provider: 'krea', taskId: 'krea-job-1' },
      headers: { 'x-krea-key': 'krea-secret' },
    });
    expect(done.body.status).toBe('completed');
    const gone = await dispatch(app, { method: 'GET', path: '/api/video/status', query: { jobId: 'krea-job-1' } });
    expect(gone.status).toBe(404);
  });

  it('does not record an image submit', async () => {
    resetVideoJobStatusForTests();
    const app = express();
    registerSchemaProviderRoutes(app, {
      fetch: async (_meta, url, init) => {
        if (url.endsWith('/openapi.json')) return json(KREA_OPENAPI);
        if (init?.method === 'POST' && String(url).includes('/generate/image/')) return json({ job_id: 'img-1' });
        throw new Error(`unexpected ${url}`);
      },
      key: () => 'krea-secret',
      record: (item) => item,
      durable: async (url) => ({ ok: true, dataUrl: url }),
    });
    registerVideoGenerateRoutes(app, stubVideoDeps());
    const submitted = await dispatch(app, {
      method: 'POST',
      path: '/api/schema-provider/:provider/submit',
      params: { provider: 'krea' },
      headers: { 'x-krea-key': 'krea-secret' },
      body: { model: 'image/krea/krea-2', prompt: 'still' },
    });
    expect(submitted.body.taskId).toBe('img-1');
    const status = await dispatch(app, { method: 'GET', path: '/api/video/status', query: { jobId: 'img-1' } });
    expect(status.status).toBe(404);
  });
});
