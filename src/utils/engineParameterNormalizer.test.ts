import { describe, expect, it } from 'vitest';
import { normalizeForComfyUI, normalizeForFal } from './engineParameterNormalizer';
import type { ComfyParameters } from '../types/graph';

const params = (partial: Partial<ComfyParameters> = {}): ComfyParameters => ({
  checkpoint: 'model.safetensors',
  targetProvider: 'civitai',
  width: 1024,
  height: 1024,
  batchSize: 1,
  seed: 1,
  steps: 20,
  cfg: 7,
  loras: [],
  ...partial,
});

describe('normalizeForComfyUI sampler and scheduler requirements', () => {
  it('rejects an unset sampler instead of manufacturing euler', () => {
    expect(() => normalizeForComfyUI(params({ scheduler: 'normal' }), 'prompt', '')).toThrow(
      '请先选择采样器与调度器，否则复制的 JSON 会包含你未选择的参数'
    );
  });

  it('rejects an unset scheduler instead of manufacturing normal', () => {
    expect(() => normalizeForComfyUI(params({ sampler: 'euler' }), 'prompt', '')).toThrow(
      '请先选择采样器与调度器，否则复制的 JSON 会包含你未选择的参数'
    );
  });

  it('preserves explicitly selected sampler and scheduler', () => {
    const graph = normalizeForComfyUI(
      params({ sampler: 'dpmpp_2m', scheduler: 'karras' }),
      'prompt',
      ''
    );

    expect(graph['5'].inputs).toMatchObject({
      sampler_name: 'dpmpp_2m',
      scheduler: 'karras',
    });
  });
});

describe('normalizeForFal safety fields', () => {
  it('omits enable_safety_checker and safety_tolerance when custom_parameters does not set them', () => {
    const result = normalizeForFal(params(), 'a red fox on a stone wall', '');
    expect(result.payload).not.toHaveProperty('enable_safety_checker');
    expect(result.payload).not.toHaveProperty('safety_tolerance');
  });

  it('copies the values the user set and does not replace them', () => {
    const result = normalizeForFal(
      params({ customParameters: JSON.stringify({ enable_safety_checker: true, safety_tolerance: '2' }) }),
      'a red fox on a stone wall',
      ''
    );
    expect(result.payload.enable_safety_checker).toBe(true);
    expect(result.payload.safety_tolerance).toBe('2');
  });
});
