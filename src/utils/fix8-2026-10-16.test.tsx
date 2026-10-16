/** fix8 · 2026-10-16 — 视频 select 闭合态全名可见行；自定义输入框换行展全；BASE_MODELS 删 damo/wan2.1-t2i-1.3b（魔搭 API 404）。 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NodeItem } from '../components/NodeItem';
import { BASE_MODELS, NODE_DEFINITIONS } from '../constants/nodes';
const noop = () => {};
const ID = 'fal-ai/kling-video/v3/standard/image-to-video';
const render = (model: string) => { const d = NODE_DEFINITIONS.AIVideoNode; return renderToStaticMarkup(<NodeItem node={{ id: 'v1', type: 'AIVideoNode', title: d.title, pos: { x: 0, y: 0 }, width: 320, inputs: d.inputs, outputs: d.outputs, values: { model, targetProvider: 'fal', provider: 'fal' }, state: 'idle' } as any} isSelected={false} zoom={1} onSelect={noop} onStartDrag={noop} onUpdateValue={noop} onDeleteNode={noop} onToggleCollapse={noop} onToggleBypass={noop} onStartConnecting={noop} onEndConnecting={noop} />); };
describe('fix8', () => {
  it('selected label shown in full wrap line', () => {
    const html = render(ID);
    const m = html.match(/data-testid="node-video-model-label"[^>]*>([^<]*)</)!; expect(m).toBeTruthy();
    expect(m[0]).toMatch(/overflow-wrap:anywhere/); expect(m[0]).not.toMatch(/truncate/);
    expect(m[1]).toBe('[Fal] Kling V3 Standard Image-to-Video'); 
  });
  it('custom input is wrapping textarea with full path', () => {
    const html = render(ID);
    const m = html.replace(/<wbr\/>/g, '').match(/data-testid="node-custom-model-display"[^>]*>([^<]*)</)!; expect(m).toBeTruthy();
    expect(m[0]).toContain(`title="${ID}"`); expect(m[1]).toBe(ID);
  });
  it('custom unknown id label', () => { expect(render('foo/bar/x')).toContain('★ [自定义视频端点]'); });
  it('BASE_MODELS has no damo/wan2.1-t2i-1.3b', () => { expect(BASE_MODELS.some((m) => m.value === 'damo/wan2.1-t2i-1.3b')).toBe(false); });
});
