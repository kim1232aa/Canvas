import {it, expect} from 'vitest';
import {buildModelScopeLoras} from './modelScopeLoras';
it('maps explicit ModelScope repository weights and preserves the total', () => {
  expect(buildModelScopeLoras([{name: 'artist/a', modelStrength: .6}, {name: 'artist/b', modelStrength: .4}])).toEqual({'artist/a': .6, 'artist/b': .4});
  expect(buildModelScopeLoras('artist/a')).toBe('artist/a');
});
it('rejects filenames, ambiguous identifiers, and hidden weight normalization', () => {
  expect(() => buildModelScopeLoras([{name: 'style.safetensors', strength: 1}])).toThrow(/仓库 ID/);
  expect(() => buildModelScopeLoras({'artist/a': .8})).toThrow(/1\.0/);
  expect(() => buildModelScopeLoras([ {name: 'artist/a', strength: .5}, {name: 'artist/a', strength: .5} ])).toThrow(/重复/);
});
it('rejects generic HTTPS weight URLs with an explicit ModelScope field error', () => {
  expect(() => buildModelScopeLoras([{
    name: 'darkbrush',
    path: 'https://huggingface.co/foo/bar/resolve/main/lora.safetensors',
    strength: 0.75,
  }])).toThrow(/HTTPS 权重 URL|仓库 ID/);
  expect(() => buildModelScopeLoras([{
    name: 'https://example.com/w.safetensors',
    strength: 1,
  }])).toThrow(/https:\/\/example\.com/);
});
it('rejects weights that do not sum to 1.0 without rescaling', () => {
  expect(() => buildModelScopeLoras([{name: 'owner/lora-a', strength: 0.75}])).toThrow(/合计=0\.75/);
  expect(() => buildModelScopeLoras([
    {name: 'owner/a', strength: 0.75},
    {name: 'owner/b', strength: 0.5},
  ])).toThrow(/不会自动改权重/);
});
