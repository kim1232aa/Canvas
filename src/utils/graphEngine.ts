import { Connection, DataType, NodeInstance, Socket } from '../types/graph';
import { ApiKeysState } from '../types/providers';
import { getStoredApiKeys, saveToHistory } from '../services/api';
import { EngineRegistry } from '../engines/EngineRegistry';
import { NormalizedGenerateParams } from '../engines/types';
import {
  findSoleCloudEngine,
  isCloudEngineNode,
  omitUnsupportedGenerateFields,
  resolveGenerateLorasPayload,
  checkLoraArchitectureCompatibility,
} from './resolveCheckpoint';
import { assertAIVideoProviderReady } from './videoProvider';
import {modelCheckpoint} from './inspectorParameters';
import { assertResolvedResources, parseCustomParameters, explicitLoraPath } from './frontendParameters';

const MEDIA_OUTPUT_NODE_TYPES = new Set([
  'KSampler','AIVideoNode','FalAIEngineNode','GoogleImagenNode','ModelScopeNode','ModelScopeAiNode','NanoGPTNode','ReplicateEngineNode','VAEDecode','SaveImage','SaveVideo','PreviewImage',
]);

export function shouldClearExecutionOutput(nodeType: string, state: NodeInstance['state'], output: unknown, errorMessage?: string): boolean {
  return output === undefined && MEDIA_OUTPUT_NODE_TYPES.has(nodeType) && (state === 'running' || state === 'error' || (state === 'idle' && errorMessage === ''));
}

export function sanitizeExecutionSnapshotNodes(nodes: NodeInstance[]): NodeInstance[] {
  return nodes.map(({ outputData: _outputData, errorMessage: _errorMessage, executionProgress: _executionProgress, ...node }) => ({
    ...node,
    state: 'idle',
    executionProgress: 0,
  }));
}

export interface WorkflowExtraction {
  checkpointModel: string;
  checkpointBaseModel?: string;
  positivePrompt: string;
  originalPositivePrompt: string;
  prependedTriggerWords: string;
  negativePrompt: string;
  // F5: undefined = 节点上没填，不发上游、历史记 null
  width?: number;
  height?: number;
  batchSize: number;
  seed?: number;
  steps?: number;
  cfg?: number;
  sampler?: string;
  scheduler?: string;
  denoise?: number;
  loras: Array<{
    name: string;
    baseModel?: string;
    nodeId?: string;
    modelStrength: number;
    clipStrength: number;
    triggerWords: string;
    civitaiId?: string;
    unresolvedResource?: boolean;
    downloadUrl?: string;
  }>;
  targetProvider: string;
  videoProvider?: string;
  isVideo?: boolean;
  videoDuration?: number;
  videoFps?: number;
  videoFrames?: number;
  falModelName?: string;
  videoAspectRatio?: string;
  aspectRatio?: string;
  imageSize?: string;
  size?: string;
  quality?: string;
  outputFormat?: string;
  watermark?: boolean;
  promptExtend?: boolean;
  background?: string;
  moderation?: string;
  resolution?: string;
  shift?: number;
  randomSeed?: boolean;
  galleryImages?: unknown[];
  customParameters?: string;
  requireReferenceImage?: boolean;
  unresolvedModel?: boolean;
  executionBlockedReason?: string;
  sourceLoraAir?: string;
  civitaiEngine?: string;
  civitaiEcosystem?: string;
  civitaiModel?: string;
  hfProvider?: string;
  initImageUrl?: string;
  saveImageNodeId?: string;
  saveVideoNodeId?: string;
  ksamplerNodeId?: string;
  executingNodeId?: string;
  subgraphNodeIds?: string[];
}

/**
 * Validates whether two socket types can be connected.
 */
export function areSocketsCompatible(fromType: DataType, toType: DataType): boolean {
  if (fromType === 'ANY' || toType === 'ANY') return true;
  if (fromType === 'IMAGE' && toType === 'VIDEO') return true;
  if (fromType === 'VIDEO' && toType === 'IMAGE') return true;
  // 智能拓扑兼容：允许图像直连潜空间（自动插入虚拟 VAE 编码器），或文本大模型输出直连 Conditioning
  if (fromType === 'IMAGE' && toType === 'LATENT') return true;
  if (fromType === 'STRING' && toType === 'CONDITIONING') return true;
  // 智能拓扑兼容：允许提示词 Conditioning 直连 SaveImage（云端大模型生图，免除本地采样扩散链路）
  if (fromType === 'CONDITIONING' && toType === 'IMAGE') return true;
  // 智能拓扑兼容：允许潜空间 LATENT 直连 SaveImage（云端生图服务直接产出像素，虚拟 VAE 解码）
  if (fromType === 'LATENT' && toType === 'IMAGE') return true;
  return fromType === toType;
}

/**
 * Deduces provider faithfully based on model naming format
 */


/**
 * Finds downstream generator node if an upstream node was selected
 */
function findDownstreamGenerator(
  startId: string,
  connections: Connection[],
  nodeMap: Map<string, NodeInstance>
): NodeInstance | undefined {
  const visited = new Set<string>();
  const queue = [startId];
  let cloud: NodeInstance | undefined;
  let ksampler: NodeInstance | undefined;
  let sink: NodeInstance | undefined;
  while (queue.length > 0) {
    const currId = queue.shift()!;
    if (visited.has(currId)) continue;
    visited.add(currId);

    const outConns = connections.filter((c) => c.fromNodeId === currId);
    for (const conn of outConns) {
      const dest = nodeMap.get(conn.toNodeId);
      if (!dest || dest.bypassed) continue;
      if (isCloudEngineNode(dest)) {
        if (!cloud) cloud = dest;
        continue;
      }
      if (dest.type === 'KSampler') {
        if (!ksampler) ksampler = dest;
        continue;
      }
      if (dest.type === 'SaveVideo' || dest.type === 'SaveImage' || dest.type === 'PreviewImage') {
        if (!sink) sink = dest;
        continue;
      }
      queue.push(dest.id);
    }
  }
  return cloud || ksampler || sink;
}

/**
 * Resolves target node from explicit argument or graph structure
 */
