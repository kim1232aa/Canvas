import { describe, expect, it } from 'vitest';
import {
  assertExplicitLoraStrengths,
  loraMissingExplicitStrength,
  parseExplicitLoraStrength,
  MISSING_LORA_STRENGTH_MSG,
} from './loraStrength';

describe('loraStrength — never invent 0.8', () => {
  it('parseExplicitLoraStrength returns undefined for missing/empty', () => {
    expect(parseExplicitLoraStrength(undefined)).toBeUndefined();
    expect(parseExplicitLoraStrength(null)).toBeUndefined();
    expect(parseExplicitLoraStrength('')).toBeUndefined();
  });

  it('parseExplicitLoraStrength preserves explicit 0 and other finite values', () => {
    expect(parseExplicitLoraStrength(0)).toBe(0);
    expect(parseExplicitLoraStrength('0')).toBe(0);
    expect(parseExplicitLoraStrength(0.8)).toBe(0.8);
    expect(parseExplicitLoraStrength('1')).toBe(1);
  });

  it('parseExplicitLoraStrength rejects non-finite', () => {
    expect(parseExplicitLoraStrength('abc')).toBeUndefined();
    expect(parseExplicitLoraStrength(Number.NaN)).toBeUndefined();
  });

  it('loraMissingExplicitStrength is true when name present but no strength', () => {
    expect(loraMissingExplicitStrength({ name: 'x' })).toBe(true);
    expect(loraMissingExplicitStrength({ name: 'x', modelStrength: 0.5 })).toBe(false);
    expect(loraMissingExplicitStrength({ name: 'x', strength: 0 })).toBe(false);
    expect(loraMissingExplicitStrength({ name: '' })).toBe(false);
  });

  it('assertExplicitLoraStrengths throws and never suggests inventing 0.8', () => {
    expect(() => assertExplicitLoraStrengths([{ name: 'style.safetensors' }])).toThrow(MISSING_LORA_STRENGTH_MSG);
    expect(() => assertExplicitLoraStrengths([{ name: 'style.safetensors', modelStrength: 0.65 }])).not.toThrow();
    expect(() => assertExplicitLoraStrengths([{ name: 'zero', strength: 0 }])).not.toThrow();
  });
});
