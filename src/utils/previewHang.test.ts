import { describe, it, expect } from 'vitest';
import {
  PREVIEW_HANG_MS,
  isRemotePreviewUrl,
  isRealMediaSize,
  shouldGiveUpOnPreviewHang,
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
