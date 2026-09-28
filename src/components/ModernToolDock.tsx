import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Plus,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Map,
  Layers,
  LayoutGrid,
  ChevronUp,
  Cpu,
  Video,
  Image as ImageIcon,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { CanvasMode } from '../types/graph';

interface ModernToolDockProps {
  canvasMode: CanvasMode;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onFitView: () => void;
  isMinimapOpen: boolean;
  onToggleMinimap: () => void;
  onAddSpatialFrame: () => void;
  onAddNode: (type: string) => void;
  onOpenCivitai: () => void;
  onClearCanvas?: (type: 'all' | 'nodes' | 'frames' | 'reset-default') => void;
}

export const ModernToolDock: React.FC<ModernToolDockProps> = ({
  canvasMode,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onFitView,
  isMinimapOpen,
  onToggleMinimap,
  onAddSpatialFrame,
  onAddNode,
  onOpenCivitai,
  onClearCanvas,
}) => {
  const [showAddNodeMenu, setShowAddNodeMenu] = useState(false);
  const [showClearMenu, setShowClearMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const clearRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as HTMLElement)) {
        setShowAddNodeMenu(false);
      }
      if (clearRef.current && !clearRef.current.contains(e.target as HTMLElement)) {
        setShowClearMenu(false);
      }
    };
    if (showAddNodeMenu || showClearMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAddNodeMenu, showClearMenu]);

  const nodeGroups = [
    {
      group: '常用基础节点',
      items: [
        { type: 'KSampler', label: 'KSampler 采样器', desc: '控制步数、CFG、采样算法与种子', tag: '核心' },
        { type: 'CheckpointLoaderSimple', label: 'Load Checkpoint', desc: '加载底模 (FLUX, SDXL, Wan)', tag: '底模' },
        { type: 'CLIPTextEncode', label: '正向提示词 (CLIP)', desc: '描述主体、构图与画质', tag: '正向' },
        { type: 'CLIPTextEncodeNegative', label: '负向提示词 (Negative)', desc: '过滤变形、模糊与瑕疵', tag: '负向' },
        { type: 'EmptyLatentImage', label: 'Empty Latent Image', desc: '设定生图尺寸与批次', tag: '尺寸' },
        { type: 'SaveImage', label: 'Save Image 保存图像', desc: '渲染完成展示与下载', tag: '输出' },
      ],
    },
    {
      group: 'LoRA 与加速引擎',
      items: [
        { type: 'LoRALoader', label: 'Load LoRA 风格微调', desc: '调节模型与CLIP权重强度', tag: 'LoRA' },
        { type: 'CivitaiLoRABrowserNode', label: 'Civitai LoRA 浏览器', desc: '搜索并一键导入社区模型', tag: '社区' },
        { type: 'FalAIEngineNode', label: 'Fal.ai GPU 加速引擎', desc: '极速 FLUX / SDXL 云端直出', tag: '加速' },
      ],
    },
    {
      group: '多媒体与 AI 视频',
      items: [
        { type: 'AIVideoNode', label: 'AI 视频生成节点', desc: 'Wan 2.1 / LTX 5秒电影运镜', tag: '视频' },
        { type: 'SaveVideo', label: 'Save Video 保存视频', desc: 'AI 动态视频播放与 MP4 下载', tag: '视频' },
        { type: 'LoadImage', label: 'Load Image 参考图', desc: '图生图 / 图生视频首帧底图', tag: '参考' },
      ],
    },
  ];

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 pointer-events-auto">
      {/* Floating Main Dock Pill */}
      <div className="bg-[#14151b]/95 backdrop-blur-2xl border border-[#272935] rounded-2xl px-3 py-1.5 shadow-2xl flex items-center gap-2 text-xs">
        {/* Add Node Dropdown Trigger */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowAddNodeMenu(!showAddNodeMenu)}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold flex items-center gap-1.5 shadow-md shadow-purple-600/20 transition-all active:scale-95"
            title="在画布上放置新的 ComfyUI 节点"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>添加节点</span>
            <ChevronUp className={`w-3.5 h-3.5 transition-transform ${showAddNodeMenu ? 'rotate-180' : ''}`} />
          </button>

          {/* Add Node Popover Menu */}
          {showAddNodeMenu && (
            <div className="absolute bottom-12 left-0 w-80 bg-[#161720] border border-[#2b2d39] rounded-2xl p-3 shadow-2xl space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-150 z-50 max-h-[70vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-[#252733] pb-2">
                <span className="font-bold text-white text-xs">选择要添加的节点</span>
                <span className="text-[10px] text-cyan-400 font-mono">ComfyUI 体系</span>
              </div>

              {nodeGroups.map((group) => (
                <div key={group.group} className="space-y-1">
                  <div className="text-[10px] font-mono text-slate-400 px-1">{group.group}</div>
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <button
                        key={item.type}
                        onClick={() => {
                          onAddNode(item.type);
                          setShowAddNodeMenu(false);
                        }}
                        className="w-full text-left p-2 rounded-xl hover:bg-[#222430] border border-transparent hover:border-[#2d3040] text-slate-200 transition-colors flex items-center justify-between group"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-semibold text-white text-xs group-hover:text-cyan-300 transition-colors">
                            {item.label}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">{item.desc}</div>
                        </div>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#101116] border border-[#2b2d39] text-slate-300 shrink-0">
                          {item.tag}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Spatial Frame Button */}
        <button
          onClick={onAddSpatialFrame}
          className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold flex items-center gap-1.5 shadow-md shadow-cyan-600/20 transition-all active:scale-95"
          title="在无限画布上放置新的生成取景框"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>新建取景框</span>
        </button>

        {/* Universal LoRA Hub Quick Trigger */}
        <button
          onClick={onOpenCivitai}
          className="px-2.5 py-1.5 rounded-xl bg-[#1e202a] hover:bg-[#262835] border border-[#2c2f3d] text-purple-300 hover:text-white font-semibold flex items-center gap-1.5 transition-colors"
          title="打开全生态 LoRA 模型中心 (Civitai / Hugging Face / 魔搭社区 / Fal.ai)"
        >
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          <span>LoRA 模型中心</span>
        </button>

        {/* Clear Canvas Quick Trigger */}
        {onClearCanvas && (
          <div className="relative" ref={clearRef}>
            <button
              onClick={() => setShowClearMenu(!showClearMenu)}
              className="px-2.5 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-950/80 border border-rose-800/50 text-rose-300 hover:text-rose-200 font-semibold flex items-center gap-1.5 transition-colors"
              title="一键清空画布 / 重置工作流"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>清空</span>
            </button>

            {showClearMenu && (
              <div className="absolute bottom-12 left-1/2 -translate-x-1/2 w-60 bg-[#161722] border border-[#2e2b3c] rounded-2xl p-2 shadow-2xl space-y-1 animate-in fade-in slide-in-from-bottom-2 duration-150 z-50 text-xs">
                <div className="px-2 py-1 border-b border-[#252433] text-[11px] font-bold text-slate-300 flex items-center justify-between">
                  <span>画布清理选项</span>
                  <span className="text-[9px] font-mono text-rose-400">一键生效</span>
                </div>

                <button
                  onClick={() => {
                    if (confirm('确定一键清空整个画布（包括所有节点、连线与画板）吗？')) {
                      onClearCanvas('all');
                      setShowClearMenu(false);
                    }
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-rose-950/50 text-rose-300 transition-colors flex items-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <div>
                    <div className="font-semibold">一键清空全部</div>
                    <div className="text-[9px] text-slate-400">清空所有节点、连线与空间画板</div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    if (confirm('确定清空所有 ComfyUI 节点与连线吗？')) {
                      onClearCanvas('nodes');
                      setShowClearMenu(false);
                    }
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-[#222432] text-slate-300 transition-colors flex items-center gap-2"
                >
                  <Layers className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  <div>
                    <div className="font-semibold text-white">仅清空节点连线</div>
                    <div className="text-[9px] text-slate-400">保留空间画板，清空全部节点</div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    if (confirm('确定清空所有空间画板取景框吗？')) {
                      onClearCanvas('frames');
                      setShowClearMenu(false);
                    }
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-[#222432] text-slate-300 transition-colors flex items-center gap-2"
                >
                  <LayoutGrid className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <div>
                    <div className="font-semibold text-white">仅清空空间画板</div>
                    <div className="text-[9px] text-slate-400">保留节点连线，清空全部画板</div>
                  </div>
                </button>

                <div className="pt-1 border-t border-[#252433]">
                  <button
                    onClick={() => {
                      if (confirm('确定恢复为标准默认工作流模板吗？')) {
                        onClearCanvas('reset-default');
                        setShowClearMenu(false);
                      }
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-cyan-950/40 text-cyan-300 transition-colors flex items-center gap-2"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <div>
                      <div className="font-semibold">重置为默认工作流</div>
                      <div className="text-[9px] text-slate-400">恢复标准 FLUX.1 + SDXL 预设</div>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Vertical divider */}
        <div className="h-5 w-[1px] bg-[#272935]" />

        {/* Zoom Controls Island */}
        <div className="flex items-center gap-1 text-slate-400 font-mono text-[11px]">
          <button
            onClick={onZoomOut}
            className="p-1.5 hover:text-white hover:bg-[#20222b] rounded-lg transition-colors"
            title="缩小画布"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onZoomReset}
            className="px-1.5 py-0.5 hover:text-white hover:bg-[#20222b] rounded transition-colors"
            title="恢复 100% 缩放"
          >
            {Math.round(zoom * 100)}%
          </button>

          <button
            onClick={onZoomIn}
            className="p-1.5 hover:text-white hover:bg-[#20222b] rounded-lg transition-colors"
            title="放大画布"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onFitView}
            className="p-1.5 hover:text-white hover:bg-[#20222b] rounded-lg transition-colors ml-0.5"
            title="适配所有元素 (Fit View)"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onToggleMinimap}
            className={`p-1.5 rounded-lg transition-colors ml-0.5 ${
              isMinimapOpen ? 'text-cyan-400 bg-cyan-950/40' : 'hover:text-white hover:bg-[#20222b]'
            }`}
            title="开闭雷达小地图"
          >
            <Map className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
