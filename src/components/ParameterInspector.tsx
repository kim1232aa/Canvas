import React from 'react';
import {
  Sliders,
  Sparkles,
  Dices,
  Layers,
  Cpu,
  Trash2,
  Plus,
  Copy,
  Check,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Wand2,
  Info,
  AlertTriangle,
} from 'lucide-react';
import { ComfyParameters } from '../types/graph';
import { BASE_MODELS, SAMPLER_OPTIONS, SCHEDULER_OPTIONS } from '../constants/nodes';
import { refinePromptWithGemini, fetchLiveModels, getRefineModelSelection } from '../services/api';
import { validateLoraCompatibility } from '../utils/baseModelMatcher';
import { normalizeForComfyUI } from '../utils/engineParameterNormalizer';
import { GeminiFieldSelect } from './GeminiFieldSelect';
import { FieldStatusBadge } from './FieldStatusBadge';

interface ParameterInspectorProps {
  params: ComfyParameters;
  onChange: (newParams: ComfyParameters) => void;
  positivePrompt?: string;
  onChangePositivePrompt?: (prompt: string) => void;
  negativePrompt?: string;
  onChangeNegativePrompt?: (prompt: string) => void;
  onOpenCivitai: () => void;
  onOpenModelHub?: () => void;
  onOpenGuide?: () => void;
  onInsertTriggerWords?: (words: string) => void;
  onClose?: () => void;
  title?: string;
  isFloatingDrawer?: boolean;
}

