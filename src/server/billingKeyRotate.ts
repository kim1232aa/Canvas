/**
 * Billing-only KeyPool rotate helpers.
 * Retry the next key ONLY on quota/402/insufficient-credits style errors.
 * Auth / param / 5xx failures stop immediately. Every attempt is recorded for the exec log.
 */

export type BillingAttemptOutcome = 'billing' | 'success' | 'fatal';

export interface KeyAttemptRecord {
  index: number;
  maskedKey: string;
  /** One short plain Chinese line for the attempt row (额度不够 / 成功 / 鉴权失败 …). */
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

export function plainResultForAttempt(
  outcome: BillingAttemptOutcome,
  status: number | null,
  bodyText?: string,
): string {
  if (outcome === 'success') return '成功';
  if (outcome === 'billing') return '额度不够';
  if (status === 401 || status === 403) return '鉴权失败';
  if (status != null && status >= 500) return '上游服务异常';
  if (status === 400 || status === 422) return '参数或请求不被接受';
  if (status === 429) return '请求过于频繁';
  const first = String(bodyText || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return first || (status != null ? `失败 HTTP ${status}` : '失败');
}

/**
 * One plain Chinese conclusion for the exec-log first line.
 * Never stacks paths / schema jargon.
 */
export function summarizeKeyRotation(attempts: KeyAttemptRecord[]): string {
  if (!attempts.length) return '请求失败';
  const billingCount = attempts.filter((a) => a.outcome === 'billing').length;
  const success = attempts.some((a) => a.outcome === 'success');
  const last = attempts[attempts.length - 1];

  if (success) {
    if (billingCount === 0) return '完成';
    if (billingCount === 1) return '这把额度不够，已换下一把';
    return `前 ${billingCount} 把额度不够，已换到有额度的`;
  }

  if (billingCount === attempts.length) {
    if (attempts.length === 1) return '这把额度不够';
    return '几把都额度不够';
  }

  if (billingCount > 0 && last.outcome === 'fatal') {
    return `换过 ${billingCount} 把后仍失败：${last.result}`;
  }

  return last.result || '请求失败';
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
