/**
 * @vitest-environment jsdom
 */
import React, { act } from 'react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { seedStatement, historySeedRowText, historySeedUpstreamMissingNote, historySeedStatement } from './historyParameters';
import { noteUserModelSelection } from '../services/userModelSelection';
import { clearSharedGet } from '../services/sharedGet';
import App from '../App';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('fix16 history card polish', () => {
  const histSrc = readFileSync(join(__dirname, '../components/HistoryModal.tsx'), 'utf8');



  it('#4 未发送 fold rows do not repeat fold-title suffix', () => {
    const unrecStart = histSrc.indexOf('function UnrecordedFold');
    const unrecEnd = histSrc.indexOf('export type UnsupportedRow');
    const unrecFn = histSrc.slice(unrecStart, unrecEnd);
    expect(unrecFn).toContain("return '—'");
    expect(unrecFn).not.toContain('historyParameterSourceLabel(size.source)');
    expect(unrecFn).not.toContain('formatResolvedHistoryParameter(resolved[k])');
    const unsupStart = histSrc.indexOf('const UnsupportedFold');
    const unsupEnd = histSrc.indexOf('interface HistoryModalProps');
    const unsup = histSrc.slice(unsupStart, unsupEnd);
    expect(unsup).not.toContain('HISTORY_UNSUPPORTED_LABEL');
  });
});

// fix16 #5, as behavior: while HistoryModal is open an ordinary error toast is not repeated on top of it, but an error
// the history card cannot show (alwaysVisible, e.g. a failed delete) stays visible. Mounts the real App (React act() env).
describe('fix16 #5 HistoryModal open suppresses duplicate error toast, not alwaysVisible ones', () => {
  const ITEMS = [{ id: 'h-1', url: '/media/one.png', imageUrl: '/media/one.png', prompt: '雨夜霓虹街道，赛博朋克风格，广角构图', model: 'm', provider: 'p', timestamp: 1 }];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  let host: HTMLDivElement; let root: Root;

  beforeEach(() => {
    clearSharedGet(); localStorage.clear();
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async (input: any, init?: RequestInit) => {
      const target = String(input); const method = (init?.method || 'GET').toUpperCase();
      if (target.startsWith('/api/model-schema')) return json({ error: 'schema key rejected' }, 401);
      if (target.startsWith('/api/history') && method === 'GET') return json({ items: ITEMS, total: 1, limit: 24, offset: 0, hasMore: false, counts: { output: 1, failed: 0, all: 1 } });
      if (target.startsWith('/api/history')) return new Response('disk write failed: EACCES', { status: 500 });
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => { root.unmount(); });
    host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); clearSharedGet(); document.body.innerHTML = '';
  });

  const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  const toast = () => document.querySelector('[data-testid="toast-container"]');
  const failSchemaSelect = async (model: string) => { await act(async () => { await noteUserModelSelection('together', model)?.catch(() => {}); }); await flush(); };
  const click = async (el: Element | undefined) => { expect(el).toBeDefined(); await act(async () => { (el as HTMLElement).click(); }); await flush(); };

  it('ordinary error toast shows with history closed, is hidden while history is open; a failed delete stays visible', async () => {
    await act(async () => { root.render(<App />); });
    await flush();

    await failSchemaSelect('black-forest-labs/FLUX.1-schnell');
    expect(toast()?.textContent).toContain('schema key rejected'); // control: the same trigger is visible without the modal

    await click(Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === '历史'));
    expect(document.querySelector('[role="dialog"][aria-labelledby="history-modal-title"]')).not.toBeNull();
    expect(toast()).toBeNull();

    await failSchemaSelect('black-forest-labs/FLUX.1-dev'); // a new, ordinary (non-alwaysVisible) error while the modal is open
    expect(toast()).toBeNull();
    // Suppressed, not lost: closing the modal shows the very same error (the toast state was set all along).
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    await flush();
    expect(document.querySelector('[role="dialog"][aria-labelledby="history-modal-title"]')).toBeNull();
    expect(toast()?.textContent).toContain('schema key rejected');

    await click(Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === '历史')); // reopening clears the stale error toast
    expect(toast()).toBeNull();
    await click(document.querySelector('button[title="删除此项记录"]') ?? undefined);
    expect(toast()?.textContent).toContain('资产删除失败');
    expect(toast()?.textContent).toContain('HTTP 500: disk write failed: EACCES');
    expect(document.querySelectorAll('button[title="删除此项记录"]')).toHaveLength(1); // item restored: the toast is the only place the failure shows
  });
});
