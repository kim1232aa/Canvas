import {it,expect,vi} from 'vitest';
import {replaceSelectedResource, selectionFromExplicitLoraUrl, selectionFromMetadata,verifyCivitaiSelection} from './resourceSelection';
import { assertExplicitLoraStrengths, MISSING_LORA_STRENGTH_MSG } from './loraStrength';
import { generationReadiness } from './generationReadiness';
it('manual AIR metadata verification invokes a real selection helper before clearing markers',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=vi.fn(async()=>new Response(JSON.stringify({id:456,modelId:123,model:{name:'real version shape',type:'LORA'},air:'urn:air:sdxl:lora:civitai:123@456',files:[]})));
 const onSelect=vi.fn((selection)=>replaceSelectedResource({import_unresolved_resource:true,downloadUrl:'old',civitaiId:'old'},selection,'lora_name'));
 try {
   onSelect(await verifyCivitaiSelection('123@456','lora'));
   expect(onSelect.mock.results[0].value.import_unresolved_resource).toBeUndefined();
   await expect(verifyCivitaiSelection('999@456','lora')).rejects.toThrow(/不一致/);
 }finally{globalThis.fetch=original;}
});
it('atomically replaces verified identity and clears stale unresolved markers only after metadata validation',()=>{
 const previous={lora_name:'old',civitai_id:'old',civitaiId:'old',resource_source:'old-source',resource_kind:'checkpoint',download_url:'old-url',import_unresolved_resource:true,unresolvedResource:true,import_unresolved_reason:'old-reason'};
 const selected=selectionFromMetadata('civitai',{id:123,type:'LORA',modelVersions:[{id:456,air:'urn:air:sdxl:lora:civitai:123@456',files:[{primary:true,downloadUrl:'https://example.test/new.safetensors'}]}]},'lora');
 const next=replaceSelectedResource(previous,selected,'lora_name');
 expect(next).toMatchObject({lora_name:'urn:air:sdxl:lora:civitai:123@456',civitai_id:'urn:air:sdxl:lora:civitai:123@456',resource_source:'civitai',resource_kind:'lora',download_url:'https://example.test/new.safetensors',resourceVerified:true});
 for(const key of ['civitaiId','import_unresolved_resource','unresolvedResource','import_unresolved_reason'])expect(next).not.toHaveProperty(key);
 expect(replaceSelectedResource(previous,{name:'manual-name',resourceVerified:false},'lora_name').import_unresolved_resource).toBe(true);
});
it('requires an explicit version when a model id has multiple versions',()=>{
 expect(()=>selectionFromMetadata('civitai',{id:705606,type:'Checkpoint',modelVersions:[{id:2787743,air:'urn:air:flux1:checkpoint:civitai:705606@2787743'},{id:2855460,air:'urn:air:flux1:checkpoint:civitai:705606@2855460'}]},'checkpoint')).toThrow(/version|版本/);
});
it('preserves and verifies AIR file selectors only when metadata contains the file',()=>{
 const metadata={id:285546,modelId:234556,model:{name:'Lora',type:'LORA'},air:'urn:air:sdxl:lora:civitai:234556@285546',files:[{id:999999,primary:true,downloadUrl:'https://example.test/f.safetensors'}]};
 expect(selectionFromMetadata('civitai',metadata,'lora')).toMatchObject({name:'urn:air:sdxl:lora:civitai:234556@285546'});
 expect(()=>selectionFromMetadata('civitai',{...metadata,air:'urn:air:sdxl:lora:civitai:234556@285546+123456'},'lora')).toThrow(/file|文件/);
 expect(replaceSelectedResource({civitai_id:'old'}, {name:'new-name',resourceVerified:false},'lora_name')).toMatchObject({lora_name:'new-name',import_unresolved_resource:true});
});
it('rejects metadata of the wrong resource kind and preserves canonical AIR types',()=>{
 expect(()=>selectionFromMetadata('civitai',{id:123,type:'Checkpoint',modelVersions:[{id:456,air:'urn:air:sdxl:checkpoint:civitai:123@456'}]},'lora')).toThrow(/资源类型/);
 expect(selectionFromMetadata('civitai',{id:123,type:'LORA',air:'urn:air:sdxl:lycoris:civitai:123@456'},'lora').name).toBe('urn:air:sdxl:lycoris:civitai:123@456');
 expect(()=>selectionFromMetadata('civitai',{id:123,type:'LORA'},'lora')).toThrow(/标识/);
});
it('does not accept a public model AIR when multiple versions exist',()=>{
 expect(()=>selectionFromMetadata('civitai',{id:234556,type:'LORA',air:'urn:air:sdxl:lora:civitai:234556@285546',modelVersions:[{id:285546,air:'urn:air:sdxl:lora:civitai:234556@285546'},{id:285547,air:'urn:air:sdxl:lora:civitai:234556@285547'}]},'lora')).toThrow(/version|版本/);
});
it('uses top-level modelId and version id for version metadata without AIR',()=>{
 expect(selectionFromMetadata('civitai',{id:285546,modelId:234556,model:{type:'Checkpoint'},files:[]},'checkpoint').name).toBe('234556@285546');
});
it('preserves a requested AIR file selector and accepts its format suffix only when verified',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=vi.fn(async()=>new Response(JSON.stringify({id:285546,modelId:234556,model:{type:'LORA'},air:'urn:air:sdxl:lora:civitai:234556@285546',files:[{id:999999,name:'adapter.safetensors',metadata:{format:'SafeTensor'}}]})));
 try {
  expect((await verifyCivitaiSelection('urn:air:sdxl:lora:civitai:234556@285546+999999.safetensors','lora')).name).toBe('urn:air:sdxl:lora:civitai:234556@285546+999999.safetensors');
  await expect(verifyCivitaiSelection('urn:air:sdxl:lora:civitai:234556@285546+123456.safetensors','lora')).rejects.toThrow(/file|文件/);
 } finally { globalThis.fetch=original; }
});
const publicVersion={id:456,modelId:123,model:{name:'Public adapter',type:'LORA'},air:'urn:air:sdxl:lora:civitai:123@456',files:[{id:999,name:'adapter.safetensors',primary:true,metadata:{format:'SafeTensor'},downloadUrl:'https://example.test/adapter.safetensors'}]};
it.each(['urn:air:','air:',''])('canonicalizes %s AIR while preserving the verified selector and format',async(prefix)=>{
 const original=globalThis.fetch;
 globalThis.fetch=vi.fn(async()=>new Response(JSON.stringify(publicVersion)));
 try {
  const selection=await verifyCivitaiSelection(`${prefix}sdxl:lora:civitai:123@456+999.safetensor`,'lora');
  expect(selection).toMatchObject({name:'urn:air:sdxl:lora:civitai:123@456+999.safetensor',resourceVerified:true,downloadUrl:publicVersion.files[0].downloadUrl});
 }finally{globalThis.fetch=original;}
});
it.each(['air:sdxl:lora:civitai:124@456+999.safetensor','sdxl:lora:civitai:123@457+999.safetensor','air:flux1:lora:civitai:123@456+999.safetensor','air:sdxl:lora:civitai:123@456+998.safetensor','air:sdxl:lora:civitai:123@456+999.ckpt','air:sdxl:lora:civitai:123@456+999.arbitrary'])('rejects mismatched identity, selector or format: %s',async(raw)=>{
 const original=globalThis.fetch;
 globalThis.fetch=vi.fn(async()=>new Response(JSON.stringify(publicVersion)));
 try {await expect(verifyCivitaiSelection(raw,'lora')).rejects.toThrow(/不一致|未.*核实/);}finally{globalThis.fetch=original;}
});
it('matches file names exactly, not by suffix, and retains the complete file name',()=>{
 expect(selectionFromMetadata('civitai',publicVersion,'lora','air:sdxl:lora:civitai:123@456+adapter.safetensors')).toMatchObject({name:'urn:air:sdxl:lora:civitai:123@456+adapter.safetensors',downloadUrl:publicVersion.files[0].downloadUrl});
 expect(()=>selectionFromMetadata('civitai',publicVersion,'lora','air:sdxl:lora:civitai:123@456+apter.safetensors')).toThrow(/file|文件/);
});
it('does not mark an absent or conflicting file format as verified or discard the suffix',()=>{
 for(const files of [[{id:999,name:'adapter.safetensors'}],[{id:999,name:'adapter.ckpt',metadata:{format:'SafeTensor'}}]]){
  expect(()=>selectionFromMetadata('civitai',{...publicVersion,files},'lora','urn:air:sdxl:lora:civitai:123@456+999.safetensor')).toThrow(/format.*未.*核实/);
 }
 expect(()=>selectionFromMetadata('civitai',publicVersion,'lora','urn:air:sdxl:lora:civitai:123@456.ckpt')).toThrow(/format.*未.*核实/);
 expect(selectionFromMetadata('civitai',publicVersion,'lora','urn:air:sdxl:lora:civitai:123@456.safetensor').name).toBe('urn:air:sdxl:lora:civitai:123@456.safetensor');
});
it('does not choose latest for an unversioned AIR and requires metadata AIR for manual identity',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=vi.fn(async()=>new Response(JSON.stringify({...publicVersion,air:undefined})));
 try {
  await expect(verifyCivitaiSelection('air:sdxl:lora:civitai:123','lora')).rejects.toThrow(/完整 AIR/);
  await expect(verifyCivitaiSelection('air:sdxl:lora:civitai:123@456+999.safetensor','lora')).rejects.toThrow(/未.*核实/);
 }finally{globalThis.fetch=original;}
});
it('rejects nonempty malformed metadata AIR instead of verifying its raw model type',async()=>{
 const original=globalThis.fetch;
 const metadata={...publicVersion,air:'urn:air:sdxl:lora:civitai:123@456.safetensor.extra'};
 globalThis.fetch=vi.fn(async()=>new Response(JSON.stringify(metadata)));
 try {
  expect(()=>selectionFromMetadata('civitai',metadata,'lora')).toThrow(/AIR.*未.*核实/);
  await expect(verifyCivitaiSelection('123@456','lora')).rejects.toThrow(/AIR.*未.*核实/);
 }finally{globalThis.fetch=original;}
});
it('uses parent model id and the only version id in the official model response without AIR',async()=>{
 const metadata={id:123,name:'Public adapter',type:'LORA',modelVersions:[{id:456,baseModel:'SDXL 1.0',files:publicVersion.files}]};
 expect(selectionFromMetadata('civitai',metadata,'lora')).toMatchObject({name:'123@456',civitaiId:'123@456',resourceVerified:true,baseModel:'SDXL 1.0'});
 const original=globalThis.fetch;
 globalThis.fetch=vi.fn(async()=>new Response(JSON.stringify(metadata)));
 try {expect((await verifyCivitaiSelection('123','lora')).name).toBe('123@456');}finally{globalThis.fetch=original;}
 expect(()=>selectionFromMetadata('civitai',{...metadata,modelVersions:[...metadata.modelVersions,{id:457}]},'lora')).toThrow(/多个版本/);
});
it('does not verify embeddings as checkpoints',()=>{
 expect(()=>selectionFromMetadata('civitai',{id:285546,modelId:234556,model:{type:'TextualInversion'},air:'urn:air:sdxl:embedding:civitai:234556@285546'},'checkpoint')).toThrow(/资源类型/);
});
it('clears old verified markers when a replacement is unverified',()=>{
 const next=replaceSelectedResource({resource_source:'civitai',resource_kind:'lora',resourceVerified:true,download_url:'old',civitai_id:'old'}, {name:'new',resourceVerified:false},'lora_name');
 expect(next).toMatchObject({lora_name:'new',resourceVerified:false,import_unresolved_resource:true});
 expect(next).not.toHaveProperty('resource_source');
 expect(next).not.toHaveProperty('resource_kind');
 expect(next).not.toHaveProperty('download_url');
});

