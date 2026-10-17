import { describe, it, expect } from 'vitest';
import { seedRangeFor, seedRangeIssue, seedSchemaIssues, randomSeedFor } from './seedRange';

const ms = (seed: any, extra: any = {}) => ({ type: 'ModelScopeNode', title: '魔搭生成', values: { model_endpoint: 'Tongyi-MAI/Z-Image-Turbo', seed, ...extra } });

/** Exact browser graph that failed: CheckpointLoaderSimple (modelscope + Z-Image-Turbo) + KSampler seed 4294967295 fixed. */
const modelscopeCnBoard = (seed: number, control: string = 'fixed') => {
  const nodes = [
    { id: 'ckpt', type: 'CheckpointLoaderSimple', title: '加载底模', values: { targetProvider: 'modelscope', ckpt_name: 'Tongyi-MAI/Z-Image-Turbo' } },
    { id: 'ks', type: 'KSampler', title: '采样器', values: { seed, control_after_generate: control, steps: 8, cfg: 1 } },
  ];
  const connections = [{ fromNodeId: 'ckpt', toNodeId: 'ks', fromSocketId: 'model', toSocketId: 'model' }];
  return { nodes, connections };
};

describe('seed range from model Schema', () => {
  it('ModelScope CN range read from schema', () => { expect(seedRangeFor('modelscope', 'Tongyi-MAI/Z-Image-Turbo')).toMatchObject({ min: -1, max: 2147483647 }); });
  it('out-of-range seed → blocked, value untouched', () => {
    const n = ms(4294967295); const msg = seedSchemaIssues([n]);
    expect(msg).toContain('超出'); expect(msg).toContain('未发送请求'); expect(n.values.seed).toBe(4294967295);
    expect(seedSchemaIssues([ms(1.5)])).toContain('超出');
  });
  it('in-range seed → allowed', () => { expect(seedSchemaIssues([ms(42)])).toBeNull(); expect(seedSchemaIssues([ms(2147483647)])).toBeNull(); });
  it('randomize mode skips stored value check', () => { expect(seedSchemaIssues([ms(4294967295, { control_after_generate: 'randomize' })])).toBeNull(); });
  it('no declared range → no block', () => { expect(seedRangeIssue('unknownprov', 'x', 99999999999)).toBeNull(); });
  it('random seed always in range', () => {
    for (const r of [0, 0.5, 0.999999999]) { const s = randomSeedFor('modelscope', 'Qwen/Qwen-Image', () => r); expect(seedRangeIssue('modelscope', 'Qwen/Qwen-Image', s)).toBeNull(); }
    for (let i = 0; i < 200; i++) { const s = randomSeedFor('modelscope', 'Qwen/Qwen-Image'); expect(Number.isInteger(s) && s >= -1 && s <= 2147483647).toBe(true); }
  });

  it('ROOT: CheckpointLoaderSimple modelscope + KSampler seed 4294967295 fixed → block (same function App calls)', () => {
    const { nodes, connections } = modelscopeCnBoard(4294967295, 'fixed');
    // Without connections the old per-node scan silently misses (seed on KSampler, model on checkpoint).
    expect(seedSchemaIssues(nodes)).toBeNull();
    const msg = seedSchemaIssues(nodes, connections);
    expect(msg).toContain('超出');
    expect(msg).toContain('4294967295');
    expect(msg).toContain('未发送请求');
    expect(nodes[1].values.seed).toBe(4294967295); // never clamped
  });

  it('ROOT: same graph with seed 42 → allowed', () => {
    const { nodes, connections } = modelscopeCnBoard(42, 'fixed');
    expect(seedSchemaIssues(nodes, connections)).toBeNull();
  });

  it('LoRA between checkpoint and KSampler still resolves provider/model', () => {
    const nodes = [
      { id: 'ckpt', type: 'CheckpointLoaderSimple', values: { targetProvider: 'modelscope', ckpt_name: 'Tongyi-MAI/Z-Image-Turbo' } },
      { id: 'lora', type: 'LoRALoader', values: { lora_name: 'suayptalha/Z-Image-Turbo-Realism-LoRA', strength_model: 1 } },
      { id: 'ks', type: 'KSampler', title: '采样器', values: { seed: 4294967295, control_after_generate: 'fixed' } },
    ];
    const connections = [
      { fromNodeId: 'ckpt', toNodeId: 'lora', fromSocketId: 'model', toSocketId: 'model' },
      { fromNodeId: 'lora', toNodeId: 'ks', fromSocketId: 'model', toSocketId: 'model' },
    ];
    expect(seedSchemaIssues(nodes, connections)).toContain('超出');
  });
});
