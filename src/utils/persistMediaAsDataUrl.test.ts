import { describe, it, expect } from 'vitest';
import { bufferToDataUrl, guessMimeFromUrl, persistRemoteUrlAsDataUrl } from './persistMediaAsDataUrl';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { AddressInfo } from 'net';

describe('persistMediaAsDataUrl (history durable copy)', () => {
  it('bufferToDataUrl matches OpenAI/fal data:image pattern', () => {
    // tiny 1x1 png
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    const url = bufferToDataUrl(png, 'image/png');
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    expect(url.length).toBeGreaterThan(40);
  });

  it('guessMimeFromUrl falls back sensibly', () => {
    expect(guessMimeFromUrl('https://x/a.jpg', null)).toBe('image/jpeg');
    expect(guessMimeFromUrl('https://x/a.png', 'application/octet-stream')).toBe('image/png');
    expect(guessMimeFromUrl('https://x/a.mp4', '')).toBe('video/mp4');
  });

  it('persistRemoteUrlAsDataUrl downloads fixture bytes into data URL', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(png);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    try {
      const dataUrl = await persistRemoteUrlAsDataUrl(`http://127.0.0.1:${port}/fixture.png`);
      expect(dataUrl).toBeTruthy();
      expect(dataUrl!.startsWith('data:image/png;base64,')).toBe(true);
      // Simulate history item url field
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
  });
});
