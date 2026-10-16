/**
 * Tensor.Art credential helpers.
 * TAMS Model API (https://tams-api.tensor.art) uses Bearer tokens from https://tams.tensor.art/app.
 * OpenWorks tools (https://openapi.tensor.art/openworks/v1) use Echo-Access-Key ak_tensor_… keys.
 * The two credential families are not interchangeable.
 */
export function parseTensorArtKeys(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((k) => String(k).trim()).filter(Boolean);
  return String(raw)
    .split(/[\n,;]+/)
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

/** OpenWorks Access Key — never send as TAMS Bearer. */
export function isOpenWorksAccessKey(key: string): boolean {
  return /^ak_/i.test(String(key || '').trim());
}

/**
 * Prefer a non-ak_ key for TAMS Model API.
 * Returns null when the pool only has OpenWorks keys (or is empty).
 */
export function pickTamsBearerKey(...sources: unknown[]): string | null {
  const keys = sources.flatMap((s) => parseTensorArtKeys(s));
  const seen = new Set<string>();
  const unique = keys.filter((k) => !seen.has(k) && !!seen.add(k));
  const tams = unique.find((k) => !isOpenWorksAccessKey(k));
  return tams || null;
}

export const TAMS_BEARER_REQUIRED_HINT =
  '画布 Checkpoint / LoRA / 模型查询走 TAMS 模型 API（https://tams-api.tensor.art），需要在 https://tams.tensor.art/app 创建应用获取 Bearer Key。OpenWorks ak_tensor_… 仅用于 OpenWorks 接口，两套凭证不互通。';
