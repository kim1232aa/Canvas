/** Long LoRA path/URL: keep the head and the filename end (e.g. `…/krea2_darkbrush.safetensors`), ellipsis in the middle. */
export function middleEllipsis(value: string, max = 48): string {
  const s = String(value ?? '');
  if (s.length <= max) return s;
  const file = s.split(/[\\/]/).pop() || '';
  const tail = file.length && file.length < max - 8 ? file : s.slice(-Math.ceil((max - 1) / 2));
  const head = s.slice(0, Math.max(4, max - 1 - tail.length));
  return `${head}…${tail}`;
}
