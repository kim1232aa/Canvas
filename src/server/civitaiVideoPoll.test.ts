import { describe, expect, it, vi } from 'vitest';
import { classifyCivitaiVideoPoll, runCivitaiVideoPoll } from './civitaiVideoPoll';
import { CIVITAI_VIDEO_POLL_BUDGET_MS, CIVITAI_VIDEO_SOCKET_TIMEOUT_MS, civitaiGenerateSocketMs } from './civitaiVideoPollSchedule';
import { latestVideoJobStatus, resetVideoJobStatusForTests } from './videoJobStatus';

describe('Civitai video workflow poll terminal output handling', () => {
  it('stops on succeeded without an output and preserves status, response, endpoint and workflow ID', () => {
    const rawResponse = { id: 'wf-123', status: 'succeeded', steps: [{ output: {} }] };
    const result = classifyCivitaiVideoPoll(
      rawResponse,
      '',
      200,
      'https://orchestration.civitai.com/v2/consumer/workflows/wf-123',
      'wf-123',
    );

    expect(result).toEqual({
      kind: 'succeeded-without-output',
      httpStatus: 502,
      response: {
        error: 'Civitai 视频工作流状态为 succeeded，但响应中没有可识别的视频输出 URL。',
        errorSource: 'upstream-protocol',
        upstreamStatus: 200,
        endpoint: 'https://orchestration.civitai.com/v2/consumer/workflows/wf-123',
        rawResponse,
        workflowId: 'wf-123',
      },
    });
  });

  it('uses a recognized output URL when status is succeeded', () => {
    expect(classifyCivitaiVideoPoll({ status: 'succeeded' }, 'https://x/video.mp4', 200, 'https://x/wf', 'wf'))
      .toEqual({ kind: 'output', url: 'https://x/video.mp4' });
  });

  it('keeps polling for nonterminal statuses without output', () => {
    expect(classifyCivitaiVideoPoll({ status: 'processing' }, '', 200, 'https://x/wf', 'wf'))
      .toEqual({ kind: 'pending' });
  });

  it('preserves terminal failure details and upstream status even if an output is present', () => {
    const body = { status: 'failed', reason: 'fixture failure' };
    expect(classifyCivitaiVideoPoll(body, 'https://example.test/video', 200, 'https://example.test/workflow', 'wf')).toMatchObject({
      kind: 'failed', httpStatus: 500,
      response: { errorSource: 'upstream-task', upstreamStatus: 200, rawResponse: body, endpoint: 'https://example.test/workflow' },
    });
  });
});

describe('Civitai video poll loop (the loop server.ts runs)', () => {
  const endpoint = 'https://orchestration.civitai.com/v2/consumer/workflows/wf-1';

  it('keeps polling past the old 60 second window and then returns the video', async () => {
    vi.useFakeTimers();
    resetVideoJobStatusForTests();
    let polls = 0;
    const done = runCivitaiVideoPoll({
      workflowId: 'wf-1',
      endpoint,
      extractUrl: (data) => String((data as { url?: string }).url || ''),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      fetchStatus: async () => {
        polls += 1;
        return polls < 8
          ? { data: { status: 'processing' }, httpStatus: 200 }
          : { data: { status: 'succeeded', url: 'https://blobs.test/video.mp4' }, httpStatus: 200 };
      },
    });
    await vi.advanceTimersByTimeAsync(160_000);
    const result = await done;
    expect(result.outcome).toEqual({ kind: 'output', url: 'https://blobs.test/video.mp4' });
    expect(result.polls).toBeGreaterThanOrEqual(8);
    expect(latestVideoJobStatus('civitai')).toBeUndefined();
    vi.useRealTimers();
  });

  it('returns a local 504 once the 10 minute budget is spent, with the workflow id and endpoint', async () => {
    vi.useFakeTimers();
    resetVideoJobStatusForTests();
    const done = runCivitaiVideoPoll({
      workflowId: 'wf-1',
      endpoint,
      budgetMs: CIVITAI_VIDEO_POLL_BUDGET_MS,
      extractUrl: () => '',
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      fetchStatus: async () => ({ data: { status: 'scheduled' }, httpStatus: 200 }),
    });
    await vi.advanceTimersByTimeAsync(CIVITAI_VIDEO_POLL_BUDGET_MS);
    const result = await done;
    expect(result.timedOut).toBe(true);
    expect(result.outcome.kind).toBe('pending');
    expect(result.lastStatus).toBe('scheduled');
    // The route maps timedOut to 504 errorSource local and keeps these two fields.
    expect(result.polls).toBeGreaterThan(20);
    expect(latestVideoJobStatus('civitai')).toBeUndefined();
    vi.useRealTimers();
  });

  it('keeps the image request socket at 120 seconds while video uses 10 minutes', () => {
    expect(civitaiGenerateSocketMs(false)).toBe(120_000);
    expect(civitaiGenerateSocketMs(true)).toBe(CIVITAI_VIDEO_SOCKET_TIMEOUT_MS);
    expect(CIVITAI_VIDEO_SOCKET_TIMEOUT_MS).toBe(600_000);
  });
});
