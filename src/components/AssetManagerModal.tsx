import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  FolderOpen,
  Image as ImageIcon,
  Video,
  Download,
  Trash2,
  Copy,
  Check,
  Search,
  Plus,
  Play,
  Maximize2,
  Upload,
  Sparkles,
  Clock,
  Layers,
  ExternalLink,
  Film,
  RefreshCw,
  Sliders,
  Eye,
  X,
  FileUp,
  Cpu,
  ArrowUpDown,
  Filter,
  Star,
  CheckSquare,
  Square,
  Share2,
  Info,
  Ratio,
  Bookmark,
  FileText,
} from 'lucide-react';
import { GenerationHistoryItem } from '../types/providers';
import { displayValue } from './HistoryModal';

export interface MediaAsset {
  id: string;
  url: string;
  type: 'image' | 'video';
  title?: string;
  prompt: string;
  negativePrompt?: string;
  provider: string;
  model: string;
  timestamp: number;
  width?: number;
  height?: number;
  seed?: number | null;
  steps?: number | null;
  cfg?: number | null;
  sampler?: string;
  scheduler?: string;
  loras?: Array<{ name: string; strength?: number }>;
  isReference?: boolean;
}

interface AssetManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: GenerationHistoryItem[];
  onAddToCanvasAsFrame: (asset: MediaAsset) => void;
  onAddNodeFromAsset?: (asset: MediaAsset) => void;
  onUseAsReference: (asset: MediaAsset) => void;
  onApplyParameters?: (asset: MediaAsset) => void;
  onPreviewImage: (url: string) => void;
  onDeleteAsset: (id: string, url?: string) => void;
  onDeleteBatchAssets?: (ids: string[]) => void;
  onRefreshHistory?: () => void;
  onClearAllHistory?: () => void;
}

