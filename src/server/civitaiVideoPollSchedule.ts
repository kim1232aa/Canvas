/**
 * Civitai video poll schedule.
 * https://developer.civitai.com/orchestration/guide/results-and-webhooks.md
 * "poll GetWorkflow at 2 s, 5 s, 10 s, 15 s, then every 30 s, until status is terminal."
 * https://developer.civitai.com/orchestration/guide/getting-started.md
 * video jobs take several minutes; `wait` must stay under the HTTP client timeout
 * (100s is a common default) or the connection closes before an id is returned.
 */

export const CIVITAI_VIDEO_POLL_CADENCE_MS = [2000, 5000, 10000, 15000, 30000];
/** Local wait after submit. Separate from an upstream failure. */
export const CIVITAI_VIDEO_POLL_BUDGET_MS = 10 * 60 * 1000;
/**
 * Official `wait` query (seconds). Below the documented 100s client default
 * so a slow accept still returns the workflow id.
 */
export const CIVITAI_VIDEO_SUBMIT_WAIT_SECONDS = 60;
export const CIVITAI_VIDEO_SOCKET_TIMEOUT_MS = 10 * 60 * 1000;
export const CIVITAI_IMAGE_SOCKET_TIMEOUT_MS = 120_000;

/** The socket server.ts sets on /api/civitai/generate. Image stays at 120s. */
export function civitaiGenerateSocketMs(isVideo: boolean): number {
  return isVideo ? CIVITAI_VIDEO_SOCKET_TIMEOUT_MS : CIVITAI_IMAGE_SOCKET_TIMEOUT_MS;
}

export interface CivitaiPollStep { delayMs: number; attempt: number }

/** Delays that fit inside the local budget. The old loop stopped after 20×3s. */
export function civitaiVideoPollPlan(budgetMs: number, now = Date.now()): CivitaiPollStep[] {
  const steps: CivitaiPollStep[] = [];
  let spent = 0;
  for (let attempt = 0; spent < budgetMs; attempt++) {
    const delayMs = civitaiVideoPollDelayMs(attempt);
    if (spent + delayMs >= budgetMs) break;
    steps.push({ delayMs, attempt });
    spent += delayMs;
  }
  void now;
  return steps;
}

export function civitaiVideoPollDelayMs(attempt: number): number {
  const index = Math.min(Math.max(0, attempt), CIVITAI_VIDEO_POLL_CADENCE_MS.length - 1);
  return CIVITAI_VIDEO_POLL_CADENCE_MS[index];
}
