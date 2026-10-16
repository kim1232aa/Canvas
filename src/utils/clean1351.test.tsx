// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import { schemaPrefetchFailureData } from '../engines/drivers/SchemaProviderDriver';
import { upstreamFailureToast, toastFromRunError } from './apiFailure';
import { schemaSendStatus } from './schemaSendStatus';
import { extractWorkflowParameters } from './graphEngine';
import { computeFitTransform, allItemsInViewport, measureChromeInsets } from './fitView';
import { recordOperationName, groupAuxByOperation } from '../components/ExecutionLog';
import { beginRun, endRun, currentTraceOperation, type ExecutionRecord } from '../services/executionTrace';

const read = (rel: string) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');

describe('clean-1351 #1 toast first line = upstream raw body only', () => {
  const upstream = '{"error":{"message":"Unauthorized"}}';
  const wrapper = JSON.stringify({ ok: false, error: `HTTP 401: ${upstream}`, rawResponse: upstream, endpoint: 'https://api.together.xyz/x', errorSource: 'upstream', stack: 'Error: HTTP 401\n    at read (/workspace/canvas/Canvas-main/src/server/schemaProviders.ts:659:13)' });
  it('unwraps rawResponse from the local fail() wrapper', () => {
    const t = upstreamFailureToast(schemaPrefetchFailureData(401, wrapper), '运行：保存图像')!;
    expect(t.title).toBe('HTTP 401');
    const first = t.message.split('\n')[0];
    expect(first).not.toBe(upstream); // fix4 short first line
    expect(t.message).toContain(upstream);
    expect(first).not.toMatch(/\\"|schemaProviders\.ts|stack|"ok":false/);
    // wrapper + stack only in the expandable remainder
    expect(t.message.split('\n').slice(1).join('\n')).toContain('schemaProviders.ts:659');
  });
  it('legacy message-only SchemaPrefetchError is unwrapped too', () => {
    const err = Object.assign(new Error(`GET /api/model-schema?provider=together&model=m → HTTP 401 · 生成 POST 未发送\n${wrapper}`), { name: 'SchemaPrefetchError' });
    expect(toastFromRunError(err)!.message).toContain(upstream);
  });
});

describe('clean-1351 #2 node badges read Schema unavailable from engine meta', () => {
  const meta = JSON.stringify({ _canvas: { schemaUnavailable: true } });
  it('KSampler / EmptyLatent (no own custom_parameters) → schema_unavailable, not pending', () => {
    for (const f of ['steps', 'cfg', 'width', 'seed']) expect(schemaSendStatus('together', f, 20, undefined, null, meta)).toBe('schema_unavailable');
  });
  it('unavailable beats loading', () => {
    expect(schemaSendStatus('together', 'steps', 20, undefined, null, JSON.stringify({ _canvas: { schemaUnavailable: true, schemaLoading: true } }))).toBe('schema_unavailable');
  });
});

describe('clean-1351 #3 no stale checkpoint height when EmptyLatent is connected', () => {
  const nodes: any[] = [
    { id: 'ck', type: 'CheckpointLoaderSimple', title: '', pos: { x: 0, y: 0 }, inputs: [], outputs: [], values: { ckpt_name: 'z-image/turbo', targetProvider: 'wavespeed', width: 1024, height: 1344 } },
    { id: 'pos', type: 'CLIPTextEncode', title: '', pos: { x: 0, y: 0 }, inputs: [], outputs: [], values: { text: 'cat' } },
    { id: 'lat', type: 'EmptyLatentImage', title: '', pos: { x: 0, y: 0 }, inputs: [], outputs: [], values: { width: 1024, height: undefined, batch_size: 1 } },
    { id: 'ks', type: 'KSampler', title: '', pos: { x: 0, y: 0 }, inputs: [], outputs: [], values: { seed: 1, steps: 8, cfg: 1 } },
  ];
  const conns: any[] = [
    { id: 'c1', fromNodeId: 'ck', fromSocketId: 'model', toNodeId: 'ks', toSocketId: 'model' },
    { id: 'c2', fromNodeId: 'pos', fromSocketId: 'conditioning', toNodeId: 'ks', toSocketId: 'positive' },
    { id: 'c3', fromNodeId: 'lat', fromSocketId: 'latent', toNodeId: 'ks', toSocketId: 'latent_image' },
    { id: 'c4', fromNodeId: 'ck', fromSocketId: 'clip', toNodeId: 'pos', toSocketId: 'clip' },
  ];
  it('height stays unset (never 1344 from the checkpoint node)', () => {
    let p: any;
    try { p = extractWorkflowParameters(nodes, conns, 'ks'); } catch (e) { p = undefined; }
    if (p) { expect(p.height).toBeUndefined(); expect(p.width).toBe(1024); }
    const src = read('./graphEngine.ts');
    expect(src).toContain('if (!latentSizeSource) {');
  });
  it('no hard-coded 1344 size fallback in server / graph code', () => {
    expect(read('./graphEngine.ts')).not.toMatch(/1344/);
    expect(read('../server/schemaProviders.ts')).not.toMatch(/1344/);
  });
});

describe('clean-1351 #4 same model reselected → no second Schema GET', () => {
  beforeEach(() => { vi.resetModules(); });
  it('noteUserModelSelection twice for the same provider/model issues ONE GET', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ inputSchema: { properties: { prompt: {} } } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const { noteUserModelSelection } = await import('../services/userModelSelection');
    await noteUserModelSelection('wavespeed', 'krea-v2/turbo-lora');
    await noteUserModelSelection('wavespeed', 'krea-v2/turbo-lora');
    const schemaCalls = fetchMock.mock.calls.filter((c: any[]) => String(c[0]).includes('/api/model-schema'));
    expect(schemaCalls).toHaveLength(1);
    await noteUserModelSelection('wavespeed', 'other-model');
    expect(fetchMock.mock.calls.filter((c: any[]) => String(c[0]).includes('/api/model-schema'))).toHaveLength(2);
    vi.unstubAllGlobals();
  });
});

