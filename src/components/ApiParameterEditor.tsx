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
 return <>{schema?.inputSchema && <SchemaChoiceControls inputSchema={schema.inputSchema} sourceUrl={schema.schemaSource || schema.sourceUrl} value={value} onChange={onChange} schemaUnprobed={schema.schemaUnprobed===true} openapi={schema.openapi} canvasLoras={canvasLoras} />}<details className="rounded-xl border border-slate-700 bg-[#111620] p-3 text-sm text-slate-200" onPointerDown={e=>e.stopPropagation()} onMouseDown={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>
  <summary className="cursor-pointer">{provider==='civitai' ? 'Civitai 高级参数 · JSON' : '请求参数预览 · JSON（默认收起）'}</summary>
  <p className="my-3 text-slate-400">{provider==='civitai' ? 'JSON 对象独立保存在 custom_parameters，前端不改 provider/model。服务端完成 recipe 映射后，高级 JSON 的同名字段覆盖映射值；false、0、空值和未知字段保留。覆盖前后值及最终实际上游 JSON 见执行记录；非空 LoRA 请求意图不会在前端移除。' : '这里的字段会覆盖适配后的同名请求参数并直接提交。空值也保留。实际请求与响应见执行记录。'}</p>
  {provider==='sogni'&&<p className="my-2 text-slate-400">图生图通过工作流 media_references 引用图片。外层参数可写在 _canvas.workflowOptions 中；需要上游能访问的图片 URL。LoRA 使用官方资源 ID 与 loraStrengths，图片生成成功不代表 LoRA 已生效。</p>}
  <p className="my-2 text-slate-400">只读预览：由上方 Schema 控件生成，不手写。实际发出去的字段以执行记录 / 历史详情为准。</p><textarea readOnly aria-label="请求参数 JSON 预览（只读）" value={value || ''} spellCheck={false} className="w-full min-h-32 rounded-lg border border-slate-600 bg-black/30 p-3 font-mono text-sm" />
  {provider==='aimlapi'&&<p className="my-2 text-slate-400">AIMLAPI 图像 POST /v1/images/generations（同步）；视频 POST/GET /v2/video/generations（异步）。LoRA 用 loras 数组，每项含 path 与 scale（0–4）；数量上限按模型 Schema 的 loras.maxItems；模型 Schema 无 loras 时会本地 400 拒绝。</p>}
  {provider==='novita'&&<p className="my-2 text-slate-400">Novita SD 出图 POST /v3/async/txt2img（或 img2img）后轮询 /v3/async/task-result。请求体为 {'{'}extra, request{'}'}；LoRA 用 request.loras[{'{'}model_name, strength{'}'}]（strength [0,1]，须显式传）。Schema 无 loras 时本地 400。</p>}
  {provider==='venice'&&<p className="my-2 text-slate-400">Venice 图像 POST /image/generate（同步）；视频 POST /video/queue → POST /video/retrieve（异步）。官方无自定义 LoRA；挂 LoRA 会本地拦截（未发请求）。cfg 对应 cfg_scale；视频不发 seed。lora_strength（0–100）是捆绑模型附加 LoRA 强度，走上方 Schema 字段，不是画布 LoRA 节点。</p>}
{provider==='together'&&(<details className="my-1.5 text-[11px] text-slate-400"><summary className="cursor-pointer text-slate-300 font-medium">Together：公共不挂假 LoRA（不发送 image_loras）</summary><p className="mt-1 leading-relaxed break-all">图像 POST /v1/images/generations；视频 /v2/videos。官方：image_loras no longer available（<a className="text-cyan-400 underline break-all" href="https://docs.together.ai/docs/inference/images/parameters" target="_blank" rel="noreferrer">docs.together.ai/…/parameters</a>，抓取 2026-10-16 15:08:58）。挂 LoRA 本地拦截。</p></details>)}
  {['muapi','wavespeed','sogni','krea','together','aimlapi','novita','venice'].includes(provider)&&<label className="my-2 flex items-center gap-2"><input type="checkbox" aria-label="仅提交 JSON 与提示词" checked={(()=>{try{return JSON.parse(value || '{}')._canvas?.parametersOnly===true}catch{return false}})()} onChange={e=>{try{const p=JSON.parse(value || '{}');p._canvas={...p._canvas,parametersOnly:e.target.checked};onChange(JSON.stringify(p,null,2));}catch{setError('请先修正 JSON')}}}/>仅提交 JSON 与提示词（其他画布参数与 LoRA 节点不加入请求）</label>}
  {['muapi','wavespeed','sogni','krea','together','aimlapi','novita','venice'].includes(provider)&&<label className="my-2 flex items-center gap-2"><input type="checkbox" aria-label="画布参数匹配官方 Schema" checked={(()=>{try{return JSON.parse(value || '{}')._canvas?.schemaFieldsOnly!==false}catch{return true}})()} onChange={e=>{try{const p=JSON.parse(value || '{}');p._canvas={...p._canvas,schemaFieldsOnly:e.target.checked};onChange(JSON.stringify(p,null,2));}catch{setError('请先修正 JSON')}}}/>画布参数只提交官方 Schema 声明的字段；未提交项列入执行记录。手写 JSON 原样提交，LoRA 保留。</label>}
  {invalid&&<p role="alert" className="text-amber-200">{invalid}</p>}
  {provider!=='civitai'&&<button type="button" onClick={()=>void load(true)} className="mt-3 text-cyan-300">读取所选模型的官方 Schema</button>}
  {error&&<p role="alert" className="text-rose-300 mt-2">{error} · 完整错误见执行记录</p>}
  {schema&&<div className="mt-3"><p className="text-slate-400">来源：<UrlText url={String(schema.schemaSource || schema.sourceUrl || schema.source || schema.endpoint || '')} /></p>{schema.inputSchema?.properties && <div className="flex flex-wrap gap-2 my-2">{Object.entries(schema.inputSchema.properties).filter(([key])=>!['model','provider','endpoint','inference_provider'].includes(key)).map(([key,spec]:[string,any])=><button key={key} type="button" title={spec.description} onClick={()=>{try{const body=JSON.parse(value || '{}');if(!(key in body)){/* Schema default only; numbers without a default stay empty (null) for the user to fill — never a made-up 0. */body[key]=spec.default ?? (spec.type==='boolean'?false:spec.type==='number'||spec.type==='integer'?null:spec.type==='array'?[]:spec.type==='object'?{}:'');}onChange(JSON.stringify(body,null,2));}catch{setError('先修正 JSON，再添加 Schema 字段');}}} className="rounded border border-slate-600 px-2 py-1 text-cyan-200">{key}</button>)}</div>}<details className="mt-1"><summary className="cursor-pointer text-slate-400 text-xs">完整 Schema JSON（点开）</summary><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-300">{JSON.stringify(schema,null,2)}</pre></details></div>}
 </details></>;
}
