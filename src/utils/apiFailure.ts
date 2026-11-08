import { formatBeijingHms } from '../services/executionTrace';
import { isSchemaPrefetchError, schemaFailureToast } from './schemaFailure';

export interface ReadResponseBody {
  status: number;
  statusText: string;
  /** Verbatim response body text, exactly as received. */
  text: string;
  /** Parsed JSON when the body is valid JSON, otherwise undefined. */
  json: any;
}

/** Reads an HTTP response body once as text and tries JSON.parse; the raw text is always kept. */
export async function readResponseBody(resp: Response): Promise<ReadResponseBody> {
  let text = '';
  try {
    text = await resp.text();
  } catch (e: any) {
    text = `[响应体读取失败: ${e?.message || String(e)}]`;
  }
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: resp.status, statusText: resp.statusText || '', text, json };
}

function stringifyField(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * Message for a failed HTTP response: real `HTTP <status>` plus the verbatim upstream body.
 * When the body is a JSON object, the first present field of `fields` is shown; if none is present
 * (or the body is not JSON) the raw body text is shown unchanged.
 */
export function httpErrorMessageFromBody(body: ReadResponseBody, fields: string[] = ['details', 'error']): string {
  const head = `HTTP ${body.status}${body.statusText ? ` ${body.statusText}` : ''}`;
  let detail = body.text;
  if (body.json && typeof body.json === 'object' && !Array.isArray(body.json)) {
    for (const f of fields) {
      const v = body.json[f];
      if (v !== undefined && v !== null && v !== '') {
        detail = stringifyField(v);
        break;
      }
    }
  }
  return detail.trim() ? `${head}: ${detail}` : `${head}: (空响应体)`;
}

/** Builds the Error for a failed response (reads the body once). */
export async function httpErrorFromResponse(resp: Response, fields?: string[]): Promise<Error> {
  const body = await readResponseBody(resp);
  return Object.assign(new Error(httpErrorMessageFromBody(body, fields)), { status: body.status, responseBody: body.text });
}

/**
 * Strips local server-side wrapper strings (e.g. "Mage 图像接口上游 HTTP 402: ", "Civitai Orchestration 官方算力返回错误 [400]: ")
 * so the genuine, verbatim upstream response body is preserved and exposed.
 */
export function stripLocalWrapperPrefix(text: string): string {
  if (!text) return '';
  const str = String(text);
  const trimmed = str.trim();
  // If it's a JSON object or array, it's verbatim upstream structure — NEVER strip.
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return text;
  }
  // Wrapper prefix must be at the very start, containing provider/API wrapper keywords,
  // before any JSON or quotation, followed by colon or space.
  // E.g. "Civitai Orchestration 官方算力返回错误 [400]: " or "Mage 图像接口上游 HTTP 402: "
  const prefixMatch = trimmed.match(/^[a-zA-Z0-9\u4e00-\u9fa5\s_.-]+?(?:返回错误|执行失败|提交失败|接口上游|接口错误|鉴权失败|API 提交失败)\s*(?:\[\d+\]|HTTP\s*\d+)?[:：]\s*/i);
  if (prefixMatch && prefixMatch[0].length < trimmed.length) {
    return trimmed.slice(prefixMatch[0].length);
  }
  return text;
}

/** Pull upstream message/error from a JSON body fragment (402/403 billing etc.). Never invent copy. */
export function extractUpstreamMessage(text: string): string | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const obj = JSON.parse(jsonMatch[0]);
    if (typeof obj?.message === 'string' && obj.message.trim()) return obj.message.trim();
    if (typeof obj?.error === 'string' && obj.error.trim()) return obj.error.trim();
    if (obj?.error && typeof obj.error === 'object' && typeof obj.error.message === 'string' && obj.error.message.trim()) {
      return obj.error.message.trim();
    }
    // ModelScope / Magento: {"errors":{"message":"Please bind your Alibaba Cloud account…"}}
    if (obj?.errors && typeof obj.errors === 'object' && typeof obj.errors.message === 'string' && obj.errors.message.trim()) {
      return obj.errors.message.trim();
    }
  } catch {
    /* not JSON — leave original */
  }
  return null;
}

