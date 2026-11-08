// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetManagerModal, isLocalOnlyAsset, type AssetDeleteResult } from './AssetManagerModal';
import type { GenerationHistoryItem } from '../types/providers';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const DELETED_KEY = 'comfycanvas_deleted_assets_v2';
const UPLOADS_KEY = 'comfycanvas_user_assets_v2';
const noop = () => {};

const item = (id: string, n: number): GenerationHistoryItem =>
  ({ id, url: `/media/${id}.png`, imageUrl: `/media/${id}.png`, prompt: `雨夜霓虹街道 ${n}，赛博朋克风格，广角构图`, model: 'm', provider: 'p', timestamp: n }) as GenerationHistoryItem;
const SERVER_ITEMS = [item('h-1', 1), item('h-2', 2)];

/** `upload-…` assets are local-only (browser library, never in server history): deleting them must not call the server. */
const UPLOAD = { id: 'upload-1700000000000-abcde', url: 'https://example.test/local.png', type: 'image', title: '本地参考图', prompt: '外部导入素材: local.png', provider: '本地导入', model: '本地图像参考资产', timestamp: 3, isReference: true };

const blacklist = (): string[] => JSON.parse(localStorage.getItem(DELETED_KEY) || '[]');
const storedUploads = (): Array<{ id: string }> => JSON.parse(localStorage.getItem(UPLOADS_KEY) || '[]');

