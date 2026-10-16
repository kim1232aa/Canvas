import { canonicalProviderLabel } from '../utils/providerLabels';
import { loraDisplayName } from '../utils/loraDisplayName';
import React from 'react';
import { Download, Clock, Copy, Sparkles, Check, Image as ImageIcon, Trash2 } from 'lucide-react';
import { GenerationHistoryItem } from '../types/providers';
import { PreviewMediaPanel } from './PreviewMediaPanel';
import { EmphasizeLimit, UrlNoMidBreak, JsonNoMidBreak } from './TextEmphasis';
import { formatRecordTime } from '../services/executionTrace';
import { isApplyToCanvasDisabled, type PreviewSettleState } from '../utils/previewHang';
import { splitActualRequest, ACTUAL_META_LABEL } from '../utils/actualRequestDisplay';
import { requestedNotSentLoras, notSentLoraLabel, generationPostNotSent, historySeedStatement, historySeedRowText, otherSentParameters, formatHistorySize, formatResolvedHistoryParameter, hasOutputMedia, historyFieldOrigins, historyParameterSourceLabel, resolveHistoryParameters, HISTORY_UNSUPPORTED_LABEL, sentHistoryLoras, historyModelSent, upstreamErrorMessage, historyKeyUsageLabels, historyActualRequest, historyUpstreamExchanges, groupUpstreamExchanges, terminalSuccessIndex, upstreamBodyStatus, upstreamSegmentStatusLabel, upstreamCallTime, upstreamSegmentLabel, extractUpstreamEcho, upstreamEchoContrast, unwrapGenerationParameters, valueAtPath, type UpstreamExchangeRow, type ResolvedHistoryParameter } from '../utils/historyParameters';
import { PROVIDER_UPSTREAM_ECHO_PATH } from '../config/providerDisplayHints';

/** Header counts by record kind (only items with real output media count as 出图). */
export function historyHeaderCounts(history: GenerationHistoryItem[]): { output: number; failed: number; localBlocked: number } {
  return {
    output: history.filter(hasOutputMedia).length,
    failed: history.filter((i) => i.status === 'failed').length,
    localBlocked: history.filter((i) => i.status === 'local_blocked').length,
  };
}

/** Card timestamp in the viewer's local zone (same formatter as the exec log). */
export function historyCardTime(ts: unknown): string {
  return typeof ts === 'number' && Number.isFinite(ts) ? formatRecordTime(new Date(ts).toISOString()) : '时间未记录';
}

export const displayValue = (val: any): string | number => {
  if (val === null || val === undefined) return '未填写';
  if (typeof val === 'string' && (val.trim() === '' || val.trim() === 'null' || val.trim() === 'undefined')) return '未填写';
  if (typeof val === 'number' && isNaN(val)) return '未填写';
  return val;
};

// Distinct chip per status (not only text colour): 实际发送 solid, 拟发送 dashed amber, 该端点不支持 ⊘ dashed rose (label readable; only the unsent VALUE is struck).
const sourceClass: Record<ResolvedHistoryParameter['source'], string> = {
  upstream: 'text-emerald-200 bg-emerald-900/50 border border-emerald-500/60',
  'image-metadata': 'text-cyan-200 bg-cyan-900/40 border border-cyan-500/50',
  sent: 'text-white bg-sky-600 border border-sky-300 font-bold',
  requested: 'text-amber-200 border border-amber-500/50',
  legacy: 'text-slate-400 border border-slate-600',
  'not-sent': 'text-rose-200 bg-rose-950/50 border border-rose-500/50',
  'schema-unrecorded': 'text-slate-300 border border-dashed border-slate-500',
  blocked: 'text-amber-200 bg-amber-950/50 border border-amber-500/60',
  intended: 'text-amber-100 bg-transparent border-2 border-dashed border-amber-300/80 italic',
  unsupported: 'text-slate-200 bg-slate-900 border border-dashed border-rose-400/70',
  unknown: 'text-slate-500 border border-slate-700',
};

/** Shape glyph per status so the three main chips differ even at thumbnail size / without colour: ● solid, ◌ dashed, ⊘ struck. */
export const SOURCE_GLYPH: Partial<Record<ResolvedHistoryParameter['source'], string>> = { sent: '●', upstream: '●', intended: '◌', unsupported: '⊘', 'not-sent': '○', blocked: '⛔' };
export const sourceChipText = (source: ResolvedHistoryParameter['source']) => `${SOURCE_GLYPH[source] ? `${SOURCE_GLYPH[source]} ` : ''}${historyParameterSourceLabel(source)}`;
const sourceBadge = (param: ResolvedHistoryParameter) => {
  if (param.value === undefined || param.value === null || param.value === '') return null;
  return <span data-source={param.source} className={`ml-1 inline-block align-middle leading-tight shrink-0 rounded px-1 py-px text-[10px] whitespace-nowrap ${sourceClass[param.source]}`}>{sourceChipText(param.source)}</span>;
};

/** 「实际发送」 / 「拟发送」 block: the upstream-bound part (endpoint + parameters) first, canvas diagnostics in a separate not-sent fold. */
/** 本地记录（未发给上游）: canvas-side record kept beside actualRequest (e.g. the endpoint Schema field list used for chip verdicts). */
export const LOCAL_RECORD_LABEL = '本地记录（未发给上游）';
const LocalRecord: React.FC<{ item: GenerationHistoryItem }> = ({ item }) => {
  const f = item.requestMetadata?.schemaFields;
  if (!Array.isArray(f) || !f.length) return null;
  // fix4 #2 / fix5: Schema 字段名 ≠ 本次 actualRequest 键时标注「Schema 声明，本次请求未含」
  // （中性说明，避免读成「该发未发」或与 LoRA 强度混淆；不删官方 Schema 字段本身）.
  const sentParams = unwrapGenerationParameters(historyActualRequest(item));
  const sentKeys = sentParams && typeof sentParams === 'object' && !Array.isArray(sentParams) ? new Set(Object.keys(sentParams as object)) : null;
  const annotated = f.map((name) => {
    const key = String(name);
    if (!sentKeys) return key;
    return sentKeys.has(key) ? key : `${key}（Schema 声明，本次请求未含）`;
  });
  return <details className="mt-1 text-slate-400" data-testid="history-local-record"><summary className="cursor-pointer">{LOCAL_RECORD_LABEL}：Schema 字段清单（{f.length}）</summary><JsonNoMidBreak value={{ schemaFields: annotated }} className="max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-slate-300" /></details>;
};

