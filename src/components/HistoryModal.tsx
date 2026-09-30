import React from 'react';
import { Download, Clock, Copy, Sparkles, Check, Image as ImageIcon, Trash2 } from 'lucide-react';
import { GenerationHistoryItem } from '../types/providers';
import { PreviewMediaPanel } from './PreviewMediaPanel';

export const displayValue = (val: any): string | number => {
  if (val === null || val === undefined) return '未填写';
  if (typeof val === 'string' && (val.trim() === '' || val.trim() === 'null' || val.trim() === 'undefined')) return '未填写';
  if (typeof val === 'number' && isNaN(val)) return '未填写';
  return val;
};

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: GenerationHistoryItem[];
  onApplyPrompt: (prompt: string, negPrompt?: string) => void;
  onDeleteItem: (id: string) => void;
  onClearAll: () => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  onClose,
  history,
  onApplyPrompt,
  onDeleteItem,
  onClearAll,
}) => {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [selectedImage, setSelectedImage] = React.useState<GenerationHistoryItem | null>(null);
  const [brokenIds, setBrokenIds] = React.useState<Record<string, true>>({});

  if (!isOpen) return null;

  const markBroken = (id: string) => {
    setBrokenIds((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
  };

  const handleCopyPrompt = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleDownload = (url: string, filename = 'comfycanvas_output.jpg') => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#18191d] border border-[#2e3038] rounded-2xl w-full max-w-5xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#2e3038] bg-[#141518] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                生成历史记录 (Generation Queue History)
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                  {history.length} 张图片
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                查看之前生成的所有图像，一键回填提示词、种子和 LoRA 参数
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <button
                onClick={() => {
                  if (confirm('确定要清空全部生成历史吗？此操作不可撤销。')) onClearAll();
                }}
                className="px-3 py-1.5 rounded-lg bg-rose-900/30 hover:bg-rose-600 text-rose-400 hover:text-white text-xs font-bold border border-rose-500/30 transition-all flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>清空历史</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-[#25272e] transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto bg-[#141518]">
          {history.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-400">
              <ImageIcon className="w-12 h-12 text-slate-600" />
              <p className="text-sm">暂无生成记录。点击右侧「Queue Prompt」开始运行工作流！</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="bg-[#1e2026] border border-[#2d303a] hover:border-cyan-500/40 rounded-xl overflow-hidden shadow-lg flex flex-col group transition-all"
                >
                  <div className="relative aspect-square bg-[#111215] overflow-hidden cursor-pointer" onClick={() => setSelectedImage(item)}>
                    <PreviewMediaPanel
                      id={item.id}
                      url={item.url}
                      broken={!!brokenIds[item.id]}
                      onBroken={markBroken}
                      kind={
                        item.url?.includes('.mp4') ||
                        item.model?.includes('video') ||
                        item.provider?.includes('Video') ||
                        !!item.url?.startsWith('data:video')
                          ? 'video'
                          : 'image'
                      }
                      alt={item.prompt || ''}
                      mediaClassName="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      videoProps={{ autoPlay: true, loop: true, muted: true }}
                    />
                    <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-[11px] font-mono text-cyan-300 border border-cyan-500/30">
                      {displayValue(item.actualProvider || item.provider)}
                    </div>
                    <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-mono text-slate-300">
                      Seed: {displayValue(item.seed)}
                    </div>
                  </div>

                  <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
                    <div className="space-y-1.5">
                      <p className={`text-xs font-medium line-clamp-2 leading-relaxed ${item.prompt && item.prompt.trim() ? 'text-slate-200' : 'text-slate-400 italic'}`}>
                        {displayValue(item.prompt)}
                      </p>
                      <div className="text-[11px] text-slate-400 font-mono flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>模型: {displayValue(item.actualModel || item.model)}</span>
                        <span>步数: {item.steps != null ? `${item.steps} 步` : '未填写'}</span>
                        <span>CFG: {displayValue(item.cfg)}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono line-clamp-1">
                        负向: {displayValue(item.negativePrompt)}
                      </p>
                      {item.loras && item.loras.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {item.loras.map((l, i) => (
                            <span key={i} className="text-[10px] bg-purple-950/60 text-purple-300 border border-purple-800/40 px-1.5 py-0.5 rounded">
                              LoRA: {l.name} ({l.strength})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-[#2a2c35] flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyPrompt(item.id, item.prompt || '');
                          }}
                          className="p-1.5 text-slate-400 hover:text-white rounded bg-[#272930] hover:bg-[#32353e] transition-colors"
                          title="复制正向提示词"
                        >
                          {copiedId === item.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(item.url, `comfy_${item.id}.jpg`);
                          }}
                          className="p-1.5 text-slate-400 hover:text-white rounded bg-[#272930] hover:bg-[#32353e] transition-colors"
                          title="下载图像"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm('确定删除此项记录吗？')) onDeleteItem(item.id);
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-400 rounded bg-[#272930] hover:bg-rose-950/40 transition-colors"
                          title="删除此项记录"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <button
                        onClick={() => {
                          onApplyPrompt(item.prompt || '', item.negativePrompt || undefined);
                          onClose();
                        }}
                        className="px-2.5 py-1 rounded bg-cyan-600/20 text-cyan-400 hover:bg-cyan-600/30 text-[11px] font-semibold border border-cyan-500/30 transition-colors flex items-center gap-1"
                      >
                        <Sparkles className="w-3 h-3" />
                        应用到画布
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Preview */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-60 bg-black/95 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <div className="relative min-h-[40vh] w-full max-w-xl flex items-center justify-center border border-[#333] rounded-lg bg-[#111215] overflow-hidden">
              <PreviewMediaPanel
                id={selectedImage.id}
                url={selectedImage.url}
                broken={!!brokenIds[selectedImage.id]}
                onBroken={markBroken}
                kind="image"
                alt={selectedImage.prompt || ''}
                mediaClassName="max-h-[75vh] w-auto rounded-lg shadow-2xl object-contain border border-[#333]"
                failureHint="链接失效或无法拉取"
              />
            </div>
            <div className="mt-3 bg-[#18191d] border border-[#2e3038] p-4 rounded-xl text-center w-full max-w-2xl text-xs space-y-1.5">
              <p className={`font-medium ${selectedImage.prompt && selectedImage.prompt.trim() ? 'text-white' : 'text-slate-400 italic'}`}>
                {displayValue(selectedImage.prompt)}
              </p>
              <p className="text-slate-300 font-mono text-[11px]">
                负向: {displayValue(selectedImage.negativePrompt)}
              </p>
              <p className="text-slate-400 font-mono text-[11px]">
                {displayValue(selectedImage.actualProvider || selectedImage.provider)} | Model: {displayValue(selectedImage.actualModel || selectedImage.model)} | Seed: {displayValue(selectedImage.seed)} | Steps: {selectedImage.steps != null ? `${selectedImage.steps} 步` : '未填写'} | CFG: {displayValue(selectedImage.cfg)}
              </p>
            </div>
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-slate-800 text-white font-bold flex items-center justify-center hover:bg-slate-700"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
