import { describe, expect, it } from 'vitest';
import { normalizeGeneratedImages, persistGeneratedImages } from './multiImageHistory';

const ok = async (url: string) => ({ ok: true as const, dataUrl: `/api/media/${encodeURIComponent(url).slice(0, 12)}` });

describe('normalizeGeneratedImages', () => {
  it('keeps every image with its own MIME type, seed and model', () => {
    const images = normalizeGeneratedImages([
      { b64_json: 'AAAA', output_format: 'jpeg', seed: 1 },
      { b64_json: 'BBBB' },
      { url: 'https://cdn.test/two.webp', seed: 2, model: 'm2' },
      'https://cdn.test/three.png',
      { inlineData: { mimeType: 'image/webp', data: 'CCCC' } },
    ], { outputFormat: 'webp' });
    expect(images.map((i) => i.url)).toEqual([
      'data:image/jpeg;base64,AAAA',
      'data:image/webp;base64,BBBB',
      'https://cdn.test/two.webp',
      'https://cdn.test/three.png',
      'data:image/webp;base64,CCCC',
    ]);
    expect(images.map((i) => i.seed)).toEqual([1, null, 2, null, null]);
    expect(images[2].model).toBe('m2');
  });

  it('marks entries without url or base64 as missing instead of dropping them', () => {
    expect(normalizeGeneratedImages([{ foo: 1 }])).toEqual([{ url: '', seed: null, index: 0 }]);
  });
});

describe('persistGeneratedImages', () => {
  const metadata = { prompt: 'p', provider: 'P', model: 'm' };

  it('persists every image exactly once, including the second one', async () => {
    const recorded: any[] = [];
    const result = await persistGeneratedImages(['https://a/1.png', 'https://a/2.png', 'https://a/3.png'], metadata, {
      persist: ok,
      record: async (item) => { recorded.push(item); return { id: `h${recorded.length}`, ...item }; },
    });
    expect(recorded.map((r) => r.imageIndex)).toEqual([0, 1, 2]);
    expect(result.historyItems).toHaveLength(3);
    expect(result.first?.id).toBe('h1');
    expect(result.transientOutputs).toEqual([]);
  });

  it('keeps successes and reports per-image media and history failures as storage, not network', async () => {
    const result = await persistGeneratedImages(['https://a/1.png', 'https://a/2.png', 'https://a/3.png', ''], metadata, {
      persist: async (url) => url.endsWith('2.png') ? { ok: false, message: 'download 503', errorSource: 'upstream', status: 503 } : ok(url),
      record: async (item) => { if (item.imageIndex === 2) throw new Error('disk full'); return { id: `h${item.imageIndex}`, ...item }; },
    });
    expect(result.historyItems.map((i: any) => i.id)).toEqual(['h0']);
    expect(result.transientOutputs).toEqual([
      expect.objectContaining({ index: 1, url: 'https://a/2.png', stage: 'media', errorSource: 'upstream', status: 503 }),
      expect.objectContaining({ index: 2, stage: 'history', errorSource: 'storage', error: 'disk full', mediaUrl: expect.stringMatching(/^\/api\/media\//) }),
      expect.objectContaining({ index: 3, stage: 'response', errorSource: 'upstream' }),
    ]);
    expect(result.historyWarning).toMatch(/3/);
  });

  it('uses per-image seed and model when the upstream returns them', async () => {
    const recorded: any[] = [];
    await persistGeneratedImages([{ url: 'https://a/1.png', seed: 7 }, { url: 'https://a/2.png', seed: 8, model: 'other' }], metadata, {
      persist: ok,
      record: async (item) => { recorded.push(item); return item as any; },
    });
    expect(recorded.map((r) => [r.seed, r.actualModel])).toEqual([[7, 'm'], [8, 'other']]);
  });

  it('skips only the caller-persisted first image and still saves the second', async () => {
    const recorded: any[] = [];
    const result = await persistGeneratedImages(['https://a/1.png', 'https://a/2.png'], metadata, {
      persist: ok,
      record: async (item) => { recorded.push(item); return item as any; },
    }, { skipIndexes: [0] });
    expect(recorded.map((r) => r.imageIndex)).toEqual([1]);
    expect(result.historyItems).toHaveLength(1);
  });

  it('survives persist rejection without crashing the loop and preserves remaining images', async () => {
    const result = await persistGeneratedImages(['https://a/fail.png', 'https://a/ok.png'], metadata, {
      persist: async (url) => {
        if (url.includes('fail')) throw new Error('disk failure ENOSPC');
        return ok(url);
      },
      record: async (item) => ({ id: `h${item.imageIndex}`, ...item }),
    });
    expect(result.historyItems).toHaveLength(1);
    expect(result.first?.id).toBe('h1');
    expect(result.transientOutputs).toHaveLength(1);
    expect(result.transientOutputs[0]).toMatchObject({
      index: 0,
      url: 'https://a/fail.png',
      stage: 'media',
      error: 'disk failure ENOSPC',
      errorSource: 'local',
    });
  });
});
