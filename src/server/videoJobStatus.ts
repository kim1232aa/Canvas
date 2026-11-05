import { videoProgressLine } from './videoJobControl.ts';

export interface VideoJobSnapshot {
  jobId: string;
  provider: string;
  text: string;
  cancelUrl?: string;
  updatedAt: number;
}

const jobs = new Map<string, VideoJobSnapshot & { startedAt: number; budgetMs: number }>();

export function updateVideoJobStatus(input: {
  jobId: string;
  provider: string;
  phase: 'submitted' | 'queued' | 'running';
  upstreamStatus?: string;
  budgetMs: number;
  cancelUrl?: string;
}): VideoJobSnapshot {
  const existing = jobs.get(input.jobId);
  const startedAt = existing?.startedAt ?? Date.now();
  const snapshot = {
    jobId: input.jobId,
    provider: input.provider,
    startedAt,
    budgetMs: input.budgetMs,
    cancelUrl: input.cancelUrl ?? existing?.cancelUrl,
    updatedAt: Date.now(),
    text: videoProgressLine({
      phase: input.phase,
      upstreamStatus: input.upstreamStatus,
      elapsedMs: Date.now() - startedAt,
      budgetMs: input.budgetMs,
    }),
  };
  jobs.set(input.jobId, snapshot);
  return snapshot;
}

export function latestVideoJobStatus(provider: string): VideoJobSnapshot | undefined {
  let newest: VideoJobSnapshot & { startedAt: number; budgetMs: number } | undefined;
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
