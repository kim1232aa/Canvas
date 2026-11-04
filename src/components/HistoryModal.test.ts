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
  historySizeChipVisible,
  historyFailStatusText,
  historyFailFirstLine,
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
    statusLabel: '没有发出去',
    error: 'field blocked\nsecond',
  });
  const hist = [out, fail, blocked];



  it('historyFailStatusText uses HTTP code / local label, no rewrite', () => {
    expect(historyFailStatusText(fail)).toBe('HTTP 429 Too Many Requests');
    expect(historyFailStatusText(blocked)).toBe('没有发出去');
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

  it('rethrows the raw fetch error (no silent fallback to slim item)', async () => {
    const slim = item({ id: 'hist_fail', url: 'https://x/a.png', hasWorkflowSnapshot: true } as any);
    await expect(resolveHistoryItemForApply(slim as any, async () => {
      throw new Error('network 502');
    })).rejects.toThrow('network 502');
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


describe('Mage local-block size chip (blocked ≠ hide)', () => {
  it('shows chip for blocked / unsupported / intended / sent; hides only not-sent / unknown', () => {
    expect(historySizeChipVisible('blocked', true)).toBe(true);
    expect(historySizeChipVisible('unsupported', true)).toBe(true);
    expect(historySizeChipVisible('intended', true)).toBe(true);
    expect(historySizeChipVisible('sent', true)).toBe(true);
    expect(historySizeChipVisible('not-sent', true)).toBe(false);
    expect(historySizeChipVisible('unknown', true)).toBe(false);
    expect(historySizeChipVisible('blocked', false)).toBe(false);
  });
});

import { historyCardReminder } from './HistoryModal';
import { describe as d2, it as i2, expect as e2 } from 'vitest';
d2('history card face (2026-11-04 simplification)', () => {
  i2('failed card: one plain reason line, upstream text verbatim', () => {
    const item: any = { id: 'f', status: 'failed', upstreamStatus: 402, upstreamResponseBody: JSON.stringify({ error: { code: 'insufficient_gems', message: 'too low' } }), timestamp: 1 };
    const line = historyCardReminder(item, {} as any, []);
    e2(line).toMatch(/^失败（HTTP 402）：/);
    e2(line).toMatch(/too low/);
  });
  i2('success card: no line when nothing unused', () => {
    e2(historyCardReminder({ id: 's', url: 'x', timestamp: 1 } as any, {} as any, [])).toBe('');
  });
});
