import { describe, it, expect } from 'vitest';
import { mapSampler, mapScheduler, resolveImportedNegativePrompt } from './civitaiImportMap';

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

  it('missing/unknown scheduler does not forge sgm_uniform', () => {
    expect(mapScheduler('')).toBe('');
    expect(mapScheduler('Undefined')).toBe('');
    expect(mapScheduler('none')).toBe('');
    expect(mapScheduler('weird_sched')).toBe('');
    expect(mapScheduler('karras')).toBe('karras');
    expect(mapScheduler('sgm_uniform')).toBe('sgm_uniform');
    expect(mapScheduler('simple')).toBe('simple');
  });
});
