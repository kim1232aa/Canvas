import { formatBeijingHms } from '../services/executionTrace';
import { LORA_UNSUPPORTED_MESSAGE } from './resolveCheckpoint';
import { isSchemaPrefetchError, schemaFailureToast } from './schemaFailure';

/** ModelScope upstream 「模型不存在」— plain primary for exec-log / node banner. */
export const MODELSCOPE_MODEL_MISSING_CN = '魔搭国内站找不到这个模型或 LoRA';
export const MODELSCOPE_MODEL_MISSING_AI = '魔搭国际站找不到这个模型或 LoRA';

/** Stale selectedNodeId / resolve miss — never expose raw node-… ids in the status bar. */
export const EXEC_NODE_MISSING = '请重新选择要运行的节点';

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

/** Map known technical refuse strings to plain Chinese for cards / exec-log first line. */
export function plainFailureConclusion(detail: string | null | undefined): string | null {
  if (!detail) return null;
  const text = String(detail);
  if (
    /Krea.*(?:不接受|不能).*(?:LoRA|负面)|官方 schema 无 loras|这模型不能挂 LoRA|当前模型不支持 LoRA|请换支持 LoRA 的模型/i.test(
      text,
    )
  ) {
    return LORA_UNSUPPORTED_MESSAGE;
  }
  // HF / KeyPool billing rotate — keep first-line plain; do not invent paths.
  if (/几把都额度不够|这把额度不够，已换下一把|这把额度不够|前 \d+ 把额度不够，已换到有额度的/.test(text)) {
    const m = text.match(/几把都额度不够|这把额度不够，已换下一把|这把额度不够|前 \d+ 把额度不够，已换到有额度的/);
    return m ? m[0] : text;
  }
  // ModelScope CN/AI: upstream 500 「模型不存在」 / apiInferModelDownload — never leave JSON/[500] on the primary line.
  if (
    (/魔搭|modelscope/i.test(text) && /模型不存在/.test(text)) ||
    /apiInferModelDownload[\s\S]*模型不存在/i.test(text)
  ) {
    if (/国际站|modelscope\.ai|modelscope_ai/i.test(text)) return MODELSCOPE_MODEL_MISSING_AI;
    return MODELSCOPE_MODEL_MISSING_CN;
  }
  // Missing execution target — strip internal node-… ids from status / toast.
  if (/未找到指定的执行节点/.test(text)) return EXEC_NODE_MISSING;
  // 402 / 403-funds billing: 透传上游原文。Prefer JSON message; else null so callers keep the original first line.
  // Never rewrite to Chinese summary (产品硬规：上游传回什么就透传什么).
  if (isBillingFailureText(text)) {
    return extractUpstreamMessage(text);
  }
  return null;
}

/**
 * Primary banner / toast / node line for any thrown Error.
 * Billing / funds: full upstream message (no mid-sentence `…`).
 */
export function plainErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '执行遇到错误');
  const first = raw.split('\n')[0];
  // Local rejection: verbatim, no rewrite / slice — must not look like upstream failure or success.
  if (first.startsWith('未出站，本地拦截') || first.startsWith('本地拦截 · ')) return first;
  // fix4: HTTP lines → short summary (no raw JSON in node banner / top bar).
  if (/^HTTP \d{3}\b/.test(first) || first.startsWith('{')) return shortUpstreamSummary(first);
  const plain = plainFailureConclusion(first) || plainFailureConclusion(raw);
  if (plain) return plain;
  if (isBillingFailureText(first) || isBillingFailureText(raw)) {
    return extractUpstreamMessage(raw) || first;
  }
  return unicodeSafeSlice(first, 120);
}

