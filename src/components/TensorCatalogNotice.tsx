export function TensorCatalogNotice() {
  return <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 text-xs leading-relaxed text-slate-300">
    <p>TAMS 官方未提供模型 / LoRA 列表 API。请从官方模型库复制资源 ID，在这里查询并选用。</p>
    <div className="mt-2 flex flex-wrap gap-3">
      <a href="https://tensor.art/models/" target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline">打开官方模型库 ↗</a>
      <a href="https://tams-docs.tensor.art/docs/api/guide/integration-faq/#model-issues" target="_blank" rel="noopener noreferrer" className="text-slate-400 underline">官方说明 ↗</a>
    </div>
  </div>;
}
