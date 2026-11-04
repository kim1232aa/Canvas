import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Developer request log (雁 2026-11-04: no debug content on the UI; it goes to a log file).
 * One JSON line per outgoing upstream request (generation, poll, Schema/catalog lookup) and per local can't-send stop,
 * written to temp/logs/requests-YYYY-MM-DD.jsonl (Asia/Tokyo date). Secrets are masked to their last 4 chars.
 */
const SECRET_KEY = /^(authorization|x-api-key|api[-_]?key|apikey|token|access[-_]?token|secret|password|bearer|key|x-[a-z-]*key)$/i;
const BEARER = /\b(Bearer|Key|Token)\s+([A-Za-z0-9._\-]{8,})/g;
const TOKENISH = /\b(sk-|hf_|r8_|fal_|key_|tok_)[A-Za-z0-9._\-]{8,}/g;

export function maskTail(v: string): string {
  return v.length <= 4 ? '****' : `****${v.slice(-4)}`;
}
function maskString(s: string): string {
  return s.replace(BEARER, (_m, p, t) => `${p} ${maskTail(t)}`).replace(TOKENISH, (t) => maskTail(t));
}
export function maskSecrets(value: unknown, depth = 0): unknown {
  if (depth > 40) return value;
  if (typeof value === 'string') return maskString(value);
  if (Array.isArray(value)) return value.map((v) => maskSecrets(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) && typeof v === 'string' ? maskTail(v) : maskSecrets(v, depth + 1);
    }
    return out;
  }
  return value;
}

export function tokyoDate(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
export function tokyoTime(d = new Date()): string {
  return `${tokyoDate(d)}T${new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d)}+09:00`;
}

export type RequestLogEntry = {
  kind: 'upstream' | 'local-stop';
  route: string;
  provider?: string;
  model?: string;
  method?: string;
  endpoint?: string;
  requestBody?: unknown;
  status?: number | null;
  responseBody?: unknown;
  error?: string;
  durationMs?: number;
  keyIndex?: unknown;
  lookup?: boolean;
  historyId?: string;
  startedAt?: string;
};

export function requestLogLines(route: string, traces: any[], body: any, httpStatus: number): RequestLogEntry[] {
  const historyId = typeof body?.historyItem?.id === 'string' ? body.historyItem.id : Array.isArray(body?.historyItems) ? body.historyItems.map((h: any) => h?.id).filter(Boolean).join(',') || undefined : undefined;
  const upstream = traces.filter((t) => t && typeof t === 'object' && typeof t.endpoint === 'string' && t.method);
  const lines: RequestLogEntry[] = upstream.map((t) => ({
    kind: 'upstream', route, provider: t.provider, model: t.model, method: t.method, endpoint: t.endpoint,
    requestBody: t.requestBody, status: t.status ?? null, responseBody: t.responseBody ?? null,
    ...(t.error ? { error: t.error } : {}), durationMs: t.durationMs, keyIndex: t.keyUsage,
    lookup: t.method === 'GET' || !!t.readOnly, ...(historyId ? { historyId } : {}), startedAt: t.startedAt,
  }));
  if (!upstream.length && httpStatus >= 400 && body && typeof body === 'object' && body.errorSource === 'local') {
    lines.push({ kind: 'local-stop', route, provider: body.provider, model: body.model, status: httpStatus, error: typeof body.error === 'string' ? body.error : JSON.stringify(body.error) });
  }
  return lines;
}

export function writeRequestLog(rootDir: string, entries: RequestLogEntry[], now = new Date()): void {
  if (!entries.length) return;
  const dir = path.join(rootDir, 'temp', 'logs');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `requests-${tokyoDate(now)}.jsonl`);
  const time = tokyoTime(now);
  appendFileSync(file, entries.map((e) => JSON.stringify(maskSecrets({ time, ...e }))).join('\n') + '\n');
}
