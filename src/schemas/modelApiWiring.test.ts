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
    expect(()=>tensorModelId('photoreal_studio_z_image')).toThrow(/接口名/);
    expect(()=>buildTensorModelJob({model:'672797109289765558',prompt:'x',width:512,height:512,loras:[{name:'foreign.safetensors',civitaiId:'672390779613802167',strength:.8}]},'x')).toThrow();
  });
  it('Tensor preserves explicit custom job fields, including an actual model override',()=>{
    const job=buildTensorModelJob({model:'672797109289765558',prompt:'robot',width:512,height:512,custom_parameters:{model:'672390779613802167',stages:[{type:'INPUT_INITIALIZE',inputInitialize:{seed:'0'}},{type:'DIFFUSION',diffusion:{sdModel:'672390779613802167',width:768,height:512,cfgScale:0,prompts:[{text:'custom'}]}}]}},'request-1');
    expect(job.stages[1].diffusion).toMatchObject({sdModel:'672390779613802167',width:768,cfgScale:0});
    expect(()=>buildTensorModelJob({model:'672797109289765558',prompt:'robot',width:512,height:512,custom_parameters:{headers:{authorization:'x'}}},'r')).toThrow();
  });
  it('Tensor dropdown uses real IDs; any additional ID gets model API fields',()=>{
    expect(BASE_MODELS.filter(x=>x.provider==='tensorart').every(x=>/^\d{10,25}$/.test(x.value))).toBe(true);
    expect(resolveSchemaModelId('tensorart','1047478620018236183')).toBe('tensorart-model-api');
    expect(getFieldSpec('tensorart','tensorart-model-api','loras')?.status).toBe('supported');
  });
});
describe('Nano normalized API uses live per-model capabilities',()=>{
  const endpoint={supported_parameters:{resolutions:['1024x1024','768x1024'],max_output_images:4},capabilities:{image_to_image:false}};
  it('maps explicit dimensions to resolution and sends any size as filled (no local refusal)',()=>{
    expect(buildNanoImagePayload({model:'flux-schnell',prompt:'robot',width:768,height:1024,n:1},endpoint).payload).toEqual({model:'flux-schnell',prompt:'robot',resolution:'768x1024',n:1});
    expect(buildNanoImagePayload({model:'flux-schnell',width:512,height:512},endpoint).payload.resolution).toBe('512x512');
    expect(buildNanoImagePayload({model:'flux-schnell',resolution:'1k'},endpoint).payload.resolution).toBe('1k');
  });
    it('undeclared seed/steps/cfg/negative are sent as filled and noted',()=>{
    const r=buildNanoImagePayload({model:'flux-schnell',prompt:'x',seed:42,negative_prompt:'blur',steps:8,cfg:3.5},endpoint);
    expect(r.payload).toMatchObject({seed:42,negative_prompt:'blur',steps:8,cfg:3.5});
    expect(r.capabilityNotes.map((n:any)=>n.field).sort()).toEqual(['cfg','negative_prompt','seed','steps']);
  });
  it('maps steps -> num_inference_steps and cfg -> guidance_scale without undeclared_sent notes when supported_parameters declares them (e.g. moss-image), including zero values',()=>{
    const mossEndpoint={
      supported_parameters:{
        output_format:['jpeg','png','webp'],
        image_size:{min_width:512,max_width:2048,multiple_of:16,default:'square_hd'},
        num_inference_steps:{min:1,max:100,default:50},
        guidance_scale:{min:0,max:10,default:3},
        enable_prompt_expansion:{default:true},
        negative_prompt:true,
        seed:true,
        resolutions:['1024x1024','512x512','1536x1024','1024x1536','1920x1072','2048x2048'],
      },
      capabilities:{image_to_image:false},
    };
    const r=buildNanoImagePayload({model:'moss-image',prompt:'refrigerator note',width:1024,height:1024,seed:42,steps:50,cfg:3,n:1},mossEndpoint);
    expect(r.payload).toEqual({
      model:'moss-image',
      prompt:'refrigerator note',
      resolution:'1024x1024',
      seed:42,
      num_inference_steps:50,
      guidance_scale:3,
      n:1,
    });
    expect(r.payload).not.toHaveProperty('steps');
    expect(r.payload).not.toHaveProperty('cfg');
    expect(r.payload).not.toHaveProperty('width');
    expect(r.payload).not.toHaveProperty('height');
    expect(r.capabilityNotes).toEqual([]);

    // Zero-value edge preservation (steps: 0, cfg: 0)
    const zeroRun=buildNanoImagePayload({model:'moss-image',prompt:'zero test',width:1024,height:1024,seed:0,steps:0,cfg:0,n:1},mossEndpoint);
    expect(zeroRun.payload).toMatchObject({
      seed:0,
      num_inference_steps:0,
      guidance_scale:0,
    });
    expect(zeroRun.payload).not.toHaveProperty('steps');
    expect(zeroRun.payload).not.toHaveProperty('cfg');
    expect(zeroRun.capabilityNotes).toEqual([]);
  });
  it('LoRA: sent as {path,scale} whether or not supported_parameters declares loras',()=>{
    expect(buildNanoImagePayload({model:'flux-schnell',prompt:'x',loras:[{name:'https://cdn.example.com/a.safetensors',strength:0.8}]},endpoint).payload.loras).toEqual([{path:'https://cdn.example.com/a.safetensors',scale:0.8}]);
    const loraEndpoint={supported_parameters:{loras:{max_items:3,item:{path:'HTTPS URL',scale:'number'}}},capabilities:{}};
    const declared=buildNanoImagePayload({model:'minimax-h3/text-to-image',prompt:'x',loras:[{path:'https://cdn.example.com/b.safetensors',strength:0.6}]},loraEndpoint);
    expect(declared.payload.loras).toEqual([{path:'https://cdn.example.com/b.safetensors',scale:0.6}]);
    expect(declared.capabilityNotes).toEqual([expect.objectContaining({field:'loras',capability:'supported'})]);
  });
  it('Nano explicit model override wins and credential overrides are rejected',()=>{
    expect(buildNanoImagePayload({model:'flux-schnell',prompt:'x',custom_parameters:{model:'custom-model'}},endpoint).payload.model).toBe('custom-model');
    expect(()=>buildNanoImagePayload({model:'flux-schnell',prompt:'x',custom_parameters:{endpoint:'https://evil.test'}},endpoint)).toThrow();
  });
  it('sends a reference image as filled even when the model metadata says image_to_image=false',()=>{
    expect(buildNanoImagePayload({model:'flux-schnell',image_url:'https://example.test/image.png'},endpoint).payload.input_references).toEqual([{type:'image_url',image_url:{url:'https://example.test/image.png'}}]);
    expect(buildNanoImagePayload({model:'image-edit',image_url:'data:image/png;base64,x'}, {...endpoint,input_reference_constraints:{max_items:16}}).payload.input_references).toEqual([{type:'image_url',image_url:{url:'data:image/png;base64,x'}}]);
  });
});
