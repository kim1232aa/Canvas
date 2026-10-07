import {migrateTensorWorkflow} from './utils/legacyTensorWorkflow';
import {ExecutionLog} from './components/ExecutionLog';
import {explicitProvider,graphBranch,catalogModelTarget} from './utils/graphEditing';
import {attachLoraToBranch,findLoraTarget} from './utils/attachLora';
import {isInvalidTensorModel} from './utils/modelCatalog';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {loadWorkspaceCache, BOARDS_KEY, ACTIVE_BOARD_KEY, MODE_KEY, isCanvasProject} from './utils/workspaceCache';
import {generationReadiness} from './utils/generationReadiness';
import {nextSeedAfterGeneration} from './utils/seedControl';
import {CloudProjectModal} from './components/CloudProjectModal';
import {saveCloudProject} from './services/api';
import { useCanvasTools } from './useCanvasTools';
import { AlertTriangle, Sparkles, Image as ImageIcon } from 'lucide-react';
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
import { executeWorkflow, extractWorkflowParameters, resolveTargetNode, shouldClearExecutionOutput } from './utils/graphEngine';
import { applyAIVideoModelSelection } from './utils/videoProvider';
import {
  PREVIEW_HANG_MS,
  isRemotePreviewUrl,
  isRealMediaSize,
  reducePreviewSettle,
  previewShowsWaiting,
  previewShowsFailure,
  previewShowsMedia,
  previewKeepMediaMounted,
  type PreviewSettleState,
} from './utils/previewHang';
import { identifyArchitectureFamily } from './utils/baseModelMatcher';
import {
  findFirstNodeOfType,
  getProviderFromNode,
  isLoraUnsupportedOnEndpoint,
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
  loraLoaderNodeTitle,
  LORA_LOADER_TYPES,
} from './utils/providerLabels';

