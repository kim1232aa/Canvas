/**
 * NanoGPT unified video status.
 * https://docs.nano-gpt.com/api-reference/endpoint/video-status-unified
 *
 * The OpenAPI body puts the URL at top-level `videoUrl` when `status` is
 * `completed`. The page's own examples nest it at `data.status` =
 * `COMPLETED` and `data.output.video.url`. Both are official; neither may
 * be treated as "still running".
 */

export const NANO_GPT_VIDEO_POLL_BUDGET_MS = 10 * 60 * 1000;
/** Official usage sample sleeps 5s between status checks. */
export const NANO_GPT_VIDEO_POLL_INTERVAL_MS = 5000;

const TERMINAL_OK = new Set(['COMPLETED', 'COMPLETE']);
const TERMINAL_FAIL = new Set(['FAILED', 'CANCELED', 'CANCELLED', 'ERROR']);

export type NanoGptVideoStatus =
  | { kind: 'pending'; status: string }
  | { kind: 'completed'; url: string; status: string }
  | { kind: 'completed-without-url'; status: string }
  | { kind: 'failed'; status: string; message: string };

function nestedUrl(data: any): string {
  const candidates = [
    data?.videoUrl,
    data?.data?.output?.video?.url,
    data?.data?.output?.url,
    data?.data?.videoUrl,
    data?.output?.video?.url,
    data?.output?.url,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function classifyNanoGptVideoStatus(data: any): NanoGptVideoStatus {
  const nested = String(data?.data?.status || '').toUpperCase();
  const top = String(data?.status || '').toUpperCase();
  const status = nested || top;
  if (TERMINAL_FAIL.has(status) || TERMINAL_FAIL.has(nested) || TERMINAL_FAIL.has(top)) {
    const message = String(
      data?.data?.error || data?.data?.userFriendlyError || data?.error || status || 'FAILED',
    );
    return { kind: 'failed', status: status || top || nested, message };
  }
  if (TERMINAL_OK.has(status) || TERMINAL_OK.has(nested) || TERMINAL_OK.has(top)) {
    const url = nestedUrl(data);
    return url
      ? { kind: 'completed', url, status: status || 'COMPLETED' }
      : { kind: 'completed-without-url', status: status || 'COMPLETED' };
  }
  return { kind: 'pending', status };
}
