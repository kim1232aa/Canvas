import type { GenerationHistoryItem } from '../types/providers';
import { hasOutputMedia } from './historyParameters';

/** History holds only records that produced an image/video (雁 2026-11-04); failures live on the node and run log. */
export function isServedHistoryItem(item: GenerationHistoryItem): boolean {
  return hasOutputMedia(item);
}

/** Count over the WHOLE served history (sent with every /api/history page), so the header never shrinks as page 1 rolls. */
export type HistoryCounts = { output: number };
export function historyCounts(history: GenerationHistoryItem[]): HistoryCounts {
  return { output: history.filter(isServedHistoryItem).length };
}
