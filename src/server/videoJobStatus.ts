import { videoProgressLine } from './videoJobControl.ts';

export interface VideoJobSnapshot {
  jobId: string;
  provider: string;
  text: string;
  cancelUrl?: string;
  updatedAt: number;
}

/** A job nobody polls past its own budget plus this grace is dropped. */
const ABANDONED_GRACE_MS = 60_000;

interface StoredJob extends VideoJobSnapshot {
  startedAt: number;
  budgetMs: number;
}

const jobs = new Map<string, StoredJob>();

function dropExpired(now = Date.now()): void {
  for (const [jobId, job] of jobs) {
    if (now - job.startedAt >= job.budgetMs + ABANDONED_GRACE_MS) jobs.delete(jobId);
  }
}

export function updateVideoJobStatus(input: {
  jobId: string;
  provider: string;
  phase: 'submitted' | 'queued' | 'running';
  upstreamStatus?: string;
  budgetMs: number;
  cancelUrl?: string;
  now?: number;
}): VideoJobSnapshot {
  const now = input.now ?? Date.now();
  dropExpired(now);
  const existing = jobs.get(input.jobId);
  const startedAt = existing?.startedAt ?? now;
  const snapshot: StoredJob = {
    jobId: input.jobId,
    provider: input.provider,
    startedAt,
    budgetMs: input.budgetMs,
    cancelUrl: input.cancelUrl ?? existing?.cancelUrl,
    updatedAt: now,
    text: videoProgressLine({
      phase: input.phase,
      upstreamStatus: input.upstreamStatus,
      elapsedMs: now - startedAt,
      budgetMs: input.budgetMs,
    }),
  };
  jobs.set(input.jobId, snapshot);
  const { startedAt: _startedAt, budgetMs: _budgetMs, ...publicSnapshot } = snapshot;
  return publicSnapshot;
}

/** Success, upstream failure, or local-budget timeout: the job is no longer running. */
export function clearVideoJobStatus(jobId: string): void {
  jobs.delete(jobId);
}

export function latestVideoJobStatus(provider: string, now = Date.now()): VideoJobSnapshot | undefined {
  dropExpired(now);
  let newest: StoredJob | undefined;
  for (const job of jobs.values()) {
    if (job.provider !== provider) continue;
    if (!newest || job.updatedAt > newest.updatedAt) newest = job;
  }
  return newest ? readVideoJobStatus(newest.jobId) : undefined;
}

export function readVideoJobStatus(jobId: string): VideoJobSnapshot | undefined {
  const found = jobs.get(jobId);
  if (!found) return undefined;
  const { startedAt: _startedAt, budgetMs: _budgetMs, ...snapshot } = found;
  return snapshot;
}

/** Test-only. Production entries leave through clearVideoJobStatus or the TTL. */
export function resetVideoJobStatusForTests(): void {
  jobs.clear();
}
