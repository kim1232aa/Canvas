// @vitest-environment jsdom
import React, { act } from 'react';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelHubModal } from './ModelHubModal';
import { replaceSelectedResource } from '../utils/resourceSelection';
import { getRecommendedBaseModelForLora, recommendCheckpointFromVerifiedMetadata, validateModelCompatibility, type CatalogCheckpointCandidate } from '../utils/baseModelMatcher';

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, fetchLiveModels: vi.fn(async () => ({ civitai: [], _pagination: {} })), fetchHuggingFaceModelInfo: vi.fn() };
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


const civitaiFile = (id: number, name: string) => ({ id, name, type: 'Model', primary: true, downloadUrl: `https://civitai.com/api/download/models/${id}`, metadata: { format: 'SafeTensor' } });
// Hub rows exactly as server.ts maps GET /api/v1/models items: id "model@version", versionId, baseModel of modelVersions[0], full modelVersions[].
const hubLora = (over: Record<string, unknown> = {}) => ({
  id: '555@777', modelId: '555', versionId: '777', name: 'Portrait LoRA', provider: 'Civitai', type: 'LORA', category: 'LoRA',
  baseModel: 'SDXL 1.0', downloads: 1200, rating: 0, imageUrl: '', trainedWords: ['portrait'],
  modelVersions: [{ id: 777, name: 'v1.0', baseModel: 'SDXL 1.0', trainedWords: ['portrait'], files: [civitaiFile(777, 'portrait.safetensors')] }],
  ...over,
});
const hubCheckpoint = (over: Record<string, unknown> = {}) => ({
  id: '101055@128078', modelId: '101055', versionId: '128078', name: 'SDXL finetune', provider: 'Civitai', type: 'Checkpoint', category: 'Checkpoint',
  baseModel: 'SDXL 1.0', downloads: 5000, rating: 0, imageUrl: '', trainedWords: [],
  modelVersions: [{ id: 128078, name: 'v1', baseModel: 'SDXL 1.0', files: [civitaiFile(128078, 'sdxl.safetensors')] }],
  ...over,
});

