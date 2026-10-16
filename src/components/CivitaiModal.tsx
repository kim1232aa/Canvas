import { beginTraceOperation } from '../services/executionTrace';
import { getStoredApiKeys } from '../services/api';
import {TensorCatalogNotice} from './TensorCatalogNotice';
import {isCivitaiAir,selectionFromExplicitLoraUrl,selectionFromMetadata,verifiedSelectionOrExplicitIntent,verifyCivitaiSelection,type ResourceSelection} from '../utils/resourceSelection';
import {isLoraWeightResource} from '../utils/isLoraWeightResource';
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
import loraHubProviders from '../config/loraHubProviders.json';
import { identifyArchitectureFamily } from '../utils/baseModelMatcher';

/** What the catalog upstream actually answered (endpoint, HTTP status, body) — shown verbatim in empty / error states. */
export interface CatalogEvidence { /** Provider tab this evidence belongs to; rendered only under that tab. */ provider?: string; endpoint?: string; method?: string; status?: number | null; body?: string; noUpstreamCall?: boolean; message?: string }
export function catalogEvidenceFrom(liveData: any, prov: string): CatalogEvidence | null {
  const traces: any[] = Array.isArray(liveData?.executionTrace) ? liveData.executionTrace : [];
  const t = [...traces].reverse().find((x) => x && x.endpoint);
  const pag = liveData?._pagination?.[prov] || liveData?.pagination?.[prov];
  // Declared-absence of a LoRA catalog: show the notice, never a model-catalog URL as「来源」.
  if (!t && pag?.noLoraCatalog) {
    return { noUpstreamCall: true, message: typeof pag?.message === 'string' ? pag.message : '无 LoRA 目录接口' };
  }
  if (!t && !pag?.sourceUrl) return null;
  const body = t?.responseBody;
  if (!t) return { endpoint: pag?.sourceUrl, noUpstreamCall: true, message: typeof pag?.message === 'string' ? pag.message : undefined };
  // If backend marked no LoRA catalog, do not surface a model-catalog endpoint as LoRA source.
  if (pag?.noLoraCatalog) {
    return { noUpstreamCall: true, message: typeof pag?.message === 'string' ? pag.message : '无 LoRA 目录接口' };
  }
  return { endpoint: t?.endpoint || pag?.sourceUrl, method: t?.method || 'GET', status: typeof t?.status === 'number' ? t.status : null, body: body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body) };
}

/** Evidence is keyed by provider tab: another provider's endpoint never renders in this tab's empty state. */
export function evidenceForTab(ev: CatalogEvidence | null, activeProvider: string): CatalogEvidence | null {
  return ev && ev.provider === activeProvider ? ev : null;
}

export type LoraProviderFilter = 'all' | 'civitai' | 'huggingface' | 'modelscope' | 'modelscope_ai' | 'fal' | 'tensorart' | 'muapi' | 'wavespeed' | 'sogni' | 'krea' | 'together' | 'aimlapi' | 'novita' | 'venice' | 'runware' | 'modelslab' | 'replicate';

export interface UnifiedLoRAItem {
  id: string;
  /** Raw provider-side resource ID/URL without the `${provider}-` display prefix. */
  resourceId?: string;
  selection?: ResourceSelection;
  name: string;
  provider: 'Civitai' | 'Hugging Face' | 'ModelScope CN' | 'ModelScope AI' | 'Fal.ai' | 'Tensor.Art' | 'MuAPI' | 'WaveSpeed' | 'Sogni' | 'Runware' | 'ModelsLab' | 'Replicate';
  providerKey: LoraProviderFilter;
  baseModel: string | null;
  baseModelSource?: string;
  creator: string;
  rating?: number;
  downloadCount?: number;
  likes?: number;
  speed?: string;
  previewImg: string;
  previewCaption?: string;
  triggerWords: string;
  civitaiId?: string;
  externalUrl?: string;
  badge?: string;
}

export interface CivitaiModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectLoRA: (lora: ResourceSelection & {triggerWords:string}) => void;
  onAddLoRANodeToCanvas: (lora: ResourceSelection & {triggerWords:string}) => void;
  /** 「仅填入当前节点」: fill the current LoRA node only — never creates a node. */
  onFillCurrentLoRANode?: (lora: ResourceSelection & {triggerWords:string}) => void;
  onSelectLoRAWithBaseModel?: (lora: ResourceSelection & {triggerWords:string}) => void;
  initialProvider?: LoraProviderFilter;
}

/** Chips are built from the baseModel tags actually present on the loaded items of the active tab. */
export function architectureChipsFrom(items: Array<{ baseModel: string | null | undefined }>): Array<{ id: string; label: string }> {
  const tags = Array.from(new Set(items.map((m) => (m.baseModel || '').trim()).filter(Boolean))).sort();
  return [{ id: 'all', label: '全部' }, ...tags.map((t) => ({ id: t, label: t }))];
}

