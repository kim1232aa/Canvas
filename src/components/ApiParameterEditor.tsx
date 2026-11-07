import React from 'react';
import {getStoredApiKeys} from '../services/api';
import {tracedFetch} from '../services/executionTrace';
import {SchemaChoiceControls} from './SchemaChoiceControls';
import {UrlText} from './UrlText';
import {sharedGetJson,peekSharedGet,subscribeSharedGet} from '../services/sharedGet';
import {clearSchemaReuse} from '../services/userModelSelection';
import {schemaRequestFor} from '../services/userModelSelection';
import {rescopeCustomParameters} from '../utils/customParameterScope';
export type SchemaErrorInfo = {
  endpoint: string;
  upstreamEndpoint?: string;
  status?: number;
  raw: string;
};

export function ApiParameterEditor({provider,model,value,onChange,canvasLoras}:{provider:string;model:string;value?:string;onChange:(value:string)=>void;canvasLoras?:Array<{name?:string;strength?:number}>|null}){
 const [schema,setSchema]=React.useState<any>();
 const [error,setError]=React.useState<SchemaErrorInfo | null>(null);
 const keyHeaders=()=>schemaRequestFor(provider,model).headers;
 const valueRef=React.useRef(value);valueRef.current=value;
 // One GET per (provider, model, key): node + inspector instances and remounts share it; the button forces a fresh read.
 const scopeRef=React.useRef('');scopeRef.current=`${provider}\u0000${model}`;
 // Keyed by provider+model: the previous provider's Schema/endpoint is cleared before the new GET and late replies for a stale scope are ignored.
 const schemaUrl=()=>schemaRequestFor(provider,model).url;
 // peekOnly: mount/hydrate — show a result a user action already fetched, never issue a GET.
 const load=async(force=false,peekOnly=false)=>{
  if(force)clearSchemaReuse(provider,model);
  const scope=`${provider}\u0000${model}`;
  const pending=peekOnly?peekSharedGet(schemaUrl(),keyHeaders() as Record<string,string>):undefined;
  if(peekOnly&&!pending){
    setSchema(undefined);
    setError(null);
    return;
  }
  setError(null);
  setSchema(undefined);
  try{
    const result=await (pending ?? sharedGetJson(schemaUrl(),keyHeaders() as Record<string,string>,{force}));
    if(scopeRef.current!==scope)return;
    if(!result.ok){
      setSchema(undefined);
      const rawBody = result.raw !== undefined
        ? result.raw
        : (result.data ? (typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2)) : '');
      setError({
        endpoint: schemaUrl(),
        upstreamEndpoint: result.data?.endpoint,
        status: result.status,
        raw: rawBody,
      });
      return;
    }
    setSchema(result.data);
    setError(null);
    const props=result.data?.inputSchema?.properties;
    if(props&&typeof props==='object'){
      const next=rescopeCustomParameters(valueRef.current,provider,model,Object.keys(props));
      if(next!==null && next!==valueRef.current)onChange(next);
    }
  }catch(e:any){
    if(scopeRef.current!==scope)return;
    setSchema(undefined);
    const status = typeof e?.appStatus === 'number' ? e.appStatus : (typeof e?.status === 'number' ? e.status : undefined);
    const rawBody = e?.rawBody !== undefined
      ? e.rawBody
      : (e?.data ? (typeof e.data === 'string' ? e.data : JSON.stringify(e.data, null, 2)) : String(e?.stack || e?.message || e || ''));
    const upstreamEndpoint = e?.endpoint || e?.data?.endpoint;
    setError({
      endpoint: schemaUrl(),
      upstreamEndpoint,
      status,
      raw: rawBody,
    });
  }
 };
 // Load the official Schema once per provider/model so Schema choice fields (e.g. image_size) are configurable on the node.
 // clean-0942: the editor never fetches on a prop change. User selections fetch via noteUserModelSelection (one GET);
 // here we only show what that shared GET returned. Mount / hydrate / StrictMode → peek only → 0 GETs.
 React.useEffect(()=>{
  if(provider && provider!=='civitai' && model){
    void load(false,true);
  } else {
    setSchema(undefined);
    setError(null);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[provider,model]);
 // A run / sibling editor fetched this Schema → reflect it without fetching.
 React.useEffect(()=>subscribeSharedGet(()=>{if(provider && provider!=='civitai' && model && peekSharedGet(schemaUrl(),keyHeaders() as Record<string,string>))void load(false,true);}),// eslint-disable-next-line react-hooks/exhaustive-deps
 [provider,model]);
 let invalid='';try{if(value){const p=JSON.parse(value);if(!p||Array.isArray(p)||typeof p!=='object')invalid='请求参数必须为 JSON 对象';}}catch{invalid='JSON 尚未完成，提交前请修正';}
 const schemaProps=schema?.inputSchema?.properties;
 const insertField=(key:string,spec:any)=>{
  try{
   const body=JSON.parse(value || '{}');
   if(!body||Array.isArray(body)||typeof body!=='object')return;
   if(!(key in body))body[key]=spec?.default ?? (spec?.type==='boolean'?false:spec?.type==='number'||spec?.type==='integer'?0:spec?.type==='array'?[]:spec?.type==='object'?{}:'');
   onChange(JSON.stringify(body,null,2));
  }catch{/* the invalid-JSON alert above stays; nothing is written until it parses */}
 };
 return <>
  <div className="rounded-xl border border-slate-700 bg-[#111620] p-3 text-sm text-slate-200 my-2" onPointerDown={e=>e.stopPropagation()} onMouseDown={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>
   <p className="mb-2 text-slate-300">自定义 API 参数 JSON · 这里的字段覆盖同名请求参数并直接提交，空值也保留。</p>
   <textarea aria-label="自定义 API 参数 JSON" value={value || ''} onChange={e=>onChange(e.target.value)} placeholder={'{\n  "seed": 42\n}'} spellCheck={false} className="w-full min-h-32 rounded-lg border border-slate-600 bg-black/30 p-3 font-mono text-sm" />
   <button type="button" onClick={()=>void load(true)} className="mt-3 text-cyan-300">读取所选模型的官方 Schema</button>
   {schemaProps&&typeof schemaProps==='object'&&<div className="flex flex-wrap gap-2 my-2">{Object.entries(schemaProps).filter(([key])=>!['model','provider','endpoint','inference_provider'].includes(key)).map(([key,spec]:[string,any])=><button key={key} type="button" title={typeof spec?.description==='string'?spec.description:key} onClick={()=>insertField(key,spec)} className="rounded border border-slate-600 px-2 py-1 text-cyan-200">{key}</button>)}</div>}
  </div>
  {schema?.inputSchema && <SchemaChoiceControls inputSchema={schema.inputSchema} sourceUrl={schema.schemaSource || schema.sourceUrl} value={value} onChange={onChange} schemaUnprobed={schema.schemaUnprobed===true} openapi={schema.openapi} canvasLoras={canvasLoras} />}
  {error && (
   <div role="alert" aria-label="Schema 请求失败" className="rounded-lg border border-rose-900/60 bg-rose-950/20 p-2.5 text-xs text-rose-200 font-mono space-y-1 my-2">
    <div className="font-semibold text-rose-100">Schema 获取失败</div>
    <div className="break-all text-[11px] text-rose-300">
     <span>请求端点：</span>{error.endpoint}
    </div>
    {error.upstreamEndpoint && error.upstreamEndpoint !== error.endpoint && (
     <div className="break-all text-[11px] text-rose-300">
      <span>上游端点：</span>{error.upstreamEndpoint}
     </div>
    )}
    {error.status !== undefined && (
     <div className="text-[11px] text-rose-300">
      <span>HTTP 状态码：</span>{error.status}
     </div>
    )}
    <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-all text-[11px] bg-black/40 p-2 rounded border border-rose-950 select-text">
     {error.raw}
    </pre>
   </div>
  )}
  {invalid&&<p role="alert" className="text-amber-200">{invalid}</p>}
 </>;
}
