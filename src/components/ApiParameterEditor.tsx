import React from 'react';
import {getStoredApiKeys} from '../services/api';
import {tracedFetch} from '../services/executionTrace';
import {SchemaChoiceControls} from './SchemaChoiceControls';
import {UrlText} from './UrlText';
import {sharedGetJson,peekSharedGet,subscribeSharedGet} from '../services/sharedGet';
import {clearSchemaReuse} from '../services/userModelSelection';
import {schemaRequestFor} from '../services/userModelSelection';
import {rescopeCustomParameters} from '../utils/customParameterScope';
export function ApiParameterEditor({provider,model,value,onChange,canvasLoras}:{provider:string;model:string;value?:string;onChange:(value:string)=>void;canvasLoras?:Array<{name?:string;strength?:number}>|null}){
 const [schema,setSchema]=React.useState<any>(); const [error,setError]=React.useState('');
 const keyHeaders=()=>schemaRequestFor(provider,model).headers;
 const valueRef=React.useRef(value);valueRef.current=value;
 // One GET per (provider, model, key): node + inspector instances and remounts share it; the button forces a fresh read.
 const scopeRef=React.useRef('');scopeRef.current=`${provider}\u0000${model}`;
 // Keyed by provider+model: the previous provider's Schema/endpoint is cleared before the new GET and late replies for a stale scope are ignored.
 const schemaUrl=()=>schemaRequestFor(provider,model).url;
 // peekOnly: mount/hydrate — show a result a user action already fetched, never issue a GET.
 const load=async(force=false,peekOnly=false)=>{if(force)clearSchemaReuse(provider,model);const scope=`${provider}\u0000${model}`;const pending=peekOnly?peekSharedGet(schemaUrl(),keyHeaders() as Record<string,string>):undefined;if(peekOnly&&!pending){setSchema(undefined);return;}setError('');setSchema(undefined);try{const {data}=await (pending ?? sharedGetJson(schemaUrl(),keyHeaders() as Record<string,string>,{force}));if(scopeRef.current!==scope)return;setSchema(data);const props=data?.inputSchema?.properties;if(props&&typeof props==='object'){const next=rescopeCustomParameters(valueRef.current,provider,model,Object.keys(props));if(next!==null && next!==valueRef.current)onChange(next);}}catch(e:any){if(scopeRef.current!==scope)return;const next=rescopeCustomParameters(valueRef.current,provider,model,null);if(next!==null && next!==valueRef.current)onChange(next);setError(String(e.message));}};
 // Load the official Schema once per provider/model so Schema choice fields (e.g. image_size) are configurable on the node.
 // clean-0942: the editor never fetches on a prop change. User selections fetch via noteUserModelSelection (one GET);
 // here we only show what that shared GET returned. Mount / hydrate / StrictMode → peek only → 0 GETs.
 React.useEffect(()=>{if(provider && provider!=='civitai' && model)void load(false,true);// eslint-disable-next-line react-hooks/exhaustive-deps
 },[provider,model]);
 // A run / sibling editor fetched this Schema → reflect it without fetching.
 React.useEffect(()=>subscribeSharedGet(()=>{if(provider && provider!=='civitai' && model && peekSharedGet(schemaUrl(),keyHeaders() as Record<string,string>))void load(false,true);}),// eslint-disable-next-line react-hooks/exhaustive-deps
 [provider,model]);
 let invalid='';try{if(value){const p=JSON.parse(value);if(!p||Array.isArray(p)||typeof p!=='object')invalid='请求参数必须为 JSON 对象';}}catch{invalid='JSON 尚未完成，提交前请修正';}
 return <>{schema?.inputSchema && <SchemaChoiceControls inputSchema={schema.inputSchema} sourceUrl={schema.schemaSource || schema.sourceUrl} value={value} onChange={onChange} schemaUnprobed={schema.schemaUnprobed===true} openapi={schema.openapi} canvasLoras={canvasLoras} />}
  {/* 雁 2026-11-04: no developer content here (JSON preview, notes, Schema switches); requests go to temp/logs. */}
  {invalid&&<p role="alert" className="text-amber-200">{invalid}</p>}
 </>;
}
