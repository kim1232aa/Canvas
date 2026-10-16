import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { VideoDriver } from './VideoDriver';
import { NormalizedGenerateParams } from '../types';

describe('VideoDriver (F3/F4) 参数转发与错误处理', () => {
  it('joins the browser contract to the server mapper without leaking Fal wire names into site JSON', async () => {
    const {buildFalVideoRequest} = await import('../../server/falVideoContract');
    let upstream: Record<string, unknown> = {};
    globalThis.fetch = vi.fn(async (url, init) => {
      expect(url).toBe('/api/video/generate');
      const body=JSON.parse(String(init?.body));
      expect(body.image_url).toBe('https://example.test/reference.png');
      expect(body).not.toHaveProperty('start_image_url');
      upstream=buildFalVideoRequest(body.model,body).payload;
      return new Response(JSON.stringify({videoUrl:'https://example.test/result.mp4'}));
    });
    await new VideoDriver().generate({prompt:'orbit',model:'fal-ai/kling-video/v3/standard/image-to-video',targetProvider:'fal',image_url:'https://example.test/reference.png',videoDuration:12,extraParams:{custom_parameters:{generate_audio:false,cfg_scale:0}}},{});
    expect(upstream).toMatchObject({start_image_url:'https://example.test/reference.png',duration:'12',generate_audio:false,cfg_scale:0});
    expect(upstream).not.toHaveProperty('image_url');
    expect(upstream).not.toHaveProperty('aspect_ratio');
  });
  it('spatial video framework reaches the registry and site JSON with its explicit upstream provider', async()=>{
    const {spatialRequestParameters}=await import('../../utils/frontendParameters');
    const {EngineRegistry}=await import('../EngineRegistry');
    const bodies:Record<string,unknown>[]=[];
    globalThis.fetch=vi.fn(async (_url,init)=>{bodies.push(JSON.parse(String(init?.body)));return new Response(JSON.stringify({videoUrl:'https://example.test/out.mp4'}));});
    const params=spatialRequestParameters({id:'f',title:'video',pos:{x:0,y:0},width:400,height:400,prompt:'orbit',negativePrompt:'',status:'idle',createdAt:0,referenceImageUrl:'https://example.test/ref.png',imageUrl:'https://example.test/old.png',params:{targetProvider:'video',videoProvider:'fal',checkpoint:'fal-ai/wan/v2.7/image-to-video',width:1024,height:1024,batchSize:1,denoise:0,seed:0,seedControl:'fixed',loras:[],resolution:'720p',customParameters:'{"enable_prompt_expansion":false}'}});
    await EngineRegistry.generate('video',params,{});
    expect(bodies[0]).toMatchObject({provider:'fal',image_url:'https://example.test/ref.png',seed:0,resolution:'720p',custom_parameters:{enable_prompt_expansion:false}});
    expect(bodies[0]).not.toHaveProperty('aspect_ratio');expect(bodies[0]).not.toHaveProperty('duration');
  });
  const driver = new VideoDriver();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('Kling V3 图生视频发送本站 image_url 契约，并拒绝文生视频端点带图', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ videoUrl: 'https://cdn.fal.media/out.mp4', model: 'fal-ai/kling-video/v3/standard/image-to-video' }), { status: 200 }));
  globalThis.fetch = fetchMock;
  await new VideoDriver().generate({
    prompt: 'orbit',
    model: 'fal-ai/kling-video/v3/standard/image-to-video',
    targetProvider: 'fal',
    image_url: 'https://example.com/start.png',
    videoDuration: 5,
  }, { falKey: 'k' });
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(body.image_url).toBe('https://example.com/start.png');
  expect(body).not.toHaveProperty('start_image_url');
  await expect(new VideoDriver().generate({
    prompt: 'orbit',
    model: 'fal-ai/kling-video/v3/standard/text-to-video',
    targetProvider: 'fal',
    image_url: 'https://example.com/start.png',
  }, {})).rejects.toThrow('这个端点不支持参考图');
});

