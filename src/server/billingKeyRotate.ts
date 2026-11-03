/**
 * Billing-only KeyPool rotate helpers.
 * Retry the next key ONLY on quota/402/insufficient-credits style errors.
 * Auth / param / 5xx failures stop immediately. Every attempt is recorded for the exec log.
 */

export type BillingAttemptOutcome = 'billing' | 'success' | 'fatal';

export interface KeyAttemptRecord {
  index: number;
  maskedKey: string;
  /** Attempt row: 「成功」 or upstream 「HTTP <status>: <body>」 verbatim. */
  result: string;
  status: number | null;
  responseBody?: string;
  outcome: BillingAttemptOutcome;
}

export interface KeyRotationPayload {
  summary: string;
  attempts: KeyAttemptRecord[];
  pinned: boolean;
}

/** True only for credits/quota billing failures — never auth, never generic 5xx. */
export function isBillingCreditsError(status: number | null | undefined, bodyText?: string): boolean {
  if (status === 401 || status === 403) return false;
  if (status != null && status >= 500) return false;
  if (status === 402) return true;
  const t = String(bodyText || '');
  if (!t) return false;
  return /insufficient\s+credits?|insufficient\s+balance|no remaining credits|payment required|余额不足|额度不足|INSUFFICIENT_CREDITS|out of credits|prepaid credits|top[_ -]?up required|You have no remaining credits/i.test(
    t,
  );
}

/** 雁 rule: the attempt row is the upstream status + body verbatim — never our own summary. */
export function plainResultForAttempt(
  outcome: BillingAttemptOutcome,
  status: number | null,
  bodyText?: string,
): string {
  if (outcome === 'success') return '成功';
  return `HTTP ${status ?? '—'}: ${String(bodyText ?? '')}`;
}

/** Per-key lines, upstream text verbatim: 「<masked key>: HTTP <status>: <body>」. */
export function summarizeKeyRotation(attempts: KeyAttemptRecord[]): string {
  if (!attempts.length) return '请求失败';
  const success = attempts.some((a) => a.outcome === 'success');
  const failed = attempts.filter((a) => a.outcome !== 'success').map((a) => `${a.maskedKey}: ${a.result}`);
  if (success) return failed.length ? ['完成', ...failed].join('\n') : '完成';
  return failed.join('\n');
}

export function buildKeyRotationPayload(
  attempts: KeyAttemptRecord[],
  pinned: boolean,
): KeyRotationPayload {
  return { summary: summarizeKeyRotation(attempts), attempts, pinned };
}

export type RotateAttemptResult<T> =
  | { ok: true; value: T }
  | { ok: false; local?: false; status: number; body: string }
  /** Local / validation stop — do not rotate, return this payload to the client. */
  | { ok: false; local: true; status: number; payload: Record<string, unknown> };

/**
 * Try keys in order. Billing → next key. Anything else → stop.
 * pinned + single key never rotates (explicit user pin).
 */
export async function runWithBillingKeyRotate<T>(opts: {
  keys: string[];
  pinned: boolean;
  maskKey: (key: string) => string;
  attempt: (key: string, index: number) => Promise<RotateAttemptResult<T>>;
  onAttempt?: (record: KeyAttemptRecord, key: string) => void;
}): Promise<
  | { ok: true; value: T; attempts: KeyAttemptRecord[]; keyRotation: KeyRotationPayload }
  | {
      ok: false;
      attempts: KeyAttemptRecord[];
      keyRotation: KeyRotationPayload;
      lastStatus: number;
      lastBody: string;
      localPayload?: Record<string, unknown>;
    }
> {
  const attempts: KeyAttemptRecord[] = [];
  const keys = opts.keys.filter(Boolean);
  if (!keys.length) {
    const empty = buildKeyRotationPayload([], opts.pinned);
    return { ok: false, attempts, keyRotation: empty, lastStatus: 400, lastBody: '未配置 Key' };
  }

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const result = await opts.attempt(key, i);

    if (result.ok) {
      const rec: KeyAttemptRecord = {
        index: i,
        maskedKey: opts.maskKey(key),
        result: '成功',
        status: 200,
        outcome: 'success',
      };
      attempts.push(rec);
      opts.onAttempt?.(rec, key);
      return { ok: true, value: result.value, attempts, keyRotation: buildKeyRotationPayload(attempts, opts.pinned) };
    }

    if (result.local === true) {
      const rec: KeyAttemptRecord = {
        index: i,
        maskedKey: opts.maskKey(key),
        result: plainResultForAttempt('fatal', result.status, JSON.stringify(result.payload)),
        status: result.status,
        responseBody: JSON.stringify(result.payload),
        outcome: 'fatal',
      };
      attempts.push(rec);
      opts.onAttempt?.(rec, key);
      return {
        ok: false,
        attempts,
        keyRotation: buildKeyRotationPayload(attempts, opts.pinned),
        lastStatus: result.status,
        lastBody: JSON.stringify(result.payload),
        localPayload: result.payload,
      };
    }

    const status = result.status;
    const body = result.body;
    const billing = isBillingCreditsError(status, body);
    const outcome: BillingAttemptOutcome = billing ? 'billing' : 'fatal';
    const rec: KeyAttemptRecord = {
      index: i,
      maskedKey: opts.maskKey(key),
      result: plainResultForAttempt(outcome, status, body),
      status,
      responseBody: body,
      outcome,
    };
    attempts.push(rec);
    opts.onAttempt?.(rec, key);

    // Pinned single key, or non-billing → stop. Only billing continues to next key.
    if (!billing || opts.pinned || i === keys.length - 1) {
      return {
        ok: false,
        attempts,
        keyRotation: buildKeyRotationPayload(attempts, opts.pinned),
        lastStatus: status,
        lastBody: body,
      };
    }
  }

  const last = attempts[attempts.length - 1];
  return {
    ok: false,
    attempts,
    keyRotation: buildKeyRotationPayload(attempts, opts.pinned),
    lastStatus: last?.status ?? 500,
    lastBody: last?.responseBody || '',
  };
}
