import React from 'react';
import { afterEach, beforeEach, expect, it, vi, describe } from 'vitest';

vi.mock('react', async () => {
  const actual = await vi.importActual<any>('react');
  return {
    ...actual,
    useState: (value: any) => React.useState(value),
    useEffect: (fn: any, deps: any) => React.useEffect(fn, deps),
    useRef: (value: any) => React.useRef(value),
  };
});

import { CivitaiModal } from './CivitaiModal';
import { CivitaiModalImportPreview } from './CivitaiModalImportPreview';
import { adaptCivitaiRecipeToProvider, buildAllProviderAdaptations } from '../utils/civitaiImportMap';

const elements = (tree: any): any[] =>
  !tree ? [] : Array.isArray(tree) ? tree.flatMap(elements) : typeof tree === 'object' && tree.props ? [tree, ...elements(tree.props.children)] : [];

describe('CivitaiModal Recipe Import and Cross-Provider Adaptation UI', () => {
  beforeEach(() => {
    vi.spyOn(React, 'useState').mockImplementation(((value: any) => [value, vi.fn()]) as any);
    vi.spyOn(React, 'useEffect').mockImplementation(() => {});
    vi.spyOn(React, 'useRef').mockReturnValue({ current: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const sampleAdaptation = adaptCivitaiRecipeToProvider(
    {
      checkpoint: 'urn:air:sdxl:checkpoint:civitai:101055@128078',
      baseModel: 'SDXL 1.0',
      prompt: 'scenic mountains, sunset',
      negativePrompt: 'blurry, bad quality',
      steps: 30,
      cfg: 7,
      sampler: 'dpmpp_2m',
      scheduler: 'karras',
      seed: 42,
      clipSkip: 2,
      width: 1024,
      height: 1024,
      loras: [
        {
          name: 'AsianMix LoRA',
          civitaiId: '123456',
          air: 'urn:air:sdxl:lora:civitai:123456@789012',
          strength: 0.8,
          baseModel: 'SDXL 1.0',
          downloadUrl: 'https://civitai.com/api/download/models/789012',
          requireAuth: false,
        },
      ],
    },
    'fal'
  );

  it('renders mode switch tabs in CivitaiModal header', () => {
    const tree = CivitaiModal({
      isOpen: true,
      initialMode: 'browse',
      onClose: vi.fn(),
      onSelectLoRA: vi.fn(),
      onAddLoRANodeToCanvas: vi.fn(),
    });
    const allEls = elements(tree);
    const browseBtn = allEls.find((el) => el.type === 'button' && el.props['data-testid'] === 'civitai-modal-mode-browse');
    const importBtn = allEls.find((el) => el.type === 'button' && el.props['data-testid'] === 'civitai-modal-mode-import');

    expect(browseBtn).toBeDefined();
    expect(importBtn).toBeDefined();
  });

  it('renders CivitaiModalImportPreview with target provider selector and per-field adaptation outcome', () => {
    const onSelectProvider = vi.fn();
    const onToggleTokenConsent = vi.fn();

    const tree = CivitaiModalImportPreview({
      adaptation: sampleAdaptation,
      allAdaptations: { fal: sampleAdaptation },
      selectedProvider: 'fal',
      onSelectProvider,
      tokenConsent: false,
      onToggleTokenConsent,
    });

    const allEls = elements(tree);

    // Architecture banner renders
    const banner = allEls.find((el) => el.props?.['data-testid'] === 'import-architecture-banner');
    expect(banner).toBeDefined();
    expect(elements(banner).some((el) => String(el.props?.children || '').includes('架构兼容'))).toBe(true);

    // Provider selector renders
    const selector = allEls.find((el) => el.props?.['data-testid'] === 'import-provider-selector');
    expect(selector).toBeDefined();

    // Per-field table renders
    const table = allEls.find((el) => el.props?.['data-testid'] === 'import-fields-table');
    expect(table).toBeDefined();

    // Check specific mapped fields
    const tableText = JSON.stringify(elements(table).map((e) => e.props?.children));
    expect(tableText).toContain('num_inference_steps');
    expect(tableText).toContain('guidance_scale');
  });

  it('renders token consent protection banner when requireAuth LoRA is present', () => {
    const authLoRAAdaptation = adaptCivitaiRecipeToProvider(
      {
        baseModel: 'Flux.1 D',
        loras: [
          {
            name: 'Private LoRA',
            civitaiId: '999',
            baseModel: 'Flux.1 D',
            requireAuth: true,
          },
        ],
      },
      'fal',
      { allowTokenInUrl: false }
    );

    const onToggleTokenConsent = vi.fn();
    const tree = CivitaiModalImportPreview({
      adaptation: authLoRAAdaptation,
      selectedProvider: 'fal',
      onSelectProvider: vi.fn(),
      tokenConsent: false,
      onToggleTokenConsent,
    });

    const allEls = elements(tree);
    const consentBanner = allEls.find((el) => el.props?.['data-testid'] === 'civitai-token-consent-banner');
    expect(consentBanner).toBeDefined();

    const checkbox = allEls.find((el) => el.type === 'input' && el.props?.['data-testid'] === 'civitai-token-consent-checkbox');
    expect(checkbox).toBeDefined();
    expect(checkbox.props.checked).toBe(false);

    // Click checkbox
    checkbox.props.onChange({ target: { checked: true } });
    expect(onToggleTokenConsent).toHaveBeenCalledWith(true);
  });

  it('triggers onApplyPreset when apply button is clicked', () => {
    const onApplyPreset = vi.fn();
    const mockPreset = { id: 'p1', name: 'Test Preset' };

    const tree = CivitaiModalImportPreview({
      adaptation: sampleAdaptation,
      selectedProvider: 'fal',
      onSelectProvider: vi.fn(),
      tokenConsent: false,
      onToggleTokenConsent: vi.fn(),
      preset: mockPreset,
      onApplyPreset,
    });

    const allEls = elements(tree);
    const applyBtn = allEls.find((el) => el.type === 'button' && el.props?.['data-testid'] === 'apply-imported-workflow-button');
    expect(applyBtn).toBeDefined();

    applyBtn.props.onClick();
    expect(onApplyPreset).toHaveBeenCalledWith(mockPreset);
  });

  it('P1-1: apply-to-canvas button delegates to onLoadWorkflowPreset and closes modal from CivitaiModal', () => {
    const onLoadWorkflowPreset = vi.fn();
    const onClose = vi.fn();
    const mockPreset = {
      id: 'p1',
      name: 'Imported Preset',
      providerAdaptation: { civitai: sampleAdaptation },
      nodes: [{ id: 'n1', type: 'CheckpointLoaderSimple', values: {} }],
      otherMetadata: { baseModel: 'SDXL 1.0', resources: [] },
    };

    let stateIdx = 0;
    vi.spyOn(React, 'useState').mockImplementation(((initial: any) => {
      const idx = stateIdx++;
      if (idx === 16) return ['import', vi.fn()];
      if (idx === 21) return [mockPreset, vi.fn()];
      return [initial, vi.fn()];
    }) as any);

    const tree = CivitaiModal({
      isOpen: true,
      initialMode: 'import',
      onClose,
      onSelectLoRA: vi.fn(),
      onAddLoRANodeToCanvas: vi.fn(),
      onLoadWorkflowPreset,
    });

    const allEls = elements(tree);
    const previewEl = allEls.find((el) => el.type === CivitaiModalImportPreview);
    expect(previewEl).toBeDefined();

    // Verify onApplyPreset delegates to onLoadWorkflowPreset and calls onClose
    previewEl.props.onApplyPreset(mockPreset);
    expect(onLoadWorkflowPreset).toHaveBeenCalledWith(mockPreset);
    expect(onClose).toHaveBeenCalled();
  });
});
