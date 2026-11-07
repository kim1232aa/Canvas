import type {ComfyParameters,NodeInstance,Connection,SpatialFrame} from '../types/graph';
export function modelCheckpoint(nodes:NodeInstance[],connections:Connection[],targetId?:string):NodeInstance|undefined {
 let n=nodes.find(n=>n.id===targetId);const seen=new Set<string>();
 while(n && !seen.has(n.id)){
  seen.add(n.id);if(n.type==='CheckpointLoaderSimple')return n;
  const sockets=n.type==='SaveImage'||n.type==='PreviewImage'?['images','image']:n.type==='VAEDecode'?['samples']:n.type==='CLIPTextEncode'||n.type==='CLIPTextEncodeNegative'?['clip']:['model'];
  const edge=connections.find(c=>c.toNodeId===n!.id && sockets.includes(c.toSocketId));
  n=nodes.find(n=>n.id===edge?.fromNodeId && !n.bypassed);
 }
}
const num=(v:unknown)=>v===undefined||v===null||v===''?undefined:Number(v);
const str=(v:unknown)=>typeof v==='string' && v.trim() ? v.trim() : undefined;
/** Inspector extras for Civitai VideoGenInput discriminators; persisted on node values, not a new ComfyParameters table. */
export type CivitaiVideoInspectorParams = ComfyParameters & {
  civitaiVersion?: string;
  civitaiOperation?: string;
  civitaiBackend?: string;
};

function schemaAt(document:any,ref:string):any{
 if(typeof ref!=='string' || !ref.startsWith('#/components/schemas/'))return undefined;
 return document?.components?.schemas?.[ref.slice('#/components/schemas/'.length)];
}

/** Walk the live VideoGenInput discriminator tree; options come only from the official mapping keys. */
export function civitaiVideoDiscriminatorSteps(document:any,selectors:Record<string,string>={}):Array<{propertyName:string;options:string[]}>{
 const steps:Array<{propertyName:string;options:string[]}>=[];
 const seen=new Set<string>();
 const walk=(ref:string)=>{
  if(!ref || seen.has(ref))return;
  seen.add(ref);
  const raw=schemaAt(document,ref) || document?.components?.schemas?.[ref];
  if(!raw || typeof raw!=='object')return;
  const parts=Array.isArray(raw.allOf)?raw.allOf:[];
  for(const part of [...parts,raw]){
   if(!part || typeof part!=='object')continue;
   if(typeof part.$ref==='string')walk(part.$ref);
   const disc=part.discriminator;
   if(!disc || typeof disc!=='object')continue;
   const propertyName=String(disc.propertyName||'');
   if(!propertyName)continue;
   const mapping=disc.mapping && typeof disc.mapping==='object' && !Array.isArray(disc.mapping)?disc.mapping:{};
   const options=Object.keys(mapping);
   if(!steps.some(s=>s.propertyName===propertyName))steps.push({propertyName,options});
   const selected=selectors[propertyName];
   if(typeof selected==='string' && selected && typeof mapping[selected]==='string')walk(mapping[selected]);
  }
 };
 walk('#/components/schemas/VideoGenInput');
 return steps;
}

export function readCivitaiVideoSelectors(values:Record<string,any>|undefined):Record<string,string>|undefined{
 const v=values||{};
 const declared=v.video_selectors;
 const vs=declared && typeof declared==='object' && !Array.isArray(declared)?declared as Record<string,unknown>:{};
 const out:Record<string,string>={};
 const take=(key:string,...cands:unknown[])=>{for(const c of cands){const s=str(c);if(s){out[key]=s;return;}}};
 take('engine',vs.engine,v.civitai_engine);
 take('version',vs.version,v.civitai_version);
 take('provider',vs.provider,v.civitai_backend);
 take('operation',vs.operation,v.civitai_operation);
 return Object.keys(out).length?out:undefined;
}

