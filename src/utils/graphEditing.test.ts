import {it,expect} from 'vitest';
import {graphBranch,catalogModelTarget,explicitProvider} from './graphEditing';
import {workflowFrame} from './workflowFrame';
import {isHuggingFaceLora} from './hfResource';
import {NODE_DEFINITIONS} from '../constants/nodes';
import type {NodeInstance,Connection} from '../types/graph';
const node=(id:string,type:string,values:Record<string,any>={}):NodeInstance=>({id,type,title:type,pos:{x:0,y:0},values,inputs:NODE_DEFINITIONS[type]?.inputs || [],outputs:NODE_DEFINITIONS[type]?.outputs || []});
const edge=(from:string,to:string,input:string):Connection=>({id:`${from}-${to}-${input}`,fromNodeId:from,fromSocketId:'MODEL',toNodeId:to,toSocketId:input,type:'MODEL'});
it('selects one branch for catalog and inspector edits and refuses an ambiguous shared base',()=>{
 const nodes=[node('base-a','CheckpointLoaderSimple',{targetProvider:'huggingface',ckpt_name:'Qwen/Qwen-Image'}),node('base-b','CheckpointLoaderSimple',{targetProvider:'civitai',ckpt_name:'123456'}),node('a','KSampler'),node('b','KSampler'),node('lora-b','LoRALoader',{lora_name:'only-b'})];
 const edges=[edge('base-a','a','model'),edge('base-b','lora-b','model'),edge('lora-b','b','model')];
 expect([...graphBranch(nodes,edges,'a').ids]).toEqual(['a','base-a']);
 expect(catalogModelTarget(nodes,edges,'a',false)?.id).toBe('base-a');
 expect(()=>catalogModelTarget(nodes,edges,null,false)).toThrow(/分支/);
 edges.push(edge('base-a','b','model'));
 expect(graphBranch(nodes,edges,'base-a').error).toMatch(/多个/);
 expect(explicitProvider('huggingface')).toBe('huggingface');
 expect(explicitProvider('Qwen/Qwen-Image')).toBe('');
 expect(catalogModelTarget([...nodes,node('video','AIVideoNode')],edges,'video',false)).toBeUndefined();
});
it.each([['Fal.ai (GPU 云端加速)','fal'],['ModelScope AI','modelscope_ai'],['ModelScope CN','modelscope'],['Hugging Face → fal-ai','huggingface'],['Tensor.Art (模型 API)','tensorart'],['Agnes AI (ApiHub)','agnes'],['Google Gemini (官方直连)','gemini']])('preserves recorded provider %s as %s', (label,id)=>expect(explicitProvider(label)).toBe(id));
it('imports actual workflow parameters, seed/strength zero and connected prompts without inventing provider or scheduler',()=>{
 const nodes=[node('base','CheckpointLoaderSimple',{ckpt_name:'Qwen/Qwen-Image'}),node('lora','LoRALoader',{lora_name:'adapter',strength_model:0,strength_clip:0}),node('sampler','KSampler',{seed:0,steps:12,cfg:0}),node('latent','EmptyLatentImage',{width:512,height:768,batch_size:1}),node('pos','CLIPTextEncode',{text:'actual prompt'}),node('neg','CLIPTextEncode',{text:'actual negative'}),node('unused','CLIPTextEncode',{text:'unrelated'})];
 const edges=[edge('base','lora','model'),edge('lora','sampler','model'),edge('latent','sampler','latent_image'),edge('pos','sampler','positive'),edge('neg','sampler','negative')];
 const frame=workflowFrame(nodes,edges)!;
 expect(frame.prompt).toBe('actual prompt');expect(frame.negativePrompt).toBe('actual negative');
 expect(frame.params).toMatchObject({checkpoint:'Qwen/Qwen-Image',targetProvider:'',seed:0,seedControl:'fixed',cfg:0,width:512,height:768,loras:[{name:'adapter',modelStrength:0,clipStrength:0}]});
 expect(frame.params.sampler).toBeUndefined();expect(frame.params.scheduler).toBeUndefined();
 expect(workflowFrame(nodes.filter(n=>n.id!=='latent'),edges)).toBeUndefined();
 expect(workflowFrame([node('advanced','KSamplerAdvanced')],[])).toBeUndefined();
});
it('does not classify a base repo as LoRA because the search category or name says LoRA',()=>{
 expect(isHuggingFaceLora({tags:['diffusers','text-to-image']})).toBe(false);
 expect(isHuggingFaceLora({tags:['diffusers','LoRA']})).toBe(true);
 expect(isHuggingFaceLora({tags:['LYCORIS']})).toBe(true);
 expect(isHuggingFaceLora({})).toBe(false);
});
