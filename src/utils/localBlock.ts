/**
 * clean-1333: one source for local-block wording, so the toast, the node and the execution log say the same thing as the
 * request log.
 *  - Zero requests (decided on the canvas, before any fetch): 「本地拦截 · 未发请求」.
 *  - Decided by the backend submit route after it read (or reused) the model Schema: 「本地拦截 · 已读 Schema、未发生成」,
 *    plus whether this run issued the Schema GET or reused an earlier read. Never 「未发请求」 / 「没有请求离开本机」 there.
 * clean-1358: size pairing is Schema-driven (pair vs single-side); reveal pans the full cause node into the usable box.
 */
import { formatRecordTime } from '../services/executionTrace';

export const LOCAL_BLOCK_ZERO_TITLE = '本地拦截 · 未发请求';
export const LOCAL_BLOCK_SCHEMA_TITLE = '本地拦截 · 已读 Schema、未发生成';
export const LOCAL_BLOCK_SCHEMA_FAILED_TITLE = '本地拦截 · Schema 读取失败、未发生成';

export type SchemaReadInfo = { fetched?: boolean; reused?: boolean; failed?: boolean; readAt?: string; reusedFrom?: string };

/** The backend echoes `schemaRead` on every submit response/error; a GET trace row also means a Schema read happened. */
export function schemaReadOf(data: any): SchemaReadInfo | null {
  if (!data || typeof data !== 'object') return null;
  if (data.schemaRead && typeof data.schemaRead === 'object') return data.schemaRead;
  const traces = Array.isArray(data.executionTrace) ? data.executionTrace : [];
  const gets = traces.filter((t: any) => t && String(t.method || '').toUpperCase() === 'GET');
  return gets.length ? { fetched: true, failed: gets.some((t: any) => t.status === null || t.status >= 400) } : null;
}

export function localBlockTitle(data: any): string {
  if (data && data.localOnly === true) return LOCAL_BLOCK_ZERO_TITLE;
  const r = schemaReadOf(data);
  return !r ? LOCAL_BLOCK_ZERO_TITLE : r.failed ? LOCAL_BLOCK_SCHEMA_FAILED_TITLE : LOCAL_BLOCK_SCHEMA_TITLE;
}

/** Second line: what was actually requested for this block. */
export function schemaReadLine(data: any): string {
  if (data && data.localOnly === true) return '本次 0 个请求（画布本地判断，未读 Schema）';
  const r = schemaReadOf(data);
  if (!r) return '本次 0 个请求';
  const at = r.readAt ? formatRecordTime(r.readAt).split(' ')[1] : '';
  if (r.failed) return `Schema：本次 GET 1 次${at ? `（${at}）` : ''}，读取失败；生成请求 0 个`;
  if (r.reused) return `Schema：复用 ${at} 读到的结果，未重新请求；生成请求 0 个`;
  return `Schema：本次 GET 1 次${at ? `（${at}）` : ''}；生成请求 0 个`;
}

/**
 * clean-1358 #5: how the official Schema treats canvas width/height.
 *  - pair: size "W*H" string, image_size {width,height}, or both width+height properties → mismatch blocks, zero request.
 *  - single-width / single-height: only that side is in the Schema → empty other side is omitted, never blocks.
 *  - none: Schema has neither → nothing to send, never blocks on Empty Latent mismatch.
 *  - unknown: Schema not loaded yet → treat Empty Latent as a pair (local-decidable).
 */
export type SizePairing = 'pair' | 'single-width' | 'single-height' | 'none' | 'unknown';

/** Same rule as server sizeStringSeparator — kept here so the client never imports the server module. */
export function sizeStringSeparator(spec: any): string | null {
  const vs = [spec, ...(spec?.anyOf || []), ...(spec?.oneOf || [])].filter(Boolean);
  for (const v of vs) {
    if (v?.type !== 'string' || Array.isArray(v.enum)) continue;
    const m = typeof v.default === 'string' ? /^\d+([*x×:,])\d+$/i.exec(v.default) : null;
    if (m) return m[1];
  }
  return null;
}

function sizeObjectSchema(s: any): boolean {
  return [s, ...(s?.anyOf || []), ...(s?.oneOf || [])].some((x: any) => x?.type === 'object' && x?.properties?.width && x?.properties?.height);
}

