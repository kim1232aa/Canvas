/**
 * Key rotation visibility (generic, all providers that rotate comma-separated keys).
 * Only the position of the key in its rotation list and the list size are recorded — never key text or a mask of it.
 */
export interface KeyUsage {
  provider: string;
  /** 0-based position of the key used in its rotation list. */
  index: number;
  /** Number of keys in that rotation list. */
  count: number;
  /** pool = server settings/env pool; header = keys sent by the canvas in a request header. */
  source: 'pool' | 'header';
}

/** Locate `key` in the ordered rotation list. Returns null when the key is not part of that list (never guesses). */
export function describeKeySelection(provider: string, key: string, keys: readonly string[], source: KeyUsage['source']): KeyUsage | null {
  if (!key || !keys.length) return null;
  const index = keys.indexOf(key);
  if (index < 0) return null;
  return { provider, index, count: keys.length, source };
}

/** 「Key #0（共 2 个）」; header-supplied keys are marked so they are not mistaken for the server pool. */
export function formatKeyUsage(u: Pick<KeyUsage, 'index' | 'count'> & { source?: string } | null | undefined): string | null {
  if (!u || !Number.isInteger(u.index) || !Number.isInteger(u.count) || u.count < 1) return null;
  return `Key #${u.index}（共 ${u.count} 个${u.source === 'header' ? '，请求头提供' : ''}）`;
}

/** Distinct key usages from an execution trace (order of first use). */
export function keyUsagesFromTrace(traces: unknown): KeyUsage[] {
  if (!Array.isArray(traces)) return [];
  const out: KeyUsage[] = [];
  for (const t of traces) {
    const u = t && typeof t === 'object' ? (t as any).keyUsage : null;
    if (!u || typeof u.index !== 'number' || typeof u.count !== 'number') continue;
    if (!out.some((o) => o.provider === u.provider && o.index === u.index && o.count === u.count && o.source === u.source)) out.push(u);
  }
  return out;
}
