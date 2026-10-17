import { noteUserModelSelection } from '../services/userModelSelection';
import { civitaiEngines, civitaiEcosystemsFor } from '../schemas/providerSchema';
import { ensureModelSchema, withCachedSchemaProperties } from '../services/modelSchemaCache';
import {ApiParameterEditor} from './ApiParameterEditor';
import {videoDurationBounds, videoSchemaValueIssue} from '../utils/frontendParameters';
import {ProviderModelSelect} from './ProviderModelSelect';
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
import { SAMPLER_OPTIONS, SCHEDULER_OPTIONS } from '../constants/nodes';
import { refinePromptWithGemini, getRefineModelSelection } from '../services/api';
import { validateLoraCompatibility } from '../utils/baseModelMatcher';
import { isLoraUnsupportedOnEndpoint, toSchemaProvider, LORA_UNSUPPORTED_TITLE } from '../utils/resolveCheckpoint';
import { normalizeForComfyUI } from '../utils/engineParameterNormalizer';
import { GeminiFieldSelect } from './GeminiFieldSelect';
import { FieldStatusBadge, SchemaSendBadge } from './FieldStatusBadge';
import { SCHEMA_OMIT_REASON, readDeclaredSchemaProperties } from '../utils/schemaSendHint';
import { schemaSendStatus } from '../utils/schemaSendStatus';
import { parseExplicitLoraStrength } from '../utils/loraStrength';
import { fieldOptions, getFieldSpec, resolveSchemaModelId, type FieldKey, type Provider as SchemaProvider } from '../schemas/providerSchema';
import { middleEllipsis } from '../utils/middleEllipsis';
import { randomSeedFor } from '../utils/seedRange';

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
  /** Execution node has a real reference-image input (img2img). Without it denoise/strength is not sent. */
  hasImageInput?: boolean;
  /** clean-0942: why the selected model does not reach the sampler (same reason the Run gate shows). */
  modelChainIssue?: string;
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
  hasImageInput,
  modelChainIssue,
}) => {
  const [copiedComfyJson, setCopiedComfyJson] = React.useState(false);
  const [copiedTrigger, setCopiedTrigger] = React.useState<string | null>(null);
  const [isRefiningPrompt, setIsRefiningPrompt] = React.useState(false);
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
  const isOpenAiCompat = params.targetProvider === 'openai_compat';
  const isGrokCompat = params.targetProvider === 'grok_compat';
  const schemaProvider: SchemaProvider | undefined = toSchemaProvider(params.targetProvider);
  // Prefer checkpoint when it exists in schema; empty/unknown → undefined (no silent listModels[0]).
  const civitaiSchemaId =
    schemaProvider === 'civitai' && params.civitaiEngine && params.civitaiEcosystem
      ? `${params.civitaiEngine}:${params.civitaiEcosystem}`
      : undefined;
  const schemaModel = schemaProvider
    ? resolveSchemaModelId(schemaProvider, civitaiSchemaId || params.checkpoint)
    : (params.checkpoint || '');
  const fieldUnsupported = (field: FieldKey) =>
    Boolean(schemaProvider && schemaModel && getFieldSpec(schemaProvider, schemaModel, field)?.status === 'unsupported');
  const isFalWan = params.targetProvider === 'fal' && ['fal-ai/wan-t2v', 'fal-ai/wan-i2v'].includes(params.checkpoint || '');
  const greySeed = isGemini || isOpenAiCompat || isGrokCompat || fieldUnsupported('seed');
  const greySteps = isOpenAiCompat || isGrokCompat || fieldUnsupported('steps');
  const greyCfg = isOpenAiCompat || isGrokCompat || fieldUnsupported('cfg');
  const greySampler = isOpenAiCompat || isGrokCompat || fieldUnsupported('sampler');
  const greyScheduler = isOpenAiCompat || isGrokCompat || fieldUnsupported('scheduler');
  const greyDenoise = isOpenAiCompat || isGrokCompat || fieldUnsupported('denoise');
  const endpointLoraUnsupported = isLoraUnsupportedOnEndpoint(
    params.targetProvider,
    civitaiSchemaId || params.checkpoint,
  ).unsupported;
  const greyLoras = isOpenAiCompat || isGrokCompat || fieldUnsupported('loras') || endpointLoraUnsupported;
  const greyWidthHeight = isGemini || isOpenAiCompat || isGrokCompat || fieldUnsupported('width') || fieldUnsupported('height');
  const greyNegative = isOpenAiCompat || isGrokCompat || fieldUnsupported('negative_prompt');
  const greyNumImages = fieldUnsupported('num_images');
  ensureModelSchema(params.targetProvider, params.checkpoint);
  const customParamsJson = withCachedSchemaProperties(params.targetProvider, params.checkpoint, params.customParameters);
  const sendSteps = schemaSendStatus(params.targetProvider, 'steps', (params as any).steps, customParamsJson);
  const omitSteps = sendSteps === 'not_sent';
  const sendCfg = schemaSendStatus(params.targetProvider, 'cfg', (params as any).cfg, customParamsJson);
  const omitCfg = sendCfg === 'not_sent';
  const sendSampler = schemaSendStatus(params.targetProvider, 'sampler', (params as any).sampler, customParamsJson);
  const omitSampler = sendSampler === 'not_sent';
  const sendScheduler = schemaSendStatus(params.targetProvider, 'scheduler', (params as any).scheduler, customParamsJson);
  const omitScheduler = sendScheduler === 'not_sent';
  const sendDenoiseUnscoped = schemaSendStatus(params.targetProvider, 'denoise', (params as any).denoise, customParamsJson, undefined, undefined, { hasReferenceImage: true });
  const sendDenoiseSchema = schemaSendStatus(params.targetProvider, 'denoise', (params as any).denoise, customParamsJson, undefined, undefined, { hasReferenceImage: hasImageInput !== false });
  // Same plan as the payload: no reference image ⇒ omitted; keep the specific 「无参考图」 wording when the Schema would otherwise accept it.
  const sendDenoise = sendDenoiseSchema === 'not_sent' && sendDenoiseUnscoped !== 'not_sent' && hasImageInput === false ? 'no_image' as const : sendDenoiseSchema;
  const omitDenoise = sendDenoise === 'not_sent';
  const sendWidthHeight = schemaSendStatus(params.targetProvider, 'width', (params as any).width, customParamsJson);
  const sendLoras = schemaSendStatus(params.targetProvider, 'loras', params.loras?.length ? params.loras : undefined, customParamsJson);
  const omitWidthHeight = sendWidthHeight === 'not_sent';
  const schemaDeclaresAspectRatio = !!readDeclaredSchemaProperties(customParamsJson)?.has('aspect_ratio');
  const schemaSelect = (field: FieldKey, value: string, onChange: (v: string) => void, label: string) => {
    if (!schemaProvider || !schemaModel) return null;
    const spec = getFieldSpec(schemaProvider, schemaModel, field);
    if (!spec || spec.status === 'unsupported' || !spec.enum) return null;
    return (
      <div className="space-y-1" key={field}>
        <label className="text-slate-400 text-[10px] font-mono">{label}</label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-[#111216] border border-[#2b2d38] rounded-lg px-2 py-1.5 text-slate-200 text-[11px] font-mono outline-none"
        >
          <option value="">未选择（不传）</option>
          {fieldOptions(schemaProvider, schemaModel, field).map((v) => (
            <option key={v.value} value={v.value}>
              {v.value}
            </option>
          ))}
        </select>
      </div>
    );
  };

  const handleRandomizeSeed = () => {
    update({ seed: randomSeedFor(params.targetProvider, params.checkpoint) });
  };

  const handleAspectRatioPreset = (w: number, h: number) => {
    update({ width: w, height: h });
  };

  const handleCopyComfyJSON = async () => {
    let comfyPromptApiFormat: Record<string, any>;
    try {
      comfyPromptApiFormat = normalizeForComfyUI(
        params,
        positivePrompt || '',
        negativePrompt || ''
      );
    } catch (error) {
      alert(error instanceof Error ? error.message : '无法生成 ComfyUI API JSON');
      return;
    }
    try { await navigator.clipboard.writeText(JSON.stringify(comfyPromptApiFormat, null, 2)); } catch { alert("复制失败，请检查剪贴板权限"); return; }
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
      className={`studio-readable parameter-inspector bg-[#16171d]/98 backdrop-blur-2xl border border-[#2b2d37] rounded-2xl shadow-2xl flex flex-col text-xs overflow-hidden ${
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
            <span className="text-[10px] text-slate-400 font-mono">按所选端点核实参数能力</span>
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
              <div className="space-y-1" data-testid="inspector-negative-prompt">
                <div className="flex flex-wrap items-start justify-between gap-2 text-[10px]">
                  <label className="text-rose-400 font-mono font-semibold flex flex-wrap items-center gap-1.5 min-w-0">
                    <span className="shrink-0">负向提示词 (Negative Prompt)</span>
                    {greyNegative && <FieldStatusBadge status="unsupported" />}
                    {!greyNegative && <span className="min-w-0 max-w-full [overflow-wrap:anywhere]" data-testid="inspector-negative-badge"><SchemaSendBadge status={schemaSendStatus(params.targetProvider, 'negative_prompt', negativePrompt, customParamsJson)} omitTitle={SCHEMA_OMIT_REASON} /></span>}
                  </label>
                  <button
                    onClick={() =>
                      onChangeNegativePrompt(
                        'blurry, distorted, low quality, bad anatomy, deformed limbs, watermark, text, out of focus'
                      )
                    }
                    disabled={greyNegative}
                    className="shrink-0 text-[9px] text-slate-400 hover:text-white font-mono bg-[#121316] px-1.5 py-0.5 rounded border border-[#282a35] disabled:opacity-40 disabled:cursor-not-allowed"
                    title={greyNegative ? '该服务商不支持负向提示词' : '填入通用排畸预设'}
                  >
                    填入通用排畸
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={greyNegative ? '' : (negativePrompt || '')}
                  disabled={greyNegative}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  onChange={(e) => onChangeNegativePrompt(e.target.value)}
                  placeholder={greyNegative ? '该服务商不支持负向提示词' : '输入需要避免的瑕疵特征 (如模糊、多肢体、水印等)...'}
                  className="w-full bg-[#111216] border border-[#2b2d38] focus:border-rose-400/80 rounded-lg p-2 text-slate-300 text-[11px] font-mono leading-relaxed outline-none resize-y select-text cursor-text shadow-inner disabled:opacity-40 disabled:cursor-not-allowed"
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
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { id: 'huggingface', label: 'Hugging Face' },
                { id: 'modelscope', label: '魔搭 CN (国内站)' },
                { id: 'modelscope_ai', label: '魔搭 AI (国际站)' },
                { id: 'fal', label: 'Fal.ai (GPU加速)' },
                { id: 'agnes', label: 'Agnes AI' },
                { id: 'gemini', label: 'Google Gemini' },
                { id: 'civitai', label: 'Civitai 原生' },
                { id: 'nanogpt', label: 'NanoGPT' },
                { id: 'sensenova', label: '商汤日日新 (SenseNova)' },
                { id: 'openai_compat', label: 'OpenAI 兼容中转' },
                { id: 'grok_compat', label: 'Grok 兼容中转' },
                { id: 'muapi', label: 'MuAPI' },
                { id: 'wavespeed', label: 'WaveSpeed' },
                { id: 'sogni', label: 'Sogni' },
                { id: 'krea', label: 'Krea' },
                { id: 'together', label: 'Together' },
                { id: 'aimlapi', label: 'AIMLAPI' },
                { id: 'novita', label: 'Novita' },
                { id: 'venice', label: 'Venice' },
                { id: 'openworks', label: 'Tensor.Art OpenWorks' },
              ].map((p) => {
                const isSelected = params.targetProvider === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      // G4: 切换 provider 时不自动填默认模型 → 清空 checkpoint
                      if (!isSelected) update({ targetProvider: p.id as any, checkpoint: '' }); // same provider: keep checkpoint (reload must not blank)
                    }}
                    className={`py-1.5 px-1 rounded-lg text-center font-mono text-[10px] transition-all whitespace-normal break-words leading-tight ${
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
            {params.retiredToolSelection && !params.checkpoint && <details className="text-xs text-amber-200"><summary>旧选择已清除，请选择模型</summary><pre className="whitespace-pre-wrap break-all">{JSON.stringify(params.retiredToolSelection,null,2)}</pre></details>}
            <ProviderModelSelect provider={params.targetProvider || ''} value={params.checkpoint || ''} onChange={checkpoint=>update({checkpoint})} />
            <p className="text-sm text-slate-400 break-all">提交服务商：{params.targetProvider || '未选择'} · 模型：{params.checkpoint || '未选择'}</p>
            {modelChainIssue && <p role="alert" data-testid="model-chain-issue" className="text-sm text-amber-200">{modelChainIssue}</p>}
            {/* Custom Model ID input */}
            <div className="pt-1">
              <input
                type="text"
                value={params.checkpoint}
                onChange={(e) => update({ checkpoint: e.target.value })}
                onFocus={(e) => { e.currentTarget.dataset.committed = e.currentTarget.value; }}
                onKeyDown={(e) => { if (e.key === 'Enter') { const el = e.currentTarget; if (el.value !== (el.dataset.committed ?? '')) { el.dataset.committed = el.value; noteUserModelSelection(params.targetProvider, el.value); } } }}
                onBlur={(e) => { if (e.currentTarget.value !== (e.currentTarget.dataset.committed ?? '')) noteUserModelSelection(params.targetProvider, e.currentTarget.value); }}
                data-testid="inspector-custom-model-id"
                placeholder="或直接输入自定义模型 ID / 端点路径..."
                className="w-full bg-[#0d0e12] border border-[#232530] focus:border-cyan-500 rounded px-2 py-1 text-slate-400 focus:text-slate-200 text-[10px] font-mono outline-none"
                title="支持直接填入任意 Hugging Face / Fal / Civitai 模型路径或 URN"
              />
            </div>
          </div>

          {params.executionBlockedReason && (() => {
            const reason = String(params.executionBlockedReason);
            const pendingStyle = /载入后挂上再运行|待配方|真 LoRA 地址/.test(reason);
            const suffix = pendingStyle ? '' : ' · 仅载入，不能立即运行；请保留来源，创建新的显式生成分支。';
            return <p role="alert" className="text-sm text-amber-200">{reason}{suffix}</p>;
          })()}
          {params.unresolvedModel && <p role="alert" className="text-sm text-amber-200">底模尚未核实，必须重新选择已核实资源。</p>}
          {params.requireReferenceImage && <p role="note" className="text-sm text-amber-200">编辑输入需要明确参考图；展示样图不作为输入。</p>}
          {params.targetProvider === 'video' && <label className="block text-sm text-slate-300">实际视频服务商<select aria-label="实际视频服务商" value={params.videoProvider || ''} onChange={e=>update({videoProvider:e.target.value || undefined})} className="mt-1 w-full rounded-lg border border-slate-700 bg-[#111216] p-2"><option value="">请选择实际 provider</option><option value="fal">Fal</option><option value="agnes">Agnes</option><option value="grok_compat">Grok 兼容中转</option>{params.videoProvider && !['fal','agnes','grok_compat'].includes(params.videoProvider) && <option value={params.videoProvider}>{params.videoProvider}</option>}</select></label>}
          {(params.targetProvider === 'civitai' || (params.targetProvider === 'video' && params.videoProvider === 'civitai')) && <div className="space-y-2 rounded-lg border border-slate-700 p-3">
            <label className="block text-sm text-slate-300">Civitai engine<select aria-label="Civitai engine" value={params.civitaiEngine || ''} onChange={e=>update({civitaiEngine:e.target.value || undefined})} className="mt-1 w-full rounded-lg border border-slate-700 bg-[#111216] p-2"><option value="">请选择引擎</option>{civitaiEngines().map(e=><option key={e} value={e}>{e}</option>)}{params.civitaiEngine && !civitaiEngines().includes(params.civitaiEngine) && <option value={params.civitaiEngine}>{params.civitaiEngine}</option>}</select></label>
            <label className="block text-sm text-slate-300">Civitai ecosystem<input aria-label="Civitai ecosystem" value={params.civitaiEcosystem || ''} onChange={e=>update({civitaiEcosystem:e.target.value || undefined})} list="civitai-ecosystems" placeholder="显式填写生态；未知生态保留" className="mt-1 w-full rounded-lg border border-slate-700 bg-[#111216] p-2" /><datalist id="civitai-ecosystems">{civitaiEcosystemsFor(params.civitaiEngine || '').map(x=><option key={x} value={x} />)}</datalist></label>
            <label className="block text-sm text-slate-300">Civitai model<input aria-label="Civitai model" value={params.civitaiModel || ''} onChange={e=>update({civitaiModel:e.target.value || undefined})} placeholder="按官方 recipe 填写 model selector" className="mt-1 w-full rounded-lg border border-slate-700 bg-[#111216] p-2" /></label>
            <p className="text-sm text-slate-400">不自动填写引擎或更换模型。AIR 和引擎兼容性以 metadata / 上游响应为准。</p>
          </div>}
          {(params.targetProvider === 'video' || params.videoProvider || params.checkpoint?.includes('video')) && <div className="space-y-2">
            <label className="block text-sm text-slate-300">视频时长（秒）<span className="relative block">{(()=>{const db=videoDurationBounds(params.videoProvider || params.targetProvider,params.checkpoint);return db.options ? <select aria-label="视频时长（秒）" value={params.videoDuration === undefined ? '' : String(params.videoDuration)} onChange={e=>{const hit=db.options!.find(o=>String(o)===e.target.value);update({videoDuration:hit as any});}} className="mt-1 w-full rounded-lg border border-slate-700 bg-[#111216] p-2 pr-8"><option value="">未选择（不提交）</option>{params.videoDuration !== undefined && !db.options.some(o=>String(o)===String(params.videoDuration)) && <option value={String(params.videoDuration)}>{String(params.videoDuration)} 秒（不可用）</option>}{db.options.map(o=><option key={String(o)} value={String(o)}>{String(o)} 秒</option>)}</select> : <input aria-label="视频时长（秒）" type="number" min={db.min} max={db.max} step={1} value={params.videoDuration ?? ''} onChange={e=>update({videoDuration:e.target.value === '' ? undefined : Number(e.target.value)})} className="mt-1 w-full rounded-lg border border-slate-700 bg-[#111216] p-2 pr-8" />;})()}<span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-[calc(50%-2px)] text-slate-400">秒</span></span><span className="text-sm text-slate-400">可选值来自端点官方 Schema（duration）；Schema 未读取时不限制，未填写不提交。</span>{(()=>{const iss=videoSchemaValueIssue(params.videoProvider || params.targetProvider,params.checkpoint,'duration',params.videoDuration);return iss ? <span role="alert" className="block text-sm text-rose-300">{iss}</span> : null;})()}</label>
            <label className="block text-sm text-slate-300">视频 resolution<input aria-label="视频 resolution" value={params.resolution || ''} onChange={e=>update({resolution:e.target.value || undefined})} placeholder="按所选端点填写；未设置保留空" className="mt-1 w-full rounded-lg border border-slate-700 bg-[#111216] p-2" /></label>
          </div>}
          {params.targetProvider === 'fal' && params.checkpoint === 'fal-ai/lora' && <label className="block text-sm text-slate-300">SD LoRA 底模 model_name<input className="mt-1 w-full bg-[#111216] border border-slate-700 rounded-lg p-2" value={params.falModelName || ''} onChange={e => update({falModelName:e.target.value})} placeholder="必填：底模仓库 ID 或 URL" /></label>}

          {params.targetProvider === 'huggingface' && (
            <div className="space-y-2 rounded-lg border border-amber-800/40 bg-amber-950/20 p-3">
              <label className="block text-sm text-amber-200">HF 在线推理路由
                <select aria-label="HF 在线推理路由" value={params.hfProvider || ''} onChange={e => update({ hfProvider: (e.target.value || undefined) as ComfyParameters['hfProvider'] })} className="mt-1 w-full rounded-lg border border-slate-700 bg-[#111216] p-2 text-slate-200">
                  <option value="">请选择实际执行路由</option>
                  <option value="hf-inference">HF Inference</option><option value="z-image-space">Z-Image 官方 Space</option>
                  <option value="fal-ai">HF → fal-ai（计费推理）</option>
                </select>
              </label>
              <p className="text-sm text-slate-400">模型仓库可下载不代表可在线推理。选择 fal-ai 会通过 HF Router 提交至该服务商并计费；LoRA 能力由模型与路由决定。</p>

            </div>
          )}

          {(params.targetProvider === 'modelscope' || params.targetProvider === 'modelscope_ai') && <p role="note" className="rounded-lg border border-amber-800/40 p-3 text-sm text-amber-200">魔搭云端已核实提示词、模型与 LoRA 格式；其余参数按请求原样发送，是否接受以本次上游响应为准。Qwen Image Edit 支持参考图。模型目录中的仓库不保证已开通在线推理。</p>}
          {['civitai','fal','modelscope','modelscope_ai','huggingface','muapi','wavespeed','sogni','krea','together','aimlapi','novita','venice','openworks','replicate'].includes(params.targetProvider) && <ApiParameterEditor provider={params.targetProvider} model={params.checkpoint} value={params.customParameters} onChange={customParameters=>update({customParameters})} canvasLoras={params.loras ?? []} />}
          {params.targetProvider === 'replicate' && (
            <div className="p-2.5 bg-orange-950/20 border border-orange-500/30 rounded-lg text-[10px] text-orange-300/90 leading-relaxed flex items-start gap-2">
              <Info className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-orange-300">Replicate 官方原生架构：</span>
                <span> 使用 Replicate 官方模型运行平台。支持 FLUX.1 (FLUX.1-dev 支持 hf_lora)、SDXL、Ideogram 等模型。支持自定义参数注入与异步执行轮询。</span>
              </div>
            </div>
          )}
          {/* Engine Parameter Notice Banner */}
          {params.targetProvider === 'agnes' && (
            <div className="p-2.5 bg-rose-950/20 border border-rose-500/30 rounded-lg text-[10px] text-rose-300/90 leading-relaxed flex items-start gap-2">
              <Info className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-rose-300">Agnes AI 官方原生架构：</span>
                <span> 使用当前选择的 Agnes 模型。界面中禁用的参数不会生效；实际提交字段与上游响应可在生成历史中查看。</span>
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
            <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-950/20 p-3">
              <p className="text-amber-200">商汤日日新 · 图像生成与编辑：U 系列使用图像接口，不作为 Chat 模型。LLM 提示词润色使用另行选择的对话模型，与图像生成分开。</p>
              <label className="block text-sm text-slate-300">SenseNova size<input type="text" aria-label="SenseNova size" value={params.size ?? ''} onChange={e=>update({size:e.target.value === '' ? undefined : e.target.value})} placeholder="auto / 2048x2048；留空时按画布宽高(如1024x1024)发送，无宽高则 auto" className="mt-1 w-full rounded-lg border border-slate-700 bg-[#111216] p-2 focus-visible:outline-2 focus-visible:outline-cyan-400" /><span className="text-amber-200">官方文档写 2K/4K 常量，但本次上游对这两个值返回 400：invalid size, should be auto or WIDTHxHEIGHT。建议明确填写像素尺寸或 auto；原值保留，不自动转换，也不在此限制提交。</span></label>
              <label className="block text-sm text-slate-300">SenseNova output_format<input type="text" aria-label="SenseNova output_format" value={params.outputFormat ?? ''} onChange={e=>update({outputFormat:e.target.value === '' ? undefined : e.target.value})} placeholder="png / jpeg / webp；留空不显式传" className="mt-1 w-full rounded-lg border border-slate-700 bg-[#111216] p-2 focus-visible:outline-2 focus-visible:outline-cyan-400" /><span className="text-slate-400">本站支持 png/jpeg/webp；官方编辑文档也列 jpg，但本站尚未接通。自定义原值保留。</span></label>
              {([['watermark', 'watermark'], ['prompt_extend', 'promptExtend']] as const).map(([field, param]) => <label key={field} className="block text-sm text-slate-300">SenseNova {field}<select aria-label={`SenseNova ${field}`} value={typeof params[param] === 'boolean' ? String(params[param]) : ''} onChange={e=>update({[param]:e.target.value === '' ? undefined : e.target.value === 'true'})} className="mt-1 w-full rounded-lg border border-slate-700 bg-[#111216] p-2 focus-visible:outline-2 focus-visible:outline-cyan-400"><option value="">未设置（不显式传）</option><option value="false">false（关闭）</option><option value="true">true（开启）</option></select></label>)}
            </div>
          )}

          {params.targetProvider === 'openai_compat' && (
            <div className="p-2.5 bg-emerald-950/20 border border-emerald-500/30 rounded-lg text-[10px] text-emerald-300/90 leading-relaxed flex items-start gap-2">
              <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-emerald-300">OpenAI 兼容中转：</span>
                <span> 不是官方 OpenAI。支持 size / quality / output_format / background / moderation；seed、负向提示词、steps、CFG、采样器、LoRA 该服务商不支持（灰显，发送会 400）。</span>
              </div>
            </div>
          )}

          {params.targetProvider === 'grok_compat' && (
            <div className="p-2.5 bg-slate-900/40 border border-slate-400/30 rounded-lg text-[10px] text-slate-200/90 leading-relaxed flex items-start gap-2">
              <Info className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-100">Grok 兼容中转：</span>
                <span> 不是官方 xAI。支持 aspect_ratio / resolution；像素宽高、seed、负向、steps、CFG、LoRA 该服务商不支持。HTTP 503 grok_media_no_eligible_account 原样暴露，不换商。</span>
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
            <span className="text-[10px] text-slate-500 font-mono">端点能力</span>
          </div>

          {/* Seed & Seed Control */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-1 text-slate-400 text-[10px] font-mono">
              <span className="flex items-center gap-1.5">
                SEED (随机种子与控制模式)
                {greySeed && <FieldStatusBadge status="unsupported" />}
                {!greySeed && <SchemaSendBadge status={schemaSendStatus(params.targetProvider, 'seed', params.seed, customParamsJson)} omitTitle={SCHEMA_OMIT_REASON} />}
              </span>
              <div className="flex flex-wrap items-center justify-end gap-1">
                {(['randomize', 'fixed', 'increment', 'decrement'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    disabled={greySeed}
                    onClick={() => { if (!greySeed) update({ seedControl: mode }); }}
                    title={greySeed ? '该服务商不支持' : undefined}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-mono whitespace-nowrap shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-slate-400 ${
                      !greySeed && (params.seedControl || 'randomize') === mode
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
                value={greySeed ? '' : params.seed}
                disabled={greySeed}
                placeholder={greySeed ? '该服务商不支持' : undefined}
                title={greySeed ? '该服务商不支持' : undefined}
                aria-label={greySeed ? 'seed（该服务商不支持）' : 'seed'}
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                onChange={(e) => { if (!greySeed) update({ seed: parseInt(e.target.value) || 0 }); }}
                className="flex-1 bg-[#111216] border border-[#2b2d38] focus:border-cyan-500 rounded-lg px-2.5 py-1.5 font-mono text-cyan-300 text-[11px] outline-none select-text cursor-text disabled:opacity-40 disabled:cursor-not-allowed"
              />
              <button
                type="button"
                onClick={handleRandomizeSeed}
                disabled={greySeed}
                className="p-2 bg-[#23252f] hover:bg-[#2e313e] text-slate-200 rounded-lg border border-[#353846] transition-colors flex items-center gap-1 text-[10px] disabled:opacity-40 disabled:cursor-not-allowed"
                title="骰子重新摇号"
              >
                <Dices className="w-3.5 h-3.5 text-cyan-400" />
                <span>摇号</span>
              </button>
            </div>
          </div>

          {/* Steps & CFG Sliders */}
          <div className="space-y-1">
            <div className="flex flex-wrap justify-between gap-x-2 gap-y-1 text-slate-400 text-[10px] font-mono">
              <span className="flex items-center gap-1.5" title="采样步数：FLUX 推荐 4~28 步，SDXL 推荐 25~30 步">
                STEPS (采样步数)
                {greySteps && <FieldStatusBadge status="unsupported" />}
                {!greySteps && <SchemaSendBadge status={sendSteps} omitTitle={SCHEMA_OMIT_REASON} />}
              </span>
              <span className={`font-bold whitespace-nowrap shrink-0 ${omitSteps ? 'text-slate-500 line-through' : 'text-cyan-400'}`} title={omitSteps ? '该端点不支持，不发送' : undefined}>{greySteps ? '—' : `${params.steps} 步`}</span>
            </div>
            <input
              type="range"
              min={1}
              max={80}
              step={1}
              value={params.steps}
              disabled={greySteps}
              onChange={(e) => update({ steps: parseInt(e.target.value) })}
              className="w-full h-1.5 bg-[#252833] rounded appearance-none cursor-pointer accent-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </div>

          <div className="space-y-1">
            <div className="flex flex-wrap justify-between gap-x-2 gap-y-1 text-slate-400 text-[10px] font-mono">
              <span className="flex items-center gap-1.5" title="提示词引导系数：FLUX 推荐 3.5，SDXL 推荐 7.0~8.0">
                CFG SCALE (提示词引导系数)
                {greyCfg && <FieldStatusBadge status="unsupported" />}
                {!greyCfg && <SchemaSendBadge status={sendCfg} omitTitle={SCHEMA_OMIT_REASON} />}
              </span>
              <span className={`font-bold whitespace-nowrap shrink-0 ${omitCfg ? 'text-slate-500 line-through' : 'text-cyan-400'}`} title={omitCfg ? '该端点不支持，不发送' : undefined}>{greyCfg ? '—' : (params.cfg?.toFixed(1) ?? '未设置')}</span>
            </div>
            <input
              type="range"
              min={1.0}
              max={20.0}
              step={0.1}
              value={params.cfg}
              disabled={greyCfg}
              onChange={(e) => update({ cfg: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-[#252833] rounded appearance-none cursor-pointer accent-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </div>

          {/* Sampler & Scheduler Selection */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-slate-400 text-[10px] font-mono flex items-center gap-1.5">
                SAMPLER (采样算法)
                {greySampler && <FieldStatusBadge status="unsupported" />}
                {!greySampler && <SchemaSendBadge status={sendSampler} omitTitle={SCHEMA_OMIT_REASON} />}
              </label>
              <select
                value={params.sampler}
                disabled={greySampler}
                onChange={(e) => update({ sampler: e.target.value })}
                className="w-full bg-[#111216] border border-[#2b2d38] rounded-lg px-2 py-1.5 text-slate-200 text-[11px] font-mono outline-none disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {SAMPLER_OPTIONS.map((s, idx) => (
                  <option key={`sampler-${s.value}-${idx}`} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-slate-400 text-[10px] font-mono flex items-center gap-1.5">
                SCHEDULER (调度器)
                {greyScheduler && <FieldStatusBadge status="unsupported" />}
                {!greyScheduler && <SchemaSendBadge status={sendScheduler} omitTitle={SCHEMA_OMIT_REASON} />}
              </label>
              <select
                value={params.scheduler}
                disabled={greyScheduler}
                onChange={(e) => update({ scheduler: e.target.value })}
                className="w-full bg-[#111216] border border-[#2b2d38] rounded-lg px-2 py-1.5 text-slate-200 text-[11px] font-mono outline-none disabled:opacity-40 disabled:cursor-not-allowed"
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
            <div className="flex flex-wrap justify-between gap-x-2 gap-y-1 text-slate-400 text-[10px] font-mono">
              <span className="flex items-center gap-1.5" title="文生图固定为 1.0；图生图与重绘建议 0.35 ~ 0.65">
                DENOISE (重绘降噪幅度)
                {greyDenoise && <FieldStatusBadge status="unsupported" />}
                {!greyDenoise && <SchemaSendBadge status={sendDenoise} omitTitle={SCHEMA_OMIT_REASON} />}
              </span>
              <span className={`font-bold whitespace-nowrap shrink-0 ${sendDenoise === 'not_sent' || sendDenoise === 'no_image' ? 'text-slate-500 line-through' : 'text-cyan-400'}`}>{greyDenoise ? '—' : (params.denoise?.toFixed(2) ?? '未设置')}</span>
            </div>
            <input
              type="range"
              min={0.0}
              max={1.0}
              step={0.01}
              value={greyDenoise || sendDenoise === 'no_image' ? 0 : (params.denoise ?? 0)}
              disabled={greyDenoise || sendDenoise === 'no_image'}
              onChange={(e) => { if (greyDenoise || sendDenoise === 'no_image') return; update({ denoise: parseFloat(e.target.value) }); }}
              title={greyDenoise ? '该服务商不支持' : sendDenoise === 'no_image' ? '有参考图时才发送 strength（官方 Schema；WaveSpeed krea-v2 turbo-lora 等同）' : sendDenoise === 'not_sent' ? '该端点不支持，不发送' : undefined}
              aria-disabled={greyDenoise || sendDenoise === 'not_sent' || sendDenoise === 'no_image' || undefined}
              data-unsupported={sendDenoise === 'not_sent' || undefined}
              className={`w-full h-1.5 bg-[#252833] rounded appearance-none cursor-pointer accent-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed ${sendDenoise === 'not_sent' ? 'opacity-40 grayscale accent-slate-500' : ''}`}
            />
          </div>
        </div>

        {/* Section 3: LoRA Stack */}
        <div className="bg-[#1a1b22] border border-[#272933] rounded-xl p-3 space-y-2.5">
          <div className="flex items-center justify-between font-semibold text-slate-200 text-[11px]">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              LoRA 微调模型堆叠 ({params.loras.length})
              {greyLoras ? <FieldStatusBadge status="unsupported" /> : <SchemaSendBadge status={sendLoras} omitTitle={SCHEMA_OMIT_REASON} />}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={onOpenCivitai || onOpenModelHub}
                disabled={greyLoras}
                className="text-[10px] text-purple-400 hover:text-purple-300 flex items-center gap-1 bg-purple-950/40 px-2 py-0.5 rounded border border-purple-800/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title={greyLoras ? LORA_UNSUPPORTED_TITLE : '打开全生态 LoRA 模型中心 (Civitai / Hugging Face / 魔搭 / Fal / Tensor)'}
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
                const compat = validateLoraCompatibility(params.checkpoint, (lora as any).baseModel, lora.name, params.targetProvider);
                const loraUnsupported = greyLoras || Boolean(compat.endpointUnsupported);
                return (
                  <div key={idx} className={`bg-[#121318] p-2.5 rounded-lg border space-y-2 ${loraUnsupported ? 'border-slate-700/60 opacity-70' : 'border-[#282a35]'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`font-semibold max-w-[170px] break-normal ${loraUnsupported ? 'text-slate-500' : 'text-white'}`} title={lora.name}>
                          {middleEllipsis(lora.name)}
                        </span>
                        {loraUnsupported ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-600/50 shrink-0" title={LORA_UNSUPPORTED_TITLE}>
                            {LORA_UNSUPPORTED_TITLE}
                          </span>
                        ) : compat.verification === 'verified' ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 shrink-0">
                            兼容
                          </span>
                        ) : compat.verification === 'incompatible' ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-950/60 text-rose-400 border border-rose-800/40 shrink-0 flex items-center gap-0.5">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            不匹配
                          </span>
                        ) : null}
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

                  {/* Weight: never show mid-slider when strength unset (no silent 0.8) */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-mono text-slate-400">
                      <span>强度 (STRENGTH，必填)</span>
                      <span className={`font-bold ${parseExplicitLoraStrength(lora.modelStrength) == null ? 'text-amber-300' : 'text-purple-300'}`}>
                        {parseExplicitLoraStrength(lora.modelStrength) != null ? Number(lora.modelStrength).toFixed(2) : '未设置'}
                      </span>
                    </div>
                    {parseExplicitLoraStrength(lora.modelStrength) == null ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={-1.5}
                          max={2.0}
                          step={0.05}
                          value=""
                          placeholder="未设置"
                          disabled={loraUnsupported}
                          aria-label={`LoRA ${lora.name} 强度（未设置）`}
                          title={loraUnsupported ? LORA_UNSUPPORTED_TITLE : '生成前必须显式填写强度，禁止静默兜底 0.8'}
                          onChange={(e) => {
                            if (loraUnsupported) return;
                            const next = [...params.loras];
                            const parsed = parseExplicitLoraStrength(e.target.value);
                            next[idx].modelStrength = parsed;
                            next[idx].clipStrength = parsed;
                            update({ loras: next });
                          }}
                          className="w-full rounded border border-amber-700/60 bg-[#121318] px-2 py-1 text-amber-100 text-[11px] font-mono placeholder:text-amber-500/80 disabled:opacity-40"
                        />
                        <span className="text-[9px] text-amber-400 shrink-0">生成前必填</span>
                      </div>
                    ) : (
                      <input
                        type="range"
                        min={-1.5}
                        max={2.0}
                        step={0.05}
                        value={Number(lora.modelStrength)}
                        disabled={loraUnsupported}
                        title={loraUnsupported ? LORA_UNSUPPORTED_TITLE : undefined}
                        aria-label={`LoRA ${lora.name} 强度`}
                        onChange={(e) => {
                          if (loraUnsupported) return;
                          const next = [...params.loras];
                          next[idx].modelStrength = parseFloat(e.target.value);
                          next[idx].clipStrength = parseFloat(e.target.value);
                          update({ loras: next });
                        }}
                        className="w-full h-1 bg-[#252833] rounded appearance-none cursor-pointer accent-purple-400 disabled:opacity-40 disabled:cursor-not-allowed"
                      />
                    )}
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

        {isFalWan && <section className="bg-[#1a1b22] border border-[#272933] rounded-xl p-3 space-y-3">
          <h4 className="font-semibold text-slate-200">Wan 视频参数</h4>
          <p className="text-sm text-amber-200">此端点不接收秒数 duration。请按帧数与帧率设置；不会将秒数换算为帧数。</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm text-slate-400">帧数 num_frames
              <input aria-label="视频帧数" type="number" min={81} max={100} step={1} value={params.videoFrames ?? ''} placeholder="未填写" onChange={e => update({videoFrames: e.target.value === '' ? undefined : Number(e.target.value)})} className="mt-1 w-full rounded-lg border border-slate-700 bg-[#111216] p-2 text-slate-200" />
            </label>
            <label className="text-sm text-slate-400">帧率 frames_per_second
              <input aria-label="视频帧率" type="number" min={5} max={24} step={1} value={params.videoFps ?? ''} placeholder="未填写" onChange={e => update({videoFps: e.target.value === '' ? undefined : Number(e.target.value)})} className="mt-1 w-full rounded-lg border border-slate-700 bg-[#111216] p-2 text-slate-200" />
            </label>
          </div>
          {params.videoDuration !== undefined && <p className="text-sm text-amber-200">画布保留的时长 {params.videoDuration} 秒不适用于此端点。<button type="button" className="ml-2 text-cyan-300 underline" onClick={() => update({videoDuration: undefined})}>清除此时长</button></p>}
        </section>}

        {/* Section 4: Latent Geometry & Aspect Ratio */}
        <div className="bg-[#1a1b22] border border-[#272933] rounded-xl p-3 space-y-2.5">
          <span className="font-semibold text-slate-200 text-[11px] block">
            📐 潜空间画幅比例 (Latent Canvas Dimensions)
          </span>
          {omitWidthHeight && schemaDeclaresAspectRatio && (
            <p className="text-[11px] text-amber-200 flex flex-wrap items-center gap-1.5" data-testid="latent-ratio-schema-owned">
              <FieldStatusBadge status="not_sent" />
              本模型官方 Schema 只有 aspect_ratio、没有像素宽高：下方画幅预设与宽高不会发送；实际发送的是「官方 Schema 字段」里的 aspect_ratio。
            </p>
          )}

          <div className="grid grid-cols-5 gap-1.5">
            {aspectRatios.map((ar) => {
              const isActive = !greyWidthHeight && !omitWidthHeight && params.width === ar.w && params.height === ar.h;
              return (
                <button
                  key={ar.label}
                  disabled={greyWidthHeight}
                  onClick={() => handleAspectRatioPreset(ar.w, ar.h)}
                  title={omitWidthHeight ? '该端点不支持：本模型不接收像素宽高' : undefined}
                  className={`py-1.5 rounded-lg text-center transition-all disabled:opacity-40 disabled:cursor-not-allowed ${omitWidthHeight ? 'opacity-40 ' : ''}${
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
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-slate-400 text-[10px]">宽度 WIDTH (像素)</span>
                {greyWidthHeight && <FieldStatusBadge status="unsupported" />}
                {!greyWidthHeight && <SchemaSendBadge status={sendWidthHeight} omitTitle={SCHEMA_OMIT_REASON} />}
              </div>
              <input
                type="number"
                step={64}
                disabled={greyWidthHeight}
                value={greyWidthHeight ? '' : (params.width ?? '')}
                // clean-1333 #1: cleared field stays empty (undefined) — never silently becomes 1024.
                onChange={(e) => update({ width: e.target.value === '' || !Number.isFinite(parseInt(e.target.value)) ? undefined : parseInt(e.target.value) })}
                className="w-full min-w-0 box-border bg-[#111216] border border-[#2b2d38] rounded-lg px-2.5 py-1 text-slate-200 outline-none font-mono disabled:opacity-40 disabled:cursor-not-allowed"
              />
            </div>
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-slate-400 text-[10px]">高度 HEIGHT (像素)</span>
                {greyWidthHeight && <FieldStatusBadge status="unsupported" />}
                {!greyWidthHeight && <SchemaSendBadge status={sendWidthHeight} omitTitle={SCHEMA_OMIT_REASON} />}
              </div>
              <input
                type="number"
                step={64}
                disabled={greyWidthHeight}
                value={greyWidthHeight ? '' : (params.height ?? '')}
                onChange={(e) => update({ height: e.target.value === '' || !Number.isFinite(parseInt(e.target.value)) ? undefined : parseInt(e.target.value) })}
                className="w-full min-w-0 box-border bg-[#111216] border border-[#2b2d38] rounded-lg px-2.5 py-1 text-slate-200 outline-none font-mono disabled:opacity-40 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {params.targetProvider === 'nanogpt' && <div className="space-y-2 rounded-lg border border-cyan-800/40 bg-cyan-950/20 p-3">
            <label className="block text-sm text-slate-300">模型分辨率 resolution
              <input aria-label="NanoGPT resolution" type="text" value={params.resolution || ''} placeholder="留空使用上方像素宽高" onChange={e => update({resolution: e.target.value || undefined})} className="mt-1 w-full rounded-lg border border-slate-700 bg-[#111216] p-2 text-slate-200" />
            </label>
            <p className="text-sm text-slate-400">允许值由选定模型的实时能力决定，不通用。若同时保留宽高，resolution 必须与 {params.width}x{params.height} 一致，否则提交会报冲突。</p>
            {params.resolution && params.resolution !== `${params.width}x${params.height}` && <p role="alert" className="text-sm text-amber-200">尺寸冲突：resolution 与当前像素宽高不同。请清空 resolution，或修改为一致的值。</p>}
          </div>}

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

          {isOpenAiCompat && (
            <div className="grid grid-cols-2 gap-2">
              {schemaSelect('size', params.size || '', (v) => update({ size: v || undefined }), 'SIZE')}
              {schemaSelect('quality', params.quality || '', (v) => update({ quality: v || undefined }), 'QUALITY')}
              {schemaSelect('output_format', params.outputFormat || '', (v) => update({ outputFormat: v || undefined }), 'OUTPUT_FORMAT')}
              {schemaSelect('background', params.background || '', (v) => update({ background: v || undefined }), 'BACKGROUND')}
              {schemaSelect('moderation', params.moderation || '', (v) => update({ moderation: v || undefined }), 'MODERATION')}
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-1.5">
                  <label className="text-slate-400 text-[10px] font-mono">N（生成张数）</label>
                  {greyNumImages && <FieldStatusBadge status="unsupported" />}
                </div>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={greyNumImages ? '' : (params.batchSize ?? 1)}
                  disabled={greyNumImages}
                  title={greyNumImages ? '该服务商不支持' : undefined}
                  placeholder={greyNumImages ? '该服务商不支持' : undefined}
                  onChange={(e) => {
                    if (greyNumImages) return;
                    update({ batchSize: Math.max(1, Math.min(10, parseInt(e.target.value) || 1)) });
                  }}
                  className="w-full bg-[#111216] border border-[#2b2d38] rounded-lg px-2 py-1.5 text-slate-200 text-[11px] font-mono outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          )}

          {schemaProvider === 'huggingface' && schemaModel && getFieldSpec('huggingface', schemaModel, 'shift') && (
            <div className="grid grid-cols-2 gap-2">
              {schemaSelect('resolution', params.resolution || '', (v) => update({ resolution: v || undefined }), 'RESOLUTION')}
              <div className="space-y-1">
                <label className="text-slate-400 text-[10px] font-mono">SHIFT（时间偏移）</label>
                <input type="number" min={1} max={10} step={0.1} value={params.shift ?? ''}
                  placeholder="必填；官方默认 3.0"
                  onChange={(e) => update({shift: e.target.value === '' ? undefined : Number(e.target.value)})}
                  className="w-full bg-[#111216] border border-[#2b2d38] rounded-lg px-2 py-1.5 text-slate-200 text-[11px] font-mono outline-none" />
              </div>
            </div>
          )}

          {schemaProvider === 'huggingface' && schemaModel && getFieldSpec('huggingface', schemaModel, 'shift') && (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm text-slate-400">种子策略
                <select value={typeof params.randomSeed === 'boolean' ? String(params.randomSeed) : ''} onChange={e => update({randomSeed: e.target.value === '' ? undefined : e.target.value === 'true'})} className="w-full mt-1 bg-[#111216] border border-slate-700 rounded-lg p-2 text-slate-200">
                  <option value="">请选择</option><option value="false">使用画布种子</option><option value="true">由 Space 随机选择</option>
                </select>
              </label>
              <label className="text-sm text-slate-400">结果集
                <select value={Array.isArray(params.galleryImages) ? 'new' : ''} onChange={e => update({galleryImages: e.target.value ? [] : undefined})} className="w-full mt-1 bg-[#111216] border border-slate-700 rounded-lg p-2 text-slate-200">
                  <option value="">请选择</option><option value="new">新建本次结果集</option>
                </select>
              </label>
            </div>
          )}

          {isGrokCompat && (
            <div className="grid grid-cols-2 gap-2">
              {schemaSelect('aspect_ratio', params.aspectRatio || '', (v) => update({ aspectRatio: v || undefined }), 'ASPECT_RATIO')}
              {schemaSelect('resolution', params.resolution || '', (v) => update({ resolution: v || undefined }), 'RESOLUTION')}
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-1.5">
                  <label className="text-slate-400 text-[10px] font-mono">N（生成张数）</label>
                  {greyNumImages && <FieldStatusBadge status="unsupported" />}
                </div>
                <input
                  type="number"
                  min={1}
                  max={4}
                  value={greyNumImages ? '' : (params.batchSize ?? 1)}
                  disabled={greyNumImages}
                  title={greyNumImages ? '该服务商不支持' : undefined}
                  placeholder={greyNumImages ? '该服务商不支持' : undefined}
                  onChange={(e) => {
                    if (greyNumImages) return;
                    update({ batchSize: Math.max(1, Math.min(4, parseInt(e.target.value) || 1)) });
                  }}
                  className="w-full bg-[#111216] border border-[#2b2d38] rounded-lg px-2 py-1.5 text-slate-200 text-[11px] font-mono outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
