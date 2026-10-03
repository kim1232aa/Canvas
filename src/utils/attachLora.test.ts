import {describe,it,expect} from 'vitest';
import {NODE_DEFINITIONS} from '../constants/nodes';
import {attachLoraToBranch,findLoraTarget} from './attachLora';
import {extractWorkflowParameters} from './graphEngine';
import {buildTensorModelJob} from '../schemas/tensorModelApi';
import type {Connection,NodeInstance} from '../types/graph';
const node=(id:string,type:string,values:Record<string,any>):NodeInstance=>({id,type,title:type,pos:{x:0,y:0},inputs:NODE_DEFINITIONS[type].inputs,outputs:NODE_DEFINITIONS[type].outputs,values});
const fixture=()=>({nodes:[node('base','CheckpointLoaderSimple',{targetProvider:'tensorart',ckpt_name:'672797109289765558'}),node('sampler','KSampler',{seed:42,steps:12,cfg:7}),node('prompt','CLIPTextEncode',{text:'robot'}),node('latent','EmptyLatentImage',{width:512,height:512,batch_size:1})],connections:[{id:'m',fromNodeId:'base',fromSocketId:'MODEL',toNodeId:'sampler',toSocketId:'model',type:'MODEL'},{id:'p',fromNodeId:'prompt',fromSocketId:'CONDITIONING',toNodeId:'sampler',toSocketId:'positive',type:'CONDITIONING'},{id:'c',fromNodeId:'base',fromSocketId:'CLIP',toNodeId:'prompt',toSocketId:'clip',type:'CLIP'},{id:'l',fromNodeId:'latent',fromSocketId:'LATENT',toNodeId:'sampler',toSocketId:'latent_image',type:'LATENT'}] as Connection[]});
describe('LoRA mounting modifies the executing branch, not just the node palette',()=>{
 it('rejects shared prompt CLIP changes rather than contaminating another execution branch',()=>{
  const graph=fixture();graph.nodes.push(node('other','KSampler',{}));
  graph.connections.push({id:'shared-prompt',fromNodeId:'prompt',fromSocketId:'CONDITIONING',toNodeId:'other',toSocketId:'positive',type:'CONDITIONING'});
  expect(()=>attachLoraToBranch(graph.nodes,graph.connections,node('adapter','LoRALoader',{lora_name:'672390779613802167'}),'sampler')).toThrow(/共用/);
  expect(graph.connections.find(edge=>edge.id==='c')?.fromNodeId).toBe('base');
  expect(graph.nodes.some(n=>n.id==='adapter')).toBe(false);
 });
 it('connects both adapters to a Fal engine without applying independent palette nodes',()=>{
  const nodes=[node('fal','FalAIEngineNode',{model:'fal-ai/flux-lora',prompt:'robot'}),node('independent','LoRALoader',{lora_name:'not-mounted'})];
  const first=attachLoraToBranch(nodes,[],node('a','LoRALoader',{lora_name:'https://example.test/a.safetensors',strength_model:0.5}),'fal');
  const second=attachLoraToBranch(first.nodes,first.connections,node('b','LoRALoader',{lora_name:'https://example.test/b.safetensors',strength_model:0.9}),'fal');
  const values=extractWorkflowParameters(second.nodes,second.connections,'fal');
  expect(values.loras.map(row=>[row.name,row.modelStrength])).toEqual([['https://example.test/b.safetensors',0.9],['https://example.test/a.safetensors',0.5]]);
 });
 it('selected checkpoint → new LoRA → sampler reaches the actual Tensor Job with ID and strength',()=>{
  const graph=fixture();const lora=node('adapter','LoRALoader',{lora_name:'672390779613802167',strength_model:0.65,strength_clip:0.65});
  const mounted=attachLoraToBranch(graph.nodes,graph.connections,lora,'base');
  const extracted=extractWorkflowParameters(mounted.nodes,mounted.connections,'sampler');
  expect(extracted.checkpointModel).toBe('672797109289765558');expect(extracted.targetProvider).toBe('tensorart');
  expect(extracted.loras).toMatchObject([{name:'672390779613802167',modelStrength:0.65}]);
  const job=buildTensorModelJob({model:extracted.checkpointModel,prompt:extracted.positivePrompt,width:extracted.width,height:extracted.height,loras:extracted.loras},'request');
  expect(job.stages[1].diffusion?.lora).toEqual({items:[{loraModel:'672390779613802167',weight:0.65}]});
  expect(mounted.connections.find(edge=>edge.id==='c')?.fromNodeId).toBe('adapter');
  expect(graph.connections.find(edge=>edge.id==='m')?.fromNodeId).toBe('base');
 });
 it('a second mount keeps the first adapter, zero strength and unrelated branches',()=>{
  const graph=fixture();graph.nodes.push(node('other','KSampler',{}));graph.connections.push({id:'other-edge',fromNodeId:'base',fromSocketId:'MODEL',toNodeId:'other',toSocketId:'model',type:'MODEL'});
  const first=attachLoraToBranch(graph.nodes,graph.connections,node('a','LoRALoader',{lora_name:'672390779613802167',strength_model:0,strength_clip:0}),'sampler');
  const second=attachLoraToBranch(first.nodes,first.connections,node('b','LoRALoader',{lora_name:'672390779613802168',strength_model:1,strength_clip:1}),'sampler');
  const values=extractWorkflowParameters(second.nodes,second.connections,'sampler');
  expect(values.loras.map(row=>[row.name,row.modelStrength])).toEqual([['672390779613802168',1],['672390779613802167',0]]);
  expect(second.connections.find(edge=>edge.id==='other-edge')?.fromNodeId).toBe('base');
  expect(()=>findLoraTarget(graph.nodes,graph.connections,'base')).toThrow(/多个生成分支/);
 });
 it('rejects an unconnected sampler instead of claiming the LoRA is mounted',()=>{
  const graph=fixture();expect(()=>attachLoraToBranch(graph.nodes,[],node('a','LoRALoader',{lora_name:'id'}),'sampler')).toThrow(/底模连线/);
 });
});