/**
 * Billing / funds failures — 透传上游原文, never Chinese rewrite, never mid-message `…` clip.
 * Includes HTTP 402 and AIMLAPI-style HTTP 403 "run out of funds" / err_insufficent_credits.
 * Does NOT treat Cloudflare challenge 403 as billing.
 */
export function isBillingFailureText(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = String(text);
  if (/HTTP\s*402/i.test(t) || /Payment Required/i.test(t)) return true;
  if (/API balance/i.test(t) && /top\s*up/i.test(t)) return true;
  if (/insufficient (?:credits?|balance)|no remaining credits|余额不足|额度不足/i.test(t)) return true;
  if (/run out of funds|err_insufficent_credits|err_insufficient_credits/i.test(t)) return true;
  if (/HTTP\s*403/i.test(t) && /(?:funds|billing|credits|top\s*up|balance)/i.test(t) && !/cf_chl|challenges\.cloudflare/i.test(t)) {
    return true;
  }
  return false;
}

/**
 * Primary banner / toast / node line for any thrown Error.
 * Billing / funds & all upstream errors: full upstream message verbatim, no ellipsis.
 */
export function plainErrorMessage(err: unknown): string {
  const rangeWarning = err && typeof err === 'object' && typeof (err as any).data?.loraRangeWarning === 'string'
    ? String((err as any).data.loraRangeWarning)
    : '';
  const withRangeWarning = (message: string) => rangeWarning && !message.includes(rangeWarning)
    ? `${message}；${rangeWarning}`
    : message;

  if (err && typeof err === 'object') {
    const data = (err as any).data;
    if (data) {
      if (isLocalNotOutbound(data)) return withRangeWarning(localNotOutboundText(data));
      const line = upstreamHttpFirstLine(data);
      if (line) return withRangeWarning(line);
    }
  }

  const raw = err instanceof Error ? err.message : String(err ?? '执行遇到错误');
  // Local rejection: verbatim, no rewrite / slice — must not look like upstream failure or success.
  if (raw.startsWith('没有发出去') || raw.startsWith('没有发出去 · ')) return withRangeWarning(raw);
  return withRangeWarning(stripLocalWrapperPrefix(raw) || raw);
}

/** Node / frame error banner: verbatim error text without clipping or summary rewrite. */
export function errorBannerText(detail: string | null | undefined): string {
  if (!detail) return '';
  const text = String(detail).trim();
  // Local rejection: verbatim, no rewrite / slice — must not look like upstream failure or success.
  if (text.startsWith('没有发出去') || text.startsWith('没有发出去 · ')) return text;
  return stripLocalWrapperPrefix(text) || text;
}

/**
 * clean-1651: upstream failure badge must read as a prior-run result, never as "this run".
 * Format: 「上一次 · {banner} · 北京时间 HH:MM:SS」.
 */
export function priorRunErrorLabel(detail: string | null | undefined, errorAt?: string | null): string {
  const body = errorBannerText(detail);
  if (!body) return '';
  const clock = errorAt ? formatBeijingHms(errorAt) : '';
  return clock ? `上一次 · ${body} · 北京时间 ${clock}` : `上一次 · ${body}`;
}

/** Unicode-safe slice that never cuts mid-grapheme (avoids truncating at 「见」). */
export function unicodeSafeSlice(text: string, maxChars: number): string {
  const chars = Array.from(text);
  if (chars.length <= maxChars) return text;
  return chars.slice(0, maxChars).join('') + '…';
}

/**
 * Verbatim error line for upstream failures.
 * Keeps status, status text, and response body as returned (full text, no ellipsis, no dropping JSON).
 */
export function shortUpstreamSummary(detail: string | null | undefined): string {
  if (!detail) return '';
  const text = String(detail).trim();
  if (text.startsWith('没有发出去') || text.startsWith('没有发出去 · ')) return text;
  return text;
}


