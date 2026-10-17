import { localBlockTitle, schemaReadLine, LOCAL_BLOCK_ZERO_TITLE } from '../utils/localBlock';
import React from 'react';
import {CATEGORY_LABEL,countsLabel,formatRecordTime,getExecutions,isNonGenerationRecord,recordCategory,subscribeExecution,type ExecutionRecord} from '../services/executionTrace';
import {isLocalNotOutbound, localNotOutboundText, upstreamHttpFirstLine, plainFailureConclusion, userFacingApiFailure} from '../utils/apiFailure';
import { checkpointNodeTitle } from '../utils/providerLabels';
import { splitActualRequest, ACTUAL_META_LABEL } from '../utils/actualRequestDisplay';
import { formatKeyUsage, keyUsagesFromTrace } from '../server/keyUsage';

/** Key rotation visibility for one execution record: 「Key #0（共 2 个）」 from the response's executionTrace (index + count only). */
export function recordKeyUsageLabels(r: Pick<ExecutionRecord,'response'>): string[] {
  const data: any = r.response && typeof r.response === 'object' ? r.response : {};
  const usages = Array.isArray(data.historyItem?.requestMetadata?.keyUsages) ? data.historyItem.requestMetadata.keyUsages : keyUsagesFromTrace(data.executionTrace);
  return usages.map((u: any) => formatKeyUsage(u)).filter((s: string | null): s is string => !!s);
}

function redactSecrets(value:unknown):unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== 'object') return value;
  const out:Record<string,unknown> = {};
  for (const [k,v] of Object.entries(value as Record<string,unknown>)) {
    // maskedKey / maskedToken are already redacted — keep them visible for Key 尝试 rows.
    if (/key|token|secret|authorization|password|credential/i.test(k) && !/^masked/i.test(k) && !/^keyUsages?$/.test(k)) {
      out[k] = '[已隐藏]';
      continue;
    }
    if (typeof v === 'string' && /^(sk-|ak_|wsk_|hf_|ms-|Bearer\s)/i.test(v.trim()) && !/^masked/i.test(k)) {
      out[k] = '[已隐藏]';
      continue;
    }
    out[k] = redactSecrets(v);
  }
  return out;
}

function responseDetail(response:unknown):string {
  if (response == null) return '';
  if (typeof response === 'string') return response.split('\n')[0].slice(0, 200);
  const data = response as Record<string,unknown>;
  const nested = Object.values(data).find((v:any) => v && typeof v === 'object' && v.error) as any;
  const detail = data.error || nested?.error || data.message || data.detail;
  return detail != null ? String(detail).split('\n')[0].slice(0, 200) : '';
}

/** User-facing site name for success conclusions (not the short badge). */
export function providerPlainSiteName(route: string | null | undefined): string {
  const r = String(route || '');
  if (/\/api\/modelscope_ai\b/.test(r)) return '魔搭国际站';
  if (/\/api\/(?:engine\/)?modelscope\b/.test(r)) return '魔搭国内站';
  if (/\/api\/(?:engine\/)?wavespeed\b/.test(r)) return 'WaveSpeed';
  if (/\/api\/(?:engine\/)?fal\b/.test(r)) return 'Fal.ai';
  if (/\/api\/(?:engine\/)?civitai\b/.test(r)) return 'Civitai';
  if (/\/api\/(?:engine\/)?huggingface\b/.test(r)) return 'Hugging Face';
  if (/\/api\/(?:engine\/)?muapi\b/.test(r)) return 'MuAPI';
  if (/\/api\/(?:engine\/)?sogni\b/.test(r)) return 'Sogni';
  if (/\/api\/(?:engine\/)?nanogpt\b/.test(r)) return 'NanoGPT';
  if (/\/api\/(?:engine\/)?replicate\b/.test(r)) return 'Replicate';
  if (/\/api\/(?:engine\/)?sensenova\b/.test(r)) return 'SenseNova';
  if (/\/api\/(?:engine\/)?krea\b/.test(r) || /\/api\/schema-provider\/krea\b/.test(r)) return 'Krea';
  if (/\/api\/(?:engine\/)?tensor/.test(r)) return 'Tensor.Art';
  if (/\/api\/schema-provider\/aimlapi\b/.test(r) || /[?&]provider=aimlapi\b/.test(r)) return 'AIMLAPI';
  if (/\/api\/schema-provider\/novita\b/.test(r)) return 'Novita';
  if (/\/api\/schema-provider\/venice\b/.test(r)) return 'Venice';
  if (/\/api\/schema-provider\/together\b/.test(r)) return 'Together';
  if (/\/api\/schema-provider\/muapi\b/.test(r)) return 'MuAPI';
  if (/\/api\/schema-provider\/wavespeed\b/.test(r)) return 'WaveSpeed';
  if (/\/api\/schema-provider\/sogni\b/.test(r)) return 'Sogni';
  if (/\/api\/model-schema\b/.test(r)) return '模型 Schema';
  if (/\/api\/models\b/.test(r)) return '模型目录';
  return '上游';
}

