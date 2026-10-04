import {TENSOR_CATALOG_TAGS} from '../schemas/tensorCatalog';
import React from 'react';
import {fetchLiveModels} from '../services/api';
import {readCheckpointCatalog,mergeCheckpointOptions,isInvalidTensorModel,type CatalogOption} from '../utils/modelCatalog';

export function ProviderModelSelect({provider,value,onChange}:{provider:string;value:string;onChange:(value:string)=>void}) {
  const [query,setQuery]=React.useState('');
  const [tensorTag,setTensorTag]=React.useState('all');
  const [live,setLive]=React.useState<CatalogOption[]>([]);
  const [loading,setLoading]=React.useState(false);
  const [error,setError]=React.useState('');
  const [page,setPage]=React.useState(1);
  const [cursor,setCursor]=React.useState('');
  const [hasMore,setHasMore]=React.useState(false);
  const [reload,setReload]=React.useState(0);
  const request=React.useRef(0);
  React.useEffect(()=>{
    const id=++request.current;
    setLive([]);setError('');setPage(1);setCursor('');setHasMore(false);
    if (!provider) {setLoading(false);return;}
    setLoading(true);
    const timer=setTimeout(()=>{
      fetchLiveModels(provider,query,'Checkpoint','checkpoint','downloads','',1,50,'',provider==='tensorart'?tensorTag:'').then(data=>{
        if(id!==request.current)return;
        const result=readCheckpointCatalog(data,provider);
        setLive(result.options);setPage(result.page);setCursor(result.nextCursor);setHasMore(result.hasMore);
      }).catch(error=>{if(id===request.current)setError(String(error.message).split("\n")[0]);}).finally(()=>{if(id===request.current)setLoading(false);});
    },query ? 300 : 0);
    return ()=>{clearTimeout(timer);++request.current;};
  },[provider,query,reload,tensorTag]);
  const loadMore=async()=>{
    if(loading||!hasMore)return;
    const id=request.current;setLoading(true);setError('');
    try {
      const result=readCheckpointCatalog(await fetchLiveModels(provider,query,'Checkpoint','checkpoint','downloads',cursor,page+1,50,'',provider==='tensorart'?tensorTag:''),provider);
      if(id!==request.current)return;
      setLive(old=>[...old,...result.options]);setPage(page+1);setCursor(result.nextCursor);setHasMore(result.hasMore);
    }catch(error:any){if(id===request.current)setError(String(error.message).split("\n")[0]);}finally{if(id===request.current)setLoading(false);}
  };
  const all=mergeCheckpointOptions(provider,live);
  const options=query ? all.filter(row=>`${row.label} ${row.value}`.toLowerCase().includes(query.toLowerCase())) : all;
  const invalid=isInvalidTensorModel(provider,value);
  const selected=all.find(row=>row.value===value);
  const stop=(e:React.SyntheticEvent)=>e.stopPropagation();
  return <div className="space-y-2" onMouseDown={stop} onPointerDown={stop} onKeyDown={stop}>
    {provider==='tensorart' && <select aria-label="Tensor 目录分类" value={tensorTag} onChange={e=>setTensorTag(e.target.value)} className="w-full rounded-lg border border-[#2d303a] bg-[#121316] p-2 text-sm text-slate-200">{TENSOR_CATALOG_TAGS.map(([tag,label])=><option key={tag} value={tag}>{label}</option>)}</select>}
    <input aria-label="搜索当前供应商模型" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索模型名称或 ID" className="w-full rounded-lg border border-[#2d303a] bg-[#121316] p-2 text-sm text-slate-200" />
    <select aria-label="当前供应商底模" value={value || ''} onChange={e=>onChange(e.target.value)} className="w-full rounded-lg border border-[#2d303a] bg-[#121316] p-2 text-sm text-slate-200">
      <option value="">请选择模型</option>
      {value && !options.some(row=>row.value===value) && <option value={value} disabled={invalid}>{invalid ? '[旧工具，不能作为底模] ' : selected ? '' : '[自定义模型 ID] '}{selected?.label || value}</option>}
      <optgroup label={`${provider.toUpperCase()} · ${options.length} 个已加载模型`}>
        {options.map(row=><option key={row.value} value={row.value}>{row.label}</option>)}
      </optgroup>
    </select>
    <div className="flex items-center justify-between gap-2 text-xs text-slate-400" role="status">
      <span>{loading ? '正在查询模型目录…' : live.length ? `目录已返回 ${live.length} 个模型` : error ? '目录查询失败' : query ? '未找到匹配模型' : '当前目录页暂无底模；可切换分类或输入 ID'}</span>
      <button type="button" disabled={loading} onClick={()=>setReload(x=>x+1)} className="text-cyan-300 disabled:opacity-40">刷新目录</button>
    </div>
    {hasMore && <button type="button" disabled={loading} onClick={loadMore} className="w-full rounded-lg border border-cyan-900 p-2 text-sm text-cyan-300 disabled:opacity-40">加载更多模型</button>}
    {error && <p role="alert" className="text-sm text-amber-300">目录加载失败：{error}。请刷新重试或核对后输入模型 ID。</p>}
    {invalid && <p role="alert" className="text-sm text-rose-300">旧 OpenWorks 工具不能作为底模，也不能挂载模型 LoRA。请重新选择真实 Tensor 模型。</p>}
  </div>;
}
