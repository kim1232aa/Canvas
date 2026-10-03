import {TENSOR_CATALOG_TAGS} from '../schemas/tensorCatalog';
import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Download,
  Heart,
  Star,
  Sparkles,
  Plus,
  Check,
  ExternalLink,
  Loader2,
  Cpu,
  Layers,
  Wand2,
  Zap,
  Copy,
  Info,
  Sliders,
  Filter,
  Video,
  Bookmark,
  BookmarkCheck,
  Play,
  ArrowRight,
  ShieldCheck,
  ArrowUpDown,
  Flame,
  RefreshCw,
  ArrowDown,
} from 'lucide-react';
import { fetchLiveModels, fetchHuggingFaceModelInfo, fetchTensorArtModelInfo } from '../services/api';

interface ModelHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectModel: (modelId: string, modelName: string, providerHint?: string, extraData?: any) => void;
  onAddModelNode?: (modelId: string, modelName: string, providerHint?: string, extraData?: any) => void;
  onAddLora?: (lora: {
    name: string;
    provider?: string;
    civitaiId?: string;
    modelStrength: number;
    clipStrength: number;
    triggerWords?: string;
    baseModel?: string;
  }) => void;
  onAddLoraNode?: (loraName: string, triggerWords?: string, baseModel?: string, resource?: {provider:string;civitaiId?:string}) => void;
  onSelectLoRAWithBaseModel?: (lora: {
    name: string;
    provider?: string;
    civitaiId?: string;
    triggerWords?: string;
    baseModel?: string;
  }) => void;
  onQuickTestModel?: (modelId: string, modelName: string, providerHint?: string) => void;
  onOpenDedicatedLoRAHub?: () => void;
  initialCategory?: CategoryFilter;
  initialProvider?: string;
  isSpatialMode?: boolean;
  currentCheckpoint?: string;
}

export type CategoryFilter = 'all' | 'checkpoint' | 'lora' | 'video' | 'edit';
export type ProviderTab = 'all' | 'civitai' | 'fal' | 'tensorart' | 'modelscope' | 'modelscope_ai' | 'huggingface' | 'nanogpt' | 'gemini';
export type ModelSortOption = 'downloads' | 'rating' | 'likes' | 'name_asc' | 'name_desc' | 'bookmarked';

const ARCHITECTURE_TAGS = [
  { id: 'all', label: '全部架构' },
  { id: 'flux', label: 'FLUX.1' },
  { id: 'sdxl', label: 'SDXL 1.0' },
  { id: 'wan', label: 'Wan 2.1 (视频)' },
  { id: 'sd15', label: 'SD 1.5' },
  { id: 'pony', label: 'Pony XL' },
  { id: 'illustrious', label: 'Illustrious' },
  { id: 'qwen', label: 'Qwen-Image' },
  { id: 'z-image', label: 'Z-Image' },
  {id:'krea',label:'Krea'}, {id:'chroma',label:'Chroma'}, {id:'hunyuan',label:'Hunyuan'}, {id:'kolors',label:'Kolors'}, {id:'pixart',label:'PixArt'}, {id:'auraflow',label:'AuraFlow'}, {id:'anima',label:'Anima'}, {id:'ernie',label:'ERNIE'}, {id:'hidream',label:'HiDream'},
];

