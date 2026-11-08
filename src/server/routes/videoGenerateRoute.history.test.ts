/**
 * Mission M125 VIDEOHIST125 test: verify NanoGPT/Agnes/Grok video routes record actual sent
 * parameters & loras in history.
 *
 * Captures real upstream payload via mock fetch and asserts history actualRequest/loras match
 * what was actually sent, not canvas defaults or undeclared fields.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleVideoGenerate, isProvided, V_DEPS } from './videoGenerateRoute.ts';

const logged = vi.hoisted(() => [] as any[]);
vi.mock('../requestLog', async (orig) => ({
  ...(await (orig() as any)),
  writeRequestLog: (_dir: string, entries: any[]) => {
    logged.push(...entries);
  },
}));

function createMockDeps(overrides: Partial<typeof V_DEPS> = {}): { deps: typeof V_DEPS } {
  const deps = {
    now: () => Date.now(),
    sleep: async (ms: number) => new Promise((r) => setTimeout(r, ms)),
    sleepOrAbort: async (ms: number) => new Promise((r) => setTimeout(r, ms)),
    recordHistoryItem: vi.fn(async (item: any) => ({ ...item, id: 'hist-m125' })),
    requireDurableHistoryMediaUrl: vi.fn(async (url: string) => ({
      ok: true,
      dataUrl: url.startsWith('data:') ? url : `data:video/mp4;base64,RkFLRQ==`,
    })),
    persistMediaAsDataUrl: vi.fn(async () => ({
      ok: true,
      dataUrl: 'data:video/mp4;base64,RkFBS0U=',
    })),
    upstreamFetch: vi.fn(async () => new Response('{}', { status: 200 })),
    resolveProviderAuth: vi.fn((req: any, prov: string) => ({
      apiKey: `${prov}-key`,
      baseUrl:
        prov === 'nanogpt'
          ? 'https://api.nano-gpt.com/api/v1'
          : prov === 'agnes'
            ? 'https://apihub.agnes-ai.com/v1'
            : 'https://api.x.ai/v1',
    })),
    forwardUnmappedFields: vi.fn(() => false),
    keyPoolManager: {
      getKey: vi.fn((prov: string) => ({ key: `${prov}-pool-key`, source: 'pool' })),
      recordResult: vi.fn(),
    },
    updateVideoJobStatus: vi.fn(),
    clearVideoJobStatus: vi.fn(),
    canvasNodeId: vi.fn(() => 'n1'),
    ...overrides,
  };
  return { deps };
}

function makeMockRes() {
  let status = 200;
  let jsonData: any;
  const res: any = {
    statusCode: 200,
    status(code: number) {
      status = code;
      this.statusCode = code;
      return this;
    },
    json(body: any) {
      jsonData = body;
      return this;
    },
    setHeader: () => res,
    getHeader: () => undefined,
    on: () => res,
    headersSent: false,
    destroyed: false,
    writableEnded: false,
  };
  return new Proxy(res, {
    get(target, prop) {
      if (prop === 'data') return jsonData;
      if (prop === 'status') return status;
      return target[prop];
    },
  });
}

const CANVAS = {
  prompt: 'a waterfall',
  duration: 7,
  seed: 42,
  negative_prompt: 'blur',
  custom_parameters: {
    steps: 25,
    cfg: 5.2,
    width: 768,
    height: 1024,
    loras: [
      { name: 'cinematic', strength: 0.7 },
      { name: 'hdr', strength: 1.1 },
    ],
  },
};

let upstreamCalls: Array<{ url: string; body?: any }> = [];

beforeEach(() => {
  upstreamCalls = [];
  logged.length = 0;
});

describe('VIDEOHIST125 - NanoGPT/Agnes/Grok video history records actual sent params & loras', () => {
  it('NanoGPT: upstream payload matches history actualRequest + loras', async () => {
    const { deps } = createMockDeps({
      upstreamFetch: vi.fn(async (_meta: any, url: string, init: any) => {
        const body = init?.body ? JSON.parse(init.body) : undefined;
        upstreamCalls.push({ url, body });
        if (url.includes('/generate-video')) {
          return new Response(JSON.stringify({ runId: 'nvid_1', status: 'pending' }), {
            status: 200,
          });
        }
        return new Response(
          JSON.stringify({
            status: 'completed',
            videoUrl: 'data:video/mp4;base64,RkFLRU5BTk8=',
          }),
          { status: 200 },
        );
      }),
    });
    const res = makeMockRes();
    await handleVideoGenerate(deps)({
      body: { ...CANVAS, provider: 'nanogpt', model: 'ltx-video-1' },
      headers: {},
      path: '/api/video/generate',
    } as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.data.historyItem).toBeDefined();
    const hist = res.data.historyItem;

    // History fields
    expect(hist.provider).toBe('NanoGPT Video');
    expect(hist.seed).toBe(42);
    expect(hist.steps).toBe(25);
    expect(hist.cfg).toBe(5.2);
    expect(hist.negativePrompt).toBe('blur');
    expect(hist.loras).toHaveLength(2);
    expect(hist.loras[0]).toMatchObject({ name: 'cinematic', strength: 0.7 });
    expect(hist.loras[1]).toMatchObject({ name: 'hdr', strength: 1.1 });

    // actualRequest / actualParameters
    expect(hist.requestMetadata.actualRequest).toMatchObject({
      prompt: 'a waterfall',
      duration: 7,
      seed: 42,
      negative_prompt: 'blur',
    });
    expect(hist.requestMetadata.actualParameters).toMatchObject({
      prompt: 'a waterfall',
      duration: 7,
      seed: 42,
      negative_prompt: 'blur',
      num_inference_steps: 25,
      cfg_scale: 5.2,
      width: 768,
      height: 1024,
    });

    // Upstream POST body
    const genCall = upstreamCalls.find((c) => c.url.includes('/generate-video'));
    expect(genCall).toBeDefined();
    expect(genCall!.body).toMatchObject({
      prompt: 'a waterfall',
      duration: 7,
      seed: 42,
      negative_prompt: 'blur',
      num_inference_steps: 25,
      cfg_scale: 5.2,
      width: 768,
      height: 1024,
    });
    expect(genCall!.body.loras).toEqual([
      { name: 'cinematic', strength: 0.7 },
      { name: 'hdr', strength: 1.1 },
    ]);
  });

  it('Agnes: upstream payload matches history actualRequest + loras', async () => {
    const { deps } = createMockDeps({
      upstreamFetch: vi.fn(async (_meta: any, url: string, init: any) => {
        const body = init?.body ? JSON.parse(init.body) : undefined;
        upstreamCalls.push({ url, body });
        if (url.includes('/videos') && !url.includes('/v1/videos/') && !url.includes('video_id=')) {
          return new Response(
            JSON.stringify({ id: 'agt_1', task_id: 'at_1', video_id: 'av_1' }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({ status: 'completed', url: 'data:video/mp4;base64,RkFLRUFHTkVT' }),
          { status: 200 },
        );
      }),
    });
    const res = makeMockRes();
    await handleVideoGenerate(deps)({
      body: { ...CANVAS, provider: 'agnes', model: 'agnes-video-2.5' },
      headers: {},
      path: '/api/video/generate',
    } as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.data.historyItem).toBeDefined();
    const hist = res.data.historyItem;

    expect(hist.provider).toBe('Agnes AI Video (ApiHub)');
    expect(hist.seed).toBe(42);
    expect(hist.steps).toBe(25);
    expect(hist.cfg).toBe(5.2);
    expect(hist.negativePrompt).toBe('blur');
    expect(hist.width).toBe(768);
    expect(hist.height).toBe(1024);
    expect(hist.loras).toHaveLength(2);
    expect(hist.loras[0]).toMatchObject({ name: 'cinematic', strength: 0.7 });

    // Upstream POST /videos (submit)
    const genCall = upstreamCalls.find((c) => c.url.includes('/videos') && c.body?.prompt);
    expect(genCall).toBeDefined();
    expect(genCall!.body.prompt).toBe('a waterfall');
    expect(genCall!.body.seconds).toBe(7);
    expect(genCall!.body.seed).toBe(42);
  });

  it('Grok compat: upstream payload matches history actualRequest + loras', async () => {
    const { deps } = createMockDeps({
      upstreamFetch: vi.fn(async (_meta: any, url: string, init: any) => {
        const body = init?.body ? JSON.parse(init.body) : undefined;
        upstreamCalls.push({ url, body });
        if (url.includes('/videos/generations')) {
          return new Response(JSON.stringify({ request_id: 'gvid_1' }), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            status: 'done',
            video: { url: 'data:video/mp4;base64,RkFLRUdST0s=' },
          }),
          { status: 200 },
        );
      }),
    });
    const res = makeMockRes();
    await handleVideoGenerate(deps)({
      body: { ...CANVAS, provider: 'grok_compat', model: 'grok-imagine-video-1.5' },
      headers: {},
      path: '/api/video/generate',
    } as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.data.historyItem).toBeDefined();
    const hist = res.data.historyItem;

    expect(hist.provider).toBe('Grok 兼容中转');
    expect(hist.seed).toBe(42);
    expect(hist.negativePrompt).toBe('blur');
    expect(hist.steps).toBe(25);
    expect(hist.cfg).toBe(5.2);
    expect(hist.width).toBe(768);
    expect(hist.height).toBe(1024);
    expect(hist.loras).toHaveLength(2);

    // Upstream POST /videos/generations
    const genCall = upstreamCalls.find((c) => c.url.includes('/videos/generations'));
    expect(genCall).toBeDefined();
    expect(genCall!.body.prompt).toBe('a waterfall');
    expect(genCall!.body.duration).toBe(7);
    expect(genCall!.body.seed).toBe(42);
    expect(genCall!.body.negative_prompt).toBe('blur');
    expect(genCall!.body.steps).toBe(25);
    expect(genCall!.body.cfg || genCall!.body.cfg_scale).toBe(5.2);
    expect(genCall!.body.width).toBe(768);
    expect(genCall!.body.height).toBe(1024);
  });

  it('Upstream 422 error never records success history', async () => {
    const { deps } = createMockDeps({
      upstreamFetch: vi.fn(async () => {
        return new Response(JSON.stringify({ error: 'invalid model' }), { status: 422 });
      }),
    });
    const res = makeMockRes();
    await handleVideoGenerate(deps)({
      body: { ...CANVAS, provider: 'nanogpt', model: 'bad-model' },
      headers: {},
      path: '/api/video/generate',
    } as any, res);

    expect(res.statusCode).toBe(422);
    expect(res.data.error).toContain('NanoGPT 视频任务提交失败');
    // No history item when generation POST itself fails
    expect(res.data.historyItem).toBeUndefined();
  });
});
