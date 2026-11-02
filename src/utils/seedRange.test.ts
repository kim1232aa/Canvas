import { describe, it, expect } from 'vitest';
import { seedRangeFor, seedRangeIssue, seedSchemaIssues, randomSeedFor } from './seedRange';

const ms = (seed: any, extra: any = {}) => ({ type: 'ModelScopeNode', title: '魔搭生成', values: { model_endpoint: 'Tongyi-MAI/Z-Image-Turbo', seed, ...extra } });

/** Exact browser graph: CheckpointLoaderSimple (modelscope + Z-Image-Turbo) + KSampler seed. */
const modelscopeCnBoard = (seed: number, control: string = 'fixed') => {
  const nodes = [
    { id: 'ckpt', type: 'CheckpointLoaderSimple', title: '加载底模', values: { targetProvider: 'modelscope', ckpt_name: 'Tongyi-MAI/Z-Image-Turbo' } },
    { id: 'ks', type: 'KSampler', title: '采样器', values: { seed, control_after_generate: control, steps: 8, cfg: 1 } },
  ];
  const connections = [{ fromNodeId: 'ckpt', toNodeId: 'ks', fromSocketId: 'model', toSocketId: 'model' }];
  return { nodes, connections };
};

describe('seed range from model Schema', () => {
  it('ModelScope static Schema has official seed range [0, 2^31-1] (hint / random)', () => {
    const r = seedRangeFor('modelscope', 'Tongyi-MAI/Z-Image-Turbo');
    expect(r).toEqual({ min: 0, max: 2147483647, source: 'https://www.modelscope.cn/docs/model-service/API-Inference/intro' });
    expect(seedRangeFor('modelscope_ai', 'Tongyi-MAI/Z-Image-Turbo')).toEqual(r);
  });
  it('ModelScope out-of-range seed is NOT hard-blocked (product: hint only, upstream verbatim)', () => {
    const n = ms(4294967295); expect(seedSchemaIssues([n])).toBeNull(); expect(n.values.seed).toBe(4294967295);
    expect(seedRangeIssue('modelscope', 'Tongyi-MAI/Z-Image-Turbo', -1)).toBeNull();
    expect(seedRangeIssue('modelscope_ai', 'Tongyi-MAI/Z-Image-Turbo', 4294967295)).toBeNull();
    expect(seedSchemaIssues([ms(1.5)])).toBeNull();
  });
  it('in-range seed → allowed', () => { expect(seedSchemaIssues([ms(42)])).toBeNull(); expect(seedSchemaIssues([ms(2147483647)])).toBeNull(); });
  it('randomize mode skips stored value check', () => { expect(seedSchemaIssues([ms(4294967295, { control_after_generate: 'randomize' })])).toBeNull(); });
  it('no declared range → no block', () => { expect(seedRangeIssue('unknownprov', 'x', 99999999999)).toBeNull(); });
  it('random seed for ModelScope stays inside official [0, 2^31-1]', () => {
    for (const r of [0, 0.5, 0.999999999]) {
      const s = randomSeedFor('modelscope', 'Qwen/Qwen-Image', () => r);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(2147483647);
      expect(seedRangeIssue('modelscope', 'Qwen/Qwen-Image', s)).toBeNull();
    }
  });

  it('ROOT: CheckpointLoaderSimple modelscope + KSampler huge seed → still no local hard block', () => {
    const { nodes, connections } = modelscopeCnBoard(4294967295, 'fixed');
    expect(seedSchemaIssues(nodes)).toBeNull();
    expect(seedSchemaIssues(nodes, connections)).toBeNull();
    expect(nodes[1].values.seed).toBe(4294967295);
  });

  it('ROOT: same graph with seed 42 → allowed', () => {
    const { nodes, connections } = modelscopeCnBoard(42, 'fixed');
    expect(seedSchemaIssues(nodes, connections)).toBeNull();
  });

  it('LoRA between checkpoint and KSampler still resolves provider/model (no hard block)', () => {
    const nodes = [
      { id: 'ckpt', type: 'CheckpointLoaderSimple', values: { targetProvider: 'modelscope', ckpt_name: 'Tongyi-MAI/Z-Image-Turbo' } },
      { id: 'lora', type: 'LoRALoader', values: { lora_name: 'suayptalha/Z-Image-Turbo-Realism-LoRA', strength_model: 1 } },
      { id: 'ks', type: 'KSampler', title: '采样器', values: { seed: 4294967295, control_after_generate: 'fixed' } },
    ];
    const connections = [
      { fromNodeId: 'ckpt', toNodeId: 'lora', fromSocketId: 'model', toSocketId: 'model' },
      { fromNodeId: 'lora', toNodeId: 'ks', fromSocketId: 'model', toSocketId: 'model' },
    ];
    expect(seedSchemaIssues(nodes, connections)).toBeNull();
  });

  it('unknown provider never blocks', () => {
    expect(seedRangeIssue('fal', 'missing-model-no-cache', 1)).toBeNull();
  });
});
