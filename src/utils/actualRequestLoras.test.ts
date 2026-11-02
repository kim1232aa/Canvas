import { describe, it, expect } from 'vitest';
import { countActualRequestLoras } from './actualRequestLoras';

describe('countActualRequestLoras — string identity fields', () => {
  it('ModelsLab: non-empty lora_model string + lora_strength number ⇒ 1', () => {
    expect(
      countActualRequestLoras({
        model_id: 'tamarin-xl-v1',
        prompt: 'cake',
        lora_model: 'xl-realistic-cake-art-sty',
        lora_strength: 0.45,
      }),
    ).toBe(1);
  });

  it('ModelsLab: comma-separated lora_model ⇒ count parts', () => {
    expect(
      countActualRequestLoras({
        lora_model: 'xl-realistic-cake-art-sty,another-lora',
        lora_strength: '0.45,0.3',
      }),
    ).toBe(2);
  });

  it('Replicate: lora_weights string + lora_scale ⇒ 1 (scale not counted)', () => {
    expect(
      countActualRequestLoras({
        prompt: 'portrait',
        lora_weights: 'https://example.com/lora.safetensors',
        lora_scale: 0.8,
      }),
    ).toBe(1);
  });

  it('empty loras array ⇒ 0', () => {
    expect(countActualRequestLoras({ loras: [], prompt: 'x' })).toBe(0);
  });

  it('strength-only keys never count as LoRA identity', () => {
    expect(countActualRequestLoras({ lora_strength: 0.45, prompt: 'x' })).toBe(0);
    expect(countActualRequestLoras({ lora_scale: 0.8 })).toBe(0);
    expect(countActualRequestLoras({ lora_strength: '0.45' })).toBe(0);
    expect(countActualRequestLoras({ lora_scale: '0.9' })).toBe(0);
  });

  it('empty / whitespace lora_model ⇒ 0', () => {
    expect(countActualRequestLoras({ lora_model: '', lora_strength: 0.5 })).toBe(0);
    expect(countActualRequestLoras({ lora_model: '   ', lora_strength: 0.5 })).toBe(0);
  });

  it('keeps array / object-map / nested behavior', () => {
    expect(countActualRequestLoras({ parameters: { loras: [{ path: 'a' }] } })).toBe(1);
    expect(countActualRequestLoras({ parameters: { image_loras: [{ path: 'x' }, { path: 'y' }] } })).toBe(2);
    expect(
      countActualRequestLoras({
        parameters: { loras: { 'org/lora-a': 1 } },
      }),
    ).toBe(1);
    expect(countActualRequestLoras({ parameters: { prompt: 'p' }, mapping: [{ loras: [1] }] })).toBe(0);
  });
});
