/** Remote preview hang: empty #111215 slab must not look like a photo forever. */

export const PREVIEW_HANG_MS = 3000;

/** True for http(s) previews that can hang without error/load. */
export function isRemotePreviewUrl(url: string | null | undefined): boolean {
  return typeof url === 'string' && /^https?:\/\//i.test(url.trim());
}

/** Real decoded image/video frame (matches existing >2px gate). */
export function isRealMediaSize(width: number, height: number): boolean {
  return width > 2 && height > 2;
}

/**
 * Pure hang decision for unit tests and callers:
 * remote url + no successful load and no error by the deadline => give up.
 * A successful real load (hasSettled) keeps the media even if elapsed would exceed hangMs.
 */
export function shouldGiveUpOnPreviewHang(args: {
  url: string | null | undefined;
  /** True after error, or after a real (>2px) load/loadedmetadata. */
  hasSettled: boolean;
  elapsedMs: number;
  hangMs?: number;
}): boolean {
  if (!isRemotePreviewUrl(args.url)) return false;
  if (args.hasSettled) return false;
  return args.elapsedMs >= (args.hangMs ?? PREVIEW_HANG_MS);
}
