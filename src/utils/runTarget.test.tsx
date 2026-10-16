// 画布 ruling 03:15: visible run target; deleted / unresolvable target blocks locally.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { resolveRunTarget, RUN_NODE_DELETED, RUN_NO_OUTPUT_NODE } from './graphEngine';
import { TopBar } from '../components/TopBar';
import { setCurrentRunTarget, tracedFetch, getExecutions } from '../services/executionTrace';

const n = (id: string, type: string, title?: string): any => ({ id, type, title, pos: { x: 0, y: 0 }, values: {}, inputs: [], outputs: [] });

describe('resolveRunTarget', () => {
  it('selection wins and must exist', () => {
    expect(resolveRunTarget([n('ks', 'KSampler', 'KSampler')], [], undefined, 'ks')).toMatchObject({ id: 'ks', title: 'KSampler', auto: false });
    expect(() => resolveRunTarget([n('ks', 'KSampler')], [], undefined, 'gone')).toThrow(RUN_NODE_DELETED);
  });
  it('no selection → output node (sink) with auto flag', () => {
    expect(resolveRunTarget([n('ck', 'CheckpointLoaderSimple'), n('ks', 'KSampler'), n('save', 'SaveImage', '保存图像')], [])).toMatchObject({ id: 'save', title: '保存图像', auto: true });
  });
  it('no output node → blocked', () => {
    expect(() => resolveRunTarget([n('ck', 'CheckpointLoaderSimple')], [])).toThrow(RUN_NO_OUTPUT_NODE);
    expect(() => resolveRunTarget([], [])).toThrow(RUN_NO_OUTPUT_NODE);
  });
});

describe('visible target', () => {
  it('run button shows 「运行：<title>」', () => {
    const html = renderToStaticMarkup(<TopBar {...({ nodeCount: 2, connectionCount: 1, canvasMode: 'graph', onQueuePrompt: () => {}, runTargetLabel: '保存图像' } as any)} />);
    expect(html).toContain('运行：保存图像');
  });
  it('generation requests carry the run target for the log first line', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => new Response('{"ok":true}', { status: 200 })) as any;
    setCurrentRunTarget('保存图像（未选中节点，按输出节点）');
    await tracedFetch('/api/schema-provider/krea/submit', { method: 'POST', body: '{}' });
    await tracedFetch('/api/models?provider=krea');
    setCurrentRunTarget(null);
    globalThis.fetch = orig;
    const [get, post] = getExecutions();
    expect(post.runTarget).toBe('保存图像（未选中节点，按输出节点）');
    expect(get.runTarget).toBeUndefined();
  });
});

import { resolveRunTarget as rrt } from './graphEngine';
import { describe as d2, it as i2, expect as e2 } from 'vitest';
d2('0320 selected non-output node', () => {
  i2('blocks a selected LoRA node with a not-runnable reason', () => {
    const nodes: any[] = [{ id: 'l1', type: 'LoRALoader', title: 'LoRA: x', values: {}, inputs: [], outputs: [] }];
    e2(() => rrt(nodes, [], null, 'l1')).toThrow(/不是可运行的输出节点/);
  });
});
