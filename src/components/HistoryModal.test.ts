import { describe, it, expect } from 'vitest';
import { displayValue } from './HistoryModal';

describe('Y1-UI History empty fields display 「未填写」', () => {
  it('displays 「未填写」 for null, undefined, empty strings, and null/undefined literals', () => {
    expect(displayValue(null)).toBe('未填写');
    expect(displayValue(undefined)).toBe('未填写');
    expect(displayValue('')).toBe('未填写');
    expect(displayValue('   ')).toBe('未填写');
    expect(displayValue('null')).toBe('未填写');
    expect(displayValue('undefined')).toBe('未填写');
    expect(displayValue(NaN)).toBe('未填写');
  });

  it('preserves valid values including 0 for seed/numbers, never converting null to 0 or 0 to 未填写', () => {
    // 0 is a valid seed, must NOT be turned into '未填写' or blank
    expect(displayValue(0)).toBe(0);
    expect(displayValue(0)).not.toBe('未填写');

    // null must NOT be displayed as 0
    expect(displayValue(null)).not.toBe(0);
    expect(displayValue(null)).toBe('未填写');

    // Numbers and strings pass through
    expect(displayValue(42)).toBe(42);
    expect(displayValue(7.5)).toBe(7.5);
    expect(displayValue('fal-ai/flux/dev')).toBe('fal-ai/flux/dev');
    expect(displayValue('a cybernetic cat')).toBe('a cybernetic cat');
  });

  it('formats steps and cfg correctly when null vs defined', () => {
    const formatSteps = (steps: number | null | undefined) =>
      steps != null ? `${steps} 步` : '未填写';

    expect(formatSteps(null)).toBe('未填写');
    expect(formatSteps(undefined)).toBe('未填写');
    expect(formatSteps(28)).toBe('28 步');

    expect(displayValue(null)).toBe('未填写');
    expect(displayValue(3.5)).toBe(3.5);
  });
});
