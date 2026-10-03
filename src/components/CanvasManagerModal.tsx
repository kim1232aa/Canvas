import React, { useState } from 'react';
import {
  LayoutGrid,
  Plus,
  Trash2,
  Copy,
  Clock,
  Check,
  FolderOpen,
  Sparkles,
  Download,
  Upload,
  Edit2,
  HardDrive,
  Layers,
  ArrowRight,
  Play,
  RotateCcw,
} from 'lucide-react';
import { NodeInstance, Connection, SpatialFrame, CanvasTransform } from '../types/graph';

export interface CanvasProject {
  id: string;
  name: string;
  description: string;
  updatedAt: number;
  previewImage?: string;
  nodes: NodeInstance[];
  connections: Connection[];
  spatialFrames: SpatialFrame[];
  transform?: CanvasTransform;
  canvasMode?: 'graph' | 'spatial';
}

interface CanvasManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProjectId: string;
  canvases: CanvasProject[];
  onSelectCanvas: (canvas: CanvasProject) => void;
  onCreateNewCanvas: (name: string, description: string, templateType: 'empty' | 'flux' | 'ghibli' | 'wan') => void;
  onCloneCanvas: (canvasId: string) => void;
  onDeleteCanvas: (canvasId: string) => void;
  onRenameCanvas: (canvasId: string, newName: string) => void;
  onSaveCurrentAsNew: (name: string) => void;
}

