import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SchemaProviderDriver, schemaProviderOutputUrl } from './SchemaProviderDriver';
import { clearSharedGet, beginSharedGetAction } from '../../services/sharedGet';
import { plainErrorMessage } from '../../utils/apiFailure';
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
    mockFetch.mockImplementation(async (input: URL | RequestInfo, init?: RequestInit) => {
      const u = String(input);
      const method = String(init?.method || 'GET').toUpperCase();
      if (u.includes('/api/model-schema') && method === 'GET') {
        return jsonResponse({ credentialRef: 'cred-sogni-1', inputSchema: { type: 'object' } });
      }
      if (u.includes('/api/schema-provider/sogni/submit') && method === 'POST') {
        return jsonResponse({
          taskId: 'wf_wait',
          pollUrl: '/api/schema-provider/sogni/tasks/wf_wait',
          actualRequest: { endpoint: 'https://api.sogni.ai/v1/creative-agent/workflows', mapping:[{from:'Sogni LoRA strength range check',status:'unknown',sourceUrl:'https://api.sogni.ai/v1/loras/comfy',unknown:[{id:'personal-owned',reason:'公开目录无匹配'}],lookupFailure:{endpoint:'https://api.sogni.ai/v1/loras/comfy',upstreamStatus:503,upstreamResponseBody:'catalog offline',error:'HTTP 503: catalog offline'}}] },
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
    expect(err.message).toMatch(/LoRA 强度范围未能完整核实/);
    expect(err.message).toMatch(/HTTP 503/);
    expect(err.data?.loraRangeWarning).toMatch(/catalog offline/);
  });

  it('keeps the range lookup warning visible when generated output persistence also fails', async () => {
    mockFetch.mockImplementation(async (input: URL | RequestInfo, init?: RequestInit) => {
      const u=String(input);const method=String(init?.method || 'GET').toUpperCase();
      if(u.includes('/api/model-schema')&&method==='GET')return jsonResponse({credentialRef:'cred',inputSchema:{type:'object'}});
      if(u.includes('/api/schema-provider/sogni/submit')&&method==='POST')return jsonResponse({taskId:'wf_done',pollUrl:'/api/schema-provider/sogni/tasks/wf_done',actualRequest:{mapping:[{from:'Sogni LoRA strength range check',status:'unknown',sourceUrl:'https://api.sogni.ai/v1/loras/comfy',unknown:[{id:'manual',reason:'范围未知'}]}]}});
      if(u.includes('/api/schema-provider/sogni/tasks/wf_done')&&method==='GET')return jsonResponse({status:'completed',outputs:['https://fixture.invalid/out.png']});
      if(u.includes('/api/schema-provider/sogni/save-result')&&method==='POST')throw new Error('storage offline');
      return jsonResponse({error:`unexpected ${method} ${u}`},500);
    });
    const pending=driver.generate({prompt:'x',model:'krea-2-turbo'},{sogniKey:'fixture'});
    await vi.runAllTimersAsync();
    const result=await pending;
    expect(result.historyWarning).toMatch(/LoRA 强度范围未能完整核实/);
    expect(result.historyWarning).toMatch(/范围未知/);
    expect(result.historyWarning).toMatch(/保存失败：Network error/);
  });

  it('shows a range directory failure when submit itself returns an upstream error', async () => {
    mockFetch.mockImplementation(async (input: URL | RequestInfo, init?: RequestInit) => {
      const u=String(input);const method=String(init?.method || 'GET').toUpperCase();
      if(u.includes('/api/model-schema')&&method==='GET')return jsonResponse({credentialRef:'cred',inputSchema:{type:'object'}});
      if(u.includes('/api/schema-provider/sogni/submit')&&method==='POST')return jsonResponse({error:'insufficient credit',actualRequest:{mapping:[{from:'Sogni LoRA strength range check',status:'unknown',sourceUrl:'https://api.sogni.ai/v1/loras/comfy',unknown:[{id:'manual',reason:'范围未知'}],lookupFailure:{endpoint:'https://api.sogni.ai/v1/loras/comfy',upstreamStatus:503,upstreamResponseBody:'catalog offline',error:'HTTP 503: catalog offline'}}]}},402);
      return jsonResponse({error:`unexpected ${method} ${u}`},500);
    });
    const pending=driver.generate({prompt:'x',model:'krea-2-turbo'},{sogniKey:'fixture'}).then(()=>null,error=>error);
    await vi.runAllTimersAsync();
    const err=await pending;
    expect(err).toMatchObject({
      message:expect.stringMatching(/LoRA 强度范围未能完整核实.*HTTP 503/),
      data:{loraRangeWarning:expect.stringContaining('catalog offline')},
    });
    expect(plainErrorMessage(err)).toMatch(/LoRA 强度范围未能完整核实.*catalog offline/);
  });
});

describe('SchemaProviderDriver · output URL protocol validation', () => {
  const driver = new SchemaProviderDriver('wavespeed');

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

  it('accepts URL strings and objects with an explicit URL', () => {
    expect(schemaProviderOutputUrl({ outputs: ['https://cdn.example/image.png'] })).toBe('https://cdn.example/image.png');
    expect(schemaProviderOutputUrl({ outputs: [{ type: 'image', url: 'https://cdn.example/image.png' }] })).toBe('https://cdn.example/image.png');
    expect(schemaProviderOutputUrl({ outputs: [{ url: '  data:image/png;base64,AA==  ' }] })).toBe('data:image/png;base64,AA==');
  });

  it('does not stringify an unknown structured output into a false success', async () => {
    const upstreamBody = { status: 'completed', outputs: [{ type: 'image', metadata: { id: 'asset-1' } }], endpoint: 'https://api.wavespeed.ai/api/v3/predictions/task-1/result', upstreamStatus: 200 };
    mockFetch.mockImplementation(async (input: URL | RequestInfo, init?: RequestInit) => {
      const u = String(input);
      const method = String(init?.method || 'GET').toUpperCase();
      if (u.includes('/api/model-schema') && method === 'GET') return jsonResponse({ credentialRef: 'wave-cred', inputSchema: { type: 'object', properties: { prompt: { type: 'string' } } } });
      if (u.includes('/api/schema-provider/wavespeed/submit') && method === 'POST') return jsonResponse({ taskId: 'task-1', pollUrl: '/api/schema-provider/wavespeed/tasks/task-1', actualRequest: { endpoint: 'https://api.wavespeed.ai/api/v3/example' } });
      if (u.includes('/api/schema-provider/wavespeed/tasks/task-1') && method === 'GET') return jsonResponse(upstreamBody);
      return jsonResponse({ error: `unexpected ${method} ${u}` }, 500);
    });

    const pending = driver.generate({ prompt: 'p', model: 'wavespeed-ai/example' }, { wavespeedKey: 'fixture' }).then(() => null, (error) => error);
    await vi.runAllTimersAsync();
    const error = await pending;

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('SchemaProviderProtocolError');
    expect(error.message).toContain('without a supported media URL');
    expect(error.message).toContain('metadata'); // the original response body stays available for diagnosis
    expect(error.data).toMatchObject({ errorSource: 'upstream-protocol', endpoint: upstreamBody.endpoint, upstreamStatus: 200, rawResponse: upstreamBody });
    expect(mockFetch.mock.calls.some(([url]) => String(url).includes('/save-result'))).toBe(false);
  });

  it('keeps successful structured outputs that contain an explicit url', async () => {
    mockFetch.mockImplementation(async (input: URL | RequestInfo, init?: RequestInit) => {
      const u = String(input);
      const method = String(init?.method || 'GET').toUpperCase();
      if (u.includes('/api/model-schema') && method === 'GET') return jsonResponse({ credentialRef: 'wave-cred', inputSchema: { type: 'object', properties: { prompt: { type: 'string' } } } });
      if (u.includes('/api/schema-provider/wavespeed/submit') && method === 'POST') return jsonResponse({ taskId: 'task-2', pollUrl: '/api/schema-provider/wavespeed/tasks/task-2', actualRequest: { endpoint: 'https://api.wavespeed.ai/api/v3/example' } });
      if (u.includes('/api/schema-provider/wavespeed/tasks/task-2') && method === 'GET') return jsonResponse({ status: 'completed', outputs: [{ type: 'image', url: 'https://cdn.example/valid.png' }] });
      if (u.includes('/api/schema-provider/wavespeed/save-result') && method === 'POST') return jsonResponse({ historyItems: [] });
      return jsonResponse({ error: `unexpected ${method} ${u}` }, 500);
    });

    const pending = driver.generate({ prompt: 'p', model: 'wavespeed-ai/example' }, { wavespeedKey: 'fixture' });
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result.mediaUrl).toBe('https://cdn.example/valid.png');
  });
});
