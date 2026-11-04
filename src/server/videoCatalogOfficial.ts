/**
 * Official video-model listing helpers (no per-model special cases).
 * Replicate: GET /v1/search?query= (beta) returns public models incl. community ones, with metadata.tags
 *   — https://replicate.com/docs/reference/http#search ; collections/{slug} — https://replicate.com/docs/reference/http#collections.get
 * Civitai: GET /api/v1/models?types=Checkpoint&baseModels=… with base model names from GET /api/v1/enums (BaseModel),
 *   and GET /api/v1/model-versions/{id} which returns the version's `air` — https://developer.civitai.com/site/reference/models.md ,
 *   https://developer.civitai.com/site/reference/model-versions.md
 */

/** Video base models as Civitai publishes them in GET /api/v1/enums → BaseModel (names containing "Video"). */
export function civitaiVideoBaseModels(enums: unknown): string[] {
  const list = (enums as any)?.BaseModel;
  return Array.isArray(list) ? list.filter((b: unknown) => typeof b === 'string' && /\bvideo\b/i.test(b)) : [];
}

/** AIR resource identifier → {modelId, versionId} (https://developer.civitai.com/site/guide — AIR identifiers). */
export function parseCivitaiAir(s: string): { modelId: string; versionId: string } | undefined {
  const m = /^urn:air:[^:]+:[^:]+:civitai:(\d+)@(\d+)$/i.exec(String(s || '').trim());
  return m ? { modelId: m[1], versionId: m[2] } : undefined;
}

/** A model-version object (GET /api/v1/model-versions/{id}) → catalog row keyed by its official `air`, only when its base model is a video base model. */
export function civitaiVersionVideoRow(version: any, videoBaseModels: string[]): Record<string, unknown> | undefined {
  if (!version || typeof version.air !== 'string' || !videoBaseModels.includes(String(version.baseModel || ''))) return undefined;
  const modelName = version.model?.name || '';
  return {
    id: version.air,
    name: modelName ? `${modelName} · ${version.name || version.id}` : String(version.name || version.air),
    provider: 'Civitai', type: version.model?.type || 'Checkpoint', category: 'Video', baseModel: version.baseModel,
    externalUrl: `https://civitai.com/models/${version.modelId}?modelVersionId=${version.id}`,
    sourceUrl: `https://civitai.com/api/v1/model-versions/${version.id}`,
  };
}

/** Replicate /v1/search response → video models (official metadata.tags mention video). Each row carries latest_version for the label. */
export function replicateSearchVideoModels(search: any): any[] {
  const models = Array.isArray(search?.models) ? search.models : Array.isArray(search?.results) ? search.results : [];
  return models
    .map((r: any) => r?.model && typeof r.model === 'object' ? { ...r.model, metadata: r.metadata ?? r.model.metadata } : r)
    .filter((m: any) => m?.owner && m?.name && (Array.isArray(m.metadata?.tags) ? m.metadata.tags : []).some((t: unknown) => /video/i.test(String(t))));
}

/** Short-TTL server cache: versionId → model-version JSON (null = fetched, no usable data). */
const versionCache = new Map<string, { at: number; v: any | null }>();
export const CIVITAI_AIR_TTL_MS = 10 * 60_000;
export const CIVITAI_AIR_MAX_FETCH = 20;
export function _resetCivitaiVersionCache() { versionCache.clear(); }

/**
 * Resolve official `air` for listed versions via GET /api/v1/model-versions/{id}
 * (https://developer.civitai.com/site/guide/air.md: "Every response from GET /model-versions/{id} includes an air field").
 * At most `maxFetch` uncached upstream calls per load; versions beyond that (or without air) are dropped — no invented id.
 */
export async function resolveCivitaiVersions(
  versionIds: string[], fetchVersion: (id: string) => Promise<any | null>,
  opts: { maxFetch?: number; ttlMs?: number; now?: () => number } = {},
): Promise<{ versions: Map<string, any>; fetched: number }> {
  const now = opts.now ?? Date.now, ttl = opts.ttlMs ?? CIVITAI_AIR_TTL_MS, max = opts.maxFetch ?? CIVITAI_AIR_MAX_FETCH;
  const out = new Map<string, any>(); const todo: string[] = [];
  for (const id of [...new Set(versionIds)]) {
    const c = versionCache.get(id);
    if (c && now() - c.at < ttl) { if (c.v?.air) out.set(id, c.v); } else if (todo.length < max) todo.push(id);
  }
  await Promise.all(todo.map(async (id) => {
    const v = await fetchVersion(id).catch(() => null);
    versionCache.set(id, { at: now(), v: v ?? null });
    if (v?.air) out.set(id, v);
  }));
  return { versions: out, fetched: todo.length };
}