export function sizePairingFromSchemaProps(props: Record<string, any> | null | undefined): SizePairing {
  if (!props || typeof props !== 'object') return 'unknown';
  const hasW = Object.prototype.hasOwnProperty.call(props, 'width');
  const hasH = Object.prototype.hasOwnProperty.call(props, 'height');
  if (sizeStringSeparator(props.size) !== null) return 'pair';
  if (sizeObjectSchema(props.image_size) && !hasW && !hasH) return 'pair';
  if (hasW && hasH) return 'pair';
  if (hasW && !hasH) return 'single-width';
  if (hasH && !hasW) return 'single-height';
  return 'none';
}

/** Width/height both filled, or both empty → null. Exactly one filled → local block when pairing is pair/unknown. */
export function widthHeightMismatch(width: unknown, height: unknown, pairing: SizePairing = 'unknown'): string | null {
  if (pairing === 'single-width' || pairing === 'single-height' || pairing === 'none') return null;
  const filled = (v: unknown) => v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v));
  const w = filled(width), h = filled(height);
  if (w === h) return null;
  return w
    ? `宽高不齐，未发 size：Empty Latent 只填了宽度（${Number(width)}），高度为空。不会补值，也不会只发宽度；请把高度填上，或把宽高都清空。`
    : `宽高不齐，未发 size：Empty Latent 只填了高度（${Number(height)}），宽度为空。不会补值，也不会只发高度；请把宽度填上，或把宽高都清空。`;
}

/** Number or undefined — an empty / non-numeric field is never turned into 0 or a default. */
export function sizeOrUndef(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

const SIZE_FIELDS = new Set(['size', 'width', 'height', 'image_size', 'width+height']);
/**
 * The node(s) that caused a local block (only they get the specific reason; other branch nodes get no red box).
 * loras → LoRA loaders in the branch; size fields → the Empty Latent; anything else → [] (the run target shows it).
 */
export function localBlockCauseNodeIds(nodes: Array<{ id: string; type: string; bypassed?: boolean }>, branchIds: Set<string>, field: string | undefined | null): string[] {
  if (!field) return [];
  const f = String(field);
  const pick = (type: string) => nodes.filter((n) => branchIds.has(n.id) && !n.bypassed && n.type === type).map((n) => n.id);
  if (f === 'loras' || f.startsWith('lora')) return pick('LoRALoader');
  if (SIZE_FIELDS.has(f)) return pick('EmptyLatentImage');
  return [];
}

/**
 * Viewport-only pan (zoom unchanged, node not moved) so the FULL node rect sits inside the usable box
 * (below top chrome/toast, above bottom dock, clear of left/right chrome, with a small pad for the red ring).
 * Returns null when already visible.
 * clean-1358 #4: must actually bring an off-screen cause node on-screen (previous version only nudged the top edge).
 * clean-1613 #2: left/right insets (exec panel / minimap) count; pan only after the exec-log row is written.
 */
export function revealNodeTransform(
  rect: { x: number; y: number; w: number; h: number },
  t: { x: number; y: number; scale: number },
  viewport: { width: number; height: number },
  insets: { top: number; bottom: number; left?: number; right?: number },
): { x: number; y: number; scale: number } | null {
  const pad = 12;
  const usableTop = insets.top;
  const usableBottom = viewport.height - insets.bottom;
  const usableLeft = Math.max(pad, insets.left ?? pad);
  const usableRight = viewport.width - Math.max(pad, insets.right ?? pad);
  const left = rect.x * t.scale + t.x;
  const top = rect.y * t.scale + t.y;
  const right = (rect.x + rect.w) * t.scale + t.x;
  const bottom = (rect.y + rect.h) * t.scale + t.y;
  let dy = 0, dx = 0;
  const nodeH = bottom - top;
  const usableH = usableBottom - usableTop;
  if (nodeH >= usableH) {
    // Taller than the usable box: pin the top under the toast/chrome so the title + block text stay readable.
    dy = usableTop - top;
  } else {
    if (top < usableTop) dy = usableTop - top;
    else if (bottom > usableBottom) dy = usableBottom - bottom;
  }
  const nodeW = right - left;
  const usableW = usableRight - usableLeft;
  if (nodeW >= usableW) {
    dx = usableLeft - left;
  } else {
    if (left < usableLeft) dx = usableLeft - left;
    else if (right > usableRight) dx = usableRight - right;
  }
  if (!dx && !dy) return null;
  return { x: t.x + dx, y: t.y + dy, scale: t.scale };
}

/** True when a size-mismatch local block is no longer valid for the current width/height (+ pairing). */
export function sizeMismatchCleared(width: unknown, height: unknown, pairing: SizePairing = 'unknown'): boolean {
  return widthHeightMismatch(width, height, pairing) === null;
}
