import {it, expect} from 'vitest';
import {buildModelScopeLoras} from './modelScopeLoras';
it('maps explicit ModelScope repository weights and preserves the total', () => {
  expect(buildModelScopeLoras([{name: 'artist/a', modelStrength: .6}, {name: 'artist/b', modelStrength: .4}])).toEqual({'artist/a': .6, 'artist/b': .4});
  expect(buildModelScopeLoras('artist/a')).toBe('artist/a');
});
it('rejects filenames, ambiguous identifiers, and hidden weight normalization', () => {
  expect(() => buildModelScopeLoras([{name: 'style.safetensors', strength: 1}])).toThrow(/仓库 ID/);
  expect(() => buildModelScopeLoras({'artist/a': .8})).toThrow(/1.0/);
  expect(() => buildModelScopeLoras([ {name: 'artist/a', strength: .5}, {name: 'artist/a', strength: .5} ])).toThrow(/重复/);
});
