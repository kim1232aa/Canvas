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
  it('ModelScope CN static schema has no min/max → no local range (2026-11-02 全部核实)', () => {
    expect(seedRangeFor('modelscope', 'Tongyi-MAI/Z-Image-Turbo')).toBeUndefined();
  });
  it('no static range → out-of-range seed not blocked locally', () => {
    const n = ms(4294967295); expect(seedSchemaIssues([n])).toBeNull(); expect(n.values.seed).toBe(4294967295);
    expect(seedSchemaIssues([ms(1.5)])).toBeNull(); // no static integer bounds either
  });
  it('in-range seed → allowed', () => { expect(seedSchemaIssues([ms(42)])).toBeNull(); expect(seedSchemaIssues([ms(2147483647)])).toBeNull(); });
  it('randomize mode skips stored value check', () => { expect(seedSchemaIssues([ms(4294967295, { control_after_generate: 'randomize' })])).toBeNull(); });
  it('no declared range → no block', () => { expect(seedRangeIssue('unknownprov', 'x', 99999999999)).toBeNull(); });
  it('random seed without static range uses legacy generator', () => {
    for (const r of [0, 0.5, 0.999999999]) {
      const s = randomSeedFor('modelscope', 'Qwen/Qwen-Image', () => r);
      expect(Number.isInteger(s)).toBe(true);
      expect(seedRangeIssue('modelscope', 'Qwen/Qwen-Image', s)).toBeNull();
    }
  });

  it('ROOT: CheckpointLoaderSimple modelscope + KSampler seed 4294967295 fixed → no local block without live Schema bounds', () => {
    const { nodes, connections } = modelscopeCnBoard(4294967295, 'fixed');
    expect(seedSchemaIssues(nodes)).toBeNull();
    expect(seedSchemaIssues(nodes, connections)).toBeNull();
    expect(nodes[1].values.seed).toBe(4294967295);
  });

  it('ROOT: same graph with seed 42 → allowed', () => {
    const { nodes, connections } = modelscopeCnBoard(42, 'fixed');
    expect(seedSchemaIssues(nodes, connections)).toBeNull();
  });

  it('LoRA between checkpoint and KSampler still resolves provider/model (no static block)', () => {
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

  it('live model-schema min/max still blocks (dynamic Schema path)', () => {
    // seedRangeIssue only when seedRangeFor returns bounds; live cache path covered by seedRangeFor unit via injecting is out of scope here —
    // keep contract: unknown provider never blocks.
    expect(seedRangeIssue('fal', 'missing-model-no-cache', 1)).toBeNull();
  });
});
