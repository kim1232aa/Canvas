import type {NodeInstance,Connection,SpatialFrame} from '../types/graph';
import {graphBranch,explicitProvider} from './graphEditing';
import {modelCheckpoint,readInspectorParameters} from './inspectorParameters';
import {parseExplicitLoraStrength} from './loraStrength';

const number=(value:unknown)=>value===undefined||value===null||value==='' ? undefined : Number.isFinite(Number(value))?Number(value):undefined;
// Imported graphs are authoritative. Missing provider/parameters remain unspecified.
export function workflowFrame(nodes:NodeInstance[],connections:Connection[]):SpatialFrame|undefined {
 if(nodes.some(n=>!n.bypassed && n.type==='KSamplerAdvanced'))return undefined;
 const branch=graphBranch(nodes,connections);
 if(branch.error || !branch.target)return undefined;
 const scope=nodes.filter(n=>branch.ids.has(n.id));
 const checkpoint=modelCheckpoint(nodes,connections,branch.target.id);
 const sampler=branch.target.type==='KSampler' ? branch.target : undefined;
 const latentId=connections.find(c=>c.toNodeId===sampler?.id && c.toSocketId==='latent_image')?.fromNodeId;
 const latent=scope.find(n=>n.id===latentId && n.type==='EmptyLatentImage');
 if(!checkpoint)return undefined;
 // A frame cannot reproduce incomplete dimensions or a cloud-specific contract.
 if(!sampler || !latent || !number(latent.values.width) || !number(latent.values.height) || !number(latent.values.batch_size))return undefined;
 const text=(socket:string)=>scope.find(n=>connections.some(c=>c.fromNodeId===n.id&&c.toNodeId===branch.target!.id&&c.toSocketId===socket))?.values.text || '';
 return {id:`frame-imported-${Date.now()}`,title:'导入工作流',pos:{x:260,y:160},width:480,height:480,
  prompt:text('positive') || branch.target.values.prompt || '',negativePrompt:text('negative') || branch.target.values.negative_prompt || '',
  params:{...readInspectorParameters(nodes,connections,sampler.id),requireReferenceImage:checkpoint.values.require_reference_image,unresolvedModel:checkpoint.values.import_unresolved_resource === true || checkpoint.values.unresolvedResource === true,executionBlockedReason:checkpoint.values.execution_blocked_reason,sourceLoraAir:checkpoint.values.source_lora_air,civitaiEngine:checkpoint.values.civitai_engine,civitaiEcosystem:checkpoint.values.civitai_ecosystem,civitaiModel:checkpoint.values.civitai_model,customParameters:checkpoint.values.custom_parameters,checkpoint:String(checkpoint.values.ckpt_name || checkpoint.values.model_endpoint || checkpoint.values.model || ''),targetProvider:explicitProvider(checkpoint.values.targetProvider || checkpoint.values.provider) as SpatialFrame['params']['targetProvider'],
   seed:number(sampler?.values.seed),seedControl:'fixed',steps:number(sampler?.values.steps),cfg:number(sampler?.values.cfg),sampler:sampler?.values.sampler_name,scheduler:sampler?.values.scheduler,denoise:number(sampler?.values.denoise) as number,width:number(latent?.values.width) ?? 0,height:number(latent?.values.height) ?? 0,batchSize:number(latent?.values.batch_size) ?? 1,
   loras:scope.filter(n=>(n.type==='LoRALoader'||n.type==='LoraLoader'||n.type==='LoraLoaderModelOnly')&&n.values.lora_name).map(n=>{
     const v = (val: unknown) => typeof val === 'string' && val.trim() ? val.trim() : undefined;
     const path = v(n.values.path || n.values.lora_path || n.values.loraPath);
     const modelId = n.values.model_id || n.values.modelId;
     const versionId = n.values.version_id || n.values.versionId;
     const air = v(n.values.air || n.values.civitai_air || n.values.civitaiAir);
     const styleId = v(n.values.style_id || n.values.styleId);
     const catalogId = v(n.values.catalog_id || n.values.catalogId || n.values.lora_id || n.values.loraId || n.values.slug);
     const sdName = v(n.values.sd_name_in_api || n.values.sdNameInApi);
     return {
       name: n.values.lora_name,
       modelStrength: parseExplicitLoraStrength(n.values.strength_model),
       clipStrength: parseExplicitLoraStrength(n.values.strength_clip),
       triggerWords: n.values.trigger_words || '',
       civitaiId: n.values.civitai_id || n.values.civitaiId || '',
       downloadUrl: n.values.download_url || n.values.downloadUrl,
       unresolvedResource: n.values.import_unresolved_resource === true || n.values.unresolvedResource === true,
       ...(path ? { path } : {}),
       ...(modelId ? { modelId } : {}),
       ...(versionId ? { versionId } : {}),
       ...(air ? { air } : {}),
       ...(styleId ? { styleId } : {}),
       ...(catalogId ? { catalogId } : {}),
       ...(sdName ? { sd_name_in_api: sdName } : {}),
     };
   })},status:'idle',createdAt:Date.now()};
}
