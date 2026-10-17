import { ensureModelSchema } from '../services/modelSchemaCache';
import {PreviewPlaceholder} from './PreviewPlaceholder';
import {videoDurationBounds, videoSchemaField, videoSchemaValueIssue} from '../utils/frontendParameters';
import {ProviderModelSelect} from './ProviderModelSelect';
import {noteUserModelSelection} from '../services/userModelSelection';
import React from 'react';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Trash2,
  Dices,
  Download,
  Maximize2,
  Sparkles,
  Search,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Brain,
  Copy,
  Check,
  Edit3,
  Upload,
} from 'lucide-react';
import { DataType, NodeInstance, Socket, SOCKET_COLORS } from '../types/graph';
import { NODE_DEFINITIONS } from '../constants/nodes';
import { refinePromptWithGemini, getStoredApiKeys, getRefineModelSelection, uploadMedia } from '../services/api';
import { validateLoraCompatibility } from '../utils/baseModelMatcher';
import { EngineRegistry } from '../engines/EngineRegistry';
import { GeminiFieldSelect, GeminiModelBadge } from './GeminiFieldSelect';
import { fieldOptions, getFieldSpec, resolveSchemaModelId } from '../schemas/providerSchema';
import { FieldStatusBadge, SchemaSendBadge } from './FieldStatusBadge';
import { isCanvasFieldUnsupported, isCanvasWidgetUnsupported, LORA_UNSUPPORTED_TITLE, LORA_BYPASS_LABEL } from '../utils/resolveCheckpoint';
import { readDeclaredSchemaProperties, SCHEMA_OMIT_REASON, canvasFieldMatchesSchema } from '../utils/schemaSendHint';
import { schemaSendStatus } from '../utils/schemaSendStatus';
/** KSampler / related widgets: Schema-omit → hide entirely (雁: no 「不支持」 complaint on the node). */
const SAMPLER_SCHEMA_WIDGETS = new Set(['steps', 'cfg', 'sampler_name', 'scheduler', 'sampler', 'seed', 'denoise', 'control_after_generate']);
const filledCanvasValue = (v: unknown) =>
  v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '') && !(typeof v === 'number' && Number.isNaN(v));

import { checkpointNodeTitle, ksamplerNodeTitle, loraLoaderNodeTitle, LORA_LOADER_TYPES } from '../utils/providerLabels';
import { errorBannerText, priorRunErrorLabel, LOCAL_BLOCK_NODE_LINE } from '../utils/apiFailure';
import { upstreamFailedLine } from '../utils/schemaFailure';
import { formatRecordTime } from '../services/executionTrace';
import { loraSourceMismatch } from '../utils/loraSourceMismatch';
import { EmphasizeLimit } from './TextEmphasis';
import { CustomModelIdField } from './CustomModelIdField';
import { providerSendsSeparateClipStrength, CLIP_STRENGTH_NOT_SENT_NOTE } from '../utils/loraClipStrength';

/** fix16.1 #3: render text with <wbr> after '/' and '-' — break points without inserting invisible characters. */
export const BreakAfterSlashDash: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split(/(?<=[/\-])/);
  return <>{parts.map((p, i) => <React.Fragment key={i}>{p}{i < parts.length - 1 ? <wbr /> : null}</React.Fragment>)}</>;
};


interface NodeItemProps {
  node: NodeInstance;
  isSelected: boolean;
  zoom: number;
  onSelect: (e: React.MouseEvent) => void;
  onStartDrag: (e: React.MouseEvent, nodeId: string) => void;
  onUpdateValue: (nodeId: string, widgetName: string, value: any) => void;
  onDeleteNode: (nodeId: string) => void;
  onToggleCollapse: (nodeId: string) => void;
  onToggleBypass: (nodeId: string) => void;
  onStartConnecting: (nodeId: string, socketId: string, isOutput: boolean, type: DataType, e: React.MouseEvent) => void;
  onEndConnecting: (nodeId: string, socketId: string, isOutput: boolean, type: DataType) => void;
  onOpenCivitaiPicker?: (nodeId: string) => void;
  onImageClick?: (url: string) => void;
  currentCheckpoint?: string;
  currentProvider?: string;
  /** custom_parameters of the connected engine/Checkpoint node (holds _canvas.schemaProperties). */
  schemaCustomParameters?: string;
  /** Rendered height (incl. warnings) so the canvas can keep nodes below from being covered. */
  /** clean-1005: same wording as the top-bar / panel 底模连线断开 (one source). */
  modelChainBreakMessage?: string;
  onMeasuredHeight?: (nodeId: string, height: number) => void;
  onAutoFixCheckpoint?: (recommendedCheckpoint: string) => void;
  onOpenModelHub?: (category?: 'all' | 'checkpoint' | 'lora' | 'video' | 'edit') => void;
  /** LoRA nodes on this Checkpoint's MODEL chain (run order), for Schema LoRA-slot badges. */
  canvasLoras?: Array<{ name: string }>;
}

