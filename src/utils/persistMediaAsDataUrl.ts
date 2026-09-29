/**
 * Durable history media: same data: URL form already used by OpenAI/fal history.
 * Never leave a signed orchestration blob URL as the sole history.url.
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

export async function persistRemoteUrlAsDataUrl(remoteUrl: string): Promise<string | null> {
  if (!remoteUrl || typeof remoteUrl !== 'string') return null;
  if (remoteUrl.startsWith('data:')) return remoteUrl;
  try {
    const resp = await fetch(remoteUrl);
    if (!resp.ok) {
      console.error(`[persistRemoteUrlAsDataUrl] HTTP ${resp.status} for ${remoteUrl.slice(0, 120)}`);
      return null;
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    if (!buf.length) {
      console.error('[persistRemoteUrlAsDataUrl] empty body');
      return null;
    }
    const mimeType = guessMimeFromUrl(remoteUrl, resp.headers.get('content-type'));
    return bufferToDataUrl(buf, mimeType);
  } catch (err: any) {
    console.error(`[persistRemoteUrlAsDataUrl] ${err?.message || err}`);
    return null;
  }
}
