// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import { measureChromeInsets, computeFitTransform, allItemsInUsableBox } from './fitView';
import { clearNodeExecutionErrors } from './graphEngine';
import { priorRunErrorLabel, errorBannerText } from './apiFailure';
import { formatBeijingHms, CANVAS_TIME_ZONE } from '../services/executionTrace';
import { buttonSummary } from '../components/ExecutionLog';

const read = (rel: string) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');

function stubRect(el: Element | null, rect: { top: number; left: number; bottom: number; right: number; width: number; height: number }) {
  if (!el) return;
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ ...rect, x: rect.left, y: rect.top, toJSON() {} }),
  });
}

describe('clean-1651 #1/#2 exec-log chrome — panel full left; collapsed toggle bottom only', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('open exec-log panel contributes full-column left inset', () => {
    document.body.innerHTML =
      '<div id="c" data-testid="canvas-container"></div>'
      + '<section data-testid="exec-log-panel" data-canvas-chrome="left"></section>';
    const c = document.getElementById('c')!;
    stubRect(c, { top: 0, left: 0, bottom: 900, right: 1400, width: 1400, height: 900 });
    stubRect(document.querySelector('[data-testid="exec-log-panel"]'), {
      top: 200, left: 16, bottom: 850, right: 400, width: 384, height: 650,
    });
    const ins = measureChromeInsets(c, 0);
    expect(ins.left).toBeGreaterThanOrEqual(384);
  });

  it('collapsed toggle marked bottom does NOT contribute full-column left inset', () => {
    document.body.innerHTML =
      '<div id="c" data-testid="canvas-container"></div>'
      + '<button data-testid="exec-log-toggle" data-canvas-chrome="bottom"></button>';
    const c = document.getElementById('c')!;
    stubRect(c, { top: 0, left: 0, bottom: 900, right: 1400, width: 1400, height: 900 });
    // Wide failure text (the 05b ~285px case) — still only bottom chrome.
    stubRect(document.querySelector('[data-testid="exec-log-toggle"]'), {
      top: 850, left: 16, bottom: 890, right: 301, width: 285, height: 40,
    });
    const ins = measureChromeInsets(c, 0);
    expect(ins.left).toBe(0);
    expect(ins.bottom).toBeGreaterThanOrEqual(50); // 900-850
  });

  it('Fit with only bottom chrome from collapsed bar keeps left usable; scale higher than full-left inset', () => {
    const nodes = Array.from({ length: 8 }, (_, i) => ({
      x: 50 + (i % 4) * 380,
      y: 100 + Math.floor(i / 4) * 500,
      w: 300,
      h: 350,
    }));
    const viewport = { width: 1600, height: 900 };
    const withBottomOnly = { top: 160, bottom: 60, left: 0, right: 200 };
    const withFullLeft = { top: 160, bottom: 60, left: 300, right: 200 };
    const tBottom = computeFitTransform(nodes, viewport, { insets: withBottomOnly, minScale: 0.05 });
    const tLeft = computeFitTransform(nodes, viewport, { insets: withFullLeft, minScale: 0.05 });
    expect(allItemsInUsableBox(nodes, tBottom, viewport, withBottomOnly, 2)).toBe(true);
    expect(tBottom.scale).toBeGreaterThan(tLeft.scale);
  });

  it('ExecutionLog: collapsed = bottom chrome + truncate; open panel = left chrome', () => {
    const src = read('../components/ExecutionLog.tsx');
    expect(src).toContain("data-canvas-chrome=\"left\"");
    expect(src).toContain("'data-canvas-chrome': 'bottom'");
    expect(src).toContain('maxWidth:Math.min(380,room)'); // fix11 #2: cap from measured room, never a fixed 240px cut
    expect(src).toContain('truncate');
    expect(src).not.toMatch(/return <div data-canvas-chrome="left"/);
  });

  it('buttonSummary still returns full first line (CSS truncates on the button)', () => {
    const long = 'HTTP 401 Unauthorized · {"error":{"message":"Unauthorized"}}';
    const rows: any[] = [{
      id: 1, state: 'error', acknowledged: false, method: 'POST', route: '/api/generate',
      runLabel: '第 10 次运行', response: { error: long }, status: 401, time: new Date().toISOString(),
    }];
    const s = buttonSummary(rows as any, false);
    expect(s.length).toBeGreaterThan(40);
    expect(s).toMatch(/401|Unauthorized|第 10/);
  });
});

