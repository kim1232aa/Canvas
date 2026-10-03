import {describe,it,expect} from 'vitest';
import {buildTensorModelJob,tensorModelId} from './tensorModelApi';
import {buildNanoImagePayload} from './nanoImageApi';
import {BASE_MODELS} from '../constants/nodes';
import {getFieldSpec,resolveSchemaModelId} from './providerSchema';
describe('real model APIs cannot use tool / foreign resource IDs',()=>{
  it('Tensor preserves large string IDs, zero seed, LoRA weight and scheduler',()=>{
    const job=buildTensorModelJob({model:'672797109289765558',prompt:'robot',width:512,height:768,seed:0,steps:12,cfg:7,sampler_name:'Euler',scheduler:'Discrete',loras:[{name:'672390779613802167',strength:0.8,civitaiId:'123'}]},'request-1');
    expect(job.stages[0].inputInitialize).toEqual({seed:'0'});
    expect(job.stages[1].diffusion).toMatchObject({sdModel:'672797109289765558',cfgScale:7,sampler:'Euler',scheduleName:'Discrete',lora:{items:[{loraModel:'672390779613802167',weight:0.8}]}});
    expect(()=>tensorModelId('photoreal_studio_z_image')).toThrow(/工具名/);
    expect(()=>buildTensorModelJob({model:'672797109289765558',prompt:'x',width:512,height:512,loras:[{name:'foreign.safetensors',civitaiId:'672390779613802167',strength:.8}]},'x')).toThrow();
  });
  it('Tensor dropdown uses real IDs; any additional ID gets model API fields',()=>{
    expect(BASE_MODELS.filter(x=>x.provider==='tensorart').every(x=>/^\d{10,25}$/.test(x.value))).toBe(true);
    expect(resolveSchemaModelId('tensorart','1047478620018236183')).toBe('tensorart-model-api');
    expect(getFieldSpec('tensorart','tensorart-model-api','loras')?.status).toBe('supported');
  });
});
describe('Nano normalized API uses live per-model capabilities',()=>{
  const endpoint={supported_parameters:{resolutions:['1024x1024','768x1024'],max_output_images:4},capabilities:{image_to_image:false}};
  it('maps explicit dimensions; does not replace unsupported sizes or invent fields',()=>{
    expect(buildNanoImagePayload({model:'flux-schnell',prompt:'robot',width:768,height:1024,n:1},endpoint)).toEqual({model:'flux-schnell',prompt:'robot',resolution:'768x1024',n:1});
    expect(()=>buildNanoImagePayload({model:'flux-schnell',width:512,height:512},endpoint)).toThrow(/不支持/);
    expect(()=>buildNanoImagePayload({model:'flux-schnell',resolution:'1k'},endpoint)).toThrow(/官方支持值/);
    expect(()=>buildNanoImagePayload({model:'flux-schnell',seed:42},endpoint)).toThrow(/seed/);
    expect(()=>buildNanoImagePayload({model:'flux-schnell',loras:[{name:'x',strength:1}]},endpoint)).toThrow(/loras/);
  });
  it('only enables image input when that model advertises it',()=>{
    expect(()=>buildNanoImagePayload({model:'flux-schnell',image_url:'https://example.test/image.png'},endpoint)).toThrow(/图生图/);
    expect(buildNanoImagePayload({model:'image-edit',image_url:'data:image/png;base64,x'}, {...endpoint,input_reference_constraints:{max_items:16}}).input_references).toEqual([{type:'image_url',image_url:{url:'data:image/png;base64,x'}}]);
  });
});
