import React from 'react';
import {fetchLiveModelsShared, isCustomParametersJsonQuery, sanitizeCatalogQuery} from '../services/api';
import {noteUserModelSelection, schemaReuseFor, subscribeSchemaReuse} from '../services/userModelSelection';
import {beginTraceOperation} from '../services/executionTrace';
import {readCheckpointCatalog,mergeCheckpointOptions,isInvalidTensorModel,type CatalogOption} from '../utils/modelCatalog';

export function ProviderModelSelect({provider,value,onChange}:{provider:string;value:string;onChange:(value:string)=>void}) {
  const [query,setQuery]=React.useState('');
  const [live,setLive]=React.useState<CatalogOption[]>([]);
  const [loading,setLoading]=React.useState(false);
  const [loadingScopeKey,setLoadingScopeKey]=React.useState('');
  const [error,setError]=React.useState('');
  const [errorScopeKey,setErrorScopeKey]=React.useState('');
  const [page,setPage]=React.useState(1);
  const [cursor,setCursor]=React.useState('');
  const [hasMore,setHasMore]=React.useState(false);
  const [reload,setReload]=React.useState(0);
  // clean-0903: no catalog GET on mount/hydrate. Armed by a user action: focusing/opening the picker, typing, 刷新目录, changing provider.
  const [armed,setArmed]=React.useState(false);
  const scopeIdentity=React.useRef({provider,query,reload,version:0});
  if(scopeIdentity.current.provider!==provider||scopeIdentity.current.query!==query||scopeIdentity.current.reload!==reload){
    scopeIdentity.current={provider,query,reload,version:scopeIdentity.current.version+1};
  }
  const liveScopeKey=JSON.stringify([provider,query,reload,scopeIdentity.current.version]);
  const [settledScopeKey,setSettledScopeKey]=React.useState('');
  const currentLive=settledScopeKey===liveScopeKey?live:[];
  const hasCurrentResult=settledScopeKey===liveScopeKey;
  const currentHasMore=hasCurrentResult&&hasMore;
  const currentLoading=loading&&loadingScopeKey===liveScopeKey;
  const currentError=errorScopeKey===liveScopeKey?error:'';
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
    setLoading(true);setLoadingScopeKey(liveScopeKey);
    const timer=setTimeout(()=>{
      const force=reload!==lastReload.current;lastReload.current=reload;
      fetchLiveModelsShared(force,provider,sanitizeCatalogQuery(query),'Checkpoint','checkpoint','downloads','',1,50,'','').then(data=>{
        if(id!==request.current)return;
        const result=readCheckpointCatalog(data,provider);
        setLive(result.options);setPage(result.page);setCursor(result.nextCursor);setHasMore(result.hasMore);setSettledScopeKey(liveScopeKey);
      }).catch(error=>{if(id===request.current){setError(`${error.message}\n${error.stack || ''}`);setErrorScopeKey(liveScopeKey);}}).finally(()=>{if(id===request.current)setLoading(false);});
    },query ? 300 : 0);
    return ()=>{clearTimeout(timer);++request.current;};
  },[provider,query,reload,armed]);
  const loadMore=async()=>{
    if(currentLoading||!currentHasMore)return;
    const id=request.current;setLoading(true);setLoadingScopeKey(liveScopeKey);setError('');setErrorScopeKey('');
    try {
      const result=readCheckpointCatalog(await fetchLiveModelsShared(false,provider,sanitizeCatalogQuery(query),'Checkpoint','checkpoint','downloads',cursor,page+1,50,'',''),provider);
      if(id!==request.current)return;
      setLive(old=>[...old,...result.options]);setPage(page+1);setCursor(result.nextCursor);setHasMore(result.hasMore);setSettledScopeKey(liveScopeKey);
    }catch(error:any){if(id===request.current){setError(`${error.message}\n${error.stack || ''}`);setErrorScopeKey(liveScopeKey);}}finally{if(id===request.current)setLoading(false);}
  };
  const all=mergeCheckpointOptions(provider,currentLive);
  const options=query && provider!=='tensorart' ? all.filter(row=>`${row.label} ${row.value}`.toLowerCase().includes(query.toLowerCase())) : all;
  const invalid=isInvalidTensorModel(provider,value);
  const selected=all.find(row=>row.value===value);
  const catalogCount = hasCurrentResult ? currentLive.length : 0;
  const stop=(e:React.SyntheticEvent)=>e.stopPropagation();
  return <div className="space-y-2" onMouseDown={stop} onPointerDown={stop} onKeyDown={stop}>
    {provider==='krea' && !value && <p role="status" data-testid="krea-live-model-selection-note" className="rounded border border-cyan-900/60 bg-cyan-950/20 p-2 text-xs text-cyan-200">请从实时 Krea 官方模型目录选择生成端点；此模板未预选其他服务商的模型标识。</p>}
    <input aria-label="搜索当前供应商模型" type="search" value={query} onFocus={arm} onChange={e=>{arm();const v=e.target.value;setQuery(isCustomParametersJsonQuery(v)?'':v);}} placeholder={provider==='tensorart' ? '输入 Tensor 模型 ID 或模型链接查询' : '搜索模型名称或 ID'} className="w-full rounded-lg border border-[#2d303a] bg-[#121316] p-2 text-sm text-slate-200" />
    <select aria-label="当前供应商底模" title={selected?.label ? `${selected.label} · ${value}` : value || undefined} value={invalid ? '' : value || ''} onFocus={arm} onMouseDown={arm} onChange={e=>{onChange(e.target.value);noteUserModelSelection(provider,e.target.value);}} className="w-full rounded-lg border border-[#2d303a] bg-[#121316] p-2 text-sm text-slate-200">
      <option value="">{value ? '（保留当前选择）' : '请选择模型'}</option>
      {/* Always keep a selectable option for the current value so reload/catalog race never paints「未选择」over a filled model. */}
      {value && !invalid && !options.some(row=>row.value===value) && (
        <option value={value}>{selected?.label || `[当前] ${value}`}</option>
      )}
      {hasCurrentResult && <optgroup label={`${provider.toUpperCase()} · ${options.length} 个已加载模型`}>
        {options.map(row=><option key={row.value} value={row.value} title={`${row.label} · ${row.value}`}>{row.label}</option>)}
      </optgroup>}
    </select>
    <div className="flex items-center justify-between gap-2 text-xs text-slate-400" role="status">
      <span data-testid="provider-model-catalog-status">{currentLoading ? '正在查询模型目录…' : currentError ? '查询失败' : catalogCount ? `目录已返回 ${catalogCount} 个模型` : value ? '已选底模' : provider==='tensorart' && !query ? '等待输入模型 ID（未请求上游）' : query ? '未找到匹配模型' : '当前目录页暂无底模；可切换分类或输入 ID'}</span>
      <button type="button" disabled={currentLoading} onClick={()=>{beginTraceOperation(`刷新目录 ${provider}`);setArmed(true);setReload(x=>x+1);}} className="text-cyan-300 disabled:opacity-40">{provider==='tensorart' ? '查询 ID' : '刷新目录'}</button>
    </div>
    {currentHasMore && <button type="button" disabled={currentLoading} onClick={loadMore} className="w-full rounded-lg border border-cyan-900 p-2 text-sm text-cyan-300 disabled:opacity-40">加载更多模型</button>}
    {currentError && <div role="alert" className="rounded-lg border border-rose-900/60 p-2 text-xs text-rose-200"><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all select-text">{currentError}</pre></div>}
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
