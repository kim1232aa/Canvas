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
}) => {
  const [showAddNodeMenu, setShowAddNodeMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as HTMLElement)) {
        setShowAddNodeMenu(false);
      }
    };
    if (showAddNodeMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAddNodeMenu]);

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
