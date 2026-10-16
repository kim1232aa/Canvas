// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import express from 'express';
import { computeFitTransform, allItemsInViewport, fitItemsForMode, measureChromeInsets } from './fitView';
import { widthHeightMismatch, sizePairingFromSchemaProps, sizeStringSeparator, revealNodeTransform, sizeMismatchCleared, sizeOrUndef } from './localBlock';
import { noteUserModelSelection, subscribeSchemaSelectResult, schemaRequestFor } from '../services/userModelSelection';
import { sharedGetJson, clearSharedGet } from '../services/sharedGet';
import { getExecutions, recordLocalEvent } from '../services/executionTrace';
import { registerSchemaProviderRoutes } from '../server/schemaProviders';
import { getModelSizePairing } from '../services/modelSchemaCache';

const read = (rel: string) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');

describe('clean-1358 #1 Fit View — never leave the viewport empty', () => {
  it('a wide graph with an orphan spatial frame still fits when minScale can drop below 0.35', () => {
    const nodes = Array.from({ length: 8 }, (_, i) => ({ x: 50 + i * 340, y: 150, w: 300, h: 350 }));
    const orphan = { x: 8000, y: 5000, w: 512, h: 662 };
    const viewport = { width: 1920, height: 1080 };
    const insets = { top: 140, bottom: 100 };
    // Graph mode ignores the orphan frame.
    const graphItems = fitItemsForMode('graph', nodes.map((n, i) => ({ id: `n${i}`, pos: { x: n.x, y: n.y }, width: n.w })), [orphan].map((f) => ({ pos: { x: f.x, y: f.y }, width: f.w, height: f.h - 150 })));
    expect(graphItems).toHaveLength(8);
    const t = computeFitTransform(graphItems, viewport, { insets, minScale: 0.05 });
    expect(allItemsInViewport(graphItems, t, viewport, 2)).toBe(true);
    // Even if someone passes nodes+orphan together, the low floor still keeps them on screen.
    const both = computeFitTransform([...nodes, orphan], viewport, { insets, minScale: 0.05 });
    expect(allItemsInViewport([...nodes, orphan], both, viewport, 2)).toBe(true);
    expect(both.scale).toBeLessThan(0.35);
  });
  it('App Fit View is mode-aware and uses measured heights; Minimap uses the canvas container', () => {
    const app = read('../App.tsx');
    expect(app).toContain('fitItemsForMode(canvasMode');
    expect(app).toContain('minScale: 0.05');
    expect(app).not.toMatch(/nodes\.map\(\(n\) => \(\{ x: n\.pos\.x, y: n\.pos\.y, w: n\.width \|\| 300, h: 350 \}\)\),\s*\.\.\.spatialFrames/);
    const mini = read('../components/Minimap.tsx');
    expect(mini).toContain("querySelector('[data-testid=\"canvas-container\"]')");
    expect(mini).not.toContain('const vpWidth = window.innerWidth / transform.scale');
  });
  it('measureChromeInsets still reads data-canvas-chrome markers', () => {
    expect(read('../utils/fitView.ts')).toContain('data-canvas-chrome="top"');
    expect(read('../components/TopBar.tsx')).toContain('data-canvas-chrome="top"');
    expect(read('../components/ModernToolDock.tsx')).toContain('data-canvas-chrome="bottom"');
  });
});

