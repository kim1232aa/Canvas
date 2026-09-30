import { describe, it, expect } from 'vitest';
import {
  PREVIEW_HANG_MS,
  isRemotePreviewUrl,
  isRealMediaSize,
  shouldGiveUpOnPreviewHang,
  reducePreviewSettle,
  previewShowsWaiting,
  previewShowsFailure,
  previewShowsMedia,
  previewKeepMediaMounted,
  isApplyToCanvasDisabled,
  isAddToNodeGraphDisabled,
  type PreviewSettleState,
} from './previewHang';

describe('preview hang decision', () => {
  it('treats http(s) as remote; data: and relative paths are not', () => {
    expect(isRemotePreviewUrl('https://cdn.example/a.jpg')).toBe(true);
    expect(isRemotePreviewUrl('http://127.0.0.1:3999/hang')).toBe(true);
    expect(isRemotePreviewUrl('data:image/png;base64,aaa')).toBe(false);
    expect(isRemotePreviewUrl('/local/thumb.png')).toBe(false);
    expect(isRemotePreviewUrl('')).toBe(false);
    expect(isRemotePreviewUrl(null)).toBe(false);
  });

  it('keeps media when a real load settled before the hang deadline', () => {
    expect(
      shouldGiveUpOnPreviewHang({
        url: 'https://cdn.example/ok.jpg',
        hasSettled: true,
        elapsedMs: PREVIEW_HANG_MS + 500,
      }),
    ).toBe(false);
  });

  it('gives up on remote url with no load/error by 3000ms', () => {
    expect(
      shouldGiveUpOnPreviewHang({
        url: 'https://cdn.example/hang.jpg',
        hasSettled: false,
        elapsedMs: 2999,
      }),
    ).toBe(false);
    expect(
      shouldGiveUpOnPreviewHang({
        url: 'https://cdn.example/hang.jpg',
        hasSettled: false,
        elapsedMs: 3000,
      }),
    ).toBe(true);
  });

  it('does not hang-timeout data: images (they keep showing when they load)', () => {
    expect(
      shouldGiveUpOnPreviewHang({
        url: 'data:image/png;base64,xx',
        hasSettled: false,
        elapsedMs: 10_000,
      }),
    ).toBe(false);
  });

  it('real size gate: both sides >2 keep; 1x1 is not real', () => {
    expect(isRealMediaSize(512, 512)).toBe(true);
    expect(isRealMediaSize(3, 3)).toBe(true);
    expect(isRealMediaSize(2, 2)).toBe(false);
    expect(isRealMediaSize(1, 1)).toBe(false);
    expect(isRealMediaSize(0, 100)).toBe(false);
  });
});

describe('shared preview settle rule (toast + history/asset)', () => {
  it('late real load wins over the hang deadline', () => {
    let s: PreviewSettleState = 'loading';
    s = reducePreviewSettle(s, { type: 'hang_timeout' });
    expect(s).toBe('failed_hang');
    expect(previewShowsFailure(s)).toBe(true);
    expect(previewKeepMediaMounted(s, true)).toBe(true);
    expect(previewShowsMedia(s)).toBe(false);

    s = reducePreviewSettle(s, { type: 'real_media' });
    expect(s).toBe('ok');
    expect(previewShowsFailure(s)).toBe(false);
    expect(previewShowsMedia(s)).toBe(true);
    expect(previewShowsWaiting(s, true)).toBe(false);
  });

  it('never-settled remote still gives up at the hang deadline', () => {
    let s: PreviewSettleState = 'loading';
    expect(previewShowsWaiting(s, true)).toBe(true);
    expect(shouldGiveUpOnPreviewHang({
      url: 'https://cdn.example/hang.jpg',
      hasSettled: false,
      elapsedMs: PREVIEW_HANG_MS,
    })).toBe(true);
    s = reducePreviewSettle(s, { type: 'hang_timeout' });
    expect(s).toBe('failed_hang');
    expect(previewShowsFailure(s)).toBe(true);
    expect(previewShowsWaiting(s, true)).toBe(false);
    // stays failed until a real load; without one, failure remains
    expect(previewShowsMedia(s)).toBe(false);
    expect(previewKeepMediaMounted(s, true)).toBe(true);
  });

  it('settled/error does not get overridden by the timer', () => {
    const afterOk = reducePreviewSettle('ok', { type: 'hang_timeout' });
    expect(afterOk).toBe('ok');
    expect(previewShowsMedia(afterOk)).toBe(true);

    const afterHard = reducePreviewSettle('failed_hard', { type: 'hang_timeout' });
    expect(afterHard).toBe('failed_hard');

    // hard fail / tiny must not flip back to a picture on a later load event
    const hardThenLoad = reducePreviewSettle('failed_hard', { type: 'real_media' });
    expect(hardThenLoad).toBe('failed_hard');
    expect(previewShowsMedia(hardThenLoad)).toBe(false);
    expect(previewKeepMediaMounted(hardThenLoad, true)).toBe(false);

    // error path: loading → hard_fail is terminal
    let s: PreviewSettleState = 'loading';
    s = reducePreviewSettle(s, { type: 'hard_fail' });
    expect(s).toBe('failed_hard');
    s = reducePreviewSettle(s, { type: 'hang_timeout' });
    expect(s).toBe('failed_hard');
    s = reducePreviewSettle(s, { type: 'real_media' });
    expect(s).toBe('failed_hard');
  });

  it('reset returns to loading; soft hang is recoverable, hard is not', () => {
    expect(reducePreviewSettle('failed_hang', { type: 'reset' })).toBe('loading');
    expect(reducePreviewSettle('ok', { type: 'reset' })).toBe('loading');
    expect(reducePreviewSettle('failed_hard', { type: 'hard_fail' })).toBe('failed_hard');
  });
});

describe('apply-to-canvas disabled only on settled failure', () => {
  it('disables for failed_hang and failed_hard; not for loading or ok', () => {
    expect(isApplyToCanvasDisabled('failed_hang')).toBe(true);
    expect(isApplyToCanvasDisabled('failed_hard')).toBe(true);
    expect(isApplyToCanvasDisabled('loading')).toBe(false);
    expect(isApplyToCanvasDisabled('ok')).toBe(false);
  });

  it('tracks previewShowsFailure (no second timeout rule)', () => {
    const states: PreviewSettleState[] = ['loading', 'ok', 'failed_hang', 'failed_hard'];
    for (const s of states) {
      expect(isApplyToCanvasDisabled(s)).toBe(previewShowsFailure(s));
    }
  });
});

describe('node-graph add disabled uses same failure predicate', () => {
  it('disables for failed_hang and failed_hard; not for loading or ok', () => {
    expect(isAddToNodeGraphDisabled('failed_hang')).toBe(true);
    expect(isAddToNodeGraphDisabled('failed_hard')).toBe(true);
    expect(isAddToNodeGraphDisabled('loading')).toBe(false);
    expect(isAddToNodeGraphDisabled('ok')).toBe(false);
  });

  it('matches isApplyToCanvasDisabled for every settle state', () => {
    const states: PreviewSettleState[] = ['loading', 'ok', 'failed_hang', 'failed_hard'];
    for (const s of states) {
      expect(isAddToNodeGraphDisabled(s)).toBe(isApplyToCanvasDisabled(s));
      expect(isAddToNodeGraphDisabled(s)).toBe(previewShowsFailure(s));
    }
  });
});
