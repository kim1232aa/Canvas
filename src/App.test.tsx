// @vitest-environment jsdom
// Behaviour of handleSelectLoRAWithBaseModel, reached through the hub callback App wires up.
// ModelHubModal.selectionFromMetadata (out of scope) drops baseModelSource and candidate rows,
// so the verified case passes the payload the handler is specified to consume.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NODE_DEFINITIONS as D } from './constants/nodes';
import { BOARDS_KEY, ACTIVE_BOARD_KEY, MODE_KEY } from './utils/workspaceCache';
import type { CatalogCheckpointCandidate } from './utils/baseModelMatcher';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const node = (id: string, type: string, values: Record<string, unknown>) => ({
  id, type, title: D[type].title, pos: { x: 40, y: 40 }, width: 300,
  inputs: D[type].inputs, outputs: D[type].outputs,
  values: { ...D[type].defaultValues, ...values }, state: 'idle',
});
const edge = (id: string, fromNodeId: string, fromSocketId: string, toNodeId: string, toSocketId: string) =>
  ({ id, fromNodeId, fromSocketId, toNodeId, toSocketId, type: fromSocketId });

function board() {
  return {
    id: 'b1', name: 'autopair', canvasMode: 'graph',
    nodes: [
      node('ck', 'CheckpointLoaderSimple', { ckpt_name: 'original-checkpoint', targetProvider: 'civitai' }),
      node('pos', 'CLIPTextEncode', { text: 'a lantern-lit harbour at dusk, oil paint' }),
      node('neg', 'CLIPTextEncodeNegative', { text: 'blurry, watermark' }),
      node('lat', 'EmptyLatentImage', { width: 1024, height: 1024 }),
      node('ks', 'KSampler', { seed: 42, steps: 20, cfg: 7, sampler_name: 'euler', scheduler: 'normal' }),
      node('vd', 'VAEDecode', {}),
      node('sv', 'SaveImage', {}),
    ],
    connections: [
      edge('e1', 'ck', 'MODEL', 'ks', 'model'),
      edge('e2', 'ck', 'CLIP', 'pos', 'clip'),
      edge('e3', 'ck', 'CLIP', 'neg', 'clip'),
      edge('e4', 'pos', 'CONDITIONING', 'ks', 'positive'),
      edge('e5', 'neg', 'CONDITIONING', 'ks', 'negative'),
      edge('e6', 'lat', 'LATENT', 'ks', 'latent_image'),
      edge('e7', 'ks', 'LATENT', 'vd', 'samples'),
      edge('e8', 'ck', 'VAE', 'vd', 'vae'),
      edge('e9', 'vd', 'IMAGE', 'sv', 'images'),
    ],
    spatialFrames: [],
  };
}

const fluxCandidate: CatalogCheckpointCandidate = {
  provider: 'huggingface', checkpoint: 'black-forest-labs/FLUX.1-dev',
  baseModelMetadata: 'FLUX.1 D', baseModelSource: 'huggingface:base_model',
};

let root: Root;
let host: HTMLDivElement;
const settle = async (n = 4) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 40)); }); };
const toastText = () => document.querySelector('[data-testid="toast-container"]')?.textContent || '';
const saved = () => JSON.parse(localStorage.getItem(BOARDS_KEY) || '[]')[0];

async function mount() {
  localStorage.setItem(BOARDS_KEY, JSON.stringify([board()]));
  localStorage.setItem(ACTIVE_BOARD_KEY, 'b1');
  localStorage.setItem(MODE_KEY, 'graph');
  vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })));
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const App = (await import('./App')).default;
  await act(async () => { root.render(<App />); });
  await settle();
}

/** The handler is not exported. Invoke the callback App passes to the hub. */
async function pair(lora: Record<string, unknown>) {
  const fiberKey = Object.keys(host).find((k) => k.startsWith('__reactContainer'));
  const fiber = (host as unknown as Record<string, { child?: unknown }>)[fiberKey || ''];
  const seen = new Set<object>();
  const walk = (f: unknown): ((payload: unknown) => void) | undefined => {
    if (!f || typeof f !== 'object' || seen.has(f as object)) return undefined;
    seen.add(f as object);
    const node = f as { memoizedProps?: Record<string, unknown>; child?: unknown; sibling?: unknown };
    const cb = node.memoizedProps?.onSelectLoRAWithBaseModel;
    if (typeof cb === 'function') return cb as (payload: unknown) => void;
    return walk(node.child) || walk(node.sibling);
  };
  const handler = walk(fiber?.child);
  if (!handler) throw new Error('onSelectLoRAWithBaseModel is not wired');
  await act(async () => { handler(lora); });
  await settle();
}

