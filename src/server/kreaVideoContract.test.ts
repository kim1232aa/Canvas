// Krea video URL contract.
// Official page opened 2026-11-07: https://www.krea.ai/docs/api-reference/video/wan-30
// Live OpenAPI https://api.krea.ai/openapi.json (server https://api.krea.ai):
//   POST /generate/video/alibaba/wan-3.0  summary "Wan 3.0"
// Image operations stay on /generate/image/{provider}/{model} (e.g. /generate/image/bfl/flux-1-dev).
import express from 'express';
import { describe, expect, it } from 'vitest';
import { registerSchemaProviderRoutes } from './schemaProviders';

const openApi = {
  openapi: '3.1.0',
  servers: [{ url: 'https://api.krea.ai' }],
  paths: {
    '/generate/video/alibaba/wan-3.0': {
      post: {
        summary: 'Wan 3.0',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] } } } },
      },
    },
    '/generate/image/bfl/flux-1-dev': {
      post: {
        summary: 'Flux.1 Dev',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] } } } },
      },
    },
  },
};

function appWith(fetchImpl: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const app = express();
  app.use(express.json());
  registerSchemaProviderRoutes(app as any, {
    fetch: async (_m: any, url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return fetchImpl(url, init);
    },
    key: () => 'krea-test-key',
    record: (i: any) => i,
    durable: async (u: string) => ({ ok: true, dataUrl: u }),
  } as any);
  return { app, calls };
}

async function submit(app: express.Express, body: unknown) {
  const server = app.listen(0);
  try {
    const port = (server.address() as any).port;
    const res = await fetch(`http://127.0.0.1:${port}/api/schema-provider/krea/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json: any;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, json, text };
  } finally {
    await new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve()));
  }
}

describe('Krea video endpoint contract', () => {
  it('POSTs the verified Wan 3.0 video URL and leaves image requests on the image path', async () => {
    const { app, calls } = appWith((url, init) => {
      if (init?.method === 'POST' && url.endsWith('/generate/video/alibaba/wan-3.0')) {
        return new Response(JSON.stringify({ job_id: 'job-wan-30', status: 'queued' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (init?.method === 'POST' && url.endsWith('/generate/image/bfl/flux-1-dev')) {
        return new Response(JSON.stringify({ job_id: 'job-flux', status: 'queued' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/openapi.json')) return new Response(JSON.stringify(openApi), { status: 200, headers: { 'Content-Type': 'application/json' } });
      return new Response('unexpected ' + url, { status: 500 });
    });

    const video = await submit(app, { model: 'video/alibaba/wan-3.0', prompt: 'a paper boat on a red lake', isVideo: true });
    expect(video.status).toBe(200);
    expect(video.json.actualRequest.endpoint).toBe('https://api.krea.ai/generate/video/alibaba/wan-3.0');
    const videoPost = calls.find((c) => c.init?.method === 'POST' && String(c.url).includes('wan-3.0'));
    expect(videoPost?.url).toBe('https://api.krea.ai/generate/video/alibaba/wan-3.0');

    const image = await submit(app, { model: 'image/bfl/flux-1-dev', prompt: 'a paper boat on a red lake' });
    expect(image.status).toBe(200);
    expect(image.json.actualRequest.endpoint).toBe('https://api.krea.ai/generate/image/bfl/flux-1-dev');
    const imagePost = calls.find((c) => c.init?.method === 'POST' && String(c.url).includes('flux-1-dev'));
    expect(imagePost?.url).toBe('https://api.krea.ai/generate/image/bfl/flux-1-dev');
    expect(calls.filter((c) => c.init?.method === 'POST').map((c) => c.url)).not.toContain('https://api.krea.ai/generate/alibaba/wan-3.0');
  });

  it('returns the real upstream status and verbatim body when the video POST fails, with no rewritten error', async () => {
    const upstreamBody = '{"error":"wan-3.0 rejected: duration 99 is outside 2..30","code":"invalid_duration"}';
    const { app, calls } = appWith((url, init) => {
      if (init?.method === 'POST') return new Response(upstreamBody, { status: 422, headers: { 'Content-Type': 'application/json' } });
      if (url.endsWith('/openapi.json')) return new Response(JSON.stringify(openApi), { status: 200, headers: { 'Content-Type': 'application/json' } });
      return new Response('unexpected ' + url, { status: 500 });
    });
    const video = await submit(app, { model: 'video/alibaba/wan-3.0', prompt: 'a paper boat on a red lake', isVideo: true, duration: 99 });
    expect(video.status).toBe(422);
    // rawResponse is the upstream body verbatim. The outer JSON string escapes quotes, so the check is the field, not a raw substring of the envelope.
    expect(video.json.rawResponse).toBe(upstreamBody);
    expect(video.json.endpoint).toBe('https://api.krea.ai/generate/video/alibaba/wan-3.0');
    expect(video.json.error).toContain('HTTP 422');
    expect(video.json.error).toContain(upstreamBody);
    expect(calls.filter((c) => c.init?.method === 'POST')).toHaveLength(1);
    expect(calls.find((c) => c.init?.method === 'POST')?.url).toBe('https://api.krea.ai/generate/video/alibaba/wan-3.0');
  });

  it('when the catalog GET fails, a video request still uses /generate/video/{provider}/{model} and the catalog failure is verbatim', async () => {
    const catalogBody = '<!DOCTYPE html><title>Attention Required! | Cloudflare</title>';
    const { app, calls } = appWith((_url, init) => {
      if (init?.method === 'POST') return new Response('{"job_id":"job-after-catalog-fail","status":"queued"}', { status: 202, headers: { 'Content-Type': 'application/json' } });
      return new Response(catalogBody, { status: 403, headers: { 'Content-Type': 'text/html' } });
    });
    const video = await submit(app, { model: 'alibaba/wan-3.0', prompt: 'a paper boat on a red lake', isVideo: true });
    expect(video.status).toBe(202);
    expect(calls.find((c) => c.init?.method === 'POST')?.url).toBe('https://api.krea.ai/generate/video/alibaba/wan-3.0');
    expect(video.json.actualRequest.endpoint).toBe('https://api.krea.ai/generate/video/alibaba/wan-3.0');
    expect(JSON.stringify(video.json.actualRequest.catalogLookupFailure)).toContain('Attention Required');
    expect(video.json.actualRequest.catalogLookupFailure.upstreamStatus).toBe(403);

    const image = await submit(app, { model: 'image/bfl/flux-1-dev', prompt: 'a paper boat on a red lake' });
    expect(image.json.actualRequest.endpoint).toBe('https://api.krea.ai/generate/image/bfl/flux-1-dev');
  });
});
