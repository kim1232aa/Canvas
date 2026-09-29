import React, { useState } from 'react';
import {
  Play,
  Loader2,
  Sliders,
  Sparkles,
  Download,
  Maximize2,
  Copy,
  Trash2,
  Layers,
  Dices,
  RefreshCw,
  GitBranch,
  AlertCircle,
  AlertTriangle,
} from 'lucide-react';
import { SpatialFrame, ComfyParameters } from '../types/graph';
import { refinePromptWithGemini, getRefineModelSelection } from '../services/api';
import { validateModelCompatibility } from '../utils/baseModelMatcher';

interface SpatialFrameItemProps {
  frame: SpatialFrame;
  isSelected: boolean;
  zoom: number;
  onSelect: (e: React.MouseEvent) => void;
  onStartDrag: (e: React.MouseEvent, frameId: string) => void;
  onUpdateFrame: (frameId: string, partial: Partial<SpatialFrame>) => void;
  onDeleteFrame: (frameId: string) => void;
  onQueueFrame: (frameId: string) => void;
  onOpenInspector: (frameId: string) => void;
  onPreviewImage: (url: string) => void;
  onBranchVariation: (frame: SpatialFrame) => void;
}

export const SpatialFrameItem: React.FC<SpatialFrameItemProps> = ({
  frame,
  isSelected,
  zoom,
  onSelect,
  onStartDrag,
  onUpdateFrame,
  onDeleteFrame,
  onQueueFrame,
  onOpenInspector,
  onPreviewImage,
  onBranchVariation,
}) => {
  const [isRefining, setIsRefining] = useState(false);

  const handleRefine = async () => {
    if (!frame.prompt) return;
    const selection = getRefineModelSelection();
    const provider = (frame.params as any).refineProvider || selection.provider;
    const model = (frame.params as any).refineModel || selection.model;
    if (!provider || !model) {
      alert('请先选择润色模型');
      return;
    }
    setIsRefining(true);
    try {
      const refined = await refinePromptWithGemini(
        frame.prompt,
        {
          provider,
          model,
          loras: frame.params.loras,
        }
      );
      if (refined) {
        onUpdateFrame(frame.id, { prompt: refined });
      }
    } catch (e: any) {
      alert(e.message || '润色失败');
      console.error(e);
    } finally {
      setIsRefining(false);
    }
  };

  const handleRerollSeed = () => {
    onUpdateFrame(frame.id, {
      params: {
        ...frame.params,
        seed: Math.floor(Math.random() * 1000000000),
      },
    });
  };

  return (
    <div
      id={`frame-${frame.id}`}
      style={{
        transform: `translate(${frame.pos.x}px, ${frame.pos.y}px)`,
        width: Math.max(frame.width, 360),
      }}
      onClick={onSelect}
      className={`absolute rounded-2xl border transition-all text-xs ${
        isSelected
          ? 'ring-2 ring-cyan-400 border-cyan-500/80 shadow-2xl shadow-cyan-500/25'
          : 'border-[#292b36] shadow-2xl shadow-black/80'
      } ${
        frame.status === 'generating'
          ? 'border-amber-400 ring-2 ring-amber-400/50'
          : 'bg-[#15161c]/95'
      } backdrop-blur-2xl overflow-hidden flex flex-col`}
    >
      {/* Frame Header Bar */}
      <div
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).closest('button, input, textarea, select')) return;
          onStartDrag(e, frame.id);
        }}
        className="px-4 py-2.5 bg-[#121318] border-b border-[#242631] cursor-grab active:cursor-grabbing flex items-center justify-between select-none"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400/50" />
          <span className="font-bold text-white tracking-wide truncate text-[13px]">
            {frame.title}
          </span>
          <span className="text-[10px] font-mono text-slate-400 bg-[#1c1d25] px-2 py-0.5 rounded border border-[#2b2d38]">
            {frame.params.width}×{frame.params.height}
          </span>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onOpenInspector(frame.id)}
            className="px-2 py-1 rounded bg-[#20222b] hover:bg-[#2b2e3a] text-cyan-300 font-mono text-[10px] flex items-center gap-1 border border-[#303342] transition-colors"
            title="调节完整 ComfyUI 参数 (KSampler, LoRA, Checkpoint)"
          >
            <Sliders className="w-3 h-3 text-cyan-400" />
            <span>ComfyUI 参数</span>
          </button>
          <button
            onClick={() => onDeleteFrame(frame.id)}
            className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-[#20222b] transition-colors"
            title="删除选区框"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ComfyUI Parameter Quick Bar (Real-time active indicators) */}
      <div className="px-3.5 py-1.5 bg-[#181922] border-b border-[#22242e] flex items-center justify-between text-[10px] font-mono text-slate-300 overflow-x-auto gap-2">
        <div className="flex items-center gap-2 truncate">
          <span className="text-cyan-400 font-semibold truncate max-w-[130px]">
            {frame.params.checkpoint.split('/').pop()}
          </span>
          <span>·</span>
          <span>{frame.params.sampler} ({frame.params.scheduler})</span>
          <span>·</span>
          <span>{frame.params.steps}步</span>
          <span>·</span>
          <span>CFG {frame.params.cfg}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleRerollSeed}
            className="flex items-center gap-1 text-slate-400 hover:text-white"
            title="摇随机种子"
          >
            <span>{frame.params.seed}</span>
            <Dices className="w-3 h-3 text-cyan-400" />
          </button>
        </div>
      </div>

      {/* Frame Visual Media Area (Image or Video) */}
      <div className="relative aspect-square w-full bg-[#0d0e12] overflow-hidden flex items-center justify-center group">
        {frame.videoUrl ? (
          <div className="relative w-full h-full flex items-center justify-center bg-black">
            <video
              src={frame.videoUrl}
              autoPlay
              loop
              muted
              playsInline
              controls
              className="w-full h-full object-contain cursor-pointer"
            />
            {/* Top Video Badge */}
            <div className="absolute top-2 left-2 pointer-events-none">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-purple-950/80 text-purple-300 border border-purple-800/80 backdrop-blur-md flex items-center gap-1">
                <span>🎥 AI 视频 (5s)</span>
              </span>
            </div>
            {/* Video overlay action bar */}
            <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <a
                href={frame.videoUrl}
                download={`comfycanvas_${frame.id}.mp4`}
                className="p-1.5 rounded-lg bg-black/70 hover:bg-black/90 text-white shadow-lg text-[10px] flex items-center gap-1"
                title="下载 MP4 视频"
              >
                <Download className="w-3.5 h-3.5" />
                <span>下载 MP4</span>
              </a>
            </div>
          </div>
        ) : frame.imageUrl ? (
          <>
            <img
              src={frame.imageUrl}
              alt={frame.prompt}
              className="w-full h-full object-contain cursor-pointer transition-transform duration-300 group-hover:scale-102"
              onClick={() => onPreviewImage(frame.imageUrl!)}
            />
            {/* Overlay Action Bar */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
              <button
                onClick={() => onPreviewImage(frame.imageUrl!)}
                className="p-2.5 rounded-full bg-[#1e2029] hover:bg-[#282b37] text-white shadow-lg"
                title="查看高清原图"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => onBranchVariation(frame)}
                className="px-3 py-2 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-lg shadow-cyan-600/30"
                title="以此图衍生变体分支 (Img2Img)"
              >
                <GitBranch className="w-3.5 h-3.5" />
                <span>衍生新分支</span>
              </button>
              <button
                onClick={() => {
                  onUpdateFrame(frame.id, { mediaType: 'video' });
                }}
                className="px-3 py-2 rounded-full bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-lg shadow-purple-600/30"
                title="以此图为首帧生成 AI 动态视频 (Image to Video)"
              >
                <span>🎥 图生视频</span>
              </button>
              <a
                href={frame.imageUrl}
                download={`comfycanvas_${frame.id}.jpg`}
                className="p-2.5 rounded-full bg-[#1e2029] hover:bg-[#282b37] text-white shadow-lg"
                title="下载原图"
              >
                <Download className="w-4 h-4" />
              </a>
            </div>
          </>
        ) : (
          <div className="text-center p-6 text-slate-500 space-y-2">
            <div className="w-12 h-12 rounded-2xl border-2 border-dashed border-[#292c39] mx-auto flex items-center justify-center text-slate-600">
              <Sparkles className="w-5 h-5 text-cyan-500/40" />
            </div>
            <div>
              <p className="font-semibold text-slate-300 text-xs">
                {frame.mediaType === 'video' ? '🎥 AI 动态视频取景框' : '无限画布生成取景框'}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {frame.mediaType === 'video'
                  ? '输入提示词或选择底图，一键生成 5秒 电影级动态运镜视频'
                  : '输入提示词并配置 ComfyUI 参数后点击生成'}
              </p>
            </div>
          </div>
        )}

        {/* Generating Overlay Animation with Live Progress Bar & Stages */}
        {frame.status === 'generating' && (
          <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-cyan-400 z-10 space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
            <div className="w-full max-w-[280px] space-y-2 text-center">
              <p className="text-xs font-bold tracking-wide text-white">
                {frame.mediaType === 'video'
                  ? '🎬 电影级 AI 动态视频解算中 (Wan 2.1)...'
                  : `⚡ ${frame.params.targetProvider.toUpperCase()} 扩散采样渲染中...`}
              </p>
              <div className="w-full bg-[#1e2029] rounded-full h-2 overflow-hidden border border-[#2b2d3a]">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 via-indigo-500 to-purple-500 rounded-full transition-all duration-300"
                  style={{ width: `${frame.executionProgress ?? 0}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span className="truncate max-w-[180px] text-left">{frame.executionStage || '准备中...'}</span>
                <span className="text-cyan-400 font-bold">{frame.executionProgress ?? 0}%</span>
              </div>
            </div>
          </div>
        )}

        {/* Error State Overlay */}
        {frame.status === 'error' && frame.errorMessage && (
          <div className="absolute inset-0 bg-[#160b0e]/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-10 space-y-3">
            <div className="w-11 h-11 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="space-y-1 max-w-[90%]">
              <h4 className="text-xs font-bold text-rose-300">生成执行未完成</h4>
              <p className="text-[11px] text-rose-200/80 leading-relaxed font-mono break-words bg-rose-950/40 p-2.5 rounded-lg border border-rose-900/50">
                {frame.errorMessage}
              </p>
            </div>
            <button
              onClick={() => onQueueFrame(frame.id)}
              className="px-3.5 py-1.5 rounded-lg bg-rose-600/80 hover:bg-rose-500 text-white text-[11px] font-semibold flex items-center gap-1.5 transition-colors shadow-md shadow-rose-900/30"
            >
              <RefreshCw className="w-3 h-3" />
              <span>重试当前选区</span>
            </button>
          </div>
        )}
      </div>

      {/* Frame Footer Controls: Prompt Box & Queue Trigger */}
      <div className="p-3.5 bg-[#15161c] border-t border-[#232530] space-y-2.5">
        {/* Media Mode Segmented Switch (Image vs Video) */}
        <div className="flex items-center justify-between pb-1 border-b border-[#21232d] text-[11px]">
          <div className="flex items-center p-0.5 bg-[#0e0f13] border border-[#242633] rounded-lg">
            <button
              onClick={() => onUpdateFrame(frame.id, { mediaType: 'image' })}
              className={`px-2.5 py-1 rounded font-semibold transition-all ${
                frame.mediaType !== 'video'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🖼️ 静态图像
            </button>
            <button
              onClick={() => onUpdateFrame(frame.id, { mediaType: 'video' })}
              className={`px-2.5 py-1 rounded font-semibold transition-all ${
                frame.mediaType === 'video'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🎥 动态视频 (Wan 2.1)
            </button>
          </div>

          {frame.mediaType === 'video' && (
            <div className="flex items-center gap-1 text-[10px] text-purple-300 font-mono">
              <span className="px-1.5 py-0.5 rounded bg-purple-950/60 border border-purple-800/40">5秒</span>
              <span className="px-1.5 py-0.5 rounded bg-purple-950/60 border border-purple-800/40">16 fps</span>
              <span className="px-1.5 py-0.5 rounded bg-purple-950/60 border border-purple-800/40">16:9</span>
            </div>
          )}
        </div>
        {/* Positive Prompt Textarea */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span className="font-semibold text-slate-300">正向提示词 (Positive)</span>
            <button
              onClick={handleRefine}
              disabled={isRefining || !frame.prompt}
              className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/40 disabled:opacity-50"
            >
              {isRefining ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              <span>AI 优化</span>
            </button>
          </div>
          <textarea
            rows={3}
            value={frame.prompt || ''}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onChange={(e) => onUpdateFrame(frame.id, { prompt: e.target.value })}
            placeholder="描述你想在无限画布中生成的画面..."
            className="w-full bg-[#101115] border border-[#272935] focus:border-cyan-500 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 outline-none leading-relaxed resize-y font-mono select-text cursor-text shadow-inner"
          />
        </div>

        {/* Civitai LoRAs Tag Summary & Compatibility */}
        {frame.params.loras.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1 items-center">
              <span className="text-[10px] text-slate-400 font-mono">LoRAs:</span>
              {frame.params.loras.map((l, i) => {
                const compat = validateModelCompatibility(frame.params.checkpoint, (l as any).baseModel, l.name, frame.params.targetProvider);
                return (
                  <span
                    key={i}
                    title={compat.isCompatible ? '与当前底模架构兼容' : compat.message}
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded flex items-center gap-1 ${
                      compat.isCompatible
                        ? 'bg-purple-950/50 text-purple-300 border border-purple-800/40'
                        : 'bg-rose-950/60 text-rose-300 border border-rose-700/50'
                    }`}
                  >
                    {!compat.isCompatible && <AlertTriangle className="w-2.5 h-2.5 text-rose-400 shrink-0" />}
                    <span>{l.name.replace('.safetensors', '')} ({l.modelStrength})</span>
                  </span>
                );
              })}
            </div>

            {/* Incompatibility quick warning & fix */}
            {(() => {
              const incompatibleLora = frame.params.loras.find((l) => {
                const compat = validateModelCompatibility(frame.params.checkpoint, (l as any).baseModel, l.name, frame.params.targetProvider);
                return !compat.isCompatible;
              });
              if (!incompatibleLora) return null;
              const compat = validateModelCompatibility(frame.params.checkpoint, (incompatibleLora as any).baseModel, incompatibleLora.name, frame.params.targetProvider);
              return (
                <div className="bg-amber-950/40 border border-amber-500/40 rounded-lg p-2 text-[10px] space-y-1 text-amber-200">
                  <div className="flex items-center gap-1 text-amber-400 font-semibold">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    <span>LoRA 架构与底模不匹配</span>
                  </div>
                  {compat.recommendedCheckpoint && (
                    <button
                      onClick={() =>
                        onUpdateFrame(frame.id, {
                          params: { ...frame.params, checkpoint: compat.recommendedCheckpoint! },
                        })
                      }
                      className="w-full py-1 px-2 rounded bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/40 text-amber-200 font-bold flex items-center justify-center gap-1 transition-colors"
                    >
                      <span>一键切换为兼容底模 ({compat.recommendedCheckpoint.split('/').pop()})</span>
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* Queue Frame Button */}
        {frame.mediaType === 'video' && !frame.params?.checkpoint && (
          <div className="text-[10px] text-amber-400 font-mono text-center pb-1">
            请先选择模型
          </div>
        )}
        <button
          onClick={() => onQueueFrame(frame.id)}
          disabled={frame.status === 'generating' || (frame.mediaType === 'video' && !frame.params?.checkpoint)}
          className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-all ${
            frame.status === 'generating' || (frame.mediaType === 'video' && !frame.params?.checkpoint)
              ? 'bg-amber-600/50 text-amber-200 cursor-not-allowed'
              : frame.mediaType === 'video'
              ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-purple-600/30 active:scale-[0.98]'
              : 'bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white shadow-cyan-600/25 active:scale-[0.98]'
          }`}
          title={frame.mediaType === 'video' && !frame.params?.checkpoint ? '请先选择模型' : undefined}
        >
          {frame.status === 'generating' ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{frame.mediaType === 'video' ? 'AI 视频解算渲染中 (5秒)...' : '图像渲染中...'}</span>
            </>
          ) : frame.mediaType === 'video' && !frame.params?.checkpoint ? (
            <>
              <Play className="w-3.5 h-3.5 fill-current opacity-60" />
              <span>请先选择模型</span>
            </>
          ) : frame.mediaType === 'video' ? (
            <>
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>渲染 5秒 电影级动态视频 (Wan 2.1 / LTX)</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>生成此选区 (Queue Frame)</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
