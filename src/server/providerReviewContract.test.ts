import { describe, expect, it } from 'vitest';
import { buildFalVideoRequest } from './falVideoContract';
import { loadFalLiveProps } from './fixtures/liveSchemaFixtures';
import { buildCivitaiImageInput, buildCivitaiImageRequest, resolveCivitaiResource } from './civitaiImageContract';
import { loadCivitaiImageGenOpenApi } from './fixtures/liveSchemaFixtures';
const oa = () => loadCivitaiImageGenOpenApi();
const get = async () => { throw new Error('unexpected lookup'); };
const model = 'urn:air:sdxl:checkpoint:civitai:1@2';
const lora = 'urn:air:sdxl:lora:civitai:3@4';
const kling = 'fal-ai/kling-video/v3/standard/image-to-video';

describe('reviewed provider contracts', () => {
  it('Civitai custom values and AIR LoRA map reach payload and override metadata', async () => {
    const built = await buildCivitaiImageRequest({ model, engine: 'comfy', cfg: 7, custom_parameters: { cfgScale: 2, outputFormat: 'png', loras: { [lora]: 0.8 } } }, get, oa());
    expect(built.payload).toMatchObject({ cfgScale: 2, outputFormat: 'png', loras: { [lora]: 0.8 } });
    expect(built.beforeCustom.cfgScale).toBe(7);
    expect(built.overrides.cfgScale).toEqual({ before: 7, after: 2 });
  });
  it('Civitai custom aliases do not silently compete or discard an explicit empty LoRA override', async () => {
    await expect(buildCivitaiImageInput({ model, engine: 'comfy', custom_parameters: { sampler: 'euler', sampler_name: 'heun' } }, get, oa())).rejects.toThrow(/不一致/);
    await expect(buildCivitaiImageInput({ model, engine: 'comfy', custom_parameters: { sampler: 'euler', sampleMethod: 'heun' } }, get, oa())).rejects.toThrow(/不一致/);
    const built = await buildCivitaiImageRequest({ model, engine: 'comfy', loras: [{ civitaiId: lora, strength: 1 }], custom_parameters: { loras: {} } }, get, oa());
    expect(built.overrides.loras).toEqual({ before: { [lora]: 1 }, after: {} });
    expect(built.payload.loras).toEqual({});
  });
  it('Civitai custom cannot alter network routing or credentials and is an object', async () => {
    for (const custom_parameters of [[], 'bad', { apiKey: 'secret' }, { Authorization: 'secret' }, { provider: 'fal' }, { endpoint: 'https://example.test' }]) await expect(buildCivitaiImageInput({ model, engine: 'comfy', custom_parameters }, get, oa())).rejects.toThrow(/对象|路由|凭据/);
    expect(await buildCivitaiImageInput({ model, engine: 'comfy', custom_parameters: { engine: 'sdcpp' } }, get, oa())).toMatchObject({ engine: 'sdcpp' });
    await expect(buildCivitaiImageInput({ model, engine: 'comfy', custom_parameters: { loras: { [model]: 1 } } }, get, oa())).rejects.toThrow(/LoRA/);
  });
  it('Fal retains explicit advanced fields from live OpenAPI and refuses undeclared knobs', () => {
    const props = loadFalLiveProps(kling);
    expect(buildFalVideoRequest(kling, { image_url: 'a', generate_audio: false, end_image_url: 'b' }, props).payload).toMatchObject({ generate_audio: false, end_image_url: 'b' });
    expect(() => buildFalVideoRequest(kling, { image_url: 'a', future_knob: 1 }, props)).toThrow(/不支持.*future_knob/);
    for (const field of ['num_images', 'image_size']) expect(() => buildFalVideoRequest(kling, { image_url: 'a', custom_parameters: { [field]: field === 'num_images' ? 1 : 'square' } }, props)).toThrow(/不支持/);
  });
  it('Fal maps aliases before overrides and detects conflicting same-source fps/steps', () => {
    const wan = loadFalLiveProps('fal-ai/wan-i2v');
    const built = buildFalVideoRequest('fal-ai/wan-i2v', { image_url: 'a', steps: 20, custom_parameters: { steps: 30 } }, wan);
    expect(built.payload.num_inference_steps).toBe(30);
    expect(built.payload).not.toHaveProperty('steps');
    expect(built.overrides.num_inference_steps).toEqual({ before: 20, after: 30 });
    expect(() => buildFalVideoRequest('fal-ai/wan-i2v', { image_url: 'a', custom_parameters: { fps: 20, frames_per_second: 24 } }, wan)).toThrow(/不一致/);
    expect(() => buildFalVideoRequest('fal-ai/wan-i2v', { image_url: 'a', steps: 20, num_inference_steps: 30 }, wan)).toThrow(/不一致/);
  });
  it('allows explicit Comfy ZImage and uses diffuserModel for source override', async () => {
    const source = 'urn:air:zimageturbo:diffusionmodel:civitai:1@2';
    expect(await buildCivitaiImageInput({ model: 'turbo', comfyModel: 'turbo', ecosystem: 'zImage', engine: 'comfy' }, get, oa())).toMatchObject({ model: 'turbo', engine: 'comfy' });
    expect(await buildCivitaiImageInput({ model: source, comfyModel: 'turbo', ecosystem: 'zImage', engine: 'comfy' }, get, oa())).toMatchObject({ model: 'turbo', diffuserModel: source });
  });
  it('constructs API LoCon AIR as lycoris', async () => {
    const api = async () => new Response(JSON.stringify({ id: 2, modelId: 1, baseModel: 'SDXL 1.0', model: { type: 'LoCon' } }));
    expect(await resolveCivitaiResource('1@2', api)).toBe('urn:air:sdxl:lycoris:civitai:1@2');
  });
  it('constructs missing API AIR with the official root namespace for each ZImage variant', async () => {
    for (const [baseModel, namespace] of [['ZImageTurbo', 'zimageturbo'], ['ZImageBase', 'zimagebase']]) {
      const api = async () => new Response(JSON.stringify({ id: 2, modelId: 1, baseModel, model: { type: 'LoCon' } }));
      expect(await resolveCivitaiResource('1@2', api)).toBe(`urn:air:${namespace}:lycoris:civitai:1@2`);
    }
  });
  it('keeps zimagebase AIR only on base selector', async () => {
    const resource = 'urn:air:zimagebase:lora:civitai:3@4';
    expect(await buildCivitaiImageInput({ model: 'base', comfyModel: 'base', ecosystem: 'zImage', engine: 'sdcpp', loras: [{ civitaiId: resource, strength: 1 }] }, get, oa())).toMatchObject({ loras: { [resource]: 1 } });
    await expect(buildCivitaiImageInput({ model: 'turbo', comfyModel: 'turbo', ecosystem: 'zImage', engine: 'sdcpp', loras: [{ civitaiId: resource, strength: 1 }] }, get, oa())).rejects.toThrow(/生态.*冲突/);
  });
  it('Anima uses diffuserModel on either engine', async () => {
    const source = 'urn:air:anima:diffusionmodel:civitai:1@2';
    for (const engine of ['sdcpp', 'comfy']) expect(await buildCivitaiImageInput({ model: source, engine }, get, oa())).toMatchObject({ diffuserModel: source });
  });
  it('Comfy variant strength follows live OpenAPI branch rather than engine alone', async () => {
    for (const ecosystem of ['flux2Dev', 'flux2Klein']) {
      const input = await buildCivitaiImageInput({ model: 'urn:air:flux2:diffusionmodel:civitai:1@2', engine: 'comfy', ecosystem, image_url: 'a', denoise: 0.2 }, get, oa());
      expect(input.strength).toBe(0.2); expect(input).not.toHaveProperty('denoiseStrength');
    }
    // Live SDXL createVariant declares `strength` (not denoiseStrength).
    expect(await buildCivitaiImageInput({ model, engine: 'comfy', ecosystem: 'sdxl', image_url: 'a', denoise: 0.2 }, get, oa())).toMatchObject({ strength: 0.2 });
  });
});
