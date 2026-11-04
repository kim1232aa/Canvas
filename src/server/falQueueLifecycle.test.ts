import { describe, it, expect, vi } from 'vitest';
import {
  falQueueSubmitUrl,
  falQueueAppId,
  falQueueStatusUrl,
  falQueueResultUrl,
  runFalQueueLifecycle,
} from './falQueueLifecycle.ts';

/**
 * Official Fal queue lifecycle contract (verified against docs):
 * - POST https://queue.fal.run/{model_id}[/{subpath}]        → 202 + { request_id, status_url, response_url, cancel_url }
 * - GET  {status_url}   (= queue.fal.run/{owner}/{app}/requests/{request_id}/status)
 *     → 202 { status: 'IN_QUEUE'|'IN_PROGRESS', ... } / 200 { status: 'COMPLETED', ... }
 * - GET  {response_url} (= queue.fal.run/{owner}/{app}/requests/{request_id})
 *     → HTTP status mirrors the model result (200 success, 4XX invalid request, 5XX model error;
 *       400 request not completed, 404 request not found). Never fabricate success.
 * Docs: https://fal.ai/docs/documentation/model-apis/inference/queue
 *       https://docs.fal.ai/model-endpoints/queue
 */

const KEY = 'test-fal-key';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function makeFetchLog() {
  const calls: Array<{ url: string; options: any }> = [];
  let impl: (url: string, options?: any) => Promise<Response> = async () => jsonResponse({}, 500);
  const fetchFn: any = vi.fn(async (url: string, options?: any) => {
    calls.push({ url, options });
    return impl(url, options);
  });
  fetchFn.mockImplementation = (fn: any) => { impl = fn; return fetchFn; };
  fetchFn.mockResolvedValue = (r: any) => { impl = async () => r; return fetchFn; };
  return { calls, fetchFn };
}

describe('falQueueLifecycle URL builders', () => {
  it('submits to queue.fal.run (never synchronous fal.run) keeping the exact endpoint id', () => {
    expect(falQueueSubmitUrl('fal-ai/veo3')).toBe('https://queue.fal.run/fal-ai/veo3');
    expect(falQueueSubmitUrl('fal-ai/flux/dev')).toBe('https://queue.fal.run/fal-ai/flux/dev');
  });

  it('builds status/result URLs from the app id (owner/app), not the full endpoint path', () => {
    expect(falQueueAppId('fal-ai/flux/dev')).toBe('fal-ai/flux');
    expect(falQueueStatusUrl('fal-ai/flux/dev', 'req-1')).toBe(
      'https://queue.fal.run/fal-ai/flux/requests/req-1/status',
    );
    expect(falQueueResultUrl('fal-ai/flux/dev', 'req-1')).toBe(
      'https://queue.fal.run/fal-ai/flux/requests/req-1',
    );
    expect(falQueueResultUrl('fal-ai/veo3', 'req-2')).toBe(
      'https://queue.fal.run/fal-ai/veo3/requests/req-2',
    );
  });
});

