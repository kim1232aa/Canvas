import { Connection, NodeInstance } from '../types/graph';
import { getFieldSpec, Provider } from '../schemas/providerSchema';

/** Engine / loader node types that carry an explicit model id. */
export const ENGINE_NODE_TYPES = [
  'FalAIEngineNode',
  'GoogleImagenNode',
  'AIVideoNode',
  'ModelScopeNode',
  'ModelScopeAiNode',
  'NanoGPTNode',
  'CheckpointLoaderSimple',
  'KSampler',
] as const;

export type EngineNodeType = (typeof ENGINE_NODE_TYPES)[number];

/** Cloud engines — never a zombie CheckpointLoaderSimple / KSampler. */
export const CLOUD_ENGINE_NODE_TYPES = [
  'FalAIEngineNode',
  'GoogleImagenNode',
  'AIVideoNode',
  'ModelScopeNode',
  'ModelScopeAiNode',
  'NanoGPTNode',
] as const;

export function isCloudEngineNode(node: NodeInstance | null | undefined): boolean {
  return !!node && (CLOUD_ENGINE_NODE_TYPES as readonly string[]).includes(node.type);
}

export function findSoleCloudEngine(nodes: NodeInstance[]): NodeInstance | undefined {
  const engines = nodes.filter((n) => !n.bypassed && isCloudEngineNode(n));
  return engines.length === 1 ? engines[0] : undefined;
}

/** True for Fal/endpoint LoRA errors — not Hugging Face「该服务商不支持: loras」. */
export function isFalLoraEndpointError(msg: string | null | undefined): boolean {
  if (!msg) return false;
  if (/该服务商不支持/i.test(msg) && /Hugging\s*Face/i.test(msg)) return false;
  if (/该端点不支持 LoRA/.test(msg)) return true;
  if (/该服务商不支持/.test(msg) && /loras|LoRA/i.test(msg) && !/Hugging\s*Face/i.test(msg)) return true;
  if (/HTTP\s+\d+/.test(msg) && /Fal/i.test(msg)) return true;
  return false;
}

/** Extract the model/checkpoint string from a single node (no canvas-wide search). */
export function getModelFromNode(node: NodeInstance | null | undefined): string {
  if (!node || node.bypassed) return '';
  const v = node.values || {};
  switch (node.type) {
    case 'CheckpointLoaderSimple':
      return String(v.ckpt_name || '').trim();
    case 'FalAIEngineNode':
    case 'GoogleImagenNode':
    case 'AIVideoNode':
    case 'NanoGPTNode':
      return String(v.model || '').trim();
    case 'ModelScopeNode':
    case 'ModelScopeAiNode':
      return String(v.model_endpoint || v.model || '').trim();
    default:
      return String(v.model || v.ckpt_name || '').trim();
  }
}

/** Provider hint from a node (explicit targetProvider / provider, or deduced from model id). */
export function getProviderFromNode(node: NodeInstance | null | undefined): string {
  if (!node || node.bypassed) return '';
  const explicit = String(node.values?.targetProvider || node.values?.provider || '').trim();
  if (explicit) return explicit;
  const model = getModelFromNode(node);
  if (model.startsWith('fal-ai/') || node.type === 'FalAIEngineNode') return 'fal';
  if (node.type === 'GoogleImagenNode' || model.includes('gemini')) return 'gemini';
  if (node.type === 'AIVideoNode') return 'video';
  if (node.type === 'ModelScopeAiNode') return 'modelscope_ai';
  if (node.type === 'ModelScopeNode') return 'modelscope';
  if (node.type === 'NanoGPTNode') return 'nanogpt';
  return '';
}

/**
 * Resolve the checkpoint/model that should drive LoRA compatibility for a specific node.
 * For LoRALoader: walk upstream (model socket) and downstream edges to the connected engine.
 * Never invents Tongyi-MAI/Z-Image-Turbo.
 */
