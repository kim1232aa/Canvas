/**
 * Top-level history fields filled from the request actually sent (requestMetadata.actualParameters /
 * actualRequest / last submission), never invented. Generic: numeric width/height, or a "WxH" size string
 * (ModelScope `size: "832x1216"`), plus seed/steps/cfg under their common wire names.
 */
const rec = (v: unknown): Record<string, any> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as any) : undefined);
export function sentRequestParameters(meta: unknown): Record<string, any> | undefined {
  const m = rec(meta); if (!m) return undefined;
  const subs = Array.isArray(m.submissions) ? m.submissions : [];
  const last = rec(subs[subs.length - 1]);
  const raw = rec(m.actualParameters) ?? rec(rec(m.actualRequest)?.parameters) ?? rec(m.actualRequest) ?? rec(last?.parameters);
  if (!raw) return undefined;
  return rec(raw.input) ?? raw;
}
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
export function sentHistoryNumbers(meta: unknown): { width?: number; height?: number; seed?: number; steps?: number; cfg?: number } {
  const p = sentRequestParameters(meta); if (!p) return {};
  let width = num(p.width), height = num(p.height);
  const sz = rec(p.image_size) ?? (typeof p.size === 'string' ? p.size : typeof p.image_size === 'string' ? p.image_size : undefined);
  if ((width === undefined || height === undefined) && sz) {
    if (typeof sz === 'string') { const m = /^\s*(\d+)\s*[x×*]\s*(\d+)\s*$/i.exec(sz); if (m) { width = Number(m[1]); height = Number(m[2]); } }
    else { width = num(sz.width); height = num(sz.height); }
  }
  const first = (...k: string[]) => k.map((x) => num(p[x])).find((v) => v !== undefined);
  return { width, height, seed: first('seed'), steps: first('steps', 'num_inference_steps'), cfg: first('cfg', 'cfg_scale', 'guidance', 'guidance_scale') };
}
