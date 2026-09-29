import { describe, it, expect } from 'vitest';
import { mapSampler, mapScheduler, resolveImportedNegativePrompt, resolveImportedCheckpointRef } from './civitaiImportMap';

describe('civitai import mappers (hard gates)', () => {
  it('empty negative stays empty — never fills blurry template', () => {
    const template = 'blurry, bad anatomy, deformed fingers, low resolution, poorly drawn face, plastic skin, oversaturated, text, watermark';
    expect(resolveImportedNegativePrompt(undefined, template)).toBe('');
    expect(resolveImportedNegativePrompt(null, template)).toBe('');
    expect(resolveImportedNegativePrompt('', template)).toBe('');
    expect(resolveImportedNegativePrompt('soft focus', template)).toBe('soft focus');
  });

  it('Undefined sampler does not map to euler', () => {
    expect(mapSampler('Undefined')).toBe('');
    expect(mapSampler('undefined')).toBe('');
    expect(mapSampler('')).toBe('');
    expect(mapSampler('none')).toBe('');
    expect(mapSampler('totally_unknown_xyz')).toBe('');
    expect(mapSampler('euler')).toBe('euler');
    expect(mapSampler('Euler a')).toBe('euler_ancestral');
    expect(mapSampler('DPM++ 2M')).toBe('dpmpp_2m');
  });

  it('missing/unknown scheduler does not forge sgm_uniform or normal', () => {
    expect(mapScheduler('')).toBe('');
    expect(mapScheduler('Undefined')).toBe('');
    expect(mapScheduler('none')).toBe('');
    expect(mapScheduler('weird_sched')).toBe('');
    expect(mapScheduler('karras')).toBe('karras');
    expect(mapScheduler('sgm_uniform')).toBe('sgm_uniform');
    expect(mapScheduler('simple')).toBe('simple');
  });

  it('empty string survives ?? but not || — documents App.tsx fix', () => {
    // This is the exact pattern in App.tsx activeParams:
    //   sampler: ksamplerNode?.values?.sampler_name ?? activeFrame?.params?.sampler ?? 'euler'
    const importedSampler = '';  // mapSampler('Undefined') → ''
    const importedScheduler = ''; // no scheduler field → ''
    // With ?? (correct): '' ?? 'euler' === ''
    expect(importedSampler ?? 'euler').toBe('');
    expect(importedScheduler ?? 'normal').toBe('');
    // With || (old bug): '' || 'euler' === 'euler'
    expect(importedSampler || 'euler').toBe('euler');
  });
});

describe('resolveImportedCheckpointRef', () => {
  it('image 36481678: unique versionId from resources, not "Flux.1 D"', () => {
    // Real resources shape: modelType:"Checkpoint", modelId:618692, versionId:691639
    const resources = [
      { modelType: 'Checkpoint', modelName: 'FLUX', modelId: 618692, versionId: 691639, baseModel: 'Flux.1 D' },
    ];
    const meta = {
      Model: 'FLUX',
      civitaiResources: [{ type: 'checkpoint', modelVersionId: 691639 }],
    };
    const result = resolveImportedCheckpointRef(resources, meta, 'FLUX', 'Flux.1 D');
    expect(result).toBe('618692@691639');
    expect(result).not.toBe('Flux.1 D');
    expect(result).not.toBe('FLUX');
  });

  it('CHECKPOINT (uppercase) also matched', () => {
    const resources = [{ modelType: 'CHECKPOINT', modelId: 100, versionId: 200 }];
    expect(resolveImportedCheckpointRef(resources, {}, '', '')).toBe('100@200');
  });

  it('prefers air when present', () => {
    const resources = [{ modelType: 'Checkpoint', air: 'urn:air:flux1:checkpoint:civitai:618692@691639', modelId: 618692, versionId: 691639 }];
    expect(resolveImportedCheckpointRef(resources, {}, '', '')).toBe('urn:air:flux1:checkpoint:civitai:618692@691639');
  });

  it('falls back to meta.civitaiResources modelVersionId when no resources array', () => {
    const meta = { civitaiResources: [{ type: 'Checkpoint', modelVersionId: 691639 }] };
    expect(resolveImportedCheckpointRef(null, meta, 'FLUX', 'Flux.1 D')).toBe('691639');
  });

  it('ambiguous name preserved when no ids available', () => {
    const resources = [{ modelType: 'Checkpoint', modelName: 'FLUX' }];
    const meta = { Model: 'FLUX' };
    // No modelId, no versionId, no air, no civitaiResources
    const result = resolveImportedCheckpointRef(resources, meta, 'FLUX', 'Flux.1 D');
    // Falls through to meta.Model
    expect(result).toBe('FLUX');
  });

  it('no resources at all → fallbackName or baseModel', () => {
    expect(resolveImportedCheckpointRef(null, {}, '', 'Flux.1 D')).toBe('Flux.1 D');
    expect(resolveImportedCheckpointRef([], {}, 'MyModel', '')).toBe('MyModel');
    expect(resolveImportedCheckpointRef([], {}, '', '')).toBe('');
  });
});