describe('runFalQueueLifecycle', () => {
  it('submit 202 + request_id → polls status (IN_QUEUE then COMPLETED) → fetches result output', async () => {
    const { calls, fetchFn } = makeFetchLog();
    const statusUrl = 'https://queue.fal.run/fal-ai/veo3/requests/req-abc/status';
    const responseUrl = 'https://queue.fal.run/fal-ai/veo3/requests/req-abc';
    let statusPolls = 0;
    fetchFn.mockImplementation(async (url: string) => {
      if (url === 'https://queue.fal.run/fal-ai/veo3') {
        return jsonResponse({ request_id: 'req-abc', status_url: statusUrl, response_url: responseUrl }, 202);
      }
      if (url === statusUrl) {
        statusPolls++;
        return statusPolls === 1
          ? jsonResponse({ status: 'IN_QUEUE', queue_position: 1, response_url: responseUrl }, 202)
          : jsonResponse({ status: 'COMPLETED', response_url: responseUrl }, 200);
      }
      if (url === responseUrl) {
        return jsonResponse({ video: { url: 'https://fal.media/files/out.mp4' }, seed: 42 }, 200);
      }
      throw new Error(`unexpected url ${url}`);
    });
    const sleep = vi.fn(async () => {});

    const outcome = await runFalQueueLifecycle({
      endpoint: 'fal-ai/veo3',
      apiKey: KEY,
      payload: { prompt: 'a cat' },
      fetchFn,
      sleep,
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.requestId).toBe('req-abc');
      expect(outcome.data.video.url).toBe('https://fal.media/files/out.mp4');
      expect(outcome.submitUrl).toBe('https://queue.fal.run/fal-ai/veo3');
    }
    expect(statusPolls).toBe(2);
    expect(sleep).toHaveBeenCalledTimes(1);

    // Submit request: POST with Key auth and the payload unchanged.
    expect(calls[0].url).toBe('https://queue.fal.run/fal-ai/veo3');
    expect(calls[0].options.method).toBe('POST');
    expect(calls[0].options.headers.Authorization).toBe(`Key ${KEY}`);
    expect(JSON.parse(calls[0].options.body)).toEqual({ prompt: 'a cat' });
    // Status and result are GET with auth; result is the final call.
    expect(calls).toHaveLength(4); // submit + 2 status polls + result
    expect(calls[1].options.method ?? 'GET').toBe('GET');
    expect(calls[1].options.headers.Authorization).toBe(`Key ${KEY}`);
    expect(calls[2].url).toBe(statusUrl);
    expect(calls[2].options.headers.Authorization).toBe(`Key ${KEY}`);
    expect(calls[3].url).toBe(responseUrl);
  });

  it('falls back to app-id based status/result URLs when submit omits convenience URLs', async () => {
    const { fetchFn } = makeFetchLog();
    fetchFn.mockImplementation(async (url: string) => {
      if (url === 'https://queue.fal.run/fal-ai/flux/dev') {
        return jsonResponse({ request_id: 'req-9' }, 202);
      }
      if (url === 'https://queue.fal.run/fal-ai/flux/requests/req-9/status') {
        return jsonResponse({ status: 'COMPLETED' }, 200);
      }
      if (url === 'https://queue.fal.run/fal-ai/flux/requests/req-9') {
        return jsonResponse({ video: { url: 'https://fal.media/x.mp4' } }, 200);
      }
      throw new Error(`unexpected url ${url}`);
    });

    const outcome = await runFalQueueLifecycle({
      endpoint: 'fal-ai/flux/dev',
      apiKey: KEY,
      payload: {},
      fetchFn,
      sleep: async () => {},
    });
    expect(outcome.ok).toBe(true);
  });

  it('passes through upstream non-2xx submit status and body without fabricating success', async () => {
    const raw = '{"detail":"Exhausted balance: add credits"}';
    const { fetchFn } = makeFetchLog();
    fetchFn.mockResolvedValue(new Response(raw, { status: 402 }));

    const outcome = await runFalQueueLifecycle({
      endpoint: 'fal-ai/veo3',
      apiKey: KEY,
      payload: {},
      fetchFn,
      sleep: async () => {},
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.stage).toBe('submit');
      expect(outcome.status).toBe(402);
      expect(outcome.body).toBe(raw);
      expect(outcome.url).toBe('https://queue.fal.run/fal-ai/veo3');
    }
  });

  it('passes through non-2xx status polls (e.g. 404 request not found)', async () => {
    const { fetchFn } = makeFetchLog();
    fetchFn.mockImplementation(async (url: string) => {
      if (url.includes('/requests/')) return new Response('{"detail":"not found"}', { status: 404 });
      return jsonResponse({ request_id: 'req-gone' }, 202);
    });

    const outcome = await runFalQueueLifecycle({
      endpoint: 'fal-ai/veo3',
      apiKey: KEY,
      payload: {},
      fetchFn,
      sleep: async () => {},
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.stage).toBe('status');
      expect(outcome.status).toBe(404);
      expect(outcome.body).toBe('{"detail":"not found"}');
      expect(outcome.requestId).toBe('req-gone');
    }
  });

  it('passes through non-2xx result responses (model error 422) without fabricating success', async () => {
    const detail = '{"detail":[{"msg":"prompt too long"}]}';
    const { fetchFn } = makeFetchLog();
    fetchFn.mockImplementation(async (url: string) => {
      if (url.endsWith('/status')) return jsonResponse({ status: 'COMPLETED' }, 200);
      if (url.includes('/requests/')) return new Response(detail, { status: 422 });
      return jsonResponse({ request_id: 'req-bad' }, 202);
    });

    const outcome = await runFalQueueLifecycle({
      endpoint: 'fal-ai/veo3',
      apiKey: KEY,
      payload: {},
      fetchFn,
      sleep: async () => {},
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.stage).toBe('result');
      expect(outcome.status).toBe(422);
      expect(outcome.body).toBe(detail);
      expect(outcome.requestId).toBe('req-bad');
    }
  });

  it('never treats an unknown queue status value as success', async () => {
    const { fetchFn } = makeFetchLog();
    fetchFn.mockImplementation(async (url: string) => {
      if (url.endsWith('/status')) return jsonResponse({ status: 'WEIRD_STATE' }, 200);
      return jsonResponse({ request_id: 'req-weird' }, 202);
    });

    const outcome = await runFalQueueLifecycle({
      endpoint: 'fal-ai/veo3',
      apiKey: KEY,
      payload: {},
      fetchFn,
      sleep: async () => {},
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.stage).toBe('status');
      expect(outcome.status).toBe(200);
      expect(outcome.body).toContain('WEIRD_STATE');
    }
  });

  it('reports timeout with the request_id instead of fabricating a result', async () => {
    const { fetchFn } = makeFetchLog();
    fetchFn.mockImplementation(async (url: string) => {
      if (url.endsWith('/status')) return jsonResponse({ status: 'IN_PROGRESS' }, 202);
      return jsonResponse({ request_id: 'req-slow' }, 202);
    });

    const outcome = await runFalQueueLifecycle({
      endpoint: 'fal-ai/veo3',
      apiKey: KEY,
      payload: {},
      fetchFn,
      sleep: async () => {},
      pollIntervalMs: 10,
      timeoutMs: 25,
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.stage).toBe('timeout');
      expect(outcome.status).toBeNull();
      expect(outcome.requestId).toBe('req-slow');
    }
  });

  it('fails closed when submit returns 2xx without a request_id', async () => {
    const { fetchFn } = makeFetchLog();
    fetchFn.mockResolvedValue(jsonResponse({ hello: 'world' }, 202));

    const outcome = await runFalQueueLifecycle({
      endpoint: 'fal-ai/veo3',
      apiKey: KEY,
      payload: {},
      fetchFn,
      sleep: async () => {},
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.stage).toBe('invalid');
      expect(outcome.status).toBe(202);
    }
  });
});
