/**
 * clean-0942: ONE place that turns an explicit user model selection into exactly one Schema GET.
 * Every selection path calls noteUserModelSelection: the node/inspector ID input (commit on blur / Enter), the
 * provider dropdown, 选用此 ID and 应用为底模 (Model Hub). Mount / hydrate / StrictMode never call it, so they send 0.
 * The GET goes through the action-scoped sharedGet, so editors, badges and the next run's driver reuse the same result.
 */
import { getStoredApiKeys } from './api';
import { beginTraceOperation, formatRecordTime, recordLocalEvent } from './executionTrace';
import { beginSharedGetAction, peekSharedGetMeta, sharedGetJson, type SharedGetResult } from './sharedGet';
import { hasModelSchemaFetch } from '../utils/schemaSendHint';

/** clean-1358 #3: App (and tests) subscribe so a Schema GET failure toasts immediately on select. */
export type SchemaSelectResult = { provider: string; model: string; result: SharedGetResult; reused: boolean };
const selectListeners = new Set<(e: SchemaSelectResult) => void>();
export const subscribeSchemaSelectResult = (fn: (e: SchemaSelectResult) => void) => { selectListeners.add(fn); return () => { selectListeners.delete(fn); }; };
const emitSelect = (e: SchemaSelectResult) => { selectListeners.forEach((fn) => { try { fn(e); } catch { /* toast must not break selection */ } }); };

/** The exact URL + credential headers every Schema consumer uses (key equality = one shared request). */
export function schemaRequestFor(provider: string, model: string): { url: string; headers: Record<string, string> } {
  const p = String(provider || '').toLowerCase().trim(); const m = String(model || '').trim();
  const keys = (() => { try { return getStoredApiKeys() as unknown as Record<string, string>; } catch { return {}; } })();
  const slot = p === 'openworks' ? 'tensorart' : p; // OpenWorks shares the Tensor.Art key slot
  const key = keys[`${slot}Key`];
  return { url: `/api/model-schema?provider=${encodeURIComponent(p)}&model=${encodeURIComponent(m)}`, headers: key ? { [`x-${slot}-key`]: key } : {} };
}

let last = '';
export function noteUserModelSelection(provider?: string | null, model?: string | null): Promise<SharedGetResult> | undefined {
  const p = String(provider || '').toLowerCase().trim(); const m = String(model || '').trim();
  if (!p || !m || !hasModelSchemaFetch(p)) return undefined;
  const { url, headers } = schemaRequestFor(p, m);
  // clean-1351 #4: re-selecting the SAME model (dropdown onChange + blur, node sync, hub re-apply) never opens a new
  // action: it reuses the shared result (success or failure). Only a different model — or an explicit force button — refetches.
  const key = `${p}\u0000${m}`;
  if (key === last) {
    const reused = peekSharedGetMeta(url, headers);
    if (reused) {
      // clean-1333 #7: never silent. A settled result that is reused gets a visible label and a log row 「复用，未重新请求」.
      // (Still in flight → it is the same request; nothing to label.) Retry = 刷新 (force) or choose another model.
      if (reused.settledAt) {
        beginTraceOperation(`选用模型 ${p} · ${m}（复用）`);
        const at = formatRecordTime(reused.settledAt).split(' ')[1].replace(/（.*$/, '');
        const label = reused.ok ? `复用上次成功（北京时间 ${at}）` : `复用上次失败（北京时间 ${at}）`;
        recordLocalEvent(`Schema 复用 · ${p} · ${m}`, { ok: true, note: '复用，未重新请求', label, reusedAt: reused.settledAt, reusedOk: !!reused.ok, reusedStatus: reused.status ?? null, retry: '要重试：点刷新，或换一个模型' }, 'complete');
        setReuse(key, { label, at: reused.settledAt, ok: !!reused.ok });
        // Reuse is labelled on the node; do not re-toast (reused:true → App ignores).
        reused.p.then((r) => emitSelect({ provider: p, model: m, result: r, reused: true }), () => {});
      }
      return reused.p;
    }
  }
  setReuse(key, null);
  beginSharedGetAction();
  beginTraceOperation(`选用模型 ${p} · ${m}`);
  last = key;
  const req = sharedGetJson(url, headers);
  // clean-1358 #3: surface success/failure to subscribers (toast on select). Reuse path emits above when settled.
  req.then((r) => emitSelect({ provider: p, model: m, result: r, reused: false }), (e: any) => {
    emitSelect({ provider: p, model: m, result: { ok: false, status: typeof e?.appStatus === 'number' ? e.appStatus : 0, data: e?.data ?? null }, reused: false });
  });
  return req;
}
export const lastUserModelSelection = () => last;

/** clean-1333 #7: visible reuse label per provider+model (cleared when a new GET for that model starts). */
export type SchemaReuse = { label: string; at: string; ok: boolean };
const reuseByKey = new Map<string, SchemaReuse>();
const reuseListeners = new Set<() => void>();
function setReuse(key: string, v: SchemaReuse | null) {
  if (v) reuseByKey.set(key, v); else if (!reuseByKey.delete(key)) return;
  reuseListeners.forEach((fn) => fn());
}
export function schemaReuseFor(provider?: string | null, model?: string | null): SchemaReuse | undefined {
  return reuseByKey.get(`${String(provider || '').toLowerCase().trim()}\u0000${String(model || '').trim()}`);
}
export const subscribeSchemaReuse = (fn: () => void) => { reuseListeners.add(fn); return () => { reuseListeners.delete(fn); }; };
/** A forced re-read (刷新 / 读取官方 Schema) clears the label for that model. */
export function clearSchemaReuse(provider?: string | null, model?: string | null) {
  setReuse(`${String(provider || '').toLowerCase().trim()}\u0000${String(model || '').trim()}`, null);
}
