import React, { useState, useEffect } from 'react';
import {
  Cloud,
  FolderOpen,
  Plus,
  Trash2,
  Copy,
  Clock,
  Check,
  Server,
  Layers,
  Sparkles,
  Loader2,
  HardDrive,
  RefreshCw,
} from 'lucide-react';
import {
  CloudProjectSummary,
  cloneCloudProject,
  deleteCloudProject,
  fetchCloudProjects,
  fetchCloudServerHealth,
  loadCloudProject,
} from '../services/api';

interface CloudProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProjectId: string;
  onLoadProject: (projectData: any) => void;
  onSaveCurrentToCloud: (name: string) => Promise<void>;
}

export const CloudProjectModal: React.FC<CloudProjectModalProps> = ({
  isOpen,
  onClose,
  currentProjectId,
  onLoadProject,
  onSaveCurrentToCloud,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<CloudProjectSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isSavingNew, setIsSavingNew] = useState(false);
  const [serverHealth, setServerHealth] = useState<any>(null);

  const refreshList = async () => {
    setError(null);
    setLoading(true);
    try {
      const [list, health] = await Promise.all([
        fetchCloudProjects(),
        fetchCloudServerHealth(),
      ]);
      setProjects(list);
      setServerHealth(health);
    } catch (e: any) {
      setError(e.message || '云端操作失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshList();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreateNew = async () => {
    if (!newProjectName.trim()) return;
    setIsSavingNew(true);
    try {
      await onSaveCurrentToCloud(newProjectName.trim());
      setNewProjectName('');
      await refreshList();
    } catch (e: any) {
      setError(e.message || '云端操作失败');
    } finally {
      setIsSavingNew(false);
    }
  };

  const handleSelectProject = async (id: string) => {
    setError(null);
    setLoading(true);
    try {
      const fullProject = await loadCloudProject(id);
      if (fullProject) {
        onLoadProject(fullProject);
        onClose();
      }
    } catch (e: any) {
      setError(e.message || '云端操作失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`确定从云端服务器永久删除项目「${name}」吗？`)) return;
    setLoading(true); setError(null);
    try {await deleteCloudProject(id); await refreshList();}
    catch (e: any) {setError(e.message);}
    finally {setLoading(false);}
  };

  const handleClone = async (id: string) => {
    setLoading(true); setError(null);
    try {await cloneCloudProject(id); await refreshList();}
    catch (e: any) {setError(e.message);}
    finally {setLoading(false);}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#17181e] border border-[#2b2d39] rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden text-xs">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#262833] bg-[#131419] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-600 text-white font-bold shadow-md shadow-cyan-600/20">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                云端项目
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {loading ? '正在连接' : serverHealth?.status === 'online' ? '已连接' : '等待连接'}
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                保存到云端的项目可在其他设备登录后继续编辑。
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-[#252731] transition-colors"
          >
            ✕
          </button>
        </div>

        {error && <p role="alert" className="mx-6 mt-3 p-3 rounded-lg bg-rose-950/40 text-rose-300 text-sm">{error}</p>}
        {/* Server Status Strip */}
        {serverHealth && (
          <div className="px-6 py-2.5 bg-[#1a1b23] border-b border-[#262833] flex items-center justify-between text-[11px] text-slate-300 font-mono">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-cyan-400">
                <Server className="w-3.5 h-3.5" />
                {serverHealth.serverType}
              </span>
              <span>•</span>
              <span className="text-slate-400">已存档项目: {serverHealth.projectsCount} 个</span>
              <span>•</span>
              <span className="text-slate-400">云端生成图: {serverHealth.historyCount} 张</span>
            </div>
            <button
              onClick={refreshList}
              className="text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              <span>刷新</span>
            </button>
          </div>
        )}

        {/* Create / Save Project Bar */}
        <div className="p-4 bg-[#15161c] border-b border-[#252732] flex gap-2.5 items-center">
          <input
            type="text"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder="输入新项目名称，将当前画布另存为云端项目..."
            className="flex-1 bg-[#101115] border border-[#292b37] focus:border-cyan-500 rounded-xl px-3.5 py-2 text-white placeholder-slate-500 outline-none"
          />
          <button
            onClick={handleCreateNew}
            disabled={isSavingNew || !newProjectName.trim()}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold flex items-center gap-1.5 shadow-md shadow-cyan-600/20 disabled:opacity-50 transition-all"
          >
            {isSavingNew ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            <span>存为新云端项目</span>
          </button>
        </div>

        {/* Project List Grid */}
        <div className="flex-1 p-6 overflow-y-auto bg-[#131419]">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
              <p className="font-medium">正在读取云端项目库...</p>
            </div>
          ) : projects.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400">
              <p>暂无云端项目。在上方输入名称并点击「存为新云端项目」创建。</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((p) => {
                const isCurrent = currentProjectId === p.id;
                const formattedTime = new Date(p.updatedAt).toLocaleString('zh-CN', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={p.id}
                    className={`bg-[#1a1b24] border rounded-xl overflow-hidden flex flex-col justify-between group transition-all shadow-lg ${
                      isCurrent
                        ? 'border-cyan-500/80 ring-1 ring-cyan-500/30'
                        : 'border-[#272935] hover:border-slate-500'
                    }`}
                  >
                    {/* Thumbnail preview if available */}
                    <div className="relative h-32 bg-[#0e0f14] overflow-hidden flex items-center justify-center">
                      {p.thumbnail ? (
                        <img
                          src={p.thumbnail}
                          alt={p.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="text-slate-600 flex flex-col items-center gap-1">
                          <Layers className="w-8 h-8" />
                          <span className="text-[10px]">空间画布工程</span>
                        </div>
                      )}

                      {isCurrent && (
                        <div className="absolute top-2 left-2 bg-cyan-600/90 text-white font-mono text-[10px] font-bold px-2 py-0.5 rounded shadow">
                          当前画布
                        </div>
                      )}

                      <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-mono text-slate-300">
                        {p.frameCount} 取景框 • {p.nodeCount} 节点
                      </div>
                    </div>

                    {/* Meta & Actions */}
                    <div className="p-3.5 space-y-2.5 flex-1 flex flex-col justify-between">
                      <div>
                        <h4 className="font-bold text-white text-xs truncate" title={p.name}>
                          {p.name}
                        </h4>
                        <div className="text-[10px] text-slate-400 font-mono mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>更新于: {formattedTime}</span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-[#252733] flex items-center justify-between gap-2">
                        <button
                          disabled={loading || isSavingNew}
                          onClick={() => handleSelectProject(p.id)}
                          className={`flex-1 py-1.5 rounded-lg font-bold text-[11px] flex items-center justify-center gap-1 transition-all ${
                            isCurrent
                              ? 'bg-[#252835] text-cyan-300 hover:bg-[#2e3242]'
                              : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-600/20'
                          }`}
                        >
                          <FolderOpen className="w-3 h-3" />
                          <span>{isCurrent ? '重新加载' : '加载到画布'}</span>
                        </button>

                        <button
                          disabled={loading || isSavingNew}
                          onClick={() => handleClone(p.id)}
                          className="p-1.5 rounded-lg bg-[#22242e] hover:bg-[#2d303d] text-slate-300 hover:text-white"
                          title="在云端复制副本"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>

                        <button
                          disabled={loading || isSavingNew}
                          onClick={() => handleDelete(p.id, p.name)}
                          className="p-1.5 rounded-lg bg-[#22242e] hover:bg-rose-950/40 text-slate-400 hover:text-rose-400"
                          title="从服务器永久删除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