export const CanvasManagerModal: React.FC<CanvasManagerModalProps> = ({
  isOpen,
  onClose,
  currentProjectId,
  canvases,
  onSelectCanvas,
  onCreateNewCanvas,
  onCloneCanvas,
  onDeleteCanvas,
  onRenameCanvas,
  onSaveCurrentAsNew,
}) => {
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const [newCanvasName, setNewCanvasName] = useState('');
  const [newCanvasDesc, setNewCanvasDesc] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<'empty' | 'flux' | 'ghibli' | 'wan'>('flux');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  if (!isOpen) return null;

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCanvasName.trim()) return;
    onCreateNewCanvas(newCanvasName.trim(), newCanvasDesc.trim(), selectedTemplate);
    setNewCanvasName('');
    setNewCanvasDesc('');
    setActiveTab('list');
  };

  const handleStartRename = (canvas: CanvasProject) => {
    setEditingId(canvas.id);
    setEditingName(canvas.name);
  };

  const handleSaveRename = (id: string) => {
    if (editingName.trim()) {
      onRenameCanvas(id, editingName.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
      <div className="bg-[#15161c] border border-[#2b2d3a] rounded-2xl w-full max-w-4xl h-[82vh] flex flex-col shadow-2xl overflow-hidden text-xs">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#252733] bg-[#111216] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
              <LayoutGrid className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-white tracking-wide">
                  多画布与工程管理中心 (Canvas Boards)
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  {canvases.length} 个画布工程
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                支持并行管理多个创作画布，随时保存、克隆、切换不同工作流与生成任务
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('create')}
              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-cyan-600/20 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新建画布</span>
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-[#22242e] hover:bg-[#2c2e3b] text-slate-400 hover:text-white text-xs font-semibold transition-colors"
            >
              关闭 (Esc)
            </button>
          </div>
        </div>

        {/* Tab Strip */}
        <div className="px-6 py-2.5 bg-[#171821] border-b border-[#242632] flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('list')}
              className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all ${
                activeTab === 'list'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-[#22242e]'
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>全部画布工程 ({canvases.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('create')}
              className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all ${
                activeTab === 'create'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-[#22242e]'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新建空白或预设画布</span>
            </button>
          </div>

          <button
            onClick={() => {
              const name = prompt('请输入新画布名称:', `画布备份_${new Date().toLocaleTimeString()}`);
              if (name) onSaveCurrentAsNew(name);
            }}
            className="px-2.5 py-1 rounded-lg bg-[#22242e] hover:bg-[#2c2e3c] text-slate-300 hover:text-white border border-[#2f3242] transition-colors"
            title="将当前画布正在运行的内容另存为一份新画布"
          >
            💾 将当前内容另存为新画布
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#0f1014]">
          {activeTab === 'list' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {canvases.map((canvas) => {
                const isActive = canvas.id === currentProjectId;

                return (
                  <div
                    key={canvas.id}
                    className={`bg-[#171822] border rounded-2xl overflow-hidden flex flex-col justify-between shadow-xl transition-all ${
                      isActive
                        ? 'border-cyan-500/80 ring-2 ring-cyan-500/20'
                        : 'border-[#262835] hover:border-slate-500'
                    }`}
                  >
                    {/* Canvas Card Top Bar */}
                    <div className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          {editingId === canvas.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                className="bg-[#101116] border border-cyan-500 rounded px-2 py-1 text-xs text-white outline-none w-full"
                                autoFocus
                              />
                              <button
                                onClick={() => handleSaveRename(canvas.id)}
                                className="px-2 py-1 rounded bg-cyan-600 text-white font-bold text-[10px]"
                              >
                                保存
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-bold text-white truncate" title={canvas.name}>
                                {canvas.name}
                              </h3>
                              {isActive && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shrink-0">
                                  当前活跃
                                </span>
                              )}
                            </div>
                          )}
                          <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                            {canvas.description || '无详细描述'}
                          </p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleStartRename(canvas)}
                            className="p-1.5 rounded hover:bg-[#252835] text-slate-400 hover:text-white transition-colors"
                            title="重命名"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onCloneCanvas(canvas.id)}
                            className="p-1.5 rounded hover:bg-[#252835] text-slate-400 hover:text-white transition-colors"
                            title="复制克隆此画布"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          {canvases.length > 1 && (
                            <button
                              onClick={() => {
                                if (confirm(`确定删除画布「${canvas.name}」吗？`)) {
                                  onDeleteCanvas(canvas.id);
                                }
                              }}
                              className="p-1.5 rounded hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 transition-colors"
                              title="删除画布"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Canvas Stats Bar */}
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 bg-[#121319] p-2 rounded-xl border border-[#22242f]">
                        <div className="flex items-center gap-3">
                          <span>
                            节点: <b className="text-cyan-400">{canvas.nodes?.length || 0}</b>
                          </span>
                          <span>
                            取景框: <b className="text-purple-400">{canvas.spatialFrames?.length || 0}</b>
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px]">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>{new Date(canvas.updatedAt).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    </div>

                    {/* Canvas Action Footer */}
                    <div className="p-3 bg-[#13141a] border-t border-[#232530] flex items-center justify-between">
                      <span className="text-[11px] text-slate-500 font-mono">
                        ID: {canvas.id.slice(0, 10)}...
                      </span>

                      {isActive ? (
                        <button
                          onClick={onClose}
                          className="px-3.5 py-1.5 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold text-xs"
                        >
                          正在编辑中 (点击关闭)
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            onSelectCanvas(canvas);
                            onClose();
                          }}
                          className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-cyan-600/20 transition-all active:scale-95"
                        >
                          <Play className="w-3.5 h-3.5 fill-white" />
                          <span>切换打开此画布</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 2: 新建画布 */}
          {activeTab === 'create' && (
            <div className="max-w-xl mx-auto space-y-6">
              <form onSubmit={handleCreateSubmit} className="bg-[#171822] border border-[#2b2d3c] rounded-2xl p-6 space-y-5">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white">创建全新画布工程</h3>
                  <p className="text-xs text-slate-400">选择初始预设或从空白画板开始搭建你的 ComfyUI 流程</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-300 text-xs font-semibold mb-1">画布名称</label>
                    <input
                      type="text"
                      value={newCanvasName}
                      onChange={(e) => setNewCanvasName(e.target.value)}
                      placeholder="例如：赛博朋克角色概念设计 / 电影分镜项目..."
                      className="w-full bg-[#101116] border border-[#2b2d39] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-500 font-medium"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 text-xs font-semibold mb-1">画布描述 (可选)</label>
                    <textarea
                      rows={2}
                      value={newCanvasDesc}
                      onChange={(e) => setNewCanvasDesc(e.target.value)}
                      placeholder="简要记录此画布的核心目标、使用的主模型与风格..."
                      className="w-full bg-[#101116] border border-[#2b2d39] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-500 resize-none"
                    />
                  </div>

                  {/* Template Picker */}
                  <div>
                    <label className="block text-slate-300 text-xs font-semibold mb-2">选择初始模板</label>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        {
                          id: 'flux',
                          name: '⚡ FLUX.1 + 赛博朋克 LoRA',
                          desc: '4步极速推理，包含完整 LoRALoader 与取景框',
                        },
                        {
                          id: 'ghibli',
                          name: '🎨 SDXL + 吉卜力动画水彩',
                          desc: 'Animagine XL 底模，治愈日系二次元风景',
                        },
                        {
                          id: 'wan',
                          name: '🐉 魔搭 Wan 2.1 国风仙侠水墨',
                          desc: '阿里通义万相纯中文大模型，山海经神话写意',
                        },
                        {
                          id: 'empty',
                          name: '📄 纯净空白画布',
                          desc: '无任何预设节点，适合从零自由探索连接',
                        },
                      ].map((t) => (
                        <div
                          key={t.id}
                          onClick={() => setSelectedTemplate(t.id as any)}
                          className={`p-3 rounded-xl border cursor-pointer transition-all ${
                            selectedTemplate === t.id
                              ? 'bg-cyan-500/20 border-cyan-500/60 shadow-sm'
                              : 'bg-[#121319] border-[#252733] hover:border-slate-500'
                          }`}
                        >
                          <div className="font-bold text-white text-xs">{t.name}</div>
                          <div className="text-[10px] text-slate-400 mt-1">{t.desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#232532]">
                  <button
                    type="button"
                    onClick={() => setActiveTab('list')}
                    className="px-4 py-2 rounded-xl bg-[#22242e] text-slate-400 hover:text-white font-semibold text-xs"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs shadow-md shadow-cyan-600/20"
                  >
                    创建并立即进入画布
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
