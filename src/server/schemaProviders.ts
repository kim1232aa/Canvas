import nodeFs from 'node:fs';
import { planCanvasField, GENERIC_PAYLOAD_ALIASES } from '../utils/schemaPayloadPlan';
import nodePath from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type express from 'express';
import YAML from 'yaml';
export const sogniSchemaSource='https://raw.githubusercontent.com/Sogni-AI/sogni-protocol/main/schemas/tools/generate_image.schema.json';

// Protocol adapters are separate from canvas nodes. Model paths and fields come
// from live provider metadata. No model aliases, replacement or submit retries.
export const schemaProviders = {
  muapi: {name:'MuAPI',root:'https://api.muapi.ai',catalog:'/api/v1/models',header:'x-muapi-key',auth:'x-api-key',
    // Official: WanLoRAI2VRequest.image_url is format uri maxLength 2083 → a canvas data: URL is uploaded first via
    // POST /api/v1/upload_file (multipart field `file`, response {url}). https://muapi.ai/docs/file-upload
    referenceUpload:{kind:'multipart',path:'/api/v1/upload_file',docUrl:'https://muapi.ai/docs/file-upload'},
    // LoRA item fields when the endpoint's items Schema has no properties/$ref (KreaV2TurboLoraRequest.loras).
    // Official OpenAPI description example — not a code guess. Fetched live 2026-10-16 13:59:41 Beijing.
    loraItemFields:{pathKey:'path',strengthKey:'scale',sourceUrl:'https://api.muapi.ai/openapi.json',fetchedAt:'2026-10-16 13:59:41（北京时间）',
      docQuote:"List of LoRAs to apply (maximum 3). Example: [{'path': '...', 'scale': 1.0}]"},
  },
  wavespeed: {name:'WaveSpeed',root:'https://api.wavespeed.ai',catalog:'/api/v3/models',header:'x-wavespeed-key',auth:'Authorization',
    // Official: local files go through the direct-upload ticket (POST /api/v3/media/uploads {filename,size} → PUT data.upload.url
    // with data.upload.headers only, never the API key) and data.download_url goes into the model's image field. https://wavespeed.ai/docs/upload-files
    referenceUpload:{kind:'ticket',path:'/api/v3/media/uploads',docUrl:'https://wavespeed.ai/docs/upload-files'},
    // Path (dot-separated) to the upstream echo of the submitted input in POST/poll JSON. Used only for display contrast.
    upstreamEchoPath:'data.input',
  },
  sogni: {name:'Sogni',root:'https://api.sogni.ai',catalog:'/v1/model-catalog?mediaType=image&include=parameters',header:'x-sogni-key',auth:'Authorization'},
  // Krea: official OpenAPI (https://api.krea.ai/openapi.json) is the catalog; each
  // POST /generate/{image|video}/... operation is one model endpoint. LoRA = GET /styles.
  krea: {name:'Krea',root:'https://api.krea.ai',catalog:'/openapi.json',header:'x-krea-key',auth:'Authorization'},
  // Together: official docs.together.ai — catalog GET /v1/models; images POST /v1/images/generations (sync);
  // videos POST+GET https://api.together.ai/v2/videos (async). Serverless image_loras deprecated 2026-10-15.
  together: {name:'Together',root:'https://api.together.ai/v1',catalog:'/models',header:'x-together-key',auth:'Authorization',videoRoot:'https://api.together.ai/v2',
    // Official parameter guide (not OpenAPI): image_loras no longer available / FLUX.2 rejects. OpenAPI still lists path+scale — block via officialUnavailableParams, not rule D / loraItemFields.
    officialUnavailableParams:[{
      field:'image_loras',
      blockText:'官方参数指南：image_loras no longer available',
      docQuote:'No longer available. The FLUX models that accepted LoRA adapters have been deprecated, and the current FLUX.2 models reject this parameter.',
      docUrl:'https://docs.together.ai/docs/inference/images/parameters',
      fetchedAt:'2026-10-16 15:08:58（北京时间 / Researchy）',
    }],
  },
  // AIMLAPI: docs.aimlapi.com — catalog GET /v1/models; images POST /v1/images/generations (sync);
  // videos POST+GET /v2/video/generations (async, generation_id). LoRA: loras[{path,scale}] when model schema declares it.
  aimlapi: {name:'AIMLAPI',root:'https://api.aimlapi.com/v1',catalog:'/models?include=modalities,capabilities',header:'x-aimlapi-key',auth:'Authorization',videoRoot:'https://api.aimlapi.com/v2'},
  // Novita: docs.novita.ai — catalog GET /v3/model; SD images POST /v3/async/txt2img|img2img → poll GET /v3/async/task-result;
  // LoRA: request.loras[{model_name,strength}] strength [0,1]. Ming OpenAI images path not in this adapter (no LoRA/seed).
  novita: {name:'Novita',root:'https://api.novita.ai',catalog:'/v3/model?filter.types=checkpoint&filter.visibility=public&pagination.limit=100',header:'x-novita-key',auth:'Authorization'},
  // Venice: docs.venice.ai — catalog GET /models?type=all; images POST /image/generate (sync base64);
  // videos POST /video/queue → POST /video/retrieve (async). No custom LoRA array; only optional lora_strength for bundled models.
  venice: {name:'Venice',root:'https://api.venice.ai/api/v1',catalog:'/models?type=all',header:'x-venice-key',auth:'Authorization',
    // Live probe 2026-10-15 (docs/evidence/together-venice-lora-live-probe-2026-10-15.md): custom loras[] → HTTP 400 verbatim below; lora_strength accepted (402 billing).
    loraLocalBlock:{docUrl:'https://docs.venice.ai/api-reference/endpoint/image/generate',docQuote:"Unrecognized key(s) in object: 'loras'（官方 GenerateImageRequest 无自定义 loras[]；2026-10-15 live 探测 POST /image/generate 上游拒收原文）"}},
  // DeepInfra: docs.deepinfra.com/apis/image-generation — catalog GET /models/list (type=text-to-image);
  // images POST /v1/openai/images/generations (sync b64_json; OpenAPI twin /v1/images/generations). Auth Bearer DEEPINFRA_API_KEY.
  // Personal/private LoRA needs Dashboard deploy first (docs.deepinfra.com/private-models/lora-image) — out of scope this round; no empty-shell LoRA.
  deepinfra: {name:'DeepInfra',root:'https://api.deepinfra.com',catalog:'/models/list',header:'x-deepinfra-key',auth:'Authorization',
    loraLocalBlock:{docUrl:'https://docs.deepinfra.com/private-models/lora-image.md',docQuote:'Deploy LoRA adapters for image generation on top of supported base image models. Source your LoRA from Civitai.… Once Running, the model is ready to use.（公共 OpenAI images 无 LoRA 字段；个人 LoRA 须先在控制台部署）'}},
} as const;

/** Local LoRA block reason from provider-table data: verbatim official doc quote + URL. */
const taskSubmissions=new Map<string,{model:string;prompt?:string;negative_prompt?:string;actualRequest:any}>();
export const LOCAL_BLOCK_PREFIX='没有发出去'; // clean-1333 #3: submit always read (or reused) the Schema first
/**
 * 「拟发送（未出站）」 for a local block: the Schema-scoped request the endpoint would have received (same mapping as a real
 * submit), plus the canvas LoRAs that were NOT sent (name + strength only, no canvas-internal fields). Diagnostics
 * (mapping, schemaFields) sit beside `parameters`, never inside it.
 */
export function proposedRequestOf(definition:any,parameters:any,mapping:any[],loras:any[]|undefined):Record<string,any> {
  const props=definition?.inputSchema?.properties;
  return {endpoint:definition?.endpoint,parameters,mapping,
    ...(props?{schemaFields:Object.keys(props)}:{}),
    ...(Array.isArray(loras) && loras.length?{requestedLoras:loras.map((l:any)=>({name:String(l?.path || l?.url || l?.civitaiId || l?.name || ''),strength:l?.strength ?? l?.modelStrength ?? null}))}:{})};
}

/**
 * Map canvas LoRA nodes → Schema item objects (generic).
 * Priority: (1) items.properties / $ref-resolved properties; (2) provider-table loraItemFields (must cite official source);
 * (3) neither → throw local block 「Schema 未定义 LoRA 强度字段」. Never invent {path,scale} as a silent default.
 */
export function mapSchemaLoraItems(loras:any[], itemSchema:any, providerMeta:any, model:string):any[] {
  const resource=(l:any)=>l.path || l.url || l.civitaiId || l.name;
  const strength=(l:any)=>l.strength ?? l.modelStrength ?? l.scale;
  if(itemSchema?.type==='string')return loras.map(resource);
  const props=itemSchema?.properties;
  if(props && typeof props==='object') {
    if(props.model)return loras.map((l:any)=>({model:resource(l),weight:strength(l)}));
    const pathKey=['path','url','model_name','name','id'].find(k=>Object.hasOwn(props,k)) || 'path';
    const strengthKey=['scale','weight','strength','modelStrength'].find(k=>Object.hasOwn(props,k));
    // No strength field in the item Schema: send the resource only, as the Schema defines it.
    if(!strengthKey)return loras.map((l:any)=>({[pathKey]:resource(l)}));
    return loras.map((l:any)=>({[pathKey]:resource(l),[strengthKey]:strength(l)}));
  }
  const cfg=providerMeta?.loraItemFields as {pathKey:string;strengthKey:string;sourceUrl:string;fetchedAt:string;docQuote:string}|undefined;
  if(cfg?.pathKey && cfg?.strengthKey && cfg?.sourceUrl) {
    return loras.map((l:any)=>({[cfg.pathKey]:resource(l),[cfg.strengthKey]:strength(l)}));
  }
  // Item shape not described: send the canvas LoRA entries as built; upstream decides.
  return loras;
}

export function loraLocalBlockMessage(providerName:string,block:{docUrl:string;docQuote:string}):string {
  return `${LOCAL_BLOCK_PREFIX}\n${providerName} 官方原文：「${block.docQuote}」\n来源：${block.docUrl}\n当前端点不接受 LoRA；请移除 LoRA 节点。`;
}
/** Official-doc 「不可用 / 会拒绝」 field block (generic). Used when OpenAPI still lists the field but the parameter guide says it is unavailable. */
export type OfficialUnavailableParam = {field:string;blockText:string;docQuote:string;docUrl:string;fetchedAt:string};
export function officialUnavailableMessage(entry:OfficialUnavailableParam):string {
  return `${LOCAL_BLOCK_PREFIX}\n${entry.blockText}\n官方原文：「${entry.docQuote}」\n来源：${entry.docUrl}（抓取 ${entry.fetchedAt}）`;
}
/** Match a configured unavailable field against Schema props / LoRA wire target. Works even when Schema still declares the field. */
export function matchOfficialUnavailable(providerMeta:any, props:any, canvasHasLoras:boolean):OfficialUnavailableParam|undefined {
  const list = providerMeta?.officialUnavailableParams as OfficialUnavailableParam[]|undefined;
  if (!Array.isArray(list) || !list.length || !canvasHasLoras) return undefined;
  const loraTargets = ['loras','lora_list','model_id','image_loras','styles'];
  const target = loraTargets.find((k) => props && Object.hasOwn(props, k));
  return list.find((u) => u?.field && (u.field === target || (props && Object.hasOwn(props, u.field) && loraTargets.includes(u.field))));
}
/**
 * Shared schema-provider trace ledger: submit and every poll are separate HTTP requests, so each request's upstream
 * segments are appended here per `${provider}:${taskId}` and merged into the history item (success or failure).
 */
export const taskTraces=new Map<string,any[]>();
const TASK_TRACE_LIMIT=500;
export function appendTaskTraces(taskKey:string,segments:readonly any[]|undefined):any[] {
  const list=taskTraces.get(taskKey) || [];
  for(const t of segments || [])if(!list.includes(t))list.push(t);
  taskTraces.delete(taskKey);taskTraces.set(taskKey,list);
  while(taskTraces.size>TASK_TRACE_LIMIT)taskTraces.delete(taskTraces.keys().next().value as string);
  return list;
}
const SUCCESS_TASK_STATUSES=['completed','succeeded','success'];
const filledText=(v:any)=>v!==undefined && v!==null && v!=='' && !(typeof v==='object' && !Array.isArray(v) && !Object.keys(v).length);
/**
 * Generic: a polled task is a terminal non-success when its status is a known failure status, `waiting_for_user`
 * (the canvas driver stops polling there), or any non-success status that carries an error / waitingReason.
 */
export function isTaskFailureBody(body:any):boolean {
  const st=typeof body?.status==='string'?body.status.toLowerCase():'';
  if(!st || SUCCESS_TASK_STATUSES.includes(st))return false;
  return TASK_FAILURE_STATUSES.includes(st) || st==='waiting_for_user' || filledText(body?.error) || filledText(body?.waitingReason);
}
/** First upstream message string (message/msg/error/detail/reason…, searched through any nesting), verbatim first line. */
export function firstUpstreamMessage(value:any):string|undefined {
  const KEYS=['message','msg','error','detail','error_message','description','reason'];
  const seen=new Set<any>();
  const walk=(v:any,depth:number,underKey:boolean):string|undefined=>{
    if(v==null || depth>8)return undefined;
    if(typeof v==='string')return underKey && v.trim()?v.trim().split(/\r?\n/)[0]:undefined;
    if(typeof v!=='object' || seen.has(v))return undefined;seen.add(v);
    if(Array.isArray(v)){for(const x of v){const h=walk(x,depth+1,underKey);if(h)return h;}return undefined;}
    for(const k of KEYS)if(k in v){const h=walk(v[k],depth+1,true);if(h)return h;}
    for(const [k,x] of Object.entries(v))if(!KEYS.includes(k) && x && typeof x==='object'){const h=walk(x,depth+1,false);if(h)return h;}
    return undefined;
  };
  if(typeof value==='string'){try{return walk(JSON.parse(value),0,false) ?? value.trim().split(/\r?\n/)[0];}catch{return value.trim().split(/\r?\n/)[0] || undefined;}}
  return walk(value,0,false);
}
/** LoRA count limit declared by the model's official Schema: `maxItems` on a LoRA-named array field (incl. anyOf/oneOf). No maxItems → null (never guessed from prose). */
export function schemaLoraMaxItems(props:any):{field:string;maxItems:number}|null {
  for(const [field,spec] of Object.entries(props || {})) {
    if(!/lora/i.test(field))continue;
    for(const v of [spec,...((spec as any)?.anyOf || []),...((spec as any)?.oneOf || [])] as any[])
      if(v?.type==='array' && Number.isInteger(v.maxItems) && v.maxItems>0)return {field,maxItems:v.maxItems};
  }
  return null;
}
/** Terminal failure task statuses (same set the canvas driver treats as failed). */
export const TASK_FAILURE_STATUSES=['failed','sandbox_mock','partial_failure','cancelled','canceled','timeout','timed_out','deleted','error'];

/** Schema `size` declared as a "W<sep>H" string: separator from its default (e.g. "1024*1024" → "*"); else null. */
export function sizeStringSeparator(spec:any):string|null {
  const vs=[spec,...(spec?.anyOf||[]),...(spec?.oneOf||[])].filter(Boolean);
  for(const v of vs) {
    if(v?.type!=='string' || Array.isArray(v.enum))continue;
    const m=typeof v.default==='string'?/^\d+([*x×:,])\d+$/i.exec(v.default):null;
    if(m)return m[1];
  }
  return null;
}
type Provider=keyof typeof schemaProviders;

/** Krea catalog rows derived from the live official OpenAPI document. Only
 *  POST /generate/image|video/... operations are generation endpoints. */
export function kreaCatalogRows(document:any) {
  const rows:any[]=[];
  for(const [path,ops] of Object.entries<any>(document?.paths || {})) {
    const m=/^\/generate\/(image|video)\/(.+)$/.exec(path);const op=ops?.post;
    if(!m || !op)continue;
    const schema=resolveSchemaRefs(op.requestBody?.content?.['application/json']?.schema,document);
    rows.push({id:`${m[1]}/${m[2]}`,name:op.summary || m[2],category:m[1]==='video'?'text-to-video':'text-to-image',
      family:m[2].split('/')[0],description:op.description || '',endpoint:path,parameters:schema,deprecated:op.deprecated===true});
  }
  return rows;
}
/** Krea job status → canvas status vocabulary (raw status is kept in rawResponse). */
export function kreaJobOutputs(job:any):string[] {
  const urls=job?.result?.urls;
  if(Array.isArray(urls))return urls.map((u:any)=>typeof u==='string'?u:u?.url).filter(Boolean);
  if(urls && typeof urls==='object')return Object.values(urls).filter((u:any)=>typeof u==='string') as string[];
  return [];
}
/** Together/Novita/Venice: no built-in request Schema (画布 2026-10-15). Catalog rows carry no `parameters`; only a genuine official runtime Schema may populate it. */
// Iron rule 3: no built-in Schema / guessed endpoint fallback. Missing official Schema → local 400 (没有发出去), no POST.
export const schemaUnavailableBlock=(providerName:string,model:string,reason:string,sourceUrl:string|null,extra:Record<string,unknown>={})=>Object.assign(new Error(`没有发出去：${providerName} 模型 ${model} 官方 Schema 不可用（${reason}；来源 ${sourceUrl ?? '无'}）；未发送生成请求，不使用内置 Schema 或猜测端点兜底。`),{status:400,errorSource:'local',schemaUrl:sourceUrl,...extra});
/** Normalize GET /v1/models array → canvas catalog rows (image + video only). */
export function togetherCatalogRows(models:any[]) {
  return (Array.isArray(models)?models:[]).filter((m:any)=>m && (m.type==='image' || m.type==='video')).map((m:any)=>({
    id:m.id,name:m.display_name || m.id,category:m.type==='video'?'text-to-video':'text-to-image',
    family:m.organization || String(m.id||'').split('/')[0],description:m.link || '',type:m.type,
    endpoint:m.type==='video'?'/videos':'/images/generations',
    pricing:m.pricing,metadata:m,
  }));
}
export function togetherImageOutputs(response:any,endpoint='https://api.together.ai/v1/images/generations'):string[] {
  return imageOutputsBySignature(response,'Together',endpoint);
}
export function togetherVideoOutputs(job:any):string[] {
  const url=job?.outputs?.video_url;return url?[String(url)]:[];
}
/** In-memory completed image tasks (Together images API is synchronous). */
const togetherSyncTasks=new Map<string,{status:string;outputs:string[];rawResponse:any;error?:any}>();

