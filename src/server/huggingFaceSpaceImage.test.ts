import { describe, expect, it, vi } from 'vitest';
import { readHuggingFaceSpaceImageResponse } from './huggingFaceSpaceImage';

describe('Hugging Face Z-Image Space image response', () => {
  it('preserves upstream HTTP status and body instead of accepting the artifact URL as an image', async () => {
    const text = vi.fn().mockResolvedValue('private artifact unavailable');
    const arrayBuffer = vi.fn();
    const result = await readHuggingFaceSpaceImageResponse({
      ok: false,
      status: 403,
      headers: new Headers(),
      text,
      arrayBuffer,
    }, 'https://space.example/file.png');

    expect(result).toEqual({
      ok: false,
      kind: 'http',
      status: 403,
      contentType: null,
      body: 'private artifact unavailable',
      endpoint: 'https://space.example/file.png',
    });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('rejects a successful HTML response as an upstream protocol error', async () => {
    const result = await readHuggingFaceSpaceImageResponse({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      text: vi.fn(),
      arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode('<html>not an image</html>').buffer),
    }, 'https://space.example/file.png');

    expect(result).toEqual({
      ok: false,
      kind: 'protocol',
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<html>not an image</html>',
      bodyBase64: Buffer.from('<html>not an image</html>').toString('base64'),
      endpoint: 'https://space.example/file.png',
    });
  });

  it('rejects a missing content type instead of inventing image/png', async () => {
    const result = await readHuggingFaceSpaceImageResponse({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: vi.fn(),
      arrayBuffer: vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer),
    }, 'https://space.example/file');

    expect(result).toMatchObject({
      ok: false,
      kind: 'protocol',
      status: 200,
      contentType: null,
      bodyBase64: 'AQID',
      endpoint: 'https://space.example/file',
    });
  });

  it('rejects an empty image body', async () => {
    const result = await readHuggingFaceSpaceImageResponse({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/png' }),
      text: vi.fn(),
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
    }, 'https://space.example/empty.png');

    expect(result).toMatchObject({
      ok: false,
      kind: 'protocol',
      status: 200,
      contentType: 'image/png',
      body: '',
      bodyBase64: '',
      endpoint: 'https://space.example/empty.png',
    });
  });

  it('decodes a successful image response and keeps its endpoint and MIME type', async () => {
    const bytes = Uint8Array.from([1, 2, 3]).buffer;
    const result = await readHuggingFaceSpaceImageResponse({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/webp' }),
      text: vi.fn(),
      arrayBuffer: vi.fn().mockResolvedValue(bytes),
    }, 'https://space.example/file.webp');

    expect(result).toEqual({
      ok: true,
      dataUrl: 'data:image/webp;base64,AQID',
      endpoint: 'https://space.example/file.webp',
    });
  });
});
