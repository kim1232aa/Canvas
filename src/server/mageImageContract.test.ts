import { describe, expect, it } from 'vitest';
import {
  buildMageImageRequest,
  parseMageRequestResponse,
  MAGE_DOC,
  MAGE_SCHEMA_FIELDS,
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

  it('sends loras[] as built (no local refusal)', () => {
    const m = buildMageImageRequest({ prompt: 'x', model_id: 'mango-v3', loras: [{ name: 'fake-lora', strength: 1 }] });
    expect(m.payload.loras).toEqual([{ name: 'fake-lora', strength: 1 }]);
  });

  it('forwards schema-unlisted canvas fields unchanged (official additionalProperties:true pass-through)', () => {
    const mapped = buildMageImageRequest({ prompt: 'x', model_id: 'mango-v3', width: 1024, height: 768, aspect_ratio: '4:5', steps: 20, negative_prompt: 'blur' });
    expect(mapped.payload).toMatchObject({ width: 1024, height: 768, steps: 20, negative_prompt: 'blur', aspect_ratio: '4:5' });
    expect(mapped.passThroughFields).toEqual(expect.arrayContaining(['width', 'height', 'steps', 'negative_prompt']));
    expect(mapped.passThroughFields).not.toContain('aspect_ratio');
    expect(mapped.schemaFields).toEqual([...MAGE_SCHEMA_FIELDS]);
  });

  it('empty width/height are not invented', () => {
    const mapped = buildMageImageRequest({ prompt: 'x', model_id: 'mango-v3', width: '', height: null });
    expect(mapped.payload).not.toHaveProperty('width');
    expect(mapped.payload).not.toHaveProperty('height');
    expect(mapped.passThroughFields).toEqual([]);
  });

  it('parses upstream result.width/height', () => {
    const p = parseMageRequestResponse({ status: 'completed', result: { url: 'https://x/a.png', width: 896, height: 1120, seed: 1 } });
    expect(p.width).toBe(896);
    expect(p.height).toBe(1120);
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