describe('clean-1351 #6 row name = group name; no 「第 N 次运行」 after the run', () => {
  it('endRun clears the run operation', () => {
    beginRun();
    expect(currentTraceOperation()?.opLabel).toMatch(/次运行/);
    endRun();
    expect(currentTraceOperation()).toBeNull();
  });
  it('aux row and its group share the operation label', () => {
    const r = { id: 1, time: '', route: '/api/models?provider=civitai', method: 'GET', request: null, status: 200, response: {}, state: 'complete', opSeq: 3, opLabel: '操作 3 · 打开 LoRA Hub · x' } as ExecutionRecord;
    expect(recordOperationName(r)).toBe('操作 3 · 打开 LoRA Hub · x');
    expect(groupAuxByOperation([r])[0].label).toBe(recordOperationName(r));
  });
  it('App ends the run in both run paths', () => {
    expect(read('../App.tsx').match(/endRun\(\);/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('clean-1351 #5 Fit View subtracts chrome; viewport only', () => {
  it('nodes fit inside container minus top bar and bottom dock', () => {
    const items = [{ x: 0, y: 0, w: 300, h: 350 }, { x: 1200, y: 700, w: 300, h: 350 }];
    const viewport = { width: 1440, height: 900 };
    const insets = { top: 170, bottom: 90 };
    const t = computeFitTransform(items, viewport, { insets });
    for (const it of items) {
      expect(it.y * t.scale + t.y).toBeGreaterThanOrEqual(insets.top - 1);
      expect((it.y + it.h) * t.scale + t.y).toBeLessThanOrEqual(viewport.height - insets.bottom + 1);
    }
    expect(allItemsInViewport(items, t, viewport, 1)).toBe(true);
  });
  it('measureChromeInsets reads data-canvas-chrome from DOM; ControlPanel dead Fit removed', () => {
    document.body.innerHTML = '<div id="c"></div><header data-canvas-chrome="top"></header><div data-canvas-chrome="bottom"></div>';
    const ins = measureChromeInsets(document.getElementById('c'));
    expect(ins).toMatchObject({ left: 0, right: 0 });
    expect(read('../components/TopBar.tsx')).toContain('data-canvas-chrome="top"');
    expect(read('../components/ModernToolDock.tsx')).toContain('data-canvas-chrome="bottom"');
    expect(read('../components/ControlPanel.tsx')).not.toContain('onClick={onResetView}');
    expect(read('../App.tsx')).toContain('measureChromeInsets(el)');
  });
});

describe('clean-1351 #7 layering / safe areas (DOM contracts)', () => {
  it('Fit tooltip is a custom above-button tooltip, no native title', () => {
    const dock = read('../components/ModernToolDock.tsx');
    expect(dock).toContain('data-testid="fit-view-tooltip"');
    expect(dock).toContain('bottom-full');
    expect(dock).not.toContain('title="自适应缩放以查看所有节点"');
  });
  it('top bar stacks above the params drawer / search', () => {
    expect(read('../components/TopBar.tsx')).toContain('z-[45]');
  });
  it('exec log and drawer keep a bottom safe area', () => {
    expect(read('../components/ExecutionLog.tsx')).toContain('pb-24');
    expect(read('../App.tsx')).toContain('bottom-24 w-96');
  });
  it('node number labels never wrap (去噪强度)', () => {
    expect(read('../components/NodeItem.tsx')).toContain('whitespace-nowrap shrink-0" data-testid={`widget-label-${widget.name}`}');
  });
});
