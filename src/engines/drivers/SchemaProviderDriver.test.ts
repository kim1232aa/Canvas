import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SchemaProviderDriver } from './SchemaProviderDriver';
import { clearSharedGet, beginSharedGetAction } from '../../services/sharedGet';
import type { NormalizedGenerateParams } from '../types';

vi.mock('../../services/executionTrace', () => ({
  tracedFetch: vi.fn(),
  isApiTraceError: () => false,
  recordLocalEvent: vi.fn(),
}));

import { tracedFetch } from '../../services/executionTrace';

const mockFetch = vi.mocked(tracedFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('SchemaProviderDriver · Sogni waiting_for_user', () => {
  const driver = new SchemaProviderDriver('sogni');

  beforeEach(() => {
    mockFetch.mockReset();
    clearSharedGet();
    beginSharedGetAction();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    clearSharedGet();
  });

  it('poll status waiting_for_user throws (terminal failure, not success/pending hang)', async () => {
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = String(init?.method || 'GET').toUpperCase();
      if (u.includes('/api/model-schema') && method === 'GET') {
        return jsonResponse({ credentialRef: 'cred-sogni-1', inputSchema: { type: 'object' } });
      }
      if (u.includes('/api/schema-provider/sogni/submit') && method === 'POST') {
        return jsonResponse({
          taskId: 'wf_wait',
          pollUrl: '/api/schema-provider/sogni/tasks/wf_wait',
          actualRequest: { endpoint: 'https://api.sogni.ai/v1/creative-agent/workflows' },
        });
      }
      if (u.includes('/api/schema-provider/sogni/tasks/wf_wait') && method === 'GET') {
        return jsonResponse({
          status: 'waiting_for_user',
          waitingReason: 'insufficient_credit',
          upstreamStatus: 200,
          rawResponse: { data: { workflow: { status: 'waiting_for_user', waitingReason: 'insufficient_credit' } } },
          historyItem: { status: 'failed', upstreamStatusText: 'task status=waiting_for_user · insufficient_credit' },
        });
      }
      return jsonResponse({ error: `unexpected ${method} ${u}` }, 500);
    });

    const params: NormalizedGenerateParams = {
      prompt: 'lighthouse',
      model: 'krea-2-turbo',
      apiKey: 'fixture-sogni-key',
    };

    let err: any;
    const pending = driver.generate(params, { sogniKey: 'fixture-sogni-key' }).catch((e) => { err = e; });
    await vi.runAllTimersAsync();
    await pending;

    expect(err).toBeTruthy();
    expect(String(err.message || '')).toMatch(/waiting_for_user/);
    expect(String(err.message || '')).toMatch(/insufficient_credit/);
    expect(err.data?.status).toBe('waiting_for_user');
    expect(err.data?.waitingReason).toBe('insufficient_credit');
    expect(err.data?.historyItem?.status).toBe('failed');
  });
});
