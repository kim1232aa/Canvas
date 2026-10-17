import { Connection, NodeInstance } from '../types/graph';
import { modelCheckpoint } from './inspectorParameters';

/**
 * Model-schema lookup failure (GET /api/model-schema … non-2xx): the generation POST was never sent.
 * This is a model/catalog problem, so it belongs on the model (Checkpoint loader) node — not on the sampler.
 * The raw GET URL + status stay in the execution log (traced request) and in the history failure card.
 */
export function isSchemaPrefetchError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as any).name === 'SchemaPrefetchError';
}

/** Full model name from the failed GET URL (`model=` query param), decoded; never truncated. */
export function schemaFailureModel(err: unknown, fallback?: string): string {
  const msg = String((err as any)?.message || '');
  const m = /[?&]model=([^&\s]+)/.exec(msg);
  if (m) {
    try { return decodeURIComponent(m[1]); } catch { return m[1]; }
  }
  return String(fallback || '').trim();
}

export function schemaFailureStatus(err: unknown): number | undefined {
  const d = (err as any)?.data;
  if (d && typeof d.upstreamStatus === 'number') return d.upstreamStatus;
  const m = /→ HTTP (\d{3})/.exec(String((err as any)?.message || ''));
  return m ? Number(m[1]) : undefined;
}

/** Upstream / route body exactly as received (no rewrite). Unwraps route fail() {rawResponse} when present. */
export function schemaFailureRawBody(err: unknown): string {
  const d = (err as any)?.data;
  if (d && typeof d.upstreamResponseBody === 'string' && d.upstreamResponseBody) return d.upstreamResponseBody;
  const lines = String((err as any)?.message || '').split('\n');
  // Drop the trailing 「失败记录写入历史失败：…」 note if the history write itself failed.
  let body = lines.slice(1).join('\n').replace(/\n失败记录写入历史失败：[\s\S]*$/, '').trim();
  if (!body) return '';
  try {
    const w = JSON.parse(body);
    if (w && typeof w === 'object' && w.rawResponse != null) {
      return typeof w.rawResponse === 'string' ? w.rawResponse : JSON.stringify(w.rawResponse);
    }
  } catch { /* raw upstream text */ }
  return body;
}

/**
 * On-node headline. 400/404 = the model id was not resolvable → product copy
 * 「没出图：找不到模型 <name>，请检查模型名」. Other statuses (401/403/5xx…) are not claimed as 「找不到」.
 */
export function schemaFailureHeadline(model: string, status?: number): string {
  const name = model || '（未填模型名）';
  if (status === undefined || status === 400 || status === 404) return `没出图：找不到模型 ${name}，请检查模型名`;
  if (status === 401 || status === 403) return `没出图：读取模型 ${name} 的参数失败（HTTP ${status}），请检查 API Key`;
  return `没出图：读取模型 ${name} 的参数失败（HTTP ${status}）`;
}

/** Node errorMessage: headline on line 1, upstream body verbatim below (UI shows raw behind a collapsed 「详情」). */
export function schemaFailureNodeMessage(err: unknown, fallbackModel?: string): string {
  const headline = schemaFailureHeadline(schemaFailureModel(err, fallbackModel), schemaFailureStatus(err));
  const raw = schemaFailureRawBody(err);
  return raw ? `${headline}\n${raw}` : headline;
}

/** One plain body line for the toast — status once, no duplicated HTTP, no copy of the node headline. */
export function schemaFailureToastBody(status?: number): string {
  if (status === undefined) return '查模型参数失败，生成请求没有发出去';
  return `查模型参数时返回 HTTP ${status}，生成请求没有发出去`;
}

/**
 * Toast for schema-lookup miss: title = plain headline (full model name, never truncated);
 * body first line = status once in plain words; raw upstream under 「展开全文」.
 * Does not reuse 「HTTP N」 as the title (that contradicted 「本地拦截、未发请求」).
 */
export function schemaFailureToast(err: unknown, runLine?: string): { title: string; message: string } {
  const model = schemaFailureModel(err);
  const status = schemaFailureStatus(err);
  const title = schemaFailureHeadline(model, status);
  const raw = schemaFailureRawBody(err);
  const parts = [schemaFailureToastBody(status)];
  if (raw) parts.push(`完整上游响应原文：\n${raw}`);
  if (runLine) parts.push(runLine);
  return { title, message: parts.filter(Boolean).join('\n') };
}

/** The model node this run used: Checkpoint loader on the target's model chain, else the only active loader. */
export function schemaFailureTargetId(nodes: NodeInstance[], connections: Connection[], execNodeId?: string): string | undefined {
  const viaChain = execNodeId ? modelCheckpoint(nodes, connections, execNodeId) : undefined;
  if (viaChain) return viaChain.id;
  const loaders = nodes.filter((n) => n.type === 'CheckpointLoaderSimple' && !n.bypassed);
  return loaders.length === 1 ? loaders[0].id : undefined;
}
