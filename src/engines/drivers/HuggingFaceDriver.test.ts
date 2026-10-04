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
  it('keeps LoRA repository, explicit strength and the HF billing route', async()=>{
    const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'Payment required'}), { status: 402 }));globalThis.fetch=request;
    await expect(driver.generate({model:'XLabs-AI/flux-RealismLora',prompt:'robot',width:512,height:512,seed:42,steps:12,cfg:3.5,extraParams:{hf_provider:'fal-ai'},loras:[{name:'XLabs-AI/flux-RealismLora',strength:0.8}]},{})).rejects.toThrow('HTTP 402');
    expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({inference_provider:'fal-ai',loras:[{name:'XLabs-AI/flux-RealismLora',strength:0.8}],width:512,height:512,guidance:3.5,seed:42});
  });
});
