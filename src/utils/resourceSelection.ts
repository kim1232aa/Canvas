export interface ResourceSelection {
 name:string;provider?:string;civitaiId?:string;triggerWords?:string;baseModel?:string;downloadUrl?:string;resourceVerified?:boolean;resource_source?:string;resource_kind?:string;fromCatalog?:boolean;isCatalog?:boolean;
 /** Explicit LoRA strengths when the user/catalog provided them; never invent 0.8. */
 modelStrength?:number;clipStrength?:number;
}

/** Absolute HTTP(S) URL usable as an executable LoRA weight path (Hub paste / manual URL). */
export function isExplicitLoraWeightUrl(value: unknown): boolean {
  return /^https?:\/\/\S+/i.test(String(value ?? '').trim());
}

/**
 * Build a ResourceSelection from an explicit user-pasted weight URL.
 * Marks the path executable for the chosen provider without inventing strength
 * and without requiring Civitai AIR / catalog metadata.
 */
export function selectionFromExplicitLoraUrl(provider: string, url: string): ResourceSelection {
  const trimmed = String(url || '').trim();
  if (!isExplicitLoraWeightUrl(trimmed)) {
    throw new Error('不是可执行的 HTTP(S) LoRA 权重 URL');
  }
  if (!provider || provider === 'all') {
    throw new Error('URL 不携带执行供应商信息；请先切换到实际执行供应商标签，再导入该 LoRA URL');
  }
  return {
    name: trimmed,
    provider,
    downloadUrl: trimmed,
    civitaiId: undefined,
    triggerWords: '',
    baseModel: undefined,
    // Explicit weight URL is an executable path intent (same as typing into LoRALoader),
    // not a silent Civitai AIR resolve. Strength must still be set explicitly.
    resourceVerified: true,
    resource_source: provider,
    resource_kind: 'lora',
  };
}
function parseAir(value:string) {
 const match=value.match(/^(?:(?:urn:)?air:)?([^:]+):([^:]+):(civitai):([0-9]+)@([0-9]+)(?:\+([^+]+)|\.([^.]+))?$/i);
 return match ? {type:match[2].toLowerCase(),identity:`urn:air:${match[1]}:${match[2]}:${match[3]}:${match[4]}@${match[5]}`,versionId:match[5],fileSelector:match[6],format:match[7],canonical:`urn:air:${value.replace(/^(?:urn:)?air:/i,'')}`} : undefined;
}
export function isCivitaiAir(value:string) {
 return parseAir(value)!==undefined;
}
export function civitaiAirCanonical(value:string): string | undefined {
 return parseAir(value)?.canonical;
}

/**
 * When the LoRA name/path is a Civitai AIR, set civitai_id from it and clear a stale
 * download_url/path (e.g. leftover HF weight after pasting an AIR). Generic — no provider quirks.
 */
export function applyLoraNameToNodeValues(previous: Record<string, any>, name: unknown): Record<string, any> {
  const trimmed = String(name ?? '').trim();
  const next: Record<string, any> = { ...previous, lora_name: name };
  const air = parseAir(trimmed);
  if (air) {
    next.civitai_id = air.canonical;
    next.civitaiId = air.canonical;
    // Stale weight URL from a prior resource must not ride along with an AIR identity.
    delete next.download_url;
    delete next.downloadUrl;
    next.resource_source = next.resource_source || 'civitai';
    next.resource_kind = 'lora';
    next.resourceVerified = true;
    delete next.import_unresolved_resource;
    delete next.unresolvedResource;
    delete next.import_unresolved_reason;
  } else if (!trimmed) {
    next.civitai_id = '';
    delete next.civitaiId;
  }
  return next;
}

