import React, { useState } from 'react';
import {
  Download,
  Copy,
  Check,
  Sparkles,
  Sliders,
  Cpu,
  Layers,
  GitBranch,
  Video,
  ExternalLink,
  Plus,
  RefreshCw,
  Eye,
  Info,
  Maximize2,
} from 'lucide-react';
import { GenerationHistoryItem } from '../types/providers';
import { SpatialFrame } from '../types/graph';

export interface ImageDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: {
    url: string;
    videoUrl?: string;
    mediaType?: 'image' | 'video';
    prompt?: string;
    negativePrompt?: string;
    provider?: string;
    actualProvider?: string | null;
    model?: string;
    actualModel?: string | null;
    seed?: number | null;
    steps?: number;
    cfg?: number;
    sampler?: string;
    scheduler?: string;
    width?: number;
    height?: number;
    denoise?: number;
    loras?: Array<{ name: string; strength?: number; modelStrength?: number; civitaiId?: string; triggerWords?: string; triggers?: string }>;
    timestamp?: number;
  } | null;
  onApplyToCanvas?: (params: {
    prompt?: string;
    negativePrompt?: string;
    checkpoint?: string;
    provider?: string;
    seed?: number;
    steps?: number;
    cfg?: number;
    sampler?: string;
    scheduler?: string;
    width?: number;
    height?: number;
    loras?: any[];
  }) => void;
  onSendToImg2Img?: (imageUrl: string, prompt?: string) => void;
  onSendToImg2Video?: (imageUrl: string, prompt?: string) => void;
}

