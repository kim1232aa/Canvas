import type express from 'express';
import { randomUUID } from 'node:crypto';
import sogniImageSchema from '@sogni-ai/sogni-protocol/schemas/tools/generate_image.schema.json' with {type:'json'};
const sogniSchemaSource='@sogni-ai/sogni-protocol@1.0.0-alpha.46/schemas/tools/generate_image.schema.json';

// Protocol adapters are separate from canvas nodes. Model paths and fields come
// from live provider metadata. No model aliases, replacement or submit retries.
export const schemaProviders = {
  muapi: {name:'MuAPI',root:'https://api.muapi.ai',catalog:'/api/v1/models',header:'x-muapi-key',auth:'x-api-key'},
  wavespeed: {name:'WaveSpeed',root:'https://api.wavespeed.ai',catalog:'/api/v3/models',header:'x-wavespeed-key',auth:'Authorization'},
  sogni: {name:'Sogni',root:'https://api.sogni.ai',catalog:'/v1/model-catalog?mediaType=image&include=parameters',header:'x-sogni-key',auth:'Authorization'},
} as const;
type Provider=keyof typeof schemaProviders;
interface Dependencies {
  fetch:(meta:any,url:string,init?:RequestInit)=>Promise<Response>;
  key:(provider:string,override?:string)=>string;
  record:(item:any)=>any;
  durable:(url:string)=>Promise<any>;
}

/** Authenticated upstream reader for one provider. Throws structured errors with
 *  status/rawResponse/endpoint/errorSource — classification lives in fields. */
export function makeSchemaProviderReader(provider:Provider,depFetch:Dependencies['fetch'],key:string,route:string) {
  const headers=key?{[schemaProviders[provider].auth]:provider==='muapi'?key:`Bearer ${key}`}:{};
  return async(url:string,init?:RequestInit)=>{
    const r=await depFetch({provider,route,key},url,{...init,headers:{...headers,...init?.headers},signal:AbortSignal.timeout(60000)});
    const raw=await r.text();let data:any;try{data=JSON.parse(raw);}catch{}
    if(!r.ok || !data || data.status==='error' || (typeof data.code==='number' && data.code!==200)) {
      throw Object.assign(new Error(`HTTP ${r.status}: ${raw}`),{status:r.status,rawResponse:raw,endpoint:url,errorSource:r.ok?'upstream-protocol':'upstream'});
    }
    return {data,status:r.status,raw};
  };
}

/** Live catalog rows for a provider (or schema-enum selectors for Sogni hosted tools). */
export async function fetchSchemaProviderRows(provider:Provider,read:ReturnType<typeof makeSchemaProviderReader>,opts:{lora?:boolean;model?:string;catalog?:string}={}) {
  if(opts.lora && provider==='sogni') {
    const sourceUrl=schemaProviders.sogni.root+'/v1/loras/comfy'+(opts.model?'?modelId='+encodeURIComponent(opts.model):'');
    const {data}=await read(sourceUrl);
    const rows=Array.isArray(data.data)?data.data:data.data?.loras || data.loras;
    if(!Array.isArray(rows))throw Object.assign(new Error('LoRA 目录没有返回数组'),{status:502,rawResponse:data,endpoint:sourceUrl});
    return {rows,sourceUrl};
  }
  if(opts.lora) {
    return {rows:[],sourceUrl:schemaProviders[provider].root+schemaProviders[provider].catalog,
      notice:'此供应商模型目录返回的是生成端点，未提供 LoRA 权重目录；请在 LoRA 节点输入资源 URL，并选择支持 LoRA 的模型端点。'};
  }
  if(provider==='sogni' && opts.catalog!=='workers') {
    return {rows:sogniImageSchema.properties.model.enum.map((id:string)=>({id,name:id,parameters:sogniImageSchema,namespace:'hosted-tool-selector'})),sourceUrl:sogniSchemaSource};
  }
  const sourceUrl=schemaProviders[provider].root+schemaProviders[provider].catalog;
  const {data}=await read(sourceUrl);
  const rows=provider==='muapi'?data.models:provider==='wavespeed'?data.data:data.data?.models;
  if(!Array.isArray(rows))throw Object.assign(new Error('上游目录响应未包含模型数组'),{status:502,rawResponse:data,endpoint:sourceUrl,errorSource:'upstream-protocol'});
  return {rows,sourceUrl};
}

