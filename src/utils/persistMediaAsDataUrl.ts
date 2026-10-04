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
  | {
      ok: false;
      status?: number;
      message: string;
      rawResponse?: string;
      errorSource: 'local' | 'network' | 'upstream';
      stack?: string;
      cause?: { name?: string; message: string; code?: string };
    };

function errorCause(error: unknown) {
  if (!(error instanceof Error)) return { message: String(error) };
  const code = (error as NodeJS.ErrnoException).code;
  return { name: error.name, message: error.message, ...(code ? { code } : {}) };
}

/**
 * Download remote media into a data: URL. Surfaces the full HTTP status + body on failure
 * so generate handlers can fail closed instead of storing expiring https URLs.
 */
export async function persistRemoteUrlAsDataUrlResult(remoteUrl: string): Promise<PersistRemoteResult> {
  if (!remoteUrl || typeof remoteUrl !== 'string') {
    const error = new Error('empty or invalid remote URL');
    return { ok: false, message: error.message, errorSource: 'local', stack: error.stack };
  }
  if (remoteUrl.startsWith('data:')) {
    return { ok: true, dataUrl: remoteUrl };
  }
  try {
    const resp = await fetch(remoteUrl);
    if (!resp.ok) {
      try {
        const rawResponse = await resp.text();
        const message = rawResponse ? `HTTP ${resp.status}: ${rawResponse}` : `HTTP ${resp.status}`;
        return {
          ok: false,
          status: resp.status,
          message,
          rawResponse,
          errorSource: 'upstream',
          stack: new Error(message).stack,
        };
      } catch (cause) {
        const error = new Error(`HTTP ${resp.status}: failed to read the complete response body`, { cause });
        return {
          ok: false,
          status: resp.status,
          message: error.message,
          errorSource: 'upstream',
          stack: error.stack,
          cause: errorCause(cause),
        };
      }
    }
    let buf: Buffer;
    try {
      buf = Buffer.from(await resp.arrayBuffer());
    } catch (cause) {
      const error = new Error(`HTTP ${resp.status}: failed to read the complete media response`, { cause });
      return {
        ok: false,
        status: resp.status,
        message: error.message,
        rawResponse: '',
        errorSource: 'upstream',
        stack: error.stack,
        cause: errorCause(cause),
      };
    }
    if (!buf.length) {
      const error = new Error('empty body');
      return { ok: false, status: resp.status, message: error.message, rawResponse: '', errorSource: 'upstream', stack: error.stack };
    }
    const mimeType = guessMimeFromUrl(remoteUrl, resp.headers.get('content-type'));
    return { ok: true, dataUrl: bufferToDataUrl(buf, mimeType) };
  } catch (err: any) {
    const message = err?.message || String(err);
    return {
      ok: false,
      message,
      errorSource: 'network',
      stack: err instanceof Error ? err.stack : undefined,
      cause: errorCause(err),
    };
  }
}


/** Read width/height from a data:image URL without decoding pixels for display. */
export function getDataUrlImageDimensions(dataUrl: string): { width: number; height: number } | null {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return null;
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return null;
  const meta = dataUrl.slice(5, comma); // e.g. image/png;base64
  if (meta.startsWith('image/') === false) return null;
  // Skip video-like or svg (not a raster thumb we measure this way)
  if (meta.startsWith('image/svg')) return null;
  const payload = dataUrl.slice(comma + 1);
  let buf: Buffer;
  try {
    buf = meta.includes(';base64')
      ? Buffer.from(payload, 'base64')
      : Buffer.from(decodeURIComponent(payload));
  } catch {
    return null;
  }
  if (buf.length < 10) return null;

  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }
  // JPEG: scan for SOF0/SOF2
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xd9 || marker === 0xda) break;
      const len = buf.readUInt16BE(i + 2);
      if (len < 2) break;
      // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15 (exclude DHT/DAC etc.)
      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isSof && i + 8 < buf.length) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  // WebP VP8/VP8L/VP8X
  if (
    buf.length >= 30 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    const fourcc = buf.toString('ascii', 12, 16);
    if (fourcc === 'VP8 ' && buf.length >= 30) {
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    if (fourcc === 'VP8L' && buf.length >= 25) {
      const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
      const width = 1 + (((b1 & 0x3f) << 8) | b0);
      const height = 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      return { width, height };
    }
    if (fourcc === 'VP8X' && buf.length >= 30) {
      const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
      const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
      return { width, height };
    }
  }
  return null;
}

/** True when the data URL is a raster image at or below 2×2 — not a durable history thumb. */
export function isUndersizedHistoryImageDataUrl(url: string): boolean {
  const dim = getDataUrlImageDimensions(url);
  if (!dim) return false;
  return dim.width <= 2 || dim.height <= 2;
}

/**
 * Fail-closed helper for generate→history: remote http(s) must become data: (or already-durable)
 * before recordHistoryItem. Never return an expiring blob/imgen URL as the durable result.
 */
export async function requireDurableHistoryMediaUrl(remoteUrl: string): Promise<PersistRemoteResult> {
  if (!remoteUrl || typeof remoteUrl !== 'string') {
    const error = new Error('empty or invalid media URL');
    return { ok: false, message: error.message, errorSource: 'local', stack: error.stack };
  }
  if (isAlreadyDurableHistoryUrl(remoteUrl)) {
    if (isUndersizedHistoryImageDataUrl(remoteUrl)) {
      const error = new Error('image is at most 2×2 pixels — not a durable history thumbnail');
      return {
        ok: false,
        message: error.message,
        errorSource: 'local',
        stack: error.stack,
      };
    }
    return { ok: true, dataUrl: remoteUrl };
  }
  const persisted = await persistRemoteUrlAsDataUrlResult(remoteUrl);
  if (persisted.ok && isUndersizedHistoryImageDataUrl(persisted.dataUrl)) {
    return {
      ok: false,
      message: 'image is at most 2×2 pixels — not a durable history thumbnail',
      errorSource: 'local',
      stack: new Error('image is at most 2×2 pixels — not a durable history thumbnail').stack,
    };
  }
  return persisted;
}

export async function persistRemoteUrlAsDataUrl(remoteUrl: string): Promise<string | null> {
  const result = await persistRemoteUrlAsDataUrlResult(remoteUrl);
  return result.ok ? result.dataUrl : null;
}
