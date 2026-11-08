import { describe, it, expect, vi } from 'vitest';
import { handleVideoGenerate, type VideoGenerateRouteDeps } from './videoGenerateRoute.ts';

function createDeps(upstreamFetch: any): VideoGenerateRouteDeps {
  return {
    isProvided: (v: any) => v !== undefined && v !== null && v !== '',
    forwardUnmappedFields: () => false,
    normalizeFalEndpoint: (m: string) => m,
    resolveProviderAuth: () => ({ apiKey: 'mock-key', baseUrl: 'https://mock.invalid/v1' }),
    upstreamFetch,
    keyPoolManager: { getNextKey: () => 'ak_tensor_test', recordResult: () => {} },
    recordHistoryItem: vi.fn().mockResolvedValue({ id: 'hist-1' }),
    requireDurableHistoryMediaUrl: vi.fn().mockResolvedValue({ ok: true, dataUrl: 'data:video/mp4;base64,AAAA' }),
    generationContext: { getStore: () => undefined },
  } as VideoGenerateRouteDeps;
}

function mockRes(): any {
  const res: any = { headersSent: false, writableEnded: false, destroyed: false, on() { return this; }, off() { return this; }, once() { return this; }, setTimeout() {}, statusCode: 200, data: undefined };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: any) => { res.data = body; return res; };
  return res;
}

async function callRoute(deps: VideoGenerateRouteDeps, body: Record<string, unknown>) {
  const res = mockRes();
  await handleVideoGenerate(deps)({
    body,
    headers: { 'x-tensorart-key': 'ak_tensor_test' },
    path: '/api/video/generate',
  } as any, res);
  return res;
}

describe('videoGenerateRoute OpenWorks: no silent default model/tool', () => {
  it.each([
    ['model omitted', {}],
    ['model empty string', { model: '' }],
    ['model whitespace only', { model: '   ' }],
    ['model null', { model: null }],
  ])('%s -> 400 local error, upstream never called', async (_label, extra) => {
    const upstream = vi.fn(async () => new Response('unexpected', { status: 500 }));
    const res = await callRoute(createDeps(upstream), { provider: 'tensorart', prompt: 'a lone boat drifting on a misty lake at dawn, cinematic wide shot', ...extra });
    expect(upstream).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.data.errorSource).toBe('local');
    expect(res.data.provider).toBe('tensorart');
    expect(res.data.error).toContain('请先选择视频模型');
    expect(res.data.error).toContain('不会代入默认模型');
  });

  it('provided OpenWorks tool name is sent exactly as given (tool/list and /task)', async () => {
    const seen: Array<{ url: string; meta: any; options: any }> = [];
    const upstream = vi.fn(async (meta: any, url: string, options: any) => {
      seen.push({ url, meta, options });
      if (url.endsWith('/tool/list')) {
        return new Response(JSON.stringify({ code: '0', data: { tools: [{ name: 'image2video_wan27', inputs: [{ type: 'STRING', description: 'prompt' }] }] } }), { status: 200 });
      }
      return new Response('{"code":"1001","message":"credits not enough"}', { status: 402 });
    });
    const res = await callRoute(createDeps(upstream), { provider: 'tensorart', model: 'image2video_wan27', prompt: 'a lone boat drifting on a misty lake at dawn' });
    expect(seen.map((s) => s.url)).toEqual([
      'https://openapi.tensor.art/openworks/v1/tool/list',
      'https://openapi.tensor.art/openworks/v1/task',
    ]);
    expect(seen.every((s) => s.meta.model === 'image2video_wan27')).toBe(true);
    const wire = JSON.parse(seen[1].options.body);
    expect(wire.toolName).toBe('image2video_wan27');
    expect(wire.toolName).not.toBe('text2video_wan27');
    expect(res.statusCode).toBe(402);
    expect(res.data.rawResponse).toBe('{"code":"1001","message":"credits not enough"}');
    expect(res.data.errorSource).toBe('upstream');
  });
});

