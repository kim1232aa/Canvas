import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TensorArtDriver } from './TensorArtDriver';

vi.mock('../../services/executionTrace', () => ({ tracedFetch: vi.fn() }));
import { tracedFetch } from '../../services/executionTrace';

describe('TensorArt model driver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates model is required before sending request', async () => {
    const driver = new TensorArtDriver();
    await expect(
      driver.generate({ prompt: 'test' } as any, {})
    ).rejects.toThrow('模型为必填项');
    expect(tracedFetch).not.toHaveBeenCalled();
  });

  it('forwards full parameters and LoRAs to /api/tensorart/generate', async () => {
    const driver = new TensorArtDriver();
    expect(driver.id).toBe('tensorart');

    vi.mocked(tracedFetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        mediaUrl: 'https://example.com/test.png',
        provider: 'Tensor.Art (模型 API)',
        model: '613045163490732233',
        seed: 123456,
      }),
    } as any);

    const result = await driver.generate(
      {
        model: '613045163490732233',
        prompt: '1girl, anime',
        negative_prompt: 'low quality',
        width: 512,
        height: 768,
        steps: 25,
        cfg: 7,
        seed: 123456,
        sampler_name: 'Euler a',
        scheduler: 'normal',
        loras: [{ name: '661652545330040294', strength: 0.8 }],
        extraParams: { custom_parameters: { diffusion: { cfgScale: 7 } } },
      } as any,
      { tensorartKey: 'test-bearer-token' }
    );

    expect(tracedFetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(tracedFetch).mock.calls[0];
    expect(url).toBe('/api/tensorart/generate');
    expect((init?.headers as any)['x-tensorart-key']).toBe('test-bearer-token');

    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe('613045163490732233');
    expect(body.prompt).toBe('1girl, anime');
    expect(body.negative_prompt).toBe('low quality');
    expect(body.width).toBe(512);
    expect(body.height).toBe(768);
    expect(body.steps).toBe(25);
    expect(body.cfg).toBe(7);
    expect(body.seed).toBe(123456);
    expect(body.sampler_name).toBe('Euler a');
    expect(body.scheduler).toBe('normal');
    expect(body.loras).toEqual([{ name: '661652545330040294', strength: 0.8, modelStrength: 0.8 }]);
    expect(body.custom_parameters).toEqual({ diffusion: { cfgScale: 7 } });

    expect(result.mediaUrl).toBe('https://example.com/test.png');
    expect(result.providerId).toBe('tensorart');
    expect(result.seed).toBe(123456);
  });

  it('surfaces HTTP status, endpoint, and verbatim body on failure without laundering', async () => {
    const driver = new TensorArtDriver();

    vi.mocked(tracedFetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => '{"code":3,"message":"Params Valid","details":[{"field":"base","message":"credits not enough"}]}',
    } as any);

    await expect(
      driver.generate(
        {
          model: '613045163490732233',
          prompt: 'test prompt',
        } as any,
        { tensorartKey: 'token' }
      )
    ).rejects.toThrow(/Tensor\.Art 路由 \/api\/tensorart\/generate 返回 HTTP 400: \{"code":3,"message":"Params Valid","details":\[\{"field":"base","message":"credits not enough"\}\]\}/);
  });

  it('throws with raw response when mediaUrl is missing without falling back to defaults', async () => {
    const driver = new TensorArtDriver();

    vi.mocked(tracedFetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        provider: 'Tensor.Art (模型 API)',
        model: '613045163490732233',
      }),
    } as any);

    await expect(
      driver.generate(
        {
          model: '613045163490732233',
          prompt: 'test prompt',
        } as any,
        { tensorartKey: 'token' }
      )
    ).rejects.toThrow(/Tensor\.Art 路由返回缺少 mediaUrl: \{"provider":"Tensor\.Art \(模型 API\)","model":"613045163490732233"\}/);
  });

  it('throws with raw response when model is missing from response', async () => {
    const driver = new TensorArtDriver();

    vi.mocked(tracedFetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        mediaUrl: 'https://example.com/out.png',
        provider: 'Tensor.Art (模型 API)',
      }),
    } as any);

    await expect(
      driver.generate(
        {
          model: '613045163490732233',
          prompt: 'test prompt',
        } as any,
        { tensorartKey: 'token' }
      )
    ).rejects.toThrow(/Tensor\.Art 路由返回缺少 model: \{"mediaUrl":"https:\/\/example\.com\/out\.png","provider":"Tensor\.Art \(模型 API\)"\}/);
  });

  it('preserves numeric 0 for width, height, steps, cfg, seed, duration, and denoise', async () => {
    const driver = new TensorArtDriver();

    vi.mocked(tracedFetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        mediaUrl: 'https://example.com/test.png',
        provider: 'Tensor.Art (模型 API)',
        model: '613045163490732233',
        seed: 0,
      }),
    } as any);

    await driver.generate(
      {
        model: '613045163490732233',
        prompt: 'test prompt',
        width: 0,
        height: 0,
        steps: 0,
        cfg: 0,
        seed: 0,
        videoDuration: 0,
        denoise: 0,
      } as any,
      { tensorartKey: 'token' }
    );

    const [, init] = vi.mocked(tracedFetch).mock.calls.at(-1)!;
    const body = JSON.parse(init?.body as string);
    expect(body.width).toBe(0);
    expect(body.height).toBe(0);
    expect(body.steps).toBe(0);
    expect(body.cfg).toBe(0);
    expect(body.seed).toBe(0);
    expect(body.duration).toBe(0);
    expect(body.denoise).toBe(0);
  });

  it('routes isVideo requests to /api/video/generate with provider: tensorart and surfaces verbatim TAMS refusal', async () => {
    const driver = new TensorArtDriver();

    vi.mocked(tracedFetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({
        error: 'Tensor.Art TAMS 模型 672797109289765558：本应用尚未接入 TAMS 视频（官方接口参见 https://tams-docs.tensor.art/docs/api/guide/workspace-api-example/ ）；未发送请求，也不会改用 OpenWorks 接口。',
        errorSource: 'local',
        provider: 'tensorart',
        model: '672797109289765558',
      }),
    } as any);

    await expect(
      driver.generate(
        {
          model: '672797109289765558',
          prompt: 'video prompt',
          isVideo: true,
        } as any,
        { tensorartKey: 'token' }
      )
    ).rejects.toThrow('Tensor.Art TAMS 模型 672797109289765558：本应用尚未接入 TAMS 视频');

    expect(tracedFetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(tracedFetch).mock.calls[0];
    expect(url).toBe('/api/video/generate');
    const body = JSON.parse(init?.body as string);
    expect(body.provider).toBe('tensorart');
    expect(body.model).toBe('672797109289765558');
  });
});
