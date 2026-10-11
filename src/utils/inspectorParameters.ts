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
export function readInspectorParameters(nodes:NodeInstance[],connections:Connection[],targetId?:string):ComfyParameters {
 const target=nodes.find(n=>n.id===targetId) || nodes.find(n=>['KSampler','AIVideoNode','FalAIEngineNode','ModelScopeNode','ModelScopeAiNode','NanoGPTNode','GoogleImagenNode'].includes(n.type));
 const c=modelCheckpoint(nodes,connections,target?.id) || target;const v=c?.values || {};const s=target?.values || {};
 const edge=connections.find(c=>c.toNodeId===target?.id && c.toSocketId==='latent_image');
 const resolution=target?.type==='FalAIEngineNode' ? /^(\d+)x(\d+)$/.exec(String(s.resolution || '')) : null;
 const latent=resolution ? {width:resolution[1],height:resolution[2]} : nodes.find(n=>n.id===edge?.fromNodeId && n.type==='EmptyLatentImage')?.values || {};
 return {checkpoint:v.ckpt_name ?? v.model_endpoint ?? v.model ?? '',targetProvider:(v.targetProvider || v.provider || ({FalAIEngineNode:'fal',ModelScopeNode:'modelscope',ModelScopeAiNode:'modelscope_ai',NanoGPTNode:'nanogpt',GoogleImagenNode:'gemini'} as any)[target?.type || ''] || '') as ComfyParameters['targetProvider'],
 seed:num(s.seed),seedControl:s.control_after_generate || 'fixed',steps:num(s.steps),cfg:num(s.cfg ?? s.guidance_scale),sampler:s.sampler_name,scheduler:s.scheduler,denoise:num(s.denoise) as number,width:num(latent.width) as number,height:num(latent.height) as number,batchSize:num(v.n ?? v.batch_size ?? v.batchSize ?? latent.batch_size) as number,loras:[],
 aspectRatio:v.aspect_ratio ?? v.aspectRatio,imageSize:v.image_size,size:v.size,outputFormat:v.output_format ?? v.outputFormat,watermark:typeof v.watermark==='boolean'?v.watermark:undefined,promptExtend:typeof v.prompt_extend==='boolean'?v.prompt_extend:undefined,resolution:v.resolution,customParameters:v.custom_parameters,hfProvider:v.hf_provider,shift:v.shift,randomSeed:v.random_seed,galleryImages:v.gallery_images,civitaiEngine:v.civitai_engine,civitaiEcosystem:v.civitai_ecosystem,civitaiModel:v.civitai_model,
 videoProvider:target?.type==='AIVideoNode' ? s.targetProvider || s.provider : undefined,videoDuration:num(s.duration),videoFps:num(s.fps),videoFrames:num(s.num_frames),requireReferenceImage:v.require_reference_image,unresolvedModel:v.import_unresolved_resource === true || v.unresolvedResource === true,executionBlockedReason:v.execution_blocked_reason,sourceLoraAir:v.source_lora_air};
}
export function patchInspectorNode(n:NodeInstance,before:ComfyParameters,after:ComfyParameters):NodeInstance {
 if(!['KSampler','EmptyLatentImage','CheckpointLoaderSimple','AIVideoNode','FalAIEngineNode','ModelScopeNode','ModelScopeAiNode','NanoGPTNode','GoogleImagenNode'].includes(n.type))return n;
 const changed=Object.fromEntries(Object.entries(after).filter(([k,v])=>!Object.is(v,(before as any)[k])));const values={...n.values};
 const map:Record<string,string>={checkpoint:n.type==='CheckpointLoaderSimple'?'ckpt_name':['ModelScopeNode','ModelScopeAiNode'].includes(n.type)?'model_endpoint':'model',targetProvider:'targetProvider',steps:'steps',cfg:n.type==='FalAIEngineNode'?'guidance_scale':'cfg',seed:'seed',sampler:'sampler_name',scheduler:'scheduler',denoise:'denoise',seedControl:'control_after_generate',width:'width',height:'height',batchSize:n.type==='EmptyLatentImage'?'batch_size':'n',aspectRatio:'aspect_ratio',imageSize:'image_size',customParameters:'custom_parameters',civitaiEngine:'civitai_engine',civitaiEcosystem:'civitai_ecosystem',civitaiModel:'civitai_model',hfProvider:'hf_provider',randomSeed:'random_seed',galleryImages:'gallery_images',videoDuration:'duration',videoFps:'fps',videoFrames:'num_frames',outputFormat:'output_format',watermark:'watermark',promptExtend:'prompt_extend',quality:'quality',background:'background',moderation:'moderation',resolution:'resolution',size:'size',shift:'shift'};
 const sampler=new Set(['seed','seedControl','steps','cfg','sampler','scheduler','denoise']);const latent=new Set(['width','height','batchSize']);
 for(const [key,value] of Object.entries(changed)) {
   const allowed=n.type==='KSampler'?sampler.has(key):n.type==='EmptyLatentImage'?latent.has(key):n.type==='CheckpointLoaderSimple'?!sampler.has(key)&&!['width','height','loras'].includes(key):!['loras','videoProvider'].includes(key);
   if(allowed && map[key])values[map[key]]=value;
 }
 if(n.type==='FalAIEngineNode' && ('width' in changed || 'height' in changed)){
  values.resolution=after.width !== undefined && after.height !== undefined ? `${after.width}x${after.height}` : undefined;
 }
 if(n.type==='AIVideoNode' && ('videoProvider' in changed || 'targetProvider' in changed)){const provider='videoProvider' in changed?after.videoProvider:after.targetProvider;values.targetProvider=provider;values.provider=provider;}
 return {...n,values};
}
export function patchInspectorBranchNode(n:NodeInstance,nodes:NodeInstance[],connections:Connection[],targetId:string|undefined,before:ComfyParameters,after:ComfyParameters):NodeInstance {
 const checkpoint=modelCheckpoint(nodes,connections,targetId);
 if(n.type==='CheckpointLoaderSimple' && n.id!==checkpoint?.id)return n;
 if(n.type==='KSampler' && n.id!==targetId)return n;
 if(n.type==='EmptyLatentImage' && !connections.some(c=>c.fromNodeId===n.id && c.toNodeId===targetId && c.toSocketId==='latent_image'))return n;
 return patchInspectorNode(n,before,after);
}
export function patchSpatialParameters(f:SpatialFrame,p:ComfyParameters):SpatialFrame {
 return {...f,params:{...f.params,...p},...(!Object.is(f.params.videoDuration,p.videoDuration)?{videoDuration:undefined}:{}),...(!Object.is(f.params.videoFps,p.videoFps)?{videoFps:undefined}:{}),...(!Object.is(f.params.aspectRatio,p.aspectRatio)?{videoAspectRatio:undefined}:{})};
}
export function variationReference(f:{imageUrl?:string;referenceImageUrl?:string}):string|undefined{return f.imageUrl || f.referenceImageUrl;}
