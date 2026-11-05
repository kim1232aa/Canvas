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

export type LiveVideoSchema = {
  schemaStatus?: string;
  hostedToolName?: string;
  selectorField?: string;
  sourceUrl?: string;
  note?: string;
  properties?: Record<string, any>;
};

const videoSchemaSettled = new Map<string, LiveVideoSchema | null>();
const videoSchemaInFlight = new Set<string>();
const videoSchemaListeners = new Set<() => void>();

export function getLiveVideoSchema(provider?: string | null, model?: string | null): LiveVideoSchema | undefined {
  if (!provider || !model) return undefined;
  return videoSchemaSettled.get(`${provider}\u0000${model}`) ?? undefined;
}

/** GET /api/model-schema?isVideo=true so the video node shows the live hosted-tool Schema, not the image one. */
export function useLiveVideoSchema(provider: string, model: string): LiveVideoSchema | undefined {
  const [, setTick] = React.useState(0);
  if (!provider || !model) return undefined;
  const key = `${provider}\u0000${model}`;
  if (videoSchemaSettled.has(key)) return videoSchemaSettled.get(key) ?? undefined;
  const bump = () => setTick((t) => t + 1);
  videoSchemaListeners.add(bump);
  if (!videoSchemaInFlight.has(key)) {
    videoSchemaInFlight.add(key);
    Promise.resolve()
      .then(async () => {
        const { getStoredApiKeys } = await import('../services/api');
        const keys = (() => { try { return getStoredApiKeys() as unknown as Record<string, string>; } catch { return {}; } })();
        const slot = provider === 'openworks' ? 'tensorart' : provider;
        const keyHeader = keys[`${slot}Key`];
        const headers: Record<string, string> = keyHeader ? { [`x-${slot}-key`]: keyHeader } : {};
        const url = `/api/model-schema?provider=${encodeURIComponent(provider)}&model=${encodeURIComponent(model)}&isVideo=true`;
        const r = await fetch(url, { headers });
        const data = await r.json().catch(() => null);
        if (!r.ok || !data) return null;
        const props = data.inputSchema?.properties;
        return {
          schemaStatus: typeof data.schemaStatus === 'string' ? data.schemaStatus : undefined,
          hostedToolName: typeof data.hostedToolName === 'string' ? data.hostedToolName : undefined,
          selectorField: typeof data.selectorField === 'string' ? data.selectorField : undefined,
          sourceUrl: typeof data.sourceUrl === 'string' ? data.sourceUrl : undefined,
          note: typeof data.note === 'string' ? data.note : undefined,
          properties: props && typeof props === 'object' ? props : undefined,
        } as LiveVideoSchema;
      })
      .then((entry) => { videoSchemaSettled.set(key, entry); })
      .catch(() => { videoSchemaSettled.set(key, null); })
      .finally(() => { videoSchemaInFlight.delete(key); const ls = [...videoSchemaListeners]; videoSchemaListeners.clear(); ls.forEach((l) => { try { l(); } catch { /* unmounted */ } }); });
  }
  return undefined;
}
