import { describe, it, expect } from 'vitest';
import { SAMPLER_OPTIONS, SCHEDULER_OPTIONS, NODE_DEFINITIONS } from '../constants/nodes';

describe('SAMPLER_OPTIONS / SCHEDULER_OPTIONS include empty 未指定', () => {
  it('SAMPLER_OPTIONS has { value: "", label containing 未指定 } as first entry', () => {
    const empty = SAMPLER_OPTIONS.find((o) => o.value === '');
    expect(empty).toBeDefined();
    expect(empty!.label).toContain('未指定');
    expect(SAMPLER_OPTIONS[0].value).toBe('');
  });

  it('SCHEDULER_OPTIONS has { value: "", label containing 未指定 } as first entry', () => {
    const empty = SCHEDULER_OPTIONS.find((o) => o.value === '');
    expect(empty).toBeDefined();
    expect(empty!.label).toContain('未指定');
    expect(SCHEDULER_OPTIONS[0].value).toBe('');
  });
});

describe('nullish coalescing preserves empty string (the fix)', () => {
  // Use variables so tsc doesn't fold constant expressions (TS2869/TS2873)
  const empty: string = '';

  it('"" ?? "euler" === "" — empty string is NOT coerced', () => {
    expect(empty ?? 'euler').toBe('');
  });

  it('"" ?? "normal" === "" — empty string is NOT coerced', () => {
    expect(empty ?? 'normal').toBe('');
  });

  it('"" || "euler" === "euler" — this was the old bug', () => {
    // Documents why || must not be used for value binding
    expect(empty || 'euler').toBe('euler');
  });

  it('"" || "normal" === "normal" — this was the old bug', () => {
    expect(empty || 'normal').toBe('normal');
  });
});

describe('node-face select option values include empty string', () => {
  it('SAMPLER_OPTIONS values include ""', () => {
    expect(SAMPLER_OPTIONS.map((o) => o.value)).toContain('');
  });

  it('SCHEDULER_OPTIONS values include ""', () => {
    expect(SCHEDULER_OPTIONS.map((o) => o.value)).toContain('');
  });

  it('KSampler node-face widgets use options that include empty 未指定', () => {
    const def = NODE_DEFINITIONS.KSampler;
    expect(def).toBeDefined();
    const samplerW = def!.widgets.find((w) => w.name === 'sampler_name');
    const schedulerW = def!.widgets.find((w) => w.name === 'scheduler');
    expect(samplerW?.options?.some((o) => o.value === '' && String(o.label).includes('未指定'))).toBe(true);
    expect(schedulerW?.options?.some((o) => o.value === '' && String(o.label).includes('未指定'))).toBe(true);
    // NodeItem renders widget.options via opts.map — same array reference as SAMPLER_OPTIONS
    expect(samplerW?.options).toBe(SAMPLER_OPTIONS);
    expect(schedulerW?.options).toBe(SCHEDULER_OPTIONS);
  });

  it('NodeItem binding pattern: imported "" stays empty with ??, never falls to widget.default', () => {
    const imported: string = '';
    const widgetDefault = 'euler';
    // mirrors NodeItem: const value = node.values[widget.name] ?? widget.default
    expect(imported ?? widgetDefault).toBe('');
    // old || would forge
    expect(imported || widgetDefault).toBe('euler');
  });
});
