import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AlertTriangle, Sparkles } from 'lucide-react';
import { Canvas } from './components/Canvas';
import { TopBar } from './components/TopBar';
import { ModernToolDock } from './components/ModernToolDock';
import { ParameterInspector } from './components/ParameterInspector';
import { Minimap } from './components/Minimap';
import { ModelHubModal } from './components/ModelHubModal';
import { BackendSettingsModal } from './components/BackendSettingsModal';
import { CivitaiModal } from './components/CivitaiModal';
import { HistoryModal } from './components/HistoryModal';
import { ComfyGuideModal } from './components/ComfyGuideModal';
import { WorkflowPresetsModal } from './components/WorkflowPresetsModal';
import { ProviderMatrixModal } from './components/ProviderMatrixModal';
import { CanvasManagerModal, CanvasProject } from './components/CanvasManagerModal';
import { AssetManagerModal, MediaAsset } from './components/AssetManagerModal';
import { ImageDetailModal } from './components/ImageDetailModal';
import {
  CanvasMode,
  CanvasTransform,
  ComfyParameters,
  Connection,
  NodeInstance,
  SpatialFrame,
  WorkflowPreset,
} from './types/graph';
import { ApiKeysState, GenerationHistoryItem } from './types/providers';
import { WORKFLOW_PRESETS } from './constants/presets';
import { NODE_DEFINITIONS } from './constants/nodes';
import { CategoryFilter } from './components/ModelHubModal';
import {
  fetchHistory,
  getStoredApiKeys,
  saveStoredApiKeys,
  saveToHistory,
} from './services/api';
import { EngineRegistry } from './engines/EngineRegistry';
import { NormalizedGenerateParams } from './engines/types';
import { executeWorkflow, extractWorkflowParameters, resolveTargetNode } from './utils/graphEngine';
import { applyAIVideoModelSelection } from './utils/videoProvider';
import { getRecommendedBaseModelForLora, identifyArchitectureFamily } from './utils/baseModelMatcher';
import {
  findFirstNodeOfType,
  getProviderFromNode,
  isFalLoraEndpointError,
  resolveActiveCheckpoint,
  resolveCheckpointForNode,
  omitUnsupportedGenerateFields,
  resolveGenerateLorasPayload,
  sanitizeFrameLoras,
} from './utils/resolveCheckpoint';
import {
  checkpointNodeTitle,
  spatialFrameTopBarLabel,
  paramsDrawerFramePrefix,
  sanitizeFrameMarketingTitle,
} from './utils/providerLabels';

