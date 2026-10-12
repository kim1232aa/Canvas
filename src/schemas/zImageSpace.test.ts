import {describe, it, expect} from 'vitest';
import {buildZImagePayload, Z_IMAGE_RESOLUTIONS} from './zImageSpace';
import {fieldOptions} from './providerSchema';

const input = {prompt: 'test', resolution: '1152x896 ( 9:7 )', seed: 42, steps: 8, shift: 3, random_seed: false, gallery_images: []};

describe('official Z-Image Space contract', () => {
  it('uses the same current resolution options in UI and the seven-position request', () => {
    expect(fieldOptions('huggingface', 'Tongyi-MAI/Z-Image-Turbo', 'resolution').map(v => v.value)).toEqual(Z_IMAGE_RESOLUTIONS);
    expect(buildZImagePayload(input).data).toEqual(['test', '1152x896 ( 9:7 )', 42, 8, 3, false, []]);
  });
  it.each(['resolution', 'seed', 'steps', 'shift', 'random_seed', 'gallery_images'])('rejects missing %s without injecting a default', (field) => {
    const incomplete: Record<string, unknown> = {...input}; delete incomplete[field];
    expect(() => buildZImagePayload(incomplete)).toThrow(field);
  });
  it.each([{seed: -2}, {seed: Number.MAX_SAFE_INTEGER + 1}, {steps: 101}, {steps: 1.5}, {shift: 0}, {shift: NaN}, {resolution: '960x1440 ( 2:3 )'}])('rejects invalid values %j', (invalid) => {
    expect(() => buildZImagePayload({...input, ...invalid})).toThrow();
  });
});

describe('Z-Image custom JSON maps by live Gradio parameter name', () => {
  it('overrides named positions and records the override instead of appending values', () => {
    const built = buildZImagePayload({...input, custom_parameters: {steps: 12, prompt: 'advanced prompt'}});
    expect(built.data).toEqual(['advanced prompt', '1152x896 ( 9:7 )', 42, 12, 3, false, []]);
    expect(built.data).toHaveLength(7);
    expect(built.overrides).toEqual([
      {field: 'steps', requested: 8, custom: 12, applied: true},
      {field: 'prompt', requested: 'test', custom: 'advanced prompt', applied: true},
    ]);
  });
  it('validates overridden values with the same live contract', () => {
    expect(() => buildZImagePayload({...input, custom_parameters: {steps: 500}})).toThrow(/steps/);
  });
  it('rejects names absent from the live /generate signature rather than guessing a position', () => {
    expect(() => buildZImagePayload({...input, custom_parameters: {guidance_scale: 4}})).toThrow(/guidance_scale.*prompt, resolution, seed, steps, shift, random_seed, gallery_images/);
  });
});
