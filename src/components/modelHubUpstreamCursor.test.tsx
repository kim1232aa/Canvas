// @vitest-environment jsdom
// Load-only UI 2026-11-04 (10b): Model Hub LoRA · Novita「加载更多模型」stayed at 100 — the load-more request carried no cursor.
// Fake network: page 1 returns next_cursor c_100 (official Novita pagination.next_cursor, relayed by /api/models), page 2 needs it.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelHubModal } from './ModelHubModal';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.unstubAllGlobals());

const row = (id: string) => ({ id, name: id, category: 'LoRA', type: 'LORA', provider: 'Novita', baseModel: 'SD 1.5', resourceKind: 'adapter' });

describe('Model Hub load-more follows upstream cursor', () => {
  it('second click requests cursor=c_100 and appends page 2', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: any) => {
      const url = String(input);
      if (!url.startsWith('/api/models')) return new Response('{}', { status: 200 });
      urls.push(url);
      const second = url.includes('cursor=c_100');
      const items = Array.from({ length: 3 }, (_, i) => row(`${second ? 'p2' : 'p1'}_${i}`));
      return new Response(JSON.stringify({ novita: items, _pagination: { novita: { page: 1, hasMore: true, paging: 'upstream-cursor', nextCursor: second ? 'c_200' : 'c_100' } } }), { status: 200 });
    }));
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => root.render(<ModelHubModal isOpen onClose={() => {}} onSelectModel={() => {}} initialCategory="lora" initialProvider="novita" />));
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    const btn = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('加载更多模型'));
    expect(btn).toBeTruthy();
    await act(async () => { btn!.click(); await new Promise((r) => setTimeout(r, 30)); });
    const novitaCalls = urls.filter((u) => u.includes('provider=novita'));
    expect(novitaCalls.at(-1)).toContain('cursor=c_100');
    expect(el.textContent).toContain('p2_0');
    root.unmount();
  });
});
