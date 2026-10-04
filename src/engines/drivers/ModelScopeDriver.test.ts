import { describe, expect, it, vi } from 'vitest';
import { ModelScopeDriver } from './ModelScopeDriver';
import { ModelScopeAiDriver } from './ModelScopeAiDriver';

describe('ModelScopeDriver & ModelScopeAiDriver', () => {
  it('ModelScopeDriver throws when model is missing', async () => {
    const driver = new ModelScopeDriver();
    await expect(
      (driver as any).executeGenerate({ prompt: 'test' }, {})
    ).rejects.toThrow('模型为必填项（model is required）');
  });

  it('ModelScopeDriver forwards guidance (from cfg) and loras to /api/modelscope/generate', async () => {
    const driver = new ModelScopeDriver();
    const originalFetch = global.fetch;
    let interceptedUrl = '';
    let interceptedBody: any = null;
    let interceptedHeaders: any = null;

    global.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
      interceptedUrl = url;
      interceptedBody = JSON.parse(init.body);
      interceptedHeaders = init.headers;
      return new Response(JSON.stringify({
          imageUrl: 'https://example.com/ms-image.png',
          model: 'Tongyi-MAI/Z-Image-Turbo',
          historyItem: { seed: 12345 },
        }), { status: 200 });
    }) as any;

    try {
      const res = await (driver as any).executeGenerate(
        {
          model: 'Tongyi-MAI/Z-Image-Turbo',
          prompt: 'A girl with cat',
          negative_prompt: 'blurry',
          steps: 8,
          cfg: 1.5,
          seed: 12345,
          width: 960,
          height: 1440,
          loras: [{ name: 'RadianceChrome', strength: 0.7 }],
        },
        { modelscopeToken: 'ms-secret-key' }
      );

      expect(interceptedUrl).toBe('/api/modelscope/generate');
      expect(interceptedHeaders['x-modelscope-token']).toBe('ms-secret-key');
      expect(interceptedHeaders['x-modelscope-site']).toBe('cn');
      expect(interceptedBody.model).toBe('Tongyi-MAI/Z-Image-Turbo');
      expect(interceptedBody.prompt).toBe('A girl with cat');
      expect(interceptedBody.negative_prompt).toBe('blurry');
      expect(interceptedBody.steps).toBe(8);
      expect(interceptedBody.guidance).toBe(1.5);
      expect(interceptedBody.seed).toBe(12345);
      expect(interceptedBody.width).toBe(960);
      expect(interceptedBody.height).toBe(1440);
      expect(interceptedBody.loras).toEqual([{ name: 'RadianceChrome', strength: 0.7 }]);

      expect(res.mediaUrl).toBe('https://example.com/ms-image.png');
      expect(res.seed).toBe(12345);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('ModelScopeAiDriver targets /api/modelscope_ai/generate with ai site headers', async () => {
    const driver = new ModelScopeAiDriver();
    const originalFetch = global.fetch;
    let interceptedUrl = '';
    let interceptedBody: any = null;
    let interceptedHeaders: any = null;

    global.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
      interceptedUrl = url;
      interceptedBody = JSON.parse(init.body);
      interceptedHeaders = init.headers;
      return new Response(JSON.stringify({
          imageUrl: 'https://example.com/ms-ai-image.png',
          model: 'Tongyi-MAI/Z-Image-Turbo',
          historyItem: { seed: 999 },
        }), { status: 200 });
    }) as any;

    try {
      const res = await (driver as any).executeGenerate(
        {
          model: 'Tongyi-MAI/Z-Image-Turbo',
          prompt: 'test prompt',
          cfg: 2.0,
          loras: [{ name: 'testLora', strength: 0.8 }],
        },
        { modelscopeAiToken: 'ms-ai-token' }
      );

      expect(interceptedUrl).toBe('/api/modelscope_ai/generate');
      expect(interceptedHeaders['x-modelscope-ai-token']).toBe('ms-ai-token');
      expect(interceptedHeaders['x-modelscope-site']).toBe('ai');
      expect(interceptedBody.guidance).toBe(2.0);
      expect(interceptedBody.loras).toEqual([{ name: 'testLora', strength: 0.8 }]);
      expect(res.mediaUrl).toBe('https://example.com/ms-ai-image.png');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('surfaces upstream HTTP error without swallowing', async () => {
    const driver = new ModelScopeDriver();
    const originalFetch = global.fetch;

    global.fetch = vi.fn().mockImplementation(async () => {
      return new Response(JSON.stringify({ error: '该服务商不支持: sampler（ModelScope）' }), { status: 400 });
    }) as any;

    try {
      await expect(
        (driver as any).executeGenerate(
          { model: 'Tongyi-MAI/Z-Image-Turbo', prompt: 'hi' },
          { modelscopeToken: 'token' }
        )
      ).rejects.toThrow('该服务商不支持: sampler（ModelScope）');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
