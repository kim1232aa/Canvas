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

/**
 * Shared settle state for toast + history/asset thumbs (one rule, no drift).
 * - loading: remote waiting for load/error (show 「预览加载中…」)
 * - ok: real >2px media visible
 * - failed_hang: hang deadline hit; media stays mountable for a late real load
 * - failed_hard: onError / ≤2px — terminal, never flips back to a picture
 */
export type PreviewSettleState = 'loading' | 'ok' | 'failed_hang' | 'failed_hard';

export type PreviewSettleEvent =
  | { type: 'reset' }
  | { type: 'hang_timeout' }
  | { type: 'real_media' }
  | { type: 'hard_fail' };

export function reducePreviewSettle(
  state: PreviewSettleState,
  event: PreviewSettleEvent,
): PreviewSettleState {
  switch (event.type) {
    case 'reset':
      return 'loading';
    case 'hard_fail':
      return 'failed_hard';
    case 'real_media':
      // Late real load may clear hang failure; hard fail / tiny stay failed.
      if (state === 'failed_hard') return 'failed_hard';
      return 'ok';
    case 'hang_timeout':
      // Only the still-waiting remote gives up; settled/error are not overridden.
      if (state === 'loading') return 'failed_hang';
      return state;
    default:
      return state;
  }
}

export function previewShowsWaiting(state: PreviewSettleState, remote: boolean): boolean {
  return remote && state === 'loading';
}

export function previewShowsFailure(state: PreviewSettleState): boolean {
  return state === 'failed_hang' || state === 'failed_hard';
}

export function previewShowsMedia(state: PreviewSettleState): boolean {
  return state === 'ok';
}

/** Hang keeps media mounted (hidden) so a late CDN load can still appear. */
export function previewKeepMediaMounted(
  state: PreviewSettleState,
  hasUrl: boolean,
): boolean {
  if (!hasUrl) return false;
  return state !== 'failed_hard';
}

/**
 * History 「应用到画布」 / asset 「送入画板」 / 「加节点」 /
 * 「添加至 ComfyUI 节点图」: grey + no-op only when the shared preview
 * settle has already shown the failure placeholder.
 * Reuses previewShowsFailure — loading must stay enabled (may still become ok).
 */
export function isApplyToCanvasDisabled(settle: PreviewSettleState): boolean {
  return previewShowsFailure(settle);
}

/** Node-graph add uses the same failure predicate as apply-to-canvas. */
export function isAddToNodeGraphDisabled(settle: PreviewSettleState): boolean {
  return isApplyToCanvasDisabled(settle);
}
