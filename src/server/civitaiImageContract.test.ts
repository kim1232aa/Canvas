import { afterEach, describe, expect, it } from 'vitest';
import { CivitaiDriver } from '../engines/drivers/CivitaiDriver';
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
import { buildCivitaiImageInput, buildCivitaiImageRequest, resolveCivitaiResource, CivitaiSchemaMissingError } from './civitaiImageContract';
import { loadCivitaiImageGenOpenApi } from './fixtures/liveSchemaFixtures';
const oa = () => loadCivitaiImageGenOpenApi();

const air = 'urn:air:sdxl:checkpoint:civitai:12@34';
const api = (rows: Record<string, unknown>) => async (url: string) => new Response(JSON.stringify(rows[url.split('/').pop()!] ?? {}), { status: url.includes('model-versions') ? 200 : 404 });

describe('Civitai resource identity', () => {
  it('resolves explicit JSON model override and records the actual resource', async () => {
    const actual = 'urn:air:sdxl:checkpoint:civitai:56@78';
    const built = await buildCivitaiImageRequest({ model: air, prompt: 'a', custom_parameters: { model: actual, cfgScale: 0 } }, api({}), oa());
    expect(built.payload.model).toBe(actual);
    expect(built.payload.cfgScale).toBe(0);
    await expect(buildCivitaiImageRequest({ model: air, custom_parameters: { headers: { authorization: 'x' } } }, api({}), oa())).rejects.toThrow();
  });
  it('keeps API AIR including ecosystem, file and resource kind intact', async () => {
    const exact = 'urn:air:illustrious:diffusionmodel:civitai:12@34+56';
    expect(await resolveCivitaiResource('12@34', api({34: { id: 34, modelId: 12, air: exact }}))).toBe(exact);
  });
  it('resolves the civitai:modelId@versionId reference emitted by workflow import', async () => {
    expect(await resolveCivitaiResource('civitai:12@34', api({34: { id: 34, modelId: 12, air }}))).toBe(air);
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
  it('accepts the standard civitai t2i preset engine selectors without requiring a historical AIR', async () => {
    const { WORKFLOW_PRESETS } = await import('../constants/presets');
    const { extractWorkflowParameters } = await import('../utils/graphEngine');
    const preset = WORKFLOW_PRESETS.find(p => p.id === 'std-civitai-t2i')!;
    expect(preset).toBeTruthy();
    const nodes = preset.nodes.map(n => n.type === 'CLIPTextEncode' && !(n.values as any)?.text ? { ...n, values: { ...n.values, text: '填入配方/用户指定' } } : n);
    const params = extractWorkflowParameters(nodes, preset.connections);
    expect(params.targetProvider).toBe('civitai');
    expect(params.civitaiEngine).toBe('comfy');
    expect(params.civitaiEcosystem).toBe('krea2');
    expect(params.checkpointModel).toBe('turbo');
    const input = await buildCivitaiImageInput({ model: params.checkpointModel, prompt: params.positivePrompt, engine: params.civitaiEngine, ecosystem: params.civitaiEcosystem, comfyModel: params.civitaiModel || 'turbo', loras: [] }, api({}), oa());
    expect(input).toMatchObject({ engine: 'comfy', ecosystem: 'krea2', model: 'turbo' });
  });
  it('maps documented SD1 AIR namespace to the request discriminator without rewriting resources', async () => {
    const source = 'urn:air:sd15:checkpoint:civitai:1@2';
    const lora = 'urn:air:sd15:lora:civitai:3@4';
    expect(await buildCivitaiImageInput({ model: source, engine: 'sdcpp', ecosystem: 'sd1', loras: [{ civitaiId: lora, strength: 0.5 }] }, api({}), oa())).toMatchObject({ ecosystem: 'sd1', model: source, loras: { [lora]: 0.5 } });
    expect(await buildCivitaiImageInput({ model: source, engine: 'sdcpp' }, api({}), oa())).toMatchObject({ ecosystem: 'sd1', model: source });
  });
  it('keeps Comfy SDXL sampler and source AIR in model', async () => {
    const input = await buildCivitaiImageInput({ model: air, engine: 'comfy', ecosystem: 'sdxl', sampler_name: 'dpmpp_2m', scheduler: 'normal', prompt: 'scene' }, async () => { throw new Error('unexpected lookup'); }, oa());
    expect(input).toMatchObject({ engine: 'comfy', ecosystem: 'sdxl', model: air, sampler: 'dpmpp_2m', scheduler: 'normal' });
    expect(input).not.toHaveProperty('diffusionModel');
  });
  it('passes actual Civitai driver engine/ecosystem/selector through the server builder', async () => {
    let input: Record<string, unknown> | undefined;
    globalThis.fetch = async (_url, init) => {
      input = await buildCivitaiImageInput(JSON.parse(String(init?.body)), api({}), oa());
      return new Response(JSON.stringify({ imageUrl: 'https://example.com/out.png', mediaUrl: 'https://example.com/out.png' }));
    };
    await new CivitaiDriver().generate({ model: 'turbo', prompt: 'scene', extraParams: { engine: 'sdcpp', ecosystem: 'zImage', comfyModel: 'turbo' } }, {});
    expect(input).toMatchObject({ engine: 'sdcpp', ecosystem: 'zImage', model: 'turbo', operation: 'createImage' });
  });
  it('comfy:krea2+turbo live declares negativePrompt/width — sends when provided', async () => {
    const n = await buildCivitaiImageInput({ model: 'turbo', comfyModel: 'turbo', ecosystem: 'krea2', engine: 'comfy', prompt: 'scene', negative_prompt: 'blur', width: 1024, height: 1024 }, api({}), oa());
    expect(n).toMatchObject({ negativePrompt: 'blur', width: 1024, height: 1024 });
  });
  it('Flux2 Dev builds loras[] {air,strength} (not Klein map)', async () => {
    const lora = 'urn:air:flux2:lora:civitai:3@4';
    const input = await buildCivitaiImageInput({
      model: 'urn:air:flux2:checkpoint:civitai:1@2',
      engine: 'flux2',
      ecosystem: 'dev',
      prompt: 'x',
      loras: [{ civitaiId: lora, strength: 0.7 }],
    }, api({}), oa());
    expect(input.loras).toEqual([{ air: lora, strength: 0.7 }]);
  });
  it('rejects clip-only LoRA strength instead of silently invoking an upstream default', async () => {
    const lora = 'urn:air:flux2:lora:civitai:3@4';
    await expect(buildCivitaiImageInput({
      model: 'urn:air:flux2:checkpoint:civitai:1@2',
      engine: 'flux2',
      ecosystem: 'dev',
      loras: [{ civitaiId: lora, clipStrength: 0.7 }],
    }, api({}), oa())).rejects.toThrow(/clipStrength.*modelStrength|clipStrength.*strength|模型强度/);
  });
  it('Flux2 Klein still builds AIR→strength loras map', async () => {
    const lora = 'urn:air:flux2:lora:civitai:5@6';
    const input = await buildCivitaiImageInput({
      model: 'urn:air:flux2:checkpoint:civitai:1@2',
      engine: 'sdcpp',
      ecosystem: 'flux2Klein',
      prompt: 'x',
      loras: [{ civitaiId: lora, strength: 0.5 }],
    }, api({}), oa());
    expect(input).toMatchObject({ ecosystem: 'flux2Klein', loras: { [lora]: 0.5 } });
  });
  it('Flux1 still builds AIR→strength loras map', async () => {
    const lora = 'urn:air:flux1:lora:civitai:3@4';
    const input = await buildCivitaiImageInput({ model: 'urn:air:flux1:checkpoint:civitai:1@2', engine: 'comfy', ecosystem: 'flux1', loras: [{ civitaiId: lora, strength: 0.7 }] }, api({}), oa());
    expect(input).toMatchObject({ ecosystem: 'flux1', loras: { [lora]: 0.7 } });
  });
  it('maps clipSkip to outbound body on SD1.5 (sdcpp and comfy) but omits it on SDXL and FLUX', async () => {
    const sd1 = 'urn:air:sd1:checkpoint:civitai:4384@128713';
    const sd1InputSdcpp = await buildCivitaiImageInput({ model: sd1, engine: 'sdcpp', ecosystem: 'sd1', prompt: 'p', clipSkip: 2 }, api({}), oa());
    expect(sd1InputSdcpp).toMatchObject({ engine: 'sdcpp', ecosystem: 'sd1', clipSkip: 2 });

    const sd1InputComfy = await buildCivitaiImageInput({ model: sd1, engine: 'comfy', ecosystem: 'sd1', prompt: 'p', clip_skip: 2 }, api({}), oa());
    expect(sd1InputComfy).toMatchObject({ engine: 'comfy', ecosystem: 'sd1', clipSkip: 2 });

    // SDXL: official recipe specifies clipSkip is not supported (would return 400); contract omits it
    const sdxlInput = await buildCivitaiImageInput({ model: air, engine: 'sdcpp', ecosystem: 'sdxl', prompt: 'p', clipSkip: 2 }, api({}), oa());
    expect(sdxlInput).not.toHaveProperty('clipSkip');

    // Flux1: no clipSkip
    const fluxInput = await buildCivitaiImageInput({ model: 'urn:air:flux1:checkpoint:civitai:1@2', engine: 'comfy', ecosystem: 'flux1', prompt: 'p', clipSkip: 2 }, api({}), oa());
    expect(fluxInput).not.toHaveProperty('clipSkip');
  });
  it('live OpenAPI missing → CivitaiSchemaMissingError (no static outbound)', async () => {
    await expect(buildCivitaiImageRequest({ model: 'urn:air:flux1:checkpoint:civitai:1@2', prompt: 'x', engine: 'comfy', ecosystem: 'flux1' }, api({}))).rejects.toBeInstanceOf(CivitaiSchemaMissingError);
  });
  it('P1-2: allowMatureContent in custom_parameters stays out of steps[0].input (workflow-level body only)', async () => {
    const res = await buildCivitaiImageRequest({
      model: 'urn:air:flux1:checkpoint:civitai:1@2',
      prompt: 'masterpiece',
      engine: 'comfy',
      ecosystem: 'flux1',
      custom_parameters: { allowMatureContent: false },
    }, api({}), oa());

    // Step input (payload) must NOT contain allowMatureContent
    expect(res.payload).not.toHaveProperty('allowMatureContent');
    // But customParameters retains it so server puts it at the workflow root next to steps
    expect(res.customParameters).toMatchObject({ allowMatureContent: false });
  });
});
