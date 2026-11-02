import { describe, expect, it } from 'vitest';
import { classifyCivitaiVideoPoll } from './civitaiVideoPoll';

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
