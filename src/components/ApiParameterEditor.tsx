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
 return <>
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
