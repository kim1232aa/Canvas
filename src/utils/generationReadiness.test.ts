import {describe, it, expect} from 'vitest';
import {generationReadiness} from './generationReadiness';
describe('generation button readiness', () => {
  const valid = {provider: 'huggingface', model: 'Tongyi-MAI/Z-Image-Turbo', prompt: 'test', resolution: '1024x1024 ( 1:1 )', shift: 3, seed: 42, steps: 8, randomSeed: false, galleryImages: []};
  it('prioritizes serialized blocking reasons and required reference, allows unresolved model',()=>{
    expect(generationReadiness({...valid,executionBlockedReason:'来源执行链尚未接入'})).toBe('来源执行链尚未接入');
    expect(generationReadiness({...valid,unresolvedModel:true})).toBeUndefined();
    expect(generationReadiness({...valid,requireReferenceImage:true})).toContain('编辑输入');
  });
  it('allows a fully wired Space request', () => expect(generationReadiness(valid)).toBeUndefined());
  it('does not locally reject an undocumented optional control', () => expect(generationReadiness({...valid, shift: undefined})).toBeUndefined());
  it('does not use the static endpoint LoRA hint as a preflight rejection', () => expect(generationReadiness({...valid, loras: [{name: 'real-lora'}]})).toBeUndefined());
  it('blocks a cross-provider imported LoRA until its target-provider resource is explicitly resolved', () => expect(generationReadiness({...valid, loras: [{name:'source-lora.safetensors',unresolvedResource:true}]})).toContain('尚未转换'));
  it('requires a selected provider and allows empty prompt', () => {
    expect(generationReadiness({...valid, provider: ''})).toContain('服务商');
    expect(generationReadiness({...valid, prompt: ''})).toBeUndefined();
  });
  it('pendingRecipe does not append 请填写提示词 when prompt is missing', () => {
    const lora = '官方要真 LoRA 地址（训练任务返回的那种），配方里还没有；载入后挂上再运行。';
    expect(generationReadiness({...valid, executionBlockedReason: lora, prompt: ''})).toBe(lora);
    expect(generationReadiness({...valid, executionBlockedReason: lora, prompt: 'cat'})).toBe(lora);
  });
  it('allows tensorart with valid model and prompt without local offline block', () => {
    expect(generationReadiness({ provider: 'tensorart', model: '613045163490732233', prompt: '1girl' })).toBeUndefined();
  });
});
