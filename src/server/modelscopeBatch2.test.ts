import { describe, it, expect } from 'vitest';
import { describeKeySelection, formatKeyUsage, keyUsagesFromTrace } from '../utils/keyUsage';
import { resolveHistoryParameters, historyKeyUsageLabels } from '../utils/historyParameters';
import { recordKeyUsageLabels } from '../components/ExecutionLog';
import { MODELSCOPE_REGIONS, buildLoraListRequest, parseLoraListResponse } from './modelScopeLoraList';

describe('key rotation visibility', () => {
  it('reports index + count, never key text', () => {
    const u = describeKeySelection('modelscope_ai', 'ms-bbb', ['ms-aaa', 'ms-bbb'], 'pool')!;
    expect(u).toEqual({ provider: 'modelscope_ai', index: 1, count: 2, source: 'pool' });
    expect(JSON.stringify(u)).not.toContain('ms-bbb');
    expect(formatKeyUsage({ index: 0, count: 2 })).toBe('Key #0（共 2 个）');
    expect(describeKeySelection('x', 'zzz', ['a'], 'pool')).toBeNull();
  });
});


describe('modelscope.ai LoRA list (region config, intl only)', () => {
  const cfg = MODELSCOPE_REGIONS.modelscope_ai;
  it('builds the live-verified PUT request against the intl site only', () => {
    const { url, init } = buildLoraListRequest(cfg, { name: 'Z-Image-Turbo', page: 1, pageSize: 5 });
    expect(url).toBe('https://www.modelscope.ai/api/v1/dolphin/models');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body).Criterion[0].values).toEqual(['lora']);
    expect(url).not.toContain('.cn');
  });
  it('maps rows; bad shape throws (no fallback)', () => {
    const out = parseLoraListResponse(cfg, { Code: 200, Data: { Model: { TotalCount: 203, Models: [{ Path: 'LcarsPicturesDatabase', Name: 'ST-TNG-Rooms-Z-Image-Turbo-v1', BaseModel: ['Tongyi-MAI/Z-Image-Turbo'], Tags: ['LoRA'] }, { Path: 'a', Name: 'b', BaseModel: ['undefined'] }] } } });
    expect(out.total).toBe(203);
    expect(out.items[0]).toMatchObject({ id: 'LcarsPicturesDatabase/ST-TNG-Rooms-Z-Image-Turbo-v1', provider: 'modelscope_ai', baseModel: 'Tongyi-MAI/Z-Image-Turbo', externalUrl: 'https://www.modelscope.ai/models/LcarsPicturesDatabase/ST-TNG-Rooms-Z-Image-Turbo-v1' });
    expect(out.items[1].baseModel).toBeNull();
    expect(() => parseLoraListResponse(cfg, { Code: 10010205001 })).toThrow(/响应格式不符/);
  });
});
