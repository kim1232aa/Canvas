import {describe, it, expect} from 'vitest';
import {generationReadiness} from './generationReadiness';
describe('generation button readiness', () => {
  const valid = {provider: 'huggingface', model: 'Tongyi-MAI/Z-Image-Turbo', prompt: 'test', resolution: '1024x1024 ( 1:1 )', shift: 3, seed: 42, steps: 8, randomSeed: false, galleryImages: []};
  it('allows a fully wired Space request', () => expect(generationReadiness(valid)).toBeUndefined());
  it('does not locally reject an undocumented optional control', () => expect(generationReadiness({...valid, shift: undefined})).toBeUndefined());
  it('does not use the static endpoint LoRA hint as a preflight rejection', () => expect(generationReadiness({...valid, loras: [{name: 'real-lora'}]})).toBeUndefined());
  it('blocks a cross-provider imported LoRA until its target-provider resource is explicitly resolved', () => expect(generationReadiness({...valid, loras: [{name:'source-lora.safetensors',unresolvedResource:true}]})).toContain('尚未转换'));
  it('requires a selected provider and prompt', () => {
    expect(generationReadiness({...valid, provider: ''})).toContain('服务商');
    expect(generationReadiness({...valid, prompt: ''})).toContain('提示词');
  });
});