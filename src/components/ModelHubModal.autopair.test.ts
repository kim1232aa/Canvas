// @vitest-environment jsdom
import React, { act } from 'react';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelHubModal } from './ModelHubModal';
import { getRecommendedBaseModelForLora, recommendCheckpointFromVerifiedMetadata, validateModelCompatibility, type CatalogCheckpointCandidate } from '../utils/baseModelMatcher';

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, fetchLiveModels: vi.fn(async () => ({ civitai: [], _pagination: {} })) };
});

describe('ModelHub LoRA auto-pair button', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
  });

  it('labels the primary action 选用 LoRA 并自动配对底模 and calls onSelectLoRAWithBaseModel', async () => {
    const lora = { id: 'lora-1', name: 'portrait', type: 'LORA', category: 'lora', provider: 'civitai', _sourceProvider: 'civitai', baseModel: 'SDXL 1.0', trainedWords: ['portrait'] };
    const { fetchLiveModels } = await import('../services/api');
    vi.mocked(fetchLiveModels).mockResolvedValue({ civitai: [lora], _pagination: {} } as never);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const onSelectLoRAWithBaseModel = vi.fn();
    await act(async () => {
      root.render(React.createElement(ModelHubModal, {
        isOpen: true,
        onClose: vi.fn(),
        onSelectModel: vi.fn(),
        onSelectLoRAWithBaseModel,
        initialCategory: 'lora',
        initialProvider: 'civitai',
        currentCheckpoint: 'urn:air:sdxl:checkpoint:civitai:101055@128078',
        currentCheckpointBaseModel: 'SDXL 1.0',
      }));
    });
    await act(async () => { await Promise.resolve(); });
    const button = Array.from(container.querySelectorAll('button')).find((el) => el.textContent?.includes('选用 LoRA 并自动配对底模'));
    expect(button).toBeDefined();
    expect(button?.getAttribute('title')).toContain('选用此 LoRA 并自动将前置底模');
    await act(async () => { button?.click(); });
    expect(onSelectLoRAWithBaseModel).toHaveBeenCalledWith(expect.objectContaining({ provider: 'civitai', baseModel: 'SDXL 1.0' }));
  });
});

const fluxCheckpoint: CatalogCheckpointCandidate = {
  provider: 'huggingface',
  checkpoint: 'black-forest-labs/FLUX.1-dev',
  baseModelMetadata: 'FLUX.1 D',
  baseModelSource: 'huggingface:base_model',
};
const sdxlCheckpoint: CatalogCheckpointCandidate = {
  provider: 'civitai',
  checkpoint: 'urn:air:sdxl:checkpoint:civitai:101055@128078',
  baseModelMetadata: 'SDXL 1.0',
  baseModelSource: 'civitai:baseModel',
};

describe('recommendCheckpointFromVerifiedMetadata', () => {
  it('recommends the first candidate whose verified base_model family matches, and records the reason', () => {
    const found = recommendCheckpointFromVerifiedMetadata('Flux.1 D', [sdxlCheckpoint, fluxCheckpoint], 'civitai:baseModel');
    expect(found).toMatchObject({
      provider: 'huggingface',
      checkpoint: 'black-forest-labs/FLUX.1-dev',
      verification: 'verified',
      recommendedReason: 'verified base_model metadata: Flux.1 D',
    });
    expect(found?.steps).toBeGreaterThan(0);
  });

  it('returns no recommendation when the LoRA base_model metadata is missing', () => {
    expect(recommendCheckpointFromVerifiedMetadata(undefined, [fluxCheckpoint], 'civitai:baseModel')).toBeNull();
    expect(recommendCheckpointFromVerifiedMetadata('', [fluxCheckpoint], 'huggingface:base_model')).toBeNull();
    const profile = getRecommendedBaseModelForLora(undefined, 'some-lora.safetensors', 'huggingface', [fluxCheckpoint]);
    expect(profile.recommendation).toBeNull();
    expect(profile.recommendedCheckpoint).toBe('');
  });

  it('returns no recommendation when the verified families differ', () => {
    expect(recommendCheckpointFromVerifiedMetadata('SDXL 1.0', [fluxCheckpoint], 'civitai:baseModel')).toBeNull();
    const verdict = validateModelCompatibility('black-forest-labs/FLUX.1-dev', 'SDXL 1.0', 'lora', 'huggingface', {
      checkpointBaseModelMetadata: 'FLUX.1 D',
      checkpointBaseModelSource: 'huggingface:base_model',
      loraBaseModelSource: 'civitai:baseModel',
      candidates: [fluxCheckpoint],
    });
    expect(verdict.verification).toBe('unverified');
    expect(verdict.recommendedCheckpoint).toBeUndefined();
  });

  it('does not treat a filename as verified metadata', () => {
    const guessed: CatalogCheckpointCandidate = { provider: 'huggingface', checkpoint: 'flux-dev.safetensors', baseModelMetadata: 'my-flux-lora.safetensors' };
    expect(recommendCheckpointFromVerifiedMetadata('FLUX.1 D', [guessed], 'civitai:baseModel')).toBeNull();
    const unverified = validateModelCompatibility('flux-dev.safetensors', undefined, 'flux-lora.safetensors');
    expect(unverified.verification).toBe('unverified');
    expect(unverified.recommendedCheckpoint).toBeUndefined();
  });
});
