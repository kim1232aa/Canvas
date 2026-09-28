import React, { useState, useRef } from 'react';
import {
  Sparkles,
  Layers,
  Upload,
  Download,
  Trash2,
  Copy,
  Check,
  Search,
  Filter,
  ArrowRight,
  Plus,
  Play,
  FileCode,
  AlertTriangle,
  RotateCcw,
  Sliders,
  CheckCircle2,
  ExternalLink,
  Cpu,
  Info,
  Database,
} from 'lucide-react';
import { WORKFLOW_PRESETS } from '../constants/presets';
import { NODE_DEFINITIONS } from '../constants/nodes';
import { WorkflowPreset, NodeInstance, Connection, SpatialFrame } from '../types/graph';

interface WorkflowPresetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadPreset: (preset: WorkflowPreset, mode: 'replace' | 'append') => void;
  onLoadAndRunPreset?: (preset: WorkflowPreset) => void;
  currentNodes: NodeInstance[];
  currentConnections: Connection[];
  currentSpatialFrames: SpatialFrame[];
  onImportWorkflowData: (data: {
    nodes?: NodeInstance[];
    connections?: Connection[];
    spatialFrames?: SpatialFrame[];
  }) => void;
  onClearCanvas: (type: 'all' | 'nodes' | 'frames' | 'reset-default') => void;
  initialTab?: 'presets' | 'civitai-extract' | 'import' | 'export' | 'clear';
}

