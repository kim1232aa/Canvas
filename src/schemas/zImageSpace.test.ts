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
