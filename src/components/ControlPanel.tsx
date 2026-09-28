import React from 'react';
import {
  Play,
  Loader2,
  FolderOpen,
  Settings,
  Clock,
  Sparkles,
  Layers,
  Download,
  Upload,
  Maximize2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { WORKFLOW_PRESETS } from '../constants/presets';
import { WorkflowPreset } from '../types/graph';

interface ControlPanelProps {
  isExecuting: boolean;
  executionStatusText: string;
  onQueuePrompt: () => void;
  onOpenSettings: () => void;
  onOpenCivitai: () => void;
  onOpenHistory: () => void;
  onSelectPreset: (preset: WorkflowPreset) => void;
  onExportWorkflow: () => void;
  onImportWorkflow: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onResetView: () => void;
  onClearCanvas: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  isExecuting,
  executionStatusText,
  onQueuePrompt,
  onOpenSettings,
  onOpenCivitai,
  onOpenHistory,
  onSelectPreset,
  onExportWorkflow,
  onImportWorkflow,
  onResetView,
  onClearCanvas,
}) => {
  const [showPresetsMenu, setShowPresetsMenu] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div className="absolute top-4 right-4 z-40 flex flex-col gap-2 w-72 pointer-events-auto">
      {/* Primary Queue Prompt Box (Signature ComfyUI Panel) */}
      <div className="bg-[#18191e]/95 backdrop-blur-md border border-[#2b2d36] rounded-xl p-3 shadow-2xl shadow-black/80 space-y-2.5">
        <button
          onClick={onQueuePrompt}
          disabled={isExecuting}
          className={`w-full py-3 px-4 rounded-xl font-bold text-sm tracking-wide flex items-center justify-center gap-2.5 shadow-lg transition-all ${
            isExecuting
              ? 'bg-amber-600/80 text-white cursor-not-allowed shadow-amber-500/20'
              : 'bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white shadow-cyan-500/25 active:scale-[0.98]'
          }`}
        >
          {isExecuting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{executionStatusText || '正在执行模型生成...'}</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-white" />
              <span>Queue Prompt (运行工作流)</span>
            </>
          )}
        </button>

        {/* Shortcut hint */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 font-mono">
          <span>快捷键:</span>
          <span className="bg-[#242630] text-slate-300 px-1.5 py-0.5 rounded border border-[#333644]">
            Ctrl + Enter
          </span>
        </div>
      </div>

      {/* Navigation and Tools Menu */}
      <div className="bg-[#18191e]/95 backdrop-blur-md border border-[#2b2d36] rounded-xl p-2.5 shadow-2xl shadow-black/80 space-y-1 text-xs">
        {/* Civitai LoRA Hub button */}
        <button
          onClick={onOpenCivitai}
          className="w-full px-3 py-2 rounded-lg bg-blue-950/40 hover:bg-blue-900/50 border border-blue-800/40 text-blue-300 font-semibold flex items-center justify-between transition-colors group"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
            <span>Civitai LoRA 模型库</span>
          </div>
          <span className="text-[10px] bg-blue-600/30 px-1.5 py-0.5 rounded font-mono">Hub</span>
        </button>

        {/* History / Queue viewer */}
        <button
          onClick={onOpenHistory}
          className="w-full px-3 py-2 rounded-lg hover:bg-[#252731] text-slate-200 flex items-center justify-between transition-colors"
        >
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-purple-400" />
            <span>生成历史 / 队列管理</span>
          </div>
          <span className="text-[11px] text-slate-400">查看</span>
        </button>

        {/* Workflow Presets Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowPresetsMenu(!showPresetsMenu)}
            className="w-full px-3 py-2 rounded-lg hover:bg-[#252731] text-slate-200 flex items-center justify-between transition-colors"
          >
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              <span>工作流预设 (Presets)</span>
            </div>
            <span className="text-[10px] bg-[#292c36] text-slate-300 px-1.5 py-0.5 rounded">
              {WORKFLOW_PRESETS.length} 套
            </span>
          </button>

          {showPresetsMenu && (
            <div className="mt-1 bg-[#1c1d24] border border-[#2d303a] rounded-xl p-1.5 shadow-xl space-y-1 animate-in fade-in duration-150">
              {WORKFLOW_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    onSelectPreset(p);
                    setShowPresetsMenu(false);
                  }}
                  className="w-full text-left p-2 rounded-lg hover:bg-[#282a35] text-slate-200 transition-colors"
                >
                  <div className="font-semibold text-white text-[12px] flex items-center justify-between">
                    <span>{p.name}</span>
                    <span className="text-[10px] text-cyan-400 font-mono">{p.category}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                    {p.description}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Backend & API Settings */}
        <button
          onClick={onOpenSettings}
          className="w-full px-3 py-2 rounded-lg hover:bg-[#252731] text-slate-200 flex items-center justify-between transition-colors"
        >
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-cyan-400" />
            <span>模型与后端 API 管理</span>
          </div>
          <span className="text-[10px] text-slate-400">配置</span>
        </button>

        {/* Divider */}
        <div className="border-t border-[#272932] my-1" />

        {/* Export / Import */}
        <div className="flex gap-1.5 pt-0.5">
          <button
            onClick={onExportWorkflow}
            className="flex-1 py-1.5 px-2 rounded-lg bg-[#22242c] hover:bg-[#2d2f3a] text-slate-300 font-medium flex items-center justify-center gap-1.5 border border-[#303340] transition-colors"
            title="导出当前工作流为 JSON"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>导出 JSON</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 py-1.5 px-2 rounded-lg bg-[#22242c] hover:bg-[#2d2f3a] text-slate-300 font-medium flex items-center justify-center gap-1.5 border border-[#303340] transition-colors"
            title="导入 ComfyUI 格式 JSON"
          >
            <Upload className="w-3.5 h-3.5 text-slate-400" />
            <span>导入 JSON</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={onImportWorkflow}
            accept=".json"
            className="hidden"
          />
        </div>

        {/* Canvas Navigation Helper */}
        <div className="flex gap-1.5 pt-1">
          <button
            onClick={onResetView}
            className="flex-1 py-1.5 px-2 rounded-lg hover:bg-[#252731] text-slate-400 hover:text-white flex items-center justify-center gap-1 text-[11px] transition-colors"
            title="自适应缩放以查看所有节点"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>适配视口</span>
          </button>

          <button
            onClick={onClearCanvas}
            className="flex-1 py-1.5 px-2 rounded-lg hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 flex items-center justify-center gap-1 text-[11px] transition-colors"
            title="清空当前画布"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>清空画布</span>
          </button>
        </div>
      </div>
    </div>
  );
};
