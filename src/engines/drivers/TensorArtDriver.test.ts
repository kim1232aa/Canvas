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

  it('propagates upstream HTTP errors transparently', async () => {
    const driver = new TensorArtDriver();

    vi.mocked(tracedFetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'Tensor.Art 模型任务提交失败 [400]',
        details: 'credits not enough',
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
    ).rejects.toThrow(/HTTP 400: Tensor\.Art 模型任务提交失败 \[400\] · credits not enough/);
  });
});
