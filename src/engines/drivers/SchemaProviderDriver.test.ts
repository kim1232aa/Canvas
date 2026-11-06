import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SchemaProviderDriver, schemaProviderOutputUrl, waveSpeedBase64ImageDataUrl } from './SchemaProviderDriver';
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

  it('surfaces unmappedLoras in historyWarning on completed generation and in error message on submit failure without masking upstream HTTP status/body', async () => {
    const kreaDriver = new SchemaProviderDriver('krea');
    mockFetch.mockImplementation(async (input: URL | RequestInfo, init?: RequestInit) => {
      const u = String(input);
      const method = String(init?.method || 'GET').toUpperCase();
      if (u.includes('/api/model-schema') && method === 'GET') {
        return jsonResponse({ credentialRef: 'krea-cred', inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, styles: { type: 'array' } } } });
      }
      if (u.includes('/api/schema-provider/krea/submit') && method === 'POST') {
        return jsonResponse({
          taskId: 'krea_job_1',
          pollUrl: '/api/schema-provider/krea/tasks/krea_job_1',
          actualRequest: {
            endpoint: 'https://api.krea.ai/generate/image/bfl/flux-1-dev',
            parameters: { prompt: 'x', styles: [] },
            mapping: [
              {
                from: 'loras',
                to: 'styles',
                unmappedLoras: [
                  {
                    item: { name: 'cinematic-1940s.safetensors', downloadUrl: 'https://civitai.com/api/download/models/1527024', civitaiId: '1527024' },
                    reason: 'Krea LoRA 缺少 styleId（需要 Krea 官方样式目录公布的 style ID）',
                  },
                ],
              },
            ],
          },
        });
      }
      if (u.includes('/api/schema-provider/krea/tasks/krea_job_1') && method === 'GET') {
        return jsonResponse({ status: 'completed', outputs: ['https://cdn.example/krea.png'] });
      }
      if (u.includes('/api/schema-provider/krea/save-result') && method === 'POST') {
        return jsonResponse({ historyItems: [{ url: 'https://cdn.example/krea.png' }] });
      }
      return jsonResponse({ error: `unexpected ${method} ${u}` }, 500);
    });

    const pending = kreaDriver.generate({ prompt: 'x', model: 'image/bfl/flux-1-dev' }, { kreaKey: 'fixture' });
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result.historyWarning).toContain('部分或全部 LoRA 因标识命名空间或格式不匹配未发送（未挂载）');
    expect(result.historyWarning).toContain('cinematic-1940s.safetensors');
    expect(result.historyWarning).toContain('https://civitai.com/api/download/models/1527024');
    expect(result.historyWarning).toContain('Krea LoRA 缺少 styleId');
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

  it('detects WaveSpeed base64 MIME from PNG, JPEG, and WebP byte signatures', () => {
    const encoded=(bytes:number[])=>btoa(String.fromCharCode(...bytes));
    const png=encoded([137,80,78,71,13,10,26,10]);
    const jpeg=encoded([255,216,255,0]);
    const webp=encoded([82,73,70,70,0,0,0,0,87,69,66,80]);
    expect(waveSpeedBase64ImageDataUrl(png)).toBe(`data:image/png;base64,${png}`);
    expect(waveSpeedBase64ImageDataUrl(jpeg)).toBe(`data:image/jpeg;base64,${jpeg}`);
    expect(waveSpeedBase64ImageDataUrl(webp)).toBe(`data:image/webp;base64,${webp}`);
    expect(waveSpeedBase64ImageDataUrl('not-an-image')).toBeUndefined();
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

  it('wraps naked base64 only when the submitted WaveSpeed schema parameter enabled it', async () => {
    const png=btoa(String.fromCharCode(137,80,78,71,13,10,26,10));
    let savedOutputs:unknown;
    mockFetch.mockImplementation(async (input: URL | RequestInfo, init?: RequestInit) => {
      const u=String(input);const method=String(init?.method || 'GET').toUpperCase();
      if(u.includes('/api/model-schema')&&method==='GET')return jsonResponse({credentialRef:'wave-cred',inputSchema:{type:'object',properties:{prompt:{type:'string'},enable_base64_output:{type:'boolean'}}}});
      if(u.includes('/api/schema-provider/wavespeed/submit')&&method==='POST')return jsonResponse({taskId:'task-base64',pollUrl:'/api/schema-provider/wavespeed/tasks/task-base64',actualRequest:{endpoint:'https://api.wavespeed.ai/api/v3/wavespeed-ai/z-image/turbo-lora',parameters:{prompt:'p',enable_base64_output:true}}});
      if(u.includes('/api/schema-provider/wavespeed/tasks/task-base64')&&method==='GET')return jsonResponse({status:'completed',outputs:[png],endpoint:'https://api.wavespeed.ai/api/v3/predictions/task-base64/result',upstreamStatus:200});
      if(u.includes('/api/schema-provider/wavespeed/save-result')&&method==='POST'){
        savedOutputs=JSON.parse(String(init?.body)).outputs;
        return jsonResponse({historyItems:[]});
      }
      return jsonResponse({error:`unexpected ${method} ${u}`},500);
    });

    const pending=driver.generate({prompt:'p',model:'wavespeed-ai/z-image/turbo-lora',extraParams:{custom_parameters:{enable_base64_output:true}}},{wavespeedKey:'fixture'});
    await vi.runAllTimersAsync();
    await vi.runAllTimersAsync();
    const result=await pending;
    expect(result.mediaUrl).toBe(`data:image/png;base64,${png}`);
    expect(savedOutputs).toEqual([`data:image/png;base64,${png}`]);
  });

  it('preserves a normal URL in WaveSpeed base64 mode and errors on unsupported bytes with the request and response', async () => {
    const upstreamBody={status:'completed',outputs:['https://cdn.example/image.png'],endpoint:'https://api.wavespeed.ai/api/v3/predictions/task-url/result',upstreamStatus:200};
    mockFetch.mockImplementation(async (input: URL | RequestInfo, init?: RequestInit) => {
      const u=String(input);const method=String(init?.method || 'GET').toUpperCase();
      if(u.includes('/api/model-schema')&&method==='GET')return jsonResponse({credentialRef:'wave-cred',inputSchema:{type:'object',properties:{prompt:{type:'string'},enable_base64_output:{type:'boolean'}}}});
      if(u.includes('/api/schema-provider/wavespeed/submit')&&method==='POST')return jsonResponse({taskId:'task-url',pollUrl:'/api/schema-provider/wavespeed/tasks/task-url',actualRequest:{endpoint:'https://api.wavespeed.ai/api/v3/example',parameters:{enable_base64_output:true}}});
      if(u.includes('/api/schema-provider/wavespeed/tasks/task-url')&&method==='GET')return jsonResponse(upstreamBody);
      if(u.includes('/api/schema-provider/wavespeed/save-result')&&method==='POST')return jsonResponse({historyItems:[]});
      return jsonResponse({error:`unexpected ${method} ${u}`},500);
    });
    const urlPending=driver.generate({prompt:'p',model:'wavespeed-ai/example'},{wavespeedKey:'fixture'});
    await vi.runAllTimersAsync();await vi.runAllTimersAsync();
    expect((await urlPending).mediaUrl).toBe('https://cdn.example/image.png');

    mockFetch.mockReset();clearSharedGet();beginSharedGetAction();
    const invalidBody={status:'completed',outputs:['YWJjZA=='],endpoint:'https://api.wavespeed.ai/api/v3/predictions/task-invalid/result',upstreamStatus:200};
    const actualRequest={endpoint:'https://api.wavespeed.ai/api/v3/example',parameters:{enable_base64_output:true}};
    mockFetch.mockImplementation(async (input: URL | RequestInfo, init?: RequestInit) => {
      const u=String(input);const method=String(init?.method || 'GET').toUpperCase();
      if(u.includes('/api/model-schema')&&method==='GET')return jsonResponse({credentialRef:'wave-cred',inputSchema:{type:'object',properties:{prompt:{type:'string'},enable_base64_output:{type:'boolean'}}}});
      if(u.includes('/api/schema-provider/wavespeed/submit')&&method==='POST')return jsonResponse({taskId:'task-invalid',pollUrl:'/api/schema-provider/wavespeed/tasks/task-invalid',actualRequest});
      if(u.includes('/api/schema-provider/wavespeed/tasks/task-invalid')&&method==='GET')return jsonResponse(invalidBody);
      return jsonResponse({error:`unexpected ${method} ${u}`},500);
    });
    const invalidPending=driver.generate({prompt:'p',model:'wavespeed-ai/example'},{wavespeedKey:'fixture'}).then(()=>null,error=>error);
    await vi.runAllTimersAsync();
    const error=await invalidPending;
    expect(error).toMatchObject({name:'SchemaProviderProtocolError',message:expect.stringContaining('not a supported PNG, JPEG, or WebP image signature')});
    expect(error.data).toMatchObject({errorSource:'upstream-protocol',endpoint:invalidBody.endpoint,rawResponse:invalidBody,actualRequest});
    expect(mockFetch.mock.calls.some(([url])=>String(url).includes('/save-result'))).toBe(false);
  });
});

