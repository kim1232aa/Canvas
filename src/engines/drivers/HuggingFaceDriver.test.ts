import { describe, expect, it, vi, afterEach } from 'vitest';
import { HuggingFaceDriver } from './HuggingFaceDriver';
import { NormalizedGenerateParams } from '../types';

describe('HuggingFaceDriver error prefix', () => {
  const driver = new HuggingFaceDriver();
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('prefixes upstream errors with HTTP status', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: '该服务商不支持: loras（Hugging Face）',
        unsupported: ['loras'],
      }),
    });

    const params: NormalizedGenerateParams = {
      prompt: 'test',
      model: 'Tongyi-MAI/Z-Image-Turbo',
      loras: [{ name: 'koda', path: 'https://example.com/lora.safetensors', strength: 1 }],
    };

    await expect(driver.generate(params, { hfToken: 'test' })).rejects.toThrow(
      'HTTP 400: 该服务商不支持: loras（Hugging Face）'
    );
  });

  it('forwards cfg, scheduler, steps, and negative_prompt to /api/huggingface/generate', async () => {
    let interceptedBody: any = null;
    let interceptedHeaders: any = null;

    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
      interceptedBody = JSON.parse(init.body);
      interceptedHeaders = init.headers;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          imageUrl: 'data:image/png;base64,fake-data',
          model: 'stabilityai/stable-diffusion-xl-base-1.0',
          provider: 'Hugging Face',
          historyItem: { seed: 12345 },
        }),
      };
    });

    const params: NormalizedGenerateParams = {
      prompt: 'a scenic landscape',
      negative_prompt: 'ugly, blurry',
      model: 'stabilityai/stable-diffusion-xl-base-1.0',
      width: 1024,
      height: 1024,
      steps: 30,
      cfg: 7.5,
      scheduler: 'DPMSolverMultistepScheduler',
      seed: 12345,
    };

    const res = await driver.generate(params, { hfToken: 'hf-test-token' });

    expect(interceptedHeaders['x-hf-token']).toBe('hf-test-token');
    expect(interceptedBody.prompt).toBe('a scenic landscape');
    expect(interceptedBody.negative_prompt).toBe('ugly, blurry');
    expect(interceptedBody.model).toBe('stabilityai/stable-diffusion-xl-base-1.0');
    expect(interceptedBody.width).toBe(1024);
    expect(interceptedBody.height).toBe(1024);
    expect(interceptedBody.steps).toBe(30);
    expect(interceptedBody.cfg).toBe(7.5);
    expect(interceptedBody.guidance).toBe(7.5);
    expect(interceptedBody.scheduler).toBe('DPMSolverMultistepScheduler');
    expect(interceptedBody.seed).toBe(12345);

    expect(res.mediaUrl).toBe('data:image/png;base64,fake-data');
    expect(res.seed).toBe(12345);
  });
});
