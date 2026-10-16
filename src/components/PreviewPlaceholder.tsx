import React from 'react';
import { createPortal } from 'react-dom';

const COMPACT_H = 52;
const GAP = 8;
/** Above bottom dock (z-40), below History/settings modals (z-50). */
export const PREVIEW_FLOAT_Z = 42;

export type PreviewFloatBox = { left: number; top: number; right: number; bottom: number; width: number; height: number };

/**
 * fix11.2: place the occlusion float so it stays readable above the dock, does not cover
 * node labels like 「画面比例」 (usually above the preview), and stays under modal overlays.
 * - Enough visible strip inside the preview → pin to the top of that strip (inside preview).
 * - Strip too short → park beside the preview, still above the dock.
 */
export function computePreviewFloatPosition(
  preview: PreviewFloatBox,
  occluderTop: number,
  viewport: { width: number; height: number },
): { top: number; left: number; width: number; mode: 'inside' | 'side' | 'above' } {
  const visibleBottom = Math.min(preview.bottom, occluderTop) - GAP;
  const visibleTop = preview.top + 4;
  const visibleH = visibleBottom - visibleTop;
  let width = Math.min(Math.max(preview.width, 160), Math.max(120, viewport.width - 16));
  let top: number;
  let left: number;
  let mode: 'inside' | 'side' | 'above';

  if (visibleH >= COMPACT_H) {
    mode = 'inside';
    top = visibleTop;
    left = Math.max(GAP, Math.min(preview.left, viewport.width - width - GAP));
  } else {
    top = Math.max(GAP, occluderTop - COMPACT_H - GAP);
    width = Math.min(200, Math.max(120, viewport.width - 16));
    if (preview.right + GAP + width <= viewport.width - GAP) {
      mode = 'side';
      left = preview.right + GAP;
    } else if (preview.left - GAP - width >= GAP) {
      mode = 'side';
      left = preview.left - GAP - width;
    } else {
      // Last resort: sit above the preview box (still above dock), not on the dock band.
      mode = 'above';
      left = Math.max(GAP, Math.min(preview.left, viewport.width - width - GAP));
      top = Math.max(GAP, Math.min(preview.top - COMPACT_H - GAP, occluderTop - COMPACT_H - GAP));
    }
  }
  // Never let the float bottom cross into the dock.
  if (top + COMPACT_H > occluderTop - 2) {
    top = Math.max(GAP, occluderTop - COMPACT_H - GAP);
  }
  return { top, left, width, mode };
}

/** True when a full-screen z-50 modal (History etc.) is open — float must not paint over it. */
export function isCanvasModalOpen(doc: ParentNode = typeof document !== 'undefined' ? document : (null as any)): boolean {
  if (!doc || typeof document === 'undefined') return false;
  return !!doc.querySelector('.fixed.inset-0.z-50');
}

/**
 * fix11 / fix11.1 / fix11.2: node preview placeholder text must stay readable when the bottom
 * floating chrome (tool dock / collapsed exec pill marked data-canvas-chrome="bottom") overlaps it.
 * In-tree z-index cannot escape the canvas transform stacking context, so when occluded we portal
 * a compact fixed copy (z-42) that stays above the dock, below modals, and off 「画面比例」.
 */
export function PreviewPlaceholder({
  children,
  className = 'text-center p-4 text-slate-500 self-start',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [float, setFloat] = React.useState<{ style: React.CSSProperties; text: string } | null>(null);

  React.useLayoutEffect(() => {
    if (typeof document === 'undefined') return;
    const update = () => {
      const el = ref.current;
      if (!el) return;
      if (isCanvasModalOpen()) {
        setFloat(null);
        return;
      }
      const a = el.getBoundingClientRect();
      if (a.width <= 0 || a.height <= 0) {
        setFloat(null);
        return;
      }
      // Only chrome that actually intersects the placeholder counts as an occluder.
      // (Collapsed exec-log is also tagged bottom even when parked under the top bar.)
      let occluderTop = Infinity;
      document.querySelectorAll('[data-canvas-chrome="bottom"]').forEach((c) => {
        const r = (c as HTMLElement).getBoundingClientRect();
        if (r.height <= 0 || r.width <= 0) return;
        const hits = a.bottom > r.top && a.top < r.bottom && a.right > r.left && a.left < r.right;
        if (hits) occluderTop = Math.min(occluderTop, r.top);
      });
      if (!Number.isFinite(occluderTop)) {
        setFloat(null);
        return;
      }
      const pos = computePreviewFloatPosition(
        { left: a.left, top: a.top, right: a.right, bottom: a.bottom, width: a.width, height: a.height },
        occluderTop,
        { width: window.innerWidth, height: window.innerHeight },
      );
      setFloat({
        text: (el.innerText || '').trim(),
        style: {
          position: 'fixed',
          left: pos.left,
          top: pos.top,
          width: pos.width,
          zIndex: PREVIEW_FLOAT_Z,
          pointerEvents: 'none',
        },
      });
    };
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (ro && ref.current) ro.observe(ref.current);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    const iv = window.setInterval(update, 150);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      window.clearInterval(iv);
    };
  }, []);

  return (
    <>
      <div
        ref={ref}
        className={className}
        data-testid="node-preview-placeholder"
        // Hide in-tree copy while the float is up so the dock-clipped text is not visible.
        style={float ? { opacity: 0 } : undefined}
        aria-hidden={float ? true : undefined}
      >
        {children}
      </div>
      {float &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            data-testid="node-preview-placeholder-float"
            data-float-z={PREVIEW_FLOAT_Z}
            className="rounded-md border border-slate-600 bg-[#121316]/95 px-2.5 py-1 text-center text-xs text-slate-300 shadow-lg whitespace-pre-wrap leading-snug"
            style={float.style}
            aria-hidden="true"
          >
            {float.text}
          </div>,
          document.body,
        )}
    </>
  );
}
