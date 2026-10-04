import {TensorCatalogNotice} from './TensorCatalogNotice';
import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Download,
  Star,
  Sparkles,
  Plus,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  Layers,
  Cpu,
  Heart,
  Globe,
  Filter,
  Zap,
  ShieldAlert,
  RefreshCw,
  ArrowDown,
} from 'lucide-react';
import { CivitaiModelItem } from '../types/providers';
import { searchCivitaiModels, fetchLiveModels, fetchHuggingFaceModelInfo, fetchTensorArtModelInfo } from '../services/api';
import { identifyArchitectureFamily, ARCHITECTURE_PROFILES } from '../utils/baseModelMatcher';

export type LoraProviderFilter = 'all' | 'civitai' | 'huggingface' | 'modelscope' | 'modelscope_ai' | 'fal' | 'tensorart' | 'muapi' | 'wavespeed' | 'sogni';

export interface UnifiedLoRAItem {
  id: string;
  /** Raw provider-side resource ID/URL without the `${provider}-` display prefix. */
  resourceId?: string;
  name: string;
  provider: 'Civitai' | 'Hugging Face' | 'ModelScope CN' | 'ModelScope AI' | 'Fal.ai' | 'Tensor.Art' | 'MuAPI' | 'WaveSpeed' | 'Sogni';
  providerKey: LoraProviderFilter;
  baseModel: string;
  creator: string;
  rating?: number;
  downloadCount?: number;
  likes?: number;
  speed?: string;
  previewImg: string;
  triggerWords: string;
  civitaiId?: string;
  externalUrl?: string;
  badge?: string;
}

export interface CivitaiModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectLoRA: (lora: { name: string; provider?: string; civitaiId?: string; triggerWords: string; baseModel?: string }) => void;
  onAddLoRANodeToCanvas: (lora: { name: string; provider?: string; civitaiId?: string; triggerWords: string; baseModel?: string }) => void;
  onSelectLoRAWithBaseModel?: (lora: { name: string; provider?: string; civitaiId?: string; triggerWords: string; baseModel?: string }) => void;
  initialProvider?: LoraProviderFilter;
}

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
];