describe('ModelHub real-click stamping of verified base model + checkpoint candidates', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
  });

  const catalogByType = async (rows: { Checkpoint?: unknown[]; LORA?: unknown[] }) => {
    const { fetchLiveModels } = await import('../services/api');
    vi.mocked(fetchLiveModels).mockImplementation((async (_provider: string, _query: string, type: string) => ({
      civitai: type === 'LORA' ? (rows.LORA || []) : (rows.Checkpoint || []),
      _pagination: {},
    })) as never);
  };
  const open = async (props: Record<string, unknown>) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const onSelectLoRAWithBaseModel = vi.fn();
    await act(async () => {
      root.render(React.createElement(ModelHubModal, { isOpen: true, onClose: vi.fn(), onSelectModel: vi.fn(), onSelectLoRAWithBaseModel, initialProvider: 'civitai', ...props } as never));
    });
    await act(async () => { await Promise.resolve(); });
    return onSelectLoRAWithBaseModel;
  };
  const clickButton = async (match: (el: HTMLButtonElement) => boolean) => {
    const button = Array.from(container.querySelectorAll('button')).find(match);
    expect(button).toBeDefined();
    await act(async () => { button?.click(); });
    await act(async () => { await Promise.resolve(); });
  };
  const pairButton = (el: HTMLButtonElement) => Boolean(el.textContent?.includes('选用 LoRA 并自动配对底模'));
  // NodeItem reads these node.values keys when it calls the matcher.
  const nodeMatcherRecommendation = (values: Record<string, any>) => getRecommendedBaseModelForLora(
    values.base_model, values.lora_name, values.resource_source,
    Array.isArray(values.checkpoint_candidates) ? values.checkpoint_candidates : [], values.base_model_source,
  ).recommendation;

  it('LoRA tab opened after the checkpoint tab: click stamps civitai:baseModel + cached verified checkpoint, stored node feeds the matcher', async () => {
    await catalogByType({ Checkpoint: [hubCheckpoint()], LORA: [hubLora()] });
    const onSelect = await open({ initialCategory: 'checkpoint' });
    expect(container.textContent).toContain('SDXL finetune');
    await clickButton((el) => el.textContent?.trim() === 'LoRA');
    expect(container.textContent).toContain('Portrait LoRA');
    expect(container.textContent).not.toContain('SDXL finetune');
    await clickButton(pairButton);
    expect(onSelect).toHaveBeenCalledTimes(1);
    const selected = onSelect.mock.calls[0][0];
    expect(selected).toMatchObject({
      name: '555@777', provider: 'civitai', baseModel: 'SDXL 1.0', baseModelSource: 'civitai:baseModel',
      checkpointCandidates: [{ checkpoint: '101055@128078', provider: 'civitai', baseModelMetadata: 'SDXL 1.0', baseModelSource: 'civitai:baseModel' }],
    });
    const values = replaceSelectedResource({}, selected, 'lora_name');
    expect(values).toMatchObject({ lora_name: '555@777', base_model: 'SDXL 1.0', base_model_source: 'civitai:baseModel', resource_source: 'civitai' });
    expect(values.checkpoint_candidates).toHaveLength(1);
    expect(nodeMatcherRecommendation(values)).toMatchObject({ checkpoint: '101055@128078', provider: 'civitai', verification: 'verified' });
  });

  it('opened on the LoRA tab with no checkpoint loaded: candidates stay empty and the matcher returns null', async () => {
    await catalogByType({ LORA: [hubLora()] });
    const onSelect = await open({ initialCategory: 'lora' });
    await clickButton(pairButton);
    const selected = onSelect.mock.calls[0][0];
    expect(selected).toMatchObject({ baseModel: 'SDXL 1.0', baseModelSource: 'civitai:baseModel', checkpointCandidates: [] });
    const values = replaceSelectedResource({}, selected, 'lora_name');
    expect(values).toMatchObject({ base_model_source: 'civitai:baseModel' });
    expect(values).not.toHaveProperty('checkpoint_candidates');
    expect(nodeMatcherRecommendation(values)).toBeNull();
  });

  it('a different-family or unverified checkpoint is never offered', async () => {
    const flux = hubCheckpoint({ id: '9@10', modelId: '9', versionId: '10', baseModel: 'Flux.1 D', modelVersions: [{ id: 10, baseModel: 'Flux.1 D', files: [] }] });
    const modelLevel = { id: '77', name: 'No version', provider: 'Civitai', type: 'Checkpoint', category: 'Checkpoint', baseModel: 'SDXL 1.0', downloads: 1 };
    await catalogByType({ Checkpoint: [flux, modelLevel], LORA: [hubLora()] });
    const onSelect = await open({ initialCategory: 'checkpoint' });
    await clickButton((el) => el.textContent?.trim() === 'LoRA');
    await clickButton(pairButton);
    const selected = onSelect.mock.calls[0][0];
    expect(selected.checkpointCandidates).toEqual([]);
    expect(nodeMatcherRecommendation(replaceSelectedResource({}, selected, 'lora_name'))).toBeNull();
  });

  it('a multi-version LoRA row without a pinned versionId is not stamped', async () => {
    const unpinned = hubLora({ versionId: undefined, modelId: undefined, id: '555', modelVersions: [{ id: 777, baseModel: 'SDXL 1.0' }, { id: 778, baseModel: 'Flux.1 D' }] });
    await catalogByType({ Checkpoint: [hubCheckpoint()], LORA: [unpinned] });
    const onSelect = await open({ initialCategory: 'checkpoint' });
    await clickButton((el) => el.textContent?.trim() === 'LoRA');
    await clickButton(pairButton);
    const selected = onSelect.mock.calls[0][0];
    expect(selected.baseModelSource).toBeUndefined();
    expect(selected.checkpointCandidates).toEqual([]);
    expect(nodeMatcherRecommendation(replaceSelectedResource({}, selected, 'lora_name'))).toBeNull();
  });

  const typeInto = async (testId: string, value: string) => {
    const input = container.querySelector(`[data-testid="${testId}"]`) as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => { setter?.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
  };

  it('Hub custom ID import of a Civitai version stamps civitai:baseModel and merges cached checkpoints', async () => {
    await catalogByType({ Checkpoint: [hubCheckpoint()], LORA: [] });
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      id: 777, modelId: 555, name: 'v1.0', baseModel: 'SDXL 1.0', air: 'urn:air:sdxl:lora:civitai:555@777',
      model: { name: 'Portrait', type: 'LORA' }, trainedWords: ['portrait'], files: [civitaiFile(777, 'portrait.safetensors')],
    }))) as never;
    try {
      const onSelect = await open({ initialCategory: 'checkpoint' });
      await clickButton((el) => el.textContent?.trim() === 'LoRA');
      await typeInto('hub-custom-id', 'urn:air:sdxl:lora:civitai:555@777');
      await clickButton((el) => el.getAttribute('data-testid') === 'hub-custom-id-apply');
      expect(onSelect).toHaveBeenCalledTimes(1);
      const selected = onSelect.mock.calls[0][0];
      expect(selected).toMatchObject({ name: 'urn:air:sdxl:lora:civitai:555@777', baseModel: 'SDXL 1.0', baseModelSource: 'civitai:baseModel' });
      expect(selected.checkpointCandidates).toEqual([{ checkpoint: '101055@128078', provider: 'civitai', baseModelMetadata: 'SDXL 1.0', baseModelSource: 'civitai:baseModel' }]);
    } finally { globalThis.fetch = original; }
  });

  it('Hub custom ID import of a Hugging Face LoRA stamps huggingface:base_model from cardData', async () => {
    await catalogByType({});
    const { fetchHuggingFaceModelInfo } = await import('../services/api');
    vi.mocked(fetchHuggingFaceModelInfo).mockResolvedValue({
      id: 'XLabs-AI/flux-RealismLora', pipeline_tag: 'text-to-image', tags: ['diffusers', 'lora', 'flux'],
      cardData: { base_model: 'black-forest-labs/FLUX.1-dev' },
    });
    const onSelect = await open({ initialCategory: 'lora', initialProvider: 'huggingface' });
    await typeInto('hub-custom-id', 'XLabs-AI/flux-RealismLora');
    await clickButton((el) => el.getAttribute('data-testid') === 'hub-custom-id-apply');
    expect(fetchHuggingFaceModelInfo).toHaveBeenCalledWith('XLabs-AI/flux-RealismLora');
    expect(onSelect).toHaveBeenCalledTimes(1);
    const selected = onSelect.mock.calls[0][0];
    expect(selected).toMatchObject({
      name: 'XLabs-AI/flux-RealismLora', provider: 'huggingface', baseModel: 'black-forest-labs/FLUX.1-dev',
      baseModelSource: 'huggingface:base_model', checkpointCandidates: [],
    });
    expect(nodeMatcherRecommendation(replaceSelectedResource({}, selected, 'lora_name'))).toBeNull();
  });
});

