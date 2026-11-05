import { CIVITAI_VIDEO_POLL_BUDGET_MS, civitaiVideoPollPlan } from './civitaiVideoPollSchedule.ts';
import { clearVideoJobStatus, updateVideoJobStatus } from './videoJobStatus.ts';

export type CivitaiVideoPollOutcome =
  | { kind: 'pending' }
  | { kind: 'output'; url: string }
  | {
      kind: 'failed';
      httpStatus: 500;
      response: {
        error: string;
        errorSource: 'upstream-task';
        upstreamStatus: number;
        endpoint: string;
        rawResponse: unknown;
        workflowId: string;
      };
    }
  | {
      kind: 'succeeded-without-output';
      httpStatus: 502;
      response: {
        error: string;
        errorSource: 'upstream-protocol';
        upstreamStatus: number;
        endpoint: string;
        rawResponse: unknown;
        workflowId: string;
      };
    };

export function classifyCivitaiVideoPoll(
  data: any,
  outputUrl: string,
  upstreamStatus: number,
  endpoint: string,
  workflowId: string,
): CivitaiVideoPollOutcome {
  const status = String(data?.status || '').toLowerCase();
  if (['failed', 'expired', 'canceled'].includes(status)) {
    return {
      kind: 'failed',
      httpStatus: 500,
      response: {
        error: `Civitai 视频任务渲染失败 [状态: ${data?.status}]: ${data?.error || data?.reason || 'Job failed on Civitai cluster'}`,
        errorSource: 'upstream-task',
        upstreamStatus,
        endpoint,
        rawResponse: data,
        workflowId,
      },
    };
  }
  if (outputUrl) return { kind: 'output', url: outputUrl };
  if (status !== 'succeeded') return { kind: 'pending' };

  return {
    kind: 'succeeded-without-output',
    httpStatus: 502,
    response: {
      error: 'Civitai 视频工作流状态为 succeeded，但响应中没有可识别的视频输出 URL。',
      errorSource: 'upstream-protocol',
      upstreamStatus,
      endpoint,
      rawResponse: data,
      workflowId,
    },
  };
}

export interface CivitaiVideoPollDeps {
  workflowId: string;
  endpoint: string;
  budgetMs?: number;
  credential?: string;
  nodeId?: string;
  /** Returns the parsed workflow body and the HTTP status of that poll. */
  fetchStatus: () => Promise<{ data: unknown; httpStatus: number }>;
  extractUrl: (data: unknown) => string;
  sleep: (ms: number) => Promise<void>;
  /** False once the client has gone away; the loop stops without another poll. */
  stillWaiting?: () => boolean;
}

export interface CivitaiVideoPollLoopResult {
  outcome: CivitaiVideoPollOutcome;
  polls: number;
  timedOut: boolean;
  lastStatus: string;
  lastResponse: unknown;
}

/**
 * The video poll server.ts runs after a submit that did not already contain a
 * video URL. Each poll is classified by classifyCivitaiVideoPoll. The local
 * budget running out is a timeout, not an upstream failure.
 */
export async function runCivitaiVideoPoll(deps: CivitaiVideoPollDeps): Promise<CivitaiVideoPollLoopResult> {
  const budgetMs = deps.budgetMs ?? CIVITAI_VIDEO_POLL_BUDGET_MS;
  const note = (upstreamStatus: string) => updateVideoJobStatus({
    jobId: deps.workflowId,
    provider: 'civitai',
    phase: 'running',
    upstreamStatus,
    budgetMs,
    credential: deps.credential,
    nodeId: deps.nodeId,
  });
  note('');
  let polls = 0;
  let lastStatus = '';
  let lastResponse: unknown;
  try {
    for (const step of civitaiVideoPollPlan(budgetMs)) {
      await deps.sleep(step.delayMs);
      if (deps.stillWaiting && !deps.stillWaiting()) {
        return { outcome: { kind: 'pending' }, polls, timedOut: false, lastStatus, lastResponse };
      }
      const { data, httpStatus } = await deps.fetchStatus();
      polls += 1;
      lastResponse = data;
      lastStatus = String((data as { status?: unknown })?.status || '');
      note(lastStatus);
      const outcome = classifyCivitaiVideoPoll(data, deps.extractUrl(data), httpStatus, deps.endpoint, deps.workflowId);
      if (outcome.kind !== 'pending') {
        return { outcome, polls, timedOut: false, lastStatus, lastResponse };
      }
    }
    return { outcome: { kind: 'pending' }, polls, timedOut: true, lastStatus, lastResponse };
  } finally {
    clearVideoJobStatus(deps.workflowId);
  }
}
