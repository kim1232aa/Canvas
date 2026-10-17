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

it('prefers repo id in name over HTTPS path (canvas downloadUrl residue)', () => {
  expect(buildModelScopeLoras([{
    name: 'LcarsPicturesDatabase/ST-TNG-Rooms-Z-Image-Turbo-v1',
    path: 'https://huggingface.co/foo/bar/resolve/main/lora.safetensors',
    strength: 1,
  }])).toEqual({'LcarsPicturesDatabase/ST-TNG-Rooms-Z-Image-Turbo-v1': 1});
});
it('rejects path_or_id/weight and bare path/scale object (agy / fal shapes)', () => {
  expect(() => buildModelScopeLoras({ path_or_id: 'owner/a', weight: 1 })).toThrow(/path_or_id|loras/);
  expect(() => buildModelScopeLoras({ path: 'owner/a', scale: 1 })).toThrow(/path\/scale|loras/);
});
it('payload contract: array maps to official loras object, never path/scale keys', () => {
  const out = buildModelScopeLoras([{ name: 'owner/a', strength: 0.6 }, { id: 'owner/b', modelStrength: 0.4 }]);
  expect(out).toEqual({ 'owner/a': 0.6, 'owner/b': 0.4 });
  expect(JSON.stringify(out)).not.toMatch(/"path"|"scale"|"path_or_id"/);
});
