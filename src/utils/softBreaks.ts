/**
 * fix10: display-only soft break points for long model IDs in a <textarea> (no <wbr> possible there).
 * A U+200B (zero-width space) is inserted AFTER every '/' and '-' so the line breaks after them
 * (the '/' or '-' stays at the end of the line). These characters exist only in the displayed value:
 * every read path (onChange, Enter, blur, copy/cut) strips them, so the stored/submitted value is never changed.
 */
export const SOFT_BREAK = '\u200B';
const SOFT_RE = /\u200B/g;
export const stripSoftBreaks = (s: string): string => String(s ?? '').replace(SOFT_RE, '');
export const withSoftBreaks = (s: string): string => stripSoftBreaks(s).replace(/([/-])/g, `$1${SOFT_BREAK}`);
/** Caret index ignoring soft breaks. */
export const logicalCaret = (display: string, caret: number): number => stripSoftBreaks(display.slice(0, caret)).length;
/** Map a logical caret back into the re-rendered display string. */
export const displayCaret = (display: string, logical: number): number => {
  let n = 0;
  for (let i = 0; i < display.length; i++) {
    if (n === logical) return display[i] === SOFT_BREAK ? i + 1 : i;
    if (display[i] !== SOFT_BREAK) n++;
  }
  return display.length;
};
export function copyWithoutSoftBreaks(e: { currentTarget: HTMLTextAreaElement; clipboardData: DataTransfer | null; preventDefault(): void; type: string }): void {
  const el = e.currentTarget; const a = el.selectionStart ?? 0; const b = el.selectionEnd ?? 0;
  if (!e.clipboardData || a === b) return;
  const sel = el.value.slice(a, b);
  if (!sel.includes(SOFT_BREAK)) return;
  e.preventDefault();
  e.clipboardData.setData('text/plain', stripSoftBreaks(sel));
  if (e.type === 'cut') { el.setRangeText('', a, b, 'start'); el.dispatchEvent(new Event('input', { bubbles: true })); }
}
