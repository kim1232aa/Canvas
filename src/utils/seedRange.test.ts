import { describe, it, expect } from 'vitest';
import { seedRangeFor, seedRangeAdvisory, randomSeedFor } from './seedRange';
import * as seedRangeModule from './seedRange';

describe('seed range from model Schema (advisory only, never blocks pre-run)', () => {
  it('ModelScope static Schema has official seed range [0, 2^31-1] (hint / random)', () => {
    const r = seedRangeFor('modelscope', 'Tongyi-MAI/Z-Image-Turbo');
    expect(r).toEqual({ min: 0, max: 2147483647, source: 'https://www.modelscope.cn/docs/model-service/API-Inference/intro' });
    expect(seedRangeFor('modelscope_ai', 'Tongyi-MAI/Z-Image-Turbo')).toEqual(r);
  });

  it('dead no-op seedSchemaIssues and seedRangeIssue are removed', () => {
    expect('seedSchemaIssues' in seedRangeModule).toBe(false);
    expect('seedRangeIssue' in seedRangeModule).toBe(false);
  });

  it('advisory helper treats -1 as valid random sentinel and gives non-blocking hint on out-of-range values', () => {
    expect(seedRangeAdvisory('modelscope', 'Tongyi-MAI/Z-Image-Turbo', -1)).toBeNull();
    expect(seedRangeAdvisory('modelscope', 'Tongyi-MAI/Z-Image-Turbo', 42)).toBeNull();
    expect(seedRangeAdvisory('modelscope', 'Tongyi-MAI/Z-Image-Turbo', 2147483647)).toBeNull();
    const hint = seedRangeAdvisory('modelscope', 'Tongyi-MAI/Z-Image-Turbo', 4294967295);
    expect(hint).toContain('仅提示');
    expect(hint).not.toContain('未发送请求');
  });

  it('no declared range -> no advisory warning', () => {
    expect(seedRangeAdvisory('unknownprov', 'x', 99999999999)).toBeNull();
    expect(seedRangeAdvisory('fal', 'missing-model-no-cache', 1)).toBeNull();
  });

  it('random seed for ModelScope stays inside official [0, 2^31-1]', () => {
    for (const r of [0, 0.5, 0.999999999]) {
      const s = randomSeedFor('modelscope', 'Qwen/Qwen-Image', () => r);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(2147483647);
      expect(seedRangeAdvisory('modelscope', 'Qwen/Qwen-Image', s)).toBeNull();
    }
  });
});
