/** fix10 · 2026-10-16 — 字号统一、/ - 行尾断行（零宽断点仅显示层）、自定义模型 (model) 标签、视频时长 (duration)+秒、模型中心对比度、执行记录分类计数。 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NodeItem } from '../components/NodeItem';
import { NODE_DEFINITIONS } from '../constants/nodes';
import { categoryCounts, countsLabel, isNonGenerationRecord, recordLocalEvent, tracedFetch, getExecutions } from '../services/executionTrace';
import { buttonSummary } from '../components/ExecutionLog';
import { sharedGetJson, beginSharedGetAction } from '../services/sharedGet';

const noop = () => {};
const ID = 'fal-ai/kling-video/v3/standard/image-to-video';
const render = (values: any) => { const d = NODE_DEFINITIONS.AIVideoNode; return renderToStaticMarkup(<NodeItem node={{ id: 'v1', type: 'AIVideoNode', title: d.title, pos: { x: 0, y: 0 }, width: 320, inputs: d.inputs, outputs: d.outputs, values, state: 'idle' } as any} isSelected={false} zoom={1} onSelect={noop} onStartDrag={noop} onUpdateValue={noop} onDeleteNode={noop} onToggleCollapse={noop} onToggleBypass={noop} onStartConnecting={noop} onEndConnecting={noop} />); };

describe('fix10 labels/fonts', () => {
  it('label 自定义模型 (model) like other field labels; display has no zero-width', () => {
    const h = render({ model: ID, targetProvider: 'fal', provider: 'fal' });
    expect(/[\u200B\u200C\u200D\uFEFF\u2060]/.test(h)).toBe(false);
    expect(h).toMatch(/<label for="custom-model-v1" data-testid="node-custom-model-label" class="text-slate-400 font-mono text-\[11px\] block">自定义模型 \(model\)<\/label>/);
  });
  it('name line matches select computed size (.canvas-node select = .875rem / 1.5)', () => {
    expect(readFileSync('src/index.css', 'utf8')).toMatch(/\.canvas-node select[^{]*\{ font-size: \.875rem; line-height: 1\.5; \}/);
    expect(render({ model: ID, targetProvider: 'fal' })).toMatch(/data-testid="node-video-model-label"[^>]*text-\[0\.875rem\] leading-\[1\.5\][^>]*font-mono/);
  });
  it('duration label 视频时长 (duration) + unit 秒 suffix, send key unchanged', () => {
    const w = NODE_DEFINITIONS.AIVideoNode.widgets.find((x) => x.name === 'duration')!;
    expect(w.label).toBe('视频时长 (duration)'); expect(w.unit).toBe('秒');
    expect(render({ model: ID, targetProvider: 'fal' })).toMatch(/data-testid="widget-unit-duration"[^>]*>秒</);
  });
  it('model hub contrast classes', () => {
    const s = readFileSync('src/components/ModelHubModal.tsx', 'utf8');
    expect(s).toContain('placeholder:text-[#b9a6e0]'); expect(s).not.toContain('placeholder-purple-400/50');
    expect(s).toContain('bg-[#7e22ce]'); expect(s).toContain('disabled:bg-[#3b2d5e] disabled:text-[#e4dcf5]');
  });
});

describe('fix10 execution categories', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":true}', { status: 200 }))); });
  it('tracedFetch default = generation; catalog/schema passed by call site; local events = local', async () => {
    await tracedFetch('/api/fal/generate', { method: 'POST', body: '{}' });
    await tracedFetch('/api/models?provider=x', {}, 'catalog');
    beginSharedGetAction(); await sharedGetJson('/api/model-schema?provider=x&model=y');
    recordLocalEvent('本地拦截 测试', { error: 'x' });
    const rs = getExecutions().slice(0, 4);
    expect(rs.map((r) => r.category)).toEqual(['local', 'schema', 'catalog', 'generation']);
    expect(categoryCounts(rs)).toEqual({ generation: 1, aux: 2, local: 1 });
    expect(isNonGenerationRecord(rs[2])).toBe(true); expect(isNonGenerationRecord(rs[3])).toBe(false);
  });
  it('category beats route heuristic (GET /api/models with category generation counts as generation)', () => {
    expect(isNonGenerationRecord({ method: 'GET', route: '/api/models', category: 'generation' } as any)).toBe(false);
  });
  it('button summary: 生成 N · 目录/Schema M', () => {
    const rows: any[] = [{ category: 'catalog', state: 'complete' }, { category: 'catalog', state: 'complete' }, { category: 'schema', state: 'complete' }];
    expect(countsLabel(rows)).toBe('生成 0 · 目录/Schema 3');
    expect(buttonSummary(rows as any)).toBe('生成 0 · 目录/Schema 3');
    expect(buttonSummary([...rows, { category: 'local', state: 'complete' }, { category: 'generation', state: 'complete' }] as any)).toBe('生成 1 · 目录/Schema 3 · 本地 1');
  });
  it('call sites pass category', () => {
    expect(readFileSync('src/services/api.ts', 'utf8')).toContain("{ headers }, 'catalog')");
    expect(readFileSync('src/services/sharedGet.ts', 'utf8')).toContain("tracedFetch(u, i, 'schema')");
  });
});
