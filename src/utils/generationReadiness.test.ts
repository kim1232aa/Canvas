import {describe, it, expect} from 'vitest';
import {generationReadiness} from './generationReadiness';
describe('generation button readiness', () => {
  const valid = {provider: 'huggingface', model: 'Tongyi-MAI/Z-Image-Turbo', prompt: 'test', resolution: '1024x1024 ( 1:1 )', shift: 3, seed: 42, steps: 8, randomSeed: false, galleryImages: []};
  it('allows a fully wired Space request', () => expect(generationReadiness(valid)).toBeUndefined());
  it('explains a missing supported control', () => expect(generationReadiness({...valid, shift: undefined})).toContain('shift'));
  it('does not silently remove a selected unsupported LoRA', () => expect(generationReadiness({...valid, loras: [{name: 'real-lora'}]})).toContain('不支持 LoRA'));
  it('requires a selected provider and prompt', () => {
    expect(generationReadiness({...valid, provider: ''})).toContain('服务商');
    expect(generationReadiness({...valid, prompt: ''})).toContain('提示词');
  });
});