export default function App() {
  const [initialWorkspace] = useState(() => loadWorkspaceCache([
    {id: 'canvas-zimage', name: 'Z-Image 创作画布', description: 'Hugging Face 官方 Space 文生图', updatedAt: Date.now(), nodes: WORKFLOW_PRESETS[0].nodes, connections: WORKFLOW_PRESETS[0].connections, spatialFrames: WORKFLOW_PRESETS[0].spatialFrames || []},
  ]));
  const [canvasMode, setCanvasMode] = useState<CanvasMode>(initialWorkspace.mode);
  const [transform, setTransform] = useState<CanvasTransform>(initialWorkspace.active.transform || {x: 80, y: 80, scale: 0.8});
  const [nodes, setNodes] = useState<NodeInstance[]>(initialWorkspace.active.nodes);
  const [connections, setConnections] = useState<Connection[]>(initialWorkspace.active.connections);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [spatialFrames, setSpatialFrames] = useState<SpatialFrame[]>(initialWorkspace.active.spatialFrames);
  useCanvasTools({canvasMode, nodeCount: nodes.length, connectionCount: connections.length, frameCount: spatialFrames.length}, setCanvasMode);
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(initialWorkspace.active.spatialFrames[0]?.id || null);

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
  const [toastThumbSettle, setToastThumbSettle] = useState<PreviewSettleState>('loading');
  const toastThumbSettleRef = useRef<PreviewSettleState>('loading');

  useEffect(() => {
    toastThumbSettleRef.current = 'loading';
    setToastThumbSettle('loading');
    if (!toast) return;
    const closeTimer = setTimeout(() => setToast(null), 6000);
    const thumbUrl = toast.imageUrl;
    const remote = isRemotePreviewUrl(thumbUrl);
    let hangTimer: number | undefined;
    if (thumbUrl && remote) {
      hangTimer = window.setTimeout(() => {
        const prev = toastThumbSettleRef.current;
        const next = reducePreviewSettle(prev, { type: 'hang_timeout' });
        toastThumbSettleRef.current = next;
        setToastThumbSettle(next);
      }, PREVIEW_HANG_MS);
    }
    return () => {
      clearTimeout(closeTimer);
      if (hangTimer !== undefined) window.clearTimeout(hangTimer);
    };
  }, [toast]);

  // Dev-only QA: /?preview-soft=1 shows toast with never-responding thumb (no paid generate).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('preview-soft') !== '1') return;
      setToast({
        type: 'info',
        title: '预览软验收',
        message: 'toast 远程缩略图挂起夹具（无需付费生图）',
        imageUrl: 'http://127.0.0.1:3999/preview-hang.jpg',
      });
    } catch {
      /* ignore */
    }
  }, []);

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
  const [canvases, setCanvases] = useState<CanvasProject[]>(initialWorkspace.projects);
  const [currentCanvasId, setCurrentCanvasId] = useState<string>(initialWorkspace.active.id);
  const [isCloudProjectsOpen, setIsCloudProjectsOpen] = useState(false);
  const [isSavingProject, setIsSavingProject] = useState(false);
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
      localStorage.setItem(BOARDS_KEY, JSON.stringify(canvases));
      localStorage.setItem(ACTIVE_BOARD_KEY, currentCanvasId);
      localStorage.setItem(MODE_KEY, canvasMode);
    } catch (e) {
      setToast({type: 'warning', title: '本机保存未完成', message: '浏览器存储空间不足或不可用，请使用「保存到云端」保留项目。'});
    }
  }, [canvases, currentCanvasId, canvasMode]);

  // API Keys & History
  const [apiKeys, setApiKeys] = useState<ApiKeysState>(getStoredApiKeys());
  const [history, setHistory] = useState<GenerationHistoryItem[]>([]);

  // Initialize with Default Preset for node view
  useEffect(() => {
    fetchHistory().then((items) => {
      if (items) setHistory(items);
    }).catch((err) => setToast({type: 'error', title: '历史记录读取失败', message: err.message}));
  }, []);

  // U-E2: Determine if generation/run is disabled due to missing model
  const runDisabledReason = useMemo(() => {
    if (canvasMode === 'spatial') {
      const frame = spatialFrames.find(f => f.id === selectedFrameId);
      if (!frame) return '请选择要生成的画板';
      const p = frame.params;
      return generationReadiness({hfProvider:p.hfProvider, provider: p.targetProvider, model: p.checkpoint, prompt: frame.prompt, loras: p.loras, resolution: p.resolution, shift: p.shift, randomSeed: p.randomSeed, galleryImages: p.galleryImages, seed: p.seedControl === 'randomize' ? 1 : p.seed, steps: p.steps});
    }
    if (!nodes.length) return undefined;
    try {
      const p = extractWorkflowParameters(nodes, connections, selectedNodeId || undefined);
      return generationReadiness({hfProvider:p.hfProvider, provider: p.videoProvider || p.targetProvider, model: p.checkpointModel, prompt: p.positivePrompt, loras: p.loras, resolution: p.resolution, shift: p.shift, randomSeed: p.randomSeed, galleryImages: p.galleryImages, seed: p.seed, steps: p.steps});
    } catch (error: any) { return error.message || '工作流连接不完整'; }
  }, [canvasMode, selectedFrameId, spatialFrames, nodes, connections, selectedNodeId]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key !== 'Escape' && (isSettingsOpen || isCanvasManagerOpen || isCloudProjectsOpen || isModelHubOpen || isCivitaiOpen || isHistoryOpen || isWorkflowPresetsOpen || isProviderMatrixOpen || isAssetManagerOpen || isGuideOpen)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {e.preventDefault(); handleSaveProject().catch(() => {}); return;}
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
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) && !target.isContentEditable
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
        setIsSettingsOpen(false); setIsCanvasManagerOpen(false); setIsCloudProjectsOpen(false);
        setIsModelHubOpen(false); setIsCivitaiOpen(false); setIsHistoryOpen(false);
        setIsWorkflowPresetsOpen(false); setIsProviderMatrixOpen(false); setIsAssetManagerOpen(false); setIsGuideOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, selectedFrameId, canvasMode, spatialFrames, nodes, connections, isExecuting, isSettingsOpen, isCanvasManagerOpen, isCloudProjectsOpen, isModelHubOpen, isCivitaiOpen, isHistoryOpen, isWorkflowPresetsOpen, isProviderMatrixOpen, isAssetManagerOpen, isGuideOpen, runDisabledReason]);

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
    if (!frame || frame.status === 'generating' || isExecuting) return;
    const issue = generationReadiness({hfProvider:frame.params.hfProvider, provider: frame.params.targetProvider, model: frame.params.checkpoint, prompt: frame.prompt, loras: frame.params.loras, resolution: frame.params.resolution, shift: frame.params.shift, randomSeed: frame.params.randomSeed, galleryImages: frame.params.galleryImages, seed: frame.params.seedControl === 'randomize' ? 1 : frame.params.seed, steps: frame.params.steps});
    if (issue) {setToast({type: 'warning', title: '无法生成', message: issue}); return;}

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
        executionStage: `正在整理请求参数 (${p.targetProvider.toUpperCase()})...`,
      });

      const grokOrOpenAi = p.targetProvider === 'openai_compat' || p.targetProvider === 'grok_compat';
      const grokish = p.targetProvider === 'grok_compat';
      const extraParams: Record<string, unknown> = {};
      if(p.customParameters) extraParams.custom_parameters=JSON.parse(p.customParameters);
      if (p.size) extraParams.size = p.size;
      if (p.quality) extraParams.quality = p.quality;
      if (p.outputFormat) extraParams.output_format = p.outputFormat;
      if (p.background) extraParams.background = p.background;
      if (p.moderation) extraParams.moderation = p.moderation;
      if (p.resolution) extraParams.resolution = p.resolution;
      if (p.targetProvider === 'huggingface') {
        if (p.hfProvider) extraParams.hf_provider=p.hfProvider;
        if (p.shift !== undefined) extraParams.shift = p.shift;
        if (p.randomSeed !== undefined) extraParams.random_seed = p.randomSeed;
        if (p.galleryImages !== undefined) extraParams.gallery_images = p.galleryImages;
      }
      // Modal N → extraParams.n (must reach request body; not UI-only)
      if (grokOrOpenAi && p.batchSize != null && Number(p.batchSize) > 0) {
        extraParams.n = Number(p.batchSize);
      }
      if (p.targetProvider === 'tensorart' && p.batchSize !== undefined) extraParams.count = p.batchSize;
      if (['fal','nanogpt'].includes(p.targetProvider) && p.batchSize!==undefined) extraParams.n=p.batchSize;
      if (p.falModelName) extraParams.model_name=p.falModelName;
      const falWan=p.targetProvider==='fal' && /wan-t2v|wan-i2v|wan\/v2\.1/.test(p.checkpoint);

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
        workflowSnapshot: { format: 'comfycanvas', version: 1, canvasMode: 'spatial', frame },
        prompt: finalPrompt,
        negative_prompt: frame.negativePrompt,
        model: p.checkpoint,
        provider: p.targetProvider,
        targetProvider: p.targetProvider,
        width: p.width,
        height: p.height,
        steps: p.steps,
        cfg: p.cfg,
        seed: p.seedControl === 'randomize' ? Math.floor(Math.random() * 1000000000) : p.seed,
        denoise: frame.imageUrl ? p.denoise : undefined,
        sampler_name: p.sampler,
        scheduler: p.scheduler,
        image_url: frame.imageUrl,
        isVideo,
        videoDuration: falWan ? undefined : grokish ? grokVideoDuration : (isVideo ? (frame.videoDuration ?? p.videoDuration) : undefined),
        videoFps: grokish ? undefined : (isVideo ? (p.videoFps ?? frame.videoFps) : undefined),
        videoFrames: isVideo ? p.videoFrames : undefined,
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
          params: {...p, seed: nextSeedAfterGeneration(execResult.seed, p.seedControl) ?? p.seed},
          executionProgress: 100,
          executionStage: '渲染成功，已回填画布',
          imageUrl: generatedImageUrl || frame.imageUrl,
          videoUrl: generatedVideoUrl,
          mediaType: generatedVideoUrl ? 'video' : 'image',
        });

        await fetchHistory().then(setHistory).catch((err) => setToast({type: 'warning', title: '图像已生成，历史记录读取失败', message: err.message}));
        if (execResult.historyWarning) setToast({type:'warning', title:'图像已生成', message:execResult.historyWarning, imageUrl:generatedImageUrl});
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
        if(widgetName==='targetProvider' && value!==n.values?.targetProvider) return {...n,values:{...n.values,targetProvider:value,provider:value,ckpt_name:'',model:'',model_endpoint:'',hf_provider:'',custom_parameters:undefined},state:'idle',errorMessage:undefined};
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
        if (LORA_LOADER_TYPES.has(n.type) && widgetName === 'lora_name') {
          return {
            ...n,
            title: loraLoaderNodeTitle(n.title, value),
            values: { ...(n.values || {}), lora_name: value },
          };
        }
        return { ...n, values: { ...(n.values || {}), [widgetName]: value } };
      })
    );

    if (canvasMode !== 'spatial') return;

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
          const nextCheckpoint = widgetName === 'targetProvider' ? '' : widgetName === 'ckpt_name' ? value : f.params.checkpoint;
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
              ...(widgetName === 'targetProvider' ? { targetProvider: value,checkpoint:'',hfProvider:undefined,customParameters:undefined,loras:f.params.loras } : {}),
              ...(widgetName === 'ckpt_name' ? { loras: nextLoras } : {}),
              ...(widgetName === 'aspect_ratio' ? { aspectRatio: value || undefined } : {}),
              ...(widgetName === 'resolution' ? { resolution: value || undefined } : {}),
              ...(widgetName === 'shift' ? { shift: value } : {}),
              ...(widgetName === 'random_seed' ? { randomSeed: value } : {}),
              ...(widgetName === 'gallery_images' ? { galleryImages: value } : {}),
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
              // A new run or failed run must never keep showing a previous image/video as if it were this request's result.
              outputData:
                output !== undefined
                  ? output
                  : shouldClearExecutionOutput(n.type, state, output, errorMessage)
                    ? undefined
                    : n.outputData,
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
      setNodes(prev => prev.map(node => node.id === result.executingNodeId ? {...node, values: {...node.values, seed: nextSeedAfterGeneration(result.seed, node.values.control_after_generate) ?? node.values.seed}} : node));

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
      if (canvasMode==='spatial' && selectedFrameId) {
        handleUpdateFrame(selectedFrameId, frameSyncData);
      } else if (canvasMode==='spatial' && spatialFrames.length > 0) {
        handleUpdateFrame(spatialFrames[0].id, frameSyncData);
      }

      // Refresh generation history from server
      let historyLoaded = true;
      await fetchHistory().then(setHistory).catch(() => { historyLoaded = false; });

      // Trigger high visibility toast
      setToast({
        type: result.historyWarning ? 'warning' : 'success',
        title: '🎉 工作流运行成功！',
        message: result.historyWarning || `由 ${result.provider} 渲染完成，种子: ${result.seed ?? '未返回'}。${historyLoaded ? '可在历史记录查看实际参数和工作流' : '历史记录读取失败，请重新打开历史记录'}`,
        imageUrl: result.imageUrl,
      });
    } catch (err: any) {
      console.error('Queue error:', err);
      setExecutionProgress(0);
      setExecutionStatusText('请求失败，查看执行记录');

      // Prefer the Fal/engine node the user ran; never leave it idle with empty preview.
      const currentTargetId = targetNodeId || selectedNodeId;
      const errMsg = err.message || '执行遇到错误';
      const branch=graphBranch(activeNodes,activeConns,currentTargetId);
      setNodes(prev=>prev.map(n=>branch.ids.has(n.id) ? {...n,state:n.id===branch.target?.id?'error' as const:'idle' as const,executionProgress:0,errorMessage:n.id===branch.target?.id?'请求失败，查看执行记录':undefined} : n));

      setToast({
        type: 'error',
        title: '请求未完成',
        message: `${String(err.message).split('\n')[0]}；完整响应见执行记录。`,
      });
      fetchHistory().then(setHistory).catch((err) => console.error('History refresh failed:', err.message));
    } finally {
      setIsExecuting(false);
      setExecutionProgress(0);
      setExecutionStatusText('');
    }
  };

  // One-click load preset and immediately run workflow
  const handleLoadAndRunPreset = (preset: WorkflowPreset) => {
    preset = migrateTensorWorkflow(preset);
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
    provider?: string;
    civitaiId?: string;
    triggerWords: string;
    baseModel?: string;
  }) => {
    if(lora.provider && lora.provider!=='civitai') {handleSelectLoRAWithBaseModel(lora);return;}
    // A remembered spatial selection must not redirect graph-mode mounting.
    if (canvasMode === 'spatial' && selectedFrameId) {
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

    if (canvasMode === 'graph' && !targetLoRANodeId) {handleSelectLoRAWithBaseModel({...lora,provider:'civitai'});return;}

    // Also update any targeted LoRALoader node if present
    if (canvasMode === 'graph' && targetLoRANodeId) {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === targetLoRANodeId
            ? {
                ...n,
                title: loraLoaderNodeTitle(n.title, lora.name),
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
    provider?: string;
    modelStrength?: number;
    clipStrength?: number;
  }, attach = false) => {
    const newNodeId = `node-lora-${Date.now()}`;
    const def = NODE_DEFINITIONS['LoRALoader'];

    const newNode: NodeInstance = {
      id: newNodeId,
      type: 'LoRALoader',
      title: loraLoaderNodeTitle(undefined, lora.name),
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
        source_provider: lora.provider || '',
        strength_model: lora.modelStrength ?? 0.8,
        strength_clip: lora.clipStrength ?? 0.8,
      },
      state: 'idle',
    };

    if (attach) {
      try {
        const mounted=attachLoraToBranch(nodes,connections,newNode,selectedNodeId);
        setNodes(mounted.nodes);setConnections(mounted.connections);
      } catch(error:any) {setToast({type:'error',title:'LoRA 未挂载',message:error.message});return false;}
    } else setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(newNodeId);
    return true;
  };

  // Attach to the explicitly selected provider/model; architecture is verified by its API.
  const handleSelectLoRAWithBaseModel = (lora: {name:string;provider?:string;civitaiId?:string;triggerWords?:string;baseModel?:string;modelStrength?:number;clipStrength?:number}) => {
    const frame=canvasMode==='spatial' ? spatialFrames.find(f=>f.id===selectedFrameId) : undefined;
    let chosen: {checkpoint:string;provider:string};
    try {
      if (canvasMode==='spatial') {
        if(!frame)throw new Error('请先选择目标空间画板');
        chosen={checkpoint:frame.params.checkpoint,provider:frame.params.targetProvider};
      } else {
        const target=findLoraTarget(nodes,connections,selectedNodeId);
        chosen=resolveCheckpointForNode(target.id,nodes,connections);
      }
      const source=lora.provider==='tensor'?'tensorart':lora.provider;
      if(!chosen.provider || !chosen.checkpoint || (source && source!==chosen.provider))throw new Error('请先选择同平台底模，LoRA 不会自动修改供应商或底模');
      if(isInvalidTensorModel(chosen.provider,chosen.checkpoint))throw new Error('旧 OpenWorks 工具不能挂载模型 LoRA，请先选择真实 Tensor 模型 ID');
      const unsupported=isLoraUnsupportedOnEndpoint(chosen.provider,chosen.checkpoint);
      if(unsupported.unsupported)throw new Error(unsupported.message || '所选端点不支持 LoRA');
    } catch(error:any) {setToast({type:'error',title:'LoRA 未挂载',message:error.message});return;}
    const selected={...lora,triggerWords:lora.triggerWords || '',civitaiId:chosen.provider==='civitai'?lora.civitaiId:undefined};
    if (canvasMode==='spatial') {
      const strength=lora.modelStrength ?? 0.8;
      handleUpdateFrame(frame!.id,{params:{...frame!.params,loras:[...frame!.params.loras.filter(row=>row.name!==lora.name),{...selected,modelStrength:strength,clipStrength:lora.clipStrength ?? strength}]}});
    } else if(!handleAddLoRANodeToCanvas(selected,true))return;
    setToast({type:'success',title:'LoRA 已挂载',message:`${lora.name} × ${lora.modelStrength ?? 0.8}；已接入当前${canvasMode==='graph'?'生成分支':'空间画板'}，生成前继续核实模型架构与权限。`});
  };

  // Live Model Hub selection
  const handleSelectModelFromHub = (modelId: string, modelName: string, providerHint?: string, extraData?: any) => {
    const provider = explicitProvider(providerHint);
    if (!provider) {setToast({type:'error',title:'未应用模型',message:'模型目录缺少明确供应商，请先选择供应商'});return;}
    const lowerId = modelId.toLowerCase();

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

    if (canvasMode === 'spatial') {
      const frame=spatialFrames.find(f=>f.id===selectedFrameId);
      if(!frame){setToast({type:'error',title:'未应用模型',message:'请先选择目标空间画板'});return;}
      handleUpdateFrame(frame.id,{mediaType:isVideoModel?'video':'image',params:{...frame.params,checkpoint:modelId,targetProvider:provider as ComfyParameters['targetProvider']}});
      setToast({type:'success',title:'模型已应用',message:`${modelName} · ${provider}`});return;
    }
    let targetModelNode:NodeInstance|undefined;
    try {
      targetModelNode=catalogModelTarget(nodes,connections,selectedNodeId,isVideoModel);
      if(targetModelNode && targetModelNode.type!=='CheckpointLoaderSimple' && targetModelNode.type!=='AIVideoNode' && getProviderFromNode(targetModelNode)!==provider)throw new Error('此引擎节点固定供应商，请选择对应平台的模型加载器');
    }catch(error:any){setToast({type:'error',title:'未应用模型',message:error.message});return;}

    if (isVideoModel) {
      const existingVideoNode = targetModelNode;
      if (existingVideoNode) {
        setNodes((prev) =>
          prev.map((n) => {
            if (n.id === existingVideoNode.id) {
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
            duration: '',
            fps: '',
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
      const existingCkptNode = targetModelNode;
      if (existingCkptNode) {
        setNodes((prev) =>
          prev.map((n) => {
            if (n.id === existingCkptNode.id) {
              return {
                ...n,
                title: checkpointNodeTitle(provider),
                values: {
                  ...n.values,
                  ...(n.type==='CheckpointLoaderSimple'?{ckpt_name:modelId}:n.type==='ModelScopeNode'||n.type==='ModelScopeAiNode'?{model_endpoint:modelId}:{model:modelId}),
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
    canvas = migrateTensorWorkflow(canvas);
    setCurrentCanvasId(canvas.id);
    setNodes(JSON.parse(JSON.stringify(canvas.nodes || [])));
    setConnections(JSON.parse(JSON.stringify(canvas.connections || [])));
    setSpatialFrames(JSON.parse(JSON.stringify(canvas.spatialFrames || [])));
    if (canvas.transform) setTransform(canvas.transform);
    setSelectedFrameId(canvas.spatialFrames?.[0]?.id || null);
    setSelectedNodeId(null);
    if (!canvas.transform) setTimeout(handleResetView, 60);
  };

  const handleSaveProject = async (name?: string, asNew = false) => {
    if (isSavingProject) return;
    setIsSavingProject(true);
    try {
      const existing = canvases.find(c => c.id === currentCanvasId);
      const result = await saveCloudProject({...existing, id: asNew ? crypto.randomUUID() : currentCanvasId, name: name || existing?.name || '我的创作画布', canvasMode, nodes, connections, spatialFrames, transform});
      if (!result.success || !isCanvasProject(result.project)) throw new Error('网站未确认项目保存成功');
      const project = result.project as CanvasProject;
      setCanvases(prev => [project, ...prev.filter(p => p.id !== project.id)]);
      setCurrentCanvasId(project.id);
      setToast({type: 'success', title: '已保存到云端', message: project.name});
    } catch (error: any) {
      setToast({type: 'error', title: '云端保存失败', message: error.message});
      throw error;
    } finally {setIsSavingProject(false);}
  };

  const handleCreateNewCanvas = (name: string, description: string, templateType: 'empty' | 'flux' | 'ghibli' | 'wan') => {
    let baseNodes: NodeInstance[] = [];
    let baseConns: Connection[] = [];
    let baseFrames: SpatialFrame[] = [];

    const templateId = ({flux:'fal-flux-schnell-native',ghibli:'sdxl-anime-dual-lora',wan:'modelscope-wan-workflow'} as Record<string,string>)[templateType];
    const template = WORKFLOW_PRESETS.find(p=>p.id===templateId);
    if(template) {
      baseNodes=structuredClone(template.nodes);
      baseConns=structuredClone(template.connections);
      baseFrames=structuredClone(template.spatialFrames || []);
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
    preset = migrateTensorWorkflow(preset);
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
    const provider=explicitProvider(asset.provider);
    if(!provider){setToast({type:'error',title:'未导入资产',message:'资产缺少明确供应商，请先核对其生成来源'});return;}
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
      negativePrompt: asset.negativePrompt || '',
      params: {
        checkpoint: asset.model,
        seed: asset.seed ?? undefined,
        seedControl: 'fixed',
        steps: asset.steps ?? undefined,
        cfg: asset.cfg ?? undefined,
        sampler: asset.sampler,
        scheduler: asset.scheduler,
        denoise: 1.0,
        width: asset.width ?? 1024,
        height: asset.height ?? 1024,
        batchSize: 1,
        loras: (asset.loras || []).map(l=>({name:l.name,modelStrength:l.strength ?? 0.8,clipStrength:l.strength ?? 0.8,triggerWords:''})),
        targetProvider: provider as any,
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

  /** Asset library → ComfyUI node graph: reuse LoadImage add path (no new store). */
  const handleAddNodeFromAsset = (asset: MediaAsset) => {
    if (!asset?.url) return;
    const def = NODE_DEFINITIONS['LoadImage'];
    if (!def) {
      handleAddNode('LoadImage');
      return;
    }
    const newNodeId = `node-${Date.now()}`;
    const defaultPos = {
      x: Math.round(-transform.x / transform.scale + 300),
      y: Math.round(-transform.y / transform.scale + 200),
    };
    const newNode: NodeInstance = {
      id: newNodeId,
      type: 'LoadImage',
      title: def.title,
      pos: defaultPos,
      width: 300,
      inputs: def.inputs,
      outputs: def.outputs,
      values: { ...def.defaultValues, image_url: asset.url },
      state: 'idle',
    };
    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(newNodeId);
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
  const inspectorBranch=graphBranch(nodes,connections,selectedNodeId);
  const inspectorNodes=nodes.filter(n=>inspectorBranch.ids.has(n.id));
  const googleImagenNode=findFirstNodeOfType(inspectorNodes,'GoogleImagenNode');
  const inspectorFrame=canvasMode==='spatial'?activeFrame:undefined;
  const falEngineNode = findFirstNodeOfType(inspectorNodes, 'FalAIEngineNode');
  const videoEngineNode = findFirstNodeOfType(inspectorNodes, 'AIVideoNode');
  const ksamplerNode = inspectorNodes.find((n) => n.type === 'KSampler' && !n.bypassed);
  const latentNode = inspectorNodes.find((n) => n.type === 'EmptyLatentImage' && !n.bypassed);
  const checkpointLoaderNode = findFirstNodeOfType(inspectorNodes, 'CheckpointLoaderSimple');

  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null;

  // LoRA/panel checkpoint: ONLY the selected (or sole) engine node's model — never invent Z-Image-Turbo
  const resolvedActive = canvasMode==='spatial'
    ? {checkpoint:inspectorFrame?.params.checkpoint || '',provider:inspectorFrame?.params.targetProvider || ''}
    : resolveActiveCheckpoint(inspectorNodes,connections,inspectorBranch.target?.id);
  let graphExtraction:ReturnType<typeof extractWorkflowParameters>|undefined;
  try {if(inspectorBranch.target)graphExtraction=extractWorkflowParameters(inspectorNodes,connections,inspectorBranch.target.id);}catch{/* Incomplete graphs stay editable; generation exposes validation. */}
  const promptNode=(socket:string)=>inspectorNodes.find(n=>connections.some(c=>c.fromNodeId===n.id && c.toNodeId===inspectorBranch.target?.id && c.toSocketId===socket));
  const nodePositiveText=promptNode('positive')?.values.text ?? promptNode('prompt')?.values.text ?? inspectorBranch.target?.values.prompt;
  const nodeNegativeText=promptNode('negative')?.values.text ?? inspectorBranch.target?.values.negative_prompt;

  // Single source of truth with SpatialFrame: when any frame is active (selected
  // or fallback first), inspector prompt mirrors frame.prompt / negativePrompt.
  // Avoid preferring CLIP node text while SpatialFrame shows a different string.
  const activePositivePrompt: string =
    (inspectorFrame != null ? (inspectorFrame.prompt ?? '') : null) ??
    nodePositiveText ??
    inspectorNodes.find(n=>n.type==='CLIPTextEncode')?.values?.text ??
    inspectorNodes.find(n=>n.type==='GoogleImagenNode')?.values?.prompt ??
    '';

  const activeNegativePrompt: string =
    (inspectorFrame != null ? (inspectorFrame.negativePrompt ?? '') : null) ??
    nodeNegativeText ??
    inspectorNodes.find(n=>n.type==='CLIPTextEncodeNegative')?.values?.text ??
    inspectorNodes.find(n=>n.type==='GoogleImagenNode')?.values?.negative_prompt ??
    '';

  const graphLoras = inspectorNodes
    .filter((n) => (n.type === 'LoRALoader' || n.type === 'LoraLoader' || n.type === 'LoraLoaderModelOnly') && !n.bypassed)
    .map((n) => ({
      name: String(n.values?.lora_name ?? '').trim(),
      modelStrength: Number(n.values?.strength_model ?? 0.8),
      clipStrength: Number(n.values?.strength_clip ?? 0.8),
      triggerWords: n.values?.trigger_words || '',
      civitaiId: n.values?.civitai_id || '',
    }))
    .filter((l) => l.name.length > 0);

  const detectedTargetProvider =
    resolvedActive.provider ||
    (inspectorNodes.some(n=>n.type==='GoogleImagenNode') ? 'gemini' : undefined) ||
    (falEngineNode ? 'fal' : undefined) ||
    (videoEngineNode ? (getProviderFromNode(videoEngineNode) || 'video') : undefined) ||
    inspectorFrame?.params?.targetProvider ||
    '';

  const graphParams: ComfyParameters = {
    // Use ONLY the current/sole engine node's model — never invent Tongyi-MAI/Z-Image-Turbo
    checkpoint: resolvedActive.checkpoint || (selectedFrameId ? (inspectorFrame?.params?.checkpoint || '') : '') || '',
    seed: graphExtraction?.seed,
    seedControl: (inspectorBranch.target?.values.control_after_generate as any) || 'fixed',
    steps: graphExtraction?.steps,
    cfg: graphExtraction?.cfg,
    // ?? not ||: imported '' (未指定) must stay empty, never forge euler/normal
    sampler: graphExtraction?.sampler,
    scheduler: graphExtraction?.scheduler,
    denoise: ksamplerNode?.values?.denoise !== undefined ? Number(ksamplerNode.values.denoise) : (inspectorFrame?.params?.denoise ?? 1.0),
    width: graphExtraction?.width ?? (Number(latentNode?.values.width) || 0),
    height: graphExtraction?.height ?? (Number(latentNode?.values.height) || 0),
    batchSize: (selectedFrameId && inspectorFrame?.params?.batchSize != null)
      ? Number(inspectorFrame.params.batchSize)
      : (latentNode?.values?.batch_size !== undefined
          ? Number(latentNode.values.batch_size)
          : (inspectorFrame?.params?.batchSize ?? 1)),
    loras: inspectorFrame ? inspectorFrame.params.loras : graphLoras,
    targetProvider: detectedTargetProvider as any,
    aspectRatio:
      (googleImagenNode ? googleImagenNode.values?.aspect_ratio : undefined) ||
      checkpointLoaderNode?.values?.aspect_ratio ||
      checkpointLoaderNode?.values?.aspectRatio ||
      inspectorFrame?.params?.aspectRatio ||
      undefined,
    imageSize: (googleImagenNode ? googleImagenNode.values?.image_size : inspectorFrame?.params?.imageSize) || undefined,
    size: checkpointLoaderNode?.values?.size || inspectorFrame?.params?.size || undefined,
    quality: checkpointLoaderNode?.values?.quality || inspectorFrame?.params?.quality || undefined,
    outputFormat:
      checkpointLoaderNode?.values?.output_format ||
      checkpointLoaderNode?.values?.outputFormat ||
      inspectorFrame?.params?.outputFormat ||
      undefined,
    background: checkpointLoaderNode?.values?.background || inspectorFrame?.params?.background || undefined,
    moderation: checkpointLoaderNode?.values?.moderation || inspectorFrame?.params?.moderation || undefined,
    resolution: checkpointLoaderNode?.values?.resolution || inspectorFrame?.params?.resolution || undefined,
    shift: checkpointLoaderNode?.values?.shift ?? inspectorFrame?.params?.shift,
    randomSeed: checkpointLoaderNode?.values?.random_seed ?? inspectorFrame?.params?.randomSeed,
    customParameters: checkpointLoaderNode?.values?.custom_parameters,
    hfProvider: checkpointLoaderNode?.values?.hf_provider,
    galleryImages: checkpointLoaderNode?.values?.gallery_images ?? inspectorFrame?.params?.galleryImages,
  };

  const activeParams = inspectorFrame ? inspectorFrame.params : graphParams;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0c0d11] select-none font-sans">
      <ExecutionLog />
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
        onOpenCloudProjects={() => setIsCloudProjectsOpen(true)}
        onSaveProject={() => {handleSaveProject().catch(() => {});}}
        isSavingProject={isSavingProject}
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
        <aside className="fixed top-[168px] right-4 bottom-4 w-96 max-w-[calc(100vw-2rem)] z-40 animate-in slide-in-from-right-4 duration-200">
          <ParameterInspector
            params={activeParams}
            positivePrompt={activePositivePrompt}
            onChangePositivePrompt={(newPrompt) => {
              if(canvasMode==='graph' && inspectorBranch.error){setToast({type:'error',title:'未修改提示词',message:inspectorBranch.error});return;}
              // Update CLIPTextEncode, GoogleImagenNode, and PromptRefinerLLM in graph
              setNodes((prev) =>
                prev.map((n) => {
                  if(canvasMode!=='graph' || !inspectorBranch.ids.has(n.id))return n;
                  if (n.type === 'CLIPTextEncode' && connections.some(c=>c.fromNodeId===n.id && c.toNodeId===inspectorBranch.target?.id && ['positive','prompt'].includes(c.toSocketId))) {
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
              if (canvasMode==='spatial' && targetFrameId) {
                setSpatialFrames((prev) =>
                  prev.map((f) => (f.id === targetFrameId ? { ...f, prompt: newPrompt } : f))
                );
              }
            }}
            negativePrompt={activeNegativePrompt}
            onChangeNegativePrompt={(newPrompt) => {
              if(canvasMode==='graph' && inspectorBranch.error){setToast({type:'error',title:'未修改提示词',message:inspectorBranch.error});return;}
              // Update CLIPTextEncodeNegative and GoogleImagenNode in graph
              setNodes((prev) =>
                prev.map((n) => {
                  if(canvasMode!=='graph' || !inspectorBranch.ids.has(n.id))return n;
                  if (n.type === 'CLIPTextEncodeNegative' || (n.type==='CLIPTextEncode' && connections.some(c=>c.fromNodeId===n.id && c.toNodeId===inspectorBranch.target?.id && c.toSocketId==='negative'))) {
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
              if (canvasMode==='spatial' && targetFrameId) {
                setSpatialFrames((prev) =>
                  prev.map((f) => (f.id === targetFrameId ? { ...f, negativePrompt: newPrompt } : f))
                );
              }
            }}
            onChange={(newParams) => {
              if(canvasMode==='graph' && inspectorBranch.error){setToast({type:'error',title:'未修改参数',message:inspectorBranch.error});return;}
              // Update active spatial frame ONLY
              const targetFrameId = selectedFrameId || (spatialFrames.length > 0 ? spatialFrames[0].id : null);
              if (canvasMode==='spatial' && targetFrameId) {
                setSpatialFrames((prev) =>
                  prev.map((f) => (f.id === targetFrameId ? { ...f, params: { ...f.params, ...newParams } } : f))
                );
              }
              // Update matching graph nodes
              setNodes((prev) =>
                prev.map((n) => {
                  if(canvasMode!=='graph' || !inspectorBranch.ids.has(n.id))return n;
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
                  if (LORA_LOADER_TYPES.has(n.type)) {
                    const matchingLora = (newParams.loras || []).find((l) => l.name === n.values?.lora_name);
                    if (matchingLora) {
                      return {
                        ...n,
                        title: loraLoaderNodeTitle(n.title, n.values?.lora_name),
                        values: {
                          ...n.values,
                          strength_model: matchingLora.modelStrength,
                          strength_clip: matchingLora.clipStrength,
                        },
                      };
                    }
                    // Removed from inspector stack: clear name + title so header matches empty state.
                    // NodeItem also derives the header from values.lora_name (defense in depth).
                    if (n.values?.lora_name && !(newParams.loras || []).some((l) => l.name === n.values?.lora_name)) {
                      return {
                        ...n,
                        title: loraLoaderNodeTitle(n.title, ''),
                        values: { ...n.values, lora_name: '' },
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
                      shift: newParams.shift,
                      random_seed: newParams.randomSeed,
                      gallery_images: newParams.galleryImages,
                      hf_provider: newParams.hfProvider,
                      custom_parameters: newParams.customParameters,
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
                  if (n.type === 'FalAIEngineNode') {
                    return {...n,values:{...n.values,model:newParams.checkpoint,steps:newParams.steps,guidance_scale:newParams.cfg,seed:newParams.seed,
                      ...(newParams.width>0 && newParams.height>0 ? {resolution:`${newParams.width}x${newParams.height}`} : {})}};
                  }
                  if (n.type === 'ModelScopeNode' || n.type === 'ModelScopeAiNode')return {...n,values:{...n.values,model_endpoint:newParams.checkpoint}};
                  if (n.type === 'NanoGPTNode')return {...n,values:{...n.values,model:newParams.checkpoint}};
                  if (n.type === 'AIVideoNode')return {...n,values:{...n.values,model:newParams.checkpoint,targetProvider:newParams.targetProvider}};
                  if (n.type === 'GoogleImagenNode') {
                    return {
                      ...n,
                      values: {
                        ...n.values,
                        model: newParams.checkpoint,
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
              if(canvasMode==='graph' && inspectorBranch.error){setToast({type:'error',title:'未修改提示词',message:inspectorBranch.error});return;}
              const newPrompt = activePositivePrompt ? `${words}, ${activePositivePrompt}` : words;
              setNodes((prev) =>
                prev.map((n) => {
                  if(canvasMode!=='graph' || !inspectorBranch.ids.has(n.id))return n;
                  if (n.type === 'CLIPTextEncode' && connections.some(c=>c.fromNodeId===n.id && c.toNodeId===inspectorBranch.target?.id && ['positive','prompt'].includes(c.toSocketId))) {
                    return { ...n, values: { ...(n.values || {}), text: newPrompt } };
                  }
                  if (n.type === 'GoogleImagenNode') {
                    return { ...n, values: { ...(n.values || {}), prompt: newPrompt } };
                  }
                  return n;
                })
              );
              const targetFrameId = selectedFrameId || (spatialFrames.length > 0 ? spatialFrames[0].id : null);
              if (canvasMode==='spatial' && targetFrameId) {
                setSpatialFrames((prev) =>
                  prev.map((f) => (f.id === targetFrameId ? { ...f, prompt: newPrompt } : f))
                );
              }
            }}
            onClose={() => setIsParamsDrawerOpen(false)}
            title={canvasMode==='graph' && selectedNode ? `节点调试: ${selectedNode.title}` : inspectorFrame ? `${paramsDrawerFramePrefix(inspectorFrame.params.targetProvider)}: ${inspectorFrame.title}` : '参数总控台'}
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
        initialProvider={canvasMode === 'spatial' ? activeFrame?.params.targetProvider : resolvedActive.provider}
        isSpatialMode={canvasMode === 'spatial'}
        currentCheckpoint={
          resolvedActive.checkpoint ||
          (canvasMode==='spatial' && selectedFrameId ? spatialFrames.find((f) => f.id === selectedFrameId)?.params?.checkpoint : undefined) ||
          ''
        }
        onSelectModel={handleSelectModelFromHub}
        onAddModelNode={(mId, mName, prov, extraData) => {
          const detectedProvider = explicitProvider(prov);
          if(!detectedProvider){setToast({type:'error',title:'未添加节点',message:'缺少明确供应商，请从对应平台目录选择模型'});return;}
          const lowerId=mId.toLowerCase();

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
                duration: '',
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
        onAddLora={handleSelectLoRAWithBaseModel}
        onAddLoraNode={(loraName, triggerWords, baseModel, resource) => {
          handleAddLoRANodeToCanvas({
            name: loraName,
            civitaiId: resource?.civitaiId,
            provider: resource?.provider,
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

      <CloudProjectModal isOpen={isCloudProjectsOpen} onClose={() => setIsCloudProjectsOpen(false)} currentProjectId={currentCanvasId}
        onSaveCurrentToCloud={(name) => handleSaveProject(name, true)}
        onLoadProject={(project) => {
          if (!isCanvasProject(project)) {setToast({type: 'error', title: '无法载入项目', message: '项目格式不完整'}); return;}
          setCanvases(prev => [project, ...prev.filter(p => p.id !== project.id)]);
          handleSelectCanvas(project); setCanvasMode(project.canvasMode || 'graph');
        }} />

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
        onAddNodeFromAsset={handleAddNodeFromAsset}
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
            {toast.imageUrl && (() => {
              const remote = isRemotePreviewUrl(toast.imageUrl);
              const showWaiting = previewShowsWaiting(toastThumbSettle, remote);
              const showFailure = previewShowsFailure(toastThumbSettle);
              const showMedia = previewShowsMedia(toastThumbSettle);
              const keepMounted = previewKeepMediaMounted(toastThumbSettle, true);
              const mediaHidden = remote && !showMedia;
              const slotClass =
                'min-w-[2.75rem] w-[4.5rem] h-11 rounded-lg border border-white/20 shrink-0 relative overflow-hidden bg-[#111215] flex flex-col items-center justify-center text-slate-400';
              const applyThumb = (event: { type: 'real_media' } | { type: 'hard_fail' }) => {
                const prev = toastThumbSettleRef.current;
                const next = reducePreviewSettle(prev, event);
                toastThumbSettleRef.current = next;
                setToastThumbSettle(next);
              };
              if (!keepMounted && showFailure) {
                return (
                  <div className={slotClass} title="预览加载失败">
                    <ImageIcon className="w-4 h-4 text-slate-600" />
                    <span className="text-[9px] font-medium leading-tight text-center px-0.5 whitespace-nowrap">预览加载失败</span>
                  </div>
                );
              }
              return (
                <div
                  className={slotClass + (showMedia ? ' cursor-pointer hover:scale-105 transition-transform shadow-md' : '')}
                  onClick={showMedia ? () => setPreviewImageUrl(toast.imageUrl!) : undefined}
                  title={showMedia ? '点击放大预览原图' : showFailure ? '预览加载失败' : '预览加载中…'}
                >
                  {showWaiting && (
                    <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-0.5 bg-[#111215] pointer-events-none">
                      <ImageIcon className="w-4 h-4 text-slate-600" />
                      <span className="text-[9px] font-medium leading-tight text-center px-0.5 whitespace-nowrap">预览加载中…</span>
                    </div>
                  )}
                  {showFailure && (
                    <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-0.5 bg-[#111215] pointer-events-none">
                      <ImageIcon className="w-4 h-4 text-slate-600" />
                      <span className="text-[9px] font-medium leading-tight text-center px-0.5 whitespace-nowrap">预览加载失败</span>
                    </div>
                  )}
                  {keepMounted && (
                    <img
                      src={toast.imageUrl}
                      alt="Output Preview"
                      className={`w-full h-full object-cover ${mediaHidden ? 'opacity-0' : ''}`}
                      onError={() => applyThumb({ type: 'hard_fail' })}
                      onLoad={(e) => {
                        const img = e.currentTarget;
                        if (!isRealMediaSize(img.naturalWidth, img.naturalHeight)) {
                          applyThumb({ type: 'hard_fail' });
                        } else {
                          applyThumb({ type: 'real_media' });
                        }
                      }}
                    />
                  )}
                </div>
              );
            })()}
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
              {toast.imageUrl && previewShowsMedia(toastThumbSettle) && (
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