type CredentialReq = { kind: string; keyHeader?: string; storedKey?: string; notice: string; docUrl?: string };
/** Credential requirement declared per provider in src/config/loraHubProviders.json (generic). */
export const credentialRequirementFor = (provider: string): CredentialReq | undefined => (loraHubProviders as any).providers?.[provider]?.requiresCredential;
/** Custom-import capability comes from provider config data (src/config/loraHubProviders.json), never from provider-name branches. */
export function customImportFor(provider: string, config: { providers: Record<string, { supportsCustomImport?: boolean; idFormat?: string; placeholder?: string }> } = loraHubProviders): { hint: string; placeholder: string } | undefined {
  const d = config.providers[provider];
  return d?.supportsCustomImport && d.idFormat ? { hint: d.idFormat, placeholder: d.placeholder || '' } : undefined;
}

export const LORA_SEARCH_WATCHDOG_MS = 45_000;
/** Shown when a hub search has not settled in time — says plainly no upstream response arrived (no guessed cause). */
export function loraSearchWatchdogMessage(provider: string, ms: number): string {
  return `检索 ${Math.round(ms / 1000)} 秒仍未返回（服务商：${provider}）：未收到上游响应，已停止等待；未重试、未显示替代结果。可点「检索」重新发起，完整请求见执行记录。`;
}

