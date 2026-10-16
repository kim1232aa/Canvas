import {TensorCatalogNotice} from './TensorCatalogNotice';
import React from 'react';
import {fetchLiveModelsShared, isCustomParametersJsonQuery, sanitizeCatalogQuery} from '../services/api';
import {noteUserModelSelection, schemaReuseFor, subscribeSchemaReuse} from '../services/userModelSelection';
import {beginTraceOperation} from '../services/executionTrace';
import {readCheckpointCatalog,mergeCheckpointOptions,isInvalidTensorModel,type CatalogOption} from '../utils/modelCatalog';

/** Survives panel remount: last catalog labels/count per provider so reopen keeps「Name · id」+「目录已返回 N」without a new GET. */
const catalogMemory = new Map<string, { options: CatalogOption[]; count: number }>();

export function ProviderModelSelect({provider,value,onChange}:{provider:string;value:string;onChange:(value:string)=>void}) {
  const [query,setQuery]=React.useState('');
  const [live,setLive]=React.useState<CatalogOption[]>([]);
  const [loading,setLoading]=React.useState(false);
  const [error,setError]=React.useState('');
  const [page,setPage]=React.useState(1);
  const [cursor,setCursor]=React.useState('');
  const [hasMore,setHasMore]=React.useState(false);
  const [reload,setReload]=React.useState(0);
  // clean-0903: no catalog GET on mount/hydrate. Armed by a user action: focusing/opening the picker, typing, 刷新目录, changing provider.
  const [armed,setArmed]=React.useState(false);
  const arm=()=>{if(!armed){beginTraceOperation(`打开模型目录 ${provider}`);setArmed(true);}};
  const firstProvider=React.useRef(provider);
  // The provider-switch catalog GET is its own operation (kept, not deduplicated away).
  const lastProvider=React.useRef(provider);
  React.useEffect(()=>{if(provider!==lastProvider.current){lastProvider.current=provider;beginTraceOperation(`切换服务商 ${provider}`);}if(provider!==firstProvider.current)setArmed(true);},[provider]);
  const request=React.useRef(0);
  const lastReload=React.useRef(0);
  React.useEffect(()=>{
    const id=++request.current;
    setLive([]);setError('');setPage(1);setCursor('');setHasMore(false);
    if (!provider || !armed) {setLoading(false);return;}
    // clean-1149 #2: pasted custom_parameters JSON is not a catalog search — write nodes only, zero /api/models.
    if (isCustomParametersJsonQuery(query)) {setLoading(false);setQuery('');return;}
    setLoading(true);
    const timer=setTimeout(()=>{
      const force=reload!==lastReload.current;lastReload.current=reload;
      fetchLiveModelsShared(force,provider,sanitizeCatalogQuery(query),'Checkpoint','checkpoint','downloads','',1,50,'','').then(data=>{
        if(id!==request.current)return;
        const result=readCheckpointCatalog(data,provider);
        setLive(result.options);setPage(result.page);setCursor(result.nextCursor);setHasMore(result.hasMore);
      }).catch(error=>{if(id===request.current)setError(`${error.message}\n${error.stack || ''}`);}).finally(()=>{if(id===request.current)setLoading(false);});
    },query ? 300 : 0);
    return ()=>{clearTimeout(timer);++request.current;};
  },[provider,query,reload,armed]);
  const loadMore=async()=>{
    if(loading||!hasMore)return;
    const id=request.current;setLoading(true);setError('');
    try {
      const result=readCheckpointCatalog(await fetchLiveModelsShared(false,provider,sanitizeCatalogQuery(query),'Checkpoint','checkpoint','downloads',cursor,page+1,50,'',''),provider);
      if(id!==request.current)return;
      setLive(old=>[...old,...result.options]);setPage(page+1);setCursor(result.nextCursor);setHasMore(result.hasMore);
    }catch(error:any){if(id===request.current)setError(`${error.message}\n${error.stack || ''}`);}finally{if(id===request.current)setLoading(false);}
  };
  if (live.length) catalogMemory.set(provider, { options: live, count: live.length });
  const remembered = catalogMemory.get(provider);
  const all=mergeCheckpointOptions(provider, live.length ? live : (remembered?.options || []));
  const options=query && provider!=='tensorart' ? all.filter(row=>`${row.label} ${row.value}`.toLowerCase().includes(query.toLowerCase())) : all;
  const invalid=isInvalidTensorModel(provider,value);
  const selected=all.find(row=>row.value===value);
  const catalogCount = live.length || remembered?.count || 0;
  const stop=(e:React.SyntheticEvent)=>e.stopPropagation();
  return <div className="space-y-2" onMouseDown={stop} onPointerDown={stop} onKeyDown={stop}>
    {provider==='tensorart' && <TensorCatalogNotice />}
    <input aria-label="搜索当前供应商模型" type="search" value={query} onFocus={arm} onChange={e=>{arm();const v=e.target.value;setQuery(isCustomParametersJsonQuery(v)?'':v);}} placeholder={provider==='tensorart' ? '输入 Tensor 模型 ID 或模型链接查询' : '搜索模型名称或 ID'} className="w-full rounded-lg border border-[#2d303a] bg-[#121316] p-2 text-sm text-slate-200" />
    <select aria-label="当前供应商底模" title={selected?.label ? `${selected.label} · ${value}` : value || undefined} value={invalid ? '' : value || ''} onFocus={arm} onMouseDown={arm} onChange={e=>{onChange(e.target.value);noteUserModelSelection(provider,e.target.value);}} className="w-full rounded-lg border border-[#2d303a] bg-[#121316] p-2 text-sm text-slate-200">
      <option value="">{value ? '（保留当前选择）' : '请选择模型'}</option>
      {/* Always keep a selectable option for the current value so reload/catalog race never paints「未选择」over a filled model. */}
      {value && !invalid && !options.some(row=>row.value===value) && (
        <option value={value}>{selected?.label || `[当前] ${value}`}</option>
      )}
      <optgroup label={`${provider.toUpperCase()} · ${options.length} 个已加载模型`}>
        {options.map(row=><option key={row.value} value={row.value} title={`${row.label} · ${row.value}`}>{row.label}</option>)}
      </optgroup>
    </select>
    <SchemaReuseNote provider={provider} model={value} />
    <div className="flex items-center justify-between gap-2 text-xs text-slate-400" role="status">
      <span data-testid="provider-model-catalog-status">{loading ? '正在查询模型目录…' : catalogCount ? `目录已返回 ${catalogCount} 个模型` : error ? '查询失败' : value ? '已选底模' : provider==='tensorart' && !query ? '等待输入模型 ID（未请求上游）' : query ? '未找到匹配模型' : '当前目录页暂无底模；可切换分类或输入 ID'}</span>
      <button type="button" disabled={loading} onClick={()=>{beginTraceOperation(`刷新目录 ${provider}`);setArmed(true);setReload(x=>x+1);}} className="text-cyan-300 disabled:opacity-40">{provider==='tensorart' ? '查询 ID' : '刷新目录'}</button>
    </div>
    {hasMore && <button type="button" disabled={loading} onClick={loadMore} className="w-full rounded-lg border border-cyan-900 p-2 text-sm text-cyan-300 disabled:opacity-40">加载更多模型</button>}
    {error && <div role="alert" className="rounded-lg border border-rose-900/60 p-2 text-xs text-rose-200"><p>{error.split('\n')[0]}</p><details className="mt-2"><summary className="cursor-pointer">完整响应与错误堆栈</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all select-text">{error}</pre></details></div>}
    {invalid && <p role="alert" className="text-sm text-rose-300">请输入有效的 Tensor 模型 ID 或模型页面链接。</p>}
  </div>;
}

/** clean-1333 #7: re-selecting the same model reuses the earlier Schema result — say so, with its Beijing time. */
export function SchemaReuseNote({provider,model}:{provider:string;model:string}) {
  const [,tick]=React.useReducer((x:number)=>x+1,0);
  React.useEffect(()=>subscribeSchemaReuse(tick),[]);
  const reuse=schemaReuseFor(provider,model);
  if(!reuse)return null;
  return <p role="status" data-testid="schema-reuse-note" className={`text-[11px] leading-relaxed rounded border px-2 py-1 ${reuse.ok?'border-slate-600/60 text-slate-300':'border-amber-600/60 text-amber-200 bg-amber-950/30'}`}>{reuse.label} · 复用，未重新请求。要重试：点刷新，或换一个模型。</p>;
}