function modelFileFormat(value:unknown) {
 const format=String(value || '').toLowerCase();
 if(format==='safetensor' || format==='safetensors')return 'safetensor';
 if(format==='ckpt')return 'ckpt';
 if(format==='diffuser')return 'diffuser';
 return undefined;
}
export function selectionFromMetadata(provider:string,metadata:any,kind:string,requestedAir?:string):ResourceSelection {
 const isCatalog = Boolean(
   metadata.fromCatalog ||
   metadata.isCatalog ||
   metadata.catalog ||
   metadata._sourceProvider ||
   (metadata.category && (metadata.downloads !== undefined || metadata.rating !== undefined || metadata.imageUrl !== undefined))
 );
 const requestedParsedAir=parseAir(requestedAir || '');
 const targetVersionId=requestedParsedAir?.versionId || (metadata.versionId !== undefined ? String(metadata.versionId) : undefined);
 const singleModelVersion=Array.isArray(metadata.modelVersions) && metadata.modelVersions.length===1;
 let version = metadata;
 if(Array.isArray(metadata.modelVersions) && metadata.modelVersions.length > 1){
   const matched = targetVersionId
     ? metadata.modelVersions.find((v:any)=>String(v.id)===String(targetVersionId))
     : undefined;
   if(matched){
     version = matched;
   } else {
     throw new Error('多个版本候选，必须显式选择 versionId');
   }
 } else if(singleModelVersion){
   version = metadata.modelVersions[0];
 }
 const sourceAir=String(version.air || metadata.air || (parseAir(String(metadata.id)) ? metadata.id : ''));
 if(sourceAir && !parseAir(sourceAir))throw new Error('metadata AIR 未被核实：无法解析完整资源标识');
 const parsedAir=parseAir(requestedAir || sourceAir);
 if(requestedAir){
  const verifiedAir=parseAir(sourceAir);
  if(!parsedAir || !verifiedAir || parsedAir.identity!==verifiedAir.identity)throw new Error('手写 AIR 与版本 metadata 不一致或未被核实');
 }
 const air=parsedAir?.canonical || sourceAir;
 const rawKind=String(metadata.type || metadata.modelType || metadata.model?.type || metadata.model?.modelType || metadata.category || '').toLowerCase();
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
 const allowed=kind==='lora'
   ? ['lora','lycoris','locon','dora']
   : kind==='checkpoint'
   ? ['checkpoint','diffusionmodel','unet', ...(isCatalog ? ['model', 'image', 'text2img', 'text-to-image', 'base', ''] : [])]
   : [];
 if(!allowed.includes(effectiveKind))throw new Error(`资源类型未经 metadata 核实为 ${kind}`);
 if(!effectiveKind && !isCatalog)throw new Error('metadata 未标明资源类型，不能标记为已核实');
 const id=String(metadata.id || metadata.name || '');
 const modelId=singleModelVersion ? metadata.id : (metadata.modelId ?? metadata.model?.id ?? (metadata.id && version?.id && String(metadata.id) !== String(version.id) ? metadata.id : undefined));
 const versionId=singleModelVersion ? version.id : (version?.id && String(version.id) !== String(metadata.id) ? version.id : metadata.id);
 const name=provider==='civitai'
   ? air || (modelId && versionId ? `${modelId}@${versionId}` : '') || (isCatalog ? (version?.id && id !== String(version.id) ? `${id}@${version.id}` : id) : '')
   : id;
 if(!name)throw new Error('metadata 未返回可核实的资源标识');
 const words=version.trainedWords || metadata.triggerWords || metadata.trainedWords || [];
 return {name,provider,civitaiId:provider==='civitai'?name:undefined,triggerWords:Array.isArray(words)?words.join(', '):String(words),baseModel:version.baseModel || metadata.baseModel,downloadUrl:file?.downloadUrl || metadata.downloadUrl,resourceVerified:true,resource_source:provider,resource_kind:effectiveKind || kind};
}
export function verifiedSelectionOrExplicitIntent(provider:string,metadata:any):Partial<ResourceSelection> {
 try { return selectionFromMetadata(provider,metadata,'lora'); }
 catch { return {provider,resourceVerified:false,resource_source:provider,resource_kind:'lora'}; }
}
export function selectionFromCatalog(provider:string,item:any,kind:'checkpoint'|'lora'='checkpoint'):ResourceSelection {
 return selectionFromMetadata(provider,{...item,fromCatalog:true,isCatalog:true},kind);
}
export async function verifyCivitaiSelection(raw:string,kind:string):Promise<ResourceSelection> {
 const requestedAir=parseAir(raw);
 const pair=raw.match(/^([0-9]+)@([0-9]+)$/);
 const versionId=requestedAir?.versionId || pair?.[2];
 const modelId=/^[0-9]+$/.test(raw) ? raw : undefined;
 if(!versionId && !modelId)throw new Error('请填写完整 AIR 或 modelId@versionId，以公开 metadata 核实');
 const lookupId=versionId || modelId;
 const response=await fetch(`/api/civitai/model/${modelId || lookupId}${versionId ? `?versionId=${encodeURIComponent(versionId)}` : ''}`);
  if(!response.ok){
   const body=await response.text().catch(()=> '');
   throw new Error(`资源 metadata 查询失败 HTTP ${response.status}: ${body}`);
  }
 const metadata=await response.json();
 if(pair && String(metadata.modelId ?? metadata.model?.id) !== pair[1])throw new Error('modelId 与版本 metadata 不一致');
 if(versionId && String(metadata.id)!==versionId)throw new Error('versionId 与版本 metadata 不一致');
 return selectionFromMetadata('civitai',metadata,kind,requestedAir?.canonical);
}
export function replaceSelectedResource(previous:Record<string,any>,selection:ResourceSelection,field:string):Record<string,any> {
 const isFromCatalog = Boolean(
   (selection as any).fromCatalog ||
   (selection as any).isCatalog ||
   (selection as any).catalog ||
   (selection as any)._sourceProvider ||
   ((selection as any).category && ((selection as any).downloads !== undefined || (selection as any).rating !== undefined))
 );
 // Explicit HTTP(S) weight URLs are executable path intent (Hub paste ≡ manual LoRALoader URL).
 // Do not force unresolved solely because Civitai AIR / catalog metadata was never fetched.
 const explicitWeightUrl = isExplicitLoraWeightUrl(selection.downloadUrl) || isExplicitLoraWeightUrl(selection.name);
 const isVerified = (selection.resourceVerified ?? (isFromCatalog ? true : false)) || explicitWeightUrl;
 if(!isVerified && !isFromCatalog){
  const clean=Object.fromEntries(Object.entries(previous).filter(([key])=>!['civitaiId','civitai_id','resource_source','resource_kind','resourceVerified','resource_verified','download_url','downloadUrl'].includes(key)));
  return {...clean,[field]:selection.name,resourceVerified:false,import_unresolved_resource:true,unresolvedResource:true,import_resource_reason:'新资源未经公开 metadata 核实，请重新选择已验证资源'};
 }
 const downloadUrl = selection.downloadUrl || (explicitWeightUrl ? String(selection.name).trim() : undefined);
 const clean=Object.fromEntries(Object.entries(previous).filter(([key])=>!['civitaiId','civitai_id','resource_source','resource_kind','resourceVerified','resource_verified','download_url','downloadUrl','import_unresolved_resource','unresolvedResource','import_unresolved_reason','import_resource_reason','unresolvedReason','resource_unresolved_reason'].includes(key)));
 return {...clean,[field]:selection.name,civitai_id:selection.civitaiId,resource_source:selection.resource_source || selection.provider,resource_kind:selection.resource_kind || (explicitWeightUrl ? 'lora' : undefined),download_url:downloadUrl,resourceVerified:true,trigger_words:selection.triggerWords || '',base_model:selection.baseModel || ''};
}

/** Build the LoRA object sent to generate: AIR in name/path → civitaiId; never keep a stale weight path beside an AIR. */
export function normalizeLoraPayloadItem<T extends Record<string, any>>(lora: T): T {
  const name = String(lora.name ?? '').trim();
  const path = String(lora.path ?? lora.downloadUrl ?? '').trim();
  const air = civitaiAirCanonical(name) || civitaiAirCanonical(path) || civitaiAirCanonical(String(lora.civitaiId ?? lora.civitai_id ?? '').trim());
  if (!air) return lora;
  const { downloadUrl: _d, download_url: _du, path: _p, ...rest } = lora as any;
  return { ...rest, name: name || air, civitaiId: air } as T;
}
