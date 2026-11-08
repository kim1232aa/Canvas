/**
 * Mission M125 VIDEOHIST125 test: verify NanoGPT/Agnes/Grok video routes record actual sent
 * parameters & loras in history.
 *
 * Captures real upstream payload via mock fetch and asserts history actualRequest/loras match
 * what was actually sent, not canvas defaults or undeclared fields.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { handleVideoGenerate, type VideoGenerateRouteDeps } from './videoGenerateRoute.ts';

const logged = vi.hoisted(() => [] as any[]);
vi.mock('../requestLog', async (orig) => ({
  ...(await (orig() as any)),
  writeRequestLog: (_dir: string, entries: any[]) => {
    logged.push(...entries);
  },
}));

function createMockDeps(overrides: Partial<VideoGenerateRouteDeps> = {}): { deps: VideoGenerateRouteDeps } {
  const deps = {
    isProvided: (v: any) => v !== undefined && v !== null && v !== '',
    now: () => Date.now(),
    sleep: async () => undefined,
    sleepOrAbort: async () => undefined,
    normalizeFalEndpoint: () => '',
    generationContext: { getStore: () => ({ traces: [] }) },
    recordHistoryItem: vi.fn(async (item: any) => ({ ...item, id: 'hist-m125' })),
    requireDurableHistoryMediaUrl: vi.fn(async (url: string) => ({
      ok: true,
      dataUrl: url.startsWith('data:') ? url : `data:video/mp4;base64,RkFLRQ==`,
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
      getNextKey: vi.fn((prov: string) => `${prov}-pool-key`),
      recordResult: vi.fn(),
    },
    ...overrides,
  };
  return { deps: deps as VideoGenerateRouteDeps };
}

async function postVideoGenerate(deps: VideoGenerateRouteDeps, body: unknown) {
  const app = express();
  app.use(express.json());
  app.post('/api/video/generate', handleVideoGenerate(deps));
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/api/video/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { statusCode: response.status, data: await response.json() as any };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
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
    const res = await postVideoGenerate(deps, { ...CANVAS, provider: 'nanogpt', model: 'ltx-video-1' });

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

    expect(hist.requestMetadata.actualRequest).toMatchObject({
      prompt: 'a waterfall',
      duration: '7',
      seed: 42,
      negative_prompt: 'blur',
    });
    expect(hist.requestMetadata.actualParameters).toMatchObject({
      prompt: 'a waterfall',
      duration: '7',
      seed: 42,
      negative_prompt: 'blur',
      steps: 25,
      cfg: 5.2,
      width: 768,
      height: 1024,
    });

    // Upstream POST body
    const genCall = upstreamCalls.find((c) => c.url.includes('/generate-video'));
    expect(genCall).toBeDefined();
    expect(genCall!.body).toMatchObject({
      prompt: 'a waterfall',
      duration: '7',
      seed: 42,
      negative_prompt: 'blur',
      steps: 25,
      cfg: 5.2,
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
    const res = await postVideoGenerate(deps, { ...CANVAS, provider: 'agnes', model: 'agnes-video-2.5' });

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
    expect(genCall!.body.seconds).toBe('7');
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
    const res = await postVideoGenerate(deps, { ...CANVAS, provider: 'grok_compat', model: 'grok-imagine-video-1.5' });

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
    const res = await postVideoGenerate(deps, { ...CANVAS, provider: 'nanogpt', model: 'bad-model' });

    expect(res.statusCode).toBe(422);
    expect(res.data.error).toContain('NanoGPT 视频任务提交失败');
    // No history item when generation POST itself fails
    expect(res.data.historyItem).toBeUndefined();
  });
});
