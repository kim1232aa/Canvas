// @vitest-environment jsdom
// clean-0935: the REAL App, mounted in StrictMode (as main.tsx does) over a restored workspace with WaveSpeed z-image,
// WaveSpeed Krea, Venice and Together chains. After mount + settle: 0 Schema / catalog GETs, 0 exec-log rows,
// no send badges, no Schema fields; restored images are labelled 刷新前的结果.
import React, { StrictMode, act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NODE_DEFINITIONS as D } from '../constants/nodes';
import { BOARDS_KEY, ACTIVE_BOARD_KEY, MODE_KEY } from '../utils/workspaceCache';
import { FieldStatusBadge } from '../components/FieldStatusBadge';
import { SchemaChoiceControls } from '../components/SchemaChoiceControls';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const node = (id: string, type: string, values: any, extra: any = {}) => ({ id, type, title: D[type].title, pos: { x: 0, y: 0 }, width: 300, inputs: D[type].inputs, outputs: D[type].outputs, values: { ...D[type].defaultValues, ...values }, state: 'idle', ...extra });
const stale = (props: string[]) => JSON.stringify({ _canvas: { schemaProperties: props } });
function chain(p: string, provider: string, model: string, i: number, customParams?: string) {
  const ids = { ck: `${p}-ck`, ks: `${p}-ks`, el: `${p}-el`, vd: `${p}-vd`, sv: `${p}-sv` };
  const actualCustomParams = customParams !== undefined ? customParams : stale(['prompt', 'seed', 'height', 'width', 'output_format', 'size']);
  return {
    nodes: [
      node(ids.ck, 'CheckpointLoaderSimple', { ckpt_name: model, targetProvider: provider, custom_parameters: actualCustomParams }),
      node(ids.ks, 'KSampler', { seed: 42 }, i === 0 ? { outputData: 'https://example.com/prev-ks.png', outputAt: '2026-10-15T00:10:00.000Z' } : {}),
      node(ids.el, 'EmptyLatentImage', { width: 1024, height: 1024 }),
      node(ids.vd, 'VAEDecode', {}),
      node(ids.sv, 'SaveImage', {}, i === 0 ? { outputData: 'https://example.com/prev-save.png' } : {}),
    ],
    connections: [
      { id: `${p}-c1`, fromNodeId: ids.ck, fromSocketId: 'MODEL', toNodeId: ids.ks, toSocketId: 'model', type: 'MODEL' },
      { id: `${p}-c2`, fromNodeId: ids.el, fromSocketId: 'LATENT', toNodeId: ids.ks, toSocketId: 'latent_image', type: 'LATENT' },
      { id: `${p}-c3`, fromNodeId: ids.ks, fromSocketId: 'LATENT', toNodeId: ids.vd, toSocketId: 'samples', type: 'LATENT' },
      { id: `${p}-c4`, fromNodeId: ids.ck, fromSocketId: 'VAE', toNodeId: ids.vd, toSocketId: 'vae', type: 'VAE' },
      { id: `${p}-c5`, fromNodeId: ids.vd, fromSocketId: 'IMAGE', toNodeId: ids.sv, toSocketId: 'images', type: 'IMAGE' },
    ],
  };
}

function assertNoAffirmativeSendBadges(root: Element) {
  // 1. SchemaChoiceControls: affirmative send badge has emerald text and sends value
  const schemaBadges = root.querySelectorAll('[data-testid^="schema-badge-"]');
  for (const b of schemaBadges) {
    const txt = (b.textContent || '').trim();
    if (b.classList.contains('text-emerald-300') || txt.startsWith('会发送')) {
      throw new Error(`Found unexpected affirmative schema-badge: "${txt}"`);
    }
  }
  // 2. FieldStatusBadge: will_send badge text or title
  const spans = root.querySelectorAll('span');
  for (const span of spans) {
    const txt = (span.textContent || '').trim();
    if (txt === '会发送' || (txt.startsWith('会发送 ') && !txt.includes('不会发送'))) {
      throw new Error(`Found affirmative FieldStatusBadge: "${txt}"`);
    }
    const title = span.getAttribute('title') || '';
    if (title.includes('模型 Schema 已声明该字段') && title.includes('已填值会原样发送')) {
      throw new Error(`Found affirmative FieldStatusBadge with will_send title: "${title}"`);
    }
  }
}

