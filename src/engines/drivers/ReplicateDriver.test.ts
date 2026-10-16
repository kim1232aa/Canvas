import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicateDriver } from './ReplicateDriver';
import { tracedFetch } from '../../services/executionTrace';
import type { NormalizedGenerateParams } from '../types';

vi.mock('../../services/executionTrace', () => ({ tracedFetch: vi.fn() }));

const mockFetch = vi.mocked(tracedFetch);

const FIXTURE_KEY = 'test-replicate-key';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ReplicateDriver', () => {
  const driver = new ReplicateDriver();

  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('declares the expected static metadata and supported models', () => {
    expect(driver.id).toBe('replicate');
    expect(driver.name).toBe('Replicate');
    expect(driver.label).toBe('Replicate 官方云平台');
    expect(driver.badgeColor).toBe('#ea580c');
    expect(driver.capabilities).toEqual(['text2img', 'img2img']);
    expect(driver.defaultBaseUrl).toBe('https://api.replicate.com/v1');
    expect(driver.supportedModels.length).toBeGreaterThanOrEqual(5);

    const modelIds = driver.supportedModels.map((m) => m.id);
    expect(modelIds).toContain('black-forest-labs/flux-schnell');
    expect(modelIds).toContain('black-forest-labs/flux-dev');
    expect(modelIds).toContain('black-forest-labs/flux-dev-lora');
    expect(modelIds).toContain('ideogram-ai/ideogram-v2a');
    expect(modelIds).toContain('minimax/image-01');
    expect(modelIds).toContain('bytedance/seedream-3');

    const schnell = driver.supportedModels.find((m) => m.id === 'black-forest-labs/flux-schnell');
    expect(schnell?.defaultSteps).toBe(4);
    expect(schnell?.defaultCfg).toBe(3.5);
    expect(schnell?.supportsLora).toBe(false);

    const dev = driver.supportedModels.find((m) => m.id === 'black-forest-labs/flux-dev');
    expect(dev?.defaultSteps).toBe(28);
    expect(dev?.defaultCfg).toBe(3.5);
    expect(dev?.supportsLora).toBe(false);

    const lora = driver.supportedModels.find((m) => m.id === 'black-forest-labs/flux-dev-lora');
    expect(lora?.defaultSteps).toBe(28);
    expect(lora?.defaultCfg).toBe(3);
    expect(lora?.supportsLora).toBe(true);
  });

  it('posts a complete generate request and maps normalized image result', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        mediaUrl: 'https://replicate.delivery/pbxt/example.png',
        model: 'black-forest-labs/flux-schnell',
        seed: 42,
      })
    );

    const params: NormalizedGenerateParams = {
      prompt: 'a majestic cinematic wolf in neon rain',
      negative_prompt: 'blurry, distorted',
      model: 'black-forest-labs/flux-schnell',
      width: 1024,
      height: 1024,
      steps: 4,
      cfg: 3.5,
      seed: 42,
      baseUrl: 'https://api.replicate.com/v1',
    };

    const result = await driver.generate(params, { replicateKey: FIXTURE_KEY });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/engine/replicate/generate');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-replicate-key': FIXTURE_KEY,
      'x-replicate-base-url': 'https://api.replicate.com/v1',
    });

    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      model: 'black-forest-labs/flux-schnell',
      prompt: 'a majestic cinematic wolf in neon rain',
      negative_prompt: 'blurry, distorted',
      width: 1024,
      height: 1024,
      steps: 4,
      cfg: 3.5,
      seed: 42,
    });

    expect(result.mediaUrl).toBe('https://replicate.delivery/pbxt/example.png');
    expect(result.mediaType).toBe('image');
    expect(result.provider).toBe('Replicate');
    expect(result.providerId).toBe('replicate');
    expect(result.model).toBe('black-forest-labs/flux-schnell');
    expect(result.seed).toBe(42);
    expect(result.rawResponse).toBeDefined();
  });

  it('prefers params.apiKey over keys.replicateKey', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        mediaUrl: 'https://replicate.delivery/pbxt/custom.png',
        model: 'black-forest-labs/flux-dev',
      })
    );

    const params: NormalizedGenerateParams = {
      prompt: 'test prompt',
      model: 'black-forest-labs/flux-dev',
      apiKey: 'custom-user-key',
    };

    await driver.generate(params, { replicateKey: 'default-key' });

    const [, init] = mockFetch.mock.calls[0];
    expect(init?.headers).toMatchObject({
      'x-replicate-key': 'custom-user-key',
    });
  });

  it('falls back to imageUrl when mediaUrl is not returned directly', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        imageUrl: 'https://replicate.delivery/pbxt/fallback-image.png',
        model: 'ideogram-ai/ideogram-v2a',
      })
    );

    const result = await driver.generate(
      { prompt: 'poster design', model: 'ideogram-ai/ideogram-v2a' },
      {}
    );

    expect(result.mediaUrl).toBe('https://replicate.delivery/pbxt/fallback-image.png');
    expect(result.mediaType).toBe('image');
    expect(result.provider).toBe('Replicate');
    expect(result.providerId).toBe('replicate');
    expect(result.seed).toBeNull();
  });

  it('throws an error when model is missing or empty', async () => {
    await expect(
      driver.generate({ prompt: 'test', model: '' }, { replicateKey: FIXTURE_KEY })
    ).rejects.toThrow('模型为必填项（model is required）');

    await expect(
      driver.generate({ prompt: 'test', model: '   ' }, { replicateKey: FIXTURE_KEY })
    ).rejects.toThrow('模型为必填项（model is required）');
  });

  it('handles upstream errors transparently when response is not ok', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ details: 'Replicate API token 无效或配额超限' }, 401)
    );

    await expect(
      driver.generate(
        { prompt: 'test', model: 'black-forest-labs/flux-schnell' },
        { replicateKey: 'bad-key' }
      )
    ).rejects.toThrow('Replicate API token 无效或配额超限');
  });

  it('throws when response lacks both mediaUrl and imageUrl', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ status: 'succeeded' })
    );

    await expect(
      driver.generate(
        { prompt: 'test', model: 'black-forest-labs/flux-schnell' },
        { replicateKey: FIXTURE_KEY }
      )
    ).rejects.toThrow('Replicate 返回缺少图像输出 URL');
  });

  it('surfaces schema-missing block error verbatim (upstream first line)', async () => {
    const err = 'HTTP 404: {"detail":"Model not found"} (https://api.replicate.com/v1/models/a/b)\n本地拦截：拿不到该模型 Schema，未发送 /predictions（model=a/b）';
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: err, blocked: 'schema_missing', notSent: true }, 404));
    await expect(driver.generate({ prompt: 'x', model: 'a/b' } as any, { replicateKey: FIXTURE_KEY })).rejects.toThrow(err);
  });
});