/** Short LoRA label for success line — last path segment, drop common base prefixes. */
export function shortLoraDisplayName(name: string): string {
  const raw = String(name || '').trim();
  if (!raw) return '';
  const seg = raw.split('/').pop() || raw;
  const cleaned = seg
    .replace(/^(?:Z-Image-Turbo|FLUX\.?1(?:-dev)?|flux(?:1)?|SDXL|sdxl|SD3|sd3)[-_]?/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return cleaned || seg;
}

export function countGeneratedImages(response: unknown): number {
  if (response == null) return 0;
  if (typeof response !== 'object') return 0;
  const data = response as Record<string, any>;
  if (Array.isArray(data.images) && data.images.length) return data.images.length;
  if (Array.isArray(data.imageUrls) && data.imageUrls.length) return data.imageUrls.length;
  if (Array.isArray(data.output_images) && data.output_images.length) return data.output_images.length;
  if (Array.isArray(data.output) && data.output.length) {
    const imgs = data.output.filter((x: any) => typeof x === 'string' || (x && (x.url || x.imageUrl)));
    if (imgs.length) return imgs.length;
  }
  if (typeof data.imageUrl === 'string' && data.imageUrl) return 1;
  if (typeof data.mediaUrl === 'string' && data.mediaUrl) return 1;
  if (typeof data.url === 'string' && data.url && !data.isVideo) return 1;
  if (data.historyItem && (data.historyItem.imageUrl || data.historyItem.url)) return 1;
  return 0;
}

export type RequestLoraRef = { name: string; strength: number | null };

/** Pull LoRA name+strength from client request / actualRequest envelope (array or object-map). */
export function extractLorasFromRequest(request: unknown): RequestLoraRef[] {
  if (!request || typeof request !== 'object') return [];
  const body = request as Record<string, any>;
  const raw =
    body.loras ??
    body.actualRequest?.loras ??
    body.actualRequest?.parameters?.loras ??
    body.actualRequest?.parameters?.styles ??
    body.actualRequest?.parameters?.request?.loras ??
    body.requestMetadata?.actualParameters?.loras ??
    body.requestMetadata?.actualRequest?.parameters?.loras;
  const out: RequestLoraRef[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item == null) continue;
      if (typeof item === 'string') {
        out.push({ name: item, strength: null });
        continue;
      }
      if (typeof item === 'object') {
        const name = String(item.name || item.path || item.id || item.lora || '').trim();
        if (!name) continue;
        const strengthRaw = item.strength ?? item.modelStrength ?? item.scale;
        const strength = strengthRaw == null || strengthRaw === '' ? null : Number(strengthRaw);
        out.push({ name, strength: Number.isFinite(strength as number) ? (strength as number) : null });
      }
    }
    return out;
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [name, strengthRaw] of Object.entries(raw)) {
      if (!String(name).trim()) continue;
      const strength = strengthRaw == null || strengthRaw === '' ? null : Number(strengthRaw);
      out.push({ name: String(name), strength: Number.isFinite(strength as number) ? (strength as number) : null });
    }
  }
  return out;
}

/** True when the route is a generate/submit (not catalog/schema plumbing). */
export function isGenerateExecutionRoute(route: string | null | undefined): boolean {
  const r = String(route || '');
  if (/\/api\/schema-provider\/[^/]+\/submit\b/.test(r)) return true;
  if (/\/api\/schema-provider\/[^/]+\/save-result\b/.test(r)) return true;
  if (/\/api\/(?:engine\/)?[^/]+\/generate\b/.test(r)) return true;
  return false;
}

/** LoRAs from client request, else from response.actualRequest (failed submit still shows what was sent). */
export function extractLorasFromRecord(r: Pick<ExecutionRecord, 'request' | 'response'>): RequestLoraRef[] {
  const fromReq = extractLorasFromRequest(r.request);
  if (fromReq.length) return fromReq;
  const actual = r.response && typeof r.response === 'object' ? (r.response as any).actualRequest : null;
  if (actual) return extractLorasFromRequest({ actualRequest: actual });
  return [];
}

/** Snapshot of upstream actualRequest from error/success response, when present. */
export function actualRequestFromResponse(response: unknown): unknown | null {
  if (!response || typeof response !== 'object') return null;
  const actual = (response as any).actualRequest;
  return actual == null ? null : actual;
}

/** Success first-line: site + image count + LoRA when present. Never claim 出图 without images. */
export function plainSuccessConclusion(r: ExecutionRecord): string | null {
  if (r.state !== 'complete') return null;
  const n = countGeneratedImages(r.response);
  // Catalog / model-schema GET must not read as generate success (产品：出图完成仅真实出图).
  if (n <= 0) return null;
  const site = providerPlainSiteName(r.route);
  const countBit = `出图 ${n} 张`;
  const loras = extractLorasFromRecord(r);
  if (!loras.length) return `${site}${countBit}`;
  if (loras.length === 1) {
    const l = loras[0];
    const short = shortLoraDisplayName(l.name) || l.name;
    if (l.strength != null) return `${site}${countBit}，挂了 ${short}，强度 ${l.strength}`;
    return `${site}${countBit}，挂了 ${short}`;
  }
  const parts = loras.map((l) => {
    const short = shortLoraDisplayName(l.name) || l.name;
    return l.strength != null ? `${short}（强度 ${l.strength}）` : short;
  });
  return `${site}${countBit}，挂了 ${parts.join('、')}`;
}

/** True when aligned+redacted client snapshot has nothing worth showing. */
export function isEmptyClientRequestSnapshot(request: unknown, route: string): boolean {
  if (request == null) return true;
  if (typeof request === 'string' && !request.trim()) return true;
  let aligned: unknown;
  try {
    aligned = redactSecrets(alignRequestSnapshotProvider(request, route));
  } catch {
    aligned = request;
  }
  if (aligned == null) return true;
  if (typeof aligned === 'string') return !aligned.trim();
  if (Array.isArray(aligned)) return aligned.length === 0;
  if (typeof aligned === 'object') {
    try {
      const keys = Object.keys(aligned as object);
      if (keys.length === 0) return true;
      // stringify may be undefined for odd values — treat as empty
      const text = JSON.stringify(aligned);
      return text == null || text === '{}' || text === '[]' || text === 'null';
    } catch {
      return true;
    }
  }
  return false;
}

