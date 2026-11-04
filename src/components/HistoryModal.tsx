import { canonicalProviderLabel } from '../utils/providerLabels';
import React from 'react';
import { Download, Clock, Copy, Sparkles, Check, Image as ImageIcon, Trash2 } from 'lucide-react';
import { GenerationHistoryItem } from '../types/providers';
import { fetchHistoryItem } from '../services/api';
import { PreviewMediaPanel } from './PreviewMediaPanel';
import { EmphasizeLimit, UrlNoMidBreak, JsonNoMidBreak } from './TextEmphasis';
import { formatRecordTime } from '../services/executionTrace';
import { isApplyToCanvasDisabled, type PreviewSettleState } from '../utils/previewHang';
import { splitActualRequest, ACTUAL_META_LABEL } from '../utils/actualRequestDisplay';
import { requestedNotSentLoras, notSentLoraLabel, generationPostNotSent, historySeedStatement, historySeedRowText, historySeedUpstreamMissingNote, historyUpstreamTaskId, otherSentParameters, formatHistorySize, historySizeMismatchNote, formatResolvedHistoryParameter, hasOutputMedia, historyFieldOrigins, historyParameterSourceLabel, resolveHistoryParameters, sentHistoryLoras, historyModelSent, upstreamErrorMessage, historyKeyUsageLabels, historyActualRequest, isSchemaFetchFailure, historyUpstreamExchanges, groupUpstreamExchanges, terminalSuccessIndex, upstreamBodyStatus, upstreamSegmentStatusLabel, upstreamCallTime, upstreamSegmentLabel, extractUpstreamEcho, upstreamEchoContrast, unwrapGenerationParameters, valueAtPath, type UpstreamExchangeRow, type ResolvedHistoryParameter } from '../utils/historyParameters';
import { PROVIDER_UPSTREAM_ECHO_PATH } from '../config/providerDisplayHints';

/** Card timestamp in the viewer's local zone (same formatter as the exec log). */
/**
 * fix17: history filter. 「失败」= every generation record without output media (上游失败 + 没有发出去 + 其他).
 * hist-count-2026-10-17: failed parameter-table GETs are their own chip 「查参数表失败」 (shown only when present),
 * so 全部 = 已出图 + 失败 + 查参数表失败. The cards themselves stay visible under 全部.
 */
export type { HistoryCounts } from '../utils/historyCounts';
import type { HistoryCounts } from '../utils/historyCounts';
/** fix17: one-line fold status — the same status text the expanded card shows (no new wording). */
export function historyFailStatusText(item: GenerationHistoryItem): string {
  if (item.status === 'local_blocked') return item.statusLabel || '没有发出去';
  return item.upstreamStatus != null ? `HTTP ${item.upstreamStatus}${item.upstreamStatusText ? ` ${item.upstreamStatusText}` : ''}` : (item.networkError ? '网络错误（无状态码）' : '无上游状态码');
}
/** fix17: first line of the upstream original text, verbatim (no rewriting). */
export function historyFailFirstLine(item: GenerationHistoryItem): string {
  const raw = (item.status === 'failed' ? upstreamErrorMessage(item.upstreamResponseBody) : undefined) ?? (typeof item.upstreamResponseBody === 'string' ? item.upstreamResponseBody : undefined) ?? item.networkError?.message ?? item.error ?? '';
  return String(raw).split(/\r?\n/).find((l) => l.trim() !== '') ?? '';
}

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
  'passed-through': 'text-sky-200 bg-sky-950/50 border border-sky-500/50',
  intended: 'text-amber-100 bg-transparent border-2 border-dashed border-amber-300/80 italic',
  unsupported: 'text-slate-200 bg-slate-900 border border-dashed border-rose-400/70',
  unknown: 'text-slate-500 border border-slate-700',
};