describe('real App mount over a restored workspace', () => {
  let appRoot: ReturnType<typeof createRoot> | undefined;
  afterEach(async () => {
    if (appRoot) {
      await act(async () => {
        appRoot!.unmount();
      });
      appRoot = undefined;
    }
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });
  it('0 Schema/catalog GETs, 0 exec rows, no 会发送, no Schema fields; restored outputs labelled', async () => {
    // Chains ws, kr, ve carry saved schemaProperties; chain to has no saved schema declarations ('{}').
    const chains = [
      chain('ws', 'wavespeed', 'wavespeed-ai/z-image/turbo', 0),
      chain('kr', 'wavespeed', 'wavespeed-ai/krea-v2/turbo-lora', 1),
      chain('ve', 'venice', 'venice-sd35', 2),
      chain('to', 'together', 'black-forest-labs/FLUX.1-schnell', 3, '{}'),
    ];
    const project = { id: 'b1', name: 'restored', nodes: chains.flatMap((c) => c.nodes), connections: chains.flatMap((c) => c.connections), spatialFrames: [] };
    localStorage.setItem(BOARDS_KEY, JSON.stringify([project])); localStorage.setItem(ACTIVE_BOARD_KEY, 'b1'); localStorage.setItem(MODE_KEY, 'graph');
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: any) => { calls.push(String(u)); return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }); }));
    const { default: App } = await import('../App');
    const { getExecutions } = await import('../services/executionTrace');
    const el = document.createElement('div'); document.body.appendChild(el);
    await act(async () => {
      appRoot = createRoot(el);
      appRoot.render(<StrictMode><App /></StrictMode>);
    });
    for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 120)); });
    const text = document.body.textContent || '';
    expect(text).toContain('wavespeed-ai/z-image/turbo'); // the restored workspace really rendered
    const schemaOrCatalog = calls.filter((u) => /\/api\/(model-schema|models|loras?|catalog)\b/.test(u));
    expect(schemaOrCatalog).toEqual([]);
    expect(getExecutions().filter((r: any) => !r.previousPage)).toEqual([]);

    // 1. Semantic assertion: verify no affirmative send badges rendered across both
    // FieldStatusBadge (will_send) and SchemaChoiceControls (schema-badge-*).
    assertNoAffirmativeSendBadges(document.body);

    // 2. Positive control test: render real FieldStatusBadge and real SchemaChoiceControls affirmative components
    // and verify assertNoAffirmativeSendBadges actually detects both.
    const testHost = document.createElement('div');
    document.body.appendChild(testHost);
    const testRoot = createRoot(testHost);
    await act(async () => {
      testRoot.render(<FieldStatusBadge status="will_send" />);
    });
    expect(() => assertNoAffirmativeSendBadges(document.body)).toThrow(/FieldStatusBadge/);

    await act(async () => {
      testRoot.render(
        <SchemaChoiceControls
          inputSchema={{
            type: 'object',
            properties: {
              output_format: { type: 'string', enum: ['png', 'jpg', 'webp'], default: 'jpg' },
            },
          }}
          value={JSON.stringify({ output_format: 'png' })}
          onChange={() => {}}
        />
      );
    });
    expect(() => assertNoAffirmativeSendBadges(document.body)).toThrow(/schema-badge/);

    await act(async () => {
      testRoot.unmount();
    });
    testHost.remove();

    // 3. Saved schema declarations vs absent declarations contrast:
    // Chains ws, kr, ve have saved schemaProperties, so omitted filled defaults show the notice.
    const wsNode = document.getElementById('node-ws-ks');
    expect(wsNode).toBeTruthy();
    const wsUnsupportedNotes = wsNode!.querySelectorAll('[data-testid^="node-filled-not-sent-"]');
    expect(wsUnsupportedNotes.length).toBeGreaterThan(0);
    expect(wsUnsupportedNotes[0]?.textContent).toContain('此模型不支持，不会发送');

    // Chain to (Together FLUX) had empty saved schema declarations ('{}'), so without schema evidence
    // it never invents "此模型不支持，不会发送" for its widgets.
    const toNode = document.getElementById('node-to-ks');
    expect(toNode).toBeTruthy();
    expect(toNode!.querySelectorAll('[data-testid^="node-filled-not-sent-"]').length).toBe(0);

    expect(text).not.toContain('官方 Schema 字段');
    expect(document.querySelectorAll('[data-testid="restored-output-label"]').length).toBeGreaterThan(0);
    expect(text).toContain('刷新前的结果');
    // A real user model change afterwards still fetches that model's Schema exactly once (node + inspector share it).
    const sel = document.querySelector('select[aria-label="当前供应商底模"]') as HTMLSelectElement | null;
    const opt = sel && [...sel.options].find((o) => o.value && o.value !== sel.value);
    if (sel && opt) {
      await act(async () => { sel.dispatchEvent(new Event('focus')); });
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
      await act(async () => { setter.call(sel, opt.value); sel.dispatchEvent(new Event('change', { bubbles: true })); });
      for (let i = 0; i < 3; i++) await act(async () => { await new Promise((r) => setTimeout(r, 120)); });
      const hits = calls.filter((u) => u.includes('/api/model-schema') && u.includes(encodeURIComponent(opt.value)));
      expect(hits.length).toBe(1);
    } else {
      console.warn('no selectable model option rendered; user-change path not exercised here');
    }
  }, 30000);
});
