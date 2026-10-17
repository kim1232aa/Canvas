import { describe, it, expect } from 'vitest';
import { architectureChipsFrom, customImportFor } from './CivitaiModal';
describe('0320 hub', () => {
  it('chips come from loaded item tags', () => {
    expect(architectureChipsFrom([{ baseModel: 'flux_dev' }, { baseModel: 'ti' }, { baseModel: 'flux_dev' }, { baseModel: null }]).map(c => c.id)).toEqual(['all', 'flux_dev', 'ti']);
  });
  it('Civitai import text is not shown on Krea', () => {
    expect(customImportFor('krea')?.hint).not.toMatch(/Civitai/);
    expect(customImportFor('civitai')?.hint).toMatch(/Civitai/);
    expect(customImportFor('venice')).toBeUndefined();
  });
});
describe('0324 custom import is config-driven', () => {
  it('reads supportsCustomImport/idFormat from config data generically', () => {
    const cfg = { providers: { foo: { supportsCustomImport: true, idFormat: 'foo id', placeholder: 'p' }, bar: { supportsCustomImport: false, idFormat: 'x' } } };
    expect(customImportFor('foo', cfg)).toEqual({ hint: 'foo id', placeholder: 'p' });
    expect(customImportFor('bar', cfg)).toBeUndefined();
    expect(customImportFor('baz', cfg)).toBeUndefined();
  });
});
import { credentialRequirementFor } from './CivitaiModal';
describe('0334 credential requirement from config', () => {
  it('TAMS Bearer requirement removed (2026-10-17: Tensor.Art = OpenWorks only)', () => {
    expect(credentialRequirementFor('tensorart')).toBeUndefined();
    expect(credentialRequirementFor('openworks')).toBeUndefined();
    expect(credentialRequirementFor('civitai')).toBeUndefined();
  });
});
