import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 return {...actual,useState:(value:any)=>[value,vi.fn()],useEffect:()=>{},useRef:()=>({current:0})};
});
import {CivitaiModal,type LoraProviderFilter} from './CivitaiModal';
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
