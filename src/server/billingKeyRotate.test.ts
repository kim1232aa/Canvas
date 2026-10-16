import {describe, expect, it, vi} from 'vitest';
import {
  buildKeyRotationPayload,
  isBillingCreditsError,
  plainResultForAttempt,
  runWithBillingKeyRotate,
  summarizeKeyRotation,
  type KeyAttemptRecord,
} from './billingKeyRotate';

describe('isBillingCreditsError', () => {
  it('treats 402 and insufficient-credits bodies as billing', () => {
    expect(isBillingCreditsError(402, '{}')).toBe(true);
    expect(
      isBillingCreditsError(
        402,
        '{"error":"You have no remaining credits. Purchase pre-paid credits to continue using Inference Providers."}',
      ),
    ).toBe(true);
    expect(isBillingCreditsError(400, 'Insufficient credit balance')).toBe(true);
    expect(isBillingCreditsError(403, '余额不足')).toBe(false); // auth status wins
    expect(isBillingCreditsError(200, 'no remaining credits')).toBe(true);
  });

  it('does not rotate on auth, param, or 5xx', () => {
    expect(isBillingCreditsError(401, 'Unauthorized')).toBe(false);
    expect(isBillingCreditsError(403, 'Forbidden')).toBe(false);
    expect(isBillingCreditsError(400, 'model is required')).toBe(false);
    expect(isBillingCreditsError(422, 'validation failed')).toBe(false);
    expect(isBillingCreditsError(500, 'internal error')).toBe(false);
    expect(isBillingCreditsError(503, 'overloaded')).toBe(false);
    expect(isBillingCreditsError(429, 'rate limit')).toBe(false);
  });
});

describe('summarizeKeyRotation', () => {
  const billing = (i: number): KeyAttemptRecord => ({
    index: i,
    maskedKey: `hf_${i}...xxxx`,
    result: '额度不够',
    status: 402,
    responseBody: 'no remaining credits',
    outcome: 'billing',
  });
  const ok = (i: number): KeyAttemptRecord => ({
    index: i,
    maskedKey: `hf_${i}...yyyy`,
    result: '成功',
    status: 200,
    outcome: 'success',
  });
  const auth = (i: number): KeyAttemptRecord => ({
    index: i,
    maskedKey: `hf_${i}...zzzz`,
    result: '鉴权失败',
    status: 401,
    responseBody: 'Unauthorized',
    outcome: 'fatal',
  });

  it('success after one billing fail → 这把额度不够，已换下一把', () => {
    expect(summarizeKeyRotation([billing(0), ok(1)])).toBe('这把额度不够，已换下一把');
  });

  it('all billing → 几把都额度不够', () => {
    expect(summarizeKeyRotation([billing(0), billing(1), billing(2)])).toBe('几把都额度不够');
  });

  it('single billing → 这把额度不够', () => {
    expect(summarizeKeyRotation([billing(0)])).toBe('这把额度不够');
  });

  it('clean success with no billing → 完成', () => {
    expect(summarizeKeyRotation([ok(0)])).toBe('完成');
  });
});

