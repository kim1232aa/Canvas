import { describe, expect, it } from 'vitest';
import { buildCivitaiImageRequest } from './civitaiImageContract';
import { civitaiImageHistory } from './civitaiHistoryContract';
const model = 'urn:air:sdxl:checkpoint:civitai:1@2';
const get = async () => { throw new Error('unexpected lookup'); };
describe('Civitai normalized submission history', () => {
  it('normalizes top-level aliases and preserves advanced values before custom overrides', async () => {
    const built = await buildCivitaiImageRequest({ model, engine: 'comfy', cfgScale: 7, negativePrompt: 'A', sampler: 'heun', outputFormat: 'png', custom_parameters: { cfgScale: 2, negativePrompt: 'B' } }, get);
    expect(built.beforeCustom).toMatchObject({ cfgScale: 7, negativePrompt: 'A', sampler: 'heun', outputFormat: 'png' });
    expect(built.payload).toMatchObject({ cfgScale: 2, negativePrompt: 'B', sampler: 'heun', outputFormat: 'png' });
    expect(built.overrides.cfgScale).toEqual({ before: 7, after: 2 });
    await expect(buildCivitaiImageRequest({ model, cfg: 7, cfgScale: 2 }, get)).rejects.toThrow(/不一致/);
  });
  it('success and pending share actual submission values, then overlay confirmed upstream values', async () => {
    const built = await buildCivitaiImageRequest({ model, engine: 'comfy', prompt: 'A', negative_prompt: 'A negative', cfg: 7, custom_parameters: { prompt: 'B', negativePrompt: 'B negative', cfgScale: 2, seed: 0 } }, get);
    const pending = civitaiImageHistory(built.payload);
    const immediate = civitaiImageHistory(built.payload, { steps: 25, seed: 42 });
    expect(pending).toMatchObject({ prompt: 'B', negativePrompt: 'B negative', cfg: 2, seed: 0 });
    expect(immediate).toMatchObject({ prompt: 'B', negativePrompt: 'B negative', cfg: 2, seed: 42, steps: 25 });
    expect(civitaiImageHistory(built.payload, { prompt: 'C', cfgScale: 3 })).toMatchObject({ prompt: 'C', cfg: 3 });
  });
});
