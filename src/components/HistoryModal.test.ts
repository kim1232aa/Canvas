import { describe, it, expect } from 'vitest';
import { displayValue } from './HistoryModal';

describe('Y1-UI History empty fields display 「未填写」', () => {
  it('displays 「未填写」 for null, undefined, empty strings, and null/undefined literals', () => {
    expect(displayValue(null)).toBe('未填写');
    expect(displayValue(undefined)).toBe('未填写');
    expect(displayValue('')).toBe('未填写');
    expect(displayValue('   ')).toBe('未填写');
    expect(displayValue('null')).toBe('未填写');
    expect(displayValue('undefined')).toBe('未填写');
    expect(displayValue(NaN)).toBe('未填写');
  });

  it('preserves valid values including 0 for seed/numbers, never converting null to 0 or 0 to 未填写', () => {
    // 0 is a valid seed, must NOT be turned into '未填写' or blank
    expect(displayValue(0)).toBe(0);
    expect(displayValue(0)).not.toBe('未填写');

    // null must NOT be displayed as 0
    expect(displayValue(null)).not.toBe(0);
    expect(displayValue(null)).toBe('未填写');

    // Numbers and strings pass through
    expect(displayValue(42)).toBe(42);
    expect(displayValue(7.5)).toBe(7.5);
    expect(displayValue('fal-ai/flux/dev')).toBe('fal-ai/flux/dev');
    expect(displayValue('a cybernetic cat')).toBe('a cybernetic cat');
  });

  it('formats steps and cfg correctly when null vs defined', () => {
    const formatSteps = (steps: number | null | undefined) =>
      steps != null ? `${steps} 步` : '未填写';

    expect(formatSteps(null)).toBe('未填写');
    expect(formatSteps(undefined)).toBe('未填写');
    expect(formatSteps(28)).toBe('28 步');

    expect(displayValue(null)).toBe('未填写');
    expect(displayValue(3.5)).toBe(3.5);
  });
});

import {
  filterHistory,
  historyFilterCounts,
  historyFilterCountLabel,
  historyFailStatusText,
  historyFailFirstLine,
  HISTORY_FILTERS,
  resolveHistoryItemForApply,
} from './HistoryModal';
import type { GenerationHistoryItem } from '../types/providers';

function item(partial: Partial<GenerationHistoryItem> & { id: string }): GenerationHistoryItem {
  return {
    prompt: '',
    timestamp: Date.now(),
    provider: 'test',
    model: 'm',
    url: '',
    ...partial,
  } as GenerationHistoryItem;
}

describe('fix17 history filter + fail fold helpers', () => {
  const out = item({ id: 'o1', url: 'https://x/a.png' });
  const fail = item({
    id: 'f1',
    status: 'failed',
    upstreamStatus: 429,
    upstreamStatusText: 'Too Many Requests',
    upstreamResponseBody: '{"message":"insufficient balance\\nretry later"}',
  });
  const blocked = item({
    id: 'b1',
    status: 'local_blocked',
    statusLabel: '未出站，本地拦截',
    error: 'field blocked\nsecond',
  });
  const hist = [out, fail, blocked];

  it('HISTORY_FILTERS is 全部 / 已出图 / 失败', () => {
    expect(HISTORY_FILTERS.map(([k, l]) => [k, l])).toEqual([
      ['all', '全部'],
      ['output', '已出图'],
      ['failed', '失败'],
    ]);
  });

  it('historyFilterCounts: all = output + failed, counts match list lengths', () => {
    const c = historyFilterCounts(hist);
    expect(c).toEqual({ all: 3, output: 1, failed: 2, schema: 0 });
    expect(filterHistory(hist, 'all')).toHaveLength(c.all);
    expect(filterHistory(hist, 'output')).toHaveLength(c.output);
    expect(filterHistory(hist, 'failed')).toHaveLength(c.failed);
    expect(filterHistory(hist, 'output').every((i) => !!i.url)).toBe(true);
    expect(filterHistory(hist, 'failed').every((i) => !i.url || i.status === 'failed' || i.status === 'local_blocked')).toBe(true);
    expect(filterHistory(hist, 'failed').map((i) => i.id)).toEqual(['f1', 'b1']);
  });

  it('historyFailStatusText uses HTTP code / local label, no rewrite', () => {
    expect(historyFailStatusText(fail)).toBe('HTTP 429 Too Many Requests');
    expect(historyFailStatusText(blocked)).toBe('未出站，本地拦截');
    expect(historyFailStatusText(item({ id: 'n', status: 'failed', networkError: { message: 'x', cause: null } }))).toBe('网络错误（无状态码）');
  });

  it('historyFailFirstLine is first line of upstream original, verbatim', () => {
    expect(historyFailFirstLine(fail)).toBe('insufficient balance');
    expect(historyFailFirstLine(blocked)).toBe('field blocked');
    const raw = item({
      id: 'r',
      status: 'failed',
      upstreamResponseBody: 'plain first\nplain second',
    });
    expect(historyFailFirstLine(raw)).toBe('plain first');
  });
});