it('verifies catalog Civitai model with multiple versions only when explicit version is provided',()=>{
 const catalogItem = {
   id: 101055,
   name: 'SDXL 1.0 Base',
   provider: 'Civitai',
   _sourceProvider: 'civitai',
   type: 'Checkpoint',
   category: 'Checkpoint',
   modelVersions: [
     { id: 128078, baseModel: 'SDXL 1.0', files: [{ primary: true, downloadUrl: 'https://example.com/sdxl.safetensors' }] },
     { id: 128079, baseModel: 'SDXL 1.0' },
   ],
 };
 expect(()=>selectionFromMetadata('civitai',catalogItem,'checkpoint')).toThrow(/version|版本/);
 const sel = selectionFromMetadata('civitai', {...catalogItem,versionId:128078}, 'checkpoint');
 expect(sel.resourceVerified).toBe(true);
 expect(sel.name).toBe('101055@128078');

 const prevNodeValues = { ckpt_name: 'old', import_unresolved_resource: true, unresolvedResource: true };
 const updated = replaceSelectedResource(prevNodeValues, sel, 'ckpt_name');
 expect(updated.ckpt_name).toBe('101055@128078');
 expect(updated.resourceVerified).toBe(true);
 expect(updated.import_unresolved_resource).toBeUndefined();
 expect(updated.unresolvedResource).toBeUndefined();
});