describe('AssetManagerModal delete honesty', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

  const render = async (props: {
    history?: GenerationHistoryItem[];
    onDeleteAsset?: (id: string, url?: string) => Promise<AssetDeleteResult>;
    onDeleteBatchAssets?: (ids: string[]) => Promise<AssetDeleteResult>;
  }) => {
    await act(async () => {
      root.render(
        <AssetManagerModal
          isOpen
          onClose={noop}
          history={props.history ?? SERVER_ITEMS}
          onAddToCanvasAsFrame={noop}
          onUseAsReference={noop}
          onPreviewImage={noop}
          onDeleteAsset={props.onDeleteAsset ?? (async () => ({ ok: true }))}
          onDeleteBatchAssets={props.onDeleteBatchAssets}
        />,
      );
    });
    await flush();
  };

  const cardDeleteButtons = () => Array.from(document.querySelectorAll('button[title="从资产库彻底删除"]')) as HTMLButtonElement[];
  /** Visible-asset count from the header stat (card buttons are hidden in multi-select mode). */
  const assetCount = () => Number(/共 (\d+) 项/.exec(document.querySelector('#asset-manager-title')?.parentElement?.textContent || '')?.[1] ?? NaN);
  const errorBanner = () => document.querySelector('[data-testid="asset-delete-error"]')?.textContent || '';
  const clickByText = async (text: string | RegExp) => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => (typeof text === 'string' ? b.textContent?.trim() === text : text.test(b.textContent || ''))) as HTMLButtonElement;
    expect(btn, String(text)).toBeDefined();
    await act(async () => { btn.click(); });
    await flush();
  };
  const deleteFirstCard = async () => {
    await act(async () => { cardDeleteButtons()[0].click(); });
    await flush();
  };
  const batchDeleteAll = async () => {
    await clickByText('批量操作');
    await clickByText(/全选当前/);
    await clickByText(/彻底批量删除/);
  };
  const hasPromptOf = (n: number) => document.body.textContent?.includes(`雨夜霓虹街道 ${n}，`) ?? false;

  describe('local-only vs server-backed ids', () => {
    it('only ids starting with `upload-` are local-only; history ids are server-backed', () => {
      expect(isLocalOnlyAsset({ id: UPLOAD.id })).toBe(true);
      expect(isLocalOnlyAsset({ id: 'upload-1' })).toBe(true);
      expect(isLocalOnlyAsset({ id: 'h-1' })).toBe(false);
      expect(isLocalOnlyAsset({ id: 'hist_1700000000000_ab12c' })).toBe(false);
      expect(isLocalOnlyAsset({ id: 'my-upload-1' })).toBe(false);
    });
  });

  describe('single delete (server-backed asset)', () => {
    it('thrown error: item stays visible, id/url are NOT blacklisted, the real HTTP status + body is shown', async () => {
      const onDeleteAsset = vi.fn(async () => { throw new Error('HTTP 500: disk write failed: EACCES'); });
      await render({ onDeleteAsset });
      expect(assetCount()).toBe(2);
      await deleteFirstCard();
      expect(onDeleteAsset).toHaveBeenCalledTimes(1);
      expect(assetCount()).toBe(2);
      expect(hasPromptOf(1) && hasPromptOf(2)).toBe(true);
      expect(blacklist()).toEqual([]);
      expect(errorBanner()).toContain('HTTP 500: disk write failed: EACCES');
      expect(errorBanner()).toContain('服务器未确认删除');
    });

    it('{ ok:false, error }: item stays visible, nothing blacklisted, the real error text is shown', async () => {
      const onDeleteAsset = vi.fn(async (): Promise<AssetDeleteResult> => ({ ok: false, error: new Error('HTTP 503: history store locked') }));
      await render({ onDeleteAsset });
      await deleteFirstCard();
      expect(assetCount()).toBe(2);
      expect(blacklist()).toEqual([]);
      expect(errorBanner()).toContain('HTTP 503: history store locked');
    });

    it.each([
      ['false', false],
      ['undefined', undefined],
      ['an arbitrary truthy non-result', 'ok'],
    ])('resolved %s is not a confirmation: item stays visible, nothing blacklisted, error shown', async (_label, resolved) => {
      const onDeleteAsset = vi.fn(async () => resolved as unknown as AssetDeleteResult);
      await render({ onDeleteAsset });
      await deleteFirstCard();
      expect(assetCount()).toBe(2);
      expect(blacklist()).toEqual([]);
      expect(errorBanner()).toContain('服务器未确认删除');
      expect(errorBanner()).toContain(`onDeleteAsset 返回 ${String(resolved)}`);
    });

    it('confirmed delete: item is hidden and id + url are persisted in the blacklist; no error shown', async () => {
      const onDeleteAsset = vi.fn(async (): Promise<AssetDeleteResult> => ({ ok: true }));
      await render({ onDeleteAsset });
      await deleteFirstCard();
      expect(assetCount()).toBe(1);
      expect(onDeleteAsset).toHaveBeenCalledTimes(1);
      const [deletedId, deletedUrl] = onDeleteAsset.mock.calls[0] as unknown as [string, string];
      expect(hasPromptOf(Number(deletedId.slice(2)))).toBe(false);
      expect(blacklist()).toEqual(expect.arrayContaining([deletedId, deletedUrl]));
      expect(errorBanner()).toBe('');
    });

    it('a failed delete can be retried: the item is still there and a later confirmed delete blacklists it', async () => {
      const onDeleteAsset = vi.fn<(id: string, url?: string) => Promise<AssetDeleteResult>>()
        .mockRejectedValueOnce(new Error('HTTP 502: bad gateway'))
        .mockResolvedValueOnce({ ok: true });
      await render({ onDeleteAsset });
      await deleteFirstCard();
      expect(blacklist()).toEqual([]);
      expect(errorBanner()).toContain('HTTP 502: bad gateway');
      await deleteFirstCard();
      expect(assetCount()).toBe(1);
      expect(blacklist().length).toBeGreaterThan(0);
      expect(errorBanner()).toBe('');
    });

    it('declined confirm(): nothing is sent, hidden or blacklisted', async () => {
      vi.stubGlobal('confirm', vi.fn(() => false));
      const onDeleteAsset = vi.fn(async (): Promise<AssetDeleteResult> => ({ ok: true }));
      await render({ onDeleteAsset });
      await deleteFirstCard();
      expect(onDeleteAsset).not.toHaveBeenCalled();
      expect(assetCount()).toBe(2);
      expect(blacklist()).toEqual([]);
    });
  });

  describe('single delete (local-only `upload-` asset)', () => {
    beforeEach(() => {
      localStorage.setItem(UPLOADS_KEY, JSON.stringify([UPLOAD]));
    });

    it('is removed locally without calling the server, and enters the blacklist', async () => {
      const onDeleteAsset = vi.fn(async (): Promise<AssetDeleteResult> => { throw new Error('server must not be called for upload-'); });
      await render({ history: [], onDeleteAsset });
      expect(assetCount()).toBe(1);
      await deleteFirstCard();
      expect(onDeleteAsset).not.toHaveBeenCalled();
      expect(assetCount()).toBe(0);
      expect(blacklist()).toEqual(expect.arrayContaining([UPLOAD.id, UPLOAD.url]));
      expect(storedUploads().map((a) => a.id)).not.toContain(UPLOAD.id);
      expect(errorBanner()).toBe('');
    });
  });

  describe('batch delete with onDeleteBatchAssets', () => {
    it('thrown error: both items stay visible, nothing blacklisted, the real status + body is shown, selection is kept', async () => {
      const onDeleteBatchAssets = vi.fn(async () => { throw new Error('HTTP 500: batch write failed: ENOSPC'); });
      await render({ onDeleteBatchAssets });
      await batchDeleteAll();
      expect(onDeleteBatchAssets).toHaveBeenCalledTimes(1);
      expect([...(onDeleteBatchAssets.mock.calls[0] as unknown as [string[]])[0]].sort()).toEqual(['h-1', 'h-2']);
      expect(assetCount()).toBe(2);
      expect(blacklist()).toEqual([]);
      expect(errorBanner()).toContain('HTTP 500: batch write failed: ENOSPC');
      expect(errorBanner()).toContain('2 项服务器未确认删除');
      expect(document.body.textContent).toContain('已选中');
    });

    it('{ ok:false, error } and resolved false are failures too', async () => {
      const onDeleteBatchAssets = vi.fn<(ids: string[]) => Promise<AssetDeleteResult>>()
        .mockResolvedValueOnce({ ok: false, error: new Error('HTTP 429: slow down') })
        .mockResolvedValueOnce(false as unknown as AssetDeleteResult);
      await render({ onDeleteBatchAssets });
      await batchDeleteAll();
      expect(assetCount()).toBe(2);
      expect(blacklist()).toEqual([]);
      expect(errorBanner()).toContain('HTTP 429: slow down');
      await clickByText(/彻底批量删除/);
      expect(assetCount()).toBe(2);
      expect(blacklist()).toEqual([]);
      expect(errorBanner()).toContain('服务器未确认删除');
      expect(errorBanner()).toContain('onDeleteBatchAssets 返回 false');
    });

    it('confirmed delete: both items are hidden, ids + urls are persisted, selection mode ends', async () => {
      const onDeleteBatchAssets = vi.fn(async (): Promise<AssetDeleteResult> => ({ ok: true }));
      await render({ onDeleteBatchAssets });
      await batchDeleteAll();
      expect(assetCount()).toBe(0);
      expect(blacklist()).toEqual(expect.arrayContaining(['h-1', 'h-2', '/media/h-1.png', '/media/h-2.png']));
      expect(errorBanner()).toBe('');
    });

    it('mixed selection: the server only receives server-backed ids; upload- is removed locally even when the server delete fails', async () => {
      localStorage.setItem(UPLOADS_KEY, JSON.stringify([UPLOAD]));
      const onDeleteBatchAssets = vi.fn(async () => { throw new Error('HTTP 500: nope'); });
      await render({ onDeleteBatchAssets });
      expect(assetCount()).toBe(3);
      await batchDeleteAll();
      expect([...(onDeleteBatchAssets.mock.calls[0] as unknown as [string[]])[0]].sort()).toEqual(['h-1', 'h-2']);
      expect(assetCount()).toBe(2);
      expect(blacklist().sort()).toEqual([UPLOAD.id, UPLOAD.url].sort());
      expect(storedUploads().map((a) => a.id)).not.toContain(UPLOAD.id);
      expect(errorBanner()).toContain('HTTP 500: nope');
      expect(errorBanner()).toContain('另有 1 项已删除');
    });

    it('upload-only selection never calls the server', async () => {
      localStorage.setItem(UPLOADS_KEY, JSON.stringify([UPLOAD]));
      const onDeleteBatchAssets = vi.fn(async (): Promise<AssetDeleteResult> => ({ ok: true }));
      const onDeleteAsset = vi.fn(async (): Promise<AssetDeleteResult> => ({ ok: true }));
      await render({ history: [], onDeleteAsset, onDeleteBatchAssets });
      await batchDeleteAll();
      expect(onDeleteBatchAssets).not.toHaveBeenCalled();
      expect(onDeleteAsset).not.toHaveBeenCalled();
      expect(assetCount()).toBe(0);
      expect(blacklist()).toEqual(expect.arrayContaining([UPLOAD.id, UPLOAD.url]));
    });
  });

  describe('batch delete without onDeleteBatchAssets (onDeleteAsset per id)', () => {
    it('every call rejects: all items stay visible, nothing blacklisted, each real error is shown', async () => {
      const onDeleteAsset = vi.fn(async (id: string): Promise<AssetDeleteResult> => { throw new Error(`HTTP 500: cannot delete ${id}`); });
      await render({ onDeleteAsset });
      await batchDeleteAll();
      expect(onDeleteAsset).toHaveBeenCalledTimes(2);
      expect(assetCount()).toBe(2);
      expect(blacklist()).toEqual([]);
      expect(errorBanner()).toContain('HTTP 500: cannot delete h-1');
      expect(errorBanner()).toContain('HTTP 500: cannot delete h-2');
    });

    it('partial failure: only the confirmed id is hidden/blacklisted, the failed one stays with its real error', async () => {
      const onDeleteAsset = vi.fn(async (id: string): Promise<AssetDeleteResult> => (id === 'h-2' ? { ok: false, error: new Error('HTTP 404: h-2 not found') } : { ok: true }));
      await render({ onDeleteAsset });
      await batchDeleteAll();
      expect(onDeleteAsset).toHaveBeenCalledTimes(2);
      expect(assetCount()).toBe(1);
      expect(hasPromptOf(2)).toBe(true);
      expect(hasPromptOf(1)).toBe(false);
      expect(blacklist().sort()).toEqual(['/media/h-1.png', 'h-1']);
      expect(errorBanner()).toContain('HTTP 404: h-2 not found');
      expect(errorBanner()).toContain('另有 1 项已删除');
    });

    it('resolved false for one id is a failure: that item stays visible and is not blacklisted', async () => {
      const onDeleteAsset = vi.fn(async (id: string) => (id === 'h-1' ? false : { ok: true }) as unknown as AssetDeleteResult);
      await render({ onDeleteAsset });
      await batchDeleteAll();
      expect(assetCount()).toBe(1);
      expect(hasPromptOf(1)).toBe(true);
      expect(blacklist()).not.toContain('h-1');
      expect(blacklist()).not.toContain('/media/h-1.png');
      expect(errorBanner()).toContain('服务器未确认删除');
    });

    it('all confirmed: both items are hidden and blacklisted', async () => {
      const onDeleteAsset = vi.fn(async (): Promise<AssetDeleteResult> => ({ ok: true }));
      await render({ onDeleteAsset });
      await batchDeleteAll();
      expect(onDeleteAsset).toHaveBeenCalledTimes(2);
      expect(assetCount()).toBe(0);
      expect(blacklist()).toEqual(expect.arrayContaining(['h-1', 'h-2', '/media/h-1.png', '/media/h-2.png']));
      expect(errorBanner()).toBe('');
    });
  });
});
