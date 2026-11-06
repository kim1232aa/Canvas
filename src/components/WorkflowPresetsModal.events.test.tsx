// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkflowPresetsModal } from './WorkflowPresetsModal';
import { WORKFLOW_PRESETS, presetSummary } from '../constants/presets';
import { isLegacyPresetRecommendation } from '../utils/presetModelSelection';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const flush = async () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

describe('WorkflowPresetsModal mounted UI event tests', () => {
  let host: HTMLDivElement;
  let root: Root;

  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  const mountModal = async (props: Partial<React.ComponentProps<typeof WorkflowPresetsModal>> = {}) => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const defaultProps: React.ComponentProps<typeof WorkflowPresetsModal> = {
      isOpen: true,
      onClose: vi.fn(),
      onLoadPreset: vi.fn(),
      onLoadAndRunPreset: vi.fn(),
      currentNodes: [],
      currentConnections: [],
      currentSpatialFrames: [],
      onImportWorkflowData: vi.fn(),
      onClearCanvas: vi.fn(),
      ...props,
    };
    await act(async () => {
      root.render(<WorkflowPresetsModal {...defaultProps} />);
    });
    await flush();
    return defaultProps;
  };

  it('filters visible cards by task type (T2I, T2V, I2V) via button click events', async () => {
    await mountModal();
    const taskButtons = host.querySelectorAll('button');
    const t2vButton = [...taskButtons].find(b => b.textContent?.includes('文生视频 (T2V)'));
    expect(t2vButton).toBeDefined();

    // Click T2V filter
    await act(async () => {
      t2vButton!.click();
    });
    await flush();

    // Cards should now only contain T2V presets
    const cards = host.querySelectorAll('.grid > div');
    expect(cards.length).toBe(5);
    for (const card of cards) {
      expect(card.textContent).toContain('标准文生视频');
    }

    // Click I2V filter
    const i2vButton = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('图生视频 (I2V)'));
    await act(async () => {
      i2vButton!.click();
    });
    await flush();

    const i2vCards = host.querySelectorAll('.grid > div');
    expect(i2vCards.length).toBe(6);
    for (const card of i2vCards) {
      expect(card.textContent).toContain('标准图生视频');
    }
  });

  it('filters visible cards by search query input event', async () => {
    await mountModal();
    const searchInput = host.querySelector('input[placeholder*="搜索工作流"]') as HTMLInputElement;
    expect(searchInput).toBeDefined();

    // Search for "MOSS" using React 19 native value setter
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      nativeSetter?.call(searchInput, 'MOSS');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();

    const cards = host.querySelectorAll('.grid > div');
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.textContent?.toLowerCase()).toContain('moss');
    }
  });

  it('fires onLoadPreset with replace mode when user clicks 仅载入 on a preset', async () => {
    const onLoadPreset = vi.fn();
    const onClose = vi.fn();
    await mountModal({ onLoadPreset, onClose });

    // Find the first preset's "仅载入" button
    const loadButtons = [...host.querySelectorAll('button')].filter(b => b.textContent?.trim() === '仅载入');
    expect(loadButtons.length).toBeGreaterThan(0);

    await act(async () => {
      loadButtons[0].click();
    });
    await flush();

    expect(onLoadPreset).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    const calledPreset = onLoadPreset.mock.calls[0][0];
    expect(calledPreset).toBeDefined();
    expect(calledPreset.id).toBeTruthy();
  });

  it('preserves saved workspace by appending when append button is clicked', async () => {
    const onLoadPreset = vi.fn();
    await mountModal({ onLoadPreset });

    // Find '+' (append) buttons
    const appendButtons = [...host.querySelectorAll('button')].filter(b => b.getAttribute('title')?.includes('追加合并到当前画布'));
    expect(appendButtons.length).toBeGreaterThan(0);

    await act(async () => {
      appendButtons[0].click();
    });
    await flush();

    expect(onLoadPreset).toHaveBeenCalledWith(expect.anything(), 'append');
  });

  it('ensures no built-in preset recommends obsolete/legacy models (SD1.5, legacy FLUX.1 dev/schnell, SVD-XT)', async () => {
    await mountModal();

    for (const p of WORKFLOW_PRESETS) {
      const summary = presetSummary(p);
      const isLegacy = isLegacyPresetRecommendation(summary.model);
      expect(isLegacy, `Preset ${p.id} recommends legacy model ${summary.model}`).toBe(false);
    }
  });

  it('initial and reset-default preset corresponds to WORKFLOW_PRESETS[0] (Z-Image Turbo)', () => {
    const firstPreset = WORKFLOW_PRESETS[0];
    expect(firstPreset.id).toBe('std-huggingface-t2i');
    const summary = presetSummary(firstPreset);
    expect(summary.model).toBe('renderartist/Technically-Color-Z-Image-Turbo');
    expect(firstPreset.name).toContain('标准文生图');
  });

  it('does not render obsolete/stale marketing categories like FLUX 热门微调', () => {
    for (const p of WORKFLOW_PRESETS) {
      expect(p.category).not.toContain('FLUX 热门微调');
      expect(p.category).not.toContain('3D 盲盒');
      expect(p.category).not.toContain('二次元 / 动漫美学');
    }
  });
});
