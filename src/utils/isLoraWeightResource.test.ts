import { describe, expect, it } from 'vitest';
import {
  isLoraWeightResource,
  isModelEndpointCatalogProvider,
  normalizeProviderKey,
} from './isLoraWeightResource';
import { readCheckpointCatalog } from './modelCatalog';
import { normalizeSchemaProviderItems } from '../server/schemaProviders';

describe('isLoraWeightResource — Fal gen endpoints vs LoRA weights', () => {
  it('normalizes Fal.ai / fal-ai provider keys as endpoint catalogs', () => {
    expect(normalizeProviderKey('Fal.ai')).toBe('fal');
    expect(normalizeProviderKey('fal-ai')).toBe('falai');
    expect(isModelEndpointCatalogProvider('Fal.ai')).toBe(true);
    expect(isModelEndpointCatalogProvider('fal')).toBe(true);
    expect(isModelEndpointCatalogProvider('huggingface')).toBe(false);
    expect(isModelEndpointCatalogProvider('tensorart')).toBe(false);
  });

  it('keeps fal-ai/krea-2/turbo/lora as Checkpoint / NOT LoRA weight', () => {
    const item = {
      id: 'fal-ai/krea-2/turbo/lora',
      name: 'Krea 2 Turbo LoRA',
      type: 'Checkpoint',
      category: 'Checkpoint',
      provider: 'Fal.ai',
      resourceKind: 'model-endpoint',
    };
    expect(isLoraWeightResource(item, 'fal')).toBe(false);
    expect(isLoraWeightResource(item, 'Fal.ai')).toBe(false);
    // Even if a buggy catalog wrongly stamped type=LORA, Fal stays non-weight:
    expect(
      isLoraWeightResource(
        { id: 'fal-ai/krea-2/turbo/lora', type: 'LORA', category: 'LoRA', provider: 'Fal.ai' },
        'fal',
      ),
    ).toBe(false);
  });

  it('keeps fal-ai/flux-lora as Checkpoint / NOT LoRA weight', () => {
    expect(
      isLoraWeightResource(
        { id: 'fal-ai/flux-lora', name: 'Flux LoRA', type: 'Checkpoint', category: 'Checkpoint' },
        'fal',
      ),
    ).toBe(false);
    expect(
      isLoraWeightResource({ id: 'fal-ai/flux-lora', type: 'LORA', category: 'LoRA' }, 'Fal.ai'),
    ).toBe(false);
  });

  it('treats real LoRA type/category as weight', () => {
    expect(isLoraWeightResource({ id: '123', type: 'LORA', category: 'LoRA' }, 'civitai')).toBe(true);
    expect(isLoraWeightResource({ id: 'x', type: 'locon', category: 'LoRA' }, 'civitai')).toBe(true);
    expect(isLoraWeightResource({ id: 'x', type: 'lycoris' }, 'tensorart')).toBe(true);
    expect(isLoraWeightResource({ id: 'x', type: 'dora' }, 'huggingface')).toBe(true);
  });

  it('treats HF / TensorArt verified type lora as weight; Checkpoint stays checkpoint', () => {
    expect(
      isLoraWeightResource(
        { id: 'owner/flux-style-lora', type: 'LORA', category: 'LoRA', tags: ['lora'] },
        'huggingface',
      ),
    ).toBe(true);
    expect(
      isLoraWeightResource(
        { id: '672390779613802167', type: 'LORA', category: 'LoRA' },
        'tensorart',
      ),
    ).toBe(true);
    expect(
      isLoraWeightResource(
        { id: 'stabilityai/stable-diffusion-xl-base-1.0', type: 'Checkpoint', category: 'Checkpoint' },
        'huggingface',
      ),
    ).toBe(false);
  });

  it('honours resourceKind adapter vs model-endpoint', () => {
    expect(
      isLoraWeightResource(
        { id: 'krea2-detail-enhancer', resourceKind: 'adapter', type: 'LoRA', category: 'LoRA' },
        'sogni',
      ),
    ).toBe(true);
    expect(
      isLoraWeightResource(
        { id: 'krea-2-turbo', resourceKind: 'model-endpoint', type: 'Checkpoint' },
        'sogni',
      ),
    ).toBe(false);
  });

  it('readCheckpointCatalog keeps Fal-style Checkpoint rows whose id contains lora', () => {
    const result = readCheckpointCatalog(
      {
        fal: [
          { id: 'fal-ai/krea-2/turbo/lora', name: 'Krea 2 Turbo LoRA', type: 'Checkpoint', category: 'Checkpoint' },
          { id: 'fal-ai/flux-lora', name: 'Flux LoRA', type: 'Checkpoint', category: 'Checkpoint' },
          { id: 'fal-ai/flux/schnell', name: 'Flux Schnell', type: 'Checkpoint', category: 'Checkpoint' },
          { id: 'should-drop', name: 'adapter', type: 'LORA', category: 'LoRA' },
        ],
      },
      'fal',
    );
    expect(result.options.map((o) => o.value)).toEqual([
      'fal-ai/krea-2/turbo/lora',
      'fal-ai/flux-lora',
      'fal-ai/flux/schnell',
    ]);
  });

  it('normalizeSchemaProviderItems wantsLora=false keeps endpoint ids that contain lora as Checkpoint', () => {
    const items = normalizeSchemaProviderItems(
      'muapi',
      [
        {
          name: 'flux-dev-lora',
          endpoint_url: 'flux_dev_lora_image',
          group_of: 'image',
          category: 'text-to-image',
        },
      ],
      { lora: false, sourceUrl: 'https://api.muapi.ai/api/v1/models', category: 'checkpoint' },
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'flux_dev_lora_image',
      category: 'Checkpoint',
      type: 'Checkpoint',
      resourceKind: 'model-endpoint',
    });
    expect(isLoraWeightResource(items[0], 'muapi')).toBe(false);
  });
});
