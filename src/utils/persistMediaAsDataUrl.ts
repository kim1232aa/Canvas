/**
 * Durable history media: same data: URL form already used by OpenAI/fal history.
 * Never leave a signed orchestration / imgen blob URL as the sole history.url.
 */

export function bufferToDataUrl(buf: Buffer | Uint8Array, mimeType: string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const mime = (mimeType || 'image/jpeg').split(';')[0].trim() || 'image/jpeg';
  return `data:${mime};base64,${b.toString('base64')}`;
}

export function guessMimeFromUrl(remoteUrl: string, contentType?: string | null): string {
  let mimeType = (contentType || '').split(';')[0].trim();
  if (!mimeType || mimeType === 'application/octet-stream') {
    if (remoteUrl.includes('.mp4') || remoteUrl.includes('video')) mimeType = 'video/mp4';
    else if (remoteUrl.includes('.webp')) mimeType = 'image/webp';
    else if (remoteUrl.includes('.png')) mimeType = 'image/png';
    else mimeType = 'image/jpeg';
  }
  return mimeType;
}

/** data: or same-origin path — safe to store as history.url without re-download. */
export function isAlreadyDurableHistoryUrl(url: string): boolean {
  return (
    typeof url === 'string' &&
    (url.startsWith('data:') || (url.startsWith('/') && !url.startsWith('//')))
  );
}

export type PersistRemoteResult =
  | { ok: true; dataUrl: string }
  | { ok: false; status?: number; message: string };

/**
 * Download remote media into a data: URL. Surfaces HTTP status + body snippet on failure
 * so generate handlers can fail closed instead of storing expiring https URLs.
 */
export async function persistRemoteUrlAsDataUrlResult(remoteUrl: string): Promise<PersistRemoteResult> {
  if (!remoteUrl || typeof remoteUrl !== 'string') {
    return { ok: false, message: 'empty or invalid remote URL' };
  }
  if (remoteUrl.startsWith('data:')) {
    return { ok: true, dataUrl: remoteUrl };
  }
  try {
    const resp = await fetch(remoteUrl);
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      const snippet = body ? body.slice(0, 500) : '';
      const message = snippet
        ? `HTTP ${resp.status}: ${snippet}`
        : `HTTP ${resp.status}`;
      console.error(`[persistRemoteUrlAsDataUrl] ${message} for ${remoteUrl.slice(0, 120)}`);
      return { ok: false, status: resp.status, message };
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    if (!buf.length) {
      console.error('[persistRemoteUrlAsDataUrl] empty body');
      return { ok: false, message: 'empty body' };
    }
    const mimeType = guessMimeFromUrl(remoteUrl, resp.headers.get('content-type'));
    return { ok: true, dataUrl: bufferToDataUrl(buf, mimeType) };
  } catch (err: any) {
    const message = err?.message || String(err);
    console.error(`[persistRemoteUrlAsDataUrl] ${message}`);
    return { ok: false, message };
  }
}

/**
 * Fail-closed helper for generate→history: remote http(s) must become data: (or already-durable)
 * before recordHistoryItem. Never return an expiring blob/imgen URL as the durable result.
 */
export async function requireDurableHistoryMediaUrl(remoteUrl: string): Promise<PersistRemoteResult> {
  if (!remoteUrl || typeof remoteUrl !== 'string') {
    return { ok: false, message: 'empty or invalid media URL' };
  }
  if (isAlreadyDurableHistoryUrl(remoteUrl)) {
    return { ok: true, dataUrl: remoteUrl };
  }
  return persistRemoteUrlAsDataUrlResult(remoteUrl);
}

export async function persistRemoteUrlAsDataUrl(remoteUrl: string): Promise<string | null> {
  const result = await persistRemoteUrlAsDataUrlResult(remoteUrl);
  return result.ok ? result.dataUrl : null;
}
