import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import run1137 from './__fixtures__/modelscopeSuccess1137.json';
import { historyUpstreamExchanges, groupUpstreamExchanges, terminalSuccessIndex, upstreamBodyStatus, upstreamCallTime, upstreamSegmentLabel } from './historyParameters';
import { UpstreamExchanges, UpstreamBody, upstreamBodyToggleText } from '../components/HistoryModal';

const item: any = run1137;
const rows = historyUpstreamExchanges(item);

describe('upstream trace polish (real run 1137)', () => {
  it('11 calls: 1 POST + 10 GET', () => {
    expect(rows.length).toBe(11);
    expect(rows.filter((r) => r.method === 'POST').length).toBe(1);
  });
  it('groups identical consecutive calls: 1 | 2–10 ×9 | 11', () => {
    const g = groupUpstreamExchanges(rows);
    expect(g.map((x) => [x.start + 1, x.end + 1, x.rows.length])).toEqual([[1, 1, 1], [2, 10, 9], [11, 11, 1]]);
    expect(upstreamSegmentLabel(1, 9, 11)).toBe('第 2–10 / 11 段');
    expect(upstreamSegmentLabel(0, 0, 11)).toBe('第 1 / 11 段');
  });
  it('terminal success = last 2xx call when card has output; none when no output', () => {
    expect(terminalSuccessIndex(item, rows)).toBe(10);
    expect(terminalSuccessIndex({ ...item, url: undefined, status: 'failed' }, rows)).toBe(-1);
  });
  it('generic status field read from verbatim response', () => {
    expect(upstreamBodyStatus('{"task_id":"x","task_status":"RUNNING"}')).toBe('RUNNING');
    expect(upstreamBodyStatus('{"status":"succeeded"}')).toBe('succeeded');
    expect(upstreamBodyStatus('{"state":"done"}')).toBe('done');
    expect(upstreamBodyStatus('{"data":[]}')).toBeUndefined();
    expect(upstreamBodyStatus('not json')).toBeUndefined();
  });
  it('call time: Asia/Shanghai from trace, 「未记录时间」 when absent (never guessed)', () => {
    expect(upstreamCallTime(undefined)).toBe('未记录时间');
    expect(upstreamCallTime('garbage')).toBe('未记录时间');
    expect(upstreamCallTime('2026-10-16T03:37:01.234Z')).toContain('11:37:01.234');
    expect(rows[0].startedAt).toBeUndefined();
  });
  it('renders numbered segments, one collapsed group, terminal highlight, no mid-token wrapping', () => {
    const html = renderToStaticMarkup(<UpstreamExchanges item={item} />);
    expect(html).toContain('共 11 段');
    expect(html).toContain('第 1 / 11 段');
    expect(html).toContain('第 2–10 / 11 段');
    expect(html).toContain('×9');
    for (let n = 2; n <= 10; n++) expect(html).toContain(`第 ${n} / 11 段`);
    expect(html).toContain('第 11 / 11 段');
    expect((html.match(/data-terminal="true"/g) || []).length).toBe(1);
    expect((html.match(/未记录时间/g) || []).length).toBe(11);
    expect(html).toContain('overflow-wrap:anywhere'); // fix4: wrap long URLs / JSON so line tails are visible
    expect(html).toContain('whitespace-pre-wrap'); // fix3 I: full body wraps, not single-line nowrap
  });
  it('toggle text reflects state', () => {
    const ref = { kind: 'raw-response', url: '/x', size: 306 };
    expect(upstreamBodyToggleText(ref, false)).toContain('点开读取');
    expect(upstreamBodyToggleText(ref, true)).toBe('上游响应原文（收起）');
    expect(upstreamBodyToggleText('{}', true)).not.toContain('点开');
    expect(renderToStaticMarkup(<UpstreamBody body={ref} testId="t" />)).toContain('点开读取');
  });
});