export function resolveNodeVideoSelectors(values:Record<string,any>|undefined):Record<string,string>|undefined{
 const v=values||{};
 const declared=v.video_selectors;
 if(declared!==undefined){
  if(!declared || typeof declared!=='object' || Array.isArray(declared) || !Object.values(declared).every((x)=>typeof x==='string' && x.trim()!=='')){
   throw new Error('视频节点 video_selectors 必须是非空字符串组成的对象');
  }
  const out={...(declared as Record<string,string>)};
  const fallback=readCivitaiVideoSelectors({...v,video_selectors:undefined});
  if(fallback)for(const [k,val] of Object.entries(fallback))if(!out[k])out[k]=val;
  return out;
 }
 return readCivitaiVideoSelectors(v);
}

function inspectorCivitaiVideoFields(after:ComfyParameters):{engine?:string;version?:string;provider?:string;operation?:string}{
 const a=after as CivitaiVideoInspectorParams;
 return {engine:str(a.civitaiEngine),version:str(a.civitaiVersion),provider:str(a.civitaiBackend),operation:str(a.civitaiOperation)};
}

export function readInspectorParameters(nodes:NodeInstance[],connections:Connection[],targetId?:string):ComfyParameters {
 const target=nodes.find(n=>n.id===targetId) || nodes.find(n=>['KSampler','AIVideoNode','FalAIEngineNode','ModelScopeNode','ModelScopeAiNode','NanoGPTNode','GoogleImagenNode','ReplicateEngineNode'].includes(n.type));
 const c=modelCheckpoint(nodes,connections,target?.id) || target;const v=c?.values || {};const s=target?.values || {};
 const edge=connections.find(c=>c.toNodeId===target?.id && c.toSocketId==='latent_image');
 const resolution=['FalAIEngineNode','ReplicateEngineNode'].includes(target?.type || '') ? /^(\d+)x(\d+)$/.exec(String(s.resolution || '')) : null;
 const latent=resolution ? {width:resolution[1],height:resolution[2]} : nodes.find(n=>n.id===edge?.fromNodeId && n.type==='EmptyLatentImage')?.values || {};
 // Prefer connected EmptyLatent; else CheckpointLoader width/height so panel edits survive without a latent node.
 // ws-sizenode: a connected Empty Latent is the only size source (an empty field stays empty — no loader fallback).
 const latentWired=!resolution && nodes.some(n=>n.id===edge?.fromNodeId && n.type==='EmptyLatentImage');
 const width=latentWired?num(latent.width):(num(latent.width) ?? num(v.width)); const height=latentWired?num(latent.height):(num(latent.height) ?? num(v.height));
 const videoSelectors=readCivitaiVideoSelectors(target?.type==='AIVideoNode'?s:v);
 return {checkpoint:v.ckpt_name ?? v.model_endpoint ?? v.model ?? '',targetProvider:(v.targetProvider || v.provider || ({FalAIEngineNode:'fal',ModelScopeNode:'modelscope',ModelScopeAiNode:'modelscope_ai',NanoGPTNode:'nanogpt',GoogleImagenNode:'gemini',ReplicateEngineNode:'replicate'} as any)[target?.type || ''] || '') as ComfyParameters['targetProvider'],
 seed:num(s.seed),seedControl:s.control_after_generate || 'fixed',steps:num(s.steps),cfg:num(s.cfg ?? s.guidance_scale),sampler:s.sampler_name,scheduler:s.scheduler,denoise:num(s.denoise) as number,width:width as number,height:height as number,batchSize:num(v.n ?? v.batch_size ?? v.batchSize ?? latent.batch_size) as number,loras:[],
 aspectRatio:v.aspect_ratio ?? v.aspectRatio,imageSize:v.image_size,size:v.size,outputFormat:v.output_format ?? v.outputFormat,watermark:typeof v.watermark==='boolean'?v.watermark:undefined,promptExtend:typeof v.prompt_extend==='boolean'?v.prompt_extend:undefined,resolution:v.resolution,customParameters:v.custom_parameters,shift:v.shift,randomSeed:v.random_seed,galleryImages:v.gallery_images,civitaiEngine:videoSelectors?.engine || v.civitai_engine,civitaiEcosystem:v.civitai_ecosystem,civitaiModel:v.civitai_model,
 civitaiVersion:videoSelectors?.version || v.civitai_version,civitaiOperation:videoSelectors?.operation || v.civitai_operation,civitaiBackend:videoSelectors?.provider || v.civitai_backend,
 videoProvider:target?.type==='AIVideoNode' ? s.targetProvider || s.provider : ((v.targetProvider === 'video' || v.provider === 'video') ? v.video_provider || v.videoProvider : undefined),videoDuration:num(s.duration) ?? ((v.targetProvider === 'video' || v.provider === 'video') ? num(v.videoDuration ?? v.duration) : undefined),videoFps:num(s.fps) ?? ((v.targetProvider === 'video' || v.provider === 'video') ? num(v.videoFps ?? v.fps) : undefined),videoFrames:num(s.num_frames) ?? ((v.targetProvider === 'video' || v.provider === 'video') ? num(v.videoFrames ?? v.num_frames) : undefined),requireReferenceImage:v.require_reference_image,unresolvedModel:v.import_unresolved_resource === true || v.unresolvedResource === true,executionBlockedReason:v.execution_blocked_reason,sourceLoraAir:v.source_lora_air} as ComfyParameters;
}
export function patchInspectorNode(n:NodeInstance,before:ComfyParameters,after:ComfyParameters):NodeInstance {
 if(!['KSampler','EmptyLatentImage','CheckpointLoaderSimple','AIVideoNode','FalAIEngineNode','ModelScopeNode','ModelScopeAiNode','NanoGPTNode','GoogleImagenNode','ReplicateEngineNode'].includes(n.type))return n;
 const changed=Object.fromEntries(Object.entries(after).filter(([k,v])=>!Object.is(v,(before as any)[k])));const values={...n.values};
 const map:Record<string,string>={checkpoint:n.type==='CheckpointLoaderSimple'?'ckpt_name':['ModelScopeNode','ModelScopeAiNode'].includes(n.type)?'model_endpoint':'model',targetProvider:'targetProvider',videoProvider:'video_provider',steps:'steps',cfg:['FalAIEngineNode','ReplicateEngineNode'].includes(n.type)?'guidance_scale':'cfg',seed:'seed',sampler:'sampler_name',scheduler:'scheduler',denoise:'denoise',seedControl:'control_after_generate',width:'width',height:'height',batchSize:n.type==='EmptyLatentImage'?'batch_size':'n',aspectRatio:'aspect_ratio',imageSize:'image_size',customParameters:'custom_parameters',civitaiEngine:'civitai_engine',civitaiEcosystem:'civitai_ecosystem',civitaiModel:'civitai_model',civitaiVersion:'civitai_version',civitaiOperation:'civitai_operation',civitaiBackend:'civitai_backend',randomSeed:'random_seed',galleryImages:'gallery_images',videoDuration:'duration',videoFps:'fps',videoFrames:'num_frames',outputFormat:'output_format',watermark:'watermark',promptExtend:'prompt_extend',quality:'quality',background:'background',moderation:'moderation',resolution:'resolution',size:'size',shift:'shift'};
 const sampler=new Set(['seed','seedControl','steps','cfg','sampler','scheduler','denoise']);const latent=new Set(['width','height','batchSize']);
 // CheckpointLoader keeps width/height as a persistence fallback when EmptyLatent is absent/unconnected (panel reopen must not clear size).
 for(const [key,value] of Object.entries(changed)) {
   const allowed=n.type==='KSampler'?sampler.has(key):n.type==='EmptyLatentImage'?latent.has(key):n.type==='CheckpointLoaderSimple'?!sampler.has(key)&&!['loras'].includes(key):!['loras','videoProvider'].includes(key);
   // Keep selected model across panel reopen / same-provider refresh: empty overlay must not blank ckpt_name.
   if(key==='checkpoint' && (value==='' || value==null) && before.targetProvider===after.targetProvider && before.checkpoint) continue;
   if(allowed && map[key]) {
     values[map[key]]=value;
   }
 }
 if(['FalAIEngineNode','ReplicateEngineNode'].includes(n.type) && ('width' in changed || 'height' in changed)){
  values.resolution=after.width !== undefined && after.height !== undefined ? `${after.width}x${after.height}` : undefined;
 }
 if(n.type==='AIVideoNode' && ('videoProvider' in changed || 'targetProvider' in changed)){const provider='videoProvider' in changed?after.videoProvider:after.targetProvider;values.targetProvider=provider;values.provider=provider;}
 if(n.type==='CheckpointLoaderSimple' || n.type==='AIVideoNode'){
  const selectorTouched=['civitaiEngine','civitaiVersion','civitaiOperation','civitaiBackend'].some((k)=>k in changed);
  if(selectorTouched){
   const fields=inspectorCivitaiVideoFields(after);
   const selectors:Record<string,string>={};
   if(fields.engine)selectors.engine=fields.engine;
   if(fields.version)selectors.version=fields.version;
   if(fields.provider)selectors.provider=fields.provider;
   if(fields.operation)selectors.operation=fields.operation;
   values.video_selectors=Object.keys(selectors).length?selectors:undefined;
  }
 }
 return {...n,values};
}
export function patchInspectorBranchNode(n:NodeInstance,nodes:NodeInstance[],connections:Connection[],targetId:string|undefined,before:ComfyParameters,after:ComfyParameters):NodeInstance {
 const checkpoint=modelCheckpoint(nodes,connections,targetId);
 if(n.type==='CheckpointLoaderSimple' && n.id!==checkpoint?.id)return n;
 if(n.type==='KSampler' && n.id!==targetId)return n;
 if(n.type==='EmptyLatentImage' && !connections.some(c=>c.fromNodeId===n.id && c.toNodeId===targetId && c.toSocketId==='latent_image'))return n;
 const patched=patchInspectorNode(n,before,after);
 // ws-sizenode: with a connected Empty Latent the board node is the only size source — never keep a second hidden copy on the loader.
 if(patched.type==='CheckpointLoaderSimple' && connectedLatent(nodes,connections,targetId))return clearLoaderSize(patched);
 return patched;
}
/** ws-sizenode: the non-bypassed EmptyLatentImage wired into targetId's latent_image socket, if any. */
export function connectedLatent(nodes:NodeInstance[],connections:Connection[],targetId?:string):NodeInstance|undefined {
 if(!targetId)return undefined;
 const edge=connections.find(c=>c.toNodeId===targetId && c.toSocketId==='latent_image');
 return nodes.find(n=>n.id===edge?.fromNodeId && n.type==='EmptyLatentImage' && !n.bypassed);
}
/** ws-sizenode: drop loader width/height (fallback-only fields) so the Empty Latent node is the single size source. */
export function clearLoaderSize(n:NodeInstance):NodeInstance {
 if(n.type!=='CheckpointLoaderSimple' || (n.values?.width===undefined && n.values?.height===undefined))return n;
 const {width:_w,height:_h,...rest}=n.values||{};
 return {...n,values:rest};
}
/** ws-sizenode: loaders feeding any sampler that this Empty Latent drives (used when the latent node itself is edited). */
export function loadersFedByLatent(nodes:NodeInstance[],connections:Connection[],latentId:string):Set<string> {
 const ids=new Set<string>();
 for(const c of connections){
  if(c.fromNodeId!==latentId || c.toSocketId!=='latent_image')continue;
  const ck=modelCheckpoint(nodes,connections,c.toNodeId);
  if(ck)ids.add(ck.id);
 }
 return ids;
}
export function patchSpatialParameters(f:SpatialFrame,p:ComfyParameters):SpatialFrame {
 return {...f,params:{...f.params,...p},...(!Object.is(f.params.videoDuration,p.videoDuration)?{videoDuration:undefined}:{}),...(!Object.is(f.params.videoFps,p.videoFps)?{videoFps:undefined}:{}),...(!Object.is(f.params.aspectRatio,p.aspectRatio)?{videoAspectRatio:undefined}:{})};
}
export function variationReference(f:{imageUrl?:string;referenceImageUrl?:string}):string|undefined{return f.imageUrl || f.referenceImageUrl;}
