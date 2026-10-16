/**
 * Generic per-(provider, model) Schema cache for 会发送/不会发送 badges.
 * Fetches the same GET /api/model-schema the driver uses at submit time, so the badge
 * and the request come from one Schema. Untraced (catalog plumbing, not a generation request).
 * Failure is kept (status:'error' + message) → badges stay 「待确认」, never a guessed 会发送.
 */
import { getStoredApiKeys } from './api';
import { hasSchemaSendBadges } from '../utils/schemaSendHint';
import { peekSharedGet, subscribeSharedGet } from './sharedGet';
import { schemaRequestFor } from './userModelSelection';
import { sizePairingFromSchemaProps, type SizePairing } from '../utils/localBlock';

type Entry = { status: 'loading' | 'ready' | 'error'; properties?: string[]; propertiesObj?: Record<string, any>; sizePairing?: SizePairing; error?: string; schemaStatus?: string; unprobed?: boolean; confirmed?: string[] };
const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();
let version = 0;
const notify = () => { version++; listeners.forEach((fn) => fn()); };
export const subscribeModelSchema = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const modelSchemaVersion = () => version;
const keyOf = (provider: string, model: string) => `${provider}\u0000${model}`;

export function getModelSchemaEntry(provider?: string | null, model?: string | null): Entry | undefined {
  if (!provider || !model) return undefined;
  return cache.get(keyOf(provider.toLowerCase(), model));
}

/**
 * clean-0903: NEVER fetches on render/mount/hydrate. Mirrors the action-scoped shared GET (sharedGet) that a user action
 * (model selection, 读取 Schema, run) issued; badges follow that one result. An injected fetchImpl (tests) fetches explicitly.
 */
const attached = new WeakMap<Promise<unknown>, string>();
export function ensureModelSchema(provider?: string | null, model?: string | null, fetchImpl?: typeof fetch): void {
  const p = String(provider || '').toLowerCase().trim(); const m = String(model || '').trim();
  if (!p || !m || !hasSchemaSendBadges(p)) return;
  const { url, headers } = schemaRequestFor(p, m);
  let req: Promise<{ ok: boolean; status: number; data: any }> | undefined;
  if (fetchImpl) {
    if (cache.has(keyOf(p, m))) return;
    req = fetchImpl(url, { headers }).then(async (r) => ({ ok: r.ok, status: r.status, data: await r.json().catch(() => null) }));
  } else {
    req = peekSharedGet(url, headers);
    if (!req || attached.get(req) === keyOf(p, m)) return;
    attached.set(req, keyOf(p, m));
  }
  cache.set(keyOf(p, m), { status: 'loading' });
  const r0 = req.catch((e: any) => ({ ok: false, status: e?.appStatus ?? 0, data: e?.data ?? String(e?.message || e) }));
  void r0
    .then(async (r) => {
      const data = r.data;
      const props = data?.inputSchema?.properties;
      cache.set(keyOf(p, m), r.ok && props && typeof props === 'object'
        ? { status: 'ready', properties: Object.keys(props), propertiesObj: props, sizePairing: sizePairingFromSchemaProps(props), schemaStatus: data?.schemaStatus, unprobed: data?.schemaUnprobed === true, confirmed: Array.isArray(data?.schemaConfirmedFields) ? data.schemaConfirmedFields : [] }
        : { status: 'error', error: `HTTP ${r.status} ${typeof data === 'object' ? JSON.stringify(data) : String(data ?? '')}` });
    })
    .catch((e) => cache.set(keyOf(p, m), { status: 'error', error: String(e?.message || e) }))
    .finally(notify);
}
// A shared GET started/settled somewhere (user action) → let subscribers re-render and re-peek.
subscribeSharedGet(() => notify());

/**
 * Merge official Schema property names into custom_parameters for send badges.
 * Ready cache always wins over node-persisted schemaProperties (stale/incomplete props
 * must not keep showing 「不会发送」 for fields the live Schema declares — Krea steps/seed/guidance_scale/styles).
 * When cache is cold, keep scoped node props; foreign-scope props are stripped.
 */
export function withCachedSchemaProperties(provider?: string | null, model?: string | null, customParameters?: string | null): string | undefined {
  try {
    const parsed = JSON.parse(customParameters || '{}');
    const scope = parsed?._canvas?.scope;
    const scoped = !scope || (String(scope.provider || '').toLowerCase() === String(provider || '').toLowerCase() && scope.model === model);
    // Schema properties written for another provider/model are never reused.
    if (!scoped && parsed?._canvas) { const { schemaProperties: _p, schemaConfirmedFields: _c, schemaUnprobed: _u, ...rest } = parsed._canvas; parsed._canvas = rest; customParameters = JSON.stringify(parsed); }
    const entry = getModelSchemaEntry(provider, model);
    if (entry?.status === 'loading') return JSON.stringify({ ...parsed, _canvas: { ...parsed._canvas, schemaLoading: true, schemaUnavailable: undefined } });
    if (entry?.status === 'error') return JSON.stringify({ ...parsed, _canvas: { ...parsed._canvas, schemaUnavailable: true, schemaLoading: undefined } });
    if (entry?.status === 'ready' && entry.properties?.length) {
      return JSON.stringify({ ...parsed, _canvas: { ...parsed._canvas, schemaProperties: entry.properties, schemaLoading: undefined, schemaUnavailable: undefined, ...(entry.unprobed ? { schemaUnprobed: true } : { schemaUnprobed: undefined }), ...(entry.confirmed?.length ? { schemaConfirmedFields: entry.confirmed } : {}) } });
    }
    if (parsed?._canvas?.schemaProperties && scoped) return customParameters || undefined;
    return customParameters || undefined;
  } catch { return customParameters || undefined; }
}

/** clean-1358 #5: Schema-driven size pairing for the canvas width/height mismatch check. */
export function getModelSizePairing(provider?: string | null, model?: string | null): SizePairing {
  const e = getModelSchemaEntry(provider, model);
  if (!e || e.status !== 'ready') return 'unknown';
  return e.sizePairing || sizePairingFromSchemaProps(e.propertiesObj) || 'unknown';
}
