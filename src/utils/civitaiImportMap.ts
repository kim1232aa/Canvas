/**
 * Civitai import field mappers.
 * Empty / Undefined / unknown must NOT forge euler or sgm_uniform.
 */

const EMPTY_TOKENS = new Set(['', 'undefined', 'none', 'null', 'n/a', 'na']);

function normalizeToken(s: string): string {
  return (s || '').toLowerCase().trim();
}

export function mapSampler(s: string): string {
  const lower = normalizeToken(s);
  if (!lower || EMPTY_TOKENS.has(lower)) return '';
  if (lower.includes('dpm++ 2m') || lower.includes('dpmpp_2m')) return 'dpmpp_2m';
  if (lower.includes('dpm++ sde') || lower.includes('dpmpp_sde')) return 'dpmpp_sde';
  if (lower.includes('dpm++ 3m sde') || lower.includes('dpmpp_3m_sde')) return 'dpmpp_3m_sde';
  if (lower.includes('euler a') || lower.includes('euler_ancestral')) return 'euler_ancestral';
  if (lower.includes('er_sde_simple')) return 'er_sde_simple';
  if (lower.includes('er_sde')) return 'er_sde';
  if (lower.includes('heun')) return 'heun';
  if (lower.includes('ddim')) return 'ddim';
  if (lower.includes('euler')) return 'euler';
  // Unrecognized (including literal "Undefined") → empty, never forge euler
  return '';
}

export function mapScheduler(s: string): string {
  const lower = normalizeToken(s);
  if (!lower || EMPTY_TOKENS.has(lower)) return '';
  if (lower.includes('karras')) return 'karras';
  if (lower.includes('sgm_uniform')) return 'sgm_uniform';
  if (lower.includes('exponential')) return 'exponential';
  if (lower.includes('simple')) return 'simple';
  if (lower.includes('normal')) return 'normal';
  // Unrecognized → empty, never forge a schedule
  return '';
}

/** Image-import: empty/missing negative must stay empty (no blurry template). */
export function resolveImportedNegativePrompt(
  metaNegative: unknown,
  templateDefault: string
): string {
  if (typeof metaNegative === 'string') return metaNegative;
  if (metaNegative == null) return '';
  // Non-string unexpected → empty rather than template fill
  void templateDefault;
  return '';
}

const isCheckpointType = (t: unknown) => String(t ?? '').toLowerCase() === 'checkpoint';
const idStr = (v: unknown) => (v == null ? '' : String(v).trim());

/**
 * Image-import checkpoint ref for resolveCivitaiAir. Prefers unique ids so we never
 * create ambiguity (e.g. "Flux.1 D") when modelId@versionId existed.
 * Name/architecture fallbacks may still be ambiguous — resolver reports that honestly.
 */
export function resolveImportedCheckpointRef(
  resources: unknown,
  meta: any,
  fallbackName: string,
  baseModel: string
): string {
  const ckpt: any = Array.isArray(resources)
    ? resources.find((r: any) => r && (isCheckpointType(r.modelType) || isCheckpointType(r.type)))
    : null;
  if (ckpt) {
    const air = idStr(ckpt.air);
    if (air) return air;
    const modelId = idStr(ckpt.modelId);
    const versionId = idStr(ckpt.versionId) || idStr(ckpt.modelVersionId);
    if (modelId && versionId) return `${modelId}@${versionId}`;
    if (/^\d+$/.test(versionId)) return versionId;
  }
  const metaCkpt: any = Array.isArray(meta?.civitaiResources)
    ? meta.civitaiResources.find((r: any) => r && isCheckpointType(r.type) && idStr(r.modelVersionId))
    : null;
  if (metaCkpt) return idStr(metaCkpt.modelVersionId);
  return idStr(meta?.Model) || idStr(ckpt?.modelName) || idStr(fallbackName) || idStr(baseModel);
}
