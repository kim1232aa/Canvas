import { afterEach, describe, expect, it, vi } from 'vitest';
import { CivitaiDriver } from './CivitaiDriver';
vi.mock('../../services/executionTrace', () => ({ tracedFetch: vi.fn() }));
import { tracedFetch } from '../../services/executionTrace';
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });

describe('Civitai pending result history', () => {
  it('saves every polled image, preserves zero seed, and does not hide partial storage failures', async () => {
    vi.useFakeTimers();
    const saved: any[] = [];
    vi.mocked(tracedFetch).mockImplementation(async (url, options) => {
      if (String(url).includes('/generate')) return new Response(JSON.stringify({ pending: true, workflowId: 'fixture', pendingHistory: { model: 'actual', prompt: 'a' } }));
      if (String(url).includes('/workflow/')) return new Response(JSON.stringify({ status: 'succeeded', mediaUrl: '/api/media/a', images: [{ url: '/api/media/a', seed: 0 }, { url: '/api/media/b', seed: 9 }], transientOutputs: [{ url: 'https://example.test/c', error: 'disk full' }], historyWarning: 'one media failed' }));
      saved.push(JSON.parse(options!.body as string));
      return new Response(JSON.stringify({ id: String(saved.length), ...saved.at(-1) }));
    });
    const pending = new CivitaiDriver().generate({ model: 'original', prompt: 'a' } as any, {});
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(saved.map(item => [item.url, item.seed])).toEqual([['/api/media/a', 0], ['/api/media/b', 9]]);
    expect(result.historyWarning).toContain('one media failed');
  });
});
