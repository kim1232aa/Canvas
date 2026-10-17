import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { schemaFieldBadge } from './SchemaChoiceControls';
import { historyHeaderCounts, historyCardTime } from './HistoryModal';
import { nonGenerationOrigin, humanSummaryText } from './ExecutionLog';
import { upstreamHttpFirstLine } from '../utils/apiFailure';

const src = (f: string) => readFileSync(resolve(__dirname, f), 'utf8');

describe('P0-1 badge derives from the actualRequest rule (key present in body ⇒ sent verbatim)', () => {
  // clean-1029 #3 supersedes 待确认: unfilled → 未填写，不发送 (+ Schema default when declared).
  it('filled → 会发送 <value>; unfilled → 未填写，不发送（Schema 默认：x）/ 未填写，不发送', () => {
    expect(schemaFieldBadge('webp', 'png')).toEqual({ kind: 'send', text: '会发送 webp' });
    expect(schemaFieldBadge(undefined, 'png')).toEqual({ kind: 'not_sent', text: '未填写，不发送（Schema 默认：png）' });
    expect(schemaFieldBadge(undefined)).toEqual({ kind: 'not_sent', text: '未填写，不发送' });
    expect(schemaFieldBadge({ width: 1, height: 2 }).text).toBe('会发送 {"width":1,"height":2}');
  });
});

describe('P0-2 / P0-3 history header + card meta', () => {
  it('counts output vs failed vs local_blocked separately', () => {
    const h: any[] = [{ id: 'a', url: '/m/1' }, { id: 'b', status: 'failed', url: '' }, { id: 'c', status: 'failed' }, { id: 'd', status: 'local_blocked' }];
    expect(historyHeaderCounts(h)).toEqual({ output: 1, failed: 2, localBlocked: 1, schemaFetch: 0, nonOutput: 3 });
  });
  it('card time is local-formatted; missing timestamp is explicit', () => {
    expect(historyCardTime(Date.UTC(2026, 9, 14, 20, 2, 34))).toMatch(/^2026-10-1\d \d{2}:02:34（.+）$/);
    expect(historyCardTime(undefined)).toBe('时间未记录');
  });
  it('every card renders title/time/id strip; JSON pre uses overflow-wrap, not break-all', () => {
    const s = src('HistoryModal.tsx');
    expect(s).toContain('data-testid="history-card-meta"');
    expect(s).toContain('data-testid="history-card-id"');
    expect(s).toContain('whitespace-pre-wrap'); // fix4: break-all allowed so line tails are visible
  });
});

describe('(d) one status-text source for exec log and history', () => {
  it('first line includes upstream statusText from the same trace', () => {
    const data = { executionTrace: [{ method: 'POST', status: 402, statusText: 'Payment Required', responseBody: '{"error":"Insufficient USD"}' }] };
    expect(upstreamHttpFirstLine(data)).toContain('HTTP 402');
    expect(upstreamHttpFirstLine(data)).toContain('Payment Required');
    expect(upstreamHttpFirstLine(data)).not.toContain('{"error"');
    expect(upstreamHttpFirstLine({ executionTrace: [{ status: 402, responseBody: 'x' }] })).toBe('HTTP 402 x');
  });
});

describe('(g) catalog/schema requests labelled with origin; tab click not double-fetching', () => {
  it('non-generation summary names provider/category', () => {
    expect(nonGenerationOrigin('/api/models?provider=venice&query=&type=LORA&category=lora')).toBe(' · 服务商 venice · 类别 lora');
    const r: any = { method: 'GET', route: '/api/models?provider=replicate&category=lora', status: 200, state: 'ok', response: {} };
    expect(humanSummaryText(r)).toBe('GET /api/models · 服务商 replicate · 类别 lora · HTTP 200（非生成请求）');
  });
  it('tab onClick no longer calls fetchModels alongside setActiveProvider (effect fetches once)', () => {
    const s = src('CivitaiModal.tsx');
    expect(s).toContain("if (tab.id === activeProvider) fetchModels(tab.id as any, query, sort, 'all', false);\n                  else setActiveProvider(tab.id as any);");
  });
  it('(a)(b)(c) noLoraCatalog: search disabled with reason, filter hint replaced, count wording', () => {
    const s = src('CivitaiModal.tsx');
    expect(s).toContain('disabled={loading || noCatalog}');
    expect(s).toContain('disabled={noCatalog}');
    expect(s).toContain('检索与筛选对该服务商无效（无目录可查）');
    expect(s).toContain('未请求上游目录 · 0 个 LoRA');
  });
});