export default function App() {
  // Canvas View Mode: 'graph' (ComfyUI Node Flow) vs 'spatial' (Modern Freeform Spatial Board)
  const [canvasMode, setCanvasMode] = useState<CanvasMode>('graph');
  const [transform, setTransform] = useState<CanvasTransform>({ x: 80, y: 80, scale: 0.8 });

  // Graph States
  const [nodes, setNodes] = useState<NodeInstance[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Modern Spatial Generation Frames (Infinite Canvas Region Frames)
  const [spatialFrames, setSpatialFrames] = useState<SpatialFrame[]>([
    {
      id: 'frame-ms-cn-1',
      title: '魔搭 CN (modelscope.cn): Z-Image-Turbo + 美胸年年 LoRA',
      pos: { x: 50, y: 160 },
      width: 460,
      height: 640,
      prompt: 'A highly textured, impressionistic digital painting capturing a solitary young woman crouching under a translucent umbrella on a wet city street during a light rain shower; she gazes down pensively, her hair slightly damp, wearing a light top and dark shorts, while a sleek black cat sits nearby in the foreground, mirroring the reflections in the slick pavement. The scene is dominated by a cool, desaturated palette of pale blues, creams, and muted grays, punctuated by deep blacks in the shadows and the cat\'s form. The rendering employs thick, visible brushstrokes and a distressed, almost watercolor-like texture across the entire canvas, giving it a gritty, atmospheric quality. Strong ambient light filters through the umbrella and the urban backdrop, creating high contrast between the bright, washed-out sky and the deep, reflective puddles on the ground. The composition is vertical, drawing the eye from the foreground reflection up to the central figure against the towering, abstractly rendered cityscape.',
      negativePrompt: '',
      params: {
        checkpoint: 'Tongyi-MAI/Z-Image-Turbo',
        seed: 876105816987345,
        seedControl: 'fixed',
        steps: 8,
        cfg: 1.0,
        sampler: 'euler',
        scheduler: 'bong_tangent',
        denoise: 1.0,
        width: 960,
        height: 1440,
        batchSize: 1,
        loras: [
          {
            name: 'laonansheng/meixiong-niannian-Z-Image-Turbo-Tongyi-MAI-v1.0',
            modelStrength: 0.7,
            clipStrength: 0.7,
            triggerWords: 'reversal film slide film style',
            civitaiId: '139784521',
          },
        ],
        targetProvider: 'modelscope',
      },
      status: 'idle',
      imageUrl: '', 
      createdAt: Date.now(),
    },
    {
      id: 'frame-ms-ai-1',
      title: '魔搭 AI (modelscope.ai): Z-Image-Turbo + 美胸年年 LoRA',
      pos: { x: 540, y: 160 },
      width: 460,
      height: 640,
      prompt: 'A highly textured, impressionistic digital painting capturing a solitary young woman crouching under a translucent umbrella on a wet city street during a light rain shower; she gazes down pensively, her hair slightly damp, wearing a light top and dark shorts, while a sleek black cat sits nearby in the foreground, mirroring the reflections in the slick pavement. The scene is dominated by a cool, desaturated palette of pale blues, creams, and muted grays, punctuated by deep blacks in the shadows and the cat\'s form. The rendering employs thick, visible brushstrokes and a distressed, almost watercolor-like texture across the entire canvas, giving it a gritty, atmospheric quality. Strong ambient light filters through the umbrella and the urban backdrop, creating high contrast between the bright, washed-out sky and the deep, reflective puddles on the ground. The composition is vertical, drawing the eye from the foreground reflection up to the central figure against the towering, abstractly rendered cityscape.',
      negativePrompt: '',
      params: {
        checkpoint: 'Tongyi-MAI/Z-Image-Turbo',
        seed: 876105816987345,
        seedControl: 'fixed',
        steps: 8,
        cfg: 1.0,
        sampler: 'euler',
        scheduler: 'bong_tangent',
        denoise: 1.0,
        width: 960,
        height: 1440,
        batchSize: 1,
        loras: [
          {
            name: 'laonansheng/meixiong-niannian-Z-Image-Turbo-Tongyi-MAI-v1.0',
            modelStrength: 0.7,
            clipStrength: 0.7,
            triggerWords: 'reversal film slide film style',
            civitaiId: '139784521',
          },
        ],
        targetProvider: 'modelscope_ai',
      },
      status: 'idle',
      imageUrl: '', 
      createdAt: Date.now(),
    },
    {
      id: 'frame-hf-1',
      title: 'Hugging Face: RadianceChromeVoluptuous Z-Image-Turbo',
      pos: { x: 1030, y: 160 },
      width: 460,
      height: 640,
      prompt: 'A highly textured, impressionistic digital painting capturing a solitary young woman crouching under a translucent umbrella on a wet city street during a light rain shower; she gazes down pensively, her hair slightly damp, wearing a light top and dark shorts, while a sleek black cat sits nearby in the foreground, mirroring the reflections in the slick pavement. The scene is dominated by a cool, desaturated palette of pale blues, creams, and muted grays, punctuated by deep blacks in the shadows and the cat\'s form. The rendering employs thick, visible brushstrokes and a distressed, almost watercolor-like texture across the entire canvas, giving it a gritty, atmospheric quality. Strong ambient light filters through the umbrella and the urban backdrop, creating high contrast between the bright, washed-out sky and the deep, reflective puddles on the ground. The composition is vertical, drawing the eye from the foreground reflection up to the central figure against the towering, abstractly rendered cityscape.',
      negativePrompt: '',
      params: {
        checkpoint: 'AIImageStudio/RadianceChromeVoluptuous_z_image_turbo_v2.0',
        seed: 876105816987345,
        seedControl: 'fixed',
        steps: 8,
        cfg: 1.0,
        sampler: 'euler',
        scheduler: 'bong_tangent',
        denoise: 1.0,
        width: 960,
        height: 1440,
        batchSize: 1,
        loras: [
          {
            name: 'AIImageStudio/RadianceChromeVoluptuous_z_image_turbo_v2.0',
            modelStrength: 0.7,
            clipStrength: 0.7,
            triggerWords: 'reversal film slide film style, masterpiece',
            civitaiId: '139784521',
          }
        ],
        targetProvider: 'huggingface',
      },
      status: 'idle',
      imageUrl: '',
      createdAt: Date.now(),
    },
  ]);
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>('frame-ms-1');

  // Execution States
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionStatusText, setExecutionStatusText] = useState('');
  const [executionProgress, setExecutionProgress] = useState(0);

  // Floating Notification Toast State
  const [toast, setToast] = useState<{
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
    imageUrl?: string;
  } | null>(null);
  const [toastThumbBroken, setToastThumbBroken] = useState(false);

  useEffect(() => {
    setToastThumbBroken(false);
    if (toast) {
      const timer = setTimeout(() => setToast(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Modals & Panels
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCivitaiOpen, setIsCivitaiOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isModelHubOpen, setIsModelHubOpen] = useState(false);
  const [modelHubCategory, setModelHubCategory] = useState<CategoryFilter>('all');
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isParamsDrawerOpen, setIsParamsDrawerOpen] = useState(false);
  const [isMinimapOpen, setIsMinimapOpen] = useState(true);
  const [targetLoRANodeId, setTargetLoRANodeId] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [inspectingMediaItem, setInspectingMediaItem] = useState<any | null>(null);

  // New Modals: Presets, Provider Matrix, Canvas Boards, Assets
  const [isWorkflowPresetsOpen, setIsWorkflowPresetsOpen] = useState(false);
  const [workflowPresetsInitialTab, setWorkflowPresetsInitialTab] = useState<'presets' | 'civitai-extract' | 'import' | 'export' | 'clear'>('presets');
  const [isProviderMatrixOpen, setIsProviderMatrixOpen] = useState(false);
  const [isCanvasManagerOpen, setIsCanvasManagerOpen] = useState(false);
  const [isAssetManagerOpen, setIsAssetManagerOpen] = useState(false);

  const handleOpenCivitaiImport = () => {
    setWorkflowPresetsInitialTab('civitai-extract');
    setIsWorkflowPresetsOpen(true);
  };

  const handleOpenBaseModelHub = () => {
    setModelHubCategory('checkpoint');
    setIsModelHubOpen(true);
  };

  const handleOpenLoRAHub = () => {
    setIsCivitaiOpen(true);
  };

  const handleOpenVideoHub = () => {
    setModelHubCategory('video');
    setIsModelHubOpen(true);
  };

  // Multi-Canvas Boards Management
  const [canvases, setCanvases] = useState<CanvasProject[]>(() => {
    try {
      const raw = localStorage.getItem('comfycanvas_boards_v2');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return [
      {
        id: 'canvas-zimage',
        name: 'Z-Image-Turbo 极致真实画作工作室 (139784521)',
        description: '对齐 Civitai 139784521，挂载 Z-Image-Turbo 官方底模与微调 LoRA (魔搭 / Hugging Face)',
        updatedAt: Date.now(),
        nodes: WORKFLOW_PRESETS[0].nodes,
        connections: WORKFLOW_PRESETS[0].connections,
        spatialFrames: WORKFLOW_PRESETS[0].spatialFrames || [],
      },
      {
        id: 'canvas-anime',
        name: '吉卜力唯美日系动漫水彩 (SDXL)',
        description: 'Animagine XL 动漫底模，串联吉卜力光影与新海诚治愈云彩',
        updatedAt: Date.now() - 3600000,
        nodes: WORKFLOW_PRESETS[1].nodes,
        connections: WORKFLOW_PRESETS[1].connections,
        spatialFrames: WORKFLOW_PRESETS[1].spatialFrames || [],
      },
      {
        id: 'canvas-wan',
        name: '阿里魔搭 Wan 2.1 国风水墨仙侠与视频',
        description: '通义万相纯中文自然语言大模型，东方仙侠神话与电影级视频',
        updatedAt: Date.now() - 7200000,
        nodes: WORKFLOW_PRESETS[2].nodes,
        connections: WORKFLOW_PRESETS[2].connections,
        spatialFrames: WORKFLOW_PRESETS[2].spatialFrames || [],
      },
    ];
  });
  const [currentCanvasId, setCurrentCanvasId] = useState<string>('canvas-zimage');

  // Sync current work back to the canvases list (Auto-Save to project)
  useEffect(() => {
    setCanvases((prev) =>
      prev.map((c) =>
        c.id === currentCanvasId
          ? {
              ...c,
              nodes,
              connections,
              spatialFrames,
              updatedAt: Date.now(),
              transform,
            }
          : c
      )
    );
  }, [nodes, connections, spatialFrames, currentCanvasId, transform]);

  // Sync canvases to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('comfycanvas_boards_v2', JSON.stringify(canvases));
    } catch (e) {}
  }, [canvases]);

  // API Keys & History
  const [apiKeys, setApiKeys] = useState<ApiKeysState>(getStoredApiKeys());
  const [history, setHistory] = useState<GenerationHistoryItem[]>([]);

  // Initialize with Default Preset for node view
  useEffect(() => {
    const defaultPreset = WORKFLOW_PRESETS[0];
    setNodes(JSON.parse(JSON.stringify(defaultPreset.nodes)));
    setConnections(JSON.parse(JSON.stringify(defaultPreset.connections)));

    fetchHistory().then((items) => {
      if (items) setHistory(items);
    });
  }, []);

  // U-E2: Determine if generation/run is disabled due to missing model
  const runDisabledReason = useMemo(() => {
    if (canvasMode === 'spatial') {
      if (selectedFrameId) {
        const frame = spatialFrames.find((f) => f.id === selectedFrameId);
        if (frame?.mediaType === 'video' && !(frame.params?.checkpoint || '').trim()) {
          return '请先选择模型';
        }
      }
      return undefined;
    }

    if (nodes.length === 0) return undefined;

    try {
      const targetNode = resolveTargetNode(nodes, connections, selectedNodeId || undefined);
      if (targetNode.type === 'AIVideoNode' && !(targetNode.values?.model || '').trim()) {
        return '请先选择模型';
      }
      extractWorkflowParameters(nodes, connections, selectedNodeId || undefined);
    } catch (err: any) {
      if (err?.message === '请先选择模型') {
        return '请先选择模型';
      }
      // F4: surface empty/mismatch provider before run (never silent Fal fallback)
      if (
        typeof err?.message === 'string' &&
        (err.message.includes('视频服务商') || err.message.includes('服务商不一致'))
      ) {
        return err.message;
      }
    }
    return undefined;
  }, [canvasMode, selectedFrameId, spatialFrames, nodes, connections, selectedNodeId]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Enter or Cmd+Enter: Queue Prompt
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (runDisabledReason) {
          setToast({
            type: 'warning',
            title: '无法运行',
            message: runDisabledReason,
          });
          return;
        }
        if (canvasMode === 'spatial' && selectedFrameId) {
          handleQueueFrame(selectedFrameId);
        } else {
          handleQueuePrompt();
        }
        return;
      }

      // Delete or Backspace to delete selected element
      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)
      ) {
        if (selectedFrameId) {
          e.preventDefault();
          handleDeleteFrame(selectedFrameId);
        } else if (selectedNodeId) {
          e.preventDefault();
          handleDeleteNode(selectedNodeId);
        }
      }

      // Escape to close drawers / preview
      if (e.key === 'Escape') {
        setPreviewImageUrl(null);
        setIsParamsDrawerOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, selectedFrameId, canvasMode, spatialFrames, nodes, connections, isExecuting]);

  // Spatial Frame Operations
  const handleAddSpatialFrame = () => {
    const newId = `frame-${Date.now()}`;
    const newFrame: SpatialFrame = {
      id: newId,
      title: `取景生成框 #${spatialFrames.length + 1}`,
      pos: {
        x: Math.round(-transform.x / transform.scale + 300),
        y: Math.round(-transform.y / transform.scale + 160),
      },
      width: 480,
      height: 480,
      prompt: 'A majestic dragon floating above misty mountains in sunrise, cinematic lighting, 8k',
      negativePrompt: 'blurry, bad anatomy, low quality',
      params: {
        checkpoint: 'black-forest-labs/FLUX.1-schnell',
        seed: Math.floor(Math.random() * 1000000000),
        seedControl: 'randomize',
        steps: 25,
        cfg: 4.5,
        sampler: 'euler',
        scheduler: 'normal',
        denoise: 1.0,
        width: 1024,
        height: 1024,
        batchSize: 1,
        loras: [],
        targetProvider: 'fal',
      },
      status: 'idle',
      createdAt: Date.now(),
    };

    setSpatialFrames((prev) => [...prev, newFrame]);
    setSelectedFrameId(newId);
    setSelectedNodeId(null);
  };

  const handleUpdateFramePos = (id: string, pos: { x: number; y: number }) => {
    setSpatialFrames((prev) => prev.map((f) => (f.id === id ? { ...f, pos } : f)));
  };

  const handleUpdateFrame = (frameId: string, partial: Partial<SpatialFrame>) => {
    setSpatialFrames((prev) =>
      prev.map((f) => (f.id === frameId ? { ...f, ...partial } : f))
    );

    // Synchronize prompt/negativePrompt edits back to canvas nodes
    if (partial.prompt !== undefined) {
      setNodes((prev) =>
        prev.map((n) => {
          if (n.type === 'CLIPTextEncode') {
            return { ...n, values: { ...n.values, text: partial.prompt } };
          }
          if (n.type === 'GoogleImagenNode') {
            return { ...n, values: { ...n.values, prompt: partial.prompt } };
          }
          if (n.type === 'PromptRefinerLLM') {
            return { ...n, values: { ...n.values, concept: partial.prompt } };
          }
          return n;
        })
      );
    }
    if (partial.negativePrompt !== undefined) {
      setNodes((prev) =>
        prev.map((n) => {
          if (n.type === 'CLIPTextEncodeNegative') {
            return { ...n, values: { ...n.values, text: partial.negativePrompt } };
          }
          if (n.type === 'GoogleImagenNode') {
            return { ...n, values: { ...n.values, negative_prompt: partial.negativePrompt } };
          }
          return n;
        })
      );
    }
  };

  const handleDeleteFrame = (frameId: string) => {
    setSpatialFrames((prev) => prev.filter((f) => f.id !== frameId));
    if (selectedFrameId === frameId) setSelectedFrameId(null);
  };

  const handleBranchVariation = (frame: SpatialFrame) => {
    const newId = `frame-var-${Date.now()}`;
    const newFrame: SpatialFrame = {
      ...frame,
      id: newId,
      title: `${frame.title} (衍生变体)`,
      pos: { x: frame.pos.x + 520, y: frame.pos.y },
      params: {
        ...frame.params,
        seed: Math.floor(Math.random() * 1000000000),
        denoise: 0.65, // Img2Img denoise
      },
      createdAt: Date.now(),
    };
    setSpatialFrames((prev) => [...prev, newFrame]);
    setSelectedFrameId(newId);
  };

  // Queue Generation for a Spatial Frame using its full ComfyUI parameters
  const handleQueueFrame = async (frameId: string) => {
    const frame = spatialFrames.find((f) => f.id === frameId);
    if (!frame || frame.status === 'generating') return;

    handleUpdateFrame(frameId, {
      status: 'generating',
      executionProgress: 10,
      executionStage: '正在调度算力资源并预热引擎...',
      errorMessage: undefined,
    });
    setIsExecuting(true);
    setExecutionStatusText(`正在通过 ${frame.params.targetProvider.toUpperCase()} 渲染: ${frame.title}...`);

    try {
      const p = frame.params;
      let finalPrompt = frame.prompt;
      if (p.loras.length > 0) {
        const triggers = p.loras.map((l) => l.triggerWords).filter(Boolean).join(', ');
        if (triggers && !finalPrompt.includes(triggers)) {
          finalPrompt = `${triggers}, ${finalPrompt}`.trim();
        }
      }

      console.log(`[SPATIAL FRAME EXECUTION] 启动渲染任务:`, {
        frameId,
        provider: p.targetProvider,
        checkpoint: p.checkpoint,
        prompt: finalPrompt
      });

      let usedProvider: string = p.targetProvider;
      let generatedImageUrl = '';
      let generatedVideoUrl: string | undefined = undefined;
      let usedModel = p.checkpoint;
      const storedKeys = getStoredApiKeys() as unknown as Record<string, string>;

      const isVideo = Boolean(
        frame.mediaType === 'video' ||
        p.checkpoint.toLowerCase().includes('video') ||
        p.checkpoint.toLowerCase().includes('wan2.1-t2v')
      );

      handleUpdateFrame(frameId, {
        executionProgress: 30,
        executionStage: `正在上传配置并计算潜空间特征 (${p.targetProvider.toUpperCase()})...`,
      });

      const grokOrOpenAi = p.targetProvider === 'openai_compat' || p.targetProvider === 'grok_compat';
      const grokish = p.targetProvider === 'grok_compat';
      const extraParams: Record<string, unknown> = {};
      if (p.size) extraParams.size = p.size;
      if (p.quality) extraParams.quality = p.quality;
      if (p.outputFormat) extraParams.output_format = p.outputFormat;
      if (p.background) extraParams.background = p.background;
      if (p.moderation) extraParams.moderation = p.moderation;
      if (p.resolution) extraParams.resolution = p.resolution;
      // Modal N → extraParams.n (must reach request body; not UI-only)
      if (grokOrOpenAi && p.batchSize != null && Number(p.batchSize) > 0) {
        extraParams.n = Number(p.batchSize);
      }

      const grokVideoDuration = grokish
        ? (frame.videoDuration ?? p.videoDuration)
        : (isVideo ? (frame.videoDuration || 5) : undefined);

      const lorasPayload = resolveGenerateLorasPayload(
        p.targetProvider,
        p.checkpoint,
        p.loras.map((l) => ({
          name: l.name,
          strength: l.modelStrength,
          modelStrength: l.modelStrength,
          clipStrength: l.clipStrength,
          civitaiId: l.civitaiId,
          triggers: l.triggerWords,
        })),
      );

      const normParams: NormalizedGenerateParams = omitUnsupportedGenerateFields(p.targetProvider, p.checkpoint, {
        prompt: finalPrompt,
        negative_prompt: frame.negativePrompt,
        model: p.checkpoint,
        provider: p.targetProvider,
        targetProvider: p.targetProvider,
        width: p.width,
        height: p.height,
        steps: p.steps,
        cfg: p.cfg,
        seed: p.seed,
        denoise: p.denoise,
        sampler_name: p.sampler,
        scheduler: p.scheduler,
        image_url: frame.imageUrl,
        isVideo,
        videoDuration: grokish ? grokVideoDuration : (isVideo ? (frame.videoDuration || 5) : undefined),
        videoFps: grokish ? undefined : (isVideo ? (frame.videoFps || 16) : undefined),
        aspectRatio: isVideo
          ? (grokish ? (frame.videoAspectRatio || p.aspectRatio || undefined) : (frame.videoAspectRatio || '16:9'))
          : (p.aspectRatio || undefined),
        imageSize: p.imageSize || undefined,
        extraParams,
        loras: lorasPayload,
      }) as NormalizedGenerateParams;

      const startTime = Date.now();
      let tracker: any = null;
      tracker = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        handleUpdateFrame(frameId, {
          executionProgress: 60,
          executionStage: `${p.targetProvider.toUpperCase()} 云端计算中 (已耗时 ${elapsed}s)...`,
        });
      }, 1000);

      try {
        const execResult = await EngineRegistry.generate(
          p.targetProvider,
          normParams,
          storedKeys
        );

        if (tracker) clearInterval(tracker);
        console.log(`[SPATIAL FRAME RESULT] 渲染成功:`, execResult);

        if (!execResult || !execResult.mediaUrl) {
          throw new Error(`${p.targetProvider.toUpperCase()} 算力商未能回传有效结果`);
        }

        if (execResult.mediaType === 'video' || isVideo) {
          generatedVideoUrl = execResult.mediaUrl;
        } else {
          generatedImageUrl = execResult.mediaUrl;
        }
        usedProvider = execResult.provider;
        usedModel = execResult.model;

        if (execResult.wasAdapted && execResult.adaptationNotice) {
          setToast({
            type: 'info',
            title: '💡 引擎适配提示',
            message: execResult.adaptationNotice,
          });
        }

        handleUpdateFrame(frameId, {
          status: 'success',
          executionProgress: 100,
          executionStage: '渲染成功，已回填画布',
          imageUrl: generatedImageUrl || frame.imageUrl,
          videoUrl: generatedVideoUrl,
          mediaType: generatedVideoUrl ? 'video' : 'image',
        });

        const updatedHistory = await fetchHistory();
        setHistory(updatedHistory);
        setExecutionStatusText(`生成完成 (${usedProvider})`);
      } catch (err: any) {
        if (tracker) clearInterval(tracker);
        throw err;
      }
    } catch (err: any) {
      console.error('Frame gen error:', err);
      handleUpdateFrame(frameId, {
        status: 'error',
        executionProgress: 0,
        errorMessage: err.message || '生成失败',
      });
      setExecutionStatusText(err.message || '生成失败');
      setToast({
        type: 'error',
        title: '⚠️ 取景框生成失败',
        message: err.message || '服务商返回错误，请检查 API Key 配置与模型参数',
      });
    } finally {
      setIsExecuting(false);
      setTimeout(() => setExecutionStatusText(''), 2000);
    }
  };

  // Node CRUD operations
  const handleAddNode = (type: string, pos?: { x: number; y: number }) => {
    const def = NODE_DEFINITIONS[type];
    if (!def) return;

    const newNodeId = `node-${Date.now()}`;
    const defaultPos = pos || {
      x: Math.round(-transform.x / transform.scale + 300),
      y: Math.round(-transform.y / transform.scale + 200),
    };

    const newNode: NodeInstance = {
      id: newNodeId,
      type,
      title: def.title,
      pos: defaultPos,
      width: type === 'CLIPTextEncode' || type === 'CLIPTextEncodeNegative' ? 380 : 300,
      inputs: def.inputs,
      outputs: def.outputs,
      values: { ...def.defaultValues },
      state: 'idle',
    };

    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(newNodeId);
  };

  const handleDeleteNode = (nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setConnections((prev) => prev.filter((c) => c.fromNodeId !== nodeId && c.toNodeId !== nodeId));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  };

  const handleToggleCollapse = (nodeId: string) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, collapsed: !n.collapsed } : n))
    );
  };

  const handleToggleBypass = (nodeId: string) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, bypassed: !n.bypassed } : n))
    );
  };

  const handleUpdateNodePos = (id: string, pos: { x: number; y: number }) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, pos } : n)));
  };

  const handleUpdateNodeValue = (nodeId: string, widgetName: string, value: any) => {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== nodeId) return n;
        // F4: AIVideoNode model select atomically syncs targetProvider + provider from schema option
        if (n.type === 'AIVideoNode' && widgetName === 'model') {
          return { ...n, values: applyAIVideoModelSelection(n.values || {}, value) };
        }
        if (n.type === 'AIVideoNode' && widgetName === 'targetProvider') {
          return {
            ...n,
            values: { ...(n.values || {}), targetProvider: value, provider: value },
          };
        }
        return { ...n, values: { ...(n.values || {}), [widgetName]: value } };
      })
    );

    // Synchronize node value changes to the active spatial frame (preserving other frames)
    const targetNode = nodes.find((n) => n.id === nodeId);
    if (!targetNode) return;

    const activeFrameTargetId = selectedFrameId || (spatialFrames.length > 0 ? spatialFrames[0].id : null);
    if (!activeFrameTargetId) return;

    if (targetNode.type === 'CheckpointLoaderSimple') {
      if (widgetName === 'ckpt_name') {
        const prov = targetNode.values?.targetProvider || '';
        setNodes((prev) =>
          prev.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  title: checkpointNodeTitle(prov, value),
                  values: { ...(n.values || {}), ckpt_name: value },
                }
              : n
          )
        );
        if (activeFrameTargetId) {
          setSpatialFrames((prev) =>
            prev.map((f) =>
              f.id === activeFrameTargetId
                ? (() => {
                    const nextLoras = sanitizeFrameLoras(f.params.targetProvider, value, f.params.loras);
                    return {
                      ...f,
                      title: sanitizeFrameMarketingTitle(
                        f.params.targetProvider,
                        value,
                        f.title,
                        nextLoras.length
                      ),
                      params: {
                        ...f.params,
                        checkpoint: value,
                        loras: nextLoras,
                      },
                    };
                  })()
                : f
            )
          );
        }
        return;
      }
      if (widgetName === 'targetProvider') {
        const prov = value as any;
        setNodes((prev) =>
          prev.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  title: checkpointNodeTitle(prov, n.values?.ckpt_name),
                  values: { ...(n.values || {}), targetProvider: prov },
                }
              : n
          )
        );
        if (activeFrameTargetId) {
          setSpatialFrames((prev) =>
            prev.map((f) =>
              f.id === activeFrameTargetId
                ? (() => {
                    const nextLoras = sanitizeFrameLoras(prov, f.params.checkpoint, f.params.loras);
                    return {
                      ...f,
                      title: sanitizeFrameMarketingTitle(prov, f.params.checkpoint, f.title, nextLoras.length),
                      params: {
                        ...f.params,
                        targetProvider: prov,
                        loras: nextLoras,
                      },
                    };
                  })()
                : f
            )
          );
        }
        return;
      }
    }

    if ((targetNode.type === 'CLIPTextEncode' || targetNode.type === 'PromptRefinerLLM') && widgetName === 'text') {
      setSpatialFrames((prev) =>
        prev.map((f) => (f.id === activeFrameTargetId ? { ...f, prompt: value } : f))
      );
    } else if (targetNode.type === 'GoogleImagenNode' && (widgetName === 'prompt' || widgetName === 'text')) {
      setSpatialFrames((prev) =>
        prev.map((f) => (f.id === activeFrameTargetId ? { ...f, prompt: value } : f))
      );
    } else if (targetNode.type === 'CLIPTextEncodeNegative' && widgetName === 'text') {
      setSpatialFrames((prev) =>
        prev.map((f) => (f.id === activeFrameTargetId ? { ...f, negativePrompt: value } : f))
      );
    } else if (targetNode.type === 'GoogleImagenNode' && widgetName === 'negative_prompt') {
      setSpatialFrames((prev) =>
        prev.map((f) => (f.id === activeFrameTargetId ? { ...f, negativePrompt: value } : f))
      );
    } else if (targetNode.type === 'GoogleImagenNode' && widgetName === 'model') {
      setSpatialFrames((prev) =>
        prev.map((f) => (f.id === activeFrameTargetId ? (() => {
          const nextLoras = sanitizeFrameLoras('gemini', value, f.params.loras);
          return {
            ...f,
            title: sanitizeFrameMarketingTitle('gemini', value, f.title, nextLoras.length),
            params: {
              ...f.params,
              checkpoint: value,
              targetProvider: 'gemini',
              loras: nextLoras,
            },
          };
        })() : f))
      );
    } else if (targetNode.type === 'GoogleImagenNode' && widgetName === 'aspect_ratio') {
      setSpatialFrames((prev) =>
        prev.map((f) => (f.id === activeFrameTargetId ? {
          ...f,
          params: { ...f.params, aspectRatio: value || undefined },
        } : f))
      );
    } else if (targetNode.type === 'GoogleImagenNode' && widgetName === 'image_size') {
      setSpatialFrames((prev) =>
        prev.map((f) => (f.id === activeFrameTargetId ? {
          ...f,
          params: { ...f.params, imageSize: value || undefined },
        } : f))
      );
    } else if (targetNode.type === 'KSampler') {
      setSpatialFrames((prev) =>
        prev.map((f) => (f.id === activeFrameTargetId ? {
          ...f,
          params: {
            ...f.params,
            ...(widgetName === 'steps' ? { steps: Number(value) } : {}),
            ...(widgetName === 'cfg' ? { cfg: Number(value) } : {}),
            ...(widgetName === 'sampler_name' ? { sampler: value } : {}),
            ...(widgetName === 'scheduler' ? { scheduler: value } : {}),
            ...(widgetName === 'seed' ? { seed: Number(value) } : {}),
            ...(widgetName === 'denoise' ? { denoise: Number(value) } : {}),
          },
        } : f))
      );
    } else if (targetNode.type === 'CheckpointLoaderSimple') {
      setSpatialFrames((prev) =>
        prev.map((f) => {
          if (f.id !== activeFrameTargetId) return f;
          const nextCheckpoint = widgetName === 'ckpt_name' ? value : f.params.checkpoint;
          const nextProvider = widgetName === 'targetProvider' ? value : f.params.targetProvider;
          const nextLoras =
            widgetName === 'targetProvider' || widgetName === 'ckpt_name'
              ? sanitizeFrameLoras(nextProvider, nextCheckpoint, f.params.loras)
              : f.params.loras;
          return {
            ...f,
            title: sanitizeFrameMarketingTitle(nextProvider, nextCheckpoint, f.title, nextLoras.length),
            params: {
              ...f.params,
              ...(widgetName === 'ckpt_name' ? { checkpoint: value } : {}),
              ...(widgetName === 'targetProvider' ? { targetProvider: value, loras: nextLoras } : {}),
              ...(widgetName === 'ckpt_name' ? { loras: nextLoras } : {}),
              ...(widgetName === 'aspect_ratio' ? { aspectRatio: value || undefined } : {}),
              ...(widgetName === 'resolution' ? { resolution: value || undefined } : {}),
            },
          };
        })
      );
    } else if (targetNode.type === 'EmptyLatentImage') {
      setSpatialFrames((prev) =>
        prev.map((f) => (f.id === activeFrameTargetId ? {
          ...f,
          params: {
            ...f.params,
            ...(widgetName === 'width' ? { width: Number(value) } : {}),
            ...(widgetName === 'height' ? { height: Number(value) } : {}),
          },
        } : f))
      );
    } else if (targetNode.type === 'LoRALoader') {
      setSpatialFrames((prev) =>
        prev.map((f) => {
          if (f.id !== activeFrameTargetId) return f;
          const currentLoras = [...f.params.loras];
          if (currentLoras.length > 0) {
            if (widgetName === 'lora_name') currentLoras[0].name = value;
            if (widgetName === 'strength_model') currentLoras[0].modelStrength = Number(value);
            if (widgetName === 'strength_clip') currentLoras[0].clipStrength = Number(value);
            if (widgetName === 'trigger_words') currentLoras[0].triggerWords = value;
            if (widgetName === 'civitai_id') currentLoras[0].civitaiId = value;
          } else if (widgetName === 'lora_name' && value) {
             currentLoras.push({
               name: value,
               modelStrength: 0.8,
               clipStrength: 0.8,
               triggerWords: '',
               civitaiId: '',
             });
          }
          return { ...f, params: { ...f.params, loras: currentLoras } };
        })
      );
    }
  };

  const handleAddConnection = (conn: Omit<Connection, 'id'>) => {
    const newConn: Connection = {
      id: `conn-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      ...conn,
    };
    // ComfyUI rule: single connection per target input socket
    setConnections((prev) => [
      ...prev.filter((c) => !(c.toNodeId === conn.toNodeId && c.toSocketId === conn.toSocketId)),
      newConn,
    ]);
  };

  const handleDeleteConnection = (connId: string) => {
    setConnections((prev) => prev.filter((c) => c.id !== connId));
  };

  // Run full workflow from node graph
  const handleQueuePrompt = async (overrideNodes?: NodeInstance[], overrideConns?: Connection[], targetNodeId?: string) => {
    if (isExecuting) return;
    if (!overrideNodes && runDisabledReason) {
      setToast({
        type: 'warning',
        title: '无法运行',
        message: runDisabledReason,
      });
      return;
    }
    const activeNodes = overrideNodes || nodes;
    const activeConns = overrideConns || connections;

    if (activeNodes.length === 0) {
      setToast({
        type: 'warning',
        title: '画布上暂无节点',
        message: '请先在「工作流预设」中载入一套预设或在上方添加节点。',
      });
      setIsWorkflowPresetsOpen(true);
      return;
    }

    setIsExecuting(true);
    setExecutionProgress(5);
    setExecutionStatusText('正在调度模型与 LoRA 权重...');

    const handleNodeStateChange = (
      nodeId: string,
      state: NodeInstance['state'],
      progress?: number,
      output?: any,
      errorMessage?: string
    ) => {
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id === nodeId) {
            return {
              ...n,
              state,
              executionProgress: progress ?? n.executionProgress,
              outputData: output !== undefined ? output : n.outputData,
              errorMessage: errorMessage !== undefined ? errorMessage : n.errorMessage,
            };
          }
          return n;
        })
      );
    };

    try {
      const result = await executeWorkflow(
        activeNodes,
        activeConns,
        handleNodeStateChange,
        (percent, statusText) => {
          setExecutionProgress(percent);
          setExecutionStatusText(statusText);
        },
        targetNodeId || selectedNodeId || undefined
      );
      setExecutionStatusText(`成功完成 (${result.provider})`);
      setExecutionProgress(100);

      // Sync output to active Spatial Frame so infinite canvas updates simultaneously
      const isVid = Boolean(result.isVideo || result.imageUrl?.includes('.mp4') || result.model?.includes('video'));
      const frameSyncData = {
        status: 'success' as const,
        imageUrl: isVid ? undefined : result.imageUrl,
        videoUrl: isVid ? result.imageUrl : undefined,
        mediaType: (isVid ? 'video' : 'image') as 'video' | 'image',
        errorMessage: undefined,
        executionProgress: 100,
        executionStage: '生成完成',
      };
      if (selectedFrameId) {
        handleUpdateFrame(selectedFrameId, frameSyncData);
      } else if (spatialFrames.length > 0) {
        handleUpdateFrame(spatialFrames[0].id, frameSyncData);
      }

      // Refresh generation history from server
      const updatedHistory = await fetchHistory();
      setHistory(updatedHistory);

      // Trigger high visibility toast
      setToast({
        type: 'success',
        title: '🎉 工作流运行成功！',
        message: `由 ${result.provider} 渲染完成，种子: ${result.seed ?? '未填写'}，已保存至生成历史记录`,
        imageUrl: result.imageUrl,
      });
    } catch (err: any) {
      console.error('Queue error:', err);
      setExecutionProgress(0);
      setExecutionStatusText(err.message || '执行遇到错误');

      // Prefer the Fal/engine node the user ran; never leave it idle with empty preview.
      const currentTargetId = targetNodeId || selectedNodeId;
      const errMsg = err.message || '执行遇到错误';
      const isLoraEndpointErr = isFalLoraEndpointError(errMsg);
      setNodes((prev) => {
        const falEngines = prev.filter((n) => !n.bypassed && n.type === 'FalAIEngineNode');
        let errorNodeId = currentTargetId;

        if (errorNodeId) {
          const target = prev.find((n) => n.id === errorNodeId);
          if (target && (target.type === 'LoRALoader' || target.type === 'CivitaiLoRABrowserNode' || target.type === 'LoraLoader')) {
            const resolved = resolveCheckpointForNode(target.id, prev, activeConns);
            if (resolved.engineNodeId) errorNodeId = resolved.engineNodeId;
          }
        }

        if (!errorNodeId && falEngines.length === 1) {
          errorNodeId = falEngines[0].id;
        }
        if (!errorNodeId) {
          const running = prev.find((n) => n.state === 'running' && (n.type === 'FalAIEngineNode' || n.type === 'KSampler' || n.type === 'AIVideoNode' || n.type === 'GoogleImagenNode'));
          if (running) errorNodeId = running.id;
        }
        if (!errorNodeId) {
          const running = prev.find((n) => n.state === 'running');
          if (running) errorNodeId = running.id;
        }
        if (!errorNodeId) {
          const core = prev.find((n) => !n.bypassed && (n.type === 'FalAIEngineNode' || n.type === 'GoogleImagenNode' || n.type === 'AIVideoNode' || n.type === 'KSampler' || n.type === 'SaveImage'));
          if (core) errorNodeId = core.id;
        }
        if (!errorNodeId && prev.length > 0) {
          errorNodeId = prev[0].id;
        }

        const errorIds = new Set<string>();
        const isHfLorasErr = /该服务商不支持/i.test(errMsg) && /Hugging\s*Face/i.test(errMsg);
        if (errorNodeId) {
          const en = prev.find((n) => n.id === errorNodeId);
          if (!(en?.type === 'FalAIEngineNode' && isHfLorasErr)) {
            errorIds.add(errorNodeId);
          }
        }
        if (currentTargetId) {
          const t = prev.find((n) => n.id === currentTargetId);
          if (!(t?.type === 'FalAIEngineNode' && isHfLorasErr)) {
            errorIds.add(currentTargetId);
          }
        }
        if (isLoraEndpointErr) {
          for (const n of prev) {
            if (n.bypassed) continue;
            if (n.type === 'LoRALoader' || n.type === 'CivitaiLoRABrowserNode' || n.type === 'LoraLoader') {
              errorIds.add(n.id);
            }
          }
          for (const eng of falEngines) {
            errorIds.add(eng.id);
          }
        }

        return prev.map((n) => {
          if (errorIds.has(n.id)) {
            return {
              ...n,
              state: 'error' as const,
              executionProgress: 0,
              errorMessage: errMsg,
            };
          }
          if (n.state === 'running') {
            return {
              ...n,
              state: 'idle' as const,
              executionProgress: 0,
            };
          }
          return n;
        });
      });

      setToast({
        type: 'error',
        title: '⚠️ 算力执行异常 (透明报告)',
        message: err.message || '上游服务商返回错误，请检查对应服务商 Key 或模型状态',
      });
      fetchHistory().then(setHistory);
    } finally {
      setTimeout(() => {
        setIsExecuting(false);
        setExecutionProgress(0);
        setExecutionStatusText('');
      }, 1500);
    }
  };

  // One-click load preset and immediately run workflow
  const handleLoadAndRunPreset = (preset: WorkflowPreset) => {
    const newNodes = JSON.parse(JSON.stringify(preset.nodes));
    const newConns = JSON.parse(JSON.stringify(preset.connections));
    setNodes(newNodes);
    setConnections(newConns);
    if (preset.spatialFrames && preset.spatialFrames.length > 0) {
      setSpatialFrames(JSON.parse(JSON.stringify(preset.spatialFrames)));
      setSelectedFrameId(preset.spatialFrames[0].id);
    }
    handleResetView();
    setIsWorkflowPresetsOpen(false);

    setTimeout(() => {
      handleQueuePrompt(newNodes, newConns);
    }, 150);
  };

  // Auto-Fix Checkpoint for LoRA architecture compatibility
  const handleAutoFixCheckpoint = (recommendedCheckpoint: string) => {
    // 1. Update CheckpointLoaderSimple nodes
    setNodes((prev) =>
      prev.map((n) =>
        n.type === 'CheckpointLoaderSimple'
          ? { ...n, values: { ...n.values, ckpt_name: recommendedCheckpoint } }
          : n
      )
    );
    // 2. If active frame, update frame checkpoint
    if (selectedFrameId) {
      const frame = spatialFrames.find((f) => f.id === selectedFrameId);
      if (frame) {
        handleUpdateFrame(selectedFrameId, {
          params: { ...frame.params, checkpoint: recommendedCheckpoint },
        });
      }
    }
    setToast({
      type: 'success',
      title: '⚡ 底模架构已自动同步',
      message: `前置 Checkpoint 已更新为兼容底模: ${recommendedCheckpoint.split('/').pop()}`,
    });
  };

  // Civitai / Multi-Hub LoRA selection
  const handleSelectLoRAFromCivitai = (lora: {
    name: string;
    civitaiId?: string;
    triggerWords: string;
    baseModel?: string;
  }) => {
    // If a spatial frame is active, append LoRA to its params
    if (selectedFrameId) {
      const frame = spatialFrames.find((f) => f.id === selectedFrameId);
      if (frame) {
        const nextLoras = [
          ...frame.params.loras.filter((l) => l.name !== lora.name),
          {
            name: lora.name,
            modelStrength: 0.8,
            clipStrength: 0.8,
            triggerWords: lora.triggerWords,
            civitaiId: lora.civitaiId,
            baseModel: lora.baseModel,
          },
        ];
        handleUpdateFrame(selectedFrameId, {
          params: { ...frame.params, loras: nextLoras },
        });
      }
    }

    // Also update any targeted LoRALoader node if present
    if (targetLoRANodeId) {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === targetLoRANodeId
            ? {
                ...n,
                values: {
                  ...n.values,
                  lora_name: lora.name,
                  civitai_id: lora.civitaiId || '',
                  trigger_words: lora.triggerWords,
                  base_model: lora.baseModel || '',
                },
              }
            : n
        )
      );
    }
  };

  const handleAddLoRANodeToCanvas = (lora: {
    name: string;
    civitaiId?: string;
    triggerWords?: string;
    baseModel?: string;
  }) => {
    const newNodeId = `node-lora-${Date.now()}`;
    const def = NODE_DEFINITIONS['LoRALoader'];

    const newNode: NodeInstance = {
      id: newNodeId,
      type: 'LoRALoader',
      title: `LoRA: ${lora.name.replace('.safetensors', '')}`,
      pos: {
        x: Math.round(-transform.x / transform.scale + 420),
        y: Math.round(-transform.y / transform.scale + 220),
      },
      width: 320,
      inputs: def.inputs,
      outputs: def.outputs,
      values: {
        ...def.defaultValues,
        lora_name: lora.name,
        civitai_id: lora.civitaiId || '',
        trigger_words: lora.triggerWords || '',
        base_model: lora.baseModel || '',
      },
      state: 'idle',
    };

    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(newNodeId);
  };

  // User-requested core feature: Select LoRA and auto-pair matching base model onto graph nodes
  const handleSelectLoRAWithBaseModel = (lora: {
    name: string;
    civitaiId?: string;
    triggerWords?: string;
    baseModel?: string;
  }) => {
    // Check if active spatial frame or graph has preferred provider
    const currentProv = selectedFrameId
      ? spatialFrames.find((f) => f.id === selectedFrameId)?.params?.targetProvider
      : (findFirstNodeOfType(nodes, 'CheckpointLoaderSimple')?.values?.targetProvider as string | undefined);

    const matched = getRecommendedBaseModelForLora(lora.baseModel, lora.name, currentProv || (lora.civitaiId ? 'civitai' : undefined));
    const recModel = matched.recommendedCheckpoint;
    
    // Determine target provider: respect currentProv if it exists, otherwise use a safe default
    let targetProvider = currentProv || (lora.civitaiId ? 'civitai' : 'fal');
    
    // Smart provider matching: if model ID looks like ModelScope or HF, use that
    if (recModel.includes('/') && !recModel.startsWith('fal-ai/')) {
      if (recModel.startsWith('stabilityai/') || recModel.startsWith('black-forest-labs/') || recModel.startsWith('runwayml/')) {
         // Keep existing provider if it's likely to support these (fal, civitai, hf)
         if (!['fal', 'civitai', 'huggingface'].includes(targetProvider)) {
           targetProvider = 'huggingface';
         }
      } else if (recModel.startsWith('damo/') || recModel.startsWith('AI-ModelScope/')) {
         targetProvider = 'modelscope';
      }
    }

    // 1. Update or auto-create CheckpointLoaderSimple node on the canvas
    setNodes((prev) => {
      const hasCkpt = prev.some((n) => n.type === 'CheckpointLoaderSimple');
      if (!hasCkpt) {
        const ckptDef = NODE_DEFINITIONS['CheckpointLoaderSimple'];
        const newCkptId = `node-ckpt-${Date.now()}`;
        const newCkpt: NodeInstance = {
          id: newCkptId,
          type: 'CheckpointLoaderSimple',
          title: checkpointNodeTitle(targetProvider),
          pos: {
            x: Math.round(-transform.x / transform.scale + 120),
            y: Math.round(-transform.y / transform.scale + 180),
          },
          width: 280,
          inputs: ckptDef.inputs,
          outputs: ckptDef.outputs,
          values: { ...ckptDef.defaultValues, ckpt_name: recModel, targetProvider },
          state: 'idle',
        };
        return [...prev, newCkpt];
      }
      return prev.map((n) =>
        n.type === 'CheckpointLoaderSimple'
          ? { 
              ...n, 
              title: checkpointNodeTitle(targetProvider),
              values: { ...n.values, ckpt_name: recModel, targetProvider } 
            }
          : n
      );
    });

    // 2. Synchronize KSampler to optimal steps & cfg for this architecture family
    setNodes((prev) =>
      prev.map((n) =>
        n.type === 'KSampler'
          ? {
              ...n,
              values: {
                ...n.values,
                steps: matched.recommendedSteps,
                cfg: matched.recommendedCfg,
                sampler_name: matched.recommendedSampler,
                scheduler: matched.recommendedScheduler,
              },
            }
          : n
      )
    );

    // 3. Update target LoRA node or add a new one
    if (targetLoRANodeId) {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === targetLoRANodeId
            ? {
                ...n,
                title: `LoRA: ${lora.name.replace('.safetensors', '')}`,
                values: {
                  ...n.values,
                  lora_name: lora.name,
                  civitai_id: lora.civitaiId || '',
                  trigger_words: lora.triggerWords || '',
                  base_model: lora.baseModel || matched.displayName,
                },
              }
            : n
        )
      );
    } else {
      handleAddLoRANodeToCanvas({
        name: lora.name,
        civitaiId: lora.civitaiId || '',
        triggerWords: lora.triggerWords || '',
        baseModel: lora.baseModel || matched.displayName,
      });
    }

    // 4. If spatial frame is active, update checkpoint & append LoRA
    if (selectedFrameId) {
      const frame = spatialFrames.find((f) => f.id === selectedFrameId);
      if (frame) {
        let updatedPrompt = frame.prompt;
        if (lora.triggerWords && !frame.prompt.includes(lora.triggerWords)) {
          updatedPrompt = `${lora.triggerWords}, ${frame.prompt}`;
        }
        const nextLoras = [
          ...frame.params.loras.filter((l) => l.name !== lora.name),
          {
            name: lora.name,
            modelStrength: 0.8,
            clipStrength: 0.8,
            triggerWords: lora.triggerWords || '',
            civitaiId: lora.civitaiId || '',
            baseModel: lora.baseModel || matched.displayName,
          },
        ];
        handleUpdateFrame(selectedFrameId, {
          prompt: updatedPrompt,
          params: {
            ...frame.params,
            checkpoint: recModel,
            targetProvider: targetProvider as any,
            steps: matched.recommendedSteps,
            cfg: matched.recommendedCfg,
            sampler: matched.recommendedSampler,
            scheduler: matched.recommendedScheduler,
            loras: nextLoras,
          },
        });
      }
    }

    // 5. Success toast
    setToast({
      type: 'success',
      title: '🎯 LoRA 与适配底模已一键同步！',
      message: `已选用【${lora.name.replace('.safetensors', '')}】，前置底模已自动配对为【${recModel}】(推荐步数: ${matched.recommendedSteps}, CFG: ${matched.recommendedCfg})`,
    });
  };

  // Live Model Hub selection
  const handleSelectModelFromHub = (modelId: string, modelName: string, providerHint?: string, extraData?: any) => {
    let provider: any = (providerHint || 'civitai').toLowerCase();

    const lowerProv = (providerHint || '').toLowerCase();
    const lowerId = (modelId || '').toLowerCase();

    const isTaTool = [
      'strong_text2image', 'photoreal_studio', 'anime_lab', 'oc_character',
      'text2video_wan', 'text2video_ltx', 'image2video_wan', 'image2video_ltx',
      'smart_edit', 'image_upscaler', 'background_remover', 'extend_image_sd15',
      'live_wallpaper', 'old_photo_restore', 'three_view_flux_kontext', 'watermark_remove',
      'oc_garment'
    ].some((prefix) => lowerId.includes(prefix));

    const isVideoModel =
      extraData?.category === 'Video' ||
      extraData?.type === 'MotionModule' ||
      modelHubCategory === 'video' ||
      lowerId.includes('video') ||
      lowerId.includes('wan2.1-t2v') ||
      lowerId.includes('wan2.2-t2v') ||
      lowerId.startsWith('text2video_') ||
      lowerId.startsWith('image2video_') ||
      lowerId === 'live_wallpaper' ||
      lowerId.includes('kling') ||
      lowerId.includes('ltx') ||
      lowerId.includes('minimax') ||
      lowerId.includes('cogvideo') ||
      lowerId.includes('hunyuan-video');

    if (lowerProv.includes('tensor') || lowerId.includes('tensor') || isTaTool || /^\d{10,25}$/.test(lowerId)) {
      provider = 'tensorart';
    } else if (lowerProv.includes('agnes') || lowerId.includes('agnes')) {
      provider = 'agnes';
    } else if (lowerProv.includes('sensenova') || lowerProv.includes('商汤') || lowerId.includes('sensenova') || lowerId.includes('deepseek') || lowerId.includes('glm')) {
      provider = 'sensenova';
    } else if (lowerProv.includes('civitai') || lowerId.includes('civitai') || lowerId.includes('krea2') || lowerId.startsWith('urn:air:')) {
      provider = 'civitai';
    } else if (lowerProv === 'modelscope_ai' || lowerProv.includes('international') || lowerProv.includes('国际站')) {
      provider = 'modelscope_ai';
    } else if (lowerProv.includes('modelscope') || lowerProv.includes('魔搭') || lowerId.startsWith('damo/') || lowerId.includes('qwen')) {
      provider = 'modelscope';
    } else if (lowerProv.includes('hugging') || lowerProv.includes('hf')) {
      provider = 'huggingface';
    } else if (lowerProv.includes('nanogpt')) {
      provider = 'nanogpt';
    } else if (lowerProv.includes('gemini') || lowerProv.includes('imagen') || lowerId.includes('imagen')) {
      provider = 'gemini';
    } else if (lowerProv.includes('video') || isVideoModel) {
      provider = lowerProv.includes('tensor') ? 'tensorart' : lowerProv.includes('modelscope') ? 'modelscope' : 'fal';
    } else if (lowerProv.includes('fal')) {
      provider = 'fal';
    }

    if (isVideoModel) {
      // 1. Update active spatial frame for video
      if (selectedFrameId) {
        const frame = spatialFrames.find((f) => f.id === selectedFrameId);
        if (frame) {
          handleUpdateFrame(selectedFrameId, {
            mediaType: 'video',
            params: {
              ...frame.params,
              checkpoint: modelId,
              targetProvider: provider,
              tensorArtInputs: provider === 'tensorart' ? (extraData?.inputs || []) : undefined,
            },
          });
        }
      }

      // 2. Update existing AIVideoNode or create new one if not exists
      const existingVideoNode = nodes.find((n) => n.type === 'AIVideoNode' && !n.bypassed);
      if (existingVideoNode) {
        setNodes((prev) =>
          prev.map((n) => {
            if (n.type === 'AIVideoNode') {
              return {
                ...n,
                title: `AI 视频 (${modelName.split('/').pop()})`,
                values: {
                  ...n.values,
                  model: modelId,
                  targetProvider: provider,
                },
              };
            }
            return n;
          })
        );
      } else {
        const newNodeId = `node-video-${Date.now()}`;
        const def = NODE_DEFINITIONS['AIVideoNode'];
        const newNode: NodeInstance = {
          id: newNodeId,
          type: 'AIVideoNode',
          title: `AI 视频 (${modelName.split('/').pop()})`,
          pos: {
            x: Math.round(-transform.x / transform.scale + 120),
            y: Math.round(-transform.y / transform.scale + 160),
          },
          width: 320,
          inputs: def ? def.inputs : [{ id: 'positive', name: 'positive', type: 'CONDITIONING', label: 'prompt' }],
          outputs: def ? def.outputs : [{ id: 'VIDEO', name: 'VIDEO', type: 'VIDEO', label: 'VIDEO' }],
          values: {
            model: modelId,
            targetProvider: provider,
            prompt: 'Cinematic dynamic scene, high quality, 4k ultra-detailed, photorealistic motion',
            aspect_ratio: '16:9',
            duration: 5,
            fps: 16,
            steps: 30,
            cfg: 5.0,
          },
          state: 'idle',
        };
        setNodes((prev) => [...prev, newNode]);
        setSelectedNodeId(newNodeId);
      }

      setToast({
        type: 'success',
        title: '🎬 已成功应用 AI 视频大模型',
        message: `已切换至【${modelName}】(服务商: ${provider.toUpperCase()})，已同步至画布与活跃选区`,
      });
    } else {
      // Base Model (Checkpoint)
      if (selectedFrameId) {
        const frame = spatialFrames.find((f) => f.id === selectedFrameId);
        if (frame) {
          handleUpdateFrame(selectedFrameId, {
            mediaType: 'image',
            params: {
              ...frame.params,
              checkpoint: modelId,
              targetProvider: provider,
              tensorArtInputs: provider === 'tensorart' ? (extraData?.inputs || []) : undefined,
            },
          });
        }
      }

      const existingCkptNode = findFirstNodeOfType(nodes, 'CheckpointLoaderSimple');
      if (existingCkptNode) {
        setNodes((prev) =>
          prev.map((n) => {
            if (n.type === 'CheckpointLoaderSimple') {
              return {
                ...n,
                title: checkpointNodeTitle(provider),
                values: {
                  ...n.values,
                  ckpt_name: modelId,
                  targetProvider: provider,
                  tensorArtInputs: provider === 'tensorart' ? (extraData?.inputs || []) : undefined,
                },
              };
            }
            return n;
          })
        );
      } else {
        const newNodeId = `node-ckpt-${Date.now()}`;
        const def = NODE_DEFINITIONS['CheckpointLoaderSimple'];
        const newNode: NodeInstance = {
          id: newNodeId,
          type: 'CheckpointLoaderSimple',
          title: checkpointNodeTitle(provider),
          pos: {
            x: Math.round(-transform.x / transform.scale + 120),
            y: Math.round(-transform.y / transform.scale + 160),
          },
          width: 290,
          inputs: [],
          outputs: def ? def.outputs : [],
          values: { ckpt_name: modelId, targetProvider: provider },
          state: 'idle',
        };
        setNodes((prev) => [...prev, newNode]);
        setSelectedNodeId(newNodeId);
      }

      setToast({
        type: 'success',
        title: '🎯 已成功应用图像底模 (Checkpoint)',
        message: `已切换至【${modelName}】(服务商: ${provider.toUpperCase()})，已同步至画布与前置加载器`,
      });
    }
  };

  // Canvas Board Operations
  const handleSelectCanvas = (canvas: CanvasProject) => {
    setCurrentCanvasId(canvas.id);
    setNodes(JSON.parse(JSON.stringify(canvas.nodes || [])));
    setConnections(JSON.parse(JSON.stringify(canvas.connections || [])));
    setSpatialFrames(JSON.parse(JSON.stringify(canvas.spatialFrames || [])));
    if (canvas.transform) setTransform(canvas.transform);
    if (canvas.spatialFrames?.[0]) setSelectedFrameId(canvas.spatialFrames[0].id);
    setTimeout(handleResetView, 60);
  };

  const handleCreateNewCanvas = (name: string, description: string, templateType: 'empty' | 'flux' | 'ghibli' | 'wan') => {
    let baseNodes: NodeInstance[] = [];
    let baseConns: Connection[] = [];
    let baseFrames: SpatialFrame[] = [];

    if (templateType === 'flux') {
      baseNodes = JSON.parse(JSON.stringify(WORKFLOW_PRESETS[0].nodes));
      baseConns = JSON.parse(JSON.stringify(WORKFLOW_PRESETS[0].connections));
      baseFrames = JSON.parse(JSON.stringify(WORKFLOW_PRESETS[0].spatialFrames || []));
    } else if (templateType === 'ghibli') {
      baseNodes = JSON.parse(JSON.stringify(WORKFLOW_PRESETS[1].nodes));
      baseConns = JSON.parse(JSON.stringify(WORKFLOW_PRESETS[1].connections));
      baseFrames = JSON.parse(JSON.stringify(WORKFLOW_PRESETS[1].spatialFrames || []));
    } else if (templateType === 'wan') {
      baseNodes = JSON.parse(JSON.stringify(WORKFLOW_PRESETS[2].nodes));
      baseConns = JSON.parse(JSON.stringify(WORKFLOW_PRESETS[2].connections));
      baseFrames = JSON.parse(JSON.stringify(WORKFLOW_PRESETS[2].spatialFrames || []));
    }

    const newCanvas: CanvasProject = {
      id: `canvas-${Date.now()}`,
      name,
      description,
      updatedAt: Date.now(),
      nodes: baseNodes,
      connections: baseConns,
      spatialFrames: baseFrames,
    };

    setCanvases((prev) => [newCanvas, ...prev]);
    handleSelectCanvas(newCanvas);
  };

  const handleCloneCanvas = (canvasId: string) => {
    const target = canvases.find((c) => c.id === canvasId);
    if (!target) return;
    const cloned: CanvasProject = {
      ...JSON.parse(JSON.stringify(target)),
      id: `canvas-clone-${Date.now()}`,
      name: `${target.name} (副本)`,
      updatedAt: Date.now(),
    };
    setCanvases((prev) => [cloned, ...prev]);
  };

  const handleDeleteCanvas = (canvasId: string) => {
    const remaining = canvases.filter((c) => c.id !== canvasId);
    setCanvases(remaining);
    if (currentCanvasId === canvasId) {
      if (remaining[0]) {
        handleSelectCanvas(remaining[0]);
      } else {
        handleCreateNewCanvas('我的主画布 (默认)', 'AI Studio 节点工作流主画板', 'flux');
      }
    }
  };

  const handleRenameCanvas = (canvasId: string, newName: string) => {
    setCanvases((prev) =>
      prev.map((c) => (c.id === canvasId ? { ...c, name: newName, updatedAt: Date.now() } : c))
    );
  };

  const handleSaveCurrentAsNew = (name: string) => {
    const newBoard: CanvasProject = {
      id: `canvas-${Date.now()}`,
      name,
      description: `创建于 ${new Date().toLocaleString()}`,
      updatedAt: Date.now(),
      nodes: JSON.parse(JSON.stringify(nodes)),
      connections: JSON.parse(JSON.stringify(connections)),
      spatialFrames: JSON.parse(JSON.stringify(spatialFrames)),
      transform,
    };
    setCanvases((prev) => [newBoard, ...prev]);
    setCurrentCanvasId(newBoard.id);
  };

  // Workflow Preset Loading
  const handleLoadPreset = (preset: WorkflowPreset, mode: 'replace' | 'append') => {
    if (mode === 'replace') {
      setNodes(JSON.parse(JSON.stringify(preset.nodes)));
      setConnections(JSON.parse(JSON.stringify(preset.connections)));
      setSpatialFrames(JSON.parse(JSON.stringify(preset.spatialFrames || [])));
      if (preset.spatialFrames?.[0]) setSelectedFrameId(preset.spatialFrames[0].id);
      setTimeout(handleResetView, 60);
    } else {
      const timestamp = Date.now();
      const idMap = new Map<string, string>();
      const maxX = nodes.reduce((max, n) => Math.max(max, n.pos.x + (n.width || 300)), 0);
      const offsetX = maxX > 0 ? maxX + 160 : 600;

      const newNodes = preset.nodes.map((n) => {
        const newId = `${n.id}-${timestamp}`;
        idMap.set(n.id, newId);
        return {
          ...JSON.parse(JSON.stringify(n)),
          id: newId,
          pos: { x: n.pos.x + offsetX, y: n.pos.y },
        };
      });

      const newConnections = (preset.connections || []).map((c, idx) => ({
        id: `conn-appended-${timestamp}-${idx}`,
        fromNodeId: idMap.get(c.fromNodeId) || c.fromNodeId,
        fromSocketId: c.fromSocketId,
        toNodeId: idMap.get(c.toNodeId) || c.toNodeId,
        toSocketId: c.toSocketId,
        type: c.type,
      }));

      const newFrames = (preset.spatialFrames || []).map((f) => ({
        ...JSON.parse(JSON.stringify(f)),
        id: `${f.id}-${timestamp}`,
        pos: { x: f.pos.x + offsetX, y: f.pos.y },
      }));

      setNodes((prev) => [...prev, ...newNodes]);
      setConnections((prev) => [...prev, ...newConnections]);
      setSpatialFrames((prev) => [...prev, ...newFrames]);
      setTimeout(handleResetView, 60);
    }
  };

  const handleClearCanvas = (type: 'all' | 'nodes' | 'frames' | 'reset-default') => {
    if (type === 'all') {
      setNodes([]);
      setConnections([]);
      setSpatialFrames([]);
      setSelectedNodeId(null);
      setSelectedFrameId(null);
    } else if (type === 'nodes') {
      setNodes([]);
      setConnections([]);
      setSelectedNodeId(null);
    } else if (type === 'frames') {
      setSpatialFrames([]);
      setSelectedFrameId(null);
    } else if (type === 'reset-default') {
      handleLoadPreset(WORKFLOW_PRESETS[0], 'replace');
    }
  };

  const handleAddToCanvasAsFrame = (asset: MediaAsset) => {
    const newId = `frame-asset-${Date.now()}`;
    const newFrame: SpatialFrame = {
      id: newId,
      title: asset.title || `资产取景框: ${asset.model.split('/').pop()}`,
      pos: {
        x: Math.round(-transform.x / transform.scale + 320),
        y: Math.round(-transform.y / transform.scale + 160),
      },
      width: 480,
      height: 480,
      prompt: asset.prompt,
      negativePrompt: 'blurry, bad anatomy, low quality',
      params: {
        checkpoint: asset.model,
        seed: asset.seed || Math.floor(Math.random() * 1000000000),
        seedControl: 'randomize',
        steps: 25,
        cfg: 4.5,
        sampler: 'euler',
        scheduler: 'normal',
        denoise: 1.0,
        width: 1024,
        height: 1024,
        batchSize: 1,
        loras: [],
        targetProvider: (asset.provider.toLowerCase().includes('modelscope') ? 'modelscope' : 'fal') as any,
      },
      imageUrl: asset.type === 'image' ? asset.url : undefined,
      videoUrl: asset.type === 'video' ? asset.url : undefined,
      mediaType: asset.type,
      status: 'idle',
      createdAt: Date.now(),
    };
    setSpatialFrames((prev) => [...prev, newFrame]);
    setSelectedFrameId(newId);
  };

  const handleUseAsReference = (asset: MediaAsset) => {
    if (selectedFrameId) {
      handleUpdateFrame(selectedFrameId, {
        imageUrl: asset.url,
        prompt: asset.prompt ? `${asset.prompt}, variation` : 'variation',
      });
    }
  };

  const handleDeleteHistoryItem = async (id: string, url?: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id && (!url || (item.url !== url && item.imageUrl !== url))));
    try {
      const { deleteHistoryItem, fetchHistory } = await import('./services/api');
      const ok = await deleteHistoryItem(id);
      if (!ok && url) {
        await deleteHistoryItem(url);
      }
      const updated = await fetchHistory();
      if (updated) setHistory(updated);
      setToast({ type: 'success', title: '资产已删除', message: '已从服务器和资产库永久移除' });
    } catch (e) {
      console.error('Delete history item error:', e);
    }
  };

  const handleDeleteBatchHistoryItems = async (ids: string[]) => {
    const idSet = new Set(ids);
    setHistory((prev) => prev.filter((item) => !idSet.has(item.id)));
    try {
      const { deleteHistoryBatch, fetchHistory } = await import('./services/api');
      await deleteHistoryBatch(ids);
      const updated = await fetchHistory();
      if (updated) setHistory(updated);
      setToast({ type: 'success', title: '批量资产已删除', message: `已成功移除 ${ids.length} 项生成资产` });
    } catch (e) {
      console.error('Batch delete history items error:', e);
    }
  };

  const handleClearHistory = async () => {
    const { clearHistory, fetchHistory } = await import('./services/api');
    const ok = await clearHistory();
    if (ok) {
      const updated = await fetchHistory();
      setHistory(updated);
      setToast({ type: 'success', title: '历史记录已清空', message: '所有生成记录已从服务器永久移除' });
    }
  };

  // Reset view to fit all elements
  const handleResetView = () => {
    const all = [
      ...nodes.map((n) => ({ x: n.pos.x, y: n.pos.y, w: n.width || 300, h: 350 })),
      ...spatialFrames.map((f) => ({ x: f.pos.x, y: f.pos.y, w: f.width, h: f.height + 150 })),
    ];
    if (all.length === 0) {
      setTransform({ x: 80, y: 80, scale: 0.8 });
      return;
    }

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    all.forEach((item) => {
      minX = Math.min(minX, item.x);
      minY = Math.min(minY, item.y);
      maxX = Math.max(maxX, item.x + item.w);
      maxY = Math.max(maxY, item.y + item.h);
    });

    const padding = 140;
    const canvasWidth = window.innerWidth;
    const canvasHeight = window.innerHeight;
    const graphWidth = maxX - minX + padding * 2;
    const graphHeight = maxY - minY + padding * 2;
    const scale = Math.min(Math.max(Math.min(canvasWidth / graphWidth, canvasHeight / graphHeight), 0.35), 1.0);

    const x = canvasWidth / 2 - ((minX + maxX) / 2) * scale;
    const y = canvasHeight / 2 - ((minY + maxY) / 2) * scale;

    setTransform({ x, y, scale });
  };

  // Active parameters and prompts dynamically derived from nodes and active frame
  const activeFrame = spatialFrames.find((f) => f.id === selectedFrameId) || spatialFrames[0];
  const positiveNode = nodes.find((n) => n.type === 'CLIPTextEncode' && !n.bypassed);
  const negativeNode = nodes.find((n) => n.type === 'CLIPTextEncodeNegative' && !n.bypassed);
  const googleImagenNode = findFirstNodeOfType(nodes, 'GoogleImagenNode');
  const falEngineNode = findFirstNodeOfType(nodes, 'FalAIEngineNode');
  const videoEngineNode = findFirstNodeOfType(nodes, 'AIVideoNode');
  const ksamplerNode = nodes.find((n) => n.type === 'KSampler' && !n.bypassed);
  const latentNode = nodes.find((n) => n.type === 'EmptyLatentImage' && !n.bypassed);
  const checkpointLoaderNode = findFirstNodeOfType(nodes, 'CheckpointLoaderSimple');

  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null;

  // LoRA/panel checkpoint: ONLY the selected (or sole) engine node's model — never invent Z-Image-Turbo
  const resolvedActive = resolveActiveCheckpoint(
    nodes,
    connections,
    selectedNodeId,
    selectedFrameId ? activeFrame?.params?.checkpoint : undefined,
    selectedFrameId ? (activeFrame?.params?.targetProvider as string | undefined) : undefined
  );

  const nodePositiveText = selectedNode
    ? (selectedNode.type === 'CLIPTextEncode' ? selectedNode.values?.text :
       selectedNode.type === 'GoogleImagenNode' ? selectedNode.values?.prompt :
       selectedNode.type === 'PromptRefinerLLM' ? selectedNode.values?.concept : null)
    : null;

  const nodeNegativeText = selectedNode
    ? (selectedNode.type === 'CLIPTextEncodeNegative' ? selectedNode.values?.text :
       selectedNode.type === 'GoogleImagenNode' ? selectedNode.values?.negative_prompt : null)
    : null;

  // Single source of truth with SpatialFrame: when any frame is active (selected
  // or fallback first), inspector prompt mirrors frame.prompt / negativePrompt.
  // Avoid preferring CLIP node text while SpatialFrame shows a different string.
  const activePositivePrompt: string =
    (activeFrame != null ? (activeFrame.prompt ?? '') : null) ??
    nodePositiveText ??
    positiveNode?.values?.text ??
    googleImagenNode?.values?.prompt ??
    '';

  const activeNegativePrompt: string =
    (activeFrame != null ? (activeFrame.negativePrompt ?? '') : null) ??
    nodeNegativeText ??
    negativeNode?.values?.text ??
    googleImagenNode?.values?.negative_prompt ??
    '';

  const graphLoras = nodes
    .filter((n) => (n.type === 'LoRALoader' || n.type === 'LoraLoader' || n.type === 'LoraLoaderModelOnly') && !n.bypassed)
    .map((n) => ({
      name: n.values?.lora_name || 'LoRA',
      modelStrength: Number(n.values?.strength_model ?? 0.8),
      clipStrength: Number(n.values?.strength_clip ?? 0.8),
      triggerWords: n.values?.trigger_words || '',
      civitaiId: n.values?.civitai_id || '',
    }));

  const detectedTargetProvider =
    resolvedActive.provider ||
    (googleImagenNode ? 'gemini' : undefined) ||
    (falEngineNode ? 'fal' : undefined) ||
    (videoEngineNode ? (getProviderFromNode(videoEngineNode) || 'video') : undefined) ||
    activeFrame?.params?.targetProvider ||
    '';

  const activeParams: ComfyParameters = {
    // Use ONLY the current/sole engine node's model — never invent Tongyi-MAI/Z-Image-Turbo
    checkpoint: resolvedActive.checkpoint || (selectedFrameId ? (activeFrame?.params?.checkpoint || '') : '') || '',
    seed: ksamplerNode?.values?.seed !== undefined ? Number(ksamplerNode.values.seed) : (activeFrame?.params?.seed ?? undefined),
    seedControl: (ksamplerNode?.values?.control_after_generate as any) || activeFrame?.params?.seedControl || 'randomize',
    steps: ksamplerNode?.values?.steps !== undefined ? Number(ksamplerNode.values.steps) : (activeFrame?.params?.steps ?? 25),
    cfg: ksamplerNode?.values?.cfg !== undefined ? Number(ksamplerNode.values.cfg) : (activeFrame?.params?.cfg ?? 4.5),
    // ?? not ||: imported '' (未指定) must stay empty, never forge euler/normal
    sampler: ksamplerNode?.values?.sampler_name ?? activeFrame?.params?.sampler ?? 'euler',
    scheduler: ksamplerNode?.values?.scheduler ?? activeFrame?.params?.scheduler ?? 'normal',
    denoise: ksamplerNode?.values?.denoise !== undefined ? Number(ksamplerNode.values.denoise) : (activeFrame?.params?.denoise ?? 1.0),
    width: latentNode?.values?.width !== undefined ? Number(latentNode.values.width) : (activeFrame?.params?.width ?? 1024),
    height: latentNode?.values?.height !== undefined ? Number(latentNode.values.height) : (activeFrame?.params?.height ?? 1024),
    batchSize: (selectedFrameId && activeFrame?.params?.batchSize != null)
      ? Number(activeFrame.params.batchSize)
      : (latentNode?.values?.batch_size !== undefined
          ? Number(latentNode.values.batch_size)
          : (activeFrame?.params?.batchSize ?? 1)),
    loras: (selectedFrameId ? activeFrame?.params?.loras : null) || (graphLoras.length > 0 ? graphLoras : (activeFrame?.params?.loras || [])),
    targetProvider: detectedTargetProvider as any,
    aspectRatio:
      (googleImagenNode ? googleImagenNode.values?.aspect_ratio : undefined) ||
      checkpointLoaderNode?.values?.aspect_ratio ||
      checkpointLoaderNode?.values?.aspectRatio ||
      activeFrame?.params?.aspectRatio ||
      undefined,
    imageSize: (googleImagenNode ? googleImagenNode.values?.image_size : activeFrame?.params?.imageSize) || undefined,
    size: checkpointLoaderNode?.values?.size || activeFrame?.params?.size || undefined,
    quality: checkpointLoaderNode?.values?.quality || activeFrame?.params?.quality || undefined,
    outputFormat:
      checkpointLoaderNode?.values?.output_format ||
      checkpointLoaderNode?.values?.outputFormat ||
      activeFrame?.params?.outputFormat ||
      undefined,
    background: checkpointLoaderNode?.values?.background || activeFrame?.params?.background || undefined,
    moderation: checkpointLoaderNode?.values?.moderation || activeFrame?.params?.moderation || undefined,
    resolution: checkpointLoaderNode?.values?.resolution || activeFrame?.params?.resolution || undefined,
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0c0d11] select-none font-sans">
      {/* Top Header Bar */}
      <TopBar
        nodeCount={nodes.length}
        connectionCount={connections.length}
        projectName={
          canvasMode === 'spatial' && activeFrame
            ? spatialFrameTopBarLabel(
                activeFrame.params?.targetProvider as string | undefined,
                activeFrame.params?.checkpoint
              )
            : canvases.find((c) => c.id === currentCanvasId)?.name || '活跃画布'
        }
        canvasMode={canvasMode}
        onChangeCanvasMode={setCanvasMode}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenCivitai={() => setIsCivitaiOpen(true)}
        onOpenBaseModelHub={handleOpenBaseModelHub}
        onOpenLoRAHub={handleOpenLoRAHub}
        onOpenVideoHub={handleOpenVideoHub}
        onOpenGuide={() => setIsGuideOpen(true)}
        onOpenWorkflowPresets={() => {
          setWorkflowPresetsInitialTab('presets');
          setIsWorkflowPresetsOpen(true);
        }}
        onOpenCivitaiImport={handleOpenCivitaiImport}
        onOpenProviderMatrix={() => setIsProviderMatrixOpen(true)}
        onOpenCanvasManager={() => setIsCanvasManagerOpen(true)}
        onOpenAssetManager={() => setIsAssetManagerOpen(true)}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onOpenParamsDrawer={() => setIsParamsDrawerOpen(!isParamsDrawerOpen)}
        isParamsDrawerOpen={isParamsDrawerOpen}
        onQueuePrompt={() => {
          if (canvasMode === 'spatial' && selectedFrameId) {
            handleQueueFrame(selectedFrameId);
          } else {
            handleQueuePrompt();
          }
        }}
        isExecuting={isExecuting}
        executionStatusText={executionStatusText}
        runDisabledReason={runDisabledReason}
        onClearCanvas={handleClearCanvas}
      />

      {/* Per-node checkpoint for LoRA compat: resolved from selected/sole engine or LoRA edges */}
      {(() => {
        const currentCheckpoint = resolvedActive.checkpoint || '';

        return (
          <Canvas
            canvasMode={canvasMode}
            nodes={nodes}
            connections={connections}
            spatialFrames={spatialFrames}
            transform={transform}
            selectedNodeId={selectedNodeId}
            selectedFrameId={selectedFrameId}
            onSelectNode={(id) => {
              setSelectedNodeId(id);
              if (id) setSelectedFrameId(null);
            }}
            onSelectFrame={(id) => {
              setSelectedFrameId(id);
              if (id) setSelectedNodeId(null);
            }}
            onUpdateTransform={setTransform}
            onUpdateNodePos={handleUpdateNodePos}
            onUpdateNodeValue={handleUpdateNodeValue}
            onDeleteNode={handleDeleteNode}
            onToggleCollapse={handleToggleCollapse}
            onToggleBypass={handleToggleBypass}
            onAddConnection={handleAddConnection}
            onDeleteConnection={handleDeleteConnection}
            onAddNode={handleAddNode}
            onUpdateFramePos={handleUpdateFramePos}
            onUpdateFrame={handleUpdateFrame}
            onDeleteFrame={handleDeleteFrame}
            onQueueFrame={handleQueueFrame}
            onOpenFrameInspector={(fId) => {
              setSelectedFrameId(fId);
              setIsParamsDrawerOpen(true);
            }}
            onBranchVariation={handleBranchVariation}
            onOpenCivitaiPicker={(nId) => {
              setTargetLoRANodeId(nId);
              setIsCivitaiOpen(true);
            }}
            onPreviewImage={(url) => {
              const matchedFrame = spatialFrames.find((f) => f.imageUrl === url || f.videoUrl === url);
              if (matchedFrame) {
                setInspectingMediaItem({
                  url: matchedFrame.imageUrl || url,
                  videoUrl: matchedFrame.videoUrl,
                  mediaType: matchedFrame.mediaType || 'image',
                  prompt: matchedFrame.prompt,
                  negativePrompt: matchedFrame.negativePrompt,
                  provider: matchedFrame.params.targetProvider,
                  model: matchedFrame.params.checkpoint,
                  seed: matchedFrame.params.seed,
                  steps: matchedFrame.params.steps,
                  cfg: matchedFrame.params.cfg,
                  sampler: matchedFrame.params.sampler,
                  scheduler: matchedFrame.params.scheduler,
                  width: matchedFrame.params.width,
                  height: matchedFrame.params.height,
                  loras: matchedFrame.params.loras,
                });
              } else {
                setPreviewImageUrl(url);
              }
            }}
            currentCheckpoint={currentCheckpoint}
            onAutoFixCheckpoint={handleAutoFixCheckpoint}
            onOpenModelHub={(cat) => {
              setModelHubCategory(cat || 'all');
              setIsModelHubOpen(true);
            }}
            onClearCanvas={handleClearCanvas}
          />
        );
      })()}

      {/* Modern Floating Bottom Island Dock */}
      <ModernToolDock
        canvasMode={canvasMode}
        zoom={transform.scale}
        onZoomIn={() =>
          setTransform((prev) => ({
            ...prev,
            scale: Math.min(prev.scale * 1.15, 2.5),
          }))
        }
        onZoomOut={() =>
          setTransform((prev) => ({
            ...prev,
            scale: Math.max(prev.scale / 1.15, 0.15),
          }))
        }
        onZoomReset={() => setTransform((prev) => ({ ...prev, scale: 1.0 }))}
        onFitView={handleResetView}
        isMinimapOpen={isMinimapOpen}
        onToggleMinimap={() => setIsMinimapOpen(!isMinimapOpen)}
        onAddSpatialFrame={handleAddSpatialFrame}
        onAddNode={handleAddNode}
        onOpenCivitai={() => setIsCivitaiOpen(true)}
        onClearCanvas={handleClearCanvas}
      />

      {/* Floating ComfyUI Parameter Inspector Drawer */}
      {isParamsDrawerOpen && (
        <aside className="fixed top-16 right-4 bottom-4 w-96 z-40 animate-in slide-in-from-right-4 duration-200">
          <ParameterInspector
            params={activeParams}
            positivePrompt={activePositivePrompt}
            onChangePositivePrompt={(newPrompt) => {
              // Update CLIPTextEncode, GoogleImagenNode, and PromptRefinerLLM in graph
              setNodes((prev) =>
                prev.map((n) => {
                  if (n.type === 'CLIPTextEncode') {
                    return { ...n, values: { ...(n.values || {}), text: newPrompt } };
                  }
                  if (n.type === 'GoogleImagenNode') {
                    return { ...n, values: { ...(n.values || {}), prompt: newPrompt } };
                  }
                  if (n.type === 'PromptRefinerLLM') {
                    return { ...n, values: { ...(n.values || {}), concept: newPrompt } };
                  }
                  return n;
                })
              );
              // Update active spatial frame ONLY
              const targetFrameId = selectedFrameId || (spatialFrames.length > 0 ? spatialFrames[0].id : null);
              if (targetFrameId) {
                setSpatialFrames((prev) =>
                  prev.map((f) => (f.id === targetFrameId ? { ...f, prompt: newPrompt } : f))
                );
              }
            }}
            negativePrompt={activeNegativePrompt}
            onChangeNegativePrompt={(newPrompt) => {
              // Update CLIPTextEncodeNegative and GoogleImagenNode in graph
              setNodes((prev) =>
                prev.map((n) => {
                  if (n.type === 'CLIPTextEncodeNegative') {
                    return { ...n, values: { ...(n.values || {}), text: newPrompt } };
                  }
                  if (n.type === 'GoogleImagenNode') {
                    return { ...n, values: { ...(n.values || {}), negative_prompt: newPrompt } };
                  }
                  return n;
                })
              );
              // Update active spatial frame ONLY
              const targetFrameId = selectedFrameId || (spatialFrames.length > 0 ? spatialFrames[0].id : null);
              if (targetFrameId) {
                setSpatialFrames((prev) =>
                  prev.map((f) => (f.id === targetFrameId ? { ...f, negativePrompt: newPrompt } : f))
                );
              }
            }}
            onChange={(newParams) => {
              // Update active spatial frame ONLY
              const targetFrameId = selectedFrameId || (spatialFrames.length > 0 ? spatialFrames[0].id : null);
              if (targetFrameId) {
                setSpatialFrames((prev) =>
                  prev.map((f) => (f.id === targetFrameId ? { ...f, params: { ...f.params, ...newParams } } : f))
                );
              }
              // Update matching graph nodes
              setNodes((prev) =>
                prev.map((n) => {
                  if (n.type === 'KSampler') {
                    return {
                      ...n,
                      values: {
                        ...n.values,
                        steps: newParams.steps,
                        cfg: newParams.cfg,
                        sampler_name: newParams.sampler,
                        scheduler: newParams.scheduler,
                        seed: newParams.seed,
                        control_after_generate: newParams.seedControl || n.values.control_after_generate,
                        denoise: newParams.denoise,
                      },
                    };
                  }
                  if (n.type === 'LoRALoader') {
                    const matchingLora = (newParams.loras || []).find((l) => l.name === n.values?.lora_name);
                    if (matchingLora) {
                      return {
                        ...n,
                        values: {
                          ...n.values,
                          strength_model: matchingLora.modelStrength,
                          strength_clip: matchingLora.clipStrength,
                        },
                      };
                    }
                  }
                  if (n.type === 'CheckpointLoaderSimple') {
                    const updatedValues: Record<string, any> = {
                      ...n.values,
                      ckpt_name: newParams.checkpoint,
                      // Persist compat options onto checkpoint node so graph/request sees them
                      size: newParams.size,
                      quality: newParams.quality,
                      output_format: newParams.outputFormat,
                      background: newParams.background,
                      moderation: newParams.moderation,
                      resolution: newParams.resolution,
                      aspect_ratio: newParams.aspectRatio,
                      n: newParams.batchSize,
                      // Always track provider so title and schema selects stay in sync
                      // (empty-string default previously blocked write-back → stuck GROK_COMPAT title)
                      targetProvider: newParams.targetProvider || n.values?.targetProvider || '',
                    };
                    return {
                      ...n,
                      title: checkpointNodeTitle(updatedValues.targetProvider, newParams.checkpoint),
                      values: updatedValues,
                    };
                  }
                  if (n.type === 'GoogleImagenNode') {
                    return {
                      ...n,
                      values: {
                        ...n.values,
                        model: newParams.checkpoint.includes('gemini') || newParams.checkpoint.includes('imagen')
                          ? newParams.checkpoint
                          : n.values.model,
                        aspect_ratio: newParams.aspectRatio || '',
                        image_size: newParams.imageSize || '',
                      },
                    };
                  }
                  if (n.type === 'EmptyLatentImage') {
                    return {
                      ...n,
                      values: {
                        ...n.values,
                        width: newParams.width,
                        height: newParams.height,
                        batch_size: newParams.batchSize ?? n.values?.batch_size ?? 1,
                      },
                    };
                  }
                  return n;
                })
              );
            }}
            onOpenCivitai={() => setIsCivitaiOpen(true)}
            onOpenModelHub={() => setIsModelHubOpen(true)}
            onOpenGuide={() => setIsGuideOpen(true)}
            onInsertTriggerWords={(words) => {
              const newPrompt = activePositivePrompt ? `${words}, ${activePositivePrompt}` : words;
              setNodes((prev) =>
                prev.map((n) => {
                  if (n.type === 'CLIPTextEncode') {
                    return { ...n, values: { ...(n.values || {}), text: newPrompt } };
                  }
                  if (n.type === 'GoogleImagenNode') {
                    return { ...n, values: { ...(n.values || {}), prompt: newPrompt } };
                  }
                  return n;
                })
              );
              const targetFrameId = selectedFrameId || (spatialFrames.length > 0 ? spatialFrames[0].id : null);
              if (targetFrameId) {
                setSpatialFrames((prev) =>
                  prev.map((f) => (f.id === targetFrameId ? { ...f, prompt: newPrompt } : f))
                );
              }
            }}
            onClose={() => setIsParamsDrawerOpen(false)}
            title={selectedNode ? `节点调试: ${selectedNode.title}` : activeFrame ? `${paramsDrawerFramePrefix(activeFrame.params.targetProvider)}: ${activeFrame.title}` : '参数总控台'}
          />
        </aside>
      )}

      {/* Radar Minimap */}
      <Minimap
        nodes={nodes}
        frames={spatialFrames}
        transform={transform}
        onUpdateTransform={setTransform}
        isOpen={isMinimapOpen}
        onToggle={() => setIsMinimapOpen(!isMinimapOpen)}
      />

      {/* Real Live API Model Hub Modal */}
      <ModelHubModal
        isOpen={isModelHubOpen}
        onClose={() => setIsModelHubOpen(false)}
        initialCategory={modelHubCategory}
        currentCheckpoint={
          resolvedActive.checkpoint ||
          (selectedFrameId ? spatialFrames.find((f) => f.id === selectedFrameId)?.params?.checkpoint : undefined) ||
          ''
        }
        onSelectModel={handleSelectModelFromHub}
        onAddModelNode={(mId, mName, prov, extraData) => {
          let detectedProvider = prov;
          const lowerId = mId.toLowerCase();
          const lowerProv = (prov || '').toLowerCase();
          const isTa = [
            'strong_text2image', 'photoreal_studio', 'anime_lab', 'oc_character',
            'text2video_wan', 'text2video_ltx', 'image2video_wan', 'image2video_ltx',
            'smart_edit', 'image_upscaler', 'background_remover', 'extend_image_sd15',
            'live_wallpaper', 'old_photo_restore', 'three_view_flux_kontext', 'watermark_remove',
            'oc_garment'
          ].some((prefix) => lowerId.includes(prefix));

          if (!detectedProvider || detectedProvider === 'Cloud API') {
            if (lowerProv.includes('tensor') || lowerId.includes('tensor') || /^\d{10,25}$/.test(mId) || isTa) {
              detectedProvider = 'tensorart';
            } else if (lowerProv.includes('civitai') || lowerId.includes('civitai') || lowerId.includes('krea2') || lowerId.startsWith('urn:air:')) {
              detectedProvider = 'civitai';
            } else if (lowerProv.includes('agnes') || lowerId.includes('agnes')) {
              detectedProvider = 'agnes';
            } else if (lowerProv.includes('modelscope') || lowerId.includes('damo/') || lowerId.includes('wan2.1') || lowerId.includes('qwen')) {
              detectedProvider = 'modelscope';
            } else if (lowerProv.includes('sensenova') || lowerId.includes('deepseek') || lowerId.includes('sensenova') || lowerId.includes('glm')) {
              detectedProvider = 'sensenova';
            } else if (lowerProv.includes('gemini') || lowerId.includes('imagen') || lowerId.includes('gemini')) {
              detectedProvider = 'gemini';
            } else if (lowerProv.includes('hugging') || lowerId.includes('black-forest-labs') || lowerId.includes('stabilityai') || lowerId.includes('runwayml')) {
              detectedProvider = 'huggingface';
            } else if (lowerProv.includes('nanogpt') || lowerId.includes('flux-schnell') || lowerId.includes('sdxl-turbo')) {
              detectedProvider = 'nanogpt';
            } else if (lowerProv.includes('fal') || lowerId.includes('fal-ai')) {
              detectedProvider = 'fal';
            } else {
              detectedProvider = 'civitai';
            }
          }

          const isVideoModel =
            extraData?.category === 'Video' ||
            extraData?.type === 'MotionModule' ||
            modelHubCategory === 'video' ||
            lowerId.includes('video') ||
            lowerId.includes('wan2.1-t2v') ||
            lowerId.includes('wan2') ||
            lowerId.includes('text2video') ||
            lowerId.includes('image2video') ||
            lowerId.includes('ltx-video') ||
            lowerId.includes('kling') ||
            lowerId.includes('cogvideox') ||
            lowerId.includes('minimax') ||
            lowerId.includes('hunyuanvideo');

          if (isVideoModel) {
            const newNodeId = `node-video-${Date.now()}`;
            const def = NODE_DEFINITIONS['AIVideoNode'];
            const newNode: NodeInstance = {
              id: newNodeId,
              type: 'AIVideoNode',
              title: `AI Video (${mName.split('/').pop()})`,
              pos: {
                x: Math.round(-transform.x / transform.scale + 120),
                y: Math.round(-transform.y / transform.scale + 160),
              },
              width: 320,
              inputs: def ? def.inputs : [{ id: 'prompt', name: 'prompt', label: 'Prompt', type: 'STRING' }],
              outputs: def ? def.outputs : [{ id: 'video', name: 'video', label: 'VIDEO', type: 'VIDEO' }],
              values: {
                model: mId,
                targetProvider: detectedProvider,
                prompt: 'Cinematic dynamic scene, high quality, 4k ultra-detailed, photorealistic motion',
                aspect_ratio: '16:9',
                duration: 5,
                fps: 24,
                steps: 30,
                cfg: 6.0,
              },
              state: 'idle',
            };
            setNodes((prev) => [...prev, newNode]);
            setSelectedNodeId(newNodeId);
          } else {
            const newNodeId = `node-ckpt-${Date.now()}`;
            const def = NODE_DEFINITIONS['CheckpointLoaderSimple'];
            const newNode: NodeInstance = {
              id: newNodeId,
              type: 'CheckpointLoaderSimple',
              title: `Load Checkpoint (${mName.split('/').pop()})`,
              pos: {
                x: Math.round(-transform.x / transform.scale + 120),
                y: Math.round(-transform.y / transform.scale + 160),
              },
              width: 290,
              inputs: [],
              outputs: def ? def.outputs : [],
              values: { ckpt_name: mId, targetProvider: detectedProvider },
              state: 'idle',
            };
            setNodes((prev) => [...prev, newNode]);
            setSelectedNodeId(newNodeId);
          }
        }}
        onAddLora={(lora) => {
          if (selectedFrameId) {
            const frame = spatialFrames.find((f) => f.id === selectedFrameId);
            if (frame) {
              const existingLoras = frame.params.loras || [];
              const updatedLoras = [
                ...existingLoras,
                {
                  name: lora.name,
                  civitaiId: lora.civitaiId,
                  modelStrength: lora.modelStrength,
                  clipStrength: lora.clipStrength,
                  triggerWords: lora.triggerWords || '',
                },
              ];
              let updatedPrompt = frame.prompt;
              if (lora.triggerWords && !frame.prompt.includes(lora.triggerWords)) {
                updatedPrompt = `${lora.triggerWords}, ${frame.prompt}`;
              }
              handleUpdateFrame(selectedFrameId, {
                prompt: updatedPrompt,
                params: { ...frame.params, loras: updatedLoras },
              });
            }
          }
        }}
        onAddLoraNode={(loraName, triggerWords, baseModel) => {
          handleAddLoRANodeToCanvas({
            name: loraName,
            civitaiId: '',
            triggerWords: triggerWords || '',
            baseModel,
          });
        }}
        onSelectLoRAWithBaseModel={handleSelectLoRAWithBaseModel}
        onOpenDedicatedLoRAHub={() => {
          setIsModelHubOpen(false);
          setIsCivitaiOpen(true);
        }}
      />

      {/* Backend Settings Modal */}
      <BackendSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        apiKeys={apiKeys}
        onSaveKeys={(newKeys) => {
          setApiKeys(newKeys);
          saveStoredApiKeys(newKeys);
        }}
      />

      {/* Unified LoRA & Model Hub Modal */}
      <CivitaiModal
        isOpen={isCivitaiOpen}
        onClose={() => setIsCivitaiOpen(false)}
        onSelectLoRA={handleSelectLoRAFromCivitai}
        onAddLoRANodeToCanvas={handleAddLoRANodeToCanvas}
        onSelectLoRAWithBaseModel={handleSelectLoRAWithBaseModel}
      />

      {/* Generation History Modal */}
      <HistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={history}
        onApplyPrompt={(prompt, negPrompt) => {
          if (selectedFrameId) {
            handleUpdateFrame(selectedFrameId, { prompt, negativePrompt: negPrompt || '' });
          } else {
            setNodes((prev) =>
              prev.map((n) => {
                if (n.type === 'CLIPTextEncode') {
                  return { ...n, values: { ...n.values, text: prompt } };
                }
                return n;
              })
            );
          }
        }}
        onDeleteItem={handleDeleteHistoryItem}
        onClearAll={handleClearHistory}
      />

      {/* ComfyUI & LoRA Onboarding Guide Modal */}
      <ComfyGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        onOpenModelHub={() => setIsModelHubOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Workflow Presets & Templates Modal */}
      <WorkflowPresetsModal
        isOpen={isWorkflowPresetsOpen}
        onClose={() => setIsWorkflowPresetsOpen(false)}
        onLoadPreset={handleLoadPreset}
        onLoadAndRunPreset={handleLoadAndRunPreset}
        currentNodes={nodes}
        currentConnections={connections}
        currentSpatialFrames={spatialFrames}
        onImportWorkflowData={(data) => {
          if (data.nodes) setNodes(data.nodes);
          if (data.connections) setConnections(data.connections);
          if (data.spatialFrames) setSpatialFrames(data.spatialFrames);
          setTimeout(handleResetView, 60);
        }}
        onClearCanvas={handleClearCanvas}
        initialTab={workflowPresetsInitialTab}
      />

      {/* Provider Matrix & Connection Wire Guide Modal */}
      <ProviderMatrixModal
        isOpen={isProviderMatrixOpen}
        onClose={() => setIsProviderMatrixOpen(false)}
        onOpenSettings={() => {
          setIsProviderMatrixOpen(false);
          setIsSettingsOpen(true);
        }}
      />

      {/* Multi-Canvas Project Boards Manager Modal */}
      <CanvasManagerModal
        isOpen={isCanvasManagerOpen}
        onClose={() => setIsCanvasManagerOpen(false)}
        currentProjectId={currentCanvasId}
        canvases={canvases}
        onSelectCanvas={handleSelectCanvas}
        onCreateNewCanvas={handleCreateNewCanvas}
        onCloneCanvas={handleCloneCanvas}
        onDeleteCanvas={handleDeleteCanvas}
        onRenameCanvas={handleRenameCanvas}
        onSaveCurrentAsNew={handleSaveCurrentAsNew}
      />

      {/* Unified Media Asset Manager Library Modal */}
      <AssetManagerModal
        isOpen={isAssetManagerOpen}
        onClose={() => setIsAssetManagerOpen(false)}
        history={history}
        onAddToCanvasAsFrame={handleAddToCanvasAsFrame}
        onUseAsReference={handleUseAsReference}
        onPreviewImage={setPreviewImageUrl}
        onDeleteAsset={handleDeleteHistoryItem}
        onDeleteBatchAssets={handleDeleteBatchHistoryItems}
        onClearAllHistory={handleClearHistory}
        onRefreshHistory={async () => {
          const { fetchHistory } = await import('./services/api');
          const h = await fetchHistory();
          if (h) setHistory(h);
        }}
      />

      {/* Real-time Floating Notification Toast */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-auto animate-in slide-in-from-top-4 duration-300">
          <div
            className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-xl border ${
              toast.type === 'success'
                ? 'bg-[#121c17]/95 border-emerald-500/50 text-white shadow-emerald-950/60 ring-1 ring-emerald-500/30'
                : toast.type === 'error'
                ? 'bg-[#201316]/95 border-rose-500/50 text-white shadow-rose-950/60 ring-1 ring-rose-500/30'
                : 'bg-[#181920]/95 border-amber-500/50 text-white shadow-amber-950/60'
            }`}
          >
            {toast.imageUrl && !toastThumbBroken && (
              <img
                src={toast.imageUrl}
                alt="Output Preview"
                className="w-11 h-11 rounded-lg object-cover border border-white/20 shrink-0 cursor-pointer hover:scale-105 transition-transform shadow-md"
                onClick={() => setPreviewImageUrl(toast.imageUrl!)}
                onError={() => setToastThumbBroken(true)}
                onLoad={(e) => {
                  const img = e.currentTarget;
                  if (img.naturalWidth <= 2 || img.naturalHeight <= 2) setToastThumbBroken(true);
                }}
                title="点击放大预览原图"
              />
            )}
            <div className="max-w-md text-xs">
              <div className="font-bold text-sm tracking-wide flex items-center gap-2">
                <span>{toast.title}</span>
                {toast.type === 'success' && (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30">
                    Done
                  </span>
                )}
              </div>
              <div className="text-slate-300 mt-0.5 line-clamp-2 leading-relaxed">
                {toast.message}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-2">
              <button
                onClick={() => setIsHistoryOpen(true)}
                className="px-2.5 py-1.5 rounded-lg bg-[#272a38] hover:bg-[#34384b] text-cyan-300 font-semibold text-xs border border-cyan-500/30 transition-colors shadow-sm"
              >
                查看历史
              </button>
              {toast.imageUrl && !toastThumbBroken && (
                <button
                  onClick={() => setPreviewImageUrl(toast.imageUrl!)}
                  className="px-2 py-1.5 rounded-lg bg-[#272a38] hover:bg-[#34384b] text-slate-300 font-semibold text-xs border border-slate-600 transition-colors shadow-sm"
                >
                  放大
                </button>
              )}
              <button
                onClick={() => setToast(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Resolution & Parameter Inspector Lightbox Modal */}
      {inspectingMediaItem && (
        <ImageDetailModal
          isOpen={!!inspectingMediaItem}
          onClose={() => setInspectingMediaItem(null)}
          item={inspectingMediaItem}
          onApplyToCanvas={(params) => {
            if (params.prompt && selectedFrameId) {
              handleUpdateFrame(selectedFrameId, {
                prompt: params.prompt,
                negativePrompt: params.negativePrompt || '',
                params: {
                  ...activeFrame?.params,
                  checkpoint: params.checkpoint || activeFrame?.params?.checkpoint,
                  targetProvider: (params.provider as any) || activeFrame?.params?.targetProvider,
                  seed: params.seed ?? activeFrame?.params?.seed,
                  steps: params.steps ?? activeFrame?.params?.steps,
                  cfg: params.cfg ?? activeFrame?.params?.cfg,
                },
              });
            } else if (params.prompt) {
              setNodes((prev) =>
                prev.map((n) => {
                  if (n.type === 'CLIPTextEncode') {
                    return { ...n, values: { ...n.values, text: params.prompt } };
                  }
                  return n;
                })
              );
            }
          }}
          onSendToImg2Img={(imageUrl, prompt) => {
            handleBranchVariation({
              id: `frame-${Date.now()}`,
              title: `图生图衍生分支`,
              createdAt: Date.now(),
              pos: { x: (activeFrame?.pos?.x || 200) + 520, y: activeFrame?.pos?.y || 200 },
              width: 512,
              height: 512,
              prompt: prompt || activeFrame?.prompt || '',
              negativePrompt: activeFrame?.negativePrompt || '',
              imageUrl: imageUrl,
              status: 'idle',
              params: activeFrame?.params || {
                checkpoint: '',
                seed: Math.floor(Math.random() * 10000000),
                seedControl: 'randomize',
                steps: 25,
                cfg: 4.5,
                sampler: 'euler',
                scheduler: 'normal',
                denoise: 0.7,
                width: 1024,
                height: 1024,
                batchSize: 1,
                loras: [],
              },
            });
            setInspectingMediaItem(null);
          }}
          onSendToImg2Video={(imageUrl, prompt) => {
            const newFrame: SpatialFrame = {
              id: `frame-video-${Date.now()}`,
              title: 'Wan 2.1 动态视频取景框',
              createdAt: Date.now(),
              pos: { x: (activeFrame?.pos?.x || 200) + 520, y: activeFrame?.pos?.y || 200 },
              width: 540,
              height: 540,
              prompt: prompt || activeFrame?.prompt || '',
              negativePrompt: activeFrame?.negativePrompt || '',
              imageUrl: imageUrl,
              mediaType: 'video',
              status: 'idle',
              params: {
                checkpoint: 'Wan-AI/Wan2.1-T2V-1.3B',
                seed: Math.floor(Math.random() * 10000000),
                seedControl: 'randomize',
                steps: 30,
                cfg: 6.0,
                sampler: 'euler',
                scheduler: 'normal',
                denoise: 1.0,
                width: 832,
                height: 480,
                batchSize: 1,
                loras: [],
                targetProvider: 'modelscope',
              },
            };
            setSpatialFrames((prev) => [...prev, newFrame]);
            setSelectedFrameId(newFrame.id);
            setInspectingMediaItem(null);
          }}
        />
      )}

      {/* Fullscreen Image Preview Lightbox */}
      {previewImageUrl && (
        <div
          className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-6 cursor-pointer animate-in fade-in duration-200"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div className="relative max-w-5xl max-h-[90vh] flex flex-col items-center">
            <img
              src={previewImageUrl}
              alt="Generated Output Preview"
              className="max-h-[85vh] w-auto rounded-xl shadow-2xl border border-slate-700 object-contain"
            />
            <button
              onClick={() => setPreviewImageUrl(null)}
              className="absolute -top-4 -right-4 w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center shadow-lg"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