/** DeepInfra GET /models/list → text-to-image rows only (id = model_name). Official 2026-11-02. */
export function deepinfraCatalogRows(models:any[]) {
  return (Array.isArray(models)?models:[]).filter((m:any)=>{
    const t=String(m?.type || m?.reported_type || '');
    return t==='text-to-image' || /^text.to.image$/i.test(t);
  }).map((m:any)=>{
    const id=String(m.model_name || m.id || '');
    return {
      id,name:id,category:'text-to-image',family:id.split('/')[0] || '',
      description:typeof m.description==='string'?m.description:'',type:'image',
      endpoint:'/v1/openai/images/generations',
      cover_url:m.cover_img_url,pricing:m.pricing,tags:m.tags || [],
      supportsLora:false,metadata:m,
    };
  }).filter((r:any)=>r.id);
}
/** Official response_format is b64_json only; MIME is detected from returned bytes, not inferred. */
export function deepinfraImageOutputs(response:any,endpoint='https://api.deepinfra.com/v1/openai/images/generations'):string[] {
  return imageOutputsBySignature(response,'DeepInfra',endpoint);
}
/** In-memory completed image tasks (DeepInfra images API is synchronous). */
const deepinfraSyncTasks=new Map<string,{status:string;outputs:string[];rawResponse:any;error?:any}>();

