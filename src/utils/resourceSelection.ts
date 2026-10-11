export interface ResourceSelection {
 name:string;provider?:string;civitaiId?:string;triggerWords?:string;baseModel?:string;downloadUrl?:string;resourceVerified?:boolean;resource_source?:string;resource_kind?:string;
}
function parseAir(value:string) {
 const match=value.match(/^(?:(?:urn:)?air:)?([^:]+):([^:]+):(civitai):([0-9]+)@([0-9]+)(?:\+([^+]+)|\.([^.]+))?$/i);
 return match ? {type:match[2].toLowerCase(),identity:`urn:air:${match[1]}:${match[2]}:${match[3]}:${match[4]}@${match[5]}`,versionId:match[5],fileSelector:match[6],format:match[7],canonical:`urn:air:${value.replace(/^(?:urn:)?air:/i,'')}`} : undefined;
}
export function isCivitaiAir(value:string) {
 return parseAir(value)!==undefined;
}
function modelFileFormat(value:unknown) {
 const format=String(value || '').toLowerCase();
 if(format==='safetensor' || format==='safetensors')return 'safetensor';
 if(format==='ckpt')return 'ckpt';
 if(format==='diffuser')return 'diffuser';
 return undefined;
}
export function selectionFromMetadata(provider:string,metadata:any,kind:string,requestedAir?:string):ResourceSelection {
 if(Array.isArray(metadata.modelVersions) && metadata.modelVersions.length > 1)throw new Error('多个版本候选，必须显式选择 versionId');
 const singleModelVersion=Array.isArray(metadata.modelVersions) && metadata.modelVersions.length===1;
 const version=singleModelVersion ? metadata.modelVersions[0] : metadata;
 const sourceAir=String(version.air || metadata.air || (parseAir(String(metadata.id)) ? metadata.id : ''));
 if(sourceAir && !parseAir(sourceAir))throw new Error('metadata AIR 未被核实：无法解析完整资源标识');
 const parsedAir=parseAir(requestedAir || sourceAir);
 if(requestedAir){
  const verifiedAir=parseAir(sourceAir);
  if(!parsedAir || !verifiedAir || parsedAir.identity!==verifiedAir.identity)throw new Error('手写 AIR 与版本 metadata 不一致或未被核实');
 }
 const air=parsedAir?.canonical || sourceAir;
 const rawKind=String(metadata.type || metadata.model?.type || metadata.category || '').toLowerCase();
 const effectiveKind=parsedAir?.type || rawKind;
 const files=version.files || [];
 const exactFile=(selector:string)=>files.find((file:any)=>String(file.id)===selector || String(file.name || '')===selector);
 let fileSelector=parsedAir?.fileSelector;
 let format=parsedAir?.format;
 let file=fileSelector ? exactFile(fileSelector) : files.find((item:any)=>item.primary) || files[0];
 if(fileSelector && !file){
  const suffix=fileSelector.match(/^(.*)\.([^.]+)$/);
  if(suffix){fileSelector=suffix[1];format=suffix[2];file=exactFile(fileSelector);}
 }
 if(fileSelector && !file)throw new Error('file selector 未被公开 metadata 核实，不能标记为已核实');
 if(format){
  const requestedFormat=modelFileFormat(format);
  const metadataFormat=modelFileFormat(file?.metadata?.format);
  const extensionFormat=modelFileFormat(String(file?.name || '').split('.').pop());
  if(!requestedFormat || requestedFormat!==metadataFormat || requestedFormat!==extensionFormat)throw new Error('AIR format 未被公开文件 metadata 与扩展名核实，不能标记为已核实');
 }
 const allowed=kind==='lora' ? ['lora','lycoris','locon','dora'] : kind==='checkpoint' ? ['checkpoint','diffusionmodel','unet'] : [];
 if(!allowed.includes(effectiveKind))throw new Error(`资源类型未经 metadata 核实为 ${kind}`);
 if(!effectiveKind)throw new Error('metadata 未标明资源类型，不能标记为已核实');
 const id=String(metadata.id || '');
 const modelId=singleModelVersion ? metadata.id : metadata.modelId ?? metadata.model?.id;
 const versionId=singleModelVersion ? version.id : metadata.id;
 const name=provider==='civitai' ? air || (modelId && versionId ? `${modelId}@${versionId}` : '') : id;
 if(!name)throw new Error('metadata 未返回可核实的资源标识');
 const words=version.trainedWords || metadata.triggerWords || metadata.trainedWords || [];
 return {name,provider,civitaiId:provider==='civitai'?name:undefined,triggerWords:Array.isArray(words)?words.join(', '):String(words),baseModel:version.baseModel || metadata.baseModel,downloadUrl:file?.downloadUrl || metadata.downloadUrl,resourceVerified:true,resource_source:provider,resource_kind:effectiveKind};
}
export function verifiedSelectionOrExplicitIntent(provider:string,metadata:any):Partial<ResourceSelection> {
 try { return selectionFromMetadata(provider,metadata,'lora'); }
 catch { return {provider,resourceVerified:false,resource_source:provider,resource_kind:'lora'}; }
}
export async function verifyCivitaiSelection(raw:string,kind:string):Promise<ResourceSelection> {
 const requestedAir=parseAir(raw);
 const pair=raw.match(/^([0-9]+)@([0-9]+)$/);
 const versionId=requestedAir?.versionId || pair?.[2];
 const modelId=/^[0-9]+$/.test(raw) ? raw : undefined;
 if(!versionId && !modelId)throw new Error('请填写完整 AIR 或 modelId@versionId，以公开 metadata 核实');
 const response=await fetch(`https://civitai.com/api/v1/${versionId ? 'model-versions' : 'models'}/${versionId || modelId}`);
 if(!response.ok)throw new Error(`资源 metadata 查询失败 HTTP ${response.status}`);
 const metadata=await response.json();
 if(pair && String(metadata.modelId ?? metadata.model?.id) !== pair[1])throw new Error('modelId 与版本 metadata 不一致');
 if(versionId && String(metadata.id)!==versionId)throw new Error('versionId 与版本 metadata 不一致');
 return selectionFromMetadata('civitai',metadata,kind,requestedAir?.canonical);
}
export function replaceSelectedResource(previous:Record<string,any>,selection:ResourceSelection,field:string):Record<string,any> {
 if(!selection.resourceVerified){
  const clean=Object.fromEntries(Object.entries(previous).filter(([key])=>!['civitaiId','civitai_id','resource_source','resource_kind','resourceVerified','resource_verified','download_url','downloadUrl'].includes(key)));
  return {...clean,[field]:selection.name,resourceVerified:false,import_unresolved_resource:true,unresolvedResource:true,import_resource_reason:'新资源未经公开 metadata 核实，请重新选择已验证资源'};
 }
 const clean=Object.fromEntries(Object.entries(previous).filter(([key])=>!['civitaiId','civitai_id','resource_source','resource_kind','resourceVerified','resource_verified','download_url','downloadUrl','import_unresolved_resource','unresolvedResource','import_unresolved_reason','import_resource_reason','unresolvedReason','resource_unresolved_reason'].includes(key)));
 return {...clean,[field]:selection.name,civitai_id:selection.civitaiId,resource_source:selection.resource_source || selection.provider,resource_kind:selection.resource_kind,download_url:selection.downloadUrl,resourceVerified:true,trigger_words:selection.triggerWords || '',base_model:selection.baseModel || ''};
}
