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

/** Upstream / route body exactly as received (no rewrite). */
export function schemaFailureRawBody(err: unknown): string {
  const d = (err as any)?.data;
  if (d && typeof d.upstreamResponseBody === 'string' && d.upstreamResponseBody) return d.upstreamResponseBody;
  const lines = String((err as any)?.message || '').split('\n');
  return lines.slice(1).join('\n');
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

/** Node errorMessage: headline on line 1, upstream body verbatim below. */
export function schemaFailureNodeMessage(err: unknown, fallbackModel?: string): string {
  const headline = schemaFailureHeadline(schemaFailureModel(err, fallbackModel), schemaFailureStatus(err));
  const raw = schemaFailureRawBody(err);
  return raw ? `${headline}\n${raw}` : headline;
}

/** The model node this run used: Checkpoint loader on the target's model chain, else the only active loader. */
export function schemaFailureTargetId(nodes: NodeInstance[], connections: Connection[], execNodeId?: string): string | undefined {
  const viaChain = execNodeId ? modelCheckpoint(nodes, connections, execNodeId) : undefined;
  if (viaChain) return viaChain.id;
  const loaders = nodes.filter((n) => n.type === 'CheckpointLoaderSimple' && !n.bypassed);
  return loaders.length === 1 ? loaders[0].id : undefined;
}
