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


describe('videoGenerateRoute OpenWorks: truthful input mapping (M89)', () => {
  const PROMPT = 'a lone boat drifting on a misty lake at dawn, cinematic wide shot';
  const NEG = 'blurry, watermark, low quality';
  const TOOL = {
    name: 'text2video_wan27',
    inputs: [
      { type: 'STRING', description: 'prompt' },
      { type: 'STRING', description: 'target video aspect ratio: only "16:9", "4:3", "1:1", "9:16", "3:4" supported' },
      { type: 'STRING', description: 'target video size: only "720P", "1080P" supported' },
      { type: 'STRING', description: 'The duration of the target video ranges from "2" to "15" seconds.' },
    ],
  };

  function run(body: Record<string, unknown>, depsPatch: Partial<VideoGenerateRouteDeps> = {}) {
    const seen: Array<{ url: string; options: any }> = [];
    const upstream = vi.fn(async (_meta: any, url: string, options: any) => {
      seen.push({ url, options });
      if (url.endsWith('/tool/list')) return new Response(JSON.stringify({ code: '0', data: { tools: [TOOL] } }), { status: 200 });
      return new Response('{"code":"1001","message":"credits not enough"}', { status: 402 });
    });
    const deps = { ...createDeps(upstream), ...depsPatch };
    return callRoute(deps, { provider: 'tensorart', model: 'text2video_wan27', prompt: PROMPT, ...body }).then((res) => ({ res, seen, deps }));
  }

  it('slots no canvas field matches stay empty — the positive prompt is never copied into them', async () => {
    const { seen } = await run({ aspect_ratio: '16:9' });
    const wire = JSON.parse(seen.find((s) => s.url.endsWith('/task'))!.options.body);
    expect(wire.toolName).toBe('text2video_wan27');
    expect(wire.inputs.slice(0, 4)).toEqual([
      { type: 'STRING', value: PROMPT },
      { type: 'STRING' },
      { type: 'STRING' },
      { type: 'STRING' },
    ]);
    expect(wire.inputs.filter((i: any) => i.value === PROMPT)).toHaveLength(1);
  });

  it('seed/steps/cfg/negative_prompt/loras/custom_parameters reach the wire as named inputs and the history record', async () => {
    const loras = [{ name: '969483275569466663', strength: 0.8 }];
    const { res, seen, deps } = await run({ seed: 42, steps: 20, cfg: 7, negative_prompt: NEG, loras, custom_parameters: { 'target video size: only "720P", "1080P" supported': '720P' } });
    const wire = JSON.parse(seen.find((s) => s.url.endsWith('/task'))!.options.body);
    const named = (n: string) => wire.inputs.find((i: any) => i.name === n)?.value;
    expect(wire.inputs[2]).toEqual({ type: 'STRING', value: '720P' });
    expect(named('seed')).toBe(42);
    expect(named('steps')).toBe(20);
    expect(named('cfg')).toBe(7);
    expect(named('negative_prompt')).toBe(NEG);
    expect(named('lora_id')).toBe('969483275569466663');
    expect(named('lora_weight')).toBe(0.8);
    expect(res.statusCode).toBe(402);
    expect(res.data.actualRequest.parameters).toMatchObject({ toolName: 'text2video_wan27', seed: 42, steps: 20, cfg: 7, negative_prompt: NEG, loras });
    expect(res.data.actualRequest.mapping.some((m: any) => m.from === 'seed' && m.sent)).toBe(true);
    expect(deps.recordHistoryItem).not.toHaveBeenCalled();
  });

  it('on success the history item carries the real seed/steps/cfg/negative/loras instead of null', async () => {
    const queued = new Response(JSON.stringify({ code: '0', data: { task: { id: 'task-1' } } }), { status: 200 });
    const finished = new Response(JSON.stringify({ code: '0', data: { tasks: [{ status: 'FINISH', outputs: [{ value: 'https://cdn.invalid/v.mp4' }] }] } }), { status: 200 });
    const upstream = vi.fn(async (_meta: any, url: string) => {
      if (url.endsWith('/tool/list')) return new Response(JSON.stringify({ code: '0', data: { tools: [TOOL] } }), { status: 200 });
      return url.endsWith('/task') ? queued.clone() : finished.clone();
    });
    const deps = { ...createDeps(upstream), sleep: async () => {} } as VideoGenerateRouteDeps;
    const loras = [{ name: '969483275569466663', strength: 0.8 }];
    const res = await callRoute(deps, { provider: 'tensorart', model: 'text2video_wan27', prompt: PROMPT, seed: 42, steps: 20, cfg: 7, negative_prompt: NEG, loras });
    expect(res.statusCode).toBe(200);
    expect(deps.recordHistoryItem).toHaveBeenCalledWith(expect.objectContaining({ seed: 42, steps: 20, cfg: 7, negativePrompt: NEG, loras, model: 'text2video_wan27' }));
    expect(res.data.actualRequest.parameters.toolName).toBe('text2video_wan27');
  });
});

describe('videoGenerateRoute TAMS: submit origin comes from the injected resolver', () => {
  const body = { provider: 'tensorart', model: '834845675863700019', prompt: 'A cheerful 3D girl with long pink hair walking through a dusk city', width: 480, height: 832, fps: 16, totalFrames: 49, seed: -1, count: 1 };
  const tamsKey = '38b4e85f-f6e2-4f3b-b2f5-8d9e7a6c5b4a';
  const call = async (deps: VideoGenerateRouteDeps) => {
    const res = mockRes();
    await handleVideoGenerate(deps)({ body, headers: { 'x-tensorart-key': tamsKey }, path: '/api/video/generate' } as any, res);
    return res;
  };

  it('POSTs /v1/jobs to the configured origin (trailing slash trimmed)', async () => {
    const upstream = vi.fn(async () => new Response('{"code":"bad"}', { status: 400 }));
    const res = await call({ ...createDeps(upstream), resolveTamsModelApiOrigin: () => 'https://tams.example.invalid/' });
    expect(upstream.mock.calls[0][1]).toBe('https://tams.example.invalid/v1/jobs');
    expect(res.data.exactEndpointCalled).toBe('https://tams.example.invalid/v1/jobs');
  });

  it('without the resolver: local 500, nothing sent, no hardcoded default origin', async () => {
    const upstream = vi.fn(async () => new Response('unexpected', { status: 200 }));
    const res = await call(createDeps(upstream));
    expect(upstream).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(500);
    expect(res.data.errorSource).toBe('local');
    expect(res.data.error).toContain('resolveTamsModelApiOrigin');
  });
});
