import { describe, it, expect } from 'vitest';
import { clearPriorMediaPreview, clearPriorMediaPreviews } from './graphEngine';
import type { NodeInstance } from '../types/graph';

function node(partial: Partial<NodeInstance> & { id: string; type: string }): NodeInstance {
  return {
    title: partial.type,
    pos: { x: 0, y: 0 },
    inputs: [],
    outputs: [],
    values: { filename_prefix: 'WaveSpeed_krea' },
    state: 'idle',
    ...partial,
  } as NodeInstance;
}

describe('saveempty — clear prior media preview', () => {
  it('clears SaveImage output on model switch shape (outputData gone, prefix kept)', () => {
    const save = node({
      id: 's',
      type: 'SaveImage',
      outputData: 'data:image/png;base64,old',
      outputAt: '2026-10-17T00:00:00.000Z',
      stalePriorOutput: true,
    });
    const cleared = clearPriorMediaPreview(save);
    expect(cleared.outputData).toBeUndefined();
    expect(cleared.outputAt).toBeUndefined();
    expect(cleared.stalePriorOutput).toBeUndefined();
    expect(cleared.values?.filename_prefix).toBe('WaveSpeed_krea');
  });

  it('clears SaveImage / KSampler when a blocked run clears the graph', () => {
    const nodes = [
      node({ id: 's', type: 'SaveImage', outputData: 'data:image/png;base64,crane' }),
      node({ id: 'k', type: 'KSampler', outputData: 'data:image/png;base64,preview' }),
      node({ id: 'c', type: 'CheckpointLoaderSimple', values: { ckpt_name: 'gemini', targetProvider: 'gemini' } }),
    ];
    const out = clearPriorMediaPreviews(nodes);
    expect(out[0].outputData).toBeUndefined();
    expect(out[1].outputData).toBeUndefined();
    expect(out[2]).toBe(nodes[2]); // non-preview unchanged (same reference)
    expect(out[0].values?.filename_prefix).toBe('WaveSpeed_krea');
  });

  it('is a no-op when already empty', () => {
    const save = node({ id: 's', type: 'SaveImage' });
    expect(clearPriorMediaPreview(save)).toBe(save);
  });
});
