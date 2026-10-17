/**
 * ModelScope LoRA list per region (config-driven). Each region lists only from its own site — never mixes .cn into .ai.
 * Request shape verified live 2026-10-16 11:18 CST: PUT https://www.modelscope.ai/api/v1/dolphin/models
 * {PageSize, PageNumber, SortBy, Target, Criterion:[{category:'tags',predicate:'contains',values:['lora']}], Name} → Data.Model.{Models,TotalCount}
 * (evidence: /workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-modelscope-ai-lora-pick-1118/dolphin.txt).
 */
export interface ModelScopeRegionConfig { site: string; providerLabel: string; loraListEndpoint: string | null }

export const MODELSCOPE_REGIONS: Record<'modelscope_ai', ModelScopeRegionConfig> = {
  modelscope_ai: { site: 'https://www.modelscope.ai', providerLabel: 'ModelScope AI', loraListEndpoint: 'https://www.modelscope.ai/api/v1/dolphin/models' },
};

export function buildLoraListRequest(cfg: ModelScopeRegionConfig, opts: { name: string; page: number; pageSize: number; sort?: string }) {
  if (!cfg.loraListEndpoint) throw new Error(`${cfg.providerLabel} 未配置 LoRA 列表接口`);
  const SortBy = /like/i.test(opts.sort || '') ? 'StarsCount' : /new/i.test(opts.sort || '') ? 'GmtModified' : 'Default';
  return {
    url: cfg.loraListEndpoint,
    init: {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ PageSize: opts.pageSize, PageNumber: opts.page, SortBy, Target: '', Criterion: [{ category: 'tags', predicate: 'contains', values: ['lora'], sub_values: [] }], Name: opts.name }),
    },
  };
}

/** Maps the region's own response. Throws (verbatim) when the shape is not the verified one — no guessing. */
export function parseLoraListResponse(cfg: ModelScopeRegionConfig, data: any): { items: any[]; total: number } {
  const model = data?.Data?.Model;
  if (data?.Code !== 200 || !model || !Array.isArray(model.Models)) throw new Error(`${cfg.providerLabel} LoRA 列表响应格式不符：${JSON.stringify(data).slice(0, 500)}`);
  const items = model.Models.map((m: any) => {
    const id = `${m.Path}/${m.Name}`;
    const base = Array.isArray(m.BaseModel) ? m.BaseModel.filter((b: any) => typeof b === 'string' && b && b !== 'undefined') : [];
    return {
      id, name: m.ChineseName || m.Name, provider: 'modelscope_ai', providerLabel: cfg.providerLabel, category: 'lora', type: 'LORA',
      baseModel: base[0] ?? null, downloads: m.Downloads || 0, likes: m.Stars || 0, rating: 0,
      imageUrl: Array.isArray(m.CoverImages) && m.CoverImages[0] ? m.CoverImages[0] : '',
      externalUrl: `${cfg.site}/models/${id}`, tags: Array.isArray(m.Tags) ? m.Tags : [], trainedWords: [], sourceSite: cfg.site,
    };
  });
  return { items, total: Number(model.TotalCount) || items.length };
}
