import { describe, it, expect, vi } from 'vitest';
import {
  bufferToDataUrl,
  guessMimeFromUrl,
  isAlreadyDurableHistoryUrl,
  isUndersizedHistoryImageDataUrl,
  getDataUrlImageDimensions,
  persistRemoteUrlAsDataUrl,
  persistRemoteUrlAsDataUrlResult,
  requireDurableHistoryMediaUrl,
} from './persistMediaAsDataUrl';
import http from 'http';
import { AddressInfo } from 'net';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Valid 3×3 PNG — large enough to count as a durable history thumb. */
const REAL_THUMB_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAMAAAADCAIAAADZSiLoAAAAEElEQVR4nGP4z8AAQQxYWACPjgj4kWPEuQAAAABJRU5ErkJggg==',
  'base64',
);

describe('persistMediaAsDataUrl (history durable copy)', () => {
  it('bufferToDataUrl matches OpenAI/fal data:image pattern', () => {
    const url = bufferToDataUrl(TINY_PNG, 'image/png');
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    expect(url.length).toBeGreaterThan(40);
  });

  it('guessMimeFromUrl falls back sensibly', () => {
    expect(guessMimeFromUrl('https://x/a.jpg', null)).toBe('image/jpeg');
    expect(guessMimeFromUrl('https://x/a.png', 'application/octet-stream')).toBe('image/png');
    expect(guessMimeFromUrl('https://x/a.mp4', '')).toBe('video/mp4');
  });

  it('isAlreadyDurableHistoryUrl recognizes data: and same-origin paths', () => {
    expect(isAlreadyDurableHistoryUrl('data:image/png;base64,abc')).toBe(true);
    expect(isAlreadyDurableHistoryUrl('/media/local.png')).toBe(true);
    expect(isAlreadyDurableHistoryUrl('https://imgen.x.ai/tmp/a.png')).toBe(false);
    expect(isAlreadyDurableHistoryUrl('//cdn.example/a.png')).toBe(false);
  });

  it('rejects 1×1 data URL as undersized (fal stub thumb)', async () => {
    const oneByOne = bufferToDataUrl(TINY_PNG, 'image/png');
    expect(getDataUrlImageDimensions(oneByOne)).toEqual({ width: 1, height: 1 });
    expect(isUndersizedHistoryImageDataUrl(oneByOne)).toBe(true);
    const r = await requireDurableHistoryMediaUrl(oneByOne);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toMatch(/2×2|2x2|pixels/i);
      expect(r.errorSource).toBe('local');
      expect(r.stack).toContain('not a durable history thumbnail');
    }
  });

  it('accepts real 3×3 data URL as durable', async () => {
    const real = bufferToDataUrl(REAL_THUMB_PNG, 'image/png');
    expect(getDataUrlImageDimensions(real)).toEqual({ width: 3, height: 3 });
    expect(isUndersizedHistoryImageDataUrl(real)).toBe(false);
    const r = await requireDurableHistoryMediaUrl(real);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.dataUrl).toBe(real);
  });

  it('persistRemoteUrlAsDataUrl downloads fixture bytes into data URL', async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(TINY_PNG);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    try {
      const dataUrl = await persistRemoteUrlAsDataUrl(`http://127.0.0.1:${port}/fixture.png`);
      expect(dataUrl).toBeTruthy();
      expect(dataUrl!.startsWith('data:image/png;base64,')).toBe(true);
      const historyItem = { url: dataUrl!, provider: 'Civitai 官方原生' };
      expect(historyItem.url.startsWith('data:')).toBe(true);
      expect(historyItem.url.includes('orchestration')).toBe(false);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it('already-data URLs pass through', async () => {
    const d = 'data:image/jpeg;base64,abc';
    expect(await persistRemoteUrlAsDataUrl(d)).toBe(d);
    const r = await persistRemoteUrlAsDataUrlResult(d);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.dataUrl).toBe(d);
  });
});

/**
 * Contract for grok_compat (and other remote generate→history) success path:
 * persist before recordHistoryItem; never store expiring https as history.url.
 * Does NOT hit live imgen.x.ai / paid generate — local fixture server only.
 */
