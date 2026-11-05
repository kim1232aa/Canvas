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

  it('uses 600s budget with backoff cadence and surfaces workflowId + errorSource local on timeout', async () => {
    vi.useFakeTimers();
    vi.mocked(tracedFetch).mockImplementation(async (url) => {
      if (String(url).includes('/generate')) {
        return new Response(JSON.stringify({ pending: true, workflowId: 'wf-video-123' }));
      }
      if (String(url).includes('/workflow/wf-video-123')) {
        return new Response(JSON.stringify({ status: 'processing', mediaUrl: null }));
      }
      return new Response(JSON.stringify({}));
    });

    const pending = new CivitaiDriver().generate(
      { model: 'civitai:video@1', prompt: 'cat running', isVideo: true } as any,
      {}
    );

    const promise = expect(pending).rejects.toThrow(
      /Civitai 视频任务仍未完成，已达到本地等待上限 \(600s\)；工作流 ID: wf-video-123 \(errorSource: local\)/
    );
    await vi.runAllTimersAsync();
    await promise;
  });
});
