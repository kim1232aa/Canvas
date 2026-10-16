import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 return {
  ...actual,
  useState:(value:any)=>React.useState(value),
  useEffect:(fn:any,deps:any)=>React.useEffect(fn,deps),
  useRef:(value:any)=>React.useRef(value),
 };
});
import {CivitaiModal,type LoraProviderFilter} from './CivitaiModal';
import {validateModelCompatibility} from '../utils/baseModelMatcher';
const elements=(tree:any):any[]=>!tree?[]:Array.isArray(tree)?tree.flatMap(elements):typeof tree==='object'&&tree.props?[tree,...elements(tree.props.children)]:[];
const metadata={id:456,modelId:123,model:{name:'Public adapter',type:'LORA'},air:'urn:air:sdxl:lora:civitai:123@456',files:[{id:999,name:'adapter.safetensors',metadata:{format:'SafeTensor'}}]};
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
function submit(provider:LoraProviderFilter,raw:string){
 vi.spyOn(React,'useState').mockImplementation(((value:any)=>[value,vi.fn()]) as any);
 vi.spyOn(React,'useEffect').mockImplementation(()=>{});
 vi.spyOn(React,'useRef').mockReturnValue({current:0});
 vi.stubGlobal('document',{getElementById:()=>({value:raw})});
 const onSelectLoRA=vi.fn();const onClose=vi.fn();
 const tree=CivitaiModal({isOpen:true,initialProvider:provider,onSelectLoRA,onClose,onAddLoRANodeToCanvas:vi.fn()});
 const button=elements(tree).find(el=>el.type==='button'&&el.props.children==='动态解析并选用');
 return {run:()=>button.props.onClick(),onSelectLoRA,onClose};
}
it.each(['civitai','all'] as const)('the %s custom submit callback verifies shorthand and bare AIR without display prefixes',async(provider)=>{
 const fetch=vi.fn(async()=>new Response(JSON.stringify(metadata)));vi.stubGlobal('fetch',fetch);
 for(const prefix of ['air:','']){
  const input=submit(provider,`${prefix}sdxl:lora:civitai:123@456+999.safetensor`);
  await input.run();
  expect(input.onSelectLoRA).toHaveBeenCalledWith(expect.objectContaining({name:'urn:air:sdxl:lora:civitai:123@456+999.safetensor',civitaiId:'urn:air:sdxl:lora:civitai:123@456+999.safetensor',provider:'civitai',resourceVerified:true}));
  expect(input.onClose).toHaveBeenCalledOnce();vi.restoreAllMocks();
 }
 expect(fetch).toHaveBeenCalledTimes(2);
});
it.each(['air:',''])('the Fal tab refuses %s Civitai AIR instead of importing it as Fal',async(prefix)=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 const input=submit('fal',`${prefix}sdxl:lora:civitai:123@456+999.safetensor`);
 await input.run();expect(input.onSelectLoRA).not.toHaveBeenCalled();expect(input.onClose).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
});

it('does not guess baseModel from model name when Civitai metadata has missing baseModel, but keeps badge hint',async()=>{
 const mockCivitaiData={
  items:[
   {
    id:101,
    name:'Ultra Flux Realism',
    type:'LORA',
    modelVersions:[{id:201,name:'v1',baseModel:'',trainedWords:['flux_real']}],
    creator:{username:'flux_dev'},
    stats:{downloadCount:120,rating:4.9}
   },
   {
    id:102,
    name:'SDXL Anime Style',
    type:'LORA',
    modelVersions:[{id:202,name:'v1',baseModel:'SDXL 1.0',trainedWords:['anime']}],
    creator:{username:'anime_dev'},
    stats:{downloadCount:300,rating:5}
   }
  ],
  metadata:{nextCursor:null}
 };
 const fetch=vi.fn(async()=>new Response(JSON.stringify(mockCivitaiData)));vi.stubGlobal('fetch',fetch);
 vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{},removeItem:()=>{}});

 let effectCallback:any;
 let capturedModels:any[]=[];
 vi.spyOn(React,'useState').mockImplementation(((initial:any)=>{
  const setter=vi.fn((val:any)=>{
   const resolved=typeof val==='function'?val(initial):val;
   if(Array.isArray(resolved)&&resolved.some(item=>item?.id?.startsWith('civitai-'))){
    capturedModels=resolved;
   }
  });
  return [initial,setter];
 }) as any);
 vi.spyOn(React,'useEffect').mockImplementation(((fn:any)=>{effectCallback=fn;}) as any);
 vi.spyOn(React,'useRef').mockReturnValue({current:0});

 CivitaiModal({isOpen:true,initialProvider:'civitai',onSelectLoRA:vi.fn(),onClose:vi.fn(),onAddLoRANodeToCanvas:vi.fn()});
 expect(effectCallback).toBeDefined();
 effectCallback();
 await new Promise(resolve=>setTimeout(resolve,10));

 const fluxModel=capturedModels.find(m=>m.id==='civitai-101');
 expect(fluxModel).toBeDefined();
 expect(fluxModel.baseModel).toBeNull();
 expect(fluxModel.badge).toBe('FLUX');

 // Compatibility checking treats unknown baseModel as unverified (compatible), not incompatible
 const compatWithSdxl=validateModelCompatibility('sdxl-base-1.0',fluxModel.baseModel,fluxModel.selection?.name || 'adapter.safetensors','civitai');
 expect(compatWithSdxl.verification).toBe('unverified');
 expect(compatWithSdxl.isCompatible).toBe(true);

 const sdxlModel=capturedModels.find(m=>m.id==='civitai-102');
 expect(sdxlModel).toBeDefined();
 expect(sdxlModel.baseModel).toBe('SDXL 1.0');
 expect(sdxlModel.badge).toBe('SDXL');

 const compatSdxlModel=validateModelCompatibility('sdxl-base-1.0',sdxlModel.baseModel,sdxlModel.name,'civitai');
 expect(compatSdxlModel.isCompatible).toBe(true);
});

it('WaveSpeed Hub paste of HTTPS LoRA URL selects executable weight path without inventing strength', async () => {
  const url = 'https://huggingface.co/Comfy-Org/Krea-2/resolve/main/loras/krea2_darkbrush.safetensors';
  const input = submit('wavespeed', url);
  await input.run();
  expect(input.onSelectLoRA).toHaveBeenCalledWith(expect.objectContaining({
    name: url,
    downloadUrl: url,
    provider: 'wavespeed',
    resourceVerified: true,
    resource_kind: 'lora',
  }));
  const arg = input.onSelectLoRA.mock.calls[0][0];
  expect(arg.modelStrength).toBeUndefined();
  expect(arg.clipStrength).toBeUndefined();
  expect(input.onClose).toHaveBeenCalledOnce();
});

it('provider=all refuses HTTPS LoRA URL paste until a concrete provider tab is chosen', async () => {
  const url = 'https://huggingface.co/Comfy-Org/Krea-2/resolve/main/loras/krea2_darkbrush.safetensors';
  const input = submit('all', url);
  await input.run();
  expect(input.onSelectLoRA).not.toHaveBeenCalled();
  expect(input.onClose).not.toHaveBeenCalled();
});