describe('requireDurableHistoryMediaUrl (grok history write contract)', () => {
  type FailOut = {
    status: 500;
    body: { error: string; errorSource: string; persistErrorSource: string; persistStatus?: number; persistRawResponse?: string; persistStack?: string; persistCause?: unknown; transientMediaUrl: string };
    historyUrl: null;
    responseImageUrl: null;
  };
  type OkOut = {
    status: 200;
    body: { imageUrl: string; mediaUrl: string; historyItem: { url: string; provider: string } };
    historyUrl: string;
    responseImageUrl: string;
  };

  async function simulateGrokHistoryWrite(remoteUrl: string): Promise<FailOut | OkOut> {
    const durable = await requireDurableHistoryMediaUrl(remoteUrl);
    if (!durable.ok) {
      const body: FailOut['body'] = {
        error: `Grok 兼容中转图像已生成，但无法下载并持久化为本地历史副本（data URL）: ${durable.message}`,
        errorSource: 'storage',
        persistErrorSource: durable.errorSource,
        transientMediaUrl: remoteUrl,
      };
      if (durable.status != null) body.persistStatus = durable.status;
      if (durable.rawResponse !== undefined) body.persistRawResponse = durable.rawResponse;
      if (durable.stack) body.persistStack = durable.stack;
      if (durable.cause !== undefined) body.persistCause = durable.cause;
      return { status: 500, body, historyUrl: null, responseImageUrl: null };
    }
    const historyItem = { url: durable.dataUrl, provider: 'Grok 兼容中转' };
    return {
      status: 200,
      body: { imageUrl: durable.dataUrl, mediaUrl: durable.dataUrl, historyItem },
      historyUrl: historyItem.url,
      responseImageUrl: durable.dataUrl,
    };
  }

  it('success path: persist called and history/response URL is data:image (not remote https)', async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(REAL_THUMB_PNG);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    const remote = `http://127.0.0.1:${port}/imgen-like/tmp.png`;
    try {
      const out = await simulateGrokHistoryWrite(remote);
      expect(out.status).toBe(200);
      if (out.status !== 200) throw new Error('expected 200');
      expect(out.historyUrl.startsWith('data:image/')).toBe(true);
      expect(out.responseImageUrl.startsWith('data:image/')).toBe(true);
      expect(out.historyUrl.includes('127.0.0.1')).toBe(false);
      expect(out.historyUrl.includes('imgen')).toBe(false);
      expect(out.body.historyItem.url).toBe(out.historyUrl);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it('persist failure (HTTP 403): does not store remote URL; surfaces status + body', async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden: signed URL expired');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    const remote = `http://127.0.0.1:${port}/imgen.x.ai/expired.png`;
    try {
      const out = await simulateGrokHistoryWrite(remote);
      expect(out.status).toBe(500);
      if (out.status !== 500) throw new Error('expected 500');
      expect(out.historyUrl).toBeNull();
      expect(out.responseImageUrl).toBeNull();
      expect(out.body.transientMediaUrl).toBe(remote);
      expect(out.body.persistStatus).toBe(403);
      expect(out.body.errorSource).toBe('storage');
      expect(out.body.persistErrorSource).toBe('upstream');
      expect(out.body.persistRawResponse).toBe('Forbidden: signed URL expired');
      expect(out.body.persistStack).toContain('HTTP 403');
      expect(out.body.error).toMatch(/403/);
      expect(out.body.error).toMatch(/Forbidden|expired|持久化/i);
      // Must not pretend success with remote URL in history
      expect(JSON.stringify(out)).not.toMatch(/"url":\s*"http:\/\/127\.0\.0\.1/);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it('persistRemoteUrlAsDataUrlResult returns status+message on 403', async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end('{"error":"denied"}');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    try {
      const r = await persistRemoteUrlAsDataUrlResult(`http://127.0.0.1:${port}/x`);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.status).toBe(403);
        expect(r.message).toContain('403');
        expect(r.message).toContain('denied');
        expect(r.rawResponse).toBe('{"error":"denied"}');
        expect(r.errorSource).toBe('upstream');
        expect(r.stack).toContain('HTTP 403');
      }
      expect(await persistRemoteUrlAsDataUrl(`http://127.0.0.1:${port}/x`)).toBeNull();
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it('retains the complete long HTTP body and never logs signed URLs or response contents', async () => {
    const fullBody = `provider error: ${'x'.repeat(1800)} end-marker`;
    const server = http.createServer((_req, res) => {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end(fullBody);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const signedUrl = `http://127.0.0.1:${port}/private?signature=do-not-log`;
    try {
      const result = await persistRemoteUrlAsDataUrlResult(signedUrl);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(502);
        expect(result.rawResponse).toBe(fullBody);
        expect(result.message).toBe(`HTTP 502: ${fullBody}`);
        expect(result.errorSource).toBe('upstream');
      }
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it('labels a fetch exception as network and retains its stack and cause without inventing HTTP status', async () => {
    const originalFetch = globalThis.fetch;
    const networkError = Object.assign(new Error('fixture connection reset'), {code: 'ECONNRESET'});
    globalThis.fetch = vi.fn().mockRejectedValue(networkError);
    try {
      const result = await persistRemoteUrlAsDataUrlResult('https://media.invalid/fixture');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBeUndefined();
        expect(result.errorSource).toBe('network');
        expect(result.stack).toContain('fixture connection reset');
        expect(result.cause).toMatchObject({message: 'fixture connection reset', code: 'ECONNRESET'});
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('same-origin path passes through without fetch', async () => {
    const r = await requireDurableHistoryMediaUrl('/uploads/local-durable.png');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.dataUrl).toBe('/uploads/local-durable.png');
  });
});
