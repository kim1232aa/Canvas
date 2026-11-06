import {it,expect} from 'vitest';
import {readInspectorParameters,patchInspectorNode,patchSpatialParameters,variationReference,civitaiVideoDiscriminatorSteps} from './inspectorParameters';
import type {NodeInstance} from '../types/graph';
const node=(id:string,type:string,values:any):NodeInstance=>({id,type,title:type,pos:{x:0,y:0},inputs:[],outputs:[],values});
it('reads raw sampler values during execution validation failures and patches only changed fields',()=>{
 const c=node('c','CheckpointLoaderSimple',{ckpt_name:'model',targetProvider:'civitai',n:0,import_unresolved_resource:true});
 const k=node('k','KSampler',{seed:0,cfg:0,steps:24,sampler_name:'euler',scheduler:'normal'});
 const p=readInspectorParameters([c,k],[{id:'m',fromNodeId:'c',fromSocketId:'MODEL',toNodeId:'k',toSocketId:'model',type:'MODEL'}],'k');
 expect(p).toMatchObject({seed:0,cfg:0,steps:24,batchSize:0});
 expect(patchInspectorNode(k,p,{...p,civitaiEngine:'comfy'}).values).toEqual(k.values);
 expect(patchInspectorNode(c,p,{...p,civitaiEngine:'comfy'}).values).toMatchObject({n:0,civitai_engine:'comfy'});
});
it('synchronizes explicit video provider and replaces legacy duration/aspect values on edit',()=>{
 const v=node('v','AIVideoNode',{model:'video',targetProvider:'fal'});
 const p:any={checkpoint:'video',targetProvider:'fal',videoProvider:'fal',videoDuration:5,aspectRatio:'16:9'};
 expect(patchInspectorNode(v,p,{...p,targetProvider:'agnes'}).values.targetProvider).toBe('agnes');
 const frame:any={params:p,videoDuration:5,videoAspectRatio:'16:9'};
 expect(patchSpatialParameters(frame,{...p,videoDuration:12,aspectRatio:undefined})).toMatchObject({params:{videoDuration:12}});
 expect(patchSpatialParameters(frame,{...p,videoDuration:12,aspectRatio:undefined}).videoAspectRatio).toBeUndefined();
 expect(variationReference({imageUrl:'resultB',referenceImageUrl:'inputA'})).toBe('resultB');
});
it('reads the existing image output format and clears size or format without replacing prompt or route',()=>{
 const c=node('c','CheckpointLoaderSimple',{ckpt_name:'custom-image-model',targetProvider:'sensenova',size:'2K',output_format:'webp',prompt:'keep prompt'});
 const p=readInspectorParameters([c],[],'c');
 expect(p).toMatchObject({checkpoint:'custom-image-model',targetProvider:'sensenova',size:'2K',outputFormat:'webp'});
 expect(patchInspectorNode(c,p,{...p,size:undefined}).values).toEqual({...c.values,size:undefined});
 expect(patchInspectorNode(c,p,{...p,outputFormat:undefined}).values).toEqual({...c.values,output_format:undefined});
 expect(c.values.size).toBe('2K');
});
it.each([false,true,undefined])('reads and patches optional SenseNova booleans %j without changing routes or other frame state',value=>{
 const c=node('c','CheckpointLoaderSimple',{ckpt_name:'custom-image-model',targetProvider:'sensenova',size:'2K',prompt:'keep',watermark:!value,prompt_extend:!value});
 const p=readInspectorParameters([c],[],'c');
 expect(p).toMatchObject({watermark:!value,promptExtend:!value});
 const next={...p,watermark:value,promptExtend:value};
 expect(patchInspectorNode(c,p,next).values).toEqual({...c.values,watermark:value,prompt_extend:value});
 expect(patchInspectorNode(node('k','KSampler',{seed:0}),p,next).values).toEqual({seed:0});
 const frame:any={id:'f',params:p,prompt:'keep',referenceImageUrl:'ref.png',videoDuration:5};
 expect(patchSpatialParameters(frame,next)).toEqual({...frame,params:next});
 expect(frame.params).toBe(p);
});
it('walks live VideoGenInput discriminators without inventing enum lists',()=>{
 const document={components:{schemas:{
  VideoGenInput:{discriminator:{propertyName:'engine',mapping:{wan:'#/components/schemas/WanVideoGenInput',ltx2:'#/components/schemas/ComfyLtx2VideoGenInput'}}},
  WanVideoGenInput:{allOf:[{$ref:'#/components/schemas/VideoGenInput'},{discriminator:{propertyName:'version',mapping:{'v2.1':'#/components/schemas/Wan21VideoGenInput'}}}]},
  Wan21VideoGenInput:{allOf:[{$ref:'#/components/schemas/WanVideoGenInput'},{discriminator:{propertyName:'provider',mapping:{civitai:'#/components/schemas/Wan21CivitaiVideoGenInput'}}}]},
  Wan21CivitaiVideoGenInput:{allOf:[{$ref:'#/components/schemas/Wan21VideoGenInput'}]},
  ComfyLtx2VideoGenInput:{allOf:[{$ref:'#/components/schemas/VideoGenInput'},{discriminator:{propertyName:'operation',mapping:{createVideo:'#/components/schemas/ComfyLtx2CreateVideoInput'}}}]},
  ComfyLtx2CreateVideoInput:{allOf:[{$ref:'#/components/schemas/ComfyLtx2VideoGenInput'}]},
 }}};
 expect(civitaiVideoDiscriminatorSteps(document,{})).toEqual([{propertyName:'engine',options:['wan','ltx2']}]);
 expect(civitaiVideoDiscriminatorSteps(document,{engine:'wan'}).map(s=>s.propertyName)).toEqual(['engine','version']);
 expect(civitaiVideoDiscriminatorSteps(document,{engine:'wan',version:'v2.1'}).find(s=>s.propertyName==='provider')?.options).toEqual(['civitai']);
 expect(civitaiVideoDiscriminatorSteps(document,{engine:'ltx2'}).find(s=>s.propertyName==='operation')?.options).toEqual(['createVideo']);
});
it('persists Civitai video engine/version/operation onto CheckpointLoaderSimple video_selectors and reads them back',()=>{
 const c=node('c','CheckpointLoaderSimple',{ckpt_name:'wan',targetProvider:'video',video_provider:'civitai'});
 const before=readInspectorParameters([c],[],'c');
 const after={...before,civitaiEngine:'wan',civitaiVersion:'v2.1',civitaiBackend:'civitai',civitaiOperation:'createVideo'} as any;
 const patched=patchInspectorNode(c,before,after);
 expect(patched.values.video_selectors).toEqual({engine:'wan',version:'v2.1',provider:'civitai',operation:'createVideo'});
 expect(patched.values.civitai_engine).toBe('wan');
 expect(patched.values.civitai_version).toBe('v2.1');
 expect(patched.values.civitai_backend).toBe('civitai');
 expect(patched.values.civitai_operation).toBe('createVideo');
 expect(readInspectorParameters([patched],[],'c')).toMatchObject({civitaiEngine:'wan',civitaiVersion:'v2.1',civitaiBackend:'civitai',civitaiOperation:'createVideo'});
});
