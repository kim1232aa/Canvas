import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  HelpCircle,
  Cpu,
  Layers,
  Sliders,
  FolderOpen,
  Play,
  Loader2,
  Clock,
  Settings,
  LayoutGrid,
  BookOpen,
  Video,
  Trash2,
  ChevronDown,
  RotateCcw,
} from 'lucide-react';
import { CanvasMode } from '../types/graph';

interface TopBarProps {
  nodeCount: number;
  connectionCount: number;
  projectName?: string;
  canvasMode: CanvasMode;
  onChangeCanvasMode: (mode: CanvasMode) => void;
  onOpenSettings: () => void;
  onOpenCivitai: () => void;
  onOpenBaseModelHub?: () => void;
  onOpenLoRAHub?: () => void;
  onOpenVideoHub?: () => void;
  onOpenGuide?: () => void;
  onOpenWorkflowPresets?: () => void;
  onOpenCivitaiImport?: () => void;
  onOpenProviderMatrix?: () => void;
  onOpenCanvasManager?: () => void;
  onOpenAssetManager?: () => void;
  onOpenHistory?: () => void;
  onOpenParamsDrawer?: () => void;
  isParamsDrawerOpen?: boolean;
  onQueuePrompt?: () => void;
  isExecuting?: boolean;
  executionStatusText?: string;
  executionProgress?: number;
  onClearCanvas?: (type: 'all' | 'nodes' | 'frames' | 'reset-default') => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  nodeCount,
  connectionCount,
  projectName = '赛博朋克与写实人像工作室',
  canvasMode,
  onChangeCanvasMode,
  onOpenSettings,
  onOpenCivitai,
  onOpenBaseModelHub,
  onOpenLoRAHub,
  onOpenVideoHub,
  onOpenGuide,
  onOpenWorkflowPresets,
  onOpenCivitaiImport,
  onOpenProviderMatrix,
  onOpenCanvasManager,
  onOpenAssetManager,
  onOpenHistory,
  onOpenParamsDrawer,
  isParamsDrawerOpen = false,
  onQueuePrompt,
  isExecuting = false,
  executionStatusText = '',
  executionProgress = 0,
  onClearCanvas,
}) => {
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showClearMenu, setShowClearMenu] = useState(false);
  const clearMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (clearMenuRef.current && !clearMenuRef.current.contains(e.target as HTMLElement)) {
        setShowClearMenu(false);
      }
    };
    if (showClearMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showClearMenu]);

  return (
    <header className="absolute top-3 left-4 right-4 z-40 flex items-center justify-between pointer-events-none gap-3">
      {/* Left section: Brand, Project switcher, Canvas Mode toggle */}
      <div className="flex items-center gap-2 pointer-events-auto">
        {/* Brand Card */}
        <div className="bg-[#14151b]/95 backdrop-blur-xl border border-[#272935] rounded-xl px-3 py-1.5 shadow-2xl flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-cyan-500 via-blue-600 to-purple-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20">
            <Layers className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-black text-white tracking-wide">
              ComfyCanvas <span className="text-cyan-400 font-mono text-[11px]">Studio</span>
            </span>
            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              v2.5
            </span>
          </div>
        </div>

        {/* Project / Canvas Manager Button */}
        {onOpenCanvasManager && (
          <button
            onClick={onOpenCanvasManager}
            className="flex items-center gap-1.5 bg-[#14151b]/95 backdrop-blur-xl border border-[#272935] hover:border-cyan-500/50 rounded-xl px-2.5 py-1.5 shadow-xl text-xs text-slate-200 font-medium transition-all hover:bg-[#1e202a]"
            title="多画布与工程管理中心：切换画板、新建、克隆与另存为"
          >
            <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
            <span className="max-w-[120px] truncate">{projectName}</span>
            <span className="text-[10px] text-slate-500 font-mono">▾</span>
          </button>
        )}

        {/* Canvas Mode Switcher (Graph vs Spatial) */}
        <div className="flex items-center p-0.5 bg-[#101116]/95 border border-[#242633] rounded-xl backdrop-blur-md">
          <button
            onClick={() => onChangeCanvasMode('graph')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              canvasMode === 'graph'
                ? 'bg-purple-600/25 text-purple-300 border border-purple-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
            title="切换为 ComfyUI 节点连线视图"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>节点连线</span>
          </button>

          <button
            onClick={() => onChangeCanvasMode('spatial')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              canvasMode === 'spatial'
                ? 'bg-cyan-600/25 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
            title="切换为空间无限画板取景框视图"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>空间画板</span>
          </button>
        </div>
      </div>

      {/* Center section: Key Modal Tools */}
      <div className="hidden lg:flex items-center gap-1 pointer-events-auto bg-[#14151b]/95 backdrop-blur-xl border border-[#272935] rounded-xl px-2 py-1 shadow-2xl">
        {onOpenBaseModelHub && (
          <button
            onClick={onOpenBaseModelHub}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold text-cyan-300 hover:bg-cyan-500/10 flex items-center gap-1.5 transition-colors border border-cyan-500/20"
            title="基础底模 (Checkpoints)：FLUX.1、SDXL 1.0、SD 3.5、Agnes、Animagine XL 等图像基底模型检索与应用"
          >
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span>底模中心</span>
          </button>
        )}

        {onOpenVideoHub && (
          <button
            onClick={onOpenVideoHub}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10 flex items-center gap-1.5 transition-colors border border-emerald-500/20"
            title="AI 视频大模型：阿里 Wan 2.1、LTX-Video、快手可灵 1.5、CogVideoX、MiniMax 等文生/图生视频"
          >
            <Video className="w-3.5 h-3.5 text-emerald-400" />
            <span>AI 视频</span>
          </button>
        )}

        {onOpenLoRAHub && (
          <button
            onClick={onOpenLoRAHub}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold text-purple-300 hover:bg-purple-500/10 flex items-center gap-1.5 transition-colors border border-purple-500/20"
            title="微调 LoRA 枢纽：Civitai / Hugging Face / ModelScope / Tensor.Art 风格与角色微调权重"
          >
            <Layers className="w-3.5 h-3.5 text-purple-400" />
            <span>LoRA 枢纽</span>
          </button>
        )}

        <div className="w-[1px] h-4 bg-[#2b2d39] mx-1" />

        {onOpenWorkflowPresets && (
          <button
            onClick={onOpenWorkflowPresets}
            className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-300 hover:text-cyan-300 hover:bg-[#1e202b] flex items-center gap-1.5 transition-colors"
            title="工作流预设、热门模板、导入导出 JSON 与 Civitai 逆向工作流"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>工作流预设</span>
          </button>
        )}

        {onOpenProviderMatrix && (
          <button
            onClick={onOpenProviderMatrix}
            className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-300 hover:text-purple-300 hover:bg-[#1e202b] flex items-center gap-1.5 transition-colors"
            title="供应商与节点连线矩阵：各模型可用参数与连线规范"
          >
            <Cpu className="w-3.5 h-3.5 text-slate-400" />
            <span>供应商矩阵</span>
          </button>
        )}

        {onOpenAssetManager && (
          <button
            onClick={onOpenAssetManager}
            className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-300 hover:text-pink-300 hover:bg-[#1e202b] flex items-center gap-1.5 transition-colors"
            title="资产素材库：管理历次生成图像、5秒AI动态视频及参考图"
          >
            <span className="text-xs">🗃️</span>
            <span>资产库</span>
          </button>
        )}

        {/* Prominent Clear Canvas Trigger */}
        {onClearCanvas && (
          <div className="relative" ref={clearMenuRef}>
            <button
              onClick={() => setShowClearMenu(!showClearMenu)}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold text-rose-300 hover:text-rose-200 bg-rose-950/30 hover:bg-rose-950/60 border border-rose-800/40 flex items-center gap-1 transition-all shadow-sm"
              title="一键清空画布与节点重置"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>清空画布</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${showClearMenu ? 'rotate-180' : ''}`} />
            </button>

            {showClearMenu && (
              <div className="absolute top-9 right-0 w-64 bg-[#161722] border border-[#2e2b3c] rounded-2xl p-2 shadow-2xl space-y-1 animate-in fade-in slide-in-from-top-2 duration-150 z-50 text-xs">
                <div className="px-2 py-1.5 border-b border-[#252433] text-[11px] font-bold text-slate-300 flex items-center justify-between">
                  <span>画布重置与清理</span>
                  <span className="text-[9px] font-mono text-rose-400">危险操作</span>
                </div>

                <button
                  onClick={() => {
                    if (confirm('确定一键清空整个画布（包括所有节点、连线与画板）吗？')) {
                      onClearCanvas('all');
                      setShowClearMenu(false);
                    }
                  }}
                  className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-rose-950/50 hover:text-rose-200 text-slate-300 transition-colors flex items-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <div>
                    <div className="font-semibold text-rose-300">一键清空全部</div>
                    <div className="text-[10px] text-slate-400">清空所有节点、连线与空间取景框</div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    if (confirm('确定清空所有 ComfyUI 节点与连线吗？')) {
                      onClearCanvas('nodes');
                      setShowClearMenu(false);
                    }
                  }}
                  className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-[#222432] text-slate-300 transition-colors flex items-center gap-2"
                >
                  <Layers className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  <div>
                    <div className="font-semibold text-white">仅清空节点连线</div>
                    <div className="text-[10px] text-slate-400">保留空间画板，清空全部计算节点</div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    if (confirm('确定清空所有空间画板取景框吗？')) {
                      onClearCanvas('frames');
                      setShowClearMenu(false);
                    }
                  }}
                  className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-[#222432] text-slate-300 transition-colors flex items-center gap-2"
                >
                  <LayoutGrid className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <div>
                    <div className="font-semibold text-white">仅清空空间画板</div>
                    <div className="text-[10px] text-slate-400">保留节点连线，清空全部取景框</div>
                  </div>
                </button>

                <div className="pt-1 border-t border-[#252433]">
                  <button
                    onClick={() => {
                      if (confirm('确定将画布重置为标准默认工作流模板吗？')) {
                        onClearCanvas('reset-default');
                        setShowClearMenu(false);
                      }
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-cyan-950/40 text-cyan-300 transition-colors flex items-center gap-2"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <div>
                      <div className="font-semibold text-cyan-300">重置为默认工作流</div>
                      <div className="text-[10px] text-slate-400">恢复标准 FLUX.1 + SDXL 初始状态</div>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {onOpenGuide && (
          <button
            onClick={onOpenGuide}
            className="px-2 py-1 rounded-lg text-xs font-medium text-amber-300/80 hover:text-amber-200 hover:bg-[#1e202b] flex items-center gap-1 transition-colors"
            title="新手白话指南：LoRA 使用方法与核心参数通俗白话解释"
          >
            <BookOpen className="w-3.5 h-3.5 text-amber-400" />
            <span>新手指南</span>
          </button>
        )}
      </div>

      {/* Right section: Parameters Inspector trigger, History, Settings, Help, Run button */}
      <div className="flex items-center gap-2 pointer-events-auto">
        {/* Toggle Parameter Inspector Drawer */}
        {onOpenParamsDrawer && (
          <button
            onClick={onOpenParamsDrawer}
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 shadow-xl transition-all ${
              isParamsDrawerOpen
                ? 'bg-blue-600/30 text-blue-300 border-blue-500/60 ring-1 ring-blue-500/30'
                : 'bg-[#14151b]/95 backdrop-blur-xl border-[#272935] hover:border-slate-500 text-slate-300 hover:text-white'
            }`}
            title="开闭右侧 ComfyUI 核心参数总控台 (提示词、底模、LoRA、KSampler)"
          >
            <Sliders className="w-3.5 h-3.5 text-blue-400" />
            <span>核心参数</span>
          </button>
        )}

        {/* History Modal Trigger */}
        {onOpenHistory && (
          <button
            onClick={onOpenHistory}
            className="p-2 rounded-xl bg-[#14151b]/95 backdrop-blur-xl border border-[#272935] hover:border-slate-500 text-slate-300 hover:text-white transition-colors shadow-xl"
            title="生成历史记录与队列管理"
          >
            <Clock className="w-4 h-4 text-purple-400" />
          </button>
        )}

        {/* Settings Modal Trigger */}
        <button
          onClick={onOpenSettings}
          className="p-2 rounded-xl bg-[#14151b]/95 backdrop-blur-xl border border-[#272935] hover:border-slate-500 text-slate-300 hover:text-white transition-colors shadow-xl"
          title="云端 API 配置 (Fal.ai, ModelScope, HuggingFace, NanoGPT, Civitai)"
        >
          <Settings className="w-4 h-4 text-slate-400 hover:text-white" />
        </button>

        {/* Shortcut Guide Popup Trigger */}
        <div className="relative">
          <button
            onClick={() => setShowShortcuts(!showShortcuts)}
            className="p-2 rounded-xl bg-[#14151b]/95 backdrop-blur-xl border border-[#272935] hover:border-slate-500 text-slate-400 hover:text-white transition-colors shadow-xl"
            title="快捷键与画布操作指南"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {showShortcuts && (
            <div className="absolute top-11 right-0 w-80 bg-[#161720] border border-[#2b2d39] rounded-xl p-4 shadow-2xl text-xs space-y-3 animate-in fade-in duration-150 z-50">
              <h3 className="font-bold text-white text-sm border-b border-[#252733] pb-2 flex items-center justify-between">
                <span>画布快捷键与操作</span>
                <span className="text-[10px] text-cyan-400 font-mono">ComfyUI 规范</span>
              </h3>

              <div className="space-y-2 text-slate-300 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">运行工作流:</span>
                  <span className="font-mono bg-[#22242f] px-1.5 py-0.5 rounded text-[10px]">
                    Ctrl + Enter
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">平移画布:</span>
                  <span className="font-mono bg-[#22242f] px-1.5 py-0.5 rounded text-[10px]">
                    鼠标中键 / 空格+拖拽
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">缩放画布:</span>
                  <span className="font-mono bg-[#22242f] px-1.5 py-0.5 rounded text-[10px]">
                    鼠标滚轮
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">连接线缆:</span>
                  <span className="font-mono bg-[#22242f] px-1.5 py-0.5 rounded text-[10px]">
                    从同颜色圆点拖拽至目标端口
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">删除节点 / 取景框:</span>
                  <span className="font-mono bg-[#22242f] px-1.5 py-0.5 rounded text-[10px]">
                    选中后按 Delete 或 Backspace
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Global Primary Run Workflow Button */}
        {onQueuePrompt && (
          <div className="relative pointer-events-auto">
            <button
              onClick={onQueuePrompt}
              disabled={isExecuting}
              className={`relative overflow-hidden flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs shadow-2xl transition-all active:scale-95 ${
                isExecuting
                  ? 'bg-[#1b1c25] border border-cyan-500/50 text-white cursor-not-allowed shadow-cyan-500/20'
                  : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white shadow-emerald-500/30 ring-1 ring-emerald-400/40'
              }`}
              title="运行当前 ComfyUI 工作流 (Queue Prompt, 快捷键 Ctrl+Enter)"
            >
              {/* Background Progress Fill */}
              {isExecuting && (
                <div
                  className="absolute inset-0 bg-gradient-to-r from-cyan-600/30 via-indigo-600/30 to-purple-600/30 transition-all duration-300"
                  style={{ width: `${executionProgress || 15}%` }}
                />
              )}

              {isExecuting ? (
                <div className="relative z-10 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                  <span className="font-mono text-cyan-300 font-bold">{executionProgress ? `${executionProgress}%` : ''}</span>
                  <span className="truncate max-w-[220px] text-slate-200">{executionStatusText || '运行中...'}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>运行工作流</span>
                  <span className="hidden sm:inline text-[10px] opacity-80 font-mono bg-black/30 px-1 py-0.5 rounded">Ctrl+↵</span>
                </div>
              )}
            </button>
            {/* Ambient Progress Strip under button */}
            {isExecuting && (
              <div className="absolute -bottom-1 left-1 right-1 h-0.5 bg-[#121316] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 via-indigo-500 to-emerald-400 transition-all duration-300"
                  style={{ width: `${executionProgress || 15}%` }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