describe('SchemaProviderDriver · Together schema GET failure never stops the POST', () => {
  beforeEach(() => { mockFetch.mockReset(); clearSharedGet(); beginSharedGetAction(); });
  afterEach(() => { vi.clearAllMocks(); clearSharedGet(); });
  it('GET /api/model-schema 403 (Cloudflare) → submit POST still sent with all filled params; upstream error verbatim', async () => {
    const CF = '<!DOCTYPE html><title>Attention Required! | Cloudflare</title>';
    let submitBody: any;
    mockFetch.mockImplementation(async (input: URL | RequestInfo, init?: RequestInit) => {
      const u = String(input); const method = String(init?.method || 'GET').toUpperCase();
      if (u.includes('/api/model-schema') && method === 'GET') return new Response(CF, { status: 403 });
      if (u.includes('/api/schema-provider/together/submit') && method === 'POST') {
        submitBody = JSON.parse(String(init?.body));
        return jsonResponse({ error: 'upstream says no', upstreamStatus: 402 }, 402);
      }
      throw new Error(`unexpected ${method} ${u}`);
    });
    const params = { model: 'black-forest-labs/FLUX.2-dev', prompt: 'p', seed: 42, steps: 28, width: 1024, height: 768, cfg: 3.5 } as NormalizedGenerateParams;
    await expect(new SchemaProviderDriver('together').generate(params, { togetherKey: 'k' })).rejects.toThrow(/upstream says no/);
    expect(submitBody).toMatchObject({ model: 'black-forest-labs/FLUX.2-dev', prompt: 'p', seed: 42, steps: 28, width: 1024, height: 768, cfg: 3.5 });
    expect(submitBody.schemaPrefetchFailure).toMatchObject({ status: 403 });
    expect(JSON.stringify(submitBody.schemaPrefetchFailure)).toContain('Attention Required');
  });
});

