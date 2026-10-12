import { describe, it, expect } from 'vitest';
import { buildRunwareImageRequest, parseRunwareImageResponse } from './runwareImageContract';

describe('Runware Image Contract', () => {
  it('builds a valid imageInference task payload array', () => {
    const req = buildRunwareImageRequest({
      model: 'runware:100@1',
      prompt: 'a scenic mountain lake',
      negative_prompt: 'blurry, distorted',
      width: 1024,
      height: 1024,
      steps: 30,
      cfg: 7.5,
      seed: 42,
      loras: [
        { civitaiId: 'civitai:12345@67890', strength: 0.8 },
      ],
    });

    expect(req.endpoint).toBe('https://api.runware.ai/v1');
    expect(Array.isArray(req.payload)).toBe(true);
    expect(req.payload).toHaveLength(1);

    const task = req.payload[0];
    expect(task.taskType).toBe('imageInference');
    expect(task.model).toBe('runware:100@1');
    expect(task.positivePrompt).toBe('a scenic mountain lake');
    expect(task.negativePrompt).toBe('blurry, distorted');
    expect(task.width).toBe(1024);
    expect(task.height).toBe(1024);
    expect(task.steps).toBe(30);
    expect(task.CFGScale).toBe(7.5);
    expect(task.seed).toBe(42);
    expect(task.outputFormat).toBe('PNG');
    expect(task.lora).toEqual([{ model: 'civitai:12345@67890', weight: 0.8 }]);
    expect(task).not.toHaveProperty('loras');
  });

  it('keeps explicit CFGScale 0 for Schnell and maps the official lora field', () => {
    const req = buildRunwareImageRequest({
      model: 'runware:100@1',
      prompt: 'LOCAL_FIXTURE',
      cfg: 0,
      loras: [{ model: 'civitai:120096@135931', strength: 0.7 }],
    });
    expect(req.payload[0].CFGScale).toBe(0);
    expect(req.payload[0].lora).toEqual([{ model: 'civitai:120096@135931', weight: 0.7 }]);
  });

  it('maps image_url and denoise to seedImage and strength for image-to-image', () => {
    const req = buildRunwareImageRequest({
      model: 'runware:100@1',
      prompt: 'repaint as watercolor',
      image_url: 'https://example.com/source.png',
      denoise: 0.65,
    });
    const task = req.payload[0];
    expect(task.seedImage).toBe('https://example.com/source.png');
    expect(task.strength).toBe(0.65);
  });

  it('throws error when model or prompt is missing', () => {
    expect(() => buildRunwareImageRequest({ prompt: 'test' })).toThrow(/模型为必填项/);
    expect(() => buildRunwareImageRequest({ model: 'runware:100@1' })).toThrow(/提示词为必填项/);
  });

  it('parses successful response and extracts imageURL', () => {
    const parsed = parseRunwareImageResponse({
      data: [
        {
          taskType: 'imageInference',
          taskUUID: 'uuid-1',
          imageUUID: 'img-1',
          imageURL: 'https://im.runware.ai/image/test.jpg',
          cost: 0.0015,
        },
      ],
    });
    expect(parsed.imageUrl).toBe('https://im.runware.ai/image/test.jpg');
    expect(parsed.cost).toBe(0.0015);
    expect(parsed.taskUUID).toBe('uuid-1');
  });

  it('throws error when upstream reports errors', () => {
    expect(() => parseRunwareImageResponse({
      errors: [{ code: 'INSUFFICIENT_CREDITS', message: 'You have no balance remaining' }],
    })).toThrow(/You have no balance remaining/);
  });

  it('merges custom JSON into the task, keeps explicit model and numberResults, and records overrides', () => {
    const { payload, overrides, actualModel } = buildRunwareImageRequest({
      model: 'runware:100@1', prompt: 'p', cfg: 0, loras: [{ name: 'civitai:1@2', strength: 0.5 }],
      custom_parameters: { model: 'runware:101@1', numberResults: 3, outputFormat: 'WEBP', CFGScale: 0 },
    });
    expect(payload[0]).toMatchObject({ model: 'runware:101@1', numberResults: 3, outputFormat: 'WEBP', CFGScale: 0, lora: [{ model: 'civitai:1@2', weight: 0.5 }] });
    expect(actualModel).toBe('runware:101@1');
    expect(overrides.map((o) => o.field)).toEqual(['model', 'numberResults', 'outputFormat']);
  });

  it('refuses custom JSON that would change taskType or credentials', () => {
    expect(() => buildRunwareImageRequest({ model: 'm', prompt: 'p', custom_parameters: { apiKey: 'x' } })).toThrow(/凭据/);
  });

  it('returns every image with its own seed and cost', () => {
    const parsed = parseRunwareImageResponse({ data: [
      { taskType: 'imageInference', taskUUID: 't', imageURL: 'https://im.runware.ai/a.webp', seed: 1, cost: 0.1 },
      { taskType: 'imageInference', taskUUID: 't', imageURL: 'https://im.runware.ai/b.webp', seed: 2, cost: 0.1 },
    ] } as any);
    expect(parsed.images).toEqual([{ url: 'https://im.runware.ai/a.webp', seed: 1 }, { url: 'https://im.runware.ai/b.webp', seed: 2 }]);
  });
});