describe('ModelHub all-provider tab stays clickable from an unsupported-directory provider', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
  });

  it('does not disable the "全部服务商" tab when opened on a provider without a remote directory', async () => {
    const { fetchLiveModels } = await import('../services/api');
    vi.mocked(fetchLiveModels).mockResolvedValue({ civitai: [], _pagination: {} } as never);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(ModelHubModal, {
        isOpen: true,
        onClose: vi.fn(),
        onSelectModel: vi.fn(),
        onSelectLoRAWithBaseModel: vi.fn(),
        initialCategory: 'all',
        // A provider without a model directory (PROVIDERS_WITHOUT_MODEL_DIRECTORY).
        initialProvider: 'openai_compat',
      } as never));
    });
    await act(async () => { await Promise.resolve(); });
    const allTab = Array.from(container.querySelectorAll('button')).find((el) => el.textContent?.trim() === '全部服务商');
    expect(allTab).toBeDefined();
    // The "全部服务商" tab must remain enabled (not locked to disabled) so the user
    // can switch back to the aggregated overview from an unsupported-directory provider.
    expect(allTab?.disabled).toBe(false);
  });

  it('clicking the "全部服务商" tab switches away from the unsupported-directory notice', async () => {
    const { fetchLiveModels } = await import('../services/api');
    vi.mocked(fetchLiveModels).mockImplementation((async () => ({ civitai: [{ id: 'lora-x', name: 'Lora X', type: 'LORA', category: 'lora', provider: 'civitai', _sourceProvider: 'civitai', baseModel: 'SDXL 1.0' }], _pagination: {} })) as never);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(ModelHubModal, {
        isOpen: true,
        onClose: vi.fn(),
        onSelectModel: vi.fn(),
        onSelectLoRAWithBaseModel: vi.fn(),
        initialCategory: 'all',
        initialProvider: 'openai_compat',
      } as never));
    });
    await act(async () => { await Promise.resolve(); });
    // Initially the unsupported-directory notice banner should be present.
    // The banner renders friendlyProviderLabel('openai_compat') = 'OpenAI 兼容中转'
    // and the key phrase '对应目录'.
    expect(container.textContent).toContain('对应目录');
    const allTab = Array.from(container.querySelectorAll('button')).find((el) => el.textContent?.trim() === '全部服务商');
    expect(allTab?.disabled).toBe(false);
    await act(async () => { allTab?.click(); });
    await act(async () => { await Promise.resolve(); });
    // After clicking "全部服务商", the unsupported flag clears so the notice banner
    // disappears and the aggregated all-providers view is shown instead.
    expect(container.textContent).not.toContain('对应目录');
  });
});
