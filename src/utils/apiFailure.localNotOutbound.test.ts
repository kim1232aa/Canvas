import { describe, expect, it } from 'vitest';
import { describeApiFailure, errorBannerText, isLocalNotOutbound, plainErrorMessage, userFacingApiFailure } from './apiFailure';
import { humanSummaryText } from '../components/ExecutionLog';

const local = { error: '该服务商不支持: loras（krea）', errorSource: 'local', executionTrace: [] };

describe('local 400 never reached upstream', () => {
  it('detects only when no non-GET upstream trace', () => {
    expect(isLocalNotOutbound(local)).toBe(true);
    expect(isLocalNotOutbound({ ...local, executionTrace: [{ method: 'GET', endpoint: 'x/models', status: 200 }] })).toBe(true);
    expect(isLocalNotOutbound({ ...local, executionTrace: [{ method: 'POST', endpoint: 'x', status: 200 }] })).toBe(false);
    expect(isLocalNotOutbound({ ...local, errorSource: 'upstream' })).toBe(false);
  });
  it('first line = 没有发出去：<verbatim>', () => {
    const line = userFacingApiFailure(400, local, '/api/krea/generate');
    expect(line).toBe('没有发出去：该服务商不支持: loras（krea）');
    expect(describeApiFailure(400, local, '/r')).toMatch(/^没有发出去：.*未调用任何上游/);
    expect(errorBannerText(`${line}\nmore`)).toBe(`${line}\nmore`);
    expect(plainErrorMessage(new Error(line))).toBe(line);
  });
  it('long local reason is not sliced', () => {
    const long = { ...local, error: 'x'.repeat(300) };
    expect(userFacingApiFailure(400, long, '/r')).toBe(`没有发出去：${'x'.repeat(300)}`);
  });
  it('execution log summary', () => {
    expect(humanSummaryText({ id: 1, state: 'error', status: 400, route: '/r', response: local } as any)).toBe('没有发出去：该服务商不支持: loras（krea）');
  });
});

import { upstreamHttpFirstLine } from './apiFailure';
describe('upstream failure first line (all providers)', () => {
  const body = '{"title":"Forbidden","status":403,"message":"You\'ve run out of funds. Please top up: https://aimlapi.com/app/billing/","requestId":"x"}';
  it('HTTP <code> + verbatim response body (no stripping raw JSON on banner)', () => {
    const data = { error: 'x', errorSource: 'upstream', executionTrace: [{ method: 'GET', status: 200 }, { provider: 'aimlapi', method: 'POST', endpoint: 'e', status: 403, responseBody: body }] };
    const line = upstreamHttpFirstLine(data)!;
    expect(line).toContain('HTTP 403');
    expect(line).toContain('run out of funds');
    expect(line).toContain('"requestId"');
    expect(userFacingApiFailure(403, data, '/r')).toContain('HTTP 403');
    expect(userFacingApiFailure(403, data, '/r')).toContain('run out of funds');
    expect(userFacingApiFailure(403, data, '/r')).toContain('"requestId"');
    expect(errorBannerText(`HTTP 403 ${body}\nmore`)).toContain('HTTP 403');
    expect(errorBannerText(`HTTP 403 ${body}\nmore`)).toContain('"requestId"');
    expect(plainErrorMessage(new Error(`HTTP 403 ${body}`))).toContain('"requestId"');
  });
  it('krea 402 too verbatim', () => {
    const line = userFacingApiFailure(402, { executionTrace: [{ provider: 'krea', status: 402, responseBody: '{"message":"Insufficient"}' }] }, '/api/schema-provider/krea/submit');
    expect(line).toContain('HTTP 402');
    expect(line).toContain('Insufficient');
    expect(line).toContain('{"message"');
  });
});

describe('no double prefix', () => {
  it('server message already prefixed', () => {
    const d = { errorSource: 'local', error: '没有发出去：AIMLAPI 官方 Schema 不可用', executionTrace: [{ method: 'GET', endpoint: 'docs', status: 503 }] };
    expect(userFacingApiFailure(400, d, '/r')).toBe('没有发出去：AIMLAPI 官方 Schema 不可用'); // clean-1333 #3: a GET went out (503) — never 「未出站」
  });
});

describe('read-only catalog POST is not outbound generation', () => {
  it('local block after OpenWorks /tool/list (POST 200) headlines the local reason, not HTTP 200', async () => {
    const { upstreamFailureParts, userFacingApiFailure } = await import('./apiFailure');
    const data = { error: 'OpenWorks 模型 m：x。', errorSource: 'local', executionTrace: [{ method: 'POST', endpoint: 'https://openapi.tensor.art/openworks/v1/tool/list', status: 200, readOnly: true, responseBody: '{"code":"0"}' }] };
    expect(isLocalNotOutbound(data)).toBe(true);
    expect(upstreamFailureParts(data)).toBeNull();
    expect(userFacingApiFailure(400, data, '/r')).toMatch(/^没有发出去/);
    expect(userFacingApiFailure(400, data, '/r')).not.toMatch(/HTTP 200/);
  });
});

