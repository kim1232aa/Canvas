import { describe, it, expect } from 'vitest';
import { buildCivitaiImageRequest } from './civitaiImageContract';
import { getFieldSpec, civitaiEngines, civitaiEcosystemsFor } from '../schemas/providerSchema';
const get = async () => ({});
describe('Civitai K/L (schema-driven wire names)', () => {
  it('L: flux2Dev steps/cfg go out as numInferenceSteps/guidanceScale, never steps/cfgScale', async () => {
    const b: any = await buildCivitaiImageRequest({ model: 'urn:air:flux2:checkpoint:civitai:1@2', engine: 'flux2', ecosystem: 'dev', prompt: 'x', steps: 20, cfg: 3.5 }, get as any);
    expect(b.payload.numInferenceSteps).toBe(20); expect(b.payload.guidanceScale).toBe(3.5);
    expect(b.payload.steps).toBeUndefined(); expect(b.payload.cfgScale).toBeUndefined();
  });
  it('K: comfy:krea2 steps/cfg are unverified (never supported/会发送)', () => {
    expect(getFieldSpec('civitai', 'comfy:krea2', 'steps')?.status).toBe('unverified');
    expect(getFieldSpec('civitai', 'comfy:krea2', 'cfg')?.status).toBe('unverified');
  });
});
describe('M: Flux2 Dev native path from spec data (no rerouting)', () => {
  const air = 'urn:air:flux2:checkpoint:civitai:1@2';
  it('flux2:dev createImage → engine flux2, model dev, no ecosystem, native fields', async () => {
    const b: any = await buildCivitaiImageRequest({ model: air, engine: 'flux2', ecosystem: 'dev', prompt: 'x', steps: 28, cfg: 2.5, seed: 1, width: 1024, height: 1024 }, get as any);
    expect(b.payload).toMatchObject({ engine: 'flux2', model: 'dev', operation: 'createImage', numInferenceSteps: 28, guidanceScale: 2.5 });
    expect(b.payload.ecosystem).toBeUndefined(); expect(b.payload.steps).toBeUndefined(); expect(b.payload.cfgScale).toBeUndefined();
  });
  it('flux2:dev steps out of 4–50 refused locally', async () => {
    await expect(buildCivitaiImageRequest({ model: air, engine: 'flux2', ecosystem: 'dev', prompt: 'x', steps: 60 }, get as any)).rejects.toThrow();
  });
  it('sdcpp:flux2Dev createImage → exact local block, no switch', async () => {
    await expect(buildCivitaiImageRequest({ model: air, ecosystem: 'flux2Dev', prompt: 'x' }, get as any)).rejects.toThrow('该路径仅用于图生图，文生图请选 Flux2 Dev（原生）');
    await expect(buildCivitaiImageRequest({ model: air, ecosystem: 'flux2Dev', operation: 'editImage', prompt: 'x' }, get as any)).rejects.toThrow('该路径仅用于图生图，文生图请选 Flux2 Dev（原生）');
  });
  it('sdcpp:flux2Dev createVariant still works', async () => {
    const b: any = await buildCivitaiImageRequest({ model: air, ecosystem: 'flux2Dev', prompt: 'x', image_url: 'https://image.civitai.com/a.jpeg', denoise: 0.7 }, get as any);
    expect(b.payload).toMatchObject({ engine: 'sdcpp', ecosystem: 'flux2Dev', operation: 'createVariant', strength: 0.7 });
  });
  it('picker offers flux2 engine with dev ecosystem', () => {
    expect(civitaiEngines()).toContain('flux2');
    expect(civitaiEcosystemsFor('flux2')).toContain('dev');
  });
});