export const LOCAL_NOT_OUTBOUND = '没有发出去';

/** True when the server rejected locally and no generation request (non-GET) reached any upstream. */
export function isLocalNotOutbound(data: any): boolean {
  if (!data || typeof data !== 'object' || data.errorSource !== 'local') return false;
  // trace-fix2 P3: a task poll carries only its own GET in executionTrace; the task ledger (taskExecutionTrace) and a
  // recorded history card that went upstream prove the generation POST already left → never 「没有发出去」.
  const traces = [
    ...(Array.isArray(data.executionTrace) ? data.executionTrace : []),
    ...(Array.isArray(data.taskExecutionTrace) ? data.taskExecutionTrace : []),
    ...(Array.isArray(data.historyItem?.requestMetadata?.executionTrace) ? data.historyItem.requestMetadata.executionTrace : []),
  ];
  if (data.historyItem && typeof data.historyItem === 'object' && data.historyItem.status && data.historyItem.status !== 'local_blocked' && data.historyItem.requestMetadata?.postSent !== false) return false;
  return !traces.some((t: any) => t && t.endpoint && t.method && t.method !== 'GET' && !t.readOnly);
}

/** 「没有发出去：<本地错误原文>」 — reason verbatim, never sliced. */
export function localNotOutboundText(data: any): string {
  const detail = data?.error ?? (typeof data === 'string' ? data : '');
  const text = String(detail);
  if (text.startsWith('没有发出去 · ')) return text;
  // clean-1333 #3: the submit route read (or reused) the Schema before refusing — never claim nothing went out.
  const gets = data && typeof data === 'object' && Array.isArray(data.executionTrace) ? data.executionTrace.filter((t: any) => String(t?.method || '').toUpperCase() === 'GET' || t?.readOnly) : [];
  const schemaFailed = !!(data?.schemaRead?.failed || (!data?.schemaRead && gets.length && gets.some((t: any) => t.status === null || t.status >= 400)));
  if (schemaFailed) return `没有发出去：${text.replace(/^没有发出去[：:]?\s*/, '')}`;
  const schemaRead = !!(data && typeof data === 'object' && (data.schemaRead || gets.length));
  if (schemaRead) return `没有发出去：${text.replace(/^没有发出去[：:]?\s*/, '')}`;
  return text.startsWith(LOCAL_NOT_OUTBOUND) ? text : `${LOCAL_NOT_OUTBOUND}：${text}`;
}

/**
 * clean-1029: structured upstream failure — status, status text and the upstream body VERBATIM (never a re-worded message).
 * One source for upstreamHttpFirstLine (node / status bar) and the toast (title 「HTTP <code>」, first line = body).
 */