export const WorkflowPresetsModal: React.FC<WorkflowPresetsModalProps> = ({
  isOpen,
  onClose,
  onLoadPreset,
  onLoadAndRunPreset,
  currentNodes,
  currentConnections,
  currentSpatialFrames,
  onImportWorkflowData,
  onClearCanvas,
  initialTab = 'presets',
}) => {
  const [activeTab, setActiveTab] = useState<'presets' | 'civitai-extract' | 'import' | 'export' | 'clear'>(initialTab);
  const [selectedCategory, setSelectedCategory] = useState<string>('全部');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Civitai URL Extract State
  const [civitaiUrlInput, setCivitaiUrlInput] = useState<string>('https://civitai.red/images/136947637');
  const [selectedEngine, setSelectedEngine] = useState<'civitai' | 'fal' | 'video' | 'agnes' | 'sensenova' | 'modelscope' | 'huggingface' | 'tensorart' | 'nanogpt'>('civitai');
  const [showOtherMetadata, setShowOtherMetadata] = useState<boolean>(true);
  const [isExtractingCivitai, setIsExtractingCivitai] = useState<boolean>(false);
  const [civitaiExtractError, setCivitaiExtractError] = useState<string | null>(null);
  const [extractedPreset, setExtractedPreset] = useState<WorkflowPreset | null>(null);

  // Import state
  const [pastedJson, setPastedJson] = useState<string>('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<{
    nodesCount: number;
    connectionsCount: number;
    framesCount: number;
    format: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset tab when reopened with initialTab
  React.useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setImportError(null);
      setImportSummary(null);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  // Filter presets
  const categories = [
    '全部',
    'Tensor.Art 官方原生',
    'Civitai 热门精选 (hinablue)',
    'FLUX 热门微调',
    '二次元 / 动漫美学',
    '真实摄影 / 胶片风',
    '国产大模型 / 国风',
    '复古艺术 / 游戏美学',
    '产品建模 / 3D 盲盒',
    '内置免配置',
  ];

  const handleExtractCivitaiWorkflow = async (
    targetUrl = civitaiUrlInput,
    engineToUse: 'civitai' | 'fal' | 'video' | 'agnes' | 'sensenova' | 'modelscope' | 'huggingface' | 'tensorart' | 'nanogpt' = selectedEngine
  ) => {
    if (!targetUrl.trim()) return;
    setIsExtractingCivitai(true);
    setCivitaiExtractError(null);
    try {
      const isRaw =
        targetUrl.includes('Negative prompt:') ||
        targetUrl.includes('Steps:') ||
        targetUrl.includes('Sampler:') ||
        targetUrl.includes('<lora:') ||
        targetUrl.includes('\n');

      const payload = isRaw
        ? { rawText: targetUrl.trim(), engine: engineToUse }
        : { url: targetUrl.trim(), imageId: targetUrl.trim(), engine: engineToUse };

      const resp = await fetch('/api/civitai/extract-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.error || '提取工作流失败，请检查链接或格式');
      }
      setExtractedPreset(data.preset);
    } catch (err: any) {
      setCivitaiExtractError(err.message || '网络请求错误');
    } finally {
      setIsExtractingCivitai(false);
    }
  };

  const filteredPresets = WORKFLOW_PRESETS.filter((p) => {
    const matchCat = selectedCategory === '全部' || p.category.includes(selectedCategory) || (selectedCategory === '真实摄影 / 胶片风' && p.category.includes('写实'));
    const matchSearch =
      !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.tags?.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase())) ||
      p.loraNames?.some((l) => l.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchCat && matchSearch;
  });

  const handleCopyPrompt = (p: WorkflowPreset) => {
    const frame = p.spatialFrames?.[0];
    const textToCopy = frame?.prompt || (p.nodes.find((n) => n.type === 'CLIPTextEncode')?.values.text as string) || '';
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      setCopiedId(p.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // Parse imported JSON (supports ComfyCanvas, ComfyUI standard workflow, or ComfyUI API prompt)
  const parseWorkflowJson = (jsonString: string) => {
    try {
      setImportError(null);
      const parsed = JSON.parse(jsonString);

      // Helper: Map widgets_values array to named parameters based on node definition
      const mapWidgetsValuesToNamed = (nodeType: string, widgets: any) => {
        if (!widgets) return {};
        if (!Array.isArray(widgets)) return widgets;
        const res: Record<string, any> = {};
        switch (nodeType) {
          case 'CheckpointLoaderSimple':
            if (widgets[0] !== undefined) res.ckpt_name = String(widgets[0]);
            break;
          case 'LoRALoader':
            if (widgets[0] !== undefined) res.lora_name = String(widgets[0]);
            if (widgets[1] !== undefined) res.strength_model = Number(widgets[1]) || 0.8;
            if (widgets[2] !== undefined) res.strength_clip = Number(widgets[2]) || 0.8;
            break;
          case 'CLIPTextEncode':
          case 'CLIPTextEncodeNegative':
            if (widgets[0] !== undefined) res.text = String(widgets[0]);
            break;
          case 'EmptyLatentImage':
            if (widgets[0] !== undefined) res.width = Number(widgets[0]) || 1024;
            if (widgets[1] !== undefined) res.height = Number(widgets[1]) || 1024;
            if (widgets[2] !== undefined) res.batch_size = Number(widgets[2]) || 1;
            break;
          case 'KSampler':
          case 'KSamplerAdvanced':
            if (widgets[0] !== undefined) res.seed = Number(widgets[0]) || 0;
            if (widgets[1] !== undefined) res.control_after_generate = String(widgets[1]);
            if (widgets[2] !== undefined) res.steps = Number(widgets[2]) || 20;
            if (widgets[3] !== undefined) res.cfg = Number(widgets[3]) || 6.0;
            if (widgets[4] !== undefined) res.sampler_name = String(widgets[4]);
            if (widgets[5] !== undefined) res.scheduler = String(widgets[5]);
            if (widgets[6] !== undefined) res.denoise = Number(widgets[6]) || 1.0;
            break;
          case 'SaveImage':
            if (widgets[0] !== undefined) res.filename_prefix = String(widgets[0]);
            break;
          default:
            widgets.forEach((val, idx) => {
              res[`param_${idx}`] = val;
            });
        }
        return res;
      };

      // Helper: Synthesize ready-to-run SpatialFrame from parsed nodes
      const synthesizeSpatialFrameFromNodes = (nodes: NodeInstance[]): SpatialFrame => {
        const ckptNode = nodes.find((n) => n.type === 'CheckpointLoaderSimple');
        const positivePromptNode =
          nodes.find((n) => n.type === 'CLIPTextEncode') ||
          nodes.find((n) => n.title.includes('正向') || n.title.includes('Positive'));
        const negativePromptNode =
          nodes.find((n) => n.type === 'CLIPTextEncodeNegative') ||
          nodes.find((n) => n.title.includes('负向') || n.title.includes('Negative'));
        const latentNode = nodes.find((n) => n.type === 'EmptyLatentImage');
        const samplerNode = nodes.find((n) => n.type === 'KSampler' || n.type === 'KSamplerAdvanced');
        const loraNodes = nodes.filter((n) => n.type === 'LoRALoader' && n.values?.lora_name);

        const rawCkpt = (ckptNode?.values?.ckpt_name as string) || '';
        const width = Number(latentNode?.values?.width) || 1024;
        const height = Number(latentNode?.values?.height) || 1024;
        const steps = Number(samplerNode?.values?.steps) || 28;
        const cfg = Number(samplerNode?.values?.cfg) || 6.0;
        const sampler = (samplerNode?.values?.sampler_name as string) || 'dpmpp_2m';
        const scheduler = (samplerNode?.values?.scheduler as string) || 'karras';
        const seed = Number(samplerNode?.values?.seed) || Math.floor(Math.random() * 1000000000);

        const targetLoras = loraNodes.map((l) => ({
          name: l.values.lora_name,
          modelStrength: Number(l.values.strength_model ?? 0.8),
          clipStrength: Number(l.values.strength_clip ?? 0.8),
          triggerWords: l.values.trigger_words || '',
          civitaiId: l.values.civitai_id || '',
        }));

        const rawCkptLower = rawCkpt.toLowerCase();
        const targetProvider =
          rawCkptLower.includes('tensor') || rawCkptLower.includes('banana') || rawCkptLower.includes('oc_character') || rawCkptLower.includes('openworks')
            ? 'tensorart'
            : rawCkptLower.includes('nanogpt')
            ? 'nanogpt'
            : rawCkptLower.includes('damo') || rawCkptLower.includes('modelscope')
            ? 'modelscope'
            : rawCkptLower.includes('sensenova')
            ? 'sensenova'
            : rawCkptLower.includes('agnes')
            ? 'agnes'
            : rawCkptLower.includes('civitai') || rawCkptLower.startsWith('urn:air:')
            ? 'civitai'
            : 'fal';

        return {
          id: `frame-imported-${Date.now()}`,
          title: '工作流导入取景框 (已智能配对拓扑参数)',
          pos: { x: 260, y: 160 },
          width: 480,
          height: 480,
          prompt: (positivePromptNode?.values?.text as string) || 'masterpiece, highly detailed, photorealistic',
          negativePrompt: (negativePromptNode?.values?.text as string) || 'blurry, low quality, deformed, extra limbs',
          params: {
            checkpoint: rawCkpt,
            seed,
            seedControl: 'randomize',
            steps,
            cfg,
            sampler,
            scheduler,
            denoise: 1.0,
            width,
            height,
            batchSize: 1,
            loras: targetLoras,
            targetProvider,
          },
          status: 'idle',
          createdAt: Date.now(),
        };
      };

      // Format 1: ComfyCanvas native format
      if (parsed.nodes && Array.isArray(parsed.nodes)) {
        const frames = Array.isArray(parsed.spatialFrames) && parsed.spatialFrames.length > 0
          ? parsed.spatialFrames
          : [synthesizeSpatialFrameFromNodes(parsed.nodes)];

        setImportSummary({
          nodesCount: parsed.nodes.length,
          connectionsCount: parsed.connections?.length || 0,
          framesCount: frames.length,
          format: 'ComfyCanvas 完整工程',
        });
        return { ...parsed, spatialFrames: frames };
      }

      // Format 2: ComfyUI Standard Workflow ({ nodes: [...], links: [...] })
      if (parsed.nodes && Array.isArray(parsed.nodes) && (parsed.links || parsed.extra)) {
        const rawNodeMap = new Map<number | string, any>();
        parsed.nodes.forEach((n: any) => rawNodeMap.set(n.id, n));

        // Convert to ComfyCanvas standard
        const convertedNodes: NodeInstance[] = parsed.nodes.map((n: any) => {
          const def = NODE_DEFINITIONS[n.type];
          return {
            id: `node-${n.id}`,
            type: n.type,
            title: n.title || (def ? def.title : n.type),
            pos: { x: n.pos?.[0] || 100, y: n.pos?.[1] || 100 },
            width: n.size?.[0] || 300,
            inputs: def
              ? def.inputs
              : (n.inputs || []).map((inp: any) => ({
                  id: inp.name,
                  name: inp.name,
                  type: inp.type as any,
                })),
            outputs: def
              ? def.outputs
              : (n.outputs || []).map((out: any) => ({
                  id: out.name,
                  name: out.name,
                  type: out.type as any,
                })),
            values: mapWidgetsValuesToNamed(n.type, n.widgets_values || {}),
          };
        });

        const convertedConnections: Connection[] = [];
        if (Array.isArray(parsed.links)) {
          parsed.links.forEach((l: any, idx: number) => {
            if (Array.isArray(l) && l.length >= 5) {
              const srcRawNode = rawNodeMap.get(l[1]);
              const tgtRawNode = rawNodeMap.get(l[3]);
              const srcDef = srcRawNode ? NODE_DEFINITIONS[srcRawNode.type] : null;
              const tgtDef = tgtRawNode ? NODE_DEFINITIONS[tgtRawNode.type] : null;

              // Resolve semantic socket ID from output/input slot indices
              const fromSocketId =
                srcDef?.outputs?.[l[2]]?.id ||
                srcRawNode?.outputs?.[l[2]]?.name ||
                String(l[2]);
              const toSocketId =
                tgtDef?.inputs?.[l[4]]?.id ||
                tgtRawNode?.inputs?.[l[4]]?.name ||
                String(l[4]);

              convertedConnections.push({
                id: `conn-imported-${idx}`,
                fromNodeId: `node-${l[1]}`,
                fromSocketId,
                toNodeId: `node-${l[3]}`,
                toSocketId,
                type: (l[5] || 'ANY') as any,
              });
            }
          });
        }

        const generatedFrame = synthesizeSpatialFrameFromNodes(convertedNodes);

        setImportSummary({
          nodesCount: convertedNodes.length,
          connectionsCount: convertedConnections.length,
          framesCount: 1,
          format: '原生 ComfyUI 工作流 (已转换适配 + 自动生成取景框)',
        });

        return {
          nodes: convertedNodes,
          connections: convertedConnections,
          spatialFrames: [generatedFrame],
        };
      }

      // Format 3: ComfyUI API Prompt format ({ "3": { "class_type": "KSampler", "inputs": {...} } })
      const keys = Object.keys(parsed);
      const isApiPrompt = keys.length > 0 && typeof parsed[keys[0]] === 'object' && parsed[keys[0]].class_type;
      if (isApiPrompt) {
        const convertedNodes: NodeInstance[] = [];
        const convertedConnections: Connection[] = [];
        let posX = 100;
        let posY = 100;

        keys.forEach((nodeKey, i) => {
          const item = parsed[nodeKey];
          const nodeId = `node-${nodeKey}`;
          const inputsObj = item.inputs || {};
          const values: Record<string, any> = {};
          const def = NODE_DEFINITIONS[item.class_type];

          Object.keys(inputsObj).forEach((inputKey) => {
            const val = inputsObj[inputKey];
            if (Array.isArray(val) && val.length === 2) {
              // Connection: [source_node_id, source_output_index]
              const sourceNodeItem = parsed[val[0]];
              const srcDef = sourceNodeItem ? NODE_DEFINITIONS[sourceNodeItem.class_type] : null;
              const fromSocketId = srcDef?.outputs?.[val[1]]?.id || String(val[1]);

              convertedConnections.push({
                id: `conn-api-${convertedConnections.length}`,
                fromNodeId: `node-${val[0]}`,
                fromSocketId,
                toNodeId: nodeId,
                toSocketId: inputKey,
                type: 'ANY',
              });
            } else {
              values[inputKey] = val;
            }
          });

          convertedNodes.push({
            id: nodeId,
            type: item.class_type,
            title: def ? `${def.title} (#${nodeKey})` : `${item.class_type} (#${nodeKey})`,
            pos: { x: posX + (i % 4) * 340, y: posY + Math.floor(i / 4) * 280 },
            width: 300,
            inputs: def ? def.inputs : [],
            outputs: def ? def.outputs : [],
            values,
          });
        });

        const generatedFrame = synthesizeSpatialFrameFromNodes(convertedNodes);

        setImportSummary({
          nodesCount: convertedNodes.length,
          connectionsCount: convertedConnections.length,
          framesCount: 1,
          format: 'ComfyUI API Prompt 格式 (已解析转换为节点 + 自动生成取景框)',
        });

        return {
          nodes: convertedNodes,
          connections: convertedConnections,
          spatialFrames: [generatedFrame],
        };
      }

      throw new Error('未识别的工作流 JSON 结构，请确认文件是否来自 ComfyUI 或 ComfyCanvas');
    } catch (err: any) {
      setImportError(err.message || 'JSON 解析失败');
      setImportSummary(null);
      return null;
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      setPastedJson(text);
      parseWorkflowJson(text);
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = () => {
    const data = parseWorkflowJson(pastedJson);
    if (data) {
      onImportWorkflowData(data);
      onClose();
    }
  };

  // Export
  const handleExportComfyCanvas = () => {
    const data = {
      nodes: currentNodes,
      connections: currentConnections,
      spatialFrames: currentSpatialFrames,
      exportedAt: new Date().toISOString(),
      generator: 'ComfyCanvas Studio',
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comfycanvas_workflow_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportComfyUI = () => {
    // Generate native ComfyUI compatible links & nodes format
    const comfyData = {
      last_node_id: currentNodes.length + 10,
      last_link_id: currentConnections.length + 10,
      nodes: currentNodes.map((n, idx) => ({
        id: idx + 1,
        type: n.type,
        pos: [n.pos.x, n.pos.y],
        size: [n.width || 300, 200],
        flags: {},
        order: idx,
        mode: 0,
        inputs: n.inputs.map((inp) => ({ name: inp.name, type: inp.type, link: null })),
        outputs: n.outputs.map((out) => ({ name: out.name, type: out.type, links: [] })),
        properties: { 'Node name for S&R': n.type },
        widgets_values: Object.values(n.values || {}),
      })),
      links: currentConnections.map((c, idx) => [
        idx + 1,
        1, // source
        0, // source slot
        2, // target
        0, // target slot
        c.type,
      ]),
      groups: [],
      config: {},
      extra: {
        spatialFrames: currentSpatialFrames,
      },
      version: 0.4,
    };

    const blob = new Blob([JSON.stringify(comfyData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comfyui_native_workflow_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
      <div className="bg-[#15161c] border border-[#2b2d3a] rounded-2xl w-full max-w-5xl h-[88vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#252733] bg-[#111216] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-white tracking-wide">
                  工作流与热门模型中心
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  Presets & Workflow Hub
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                预设热门大模型与 LoRA 连线组合，支持一键载入、导入/导出 JSON 及清空画布
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-[#22242e] hover:bg-[#2c2e3b] text-slate-400 hover:text-white text-xs font-semibold transition-colors"
            >
              关闭 (Esc)
            </button>
          </div>
        </div>

        {/* Tab Navigation Ribbon */}
        <div className="px-6 py-2.5 bg-[#171820] border-b border-[#242632] flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('presets')}
              className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all ${
                activeTab === 'presets'
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-[#22242e]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>🔥 热门工作流预设 ({WORKFLOW_PRESETS.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('civitai-extract')}
              className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all ${
                activeTab === 'civitai-extract'
                  ? 'bg-gradient-to-r from-pink-500 to-rose-600 text-white shadow-md shadow-pink-500/20'
                  : 'text-slate-400 hover:text-pink-300 hover:bg-[#22242e]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-pink-400" />
              <span>✨ Civitai 一键生成工作流</span>
            </button>

            <button
              onClick={() => setActiveTab('import')}
              className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all ${
                activeTab === 'import'
                  ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-md shadow-purple-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-[#22242e]'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>📥 导入工作流 JSON</span>
            </button>

            <button
              onClick={() => setActiveTab('export')}
              className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all ${
                activeTab === 'export'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-[#22242e]'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>📤 导出当前工作流</span>
            </button>

            <button
              onClick={() => setActiveTab('clear')}
              className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all ${
                activeTab === 'clear'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-rose-400 hover:bg-rose-950/20'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>🗑️ 一键清空画布</span>
            </button>
          </div>

          <div className="text-[11px] text-slate-400 font-mono hidden md:block">
            当前画布: <span className="text-cyan-400 font-bold">{currentNodes.length}</span> 节点 ·{' '}
            <span className="text-cyan-400 font-bold">{currentConnections.length}</span> 连线 ·{' '}
            <span className="text-cyan-400 font-bold">{currentSpatialFrames.length}</span> 取景框
          </div>
        </div>

        {/* Modal Main Content Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#0f1014]">
          {/* TAB 1: 热门工作流预设 */}
          {activeTab === 'presets' && (
            <div className="space-y-6">
              {/* Category Pills & Search Bar */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                        selectedCategory === cat
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          : 'bg-[#1a1c24] text-slate-400 hover:text-white hover:bg-[#242632]'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="relative w-full md:w-64 shrink-0">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜索工作流、LoRA、大模型..."
                    className="w-full bg-[#181921] border border-[#2b2d39] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>
              </div>

              {/* Presets Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredPresets.map((preset) => {
                  const frame = preset.spatialFrames?.[0];
                  const checkpoint =
                    frame?.params.checkpoint ||
                    (preset.nodes.find((n) => n.type === 'CheckpointLoaderSimple')?.values.ckpt_name as string) ||
                    'FLUX / SDXL';

                  return (
                    <div
                      key={preset.id}
                      className="bg-[#171822] border border-[#262835] hover:border-cyan-500/60 rounded-2xl overflow-hidden flex flex-col shadow-xl transition-all group"
                    >
                      {/* Preset Cover Banner */}
                      <div className="relative h-44 bg-[#0d0e13] overflow-hidden">
                        {preset.previewImage ? (
                          <img
                            src={preset.previewImage}
                            alt={preset.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-600">
                            <Sparkles className="w-8 h-8 text-cyan-500/40" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-[#171822] via-[#171822]/40 to-transparent" />

                        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 backdrop-blur-md">
                            {preset.category}
                          </span>
                        </div>

                        <div className="absolute top-3 right-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-purple-950/80 text-purple-300 border border-purple-800/60 backdrop-blur-md">
                            {preset.provider}
                          </span>
                        </div>

                        <div className="absolute bottom-2.5 left-3 right-3">
                          <h3 className="text-sm font-bold text-white leading-tight line-clamp-1">
                            {preset.name}
                          </h3>
                        </div>
                      </div>

                      {/* Preset Details Body */}
                      <div className="p-4 flex-1 flex flex-col justify-between space-y-3 text-xs">
                        <p className="text-slate-400 text-[11px] leading-relaxed line-clamp-2">
                          {preset.description}
                        </p>

                        {/* Model & LoRA Highlights */}
                        <div className="space-y-1.5 bg-[#121319] p-2.5 rounded-xl border border-[#22242f]">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-400 flex items-center gap-1 font-mono">
                              <Cpu className="w-3 h-3 text-cyan-400" />
                              <span>底模:</span>
                            </span>
                            <span className="text-white font-mono font-semibold truncate max-w-[170px]" title={checkpoint}>
                              {checkpoint.split('/').pop()}
                            </span>
                          </div>

                          {preset.loraNames && preset.loraNames.length > 0 && (
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-400 flex items-center gap-1 font-mono">
                                <Sparkles className="w-3 h-3 text-purple-400" />
                                <span>LoRA:</span>
                              </span>
                              <div className="flex flex-wrap justify-end gap-1">
                                {preset.loraNames.map((l, i) => (
                                  <span
                                    key={i}
                                    className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-900/40 text-purple-300 border border-purple-700/40 truncate max-w-[160px]"
                                    title={l}
                                  >
                                    {l.replace('.safetensors', '')}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {frame?.params && (
                            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-1 border-t border-[#1d1f2b]">
                              <span>
                                {frame.params.width}×{frame.params.height}
                              </span>
                              <span>
                                {frame.params.steps}步 · CFG {frame.params.cfg}
                              </span>
                              <span>{frame.params.sampler}</span>
                            </div>
                          )}

                          {preset.otherMetadata && (
                            <div className="flex items-center justify-between text-[10px] font-mono px-2 py-1 rounded bg-[#161822] border border-[#27293b] text-cyan-300 pt-1">
                              <span className="flex items-center gap-1 font-semibold text-emerald-400">
                                <Database className="w-2.5 h-2.5" />
                                <span>底模: {preset.otherMetadata.baseModel}</span>
                              </span>
                              <span>{preset.otherMetadata.sampler} · {preset.otherMetadata.steps}步</span>
                              <span className="text-purple-300 font-bold">{preset.otherMetadata.resolution}</span>
                            </div>
                          )}
                        </div>

                        {/* Tags */}
                        {preset.tags && (
                          <div className="flex flex-wrap gap-1">
                            {preset.tags.map((tag, i) => (
                              <span
                                key={i}
                                className="px-1.5 py-0.5 rounded text-[10px] bg-[#222430] text-slate-300 border border-[#2e3140]"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="pt-2 border-t border-[#232532] flex items-center gap-2">
                          {onLoadAndRunPreset && (
                            <button
                              onClick={() => {
                                onLoadAndRunPreset(preset);
                                onClose();
                              }}
                              className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/25 active:scale-95 transition-all ring-1 ring-emerald-400/40"
                              title="一键载入画布并立即运行工作流出片"
                            >
                              <Play className="w-3.5 h-3.5 fill-white" />
                              <span>⚡ 载入并立即运行</span>
                            </button>
                          )}

                          <button
                            onClick={() => {
                              onLoadPreset(preset, 'replace');
                              onClose();
                            }}
                            className={`${onLoadAndRunPreset ? 'px-3' : 'flex-1'} py-2 rounded-xl bg-[#222430] hover:bg-[#2d3040] text-slate-200 hover:text-white border border-[#313444] font-semibold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all`}
                            title="清空当前画布并载入此工作流"
                          >
                            <Play className="w-3.5 h-3.5 fill-cyan-400" />
                            <span>{onLoadAndRunPreset ? '仅载入' : '载入画布 (覆盖)'}</span>
                          </button>

                          <button
                            onClick={() => {
                              onLoadPreset(preset, 'append');
                              onClose();
                            }}
                            className="p-2 rounded-xl bg-[#222430] hover:bg-[#2d3040] text-slate-300 hover:text-white border border-[#313444] transition-colors"
                            title="追加合并到当前画布，不覆盖已有内容"
                          >
                            <Plus className="w-4 h-4 text-cyan-400" />
                          </button>

                          <button
                            onClick={() => handleCopyPrompt(preset)}
                            className="p-2 rounded-xl bg-[#222430] hover:bg-[#2d3040] text-slate-300 hover:text-white border border-[#313444] transition-colors"
                            title="复制正向提示词与触发词"
                          >
                            {copiedId === preset.id ? (
                              <Check className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <Copy className="w-4 h-4 text-slate-400" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 1.5: Civitai 一键生成工作流 */}
          {activeTab === 'civitai-extract' && (
            <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-200">
              <div className="bg-[#171822] border border-[#2b2d3c] rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-pink-500 to-rose-600 flex items-center justify-center text-white shadow-lg shadow-pink-500/20">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      Civitai 热门图片/模型 ➔ 一键逆向提取工作流
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-pink-500/10 text-pink-400 border border-pink-500/20">
                        智能连线解析
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      输入 Civitai 任意热门作品链接 (如 https://civitai.red/images/136947637) 或模型链接，系统自动抽取 Checkpoint 底模、LoRA 权重与触发词、正负向 Prompt、KSampler 采样参数并组装完整 ComfyUI 连线！
                    </p>
                  </div>
                </div>

                {/* Quick Recommendation Pills */}
                <div className="space-y-2 pt-1">
                  <span className="text-[11px] text-slate-400 font-semibold flex items-center justify-between">
                    <span>hinablue 原作与热门图片预设快捷填入:</span>
                    <span className="text-[10px] text-pink-400 font-mono">点击即填并自动解析</span>
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        const val = 'https://civitai.red/images/136947637';
                        setCivitaiUrlInput(val);
                        handleExtractCivitaiWorkflow(val, selectedEngine);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-pink-950/50 hover:bg-pink-900/60 text-pink-300 border border-pink-700/60 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm ring-1 ring-pink-500/20"
                    >
                      <span>🔥 hinablue - AsianMix LoRA (#136947637 · Krea 2 Turbo)</span>
                    </button>

                    <button
                      onClick={() => {
                        const val = 'https://civitai.red/images/134923610';
                        setCivitaiUrlInput(val);
                        handleExtractCivitaiWorkflow(val, selectedEngine);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-indigo-950/50 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-700/60 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm ring-1 ring-indigo-500/20"
                    >
                      <span>✨ AIImageStudio - Radiance Chrome (#134923610 · 逆光胶片)</span>
                    </button>

                    <button
                      onClick={() => {
                        const val = 'https://civitai.red/images/143279135';
                        setCivitaiUrlInput(val);
                        handleExtractCivitaiWorkflow(val, 'video');
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-700/60 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm ring-1 ring-rose-500/20"
                    >
                      <span>🎬 arpalest - SoftBreastMotion (#143279135 · MiniMax 视频)</span>
                    </button>

                    <button
                      onClick={() => {
                        const val = 'https://civitai.com/images/102508931';
                        setCivitaiUrlInput(val);
                        handleExtractCivitaiWorkflow(val, selectedEngine);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-cyan-950/40 hover:bg-cyan-900/50 text-cyan-300 border border-cyan-700/50 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <span>⭐ hinablue - 9527 Detail Realistic XL</span>
                    </button>

                    <button
                      onClick={() => {
                        const val = 'https://civitai.com/images/142524199';
                        setCivitaiUrlInput(val);
                        handleExtractCivitaiWorkflow(val, selectedEngine);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 border border-emerald-700/50 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <span>📸 hinablue - 2758 FLUX 胶片街拍人文</span>
                    </button>

                    <button
                      onClick={() => {
                        const val = `asian woman, 1girl, close up portrait, beautiful detailed eyes, natural skin texture, realistic lighting, shallow depth of field, 35mm film photography, masterpiece, sharp focus, 8k <lora:hina_Krea2Turbo_asianMix_v5.0-TQD-CPO:0.85>
Negative prompt: blurry, bad anatomy, deformed fingers, low resolution, poorly drawn face, plastic skin, oversaturated
Steps: 28, Sampler: DPM++ 2M Karras, CFG scale: 4.5, Seed: 136947637, Size: 1024x1024, Model: flux1-dev`;
                        setCivitaiUrlInput(val);
                        handleExtractCivitaiWorkflow(val, selectedEngine);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-blue-950/40 hover:bg-blue-900/50 text-blue-300 border border-blue-700/50 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <span>📋 填入 WebUI/Civitai 生图参数文本样例</span>
                    </button>
                  </div>
                </div>

                {/* Target Engine Selection Control */}
                <div className="space-y-1.5 pt-2 border-t border-[#232533]">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                      <span>选择目标执行引擎 (Target Execution Engine):</span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        (Civitai 帖子默认推荐使用 Civitai 官方原生引擎，完美适配底模与全量 LoRA)
                      </span>
                    </label>
                    <span className="text-[11px] font-mono text-cyan-400">
                      {selectedEngine === 'civitai' && '🌟 Civitai 官方原生生成引擎 (最优适配)'}
                      {selectedEngine === 'fal' && '⚡ Fal.ai 极速云引擎 (官方端点)'}
                      {selectedEngine === 'tensorart' && '🎨 Tensor.Art 官方原生引擎 (OpenWorks)'}
                      {selectedEngine === 'nanogpt' && '🟢 NanoGPT 极速生图引擎 (按需即付)'}
                      {selectedEngine === 'video' && '🎬 AI Video 视频引擎 (MiniMax / Wan 2.1)'}
                      {selectedEngine === 'agnes' && '🚀 Agnes AI 2.5 Flash 极速生图'}
                      {selectedEngine === 'sensenova' && '🧠 SenseNova 日日新 CoT 引擎'}
                      {selectedEngine === 'modelscope' && '🌌 ModelScope 魔搭社区'}
                      {selectedEngine === 'huggingface' && '🤗 Hugging Face Diffusers'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                    {[
                      {
                        id: 'civitai',
                        name: 'Civitai 原生引擎',
                        badge: '最优适配',
                        badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
                        desc: '100% 原生直连 C 站算力，Krea 2 Turbo、MiniMax 与全量 LoRA 零转译出片',
                        activeBorder: 'border-blue-500 bg-blue-950/30 text-white',
                      },
                      {
                        id: 'fal',
                        name: 'Fal.ai 极速引擎',
                        badge: '云端端点',
                        badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
                        desc: '官方 Fal 端点 (Krea 闭源端点无法挂载 safetensors 时自动匹配兼容 SDXL 底模)',
                        activeBorder: 'border-purple-500 bg-purple-950/30 text-white',
                      },
                      {
                        id: 'tensorart',
                        name: 'Tensor.Art 吐司',
                        badge: '原生云端模型',
                        badgeColor: 'bg-purple-600/20 text-purple-300 border-purple-500/30',
                        desc: '直连 Tensor.Art / 吐司 AI 模型中心，FLUX.1、SDXL、Pony、Illustrious 原生云端解算',
                        activeBorder: 'border-purple-500 bg-purple-950/30 text-white',
                      },
                      {
                        id: 'nanogpt',
                        name: 'NanoGPT 极速',
                        badge: '239+ 现货',
                        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
                        desc: '直连 NanoGPT 按需推理引擎，FLUX.1、Qwen Image 2.1、SDXL 极速按次即付',
                        activeBorder: 'border-emerald-500 bg-emerald-950/30 text-white',
                      },
                      {
                        id: 'video',
                        name: 'AI Video 视频',
                        badge: '电影运镜',
                        badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
                        desc: '自动生成 AIVideoNode，直连 MiniMax H3 / Wan 2.1 电影级动态动作视频通道',
                        activeBorder: 'border-rose-500 bg-rose-950/30 text-white',
                      },
                      {
                        id: 'agnes',
                        name: 'Agnes AI 极速',
                        badge: '2.5 Flash',
                        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
                        desc: '秒级极速生图通道，自动适配极速画质与自然语言提示词',
                        activeBorder: 'border-emerald-500 bg-emerald-950/30 text-white',
                      },
                      {
                        id: 'sensenova',
                        name: 'SenseNova 日日新',
                        badge: 'CoT 推理',
                        badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
                        desc: '商汤大模型思维链与深度推理增强，呈现电影级空间构图',
                        activeBorder: 'border-amber-500 bg-amber-950/30 text-white',
                      },
                      {
                        id: 'modelscope',
                        name: 'ModelScope 魔搭',
                        badge: '阿里万相',
                        badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
                        desc: '阿里通义万相 Wan 2.1 开源生态与中文大模型直连',
                        activeBorder: 'border-cyan-500 bg-cyan-950/30 text-white',
                      },
                      {
                        id: 'huggingface',
                        name: 'Hugging Face',
                        badge: 'Diffusers',
                        badgeColor: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
                        desc: '开源社区 Diffusers 拓扑，全球海量开源权重直挂',
                        activeBorder: 'border-slate-400 bg-slate-800/40 text-white',
                      },
                    ].map((eng) => {
                      const isSelected = selectedEngine === eng.id;
                      return (
                        <button
                          key={eng.id}
                          type="button"
                          onClick={() => {
                            setSelectedEngine(eng.id as any);
                            if (extractedPreset) {
                              handleExtractCivitaiWorkflow(civitaiUrlInput, eng.id as any);
                            }
                          }}
                          className={`p-2.5 rounded-xl border text-left transition-all ${
                            isSelected
                              ? `${eng.activeBorder} shadow-lg ring-1 ring-cyan-500/30`
                              : 'bg-[#13141a] border-[#252733] text-slate-400 hover:text-slate-200 hover:bg-[#191b24]'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs">{eng.name}</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono border ${eng.badgeColor}`}>
                              {eng.badge}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400/90 mt-1 line-clamp-1 leading-relaxed">
                            {eng.desc}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Input URL or Raw Text Box */}
                <div className="space-y-2 pt-2">
                  <div className="relative">
                    <textarea
                      rows={civitaiUrlInput.includes('\n') ? 4 : 2}
                      value={civitaiUrlInput}
                      onChange={(e) => setCivitaiUrlInput(e.target.value)}
                      placeholder="粘贴 Civitai 图片链接 (如 https://civitai.red/images/136947637)、图号、模型链接，或直接粘贴整段从 C 站复制的生图参数文本..."
                      className="w-full bg-[#111216] border border-[#2e3142] focus:border-pink-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono transition-colors resize-y"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">
                      💡 支持自动识别链接/图号或生图元数据，自动剥离提取 LoRA、底模、Prompt 并生成连线
                    </span>
                    <button
                      onClick={() => handleExtractCivitaiWorkflow()}
                      disabled={isExtractingCivitai || !civitaiUrlInput.trim()}
                      className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-pink-600/20 transition-all shrink-0 active:scale-95"
                    >
                      {isExtractingCivitai ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>正在逆向解析元数据...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span>一键解析并生成工作流</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {civitaiExtractError && (
                  <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-800/40 text-rose-300 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{civitaiExtractError}</span>
                  </div>
                )}

                {/* Extraction Result Preview Card */}
                {extractedPreset && (
                  <div className="mt-4 pt-4 border-t border-[#262837] space-y-4 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        工作流逆向解析成功！已提取完整节点拓扑与参数：
                      </span>
                    </div>

                    <div className="bg-[#111217] border border-[#2b2d3d] rounded-xl p-4 flex flex-col md:flex-row gap-4">
                      {/* Image Preview */}
                      {extractedPreset.previewImage && (
                        <div className="w-full md:w-48 h-48 rounded-lg overflow-hidden shrink-0 border border-[#303344] bg-black">
                          <img
                            src={extractedPreset.previewImage}
                            alt={extractedPreset.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}

                      {/* Details */}
                      <div className="flex-1 space-y-2 text-xs">
                        <h4 className="font-extrabold text-white text-sm">
                          {extractedPreset.name}
                        </h4>
                        <p className="text-slate-400 text-[11px] leading-relaxed">
                          {extractedPreset.description}
                        </p>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
                          <div className="bg-[#1b1c26] p-2 rounded-lg border border-[#262838]">
                            <span className="text-slate-500 block text-[10px]">节点与连线</span>
                            <span className="text-cyan-300 font-bold">
                              {extractedPreset.nodes.length} 节点 · {extractedPreset.connections.length} 线缆
                            </span>
                          </div>

                          <div className="bg-[#1b1c26] p-2 rounded-lg border border-[#262838]">
                            <span className="text-slate-500 block text-[10px]">挂载 LoRA</span>
                            <span className="text-purple-300 font-bold truncate block" title={extractedPreset.loraNames?.[0]}>
                              {extractedPreset.loraNames?.[0] || '基础模型'}
                            </span>
                          </div>

                          <div className="bg-[#1b1c26] p-2 rounded-lg border border-[#262838]">
                            <span className="text-slate-500 block text-[10px]">执行引擎</span>
                            <span className="text-emerald-300 font-bold">
                              {extractedPreset.provider}
                            </span>
                          </div>
                        </div>

                        {/* Quick Engine Switcher inside Preview Card */}
                        <div className="bg-[#181924] p-2 rounded-xl border border-[#27293a] flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1">
                            <RotateCcw className="w-3 h-3 text-cyan-400" />
                            <span>随时切换引擎重生成节点:</span>
                          </span>
                          {[
                            { id: 'civitai', label: '🌟 Civitai 原生' },
                            { id: 'tensorart', label: '🎨 Tensor.Art' },
                            { id: 'fal', label: '⚡ Fal.ai' },
                            { id: 'video', label: '🎬 AI Video' },
                            { id: 'agnes', label: '🚀 Agnes' },
                            { id: 'sensenova', label: '🧠 SenseNova' },
                            { id: 'modelscope', label: '🌌 魔搭' },
                            { id: 'huggingface', label: '🤗 Hugging Face' },
                          ].map((e) => (
                            <button
                              key={e.id}
                              type="button"
                              onClick={() => {
                                setSelectedEngine(e.id as any);
                                handleExtractCivitaiWorkflow(civitaiUrlInput, e.id as any);
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all ${
                                selectedEngine === e.id
                                  ? 'bg-cyan-600 text-white font-bold ring-1 ring-cyan-400'
                                  : 'bg-[#222432] text-slate-400 hover:text-white hover:bg-[#2b2d3d]'
                              }`}
                            >
                              {e.label}
                            </button>
                          ))}
                        </div>

                        {/* Architecture & Endpoint Explanation Callout */}
                        {extractedPreset.architectureExplanation && (
                          <div className="bg-amber-950/20 border border-amber-800/40 rounded-lg p-2.5 space-y-1">
                            <span className="text-[10px] text-amber-400 font-semibold flex items-center gap-1">
                              <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              架构与端点智能校验透明说明:
                            </span>
                            <p className="text-[11px] text-amber-200/90 leading-relaxed font-mono">
                              {extractedPreset.architectureExplanation}
                            </p>
                          </div>
                        )}

                        {/* Other metadata (Civitai Authentic Metadata Inspection Panel) */}
                        {extractedPreset.otherMetadata && (
                          <div className="bg-[#14151e] border border-[#2d3042] rounded-xl overflow-hidden shadow-sm">
                            <button
                              type="button"
                              onClick={() => setShowOtherMetadata(!showOtherMetadata)}
                              className="w-full px-3 py-2 bg-[#1b1c28] hover:bg-[#202230] border-b border-[#282a3c] flex items-center justify-between text-left transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <Database className="w-3.5 h-3.5 text-cyan-400" />
                                <span className="text-xs font-bold text-white">Other metadata (C 站生图原始完整元数据)</span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-300 font-mono border border-emerald-500/20">
                                  全字段精准对齐 · 拒绝错配
                                </span>
                              </div>
                              <span className="text-[11px] text-slate-400 font-mono">
                                {showOtherMetadata ? '收起 ▲' : '展开 ▼'}
                              </span>
                            </button>

                            {showOtherMetadata && (
                              <div className="p-3 text-[11px] font-mono grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#12131a]">
                                <div className="bg-[#181924] p-2 rounded-lg border border-[#232535]">
                                  <span className="text-slate-500 block text-[10px]">Base Model (官方底模)</span>
                                  <span className="text-emerald-400 font-bold">{extractedPreset.otherMetadata.baseModel || '原生底层架构'}</span>
                                </div>
                                <div className="bg-[#181924] p-2 rounded-lg border border-[#232535]">
                                  <span className="text-slate-500 block text-[10px]">Model File (模型权重文件)</span>
                                  <span className="text-cyan-300 font-bold truncate block" title={extractedPreset.otherMetadata.modelFile}>
                                    {extractedPreset.otherMetadata.modelFile || '原生模型文件'}
                                  </span>
                                </div>
                                <div className="bg-[#181924] p-2 rounded-lg border border-[#232535]">
                                  <span className="text-slate-500 block text-[10px]">Sampler & Scheduler</span>
                                  <span className="text-amber-300 font-bold">{extractedPreset.otherMetadata.sampler} · {extractedPreset.otherMetadata.scheduler}</span>
                                </div>
                                <div className="bg-[#181924] p-2 rounded-lg border border-[#232535]">
                                  <span className="text-slate-500 block text-[10px]">Steps & CFG & Denoise</span>
                                  <span className="text-purple-300 font-bold">{extractedPreset.otherMetadata.steps}步 · CFG {extractedPreset.otherMetadata.cfgScale} · 降噪 {extractedPreset.otherMetadata.denoise}</span>
                                </div>
                                <div className="bg-[#181924] p-2 rounded-lg border border-[#232535]">
                                  <span className="text-slate-500 block text-[10px]">Resolution (画幅宽高)</span>
                                  <span className="text-blue-300 font-bold">{extractedPreset.otherMetadata.resolution}</span>
                                </div>
                                <div className="bg-[#181924] p-2 rounded-lg border border-[#232535]">
                                  <span className="text-slate-500 block text-[10px]">Seed (随机种子)</span>
                                  <span className="text-slate-300 font-bold">{extractedPreset.otherMetadata.seed}</span>
                                </div>
                                <div className="bg-[#181924] p-2 rounded-lg border border-[#232535]">
                                  <span className="text-slate-500 block text-[10px]">VAE</span>
                                  <span className="text-indigo-300 font-bold truncate block" title={extractedPreset.otherMetadata.vae}>
                                    {extractedPreset.otherMetadata.vae || 'qwen_image_vae.safetensors'}
                                  </span>
                                </div>
                                <div className="bg-[#181924] p-2 rounded-lg border border-[#232535]">
                                  <span className="text-slate-500 block text-[10px]">Engine & Media</span>
                                  <span className="text-rose-300 font-bold">
                                    {extractedPreset.otherMetadata.engine} ({extractedPreset.otherMetadata.mediaType === 'video' ? `视频 ${extractedPreset.otherMetadata.duration}s` : '图像'})
                                  </span>
                                </div>

                                {extractedPreset.otherMetadata.resources && extractedPreset.otherMetadata.resources.length > 0 && (
                                  <div className="col-span-2 sm:col-span-4 bg-[#181924] p-2.5 rounded-lg border border-[#232535] space-y-1">
                                    <span className="text-slate-500 block text-[10px]">挂载 LoRA 资源列表 (Resources & Weights):</span>
                                    <div className="flex flex-wrap gap-2">
                                      {extractedPreset.otherMetadata.resources.map((res: any, idx: number) => (
                                        <div key={idx} className="px-2.5 py-1 rounded bg-[#202230] border border-[#2c2f42] text-[11px] text-purple-300 flex items-center gap-2">
                                          <span className="font-bold">{res.name}</span>
                                          {res.fileName && res.fileName !== res.name && (
                                            <span className="text-[10px] text-slate-400 font-mono">({res.fileName})</span>
                                          )}
                                          {res.versionId && (
                                            <span className="text-[10px] px-1 py-0.2 rounded bg-purple-950/60 text-purple-400 font-mono">ID: {res.versionId}</span>
                                          )}
                                          <span className="text-amber-400 font-bold">权重: {res.strength}</span>
                                          <span className="text-emerald-400 text-[10px]">底模: {res.baseModel}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Prompt preview */}
                        {extractedPreset.spatialFrames?.[0]?.prompt && (
                          <div className="bg-[#181922] p-2.5 rounded-lg border border-[#282a39] space-y-1">
                            <span className="text-[10px] text-amber-400 font-semibold block">提取的正向提示词 (Positive Prompt):</span>
                            <p className="text-slate-300 text-[11px] line-clamp-2 italic">
                              "{extractedPreset.spatialFrames[0].prompt}"
                            </p>
                          </div>
                        )}

                        {/* Buttons to load onto canvas */}
                        <div className="pt-2 flex flex-wrap items-center gap-2">
                          {onLoadAndRunPreset && (
                            <button
                              onClick={() => {
                                onLoadAndRunPreset(extractedPreset);
                                onClose();
                              }}
                              className="flex-1 min-w-[200px] py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 active:scale-95 transition-all ring-1 ring-emerald-400/40"
                              title="一键将逆向解析出的完整连线载入画布，并立即执行云端扩散生图！"
                            >
                              <Play className="w-4 h-4 fill-white" />
                              <span>⚡ 载入并立即运行出片</span>
                            </button>
                          )}

                          <button
                            onClick={() => {
                              onLoadPreset(extractedPreset, 'replace');
                              onClose();
                            }}
                            className="py-2.5 px-4 rounded-xl bg-[#222432] hover:bg-[#2c2f42] text-slate-200 hover:text-white border border-[#34384e] font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <span>覆盖载入</span>
                          </button>

                          <button
                            onClick={() => {
                              onLoadPreset(extractedPreset, 'append');
                              onClose();
                            }}
                            className="py-2.5 px-3 rounded-xl bg-[#222432] hover:bg-[#2c2f42] text-slate-200 hover:text-white border border-[#34384e] font-semibold text-xs flex items-center gap-1.5 transition-colors"
                            title="追加到画布"
                          >
                            <Plus className="w-3.5 h-3.5 text-cyan-400" />
                            <span>追加</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: 导入工作流 */}
          {activeTab === 'import' && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="bg-[#171822] border border-[#2b2d3c] rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">导入外部工作流文件</h3>
                    <p className="text-xs text-slate-400">
                      支持拖拽上传 ComfyUI 官方导出的 .json 文件、API Prompt 字典或 ComfyCanvas 格式
                    </p>
                  </div>
                </div>

                {/* Drag and Drop Zone */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (evt) => {
                        const text = evt.target?.result as string;
                        setPastedJson(text);
                        parseWorkflowJson(text);
                      };
                      reader.readAsText(file);
                    }
                  }}
                  className="border-2 border-dashed border-[#34384b] hover:border-purple-500/60 rounded-xl p-8 text-center cursor-pointer hover:bg-purple-950/10 transition-colors space-y-3"
                >
                  <FileCode className="w-10 h-10 text-purple-400/80 mx-auto" />
                  <div>
                    <p className="text-sm font-semibold text-slate-200">
                      点击选择或拖拽 .json 工作流文件到此处
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      支持原生 ComfyUI、ComfyUI API 格式、ComfyCanvas 工程
                    </p>
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".json"
                    className="hidden"
                  />
                </div>

                {/* Paste JSON Textarea */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>或直接粘贴 JSON 字符串:</span>
                    {pastedJson && (
                      <button
                        onClick={() => {
                          setPastedJson('');
                          setImportSummary(null);
                          setImportError(null);
                        }}
                        className="text-slate-500 hover:text-slate-300"
                      >
                        清空文本
                      </button>
                    )}
                  </div>
                  <textarea
                    rows={6}
                    value={pastedJson}
                    onChange={(e) => {
                      setPastedJson(e.target.value);
                      if (e.target.value.trim()) {
                        parseWorkflowJson(e.target.value);
                      } else {
                        setImportSummary(null);
                        setImportError(null);
                      }
                    }}
                    placeholder='在此粘贴 {"nodes": [...], "links": [...]} 或 ComfyUI API JSON 格式代码...'
                    className="w-full bg-[#101116] border border-[#2b2d39] rounded-xl p-3 text-xs text-white placeholder-slate-600 outline-none focus:border-purple-500 font-mono resize-none leading-relaxed"
                  />
                </div>

                {/* Parse Result Summary */}
                {importSummary && (
                  <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-800/40 text-xs space-y-2 text-purple-200 animate-in fade-in">
                    <div className="flex items-center justify-between font-bold">
                      <span className="flex items-center gap-1.5 text-purple-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>检测到有效工作流: {importSummary.format}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-slate-300 font-mono text-[11px]">
                      <span>节点数量: {importSummary.nodesCount}</span>
                      <span>连线关系: {importSummary.connectionsCount}</span>
                      {importSummary.framesCount > 0 && (
                        <span>空间取景框: {importSummary.framesCount}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Error message */}
                {importError && (
                  <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/50 text-xs text-rose-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{importError}</span>
                  </div>
                )}

                {/* Confirm Import Button */}
                <button
                  onClick={handleConfirmImport}
                  disabled={!importSummary}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-purple-600/25 transition-all"
                >
                  <Upload className="w-4 h-4" />
                  <span>确认载入并呈现在画布中</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: 导出工作流 */}
          {activeTab === 'export' && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="bg-[#171822] border border-[#2b2d3c] rounded-2xl p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
                    <Download className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">导出当前画布与工作流</h3>
                    <p className="text-xs text-slate-400">
                      将当前正在编辑的节点连线、ComfyUI 核心参数和空间取景框保存为本地 JSON 文件
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Export ComfyCanvas */}
                  <div className="p-4 bg-[#121318] border border-[#252834] rounded-xl flex flex-col justify-between space-y-3">
                    <div>
                      <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-cyan-400" />
                        <span>ComfyCanvas 完整工程</span>
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-1">
                        包含无限空间取景框、提示词、LoRA堆叠、KSampler参数及节点拓扑，完整保留一切状态。
                      </p>
                    </div>
                    <button
                      onClick={handleExportComfyCanvas}
                      className="w-full py-2 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-cyan-600/20 transition-all"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>导出 .json 工程</span>
                    </button>
                  </div>

                  {/* Export ComfyUI standard */}
                  <div className="p-4 bg-[#121318] border border-[#252834] rounded-xl flex flex-col justify-between space-y-3">
                    <div>
                      <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-purple-400" />
                        <span>标准 ComfyUI 工作流</span>
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-1">
                        转换为原生 ComfyUI 能够直接拖拽打开的 nodes/links 标准规范 JSON。
                      </p>
                    </div>
                    <button
                      onClick={handleExportComfyUI}
                      className="w-full py-2 px-3 rounded-lg bg-[#272935] hover:bg-[#323545] text-slate-200 hover:text-white font-semibold text-xs flex items-center justify-center gap-1.5 border border-[#3b3e52] transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>导出 ComfyUI 规范</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: 一键清空画布 */}
          {activeTab === 'clear' && (
            <div className="max-w-xl mx-auto space-y-6">
              <div className="bg-[#171822] border border-[#342429] rounded-2xl p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center">
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">一键清空与重置画布</h3>
                    <p className="text-xs text-slate-400">
                      请选择清空方式，操作将立即生效（如需保留当前成果，请先在“导出”页备份）
                    </p>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  {/* Option 1: Clear All */}
                  <div className="p-3.5 bg-[#14151a] border border-[#2b2d39] hover:border-rose-500/50 rounded-xl flex items-center justify-between transition-colors">
                    <div>
                      <div className="font-bold text-white text-xs">清空全部内容 (完全重置画布)</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        清除所有节点、连接线缆以及全部空间生成取景框
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        onClearCanvas('all');
                        onClose();
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-600/30 transition-all shrink-0"
                    >
                      彻底清空
                    </button>
                  </div>

                  {/* Option 2: Clear Only Frames */}
                  <div className="p-3.5 bg-[#14151a] border border-[#2b2d39] hover:border-amber-500/50 rounded-xl flex items-center justify-between transition-colors">
                    <div>
                      <div className="font-bold text-white text-xs">仅清空空间生成取景框</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        保留当前的 ComfyUI 节点连线流，仅移除空间取景框
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        onClearCanvas('frames');
                        onClose();
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-[#272935] hover:bg-[#343747] text-amber-300 font-bold text-xs border border-amber-500/30 transition-all shrink-0"
                    >
                      清空取景框
                    </button>
                  </div>

                  {/* Option 3: Clear Only Nodes */}
                  <div className="p-3.5 bg-[#14151a] border border-[#2b2d39] hover:border-purple-500/50 rounded-xl flex items-center justify-between transition-colors">
                    <div>
                      <div className="font-bold text-white text-xs">仅清空节点与连线</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        保留空间取景框，仅清除后端的节点图
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        onClearCanvas('nodes');
                        onClose();
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-[#272935] hover:bg-[#343747] text-purple-300 font-bold text-xs border border-purple-500/30 transition-all shrink-0"
                    >
                      清空节点
                    </button>
                  </div>

                  {/* Option 4: Reset to Default Preset */}
                  <div className="p-3.5 bg-[#14151a] border border-[#2b2d39] hover:border-cyan-500/50 rounded-xl flex items-center justify-between transition-colors">
                    <div>
                      <div className="font-bold text-white text-xs">恢复为官方推荐默认工作流</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        重新加载 FLUX.1 + 赛博朋克霓虹 LoRA 初始旗舰模板
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        onClearCanvas('reset-default');
                        onClose();
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-md shadow-cyan-600/30 transition-all shrink-0"
                    >
                      恢复默认预设
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
