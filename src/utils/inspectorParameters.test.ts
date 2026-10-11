import {it,expect} from 'vitest';
import {readInspectorParameters,patchInspectorNode,patchSpatialParameters,variationReference} from './inspectorParameters';
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
