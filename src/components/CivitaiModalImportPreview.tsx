import React, { useState } from 'react';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Info,
  Check,
  Cpu,
  Layers,
  ArrowRight,
  ExternalLink,
  Lock,
  Unlock,
  RotateCcw,
} from 'lucide-react';
import {
  ProviderAdaptationResult,
  FieldAdaptationDetail,
  ProviderLoraAdaptation,
} from '../utils/civitaiImportMap';
import { ProviderModelSelect } from './ProviderModelSelect';
import { ensureModelSchema, getModelSchemaEntry, subscribeModelSchema } from '../services/modelSchemaCache';

export interface CivitaiModalImportPreviewProps {
  adaptation: ProviderAdaptationResult;
  allAdaptations?: Record<string, ProviderAdaptationResult>;
  selectedProvider: string;
  onSelectProvider: (provider: string) => void;
  targetModel?: string;
  onSelectTargetModel?: (model: string) => void;
  tokenConsent: boolean;
  onToggleTokenConsent: (consent: boolean) => void;
  preset?: any;
  onApplyPreset?: (preset: any) => void;
  onSelectLoRA?: (lora: any) => void;
  onAddLoRANodeToCanvas?: (lora: any) => void;
  onFillCurrentLoRANode?: (lora: any) => void;
}

const FIELD_LABELS: Record<string, string> = {
  checkpoint: '底模 / 模型 (Checkpoint)',
  prompt: '正向提示词 (Positive Prompt)',
  negativePrompt: '负向提示词 (Negative Prompt)',
  steps: '采样步数 (Steps)',
  cfg: 'CFG / 引导系数 (Guidance)',
  sampler: '采样算法 (Sampler)',
  scheduler: '调度器 (Scheduler)',
  clipSkip: 'CLIP 跳过层数 (Clip Skip)',
  size: '画幅尺寸 (Width x Height)',
  seed: '随机种子 (Seed)',
  denoise: '去噪强度 (Denoise)',
  clipStrength: '独立 CLIP 强度 (strength_clip)',
};