export const CivitaiModal: React.FC<CivitaiModalProps> = ({
  isOpen,
  onClose,
  onSelectLoRA,
  onAddLoRANodeToCanvas,
  onFillCurrentLoRANode,
  onSelectLoRAWithBaseModel,
  initialProvider = 'all',
}) => {
  const [activeProvider, setActiveProvider] = useState<LoraProviderFilter>(initialProvider);
  const [query, setQuery] = useState('');
  const loraHubWasOpen = useRef(false);
  if (isOpen && !loraHubWasOpen.current) beginTraceOperation('打开 LoRA Hub');
  loraHubWasOpen.current = isOpen;
  const [sort, setSort] = useState('Highest Rated');
  const [selectedArch, setSelectedArch] = useState<string>('all');
  const [credentialPresent, setCredentialPresent] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const req = credentialRequirementFor(activeProvider);
    if (!isOpen || !req) return;
    let stored = '';
    try { stored = req.storedKey ? String((getStoredApiKeys() as any)[req.storedKey] || '') : ''; } catch { /* no stored keys */ }
    fetch(`/api/credential-presence?kind=${encodeURIComponent(req.kind)}`, { headers: stored && req.keyHeader ? { [req.keyHeader]: stored } : {} })
      .then((r) => r.json()).then((d) => setCredentialPresent((p) => ({ ...p, [req.kind]: d?.present === true })))
      .catch(() => setCredentialPresent((p) => ({ ...p, [req.kind]: false })));
  }, [isOpen, activeProvider]);
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
  const [catalogEvidence, setCatalogEvidence] = useState<CatalogEvidence | null>(null);
  const activeReqIdRef = useRef(0);

  // clean-0942: one LoRA catalog GET per URL per open (StrictMode / repeated effects share it; failures retry).
  const catalogMemo = useRef(new Map<string, ReturnType<typeof fetchLiveModels>>());
  const wasOpen = useRef(false);
  if (isOpen && !wasOpen.current) catalogMemo.current = new Map();
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
      // New query (incl. provider switch): previous provider's empty-state evidence must not linger.
      setCatalogNotice(null);
      setCatalogEvidence(null);
    }
    setErrorMsg(null);
    try {
      const items: UnifiedLoRAItem[] = [];
      const archQuery = ''; // architecture chips filter loaded items locally (built from their real tags)

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
              const rawBase = latest?.baseModel?.trim() || null;
              const fam = identifyArchitectureFamily(rawBase || '', m.name);

              let selection:ResourceSelection|undefined;
              try {selection=selectionFromMetadata('civitai',m,'lora');}catch{/* Catalog entries with incomplete metadata remain explicitly unverified. */}
              items.push({
                selection,
                id: `civitai-${m.id}`,
                name: m.name,
                provider: 'Civitai',
                providerKey: 'civitai',
                baseModel: rawBase,
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
        const liveData = await catalogOncePerOpen(
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
        // Out-of-order guard: a slower response for an earlier provider/query must not overwrite current state.
        if (currentReqId !== activeReqIdRef.current) return;

        const pag = liveData._pagination || {};
        const noticeEntry = Object.entries(liveData as Record<string, unknown>).find(([k, v]) => (k === 'catalogNotice' || k.endsWith('Notice')) && typeof v === 'string');
        setCatalogNotice(noticeEntry ? (noticeEntry[1] as string) : null);
        const ev = catalogEvidenceFrom(liveData, prov);
        setCatalogEvidence(ev ? { ...ev, provider: prov } : null);
        if (pag.huggingface?.nextCursor) {
          setHfCursor(pag.huggingface.nextCursor);
        } else if (prov === 'huggingface') {
          setHasMore(false);
        }
        // Generic upstream-cursor paging (e.g. Krea GET /styles next_cursor): use exactly what upstream returned.
        if (prov !== 'huggingface' && prov !== 'all' && (pag as any)[prov]?.paging === 'upstream-cursor') {
          setHfCursor((pag as any)[prov].nextCursor || '');
          setHasMore(Boolean((pag as any)[prov].nextCursor));
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

        const sourceMap: Record<string, any> = (liveData as any).results && typeof (liveData as any).results === 'object' && !Array.isArray((liveData as any).results)
          ? { ...liveData, ...(liveData as any).results }
          : liveData;

        Object.entries(sourceMap).forEach(([provKey, list]) => {
          if (provKey === '_pagination' || provKey === 'pagination' || provKey === 'catalogNotices' || provKey === 'errors' || provKey === 'results') return;
          if (Array.isArray(list)) {
            list.forEach((m: any) => {
              // Prefer metadata; Fal/schema endpoint catalogs with "lora" in id are gen models, not weights.
              const isLoraItem = isLoraWeightResource(m, provKey);

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
                  provKey === 'krea' ? 'Krea' :
                  provKey === 'together' ? 'Together' :
                  provKey === 'aimlapi' ? 'AIMLAPI' :
                  provKey === 'novita' ? 'Novita' :
                  provKey === 'venice' ? 'Venice' :
                  provKey === 'runware' ? 'Runware' :
                  provKey === 'modelslab' ? 'ModelsLab' :
                  provKey === 'replicate' ? 'Replicate' :
                  (provKey === 'tensorart' || provKey === 'tensor') ? 'Tensor.Art' : 'Civitai';
                
                // Avoid duplicating civitai items already fetched
                if (provKey === 'civitai' && items.some((it) => it.id === `civitai-${m.id}`)) return;

                const normalizedProvKey: LoraProviderFilter =
                  ['huggingface','modelscope','modelscope_ai','fal','muapi','wavespeed','sogni','krea','together','aimlapi','novita','venice','runware','modelslab','replicate','tensorart','tensor'].includes(provKey)
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
                    : provKey === 'runware'
                    ? (typeof m.air === 'string' && m.air.startsWith('civitai:') ? `https://civitai.com/models/${m.air.split(':')[1]?.split('@')[0]}` : 'https://runware.ai')
                    : provKey === 'modelslab'
                    ? `https://modelslab.com/models/${m.id}`
                    : provKey === 'civitai'
                    ? `https://civitai.com/models/${m.id}`
                    : undefined;

                const triggerStr = Array.isArray(m.trainedWords) && m.trainedWords.length > 0
                  ? m.trainedWords.join(', ')
                  : (m.triggers || '');

                let selection:ResourceSelection|undefined;
                try {
                  selection=selectionFromMetadata(normalizedProvKey,m,'lora');
                } catch {
                  selection = {
                    name: String(m.id || m.name || ''),
                    provider: normalizedProvKey,
                    triggerWords: triggerStr,
                    baseModel: m.baseModel || m.family,
                    resourceVerified: false,
                    resource_source: normalizedProvKey,
                    resource_kind: 'lora',
                  };
                }
                items.push({
                  selection,
                  id: `${provKey}-${m.id}`,
                  resourceId: String(m.id),
                  name: m.name || m.id,
                  provider: pName as any,
                  providerKey: normalizedProvKey,
                  baseModel: m.baseModel || '',
                  baseModelSource: m.baseModelSource,
                  creator: m.creator || m.author || pName,
                  rating: typeof m.rating === 'number' && m.rating > 0 ? m.rating : undefined,
                  downloadCount: typeof m.downloads === 'number' && m.downloads > 0 ? m.downloads : undefined,
                  likes: typeof m.likes === 'number' && m.likes > 0 ? m.likes : undefined,
                  speed: m.speed,
                  previewImg: m.imageUrl || '',
                  previewCaption: m.imageCaption ? `${pName} 官方示例 · 强度 ${m.imageCaption}` : undefined,
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
        setCatalogEvidence(err?.status != null || err?.endpoint ? { provider: prov, endpoint: err.endpoint, status: err.status ?? null, body: typeof err.rawResponse === 'string' ? err.rawResponse : err.rawResponse != null ? JSON.stringify(err.rawResponse) : undefined } : null);
      }
    } finally {
      if (currentReqId === activeReqIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  // Esc closes the hub (capture phase so inner inputs that stop propagation cannot swallow it).
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isOpen, onClose]);

  // The spinner must always resolve: a search that has not settled after LORA_SEARCH_WATCHDOG_MS ends with an explicit,
  // honest client-side message (no upstream response received) instead of spinning forever. No retry, no substitute data.
  useEffect(() => {
    if (!loading) return;
    const reqId = activeReqIdRef.current;
    const t = setTimeout(() => {
      if (reqId !== activeReqIdRef.current) return;
      activeReqIdRef.current += 1; // a late reply for this search is ignored, never shown as this search's result
      setLoading(false);
      setLoadingMore(false);
      setErrorMsg(loraSearchWatchdogMessage(activeProvider, LORA_SEARCH_WATCHDOG_MS));
    }, LORA_SEARCH_WATCHDOG_MS);
    return () => clearTimeout(t);
  }, [loading, activeProvider]);

  useEffect(() => {
    if (isOpen) {
      fetchModels(activeProvider, query, sort, selectedArch, false);
    }
  }, [isOpen, activeProvider]);

  // Evidence is keyed by provider tab: never show another provider's endpoint in this tab's empty state.
  const shownEvidence = evidenceForTab(catalogEvidence, activeProvider);
  // Declared no LoRA catalog for this tab: searching cannot return anything, so search controls are disabled with the reason.
  const noCatalog = shownEvidence?.noUpstreamCall === true && !shownEvidence.endpoint;
  const noCatalogReason = noCatalog ? `该服务商无 LoRA 目录接口，检索不可用：${shownEvidence?.message || '无 LoRA 目录接口'}` : undefined;

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

    const isCivitaiAirInput = isCivitaiAir(rawVal);
    if (isCivitaiAirInput || ((activeProvider === 'civitai' || activeProvider === 'all') && /^\d+(?:@\d+)?$/.test(rawVal) && rawVal.length < 15)) {
      if (activeProvider !== 'civitai' && activeProvider !== 'all') {
        setErrorMsg('Civitai AIR 只能挂到 Civitai 执行分支；请先切换到 Civitai 标签。');
        return;
      }
      try {
        setLoading(true);
        const selection=await verifyCivitaiSelection(rawVal,'lora');
        onSelectLoRA({...selection,triggerWords:selection.triggerWords || ''});
        onClose();
      } catch(error:any) {setErrorMsg(error.message);} finally {setLoading(false);}
      return;
    }

    const isHttpUrl = /^https?:\/\//i.test(rawVal);
    if (isHttpUrl) {
      if (activeProvider === 'all') {
        setErrorMsg('URL 不携带执行供应商信息；请先切换到实际执行供应商标签，再导入该 LoRA URL。');
        return;
      }
      // Explicit weight URL ≡ typing the same URL into LoRALoader — do not force unresolved.
      // Strength is intentionally omitted (never invent 0.8); run still requires explicit strength.
      try {
        onSelectLoRA({...selectionFromExplicitLoraUrl(activeProvider, rawVal), triggerWords: ''});
      } catch (error: any) {
        setErrorMsg(error.message);
        return;
      }
      onClose();
      return;
    }

    // A user-entered HF repo ID is explicit LoRA intent. Hub tags are evidence, not an exhaustive adapter contract.
    if (activeProvider === 'huggingface' || (rawVal.includes('/') && !rawVal.includes('tensor.art') && !rawVal.includes('tusiart.com'))) {
      try {
        setLoading(true);
        const info = await fetchHuggingFaceModelInfo(rawVal);
        const triggerStr = Array.isArray(info.triggerWords) && info.triggerWords.length > 0
          ? info.triggerWords.join(', ')
          : '';
        onSelectLoRA({
          provider: activeProvider === 'all' ? 'huggingface' : activeProvider,
          name: info.id || rawVal,
          civitaiId: undefined,
          triggerWords: triggerStr,
          baseModel: info.baseModel || undefined,
          ...verifiedSelectionOrExplicitIntent(activeProvider === 'all' ? 'huggingface' : activeProvider,info),
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
        const resource={...selectionFromMetadata('tensorart',info,'lora'),triggerWords:triggerStr,baseModel:baseArch};
        if (onSelectLoRAWithBaseModel) onSelectLoRAWithBaseModel(resource);
        else onSelectLoRA(resource);
        onClose();
        return;
      } catch (e: any) {
        setErrorMsg(`${e.message}\n${e.stack || ''}`);
        return;
      } finally {
        setLoading(false);
      }
    }

    if (activeProvider === 'muapi' || activeProvider === 'wavespeed') {
      setErrorMsg(`${activeProvider === 'muapi' ? 'MuAPI' : 'WaveSpeed'} 当前没有已核实的 LoRA 权重目录；请粘贴目标端点实际可读取的 HTTP(S) LoRA URL。`);
      return;
    }
    if (activeProvider === 'venice' || activeProvider === 'together') {
      // No FE hard-block: support status comes only from the server provider table
      // (local block → 「本地拦截 · 未发请求」 + history card; 待确认 → sent verbatim).
      onSelectLoRA({provider:activeProvider,name:rawVal,civitaiId:undefined,triggerWords:'',baseModel:undefined});
      onClose();
      return;
    }
    if (activeProvider === 'novita') {
      // Official request.loras[].model_name = sd_name_in_api from GET /v3/model?filter.types=lora
      onSelectLoRA({provider:'novita',name:rawVal,civitaiId:undefined,triggerWords:'',baseModel:undefined});
      onClose();
      return;
    }
    if (activeProvider === 'aimlapi') {
      // Official loras[].path accepts HuggingFace owner/repo or weight URL.
      onSelectLoRA({provider:'aimlapi',name:rawVal,civitaiId:undefined,triggerWords:'',baseModel:undefined});
      onClose();
      return;
    }
    if (activeProvider === 'krea') {
      // Manual entry = Krea style ID from GET /styles (official LoRA field styles[].id).
      onSelectLoRA({provider:'krea',name:rawVal,civitaiId:undefined,triggerWords:'',baseModel:undefined});
      onClose();
      return;
    }
    if (activeProvider === 'sogni') {
      onSelectLoRA({provider:'sogni',name:rawVal,civitaiId:undefined,triggerWords:'',baseModel:undefined});
      onClose();
      return;
    }
    if (activeProvider === 'runware') {
      const civitaiMatch = rawVal.startsWith('civitai:') ? rawVal.split(':')[1]?.split('@')[0] : undefined;
      onSelectLoRA({
        provider: 'runware',
        name: rawVal,
        civitaiId: civitaiMatch,
        triggerWords: '',
        baseModel: undefined,
        resourceVerified: false,
        resource_source: 'runware',
        resource_kind: 'lora',
      });
      onClose();
      return;
    }
    if (activeProvider === 'modelslab') {
      onSelectLoRA({
        provider: 'modelslab',
        name: rawVal,
        civitaiId: undefined,
        triggerWords: '',
        baseModel: undefined,
        resourceVerified: false,
        resource_source: 'modelslab',
        resource_kind: 'lora',
      });
      onClose();
      return;
    }
    if (activeProvider === 'replicate') {
      onSelectLoRA({
        provider: 'replicate',
        name: rawVal,
        civitaiId: /^\d+$/.test(rawVal) ? rawVal : undefined,
        triggerWords: '',
        baseModel: undefined,
        resourceVerified: false,
        resource_source: 'replicate',
        resource_kind: 'lora',
      });
      onClose();
      return;
    }
    if (activeProvider === 'all') {
      setErrorMsg('无法从任意字符串可靠判断 LoRA 所属供应商；请先选择具体供应商标签。');
      return;
    }

    const isCivitaiId = /^\d+$/.test(rawVal);
    const modelName = rawVal.includes('/') ? rawVal.split('/').pop()! : rawVal;
    onSelectLoRA({
      name: `[${activeProvider.toUpperCase()}] ${modelName}`,
      provider: activeProvider,
      civitaiId: isCivitaiId ? rawVal : undefined,
      triggerWords: '',
      baseModel: undefined,
    });
    onClose();
  };

  const displayedModels = models.filter((model) => {
    if (activeProvider !== 'all' && model.providerKey !== activeProvider) return false;
    return selectedArch === 'all' || (model.baseModel || '').trim() === selectedArch;
  });
  const architectureChips = architectureChipsFrom(models.filter((m) => activeProvider === 'all' || m.providerKey === activeProvider));
  const credentialReq = credentialRequirementFor(activeProvider);
  // Missing declared credential → no cards, no import/mount controls; only the notice.
  const credentialMissing = !!credentialReq && credentialPresent[credentialReq.kind] !== true;
  const customImport = credentialMissing ? undefined : customImportFor(activeProvider);

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
                聚合 Civitai / Hugging Face / ModelScope / Tensor.Art 等可检索目录；Fal.ai 无独立公开 LoRA 权重库，需手输权重 URL 或直链。支持架构筛选与翻页
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
        <div className="px-6 pt-3 pb-2 bg-[#15161d] border-b border-[#242630] flex flex-wrap items-center gap-x-2 gap-y-1 shrink-0 min-h-[46px]" data-testid="lora-hub-tabs">
          {[
            { id: 'all', name: '全生态聚合' },
            { id: 'civitai', name: 'Civitai (C站社区)' },
            { id: 'huggingface', name: 'Hugging Face (开源库)' },
            { id: 'modelscope', name: '魔搭 CN (国内站)' },
            { id: 'modelscope_ai', name: '魔搭 AI (国际站)' },
            { id: 'fal', name: 'Fal.ai (云端端点)' },
            { id: 'tensorart', name: 'Tensor.Art (吐司)' },
            { id: 'muapi', name: 'MuAPI' },
            { id: 'wavespeed', name: 'WaveSpeed' },
            { id: 'sogni', name: 'Sogni' },
            { id: 'krea', name: 'Krea' },
            { id: 'together', name: 'Together' },
            { id: 'aimlapi', name: 'AIMLAPI' },
            { id: 'novita', name: 'Novita' },
            { id: 'venice', name: 'Venice' },
            { id: 'runware', name: 'Runware' },
            { id: 'modelslab', name: 'ModelsLab' },
            { id: 'replicate', name: 'Replicate' },
          ].map((tab) => {
            const isActive = activeProvider === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setModels([]);
                  setSelectedArch('all');
                  // Switching tabs: the [isOpen, activeProvider] effect fetches once. Re-click on the active tab: refetch explicitly.
                  if (tab.id === activeProvider) fetchModels(tab.id as any, query, sort, 'all', false);
                  else setActiveProvider(tab.id as any);
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
        <div className="px-6 py-2 bg-[#121319] border-b border-[#20222d] flex items-center gap-2 overflow-x-auto shrink-0 scrollbar-thin scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20">
          <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1 shrink-0 mr-1">
            <Filter className="w-3.5 h-3.5 text-purple-400" />
            底模架构筛选:
          </span>
          {architectureChips.map((tag) => {
            const isSelected = selectedArch === tag.id;
            return (
              <button
                key={tag.id}
                onClick={() => {
                  setSelectedArch(tag.id);
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
            {noCatalog
              ? <span data-testid="lora-hub-count">未请求上游目录 · 0 个 LoRA</span>
              : <span data-testid="lora-hub-count">已检索到 <span className="text-purple-400 font-bold">{displayedModels.length}</span> 个 LoRA</span>}
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
              onKeyDown={(e) => e.key === 'Enter' && !noCatalog && fetchModels(activeProvider, query, sort, selectedArch, false)}
              disabled={noCatalog}
              title={noCatalogReason}
              data-testid="lora-hub-search-input"
              placeholder="跨引擎检索 LoRA (如: Cyberpunk, Ghibli, Detail, Face, Armor, Realistic, Anime, Wan)..."
              className="w-full bg-[#111216] border border-[#2b2d38] focus:border-cyan-500 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 outline-none font-mono disabled:bg-[#1a1b20] disabled:text-slate-500 disabled:placeholder-slate-600 disabled:border-slate-700 disabled:cursor-not-allowed"
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
            <option value="Highest Rated">最高评分 (Highest Rated)</option>
            <option value="Most Downloaded">最多下载 (Most Downloaded)</option>
            <option value="Most Liked">最多点赞 (Most Liked)</option>
            <option value="Newest">最新发布 (Newest)</option>
            <option value="Name A-Z">名称排序 (A → Z)</option>
          </select>

          <button
            onClick={() => fetchModels(activeProvider, query, sort, selectedArch, false)}
            disabled={loading || noCatalog}
            title={noCatalogReason}
            data-testid="lora-hub-search-button"
            aria-disabled={loading || noCatalog}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-xs font-bold text-white flex items-center gap-1.5 shadow-md shadow-purple-600/20 transition-all disabled:opacity-50 shrink-0 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-400 disabled:shadow-none disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            <span>实时检索</span>
          </button>
        </div>

        {/* Custom import bar: shown only when the provider declares a custom-import capability */}
        {customImport && (
        <div className="px-6 py-2.5 bg-[#171424] border-b border-purple-900/40 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-purple-300">
            <Zap className="w-4 h-4 text-purple-400 shrink-0" />
            <span>
              <strong>自定义/任意 LoRA 动态导入：</strong>
              {customImport.hint}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <input
              type="text"
              placeholder={customImport.placeholder}
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
        )}

        {activeProvider === 'tensorart' && (
          <div className="px-6 pt-3">
            <TensorCatalogNotice />
          </div>
        )}
        {activeProvider === 'sogni' && (
          <div className="px-6 pt-3">
            <div className="rounded-lg border border-purple-800/40 bg-purple-950/25 p-3 text-xs leading-relaxed text-purple-200">
              <p className="font-semibold text-purple-300">Sogni 官方 LoRA 目录说明：</p>
              <p className="text-slate-300 mt-1">
                Sogni 官方公开目录（<code>/v1/loras/comfy</code>）收录的 LoRA 为 Krea-2 专用参数调节滑块（如画质增强、景深复杂度、暮光质感等）。上游文档在评测时统一使用标准测试场景（黄色长裙行人基准图）进行控制变量采样，卡片预览图为官方在不同强度下的调节效果对照帧，非独立艺术海报；无示例的模型已真实标注为 [上游目录未提供封面]。
              </p>
            </div>
          </div>
        )}
        {activeProvider === 'fal' && (
          <div className="px-6 pt-3">
            <div className="rounded-lg border border-amber-800/40 bg-amber-950/25 p-3 text-xs leading-relaxed text-amber-200">
              <p className="font-semibold text-amber-300">Fal.ai 目录类型说明：</p>
              <p className="text-slate-300 mt-1">
                Fal.ai 官方模型目录仅列出云端推理端点（如文生图、图生图生成器），无独立的公开 LoRA 权重库。若需使用特定 LoRA，请在上方输入 LoRA 权重 URL 或 Civitai/HF 直链，并在底模中心选用支持加载 LoRA 的 Fal 基础端点。
              </p>
            </div>
          </div>
        )}
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
        <div className="flex-1 p-6 pb-24 overflow-y-auto bg-[#141518] scrollbar-thin scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20">
          {credentialMissing ? (
            <div className="h-64 flex flex-col items-center justify-center gap-2 text-slate-300 text-sm" data-testid="hub-credential-missing">
              <p>{credentialReq!.notice}</p>
              {credentialReq!.docUrl && <a href={credentialReq!.docUrl} target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline text-xs">官方说明 ↗</a>}
            </div>
          ) : loading ? (
            <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
              <p className="text-sm font-medium">正在从官方 API 实时检索云端 LoRA 模型库...</p>
            </div>
          ) : displayedModels.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 space-y-3">
              <Sparkles className="w-10 h-10 text-purple-400/40" />
              <div className="text-center">
                <p className="text-sm font-bold text-white" data-testid="lora-hub-empty-conclusion">
                  {shownEvidence?.noUpstreamCall
                    ? `未请求上游目录（0 个 LoRA）：${shownEvidence.message || '无 LoRA 目录接口'}${shownEvidence.endpoint ? `（来源：${shownEvidence.endpoint}）` : ''}`
                    : shownEvidence
                    ? `${shownEvidence.method || 'GET'} ${shownEvidence.endpoint || '（未记录端点）'} → ${shownEvidence.status != null ? `HTTP ${shownEvidence.status}` : '无上游状态码'}，返回 0 个 LoRA`
                    : '暂未找到匹配的 LoRA 模型（本次未记录上游请求）'}
                </p>
                {shownEvidence?.body && (
                  <details className="mt-2 max-w-xl mx-auto text-left">
                    <summary className="cursor-pointer text-[11px] text-slate-300">上游原文（原样）</summary>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all text-[10px] text-slate-400" data-testid="lora-hub-empty-body">{shownEvidence.body}</pre>
                  </details>
                )}
                {noCatalog ? (
                  <p className="text-[11px] text-slate-400 mt-2" data-testid="lora-hub-empty-subtext">检索与筛选对该服务商无效（无目录可查）；如需 LoRA，请换有 LoRA 目录的服务商。</p>
                ) : (
                  <p className="text-[11px] text-slate-500 mt-2" data-testid="lora-hub-empty-subtext">
                    请尝试清空筛选关键词、切换底模架构或直接在上方输入任意模型 ID 动态载入
                  </p>
                )}
                {catalogNotice && !(shownEvidence?.noUpstreamCall && shownEvidence?.message && catalogNotice.includes(shownEvidence.message.split('。')[0])) && (
                  <p className="text-[11px] text-amber-300/90 mt-2 max-w-md mx-auto leading-relaxed" data-testid="lora-hub-catalog-notice">
                    {catalogNotice}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {displayedModels.map((model) => {
                  const baseArch = model.baseModel || '底模未标注';
                  const externalTitle = (() => {
                    if (!model.externalUrl) return '';
                    try {
                      const url = new URL(model.externalUrl);
                      if (url.hostname.includes('civitai.com')) {
                        return model.providerKey === 'sogni'
                          ? `Sogni 上游来源出处 (Civitai: ${model.creator || '原作者'})`
                          : `在 Civitai 中查看 (${model.name})`;
                      }
                      if (url.hostname.includes('huggingface.co')) return '在 Hugging Face 中查看';
                      if (url.hostname.includes('modelscope.cn')) return '在 ModelScope 中查看';
                      if (url.hostname.includes('tensor.art')) return '在 Tensor.Art 中查看';
                      return `在官方页面中查看 (${url.hostname})`;
                    } catch {
                      return '在官方页面中查看';
                    }
                  })();
                  return (
                    <div
                      key={model.id}
                      className="bg-[#191a24] border border-[#2b2d3c] rounded-xl overflow-hidden hover:border-purple-500/60 transition-all flex flex-col group shadow-lg"
                    >
                      {/* Image Preview Container */}
                      <div className="relative aspect-[3/4] bg-[#0f1015] overflow-hidden">
                        {model.previewImg ? (
                          <>
                            <img
                              src={model.previewImg}
                              alt={model.name}
                              title={model.previewCaption}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              loading="lazy"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-[#191a24]/90 via-transparent to-black/35 pointer-events-none" />
                            {model.previewCaption && (
                              <span className="absolute bottom-2 left-2 text-[9px] px-1.5 py-0.5 rounded bg-black/70 text-slate-300">{model.previewCaption}</span>
                            )}
                          </>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 gap-2 p-4 text-center">
                            <Layers className="w-10 h-10 text-purple-400/40" />
                            <span className="text-[10px] text-slate-400 font-mono">上游目录未提供封面</span>
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
                          <span title={model.baseModelSource ? `兼容模型：${baseArch}（来源：${model.baseModelSource}）` : undefined} className="text-[9px] px-2 py-0.5 rounded-full bg-black/75 backdrop-blur-md text-cyan-300 font-mono border border-cyan-500/30">
                            {model.baseModelSource ? `兼容模型：${baseArch}` : baseArch}
                          </span>
                        </div>

                        {model.externalUrl && (
                          <a
                            href={model.externalUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-black/90 text-slate-300 hover:text-white transition-colors"
                            title={externalTitle || '在官方页面中查看'}
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
                          <span className="text-slate-400 truncate max-w-[90px]" title={model.creator}>{model.creator}</span>
                        </div>
                      </div>

                      {/* Content Card Body */}
                      <div className="p-3.5 pb-4 flex-1 flex flex-col justify-between space-y-2.5">
                        <div>
                          <h3 className="font-bold text-white text-xs line-clamp-1 group-hover:text-purple-300 transition-colors" title={model.name}>
                            {model.name}
                          </h3>
                          <p className="text-[10px] text-slate-400 font-mono truncate" title={model.selection?.name || model.resourceId || model.id}>
                            {/* Show the identifier that is actually sent (upstream raw id), never the internal namespaced key */}
                            ID: {model.selection?.name || model.resourceId || model.id}
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
                          <p className="text-[10px] text-purple-200/90 font-mono line-clamp-2 leading-relaxed break-words" title={model.triggerWords || undefined}>
                            {model.triggerWords || '上游目录未提供触发词'}
                          </p>
                        </div>

                        {/* Action buttons with Auto-pair Base Model */}
                        <div className="space-y-1.5 pt-1">
                          {(() => {
                            const cleanName = model.resourceId || model.selection?.name || (model.civitaiId ? String(model.civitaiId) : model.id.replace(new RegExp(`^${model.providerKey}-`), ''));
                            return (
                              <>
                                <button
                                  onClick={() => {
                                    if (onSelectLoRAWithBaseModel) {
                                      onSelectLoRAWithBaseModel({
                                        ...(model.selection || {}),
                                        name: cleanName,
                                        provider: model.selection?.provider || (model.providerKey as any),
                                        civitaiId: model.civitaiId,
                                        triggerWords: model.triggerWords,
                                        baseModel: model.baseModel || undefined,
                                      });
                                    } else {
                                      onSelectLoRA({
                                        ...(model.selection || {}),
                                        name: cleanName,
                                        provider: model.selection?.provider || (model.providerKey as any),
                                        triggerWords: model.triggerWords,
                                        baseModel: model.baseModel || undefined,
                                      });
                                    }
                                    onClose();
                                  }}
                                  className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-xs font-bold text-white transition-all shadow-md shadow-purple-600/30 flex items-center justify-center gap-1.5 active:scale-98"
                                  title={`将此 LoRA 接入当前生成分支；保留已选底模，架构要求 ${baseArch}`}
                                >
                                  <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                                  <span>选用 LoRA</span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/40 font-mono text-cyan-200">
                                    兼容 {baseArch}
                                  </span>
                                </button>

                                <div className="flex gap-2">
                                  <button
                                    onClick={() => {
                                      (onFillCurrentLoRANode || onSelectLoRA)({
                                        ...(model.selection || {}),
                                        name: cleanName,
                                        provider: model.selection?.provider || model.providerKey,
                                        civitaiId: model.selection?.civitaiId || model.civitaiId,
                                        triggerWords: model.triggerWords,
                                        baseModel: model.baseModel || undefined,
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
                                        ...(model.selection || {}),
                                        name: cleanName,
                                        provider: model.selection?.provider || model.providerKey,
                                        civitaiId: model.selection?.civitaiId || model.civitaiId,
                                        triggerWords: model.triggerWords,
                                        baseModel: model.baseModel || undefined,
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
                              </>
                            );
                          })()}
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