export const ParameterInspector: React.FC<ParameterInspectorProps> = ({
  params,
  onChange,
  positivePrompt,
  onChangePositivePrompt,
  negativePrompt,
  onChangeNegativePrompt,
  onOpenCivitai,
  onOpenModelHub,
  onOpenGuide,
  onInsertTriggerWords,
  onClose,
  title = 'ComfyUI 核心参数总控台',
  isFloatingDrawer = true,
}) => {
  const [copiedComfyJson, setCopiedComfyJson] = React.useState(false);
  const [copiedTrigger, setCopiedTrigger] = React.useState<string | null>(null);
  const [isRefiningPrompt, setIsRefiningPrompt] = React.useState(false);
  const [liveModels, setLiveModels] = React.useState<Array<{ label: string; value: string; provider: string }>>([]);
  const [isLoadingModels, setIsLoadingModels] = React.useState(false);

  // Merge static BASE_MODELS with dynamically fetched liveModels
  const allModels = React.useMemo(() => {
    const list = [...BASE_MODELS.map(m => ({ label: m.label, value: m.value, provider: m.provider as any }))];
    liveModels.forEach(lm => {
      if (!list.some(m => m.value === lm.value)) {
        list.push(lm);
      }
    });
    return list as Array<{ label: string; value: string; provider: any }>;
  }, [liveModels]);

  React.useEffect(() => {
    let active = true;
    setIsLoadingModels(true);
    fetchLiveModels(params.targetProvider || 'all', '', 'Checkpoint', 'checkpoint')
      .then((data) => {
        if (!active) return;
        const list: Array<{ label: string; value: string; provider: string }> = [];
        Object.entries(data).forEach(([prov, items]) => {
          if (Array.isArray(items)) {
            items.forEach((item: any) => {
              if (item.id || item.name) {
                list.push({
                  label: item.name ? `${item.name} (${item.id})` : item.id,
                  value: item.id || item.name,
                  provider: prov,
                });
              }
            });
          }
        });
        setLiveModels(list);
      })
      .catch((err) => {
        console.warn('[ParameterInspector] Live models fetch error:', err.message);
      })
      .finally(() => {
        if (active) setIsLoadingModels(false);
      });
    return () => {
      active = false;
    };
  }, [params.targetProvider]);

  const handleRefine = async () => {
    if (!positivePrompt || !onChangePositivePrompt) return;
    const selection = getRefineModelSelection();
    const provider = (params as any).refineProvider || selection.provider;
    const model = (params as any).refineModel || selection.model;
    if (!provider || !model) {
      alert('请先选择润色模型');
      return;
    }
    setIsRefiningPrompt(true);
    try {
      const refined = await refinePromptWithGemini(positivePrompt, {
        provider,
        model,
        loras: params.loras,
      });
      if (refined) {
        onChangePositivePrompt(refined);
      }
    } catch (e: any) {
      alert(e.message || '润色失败');
      console.error(e);
    } finally {
      setIsRefiningPrompt(false);
    }
  };

  const update = (partial: Partial<ComfyParameters>) => {
    onChange({ ...params, ...partial });
  };
  const isGemini = params.targetProvider === 'gemini';

  const handleRandomizeSeed = () => {
    update({ seed: Math.floor(Math.random() * 1000000000) });
  };

  const handleAspectRatioPreset = (w: number, h: number) => {
    update({ width: w, height: h });
  };

  const handleCopyComfyJSON = () => {
    const comfyPromptApiFormat = normalizeForComfyUI(
      params,
      positivePrompt || 'masterpiece, high detail portrait',
      negativePrompt || 'blurry, low quality, bad anatomy'
    );
    navigator.clipboard.writeText(JSON.stringify(comfyPromptApiFormat, null, 2));
    setCopiedComfyJson(true);
    setTimeout(() => setCopiedComfyJson(false), 2000);
  };

  const aspectRatios = [
    { label: '1:1', name: '正方形', w: 1024, h: 1024 },
    { label: '16:9', name: '电影宽屏', w: 1280, h: 720 },
    { label: '9:16', name: '竖屏海报', w: 720, h: 1280 },
    { label: '4:3', name: '经典照片', w: 1152, h: 864 },
    { label: '21:9', name: '超宽全景', w: 1344, h: 576 },
  ];

  return (
    <div
      className={`bg-[#16171d]/98 backdrop-blur-2xl border border-[#2b2d37] rounded-2xl shadow-2xl flex flex-col text-xs overflow-hidden ${
        isFloatingDrawer ? 'w-full h-full' : 'w-full'
      }`}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#262832] bg-[#121318] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-white text-xs tracking-wide">{title}</h3>
            <span className="text-[10px] text-slate-400 font-mono">完整遵循 ComfyUI 参数体系</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {onOpenGuide && (
            <button
              onClick={onOpenGuide}
              className="p-1.5 text-amber-400 hover:text-amber-300 rounded bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition-colors flex items-center gap-1"
              title="查看 ComfyUI 参数白话说明与新手指南"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold">指南</span>
            </button>
          )}
          <button
            onClick={handleCopyComfyJSON}
            className="p-1.5 text-slate-400 hover:text-white rounded bg-[#20222b] hover:bg-[#2b2e3b] transition-colors"
            title="复制标准 ComfyUI JSON 工作流片段"
          >
            {copiedComfyJson ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-[#20222b]"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Body Accordion Sections */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
        {/* Section 0: Prompts Studio (Positive & Negative) */}
        {(onChangePositivePrompt || onChangeNegativePrompt) && (
          <div className="bg-[#1a1b22] border border-[#272933] rounded-xl p-3 space-y-2.5">
            <div className="flex items-center justify-between font-semibold text-slate-200 text-[11px]">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                提示词工作台 (CLIP Prompts)
              </span>
              <span className="text-[10px] text-slate-400 font-mono">实时同步工作流节点</span>
            </div>

            {/* Positive Prompt */}
            {onChangePositivePrompt && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <label className="text-amber-300/90 font-mono font-semibold">正向提示词 (Positive Prompt)</label>
                  <button
                    onClick={handleRefine}
                    disabled={isRefiningPrompt || !positivePrompt}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/40 disabled:opacity-50 transition-colors"
                  >
                    <Wand2 className="w-3 h-3" />
                    <span>{isRefiningPrompt ? 'AI 润色中...' : 'AI 润色'}</span>
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={positivePrompt || ''}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  onChange={(e) => onChangePositivePrompt(e.target.value)}
                  placeholder="输入你想生成的正向画面描述 (英文效果更佳)..."
                  className="w-full bg-[#111216] border border-[#2b2d38] focus:border-amber-400/80 rounded-lg p-2.5 text-slate-200 text-[11px] font-mono leading-relaxed outline-none resize-y select-text cursor-text shadow-inner"
                />
              </div>
            )}

            {/* Negative Prompt */}
            {onChangeNegativePrompt && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <label className="text-rose-400 font-mono font-semibold">负向提示词 (Negative Prompt)</label>
                  <button
                    onClick={() =>
                      onChangeNegativePrompt(
                        'blurry, distorted, low quality, bad anatomy, deformed limbs, watermark, text, out of focus'
                      )
                    }
                    className="text-[9px] text-slate-400 hover:text-white font-mono bg-[#121316] px-1.5 py-0.5 rounded border border-[#282a35]"
                    title="填入通用排畸预设"
                  >
                    填入通用排畸
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={negativePrompt || ''}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  onChange={(e) => onChangeNegativePrompt(e.target.value)}
                  placeholder="输入需要避免的瑕疵特征 (如模糊、多肢体、水印等)..."
                  className="w-full bg-[#111216] border border-[#2b2d38] focus:border-rose-400/80 rounded-lg p-2 text-slate-300 text-[11px] font-mono leading-relaxed outline-none resize-y select-text cursor-text shadow-inner"
                />
              </div>
            )}
          </div>
        )}

        {/* Section 1: Checkpoint & Provider */}
        <div className="bg-[#1a1b22] border border-[#272933] rounded-xl p-3 space-y-2.5">
          <div className="flex items-center justify-between font-semibold text-slate-200 text-[11px]">
            <span className="flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              基底大模型 (Checkpoint) 与云端推理引擎
            </span>
          </div>

          {/* Cloud Provider Routing */}
          <div className="space-y-1">
            <label className="text-slate-400 text-[10px] font-mono">云端推理引擎 (ENGINE PROVIDER)</label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: 'huggingface', label: 'Hugging Face' },
                { id: 'modelscope', label: '魔搭 CN (国内站)' },
                { id: 'modelscope_ai', label: '魔搭 AI (国际站)' },
                { id: 'fal', label: 'Fal.ai (GPU加速)' },
                { id: 'agnes', label: 'Agnes AI (秒级)' },
                { id: 'gemini', label: 'Google Gemini' },
                { id: 'civitai', label: 'Civitai 原生' },
                { id: 'nanogpt', label: 'NanoGPT' },
                { id: 'sensenova', label: '商汤思考(LLM)' },
                { id: 'tensorart', label: 'Tensor.Art (OpenWorks)' },
              ].map((p) => {
                const isSelected = params.targetProvider === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      // G4: 切换 provider 时不自动填默认模型 → 清空 checkpoint
                      update({ targetProvider: p.id as any, checkpoint: '' });
                    }}
                    className={`py-1.5 px-1 rounded-lg text-center font-mono text-[10px] transition-all truncate ${
                      isSelected
                        ? 'bg-cyan-500/25 text-cyan-300 font-bold border border-cyan-500/50 shadow-sm'
                        : 'bg-[#121316] text-slate-400 border border-[#282a35] hover:text-slate-200'
                    }`}
                    title={p.label}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-slate-400 text-[10px] font-mono">基础大模型 (CHECKPOINT)</label>
              {onOpenModelHub && (
                <button
                  onClick={onOpenModelHub}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/40"
                >
                  <Search className="w-3 h-3" />
                  从模型中心浏览
                </button>
              )}
            </div>
            <select
              value={params.checkpoint}
              onChange={(e) => update({ checkpoint: e.target.value })}
              className="w-full bg-[#111216] border border-[#2b2d38] focus:border-cyan-500 rounded-lg px-2.5 py-1.5 text-slate-200 text-[11px] font-mono outline-none cursor-pointer"
            >
              {/* Dynamically preserve custom or current checkpoint */}
              {params.checkpoint && !allModels.some((m) => m.value === params.checkpoint) && (
                <option key={`custom-current-${params.checkpoint}`} value={params.checkpoint}>
                  ★ [当前生效模型] {params.checkpoint}
                </option>
              )}
              {/* Active Provider Models Group */}
              {allModels.filter((m) => m.provider === params.targetProvider).length > 0 && (
                <optgroup label={`当前引擎官方推荐/已检索模型 (${params.targetProvider.toUpperCase()})`}>
                  {allModels
                    .filter((m) => m.provider === params.targetProvider)
                    .map((m, idx) => (
                      <option key={`cur-${m.provider}-${m.value}-${idx}`} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                </optgroup>
              )}
              {/* All Other Ecosystem Models Group */}
              {allModels.filter((m) => m.provider !== params.targetProvider).length > 0 && (
                <optgroup label="全生态其他引擎推荐模型">
                  {allModels
                    .filter((m) => m.provider !== params.targetProvider)
                    .map((m, idx) => (
                      <option key={`eco-${m.provider}-${m.value}-${idx}`} value={m.value}>
                        [{m.provider.toUpperCase()}] {m.label}
                      </option>
                    ))}
                </optgroup>
              )}
              {allModels.length === 0 && (
                <option value={params.checkpoint || ''}>
                  {isLoadingModels ? '正在从云端实时拉取最新模型列表...' : (params.checkpoint || '点击右上角「模型中心」实时拉取选用')}
                </option>
              )}
            </select>
            {/* Custom Model ID input */}
            <div className="pt-1">
              <input
                type="text"
                value={params.checkpoint}
                onChange={(e) => update({ checkpoint: e.target.value })}
                placeholder="或直接输入自定义模型 ID / 端点路径..."
                className="w-full bg-[#0d0e12] border border-[#232530] focus:border-cyan-500 rounded px-2 py-1 text-slate-400 focus:text-slate-200 text-[10px] font-mono outline-none"
                title="支持直接填入任意 Hugging Face / Fal / Civitai 模型路径或 URN"
              />
            </div>
          </div>

          {/* Engine Parameter Notice Banner */}
          {params.targetProvider === 'agnes' && (
            <div className="p-2.5 bg-rose-950/20 border border-rose-500/30 rounded-lg text-[10px] text-rose-300/90 leading-relaxed flex items-start gap-2">
              <Info className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-rose-300">Agnes AI 官方原生架构：</span>
                <span> Agnes 采用自研端到端秒级扩散与超分管线 (agnes-image-2.5-flash / 2.1-flash)，支持秒级出片与图生图；无需也不依赖 ComfyUI 本地 Sampler/Scheduler 与 LoRA safetensors，参数已由云端接口原生智能适配。</span>
              </div>
            </div>
          )}

          {params.targetProvider === 'gemini' && (
            <div className="p-2.5 bg-cyan-950/20 border border-cyan-500/30 rounded-lg text-[10px] text-cyan-300/90 leading-relaxed flex items-start gap-2">
              <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-cyan-300">Google Gemini 官方直连：</span>
                <span> 由 Google 前沿多模态大模型直接渲染（generateContent）。不支持宽高像素，请在下方「画幅」区选择 aspect_ratio / image_size（取值随模型变化，未选择则不传）。</span>
              </div>
            </div>
          )}

          {params.targetProvider === 'sensenova' && (
            <div className="p-2.5 bg-amber-950/20 border border-amber-500/30 rounded-lg text-[10px] text-amber-300/90 leading-relaxed flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-amber-300">商汤日日新 (DeepSeek V4) 思考推理：</span>
                <span> SenseNova 专长于思维链 (CoT)深度构思与 Prompt 扩写。请在提示词面板中点击「AI 润色」或使用画布上的「LLM 推理思考节点」构思后，连线至 FLUX.1 或 SDXL 扩散引擎出片。</span>
              </div>
            </div>
          )}

          {params.targetProvider === 'tensorart' && (
            <div className="p-2.5 bg-purple-950/20 border border-purple-500/30 rounded-lg text-[10px] text-purple-300/90 leading-relaxed flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-purple-300">Tensor.Art / 吐司 (OpenWorks) 原生算力：</span>
                <span> 官方 OpenAPI 直连，涵盖 Wan 2.7、Wan 2.2、Z-Image Ultra 与 Illustrious 等前沿生图与生视频大模型；画幅、采样步数与提示词参数已由引擎原生自动适配。</span>
              </div>
            </div>
          )}
        </div>

        {/* Section 2: KSampler Studio */}
        <div className="bg-[#1a1b22] border border-[#272933] rounded-xl p-3 space-y-3">
          <div className="flex items-center justify-between font-semibold text-slate-200 text-[11px]">
            <span className="flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-blue-400" />
              KSampler 采样器核心参数
            </span>
            <span className="text-[10px] text-slate-500 font-mono">ComfyUI 规范</span>
          </div>

          {/* Seed & Seed Control */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-slate-400 text-[10px] font-mono">
              <span>SEED (随机种子与控制模式)</span>
              <div className="flex items-center gap-1">
                {(['randomize', 'fixed', 'increment', 'decrement'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => update({ seedControl: mode })}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors ${
                      (params.seedControl || 'randomize') === mode
                        ? 'bg-cyan-500/25 text-cyan-300 font-bold border border-cyan-500/50'
                        : 'bg-[#121316] text-slate-400 border border-[#262833] hover:text-slate-200'
                    }`}
                  >
                    {mode === 'randomize' ? '随机' : mode === 'fixed' ? '固定' : mode === 'increment' ? '递增+1' : '递减-1'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-1.5">
              <input
                type="number"
                value={params.seed}
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                onChange={(e) => update({ seed: parseInt(e.target.value) || 0 })}
                className="flex-1 bg-[#111216] border border-[#2b2d38] focus:border-cyan-500 rounded-lg px-2.5 py-1.5 font-mono text-cyan-300 text-[11px] outline-none select-text cursor-text"
              />
              <button
                type="button"
                onClick={handleRandomizeSeed}
                className="p-2 bg-[#23252f] hover:bg-[#2e313e] text-slate-200 rounded-lg border border-[#353846] transition-colors flex items-center gap-1 text-[10px]"
                title="骰子重新摇号"
              >
                <Dices className="w-3.5 h-3.5 text-cyan-400" />
                <span>摇号</span>
              </button>
            </div>
          </div>

          {/* Steps & CFG Sliders */}
          <div className="space-y-1">
            <div className="flex justify-between text-slate-400 text-[10px] font-mono">
              <span title="采样步数：FLUX 推荐 4~28 步，SDXL 推荐 25~30 步">STEPS (采样步数)</span>
              <span className="text-cyan-400 font-bold">{params.steps} 步</span>
            </div>
            <input
              type="range"
              min={1}
              max={80}
              step={1}
              value={params.steps}
              onChange={(e) => update({ steps: parseInt(e.target.value) })}
              className="w-full h-1.5 bg-[#252833] rounded appearance-none cursor-pointer accent-cyan-400"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-slate-400 text-[10px] font-mono">
              <span title="提示词引导系数：FLUX 推荐 3.5，SDXL 推荐 7.0~8.0">CFG SCALE (提示词引导系数)</span>
              <span className="text-cyan-400 font-bold">{params.cfg?.toFixed(1) ?? '未设置'}</span>
            </div>
            <input
              type="range"
              min={1.0}
              max={20.0}
              step={0.1}
              value={params.cfg}
              onChange={(e) => update({ cfg: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-[#252833] rounded appearance-none cursor-pointer accent-cyan-400"
            />
          </div>

          {/* Sampler & Scheduler Selection */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-slate-400 text-[10px] font-mono">SAMPLER (采样算法)</label>
              <select
                value={params.sampler}
                onChange={(e) => update({ sampler: e.target.value })}
                className="w-full bg-[#111216] border border-[#2b2d38] rounded-lg px-2 py-1.5 text-slate-200 text-[11px] font-mono outline-none"
              >
                {SAMPLER_OPTIONS.map((s, idx) => (
                  <option key={`sampler-${s.value}-${idx}`} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-slate-400 text-[10px] font-mono">SCHEDULER (调度器)</label>
              <select
                value={params.scheduler}
                onChange={(e) => update({ scheduler: e.target.value })}
                className="w-full bg-[#111216] border border-[#2b2d38] rounded-lg px-2 py-1.5 text-slate-200 text-[11px] font-mono outline-none"
              >
                {SCHEDULER_OPTIONS.map((sc, idx) => (
                  <option key={`scheduler-${sc.value}-${idx}`} value={sc.value}>
                    {sc.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Denoise (img2img) */}
          <div className="space-y-1">
            <div className="flex justify-between text-slate-400 text-[10px] font-mono">
              <span title="文生图固定为 1.0；图生图与重绘建议 0.35 ~ 0.65">DENOISE (重绘降噪幅度)</span>
              <span className="text-cyan-400 font-bold">{params.denoise.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0.0}
              max={1.0}
              step={0.01}
              value={params.denoise}
              onChange={(e) => update({ denoise: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-[#252833] rounded appearance-none cursor-pointer accent-cyan-400"
            />
          </div>
        </div>

        {/* Section 3: LoRA Stack */}
        <div className="bg-[#1a1b22] border border-[#272933] rounded-xl p-3 space-y-2.5">
          <div className="flex items-center justify-between font-semibold text-slate-200 text-[11px]">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              LoRA 微调模型堆叠 ({params.loras.length})
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={onOpenCivitai || onOpenModelHub}
                className="text-[10px] text-purple-400 hover:text-purple-300 flex items-center gap-1 bg-purple-950/40 px-2 py-0.5 rounded border border-purple-800/40 transition-colors"
                title="打开全生态 LoRA 模型中心 (Civitai / Hugging Face / 魔搭 / Fal / Tensor)"
              >
                <Plus className="w-3 h-3" />
                添加 LoRA
              </button>
            </div>
          </div>

          {params.loras.length === 0 ? (
            <div className="p-3 text-center text-slate-500 rounded-lg border border-dashed border-[#2b2d38] text-[11px] space-y-1">
              <p>当前未挂载 LoRA 模型</p>
              <p className="text-[10px] text-purple-400/80">点击右上角「添加 LoRA」从 Civitai / HF 挑选</p>
            </div>
          ) : (
            <div className="space-y-2">
              {params.loras.map((lora, idx) => {
                const compat = validateLoraCompatibility(params.checkpoint, (lora as any).baseModel, lora.name, params.targetProvider || (params.checkpoint?.startsWith('fal-ai/') ? 'fal' : undefined));
                return (
                  <div key={idx} className="bg-[#121318] p-2.5 rounded-lg border border-[#282a35] space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-semibold text-white truncate max-w-[170px]" title={lora.name}>
                          {lora.name.replace('.safetensors', '')}
                        </span>
                        {compat.isCompatible ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 shrink-0">
                            兼容
                          </span>
                        ) : (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-950/60 text-rose-400 border border-rose-800/40 shrink-0 flex items-center gap-0.5">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            不匹配
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          const next = [...params.loras];
                          next.splice(idx, 1);
                          update({ loras: next });
                        }}
                        className="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-[#1f2029]"
                        title="移除此 LoRA"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Endpoint / architecture compatibility banner */}
                    {!compat.isCompatible && (
                      <div className={`${compat.endpointUnsupported ? 'bg-rose-950/30 border-rose-500/40' : 'bg-amber-950/30 border-amber-500/30'} border rounded-lg p-2 text-[10px] space-y-1.5`}>
                        <p className={`${compat.endpointUnsupported ? 'text-rose-300' : 'text-amber-300'} leading-tight`}>
                          {compat.message}
                        </p>
                        {!compat.endpointUnsupported && compat.recommendedCheckpoint && (
                          <button
                            onClick={() => update({ checkpoint: compat.recommendedCheckpoint })}
                            className="w-full py-1 px-2 rounded bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/40 text-amber-200 font-bold flex items-center justify-center gap-1 transition-colors text-[10px]"
                          >
                            <span>一键切换为兼容底模 ({compat.recommendedCheckpoint.split('/').pop()})</span>
                          </button>
                        )}
                      </div>
                    )}

                  {/* Weight slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-mono text-slate-400">
                      <span>推荐权重 (STRENGTH)</span>
                      <span className="text-purple-300 font-bold">{lora.modelStrength.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min={-1.5}
                      max={2.0}
                      step={0.05}
                      value={lora.modelStrength}
                      onChange={(e) => {
                        const next = [...params.loras];
                        next[idx].modelStrength = parseFloat(e.target.value);
                        next[idx].clipStrength = parseFloat(e.target.value);
                        update({ loras: next });
                      }}
                      className="w-full h-1 bg-[#252833] rounded appearance-none cursor-pointer accent-purple-400"
                    />
                  </div>

                  {lora.triggerWords && (
                    <div className="flex items-center justify-between text-[10px] bg-[#181922] p-1.5 rounded border border-[#232430]">
                      <span className="text-slate-400 font-mono truncate max-w-[160px]" title={lora.triggerWords}>
                        触发词: {lora.triggerWords}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {onInsertTriggerWords && (
                          <button
                            onClick={() => onInsertTriggerWords(lora.triggerWords || '')}
                            className="text-cyan-400 hover:text-cyan-300 font-bold"
                            title="自动将触发词插入正向提示词"
                          >
                            插入
                          </button>
                        )}
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(lora.triggerWords || '');
                            setCopiedTrigger(lora.triggerWords || '');
                            setTimeout(() => setCopiedTrigger(null), 1500);
                          }}
                          className="text-purple-400 hover:text-purple-300"
                          title="复制触发词"
                        >
                          {copiedTrigger === lora.triggerWords ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          )}
        </div>

        {/* Section 4: Latent Geometry & Aspect Ratio */}
        <div className="bg-[#1a1b22] border border-[#272933] rounded-xl p-3 space-y-2.5">
          <span className="font-semibold text-slate-200 text-[11px] block">
            📐 潜空间画幅比例 (Latent Canvas Dimensions)
          </span>

          <div className="grid grid-cols-5 gap-1.5">
            {aspectRatios.map((ar) => {
              const isActive = !isGemini && params.width === ar.w && params.height === ar.h;
              return (
                <button
                  key={ar.label}
                  disabled={isGemini}
                  onClick={() => handleAspectRatioPreset(ar.w, ar.h)}
                  className={`py-1.5 rounded-lg text-center transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                    isActive
                      ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 font-bold'
                      : 'bg-[#121316] border border-[#272933] text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="font-mono text-[11px]">{ar.label}</div>
                  <div className="text-[9px] text-slate-500">{ar.name}</div>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-slate-400 text-[10px]">宽度 WIDTH (像素)</span>
                {isGemini && <FieldStatusBadge status="unsupported" />}
              </div>
              <input
                type="number"
                step={64}
                disabled={isGemini}
                value={isGemini ? '' : params.width}
                onChange={(e) => update({ width: parseInt(e.target.value) || 1024 })}
                className="w-full bg-[#111216] border border-[#2b2d38] rounded-lg px-2.5 py-1 text-slate-200 outline-none font-mono disabled:opacity-40 disabled:cursor-not-allowed"
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-slate-400 text-[10px]">高度 HEIGHT (像素)</span>
                {isGemini && <FieldStatusBadge status="unsupported" />}
              </div>
              <input
                type="number"
                step={64}
                disabled={isGemini}
                value={isGemini ? '' : params.height}
                onChange={(e) => update({ height: parseInt(e.target.value) || 1024 })}
                className="w-full bg-[#111216] border border-[#2b2d38] rounded-lg px-2.5 py-1 text-slate-200 outline-none font-mono disabled:opacity-40 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {isGemini && (
            <div className="grid grid-cols-2 gap-2">
              <GeminiFieldSelect
                model={params.checkpoint || ''}
                field="aspect_ratio"
                value={params.aspectRatio || ''}
                onChange={(v) => update({ aspectRatio: v || undefined })}
              />
              <GeminiFieldSelect
                model={params.checkpoint || ''}
                field="image_size"
                value={params.imageSize || ''}
                onChange={(v) => update({ imageSize: v || undefined })}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
