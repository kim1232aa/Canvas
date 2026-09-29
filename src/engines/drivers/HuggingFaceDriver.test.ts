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
});
