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
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        error: '该服务商不支持: loras（Hugging Face）',
        unsupported: ['loras'],
      }), { status: 400 }));

    const params: NormalizedGenerateParams = {
      prompt: 'test',
      model: 'Tongyi-MAI/Z-Image-Turbo',
      loras: [{ name: 'koda', path: 'https://example.com/lora.safetensors', strength: 1 }],
    };

    await expect(driver.generate(params, { hfToken: 'test' })).rejects.toThrow(
      /HTTP 400[\s\S]*该服务商不支持: loras（Hugging Face）/
    );
  });

  it('forwards the Space controls with an explicit seed and a new empty gallery', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({error: 'Space unavailable', details: 'GPU quota exceeded'}), { status: 503 }));
    globalThis.fetch = request;
    await expect(driver.generate({prompt: 'test', model: 'Tongyi-MAI/Z-Image-Turbo', seed: 42, steps: 8, extraParams: {resolution: '1024x1024 ( 1:1 )', shift: 3, random_seed: false, gallery_images: []}}, {})).rejects.toThrow(/HTTP 503[\s\S]*Space unavailable[\s\S]*GPU quota exceeded/);
    expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({seed: 42, steps: 8, resolution: '1024x1024 ( 1:1 )', shift: 3, random_seed: false, gallery_images: []});
  });

  it('forwards the documented generic HF scheduler', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({error: 'test boundary'}), { status: 400 }));
    globalThis.fetch = request;
    await expect(driver.generate({prompt: 'test', model: 'huggingface-text-to-image', scheduler: 'test-scheduler'}, {})).rejects.toThrow('HTTP 400');
    expect(JSON.parse(request.mock.calls[0][1].body).scheduler).toBe('test-scheduler');
  });
  it('keeps LoRA repository and explicit strength without an inference_provider route field', async()=>{
    const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'Payment required'}), { status: 402 }));globalThis.fetch=request;
    await expect(driver.generate({model:'XLabs-AI/flux-RealismLora',prompt:'robot',width:512,height:512,seed:42,steps:12,cfg:3.5,loras:[{name:'XLabs-AI/flux-RealismLora',strength:0.8}]},{})).rejects.toThrow('HTTP 402');
    const body=JSON.parse(request.mock.calls[0][1].body);
    expect(body).toMatchObject({loras:[{name:'XLabs-AI/flux-RealismLora',strength:0.8}],width:512,height:512,guidance:3.5,seed:42});
    expect(body).not.toHaveProperty('inference_provider');
  });
});

describe('HuggingFaceDriver batchSize', () => {
  it('does not invent a batch field (none in the official text-to-image spec) and surfaces that to the caller', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ imageUrl: 'https://example.test/o.png' }), { status: 200 }));
    try {
      const d = new HuggingFaceDriver();
      const r = await d.generate({ prompt: 'a lighthouse at dusk', model: 'black-forest-labs/FLUX.1-dev', batchSize: 4 }, { hfToken: 't' });
      const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
      expect(Object.keys(body).filter((k) => /^(n|num_images|num_images_per_prompt|batch_size|batchSize)$/.test(k))).toEqual([]);
      expect(r.wasAdapted).toBe(true);
      expect(r.adaptationNotice).toMatch(/批量张数 4 未发送/);
      const r1 = await d.generate({ prompt: 'a lighthouse at dusk', model: 'black-forest-labs/FLUX.1-dev', batchSize: 1 }, { hfToken: 't' });
      expect(r1.adaptationNotice).toBeUndefined();
    } finally { globalThis.fetch = original; }
  });
});
