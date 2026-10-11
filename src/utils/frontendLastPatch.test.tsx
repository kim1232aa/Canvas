import React from 'react';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {ParameterInspector} from '../components/ParameterInspector';
import {readInspectorParameters,patchInspectorBranchNode} from './inspectorParameters';
import {extractWorkflowParameters,executeWorkflow,shouldClearExecutionOutput} from './graphEngine';
import {spatialRequestParameters} from './frontendParameters';
import {EngineRegistry} from '../engines/EngineRegistry';
import * as api from '../services/api';
import type {NodeInstance,Connection} from '../types/graph';
const node=(id:string,type:string,values:any):NodeInstance=>({id,type,title:type,pos:{x:0,y:0},inputs:[],outputs:[],values});
const edge=(from:string,to:string,socket:string):Connection=>({id:from+to+socket,fromNodeId:from,fromSocketId:'out',toNodeId:to,toSocketId:socket,type:'MODEL'});
const elements=(tree:any):any[]=>!tree?[]:Array.isArray(tree)?tree.flatMap(elements):typeof tree==='object'&&tree.props?[tree,...elements(tree.props.children)]:[];
beforeEach(()=>vi.spyOn(api,'getStoredApiKeys').mockReturnValue({} as any));
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('failed fetch preserves reference SaveImage state and contents with the actual App clearing predicate',async()=>{
 const source={...node('source','SaveImage',{}),outputData:'https://example.test/reference.png',state:'success' as const};
 const video=node('video','AIVideoNode',{model:'custom',targetProvider:'fal',prompt:'test'});
 let current:NodeInstance=source;
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({error:'failure'}),{status:500})));
 await expect(executeWorkflow([source,video],[edge('source','video','init_image')],(id,state,_progress,output,error)=>{if(id==='source')current={...current,state,outputData:shouldClearExecutionOutput(current.type,state,output,error)?undefined:output??current.outputData};},undefined,'video')).rejects.toThrow();
 expect(current).toEqual(source);
});
it.each([4,0])('simplified checkpoint/CLIP/sink selection reads and patches the same owner quantity=%s',quantity=>{
 const c=node('c','CheckpointLoaderSimple',{ckpt_name:'original',targetProvider:'agnes',n:quantity}),p=node('p','CLIPTextEncode',{text:'test'}),s=node('s','SaveImage',{});
 const nodes=[c,p,s],connections=[edge('c','p','clip'),edge('p','s','images')];
 for(const selected of ['c','p','s']){
  const before=readInspectorParameters(nodes,connections,selected);expect(before).toMatchObject({checkpoint:'original',targetProvider:'agnes',batchSize:quantity});
  const changed=patchInspectorBranchNode(c,nodes,connections,selected,before,{...before,checkpoint:'changed'});expect(changed.values).toMatchObject({ckpt_name:'changed',n:quantity});
 }
});
it('production inspector 9:16 callback patches the Fal resolution read by extraction and actual driver',async()=>{
 const n=node('fal','FalAIEngineNode',{model:'custom',resolution:'1024x1024',prompt:'test'});const before=readInspectorParameters([n],[],'fal');
 expect(before).toMatchObject({width:1024,height:1024});
 vi.spyOn(React,'useState').mockImplementation(((v:any)=>[v,()=>{}]) as any);let after:any;
 const tree=ParameterInspector({params:before,onChange:p=>{after=p;},onOpenCivitai:()=>{}});
 const button=elements(tree).find(el=>el.type==='button'&&elements(el).some(child=>child.props.children==='9:16'));expect(button).toBeDefined();button.props.onClick();
 const patched=patchInspectorBranchNode(n,[n],[],'fal',before,after);expect(patched.values.resolution).toBe('720x1280');
 expect(patchInspectorBranchNode(n,[n],[],'fal',before,{...before,customParameters:'{}'}).values.resolution).toBe('1024x1024');
 expect(extractWorkflowParameters([patched],[],'fal')).toMatchObject({width:720,height:1280});
 const bodies:any[]=[];vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{bodies.push(JSON.parse(String(init?.body)));return new Response(JSON.stringify({imageUrl:'https://example.test/output.png'}));}));
 await executeWorkflow([patched],[],()=>{},undefined,'fal');expect(bodies[0].image_size).toEqual({width:720,height:1280});
});
it.each([3,0])('Civitai graph/framework/direct actual bodies preserve quantity=%s',async(quantity)=>{
 const n=node('v','AIVideoNode',{model:'opaque-identifier',targetProvider:'civitai',prompt:'test',n:quantity,civitai_engine:'comfy',civitai_ecosystem:'custom',civitai_model:'custom'});
 const bodies:any[]=[];vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{bodies.push(JSON.parse(String(init?.body)));return new Response(JSON.stringify({imageUrl:'https://example.test/output.mp4'}));}));
 await executeWorkflow([n],[],()=>{},undefined,'v');
 const frame:any={mediaType:'video',prompt:'test',params:{checkpoint:'opaque-identifier',targetProvider:'video',videoProvider:'civitai',batchSize:quantity,civitaiEngine:'comfy',civitaiEcosystem:'custom',civitaiModel:'custom',loras:[]}};
 await EngineRegistry.generate('video',spatialRequestParameters(frame));
 await EngineRegistry.generate('civitai',spatialRequestParameters({...frame,params:{...frame.params,targetProvider:'civitai'}}));
 expect(bodies.map(b=>b.quantity)).toEqual([quantity,quantity,quantity]);
 for(const body of bodies)expect(body).toMatchObject({model:'opaque-identifier',engine:'comfy',ecosystem:'custom',comfyModel:'custom',isVideo:true});
});