describe('handleSelectLoRAWithBaseModel', { timeout: 30000 }, () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
  afterEach(async () => { await act(async () => root?.unmount()); document.body.innerHTML = ''; localStorage.clear(); vi.unstubAllGlobals(); });

  it('verified metadata rewrites checkpoint, provider and KSampler params and the toast shows the applied id', async () => {
    await mount();
    await pair({
      name: 'harbour glow', provider: 'civitai', triggerWords: 'harbour glow',
      baseModel: 'Flux.1 D', baseModelSource: 'civitai:baseModel', checkpointCandidates: [fluxCandidate],
    });
    const graph = saved();
    const ckpt = graph.nodes.find((n: { type: string }) => n.type === 'CheckpointLoaderSimple');
    const sampler = graph.nodes.find((n: { type: string }) => n.type === 'KSampler');
    const positive = graph.nodes.find((n: { type: string }) => n.type === 'CLIPTextEncode');
    const negative = graph.nodes.find((n: { type: string }) => n.type === 'CLIPTextEncodeNegative');
    const lora = graph.nodes.find((n: { type: string }) => n.type === 'LoRALoader');
    expect(lora.values.lora_name).toBe('harbour glow');
    expect(lora.values.base_model_source).toBe('civitai:baseModel');
    expect(lora.values.checkpoint_candidates).toEqual([fluxCandidate]);
    expect(ckpt.values).toMatchObject({ ckpt_name: 'black-forest-labs/FLUX.1-dev', targetProvider: 'huggingface' });
    expect(sampler.values).toMatchObject({ steps: 28, cfg: 3.5, sampler_name: 'euler', scheduler: 'simple', seed: 42 });
    expect(positive.values.text).toBe('a lantern-lit harbour at dusk, oil paint');
    expect(negative.values.text).toBe('blurry, watermark');
    expect(toastText()).toContain('black-forest-labs/FLUX.1-dev');
    expect(toastText()).toContain('verified base_model metadata: Flux.1 D');
    expect(toastText()).not.toContain('请先选择同平台底模');
  });

  it('absent verified metadata mounts the LoRA, leaves the checkpoint untouched and toasts that none was found', async () => {
    await mount();
    await pair({ name: 'harbour glow', provider: 'civitai', triggerWords: 'harbour glow', baseModel: 'Flux.1 D' });
    const graph = saved();
    const ckpt = graph.nodes.find((n: { type: string }) => n.type === 'CheckpointLoaderSimple');
    const sampler = graph.nodes.find((n: { type: string }) => n.type === 'KSampler');
    const lora = graph.nodes.find((n: { type: string }) => n.type === 'LoRALoader');
    expect(lora.values.lora_name).toBe('harbour glow');
    expect(lora.values.base_model_source).toBeUndefined();
    expect(ckpt.values).toMatchObject({ ckpt_name: 'original-checkpoint', targetProvider: 'civitai' });
    expect(sampler.values).toMatchObject({ steps: 20, cfg: 7, sampler_name: 'euler', scheduler: 'normal', seed: 42 });
    expect(toastText()).toContain('没有找到经过验证的底模');
    expect(toastText()).not.toContain('请先选择同平台底模');
  });

  it('mismatched verified families mount the LoRA and do not rewrite the checkpoint', async () => {
    await mount();
    await pair({
      name: 'harbour glow', provider: 'civitai', triggerWords: 'harbour glow',
      baseModel: 'SDXL 1.0', baseModelSource: 'civitai:baseModel', checkpointCandidates: [fluxCandidate],
    });
    const graph = saved();
    const ckpt = graph.nodes.find((n: { type: string }) => n.type === 'CheckpointLoaderSimple');
    expect(graph.nodes.some((n: { type: string }) => n.type === 'LoRALoader')).toBe(true);
    expect(ckpt.values.ckpt_name).toBe('original-checkpoint');
    expect(toastText()).toContain('没有找到经过验证的底模');
    expect(toastText()).not.toContain('请先选择同平台底模');
  });

  it('missing provider refuses mounting and toasts an explicit provider error', async () => {
    await mount();
    await pair({ name: 'harbour glow', triggerWords: 'harbour glow', baseModel: 'Flux.1 D' });
    const graph = saved();
    expect(graph.nodes.every((n: { type: string }) => n.type !== 'LoRALoader')).toBe(true);
    expect(toastText()).toContain('LoRA 缺少明确的供应商信息');
    expect(toastText()).not.toContain('civitai');
  });
});
