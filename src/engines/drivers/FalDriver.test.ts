import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { FalDriver, mapFalServerLoras } from './FalDriver';
import { NormalizedGenerateParams } from '../types';

describe('FalDriver LoRA 校验与错误处理', () => {
  it('preserves a resource identifier without fabricating a path from its display label', async () => {
    const bodies: any[]=[];
    globalThis.fetch=vi.fn(async (_url,init)=>{bodies.push(JSON.parse(String(init?.body)));return new Response(JSON.stringify({imageUrl:'https://example.test/output.png'}));});
    await new FalDriver().generate({prompt:'test',model:'fal-ai/flux-lora',loras:[{name:'Display label',civitaiId:'123',strength:0}]},{});
    expect(bodies[0].loras[0]).toEqual({civitaiId:'123',name:'Display label',scale:0});
  });
  it('preserves clip-only LoRA without local throw; does not fabricate scale and lets server/upstream decide', async () => {
    let interceptedBody: any = null;
    const fetchMock = vi.fn(async (_url, init) => {
      interceptedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ imageUrl: 'https://example.test/output.png' }));
    });
    globalThis.fetch = fetchMock;

    await new FalDriver().generate({
      prompt: 'test',
      model: 'fal-ai/flux-lora',
      loras: [{ name: 'style', path: 'https://example.com/style.safetensors', clipStrength: 0.7 }],
    }, {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(interceptedBody.loras[0].path).toBe('https://example.com/style.safetensors');
    expect(interceptedBody.loras[0].scale).toBeUndefined();
  });

  const driver = new FalDriver();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fal-ai/flux/schnell + LoRA POSTs /api/fal/generate and surfaces HTTP 400 from the server', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        error: '该服务商不支持（Fal.ai 端点 fal-ai/flux/schnell 的官方 schema 无 loras 字段）',
        unsupported: ['loras'],
        endpoint: 'fal-ai/flux/schnell',
      }), { status: 400 }));
    globalThis.fetch = fetchMock;

    const params: NormalizedGenerateParams = {
      prompt: 'a futuristic astronaut',
      model: 'fal-ai/flux/schnell',
      loras: [
        {
          name: 'koda',
          path: 'https://civitai.com/api/download/models/12345',
          strength: 1.0,
          modelStrength: 1.0,
        },
      ],
    };

    await expect(driver.generate(params, { falKey: 'test-key' })).rejects.toThrow(
      /HTTP 400[\s\S]*该服务商不支持/
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/fal/generate');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('fal-ai/flux/schnell');
    expect(body.loras).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'https://civitai.com/api/download/models/12345' })])
    );
  });

  it('若到达服务端并返回 400，前端必须暴露 HTTP 状态码与 reason，不许吞错', async () => {
    // 模拟服务端返回 400
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        error: '该服务商不支持（Fal.ai 端点 fal-ai/flux/schnell 的官方 schema 无 loras 字段）',
        unsupported: ['loras'],
        endpoint: 'fal-ai/flux/schnell',
      }), { status: 400 }));

    // 直接调用 executeGenerate（绕过 BaseEngineDriver 前置拦截），模拟穿透至服务端后的场景
    const params: NormalizedGenerateParams = {
      prompt: 'a futuristic astronaut',
      model: 'fal-ai/flux-lora', // flux-lora 支持 LoRA，可通过前置拦截
      loras: [
        {
          name: 'koda',
          path: 'https://civitai.com/api/download/models/12345',
          strength: 1.0,
        },
      ],
    };

    await expect(driver.generate(params, { falKey: 'test-key' })).rejects.toThrow(
      /HTTP 400[\s\S]*该服务商不支持/
    );
  });

  it('支持 LoRA 的端点（如 fal-ai/flux-lora）正常发起请求', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        imageUrl: 'https://fal.media/files/test.png',
        model: 'fal-ai/flux-lora',
        seed: 42,
      }), { status: 200 }));

    const params: NormalizedGenerateParams = {
      prompt: 'a test image',
      model: 'fal-ai/flux-lora',
      loras: [
        {
          name: 'test-lora',
          path: 'https://example.com/lora.safetensors',
          strength: 0.8,
        },
      ],
    };

    const res = await driver.generate(params, { falKey: 'test-key' });
    expect(res.mediaUrl).toBe('https://fal.media/files/test.png');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('Fal video forwards width, height, denoise, sampler_name, scheduler (including 0) to /api/video/generate', async () => {
    let interceptedBody: any = null;
    globalThis.fetch = vi.fn(async (url, init) => {
      expect(url).toBe('/api/video/generate');
      interceptedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ videoUrl: 'https://fal.media/vid.mp4', seed: 0 }), { status: 200 });
    });

    await new FalDriver().generate({
      model: 'fal-ai/wan-t2v',
      prompt: 'a running cheetah',
      isVideo: true,
      videoDuration: 5,
      width: 0,
      height: 0,
      denoise: 0,
      sampler_name: 'euler',
      scheduler: 'normal',
      seed: 0,
    }, { falKey: 'test-key' });

    expect(interceptedBody.width).toBe(0);
    expect(interceptedBody.height).toBe(0);
    expect(interceptedBody.denoise).toBe(0);
    expect(interceptedBody.sampler_name).toBe('euler');
    expect(interceptedBody.scheduler).toBe('normal');
    expect(interceptedBody.seed).toBe(0);
  });

  it('Fal image preserves width: 0 and height: 0 in image_size via isProvided', async () => {
    let interceptedBody: any = null;
    globalThis.fetch = vi.fn(async (url, init) => {
      expect(url).toBe('/api/fal/generate');
      interceptedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ imageUrl: 'https://fal.media/img.png', seed: 0 }), { status: 200 });
    });

    await new FalDriver().generate({
      model: 'fal-ai/flux/dev',
      prompt: 'zero dims',
      width: 0,
      height: 0,
    }, { falKey: 'test-key' });

    expect(interceptedBody.image_size).toEqual({ width: 0, height: 0 });
    expect(interceptedBody.width).toBe(0);
    expect(interceptedBody.height).toBe(0);
  });

  it('describes current Fal families instead of the legacy Wan 2.1 copy', () => {
    expect(new FalDriver().description).toContain('Z-Image Turbo');
    expect(new FalDriver().description).toContain('Krea 2');
    expect(new FalDriver().description).toContain('Wan 2.2');
    expect(new FalDriver().description).not.toContain('Wan 2.1');
    expect(new FalDriver().description).not.toContain('FLUX.1 全系列');
  });
});

