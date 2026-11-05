/**
 * Fal.ai official queue lifecycle for long-running (video) endpoints.
 *
 * Contract (https://fal.ai/docs / https://docs.fal.ai/model-endpoints/queue):
 * - POST https://queue.fal.run/{model_id}[/{subpath}]
 *     → 202 Accepted + { request_id, status_url, response_url, cancel_url }
 * - GET {status_url}  (= queue.fal.run/{owner}/{app}/requests/{request_id}/status)
 *     → 202 { status: 'IN_QUEUE' | 'IN_PROGRESS', ... } while pending
 *     → 200 { status: 'COMPLETED', response_url, ... } when done
 * - GET {response_url} (= queue.fal.run/{owner}/{app}/requests/{request_id})
 *     → HTTP status mirrors the model result (2xx success payload, 4XX invalid
 *       request, 5XX model error, 400 not completed, 404 unknown request).
 *
 * Status/result URLs are scoped to the app id (owner/app) only; a URL built
 * with the full endpoint path (e.g. fal-ai/flux/dev/requests/...) returns 405.
 *
 * This module never fabricates success: any non-2xx upstream answer, unknown
 * queue status, or timeout is returned verbatim (status + raw body + url).
 */

export interface FalQueueLifecycleOptions {
  /** Full endpoint id, e.g. "fal-ai/veo3" or "fal-ai/flux/dev". */
  endpoint: string;
  apiKey: string;
  payload: Record<string, unknown>;
  fetchFn: (url: string, options?: any) => Promise<Response>;
  sleep: (ms: number) => Promise<void>;
  /** Delay between status polls (default 3000ms). */
  pollIntervalMs?: number;
  /** Client-side deadline for the whole lifecycle (default 15 minutes). */
  timeoutMs?: number;
  /** Called with each upstream status so the node can show it while this call is open. */
  onStatus?: (update: { requestId: string; status: string; cancelUrl?: string; done?: boolean }) => void;
}

export type FalQueueStage = 'submit' | 'status' | 'result' | 'timeout' | 'invalid';

export type FalQueueOutcome =
  | { ok: true; requestId: string; data: any; submitUrl: string }
  | {
      ok: false;
      stage: FalQueueStage;
      /** Real upstream HTTP status; null only for client-side timeout. */
      status: number | null;
      /** Raw upstream response body (verbatim), or a local timeout description. */
      body: string;
      /** The exact URL that produced this outcome. */
      url: string;
      requestId: string | null;
    };

export function falQueueSubmitUrl(endpoint: string): string {
  return `https://queue.fal.run/${endpoint}`;
}

/** App id = owner/app (first two path segments of the endpoint id). */
export function falQueueAppId(endpoint: string): string {
  return endpoint.split('/').slice(0, 2).join('/');
}

export function falQueueStatusUrl(endpoint: string, requestId: string): string {
  return `https://queue.fal.run/${falQueueAppId(endpoint)}/requests/${requestId}/status`;
}

export function falQueueResultUrl(endpoint: string, requestId: string): string {
  return `https://queue.fal.run/${falQueueAppId(endpoint)}/requests/${requestId}`;
}

const DEFAULT_POLL_INTERVAL_MS = 3000;
/** Official queue jobs can run 15 minutes. The generate route socket must outlast this. */
export const FAL_VIDEO_POLL_BUDGET_MS = 15 * 60 * 1000;

function fail(
  stage: FalQueueStage,
  status: number | null,
  body: string,
  url: string,
  requestId: string | null,
): FalQueueOutcome {
  return { ok: false, stage, status, body, url, requestId };
}

export async function runFalQueueLifecycle(options: FalQueueLifecycleOptions): Promise<FalQueueOutcome> {
  const {
    endpoint,
    apiKey,
    payload,
    fetchFn,
    sleep,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    timeoutMs = FAL_VIDEO_POLL_BUDGET_MS,
  } = options;

  const authHeaders = { Authorization: `Key ${apiKey}` };

  // 1. Submit to the async queue (never the synchronous fal.run host).
  const submitUrl = falQueueSubmitUrl(endpoint);
  const submitResp = await fetchFn(submitUrl, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const submitBody = await submitResp.text();
  if (!submitResp.ok) {
    return fail('submit', submitResp.status, submitBody, submitUrl, null);
  }
  let submitData: any;
  try { submitData = JSON.parse(submitBody); } catch { submitData = undefined; }
  const requestId = typeof submitData?.request_id === 'string' && submitData.request_id
    ? submitData.request_id
    : null;
  if (!requestId) {
    // 2xx without a request_id cannot be tracked — fail closed, never pretend success.
    return fail('invalid', submitResp.status, submitBody, submitUrl, null);
  }
  options.onStatus?.({ requestId, status: 'IN_QUEUE', cancelUrl: submitData?.cancel_url });

  // Prefer the convenience URLs returned by Fal; fall back to app-id based URLs per docs.
  let statusUrl = typeof submitData?.status_url === 'string' && submitData.status_url
    ? submitData.status_url
    : falQueueStatusUrl(endpoint, requestId);
  let resultUrl = typeof submitData?.response_url === 'string' && submitData.response_url
    ? submitData.response_url
    : falQueueResultUrl(endpoint, requestId);

  // 2. Poll status until COMPLETED (IN_QUEUE / IN_PROGRESS keep polling).
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (Date.now() > deadline) {
      options.onStatus?.({ requestId, status: 'LOCAL_BUDGET_EXHAUSTED', cancelUrl: submitData?.cancel_url, done: true });
      return fail('timeout', null, `Fal queue polling timeout after ${timeoutMs}ms (request_id: ${requestId})`, statusUrl, requestId);
    }
    const statusResp = await fetchFn(statusUrl, { headers: { ...authHeaders } });
    const statusBody = await statusResp.text();
    if (!statusResp.ok) {
      options.onStatus?.({ requestId, status: `HTTP ${statusResp.status}`, cancelUrl: submitData?.cancel_url, done: true });
      return fail('status', statusResp.status, statusBody, statusUrl, requestId);
    }
    let statusData: any;
    try { statusData = JSON.parse(statusBody); } catch { statusData = undefined; }
    const state = statusData?.status;
    options.onStatus?.({ requestId, status: String(state || '未知'), cancelUrl: submitData?.cancel_url, done: state !== 'IN_QUEUE' && state !== 'IN_PROGRESS' });
    if (typeof statusData?.response_url === 'string' && statusData.response_url) {
      resultUrl = statusData.response_url;
    }
    if (state === 'COMPLETED') break;
    if (state === 'IN_QUEUE' || state === 'IN_PROGRESS') {
      await sleep(pollIntervalMs);
      continue;
    }
    // Unknown queue status — never treat as success.
    return fail('status', statusResp.status, statusBody, statusUrl, requestId);
  }

  // 3. Fetch the stored result; HTTP status mirrors the model outcome.
  const resultResp = await fetchFn(resultUrl, { headers: { ...authHeaders } });
  const resultBody = await resultResp.text();
  if (!resultResp.ok) {
    options.onStatus?.({ requestId, status: `HTTP ${resultResp.status}`, cancelUrl: submitData?.cancel_url, done: true });
    return fail('result', resultResp.status, resultBody, resultUrl, requestId);
  }
  let data: any;
  try { data = JSON.parse(resultBody); } catch { data = undefined; }
  if (data === undefined) {
    return fail('invalid', resultResp.status, resultBody, resultUrl, requestId);
  }
  return { ok: true, requestId, data, submitUrl };
}
