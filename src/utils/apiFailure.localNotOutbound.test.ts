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
  it('first line = 未出站，本地拦截：<verbatim>', () => {
    const line = userFacingApiFailure(400, local, '/api/krea/generate');
    expect(line).toBe('未出站，本地拦截：该服务商不支持: loras（krea）');
    expect(describeApiFailure(400, local, '/r')).toMatch(/^未出站，本地拦截：.*未调用任何上游/);
    expect(errorBannerText(`${line}\nmore`)).toBe(line);
    expect(plainErrorMessage(new Error(line))).toBe(line);
  });
  it('long local reason is not sliced', () => {
    const long = { ...local, error: 'x'.repeat(300) };
    expect(userFacingApiFailure(400, long, '/r')).toBe(`未出站，本地拦截：${'x'.repeat(300)}`);
  });
  it('execution log summary', () => {
    expect(humanSummaryText({ id: 1, state: 'error', status: 400, route: '/r', response: local } as any)).toBe('未出站，本地拦截：该服务商不支持: loras（krea）');
  });
});

import { upstreamHttpFirstLine } from './apiFailure';
describe('upstream failure first line (all providers)', () => {
  const body = '{"title":"Forbidden","status":403,"message":"You\'ve run out of funds. Please top up: https://aimlapi.com/app/billing/","requestId":"x"}';
  it('HTTP <code> + extracted message (fix4: no raw JSON on banner)', () => {
    const data = { error: 'x', errorSource: 'upstream', executionTrace: [{ method: 'GET', status: 200 }, { method: 'POST', endpoint: 'e', status: 403, responseBody: body }] };
    const line = upstreamHttpFirstLine(data)!;
    expect(line).toContain('HTTP 403');
    expect(line).toContain('run out of funds');
    expect(line).not.toContain('"requestId"');
    expect(userFacingApiFailure(403, data, '/r')).toContain('HTTP 403');
    expect(userFacingApiFailure(403, data, '/r')).toContain('run out of funds');
    expect(errorBannerText(`HTTP 403 ${body}\nmore`)).toContain('HTTP 403');
    expect(errorBannerText(`HTTP 403 ${body}\nmore`)).not.toContain('"requestId"');
    expect(plainErrorMessage(new Error(`HTTP 403 ${body}`))).not.toContain('"requestId"');
  });
  it('krea 402 too', () => {
    const line = userFacingApiFailure(402, { executionTrace: [{ status: 402, responseBody: '{"message":"Insufficient"}' }] }, '/r');
    expect(line).toContain('HTTP 402');
    expect(line).toContain('Insufficient');
    expect(line).not.toContain('{"message"');
  });
});

describe('no double prefix', () => {
  it('server message already prefixed', () => {
    const d = { errorSource: 'local', error: '未出站，本地拦截：AIMLAPI 官方 Schema 不可用', executionTrace: [{ method: 'GET', endpoint: 'docs', status: 503 }] };
    expect(userFacingApiFailure(400, d, '/r')).toBe('本地拦截 · Schema 读取失败、未发生成：AIMLAPI 官方 Schema 不可用'); // clean-1333 #3: a GET went out (503) — never 「未出站」
  });
});

describe('read-only catalog POST is not outbound generation', () => {
  it('local block after OpenWorks /tool/list (POST 200) headlines the local reason, not HTTP 200', async () => {
    const { upstreamFailureParts, userFacingApiFailure } = await import('./apiFailure');
    const data = { error: 'OpenWorks 模型 m：x。未出站，本地拦截。', errorSource: 'local', executionTrace: [{ method: 'POST', endpoint: 'https://openapi.tensor.art/openworks/v1/tool/list', status: 200, readOnly: true, responseBody: '{"code":"0"}' }] };
    expect(isLocalNotOutbound(data)).toBe(true);
    expect(upstreamFailureParts(data)).toBeNull();
    expect(userFacingApiFailure(400, data, '/r')).toMatch(/^本地拦截/);
    expect(userFacingApiFailure(400, data, '/r')).not.toMatch(/HTTP 200/);
  });
});