describe('mapFalServerLoras live schema item properties', () => {
  it('copies properties declared by the live LoRA item schema and leaves undeclared extras off the wire', () => {
    const { wireLoras, unmappedLoraFields } = mapFalServerLoras([
      {
        path: 'https://example.test/wan.safetensors',
        scale: 0.4,
        weight_name: 'wan.safetensors',
        transformer: 'high',
        trigger_word: 'wanstyle',
        privateNote: 'do not send',
      },
    ], {
      path: { type: 'string' },
      scale: { type: 'number' },
      weight_name: { type: 'string' },
      transformer: { type: 'string', enum: ['high', 'low'] },
      trigger_word: { type: 'string' },
    });
    expect(wireLoras[0]).toEqual({
      path: 'https://example.test/wan.safetensors',
      scale: 0.4,
      weight_name: 'wan.safetensors',
      transformer: 'high',
      trigger_word: 'wanstyle',
    });
    expect(unmappedLoraFields).toEqual([]);
  });

  it('sends clipStrength under the declared clip key instead of recording it as unmapped', () => {
    const { wireLoras, unmappedLoraFields } = mapFalServerLoras([
      { path: 'https://example.test/clip.safetensors', clipStrength: 0.6 },
    ], { path: { type: 'string' }, clip_scale: { type: 'number' } });
    expect(wireLoras[0]).toEqual({ path: 'https://example.test/clip.safetensors', clip_scale: 0.6 });
    expect(unmappedLoraFields).toEqual([]);
  });

  it('still records clipStrength as unmapped when the live item schema has no CLIP property', () => {
    const { wireLoras, unmappedLoraFields } = mapFalServerLoras([
      { path: 'https://example.test/style.safetensors', clipStrength: 0.7, weight_name: 'ignored-without-schema' },
    ]);
    expect(wireLoras[0]).toEqual({ path: 'https://example.test/style.safetensors' });
    expect(unmappedLoraFields).toEqual([expect.objectContaining({ field: 'clipStrength', value: 0.7 })]);
  });
});

describe('FalDriver batchSize', () => {
  it('forwards params.batchSize as num_images and omits it when unset or 0', async () => {
    const bodies: any[] = [];
    globalThis.fetch = vi.fn(async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ imageUrl: 'https://example.test/o.png' })); });
    const driver = new FalDriver();
    await driver.generate({ prompt: 'a lighthouse at dusk, oil painting', model: 'fal-ai/flux/dev', batchSize: 4 }, {});
    await driver.generate({ prompt: 'a lighthouse at dusk, oil painting', model: 'fal-ai/flux/dev' }, {});
    await driver.generate({ prompt: 'a lighthouse at dusk, oil painting', model: 'fal-ai/flux/dev', batchSize: 0 }, {});
    expect(bodies[0].num_images).toBe(4);
    expect(bodies[1]).not.toHaveProperty('num_images');
    expect(bodies[2]).not.toHaveProperty('num_images');
  });
});
