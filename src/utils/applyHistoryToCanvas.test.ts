import { describe, it, expect } from 'vitest';
import {
  applyHistoryToCanvas,
  historyHasUsableSnapshot,
  putHistoryImageOnSaveNodes,
  patchHistoryParamsOntoNodes,
  historyItemToApplyParams,
  NO_WORKFLOW_SNAPSHOT_MSG,
  type HistoryApplyItem,
} from './applyHistoryToCanvas';
import type { NodeInstance, Connection } from '../types/graph';

const node = (partial: Partial<NodeInstance> & { id: string; type: string }): NodeInstance =>
  ({
    title: partial.type,
    pos: { x: 0, y: 0 },
    width: 240,
    inputs: [],
    outputs: [],
    values: {},
    state: 'idle',
    ...partial,
  }) as NodeInstance;

const baseGraph = () => {
  const nodes: NodeInstance[] = [
    node({ id: 'ckpt', type: 'CheckpointLoaderSimple', values: { ckpt_name: 'old', targetProvider: 'fal' } }),
    node({ id: 'pos', type: 'CLIPTextEncode', values: { text: 'old prompt' } }),
    node({ id: 'neg', type: 'CLIPTextEncodeNegative', values: { text: 'old neg' } }),
    node({ id: 'latent', type: 'EmptyLatentImage', values: { width: 512, height: 512 } }),
    node({ id: 'samp', type: 'KSampler', values: { seed: 1, steps: 20, cfg: 7 } }),
    node({ id: 'save', type: 'SaveImage', values: { filename_prefix: 'x' } }),
  ];
  const connections: Connection[] = [
    { id: 'c1', fromNodeId: 'ckpt', fromSocketId: 'MODEL', toNodeId: 'samp', toSocketId: 'model', type: 'MODEL' },
  ];
  return { nodes, connections };
};

const successItem = (over: Partial<HistoryApplyItem> = {}): HistoryApplyItem => ({
  id: 'hist_test_1',
  url: 'https://cdn.example/out.png',
  prompt: 'Low camera angle, portrait',
  negativePrompt: '',
  provider: 'Tensor.Art OpenWorks',
  actualProvider: 'Tensor.Art OpenWorks',
  model: 'photoreal_studio_z_image',
  actualModel: 'photoreal_studio_z_image',
  seed: 42,
  steps: 20,
  cfg: 7,
  width: 768,
  height: 1344,
  timestamp: Date.now(),
  loras: [],
  ...over,
});