import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { HistoryModal } from './HistoryModal';

describe('HistoryModal server pagination (load more)', () => {
  it('shows load-more when hasMore+onLoadMore; click calls onLoadMore (not client slice)', () => {
    let calls = 0;
    const onLoadMore = () => { calls += 1; };
    const items = [
      item({ id: 'a', url: 'https://x/a.png', prompt: 'one' }),
      item({ id: 'b', url: 'https://x/b.png', prompt: 'two' }),
    ];
    // renderToStaticMarkup cannot fire clicks — assert button presence + label with totals
    const html = renderToStaticMarkup(
      React.createElement(HistoryModal, {
        isOpen: true,
        onClose: () => {},
        history: items,
        hasMore: true,
        historyTotal: 190,
        loadingMore: false,
        onLoadMore,
        onApplyPrompt: () => {},
        onDeleteItem: () => {},
        onClearAll: () => {},
      }),
    );
    expect(html).toContain('data-testid="history-load-more"');
    expect(html).toContain('已加载 2 / 共 190');
    expect(html).toContain('data-testid="history-page-meta"');
  });

  it('hides load-more when hasMore is false', () => {
    const html = renderToStaticMarkup(
      React.createElement(HistoryModal, {
        isOpen: true,
        onClose: () => {},
        history: [item({ id: 'a', url: 'https://x/a.png' })],
        hasMore: false,
        historyTotal: 1,
        onLoadMore: () => {},
        onApplyPrompt: () => {},
        onDeleteItem: () => {},
        onClearAll: () => {},
      }),
    );
    expect(html).not.toContain('data-testid="history-load-more"');
  });

  it('filter count shows 已载 when historyTotal > history.length', () => {
    const items = [
      item({ id: 'a', url: 'https://x/a.png', prompt: 'one' }),
      item({ id: 'b', status: 'failed', upstreamStatus: 500, prompt: 'two' }),
    ];
    const html = renderToStaticMarkup(
      React.createElement(HistoryModal, {
        isOpen: true,
        onClose: () => {},
        history: items,
        hasMore: true,
        historyTotal: 190,
        loadingMore: false,
        onLoadMore: () => {},
        onApplyPrompt: () => {},
        onDeleteItem: () => {},
        onClearAll: () => {},
      }),
    );
    expect(html).toContain('data-testid="history-filter-count-all"');
    expect(html).toContain('已载 2');
    expect(html).toContain('全部');
    // header badges clarify loaded-only
    expect(html).toContain('（已载）');
    // plain 「全部 2」 style must NOT appear as bare number alone looking like total
    expect(html).not.toMatch(/history-filter-count-all">2</);
  });

  it('filter count is plain number when all loaded', () => {
    const items = [item({ id: 'a', url: 'https://x/a.png' })];
    const html = renderToStaticMarkup(
      React.createElement(HistoryModal, {
        isOpen: true,
        onClose: () => {},
        history: items,
        hasMore: false,
        historyTotal: 1,
        onLoadMore: () => {},
        onApplyPrompt: () => {},
        onDeleteItem: () => {},
        onClearAll: () => {},
      }),
    );
    expect(html).toMatch(/history-filter-count-all">1</);
    expect(html).not.toContain('已载 1');
    expect(html).not.toContain('（已载）');
  });

  it('load-more wrap is outside scroll panel (sibling footer)', () => {
    const html = renderToStaticMarkup(
      React.createElement(HistoryModal, {
        isOpen: true,
        onClose: () => {},
        history: [item({ id: 'a', url: 'https://x/a.png' })],
        hasMore: true,
        historyTotal: 50,
        onLoadMore: () => {},
        onApplyPrompt: () => {},
        onDeleteItem: () => {},
        onClearAll: () => {},
      }),
    );
    expect(html).toContain('data-testid="history-load-more"');
    expect(html).toContain('data-testid="history-load-more-wrap"');
    // wrap is sticky footer: shrink-0 + border-t; not nested after grid inside overflow-y-auto only
    const wrapIdx = html.indexOf('data-testid="history-load-more-wrap"');
    const wrapSlice = html.slice(Math.max(0, wrapIdx - 120), wrapIdx + 80);
    expect(wrapSlice).toContain('shrink-0');
    // scroll panel closes before load-more wrap (overflow-y-auto div ends, then wrap)
    const scrollIdx = html.indexOf('overflow-y-auto');
    expect(scrollIdx).toBeGreaterThan(-1);
    expect(wrapIdx).toBeGreaterThan(scrollIdx);
  });
});

describe('historyFilterCountLabel', () => {
  it('returns 已载 N when total > loaded or hasMore', () => {
    expect(historyFilterCountLabel(24, { historyTotal: 190, historyLength: 24, hasMore: true })).toBe('已载 24');
    expect(historyFilterCountLabel(3, { historyTotal: 190, historyLength: 24 })).toBe('已载 3');
    expect(historyFilterCountLabel(21, { historyLength: 24, hasMore: true })).toBe('已载 21');
  });

  it('returns plain count when fully loaded', () => {
    expect(historyFilterCountLabel(24, { historyTotal: 24, historyLength: 24, hasMore: false })).toBe('24');
    expect(historyFilterCountLabel(5, { historyLength: 5 })).toBe('5');
  });
});


describe('resolveHistoryItemForApply', () => {
  it('fetches full record when hasWorkflowSnapshot and snapshot body missing', async () => {
    const slim = item({ id: 'hist_full', url: 'https://x/a.png', hasWorkflowSnapshot: true } as any);
    const full = {
      ...slim,
      workflowSnapshot: { nodes: [{ id: 'n1', type: 'SaveImage' }], connections: [] },
    };
    const fetchFn = async (id: string) => {
      expect(id).toBe('hist_full');
      return full as any;
    };
    const out = await resolveHistoryItemForApply(slim as any, fetchFn);
    expect(out.workflowSnapshot).toEqual(full.workflowSnapshot);
  });

  it('keeps slim item when fetch fails (no pretend restore)', async () => {
    const slim = item({ id: 'hist_fail', url: 'https://x/a.png', hasWorkflowSnapshot: true } as any);
    const out = await resolveHistoryItemForApply(slim as any, async () => {
      throw new Error('network');
    });
    expect(out).toBe(slim);
    expect((out as any).workflowSnapshot).toBeUndefined();
  });

  it('does not fetch when snapshot already present', async () => {
    let called = 0;
    const withSnap = item({
      id: 'hist_has',
      url: 'https://x/a.png',
      workflowSnapshot: { nodes: [], connections: [] },
      hasWorkflowSnapshot: true,
    } as any);
    const out = await resolveHistoryItemForApply(withSnap as any, async () => {
      called += 1;
      return withSnap as any;
    });
    expect(called).toBe(0);
    expect(out).toBe(withSnap);
  });
});