describe('clean-1358 #2 Venice Schema GET — one browser request, two different upstream URLs (cached swagger)', () => {
  it('root cause is documented in schemaProviders: catalog + official OpenAPI; swagger is cached by URL', () => {
    const src = read('../server/schemaProviders.ts');
    expect(src).toContain('officialSpecCache');
    expect(src).toContain('clean-1358 #2');
    expect(src).toMatch(/if\(provider==='venice'\)[\s\S]*?list\([\s\S]*?readOfficialSpec/);
  });
  it('a second readOfficialSpec for the same swagger URL does not re-fetch', async () => {
    const calls: string[] = [];
    const app = express();
    registerSchemaProviderRoutes(app as any, {
      fetch: async (_m: any, url: string) => {
        calls.push(url);
        if (String(url).includes('swagger') || String(url).includes('openapi')) {
          return new Response('openapi: 3.0.0\npaths:\n  /image/generate:\n    post:\n      requestBody:\n        content:\n          application/json:\n            schema:\n              type: object\n              properties:\n                prompt: { type: string }\n                width: { type: integer }\n                height: { type: integer }\n', { status: 200 });
        }
        // catalog
        return new Response(JSON.stringify([{ id: 'venice-sd35', type: 'image', model_spec: { constraints: {} } }]), { status: 200 });
      },
      key: () => 'k', record: (i: any) => i, durable: async (u: string) => ({ ok: true, dataUrl: u }),
    } as any);
    const route = (app as any)._router.stack.find((l: any) => l.route?.path === '/api/model-schema').route.stack[0].handle;
    const call = async (model: string) => {
      let status = 200; let payload: any;
      const res: any = { status(c: number) { status = c; return this; }, json(p: any) { payload = p; return this; } };
      await route({ method: 'GET', path: '/api/model-schema', params: {}, query: { provider: 'venice', model }, headers: {} }, res, () => {});
      return { status, payload, calls: calls.slice() };
    };
    const a = await call('venice-sd35');
    const swaggerCalls1 = calls.filter((u) => u.includes('swagger')).length;
    const catalogCalls1 = calls.filter((u) => u.includes('/models')).length;
    expect(a.status).toBeLessThan(500);
    expect(swaggerCalls1).toBe(1);
    expect(catalogCalls1).toBe(1);
    await call('venice-sd35');
    // Second select: catalog re-fetched (refresh semantics), swagger served from officialSpecCache.
    expect(calls.filter((u) => u.includes('swagger')).length).toBe(1);
    expect(calls.filter((u) => u.includes('/models')).length).toBe(2);
  });
});

describe('clean-1358 #3 Schema select failure toasts immediately', () => {
  beforeEach(() => clearSharedGet());
  it('subscribeSchemaSelectResult fires on a failed GET (not on reuse)', async () => {
    const events: any[] = [];
    const unsub = subscribeSchemaSelectResult((e) => events.push(e));
    let n = 0;
    const prevFetch = globalThis.fetch;
    globalThis.fetch = (async () => { n++; return new Response(JSON.stringify({ error: { message: 'Unauthorized' } }), { status: 401 }); }) as any;
    try {
      const p = noteUserModelSelection('together', 'black-forest-labs/FLUX.1-schnell');
      expect(p).toBeTruthy();
      await p?.catch(() => {});
      await new Promise((r) => setTimeout(r, 0));
      expect(events.some((e) => !e.reused && e.result.ok === false && (e.result.status === 401 || e.result.status === 0))).toBe(true);
      const before = events.length;
      await noteUserModelSelection('together', 'black-forest-labs/FLUX.1-schnell')?.catch(() => {});
      await new Promise((r) => setTimeout(r, 0));
      expect(n).toBe(1);
      expect(events.slice(before).every((e) => e.reused === true)).toBe(true);
    } finally {
      globalThis.fetch = prevFetch;
      unsub();
    }
    expect(read('../App.tsx')).toContain('subscribeSchemaSelectResult');
    expect(read('../App.tsx')).toContain('upstreamFailureToast');
  });
});

describe('clean-1358 #4 reveal pans the full node and App records 视口平移至原因节点', () => {
  it('an off-screen-left node is brought fully into the usable box', () => {
    const t = revealNodeTransform({ x: -800, y: 100, w: 300, h: 220 }, { x: 0, y: 0, scale: 1 }, { width: 1600, height: 900 }, { top: 180, bottom: 90 });
    expect(t).not.toBeNull();
    const left = -800 * t!.scale + t!.x;
    expect(left).toBeGreaterThanOrEqual(12);
  });
  it('App only pans when it also writes the exec-log row', () => {
    const app = read('../App.tsx');
    expect(app).toContain("recordLocalEvent('视口平移至原因节点'");
    expect(app).toContain('if (!next) return t;');
  });
});

describe('clean-1358 #5 Schema-driven single-side size does not block', () => {
  it('size pairing from props', () => {
    expect(sizePairingFromSchemaProps({ size: { type: 'string', default: '1024*1024' } })).toBe('pair');
    expect(sizeStringSeparator({ type: 'string', default: '1024*1024' })).toBe('*');
    expect(sizePairingFromSchemaProps({ width: { type: 'integer' }, height: { type: 'integer' } })).toBe('pair');
    expect(sizePairingFromSchemaProps({ width: { type: 'integer' } })).toBe('single-width');
    expect(sizePairingFromSchemaProps({ height: { type: 'integer' } })).toBe('single-height');
    expect(sizePairingFromSchemaProps({ prompt: { type: 'string' } })).toBe('none');
    expect(sizePairingFromSchemaProps(null)).toBe('unknown');
  });
  it('mismatch blocks for pair/unknown, never for single-side', () => {
    expect(widthHeightMismatch(1024, undefined, 'pair')).toMatch(/宽高不齐/);
    expect(widthHeightMismatch(1024, undefined, 'unknown')).toMatch(/宽高不齐/);
    expect(widthHeightMismatch(1024, undefined, 'single-width')).toBeNull();
    expect(widthHeightMismatch(undefined, 768, 'single-height')).toBeNull();
    expect(widthHeightMismatch(1024, undefined, 'none')).toBeNull();
    expect(sizeMismatchCleared(1024, 1024)).toBe(true);
    expect(sizeMismatchCleared(1024, undefined)).toBe(false);
  });
  it('App passes getModelSizePairing into the pre-request check', () => {
    expect(read('../App.tsx')).toContain('getModelSizePairing(ck?.values?.targetProvider');
    expect(read('../App.tsx')).toContain('widthHeightMismatch(ext.width, ext.height, pairing)');
  });
});

describe('clean-1358 #6 red frame not clipped by ring-outside-box', () => {
  it('NodeItem uses inset shadow for error/local-block instead of ring-2', () => {
    const node = read('../components/NodeItem.tsx');
    expect(node).toContain('overflow-visible');
    expect(node).toContain("shadow-[0_0_0_2px_rgba(244,63,94,0.45)]");
    expect(node).toContain('node.localBlockReason');
    // error state no longer relies on ring-2 (which canvas overflow-hidden was cropping)
    expect(node).not.toMatch(/node\.state === 'error'\s*\n\s*\? 'border-rose-500 ring-2/);
  });
});

describe('clean-1358 #7 clearing width/height clears stale block + toast', () => {
  it('App clears localBlock fields when Empty Latent size mismatch resolves', () => {
    const app = read('../App.tsx');
    expect(app).toContain('sizeMismatchCleared');
    expect(app).toContain("n.type === 'EmptyLatentImage'");
    expect(app).toContain('宽高不齐|只填了宽|只填了高');
  });
  it('sizeOrUndef still never invents 1024', () => {
    expect(sizeOrUndef('')).toBeUndefined();
    expect(sizeOrUndef(1024)).toBe(1024);
  });
});
