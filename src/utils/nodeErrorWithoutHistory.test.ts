import { describe, expect, it } from 'vitest';
import { historyFacingErrorMessage } from './apiFailure';
import { buildKeyRotationPayload } from '../server/billingKeyRotate';

// 雁 2026-11-04: failed runs are not history; the node error comes from the route response alone.
describe('node failure text without a history record', () => {
  it('HF multi-key: one verbatim line per key, no historyItem needed', () => {
    const kr = buildKeyRotationPayload([
      { index: 0, maskedKey: 'hf_…aaaa', result: 'HTTP 402: {"error":"Purchase pre-paid credits"}', status: 402, outcome: 'billing' },
      { index: 1, maskedKey: 'hf_…bbbb', result: 'HTTP 402: {"error":"Purchase pre-paid credits"}', status: 402, outcome: 'billing' },
    ], false);
    const msg = historyFacingErrorMessage({ data: { error: kr.summary, keyRotation: kr } });
    expect(msg).toBe('hf_…aaaa: HTTP 402: {"error":"Purchase pre-paid credits"}\nhf_…bbbb: HTTP 402: {"error":"Purchase pre-paid credits"}');
  });
  it('non-JSON upstream 403: status + raw body, no parse-error text', () => {
    const msg = historyFacingErrorMessage({ data: { error: 'HTTP 403: <!DOCTYPE html>\n<title>Attention Required! | Cloudflare</title>' } });
    expect(msg).toContain('HTTP 403: <!DOCTYPE html>');
    expect(msg).not.toContain('响应非 JSON');
  });
});