/** Snapshot text for the fold; null when empty (caller must hide the block). */
export function clientRequestSnapshotText(request: unknown, route: string): string | null {
  if (isEmptyClientRequestSnapshot(request, route)) return null;
  try {
    const text = JSON.stringify(redactSecrets(alignRequestSnapshotProvider(request, route)), null, 2);
    if (text == null || text === '{}' || text === '[]' || text === 'null') return null;
    return text;
  } catch {
    return null;
  }
}

/** Which catalog/schema this non-generation GET was for (provider / category / model from its own query string). */
export function nonGenerationOrigin(route: string): string {
  const q = String(route || '').split('?')[1];
  if (!q) return '';
  const p = new URLSearchParams(q);
  const parts = [p.get('provider') && `服务商 ${p.get('provider')}`, p.get('category') && `类别 ${p.get('category')}`, p.get('model') && `模型 ${p.get('model')}`, p.get('kind') && `类型 ${p.get('kind')}`].filter(Boolean);
  return parts.length ? ` · ${parts.join(' · ')}` : '';
}

/** Row head split: `head` = method + URL (may wrap), `status` = status words (rendered nowrap so 「失败」 never splits). */
export function requestLineParts(r:ExecutionRecord):{head:string;status:string} {
  const data = (r.response && typeof r.response === 'object' ? r.response : {}) as Record<string,any>;
  // clean-1333 #3: LOCAL rows (no network) and submit-route local blocks say exactly what was requested.
  if (String(r.method).toUpperCase() === 'LOCAL') {
    // clean-1613 #2: viewport pan is info, not a failed request
    if (r.state !== 'error' && String(r.route || '').includes('视口平移')) {
      return { head: `本地 · ${r.route}`, status: '视口操作 · 0 个请求' };
    }
    return {head:`本地 · ${r.route}`, status: r.state === 'error' ? `${LOCAL_BLOCK_ZERO_TITLE} · 0 个请求` : `${String(data.note || '复用，未重新请求')} · 0 个请求`};
  }
  const status = r.state === 'pending' ? '请求中'
    : r.state === 'error' && isLocalNotOutbound(data) ? `${localBlockTitle(data)}（${schemaReadLine(data)}）`
    : r.status != null ? `HTTP ${r.status}${r.state === 'error' ? ' · 失败' : ''}`
    : r.state === 'error' ? '无 HTTP 响应 · 失败' : '无状态码';
  return {head:`${String(r.method || 'GET').toUpperCase()} ${r.route}`, status};
}
/** Always-visible row head: method + URL/action + status (failed / local / pending spelled out). */
export function requestLine(r:ExecutionRecord):string {
  const {head,status} = requestLineParts(r);
  return `${head} · ${status}`;
}
/** Groups consecutive successful polling GETs of the same task route; single rows / errors stay standalone. */
export function groupPollingRuns<T extends Pick<ExecutionRecord,'method'|'route'|'state'>>(list:T[]):Array<T|T[]> {
  const out:Array<T|T[]>=[];
  for (const r of list) {
    const prev=out[out.length-1];
    const groupable=isPollingRecord(r) && r.state==='complete';
    const head=Array.isArray(prev)?prev[0]:prev;
    if (groupable && head && isPollingRecord(head) && head.state==='complete' && head.route===r.route) {
      if (Array.isArray(prev)) prev.push(r); else out[out.length-1]=[prev as T,r];
    } else out.push(r);
  }
  return out;
}
/** Group row head: the real method + route, how many polls, and the status of each (verbatim HTTP codes). */
export function pollGroupLine(g:Array<Pick<ExecutionRecord,'method'|'route'|'status'>>):string {
  const statuses=[...new Set(g.map(r=>r.status==null?'—':`HTTP ${r.status}`))].join(' / ');
  return `${String(g[0].method||'GET').toUpperCase()} ${g[0].route} · 轮询 ${g.length} 次 · ${statuses}（点开查看每次）`;
}
/** Task-status polling GET (…/tasks/<id>): rendered lighter than submit / save rows. Generic route shape, no provider list. */
export function isPollingRecord(r:Pick<ExecutionRecord,'method'|'route'>):boolean {
  return String(r.method||'GET').toUpperCase()==='GET' && /\/tasks\/[^/?]+/.test(String(r.route||''));
}
/**
 * Second line of a row, or null when it would only repeat the head. A successful catalog / Schema GET already shows
 * method + URL + status on the head line, so no Chinese re-statement of the same URL is added.
 */
export function rowSecondLine(r:ExecutionRecord):string|null {
  if (isNonGenerationRecord(r) && r.state !== 'error') return null;
  if (isPollingRecord(r) && r.state === 'complete') return null;
  return humanSummaryText(r);
}

/** Plain first-line conclusion (no method/path; no 「这次」prose prefix). */
export function humanSummaryText(r:ExecutionRecord):string {
  if (isNonGenerationRecord(r) && r.state !== 'error') return `${r.method} ${String(r.route).split('?')[0]}${nonGenerationOrigin(r.route)}${r.status != null ? ` · HTTP ${r.status}` : ' · 请求中'}（非生成请求）`;
  const data = (r.response && typeof r.response === 'object' ? r.response : {}) as Record<string,any>;
  if (r.state === 'error' && isLocalNotOutbound(data)) return localNotOutboundText(data);
  if (r.state === 'error' && upstreamHttpFirstLine(data)) return upstreamHttpFirstLine(data)!;
  const kr = typeof data.keyRotation?.summary === 'string' ? data.keyRotation.summary.trim() : '';
  if (kr) return plainFailureConclusion(kr) || kr;
  const detail = responseDetail(r.response);
  const failPlain = plainFailureConclusion(detail);
  if (failPlain) return failPlain;
  if (r.state === 'error') return userFacingApiFailure(r.status ?? 0, data, r.route);
  if (r.state === 'pending') return detail || '请求中';
  const successPlain = plainSuccessConclusion(r);
  if (successPlain) return successPlain;
  return detail || '完成';
}

