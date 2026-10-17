import { computeFitTransform, measureChromeInsets, fitItemsForMode } from './utils/fitView';
import { saveImagePrefixFor } from './utils/saveImagePrefix';
import { findActualRequest, countActualRequestLoras } from './utils/actualRequestLoras';
import { modelSchemaVersion, subscribeModelSchema, getModelSizePairing } from './services/modelSchemaCache';
import {migrateTensorWorkflow} from './utils/legacyTensorWorkflow';
import {ExecutionLog} from './components/ExecutionLog';
import {spatialRequestParameters, videoSchemaIssues} from './utils/frontendParameters';
import {seedSchemaIssues} from './utils/seedRange';
import {replaceSelectedResource,applyLoraNameToNodeValues,type ResourceSelection} from './utils/resourceSelection';
import {readInspectorParameters,patchInspectorBranchNode,patchSpatialParameters,variationReference,modelCheckpoint,clearLoaderSize,loadersFedByLatent} from './utils/inspectorParameters';
import {explicitProvider,graphBranch,catalogModelTarget} from './utils/graphEditing';
import {attachLoraToBranch,findLoraTarget,removeLoraFromBranch} from './utils/attachLora';
import { parseExplicitLoraStrength } from './utils/loraStrength';
import { applyHistoryToCanvas } from './utils/applyHistoryToCanvas';
import {isInvalidTensorModel} from './utils/modelCatalog';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { scrubZeroWidthNodes, describeZeroWidthHits, preRunZeroWidthBlock } from './utils/zeroWidth';
import {loadWorkspaceCache, saveWorkspaceCache, BOARDS_KEY, ACTIVE_BOARD_KEY, MODE_KEY, isCanvasProject} from './utils/workspaceCache';
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
  fetchHistoryItem,
  fetchHistoryPage,
  getStoredApiKeys,
  saveStoredApiKeys,
  saveToHistory,
  type HistoryPage,
} from './services/api';
import { EngineRegistry } from './engines/EngineRegistry';
import { NormalizedGenerateParams } from './engines/types';
import { noteUserModelSelection, subscribeSchemaSelectResult } from './services/userModelSelection';
import { hasModelSchemaFetch } from './utils/schemaSendHint';
import { isSchemaPrefetchError, schemaFailureNodeMessage, schemaFailureTargetId, failedNodeDisplayTitle, schemaFailureModel, shouldClearSchemaFailureOnModelChange, clearSchemaFailureFromModelChange, isSchemaFailureToastForModel, applySchemaMissNodeMarks } from './utils/schemaFailure';
import { sizeOrUndef, widthHeightMismatch, localBlockTitle, schemaReadLine, localBlockCauseNodeIds, revealNodeTransform, sizeMismatchCleared } from './utils/localBlock';
import { findNonOverlappingPos } from './utils/nodeOverlap';
import { setCurrentRunTarget, beginRun, endRun, clearExecutionErrors, getExecutions, formatRecordTime, recordLocalEvent, currentRunAttach, ApiTraceError} from './services/executionTrace';
import { historySeedStatement, historyActualRequest } from './utils/historyParameters';
import { resolveFillLoraNodeId } from './utils/fillLoraNode';
import { findRunHistoryItem } from './utils/runHistoryItem';
import { isLocalBlockError } from './utils/apiFailure';
import { executeWorkflow, extractWorkflowParameters, resolveTargetNode, shouldClearExecutionOutput, clearNodeExecutionErrors, clearStaleLoraBlocks, hasStaleLoraBlock, activeLoraNodeCount, resolveRunTarget, hasReferenceImageInput, modelChainBreak, modelChainBreakDetail, preRunPrecheck, clearPriorMediaPreview, clearPriorMediaPreviews } from './utils/graphEngine';
import { getModelSchemaEntry } from './services/modelSchemaCache';
import { fetchProviderKeyStatus, providerKeyConfigured } from './services/providerKeyStatus';
import { friendlyProviderLabel } from './utils/providerLabels';
import { toastFromRunError, plainFailureConclusion, plainErrorMessage, unicodeSafeSlice, EXEC_NODE_MISSING, localBlockToastReason, upstreamFailureToast } from './utils/apiFailure';
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
  getModelFromNode,
  isLoraUnsupportedOnEndpoint,
  resolveActiveCheckpoint,
  resolveCheckpointForNode,
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
  // Model Schema arrivals re-render inspector/canvas send badges.
  React.useSyncExternalStore(subscribeModelSchema, modelSchemaVersion);
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
    /** Primary action: default history; key-missing → api-settings; I2V missing image → connect-ref (never 查看历史). */
    action?: 'history' | 'api-settings' | 'connect-ref' | 'none';
    /** When action is api-settings: provider id to select in BackendSettingsModal (e.g. gemini). */
    actionProviderId?: string;
  } | null>(null);
  const [toastThumbSettle, setToastThumbSettle] = useState<PreviewSettleState>('loading');
  const toastThumbSettleRef = useRef<PreviewSettleState>('loading');

  useEffect(() => {
    toastThumbSettleRef.current = 'loading';
    setToastThumbSettle('loading');
    if (!toast) return;
    // Failures / local blocks / warnings stay until closed (or the next run): an error must not vanish before it is read.
    const closeTimer = toast.type === 'success' || toast.type === 'info' ? setTimeout(() => setToast(null), 6000) : undefined;
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
  /** Open API settings focused on this provider (from missing-key toast). Cleared on close. */
  const [settingsInitialProvider, setSettingsInitialProvider] = useState<string | undefined>(undefined);
  const [isCivitaiOpen, setIsCivitaiOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isModelHubOpen, setIsModelHubOpen] = useState(false);
  const [modelHubCategory, setModelHubCategory] = useState<CategoryFilter>('all');
  const [modelHubInitialProvider, setModelHubInitialProvider] = useState<string | undefined>(undefined);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isParamsDrawerOpen, setIsParamsDrawerOpen] = useState(false);
  const [isMinimapOpen, setIsMinimapOpen] = useState(false);
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
    setToast(null); // suppress unrelated leftover notices on the canvas
    setModelHubCategory('checkpoint');
    setIsModelHubOpen(true);
  };

  const handleOpenLoRAHub = () => {
    setToast(null);
    setIsCivitaiOpen(true);
  };

  const handleOpenVideoHub = () => {
    setToast(null);
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
      saveWorkspaceCache(canvases, currentCanvasId, canvasMode);
    } catch (e) {
      setToast({type: 'warning', title: '本机保存未完成', message: '浏览器存储空间不足或不可用，请使用「保存到云端」保留项目。'});
    }
  }, [canvases, currentCanvasId, canvasMode]);

  // API Keys & History — open path uses real pagination (slim page, not full dump)
  const HISTORY_PAGE_SIZE = 24;
  const [apiKeys, setApiKeys] = useState<ApiKeysState>(getStoredApiKeys());
  const [history, setHistory] = useState<GenerationHistoryItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);

  const applyHistoryPage = useCallback((page: HistoryPage, mode: 'replace' | 'append') => {
    setHistory((prev) => {
      if (mode === 'replace') return page.items;
      const seen = new Set(prev.map((i) => i.id));
      return [...prev, ...page.items.filter((i) => !seen.has(i.id))];
    });
    setHistoryTotal(page.total);
    setHistoryHasMore(!!page.hasMore);
  }, []);

  const loadHistoryFirstPage = useCallback(async (): Promise<GenerationHistoryItem[]> => {
    const page = await fetchHistoryPage({ limit: HISTORY_PAGE_SIZE, offset: 0 });
    applyHistoryPage(page, 'replace');
    return page.items;
  }, [applyHistoryPage]);

  const loadHistoryMore = useCallback(async () => {
    if (historyLoadingMore || !historyHasMore) return;
    setHistoryLoadingMore(true);
    try {
      const page = await fetchHistoryPage({ limit: HISTORY_PAGE_SIZE, offset: history.length });
      applyHistoryPage(page, 'append');
    } catch (err: any) {
      setToast({ type: 'warning', title: '历史加载更多失败', message: err?.message || String(err) });
    } finally {
      setHistoryLoadingMore(false);
    }
  }, [history.length, historyHasMore, historyLoadingMore, applyHistoryPage]);

  // Initialize: first slim page only (limit=24), not all 190+
  useEffect(() => {
    loadHistoryFirstPage().catch((err) => setToast({type: 'error', title: '历史记录读取失败', message: err.message}));
  }, [loadHistoryFirstPage]);

  // clean-1358 #3: Schema GET failure on model select → toast immediately (HTTP status + first-line upstream body).
  // Reuse of a prior failure is labelled on the node; do not re-toast.
  useEffect(() => subscribeSchemaSelectResult(({ provider, model, result, reused }) => {
    // Persist Schema property names on matching Checkpoint (dropdown + hub) so badges match the run Schema.
    if (result.ok) {
      const props = result.data?.inputSchema?.properties;
      if (props && typeof props === 'object') {
        const keys = Object.keys(props);
        setNodes((prev) => prev.map((n) => {
          if (n.type !== 'CheckpointLoaderSimple') return n;
          const ckpt = String(n.values?.ckpt_name || n.values?.model || '');
          const prov = String(n.values?.targetProvider || '').toLowerCase();
          if (ckpt !== model || prov !== String(provider).toLowerCase()) return n;
          try {
            const prevCp = typeof n.values?.custom_parameters === 'string' ? JSON.parse(n.values.custom_parameters || '{}') : {};
            const next = JSON.stringify({ ...prevCp, _canvas: { ...prevCp._canvas, scope: { provider, model }, schemaProperties: keys } }, null, 2);
            if (next === n.values?.custom_parameters) return n;
            return { ...n, values: { ...n.values, custom_parameters: next } };
          } catch { return n; }
        }));
      }
      return;
    }
    if (reused) return;
    const data = result.data && typeof result.data === 'object' ? result.data : { upstreamStatus: result.status, upstreamResponseBody: typeof result.data === 'string' ? result.data : JSON.stringify(result.data ?? '') };
    const shaped = {
      ...data,
      upstreamStatus: typeof data.upstreamStatus === 'number' ? data.upstreamStatus : result.status,
      upstreamResponseBody: data.upstreamResponseBody ?? data.rawResponse ?? (typeof data.error === 'string' ? data.error : undefined),
      rawResponse: data.rawResponse,
    };
    const toast = upstreamFailureToast(shaped, `选用模型：${provider} · ${model}`)
      || { title: `HTTP ${result.status || '—'}`, message: `${typeof result.data === 'object' ? JSON.stringify(result.data) : String(result.data ?? 'Schema 读取失败')}\n选用模型：${provider} · ${model}` };
    setToast({ type: 'error', title: toast.title, message: toast.message });
  }), []);

  // videoschema: saved board / model list change → debounced Schema GET for AIVideoNode (select path notes immediately in NodeItem).
  const videoSchemaHydrateKey = nodes
    .filter((n) => n.type === 'AIVideoNode' && !n.bypassed)
    .map((n) => `${String(n.values?.targetProvider || '').trim()}\0${String(n.values?.model || '').trim()}`)
    .filter((k) => {
      const [p, m] = k.split('\0');
      return Boolean(p && m);
    })
    .sort()
    .join('|');
  useEffect(() => {
    if (!videoSchemaHydrateKey) return;
    const t = window.setTimeout(() => {
      for (const n of nodes) {
        if (n.type !== 'AIVideoNode' || n.bypassed) continue;
        const p = String(n.values?.targetProvider || '').trim();
        const m = String(n.values?.model || '').trim();
        if (p && m && hasModelSchemaFetch(p)) noteUserModelSelection(p, m);
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [videoSchemaHydrateKey]);

  // U-E2: Determine if generation/run is disabled due to missing model
  // The exact node the next graph run will execute (live with selection / graph edits); shown on the run button.
  const runTargetState = useMemo(() => {
    try { return { target: resolveRunTarget(nodes, connections, undefined, selectedNodeId), error: '' }; }
    catch (error: any) { return { target: null, error: String(error?.message || error) }; }
  }, [nodes, connections, selectedNodeId]);

  const runDisabledReason = useMemo(() => {
    if (canvasMode === 'graph' && runTargetState.error && nodes.length) return runTargetState.error;
    if (canvasMode === 'spatial') {
      const frame = spatialFrames.find(f => f.id === selectedFrameId);
      if (!frame) return '请选择要生成的画板';
      const p = frame.params;
      return generationReadiness({
        ...p,
        referenceImageUrl: frame.referenceImageUrl,
        hfProvider: p.hfProvider,
        provider: p.targetProvider === 'video' ? p.videoProvider : p.targetProvider,
        model: p.checkpoint,
        prompt: frame.prompt,
        loras: p.loras,
        resolution: p.resolution,
        shift: p.shift,
        randomSeed: p.randomSeed,
        galleryImages: p.galleryImages,
        seed: p.seedControl === 'randomize' ? 1 : p.seed,
        steps: p.steps,
        cfg: p.cfg,
        negativePrompt: frame.negativePrompt,
        width: p.width,
        height: p.height,
      });
    }
    if (!nodes.length) return undefined;
    const readinessFrom = (p: ReturnType<typeof extractWorkflowParameters>) =>
      generationReadiness({
        hfProvider: p.hfProvider,
        provider: p.videoProvider || p.targetProvider,
        model: p.checkpointModel,
        prompt: p.positivePrompt,
        loras: p.loras,
        resolution: p.resolution,
        shift: p.shift,
        randomSeed: p.randomSeed,
        galleryImages: p.galleryImages,
        seed: p.seed,
        steps: p.steps,
        cfg: p.cfg,
        negativePrompt: p.negativePrompt,
        width: p.width,
        height: p.height,
        ksamplerNodeId: p.ksamplerNodeId,
      });
    try {
      // Same target the Run button names and the run executes (runTargetState) — one source for gate, label and submit.
      return readinessFrom(extractWorkflowParameters(nodes, connections, runTargetState.target?.id || selectedNodeId || undefined));
    } catch (error: any) {
      // Stale selectedNodeId must not permanently amber-lock the bar with an internal node-… id.
      if (selectedNodeId && /未找到指定的执行节点/.test(String(error?.message || ''))) {
        try {
          return readinessFrom(extractWorkflowParameters(nodes, connections, undefined));
        } catch (error2: any) {
          return plainFailureConclusion(error2?.message) || EXEC_NODE_MISSING;
        }
      }
      return plainFailureConclusion(error?.message) || error?.message || '工作流连接不完整';
    }
  }, [canvasMode, selectedFrameId, spatialFrames, nodes, connections, selectedNodeId, runTargetState]);

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
      referenceImageUrl: variationReference(frame),
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
    const issue = generationReadiness({
      ...frame.params,
      referenceImageUrl: frame.referenceImageUrl,
      hfProvider: frame.params.hfProvider,
      provider: frame.params.targetProvider === 'video' ? frame.params.videoProvider : frame.params.targetProvider,
      model: frame.params.checkpoint,
      prompt: frame.prompt,
      loras: frame.params.loras,
      resolution: frame.params.resolution,
      shift: frame.params.shift,
      randomSeed: frame.params.randomSeed,
      galleryImages: frame.params.galleryImages,
      seed: frame.params.seedControl === 'randomize' ? 1 : frame.params.seed,
      steps: frame.params.steps,
      cfg: frame.params.cfg,
      negativePrompt: frame.negativePrompt,
      width: frame.params.width,
      height: frame.params.height,
    });
    if (issue) {setToast({type: 'warning', title: '无法生成', message: issue}); return;}

    handleUpdateFrame(frameId, {
      status: 'generating',
      executionProgress: 10,
      executionStage: '正在调度算力资源并预热引擎...',
      errorMessage: undefined,
    });
    setIsExecuting(true);
    beginRun();
    // clean-1005: select-model + run share one action — do NOT bump the sharedGet epoch here (reuse the Schema GET).
    setCurrentRunTarget(frame.title || '取景框');
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

      const normParams: NormalizedGenerateParams = {
        ...spatialRequestParameters({...frame, mediaType: isVideo ? 'video' : 'image'}),
        workflowSnapshot: { format: 'comfycanvas', version: 1, canvasMode: 'spatial', frame },
        prompt: finalPrompt,
      };
      const omissions = normParams.extraParams?.omissions;
      if (Array.isArray(omissions) && omissions.length) setToast({type:'warning', title:'请求参数未提交项', message:omissions.map(item => `${item.field}=${item.value}：${item.reason}`).join('；')});

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
            title: '引擎适配提示',
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

        await loadHistoryFirstPage().catch((err) => setToast({type: 'warning', title: '图像已生成，历史记录读取失败', message: err.message}));
        if (execResult.historyWarning) setToast({type:'warning', title:'图像已生成', message:execResult.historyWarning, imageUrl:generatedImageUrl});
        setExecutionStatusText(`生成完成 (${usedProvider})`);
      } catch (err: any) {
        if (tracker) clearInterval(tracker);
        throw err;
      }
    } catch (err: any) {
      console.error('Frame gen error:', err);
      const plainFrame = plainErrorMessage(err);
      handleUpdateFrame(frameId, {
        status: 'error',
        executionProgress: 0,
        errorMessage: plainFrame,
      });
      setExecutionStatusText(plainFrame);
      setToast({
        type: 'error',
        title: '⚠️ 取景框生成失败',
        message: plainFrame,
      });
    } finally {
      endRun();
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

  // A deleted node can be re-selected by the click that bubbles from its own trash button (or stay selected via
  // another path); a stale id then made the next run fail with 「请重新选择要运行的节点」 and send nothing.
  useEffect(() => {
    if (selectedNodeId && !nodes.some((n) => n.id === selectedNodeId)) setSelectedNodeId(null);
  }, [nodes, selectedNodeId]);

  // fix10.1: node values loaded/stored with zero-width chars (U+200B/200C/200D/FEFF/2060) are scrubbed VISIBLY:
  // toast + exec-log local event naming node/field/count. Covers every load path (cache, board switch, preset, import).
  const zwScrubbed = useRef(new WeakSet<object>());
  useEffect(() => {
    // StrictMode re-runs effects with the same nodes array: report each dirty snapshot once.
    if (zwScrubbed.current.has(nodes)) return;
    zwScrubbed.current.add(nodes);
    const { nodes: clean, hits } = scrubZeroWidthNodes(nodes);
    if (!hits.length) return;
    const total = hits.reduce((a, h) => a + h.count, 0);
    const detail = describeZeroWidthHits(hits);
    recordLocalEvent('零宽字符清洗（节点数据）', { ok: true, note: `已清除 ${total} 个零宽字符`, zeroWidthHits: hits, requestCount: 0 }, 'complete');
    setToast({ type: 'warning', title: `已清除 ${total} 个零宽字符`, message: detail });
    setNodes(clean);
  }, [nodes]);

  const handleDeleteNode = (nodeId: string) => {
    const next=removeLoraFromBranch(nodes,connections,nodeId);
    setNodes(next.nodes);
    setConnections(next.connections);
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
    const targetNode = nodes.find((n) => n.id === nodeId);
    // clean-0006: filling Empty Latent width/height must clear local-block chrome graph-wide
    // without wiping upstream failure badges (errorMessage / errorAt / 「上一次」).
    const willClearSizeMismatch =
      targetNode?.type === 'EmptyLatentImage' &&
      (widgetName === 'width' || widgetName === 'height') &&
      !!(targetNode.localBlockReason || targetNode.localBlockTitle) &&
      sizeMismatchCleared(
        widgetName === 'width' ? value : targetNode.values?.width,
        widgetName === 'height' ? value : targetNode.values?.height,
      );
    const latentFedLoaders =
      targetNode?.type === 'EmptyLatentImage' && (widgetName === 'width' || widgetName === 'height')
        ? loadersFedByLatent(nodes, connections, nodeId)
        : new Set<string>();
    setNodes((prev) => {
      const mapped = prev.map((n) => {
        if (targetNode?.type === 'CheckpointLoaderSimple' && (widgetName === 'ckpt_name' || widgetName === 'targetProvider') && n.id !== nodeId) {
          // saveempty: model/provider switch clears prior preview on sibling media nodes; do NOT retitle filename_prefix until a new image lands.
          return clearPriorMediaPreview(n);
        }
        // ws-sizenode: editing the board's Empty Latent size clears the hidden width/height copy on the loader it feeds.
        if (n.id !== nodeId && latentFedLoaders.has(n.id)) return clearLoaderSize(n);
        if (n.id !== nodeId) return n;
        // Provider switch: sync CheckpointLoader title to current provider; clear THIS node error.
        // Sibling stale errors (e.g. leftover Civitai on KSampler) cleared in post-pass below.
        if(widgetName==='targetProvider' && value!==n.values?.targetProvider) {
          const cleared = {
            ...n,
            values:{...n.values,targetProvider:value,provider:value,ckpt_name:'',model:'',model_endpoint:'',hf_provider:'',custom_parameters:undefined,resource_source:undefined,resource_kind:undefined,download_url:undefined,civitai_id:undefined},
            state:'idle' as const,
            errorMessage:undefined,
          };
          if (n.type === 'CheckpointLoaderSimple') {
            return { ...cleared, title: checkpointNodeTitle(value, '') };
          }
          return cleared;
        }
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
            values: applyLoraNameToNodeValues(n.values || {}, value),
          };
        }
        const nextVals = { ...(n.values || {}), [widgetName]: value };
        // clean-1358 #7: value update only — local chrome cascade is clearNodeExecutionErrors(keepUpstreamFailures) below.
        return { ...n, values: nextVals };
      });
      return willClearSizeMismatch
        ? clearNodeExecutionErrors(mapped) // fix3 N: 宽高拦截解除后清掉红字
        : mapped;
    });

    // clean-1358 #7: clear the top toast when the size-mismatch condition no longer holds after this edit.
    if (targetNode?.type === 'EmptyLatentImage' && (widgetName === 'width' || widgetName === 'height')) {
      const w = widgetName === 'width' ? value : targetNode.values?.width;
      const h = widgetName === 'height' ? value : targetNode.values?.height;
      // After setState the node holds the new value; mirror it for the toast check.
      const ww = widgetName === 'width' ? value : w;
      const hh = widgetName === 'height' ? value : h;
      if (sizeMismatchCleared(ww, hh)) {
        setToast((prev) => (prev && prev.type === 'error' && /宽高不齐|只填了宽|只填了高/.test(`${prev.title}\n${prev.message}`) ? null : prev));
      }
    }
    // Schema-miss described the OLD model: changing ckpt_name away from it clears that node's red box,
    // downstream 「没出图，原因见…」, and the matching bottom toast. Same model value → keep red.
    if (
      targetNode?.type === 'CheckpointLoaderSimple' &&
      widgetName === 'ckpt_name' &&
      shouldClearSchemaFailureOnModelChange(targetNode, value)
    ) {
      const failedModel = String(targetNode.errorModel || '');
      setNodes((prev) => clearSchemaFailureFromModelChange(prev, nodeId));
      setToast((prev) => (isSchemaFailureToastForModel(prev, failedModel) ? null : prev));
    }


    // P0: switching engine/provider must drop leftover red-box errors on other nodes (Civitai etc.).
    if (widgetName === 'targetProvider' && targetNode && value !== targetNode.values?.targetProvider) {
      clearExecutionErrors();
      setNodes((prev) => clearNodeExecutionErrors(prev));
      setSpatialFrames((prev) =>
        prev.map((f) =>
          f.status === 'error' || f.errorMessage
            ? { ...f, status: f.status === 'error' ? 'idle' : f.status, errorMessage: undefined }
            : f
        )
      );
    }

    if (canvasMode !== 'spatial') return;

    // Synchronize node value changes to the active spatial frame (preserving other frames)
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
            ...(widgetName === 'width' ? { width: sizeOrUndef(value) } : {}),
            ...(widgetName === 'height' ? { height: sizeOrUndef(value) } : {}),
          },
        } : f))
      );
    } else if (targetNode.type === 'LoRALoader') {
      setSpatialFrames((prev) =>
        prev.map((f) => {
          if (f.id !== activeFrameTargetId) return f;
          const currentLoras = [...f.params.loras];
          // Bind the edit to the LoRA entry of THIS node (by its lora_name), never index 0.
          const idx = currentLoras.findIndex((l) => l.name === targetNode.values?.lora_name);
          if (idx >= 0) {
            const e = { ...currentLoras[idx] };
            if (widgetName === 'lora_name') e.name = value;
            if (widgetName === 'strength_model') e.modelStrength = parseExplicitLoraStrength(value);
            if (widgetName === 'strength_clip') e.clipStrength = parseExplicitLoraStrength(value);
            if (widgetName === 'trigger_words') e.triggerWords = value;
            if (widgetName === 'civitai_id') e.civitaiId = value;
            currentLoras[idx] = e;
          } else if (currentLoras.length > 0) {
            // no entry belongs to this node: do not touch other LoRAs
          } else if (widgetName === 'lora_name' && value) {
             currentLoras.push({
               name: value,
               // strength must be set via strength_model / strength_clip widgets — never invent 0.8
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
    let runTarget: ReturnType<typeof resolveRunTarget> | undefined;
    if (activeNodes.length) {
      try { runTarget = resolveRunTarget(activeNodes, activeConns, targetNodeId, selectedNodeId); }
      catch (error: any) { setToast({type:'warning', title:'未发送请求', message:error.message}); return; }
    }
    if (runTarget) {
      const pre = preRunPrecheck(activeNodes, activeConns, runTarget.id, (p, m) => {
        const e = getModelSchemaEntry(p, m);
        if (!e || e.status !== 'ready') return undefined; // Schema not loaded yet
        return e.required || [];
      }) || videoSchemaIssues(activeNodes as any) || seedSchemaIssues(activeNodes as any, activeConns as any);
      if (pre) {
        setNodes((prev) => clearPriorMediaPreviews(prev));
        setToast({type:'warning', title:'运行前检查未通过', message:pre, action: pre === '图生视频要先连一张参考图' ? 'connect-ref' : 'none'});
        return;
      }
      // Key precheck: block locally before any generate request when the target provider has no key.
      try {
        const extracted = extractWorkflowParameters(activeNodes, activeConns, runTarget.id);
        const prov = String((extracted.targetProvider === 'video' ? extracted.videoProvider : extracted.targetProvider) || extracted.videoProvider || '').trim();
        if (prov && prov !== 'video') {
          const status = await fetchProviderKeyStatus();
          const ok = providerKeyConfigured(status, prov);
          if (ok === false) {
            const label = friendlyProviderLabel(prov) || prov;
            setNodes((prev) => clearPriorMediaPreviews(prev));
            setToast({ type: 'warning', title: '未配置密钥', message: `未配置 ${label} 的密钥`, action: 'api-settings', actionProviderId: prov });
            return;
          }
        }
      } catch (error: any) {
        // extractWorkflowParameters may throw on incomplete graphs — surface that, don't hide with a key check.
        setToast({ type: 'warning', title: '运行前检查未通过', message: error?.message || String(error) });
        return;
      }
    }
    const runTargetId = runTarget?.id;

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
    const thisRunSeq = beginRun();
    // clean-1005: select-model + run share one action — do NOT bump the sharedGet epoch here (reuse the Schema GET).
    // Toast line: target node + LoRA count actually in this run's generation request (read from the traced request body).
    const runToastLine = (runItem?: GenerationHistoryItem) => {
      // Derived from the server's actualRequest echo (what was really sent), any LoRA-carrying field.
      const posts = getExecutions().filter((r) => r.runSeq === thisRunSeq && r.method.toUpperCase() !== 'GET');
      // Same source as the history card: the recorded entry's outbound request (actualRequest or submission), else the response echo.
      const actual = (runItem ? historyActualRequest(runItem) : undefined) ?? posts.map((r) => findActualRequest(r.response)).find(Boolean);
      const n = countActualRequestLoras(actual);
      return `运行：${runTarget?.title ?? '未知节点'} · 本次请求${posts.length ? (actual ? (n ? `含 LoRA ${n} 个` : '未含 LoRA') : '未返回 actualRequest') : '未发出生成请求'}`;
    };
    setCurrentRunTarget(runTarget ? `${runTarget.title}${runTarget.auto ? '（未选中节点，按输出节点）' : ''}` : null);
    setExecutionProgress(5);
    setExecutionStatusText('正在调度模型与 LoRA 权重...');
    setToast(null); // drop stale global notices from prior hub/search/run
    // New run: clear every prior red banner / error state (local blocks AND prior upstream failures) before starting,
    // so an old 「上一次 …」 never lingers once the user re-runs. This run's own failure is written in the catch below.
    setNodes((prev) => clearNodeExecutionErrors(prev));

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
              errorMessage: state === 'running' || state === 'success'
                ? undefined
                : (errorMessage !== undefined ? errorMessage : n.errorMessage),
              errorAt: state === 'running' || state === 'success'
                ? undefined
                : (errorMessage !== undefined
                  ? (errorMessage ? new Date().toISOString() : undefined)
                  : n.errorAt),
              errorKind: state === 'running' || state === 'success' || errorMessage !== undefined ? undefined : n.errorKind,
              upstreamFailed: state === 'running' || state === 'success' ? false : n.upstreamFailed,
              // This session produced (or is replacing) the output: no longer a 刷新前的结果; remember when it arrived.
              outputAt: output !== undefined ? new Date().toISOString() : n.outputAt,
              restoredFromPreviousSession: output !== undefined || state === 'running' ? undefined : n.restoredFromPreviousSession,
              stalePriorOutput: output !== undefined || state === 'running' ? undefined : n.stalePriorOutput,
              // cleanup-serious: only retitle SaveImage prefix when a NEW image from this run lands.
              values: (output !== undefined && n.type === 'SaveImage') ? (() => {
                const ck = prev.find((x) => x.type === 'CheckpointLoaderSimple' && !x.bypassed);
                const prefix = saveImagePrefixFor(ck?.values?.targetProvider, ck?.values?.ckpt_name, n.values?.filename_prefix);
                return { ...n.values, filename_prefix: prefix };
              })() : n.values,
            };
          }
          return n;
        })
      );
    };

    let workflowOmissions: Array<{field: string; value: unknown; reason: string}> = [];
    try {
      // clean-1333 #2: canvas-decidable block BEFORE any request (no Schema GET, no submit). Exactly one of width/height
      // filled on the connected Empty Latent → 「宽高不齐，未发 size」; nothing is filled in, nothing is sent.
      // fix10.1: zero-width chars in node values → local block (never stripped silently at request build).
      const zwBlock = preRunZeroWidthBlock(activeNodes);
      if (zwBlock) {
        recordLocalEvent('零宽字符检查（运行前）', zwBlock);
        throw new ApiTraceError(400, zwBlock, 'local:zero-width', JSON.stringify(zwBlock));
      }
      if (canvasMode === 'graph') {
        let ext: ReturnType<typeof extractWorkflowParameters> | undefined;
        try { ext = extractWorkflowParameters(activeNodes, activeConns, runTargetId); } catch { /* graph validation is reported by executeWorkflow */ }
        const ck = activeNodes.find((n) => n.type === 'CheckpointLoaderSimple' && !n.bypassed);
        const pairing = getModelSizePairing(ck?.values?.targetProvider, ck?.values?.ckpt_name);
        const mismatch = ext ? widthHeightMismatch(ext.width, ext.height, pairing) : null;
        if (mismatch) {
          const data = { ok: false, errorSource: 'local', localOnly: true, requestCount: 0, error: mismatch, blockedField: { field: 'size', value: { width: ext?.width ?? null, height: ext?.height ?? null }, reason: mismatch } };
          recordLocalEvent('画布尺寸检查（Empty Latent 宽高）', data);
          throw new ApiTraceError(400, data, 'local:size-check', JSON.stringify(data));
        }
      }
      const result = await executeWorkflow(
        activeNodes,
        activeConns,
        handleNodeStateChange,
        (percent, statusText, details) => {
          setExecutionProgress(percent);
          setExecutionStatusText(statusText);
          if (Array.isArray(details?.omissions) && details.omissions.length) {
            workflowOmissions = details.omissions;
            setToast({type:'warning', title:'请求参数未提交项', message:workflowOmissions.map(item => `${item.field}=${item.value}：${item.reason}`).join('；')});
          }
        },
        runTargetId
      );
      setExecutionStatusText(`成功完成 (${result.provider})`);
      setExecutionProgress(100);
      // clean-1651 A: successful run clears all prior upstream failure badges.
      setNodes(prev => clearNodeExecutionErrors(prev).map(node => node.id === result.executingNodeId ? {...node, values: {...node.values, seed: nextSeedAfterGeneration(result.seed, node.values.control_after_generate) ?? node.values.seed}} : node));

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

      // Refresh generation history from server (first slim page — newest prepended)
      let historyLoaded = true;
      let freshHistory: GenerationHistoryItem[] | undefined;
      await loadHistoryFirstPage().then((h) => { freshHistory = h; }).catch(() => { historyLoaded = false; });
      const runItem = findRunHistoryItem(getExecutions().filter((r) => r.runSeq === thisRunSeq && r.method.toUpperCase() !== 'GET').map((r) => r.response), freshHistory);

      // Trigger high visibility toast
      setToast({
        type: result.historyWarning || workflowOmissions.length ? 'warning' : 'success',
        title: '工作流运行成功！',
        message: [
          runToastLine(runItem),
          result.historyWarning,
          workflowOmissions.length ? `请求参数未提交项：${workflowOmissions.map(item => `${item.field}=${item.value}：${item.reason}`).join('；')}` : undefined,
          `由 ${result.provider} 渲染完成，${runItem ? historySeedStatement(runItem) : '种子：未找到本次历史记录，无法核对实际发送 / 上游返回'}。${historyLoaded ? '可在历史记录查看实际参数和工作流' : '历史记录读取失败，请重新打开历史记录'}`,
        ].filter(Boolean).join('；'),
        imageUrl: result.imageUrl,
      });
    } catch (err: any) {
      console.error('Queue error:', err);
      setExecutionProgress(0);
      // P0: plain primary on node + status bar; JSON / [500] / request_id stay in exec-log 技术细节.
      const localBlockedRun = isLocalBlockError(err);
      // Model-schema lookup failed (GET /api/model-schema non-2xx, generation never sent): plain headline on the model node;
      // the raw GET URL + status stay in 执行记录 (traced request) and the history failure card.
      const schemaFail = !localBlockedRun && isSchemaPrefetchError(err);
      const schemaNodeMsg = schemaFail ? schemaFailureNodeMessage(err) : undefined;
      const errMsg = schemaNodeMsg ? schemaNodeMsg.split('\n')[0] : plainErrorMessage(err);
      // clean-1333 #3/#5/#6: one title for toast / node / exec log, chosen from what was actually requested.
      const blockData = localBlockedRun ? (err as any).data : undefined;
      const blockTitle = localBlockedRun ? localBlockTitle(blockData) : undefined;
      const blockReason = localBlockedRun ? localBlockToastReason(err.rawBody) : undefined;
      const blockField = localBlockedRun && typeof blockData?.blockedField?.field === 'string' ? String(blockData.blockedField.field) : undefined;
      const loraBlock = !!blockField && /^lora/i.test(blockField);
      const blockLoraCount = activeLoraNodeCount(activeNodes);

      // Prefer the Fal/engine node the user ran; never leave prior media as if this run succeeded.
      const currentTargetId = targetNodeId || selectedNodeId;
      setExecutionStatusText(errMsg);
      const branch=graphBranch(activeNodes,activeConns,currentTargetId);
      const schemaNodeId = schemaFail ? schemaFailureTargetId(activeNodes, activeConns, branch.target?.id ?? runTargetId) : undefined;
      // Only the node that caused a local block shows the reason; with no identifiable cause node the run target shows it.
      const causeIds = new Set(localBlockedRun ? localBlockCauseNodeIds(activeNodes, branch.ids, blockData?.blockedField?.field) : []);
      if (localBlockedRun && !causeIds.size && branch.target) causeIds.add(branch.target.id);
      // Downstream of the failed node (e.g. VAE → SaveImage) also shows 「这次没有出图」, never 「等待生成图像…」.
      // Downstream nodes point at the failing node by its header title instead of repeating the reason.
      const failedNodeId = schemaNodeId ?? branch.target?.id;
      const failedNode = failedNodeId ? activeNodes.find(x => x.id === failedNodeId) : undefined;
      const failedTitle = failedNode ? failedNodeDisplayTitle(failedNode) : undefined;
      const downstream=new Set<string>();
      {const queue=branch.target?[branch.target.id]:[];while(queue.length){const id=queue.shift()!;for(const c of activeConns)if(c.fromNodeId===id&&!downstream.has(c.toNodeId)&&!branch.ids.has(c.toNodeId)){downstream.add(c.toNodeId);queue.push(c.toNodeId);}}}
      setNodes(prev=>prev.map(n=>{
        // clean-0006: local block must NOT wipe upstream failure badges (errorMessage/errorAt).
        // Those stay until the next successful run; only local chrome is layered on top.
        if (downstream.has(n.id)) {
          const keepErr = !!n.errorMessage;
          return {...n,state:(keepErr?'error':'idle') as NodeInstance['state'],executionProgress:0,upstreamFailed:true,upstreamFailedTitle:localBlockedRun?undefined:failedTitle,upstreamFailedFromId:localBlockedRun?undefined:failedNodeId,upstreamLocalBlocked:localBlockedRun,localBlockTitle:blockTitle,localBlockReason:undefined,outputData:undefined};
        }
        if (localBlockedRun) {
          if (!branch.ids.has(n.id) && !causeIds.has(n.id)) return n;
          const cause = causeIds.has(n.id);
          const keepErr = !!n.errorMessage;
          // No generic red box on the other branch nodes (clean-1333 #6): they go back to idle unless they still carry a prior upstream badge.
          return {...n,state:(cause?'idle':keepErr?'error':'idle') as NodeInstance['state'],executionProgress:0,upstreamFailed:false,upstreamLocalBlocked:false,
            localBlockTitle:cause?blockTitle:undefined,localBlockReason:cause?blockReason:undefined,
            // trace-fix2 #10: remember which field caused it and, for LoRA blocks, the LoRA count it was decided on.
            localBlockField:cause?blockField:undefined,localBlockLoraCount:cause && loraBlock?blockLoraCount:undefined,
            // cleanup-serious: failed/blocked run must not keep showing the prior SaveImage as this run's result.
            outputData: (n.type === 'SaveImage' || n.type === 'PreviewImage' || n.type === 'SaveVideo') ? undefined : n.outputData,
            stalePriorOutput: undefined};
        }
        if (schemaNodeId) {
          // Error lives on the model node; sampler / other branch nodes are NOT marked 异常 (nothing was generated).
          if (n.id === schemaNodeId) return { ...n, state: 'error' as NodeInstance['state'], executionProgress: 0, errorMessage: schemaNodeMsg, errorAt: new Date().toISOString(), errorKind: 'schema' as const, errorModel: schemaFailureModel(err, n.values?.ckpt_name), upstreamFailed: false, upstreamLocalBlocked: false };
          if (!branch.ids.has(n.id)) return n;
          return { ...n, state: 'idle' as NodeInstance['state'], executionProgress: 0, errorMessage: undefined, errorAt: undefined, errorKind: undefined, upstreamFailed: true, upstreamFailedTitle: failedTitle, upstreamFailedFromId: schemaNodeId, upstreamLocalBlocked: false,
            outputData: shouldClearExecutionOutput(n.type, 'idle', undefined, '') ? undefined : n.outputData };
        }
        if (!branch.ids.has(n.id)) return n;
        const isTarget = n.id === branch.target?.id;
        const nextState = (isTarget ? 'error' : 'idle') as NodeInstance['state'];
        const clearOut = shouldClearExecutionOutput(n.type, nextState, undefined, isTarget ? errMsg : '');
        return {
          ...n,
          state: nextState,
          executionProgress: 0,
          errorMessage: isTarget ? errMsg : undefined,
          errorAt: isTarget ? new Date().toISOString() : undefined,
          upstreamFailed: !isTarget,
          upstreamFailedTitle: isTarget ? undefined : failedTitle,
          upstreamFailedFromId: isTarget ? undefined : failedNodeId,
          upstreamLocalBlocked: false,
          outputData: clearOut ? undefined : n.outputData,
        };
      }));

      setToast(localBlockedRun
        ? { type: 'error', title: blockTitle!, message: `${blockReason}\n${schemaReadLine(blockData)}\n运行：${runTarget?.title ?? '未知节点'} · 生成请求未发出` }
        : (toastFromRunError(err, `运行：${runTarget?.title ?? '未知节点'}`)
          ? { type: 'error', ...toastFromRunError(err, `运行：${runTarget?.title ?? '未知节点'}`)! }
          : { type: 'error', title: '请求未完成', message: `${runToastLine()}；${errMsg}` }));
      // clean-1358 #4 + clean-1613 #2: pan only after writing ONE exec-log row 「视口平移至原因节点」.
      // Capture run attach BEFORE finally/endRun clears currentRunLabel; record OUTSIDE setState (StrictMode would double-fire).
      // state 'complete' — pan is not a request failure (no 请求失败 / 较早失败).
      if (localBlockedRun && causeIds.size) {
        const causeNode = activeNodes.find((n) => causeIds.has(n.id) && n.id !== branch.target?.id) || activeNodes.find((n) => causeIds.has(n.id));
        const panAttach = currentRunAttach();
        if (causeNode) setTimeout(() => {
          const el = document.querySelector('[data-testid="canvas-container"]') as HTMLElement | null;
          const nodeEl = document.getElementById(`node-${causeNode.id}`) as HTMLElement | null;
          const ins = measureChromeInsets(el);
          // fix4: toast sits at bottom; keep chrome top inset (do not push reveal below a top toast).
          const width = el?.clientWidth || window.innerWidth;
          const height = el?.clientHeight || window.innerHeight;
          const top = ins.top;
          let recordedPan = false;
          setTransform((t) => {
            const next = revealNodeTransform(
              { x: causeNode.pos.x, y: causeNode.pos.y, w: (nodeEl && nodeEl.offsetWidth > 0 ? nodeEl.offsetWidth : causeNode.width) || 300, h: nodeEl && nodeEl.offsetHeight > 0 ? nodeEl.offsetHeight : 200 },
              t, { width, height }, { top, bottom: ins.bottom, left: ins.left, right: ins.right },
            );
            if (!next) return t;
            // StrictMode may replay this updater with the same t — write the row only once, and only then jump.
            if (!recordedPan) {
              recordedPan = true;
              recordLocalEvent('视口平移至原因节点', { ok: true, note: '视口平移至原因节点', causeNodeId: causeNode.id, causeTitle: causeNode.title || causeNode.type, from: { x: t.x, y: t.y, scale: t.scale }, to: next }, 'complete', new Date(), panAttach);
            }
            return next;
          });
        }, 60);
      }
      loadHistoryFirstPage().catch((err) => console.error('History refresh failed:', err.message));
    } finally {
      setIsExecuting(false);
      setCurrentRunTarget(null);
      endRun();
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
  const handleSelectLoRAFromCivitai = (lora: ResourceSelection & {triggerWords:string}) => {
    if(lora.provider && lora.provider!=='civitai') {handleSelectLoRAWithBaseModel(lora);return;}
    // A remembered spatial selection must not redirect graph-mode mounting.
    if (canvasMode === 'spatial' && selectedFrameId) {
      const frame = spatialFrames.find((f) => f.id === selectedFrameId);
      if (frame) {
        const nextLoras = [
          ...frame.params.loras.filter((l) => l.name !== lora.name),
          {
            ...lora,
            name: lora.name,
            downloadUrl: lora.downloadUrl,
            modelStrength: parseExplicitLoraStrength(lora.modelStrength),
            clipStrength: parseExplicitLoraStrength(lora.clipStrength ?? lora.modelStrength),
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

    if (canvasMode === 'graph' && !targetLoRANodeId) {handleSelectLoRAWithBaseModel({...lora,provider:lora.provider || 'civitai'});return;}

    // Also update any targeted LoRALoader node if present
    if (canvasMode === 'graph' && targetLoRANodeId) {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === targetLoRANodeId
            ? {
                ...n,
                title: loraLoaderNodeTitle(n.title, lora.name),
                values: {...replaceSelectedResource(n.values,lora,'lora_name'),civitai_id:lora.civitaiId,trigger_words:lora.triggerWords,base_model:lora.baseModel || ''},
              }
            : n
        )
      );
    }
  };

  // 「仅填入当前节点」: update the existing current LoRA node only (any provider); never creates a node.
  const handleFillCurrentLoRANode = (lora: ResourceSelection & {triggerWords:string}) => {
    if (canvasMode === 'spatial') { handleSelectLoRAFromCivitai(lora); return; }
    let nodeId: string;
    try { nodeId = resolveFillLoraNodeId(nodes, targetLoRANodeId, selectedNodeId); }
    catch (error: any) { setToast({type:'warning', title:'LoRA 未填入', message:error.message}); return; }
    setNodes((prev) => prev.map((n) => n.id === nodeId
      ? { ...n, title: loraLoaderNodeTitle(n.title, lora.name), values: {...replaceSelectedResource(n.values,lora,'lora_name'),civitai_id:lora.civitaiId,trigger_words:lora.triggerWords,base_model:lora.baseModel || ''} }
      : n));
    setToast({type:'success', title:'LoRA 已填入当前节点', message:`${lora.name} 已填入当前 LoRA 节点；未新建节点。`});
  };

  const handleAddLoRANodeToCanvas = (lora: ResourceSelection & {modelStrength?:number;clipStrength?:number}, attach = false) => {
    const newNodeId = `node-lora-${Date.now()}`;
    const def = NODE_DEFINITIONS['LoRALoader'];

    const newNode: NodeInstance = {
      id: newNodeId,
      type: 'LoRALoader',
      title: loraLoaderNodeTitle(undefined, lora.name),
      pos: findNonOverlappingPos(
        nodes.map((n) => ({ id: n.id, pos: n.pos, width: n.width })),
        { x: Math.round(-transform.x / transform.scale + 420), y: Math.round(-transform.y / transform.scale + 220) },
        { w: 320, h: 180 },
      ),
      width: 320,
      inputs: def.inputs,
      outputs: def.outputs,
      values: {
        ...replaceSelectedResource(def.defaultValues,lora,'lora_name'),
        lora_name: lora.name,
        civitai_id: lora.civitaiId || '',
        trigger_words: lora.triggerWords || '',
        base_model: lora.baseModel || '',
        source_provider: lora.provider || '',
        ...(parseExplicitLoraStrength(lora.modelStrength) !== undefined
          ? { strength_model: parseExplicitLoraStrength(lora.modelStrength) }
          : {}),
        ...(parseExplicitLoraStrength(lora.clipStrength ?? lora.modelStrength) !== undefined
          ? { strength_clip: parseExplicitLoraStrength(lora.clipStrength ?? lora.modelStrength) }
          : {}),
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
  const handleSelectLoRAWithBaseModel = (lora: ResourceSelection & {modelStrength?:number;clipStrength?:number}) => {
    const frame=canvasMode==='spatial' ? spatialFrames.find(f=>f.id===selectedFrameId) : undefined;
    let chosen: {checkpoint:string;provider:string};
    let adaptedLora = { ...lora };
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
      if(isInvalidTensorModel(chosen.provider,chosen.checkpoint))throw new Error('Tensor.Art 模型 API 只接受 TAMS 数字模型 ID 挂载 LoRA，请先选择真实 Tensor 模型 ID');
      const civitaiSchemaId = chosen.provider === 'civitai' && canvasMode==='spatial' && frame?.params.civitaiEngine && frame?.params.civitaiEcosystem
        ? `${frame.params.civitaiEngine}:${frame.params.civitaiEcosystem}`
        : undefined;
      const unsupported=isLoraUnsupportedOnEndpoint(chosen.provider, civitaiSchemaId || chosen.checkpoint);
      if(unsupported.unsupported)throw new Error(unsupported.message || '所选端点不支持 LoRA');
    } catch(error:any) {setToast({type:'error',title:'LoRA 未挂载',message:error.message});return;}
    const selected={...lora,triggerWords:lora.triggerWords || '',civitaiId:chosen.provider==='civitai'?lora.civitaiId:undefined};
    if (canvasMode==='spatial') {
      const strength=parseExplicitLoraStrength(lora.modelStrength);
      const clip=parseExplicitLoraStrength(lora.clipStrength ?? lora.modelStrength);
      handleUpdateFrame(frame!.id,{params:{...frame!.params,loras:[...frame!.params.loras.filter(row=>row.name!==lora.name),{...selected,downloadUrl:lora.downloadUrl,modelStrength:strength,clipStrength:clip}]}});
    } else if(!handleAddLoRANodeToCanvas(selected,true))return;
    const shown=parseExplicitLoraStrength(lora.modelStrength);
    setToast({type:'success',title:'LoRA 已挂载',message:shown !== undefined
      ? `${lora.name} × ${shown}；已接入当前${canvasMode==='graph'?'生成分支':'空间画板'}，生成前继续核实模型架构与权限。`
      : `${lora.name} 已挂载但未设置强度；生成前必须显式填写 strength_model，禁止静默兜底 0.8。`});
  };

  // Live Model Hub selection
  const handleSelectModelFromHub = (modelId: string, modelName: string, providerHint?: string, extraData?: any) => {
    const provider = explicitProvider(providerHint);
    if (!provider) {setToast({type:'error',title:'未应用模型',message:'模型目录缺少明确供应商，请先选择供应商'});return;}
    // 选用此 ID / 应用为底模 are explicit user selections → exactly one Schema GET for this model.
    // Schema-driven verification: a 200 Schema for exactly this provider+model verifies the typed/catalog ID (the same GET
    // the run makes). A failed GET leaves the 「尚未核实」 state and its verbatim error in the exec log.
    noteUserModelSelection(provider, modelId)?.then((r) => {
      if (!(r.ok && r.data?.inputSchema?.properties)) return;
      setNodes((prev) => prev.map((n) => n.type === 'CheckpointLoaderSimple' && n.values?.ckpt_name === modelId && n.values?.targetProvider === provider && (n.values?.import_unresolved_resource || n.values?.unresolvedResource)
        ? { ...n, values: { ...n.values, resourceVerified: true, import_unresolved_resource: false, unresolvedResource: false, import_resource_reason: undefined, resource_source: `${provider} 官方 Schema（GET /api/model-schema · HTTP ${r.status}）` } }
        : n));
    }, () => {});
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
      handleUpdateFrame(frame.id,{mediaType:isVideoModel?'video':'image',params:{...frame.params,checkpoint:modelId,targetProvider:provider as ComfyParameters['targetProvider'],...(extraData?.resourceVerified ? {unresolvedModel:false} : {})}});
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
                  ...replaceSelectedResource(n.values,{...extraData,name:modelId},'model'),
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
            aspect_ratio: undefined,
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
        title: '已成功应用 AI 视频大模型',
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
                title: provider === 'replicate'
                  ? `Load Checkpoint (Replicate · ${modelName.split('/').pop() || modelId})`
                  : checkpointNodeTitle(provider, modelId),
                values: {
                  ...replaceSelectedResource(n.values,{...extraData,name:modelId},n.type==='CheckpointLoaderSimple'?'ckpt_name':n.type==='ModelScopeNode'||n.type==='ModelScopeAiNode'?'model_endpoint':'model'),
                  ...(n.type==='CheckpointLoaderSimple'?{ckpt_name:modelId}:n.type==='ModelScopeNode'||n.type==='ModelScopeAiNode'?{model_endpoint:modelId}:{model:modelId}),
                  targetProvider: provider,
                  tensorArtInputs: provider === 'tensorart' ? (extraData?.inputs || []) : undefined,
                  // Persist official Schema property names so UI never fakes「不会发送」for declared fields (Krea steps/seed/guidance_scale…)
                  ...(() => {
                    const props = extraData?.parameters?.properties || extraData?.metadata?.parameters?.properties || extraData?.inputSchema?.properties;
                    if (!props || typeof props !== 'object') return {};
                    try {
                      const prev = typeof n.values?.custom_parameters === 'string' ? JSON.parse(n.values.custom_parameters || '{}') : {};
                      return { custom_parameters: JSON.stringify({ ...prev, _canvas: { ...prev._canvas, schemaProperties: Object.keys(props) } }, null, 2) };
                    } catch { return {}; }
                  })(),
                },
              };
            }
            // saveempty: hub model pick clears prior preview; do NOT retitle filename_prefix until a new image lands.
            return clearPriorMediaPreview(n);
          })
        );
      } else {
        const newNodeId = `node-ckpt-${Date.now()}`;
        const def = NODE_DEFINITIONS['CheckpointLoaderSimple'];
        const newNode: NodeInstance = {
          id: newNodeId,
          type: 'CheckpointLoaderSimple',
          title: provider === 'replicate'
            ? `Load Checkpoint (Replicate · ${modelName.split('/').pop() || modelId})`
            : checkpointNodeTitle(provider, modelId),
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
        title: '已成功应用图像底模 (Checkpoint)',
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
    if (!canvas.transform) setTimeout(handleResetView, 180);
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

    const templateId = ({flux:'std-fal-t2i',ghibli:'std-civitai-t2i',wan:'std-modelscope-t2i'} as Record<string,string>)[templateType];
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
      description: `创建于 ${formatRecordTime(new Date().toISOString())}`,
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
      setTimeout(handleResetView, 180);
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
      setTimeout(handleResetView, 180);
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
        width: asset.width ?? undefined, // clean-1333 #1: no silent 1024
        height: asset.height ?? undefined,
        batchSize: 1,
        loras: (asset.loras || []).map(l=>({name:l.name,modelStrength:parseExplicitLoraStrength(l.strength),clipStrength:parseExplicitLoraStrength(l.strength),triggerWords:''})),
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
        referenceImageUrl: asset.url,
        prompt: asset.prompt ? `${asset.prompt}, variation` : 'variation',
      });
    }
  };

  const handleDeleteHistoryItem = async (id: string, url?: string) => {
    setHistory((prev) => {
      const next = prev.filter((item) => item.id !== id && (!url || (item.url !== url && item.imageUrl !== url)));
      setHistoryTotal((t) => {
        const nt = Math.max(0, t - (prev.length - next.length || 1));
        setHistoryHasMore(next.length < nt);
        return nt;
      });
      return next;
    });
    try {
      const { deleteHistoryItem } = await import('./services/api');
      const ok = await deleteHistoryItem(id);
      if (!ok && url) {
        await deleteHistoryItem(url);
      }
      setToast({ type: 'success', title: '资产已删除', message: '已从服务器和资产库永久移除' });
    } catch (e) {
      console.error('Delete history item error:', e);
    }
  };

  const handleDeleteBatchHistoryItems = async (ids: string[]) => {
    const idSet = new Set(ids);
    setHistory((prev) => {
      const next = prev.filter((item) => !idSet.has(item.id));
      const removed = prev.length - next.length;
      setHistoryTotal((t) => {
        const nt = Math.max(0, t - removed);
        setHistoryHasMore(next.length < nt);
        return nt;
      });
      return next;
    });
    try {
      const { deleteHistoryBatch } = await import('./services/api');
      await deleteHistoryBatch(ids);
      setToast({ type: 'success', title: '批量资产已删除', message: `已成功移除 ${ids.length} 项生成资产` });
    } catch (e) {
      console.error('Batch delete history items error:', e);
    }
  };

  const handleClearHistory = async () => {
    const { clearHistory } = await import('./services/api');
    const ok = await clearHistory();
    if (ok) {
      setHistory([]);
      setHistoryTotal(0);
      setHistoryHasMore(false);
      setToast({ type: 'success', title: '历史记录已清空', message: '所有生成记录已从服务器永久移除' });
    }
  };


  // trace-fix2 #10: a LoRA-caused block whose LoRA count no longer matches the graph is stale → clear it (and its toast).
  useEffect(() => {
    if (!hasStaleLoraBlock(nodes)) return;
    setNodes((prev) => clearStaleLoraBlocks(prev));
    setToast((prev) => (prev && prev.type === 'error' && /LoRA/.test(`${prev.title}\n${prev.message}`) && /本地拦截/.test(`${prev.title}\n${prev.message}`) ? null : prev));
  }, [nodes]);

  // trace-fix2 #15: when the node set is (re)loaded — first paint, workflow load, 「一键清空全部」 reset — no node may sit
  // under the top chrome. Pan down only (zoom unchanged, nodes never moved); later user pans are not touched.
  const nodeSetKey = nodes.map((n) => n.id).sort().join('|');
  const lastNodeSetKey = useRef<string | null>(null);
  useEffect(() => {
    const prevKey = lastNodeSetKey.current;
    lastNodeSetKey.current = nodeSetKey;
    const prevIds = new Set((prevKey || '').split('|').filter(Boolean));
    const changed = nodeSetKey.split('|').filter((id) => id && !prevIds.has(id)).length;
    if (prevKey !== null && changed <= 1) return; // single add/remove is a user edit, not a reload
    const raf = requestAnimationFrame(() => {
      const el = document.querySelector('[data-testid="canvas-container"]') as HTMLElement | null;
      if (!el) return;
      const insets = measureChromeInsets(el);
      const cTop = el.getBoundingClientRect().top + insets.top;
      const tops = nodes.map((n) => document.getElementById(`node-${n.id}`)?.getBoundingClientRect().top).filter((v): v is number => typeof v === 'number');
      if (!tops.length) return;
      const minTop = Math.min(...tops);
      if (minTop < cTop) setTransform((t) => ({ ...t, y: t.y + (cTop - minTop) }));
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeSetKey]);

  // 待配方等黄字会撑高顶栏：状态出现后再检查一次，避免节点标题仍被顶栏盖住。
  useEffect(() => {
    if (!runDisabledReason) return;
    const raf = requestAnimationFrame(() => {
      const el = document.querySelector('[data-testid="canvas-container"]') as HTMLElement | null;
      if (!el) return;
      const insets = measureChromeInsets(el);
      const cTop = el.getBoundingClientRect().top + insets.top;
      const tops = nodes.map((n) => document.getElementById(`node-${n.id}`)?.getBoundingClientRect().top).filter((v): v is number => typeof v === 'number');
      if (!tops.length) return;
      const minTop = Math.min(...tops);
      if (minTop < cTop) setTransform((t) => ({ ...t, y: t.y + (cTop - minTop) }));
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runDisabledReason]);

  // Reset view to fit all elements
  const handleResetView = () => {
    // clean-1358 #1 + clean-1613 #1: Fit View uses the canvas container; graph mode ignores leftover spatial frames;
    // measured DOM width/height; usable-box insets include top/bottom/left/right chrome. Nodes are not moved.
    // After model switch nodes grow (schema widgets / previews) — computeFitTransform loops minScale until every
    // item sits inside the usable box. A rAF second pass re-measures DOM in case layout was stale on click.
    const el = document.querySelector('[data-testid="canvas-container"]') as HTMLElement | null;
    const width = el?.clientWidth || window.innerWidth;
    const height = el?.clientHeight || window.innerHeight;
    const measureH = (id: string) => {
      const nodeEl = document.getElementById(`node-${id}`);
      return nodeEl && nodeEl.offsetHeight > 0 ? nodeEl.offsetHeight : undefined;
    };
    const measureW = (id: string) => {
      const nodeEl = document.getElementById(`node-${id}`);
      return nodeEl && nodeEl.offsetWidth > 0 ? nodeEl.offsetWidth : undefined;
    };
    const fitNow = () => {
      const insets = measureChromeInsets(el);
      const all = fitItemsForMode(canvasMode, nodes, spatialFrames, measureH, measureW);
      return computeFitTransform(all, { width, height }, { insets, minScale: 0.05 });
    };
    setTransform(fitNow());
    requestAnimationFrame(() => {
      if (!el) return;
      const insets = measureChromeInsets(el);
      const cRect = el.getBoundingClientRect();
      const nodeEls = nodes.map((n) => document.getElementById(`node-${n.id}`)).filter(Boolean) as HTMLElement[];
      if (!nodeEls.length) return;
      const outside = nodeEls.some((ne) => {
        const r = ne.getBoundingClientRect();
        return r.bottom < cRect.top + insets.top - 2
          || r.top > cRect.bottom - insets.bottom + 2
          || r.right < cRect.left + insets.left - 2
          || r.left > cRect.right - insets.right + 2;
      });
      if (outside) setTransform(fitNow());
    });
  };

  /** History / 详情「应用到画布」：图→SaveImage、参数写回节点；有快照还原连线，无则 toast「这条没存工作流」。 */
  const handleApplyHistoryToCanvas = async (item: GenerationHistoryItem & { hasWorkflowSnapshot?: boolean }) => {
    let full: GenerationHistoryItem & { hasWorkflowSnapshot?: boolean } = item;
    if (item?.hasWorkflowSnapshot && !item.workflowSnapshot && item.id) {
      try {
        full = await fetchHistoryItem(item.id);
      } catch {
        full = item;
      }
    }
    const result = applyHistoryToCanvas({
      item: full,
      nodes,
      connections,
      spatialFrames,
    });
    setNodes(result.nodes);
    setConnections(result.connections);
    if (result.spatialFrames) {
      setSpatialFrames(result.spatialFrames);
      if (result.spatialFrames[0]?.id) setSelectedFrameId(result.spatialFrames[0].id);
    }
    if (result.notice) {
      setToast({ type: 'info', title: result.notice, message: '已把图和参数写回节点；这条记录没有工作流快照，连线未还原。' });
    } else if (result.restoredFromSnapshot) {
      setToast({ type: 'success', title: '已应用到画布', message: result.imageApplied ? '图已落到保存图像节点，参数与工作流已还原。' : '参数与工作流已还原。' });
    } else {
      setToast({ type: 'success', title: '已应用到画布', message: result.imageApplied ? '图已落到保存图像节点，参数已写回。' : '参数已写回。' });
    }
    setTimeout(handleResetView, 180);
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
  const tracedActive = canvasMode==='spatial'
    ? {checkpoint:inspectorFrame?.params.checkpoint || '',provider:inspectorFrame?.params.targetProvider || ''}
    : resolveActiveCheckpoint(inspectorNodes,connections,inspectorBranch.target?.id);
  // clean-0942 single source of truth for the selected provider + model: the branch's loader node values (what the node
  // label shows). Traced through the MODEL chain when connected; when the chain is broken the selection is still shown
  // and the break is reported (modelChainIssue) — the Run gate blocks with the same reason. No guessing, no fallback model.
  const branchLoader = canvasMode==='graph' ? checkpointLoaderNode : undefined;
  const resolvedActive = (tracedActive.checkpoint || tracedActive.provider || !branchLoader)
    ? tracedActive
    : { checkpoint: getModelFromNode(branchLoader), provider: getProviderFromNode(branchLoader), engineNodeId: branchLoader.id };
  // Same sentence for Run banner, panel, and the LoRA node where the MODEL chain breaks (one source).
  const chainExecId = (canvasMode==='graph' && (inspectorBranch.target?.type==='KSampler' ? inspectorBranch.target.id
    : nodes.find(n=>n.type==='KSampler' && !n.bypassed && inspectorBranch.ids.has(n.id))?.id)) || undefined;
  const modelChainBreakInfo = chainExecId ? modelChainBreakDetail(nodes, connections, chainExecId) : undefined;
  const modelChainIssue = modelChainBreakInfo?.message;
  let graphExtraction:ReturnType<typeof extractWorkflowParameters>|undefined;
  try {if(inspectorBranch.target)graphExtraction=extractWorkflowParameters(inspectorNodes,connections,inspectorBranch.target.id);}catch{/* Incomplete graphs stay editable; generation exposes validation. */}
  const promptNode=(socket:string)=>inspectorNodes.find(n=>connections.some(c=>c.fromNodeId===n.id && c.toNodeId===inspectorBranch.target?.id && c.toSocketId===socket));
  const nodePositiveText=promptNode('positive')?.values.text ?? promptNode('prompt')?.values.text ?? inspectorBranch.target?.values.prompt;
  const nodeNegativeText=promptNode('negative')?.values.text ?? inspectorBranch.target?.values.negative_prompt ?? checkpointLoaderNode?.values?.negative_prompt;

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
      modelStrength: parseExplicitLoraStrength(n.values?.strength_model),
      clipStrength: parseExplicitLoraStrength(n.values?.strength_clip),
      triggerWords: n.values?.trigger_words || '',
      civitaiId: n.values?.civitai_id || '',
      downloadUrl: n.values?.download_url || n.values?.downloadUrl,
      unresolvedResource: n.values?.import_unresolved_resource === true || n.values?.unresolvedResource === true,
      resourceVerified: n.values?.resourceVerified,
      resource_source: n.values?.resource_source,
      resource_kind: n.values?.resource_kind,
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
    // clean-1333 #1: the inspector mirrors the request exactly. A connected Empty Latent is the ONLY size source; an empty
    // field stays undefined (never 0, never the stale CheckpointLoader width/height, which the write-back below would
    // otherwise copy INTO the Empty Latent on any panel edit — that was the silent 1024 fill).
    width: graphExtraction ? graphExtraction.width : latentNode ? sizeOrUndef(latentNode.values.width) : sizeOrUndef(checkpointLoaderNode?.values?.width),
    height: graphExtraction ? graphExtraction.height : latentNode ? sizeOrUndef(latentNode.values.height) : sizeOrUndef(checkpointLoaderNode?.values?.height),
    batchSize: (selectedFrameId && inspectorFrame?.params?.batchSize != null)
      ? Number(inspectorFrame.params.batchSize)
      : (latentNode?.values?.batch_size !== undefined
          ? Number(latentNode.values.batch_size)
          : (inspectorFrame?.params?.batchSize ?? 1)),
    loras: inspectorFrame ? inspectorFrame.params.loras : graphLoras,
    targetProvider: detectedTargetProvider as any,
    aspectRatio:
      graphExtraction?.videoAspectRatio || graphExtraction?.aspectRatio ||
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
    resolution: graphExtraction?.resolution ?? checkpointLoaderNode?.values?.resolution ?? inspectorFrame?.params?.resolution,
    shift: checkpointLoaderNode?.values?.shift ?? inspectorFrame?.params?.shift,
    randomSeed: checkpointLoaderNode?.values?.random_seed ?? inspectorFrame?.params?.randomSeed,
    customParameters: graphExtraction?.customParameters ?? checkpointLoaderNode?.values?.custom_parameters,
    requireReferenceImage: graphExtraction?.requireReferenceImage ?? checkpointLoaderNode?.values.require_reference_image ?? videoEngineNode?.values.require_reference_image,
    unresolvedModel: graphExtraction?.unresolvedModel ?? (checkpointLoaderNode?.values.import_unresolved_resource === true || videoEngineNode?.values.import_unresolved_resource === true),
    executionBlockedReason: graphExtraction?.executionBlockedReason ?? checkpointLoaderNode?.values.execution_blocked_reason ?? videoEngineNode?.values.execution_blocked_reason,
    sourceLoraAir: graphExtraction?.sourceLoraAir ?? videoEngineNode?.values.source_lora_air,
    civitaiEngine: graphExtraction?.civitaiEngine ?? checkpointLoaderNode?.values.civitai_engine,
    civitaiEcosystem: graphExtraction?.civitaiEcosystem ?? checkpointLoaderNode?.values.civitai_ecosystem,
    civitaiModel: graphExtraction?.civitaiModel ?? checkpointLoaderNode?.values.civitai_model,
    videoProvider: graphExtraction?.videoProvider ?? videoEngineNode?.values.targetProvider,
    videoDuration: graphExtraction?.videoDuration ?? videoEngineNode?.values.duration,
    videoFps: graphExtraction?.videoFps ?? videoEngineNode?.values.fps,
    videoFrames: graphExtraction?.videoFrames ?? videoEngineNode?.values.num_frames,
    hfProvider: checkpointLoaderNode?.values?.hf_provider,
    galleryImages: checkpointLoaderNode?.values?.gallery_images ?? inspectorFrame?.params?.galleryImages,
  };

  const rawInspectorParams = readInspectorParameters(inspectorNodes,connections,inspectorBranch.target?.id);
  // Defined values win: rawInspectorParams may carry undefined width/height when EmptyLatent is unconnected — never wipe graphParams.
  const mergeDefined = (base: ComfyParameters, overlay: ComfyParameters): ComfyParameters => {
    const out: any = { ...base };
    for (const [k, v] of Object.entries(overlay as any)) if (v !== undefined) out[k] = v;
    return out as ComfyParameters;
  };
  // Provider + model come from ONE source (resolvedActive = the branch loader values) — readInspectorParameters re-traces
  // the MODEL chain and would blank them when that chain is broken, contradicting the node label.
  const activeParams = inspectorFrame ? inspectorFrame.params : {...mergeDefined(graphParams, rawInspectorParams),loras:graphLoras,
    ...(resolvedActive.checkpoint ? { checkpoint: resolvedActive.checkpoint } : {}),
    ...(resolvedActive.provider ? { targetProvider: graphParams.targetProvider } : {})};

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
        onOpenHistory={() => { setIsHistoryOpen(true); setToast((prev) => (prev && prev.type === 'error' ? null : prev)); }}
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
        runTargetLabel={runTargetState.target ? runTargetState.target.title : undefined}
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
            modelChainBreakInfo={modelChainBreakInfo}
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
          setTransform((prev) => {
            const el = document.querySelector('[data-testid="canvas-container"]') as HTMLElement | null;
            const cx = (el?.clientWidth || window.innerWidth) / 2;
            const cy = (el?.clientHeight || window.innerHeight) / 2;
            const scale = Math.min(prev.scale * 1.15, 2.5);
            return { scale, x: cx - ((cx - prev.x) * scale) / prev.scale, y: cy - ((cy - prev.y) * scale) / prev.scale };
          })
        }
        onZoomOut={() =>
          setTransform((prev) => {
            const el = document.querySelector('[data-testid="canvas-container"]') as HTMLElement | null;
            const cx = (el?.clientWidth || window.innerWidth) / 2;
            const cy = (el?.clientHeight || window.innerHeight) / 2;
            const scale = Math.max(prev.scale / 1.15, 0.15);
            return { scale, x: cx - ((cx - prev.x) * scale) / prev.scale, y: cy - ((cy - prev.y) * scale) / prev.scale };
          })
        }
        onZoomReset={() => setTransform((prev) => {
          const el = document.querySelector('[data-testid="canvas-container"]') as HTMLElement | null;
          const cx = (el?.clientWidth || window.innerWidth) / 2;
          const cy = (el?.clientHeight || window.innerHeight) / 2;
          const scale = 1.0;
          return { scale, x: cx - ((cx - prev.x) * scale) / prev.scale, y: cy - ((cy - prev.y) * scale) / prev.scale };
        })}
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
        <aside data-testid="params-drawer" className="fixed top-[168px] right-4 bottom-24 w-96 max-w-[calc(100vw-2rem)] z-40 animate-in slide-in-from-right-4 duration-200">
          <ParameterInspector
            params={activeParams}
            modelChainIssue={modelChainIssue}
            hasImageInput={inspectorBranch.target ? hasReferenceImageInput(nodes as any, connections as any, inspectorBranch.target.id) : undefined}
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
                  // Fallback when no negative CLIP node: keep text on CheckpointLoader for execute + panel reopen.
                  if (n.type === 'CheckpointLoaderSimple') {
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
              const providerChanged = newParams.targetProvider !== activeParams.targetProvider;
              // Update active spatial frame ONLY
              const targetFrameId = selectedFrameId || (spatialFrames.length > 0 ? spatialFrames[0].id : null);
              if (canvasMode==='spatial' && targetFrameId) {
                setSpatialFrames((prev) =>
                  prev.map((f) => {
                    if (f.id !== targetFrameId) return f;
                    const patched = patchSpatialParameters(f, newParams);
                    if (!providerChanged) return patched;
                    // Provider switch: drop stale frame error (prior Civitai/WaveSpeed/etc.).
                    return {
                      ...patched,
                      status: patched.status === 'error' ? 'idle' : patched.status,
                      errorMessage: undefined,
                    };
                  })
                );
              }
              // Update matching graph nodes
              setNodes((prev) => {
                const mapped = prev.map((n) => {
                  if(canvasMode!=='graph' || !inspectorBranch.ids.has(n.id))return n;
                  if (!LORA_LOADER_TYPES.has(n.type)) return patchInspectorBranchNode(n,prev,connections,inspectorBranch.target?.id,activeParams,newParams);
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
                      civitai_engine: newParams.civitaiEngine,
                      civitai_ecosystem: newParams.civitaiEcosystem,
                      civitai_model: newParams.civitaiModel,
                      aspect_ratio: newParams.aspectRatio,
                      n: newParams.batchSize,
                      // Size fallback when EmptyLatent is missing/unconnected — panel reopen must keep these.
                      width: newParams.width,
                      height: newParams.height,
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
                      ...(((newParams.width ?? 0) > 0 && (newParams.height ?? 0) > 0) ? {resolution:`${newParams.width}x${newParams.height}`} : {})}};
                  }
                  if (n.type === 'ModelScopeNode' || n.type === 'ModelScopeAiNode')return {...n,values:{...n.values,model_endpoint:newParams.checkpoint}};
                  if (n.type === 'NanoGPTNode')return {...n,values:{...n.values,model:newParams.checkpoint}};
                  if (n.type === 'AIVideoNode')return {...n,values:{...n.values,model:newParams.checkpoint,targetProvider:newParams.videoProvider || newParams.targetProvider,duration:newParams.videoDuration,fps:newParams.videoFps,num_frames:newParams.videoFrames,resolution:newParams.resolution,aspect_ratio:newParams.aspectRatio,custom_parameters:newParams.customParameters}};
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
                });
                return providerChanged ? clearNodeExecutionErrors(mapped) : mapped;
              });
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
        canvasMode={canvasMode}
      />

      {/* Real Live API Model Hub Modal */}
      <ModelHubModal
        isOpen={isModelHubOpen}
        onClose={() => { setIsModelHubOpen(false); setModelHubInitialProvider(undefined); }}
        initialCategory={modelHubCategory}
        initialProvider={modelHubInitialProvider || (canvasMode === 'spatial' ? activeFrame?.params.targetProvider : resolvedActive.provider)}
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
                aspect_ratio: undefined,
                duration: '',
                fps: 24,
                steps: 30,
                cfg: 6.0,
              },
              state: 'idle',
            };
            setNodes((prev) => [...prev, newNode]);
            setSelectedNodeId(newNodeId);
          } else if (extraData?.preferEngineNode) {
            const engineType =
              detectedProvider === 'replicate' ? 'ReplicateEngineNode' :
              detectedProvider === 'fal' ? 'FalAIEngineNode' :
              detectedProvider === 'modelscope' ? 'ModelScopeNode' :
              detectedProvider === 'modelscope_ai' ? 'ModelScopeAiNode' :
              detectedProvider === 'nanogpt' ? 'NanoGPTNode' :
              detectedProvider === 'gemini' ? 'GoogleImagenNode' : null;

            if (engineType && NODE_DEFINITIONS[engineType]) {
              const def = NODE_DEFINITIONS[engineType];
              const newNodeId = `node-engine-${Date.now()}`;
              const newNode: NodeInstance = {
                id: newNodeId,
                type: engineType,
                title: `${def.title} (${mName.split('/').pop() || mId})`,
                pos: {
                  x: Math.round(-transform.x / transform.scale + 120),
                  y: Math.round(-transform.y / transform.scale + 160),
                },
                width: 320,
                inputs: def.inputs,
                outputs: def.outputs,
                values: {
                  ...def.defaultValues,
                  model: mId,
                  model_endpoint: mId,
                },
                state: 'idle',
              };
              setNodes((prev) => [...prev, newNode]);
              setSelectedNodeId(newNodeId);
            }
          } else {
            const newNodeId = `node-ckpt-${Date.now()}`;
            const def = NODE_DEFINITIONS['CheckpointLoaderSimple'];
            const newNode: NodeInstance = {
              id: newNodeId,
              type: 'CheckpointLoaderSimple',
              title: detectedProvider === 'replicate'
                ? `Load Checkpoint (Replicate · ${mName.split('/').pop() || mId})`
                : `Load Checkpoint (${mName.split('/').pop()})`,
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
            ...resource,
            name: resource?.name || loraName,
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
        onClose={() => { setIsSettingsOpen(false); setSettingsInitialProvider(undefined); }}
        initialProvider={settingsInitialProvider}
        apiKeys={apiKeys}
        onSaveKeys={(newKeys) => {
          setApiKeys(newKeys);
          saveStoredApiKeys(newKeys);
        }}
        onOpenModelHub={(providerId) => {
          setModelHubCategory('checkpoint');
          setModelHubInitialProvider(providerId);
          setIsModelHubOpen(true);
        }}
      />

      {/* Unified LoRA & Model Hub Modal */}
      <CivitaiModal
        isOpen={isCivitaiOpen}
        onClose={() => setIsCivitaiOpen(false)}
        onSelectLoRA={handleSelectLoRAFromCivitai}
        onFillCurrentLoRANode={handleFillCurrentLoRANode}
        onAddLoRANodeToCanvas={handleAddLoRANodeToCanvas}
        onSelectLoRAWithBaseModel={handleSelectLoRAWithBaseModel}
      />

      {/* Generation History Modal */}
      <HistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={history}
        hasMore={historyHasMore}
        historyTotal={historyTotal}
        loadingMore={historyLoadingMore}
        onLoadMore={loadHistoryMore}
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
        onApplyToCanvas={(item) => { void handleApplyHistoryToCanvas(item); }}
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
          setTimeout(handleResetView, 180);
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
          await loadHistoryFirstPage();
        }}
      />

      {/* Real-time Floating Notification Toast */}
      {/* fix16 #5: while HistoryModal is open, skip error toast — failure is already on the history card. */}
      {toast && !(isHistoryOpen && toast.type === 'error') && (
        /* fix4.1: bottom-center above bottom tool dock (bottom-6 + ~3.5rem pill); clear 「LoRA 模型中心」/「100%」. */
        <div data-testid="toast-container" className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 pointer-events-auto animate-in slide-in-from-bottom-4 duration-300 max-w-[min(48rem,94vw)] max-h-[min(40vh,24rem)] overflow-auto">
          <div
            className={`flex items-start gap-3 px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-xl border ${
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
            <div className="max-w-xl min-w-0 text-xs">
              <div className="font-bold text-sm tracking-wide flex items-start gap-2 min-w-0">
                <span className="min-w-0 whitespace-normal [overflow-wrap:anywhere] break-words" data-testid="toast-title">{toast.title}</span>
                {toast.type === 'success' && (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30">
                    完成
                  </span>
                )}
              </div>
              {(() => {
                // First line in full (upstream verbatim); a long remainder is expandable, never ellipsized away.
                const [first, ...rest] = String(toast.message ?? '').split('\n');
                const more = rest.join('\n').trim();
                return (
                  <>
                    <div data-testid="toast-first-line" className="text-slate-300 mt-0.5 leading-relaxed whitespace-pre-wrap [overflow-wrap:break-word] [word-break:normal]">{first}</div>
                    {more && (
                      <details data-testid="toast-more" className="mt-1">
                        <summary className="cursor-pointer text-cyan-300">展开全文</summary>
                        <pre className="mt-1 max-h-[40vh] overflow-auto whitespace-pre-wrap [overflow-wrap:break-word] text-[11px] text-slate-300 font-mono">{more}</pre>
                      </details>
                    )}
                  </>
                );
              })()}
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-2">
              {(() => {
                const act = toast.action ?? (toast.type === 'success' || toast.type === 'error' ? 'history' : 'none');
                if (act === 'api-settings') return (
                  <button type="button" data-testid="toast-action-api-settings" onClick={() => {
                    if (toast?.actionProviderId) setSettingsInitialProvider(toast.actionProviderId);
                    setIsSettingsOpen(true); setToast(null);
                  }}
                    className="px-2.5 py-1.5 rounded-lg bg-[#272a38] hover:bg-[#34384b] text-cyan-300 font-semibold text-xs border border-cyan-500/30 transition-colors shadow-sm">去 API 设置</button>
                );
                if (act === 'connect-ref') return (
                  <button type="button" data-testid="toast-action-connect-ref" onClick={() => {
                    const load = nodes.find((n) => n.type === 'LoadImage' && !n.bypassed);
                    if (load) setSelectedNodeId(load.id);
                    setToast(null);
                  }} className="px-2.5 py-1.5 rounded-lg bg-[#272a38] hover:bg-[#34384b] text-cyan-300 font-semibold text-xs border border-cyan-500/30 transition-colors shadow-sm">去连参考图</button>
                );
                if (act === 'history') return (
                  <button type="button" data-testid="toast-action-history" onClick={() => { setIsHistoryOpen(true); setToast(null); }}
                    className="px-2.5 py-1.5 rounded-lg bg-[#272a38] hover:bg-[#34384b] text-cyan-300 font-semibold text-xs border border-cyan-500/30 transition-colors shadow-sm">查看历史</button>
                );
                return null;
              })()}
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
                aria-label="关闭"
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
            const item = {
              ...(inspectingMediaItem || {}),
              id: inspectingMediaItem?.id || `apply-${Date.now()}`,
              url: inspectingMediaItem?.url || inspectingMediaItem?.imageUrl || '',
              prompt: params.prompt ?? inspectingMediaItem?.prompt ?? null,
              negativePrompt: params.negativePrompt ?? inspectingMediaItem?.negativePrompt,
              model: params.checkpoint ?? inspectingMediaItem?.model,
              actualModel: params.checkpoint ?? inspectingMediaItem?.actualModel,
              provider: params.provider ?? inspectingMediaItem?.provider,
              actualProvider: params.provider ?? inspectingMediaItem?.actualProvider,
              seed: params.seed ?? inspectingMediaItem?.seed ?? null,
              steps: params.steps ?? inspectingMediaItem?.steps ?? null,
              cfg: params.cfg ?? inspectingMediaItem?.cfg ?? null,
              sampler: params.sampler ?? inspectingMediaItem?.sampler,
              scheduler: params.scheduler ?? inspectingMediaItem?.scheduler,
              width: params.width ?? inspectingMediaItem?.width,
              height: params.height ?? inspectingMediaItem?.height,
              loras: params.loras ?? inspectingMediaItem?.loras,
              timestamp: inspectingMediaItem?.timestamp || Date.now(),
              workflowSnapshot: inspectingMediaItem?.workflowSnapshot,
              hasWorkflowSnapshot: inspectingMediaItem?.hasWorkflowSnapshot,
            } as GenerationHistoryItem & { hasWorkflowSnapshot?: boolean };
            void handleApplyHistoryToCanvas(item).then(() => {
              if (selectedFrameId && params.prompt) {
                handleUpdateFrame(selectedFrameId, {
                  prompt: params.prompt,
                  negativePrompt: params.negativePrompt || '',
                  imageUrl: item.url || undefined,
                  params: {
                    ...activeFrame?.params,
                    checkpoint: params.checkpoint || activeFrame?.params?.checkpoint,
                    targetProvider: (params.provider as any) || activeFrame?.params?.targetProvider,
                    seed: params.seed ?? activeFrame?.params?.seed,
                    steps: params.steps ?? activeFrame?.params?.steps,
                    cfg: params.cfg ?? activeFrame?.params?.cfg,
                    width: params.width ?? activeFrame?.params?.width,
                    height: params.height ?? activeFrame?.params?.height,
                    loras: params.loras?.length
                      ? params.loras.map((l: any) => ({
                          name: l.name,
                          modelStrength: l.strength ?? l.modelStrength,
                          clipStrength: l.strength ?? l.clipStrength ?? l.modelStrength,
                          triggerWords: l.triggerWords || '',
                        }))
                      : activeFrame?.params?.loras,
                  },
                });
              }
            });
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
              referenceImageUrl: imageUrl,
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
              title: '图生视频 · 待选择服务商与模型',
              createdAt: Date.now(),
              pos: { x: (activeFrame?.pos?.x || 200) + 520, y: activeFrame?.pos?.y || 200 },
              width: 540,
              height: 540,
              prompt: prompt || activeFrame?.prompt || '',
              negativePrompt: activeFrame?.negativePrompt || '',
              referenceImageUrl: imageUrl,
              mediaType: 'video',
              status: 'idle',
              params: {
                checkpoint: '',
                seedControl: 'fixed',
                denoise: 1.0,
                width: 832,
                height: 480,
                batchSize: 1,
                loras: [],
                targetProvider: 'video',
                videoProvider: undefined,
                requireReferenceImage: true,
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