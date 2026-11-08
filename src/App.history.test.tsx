/**
 * @vitest-environment jsdom
 */
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

const apiMocks = vi.hoisted(() => ({
  deleteHistoryItem: vi.fn(),
  deleteHistoryBatch: vi.fn(),
  clearHistory: vi.fn(),
}));

vi.mock('./services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./services/api')>();
  return { ...actual, ...apiMocks };
});

import App from './App';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const ITEMS = [
  { id: 'h-1', url: '/media/one.png', imageUrl: '/media/one.png', prompt: '雨夜霓虹街道，赛博朋克风格，广角构图', model: 'm', provider: 'p', timestamp: 1 },
  { id: 'h-2', url: '/media/two.png', imageUrl: '/media/two.png', prompt: '清晨山间薄雾，水墨风格，远景构图', model: 'm', provider: 'p', timestamp: 2 },
];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('App history delete honesty', () => {
  let host: HTMLDivElement | null = null;
  let root: Root | null = null;
  let deleteRoutes: (path: string, method: string) => Response;

  beforeEach(async () => {
    const actual = await vi.importActual<typeof import('./services/api')>('./services/api');
    apiMocks.deleteHistoryItem.mockReset().mockImplementation(actual.deleteHistoryItem);
    apiMocks.deleteHistoryBatch.mockReset().mockImplementation(actual.deleteHistoryBatch);
    apiMocks.clearHistory.mockReset().mockImplementation(actual.clearHistory);
    localStorage.clear();
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
    deleteRoutes = () => json({ success: true });
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async (input: any, init?: RequestInit) => {
      const target = String(input);
      const method = (init?.method || 'GET').toUpperCase();
      if (target.startsWith('/api/history') && method === 'GET') {
        return json({ items: ITEMS, total: ITEMS.length, limit: 24, offset: 0, hasMore: false, counts: { output: ITEMS.length, failed: 0, all: ITEMS.length } });
      }
      if (target.startsWith('/api/history') && method !== 'GET') return deleteRoutes(target, method);
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    if (root) await act(async () => { root?.unmount(); });
    root = null;
    host?.remove();
    host = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

  const openHistory = async () => {
    await act(async () => { root!.render(<App />); });
    await flush();
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === '历史') as HTMLButtonElement;
    expect(btn).toBeDefined();
    await act(async () => { btn.click(); });
    await flush();
  };

  const clickByText = async (text: string | RegExp) => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => (typeof text === 'string' ? b.textContent?.trim() === text : text.test(b.textContent || ''))) as HTMLButtonElement;
    expect(btn, String(text)).toBeDefined();
    await act(async () => { btn.click(); });
    await flush();
  };

  const batchDeleteAllFromAssetManager = async () => {
    await act(async () => { root!.render(<App />); });
    await flush();
    await clickByText('更多');
    await clickByText('资产库');
    await clickByText('批量操作');
    await clickByText(/全选/);
    await clickByText(/彻底批量删除/);
  };

  const deleteButtons = () => Array.from(document.querySelectorAll('button[title="删除此项记录"]')) as HTMLButtonElement[];
  const clearButton = () => Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('清空历史')) as HTMLButtonElement;
  const toastText = () => document.querySelector('[data-testid="toast-container"]')?.textContent || '';
  const pageMeta = () => document.querySelector('[data-testid="history-page-meta"]')?.textContent || '';
  const outputCount = () => document.querySelector('[data-testid="history-output-count"]')?.textContent || '';

  it('single delete: HTTP 500 restores the item and shows the real status and body in an error toast', async () => {
    deleteRoutes = () => new Response('disk write failed: EACCES', { status: 500 });
    await openHistory();
    expect(deleteButtons()).toHaveLength(2);
    await act(async () => { deleteButtons()[0].click(); });
    await flush();
    expect(apiMocks.deleteHistoryItem).toHaveBeenCalledWith('h-1');
    expect(deleteButtons()).toHaveLength(2);
    expect(pageMeta()).toContain('共 2');
    expect(toastText()).toContain('资产删除失败');
    expect(toastText()).toContain('HTTP 500: disk write failed: EACCES');
    expect(toastText()).not.toContain('资产已删除');
  });

  it('single delete: a resolved false is a failure too (item restored, error toast, no success toast)', async () => {
    apiMocks.deleteHistoryItem.mockResolvedValue(false);
    await openHistory();
    await act(async () => { deleteButtons()[1].click(); });
    await flush();
    expect(deleteButtons()).toHaveLength(2);
    expect(pageMeta()).toContain('共 2');
    expect(toastText()).toContain('资产删除失败');
    expect(toastText()).toContain('服务器未确认删除');
    expect(toastText()).not.toContain('资产已删除');
  });

  it('single delete: success removes the item and shows the success toast only after the server confirmed', async () => {
    await openHistory();
    await act(async () => { deleteButtons()[0].click(); });
    await flush();
    expect(deleteButtons()).toHaveLength(1);
    expect(pageMeta()).toContain('共 1');
    expect(toastText()).toContain('资产已删除');
    expect(toastText()).not.toContain('资产删除失败');
  });

  it('clear history: HTTP 503 keeps the list and shows the real status and body', async () => {
    deleteRoutes = () => new Response('history store locked', { status: 503 });
    await openHistory();
    await act(async () => { clearButton().click(); });
    await flush();
    expect(deleteButtons()).toHaveLength(2);
    expect(outputCount()).toContain('2');
    expect(toastText()).toContain('历史记录清空失败');
    expect(toastText()).toContain('HTTP 503: history store locked');
    expect(toastText()).not.toContain('历史记录已清空');
  });

  it('clear history: a resolved false keeps the list and shows an error toast', async () => {
    apiMocks.clearHistory.mockResolvedValue(false);
    await openHistory();
    await act(async () => { clearButton().click(); });
    await flush();
    expect(deleteButtons()).toHaveLength(2);
    expect(toastText()).toContain('历史记录清空失败');
    expect(toastText()).toContain('服务器未确认清空');
    expect(toastText()).not.toContain('历史记录已清空');
  });

  it('clear history: success empties the list and shows the success toast', async () => {
    await openHistory();
    await act(async () => { clearButton().click(); });
    await flush();
    expect(deleteButtons()).toHaveLength(0);
    expect(toastText()).toContain('历史记录已清空');
  });

  it('batch delete: HTTP 500 shows the real status and body; the removed items are restored in the history list', async () => {
    deleteRoutes = () => new Response('batch write failed: ENOSPC', { status: 500 });
    await batchDeleteAllFromAssetManager();
    expect(apiMocks.deleteHistoryBatch).toHaveBeenCalledWith(['h-2', 'h-1']);
    expect(toastText()).toContain('批量资产删除失败');
    expect(toastText()).toContain('HTTP 500: batch write failed: ENOSPC');
    expect(toastText()).not.toContain('批量资产已删除');
    await clickByText('历史');
    expect(deleteButtons()).toHaveLength(2);
    expect(pageMeta()).toContain('共 2');
  });

  it('batch delete: a resolved false is a failure too (error toast, items restored, no success toast)', async () => {
    apiMocks.deleteHistoryBatch.mockResolvedValue(false);
    await batchDeleteAllFromAssetManager();
    expect(toastText()).toContain('批量资产删除失败');
    expect(toastText()).toContain('服务器未确认批量删除');
    expect(toastText()).not.toContain('批量资产已删除');
    await clickByText('历史');
    expect(deleteButtons()).toHaveLength(2);
    expect(pageMeta()).toContain('共 2');
  });

  it('batch delete: success removes the items and shows the success toast', async () => {
    await batchDeleteAllFromAssetManager();
    expect(toastText()).toContain('批量资产已删除');
    expect(toastText()).not.toContain('批量资产删除失败');
    await clickByText('历史');
    expect(deleteButtons()).toHaveLength(0);
  });

  it('api helpers: a 2xx body with success:false is rejected with the verbatim body', async () => {
    const actual = await vi.importActual<typeof import('./services/api')>('./services/api');
    deleteRoutes = () => json({ success: false, error: 'store read-only' });
    await expect(actual.deleteHistoryItem('h-1')).rejects.toThrow('store read-only');
    await expect(actual.deleteHistoryBatch(['h-1'])).rejects.toThrow('store read-only');
    await expect(actual.clearHistory()).rejects.toThrow('store read-only');
    deleteRoutes = () => new Response('nope', { status: 404 });
    await expect(actual.deleteHistoryItem('h-1')).rejects.toThrow('HTTP 404: nope');
  });
});