/** Generic task-status line from a poll/submit body: status/state (+ waitingReason / pauseReason / error string). No provider field names hard-coded beyond common keys. */
export function taskStatusLine(data: any): string {
  if (!data || typeof data !== 'object') return '';
  const hist = data.historyItem && typeof data.historyItem === 'object' ? data.historyItem : null;
  if (typeof hist?.upstreamStatusText === 'string' && hist.upstreamStatusText.trim()) return hist.upstreamStatusText.trim();
  if (typeof data.upstreamStatusText === 'string' && data.upstreamStatusText.trim()) return data.upstreamStatusText.trim();
  const st = typeof data.status === 'string' ? data.status.trim() : '';
  const reason = [data.waitingReason, data.pauseReason, data.pausedReason]
    .find((x) => typeof x === 'string' && x.trim()) as string | undefined;
  const err = typeof data.error === 'string' && data.error.trim() ? data.error.trim().split(/\r?\n/)[0] : '';
  const parts = [
    st ? `status: ${st}` : '',
    reason ? reason : '',
    err && err !== st && err !== reason ? err : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

function coerceResponseBodyText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  if (typeof value === 'object' && (value as any).kind === 'raw-response') return ''; // externalized; caller should use upstreamResponseBody / historyItem
  try { return JSON.stringify(value); } catch { return String(value); }
}

function extractProviderFromRoute(route?: string): string | undefined {
  if (!route) return undefined;
  const match = route.match(/\/api\/(?:engine|schema-provider)\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  const directMatch = route.match(/\/api\/([a-zA-Z0-9_-]+)\/(?:generate|submit)/);
  if (directMatch) return directMatch[1];
  return undefined;
}

export function findFailingTrace(traces: any[]): any | undefined {
  if (!Array.isArray(traces) || traces.length === 0) return undefined;
  const isFailed = (t: any) => (typeof t?.status === 'number' && t.status >= 400) || t?.status === null;
  // Prefer real HTTP exchanges (skipping stage: 'key-attempt' bookkeeping rows that lack statusText/endpoint/method)
  const httpExchange = [...traces].reverse().find((t: any) =>
    isFailed(t) && t?.stage !== 'key-attempt' && (t?.statusText || t?.endpoint || t?.method)
  );
  if (httpExchange) return httpExchange;
  // If only key-attempt or non-exchange rows exist, use the latest failed trace as-is
  return [...traces].reverse().find(isFailed);
}

export function upstreamFailureParts(data: any): { status: number; statusText: string; body: string; provider?: string } | null {
  if (!data || typeof data !== 'object') return null;
  // A local block before the generation request has no upstream failure: never headline a successful catalog/Schema read (e.g. HTTP 200 /tool/list).
  if (isLocalNotOutbound(data)) return null;
  const traces = Array.isArray(data.executionTrace) ? data.executionTrace : Array.isArray(data.taskExecutionTrace) ? data.taskExecutionTrace : [];
  const failed = findFailingTrace(traces);
  const hist = data.historyItem && typeof data.historyItem === 'object' ? data.historyItem : null;
  const status = failed?.status
    ?? (typeof data.upstreamStatus === 'number' ? data.upstreamStatus : null)
    ?? (typeof hist?.upstreamStatus === 'number' ? hist.upstreamStatus : null);
  if (status == null) return null;
  let authoritative: string | undefined = undefined;
  if (typeof data.rawResponse === 'string') {
    authoritative = data.rawResponse;
  } else if (data.rawResponse != null && (typeof data.rawResponse !== 'object' || (data.rawResponse as any).kind !== 'raw-response')) {
    authoritative = coerceResponseBodyText(data.rawResponse);
  } else if (typeof data.upstreamResponseBody === 'string') {
    authoritative = data.upstreamResponseBody;
  } else if (typeof hist?.upstreamResponseBody === 'string') {
    authoritative = hist.upstreamResponseBody;
  } else if (typeof failed?.responseBody === 'string') {
    authoritative = failed.responseBody;
  }

  let body: string;
  if (authoritative !== undefined) {
    body = authoritative;
  } else {
    const fallback = (
      typeof data.details === 'string' && data.details.trim() ? data.details
      : typeof data.error === 'string' && data.error.trim() ? data.error
      : typeof hist?.error === 'string' && hist.error.trim() ? hist.error
      : ''
    );
    body = stripLocalWrapperPrefix(fallback) || fallback;
    const httpPrefix = body.match(/^HTTP\s+\d{3}(?:\s+[A-Za-z ]+)?[:：\s]\s*/i);
    if (httpPrefix && httpPrefix[0].length < body.length) {
      const afterHttp = body.slice(httpPrefix[0].length).trim();
      if (afterHttp.startsWith('{') || afterHttp.startsWith('[') || afterHttp.length > 0) {
        body = afterHttp;
      }
    }
  }

  // Prefer explicit HTTP statusText / upstreamStatusText. Task-status line (waiting_for_user …) only for non-4xx/5xx.
  const explicit = (typeof failed?.statusText === 'string' && failed.statusText.trim() ? failed.statusText.trim() : '')
    || (typeof data.upstreamStatusText === 'string' && data.upstreamStatusText.trim() ? data.upstreamStatusText.trim() : '')
    || (typeof hist?.upstreamStatusText === 'string' && hist.upstreamStatusText.trim() ? hist.upstreamStatusText.trim() : '');
  const statusText = explicit || (status < 400 ? taskStatusLine(data) : '');
  const provider = failed?.provider || data?.provider || hist?.provider || extractProviderFromRoute(data?.route || failed?.route);
  return { status, statusText, body, provider };
}
export const TOAST_BODY_FIRST_LINE_MAX = 400;
/** Toast for an upstream HTTP failure: title 「【provider】HTTP <code> <statusText>」; message = upstream body verbatim. */
/** clean-1149 #1: run-catch toast. Prefer structured err.data; else SchemaPrefetchError / any Error carrying upstreamStatus. */
export function toastFromRunError(err: any, runLine?: string): { title: string; message: string; provider?: string; status?: number; localWrapper?: string } | null {
  // Schema lookup miss: title = plain headline (full model name); body = one status line.
  // Never title 「HTTP N」 (contradicted 「生成请求没有发出去」) and never 「HTTP N · HTTP N」.
  if (isSchemaPrefetchError(err) || (err && typeof err === 'object' && err.name === 'SchemaPrefetchError')) {
    return schemaFailureToast(err, runLine);
  }
  const data = err?.data;
  const fromData = upstreamFailureToast(data, runLine);
  if (fromData) return fromData;
  // Legacy message-only schema prefetch (name missing but message shape matches).
  if (err && typeof err === 'object' && /GET .+ → HTTP \d+/.test(String(err.message || ''))) {
    return schemaFailureToast(err, runLine);
  }
  return null;
}

export function upstreamFailureToast(data: any, _runLine?: string): { title: string; message: string; provider?: string; status?: number; localWrapper?: string } | null {
  const parts = upstreamFailureParts(data);
  if (!parts) return null;
  const prov = parts.provider;
  const provPrefix = prov ? `【${prov}】` : '';
  const sep = parts.statusText ? ' ' : '';
  const title = `${provPrefix}HTTP ${parts.status}${sep}${parts.statusText}`.trim();
  const localWrapper = typeof data?.localWrapper === 'string' && data.localWrapper !== parts.body
    ? data.localWrapper
    : undefined;
  return {
    title,
    message: parts.body,
    provider: prov,
    status: parts.status,
    localWrapper,
  };
}

/** Upstream HTTP failure → 「【provider】HTTP <code> <statusText>: <upstream body verbatim>」 (all providers). null when no upstream status. */
export function upstreamHttpFirstLine(data: any): string | null {
  const parts = upstreamFailureParts(data);
  if (!parts) return null;
  const prov = parts.provider;
  const provPrefix = prov ? `【${prov}】` : '';
  const sep = parts.statusText ? ' ' : '';
  const statusLine = `HTTP ${parts.status}${sep}${parts.statusText}`.trim();
  if (parts.body === '') {
    return `${provPrefix}${statusLine}`;
  }
  const sep2 = provPrefix ? ': ' : ' ';
  return `${provPrefix}${statusLine}${sep2}${parts.body}`;
}

/** User-facing one-liner: verbatim error; no invented Chinese summary or dropped body. */
export function userFacingApiFailure(appStatus: number, data: any, route: string): string {
  if (isLocalNotOutbound(data)) return localNotOutboundText(data);
  const dataWithRoute = data && typeof data === 'object' && !data.route && route ? { ...data, route } : data;
  const httpLine = upstreamHttpFirstLine(dataWithRoute);
  if (httpLine) return httpLine;
  const nested =
    data && typeof data === 'object'
      ? (Object.values(data).find((v: any) => v && typeof v === 'object' && v.error) as any)
      : undefined;
  const kr = data?.keyRotation?.summary;
  if (typeof kr === 'string' && kr.trim()) {
    return kr.trim();
  }
  const detail = data?.error || nested?.error || (typeof data === 'string' ? data : '请求失败');
  const clean = stripLocalWrapperPrefix(String(detail));
  return clean || String(detail);
}

/** Build a technical explanation without discarding the original response. */
export function describeApiFailure(appStatus: number, data: any, route: string) {
  // Local blocks never reached a provider: no HTTP status is shown (the site's 400 is transport only; errorSource stays 'local').
  if (isLocalNotOutbound(data)) return `${localNotOutboundText(data)} · local · ${route}（${data?.schemaRead ? '已读 Schema，未调用生成端点' : '未调用任何上游'}）`;
  const nested =
    data && typeof data === 'object'
      ? (Object.values(data).find((v: any) => v && typeof v === 'object' && v.error) as any)
      : undefined;
  const traces = Array.isArray(data?.executionTrace) ? data.executionTrace : [];
  const failed = findFailingTrace(traces);
  const status = data?.upstreamStatus ?? failed?.status ?? nested?.status;
  const endpoint = data?.exactEndpointCalled || failed?.endpoint || nested?.exactEndpointCalled;
  const source = data?.errorSource || (failed ? (failed.status === null ? 'network' : 'upstream') : 'API');
  const detail = data?.error || nested?.error || (typeof data === 'string' ? data : '请求失败');
  const raw = failed?.responseBody || data?.details || nested?.details;
  const cloudflare = status === 403 && typeof raw === 'string' && /cf_chl|challenges.cloudflare.com/.test(raw);
  const reason = cloudflare
    ? '上游网页要求人机验证，目录抓取被拒绝；此响应不是余额错误'
    : stripLocalWrapperPrefix(String(detail)).split('\n')[0];
  return `${reason} · ${source} · ${status != null ? `上游 HTTP ${status} / ` : ''}网站 HTTP ${appStatus} · ${endpoint || route}`;
}

/** Toast title for a local block: first line always 「没有发出去」. */
export const LOCAL_BLOCK_TOAST_TITLE = '没有发出去';
/** clean-1029: one copy source for toast title, exec log and every node in the blocked branch (LoRA / Save). */
/** Zero-request blocks only (canvas-side). Schema-dependent blocks use localBlockTitle() from utils/localBlock (clean-1333 #3). */
export const LOCAL_BLOCK_NODE_LINE = `${LOCAL_BLOCK_TOAST_TITLE}：没有请求离开本机，原因见红框与执行记录`;
/** Local reason for the toast body: the route's own `error` text verbatim (from the raw response body), minus a duplicated 「没有发出去」 head line. */
export function localBlockToastReason(rawBody: string): string {
  let text = String(rawBody || '');
  try { const d = JSON.parse(text); if (d && typeof d.error === 'string') text = d.error; } catch { /* non-JSON body: shown as-is */ }
  return text.replace(/^(?:没有发出去|没有发出去|没有发出去|没有发出去)[：:]?\s*\n?/, '').trim() || text;
}


/**
 * Same string history persists as item.error (route `error` / recorded historyItem.error).
 * Save Image / downstream upstreamFailedMessage must reuse this — not a short summarized banner.
 * Verbatim upstream response body preserved in full.
 */
export function historyFacingErrorMessage(err: unknown): string | undefined {
  const data = err && typeof err === 'object' ? (err as { data?: any }).data : undefined;
  if (!data || typeof data !== 'object') return undefined;
  const hist = data.historyItem && typeof data.historyItem === 'object' ? data.historyItem : null;
  const fromHist = typeof hist?.error === 'string' ? hist.error.trim() : '';
  const fromRoute = typeof data.error === 'string' ? data.error.trim() : '';
  const candidate = fromHist || fromRoute;
  if (candidate) return candidate;
  const body =
    (typeof data.upstreamResponseBody === 'string' && data.upstreamResponseBody) ||
    (typeof data.rawResponse === 'string' && data.rawResponse) ||
    (typeof data.details === 'string' && data.details) ||
    '';
  if (!body) return undefined;
  return body.trim() || undefined;
}

/** A run error is a local block iff its structured response body says so (errorSource local, no non-GET trace) — never by message text. */
export function isLocalBlockError(err: unknown): boolean {
  const e = err as any;
  return !!e && e.name === 'ApiTraceError' && isLocalNotOutbound(e.data);
}
