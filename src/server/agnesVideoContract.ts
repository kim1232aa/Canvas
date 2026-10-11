const AGNES_VIDEO_SIZES = ['720P', '1080P', '1K', '2K'] as const;

export function agnesVideoSize(value: unknown, model?: string): string {
  const size = String(value);
  if (model === 'agnes-video-2.5-flash') {
    if (size !== '720P') {
      throw new Error(`Agnes Video 2.5 Flash size 仅支持 720P（size must be 720P），收到 "${size}"`);
    }
    return size;
  }
  if (!(AGNES_VIDEO_SIZES as readonly string[]).includes(size)) {
    throw new Error(`Agnes Video size 只接受 ${AGNES_VIDEO_SIZES.join(' / ')}，收到 "${size}"`);
  }
  return size;
}
