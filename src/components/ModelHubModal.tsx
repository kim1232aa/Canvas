import { beginTraceOperation } from '../services/executionTrace';
import {TensorCatalogNotice} from './TensorCatalogNotice';
import {isExplicitLoraWeightUrl,selectionFromExplicitLoraUrl,selectionFromMetadata,verifyCivitaiSelection,type ResourceSelection} from '../utils/resourceSelection';
import {isLoraWeightResource} from '../utils/isLoraWeightResource';
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
  Box,
} from 'lucide-react';
import { fetchLiveModels, fetchHuggingFaceModelInfo, fetchTensorArtModelInfo, fetchReplicateModelInfo } from '../services/api';

interface ModelHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectModel: (modelId: string, modelName: string, providerHint?: string, extraData?: any) => void;
  onAddModelNode?: (modelId: string, modelName: string, providerHint?: string, extraData?: any) => void;
  onAddLora?: (lora: {
    name: string;
    provider?: string;
    civitaiId?: string;
    /** Omit until user sets — never invent 0.8 */
    modelStrength?: number;
    clipStrength?: number;
    triggerWords?: string;
    baseModel?: string;
  }) => void;
  onAddLoraNode?: (loraName: string, triggerWords?: string, baseModel?: string, resource?: Partial<ResourceSelection> & {provider:string}) => void;
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
export type ProviderTab = 'all' | 'civitai' | 'fal' | 'tensorart' | 'modelscope' | 'modelscope_ai' | 'huggingface' | 'nanogpt' | 'gemini' | 'muapi' | 'wavespeed' | 'sogni' | 'krea' | 'together' | 'aimlapi' | 'novita' | 'venice' | 'openworks' | 'runware' | 'modelslab' | 'agnes' | 'sensenova' | 'openai_compat' | 'grok_compat' | 'replicate';
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
  {id:'krea',label:'Krea'}, {id:'together',label:'Together'}, {id:'aimlapi',label:'AIMLAPI'}, {id:'novita',label:'Novita'}, {id:'venice',label:'Venice'}, {id:'chroma',label:'Chroma'}, {id:'hunyuan',label:'Hunyuan'}, {id:'kolors',label:'Kolors'}, {id:'pixart',label:'PixArt'}, {id:'auraflow',label:'AuraFlow'}, {id:'anima',label:'Anima'}, {id:'ernie',label:'ERNIE'}, {id:'hidream',label:'HiDream'},
];

interface ArchitectureFields { baseModel?: unknown; id?: unknown; name?: unknown; description?: unknown; tags?: unknown }

