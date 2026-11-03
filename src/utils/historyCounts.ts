import type { GenerationHistoryItem } from '../types/providers';
import { hasOutputMedia, isSchemaFetchFailure } from './historyParameters';

export type HistoryFilter = 'all' | 'output' | 'failed' | 'schema';
/**
 * Header counts by record kind (only items with real output media count as 出图).
 * hist-count-2026-10-17: a failed parameter-table / catalog GET (isSchemaFetchFailure) is not a generation request —
 * counted on its own as schemaFetch, never in failed (上游失败) / 未出图.
 */
export function historyHeaderCounts(history: GenerationHistoryItem[]): { output: number; failed: number; localBlocked: number; schemaFetch: number; nonOutput: number } {
  const generation = history.filter((i) => !isSchemaFetchFailure(i));
  const output = generation.filter(hasOutputMedia).length;
  return {
    output,
    failed: generation.filter((i) => i.status === 'failed').length,
    localBlocked: generation.filter((i) => i.status === 'local_blocked').length,
    schemaFetch: history.length - generation.length,
    nonOutput: generation.length - output,
  };
}

export function historyFilterCounts(history: GenerationHistoryItem[]): Record<HistoryFilter, number> {
  const schema = history.filter(isSchemaFetchFailure).length;
  const output = history.filter((i) => !isSchemaFetchFailure(i) && hasOutputMedia(i)).length;
  return { all: history.length, output, failed: history.length - schema - output, schema };
}

/** Counts over the WHOLE server history (sent with every /api/history page), so header/chips never shrink as page 1 rolls. */
export type HistoryCounts = { header: ReturnType<typeof historyHeaderCounts>; filters: Record<HistoryFilter, number> };
export function historyCounts(history: GenerationHistoryItem[]): HistoryCounts {
  return { header: historyHeaderCounts(history), filters: historyFilterCounts(history) };
}
