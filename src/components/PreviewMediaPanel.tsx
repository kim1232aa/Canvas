import React from 'react';
import { Image as ImageIcon } from 'lucide-react';
import {
  PREVIEW_HANG_MS,
  isRemotePreviewUrl,
  isRealMediaSize,
} from '../utils/previewHang';

export type PreviewMediaPanelProps = {
  id: string;
  url: string | undefined | null;
  broken: boolean;
  onBroken: (id: string) => void;
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
 * near-black #111215 slab. After PREVIEW_HANG_MS, show the failure placeholder.
 * Real media (both sides >2) still shows; data: / same-origin keep existing path.
 */
export const PreviewMediaPanel: React.FC<PreviewMediaPanelProps> = ({
  id,
  url,
  broken,
  onBroken,
  kind,
  alt = '',
  mediaClassName = 'w-full h-full object-cover',
  videoProps,
  imgProps,
  failureTitle = '预览加载失败',
  failureHint = '链接失效或无法拉取，非未生成',
  waitingLabel = '预览加载中…',
}) => {
  const [loadedOk, setLoadedOk] = React.useState(false);
  const settledRef = React.useRef(false);
  const onBrokenRef = React.useRef(onBroken);
  onBrokenRef.current = onBroken;

  const remote = isRemotePreviewUrl(url);

  React.useEffect(() => {
    settledRef.current = broken;
    if (broken) setLoadedOk(false);
  }, [broken]);

  React.useEffect(() => {
    settledRef.current = false;
    setLoadedOk(false);
    if (!url || !remote || broken) return;
    const t = window.setTimeout(() => {
      if (!settledRef.current) onBrokenRef.current(id);
    }, PREVIEW_HANG_MS);
    return () => window.clearTimeout(t);
  }, [url, remote, broken, id]);

  const markFail = React.useCallback(() => {
    settledRef.current = true;
    onBrokenRef.current(id);
  }, [id]);

  const markOk = React.useCallback(() => {
    settledRef.current = true;
    setLoadedOk(true);
  }, []);

  if (broken || !url) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-400 px-3 text-center">
        <ImageIcon className="w-8 h-8 text-slate-600" />
        <span className="text-xs font-medium">{failureTitle}</span>
        <span className="text-[10px] text-slate-500">{failureHint}</span>
      </div>
    );
  }

  const showWaiting = remote && !loadedOk;

  return (
    <>
      {showWaiting && (
        <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-2 bg-[#111215] text-slate-400 px-3 text-center pointer-events-none">
          <ImageIcon className="w-8 h-8 text-slate-600" />
          <span className="text-xs font-medium">{waitingLabel}</span>
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
          className={`${mediaClassName}${showWaiting ? ' opacity-0' : ''}`}
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
          className={`${mediaClassName}${showWaiting ? ' opacity-0' : ''}`}
        />
      )}
    </>
  );
};
