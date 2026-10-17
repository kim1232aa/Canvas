// @vitest-environment jsdom
// clean-0942: real App (StrictMode) over a restored workspace shaped like the e2e board (Loader → LoRA → KSampler …).
// Mount → 0 GETs. Then each explicit selection path — node ID commit (blur / Enter), node dropdown, 选用此 ID, 应用为底模 —
// enables Run, shows provider + model in the panel, and sends exactly 1 schema GET for that model. Catalog: 1 GET per URL per open.
import React, { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NODE_DEFINITIONS as D } from '../constants/nodes';
import { BOARDS_KEY, ACTIVE_BOARD_KEY, MODE_KEY } from '../utils/workspaceCache';
import { clearSharedGet } from '../services/sharedGet';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const node = (id: string, type: string, values: any, extra: any = {}) => ({ id, type, title: D[type].title, pos: { x: 0, y: 0 }, width: 300, inputs: D[type].inputs, outputs: D[type].outputs, values: { ...D[type].defaultValues, ...values }, state: 'idle', ...extra });
const edge = (id: string, f: string, fs: string, t: string, ts: string) => ({ id, fromNodeId: f, fromSocketId: fs, toNodeId: t, toSocketId: ts, type: fs });
function board(opts: { brokenModelEdge?: boolean } = {}) {
  const nodes = [
    node('ck', 'CheckpointLoaderSimple', { ckpt_name: 'wavespeed-ai/z-image/turbo', targetProvider: 'wavespeed', custom_parameters: JSON.stringify({ _canvas: { schemaProperties: ['prompt', 'seed', 'size'] } }) }),
    node('pos', 'CLIPTextEncode', { text: 'a red fox in snow' }),
    node('neg', 'CLIPTextEncodeNegative', { text: 'blurry' }),
    node('lat', 'EmptyLatentImage', { width: 1024, height: 1024 }),
    node('lora', 'LoRALoader', { lora_name: 'https://example.com/a.safetensors', strength_model: 0.75, strength_clip: 0.75 }),
    node('ks', 'KSampler', { seed: 42 }, { outputData: 'https://example.com/prev.png' }),
    node('vd', 'VAEDecode', {}),
    node('sv', 'SaveImage', {}, { outputData: 'https://example.com/prev-save.png' }),
  ];
  const connections = [
    ...(opts.brokenModelEdge ? [] : [edge('e1', 'ck', 'MODEL', 'lora', 'model')]),
    edge('e2', 'ck', 'CLIP', 'lora', 'clip'), edge('e3', 'lora', 'CLIP', 'pos', 'clip'), edge('e4', 'lora', 'MODEL', 'ks', 'model'),
    edge('e5', 'pos', 'CONDITIONING', 'ks', 'positive'), edge('e6', 'neg', 'CONDITIONING', 'ks', 'negative'), edge('e7', 'lat', 'LATENT', 'ks', 'latent_image'),
    edge('e8', 'ks', 'LATENT', 'vd', 'samples'), edge('e9', 'ck', 'VAE', 'vd', 'vae'), edge('e10', 'vd', 'IMAGE', 'sv', 'images'),
  ];
  return { id: 'b1', name: 'restored', nodes, connections, spatialFrames: [] };
}
const CATALOG = { wavespeed: [{ id: 'wavespeed-ai/flux-dev-lora', name: 'Flux Dev LoRA', type: 'Checkpoint' }, { id: 'wavespeed-ai/qwen-image', name: 'Qwen Image', type: 'Checkpoint' }], _pagination: { wavespeed: { hasMore: false, page: 1 } } };
let calls: string[] = []; let root: Root; let App: any;
const schemaGets = (model?: string) => calls.filter((u) => u.includes('/api/model-schema') && (!model || u.includes(encodeURIComponent(model))));
const settle = async (n = 4) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 60)); }); };
const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T | null;
const setValue = async (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, v: string, ev: 'input' | 'change') => {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v); el.dispatchEvent(new Event(ev, { bubbles: true })); });
};
const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };
const runButton = () => $<HTMLButtonElement>('[data-testid="run-button"]')!;
const panelText = () => document.body.textContent || '';
async function mount(b = board()) {
  localStorage.setItem(BOARDS_KEY, JSON.stringify([b])); localStorage.setItem(ACTIVE_BOARD_KEY, 'b1'); localStorage.setItem(MODE_KEY, 'graph');
  const el = document.createElement('div'); document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => { root.render(<StrictMode><App /></StrictMode>); });
  await settle();
}
async function selectLoaderAndOpenPanel() {
  await click($('#node-ck')!);
  if (!/提交服务商/.test(panelText())) { const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === '参数'); if (b) await click(b); }
  await settle(2);
}
const expectSelected = (model: string) => {
  expect(runButton().disabled, `Run gate: ${runButton().title}`).toBe(false);
  expect(panelText()).toContain(`提交服务商：wavespeed · 模型：${model}`);
  expect(schemaGets(model)).toHaveLength(1);
};