it('verifies catalog Replicate model and sets resourceVerified true cleanly',()=>{
 const replicateCatalogItem = {
   id: 'black-forest-labs/flux-schnell',
   name: 'FLUX.1 [schnell]',
   provider: 'replicate',
   _sourceProvider: 'replicate',
   category: 'checkpoint',
   fromCatalog: true,
 };
 const sel = selectionFromMetadata('replicate', replicateCatalogItem, 'checkpoint');
 expect(sel.resourceVerified).toBe(true);
 expect(sel.name).toBe('black-forest-labs/flux-schnell');
 expect(sel.provider).toBe('replicate');

 const prevNodeValues = { model: 'old', import_unresolved_resource: true, unresolvedResource: true };
 const updated = replaceSelectedResource(prevNodeValues, sel, 'model');
 expect(updated.model).toBe('black-forest-labs/flux-schnell');
 expect(updated.resourceVerified).toBe(true);
 expect(updated.import_unresolved_resource).toBeUndefined();
 expect(updated.unresolvedResource).toBeUndefined();
});

const HF_LORA_URL = 'https://huggingface.co/Comfy-Org/Krea-2/resolve/main/loras/krea2_darkbrush.safetensors';

it('Hub paste of HTTPS LoRA weight URL is executable — not forced unresolved', () => {
  const selection = selectionFromExplicitLoraUrl('wavespeed', HF_LORA_URL);
  expect(selection).toMatchObject({
    name: HF_LORA_URL,
    downloadUrl: HF_LORA_URL,
    provider: 'wavespeed',
    resourceVerified: true,
    resource_kind: 'lora',
  });
  // Never invent strength on Hub attach
  expect(selection.modelStrength).toBeUndefined();
  expect(selection.clipStrength).toBeUndefined();

  const next = replaceSelectedResource(
    { import_unresolved_resource: true, unresolvedResource: true, lora_name: 'old' },
    selection,
    'lora_name',
  );
  expect(next.import_unresolved_resource).toBeUndefined();
  expect(next.unresolvedResource).toBeUndefined();
  expect(next).toMatchObject({
    lora_name: HF_LORA_URL,
    download_url: HF_LORA_URL,
    resourceVerified: true,
    resource_source: 'wavespeed',
    resource_kind: 'lora',
  });
  expect(generationReadiness({
    provider: 'wavespeed',
    model: 'wavespeed-ai/krea-v2/turbo-lora',
    prompt: 'test',
    loras: [{ name: next.lora_name, downloadUrl: next.download_url, unresolvedResource: next.unresolvedResource }],
  })).toBeUndefined();
});