describe('SchemaProviderDriver · video submit flags', () => {
  beforeEach(() => { mockFetch.mockReset(); clearSharedGet(); beginSharedGetAction(); });
  afterEach(() => { vi.clearAllMocks(); clearSharedGet(); });

  it('sends isVideo true and executingNodeId on a video generate', async () => {
    let submitBody: any;
    mockFetch.mockImplementation(async (input: URL | RequestInfo, init?: RequestInit) => {
      const u = String(input); const method = String(init?.method || 'GET').toUpperCase();
      if (u.includes('/api/model-schema') && method === 'GET') return jsonResponse({ credentialRef: 'krea-cred', inputSchema: { type: 'object', properties: { prompt: { type: 'string' } } } });
      if (u.includes('/api/schema-provider/krea/submit') && method === 'POST') {
        submitBody = JSON.parse(String(init?.body));
        return jsonResponse({ error: 'API balance is separate', upstreamStatus: 402 }, 402);
      }
      throw new Error(`unexpected ${method} ${u}`);
    });
    await expect(new SchemaProviderDriver('krea').generate({
      model: 'video/kling/kling-2.5',
      prompt: 'a lantern',
      isVideo: true,
      workflowSnapshot: { executingNodeId: 'node-a', format: 'comfycanvas' },
    } as NormalizedGenerateParams, { kreaKey: 'k' })).rejects.toThrow(/API balance is separate/);
    expect(String(mockFetch.mock.calls.find(([url]) => String(url).includes('/api/schema-provider/'))?.[0])).toContain('/api/schema-provider/krea/submit');
    expect(submitBody).toMatchObject({
      isVideo: true,
      workflowSnapshot: { executingNodeId: 'node-a' },
    });
    expect(String(mockFetch.mock.calls.find(([url]) => String(url).includes('/api/model-schema'))?.[0])).toContain('isVideo=true');
  });

  it('does not label VIDEO from isVideo when the completed artifact is an image URL', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
    mockFetch.mockImplementation(async (input: URL | RequestInfo, init?: RequestInit) => {
      const u = String(input); const method = String(init?.method || 'GET').toUpperCase();
      if (u.includes('/api/model-schema') && method === 'GET') return jsonResponse({ credentialRef: 'sogni-cred', inputSchema: { type: 'object' }, schemaStatus: 'hosted-tool:generate_video' });
      if (u.includes('/api/schema-provider/sogni/submit') && method === 'POST') {
        return jsonResponse({ taskId: 'wf_img', pollUrl: '/api/schema-provider/sogni/tasks/wf_img', actualRequest: {} });
      }
      if (u.includes('/api/schema-provider/sogni/tasks/wf_img') && method === 'GET') {
        return jsonResponse({ status: 'completed', outputs: ['https://cdn.example/frame.png'] });
      }
      if (u.includes('/api/schema-provider/sogni/save-result') && method === 'POST') {
        return jsonResponse({ historyItems: [{ url: 'https://cdn.example/frame.png' }] });
      }
      throw new Error(`unexpected ${method} ${u}`);
    });
    const pending = new SchemaProviderDriver('sogni').generate({
      model: 'ltx25', prompt: 'boat', isVideo: true,
    } as NormalizedGenerateParams, { sogniKey: 'k' });
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result.mediaType).toBe('image');
    } finally {
      vi.useRealTimers();
    }
  });
});
