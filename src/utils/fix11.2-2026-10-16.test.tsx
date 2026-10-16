// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  computePreviewFloatPosition,
  PREVIEW_FLOAT_Z,
  isCanvasModalOpen,
} from '../components/PreviewPlaceholder';
import { measureChromeInsets } from './fitView';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('fix11.2 preview float', () => {
  it('#1 inside mode: enough visible strip → float pins to top of preview (above dock, not on labels)', () => {
    // preview mostly above dock: visible strip ~80px
    const pos = computePreviewFloatPosition(
      { left: 400, top: 700, right: 560, bottom: 820, width: 160, height: 120 },
      800, // dock top
      { width: 1600, height: 900 },
    );
    expect(pos.mode).toBe('inside');
    expect(pos.top).toBe(704); // preview.top + 4
    expect(pos.top + 52).toBeLessThanOrEqual(800);
  });

  it('#1 side mode at 1600: tight strip → float parks beside preview, clears dock and 画面比例 band', () => {
    // Same geometry as fix11.1 e2e under-dock: preview y≈822–874, dock y≈832, aspect≈764
    const pos = computePreviewFloatPosition(
      { left: 527, top: 822, right: 637, bottom: 874, width: 110, height: 52 },
      832,
      { width: 1600, height: 900 },
    );
    expect(pos.mode).toBe('side');
    expect(pos.left).toBeGreaterThanOrEqual(637); // to the right of preview
    expect(pos.top + 52).toBeLessThanOrEqual(832);
    // Must not sit on the aspect-ratio band (~764–781)
    expect(pos.top + 52 < 764 || pos.top > 781 || pos.left >= 637).toBe(true);
  });

  it('#1 side mode at 900 with little room on the right still clears dock', () => {
    const pos = computePreviewFloatPosition(
      { left: 700, top: 824, right: 850, bottom: 876, width: 150, height: 52 },
      834,
      { width: 900, height: 900 },
    );
    // right doesn't fit (850+200 > 900) → left side or above
    expect(['side', 'above']).toContain(pos.mode);
    expect(pos.top + 52).toBeLessThanOrEqual(834);
  });

  it('#2 float z-index is below HistoryModal z-50 and above dock z-40', () => {
    expect(PREVIEW_FLOAT_Z).toBeGreaterThan(40);
    expect(PREVIEW_FLOAT_Z).toBeLessThan(50);
    const src = read('../components/PreviewPlaceholder.tsx');
    expect(src).toContain('isCanvasModalOpen');
    expect(src).toContain('PREVIEW_FLOAT_Z');
    const modal = read('../components/HistoryModal.tsx');
    expect(modal).toMatch(/fixed inset-0 z-50/);
  });

  it('#2 isCanvasModalOpen detects History-style overlay', () => {
    document.body.innerHTML = '';
    expect(isCanvasModalOpen(document)).toBe(false);
    const el = document.createElement('div');
    el.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/80';
    document.body.appendChild(el);
    expect(isCanvasModalOpen(document)).toBe(true);
    document.body.innerHTML = '';
  });

  it('#3 raised float must not use full preview height (compact only)', () => {
    const src = read('../components/PreviewPlaceholder.tsx');
    expect(src).not.toMatch(/a\.height\s*\+\s*20/);
    expect(src).toContain('COMPACT_H');
    expect(src).toContain('opacity: 0'); // hide in-tree while floating
  });

  it('measureChromeInsets ignores top-parked bottom-tagged exec chrome', () => {
    const src = read('../utils/fitView.ts');
    expect(src).toContain('fix11.2');
    expect(src).toMatch(/r\.bottom < c\.bottom/);
    document.body.innerHTML =
      '<div id="c" data-testid="canvas-container"></div>'
      + '<div data-testid="modern-tool-dock" data-canvas-chrome="bottom"></div>'
      + '<div data-testid="exec-log-anchor" data-canvas-chrome="bottom"></div>';
    const c = document.getElementById('c')!;
    const stub = (el: Element | null, rect: { top: number; left: number; bottom: number; right: number; width: number; height: number }) => {
      if (!el) return;
      Object.defineProperty(el, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ ...rect, x: rect.left, y: rect.top, toJSON() {} }),
      });
    };
    stub(c, { top: 0, left: 0, bottom: 900, right: 1600, width: 1600, height: 900 });
    stub(document.querySelector('[data-testid="modern-tool-dock"]'), {
      top: 832, left: 480, bottom: 876, right: 1100, width: 620, height: 44,
    });
    // Exec parked under top chrome (fix11.1 at ~900) — must NOT inflate bottom inset
    stub(document.querySelector('[data-testid="exec-log-anchor"]'), {
      top: 176, left: 12, bottom: 214, right: 255, width: 243, height: 38,
    });
    const ins = measureChromeInsets(c, 12);
    expect(ins.bottom).toBeGreaterThanOrEqual(900 - 832);
    expect(ins.bottom).toBeLessThan(200); // would be ~736 if top-parked exec were counted
    document.body.innerHTML = '';
  });
});
