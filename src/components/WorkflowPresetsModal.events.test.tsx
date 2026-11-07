// @vitest-environment jsdom
import React, { act } from 'react';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { WorkflowPresetsModal } from './WorkflowPresetsModal';
import { WORKFLOW_PRESETS, presetSummary } from '../constants/presets';
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

    // 3. Novita I2V and ModelsLab T2I display '待选' as model
    expect(textContent).toContain('待选');

    // 4. Test clicking category filters
    const buttons = Array.from(container.querySelectorAll('button'));
    const t2vButton = buttons.find((b) => b.textContent?.includes('文生视频 (T2V)'));
    expect(t2vButton).toBeDefined();

    await act(async () => {
      t2vButton?.click();
    });

    // In T2V category, Fal Wan 2.2 and WaveSpeed Wan 2.2 are displayed
    expect(container.textContent).toContain('Fal.ai · 标准文生视频');
    expect(container.textContent).toContain('WaveSpeed · 标准文生视频');
    expect(container.textContent).not.toContain('SVD-XT');

    // Switch to I2V category
    const i2vButton = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('图生视频 (I2V)')
    );
    expect(i2vButton).toBeDefined();

    await act(async () => {
      i2vButton?.click();
    });

    expect(container.textContent).toContain('Fal.ai · 标准图生视频');
    expect(container.textContent).toContain('WaveSpeed · 标准图生视频');
    expect(container.textContent).toContain('Novita · 标准图生视频');
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

  it('requires explicit user model selection on 待选 presets and becomes ready once user selects a model', () => {
    for (const id of ['std-novita-t2i', 'std-replicate-t2i', 'std-runware-t2i', 'std-modelslab-t2i', 'std-novita-i2v', 'std-muapi-t2v', 'std-replicate-t2v']) {
      const p = WORKFLOW_PRESETS.find((x) => x.id === id)!;
      const summary = presetSummary(p);
      expect(summary.model, `${id} should be empty placeholder`).toBe('');
      const initialReason = generationReadiness({ provider: p.provider, model: summary.model });
      expect(initialReason, `${id} should block before user selects model`).toBe('请先选择模型');

      // Simulate explicit user model selection
      const afterSelectionReason = generationReadiness({ provider: p.provider, model: 'user-selected-model' });
      expect(afterSelectionReason, `${id} should be ready after explicit selection`).toBeUndefined();
    }
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
