/**
 * fix10.1: zero-width characters (U+200B/200C/200D/FEFF/2060) must never live in node values.
 * - Loaded/stored node values are scrubbed VISIBLY (toast + exec-log local event) by the caller — never silently.
 * - Request building does NOT strip: preRunZeroWidthBlock() reports them as a local block instead.
 * History request snapshots are not touched.
 */
export const ZERO_WIDTH_RE = /[\u200B\u200C\u200D\uFEFF\u2060]/g;
export const ZERO_WIDTH_CODEPOINTS = ['U+200B', 'U+200C', 'U+200D', 'U+FEFF', 'U+2060'];
export type ZeroWidthHit = { nodeId: string; nodeTitle: string; field: string; count: number };

const countZw = (s: string) => (s.match(ZERO_WIDTH_RE) || []).length;

export function scanZeroWidth(nodes: Array<{ id: string; title?: string; type?: string; values?: Record<string, unknown> }>): ZeroWidthHit[] {
  const hits: ZeroWidthHit[] = [];
  for (const n of nodes || []) for (const [field, v] of Object.entries(n?.values || {})) {
    if (typeof v === 'string') { const c = countZw(v); if (c) hits.push({ nodeId: n.id, nodeTitle: String(n.title || n.type || n.id), field, count: c }); }
  }
  return hits;
}

export function scrubZeroWidthNodes<T extends { id: string; values?: Record<string, unknown> }>(nodes: T[]): { nodes: T[]; hits: ZeroWidthHit[] } {
  const hits = scanZeroWidth(nodes as any);
  if (!hits.length) return { nodes, hits };
  const dirty = new Set(hits.map((h) => h.nodeId));
  return {
    hits,
    nodes: nodes.map((n) => !dirty.has(n.id) ? n : { ...n, values: Object.fromEntries(Object.entries(n.values || {}).map(([k, v]) => [k, typeof v === 'string' ? v.replace(ZERO_WIDTH_RE, '') : v])) }),
  };
}

export const describeZeroWidthHits = (hits: ZeroWidthHit[]) =>
  hits.map((h) => `「${h.nodeTitle}」字段 ${h.field}：${h.count} 个`).join('；');

/** Local block payload when zero-width chars reach a run (not stripped here). Null when clean. */
export function preRunZeroWidthBlock(nodes: Parameters<typeof scanZeroWidth>[0]): Record<string, unknown> | null {
  const hits = scanZeroWidth(nodes);
  if (!hits.length) return null;
  const error = `参数含零宽字符（${ZERO_WIDTH_CODEPOINTS.join('/')}），未发请求：${describeZeroWidthHits(hits)}。请清除后重试。`;
  return { ok: false, errorSource: 'local', localOnly: true, requestCount: 0, error, zeroWidthHits: hits, blockedField: { field: hits[0].field, value: null, reason: error } };
}
