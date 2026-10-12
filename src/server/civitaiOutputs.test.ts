import { describe, expect, it } from 'vitest';
import { collectCivitaiImageOutputs } from './civitaiOutputs';

describe('Civitai complete image output collection', () => {
  it('retains all step and job images, preserving per-image seeds and deduplicating mirrored output', () => {
    expect(collectCivitaiImageOutputs({ steps: [{ output: { images: [{ url: 'https://example.test/a', seed: 0 }, { url: 'https://example.test/b', seed: 2 }] }, jobs: [{ result: { images: [{ url: 'https://example.test/a' }, { url: 'https://example.test/c' }] } }] }] })).toEqual([{ url: 'https://example.test/a', seed: 0 }, { url: 'https://example.test/b', seed: 2 }, { url: 'https://example.test/c' }]);
  });
  it('accepts legacy images without inventing output when none exists', () => {
    expect(collectCivitaiImageOutputs({ images: ['https://example.test/a'] })).toEqual([{ url: 'https://example.test/a' }]);
    expect(collectCivitaiImageOutputs({ steps: [{ output: {} }] })).toEqual([]);
  });
});