export const CivitaiModal: React.FC<CivitaiModalProps> = ({
  isOpen,
  onClose,
  onSelectLoRA,
  onAddLoRANodeToCanvas,
  onSelectLoRAWithBaseModel,
  initialProvider = 'all',
}) => {
  const [activeProvider, setActiveProvider] = useState<LoraProviderFilter>(initialProvider);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('Highest Rated');
  const [selectedArch, setSelectedArch] = useState<string>('all');
  const [models, setModels] = useState<UnifiedLoRAItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [civitaiCursor, setCivitaiCursor] = useState<string | null>(null);
  const [hfCursor, setHfCursor] = useState<string | null>(null);
  const [msPage, setMsPage] = useState<number>(1);
  const [copiedTrigger, setCopiedTrigger] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [catalogNotice, setCatalogNotice] = useState<string | null>(null);
  const activeReqIdRef = useRef(0);

  const fetchModels = async (
    prov = activeProvider,
    searchTerm = query,
    sortOption = sort,
    arch = selectedArch,
    isLoadMore = false
  ) => {
    const currentReqId = ++activeReqIdRef.current;
    if (isLoadMore) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setCivitaiCursor(null);
      setHfCursor(null);
      setMsPage(1);
      setHasMore(true);
    }
    setErrorMsg(null);
    try {
      const items: UnifiedLoRAItem[] = [];
      const archQuery = arch === 'all' ? '' : arch;

      // 1. Fetch from Civitai if activeProvider is 'all' or 'civitai'
      if (prov === 'all' || prov === 'civitai') {
        try {
          const cData = await searchCivitaiModels(
            searchTerm,
            'LORA',
            sortOption,
            1,
            24,
            undefined,
            isLoadMore ? civitaiCursor || undefined : undefined
          );
          if (cData && Array.isArray(cData.items)) {
            setCivitaiCursor(cData.metadata?.nextCursor || null);
            if (!cData.metadata?.nextCursor && prov === 'civitai') {
              setHasMore(false);
            }
            cData.items.forEach((m: CivitaiModelItem) => {
              const latest = m.modelVersions?.[0];
              const trigger = latest?.trainedWords?.join(', ') || '';
              const rawBase = latest?.baseModel || '未知底模';
              const fam = identifyArchitectureFamily(rawBase, m.name);
              const displayBase = ARCHITECTURE_PROFILES[fam]?.displayName.split(' ')[0] || rawBase;

              items.push({
                id: `civitai-${m.id}`,
                name: m.name,
                provider: 'Civitai',
                providerKey: 'civitai',
                baseModel: displayBase,
                creator: m.creator?.username || 'Community Creator',
                rating: typeof m.stats?.rating === 'number' && m.stats.rating > 0 ? m.stats.rating : undefined,
                downloadCount: typeof m.stats?.downloadCount === 'number' && m.stats.downloadCount > 0 ? m.stats.downloadCount : undefined,
                previewImg: latest?.images?.[0]?.url || '',
                triggerWords: trigger,
                civitaiId: String(m.id),
                externalUrl: `https://civitai.com/models/${m.id}`,
                badge: fam.toUpperCase(),
              });
            });
          }
        } catch (cErr: any) {
          console.warn('Civitai query error:', cErr);
          setErrorMsg(`Civitai 检索异常: ${cErr.message || '网络连接或上游 API 限制'}`);
        }
      }

      // 2. Fetch from other LoRA engines (HuggingFace, ModelScope, Fal, Tensor)
      if (prov !== 'civitai') {
        const liveCursor = isLoadMore ? (hfCursor || '') : '';
        const livePage = isLoadMore ? (msPage + 1) : 1;
        const liveData = await fetchLiveModels(
          prov === 'all' ? 'all' : prov,
          searchTerm,
          'LORA',
          'lora',
          sortOption,
          liveCursor,
          livePage,
          36,
          archQuery
        );

        const pag = liveData._pagination || {};
        const noticeEntry = Object.entries(liveData as Record<string, unknown>).find(([k, v]) => (k === 'catalogNotice' || k.endsWith('Notice')) && typeof v === 'string');
        setCatalogNotice(noticeEntry ? (noticeEntry[1] as string) : null);
        if (pag.huggingface?.nextCursor) {
          setHfCursor(pag.huggingface.nextCursor);
        } else if (prov === 'huggingface') {
          setHasMore(false);
        }

        if (pag.modelscope?.page) {
          setMsPage(pag.modelscope.page);
          if (!pag.modelscope.hasMore && (prov === 'modelscope' || prov === 'modelscope_ai')) {
            setHasMore(false);
          }
        }

        if (pag.tensorart?.page) {
          setMsPage(pag.tensorart.page);
          if (!pag.tensorart.hasMore && prov === 'tensorart') {
            setHasMore(false);
          }
        }

        Object.entries(liveData).forEach(([provKey, list]) => {
          if (provKey === '_pagination') return;
          if (Array.isArray(list)) {
            list.forEach((m: any) => {
              const isLoraItem = m.category === "LoRA" || m.type === "LORA" || (m.tags && m.tags.includes("lora")) || (m.id && m.id.toLowerCase().includes("lora")) || (m.name && m.name.toLowerCase().includes("lora"));

              if (isLoraItem) {
                const fam = identifyArchitectureFamily(m.baseModel || m.name || m.id);
                const pName =
                  provKey === 'huggingface' ? 'Hugging Face' :
                  provKey === 'modelscope' ? 'ModelScope CN' :
                  provKey === 'modelscope_ai' ? 'ModelScope AI' :
                  provKey === 'fal' ? 'Fal.ai' :
                  provKey === 'muapi' ? 'MuAPI' :
                  provKey === 'wavespeed' ? 'WaveSpeed' :
                  provKey === 'sogni' ? 'Sogni' :
                  (provKey === 'tensorart' || provKey === 'tensor') ? 'Tensor.Art' : 'Civitai';
                
                // Avoid duplicating civitai items already fetched
                if (provKey === 'civitai' && items.some((it) => it.id === `civitai-${m.id}`)) return;

                const normalizedProvKey: LoraProviderFilter =
                  ['huggingface','modelscope','modelscope_ai','fal','muapi','wavespeed','sogni','tensorart','tensor'].includes(provKey)
                    ? (provKey === 'tensor' ? 'tensorart' : (provKey as LoraProviderFilter))
                    : 'civitai';

                const itemExternalUrl =
                  m.externalUrl
                    ? m.externalUrl
                    : provKey === 'huggingface'
                    ? `https://huggingface.co/${m.id}`
                    : provKey === 'modelscope'
                    ? `https://www.modelscope.cn/models/${m.id}`
                    : provKey === 'modelscope_ai'
                    ? `https://modelscope.ai/models/${m.id}`
                    : (provKey === 'tensorart' || provKey === 'tensor')
                    ? (/^\d+$/.test(m.id) ? `https://tensor.art/models/${m.id}` : `https://tensor.art/models?search=${encodeURIComponent(m.name || m.id)}`)
                    : provKey === 'civitai'
                    ? `https://civitai.com/models/${m.id}`
                    : undefined;

                const triggerStr = Array.isArray(m.trainedWords) && m.trainedWords.length > 0
                  ? m.trainedWords.join(', ')
                  : (m.triggers || '');

                items.push({
                  id: `${provKey}-${m.id}`,
                  resourceId: String(m.id),
                  name: m.name || m.id,
                  provider: pName as any,
                  providerKey: normalizedProvKey,
                  baseModel: m.baseModel || ARCHITECTURE_PROFILES[fam]?.displayName.split(' ')[0] || 'FLUX.1',
                  creator: m.creator || m.author || pName,
                  rating: typeof m.rating === 'number' && m.rating > 0 ? m.rating : undefined,
                  downloadCount: typeof m.downloads === 'number' && m.downloads > 0 ? m.downloads : undefined,
                  likes: typeof m.likes === 'number' && m.likes > 0 ? m.likes : undefined,
                  speed: m.speed,
                  previewImg: m.imageUrl || '',
                  triggerWords: triggerStr,
                  civitaiId: provKey === 'civitai' ? String(m.id) : undefined,
                  externalUrl: itemExternalUrl,
                  badge: m.badge || fam.toUpperCase(),
                });
              }
            });
          }
        });
      }

      // Sort items across all providers according to selected sortOption
      items.sort((a, b) => {
        if (sortOption === 'Highest Rated' || sortOption.includes('Rate')) {
          return (b.rating || 0) - (a.rating || 0) || (b.downloadCount || 0) - (a.downloadCount || 0);
        }
        if (sortOption === 'Most Downloaded' || sortOption.includes('Download')) {
          return (b.downloadCount || 0) - (a.downloadCount || 0);
        }
        if (sortOption === 'Most Liked' || sortOption.includes('Like')) {
          return (b.likes || 0) - (a.likes || 0) || (b.downloadCount || 0) - (a.downloadCount || 0);
        }
        if (sortOption === 'Name A-Z' || sortOption.includes('A-Z')) {
          return (a.name || '').localeCompare(b.name || '');
        }
        return (b.downloadCount || 0) - (a.downloadCount || 0);
      });

      if (currentReqId === activeReqIdRef.current) {
        if (isLoadMore) {
          setModels((prev) => {
            const existingIds = new Set(prev.map((x) => x.id));
            const newUnique = items.filter((x) => !existingIds.has(x.id));
            return [...prev, ...newUnique];
          });
        } else {
          setModels(items);
        }
      }
    } catch (err: any) {
      console.warn('LoRA search error:', err);
      if (currentReqId === activeReqIdRef.current) {
        setErrorMsg(`模型检索异常: ${err.message || '网络连接或上游服务异常'}`);
      }
    } finally {
      if (currentReqId === activeReqIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchModels(activeProvider, query, sort, selectedArch, false);
    }
  }, [isOpen, activeProvider, selectedArch]);

  if (!isOpen) return null;

  const handleCopyTrigger = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTrigger(text);
    setTimeout(() => setCopiedTrigger(null), 2000);
  };

  const handleCustomUniversalLoraSubmit = async () => {
    const inputEl = document.getElementById('custom-universal-lora-input') as HTMLInputElement;
    const rawVal = inputEl?.value?.trim() || '';
    if (!rawVal) return;

    // If user enters a Hugging Face repo ID (e.g. Shakker-Labs/FLUX.1-Dev-LoRA-Realism)
    if (activeProvider === 'huggingface' || (rawVal.includes('/') && !rawVal.includes('tensor.art') && !rawVal.includes('tusiart.com'))) {
      try {
        setLoading(true);
        const info = await fetchHuggingFaceModelInfo(rawVal);
        const triggerStr = Array.isArray(info.triggerWords) && info.triggerWords.length > 0
          ? info.triggerWords.join(', ')
          : '';
        if (!/lora|locon|lycoris|dora/i.test(info.type || info.category || '')) throw new Error('查询返回的资源不是 LoRA');
        onSelectLoRA({
          provider:'huggingface',
          name: info.id || rawVal,
          civitaiId: undefined,
          triggerWords: triggerStr,
          baseModel: info.baseModel || 'FLUX.1 / SDXL',
        });
        onClose();
        return;
      } catch (e: any) {
        setErrorMsg(`${e.message}\n${e.stack || ''}`);
        return;
      } finally {
        setLoading(false);
      }
    }

    // If user enters a Tensor.Art / 吐司 model ID or URL
    if (
      activeProvider === 'tensorart' ||
      rawVal.includes('tensor.art') ||
      rawVal.includes('tusiart.com') ||
      (activeProvider === 'all' && /^\d{15,25}$/.test(rawVal.trim()))
    ) {
      try {
        setLoading(true);
        const info = await fetchTensorArtModelInfo(rawVal);
        const triggerStr = Array.isArray(info.trainedWords) && info.trainedWords.length > 0
          ? info.trainedWords.join(', ')
          : '';
        if (!/lora|locon|lycoris|dora/i.test(info.type || info.category || '')) throw new Error('查询返回的资源不是 LoRA');
        const baseArch = info.baseModel;
        if (onSelectLoRAWithBaseModel) {
          onSelectLoRAWithBaseModel({
            name: String(info.id),
            provider:'tensorart',
            triggerWords: triggerStr,
            baseModel: baseArch,
          });
        } else {
          onSelectLoRA({
            name: String(info.id),
            provider:'tensorart',
            triggerWords: triggerStr,
            baseModel: baseArch,
          });
        }
        onClose();
        return;
      } catch (e: any) {
        setErrorMsg(`${e.message}\n${e.stack || ''}`);
        return;
      } finally {
        setLoading(false);
      }
    }

    const isCivitaiId = /^\d+$/.test(rawVal);
    const modelName = rawVal.includes('/') ? rawVal.split('/').pop()! : rawVal;
    onSelectLoRA({
      name: `[${activeProvider.toUpperCase()}] ${modelName}`,
      civitaiId: isCivitaiId ? rawVal : undefined,
      triggerWords: '',
      baseModel: 'FLUX.1 / SDXL',
    });
    onClose();
  };

  const displayedModels = models.filter((model) => {
    if (activeProvider === 'all') return true;
    return model.providerKey === activeProvider;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-[#181920] border border-[#2e303c] rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-xs">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#282a36] bg-[#13141a] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 via-indigo-600 to-cyan-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-purple-600/30 shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                全生态 LoRA & 微调模型中心 (Universal LoRA Hub)
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 font-mono">
                  跨引擎全聚合 · 真实 API 动态直拉
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                涵盖 Civitai、Hugging Face、魔搭社区 (ModelScope)、Fal.ai、Tensor.Art 全网海量开源与微调 LoRA，支持架构筛选与海量翻页
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-[#252731] transition-colors text-sm shrink-0"
            title="关闭"
          >
            ✕
          </button>
        </div>

        {/* Engine Provider Tabs */}
        <div className="px-6 pt-3 pb-1 bg-[#15161d] border-b border-[#242630] flex items-center gap-2 overflow-x-auto shrink-0 min-h-[44px]">
          {[
            { id: 'all', name: '🌐 全生态聚合 (Civitai/HF/魔搭/Fal/Tensor/MuAPI/WaveSpeed/Sogni)' },
            { id: 'civitai', name: '🌟 Civitai (C站社区 LoRA)' },
            { id: 'huggingface', name: '🤗 Hugging Face (开源 LoRA 库)' },
            { id: 'modelscope', name: '🇨🇳 魔搭 CN (国内站 LoRA)' },
            { id: 'modelscope_ai', name: '🌐 魔搭 AI (国际站 LoRA)' },
            { id: 'fal', name: '⚡ Fal.ai (云端托管 LoRA 端点)' },
            { id: 'tensorart', name: '🎨 Tensor.Art (吐司 LoRA & 工作流)' },
            { id: 'muapi', name: '🟣 MuAPI (LoRA 端点，URL 挂载)' },
            { id: 'wavespeed', name: '🌊 WaveSpeed (LoRA 端点，URL 挂载)' },
            { id: 'sogni', name: '🧡 Sogni (官方 LoRA 资源)' },
          ].map((tab) => {
            const isActive = activeProvider === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveProvider(tab.id as any);
                  setModels([]);
                  fetchModels(tab.id as any, query, sort, selectedArch, false);
                }}
                className={`pb-2.5 px-3.5 font-semibold transition-all relative whitespace-nowrap text-xs flex items-center gap-1.5 shrink-0 ${
                  isActive ? 'text-cyan-400 font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>{tab.name}</span>
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-400 to-cyan-400" />
                )}
              </button>
            );
          })}
        </div>

        {/* Architecture Family Filter Bar */}
        <div className="px-6 py-2 bg-[#121319] border-b border-[#20222d] flex items-center gap-2 overflow-x-auto shrink-0">
          <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1 shrink-0 mr-1">
            <Filter className="w-3.5 h-3.5 text-purple-400" />
            底模架构筛选:
          </span>
          {ARCHITECTURE_TAGS.map((tag) => {
            const isSelected = selectedArch === tag.id;
            return (
              <button
                key={tag.id}
                onClick={() => {
                  setSelectedArch(tag.id);
                  setModels([]);
                  fetchModels(activeProvider, query, sort, tag.id, false);
                }}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all shrink-0 ${
                  isSelected
                    ? 'bg-purple-600/30 text-purple-200 border border-purple-500/60 shadow-sm'
                    : 'bg-[#1a1b24] text-slate-400 hover:text-slate-200 border border-[#272935]'
                }`}
              >
                {tag.label}
              </button>
            );
          })}
          <div className="ml-auto text-[11px] text-slate-400 font-mono shrink-0">
            已检索到 <span className="text-purple-400 font-bold">{displayedModels.length}</span> 个模型
          </div>
        </div>

        {/* Search Bar & Filters */}
        <div className="p-4 border-b border-[#242630] bg-[#181922] flex flex-wrap gap-3 items-center shrink-0">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchModels(activeProvider, query, sort, selectedArch, false)}
              placeholder="跨引擎检索 LoRA (如: Cyberpunk, Ghibli, Detail, Face, Armor, Realistic, Anime, Wan)..."
              className="w-full bg-[#111216] border border-[#2b2d38] focus:border-cyan-500 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 outline-none font-mono"
            />
          </div>

          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              fetchModels(activeProvider, query, e.target.value, selectedArch, false);
            }}
            className="bg-[#111216] border border-[#2b2d38] text-[11px] font-semibold text-slate-300 rounded-xl px-3 py-2 outline-none cursor-pointer shrink-0"
          >
            <option value="Highest Rated">⭐ 最高评分 (Highest Rated)</option>
            <option value="Most Downloaded">🔥 最多下载 (Most Downloaded)</option>
            <option value="Most Liked">❤️ 最多点赞 (Most Liked)</option>
            <option value="Newest">⚡ 最新发布 (Newest)</option>
            <option value="Name A-Z">🔤 名称排序 (A → Z)</option>
          </select>

          <button
            onClick={() => fetchModels(activeProvider, query, sort, selectedArch, false)}
            disabled={loading}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-xs font-bold text-white flex items-center gap-1.5 shadow-md shadow-purple-600/20 transition-all disabled:opacity-50 shrink-0"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            <span>实时检索</span>
          </button>
        </div>

        {/* Universal Dynamic Custom Model / LoRA Import Bar */}
        <div className="px-6 py-2.5 bg-[#171424] border-b border-purple-900/40 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-purple-300">
            <Zap className="w-4 h-4 text-purple-400 shrink-0" />
            <span>
              <strong>自定义/任意 LoRA 动态导入：</strong>
              {activeProvider === 'huggingface'
                ? '输入任意 Hugging Face 模型 ID (如 fofr/flux-80s-cyberpunk 或 lightx2v/Qwen-Image-Lightning)'
                : activeProvider === 'modelscope' || activeProvider === 'modelscope_ai'
                ? '输入任意 ModelScope 模型 ID (如 damo/wan2.1-t2i)'
                : activeProvider === 'fal'
                ? '输入任意 Fal.ai LoRA 路径或 Endpoint'
                : activeProvider === 'tensorart'
                ? '输入 Tensor.Art / 吐司 Model ID (如 672390779613802167) 或主页链接'
                : '输入任意 Civitai 模型 ID / AIR URN (如 138944 或 urn:air:...)'}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <input
              type="text"
              placeholder={
                activeProvider === 'huggingface'
                  ? '输入 HF Repo ID (如 fofr/flux-80s-cyberpunk)...'
                  : activeProvider === 'modelscope' || activeProvider === 'modelscope_ai'
                  ? '输入 ModelScope ID (如 damo/model-id)...'
                  : activeProvider === 'fal'
                  ? '输入 Fal.ai LoRA path / Endpoint...'
                  : activeProvider === 'tensorart'
                  ? '输入 Tensor.Art / 吐司 Model ID (如 672390779613802167)...'
                  : '输入 Civitai ID (如 138944) 或 URN...'
              }
              id="custom-universal-lora-input"
              className="flex-1 bg-[#100d1c] border border-purple-800/50 rounded-lg px-3 py-1.5 text-xs text-purple-100 placeholder-purple-400/50 outline-none focus:border-purple-400 font-mono"
            />
            <button
              onClick={handleCustomUniversalLoraSubmit}
              className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs whitespace-nowrap shadow-sm"
            >
              动态解析并选用
            </button>
          </div>
        </div>

        {activeProvider === 'tensorart' && <TensorCatalogNotice />}
        {errorMsg && (
          <div className="px-6 py-2 bg-red-950/20 border-b border-red-800/20 text-red-300 text-xs flex items-center justify-between shrink-0 animate-in slide-in-from-top-1 duration-200">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-3 h-3 text-red-500" />
              <span>{errorMsg}</span>
            </div>
            <button 
              onClick={() => fetchModels(activeProvider, query, sort, selectedArch, false)}
              className="px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/30 text-red-200 text-[9px] font-bold border border-red-500/30 transition-colors"
            >
              重试 (Retry)
            </button>
          </div>
        )}

        {/* Models Grid */}
        <div className="flex-1 p-6 overflow-y-auto bg-[#141518]">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
              <p className="text-sm font-medium">正在从官方 API 实时检索云端 LoRA 模型库...</p>
            </div>
          ) : displayedModels.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 space-y-3">
              <Sparkles className="w-10 h-10 text-purple-400/40" />
              <div className="text-center">
                <p className="text-sm font-bold text-white">
                  暂未找到匹配的 LoRA 模型
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  请尝试清空筛选关键词、切换底模架构或直接在上方输入任意模型 ID 动态载入
                </p>
                {catalogNotice && (
                  <p className="text-[11px] text-amber-300/90 mt-2 max-w-md mx-auto leading-relaxed">
                    {catalogNotice}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {displayedModels.map((model) => {
                  const baseArch = model.baseModel || 'FLUX.1 / SDXL';
                  return (
                    <div
                      key={model.id}
                      className="bg-[#191a24] border border-[#2b2d3c] rounded-xl overflow-hidden hover:border-purple-500/60 transition-all flex flex-col group shadow-lg"
                    >
                      {/* Image Preview Container */}
                      <div className="relative aspect-[3/4] bg-[#0f1015] overflow-hidden">
                        {model.previewImg ? (
                          <img
                            src={model.previewImg}
                            alt={model.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 gap-2 p-4 text-center">
                            <Layers className="w-10 h-10 text-purple-400/40" />
                            <span className="text-[10px] text-slate-400 font-mono">官方原生 LoRA</span>
                            <span className="text-[9px] text-slate-500">直连官方仓库</span>
                          </div>
                        )}

                        {/* Top Badges */}
                        <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
                          <span
                            className={`text-[9px] px-2 py-0.5 rounded-full font-bold shadow-md ${
                              model.providerKey === 'civitai'
                                ? 'bg-blue-600/90 text-white'
                                : model.providerKey === 'huggingface'
                                ? 'bg-amber-600/90 text-white'
                                : model.providerKey === 'modelscope' || model.providerKey === 'modelscope_ai'
                                ? 'bg-red-600/90 text-white'
                                : 'bg-purple-600/90 text-white'
                            }`}
                          >
                            {model.provider}
                          </span>
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-black/75 backdrop-blur-md text-cyan-300 font-mono border border-cyan-500/30">
                            {baseArch}
                          </span>
                        </div>

                        {model.externalUrl && (
                          <a
                            href={model.externalUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-black/90 text-slate-300 hover:text-white transition-colors"
                            title="在官方页面中查看"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}

                        {/* Stats Bar */}
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-2.5 flex items-center justify-between text-[10px] text-slate-300">
                          <div className="flex items-center gap-2">
                            {model.rating !== undefined && model.rating > 0 && (
                              <span className="flex items-center gap-0.5 text-amber-400 font-bold">
                                <Star className="w-3 h-3 fill-amber-400" />
                                {model.rating.toFixed(1)}
                              </span>
                            )}
                            {model.downloadCount !== undefined && model.downloadCount > 0 && (
                              <span className="flex items-center gap-0.5 text-slate-300">
                                <Download className="w-3 h-3" />
                                {model.downloadCount > 1000
                                  ? `${(model.downloadCount / 1000).toFixed(1)}k`
                                  : model.downloadCount}
                              </span>
                            )}
                            {model.likes !== undefined && model.likes > 0 && (
                              <span className="flex items-center gap-0.5 text-rose-400">
                                <Heart className="w-3 h-3 fill-rose-400" />
                                {model.likes}
                              </span>
                            )}
                          </div>
                          <span className="text-slate-400 truncate max-w-[90px]">{model.creator}</span>
                        </div>
                      </div>

                      {/* Content Card Body */}
                      <div className="p-3 flex-1 flex flex-col justify-between space-y-2.5">
                        <div>
                          <h3 className="font-bold text-white text-xs line-clamp-1 group-hover:text-purple-300 transition-colors" title={model.name}>
                            {model.name}
                          </h3>
                          <p className="text-[10px] text-slate-400 font-mono truncate" title={model.id}>
                            ID: {model.id.replace('huggingface-', '').replace('civitai-', '').replace('modelscope-', '')}
                          </p>
                        </div>

                        {/* Trigger Words Section */}
                        <div className="bg-[#121319] p-2 rounded-lg border border-[#252735] space-y-1">
                          <div className="flex items-center justify-between text-[9px] text-slate-400">
                            <span>官方触发词 (TRIGGER WORDS):</span>
                            {model.triggerWords && (
                              <button
                                onClick={() => handleCopyTrigger(model.triggerWords)}
                                className="text-purple-400 hover:text-purple-300 flex items-center gap-0.5 transition-colors"
                              >
                                {copiedTrigger === model.triggerWords ? (
                                  <>
                                    <Check className="w-2.5 h-2.5 text-emerald-400" />
                                    <span className="text-emerald-400">已复制</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-2.5 h-2.5" />
                                    <span>复制</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                          <p className="text-[10px] text-purple-200/90 font-mono line-clamp-2 leading-relaxed break-words">
                            {model.triggerWords || '无需专用触发词 (提示词直接描述即可)'}
                          </p>
                        </div>

                        {/* Action buttons with Auto-pair Base Model */}
                        <div className="space-y-1.5 pt-1">
                          <button
                            onClick={() => {
                              const cleanName = model.providerKey==='civitai' ? `${model.name.replace(/\.safetensors$/i, '')}.safetensors` : (model.resourceId || model.id);
                              if (onSelectLoRAWithBaseModel) {
                                onSelectLoRAWithBaseModel({
                                  name: cleanName,
                                  provider: model.providerKey,
                                  civitaiId: model.civitaiId,
                                  triggerWords: model.triggerWords,
                                  baseModel: baseArch,
                                });
                              } else {
                                onSelectLoRA({
                                  name: cleanName,
                                  provider: model.providerKey,
                                  civitaiId: model.civitaiId,
                                  triggerWords: model.triggerWords,
                                  baseModel: baseArch,
                                });
                              }
                              onClose();
                            }}
                            className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-xs font-bold text-white transition-all shadow-md shadow-purple-600/30 flex items-center justify-center gap-1.5 active:scale-98"
                            title={`将此 LoRA 接入当前生成分支；保留已选底模，架构要求 ${baseArch}`}
                          >
                            <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                            <span>选用 LoRA · 保留当前底模</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/30 font-mono text-cyan-200">
                              {baseArch}
                            </span>
                          </button>

                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                onSelectLoRA({
                                  name: model.providerKey==='civitai' ? `${model.name.replace(/\.safetensors$/i, '')}.safetensors` : (model.resourceId || model.id),
                                  provider: model.providerKey,
                                  civitaiId: model.civitaiId,
                                  triggerWords: model.triggerWords,
                                  baseModel: baseArch,
                                });
                                onClose();
                              }}
                              className="flex-1 py-1.5 px-2 rounded-lg bg-[#242630] hover:bg-[#2e313e] text-[11px] font-semibold text-slate-300 transition-colors flex items-center justify-center gap-1 border border-[#353846]"
                              title="仅更新当前节点的 LoRA，不更改前置底模"
                            >
                              仅填入当前节点
                            </button>
                            <button
                              onClick={() => {
                                onAddLoRANodeToCanvas({
                                  name: model.providerKey==='civitai' ? `${model.name.replace(/\.safetensors$/i, '')}.safetensors` : (model.resourceId || model.id),
                                  provider: model.providerKey,
                                  civitaiId: model.civitaiId,
                                  triggerWords: model.triggerWords,
                                  baseModel: baseArch,
                                });
                                onClose();
                              }}
                              className="py-1.5 px-2.5 rounded-lg bg-[#242630] hover:bg-[#2e313e] text-[11px] font-semibold text-purple-300 hover:text-white transition-colors flex items-center gap-1 border border-[#353846]"
                              title="在画布上放置独立的 LoRALoader 节点"
                            >
                              <Plus className="w-3 h-3" />
                              <span>新建节点</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Load More Button Container */}
              {hasMore && (
                <div className="flex flex-col items-center justify-center py-6 gap-2 border-t border-[#252835]">
                  <button
                    onClick={() => fetchModels(activeProvider, query, sort, selectedArch, true)}
                    disabled={loadingMore}
                    className="px-8 py-3 rounded-xl bg-gradient-to-r from-purple-700 via-indigo-600 to-cyan-600 hover:from-purple-600 hover:to-cyan-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-purple-600/30 transition-all disabled:opacity-50 active:scale-95 cursor-pointer"
                  >
                    {loadingMore ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>正在从云端拉取更多 LoRA 模型...</span>
                      </>
                    ) : (
                      <>
                        <ArrowDown className="w-4 h-4" />
                        <span>加载更多 LoRA 模型 (当前已呈现 {displayedModels.length} 个)</span>
                      </>
                    )}
                  </button>
                  <p className="text-[10px] text-slate-500">
                    基于官方 API Cursor 分页无缝追加，直连 Civitai / Hugging Face / ModelScope 全库
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
