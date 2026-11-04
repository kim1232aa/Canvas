import { describe, it, expect } from 'vitest';
import { resolveHistoryParameters, historySentParameterValues } from '../utils/historyParameters';

// Fake record only (no network): the sent-request snapshot of a ModelScope run.
const item: any = {
  id: 'hist_test', status: 'completed', provider: 'modelscope', model: 'Tongyi-MAI/Z-Image-Turbo', prompt: 'p', url: '/x.png',
  requestMetadata: { actualRequest: { endpoint: 'https://example.invalid/v1/images/generations', parameters: {
    model: 'Tongyi-MAI/Z-Image-Turbo', prompt: 'p', negative_prompt: 'N'.repeat(1335), seed: 42, steps: 8, guidance: 1,
    sampler_name: 'euler', scheduler: 'normal', denoise: 1, size: '832x1216', loras: { a: 1 },
  } } },
};

describe('「参数与工作流」 lists every sent parameter from the request snapshot', () => {
  it('size, sampler, scheduler, denoise, steps, guidance, seed, negative, LoRA all present, values verbatim', () => {
    const v = historySentParameterValues(item);
    expect(v).toMatchObject({ size: '832x1216', sampler_name: 'euler', scheduler: 'normal', denoise: 1, steps: 8, guidance: 1, seed: 42, loras: { a: 1 } });
    expect(String(v.negative_prompt)).toHaveLength(1335);
  });
  it('a request that never left exports no sent parameters', () => {
    expect(historySentParameterValues({ ...item, status: 'local_blocked' })).toEqual({});
  });
  it('resolved size matches the sent size string', () => {
    expect(resolveHistoryParameters(item).size.value).toBe('832x1216');
  });
});
