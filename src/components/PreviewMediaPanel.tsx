import React from 'react';
import { Image as ImageIcon } from 'lucide-react';
import {
  PREVIEW_HANG_MS,
  isRemotePreviewUrl,
  isRealMediaSize,
  reducePreviewSettle,
  previewShowsWaiting,
  previewShowsFailure,
  previewShowsMedia,
  previewKeepMediaMounted,
  type PreviewSettleState,
} from '../utils/previewHang';

export type PreviewMediaPanelProps = {
  id: string;
  url: string | undefined | null;
  broken: boolean;
  onBroken: (id: string) => void;
  /** Clear parent broken id when a late real load recovers after hang. */
  onRecovered?: (id: string) => void;
  kind: 'image' | 'video';
  alt?: string;
  /** Classes on the img/video element once shown. */
  mediaClassName?: string;
  /** Extra video element props (autoPlay, controls, hover handlers, etc.). */
  videoProps?: Omit<
    React.VideoHTMLAttributes<HTMLVideoElement>,
    'src' | 'onError' | 'onLoadedMetadata' | 'className'
  >;
  imgProps?: Omit<
    React.ImgHTMLAttributes<HTMLImageElement>,
    'src' | 'alt' | 'onError' | 'onLoad' | 'className' | 'referrerPolicy'
  >;
  /** Failure copy — keep existing product wording. */
  failureTitle?: string;
  failureHint?: string;
  /** Optional waiting label while remote preview has not settled. */
  waitingLabel?: string;
};

/**
 * History / asset gallery thumb: remote http(s) that never load must not sit as a
 * near-black #111215 slab. After PREVIEW_HANG_MS, show the failure placeholder
 * locally while keeping media mounted (hidden) so a late real load can still appear.
 * Hard fail (onError / ≤2px) stays failed. data: / same-origin keep existing path.
 */
export const PreviewMediaPanel: React.FC<PreviewMediaPanelProps> = ({
  id,
  url,
  broken: _broken,
  onBroken,
  onRecovered,
  kind,
  alt = '',
  mediaClassName = 'w-full h-full object-cover',
  videoProps,
  imgProps,
  failureTitle = '预览加载失败',
  failureHint = '链接失效或无法拉取，非未生成',
  waitingLabel = '预览加载中…',
}) => {
  const [settle, setSettle] = React.useState<PreviewSettleState>('loading');
  const settleRef = React.useRef<PreviewSettleState>('loading');
  const onBrokenRef = React.useRef(onBroken);
  const onRecoveredRef = React.useRef(onRecovered);
  onBrokenRef.current = onBroken;
  onRecoveredRef.current = onRecovered;

  const remote = isRemotePreviewUrl(url);
  const hasUrl = !!url;

  const apply = React.useCallback((event: Parameters<typeof reducePreviewSettle>[1]) => {
    const prev = settleRef.current;
    const next = reducePreviewSettle(prev, event);
    settleRef.current = next;
    setSettle(next);
    if (next === 'failed_hang' || next === 'failed_hard') {
      if (prev !== next) onBrokenRef.current(id);
    }
    if (next === 'ok' && prev === 'failed_hang') {
      onRecoveredRef.current?.(id);
    }
  }, [id]);

  React.useEffect(() => {
    settleRef.current = 'loading';
    setSettle('loading');
    if (!url || !remote) return;
    const t = window.setTimeout(() => {
      // Mirror shouldGiveUpOnPreviewHang: only give up while still loading.
      apply({ type: 'hang_timeout' });
    }, PREVIEW_HANG_MS);
    return () => window.clearTimeout(t);
  }, [url, remote, id, apply]);

  const markFail = React.useCallback(() => {
    apply({ type: 'hard_fail' });
  }, [apply]);

  const markOk = React.useCallback(() => {
    apply({ type: 'real_media' });
  }, [apply]);

  if (!hasUrl) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-400 px-3 text-center">
        <ImageIcon className="w-8 h-8 text-slate-600" />
        <span className="text-xs font-medium">{failureTitle}</span>
        <span className="text-[10px] text-slate-500">{failureHint}</span>
      </div>
    );
  }

  const showWaiting = previewShowsWaiting(settle, remote);
  const showFailure = previewShowsFailure(settle);
  const showMedia = previewShowsMedia(settle);
  const keepMounted = previewKeepMediaMounted(settle, hasUrl);
  // Remote: hide until ok (waiting/hang overlay). data:/same-origin: keep today's visible path.
  const mediaHidden = remote && !showMedia;

  // Hard-fail only: unmount media (terminal). Hang keeps media mounted & hidden.
  if (!keepMounted) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-400 px-3 text-center">
        <ImageIcon className="w-8 h-8 text-slate-600" />
        <span className="text-xs font-medium">{failureTitle}</span>
        <span className="text-[10px] text-slate-500">{failureHint}</span>
      </div>
    );
  }

  return (
    <>
      {showWaiting && (
        <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-2 bg-[#111215] text-slate-400 px-3 text-center pointer-events-none">
          <ImageIcon className="w-8 h-8 text-slate-600" />
          <span className="text-xs font-medium">{waitingLabel}</span>
        </div>
      )}
      {showFailure && (
        <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-2 bg-[#111215] text-slate-400 px-3 text-center pointer-events-none">
          <ImageIcon className="w-8 h-8 text-slate-600" />
          <span className="text-xs font-medium">{failureTitle}</span>
          <span className="text-[10px] text-slate-500">{failureHint}</span>
        </div>
      )}
      {kind === 'video' ? (
        <video
          src={url}
          playsInline
          {...videoProps}
          onError={markFail}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (!isRealMediaSize(v.videoWidth, v.videoHeight)) markFail();
            else markOk();
          }}
          className={`${mediaClassName}${mediaHidden ? ' opacity-0' : ''}`}
        />
      ) : (
        <img
          src={url}
          alt={alt}
          referrerPolicy="no-referrer"
          {...imgProps}
          onError={markFail}
          onLoad={(e) => {
            const img = e.currentTarget;
            if (!isRealMediaSize(img.naturalWidth, img.naturalHeight)) markFail();
            else markOk();
          }}
          className={`${mediaClassName}${mediaHidden ? ' opacity-0' : ''}`}
        />
      )}
    </>
  );
};