it('HTTPS name alone (legacy Hub paste without resourceVerified) is not forced unresolved', () => {
  const next = replaceSelectedResource({}, { name: HF_LORA_URL, provider: 'fal' }, 'lora_name');
  expect(next.import_unresolved_resource).toBeUndefined();
  expect(next.unresolvedResource).toBeUndefined();
  expect(next.download_url).toBe(HF_LORA_URL);
  expect(next.resourceVerified).toBe(true);
});

it('non-URL placeholder names remain unresolved; empty strength still refused without inventing 0.8', () => {
  const next = replaceSelectedResource({}, { name: 'some-unverified-lora', resourceVerified: false }, 'lora_name');
  expect(next.import_unresolved_resource).toBe(true);
  expect(next.unresolvedResource).toBe(true);
  expect(generationReadiness({
    provider: 'wavespeed',
    model: 'wavespeed-ai/krea-v2/turbo-lora',
    prompt: 'test',
    loras: [{ name: next.lora_name, unresolvedResource: true }],
  })).toContain('尚未转换');

  const hubAttach = selectionFromExplicitLoraUrl('wavespeed', HF_LORA_URL);
  expect(() => assertExplicitLoraStrengths([{ name: hubAttach.name }])).toThrow(MISSING_LORA_STRENGTH_MSG);
  expect(() => assertExplicitLoraStrengths([{ name: hubAttach.name, modelStrength: 0.75 }])).not.toThrow();
  expect(hubAttach).not.toHaveProperty('modelStrength', 0.8);
});

it('selectionFromExplicitLoraUrl refuses provider=all and non-URL input', () => {
  expect(() => selectionFromExplicitLoraUrl('all', HF_LORA_URL)).toThrow(/供应商/);
  expect(() => selectionFromExplicitLoraUrl('wavespeed', 'owner/repo')).toThrow(/HTTP/);
});
