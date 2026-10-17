/**
 * Tensor.Art credential helpers.
 * TAMS Model API (default https://ap-east-1.tensorart.cloud; override via tensorartBaseUrl / console Endpoint) uses Bearer tokens from https://tams.tensor.art/app.
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
  '本产品 Tensor.Art 已只保留 OpenWorks 真出图（ak_tensor_… → openapi.tensor.art/openworks/v1）。TAMS Bearer / ap-east-1.tensorart.cloud 双轨入口已下线；请在底模选「Tensor.Art OpenWorks」。';
