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
