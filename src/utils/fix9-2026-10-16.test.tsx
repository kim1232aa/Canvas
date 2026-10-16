/** fix9 · 2026-10-16 — 删 damo/wan2.1-t2i 残留；模型区合并；select 省略号；自定义框 / - 处优先换行；视频分辨率 (resolution) 标签。 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NodeItem } from '../components/NodeItem';
import { NODE_DEFINITIONS } from '../constants/nodes';
import { WORKFLOW_PRESETS as PRESETS } from '../constants/presets';
const noop = () => {};
const ID = 'fal-ai/kling-video/v3/standard/image-to-video';
const render = (model: string) => { const d = NODE_DEFINITIONS.AIVideoNode; return renderToStaticMarkup(<NodeItem node={{ id: 'v1', type: 'AIVideoNode', title: d.title, pos: { x: 0, y: 0 }, width: 320, inputs: d.inputs, outputs: d.outputs, values: { model, targetProvider: 'fal', provider: 'fal' }, state: 'idle' } as any} isSelected={false} zoom={1} onSelect={noop} onStartDrag={noop} onUpdateValue={noop} onDeleteNode={noop} onToggleCollapse={noop} onToggleBypass={noop} onStartConnecting={noop} onEndConnecting={noop} />); };
const count = (h: string, s: string) => h.split(s).length - 1;
describe('fix9', () => {
  it('no damo/wan2.1-t2i left in source', () => {
    for (const f of ['src/constants/presets.ts', 'src/utils/baseModelMatcher.ts', 'src/config/loraHubProviders.json', 'src/constants/nodes.ts', 'src/components/ModelHubModal.tsx'])
      expect(readFileSync(f, 'utf8')).not.toMatch(/damo\/wan2\.1-t2i(?![-\w])/);
    expect(JSON.stringify(PRESETS)).not.toContain('damo/wan2.1-t2i');
  });
  it('model shown once as text: name line + id only in custom box, no id line', () => {
    const h = render(ID).replace(/<select[\s\S]*?<\/select>/g, '');
    expect(h).not.toContain('node-video-model-id');
    expect(count(h.replace(/<wbr\/>/g, ''), `>${ID}<`)).toBe(1);
    expect(count(h, '>[Fal] Kling V3 Standard Image-to-Video<')).toBe(1);
    expect(h).toMatch(/data-testid="node-video-model-label"[^>]*font-mono/);
  });
  it('select closed state ellipsis with arrow padding', () => {
    const m = render(ID).match(/<select[^>]*data-testid="node-video-model-select"[^>]*>/)![0];
    expect(m).toMatch(/text-ellipsis/); expect(m).toMatch(/pr-8/); expect(m).toMatch(/appearance-none/); expect(m).toMatch(/whitespace-nowrap/);
  });
  it('custom box prefers natural breaks (no break-all), value unchanged, label aligned', () => {
    const h = render(ID);
    const t = h.replace(/<wbr\/>/g, '').match(/data-testid="node-custom-model-display"[^>]*>([^<]*)</)!;
    expect(t[0]).not.toMatch(/break-all/); expect(t[1]).toBe(ID);
    expect(h).toContain('data-testid="node-custom-model-label"'); // fix10: label above box, same style as other field labels
  });
  it('resolution label 中文 (English)', () => {
    const d = NODE_DEFINITIONS.AIVideoNode;
    const h = renderToStaticMarkup(<NodeItem node={{ id: 'v1', type: 'AIVideoNode', title: d.title, pos: { x: 0, y: 0 }, width: 320, inputs: d.inputs, outputs: d.outputs, values: { model: ID, targetProvider: 'fal' }, state: 'idle' } as any} isSelected={false} zoom={1} onSelect={noop} onStartDrag={noop} onUpdateValue={noop} onDeleteNode={noop} onToggleCollapse={noop} onToggleBypass={noop} onStartConnecting={noop} onEndConnecting={noop} />);
    expect(readFileSync('src/components/NodeItem.tsx', 'utf8')).toContain('视频分辨率 (resolution)');
    expect(readFileSync('src/components/NodeItem.tsx', 'utf8')).not.toContain('视频 resolution');
    void h;
  });
});
