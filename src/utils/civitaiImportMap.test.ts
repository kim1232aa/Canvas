import { describe, it, expect } from 'vitest';
import { mapSampler, mapScheduler, resolveImportedNegativePrompt, resolveImportedCheckpointRef, resolveRawImportNegativeSamplerScheduler } from './civitaiImportMap';

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

describe('resolveRawImportNegativeSamplerScheduler (plain-text import)', () => {
  const template = 'blurry, bad anatomy, deformed fingers, low resolution, poorly drawn face, plastic skin, oversaturated, text, watermark';

  it('blank / missing negative stays empty — never the blurry template', () => {
    const noNeg = 'masterpiece, 1girl\nSteps: 20, CFG scale: 7, Seed: 1, Size: 512x512';
    expect(resolveRawImportNegativeSamplerScheduler(noNeg).negativePrompt).toBe('');
    expect(resolveRawImportNegativeSamplerScheduler(noNeg).negativePrompt).not.toContain('blurry');

    const blankNeg = 'masterpiece, 1girl\nNegative prompt:\nSteps: 20, Sampler: Euler, CFG scale: 7';
    expect(resolveRawImportNegativeSamplerScheduler(blankNeg).negativePrompt).toBe('');
    expect(resolveRawImportNegativeSamplerScheduler(blankNeg).negativePrompt).not.toBe(template);
  });

  it('real non-empty source negative is kept as written', () => {
    const text = 'a cat\nNegative prompt: soft focus, low contrast\nSteps: 20, Sampler: Euler';
    expect(resolveRawImportNegativeSamplerScheduler(text).negativePrompt).toBe('soft focus, low contrast');
  });

  it('missing sampler stays empty — no er_sde_simple / euler / sgm_uniform forge', () => {
    const text = 'a dog\nNegative prompt:\nSteps: 28, CFG scale: 5, Seed: 42, Size: 1024x1024';
    const r = resolveRawImportNegativeSamplerScheduler(text);
    expect(r.sampler).toBe('');
    expect(r.scheduler).toBe('');
    expect(r.sampler).not.toBe('er_sde_simple');
    expect(r.sampler).not.toBe('euler');
    expect(r.scheduler).not.toBe('sgm_uniform');
    expect(r.scheduler).not.toBe('karras');
  });

  it('explicit Euler stays Euler; does not invent scheduler from sampler name', () => {
    const text = 'portrait\nNegative prompt: bad hands\nSteps: 20, Sampler: Euler, CFG scale: 7';
    const r = resolveRawImportNegativeSamplerScheduler(text);
    expect(r.sampler).toBe('euler');
    expect(r.scheduler).toBe(''); // no explicit Schedule/Scheduler field
    expect(r.negativePrompt).toBe('bad hands');
  });

  it('explicit Schedule type is mapped; Unknown/Undefined stay empty', () => {
    const withKarras = 'x\nSteps: 20, Sampler: DPM++ 2M, Schedule type: Karras, CFG scale: 7';
    expect(resolveRawImportNegativeSamplerScheduler(withKarras).sampler).toBe('dpmpp_2m');
    expect(resolveRawImportNegativeSamplerScheduler(withKarras).scheduler).toBe('karras');

    const undefinedSched = 'x\nSteps: 20, Sampler: Undefined, Schedule type: Undefined';
    const u = resolveRawImportNegativeSamplerScheduler(undefinedSched);
    expect(u.sampler).toBe('');
    expect(u.scheduler).toBe('');

    // Karras embedded in sampler name must NOT become scheduler
    const embedded = 'x\nSteps: 20, Sampler: DPM++ 2M Karras, CFG scale: 7';
    const e = resolveRawImportNegativeSamplerScheduler(embedded);
    expect(e.sampler).toBe('dpmpp_2m');
    expect(e.scheduler).toBe('');
  });

  it('image-import empty negative still empty (resolveImportedNegativePrompt unchanged)', () => {
    expect(resolveImportedNegativePrompt(undefined, template)).toBe('');
    expect(resolveImportedNegativePrompt('', template)).toBe('');
    expect(resolveImportedNegativePrompt(null, template)).toBe('');
  });
});
