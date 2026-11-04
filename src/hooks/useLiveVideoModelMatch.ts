import React from 'react';
import { fetchLiveModelsShared } from '../services/api';

export type LiveVideoModelOption = { value: string; label: string };

/** Catalog row → option. Replicate rows carry latest_version: the label names the version that will be used. */
export function liveVideoOption(row: any): LiveVideoModelOption | undefined {
  const id = String(row?.id ?? row?.value ?? '').trim();
  if (!id) return undefined;
  const name = String(row?.name || id);
  const version = row?.latest_version?.id ?? row?.metadata?.latest_version?.id ?? row?.latestVersion;
  const base = name === id ? id : `${name} · ${id}`;
  return { value: id, label: typeof version === 'string' && version ? `${base}:${version.slice(0, 8)}…` : base };
}

/** Find `model` in `provider`'s live video catalog (GET /api/models category=video, query=model id). Never injects a model the catalog lacks. */
export function findLiveVideoModel(data: Record<string, any> | undefined, provider: string, model: string): LiveVideoModelOption | undefined {
  const rows = Array.isArray(data?.[provider]) ? data![provider] : [];
  const hit = rows.find((r: any) => String(r?.id ?? r?.value ?? '') === model);
  return hit ? liveVideoOption(hit) : undefined;
}

const settled = new Map<string, LiveVideoModelOption | null>();
const inFlight = new Set<string>();
const listeners = new Set<() => void>();

/** useState only (NodeItem is rendered without effects in tests): one catalog GET per provider+model; resolves into a shared map. */
export function useLiveVideoModelMatch(provider: string, model: string): LiveVideoModelOption | undefined {
  const [, setTick] = React.useState(0);
  if (!provider || !model) return undefined;
  const key = `${provider}\u0000${model}`;
  if (settled.has(key)) return settled.get(key) ?? undefined;
  const bump = () => setTick((t) => t + 1);
  listeners.add(bump);
  if (!inFlight.has(key)) {
    inFlight.add(key);
    Promise.resolve()
      .then(() => fetchLiveModelsShared(false, provider, model, 'Checkpoint', 'video', 'downloads', '', 1, 100, '', ''))
      .then((data) => { settled.set(key, findLiveVideoModel(data as any, provider, model) ?? null); })
      .catch(() => { settled.set(key, null); })
      .finally(() => { inFlight.delete(key); const ls = [...listeners]; listeners.clear(); ls.forEach((l) => { try { l(); } catch { /* unmounted */ } }); });
  }
  return undefined;
}
