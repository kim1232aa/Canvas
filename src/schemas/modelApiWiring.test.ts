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
    expect(buildNanoImagePayload({model:'flux-schnell',prompt:'robot',width:768,height:1024,n:1},endpoint).payload).toEqual({model:'flux-schnell',prompt:'robot',resolution:'768x1024',n:1});
    expect(()=>buildNanoImagePayload({model:'flux-schnell',width:512,height:512},endpoint)).toThrow(/不支持/);
    expect(()=>buildNanoImagePayload({model:'flux-schnell',resolution:'1k'},endpoint)).toThrow(/官方支持值/);
  });
  it('undeclared parameters are unknown, not unsupported: pass through with notes, never blocked locally',()=>{
    const seed=buildNanoImagePayload({model:'flux-schnell',prompt:'x',seed:42},endpoint);
    expect(seed.payload.seed).toBe(42);
    expect(seed.capabilityNotes).toEqual([expect.objectContaining({field:'seed',capability:'unknown'})]);
    const np=buildNanoImagePayload({model:'flux-schnell',prompt:'x',negative_prompt:'blur',steps:8},endpoint);
    expect(np.payload.negative_prompt).toBe('blur');
    expect(np.payload.steps).toBe(8);
    expect(np.capabilityNotes.map((n:any)=>n.field)).toEqual(['negative_prompt','steps']);
  });
  it('LoRA follows declared metadata: passthrough when undeclared, {path,scale} when declared',()=>{
    const undeclared=buildNanoImagePayload({model:'flux-schnell',prompt:'x',loras:[{name:'https://cdn.example.com/a.safetensors',strength:0.8}]},endpoint);
    expect(undeclared.payload.loras).toEqual([{path:'https://cdn.example.com/a.safetensors',scale:0.8}]);
    expect(undeclared.capabilityNotes).toEqual([expect.objectContaining({field:'loras',capability:'unknown'})]);
    const loraEndpoint={supported_parameters:{loras:{max_items:3,item:{path:'HTTPS URL',scale:'number'}}},capabilities:{}};
    const declared=buildNanoImagePayload({model:'minimax-h3/text-to-image',prompt:'x',loras:[{path:'https://cdn.example.com/b.safetensors',strength:0.6}]},loraEndpoint);
    expect(declared.payload.loras).toEqual([{path:'https://cdn.example.com/b.safetensors',scale:0.6}]);
    expect(declared.capabilityNotes).toEqual([expect.objectContaining({field:'loras',capability:'supported'})]);
    expect(()=>buildNanoImagePayload({model:'minimax-h3/text-to-image',prompt:'x',loras:[{name:'local-file',strength:1}]},loraEndpoint)).toThrow(/HTTPS/);
  });
  it('only enables image input when that model advertises it',()=>{
    expect(()=>buildNanoImagePayload({model:'flux-schnell',image_url:'https://example.test/image.png'},endpoint)).toThrow(/图生图/);
    expect(buildNanoImagePayload({model:'image-edit',image_url:'data:image/png;base64,x'}, {...endpoint,input_reference_constraints:{max_items:16}}).payload.input_references).toEqual([{type:'image_url',image_url:{url:'data:image/png;base64,x'}}]);
  });
});
