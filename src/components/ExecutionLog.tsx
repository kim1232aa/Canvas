import React from 'react';
import {getExecutions,subscribeExecution} from '../services/executionTrace';
export function ExecutionLog(){
  const records=React.useSyncExternalStore(subscribeExecution,getExecutions);
  const [open,setOpen]=React.useState(false);
  const pending=records.filter(r=>r.state==='pending').length;
  return <div className="fixed bottom-4 left-4 z-[80] select-text">
    <button onClick={()=>setOpen(!open)} className="rounded-xl border border-slate-600 bg-[#161a24] px-4 py-2 text-sm text-slate-100 shadow-lg">执行记录 · {pending?`${pending} 个请求中`:records.length}</button>
    {open&&<section aria-label="执行记录" className="absolute bottom-12 left-0 w-[min(760px,92vw)] max-h-[75vh] overflow-auto rounded-2xl border border-slate-600 bg-[#111620] p-5 shadow-2xl text-sm text-slate-200">
      <div className="flex justify-between mb-3"><h2 className="font-semibold text-lg">请求与执行记录</h2><button onClick={()=>setOpen(false)}>关闭</button></div>
      <p className="text-slate-400 mb-4">逐次展示客户端请求、实际端点、参数转换和上游响应。凭证不显示。HTTP 200 只表示请求返回，是否出图以生成结果为准。</p>
      {!records.length&&<p>尚未发出请求。</p>}
      {records.map(r=><details key={r.id} open={r.state==='error'} className="border-t border-slate-700 py-3">
        <summary className="cursor-pointer break-all"><span className={r.state==='error'?'text-rose-300':r.state==='pending'?'text-amber-200':'text-cyan-200'}>{r.status===null?r.state==='pending'?'等待响应':'无 HTTP 响应':`HTTP ${r.status}`}</span> · {r.method} {r.route}</summary>
        <p className="mt-3 text-slate-400">{r.time} · 客户端请求</p><pre className="whitespace-pre-wrap break-all rounded bg-black/30 p-3 max-h-40 overflow-auto text-xs">{JSON.stringify(r.request,null,2)}</pre>
        <p className="mt-3 text-slate-400">完整响应与上游调用链</p><pre className="whitespace-pre-wrap break-all rounded bg-black/30 p-3 max-h-80 overflow-auto text-xs">{JSON.stringify(r.response,(key,value)=>typeof value==='string'&&value.startsWith('data:image/')?'[图片数据，请查看生成结果]':value,2)}</pre>
        {r.stack&&<details className="mt-3 text-rose-300"><summary className="cursor-pointer">查看完整异常堆栈</summary><pre className="whitespace-pre-wrap break-all max-h-64 overflow-auto text-xs mt-2">{r.stack}</pre></details>}
      </details>)}
    </section>}
  </div>;
}
