/**
 * @vitest-environment jsdom
 */
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import App from './App';
import { BOARDS_KEY, ACTIVE_BOARD_KEY, MODE_KEY } from './utils/workspaceCache';

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
