import { describe, expect, it } from 'vitest';
import { isTensorArtLoraType, normalizeTensorArtModelInfo } from './tensorArtModelInfo';

describe('normalizeTensorArtModelInfo', () => {
  it('unwraps nested model and maps modelType LORA to type/category', () => {
    const out = normalizeTensorArtModelInfo({
      model: {
        id: '661652545330040294',
        name: ' v1.0',
        baseModel: 'SD 1.5',
        modelType: 'LORA',
        triggerWords: 'booba',
      },
      executionTrace: [{ provider: 'tensorart' }],
    });
    expect(out).toMatchObject({
      id: '661652545330040294',
      name: ' v1.0',
      baseModel: 'SD 1.5',
      modelType: 'LORA',
      type: 'LORA',
      category: 'LoRA',
    });
    expect(out.trainedWords).toEqual(['booba']);
    expect(isTensorArtLoraType(out)).toBe(true);
  });

  it('recognizes lowercase / mixed-case LoRA labels', () => {
    for (const label of ['lora', 'LoRA', 'LOCON', 'lycoris', 'Dora']) {
      const out = normalizeTensorArtModelInfo({ model: { id: '1', modelType: label, baseModel: 'SD 1.5' } });
      expect(isTensorArtLoraType(out)).toBe(true);
      expect(out.category).toBe('LoRA');
    }
  });

  it('maps CHECKPOINT the same way for base-model selection', () => {
    const out = normalizeTensorArtModelInfo({
      model: { id: '613045163490732233', name: 'ckpt', baseModel: 'SD 1.5', modelType: 'CHECKPOINT' },
    });
    expect(out).toMatchObject({
      id: '613045163490732233',
      type: 'CHECKPOINT',
      category: 'Checkpoint',
      baseModel: 'SD 1.5',
    });
    expect(isTensorArtLoraType(out)).toBe(false);
  });

  it('passes through an already-flat shape', () => {
    const out = normalizeTensorArtModelInfo({
      id: '9',
      type: 'LORA',
      category: 'LoRA',
      baseModel: 'SDXL 1.0',
      trainedWords: ['a'],
    });
    expect(out).toMatchObject({ id: '9', type: 'LORA', category: 'LoRA', baseModel: 'SDXL 1.0' });
    expect(out.trainedWords).toEqual(['a']);
  });
});