/** Normalize raw catalog rows into the shared model-hub item shape. */
export function normalizeSchemaProviderItems(provider:Provider,rows:any[],opts:{lora?:boolean;sourceUrl:string;category?:string;query?:string}) {
  const wantsLora=opts.lora===true;
  const category=(opts.category || 'checkpoint').toLowerCase();
  let filtered=rows;
  if(!wantsLora && category==='checkpoint' && provider!=='sogni')filtered=filtered.filter((m:any)=>provider==='muapi'?m.group_of==='image':/^(text.to.image|image.to.image|lora.support)$/i.test(m.category || m.type || ''));
  if(!wantsLora && category==='video')filtered=filtered.filter((m:any)=>/video/i.test(m.category || m.type || ''));
  const query=(opts.query || '').toLowerCase();
  return filtered.map((m:any)=>({id:wantsLora?(m.loraId || m.slug):(m.model_id || m.id || m.endpoint_url || m.name),name:m.name || m.ui?.label || m.model_id,
    provider:schemaProviders[provider].name,category:wantsLora?'LoRA':/video/i.test(m.category || m.type || '')?'Video':'Checkpoint',type:wantsLora?'LoRA':'Checkpoint',
    baseModel:m.family || m.tierId || '',description:m.description || '',tags:m.tags || [],imageUrl:m.image_url || m.thumbnail || '',
    sourceUrl:opts.sourceUrl,metadata:m,modelIds:m.modelIds,loraStrength:m.ui?.default,supportsLora:JSON.stringify(m.input_fields || m.api_schema || m.parameters || '').includes('lora'),
    badge:wantsLora?'官方 LoRA 资源':'官方模型端点',resourceKind:wantsLora?'adapter':'model-endpoint'}))
    .filter((m:any)=>m.id && (!query || (m.id+' '+m.name+' '+m.description).toLowerCase().includes(query)));
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
export function upstreamReferenceUrlIssue(raw: string): string | undefined {
  const value=String(raw || '').trim();
  if(!value)return undefined;
  if(/^data:|^blob:/i.test(value))return '参考图是浏览器本地 data/blob 地址，上游无法直接读取';
  let url:URL;
  try{url=new URL(value);}catch{return '参考图必须是上游可访问的绝对 HTTP(S) URL';}
  if(!/^https?:$/.test(url.protocol))return '参考图只支持 HTTP(S) URL';
  const host=url.hostname.toLowerCase();
  if(host==='localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host==='0.0.0.0' || host==='::1' || host.startsWith('127.'))return '参考图地址指向本机或本地域名，上游无法直接读取';
  const ipv4=host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if(ipv4){
    const [,a,b]=ipv4.map(Number);
    if(a===10 || (a===172 && b>=16 && b<=31) || (a===192 && b===168) || (a===169 && b===254))return '参考图地址位于私有/链路本地网络，上游无法直接读取';
  }
  if(host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:'))return '参考图地址位于私有/链路本地 IPv6 网络，上游无法直接读取';
  return undefined;
}

export function registerSchemaProviderRoutes(app:express.Express,dep:Dependencies) {
  const valid=(value:string):value is Provider=>Object.hasOwn(schemaProviders,value);
  const credentialRefs=new Map<string,{provider:Provider;key:string;createdAt:number}>();
  const taskCredentialRefs=new Map<string,string>();
  const requestCredentialCache=new WeakMap<object,Map<Provider,{key:string;credentialRef:string;headers:Record<string,string>}>>();
  const cleanupCredentialRefs=()=>{
    const cutoff=Date.now()-60*60*1000;
    for(const [ref,entry] of credentialRefs)if(entry.createdAt<cutoff)credentialRefs.delete(ref);
  };
  const makeCredentialRef=(provider:Provider,key:string)=>{
    cleanupCredentialRefs();
    const ref=randomUUID();
    credentialRefs.set(ref,{provider,key,createdAt:Date.now()});
    return ref;
  };
  const credentials=(req:express.Request,provider:Provider)=>{
    let cache=requestCredentialCache.get(req as object);if(!cache){cache=new Map();requestCredentialCache.set(req as object,cache);}
    const cached=cache.get(provider);if(cached)return cached;
    const suppliedRef=String(req.headers['x-canvas-credential-ref'] || '').trim();
    let key='';
    let credentialRef=suppliedRef;
    if(suppliedRef){
      const bound=credentialRefs.get(suppliedRef);
      if(!bound || bound.provider!==provider)throw Object.assign(new Error('任务凭据引用已失效或不属于当前供应商；未自动切换 Key'),{status:409,errorSource:'local'});
      key=bound.key;
    }else{
      key=dep.key(provider,req.headers[schemaProviders[provider].header] as string);
      credentialRef=makeCredentialRef(provider,key);
    }
    const resolved={key,credentialRef,headers:key?{[schemaProviders[provider].auth]:provider==='muapi'?key:`Bearer ${key}`}:{}};
    cache.set(provider,resolved);
    return resolved;
  };
  const read=async(req:express.Request,provider:Provider,url:string,init?:RequestInit)=>{
    const {key,headers}=credentials(req,provider);
    const r=await dep.fetch({provider,route:req.path,model:req.body?.model || req.query.model,key},url,{...init,headers:{...headers,...init?.headers},signal:AbortSignal.timeout(60000)});
    const raw=await r.text();let data:any;try{data=JSON.parse(raw);}catch{}
    if(!r.ok || !data || data.status==='error' || (typeof data.code==='number' && data.code!==200)) {
      throw Object.assign(new Error(`HTTP ${r.status}: ${raw}`),{status:r.status,rawResponse:raw,endpoint:url,errorSource:r.ok?'upstream-protocol':'upstream'});
    }
    return {data,status:r.status,raw};
  };
  const fail=(res:express.Response,e:any)=>res.status(e.status || 500).json({ok:false,error:e.message,rawResponse:e.rawResponse,endpoint:e.endpoint,errorSource:e.errorSource || 'network',stack:e.stack,cause:e.cause?{name:e.cause.name,message:e.cause.message,code:e.cause.code,stack:e.cause.stack}:undefined,actualRequest:e.actualRequest});
  const list=async(req:express.Request,provider:Provider)=>{
    const sourceUrl=schemaProviders[provider].root+schemaProviders[provider].catalog;
    const {data}=await read(req,provider,sourceUrl);
    const rows=provider==='muapi'?data.models:provider==='wavespeed'?data.data:data.data?.models;
    if(!Array.isArray(rows))throw Object.assign(new Error('上游目录响应未包含模型数组'),{status:502,rawResponse:data,endpoint:sourceUrl,errorSource:'upstream-protocol'});
    return {rows,sourceUrl};
  };
  const modelSchema=async(req:express.Request,provider:Provider,model:string)=>{
    if(provider==='muapi') {
      const sourceUrl=schemaProviders.muapi.root+'/openapi.json';
      const [{data:document},{rows,catalogUrl}]=await Promise.all([read(req,provider,sourceUrl),list(req,provider).then(x=>({...x,catalogUrl:x.sourceUrl}))]);
      const entry=rows.find((x:any)=>[x.name,x.endpoint_url,x.endpoint].includes(model));
      // endpoint_url is the execution identifier. The catalog's display name and
      // endpoint can differ from the OpenAPI operation (e.g. flux_dev_lora_image).
      const selectedPath=entry?.endpoint_url || entry?.endpoint || model;
      const endpoint='/api/v1/'+selectedPath.replace(/^\/api\/v1\//,'');
      const input=document.paths?.[endpoint]?.post?.requestBody?.content?.['application/json']?.schema;
      return {provider,model,sourceUrl,catalogUrl,endpoint:schemaProviders.muapi.root+endpoint,inputSchema:input?resolveSchemaRefs(input,document):null,modelMetadata:entry};
    }
    if(provider==='sogni')return {provider,model,sourceUrl:sogniSchemaSource,endpoint:schemaProviders.sogni.root+'/v1/creative-agent/workflows',inputSchema:sogniImageSchema,schemaVersion:sogniImageSchema.schemaVersion,note:'模型 selector 来自固定版本的官方工具 Schema；实时 worker 目录属于另一种 ID，不会自动转换。'};
    const {rows,sourceUrl}=await list(req,provider);
    const entry=rows.find((x:any)=>(provider==='wavespeed'?x.model_id:x.id)===model);
    if(provider==='wavespeed') {
      const definition=entry?.api_schema?.api_schemas?.find((s:any)=>s.type==='model_run' && s.method==='POST');
      const endpoint=definition ? new URL(definition.api_path,definition.server).href : schemaProviders.wavespeed.root+'/api/v3/'+model;
      if(new URL(endpoint).origin!==schemaProviders.wavespeed.root)throw Object.assign(new Error('目录端点的主机不属于所选供应商，未发送密钥'),{status:400,errorSource:'local',endpoint});
      return {provider,model,sourceUrl,endpoint,inputSchema:definition?.request_schema || null,modelMetadata:entry};
    }
    throw new Error('Missing provider schema');
  };
  app.get('/api/model-schema',async(req,res,next)=>{
    const provider=String(req.query.provider || '');if(!valid(provider))return next();
    try{
      const definition=await modelSchema(req,provider,String(req.query.model || ''));
      const {credentialRef}=credentials(req,provider);
      res.json({...definition,credentialRef});
    }catch(e){fail(res,e);}
  });
  app.get('/api/models',async(req,res,next)=>{
    const provider=String(req.query.provider || '');if(!valid(provider))return next();
    try {
      const wantsLora=String(req.query.type || req.query.category).toLowerCase()==='lora' || String(req.query.category).toLowerCase()==='lora';
      const key=dep.key(provider,req.headers[schemaProviders[provider].header] as string);
      const read=makeSchemaProviderReader(provider,dep.fetch,key,req.path);
      const {rows,sourceUrl,notice}=await fetchSchemaProviderRows(provider,read,{lora:wantsLora,model:req.query.model as string,catalog:req.query.catalog as string});
      const items=normalizeSchemaProviderItems(provider,rows,{lora:wantsLora,sourceUrl,category:String(req.query.category || 'checkpoint'),query:String(req.query.query || '')});
      const page=Math.max(1,Number(req.query.page)||1),limit=Math.min(100,Math.max(1,Number(req.query.limit)||50));
      res.json({[provider]:items.slice((page-1)*limit,page*limit),_pagination:{[provider]:{page,hasMore:page*limit<items.length,total:items.length,paging:provider==='sogni' && !wantsLora && req.query.catalog!=='workers'?'versioned-official-schema-selectors':'local-slice-of-live-catalog',sourceUrl}},catalogNotice:notice});
    }catch(e){fail(res,e);}
  });
  app.post('/api/schema-provider/:provider/submit',async(req,res)=>{
    const provider=req.params.provider;if(!valid(provider))return res.status(400).json({error:'未知供应商',errorSource:'local'});
    let actualRequest:any;
    try {
      const model=String(req.body.model || '').trim();if(!model)return res.status(400).json({error:'请选择模型',errorSource:'local'});
      const definition=await modelSchema(req,provider,model);
      const custom={...req.body.custom_parameters};const canvas=custom._canvas || {};const only=canvas.parametersOnly===true;const schemaFieldsOnly=canvas.schemaFieldsOnly!==false;delete custom._canvas;
      const payload:any={prompt:req.body.prompt};const mapping:any[]=[];
      const workflowOptions=provider==='sogni'?{...canvas.workflowOptions}:{};
      if(provider==='sogni' && ((custom.model!==undefined && custom.model!==model) || Object.hasOwn(workflowOptions,'input')))throw Object.assign(new Error('请通过模型选择器指定 Sogni model；_canvas.workflowOptions 只接收工作流外层参数，不能覆盖 input'),{status:400,errorSource:'local'});
      const props=definition.inputSchema?.properties || {};
      const aliases:Record<string,string[]>=provider==='sogni'?{negative_prompt:['negativePrompt'],cfg:['guidance'],denoise:['starting_image_strength']}:{steps:['num_inference_steps','steps'],cfg:['guidance_scale','guidance','cfg'],negative_prompt:['negative_prompt'],image_url:['image','image_url'],denoise:['strength','denoise'],sampler_name:['sampler_name','sampler'],scheduler:['scheduler']};
      if(!only)for(const name of ['negative_prompt','width','height','steps','cfg','seed','image_url','denoise','sampler_name','scheduler']) {
        const value=req.body[name];if(value===undefined || value===null || value==='')continue;
        if(provider==='sogni' && name==='image_url') {
          const issue=upstreamReferenceUrlIssue(String(value));
          if(issue)throw Object.assign(new Error(issue),{status:400,errorSource:'local'});
          if(!Object.hasOwn(workflowOptions,'media_references'))workflowOptions.media_references=[{kind:'image',url:value}];payload.sourceImageIndex=-1;
          mapping.push({from:name,to:'media_references + sourceImageIndex',value,scope:'workflow'});continue;
        }
        const target=Object.hasOwn(props,name)?name:(aliases[name] || []).find(x=>Object.hasOwn(props,x)) || (provider==='sogni'?aliases[name]?.[0]:undefined) || name;
        if(schemaFieldsOnly && definition.inputSchema && !Object.hasOwn(props,target)) {
          mapping.push({from:name,to:null,value,sent:false,reason:'画布参数没有对应的官方 Schema 字段；界面的 Schema 匹配模式已启用。可取消此模式，或在 JSON 中显式提交。'});continue;
        }
        payload[target]=value;mapping.push({from:name,to:target,value,schemaDeclared:Object.hasOwn(props,target)});
      }
      if(!only && req.body.loras?.length) {
        const loras=req.body.loras;
        const resource=(l:any)=>l.path || l.url || l.civitaiId || l.name;
        const strength=(l:any)=>l.strength ?? l.modelStrength;
        if(provider==='sogni') {payload.loras=loras.map(resource);payload.loraStrengths=loras.map(strength);}
        else {
          const target=['loras','lora_list','model_id'].find(k=>Object.hasOwn(props,k));
          const arraySchema=props[target || 'loras'];
          const itemSchema=arraySchema?.items || arraySchema?.anyOf?.find((x:any)=>x.type==='array')?.items;
          if(target)payload[target]=loras.map((l:any)=>itemSchema?.type==='string'?resource(l):itemSchema?.properties?.model?{model:resource(l),weight:strength(l)}:{path:resource(l),scale:strength(l)});
          else if(Object.hasOwn(props,'lora_url') && loras.length===1) {payload.lora_url=resource(loras[0]);if(Object.hasOwn(props,'lora_weight'))payload.lora_weight=strength(loras[0]);}
          else payload.loras=loras.map((l:any)=>({path:resource(l),scale:strength(l)}));
        }
        mapping.push({from:'loras',to:provider==='sogni'?'loras + loraStrengths':Object.hasOwn(payload,'model_id')?'model_id':Object.hasOwn(payload,'lora_list')?'lora_list':Object.hasOwn(payload,'lora_url')?'lora_url + lora_weight':'loras',requested:loras,value:payload.loras || payload.model_id || payload.lora_list || {url:payload.lora_url,weight:payload.lora_weight},strengths:payload.loraStrengths,note:'仅记录已提交的 LoRA 参数；生成成功不证明上游实际应用了 LoRA。独立 CLIP 强度没有对应字段时不会假称生效。'});
      }
      for(const [key,value] of Object.entries(custom))mapping.push({from:'custom_parameters.'+key,to:key,value,overrides:Object.hasOwn(payload,key)?payload[key]:undefined,schemaDeclared:Object.hasOwn(props,key)});
      Object.assign(payload,custom);
      if(provider==='sogni')payload.model=model;
      if(only)mapping.push({from:'canvas parameters and LoRA nodes',to:null,reason:'用户选择了仅提交 JSON 与提示词'});
      const requestBody=provider==='sogni'?{...workflowOptions,input:{title:'Canvas · '+model,steps:[{id:'image1',toolName:'generate_image',arguments:payload}]}}:payload;
      actualRequest={endpoint:definition.endpoint,parameters:requestBody,mapping:mapping.map(m=>({...m,finalValue:Object.hasOwn(payload,m.to)?payload[m.to]:m.scope==='workflow'?workflowOptions.media_references:undefined})),parametersOnly:only,schemaFieldsOnly};
      const {data,status}=await read(req,provider,definition.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(requestBody)});
      const taskId=provider==='muapi'?data.request_id:provider==='wavespeed'?data.data?.id:data.data?.workflow?.workflowId;
      if(!taskId)throw Object.assign(new Error('上游提交响应没有任务 ID'),{status,rawResponse:data,endpoint:definition.endpoint,errorSource:'upstream-protocol'});
      const {credentialRef}=credentials(req,provider);
      if(credentialRef)taskCredentialRefs.set(`${provider}:${taskId}`,credentialRef);
      res.status(status).json({taskId,pollUrl:`/api/schema-provider/${provider}/tasks/${encodeURIComponent(taskId)}`,credentialRef,actualRequest,inputSchema:definition.inputSchema,rawResponse:data});
    }catch(e:any){e.actualRequest=actualRequest;fail(res,e);}
  });
  app.get('/api/schema-provider/:provider/tasks/:taskId',async(req,res)=>{
    const provider=req.params.provider;if(!valid(provider))return res.status(400).json({error:'未知供应商',errorSource:'local'});
    try {
      const taskKey=`${provider}:${req.params.taskId}`;
      const expectedRef=taskCredentialRefs.get(taskKey);
      const suppliedRef=String(req.headers['x-canvas-credential-ref'] || '').trim();
      if(!expectedRef || !suppliedRef || suppliedRef!==expectedRef)throw Object.assign(new Error('任务原始凭据引用缺失或失效；为避免跨账户轮询，未自动切换 Key'),{status:409,errorSource:'local'});
      credentials(req,provider);
      const suffix=provider==='muapi'?'/api/v1/predictions/':provider==='wavespeed'?'/api/v3/predictions/':'/v1/creative-agent/workflows/';
      const endpoint=schemaProviders[provider].root+suffix+encodeURIComponent(req.params.taskId)+(provider==='sogni'?'':'/result');
      const {data,status:upstreamStatus}=await read(req,provider,endpoint);
      const task=provider==='muapi'?data:provider==='wavespeed'?data.data:data.data?.workflow;
      const status=task?.status;const outputs=provider==='sogni'?task?.steps?.flatMap((s:any)=>s.artifacts || []).map((a:any)=>a.url).filter(Boolean):task?.outputs || [];
      if(!status)throw Object.assign(new Error('上游任务响应没有状态字段'),{status:upstreamStatus,rawResponse:data,endpoint,errorSource:'upstream-protocol'});
      res.json({status,outputs,waitingReason:task?.waitingReason,error:task?.error,rawResponse:data,upstreamStatus,endpoint});
    }catch(e){fail(res,e);}
  });
  // Persistence is a separate explicit stage; a storage failure never changes the
  // upstream generation outcome or silently discards its transient URL.
  app.post('/api/schema-provider/:provider/save-result',async(req,res)=>{
    const provider=req.params.provider;if(!valid(provider))return res.status(400).json({error:'未知供应商'});
    try {
      const saved=[];const failures=[];
      for(const url of req.body.outputs || []) {
        const durable=await dep.durable(typeof url==='string'?url:url?.url);
        if(!durable.ok){failures.push({url,error:durable.message,details:durable});continue;}
        saved.push(dep.record({...req.body.metadata,url:durable.dataUrl,provider:schemaProviders[provider].name,actualProvider:schemaProviders[provider].name}));
      }
      res.json({historyItems:saved,historyWarning:failures.length?'部分图片保存失败，生成结果仍可用':undefined,transientOutputs:failures});
    }catch(e){fail(res,e);}
  });
}