export function resolveTargetNode(
  nodes: NodeInstance[],
  connections: Connection[],
  targetNodeOrId?: NodeInstance | string
): NodeInstance {
  const nodeMap = new Map<string, NodeInstance>(nodes.map((n) => [n.id, n]));

  if (targetNodeOrId) {
    const id = typeof targetNodeOrId === 'string' ? targetNodeOrId : targetNodeOrId.id;
    const target = nodeMap.get(id);
    if (!target) {
      throw new Error(`未找到指定的执行节点: ${id}`);
    }
    return target;
  }

  // Auto-detect target node if not provided
  const activeNodes = nodes.filter((n) => !n.bypassed);
  if (activeNodes.length === 0) {
    throw new Error('画布上暂无可执行的节点');
  }

  // Sole cloud engine (Fal/Gemini/…) beats a zombie KSampler + CheckpointLoaderSimple.
  const sole = findSoleCloudEngine(activeNodes);
  if (sole) return sole;

  // 1. Sinks (SaveVideo, SaveImage, PreviewImage)
  const sink = activeNodes.find((n) => n.type === 'SaveVideo' || n.type === 'SaveImage' || n.type === 'PreviewImage');
  if (sink) return sink;

  // 2. Generators — cloud engines before KSampler (never fall through to HF on a Fal graph)
  const cloud = activeNodes.find((n) => isCloudEngineNode(n));
  if (cloud) return cloud;
  const gen = activeNodes.find((n) => n.type === 'KSampler');
  if (gen) return gen;

  // 3. Loaders / Other active nodes
  const ckpt = activeNodes.find((n) => n.type === 'CheckpointLoaderSimple');
  if (ckpt) return ckpt;

  return activeNodes[0];
}

/**
 * Traces backwards through LoRA and Checkpoint loader chain along model connections
 */
function traceModelAndLorasUpstream(
  startId: string,
  connections: Connection[],
  nodeMap: Map<string, NodeInstance>,
  loras: WorkflowExtraction['loras'],
  subgraphNodeIds: Set<string>
): NodeInstance | undefined {
  let currId: string | undefined = startId;
  const visited = new Set<string>();

  while (currId && !visited.has(currId)) {
    visited.add(currId);
    const n = nodeMap.get(currId);
    if (!n || n.bypassed) break;
    subgraphNodeIds.add(n.id);

    if (n.type === 'CheckpointLoaderSimple') {
      return n;
    }
    if (n.type === 'LoRALoader') {
      // Unselected / cleared lora_name: keep walking the chain but push nothing (never forge a name).
      if (String(n.values.lora_name ?? '').trim()) {
        loras.push({
          name: String(n.values.lora_name).trim(),
          baseModel: n.values.base_model || n.values.baseModel || '',
          nodeId: n.id,
          modelStrength: Number(n.values.strength_model ?? 0.8),
          clipStrength: Number(n.values.strength_clip ?? 0.8),
          triggerWords: n.values.trigger_words || '',
          civitaiId: n.values.civitai_id || n.values.civitaiId || '',
          unresolvedResource: n.values.import_unresolved_resource === true || n.values.unresolvedResource === true,
          downloadUrl: n.values.download_url || n.values.downloadUrl,
        });
      }
      const inConn = connections.find((c) => c.toNodeId === n.id && c.toSocketId === 'model');
      currId = inConn?.fromNodeId;
    } else if (n.type === 'CivitaiLoRABrowserNode') {
      if (n.values.selected_model_name) {
        loras.push({
          name: n.values.selected_model_name,
          baseModel: n.values.baseModel || n.values.base_model || '',
          nodeId: n.id,
          modelStrength: 0.8,
          clipStrength: 0.8,
          triggerWords: n.values.selected_triggers || '',
        });
      }
      const inConn = connections.find((c) => c.toNodeId === n.id && c.toSocketId === 'model');
      currId = inConn?.fromNodeId;
    } else {
      break;
    }
  }
  return undefined;
}

/**
 * Traces backwards through LoRA loader chain along lora connections
 */
function traceLorasUpstream(
  startId: string,
  connections: Connection[],
  nodeMap: Map<string, NodeInstance>,
  loras: WorkflowExtraction['loras'],
  subgraphNodeIds: Set<string>
): void {
  let currId: string | undefined = startId;
  const visited = new Set<string>();

  while (currId && !visited.has(currId)) {
    visited.add(currId);
    const n = nodeMap.get(currId);
    if (!n || n.bypassed) break;
    subgraphNodeIds.add(n.id);

    if (n.type === 'LoRALoader') {
      // Unselected / cleared lora_name: keep walking the chain but push nothing (never forge a name).
      if (String(n.values.lora_name ?? '').trim()) {
        loras.push({
          name: String(n.values.lora_name).trim(),
          baseModel: n.values.base_model || n.values.baseModel || '',
          nodeId: n.id,
          modelStrength: Number(n.values.strength_model ?? 0.8),
          clipStrength: Number(n.values.strength_clip ?? 0.8),
          triggerWords: n.values.trigger_words || '',
          civitaiId: n.values.civitai_id || n.values.civitaiId || '',
          unresolvedResource: n.values.import_unresolved_resource === true || n.values.unresolvedResource === true,
          downloadUrl: n.values.download_url || n.values.downloadUrl,
        });
      }
      const inConn = connections.find((c) => c.toNodeId === n.id && c.toSocketId === 'model');
      currId = inConn?.fromNodeId;
    } else if (n.type === 'CivitaiLoRABrowserNode') {
      if (n.values.selected_model_name) {
        loras.push({
          name: n.values.selected_model_name,
          baseModel: n.values.baseModel || n.values.base_model || '',
          nodeId: n.id,
          modelStrength: 0.8,
          clipStrength: 0.8,
          triggerWords: n.values.selected_triggers || '',
        });
      }
      const inConn = connections.find((c) => c.toNodeId === n.id && c.toSocketId === 'model');
      currId = inConn?.fromNodeId;
    } else {
      break;
    }
  }
}

/**
 * Traces backwards and collects node values according to graph connections,
 * rooted at the current executing node.
 */
function numOrUndef(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function strOrUndef(v: unknown): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  return String(v);
}

