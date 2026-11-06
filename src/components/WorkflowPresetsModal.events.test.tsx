// @vitest-environment jsdom
import React, { act } from 'react';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { WorkflowPresetsModal } from './WorkflowPresetsModal';
import { WORKFLOW_PRESETS } from '../constants/presets';

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
    // Wan 2.1, SVD-XT, and SDXL 1.0 (tamarin-xl-v1) must NOT be present in modern preset definitions
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
});