export const NodeItem: React.FC<NodeItemProps> = ({
  node,
  isSelected,
  zoom,
  onSelect,
  onStartDrag,
  onUpdateValue,
  onDeleteNode,
  onToggleCollapse,
  onToggleBypass,
  onStartConnecting,
  onEndConnecting,
  onOpenCivitaiPicker,
  onImageClick,
  currentCheckpoint,
  currentProvider,
  schemaCustomParameters,
  modelChainBreakMessage,
  onMeasuredHeight,
  onAutoFixCheckpoint,
  onOpenModelHub,
  canvasLoras,
}) => {
  // Callback ref (no extra hook): report rendered height incl. warnings so nodes below get pushed, not covered.
  const measureRef = (el: HTMLDivElement | null) => {
    const anyEl = el as (HTMLDivElement & { __heightRO?: ResizeObserver }) | null;
    if (!anyEl || !onMeasuredHeight || typeof ResizeObserver === 'undefined' || anyEl.__heightRO) return;
    let last = -1;
    anyEl.__heightRO = new ResizeObserver(() => {
      const h = anyEl.offsetHeight;
      if (h > last) onMeasuredHeight(node.id, h);
      last = h;
    });
    anyEl.__heightRO.observe(anyEl);
  };

  const uploadInput = React.useRef<HTMLInputElement>(null);
  const [showUnsupported, setShowUnsupported] = React.useState(false);
  const greySeed = isCanvasFieldUnsupported(currentProvider, currentCheckpoint, 'seed');
  const greyNegative = isCanvasFieldUnsupported(currentProvider, currentCheckpoint, 'negative_prompt');
  const greyWidth = isCanvasFieldUnsupported(currentProvider, currentCheckpoint, 'width');
  const greyHeight = isCanvasFieldUnsupported(currentProvider, currentCheckpoint, 'height');
  const greyWidthHeight = greyWidth || greyHeight;

  const [isRefining, setIsRefining] = React.useState(false);
  const [isReasoning, setIsReasoning] = React.useState(false);
  const [reasoningError, setReasoningError] = React.useState<string | null>(null);
  const [copiedRefined, setCopiedRefined] = React.useState(false);

  const [showThinkingChain, setShowThinkingChain] = React.useState(true);

  const handleRunReasoning = async () => {
    const rawPrompt = (node.values.prompt || node.values.input_text || '').trim();
    if (!rawPrompt) return;
    setIsReasoning(true);
    setReasoningError(null);
    try {
      const provider = node.values.provider;
      const model = node.values.model;
      if (!provider) throw new Error('请明确选择推理供应商');
      if (!model?.trim()) throw new Error('模型为必填项（model is required）');
      const taskType = node.values.task_type || 'cinematic_photoreal';

      let taskPrompt = 'Expand into a rich, detailed photorealistic prompt with lighting, 8k resolution, camera details.';
      if (taskType === 'anime_aesthetic') {
        taskPrompt = 'Expand into a stunning Japanese anime art prompt (Makoto Shinkai / Ghibli aesthetic) with vibrant lighting and painterly sky.';
      } else if (taskType === 'commercial_product') {
        taskPrompt = 'Expand into an immaculate commercial studio product photography prompt with softbox lighting, clean backdrop, and sharp micro textures.';
      } else if (taskType === 'dark_fantasy') {
        taskPrompt = 'Expand into an epic dark fantasy concept art prompt (Unreal Engine 5) with dramatic lighting, ancient gothic architecture, and mist.';
      }

      const storedKeys = getStoredApiKeys() as unknown as Record<string, string>;
      const chatResult = await EngineRegistry.chat(
        provider,
        {
          messages: [
            {
              role: 'system',
              content: `You are an elite prompt engineer and AI visual director. ${taskPrompt} Output ONLY the final expanded prompt in English, with no meta preamble.`,
            },
            { role: 'user', content: rawPrompt },
          ],
          model,
          temperature: 0.6,
        },
        storedKeys
      );

      onUpdateValue(node.id, 'refined_output', chatResult.content);
      if (chatResult.reasoningContent) {
        onUpdateValue(node.id, 'reasoning_output', chatResult.reasoningContent);
      }
    } catch (err: any) {
      setReasoningError(err.message || '推理大模型执行失败');
    } finally {
      setIsReasoning(false);
    }
  };
  const def = NODE_DEFINITIONS[node.type] || {
    title: node.title,
    category: 'utils',
    colorTag: '#3b82f6',
    widgets: [],
    inputs: node.inputs,
    outputs: node.outputs,
  };

  const isBypassed = Boolean(node.bypassed);
  const isCollapsed = Boolean(node.collapsed);
  const categoryColor = def.colorTag || '#3b82f6';
  // trace-fix2 #9: LoRA provenance ≠ running provider → warning colour on the note, the node border and the header.
  const loraMismatchNote = LORA_LOADER_TYPES.has(node.type) && node.values?.lora_name
    ? loraSourceMismatch(node.values.resource_source, currentProvider || node.values?.targetProvider, node.values.base_model)
    : null;
  // trace-fix2 #9/#17: at small zoom, node alerts are repeated in a counter-scaled strip above the node (screen-size text).
  // fix3 L: tip only when canvas scale is strictly below 75% (0.75). If a percentage (e.g. 79) is passed by mistake, normalize.
  const zoomScale = typeof zoom === 'number' && zoom > 1.5 ? zoom / 100 : zoom;
  const zoomedOut = typeof zoomScale === 'number' && zoomScale > 0 && zoomScale < 0.75;
  const zoomAlerts: Array<{ tone: 'rose' | 'amber'; text: string }> = [];
  // Schema failure: line 1 = plain headline (full model name), rest = upstream body verbatim. Others keep 上一次 label.
  const schemaErr = node.errorKind === 'schema' && !!node.errorMessage;
  const nodeErrorHeadline = schemaErr ? String(node.errorMessage).split('\n')[0] : priorRunErrorLabel(node.errorMessage, node.errorAt);
  const nodeErrorRaw = schemaErr ? String(node.errorMessage).split('\n').slice(1).join('\n') : '';
  if (zoomedOut) {
    if (node.localBlockReason && node.state !== 'running') zoomAlerts.push({ tone: 'rose', text: `⛔ ${node.localBlockTitle || '本地拦截'}：${node.localBlockReason}` });
    if (loraMismatchNote) zoomAlerts.push({ tone: 'amber', text: `⚠ LoRA 来源 ${String(node.values.resource_source)} ≠ 当前 ${String(currentProvider || node.values?.targetProvider)}` });
    const notSent = (def.widgets || []).filter((w: any) => w.type === 'number' || w.type === 'select' || w.type === 'text' || w.type === 'textarea').filter((w: any) => {
      const isWH = w.name === 'width' || w.name === 'height';
      if ((isWH && greyWidthHeight) || isCanvasWidgetUnsupported(currentProvider, currentCheckpoint, w.name)) return true;
      if (!['KSampler', 'EmptyLatentImage'].includes(node.type)) return false;
      return schemaSendStatus(currentProvider, w.name, node.values?.[w.name], node.values?.custom_parameters, readDeclaredSchemaProperties(schemaCustomParameters), schemaCustomParameters) === 'not_sent';
    }).map((w: any) => w.label || w.name);
    // cleanup-2026-10-17 #1: no 「未发送」 sticky on nodes; send/omit truth lives in inspector + history details.
    void notSent;
  }

  const handleRefinePrompt = async () => {
    const currentPrompt = node.values.text || '';
    if (!currentPrompt) return;
    const selection = getRefineModelSelection();
    const provider = node.values.refineProvider || node.values.provider || selection.provider;
    const model = node.values.refineModel || node.values.model || selection.model;
    if (!provider || !model) {
      alert('请先选择润色模型');
      return;
    }
    setIsRefining(true);
    try {
      const refined = await refinePromptWithGemini(currentPrompt, {
        provider,
        model,
      });
      if (refined) {
        onUpdateValue(node.id, 'text', refined);
      }
    } catch (e: any) {
      alert(e.message || '润色失败');
      console.error(e);
    } finally {
      setIsRefining(false);
    }
  };

  const handleRandomSeed = () => {
    const newSeed = Math.floor(Math.random() * 1000000000);
    onUpdateValue(node.id, 'seed', newSeed);
  };

  return (
    <div
      id={`node-${node.id}`}
      ref={measureRef}
      style={{
        transform: `translate(${node.pos.x}px, ${node.pos.y}px)`,
        width: node.width || 300,
      }}
      onClick={onSelect}
      className={`canvas-node absolute rounded-xl border transition-shadow text-xs overflow-visible ${
        isBypassed ? 'opacity-50 grayscale' : 'opacity-100'
      } ${
        isSelected
          ? 'ring-2 ring-cyan-400 shadow-2xl shadow-cyan-500/20'
          : 'shadow-xl shadow-black/50'
      } ${
        node.state === 'running'
          ? 'border-amber-400 ring-2 ring-amber-400/50 animate-pulse'
          : (node.state === 'error' || node.localBlockReason)
          ? 'border-rose-500 shadow-[0_0_0_2px_rgba(244,63,94,0.45)]'
          : loraMismatchNote
          ? 'border-amber-400 border-2 shadow-[0_0_0_3px_rgba(251,191,36,0.45)]'
          : 'border-[#2c2f38]'
      } bg-[#191a20]/95 backdrop-blur-md`}
    >
      {zoomAlerts.length > 0 && (
        <div data-testid="node-zoom-alerts" className="absolute left-0 bottom-full mb-1 pointer-events-none flex flex-col gap-0.5 z-30"
          style={{ transform: `scale(${1 / (zoomScale || 1)})`, transformOrigin: 'bottom left', width: (node.width || 300) * (zoomScale || 1), zIndex: 30 }}>
          {zoomAlerts.map((a, i) => (
            <div key={i} className={`rounded px-1.5 py-0.5 text-[12px] leading-snug font-semibold [overflow-wrap:anywhere] line-clamp-3 ${a.tone === 'rose' ? 'bg-rose-700 text-white border border-rose-300' : 'bg-amber-400 text-amber-950 border border-amber-200'}`}>
              <EmphasizeLimit text={a.text} />
            </div>
          ))}
        </div>
      )}
      {/* Node Header */}
      <div
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).closest('button, input, select, textarea, .socket-port')) return;
          onStartDrag(e, node.id);
        }}
        className="px-3 py-2.5 rounded-t-xl cursor-grab active:cursor-grabbing border-b border-[#2a2c35] flex items-center justify-between select-none"
        data-lora-mismatch={loraMismatchNote ? 'true' : undefined}
        style={loraMismatchNote ? {
          background: 'linear-gradient(90deg, rgba(245,158,11,0.55) 0%, rgba(120,53,15,0.85) 100%)',
          borderLeft: '6px solid #fbbf24',
        } : {
          background: `linear-gradient(90deg, ${categoryColor}18 0%, rgba(25,26,32,0.85) 100%)`,
          borderLeft: `4px solid ${categoryColor}`,
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => onToggleCollapse(node.id)}
            className="text-slate-400 hover:text-white p-0.5 rounded"
          >
            {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {(() => {
            const stepsUnsupported =
              node.type === 'KSampler' &&
              isCanvasFieldUnsupported(currentProvider, currentCheckpoint, 'steps');
            const displayTitle =
              node.type === 'KSampler'
                ? ksamplerNodeTitle(node.title, stepsUnsupported || ['muapi','wavespeed','sogni','krea','together','aimlapi','novita'].includes(currentProvider || ''))
                : node.type === 'CheckpointLoaderSimple'
                  ? checkpointNodeTitle(node.values.targetProvider,node.values.ckpt_name)
                : LORA_LOADER_TYPES.has(node.type)
                  ? loraLoaderNodeTitle(node.title, node.values?.lora_name)
                  : node.title;
            const loraFull = LORA_LOADER_TYPES.has(node.type) ? String(node.values?.lora_name || '').trim() : '';
            const hoverTitle = loraFull
              ? loraFull
              : node.title !== displayTitle
                ? `${displayTitle}（原标题: ${node.title}）`
                : node.title;
            return (
              <span
                data-testid="node-header-title"
                className={
                  node.type === 'AIVideoNode'
                    ? 'font-bold text-[13px] text-white tracking-wide min-w-0 flex-1 whitespace-normal break-words leading-snug'
                    : LORA_LOADER_TYPES.has(node.type) || node.type === 'CheckpointLoaderSimple'
                      ? 'font-bold text-[13px] text-white tracking-wide min-w-0 flex-1 whitespace-normal [overflow-wrap:anywhere] leading-snug'
                      : 'font-bold text-[13px] text-white truncate tracking-wide min-w-0 flex-1'
                }
                title={hoverTitle}
              >
                {/* fix16.1 #3: LoRA title wraps after / and - via <wbr> (no ZWSP in text). */}
                {LORA_LOADER_TYPES.has(node.type) ? <BreakAfterSlashDash text={String(displayTitle)} /> : displayTitle}
              </span>
            );
          })()}
          {node.state === 'running' && (
            <div className="flex items-center gap-1 text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/40">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>{node.executionProgress ? `${node.executionProgress}%` : '运行中'}</span>
            </div>
          )}
          {node.state === 'success' && (
            <div className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/40">
              <Check className="w-3 h-3" />
              <span>就绪</span>
            </div>
          )}
          {node.state === 'error' && (
            <div className="flex items-center gap-1 shrink-0 text-[10px] font-mono text-rose-400 bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-800/40" title={node.errorMessage ? nodeErrorHeadline : undefined} data-testid="node-error-badge">
              <AlertTriangle className="w-3 h-3" />
              <span>异常</span>
            </div>
          )}
          {LORA_LOADER_TYPES.has(node.type) && !String(node.values?.lora_name || '').trim() && (
            <div className="flex items-center gap-1 text-[10px] font-mono text-amber-200 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-500/50" data-testid="lora-unfilled-badge">
              <span>未填 · 不会发送</span>
            </div>
          )}
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onToggleBypass(node.id)}
            className={`p-1 rounded hover:bg-[#282a33] transition-colors ${
              isBypassed ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
            }`}
            title={isBypassed ? '取消静音 (Enable)' : '静音节点 (Bypass)'}
          >
            {isBypassed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => onDeleteNode(node.id)}
            className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-[#282a33] transition-colors"
            title="删除节点 (Delete)"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Progress Strip during execution */}
      {node.state === 'running' && (
        <div className="w-full bg-[#121316] h-1.5 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-cyan-400 via-indigo-500 to-emerald-400 transition-all duration-300"
            style={{ width: `${node.executionProgress || 20}%` }}
          />
        </div>
      )}

      {/* Node error message banner — always inside the node, below the title bar (never absolute above: that covered title + buttons). */}
      {node.errorMessage && node.state !== 'running' && (
        <div className="mx-3 mt-2 p-2 bg-rose-950/40 border border-rose-800/60 rounded-lg text-[11px] text-rose-100 leading-relaxed flex items-start gap-1.5" data-testid="node-error-strip">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-300 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1 max-h-48 overflow-y-auto" data-testid="node-error-banner">
            <div className={`[overflow-wrap:anywhere] whitespace-pre-wrap ${schemaErr ? 'font-semibold' : ''}`} data-testid="node-error-headline">{nodeErrorHeadline}</div>
            {nodeErrorRaw ? (
              <details className="mt-1" data-testid="node-error-details">
                <summary className="cursor-pointer text-rose-200/90 text-[10px] select-none">详情</summary>
                <pre className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere] font-mono text-[10px] text-rose-200/90" data-testid="node-error-raw">{nodeErrorRaw}</pre>
              </details>
            ) : null}
          </div>
        </div>
      )}

      {/* Sockets Row (Inputs on Left, Outputs on Right) */}
      <div className="px-3 py-2 flex justify-between gap-4">
        {/* Inputs Column */}
        <div className="flex flex-col gap-2">
          {node.inputs.map((socket) => {
            const socketColor = SOCKET_COLORS[socket.type] || '#cbd5e1';
            return (
              <div
                key={socket.id}
                className="flex items-center gap-2 group relative"
                title={`${socket.name} (${socket.type})`}
              >
                {/* Port circle */}
                <div
                  id={`socket-${node.id}-${socket.id}-in`}
                  className="socket-port w-3.5 h-3.5 rounded-full border-2 border-[#191a20] cursor-crosshair transition-transform hover:scale-130 shadow-sm"
                  style={{ backgroundColor: socketColor }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onStartConnecting(node.id, socket.id, false, socket.type, e);
                  }}
                  onMouseUp={(e) => {
                    e.stopPropagation();
                    onEndConnecting(node.id, socket.id, false, socket.type);
                  }}
                />
                <span className="text-[11px] font-mono text-slate-300 font-semibold group-hover:text-white">
                  {socket.label || socket.name}
                </span>
              </div>
            );
          })}
        </div>

        {/* Outputs Column */}
        <div className="flex flex-col gap-2 items-end ml-auto">
          {node.outputs.map((socket) => {
            const socketColor = SOCKET_COLORS[socket.type] || '#cbd5e1';
            return (
              <div
                key={socket.id}
                className="flex items-center gap-2 group relative"
                title={`${socket.name} (${socket.type})`}
              >
                <span className="text-[11px] font-mono text-slate-300 font-semibold group-hover:text-white">
                  {socket.label || socket.name}
                </span>
                {/* Port circle */}
                <div
                  id={`socket-${node.id}-${socket.id}-out`}
                  className="socket-port w-3.5 h-3.5 rounded-full border-2 border-[#191a20] cursor-crosshair transition-transform hover:scale-130 shadow-sm"
                  style={{ backgroundColor: socketColor }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onStartConnecting(node.id, socket.id, true, socket.type, e);
                  }}
                  onMouseUp={(e) => {
                    e.stopPropagation();
                    onEndConnecting(node.id, socket.id, true, socket.type);
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Node Body & Widgets (hidden if collapsed) */}
      {!isCollapsed && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-[#252730]">
          {node.values.execution_blocked_reason && (() => {
            const reason = String(node.values.execution_blocked_reason);
            // MuAPI pendingRecipe 等已写清「载入后挂上再运行」的人话：不再叠「仅载入…」后缀。
            // 「来源执行链尚未接入」等其它拦截仍保留「仅载入，不能立即运行」。
            const pendingStyle = /载入后挂上再运行|待配方|真 LoRA 地址/.test(reason);
            const suffix = pendingStyle ? '' : ' · 仅载入，不能立即运行；请保留来源，创建新的显式生成分支。';
            return <p role="alert" className="text-amber-200">{reason}{suffix}</p>;
          })()}
          {(node.values.import_unresolved_resource === true || node.values.unresolvedResource === true) && <p role="alert" className="text-amber-200">资源尚未核实，请从目录或公开 metadata 查验后重新选择。</p>}
          {modelChainBreakMessage && <p role="alert" data-testid="node-model-chain-break" className="p-2 rounded bg-amber-950/50 border border-amber-500/50 text-amber-100 text-[11px] leading-relaxed [overflow-wrap:break-word]">{modelChainBreakMessage}</p>}
          {/* clean-1333 #5/#6: only the node that caused the block gets a red box, with the SAME reason as the toast. */}
          {node.localBlockReason && node.state !== 'running' && <div role="status" data-testid="node-local-block" className="p-2 rounded bg-rose-950/50 border border-rose-500/50 text-rose-100 text-[11px] leading-relaxed [overflow-wrap:break-word] whitespace-pre-wrap overflow-visible"><p className="font-semibold" data-testid="node-local-block-title">{node.localBlockTitle || LOCAL_BLOCK_NODE_LINE.split('：')[0]}</p><p data-testid="node-local-block-reason" className="overflow-visible"><EmphasizeLimit text={node.localBlockReason} /></p></div>}
          {node.values.require_reference_image === true && <p role="note" className="text-amber-200">编辑输入需要明确参考图；展示样图不作为输入。</p>}
          {currentProvider === 'agnes' && !currentCheckpoint?.includes('video') && ['KSampler', 'EmptyLatentImage', 'CLIPTextEncodeNegative'].includes(node.type) && (
            <p role="alert" className="p-2 rounded bg-rose-950/40 border border-rose-800/40 text-rose-300 text-[11px] leading-relaxed">
              Agnes AI 图像模型为云端简易接口，不使用 {node.type === 'KSampler' ? 'KSampler 采样器' : node.type === 'EmptyLatentImage' ? '空潜空间' : '负向提示词'}；请直接连接「加载底模 -&gt; CLIP 正向提示词 -&gt; 保存图像」。
            </p>
          )}
          {node.type === 'CheckpointLoaderSimple' && node.values.targetProvider === 'sensenova' && <div className="space-y-2">
            <label className="block text-slate-300">SenseNova size<input type="text" aria-label="SenseNova size" aria-describedby={`sensenova-size-note-${node.id}`} value={node.values.size ?? ''} onMouseDown={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()} onChange={e=>onUpdateValue(node.id,'size',e.target.value === '' ? undefined : e.target.value)} placeholder="auto / 2048x2048；留空时按画布宽高(如1024x1024)发送，无宽高则 auto" className="mt-1 w-full rounded border border-slate-700 bg-[#121316] p-2 focus-visible:outline-2 focus-visible:outline-cyan-400" /></label>
            <p id={`sensenova-size-note-${node.id}`} role="note" className="text-amber-200">官方文档写 2K/4K 常量，但本次上游对这两个值返回 400：invalid size, should be auto or WIDTHxHEIGHT。建议明确填写像素尺寸或 auto；原值保留，不自动转换，也不在此限制提交。</p>
            <label className="block text-slate-300">SenseNova output_format<input type="text" aria-label="SenseNova output_format" value={node.values.output_format ?? ''} onMouseDown={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()} onChange={e=>onUpdateValue(node.id,'output_format',e.target.value === '' ? undefined : e.target.value)} placeholder="png / jpeg / webp；留空不显式传" className="mt-1 w-full rounded border border-slate-700 bg-[#121316] p-2 focus-visible:outline-2 focus-visible:outline-cyan-400" /><span className="text-slate-400">本站支持 png/jpeg/webp；官方编辑文档也列 jpg，但本站尚未接通。自定义原值保留。</span></label>
            {(['watermark', 'prompt_extend'] as const).map(field => <label key={field} className="block text-slate-300">SenseNova {field}<select aria-label={`SenseNova ${field}`} value={typeof node.values[field] === 'boolean' ? String(node.values[field]) : ''} onMouseDown={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()} onChange={e=>onUpdateValue(node.id,field,e.target.value === '' ? undefined : e.target.value === 'true')} className="mt-1 w-full rounded border border-slate-700 bg-[#121316] p-2 focus-visible:outline-2 focus-visible:outline-cyan-400"><option value="">未设置（不显式传）</option><option value="false">false（关闭）</option><option value="true">true（开启）</option></select></label>)}
          </div>}
          {['CheckpointLoaderSimple','AIVideoNode'].includes(node.type) && node.values.targetProvider === 'civitai' && <div className="space-y-2">
            <label className="block text-slate-300">Civitai engine<select aria-label="Civitai engine" value={node.values.civitai_engine || ''} onMouseDown={e=>e.stopPropagation()} onChange={e=>onUpdateValue(node.id,'civitai_engine',e.target.value)} className="w-full rounded border border-slate-700 bg-[#121316] p-2"><option value="">请选择引擎</option><option value="sdcpp">sdcpp</option><option value="comfy">comfy</option>{node.values.civitai_engine && !['sdcpp','comfy'].includes(node.values.civitai_engine) && <option value={node.values.civitai_engine}>{node.values.civitai_engine}</option>}</select></label>
            <label className="block text-slate-300">Civitai ecosystem<input aria-label="Civitai ecosystem" value={node.values.civitai_ecosystem || ''} onMouseDown={e=>e.stopPropagation()} onChange={e=>onUpdateValue(node.id,'civitai_ecosystem',e.target.value)} placeholder="显式填写生态，如 sdxl；自定义值保留" className="w-full rounded border border-slate-700 bg-[#121316] p-2" /></label>
            <label className="block text-slate-300">Civitai model<input aria-label="Civitai model" value={node.values.civitai_model || ''} onMouseDown={e=>e.stopPropagation()} onChange={e=>onUpdateValue(node.id,'civitai_model',e.target.value)} placeholder="按所选引擎填写 model selector" className="w-full rounded border border-slate-700 bg-[#121316] p-2" /></label>
            <p className="text-slate-400">引擎和生态必须显式选择；AIR、sampler/scheduler 与引擎是否兼容由上游验证。</p>
          </div>}
          {node.type === 'AIVideoNode' && <label className="block text-slate-300">视频分辨率 (resolution)<input aria-label="视频分辨率 (resolution)" value={node.values.resolution || ''} onMouseDown={e=>e.stopPropagation()} onChange={e=>onUpdateValue(node.id,'resolution',e.target.value)} placeholder="未填写；按端点 Schema 指定" className="w-full rounded border border-slate-700 bg-[#121316] p-2" /></label>}
          {/* Widgets according to definition */}
          {def.widgets?.filter(widget => showUnsupported || !(isCanvasWidgetUnsupported(currentProvider, currentCheckpoint, widget.name) || (node.type === 'CLIPTextEncodeNegative' && widget.name === 'text' && greyNegative))).map((widget) => {
            const value = node.values[widget.name];
            if (widget.name === 'civitai_id' && (node.values.targetProvider || currentProvider || '') !== 'civitai') return null;
            if (widget.name === 'fal_model_name' && !((node.values.targetProvider || currentProvider) === 'fal' && node.values.ckpt_name === 'fal-ai/lora')) return null;
            if (node.type === 'AIVideoNode') {
              const wan = node.values.targetProvider === 'fal' && /wan-t2v|wan-i2v|wan\/v2\.1/.test(node.values.model || '');
              if ((widget.name === 'duration' && wan) || (widget.name === 'num_frames' && !wan)) return null;
              if (widget.name === 'duration' || widget.name === 'aspect_ratio') {
                // videoschema: options come from the selected endpoint's official Schema; absent field → no control.
                ensureModelSchema(node.values.targetProvider, node.values.model);
                const vf = videoSchemaField(node.values.targetProvider, node.values.model, widget.name);
                const issue = videoSchemaValueIssue(node.values.targetProvider, node.values.model, widget.name, value);
                if (vf.state === 'absent' && !issue) return null;
                if (vf.state !== 'unknown' && (vf.state === 'absent' || vf.options)) {
                  const opts = vf.state === 'declared' ? vf.options! : [];
                  const cur = value === undefined || value === null ? '' : String(value);
                  return <div key={widget.name} className="space-y-1" data-testid={`video-schema-${widget.name}`}>
                    <label className="text-slate-400 font-mono text-[11px] block whitespace-nowrap">{widget.label}</label>
                    {opts.length > 0 && <select aria-label={widget.label} value={cur} onMouseDown={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()} onChange={e=>onUpdateValue(node.id, widget.name, e.target.value === '' ? undefined : (opts.find(o=>String(o)===e.target.value) as any))} className={`w-full bg-[#121316] border ${issue ? 'border-rose-500' : 'border-[#2d303a]'} rounded-lg px-2.5 py-1.5 text-slate-200 text-xs font-mono outline-none`}>
                      <option value="">未选择（不提交）</option>
                      {issue && cur && <option value={cur}>{cur}（不可用）</option>}
                      {opts.map(o=><option key={String(o)} value={String(o)}>{widget.name === 'duration' ? `${o} 秒` : String(o)}</option>)}
                    </select>}
                    {issue && <p role="alert" className="text-[11px] text-rose-300">{issue}<button type="button" className="ml-2 underline" onMouseDown={e=>e.stopPropagation()} onClick={()=>onUpdateValue(node.id, widget.name, undefined)}>清除</button></p>}
                  </div>;
                }
              }
            }
            if (widget.name === 'hf_provider') {
              if ((node.values.targetProvider || currentProvider) !== 'huggingface') return null;
              return <label key={widget.name} className="block text-sm text-slate-400">HF 推理端点<select value={value || ''} onChange={e=>onUpdateValue(node.id,'hf_provider',e.target.value)} onMouseDown={e=>e.stopPropagation()} className="mt-1 w-full bg-[#121316] rounded-lg border border-[#2d303a] p-2 text-slate-200"><option value="">请选择实际执行路由</option><option value="hf-inference">HF Inference</option><option value="z-image-space">Z-Image 官方 Space</option><option value="fal-ai">HF Inference Providers → fal-ai（HF Token 计费）</option></select></label>;
            }
            if (LORA_LOADER_TYPES.has(node.type) && widget.name === 'strength_clip' && !providerSendsSeparateClipStrength(currentProvider)) return <p key={widget.name} data-testid="clip-strength-not-sent" className="text-xs text-slate-400">{CLIP_STRENGTH_NOT_SENT_NOTE}</p>;

            if (node.type === 'CheckpointLoaderSimple' && widget.name === 'shift') {
              const prov = String(node.values?.targetProvider || currentProvider || '');
              const model = node.values?.ckpt_name || currentCheckpoint;
              const hfSchemaModel = resolveSchemaModelId('huggingface', model);
              if (prov !== 'huggingface' || !hfSchemaModel || !getFieldSpec('huggingface', hfSchemaModel, 'shift')) return null;
              return (
                <div key={widget.name} className="space-y-1">
                  <label className="text-slate-400 font-mono text-[11px] block" title={widget.title || undefined}>{widget.label}</label>
                  <input type="number" min={1} max={10} step={0.1} value={value ?? ''}
                    placeholder="必填；官方默认 3.0"
                    onMouseDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}
                    onChange={(e) => onUpdateValue(node.id, 'shift', e.target.value === '' ? undefined : Number(e.target.value))}
                    className="w-full bg-[#121316] border border-[#2d303a] rounded-lg px-2.5 py-1.5 text-slate-200 text-xs font-mono outline-none" />
                </div>
              );
            }

            if (widget.type === 'slider') {
              const unsupported = isCanvasWidgetUnsupported(currentProvider, currentCheckpoint, widget.name);
              const sendStatus = schemaSendStatus(currentProvider, widget.name, node.values?.[widget.name], node.values?.custom_parameters, readDeclaredSchemaProperties(schemaCustomParameters), schemaCustomParameters);
              const omitHint = sendStatus === 'not_sent';
              // cleanup-2026-10-17: sampler params omitted by Schema are DISABLED (not 「能调但不发送」).
              const schemaUnused = SAMPLER_SCHEMA_WIDGETS.has(widget.name) && omitHint;
              // Hide Schema-omitted sampler shells (steps/CFG/sampler/scheduler) — empty disabled sliders look adjustable.
              // 雁: Schema 未声明 → 整格隐藏；仅当用户填了值却发不出去时留一行提醒（无灰框/空滑块）。
              if (SAMPLER_SCHEMA_WIDGETS.has(widget.name) && (schemaUnused || unsupported)) {
                if (!filledCanvasValue(node.values?.[widget.name])) return null;
                return <p key={widget.name} role="note" data-testid={`node-filled-not-sent-${widget.name}`} className="text-[11px] text-amber-300/90 leading-relaxed">{widget.label}已填，此模型不支持，不会发送</p>;
              }
              // cleanup-serious: strength/denoise only when a reference image is connected (WaveSpeed strength etc.).
              const isStrengthField = widget.name === 'denoise' || widget.name === 'strength';
              let strengthNeedsImage = false;
              if (isStrengthField && !unsupported) {
                const declared = readDeclaredSchemaProperties(schemaCustomParameters);
                let hasRef = false;
                try { hasRef = JSON.parse(schemaCustomParameters || '{}')?._canvas?.hasReferenceImage === true; } catch { /* */ }
                if (declared && declared.size > 0 && canvasFieldMatchesSchema('denoise', declared) && !hasRef) strengthNeedsImage = true;
              }
              const greyThis = unsupported || schemaUnused || strengthNeedsImage;
              return (
                <div key={widget.name} className={`space-y-1 `}>
                  <div className="flex flex-wrap items-center justify-between text-slate-400 font-mono text-[11px] gap-1.5">
                    {/* clean-1333 #6: label never wraps (「去噪强 / 度」); a long badge drops to its own line instead. */}
                    <span className="flex flex-wrap items-center gap-1.5 min-w-0" title={widget.title || undefined}>
                      <span className="whitespace-nowrap shrink-0" data-testid={`widget-label-${widget.name}`}>{widget.label}</span>
                      {unsupported && null}
                      {!unsupported && null}
                    </span>
                    <input
                      type="number"
                      step={widget.step || 0.1}
                      min={widget.min}
                      max={widget.max}
                      value={greyThis ? '' : (value ?? '')}
                      disabled={greyThis}
                      placeholder={schemaUnused ? '' : strengthNeedsImage ? '需接参考图' : (greyThis ? '该服务商不支持' : undefined)}
                      title={schemaUnused ? '这家接口不用这几个参数' : strengthNeedsImage ? '有参考图时才发送 strength（官方 Schema）' : (greyThis ? '该服务商不支持' : undefined)}
                      aria-label={schemaUnused ? widget.label : (greyThis ? `${widget.name}（该服务商不支持）` : widget.label)}
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        if (greyThis) return;
                        onUpdateValue(node.id, widget.name, e.target.value === '' ? undefined : parseFloat(e.target.value));
                      }}
                      className={greyThis
                        ? 'w-16 bg-[#0d0e12] border border-[#22242c] rounded px-1.5 py-0.5 text-right text-slate-600 font-mono text-[11px] outline-none cursor-not-allowed'
                        : 'w-16 bg-[#121316] border border-[#2b2d35] focus:border-cyan-500 rounded px-1.5 py-0.5 text-right text-cyan-400 font-mono text-[11px] outline-none select-text cursor-text'}
                    />
                  </div>
                  <input
                    type="range"
                    min={widget.min}
                    max={widget.max}
                    step={widget.step || 0.1}
                    value={greyThis ? (widget.min ?? 0) : (value ?? widget.min ?? 0)}
                    disabled={greyThis}
                    title={schemaUnused ? '这家接口不用这几个参数' : strengthNeedsImage ? '有参考图时才发送 strength（官方 Schema）' : (greyThis ? '该服务商不支持' : undefined)}
                    aria-label={schemaUnused ? widget.label : (greyThis ? `${widget.name}（该服务商不支持）` : widget.label)}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      if (greyThis) return;
                      onUpdateValue(node.id, widget.name, parseFloat(e.target.value));
                    }}
                    className={greyThis
                      ? 'w-full h-1.5 bg-[#0d0e12] rounded-lg appearance-none cursor-not-allowed pointer-events-none opacity-40 accent-slate-600'
                      : 'w-full h-1.5 bg-[#262832] rounded-lg appearance-none cursor-pointer accent-cyan-400'}
                  />
                </div>
              );
            }

            if (node.type === 'CheckpointLoaderSimple' && (widget.name === 'random_seed' || widget.name === 'gallery_images')) {
              const prov = node.values.targetProvider || currentProvider;
              const hfSchemaModel = resolveSchemaModelId('huggingface', node.values.ckpt_name);
              if (prov !== 'huggingface' || !hfSchemaModel || !getFieldSpec('huggingface', hfSchemaModel, 'shift')) return null;
              const selected = widget.name === 'random_seed' ? typeof value === 'boolean' ? String(value) : '' : Array.isArray(value) ? 'new' : '';
              return <div key={widget.name} className="space-y-1">
                <label className="text-slate-400 font-mono block" title={widget.title || undefined}>{widget.label}</label>
                <select value={selected} onMouseDown={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}
                  onChange={e => onUpdateValue(node.id, widget.name, e.target.value === '' ? undefined : widget.name === 'random_seed' ? e.target.value === 'true' : [])}
                  className="w-full bg-[#121316] border border-[#2d303a] rounded-lg px-2.5 py-1.5 text-slate-200 outline-none">
                  <option value="">请选择</option>
                  {widget.name === 'random_seed' ? <><option value="false">使用 KSampler 种子</option><option value="true">由 Space 随机选择</option></> : <option value="new">新建本次结果集</option>}
                </select>
              </div>;
            }

            if (widget.type === 'select') {
              const opts = widget.options || [];
              const isValueInOpts = opts.some((o) => o.value === value);

              if (node.type === 'CheckpointLoaderSimple' && widget.name === 'ckpt_name') {
                const currentProv = node.values?.targetProvider || '';
                const providerOpts = opts.filter((o: any) => o.provider === currentProv);
                const otherOpts = [] as typeof opts;
                const isCustom = !providerOpts.some((o) => o.value === value) && Boolean(value);

                return (
                  <div key={widget.name} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-slate-400 font-mono text-[11px] block" title={widget.title || undefined}>{widget.label}</label>
                      <div className="flex items-center gap-1.5">
                        {onOpenModelHub && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenModelHub('checkpoint');
                            }}
                            className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 bg-cyan-950/40 hover:bg-cyan-900/60 px-2 py-0.5 rounded border border-cyan-800/40 transition-colors"
                            title="打开基础底模中心 (Hub) 挑选并切换 Checkpoint 底模"
                          >
                            <Search className="w-2.5 h-2.5" />
                            <span>底模中心</span>
                          </button>
                        )}
                      </div>
                    </div>
                    {node.values.retiredToolSelection && !value && <details className="rounded border border-amber-900/50 p-2 text-xs text-amber-200"><summary>已清除误放在底模位置的旧 OpenWorks 接口项，请选择模型</summary><p className="mt-2">原始选择保留在工作流中；提示词、连线和 LoRA 没有替换。</p><pre className="mt-2 whitespace-pre-wrap break-all">{JSON.stringify(node.values.retiredToolSelection,null,2)}</pre></details>}
                    <ProviderModelSelect provider={currentProv} value={String(value || '')} onChange={next=>onUpdateValue(node.id,widget.name,next)} />

                    {/* fix11 #4: same CustomModelIdField as the video node (label above box, read-only <wbr> display, plain value in edit). */}
                    <div className="space-y-1 pt-0.5">
                      <label htmlFor={`custom-model-${node.id}`} data-testid="node-custom-model-label" className="text-slate-400 font-mono text-[11px] block">自定义模型 (model)</label>
                      <CustomModelIdField
                        id={`custom-model-${node.id}`}
                        value={String(value || '')}
                        placeholder={currentProv === 'civitai' ? '完整 AIR 或 modelId@versionId' : currentProv === 'tensorart' ? '输入模型 ID 或 tensor.art/models/… 链接' : '输入当前服务商的模型 ID / Repo ID'}
                        title="须使用当前服务商真实可调用的模型 ID，不会自动切换供应商"
                        onChange={(v) => onUpdateValue(node.id, widget.name, v)}
                        onCommit={(v) => { noteUserModelSelection(currentProv, v); }}
                      />
                    </div>
                  </div>
                );
              }

              if (node.type === 'AIVideoNode' && widget.name === 'model') {
                const currentProv = String(node.values?.targetProvider || '').trim();
                const providerOpts = opts.filter((o: any) => o.provider === currentProv);
                const otherOpts = [] as typeof opts;
                const isCustom = !providerOpts.some((o) => o.value === value) && Boolean(value);

                return (
                  <div key={widget.name} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-slate-400 font-mono text-[11px] block" title={widget.title || undefined}>{widget.label}</label>
                      <div className="flex items-center gap-1.5">
                        {onOpenModelHub && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenModelHub('video');
                            }}
                            className="text-[10px] text-lime-400 hover:text-lime-300 flex items-center gap-1 bg-lime-950/40 hover:bg-lime-900/60 px-2 py-0.5 rounded border border-lime-800/40 transition-colors"
                            title="打开 AI 视频大模型中心挑选 Wan 2.7 / 2.1、LTX、Kling 官方端点"
                          >
                            <Search className="w-2.5 h-2.5" />
                            <span>视频模型中心</span>
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Primary Dropdown Select */}
                    <div className="relative">
                    <select
                      data-testid="node-video-model-select"
                      value={value || ''}
                      title={(opts.find((o) => o.value === value)?.label as string) || (value ? String(value) : '未选择 (请先选择模型)')}
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      onChange={(e) => { const v = e.target.value; onUpdateValue(node.id, widget.name, v); noteUserModelSelection(currentProv, v); }}
                      className="w-full appearance-none bg-[#121316] border border-[#2d303a] hover:border-lime-500/50 focus:border-lime-500 rounded-lg pl-2.5 pr-8 py-1.5 text-slate-200 text-xs font-mono outline-none cursor-pointer overflow-hidden whitespace-nowrap text-ellipsis [text-overflow:ellipsis]"
                    >
                      <option value="">未选择 (请先选择模型)</option>
                      {isCustom && (
                        <option key={`custom-video-${value}`} value={value}>
                          ★ [自定义视频端点] {value}
                        </option>
                      )}
                      {currentProv && providerOpts.length > 0 && (
                        <optgroup label={`🎬 ${currentProv.toUpperCase()} 官方推荐视频大模型`}>
                          {providerOpts.map((opt, idx) => (
                            <option key={`prov-vid-${(opt as any).provider}-${opt.value}-${idx}`} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {currentProv && otherOpts.length > 0 && (
                        <optgroup label="🌐 其它视频服务商端点">
                          {otherOpts.map((opt, idx) => (
                            <option key={`other-vid-${(opt as any).provider}-${opt.value}-${idx}`} value={opt.value}>
                              [{(opt as any).provider?.toUpperCase()}] {opt.label}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {(!currentProv || (providerOpts.length === 0 && otherOpts.length === 0)) && opts.filter((o) => o.value !== '').map((opt, idx) => (
                        <option key={`fallback-vid-${opt.value}-${idx}`} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    </div>
                    {value ? (
                      <p
                        data-testid="node-video-model-label"
                        className="text-[0.875rem] leading-[1.5] text-slate-300 font-mono whitespace-normal [word-break:normal] [overflow-wrap:anywhere]"
                        title={String(value)}
                      >
                        {(() => { const o = opts.find((x) => x.value === value) as any; if (!o) return `★ [自定义视频端点]`; return o.provider && o.provider !== currentProv ? `[${String(o.provider).toUpperCase()}] ${o.label}` : String(o.label); })()}
                      </p>
                    ) : null}

                    {/* Secondary Custom Path Input */}
                    <div className="space-y-1 pt-0.5">
                      <label htmlFor={`custom-model-${node.id}`} data-testid="node-custom-model-label" className="text-slate-400 font-mono text-[11px] block">自定义模型 (model)</label>
                      <CustomModelIdField
                        id={`custom-model-${node.id}`}
                        value={String(value || '')}
                        placeholder="或输入任意视频端点 (如 fal-ai/wan-t2v)"
                        title="支持直接输入任意 Fal.ai / Tensor.Art / ModelScope 视频端点"
                        onChange={(v) => onUpdateValue(node.id, widget.name, v)}
                        onCommit={(v) => { noteUserModelSelection(currentProv, v); }}
                      />
                    </div>
                    {!value && (
                      <p className="text-[10px] text-amber-400 font-mono mt-1">请先选择模型</p>
                    )}
                  </div>
                );
              }

              // CheckpointLoaderSimple + grok_compat: schema-backed aspect_ratio / resolution
              if (
                node.type === 'CheckpointLoaderSimple' &&
                (widget.name === 'aspect_ratio' || widget.name === 'resolution')
              ) {
                const prov = String(node.values?.targetProvider || currentProvider || '').trim();
                if (prov === 'nanogpt' && widget.name === 'resolution') {
                  return <label key={widget.name} className="block text-sm text-slate-400">NanoGPT resolution<input value={value || ''} placeholder="按模型填写，如 1024x1024 / 1k" onChange={e=>onUpdateValue(node.id,'resolution',e.target.value)} onMouseDown={e=>e.stopPropagation()} className="mt-1 w-full bg-[#121316] border border-[#2d303a] rounded-lg p-2 text-slate-200"/><span className="text-xs">提交前查询所选模型支持值；与潜空间尺寸冲突时会提示。</span></label>;
                }
                if (prov !== 'grok_compat' && prov !== 'huggingface') return null;
                const schemaModel = resolveSchemaModelId(prov as 'grok_compat' | 'huggingface', node.values?.ckpt_name || currentCheckpoint);
                if (!schemaModel) return null;
                const opts = fieldOptions(prov as 'grok_compat' | 'huggingface', schemaModel, widget.name as 'aspect_ratio' | 'resolution');
                if (!opts.length) return null;
                const staleValue = value && !opts.some((option) => option.value === value);
                const stop = (e: React.SyntheticEvent) => e.stopPropagation();
                return (
                  <div key={widget.name} className="space-y-1">
                    <label className="text-slate-400 font-mono text-[11px] block" title={widget.title || undefined}>{widget.label}</label>
                    <select
                      value={value || ''}
                      onMouseDown={stop}
                      onPointerDown={stop}
                      onKeyDown={stop}
                      onChange={(e) => onUpdateValue(node.id, widget.name, e.target.value)}
                      className="w-full bg-[#121316] border border-[#2d303a] focus:border-cyan-500 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs font-mono outline-none cursor-pointer"
                    >
                      <option value="">未选择（不传）</option>
                      {staleValue && <option value={value}>旧值与当前模型不兼容：{value}</option>}
                      {opts.map((v) => (
                        <option key={v.value} value={v.value}>{v.value}</option>
                      ))}
                    </select>
                    {staleValue && <p role="alert" className="text-amber-300 text-xs">旧值与当前模型不兼容；提交会被拒绝，请选择支持值或明确清空。</p>}
                  </div>
                );
              }

              if (node.type === 'GoogleImagenNode') {
                const stop = (e: React.SyntheticEvent) => e.stopPropagation();
                if (widget.name === 'model') {
                  return (
                    <div key={widget.name} className="space-y-1">
                      <div className="flex items-center justify-between gap-1.5">
                        <label className="text-slate-400 font-mono text-[11px]" title={widget.title || undefined}>{widget.label}</label>
                        <GeminiModelBadge model={value || ''} />
                      </div>
                      <select
                        value={value}
                        onMouseDown={stop}
                        onPointerDown={stop}
                        onKeyDown={stop}
                        onChange={(e) => onUpdateValue(node.id, widget.name, e.target.value)}
                        className="w-full bg-[#121316] border border-[#2d303a] focus:border-cyan-500 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs font-mono outline-none cursor-pointer"
                      >
                        {!isValueInOpts && value && <option value={value}>{value}</option>}
                        {opts.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  );
                }
                if (widget.name === 'aspect_ratio' || widget.name === 'image_size') {
                  return (
                    <div key={widget.name} className="space-y-3">
                      {widget.name === 'aspect_ratio' && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-1.5">
                            <label className="text-slate-500 font-mono text-[11px]">width / height</label>
                            null
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <input type="number" disabled placeholder="width" aria-label="width（该服务商不支持）" className="w-full bg-[#0d0e12] border border-[#22242c] rounded-lg px-2.5 py-1.5 text-slate-600 font-mono text-xs cursor-not-allowed" />
                            <input type="number" disabled placeholder="height" aria-label="height（该服务商不支持）" className="w-full bg-[#0d0e12] border border-[#22242c] rounded-lg px-2.5 py-1.5 text-slate-600 font-mono text-xs cursor-not-allowed" />
                          </div>
                        </div>
                      )}
                      <GeminiFieldSelect
                        model={node.values?.model || ''}
                        field={widget.name}
                        value={value || ''}
                        onChange={(v) => onUpdateValue(node.id, widget.name, v)}
                      />
                    </div>
                  );
                }
              }

              const unsupported = isCanvasWidgetUnsupported(currentProvider, currentCheckpoint, widget.name);
              const sendStatus = schemaSendStatus(currentProvider, widget.name, node.values?.[widget.name], node.values?.custom_parameters, readDeclaredSchemaProperties(schemaCustomParameters), schemaCustomParameters);
              const omitHint = sendStatus === 'not_sent';
              // cleanup-2026-10-17: sampler params omitted by Schema are DISABLED (not 「能调但不发送」).
              const schemaUnused = SAMPLER_SCHEMA_WIDGETS.has(widget.name) && omitHint;
              // Hide Schema-omitted sampler shells (steps/CFG/sampler/scheduler) — empty disabled sliders look adjustable.
              // 雁: Schema 未声明 → 整格隐藏；仅当用户填了值却发不出去时留一行提醒（无灰框/空滑块）。
              if (SAMPLER_SCHEMA_WIDGETS.has(widget.name) && (schemaUnused || unsupported)) {
                if (!filledCanvasValue(node.values?.[widget.name])) return null;
                return <p key={widget.name} role="note" data-testid={`node-filled-not-sent-${widget.name}`} className="text-[11px] text-amber-300/90 leading-relaxed">{widget.label}已填，此模型不支持，不会发送</p>;
              }
              // cleanup-serious: strength/denoise only when a reference image is connected (WaveSpeed strength etc.).
              const isStrengthField = widget.name === 'denoise' || widget.name === 'strength';
              let strengthNeedsImage = false;
              if (isStrengthField && !unsupported) {
                const declared = readDeclaredSchemaProperties(schemaCustomParameters);
                let hasRef = false;
                try { hasRef = JSON.parse(schemaCustomParameters || '{}')?._canvas?.hasReferenceImage === true; } catch { /* */ }
                if (declared && declared.size > 0 && canvasFieldMatchesSchema('denoise', declared) && !hasRef) strengthNeedsImage = true;
              }
              const seedCtrlUnused = widget.name === 'control_after_generate' && (greySeed || schemaSendStatus(currentProvider, 'seed', node.values?.seed, node.values?.custom_parameters, readDeclaredSchemaProperties(schemaCustomParameters), schemaCustomParameters) === 'not_sent');
              // 生成后种子随 seed：Schema 无 seed → 整行隐藏
              if (seedCtrlUnused) {
                if (!filledCanvasValue(value)) return null;
                return <p key={widget.name} role="note" data-testid="node-filled-not-sent-control_after_generate" className="text-[11px] text-amber-300/90 leading-relaxed">{widget.label}已填，此模型不支持，不会发送</p>;
              }
              const greyThis = unsupported || schemaUnused || strengthNeedsImage;
              const emptyCtrl = widget.name === 'control_after_generate' && (value === undefined || value === null || value === '');
              return (
                <div key={widget.name} className={`space-y-1 `}>
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <label className="text-slate-400 font-mono text-[11px] block whitespace-nowrap shrink-0" data-testid={`widget-label-${widget.name}`} title={widget.title || undefined}>{widget.label}</label>
                    {unsupported && null}
                    {!unsupported && null}
                  </div>
                  <select
                    value={greyThis ? '' : (value ?? '')}
                    disabled={greyThis}
                    title={greyThis ? '该服务商不支持' : omitHint ? SCHEMA_OMIT_REASON : ((opts.find((o) => o.value === value)?.label as string) || (value != null && value !== '' ? String(value) : widget.label))}
                    aria-label={greyThis ? `${widget.name}（此模型不支持）` : widget.label}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      if (greyThis) return;
                      onUpdateValue(node.id, widget.name, e.target.value);
                    }}
                    className={greyThis
                      ? 'w-full bg-[#0d0e12] border border-[#22242c] rounded-lg px-2.5 py-1.5 text-slate-600 text-xs font-mono outline-none cursor-not-allowed pointer-events-none'
                      : 'w-full bg-[#121316] border border-[#2d303a] hover:border-cyan-500/50 focus:border-cyan-500 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs font-mono outline-none cursor-pointer select-text'}
                  >
                    {greyThis ? (
                      <option value="">该服务商不支持</option>
                    ) : (
                      <>
                        {emptyCtrl && <option value="">运行后才有</option>}
                        {!isValueInOpts && value && <option value={value}>{value}</option>}
                        {opts.map((opt, idx) => (
                          <option key={`${widget.name}-${opt.value}-${idx}`} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>
              );
            }

            if (widget.type === 'textarea') {
              const isPositiveCLIP = node.type === 'CLIPTextEncode';
              const isNegativeCLIP =
                node.type === 'CLIPTextEncodeNegative' ||
                widget.name === 'negative' ||
                widget.name === 'negative_prompt';
              const greyThisNegative = isNegativeCLIP && greyNegative;
              return (
                <div key={widget.name} className="space-y-1">
                  <div className="flex items-center justify-between gap-1.5">
                    <label className="text-slate-400 font-mono text-[11px]" title={widget.title || undefined}>{widget.label}</label>
                    <div className="flex items-center gap-1.5">
                      {greyThisNegative && null}
                      {isNegativeCLIP && !greyThisNegative && null}
                      {isPositiveCLIP && (
                        <button
                          onClick={handleRefinePrompt}
                          disabled={isRefining}
                          className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/40 disabled:opacity-50"
                        >
                          {isRefining ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Sparkles className="w-3 h-3" />
                          )}
                          <span>AI 润色优化</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <textarea
                    rows={4}
                    value={greyThisNegative ? '' : ((value === '填入配方/用户指定' ? '' : value) || '')}
                    disabled={greyThisNegative}
                    title={greyThisNegative ? '该服务商不支持' : undefined}
                    aria-label={greyThisNegative ? 'negative（该服务商不支持）' : widget.label}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      if (greyThisNegative) return;
                      onUpdateValue(node.id, widget.name, e.target.value);
                    }}
                    placeholder={greyThisNegative ? '该服务商不支持' : (widget.placeholder || '填入配方/用户指定')}
                    className={greyThisNegative
                      ? 'w-full bg-[#0d0e12] border border-[#22242c] rounded-lg p-2.5 text-slate-600 text-xs font-mono leading-relaxed outline-none resize-y cursor-not-allowed shadow-inner'
                      : 'w-full bg-[#121316] border border-[#2d303a] focus:border-cyan-500 rounded-lg p-2.5 text-slate-200 text-xs font-mono leading-relaxed outline-none resize-y select-text cursor-text shadow-inner placeholder:text-slate-500'}
                  />
                </div>
              );
            }

            if (widget.type === 'seed') {
              const seedSend = schemaSendStatus(currentProvider, 'seed', node.values?.seed, node.values?.custom_parameters, readDeclaredSchemaProperties(schemaCustomParameters), schemaCustomParameters);
              const seedSchemaUnused = seedSend === 'not_sent';
              const seedUnsupported = greySeed || seedSchemaUnused;
              // Schema 无 seed → 整行隐藏（含骰子）；仅用户填了值却发不出去时提醒一行。
              if (seedUnsupported) {
                if (!filledCanvasValue(value)) return null;
                return <p key={widget.name} role="note" data-testid="node-filled-not-sent-seed" className="text-[11px] text-amber-300/90 leading-relaxed">种子已填，此模型不支持，不会发送</p>;
              }
              const seedControl = node.values.control_after_generate;
              const seedEmpty = value === undefined || value === null || value === '';
              const seedPlaceholder = seedEmpty && seedControl === 'randomize'
                  ? '随机（运行时生成）'
                  : seedEmpty
                    ? '未设置'
                    : undefined;
              return (
                <div key={widget.name} className="space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <label className="text-slate-400 font-mono text-[11px] block whitespace-nowrap shrink-0" data-testid={`widget-label-${widget.name}`} title={widget.title || undefined}>{widget.label}</label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={value ?? ''}
                      placeholder={seedPlaceholder}
                      title={seedEmpty && seedControl === 'randomize' ? '随机：每次运行时生成种子' : undefined}
                      aria-label="seed"
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        onUpdateValue(node.id, widget.name, e.target.value === '' ? undefined : parseInt(e.target.value));
                      }}
                      className="flex-1 bg-[#121316] border border-[#2d303a] focus:border-cyan-500 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs outline-none select-text cursor-text placeholder:text-slate-500"
                    />
                    <button
                      type="button"
                      onClick={handleRandomSeed}
                      className="p-1.5 bg-[#252730] hover:bg-[#30333e] text-slate-300 hover:text-white rounded-lg border border-[#353744] transition-colors"
                      title="生成随机种子"
                      aria-label="生成随机种子"
                    >
                      <Dices className="w-4 h-4 text-cyan-400" />
                    </button>
                  </div>
                </div>
              );
            }

            if (widget.type === 'number') {
              const isWH = widget.name === 'width' || widget.name === 'height';
              const unsupported = (isWH && greyWidthHeight) || isCanvasWidgetUnsupported(currentProvider, currentCheckpoint, widget.name);
              const sendStatus = schemaSendStatus(currentProvider, widget.name, node.values?.[widget.name], node.values?.custom_parameters, readDeclaredSchemaProperties(schemaCustomParameters), schemaCustomParameters);
              const omitHint = sendStatus === 'not_sent';
              // cleanup-2026-10-17: sampler params omitted by Schema are DISABLED (not 「能调但不发送」).
              const schemaUnused = SAMPLER_SCHEMA_WIDGETS.has(widget.name) && omitHint;
              // Hide Schema-omitted sampler shells (steps/CFG/sampler/scheduler) — empty disabled sliders look adjustable.
              // 雁: Schema 未声明 → 整格隐藏；仅当用户填了值却发不出去时留一行提醒（无灰框/空滑块）。
              if (SAMPLER_SCHEMA_WIDGETS.has(widget.name) && (schemaUnused || unsupported)) {
                if (!filledCanvasValue(node.values?.[widget.name])) return null;
                return <p key={widget.name} role="note" data-testid={`node-filled-not-sent-${widget.name}`} className="text-[11px] text-amber-300/90 leading-relaxed">{widget.label}已填，此模型不支持，不会发送</p>;
              }
              // cleanup-serious: strength/denoise only when a reference image is connected (WaveSpeed strength etc.).
              const isStrengthField = widget.name === 'denoise' || widget.name === 'strength';
              let strengthNeedsImage = false;
              if (isStrengthField && !unsupported) {
                const declared = readDeclaredSchemaProperties(schemaCustomParameters);
                let hasRef = false;
                try { hasRef = JSON.parse(schemaCustomParameters || '{}')?._canvas?.hasReferenceImage === true; } catch { /* */ }
                if (declared && declared.size > 0 && canvasFieldMatchesSchema('denoise', declared) && !hasRef) strengthNeedsImage = true;
              }
              const greyThis = unsupported || schemaUnused || strengthNeedsImage;
              return (
                <div key={widget.name} className={`space-y-1 `}>
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <label className="text-slate-400 font-mono text-[11px] block whitespace-nowrap shrink-0" data-testid={`widget-label-${widget.name}`} title={widget.title || undefined}>{widget.label}</label>
                    {unsupported && null}
                    {!unsupported && null}
                  </div>
                  <div className="relative">
                  <input
                    type="number"
                    min={node.type === 'AIVideoNode' ? widget.name === 'duration' ? videoDurationBounds(node.values.targetProvider, node.values.model || '').min : ['fal-ai/wan-t2v','fal-ai/wan-i2v'].includes(node.values.model) ? widget.min : undefined : widget.min}
                    max={node.type === 'AIVideoNode' ? widget.name === 'duration' ? videoDurationBounds(node.values.targetProvider, node.values.model || '').max : ['fal-ai/wan-t2v','fal-ai/wan-i2v'].includes(node.values.model) ? widget.max : undefined : widget.max}
                    step={widget.step}
                    value={greyThis ? '' : (value ?? '')}
                    disabled={greyThis}
                    placeholder={schemaUnused ? '' : strengthNeedsImage ? '需接参考图' : (greyThis ? '该服务商不支持' : undefined)}
                    title={schemaUnused ? '这家接口不用这几个参数' : strengthNeedsImage ? '有参考图时才发送 strength（官方 Schema）' : (greyThis ? '该服务商不支持' : omitHint ? SCHEMA_OMIT_REASON : undefined)}
                    aria-label={schemaUnused ? widget.label : (greyThis ? `${widget.name}（该服务商不支持）` : omitHint ? `${widget.label}（该端点不支持）` : widget.label)}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      if (greyThis) return;
                      onUpdateValue(node.id, widget.name, e.target.value === '' ? undefined : parseFloat(e.target.value));
                    }}
                    className={greyThis
                      ? 'w-full bg-[#0d0e12] border border-[#22242c] rounded-lg px-2.5 py-1.5 text-slate-600 font-mono text-xs cursor-not-allowed outline-none'
                      : omitHint
                        ? 'w-full bg-[#121316] border border-amber-700/50 focus:border-amber-500 rounded-lg pl-2.5 pr-7 py-1.5 text-slate-200 font-mono text-xs outline-none select-text cursor-text'
                        : 'w-full bg-[#121316] border border-[#2d303a] focus:border-cyan-500 rounded-lg pl-2.5 pr-7 py-1.5 text-slate-200 font-mono text-xs outline-none select-text cursor-text'}
                  />
                  {widget.unit && <span data-testid={`widget-unit-${widget.name}`} aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs">{widget.unit}</span>}
                  </div>
                </div>
              );
            }

            if (widget.type === 'text') {
              const isLoraName = widget.name === 'lora_name';
              const isCkptName = node.type === 'CheckpointLoaderSimple' && widget.name === 'ckpt_name';
              return (
                <div key={widget.name} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-400 font-mono text-[11px]" title={widget.title || undefined}>{widget.label}</label>
                    {isLoraName && onOpenCivitaiPicker && (
                      <button
                        onClick={() => onOpenCivitaiPicker(node.id)}
                        className="text-[10px] text-purple-300 hover:text-white flex items-center gap-1 bg-purple-950/40 px-1.5 py-0.5 rounded border border-purple-800/40 transition-colors"
                        title="打开全生态 LoRA 模型中心挑选并配对底模"
                      >
                        <Search className="w-3 h-3 text-purple-400" />
                        <span>LoRA 中心</span>
                      </button>
                    )}
                    {isCkptName && onOpenModelHub && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenModelHub('checkpoint');
                        }}
                        className="text-[10px] text-cyan-300 hover:text-white flex items-center gap-1 bg-cyan-950/40 hover:bg-cyan-900/60 px-1.5 py-0.5 rounded border border-cyan-800/40 transition-colors"
                        title="打开基础底模中心挑选并选用 Checkpoint 底模"
                      >
                        <Search className="w-3 h-3 text-cyan-400" />
                        <span>底模中心</span>
                      </button>
                    )}
                  </div>
                  {isLoraName ? (
                    /* fix16.1 #3: LoRA id wraps (break opportunities at / and -; overflow-wrap fallback); value stays verbatim, Enter does not insert newline. */
                    <textarea
                      data-testid="lora-name-input"
                      rows={Math.max(1, Math.ceil(String(value || '').length / 34))}
                      value={value || ''}
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.preventDefault(); }}
                      onChange={(e) => onUpdateValue(node.id, widget.name, e.target.value)}
                      placeholder={widget.placeholder}
                      className="w-full resize-none bg-[#121316] border border-[#2d303a] focus:border-cyan-500 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs outline-none select-text cursor-text whitespace-pre-wrap [overflow-wrap:anywhere]"
                    />
                  ) : (
                  <input
                    type="text"
                    value={value || ''}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    onChange={(e) => onUpdateValue(node.id, widget.name, e.target.value)}
                    placeholder={widget.placeholder}
                    className="w-full bg-[#121316] border border-[#2d303a] focus:border-cyan-500 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs outline-none select-text cursor-text"
                  />
                  )}
                </div>
              );
            }

            return null;
          })}

          {(def.widgets || []).some(widget => isCanvasWidgetUnsupported(currentProvider, currentCheckpoint, widget.name) || (node.type === 'CLIPTextEncodeNegative' && widget.name === 'text' && greyNegative)) && (
            <div className="pt-2 border-t border-slate-700/40">
              <button type="button" onClick={(event) => {event.stopPropagation(); setShowUnsupported(!showUnsupported);}} aria-expanded={showUnsupported} className="text-xs text-slate-400 hover:text-slate-200 text-left">
                {showUnsupported ? '收起接口不使用的参数' : '查看此接口不使用的参数'}
              </button>
              {!showUnsupported && <p className="text-xs text-slate-500 mt-1">当前服务商接口不接收这些字段；保留在画布中供切换其他兼容模型时使用。</p>}
            </div>
          )}

          {node.type === 'LoRALoader' && node.values.lora_name && (() => {
            const note = loraSourceMismatch(node.values.resource_source, currentProvider || node.values?.targetProvider, node.values.base_model);
            return note ? <p role="alert" data-testid="lora-source-mismatch" className="mt-1 px-2 py-1.5 rounded border-2 border-amber-400 bg-amber-500/20 text-[12px] font-semibold text-amber-100 leading-snug"><span className="mr-1 font-extrabold text-amber-300">⚠ 来源不同</span>{note}</p> : null;
          })()}
          {/* LoRA Architecture Compatibility & One-Click Auto-Pairing Banner */}
          {node.type === 'LoRALoader' && node.values.lora_name && (currentCheckpoint || currentProvider) && (
            (() => {
              const ckpt = currentCheckpoint || '';
              const currentProv = currentProvider || node.values?.targetProvider || (ckpt.startsWith('fal-ai/') ? 'fal' : (ckpt.includes("krea-ai") || ckpt.includes("black-forest") || ckpt.includes("stabilityai") ? "huggingface" : undefined));
              const compat = validateLoraCompatibility(
                ckpt,
                node.values.base_model,
                node.values.lora_name,
                currentProv
              );
              if (compat.verification === 'unverified') return null; // no speculative copy (画布 reverify3 P0-3)
              if (compat.verification === 'verified') {
                return (
                  <div className="mt-1 px-2 py-1 rounded bg-emerald-950/40 border border-emerald-800/40 text-[10px] text-emerald-300 flex items-center justify-between font-mono">
                    <span className="flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-emerald-400" />
                      底模兼容 ({ckpt.split('/').pop()})
                    </span>
                    <span className="text-[9px] text-emerald-400/80">OK</span>
                  </div>
                );
              }
              if (compat.endpointUnsupported) {
                return (
                  <div className="mt-1 p-2 rounded-xl bg-rose-950/40 border border-rose-500/40 text-[10px] space-y-1.5 animate-in fade-in">
                    <div className="flex items-center gap-1 text-rose-300 font-bold">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                      <span>{LORA_UNSUPPORTED_TITLE}</span>
                    </div>
                    <p className="text-rose-200/90 leading-tight font-mono">{compat.message}</p>
                    {!node.bypassed && <button type="button" onClick={(e) => {e.stopPropagation(); onToggleBypass(node.id);}} className="px-2 py-1 rounded-lg border border-rose-400/30 text-rose-200 hover:bg-rose-900/40 text-xs">{LORA_BYPASS_LABEL}</button>}
                  </div>
                );
              }
              return (
                <div className="mt-1 p-2 rounded-xl bg-amber-950/40 border border-amber-500/40 text-[10px] space-y-1.5 animate-in fade-in">
                  <div className="flex items-center gap-1 text-amber-300 font-bold">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                    <span>底模架构不匹配</span>
                  </div>
                  <p className="text-amber-200/90 leading-tight">
                    {compat.message}
                  </p>
                  {/* cleanup-2026-10-17 #3: warning only — no one-click base-model swap; the user changes the checkpoint. */}
                </div>
              );
            })()
          )}

          {/* Special Visual Render for SaveImage, PreviewImage, VAEDecode, SaveVideo & AIVideoNode Nodes */}
          {(node.type === 'SaveImage' ||
            node.type === 'PreviewImage' ||
            node.type === 'SaveVideo' ||
            node.type === 'AIVideoNode' ||
            node.type === 'FalAIEngineNode' ||
            node.type === 'ReplicateEngineNode' ||
            node.type === 'ModelScopeNode' ||
            node.type === 'ModelScopeAiNode' ||
            node.type === 'NanoGPTNode' ||
            node.type === 'GoogleImagenNode' ||
            (node.type === 'KSampler' && node.outputData) ||
            (node.type === 'VAEDecode' && node.outputData)) && (
            <div className="mt-2 space-y-2">
              {node.outputData && node.stalePriorOutput && <p data-testid="stale-prior-output-label" role="status" className="rounded border border-amber-500/50 bg-amber-950/50 px-2 py-1 text-[11px] text-amber-100">上次结果，不是本次</p>}
              {node.outputData && node.restoredFromPreviousSession && !node.stalePriorOutput && <p data-testid="restored-output-label" className="rounded border border-slate-500/60 bg-slate-800/70 px-2 py-1 text-[11px] text-slate-200">{restoredOutputLabel(node.restoredFromPreviousSession)}</p>}
              {node.outputData && node.state === 'error' && !node.stalePriorOutput && <p data-testid="stale-error-output-label" role="status" className="rounded border border-amber-500/50 bg-amber-950/50 px-2 py-1 text-[11px] text-amber-100">上次结果，不是本次</p>}
              <div className="relative aspect-video w-full rounded-lg bg-[#121316] border border-[#2d303a] overflow-hidden flex items-center justify-center group">
                {node.outputData ? (
                  typeof node.outputData === 'string' &&
                  (node.outputData.includes('.mp4') || node.outputData.includes('mixkit') || node.type === 'SaveVideo' || node.type === 'AIVideoNode') ? (
                    <div className="relative w-full h-full">
                      {node.state === 'error' && (
                        <div className="absolute inset-x-0 top-0 z-[2] px-2 py-1 bg-rose-950/85 text-rose-200 text-[10px] font-mono text-center border-b border-rose-800/50">
                          上次结果，不是本次
                        </div>
                      )}
                      <video
                        src={node.outputData}
                        controls
                        autoPlay
                        loop
                        muted
                        playsInline
                        className={`w-full h-full object-contain ${node.state === 'error' ? 'opacity-40' : ''}`}
                      />
                      <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <a
                          href={node.outputData}
                          download={`AI_Video_${Date.now()}.mp4`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-lg bg-black/80 hover:bg-black text-cyan-400 text-[10px] font-bold flex items-center gap-1 border border-cyan-500/30"
                          title="下载 MP4 视频"
                        >
                          <Download className="w-3 h-3" />
                          <span>MP4</span>
                        </a>
                      </div>
                    </div>
                  ) : (
                    <>
                      {node.state === 'error' && (
                        <div className="absolute inset-x-0 top-0 z-[2] px-2 py-1 bg-rose-950/85 text-rose-200 text-[10px] font-mono text-center border-b border-rose-800/50">
                          上次结果，不是本次
                        </div>
                      )}
                      <img
                        src={node.outputData}
                        alt="Generated Result"
                        className={`w-full h-full object-contain cursor-pointer ${node.state === 'error' ? 'opacity-40' : ''}`}
                        onClick={() => onImageClick?.(node.outputData)}
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                        <button
                          onClick={() => onImageClick?.(node.outputData)}
                          className="p-2 rounded-full bg-black/70 hover:bg-black text-white"
                          title="查看大图"
                        >
                          <Maximize2 className="w-4 h-4" />
                        </button>
                        <a
                          href={node.outputData}
                          download={`${node.values.filename_prefix || 'ComfyCanvas'}_${Date.now()}.jpg`}
                          className="p-2 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white"
                          title="下载图像"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      </div>
                    </>
                  )
                ) : (
                  node.upstreamFailed && node.state !== 'running' ? (
                  <div className="text-center p-4 text-rose-300" role="status">
                    {node.upstreamLocalBlocked ? (<>
                    <p className="text-xs font-semibold">这次没有出图</p>
                    <span className="text-[10px] mt-1 block font-mono text-rose-400/80">{`${node.localBlockTitle || LOCAL_BLOCK_NODE_LINE.split('：')[0]}：原因见标红节点与执行记录`}</span>
                    </>) : (
                    <p className="text-xs font-semibold">{upstreamFailedLine(node.upstreamFailedTitle)}</p>
                    )}
                  </div>
                  ) : (
                  <PreviewPlaceholder>
                    <p className="text-xs">
                      {node.type === 'SaveVideo' || node.type === 'AIVideoNode' ? '等待渲染动态视频...' : '等待生成图像...'}
                    </p>
                    <span className={`text-[10px] mt-1 block font-mono ${node.type === 'AIVideoNode' && !node.values?.model ? 'text-amber-400/90' : 'text-slate-600'}`}>
                      {node.type === 'AIVideoNode' && !node.values?.model ? '请先选择模型' : '运行工作流后在此显示'}
                    </span>
                  </PreviewPlaceholder>
                  )
                )}
              </div>
            </div>
          )}

          {/* Special Visual Render for LoadImage Node */}
          {node.type === 'LoadImage' && (
            <div className="mt-2 space-y-2">
              <div className="relative aspect-video w-full rounded-lg bg-[#121316] border border-[#2d303a] overflow-hidden flex items-center justify-center">
                {node.values.image_url ? (
                  <img
                    src={node.values.image_url}
                    alt="Loaded Reference"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-slate-500 text-[10px]">输入图片 URL 或选择参考图</span>
                )}
              </div>
              <button type="button" onClick={e=>{e.stopPropagation();uploadInput.current?.click();}} className="w-full py-1.5 px-2.5 rounded-lg bg-[#1e202b] hover:bg-[#2b2e3e] text-slate-300 hover:text-white text-xs font-medium border border-[#2d303a] flex items-center justify-center gap-1.5 cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-cyan-400">
                <Upload className="w-3.5 h-3.5 text-cyan-400" />
                <span>上传本地图片</span>
              </button>
                <input
                  ref={uploadInput}
                  aria-label="上传本地图片文件"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      const dataUrl = ev.target?.result as string;
                      if (!dataUrl) return;
                      uploadMedia(dataUrl)
                        .then((url) => onUpdateValue(node.id, 'image_url', url))
                        .catch((error: Error) => alert(`参考图上传失败：${error.message}`));
                    };
                    reader.readAsDataURL(file);
                  }}
                />
            </div>
          )}

          {/* Special Visual for CivitaiLoRABrowserNode */}
          {node.type === 'CivitaiLoRABrowserNode' && (
            <div className="pt-1">
              <button
                onClick={() => onOpenCivitaiPicker?.(node.id)}
                className="w-full py-2 px-3 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/20"
              >
                <Search className="w-3.5 h-3.5" />
                打开 Civitai LoRA 浏览器
              </button>
            </div>
          )}

          {/* Special Interactive Visual for LLMReasoningNode */}
          {node.type === 'LLMReasoningNode' && (
            <div className="pt-1 space-y-2.5">
              <button
                onClick={handleRunReasoning}
                disabled={isReasoning || !node.values.prompt?.trim()}
                className="w-full py-2 px-3 rounded-lg bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
              >
                {isReasoning ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>正在深度推理思考 (CoT)...</span>
                  </>
                ) : (
                  <>
                    <Brain className="w-3.5 h-3.5 text-pink-300" />
                    <span>⚡ 运行深度思考与提示词扩写</span>
                  </>
                )}
              </button>

              {reasoningError && (
                <div className="p-2 rounded bg-rose-950/40 border border-rose-800/40 text-rose-300 text-[10px]">
                  {reasoningError}
                </div>
              )}

              {/* Collapsible Thinking Process (思维链) */}
              {node.values.reasoning_output && (
                <div className="rounded-lg bg-[#111216] border border-indigo-950/80 p-2 space-y-1">
                  <div
                    onClick={() => setShowThinkingChain(!showThinkingChain)}
                    className="flex items-center justify-between text-[10px] text-indigo-400 font-mono font-bold cursor-pointer hover:text-indigo-300 select-none"
                  >
                    <span className="flex items-center gap-1">
                      <Brain className="w-3 h-3" />
                      思维链推理过程 (Thinking Chain)
                    </span>
                    <span>{showThinkingChain ? '收起 ▲' : '展开 ▼'}</span>
                  </div>
                  {showThinkingChain && (
                    <div className="text-[10px] text-slate-400 font-mono max-h-32 overflow-y-auto leading-relaxed whitespace-pre-wrap p-1.5 bg-[#0a0b0d] rounded border border-indigo-900/30">
                      {node.values.reasoning_output}
                    </div>
                  )}
                </div>
              )}

              {/* Refined Final Output Text */}
              {node.values.refined_output && (
                <div className="rounded-lg bg-[#14151b] border border-[#2b2d3a] p-2 space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-emerald-400 font-mono font-bold flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-emerald-400" />
                      扩写完成的精炼提示词:
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(node.values.refined_output);
                        setCopiedRefined(true);
                        setTimeout(() => setCopiedRefined(false), 2000);
                      }}
                      className="text-slate-400 hover:text-white flex items-center gap-1 text-[9px] font-mono"
                    >
                      {copiedRefined ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                      <span>{copiedRefined ? '已复制' : '复制'}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-200 font-mono leading-relaxed line-clamp-4 select-text">
                    {node.values.refined_output}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
/** 「刷新前的结果」 label for an output restored from the workspace cache (original time when it was recorded). */
export function restoredOutputLabel(r: { at: string | null }): string {
  if (!r.at) return '刷新前的结果（时间未记录）· 不是本次会话生成';
  const d = new Date(r.at);
  const t = Number.isNaN(d.getTime()) ? r.at : formatRecordTime(d.toISOString());
  return `刷新前的结果 · ${t} · 不是本次会话生成`;
}