function aimlapiIsImageModel(m:any):boolean {
  const out=m?.modalities?.output;const type=String(m?.type||'');const tags=Array.isArray(m?.tags)?m.tags:[];
  return (Array.isArray(out)&&out.includes('image')) || /image/i.test(type) || tags.includes('playground:image');
}
function aimlapiIsVideoModel(m:any):boolean {
  const out=m?.modalities?.output;const type=String(m?.type||'');const tags=Array.isArray(m?.tags)?m.tags:[];
  return (Array.isArray(out)&&out.includes('video')) || /video/i.test(type) || tags.includes('playground:video');
}
/** Normalize GET /v1/models → canvas rows (image + video). Dedupes by id preferring image-generations. */
export function aimlapiCatalogRows(models:any[]) {
  const list=Array.isArray(models)?models:[];
  const byId=new Map<string,any>();
  for(const m of list) {
    if(!m?.id || (!aimlapiIsImageModel(m) && !aimlapiIsVideoModel(m)))continue;
    const isVideo=aimlapiIsVideoModel(m) && !aimlapiIsImageModel(m);
    const isEdit=/image-edit|image-to-image|editing/i.test(String(m.type||''));
    const prev=byId.get(m.id);
    // Prefer text-to-image generations over edit/duplicate aliases with same id.
    if(prev && (isEdit || (isVideo===false && /image-edit/i.test(String(prev.type||''))===false && prev._preferGen)))continue;
    // Catalog capability/schema is unknown unless the provider actually returned it.
    // Model names are labels, not evidence of request fields.
    const supportsLora=typeof m.supportsLora==='boolean'?m.supportsLora:
      m.parameters?.properties && Object.hasOwn(m.parameters.properties,'loras')?true:undefined;
    byId.set(m.id,{
      id:m.id,name:m.info?.name || m.id,category:isVideo?'text-to-video':(isEdit?'image-to-image':'text-to-image'),
      family:m.info?.developer || String(m.id).split('/')[0],description:m.info?.description || '',
      type:isVideo?'video':'image',endpoint:isVideo?'/video/generations':'/images/generations',
      parameters:m.parameters,
      supportsLora,tags:m.tags || [],modalities:m.modalities,capabilities:m.capabilities,
      docsUrl:m.info?.docsUrl,metadata:m,_preferGen:!isEdit && !isVideo,
    });
  }
  return [...byId.values()].map(({_preferGen,...row})=>row);
}
export function aimlapiImageOutputs(response:any,endpoint='https://api.aimlapi.com/v1/images/generations'):string[] {
  return imageOutputsBySignature(response,'AIMLAPI',endpoint);
}
function detectedImageMime(bytes:Buffer):string|undefined {
  if(bytes.length>=8 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
  if(bytes.length>=3 && bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff)return 'image/jpeg';
  if(bytes.length>=12 && bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP')return 'image/webp';
  return undefined;
}
function imageOutputsBySignature(response:any,provider:string,endpoint:string):string[] {
  const data=Array.isArray(response?.data)?response.data:[];
  return data.map((item:any,index:number)=>{
    if(typeof item?.url==='string' && item.url)return item.url;
    const encoded=item?.b64_json;
    if(typeof encoded!=='string' || !encoded)
      throw Object.assign(new Error(`${provider} data[${index}] 未包含 url 或 b64_json；上游响应已保留。`),{status:502,errorSource:'upstream-protocol',rawResponse:response,endpoint});
    if(!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
      throw Object.assign(new Error(`${provider} data[${index}].b64_json 不是有效 Base64 图片；上游响应已保留，未推断 MIME 类型。`),{status:502,errorSource:'upstream-protocol',rawResponse:response,endpoint});
    let bytes:Buffer;try{bytes=Buffer.from(encoded,'base64');}catch{
      throw Object.assign(new Error(`${provider} data[${index}].b64_json 无法解码；上游响应已保留。`),{status:502,errorSource:'upstream-protocol',rawResponse:response,endpoint});
    }
    const mime=detectedImageMime(bytes);
    const canonicalBase64=bytes.toString('base64').replace(/=+$/,'');
    if(!mime || canonicalBase64!==encoded.replace(/=+$/,''))
      throw Object.assign(new Error(`${provider} data[${index}].b64_json 不是可识别的 PNG、JPEG 或 WebP 图片；上游响应已保留，未推断 MIME 类型。`),{status:502,errorSource:'upstream-protocol',rawResponse:response,endpoint});
    return `data:${mime};base64,${encoded}`;
  }).filter(Boolean) as string[];
}
export function aimlapiVideoOutputs(job:any):string[] {
  const candidates=[job?.video?.url,job?.video_url,job?.url,job?.output?.url,job?.outputs?.video_url,
    ...(Array.isArray(job?.data)?job.data.map((d:any)=>d?.url || d?.video_url):[])];
  return candidates.filter((u:any)=>typeof u==='string' && u).map(String);
}
/** First POST requestBody JSON schema of an official OpenAPI document (e.g. AIMLAPI /docs-json?model=…). */
export function openApiRequestSchema(doc:any):any|null {
  for(const item of Object.values(doc?.paths || {}) as any[]) {
    const schema=item?.post?.requestBody?.content?.['application/json']?.schema;
    if(schema?.properties && typeof schema.properties==='object')return schema;
  }
  return null;
}

/** Detect only a schema-declared automatic fallback selector; field names/models are never inferred. */
export function schemaAutoFallbackSelection(payload:Record<string,unknown>,schema:any,sourceUrl?:string):{field:string;value:unknown;description:string;sourceUrl?:string}|null {
  const properties=schema?.properties;
  if(!properties || typeof properties!=='object')return null;
  const branches=(s:any):any[]=>[s,...(s?.anyOf||[]),...(s?.oneOf||[]),...(s?.allOf||[])].flatMap((x:any,i:number)=>i===0?[x]:branches(x));
  const auto=(v:any)=>typeof v==='string' && v.trim().toLowerCase()==='auto';
  for(const [field,fieldSchema] of Object.entries(properties) as Array<[string,any]>) {
    const variants=branches(fieldSchema);
    const descriptions:string[]=variants.map((v:any):string=>typeof v.description==='string'?v.description:'').filter(Boolean);
    const description=descriptions.join(' ');
    // Require a positive, local relationship in the same clause. Mere co-occurrence
    // (e.g. "auto has no fallback; manual uses fallback") is not enough evidence.
    const saysAutoFallback=descriptions.some(text=>text.split(/[;\n]+/).some(clause=>{
      const match=clause.match(/\bauto\b[\s\S]{0,180}\b(?:uses?|runs?|triggers?|invokes?|follows?)\b[\s\S]{0,180}\bfallback\b/i)
        || clause.match(/\bauto\b[\s\S]{0,100}\b(?:will|can|may)\s+fallback\b/i);
      return Boolean(match && !/\b(?:no|not|never|without)\b/i.test(match[0]));
    }));
    if(!saysAutoFallback)continue;
    const values=variants.flatMap(v=>[
      ...(Array.isArray(v.enum)?v.enum:[]),
      ...(Object.hasOwn(v,'const')?[v.const]:[]),
      ...(Object.hasOwn(v,'default')?[v.default]:[]),
      ...(Object.hasOwn(v,'example')?[v.example]:[]),
    ]);
    const proseDefault=/\bauto\b.{0,24}\(\s*default\s*\)/i.test(description) || /\bdefault\s*(?:is|:|=)?\s*`?auto`?\b/i.test(description);
    const hasAutoChoice=values.some(auto) || proseDefault;
    if(!hasAutoChoice)continue;
    const hasExplicit=Object.hasOwn(payload,field) && payload[field]!==undefined && payload[field]!==null && payload[field]!=='';
    const selected=hasExplicit?payload[field]:variants.find(v=>Object.hasOwn(v,'default'))?.default ?? (proseDefault?'auto':undefined);
    if(auto(selected))return {field,value:selected,description,...(sourceUrl?{sourceUrl}:{})};
  }
  return null;
}

/** Official runtime OpenAPI sources (fetched on every schema request; no built-in / cached snapshot fallback). */
export const officialOpenApiSources={together:'https://docs.together.ai/openapi.yaml',venice:'https://api.venice.ai/doc/api/swagger.yaml',deepinfra:'https://api.deepinfra.com/openapi.json'} as const;
/** POST requestBody application/json schema at `path` in an OpenAPI document, $refs resolved. null if absent. */
export function openApiPathRequestSchema(doc:any,path:string):any|null {
  const raw=doc?.paths?.[path]?.post?.requestBody?.content?.['application/json']?.schema;
  if(!raw)return null;
  const schema=resolveSchemaRefs(raw,doc);
  return schema?.properties && typeof schema.properties==='object'?schema:null;
}
/** Overlay upstream per-model model_spec.constraints (Venice /models) onto the official request Schema as range/enum. Only keys the upstream returned; never invents. */
export function applyModelSpecConstraints(schema:any,constraints:any):any {
  if(!schema?.properties || !constraints || typeof constraints!=='object')return schema;
  const out={...schema,properties:{...schema.properties}};
  const set=(k:string,patch:Record<string,unknown>)=>{if(out.properties[k])out.properties[k]={...out.properties[k],...patch};};
  if(constraints.steps && typeof constraints.steps==='object') {
    const patch:any={};if(typeof constraints.steps.max==='number')patch.maximum=constraints.steps.max;if(typeof constraints.steps.default==='number')patch.default=constraints.steps.default;set('steps',patch);
  }
  if(Array.isArray(constraints.resolutions))set('resolution',{enum:constraints.resolutions});
  if(Array.isArray(constraints.aspectRatios))set('aspect_ratio',{enum:constraints.aspectRatios});
  if(Array.isArray(constraints.qualities))set('quality',{enum:constraints.qualities});
  if(typeof constraints.promptCharacterLimit==='number')set('prompt',{maxLength:constraints.promptCharacterLimit});
  if(typeof constraints.defaultAspectRatio==='string')set('aspect_ratio',{default:constraints.defaultAspectRatio});
  if(typeof constraints.defaultResolution==='string')set('resolution',{default:constraints.defaultResolution});
  // Per-model sizing mode, read only from the upstream constraints keys (no model-name rules):
  // aspectRatios present → ratio model: width/height not in this model's contract (docs.venice.ai: Qwen family rejects width/height with 400).
  // aspectRatios absent → pixel model: aspect_ratio/resolution not in contract. resolutions/qualities absent → those tiers not offered.
  const drop=(k:string,reason:string)=>{if(out.properties[k]){delete out.properties[k];(out['x-modelSpecOmitted'] ||= {})[k]=reason;}};
  if(Array.isArray(constraints.aspectRatios)) {
    drop('width','模型 constraints 声明 aspectRatios（比例模型），不接受像素 width');drop('height','模型 constraints 声明 aspectRatios（比例模型），不接受像素 height');
    if(!Array.isArray(constraints.resolutions))drop('resolution','模型 constraints 无 resolutions');
    if(!Array.isArray(constraints.qualities))drop('quality','模型 constraints 无 qualities');
  } else if(typeof constraints.widthHeightDivisor==='number') {
    drop('aspect_ratio','模型 constraints 无 aspectRatios（像素模型）');drop('resolution','模型 constraints 无 resolutions（像素模型）');
    if(!Array.isArray(constraints.qualities))drop('quality','模型 constraints 无 qualities');
  }
  return out;
}
/** Range/enum/maxItems check of canvas-mapped values against the declared Schema. Returns a verbatim-ready reason or null. Never clamps. */
export function schemaConstraintViolation(field:string,value:unknown,schema:any):string|null {
  if(!schema || value===undefined || value===null)return null;
  // Generic OpenAPI structured flag: deprecated fields are refused locally, official description quoted verbatim.
  if(schema.deprecated===true)return `${field} 在官方 Schema 中标记为 deprecated：${schema.description ?? '(无描述)'}`;
  const variants=[schema,...(schema.anyOf||[]),...(schema.oneOf||[])];
  if(schema.anyOf || schema.oneOf) {
    const reasons=variants.slice(1).map((v:any)=>schemaConstraintViolation(field,value,v));
    return reasons.some((r:any)=>r===null)?null:reasons.find(Boolean) || null;
  }
  if(schema.type==='object' && value && typeof value==='object' && !Array.isArray(value)) {
    for(const [k,v] of Object.entries(value as any)){const r=schemaConstraintViolation(`${field}.${k}`,v,schema.properties?.[k]);if(r)return r;}
    return null;
  }
  if(schema.type==='object' && typeof value!=='object')return `${field}=${JSON.stringify(value)} 类型不符（官方 Schema 为 object）`;
  if(schema.type==='string' && Array.isArray(schema.enum) && typeof value==='string' && !schema.enum.includes(value))return `${field}=${JSON.stringify(value)} 不在官方 enum ${JSON.stringify(schema.enum)}`;
  // "W<sep>H" size string with numeric minimum/maximum (e.g. WaveSpeed size 256~1536): range applies per dimension.
  if(schema.type==='string' && typeof value==='string' && (typeof schema.minimum==='number' || typeof schema.maximum==='number')) {
    const sep=sizeStringSeparator(schema);const parts=sep?value.split(sep):[];
    if(sep && (parts.length!==2 || parts.some(x=>!/^\d+$/.test(x))))return `${field}=${JSON.stringify(value)} 不是官方格式 "W${sep}H"`;
    for(const n of parts.map(Number))if(typeof schema.minimum==='number' && n<schema.minimum || typeof schema.maximum==='number' && n>schema.maximum)
      return `${field}=${JSON.stringify(value)} 单边 ${n} 超出官方 Schema 范围 [${schema.minimum ?? '-∞'}, ${schema.maximum ?? '∞'}]`;
  }
  if(Array.isArray(value) && typeof schema.maxItems==='number' && value.length>schema.maxItems)return `${field} 共 ${value.length} 项，超出官方 maxItems ${schema.maxItems}`;
  if((schema.type==='integer' || schema.type==='number') && value!=='') {
    const n=Number(value);
    if(!Number.isFinite(n))return `${field}=${JSON.stringify(value)} 不是数字`;
    if(schema.type==='integer' && !Number.isInteger(n))return `${field}=${n} 不是整数（官方 Schema 为 integer）`;
    if(typeof schema.minimum==='number' && n<schema.minimum || typeof schema.maximum==='number' && n>schema.maximum)
      return `${field}=${n} 超出官方 Schema 范围 [${schema.minimum ?? '-∞'}, ${schema.maximum ?? '∞'}]`;
  }
  return null;
}
/** Canvas LoRA nodes → AIMLAPI loras[{path,scale}] (official; scale required, 0–4). Count limit is NOT checked here:
 *  the submit route's generic schemaLoraMaxItems(props) reads loras.maxItems from the model Schema (trace-fix2 #5). */
export function aimlapiLoras(loras:any[]) {
  return loras.map((l:any)=>{
    const path=String(l.path || l.url || l.civitaiId || l.name || '').trim();
    const raw=l.scale ?? l.strength ?? l.modelStrength;
    const scale=Number(raw);
    if(!path)throw Object.assign(new Error('AIMLAPI LoRA 缺少 path（URL 或 HuggingFace owner/repo）'),{status:400,errorSource:'local'});
    if(raw===undefined || raw===null || raw==='')return {path};
    return {path,scale:Number.isFinite(scale)?scale:raw};
  });
}
const aimlapiSyncTasks=new Map<string,{status:string;outputs:string[];rawResponse:any;error?:any}>();

export function novitaCatalogRows(models:any[]) {
  return (Array.isArray(models)?models:[]).filter((m:any)=>{
    const t=typeof m?.type==='object'?m.type?.name:m?.type;
    return String(t||'').toLowerCase()==='checkpoint' && (m.sd_name_in_api || m.sd_name);
  }).map((m:any)=>({
    id:m.sd_name_in_api || m.sd_name,name:m.name || m.model_name || m.sd_name_in_api || m.sd_name,
    category:'text-to-image',family:m.base_model || '',description:m.model_details?.description || '',
    type:'image',endpoint:'/v3/async/txt2img',
    ...(typeof m.supportsLora==='boolean'?{supportsLora:m.supportsLora}:{}),
    cover_url:m.cover_url,base_model:m.base_model,tags:m.tags || [],metadata:m,
  }));
}
/** Generic loader for provider declarations transcribed from official HTML docs (data files, read at runtime). */
export function loadProviderDeclaration(provider:string,endpointPath:string,dir=nodePath.join(process.cwd(),'src/config/providerDeclarations')):any|null {
  let files:string[];try{files=nodeFs.readdirSync(dir).filter(f=>f.endsWith('.json'));}catch{return null;}
  for(const f of files){const d=JSON.parse(nodeFs.readFileSync(nodePath.join(dir,f),'utf8'));if(d.provider===provider && d.endpointPath===endpointPath && d.inputSchema)return {...d,file:'src/config/providerDeclarations/'+f};}
  return null;
}
/** Official Novita img2video model_name values (SVD / SVD-XT). Not present in GET /v3/model checkpoints. */
export function novitaImg2VideoDedicatedModels(decl:any=loadProviderDeclaration('novita','/v3/async/img2video')):string[] {
  if(!decl)return [];
  if(Array.isArray(decl.dedicatedModels))return decl.dedicatedModels.map((x:any)=>String(x));
  const en=decl.inputSchema?.properties?.model_name?.enum;
  return Array.isArray(en)?en.map((x:any)=>String(x)):[];
}

export function novitaLoraCatalogRows(models:any[]) {
  return (Array.isArray(models)?models:[]).filter((m:any)=>{
    const t=typeof m?.type==='object'?m.type?.name:m?.type;
    return String(t||'').toLowerCase()==='lora' && (m.sd_name_in_api || m.sd_name);
  }).map((m:any)=>({
    id:m.sd_name_in_api || m.sd_name,name:m.name || m.sd_name_in_api || m.sd_name,
    loraId:m.sd_name_in_api || m.sd_name,slug:m.sd_name_in_api || m.sd_name,
    family:m.base_model,base_model:m.base_model,cover_url:m.cover_url,description:m.model_details?.description || '',
    tags:m.tags || [],metadata:m,
  }));
}
/** Canvas LoRA nodes → Novita request.loras[{model_name,strength}] (official; strength required, [0,1], max 5). */
export function novitaLoras(loras:any[]) {
  // 'max 5' comes only from a search snapshot (original page 404): not verified, so no local count block; upstream errors pass through verbatim.
  return loras.map((l:any)=>{
    const model_name=String(l.path || l.url || l.civitaiId || l.name || l.model_name || '').trim();
    const raw=l.strength ?? l.modelStrength ?? l.scale;
    if(!model_name)throw Object.assign(new Error('Novita LoRA 缺少 model_name（请用 GET /v3/model?filter.types=lora 的 sd_name_in_api）'),{status:400,errorSource:'local'});
    if(raw===undefined || raw===null || raw==='')return {model_name};
    const strength=Number(raw);
    return {model_name,strength:Number.isFinite(strength)?strength:raw};
  });
}
export function novitaTaskStatus(raw:any):string {
  const s=String(raw||'');
  if(s==='TASK_STATUS_SUCCEED')return 'completed';
  if(s==='TASK_STATUS_FAILED')return 'failed';
  if(s==='TASK_STATUS_QUEUED')return 'queued';
  if(s==='TASK_STATUS_PROCESSING')return 'processing';
  return s.toLowerCase();
}
export function novitaOutputs(data:any):string[] {
  const images=Array.isArray(data?.images)?data.images:[];
  const videos=Array.isArray(data?.videos)?data.videos:[];
  return [
    ...images.map((i:any)=>i?.image_url).filter((u:any)=>typeof u==='string' && u),
    ...videos.map((v:any)=>v?.video_url).filter((u:any)=>typeof u==='string' && u),
  ].map(String);
}

export function veniceCatalogRows(models:any[]) {
  return (Array.isArray(models)?models:[]).filter((m:any)=>m && (m.type==='image' || m.type==='video')).map((m:any)=>{
    const isVideo=m.type==='video';
    const spec=m.model_spec || {};
    const constraints=spec.constraints || {};
    return {
      id:m.id,name:spec.name || m.id,category:isVideo?(constraints.model_type==='image-to-video'?'image-to-video':'text-to-video'):'text-to-image',
      family:m.owned_by || 'venice.ai',description:spec.modelSource || '',type:m.type,
      endpoint:isVideo?'/video/queue':'/image/generate',
      supportsLora:false,constraints,pricing:spec.pricing,traits:spec.traits,metadata:m,
    };
  });
}
function veniceImageMime(format:string):string|undefined {
  return ({jpeg:'image/jpeg',jpg:'image/jpeg',png:'image/png',webp:'image/webp'} as Record<string,string>)[String(format||'').toLowerCase()];
}
function veniceImageBytesMatch(bytes:Buffer,mime:string):boolean {
  if(mime==='image/png')return bytes.length>=8 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(mime==='image/jpeg')return bytes.length>=3 && bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff;
  if(mime==='image/webp')return bytes.length>=12 && bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP';
  return false;
}
export function veniceImageOutputs(response:any,format='webp'):string[] {
  const images=Array.isArray(response?.images)?response.images:[];
  const expectedMime=veniceImageMime(format);
  return images.map((img:any)=>{
    if(typeof img!=='string' || !img)return undefined;
    if(img.startsWith('http://') || img.startsWith('https://'))return img;
    const uri=img.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/i);
    if(uri) {
      const mime=uri[1].toLowerCase(),bytes=Buffer.from(uri[2],'base64');
      return veniceImageBytesMatch(bytes,mime)?`data:${mime};base64,${uri[2]}`:undefined;
    }
    if(!expectedMime || !/^[A-Za-z0-9+/]+={0,2}$/.test(img))return undefined;
    let bytes:Buffer;try{bytes=Buffer.from(img,'base64');}catch{return undefined;}
    if(!bytes.length || !veniceImageBytesMatch(bytes,expectedMime))return undefined;
    return `data:${expectedMime};base64,${img}`;
  }).filter(Boolean) as string[];
}
export function veniceVideoStatus(raw:any):string {
  const s=String(raw||'').toUpperCase();
  if(s==='COMPLETED')return 'completed';
  if(s==='PROCESSING')return 'processing';
  return String(raw||'').toLowerCase();
}
const veniceSyncTasks=new Map<string,{status:string;outputs:string[];rawResponse:any;error?:any}>();
const veniceVideoTasks=new Map<string,{model:string;downloadUrl?:string}>();

interface Dependencies {
  fetch:(meta:any,url:string,init?:RequestInit)=>Promise<Response>;
  key:(provider:string,override?:string)=>string;
  record:(item:any)=>any | Promise<any>;
  /** Upstream call segments recorded so far in the CURRENT server request (generationContext). Optional: tests may omit. */
  traces?:()=>any[];
  durable:(url:string)=>Promise<any>;
}

/** Fetch the public Sogni hosted-tool Schema without forwarding any Sogni credential to GitHub. */
export async function fetchSogniGenerateImageSchema(
  depFetch: Dependencies['fetch'],
  route: string,
  model = '(catalog)',
): Promise<{schema:any;sourceUrl:string}> {
  const meta={provider:'sogni',route,model,key:''};
  let response:Response;
  try {
    response=await depFetch(meta,sogniSchemaSource,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(60000)});
  } catch (cause:any) {
    const error=Object.assign(new Error(`Network error fetching Sogni official generate_image Schema; no HTTP response was received. GET ${sogniSchemaSource}: ${cause?.message || cause}`),{
      status:502,errorSource:'network',endpoint:sogniSchemaSource,cause,
    });
    throw error;
  }
  const raw=await response.text();
  if(!response.ok)throw Object.assign(new Error(`Sogni official generate_image Schema GET ${sogniSchemaSource} → HTTP ${response.status}: ${raw}`),{
    status:response.status,errorSource:'upstream',endpoint:sogniSchemaSource,rawResponse:raw,
  });
  let schema:any;
  try{schema=JSON.parse(raw);}catch(cause:any){
    throw Object.assign(new Error(`Sogni official generate_image Schema GET ${sogniSchemaSource} returned invalid JSON: ${cause?.message || cause}; body: ${raw}`),{
      status:502,errorSource:'upstream-protocol',endpoint:sogniSchemaSource,rawResponse:raw,cause,
    });
  }
  const modelEnum=schema?.properties?.model?.enum;
  if(!schema || typeof schema!=='object' || !schema.properties || !Array.isArray(modelEnum) || modelEnum.length===0 || modelEnum.some((id:any)=>typeof id!=='string' || !id.trim())) {
    throw Object.assign(new Error(`Sogni official generate_image Schema GET ${sogniSchemaSource} has no non-empty string properties.model.enum; body: ${raw}`),{
      status:502,errorSource:'upstream-protocol',endpoint:sogniSchemaSource,rawResponse:raw,
    });
  }
  return {schema,sourceUrl:sogniSchemaSource};
}

export async function parseVeniceImageResponse(r:Response,url:string) {
  const contentType=String(r.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  const bytes=Buffer.from(await r.arrayBuffer());
  const rawText=()=>new TextDecoder().decode(bytes);
  if(!r.ok)throw Object.assign(new Error(`HTTP ${r.status}: ${rawText()}`),{status:r.status,rawResponse:rawText(),endpoint:url,errorSource:'upstream'});
  if(contentType.startsWith('image/')) {
    if(!veniceImageMime(contentType.slice(6)) || !veniceImageBytesMatch(bytes,contentType))
      throw Object.assign(new Error(`HTTP ${r.status}: Venice 返回无效图像内容（Content-Type ${contentType}）`),{status:r.status,rawResponse:`<${contentType} ${bytes.length} bytes>`,endpoint:url,errorSource:'upstream-protocol'});
    const data={__veniceBinaryImage:true,contentType,base64:bytes.toString('base64')};
    return {data,status:r.status,raw:JSON.stringify(data)};
  }
  const raw=rawText();let data:any;
  try{data=JSON.parse(raw);}catch(parseErr:any){
    throw Object.assign(new Error(r.ok?`HTTP ${r.status}: 响应非 JSON: ${parseErr?.message || parseErr}\n${raw}`:`HTTP ${r.status}: ${raw}`),{status:r.status,rawResponse:raw,endpoint:url,errorSource:'upstream-protocol',stack:parseErr?.stack});
  }
  if(!data || data.status==='error' || (typeof data.code==='number' && data.code!==200))
    throw Object.assign(new Error(`HTTP ${r.status}: ${raw}`),{status:r.status,rawResponse:raw,endpoint:url,errorSource:'upstream-protocol'});
  return {data,status:r.status,raw};
}

/** Authenticated upstream reader for one provider. Throws structured errors with
 *  status/rawResponse/endpoint/errorSource — classification lives in fields. */
export function makeSchemaProviderReader(provider:Provider,depFetch:Dependencies['fetch'],key:string,route:string) {
  const headers=key?{[schemaProviders[provider].auth]:provider==='muapi'?key:`Bearer ${key}`}:{};
  return async(url:string,init?:RequestInit)=>{
    const r=await depFetch({provider,route,key},url,{...init,headers:{...headers,...init?.headers},signal:AbortSignal.timeout(60000)});
    const raw=await r.text();let data:any;
    if(!r.ok){let d:any;try{d=JSON.parse(raw);}catch{/* raw verbatim */}if(d===undefined)throw Object.assign(new Error(`HTTP ${r.status}: ${raw}`),{status:r.status,rawResponse:raw,endpoint:url,errorSource:'upstream'});}
    try{data=JSON.parse(raw);}catch(parseErr:any){
      throw Object.assign(new Error(r.ok?`HTTP ${r.status}: 响应非 JSON: ${parseErr?.message || parseErr}\n${raw}`:`HTTP ${r.status}: ${raw}`),{status:r.status,rawResponse:raw,endpoint:url,errorSource:r.ok?'upstream-protocol':'upstream',stack:parseErr?.stack});
    }
    if(!r.ok || !data || data.status==='error' || (typeof data.code==='number' && data.code!==200)) {
      throw Object.assign(new Error(`HTTP ${r.status}: ${raw}`),{status:r.status,rawResponse:raw,endpoint:url,errorSource:r.ok?'upstream-protocol':'upstream'});
    }
    return {data,status:r.status,raw};
  };
}

/** Live catalog rows for a provider (or schema-enum selectors for Sogni hosted tools). */
export async function fetchSchemaProviderRows(provider:Provider,read:ReturnType<typeof makeSchemaProviderReader>,opts:{lora?:boolean;model?:string;catalog?:string;cursor?:string;limit?:number;selectorSchema?:any;selectorSchemaSource?:string}={}) {
  if(opts.lora && provider==='sogni') {
    // Product (雁 2026-11-02): no personal library in Hub — official public catalog only.
    // Docs: https://docs.sogni.ai/api-reference/ (GET /v1/loras/comfy, needs no authentication).
    const modelQ=opts.model?'?modelId='+encodeURIComponent(opts.model):'';
    const comfyUrl=schemaProviders.sogni.root+'/v1/loras/comfy'+modelQ;
    const {data:comfyData}=await read(comfyUrl);
    const comfyRows=Array.isArray(comfyData.data)?comfyData.data:comfyData.data?.loras || comfyData.loras;
    if(!Array.isArray(comfyRows))throw Object.assign(new Error('LoRA 目录没有返回数组'),{status:502,rawResponse:comfyData,endpoint:comfyUrl});
    return {rows:comfyRows,sourceUrl:comfyUrl};
  }
  if(opts.lora && provider==='krea') {
    // Official GET /styles (api.krea.ai/openapi.json): cursor + limit[1,1000] + model + filter; response {items, next_cursor}.
    const sourceUrl=schemaProviders.krea.root+'/styles?limit='+(opts.limit||200)+(opts.model?'&model='+encodeURIComponent(opts.model):'')+(opts.cursor?'&cursor='+encodeURIComponent(opts.cursor):'');
    const {data}=await read(sourceUrl);
    if(!Array.isArray(data.items))throw Object.assign(new Error('Krea styles 目录没有返回 items 数组'),{status:502,rawResponse:data,endpoint:sourceUrl,errorSource:'upstream-protocol'});
    return {rows:data.items,sourceUrl,nextCursor:typeof data.next_cursor==='string'?data.next_cursor:null};
  }
  if(opts.lora) {
    // Generic: sourceUrl here is ONLY a declared LoRA catalog endpoint. Model catalog URLs must not appear in LoRA Hub.
    if(provider==='together') {
      return {rows:[],noLoraCatalog:true,
        notice:'无 LoRA 目录接口。Together serverless image_loras：官方参数指南明文 no longer available（抓取 2026-10-16 15:08:58）；挂 LoRA 没有发出去，不补 loraItemFields。'};
    }
    if(provider==='aimlapi') {
      return {rows:[],noLoraCatalog:true,
        notice:'无 LoRA 目录接口。请在 LoRA 节点填 HuggingFace owner/repo 或权重 URL（loras[].path）；scale 0–4 须显式传；仅挂到官方 Schema 含 loras 的模型。'};
    }
    if(provider==='novita') {
      // Official Get Model (https://novita.ai/docs/api-reference/model-apis-get-model): pagination.limit (0,100],
      // pagination.cursor (empty = from start), response pagination.next_cursor → next page's cursor.
      const sourceUrl=schemaProviders.novita.root+'/v3/model?filter.types=lora&filter.visibility=public&pagination.limit=100'+(opts.cursor?'&pagination.cursor='+encodeURIComponent(opts.cursor):'');
      const {data}=await read(sourceUrl);
      const models=data?.models;
      if(!Array.isArray(models))throw Object.assign(new Error('Novita LoRA 目录响应没有 models 数组'),{status:502,rawResponse:data,endpoint:sourceUrl,errorSource:'upstream-protocol'});
      const next=data?.pagination?.next_cursor;
      return {rows:novitaLoraCatalogRows(models),sourceUrl,nextCursor:typeof next==='string' && next && next!==opts.cursor?next:null};
    }
    if(provider==='venice') {
      return {rows:[],noLoraCatalog:true,
        notice:'无 LoRA 目录接口（仅 lora_strength）。Venice 官方无自定义 loras[]；挂自定义 LoRA 会没有发出去（未发请求）。'};
    }
    if(provider==='deepinfra') {
      return {rows:[],noLoraCatalog:true,
        notice:'DeepInfra 公共文生图（OpenAI images）无 LoRA 字段。个人/私有 LoRA 需先在 DeepInfra 控制台用 Civitai 链接部署为 Running（https://docs.deepinfra.com/private-models/lora-image.md）；当前部署列表为空时不准假挂。'};
    }
    return {rows:[],noLoraCatalog:true,
      notice:'无 LoRA 目录接口。此供应商未声明独立 LoRA 目录；请在 LoRA 节点输入资源 URL，并选择支持 LoRA 的模型端点。'};
  }
  if(provider==='sogni' && opts.catalog!=='workers') {
    const modelEnum=opts.selectorSchema?.properties?.model?.enum;
    if(!opts.selectorSchema || !Array.isArray(modelEnum) || modelEnum.length===0)throw Object.assign(new Error(`Sogni live hosted-tool Schema is required to build selectors; no bundled or cached fallback is used. Source: ${opts.selectorSchemaSource || sogniSchemaSource}`),{
      status:502,errorSource:'upstream-protocol',endpoint:opts.selectorSchemaSource || sogniSchemaSource,
    });
    return {rows:modelEnum.map((id:string)=>({id,name:id,parameters:opts.selectorSchema,namespace:'hosted-tool-selector'})),sourceUrl:opts.selectorSchemaSource || sogniSchemaSource};
  }
  const sourceUrl=schemaProviders[provider].root+schemaProviders[provider].catalog;
  const {data}=await read(sourceUrl);
  if(provider==='krea') {
    if(!data?.paths)throw Object.assign(new Error('Krea OpenAPI 响应没有 paths'),{status:502,rawResponse:data,endpoint:sourceUrl,errorSource:'upstream-protocol'});
    return {rows:kreaCatalogRows(data),sourceUrl};
  }
  if(provider==='together') {
    const models=Array.isArray(data)?data:data?.data;
    if(!Array.isArray(models))throw Object.assign(new Error('Together /models 响应不是模型数组'),{status:502,rawResponse:data,endpoint:sourceUrl,errorSource:'upstream-protocol'});
    return {rows:togetherCatalogRows(models),sourceUrl};
  }
  if(provider==='aimlapi') {
    const models=Array.isArray(data)?data:data?.data;
    if(!Array.isArray(models))throw Object.assign(new Error('AIMLAPI /v1/models 响应不是模型数组'),{status:502,rawResponse:data,endpoint:sourceUrl,errorSource:'upstream-protocol'});
    return {rows:aimlapiCatalogRows(models),sourceUrl};
  }
  if(provider==='novita') {
    const models=data?.models;
    if(!Array.isArray(models))throw Object.assign(new Error('Novita /v3/model 响应没有 models 数组'),{status:502,rawResponse:data,endpoint:sourceUrl,errorSource:'upstream-protocol'});
    return {rows:novitaCatalogRows(models),sourceUrl};
  }
  if(provider==='venice') {
    const models=Array.isArray(data)?data:data?.data;
    if(!Array.isArray(models))throw Object.assign(new Error('Venice /models 响应不是模型数组'),{status:502,rawResponse:data,endpoint:sourceUrl,errorSource:'upstream-protocol'});
    return {rows:veniceCatalogRows(models),sourceUrl};
  }
  if(provider==='deepinfra') {
    const models=Array.isArray(data)?data:data?.data;
    if(!Array.isArray(models))throw Object.assign(new Error('DeepInfra /models/list 响应不是模型数组'),{status:502,rawResponse:data,endpoint:sourceUrl,errorSource:'upstream-protocol'});
    return {rows:deepinfraCatalogRows(models),sourceUrl};
  }
  const rows=provider==='muapi'?data.models:provider==='wavespeed'?data.data:data.data?.models;
  if(!Array.isArray(rows))throw Object.assign(new Error('上游目录响应未包含模型数组'),{status:502,rawResponse:data,endpoint:sourceUrl,errorSource:'upstream-protocol'});
  return {rows,sourceUrl};
}

/** Official personal LoRA ids are `personal-…` (docs personal-loras). Catalog rows may also set ui.category=personal. */
export function isSogniPersonalLoraRow(m:any):boolean {
  const id=String(m?.loraId || m?.slug || m?.id || '');
  return id.startsWith('personal-') || m?._personal===true || m?.ui?.category==='personal';
}

export type SogniLoraStrengthRange = {min:number;max:number;step?:number};
/** Read only a complete, ordered numeric range published by Sogni for this exact LoRA row. */
export function sogniLoraStrengthRange(item:any):SogniLoraStrengthRange|undefined {
  const ui=item?.ui;
  const min=ui?.min,max=ui?.max;
  if(typeof min!=='number' || !Number.isFinite(min) || typeof max!=='number' || !Number.isFinite(max) || min>max)return undefined;
  const step=ui?.step;
  return {min,max,...(typeof step==='number' && Number.isFinite(step) && step>0?{step}:{})};
}
/** Match only exact LoRA resource IDs; unknown/custom/personal resources stay unvalidated, never guessed. */
export function validateSogniLoraStrengthRanges(loras:unknown,strengths:unknown,rows:unknown):{
  checked:Array<{id:string;strength:number;minimum:number;maximum:number}>;
  unknown:Array<{id:string;reason:string}>;
  violations:Array<{id:string;strength:number;minimum:number;maximum:number}>;
} {
  const ids=Array.isArray(loras)?loras:[];
  const values=Array.isArray(strengths)?strengths:[];
  const catalog=Array.isArray(rows)?rows:[];
  const checked=[] as Array<{id:string;strength:number;minimum:number;maximum:number}>;
  const unknown=[] as Array<{id:string;reason:string}>;
  const violations=[] as Array<{id:string;strength:number;minimum:number;maximum:number}>;
  for(let i=0;i<ids.length;i++){
    const id=typeof ids[i]==='string'?ids[i]:'';
    if(!id){unknown.push({id:String(ids[i] ?? ''),reason:'资源标识不是目录可核实的字符串'});continue;}
    const row=catalog.find((candidate:any)=>String(candidate?.loraId || candidate?.slug || candidate?.id || '')===id);
    if(!row){unknown.push({id,reason:'公开 LoRA 目录无完全匹配的资源 ID；未推断范围'});continue;}
    const range=sogniLoraStrengthRange(row);
    if(!range){unknown.push({id,reason:'目录条目没有完整且有效的 ui.min/ui.max；未推断范围'});continue;}
    const raw=strengths===undefined?1:values[i]; // Official protocol default applies only when the entire array is omitted.
    if(raw===undefined){unknown.push({id,reason:'loraStrengths 缺少对应位置；未假设该项默认值'});continue;}
    const strength=raw;
    if(typeof strength!=='number' || !Number.isFinite(strength)){unknown.push({id,reason:'强度不是有限 JSON number；未执行范围判断'});continue;}
    const entry={id,strength,minimum:range.min,maximum:range.max};
    checked.push(entry);
    if(strength<range.min || strength>range.max)violations.push(entry);
  }
  return {checked,unknown,violations};
}

/** Cover resolution for Sogni LoRA items:
 *  Reads directly and dynamically from Sogni's upstream `ui.examples`.
 *  Strictly adheres to project rules: NO hardcoded mappings, NO mock covers. */
export function sogniLoraCover(m: any): { url: string; caption: string } | undefined {
  const examples = Array.isArray(m?.ui?.examples) ? m.ui.examples : [];
  const usable = examples.filter((e: any) => {
    if (!e?.url || e.isMature === true) return false;
    const cap = String(e.caption || '').trim().toLowerCase();
    // Skip shared baseline / off frames — they look identical across LoRAs.
    if (!cap || cap === 'off' || /baseline/i.test(String(e.url))) return false;
    return true;
  });
  const positives = usable.filter((e: any) => !String(e.caption || '').trim().startsWith('-'));
  const strengthOf = (e: any) => {
    const n = Number(String(e.caption || '').replace(/^\+/, ''));
    return Number.isFinite(n) ? n : Number.NEGATIVE_INFINITY;
  };
  const strongest = positives.length ? [...positives].sort((a, b) => strengthOf(b) - strengthOf(a))[0] : undefined;
  const def = m?.ui?.default;
  const matchDefault = Number.isFinite(Number(def))
    ? positives.find((e: any) => strengthOf(e) === Number(def))
    : undefined;
  // Prefer strongest positive so shared demo subjects still look different across LoRAs.
  const shown = strongest || matchDefault || positives[0] || usable[0];
  return shown ? { url: String(shown.url), caption: String(shown.caption || '') } : undefined;
}

/** Short chip/badge label from compatibleModels; full count only as suffix for tooltip callers. */
function compatibleModelsLabel(models:any):string {
  const names=Array.isArray(models)?models.map((c:any)=>c?.name).filter(Boolean):[];
  if(!names.length)return '';
  // Keep chip/card badge short: first official compatible model name only.
  // Full list stays on modelIds / metadata; UI tooltip can show count separately.
  return String(names[0]);
}
function compatibleModelsCount(models:any):number {
  return Array.isArray(models)?models.filter((c:any)=>c?.name || c?.modelId).length:0;
}

/** Normalize raw catalog rows into the shared model-hub item shape. */
export function normalizeSchemaProviderItems(provider:Provider,rows:any[],opts:{lora?:boolean;/** undefined when the provider declares no LoRA catalog endpoint (noLoraCatalog → rows=[]). */sourceUrl?:string;category?:string;query?:string}) {
  const wantsLora=opts.lora===true;
  const category=(opts.category || 'checkpoint').toLowerCase();
  let filtered=rows;
  if(!wantsLora && category==='checkpoint' && provider!=='sogni')filtered=filtered.filter((m:any)=>provider==='krea'||provider==='together'||provider==='aimlapi'||provider==='novita'||provider==='venice'||provider==='deepinfra'?m.category==='text-to-image':provider==='muapi'?m.group_of==='image':/^(text.to.image|image.to.image|lora.support)$/i.test(m.category || m.type || ''));
  const isVideoRow=(m:any)=>provider==='muapi'&&m.group_of?m.group_of==='video':/video/i.test(m.category || m.type || '');
  if(!wantsLora && category==='video')filtered=filtered.filter(isVideoRow);
  const query=(opts.query || '').toLowerCase();
  return filtered.map((m:any)=>({id:wantsLora?(provider==='krea'?m.id:(m.loraId || m.slug)):(m.model_id || m.id || m.endpoint_url || m.name),name:m.name || m.title || m.ui?.label || m.model_id || m.id,
    provider:schemaProviders[provider].name,category:wantsLora?'LoRA':isVideoRow(m)?'Video':'Checkpoint',type:wantsLora?'LoRA':'Checkpoint',
    baseModelSource:provider==='krea' && wantsLora && Array.isArray(m.models)?'官方 GET /styles items[].models（Compatible model names），原值显示':(wantsLora && Array.isArray(m.compatibleModels) && compatibleModelsCount(m.compatibleModels)>1?`官方列出可兼容底模共 ${compatibleModelsCount(m.compatibleModels)} 个，卡片只显示第一个名字`:undefined),baseModel:(provider==='krea' && wantsLora && Array.isArray(m.models)?m.models.join(', '):undefined) || m.family || m.tierId || compatibleModelsLabel(m.compatibleModels) || (Array.isArray(m.modelIds)?m.modelIds[0]:undefined),description:m.description || '',tags:m.tags || [],
    imageUrl:m.image_url || m.cover_url || (Array.isArray(m.urls)?m.urls[0]:undefined) || m.thumbnail || sogniLoraCover(m)?.url || '',imageCaption:sogniLoraCover(m)?.caption,
    creator:m.ui?.creator || m.owner?.name,externalUrl:m.ui?.sourceUrl,
    sourceUrl:opts.sourceUrl,metadata:m,modelIds:m.modelIds,loraStrength:m.ui?.default,loraStrengthRange:provider==='sogni'?sogniLoraStrengthRange(m):undefined,supportsLora:provider==='venice'||provider==='deepinfra'?false:provider==='together'?undefined:provider==='aimlapi'?(typeof m.supportsLora==='boolean'?m.supportsLora:(m.parameters?.properties && Object.hasOwn(m.parameters.properties,'loras')?true:undefined)):provider==='novita'?(typeof m.supportsLora==='boolean'?m.supportsLora:undefined):provider==='krea'?Boolean(m.parameters?.properties?.styles):JSON.stringify(m.input_fields || m.api_schema || m.parameters || '').includes('lora'),
    badge:wantsLora?(isSogniPersonalLoraRow(m)?'我的个人 LoRA':'官方 LoRA 资源'):'官方模型端点',resourceKind:wantsLora?'adapter':'model-endpoint'}))
    .filter((m:any)=>m.id && (!query || (m.id+' '+m.name+' '+m.description).toLowerCase().includes(query)));
}
/** Canvas LoRA nodes → Krea styles[{id,strength}] (official request schema). */
export function kreaStyles(loras:any[]) {
  return loras.map((l:any)=>{
    const id=String(l.path || l.civitaiId || l.name || '').trim();
    const strength=Number(l.strength ?? l.modelStrength);
    if(!id)throw Object.assign(new Error('Krea LoRA 缺少 style ID'),{status:400,errorSource:'local'});
    const raw=l.strength ?? l.modelStrength;
    if(raw===undefined || raw===null || raw==='')return {id};
    return {id,strength:Number.isFinite(strength)?strength:raw};
  });
}
export function upstreamReferenceUrlIssue(value:string):string|undefined {
  let parsed:URL;
  try{parsed=new URL(value);}catch{return '参考图必须是绝对 HTTP(S) URL';}
  if(!['http:','https:'].includes(parsed.protocol))return '参考图必须是绝对 HTTP(S) URL';
  const host=parsed.hostname.toLowerCase().replace(/^\[|\]$/g,'');
  if(host==='localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host==='0.0.0.0' || host==='::1' || host.startsWith('127.'))return '参考图地址指向本机或本地域名，上游无法直接读取';
  if(/^10\./.test(host) || /^127\./.test(host) || /^169\.254\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) || /^(?:fc|fd|fe8|fe9|fea|feb)/i.test(host))return '参考图地址位于私有或链路本地网络，上游无法直接读取';
}

export function resolveSchemaRefs(value:any,document:any,seen:string[]=[]):any {
  if(!value || typeof value!=='object')return value;
  if(value.$ref?.startsWith('#/') && !seen.includes(value.$ref)) {
    const resolved=value.$ref.slice(2).split('/').reduce((a:any,k:string)=>a?.[k.replace(/~1/g,'/').replace(/~0/g,'~')],document);
    return resolveSchemaRefs(resolved,document,[...seen,value.$ref]);
  }
  if(Array.isArray(value))return value.map(v=>resolveSchemaRefs(v,document,seen));
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,resolveSchemaRefs(v,document,seen)]));
}
export function getSchemaProviderCatalog(
  provider: Provider,
  options: { query?: string; type?: string; page?: number; limit?: number } = {}
) {
  const query = String(options.query || '').trim().toLowerCase();
  const type = String(options.type || '').trim().toLowerCase();
  let catalogNotice: string | undefined;
  if (type === 'lora') {
    if (provider === 'muapi') {
      catalogNotice = 'MuAPI 目前未提供公开 LoRA 实时检索目录；如需使用自定义 LoRA，请在生成节点中直接填入 Civitai / HuggingFace 下载直链。';
    } else if (provider === 'wavespeed') {
      catalogNotice = 'WaveSpeed 目前未提供公开 LoRA 实时检索目录；如需使用自定义 LoRA，请在生成节点中直接填入可公开访问的模型权重 URL。';
    } else if (provider === 'sogni') {
      catalogNotice = 'Sogni LoRA 目录由 /api/models?type=lora 实时读取；此同步辅助函数不返回快照。';
    } else if (provider === 'together') {
      catalogNotice = 'Together serverless image_loras：官方参数指南明文 no longer available（抓取 2026-10-16 15:08:58）；挂 LoRA 没有发出去，不补 loraItemFields。';
    } else if (provider === 'aimlapi') {
      catalogNotice = 'AIMLAPI 无独立 LoRA 目录；在 LoRA 节点填 HF owner/repo 或 URL（loras[].path），scale 0–4 须显式传；仅用于官方含 loras 的模型。';
    } else if (provider === 'novita') {
      catalogNotice = 'Novita LoRA 目录来自 GET /v3/model?filter.types=lora；字段为 request.loras[{model_name,strength}]，strength [0,1] 须显式传。';
    } else if (provider === 'venice') {
      catalogNotice = '无 LoRA 目录接口（仅 lora_strength）。Venice 官方无自定义 loras[]；挂自定义 LoRA 会没有发出去（未发请求）。';
    } else if (provider === 'deepinfra') {
      catalogNotice = 'DeepInfra 公共文生图无 LoRA 字段；个人/私有 LoRA 需先在 DeepInfra 控制台部署为 Running（docs.deepinfra.com/private-models/lora-image），部署列表为空时不准假挂。';
    }
  }
  if(provider==='sogni' && type!=='lora')catalogNotice='Sogni hosted-tool selectors are fetched live by /api/models; this synchronous helper does not return a bundled snapshot.';

  const providerMeta = schemaProviders[provider] as any;
  // LoRA Hub: never advertise the model catalog URL as a LoRA catalog source.
  const noLoraCatalog = type === 'lora' && !['novita', 'sogni', 'krea'].includes(provider);
  const sourceUrl = noLoraCatalog ? undefined : provider==='sogni' && type!=='lora' ? sogniSchemaSource : (providerMeta.sourceUrl || `${providerMeta.root || ''}${providerMeta.catalog || ''}`);
  let sourceNotice: string;
  if (provider === 'sogni') {
    sourceNotice = 'live-official-generate_image-schema (queried by asynchronous /api/models)';
  } else if (provider === 'muapi') {
    sourceNotice = 'openapi-spec-schema (@muapi/openapi-spec)';
  } else if (provider === 'wavespeed') {
    sourceNotice = 'openapi-spec-schema (wavespeed)';
  } else {
    sourceNotice = 'versioned-schema';
  }

  const definition = providerMeta.document?.paths
    ? providerMeta.document.components?.schemas?.ModelType?.enum
      ? undefined
      : undefined
    : undefined;

  const catalog =
    type === 'lora'
      ? []
      : provider === 'sogni'
      ? []
      : definition
      ? Object.keys(definition).map((v) => ({
          id: v,
          name: v,
          category: 'model',
          provider,
          sourceUrl,
          type: 'checkpoint',
        }))
      : Array.isArray(providerMeta.catalog)
      ? providerMeta.catalog.map((v: any) => ({
          id: v.id || v.name,
          name: v.name || v.id,
          category: 'model',
          provider,
          sourceUrl,
          type: 'checkpoint',
        }))
      : [];

  const filtered = catalog.filter(
    (item: any) => !query || item.id.toLowerCase().includes(query) || item.name.toLowerCase().includes(query)
  );
  const page = Math.max(1, options.page || 1);
  const limit = Math.max(1, Math.min(100, options.limit || 20));
  const offset = (page - 1) * limit;
  const sliced = filtered.slice(offset, offset + limit);

  return {
    items: sliced,
    total: catalog.length,
    hasMore: offset + limit < catalog.length,
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(noLoraCatalog ? { noLoraCatalog: true, message: catalogNotice || '无 LoRA 目录接口' } : {}),
    sourceNotice,
    catalogNotice,
    page,
    limit,
  };
}

