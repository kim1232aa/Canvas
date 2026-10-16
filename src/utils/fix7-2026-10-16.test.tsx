/**
 * fix7 · 2026-10-16 — AI 视频节点标题可换行展全；模型 ID break-all 展全；
 * ModelScope 视频死选项从 BASE_MODELS 移除（提交必本地 400）。
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NodeItem } from '../components/NodeItem';
import { BASE_MODELS, NODE_DEFINITIONS } from '../constants/nodes';

const noop = () => {};
const KLING_I2V = 'fal-ai/kling-video/v3/standard/image-to-video';

function renderVideoNode(opts: { title?: string; model?: string; width?: number } = {}) {
  const def = NODE_DEFINITIONS.AIVideoNode;
  const model = opts.model ?? KLING_I2V;
  return renderToStaticMarkup(
    <NodeItem
      node={{
        id: 'v1',
        type: 'AIVideoNode',
        title: opts.title ?? def.title,
        pos: { x: 0, y: 0 },
        width: opts.width ?? 320,
        inputs: def.inputs,
        outputs: def.outputs,
        values: { model, targetProvider: 'fal', provider: 'fal' },
        state: 'idle',
      } as any}
      isSelected={false}
      zoom={1}
      onSelect={noop}
      onStartDrag={noop}
      onUpdateValue={noop}
      onDeleteNode={noop}
      onToggleCollapse={noop}
      onToggleBypass={noop}
      onStartConnecting={noop}
      onEndConnecting={noop}
    />,
  );
}

describe('fix7 AIVideoNode title — no truncate; wrap so Provider/Model is visible', () => {
  it('default title keeps 显式 Provider/Model semantic and is shorter than old 生成… form', () => {
    const t = NODE_DEFINITIONS.AIVideoNode.title;
    expect(t).toContain('显式 Provider/Model');
    expect(t).not.toMatch(/AI 视频生成（显式 Provider \/ Model）/);
    expect(t.length).toBeLessThan('AI 视频生成（显式 Provider / Model）'.length);
  });

  it('header title uses wrap classes (not truncate) for AIVideoNode', () => {
    const html = renderVideoNode();
    expect(html).toContain('data-testid="node-header-title"');
    // title text present in full (SSR has no CSS clip)
    expect(html).toContain('显式 Provider/Model');
    // wrap, not truncate, on AIVideoNode header
    expect(html).toMatch(/data-testid="node-header-title"[^>]*whitespace-normal/);
    expect(html).toMatch(/data-testid="node-header-title"[^>]*break-words/);
    expect(html).not.toMatch(/data-testid="node-header-title"[^>]*truncate/);
  });

  it('legacy long title still renders fully in markup (CSS wrap handles clip)', () => {
    const legacy = 'AI 视频生成（显式 Provider / Model）';
    const html = renderVideoNode({ title: legacy });
    expect(html).toContain(legacy);
    expect(html).toMatch(/data-testid="node-header-title"[^>]*whitespace-normal/);
  });
});

describe('fix7 model ID line — superseded by fix9 (merged; ID shown once in custom box)', () => {
  it('full endpoint still visible in custom box; separate id line removed', () => {
    const html = renderVideoNode({ model: KLING_I2V });
    expect(html).not.toContain('data-testid="node-video-model-id"');
    expect(html.replace(/<wbr\/>/g, '')).toMatch(new RegExp(`data-testid="node-custom-model-display"[^>]*>${KLING_I2V}<`));
  });
});

describe('fix7 ModelScope video dead options cleared from BASE_MODELS', () => {
  it('no longer lists damo/wan2.1-i2v-480p-14b or THUDM/CogVideoX-5b as video', () => {
    const values = BASE_MODELS.map((m) => m.value);
    expect(values).not.toContain('damo/wan2.1-i2v-480p-14b');
    expect(values).not.toContain('THUDM/CogVideoX-5b');
    expect(BASE_MODELS.some((m) => m.provider === 'modelscope' && m.category === 'video')).toBe(false);
  });

  it('fix8: removed damo/wan2.1-t2i-1.3b (ModelScope API 404)', () => {
    expect(BASE_MODELS.some((m) => m.value === 'damo/wan2.1-t2i-1.3b')).toBe(false);
  });

  it('AIVideoNode schema options never include those ModelScope video ids', () => {
    const modelWidget = NODE_DEFINITIONS.AIVideoNode.widgets.find((w) => w.name === 'model');
    const opts = (modelWidget?.options || []) as Array<{ value: string }>;
    const vals = opts.map((o) => o.value);
    expect(vals).not.toContain('damo/wan2.1-i2v-480p-14b');
    expect(vals).not.toContain('THUDM/CogVideoX-5b');
  });
});
