import { describe, it, expect } from 'vitest';
import { civitaiVideoBaseModels, parseCivitaiAir, civitaiVersionVideoRow, replicateSearchVideoModels } from './videoCatalogOfficial';
import { liveVideoOption } from '../hooks/useLiveVideoModelMatch';

describe('official video catalogs', () => {
  it('Civitai video base models come from GET /enums BaseModel', () => {
    expect(civitaiVideoBaseModels({ BaseModel: ['SDXL 1.0', 'Wan Video 2.2 I2V-A14B', 'Hunyuan Video', 'Wan Image 2.7'] }))
      .toEqual(['Wan Video 2.2 I2V-A14B', 'Hunyuan Video']);
  });
  it('AIR → model-version row keyed by official air', () => {
    const air = 'urn:air:wanvideo-22-i2v-a14b:checkpoint:civitai:1817671@2114157';
    expect(parseCivitaiAir(air)).toEqual({ modelId: '1817671', versionId: '2114157' });
    const v = { id: 2114157, modelId: 1817671, name: '14B Image-to-Video', baseModel: 'Wan Video 2.2 I2V-A14B', air, model: { name: 'Wan Video 2.2', type: 'Checkpoint' } };
    expect(civitaiVersionVideoRow(v, ['Wan Video 2.2 I2V-A14B'])?.id).toBe(air);
    expect(civitaiVersionVideoRow(v, ['Hunyuan Video'])).toBeUndefined();
  });
  it('Replicate search keeps community video models; label shows version', () => {
    const rows = replicateSearchVideoModels({ models: [
      { model: { owner: 'wan-video', name: 'wan2.1-with-lora', latest_version: null }, metadata: { tags: ['text-to-video', 'image-to-video'] } },
      { model: { owner: 'x', name: 'img' }, metadata: { tags: ['text-to-image'] } },
    ] });
    expect(rows.map((m) => `${m.owner}/${m.name}`)).toEqual(['wan-video/wan2.1-with-lora']);
    expect(liveVideoOption({ id: 'wan-video/wan2.1-with-lora', name: 'wan-video/wan2.1-with-lora', latest_version: { id: 'c48fa8ec65b1' } })?.label)
      .toBe('wan-video/wan2.1-with-lora:c48fa8ec…');
  });
});

import { resolveCivitaiVersions, _resetCivitaiVersionCache } from './videoCatalogOfficial';
describe('resolveCivitaiVersions', () => {
  it('uses official air, bounds fetches, caches with TTL, drops unresolved', async () => {
    _resetCivitaiVersionCache();
    let t = 0; const calls: string[] = [];
    const fetchV = async (id: string) => { calls.push(id); return id === '3' ? { id: 3 } : { id: Number(id), air: `urn:air:x:checkpoint:civitai:9@${id}` }; };
    const r1 = await resolveCivitaiVersions(['1', '2', '3', '4'], fetchV, { maxFetch: 3, now: () => t });
    expect(r1.fetched).toBe(3);
    expect([...r1.versions.keys()].sort()).toEqual(['1', '2']); // 3 has no air, 4 over budget
    const r2 = await resolveCivitaiVersions(['1', '2', '3', '4'], fetchV, { maxFetch: 3, now: () => t });
    expect(r2.fetched).toBe(1); expect(r2.versions.get('4')?.air).toBe('urn:air:x:checkpoint:civitai:9@4');
    t = 11 * 60_000;
    expect((await resolveCivitaiVersions(['1'], fetchV, { now: () => t })).fetched).toBe(1);
  });
});