/** Shape glyph per status so the three main chips differ even at thumbnail size / without colour: ● solid, ◌ dashed, ⊘ struck. */
export const SOURCE_GLYPH: Partial<Record<ResolvedHistoryParameter['source'], string>> = { sent: '●', upstream: '●', intended: '◌', unsupported: '⊘', 'not-sent': '○', blocked: '⛔' };
export const sourceChipText = (source: ResolvedHistoryParameter['source']) => `${SOURCE_GLYPH[source] ? `${SOURCE_GLYPH[source]} ` : ''}${historyParameterSourceLabel(source)}`;
/** Size row chip: show for blocked (没有发出去) and unsupported; hide only empty/unknown/plain 未发送. */
export const historySizeChipVisible = (source: ResolvedHistoryParameter['source'], hasCanvasValue: boolean) => !!hasCanvasValue && source !== 'not-sent' && source !== 'unknown';
const sourceBadge = (_param: ResolvedHistoryParameter): React.ReactNode => null;
const _legacySourceBadge = (param: ResolvedHistoryParameter) => {
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
    {value && typeof value === 'object' && typeof (value as any).credential === 'string' && <p className="text-[11px] text-slate-400 mb-0.5 font-mono break-all" data-testid={`${testId}-credential`} title="本次使用的密钥槽与来源（已掩码，不是请求体内容）">密钥：{(value as any).credential}</p>}
    <JsonNoMidBreak value={sent ?? null} className="max-h-[28rem] min-h-[8rem] overflow-y-auto overflow-x-auto whitespace-pre-wrap break-all [overflow-wrap:anywhere] font-mono text-[11px]" testId={testId} />
    {meta && <details className="mt-1 text-slate-500"><summary className="cursor-pointer">{ACTUAL_META_LABEL}</summary><JsonNoMidBreak value={meta} className="max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px]" /></details>}
  </>;
};

