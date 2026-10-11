import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunwareDriver } from './RunwareDriver';
import { tracedFetch } from '../../services/executionTrace';
import type { NormalizedGenerateParams } from '../types';

vi.mock('../../services/executionTrace', () => ({ tracedFetch: vi.fn() }));

const mockFetch = vi.mocked(tracedFetch);

const FIXTURE_KEY = 'test-runware-key';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('RunwareDriver', () => {
  const driver = new RunwareDriver();

  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('posts a complete generate request and returns a normalized image result', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        mediaUrl: 'https://example.test/runware/out.png',
        model: 'runware:100@1',
        seed: 42,
      }),
    );

    const loras = [{ name: 'fixture-lora', path: 'https://example.test/lora.safetensors', strength: 0.7 }];
    const workflowSnapshot = { nodes: [], connections: [] };
    const params: NormalizedGenerateParams = {
      prompt: 'a red fox in snow',
      negative_prompt: 'blurry',
      model: 'runware:100@1',
      width: 1024,
      height: 768,
      steps: 20,
      cfg: 7.5,
      seed: 42,
      loras,
      workflowSnapshot,
      baseUrl: 'https://api.runware.ai/v1',
    };

    const result = await driver.generate(params, { runwareKey: FIXTURE_KEY });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/engine/runware/generate');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-runware-key': FIXTURE_KEY,
      'x-runware-base-url': 'https://api.runware.ai/v1',
    });

    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      model: 'runware:100@1',
      prompt: 'a red fox in snow',
      negative_prompt: 'blurry',
      width: 1024,
      height: 768,
      steps: 20,
      cfg: 7.5,
      seed: 42,
      loras: expect.arrayContaining([
        expect.objectContaining({ name: 'fixture-lora', path: 'https://example.test/lora.safetensors', strength: 0.7 }),
      ]),
      workflowSnapshot,
    });

    expect(result.mediaUrl).toBe('https://example.test/runware/out.png');
    expect(result.mediaType).toBe('image');
    expect(result.providerId).toBe('runware');
    expect(result.provider).toBe('Runware');
    expect(result.model).toBe('runware:100@1');
    expect(result.requestedModel).toBe('runware:100@1');
    expect(result.seed).toBe(42);
  });

  it('falls back to imageUrl when mediaUrl is absent', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        imageUrl: 'https://example.test/runware/fallback.png',
        model: 'bfl:flux@1-schnell',
      }),
    );

    const result = await driver.generate(
      { prompt: 'test', model: 'bfl:flux@1-schnell' },
      { runwareKey: FIXTURE_KEY },
    );

    expect(result.mediaUrl).toBe('https://example.test/runware/fallback.png');
    expect(result.providerId).toBe('runware');
    expect(result.model).toBe('bfl:flux@1-schnell');
  });

  it('rejects locally when model is missing and does not call the engine route', async () => {
    await expect(driver.generate({ prompt: 'no model' } as NormalizedGenerateParams, {})).rejects.toThrow(
      '模型为必填项（model is required）',
    );
    await expect(driver.generate({ prompt: 'blank', model: '   ' }, {})).rejects.toThrow(
      '模型为必填项（model is required）',
    );
    await expect((driver as any).executeGenerate({ prompt: 'direct' }, {})).rejects.toThrow(
      '模型为必填项（model is required）',
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('surfaces HTTP 400 details from the server error body', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ details: 'invalid Runware model AIR identifier', error: 'bad request' }, 400),
    );

    await expect(
      driver.generate({ prompt: 'test', model: 'runware:100@1' }, { runwareKey: FIXTURE_KEY }),
    ).rejects.toThrow('invalid Runware model AIR identifier');
  });

  it('surfaces HTTP 500 error when details is absent', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'Runware upstream timeout' }, 500));

    await expect(
      driver.generate({ prompt: 'test', model: 'runware:100@1' }, { runwareKey: FIXTURE_KEY }),
    ).rejects.toThrow('Runware upstream timeout');
  });

  it('falls back to HTTP status text when the error body is not JSON', async () => {
    mockFetch.mockResolvedValue(new Response('gateway exploded', { status: 502 }));

    await expect(
      driver.generate({ prompt: 'test', model: 'runware:100@1' }, { runwareKey: FIXTURE_KEY }),
    ).rejects.toThrow('Runware 路由 HTTP 502: gateway exploded');
  });

  it('throws when a successful response has neither mediaUrl nor imageUrl', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ ok: true, model: 'runware:100@1' }));

    await expect(
      driver.generate({ prompt: 'test', model: 'runware:100@1' }, { runwareKey: FIXTURE_KEY }),
    ).rejects.toThrow('Runware 返回缺少图像输出 URL');
  });
});
