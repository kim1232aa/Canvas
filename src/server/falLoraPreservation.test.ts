import { describe, expect, it, vi, afterEach } from 'vitest';
import { mapFalServerLoras, FalDriver } from '../engines/drivers/FalDriver';
import { sanitizeGenerationMetadata } from '../utils/generationMetadata';

describe('Fal LoRA clipStrength preservation & metadata mapping', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('FalDriver preserves clipStrength in the request body sent to /api/fal/generate', async () => {
    const driver = new FalDriver();
    let interceptedBody: any;
    globalThis.fetch = vi.fn(async (_url: any, init: any) => {
      interceptedBody = JSON.parse(init.body);
      return new Response(JSON.stringify({
        images: [{ url: 'https://fal.media/test.png' }],
        seed: 42,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    await driver.generate({
      model: 'fal-ai/flux/dev',
      prompt: 'a cinematic portrait',
      loras: [
        {
          name: 'cyberpunk',
          path: 'https://fal.media/lora1.safetensors',
          strength: 0.8,
          clipStrength: 0.6,
        },
      ],
    }, { falKey: 'test-key' });

    expect(interceptedBody).toBeDefined();
    expect(interceptedBody.loras).toHaveLength(1);
    expect(interceptedBody.loras[0]).toEqual({
      path: 'https://fal.media/lora1.safetensors',
      scale: 0.8,
      clipStrength: 0.6,
    });
  });

  it('FalDriver does not fabricate scale or throw locally when only clipStrength is provided', async () => {
    const driver = new FalDriver();
    let interceptedBody: any;
    globalThis.fetch = vi.fn(async (_url: any, init: any) => {
      interceptedBody = JSON.parse(init.body);
      return new Response(JSON.stringify({
        images: [{ url: 'https://fal.media/test.png' }],
        seed: 42,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    await driver.generate({
      model: 'fal-ai/flux/dev',
      prompt: 'a cinematic portrait',
      loras: [
        {
          name: 'text-style',
          path: 'https://fal.media/text.safetensors',
          clipStrength: 0.95,
        },
      ],
    }, { falKey: 'test-key' });

    expect(interceptedBody.loras[0]).toEqual({
      path: 'https://fal.media/text.safetensors',
      clipStrength: 0.95,
    });
    expect(interceptedBody.loras[0]).not.toHaveProperty('scale');
  });

  it('server mapping (mapFalServerLoras from server.ts) preserves clipStrength in requestedParameters, marks unmapped, and avoids fabricating scale on wire', () => {
    const requestedLoras = [
      { path: 'https://fal.media/style.safetensors', clipStrength: 0.7 },
      { path: 'https://fal.media/character.safetensors', scale: 0.85, clipStrength: 0.5 },
    ];

    // Executes the REAL production function exported by server.ts
    const { wireLoras, unmappedLoraFields } = mapFalServerLoras(requestedLoras);

    // Wire payload must NOT fabricate scale for the first LoRA
    expect(wireLoras[0]).toEqual({ path: 'https://fal.media/style.safetensors' });
    expect(wireLoras[0]).not.toHaveProperty('scale');

    // Wire payload preserves authentic scale for the second LoRA
    expect(wireLoras[1]).toEqual({ path: 'https://fal.media/character.safetensors', scale: 0.85 });

    // Explicitly records that clipStrength is unmapped/unsent because Fal OpenAPI has no CLIP field
    expect(unmappedLoraFields).toHaveLength(2);
    expect(unmappedLoraFields[0]).toMatchObject({
      lora: 'https://fal.media/style.safetensors',
      field: 'clipStrength',
      value: 0.7,
    });
    expect(unmappedLoraFields[1]).toMatchObject({
      lora: 'https://fal.media/character.safetensors',
      field: 'clipStrength',
      value: 0.5,
    });

    // Provenance/requestedParameters retains clipStrength verbatim
    const sanitized = sanitizeGenerationMetadata({ loras: requestedLoras });
    expect(sanitized.loras[0].clipStrength).toBe(0.7);
    expect(sanitized.loras[1].clipStrength).toBe(0.5);
  });

  it('server mapping rejects LoRA without accessible path or url', () => {
    expect(() => mapFalServerLoras([{ name: 'no-path-lora' }])).toThrow('LoRA 没有可直接访问的 path/url，无法发送');
  });
});