/** Node / frame error banner: billing pass-through stays full; other lines stay short. */
export function errorBannerText(detail: string | null | undefined): string {
  if (!detail) return '';
  const first = String(detail).split('\n')[0];
  // Local rejection: verbatim, no rewrite / slice — must not look like upstream failure or success.
  if (first.startsWith('未出站，本地拦截') || first.startsWith('本地拦截 · ')) return first;
  // fix4: short summary for KSampler / node red bar (JSON details → history card).
  if (/^HTTP \d{3}\b/.test(first) || first.startsWith('{')) return shortUpstreamSummary(first);
  const plain = plainFailureConclusion(first) || plainFailureConclusion(detail);
  if (plain) return plain;
  // Plain billing text (no HTTP/JSON wrapper): full verbatim, never ellipsis.
  if (isBillingFailureText(first) || isBillingFailureText(detail)) {
    return extractUpstreamMessage(String(detail)) || first;
  }
  return unicodeSafeSlice(first, 120);
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
 * fix4: short banner / top-bar / node line for upstream failures.
 * Keeps 「HTTP <code> · task status=… · reason」; drops trailing raw JSON (details live in history / toast expand).
 */
export function shortUpstreamSummary(detail: string | null | undefined): string {
  if (!detail) return '';
  const first = String(detail).split(/\r?\n/)[0].trim();
  if (!first) return '';
  if (first.startsWith('未出站，本地拦截') || first.startsWith('本地拦截 · ')) return first;
  // Prefer HTTP head up to (but not including) a trailing JSON object/array.
  // Keeps 「HTTP 403 Forbidden」 and 「HTTP 200 · task status=…」 intact.
  const httpHead = first.match(/^(HTTP\s+\d{3}\b[^\{\[]*)/i);
  if (httpHead) {
    let head = httpHead[1].replace(/\s+$/, '').trim();
    const rest = first.slice(httpHead[0].length).trim();
    if (rest.startsWith('{') || rest.startsWith('[')) {
      const msg = extractUpstreamMessage(rest);
      if (msg && !head.includes(msg)) head = `${head} · ${msg}`;
      return head;
    }
    return head;
  }
  // Whole first line is JSON → extract message / keep short.
  if (first.startsWith('{') || first.startsWith('[')) {
    return extractUpstreamMessage(first) || unicodeSafeSlice(first, 120);
  }
  // Billing / funds: never mid-message ellipsis (iron rule).
  if (isBillingFailureText(first)) return first;
  return unicodeSafeSlice(first, 120);
}


export const LOCAL_NOT_OUTBOUND = '未出站，本地拦截';

/** True when the server rejected locally and no generation request (non-GET) reached any upstream. */
export function isLocalNotOutbound(data: any): boolean {
  if (!data || typeof data !== 'object' || data.errorSource !== 'local') return false;
  // trace-fix2 P3: a task poll carries only its own GET in executionTrace; the task ledger (taskExecutionTrace) and a
  // recorded history card that went upstream prove the generation POST already left → never 「本地拦截」.
  const traces = [
    ...(Array.isArray(data.executionTrace) ? data.executionTrace : []),
    ...(Array.isArray(data.taskExecutionTrace) ? data.taskExecutionTrace : []),
    ...(Array.isArray(data.historyItem?.requestMetadata?.executionTrace) ? data.historyItem.requestMetadata.executionTrace : []),
  ];
  if (data.historyItem && typeof data.historyItem === 'object' && data.historyItem.status && data.historyItem.status !== 'local_blocked' && data.historyItem.requestMetadata?.postSent !== false) return false;
  return !traces.some((t: any) => t && t.endpoint && t.method && t.method !== 'GET' && !t.readOnly);
}

/** 「未出站，本地拦截：<本地错误原文>」 — reason verbatim, never sliced. */
export function localNotOutboundText(data: any): string {
  const detail = data?.error ?? (typeof data === 'string' ? data : '');
  const text = String(detail);
  if (text.startsWith('本地拦截 · ')) return text;
  // clean-1333 #3: the submit route read (or reused) the Schema before refusing — never claim nothing went out.
  const gets = data && typeof data === 'object' && Array.isArray(data.executionTrace) ? data.executionTrace.filter((t: any) => String(t?.method || '').toUpperCase() === 'GET' || t?.readOnly) : [];
  const schemaFailed = !!(data?.schemaRead?.failed || (!data?.schemaRead && gets.length && gets.some((t: any) => t.status === null || t.status >= 400)));
  if (schemaFailed) return `本地拦截 · Schema 读取失败、未发生成：${text.replace(/^未出站，本地拦截[：:]?\s*/, '')}`;
  const schemaRead = !!(data && typeof data === 'object' && (data.schemaRead || gets.length));
  if (schemaRead) return `本地拦截 · 已读 Schema、未发生成：${text.replace(/^未出站，本地拦截[：:]?\s*/, '')}`;
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

export function upstreamFailureParts(data: any): { status: number; statusText: string; body: string } | null {
  if (!data || typeof data !== 'object') return null;
  // A local block before the generation request has no upstream failure: never headline a successful catalog/Schema read (e.g. HTTP 200 /tool/list).
  if (isLocalNotOutbound(data)) return null;
  const traces = Array.isArray(data.executionTrace) ? data.executionTrace : Array.isArray(data.taskExecutionTrace) ? data.taskExecutionTrace : [];
  const failed = [...traces].reverse().find((t: any) => typeof t?.status === 'number' && t.status >= 400);
  const hist = data.historyItem && typeof data.historyItem === 'object' ? data.historyItem : null;
  const status = failed?.status
    ?? (typeof data.upstreamStatus === 'number' ? data.upstreamStatus : null)
    ?? (typeof hist?.upstreamStatus === 'number' ? hist.upstreamStatus : null);
  if (status == null) return null;
  const body = (
    typeof failed?.responseBody === 'string' ? failed.responseBody
    : typeof data.upstreamResponseBody === 'string' ? data.upstreamResponseBody
    : typeof hist?.upstreamResponseBody === 'string' ? hist.upstreamResponseBody
    : typeof data.rawResponse === 'string' ? data.rawResponse
    : data.rawResponse != null ? coerceResponseBodyText(data.rawResponse)
    : typeof data.details === 'string' ? data.details
    : typeof data.error === 'string' ? data.error
    : typeof hist?.error === 'string' ? hist.error
    : ''
  );
  // Prefer explicit HTTP statusText / upstreamStatusText. Task-status line (waiting_for_user …) only for non-4xx/5xx.
  const explicit = (typeof failed?.statusText === 'string' && failed.statusText.trim() ? failed.statusText.trim() : '')
    || (typeof data.upstreamStatusText === 'string' && data.upstreamStatusText.trim() ? data.upstreamStatusText.trim() : '')
    || (typeof hist?.upstreamStatusText === 'string' && hist.upstreamStatusText.trim() ? hist.upstreamStatusText.trim() : '');
  const statusText = explicit || (status < 400 ? taskStatusLine(data) : '');
  return { status, statusText, body };
}
export const TOAST_BODY_FIRST_LINE_MAX = 400;
/** Toast for an upstream HTTP failure: title 「HTTP <code>」; first line = upstream body verbatim (cut, never rewritten); full body below. */
/** clean-1149 #1: run-catch toast. Prefer structured err.data; else SchemaPrefetchError / any Error carrying upstreamStatus. */
export function toastFromRunError(err: any, runLine?: string): { title: string; message: string } | null {
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

export function upstreamFailureToast(data: any, runLine?: string): { title: string; message: string } | null {
  const parts = upstreamFailureParts(data);
  if (!parts) return null;
  const body = parts.body;
  const firstRaw = body.split(/\r?\n/)[0];
  // fix4: toast first line = short summary (no full JSON); full body stays under 「展开全文」.
  const summary = shortUpstreamSummary(
    `HTTP ${parts.status}${parts.statusText ? (`${/^(status:|task status=)/i.test(parts.statusText) ? ' · ' : ' '}${parts.statusText}`) : ''}${firstRaw ? ` ${firstRaw}` : ''}`,
  ) || extractUpstreamMessage(body) || (firstRaw.startsWith('{') ? '（响应体为 JSON，展开看原文）' : firstRaw);
  const needsFull = !!body && summary !== body;
  const sep = parts.statusText && /^(status:|task status=)/i.test(parts.statusText) ? ' · ' : ' ';
  const title = `HTTP ${parts.status}${parts.statusText ? `${sep}${parts.statusText}` : ''}`;
  return {
    title,
    message: [summary || (body ? '（上游响应体见展开）' : '（上游响应体为空）'), needsFull ? `完整上游响应原文：\n${body}` : '', runLine || '', typeof data?.localWrapper === 'string' && data.localWrapper !== body ? `本地包装与堆栈（技术详情）：\n${data.localWrapper}` : ''].filter(Boolean).join('\n'),
  };
}

/** Upstream HTTP failure → 「HTTP <code> <upstream body verbatim>」 (all providers). null when no upstream status. */
export function upstreamHttpFirstLine(data: any): string | null {
  const parts = upstreamFailureParts(data);
  if (!parts) return null;
  const bodyFirst = parts.body.split(/\r?\n/)[0].replace(/^HTTP \d{3}:?\s*/, '');
  const sep = parts.statusText && /^(status:|task status=)/i.test(parts.statusText) ? ' · ' : ' ';
  const raw = `HTTP ${parts.status}${parts.statusText ? `${sep}${parts.statusText}` : ''}${bodyFirst ? ` ${bodyFirst}` : ''}`.trim();
  // fix4: never put full JSON on the status / node first line.
  return shortUpstreamSummary(raw) || raw;
}

/** User-facing one-liner: plain conclusion; no HTTP / local / route pile. */
export function userFacingApiFailure(appStatus: number, data: any, route: string): string {
  if (isLocalNotOutbound(data)) return localNotOutboundText(data);
  const httpLine = upstreamHttpFirstLine(data);
  if (httpLine) return httpLine;
  const nested =
    data && typeof data === 'object'
      ? (Object.values(data).find((v: any) => v && typeof v === 'object' && v.error) as any)
      : undefined;
  const kr = data?.keyRotation?.summary;
  if (typeof kr === 'string' && kr.trim()) {
    return plainFailureConclusion(kr) || kr.trim();
  }
  const detail = data?.error || nested?.error || (typeof data === 'string' ? data : '请求失败');
  const plain = plainFailureConclusion(String(detail));
  if (plain) return plain;
  const upstream = data?.upstreamStatus ?? nested?.status;
  const first = String(detail).split('\n')[0];
  // Billing (402 or 403-funds): 透传上游原文 — never invent Chinese; never mid-message ellipsis.
  // Do not treat Cloudflare challenge 403 as billing (isBillingFailureText already excludes it).
  if (appStatus === 402 || upstream === 402 || isBillingFailureText(String(detail))) {
    return extractUpstreamMessage(String(detail)) || first;
  }
  return unicodeSafeSlice(first, 80);
}

/** Build a short technical explanation without discarding the original response. */
export function describeApiFailure(appStatus: number, data: any, route: string) {
  // Local blocks never reached a provider: no HTTP status is shown (the site's 400 is transport only; errorSource stays 'local').
  if (isLocalNotOutbound(data)) return `${localNotOutboundText(data)} · local · ${route}（${data?.schemaRead ? '已读 Schema，未调用生成端点' : '未调用任何上游'}）`;
  const nested =
    data && typeof data === 'object'
      ? (Object.values(data).find((v: any) => v && typeof v === 'object' && v.error) as any)
      : undefined;
  const traces = Array.isArray(data?.executionTrace) ? data.executionTrace : [];
  const failed = traces.findLast((t: any) => t.status >= 400 || t.status === null);
  const status = data?.upstreamStatus ?? failed?.status ?? nested?.status;
  const endpoint = data?.exactEndpointCalled || failed?.endpoint || nested?.exactEndpointCalled;
  const source = data?.errorSource || (failed ? (failed.status === null ? 'network' : 'upstream') : 'API');
  const detail = data?.error || nested?.error || (typeof data === 'string' ? data : '请求失败');
  const raw = failed?.responseBody || data?.details || nested?.details;
  const cloudflare = status === 403 && typeof raw === 'string' && /cf_chl|challenges.cloudflare.com/.test(raw);
  const reason = cloudflare
    ? '上游网页要求人机验证，目录抓取被拒绝；此响应不是余额错误'
    : String(detail).split('\n')[0];
  const plain = plainFailureConclusion(String(detail));
  // Lead with plain conclusion when known; keep source/HTTP/route for copy-report / tech line.
  const head = plain || reason;
  return `${head} · ${source} · ${status != null ? `上游 HTTP ${status} / ` : ''}网站 HTTP ${appStatus} · ${endpoint || route}`;
}

/** Toast title for a local block: first line always 「本地拦截 · 未发请求」. */
export const LOCAL_BLOCK_TOAST_TITLE = '本地拦截 · 未发请求';
/** clean-1029: one copy source for toast title, exec log and every node in the blocked branch (LoRA / Save). */
/** Zero-request blocks only (canvas-side). Schema-dependent blocks use localBlockTitle() from utils/localBlock (clean-1333 #3). */
export const LOCAL_BLOCK_NODE_LINE = `${LOCAL_BLOCK_TOAST_TITLE}：没有请求离开本机，原因见红框与执行记录`;
/** Local reason for the toast body: the route's own `error` text verbatim (from the raw response body), minus a duplicated 「本地拦截 · 未发请求」 head line. */
export function localBlockToastReason(rawBody: string): string {
  let text = String(rawBody || '');
  try { const d = JSON.parse(text); if (d && typeof d.error === 'string') text = d.error; } catch { /* non-JSON body: shown as-is */ }
  return text.replace(/^(?:本地拦截 · 未发请求|本地拦截 · 已读 Schema、未发生成|本地拦截 · Schema 读取失败、未发生成|未出站，本地拦截)[：:]?\s*\n?/, '').trim() || text;
}

/** A run error is a local block iff its structured response body says so (errorSource local, no non-GET trace) — never by message text. */
export function isLocalBlockError(err: unknown): boolean {
  const e = err as any;
  return !!e && e.name === 'ApiTraceError' && isLocalNotOutbound(e.data);
}
