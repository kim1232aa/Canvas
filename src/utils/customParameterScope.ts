/**
 * custom_parameters are scoped to ONE provider+model (generic, Schema-driven).
 * When the node switches provider/model, top-level keys the NEW model's official Schema does not declare are dropped
 * (they belonged to the previous model — e.g. WaveSpeed Krea aspect_ratio/resolution must not ride along to Venice or
 * z-image). `_canvas` (UI flags) is kept; `_canvas.scope` records which provider/model the values belong to.
 * Returns the new JSON, or null when the text is not a JSON object (the editor keeps it untouched for the user to fix).
 */
export function rescopeCustomParameters(value: string | undefined, provider: string, model: string, declared: string[] | null): string | null {
  let body: any;
  try { body = JSON.parse(value || '{}'); } catch { return null; }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const canvas = { ...(body._canvas || {}) };
  const scope = canvas.scope;
  // Schema matching off → the user explicitly submits raw JSON; nothing is dropped.
  const same = canvas.schemaFieldsOnly === false || (scope && scope.provider === provider && scope.model === model);
  const allowed = new Set(declared || []);
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (k === '_canvas') continue;
    if (same || allowed.has(k)) next[k] = v; // other model's undeclared leftovers are dropped on switch
  }
  canvas.scope = { provider, model };
  // declared === null: the new model's Schema could not be read → no Schema-derived data
  // (properties / endpoint) from the previous provider may survive.
  if (declared) canvas.schemaProperties = declared; else delete canvas.schemaProperties;
  if (!same) { delete canvas.endpoint; delete canvas.schemaSource; delete canvas.schemaEndpoint; }
  const out = JSON.stringify({ ...next, _canvas: canvas }, null, 2);
  try { if (JSON.stringify(JSON.parse(value || '{}')) === JSON.stringify(JSON.parse(out))) return value as string; } catch { /* fallthrough */ }
  return out;
}
