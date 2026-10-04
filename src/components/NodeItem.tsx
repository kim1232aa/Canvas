import {ApiParameterEditor} from './ApiParameterEditor';
import {ProviderModelSelect} from './ProviderModelSelect';
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
} from 'lucide-react';
import { DataType, NodeInstance, Socket, SOCKET_COLORS } from '../types/graph';
import { NODE_DEFINITIONS } from '../constants/nodes';
import { refinePromptWithGemini, getStoredApiKeys, getRefineModelSelection } from '../services/api';
import { validateLoraCompatibility } from '../utils/baseModelMatcher';
import { EngineRegistry } from '../engines/EngineRegistry';
import { GeminiFieldSelect, GeminiModelBadge } from './GeminiFieldSelect';
import { fieldOptions, getFieldSpec, resolveSchemaModelId } from '../schemas/providerSchema';
import { FieldStatusBadge } from './FieldStatusBadge';
import { isCanvasFieldUnsupported, isCanvasWidgetUnsupported } from '../utils/resolveCheckpoint';
import { checkpointNodeTitle, ksamplerNodeTitle, loraLoaderNodeTitle, LORA_LOADER_TYPES } from '../utils/providerLabels';

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
  onAutoFixCheckpoint?: (recommendedCheckpoint: string) => void;
  onOpenModelHub?: (category?: 'all' | 'checkpoint' | 'lora' | 'video' | 'edit') => void;
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
  onAutoFixCheckpoint,
  onOpenModelHub,
}) => {
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
      style={{
        transform: `translate(${node.pos.x}px, ${node.pos.y}px)`,
        width: node.width || 300,
      }}
      onClick={onSelect}
      className={`canvas-node absolute rounded-xl border transition-shadow text-xs ${
        isBypassed ? 'opacity-50 grayscale' : 'opacity-100'
      } ${
        isSelected
          ? 'ring-2 ring-cyan-400 shadow-2xl shadow-cyan-500/20'
          : 'shadow-xl shadow-black/50'
      } ${
        node.state === 'running'
          ? 'border-amber-400 ring-2 ring-amber-400/50 animate-pulse'
          : node.state === 'error'
          ? 'border-rose-500 ring-2 ring-rose-500/40'
          : 'border-[#2c2f38]'
      } bg-[#191a20]/95 backdrop-blur-md`}
    >
      {/* Node Header */}
      <div
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).closest('button, input, select, textarea, .socket-port')) return;
          onStartDrag(e, node.id);
        }}
        className="px-3 py-2.5 rounded-t-xl cursor-grab active:cursor-grabbing border-b border-[#2a2c35] flex items-center justify-between select-none"
        style={{
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
                ? ksamplerNodeTitle(node.title, stepsUnsupported || ['muapi','wavespeed','sogni'].includes(currentProvider || ''))
                : node.type === 'CheckpointLoaderSimple'
                  ? checkpointNodeTitle(node.values.targetProvider,node.values.ckpt_name)
                : LORA_LOADER_TYPES.has(node.type)
                  ? loraLoaderNodeTitle(node.title, node.values?.lora_name)
                  : node.title;
            return (
              <span
                className="font-bold text-[13px] text-white truncate tracking-wide"
                title={node.title !== displayTitle ? `${displayTitle}（原标题: ${node.title}）` : node.title}
              >
                {displayTitle}
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
            <div className="flex items-center gap-1 text-[10px] font-mono text-rose-400 bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-800/40" title={node.errorMessage}>
              <AlertTriangle className="w-3 h-3" />
              <span>异常</span>
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

      {/* Node error message banner if present */}
      {node.state === 'error' && node.errorMessage && (
        <div className="mx-3 mt-2 p-2 bg-rose-950/40 border border-rose-800/60 rounded-lg text-[10px] text-rose-300 font-mono leading-relaxed flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
          <div className="break-all">{node.errorMessage}</div>
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
          {/* Node Error Banner */}
          {node.state === 'error' && node.errorMessage && (
            <div className="p-2 rounded bg-rose-950/40 border border-rose-800/40 text-rose-300 text-[11px] flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{node.errorMessage}</span>
            </div>
          )}

          {node.type==='CheckpointLoaderSimple' && ['fal','modelscope','modelscope_ai','huggingface','muapi','wavespeed','sogni'].includes(node.values.targetProvider) && <ApiParameterEditor provider={node.values.targetProvider} model={node.values.ckpt_name} value={node.values.custom_parameters} onChange={value=>onUpdateValue(node.id,'custom_parameters',value)} />}
          {/* Widgets according to definition */}
          {def.widgets?.filter(widget => showUnsupported || !(isCanvasWidgetUnsupported(currentProvider, currentCheckpoint, widget.name) || (node.type === 'CLIPTextEncodeNegative' && widget.name === 'text' && greyNegative))).map((widget) => {
            const value = node.values[widget.name];
            if (widget.name === 'fal_model_name' && !((node.values.targetProvider || currentProvider) === 'fal' && node.values.ckpt_name === 'fal-ai/lora')) return null;
            if (node.type === 'AIVideoNode') {
              const wan = node.values.targetProvider === 'fal' && /wan-t2v|wan-i2v|wan\/v2\.1/.test(node.values.model || '');
              if ((widget.name === 'duration' && wan) || (widget.name === 'num_frames' && !wan)) return null;
            }
            if (widget.name === 'hf_provider') {
              if ((node.values.targetProvider || currentProvider) !== 'huggingface') return null;
              return <label key={widget.name} className="block text-sm text-slate-400">HF 推理端点<select value={value || ''} onChange={e=>onUpdateValue(node.id,'hf_provider',e.target.value)} onMouseDown={e=>e.stopPropagation()} className="mt-1 w-full bg-[#121316] rounded-lg border border-[#2d303a] p-2 text-slate-200"><option value="">请选择实际执行路由</option><option value="hf-inference">HF Inference</option><option value="z-image-space">Z-Image 官方 Space</option><option value="fal-ai">HF Inference Providers → fal-ai（HF Token 计费）</option></select></label>;
            }
            if (LORA_LOADER_TYPES.has(node.type) && widget.name === 'strength_clip' && ['civitai', 'fal', 'modelscope', 'modelscope_ai', 'tensorart', 'huggingface','muapi','wavespeed','sogni'].includes(currentProvider || '')) return <p key={widget.name} className="text-xs text-slate-400">此 API 只接受单一 LoRA 强度；CLIP 强度不独立发送。</p>;

            if (node.type === 'CheckpointLoaderSimple' && widget.name === 'shift') {
              const prov = String(node.values?.targetProvider || currentProvider || '');
              const model = node.values?.ckpt_name || currentCheckpoint;
              if (prov !== 'huggingface' || !getFieldSpec('huggingface', resolveSchemaModelId('huggingface', model), 'shift')) return null;
              return (
                <div key={widget.name} className="space-y-1">
                  <label className="text-slate-400 font-mono text-[11px] block">{widget.label}</label>
                  <input type="number" min={1} max={10} step={0.1} value={value ?? ''}
                    placeholder="必填；官方默认 3.0"
                    onMouseDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}
                    onChange={(e) => onUpdateValue(node.id, 'shift', e.target.value === '' ? undefined : Number(e.target.value))}
                    className="w-full bg-[#121316] border border-[#2d303a] rounded-lg px-2.5 py-1.5 text-slate-200 text-xs font-mono outline-none" />
                </div>
              );
            }

            if (widget.type === 'slider') {
              const greyThis = isCanvasWidgetUnsupported(currentProvider, currentCheckpoint, widget.name);
              return (
                <div key={widget.name} className="space-y-1">
                  <div className="flex items-center justify-between text-slate-400 font-mono text-[11px] gap-1.5">
                    <span className="flex items-center gap-1.5">
                      {widget.label}
                      {greyThis && <FieldStatusBadge status="unsupported" />}
                    </span>
                    <input
                      type="number"
                      step={widget.step || 0.1}
                      min={widget.min}
                      max={widget.max}
                      value={greyThis ? '' : value}
                      disabled={greyThis}
                      placeholder={greyThis ? '该服务商不支持' : undefined}
                      title={greyThis ? '该服务商不支持' : undefined}
                      aria-label={greyThis ? `${widget.name}（该服务商不支持）` : widget.label}
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        if (greyThis) return;
                        onUpdateValue(node.id, widget.name, parseFloat(e.target.value) || 0);
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
                    value={greyThis ? (widget.min ?? 0) : value}
                    disabled={greyThis}
                    title={greyThis ? '该服务商不支持' : undefined}
                    aria-label={greyThis ? `${widget.name}（该服务商不支持）` : widget.label}
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
              if (prov !== 'huggingface' || !getFieldSpec('huggingface', resolveSchemaModelId('huggingface', node.values.ckpt_name), 'shift')) return null;
              const selected = widget.name === 'random_seed' ? typeof value === 'boolean' ? String(value) : '' : Array.isArray(value) ? 'new' : '';
              return <div key={widget.name} className="space-y-1">
                <label className="text-slate-400 font-mono block">{widget.label}</label>
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
                      <label className="text-slate-400 font-mono text-[11px] block">{widget.label}</label>
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
                    <ProviderModelSelect provider={currentProv} value={String(value || '')} onChange={next=>onUpdateValue(node.id,widget.name,next)} />

                    {/* Secondary Custom Path Input */}
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <span className="text-[10px] text-slate-500 font-mono shrink-0">自定义:</span>
                      <input
                        type="text"
                        value={value || ""}
                        placeholder={currentProv === 'tensorart' ? '输入模型 ID 或 tensor.art/models/… 链接' : '输入当前服务商的模型 ID / Repo ID'}
                        onMouseDown={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        onChange={(e) => onUpdateValue(node.id, widget.name, e.target.value)}
                        className="w-full bg-[#0d0e12] border border-[#22242c] focus:border-cyan-500 rounded px-2 py-0.5 text-[10px] text-cyan-300 font-mono placeholder:text-slate-600 outline-none select-text cursor-text"
                        title="须使用当前服务商真实可调用的模型 ID，不会自动切换供应商"
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
                      <label className="text-slate-400 font-mono text-[11px] block">{widget.label}</label>
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
                    <select
                      value={value || ''}
                      title={(opts.find((o) => o.value === value)?.label as string) || (value ? String(value) : '未选择 (请先选择模型)')}
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      onChange={(e) => onUpdateValue(node.id, widget.name, e.target.value)}
                      className="w-full bg-[#121316] border border-[#2d303a] hover:border-lime-500/50 focus:border-lime-500 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs font-mono outline-none cursor-pointer select-text"
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

                    {/* Secondary Custom Path Input */}
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <span className="text-[10px] text-slate-500 font-mono shrink-0">自定义:</span>
                      <input
                        type="text"
                        value={value || ""}
                        placeholder="或输入任意视频端点 (如 fal-ai/wan-t2v)"
                        onMouseDown={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        onChange={(e) => onUpdateValue(node.id, widget.name, e.target.value)}
                        className="w-full bg-[#0d0e12] border border-[#22242c] focus:border-lime-500 rounded px-2 py-0.5 text-[10px] text-lime-300 font-mono placeholder:text-slate-600 outline-none select-text cursor-text"
                        title="支持直接输入任意 Fal.ai / Tensor.Art / ModelScope 视频端点"
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
                const schemaModel = resolveSchemaModelId(prov, node.values?.ckpt_name || currentCheckpoint);
                const opts = fieldOptions(prov, schemaModel, widget.name as 'aspect_ratio' | 'resolution');
                if (!opts.length) return null;
                const stop = (e: React.SyntheticEvent) => e.stopPropagation();
                return (
                  <div key={widget.name} className="space-y-1">
                    <label className="text-slate-400 font-mono text-[11px] block">{widget.label}</label>
                    <select
                      value={value || ''}
                      onMouseDown={stop}
                      onPointerDown={stop}
                      onKeyDown={stop}
                      onChange={(e) => onUpdateValue(node.id, widget.name, e.target.value)}
                      className="w-full bg-[#121316] border border-[#2d303a] focus:border-cyan-500 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs font-mono outline-none cursor-pointer"
                    >
                      <option value="">未选择（不传）</option>
                      {opts.map((v) => (
                        <option key={v.value} value={v.value}>{v.value}</option>
                      ))}
                    </select>
                  </div>
                );
              }

              if (node.type === 'GoogleImagenNode') {
                const stop = (e: React.SyntheticEvent) => e.stopPropagation();
                if (widget.name === 'model') {
                  return (
                    <div key={widget.name} className="space-y-1">
                      <div className="flex items-center justify-between gap-1.5">
                        <label className="text-slate-400 font-mono text-[11px]">{widget.label}</label>
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
                            <FieldStatusBadge status="unsupported" />
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

              const greyThis = isCanvasWidgetUnsupported(currentProvider, currentCheckpoint, widget.name);
              return (
                <div key={widget.name} className="space-y-1">
                  <div className="flex items-center justify-between gap-1.5">
                    <label className="text-slate-400 font-mono text-[11px] block">{widget.label}</label>
                    {greyThis && <FieldStatusBadge status="unsupported" />}
                  </div>
                  <select
                    value={greyThis ? '' : (value ?? '')}
                    disabled={greyThis}
                    title={greyThis ? '该服务商不支持' : ((opts.find((o) => o.value === value)?.label as string) || (value != null && value !== '' ? String(value) : widget.label))}
                    aria-label={greyThis ? `${widget.name}（该服务商不支持）` : widget.label}
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
                    <label className="text-slate-400 font-mono text-[11px]">{widget.label}</label>
                    <div className="flex items-center gap-1.5">
                      {greyThisNegative && <FieldStatusBadge status="unsupported" />}
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
                    value={greyThisNegative ? '' : (value || '')}
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
                    placeholder={greyThisNegative ? '该服务商不支持' : widget.placeholder}
                    className={greyThisNegative
                      ? 'w-full bg-[#0d0e12] border border-[#22242c] rounded-lg p-2.5 text-slate-600 text-xs font-mono leading-relaxed outline-none resize-y cursor-not-allowed shadow-inner'
                      : 'w-full bg-[#121316] border border-[#2d303a] focus:border-cyan-500 rounded-lg p-2.5 text-slate-200 text-xs font-mono leading-relaxed outline-none resize-y select-text cursor-text shadow-inner'}
                  />
                </div>
              );
            }

            if (widget.type === 'seed') {
              return (
                <div key={widget.name} className="space-y-1">
                  <div className="flex items-center justify-between gap-1.5">
                    <label className="text-slate-400 font-mono text-[11px] block">{widget.label}</label>
                    {greySeed && <FieldStatusBadge status="unsupported" />}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={greySeed ? '' : value}
                      disabled={greySeed}
                      placeholder={greySeed ? '该服务商不支持' : undefined}
                      title={greySeed ? '该服务商不支持' : undefined}
                      aria-label={greySeed ? 'seed（该服务商不支持）' : 'seed'}
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        if (greySeed) return;
                        onUpdateValue(node.id, widget.name, parseInt(e.target.value) || 0);
                      }}
                      className={greySeed
                        ? 'flex-1 bg-[#0d0e12] border border-[#22242c] rounded-lg px-2.5 py-1.5 text-slate-600 font-mono text-xs cursor-not-allowed outline-none'
                        : 'flex-1 bg-[#121316] border border-[#2d303a] focus:border-cyan-500 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs outline-none select-text cursor-text'}
                    />
                    <button
                      type="button"
                      onClick={greySeed ? undefined : handleRandomSeed}
                      disabled={greySeed}
                      className={greySeed
                        ? 'p-1.5 bg-[#0d0e12] text-slate-600 rounded-lg border border-[#22242c] cursor-not-allowed pointer-events-none'
                        : 'p-1.5 bg-[#252730] hover:bg-[#30333e] text-slate-300 hover:text-white rounded-lg border border-[#353744] transition-colors'}
                      title={greySeed ? '该服务商不支持' : '生成随机种子'}
                      aria-label={greySeed ? '随机种子（该服务商不支持）' : '生成随机种子'}
                    >
                      <Dices className={`w-4 h-4 ${greySeed ? 'text-slate-600' : 'text-cyan-400'}`} />
                    </button>
                  </div>
                </div>
              );
            }

            if (widget.type === 'number') {
              const isWH = widget.name === 'width' || widget.name === 'height';
              const greyThis = (isWH && greyWidthHeight) || isCanvasWidgetUnsupported(currentProvider, currentCheckpoint, widget.name);
              return (
                <div key={widget.name} className="space-y-1">
                  <div className="flex items-center justify-between gap-1.5">
                    <label className="text-slate-400 font-mono text-[11px] block">{widget.label}</label>
                    {greyThis && <FieldStatusBadge status="unsupported" />}
                  </div>
                  <input
                    type="number"
                    value={greyThis ? '' : value}
                    disabled={greyThis}
                    placeholder={greyThis ? '该服务商不支持' : undefined}
                    title={greyThis ? '该服务商不支持' : undefined}
                    aria-label={greyThis ? `${widget.name}（该服务商不支持）` : widget.label}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      if (greyThis) return;
                      onUpdateValue(node.id, widget.name, parseFloat(e.target.value) || 0);
                    }}
                    className={greyThis
                      ? 'w-full bg-[#0d0e12] border border-[#22242c] rounded-lg px-2.5 py-1.5 text-slate-600 font-mono text-xs cursor-not-allowed outline-none'
                      : 'w-full bg-[#121316] border border-[#2d303a] focus:border-cyan-500 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs outline-none select-text cursor-text'}
                  />
                </div>
              );
            }

            if (widget.type === 'text') {
              const isLoraName = widget.name === 'lora_name';
              const isCkptName = node.type === 'CheckpointLoaderSimple' && widget.name === 'ckpt_name';
              return (
                <div key={widget.name} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-400 font-mono text-[11px]">{widget.label}</label>
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
              {!showUnsupported && <p className="text-xs text-slate-500 mt-1">按所选模型接口运行，已有参数仍保留在画布中。</p>}
            </div>
          )}

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
              if (compat.isCompatible) {
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
                      <span>该服务商不支持</span>
                    </div>
                    <p className="text-rose-200/90 leading-tight font-mono">{compat.message}</p>
                    {!node.bypassed && <button type="button" onClick={(e) => {e.stopPropagation(); onToggleBypass(node.id);}} className="px-2 py-1 rounded-lg border border-rose-400/30 text-rose-200 hover:bg-rose-900/40 text-xs">旁路此 LoRA 节点</button>}
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
                  {onAutoFixCheckpoint && compat.recommendedCheckpoint && (
                    <button
                      onClick={() => onAutoFixCheckpoint(compat.recommendedCheckpoint!)}
                      className="w-full py-1.5 px-2 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold flex items-center justify-center gap-1 transition-all shadow-md text-[10px] active:scale-95"
                      title="一键将前置 CheckpointLoader 节点的模型切换为匹配底模（可选；不会自动触发）"
                    >
                      <Sparkles className="w-3 h-3 text-amber-200" />
                      <span>⚡ 一键自动配对前置底模</span>
                    </button>
                  )}
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
            (node.type === 'KSampler' && node.outputData) ||
            (node.type === 'VAEDecode' && node.outputData)) && (
            <div className="mt-2 space-y-2">
              <div className="relative aspect-video w-full rounded-lg bg-[#121316] border border-[#2d303a] overflow-hidden flex items-center justify-center group">
                {node.outputData ? (
                  typeof node.outputData === 'string' &&
                  (node.outputData.includes('.mp4') || node.outputData.includes('mixkit') || node.type === 'SaveVideo' || node.type === 'AIVideoNode') ? (
                    <div className="relative w-full h-full">
                      <video
                        src={node.outputData}
                        controls
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="w-full h-full object-contain"
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
                      <img
                        src={node.outputData}
                        alt="Generated Result"
                        className="w-full h-full object-contain cursor-pointer"
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
                  <div className="text-center p-4 text-slate-500">
                    <p className="text-xs">
                      {node.type === 'SaveVideo' || node.type === 'AIVideoNode' ? '等待渲染动态视频...' : '等待生成图像...'}
                    </p>
                    <span className={`text-[10px] mt-1 block font-mono ${node.type === 'AIVideoNode' && !node.values?.model ? 'text-amber-400/90' : 'text-slate-600'}`}>
                      {node.type === 'AIVideoNode' && !node.values?.model ? '请先选择模型' : '运行工作流后在此显示'}
                    </span>
                  </div>
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