describe('clean-1651 #3 upstream failure badge — 上一次 + 北京时间; keep until success', () => {
  it('formatBeijingHms is Asia/Shanghai HH:MM:SS', () => {
    expect(CANVAS_TIME_ZONE).toBe('Asia/Shanghai');
    // 2026-10-15T10:22:33Z = 18:22:33 北京时间
    expect(formatBeijingHms('2026-10-15T10:22:33.000Z')).toBe('18:22:33');
  });

  it('priorRunErrorLabel formats 「上一次 · HTTP 401 … · 北京时间 HH:MM:SS」', () => {
    const label = priorRunErrorLabel('HTTP 401 Unauthorized', '2026-10-15T10:22:33.000Z');
    expect(label).toBe('上一次 · HTTP 401 Unauthorized · 北京时间 18:22:33');
    expect(label).toContain('上一次');
    expect(label).toContain('北京时间');
    expect(errorBannerText('HTTP 401 Unauthorized')).toBe('HTTP 401 Unauthorized');
  });

  it('priorRunErrorLabel without errorAt still prefixes 上一次', () => {
    expect(priorRunErrorLabel('HTTP 403 Forbidden')).toBe('上一次 · HTTP 403 Forbidden');
  });

  it('keepUpstreamFailures preserves errorMessage/errorAt; full clear drops them', () => {
    const nodes: any[] = [{
      id: 'save', type: 'SaveImage', state: 'error',
      errorMessage: 'HTTP 401 Unauthorized', errorAt: '2026-10-15T10:22:33.000Z',
      localBlockReason: undefined,
    }, {
      id: 'latent', type: 'EmptyLatentImage', state: 'idle',
      localBlockReason: '宽高不齐', localBlockTitle: '本地拦截 · 未发请求',
    }];
    const kept = clearNodeExecutionErrors(nodes, { keepUpstreamFailures: true });
    expect(kept[0].errorMessage).toBe('HTTP 401 Unauthorized');
    expect(kept[0].errorAt).toBe('2026-10-15T10:22:33.000Z');
    expect(kept[0].state).toBe('error');
    expect(kept[1].localBlockReason).toBeUndefined();
    expect(kept[1].localBlockTitle).toBeUndefined();

    const gone = clearNodeExecutionErrors(kept);
    expect(gone[0].errorMessage).toBeUndefined();
    expect(gone[0].errorAt).toBeUndefined();
    expect(gone[0].state).toBe('idle');
  });

  it('clean-0006: clearing local chrome after 宽高拦截 keeps upstream badge + 上一次/北京时间', () => {
    // Simulate SaveImage after a local size-block run: still carries prior 401, plus local-downstream chrome.
    const nodes: any[] = [{
      id: 'save', type: 'SaveImage', state: 'idle',
      errorMessage: 'HTTP 401 Unauthorized', errorAt: '2026-10-15T16:16:55.000Z',
      upstreamFailed: true, upstreamLocalBlocked: true,
      localBlockTitle: '本地拦截 · 未发请求', localBlockReason: undefined,
    }, {
      id: 'latent', type: 'EmptyLatentImage', state: 'idle',
      localBlockReason: '宽高不齐：只填了宽', localBlockTitle: '本地拦截 · 未发请求',
    }];
    const after = clearNodeExecutionErrors(nodes, { keepUpstreamFailures: true });
    expect(after[0].errorMessage).toBe('HTTP 401 Unauthorized');
    expect(after[0].errorAt).toBe('2026-10-15T16:16:55.000Z');
    expect(after[0].state).toBe('error');
    expect(after[0].upstreamLocalBlocked).toBeFalsy();
    expect(after[0].localBlockTitle).toBeUndefined();
    expect(after[0].upstreamFailed).toBe(false);
    const label = priorRunErrorLabel(after[0].errorMessage, after[0].errorAt);
    expect(label).toContain('上一次');
    expect(label).toContain('北京时间');
    expect(label).toMatch(/00:16:55/); // 16:16:55Z → 00:16:55 Asia/Shanghai next day
    expect(after[1].localBlockReason).toBeUndefined();
    expect(after[1].localBlockTitle).toBeUndefined();
  });

  it('clean-0006: whole-run success clears upstream failure; local-clear alone does not', () => {
    const nodes: any[] = [{
      id: 'save', type: 'SaveImage', state: 'error',
      errorMessage: 'HTTP 401 Unauthorized', errorAt: '2026-10-15T16:16:55.000Z',
      upstreamLocalBlocked: true, localBlockTitle: '本地拦截 · 未发请求',
    }];
    const localOnly = clearNodeExecutionErrors(nodes, { keepUpstreamFailures: true });
    expect(localOnly[0].errorMessage).toBe('HTTP 401 Unauthorized');
    const success = clearNodeExecutionErrors(localOnly);
    expect(success[0].errorMessage).toBeUndefined();
    expect(success[0].errorAt).toBeUndefined();
    expect(success[0].state).toBe('idle');
  });

  it('NodeItem banner uses priorRunErrorLabel; App sets errorAt and clears prior failures on run start', () => {
    const node = read('../components/NodeItem.tsx');
    expect(node).toContain('priorRunErrorLabel');
    expect(node).toContain('node.errorAt');
    // clean-0006: banner gated on errorMessage, not only state===error
    expect(node).toContain("node.errorMessage && node.state !== 'running'");
    const app = read('../App.tsx');
    // 2026-10-17 product change: a new Run clears ALL prior red banners at start (no stale 「上一次」 after re-run);
    // keepUpstreamFailures stays available in clearNodeExecutionErrors but run start no longer uses it.
    expect(app).not.toContain('clearNodeExecutionErrors(prev, { keepUpstreamFailures: true })');
    expect(app).toContain('willClearSizeMismatch');
    expect(app).toContain('errorAt: isTarget ? new Date().toISOString()');
    expect(app).toContain('clearNodeExecutionErrors(prev)'); // success path full clear
    // Local-block catch must not assign errorMessage:undefined / errorAt:undefined anymore.
    expect(app).not.toMatch(/downstream\.has\(n\.id\)\)\s*return \{\.\.\.n,[^}]*errorMessage:undefined/);
    expect(read('../types/graph.ts')).toContain('errorAt?: string');
  });
});