/** fix3 F: upstream echo JSON (non-ours). Do not auto-fetch /api/media/raw on list mount — only when user expands. */
const UpstreamEchoBlock: React.FC<{ item: GenerationHistoryItem }> = ({ item }) => {
  const providerKey = String(item.actualProvider || item.provider || '').toLowerCase().replace(/[^a-z]/g, '');
  const id = (['wavespeed','muapi','sogni','aimlapi','krea','together','novita','venice'] as const).find((p) => providerKey.includes(p)) || providerKey;
  const echoPath = PROVIDER_UPSTREAM_ECHO_PATH[id];
  const inlineEcho = React.useMemo(() => (echoPath ? extractUpstreamEcho(item, echoPath) : null), [item, echoPath]);
  const [open, setOpen] = React.useState(false);
  const [echo, setEcho] = React.useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = React.useState(false);
  React.useEffect(() => {
    if (!echoPath) { setEcho(null); return; }
    if (inlineEcho) { setEcho(inlineEcho); return; }
    if (!open) return;
    const rows = historyUpstreamExchanges(item);
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        for (const r of rows) {
          const ref = r.responseBody && typeof r.responseBody === 'object' && (r.responseBody as any).kind === 'raw-response' ? r.responseBody as any : null;
          if (!ref?.url) continue;
          try {
            const res = await fetch(ref.url); const t = await res.text(); if (!res.ok) continue;
            const j = JSON.parse(t); const v = valueAtPath(j, echoPath);
            if (v && typeof v === 'object' && !Array.isArray(v) && !cancelled) { setEcho(v as Record<string, unknown>); return; }
          } catch { /* next */ }
        }
        if (!cancelled) setEcho(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [item, echoPath, inlineEcho, open]);
  if (!echoPath) return null;
  if (inlineEcho || echo) {
    const shown = echo || inlineEcho;
    const actual = historyActualRequest(item);
    const sent = unwrapGenerationParameters(actual) as Record<string, unknown> | undefined;
    const rows = upstreamEchoContrast(sent, shown!);
    return (
      <div className="mt-2 rounded border border-violet-700/50 bg-violet-950/30 p-2" data-testid="history-upstream-echo">
        <p className="text-[11px] font-semibold text-violet-200 mb-1">上游回显（非我方请求体）</p>
        <JsonNoMidBreak value={shown} className="max-h-48 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] text-violet-100" testId="history-upstream-echo-json" />
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
  }
  // List payloads omit executionTrace — offer explicit expand instead of N× /api/media/raw on open.
  if (!(item as any).requestMetadata?.hasExecutionTrace && !historyUpstreamExchanges(item).length) return null;
  return (
    <details className="mt-2 rounded border border-violet-700/50 bg-violet-950/30 p-2" data-testid="history-upstream-echo" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-[11px] font-semibold text-violet-200">上游回显（点开加载）</summary>
      {loading && <p className="text-[11px] text-violet-200/80 mt-1">加载中…</p>}
      {!loading && open && !echo && <p className="text-[11px] text-slate-400 mt-1">无上游回显</p>}
    </details>
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


/** Sources that mean the value really went upstream (or came back from it). Anything else is omitted from the caption. */
const SENT_SOURCES = new Set<ResolvedHistoryParameter['source']>(['sent', 'upstream', 'image-metadata', 'passed-through', 'requested', 'legacy']);
const CAPTION_LABEL: Record<string, string> = { negativePrompt: '负向', seed: 'Seed', steps: 'Steps', cfg: 'CFG', sampler: 'Sampler', scheduler: 'Scheduler', size: 'Size' };
/** Big-image caption: one line of `Label: value` joined by · for only the fields actually sent; '' entries dropped. */
export const historyCaptionSent = (resolved: Record<string, ResolvedHistoryParameter>, keys: string[]): string[] => {
  const parts = keys.flatMap((k) => {
    if (k === 'size') {
      const sz = formatHistorySize(resolved as any);
      return sz.text && SENT_SOURCES.has(sz.source) && sz.source !== 'blocked' ? [`Size: ${sz.text}`] : [];
    }
    const p = resolved[k];
    if (!p || !SENT_SOURCES.has(p.source)) return [];
    if (p.value === undefined || p.value === null || String(p.value).trim() === '') return [];
    return [`${CAPTION_LABEL[k]}: ${formatResolvedHistoryParameter(p, k === 'steps' ? ' 步' : '')}`];
  });
  return parts.length ? [parts.join(' · ')] : [];
};
/** Card face LoRA line: name × strength under the existing 「LoRA」 label (same format as the big-image caption). */
export const historyFaceLoraText = (loras: { name: string; strength?: unknown }[]): string =>
  `LoRA: ${loras.map((l) => (l.strength === undefined ? l.name : `${l.name} × ${String(l.strength)}`)).join('；')}`;
/** History card face: plain values only (模型 / LoRA强度 / 种子 / 尺寸 / 提示词) + at most ONE plain reminder line. No per-field badges. */
export const historyCardReminder = (item: GenerationHistoryItem, resolved: Record<string, ResolvedHistoryParameter>, unsupportedRows: UnsupportedRow[]): string => {
  if (item.status === 'local_blocked') return `没有发出去：${String(item.error || '').split('\n')[0]}`;
  if (item.status === 'failed') {
    const m = upstreamErrorMessage(item.upstreamResponseBody);
    const code = item.upstreamStatus != null ? `HTTP ${item.upstreamStatus}` : item.networkError ? '网络错误' : '';
    return `失败${code ? `（${code}）` : ''}：${m || String(item.error || item.networkError?.message || '').split('\n')[0]}`;
  }
  return unusedLineText(unsupportedRows) || historySizeMismatchNote(resolved as any) || '';
};
const HistoryCardFace: React.FC<{ item: GenerationHistoryItem; resolved: Record<string, ResolvedHistoryParameter>; unsupportedRows: UnsupportedRow[] }> = ({ item, resolved, unsupportedRows }) => {
  const loras = sentHistoryLoras(item);
  const size = formatHistorySize(resolved as any);
  const seed = resolved.seed?.value;
  return (
    <div className="px-3 py-2 text-[11px] text-slate-300 font-mono space-y-0.5" data-testid="history-card-face">
      <p data-testid="history-face-model">模型: {displayValue(item.actualModel || item.model)}</p>
      {loras.length > 0 && <p data-testid="history-face-loras" className="[overflow-wrap:anywhere]">{historyFaceLoraText(loras)}</p>}
      {seed !== undefined && seed !== null && seed !== '' && resolved.seed && SENT_SOURCES.has(resolved.seed.source) && <p data-testid="history-face-seed">种子: {String(seed)}</p>}
      {size.text && SENT_SOURCES.has(size.source) && <p data-testid="history-face-size">尺寸: {size.text}</p>}
    </div>
  );
};
/** Why 「应用到画布」 is disabled — shown as tooltip + visible hint. */
export const applyDisabledReason = (item: GenerationHistoryItem, broken: boolean): string => {
  if (item.status === 'local_blocked') return '没有发出去：这次没有出图，没有结果可应用到画布';
  if (item.status === 'failed') return '上游请求失败：这次没有出图，没有结果可应用到画布';
  if (!item.url) return '这条记录没有输出图片，无法应用到画布';
  if (broken) return '预览加载失败，无法应用到画布';
  return '';
};


/** Fetch full record when slim list omitted workflowSnapshot (hasWorkflowSnapshot flag). */
export async function resolveHistoryItemForApply(
  item: GenerationHistoryItem & { hasWorkflowSnapshot?: boolean },
  fetchFn: (id: string) => Promise<GenerationHistoryItem> = fetchHistoryItem,
): Promise<GenerationHistoryItem & { hasWorkflowSnapshot?: boolean }> {
  if (item.hasWorkflowSnapshot && !item.workflowSnapshot) {
    return await fetchFn(item.id);
  }
  return item;
}


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
  /** fix16 #4: fold header already says 「未发送（Schema 未记录）」 — row value must not repeat that label. */
  /** fix11.1 #3: size with no canvas value must still show a cell — use em dash, never blank 「尺寸: 」. */
  const unrecordedCell = (k: string, _l: string) => {
    if (k === 'size') {
      const size = formatHistorySize(resolved as any);
      if (size.canvasValue) return size.canvasValue;
      return '—';
    }
    const p = resolved[k];
    if (p && p.value !== undefined && p.value !== null && p.value !== '') return String(p.value);
    return '—';
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
export type UnsupportedRow = { key: 'seed' | 'steps' | 'cfg' | 'sampler' | 'scheduler' | 'size' | 'negativePrompt'; label: string; value?: string };
export function historyUnsupportedRows(resolved: Record<string, ResolvedHistoryParameter>): UnsupportedRow[] {
  const out: UnsupportedRow[] = [];
  // Board value: resolved value, else the canvas value recorded as requested / mapping sent:false (never shown as 实际发送).
  const fmt = (x: unknown) => (x !== undefined && x !== null && x !== '' ? String(x) : undefined);
  const v = (p?: ResolvedHistoryParameter) => (p ? fmt(p.value) ?? fmt(p.requested) : undefined);
  const one = (key: UnsupportedRow['key'], label: string) => { const p = resolved[key]; if (p?.source === 'unsupported') out.push({ key, label, value: v(p) }); };
  one('seed', '种子'); one('steps', '步数'); one('cfg', 'CFG'); one('sampler', '采样器'); one('scheduler', '调度器');
  const size = formatHistorySize(resolved as any);
  if (size.source === 'unsupported') out.push({ key: 'size', label: '尺寸', value: size.canvasValue });
  one('negativePrompt', '负向');
  return out;
}
/** cleanup-2026-10-17: ONE line 「这次没用上：…」 listing only user-filled params the endpoint Schema does not declare. No fold wall. */
export const unusedLineText = (rows: UnsupportedRow[]) => {
  const filled = rows.filter((r) => r.value !== undefined);
  return filled.length ? `这次没用上：${filled.map((r) => `${r.label} ${r.value}`).join('、')}（该端点不支持，未发送）` : '';
};
const UnsupportedFold: React.FC<{ rows: UnsupportedRow[] }> = ({ rows }) => {
  const text = unusedLineText(rows);
  if (!text) return null;
  return <p className="text-[11px] text-slate-400 whitespace-normal [overflow-wrap:anywhere]" data-testid="history-unused-line">{text}</p>;
};

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: GenerationHistoryItem[];
  /** Server-side pagination: parent loads slim pages via fetchHistoryPage. */
  hasMore?: boolean;
  historyTotal?: number;
  /** Counts over the whole server history (from /api/history). When present, header/chips use them, not the loaded page. */
  historyCounts?: HistoryCounts;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onApplyPrompt: (prompt: string, negPrompt?: string) => void;
  /** Full apply: image → SaveImage + params + optional workflow snapshot. Prefer this over onApplyPrompt. */
  onApplyToCanvas?: (item: GenerationHistoryItem) => void | Promise<void>;
  onDeleteItem: (id: string) => void;
  onClearAll: () => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  onClose,
  history,
  hasMore = false,
  historyTotal,
  historyCounts,
  loadingMore = false,
  onLoadMore,
  onApplyPrompt,
  onApplyToCanvas,
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
  const downloadProvenance = async (item: GenerationHistoryItem) => {
    let full = item;
    if ((item as any).hasWorkflowSnapshot && !item.workflowSnapshot) {
      try { full = await fetchHistoryItem(item.id); } catch { /* export slim record */ }
    }
    const resolved = resolveHistoryParameters(full);
    const body = {format: 'comfycanvas-generation', version: 2, provider: full.actualProvider || full.provider, model: full.actualModel || full.model, parameters: Object.fromEntries(Object.entries(resolved).map(([key,value])=>[key,{value:value.value ?? null,source:value.source,requested:value.requested ?? null,sent:value.sent ?? null,upstream:value.upstream ?? null}])), loras: full.loras, requestMetadata: full.requestMetadata, workflowSnapshot: full.workflowSnapshot};
    const url = URL.createObjectURL(new Blob([JSON.stringify(body, null, 2)], {type: 'application/json'}));
    handleDownload(url, `generation-${full.id}.json`);
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
  const outputCount = historyCounts?.output ?? history.filter(hasOutputMedia).length;
  const visibleHistory = history;
  const showLoadMore = !!onLoadMore && hasMore;
  const partialLoaded =
    (typeof historyTotal === 'number' && historyTotal > history.length) || hasMore;
  // Server count covers all records → never 「已载」; only the loaded-page fallback is partial.
  const countsPartial = !historyCounts && partialLoaded;

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
                  {outputCount} 张出图{countsPartial ? '（已载）' : ''}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                查看生成结果与工作流，导出 JSON 以便复用
                {typeof historyTotal === 'number' && historyTotal > 0 ? (
                  <span className="ml-2 text-slate-500" data-testid="history-page-meta">已加载 {history.length} / 共 {historyTotal}</span>
                ) : null}
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
              {visibleHistory.map((item) => {
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
                  data-card-state="success"
                  className="bg-[#1e2026] border rounded-xl overflow-hidden shadow-lg flex flex-col min-w-0 group transition-all border-emerald-500/70 border-t-4 border-t-emerald-400"
                >
                  {(() => { const cardBody = (<>
                  <div className="px-3 pt-2.5 pb-2 border-b border-[#2d303a] space-y-0.5" data-testid="history-card-meta">
                    <p className={`text-xs font-medium whitespace-normal [overflow-wrap:anywhere] line-clamp-3 ${item.prompt && item.prompt.trim() ? 'text-slate-100' : 'text-slate-400 italic'}`} title={item.prompt || ''} data-testid="history-card-title">{displayValue(item.prompt)}</p>
                    {/* Re-runs share a prompt: the run's own time + history id are the distinguishing line, so they're prominent (no invented marker). */}
                    <p className="text-xs text-cyan-100 font-mono font-semibold flex flex-wrap gap-x-2">
                      <span data-testid="history-card-time">{historyCardTime(item.timestamp)}</span>
                      <span data-testid="history-card-id" className="text-cyan-200/90 [overflow-wrap:break-word] [word-break:normal]">ID {item.id}</span>
                    </p>
                  </div>
                  {(
                  <div className="relative aspect-square bg-[#111215] overflow-hidden cursor-pointer" data-testid="history-output-thumb" onClick={() => setSelectedImage(item)}>
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
                      videoProps={{ loop: true, muted: true, preload: 'none' }}
                    />
                    {hasOutputMedia(item) && <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[11px] font-bold" data-testid="history-success-badge">✓ 出图成功</div>}
                    <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-[11px] font-mono text-cyan-300 border border-cyan-500/30">
                      {displayValue(canonicalProviderLabel(item.actualProvider || item.provider))}
                    </div>
                  </div>
                  )}

                  {hasOutputMedia(item) && <HistoryCardFace item={item} resolved={resolved} unsupportedRows={unsupportedRows} />}
                  <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">

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
                        onClick={async () => {
                          if (applyDisabled) return;
                          if (onApplyToCanvas) {
                            // App fetches the full record and shows the raw error if that fails.
                            await onApplyToCanvas(item as GenerationHistoryItem & { hasWorkflowSnapshot?: boolean });
                          } else {
                            onApplyPrompt(item.prompt || '', item.negativePrompt || undefined);
                          }
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
                        照这组参数再来一张
                      </button>
                    </div>
                  </div>
                  </>); return cardBody; })()}
                </div>
                );
              })}
            </div>
          )}
        </div>
        {showLoadMore && (
          <div className="shrink-0 px-6 py-3 border-t border-[#2e3038] bg-[#141518]" data-testid="history-load-more-wrap">
            <button
              type="button"
              data-testid="history-load-more"
              disabled={loadingMore}
              className="w-full py-2 rounded-lg border border-slate-600 text-slate-200 text-sm hover:bg-slate-800/60 disabled:opacity-50"
              onClick={() => onLoadMore?.()}
            >
              {loadingMore
                ? '加载中…'
                : `加载更多${typeof historyTotal === 'number' ? `（已加载 ${history.length} / 共 ${historyTotal}）` : ''}`}
            </button>
          </div>
        )}
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
                {historyCaptionSent(selectedResolved, ['negativePrompt']).map((t) => <p key={t} className="text-slate-300 font-mono text-[11px]">{t}</p>)}
                <p className="text-slate-400 font-mono text-[11px]">
                  {displayValue(canonicalProviderLabel(selectedImage.actualProvider || selectedImage.provider))} | Model: {displayValue(selectedImage.actualModel || selectedImage.model)}
                </p>
                {historyCaptionSent(selectedResolved, ['seed', 'steps', 'cfg']).map((t) => <p key={t} className="text-slate-300 font-mono text-[11px]">{t}</p>)}
                {historyCaptionSent(selectedResolved, ['sampler', 'scheduler', 'size']).map((t) => <p key={t} className="text-slate-300 font-mono text-[11px]">{t}</p>)}
              </>}
              <p className="text-slate-300">LoRA: {selectedImage.loras?.length ? selectedImage.loras.map(l => `${l.name} × ${l.strength}`).join('；') : '未使用'}</p>
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