/** Strip credentials from provenance without changing the request sent upstream. */
export function sanitizeGenerationMetadata(value: unknown): any {
  if (Array.isArray(value)) return value.map(sanitizeGenerationMetadata);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !/api.?key|token|authorization|password|secret|credential|key$/i.test(key)).map(([key, item]) => [key, typeof item === 'string' && /^(?:prompt|negative_?prompt|text|caption|description|content|reason)$/i.test(key) ? item : sanitizeGenerationMetadata(item)]));
  }
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) {
    let url: URL;
    try { url = new URL(value); } catch { return value; }
    const sensitive = [...url.searchParams.keys()].filter(key => /token|key|auth|secret|credential/i.test(key));
    for (const key of sensitive) url.searchParams.delete(key);
    return sensitive.length ? url.toString() : value;
  }
  return value;
}
