import { describe, it, expect, vi } from 'vitest';
import { handleCivitaiModels } from './civitaiModelRoutes';

describe('Civitai Model Routes NSFW Defaults', () => {
  it('defaults nsfw to "true" when query parameter is omitted', async () => {
    let capturedUrl = '';
    const mockFetch = vi.fn().mockImplementation(async (_meta, url: string) => {
      capturedUrl = url;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ items: [], metadata: {} }),
        json: async () => ({ items: [], metadata: {} }),
      };
    });

    const handler = handleCivitaiModels({
      getSettings: () => ({}),
      defaultKeys: {},
      upstreamFetch: mockFetch,
    });

    const req: any = {
      query: { query: 'anime' },
      headers: {},
      path: '/api/civitai/models',
    };
    const res: any = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };

    await handler(req, res);

    expect(capturedUrl).toContain('nsfw=true');
    expect(res.json).toHaveBeenCalled();
  });

  it('honors explicit nsfw="false" when passed by user', async () => {
    let capturedUrl = '';
    const mockFetch = vi.fn().mockImplementation(async (_meta, url: string) => {
      capturedUrl = url;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ items: [], metadata: {} }),
        json: async () => ({ items: [], metadata: {} }),
      };
    });

    const handler = handleCivitaiModels({
      getSettings: () => ({}),
      defaultKeys: {},
      upstreamFetch: mockFetch,
    });

    const req: any = {
      query: { query: 'anime', nsfw: 'false' },
      headers: {},
      path: '/api/civitai/models',
    };
    const res: any = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };

    await handler(req, res);

    expect(capturedUrl).toContain('nsfw=false');
  });
});
