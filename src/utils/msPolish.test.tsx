import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import run1137 from './__fixtures__/modelscopeSuccess1137.json';
import { UpstreamExchanges, upstreamGroupHint, SCROLL_X_VISIBLE } from '../components/HistoryModal';

const item: any = run1137;
const html = renderToStaticMarkup(<UpstreamExchanges item={item} />);

describe('ms-polish layout (real run 1137)', () => {
  it('1/7 visible 8px horizontal scrollbar + bottom padding on raw lines and URLs (incl. sub-segments)', () => {
    expect(SCROLL_X_VISIBLE).toContain('[scrollbar-width:auto]');
    expect(SCROLL_X_VISIBLE).toContain('[&::-webkit-scrollbar]:h-2');
    expect(SCROLL_X_VISIBLE).toContain('pb-2');
    const urls = html.match(/data-testid="history-upstream-url"/g) || [];
    expect(urls.length).toBe(11);
    expect(html).not.toMatch(/class="[^"]*truncate[^"]*" data-testid="history-upstream-url"/);
  });
  it('3 upstream section has same padded box as the JSON block', () => {
    expect(html).toMatch(/class="mt-1\.5 rounded bg-black\/30 p-2[^"]*" data-testid="history-upstream-exchanges"/);
  });
  it('5/6 folded hint follows state and never wraps', () => {
    expect(upstreamGroupHint(false)).toBe('（响应相同，点开逐段查看）');
    expect(upstreamGroupHint(true)).toBe('（响应相同，收起）');
    expect(html).toContain('点开逐段查看');
    expect(html).toMatch(/whitespace-nowrap[^"]*" data-testid="history-upstream-group-hint"/);
  });
  it('8 time smaller and dimmer than status word', () => {
    expect(html).toMatch(/text-\[11px\] text-slate-300" data-testid="history-upstream-time"/);
  });
  it('9 folded row has border, tint and arrow', () => {
    expect(html).toMatch(/bg-sky-950\/30 p-2 border border-sky-800\/60" data-testid="history-upstream-group"/);
    expect(html).toContain('data-testid="history-upstream-group-arrow">▸');
  });
});