export function resolveCheckpointForNode(
  nodeId: string,
  nodes: NodeInstance[],
  connections: Connection[]
): { checkpoint: string; provider: string; engineNodeId?: string } {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const self = nodeMap.get(nodeId);
  if (!self) return { checkpoint: '', provider: '' };

  // If the node itself is an engine/loader, use its own model.
  if (
    self.type === 'FalAIEngineNode' ||
    self.type === 'GoogleImagenNode' ||
    self.type === 'AIVideoNode' ||
    self.type === 'ModelScopeNode' ||
    self.type === 'ModelScopeAiNode' ||
    self.type === 'NanoGPTNode' ||
    self.type === 'CheckpointLoaderSimple'
  ) {
    return {
      checkpoint: getModelFromNode(self),
      provider: getProviderFromNode(self),
      engineNodeId: self.id,
    };
  }

  // LoRALoader / Civitai browser: prefer connected engine (downstream), then upstream checkpoint.
  if (
    self.type === 'LoRALoader' ||
    self.type === 'LoraLoader' ||
    self.type === 'LoraLoaderModelOnly' ||
    self.type === 'CivitaiLoRABrowserNode'
  ) {
    // Downstream: LoRA → FalAIEngineNode (lora socket) or → KSampler (model socket)
    const outConns = connections.filter((c) => c.fromNodeId === nodeId);
    for (const c of outConns) {
      const dest = nodeMap.get(c.toNodeId);
      if (!dest || dest.bypassed) continue;
      if (isCloudEngineNode(dest)) {
        return {
          checkpoint: getModelFromNode(dest),
          provider: getProviderFromNode(dest),
          engineNodeId: dest.id,
        };
      }
    }

    // Sole cloud engine on canvas wins over an unconnected / zombie Checkpoint+KSampler.
    const sole = findSoleCloudEngine(nodes);
    if (sole) {
      return {
        checkpoint: getModelFromNode(sole),
        provider: getProviderFromNode(sole),
        engineNodeId: sole.id,
      };
    }

    for (const c of outConns) {
      const dest = nodeMap.get(c.toNodeId);
      if (!dest || dest.bypassed) continue;
      if (dest.type === 'KSampler') {
        // Walk upstream of KSampler for CheckpointLoaderSimple
        const modelIn = connections.find((x) => x.toNodeId === dest.id && x.toSocketId === 'model');
        if (modelIn) {
          const upstream = walkToCheckpoint(modelIn.fromNodeId, nodeMap, connections, new Set());
          if (upstream) {
            return {
              checkpoint: getModelFromNode(upstream),
              provider: getProviderFromNode(upstream),
              engineNodeId: dest.id,
            };
          }
        }
      }
    }

    // Upstream: CheckpointLoaderSimple → LoRA (model socket)
    const inConn = connections.find((c) => c.toNodeId === nodeId && c.toSocketId === 'model');
    if (inConn) {
      const upstream = walkToCheckpoint(inConn.fromNodeId, nodeMap, connections, new Set());
      if (upstream) {
        return {
          checkpoint: getModelFromNode(upstream),
          provider: getProviderFromNode(upstream),
          engineNodeId: upstream.id,
        };
      }
    }
  }

  // KSampler / EmptyLatent / CLIP*: resolve via upstream model edge, then sole cloud engine / CheckpointLoader.
  // Needed so canvas NodeItem can grey seed / negative / width / height like ParameterInspector.
  if (
    self.type === 'KSampler' ||
    self.type === 'EmptyLatentImage' ||
    self.type === 'CLIPTextEncode' ||
    self.type === 'CLIPTextEncodeNegative'
  ) {
    if (self.type === 'KSampler') {
      const modelIn = connections.find((x) => x.toNodeId === self.id && x.toSocketId === 'model');
      if (modelIn) {
        const upstream = walkToCheckpoint(modelIn.fromNodeId, nodeMap, connections, new Set());
        if (upstream) {
          return {
            checkpoint: getModelFromNode(upstream),
            provider: getProviderFromNode(upstream),
            engineNodeId: upstream.id,
          };
        }
      }
    }

    const sole = findSoleCloudEngine(nodes);
    if (sole) {
      return {
        checkpoint: getModelFromNode(sole),
        provider: getProviderFromNode(sole),
        engineNodeId: sole.id,
      };
    }

    const ckpts = nodes.filter((n) => !n.bypassed && n.type === 'CheckpointLoaderSimple');
    if (ckpts.length === 1) {
      return {
        checkpoint: getModelFromNode(ckpts[0]),
        provider: getProviderFromNode(ckpts[0]),
        engineNodeId: ckpts[0].id,
      };
    }
  }

  return { checkpoint: '', provider: '' };
}

