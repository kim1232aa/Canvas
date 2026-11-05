import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import http from 'http';
import { EventEmitter } from 'node:events';
import { handleVideoGenerate, VIDEO_GENERATE_DOWNLOAD_MARGIN_MS, VIDEO_GENERATE_SCHEMA_TIMEOUT_MS, VIDEO_GENERATE_SOCKET_TIMEOUT_MS, type VideoGenerateRouteDeps } from './videoGenerateRoute.ts';
import { FAL_VIDEO_POLL_BUDGET_MS } from '../falQueueLifecycle.ts';
import { NANO_GPT_VIDEO_POLL_BUDGET_MS } from '../nanoGptVideoStatus.ts';
import { readVideoJobStatus, resetVideoJobStatusForTests } from '../videoJobStatus.ts';

describe('videoGenerateRoute lifecycle and client disconnect handling (grok_compat polling branch)', () => {
  let server: http.Server | undefined;
  const activeSockets = new Set<import('net').Socket>();

  afterEach(async () => {
    for (const socket of activeSockets) {
      socket.destroy();
    }
    activeSockets.clear();
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
    vi.restoreAllMocks();
    resetVideoJobStatusForTests();
  });

  function createMockDeps(overrides: Partial<VideoGenerateRouteDeps> = {}): {
    deps: VideoGenerateRouteDeps;
    recordedResults: any[];
  } {
    const recordedResults: any[] = [];
    const deps: VideoGenerateRouteDeps = {
      isProvided: (v: any) => v !== undefined && v !== null && v !== '',
      forwardUnmappedFields: () => false,
      rejectSchemaEnum: () => false,
      normalizeFalEndpoint: (m: string) => m,
      resolveProviderAuth: () => ({ apiKey: 'mock-key', baseUrl: 'https://mock.grok.ai/v1' }),
      upstreamFetch: vi.fn(),
      keyPoolManager: {
        getNextKey: () => 'mock-key',
        recordResult: (...args: any[]) => { recordedResults.push(args); },
      },
      recordHistoryItem: vi.fn().mockResolvedValue({ id: 'hist-1' }),
      requireDurableHistoryMediaUrl: vi.fn().mockResolvedValue({ ok: true, dataUrl: 'data:video/mp4;base64,AAAA' }),
      generationContext: { getStore: () => undefined },
      ...overrides,
    };
    return { deps, recordedResults };
  }

  function startServer(app: express.Express): Promise<number> {
    return new Promise<number>((resolve) => {
      server = app.listen(0, () => {
        resolve((server!.address() as any).port);
      });
      server.on('connection', (socket) => {
        activeSockets.add(socket);
        socket.on('close', () => activeSockets.delete(socket));
      });
    });
  }

  function withDeadline<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    let t: ReturnType<typeof setTimeout>;
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        t = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]).finally(() => {
      clearTimeout(t);
    });
  }

  it('normal POST with JSON body completes without premature disconnect abortion and cleans listeners', async () => {
    const { deps, recordedResults } = createMockDeps();

    let pollCount = 0;
    (deps.upstreamFetch as any).mockImplementation(async (_meta: any, url: string) => {
      if (url.includes('/videos/generations')) {
        return new Response(JSON.stringify({ request_id: 'req-123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/videos/req-123')) {
        pollCount++;
        return new Response(JSON.stringify({ status: 'completed', video: { url: 'https://example.com/v.mp4' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not Found', { status: 404 });
    });

    let capturedRes: express.Response | undefined;
    let baselineCloseListeners = 0;
    let observedReqComplete = false;
    let observedResEndedDuringReqClose = false;

    const baseHandler = handleVideoGenerate(deps);
    const app = express();
    app.use(express.json());
    app.post('/api/video/generate', (req, res) => {
      capturedRes = res;
      baselineCloseListeners = res.listenerCount('close');
      // Direct guard against the original bug: observe req 'close' event
      req.on('close', () => {
        observedReqComplete = req.complete;
        observedResEndedDuringReqClose = res.writableEnded;
      });
      return baseHandler(req, res);
    });

    const port = await startServer(app);

    const clientReqPromise = new Promise<{ status: number; body: any }>((resolve, reject) => {
      const clientReq = http.request({
        port,
        path: '/api/video/generate',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, (res) => {
        let text = '';
        res.on('data', (c) => { text += c; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 0, body: JSON.parse(text) });
          } catch (e) {
            reject(new Error(`Failed to parse response: ${text}`));
          }
        });
      });
      clientReq.on('error', reject);
      clientReq.setTimeout(4000, () => {
        clientReq.destroy(new Error('Test client request timed out'));
      });
      clientReq.write(JSON.stringify({
        model: 'grok-imagine-video',
        provider: 'grok_compat',
        prompt: 'a cute cat running in grass',
      }));
      clientReq.end();
    });

    const resData = await withDeadline(clientReqPromise, 4500, 'Normal POST test timed out');

    expect(resData.status).toBe(200);
    expect(resData.body.videoUrl).toBe('data:video/mp4;base64,AAAA');
    expect(pollCount).toBeGreaterThanOrEqual(1);
    expect(recordedResults).toEqual([
      ['grok_compat', 'mock-key', true, expect.any(Number)],
    ]);

    // Guards against the original req.on('close') regression:
    // When the request body finished reading, req emitted 'close' (req.complete === true),
    // but the response was still open (res.writableEnded === false).
    // The handler did NOT mistake this for a client disconnect and successfully delivered 200.
    expect(observedReqComplete).toBe(true);
    expect(observedResEndedDuringReqClose).toBe(false);

    // Verified: res close listeners added by route handler are cleaned up after response ends
    expect(capturedRes?.listenerCount('close')).toBe(baselineCloseListeners);
  });

  it('genuine client disconnect during polling stops polling promptly without penalizing key', async () => {
    const { deps, recordedResults } = createMockDeps();

    let submitCalled = false;
    let pollCount = 0;
    let notifySubmitJsonConsumed: () => void;
    const submitJsonConsumedPromise = new Promise<void>((resolve) => {
      notifySubmitJsonConsumed = resolve;
    });

    (deps.upstreamFetch as any).mockImplementation(async (_meta: any, url: string) => {
      if (url.includes('/videos/generations')) {
        submitCalled = true;
        const resp = new Response(JSON.stringify({ request_id: 'req-456' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
        const origJson = resp.json.bind(resp);
        resp.json = async () => {
          const data = await origJson();
          // Signal precisely when the route handler consumes the submit response JSON
          notifySubmitJsonConsumed();
          return data;
        };
        return resp;
      }
      if (url.includes('/videos/req-456')) {
        pollCount++;
        return new Response(JSON.stringify({ status: 'processing' }), { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    });

    let handlerFinished: () => void;
    const handlerFinishPromise = new Promise<void>((resolve) => {
      handlerFinished = resolve;
    });

    let capturedRes: express.Response | undefined;
    let baselineCloseListeners = 0;
    const baseHandler = handleVideoGenerate(deps);
    const app = express();
    app.use(express.json());
    app.post('/api/video/generate', async (req, res) => {
      capturedRes = res;
      baselineCloseListeners = res.listenerCount('close');
      try {
        await baseHandler(req, res);
      } finally {
        handlerFinished();
      }
    });

    const port = await startServer(app);

    const clientReq = http.request({
      port,
      path: '/api/video/generate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    clientReq.on('error', () => {
      // Expected abort / ECONNRESET on socket destruction
    });
    clientReq.setTimeout(4000, () => {
      clientReq.destroy(new Error('Test client request timed out'));
    });
    clientReq.write(JSON.stringify({
      model: 'grok-imagine-video',
      provider: 'grok_compat',
      prompt: 'a running horse',
    }));
    clientReq.end();

    // Synchronize: wait until the route handler has consumed the submit JSON
    await submitJsonConsumedPromise;

    // Yield an event loop tick so the handler enters sleepOrAbort(3000)
    await new Promise((resolve) => setImmediate(resolve));

    // Destroy client socket while server is in sleepOrAbort
    const destroyStart = Date.now();
    clientReq.destroy();

    // Handler must complete promptly via sleepOrAbort abort, not waiting for the 3s timeout
    await withDeadline(handlerFinishPromise, 1500, 'Handler timed out waiting for disconnect abort');
    const abortDuration = Date.now() - destroyStart;

    expect(abortDuration).toBeLessThan(1500); // Promptly exited without waiting for 3s sleep
    expect(submitCalled).toBe(true);
    expect(pollCount).toBe(0); // Never started polling after disconnect

    // Crucial check: client cancellation does NOT record a failure (false) on keyPoolManager
    const keyFailures = recordedResults.filter((r) => r[2] === false);
    expect(keyFailures).toEqual([]);
    // Listener cleaned up in finally block
    expect(capturedRes?.listenerCount('close')).toBe(baselineCloseListeners);
  });

  it('real upstream submit failure retains error status and key-failure penalty', async () => {
    const { deps, recordedResults } = createMockDeps();

    (deps.upstreamFetch as any).mockImplementation(async () => {
      return new Response('Upstream Rate Limited', { status: 429 });
    });

    let capturedRes: express.Response | undefined;
    let baselineCloseListeners = 0;
    const baseHandler = handleVideoGenerate(deps);
    const app = express();
    app.use(express.json());
    app.post('/api/video/generate', (req, res) => {
      capturedRes = res;
      baselineCloseListeners = res.listenerCount('close');
      return baseHandler(req, res);
    });

    const port = await startServer(app);

    const clientReqPromise = new Promise<{ status: number; body: any }>((resolve, reject) => {
      const clientReq = http.request({
        port,
        path: '/api/video/generate',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, (res) => {
        let text = '';
        res.on('data', (c) => { text += c; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 0, body: JSON.parse(text) });
          } catch (e) {
            reject(new Error(`Failed to parse response: ${text}`));
          }
        });
      });
      clientReq.on('error', reject);
      clientReq.setTimeout(4000, () => {
        clientReq.destroy(new Error('Test client request timed out'));
      });
      clientReq.write(JSON.stringify({
        model: 'grok-imagine-video',
        provider: 'grok_compat',
        prompt: 'test prompt',
      }));
      clientReq.end();
    });

    const resData = await withDeadline(clientReqPromise, 4500, 'Upstream failure test timed out');

    expect(resData.status).toBe(429);
    expect(resData.body.error).toContain('Upstream Rate Limited');
    // Upstream failures MUST record key failure with status code
    expect(recordedResults).toEqual([
      ['grok_compat', 'mock-key', false, expect.any(Number), 'Upstream Rate Limited', 429],
    ]);
    expect(capturedRes?.listenerCount('close')).toBe(baselineCloseListeners);
  });

  function makeMockRes() {
    const res: any = new EventEmitter();
    res.statusCode = 200;
    res.writableEnded = false;
    res.destroyed = false;
    res.headersSent = false;
    res.status = (code: number) => { res.statusCode = code; return res; };
    res.json = (body: any) => { res.data = body; return res; };
    return res;
  }

  const FAL_SCHEMA_OK = JSON.stringify({
    paths: {
      '/fal-ai/veo3': {
        post: { requestBody: { content: { 'application/json': { schema: { properties: { prompt: { type: 'string' } } } } } } },
      },
    },
  });

  it('Fal video uses the official queue lifecycle: submit 202 → poll status → fetch result', async () => {
    const seen: Array<{ url: string; options: any }> = [];
    const statusUrl = 'https://queue.fal.run/fal-ai/veo3/requests/req-v1/status';
    const responseUrl = 'https://queue.fal.run/fal-ai/veo3/requests/req-v1';
    let statusPolls = 0;
    const { deps, recordedResults } = createMockDeps({
      upstreamFetch: vi.fn(async (meta: any, url: string, options: any) => {
        if (meta?.readOnly && url.startsWith('https://fal.ai/api/openapi/queue/openapi.json')) {
          return new Response(FAL_SCHEMA_OK, { status: 200 });
        }
        seen.push({ url, options });
        if (url === 'https://queue.fal.run/fal-ai/veo3') {
          return new Response(JSON.stringify({ request_id: 'req-v1', status_url: statusUrl, response_url: responseUrl }), { status: 202 });
        }
        if (url === statusUrl) {
          statusPolls++;
          return statusPolls === 1
            ? new Response(JSON.stringify({ status: 'IN_QUEUE', queue_position: 1 }), { status: 202 })
            : new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 });
        }
        if (url === responseUrl) {
          return new Response(JSON.stringify({ video: { url: 'https://fal.media/files/v.mp4' }, seed: 7 }), { status: 200 });
        }
        return new Response('Not Found', { status: 404 });
      }),
    });
    const res = makeMockRes();

    await handleVideoGenerate(deps)({
      body: { provider: 'fal', model: 'fal-ai/veo3', prompt: 'queue lifecycle video' },
      headers: {},
      path: '/api/video/generate',
    } as any, res);

    // The defect: route must NOT call synchronous https://fal.run/{endpoint} for long video tasks.
    expect(seen.some((c) => c.url.startsWith('https://fal.run/'))).toBe(false);
    expect(seen[0].url).toBe('https://queue.fal.run/fal-ai/veo3');
    expect(seen[0].options.method).toBe('POST');
    expect(JSON.parse(seen[0].options.body)).toEqual({ prompt: 'queue lifecycle video' });
    expect(statusPolls).toBe(2); // pending (IN_QUEUE) then COMPLETED

    expect(res.statusCode).toBe(200);
    expect(res.data.videoUrl).toBe('data:video/mp4;base64,AAAA');
    expect(res.data.seed).toBe(7);
    expect(res.data.exactEndpointCalled).toBe('https://queue.fal.run/fal-ai/veo3');
    expect(recordedResults).toEqual([
      ['fal', 'mock-key', true, expect.any(Number)],
    ]);
    expect(readVideoJobStatus('req-v1')).toBeUndefined();
  });

  it('Fal queue result non-2xx is passed through (status + raw body), never fabricated as success', async () => {
    const detail = '{"detail":[{"msg":"Input validation failed"}]}';
    const { deps, recordedResults } = createMockDeps({
      upstreamFetch: vi.fn(async (meta: any, url: string) => {
        if (meta?.readOnly && url.startsWith('https://fal.ai/api/openapi/queue/openapi.json')) {
          return new Response(FAL_SCHEMA_OK, { status: 200 });
        }
        if (url === 'https://queue.fal.run/fal-ai/veo3') {
          return new Response(JSON.stringify({ request_id: 'req-bad' }), { status: 202 });
        }
        if (url === 'https://queue.fal.run/fal-ai/veo3/requests/req-bad/status') {
          return new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 });
        }
        if (url === 'https://queue.fal.run/fal-ai/veo3/requests/req-bad') {
          return new Response(detail, { status: 422 });
        }
        return new Response('Not Found', { status: 404 });
      }),
    });
    const res = makeMockRes();

    await handleVideoGenerate(deps)({
      body: { provider: 'fal', model: 'fal-ai/veo3', prompt: 'bad input' },
      headers: {},
      path: '/api/video/generate',
    } as any, res);

    expect(res.statusCode).toBe(422);
    expect(res.data.upstreamStatus).toBe(422);
    expect(res.data.rawResponse).toBe(detail);
    expect(res.data.errorSource).toBe('upstream');
    expect(res.data.videoUrl).toBeUndefined();
    expect(recordedResults).toEqual([
      ['fal', 'mock-key', false, expect.any(Number), detail, 422],
    ]);
  });

  it('sends a custom Fal dev endpoint unchanged and preserves an actual 402 balance response', async () => {
    const rawResponse = '{"message":"Exhausted balance: add credits"}';
    let capturedUrl = '';
    let capturedOptions: any;
    const { deps, recordedResults } = createMockDeps({
      upstreamFetch: vi.fn(async (meta: any, url: string, options: any) => {
        // Outbound gate reads the live Fal OpenAPI first (fake network: minimal schema declaring prompt only).
        if (meta?.readOnly && url.startsWith('https://fal.ai/api/openapi/queue/openapi.json')) {
          return new Response(JSON.stringify({ paths: { '/fal-ai/custom-dev-video': { post: { requestBody: { content: { 'application/json': { schema: { properties: { prompt: { type: 'string' } } } } } } } } } }), { status: 200 });
        }
        capturedUrl = url;
        capturedOptions = options;
        return new Response(rawResponse, { status: 402, headers: { 'Content-Type': 'application/json' } });
      }),
    });
    const res: any = new EventEmitter();
    res.statusCode = 200;
    res.writableEnded = false;
    res.destroyed = false;
    res.headersSent = false;
    res.status = (code: number) => { res.statusCode = code; return res; };
    res.json = (body: any) => { res.data = body; return res; };

    await handleVideoGenerate(deps)({
      body: { provider: 'fal', model: 'fal-ai/custom-dev-video', prompt: 'test video' },
      headers: {},
      path: '/api/video/generate',
    } as any, res);

    expect(capturedUrl).toBe('https://queue.fal.run/fal-ai/custom-dev-video');
    expect(JSON.parse(capturedOptions.body)).toEqual({ prompt: 'test video' });
    expect(res.statusCode).toBe(402);
    expect(res.data.error).toContain('[402]');
    expect(res.data.error).not.toContain('[403]');
    expect(res.data.upstreamStatus).toBe(402);
    expect(res.data.rawResponse).toBe(rawResponse);
    expect(res.data.errorSource).toBe('upstream');
    expect(res.data.endpoint).toBe(capturedUrl);
    expect(recordedResults).toEqual([
      ['fal', 'mock-key', false, expect.any(Number), rawResponse, 402],
    ]);
  });

  function nanoClock() {
    let t = 0;
    return {
      now: () => t,
      sleep: async (ms: number) => { t += ms; },
    };
  }

  it('NanoGPT COMPLETED with only the top-level videoUrl is success, not a 175s timeout', async () => {
    const clock = nanoClock();
    const { deps } = createMockDeps({
      ...clock,
      upstreamFetch: vi.fn(async (_meta: any, url: string) => {
        if (url.endsWith('/api/generate-video')) {
          return new Response(JSON.stringify({ runId: 'vid_top', status: 'pending' }), { status: 200 });
        }
        return new Response(JSON.stringify({ status: 'completed', videoUrl: 'https://cdn.example/top.mp4' }), { status: 200 });
      }),
    });
    const res = makeMockRes();
    await handleVideoGenerate(deps)({
      body: { provider: 'nanogpt', model: 'wan-video', prompt: 'a gondola', duration: 5, fps: 16, num_frames: 81, resolution: '720p', steps: 30, cfg: 0.5 },
      headers: {},
      path: '/api/video/generate',
    } as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.data.videoUrl).toBe('data:video/mp4;base64,AAAA');
    expect(res.data.error).toBeUndefined();
    const submit = (deps.upstreamFetch as any).mock.calls.find((c: any[]) => String(c[1]).endsWith('/api/generate-video'));
    expect(JSON.parse(submit[2].body)).toMatchObject({
      duration: '5', frames_per_second: 16, num_frames: 81, resolution: '720p', num_inference_steps: 30, cfg_scale: 0.5,
    });
  });

  it('NanoGPT COMPLETED without any video URL is 502 upstream-protocol, not 504 timeout', async () => {
    const clock = nanoClock();
    const raw = { status: 'completed', videoUrl: null, data: { status: 'COMPLETED', output: {} } };
    const { deps } = createMockDeps({
      ...clock,
      upstreamFetch: vi.fn(async (_meta: any, url: string) => {
        if (url.endsWith('/api/generate-video')) {
          return new Response(JSON.stringify({ runId: 'vid_empty', status: 'pending' }), { status: 200 });
        }
        return new Response(JSON.stringify(raw), { status: 200 });
      }),
    });
    const res = makeMockRes();
    await handleVideoGenerate(deps)({
      body: { provider: 'nanogpt', model: 'wan-video', prompt: 'a gondola' },
      headers: {},
      path: '/api/video/generate',
    } as any, res);
    expect(res.statusCode).toBe(502);
    expect(res.data.errorSource).toBe('upstream-protocol');
    expect(res.data.runId).toBe('vid_empty');
    expect(res.data.endpoint).toContain('/api/video/status?requestId=vid_empty');
    expect(res.data.rawResponse).toEqual(raw);
    expect(String(res.data.error)).not.toContain('175s');
  });

  it('NanoGPT still in progress when the 10 minute local budget ends is 504 errorSource local', async () => {
    const clock = nanoClock();
    const { deps } = createMockDeps({
      ...clock,
      upstreamFetch: vi.fn(async (_meta: any, url: string) => {
        if (url.endsWith('/api/generate-video')) {
          return new Response(JSON.stringify({ runId: 'vid_slow', status: 'pending' }), { status: 200 });
        }
        return new Response(JSON.stringify({ data: { status: 'IN_PROGRESS' } }), { status: 200 });
      }),
    });
    const res = makeMockRes();
    await handleVideoGenerate(deps)({
      body: { provider: 'nanogpt', model: 'wan-video', prompt: 'a gondola' },
      headers: {},
      path: '/api/video/generate',
    } as any, res);
    expect(res.statusCode).toBe(504);
    expect(res.data.errorSource).toBe('local');
    expect(res.data.runId).toBe('vid_slow');
    expect(res.data.lastStatus).toBe('IN_PROGRESS');
    expect(String(res.data.error)).toContain('600000');
    expect(String(res.data.error)).not.toContain('175s');
    const polls = (deps.upstreamFetch as any).mock.calls.filter((c: any[]) => String(c[1]).includes('/api/video/status'));
    expect(polls.length).toBeGreaterThan(70);
    expect(readVideoJobStatus('vid_slow')).toBeUndefined();
  });

  it('Fal queue poll throw still drops the job record', async () => {
    const { deps } = createMockDeps({
      upstreamFetch: vi.fn(async (meta: any, url: string) => {
        if (meta?.readOnly && url.startsWith('https://fal.ai/api/openapi/queue/openapi.json')) {
          return new Response(FAL_SCHEMA_OK, { status: 200 });
        }
        if (url === 'https://queue.fal.run/fal-ai/veo3') {
          return new Response(JSON.stringify({
            request_id: 'req-throw',
            status_url: 'https://queue.fal.run/fal-ai/veo3/requests/req-throw/status',
            cancel_url: 'https://queue.fal.run/fal-ai/veo3/requests/req-throw/cancel',
          }), { status: 202 });
        }
        throw new Error('status socket hang up');
      }),
    });
    const res = makeMockRes();
    await handleVideoGenerate(deps)({
      body: { provider: 'fal', model: 'fal-ai/veo3', prompt: 'throw during poll' },
      headers: {},
      path: '/api/video/generate',
    } as any, res);
    expect(readVideoJobStatus('req-throw')).toBeUndefined();
  });

  it('keeps the generate socket at Fal budget plus schema fetch plus download', () => {
    const floor = FAL_VIDEO_POLL_BUDGET_MS + VIDEO_GENERATE_SCHEMA_TIMEOUT_MS + VIDEO_GENERATE_DOWNLOAD_MARGIN_MS;
    expect(VIDEO_GENERATE_SOCKET_TIMEOUT_MS).toBeGreaterThanOrEqual(floor);
    expect(VIDEO_GENERATE_SOCKET_TIMEOUT_MS).toBeGreaterThanOrEqual(NANO_GPT_VIDEO_POLL_BUDGET_MS + VIDEO_GENERATE_SCHEMA_TIMEOUT_MS + VIDEO_GENERATE_DOWNLOAD_MARGIN_MS);
    expect(VIDEO_GENERATE_SCHEMA_TIMEOUT_MS).toBe(30_000);
    expect(VIDEO_GENERATE_DOWNLOAD_MARGIN_MS).toBe(120_000);
  });

  it('sets req and res idle timeouts to Fal budget plus schema plus download', async () => {
    const timeouts: number[] = [];
    const { deps } = createMockDeps({
      upstreamFetch: vi.fn(async () => new Response('nope', { status: 400 })),
    });
    const req: any = {
      body: { provider: 'fal', model: 'fal-ai/veo3', prompt: 'socket' },
      headers: {},
      path: '/api/video/generate',
      setTimeout: (ms: number) => { timeouts.push(ms); },
    };
    const res: any = makeMockRes();
    res.setTimeout = (ms: number) => { timeouts.push(ms); };
    await handleVideoGenerate(deps)(req, res);
    const floor = FAL_VIDEO_POLL_BUDGET_MS + VIDEO_GENERATE_SCHEMA_TIMEOUT_MS + VIDEO_GENERATE_DOWNLOAD_MARGIN_MS;
    expect(timeouts.length).toBeGreaterThanOrEqual(2);
    expect(timeouts.every((ms) => ms >= floor)).toBe(true);
  });
});
