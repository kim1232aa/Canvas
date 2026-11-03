import { describe, it, expect } from 'vitest';
import {
  buildModelsLabImageRequest,
  parseModelsLabResponse,
  buildModelsLabFetchRequest,
  sanitizeModelsLabPayload,
  inspectModelsLabPollBody,
  inspectModelsLabImageResponseBody,
} from './modelsLabImageContract';

describe('ModelsLab Image Contract', () => {
  it('chooses img2img from JSON-only reference after merging final wire fields', () => {
    const built = buildModelsLabImageRequest({ model: 'canvas', prompt: 'a', custom_parameters: { model_id: 'json-model', samples: 2, init_image: 'https://example.invalid/ref.png', strength: 0.5 } }, 'fixture-key', 'https://relay.example.invalid/api/v6/images/text2img');
    expect(built.endpoint).toBe('https://relay.example.invalid/api/v6/images/img2img');
    expect(built.payload).toMatchObject({ model_id: 'json-model', samples: 2, init_image: 'https://example.invalid/ref.png', strength: 0.5 });
    expect(built.actualModel).toBe('json-model');
    expect(buildModelsLabFetchRequest('job', 'fixture-key', built.endpoint).endpoint).toBe('https://relay.example.invalid/api/v6/images/fetch');
  });
  it('chooses text2img when JSON explicitly clears a normal reference image', () => {
    const built = buildModelsLabImageRequest({ model: 'canvas', prompt: 'a', image_url: 'https://example.invalid/ref.png', custom_parameters: { init_image: '', model_id: 'json-model', samples: 2 } }, 'fixture-key', 'https://relay.example.invalid/api/v6/images/img2img');
    expect(built.endpoint).toBe('https://relay.example.invalid/api/v6/images/text2img');
    expect(built.payload).toMatchObject({ init_image: '', model_id: 'json-model', samples: 2 });
    expect(buildModelsLabFetchRequest('job', 'fixture-key', built.endpoint).endpoint).toBe('https://relay.example.invalid/api/v6/images/fetch');
  });
  it('builds a valid text2img request body', () => {
    const req = buildModelsLabImageRequest(
      {
        model: 'flux',
        prompt: 'a majestic lion in a savanna at sunset',
        negative_prompt: 'blurry',
        width: 1024,
        height: 1024,
        steps: 30,
        cfg: 7.5,
        seed: 12345,
        scheduler: 'EulerDiscreteScheduler',
        loras: [{ name: 'style-realism', strength: 0.8 }],
      },
      'test-api-key'
    );

    expect(req.endpoint).toBe('https://modelslab.com/api/v6/images/text2img');
    expect(req.payload.key).toBe('test-api-key');
    expect(req.payload.model_id).toBe('flux');
    expect(req.payload.prompt).toBe('a majestic lion in a savanna at sunset');
    expect(req.payload.negative_prompt).toBe('blurry');
    expect(req.payload.width).toBe(1024);
    expect(req.payload.height).toBe(1024);
    expect(req.payload.num_inference_steps).toBe(30);
    expect(req.payload.guidance_scale).toBe(7.5);
    expect(req.payload.seed).toBe(12345);
    expect(req.payload.scheduler).toBe('EulerDiscreteScheduler');
    expect(req.payload.lora_model).toBe('style-realism');
    expect(req.payload.lora_strength).toBe(0.8);
  });

  it('routes an explicit reference image to official img2img fields', () => {
    const req = buildModelsLabImageRequest({
      model: 'flux',
      prompt: 'keep the teapot and change the background',
      image_url: 'https://fixture.invalid/teapot.png',
      denoise: 0.6,
    }, 'test-api-key');
    expect(req.endpoint).toBe('https://modelslab.com/api/v6/images/img2img');
    expect(req.payload.init_image).toBe('https://fixture.invalid/teapot.png');
    expect(req.payload.strength).toBe(0.6);
  });

  it.each([1.5, 0, -1, '2'])('rejects an invalid explicit samples value instead of rounding or defaulting (%s)', (samples) => {
    expect(() => buildModelsLabImageRequest({ model: 'flux', prompt: 'p', samples }, 'test-key')).toThrow(/samples/);
  });

  it('preserves positive integer sample counts without imposing a provider-specific maximum', () => {
    const req = buildModelsLabImageRequest({ model: 'custom-model', prompt: 'p', samples: 5 }, 'test-key');
    expect(req.payload.samples).toBe(5);
  });

  it('builds official fetch request for async polling', () => {
    const fetchReq = buildModelsLabFetchRequest(12345, 'my-key');
    expect(fetchReq.endpoint).toBe('https://modelslab.com/api/v6/images/fetch');
    expect(fetchReq.payload).toEqual({
      key: 'my-key',
      request_id: '12345',
    });
  });

  it('parses synchronous success response', () => {
    const parsed = parseModelsLabResponse({
      status: 'success',
      generationTime: 2.5,
      id: 98765,
      output: ['https://pub-r2.dev/generations/test.png'],
      meta: { seed: 12345 },
    });
    expect(parsed.status).toBe('success');
    expect(parsed.imageUrl).toBe('https://pub-r2.dev/generations/test.png');
    expect(parsed.taskId).toBe(98765);
  });

  it('parses async processing response', () => {
    const parsed = parseModelsLabResponse({
      status: 'processing',
      id: 98765,
      eta: 10,
      message: 'Processing task',
    });
    expect(parsed.status).toBe('processing');
    expect(parsed.taskId).toBe(98765);
    expect(parsed.eta).toBe(10);
  });

  it('throws error on status error', () => {
    expect(() => parseModelsLabResponse({
      status: 'error',
      message: 'Invalid API key',
      tip: 'Check your key in dashboard',
    })).toThrow(/Invalid API key.*Check your key/);
  });

  it('keeps the actual 2xx status and complete body for semantic and protocol failures', () => {
    const semanticBody = JSON.stringify({ status: 'error', code: 'insufficient_balance', message: 'plan exhausted' });
    expect(inspectModelsLabImageResponseBody(semanticBody, 200)).toMatchObject({
      kind: 'semantic-error', upstreamStatus: 200, rawResponse: semanticBody,
    });

    const invalidBody = `<html>${'maintenance '.repeat(60)}</html>`;
    expect(inspectModelsLabImageResponseBody(invalidBody, 200)).toMatchObject({
      kind: 'protocol-error', upstreamStatus: 200, rawResponse: invalidBody,
    });
  });

  it('redacts an echoed credential while retaining the rest of the ModelsLab response', () => {
    const key = 'fixture-modelslab-private-key';
    const body = JSON.stringify({ status: 'error', message: `bad key ${key}` });
    const inspected = inspectModelsLabImageResponseBody(body, 200, key);
    expect(inspected.kind).toBe('semantic-error');
    expect(inspected.rawResponse).toContain('[credential redacted]');
    expect(inspected.rawResponse).not.toContain(key);
  });

  it('preserves malformed 2xx poll response text instead of turning it into a pending empty object', () => {
    const rawResponse = '<html>upstream maintenance</html>';
    expect(inspectModelsLabPollBody(rawResponse)).toMatchObject({
      kind: 'invalid-json',
      rawResponse,
    });
  });

  it('keeps task-level failure distinct from HTTP failure and retains exact poll response', () => {
    const rawResponse = JSON.stringify({ status: 'error', message: 'queue failed', tip: 'retry later' });
    expect(inspectModelsLabPollBody(rawResponse)).toEqual({
      kind: 'task-error',
      rawResponse,
      data: { status: 'error', message: 'queue failed', tip: 'retry later' },
    });
  });

  it('fetch endpoint never nests the generation route, whichever route base URL was configured', () => {
    for (const base of ['https://modelslab.com/api/v6/images/img2img', 'https://modelslab.com/api/v6/images/text2img', 'https://modelslab.com/']) {
      expect(buildModelsLabFetchRequest(1, 'k', base).endpoint).toBe('https://modelslab.com/api/v6/images/fetch');
    }
  });

  it('lets custom JSON explicitly override graph batch samples and records the actual override', () => {
    const req = buildModelsLabImageRequest({ model: 'flux', prompt: 'p', samples: 3, custom_parameters: { model_id: 'sdxl', samples: 2, enhance_prompt: 'yes' } }, 'secret-key');
    expect(req.payload).toMatchObject({ model_id: 'sdxl', samples: 2, enhance_prompt: 'yes', key: 'secret-key' });
    expect(req.actualModel).toBe('sdxl');
    expect(req.overrides).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'model_id', requested: 'flux', custom: 'sdxl' }),
      expect.objectContaining({ field: 'samples', requested: 3, custom: 2 }),
    ]));
    expect(() => buildModelsLabImageRequest({ model: 'flux', prompt: 'p', custom_parameters: { key: 'other' } }, 'secret-key')).toThrow(/凭据/);
  });

  it('keeps the processing future_links so queued multi-image results are not lost', () => {
    const parsed = parseModelsLabResponse({ status: 'processing', id: 9, eta: 3, future_links: ['https://a/1.png', 'https://a/2.png'] });
    expect(parsed).toMatchObject({ status: 'processing', taskId: 9, futureLinks: ['https://a/1.png', 'https://a/2.png'] });
  });
});