export function extractWorkflowParameters(
  nodes: NodeInstance[],
  connections: Connection[],
  targetNodeOrId?: NodeInstance | string
): WorkflowExtraction {
  const nodeMap = new Map<string, NodeInstance>(nodes.map((n) => [n.id, n]));
  const rootTargetNode = resolveTargetNode(nodes, connections, targetNodeOrId);

  if (rootTargetNode.bypassed) {
    throw new Error('当前选中的节点已旁路(bypassed)，无法执行');
  }

  const subgraphNodeIds = new Set<string>([rootTargetNode.id]);
  let execNode = rootTargetNode;
  let saveVideoNodeId: string | undefined = undefined;
  let saveImageNodeId: string | undefined = undefined;

  // Resolve generator node if a sink or upstream node was selected
  if (rootTargetNode.type === 'SaveVideo') {
    saveVideoNodeId = rootTargetNode.id;
    const inConn = connections.find(
      (c) => c.toNodeId === rootTargetNode.id && (c.toSocketId === 'video' || c.toSocketId === 'VIDEO')
    );
    if (inConn) {
      const src = nodeMap.get(inConn.fromNodeId);
      if (src && !src.bypassed) {
        execNode = src;
        subgraphNodeIds.add(src.id);
      }
    }
  } else if (rootTargetNode.type === 'SaveImage' || rootTargetNode.type === 'PreviewImage') {
    saveImageNodeId = rootTargetNode.id;
    const inConn = connections.find(
      (c) => c.toNodeId === rootTargetNode.id && (c.toSocketId === 'images' || c.toSocketId === 'image')
    );
    if (inConn) {
      const src = nodeMap.get(inConn.fromNodeId);
      if (src && !src.bypassed) {
        subgraphNodeIds.add(src.id);
        if (src.type === 'VAEDecode') {
          const sampleConn = connections.find((c) => c.toNodeId === src.id && c.toSocketId === 'samples');
          if (sampleConn) {
            const ksampler = nodeMap.get(sampleConn.fromNodeId);
            if (ksampler && !ksampler.bypassed) {
              execNode = ksampler;
              subgraphNodeIds.add(ksampler.id);
            }
          }
        } else {
          execNode = src;
        }
      }
    }
  } else if (
    rootTargetNode.type === 'CheckpointLoaderSimple' ||
    rootTargetNode.type === 'CLIPTextEncode' ||
    rootTargetNode.type === 'CLIPTextEncodeNegative' ||
    rootTargetNode.type === 'EmptyLatentImage' ||
    rootTargetNode.type === 'LoRALoader' ||
    rootTargetNode.type === 'LoraLoader' ||
    rootTargetNode.type === 'LoraLoaderModelOnly' ||
    rootTargetNode.type === 'CivitaiLoRABrowserNode'
  ) {
    const downstreamGen = findDownstreamGenerator(rootTargetNode.id, connections, nodeMap);
    if (downstreamGen) {
      if (downstreamGen.type === 'SaveImage' || downstreamGen.type === 'PreviewImage') {
        saveImageNodeId = downstreamGen.id;
        subgraphNodeIds.add(downstreamGen.id);
        const inConn = connections.find(
          (c) => c.toNodeId === downstreamGen.id && (c.toSocketId === 'images' || c.toSocketId === 'image')
        );
        if (inConn) {
          const src = nodeMap.get(inConn.fromNodeId);
          if (src && !src.bypassed) {
            subgraphNodeIds.add(src.id);
            if (src.type === 'VAEDecode') {
              const sampleConn = connections.find((c) => c.toNodeId === src.id && c.toSocketId === 'samples');
              if (sampleConn) {
                const ksampler = nodeMap.get(sampleConn.fromNodeId);
                if (ksampler && !ksampler.bypassed) {
                  execNode = ksampler;
                  subgraphNodeIds.add(ksampler.id);
                }
              }
            } else {
              execNode = src;
            }
          }
        }
      } else {
        execNode = downstreamGen;
        subgraphNodeIds.add(downstreamGen.id);
      }
    } else {
      const sole = findSoleCloudEngine(nodes);
      if (sole) {
        execNode = sole;
        subgraphNodeIds.add(sole.id);
      }
    }
  }

  // Detect downstream sinks connected to execNode
  if (!saveVideoNodeId && execNode.type === 'AIVideoNode') {
    const outConns = connections.filter((c) => c.fromNodeId === execNode.id);
    for (const oc of outConns) {
      const dest = nodeMap.get(oc.toNodeId);
      if (dest && !dest.bypassed && dest.type === 'SaveVideo') {
        saveVideoNodeId = dest.id;
        subgraphNodeIds.add(dest.id);
        break;
      }
    }
  }

  if (!saveImageNodeId) {
    const outConns = connections.filter((c) => c.fromNodeId === execNode.id);
    for (const oc of outConns) {
      const dest = nodeMap.get(oc.toNodeId);
      if (dest && !dest.bypassed) {
        if (dest.type === 'SaveImage' || dest.type === 'PreviewImage') {
          saveImageNodeId = dest.id;
          subgraphNodeIds.add(dest.id);
          break;
        } else if (dest.type === 'VAEDecode') {
          subgraphNodeIds.add(dest.id);
          const vaeOutConns = connections.filter((c) => c.fromNodeId === dest.id);
          for (const voc of vaeOutConns) {
            const saveNode = nodeMap.get(voc.toNodeId);
            if (saveNode && !saveNode.bypassed && (saveNode.type === 'SaveImage' || saveNode.type === 'PreviewImage')) {
              saveImageNodeId = saveNode.id;
              subgraphNodeIds.add(saveNode.id);
              break;
            }
          }
        }
      }
    }
  }

  // 1. Prompts (Positive & Negative) along incoming edges
  let positivePrompt = '';
  let negativePrompt = '';

  const posConn = connections.find(
    (c) => c.toNodeId === execNode.id && (c.toSocketId === 'positive' || c.toSocketId === 'prompt')
  );
  if (posConn) {
    const src = nodeMap.get(posConn.fromNodeId);
    if (src && !src.bypassed) {
      subgraphNodeIds.add(src.id);
      if (src.type === 'CLIPTextEncode') {
        positivePrompt = (src.values.text || '').trim();
      } else if (src.type === 'PromptRefinerLLM') {
        positivePrompt = (src.values.concept || '').trim();
      } else if (src.type === 'LLMReasoningNode') {
        positivePrompt = (src.values.refined_output || src.values.prompt || src.values.input_text || '').trim();
      } else {
        positivePrompt = (src.values.text || src.values.prompt || src.values.concept || '').trim();
      }
    }
  }
  if (!positivePrompt) {
    positivePrompt = (execNode.values.prompt || execNode.values.text || execNode.values.concept || '').trim();
  }

  const negConn = connections.find(
    (c) => c.toNodeId === execNode.id && (c.toSocketId === 'negative' || c.toSocketId === 'negative_prompt')
  );
  if (negConn) {
    const src = nodeMap.get(negConn.fromNodeId);
    if (src && !src.bypassed) {
      subgraphNodeIds.add(src.id);
      negativePrompt = (src.values.text || src.values.negative_prompt || '').trim();
    }
  }
  if (!negativePrompt) {
    negativePrompt = (execNode.values.negative_prompt || '').trim();
  }

  // 2. Reference image (initImageUrl) strictly along incoming edges (NO canvas fallback!)
  let initImageUrl: string | undefined = undefined;
  const imgConn = connections.find(
    (c) =>
      c.toNodeId === execNode.id &&
      (c.toSocketId === 'init_image' || c.toSocketId === 'image' || c.toSocketId === 'latent_image' || c.toSocketId === 'pixels')
  );
  if (imgConn) {
    const src = nodeMap.get(imgConn.fromNodeId);
    if (src && !src.bypassed) {
      if (src.type === 'LoadImage') {
        initImageUrl = src.values.image_url || undefined;
        subgraphNodeIds.add(src.id);
      } else if (src.type === 'SaveImage') {
        initImageUrl = typeof src.outputData === 'string' ? src.outputData : src.outputData?.imageUrl;
        subgraphNodeIds.add(src.id);
      } else if (src.type === 'VAEEncode') {
        subgraphNodeIds.add(src.id);
        const pixelConn = connections.find(
          (c) => c.toNodeId === src.id && (c.toSocketId === 'pixels' || c.toSocketId === 'image')
        );
        if (pixelConn) {
          const imgNode = nodeMap.get(pixelConn.fromNodeId);
          if (imgNode && !imgNode.bypassed && imgNode.type === 'LoadImage') {
            initImageUrl = imgNode.values.image_url || undefined;
            subgraphNodeIds.add(imgNode.id);
          }
        }
      }
    }
  }

  const pendingNodes = Array.from(subgraphNodeIds).map(id=>nodeMap.get(id)).filter((n):n is NodeInstance=>Boolean(n));
  for(const n of pendingNodes) {
    if(n.values.execution_blocked_reason)throw new Error(String(n.values.execution_blocked_reason));
    if(n.values.source_lora_air)throw new Error('来源 LoRA 执行链尚未接入；请保留此历史档案，创建新的显式生成分支');
  }
  // 3. Node-specific parameter extraction
  let checkpointModel = '';
  let checkpointBaseModel: string | undefined = undefined;
  let targetProvider: WorkflowExtraction['targetProvider'] = 'civitai';
  let videoProvider: string | undefined = undefined;
  let isVideo = false;
  let videoDuration: number | undefined = undefined;
  let videoFps: number | undefined = undefined;
  let videoFrames: number | undefined;
  let falModelName: string | undefined;
  let videoAspectRatio: string | undefined = undefined;
  let aspectRatio: string | undefined = undefined;
  let imageSize: string | undefined = undefined;
  let size: string | undefined = undefined;
  let quality: string | undefined = undefined;
  let outputFormat: string | undefined = undefined;
  let background: string | undefined = undefined;
  let moderation: string | undefined = undefined;
  let resolution: string | undefined = undefined;
  let shift: number | undefined;
  let randomSeed: boolean | undefined;
  let galleryImages: unknown[] | undefined;
  let customParameters: string | undefined;
  let hfProvider: string | undefined;
  let width: number | undefined;
  let height: number | undefined;
  let batchSize = 1;
  let seed: number | undefined;
  let steps: number | undefined;
  let cfg: number | undefined;
  let sampler: string | undefined;
  let scheduler: string | undefined;
  let denoise: number | undefined;
  const loras: WorkflowExtraction['loras'] = [];
  let ksamplerNodeId: string | undefined = undefined;

  if (execNode.type === 'AIVideoNode') {
    isVideo = true;
    targetProvider = 'video';
    videoProvider = execNode.values.targetProvider || execNode.values.provider || undefined;
    checkpointModel = (execNode.values.model || '').trim();
    checkpointBaseModel = (execNode.values.base_model || execNode.values.baseModel || '').trim() || undefined;
    if (!checkpointModel) {
      throw new Error('请先选择模型');
    }
    // F4: reject empty / schema-mismatched provider — never fall back to Fal
    videoProvider = assertAIVideoProviderReady(checkpointModel, videoProvider);
    batchSize = numOrUndef(execNode.values.n ?? execNode.values.batch_size ?? execNode.values.batchSize) as number;
    videoFrames=numOrUndef(execNode.values.num_frames);
    videoDuration = numOrUndef(execNode.values.duration);
    videoFps = numOrUndef(execNode.values.fps);
    videoAspectRatio = strOrUndef(execNode.values.aspect_ratio);
    resolution = strOrUndef(execNode.values.resolution);
    size = strOrUndef(execNode.values.size);
    seed = (execNode.values.control_after_generate ?? execNode.values.seedControl) === 'randomize'
      ? Math.floor(Math.random() * 1000000000)
      : numOrUndef(execNode.values.seed);
    customParameters = execNode.values.custom_parameters;
  } else if (execNode.type === 'FalAIEngineNode') {
    isVideo = false;
    targetProvider = 'fal';
    checkpointModel = (execNode.values.model || '').trim();
    checkpointBaseModel = (execNode.values.base_model || execNode.values.baseModel || '').trim() || undefined;
    if (!checkpointModel) {
      throw new Error('请先选择模型');
    }
    steps = numOrUndef(execNode.values.steps);
    cfg = numOrUndef(execNode.values.guidance_scale);
    const res = strOrUndef(execNode.values.resolution);
    const resParts = res ? res.split('x') : [];
    if (resParts.length === 2) {
      width = numOrUndef(resParts[0]);
      height = numOrUndef(resParts[1]);
    }
    const loraConn = connections.find((c) => c.toNodeId === execNode.id && c.toSocketId === 'lora');
    if (loraConn) {
      traceLorasUpstream(loraConn.fromNodeId, connections, nodeMap, loras, subgraphNodeIds);
    }
    customParameters = execNode.values.custom_parameters;
  } else if (execNode.type === 'ReplicateEngineNode') {
    isVideo = false;
    targetProvider = 'replicate';
    checkpointModel = (execNode.values.model || '').trim();
    checkpointBaseModel = (execNode.values.base_model || execNode.values.baseModel || '').trim() || undefined;
    if (!checkpointModel) {
      throw new Error('请先选择模型');
    }
    steps = numOrUndef(execNode.values.steps);
    cfg = numOrUndef(execNode.values.guidance_scale ?? execNode.values.cfg);
    const res = strOrUndef(execNode.values.resolution);
    const resParts = res ? res.split('x') : [];
    if (resParts.length === 2) {
      width = numOrUndef(resParts[0]);
      height = numOrUndef(resParts[1]);
    }
    const loraConn = connections.find((c) => c.toNodeId === execNode.id && c.toSocketId === 'lora');
    if (loraConn) {
      traceLorasUpstream(loraConn.fromNodeId, connections, nodeMap, loras, subgraphNodeIds);
    }
    customParameters = execNode.values.custom_parameters;
  } else if (execNode.type === 'GoogleImagenNode') {
    isVideo = false;
    targetProvider = 'gemini';
    checkpointModel = (execNode.values.model || '').trim();
    checkpointBaseModel = (execNode.values.base_model || execNode.values.baseModel || '').trim() || undefined;
    if (!checkpointModel) {
      throw new Error('请先选择模型');
    }
    aspectRatio = execNode.values.aspect_ratio || undefined;
    imageSize = execNode.values.image_size || undefined;
  } else if (execNode.type === 'ModelScopeNode' || execNode.type === 'ModelScopeAiNode') {
    isVideo = false;
    targetProvider = execNode.type === 'ModelScopeAiNode' ? 'modelscope_ai' : 'modelscope';
    checkpointModel = (execNode.values.model_endpoint || execNode.values.model || '').trim();
    checkpointBaseModel = (execNode.values.base_model || execNode.values.baseModel || '').trim() || undefined;
    if (!checkpointModel) {
      throw new Error('请先选择模型');
    }
    customParameters = execNode.values.custom_parameters;
  } else if (execNode.type === 'NanoGPTNode') {
    customParameters = execNode.values.custom_parameters;
    isVideo = false;
    targetProvider = 'nanogpt';
    checkpointModel = (execNode.values.model || '').trim();
    checkpointBaseModel = (execNode.values.base_model || execNode.values.baseModel || '').trim() || undefined;
    if (!checkpointModel) {
      throw new Error('请先选择模型');
    }
  } else if (execNode.type === 'CheckpointLoaderSimple') {
    isVideo = false;
    checkpointModel = (execNode.values.model || execNode.values.ckpt_name || '').trim();
    checkpointBaseModel = (execNode.values.base_model || execNode.values.baseModel || '').trim() || undefined;
    if (!checkpointModel) {
      throw new Error('请先选择模型');
    }
    targetProvider = (execNode.values.targetProvider || '').trim();
    if (!targetProvider) throw new Error('请选择执行服务商；不会从模型名称猜测引擎');
    size = execNode.values.size || undefined;
    quality = execNode.values.quality || undefined;
    outputFormat = execNode.values.output_format || execNode.values.outputFormat || undefined;
    background = execNode.values.background || undefined;
    moderation = execNode.values.moderation || undefined;
    resolution = execNode.values.resolution || undefined;
    shift = numOrUndef(execNode.values.shift);
    randomSeed = typeof execNode.values.random_seed === 'boolean' ? execNode.values.random_seed : undefined;
    galleryImages = Array.isArray(execNode.values.gallery_images) ? execNode.values.gallery_images : undefined;
    customParameters=execNode.values.custom_parameters;
    hfProvider = execNode.values.hf_provider || undefined;
    aspectRatio = execNode.values.aspect_ratio || execNode.values.aspectRatio || undefined;
    if (execNode.values.n != null || execNode.values.batch_size != null || execNode.values.batchSize != null) {
      batchSize = numOrUndef(execNode.values.n ?? execNode.values.batch_size ?? execNode.values.batchSize) ?? batchSize;
    }
  } else if (execNode.type === 'KSampler') {
    isVideo = false;
    ksamplerNodeId = execNode.id;
    const vals = execNode.values;
    if (vals.control_after_generate === 'randomize') {
      seed = Math.floor(Math.random() * 1000000000);
    } else {
      seed = numOrUndef(vals.seed);
    }
    steps = numOrUndef(vals.steps);
    cfg = numOrUndef(vals.cfg);
    sampler = strOrUndef(vals.sampler_name);
    scheduler = strOrUndef(vals.scheduler);
    denoise = numOrUndef(vals.denoise);

    const modelConn = connections.find((c) => c.toNodeId === execNode.id && c.toSocketId === 'model');
    if (!modelConn) {
      throw new Error('请先选择模型');
    }
    const ckpt = traceModelAndLorasUpstream(modelConn.fromNodeId, connections, nodeMap, loras, subgraphNodeIds);
    if (!ckpt) {
      throw new Error('请先选择模型');
    }
    checkpointModel = (ckpt.values.model || ckpt.values.ckpt_name || '').trim();
    checkpointBaseModel = (ckpt.values.base_model || ckpt.values.baseModel || '').trim() || undefined;
    if (!checkpointModel) {
      throw new Error('请先选择模型');
    }
    targetProvider = (ckpt.values.targetProvider || '').trim();
    if (!targetProvider) throw new Error('请选择执行服务商；不会从模型名称猜测引擎');
    size = ckpt.values.size || undefined;
    quality = ckpt.values.quality || undefined;
    outputFormat = ckpt.values.output_format || ckpt.values.outputFormat || undefined;
    background = ckpt.values.background || undefined;
    moderation = ckpt.values.moderation || undefined;
    resolution = ckpt.values.resolution || undefined;
    shift = numOrUndef(ckpt.values.shift);
    randomSeed = typeof ckpt.values.random_seed === 'boolean' ? ckpt.values.random_seed : undefined;
    galleryImages = Array.isArray(ckpt.values.gallery_images) ? ckpt.values.gallery_images : undefined;
    customParameters=ckpt.values.custom_parameters;
    hfProvider = ckpt.values.hf_provider || undefined;
    falModelName=ckpt.values.fal_model_name || undefined;
    aspectRatio = ckpt.values.aspect_ratio || ckpt.values.aspectRatio || aspectRatio;
    if (ckpt.values.n != null || ckpt.values.batch_size != null || ckpt.values.batchSize != null) {
      batchSize = numOrUndef(ckpt.values.n ?? ckpt.values.batch_size ?? ckpt.values.batchSize) ?? batchSize;
    }

    const latentConn = connections.find((c) => c.toNodeId === execNode.id && c.toSocketId === 'latent_image');
    if (latentConn) {
      const src = nodeMap.get(latentConn.fromNodeId);
      if (src && !src.bypassed && src.type === 'EmptyLatentImage') {
        subgraphNodeIds.add(src.id);
        width = numOrUndef(src.values.width);
        height = numOrUndef(src.values.height);
        batchSize = numOrUndef(src.values.batch_size) ?? batchSize;
      }
    }
  } else {
    checkpointModel = (execNode.values.model || execNode.values.ckpt_name || '').trim();
    checkpointBaseModel = (execNode.values.base_model || execNode.values.baseModel || '').trim() || undefined;
    targetProvider = (execNode.values.targetProvider || '').trim();

    // 智能拓扑反向追踪：若执行节点本身无模型配置（例如正向提示词节点直连 SaveImage），沿 clip/model 上游追踪 CheckpointLoaderSimple
    if (!checkpointModel) {
      const upstreamConn = connections.find(
        (c) => c.toNodeId === execNode.id && (c.toSocketId === 'clip' || c.toSocketId === 'model')
      );
      if (upstreamConn) {
        const src = nodeMap.get(upstreamConn.fromNodeId);
        if (src && !src.bypassed && src.type === 'CheckpointLoaderSimple') {
          subgraphNodeIds.add(src.id);
          checkpointModel = (src.values.ckpt_name || src.values.model || '').trim();
          checkpointBaseModel = (src.values.base_model || src.values.baseModel || '').trim() || undefined;
          targetProvider = (src.values.targetProvider || '').trim();
          size = src.values.size || undefined;
          quality = src.values.quality || undefined;
          outputFormat = src.values.output_format || src.values.outputFormat || undefined;
          background = src.values.background || undefined;
          moderation = src.values.moderation || undefined;
          resolution = src.values.resolution || undefined;
          shift = numOrUndef(src.values.shift);
          randomSeed = typeof src.values.random_seed === 'boolean' ? src.values.random_seed : undefined;
          galleryImages = Array.isArray(src.values.gallery_images) ? src.values.gallery_images : undefined;
          customParameters = src.values.custom_parameters;
          hfProvider = src.values.hf_provider || undefined;
          aspectRatio = src.values.aspect_ratio || src.values.aspectRatio || aspectRatio;
          if (src.values.n != null || src.values.batch_size != null || src.values.batchSize != null) {
            batchSize = numOrUndef(src.values.n ?? src.values.batch_size ?? src.values.batchSize) ?? batchSize;
          }
        }
      }
    }

    if (!checkpointModel) {
      throw new Error('请先选择模型');
    }
    if (!targetProvider) throw new Error('请选择执行服务商；不会从模型名称猜测引擎');
  }

  // 4. Validate mandatory positive prompt (L2b: NO fallback to hardcoded string!)
  if (!positivePrompt || !positivePrompt.trim()) {
    throw new Error('请填写提示词');
  }

  // Append LoRA triggers if needed (only for architecture-compatible LoRAs)
  const originalPositivePrompt = positivePrompt;
  const compatibleLorasForTriggers = loras.filter(
    (l) => checkLoraArchitectureCompatibility(checkpointModel, checkpointBaseModel, l).compatible
  );
  const triggerWordsAll = compatibleLorasForTriggers
    .map((l) => l.triggerWords)
    .filter(Boolean)
    .join(', ');

  let finalPositive = positivePrompt;
  if (triggerWordsAll && !finalPositive.includes(triggerWordsAll)) {
    finalPositive = `${triggerWordsAll}, ${finalPositive}`.trim();
  }

  const recipeNode = modelCheckpoint(nodes,connections,execNode.id) || Array.from(subgraphNodeIds).map(id=>nodeMap.get(id)).find(n=>n?.type==='CheckpointLoaderSimple' && (n.values.ckpt_name===checkpointModel || n.values.model===checkpointModel)) || execNode;
  const recipeValues = recipeNode.values;
  const isModelUnresolved = (recipeValues.import_unresolved_resource === true || recipeValues.unresolvedResource === true) && recipeValues.resourceVerified !== true;
  if (isModelUnresolved) throw new Error(`底模 ${checkpointModel || '未指定'} 尚未核实，请重新选择已核实资源`);
  if (recipeValues.execution_blocked_reason) throw new Error(String(recipeValues.execution_blocked_reason));
  if (recipeValues.source_lora_air) throw new Error('来源 LoRA 执行链尚未接入；请保留此历史档案，创建新的显式生成分支');
  if (recipeValues.require_reference_image === true && !initImageUrl) throw new Error('编辑输入需要明确参考图，请选择或上传参考图');
  const recipe = recipeNode.values;
  assertResolvedResources(loras);
  return {
    requireReferenceImage: recipe.require_reference_image === true,
    unresolvedModel: isModelUnresolved,
    executionBlockedReason: strOrUndef(recipe.execution_blocked_reason),
    sourceLoraAir: strOrUndef(recipe.source_lora_air),
    watermark: targetProvider === 'sensenova' && typeof recipe.watermark === 'boolean' ? recipe.watermark : undefined,
    promptExtend: targetProvider === 'sensenova' && typeof recipe.prompt_extend === 'boolean' ? recipe.prompt_extend : undefined,
    civitaiEngine: strOrUndef(recipe.civitai_engine),
    civitaiEcosystem: strOrUndef(recipe.civitai_ecosystem),
    civitaiModel: strOrUndef(recipe.civitai_model),
    checkpointModel,
    checkpointBaseModel,
    positivePrompt: finalPositive,
    originalPositivePrompt,
    prependedTriggerWords: triggerWordsAll && finalPositive !== originalPositivePrompt ? triggerWordsAll : '',
    negativePrompt,
    width,
    height,
    batchSize,
    seed,
    steps,
    cfg,
    sampler,
    scheduler,
    denoise,
    loras,
    targetProvider,
    videoProvider,
    isVideo,
    videoDuration,
    videoFps,
    videoFrames,
    falModelName,
    videoAspectRatio,
    aspectRatio,
    imageSize,
    size,
    quality,
    outputFormat,
    background,
    moderation,
    resolution,
    shift,
    randomSeed,
    galleryImages,
    customParameters,
    hfProvider,
    initImageUrl,
    saveImageNodeId,
    saveVideoNodeId,
    ksamplerNodeId,
    executingNodeId: execNode.id,
    subgraphNodeIds: Array.from(subgraphNodeIds),
  };
}