describe('runWithBillingKeyRotate', () => {
  const mask = (k: string) => `${k.slice(0, 4)}...${k.slice(-4)}`;

  it('billing → next key; success includes prior failed attempts', async () => {
    const seen: string[] = [];
    const out = await runWithBillingKeyRotate({
      keys: ['hf_aaaa1111aaaa', 'hf_bbbb2222bbbb', 'hf_cccc3333cccc'],
      pinned: false,
      maskKey: mask,
      attempt: async (key) => {
        seen.push(key);
        if (key === 'hf_aaaa1111aaaa') {
          return {ok: false, status: 402, body: 'You have no remaining credits'};
        }
        return {ok: true, value: {image: 'ok'}};
      },
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(seen).toEqual(['hf_aaaa1111aaaa', 'hf_bbbb2222bbbb']);
    expect(out.attempts).toHaveLength(2);
    expect(out.attempts[0]).toMatchObject({outcome: 'billing', result: '额度不够', status: 402});
    expect(out.attempts[0].responseBody).toContain('no remaining credits');
    expect(out.attempts[1]).toMatchObject({outcome: 'success', result: '成功'});
    expect(out.keyRotation.summary).toBe('这把额度不够，已换下一把');
    expect(out.value).toEqual({image: 'ok'});
  });

  it('auth failure does not rotate', async () => {
    const attempt = vi.fn(async () => ({ok: false as const, status: 401, body: 'Unauthorized'}));
    const out = await runWithBillingKeyRotate({
      keys: ['hf_aaaa1111aaaa', 'hf_bbbb2222bbbb'],
      pinned: false,
      maskKey: mask,
      attempt,
    });
    expect(out.ok).toBe(false);
    expect(attempt).toHaveBeenCalledTimes(1);
    if (out.ok) return;
    expect(out.attempts).toHaveLength(1);
    expect(out.attempts[0].outcome).toBe('fatal');
    expect(out.attempts[0].result).toBe('鉴权失败');
    expect(out.lastStatus).toBe(401);
  });

  it('pool exhausted returns last failure with all attempts', async () => {
    const out = await runWithBillingKeyRotate({
      keys: ['hf_aaaa1111aaaa', 'hf_bbbb2222bbbb'],
      pinned: false,
      maskKey: mask,
      attempt: async () => ({ok: false, status: 402, body: 'INSUFFICIENT_CREDITS'}),
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.attempts).toHaveLength(2);
    expect(out.attempts.every((a) => a.outcome === 'billing')).toBe(true);
    expect(out.keyRotation.summary).toBe('几把都额度不够');
    expect(out.lastStatus).toBe(402);
    expect(out.lastBody).toContain('INSUFFICIENT_CREDITS');
  });

  it('pinned single key never rotates even on billing', async () => {
    const attempt = vi.fn(async () => ({ok: false as const, status: 402, body: 'no remaining credits'}));
    const out = await runWithBillingKeyRotate({
      keys: ['hf_pinpinpinpin'],
      pinned: true,
      maskKey: mask,
      attempt,
    });
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.keyRotation.summary).toBe('这把额度不够');
    expect(out.keyRotation.pinned).toBe(true);
  });

  it('5xx does not rotate', async () => {
    const attempt = vi.fn(async () => ({ok: false as const, status: 502, body: 'bad gateway'}));
    const out = await runWithBillingKeyRotate({
      keys: ['a', 'b'],
      pinned: false,
      maskKey: mask,
      attempt,
    });
    expect(attempt).toHaveBeenCalledTimes(1);
    if (out.ok) return;
    expect(out.attempts[0].result).toBe('上游服务异常');
  });

  it('local validation stops without rotate and keeps payload', async () => {
    const out = await runWithBillingKeyRotate({
      keys: ['a', 'b'],
      pinned: false,
      maskKey: mask,
      attempt: async () => ({
        ok: false,
        local: true,
        status: 400,
        payload: {error: 'HF 未给模型提供 fal-ai 生图映射'},
      }),
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.attempts).toHaveLength(1);
    expect(out.localPayload?.error).toContain('fal-ai');
    expect(out.lastStatus).toBe(400);
  });
});

describe('plainResultForAttempt + buildKeyRotationPayload', () => {
  it('keeps attempt rows short and free of path jargon', () => {
    expect(plainResultForAttempt('billing', 402, 'x')).toBe('额度不够');
    expect(plainResultForAttempt('success', 200)).toBe('成功');
    const payload = buildKeyRotationPayload(
      [
        {
          index: 0,
          maskedKey: 'hf_a...aaaa',
          result: '额度不够',
          status: 402,
          responseBody: '{"error":"no remaining credits"}',
          outcome: 'billing',
        },
        {
          index: 1,
          maskedKey: 'hf_b...bbbb',
          result: '成功',
          status: 200,
          outcome: 'success',
        },
      ],
      false,
    );
    expect(payload.summary).not.toMatch(/POST|\/api\/|schema/);
    expect(payload.attempts[0].maskedKey).toBe('hf_a...aaaa');
  });
});
