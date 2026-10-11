import { afterEach, describe, expect, it } from 'vitest';
import { CivitaiDriver } from '../engines/drivers/CivitaiDriver';
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
import { buildCivitaiImageInput, resolveCivitaiResource } from './civitaiImageContract';

const air = 'urn:air:sdxl:checkpoint:civitai:12@34';
const api = (rows: Record<string, unknown>) => async (url: string) => new Response(JSON.stringify(rows[url.split('/').pop()!] ?? {}), { status: url.includes('model-versions') ? 200 : 404 });

describe('Civitai resource identity', () => {
  it('keeps API AIR including ecosystem, file and resource kind intact', async () => {
    const exact = 'urn:air:illustrious:diffusionmodel:civitai:12@34+56';
    expect(await resolveCivitaiResource('12@34', api({34: { id: 34, modelId: 12, air: exact }}))).toBe(exact);
  });
  it('checks modelId before trusting API AIR', async () => {
    await expect(resolveCivitaiResource('99@34', api({34: { id: 34, modelId: 12, air }}))).rejects.toThrow(/modelId/);
  });
  it('does not pick version namespace when a numeric model ID also exists', async () => {
    const get = async (url: string) => new Response(JSON.stringify(url.includes('model-versions') ? { id: 34, modelId: 12, air } : { id: 34, modelVersions: [{ id: 98, air: 'urn:air:sdxl:checkpoint:civitai:34@98' }] }));
    await expect(resolveCivitaiResource('34', get)).rejects.toMatchObject({ status: 400, candidates: expect.any(Array) });
  });
  it('reports numeric ambiguity even when version AIR metadata is absent', async () => {
    const get = async (url: string) => new Response(JSON.stringify(url.includes('model-versions') ? { id: 34, modelId: 12 } : { id: 34, modelVersions: [{ id: 98 }] }));
    await expect(resolveCivitaiResource('34', get)).rejects.toMatchObject({ status: 400, candidates: expect.any(Array) });
  });
  it('preserves upstream status and body from resource lookup', async () => {
    await expect(resolveCivitaiResource('12@34', async () => new Response('rate limited', { status: 429 }))).rejects.toMatchObject({ status: 429, rawResponse: 'rate limited', errorSource: 'upstream' });
  });
  it('requires real API type, preserving LoCon and embedding rather than caller fallback', async () => {
    expect(await resolveCivitaiResource('12@34', api({34: { id: 34, modelId: 12, baseModel: 'SDXL 1.0', model: { type: 'LoCon' } }}))).toBe('urn:air:sdxl:lycoris:civitai:12@34');
    expect(await resolveCivitaiResource('12@34', api({34: { id: 34, modelId: 12, baseModel: 'SDXL 1.0', model: { type: 'TextualInversion' } }}))).toBe('urn:air:sdxl:embedding:civitai:12@34');
  });
});