/**
 * Label badge for failed rows (a label only — the canvas never auto-retries or replays a request):
 * the newest failed row = 最新失败, any older failed row = 较早失败.
 */
export function errorScopeTag(r:ExecutionRecord, latestErrorId?:number):'最新失败'|'较早失败'|null {
  if (r.state !== 'error') return null;
  return latestErrorId != null && r.id === latestErrorId ? '最新失败' : '较早失败';
}
export const ERROR_SCOPE_TAG_TITLE = '这是标签，不是重试：画布不会自动重发请求。「最新失败」= 本列表最新一条失败，「较早失败」= 更早发生的失败。';

/** Snapshot header label must follow the run's actual route/provider — never a stale node title. */
export function providerLabelFromRoute(route: string | null | undefined): string | null {
  const r = String(route || '');
  if (/\/api\/modelscope_ai\b/.test(r)) return '魔搭 AI';
  if (/\/api\/(?:engine\/)?modelscope\b/.test(r)) return '魔搭 CN';
  if (/\/api\/(?:engine\/)?wavespeed\b/.test(r) || /\/api\/schema-provider\/wavespeed\b/.test(r)) return 'WaveSpeed';
  if (/\/api\/(?:engine\/)?fal\b/.test(r)) return 'Fal.ai';
  if (/\/api\/(?:engine\/)?civitai\b/.test(r)) return 'Civitai';
  if (/\/api\/(?:engine\/)?huggingface\b/.test(r)) return 'Hugging Face';
  if (/\/api\/(?:engine\/)?muapi\b/.test(r) || /\/api\/schema-provider\/muapi\b/.test(r)) return 'MuAPI';
  if (/\/api\/(?:engine\/)?sogni\b/.test(r) || /\/api\/schema-provider\/sogni\b/.test(r)) return 'Sogni';
  if (/\/api\/(?:engine\/)?nanogpt\b/.test(r)) return 'NanoGPT';
  if (/\/api\/(?:engine\/)?replicate\b/.test(r)) return 'Replicate';
  if (/\/api\/(?:engine\/)?sensenova\b/.test(r)) return 'SenseNova';
  if (/\/api\/schema-provider\/krea\b/.test(r) || /\/api\/(?:engine\/)?krea\b/.test(r)) return 'Krea';
  if (/\/api\/schema-provider\/aimlapi\b/.test(r)) return 'AIMLAPI';
  if (/\/api\/schema-provider\/novita\b/.test(r)) return 'Novita';
  if (/\/api\/schema-provider\/venice\b/.test(r)) return 'Venice';
  if (/\/api\/schema-provider\/together\b/.test(r)) return 'Together';
  return null;
}

/**
 * Align CheckpointLoader titles in the displayed client request with values.targetProvider
 * (and route as last resort) so a WaveSpeed leftover title never appears over a ModelScope run.
 */
export function alignRequestSnapshotProvider(request: unknown, route: string): unknown {
  if (!request || typeof request !== 'object') return request;
  let clone: any;
  try {
    clone = JSON.parse(JSON.stringify(request));
  } catch {
    return request;
  }
  const nodes = clone?.workflowSnapshot?.nodes;
  if (!Array.isArray(nodes)) return clone;
  const routeProv =
    /\/api\/modelscope_ai\b/.test(route) ? 'modelscope_ai' :
    /\/api\/(?:engine\/)?modelscope\b/.test(route) ? 'modelscope' :
    /\/api\/(?:engine\/)?wavespeed\b/.test(route) ? 'wavespeed' :
    /\/api\/(?:engine\/)?fal\b/.test(route) ? 'fal' :
    /\/api\/(?:engine\/)?civitai\b/.test(route) ? 'civitai' :
    /\/api\/(?:engine\/)?huggingface\b/.test(route) ? 'huggingface' :
    '';
  for (const n of nodes) {
    if (!n || n.type !== 'CheckpointLoaderSimple') continue;
    const prov = String(n.values?.targetProvider || routeProv || '').trim();
    if (!prov) continue;
    n.values = { ...(n.values || {}), targetProvider: n.values?.targetProvider || prov };
    n.title = checkpointNodeTitle(prov, n.values?.ckpt_name);
  }
  return clone;
}

function humanSummary(r:ExecutionRecord, latestErrorId?:number):string {
  const plain = humanSummaryText(r);
  const tag = errorScopeTag(r, latestErrorId);
  return tag ? `${tag}：${plain}` : plain;
}

/**
 * One canonical error display: while the panel is open the panel shows the error (verbatim first line + details),
 * so the toggle bar does not repeat it; closed, the bar carries the verbatim first line (CSS-truncated on the button;
 * full text stays on title / in the open panel — clean-1651).
 */
export function buttonSummary(records:ExecutionRecord[], open=false):string {
  const live = records.filter(r => !r.acknowledged);
  if (open && live.some(r => r.state === 'error')) return '错误详情见上方面板（点此收起）';
  const latestError = live.find(r => r.state === 'error');
  if (!latestError) {
    const pending = live.filter(r => r.state === 'pending');
    if (!pending.length) return countsLabel(records);
    // Schema/catalog GETs are not generation — do not say 「N 个请求中」 (looks like a run).
    if (pending.every(isNonGenerationRecord)) {
      return pending.length === 1
        ? '读取 Schema 中（非生成请求）'
        : `读取 Schema 中（非生成请求）· ${pending.length}`;
    }
    return `${pending.length} 个请求中`;
  }
  const plain = humanSummaryText(latestError);
  // Local block: the bar's first words are 「本地拦截 · 未发请求」, then which run, then the local reason verbatim.
  if (isLocalNotOutbound(latestError.response)) {
    const rest = plain.replace(/^本地拦截 · (?:未发请求|已读 Schema、未发生成)\s*/, '').replace(/^未出站，本地拦截[：:]?\s*/, '');
    return `${localBlockTitle(latestError.response)} · ${latestError.runLabel || '本次'}${rest ? ` · ${rest}` : ''}`;
  }
  // Catalog / Schema GET failure is not a generation request — say so instead of implying a run failed.
  if (isNonGenerationRecord(latestError)) return `目录 / Schema 请求失败（非生成请求） · ${requestLine(latestError)} · ${plain}`;
  // Full first line (HTTP code + upstream text verbatim); the closed button truncates with ellipsis (clean-1651).
  return `${latestError.runLabel ? latestError.runLabel : '本次'} · ${plain}`;
}

