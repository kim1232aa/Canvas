import { Connection, NodeInstance } from '../types/graph';
import { modelCheckpoint } from './inspectorParameters';
import { checkpointNodeTitle, loraLoaderNodeTitle, LORA_LOADER_TYPES } from './providerLabels';

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

/** Header title the user sees on the failing node (same derivation as NodeItem for loader nodes). */
export function failedNodeDisplayTitle(n: NodeInstance): string {
  if (n.type === 'CheckpointLoaderSimple') return checkpointNodeTitle(n.values?.targetProvider, n.values?.ckpt_name);
  if (LORA_LOADER_TYPES.has(n.type)) return loraLoaderNodeTitle(n.title, n.values?.lora_name);
  return n.title;
}

/** Downstream (SaveImage etc.) one-liner after an upstream failure: points at the failing node, never repeats its reason. */
export function upstreamFailedLine(failedTitle?: string): string {
  return failedTitle ? `没出图，原因见${failedTitle}` : '没出图';
}

/** True when this node carries a schema-miss for a recorded model that the user just changed away from. */
export function shouldClearSchemaFailureOnModelChange(node: NodeInstance, nextModel: string): boolean {
  if (node.errorKind !== 'schema' || !node.errorMessage) return false;
  const failed = String(node.errorModel ?? '').trim();
  if (!failed) return false;
  return String(nextModel ?? '').trim() !== failed;
}

/**
 * Drop the schema-miss on modelNodeId and the 「没出图，原因见…」 line on nodes that point at it.
 * Leaves errors of other kinds / other nodes alone.
 */
export function clearSchemaFailureFromModelChange(nodes: NodeInstance[], modelNodeId: string): NodeInstance[] {
  return nodes.map((n) => {
    if (n.id === modelNodeId && n.errorKind === 'schema') {
      return {
        ...n,
        state: (n.state === 'error' ? 'idle' : n.state) as NodeInstance['state'],
        errorMessage: undefined,
        errorAt: undefined,
        errorKind: undefined,
        errorModel: undefined,
      };
    }
    if (n.upstreamFailedFromId === modelNodeId) {
      return {
        ...n,
        upstreamFailed: false,
        upstreamFailedTitle: undefined,
        upstreamFailedFromId: undefined,
      };
    }
    return n;
  });
}

/** Toast from this schema-miss: title mentions the failed model (headline). */
export function isSchemaFailureToastForModel(toast: { type?: string; title?: string; message?: string } | null | undefined, failedModel: string): boolean {
  if (!toast) return false;
  // App toasts set type:'error'; helper return value has no type — both accepted. Non-error toasts stay.
  if (toast.type != null && toast.type !== 'error') return false;
  const model = String(failedModel || '').trim();
  if (!model) return false;
  const blob = `${toast.title || ''}\n${toast.message || ''}`;
  return blob.includes(model) && /没出图/.test(blob);
}

/**
 * Apply a schema-miss (or any upstream fail) to the graph the same way App.tsx catch does:
 * error on the model node; branch + downstream-of-run-target nodes get 「没出图，原因见…」
 * with upstreamFailedFromId pointing at the failing node (required so model-change can clear them).
 * downstreamIds are nodes reachable FROM the run target that are NOT in branchIds (e.g. VAE/SaveImage when target is KSampler).
 */
export function applySchemaMissNodeMarks(
  nodes: NodeInstance[],
  opts: {
    schemaNodeId: string;
    schemaNodeMsg: string;
    errorModel: string;
    failedTitle?: string;
    branchIds: Set<string>;
    downstreamIds: Set<string>;
  },
): NodeInstance[] {
  const { schemaNodeId, schemaNodeMsg, errorModel, failedTitle, branchIds, downstreamIds } = opts;
  return nodes.map((n) => {
    // Same order as App.tsx catch: downstream-of-target first (SaveImage often lives here when run target is the sampler).
    if (downstreamIds.has(n.id)) {
      const keepErr = !!n.errorMessage;
      return {
        ...n,
        state: (keepErr ? 'error' : 'idle') as NodeInstance['state'],
        executionProgress: 0,
        upstreamFailed: true,
        upstreamFailedTitle: failedTitle,
        upstreamFailedFromId: schemaNodeId,
        upstreamLocalBlocked: false,
        localBlockTitle: undefined,
        localBlockReason: undefined,
        outputData: undefined,
      };
    }
    if (n.id === schemaNodeId) {
      return {
        ...n,
        state: 'error' as NodeInstance['state'],
        executionProgress: 0,
        errorMessage: schemaNodeMsg,
        errorAt: new Date().toISOString(),
        errorKind: 'schema' as const,
        errorModel,
        upstreamFailed: false,
        upstreamLocalBlocked: false,
      };
    }
    if (!branchIds.has(n.id)) return n;
    return {
      ...n,
      state: 'idle' as NodeInstance['state'],
      executionProgress: 0,
      errorMessage: undefined,
      errorAt: undefined,
      errorKind: undefined,
      upstreamFailed: true,
      upstreamFailedTitle: failedTitle,
      upstreamFailedFromId: schemaNodeId,
      upstreamLocalBlocked: false,
    };
  });
}
