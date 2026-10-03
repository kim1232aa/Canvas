import type {NodeInstance,Connection,SpatialFrame} from '../types/graph';
import {graphBranch,explicitProvider} from './graphEditing';

const number=(value:unknown)=>value===undefined||value===null||value==='' ? undefined : Number.isFinite(Number(value))?Number(value):undefined;
// Imported graphs are authoritative. Missing provider/parameters remain unspecified.
export function workflowFrame(nodes:NodeInstance[],connections:Connection[]):SpatialFrame|undefined {
 if(nodes.some(n=>!n.bypassed && n.type==='KSamplerAdvanced'))return undefined;
 const branch=graphBranch(nodes,connections);
 if(branch.error || !branch.target)return undefined;
 const scope=nodes.filter(n=>branch.ids.has(n.id));
 const checkpoint=scope.find(n=>n.type==='CheckpointLoaderSimple') || branch.target;
 const sampler=scope.find(n=>n.type==='KSampler');const latent=scope.find(n=>n.type==='EmptyLatentImage');
 // A frame cannot reproduce incomplete dimensions or a cloud-specific contract.
 if(!sampler || !latent || !number(latent.values.width) || !number(latent.values.height) || !number(latent.values.batch_size))return undefined;
 const text=(socket:string)=>scope.find(n=>connections.some(c=>c.fromNodeId===n.id&&c.toNodeId===branch.target!.id&&c.toSocketId===socket))?.values.text || '';
 return {id:`frame-imported-${Date.now()}`,title:'导入工作流',pos:{x:260,y:160},width:480,height:480,
  prompt:text('positive') || branch.target.values.prompt || '',negativePrompt:text('negative') || branch.target.values.negative_prompt || '',
  params:{checkpoint:String(checkpoint.values.ckpt_name || checkpoint.values.model_endpoint || checkpoint.values.model || ''),targetProvider:explicitProvider(checkpoint.values.targetProvider || checkpoint.values.provider) as SpatialFrame['params']['targetProvider'],
   seed:number(sampler?.values.seed),seedControl:'fixed',steps:number(sampler?.values.steps),cfg:number(sampler?.values.cfg),sampler:sampler?.values.sampler_name,scheduler:sampler?.values.scheduler,denoise:number(sampler?.values.denoise) ?? 1,width:number(latent?.values.width) ?? 0,height:number(latent?.values.height) ?? 0,batchSize:number(latent?.values.batch_size) ?? 1,
   loras:scope.filter(n=>n.type==='LoRALoader'&&n.values.lora_name).map(n=>({name:n.values.lora_name,modelStrength:number(n.values.strength_model)??0.8,clipStrength:number(n.values.strength_clip)??0.8,triggerWords:n.values.trigger_words || '',civitaiId:n.values.civitai_id || ''}))},status:'idle',createdAt:Date.now()};
}
