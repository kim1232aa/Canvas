/**
 * 「实际发送」 shows only what went upstream: the endpoint and the request body (`parameters`).
 * Everything else the server attaches to actualRequest (mapping, schemaFields, parametersOnly, schemaFieldsOnly,
 * requestedLoras, …) is canvas diagnostics that was never sent; it is returned separately under `meta`
 * and rendered in its own fold labelled as not sent. Values are never rewritten.
 */
export const ACTUAL_META_LABEL = '画布诊断（未发给上游）：字段映射 / Schema 字段清单';
const SENT_KEYS = ['endpoint', 'method', 'parameters'] as const;

export function splitActualRequest(actual: unknown): { sent: unknown; meta: Record<string, unknown> | null } {
  if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return { sent: actual, meta: null };
  const a = actual as Record<string, unknown>;
  // Only envelope-shaped objects ({endpoint, parameters}) are split; any other shape is shown as-is (nothing hidden).
  // Bare body: shown as-is, except records written before 1035 where the canvas appended its own `schemaFields`
  // (array of field names) beside the body — that list was never sent (outbound trace requestBody lacks it).
  if (!('parameters' in a)) {
    if (!Array.isArray(a.schemaFields)) return { sent: actual, meta: null };
    const { schemaFields, ...rest } = a;
    return { sent: rest, meta: { schemaFields } };
  }
  const sent: Record<string, unknown> = {};
  const meta: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(a)) {
    if ((SENT_KEYS as readonly string[]).includes(k)) sent[k] = v;
    else if (v !== undefined) meta[k] = v;
  }
  return { sent, meta: Object.keys(meta).length ? meta : null };
}
