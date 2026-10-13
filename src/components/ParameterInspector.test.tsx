import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ParameterInspector } from './ParameterInspector';
import type { ComfyParameters } from '../types/graph';

const noop = () => {};
const params = (partial: Partial<ComfyParameters> = {}): ComfyParameters => ({
  checkpoint: 'model.safetensors',
  targetProvider: 'civitai',
  width: 1024,
  height: 1024,
  batchSize: 1,
  seed: 1,
  steps: 20,
  cfg: 7,
  sampler: '',
  scheduler: '',
  denoise: 1,
  loras: [],
  ...partial,
});

const elements = (tree: any): any[] =>
  !tree ? [] : Array.isArray(tree) ? tree.flatMap(elements) : typeof tree === 'object' && tree.props ? [tree, ...elements(tree.props.children)] : [];

afterEach(() => vi.restoreAllMocks());

describe('ParameterInspector ComfyUI API JSON export', () => {
  it('does not copy JSON when sampler or scheduler is unset and explains why', async () => {
    vi.spyOn(React, 'useState').mockImplementation(((value: unknown) => [value, vi.fn()]) as any);
    const writeText = vi.fn().mockResolvedValue(undefined);
    const alert = vi.fn();
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText } } });
    Object.defineProperty(globalThis, 'alert', { configurable: true, value: alert });
    const tree = ParameterInspector({ params: params(), onChange: noop, onOpenCivitai: noop });
    const button = elements(tree).find((element) => element.type === 'button' && element.props.title === '复制标准 ComfyUI JSON 工作流片段');

    expect(button).toBeDefined();
    await button.props.onClick();

    expect(writeText).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('请先选择采样器与调度器，否则复制的 JSON 会包含你未选择的参数');
  });
});
