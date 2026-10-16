import React from 'react';
/** Middle ellipsis that keeps the host and the last path segment; never cuts inside a word. Full URL stays in the tooltip. */
export function middleEllipsis(url: string, max = 56): string {
  const u = String(url ?? '');
  if (u.length <= max) return u;
  const parts = u.split('/');
  // Keep scheme+host at the front, last segment(s) at the back, at '/' boundaries.
  let head = parts.slice(0, 3).join('/'); let tailParts: string[] = [parts[parts.length - 1]];
  for (let i = parts.length - 2; i >= 3; i--) { const t = [parts[i], ...tailParts].join('/'); if (head.length + t.length + 3 > max) break; tailParts = [parts[i], ...tailParts]; }
  const tail = tailParts.join('/');
  if (parts.length <= 4 || head.length + tail.length + 5 >= u.length) return u;
  return `${head}/…/${tail}`;
}
/** URL text: middle-ellipsised, wraps only at '/' (zero-width break after each slash), full URL in title. */
export const UrlText: React.FC<{ url: string; max?: number; className?: string }> = ({ url, max, className }) => {
  const shown = middleEllipsis(url, max);
  return <span title={url} data-testid="url-text" className={`whitespace-normal [word-break:keep-all] [overflow-wrap:normal] ${className || ''}`}>
    {shown.split('/').map((seg, i, a) => <React.Fragment key={i}><span className="whitespace-nowrap">{seg}{i < a.length - 1 ? '/' : ''}</span>{i < a.length - 1 && <wbr />}</React.Fragment>)}
  </span>;
};
