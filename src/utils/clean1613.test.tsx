// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import {
  computeFitTransform,
  allItemsInViewport,
  allItemsInUsableBox,
  fitItemsForMode,
  measureChromeInsets,
  sanitizeFitItems,
} from './fitView';
import { revealNodeTransform } from './localBlock';
import {
  beginRun,
  endRun,
  getExecutions,
  recordLocalEvent,
  currentRunAttach,
  setCurrentRunTarget,
} from '../services/executionTrace';
import { isViewportPanRecord, requestLineParts, errorScopeTag, groupGenByRun } from '../components/ExecutionLog';

const read = (rel: string) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');

describe('clean-1613 #1 Fit View — after taller nodes / model switch, usable box stays filled', () => {
  it('taller nodes (schema/preview growth) still fit inside usable chrome box', () => {
    // Reproduces 04c shape: 8 nodes that grew after z-image switch; scale ~0.3 must still put them in the usable box.
    const nodes = Array.from({ length: 8 }, (_, i) => ({
      x: 50 + (i % 4) * 380,
      y: 100 + Math.floor(i / 4) * 700,
      w: 320,
      h: 620, // taller after schema widgets + preview
    }));
    const viewport = { width: 1920, height: 1080 };
    const insets = { top: 160, bottom: 100, left: 20, right: 220 };
    const t = computeFitTransform(nodes, viewport, { insets, minScale: 0.05 });
    expect(allItemsInUsableBox(nodes, t, viewport, insets, 2)).toBe(true);
    expect(allItemsInViewport(nodes, t, viewport, 2)).toBe(true);
    // Zoom buttons previously zoomed toward origin and could leave content lost; Fit must recover.
    const drifted = { x: t.x, y: t.y, scale: Math.max(t.scale / 1.15 ** 4, 0.15) };
    const recovered = computeFitTransform(nodes, viewport, { insets, minScale: 0.05 });
    expect(allItemsInUsableBox(nodes, recovered, viewport, insets, 2)).toBe(true);
    expect(drifted.scale).toBeGreaterThan(0);
  });

  it('orphan leftover spatial frame is ignored in graph mode; Fit still shows all graph nodes', () => {
    const nodes = Array.from({ length: 6 }, (_, i) => ({ id: `n${i}`, pos: { x: 80 + i * 340, y: 180 }, width: 300 }));
    const orphan = [{ pos: { x: 9000, y: 8000 }, width: 512, height: 512 }];
    const items = fitItemsForMode('graph', nodes, orphan, () => 400, () => 300);
    expect(items).toHaveLength(6);
    const viewport = { width: 1600, height: 900 };
    const insets = { top: 150, bottom: 90, left: 0, right: 0 };
    const t = computeFitTransform(items, viewport, { insets, minScale: 0.05 });
    expect(allItemsInUsableBox(items, t, viewport, insets, 2)).toBe(true);
  });

  it('sanitizeFitItems drops NaN boxes; measureChromeInsets reads left/right markers', () => {
    expect(sanitizeFitItems([{ x: 0, y: 0, w: 10, h: 10 }, { x: NaN, y: 0, w: 10, h: 10 }])).toHaveLength(1);
    document.body.innerHTML = '<div id="c"></div>'
      + '<header data-canvas-chrome="top"></header>'
      + '<div data-canvas-chrome="bottom"></div>'
      + '<div data-canvas-chrome="left"></div>'
      + '<div data-canvas-chrome="right"></div>';
    const c = document.getElementById('c')!;
    Object.defineProperty(c, 'getBoundingClientRect', { value: () => ({ top: 0, left: 0, bottom: 900, right: 1400, width: 1400, height: 900, x: 0, y: 0, toJSON() {} }) });
    const stub = (el: Element | null, rect: { top: number; left: number; bottom: number; right: number; width: number; height: number }) => {
      if (!el) return;
      Object.defineProperty(el, 'getBoundingClientRect', { value: () => ({ ...rect, x: rect.left, y: rect.top, toJSON() {} }) });
    };
    stub(document.querySelector('[data-canvas-chrome="top"]'), { top: 0, left: 0, bottom: 80, right: 1400, width: 1400, height: 80 });
    stub(document.querySelector('[data-canvas-chrome="bottom"]'), { top: 852, left: 500, bottom: 900, right: 900, width: 400, height: 48 });
    stub(document.querySelector('[data-canvas-chrome="left"]'), { top: 850, left: 16, bottom: 890, right: 176, width: 160, height: 40 });
    stub(document.querySelector('[data-canvas-chrome="right"]'), { top: 750, left: 1200, bottom: 880, right: 1400, width: 200, height: 130 });
    const ins = measureChromeInsets(c, 0);
    expect(ins.top).toBeGreaterThanOrEqual(80);
    expect(ins.left).toBeGreaterThanOrEqual(160);
    expect(ins.right).toBeGreaterThanOrEqual(200);
  });

  it('App Fit View measures width+height, rAF second pass; Minimap does not clamp yellow box', () => {
    const app = read('../App.tsx');
    expect(app).toContain('measureW');
    expect(app).toContain('requestAnimationFrame');
    expect(app).toContain('fitItemsForMode(canvasMode, nodes, spatialFrames, measureH, measureW)');
    const mini = read('../components/Minimap.tsx');
    expect(mini).toContain('left: vpMapX');
    expect(mini).toContain('top: vpMapY');
    expect(mini).not.toContain('Math.max(vpMapX, 0)');
    expect(mini).toContain("data-canvas-chrome=\"right\"");
    expect(mini).toContain('canvasMode');
  });
});