it('F3: 完整转发 fps, negative_prompt, steps, cfg, loras 到 /api/video/generate', async () => {
    let interceptedBody: any = null;
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: any) => {
      interceptedBody = JSON.parse(init.body);
      return new Response(JSON.stringify({
          videoUrl: 'https://cdn.fal.media/output.mp4',
          provider: 'Fal.ai (fal-ai/wan-t2v)',
          model: 'fal-ai/wan-t2v',
          seed: 42,
          historyItem: { seed: 42 },
        }), { status: 200 });
    });
    globalThis.fetch = fetchMock;

    const params: NormalizedGenerateParams = {
      prompt: 'a cinematic soaring drone shot',
      negative_prompt: 'shaky camera, blurry, low resolution',
      model: 'fal-ai/wan-t2v',
      targetProvider: 'fal',
      isVideo: true,
      videoDuration: 5,
      videoFps: 24,
      aspectRatio: '16:9',
      steps: 30,
      cfg: 6.0,
      seed: 42,
      loras: [
        {
          name: 'wan-motion-lora',
          path: 'https://example.com/lora.safetensors',
          strength: 0.8,
        },
      ],
    };

    const res = await driver.generate(params, { falKey: 'test-key' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/video/generate');
    expect(init.headers['x-fal-key']).toBe('test-key');

    expect(interceptedBody.prompt).toBe('a cinematic soaring drone shot');
    expect(interceptedBody.negative_prompt).toBe('shaky camera, blurry, low resolution');
    expect(interceptedBody.model).toBe('fal-ai/wan-t2v');
    expect(interceptedBody.provider).toBe('fal');
    expect(interceptedBody.duration).toBe(5);
    expect(interceptedBody.fps).toBe(24);
    expect(interceptedBody.aspect_ratio).toBe('16:9');
    expect(interceptedBody.steps).toBe(30);
    expect(interceptedBody.cfg).toBe(6.0);
    expect(interceptedBody.seed).toBe(42);
    expect(interceptedBody.loras[0].name).toBe('wan-motion-lora');
    expect(interceptedBody.loras[0].path).toBe('https://example.com/lora.safetensors');
    expect(interceptedBody.loras[0].strength).toBe(0.8);

    expect(res.mediaUrl).toBe('https://cdn.fal.media/output.mp4');
    expect(res.seed).toBe(42);
  });

  it('F4: 空 provider 抛出明确异常，绝不静默回退 Fal', async () => {
    const params: NormalizedGenerateParams = {
      prompt: 'test prompt',
      model: 'fal-ai/wan-t2v',
      targetProvider: '',
      provider: '',
      isVideo: true,
    };

    await expect(driver.generate(params, {})).rejects.toThrow(/视频服务商 \(Provider\) 未设置，拒绝回退到 Fal/);
  });

  it('Grok 兼容中转不透传 seed', async () => {
    let interceptedBody: any = null;
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: any) => {
      interceptedBody = JSON.parse(init.body);
      return new Response(JSON.stringify({
          videoUrl: 'https://example.com/grok.mp4',
          provider: 'Grok 兼容中转',
          model: 'grok-imagine-video',
        }), { status: 200 });
    });
    globalThis.fetch = fetchMock;

    const params: NormalizedGenerateParams = {
      prompt: 'a futuristic robot walking',
      model: 'grok-imagine-video',
      targetProvider: 'grok_compat',
      isVideo: true,
      seed: 12345,
    };

    await driver.generate(params, { grokCompatKey: 'test-key' });
    expect(interceptedBody.seed).toBeUndefined();
  });

  it('零虚假成功: 上游报错原样透传状态码与错误信息', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        error: '该服务商不支持: loras（Fal.ai Video fal-ai/kling-video/v1/standard/text-to-video）',
      }), { status: 400 }));
    globalThis.fetch = fetchMock;

    const params: NormalizedGenerateParams = {
      prompt: 'test',
      model: 'fal-ai/kling-video/v1/standard/text-to-video',
      targetProvider: 'fal',
      isVideo: true,
    };

    await expect(driver.generate(params, { falKey: 'test-key' })).rejects.toThrow(
      /该服务商不支持: loras[\s\S]*HTTP 400/
    );
  });

  it('modelscope_ai sends x-modelscope-ai-token + site=ai and refuses CN token substitute', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'ModelScope API-Inference 当前没有已接入的视频生成接口',
    }), { status: 400 }));
    globalThis.fetch = fetchMock;

    await expect(driver.generate({
      prompt: 'orbit',
      model: 'Wan-AI/Wan2.1-T2V-1.3B',
      targetProvider: 'modelscope_ai',
      isVideo: true,
    }, { modelscopeToken: 'cn-only-token' })).rejects.toThrow(/x-modelscope-ai-token/);

    await expect(driver.generate({
      prompt: 'orbit',
      model: 'Wan-AI/Wan2.1-T2V-1.3B',
      targetProvider: 'modelscope_ai',
      isVideo: true,
    }, { modelscopeAiToken: 'ai-token-xyz' })).rejects.toThrow(/HTTP 400/);

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['x-modelscope-ai-token']).toBe('ai-token-xyz');
    expect(headers['x-modelscope-site']).toBe('ai');
    expect(headers['x-modelscope-token']).toBeUndefined();
  });

  it('modelscope CN sends x-modelscope-token + site=cn and refuses AI token substitute', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'ModelScope API-Inference 当前没有已接入的视频生成接口',
    }), { status: 400 }));
    globalThis.fetch = fetchMock;

    await expect(driver.generate({
      prompt: 'orbit',
      model: 'Wan-AI/Wan2.1-T2V-1.3B',
      targetProvider: 'modelscope',
      isVideo: true,
    }, { modelscopeAiToken: 'ai-only' })).rejects.toThrow(/x-modelscope-token/);

    await expect(driver.generate({
      prompt: 'orbit',
      model: 'Wan-AI/Wan2.1-T2V-1.3B',
      targetProvider: 'modelscope',
      isVideo: true,
    }, { modelscopeToken: 'cn-token-xyz' })).rejects.toThrow(/HTTP 400/);

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['x-modelscope-token']).toBe('cn-token-xyz');
    expect(headers['x-modelscope-site']).toBe('cn');
    expect(headers['x-modelscope-ai-token']).toBeUndefined();
  });

});
