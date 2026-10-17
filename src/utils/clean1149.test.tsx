// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import { toastFromRunError, upstreamFailureToast, TOAST_BODY_FIRST_LINE_MAX } from './apiFailure';
import { schemaPrefetchFailureData } from '../engines/drivers/SchemaProviderDriver';
import { isCustomParametersJsonQuery, sanitizeCatalogQuery } from '../services/api';
import { formatHistorySize, HISTORY_UNSUPPORTED_LABEL, historyParameterSourceLabel } from './historyParameters';
import { formatRecordTime, CANVAS_TIME_ZONE, CANVAS_TIME_ZONE_LABEL } from '../services/executionTrace';
import { groupAuxByOperation, groupGenByRun, genRunHeader, auxOperationHeader } from '../components/ExecutionLog';
import type { ExecutionRecord } from '../services/executionTrace';
import { computeFitTransform, allItemsInViewport } from './fitView';
import { SchemaChoiceControls } from '../components/SchemaChoiceControls';
import { FIELD_STATUS_LABEL } from '../components/FieldStatusBadge';

const read = (rel: string) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');

describe('clean-1149 #1 Schema GET 401 toast = HTTP status + upstream body', () => {
  const body = '{"error":{"message":"Unauthorized"}}';
  it('structured prefetch data → same toast as generation POST failure', () => {
    const data = schemaPrefetchFailureData(401, body);
    const t = upstreamFailureToast(data, '运行：保存图像')!;
    expect(t.title).toBe('HTTP 401');
    expect(t.message).toContain('完整上游响应原文');
    expect(t.message).toContain(body);
    expect(t.message.split('\n')[0]).not.toBe(body); // fix4 short first line
    expect(t.message).not.toMatch(/请求未完成|未发出生成请求/);
  });
  it('toastFromRunError recovers SchemaPrefetchError without .data → plain headline title', () => {
    const err = Object.assign(new Error(`GET /api/model-schema?provider=together&model=x → HTTP 401 · 生成 POST 未发送\n${body}`), { name: 'SchemaPrefetchError' });
    const t = toastFromRunError(err, '运行：保存图像')!;
    expect(t.title).toBe('没出图：读取模型 x 的参数失败（HTTP 401），请检查 API Key');
    expect(t.title).not.toMatch(/^HTTP /);
    expect(t.message.split('\n')[0]).toBe('查模型参数时返回 HTTP 401，生成请求没有发出去');
    expect(t.message).toContain(body); // full body under 展开全文
  });
  it('err.data from prefetchFailure → same plain schema toast', () => {
    const err = Object.assign(new Error('ignore'), { name: 'SchemaPrefetchError', data: schemaPrefetchFailureData(401, body) });
    const t = toastFromRunError(err)!;
    expect(t.title).toContain('读取模型');
    expect(t.title).not.toMatch(/^HTTP /);
    expect(t.message.split('\n')[0]).toContain('HTTP 401');
  });
});

describe('clean-1149 #2 custom JSON never becomes /api/models?query={…}', () => {
  const json = '{\n  "seed": 1,\n  "_canvas": { "schemaProperties": ["output_format"] }\n}';
  it('detects and sanitizes JSON-shaped catalog queries', () => {
    expect(isCustomParametersJsonQuery(json)).toBe(true);
    expect(sanitizeCatalogQuery(json)).toBe('');
    expect(sanitizeCatalogQuery('flux')).toBe('flux');
  });
  it('ProviderModelSelect skips fetch when query is custom JSON', () => {
    const src = read('../components/ProviderModelSelect.tsx');
    expect(src).toContain('isCustomParametersJsonQuery(query)');
    expect(src).toContain('setQuery(\'\')');
  });
  it('fetchLiveModelsOnce uses sanitizeCatalogQuery', () => {
    expect(read('../services/api.ts')).toContain('const safeQuery = sanitizeCatalogQuery(query)');
  });
});

describe('clean-1149 #3 history 尺寸: one chip, label not struck', () => {
  it('unsupported with canvas value → value struck once + chip; without value → chip only', () => {
    const withVal = formatHistorySize({
      width: { key: 'width', value: 1024, source: 'unsupported' },
      height: { key: 'height', value: 768, source: 'unsupported' },
      size: { key: 'size', value: undefined, source: 'unsupported' },
    } as any);
    expect(withVal.canvasValue).toBe('1024×768');
    expect(withVal.text).toBe('1024×768');
    expect(historyParameterSourceLabel(withVal.source)).toBe(HISTORY_UNSUPPORTED_LABEL);

    const noVal = formatHistorySize({
      width: { key: 'width', value: undefined, source: 'unsupported' },
      height: { key: 'height', value: undefined, source: 'unsupported' },
      size: { key: 'size', value: undefined, source: 'unsupported' },
    } as any);
    expect(noVal.text).toBe('');
    expect(noVal.canvasValue).toBeUndefined();

    const modal = read('../components/HistoryModal.tsx');
    expect(modal).toContain('history-size-unsent-value');
    expect(modal).not.toMatch(/unsupported: '[^']*line-through/);
  });
});

describe('clean-1149 #4 LoRA Hub / hub ops named correctly', () => {
  it('opening LoRA Hub / 底模中心 begins a named operation (not 第 N 次运行)', () => {
    expect(read('../components/CivitaiModal.tsx')).toContain("beginTraceOperation('打开 LoRA Hub')");
    expect(read('../components/ModelHubModal.tsx')).toContain("beginTraceOperation('打开底模中心')");
  });
});

