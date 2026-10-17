// ws-sizenode (2026-10-17): WaveSpeed flux-dev-lora board — size must come from the board's Empty Latent node.
// The loader may not hide a second width/height; when the two disagree the run is blocked (no silent pick).
import { describe, expect, it } from 'vitest';
import { NODE_DEFINITIONS as D } from '../constants/nodes';
import { extractWorkflowParameters, latentLoaderSizeConflict } from './graphEngine';
import { readInspectorParameters, patchInspectorBranchNode, loadersFedByLatent, clearLoaderSize } from './inspectorParameters';
import type { Connection, NodeInstance } from '../types/graph';

const node = (id: string, type: string, values: any): NodeInstance => ({ id, type, title: D[type].title, pos: { x: 0, y: 0 }, width: 300, inputs: D[type].inputs, outputs: D[type].outputs, values: { ...(D[type] as any).defaultValues, ...values }, state: 'idle' } as any);
const edge = (id: string, f: string, fs: string, t: string, ts: string): Connection => ({ id, fromNodeId: f, fromSocketId: fs, toNodeId: t, toSocketId: ts, type: fs } as any);

/** Same shape as the hist_1792224305224_meynb board (Loader → LoRA → KSampler → VAE → Save), optionally with Empty Latent wired. */
function board(opts: { loaderSize?: { width?: number; height?: number }; latent?: { width?: number; height?: number } }) {
  const nodes: NodeInstance[] = [
    node('ck', 'CheckpointLoaderSimple', { ckpt_name: 'wavespeed-ai/flux-dev-lora', targetProvider: 'wavespeed', ...(opts.loaderSize || {}) }),
    node('lora', 'LoRALoader', { lora_name: 'https://huggingface.co/x/flux_realism_lora.safetensors', strength_model: 1.1, strength_clip: 1.1 }),
    node('pos', 'CLIPTextEncode', { text: 'squirrel drummer' }),
    node('ks', 'KSampler', { seed: 3742927916, steps: 36, cfg: 3.5 }),
    node('vd', 'VAEDecode', {}),
    node('sv', 'SaveImage', {}),
  ];
  const connections: Connection[] = [
    edge('e1', 'ck', 'MODEL', 'lora', 'model'), edge('e2', 'ck', 'CLIP', 'lora', 'clip'), edge('e3', 'lora', 'CLIP', 'pos', 'clip'),
    edge('e4', 'lora', 'MODEL', 'ks', 'model'), edge('e5', 'pos', 'CONDITIONING', 'ks', 'positive'),
    edge('e8', 'ks', 'LATENT', 'vd', 'samples'), edge('e9', 'ck', 'VAE', 'vd', 'vae'), edge('e10', 'vd', 'IMAGE', 'sv', 'images'),
  ];
  if (opts.latent) {
    nodes.push(node('lat', 'EmptyLatentImage', { ...opts.latent, batch_size: 1 }));
    connections.push(edge('e7', 'lat', 'LATENT', 'ks', 'latent_image'));
  }
  return { nodes, connections };
}

describe('ws-sizenode: WaveSpeed size comes from the board Empty Latent', () => {
  it('old board (no Empty Latent): 832×1216 came from the hidden loader width/height', () => {
    const { nodes, connections } = board({ loaderSize: { width: 832, height: 1216 } });
    const p = extractWorkflowParameters(nodes, connections, 'sv') as any;
    expect(p.width).toBe(832); expect(p.height).toBe(1216);
  });

  it('Empty Latent wired, loader carries no size → width/height read only from the node', () => {
    const { nodes, connections } = board({ latent: { width: 832, height: 1216 } });
    const p = extractWorkflowParameters(nodes, connections, 'sv') as any;
    expect(p.width).toBe(832); expect(p.height).toBe(1216);
    const edited = board({ latent: { width: 768, height: 1344 } });
    const q = extractWorkflowParameters(edited.nodes, edited.connections, 'sv') as any;
    expect(q.width).toBe(768); expect(q.height).toBe(1344);
  });

  it('Empty Latent and loader disagree → blocked with both values, never silently picks one', () => {
    const { nodes, connections } = board({ loaderSize: { width: 832, height: 1216 }, latent: { width: 1024, height: 1024 } });
    expect(() => extractWorkflowParameters(nodes, connections, 'sv')).toThrow(/尺寸两处不一致.*1024×1024.*832×1216/);
  });

  it('Empty Latent and loader agree → no block (legacy boards that match keep running)', () => {
    const { nodes, connections } = board({ loaderSize: { width: 832, height: 1216 }, latent: { width: 832, height: 1216 } });
    const p = extractWorkflowParameters(nodes, connections, 'sv') as any;
    expect(p.width).toBe(832); expect(p.height).toBe(1216);
  });

  it('conflict helper: empty loader → none; partial mismatch → message', () => {
    expect(latentLoaderSizeConflict({}, { width: 1, height: 2 })).toBeNull();
    expect(latentLoaderSizeConflict({ width: '', height: null }, { width: 1, height: 2 })).toBeNull();
    expect(latentLoaderSizeConflict({ width: 832 }, { width: 832, height: 1216 })).toBeNull();
    expect(latentLoaderSizeConflict({ width: 832, height: 1216 }, { width: 832, height: 1344 })).toContain('832×1344');
    // empty latent field: not back-filled from the loader, left to the 「宽高不齐」 block — no conflict here
    expect(latentLoaderSizeConflict({ width: 1024, height: 1024 }, { width: 1024 })).toBeNull();
  });

  it('panel reads size only from a wired Empty Latent (an empty latent field is not back-filled from the loader)', () => {
    const { nodes, connections } = board({ loaderSize: { width: 832, height: 1216 }, latent: { width: 640, height: undefined } });
    const r = readInspectorParameters(nodes, connections, 'ks');
    expect(r.width).toBe(640); expect(r.height).toBeUndefined();
    const noLat = board({ loaderSize: { width: 832, height: 1216 } });
    const r2 = readInspectorParameters(noLat.nodes, noLat.connections, 'ks');
    expect(r2.width).toBe(832); expect(r2.height).toBe(1216);
  });

  it('panel size edit with Empty Latent wired: writes the node, clears the loader copy', () => {
    const { nodes, connections } = board({ loaderSize: { width: 832, height: 1216 }, latent: { width: 832, height: 1216 } });
    const before = readInspectorParameters(nodes, connections, 'ks');
    const after = { ...before, width: 768, height: 1344 };
    const out = nodes.map((n) => patchInspectorBranchNode(n, nodes, connections, 'ks', before, after));
    expect(out.find((n) => n.id === 'lat')!.values).toMatchObject({ width: 768, height: 1344 });
    const ck = out.find((n) => n.id === 'ck')!;
    expect(ck.values.width).toBeUndefined(); expect(ck.values.height).toBeUndefined();
    expect(() => extractWorkflowParameters(out, connections, 'sv')).not.toThrow();
    expect((extractWorkflowParameters(out, connections, 'sv') as any).width).toBe(768);
  });

  it('editing the Empty Latent node targets the loader it feeds for clearing', () => {
    const { nodes, connections } = board({ loaderSize: { width: 832, height: 1216 }, latent: { width: 832, height: 1216 } });
    expect([...loadersFedByLatent(nodes, connections, 'lat')]).toEqual(['ck']);
    const cleared = clearLoaderSize(nodes.find((n) => n.id === 'ck')!);
    expect(cleared.values).not.toHaveProperty('width'); expect(cleared.values).not.toHaveProperty('height');
    expect(cleared.values.ckpt_name).toBe('wavespeed-ai/flux-dev-lora');
  });
});
