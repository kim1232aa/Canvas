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
import { applyHistoryToCanvas } from './utils/applyHistoryToCanvas';

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
  let historyResponseItems: any[] = ITEMS;

  beforeEach(async () => {
    const actual = await vi.importActual<typeof import('./services/api')>('./services/api');
    apiMocks.deleteHistoryItem.mockReset().mockImplementation(actual.deleteHistoryItem);
    apiMocks.deleteHistoryBatch.mockReset().mockImplementation(actual.deleteHistoryBatch);
    apiMocks.clearHistory.mockReset().mockImplementation(actual.clearHistory);
    localStorage.clear();
    historyResponseItems = ITEMS;
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
    deleteRoutes = () => json({ success: true });
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async (input: any, init?: RequestInit) => {
      const target = String(input);
      const method = (init?.method || 'GET').toUpperCase();
      if (target.startsWith('/api/history') && method === 'GET') {
        return json({ items: historyResponseItems, total: historyResponseItems.length, limit: 24, offset: 0, hasMore: false, counts: { output: historyResponseItems.length, failed: 0, all: historyResponseItems.length } });
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

  const openAssetManager = async () => {
    await act(async () => { root!.render(<App />); });
    await flush();
    await clickByText('更多');
    await clickByText('资产库');
  };
  const assetCardDeleteButtons = () => Array.from(document.querySelectorAll('button[title="从资产库彻底删除"]')) as HTMLButtonElement[];
  const assetBlacklist = (): string[] => JSON.parse(localStorage.getItem('comfycanvas_deleted_assets_v2') || '[]');
  const assetDeleteError = () => document.querySelector('[data-testid="asset-delete-error"]')?.textContent || '';
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

  it('history apply click restores the rendered video node from the full history record', async () => {
    historyResponseItems = [{ id: 'video-1', url: '/media/v.mp4', videoUrl: '/media/v.mp4', mediaType: 'video', prompt: 'moving robot', model: 'old', provider: 'tensorart', timestamp: 3, hasWorkflowSnapshot: true }];
    const full = { id: 'video-1', url: '/media/v.mp4', videoUrl: '/media/v.mp4', mediaType: 'video', prompt: 'moving robot', actualModel: 'new', actualProvider: 'tensorart', timestamp: 3, workflowSnapshot: { nodes: [{ id: 'video', type: 'AIVideoNode', title: 'AI Video', pos: { x: 0, y: 0 }, inputs: [], outputs: [], width: 340, values: { model: 'old', steps: 4, fps: 8 } }], connections: [] }, requestMetadata: { actualParameters: { model: 'new', steps: 25, fps: 16 } } };
    vi.stubGlobal('fetch', vi.fn(async (input: any, init?: RequestInit) => {
      const target = String(input);
      if (target === '/api/history/video-1' && (!init?.method || init.method === 'GET')) return json(full);
      if (target.startsWith('/api/history') && (!init?.method || init.method === 'GET')) return json({ items: historyResponseItems, total: historyResponseItems.length, limit: 24, offset: 0, hasMore: false, counts: { output: historyResponseItems.length, failed: 0, all: historyResponseItems.length } });
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    await openHistory();
    await clickByText('照这组参数再来一张');
    expect(document.getElementById('node-video')).toBeTruthy();
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

  describe('asset library blacklist (comfycanvas_deleted_assets_v2) follows the server result', () => {
    it('single delete: HTTP 500 keeps the asset visible, does NOT blacklist it, shows the real status + body in the toast and in the library', async () => {
      deleteRoutes = () => new Response('disk write failed: EACCES', { status: 500 });
      await openAssetManager();
      expect(assetCardDeleteButtons()).toHaveLength(2);
      await act(async () => { assetCardDeleteButtons()[0].click(); });
      await flush();
      expect(apiMocks.deleteHistoryItem).toHaveBeenCalled();
      expect(assetCardDeleteButtons()).toHaveLength(2);
      expect(assetBlacklist()).toEqual([]);
      expect(toastText()).toContain('资产删除失败');
      expect(toastText()).toContain('HTTP 500: disk write failed: EACCES');
      expect(assetDeleteError()).toContain('HTTP 500: disk write failed: EACCES');
    });

    it('single delete: a resolved false is a failure too (asset stays, not blacklisted, error shown)', async () => {
      apiMocks.deleteHistoryItem.mockResolvedValue(false);
      await openAssetManager();
      await act(async () => { assetCardDeleteButtons()[1].click(); });
      await flush();
      expect(assetCardDeleteButtons()).toHaveLength(2);
      expect(assetBlacklist()).toEqual([]);
      expect(toastText()).toContain('服务器未确认删除');
      expect(assetDeleteError()).toContain('服务器未确认删除');
    });

    it('single delete: a server-confirmed delete hides the asset and persists its id + url in the blacklist', async () => {
      await openAssetManager();
      await act(async () => { assetCardDeleteButtons()[0].click(); });
      await flush();
      expect(assetCardDeleteButtons()).toHaveLength(1);
      expect(toastText()).toContain('资产已删除');
      expect(assetDeleteError()).toBe('');
      const blacklisted = assetBlacklist();
      expect(blacklisted.some((v) => v === 'h-1' || v === 'h-2')).toBe(true);
      expect(blacklisted.some((v) => v.startsWith('/media/'))).toBe(true);
    });

    it('batch delete: HTTP 500 keeps every asset visible and out of the blacklist, with the real error in the toast and in the library', async () => {
      deleteRoutes = () => new Response('batch write failed: ENOSPC', { status: 500 });
      await batchDeleteAllFromAssetManager();
      expect(apiMocks.deleteHistoryBatch).toHaveBeenCalledWith(['h-2', 'h-1']);
      expect(assetBlacklist()).toEqual([]);
      expect(toastText()).toContain('HTTP 500: batch write failed: ENOSPC');
      expect(assetDeleteError()).toContain('HTTP 500: batch write failed: ENOSPC');
      expect(document.querySelector('#asset-manager-title')?.parentElement?.textContent).toContain('共 2 项');
    });

    it('batch delete: a server-confirmed delete hides every asset and persists ids + urls in the blacklist', async () => {
      await batchDeleteAllFromAssetManager();
      expect(assetDeleteError()).toBe('');
      expect(assetBlacklist()).toEqual(expect.arrayContaining(['h-1', 'h-2', '/media/one.png', '/media/two.png']));
      expect(document.querySelector('#asset-manager-title')?.parentElement?.textContent).toContain('共 0 项');
    });
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