describe('applyHistoryToCanvas', () => {
  it('no-snapshot: clears canvas, builds provider std preset, fills recorded sent values only', () => {
    const { nodes, connections } = baseGraph();
    const before = JSON.stringify({ nodes, connections });
    const item = successItem({ workflowSnapshot: undefined, hasWorkflowSnapshot: false });
    const out = applyHistoryToCanvas({ item, nodes, connections, spatialFrames: [{ id: 'old-frame' } as any] });
    expect(JSON.stringify({ nodes, connections })).toBe(before); // input not mutated
    expect(out.nodes.some((n) => ['ckpt', 'pos', 'neg', 'latent', 'samp', 'save'].includes(n.id))).toBe(false);
    expect(out.spatialFrames).toEqual([]);
    expect(out.nodes.every((n) => n.id.startsWith('std-'))).toBe(true);
    expect(new Set(out.nodes.map((n) => n.id)).size).toBe(out.nodes.length);
    expect(out.restoredFromSnapshot).toBe(false);
    expect(out.nodes.find((n) => n.type === 'CLIPTextEncode')!.values.text).toBe(item.prompt);
    expect(out.nodes.find((n) => n.type === 'CheckpointLoaderSimple')!.values.ckpt_name).toBe(item.actualModel);
    const ks = out.nodes.find((n) => n.type === 'KSampler')!;
    expect(ks.values).toMatchObject({ seed: 42, steps: 20, cfg: 7 });
    expect(out.nodes.find((n) => n.type === 'SaveImage')!.outputData).toBe(item.url);
  });

  it('no-snapshot: values missing from the record stay empty (no preset defaults)', () => {
    const { nodes, connections } = baseGraph();
    const item = successItem({ seed: null, steps: null, cfg: null, sampler: null, scheduler: null, url: '' });
    const out = applyHistoryToCanvas({ item, nodes, connections });
    const ks = out.nodes.find((n) => n.type === 'KSampler')!;
    expect(ks.values.seed).toBeUndefined();
    expect(ks.values.steps).toBeUndefined();
    expect(ks.values.cfg).toBeUndefined();
    expect(ks.values.sampler_name).toBeUndefined();
    expect(out.imageApplied).toBe(false);
  });

  it('no-snapshot with unknown provider throws (no silent fallback)', () => {
    const { nodes, connections } = baseGraph();
    expect(() => applyHistoryToCanvas({ item: successItem({ provider: 'nope', actualProvider: 'nope' }), nodes, connections })).toThrow();
  });

  it('snapshot path restores nodes/connections and puts image on SaveImage', () => {
    const snapNodes = [
      node({ id: 's-ckpt', type: 'CheckpointLoaderSimple', values: { ckpt_name: 'snap-model', targetProvider: 'openworks' } }),
      node({ id: 's-pos', type: 'CLIPTextEncode', values: { text: 'snap prompt' } }),
      node({ id: 's-lat', type: 'EmptyLatentImage', values: { width: 640, height: 960 } }),
      node({ id: 's-save', type: 'SaveImage', values: { filename_prefix: 'Snap' } }),
    ];
    const snapConns: Connection[] = [
      { id: 'sc1', fromNodeId: 's-ckpt', fromSocketId: 'MODEL', toNodeId: 's-save', toSocketId: 'images', type: 'IMAGE' },
    ];
    const { nodes, connections } = baseGraph();
    const item = successItem({
      workflowSnapshot: { format: 'comfycanvas', version: 1, nodes: snapNodes, connections: snapConns },
      prompt: 'board prompt override',
      width: 768,
      height: 1344,
      model: 'board-model',
      // helper prefers actualModel || model — set both so overlay assertion is meaningful
      actualModel: 'board-model',
    });
    const out = applyHistoryToCanvas({ item, nodes, connections });
    expect(out.restoredFromSnapshot).toBe(true);
    expect(out.notice).toBeUndefined();
    expect(out.connections).toEqual(snapConns);
    expect(out.nodes.map((n) => n.id)).toEqual(['s-ckpt', 's-pos', 's-lat', 's-save']);
    expect(out.nodes.find((n) => n.type === 'SaveImage')!.outputData).toBe('https://cdn.example/out.png');
    // Board-requested overlay from history item
    expect(out.nodes.find((n) => n.type === 'CLIPTextEncode')!.values.text).toBe('board prompt override');
    expect(out.nodes.find((n) => n.type === 'CheckpointLoaderSimple')!.values.ckpt_name).toBe('board-model');
    expect(out.nodes.find((n) => n.type === 'EmptyLatentImage')!.values).toMatchObject({ width: 768, height: 1344 });
  });

  it('hasWorkflowSnapshot flag alone without object is treated as no snapshot', () => {
    const { nodes, connections } = baseGraph();
    const out = applyHistoryToCanvas({ item: successItem({ hasWorkflowSnapshot: true }), nodes, connections });
    expect(out.restoredFromSnapshot).toBe(false);
    expect(out.nodes.some((n) => n.id === 'ckpt')).toBe(false);
  });

  it('historyItemToApplyParams passes imageUrl / size / prompt / model through (full handler payload)', () => {
    const p = historyItemToApplyParams(successItem());
    expect(p.imageUrl).toBe('https://cdn.example/out.png');
    expect(p.prompt).toBe('Low camera angle, portrait');
    expect(p.checkpoint).toBe('photoreal_studio_z_image');
    expect(p.width).toBe(768);
    expect(p.height).toBe(1344);
    expect(p.historyItem?.url).toBe('https://cdn.example/out.png');
  });

  it('putHistoryImageOnSaveNodes prefers SaveImage over PreviewImage', () => {
    const nodes = [
      node({ id: 'p', type: 'PreviewImage' }),
      node({ id: 's', type: 'SaveImage' }),
    ];
    const { nodes: next, imageApplied } = putHistoryImageOnSaveNodes(nodes, 'https://cdn.example/a.png');
    expect(imageApplied).toBe(true);
    expect(next.find((n) => n.id === 's')!.outputData).toBe('https://cdn.example/a.png');
    expect(next.find((n) => n.id === 'p')!.outputData).toBeUndefined();
  });

  it('historyHasUsableSnapshot detects nodes array and spatial frame', () => {
    expect(historyHasUsableSnapshot(successItem())).toBe(false);
    expect(
      historyHasUsableSnapshot(
        successItem({ workflowSnapshot: { nodes: [node({ id: 'a', type: 'SaveImage' })], connections: [] } }),
      ),
    ).toBe(true);
    expect(
      historyHasUsableSnapshot(
        successItem({
          workflowSnapshot: {
            canvasMode: 'spatial',
            frame: { id: 'f1', title: 't', pos: { x: 0, y: 0 }, width: 100, height: 100, prompt: '', params: {} as any, createdAt: 1, status: 'idle' },
          },
        }),
      ),
    ).toBe(true);
  });

  it('patchHistoryParamsOntoNodes maps prompt / model / size', () => {
    const { nodes } = baseGraph();
    const { nodes: next, applied } = patchHistoryParamsOntoNodes(nodes, successItem());
    expect(applied.prompt).toContain('Low camera angle');
    expect(applied.model).toBe('photoreal_studio_z_image');
    expect(applied.width).toBe(768);
    expect(next.find((n) => n.type === 'CLIPTextEncode')!.values.text).toContain('Low camera angle');
  });
});

describe('SaveImage filename_prefix on apply', () => {
  it('retitles prefix from history provider + model', async () => {
    const { patchHistoryParamsOntoNodes } = await import('./applyHistoryToCanvas');
    const out = patchHistoryParamsOntoNodes(
      [{ id: 's', type: 'SaveImage', x: 0, y: 0, values: { filename_prefix: 'std_tensorart' } } as any],
      { provider: 'Tensor.Art OpenWorks', model: 'photoreal_studio_z_image' } as any,
    );
    expect(out.nodes[0].values.filename_prefix).toBe('Openworks_photoreal_studio_z_image');
  });
  it('writes provider id, not display label, onto checkpoint node', async () => {
    const { patchHistoryParamsOntoNodes } = await import('./applyHistoryToCanvas');
    const out = patchHistoryParamsOntoNodes(
      [{ id: 'c', type: 'CheckpointLoaderSimple', x: 0, y: 0, values: { targetProvider: 'openworks' } } as any],
      { provider: 'Tensor.Art OpenWorks', model: 'photoreal_studio_z_image' } as any,
    );
    expect(out.nodes[0].values.targetProvider).toBe('openworks');
  });
});