function buildCopyReport(r:ExecutionRecord):string {
  const safe = {
    time: r.time,
    method: r.method,
    route: r.route,
    status: r.status,
    state: r.state,
    summary: humanSummary(r),
    request: redactSecrets(alignRequestSnapshotProvider(r.request, r.route)),
    response: redactSecrets(r.response),
    stack: r.stack ? String(r.stack).split('\n').slice(0, 12).join('\n') : undefined,
  };
  return JSON.stringify(safe, null, 2);
}




/** clean-1351 #6: the row's action name is the SAME string as its group header (run label for run rows, operation label otherwise). */
export function recordOperationName(r: Pick<ExecutionRecord,'runLabel'|'opLabel'|'method'|'route'>): string {
  if (isNonGenerationRecord(r as any)) return r.opLabel || r.runLabel || '';
  return r.runLabel || r.opLabel || '';
}

/** clean-1149 #7: generation submit / poll / save-result grouped under the same run, with request counts. */
export type GenRunGroup = { key: string; label: string; records: ExecutionRecord[] };
export function groupGenByRun(gen: ExecutionRecord[]): GenRunGroup[] {
  const groups = new Map<string, GenRunGroup>();
  for (const r of gen) {
    const key = r.runSeq != null ? `run-${r.runSeq}` : (r.opSeq != null ? `op-${r.opSeq}` : 'run-none');
    const label = r.runLabel || r.opLabel || '未归属运行';
    if (!groups.has(key)) groups.set(key, { key, label, records: [] });
    groups.get(key)!.records.push(r);
  }
  return [...groups.values()];
}
/** clean-1333: LOCAL rows (local block / Schema reuse) are events, not requests — never counted as requests. */
const isLocalRow = (r: ExecutionRecord) => String(r.method).toUpperCase() === 'LOCAL';
/** clean-1613 #2: viewport pan is an info LOCAL row — never 「请求失败」/「较早失败」/ red failure chrome. */
export const isViewportPanRecord = (r: Pick<ExecutionRecord,'method'|'route'|'state'>) =>
  String(r.method).toUpperCase() === 'LOCAL' && String(r.route || '').includes('视口平移') && r.state !== 'error';

const countLine = (rs: ExecutionRecord[]) => { const local = rs.filter(isLocalRow).length; return `${rs.length - local} 条请求${local ? ` · 本地记录 ${local} 条（未发请求）` : ''}`; };
export const genRunHeader = (g: GenRunGroup) => `${g.label} · ${countLine(g.records)}`;

/** clean-1029: catalog / Schema GETs grouped per user operation, with a request count; the same endpoint twice in ONE operation is flagged (bug signal). */
export type AuxOperationGroup = { key: string; label: string; records: ExecutionRecord[]; duplicates: Array<{ endpoint: string; count: number }> };
export function groupAuxByOperation(aux: ExecutionRecord[]): AuxOperationGroup[] {
  const groups = new Map<string, AuxOperationGroup>();
  for (const r of aux) {
    const key = r.opSeq != null ? `op-${r.opSeq}` : 'op-none';
    if (!groups.has(key)) groups.set(key, { key, label: recordOperationName(r) || '未归属操作（页面加载 / 其它）', records: [], duplicates: [] });
    groups.get(key)!.records.push(r);
  }
  for (const g of groups.values()) {
    const counts = new Map<string, number>();
    for (const r of g.records) { if (isLocalRow(r)) continue; const ep = `${r.method.toUpperCase()} ${String(r.route)}`; counts.set(ep, (counts.get(ep) || 0) + 1); }
    g.duplicates = [...counts].filter(([, n]) => n > 1).map(([endpoint, count]) => ({ endpoint, count }));
  }
  return [...groups.values()];
}
export const auxOperationHeader = (g: AuxOperationGroup) =>
  `${g.label} · ${countLine(g.records)}${g.duplicates.length ? ` · 同一操作内重复：${g.duplicates.map(d => `${d.endpoint.split('?')[0]} ×${d.count}`).join('；')}（异常）` : ''}`;

const EXEC_BTN_MIN=320, GAP=12; // fix11 #2: room for the full 「执行记录 · 生成 N · 目录/Schema M」 label
/** fix12 #2: when forced under top chrome, drop further so the pill does not read as a second toolbar row. */
export const EXEC_TOP_PARK_GAP=28;
/** fix10.1 / fix11.1 / fix12: pure layout calc (unit-tested). dock = dock's viewport rect; returns fixed-position style for the collapsed button.
 *  When there is room left of the dock → park there. When not → park under top chrome on the left (NOT above the dock:
 *  above-dock covered node labels like 「画面比例」 at ~900px). */
