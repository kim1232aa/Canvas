// @vitest-environment jsdom
/** fix10.1 — behaviour: custom-ID field DOM value / store never contain zero-width chars; loaded dirty values are scrubbed visibly. */
import React, { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NODE_DEFINITIONS as D } from '../constants/nodes';
import { BOARDS_KEY, ACTIVE_BOARD_KEY, MODE_KEY } from '../utils/workspaceCache';
import { NodeItem } from '../components/NodeItem';
import { getExecutions } from '../services/executionTrace';
import { scrubZeroWidthNodes, preRunZeroWidthBlock } from '../utils/zeroWidth';
import { dockAvoidingStyle } from '../components/ExecutionLog';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const ZW = /[\u200B\u200C\u200D\uFEFF\u2060]/;
const ID = 'fal-ai/kling-video/v3/standard/image-to-video';
const noop = () => {};
let root: Root;
const vnode = (values: any) => ({ id: 'v1', type: 'AIVideoNode', title: D.AIVideoNode.title, pos: { x: 0, y: 0 }, width: 320, inputs: D.AIVideoNode.inputs, outputs: D.AIVideoNode.outputs, values, state: 'idle' });
async function renderNode(values: any, onUpdateValue = vi.fn()) {
  const el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  await act(async () => { root.render(<NodeItem node={vnode(values) as any} isSelected={false} zoom={1} onSelect={noop} onStartDrag={noop} onUpdateValue={onUpdateValue} onDeleteNode={noop} onToggleCollapse={noop} onToggleBypass={noop} onStartConnecting={noop} onEndConnecting={noop} />); });
  return onUpdateValue;
}
afterEach(async () => { await act(async () => root?.unmount()); vi.unstubAllGlobals(); localStorage.clear(); document.body.innerHTML = ''; });

describe('fix10.1 custom model-ID field', () => {
  it('display: text == value exactly, no zero-width; <wbr> only after / and -', async () => {
    await renderNode({ model: ID, targetProvider: 'fal' });
    const d = document.querySelector('[data-testid="node-custom-model-display"]')!;
    expect(d.textContent).toBe(ID); expect(ZW.test(d.textContent!)).toBe(false);
    expect(d.querySelectorAll('wbr').length).toBe((ID.match(/[/-]/g) || []).length);
  });
  it('edit: textarea value is the plain value (length, code points); typing stores exactly what is typed', async () => {
    const spy = await renderNode({ model: ID, targetProvider: 'fal' });
    await act(async () => { (document.querySelector('[data-testid="node-custom-model-display"]') as HTMLElement).click(); });
    const t = document.querySelector('[data-testid="node-custom-model-id"]') as HTMLTextAreaElement;
    expect(t.value).toBe(ID); expect(t.value.length).toBe(ID.length);
    expect([...t.value].every((c) => c.codePointAt(0)! < 0x2000)).toBe(true);
    const typed = ID + '-x';
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(t, typed); t.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(spy).toHaveBeenLastCalledWith('v1', 'model', typed);
    expect(ZW.test(spy.mock.calls.at(-1)![2])).toBe(false);
  });
});

describe('fix10.1 zero-width scrub / block', () => {
  it('scrub reports node/field/count and cleans; pre-run block does not strip', () => {
    const dirty = [vnode({ model: 'fal-ai/\u200Bkling\u2060-video', prompt: 'ok' })] as any;
    const { nodes, hits } = scrubZeroWidthNodes(dirty);
    expect(hits).toEqual([{ nodeId: 'v1', nodeTitle: D.AIVideoNode.title, field: 'model', count: 2 }]);
    expect(nodes[0]?.values?.model).toBe('fal-ai/kling-video');
    expect(dirty[0].values.model).toContain('\u200B'); // input not mutated
    const b = preRunZeroWidthBlock(dirty)!; expect(b.requestCount).toBe(0); expect(String(b.error)).toContain('model');
    expect(preRunZeroWidthBlock(nodes)).toBeNull();
  });
  it('real App: dirty board in localStorage → store cleaned, toast shown, local exec-log event, persisted clean', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })));
    const b = { id: 'b1', name: 'zw', nodes: [vnode({ model: ID.replace(/\//g, '/\u200B'), targetProvider: 'fal' })], connections: [], spatialFrames: [] };
    localStorage.setItem(BOARDS_KEY, JSON.stringify([b])); localStorage.setItem(ACTIVE_BOARD_KEY, 'b1'); localStorage.setItem(MODE_KEY, 'graph');
    const App = (await import('../App')).default;
    const el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
    await act(async () => { root.render(<StrictMode><App /></StrictMode>); });
    for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(document.body.textContent).toContain('已清除 4 个零宽字符');
    expect(getExecutions().some((r) => r.route === '零宽字符清洗（节点数据）' && r.category === 'local')).toBe(true);
    const d = document.querySelector('[data-testid="node-custom-model-display"]')!;
    expect(d.textContent).toBe(ID);
    expect(ZW.test(localStorage.getItem(BOARDS_KEY) || '')).toBe(false);
  });
});

describe('fix10.1 exec-log button vs dock', () => {
  it('never overlaps the dock box', () => {
    const vp = { width: 1280, height: 800 };
    const s = dockAvoidingStyle({ left: 400, top: 740, bottom: 776 }, vp) as any;
    expect(vp.width - s.right).toBeLessThanOrEqual(400 - 12); // right edge 12px left of dock
    // fix11.1: no room left of dock → under top chrome (not above dock covering node labels)
    const s2 = dockAvoidingStyle({ left: 100, top: 740, bottom: 776 }, vp, 80) as any;
    expect(s2.bottom).toBeUndefined();
    expect(s2.top).toBe(108); // 80 + EXEC_TOP_PARK_GAP 28
    expect(s2.left).toBe(12);
  });
});
