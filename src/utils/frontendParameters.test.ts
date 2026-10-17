import { describe, expect, it } from 'vitest';
import { spatialRequestParameters, videoDurationBounds } from './frontendParameters';
import { resolveLoraPathOrUrl } from './engineParameterNormalizer';
import { identifyArchitectureFamily, validateModelCompatibility } from './baseModelMatcher';
import type { SpatialFrame } from '../types/graph';

const frame = (params = {}, extra = {}): SpatialFrame => ({id:'f',title:'test',pos:{x:0,y:0},width:480,height:480,prompt:'orbit',negativePrompt:'',status:'idle',createdAt:0,params:{checkpoint:'explicit-model',targetProvider:'video',width:1024,height:1024,batchSize:1,denoise:0,seedControl:'fixed',loras:[],...params},...extra});

describe('explicit frontend request contracts', () => {
  it('enforces serialized model, source-chain and reference-input requirements in spatial mode',()=>{
    expect(()=>spatialRequestParameters(frame({targetProvider:'civitai',unresolvedModel:true}))).toThrow(/底模.*重新选择/);
    expect(()=>spatialRequestParameters(frame({targetProvider:'fal',executionBlockedReason:'来源执行链尚未接入'}))).toThrow(/来源执行链尚未接入/);
    expect(()=>spatialRequestParameters(frame({targetProvider:'agnes',requireReferenceImage:true},{imageUrl:'thumbnail.png'}))).toThrow(/编辑输入.*参考图/);
    expect(spatialRequestParameters(frame({targetProvider:'agnes',requireReferenceImage:true},{referenceImageUrl:'reference.png'})).image_url).toBe('reference.png');
  });
  it('honors edited params duration/aspect over legacy display values',()=>{
    const sent=spatialRequestParameters(frame({videoProvider:'fal',videoDuration:12,aspectRatio:'9:16'},{mediaType:'video',videoDuration:5,videoAspectRatio:'16:9'}));
    expect(sent.videoDuration).toBe(12);expect(sent.aspectRatio).toBe('9:16');
  });
  it('does not manufacture Gemini seed or request pixel dimensions and records retained display values',()=>{
    const sent=spatialRequestParameters(frame({targetProvider:'gemini',seedControl:'randomize',seed:0},{referenceImageUrl:'ref.png'}));
    expect(sent.width).toBeUndefined();expect(sent.height).toBeUndefined();expect(sent.seed).toBeUndefined();expect(sent.denoise).toBeUndefined();
    expect(sent.extraParams?.omissions).toEqual(expect.arrayContaining([expect.objectContaining({field:'width',value:1024}),expect.objectContaining({field:'seed',value:0}),expect.objectContaining({field:'seedControl',value:'randomize'}),expect.objectContaining({field:'denoise',value:0})]));
  });
  it('routes the video framework through an explicit provider and keeps advanced false/zero values', () => {
    const sent = spatialRequestParameters(frame({videoProvider:'fal',resolution:'720p',customParameters:'{"generate_audio":false,"cfg_scale":0}'},{imageUrl:'output.png',referenceImageUrl:'reference.png',mediaType:'video'}));
    expect(sent).toMatchObject({provider:'fal',targetProvider:'fal',image_url:'reference.png',denoise:0,extraParams:{resolution:'720p',custom_parameters:{generate_audio:false,cfg_scale:0}}});
    expect(sent.aspectRatio).toBeUndefined();
    expect(sent.videoDuration).toBeUndefined();
    expect(() => spatialRequestParameters(frame())).toThrow(/视频服务商/);
  });
  it('validates Civitai advanced objects while preserving explicit routes and unknown fields', () => {
    const advanced={unknown_flag:true,safety:false,seed:0,model:'advanced-model',loras:{'urn:air:sdxl:lora:civitai:789@123':0}};
    const sent=spatialRequestParameters(frame({targetProvider:'civitai',customParameters:JSON.stringify(advanced)}));
    expect(sent.extraParams?.custom_parameters).toEqual(advanced);
    expect(sent.model).toBe('explicit-model');expect(sent.provider).toBe('civitai');
    for(const value of ['[]','false','0','null']) expect(()=>spatialRequestParameters(frame({targetProvider:'civitai',customParameters:value}))).toThrow(/JSON 对象/);
  });
  it.each([false,true,undefined])('preserves optional SenseNova spatial booleans %j without adding them to another provider', value => {
    const source = frame({targetProvider:'sensenova',watermark:value,promptExtend:value,size:'auto'});
    const sent = spatialRequestParameters(source);
    if (value === undefined) {
      expect(sent.extraParams).not.toHaveProperty('watermark');
      expect(sent.extraParams).not.toHaveProperty('prompt_extend');
    } else {
      expect(sent.extraParams).toMatchObject({watermark:value,prompt_extend:value});
    }
    for (const targetProvider of ['agnes','fal','gemini']) {
      const other = spatialRequestParameters(frame({targetProvider,watermark:value,promptExtend:value}));
      expect(other.extraParams).not.toHaveProperty('watermark');
      expect(other.extraParams).not.toHaveProperty('prompt_extend');
    }
    expect(source.params).toMatchObject({watermark:value,promptExtend:value,size:'auto'});
  });
  it('does not reuse output or preset artwork as a generation input', () => {
    expect(spatialRequestParameters(frame({targetProvider:'fal'},{imageUrl:'previous-output.png'})).image_url).toBeUndefined();
  });
  it('keeps Civitai engine selection and quantity, and omits only conflicting Agnes dimensions transparently', () => {
    expect(spatialRequestParameters(frame({targetProvider:'civitai',civitaiEngine:'comfy',civitaiEcosystem:'other',civitaiModel:'custom',batchSize:0}))).toMatchObject({width:1024,height:1024,extraParams:{engine:'comfy',ecosystem:'other',comfyModel:'custom',quantity:0}});
    const sent = spatialRequestParameters(frame({targetProvider:'agnes',size:'2K'}));
    expect(sent.width).toBeUndefined();
    expect(sent.height).toBeUndefined();
    expect(sent.extraParams?.omissions).toEqual(expect.arrayContaining([expect.objectContaining({field:'width',value:1024}),expect.objectContaining({field:'height',value:1024})]));
  });
  it('lists unresolved resource identifiers before submitting', () => {
    expect(() => spatialRequestParameters(frame({targetProvider:'civitai',loras:[{name:'original',civitaiId:'123',unresolvedResource:true,modelStrength:0,clipStrength:0,triggerWords:''}]}))).toThrow(/123.*重新选择/);
  });
  it('uses only verified video duration bounds', () => {
    expect(videoDurationBounds('fal','fal-ai/kling-video/v3/standard/image-to-video')).toEqual({}) /* cleanup-2026-10-17: no hardcoded per-model range; Schema not loaded */;
    expect(videoDurationBounds('fal','fal-ai/wan/v2.7/image-to-video')).toEqual({}) /* cleanup-2026-10-17: no hardcoded per-model range; Schema not loaded */;
    expect(videoDurationBounds('fal','custom-video')).toEqual({});
  });
  it('does not turn a resource display name into a weight path', () => {
    const sent=spatialRequestParameters(frame({targetProvider:'fal',loras:[{name:'Display label',civitaiId:'123',modelStrength:0,clipStrength:0,triggerWords:''}]}));
    expect(sent.loras?.[0].path).toBeUndefined();
  });
  it('never manufactures a version download URL from a Civitai model identifier', () => {
    expect(resolveLoraPathOrUrl({name:'urn:air:sdxl:lora:civitai:123@456',civitaiId:'123',modelStrength:0,clipStrength:0})).toBe('urn:air:sdxl:lora:civitai:123@456');
  });
  it('does not classify arbitrary dev substrings or claim unknown families are verified compatible', () => {
    expect(identifyArchitectureFamily('custom-device-model')).toBe('unknown');
    expect(validateModelCompatibility('custom-a','custom-b').message).toMatch(/待.*验证/);
    expect(validateModelCompatibility('custom-a','custom-b')).toMatchObject({verification:'unverified'});
    expect(validateModelCompatibility('pony','SDXL 1.0').message).toMatch(/待.*验证/);
    expect(validateModelCompatibility('SDXL 1.0','FLUX.1',undefined,'fal').recommendedCheckpoint).toBeUndefined();
  });
});
