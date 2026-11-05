import { videoProgressLine } from './videoJobControl.ts';

export interface VideoJobSnapshot {
  jobId: string;
  provider: string;
  text: string;
  cancelUrl?: string;
  nodeId?: string;
  updatedAt: number;
}

/** Internal record. The submit key stays here so cancel can reuse it. GET never returns it. */
interface StoredJob extends VideoJobSnapshot {
  startedAt: number;
  budgetMs: number;
  credential?: string;
}

/** A job nobody polls past its own budget plus this grace is dropped. */
const ABANDONED_GRACE_MS = 60_000;

const jobs = new Map<string, StoredJob>();

function dropExpired(now = Date.now()): void {
  for (const [jobId, job] of jobs) {
    if (now - job.startedAt >= job.budgetMs + ABANDONED_GRACE_MS) jobs.delete(jobId);
  }
}

export function canvasNodeId(body: unknown): string | undefined {
  const snapshot = (body as { workflowSnapshot?: { executingNodeId?: unknown } } | undefined)?.workflowSnapshot;
  const id = typeof snapshot?.executingNodeId === 'string' ? snapshot.executingNodeId.trim() : '';
  return id || undefined;
}

export function updateVideoJobStatus(input: {
  jobId: string;
  provider: string;
  phase: 'submitted' | 'queued' | 'running';
  upstreamStatus?: string;
  budgetMs: number;
  cancelUrl?: string;
  credential?: string;
  nodeId?: string;
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
    credential: input.credential ?? existing?.credential,
    nodeId: input.nodeId ?? existing?.nodeId,
    updatedAt: now,
    text: videoProgressLine({
      phase: input.phase,
      upstreamStatus: input.upstreamStatus,
      elapsedMs: now - startedAt,
      budgetMs: input.budgetMs,
    }),
  };
  jobs.set(input.jobId, snapshot);
  return publicView(snapshot);
}

function publicView(job: StoredJob): VideoJobSnapshot {
  const { startedAt: _startedAt, budgetMs: _budgetMs, credential: _credential, ...snapshot } = job;
  return snapshot;
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
    if (!newest || job.updatedAt >= newest.updatedAt) newest = job;
  }
  return newest ? publicView(newest) : undefined;
}

export function readVideoJobStatus(jobId: string, now = Date.now()): VideoJobSnapshot | undefined {
  dropExpired(now);
  const found = jobs.get(jobId);
  if (!found) return undefined;
  return publicView(found);
}

/** The submit key, for cancel only. Not part of the public snapshot. */
export function readVideoJobCredential(jobId: string): string | undefined {
  return jobs.get(jobId)?.credential;
}

export function readVideoJobByNode(nodeId: string, now = Date.now()): VideoJobSnapshot | undefined {
  dropExpired(now);
  let newest: StoredJob | undefined;
  for (const job of jobs.values()) {
    if (job.nodeId !== nodeId) continue;
    if (!newest || job.updatedAt >= newest.updatedAt) newest = job;
  }
  return newest ? publicView(newest) : undefined;
}

/** Test-only. Production entries leave through clearVideoJobStatus or the TTL. */
export function resetVideoJobStatusForTests(): void {
  jobs.clear();
}
