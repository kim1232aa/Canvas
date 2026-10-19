import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import http from 'http';
import { handleVideoGenerate, type VideoGenerateRouteDeps } from './videoGenerateRoute.ts';

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
  });

  function createMockDeps(overrides: Partial<VideoGenerateRouteDeps> = {}): {
    deps: VideoGenerateRouteDeps;
    recordedResults: any[];
  } {
    const recordedResults: any[] = [];
    const deps: VideoGenerateRouteDeps = {
      isProvided: (v: any) => v !== undefined && v !== null && v !== '',
      rejectUnsupported: () => false,
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
});