export const CivitaiModalImportPreview: React.FC<CivitaiModalImportPreviewProps> = ({
  adaptation,
  allAdaptations,
  selectedProvider,
  onSelectProvider,
  targetModel,
  onSelectTargetModel,
  tokenConsent,
  onToggleTokenConsent,
  preset,
  onApplyPreset,
  onSelectLoRA,
  onAddLoRANodeToCanvas,
  onFillCurrentLoRANode,
}) => {
  const [showAllFields, setShowAllFields] = useState(true);
  const [, setSchemaTick] = useState(0);

  React.useEffect(() => {
    return subscribeModelSchema(() => setSchemaTick((t) => t + 1));
  }, []);

  React.useEffect(() => {
    if (selectedProvider && targetModel && selectedProvider !== 'civitai') {
      ensureModelSchema(selectedProvider, targetModel);
    }
  }, [selectedProvider, targetModel]);

  const schemaEntry = getModelSchemaEntry(selectedProvider, targetModel);

  const availableProviders = [
    { id: 'civitai', name: 'Civitai 原生' },
    { id: 'fal', name: 'Fal.ai' },
    { id: 'replicate', name: 'Replicate' },
    { id: 'wavespeed', name: 'WaveSpeed' },
    { id: 'aimlapi', name: 'AIMLAPI' },
    { id: 'novita', name: 'Novita AI' },
    { id: 'runware', name: 'Runware' },
    { id: 'krea', name: 'Krea' },
    { id: 'modelslab', name: 'ModelsLab' },
    { id: 'modelscope', name: '魔搭 CN' },
    { id: 'modelscope_ai', name: '魔搭 AI' },
    { id: 'huggingface', name: 'Hugging Face' },
    { id: 'sogni', name: 'Sogni' },
    { id: 'muapi', name: 'MuAPI' },
    { id: 'tensorart', name: 'Tensor.Art' },
    { id: 'nanogpt', name: 'NanoGPT' },
    { id: 'video', name: 'AI Video' },
  ];

  const hasRequiresConsentLora = adaptation.loras.some(
    (l) => l.requiresAuthConsent || l.status === 'requires_consent'
  );

  return (
    <div className="space-y-4 text-xs font-sans animate-in fade-in duration-150" data-testid="civitai-import-preview">
      {/* 1. Target Provider Selector */}
      <div className="bg-[#13141b] border border-[#262837] rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span>选择适配目标供应商 (Target Provider Adaptation):</span>
          </label>
          <span className="text-[11px] font-mono text-cyan-400 font-semibold">
            {adaptation.displayName}
          </span>
        </div>
        <p className="text-[11px] text-slate-400">
          每个供应商支持的底模格式、LoRA 输入规范与生图参数不同；切换目标供应商可实时查看逐字段适配结果与兼容性分析：
        </p>

        <div className="flex flex-wrap gap-1.5 pt-1" data-testid="import-provider-selector">
          {availableProviders.map((p) => {
            const isSelected = selectedProvider === p.id;
            const targetAdapt = allAdaptations?.[p.id];
            const isTargetCompat = targetAdapt ? targetAdapt.isCompatible : true;

            return (
              <button
                key={p.id}
                type="button"
                data-testid={`import-provider-pill-${p.id}`}
                onClick={() => onSelectProvider(p.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1.5 border ${
                  isSelected
                    ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/80 shadow-sm ring-1 ring-cyan-400/50'
                    : 'bg-[#1a1b26] text-slate-400 hover:text-slate-200 border-[#2a2d3e]'
                }`}
              >
                <span>{p.name}</span>
                {targetAdapt && !isTargetCompat && (
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" title="存在架构或参数不兼容项" />
                )}
              </button>
            );
          })}
        </div>

        {selectedProvider !== 'civitai' && (
          <div className="pt-2 border-t border-[#262837] space-y-1.5" data-testid="import-model-selector-container">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-slate-300">
                🎯 目标模型 / 端点 (Target Model / Endpoint):
              </span>
              <span className="font-mono text-cyan-400">
                {targetModel ? `已绑定: ${targetModel}` : '待选择'}
              </span>
            </div>
            <ProviderModelSelect
              provider={selectedProvider}
              value={targetModel || ''}
              onChange={(m) => {
                onSelectTargetModel?.(m);
                ensureModelSchema(selectedProvider, m);
              }}
            />
            {schemaEntry?.status === 'ready' && (
              <p className="text-[10px] text-emerald-400 font-mono" data-testid="schema-ready-note">
                ✔ 实时 Schema 已就绪（包含 {schemaEntry.properties?.length || 0} 个官方参数定义，LoRA 与生图契约直接由该 Schema 约束）
              </p>
            )}
            {schemaEntry?.status === 'loading' && (
              <p className="text-[10px] text-amber-400 font-mono" data-testid="schema-loading-note">
                ⏳ 正在读取目标模型官方 Schema...
              </p>
            )}
            {schemaEntry?.status === 'error' && (
              <p className="text-[10px] text-rose-400 font-mono" data-testid="schema-error-note">
                ⚠ 目标端点 Schema 获取失败；未核实: {schemaEntry.error || '获取失败'}
              </p>
            )}
            {!targetModel && (
              <p className="text-[10px] text-amber-300 font-mono">
                提示：尚未选择具体模型端点；当前 LoRA 状态标为未核实 (unverified)，选定模型后将根据真实 Schema 动态适配。
              </p>
            )}
          </div>
        )}
      </div>

      {/* 2. Architecture & Compatibility Banner */}
      <div
        className={`border rounded-xl p-3.5 space-y-2 ${
          adaptation.isCompatible
            ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200'
            : 'bg-rose-950/20 border-rose-800/40 text-rose-200'
        }`}
        data-testid="import-architecture-banner"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {adaptation.isCompatible ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span className="font-bold text-xs">
              底模架构与 LoRA 适配状态:
              <span className="ml-1.5 font-mono px-2 py-0.5 rounded text-[10px] bg-black/40 border border-white/10">
                来源架构: {adaptation.baseModelArchitecture || '未知/通用'}
              </span>
            </span>
          </div>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
              adaptation.isCompatible
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
            }`}
          >
            {adaptation.isCompatible ? '架构兼容' : adaptation.baseModelArchitecture === 'unknown' || !adaptation.baseModelArchitecture ? '架构未知，无法确认兼容' : '存在不兼容项'}
          </span>
        </div>

        <p className="text-[11px] leading-relaxed text-slate-300">
          {adaptation.baseModelMessage}
        </p>

        {adaptation.warnings.length > 0 && (
          <div className="pt-1 space-y-1">
            {adaptation.warnings.map((w, idx) => (
              <div key={idx} className="flex items-start gap-1.5 text-[10px] text-amber-300/90 font-mono">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. LoRAs Adaptation Cards */}
      {adaptation.loras.length > 0 && (
        <div className="bg-[#14151e] border border-[#292c3d] rounded-xl p-3.5 space-y-2.5" data-testid="import-loras-section">
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs text-white flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-purple-400" />
              <span>提取的 LoRA 列表与目标供应商映射 ({adaptation.loras.length} 个)</span>
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              无静默替换 · 格式与权限公开透明
            </span>
          </div>

          <div className="space-y-2">
            {adaptation.loras.map((lora, idx) => {
              const isUnverified = lora.status === 'unverified';
              const isCompatible = lora.status === 'compatible';
              const isConsent = lora.status === 'requires_consent';
              const isMismatch = lora.status === 'architecture_mismatch';
              const isReselect = lora.status === 'requires_reselection';

              return (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                    isUnverified
                      ? 'bg-amber-950/10 border-amber-800/30'
                      : isCompatible
                      ? 'bg-[#191a26] border-purple-900/40'
                      : isConsent
                      ? 'bg-amber-950/20 border-amber-800/40'
                      : isMismatch
                      ? 'bg-rose-950/20 border-rose-800/40'
                      : isReselect
                      ? 'bg-blue-950/20 border-blue-800/40'
                      : 'bg-[#1b1c28] border-slate-700/40'
                  }`}
                  data-testid={`import-lora-card-${idx}`}
                >
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white text-xs truncate max-w-xs" title={lora.name}>
                        {lora.name}
                      </span>
                      {lora.baseModel && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-black/60 text-purple-300 font-mono border border-purple-500/20">
                          {lora.baseModel}
                        </span>
                      )}
                      {lora.originalStrength !== undefined && lora.originalStrength !== null && (
                        <span className="text-[10px] font-mono text-amber-400">
                          权重: {lora.originalStrength}
                        </span>
                      )}
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono ${
                          lora.unresolvedReason
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : lora.canGenerate === false && selectedProvider === 'civitai'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : isUnverified
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : isCompatible
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : isConsent
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : isMismatch
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : isReselect
                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            : 'bg-slate-500/20 text-slate-300 border border-slate-500/30'
                        }`}
                        data-testid={`import-lora-status-${idx}`}
                      >
                        {lora.unresolvedReason
                          ? '解析失败 / 未核实'
                          : lora.canGenerate === false && selectedProvider === 'civitai'
                          ? 'Civitai 未启用在线生成'
                          : isUnverified
                          ? '未核实'
                          : isCompatible
                          ? '可直接发送'
                          : isConsent
                          ? '需授权鉴权凭据'
                          : isMismatch
                          ? '架构不匹配'
                          : lora.inferredFromPrompt
                          ? '从提示词推断，未核实'
                          : lora.originalStrength === null || lora.originalStrength === undefined
                          ? '需设置强度'
                          : isReselect
                          ? '需在目标库选用'
                          : '无法发送'}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-300 font-mono leading-relaxed" data-testid={`import-lora-reason-${idx}`}>
                      {lora.reason || lora.unresolvedReason}
                    </p>

                    {lora.sendableUrlOrId && (
                      <div className="text-[10px] text-slate-400 font-mono truncate" title={lora.sendableUrlOrId}>
                        目标标识/URL: <span className="text-cyan-300">{lora.sendableUrlOrId}</span>
                      </div>
                    )}
                  </div>

                  {/* Individual LoRA Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {onSelectLoRA && (
                      <button
                        type="button"
                        onClick={() =>
                          onSelectLoRA({
                            name: lora.sendableUrlOrId || lora.name,
                            provider: selectedProvider,
                            civitaiId: lora.civitaiId,
                            triggerWords: '',
                            baseModel: lora.baseModel,
                            modelStrength: lora.originalStrength ?? undefined,
                            clipStrength: lora.originalClipStrength ?? undefined,
                          })
                        }
                        className="px-2.5 py-1 rounded bg-[#252838] hover:bg-[#2e3146] text-purple-300 text-[10px] font-semibold border border-[#373a50] transition-colors"
                      >
                        选用此 LoRA
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Token Consent Banner for Auth-Required LoRAs (Task 4) */}
      {hasRequiresConsentLora && (
        <div
          className="bg-amber-950/30 border border-amber-700/60 rounded-xl p-3.5 space-y-2.5 animate-in fade-in"
          data-testid="civitai-token-consent-banner"
        >
          <div className="flex items-center gap-2 text-amber-300">
            <Lock className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-bold text-xs">
              私有/需鉴权 LoRA 凭据安全确认 (Token Consent Protection):
            </span>
          </div>

          <p className="text-[11px] text-amber-100/90 leading-relaxed font-mono">
            检测到所导入的 Civitai LoRA 属于需登录下载资源 (requireAuth=true)。根据系统最高安全规范，<strong>绝不在未经用户显式 UI 授权时向第三方供应商（如 {adaptation.displayName}）发送含有您 Civitai Token 的下载 URL</strong>，以防止个人凭据在第三方服务器日志或代理缓存中泄露。
          </p>

          <label className="flex items-center gap-2.5 cursor-pointer pt-1 bg-black/40 p-2.5 rounded-lg border border-amber-600/30">
            <input
              type="checkbox"
              checked={tokenConsent}
              onChange={(e) => onToggleTokenConsent(e.target.checked)}
              data-testid="civitai-token-consent-checkbox"
              className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 border-amber-700 bg-[#12131a] cursor-pointer"
            />
            <span className="text-[11px] text-amber-200 font-semibold select-none flex items-center gap-1.5">
              {tokenConsent ? <Unlock className="w-3.5 h-3.5 text-emerald-400" /> : <Lock className="w-3.5 h-3.5 text-amber-400" />}
              <span>我已知晓安全风险，明确授权向 {adaptation.displayName} 发送带有 Civitai 登录 Token 的下载直链</span>
            </span>
          </label>
        </div>
      )}

      {/* 5. Per-field Outcome Table */}
      <div className="bg-[#14151e] border border-[#282a3b] rounded-xl overflow-hidden" data-testid="import-fields-table">
        <div className="px-4 py-2.5 bg-[#1b1c28] border-b border-[#282a3b] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-xs text-white">逐字段官方接口适配明细 (Per-field Adaptation Outcome)</span>
            <span className="text-[10px] text-slate-400 font-mono">
              透明展示每个字段是否发送、字段名与依据
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowAllFields(!showAllFields)}
            className="text-[11px] text-cyan-400 font-mono hover:underline"
          >
            {showAllFields ? '收起 ▲' : '展开 ▼'}
          </button>
        </div>

        {showAllFields && (
          <div className="divide-y divide-[#222432] max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
            {Object.entries(adaptation.fields).map(([fieldName, detail]) => {
              const label = FIELD_LABELS[fieldName] || fieldName;
              const isMapped = detail.status === 'mapped';
              const isUnsupported = detail.status === 'unsupported';
              const isManual = detail.status === 'manual_selection';
              const isNotApplicable = detail.status === 'not_applicable';

              return (
                <div key={fieldName} className="p-3 hover:bg-[#181924] transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
                  <div className="w-48 shrink-0">
                    <span className="font-semibold text-slate-200 block">{label}</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      原值: {detail.originalValue != null && detail.originalValue !== '' ? String(JSON.stringify(detail.originalValue)).slice(0, 32) : '未提供'}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-[11px] text-slate-300 font-mono leading-relaxed">
                      {detail.humanMessage}
                    </p>
                    {detail.targetField && (
                      <span className="text-[10px] text-cyan-400/90 font-mono block">
                        目标字段: <strong>{detail.targetField}</strong>
                      </span>
                    )}
                    {detail.source && (
                      <span className="text-[9px] text-slate-500 font-mono block truncate" title={detail.source}>
                        依据: {detail.source}
                      </span>
                    )}
                  </div>

                  <div className="shrink-0">
                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded font-mono ${
                        isMapped
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : isUnsupported
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : isManual
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {isMapped ? '✔ 将发送' : isUnsupported ? '✖ 不支持(已拦截)' : isManual ? '⚡ 需重选' : '— 不适用'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 6. Action Controls */}
      <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-[#232535]">
        <div className="text-[11px] text-slate-400 font-mono">
          <span>当前选择引擎：</span>
          <span className="text-cyan-400 font-bold">{adaptation.displayName}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {preset && onApplyPreset && (
            <button
              type="button"
              data-testid="apply-imported-workflow-button"
              onClick={() => onApplyPreset(preset)}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-purple-600/30 active:scale-95 transition-all"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>以此配置一键生成工作流并载入画布</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