export const ImageDetailModal: React.FC<ImageDetailModalProps> = ({
  isOpen,
  onClose,
  item,
  onApplyToCanvas,
  onSendToImg2Img,
  onSendToImg2Video,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);

  if (!isOpen || !item) return null;

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleDownload = () => {
    const downloadUrl = item.videoUrl || item.url;
    const isVid = item.mediaType === 'video' || item.videoUrl;
    const filename = `comfycanvas_${Date.now()}.${isVid ? 'mp4' : 'jpg'}`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const isVideo = item.mediaType === 'video' || Boolean(item.videoUrl) || item.url?.includes('.mp4') || item.model?.includes('video');
  const mediaSource = item.videoUrl || item.url;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-[#16171d] border border-[#2c2e3a] rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-xs">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#262833] bg-[#121317] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-cyan-600 to-indigo-600 text-white font-bold shadow-md shadow-cyan-600/20">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                高保真画质与元数据查看器 (Image & Workflow Inspector)
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/25">
                  {item.actualProvider || item.provider || 'ComfyUI 云端渲染引擎'}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                完整查看潜空间生成参数、采样器配置、LoRA 挂载矩阵及提示词
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 rounded-lg bg-[#22242e] hover:bg-[#2c303d] text-slate-200 hover:text-white font-medium flex items-center gap-1.5 border border-[#343746] transition-colors"
              title="下载原图 / 高清视频"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>下载</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-[#252731] transition-colors text-sm"
              title="关闭"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body (Left: Preview, Right: Parameter details) */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-0">
          {/* Left Column: Media Stage (7 cols) */}
          <div className="lg:col-span-7 p-5 bg-[#0f1014] flex flex-col items-center justify-center border-b lg:border-b-0 lg:border-r border-[#242631] relative group min-h-[380px]">
            {isVideo ? (
              <video
                src={mediaSource}
                controls
                autoPlay
                loop
                playsInline
                className="max-h-[70vh] max-w-full rounded-xl shadow-2xl object-contain border border-[#252733]"
              />
            ) : (
              <div
                className={`relative overflow-hidden rounded-xl border border-[#252733] shadow-2xl max-h-[70vh] flex items-center justify-center cursor-zoom-in ${
                  isZoomed ? 'scale-125 transition-transform duration-300' : ''
                }`}
                onClick={() => setIsZoomed(!isZoomed)}
                title="点击局部放大查看"
              >
                <img
                  src={mediaSource}
                  alt={item.prompt || 'Generated Output'}
                  className="max-h-[70vh] max-w-full object-contain"
                />
              </div>
            )}

            {/* Floating Action Pills */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 w-full">
              {onApplyToCanvas && (
                <button
                  onClick={() => {
                    onApplyToCanvas({
                      prompt: item.prompt,
                      negativePrompt: item.negativePrompt,
                      checkpoint: item.model,
                      provider: item.provider,
                      seed: item.seed != null ? item.seed : undefined,
                      steps: item.steps,
                      cfg: item.cfg,
                      sampler: item.sampler,
                      scheduler: item.scheduler,
                      width: item.width,
                      height: item.height,
                      loras: item.loras,
                    });
                    onClose();
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-cyan-600/30 transition-all active:scale-95"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>一键应用全部参数至画布</span>
                </button>
              )}

              {onSendToImg2Img && (
                <button
                  onClick={() => {
                    onSendToImg2Img(item.url, item.prompt);
                    onClose();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 font-semibold text-xs flex items-center gap-1.5 transition-all"
                  title="以此图为参考底图新建图生图取景框"
                >
                  <GitBranch className="w-3.5 h-3.5 text-purple-400" />
                  <span>发送到图生图 (Img2Img)</span>
                </button>
              )}

              {onSendToImg2Video && (
                <button
                  onClick={() => {
                    onSendToImg2Video(item.url, item.prompt);
                    onClose();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-pink-600/20 hover:bg-pink-600/30 border border-pink-500/40 text-pink-300 font-semibold text-xs flex items-center gap-1.5 transition-all"
                  title="以此图为首帧生成 5 秒电影级 AI 动态视频"
                >
                  <Video className="w-3.5 h-3.5 text-pink-400" />
                  <span>以此图生成 AI 视频</span>
                </button>
              )}
            </div>
          </div>

          {/* Right Column: Parameters Breakdown (5 cols) */}
          <div className="lg:col-span-5 p-5 space-y-4 bg-[#14151a]">
            {/* Positive Prompt */}
            <div className="bg-[#1b1c24] border border-[#272935] rounded-xl p-3 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-amber-300 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  正向提示词 (Positive Prompt)
                </span>
                <button
                  onClick={() => handleCopy('prompt', item.prompt || '')}
                  className="text-slate-400 hover:text-white flex items-center gap-1 text-[10px] font-mono"
                >
                  {copiedKey === 'prompt' ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">已复制</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>复制</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-[11px] text-slate-200 font-mono leading-relaxed bg-[#111216] p-2.5 rounded-lg border border-[#242633] select-text">
                {item.prompt || 'Untitled Generation Prompt'}
              </p>
            </div>

            {/* Negative Prompt if exists */}
            {item.negativePrompt && (
              <div className="bg-[#1b1c24] border border-[#272935] rounded-xl p-3 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-rose-300">负向提示词 (Negative Prompt)</span>
                  <button
                    onClick={() => handleCopy('negPrompt', item.negativePrompt || '')}
                    className="text-slate-400 hover:text-white flex items-center gap-1 text-[10px] font-mono"
                  >
                    {copiedKey === 'negPrompt' ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">已复制</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>复制</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-slate-300 font-mono leading-relaxed bg-[#111216] p-2 rounded-lg border border-[#242633] select-text">
                  {item.negativePrompt}
                </p>
              </div>
            )}

            {/* Model & Sampling Grid Parameters */}
            <div className="bg-[#1b1c24] border border-[#272935] rounded-xl p-3 space-y-2.5">
              <div className="font-bold text-slate-200 text-[11px] flex items-center gap-1.5 pb-1 border-b border-[#252733]">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                <span>生成核心参数 (Core Generation Parameters)</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="bg-[#111216] p-2 rounded-lg border border-[#242633]">
                  <span className="text-slate-500 text-[10px] block">CHECKPOINT MODEL</span>
                  <span className="text-cyan-300 font-semibold truncate block" title={item.actualModel || item.model || 'FLUX.1'}>
                    {item.actualModel || item.model || 'FLUX.1'}
                  </span>
                </div>

                <div className="bg-[#111216] p-2 rounded-lg border border-[#242633]">
                  <span className="text-slate-500 text-[10px] block">ENGINE PROVIDER</span>
                  <span className="text-purple-300 font-semibold truncate block" title={item.actualProvider || item.provider || 'Fal.ai'}>
                    {item.actualProvider || item.provider || 'Fal.ai'}
                  </span>
                </div>

                <div className="bg-[#111216] p-2 rounded-lg border border-[#242633] flex items-center justify-between">
                  <div>
                    <span className="text-slate-500 text-[10px] block">SEED (种子)</span>
                    <span className="text-emerald-300 font-semibold">{item.seed != null ? item.seed : '—'}</span>
                  </div>
                  <button
                    onClick={() => handleCopy('seed', String(item.seed ?? '—'))}
                    className="p-1 hover:text-white text-slate-400"
                    title="复制种子"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>

                <div className="bg-[#111216] p-2 rounded-lg border border-[#242633]">
                  <span className="text-slate-500 text-[10px] block">STEPS / CFG</span>
                  <span className="text-amber-300 font-semibold">
                    {item.steps ?? 28} 步 / CFG {item.cfg ?? 3.5}
                  </span>
                </div>

                <div className="bg-[#111216] p-2 rounded-lg border border-[#242633]">
                  <span className="text-slate-500 text-[10px] block">SAMPLER / SCHEDULER</span>
                  <span className="text-slate-300 font-semibold">
                    {item.sampler || 'euler'} / {item.scheduler || 'normal'}
                  </span>
                </div>

                <div className="bg-[#111216] p-2 rounded-lg border border-[#242633]">
                  <span className="text-slate-500 text-[10px] block">RESOLUTION (尺寸)</span>
                  <span className="text-slate-300 font-semibold">
                    {item.width || 1024} x {item.height || 1024}
                  </span>
                </div>
              </div>
            </div>

            {/* Loaded LoRAs Matrix if present */}
            {item.loras && item.loras.length > 0 && (
              <div className="bg-[#1b1c24] border border-[#272935] rounded-xl p-3 space-y-2">
                <div className="font-bold text-purple-300 text-[11px] flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-purple-400" />
                    已挂载微调 LoRA ({item.loras.length})
                  </span>
                </div>

                <div className="space-y-1.5">
                  {item.loras.map((l, idx) => (
                    <div
                      key={idx}
                      className="bg-[#111216] p-2 rounded-lg border border-[#252836] flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="font-mono font-semibold text-purple-300 text-[11px] truncate">
                          {l.name}
                        </p>
                        {(l.triggerWords || l.triggers) && (
                          <p className="text-[10px] text-slate-400 font-mono truncate">
                            触发词: {l.triggerWords || l.triggers}
                          </p>
                        )}
                      </div>
                      <span className="px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 text-[10px] font-mono border border-purple-800/40 shrink-0">
                        强度: {(l.modelStrength ?? l.strength) != null ? Number(l.modelStrength ?? l.strength).toFixed(2) : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