const rawRef = (body: unknown): any => body && typeof body === 'object' && (body as any).kind === 'raw-response' && typeof (body as any).url === 'string' ? body : undefined;
/** Summary text of the raw-response toggle; reflects open state (never says 「点开」 while expanded). */
export const upstreamBodyToggleText = (body: unknown, open: boolean): string => {
  const ref = rawRef(body);
  if (open) return '上游响应原文（收起）';
  // fix5: say 「响应体 N B」 so the storage byte count is never mistaken for the history 尺寸 row (AIMLAPI 505 regression).
  return ref ? `上游响应原文（响应体 ${ref.size ?? '?'} B，点开读取）` : '上游响应原文（点开查看）';
};
/** ids / URLs / JSON never break mid-token: no wrapping, horizontal scroll inside the block. */
/** Visible horizontal scrollbar (8px, slate thumb) + bottom padding so the bar never bleeds onto the next segment. */
export const SCROLL_X_VISIBLE = '[scrollbar-width:auto] [scrollbar-color:#64748b_#1e293b] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-slate-500 [&::-webkit-scrollbar-track]:bg-slate-800 pb-2';
const CODE_NOWRAP = `whitespace-pre overflow-x-auto font-mono ${SCROLL_X_VISIBLE}`;
/** Folded identical-segments row hint; follows open state. */
export const upstreamGroupHint = (open: boolean): string => open ? '（响应相同，收起）' : '（响应相同，点开逐段查看）';

/** Verbatim upstream response body: inline value as-is, or an externalized raw-response reference loaded from its URL on demand (original bytes, not re-formatted). */
export const UpstreamBody: React.FC<{ body: unknown; testId: string; preloaded?: string }> = ({ body, testId, preloaded }) => {
  const ref = rawRef(body);
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const load = () => {
    if (!ref || text !== null || preloaded !== undefined) return;
    fetch(ref.url).then(async (r) => { const t = await r.text(); if (!r.ok) throw new Error(`HTTP ${r.status} ${t}`); setText(t); }).catch((e) => setError(String(e?.message || e)));
  };
  const loaded = preloaded ?? text;
  const shown = ref ? (loaded ?? (error ? `原始响应读取失败：${error}` : '')) : typeof body === 'string' ? body : JSON.stringify(body ?? null, null, 2);
  return (
    <details className="mt-0.5" onToggle={(e) => { const o = (e.currentTarget as HTMLDetailsElement).open; setOpen(o); if (o) load(); }}>
      <summary className="cursor-pointer text-slate-400" data-testid={`${testId}-toggle`}>{upstreamBodyToggleText(body, open)}</summary>
      <pre className="max-h-80 overflow-y-auto overflow-x-auto whitespace-pre-wrap break-all [overflow-wrap:anywhere] font-mono text-slate-200 text-[11px]" data-testid={testId}>{shown}</pre>
    </details>
  );
};

const ExchangeSegment: React.FC<{ r: UpstreamExchangeRow; i: number; total: number; terminal: boolean; bodyText?: string }> = ({ r, i, total, terminal, bodyText }) => {
  const rawBody = bodyText ?? (typeof r.responseBody === 'string' ? r.responseBody : undefined);
  const st = upstreamSegmentStatusLabel(rawBody, typeof r.status === 'number' ? r.status : null);
  const bizFail = typeof st === 'string' && st.includes('HTTP 成功 · 业务');
  return (
    <div className={`mt-2 rounded p-2 pl-2.5 overflow-hidden border-l-4 ${i > 0 ? 'border-t border-t-slate-700/70' : ''} ${terminal ? 'bg-emerald-900/70 border-2 border-emerald-300 border-l-[6px] border-l-emerald-300 ring-2 ring-emerald-400/50 shadow-[0_0_12px_rgba(52,211,153,0.35)]' : bizFail ? 'bg-amber-950/40 border-l-amber-500/80' : 'bg-black/30 border-l-sky-800/80'}`} data-testid="history-upstream-exchange" data-segment={i + 1} data-terminal={terminal ? 'true' : undefined} data-biz-fail={bizFail ? 'true' : undefined}>
      {/* Header: label · time · status; HTTP 2xx + business fail reads as 「HTTP 成功 · 业务 …」 not bare success. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-slate-400 min-w-0" data-testid="history-upstream-seg-head">
        <span className="font-bold text-slate-200 whitespace-nowrap">{upstreamSegmentLabel(i, i, total)}</span>
        <span className="ml-1 whitespace-nowrap text-[11px] text-slate-300" data-testid="history-upstream-time">{upstreamCallTime(r.startedAt)}</span>
        {st && <span className={`min-w-0 max-w-full whitespace-normal break-words [overflow-wrap:anywhere] font-mono ${bizFail ? 'text-amber-200 font-semibold' : ''}`} data-testid="history-upstream-seg-status">{st}</span>}
      </div>
      {terminal && <div className="flex mt-0.5"><span className="whitespace-nowrap rounded px-1.5 py-0.5 text-[12px] font-extrabold text-emerald-950 bg-emerald-300" data-testid="history-upstream-terminal">✓ 终态 · 本次出图</span></div>}
      <div className="max-w-full font-mono" data-testid="history-upstream-url">{r.method} <UrlNoMidBreak text={r.endpoint} /> <span className="whitespace-nowrap">→ {r.status == null ? '无状态码' : `HTTP ${String(r.status)}${r.statusText ? ` ${r.statusText}` : ''}`}</span></div>
      <UpstreamBody body={r.responseBody} testId={`history-upstream-body-${i}`} preloaded={bodyText} />
    </div>
  );
};

const UpstreamGroup: React.FC<{ start: number; end: number; total: number; head: string; children: React.ReactNode }> = ({ start, end, total, head, children }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <details className="mt-2 rounded bg-sky-950/30 p-2 border border-sky-800/60" data-testid="history-upstream-group" data-range={`${start + 1}-${end + 1}`} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer list-none flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0" data-testid="history-upstream-group-summary">
        <span className="text-sky-300 shrink-0" aria-hidden="true" data-testid="history-upstream-group-arrow">{open ? '▾' : '▸'}</span>
        <span className="font-bold text-slate-100">{upstreamSegmentLabel(start, end, total)}</span>
        <span>·</span><span className="font-mono text-sky-100 break-all">{head}</span>
        <span className="text-slate-400 text-[12px] whitespace-nowrap" data-testid="history-upstream-group-hint">{upstreamGroupHint(open)}</span>
      </summary>
      <div className="pl-2 ml-1 border-l border-sky-700/60">{children}</div>
    </details>
  );
};

/** Every upstream exchange of the entry (submit + poll …): numbered segments with call time; identical consecutive calls fold into one expandable row; terminal success highlighted. */
export const UpstreamExchanges: React.FC<{ item: GenerationHistoryItem }> = ({ item }) => {
  const rows = historyUpstreamExchanges(item);
  const [texts, setTexts] = React.useState<Record<string, string>>({});
  if (!rows.length) return null;
  const total = rows.length;
  const terminal = terminalSuccessIndex(item, rows);
  const groups = groupUpstreamExchanges(rows);
  const textOf = (r: UpstreamExchangeRow) => { const ref = rawRef(r.responseBody); return ref ? texts[ref.url] : undefined; };
  // Opening the section reads the stored raw responses (local /api/media/raw, no upstream call) so status fields can be shown.
  const loadAll = () => {
    const urls = Array.from(new Set(rows.map((r) => rawRef(r.responseBody)?.url).filter(Boolean))) as string[];
    urls.filter((u) => texts[u] === undefined).forEach((u) => fetch(u).then(async (res) => { const t = await res.text(); setTexts((m) => ({ ...m, [u]: res.ok ? t : `原始响应读取失败：HTTP ${res.status} ${t}` })); }).catch((e) => setTexts((m) => ({ ...m, [u]: `原始响应读取失败：${String(e?.message || e)}` }))));
  };
  return (
    <details className="mt-1.5 rounded bg-black/30 p-2 text-[11px] text-slate-300" data-testid="history-upstream-exchanges" onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) loadAll(); }}>
      <summary className="cursor-pointer text-sky-300">上游交互（共 {total} 段，原样）</summary>
      {groups.map((g) => g.rows.length === 1
        ? <ExchangeSegment key={g.start} r={g.rows[0]} i={g.start} total={total} terminal={g.start === terminal} bodyText={textOf(g.rows[0])} />
        : (
          <UpstreamGroup key={g.start} start={g.start} end={g.end} total={total}
            head={`${upstreamSegmentStatusLabel(textOf(g.rows[0]), typeof g.rows[0].status === 'number' ? g.rows[0].status : null) ?? `${g.rows[0].method} HTTP ${String(g.rows[0].status ?? '无状态码')}`} ×${g.rows.length}`}>
            {g.rows.map((r, k) => <ExchangeSegment key={g.start + k} r={r} i={g.start + k} total={total} terminal={g.start + k === terminal} bodyText={textOf(r)} />)}
          </UpstreamGroup>
        ))}
    </details>
  );
};