describe('clean-1149 #6 Asia/Shanghai · 北京时间 only', () => {
  it('formatRecordTime always labels 北京时间 even if box zone is Tokyo', () => {
    expect(CANVAS_TIME_ZONE).toBe('Asia/Shanghai');
    const s = formatRecordTime('2026-10-15T03:00:00.000Z');
    expect(s).toContain(CANVAS_TIME_ZONE_LABEL);
    expect(s).not.toContain('日本');
    // 03:00Z → 11:00 CST
    expect(s).toMatch(/2026-10-15 11:00:00（北京时间）/);
  });
});

describe('clean-1149 #7 generation grouped by run with counts', () => {
  const rec = (id: number, route: string, method: string, runSeq?: number, runLabel?: string): ExecutionRecord =>
    ({ id, time: '2026-10-15T03:00:00Z', route, method, request: null, status: 200, response: {}, state: 'complete', runSeq, runLabel });
  it('submit + tasks poll + save-result share one run group', () => {
    const g = groupGenByRun([
      rec(1, '/api/together/generate', 'POST', 8, '第 8 次运行 · …'),
      rec(2, '/api/together/tasks/abc', 'GET', 8, '第 8 次运行 · …'),
      rec(3, '/api/together/save-result', 'POST', 8, '第 8 次运行 · …'),
      rec(4, '/api/venice/generate', 'POST', 9, '第 9 次运行 · …'),
    ]);
    expect(g).toHaveLength(2);
    expect(g[0].records).toHaveLength(3);
    expect(genRunHeader(g[0])).toContain('3 条请求');
  });
});

describe('clean-1149 #8–9 DOM labels', () => {
  it('schema_unavailable badge text is full; dropdown empty option is short （不发送）', () => {
    expect(FIELD_STATUS_LABEL.schema_unavailable).toBe('Schema 不可用，字段不会发送');
    const html = renderToStaticMarkup(
      <SchemaChoiceControls
        inputSchema={{ properties: { output_format: { type: 'string', enum: ['jpeg', 'png'], default: 'jpeg' } } }}
        value="{}"
        onChange={() => {}}
      />,
    );
    expect(html).toContain('未填写，不发送（Schema 默认：jpeg）'); // badge once
    expect(html).toContain('（不发送）'); // short option
    expect(html).toMatch(/data-testid="schema-badge-output_format"[^>]*>未填写，不发送（Schema 默认：jpeg）</);
    expect(html).toMatch(/<option[^>]*>（不发送）<\/option>/);
    // full sentence must not appear as the visible option label (title attr alone is ok)
    expect(html.replace(/title="[^"]*"/g, '')).toMatch(/未填写，不发送（Schema 默认：jpeg）/); // badge only once in body text without titles
    expect(html.replace(/title="[^"]*"/g, '').match(/未填写，不发送（Schema 默认：jpeg）/g)?.length).toBe(1);
  });
  it('ProviderModelSelect status is 已选底模 when value set (not 当前目录页暂无底模)', () => {
    expect(read('../components/ProviderModelSelect.tsx')).toContain("value ? '已选底模'");
  });
});

describe('clean-1149 #10–12 source contracts', () => {
  it('LoRA strength number inputs leave room for spinners (pr-7)', () => {
    expect(read('../components/NodeItem.tsx')).toContain('pl-2.5 pr-7');
  });
  it('run button blurs on leave/click; disabled hover reset in CSS', () => {
    expect(read('../components/TopBar.tsx')).toContain('onPointerLeave');
    expect(read('../index.css')).toContain('.studio-run:hover:not(:disabled)');
  });
  it('exec log toggle is muted (no rose/pulse) when hasError — toast is primary', () => {
    const src = read('../components/ExecutionLog.tsx');
    expect(src).toContain('data-testid="exec-log-toggle"');
    // fix12: top-parked uses dashed float chrome; dock-parked keeps solid muted slate (never rose/pulse).
    expect(src).toContain("border-slate-500 bg-[#1a1f2b] text-slate-200");
    expect(src).not.toContain('animate-pulse');
    expect(src).not.toMatch(/hasError[^\n]*rose/);
  });
});

describe('clean-1149 #13 Fit View (CODE_ONLY; screenshots are the acceptance gate)', () => {
  it('fit-view button title mounted on ModernToolDock', () => {
    const dock = read('../components/ModernToolDock.tsx');
    expect(dock).toContain('data-testid="fit-view"');
    expect(dock).toContain('自适应缩放以查看所有节点');
  });
  it('when page/container is scrolled (viewport ≠ window), computeFitTransform keeps all nodes in the container viewport', () => {
    // Simulates a scrolled page / chrome-offset container: viewport is the canvas client box, not window.
    // Moderate spread that fits above minScale — proves container viewport (not window/scroll) is what matters.
    const items = [
      { x: 0, y: 0, w: 300, h: 350 },
      { x: 900, y: 600, w: 300, h: 350 },
      { x: 1800, y: 200, w: 300, h: 350 },
    ];
    const viewport = { width: 1000, height: 700 }; // canvas container client size after chrome / regardless of document scroll
    const t = computeFitTransform(items, viewport);
    expect(allItemsInViewport(items, t, viewport, 2)).toBe(true);
    // Same nodes would miss the container if we wrongly used a scrolled/offset window larger than the container
    // and then applied that transform into the smaller container — here we only ever fit to `viewport`.
    expect(read('../utils/fitView.ts')).not.toContain('scrollX');
    expect(read('../components/Canvas.tsx')).toContain('data-testid="canvas-container"');
    expect(read('../App.tsx')).toContain('canvas-container');
  });
});
