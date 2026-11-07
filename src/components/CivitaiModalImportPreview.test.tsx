import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CivitaiModalImportPreview } from './CivitaiModalImportPreview';
import { adaptCivitaiRecipeToProvider } from '../utils/civitaiImportMap';

const AIR = 'urn:air:krea2:diffusionmodel:civitai:2732656@3072332';
const LORA_A = 'urn:air:krea2:lora:civitai:2744585@3168308';
const LORA_B = 'urn:air:krea2:lora:civitai:929497@3077110';

const imageAdaptation = adaptCivitaiRecipeToProvider(
  {
    checkpoint: AIR,
    baseModel: 'Krea 2 Turbo',
    engine: 'comfy',
    prompt: 'masterpiece, best quality, very aesthetic, ektachrome fade film, nature',
    negativePrompt: '(2d ,Illustration, drawing, cartoon, animation, anima, painting:1.4)',
    steps: 8,
    cfg: 1,
    sampler: 'euler',
    scheduler: 'simple',
    seed: 689794262,
    width: 832,
    height: 1248,
    loras: [
      { name: 'Mrpopo Anime/Art', air: LORA_A, modelId: 2744585, versionId: 3168308, strength: 1, baseModel: 'Krea 2 Turbo' },
      { name: 'Masterpiece', air: LORA_B, modelId: 929497, versionId: 3077110, strength: 0.85, baseModel: 'Krea 2' },
    ],
  },
  'civitai'
);

const preview = (props: Record<string, unknown>) =>
  renderToStaticMarkup(
    <CivitaiModalImportPreview
      selectedProvider="civitai"
      onSelectProvider={vi.fn()}
      tokenConsent={false}
      onToggleTokenConsent={vi.fn()}
      {...props}
    />
  );

describe('import preview LoRA actions (image 148140013)', () => {
  it('offers a create and a fill action for each real nonzero-strength LoRA, and shows the AIR plus 832x1248', () => {
    const html = preview({
      adaptation: imageAdaptation,
      onAddLoRANodeToCanvas: vi.fn(),
      onFillCurrentLoRANode: vi.fn(),
    });
    expect(html).toContain('data-testid="import-lora-new-node-0"');
    expect(html).toContain('data-testid="import-lora-new-node-1"');
    expect(html).toContain('data-testid="import-lora-fill-current-0"');
    expect(html).toContain('data-testid="import-lora-fill-current-1"');
    expect(html).toContain(AIR);
    expect(html).toContain(LORA_A);
    expect(html).toContain(LORA_B);
    expect(html).toContain('832');
    expect(html).toContain('1248');
    expect(html).toContain('权重: 1');
    expect(html).toContain('权重: 0.85');
    expect(html).not.toContain('data-testid="import-unresolved-checkpoint"');
  });

  it('shows the unresolved state for a bare turbo checkpoint and offers no LoRA node action', () => {
    const unresolved = adaptCivitaiRecipeToProvider(
      {
        checkpoint: 'turbo',
        baseModel: 'Krea 2 Turbo',
        loras: [{ name: 'Masterpiece', air: LORA_B, modelId: 929497, versionId: 3077110, strength: 0.85, baseModel: 'Krea 2' }],
      },
      'civitai'
    );
    const html = preview({ adaptation: unresolved, onAddLoRANodeToCanvas: vi.fn() });
    expect(html).toContain('data-testid="import-unresolved-checkpoint"');
    expect(html).toContain('data-testid="import-unresolved-original-name"');
    expect(html).toContain('来源名称：turbo');
    expect(html).toContain('未写入 ckpt_name');
    expect(html).not.toContain('import-lora-new-node-');
    expect(html).not.toContain('import-lora-fill-current-');
  });

  it('keeps the cross-provider selector and refuses a LoRA with no strength', () => {
    const noStrength = adaptCivitaiRecipeToProvider(
      { checkpoint: AIR, baseModel: 'Krea 2 Turbo', loras: [{ name: 'Masterpiece', air: LORA_B, versionId: 3077110, baseModel: 'Krea 2' }] },
      'fal'
    );
    const html = preview({
      adaptation: noStrength,
      allAdaptations: { fal: noStrength, civitai: imageAdaptation },
      selectedProvider: 'fal',
      onAddLoRANodeToCanvas: vi.fn(),
      onFillCurrentLoRANode: vi.fn(),
    });
    expect(html).toContain('data-testid="import-provider-selector"');
    expect(html).toContain('data-testid="import-provider-pill-civitai"');
    expect(html).toContain('data-testid="import-provider-pill-fal"');
    expect(html).toContain('data-testid="import-model-selector-container"');
    expect(html).not.toContain('import-lora-new-node-');
    expect(html).not.toContain('import-lora-fill-current-');
  });
});
