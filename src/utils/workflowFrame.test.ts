import {it,expect} from 'vitest';
import {workflowFrame} from './workflowFrame';
import type {Connection,NodeInstance} from '../types/graph';

it('preserves explicit Civitai recipe selection and unresolved resource provenance in imported frames',()=>{
 const node=(id:string,type:string,values:Record<string,unknown>):NodeInstance=>({id,type,title:type,pos:{x:0,y:0},inputs:[],outputs:[],values});
 const nodes=[node('c','CheckpointLoaderSimple',{ckpt_name:'urn:air:sdxl:checkpoint:civitai:123@456',targetProvider:'civitai',civitai_engine:'comfy',civitai_ecosystem:'sdxl',civitai_model:'sdxl'}),node('l','LoRALoader',{lora_name:'original',civitai_id:'789',import_unresolved_resource:true,strength_model:0,strength_clip:0}),node('k','KSampler',{}),node('latent','EmptyLatentImage',{width:1024,height:768,batch_size:1})];
 const edges:Connection[]=[{id:'a',fromNodeId:'c',fromSocketId:'MODEL',toNodeId:'l',toSocketId:'model',type:'MODEL'},{id:'b',fromNodeId:'l',fromSocketId:'MODEL',toNodeId:'k',toSocketId:'model',type:'MODEL'},{id:'z',fromNodeId:'latent',fromSocketId:'LATENT',toNodeId:'k',toSocketId:'latent_image',type:'LATENT'}];
 expect(workflowFrame(nodes,edges)?.params).toMatchObject({civitaiEngine:'comfy',civitaiEcosystem:'sdxl',civitaiModel:'sdxl',loras:[{name:'original',civitaiId:'789',unresolvedResource:true,modelStrength:0,clipStrength:0}]});
});
