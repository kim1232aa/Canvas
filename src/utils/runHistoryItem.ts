import type { GenerationHistoryItem } from '../types/providers';

const isRecord = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * The history entry this run's generation POST recorded: the server returns `historyItem` (id) in the response; the
 * full stored entry is looked up in the freshly fetched history. The success toast reads seed / actual request from it,
 * so toast and history card share one source of truth. Undefined when no recorded id matches (never guessed).
 */
export function findRunHistoryItem(responses: unknown[], history: GenerationHistoryItem[] | undefined): GenerationHistoryItem | undefined {
  if (!Array.isArray(history)) return undefined;
  for (const r of responses) {
    const id = isRecord(r) && isRecord(r.historyItem) ? r.historyItem.id : undefined;
    if (typeof id !== 'string' || !id) continue;
    const hit = history.find((h) => (h as any)?.id === id);
    if (hit) return hit;
  }
  return undefined;
}