export function dockAvoidingStyle(dock:{left:number;top:number;bottom:number}|null, viewport:{width:number;height:number}, topChromeBottom=0):React.CSSProperties{
  if(!dock)return {left:12,bottom:24};
  const room=dock.left-GAP-12;
  if(room>=EXEC_BTN_MIN)return {right:viewport.width-dock.left+GAP,bottom:viewport.height-dock.bottom,maxWidth:Math.min(380,room)};
  // fix11.1 #2 + fix12 #2: under top chrome with extra drop — keeps 「画面比例」 readable and avoids looking like top-bar chrome
  return {left:12,top:Math.max(12,topChromeBottom+EXEC_TOP_PARK_GAP),maxWidth:Math.min(380,Math.max(160,viewport.width-24))};
}
export function isExecTopParked(style:React.CSSProperties):boolean{
  return style.top!==undefined && style.bottom===undefined;
}
function useDockAvoidingPosition(active:boolean):React.CSSProperties{
  const [style,setStyle]=React.useState<React.CSSProperties>({left:12,bottom:24});
  React.useLayoutEffect(()=>{
    if(!active||typeof window==='undefined')return;
    const calc=()=>{
      const el=document.querySelector('[data-testid="modern-tool-dock"]');
      const r=el?.getBoundingClientRect();
      let topChromeBottom=0;
      document.querySelectorAll('[data-canvas-chrome="top"]').forEach((t)=>{const tr=t.getBoundingClientRect();if(tr.height>0)topChromeBottom=Math.max(topChromeBottom,tr.bottom);});
      setStyle(dockAvoidingStyle(r?{left:r.left,top:r.top,bottom:r.bottom}:null,{width:window.innerWidth,height:window.innerHeight},topChromeBottom));
    };
    calc();
    const el=document.querySelector('[data-testid="modern-tool-dock"]');
    const ro=typeof ResizeObserver!=='undefined'&&el?new ResizeObserver(calc):null;if(ro&&el)ro.observe(el);
    window.addEventListener('resize',calc);
    return ()=>{ro?.disconnect();window.removeEventListener('resize',calc);};
  },[active]);
  return style;
}

