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
  it('no-snapshot path surfaces 这条没存工作流 and still applies image + params', () => {
    const { nodes, connections } = baseGraph();
    const item = successItem({ workflowSnapshot: undefined, hasWorkflowSnapshot: false });
    const out = applyHistoryToCanvas({ item, nodes, connections });
    expect(out.restoredFromSnapshot).toBe(false);
    expect(out.notice).toBe(NO_WORKFLOW_SNAPSHOT_MSG);
    expect(out.imageApplied).toBe(true);
    const save = out.nodes.find((n) => n.type === 'SaveImage')!;
    expect(save.outputData).toBe('https://cdn.example/out.png');
    expect(out.nodes.find((n) => n.type === 'CLIPTextEncode')!.values.text).toBe('Low camera angle, portrait');
    expect(out.nodes.find((n) => n.type === 'EmptyLatentImage')!.values).toMatchObject({ width: 768, height: 1344 });
    expect(out.nodes.find((n) => n.type === 'CheckpointLoaderSimple')!.values.ckpt_name).toBe('photoreal_studio_z_image');
    expect(out.nodes.find((n) => n.type === 'KSampler')!.values.seed).toBe(42);
    expect(out.applied.imageUrl).toBe('https://cdn.example/out.png');
    expect(out.applied.prompt).toBe('Low camera angle, portrait');
    expect(out.applied.model).toBe('photoreal_studio_z_image');
    expect(out.applied.width).toBe(768);
    expect(out.applied.height).toBe(1344);
  });

  it('does not invent LoRA when history had none', () => {
    const { nodes, connections } = baseGraph();
    nodes.push(node({ id: 'lora1', type: 'LoRALoader', values: { lora_name: 'keep-me', strength_model: 0.5 } }));
    const out = applyHistoryToCanvas({ item: successItem({ loras: [] }), nodes, connections });
    const lora = out.nodes.find((n) => n.type === 'LoRALoader')!;
    expect(lora.values.lora_name).toBe('keep-me');
    expect(out.applied.loraCount).toBe(0);
  });

  it('restores LoRA name + strength onto existing LoRALoader when history has loras', () => {
    const { nodes, connections } = baseGraph();
    nodes.push(node({ id: 'lora1', type: 'LoRALoader', values: { lora_name: 'old', strength_model: 0.2 } }));
    const out = applyHistoryToCanvas({
      item: successItem({ loras: [{ name: 'style-v2', strength: 0.85 }] }),
      nodes,
      connections,
    });
    const lora = out.nodes.find((n) => n.type === 'LoRALoader')!;
    expect(lora.values.lora_name).toBe('style-v2');
    expect(lora.values.strength_model).toBe(0.85);
    expect(out.applied.loraCount).toBe(1);
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
    const out = applyHistoryToCanvas({
      item: successItem({ hasWorkflowSnapshot: true, workflowSnapshot: undefined }),
      nodes,
      connections,
    });
    expect(out.restoredFromSnapshot).toBe(false);
    expect(out.notice).toBe(NO_WORKFLOW_SNAPSHOT_MSG);
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