export const AssetManagerModal: React.FC<AssetManagerModalProps> = ({
  isOpen,
  onClose,
  history,
  onAddToCanvasAsFrame,
  onAddNodeFromAsset,
  onUseAsReference,
  onApplyParameters,
  onPreviewImage,
  onDeleteAsset,
  onDeleteBatchAssets,
  onRefreshHistory,
  onClearAllHistory,
}) => {
  const [activeType, setActiveType] = useState<'all' | 'image' | 'video' | 'reference' | 'starred'>('all');
  const [selectedProvider, setSelectedProvider] = useState<string>('all');
  const [selectedRatio, setSelectedRatio] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'model' | 'provider'>('newest');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isBatchDownloading, setIsBatchDownloading] = useState(false);

  // Multi-select state
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);

  // Starred / Favorite assets persisted in localStorage
  const [starredIds, setStarredIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('comfycanvas_starred_assets_v2');
      if (raw) return new Set(JSON.parse(raw));
    } catch (e) {}
    return new Set();
  });

  // Persistent user uploads
  const [customUploads, setCustomUploads] = useState<MediaAsset[]>(() => {
    try {
      const raw = localStorage.getItem('comfycanvas_user_assets_v2');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return [];
  });

  // Persistent deleted ID blacklist so deleted assets never ghost-reappear
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('comfycanvas_deleted_assets_v2');
      if (raw) return new Set(JSON.parse(raw));
    } catch (e) {}
    return new Set();
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem('comfycanvas_user_assets_v2', JSON.stringify(customUploads));
    } catch (e) {}
  }, [customUploads]);

  useEffect(() => {
    try {
      localStorage.setItem('comfycanvas_starred_assets_v2', JSON.stringify(Array.from(starredIds)));
    } catch (e) {}
  }, [starredIds]);

  useEffect(() => {
    try {
      localStorage.setItem('comfycanvas_deleted_assets_v2', JSON.stringify(Array.from(deletedIds)));
    } catch (e) {}
  }, [deletedIds]);

  // Convert history items + user uploads into unified MediaAsset list
  const allAssets: MediaAsset[] = useMemo(() => {
    const historyAssets: MediaAsset[] = history
      .filter((item) => Boolean(item.url || item.imageUrl))
      .map((item, idx) => {
        const url = item.url || item.imageUrl || '';
        const isVid =
          item.mediaType === 'video' ||
          url.endsWith('.mp4') ||
          url.endsWith('.webm') ||
          item.model?.toLowerCase().includes('video') ||
          item.provider?.toLowerCase().includes('video');
        return {
          id: item.id || `hist-${idx}-${item.timestamp || Date.now()}`,
          url,
          type: isVid ? 'video' : 'image',
          title: item.model ? `${item.model.split('/').pop()} 产物` : undefined,
          prompt: item.prompt || '',
          negativePrompt: item.negativePrompt || '',
          provider: item.provider || '',
          model: item.model || '',
          timestamp: item.timestamp || Date.now() - idx * 60000,
          width: item.width || 1024,
          height: item.height || 1024,
          seed: item.seed,
          steps: item.steps,
          cfg: item.cfg,
          sampler: item.sampler || undefined,
          scheduler: item.scheduler || undefined,
          loras: item.loras?.map((l) => (typeof l === 'string' ? { name: l } : l)),
        };
      });

    return [...customUploads, ...historyAssets].filter(
      (asset) => !deletedIds.has(asset.id) && !deletedIds.has(asset.url)
    );
  }, [history, customUploads, deletedIds]);

  // Filtering & Sorting
  const filteredAssets = useMemo(() => {
    return allAssets
      .filter((asset) => {
        if (activeType === 'image' && asset.type !== 'image') return false;
        if (activeType === 'video' && asset.type !== 'video') return false;
        if (activeType === 'reference' && !asset.isReference) return false;
        if (activeType === 'starred' && !starredIds.has(asset.id)) return false;

        if (selectedProvider !== 'all') {
          const p = (asset.provider || '').toLowerCase();
          if (!p.includes(selectedProvider.toLowerCase())) return false;
        }

        if (selectedRatio !== 'all' && asset.width && asset.height) {
          const ratio = asset.width / asset.height;
          if (selectedRatio === '1:1' && Math.abs(ratio - 1) > 0.1) return false;
          if (selectedRatio === '16:9' && Math.abs(ratio - 16 / 9) > 0.15) return false;
          if (selectedRatio === '9:16' && Math.abs(ratio - 9 / 16) > 0.15) return false;
          if (selectedRatio === '4:3' && Math.abs(ratio - 4 / 3) > 0.15) return false;
        }

        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const matchP = (asset.prompt || '').toLowerCase().includes(q);
          const matchM = (asset.model || '').toLowerCase().includes(q);
          const matchT = (asset.title || '').toLowerCase().includes(q);
          const matchProv = (asset.provider || '').toLowerCase().includes(q);
          if (!matchP && !matchM && !matchT && !matchProv) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'oldest') return a.timestamp - b.timestamp;
        if (sortBy === 'model') return a.model.localeCompare(b.model);
        if (sortBy === 'provider') return a.provider.localeCompare(b.provider);
        return b.timestamp - a.timestamp;
      });
  }, [allAssets, activeType, selectedProvider, selectedRatio, sortBy, searchQuery, starredIds]);

  // Statistics
  const stats = useMemo(() => {
    const images = allAssets.filter((a) => a.type === 'image').length;
    const videos = allAssets.filter((a) => a.type === 'video').length;
    const uploads = allAssets.filter((a) => a.isReference).length;
    const starred = allAssets.filter((a) => starredIds.has(a.id)).length;
    return { total: allAssets.length, images, videos, uploads, starred };
  }, [allAssets, starredIds]);

  if (!isOpen) return null;

  const handleToggleStar = (e: React.MouseEvent, assetId: string) => {
    e.stopPropagation();
    setStarredIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  };

  const handleCopyPrompt = (asset: MediaAsset, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(asset.prompt);
    setCopiedId(asset.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyJsonMetadata = (asset: MediaAsset, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const jsonStr = JSON.stringify(asset, null, 2);
    navigator.clipboard.writeText(jsonStr);
    setCopiedId(`json-${asset.id}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const processUploadedFiles = (files: FileList | File[]) => {
    Array.from(files).forEach((file) => {
      const isVideo = file.type.includes('video') || file.name.endsWith('.mp4') || file.name.endsWith('.webm');
      const reader = new FileReader();
      reader.onload = (evt) => {
        const url = evt.target?.result as string;
        const newAsset: MediaAsset = {
          id: `upload-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          url,
          type: isVideo ? 'video' : 'image',
          title: file.name,
          prompt: `外部导入素材: ${file.name}`,
          provider: '本地导入',
          model: isVideo ? '本地视频参考资产' : '本地图像参考资产',
          timestamp: Date.now(),
          isReference: true,
          width: 1024,
          height: 1024,
        };
        setCustomUploads((prev) => [newAsset, ...prev]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleUploadLocalFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processUploadedFiles(e.target.files);
    }
  };

  const handleDropFiles = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processUploadedFiles(e.dataTransfer.files);
    }
  };

  // Single Asset Delete Handler
  const handleDelete = (e: React.MouseEvent, asset: MediaAsset) => {
    e.stopPropagation();
    if (confirm(`确定从资产库彻底删除「${asset.title || asset.model}」吗？`)) {
      // 1. Update persistent deleted IDs blacklist
      setDeletedIds((prev) => {
        const next = new Set(prev);
        next.add(asset.id);
        if (asset.url) next.add(asset.url);
        return next;
      });

      // 2. Remove from custom uploads if it was user uploaded
      if (asset.id.startsWith('upload-')) {
        setCustomUploads((prev) => prev.filter((a) => a.id !== asset.id));
      }

      // 3. Remove from multi-select
      setSelectedAssetIds((prev) => {
        const next = new Set(prev);
        next.delete(asset.id);
        return next;
      });

      // 4. Trigger backend server deletion
      onDeleteAsset(asset.id, asset.url);

      // 5. Clear inspector if this asset was selected
      if (selectedAsset?.id === asset.id) {
        setSelectedAsset(null);
      }
    }
  };

  // Batch Delete Handler
  const handleBatchDelete = () => {
    if (selectedAssetIds.size === 0) return;
    if (confirm(`确定彻底删除选中的 ${selectedAssetIds.size} 项资产吗？(此操作不可逆)`)) {
      const idsToDelete = Array.from(selectedAssetIds);
      
      // Update persistent blacklist
      setDeletedIds((prev) => {
        const next = new Set(prev);
        idsToDelete.forEach((id) => next.add(id));
        allAssets
          .filter((a) => selectedAssetIds.has(a.id))
          .forEach((a) => {
            if (a.url) next.add(a.url);
          });
        return next;
      });

      // Remove from uploads
      setCustomUploads((prev) => prev.filter((a) => !selectedAssetIds.has(a.id)));

      // Trigger batch delete
      if (onDeleteBatchAssets) {
        onDeleteBatchAssets(idsToDelete);
      } else {
        idsToDelete.forEach((id) => {
          const item = allAssets.find((a) => a.id === id);
          onDeleteAsset(id, item?.url);
        });
      }

      if (selectedAsset && selectedAssetIds.has(selectedAsset.id)) {
        setSelectedAsset(null);
      }

      setSelectedAssetIds(new Set());
      setIsMultiSelectMode(false);
    }
  };

  // Toggle single item selection for multi-select
  const handleToggleSelectAsset = (e: React.MouseEvent, assetId: string) => {
    e.stopPropagation();
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  };

  // Select all / Deselect all
  const handleToggleSelectAll = () => {
    if (selectedAssetIds.size === filteredAssets.length) {
      setSelectedAssetIds(new Set());
    } else {
      setSelectedAssetIds(new Set(filteredAssets.map((a) => a.id)));
    }
  };

  // Single File Download Handler
  const handleDownloadAsset = async (e: React.MouseEvent, asset: MediaAsset) => {
    e.stopPropagation();
    setDownloadingId(asset.id);
    const filename = `comfycanvas_${asset.type}_${asset.id.replace(/[^a-zA-Z0-9_-]/g, '')}.${asset.type === 'video' ? 'mp4' : 'jpg'}`;

    try {
      const resp = await fetch(asset.url);
      if (resp.ok) {
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      } else {
        throw new Error('CORS fetch fallback');
      }
    } catch (err) {
      const a = document.createElement('a');
      a.href = asset.url;
      a.download = filename;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setTimeout(() => setDownloadingId(null), 1000);
    }
  };

  // Batch Download Handler
  const handleBatchDownload = async () => {
    const selectedList = allAssets.filter((a) => selectedAssetIds.has(a.id));
    if (selectedList.length === 0) return;
    setIsBatchDownloading(true);

    for (let i = 0; i < selectedList.length; i++) {
      const asset = selectedList[i];
      const filename = `comfycanvas_${i + 1}_${asset.type}_${asset.id.replace(/[^a-zA-Z0-9_-]/g, '')}.${asset.type === 'video' ? 'mp4' : 'jpg'}`;
      try {
        const resp = await fetch(asset.url);
        if (resp.ok) {
          const blob = await resp.blob();
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
        }
      } catch (e) {
        const a = document.createElement('a');
        a.href = asset.url;
        a.download = filename;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      // Small pause between browser download triggers
      await new Promise((r) => setTimeout(r, 300));
    }
    setIsBatchDownloading(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 select-none animate-in fade-in duration-200"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={handleDropFiles}
    >
      <div className="bg-[#14151c] border border-[#272938] rounded-2xl w-full max-w-7xl h-[92vh] flex flex-col shadow-2xl overflow-hidden text-xs relative">
        {/* Drag & Drop Overlay */}
        {isDraggingOver && (
          <div className="absolute inset-0 bg-purple-950/85 border-2 border-dashed border-purple-400 z-50 flex flex-col items-center justify-center text-purple-200 gap-3 backdrop-blur-sm pointer-events-none">
            <FileUp className="w-14 h-14 text-purple-300 animate-bounce" />
            <p className="text-lg font-bold">释放文件以立即导入素材资产库</p>
            <p className="text-xs opacity-75">支持 PNG, JPG, WEBP 图像与 MP4, WEBM 动态视频</p>
          </div>
        )}

        {/* Top Header */}
        <div className="px-6 py-3.5 border-b border-[#232532] bg-[#101116] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-500 via-indigo-600 to-pink-600 flex items-center justify-center text-white shadow-lg shadow-purple-500/20 shrink-0">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-white tracking-wide">
                  资产与素材管理中心 (Asset & Media Gallery)
                </h2>
                <div className="flex items-center gap-1.5 font-mono text-[10px]">
                  <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-bold">
                    共 {stats.total} 项
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    🖼️ {stats.images} 图
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-400 border border-pink-500/20">
                    🎥 {stats.videos} 视频
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    ⭐️ {stats.starred} 收藏
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                全链路管理 AI 绘画、AI 动态视频、参考底图与本地素材，支持单张/批量删除、多选下载与一键送入画板
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Multi-Select Toggle */}
            <button
              onClick={() => {
                setIsMultiSelectMode(!isMultiSelectMode);
                if (isMultiSelectMode) setSelectedAssetIds(new Set());
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border ${
                isMultiSelectMode
                  ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/30'
                  : 'bg-[#1e202b] hover:bg-[#272a38] text-slate-300 hover:text-white border-[#2b2e3e]'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>{isMultiSelectMode ? '退出批量选择' : '批量操作'}</span>
            </button>

            {onRefreshHistory && (
              <button
                onClick={onRefreshHistory}
                className="px-3 py-1.5 rounded-lg bg-[#1e202b] hover:bg-[#272a38] text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors border border-[#2b2e3e]"
                title="重新从服务器同步最新生成历史"
              >
                <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                <span>刷新</span>
              </button>
            )}

            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-purple-600/20 transition-all"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>上传素材</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleUploadLocalFile}
              accept="image/*,video/mp4,video/webm"
              multiple
              className="hidden"
            />

            {onClearAllHistory && allAssets.length > 0 && (
              <button
                onClick={() => {
                  if (confirm('确定清空所有历次生成资产记录吗？(不可撤销)')) {
                    onClearAllHistory();
                  }
                }}
                className="px-2.5 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 hover:text-white text-xs font-medium border border-rose-800/40 transition-colors"
                title="清空所有历次生成记录"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-[#1e202b] hover:bg-[#272a38] text-slate-400 hover:text-white text-xs font-semibold transition-colors border border-[#2b2e3e]"
            >
              关闭 (Esc)
            </button>
          </div>
        </div>

        {/* Filter Ribbon */}
        <div className="px-6 py-2.5 bg-[#171822] border-b border-[#232532] flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
          {/* Media Type Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {[
              { id: 'all', label: `全部 (${stats.total})`, icon: FolderOpen },
              { id: 'image', label: `🖼️ 静态图像 (${stats.images})`, icon: ImageIcon },
              { id: 'video', label: `🎥 动态视频 (${stats.videos})`, icon: Video },
              { id: 'reference', label: `📎 本地素材 (${stats.uploads})`, icon: Upload },
              { id: 'starred', label: `⭐️ 收藏夹 (${stats.starred})`, icon: Star },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveType(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 text-xs ${
                  activeType === tab.id
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
                    : 'bg-[#1a1b24] text-slate-400 hover:text-white border border-[#292b38]'
                }`}
              >
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Provider Filter, Ratio, Sort & Search */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Provider Filter */}
            <div className="flex items-center gap-1 bg-[#1a1b24] border border-[#292b38] rounded-xl px-2.5 py-1 text-xs">
              <Filter className="w-3 h-3 text-slate-400" />
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
                className="bg-transparent text-slate-200 outline-none cursor-pointer font-mono"
              >
                <option value="all" className="bg-[#1a1b24]">全服务商 (All)</option>
                <option value="civitai" className="bg-[#1a1b24]">Civitai 官方原生</option>
                <option value="fal" className="bg-[#1a1b24]">Fal.ai 极速云</option>
                <option value="agnes" className="bg-[#1a1b24]">Agnes AI 2.5 Flash</option>
                <option value="modelscope" className="bg-[#1a1b24]">ModelScope 魔搭</option>
                <option value="huggingface" className="bg-[#1a1b24]">Hugging Face</option>
                <option value="tensor" className="bg-[#1a1b24]">Tensor.Art (OpenWorks)</option>
                <option value="sensenova" className="bg-[#1a1b24]">SenseNova 商汤</option>
                <option value="nanogpt" className="bg-[#1a1b24]">NanoGPT</option>
                <option value="gemini" className="bg-[#1a1b24]">Google Gemini</option>
                <option value="本地导入" className="bg-[#1a1b24]">本地导入素材</option>
              </select>
            </div>

            {/* Aspect Ratio Filter */}
            <div className="flex items-center gap-1 bg-[#1a1b24] border border-[#292b38] rounded-xl px-2.5 py-1 text-xs">
              <Ratio className="w-3 h-3 text-slate-400" />
              <select
                value={selectedRatio}
                onChange={(e) => setSelectedRatio(e.target.value)}
                className="bg-transparent text-slate-200 outline-none cursor-pointer font-mono"
              >
                <option value="all" className="bg-[#1a1b24]">全部画幅</option>
                <option value="1:1" className="bg-[#1a1b24]">1:1 正方形</option>
                <option value="16:9" className="bg-[#1a1b24]">16:9 宽画幅</option>
                <option value="9:16" className="bg-[#1a1b24]">9:16 竖版海报</option>
                <option value="4:3" className="bg-[#1a1b24]">4:3 经典比例</option>
              </select>
            </div>

            {/* Sort Order */}
            <div className="flex items-center gap-1 bg-[#1a1b24] border border-[#292b38] rounded-xl px-2.5 py-1 text-xs">
              <ArrowUpDown className="w-3 h-3 text-slate-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-transparent text-slate-200 outline-none cursor-pointer font-mono"
              >
                <option value="newest" className="bg-[#1a1b24]">最新优先 (Newest)</option>
                <option value="oldest" className="bg-[#1a1b24]">最早优先 (Oldest)</option>
                <option value="model" className="bg-[#1a1b24]">按模型名 (A-Z)</option>
                <option value="provider" className="bg-[#1a1b24]">按服务商 (A-Z)</option>
              </select>
            </div>

            {/* Search Input */}
            <div className="relative w-44 shrink-0">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索提示词/模型..."
                className="w-full bg-[#1a1b24] border border-[#292b38] rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-purple-500 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Batch Operation Bar (Visible when in multi-select mode) */}
        {isMultiSelectMode && (
          <div className="px-6 py-2 bg-[#1f1d2b] border-b border-purple-500/30 flex items-center justify-between text-xs animate-in slide-in-from-top-2 duration-150 shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={handleToggleSelectAll}
                className="px-2.5 py-1 rounded-lg bg-[#2b2a3d] hover:bg-[#37354d] text-slate-200 font-medium flex items-center gap-1.5 border border-[#3f3d58]"
              >
                {selectedAssetIds.size === filteredAssets.length ? (
                  <>
                    <CheckSquare className="w-3.5 h-3.5 text-purple-400" />
                    <span>取消全选</span>
                  </>
                ) : (
                  <>
                    <Square className="w-3.5 h-3.5" />
                    <span>全选当前 ({filteredAssets.length})</span>
                  </>
                )}
              </button>

              <span className="font-mono text-purple-300">
                已选中 <strong className="text-white text-sm">{selectedAssetIds.size}</strong> 项资产
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleBatchDownload}
                disabled={selectedAssetIds.size === 0 || isBatchDownloading}
                className="px-3 py-1 rounded-lg bg-[#272a3a] hover:bg-[#32364a] text-slate-200 hover:text-white font-medium flex items-center gap-1.5 border border-[#383d52] disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-cyan-400" />
                <span>{isBatchDownloading ? '批量下载中...' : `批量下载 (${selectedAssetIds.size})`}</span>
              </button>

              <button
                onClick={handleBatchDelete}
                disabled={selectedAssetIds.size === 0}
                className="px-3 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-200 hover:text-white font-bold flex items-center gap-1.5 border border-rose-700/50 disabled:opacity-40 disabled:pointer-events-none transition-all shadow-md shadow-rose-950/40"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>彻底批量删除 ({selectedAssetIds.size})</span>
              </button>
            </div>
          </div>
        )}

        {/* Main Content Area (Gallery + Side Inspector) */}
        <div className="flex-1 flex overflow-hidden bg-[#0d0e12]">
          {/* Assets Gallery Grid */}
          <div className="flex-1 overflow-y-auto p-6">
            {filteredAssets.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-3 py-16">
                <div className="w-14 h-14 rounded-2xl bg-[#171822] border border-[#272938] flex items-center justify-center text-purple-400">
                  <FolderOpen className="w-7 h-7" />
                </div>
                <p className="text-sm font-semibold text-slate-300">未找到符合条件的资产</p>
                <p className="text-xs text-slate-500">
                  你可以点击右上角上传本地素材、或切换上方分类筛选条件
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredAssets.map((asset) => {
                  const isVideo = asset.type === 'video';
                  const isSelected = selectedAsset?.id === asset.id;
                  const isChecked = selectedAssetIds.has(asset.id);
                  const isStarred = starredIds.has(asset.id);

                  return (
                    <div
                      key={asset.id}
                      onClick={() => {
                        if (isMultiSelectMode) {
                          handleToggleSelectAsset({} as any, asset.id);
                        } else {
                          setSelectedAsset(asset);
                        }
                      }}
                      className={`bg-[#151620] border rounded-2xl overflow-hidden flex flex-col shadow-xl transition-all group cursor-pointer relative ${
                        isChecked
                          ? 'border-purple-500 ring-2 ring-purple-500/60'
                          : isSelected
                          ? 'border-cyan-500 ring-2 ring-cyan-500/40'
                          : 'border-[#242634] hover:border-purple-500/60'
                      }`}
                    >
                      {/* Media Thumbnail Container */}
                      <div className="relative aspect-square w-full bg-black overflow-hidden flex items-center justify-center">
                        {isVideo ? (
                          <video
                            src={asset.url}
                            muted
                            loop
                            playsInline
                            onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
                            onMouseLeave={(e) => (e.target as HTMLVideoElement).pause()}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <img
                            src={asset.url}
                            alt={asset.prompt}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                        )}

                        {/* Top-Left Badges */}
                        <div className="absolute top-2 left-2 flex items-center gap-1.5 z-10">
                          {isMultiSelectMode ? (
                            <button
                              onClick={(e) => handleToggleSelectAsset(e, asset.id)}
                              className={`w-6 h-6 rounded-lg flex items-center justify-center backdrop-blur-md border transition-all ${
                                isChecked
                                  ? 'bg-purple-600 text-white border-purple-400 shadow-md shadow-purple-600/40'
                                  : 'bg-black/60 text-slate-400 border-white/20 hover:border-white/50'
                              }`}
                            >
                              {isChecked ? <Check className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                            </button>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-black/75 text-purple-300 border border-purple-700/60 backdrop-blur-md flex items-center gap-1 pointer-events-none">
                              {isVideo ? <Video className="w-2.5 h-2.5 text-pink-400" /> : <ImageIcon className="w-2.5 h-2.5 text-cyan-400" />}
                              <span>{isVideo ? '动态视频' : '图像'}</span>
                            </span>
                          )}
                        </div>

                        {/* Top-Right Star & Provider Badge */}
                        <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
                          <button
                            onClick={(e) => handleToggleStar(e, asset.id)}
                            className={`p-1 rounded-lg backdrop-blur-md border transition-all ${
                              isStarred
                                ? 'bg-amber-500/30 text-amber-300 border-amber-500/60'
                                : 'bg-black/60 text-slate-400 border-white/10 hover:text-amber-300 hover:border-amber-400/40'
                            }`}
                            title={isStarred ? '取消收藏' : '添加至收藏夹'}
                          >
                            <Star className={`w-3 h-3 ${isStarred ? 'fill-amber-400 text-amber-400' : ''}`} />
                          </button>

                          <span className="px-2 py-0.5 rounded-full text-[9px] font-mono bg-black/80 text-slate-200 border border-slate-700/80 backdrop-blur-md pointer-events-none truncate max-w-[140px]">
                            {asset.provider}
                          </span>
                        </div>

                        {/* Hover Quick Action Overlay */}
                        {!isMultiSelectMode && (
                          <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 p-2 z-20">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAddToCanvasAsFrame(asset);
                                  onClose();
                                }}
                                className="p-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-[10px] flex items-center gap-1 shadow-lg shadow-purple-600/30 transition-all"
                                title="在无限画布上放置空间画板取景框"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>送入画板</span>
                              </button>

                              {onAddNodeFromAsset && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onAddNodeFromAsset(asset);
                                    onClose();
                                  }}
                                  className="p-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-[10px] flex items-center gap-1 shadow-lg shadow-cyan-600/30 transition-all"
                                  title="在 ComfyUI 节点图中添加此资产节点"
                                >
                                  <Layers className="w-3.5 h-3.5" />
                                  <span>加节点</span>
                                </button>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUseAsReference(asset);
                                  onClose();
                                }}
                                className="p-1.5 rounded-lg bg-[#212330] hover:bg-[#2b2e40] text-cyan-300 border border-[#35394e]"
                                title="作为图生图 / 图生视频参考源"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onPreviewImage(asset.url);
                                }}
                                className="p-1.5 rounded-lg bg-[#212330] hover:bg-[#2b2e40] text-slate-200 hover:text-white border border-[#35394e]"
                                title="全屏高清放大查看"
                              >
                                <Maximize2 className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={(e) => handleDownloadAsset(e, asset)}
                                disabled={downloadingId === asset.id}
                                className="p-1.5 rounded-lg bg-[#212330] hover:bg-[#2b2e40] text-slate-200 hover:text-white border border-[#35394e]"
                                title="下载原文件"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={(e) => handleDelete(e, asset)}
                                className="p-1.5 rounded-lg bg-rose-950 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/40 transition-all"
                                title="从资产库彻底删除"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Asset Card Footer */}
                      <div className="p-3 bg-[#13141c] border-t border-[#222430] flex flex-col justify-between gap-2 overflow-hidden">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-slate-400 gap-1">
                            <span className="font-semibold text-white truncate flex-1" title={String(displayValue(asset.model))}>
                              {displayValue(asset.model ? asset.model.split('/').pop() : asset.model)}
                            </span>
                            <span className="font-mono text-[9px] text-slate-500 shrink-0">
                              {new Date(asset.timestamp).toLocaleDateString([], { month: '2-digit', day: '2-digit' })}{' '}
                              {new Date(asset.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          <p className={`text-[10px] leading-tight line-clamp-2 ${asset.prompt && asset.prompt.trim() ? 'text-slate-400' : 'text-slate-500 italic'}`} title={String(displayValue(asset.prompt))}>
                            {displayValue(asset.prompt)}
                          </p>
                        </div>

                        <div className="pt-2 border-t border-[#1d1e28] flex items-center justify-between shrink-0">
                          <button
                            onClick={(e) => handleCopyPrompt(asset, e)}
                            className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 font-mono transition-colors"
                          >
                            {copiedId === asset.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span className="text-emerald-400">已复制</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>复制词</span>
                              </>
                            )}
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(e, asset);
                            }}
                            className="text-[10px] text-rose-400/80 hover:text-rose-300 flex items-center gap-1 hover:underline font-medium"
                            title="删除单张图片"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>删除</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Side Details Inspector Panel */}
          {selectedAsset && (
            <div className="w-96 border-l border-[#232534] bg-[#111218] flex flex-col justify-between shrink-0 overflow-y-auto animate-in slide-in-from-right-4 duration-200">
              <div className="p-5 space-y-4">
                {/* Inspector Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-purple-400" />
                    <h3 className="font-bold text-white text-xs">资产元数据详情 (Inspector)</h3>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => handleToggleStar(e, selectedAsset.id)}
                      className={`p-1.5 rounded-lg border transition-all ${
                        starredIds.has(selectedAsset.id)
                          ? 'bg-amber-500/30 text-amber-300 border-amber-500/60'
                          : 'bg-[#1a1b24] text-slate-400 border-[#2b2e3e] hover:text-white'
                      }`}
                      title="收藏此项资产"
                    >
                      <Star className={`w-3.5 h-3.5 ${starredIds.has(selectedAsset.id) ? 'fill-amber-400 text-amber-400' : ''}`} />
                    </button>
                    <button
                      onClick={() => setSelectedAsset(null)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1f202c] transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Media Preview Player/Viewer */}
                <div className="relative aspect-video w-full rounded-xl bg-black overflow-hidden flex items-center justify-center border border-[#252738]">
                  {selectedAsset.type === 'video' ? (
                    <video
                      src={selectedAsset.url}
                      controls
                      autoPlay
                      loop
                      playsInline
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <img
                      src={selectedAsset.url}
                      alt={selectedAsset.prompt}
                      className="w-full h-full object-contain cursor-pointer"
                      onClick={() => onPreviewImage(selectedAsset.url)}
                    />
                  )}
                  {selectedAsset.type === 'image' && (
                    <button
                      onClick={() => onPreviewImage(selectedAsset.url)}
                      className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/75 hover:bg-black text-white text-[10px] flex items-center gap-1 backdrop-blur-md border border-white/10"
                      title="全屏放大"
                    >
                      <Maximize2 className="w-3 h-3" />
                      <span>全屏查看</span>
                    </button>
                  )}
                </div>

                {/* Details Breakdown */}
                <div className="space-y-3 text-[11px]">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-400 font-semibold">生成提示词 (Prompt):</span>
                      <button
                        onClick={(e) => handleCopyPrompt(selectedAsset, e)}
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 font-mono flex items-center gap-1"
                      >
                        {copiedId === selectedAsset.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedId === selectedAsset.id ? '已复制' : '复制词'}</span>
                      </button>
                    </div>
                    <div className={`p-2.5 rounded-xl bg-[#0a0a0f] border border-[#1f212e] font-mono text-[11px] leading-relaxed select-text max-h-32 overflow-y-auto ${selectedAsset.prompt && selectedAsset.prompt.trim() ? 'text-slate-200' : 'text-slate-400 italic'}`}>
                      {displayValue(selectedAsset.prompt)}
                    </div>
                  </div>

                  <div>
                    <span className="text-slate-400 block mb-1 font-semibold">负向排畸词 (Negative Prompt):</span>
                    <div className={`p-2.5 rounded-xl bg-[#0a0a0f] border border-[#1f212e] font-mono text-[11px] leading-relaxed select-text max-h-24 overflow-y-auto ${selectedAsset.negativePrompt && selectedAsset.negativePrompt.trim() ? 'text-slate-400' : 'text-slate-500 italic'}`}>
                      {displayValue(selectedAsset.negativePrompt)}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
                    <div className="p-2 rounded-lg bg-[#161720] border border-[#222430]">
                      <span className="text-slate-500 block">生成服务商:</span>
                      <span className="text-purple-300 font-bold">{displayValue(selectedAsset.provider)}</span>
                    </div>
                    <div className="p-2 rounded-lg bg-[#161720] border border-[#222430]">
                      <span className="text-slate-500 block">生成模型:</span>
                      <span className="text-cyan-300 font-bold truncate block" title={String(displayValue(selectedAsset.model))}>
                        {displayValue(selectedAsset.model ? selectedAsset.model.split('/').pop() : selectedAsset.model)}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-[#161720] border border-[#222430]">
                      <span className="text-slate-500 block">随机种子 (Seed):</span>
                      <span className="text-amber-300 font-bold">{displayValue(selectedAsset.seed)}</span>
                    </div>
                    <div className="p-2 rounded-lg bg-[#161720] border border-[#222430]">
                      <span className="text-slate-500 block">采样步数 (Steps):</span>
                      <span className="text-white font-bold">{selectedAsset.steps != null ? `${selectedAsset.steps} 步` : '未填写'}</span>
                    </div>
                    <div className="p-2 rounded-lg bg-[#161720] border border-[#222430]">
                      <span className="text-slate-500 block">CFG 指导度:</span>
                      <span className="text-white font-bold">{displayValue(selectedAsset.cfg)}</span>
                    </div>
                    {selectedAsset.sampler && (
                      <div className="p-2 rounded-lg bg-[#161720] border border-[#222430]">
                        <span className="text-slate-500 block">采样器 / 调度器:</span>
                        <span className="text-slate-200 font-bold">{selectedAsset.sampler}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons Hub */}
              <div className="p-4 bg-[#0e0f14] border-t border-[#20222e] space-y-2">
                <button
                  onClick={() => {
                    onAddToCanvasAsFrame(selectedAsset);
                    onClose();
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold flex items-center justify-center gap-1.5 shadow-md shadow-purple-600/20 text-xs active:scale-98 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>送入空间画板取景框</span>
                </button>

                {onAddNodeFromAsset && (
                  <button
                    onClick={() => {
                      onAddNodeFromAsset(selectedAsset);
                      onClose();
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white font-bold flex items-center justify-center gap-1.5 shadow-md shadow-cyan-600/20 text-xs active:scale-98 transition-all"
                  >
                    <Layers className="w-4 h-4" />
                    <span>添加至 ComfyUI 节点图</span>
                  </button>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      onUseAsReference(selectedAsset);
                      onClose();
                    }}
                    className="py-1.5 px-2 rounded-lg bg-[#1d1f2b] hover:bg-[#272a3b] text-cyan-300 font-medium flex items-center justify-center gap-1 border border-[#2d3144] text-[11px]"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>设为参考底图</span>
                  </button>

                  {onApplyParameters && (
                    <button
                      onClick={() => {
                        onApplyParameters(selectedAsset);
                        onClose();
                      }}
                      className="py-1.5 px-2 rounded-lg bg-[#1d1f2b] hover:bg-[#272a3b] text-purple-300 font-medium flex items-center justify-center gap-1 border border-[#2d3144] text-[11px]"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>复用全部参数</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={(e) => handleDownloadAsset(e, selectedAsset)}
                    className="py-1.5 px-2 rounded-lg bg-[#181922] hover:bg-[#222430] text-slate-200 font-medium flex items-center justify-center gap-1 border border-[#282a3a] text-[11px]"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>下载原文件</span>
                  </button>

                  <button
                    onClick={(e) => handleDelete(e, selectedAsset)}
                    className="py-1.5 px-2 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 hover:text-white font-bold flex items-center justify-center gap-1 border border-rose-800/40 text-[11px] transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>彻底删除</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
