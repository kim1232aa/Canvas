import React, { useState, useRef, useEffect } from 'react';
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
  Share2,
} from 'lucide-react';
import { GenerationHistoryItem } from '../types/providers';

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
  seed?: number;
  steps?: number;
  cfg?: number;
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
  onDeleteAsset: (id: string) => void;
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
  onRefreshHistory,
  onClearAllHistory,
}) => {
  const [activeType, setActiveType] = useState<'all' | 'image' | 'video' | 'reference'>('all');
  const [selectedProvider, setSelectedProvider] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'model'>('newest');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Persistent user uploads
  const [customUploads, setCustomUploads] = useState<MediaAsset[]>(() => {
    try {
      const raw = localStorage.getItem('comfycanvas_user_assets_v2');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return [];
  });

  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem('comfycanvas_user_assets_v2', JSON.stringify(customUploads));
    } catch (e) {}
  }, [customUploads]);

  if (!isOpen) return null;

  // Convert history items + user uploads into unified MediaAsset list
  const historyAssets: MediaAsset[] = history
    .filter((item) => Boolean(item.url || item.imageUrl))
    .map((item, idx) => {
      const isVid =
        item.mediaType === 'video' ||
        item.url?.endsWith('.mp4') ||
        item.imageUrl?.endsWith('.mp4') ||
        item.model?.toLowerCase().includes('video') ||
        item.provider?.toLowerCase().includes('video');
      return {
        id: item.id || `hist-${idx}-${item.timestamp || Date.now()}`,
        url: item.url || item.imageUrl || '',
        type: isVid ? 'video' : 'image',
        title: item.model ? `${item.model.split('/').pop()} 产物` : undefined,
        prompt: item.prompt || 'AI 艺术创作',
        negativePrompt: item.negativePrompt,
        provider: item.provider || 'Cloud AI Engine',
        model: item.model || 'FLUX / SDXL',
        timestamp: item.timestamp || Date.now() - idx * 60000,
        width: item.width || 1024,
        height: item.height || 1024,
        seed: item.seed,
        steps: item.steps,
        cfg: item.cfg,
        sampler: item.sampler,
        scheduler: item.scheduler,
        loras: item.loras?.map((l) => (typeof l === 'string' ? { name: l } : l)),
      };
    });

  const allAssets = [...customUploads, ...historyAssets].filter(
    (asset) => !deletedIds.has(asset.id)
  );

  // Filtering
  const filteredAssets = allAssets
    .filter((asset) => {
      if (activeType === 'image' && asset.type !== 'image') return false;
      if (activeType === 'video' && asset.type !== 'video') return false;
      if (activeType === 'reference' && !asset.isReference) return false;

      if (selectedProvider !== 'all') {
        const p = (asset.provider || '').toLowerCase();
        if (!p.includes(selectedProvider.toLowerCase())) return false;
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
      return b.timestamp - a.timestamp;
    });

  const handleCopyPrompt = (asset: MediaAsset) => {
    navigator.clipboard.writeText(asset.prompt);
    setCopiedId(asset.id);
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

  const handleDelete = (e: React.MouseEvent, asset: MediaAsset) => {
    e.stopPropagation();
    if (confirm('确定从资产库彻底删除此项资产吗？')) {
      setDeletedIds((prev) => new Set(prev).add(asset.id));
      if (asset.id.startsWith('upload-')) {
        setCustomUploads((prev) => prev.filter((a) => a.id !== asset.id));
      } else {
        onDeleteAsset(asset.id);
      }
      if (selectedAsset?.id === asset.id) {
        setSelectedAsset(null);
      }
    }
  };

  const handleDownloadAsset = async (e: React.MouseEvent, asset: MediaAsset) => {
    e.stopPropagation();
    setDownloadingId(asset.id);
    const filename = `comfycanvas_${asset.type}_${asset.id.replace(/[^a-zA-Z0-9_-]/g, '')}.${asset.type === 'video' ? 'mp4' : 'jpg'}`;
    
    try {
      // Try blob download to bypass cross-origin browser navigation
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

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-200"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={handleDropFiles}
    >
      <div className="bg-[#15161c] border border-[#2b2d3a] rounded-2xl w-full max-w-6xl h-[90vh] flex flex-col shadow-2xl overflow-hidden text-xs relative">
        {/* Drag & Drop Overlay */}
        {isDraggingOver && (
          <div className="absolute inset-0 bg-purple-950/80 border-2 border-dashed border-purple-400 z-50 flex flex-col items-center justify-center text-purple-200 gap-3 backdrop-blur-sm pointer-events-none">
            <FileUp className="w-12 h-12 text-purple-300 animate-bounce" />
            <p className="text-base font-bold">释放文件以立即导入素材资产库</p>
            <p className="text-xs opacity-75">支持 PNG、JPG、WEBP 图像与 MP4 视频</p>
          </div>
        )}

        {/* Header */}
        <div className="px-6 py-4 border-b border-[#252733] bg-[#111216] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-500 via-indigo-600 to-pink-600 flex items-center justify-center text-white shadow-lg shadow-purple-500/20 shrink-0">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-white tracking-wide">
                  资产与素材管理中心 (Asset & Media Gallery)
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-500/10 text-purple-300 border border-purple-500/20">
                  {allAssets.length} 项资产
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                统一管理历次生成的 AI 图像、5秒电影级视频、图生图底图与本地上传素材，支持一键载入画布
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onRefreshHistory && (
              <button
                onClick={onRefreshHistory}
                className="px-3 py-1.5 rounded-lg bg-[#22242e] hover:bg-[#2c2e3b] text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors border border-[#2f313e]"
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
              accept="image/*,video/mp4"
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
              className="px-3 py-1.5 rounded-lg bg-[#22242e] hover:bg-[#2c2e3b] text-slate-400 hover:text-white text-xs font-semibold transition-colors border border-[#2f313e]"
            >
              关闭 (Esc)
            </button>
          </div>
        </div>

        {/* Filter Ribbon */}
        <div className="px-6 py-2.5 bg-[#171821] border-b border-[#242632] flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
          {/* Media Type Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {[
              { id: 'all', label: '全部资产', icon: FolderOpen },
              { id: 'image', label: '🖼️ 静态图像', icon: ImageIcon },
              { id: 'video', label: '🎥 AI 动态视频', icon: Video },
              { id: 'reference', label: '📎 本地上传素材', icon: Upload },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveType(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  activeType === tab.id
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
                    : 'bg-[#1b1c25] text-slate-400 hover:text-white border border-[#2b2d39]'
                }`}
              >
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Provider Filter, Sort & Search */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-[#1b1c25] border border-[#2b2d39] rounded-xl px-2.5 py-1 text-xs">
              <Filter className="w-3 h-3 text-slate-400" />
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
                className="bg-transparent text-slate-200 outline-none cursor-pointer font-mono"
              >
                <option value="all" className="bg-[#1b1c25]">全服务商 (All)</option>
                <option value="civitai" className="bg-[#1b1c25]">Civitai 官方原生</option>
                <option value="fal" className="bg-[#1b1c25]">Fal.ai 极速云</option>
                <option value="agnes" className="bg-[#1b1c25]">Agnes AI 2.5 Flash</option>
                <option value="modelscope" className="bg-[#1b1c25]">ModelScope 魔搭</option>
                <option value="huggingface" className="bg-[#1b1c25]">Hugging Face</option>
                <option value="tensor" className="bg-[#1b1c25]">Tensor.Art (OpenWorks)</option>
                <option value="sensenova" className="bg-[#1b1c25]">SenseNova 商汤</option>
                <option value="nanogpt" className="bg-[#1b1c25]">NanoGPT</option>
                <option value="gemini" className="bg-[#1b1c25]">Google Imagen 3</option>
                <option value="本地导入" className="bg-[#1b1c25]">本地上传素材</option>
              </select>
            </div>

            <div className="flex items-center gap-1 bg-[#1b1c25] border border-[#2b2d39] rounded-xl px-2.5 py-1 text-xs">
              <ArrowUpDown className="w-3 h-3 text-slate-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-transparent text-slate-200 outline-none cursor-pointer font-mono"
              >
                <option value="newest" className="bg-[#1b1c25]">最新优先 (Newest)</option>
                <option value="oldest" className="bg-[#1b1c25]">最早优先 (Oldest)</option>
                <option value="model" className="bg-[#1b1c25]">按模型排序 (A-Z)</option>
              </select>
            </div>

            <div className="relative w-44 shrink-0">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索提示词/模型..."
                className="w-full bg-[#1b1c25] border border-[#2b2d39] rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-purple-500 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Main Content Area (Gallery + Optional Inspector Drawer) */}
        <div className="flex-1 flex overflow-hidden bg-[#0f1014]">
          {/* Assets Gallery Grid */}
          <div className="flex-1 overflow-y-auto p-6">
            {filteredAssets.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-[#1b1c25] border border-[#2b2d39] flex items-center justify-center text-purple-400">
                  <FolderOpen className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-slate-300">未找到符合条件的资产</p>
                <p className="text-xs text-slate-500">你可以点击右上角上传本地图片/视频，或在画布中执行生成</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredAssets.map((asset) => {
                  const isVideo = asset.type === 'video';
                  const isSelected = selectedAsset?.id === asset.id;

                  return (
                    <div
                      key={asset.id}
                      onClick={() => setSelectedAsset(asset)}
                      className={`bg-[#171822] border rounded-2xl overflow-hidden flex flex-col shadow-xl transition-all group cursor-pointer ${
                        isSelected
                          ? 'border-purple-500 ring-2 ring-purple-500/40'
                          : 'border-[#262835] hover:border-purple-500/60'
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

                        {/* Type Badge */}
                        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 pointer-events-none">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-black/75 text-purple-300 border border-purple-700/60 backdrop-blur-md flex items-center gap-1">
                            {isVideo ? <Video className="w-3 h-3 text-pink-400" /> : <ImageIcon className="w-3 h-3 text-cyan-400" />}
                            <span>{isVideo ? '动态视频' : '图像'}</span>
                          </span>
                        </div>

                        <div className="absolute top-2.5 right-2.5 pointer-events-none">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-black/75 text-slate-300 border border-slate-700/60 backdrop-blur-md">
                            {asset.provider}
                          </span>
                        </div>

                        {/* Hover Action Overlay */}
                        <div className="absolute inset-0 bg-black/65 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onAddToCanvasAsFrame(asset);
                              onClose();
                            }}
                            className="p-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1 shadow-lg shadow-purple-600/30 transition-all"
                            title="在无限画布上放置空间画板取景框"
                          >
                            <Plus className="w-4 h-4" />
                            <span>送入画板</span>
                          </button>

                          {onAddNodeFromAsset && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onAddNodeFromAsset(asset);
                                onClose();
                              }}
                              className="p-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-1 shadow-lg shadow-cyan-600/30 transition-all"
                              title="在 ComfyUI 节点图中添加此资产节点"
                            >
                              <Layers className="w-4 h-4" />
                              <span>添加节点</span>
                            </button>
                          )}

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onUseAsReference(asset);
                              onClose();
                            }}
                            className="p-2 rounded-xl bg-[#222533] hover:bg-[#2d3143] text-cyan-300 shadow-lg border border-[#373c52]"
                            title="作为图生图 / 图生视频参考源"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>

                          <button
                            onClick={(e) => handleDownloadAsset(e, asset)}
                            disabled={downloadingId === asset.id}
                            className="p-2 rounded-xl bg-[#222533] hover:bg-[#2d3143] text-slate-200 hover:text-white shadow-lg border border-[#373c52]"
                            title="下载原文件"
                          >
                            <Download className="w-4 h-4" />
                          </button>

                          <button
                            onClick={(e) => handleDelete(e, asset)}
                            className="p-2 rounded-xl bg-rose-950/80 hover:bg-rose-600 text-rose-200 hover:text-white shadow-lg border border-rose-500/40 transition-all"
                            title="从资产库彻底删除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Asset Info Footer */}
                      <div className="p-3 bg-[#15161f] border-t border-[#232532] space-y-2 flex-1 flex flex-col justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-slate-400">
                            <span className="font-semibold text-white truncate max-w-[140px]" title={asset.model}>
                              {asset.model.split('/').pop()}
                            </span>
                            <span className="font-mono text-[10px] text-slate-500">
                              {new Date(asset.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          <p className="text-[11px] text-slate-400 leading-snug line-clamp-2" title={asset.prompt}>
                            {asset.prompt}
                          </p>
                        </div>

                        <div className="pt-2 border-t border-[#20222c] flex items-center justify-between">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyPrompt(asset);
                            }}
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
                                <span>复制提示词</span>
                              </>
                            )}
                          </button>

                          <span className="text-[10px] text-purple-400 font-semibold group-hover:text-purple-300">
                            点击查看详情 →
                          </span>
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
            <div className="w-96 border-l border-[#242633] bg-[#13141a] flex flex-col justify-between shrink-0 overflow-y-auto animate-in slide-in-from-right-4 duration-200">
              <div className="p-5 space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-purple-400" />
                    <h3 className="font-bold text-white text-xs">资产元数据详情</h3>
                  </div>
                  <button
                    onClick={() => setSelectedAsset(null)}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#20222d] transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Media Preview Box */}
                <div className="relative aspect-video w-full rounded-xl bg-black overflow-hidden flex items-center justify-center border border-[#272938]">
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
                      className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/70 hover:bg-black text-white text-[10px] flex items-center gap-1 backdrop-blur-md"
                      title="全屏放大"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span>全屏查看</span>
                    </button>
                  )}
                </div>

                {/* Details Meta */}
                <div className="space-y-3 text-[11px]">
                  <div>
                    <span className="text-slate-500 block mb-1 font-semibold">生成提示词 (Prompt):</span>
                    <div className="p-2.5 rounded-xl bg-[#0c0d12] border border-[#22242f] text-slate-300 font-mono text-[11px] leading-relaxed select-text">
                      {selectedAsset.prompt}
                    </div>
                  </div>

                  {selectedAsset.negativePrompt && (
                    <div>
                      <span className="text-slate-500 block mb-1 font-semibold">负向排畸词 (Negative Prompt):</span>
                      <div className="p-2.5 rounded-xl bg-[#0c0d12] border border-[#22242f] text-slate-400 font-mono text-[11px] leading-relaxed select-text">
                        {selectedAsset.negativePrompt}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
                    <div className="p-2 rounded-lg bg-[#181922] border border-[#242633]">
                      <span className="text-slate-500 block">生成服务商:</span>
                      <span className="text-purple-300 font-bold">{selectedAsset.provider}</span>
                    </div>
                    <div className="p-2 rounded-lg bg-[#181922] border border-[#242633]">
                      <span className="text-slate-500 block">生成模型:</span>
                      <span className="text-cyan-300 font-bold truncate block" title={selectedAsset.model}>
                        {selectedAsset.model.split('/').pop()}
                      </span>
                    </div>
                    {selectedAsset.seed !== undefined && (
                      <div className="p-2 rounded-lg bg-[#181922] border border-[#242633]">
                        <span className="text-slate-500 block">随机种子 (Seed):</span>
                        <span className="text-amber-300 font-bold">{selectedAsset.seed}</span>
                      </div>
                    )}
                    {selectedAsset.steps !== undefined && (
                      <div className="p-2 rounded-lg bg-[#181922] border border-[#242633]">
                        <span className="text-slate-500 block">采样步数 (Steps):</span>
                        <span className="text-white font-bold">{selectedAsset.steps} 步</span>
                      </div>
                    )}
                    {selectedAsset.cfg !== undefined && (
                      <div className="p-2 rounded-lg bg-[#181922] border border-[#242633]">
                        <span className="text-slate-500 block">CFG 指导度:</span>
                        <span className="text-white font-bold">{selectedAsset.cfg}</span>
                      </div>
                    )}
                    {selectedAsset.sampler && (
                      <div className="p-2 rounded-lg bg-[#181922] border border-[#242633]">
                        <span className="text-slate-500 block">采样器 / 调度器:</span>
                        <span className="text-slate-200 font-bold">{selectedAsset.sampler} ({selectedAsset.scheduler || 'normal'})</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons Hub */}
              <div className="p-4 bg-[#101116] border-t border-[#232532] space-y-2">
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
                    className="py-1.5 px-2 rounded-lg bg-[#20222e] hover:bg-[#2b2f3f] text-cyan-300 font-medium flex items-center justify-center gap-1 border border-[#303446] text-[11px]"
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
                      className="py-1.5 px-2 rounded-lg bg-[#20222e] hover:bg-[#2b2f3f] text-purple-300 font-medium flex items-center justify-center gap-1 border border-[#303446] text-[11px]"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>载入全部参数</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={(e) => handleDownloadAsset(e, selectedAsset)}
                    className="py-1.5 px-2 rounded-lg bg-[#191a22] hover:bg-[#232530] text-slate-200 font-medium flex items-center justify-center gap-1 border border-[#2b2d3a] text-[11px]"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>下载原文件</span>
                  </button>

                  <button
                    onClick={(e) => handleDelete(e, selectedAsset)}
                    className="py-1.5 px-2 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 font-medium flex items-center justify-center gap-1 border border-rose-800/40 text-[11px]"
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
