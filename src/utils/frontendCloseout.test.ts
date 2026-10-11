import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {EngineRegistryClass} from '../engines/EngineRegistry';
import {extractWorkflowParameters,executeWorkflow} from './graphEngine';
import {readInspectorParameters,patchInspectorNode,patchSpatialParameters} from './inspectorParameters';
import {workflowFrame} from './workflowFrame';
import {spatialRequestParameters} from './frontendParameters';
import type {NodeInstance,Connection} from '../types/graph';
import * as api from '../services/api';
const node=(id:string,type:string,values:any):NodeInstance=>({id,type,title:type,pos:{x:0,y:0},inputs:[],outputs:[],values});
const edge=(from:string,to:string,socket:string):Connection=>({id:from+to+socket,fromNodeId:from,fromSocketId:'out',toNodeId:to,toSocketId:socket,type:'MODEL'});
beforeEach(()=>vi.spyOn(api,'getStoredApiKeys').mockReturnValue({} as any));
afterEach(()=>vi.restoreAllMocks());
it('edits only the actual checkpoint and never adds parameters to CLIP text nodes',()=>{
 const a=node('a','CheckpointLoaderSimple',{ckpt_name:'clip-only'}),b=node('b','CheckpointLoaderSimple',{ckpt_name:'actual'}),p=node('p','CLIPTextEncode',{text:'test'}),k=node('k','KSampler',{});
 const connections=[edge('a','p','clip'),edge('p','k','positive'),edge('b','k','model')];
 const before=readInspectorParameters([a,b,p,k],connections,'k'),after={...before,checkpoint:'changed'};
 expect(patchInspectorNode(p,before,after)).toBe(p);
});
it.each(['FalAIEngineNode','ModelScopeNode','ModelScopeAiNode','NanoGPTNode'])('round-trips %s JSON through inspector, extraction and actual driver body',async(type)=>{
 const n=node('n',type,{model:'custom-image',model_endpoint:'custom-image',prompt:'test'});
 const before=readInspectorParameters([n],[],'n');
 const patched=patchInspectorNode(n,before,{...before,customParameters:'{"zero":0,"enabled":false}'});
 const extraction=extractWorkflowParameters([patched],[],'n');
 expect(extraction.customParameters).toBe('{"zero":0,"enabled":false}');
 const bodies:any[]=[];vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{bodies.push(JSON.parse(String(init?.body)));return new Response(JSON.stringify({imageUrl:'https://example.test/result.png'}));}));
 try {await executeWorkflow([patched],[],()=>{},undefined,'n');expect(bodies[0].custom_parameters).toEqual({zero:0,enabled:false});}finally{vi.unstubAllGlobals();}
});
it('explicit Civitai video framework dispatch uses the dedicated driver and keeps the recipe',async()=>{
 const registry=new EngineRegistryClass();const driver=registry.getDriver('civitai')!;const generate=vi.spyOn(driver,'generate').mockResolvedValue({mediaUrl:'out',mediaType:'video',provider:'civitai',model:'custom',providerId:'civitai',seed:null});
 const params:any={prompt:'test',model:'custom',isVideo:true,provider:'civitai',extraParams:{engine:'comfy',ecosystem:'custom',comfyModel:'custom',quantity:0}};
 await registry.generate('video',params);expect(generate).toHaveBeenCalledWith(params,{});
});
it('imports the actual model-chain checkpoint and retains explicit schema fields',()=>{
 const a=node('a','CheckpointLoaderSimple',{ckpt_name:'clip-only',targetProvider:'civitai'}),b=node('b','CheckpointLoaderSimple',{ckpt_name:'actual',targetProvider:'huggingface',resolution:'custom',aspect_ratio:'4:3',hf_provider:'custom',random_seed:false,shift:0});
 const p=node('p','CLIPTextEncode',{text:'test'}),k=node('k','KSampler',{seed:0}),l=node('l','EmptyLatentImage',{width:1024,height:768,batch_size:1});
 const connections=[edge('a','p','clip'),edge('p','k','positive'),edge('b','k','model'),edge('l','k','latent_image')];
 expect(workflowFrame([a,b,p,k,l],connections)?.params).toMatchObject({checkpoint:'actual',resolution:'custom',aspectRatio:'4:3',hfProvider:'custom',randomSeed:false,shift:0});
});
it('explicit clearing of FPS and duration does not revive old legacy fields',()=>{
 const f:any={mediaType:'video',prompt:'test',params:{checkpoint:'custom',targetProvider:'video',videoProvider:'fal',loras:[],videoDuration:5,videoFps:24},videoDuration:5,videoFps:24};
 const callback=(params:any)=>patchSpatialParameters(f,params);
 const updated=callback({...f.params,videoDuration:undefined,videoFps:undefined});
 expect(spatialRequestParameters(updated).videoDuration).toBeUndefined();expect(spatialRequestParameters(updated).videoFps).toBeUndefined();
});
