/**
 * Video job status text and cancel, from pages fetched 2026-11-05.
 *
 * Cancel exists:
 * - Fal: PUT {cancel_url}. 200 OK / 202 CANCELLATION_REQUESTED / 400 ALREADY_COMPLETED.
 *   https://docs.fal.ai/model-endpoints/queue
 * - Replicate: POST /v1/predictions/{id}/cancel.
 *   https://replicate.com/docs/reference/http
 * - Civitai: PUT /v2/consumer/workflows/{workflowId} with body { "status": "canceled" }.
 *   UpdateWorkflowRequest.status is the enum ["canceled"].
 *   https://orchestration.civitai.com/openapi/v2-consumers.json (operation UpdateWorkflow)
 *   https://developer.civitai.com/orchestration/reference/operations/UpdateWorkflow
 * - Krea: DELETE /jobs/{job_id}. https://docs.krea.ai/developers/examples/text-to-video
 *   (poll section; the OpenAPI lists DELETE /jobs/{job_id}).
 * - Sogni: POST /v1/creative-agent/workflows/{id}/cancel.
 *   https://docs.sogni.ai/api-reference/workflows
 *
 * No cancel endpoint was found on the fetched pages for NanoGPT, WaveSpeed,
 * MuAPI, Novita, Together, AIMLAPI, or Venice. Those say so. They are not
 * reported as cancelled.
 */

export interface VideoCancelTarget {
  provider: string;
  /** Provider job id (Fal request_id, Replicate prediction id, Civitai workflow id, ...). */
  jobId: string;
  /** Fal returns this. Other providers build the URL from jobId. */
  cancelUrl?: string;
}

export interface VideoCancelPlan {
  method: 'PUT' | 'POST' | 'DELETE';
  url: string;
  body?: unknown;
}

const NO_CANCEL = new Set(['nanogpt', 'wavespeed', 'muapi', 'novita', 'together', 'aimlapi', 'venice']);

export function videoCancelPlan(target: VideoCancelTarget): VideoCancelPlan | { unsupported: string } {
  const provider = target.provider.toLowerCase();
  if (NO_CANCEL.has(provider)) {
    return { unsupported: `${provider} 官方文档没有视频任务取消接口。任务仍在上游运行，没有被取消。` };
  }
  if (provider === 'fal') {
    if (!target.cancelUrl) return { unsupported: 'Fal 提交响应没有 cancel_url，无法取消。' };
    return { method: 'PUT', url: target.cancelUrl };
  }
  if (provider === 'replicate') return { method: 'POST', url: `https://api.replicate.com/v1/predictions/${encodeURIComponent(target.jobId)}/cancel` };
  if (provider === 'civitai') return { method: 'PUT', url: `https://orchestration.civitai.com/v2/consumer/workflows/${encodeURIComponent(target.jobId)}`, body: { status: 'canceled' } };
  if (provider === 'krea') return { method: 'DELETE', url: `https://api.krea.ai/jobs/${encodeURIComponent(target.jobId)}` };
  if (provider === 'sogni') return { method: 'POST', url: `https://api.sogni.ai/v1/creative-agent/workflows/${encodeURIComponent(target.jobId)}/cancel` };
  return { unsupported: `${provider} 的视频取消接口未核实，没有发送取消请求。` };
}

/** One line for the node. Upstream words stay upstream; the clock is local. */
export function videoProgressLine(input: {
  phase: 'submitted' | 'queued' | 'running';
  upstreamStatus?: string;
  elapsedMs: number;
  budgetMs: number;
}): string {
  const phaseText = input.phase === 'submitted' ? '已提交' : input.phase === 'queued' ? '排队中' : '生成中';
  const upstream = input.upstreamStatus ? `上游状态 ${input.upstreamStatus}` : '上游状态未知';
  const used = Math.round(input.elapsedMs / 1000);
  const budget = Math.round(input.budgetMs / 1000);
  return `${phaseText}。${upstream}。本地已等待 ${used} 秒 / ${budget} 秒。`;
}
