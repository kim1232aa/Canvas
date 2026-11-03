import { describe, expect, it } from 'vitest';
import { falImageFieldGate, FalSchemaMissingError, extractFalInputProperties } from './falImageContract';
import { buildFalVideoRequest } from './falVideoContract';
import { buildCivitaiImageRequest, CivitaiSchemaMissingError } from './civitaiImageContract';
import { loadCivitaiImageGenOpenApi, loadFalLiveProps, falVideoProps } from './fixtures/liveSchemaFixtures';

describe('Fal/Civitai live schema gate', () => {
  it('Fal image: live present → use live wires; live missing → throw, no static outbound', () => {
    const props = loadFalLiveProps('fal-ai/flux-lora');
    const ok = falImageFieldGate('fal-ai/flux-lora', { steps: 6, cfg: 3.5, seed: 1 }, [], props);
    expect(ok.send).toEqual({ num_inference_steps: 6, guidance_scale: 3.5, seed: 1 });
    expect(() => falImageFieldGate('fal-ai/flux-lora', { steps: 6 }, [])).toThrow(FalSchemaMissingError);
    // Static table alone must not authorize: even known endpoint throws without live props.
    expect(() => falImageFieldGate('fal-ai/krea-2/turbo/lora', { seed: 1 }, [])).toThrow(FalSchemaMissingError);
  });

  it('Fal video: live missing → throw; live present → send declared only', () => {
    expect(() => buildFalVideoRequest('fal-ai/wan-i2v', { image_url: 'a' })).toThrow(FalSchemaMissingError);
    const props = loadFalLiveProps('fal-ai/wan-i2v');
    expect(buildFalVideoRequest('fal-ai/wan-i2v', { image_url: 'a', fps: 24 }, props).payload).toMatchObject({
      image_url: 'a',
      frames_per_second: 24,
    });
  });

  it('extractFalInputProperties reads queue OpenAPI fixture', () => {
    const props = loadFalLiveProps('fal-ai/flux-lora');
    expect('loras' in props && 'num_inference_steps' in props).toBe(true);
    expect(extractFalInputProperties({ models: [{ openapi: { paths: { '/x': { post: { requestBody: { content: { 'application/json': { schema: { properties: { prompt: {} } } } } } } } } } }] })).toEqual({ prompt: {} });
  });

  it('Civitai image: live present → LoRA shape from live; live missing → throw', async () => {
    const get = async () => new Response('{}', { status: 404 });
    const oa = loadCivitaiImageGenOpenApi();
    const f2 = await buildCivitaiImageRequest(
      {
        model: 'urn:air:flux2:checkpoint:civitai:1@2',
        engine: 'flux2',
        ecosystem: 'dev',
        prompt: 'x',
        loras: [{ civitaiId: 'urn:air:flux2:lora:civitai:5@6', strength: 0.7 }],
      },
      get,
      oa,
    );
    expect(f2.payload.loras).toEqual([{ air: 'urn:air:flux2:lora:civitai:5@6', strength: 0.7 }]);
    await expect(
      buildCivitaiImageRequest(
        { model: 'urn:air:flux1:checkpoint:civitai:1@2', engine: 'comfy', ecosystem: 'flux1', prompt: 'x' },
        get,
      ),
    ).rejects.toBeInstanceOf(CivitaiSchemaMissingError);
  });
});