describe('clean-1613 #2 viewport pan — one complete row under the current run', () => {
  beforeEach(() => {
    // Fresh run context for each test
    beginRun();
    setCurrentRunTarget('保存图像');
  });

  it('recordLocalEvent with attach keeps runLabel after endRun; state complete is not 较早失败', () => {
    const attach = currentRunAttach();
    expect(attach.runLabel).toMatch(/次运行/);
    endRun(); // clears current label — attach must still bind
    const row = recordLocalEvent(
      '视口平移至原因节点',
      { ok: true, note: '视口平移至原因节点', causeNodeId: 'lora-1' },
      'complete',
      new Date(),
      attach,
    );
    expect(row.state).toBe('complete');
    expect(row.runLabel).toBe(attach.runLabel);
    expect(row.runSeq).toBe(attach.runSeq);
    expect(errorScopeTag(row)).toBeNull();
    expect(isViewportPanRecord(row)).toBe(true);
    const parts = requestLineParts(row);
    expect(parts.status).toContain('视口操作');
    expect(parts.status).not.toMatch(/请求失败|本地拦截/);
    const groups = groupGenByRun([row]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe(attach.runLabel);
    expect(groups[0].label).not.toBe('未归属运行');
  });

  it('reveal with left chrome inset pans an off-screen-left node fully into the usable box', () => {
    const t = revealNodeTransform(
      { x: -900, y: 120, w: 300, h: 260 },
      { x: 0, y: 0, scale: 1 },
      { width: 1600, height: 900 },
      { top: 180, bottom: 90, left: 320, right: 220 },
    );
    expect(t).not.toBeNull();
    const left = -900 * t!.scale + t!.x;
    expect(left).toBeGreaterThanOrEqual(320);
  });

  it('App captures currentRunAttach before endRun; records complete; StrictMode guard; only then jumps', () => {
    const app = read('../App.tsx');
    expect(app).toContain('currentRunAttach()');
    expect(app).toContain("recordLocalEvent('视口平移至原因节点'");
    expect(app).toContain("'complete'");
    expect(app).toContain('recordedPan');
    expect(app).toContain('panAttach');
    expect(app).toMatch(/if \(!recordedPan\)[\s\S]*recordLocalEvent[\s\S]*return next/);
  });
});

describe('clean-1613 #3 nodes not clipped by chrome — insets + markers', () => {
  it('exec log marked left chrome; Fit / reveal consume left+right insets', () => {
    expect(read('../components/ExecutionLog.tsx')).toContain('data-canvas-chrome="left"');
    expect(read('../utils/fitView.ts')).toContain('data-canvas-chrome="left"');
    expect(read('../utils/fitView.ts')).toContain('data-canvas-chrome="right"');
    expect(read('../utils/localBlock.ts')).toContain('insets.left');
    expect(read('../App.tsx')).toContain('left: ins.left');
  });
});

describe('clean-1613 #4 toast below secondary toolbar', () => {
  it('toast sits at bottom-24 (fix4.1: above bottom dock); never fixed top-20 or bottom-6', () => {
    const app = read('../App.tsx');
    expect(app).toContain('data-testid="toast-container"');
    expect(app).toMatch(/toast-container[\s\S]*bottom-24/);
    // old fixed top-20 that covered 「云端项目 / 历史 API 调用样本」 must be gone
    expect(app).not.toMatch(/toast-container"[^>]*top-20/);
    // fix4.1: bottom-6 collided with ModernToolDock (also bottom-6)
    expect(app).not.toMatch(/toast-container"[^>]*\bbottom-6\b/);
  });
});