function walkToCheckpoint(
  startId: string,
  nodeMap: Map<string, NodeInstance>,
  connections: Connection[],
  visited: Set<string>
): NodeInstance | undefined {
  let currId: string | undefined = startId;
  while (currId && !visited.has(currId)) {
    visited.add(currId);
    const n = nodeMap.get(currId);
    if (!n || n.bypassed) return undefined;
    if (n.type === 'CheckpointLoaderSimple') return n;
    if (
      n.type === 'FalAIEngineNode' ||
      n.type === 'GoogleImagenNode' ||
      n.type === 'AIVideoNode' ||
      n.type === 'ModelScopeNode' ||
      n.type === 'ModelScopeAiNode' ||
      n.type === 'NanoGPTNode'
    ) {
      return n;
    }
    if (
      n.type === 'LoRALoader' ||
      n.type === 'LoraLoader' ||
      n.type === 'LoraLoaderModelOnly' ||
      n.type === 'CivitaiLoRABrowserNode'
    ) {
      const inConn = connections.find((c) => c.toNodeId === n.id && c.toSocketId === 'model');
      currId = inConn?.fromNodeId;
      continue;
    }
    return undefined;
  }
  return undefined;
}

/**
 * Resolve the checkpoint for the parameter inspector / active selection.
 * Priority: selected engine node → sole engine on canvas → connected engine of selected LoRA →
 * selected frame params → empty string. Never invents Z-Image-Turbo.
 */
export function resolveActiveCheckpoint(
  nodes: NodeInstance[],
  connections: Connection[],
  selectedNodeId: string | null | undefined,
  frameCheckpoint?: string,
  frameProvider?: string
): { checkpoint: string; provider: string; engineNodeId?: string } {
  const active = nodes.filter((n) => !n.bypassed);

  // 1. Selected node
  if (selectedNodeId) {
    const selected = active.find((n) => n.id === selectedNodeId);
    if (selected) {
      if (
        selected.type === 'FalAIEngineNode' ||
        selected.type === 'GoogleImagenNode' ||
        selected.type === 'AIVideoNode' ||
        selected.type === 'ModelScopeNode' ||
        selected.type === 'ModelScopeAiNode' ||
        selected.type === 'NanoGPTNode' ||
        selected.type === 'CheckpointLoaderSimple'
      ) {
        return {
          checkpoint: getModelFromNode(selected),
          provider: getProviderFromNode(selected) || frameProvider || '',
          engineNodeId: selected.id,
        };
      }
      const fromEdges = resolveCheckpointForNode(selected.id, nodes, connections);
      if (fromEdges.checkpoint) return fromEdges;
    }
  }

  // 2. Sole engine node on canvas (Fal / Gemini / Video / …)
  const engines = active.filter(
    (n) =>
      n.type === 'FalAIEngineNode' ||
      n.type === 'GoogleImagenNode' ||
      n.type === 'AIVideoNode' ||
      n.type === 'ModelScopeNode' ||
      n.type === 'ModelScopeAiNode' ||
      n.type === 'NanoGPTNode'
  );
  if (engines.length === 1) {
    return {
      checkpoint: getModelFromNode(engines[0]),
      provider: getProviderFromNode(engines[0]) || frameProvider || '',
      engineNodeId: engines[0].id,
    };
  }
  if (engines.length > 1 && selectedNodeId) {
    const hit = engines.find((n) => n.id === selectedNodeId);
    if (hit) {
      return {
        checkpoint: getModelFromNode(hit),
        provider: getProviderFromNode(hit) || frameProvider || '',
        engineNodeId: hit.id,
      };
    }
  }

  // 3. Sole CheckpointLoaderSimple (only when no cloud engine nodes)
  if (engines.length === 0) {
    const ckpts = active.filter((n) => n.type === 'CheckpointLoaderSimple');
    if (ckpts.length === 1) {
      return {
        checkpoint: getModelFromNode(ckpts[0]),
        provider: getProviderFromNode(ckpts[0]) || frameProvider || '',
        engineNodeId: ckpts[0].id,
      };
    }
  }

  // 4. Frame params (spatial mode) — may be empty
  if (frameCheckpoint) {
    return { checkpoint: frameCheckpoint, provider: frameProvider || '' };
  }

  return { checkpoint: '', provider: frameProvider || '' };
}

