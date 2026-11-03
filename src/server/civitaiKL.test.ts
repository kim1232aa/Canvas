import { describe, it, expect } from 'vitest';
import { buildCivitaiImageRequest } from './civitaiImageContract';
import { loadCivitaiImageGenOpenApi } from './fixtures/liveSchemaFixtures';
const oa = () => loadCivitaiImageGenOpenApi();
import { getFieldSpec, civitaiEngines, civitaiEcosystemsFor } from '../schemas/providerSchema';
const get = async () => ({});
describe('Civitai K/L (live OpenAPI wire names)', () => {
  it('L: flux2+dev cfg → guidanceScale; steps follow live (steps, not cfgScale)', async () => {
    const b: any = await buildCivitaiImageRequest({ model: 'urn:air:flux2:checkpoint:civitai:1@2', engine: 'flux2', ecosystem: 'dev', prompt: 'x', steps: 20, cfg: 3.5 }, get as any, oa());
    expect(b.payload.guidanceScale).toBe(3.5);
    expect(b.payload.cfgScale).toBeUndefined();
    // Live imageGen OpenAPI (2026-11-03): Flux2DevImageGenInput declares `steps` (not numInferenceSteps).
    expect(b.payload.steps).toBe(20);
    expect(b.payload.numInferenceSteps).toBeUndefined();
  });
  it('K: comfy:krea2 static clue still unverified (UI only; outbound uses live)', () => {
    expect(getFieldSpec('civitai', 'comfy:krea2', 'steps')?.status).toBe('unverified');
    expect(getFieldSpec('civitai', 'comfy:krea2', 'cfg')?.status).toBe('unverified');
  });
});
describe('M: Flux2 Dev native path from live OpenAPI (no rerouting)', () => {
  const air = 'urn:air:flux2:checkpoint:civitai:1@2';
  it('flux2:dev createImage → engine flux2, model dev, no ecosystem, live fields', async () => {
    const b: any = await buildCivitaiImageRequest({ model: air, engine: 'flux2', ecosystem: 'dev', prompt: 'x', steps: 28, cfg: 2.5, seed: 1, width: 1024, height: 1024 }, get as any, oa());
    expect(b.payload).toMatchObject({ engine: 'flux2', model: 'dev', operation: 'createImage', steps: 28, guidanceScale: 2.5 });
    expect(b.payload.ecosystem).toBeUndefined(); expect(b.payload.cfgScale).toBeUndefined();
  });
  it('missing live OpenAPI → schema missing (static cannot authorize)', async () => {
    await expect(buildCivitaiImageRequest({ model: air, engine: 'flux2', ecosystem: 'dev', prompt: 'x' }, get as any)).rejects.toThrow(/拿不到|OpenAPI|未发送/);
  });
  it('sdcpp:flux2Dev createVariant still works via live branch', async () => {
    const b: any = await buildCivitaiImageRequest({ model: air, ecosystem: 'flux2Dev', prompt: 'x', image_url: 'https://image.civitai.com/a.jpeg', denoise: 0.7 }, get as any, oa());
    expect(b.payload).toMatchObject({ engine: 'sdcpp', ecosystem: 'flux2Dev', operation: 'createVariant', strength: 0.7 });
  });
  it('picker offers flux2 engine with dev ecosystem (static clue)', () => {
    expect(civitaiEngines()).toContain('flux2');
    expect(civitaiEcosystemsFor('flux2')).toContain('dev');
  });
});
