/**
 * @vitest-environment jsdom
 */
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import App from './App';
import { BOARDS_KEY, ACTIVE_BOARD_KEY, MODE_KEY } from './utils/workspaceCache';
import { NODE_DEFINITIONS as D } from './constants/nodes';
import type { CatalogCheckpointCandidate } from './utils/baseModelMatcher';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const AIR = 'urn:air:krea2:diffusionmodel:civitai:2732656@3072332';
const LORA_A = 'urn:air:krea2:lora:civitai:2744585@3168308';
const LORA_B = 'urn:air:krea2:lora:civitai:929497@3077110';

describe('App civitai import load', () => {
  let host: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    localStorage.clear();
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })));
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    if (root) await act(async () => { root?.unmount(); });
    root = null;
    host?.remove();
    host = null;
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('renames the board from the imported recipe and keeps the AIR, both LoRAs and the sampler values', async () => {
    const recipeName = 'Civitai 作品 #148140013：Hairpin 原作逆向工作流';
    localStorage.setItem(BOARDS_KEY, JSON.stringify([{
      id: 'board-1',
      name: '空白画布',
      nodes: [{ id: 'old', type: 'CheckpointLoaderSimple', title: '旧底模', pos: { x: 0, y: 0 }, inputs: [], outputs: [], values: { ckpt_name: 'turbo', targetProvider: 'civitai' } }],
      connections: [],
      spatialFrames: [],
    }]));
    localStorage.setItem(ACTIVE_BOARD_KEY, 'board-1');
    localStorage.setItem(MODE_KEY, 'graph');

    await act(async () => { root!.render(<App />); });
    expect(document.body.textContent).toContain('空白画布');

    const openHub = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'LoRA') as HTMLButtonElement;
    expect(openHub).toBeDefined();
    await act(async () => { openHub.click(); });

    const importTab = document.querySelector('[data-testid="civitai-modal-mode-import"]') as HTMLButtonElement;
    expect(importTab).not.toBeNull();
    await act(async () => { importTab.click(); });

    const input = document.querySelector('textarea') as HTMLTextAreaElement;
    expect(input).not.toBeNull();
    const generationData = [
      'masterpiece, best quality, very aesthetic, ektachrome fade film, nature',
      'Negative prompt: (2d ,Illustration, drawing, cartoon, animation, anima, painting:1.4)',
      'Steps: 8, Sampler: Euler, Schedule type: Simple, CFG scale: 1, Seed: 689794262, Size: 832x1248, Model: turbo',
    ].join('\n');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(input, generationData);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    vi.stubGlobal('fetch', vi.fn(async (url: any) => {
      const target = String(url);
      if (target.includes('/api/civitai/extract-workflow')) {
        return new Response(JSON.stringify({
          success: true,
          preset: {
            id: 'civitai-imported-148140013',
            name: recipeName,
            prompt: 'masterpiece, best quality, very aesthetic, ektachrome fade film, nature',
            negativePrompt: '(2d ,Illustration, drawing, cartoon, animation, anima, painting:1.4)',
            nodes: [
              { id: 'node-imp-1', type: 'CheckpointLoaderSimple', title: '加载底模', pos: { x: 60, y: 120 }, width: 280, inputs: [], outputs: [{ id: 'MODEL', name: 'MODEL', type: 'MODEL' }, { id: 'CLIP', name: 'CLIP', type: 'CLIP' }, { id: 'VAE', name: 'VAE', type: 'VAE' }], values: { ckpt_name: AIR, targetProvider: 'civitai', base_model: 'Krea 2 Turbo', import_source_model: AIR, civitai_engine: 'comfy', civitai_ecosystem: 'krea2', civitai_model: 'turbo' } },
              { id: 'node-imp-3', type: 'CLIPTextEncode', title: '正向', pos: { x: 700, y: 60 }, inputs: [{ id: 'clip', name: 'clip', type: 'CLIP' }], outputs: [], values: { text: 'masterpiece, best quality, very aesthetic, ektachrome fade film, nature' } },
              { id: 'node-imp-4', type: 'CLIPTextEncodeNegative', title: '负向', pos: { x: 700, y: 280 }, inputs: [{ id: 'clip', name: 'clip', type: 'CLIP' }], outputs: [], values: { text: '(2d ,Illustration, drawing, cartoon, animation, anima, painting:1.4)' } },
              { id: 'node-imp-5', type: 'EmptyLatentImage', title: '空潜空间', pos: { x: 700, y: 500 }, inputs: [], outputs: [], values: { width: 832, height: 1248, batch_size: 1 } },
              { id: 'node-imp-6', type: 'KSampler', title: 'KSampler', pos: { x: 1100, y: 140 }, inputs: [{ id: 'model', name: 'model', type: 'MODEL' }], outputs: [], values: { seed: 689794262, steps: 8, cfg: 1, sampler_name: 'euler', scheduler: 'simple', control_after_generate: 'fixed' } },
            ],
            connections: [
              { id: 'c1', fromNodeId: 'node-imp-1', fromSocketId: 'CLIP', toNodeId: 'node-imp-3', toSocketId: 'clip', type: 'CLIP' },
              { id: 'c2', fromNodeId: 'node-imp-1', fromSocketId: 'CLIP', toNodeId: 'node-imp-4', toSocketId: 'clip', type: 'CLIP' },
              { id: 'c3', fromNodeId: 'node-imp-1', fromSocketId: 'MODEL', toNodeId: 'node-imp-6', toSocketId: 'model', type: 'MODEL' },
            ],
            spatialFrames: [],
            otherMetadata: {
              baseModel: 'Krea 2 Turbo', steps: 8, cfgScale: 1, sampler: 'euler', scheduler: 'simple', seed: 689794262, width: 832, height: 1248,
              resources: [
                { name: 'Mrpopo Anime/Art', air: LORA_A, modelId: 2744585, versionId: 3168308, strength: 1, baseModel: 'Krea 2 Turbo', type: 'lora' },
                { name: 'Masterpiece', air: LORA_B, modelId: 929497, versionId: 3077110, strength: 0.85, baseModel: 'Krea 2', type: 'lora' },
              ],
            },
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    const submit = document.querySelector('[data-testid="civitai-import-submit-button"]') as HTMLButtonElement;
    expect(submit).not.toBeNull();
    await act(async () => { submit.click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    const apply = document.querySelector('[data-testid="apply-imported-workflow-button"]') as HTMLButtonElement;
    expect(apply).not.toBeNull();
    await act(async () => { apply.click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });

    const saved = JSON.parse(localStorage.getItem(BOARDS_KEY) || '[]');
    const board = saved.find((item: any) => item.id === 'board-1');
    expect(board.name).toBe(recipeName);
    expect(document.body.textContent).toContain(recipeName);

    const ckpt = board.nodes.find((n: any) => n.type === 'CheckpointLoaderSimple');
    expect(ckpt.values.ckpt_name).toBe(AIR);
    expect(ckpt.values.ckpt_name).not.toBe('turbo');
    const loras = board.nodes.filter((n: any) => n.type === 'LoRALoader');
    expect(loras.map((n: any) => n.values.lora_name)).toEqual([LORA_A, LORA_B]);
    expect(loras.map((n: any) => n.values.strength_model)).toEqual([1, 0.85]);
    expect(loras.every((n: any) => n.values.strength_model !== 0 && String(n.values.lora_name).trim() !== '')).toBe(true);
    const sampler = board.nodes.find((n: any) => n.type === 'KSampler');
    const latent = board.nodes.find((n: any) => n.type === 'EmptyLatentImage');
    expect(latent.values).toMatchObject({ width: 832, height: 1248 });
    expect(sampler.values).toMatchObject({ steps: 8, cfg: 1, sampler_name: 'euler', scheduler: 'simple', seed: 689794262 });
    expect(board.connections).toEqual(expect.arrayContaining([
      expect.objectContaining({ fromNodeId: 'node-imp-1', toNodeId: 'node-imp-lora-1', type: 'MODEL' }),
      expect.objectContaining({ fromNodeId: 'node-imp-lora-2', toNodeId: 'node-imp-6', toSocketId: 'model', type: 'MODEL' }),
    ]));
    expect(board.nodes.some((n: any) => Object.values(n.values).includes(''))).toBe(false);
  });
});

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

describe('M65: handleSelectLoRAWithBaseModel verified auto-pair', { timeout: 30000 }, () => {
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
    expect(lora.values.recommended_checkpoint).toBe('black-forest-labs/FLUX.1-dev');
    expect(ckpt.values).toMatchObject({ ckpt_name: 'black-forest-labs/FLUX.1-dev', targetProvider: 'huggingface' });
    expect(sampler.values).toMatchObject({ steps: 28, cfg: 3.5, sampler_name: 'euler', scheduler: 'simple', seed: 42 });
    expect(positive.values.text).toBe('a lantern-lit harbour at dusk, oil paint');
    expect(negative.values.text).toBe('blurry, watermark');
    expect(toastText()).toContain('black-forest-labs/FLUX.1-dev');
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
  });

  it('missing provider refuses mounting and toasts an explicit provider error', async () => {
    await mount();
    await pair({ name: 'harbour glow', triggerWords: 'harbour glow', baseModel: 'Flux.1 D' });
    const graph = saved();
    expect(graph.nodes.every((n: { type: string }) => n.type !== 'LoRALoader')).toBe(true);
    expect(toastText()).toContain('LoRA 缺少明确的供应商信息');
  });
});

describe('M108: AIVideoNode and cloud engine recommendation routing', { timeout: 30000 }, () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
  afterEach(async () => { await act(async () => root?.unmount()); document.body.innerHTML = ''; localStorage.clear(); vi.unstubAllGlobals(); });

  it('video-compatible recommendation (wan21) applies to AIVideoNode', async () => {
    const videoBoard = {
      id: 'v1', name: 'video-test', canvasMode: 'graph',
      nodes: [node('vid', 'AIVideoNode', { model: '', targetProvider: '', prompt: 'cinematic shot' })],
      connections: [],
      spatialFrames: [],
    };
    localStorage.setItem(BOARDS_KEY, JSON.stringify([videoBoard]));
    localStorage.setItem(ACTIVE_BOARD_KEY, 'v1');
    localStorage.setItem(MODE_KEY, 'graph');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })));
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const App = (await import('./App')).default;
    await act(async () => { root.render(<App />); });
    await settle();

    const wan21Candidate: CatalogCheckpointCandidate = {
      provider: 'fal', checkpoint: 'wan2.1-t2v',
      baseModelMetadata: 'Wan 2.1', baseModelSource: 'civitai:baseModel',
    };
    await pair({
      name: 'wan style', provider: 'civitai', triggerWords: '',
      baseModel: 'Wan 2.1', baseModelSource: 'civitai:baseModel', checkpointCandidates: [wan21Candidate],
    });

    const graph = saved();
    const video = graph.nodes.find((n: { type: string }) => n.type === 'AIVideoNode');
    expect(video.values.model).toBe('wan2.1-t2v');
    expect(video.values.targetProvider).toBe('fal');
    expect(video.values.prompt).toBe('cinematic shot');
    expect(toastText()).toContain('wan2.1-t2v');
    expect(toastText()).toContain('已配对验证底模');
  });

  it('image recommendation (flux) shows incompatibility warning for AIVideoNode', async () => {
    const videoBoard = {
      id: 'v1', name: 'video-test', canvasMode: 'graph',
      nodes: [node('vid', 'AIVideoNode', { model: 'original-video', targetProvider: 'fal', prompt: 'test' })],
      connections: [],
      spatialFrames: [],
    };
    localStorage.setItem(BOARDS_KEY, JSON.stringify([videoBoard]));
    localStorage.setItem(ACTIVE_BOARD_KEY, 'v1');
    localStorage.setItem(MODE_KEY, 'graph');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })));
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const App = (await import('./App')).default;
    await act(async () => { root.render(<App />); });
    await settle();

    await pair({
      name: 'flux lora', provider: 'civitai', triggerWords: '',
      baseModel: 'Flux.1 D', baseModelSource: 'civitai:baseModel', checkpointCandidates: [fluxCandidate],
    });

    const graph = saved();
    const video = graph.nodes.find((n: { type: string }) => n.type === 'AIVideoNode');
    expect(video.values.model).toBe('original-video');
    expect(video.values.targetProvider).toBe('fal');
    expect(toastText()).toContain('不适用于视频节点');
    expect(toastText()).toContain('LoRA 已挂载，底模不适配');
  });

  it('matching provider applies to FalAIEngineNode', async () => {
    const falBoard = {
      id: 'f1', name: 'fal-test', canvasMode: 'graph',
      nodes: [node('fal', 'FalAIEngineNode', { model: '', steps: 28 })],
      connections: [],
      spatialFrames: [],
    };
    localStorage.setItem(BOARDS_KEY, JSON.stringify([falBoard]));
    localStorage.setItem(ACTIVE_BOARD_KEY, 'f1');
    localStorage.setItem(MODE_KEY, 'graph');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })));
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const App = (await import('./App')).default;
    await act(async () => { root.render(<App />); });
    await settle();

    const falCandidate: CatalogCheckpointCandidate = {
      provider: 'fal', checkpoint: 'fal-ai/flux-lora',
      baseModelMetadata: 'FLUX.1 D', baseModelSource: 'civitai:baseModel',
    };
    await pair({
      name: 'fal lora', provider: 'civitai', triggerWords: '',
      baseModel: 'Flux.1 D', baseModelSource: 'civitai:baseModel', checkpointCandidates: [falCandidate],
    });

    const graph = saved();
    const fal = graph.nodes.find((n: { type: string }) => n.type === 'FalAIEngineNode');
    expect(fal.values.model).toBe('fal-ai/flux-lora');
    expect(fal.values.steps).toBe(28);
    expect(toastText()).toContain('fal-ai/flux-lora');
  });

  it('mismatched provider shows incompatibility warning for fixed-provider node', async () => {
    const falBoard = {
      id: 'f1', name: 'fal-test', canvasMode: 'graph',
      nodes: [node('fal', 'FalAIEngineNode', { model: 'original-fal', steps: 28 })],
      connections: [],
      spatialFrames: [],
    };
    localStorage.setItem(BOARDS_KEY, JSON.stringify([falBoard]));
    localStorage.setItem(ACTIVE_BOARD_KEY, 'f1');
    localStorage.setItem(MODE_KEY, 'graph');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })));
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const App = (await import('./App')).default;
    await act(async () => { root.render(<App />); });
    await settle();

    await pair({
      name: 'hf lora', provider: 'civitai', triggerWords: '',
      baseModel: 'Flux.1 D', baseModelSource: 'huggingface:base_model', checkpointCandidates: [fluxCandidate],
    });

    const graph = saved();
    const fal = graph.nodes.find((n: { type: string }) => n.type === 'FalAIEngineNode');
    expect(fal.values.model).toBe('original-fal');
    expect(toastText()).toContain('供应商');
    expect(toastText()).toContain('不匹配');
  });

  it('LoRA wires correctly through MODEL connections', async () => {
    await mount();
    await pair({
      name: 'test lora', provider: 'civitai', triggerWords: 'test trigger', modelStrength: 0.8,
      baseModel: 'Flux.1 D', baseModelSource: 'civitai:baseModel', checkpointCandidates: [fluxCandidate],
    });
    const graph = saved();
    const lora = graph.nodes.find((n: { type: string }) => n.type === 'LoRALoader');
    expect(lora).toBeDefined();
    expect(lora.values.strength_model).toBe(0.8);
    expect(lora.values.lora_name).toBe('test lora');
    const modelConnection = graph.connections.find((c: any) => c.fromNodeId === lora.id && c.fromSocketId === 'MODEL');
    expect(modelConnection).toBeDefined();
    expect(modelConnection.toNodeId).toBe('ks');
  });
});
