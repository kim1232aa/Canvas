/**
 * One GET per URL per user action (catalog / Schema plumbing only).
 * Within one action (a model selection — run reuses it) every caller of the same GET (same URL + same credential headers) shares
 * ONE request and its result, INCLUDING failures: a second caller inside the same action gets the same verbatim error,
 * it does not re-fetch. A new user action calls `beginSharedGetAction()` (model (re)selection via noteUserModelSelection) or passes
 * `force: true` (「刷新目录」「读取所选模型的官方 Schema」); only then may the same URL be fetched again.
 * `peekSharedGet` reads the last result without fetching (mount / hydrate never fetch).
 * Generation requests (POST) never go through here.
 */
import { tracedFetch } from './executionTrace';

export type SharedGetResult = { ok: boolean; status: number; data: any };
type Entry = { epoch: number; p: Promise<SharedGetResult>; settledAt?: string; ok?: boolean; status?: number };
const store = new Map<string, Entry>();
const listeners = new Set<() => void>();
let epoch = 0;

export const sharedGetKey = (url: string, headers: Record<string, string> = {}) =>
  JSON.stringify([url, Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]).sort()]);

/** A new user action begins: the next call per URL may fetch again (once). */
export function beginSharedGetAction(): number { return ++epoch; }
export const sharedGetEpoch = () => epoch;
export const subscribeSharedGet = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function sharedGetJson(url: string, headers: Record<string, string> = {}, opts: { force?: boolean; fetchImpl?: typeof fetch } = {}): Promise<SharedGetResult> {
  const key = sharedGetKey(url, headers);
  const hit = store.get(key);
  if (hit && hit.epoch === epoch && !opts.force) return hit.p;
  const doFetch = opts.fetchImpl ?? ((u: string, i: RequestInit) => tracedFetch(u, i, 'schema'));
  const p: Promise<SharedGetResult> = doFetch(url, { method: 'GET', headers })
    .then(async (r) => ({ ok: r.ok, status: r.status, data: await r.json().catch(() => null) }));
  const entry: Entry = { epoch, p };
  store.set(key, entry);
  // clean-1333 #7: remember when / how it settled so a reuse can be shown as 「复用上次失败（北京时间 HH:MM:SS）」.
  p.then((r) => { entry.settledAt = new Date().toISOString(); entry.ok = r.ok; entry.status = r.status; },
    (e: any) => { entry.settledAt = new Date().toISOString(); entry.ok = false; entry.status = typeof e?.appStatus === 'number' ? e.appStatus : undefined; });
  // Failures stay memoised for this action (same verbatim error to every caller); the next action retries.
  p.catch(() => {}).finally(() => listeners.forEach((fn) => fn()));
  listeners.forEach((fn) => fn());
  return p;
}

/** Last result for this GET (any action) without fetching; undefined if never fetched. */
export function peekSharedGet(url: string, headers: Record<string, string> = {}): Promise<SharedGetResult> | undefined {
  return store.get(sharedGetKey(url, headers))?.p;
}

export const sharedGetSize = () => store.size;
export const clearSharedGet = () => { store.clear(); epoch = 0; };

/** clean-1333 #7: settled metadata of the stored result (no fetch). `currentAction` = same action epoch as now. */
export function peekSharedGetMeta(url: string, headers: Record<string, string> = {}): { p: Promise<SharedGetResult>; settledAt?: string; ok?: boolean; status?: number; currentAction: boolean } | undefined {
  const e = store.get(sharedGetKey(url, headers));
  return e ? { p: e.p, settledAt: e.settledAt, ok: e.ok, status: e.status, currentAction: e.epoch === epoch } : undefined;
}
