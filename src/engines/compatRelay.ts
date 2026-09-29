/** OpenAI-compat / Grok-compat relay helpers. No hardcoded provider hosts. */

export function normalizeOpenAICompatBaseUrl(raw: string): string {
  return String(raw || '').trim().replace(/\/+$/, '');
}

export function normalizeGrokCompatBaseUrl(raw: string): string {
  const trimmed = String(raw || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/\/v1$/i.test(trimmed)) return trimmed;
  return `${trimmed}/v1`;
}

export function extractCompatImageUrl(
  item: { b64_json?: string; url?: string } | undefined | null,
): string | null {
  if (!item) return null;
  if (typeof item.b64_json === 'string' && item.b64_json) {
    return item.b64_json.startsWith('data:') ? item.b64_json : `data:image/png;base64,${item.b64_json}`;
  }
  if (typeof item.url === 'string' && item.url) return item.url;
  return null;
}

export function resolveAgainstBaseOrigin(url: string, baseUrl: string): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
  try {
    const origin = new URL(baseUrl).origin;
    if (url.startsWith('/')) return `${origin}${url}`;
    return new URL(url, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
  } catch {
    return url;
  }
}

export function httpErrorMessage(status: number, body: unknown): string {
  const text =
    typeof body === 'string'
      ? body
      : body && typeof body === 'object' && 'error' in (body as any)
        ? String((body as any).error)
        : JSON.stringify(body ?? '');
  return `HTTP ${status}: ${text}`;
}