/** Decode a data: URL into bytes + MIME (no guessing: MIME must be declared in the URL). */
export function decodeDataUrl(value:string):{mime:string;bytes:Buffer}{
  const m=/^data:([^;,]+)((?:;[^;,]*)*?)(;base64)?,(.*)$/s.exec(value);
  if(!m || !m[1])throw Object.assign(new Error('参考图 data URL 无法解析（缺少 MIME）'),{status:400,errorSource:'local'});
  return {mime:m[1],bytes:m[3]?Buffer.from(m[4],'base64'):Buffer.from(decodeURIComponent(m[4]),'utf8')};
}
function referenceFilename(mime:string){const ext=(mime.split('/')[1]||'bin').replace('jpeg','jpg').replace(/[^a-z0-9]/gi,'');return `reference.${ext}`;}
function uploadFailure(label:string,endpoint:string,status:number,raw:string){
  return Object.assign(new Error(`${label} HTTP ${status}: ${raw}`),{status,rawResponse:raw,endpoint,errorSource:'upstream'});
}
/** Official reference-image upload (MuAPI upload_file multipart / WaveSpeed media/uploads ticket). Returns the hosted URL. */
export async function uploadSchemaProviderReference(provider:Provider,upload:{kind:string;path:string;docUrl:string},dataUrl:string,credential:{key:string;headers:Record<string,string>},req:express.Request,dep:Pick<Dependencies,'fetch'>):Promise<string>{
  const {mime,bytes}=decodeDataUrl(dataUrl);
  const filename=referenceFilename(mime);
  const endpoint=schemaProviders[provider].root+upload.path;
  const meta={provider,route:req.path,model:req.body?.model,key:credential.key};
  if(upload.kind==='multipart') {
    const form=new FormData();form.append('file',new Blob([new Uint8Array(bytes)],{type:mime}),filename);
    const r=await dep.fetch(meta,endpoint,{method:'POST',headers:{...credential.headers},body:form,signal:AbortSignal.timeout(120000)});
    const raw=await r.text();
    if(!r.ok)throw uploadFailure('参考图上传失败',endpoint,r.status,raw);
    let data:any;try{data=JSON.parse(raw);}catch{throw Object.assign(uploadFailure('参考图上传响应非 JSON',endpoint,r.status,raw),{errorSource:'upstream-protocol'});}
    const url=data?.url;
    if(typeof url!=='string' || !url)throw Object.assign(uploadFailure('参考图上传响应没有 url',endpoint,r.status,raw),{errorSource:'upstream-protocol'});
    return url;
  }
  if(upload.kind==='ticket') {
    const r=await dep.fetch(meta,endpoint,{method:'POST',headers:{...credential.headers,'Content-Type':'application/json'},body:JSON.stringify({filename,size:bytes.length,content_type:mime}),signal:AbortSignal.timeout(60000)});
    const raw=await r.text();
    if(!r.ok)throw uploadFailure('参考图上传票据失败',endpoint,r.status,raw);
    let data:any;try{data=JSON.parse(raw);}catch{throw Object.assign(uploadFailure('参考图上传票据响应非 JSON',endpoint,r.status,raw),{errorSource:'upstream-protocol'});}
    const ticket=data?.data ?? data;
    const putUrl=ticket?.upload?.url;const downloadUrl=ticket?.download_url;
    if(typeof putUrl!=='string' || typeof downloadUrl!=='string')throw Object.assign(uploadFailure('参考图上传票据缺少 upload.url / download_url',endpoint,r.status,raw),{errorSource:'upstream-protocol'});
    // Docs: the upload URL is a temporary credential — never send the API key there, never log it.
    const put=await globalThis.fetch(putUrl,{method:'PUT',headers:{...(ticket.upload.headers||{})},body:new Uint8Array(bytes),signal:AbortSignal.timeout(120000)});
    if(!put.ok)throw uploadFailure('参考图 PUT 上传失败（上传 URL 按官方要求不记录）',endpoint+' → upload.url',put.status,await put.text().catch(()=>''));
    return downloadUrl;
  }
  throw Object.assign(new Error(`未知参考图上传方式 ${upload.kind}`),{status:500,errorSource:'local'});
}

