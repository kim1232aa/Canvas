// @vitest-environment jsdom
import React, { act } from 'react';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { WorkflowPresetsModal } from './WorkflowPresetsModal';
import { WORKFLOW_PRESETS } from '../constants/presets';
import { NODE_DEFINITIONS } from '../constants/nodes';
import { NodeItem } from './NodeItem';
import { extractWorkflowParameters } from '../utils/graphEngine';
import { generationReadiness } from '../utils/generationReadiness';
import { loadWorkspaceCache, saveWorkspaceCache } from '../utils/workspaceCache';

describe('WorkflowPresetsModal mounted UI events & obsolete model audit', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('mounts and switches categories, asserting on clean modern presets and exclusion of legacy models', async () => {
    const handleLoadPreset = vi.fn();
    const handleLoadAndRun = vi.fn();
    const handleClose = vi.fn();

    await act(async () => {
      root.render(
        <WorkflowPresetsModal
          isOpen={true}
          onClose={handleClose}
          onLoadPreset={handleLoadPreset}
          onLoadAndRunPreset={handleLoadAndRun}
          currentNodes={[]}
          currentConnections={[]}
          currentSpatialFrames={[]}
          onImportWorkflowData={vi.fn()}
          onClearCanvas={vi.fn()}
        />
      );
    });

    const textContent = container.textContent || '';

    // 1. Strict ban on legacy models as current recommendations:
    // SD1.5, SDXL 1.0, FLUX.1, Wan 2.1, and SVD-XT must NOT be present in modern preset recommendations
    expect(textContent).not.toContain('v1-5-pruned');
    expect(textContent).not.toContain('dreamshaper_8');
    expect(textContent).not.toContain('sd_xl_base_1.0');
    expect(textContent).not.toContain('flux-schnell');
    expect(textContent).not.toContain('flux-dev');
    expect(textContent).not.toContain('fal-ai/wan-t2v-lora');
    expect(textContent).not.toContain('fal-ai/wan-i2v-lora');
    expect(textContent).not.toContain('wavespeed-ai/wan-2.1');
    expect(textContent).not.toContain('SVD-XT');
    expect(textContent).not.toContain('tamarin-xl-v1');
    expect(textContent).not.toContain('wan2.1-lora');
    expect(textContent).not.toContain('wan-video/wan2.1-with-lora');

    // 2. Verified Wan 2.2 models are present
    expect(textContent).toContain('fal-ai/wan/v2.2-a14b/text-to-video/lora');
    expect(textContent).toContain('fal-ai/wan/v2.2-a14b/image-to-video/lora');
    expect(textContent).toContain('wavespeed-ai/wan-2.2/t2v-480p-lora');
    expect(textContent).toContain('wavespeed-ai/wan-2.2/i2v-480p-lora');

    expect(textContent).not.toContain('待选');
    expect(textContent).toContain('待配方');
    for (const id of ['std-novita-i2v', 'std-replicate-i2v', 'std-muapi-i2v', 'std-replicate-t2v', 'std-muapi-t2v']) {
      expect(WORKFLOW_PRESETS.some((p) => p.id === id), `retired empty card ${id}`).toBe(false);
    }
    const t2vButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('文生视频 (T2V)'));
    expect(t2vButton).toBeDefined();
    await act(async () => { t2vButton!.click(); });
    expect(Array.from(container.querySelectorAll('h3')).map((h) => h.textContent)).toEqual([
      'Civitai · 电影镜头文生视频', 'Fal.ai · 电影镜头文生视频', 'WaveSpeed · 电影镜头文生视频',
    ]);
    expect(container.textContent).not.toContain('SVD-XT');
    const i2vButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('图生视频 (I2V)'));
    expect(i2vButton).toBeDefined();
    await act(async () => { i2vButton!.click(); });
    expect(Array.from(container.querySelectorAll('h3')).map((h) => h.textContent)).toEqual([
      'Civitai · 图生视频运镜', 'Fal.ai · 图生视频运镜', 'WaveSpeed · 图生视频运镜',
    ]);
    expect(container.textContent).not.toContain('SVD-XT');
    expect(container.textContent).not.toContain('wan-2.1');
  });

  it('clicking 仅载入 on a preset triggers onLoadPreset with intact topology', async () => {
    const handleLoadPreset = vi.fn();
    await act(async () => {
      root.render(
        <WorkflowPresetsModal
          isOpen={true}
          onClose={vi.fn()}
          onLoadPreset={handleLoadPreset}
          onLoadAndRunPreset={vi.fn()}
          currentNodes={[]}
          currentConnections={[]}
          currentSpatialFrames={[]}
          onImportWorkflowData={vi.fn()}
          onClearCanvas={vi.fn()}
        />
      );
    });

    const loadButtons = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('仅载入')
    );
    expect(loadButtons.length).toBeGreaterThan(0);

    await act(async () => {
      loadButtons[0].click();
    });

    expect(handleLoadPreset).toHaveBeenCalledTimes(1);
    const loadedPreset = handleLoadPreset.mock.calls[0][0];
    expect(loadedPreset).toBeDefined();
    expect(loadedPreset.nodes.length).toBeGreaterThan(0);
    expect(loadedPreset.connections.length).toBeGreaterThan(0);
  });

  it.each(['novita', 'replicate', 'runware', 'modelslab', 'muapi', 'user-video-provider'])('requires a model on a user-created %s video node and preserves explicit custom selection', async (provider) => {
    const def = NODE_DEFINITIONS.AIVideoNode;
    let node: import('../types/graph').NodeInstance = { id: 'user-video', type: def.type, title: def.title, pos: { x: 0, y: 0 }, inputs: def.inputs, outputs: def.outputs, values: { ...def.defaultValues, targetProvider: provider } };
    expect(generationReadiness({ provider, model: node.values.model })).toBe('请先选择模型');
    expect(() => extractWorkflowParameters([node], [], node.id)).toThrow('请先选择模型');
    const update = vi.fn((_id: string, name: string, value: unknown) => { node = { ...node, values: { ...node.values, [name]: value } }; draw(); });
    const noop = () => {};
    const draw = () => root.render(<NodeItem node={node} isSelected={false} zoom={1} onSelect={noop} onStartDrag={noop} onUpdateValue={update} onDeleteNode={noop} onToggleCollapse={noop} onToggleBypass={noop} onStartConnecting={noop} onEndConnecting={noop} />);
    await act(async () => { draw(); });
    expect(update).not.toHaveBeenCalled();
    const select = container.querySelector<HTMLSelectElement>('[data-testid="node-video-model-select"]');
    expect(select).not.toBeNull();
    expect(select!.value).toBe('');
    expect(container.textContent).toContain('请先选择模型');
    const custom = container.querySelector<HTMLElement>('[data-testid="node-custom-model-display"]');
    expect(custom).not.toBeNull();
    await act(async () => { custom!.click(); });
    const input = container.querySelector<HTMLTextAreaElement>('[data-testid="node-custom-model-id"]');
    expect(input).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, 'user-owner/custom-motion-model');
      input!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(update).toHaveBeenCalledExactlyOnceWith(node.id, 'model', 'user-owner/custom-motion-model');
    expect(node.values).toMatchObject({ targetProvider: provider, model: 'user-owner/custom-motion-model' });
    expect(select!.value).toBe('user-owner/custom-motion-model');
    expect(input!.value).toBe('user-owner/custom-motion-model');
    expect(generationReadiness({ provider, model: node.values.model })).toBeUndefined();
    expect(extractWorkflowParameters([node], [], node.id)).toMatchObject({ checkpointModel: 'user-owner/custom-motion-model', videoProvider: provider, isVideo: true });
  });

  it('I2V missing reference blocks immediate run but 仅载入 replaces the canvas and preserves the image-to-video connection', async () => {
    const preset = WORKFLOW_PRESETS.find((p) => p.id === 'std-fal-i2v');
    expect(preset, 'current Fal I2V preset').toBeDefined();
    const video = preset!.nodes.find((n) => n.type === 'AIVideoNode');
    expect(video, 'Fal I2V video node').toBeDefined();
    const load = vi.fn(), run = vi.fn();
    await act(async () => { root.render(<WorkflowPresetsModal isOpen onClose={vi.fn()} onLoadPreset={load} onLoadAndRunPreset={run} currentNodes={[]} currentConnections={[]} currentSpatialFrames={[]} onImportWorkflowData={vi.fn()} onClearCanvas={vi.fn()} />); });
    const blockedRun = container.querySelector<HTMLButtonElement>('[aria-describedby="preset-blocked-std-fal-i2v"]');
    expect(blockedRun).not.toBeNull();
    expect(blockedRun!.disabled).toBe(true);
    await act(async () => { blockedRun!.click(); });
    expect(run).not.toHaveBeenCalled();
    const actions = blockedRun!.parentElement!;
    const loadOnly = Array.from(actions.querySelectorAll('button')).find((b) => b.textContent === '仅载入');
    expect(loadOnly).toBeDefined();
    await act(async () => { loadOnly!.click(); });
    expect(load).toHaveBeenCalledExactlyOnceWith(preset, 'replace');
    expect(video!.values.require_reference_image).toBe(true);
    expect(() => extractWorkflowParameters(preset!.nodes, preset!.connections, video!.id)).toThrow('编辑输入需要明确参考图，请选择或上传参考图');
    const readiness = (referenceImageUrl?: string) => generationReadiness({ provider: String(video!.values.targetProvider), model: String(video!.values.model), requireReferenceImage: true, referenceImageUrl });
    expect(readiness()).toBe('编辑输入需要明确参考图，请选择或上传参考图');
    const nodes = preset!.nodes.map((n) => n.type === 'LoadImage' ? { ...n, values: { ...n.values, image_url: 'https://example.com/user-reference.png' } } : n);
    const ready = extractWorkflowParameters(nodes, preset!.connections, video!.id);
    expect(ready.initImageUrl).toBe('https://example.com/user-reference.png');
    expect(readiness(ready.initImageUrl)).toBeUndefined();
  });

  it('preserves saved custom workspaces (including manual legacy models) without silent migration, while reset-default restores WORKFLOW_PRESETS[0]', async () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
    };

    const customLegacyNodes = [
      {
        id: 'custom-ckpt',
        type: 'CheckpointLoaderSimple',
        title: 'My Custom Legacy Loader',
        pos: { x: 10, y: 20 },
        inputs: [],
        outputs: [],
        values: { targetProvider: 'nanogpt', ckpt_name: 'flux-schnell' },
      },
      {
        id: 'custom-vid',
        type: 'AIVideoNode',
        title: 'My Custom Legacy Video',
        pos: { x: 100, y: 200 },
        inputs: [],
        outputs: [],
        values: { targetProvider: 'novita', model: 'SVD-XT', prompt: 'custom user prompt' },
      },
    ];

    saveWorkspaceCache(
      [{ id: 'user-board-1', name: 'User Saved Legacy Graph', description: 'User custom saved workspace', updatedAt: 12345, nodes: customLegacyNodes as any, connections: [], spatialFrames: [] }],
      'user-board-1',
      'graph',
      storage
    );

    const loaded = loadWorkspaceCache(
      [{ id: 'canvas-zimage', name: 'Z-Image Turbo 创作画布', description: 'Default workspace', updatedAt: 99999, nodes: WORKFLOW_PRESETS[0].nodes, connections: [], spatialFrames: WORKFLOW_PRESETS[0].spatialFrames || [] }],
      storage
    );

    // Saved custom workspace is preserved verbatim: not overwritten by WORKFLOW_PRESETS[0], legacy models not stripped
    expect(loaded.active.id).toBe('user-board-1');
    expect(loaded.active.name).toBe('User Saved Legacy Graph');
    expect(loaded.active.nodes.find((n: any) => n.id === 'custom-ckpt')?.values.ckpt_name).toBe('flux-schnell');
    expect(loaded.active.nodes.find((n: any) => n.id === 'custom-vid')?.values.model).toBe('SVD-XT');

    // Clicking reset-default in the modal Clear tab triggers onClearCanvas('reset-default')
    const handleClearCanvas = vi.fn();
    await act(async () => {
      root.render(
        <WorkflowPresetsModal
          isOpen={true}
          onClose={vi.fn()}
          onLoadPreset={vi.fn()}
          onLoadAndRunPreset={vi.fn()}
          currentNodes={loaded.active.nodes as any}
          currentConnections={[]}
          currentSpatialFrames={[]}
          onImportWorkflowData={vi.fn()}
          onClearCanvas={handleClearCanvas}
          initialTab="clear"
        />
      );
    });

    const resetBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('重置为默认示例') || b.textContent?.includes('恢复默认')
    );
    expect(resetBtn).toBeDefined();
    await act(async () => {
      resetBtn?.click();
    });
    expect(handleClearCanvas).toHaveBeenCalledWith('reset-default');
    expect(WORKFLOW_PRESETS[0].id).toBe('std-huggingface-t2i');
  });
});
