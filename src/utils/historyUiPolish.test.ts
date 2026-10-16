import { describe, it, expect } from 'vitest';
import { canonicalProviderLabel, PROVIDER_TITLE_LABEL } from './providerLabels';
import { resolveHistoryParameters, historyParameterSourceLabel } from './historyParameters';
import { buildFailedAttemptHistoryItem } from '../server/failedAttemptHistory';

// Live AIMLAPI docs-json?model=alibaba/z-image-turbo-lora request properties (fetched 2026-10-15).
const AIML_FIELDS = ['acceleration','enable_prompt_expansion','enable_safety_checker','image_size','loras','model','num_images','num_inference_steps','output_format','prompt','provider','seed'];

describe('canonicalProviderLabel', () => {
  it.each(['openworks','Tensor.Art (openworks)','Tensor.Art (OpenWorks)','tensor.art openworks'])('%s → config label', (v) =>
    expect(canonicalProviderLabel(v)).toBe(PROVIDER_TITLE_LABEL.openworks));
  it('config openworks label is Tensor.Art OpenWorks', () => expect(PROVIDER_TITLE_LABEL.openworks).toBe('Tensor.Art OpenWorks'));
  it('legacy ModelScope label maps to config', () => expect(canonicalProviderLabel('ModelScope CN (魔搭社区)')).toBe(PROVIDER_TITLE_LABEL.modelscope));
  it('unknown passes verbatim', () => expect(canonicalProviderLabel('Foo X')).toBe('Foo X'));
});

describe('unsupported vs unsent (schema-driven)', () => {
  const base = (schemaFields?: string[]) => ({ id:'f', status:'failed', url:'', provider:'aimlapi', model:'alibaba/z-image-turbo-lora', loras:[],
    requestMetadata:{ actualRequest:{ endpoint:'x', parameters:{ prompt:'p', seed:1, num_inference_steps:8 }, ...(schemaFields?{schemaFields}:{}) } } } as any);
  it('fields absent from Schema → 该端点不支持', () => {
    const r = resolveHistoryParameters(base(AIML_FIELDS));
    for (const k of ['cfg','sampler','scheduler','negativePrompt'] as const) {
      if (!(k in r)) continue;
      expect(historyParameterSourceLabel(r[k].source)).toBe('该端点不支持 · 未发送') // clean-1029 #5;
    }
    expect(r.cfg.source).toBe('unsupported');
  });
  it('declared in Schema but not in actualRequest → 未发送', () => {
    const r = resolveHistoryParameters(base([...AIML_FIELDS,'guidance_scale','negative_prompt']));
    expect(historyParameterSourceLabel(r.cfg.source)).toBe('未发送');
  });
  it('failed attempt keeps route schemaFields', () => {
    const item = buildFailedAttemptHistoryItem({ route:'/r', traces:[], submissions:[{endpoint:'e',parameters:{prompt:'p'},status:403}] }, {}, 403, { actualRequest:{ schemaFields: AIML_FIELDS } });
    expect(item!.requestMetadata.actualRequest.schemaFields).toEqual(AIML_FIELDS);
  });
});