export function registerSchemaProviderRoutes(app:express.Express,dep:Dependencies) {
  const valid=(value:string):value is Provider=>Object.hasOwn(schemaProviders,value);
  const credentialHeader='x-canvas-credential-ref';
  const credentialTtlMs=15*60*1000;
  const credentialRefs=new Map<string,{provider:Provider;key:string;expiresAt:number}>();
  const taskCredentialRefs=new Map<string,string>();
  const purgeCredentials=()=>{const now=Date.now();for(const [ref,binding] of credentialRefs)if(binding.expiresAt<=now)credentialRefs.delete(ref);};
  const credentials=(req:express.Request,provider:Provider,options:{create?:boolean;fallbackRef?:string}={})=>{
    purgeCredentials();
    const requestedRef=String(req.headers[credentialHeader] || options.fallbackRef || '').trim();
    if(requestedRef) {
      const binding=credentialRefs.get(requestedRef);
      if(!binding || binding.provider!==provider)throw Object.assign(new Error('凭据引用已失效或不属于当前供应商；请重新读取模型 Schema 后重试，未自动切换 Key'),{status:409,errorSource:'local'});
      binding.expiresAt=Date.now()+credentialTtlMs;
      const key=binding.key;
      return {key,credentialRef:requestedRef,headers:key?{[schemaProviders[provider].auth]:provider==='muapi'?key:`Bearer ${key}`}:{}};
    }
    const key=dep.key(provider,req.headers[schemaProviders[provider].header] as string);
    const credentialRef=options.create?randomUUID():undefined;
    if(credentialRef)credentialRefs.set(credentialRef,{provider,key,expiresAt:Date.now()+credentialTtlMs});
    return {key,credentialRef,headers:key?{[schemaProviders[provider].auth]:provider==='muapi'?key:`Bearer ${key}`}:{}};
  };
  type Credential=ReturnType<typeof credentials>;
  const read=async(req:express.Request,provider:Provider,url:string,init?:RequestInit,credential?:Credential)=>{
    const {key,headers}=credential || credentials(req,provider);
    const r=await dep.fetch({provider,route:req.path,model:req.body?.model || req.query.model,key},url,{...init,headers:{...headers,...init?.headers},signal:AbortSignal.timeout(60000)});
    if(provider==='venice' && new URL(url).pathname.endsWith('/image/generate'))return parseVeniceImageResponse(r,url);
    const raw=await r.text();let data:any;
    try{data=JSON.parse(raw);}catch(parseErr:any){
      throw Object.assign(new Error(r.ok?`HTTP ${r.status}: 响应非 JSON: ${parseErr?.message || parseErr}\n${raw}`:`HTTP ${r.status}: ${raw}`),{status:r.status,rawResponse:raw,endpoint:url,errorSource:r.ok?'upstream-protocol':'upstream',stack:parseErr?.stack});
    }
    if(!r.ok || !data || data.status==='error' || (typeof data.code==='number' && data.code!==200)) {
      throw Object.assign(new Error(`HTTP ${r.status}: ${raw}`),{status:r.status,rawResponse:raw,endpoint:url,errorSource:r.ok?'upstream-protocol':'upstream'});
    }
    return {data,status:r.status,raw};
  };
  // clean-1358 #2: Venice/Together modelSchema needs catalog + official OpenAPI. One browser GET /api/model-schema
  // therefore makes two *different* upstream GETs on a cold read (models list + swagger.yaml). That is not a duplicate
  // of the same URL. Cache each upstream document in-process so a later select (other model / submit reuse miss) does
  // not re-hit the same URL; a forced new GET /api/model-schema still re-assembles the definition from cache.
  const officialSpecCache=new Map<string,any>();
  /** GET an official OpenAPI YAML/JSON (public, no auth header). Failure → local 400 未出站 with URL + upstream status/body verbatim. */
  const readOfficialSpec=async(req:express.Request,provider:Provider,providerName:string,model:string,url:string)=>{
    if(officialSpecCache.has(url))return officialSpecCache.get(url);
    let r:Response,raw:string;
    try{r=await dep.fetch({provider,route:req.path,model,key:''} as any,url,{signal:AbortSignal.timeout(60000)});raw=await r.text();}
    // Spec unreadable: generation still goes out as built (no schema mapping); the raw failure is logged verbatim.
    catch(e:any){console.warn(`[schema] ${providerName} ${model}: GET ${url} → ${e?.message || e}`);return null;}
    if(!r.ok){console.warn(`[schema] ${providerName} ${model}: GET ${url} → HTTP ${r.status} ${raw}`);return null;}
    let doc:any;
    try{doc=YAML.parse(raw);}catch(e:any){console.warn(`[schema] ${providerName} ${model}: GET ${url} parse: ${e?.message}`);return null;}
    officialSpecCache.set(url,doc);
    return doc;
  };
  const fail=(res:express.Response,e:any)=>res.status(e.status || 500).json({ok:false,error:e.message,rawResponse:e.rawResponse,endpoint:e.endpoint,errorSource:e.errorSource || 'network',stack:e.stack,cause:e.cause?{name:e.cause.name,message:e.cause.message,code:e.cause.code,stack:e.cause.stack}:undefined,actualRequest:e.actualRequest,blockedField:e.blockedField,proposedRequest:e.proposedRequest,schemaRead:e.schemaRead});
  const list=async(req:express.Request,provider:Provider,credential?:Credential)=>{
    const sourceUrl=schemaProviders[provider].root+schemaProviders[provider].catalog;
    const {data}=await read(req,provider,sourceUrl,undefined,credential);
    if(provider==='krea')return {rows:kreaCatalogRows(data),sourceUrl,document:data};
    if(provider==='together') {
      const models=Array.isArray(data)?data:data?.data;
      if(!Array.isArray(models))throw Object.assign(new Error('Together /models 响应不是模型数组'),{status:502,rawResponse:data,endpoint:sourceUrl,errorSource:'upstream-protocol'});
      return {rows:togetherCatalogRows(models),sourceUrl};
    }
    if(provider==='aimlapi') {
      const models=Array.isArray(data)?data:data?.data;
      if(!Array.isArray(models))throw Object.assign(new Error('AIMLAPI /v1/models 响应不是模型数组'),{status:502,rawResponse:data,endpoint:sourceUrl,errorSource:'upstream-protocol'});
      return {rows:aimlapiCatalogRows(models),sourceUrl};
    }
    if(provider==='novita') {
      const models=data?.models;
      if(!Array.isArray(models))throw Object.assign(new Error('Novita /v3/model 响应没有 models 数组'),{status:502,rawResponse:data,endpoint:sourceUrl,errorSource:'upstream-protocol'});
      return {rows:novitaCatalogRows(models),sourceUrl};
    }
    if(provider==='venice') {
      const models=Array.isArray(data)?data:data?.data;
      if(!Array.isArray(models))throw Object.assign(new Error('Venice /models 响应不是模型数组'),{status:502,rawResponse:data,endpoint:sourceUrl,errorSource:'upstream-protocol'});
      return {rows:veniceCatalogRows(models),sourceUrl};
    }
    if(provider==='deepinfra') {
      const models=Array.isArray(data)?data:data?.data;
      if(!Array.isArray(models))throw Object.assign(new Error('DeepInfra /models/list 响应不是模型数组'),{status:502,rawResponse:data,endpoint:sourceUrl,errorSource:'upstream-protocol'});
      return {rows:deepinfraCatalogRows(models),sourceUrl};
    }
    const rows=provider==='muapi'?data.models:provider==='wavespeed'?data.data:data.data?.models;
    if(!Array.isArray(rows))throw Object.assign(new Error('上游目录响应未包含模型数组'),{status:502,rawResponse:data,endpoint:sourceUrl,errorSource:'upstream-protocol'});
    return {rows,sourceUrl};
  };

  // 雁 rule: a failed catalog lookup (upstream HTTP error, e.g. Cloudflare 403) must not stop the generation send.
  // The failure is recorded verbatim (status + first 2000 chars of body) on the definition as catalogLookupFailure.
  const catalogFailures=new WeakMap<express.Request,any>();
  const listForSchema=async(req:express.Request,provider:Provider,credential?:Credential):Promise<{rows:any[],sourceUrl:string}>=>{
    try{return await list(req,provider,credential);}
    catch(e:any){
      const upstreamStatus=e?.upstreamStatus ?? (e?.errorSource==='local'?undefined:e?.status);
      if(e?.errorSource==='local')throw e; // local can't-send (e.g. missing key) stays a stop
      const sourceUrl=schemaProviders[provider].root+schemaProviders[provider].catalog;
      const raw=String(e?.rawResponse ?? e?.upstreamResponseBody ?? e?.message ?? e);
      catalogFailures.set(req,{endpoint:e?.endpoint || sourceUrl,upstreamStatus:upstreamStatus ?? null,upstreamResponseBody:raw.slice(0,2000),truncated:raw.length>2000,error:String(e?.message || e).slice(0,2000),note:'目录/参数表查询失败；生成请求仍按所填参数发送'});
      return {rows:[],sourceUrl};
    }
  };
  const modelSchema=async(req:express.Request,provider:Provider,model:string,credential?:Credential)=>{
    const d:any=await modelSchemaInner(req,provider,model,credential);
    const f=catalogFailures.get(req);catalogFailures.delete(req);
    return f?{...d,catalogLookupFailure:f}:d;
  };
  const modelSchemaInner=async(req:express.Request,provider:Provider,model:string,credential?:Credential)=>{
    if(provider==='muapi') {
      const sourceUrl=schemaProviders.muapi.root+'/openapi.json';
      const [{data:document},{rows,catalogUrl}]=await Promise.all([read(req,provider,sourceUrl,undefined,credential),list(req,provider,credential).then(x=>({...x,catalogUrl:x.sourceUrl}))]);
      const entry=rows.find((x:any)=>[x.name,x.endpoint_url,x.endpoint].includes(model));
      // endpoint_url is the execution identifier. The catalog's display name and
      // endpoint can differ from the OpenAPI operation (e.g. flux_dev_lora_image).
      const selectedPath=entry?.endpoint_url || entry?.endpoint || model;
      const endpoint='/api/v1/'+selectedPath.replace(/^\/api\/v1\//,'');
      const input=document.paths?.[endpoint]?.post?.requestBody?.content?.['application/json']?.schema;
      return {provider,model,sourceUrl,catalogUrl,endpoint:schemaProviders.muapi.root+endpoint,inputSchema:input?resolveSchemaRefs(input,document):null,modelMetadata:entry};
    }
    if(provider==='krea') {
      const {rows,sourceUrl}=await listForSchema(req,provider,credential);
      const entry:any=rows.find((x:any)=>x.id===model || x.id===`image/${model}` || x.id===`video/${model}` || x.endpoint===model || x.endpoint===`/generate/${model}` || x.endpoint===`/generate/image/${model}` || x.endpoint===`/generate/video/${model}`) ?? {id:model,notInCatalog:true}; // not in catalog: send the user's model id; upstream decides
      const endpointPath = entry.endpoint ?? (model.startsWith('/generate/') ? model : (model.startsWith('image/') || model.startsWith('video/') ? `/generate/${model}` : `/generate/image/${model}`));
      return {provider,model,sourceUrl,endpoint:schemaProviders.krea.root+endpointPath,inputSchema:entry.parameters || null,modelMetadata:{...entry,parameters:undefined},schemaStatus:'openapi'};
    }
    if(provider==='together') {
      const {rows,sourceUrl}=await listForSchema(req,provider,credential);
      const entry:any=rows.find((x:any)=>x.id===model) ?? {id:model,notInCatalog:true}; // not in catalog: send the user's model id; upstream decides
      const isVideo=entry.type==='video' || entry.category==='text-to-video';
      const endpoint=isVideo?(schemaProviders.together as any).videoRoot+'/videos':schemaProviders.together.root+'/images/generations';
      const specUrl=officialOpenApiSources.together;const opPath=isVideo?'/videos':'/images/generations';
      const inputSchema=openApiPathRequestSchema(await readOfficialSpec(req,provider,'Together',model,specUrl),opPath);
      return {provider,model,sourceUrl,endpoint,inputSchema,modelMetadata:entry,schemaStatus:'official-openapi-runtime',schemaSource:specUrl,schemaUnprobed:true,mediaKind:isVideo?'video':'image'};
    }
    if(provider==='aimlapi') {
      const {rows,sourceUrl}=await listForSchema(req,provider,credential);
      const entry:any=rows.find((x:any)=>x.id===model) ?? {id:model,notInCatalog:true}; // not in catalog: send the user's model id; upstream decides
      const isVideo=entry.type==='video' || entry.category==='text-to-video';
      const endpoint=isVideo?(schemaProviders.aimlapi as any).videoRoot+'/video/generations':schemaProviders.aimlapi.root+'/images/generations';
      // Official per-model OpenAPI only: catalog info.docsJson (api.aimlapi.com/docs-json?model=…).
      // Iron rule 3: no static snapshot fallback — missing/failed docs-json → local 400 (没有发出去) with URL + upstream status/body verbatim.
      const docsJson=entry.metadata?.info?.docsJson;
      // No docs / unreadable docs: still send as built; the read failure is kept verbatim in schemaReadError.
      let inputSchema:any=null;let schemaReadError:string|undefined;
      if(typeof docsJson==='string' && docsJson && new URL(docsJson).origin===new URL(schemaProviders.aimlapi.root).origin) {
        try{inputSchema=openApiRequestSchema((await read(req,provider,docsJson,undefined,credential)).data);}
        catch(e:any){schemaReadError=`GET ${docsJson} → ${e.status!=null?`HTTP ${e.status} `:''}${e.rawResponse ?? e.message}`;}
      }
      if(schemaReadError)return {provider,model,sourceUrl,endpoint,inputSchema,schemaReadError,modelMetadata:{...entry,parameters:undefined},schemaStatus:'official-docs-json',schemaSource:docsJson,mediaKind:isVideo?'video':'image'};
      return {provider,model,sourceUrl,endpoint,inputSchema,modelMetadata:{...entry,parameters:undefined},schemaStatus:'official-docs-json',schemaSource:docsJson,mediaKind:isVideo?'video':'image'};
    }
    if(provider==='novita') {
      // Dedicated img2video models (SVD / SVD-XT) are official POST /v3/async/img2video model_name values —
      // JS SDK Img2VideoModel enum — and are NOT checkpoints in GET /v3/model (live filter.query=SVD → 0).
      const img2Decl=loadProviderDeclaration(provider,'/v3/async/img2video');
      if(img2Decl && novitaImg2VideoDedicatedModels(img2Decl).includes(model)) {
        const endpoint=schemaProviders.novita.root+'/v3/async/img2video';
        const schemaSource=(img2Decl.sources||[]).join(' ; ');
        return {provider,model,sourceUrl:schemaSource || endpoint,endpoint,inputSchema:img2Decl.inputSchema,modelMetadata:{id:model,name:model,category:'image-to-video',type:'video',endpoint:'/v3/async/img2video'},schemaStatus:'official-html-declaration',schemaSource,declaration:{file:img2Decl.file,sources:img2Decl.sources,fetchedAt:img2Decl.fetchedAt},schemaUnprobed:true,schemaConfirmedFields:Object.entries(img2Decl.inputSchema.properties||{}).filter(([,v]:any)=>v?.['x-liveConfirmed']===true).map(([k])=>k),mediaKind:'video'};
      }
      const {rows,sourceUrl}=await listForSchema(req,provider,credential);
      const entry:any=rows.find((x:any)=>x.id===model) ?? {id:model,notInCatalog:true}; // not in catalog: send the user's model id; upstream decides
      const isVideo=entry.type==='video' || /video/i.test(entry.category||'');
      const endpoint=schemaProviders.novita.root+(isVideo?'/v3/async/txt2video':'/v3/async/txt2img');
      // No machine-readable official schema: use the configurable HTML-transcribed declaration (src/config/providerDeclarations), if present.
      const decl=entry.parameters?null:loadProviderDeclaration(provider,isVideo?'/v3/async/txt2video':'/v3/async/txt2img');
      if(!entry.parameters && decl)return {provider,model,sourceUrl,endpoint,inputSchema:decl.inputSchema,modelMetadata:entry,schemaStatus:'official-html-declaration',schemaSource:decl.sources.join(' ; '),declaration:{file:decl.file,sources:decl.sources,fetchedAt:decl.fetchedAt},schemaUnprobed:true,schemaConfirmedFields:Object.entries(decl.inputSchema.properties||{}).filter(([,v]:any)=>v?.['x-liveConfirmed']===true).map(([k])=>k),mediaKind:isVideo?'video':'image'};
      // No machine-readable schema: send as built (inputSchema null).
      // No fetchable official OpenAPI for Novita (docs 404, 画布 2026-10-15) → catalog rows carry no parameters → always blocked above.
      const inputSchema=entry.parameters;
      return {provider,model,sourceUrl,endpoint,inputSchema,modelMetadata:{...entry,parameters:undefined},schemaStatus:'upstream-catalog',mediaKind:isVideo?'video':'image'};
    }
    if(provider==='venice') {
      const {rows,sourceUrl}=await listForSchema(req,provider,credential);
      const entry:any=rows.find((x:any)=>x.id===model) ?? {id:model,notInCatalog:true}; // not in catalog: send the user's model id; upstream decides
      const isVideo=entry.type==='video' || /video/i.test(entry.category||'');
      const endpoint=schemaProviders.venice.root+(isVideo?'/video/queue':'/image/generate');
      const specUrl=officialOpenApiSources.venice;const opPath=isVideo?'/video/queue':'/image/generate';
      const base=openApiPathRequestSchema(await readOfficialSpec(req,provider,'Venice',model,specUrl),opPath);
      const inputSchema=applyModelSpecConstraints(base,entry.constraints);
      return {provider,model,sourceUrl,endpoint,inputSchema,modelMetadata:entry,schemaStatus:'official-openapi-runtime',schemaSource:specUrl,constraintsSource:sourceUrl,schemaUnprobed:true,mediaKind:isVideo?'video':'image'};
    }
    if(provider==='deepinfra') {
      const {rows,sourceUrl}=await listForSchema(req,provider,credential);
      const entry:any=rows.find((x:any)=>x.id===model || x.id.replace(/\./g, '-')===model.replace(/\./g, '-') || x.name===model) ?? {id:model,notInCatalog:true}; // not in catalog: send the user's model id; upstream decides
      // Docs: POST https://api.deepinfra.com/v1/openai/images/generations (Bearer). OpenAPI twin path /v1/images/generations supplies the request schema (required model+prompt; size/n/response_format).
      const endpoint=schemaProviders.deepinfra.root+'/v1/openai/images/generations';
      const specUrl=officialOpenApiSources.deepinfra;
      const inputSchema=openApiPathRequestSchema(await readOfficialSpec(req,provider,'DeepInfra',model,specUrl),'/v1/images/generations');
      return {provider,model,sourceUrl,endpoint,inputSchema,modelMetadata:entry,schemaStatus:'official-openapi-runtime',schemaSource:specUrl,schemaUnprobed:true,mediaKind:'image'};
    }
    if(provider==='sogni') {
      const {schema,sourceUrl}=await fetchSogniGenerateImageSchema(dep.fetch,req.path,model);
      return {provider,model,sourceUrl,endpoint:schemaProviders.sogni.root+'/v1/creative-agent/workflows',inputSchema:schema,schemaVersion:schema.schemaVersion,note:'模型 selector 与 generate_image 参数来自实时官方 Schema；实时 worker 目录属于另一种 ID。'};
    }
    const {rows,sourceUrl}=await listForSchema(req,provider,credential);
    const entry=rows.find((x:any)=>(provider==='wavespeed'?x.model_id:x.id)===model);
    if(provider==='wavespeed') {
      const definition=entry?.api_schema?.api_schemas?.find((s:any)=>s.type==='model_run' && s.method==='POST');
      // 雁 rule: no local stop. Not in catalog / no model_run → official submit pattern POST {root}/api/v3/{model_id}
      // (https://wavespeed.ai/docs/submit-task); upstream 404/400 shown verbatim.
      if(!entry || !definition?.api_path || !definition?.server || !definition.request_schema) {
        const endpoint=schemaProviders.wavespeed.root+'/api/v3/'+String(model).split('/').map(encodeURIComponent).join('/');
        return {provider,model,sourceUrl,endpoint,inputSchema:undefined,modelMetadata:entry,schemaStatus:!entry?'not-in-catalog':'catalog-no-model_run',endpointSource:'https://wavespeed.ai/docs/submit-task'};
      }
      const endpoint=new URL(definition.api_path,definition.server).href;
      if(new URL(endpoint).origin!==schemaProviders.wavespeed.root)throw Object.assign(new Error('目录端点的主机不属于所选供应商，未发送密钥'),{status:400,errorSource:'local',endpoint});
      return {provider,model,sourceUrl,endpoint,inputSchema:definition.request_schema,modelMetadata:entry,schemaStatus:'catalog-model_run'};
    }
    throw new Error('Missing provider schema');
  };
  // clean-1333 #4: the Schema read at model-select time (GET /api/model-schema) is remembered per provider+model+credential so the
  // submit route reuses it instead of re-reading upstream (that was Krea's 2nd GET at run time). Never silent: every submit
  // response/error carries `schemaRead` ({fetched, readAt, reusedFrom}) and the UI prints 「复用，未重新请求」 or the GET count.
  // A new GET /api/model-schema (刷新 / 读取官方 Schema) always re-reads upstream and replaces the entry. Failures are not remembered.
  const schemaReads=new Map<string,{definition:any;readAt:string}>();
  const schemaReadKey=(provider:string,model:string,credential:any)=>`${provider}\u0000${model}\u0000${createHash('sha256').update(String(credential?.key ?? '')).digest('hex')}`;
  app.get('/api/model-schema',async(req,res,next)=>{
    const provider=String(req.query.provider || '');if(!valid(provider))return next();
    try{const credential=credentials(req,provider,{create:true});const model=String(req.query.model || '');const definition=await modelSchema(req,provider,model,credential);
      const readAt=new Date().toISOString();if(!(definition as any).catalogLookupFailure)schemaReads.set(schemaReadKey(provider,model,credential),{definition,readAt});
      res.json({...definition,credentialRef:credential.credentialRef,schemaRead:{fetched:true,readAt,route:'/api/model-schema'}});}catch(e){fail(res,e);}
  });
  app.get('/api/models',async(req,res,next)=>{
    const provider=String(req.query.provider || '');if(!valid(provider))return next();
    try {
      const wantsLora=String(req.query.type || req.query.category).toLowerCase()==='lora' || String(req.query.category).toLowerCase()==='lora';
      const key=dep.key(provider,req.headers[schemaProviders[provider].header] as string);
      const read=makeSchemaProviderReader(provider,dep.fetch,key,req.path);
      const liveSogniSchema=provider==='sogni' && !wantsLora && req.query.catalog!=='workers'
        ? await fetchSogniGenerateImageSchema(dep.fetch,req.path)
        : undefined;
      const {rows,sourceUrl,notice,nextCursor,noLoraCatalog,personalNotice,personalLibrary,personalSourceUrl}=await fetchSchemaProviderRows(provider,read,{lora:wantsLora,model:req.query.model as string,catalog:req.query.catalog as string,cursor:req.query.cursor as string,limit:provider==='krea'&&wantsLora?Math.min(1000,Math.max(1,Number(req.query.limit)||50)):undefined,selectorSchema:liveSogniSchema?.schema,selectorSchemaSource:liveSogniSchema?.sourceUrl}) as any;
      const items=normalizeSchemaProviderItems(provider,rows,{lora:wantsLora,sourceUrl:sourceUrl || '',category:String(req.query.category || 'checkpoint'),query:String(req.query.query || '')});
      const page=nextCursor!==undefined?1:Math.max(1,Number(req.query.page)||1),limit=nextCursor!==undefined?items.length||1:Math.min(100,Math.max(1,Number(req.query.limit)||50)); // upstream-cursor: upstream already paged
      const pagingNotice = provider === 'sogni' && !wantsLora && req.query.catalog !== 'workers'
        ? 'live-official-generate_image-schema'
        : 'local-slice-of-live-upstream-catalog';
      const paginationData = {
        page,
        hasMore: page * limit < items.length,
        total: items.length,
        paging: pagingNotice,
        sourceNotice: pagingNotice,
        // LoRA Hub: only a declared LoRA catalog endpoint may appear as sourceUrl.
        ...(sourceUrl ? {sourceUrl} : {}),
        ...(noLoraCatalog ? {noLoraCatalog: true, message: notice || '无 LoRA 目录接口'} : {}),
        ...(nextCursor!==undefined?{nextCursor,hasMore:Boolean(nextCursor),paging:'upstream-cursor'}:{}),
      };
      const sliced = items.slice((page - 1) * limit, page * limit);
      res.json({
        results: { [provider]: sliced },
        [provider]: sliced,
        pagination: { [provider]: paginationData },
        _pagination: { [provider]: paginationData },
        catalogNotices: notice ? { [provider]: notice } : undefined,
        catalogNotice: notice,
        ...(personalNotice ? {personalNotice} : {}),
        ...(personalLibrary ? {personalLibrary} : {}),
        ...(personalSourceUrl ? {personalSourceUrl} : {}),
      });
    }catch(e){fail(res,e);}
  });
  app.post('/api/schema-provider/:provider/submit',async(req,res)=>{
    const provider=req.params.provider;if(!valid(provider))return res.status(400).json({error:'未知供应商',errorSource:'local'});
    let actualRequest:any;let schemaRead:any;let blockStage:string|undefined;let schemaLoaded=false;let definition:any;let payload:any;let mapping:any[]=[];let workflowOptions:any={};
    {const json=res.json.bind(res);(res as any).json=(b:any)=>json(b && typeof b==='object' && !Array.isArray(b) && schemaRead && !b.schemaRead?{...b,schemaRead}:b);}
    {const json=res.json.bind(res);(res as any).json=(b:any)=>{if(res.statusCode<400 && b && typeof b.taskId==='string' && b.taskId)appendTaskTraces(`${provider}:${b.taskId}`,dep.traces?.());return json(b);};}
    try {
      const model=String(req.body.model || '').trim();if(!model)return res.status(400).json({error:'请选择模型',errorSource:'local'});
      const credential=credentials(req,provider,{create:true});
      const remembered=schemaReads.get(schemaReadKey(provider,model,credential));
      if(remembered){definition=remembered.definition;schemaRead={fetched:false,reused:true,readAt:remembered.readAt,reusedFrom:'/api/model-schema',note:'复用，未重新请求'};}
      else{schemaRead={fetched:true,readAt:new Date().toISOString()};definition=await modelSchema(req,provider,model,credential);if(!definition.catalogLookupFailure)schemaReads.set(schemaReadKey(provider,model,credential),{definition,readAt:schemaRead.readAt});}
      schemaLoaded=true;
      const custom={...req.body.custom_parameters};const canvas=custom._canvas || {};const only=canvas.parametersOnly===true;const schemaFieldsOnly=canvas.schemaFieldsOnly!==false;delete custom._canvas;
      payload={prompt:req.body.prompt};mapping=[];
      workflowOptions=provider==='sogni'?{...canvas.workflowOptions}:{};
      // 雁 rule: user-supplied custom model / workflowOptions.input are sent as filled (no local stop); upstream decides.
      const props=definition.inputSchema?.properties || {};
      const aliases:Record<string,string[]>=provider==='sogni'?{negative_prompt:['negativePrompt'],cfg:['guidance'],denoise:['starting_image_strength']}:GENERIC_PAYLOAD_ALIASES;
      // Schema-driven: image_size declared as {width,height} object (and no top-level width/height) → canvas width/height go there.
      const sizeObjectSchema=(s:any)=>[s,...(s?.anyOf||[]),...(s?.oneOf||[])].some((x:any)=>x?.type==='object' && x?.properties?.width && x?.properties?.height);
      const packSizeIntoImageSize=!only && sizeObjectSchema(props.image_size) && !Object.hasOwn(props,'width') && !Object.hasOwn(props,'height');
      // Schema-driven: `size` declared as a "W<sep>H" string (separator read from the Schema default, e.g. WaveSpeed "1024*1024") and no width/height → canvas width/height pack into it.
      const sizeSep=sizeStringSeparator(props.size);
      const packSizeIntoSizeString=!only && !packSizeIntoImageSize && sizeSep!==null && !Object.hasOwn(props,'width') && !Object.hasOwn(props,'height');
      const filled=(v:any)=>v!==undefined && v!==null && v!=='';
      if(!only)for(const name of ['negative_prompt','width','height','size','steps','cfg','seed','image_url','denoise','sampler_name','scheduler','aspect_ratio','resolution','output_format','duration','fps','num_frames']) {
        const value=req.body[name];if(value===undefined || value===null || value==='')continue;
        if(packSizeIntoImageSize && (name==='width' || name==='height'))continue; // mapped below as width+height → image_size
        const plan=planCanvasField(name,{declared:definition.inputSchema?new Set(Object.keys(props)):null,hasReferenceImage:filled(req.body.image_url),schemaFieldsOnly:!!schemaFieldsOnly,aliases,fallbackTarget:provider==='sogni'?aliases[name]?.[0]:undefined});
        if(packSizeIntoSizeString && (name==='width' || name==='height') && !filled(req.body.size))continue; // mapped below as width+height → size string
        if(provider==='sogni' && name==='image_url') {
          const issue=upstreamReferenceUrlIssue(String(value)); // recorded only; sent as filled (雁 rule)
          if(!Object.hasOwn(workflowOptions,'media_references'))workflowOptions.media_references=[{kind:'image',url:value}];payload.sourceImageIndex=-1;
          mapping.push({from:name,to:'media_references + sourceImageIndex',value,scope:'workflow',...(issue?{note:issue}:{})});continue;
        }
        const target=plan.target as string;
        if(!plan.send) {payload[target || name]=value;mapping.push({from:name,to:target || name,value,schemaDeclared:false});continue;}
        payload[target]=value;mapping.push({from:name,to:target,value,schemaDeclared:Object.hasOwn(props,target)});
      }
      if(!only && req.body.loras?.length) {
        blockStage='loras'; // clean-1333 #5/#6: a local refusal in here is caused by the LoRA node(s) → blockedField.field='loras'
        // fix4: officialUnavailableParams — block even when Schema still lists the field (Together image_loras).
        // fix3 B: map LoRAs into the payload first; maxItems / constraint checks run after the full body is assembled.
        const loras=req.body.loras;
        const resource=(l:any)=>l.path || l.url || l.civitaiId || l.name;
        const strength=(l:any)=>l.strength ?? l.modelStrength;
        if(provider==='sogni') {
          payload.loras=loras.map(resource);payload.loraStrengths=loras.map((l:any)=>Number(strength(l)));
        }
        else if(provider==='krea') {
          // Official field: styles[{id,strength}] ("Styles (typically LoRAs)"). No styles field → refuse, never strip.
          payload.styles=kreaStyles(loras);
        }
        else if(provider==='aimlapi') {
          // Official: loras[{path,scale}] only when model OpenAPI declares it (Z-Image Turbo LoRA / Flux 2 LoRA).
          payload.loras=aimlapiLoras(loras);
        }
        else if(provider==='novita') {
          // Official V3: request.loras[{model_name,strength}] on SD async txt2img/img2img (and SDK txt2video). Ming OpenAI path has no loras.
          payload.loras=novitaLoras(loras);
        }
        else {
          const target=['loras','lora_list','model_id','image_loras'].find(k=>Object.hasOwn(props,k));
          const arraySchema=props[target || 'loras'];
          // Resolve items schema through anyOf/oneOf; do NOT invent {path,scale} when properties are absent (fix3 D).
          const itemSchema=arraySchema?.items || arraySchema?.anyOf?.find((x:any)=>x.type==='array')?.items || arraySchema?.anyOf?.find((x:any)=>x?.items)?.items;
          if(target)payload[target]=mapSchemaLoraItems(loras,itemSchema,schemaProviders[provider],model);
          else if(Object.hasOwn(props,'lora_url') && loras.length===1) {payload.lora_url=resource(loras[0]);if(Object.hasOwn(props,'lora_weight'))payload.lora_weight=strength(loras[0]);}
          // No LoRA field in the Schema: send the canvas LoRA list as built (unchanged); upstream decides.
          else payload.loras=loras;
        }
        mapping.push({from:'loras',to:provider==='sogni'?'loras + loraStrengths':provider==='krea'?'styles':Object.hasOwn(payload,'model_id')?'model_id':Object.hasOwn(payload,'image_loras')?'image_loras':Object.hasOwn(payload,'lora_list')?'lora_list':Object.hasOwn(payload,'lora_url')?'lora_url + lora_weight':'loras',requested:loras,value:payload.styles || payload.loras || payload.model_id || payload.image_loras || payload.lora_list || {url:payload.lora_url,weight:payload.lora_weight},strengths:payload.loraStrengths,...(provider==='sogni'?{capability:'Official generate_image schema describes LoRA support as Krea 2 based; selector-to-worker compatibility is not dynamically declared here'}:{}),note:provider==='sogni'?'按选择器与 LoRA ID 原样提交；兼容性及字段实际应用仍以 workflow 结果为准。':'仅记录已提交的 LoRA 参数；生成成功不证明上游实际应用了 LoRA。独立 CLIP 强度没有对应字段时不会假称生效。'});
      }
      blockStage=undefined;
      // custom_parameters are scoped to the CURRENT model Schema: undeclared keys (e.g. left over from another provider/model) are not sent while Schema matching is on.
      for(const [key,value] of Object.entries(custom)) {
        const declared=Object.hasOwn(props,key);
        
        mapping.push({from:'custom_parameters.'+key,to:key,value,overrides:Object.hasOwn(payload,key)?payload[key]:undefined,schemaDeclared:declared});
      }
      Object.assign(payload,custom);
      if(provider==='sogni' && !Object.hasOwn(custom,'model'))payload.model=model;
      if(provider==='together')payload.model=model;
      if(provider==='aimlapi')payload.model=model;
      if(provider==='deepinfra')payload.model=definition?.modelMetadata?.id && !definition.modelMetadata.notInCatalog?definition.modelMetadata.id:model;
      const automaticFallback=schemaAutoFallbackSelection(payload,definition.inputSchema,definition.schemaSource);
      if(automaticFallback) {
        const source=automaticFallback.sourceUrl || '(官方 Schema 来源 URL 未返回)';
        const description=automaticFallback.description;
        mapping.push({from:automaticFallback.field,to:automaticFallback.field,value:automaticFallback.value,note:`官方 Schema 描述：${description}（来源：${source}）`});
      }
      if(provider==='sogni' && Array.isArray(payload.loras) && payload.loras.length) {
        const rangeSourceUrl=schemaProviders.sogni.root+'/v1/loras/comfy';
        let directoryRows:any[]|undefined;
        let directoryFailure:any;
        try {
          // This public directory is keyed by LoRA ID. Do not pass the hosted-tool selector
          // (e.g. krea-2-turbo) as modelId: it is a different identifier namespace.
          const rangeReader=makeSchemaProviderReader('sogni',dep.fetch,'',req.path);
          ({rows:directoryRows}=await fetchSchemaProviderRows('sogni',rangeReader,{lora:true}));
        } catch(e:any) { directoryFailure=e; }
        const rangeCheck=directoryRows
          ? validateSogniLoraStrengthRanges(payload.loras,payload.loraStrengths,directoryRows)
          : {checked:[],unknown:payload.loras.map((id:any)=>({id:String(id ?? ''),reason:'公开 LoRA 目录请求失败；范围未知，未推断'})),violations:[]};
        mapping.push({from:'Sogni LoRA strength range check',to:null,sourceUrl:rangeSourceUrl,
          status:directoryRows?'checked':'unknown',checked:rangeCheck.checked,unknown:rangeCheck.unknown,
          ...(directoryFailure?{lookupFailure:{endpoint:directoryFailure.endpoint || rangeSourceUrl,upstreamStatus:directoryFailure.status ?? null,upstreamResponseBody:directoryFailure.rawResponse ?? null,error:directoryFailure.message || String(directoryFailure)}}:{})});
      }
      {
        // Map canvas width/height → official image_size object when schema declares it.
        if(packSizeIntoImageSize && !Object.hasOwn(payload,'image_size')) {
          const w=req.body.width,h=req.body.height;
          if((w!==undefined && w!==null && w!=='') || (h!==undefined && h!==null && h!=='')) {
            const size:any={};
            if(w!==undefined && w!==null && w!=='')size.width=Number(w);
            if(h!==undefined && h!==null && h!=='')size.height=Number(h);
            payload.image_size=size;
            mapping.push({from:'width+height',to:'image_size',value:size,schemaDeclared:true});
          }
        }
      }
      if(packSizeIntoSizeString && !Object.hasOwn(payload,'size') && filled(req.body.width) && filled(req.body.height)) {
        const value=`${Number(req.body.width)}${sizeSep}${Number(req.body.height)}`;
        payload.size=value;mapping.push({from:'width+height',to:'size',value,schemaDeclared:true,note:`官方 Schema size 为 "W${sizeSep}H" 字符串（默认 ${props.size?.default}）`});
      } else if(packSizeIntoSizeString && !Object.hasOwn(payload,'size') && (filled(req.body.width) || filled(req.body.height))) {
        if(filled(req.body.width))payload.width=req.body.width;
        if(filled(req.body.height))payload.height=req.body.height;
        mapping.push({from:'width+height',to:'width/height',value:{width:req.body.width,height:req.body.height}});
      }
      // fix3 B: after the full body (incl. LoRAs) is assembled — maxItems then declared-Schema constraints. Never clamp.
      for(const m of mapping) {
        if(!m.to || m.sent===false || m.from?.startsWith?.('custom_parameters.'))continue;
        const target=String(m.to).split(' ')[0];
        const reason=schemaConstraintViolation(target,payload[target],props[target]);
        if(reason)m.schemaNote=reason;
      }
      if(provider==='novita') {
        payload.model_name=model;
        // Ensure numeric types for seed/steps/size when canvas sent strings.
        for(const k of ['seed','steps','width','height','image_num'] as const) {
          if(payload[k]!==undefined && payload[k]!==null && payload[k]!=='')payload[k]=Number(payload[k]);
        }
        if(payload.guidance_scale!==undefined && payload.guidance_scale!==null && payload.guidance_scale!=='')payload.guidance_scale=Number(payload.guidance_scale);
      }
      if(provider==='venice') {
        payload.model=model;
        // Video QueueVideoRequest has no seed — never invent/send it (schemaFieldsOnly should already skip; strip if custom JSON forced it).
        for(const k of ['seed','steps','width','height','variants','lora_strength'] as const) {
          if(payload[k]!==undefined && payload[k]!==null && payload[k]!=='')payload[k]=Number(payload[k]);
        }
        if(payload.cfg_scale!==undefined && payload.cfg_scale!==null && payload.cfg_scale!=='')payload.cfg_scale=Number(payload.cfg_scale);
      }
      {
        // Reference image: when the Schema wants a URI, a canvas data: URL goes to the provider's official upload API first and
        // the returned URL is what the model receives. http(s) URLs, and data URLs for plain-string fields, go out unchanged. Upload failures surface the upstream status + body verbatim.
        const refMap=mapping.find((m:any)=>m.from==='image_url');
        const upload=(schemaProviders[provider] as any).referenceUpload;
        const refTarget=refMap?.to as string|undefined;
        // Schema-driven: only when the model Schema declares the reference field as format "uri" (a data: URL cannot satisfy it).
        const refSpec=refTarget?props[refTarget]:undefined;
        const wantsUri=[refSpec,...(refSpec?.anyOf||[]),...(refSpec?.oneOf||[])].some((x:any)=>x?.format==='uri');
        if(upload && refTarget && wantsUri && typeof payload[refTarget]==='string' && payload[refTarget].startsWith('data:')) {
          const url=await uploadSchemaProviderReference(provider,upload,payload[refTarget],credential,req,dep);
          payload[refTarget]=url;
          refMap.value=`(data URL, ${String(req.body.image_url).length} chars)`;
          mapping.push({from:'image_url (data URL)',to:refTarget,value:url,uploadedVia:schemaProviders[provider].root+upload.path,docUrl:upload.docUrl});
        }
      }
      if(only)mapping.push({from:'canvas parameters and LoRA nodes',to:null,reason:'用户选择了仅提交 JSON 与提示词'});
      const requestBody=provider==='sogni'?{...workflowOptions,input:Object.hasOwn(workflowOptions,'input')?workflowOptions.input:{title:'Canvas · '+model,steps:[{id:'image1',toolName:'generate_image',arguments:payload}]}}:provider==='novita'?(()=>{const extra=(payload.extra && typeof payload.extra==='object')?payload.extra:{response_image_type:'jpeg'};const {extra:_e,...request}=payload;return {extra,request:{...request,model_name:model}};})():payload;
      actualRequest={endpoint:definition.endpoint,...(definition.catalogLookupFailure?{catalogLookupFailure:definition.catalogLookupFailure}:{}),...(req.body.schemaPrefetchFailure?{schemaPrefetchFailure:req.body.schemaPrefetchFailure}:{}),parameters:requestBody,mapping:mapping.map(m=>({...m,finalValue:Object.hasOwn(payload,m.to)?payload[m.to]:m.scope==='workflow'?workflowOptions.media_references:undefined})),parametersOnly:only,schemaFieldsOnly,...(definition.inputSchema?.properties?{schemaFields:Object.keys(definition.inputSchema.properties)}:{})};
      const {data,status}=await read(req,provider,definition.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(requestBody)},credential);
      if(provider==='together' && (definition as any).mediaKind!=='video') {
        // Images API is synchronous (docs.together.ai/docs/inference/images/overview). Store result for poll compatibility.
        const outputs=togetherImageOutputs(data,definition.endpoint);
        if(!outputs.length)throw Object.assign(new Error('Together 图像响应没有 url/b64_json'),{status,rawResponse:data,endpoint:definition.endpoint,errorSource:'upstream-protocol'});
        const taskId=String(data.id || randomUUID());
        togetherSyncTasks.set(taskId,{status:'completed',outputs,rawResponse:data});
        taskCredentialRefs.set(`${provider}:${taskId}`,credential.credentialRef!);taskSubmissions.set(`${provider}:${taskId}`,{model,prompt:req.body.prompt,negative_prompt:req.body.negative_prompt,actualRequest});
        return res.status(status).json({taskId,pollUrl:`/api/schema-provider/${provider}/tasks/${encodeURIComponent(taskId)}`,credentialRef:credential.credentialRef,actualRequest,inputSchema:definition.inputSchema,rawResponse:data,outputs,status:'completed'});
      }
      if(provider==='aimlapi' && (definition as any).mediaKind!=='video') {
        // Images API is synchronous (docs.aimlapi.com image models). Store result for poll compatibility.
        const outputs=aimlapiImageOutputs(data,definition.endpoint);
        if(!outputs.length)throw Object.assign(new Error('AIMLAPI 图像响应没有 url/b64_json'),{status,rawResponse:data,endpoint:definition.endpoint,errorSource:'upstream-protocol'});
        const taskId=String(data.id || randomUUID());
        aimlapiSyncTasks.set(taskId,{status:'completed',outputs,rawResponse:data});
        taskCredentialRefs.set(`${provider}:${taskId}`,credential.credentialRef!);taskSubmissions.set(`${provider}:${taskId}`,{model,prompt:req.body.prompt,negative_prompt:req.body.negative_prompt,actualRequest});
        return res.status(status).json({taskId,pollUrl:`/api/schema-provider/${provider}/tasks/${encodeURIComponent(taskId)}`,credentialRef:credential.credentialRef,actualRequest,inputSchema:definition.inputSchema,rawResponse:data,outputs,status:'completed'});
      }
      if(provider==='deepinfra') {
        // Images API is synchronous (docs.deepinfra.com/apis/image-generation; response_format b64_json). Store for poll compatibility.
        const outputs=deepinfraImageOutputs(data,definition.endpoint);
        if(!outputs.length)throw Object.assign(new Error('DeepInfra 图像响应没有 url/b64_json'),{status,rawResponse:data,endpoint:definition.endpoint,errorSource:'upstream-protocol'});
        const taskId=String(data.id || randomUUID());
        deepinfraSyncTasks.set(taskId,{status:'completed',outputs,rawResponse:data});
        taskCredentialRefs.set(`${provider}:${taskId}`,credential.credentialRef!);taskSubmissions.set(`${provider}:${taskId}`,{model,prompt:req.body.prompt,negative_prompt:req.body.negative_prompt,actualRequest});
        return res.status(status).json({taskId,pollUrl:`/api/schema-provider/${provider}/tasks/${encodeURIComponent(taskId)}`,credentialRef:credential.credentialRef,actualRequest,inputSchema:definition.inputSchema,rawResponse:data,outputs,status:'completed'});
      }
      if(provider==='venice' && (definition as any).mediaKind!=='video') {
        // Image generate is synchronous (docs.venice.ai image/generate) — images[] base64.
        const outputs=data?.__veniceBinaryImage
          ? [`data:${data.contentType};base64,${data.base64}`]
          : veniceImageOutputs(data,String(requestBody?.format || 'webp'));
        if(!outputs.length)throw Object.assign(new Error('Venice 图像响应没有 images[]'),{status,rawResponse:data,endpoint:definition.endpoint,errorSource:'upstream-protocol'});
        const taskId=String(data.id || randomUUID());
        veniceSyncTasks.set(taskId,{status:'completed',outputs,rawResponse:data});
        taskCredentialRefs.set(`${provider}:${taskId}`,credential.credentialRef!);taskSubmissions.set(`${provider}:${taskId}`,{model,prompt:req.body.prompt,negative_prompt:req.body.negative_prompt,actualRequest});
        return res.status(status).json({taskId,pollUrl:`/api/schema-provider/${provider}/tasks/${encodeURIComponent(taskId)}`,credentialRef:credential.credentialRef,actualRequest,inputSchema:definition.inputSchema,rawResponse:data,outputs,status:'completed'});
      }
      if(provider==='venice' && (definition as any).mediaKind==='video') {
        const queueId=data.queue_id || data.queueId || data.id;
        if(!queueId)throw Object.assign(new Error('Venice 视频 queue 响应没有 queue_id'),{status,rawResponse:data,endpoint:definition.endpoint,errorSource:'upstream-protocol'});
        const taskId=String(queueId);
        veniceVideoTasks.set(taskId,{model,downloadUrl:typeof data.download_url==='string'?data.download_url:undefined});
        taskCredentialRefs.set(`${provider}:${taskId}`,credential.credentialRef!);taskSubmissions.set(`${provider}:${taskId}`,{model,prompt:req.body.prompt,negative_prompt:req.body.negative_prompt,actualRequest});
        return res.status(status).json({taskId,pollUrl:`/api/schema-provider/${provider}/tasks/${encodeURIComponent(taskId)}`,credentialRef:credential.credentialRef,actualRequest,inputSchema:definition.inputSchema,rawResponse:data});
      }
      const taskId=provider==='together'||provider==='aimlapi'?data.id:provider==='novita'?data.task_id:provider==='krea'?data.job_id:provider==='muapi'?data.request_id:provider==='wavespeed'?data.data?.id:data.data?.workflow?.workflowId;
      if(!taskId)throw Object.assign(new Error('上游提交响应没有任务 ID'),{status,rawResponse:data,endpoint:definition.endpoint,errorSource:'upstream-protocol'});
      taskCredentialRefs.set(`${provider}:${taskId}`,credential.credentialRef!);taskSubmissions.set(`${provider}:${taskId}`,{model,prompt:req.body.prompt,negative_prompt:req.body.negative_prompt,actualRequest});
      res.status(status).json({taskId,pollUrl:`/api/schema-provider/${provider}/tasks/${encodeURIComponent(taskId)}`,credentialRef:credential.credentialRef,actualRequest,inputSchema:definition.inputSchema,rawResponse:data});
    }catch(e:any){
      e.actualRequest=actualRequest;e.schemaRead=schemaRead && !schemaLoaded?{...schemaRead,failed:true}:schemaRead;
      if(blockStage && !e.blockedField && e.errorSource==='local')e.blockedField={field:blockStage,reason:e.message};
      // fix3 A: every local block after Schema load carries Schema-mapped proposedRequest (never the raw canvas body).
      if(schemaLoaded && e.errorSource==='local' && !e.proposedRequest && definition) {
        try {
          const proposedBody=provider==='sogni'?{...workflowOptions,input:{title:'Canvas · '+String(req.body.model||''),steps:[{id:'image1',toolName:'generate_image',arguments:payload||{}}]}}:(payload||{});
          e.proposedRequest=proposedRequestOf(definition,proposedBody,mapping||[],req.body.loras);
        } catch { /* never mask the original local error */ }
      }
      fail(res,e);
    }
  });
  app.get('/api/schema-provider/:provider/tasks/:taskId',async(req,res)=>{
    const provider=req.params.provider;if(!valid(provider))return res.status(400).json({error:'未知供应商',errorSource:'local'});
    // Every run writes history: a terminal upstream failure (status=failed…) or a poll error records ONE failed item for the submitted task.
    {const taskKey=`${provider}:${req.params.taskId}`;const json=res.json.bind(res);
    res.json=((body:any)=>{
      const sub=taskSubmissions.get(taskKey);
      // Every poll request's upstream segments join the task ledger (not just first/last).
      const ledger=sub || taskTraces.has(taskKey)?appendTaskTraces(taskKey,dep.traces?.()):undefined;
      const failedStatus=isTaskFailureBody(body);
      if(sub && typeof body?.status==='string' && SUCCESS_TASK_STATUSES.includes(body.status.toLowerCase()))taskSubmissions.delete(taskKey);
      if(!sub || !(failedStatus || res.statusCode>=400))return json(body);
      taskSubmissions.delete(taskKey);taskTraces.delete(taskKey);
      // Failed task: not written to history (雁 2026-11-04); the node gets the verbatim task body.
      // trace-fix2 P3/P4: the task was submitted upstream (POST in the ledger) and upstream reported the failure → errorSource
      // 'upstream' (route provenance; the middleware keeps it), and the full task ledger (submit POST + every poll) rides along
      // as taskExecutionTrace so the canvas never classifies it as 「没有发出去」 from this poll's GET-only request trace.
      const provenance={errorSource:typeof body?.errorSource==='string'?body.errorSource:'upstream',...(ledger?.length?{taskExecutionTrace:[...ledger]}:{})};
      return json({...body,...provenance});
    }) as any;}
    try {
      const taskKey=`${provider}:${req.params.taskId}`;
      const requestedRef=String(req.headers[credentialHeader] || taskCredentialRefs.get(taskKey) || '').trim();
      if(!requestedRef)throw Object.assign(new Error('任务缺少原始凭据引用；为避免切换账户，不会使用新的 Key 继续轮询'),{status:409,errorSource:'local'});
      const credential=credentials(req,provider,{fallbackRef:requestedRef});
      if(provider==='together') {
        const sync=togetherSyncTasks.get(req.params.taskId);
        if(sync) {
          return res.json({status:sync.status,outputs:sync.outputs,error:sync.error,rawResponse:sync.rawResponse,credentialRef:credential.credentialRef});
        }
        const endpoint=(schemaProviders.together as any).videoRoot+'/videos/'+encodeURIComponent(req.params.taskId);
        const {data,status:upstreamStatus}=await read(req,provider,endpoint,undefined,credential);
        const status=data?.status;const outputs=togetherVideoOutputs(data);
        if(!status)throw Object.assign(new Error('Together 视频任务响应没有 status'),{status:upstreamStatus,rawResponse:data,endpoint,errorSource:'upstream-protocol'});
        return res.json({status,outputs,error:data?.error,rawResponse:data,upstreamStatus,endpoint,credentialRef:credential.credentialRef});
      }
      if(provider==='aimlapi') {
        const sync=aimlapiSyncTasks.get(req.params.taskId);
        if(sync) {
          return res.json({status:sync.status,outputs:sync.outputs,error:sync.error,rawResponse:sync.rawResponse,credentialRef:credential.credentialRef});
        }
        // Official poll: GET /v2/video/generations?generation_id=
        const endpoint=(schemaProviders.aimlapi as any).videoRoot+'/video/generations?generation_id='+encodeURIComponent(req.params.taskId);
        const {data,status:upstreamStatus}=await read(req,provider,endpoint,undefined,credential);
        const status=data?.status;const outputs=aimlapiVideoOutputs(data);
        if(!status)throw Object.assign(new Error('AIMLAPI 视频任务响应没有 status'),{status:upstreamStatus,rawResponse:data,endpoint,errorSource:'upstream-protocol'});
        return res.json({status,outputs,error:data?.error,rawResponse:data,upstreamStatus,endpoint,credentialRef:credential.credentialRef});
      }
      if(provider==='deepinfra') {
        const sync=deepinfraSyncTasks.get(req.params.taskId);
        if(sync) {
          return res.json({status:sync.status,outputs:sync.outputs,error:sync.error,rawResponse:sync.rawResponse,credentialRef:credential.credentialRef});
        }
        throw Object.assign(new Error('DeepInfra 图像任务已过期或不存在（同步接口无独立 poll）；请重新提交'),{status:404,errorSource:'local'});
      }
      if(provider==='novita') {
        // Official poll: GET /v3/async/task-result?task_id= (shared by image/video/audio)
        const endpoint=schemaProviders.novita.root+'/v3/async/task-result?task_id='+encodeURIComponent(req.params.taskId);
        const {data,status:upstreamStatus}=await read(req,provider,endpoint,undefined,credential);
        const rawStatus=data?.task?.status;
        if(!rawStatus)throw Object.assign(new Error('Novita task-result 响应没有 task.status'),{status:upstreamStatus,rawResponse:data,endpoint,errorSource:'upstream-protocol'});
        const status=novitaTaskStatus(rawStatus);
        const outputs=novitaOutputs(data);
        return res.json({status,outputs,error:data?.task?.reason || undefined,rawResponse:data,upstreamStatus,endpoint,credentialRef:credential.credentialRef,progress:data?.task?.progress_percent,seed:data?.extra?.seed});
      }
      if(provider==='venice') {
        const sync=veniceSyncTasks.get(req.params.taskId);
        if(sync) {
          return res.json({status:sync.status,outputs:sync.outputs,error:sync.error,rawResponse:sync.rawResponse,credentialRef:credential.credentialRef});
        }
        const meta=veniceVideoTasks.get(req.params.taskId);
        if(!meta?.model)throw Object.assign(new Error('Venice 视频任务缺少 model/queue 元数据；请重新提交'),{status:409,errorSource:'local'});
        // Official poll: POST /video/retrieve {model, queue_id}. Completed may be video/mp4 binary.
        const endpoint=schemaProviders.venice.root+'/video/retrieve';
        const body=JSON.stringify({model:meta.model,queue_id:req.params.taskId});
        const r=await dep.fetch({provider,route:req.path,model:meta.model,key:credential.key},endpoint,{method:'POST',headers:{...credential.headers,'Content-Type':'application/json'},body,signal:AbortSignal.timeout(60000)});
        const ctype=String(r.headers.get('content-type')||'');
        if(ctype.includes('video/') || ctype.includes('application/octet-stream')) {
          const buf=Buffer.from(await r.arrayBuffer());
          if(!r.ok)throw Object.assign(new Error(`HTTP ${r.status}: binary ${ctype} ${buf.length}B`),{status:r.status,rawResponse:`<binary ${ctype} ${buf.length}B>`,endpoint,errorSource:'upstream'});
          const dataUrl=`data:${ctype.split(';')[0] || 'video/mp4'};base64,${buf.toString('base64')}`;
          const outputs=meta.downloadUrl?[meta.downloadUrl,dataUrl]:[dataUrl];
          return res.json({status:'completed',outputs,rawResponse:{note:'binary video body',contentType:ctype,bytes:buf.length,download_url:meta.downloadUrl},upstreamStatus:r.status,endpoint,credentialRef:credential.credentialRef});
        }
        const raw=await r.text();let data:any;
        try{data=JSON.parse(raw);}catch(parseErr:any){
          throw Object.assign(new Error(r.ok?`HTTP ${r.status}: 响应非 JSON: ${parseErr?.message || parseErr}\n${raw}`:`HTTP ${r.status}: ${raw}`),{status:r.status,rawResponse:raw,endpoint,errorSource:r.ok?'upstream-protocol':'upstream',stack:parseErr?.stack});
        }
        if(!r.ok || !data)throw Object.assign(new Error(`HTTP ${r.status}: ${raw}`),{status:r.status,rawResponse:raw,endpoint,errorSource:r.ok?'upstream-protocol':'upstream'});
        const status=veniceVideoStatus(data.status);
        const outputs=[data.video_url,data.url,data.download_url,meta.downloadUrl].filter((u:any)=>typeof u==='string' && u).map(String);
        if(!data.status)throw Object.assign(new Error('Venice 视频 retrieve 响应没有 status'),{status:r.status,rawResponse:data,endpoint,errorSource:'upstream-protocol'});
        return res.json({status,outputs,error:data.error,rawResponse:data,upstreamStatus:r.status,endpoint,credentialRef:credential.credentialRef});
      }
      const suffix=provider==='krea'?'/jobs/':provider==='muapi'?'/api/v1/predictions/':provider==='wavespeed'?'/api/v3/predictions/':'/v1/creative-agent/workflows/';
      const endpoint=schemaProviders[provider].root+suffix+encodeURIComponent(req.params.taskId)+(provider==='sogni' || provider==='krea'?'':'/result');
      const {data,status:upstreamStatus}=await read(req,provider,endpoint,undefined,credential);
      const task=provider==='krea'?data:provider==='muapi'?data:provider==='wavespeed'?data.data:data.data?.workflow;
      const status=task?.status;
      const outputs=provider==='krea'?kreaJobOutputs(task):provider==='sogni'?task?.steps?.flatMap((s:any)=>s.artifacts || []).map((a:any)=>a.url).filter(Boolean):task?.outputs || [];
      if(!status)throw Object.assign(new Error('上游任务响应没有状态字段'),{status:upstreamStatus,rawResponse:data,endpoint,errorSource:'upstream-protocol'});
      // MuAPI sandbox keys return is_test mock results (docs/provider-api-audit/muapi.md §7). Never count as a real generation.
      if(provider==='muapi' && (data?.is_test===true || task?.is_test===true))return res.json({status:'sandbox_mock',upstreamTaskStatus:status,outputs:[],sandboxOutputs:outputs,error:`MuAPI sandbox key 返回 is_test mock 结果（上游 status=${status}），不是真实出图，不计为成功。请改用 Production key。`,rawResponse:data,upstreamStatus,endpoint,credentialRef:credential.credentialRef});
      res.json({status,outputs,waitingReason:task?.waitingReason,error:task?.error,rawResponse:data,upstreamStatus,endpoint,credentialRef:credential.credentialRef});
    }catch(e){fail(res,e);}
  });
  // Persistence is a separate explicit stage; a storage failure never changes the
  // upstream generation outcome or silently discards its transient URL.
  app.post('/api/schema-provider/:provider/save-result',async(req,res)=>{
    const provider=req.params.provider;if(!valid(provider))return res.status(400).json({error:'未知供应商'});
    try {
      const saved=[];const failures=[];
      // Merge this task's accumulated upstream segments (submit + every poll) into requestMetadata; existing fields untouched.
      const taskId=String(req.body.taskId ?? req.body.metadata?.requestMetadata?.submit?.taskId ?? '').trim();
      const ledger=taskId?taskTraces.get(`${provider}:${taskId}`):undefined;
      const metadata=ledger?.length?{...req.body.metadata,requestMetadata:{...req.body.metadata?.requestMetadata,executionTrace:[...ledger]}}:req.body.metadata;
      for(const url of req.body.outputs || []) {
        const durable=await dep.durable(typeof url==='string'?url:url?.url);
        if(!durable.ok){failures.push({url,error:durable.message,details:durable});continue;}
        saved.push(await dep.record({...metadata,url:durable.dataUrl,provider:schemaProviders[provider].name,actualProvider:schemaProviders[provider].name}));
      }
      if(taskId && saved.length)taskTraces.delete(`${provider}:${taskId}`);
      res.json({historyItems:saved,historyWarning:failures.length?'部分图片保存失败，生成结果仍可用':undefined,transientOutputs:failures});
    }catch(e){fail(res,e);}
  });
}
