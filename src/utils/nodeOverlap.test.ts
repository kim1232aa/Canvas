import { describe, expect, it } from 'vitest';
import { overlapPushes } from './nodeOverlap';

const lora = { id: 'lora', pos: { x: 210, y: 105 }, width: 160 };
const prompt = { id: 'prompt', pos: { x: 240, y: 310 }, width: 220 };
const ks = { id: 'ks', pos: { x: 480, y: 190 }, width: 150 };

describe('overlapPushes', () => {
  it('moves the prompt node below the grown LoRA card (warning box)', () => {
    expect(overlapPushes([lora, prompt, ks], 'lora', 270)).toEqual([{ id: 'prompt', pos: { x: 240, y: 105 + 270 + 16 } }]);
  });
  it('no push when nothing overlaps', () => {
    expect(overlapPushes([lora, prompt], 'lora', 150)).toEqual([]);
  });
  it('ignores side-by-side nodes in the header band and non-overlapping columns', () => {
    const side = { id: 's', pos: { x: 250, y: 120 }, width: 100 };
    expect(overlapPushes([lora, side, ks], 'lora', 400)).toEqual([]);
  });
});