describe('videoGenerateRoute OpenWorks: requested tool missing from upstream /tool/list', () => {
  const PROMPT = 'a lone boat drifting on a misty lake at dawn, cinematic wide shot';
  const LISTED_TOOLS = [
    { name: 'text2video_wan27', inputs: [{ type: 'STRING', description: 'prompt' }] },
    { name: 'image2video_wan27', inputs: [{ type: 'STRING', description: 'prompt' }, { type: 'FILE', description: 'first frame image' }] },
  ];

  function createUpstream(tools: any[]) {
    const seen: Array<{ url: string; meta: any; options: any }> = [];
    const upstream = vi.fn(async (meta: any, url: string, options: any) => {
      seen.push({ url, meta, options });
      if (url.endsWith('/tool/list')) return new Response(JSON.stringify({ code: '0', data: { tools } }), { status: 200 });
      if (url.endsWith('/task')) return new Response('{"code":"1001","message":"credits not enough"}', { status: 402 });
      return new Response('unexpected', { status: 500 });
    });
    return { upstream, seen };
  }

  it.each([
    ['inputs omitted', {}],
    ['inputs empty array', { inputs: [] }],
    ['inputs not an array', { inputs: 'oops' }],
  ])('tool missing + %s -> local 400 naming the requested tool and the returned tool names, /task never called', async (_label, extra) => {
    const { upstream, seen } = createUpstream(LISTED_TOOLS);
    const res = await callRoute(createDeps(upstream), { provider: 'tensorart', model: 'ghost_tool_v9', prompt: PROMPT, ...extra });
    expect(seen.map((s) => s.url)).toEqual(['https://openapi.tensor.art/openworks/v1/tool/list']);
    expect(seen.some((s) => s.url.endsWith('/task'))).toBe(false);
    expect(res.statusCode).toBe(400);
    expect(res.data.errorSource).toBe('local');
    expect(res.data.provider).toBe('tensorart');
    expect(res.data.requestedTool).toBe('ghost_tool_v9');
    expect(res.data.availableTools).toEqual(['text2video_wan27', 'image2video_wan27']);
    expect(res.data.exactEndpointCalled).toBe('https://openapi.tensor.art/openworks/v1/tool/list');
    expect(res.data.error).toContain('ghost_tool_v9');
    expect(res.data.error).toContain('text2video_wan27');
    expect(res.data.error).toContain('image2video_wan27');
    expect(res.data.error).toContain('/task 未发出');
    expect(res.data.rawResponse).toBeUndefined();
  });

  it('tool missing + upstream returned an empty tool list -> local 400 stating the list was empty, /task never called', async () => {
    const { upstream, seen } = createUpstream([]);
    const res = await callRoute(createDeps(upstream), { provider: 'tensorart', model: 'ghost_tool_v9', prompt: PROMPT });
    expect(seen.some((s) => s.url.endsWith('/task'))).toBe(false);
    expect(res.statusCode).toBe(400);
    expect(res.data.errorSource).toBe('local');
    expect(res.data.availableTools).toEqual([]);
    expect(res.data.error).toContain('ghost_tool_v9');
    expect(res.data.error).toContain('空列表');
  });

  it('tool missing + explicit inputs -> /task is still called with exactly those inputs, upstream decides', async () => {
    const { upstream, seen } = createUpstream(LISTED_TOOLS);
    const explicitInputs = [
      { type: 'STRING', value: PROMPT },
      { type: 'INTEGER', value: 720 },
      { type: 'OBJECT', value: { style: 'cinematic' } },
    ];
    const res = await callRoute(createDeps(upstream), { provider: 'tensorart', model: 'ghost_tool_v9', prompt: PROMPT, inputs: explicitInputs });
    expect(seen.map((s) => s.url)).toEqual([
      'https://openapi.tensor.art/openworks/v1/tool/list',
      'https://openapi.tensor.art/openworks/v1/task',
    ]);
    const wire = JSON.parse(seen[1].options.body);
    expect(wire.toolName).toBe('ghost_tool_v9');
    expect(wire.inputs).toEqual(explicitInputs);
    expect(res.statusCode).toBe(402);
    expect(res.data.errorSource).toBe('upstream');
    expect(res.data.rawResponse).toBe('{"code":"1001","message":"credits not enough"}');
  });

  it('tool present -> unchanged: inputs built from the listed tool definition and /task called', async () => {
    const { upstream, seen } = createUpstream(LISTED_TOOLS);
    const res = await callRoute(createDeps(upstream), { provider: 'tensorart', model: 'text2video_wan27', prompt: PROMPT });
    expect(seen.map((s) => s.url)).toEqual([
      'https://openapi.tensor.art/openworks/v1/tool/list',
      'https://openapi.tensor.art/openworks/v1/task',
    ]);
    const wire = JSON.parse(seen[1].options.body);
    expect(wire).toEqual({ toolName: 'text2video_wan27', inputs: [{ type: 'STRING', value: PROMPT }] });
    expect(res.statusCode).toBe(402);
    expect(res.data.errorSource).toBe('upstream');
  });

  it('tool present + explicit inputs of matching length -> sent as given', async () => {
    const { upstream, seen } = createUpstream(LISTED_TOOLS);
    const explicitInputs = [{ type: 'STRING', value: 'a different, user-edited prompt about a quiet harbor at dusk' }];
    await callRoute(createDeps(upstream), { provider: 'tensorart', model: 'text2video_wan27', prompt: PROMPT, inputs: explicitInputs });
    const wire = JSON.parse(seen[1].options.body);
    expect(wire.inputs).toEqual(explicitInputs);
  });
});

