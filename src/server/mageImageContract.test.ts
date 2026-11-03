import { describe, expect, it } from 'vitest';
import {
  buildMageImageRequest,
  parseMageRequestResponse,
  assertNoMageLoras,
  MAGE_DOC,
  MAGE_SCHEMA_FIELDS,
  MageSchemaRefuseError,
} from './mageImageContract';

describe('mageImageContract', () => {
  it('builds a Mango request with the explicitly selected model', () => {
    const mapped = buildMageImageRequest({
      prompt: 'Editorial portrait in soft daylight, 35mm film look',
      model_id: 'mango-v3',
      aspect_ratio: '4:5',
    });
    expect(mapped.endpoint).toBe('https://api.mage.space/v1/mango/generate');
    expect(mapped.payload).toEqual({
      prompt: 'Editorial portrait in soft daylight, 35mm film look',
      model_id: 'mango-v3',
      aspect_ratio: '4:5',
    });
    expect(mapped.actualModel).toBe('mango-v3');
    expect(MAGE_DOC).toContain('docs.mage.space');
  });

  it('accepts seed, resolution, image, additional_images', () => {
    const mapped = buildMageImageRequest({
      prompt: 'a scene',
      model: 'mango-v3-turbo',
      seed: 7,
      resolution: '1K',
      image_url: 'https://example.com/ref.png',
      additional_images: ['https://example.com/a.png'],
    });
    expect(mapped.payload).toMatchObject({
      model_id: 'mango-v3-turbo',
      seed: 7,
      resolution: '1K',
      image: 'https://example.com/ref.png',
      additional_images: ['https://example.com/a.png'],
    });
  });

  it('refuses non-empty loras[]', () => {
    expect(() =>
      buildMageImageRequest({
        prompt: 'x',
        loras: [{ name: 'fake-lora', strength: 1 }],
      })
    ).toThrow(/无 LoRA/);
    expect(() => assertNoMageLoras({ loras: [{ name: 'x' }] })).toThrow(/无 LoRA/);
  });

  it('refuses unsupported canvas diffusion fields', () => {
    expect(() =>
      buildMageImageRequest({ prompt: 'x', steps: 20, cfg: 7 })
    ).toThrow(/steps.*cfg|cfg.*steps/);
    expect(() =>
      buildMageImageRequest({ prompt: 'x', negative_prompt: 'blur', width: 512, height: 512 })
    ).toThrow(/negative_prompt/);
  });

  it('refuse carries schemaFields + blockedField so history does not label width as 拟发送', () => {
    try {
      buildMageImageRequest({ prompt: 'x', model_id: 'mango-v3', width: 1024, height: 1024, aspect_ratio: '4:5' });
      throw new Error('expected refuse');
    } catch (e: any) {
      expect(e).toBeInstanceOf(MageSchemaRefuseError);
      expect(e.schemaFields).toEqual([...MAGE_SCHEMA_FIELDS]);
      expect(e.refusedFields).toEqual(expect.arrayContaining(['width', 'height']));
      expect(e.blockedField.from).toBe('width');
      expect(e.blockedField.value).toBe(1024);
      expect(String(e.message)).toMatch(/width, height/);
    }
  });

  it('requires an explicit model and forwards an unknown model unchanged', () => {
    expect(() => buildMageImageRequest({ prompt: 'x' })).toThrow(/模型为必填项/);
    expect(buildMageImageRequest({ prompt: 'x', model_id: 'custom-model' }).payload.model_id).toBe('custom-model');
    expect(buildMageImageRequest({ prompt: 'x', model_id: 'mango-v3', aspect_ratio: '7:7', resolution: '5K' }).payload)
      .toMatchObject({ aspect_ratio: '7:7', resolution: '5K' });
  });

  it('does not silently round or discard an explicitly supplied seed', () => {
    expect(() => buildMageImageRequest({ prompt: 'x', model_id: 'mango-v3', seed: 1.5 })).toThrow(/seed/);
    expect(() => buildMageImageRequest({ prompt: 'x', model_id: 'mango-v3', seed: '42' })).toThrow(/seed/);
    expect(buildMageImageRequest({ prompt: 'x', model_id: 'mango-v3', seed: 42 }).payload.seed).toBe(42);
  });

  it('parses completed and pending responses', () => {
    const done = parseMageRequestResponse({
      request_id: 'abc',
      status: 'completed',
      result: { url: 'https://cdn.example/out.png', seed: 3 },
      status_url: 'https://api.mage.space/v1/requests/abc/status',
    });
    expect(done.isPending).toBe(false);
    expect(done.imageUrl).toBe('https://cdn.example/out.png');
    expect(done.seed).toBe(3);

    const pending = parseMageRequestResponse({
      request_id: 'abc',
      status: 'in_progress',
      result: null,
      status_url: 'https://api.mage.space/v1/requests/abc/status',
    });
    expect(pending.isPending).toBe(true);
    expect(pending.statusUrl).toContain('/status');
  });

  it('surfaces failed status verbatim', () => {
    expect(() =>
      parseMageRequestResponse({
        status: 'failed',
        error: { code: 'insufficient_gems', message: 'need gems' },
      })
    ).toThrow(/insufficient_gems/);
  });
});