/**
 * Executes the workflow with real providers and manages visual node progress,
 * strictly scoped to the targeted node and its subgraph.
 */
export async function executeWorkflow(
  nodes: NodeInstance[],
  connections: Connection[],
  onNodeStateChange: (nodeId: string, state: NodeInstance['state'], progress?: number, output?: any, errorMessage?: string) => void,
  onProgress?: (percent: number, statusText: string, details?: { omissions?: Array<{ field: string; value: unknown; reason: string }> }) => void,
  targetNodeOrId?: NodeInstance | string
): Promise<{ imageUrl: string; provider: string; model: string; seed: number | null; isVideo?: boolean; executingNodeId?: string; historyWarning?: string }> {
  let stepInterval: any = null;
  let executingIds = new Set<string>();
  let outputIds = new Set<string>();
  let targetErrorNodeId: string | undefined = typeof targetNodeOrId === 'string' ? targetNodeOrId : targetNodeOrId?.id;

  try {
    const params = extractWorkflowParameters(nodes, connections, targetNodeOrId);
    targetErrorNodeId = params.executingNodeId || targetErrorNodeId;
    executingIds = new Set(params.subgraphNodeIds);

    const subgraphSet = new Set(params.subgraphNodeIds || []);
    const activeNodes = nodes.filter((n) => !n.bypassed && (subgraphSet.size === 0 || subgraphSet.has(n.id)));
    const ckptNodes = activeNodes.filter((n) => n.type === 'CheckpointLoaderSimple');
    const clipNodes = activeNodes.filter((n) => n.type === 'CLIPTextEncode' || n.type === 'CLIPTextEncodeNegative');
    const loraNodes = activeNodes.filter((n) => n.type === 'LoRALoader');
    const latentNodes = activeNodes.filter((n) => n.type === 'EmptyLatentImage' || n.type === 'VAEEncode' || n.type === 'LoadImage');
    const ksamplerNodes = activeNodes.filter(
      (n) =>
        n.type === 'KSampler' ||
        n.type === 'AIVideoNode' ||
        n.type === 'FalAIEngineNode' ||
        n.type === 'GoogleImagenNode' ||
        n.type === 'ModelScopeNode' ||
        n.type === 'ModelScopeAiNode' ||
        n.type === 'NanoGPTNode' ||
        n.type === 'ReplicateEngineNode'
    );
    const vaeNodes = activeNodes.filter((n) => n.type === 'VAEDecode');
    const saveNodes = activeNodes.filter(n => n.id === params.executingNodeId || n.id === params.saveImageNodeId || n.id === params.saveVideoNodeId);
    outputIds = new Set(saveNodes.map(n=>n.id));

    onProgress?.(15, `已整理工作流参数：${params.targetProvider} / ${params.checkpointModel}；${params.loras.length} 个 LoRA 请求参数，尚未提交上游`);
    // Reset prior media outputs on the branch before a new request so stale previews cannot survive a failed rerun.
    [...ckptNodes,...clipNodes,...loraNodes,...latentNodes,...saveNodes].forEach(n=>onNodeStateChange(n.id,'idle',0,undefined,''));

    let resultMedia = '';
    let usedProvider: string = params.targetProvider;
    let usedModel = params.checkpointModel;
    const isVideo = Boolean(params.isVideo);

    const storedKeys = getStoredApiKeys() as unknown as Record<string, string>;

    const engProv = params.videoProvider || params.targetProvider;
    const engModel = params.checkpointModel;
    const grokish = params.targetProvider === 'grok_compat' || params.videoProvider === 'grok_compat';
    const grokOrOpenAi = params.targetProvider === 'openai_compat' || params.targetProvider === 'grok_compat' || params.videoProvider === 'grok_compat';
    const omissions: Array<{ field: string; value: unknown; reason: string }> = [];

    // Check architecture compatibility for each LoRA
    const compatibleLoras: typeof params.loras = [];
    for (const l of params.loras) {
      const compat = checkLoraArchitectureCompatibility(
        params.checkpointModel,
        params.checkpointBaseModel,
        l
      );
      if (!compat.compatible) {
        const reason = `LoRA [${l.name}] 与底模 [${params.checkpointModel}] 架构不兼容，拒绝静默丢弃执行`;
        if (l.nodeId) {
          onNodeStateChange(l.nodeId, 'error', 0, undefined, reason);
        }
        throw new Error(reason);
      } else {
        compatibleLoras.push(l);
      }
    }

    // 0. 前置大模型深度推理思考阶段 (LLM Reasoning Pre-Execution Pipeline)
    let llmPrompt: string | undefined = undefined;
    const llmNode = activeNodes.find((n) => n.type === 'LLMReasoningNode');
    if (llmNode && (llmNode.values.prompt || llmNode.values.input_text)) {
      onNodeStateChange(llmNode.id, 'running', 40);
      try {
        const reasoningProvider = llmNode.values.provider;
        if (!reasoningProvider) throw new Error('请先选择推理服务商');
        const reasoningModel = String(llmNode.values.model || '').trim();
        if (!reasoningModel) throw new Error('模型为必填项（推理节点）');
        const taskType = llmNode.values.task_type || 'cinematic_photoreal';

        let sysPrompt = 'You are an elite prompt engineer and AI visual director. Expand the user concept into a rich, detailed photorealistic prompt with lighting, 8k resolution, camera details. Output ONLY the final expanded prompt in English, with no meta preamble.';
        if (taskType === 'anime_aesthetic') {
          sysPrompt = 'You are an elite prompt engineer. Expand the user concept into a stunning Japanese anime art prompt (Makoto Shinkai / Studio Ghibli aesthetic) with vibrant lighting and painterly sky. Output ONLY the final expanded prompt in English, with no meta preamble.';
        } else if (taskType === 'commercial_product') {
          sysPrompt = 'You are a master commercial product photographer. Expand the user concept into an immaculate commercial studio product photography prompt with softbox lighting, clean backdrop, and sharp micro textures. Output ONLY the final expanded prompt in English.';
        } else if (taskType === 'dark_fantasy') {
          sysPrompt = 'You are a dark fantasy concept artist. Expand the user concept into an epic dark fantasy concept art prompt (Unreal Engine 5) with dramatic volumetric lighting, gothic architecture, and mist. Output ONLY the final expanded prompt in English.';
        }

        const chatResult = await EngineRegistry.chat(
          reasoningProvider,
          {
            messages: [
              { role: 'system', content: sysPrompt },
              { role: 'user', content: llmNode.values.prompt || llmNode.values.input_text },
            ],
            model: reasoningModel,
            temperature: 0.6,
          },
          storedKeys
        );

        llmPrompt = chatResult.content;
        if (chatResult.content) {
          params.positivePrompt = chatResult.content;

          // Ensure LoRA trigger words from compatible LoRAs are NOT wiped out
          const missingTriggers: string[] = [];
          for (const lora of compatibleLoras) {
            const tw = (lora.triggerWords || '').trim();
            if (!tw) continue;
            const parts = tw.split(',').map((s) => s.trim()).filter(Boolean);
            const missingParts = parts.filter((p) => !params.positivePrompt.includes(p));
            if (missingParts.length > 0) {
              const toAdd = missingParts.join(', ');
              if (!missingTriggers.includes(toAdd)) {
                missingTriggers.push(toAdd);
              }
            }
          }

          if (missingTriggers.length > 0) {
            const prependStr = missingTriggers.join(', ');
            params.positivePrompt = `${prependStr}, ${params.positivePrompt}`.trim();
            const existingTokens = new Set(
              (params.prependedTriggerWords || '')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            );
            for (const t of missingTriggers) {
              for (const part of t.split(',').map((s) => s.trim()).filter(Boolean)) {
                existingTokens.add(part);
              }
            }
            params.prependedTriggerWords = Array.from(existingTokens).join(', ');
          } else if (params.prependedTriggerWords && !params.positivePrompt.includes(params.prependedTriggerWords)) {
            params.positivePrompt = `${params.prependedTriggerWords}, ${params.positivePrompt}`.trim();
          }

          onNodeStateChange(llmNode.id, 'success', 100, {
            refined_output: chatResult.content,
            reasoning_output: chatResult.reasoningContent || '',
          });
        }
      } catch (reasoningErr: any) {
        onNodeStateChange(llmNode.id, 'error', 0, undefined, reasoningErr.message);
        throw reasoningErr;
      }
    }

    const extraParams: Record<string, unknown> = {
      ...(params.sampler !== undefined ? { sampler_name: params.sampler } : {}),
      ...(params.scheduler !== undefined ? { scheduler: params.scheduler } : {}),
      ...(params.imageSize ? { image_size: params.imageSize } : {}),
    };
    if(params.customParameters) extraParams.custom_parameters=parseCustomParameters(params.customParameters);
    if (engProv === 'civitai') {
      for (const [key,value] of Object.entries({engine:params.civitaiEngine,ecosystem:params.civitaiEcosystem,comfyModel:params.civitaiModel,quantity:params.batchSize})) if (value !== undefined && value !== '') extraParams[key] = value;
    }
    if (params.size) extraParams.size = params.size;
    if (params.quality) extraParams.quality = params.quality;
    if (params.outputFormat) extraParams.output_format = params.outputFormat;
    if (params.targetProvider === 'sensenova') {
      if (typeof params.watermark === 'boolean') extraParams.watermark = params.watermark;
      if (typeof params.promptExtend === 'boolean') extraParams.prompt_extend = params.promptExtend;
    }
    if (params.background) extraParams.background = params.background;
    if (params.moderation) extraParams.moderation = params.moderation;
    if (params.resolution) {
      if (params.targetProvider === 'huggingface' && params.hfProvider !== 'z-image-space') {
        omissions.push({field: 'resolution', value: params.resolution, reason: `Hugging Face 该路由（hfProvider=${params.hfProvider || '未指定'}）未采用像素分辨率字段；保留原值不作为请求参数`});
      } else {
        extraParams.resolution = params.resolution;
      }
    }
    if (params.falModelName) extraParams.model_name=params.falModelName;
    if (params.targetProvider === 'huggingface') {
      if (params.hfProvider) extraParams.hf_provider = params.hfProvider;
      // resolution / shift / random_seed / gallery_images belong to the verified Z-Image Space contract only.
      // Keeping them on HF Inference or HF→fal-ai causes a local reject before the real provider is reached.
      if (params.hfProvider === 'z-image-space') {
        if (params.shift !== undefined) extraParams.shift = params.shift;
        if (params.randomSeed !== undefined) extraParams.random_seed = params.randomSeed;
        if (params.galleryImages !== undefined) extraParams.gallery_images = params.galleryImages;
      } else {
        if (params.shift !== undefined) omissions.push({ field: 'shift', value: params.shift, reason: '非 z-image-space 的 HF 路由不支持 shift 字段；保留原值不作为请求参数' });
        if (params.randomSeed !== undefined) omissions.push({ field: 'random_seed', value: params.randomSeed, reason: '非 z-image-space 的 HF 路由不支持 random_seed 字段；保留原值不作为请求参数' });
        if (params.galleryImages !== undefined) omissions.push({ field: 'gallery_images', value: params.galleryImages, reason: '非 z-image-space 的 HF 路由不支持 gallery_images 字段；保留原值不作为请求参数' });
      }
    }
    if (grokOrOpenAi && params.batchSize != null && Number(params.batchSize) > 0) {
      extraParams.n = Number(params.batchSize);
    }
    if (engProv === 'tensorart' && params.batchSize !== undefined) extraParams.count = params.batchSize;
    if (engProv === 'nanogpt' && params.batchSize !== undefined) extraParams.n=params.batchSize;
    if (engProv === 'fal' && params.batchSize !== undefined) extraParams.n=params.batchSize;
    if (grokish && params.videoFps !== undefined) {
      omissions.push({field: 'videoFps', value: params.videoFps, reason: 'Grok 兼容中转的视频契约没有 videoFps 字段；保留原值不作为请求参数'});
    }
    if (omissions.length) {
      extraParams.omissions = omissions;
      extraParams.parameterOmissions = omissions;
      onProgress?.(15, '已整理工作流参数：存在未提交字段', {omissions});
    }

    const lorasPayload = resolveGenerateLorasPayload(
      engProv,
      engModel,
      compatibleLoras.map((l) => ({
        name: l.name,
        path: explicitLoraPath(l),
        strength: l.modelStrength,
        modelStrength: l.modelStrength,
        clipStrength: l.clipStrength,
        civitaiId: l.civitaiId,
        triggers: l.triggerWords,
        baseModel: l.baseModel,
      })),
      params.checkpointBaseModel
    );

    const normParams: NormalizedGenerateParams = omitUnsupportedGenerateFields(engProv, engModel, {
      workflowSnapshot: {
        format: 'comfycanvas',
        version: 1,
        nodes: sanitizeExecutionSnapshotNodes(activeNodes),
        connections,
        executingNodeId: params.executingNodeId,
        requestMetadata: {
          promptTransform: {
            prependedTriggerWords: params.prependedTriggerWords,
            originalPrompt: params.originalPositivePrompt,
            llmPrompt,
            finalPrompt: params.positivePrompt,
          },
          ...(omissions.length ? {omissions, parameterOmissions: omissions} : {}),
        },
      },
      prompt: params.positivePrompt,
      negative_prompt: params.negativePrompt,
      model: params.checkpointModel,
      provider: params.videoProvider || (params.targetProvider === 'gemini' ? 'gemini' : undefined),
      targetProvider: params.videoProvider || (params.targetProvider === 'gemini' ? 'gemini' : undefined),
      width: params.width,
      height: params.height,
      steps: params.steps,
      cfg: params.cfg,
      seed: params.seed,
      denoise: params.denoise,
      image_url: params.initImageUrl,
      isVideo: params.isVideo,
      videoDuration: params.videoDuration,
      videoFps: grokish ? undefined : params.videoFps,
      videoFrames: params.videoFrames,
      aspectRatio: params.videoAspectRatio || params.aspectRatio,
      imageSize: params.imageSize,
      sampler_name: params.sampler,
      scheduler: params.scheduler,
      extraParams,
      loras: lorasPayload,
      parameterOmissions: omissions.length ? omissions : undefined,
    }) as NormalizedGenerateParams;

    // Stage 4: KSampler / Video Generation
    ksamplerNodes.forEach((n) => onNodeStateChange(n.id, 'running', 50));
    onProgress?.(50, `[4/5] 正在向 ${params.targetProvider.toUpperCase()} 官方算力提交任务并等待渲染回传...`);

    const startTime = Date.now();
    stepInterval = setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
      onProgress?.(
        65,
        `[4/5] ${params.targetProvider.toUpperCase()} 请求进行中 (已耗时 ${elapsedSec}s，等待上游确认状态)...`
      );
    }, 1000);

    const execResult = await EngineRegistry.generate(
      params.targetProvider,
      normParams,
      storedKeys
    );

    if (stepInterval) clearInterval(stepInterval);

    resultMedia = execResult.mediaUrl;
    usedProvider = execResult.provider;
    usedModel = execResult.model;

    // Stage 5: VAE Decode and Final Save
    ksamplerNodes.forEach((n) => onNodeStateChange(n.id, 'success', 100));
    if (vaeNodes.length > 0) {
      onProgress?.(92, `[5/5] 已收到上游图片；整理输出...`);
      vaeNodes.forEach((n) => onNodeStateChange(n.id, 'idle', 0));
    }

    saveNodes.forEach((n) => onNodeStateChange(n.id, 'success', 100, resultMedia));
    onProgress?.(100, `工作流生成完成 (${usedProvider})`);

    return {
      imageUrl: resultMedia,
      provider: usedProvider,
      model: usedModel,
      seed: execResult.seed ?? null,
      executingNodeId: params.executingNodeId,
      historyWarning: execResult.historyWarning,
      isVideo,
    };
  } catch (error: any) {
    if (stepInterval) clearInterval(stepInterval);
    onProgress?.(0, `执行失败: ${error.message}`);
    const msg = error?.message || '执行遇到错误';
    if (targetErrorNodeId) outputIds.add(targetErrorNodeId);
    for(const id of outputIds)onNodeStateChange(id,id===targetErrorNodeId?'error':'idle',0,undefined,id===targetErrorNodeId?'请求失败，查看执行记录':'');
    throw error;
  }
}