function matchesArchitecture(m: ArchitectureFields, arch: string): boolean {
  if (!arch || arch === 'all') return true;
  const target = arch.toLowerCase();
  const baseModel = String(m.baseModel || '').toLowerCase();
  const id = String(m.id || '').toLowerCase();
  const name = String(m.name || '').toLowerCase();
  const desc = String(m.description || '').toLowerCase();
  const tags = Array.isArray(m.tags) ? m.tags.map((t: unknown) => String(t).toLowerCase()) : [];

  if (target === 'flux') {
    return baseModel.includes('flux') || id.includes('flux') || name.includes('flux') || tags.some(t => t.includes('flux'));
  }
  if (target === 'sdxl') {
    return baseModel.includes('sdxl') || id.includes('sdxl') || name.includes('sdxl') || tags.some(t => t.includes('sdxl'));
  }
  if (target === 'wan') {
    return baseModel.includes('wan') || id.includes('wan') || name.includes('wan') || tags.some(t => t.includes('wan'));
  }
  if (target === 'sd15' || target === 'sd 1.5') {
    return (
      baseModel.includes('sd 1.5') ||
      baseModel.includes('sd1.5') ||
      baseModel.includes('sd 1') ||
      id.includes('sd15') ||
      id.includes('sd-1-5') ||
      id.includes('sd1.5') ||
      name.includes('sd 1.5') ||
      name.includes('sd1.5') ||
      tags.some(t => t.includes('sd 1.5') || t.includes('sd15'))
    );
  }
  if (target === 'pony') {
    return baseModel.includes('pony') || id.includes('pony') || name.includes('pony') || tags.some(t => t.includes('pony'));
  }
  if (target === 'illustrious') {
    return baseModel.includes('illustrious') || id.includes('illustrious') || name.includes('illustrious') || tags.some(t => t.includes('illustrious'));
  }
  if (target === 'qwen') {
    return baseModel.includes('qwen') || id.includes('qwen') || name.includes('qwen') || tags.some(t => t.includes('qwen'));
  }
  if (target === 'z-image') {
    return baseModel.includes('z-image') || id.includes('z-image') || name.includes('z-image') || tags.some(t => t.includes('z-image'));
  }
  return baseModel.includes(target) || id.includes(target) || name.includes(target) || desc.includes(target) || tags.some(t => t.includes(target));
}

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
  const [catalogNotices, setCatalogNotices] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem('comfycanvas_model_bookmarks');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {};
  });

  const isModelBookmarked = (m: any) => {
    if (!m) return false;
    const id = String(m.id || m.name || '');
    const name = String(m.name || m.id || '');
    const prov = String(m.provider || m._sourceProvider || activeProvider || '').toLowerCase();
    return Boolean(
      bookmarks[id] ||
      bookmarks[name] ||
      bookmarks[`${prov}:${id}`] ||
      bookmarks[`${activeProvider}:${id}`]
    );
  };

  const toggleBookmark = (m: any) => {
    const id = typeof m === 'string' ? m : String(m.id || m.name || '');
    const name = typeof m === 'string' ? m : String(m.name || m.id || '');
    const prov = typeof m === 'object' ? String(m.provider || m._sourceProvider || activeProvider || '').toLowerCase() : activeProvider;
    const key = `${prov}:${id}`;
    setBookmarks((prev) => {
      const currentlyBookmarked = Boolean(prev[id] || prev[name] || prev[key]);
      const next = { ...prev };
      if (currentlyBookmarked) {
        delete next[id];
        delete next[name];
        delete next[key];
      } else {
        next[key] = true;
        next[id] = true;
      }
      try {
        localStorage.setItem('comfycanvas_model_bookmarks', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  // clean-0942: one catalog GET per URL per open. StrictMode double effects, initialProvider/initialCategory settling
  // after open, and repeated handlers share the in-flight/settled result. Failures are dropped so 重试 refetches.
  const catalogMemo = useRef(new Map<string, ReturnType<typeof fetchLiveModels>>());
  const wasOpen = useRef(false);
  if (isOpen && !wasOpen.current) { catalogMemo.current = new Map(); beginTraceOperation('打开底模中心'); }
  wasOpen.current = isOpen;
  const catalogOncePerOpen = (...args: Parameters<typeof fetchLiveModels>): ReturnType<typeof fetchLiveModels> => {
    const k = JSON.stringify(args);
    const hit = catalogMemo.current.get(k);
    if (hit) return hit;
    const p = fetchLiveModels(...args);
    catalogMemo.current.set(k, p);
    p.catch(() => { if (catalogMemo.current.get(k) === p) catalogMemo.current.delete(k); });
    return p;
  };

  const loadModels = async (
    prov = activeProvider,
    cat = activeCategory,
    searchTerm = query,
    sort = sortOption,
    arch = selectedArch,
    isLoadMore = false,
    catalogTag = ''
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
      setCatalogNotices({});
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

      const backendSort = sort === 'bookmarked' ? 'downloads' : sort;
      const data = await catalogOncePerOpen(
        prov,
        searchTerm,
        typeParam,
        cat,
        backendSort,
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

      const sourceMap: Record<string, any> = (data as any).results && typeof (data as any).results === 'object' && !Array.isArray((data as any).results)
        ? { ...data, ...(data as any).results }
        : data;

      Object.entries(sourceMap).forEach(([key, val]) => {
        if (key === '_pagination' || key === 'pagination' || key === 'catalogNotices' || key === 'errors' || key === 'results') return;
        // Ignore legacy results.*Notice / top-level *Notice siblings (human text only belongs in catalogNotices).
        if (key === 'catalogNotices' || key.endsWith('Notice')) return;
        if (val && typeof val === 'object' && !Array.isArray(val) && (val as any).error) {
          errors[key] = (val as any).error + ((val as any).details ? `: ${(val as any).details}` : '');
        } else if (Array.isArray(val)) {
          validData[key] = val;
          // A full directory page does not establish that another page exists.
        }
      });

      const extractedNotices: Record<string, string> = {};
      if (data.catalogNotices && typeof data.catalogNotices === 'object') {
        Object.assign(extractedNotices, data.catalogNotices);
      }
      Object.entries(data).forEach(([key, val]) => {
        if (key.endsWith('Notice') && typeof val === 'string') {
          extractedNotices[key.replace(/Notice$/, '')] = val;
        }
      });
      setCatalogNotices((prev) => (isLoadMore ? { ...prev, ...extractedNotices } : extractedNotices));

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
      const targetProvider = (initialProvider && !['openai_compat', 'grok_compat', 'agnes'].includes(initialProvider) && ['civitai','fal','tensorart','modelscope','modelscope_ai','huggingface','nanogpt','gemini','muapi','wavespeed','sogni','krea','together','aimlapi','novita','venice','openworks','runware','modelslab','sensenova','replicate'].includes(initialProvider)) ? initialProvider as ProviderTab : 'civitai';
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

  // Filter by category — prefer type/category/resourceKind over id substring
  // (Fal fal-ai/krea-2/turbo/lora is a Checkpoint endpoint, not a LoRA weight).
  if (activeCategory !== 'all') {
    displayList = displayList.filter((m) => {
      const cat = (m.category || m.type || '').toLowerCase();
      const providerHint = m._sourceProvider || m.provider;

      if (activeCategory === 'lora') {
        return isLoraWeightResource(m, providerHint);
      }
      if (activeCategory === 'video') {
        return cat.includes('video') || m.type === 'MotionModule';
      }
      if (activeCategory === 'checkpoint') {
        if (isLoraWeightResource(m, providerHint)) return false;
        return (cat.includes('checkpoint') || cat.includes('base') || m.type === 'Checkpoint') && !cat.includes('video');
      }
      if (activeCategory === 'edit') {
        return cat.includes('edit') || cat.includes('controlnet') || cat.includes('inpaint') || cat.includes('tools');
      }
      return true;
    });
  }

  // Filter by selected architecture
  if (selectedArch && selectedArch !== 'all') {
    displayList = displayList.filter((m) => matchesArchitecture(m, selectedArch));
  }

  // Real-time keyword filter if query is entered
  if (query && query.trim()) {
    const q = query.trim().toLowerCase();
    displayList = displayList.filter((m) => {
      const name = String(m.name || '').toLowerCase();
      const id = String(m.id || '').toLowerCase();
      const baseModel = String(m.baseModel || '').toLowerCase();
      const desc = String(m.description || '').toLowerCase();
      const tags = Array.isArray(m.tags) ? m.tags.map((t: any) => String(t).toLowerCase()) : [];
      return name.includes(q) || id.includes(q) || baseModel.includes(q) || desc.includes(q) || tags.some((t: string) => t.includes(q));
    });
  }

  // Sort displayList
  displayList.sort((a, b) => {
    if (sortOption === 'bookmarked') {
      const aBm = isModelBookmarked(a);
      const bBm = isModelBookmarked(b);
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
            { id: 'muapi', name: 'MuAPI' },
            { id: 'wavespeed', name: 'WaveSpeed' },
            { id: 'sogni', name: 'Sogni' },
            { id: 'krea', name: 'Krea' },
            { id: 'together', name: 'Together' },
            { id: 'aimlapi', name: 'AIMLAPI' },
            { id: 'novita', name: 'Novita' },
            { id: 'venice', name: 'Venice' },
            { id: 'openworks', name: 'Tensor.Art OpenWorks' },
            { id: 'runware', name: 'Runware' },
            { id: 'modelslab', name: 'ModelsLab' },
            { id: 'agnes', name: 'Agnes AI' },
            { id: 'sensenova', name: 'SenseNova' },
            { id: 'openai_compat', name: 'OpenAI 兼容中转' },
            { id: 'grok_compat', name: 'Grok 兼容中转' },
            { id: 'replicate', name: 'Replicate' },
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
                <option value="downloads" className="bg-[#181922] text-white">最多下载 (Downloads)</option>
                <option value="rating" className="bg-[#181922] text-white">最高评分 (Highest Rated)</option>
                <option value="likes" className="bg-[#181922] text-white">最多点赞 (Most Liked)</option>
                <option value="name_asc" className="bg-[#181922] text-white">名称排序 (A → Z)</option>
                <option value="name_desc" className="bg-[#181922] text-white">逆序排列 (Z → A)</option>
                <option value="bookmarked" className="bg-[#181922] text-white">我的收藏置顶 (Bookmarked)</option>
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
                ? '输入任意 ModelScope 模型 ID (格式 组织名/模型名)'
                : activeProvider === 'fal'
                ? '输入任意 Fal.ai 官方端点 (如 fal-ai/flux/dev 或 fal-ai/lora)'
                : activeProvider === 'nanogpt'
                ? '输入任意 NanoGPT Model ID (如 qwen-image-2.1/text-to-image, flux-pro, birefnet/v2)'
                : activeProvider === 'gemini'
                ? '输入 Gemini 模型 ID (如 gemini-2.5-flash-image)'
                : activeProvider === 'replicate'
                ? '输入 Replicate 模型 ID (如 black-forest-labs/flux-schnell 或 ideogram-ai/ideogram-v2a)'
                : activeProvider === 'runware'
                ? '输入 Runware AIR 标识符 (如 civitai:12345@67890 或 runware:100@1)'
                : activeProvider === 'modelslab'
                ? '输入 ModelsLab 模型 ID (如 midjourney, anything-v3 或 lora_model ID)'
                : activeProvider === 'muapi'
                ? '输入 MuAPI 模型端点/模型 ID'
                : activeProvider === 'wavespeed'
                ? '输入 WaveSpeed 模型端点/模型 ID'
                : activeProvider === 'sogni'
                ? '输入 Sogni 协议模型标识或 LoRA 标识'
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
                  : activeProvider === 'replicate' ? '输入 Replicate 模型 ID (如 black-forest-labs/flux-schnell 或 ideogram-ai/ideogram-v2a)...'
                  : activeProvider === 'runware' ? '输入 Runware AIR (如 civitai:xxxx@yyyy)...'
                  : activeProvider === 'modelslab' ? '输入 ModelsLab 模型 ID (如 midjourney)...'
                  : activeProvider === 'muapi' ? '输入 MuAPI 模型端点 ID...'
                  : activeProvider === 'wavespeed' ? '输入 WaveSpeed 模型端点 ID...'
                  : activeProvider === 'sogni' ? '输入 Sogni 模型 ID...'
                  : activeProvider === 'sensenova' ? '输入官方 SenseNova 图像模型 ID（如 sensenova-u1.5-lite）...'
                  : activeProvider === 'agnes' ? '输入 Agnes 模型 ID...'
                  : activeProvider === 'openai_compat' || activeProvider === 'grok_compat' ? '输入已配置中转实际支持的模型 ID...'
                  : activeProvider === 'all' ? '请先选择服务商'
                  : '输入 Civitai ID (如 133005) 或 URN...'
              }
              id="custom-tensor-template-input-modelhub"
              aria-label="自定义模型或 LoRA ID"
              value={customId}
              data-testid="hub-custom-id"
              disabled={activeProvider === 'all' || importing}
              onChange={(event) => { setCustomId(event.target.value); setImportError(null); }}
              className="flex-1 bg-[#100d1c] border border-purple-800/50 rounded-lg px-3 py-1.5 text-xs text-purple-100 placeholder:text-[#b9a6e0] outline-none focus:border-purple-400"
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
                  if(activeProvider==='civitai') {
                    const resource=await verifyCivitaiSelection(rawId,activeCategory==='lora'?'lora':'checkpoint');
                    if(version !== requestVersion.current)return;
                    if(activeCategory==='lora') {
                      if(onSelectLoRAWithBaseModel)onSelectLoRAWithBaseModel(resource);
                      else if(onAddLora)onAddLora({...resource}); // never invent 0.8
                    } else onSelectModel(resource.name,resource.name,activeProvider,resource);
                    onClose();return;
                  }
                  // LoRA Hub paste of an HTTP(S) weight URL: same executable attachment as LoRALoader typing.
                  if (activeCategory === 'lora' && isExplicitLoraWeightUrl(rawId)) {
                    const lora = selectionFromExplicitLoraUrl(activeProvider, rawId);
                    if (version !== requestVersion.current) return;
                    if (onSelectLoRAWithBaseModel) onSelectLoRAWithBaseModel(lora);
                    else if (onAddLora) onAddLora({ ...lora }); // strength must be explicit — never invent 0.8
                    else throw new Error('当前画布没有可挂载 LoRA 的入口，请先选择底模。');
                    onClose();
                    return;
                  }
                  if (activeProvider === 'replicate') {
                    const info = await fetchReplicateModelInfo(rawId);
                    if (version !== requestVersion.current) return;
                    const verifiedType = String(info?.category || info?.type || '').toLowerCase();
                    const isLora = ['lora', 'locon', 'lycoris', 'dora'].includes(verifiedType) || (activeCategory === 'lora' && rawId.toLowerCase().includes('lora'));
                    if (isLora) {
                      const words = info?.triggerWords || info?.trainedWords || [];
                      const lora = {
                        name: String(rawId),
                        provider: 'replicate',
                        civitaiId: undefined,
                        triggerWords: Array.isArray(words) ? words.join(', ') : String(words),
                        baseModel: info?.baseModel || undefined,
                        resourceVerified: true,
                        resource_source: 'replicate',
                        resource_kind: verifiedType,
                        downloadUrl: info?.downloadUrl,
                      };
                      if (onSelectLoRAWithBaseModel) onSelectLoRAWithBaseModel(lora);
                      else if (onAddLora) onAddLora({ ...lora }); // strength must be explicit — never invent 0.8
                      else onSelectModel(rawId, info?.name || rawId, 'replicate', info);
                    } else {
                      onSelectModel(rawId, info?.name || rawId, 'replicate', info);
                    }
                    onClose();
                    return;
                  }
                  let info: any = { id: rawId, name: rawId };
                  if (activeProvider === 'huggingface') info = await fetchHuggingFaceModelInfo(rawId);
                  if (activeProvider === 'tensorart') info = await fetchTensorArtModelInfo(rawId);
                  if (version !== requestVersion.current) return;
                  if (!info?.id) throw new Error('查询未返回模型 ID，请核对资源 ID 后重试。');
                  const verifiedType=String(info.category || info.type || '').toLowerCase();
                  if(activeCategory==='lora' && ['huggingface','tensorart'].includes(activeProvider) && !['lora','locon','lycoris','dora'].includes(verifiedType))throw new Error('资源元数据未标明为 LoRA，不能按当前分类把底模当作 LoRA 挂载');
                  const isLora = ['lora','locon','lycoris','dora'].includes(verifiedType) || (activeCategory==='lora' && !['huggingface','tensorart'].includes(activeProvider));
                  if (isLora) {
                    const words = info.triggerWords || info.trainedWords || [];
                    const lora = { name: String(info.id), provider: activeProvider,
                      civitaiId: undefined,
                      triggerWords: Array.isArray(words) ? words.join(', ') : String(words),
                      baseModel: info.baseModel || undefined,resourceVerified:['huggingface','tensorart'].includes(activeProvider),resource_source:activeProvider,resource_kind:verifiedType,downloadUrl:info.downloadUrl };
                    if (onSelectLoRAWithBaseModel) onSelectLoRAWithBaseModel(lora);
                    else if (onAddLora) onAddLora({ ...lora }); // strength must be explicit — never invent 0.8
                    else throw new Error('当前画布没有可挂载 LoRA 的入口，请先选择底模。');
                  } else {
                    onSelectModel(String(info.id), info.name || String(info.id), activeProvider, {...info,resourceVerified:['huggingface','tensorart'].includes(activeProvider),resource_source:activeProvider,resource_kind:verifiedType});
                  }
                  onClose();
                } catch (err) {
                  if (version === requestVersion.current) setImportError(err instanceof Error ? err.message : String(err));
                } finally {
                  setImporting(false);
                }
              }}
              data-testid="hub-custom-id-apply"
              style={{ opacity: 1 }}
              className="px-3 py-1.5 rounded-lg bg-[#7e22ce] hover:bg-[#6b21a8] text-white disabled:bg-[#3b2d5e] disabled:text-[#e4dcf5] disabled:cursor-not-allowed font-bold text-xs whitespace-nowrap shadow-sm active:scale-95 transition-all cursor-pointer"
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
                <><strong>底模中心 (Base Model Hub):</strong> 点击「应用为底模」可将当前画板前置 Checkpoint 切换为此模型；点击「添加底模节点」可创建 Load Checkpoint 节点。</>
              )}
              {activeCategory === 'lora' && (
                activeProvider === 'nanogpt' ? (
                  <><strong>引擎特性提示:</strong> NanoGPT 为即开即用聚合模型推理端点，非独立的 LoRA 权重社区仓库。如需挂载社区 LoRA，请切换至 Civitai、Hugging Face、魔搭 (ModelScope) 或 Tensor.Art (吐司) 标签页。</>
                ) : (
                  <><strong>LoRA 枢纽 (LoRA Hub):</strong> 按资源 ID 挂载 LoRA；Tensor.Art 需先选同架构底模，Hugging Face 需选支持 LoRA 的端点；点击「挂载到当前取景框」可加入叠加矩阵。</>
                )
              )}
              {activeCategory === 'video' && (
                <><strong>视频模型目录:</strong> 任务类型、输入图片与时长能力由所选端点决定；可直接在画布中创建视频生成节点。</>
              )}
              {activeCategory === 'all' && (
                <><strong>全生态大模型矩阵:</strong> 目录展示模型资源；在线生成和 LoRA 兼容性由所选端点核实，下载能力不代表 API 可生成。</>
              )}
              {activeCategory === 'edit' && (
                <><strong>编辑与控制资源:</strong> 选择前请核对端点要求的输入图片与参数。</>
              )}
            </span>
          </div>
        </div>

        {/* Models Grid */}
        <div className="flex-1 p-6 pb-24 overflow-y-auto bg-[#121318] scrollbar-thin scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20">
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
          {activeProvider === 'tensorart' && <TensorCatalogNotice />}
          {activeProvider !== 'all' && catalogNotices[activeProvider] && (
            <div className="mb-4 px-4 py-2.5 rounded-lg bg-cyan-950/20 border border-cyan-500/30 text-cyan-300 text-xs flex items-start gap-2.5">
              <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">
                <span>{catalogNotices[activeProvider]}</span>
              </div>
            </div>
          )}
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
                  {activeProvider === 'tensorart' ? '按模型 / LoRA ID 查询' : `当前目录页暂无所选分类资源`}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {error ? `错误原因: ${error}` : activeProvider === 'tensorart' ? 'TAMS 没有列表 API；在上方输入真实资源 ID 查询详情。' : '请尝试切换分类、服务商或输入更精准的关键词进行查询所选目录'}
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
                const providerName = m.provider || m._sourceProvider || 'Cloud API';
                const providerKey = (m._sourceProvider || m.provider || '').toLowerCase();
                // Prefer type/category/resourceKind — do not treat Fal gen endpoints with "lora" in id as weights.
                const isLora = isLoraWeightResource(m, providerKey || m.provider || m._sourceProvider);
                const isVideo = m.category === 'Video' || modelId.toLowerCase().includes('video') || modelId.toLowerCase().includes('wan2.1-t2v');
                let resource:ResourceSelection={name:String(modelId),provider:providerKey,resourceVerified:false};
                try {resource=selectionFromMetadata(providerKey,m,isLora?'lora':'checkpoint');}catch{/* Incomplete catalog metadata does not clear unresolved imports. */}
                const trainedWords = m.trainedWords || [];
                const isBookmarked = isModelBookmarked(m);
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

                        {/* Subtle protective gradient over cover image for badge contrast */}
                        {coverImage && (
                          <div className="absolute inset-0 bg-gradient-to-t from-[#1a1b23]/80 via-transparent to-black/35 pointer-events-none" />
                        )}

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
                              : providerKey === 'replicate'
                              ? 'bg-gradient-to-br from-[#082032] via-[#0f172a] to-[#1e1b4b]'
                              : 'bg-gradient-to-br from-[#1a122e] via-[#141220] to-[#12131a]'
                          }`}
                        >
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
                          onClick={() => toggleBookmark(m)}
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
                            {isLora ? 'LoRA 微调' : isVideo ? '视频模型' : 'Checkpoint 底模'}
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
                            ) : providerKey === 'replicate' ? (
                              <a
                                href={`https://replicate.com/${modelId}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-slate-400 hover:text-cyan-400 shrink-0 p-1 hover:bg-white/5 rounded-md transition-colors"
                                title="前往 Replicate 查看模型"
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
                                    onSelectLoRAWithBaseModel({...resource,triggerWords:resource.triggerWords || trainedWords.join(', '),baseModel:resource.baseModel || baseArch});
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
                                        provider: providerKey,
                                        civitaiId: providerKey === 'civitai' && m.id ? String(m.id) : undefined,
                                        // Never invent 0.8 — user must set strength before generate
                                        triggerWords: trainedWords.join(', '),
                                        baseModel: baseArch,
                                        ...resource,
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
                                      onAddLoraNode(resource.name, trainedWords.join(', '), baseArch, {...resource,provider:providerKey});
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
                                title="本地提示词语法占位（无强度）；请自行填写强度，禁止默认 0.8。云端接口仍需独立传入 LoRA ID 与权重"
                                onClick={() => handleCopyText(`lora-syntax-${modelId}`, `<lora:${displayName}>`)}
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
                                  onSelectModel(resource.name, displayName, providerKey, {...m,...resource});
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
                                      onAddModelNode(resource.name, displayName, providerKey, {...m,...resource});
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
                                  onSelectModel(resource.name, displayName, providerKey, {...m,...resource});
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
                                      onAddModelNode(resource.name, displayName, providerKey, {...m,...resource});
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

                              {onAddModelNode && ['fal', 'replicate', 'modelscope', 'modelscope_ai', 'nanogpt', 'gemini'].includes(providerKey) && (
                                <button
                                  onClick={() => {
                                    onAddModelNode(resource.name, displayName, providerKey, {...m,...resource, preferEngineNode: true});
                                    onClose();
                                  }}
                                  className="w-full py-1.5 px-2.5 rounded-lg bg-[#1c1d29] hover:bg-[#252737] text-purple-300 hover:text-purple-200 font-medium flex items-center justify-center gap-1.5 border border-purple-500/30 transition-colors text-[10px]"
                                  title="在画布上创建一体化极速引擎节点（免连 KSampler 独立直出）"
                                >
                                  <Layers className="w-3 h-3 text-purple-400" />
                                  <span>添加一体化引擎节点</span>
                                </button>
                              )}
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