describe('clean-0942 real App: explicit model selections', () => {
  beforeEach(async () => {
    calls = []; clearSharedGet();
    vi.stubGlobal('fetch', vi.fn(async (u: any) => {
      const url = String(u); calls.push(url);
      if (url.includes('/api/model-schema')) return new Response(JSON.stringify({ inputSchema: { properties: { prompt: {}, seed: {}, size: {} } } }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.includes('/api/models')) return new Response(JSON.stringify(CATALOG), { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    App = (await import('../App')).default;
  });
  afterEach(async () => { await act(async () => root?.unmount()); vi.unstubAllGlobals(); localStorage.clear(); document.body.innerHTML = ''; });

  it('mount 0 GETs; restored selection already gates Run on (Loader → LoRA → KSampler chain intact)', async () => {
    await mount();
    expect(calls.filter((u) => /\/api\/(model-schema|models)\b/.test(u))).toEqual([]);
    expect(runButton().disabled, runButton().title).toBe(false);
    expect(runButton().textContent).toContain('运行：');
  });

  it('node ID input: keystrokes 0 GETs, commit on blur → 1 GET; Enter → 1 GET for the next model', async () => {
    await mount(); await selectLoaderAndOpenPanel();
    // fix11 #4: loader custom ID uses CustomModelIdField (read-only display → click → textarea edit).
    const edit = async () => { await click($('#node-ck [data-testid="node-custom-model-display"]')!); return $<HTMLTextAreaElement>('#node-ck [data-testid="node-custom-model-id"]')!; };
    let input = await edit();
    await act(async () => { input.focus(); });
    await setValue(input, 'wavespeed-ai/krea', 'input');
    await setValue(input, 'wavespeed-ai/krea-v2/turbo-lora', 'input');
    expect(schemaGets()).toHaveLength(0);
    await act(async () => { input.blur(); }); await settle();
    expectSelected('wavespeed-ai/krea-v2/turbo-lora');
    input = await edit();
    await act(async () => { input.focus(); });
    await setValue(input, 'wavespeed-ai/flux-dev-lora', 'input');
    await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }); await settle();
    await act(async () => { input.blur(); }); await settle(); // blur after Enter with no further edit → no second GET
    expectSelected('wavespeed-ai/flux-dev-lora');
  });

  it('node dropdown: catalog 1 GET on open, selection → 1 schema GET', async () => {
    await mount(); await selectLoaderAndOpenPanel();
    const sel = $<HTMLSelectElement>('#node-ck select[aria-label="当前供应商底模"]')!;
    await act(async () => { sel.focus(); sel.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); }); await settle();
    const catalog = calls.filter((u) => u.includes('/api/models'));
    expect(new Set(catalog).size).toBe(catalog.length); // each catalog URL once
    expect(catalog.length).toBeGreaterThanOrEqual(1);
    await setValue(sel, 'wavespeed-ai/qwen-image', 'change'); await settle();
    expectSelected('wavespeed-ai/qwen-image');
  });

  it('Model Hub: each catalog URL once per open; 选用此 ID → 1 GET; 应用为底模 → 1 GET', async () => {
    await mount(); await selectLoaderAndOpenPanel();
    const openHub = async () => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === '模型')!; await click(b); await settle(); };
    await openHub();
    let catalog = calls.filter((u) => u.includes('/api/models'));
    expect(catalog.length).toBeGreaterThanOrEqual(1);
    expect(new Set(catalog).size, catalog.join('\n')).toBe(catalog.length);
    const id = $<HTMLInputElement>('[data-testid="hub-custom-id"]')!;
    await setValue(id, 'wavespeed-ai/krea-v2/turbo-lora', 'input');
    await click([...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === '选用此 ID')!); await settle();
    expectSelected('wavespeed-ai/krea-v2/turbo-lora');
    calls = [];
    await openHub();
    catalog = calls.filter((u) => u.includes('/api/models'));
    expect(new Set(catalog).size, catalog.join('\n')).toBe(catalog.length);
    const apply = [...document.querySelectorAll('button')].filter((x) => x.textContent?.includes('应用为底模'));
    expect(apply.length).toBeGreaterThan(0);
    await click(apply[0]); await settle();
    const m = schemaGets()[0] && decodeURIComponent(schemaGets()[0].split('model=')[1]);
    expect(schemaGets()).toHaveLength(1);
    expectSelected(m);
  });

  it('broken MODEL edge: panel still shows the selection, Run gate names the break (not 请先选择模型)', async () => {
    await mount(board({ brokenModelEdge: true })); await selectLoaderAndOpenPanel();
    expect(panelText()).toContain('提交服务商：wavespeed · 模型：wavespeed-ai/z-image/turbo');
    expect($('[data-testid="model-chain-issue"]')?.textContent).toContain('底模连线断开');
    expect($('[data-testid="node-model-chain-break"]')?.textContent).toBe($('[data-testid="model-chain-issue"]')?.textContent);
    expect(runButton().disabled).toBe(true);
    expect(runButton().getAttribute('aria-describedby')).toBe('studio-run-status');
    expect(document.getElementById('studio-run-status')?.textContent).toContain('底模连线断开');
    expect(calls.filter((u) => /\/api\/(model-schema|models)\b/.test(u))).toEqual([]);
  });
});