const RequestEnvelope: React.FC<{ value: unknown; testId: string; label?: string }> = ({ value, testId, label }) => {
  const { sent, meta } = splitActualRequest(value);
  return <>
    {label && <p className="text-[11px] text-slate-400 mb-0.5" data-testid={`${testId}-label`}>{label}</p>}
    <JsonNoMidBreak value={sent ?? null} className="max-h-[28rem] min-h-[8rem] overflow-y-auto overflow-x-auto whitespace-pre-wrap break-all [overflow-wrap:anywhere] font-mono text-[11px]" testId={testId} />
    {meta && <details className="mt-1 text-slate-500"><summary className="cursor-pointer">{ACTUAL_META_LABEL}</summary><JsonNoMidBreak value={meta} className="max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px]" /></details>}
  </>;
};

/** fix3 F: upstream echo JSON (non-ours) + rows for fields only in echo / only in sent. */
const UpstreamEchoBlock: React.FC<{ item: GenerationHistoryItem }> = ({ item }) => {
  const providerKey = String(item.actualProvider || item.provider || '').toLowerCase().replace(/[^a-z]/g, '');
  // map display names → ids
  const id = (['wavespeed','muapi','sogni','aimlapi','krea','together','novita','venice'] as const).find((p) => providerKey.includes(p)) || providerKey;
  const echoPath = PROVIDER_UPSTREAM_ECHO_PATH[id];
  const [echo, setEcho] = React.useState<Record<string, unknown> | null>(null);
  React.useEffect(() => {
    if (!echoPath) { setEcho(null); return; }
    const direct = extractUpstreamEcho(item, echoPath);
    if (direct) { setEcho(direct); return; }
    // Load first externalized POST body that contains the path
    const rows = historyUpstreamExchanges(item);
    let cancelled = false;
    (async () => {
      for (const r of rows) {
        const ref = r.responseBody && typeof r.responseBody === 'object' && (r.responseBody as any).kind === 'raw-response' ? r.responseBody as any : null;
        if (!ref?.url) continue;
        try {
          const res = await fetch(ref.url); const t = await res.text(); if (!res.ok) continue;
          const j = JSON.parse(t); const v = valueAtPath(j, echoPath);
          if (v && typeof v === 'object' && !Array.isArray(v) && !cancelled) { setEcho(v as Record<string, unknown>); return; }
        } catch { /* next */ }
      }
    })();
    return () => { cancelled = true; };
  }, [item, echoPath]);
  if (!echoPath || !echo) return null;
  const actual = historyActualRequest(item);
  const sent = unwrapGenerationParameters(actual) as Record<string, unknown> | undefined;
  const rows = upstreamEchoContrast(sent, echo);
  return (
    <div className="mt-2 rounded border border-violet-700/50 bg-violet-950/30 p-2" data-testid="history-upstream-echo">
      <p className="text-[11px] font-semibold text-violet-200 mb-1">上游回显（非我方请求体）</p>
      <JsonNoMidBreak value={echo} className="max-h-48 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] text-violet-100" testId="history-upstream-echo-json" />
      {rows.length > 0 && (
        <ul className="mt-1 space-y-0.5" data-testid="history-upstream-echo-contrast">
          {rows.map((r) => (
            <li key={`${r.kind}-${r.key}`} className="text-[11px] text-violet-100/90">
              {r.kind === 'upstream-default'
                ? <span className="text-slate-200" data-testid="history-upstream-default-row">未发送 · 上游按默认补全 · <span className="font-mono text-violet-100">{r.key}</span> = {typeof r.value === 'object' ? JSON.stringify(r.value) : String(r.value)}{r.description ? <span className="text-slate-300"> · {r.description}</span> : null}</span>
                : <>我方已发送、回显中无 · <span className="font-mono">{r.key}</span></>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** LoRA row for cards whose generation request never left — same rule for a local block and a failed Schema/catalog GET. */
const NotSentLoras: React.FC<{ item: GenerationHistoryItem }> = ({ item }) => {
  const list = requestedNotSentLoras(item);
  if (!list.length) return null;
  return <div className="mt-2 flex flex-wrap gap-1" data-testid="history-lora-not-sent">{list.map((l, i) => (
    <span key={i} className="text-[10px] text-purple-200 border border-dashed border-purple-500/60 px-1.5 py-0.5 rounded [overflow-wrap:anywhere]" data-lora-status={notSentLoraLabel(item, l.name)}>LoRA · {notSentLoraLabel(item, l.name)}: {l.name} ({l.strength === undefined || l.strength === null ? '未填强度' : String(l.strength)})</span>
  ))}</div>;
};

const FieldOrigins: React.FC<{ item: GenerationHistoryItem }> = ({ item }) => {
  const o = historyFieldOrigins(item);
  return o.length ? <ul className="mt-1 text-[11px] text-slate-400" data-testid="history-field-origins">{o.map((x) => <li key={x.field}><span className="font-mono">{x.field}</span> · 来源：{x.origin}</li>)}</ul> : null;
};

/** Why 「应用到画布」 is disabled — shown as tooltip + visible hint. */
export const applyDisabledReason = (item: GenerationHistoryItem, broken: boolean): string => {
  if (item.status === 'local_blocked') return '未出站，本地拦截：这次没有出图，没有结果可应用到画布';
  if (item.status === 'failed') return '上游请求失败：这次没有出图，没有结果可应用到画布';
  if (!item.url) return '这条记录没有输出图片，无法应用到画布';
  if (broken) return '预览加载失败，无法应用到画布';
  return '';
};

/** fix11 #7: card rows whose source is 「未发送（Schema 未记录）」 — grouped after the sent rows, never hidden. */
const UNRECORDED_ORDER: [string, string][] = [['steps', '步数'], ['cfg', 'CFG'], ['sampler', '采样器'], ['scheduler', '调度器'], ['size', '尺寸'], ['negativePrompt', '负向']];
export function schemaUnrecordedKeys(resolved: Record<string, any>, skip: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const [k] of UNRECORDED_ORDER) {
    if (skip.has(k)) continue;
    const src = k === 'size' ? formatHistorySize(resolved as any).source : resolved[k]?.source;
    if (src === 'schema-unrecorded') out.add(k);
  }
  return out;
}
/** fix12 #1: summary count must equal listed labels; names only in expanded list (collapsed 「N 项：a、b…」 made 「6」 look like 「0」). */
export function unrecordedFoldRows(keys: Set<string>): [string, string][] {
  return UNRECORDED_ORDER.filter(([k]) => keys.has(k));
}
export function unrecordedFoldSummary(count: number): string {
  return `未发送（Schema 未记录）· 共 ${count} 项`;
}
function UnrecordedFold({ keys, resolved }: { keys: Set<string>; resolved: Record<string, any> }) {
  if (!keys.size) return null;
  const rows = unrecordedFoldRows(keys);
  /** fix11.1 #3: size with no canvas value must still show 「未发送…」 verbatim — never 「尺寸: 」 blank. */
  const unrecordedCell = (k: string, l: string) => {
    if (k === 'size') {
      const size = formatHistorySize(resolved as any);
      return size.text || historyParameterSourceLabel(size.source);
    }
    return formatResolvedHistoryParameter(resolved[k]);
  };
  return (
    <details data-testid="history-unrecorded-group" className="mt-1 rounded border border-slate-700/70 bg-slate-900/40 px-2 py-1 text-[11px] font-mono text-slate-400">
      <summary className="cursor-pointer select-none inline-flex items-center gap-1.5" data-testid="history-unrecorded-summary">
        <span>未发送（Schema 未记录）</span>
        <span className="rounded border border-slate-500/70 bg-slate-800/80 px-1.5 py-px text-[11px] font-semibold tabular-nums tracking-wide text-slate-100" data-testid="history-unrecorded-count">共 {rows.length} 项</span>
      </summary>
      <ul className="mt-1 space-y-0.5" data-testid="history-unrecorded-list">
        {rows.map(([k, l]) => <li key={k} data-unrecorded-key={k}>{l}: {unrecordedCell(k, l)}</li>)}
      </ul>
    </details>
  );
}

/** trace-fix2 #7: card rows whose verdict is 「该端点不支持 · 未发送」 (Schema-derived source 'unsupported'), in card order. */
export type UnsupportedRow = { key: 'steps' | 'cfg' | 'sampler' | 'scheduler' | 'size' | 'negativePrompt'; label: string; value?: string };
export function historyUnsupportedRows(resolved: Record<string, ResolvedHistoryParameter>): UnsupportedRow[] {
  const out: UnsupportedRow[] = [];
  const v = (p?: ResolvedHistoryParameter) => (p && p.value !== undefined && p.value !== null && p.value !== '' ? String(p.value) : undefined);
  const one = (key: UnsupportedRow['key'], label: string) => { const p = resolved[key]; if (p?.source === 'unsupported') out.push({ key, label, value: v(p) }); };
  one('steps', '步数'); one('cfg', 'CFG'); one('sampler', '采样器'); one('scheduler', '调度器');
  const size = formatHistorySize(resolved as any);
  if (size.source === 'unsupported') out.push({ key: 'size', label: '尺寸', value: size.canvasValue });
  one('negativePrompt', '负向');
  return out;
}
/** One expandable row 「该端点不支持 N 项 · 未发送」; expanded it lists every item (canvas value struck, never sent). */
const UnsupportedFold: React.FC<{ rows: UnsupportedRow[] }> = ({ rows }) => {
  const [open, setOpen] = React.useState(false);
  if (!rows.length) return null;
  return (
    <details className="text-[11px] font-mono text-slate-300" data-testid="history-unsupported-fold" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer list-none inline-flex items-center gap-1 rounded px-1 py-px border border-dashed border-rose-400/70 bg-slate-900" data-testid="history-unsupported-summary">
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>⊘ 该端点不支持 {rows.length} 项 · 未发送{open ? '（收起）' : ''}
      </summary>
      <ul className="mt-1 pl-3 space-y-0.5 text-slate-400" data-testid="history-unsupported-list">
        {rows.map((r) => <li key={r.key} data-unsupported-key={r.key}>{r.label}{r.value !== undefined ? <>: <s className="text-slate-500" title="画布填写的值，未发送">{r.value}</s></> : ''} · {HISTORY_UNSUPPORTED_LABEL}</li>)}
      </ul>
    </details>
  );
};

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: GenerationHistoryItem[];
  onApplyPrompt: (prompt: string, negPrompt?: string) => void;
  onDeleteItem: (id: string) => void;
  onClearAll: () => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  onClose,
  history,
  onApplyPrompt,
  onDeleteItem,
  onClearAll,
}) => {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [selectedImage, setSelectedImage] = React.useState<GenerationHistoryItem | null>(null);
  const [brokenIds, setBrokenIds] = React.useState<Record<string, true>>({});
  const [copyError, setCopyError] = React.useState('');

  if (!isOpen) return null;

  const markBroken = (id: string) => {
    setBrokenIds((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
  };

  const clearBroken = (id: string) => {
    setBrokenIds((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleCopyPrompt = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyError('');
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch { setCopyError('复制失败，请检查浏览器剪贴板权限'); }
  };
  const downloadProvenance = (item: GenerationHistoryItem) => {
    const resolved = resolveHistoryParameters(item);
    const body = {format: 'comfycanvas-generation', version: 2, provider: item.actualProvider || item.provider, model: item.actualModel || item.model, parameters: Object.fromEntries(Object.entries(resolved).map(([key,value])=>[key,{value:value.value ?? null,source:value.source,requested:value.requested ?? null,sent:value.sent ?? null,upstream:value.upstream ?? null}])), loras: item.loras, requestMetadata: item.requestMetadata, workflowSnapshot: item.workflowSnapshot};
    const url = URL.createObjectURL(new Blob([JSON.stringify(body, null, 2)], {type: 'application/json'}));
    handleDownload(url, `generation-${item.id}.json`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDownload = (url: string, filename = 'comfycanvas_output.jpg') => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const selectedResolved = selectedImage ? resolveHistoryParameters(selectedImage) : null;
  const outputCount = history.filter(hasOutputMedia).length;
  const nonOutputCount = history.length - outputCount;
  const { failed: failedCount, localBlocked: localBlockedCount } = historyHeaderCounts(history);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#18191d] border border-[#2e3038] rounded-2xl w-full max-w-5xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#2e3038] bg-[#141518] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                生成历史
                <span data-badge-level="primary" className="text-sm font-semibold px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-200 border border-purple-500/40" data-testid="history-output-count">
                  {outputCount} 张出图
                </span>
                {nonOutputCount > 0 && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full border border-slate-500/60 text-slate-200 bg-slate-700/40" data-testid="history-non-output-count" data-badge-level="secondary">
                    未出图 {nonOutputCount} 条（上游失败 {failedCount} · 本地拦截 {localBlockedCount}{nonOutputCount - failedCount - localBlockedCount > 0 ? ` · 其他 ${nonOutputCount - failedCount - localBlockedCount}` : ''}）
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                查看生成结果、实际发送的参数与工作流，导出 JSON 以便复用
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <button
                onClick={() => {
                  if (confirm('确定要清空全部生成历史吗？此操作不可撤销。')) onClearAll();
                }}
                className="px-3 py-1.5 rounded-lg bg-rose-900/30 hover:bg-rose-600 text-rose-400 hover:text-white text-xs font-bold border border-rose-500/30 transition-all flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>清空历史</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-[#25272e] transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto bg-[#141518]">
          {copyError && <p role="alert" className="mb-3 text-sm text-rose-300">{copyError}</p>}
          {history.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-400">
              <ImageIcon className="w-12 h-12 text-slate-600" />
              <p className="text-sm">暂无生成记录。点击右侧「Queue Prompt」开始运行工作流！</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-start">
              {history.map((item) => {
                const resolved = resolveHistoryParameters(item);
                const unsupportedRows = historyUnsupportedRows(resolved);
                const unsupportedKeys = new Set(unsupportedRows.map((r) => r.key));
                const unrecorded = schemaUnrecordedKeys(resolved, unsupportedKeys);
                const settleForApply: PreviewSettleState = !item.url || brokenIds[item.id]
                  ? 'failed_hard'
                  : 'ok';
                const applyDisabled = isApplyToCanvasDisabled(settleForApply);
                return (
                <div
                  key={item.id}
                  data-card-state={hasOutputMedia(item) ? 'success' : item.status || 'unknown'}
                  className={`bg-[#1e2026] border rounded-xl overflow-hidden shadow-lg flex flex-col min-w-0 group transition-all ${hasOutputMedia(item) ? 'border-emerald-500/70 border-t-4 border-t-emerald-400' : item.status === 'failed' ? 'border-rose-700/60 border-t-4 border-t-rose-500' : item.status === 'local_blocked' ? 'border-slate-600 border-t-4 border-t-slate-400' : 'border-[#2d303a] hover:border-cyan-500/40'}`}
                >
                  <div className="px-3 pt-2.5 pb-2 border-b border-[#2d303a] space-y-0.5" data-testid="history-card-meta">
                    <p className={`text-xs font-medium truncate ${item.prompt && item.prompt.trim() ? 'text-slate-100' : 'text-slate-400 italic'}`} title={item.prompt || ''} data-testid="history-card-title">{displayValue(item.prompt)}</p>
                    {/* Re-runs share a prompt: the run's own time + history id are the distinguishing line, so they're prominent (no invented marker). */}
                    <p className="text-xs text-cyan-100 font-mono font-semibold flex flex-wrap gap-x-2">
                      <span data-testid="history-card-time">{historyCardTime(item.timestamp)}</span>
                      <span data-testid="history-card-id" className="text-cyan-200/90 [overflow-wrap:break-word] [word-break:normal]">ID {item.id}</span>
                    </p>
                  </div>
                  {item.status === 'local_blocked' ? (
                  <div className="relative bg-[#16151a] overflow-hidden p-3 text-[11px] font-mono border-b border-dashed border-slate-600 flex flex-col" data-testid="history-local-blocked-entry">
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      <span className="px-1.5 py-0.5 rounded bg-slate-600/80 text-white text-[10px]">{item.statusLabel || '未出站，本地拦截'}</span>
                      <span className="px-1.5 py-0.5 rounded border border-slate-500/50 text-slate-300 text-[10px]">未调用任何上游 · 无上游状态码</span>{item.requestOrigin === 'direct' && <span className="px-1.5 py-0.5 rounded border border-amber-500/50 text-amber-200 text-[10px]" data-testid="history-direct-call" title="请求不是从画布界面发出的（没有 x-canvas-origin），例如 curl / 脚本">本机直调</span>}
                      <span className="text-cyan-300 text-[10px]">{displayValue(canonicalProviderLabel(item.actualProvider || item.provider))}</span>
                    </div>
                    {typeof item.requestMetadata?.route === 'string' && <div className="text-slate-400 [overflow-wrap:break-word] [word-break:normal] mb-1">{item.requestMetadata.route}</div>}
                    <pre className="max-h-28 overflow-auto whitespace-pre-wrap [overflow-wrap:break-word] [word-break:normal] font-mono text-amber-200" data-testid="history-local-blocked-reason"><EmphasizeLimit text={item.error ?? ''} /></pre>
                    <details className="mt-2 text-slate-300" open>
                      <summary className="cursor-pointer text-slate-300">拟发送（未出站）</summary>
                      <RequestEnvelope value={item.requestMetadata?.intendedRequest ?? null} testId="history-intended-request" />
                      {item.requestMetadata?.blockedField && (
                        <p className="mt-1 text-rose-300 text-[11px]" data-testid="history-blocked-field-mark">
                          拦截字段（原值未改）：
                          <span className="font-mono text-rose-200">
                            {String((item.requestMetadata.blockedField as any).from || '')}
                            {(item.requestMetadata.blockedField as any).from ? ' → ' : ''}
                            {String((item.requestMetadata.blockedField as any).field || '')}
                            {' = '}
                            {JSON.stringify((item.requestMetadata.blockedField as any).value)}
                          </span>
                        </p>
                      )}
                    </details>
                    <NotSentLoras item={item} />
                    <LocalRecord item={item} />
                    {item.stack && <details className="mt-1 text-slate-500"><summary className="cursor-pointer">堆栈</summary><pre className="max-h-48 overflow-y-auto overflow-x-hidden whitespace-pre-wrap [overflow-wrap:anywhere] font-mono">{item.stack}</pre></details>}
                  </div>
                  ) : item.status === 'failed' ? (
                  <div className="relative bg-[#1a1114] overflow-hidden p-3 text-[11px] font-mono flex flex-col" data-testid="history-failed-entry">
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      <span className="px-1.5 py-0.5 rounded bg-rose-600/80 text-white text-[10px]">失败</span>
                      <span className="min-w-0 max-w-full px-1.5 py-0.5 rounded border border-rose-500/50 text-rose-200 text-[10px] whitespace-normal break-words [overflow-wrap:anywhere]">{item.upstreamStatus != null ? `HTTP ${item.upstreamStatus}${item.upstreamStatusText ? ` ${item.upstreamStatusText}` : ''}` : (item.networkError ? '网络错误（无状态码）' : '无上游状态码')}</span>
                      {generationPostNotSent(item) && <span className="px-1.5 py-0.5 rounded bg-slate-600/80 text-white text-[10px]" data-testid="history-post-not-sent">生成 POST 未发送</span>}{historyKeyUsageLabels(item).map((k) => <span key={k} data-testid="history-key-usage" title="本次请求使用的服务端 Key 在轮换列表中的序号（不显示 Key 内容）" className="px-1.5 py-0.5 rounded border border-slate-500/50 text-slate-200 text-[10px] whitespace-nowrap">{k}</span>)}
                      <span className="text-cyan-300 text-[10px]">{displayValue(canonicalProviderLabel(item.actualProvider || item.provider))}</span>{item.requestOrigin === 'direct' && <span className="px-1.5 py-0.5 rounded border border-amber-500/50 text-amber-200 text-[10px]" data-testid="history-direct-call" title="请求不是从画布界面发出的（没有 x-canvas-origin），例如 curl / 脚本">本机直调</span>}
                    </div>
                    {(() => { const m = upstreamErrorMessage(item.upstreamResponseBody); return m ? <p className="mb-1 text-rose-100 whitespace-pre-wrap [overflow-wrap:anywhere]" data-testid="history-failed-upstream-message">上游原文：{m}</p> : null; })()}
                    {item.upstreamEndpoint && <div className="text-slate-400 mb-1" data-testid="history-failed-endpoint"><UrlNoMidBreak text={String(item.upstreamEndpoint)} /></div>}
                    <details className="text-rose-200" data-testid="history-failed-raw">
                      <summary className="cursor-pointer text-rose-300">上游原文（原样，点开查看）</summary>
                      <pre className="max-h-48 overflow-y-auto overflow-x-hidden whitespace-pre-wrap [overflow-wrap:anywhere] font-mono text-rose-200" data-testid="history-failed-body">{item.upstreamResponseBody ?? item.networkError?.message ?? item.error ?? ''}</pre>
                    </details>
                    {generationPostNotSent(item)
                      ? <p className="mt-1 text-slate-300" data-testid="history-actual-none">实际发送：无（生成 POST 未发送）</p>
                      : <details className="mt-1 text-slate-300" open>
                      <summary className="cursor-pointer text-sky-300">实际发送{sentHistoryLoras(item).length ? ` · LoRA×${sentHistoryLoras(item).length}` : ''}</summary>
                      {sentHistoryLoras(item).length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1" data-testid="history-failed-actual-loras">
                          {sentHistoryLoras(item).map((l, i) => (
                            <span key={i} title={l.name} className="max-w-full min-w-0 inline-flex flex-wrap items-center gap-y-0.5 text-[10px] bg-purple-950/60 text-purple-300 border border-purple-800/40 px-1.5 py-0.5 rounded">
                              <span className="min-w-0 [overflow-wrap:anywhere]" data-testid="history-sent-lora-name" title={l.name}>LoRA: {loraDisplayName(l.name)} ({l.strength === undefined ? '未发送强度' : String(l.strength)})</span><span data-source="sent" className={`ml-1 shrink-0 rounded px-1 py-px text-[10px] whitespace-nowrap ${sourceClass.sent}`}>{sourceChipText('sent')}</span>
                            </span>
                          ))}
                        </div>
                      )}
                      <RequestEnvelope value={historyActualRequest(item) ?? null} testId="history-failed-actual" label="实际发送（我方请求体）" />
                      <UpstreamEchoBlock item={item} />
                      <FieldOrigins item={item} />
                    </details>}
                    <UpstreamExchanges item={item} />
                    <LocalRecord item={item} />
                    <NotSentLoras item={item} />
                    {item.stack && <details className="mt-1 text-slate-500"><summary className="cursor-pointer">堆栈</summary><pre className="max-h-48 overflow-y-auto overflow-x-hidden whitespace-pre-wrap [overflow-wrap:anywhere] font-mono">{item.stack}</pre></details>}
                  </div>
                  ) : (
                  <div className="relative aspect-square bg-[#111215] overflow-hidden cursor-pointer" onClick={() => setSelectedImage(item)}>
                    <PreviewMediaPanel
                      id={item.id}
                      url={item.url}
                      broken={!!brokenIds[item.id]}
                      onBroken={markBroken}
                      onRecovered={clearBroken}
                      kind={
                        item.mediaType === 'video' ||
                        !!item.videoUrl ||
                        item.url?.includes('.mp4') ||
                        item.model?.includes('video') ||
                        item.provider?.includes('Video') ||
                        !!item.url?.startsWith('data:video')
                          ? 'video'
                          : 'image'
                      }
                      alt={item.prompt || ''}
                      mediaClassName="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      videoProps={{ autoPlay: true, loop: true, muted: true }}
                    />
                    {hasOutputMedia(item) && <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[11px] font-bold" data-testid="history-success-badge">✓ 出图成功</div>}
                    <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-[11px] font-mono text-cyan-300 border border-cyan-500/30">
                      {displayValue(canonicalProviderLabel(item.actualProvider || item.provider))}{item.requestOrigin === 'direct' ? ' · 本机直调' : ''}
                    </div>
                    <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-mono text-slate-300">
                      {historySeedStatement(item)}
                    </div>
                  </div>
                  )}

                  <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
                    <div className="space-y-1.5">
                      <div className="text-[11px] text-slate-400 font-mono flex flex-wrap gap-x-3 gap-y-0.5">
                        <span data-testid="history-model">模型: {displayValue(item.actualModel || item.model)}{historyModelSent(item) && <span data-source="sent" className={`ml-2 inline-block align-middle leading-tight rounded px-1 py-px text-[10px] whitespace-nowrap ${sourceClass.sent}`}>{sourceChipText('sent')}</span>}</span>
                        {historyKeyUsageLabels(item).map((k) => <span key={k} data-testid="history-key-usage" title="本次请求使用的服务端 Key 在轮换列表中的序号（不显示 Key 内容）" className="inline-block align-middle leading-tight px-1.5 py-px rounded border border-slate-500 bg-slate-800/60 text-slate-200 text-[10px] whitespace-nowrap">{k}</span>)}
                        <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5" data-testid="history-seed">{historySeedRowText(item)}{sourceBadge(resolved.seed)}</span>
                        {!unsupportedKeys.has('steps') && !unrecorded.has('steps') && <span data-testid="history-steps" className="basis-full inline-flex flex-wrap items-center gap-x-1 gap-y-0.5">步数: {formatResolvedHistoryParameter(resolved.steps, ' 步')}{sourceBadge(resolved.steps)}</span>}
                        {!unsupportedKeys.has('cfg') && !unrecorded.has('cfg') && <span data-testid="history-cfg" className="basis-full inline-flex flex-wrap items-center gap-x-1 gap-y-0.5">CFG: {formatResolvedHistoryParameter(resolved.cfg)}{sourceBadge(resolved.cfg)}</span>}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono flex flex-wrap gap-x-3 gap-y-0.5">
                        {!unsupportedKeys.has('sampler') && !unrecorded.has('sampler') && <span data-testid="history-sampler">采样器: {formatResolvedHistoryParameter(resolved.sampler)}{sourceBadge(resolved.sampler)}</span>}
                        {!unsupportedKeys.has('scheduler') && !unrecorded.has('scheduler') && <span data-testid="history-scheduler">调度器: {formatResolvedHistoryParameter(resolved.scheduler)}{sourceBadge(resolved.scheduler)}</span>}
                        {!unsupportedKeys.has('size') && !unrecorded.has('size') && (() => { const size = formatHistorySize(resolved); const showChip = !!size.canvasValue && size.source !== 'not-sent' && size.source !== 'unknown' && size.source !== 'blocked'; const valueNode = size.canvasValue ? (size.source === 'unsupported' ? <s data-testid="history-size-unsent-value" className="text-slate-500" title="画布填写的值，未发送">{size.canvasValue}</s> : <span>{size.canvasValue}</span>) : null; return <span data-testid="history-size">尺寸: {valueNode}{valueNode && showChip ? ' ' : null}{showChip ? <span data-source={size.source} className={`inline-block align-middle leading-tight rounded px-1 py-px text-[10px] whitespace-nowrap ${sourceClass[size.source]}`}>{sourceChipText(size.source)}</span> : (!valueNode ? historyParameterSourceLabel(size.source) : null)}</span>; })()}
                      </div>
                      {!unsupportedKeys.has('negativePrompt') && !unrecorded.has('negativePrompt') && <p className="text-[11px] text-slate-400 font-mono [overflow-wrap:anywhere]" data-testid="history-negative">
                        负向: {formatResolvedHistoryParameter(resolved.negativePrompt)}{sourceBadge(resolved.negativePrompt)}
                      </p>}
                      <UnrecordedFold keys={unrecorded} resolved={resolved} />
                      <UnsupportedFold rows={unsupportedRows} />
                      {otherSentParameters(item).length > 0 && (
                        <div className="text-[11px] text-slate-400 font-mono flex flex-wrap gap-x-3 gap-y-0.5" data-testid="history-other-sent">
                          {otherSentParameters(item).map((p) => (
                            <span key={p.key} className="[overflow-wrap:break-word] [word-break:normal] min-w-0">{p.key}: {p.value}<span data-source="sent" className={`ml-1 rounded px-1 py-px text-[10px] whitespace-nowrap ${sourceClass.sent}`}>{sourceChipText('sent')}</span></span>
                          ))}
                        </div>
                      )}
                      {!generationPostNotSent(item) && sentHistoryLoras(item).length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1" data-testid="history-sent-loras">
                          {sentHistoryLoras(item).map((l, i) => (
                            <span key={i} title={l.name} className="max-w-full min-w-0 inline-flex flex-wrap items-center gap-y-0.5 text-[10px] bg-purple-950/60 text-purple-300 border border-purple-800/40 px-1.5 py-0.5 rounded">
                              <span className="min-w-0 [overflow-wrap:anywhere]" data-testid="history-sent-lora-name" title={l.name}>LoRA: {loraDisplayName(l.name)} ({l.strength === undefined ? '未发送强度' : String(l.strength)})</span><span data-source="sent" className={`ml-1 shrink-0 rounded px-1 py-px text-[10px] whitespace-nowrap ${sourceClass.sent}`}>{sourceChipText('sent')}</span>
                            </span>
                          ))}
                        </div>
                      )}
                      {!item.status && historyActualRequest(item) && (
                        <details className="mt-1.5 text-[11px] text-slate-300" data-testid="history-success-actual">
                          <summary className="cursor-pointer text-sky-300">实际发送（原样请求体，点开查看）</summary>
                          <div className="mt-1 rounded bg-black/30 p-2"><RequestEnvelope value={historyActualRequest(item)} testId="history-success-actual-json" label="实际发送（我方请求体）" /></div>
                          <UpstreamEchoBlock item={item} />
                        </details>
                      )}
                      {!item.status && <UpstreamExchanges item={item} />}
                    </div>

                    <div className="pt-2 border-t border-[#2a2c35] flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyPrompt(item.id, item.prompt || '');
                          }}
                          className="p-1.5 text-slate-400 hover:text-white rounded bg-[#272930] hover:bg-[#32353e] transition-colors"
                          title="复制正向提示词"
                        >
                          {copiedId === item.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!hasOutputMedia(item)) return;
                            handleDownload(item.url, `comfy_${item.id}.jpg`);
                          }}
                          disabled={!hasOutputMedia(item)}
                          data-testid="history-download"
                          className="p-1.5 text-slate-400 hover:text-white rounded bg-[#272930] hover:bg-[#32353e] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          title={hasOutputMedia(item) ? '下载图像' : applyDisabledReason(item, false).replace('应用到画布', '下载')}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm('确定删除此项记录吗？')) onDeleteItem(item.id);
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-400 rounded bg-[#272930] hover:bg-rose-950/40 transition-colors"
                          title="删除此项记录"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => downloadProvenance(item)}
                        disabled={!item.requestMetadata && !item.workflowSnapshot}
                        className="px-2.5 py-1 rounded text-[11px] border border-slate-600 text-slate-300 disabled:opacity-40"
                        title={!item.requestMetadata && !item.workflowSnapshot ? '旧记录未保存完整参数与工作流' : '导出实际参数、LoRA 与工作流'}
                      >参数与工作流</button>
                      <button
                        type="button"
                        disabled={applyDisabled}
                        aria-disabled={applyDisabled}
                        onClick={() => {
                          if (applyDisabled) return;
                          onApplyPrompt(item.prompt || '', item.negativePrompt || undefined);
                          onClose();
                        }}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors flex items-center gap-1 ${
                          applyDisabled
                            ? 'bg-slate-800/40 text-slate-500 border-slate-700/40 cursor-not-allowed opacity-50'
                            : 'bg-cyan-600/20 text-cyan-400 hover:bg-cyan-600/30 border-cyan-500/30'
                        }`}
                        title={applyDisabled ? applyDisabledReason(item, !!brokenIds[item.id]) : undefined}
                      >
                        <Sparkles className="w-3 h-3" />
                        应用到画布
                      </button>
                    </div>
                    {applyDisabled && <p className="text-[11px] text-slate-300 text-right whitespace-pre-wrap [overflow-wrap:break-word] [word-break:normal] pb-1" data-testid="history-apply-disabled-reason">{applyDisabledReason(item, !!brokenIds[item.id])}</p>}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Preview */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-60 bg-black/95 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <div className="relative min-h-[40vh] w-full max-w-xl flex items-center justify-center border border-[#333] rounded-lg bg-[#111215] overflow-hidden">
              <PreviewMediaPanel
                id={selectedImage.id}
                url={selectedImage.url}
                broken={!!brokenIds[selectedImage.id]}
                onBroken={markBroken}
                onRecovered={clearBroken}
                kind="image"
                alt={selectedImage.prompt || ''}
                mediaClassName="max-h-[75vh] w-auto rounded-lg shadow-2xl object-contain border border-[#333]"
                failureHint="链接失效或无法拉取"
              />
            </div>
            <div className="mt-3 bg-[#18191d] border border-[#2e3038] p-4 rounded-xl text-center w-full max-w-2xl text-xs space-y-1.5">
              <p className={`font-medium ${selectedImage.prompt && selectedImage.prompt.trim() ? 'text-white' : 'text-slate-400 italic'}`}>
                {displayValue(selectedImage.prompt)}
              </p>
              {selectedResolved && <>
                <p className="text-slate-300 font-mono text-[11px]">
                  负向: {formatResolvedHistoryParameter(selectedResolved.negativePrompt)}{sourceBadge(selectedResolved.negativePrompt)}
                </p>
                <p className="text-slate-400 font-mono text-[11px]">
                  {displayValue(canonicalProviderLabel(selectedImage.actualProvider || selectedImage.provider))} | Model: {displayValue(selectedImage.actualModel || selectedImage.model)}
                </p>
                <p className="text-slate-300 font-mono text-[11px]">
                  Seed: {formatResolvedHistoryParameter(selectedResolved.seed)}{sourceBadge(selectedResolved.seed)} · Steps: {formatResolvedHistoryParameter(selectedResolved.steps, ' 步')}{sourceBadge(selectedResolved.steps)} · CFG: {formatResolvedHistoryParameter(selectedResolved.cfg)}{sourceBadge(selectedResolved.cfg)}
                </p>
                <p className="text-slate-300 font-mono text-[11px]">
                  Sampler: {formatResolvedHistoryParameter(selectedResolved.sampler)}{sourceBadge(selectedResolved.sampler)} · Scheduler: {formatResolvedHistoryParameter(selectedResolved.scheduler)}{sourceBadge(selectedResolved.scheduler)} · Size: {formatHistorySize(selectedResolved).text}
                </p>
              </>}
              <FieldOrigins item={selectedImage} />
              <p className="text-slate-300">LoRA: {selectedImage.loras?.length ? selectedImage.loras.map(l => `${l.name} × ${l.strength}`).join('；') : '未使用'}</p>
              {selectedResolved && <details className="text-left">
                <summary className="cursor-pointer text-cyan-300 py-2">请求值 / 实际发送 / 上游实际</summary>
                <pre className="max-h-60 overflow-auto whitespace-pre-wrap text-[11px] text-slate-300">{JSON.stringify({
                  parameters: Object.fromEntries(Object.entries(selectedResolved).map(([key, value]) => [key, {requested: value.requested ?? null, sent: value.sent ?? null, upstream: value.upstream ?? null, resolved: value.value ?? null, source: value.source}])),
                  requestMetadata: selectedImage.requestMetadata ?? '旧记录未保存',
                  workflowSnapshot: selectedImage.workflowSnapshot ?? '旧记录未保存',
                }, null, 2)}</pre>
              </details>}
            </div>
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-slate-800 text-white font-bold flex items-center justify-center hover:bg-slate-700"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};