/**
 * True when the current endpoint's official schema marks loras as unsupported.
 * Uses providerSchema only — never an unrelated canvas checkpoint.
 */
export function isLoraUnsupportedOnEndpoint(
  provider: string | undefined,
  model: string | undefined
): { unsupported: boolean; message?: string } {
  const modelId = (model || '').trim();
  if (!modelId) return { unsupported: false };

  let prov = (provider || '').toLowerCase().trim();
  if (!prov && modelId.startsWith('fal-ai/')) prov = 'fal';
  if (prov === 'video' && modelId.startsWith('fal-ai/')) prov = 'fal';

  const schemaProv: Provider | undefined =
    prov === 'fal' || prov === 'gemini' || prov === 'civitai' || prov === 'openai_compat' || prov === 'grok_compat'
      ? (prov as Provider)
      : undefined;
  if (!schemaProv) return { unsupported: false };

  const spec = getFieldSpec(schemaProv, modelId, 'loras');
  if (spec?.status === 'unsupported') {
    return {
      unsupported: true,
      message: `该服务商不支持（${schemaProv} / ${modelId} 的官方 schema 无 loras 字段）`,
    };
  }
  return { unsupported: false };
}

/** Find first non-bypassed node of a given type (for hub/selection helpers — not LoRA compat). */
export function findFirstNodeOfType(
  nodes: NodeInstance[],
  type: string,
  opts?: { includeBypassed?: boolean }
): NodeInstance | undefined {
  return nodes.find((n) => n.type === type && (opts?.includeBypassed || !n.bypassed));
}

/**
 * Schema-driven: true when provider+model marks field unsupported.
 * openai_compat / grok_compat always grey seed/negative/width/height (match ParameterInspector).
 */
export function isCanvasFieldUnsupported(
  provider: string | undefined,
  model: string | undefined,
  field: 'seed' | 'negative_prompt' | 'width' | 'height' | 'steps' | 'cfg' | 'sampler' | 'scheduler' | 'loras'
): boolean {
  const prov = (provider || '').trim();
  const isOpenAiCompat = prov === 'openai_compat';
  const isGrokCompat = prov === 'grok_compat';
  if (
    (isOpenAiCompat || isGrokCompat) &&
    (field === 'seed' || field === 'negative_prompt' || field === 'width' || field === 'height' ||
      field === 'steps' || field === 'cfg' || field === 'sampler' || field === 'scheduler' || field === 'loras')
  ) {
    return true;
  }
  if (prov === 'gemini' && (field === 'width' || field === 'height' || field === 'negative_prompt' || field === 'steps' || field === 'cfg' || field === 'loras')) {
    return true;
  }
  const schemaProv: Provider | undefined =
    prov === 'fal' || prov === 'gemini' || prov === 'civitai' || prov === 'openai_compat' || prov === 'grok_compat'
      ? (prov as Provider)
      : undefined;
  const schemaModel =
    (model || '').trim() ||
    (isOpenAiCompat ? 'gpt-image-2' : isGrokCompat ? 'grok-imagine-image' : '');
  if (!schemaProv || !schemaModel) return false;
  return getFieldSpec(schemaProv, schemaModel, field)?.status === 'unsupported';
}
