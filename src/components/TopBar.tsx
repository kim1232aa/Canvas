import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Save,
  Cloud,
  MoreHorizontal,
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
  CheckCircle2,
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
  onOpenCloudProjects?: () => void;
  onSaveProject?: () => void;
  isSavingProject?: boolean;
  onOpenAssetManager?: () => void;
  onOpenHistory?: () => void;
  onOpenParamsDrawer?: () => void;
  isParamsDrawerOpen?: boolean;
  onQueuePrompt?: () => void;
  isExecuting?: boolean;
  executionStatusText?: string;
  executionProgress?: number;
  runDisabledReason?: string;
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
  onOpenCloudProjects,
  onSaveProject,
  isSavingProject = false,
  onOpenAssetManager,
  onOpenHistory,
  onOpenParamsDrawer,
  isParamsDrawerOpen = false,
  onQueuePrompt,
  isExecuting = false,
  executionStatusText = '',
  executionProgress = 0,
  runDisabledReason,
  onClearCanvas,
}) => {
  const [showTools, setShowTools] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => {if (!toolsRef.current?.contains(event.target as Node)) setShowTools(false);};
    const escape = (event: KeyboardEvent) => {if (event.key === 'Escape') setShowTools(false);};
    document.addEventListener('mousedown', close); document.addEventListener('keydown', escape);
    return () => {document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape);};
  }, []);
  const button = (label: string, icon: React.ReactNode, action?: () => void, active = false) => action && (
    <button type="button" onClick={() => { action(); setShowTools(false); }} title={label} aria-pressed={active || undefined} className={`studio-action ${active ? 'studio-action-active' : ''}`}>{icon}<span>{label}</span></button>
  );
  return (
    <header className="absolute top-3 left-3 right-3 z-40 pointer-events-none">
      <div className="studio-toolbar pointer-events-auto">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <div className="flex items-center gap-2 mr-2"><Layers className="w-5 h-5 text-cyan-400" /><span className="font-semibold text-white text-sm">ComfyCanvas Studio</span></div>
          {button(projectName, <FolderOpen className="w-4 h-4 shrink-0" />, onOpenCanvasManager)}
          <div className="flex rounded-lg bg-black/20 p-0.5" aria-label="画布视图">
            {button('节点', <Layers className="w-4 h-4" />, () => onChangeCanvasMode('graph'), canvasMode === 'graph')}
            {button('画板', <LayoutGrid className="w-4 h-4" />, () => onChangeCanvasMode('spatial'), canvasMode === 'spatial')}
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            {onSaveProject && <button type="button" onClick={onSaveProject} disabled={isSavingProject} className="studio-action" title="保存当前项目到云端（Ctrl / Cmd + S）">{isSavingProject ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}<span>{isSavingProject ? '正在保存' : '保存到云端'}</span></button>}
            {button('API 设置', <Settings className="w-4 h-4" />, onOpenSettings)}
            {onQueuePrompt && <button type="button" onClick={onQueuePrompt} disabled={isExecuting || Boolean(runDisabledReason)} aria-describedby="studio-run-status" className="studio-run">{isExecuting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}<span>{isExecuting ? `生成中 ${Math.round(executionProgress)}%` : canvasMode === 'graph' ? '运行工作流' : '生成所选画板'}</span></button>}
          </div>
        </div>
        <nav className="flex flex-wrap items-center gap-1 mt-2 pt-2 border-t border-white/10" aria-label="工作室工具">
          {button('模型', <Cpu className="w-4 h-4" />, onOpenBaseModelHub)}
          {button('LoRA', <Layers className="w-4 h-4" />, onOpenLoRAHub || onOpenCivitai)}
          {button('视频模型', <Video className="w-4 h-4" />, onOpenVideoHub)}
          {button('工作流', <Sparkles className="w-4 h-4" />, onOpenWorkflowPresets)}
          {button('参数', <Sliders className="w-4 h-4" />, onOpenParamsDrawer, isParamsDrawerOpen)}
          {button('历史', <Clock className="w-4 h-4" />, onOpenHistory)}
          {button('云端项目', <Cloud className="w-4 h-4" />, onOpenCloudProjects)}
          <a href="/verification/index.html" target="_blank" rel="noopener noreferrer" title="在新标签页查看历史 API 调用样本" className="studio-action"><CheckCircle2 className="w-4 h-4" /><span>历史 API 调用样本</span></a>
          <div className="relative sm:ml-auto" ref={toolsRef}>
            <button type="button" className="studio-action" aria-expanded={showTools} aria-controls="studio-more-tools" onClick={() => setShowTools(!showTools)}><MoreHorizontal className="w-4 h-4" /><span>更多</span></button>
            {showTools && <div id="studio-more-tools" className="absolute right-0 top-full mt-2 bg-[#181b24] border border-white/15 p-2 rounded-xl w-56 shadow-2xl grid gap-1">
              {button('资产库', <FolderOpen className="w-4 h-4" />, onOpenAssetManager)}
              {button('服务商参数说明', <Cpu className="w-4 h-4" />, onOpenProviderMatrix)}
              {button('Civitai 工作流导入', <Layers className="w-4 h-4" />, onOpenCivitaiImport)}
              {button('使用指南', <BookOpen className="w-4 h-4" />, onOpenGuide)}
              {onClearCanvas && <>
                <div className="border-t border-white/10 my-1" />
                {button('清空当前视图', <Trash2 className="w-4 h-4 text-rose-400" />, () => {onClearCanvas(canvasMode === 'graph' ? 'nodes' : 'frames'); setShowTools(false);})}
                {button('重置默认工作流', <RotateCcw className="w-4 h-4" />, () => {onClearCanvas('reset-default'); setShowTools(false);})}
              </>}
              <p className="text-xs text-slate-400 border-t border-white/10 mt-1 pt-2">Ctrl / Cmd + Enter 生成<br />Ctrl / Cmd + S 保存到云端<br />Esc 关闭窗口</p>
            </div>}
          </div>
        </nav>
        <div id="studio-run-status" role="status" aria-live="polite" className={`mt-2 text-sm leading-relaxed ${runDisabledReason ? 'text-amber-300' : 'text-slate-400'}`}>
          {runDisabledReason || (isExecuting ? executionStatusText : canvasMode === 'graph' ? `${nodeCount} 个节点 · ${connectionCount} 条连线 · 按所选服务商的接口运行` : '选择画板后设置模型和参数，再点击生成')}
        </div>
      </div>
    </header>
  );
};