export function ExecutionLog(){
  const allRecords=React.useSyncExternalStore(subscribeExecution,getExecutions);
  // This page session only; rows restored from before a reload are listed separately and never drive state.
  const records=React.useMemo(()=>allRecords.filter(r=>!r.previousPage),[allRecords]);
  const previous=React.useMemo(()=>allRecords.filter(r=>r.previousPage),[allRecords]);
  const [open,setOpen]=React.useState(false);
  const [copiedId,setCopiedId]=React.useState<number|null>(null);
  const pending=records.filter(r=>r.state==='pending' && !r.acknowledged).length;
  const hasError=records.some(r=>r.state==='error' && !r.acknowledged);
  const latestErrorId=records.find(r=>r.state==='error')?.id;
  const summary=buttonSummary(records,open);

  const copyReport=async(r:ExecutionRecord)=>{
    try {
      await navigator.clipboard.writeText(buildCopyReport(r));
      setCopiedId(r.id);
      setTimeout(()=>setCopiedId(null),1500);
    } catch {
      /* clipboard may be unavailable */
    }
  };

  // clean-1651: collapsed = bottom chrome (band only). venice-krea batch: park collapsed strip left of the
  // center ModernToolDock so it does not cover bottom-left loader node text; wrapper carries the chrome marker.
  // fix10.1: collapsed button is placed from the tool dock's measured box (never under it): right of the bar ends
  // 12px left of the dock; if there is not enough room on the left, it sits above the dock instead.
  const collapsedPos=useDockAvoidingPosition(!open);
  const topParked=!open && isExecTopParked(collapsedPos);
  return <div
      data-testid="exec-log-anchor"
      className={`fixed z-40 select-text ${open ? 'bottom-6 left-4' : ''}`}
      style={open?undefined:collapsedPos}
      data-park={open ? undefined : (topParked ? 'under-top' : 'beside-dock')}
      {...(!open ? { 'data-canvas-chrome': 'bottom' as const } : {})}
    >
    <button
      onClick={()=>setOpen(!open)}
      data-testid="exec-log-toggle"
      data-has-error={hasError ? 'true' : 'false'}
      data-park={topParked ? 'under-top' : undefined}
      className={`flex items-center rounded-xl border px-4 py-2 text-sm overflow-hidden whitespace-nowrap text-left ${
        // clean-1149 #12: toast is the primary red alert; this strip stays a muted cue (no rose / no pulse).
        // clean-1651: long failure text must not stretch the bar (~285px); truncate; details live in the open panel.
        // fix12 #2: top-parked = dashed floating canvas chip (not solid toolbar chrome).
        topParked
          ? (hasError
            ? 'border-dashed border-slate-400/70 bg-[#12151c]/95 text-slate-200 shadow-xl ring-1 ring-white/10'
            : pending
              ? 'border-dashed border-amber-400/60 bg-amber-950/70 text-amber-100 shadow-xl ring-1 ring-amber-200/10'
              : 'border-dashed border-cyan-500/45 bg-[#12151c]/95 text-slate-100 shadow-xl ring-1 ring-cyan-300/15')
          : (hasError
            ? 'border-slate-500 bg-[#1a1f2b] text-slate-200 shadow-lg'
            : pending
              ? 'border-amber-500/50 bg-amber-950/60 text-amber-100 shadow-lg'
              : 'border-slate-600 bg-[#161a24] text-slate-100 shadow-lg')
      }`}
      style={!open && collapsedPos.maxWidth ? { maxWidth: collapsedPos.maxWidth } : undefined}
      title={!open ? (hasError ? humanSummary(records.find(r=>r.state==='error' && !r.acknowledged)!, latestErrorId) : `执行记录 · ${summary}`) : undefined}
    >
      <span className="font-semibold shrink-0">执行记录</span>
      <span className="opacity-90 truncate min-w-0" data-testid="exec-log-summary"> · {summary}</span>
    </button>
    {open&&<section aria-label="执行记录" data-testid="exec-log-panel" data-canvas-chrome="left" className="absolute bottom-12 left-0 w-[min(760px,92vw)] max-h-[calc(100vh-15rem)] overflow-auto rounded-2xl border border-slate-600 bg-[#111620] px-5 pt-5 pb-24 scroll-pb-24 shadow-2xl text-sm text-slate-200">
      <div className="flex justify-between mb-3"><h2 className="font-semibold text-lg">请求与执行记录</h2><button onClick={()=>setOpen(false)}>关闭</button></div>
      <p className="text-slate-400 mb-4">这里能查到每次生成发了什么、在哪一步出错；密钥不会显示。是否出图，以画布上的结果为准。</p>
      {!records.length&&<p>本会话尚未发出请求。</p>}
      {(()=>{const gen=records.filter(r=>!isNonGenerationRecord(r));const aux=records.filter(r=>isNonGenerationRecord(r));const renderRow=(r:ExecutionRecord)=>{
        const parts=requestLineParts(r);
        const second=rowSecondLine(r);
        const polling=isPollingRecord(r);
        const scopeTag=errorScopeTag(r, latestErrorId);
        const viewportPan=isViewportPanRecord(r);
        const tone=viewportPan?'text-slate-300':r.state==='error'?'text-rose-300':r.state==='pending'?'text-amber-200':'text-cyan-200';
        return <details key={r.id} open={r.state==='error' && !r.acknowledged} data-state={r.state} data-viewport-pan={viewportPan?'true':undefined} className={`group border-t border-slate-700 py-3 ${r.state==='error'?'border-l-4 border-l-rose-500 bg-rose-950/40 pl-2':viewportPan?'border-l-4 border-l-slate-500 bg-slate-900/40 pl-2':''}`}>
          <summary className="cursor-pointer break-words list-none [&::-webkit-details-marker]:hidden">
            <span className={`font-mono text-xs [overflow-wrap:anywhere] ${polling?'text-slate-500 font-normal':isGenerateExecutionRoute(r.route)?'text-slate-100 font-semibold':'text-slate-300'}`} data-testid="exec-request-line" data-weight={polling?'light':isGenerateExecutionRoute(r.route)?'strong':'normal'}>
              <span aria-hidden="true" className="mr-1 inline-block text-slate-500 transition-transform group-open:rotate-90">▸</span><span data-testid="exec-category" data-category={recordCategory(r)} className="mr-1 inline-block rounded border border-slate-600 px-1 text-[11px] font-sans font-normal text-slate-300">{CATEGORY_LABEL[recordCategory(r)]}</span>{parts.head}<span className="whitespace-nowrap"> · {parts.status}</span>
            </span>
            {(second||scopeTag||recordOperationName(r)||r.runTarget)&&<span className={`mt-0.5 flex flex-wrap items-center gap-1.5 ${tone}`}>
              {scopeTag&&<span title={ERROR_SCOPE_TAG_TITLE} data-testid="exec-scope-tag" className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold leading-none border border-rose-300/70 bg-rose-900/70 text-rose-50 whitespace-nowrap">{scopeTag}</span>}
              {recordOperationName(r)&&<span className="text-slate-400" data-testid="exec-run-label">{recordOperationName(r)} · </span>}{r.runTarget&&<span className="font-semibold text-slate-100" data-testid="exec-run-target">运行：{r.runTarget} ·</span>}
              {second&&<span>{second}</span>}
            </span>}
            {recordKeyUsageLabels(r).length>0&&<span className="mt-0.5 flex flex-wrap gap-1" data-testid="exec-key-usage">{recordKeyUsageLabels(r).map(k=><span key={k} title="本次请求使用的 Key 在轮换列表中的序号（不显示 Key 内容）" className="rounded border border-slate-500/60 px-1.5 py-0.5 text-[11px] text-slate-200 whitespace-nowrap">{k}</span>)}</span>}
          </summary>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-slate-400 text-xs" title={r.time}>{formatRecordTime(r.time)}</p>
            <button
              type="button"
              onClick={()=>copyReport(r)}
              className="text-xs rounded border border-slate-600 px-2 py-0.5 text-cyan-300 hover:bg-slate-800"
            >
              {copiedId===r.id ? '已复制' : '复制错误报告（无 Key）'}
            </button>
          </div>
          {Array.isArray((r.response as any)?.keyRotation?.attempts) && (r.response as any).keyRotation.attempts.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-slate-400">Key 尝试</p>
              {(r.response as any).keyRotation.attempts.map((a: any, i: number) => (
                <details key={i} className="rounded border border-slate-700/80 bg-black/20 px-3 py-2">
                  <summary className="cursor-pointer break-words text-slate-200 text-xs">
                    <span className="font-mono text-cyan-200/90">{a.maskedKey || '（无掩码）'}</span>
                    <span className="text-slate-400"> · </span>
                    <span>{a.result || '—'}</span>
                  </summary>
                  <p className="mt-2 text-slate-400 text-xs font-mono">{a.status != null ? `HTTP ${a.status}` : '无状态码'}</p>
                  {a.responseBody != null && a.responseBody !== '' && (
                    <pre className="mt-2 whitespace-pre-wrap [overflow-wrap:break-word] [word-break:normal] rounded bg-black/30 p-2 max-h-40 overflow-auto text-xs text-slate-400">{String(a.responseBody)}</pre>
                  )}
                </details>
              ))}
            </div>
          )}
          {(() => {
            const snap = clientRequestSnapshotText(r.request, r.route);
            if (!snap) return null;
            return (
              <details className="mt-3">
                <summary className="cursor-pointer text-slate-400 text-xs">
                  客户端请求 JSON
                  {providerLabelFromRoute(r.route) ? ` · ${providerLabelFromRoute(r.route)}` : ''}
                </summary>
                <pre className="mt-2 whitespace-pre-wrap [overflow-wrap:break-word] [word-break:normal] rounded bg-black/30 p-3 max-h-40 overflow-auto text-xs">{snap}</pre>
              </details>
            );
          })()}
          {(() => {
            const actual = actualRequestFromResponse(r.response);
            if (actual == null) return null;
            const split = splitActualRequest(actual);
            let text: string | null = null;
            let metaText: string | null = null;
            try {
              text = JSON.stringify(redactSecrets(split.sent), null, 2);
              metaText = split.meta ? JSON.stringify(redactSecrets(split.meta), null, 2) : null;
            } catch {
              text = String(actual);
            }
            if (!text || text === '{}' || text === 'null') return null;
            const loras = extractLorasFromRequest({ actualRequest: actual });
            const loraHint = loras.length
              ? ` · loras×${loras.length}`
              : '';
            return (
              <details className="mt-3" open={r.state === 'error'}>
                <summary className="cursor-pointer text-slate-400 text-xs">
                  实际上游请求 actualRequest{providerLabelFromRoute(r.route) ? ` · ${providerLabelFromRoute(r.route)}` : ''}{loraHint}
                </summary>
                <pre className="mt-2 whitespace-pre-wrap [overflow-wrap:anywhere] rounded bg-black/30 p-3 max-h-56 overflow-auto text-xs">{text}</pre>
                {metaText && <details className="mt-2"><summary className="cursor-pointer text-slate-500 text-xs">{ACTUAL_META_LABEL}</summary><pre className="mt-2 whitespace-pre-wrap [overflow-wrap:anywhere] rounded bg-black/20 p-3 max-h-56 overflow-auto text-xs text-slate-400">{metaText}</pre></details>}
              </details>
            );
          })()}
          <details className="mt-3">
            <summary className="cursor-pointer text-slate-400 text-xs">技术细节（HTTP / 路径 / 官方原文）</summary>
            <p className="mt-2 text-slate-400 text-xs font-mono">{r.method} {r.route}{isLocalNotOutbound(r.response)?` · ${localBlockTitle(r.response)}（${schemaReadLine(r.response)}；无上游状态码）`:r.status!=null?` · HTTP ${r.status}`:''}</p>
            <pre className="mt-2 whitespace-pre-wrap [overflow-wrap:break-word] [word-break:normal] rounded bg-black/30 p-3 max-h-80 overflow-auto text-xs">{JSON.stringify(redactSecrets(r.response),(key,value)=>key==='stack'&&r.stack?undefined:typeof value==='string'&&value.startsWith('data:image/')?'[图片数据，请查看生成结果]':value,2)}</pre>
          </details>
          {r.stack&&<details className="mt-3 text-slate-400"><summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-300">查看完整异常堆栈</summary><pre className="whitespace-pre-wrap [overflow-wrap:break-word] [word-break:normal] max-h-64 overflow-auto text-xs mt-2 text-slate-400">{r.stack}</pre></details>}
        </details>;
      };
      // Consecutive polling GETs of the same task collapse into ONE expandable group row (rows inside are unchanged).
      const render=(list:ExecutionRecord[])=>groupPollingRuns(list).map(g=>Array.isArray(g)
        ? <details key={`poll-${g[0].id}`} data-testid="exec-poll-group" className="group border-t border-slate-700 py-3">
            <summary className="cursor-pointer break-words list-none [&::-webkit-details-marker]:hidden font-mono text-xs text-slate-500 [overflow-wrap:anywhere]">
              <span aria-hidden="true" className="mr-1 inline-block transition-transform group-open:rotate-90">▸</span>{pollGroupLine(g)}
            </summary>
            <div className="pl-3">{g.map(renderRow)}</div>
          </details>
        : renderRow(g));
      const auxLiveErrors=aux.filter(r=>r.state==='error' && !r.acknowledged).length;
      return <>{groupGenByRun(gen).map(op=><div key={op.key} data-testid="exec-run-group" className="mt-2"><p className="text-xs text-slate-300" data-testid="exec-run-header">{genRunHeader(op)}</p><div className="pl-3">{render(op.records)}</div></div>)}{!gen.length&&records.length>0&&<p className="text-slate-400" data-testid="exec-no-generation">{noGenerationText(auxLiveErrors)}</p>}{aux.length>0&&<details open={auxLiveErrors>0} className="mt-4 border-t border-slate-700 pt-3"><summary className="cursor-pointer text-slate-400 text-xs">目录 / Schema 请求（非生成，{aux.length} 条{auxLiveErrors?`，其中 ${auxLiveErrors} 条失败`:''}）</summary>{groupAuxByOperation(aux).map(op=><div key={op.key} data-testid="exec-op-group" className="mt-2"><p className={`text-xs ${op.duplicates.length?'text-rose-300':'text-slate-400'}`} data-testid="exec-op-header">{auxOperationHeader(op)}</p><div className="pl-3">{render(op.records)}</div></div>)}</details>}
      {previous.length>0&&(()=>{const prevGenErr=previous.filter(r=>r.state==='error'&&!isNonGenerationRecord(r)).length;return <details open={prevGenErr>0} className="mt-4 border-t border-dashed border-slate-700 pt-3" data-testid="exec-previous-page"><summary className="cursor-pointer text-slate-500 text-xs">刷新前的记录（上一页面，不属于本次会话，{previous.length} 条{prevGenErr?`，其中生成失败 ${prevGenErr} 条`:''}）</summary><div className="opacity-70">{render(previous)}</div></details>;})()}</>;})()}
    </section>}
  </div>;
}

/** Panel line when this session has no generation request yet — consistent with the bar when a catalog GET failed. */
export function noGenerationText(catalogFailures:number):string {
  return catalogFailures>0
    ? `本会话还没有生成请求；本会话的目录 / Schema 请求有 ${catalogFailures} 条失败（非生成请求，见下方）。`
    : '本会话还没有生成请求。';
}