export const ModelHubModal: React.FC<ModelHubModalProps> = ({
  isOpen,
  onClose,
  onSelectModel,
  onAddModelNode,
  onAddLora,
  onAddLoraNode,
  onSelectLoRAWithBaseModel,
  onQuickTestModel,
  onOpenDedicatedLoRAHub,
  initialCategory = 'all',
  initialProvider,
  isSpatialMode = false,
}) => {
  const [activeProvider, setActiveProvider] = useState<ProviderTab>('all');
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>(initialCategory);
  const [sortOption, setSortOption] = useState<ModelSortOption>('downloads');
  const [selectedArch, setSelectedArch] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [tensorTag,setTensorTag]=useState('all');
  const requestVersion = useRef(0);
  const morePending = useRef(false);
  const [customId, setCustomId] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [hfCursor, setHfCursor] = useState<string | null>(null);
  const [civitaiCursor, setCivitaiCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modelsData, setModelsData] = useState<Record<string, any[]>>({});
  const [providerErrors, setProviderErrors] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem('comfycanvas_model_bookmarks');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {};
  });

  const toggleBookmark = (id: string) => {
    setBookmarks((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem('comfycanvas_model_bookmarks', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  const loadModels = async (
    prov = activeProvider,
    cat = activeCategory,
    searchTerm = query,
    sort = sortOption,
    arch = selectedArch,
    isLoadMore = false,
    catalogTag = tensorTag
  ) => {
    if (isLoadMore && morePending.current) return;
    const version = isLoadMore ? requestVersion.current : ++requestVersion.current;
    morePending.current = isLoadMore;
    setError(null);
    if (isLoadMore) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setLoadingMore(false);
      setError(null);
      setModelsData({});
      setProviderErrors({});
      setHfCursor(null);
      setCivitaiCursor(null);
      setPage(1);
      setHasMore(true);
    }
    try {
      const typeParam = cat === 'lora' ? 'LORA' : 'Checkpoint';
      const liveCursor = isLoadMore ? (hfCursor || civitaiCursor || '') : '';
      const livePage = isLoadMore ? page + 1 : 1;
      const archQuery = arch === 'all' ? '' : arch;

      const data = await fetchLiveModels(
        prov,
        searchTerm,
        typeParam,
        cat,
        sort,
        liveCursor,
        livePage,
        40,
        archQuery,
        prov === 'tensorart' ? catalogTag : ''
      );

      if (version !== requestVersion.current) return;
      const errors: Record<string, string> = {};
      const validData: Record<string, any[]> = {};

      const pag = data._pagination || {};
      if (pag.huggingface?.nextCursor) {
        setHfCursor(pag.huggingface.nextCursor);
      }
      if (pag.civitai?.nextCursor) {
        setCivitaiCursor(pag.civitai.nextCursor);
      }
      if (pag.modelscope?.page) {
        setPage(pag.modelscope.page);
      } else if (pag.tensorart?.page) {
        setPage(pag.tensorart.page);
      } else if (isLoadMore) {
        setPage(livePage);
      }

      let anyHasMore = false;
      Object.values(pag).forEach((p: any) => {
        if (p?.hasMore === true) anyHasMore = true;
      });

      Object.entries(data).forEach(([key, val]) => {
        if (key === '_pagination') return;
        if (val && typeof val === 'object' && !Array.isArray(val) && (val as any).error) {
          errors[key] = (val as any).error + ((val as any).details ? `: ${(val as any).details}` : '');
        } else if (Array.isArray(val)) {
          validData[key] = val;
          // A full directory page does not establish that another page exists.
        }
      });

      if (isLoadMore) {
        setModelsData((prev) => {
          const merged = { ...prev };
          Object.entries(validData).forEach(([k, list]) => {
            const existing = merged[k] || [];
            const existingIds = new Set(existing.map((x) => x.id));
            const newItems = list.filter((x) => !existingIds.has(x.id));
            merged[k] = [...existing, ...newItems];
          });
          return merged;
        });
      } else {
        setModelsData(validData);
      }

      setProviderErrors((prev) => {
        if (!isLoadMore) return errors;
        const next = { ...prev, ...errors };
        Object.keys(validData).forEach((key) => { delete next[key]; });
        return next;
      });
      setHasMore(prov !== 'all' && anyHasMore);

      if (prov !== 'all' && errors[prov]) {
        setError(errors[prov]);
      }
    } catch (e: any) {
      if (version !== requestVersion.current) return;
      setError(e.message || '模型拉取失败');
    } finally {
      if (version === requestVersion.current) {
        morePending.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  const handleCategoryChange = (newCat: CategoryFilter) => {
    setActiveCategory(newCat);
    loadModels(activeProvider, newCat, query, sortOption, selectedArch, false);
  };

  const handleProviderChange = (newProv: ProviderTab) => {
    setActiveProvider(newProv);
    setCustomId('');
    setImportError(null);
    loadModels(newProv, activeCategory, query, sortOption, selectedArch, false);
  };

  const handleSortChange = (newSort: ModelSortOption) => {
    setSortOption(newSort);
    loadModels(activeProvider, activeCategory, query, newSort, selectedArch, false);
  };

  useEffect(() => {
    if (isOpen) {
      const targetCat = initialCategory || 'all';
      const targetProvider = ['civitai','fal','tensorart','modelscope','modelscope_ai','huggingface','nanogpt','gemini'].includes(initialProvider || '') ? initialProvider as ProviderTab : activeProvider;
      setActiveProvider(targetProvider);
      setActiveCategory(targetCat);
      loadModels(targetProvider, targetCat, query, sortOption, selectedArch, false);
    }
    return () => { requestVersion.current += 1; };
  }, [isOpen, initialCategory, initialProvider]);

  if (!isOpen) return null;

  // Flatten or select current provider models
  let displayList: any[] = [];
  if (activeProvider === 'all') {
    Object.entries(modelsData).forEach(([provKey, list]) => {
      if (Array.isArray(list)) {
        displayList.push(...list.map((item) => ({ ...item, _sourceProvider: provKey })));
      }
    });
  } else {
    displayList = (modelsData[activeProvider] || []).map((item) => ({
      ...item,
      _sourceProvider: activeProvider,
    }));
  }

  // Filter by category
  if (activeCategory !== 'all') {
    displayList = displayList.filter((m) => {
      const cat = (m.category || m.type || '').toLowerCase();
      const idLower = (m.id || '').toLowerCase();
      const nameLower = (m.name || '').toLowerCase();

      if (activeCategory === 'lora') {
        return cat.includes('lora') || (m.tags && m.tags.includes('lora')) || idLower.includes('lora') || nameLower.includes('lora') || m.type === 'LORA';
      }
      if (activeCategory === 'video') {
        return (
          cat.includes('video') ||
          (m.tags && m.tags.includes('video')) ||
          idLower.includes('video') ||
          idLower.includes('wan') ||
          idLower.includes('kling') ||
          idLower.includes('ltx') ||
          idLower.includes('minimax') ||
          idLower.includes('hailuo') ||
          idLower.includes('cogvideo') ||
          idLower.includes('hunyuan') ||
          nameLower.includes('视频') ||
          nameLower.includes('video')
        );
      }
      if (activeCategory === 'checkpoint') {
        return (
          (cat.includes('checkpoint') || cat.includes('base') || m.type === 'Checkpoint') &&
          !cat.includes('video') &&
          !idLower.includes('video') &&
          !idLower.includes('wan2.1-t2v') &&
          !cat.includes('lora') &&
          !idLower.includes('lora')
        );
      }
      if (activeCategory === 'edit') {
        return cat.includes('edit') || cat.includes('controlnet') || cat.includes('inpaint') || cat.includes('tools');
      }
      return true;
    });
  }

  // Sort displayList
  displayList.sort((a, b) => {
    if (sortOption === 'bookmarked') {
      const aBm = Boolean(bookmarks[a.id || a.name]);
      const bBm = Boolean(bookmarks[b.id || b.name]);
      if (aBm !== bBm) return bBm ? 1 : -1;
      return (b.downloads || 0) - (a.downloads || 0);
    }
    if (sortOption === 'downloads') {
      return (b.downloads || 0) - (a.downloads || 0);
    }
    if (sortOption === 'rating') {
      return (b.rating || 0) - (a.rating || 0) || (b.downloads || 0) - (a.downloads || 0);
    }
    if (sortOption === 'likes') {
      return (b.likes || 0) - (a.likes || 0) || (b.downloads || 0) - (a.downloads || 0);
    }
    if (sortOption === 'name_asc') {
      return (a.name || a.id || '').localeCompare(b.name || b.id || '');
    }
    if (sortOption === 'name_desc') {
      return (b.name || b.id || '').localeCompare(a.name || a.id || '');
    }
    return 0;
  });

  const handleCopyText = async (key: string, text: string) => {
    try { await navigator.clipboard.writeText(text); } catch { alert("复制失败，请检查剪贴板权限"); return; }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div role="dialog" aria-modal="true" aria-labelledby="model-hub-title" className="studio-readable model-hub bg-[#171820] border border-[#2b2d39] rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-xs">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#262834] bg-[#121318] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-cyan-600 via-indigo-600 to-purple-600 text-white font-bold shadow-lg shadow-cyan-500/20 shrink-0">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 id="model-hub-title" className="text-base font-bold text-white flex items-center gap-2">
                模型与 LoRA 目录
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  资源目录
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                选择服务商、核对资源 ID，再应用到当前工作流。在线能力以所选端点为准。
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-[#252731] transition-colors text-sm"
              title="关闭"
              aria-label="关闭模型目录"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Category Mode Switcher (Base Model Hub vs LoRA Hub vs Video Models vs Edit) */}
        <div className="px-6 py-2.5 bg-[#14151b] border-b border-[#22242f] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-slate-400 font-medium text-[11px] flex items-center gap-1 mr-1">
              <Filter className="w-3.5 h-3.5 text-cyan-400" />
              资源类型
            </span>
            {[
              { id: 'all', label: '全部模型', icon: Sparkles },
              { id: 'checkpoint', label: '基础模型', icon: Cpu },
              { id: 'video', label: '视频模型', icon: Video },
              { id: 'lora', label: 'LoRA', icon: Layers },
              { id: 'edit', label: '编辑与控制', icon: Wand2 },
            ].map((cat) => {
              const isSelected = activeCategory === cat.id;
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  onClick={() => handleCategoryChange(cat.id as any)}
                  className={`px-3 py-1.5 rounded-xl font-medium transition-all flex items-center gap-1.5 shrink-0 ${
                    isSelected
                      ? 'bg-gradient-to-r from-cyan-600/30 to-indigo-600/30 text-cyan-200 border border-cyan-500/50 shadow-sm'
                      : 'bg-[#1b1c24] text-slate-400 hover:text-slate-200 border border-[#2b2d38]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>

          <div className="text-[11px] text-slate-400 flex items-center gap-1 font-mono shrink-0">
            <span>找到</span>
            <span className="text-cyan-400 font-bold">{displayList.length}</span>
            <span>项目录资源</span>
          </div>
        </div>

        {/* Provider Tabs */}
        <div className="px-6 pt-3 pb-1 bg-[#111216] border-b border-[#22242f] flex items-center gap-2 overflow-x-auto shrink-0 min-h-[44px]">
          {[
            { id: 'all', name: '全部服务商' },
            { id: 'civitai', name: 'Civitai' },
            { id: 'huggingface', name: 'Hugging Face' },
            { id: 'modelscope', name: '魔搭 CN' },
            { id: 'modelscope_ai', name: '魔搭 AI' },
            { id: 'fal', name: 'Fal.ai' },
            { id: 'nanogpt', name: 'NanoGPT' },
            { id: 'tensorart', name: 'Tensor.Art / 吐司' },
            { id: 'gemini', name: 'Google Gemini' },
          ].map((tab) => {
            const isActive = activeProvider === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleProviderChange(tab.id as any)}
                className={`pb-2.5 px-3 font-semibold transition-all relative whitespace-nowrap text-xs shrink-0 ${
                  isActive ? 'text-cyan-400 font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>{tab.name}</span>
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-cyan-400 to-indigo-500" />
                )}
              </button>
            );
          })}
        </div>

        {/* Architecture Family Filter Bar */}
        <div className="px-6 py-2 bg-[#121319] border-b border-[#20222d] flex items-center gap-2 overflow-x-auto shrink-0">
          <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1 shrink-0 mr-1">
            <Filter className="w-3.5 h-3.5 text-cyan-400" />
            底模架构筛选:
          </span>
          {ARCHITECTURE_TAGS.map((tag) => {
            const isSelected = selectedArch === tag.id;
            return (
              <button
                key={tag.id}
                onClick={() => {
                  setSelectedArch(tag.id);
                  loadModels(activeProvider, activeCategory, query, sortOption, tag.id, false);
                }}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all shrink-0 ${
                  isSelected
                    ? 'bg-cyan-600/30 text-cyan-200 border border-cyan-500/60 shadow-sm'
                    : 'bg-[#1a1b24] text-slate-400 hover:text-slate-200 border border-[#272935]'
                }`}
              >
                {tag.label}
              </button>
            );
          })}
        </div>

        {/* Dedicated LoRA Hub Link Banner when on LoRA category */}
        {activeCategory === 'lora' && onOpenDedicatedLoRAHub && (
          <div className="mx-6 mt-3 px-4 py-2.5 rounded-xl bg-purple-950/40 border border-purple-500/40 flex items-center justify-between gap-3 text-purple-200 text-xs shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
              <span>浏览 LoRA 资源；在线加载能力由所选模型和端点决定。</span>
            </div>
            <button
              onClick={onOpenDedicatedLoRAHub}
              className="px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs whitespace-nowrap shadow-sm cursor-pointer"
            >
              打开专用 LoRA 枢纽
            </button>
          </div>
        )}

        {/* Search & Actions Bar */}
        <div className="p-4 bg-[#181922] border-b border-[#262833] flex flex-col md:flex-row gap-3 items-center justify-between shrink-0">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadModels(activeProvider, activeCategory, query, sortOption)}
              placeholder="输入关键词实时检索模型 (例如: anime, flux, cyberpunk, realistic, portrait, wan)..."
              className="w-full bg-[#101115] border border-[#2b2d38] focus:border-cyan-500 rounded-xl pl-10 pr-4 py-2 text-white placeholder-slate-500 outline-none font-mono text-[11px]"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
            <div className="flex items-center gap-1.5 bg-[#101115] border border-[#2b2d38] rounded-xl px-3 py-1.5 text-[11px]">
              <ArrowUpDown className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-slate-400 font-medium">排序:</span>
              <select
                value={sortOption}
                onChange={(e) => {
                  const newSort = e.target.value as ModelSortOption;
                  setSortOption(newSort);
                  loadModels(activeProvider, activeCategory, query, newSort);
                }}
                className="bg-transparent text-cyan-300 font-semibold outline-none cursor-pointer pr-1"
              >
                <option value="downloads" className="bg-[#181922] text-white">🔥 最多下载 (Downloads)</option>
                <option value="rating" className="bg-[#181922] text-white">⭐ 最高评分 (Highest Rated)</option>
                <option value="likes" className="bg-[#181922] text-white">❤️ 最多点赞 (Most Liked)</option>
                <option value="name_asc" className="bg-[#181922] text-white">🔤 名称排序 (A → Z)</option>
                <option value="name_desc" className="bg-[#181922] text-white">🔤 逆序排列 (Z → A)</option>
                <option value="bookmarked" className="bg-[#181922] text-white">📌 我的收藏置顶 (Bookmarked)</option>
              </select>
            </div>

            <button
              onClick={() => loadModels(activeProvider, activeCategory, query, sortOption)}
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold flex items-center gap-2 shadow-md shadow-cyan-600/25 disabled:opacity-50 transition-all shrink-0 text-[11px]"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              <span>实时检索</span>
            </button>
          </div>
        </div>

        {/* Universal Dynamic Custom Model / Endpoint Import Bar */}
        <div className="px-6 py-2.5 bg-[#171424] border-b border-purple-900/40 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-purple-300">
            <Zap className="w-4 h-4 text-purple-400 shrink-0" />
            <span>
              <strong>按 ID 选用：</strong>
              {activeProvider === 'tensorart'
                ? '输入 Tensor.Art / 吐司 模型 ID 或链接 (如 958694016000505570, 672390779613802167)'
                : activeProvider === 'huggingface'
                ? '输入任意 Hugging Face 模型 ID (如 stabilityai/stable-diffusion-xl-base-1.0)'
                : activeProvider === 'modelscope' || activeProvider === 'modelscope_ai'
                ? '输入任意 ModelScope 模型 ID (如 damo/wan2.1-t2i)'
                : activeProvider === 'fal'
                ? '输入任意 Fal.ai 官方端点 (如 fal-ai/flux/dev 或 fal-ai/lora)'
                : activeProvider === 'nanogpt'
                ? '输入任意 NanoGPT Model ID (如 qwen-image-2.1/text-to-image, flux-pro, birefnet/v2)'
                : activeProvider === 'gemini'
                ? '输入 Gemini 模型 ID (如 gemini-2.5-flash-image)'
                : activeProvider === 'all' ? '请先在上方选择服务商，避免将 ID 发往错误平台。' : '输入 Civitai 模型 ID / AIR URN'}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <input
              type="text"
              placeholder={
                activeProvider === 'tensorart'
                  ? '输入 Tensor.Art / 吐司 模型 ID (如 672390779613802167)...'
                  : activeProvider === 'huggingface'
                  ? '输入 HF Repo ID (如 user/model-name)...'
                  : activeProvider === 'modelscope' || activeProvider === 'modelscope_ai'
                  ? '输入 ModelScope ID (如 damo/model-id)...'
                  : activeProvider === 'fal'
                  ? '输入 Fal.ai Endpoint (如 fal-ai/...)...'
                  : activeProvider === 'nanogpt'
                  ? '输入 NanoGPT Model ID (如 qwen-image-2.1/text-to-image)...'
                  : activeProvider === 'gemini' ? '输入 Gemini 模型 ID...'
                  : activeProvider === 'all' ? '请先选择服务商'
                  : '输入 Civitai ID (如 133005) 或 URN...'
              }
              id="custom-tensor-template-input-modelhub"
              aria-label="自定义模型或 LoRA ID"
              value={customId}
              disabled={activeProvider === 'all' || importing}
              onChange={(event) => { setCustomId(event.target.value); setImportError(null); }}
              className="flex-1 bg-[#100d1c] border border-purple-800/50 rounded-lg px-3 py-1.5 text-xs text-purple-100 placeholder-purple-400/50 outline-none focus:border-purple-400"
            />
            <button
              disabled={importing || activeProvider === 'all' || !customId.trim()}
              onClick={async () => {
                if (importing || activeProvider === 'all' || !customId.trim()) return;
                const version = requestVersion.current;
                setImporting(true);
                setImportError(null);
                try {
                  const rawId = customId.trim();
                  let info: any = { id: rawId, name: rawId };
                  if (activeProvider === 'huggingface') info = await fetchHuggingFaceModelInfo(rawId);
                  if (activeProvider === 'tensorart') info = await fetchTensorArtModelInfo(rawId);
                  if (version !== requestVersion.current) return;
                  if (!info?.id) throw new Error('查询未返回模型 ID，请核对资源 ID 后重试。');
                  const isLora = activeCategory === 'lora' || String(info.category || info.type || '').toLowerCase() === 'lora';
                  if (isLora) {
                    const words = info.triggerWords || info.trainedWords || [];
                    const lora = { name: String(info.id), provider: activeProvider,
                      civitaiId: activeProvider === 'civitai' ? String(info.id) : undefined,
                      triggerWords: Array.isArray(words) ? words.join(', ') : String(words),
                      baseModel: info.baseModel || undefined };
                    if (onSelectLoRAWithBaseModel) onSelectLoRAWithBaseModel(lora);
                    else if (onAddLora) onAddLora({ ...lora, modelStrength: 0.8, clipStrength: 0.8 });
                    else throw new Error('当前画布没有可挂载 LoRA 的入口，请先选择底模。');
                  } else {
                    onSelectModel(String(info.id), info.name || String(info.id), activeProvider, info);
                  }
                  onClose();
                } catch (err) {
                  if (version === requestVersion.current) setImportError(err instanceof Error ? err.message : String(err));
                } finally {
                  setImporting(false);
                }
              }}
              className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs whitespace-nowrap shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              {importing ? '正在查询…' : activeProvider === 'all' ? '先选择服务商' : '选用此 ID'}
            </button>
          </div>
        </div>

        {importError && <div role="alert" className="px-6 py-3 bg-rose-950/40 text-rose-200 border-b border-rose-800/40 break-words">ID 查询 / 选用失败：{importError}</div>}

        {/* Category Description Banner */}
        <div className="px-6 py-2 bg-gradient-to-r from-cyan-950/30 via-purple-950/30 to-indigo-950/30 border-b border-cyan-900/20 flex items-center justify-between text-[11px] text-cyan-300">
          <div className="flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>
              {activeCategory === 'checkpoint' && (
                <>🏛️ <strong>底模中心 (Base Model Hub):</strong> 点击「应用为活跃底模」可将当前画板前置 Checkpoint 切换为此模型；点击「添加到画布」可创建 Load Checkpoint 节点。</>
              )}
              {activeCategory === 'lora' && (
                activeProvider === 'nanogpt' ? (
                  <>ℹ️ <strong>引擎特性提示:</strong> NanoGPT 为即开即用聚合模型推理端点，非独立的 LoRA 权重社区仓库。如需挂载社区 LoRA，请切换至 Civitai、Hugging Face、魔搭 (ModelScope) 或 Tensor.Art (吐司) 标签页。</>
                ) : (
                  <>🎨 <strong>LoRA 枢纽 (LoRA Hub):</strong> 按资源 ID 挂载 LoRA；Tensor.Art 需先选同架构底模，Hugging Face 需选支持 LoRA 的端点；点击「挂载到当前取景框」可加入叠加矩阵。</>
                )
              )}
              {activeCategory === 'video' && (
                <>视频资源目录：任务类型、输入图片与时长能力由所选端点决定。</>
              )}
              {activeCategory === 'all' && (
                <>✨ <strong>全生态大模型矩阵:</strong> 目录展示模型资源；在线生成和 LoRA 兼容性由所选端点核实，下载能力不代表 API 可生成。</>
              )}
              {activeCategory === 'edit' && (
                <>编辑与控制资源：选择前请核对端点要求的输入图片与参数。</>
              )}
            </span>
          </div>
        </div>

        {/* Models Grid */}
        <div className="flex-1 p-6 overflow-y-auto bg-[#121318]">
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-950/30 border border-red-500/30 text-red-300 flex items-center gap-3 animate-in slide-in-from-top-2 duration-200">
              <ShieldCheck className="w-5 h-5 text-red-500 shrink-0" />
              <div className="flex-1">
                <p className="font-bold text-xs uppercase tracking-wider mb-0.5">API 请求异常 (Transparency Alert)</p>
                <p className="text-[11px] opacity-90 leading-relaxed">{error}</p>
              </div>
              <button 
                onClick={() => loadModels(activeProvider, activeCategory, query, sortOption)}
                className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-200 font-bold text-[10px] transition-colors"
              >
                重试 (Retry)
              </button>
            </div>
          )}

          {activeProvider === 'all' && Object.keys(providerErrors).length > 0 && (
            <div className="mb-6 space-y-2">
              {Object.entries(providerErrors).map(([prov, err]) => (
                <div key={`err-${prov}`} className="px-4 py-2 rounded-lg bg-amber-950/20 border border-amber-500/20 text-amber-400 text-[10px] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Info className="w-3 h-3 text-amber-500" />
                    <span><strong>{prov.toUpperCase()}:</strong> {err}</span>
                  </div>
                  <span className="text-[9px] opacity-50 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">部分请求受限</span>
                </div>
              ))}
            </div>
          )}
          {activeProvider === 'tensorart' && <label className="mb-4 flex items-center gap-3 text-sm text-slate-300">公开目录分类<select aria-label="Tensor 模型中心目录分类" value={tensorTag} onChange={e=>{setTensorTag(e.target.value);loadModels(activeProvider,activeCategory,query,sortOption,selectedArch,false,e.target.value);}} className="rounded-lg border border-slate-700 bg-[#111216] p-2">{TENSOR_CATALOG_TAGS.map(([tag,label])=><option key={tag} value={tag}>{label}</option>)}</select></label>}
          {activeProvider === 'tensorart' && <p className="mb-4 text-sm text-slate-300">此处加载 Tensor 公共分类目录，支持底模与 LoRA 分类切换；TAMS 官方暂不提供全量列表接口。<a href="https://tusi.cn/models" target="_blank" rel="noopener noreferrer" className="ml-2 text-cyan-300 underline">浏览完整 Tensor.Art 模型 / LoRA 目录</a>，复制任意资源 ID 到上方查询。生成需 TAMS 模型 API Key，OpenWorks key 不能代用。</p>}
          {activeProvider === 'all' && !loading && <p className="mb-4 text-sm text-slate-400">当前展示各服务商目录摘要。选择单个服务商后继续检索或翻页。</p>}
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
              <p className="font-medium text-xs">正在读取所选平台目录...</p>
            </div>
          ) : displayList.length === 0 ? (
            <div className="h-72 flex flex-col items-center justify-center text-slate-400 space-y-3 p-6 bg-[#161720] rounded-2xl border border-[#262834]">
              <Sparkles className="w-10 h-10 text-cyan-400/60" />
              <div className="text-center">
                <p className="text-sm font-bold text-white">
                  当前目录页下暂无【{activeCategory === 'video' ? 'AI 视频大模型' : activeCategory === 'checkpoint' ? '基础底模' : activeCategory === 'lora' ? '微调 LoRA' : '当前分类'}】
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {error ? `错误原因: ${error}` : '请尝试切换分类、服务商或输入更精准的关键词进行查询所选目录'}
                </p>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => {
                    setQuery('');
                    setActiveCategory('all');
                    setSelectedArch('all');
                    setActiveProvider('all');
                    loadModels('all', 'all', '', sortOption, 'all');
                  }}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-cyan-600/30 transition-all flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>清除筛选并重新加载</span>
                </button>
                {error && (
                  <button
                    onClick={() => loadModels(activeProvider, activeCategory, query, sortOption)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-all flex items-center gap-1.5 border border-slate-700"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>立即重试 (Retry)</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {displayList.map((m: any, i: number) => {
                const modelId = m.id || m.name;
                const displayName = m.name || m.id;
                const isLora = m.type === 'LORA' || m.category === 'LoRA' || modelId.toLowerCase().includes('lora');
                const isVideo = m.category === 'Video' || modelId.toLowerCase().includes('video') || modelId.toLowerCase().includes('wan2.1-t2v');
                const providerName = m.provider || m._sourceProvider || 'Cloud API';
                const providerKey = (m._sourceProvider || m.provider || '').toLowerCase();
                const trainedWords = m.trainedWords || [];
                const isBookmarked = Boolean(bookmarks[modelId]);
                const baseArch = m.baseModel || '未知底模';
                const coverImage = m.imageUrl || '';

                return (
                  <div
                    key={`hub-model-${modelId}-${m.provider || m._sourceProvider || "all"}-${i}`}
                    className="bg-[#1a1b23] border border-[#272935] hover:border-cyan-500/50 rounded-2xl overflow-hidden flex flex-col justify-between space-y-3 transition-all group shadow-xl hover:shadow-cyan-500/10"
                  >
                      {/* Cover Preview */}
                      <div className="relative aspect-video rounded-t-2xl overflow-hidden bg-[#101115] flex items-center justify-center">
                        {coverImage ? (
                          <img
                            src={coverImage}
                            alt={displayName}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display = 'none';
                              const fallback = e.currentTarget.parentElement?.querySelector('.modelhub-card-fallback-banner') as HTMLElement;
                              if (fallback) fallback.style.display = 'flex';
                            }}
                          />
                        ) : null}

                        {/* Transparent genuine provider-themed fallback banner */}
                        <div
                          className={`modelhub-card-fallback-banner w-full h-full p-4 flex flex-col justify-between items-center text-center ${
                            coverImage ? 'hidden' : 'flex'
                          } ${
                            providerKey === 'modelscope' || providerKey === 'modelscope_ai'
                              ? 'bg-gradient-to-br from-[#0e1e2d] via-[#121824] to-[#1a1329]'
                              : providerKey === 'fal'
                              ? 'bg-gradient-to-br from-[#2a130c] via-[#1c1218] to-[#12131a]'
                              : providerKey === 'nanogpt'
                              ? 'bg-gradient-to-br from-[#0c2317] via-[#121c17] to-[#12131a]'
                              : providerKey === 'huggingface'
                              ? 'bg-gradient-to-br from-[#29220c] via-[#1c1812] to-[#12131a]'
                              : providerKey === 'tensorart' || providerKey === 'tensor'
                              ? 'bg-gradient-to-br from-[#291038] via-[#1a1226] to-[#12131a]'
                              : 'bg-gradient-to-br from-[#1a122e] via-[#141220] to-[#12131a]'
                          }`}
                        >
                          <div className="w-full flex justify-between items-center opacity-80">
                            <span className="text-[10px] font-mono font-bold text-slate-300">
                              {providerName}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-slate-200">
                              {baseArch}
                            </span>
                          </div>
                          <div className="my-auto flex flex-col items-center gap-1.5 px-2">
                            <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 shadow-inner">
                              <Cpu className="w-6 h-6 text-cyan-400" />
                            </div>
                            <span className="text-[11px] font-bold text-slate-200 line-clamp-1 max-w-[220px]">
                              {displayName}
                            </span>
                            <span className="text-[9px] font-mono text-slate-400">
                              [目录未附预览图]
                            </span>
                          </div>
                        </div>

                        <div className="absolute top-2 left-2 flex items-center gap-1.5 flex-wrap max-w-[80%] z-10">
                          <span className="bg-black/75 backdrop-blur-md px-2 py-0.5 rounded text-[10px] text-cyan-300 font-mono border border-cyan-500/30">
                            {baseArch}
                          </span>
                          <span className="bg-black/75 backdrop-blur-md px-2 py-0.5 rounded text-[10px] text-purple-300 font-mono border border-purple-500/30">
                            {providerName}
                          </span>
                        </div>

                        {/* Bookmark button */}
                        <button
                          onClick={() => toggleBookmark(modelId)}
                          className="absolute top-2 right-2 bg-black/75 backdrop-blur-md p-1.5 rounded-lg text-amber-300 hover:text-amber-200 border border-amber-500/30 transition-colors z-10"
                          title={isBookmarked ? '取消收藏' : '收藏此模型'}
                        >
                          {isBookmarked ? (
                            <BookmarkCheck className="w-3.5 h-3.5 fill-amber-400" />
                          ) : (
                            <Bookmark className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <div className="absolute bottom-2 left-2 flex items-center gap-1.5 z-10">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              isLora
                                ? 'bg-purple-600/90 text-white shadow'
                                : isVideo
                                ? 'bg-emerald-600/90 text-white shadow'
                                : 'bg-cyan-600/90 text-white shadow'
                            }`}
                          >
                            {isLora ? '🎨 微调 LoRA' : isVideo ? '🎥 AI 视频模型' : '🏛️ Checkpoint 底模'}
                          </span>
                        </div>

                        {typeof m.rating === 'number' && m.rating > 0 && (
                          <div className="absolute bottom-2 right-2 bg-black/75 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] text-amber-300 font-semibold flex items-center gap-1">
                            <Star className="w-3 h-3 fill-amber-400" />
                            <span>{Number(m.rating).toFixed(1)}</span>
                          </div>
                        )}
                      </div>

                      {/* Metadata body */}
                      <div className="p-4 flex-1 flex flex-col justify-between space-y-2.5">
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="font-bold text-white text-xs truncate" title={displayName}>
                              {displayName}
                            </h4>
                            {m.externalUrl && m.externalUrl !== 'https://nano-gpt.com' && m.externalUrl !== 'https://tensor.art' && m.externalUrl !== 'https://nano-gpt.com/' && m.externalUrl !== 'https://tensor.art/' ? (
                              <a
                                href={m.externalUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-slate-400 hover:text-cyan-400 shrink-0 p-1 hover:bg-white/5 rounded-md transition-colors"
                                title={`前往 ${providerName} 查看模型页面`}
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            ) : providerKey.includes('tensor') ? (
                              <a
                                href={m.id && /^\d+$/.test(m.id) ? `https://tensor.art/models/${m.id}` : `https://tensor.art/models?search=${encodeURIComponent(displayName)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-slate-400 hover:text-purple-400 shrink-0 p-1 hover:bg-white/5 rounded-md transition-colors"
                                title="前往 Tensor.Art 查看模型"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            ) : providerKey.includes('nanogpt') ? (
                              <a
                                href={`https://nano-gpt.com/models?search=${encodeURIComponent(modelId)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-slate-400 hover:text-emerald-400 shrink-0 p-1 hover:bg-white/5 rounded-md transition-colors"
                                title="前往 NanoGPT 查看模型"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            ) : providerKey.includes('civitai') ? (
                              <a
                                href={`https://civitai.com/models/${modelId}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-slate-400 hover:text-blue-400 shrink-0 p-1 hover:bg-white/5 rounded-md transition-colors"
                                title="前往 Civitai 查看模型"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            ) : providerKey.includes('hugging') ? (
                              <a
                                href={`https://huggingface.co/${modelId}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-slate-400 hover:text-amber-400 shrink-0 p-1 hover:bg-white/5 rounded-md transition-colors"
                                title="前往 Hugging Face 查看模型"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            ) : providerKey === 'modelscope' ? (
                              <a
                                href={`https://www.modelscope.cn/models/${modelId}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-slate-400 hover:text-indigo-400 shrink-0 p-1 hover:bg-white/5 rounded-md transition-colors"
                                title="前往魔搭国内站查看模型"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            ) : providerKey === 'modelscope_ai' ? (
                              <a
                                href={`https://modelscope.ai/models/${modelId}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-slate-400 hover:text-indigo-400 shrink-0 p-1 hover:bg-white/5 rounded-md transition-colors"
                                title="前往魔搭国际站查看模型"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            ) : providerKey.includes('fal') ? (
                              <a
                                href={`https://fal.ai/models/${modelId}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-slate-400 hover:text-emerald-400 shrink-0 p-1 hover:bg-white/5 rounded-md transition-colors"
                                title="前往 Fal.ai 查看模型"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            ) : null}
                          </div>

                          <p className="mt-2 text-sm text-slate-400 font-mono break-all" title={String(modelId)}>{isLora ? 'LoRA ID' : '模型 ID'} · {modelId}</p>
                          <p className="mt-2 text-sm text-slate-400">目录资源 · 生成权限与参数能力需由所选端点核实</p>
                          {/* Stats Tags */}
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {typeof m.downloads === 'number' && m.downloads > 0 && (
                              <span className="flex items-center gap-1 text-[10px] text-slate-400 font-mono bg-[#13141a] px-1.5 py-0.5 rounded">
                                <Download className="w-3 h-3" />
                                {m.downloads.toLocaleString()} 下载
                              </span>
                            )}
                            {m.badge && (
                              <span className="text-[10px] text-amber-300 font-mono bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-800/40">
                                {m.badge}
                              </span>
                            )}
                            {m.speed && (
                              <span className="text-[10px] text-cyan-300 font-mono bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-800/40">
                                {m.speed}
                              </span>
                            )}
                          </div>

                          {/* Trigger words for LoRA */}
                          {trainedWords.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-[#252733] space-y-1">
                              <div className="flex items-center justify-between text-[10px] text-slate-400">
                                <span className="text-purple-300 font-semibold">触发词 (Trigger Words):</span>
                                <button
                                  onClick={() => handleCopyText(`trigger-${modelId}`, trainedWords.join(', '))}
                                  className="text-purple-400 hover:text-purple-300 flex items-center gap-1 font-mono"
                                >
                                  {copiedKey === `trigger-${modelId}` ? (
                                    <>
                                      <Check className="w-3 h-3 text-emerald-400" />
                                      <span className="text-emerald-400">已复制</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" />
                                      <span>一键复制</span>
                                    </>
                                  )}
                                </button>
                              </div>
                              <p className="text-[10px] text-slate-300 font-mono line-clamp-1 bg-[#121318] p-1.5 rounded border border-[#242633]">
                                {trainedWords.join(', ')}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Action Buttons Hub */}
                        <div className="space-y-1.5 pt-2 border-t border-[#232530]">
                          {isLora ? (
                            <div className="space-y-1.5">
                              {onSelectLoRAWithBaseModel && (
                                <button
                                  onClick={() => {
                                    onSelectLoRAWithBaseModel({
                                      name: ['huggingface','modelscope','modelscope_ai','tensorart','tensor'].includes(providerKey) ? modelId : displayName,
                                      provider: providerKey,
                                      civitaiId: providerKey === 'civitai' && m.id ? String(m.id) : undefined,
                                      triggerWords: trainedWords.join(', '),
                                      baseModel: baseArch,
                                    });
                                    onClose();
                                  }}
                                  className="w-full py-1.5 px-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-bold transition-all shadow-md shadow-purple-600/30 flex items-center justify-center gap-1.5 text-[11px] active:scale-98"
                                  title={`挂载到当前同平台底模；生成前核实 ${baseArch} 架构`}
                                >
                                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                                  <span>挂载到所选底模</span>
                                  <span className="text-[10px] px-1 py-0.2 rounded bg-black/30 font-mono text-cyan-200">
                                    {baseArch}
                                  </span>
                                </button>
                              )}

                              <div className="grid grid-cols-2 gap-1.5">
                                {onAddLora && isSpatialMode && (
                                  <button
                                    onClick={() => {
                                      onAddLora({
                                        name: ['huggingface','modelscope','modelscope_ai','tensorart','tensor'].includes(providerKey) ? modelId : displayName,
                                        provider: providerKey,
                                        civitaiId: providerKey === 'civitai' && m.id ? String(m.id) : undefined,
                                        modelStrength: 0.8,
                                        clipStrength: 0.8,
                                        triggerWords: trainedWords.join(', '),
                                        baseModel: baseArch,
                                      });
                                      onClose();
                                    }}
                                    className="py-1.5 px-2 rounded-lg bg-[#22242e] hover:bg-[#2c303d] text-slate-200 hover:text-white font-medium flex items-center justify-center gap-1 border border-[#323544] transition-colors text-[10px]"
                                    title="挂载到当前选中的空间画板取景框"
                                  >
                                    <Plus className="w-3 h-3 text-cyan-400" />
                                    <span>挂载到取景框</span>
                                  </button>
                                )}

                                {onAddLoraNode && (
                                  <button
                                    onClick={() => {
                                      onAddLoraNode(['huggingface','modelscope','modelscope_ai','tensorart','tensor'].includes(providerKey) ? modelId : displayName, trainedWords.join(', '), baseArch, {provider:providerKey,civitaiId:providerKey==='civitai' ? String(m.id) : undefined});
                                      onClose();
                                    }}
                                    className="py-1.5 px-2 rounded-lg bg-[#22242e] hover:bg-[#2c303d] text-purple-300 hover:text-purple-200 font-medium flex items-center justify-center gap-1 border border-purple-500/30 transition-colors text-[10px]"
                                    title="在画布上创建独立的 LoRALoader 节点"
                                  >
                                    <Layers className="w-3 h-3" />
                                    <span>添加独立节点</span>
                                  </button>
                                )}
                              </div>

                              <button
                                title="本地提示词语法，云端接口仍需独立传入 LoRA ID 与权重"
                                onClick={() => handleCopyText(`lora-syntax-${modelId}`, `<lora:${displayName}:0.8>`)}
                                className="w-full py-1 rounded bg-[#13141a] hover:bg-[#1c1d25] text-slate-400 hover:text-slate-200 font-mono text-[10px] flex items-center justify-center gap-1 border border-[#242633]"
                              >
                                {copiedKey === `lora-syntax-${modelId}` ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-400" />
                                    <span className="text-emerald-400">已复制 LoRA 语法</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>复制本地 LoRA 语法</span>
                                  </>
                                )}
                              </button>
                            </div>
                          ) : isVideo ? (
                            /* Video Model Actions */
                            <div className="space-y-1.5">
                              <button
                                onClick={() => {
                                  onSelectModel(modelId, displayName, providerKey, m);
                                  onClose();
                                }}
                                className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold transition-all shadow-md shadow-emerald-600/30 flex items-center justify-center gap-1.5 text-[11px] active:scale-98"
                                title="将当前画板切换为此 AI视频生成模型"
                              >
                                <Video className="w-3.5 h-3.5 text-emerald-200" />
                                <span>应用为视频模型</span>
                              </button>

                              <div className="grid grid-cols-2 gap-1.5">
                                {onAddModelNode && (
                                  <button
                                    onClick={() => {
                                      onAddModelNode(modelId, displayName, providerKey, m);
                                      onClose();
                                    }}
                                    className="py-1.5 px-2 rounded-lg bg-[#22242e] hover:bg-[#2c303d] text-emerald-300 font-medium flex items-center justify-center gap-1 border border-[#323544] transition-colors text-[10px]"
                                    title="在画布上创建 AIVideoNode 节点"
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>添加视频节点</span>
                                  </button>
                                )}

                                <button
                                  onClick={() => handleCopyText(`model-id-${modelId}`, modelId)}
                                  className="py-1.5 px-2 rounded-lg bg-[#15161c] hover:bg-[#1e2028] text-slate-400 hover:text-slate-200 font-mono text-[10px] flex items-center justify-center gap-1 border border-[#262835]"
                                  title="复制视频模型 ID"
                                >
                                  {copiedKey === `model-id-${modelId}` ? (
                                    <>
                                      <Check className="w-3 h-3 text-emerald-400" />
                                      <span className="text-emerald-400">已复制 ID</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" />
                                      <span>复制模型路径</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* Base Model (Checkpoint & Edit) Actions */
                            <div className="space-y-1.5">
                              <button
                                onClick={() => {
                                  onSelectModel(modelId, displayName, providerKey, m);
                                  onClose();
                                }}
                                className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold transition-all shadow-md shadow-cyan-600/30 flex items-center justify-center gap-1.5 text-[11px] active:scale-98"
                                title="将当前画板前置 Checkpoint 或活跃取景框切换为本底模"
                              >
                                <Check className="w-3.5 h-3.5 text-cyan-200" />
                                <span>应用为底模</span>
                              </button>

                              <div className="grid grid-cols-2 gap-1.5">
                                {onAddModelNode && (
                                  <button
                                    onClick={() => {
                                      onAddModelNode(modelId, displayName, providerKey, m);
                                      onClose();
                                    }}
                                    className="py-1.5 px-2 rounded-lg bg-[#22242e] hover:bg-[#2c303d] text-cyan-300 font-medium flex items-center justify-center gap-1 border border-[#323544] transition-colors text-[10px]"
                                    title="在画布上创建对应的 Load Checkpoint 节点"
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>添加底模节点</span>
                                  </button>
                                )}

                                <button
                                  onClick={() => handleCopyText(`model-id-${modelId}`, modelId)}
                                  className="py-1.5 px-2 rounded-lg bg-[#15161c] hover:bg-[#1e2028] text-slate-400 hover:text-slate-200 font-mono text-[10px] flex items-center justify-center gap-1 border border-[#262835]"
                                  title="复制官方模型 ID"
                                >
                                  {copiedKey === `model-id-${modelId}` ? (
                                    <>
                                      <Check className="w-3 h-3 text-emerald-400" />
                                      <span className="text-emerald-400">已复制 ID</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" />
                                      <span>复制模型路径</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                  </div>
                );
              })}

              {/* Load More Button */}
              {hasMore && (
                <div className="flex flex-col items-center justify-center py-6 gap-2 border-t border-[#252835] col-span-full">
                  <button
                    onClick={() => loadModels(activeProvider, activeCategory, query, sortOption, selectedArch, true)}
                    disabled={loadingMore}
                    className="px-8 py-3 rounded-xl bg-gradient-to-r from-cyan-600 via-indigo-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-cyan-600/30 transition-all disabled:opacity-50 active:scale-95 cursor-pointer"
                  >
                    {loadingMore ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>正在从官方云端拉取更多模型...</span>
                      </>
                    ) : (
                      <>
                        <ArrowDown className="w-4 h-4" />
                        <span>加载更多模型 (当前已呈现 {displayList.length} 个)</span>
                      </>
                    )}
                  </button>
                  <p className="text-[10px] text-slate-500">
                    仅在目录接口明确提供下一页时继续加载。
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