describe('Civitai image request contract', () => {
  it('accepts the exported ZImage preset without rewriting the API resource AIR', async () => {
    const { WORKFLOW_PRESETS } = await import('../constants/presets');
    const { extractWorkflowParameters } = await import('../utils/graphEngine');
    const preset = WORKFLOW_PRESETS.find(p => p.id === 'civitai-129705858-zimage-asianmix')!;
    const params = extractWorkflowParameters(preset.nodes, preset.connections);
    const resource = 'urn:air:zimageturbo:lycoris:civitai:2328130@2920318';
    const input = await buildCivitaiImageInput({ model: params.checkpointModel, prompt: params.positivePrompt, engine: params.civitaiEngine, ecosystem: params.civitaiEcosystem, comfyModel: params.civitaiModel, loras: params.loras }, async () => new Response(JSON.stringify({ id: 2920318, modelId: 2328130, baseModel: 'ZImageTurbo', model: { type: 'LoCon' }, air: resource })));
    expect(input).toMatchObject({ engine: 'sdcpp', ecosystem: 'zImage', model: 'turbo', loras: { [resource]: 0.8 } });
  });
  it('rejects clearly typed adapters or embeddings as a traditional base model', async () => {
    for (const type of ['lora', 'lycoris', 'locon', 'embedding', 'vae', 'controlnet', 'upscaler']) {
      await expect(buildCivitaiImageInput({ model: `urn:air:sdxl:${type}:civitai:1@2`, engine: 'comfy' }, api({}))).rejects.toThrow(/底模.*类型/);
    }
    expect(await buildCivitaiImageInput({ model: 'urn:air:flux1:diffusionmodel:civitai:1@2', engine: 'sdcpp' }, api({}))).toMatchObject({ diffuserModel: 'urn:air:flux1:diffusionmodel:civitai:1@2' });
  });
  it('maps documented SD1 AIR namespace to the request discriminator without rewriting resources', async () => {
    const source = 'urn:air:sd15:checkpoint:civitai:1@2';
    const lora = 'urn:air:sd15:lora:civitai:3@4';
    expect(await buildCivitaiImageInput({ model: source, engine: 'sdcpp', ecosystem: 'sd1', loras: [{ civitaiId: lora, strength: 0.5 }] }, api({}))).toMatchObject({ ecosystem: 'sd1', model: source, loras: { [lora]: 0.5 } });
    expect(await buildCivitaiImageInput({ model: source, engine: 'sdcpp' }, api({}))).toMatchObject({ ecosystem: 'sd1', model: source });
  });
  it('does not infer arbitrary family aliases or extend turbo resources to a base selector', async () => {
    for (const ecosystem of ['zimage', 'ZImageTurbo', 'flux1']) await expect(buildCivitaiImageInput({ model: 'turbo', engine: 'sdcpp', ecosystem: 'zImage', comfyModel: 'turbo', loras: [{ civitaiId: `urn:air:${ecosystem}:lora:civitai:1@2`, strength: 1 }] }, api({}))).rejects.toThrow(/生态.*冲突/);
    await expect(buildCivitaiImageInput({ model: 'base', engine: 'sdcpp', ecosystem: 'zImage', comfyModel: 'base', loras: [{ civitaiId: 'urn:air:zimageturbo:lora:civitai:1@2', strength: 1 }] }, api({}))).rejects.toThrow(/生态.*冲突/);
  });
  it('keeps Comfy SDXL sampler and source AIR in model', async () => {
    const input = await buildCivitaiImageInput({ model: air, engine: 'comfy', ecosystem: 'sdxl', sampler_name: 'dpmpp_2m', scheduler: 'normal', prompt: 'scene' }, async () => { throw new Error('unexpected lookup'); });
    expect(input).toMatchObject({ engine: 'comfy', ecosystem: 'sdxl', model: air, sampler: 'dpmpp_2m', scheduler: 'normal' });
    expect(input).not.toHaveProperty('diffusionModel');
  });
  it('passes actual Civitai driver engine/ecosystem/selector through the server builder', async () => {
    let input: Record<string, unknown> | undefined;
    globalThis.fetch = async (_url, init) => {
      input = await buildCivitaiImageInput(JSON.parse(String(init?.body)), api({}));
      return new Response(JSON.stringify({ imageUrl: 'https://example.com/out.png', mediaUrl: 'https://example.com/out.png' }));
    };
    await new CivitaiDriver().generate({ model: 'turbo', prompt: 'scene', extraParams: { engine: 'sdcpp', ecosystem: 'zImage', comfyModel: 'turbo' } }, {});
    expect(input).toMatchObject({ engine: 'sdcpp', ecosystem: 'zImage', model: 'turbo', operation: 'createImage' });
  });
  it('uses sdcpp enums without renaming a Comfy sampler', async () => {
    const input = await buildCivitaiImageInput({ model: air, engine: 'sdcpp', sampler_name: 'dpm++2m', scheduler: 'discrete' }, api({}));
    expect(input).toMatchObject({ model: air, sampleMethod: 'dpm++2m', schedule: 'discrete' });
    await expect(buildCivitaiImageInput({ model: air, engine: 'sdcpp', sampler_name: 'dpmpp_2m' }, api({}))).rejects.toThrow(/sampleMethod/);
    await expect(buildCivitaiImageInput({ model: air, engine: 'sdcpp', scheduler: 'normal' }, api({}))).rejects.toThrow(/schedule/);
  });
  it('rejects ecosystem mismatch without family guessing', async () => {
    await expect(buildCivitaiImageInput({ model: air, engine: 'comfy', ecosystem: 'flux1' }, api({}))).rejects.toThrow(/生态.*冲突/);
  });
  it('ZImage selector skips AIR resolution and only creates images', async () => {
    const input = await buildCivitaiImageInput({ model: 'turbo', comfyModel: 'turbo', ecosystem: 'zImage', engine: 'sdcpp', prompt: 'scene' }, async () => { throw new Error('selector must not resolve'); });
    expect(input).toMatchObject({ engine: 'sdcpp', ecosystem: 'zImage', model: 'turbo', operation: 'createImage' });
    await expect(buildCivitaiImageInput({ model: 'base', comfyModel: 'base', ecosystem: 'zImage', engine: 'sdcpp', image_url: 'a' }, api({}))).rejects.toThrow(/createImage/);
  });
  it('Krea Comfy turbo accepts no diffusion override and real AIR LoRA', async () => {
    const lora = 'urn:air:krea2:locon:civitai:1@2';
    const input = await buildCivitaiImageInput({ model: 'turbo', comfyModel: 'turbo', ecosystem: 'krea2', engine: 'comfy', loras: [{ civitaiId: lora, strength: 0.8 }] }, api({}));
    expect(input).toMatchObject({ engine: 'comfy', ecosystem: 'krea2', model: 'turbo', loras: { [lora]: 0.8 } });
    expect(input).not.toHaveProperty('diffusionModel');
  });
  it('rejects checkpoint masquerading as LoRA and preserves unknown ecosystem knobs', async () => {
    await expect(buildCivitaiImageInput({ model: air, loras: [{ civitaiId: air, strength: 1 }] }, api({}))).rejects.toThrow(/LoRA/);
    expect(await buildCivitaiImageInput({ model: 'urn:air:future:checkpoint:civitai:1@2', engine: 'comfy', sampler_name: 'future_sampler' }, api({}))).toMatchObject({ ecosystem: 'future', sampler: 'future_sampler' });
  });
});
