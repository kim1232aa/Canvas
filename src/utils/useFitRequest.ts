import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Request a Fit View that runs AFTER the next commit, using the latest render's fit closure.
 * Replaces `setTimeout(handleResetView, 180)`, which captured the closure of the render that queued it —
 * i.e. the PREVIOUS board's nodes — so a preset load/replace fitted the old node set (zoom left at 100%,
 * new AI 视频 node under the bottom dock). Two rAFs let the new nodes lay out before measuring.
 */
export function useFitRequest(fit: () => void): () => void {
  const [request, setRequest] = useState(0);
  const fitRef = useRef(fit);
  fitRef.current = fit;
  useEffect(() => {
    if (!request) return;
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => fitRef.current()); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [request]);
  return useCallback(() => setRequest((n) => n + 1), []);
}
