import { Connection, DataType, NodeInstance, Socket } from '../types/graph';
import { ApiKeysState } from '../types/providers';
import { resolveLoraPathOrUrl } from './engineParameterNormalizer';
import { getStoredApiKeys, saveToHistory } from '../services/api';
import { EngineRegistry } from '../engines/EngineRegistry';
import { NormalizedGenerateParams } from '../engines/types';
import {
  findSoleCloudEngine,
  isCloudEngineNode,
  omitUnsupportedGenerateFields,
  resolveGenerateLorasPayload,
} from './resolveCheckpoint';
import { assertAIVideoProviderReady } from './videoProvider';

const MEDIA_OUTPUT_NODE_TYPES = new Set([
  'KSampler','AIVideoNode','FalAIEngineNode','GoogleImagenNode','ModelScopeNode','ModelScopeAiNode','NanoGPTNode','VAEDecode','SaveImage','SaveVideo','PreviewImage',
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
  positivePrompt: string;
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
    modelStrength: number;
    clipStrength: number;
    triggerWords: string;
    civitaiId?: string;
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
  background?: string;
  moderation?: string;
  resolution?: string;
  shift?: number;
  randomSeed?: boolean;
  galleryImages?: unknown[];
  customParameters?: string;
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
          modelStrength: Number(n.values.strength_model ?? 0.8),
          clipStrength: Number(n.values.strength_clip ?? 0.8),
          triggerWords: n.values.trigger_words || '',
          civitaiId: n.values.civitai_id || '',
        });
      }
      const inConn = connections.find((c) => c.toNodeId === n.id && c.toSocketId === 'model');
      currId = inConn?.fromNodeId;
    } else if (n.type === 'CivitaiLoRABrowserNode') {
      if (n.values.selected_model_name) {
        loras.push({
          name: n.values.selected_model_name,
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
          modelStrength: Number(n.values.strength_model ?? 0.8),
          clipStrength: Number(n.values.strength_clip ?? 0.8),
          triggerWords: n.values.trigger_words || '',
          civitaiId: n.values.civitai_id || '',
        });
      }
      const inConn = connections.find((c) => c.toNodeId === n.id && c.toSocketId === 'model');
      currId = inConn?.fromNodeId;
    } else if (n.type === 'CivitaiLoRABrowserNode') {
      if (n.values.selected_model_name) {
        loras.push({
          name: n.values.selected_model_name,
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
      execNode = downstreamGen;
      subgraphNodeIds.add(downstreamGen.id);
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

  // 3. Node-specific parameter extraction
  let checkpointModel = '';
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
    if (!checkpointModel) {
      throw new Error('请先选择模型');
    }
    // F4: reject empty / schema-mismatched provider — never fall back to Fal
    videoProvider = assertAIVideoProviderReady(checkpointModel, videoProvider);
    videoFrames=numOrUndef(execNode.values.num_frames);
    // Grok 兼容中转：duration 仅透传，不编造 5；其它商沿用节点默认
    if (videoProvider === 'grok_compat') {
      videoDuration = execNode.values.duration != null && execNode.values.duration !== ''
        ? Number(execNode.values.duration)
        : undefined;
      videoFps = undefined;
      videoAspectRatio = execNode.values.aspect_ratio || undefined;
      resolution = execNode.values.resolution || undefined;
    } else {
      const falWan=videoProvider==='fal' && /wan-t2v|wan-i2v|wan\/v2\.1/.test(checkpointModel);
      videoDuration = falWan ? undefined : numOrUndef(execNode.values.duration);
      videoFps = numOrUndef(execNode.values.fps);
      videoAspectRatio = execNode.values.aspect_ratio || undefined;
    }
  } else if (execNode.type === 'FalAIEngineNode') {
    isVideo = false;
    targetProvider = 'fal';
    checkpointModel = (execNode.values.model || '').trim();
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
  } else if (execNode.type === 'GoogleImagenNode') {
    isVideo = false;
    targetProvider = 'gemini';
    checkpointModel = (execNode.values.model || '').trim();
    if (!checkpointModel) {
      throw new Error('请先选择模型');
    }
    aspectRatio = execNode.values.aspect_ratio || undefined;
    imageSize = execNode.values.image_size || undefined;
  } else if (execNode.type === 'ModelScopeNode' || execNode.type === 'ModelScopeAiNode') {
    isVideo = false;
    targetProvider = execNode.type === 'ModelScopeAiNode' ? 'modelscope_ai' : 'modelscope';
    checkpointModel = (execNode.values.model_endpoint || execNode.values.model || '').trim();
    if (!checkpointModel) {
      throw new Error('请先选择模型');
    }
  } else if (execNode.type === 'NanoGPTNode') {
    isVideo = false;
    targetProvider = 'nanogpt';
    checkpointModel = (execNode.values.model || '').trim();
    if (!checkpointModel) {
      throw new Error('请先选择模型');
    }
  } else if (execNode.type === 'CheckpointLoaderSimple') {
    isVideo = false;
    checkpointModel = (execNode.values.ckpt_name || '').trim();
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
      batchSize = Number(execNode.values.n ?? execNode.values.batch_size ?? execNode.values.batchSize) || 1;
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
    checkpointModel = (ckpt.values.ckpt_name || '').trim();
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
      batchSize = Number(ckpt.values.n ?? ckpt.values.batch_size ?? ckpt.values.batchSize) || batchSize;
    }

    const latentConn = connections.find((c) => c.toNodeId === execNode.id && c.toSocketId === 'latent_image');
    if (latentConn) {
      const src = nodeMap.get(latentConn.fromNodeId);
      if (src && !src.bypassed && src.type === 'EmptyLatentImage') {
        subgraphNodeIds.add(src.id);
        width = numOrUndef(src.values.width);
        height = numOrUndef(src.values.height);
        batchSize = Number(src.values.batch_size) || 1;
      }
    }
  } else {
    checkpointModel = (execNode.values.model || execNode.values.ckpt_name || '').trim();
    if (!checkpointModel) {
      throw new Error('请先选择模型');
    }
    targetProvider = (execNode.values.targetProvider || '').trim();
    if (!targetProvider) throw new Error('请选择执行服务商；不会从模型名称猜测引擎');
  }

  // 4. Validate mandatory positive prompt (L2b: NO fallback to hardcoded string!)
  if (!positivePrompt || !positivePrompt.trim()) {
    throw new Error('请填写提示词');
  }

  // Append LoRA triggers if needed
  const triggerWordsAll = loras
    .map((l) => l.triggerWords)
    .filter(Boolean)
    .join(', ');

  let finalPositive = positivePrompt;
  if (triggerWordsAll && !finalPositive.includes(triggerWordsAll)) {
    finalPositive = `${triggerWordsAll}, ${finalPositive}`.trim();
  }

  return {
    checkpointModel,
    positivePrompt: finalPositive,
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
  onProgress?: (percent: number, statusText: string) => void,
  targetNodeOrId?: NodeInstance | string
): Promise<{ imageUrl: string; provider: string; model: string; seed: number | null; isVideo?: boolean; executingNodeId?: string; historyWarning?: string }> {
  let stepInterval: any = null;
  let executingIds = new Set<string>();
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
        n.type === 'NanoGPTNode'
    );
    const vaeNodes = activeNodes.filter((n) => n.type === 'VAEDecode');
    const saveNodes = activeNodes.filter(
      (n) =>
        n.type === 'SaveImage' ||
        n.type === 'SaveVideo' ||
        n.type === 'PreviewImage' ||
        n.id === params.executingNodeId
    );

    onProgress?.(15, `已整理工作流参数：${params.targetProvider} / ${params.checkpointModel}；${params.loras.length} 个 LoRA 请求参数，尚未提交上游`);
    // Reset prior media outputs on the branch before a new request so stale previews cannot survive a failed rerun.
    [...ckptNodes,...clipNodes,...loraNodes,...latentNodes,...saveNodes].forEach(n=>onNodeStateChange(n.id,'idle',0,undefined,''));

    let resultMedia = '';
    let usedProvider: string = params.targetProvider;
    let usedModel = params.checkpointModel;
    const isVideo = Boolean(params.isVideo);

    const storedKeys = getStoredApiKeys() as unknown as Record<string, string>;

    // 0. 前置大模型深度推理思考阶段 (LLM Reasoning Pre-Execution Pipeline)
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

        if (chatResult.content) {
          params.positivePrompt = chatResult.content;
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

    const engProv = params.videoProvider || params.targetProvider;
    const engModel = params.checkpointModel;
    const grokish = params.targetProvider === 'grok_compat' || params.videoProvider === 'grok_compat';
    const grokOrOpenAi = params.targetProvider === 'openai_compat' || params.targetProvider === 'grok_compat' || params.videoProvider === 'grok_compat';
    const extraParams: Record<string, unknown> = {
      ...(params.sampler !== undefined ? { sampler_name: params.sampler } : {}),
      ...(params.scheduler !== undefined ? { scheduler: params.scheduler } : {}),
      ...(params.imageSize ? { image_size: params.imageSize } : {}),
    };
    if(params.customParameters) extraParams.custom_parameters=JSON.parse(params.customParameters);
    if (params.size) extraParams.size = params.size;
    if (params.quality) extraParams.quality = params.quality;
    if (params.outputFormat) extraParams.output_format = params.outputFormat;
    if (params.background) extraParams.background = params.background;
    if (params.moderation) extraParams.moderation = params.moderation;
    if (params.resolution) extraParams.resolution = params.resolution;
    if (params.falModelName) extraParams.model_name=params.falModelName;
    if (params.targetProvider === 'huggingface') {
      if (params.hfProvider) extraParams.hf_provider = params.hfProvider;
      if (params.shift !== undefined) extraParams.shift = params.shift;
      if (params.randomSeed !== undefined) extraParams.random_seed = params.randomSeed;
      if (params.galleryImages !== undefined) extraParams.gallery_images = params.galleryImages;
    }
    if (grokOrOpenAi && params.batchSize != null && Number(params.batchSize) > 0) {
      extraParams.n = Number(params.batchSize);
    }
    if (engProv === 'tensorart' && params.batchSize !== undefined) extraParams.count = params.batchSize;
    if (engProv === 'nanogpt' && params.batchSize !== undefined) extraParams.n=params.batchSize;
    if (engProv === 'fal' && params.batchSize !== undefined) extraParams.n=params.batchSize;

    const lorasPayload = resolveGenerateLorasPayload(
      engProv,
      engModel,
      params.loras.map((l) => ({
        name: l.name,
        path: resolveLoraPathOrUrl(l),
        strength: l.modelStrength,
        modelStrength: l.modelStrength,
        clipStrength: l.clipStrength,
        civitaiId: l.civitaiId,
        triggers: l.triggerWords,
      })),
    );

    const normParams: NormalizedGenerateParams = omitUnsupportedGenerateFields(engProv, engModel, {
      workflowSnapshot: { format: 'comfycanvas', version: 1, nodes: sanitizeExecutionSnapshotNodes(activeNodes), connections, executingNodeId: params.executingNodeId },
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
    if (targetErrorNodeId) executingIds.add(targetErrorNodeId);
    for(const id of executingIds)onNodeStateChange(id,id===targetErrorNodeId?'error':'idle',0,undefined,id===targetErrorNodeId?'请求失败，查看执行记录':'');
    throw error;
  }
}
