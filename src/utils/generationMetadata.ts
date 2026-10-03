/** Strip credentials from provenance without changing the request sent upstream. */
export function sanitizeGenerationMetadata(value: unknown): any {
  if (Array.isArray(value)) return value.map(sanitizeGenerationMetadata);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !/api.?key|token|authorization|password|secret|credential|key$/i.test(key)).map(([key, item]) => [key, sanitizeGenerationMetadata(item)]));
  }
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) if (/token|key|auth|secret|credential/i.test(key)) url.searchParams.delete(key);
    return url.toString();
  }
  return value;
}
