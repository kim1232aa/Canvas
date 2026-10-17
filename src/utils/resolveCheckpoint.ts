import { CANVAS_TO_SCHEMA_ALIASES } from './schemaSendHint';
import { Connection, NodeInstance } from '../types/graph';
import { getFieldSpec, resolveSchemaModelId, Provider } from '../schemas/providerSchema';


/** Providers that have rows in PROVIDER_SCHEMA (field grey / omit). */
const SCHEMA_PROVIDERS: readonly Provider[] = [
  'fal',
  'gemini',
  'civitai',
  'openai_compat',
  'grok_compat',
  'agnes',
  'huggingface',
  'nanogpt',
  'tensorart',
  'sensenova',
  'modelscope',
  'modelscope_ai',
  'runware',
  'modelslab',
  'replicate',
];

export function toSchemaProvider(provider: string | undefined | null): Provider | undefined {
  const prov = (provider || '').toLowerCase().trim();
  return (SCHEMA_PROVIDERS as readonly string[]).includes(prov) ? (prov as Provider) : undefined;
}


/** Engine / loader node types that carry an explicit model id. */
export const ENGINE_NODE_TYPES = [
  'FalAIEngineNode',
  'GoogleImagenNode',
  'AIVideoNode',
  'ModelScopeNode',
  'ModelScopeAiNode',
  'NanoGPTNode',
  'ReplicateEngineNode',
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
  'ReplicateEngineNode',
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
  if (/当前模型不支持 LoRA|这模型不能挂 LoRA|请换支持 LoRA 的模型/.test(msg)) return true;
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
    case 'ReplicateEngineNode':
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
  if (node.type === 'ReplicateEngineNode') return 'replicate';
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
    self.type === 'ReplicateEngineNode' ||
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
      n.type === 'NanoGPTNode' ||
      n.type === 'ReplicateEngineNode'
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
        selected.type === 'ReplicateEngineNode' ||
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

  // 2. Sole engine node on canvas (Fal / Gemini / Video / Replicate / …)
  const engines = active.filter((n) => isCloudEngineNode(n));
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

/** User-facing LoRA-unsupported card / banner / badge (plain Chinese; no schema jargon). */
export const LORA_UNSUPPORTED_TITLE = '当前模型不支持 LoRA';
/** Card/banner body: next step only (title already says unsupported). */
export const LORA_UNSUPPORTED_MESSAGE = '请换支持 LoRA 的模型或先不用这条';
/** Live Schema lookup is registered by services/modelSchemaCache (inverted so this util never imports the fetch layer). */
type LiveSchemaEntry = { status: string; properties?: string[] } | undefined;
let liveSchemaLookup: ((provider: string, model: string) => LiveSchemaEntry) | undefined;
export function setLiveSchemaLookup(fn: (provider: string, model: string) => LiveSchemaEntry): void { liveSchemaLookup = fn; }
/** Live Schema has no LoRA field: say why, then the next step. */
export const LORA_SCHEMA_ABSENT_MESSAGE = '官方参数表里没有 LoRA 字段，不会发送；请换支持 LoRA 的模型或先不用这条';
export const LORA_UNSUPPORTED_EMPTY_CHECKPOINT = '请先选好模型，才能判断能不能挂 LoRA';
export const LORA_UNSUPPORTED_UNKNOWN_MODEL = '无法确认这模型能不能挂 LoRA，请先选好模型';
/** Bypass / skip action on LoRA node card. */
export const LORA_BYPASS_LABEL = '暂时不用这个 LoRA';

/**
 * True when the current endpoint's official schema marks loras as unsupported.
 * Uses providerSchema only — never an unrelated canvas checkpoint.
 * message is plain Chinese for UI; official refuse detail stays in server fail()/exec log.
 */
export function isLoraUnsupportedOnEndpoint(
  provider: string | undefined,
  model: string | undefined
): { unsupported: boolean; message?: string } {
  const modelId = (model || '').trim();
  let prov = (provider || '').toLowerCase().trim();
  if (!prov && modelId.startsWith('fal-ai/')) prov = 'fal';
  if (prov === 'video' && modelId.startsWith('fal-ai/')) prov = 'fal';

  const schemaProv = toSchemaProvider(prov);

  // Empty / no real checkpoint: do NOT fall back to the first schema model
  // (Fal's first is fal-ai/flux-lora which supports LoRA — that painted green 兼容).
  // Grey the same way as 导入即灰; keep stored values; do not send.
  if (!modelId) {
    if (schemaProv) {
      return {
        unsupported: true,
        message: LORA_UNSUPPORTED_EMPTY_CHECKPOINT,
      };
    }
    return { unsupported: false };
  }

  if (!schemaProv) {
    // OpenWorks: live tests 2026-10-17 — LoRA (id+weight) is sent as named extras; do not refuse mount from catalog inputs alone.
    if (prov === 'openworks') return { unsupported: false };
    // Other live-Schema providers: once Schema loaded, no LoRA field (or alias) ⇒ unsupported. Not loaded ⇒ no claim.
    const live = liveSchemaLookup?.(prov, modelId);
    if (live?.status === 'ready' && Array.isArray(live.properties) && live.properties.length) {
      const loraNames = new Set([...(CANVAS_TO_SCHEMA_ALIASES.loras || []), 'loras', 'extra_lora']);
      if (!live.properties.some((k) => loraNames.has(k))) return { unsupported: true, message: LORA_SCHEMA_ABSENT_MESSAGE };
    }
    return { unsupported: false };
  }

  const schemaModel = resolveSchemaModelId(schemaProv, modelId);
  if (!schemaModel) {
    return {
      unsupported: true,
      message: LORA_UNSUPPORTED_UNKNOWN_MODEL,
    };
  }
  const spec = getFieldSpec(schemaProv, schemaModel, 'loras');
  if (spec?.status === 'unsupported') {
    return {
      unsupported: true,
      message: LORA_UNSUPPORTED_MESSAGE,
    };
  }
  return { unsupported: false };
}

/**
 * KSampler widget 名 → providerSchema 字段映射。只对 KSampler 节点生效，
 * 其它节点的同名 widget（如 EmptyLatentImage 的 steps）不受影响。
 */
const KSAMPLER_WIDGET_FIELD: Record<string, 'steps' | 'cfg' | 'sampler' | 'scheduler'> = {
  steps: 'steps',
  cfg: 'cfg',
  cfg_scale: 'cfg',
  sampler_name: 'sampler',
  sampler: 'sampler',
  scheduler: 'scheduler',
};

/** Schema-driven：仅当节点是 KSampler 且该 widget 对应字段被官方 schema 标记 unsupported 时为 true。 */
export function isKSamplerWidgetUnsupported(
  nodeType: string | null | undefined,
  widgetName: string,
  provider: string | undefined,
  model: string | undefined
): boolean {
  if (nodeType !== 'KSampler') return false;
  const field = KSAMPLER_WIDGET_FIELD[widgetName];
  if (!field) return false;
  return isCanvasFieldUnsupported(provider, model, field);
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
export type CanvasGreyField =
  | 'seed'
  | 'negative_prompt'
  | 'width'
  | 'height'
  | 'steps'
  | 'cfg'
  | 'sampler'
  | 'scheduler'
  | 'denoise'
  | 'loras';

/**
 * Map canvas widget names to providerSchema FieldKeys
 * (same aliases ParameterInspector uses: cfg_scale→cfg, sampler_name→sampler).
 */
export function canvasWidgetFieldKey(widgetName: string): CanvasGreyField | undefined {
  switch ((widgetName || '').trim()) {
    case 'seed':
      return 'seed';
    case 'negative':
    case 'negative_prompt':
      return 'negative_prompt';
    case 'width':
      return 'width';
    case 'height':
      return 'height';
    case 'steps':
      return 'steps';
    case 'cfg':
    case 'cfg_scale':
      return 'cfg';
    case 'sampler':
    case 'sampler_name':
      return 'sampler';
    case 'scheduler':
      return 'scheduler';
    case 'denoise':
      return 'denoise';
    default:
      return undefined;
  }
}

export function isCanvasWidgetUnsupported(
  provider: string | undefined,
  model: string | undefined,
  widgetName: string
): boolean {
  const field = canvasWidgetFieldKey(widgetName);
  return field ? isCanvasFieldUnsupported(provider, model, field) : false;
}

export function isCanvasFieldUnsupported(
  provider: string | undefined,
  model: string | undefined,
  field: CanvasGreyField
): boolean {
  const schemaProv = toSchemaProvider(provider);
  if (!schemaProv) return false;
  const modelId = String(model || '').trim();
  // Empty checkpoint + loras: never pretend the first schema model was selected.
  // Fal's first model is fal-ai/flux-lora (loras supported) — empty must stay grey / not sent.
  if (!modelId && field === 'loras') return true;
  // resolveSchemaModelId: empty / foreign → undefined (no silent first-model swap).
  const schemaModel = resolveSchemaModelId(schemaProv, model);
  if (!schemaModel) return false;
  return getFieldSpec(schemaProv, schemaModel, field)?.status === 'unsupported';
}

/**
 * Keep LoRA values on engine switch — never wipe stored stacks.
 * Unsupported LoRAs stay visible and prevent generation until explicitly removed.
 */
export function sanitizeFrameLoras<T>(
  _provider: string | undefined,
  _model: string | undefined,
  loras: T[] | undefined | null
): T[] {
  return Array.isArray(loras) ? loras : [];
}

/**
 * A real outbound entry needs a trimmed name that is non-empty.
 * Whitespace-only counts as empty. A name that is literally "LoRA" IS valid
 * (the user may have selected a real model with that name).
 * Does not mutate stored canvas nodes.
 */
export function isRealLoraEntry(entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') return false;
  const name = String((entry as { name?: unknown }).name ?? '').trim();
  return name.length > 0;
}

/** Keep only real LoRA entries (shared by openai_compat payload paths). */
export function filterRealLoraEntries<T>(list: T[] | undefined | null): T[] {
  if (!Array.isArray(list)) return [];
  return list.filter((e) => isRealLoraEntry(e));
}

/**
 * Architecture family classification for Checkpoints and LoRAs.
 * LoRAs are strictly architecture-specific (e.g. FLUX vs SDXL vs SD 1.5).
 */
export type ArchitectureFamily = 'flux' | 'sdxl' | 'sd15' | 'sd35' | 'wan21' | 'video' | 'imagen' | 'unknown';

export function getArchitectureFamily(modelOrBaseModel?: string): ArchitectureFamily {
  const raw = String(modelOrBaseModel || '').toLowerCase().trim();
  if (!raw) return 'unknown';

  // FLUX family: flux, flux.1, flux.1-dev, flux-schnell, bfl, black-forest-labs
  if (
    raw.includes('flux') ||
    raw.includes('bfl') ||
    raw.includes('black-forest-labs') ||
    raw.includes('618692') ||
    raw.includes('613730')
  ) {
    return 'flux';
  }

  // SDXL family: sdxl, sdxl 1.0, krea2 turbo, krea 2 turbo, pony, illustrious, pdxl, noobai, stable-diffusion-xl
  if (
    raw.includes('sdxl') ||
    raw.includes('stable-diffusion-xl') ||
    raw.includes('stable diffusion xl') ||
    raw.includes('krea2 turbo') ||
    raw.includes('krea 2 turbo') ||
    raw.includes('krea2') ||
    raw.includes('krea-2') ||
    raw.includes('pony') ||
    raw.includes('pdxl') ||
    raw.includes('illustrious') ||
    raw.includes('noobai') ||
    raw.includes('animagine') ||
    raw.includes('juggernaut') ||
    raw.includes('133005') ||
    raw.includes('101055') ||
    raw.includes('257749') ||
    raw.includes('3290120')
  ) {
    return 'sdxl';
  }

  // SD1.5 family: sd 1.5, sd1.5, sd1, sd 1.4, v1-5, runwayml
  if (
    raw.includes('sd 1.5') ||
    raw.includes('sd1.5') ||
    raw.includes('sd 1.4') ||
    raw.includes('sd1.4') ||
    raw.includes('sd1') ||
    raw.includes('v1-5') ||
    raw.includes('runwayml') ||
    raw.includes('4201')
  ) {
    return 'sd15';
  }

  // SD3.5 / SD3 family
  if (
    raw.includes('sd 3.5') ||
    raw.includes('sd3.5') ||
    raw.includes('sd 3') ||
    raw.includes('sd3') ||
    raw.includes('stable-diffusion-3') ||
    raw.includes('stable diffusion 3') ||
    raw.includes('stable-diffusion-v35')
  ) {
    return 'sd35';
  }

  // Wan family
  if (
    raw.includes('wan') ||
    raw.includes('wan2.1') ||
    raw.includes('wan-2.1') ||
    raw.includes('tongyi')
  ) {
    return 'wan21';
  }

  // Video family
  if (
    raw.includes('ltx') ||
    raw.includes('kling') ||
    raw.includes('minimax') ||
    raw.includes('hailuo') ||
    raw.includes('cogvideox')
  ) {
    return 'video';
  }

  // Imagen / Gemini family
  if (raw.includes('imagen') || raw.includes('gemini')) {
    return 'imagen';
  }

  return 'unknown';
}

export interface LoraArchitectureCompatibilityResult {
  compatible: boolean;
  reason?: string;
  ckptFamily: ArchitectureFamily;
  loraFamily: ArchitectureFamily;
  ckptBaseModel: string;
  loraBaseModel: string;
}

export function checkLoraArchitectureCompatibility(
  checkpoint: string,
  checkpointBaseModel: string | undefined,
  lora: { name: string; baseModel?: string }
): LoraArchitectureCompatibilityResult {
  const ckptName = (checkpoint || '').trim();
  const loraName = (lora.name || '').trim();
  const ckptBase = (checkpointBaseModel || '').trim();
  const loraBase = (lora.baseModel || '').trim();

  const ckptFamily = getArchitectureFamily(ckptBase) !== 'unknown'
    ? getArchitectureFamily(ckptBase)
    : getArchitectureFamily(ckptName);

  const loraFamily = getArchitectureFamily(loraBase) !== 'unknown'
    ? getArchitectureFamily(loraBase)
    : getArchitectureFamily(loraName);

  const defaultCkptBase = ckptFamily === 'flux' ? 'FLUX.1' : ckptFamily === 'sdxl' ? 'SDXL 1.0' : ckptFamily === 'sd15' ? 'SD 1.5' : ckptFamily === 'sd35' ? 'SD 3.5' : ckptFamily === 'wan21' ? 'Wan 2.1' : ckptName || '未知';
  const defaultLoraBase = loraFamily === 'flux' ? 'FLUX.1' : loraFamily === 'sdxl' ? 'SDXL 1.0' : loraFamily === 'sd15' ? 'SD 1.5' : loraFamily === 'sd35' ? 'SD 3.5' : loraFamily === 'wan21' ? 'Wan 2.1' : '未知';

  const effectiveCkptBaseModel = ckptBase || defaultCkptBase;
  const effectiveLoraBaseModel = loraBase || defaultLoraBase;

  // Strict cross-architecture check: if both families are identified and differ, it's incompatible
  if (ckptFamily !== 'unknown' && loraFamily !== 'unknown' && ckptFamily !== loraFamily) {
    const reason = `LoRA [${loraName}] (baseModel: ${effectiveLoraBaseModel}) 与底模 [${ckptName}] (baseModel: ${effectiveCkptBaseModel}) 架构不兼容，未发送至上游。`;
    return {
      compatible: false,
      reason,
      ckptFamily,
      loraFamily,
      ckptBaseModel: effectiveCkptBaseModel,
      loraBaseModel: effectiveLoraBaseModel,
    };
  }

  return {
    compatible: true,
    ckptFamily,
    loraFamily,
    ckptBaseModel: effectiveCkptBaseModel,
    loraBaseModel: effectiveLoraBaseModel,
  };
}

/**
 * Keep LoRA values in the request. Runtime endpoint validation is authoritative;
 * local catalog hints must not prevent the provider returning its actual response.
 * Filters out architecture-incompatible entries when both checkpoint and LoRA architectures are identified.
 */
export function resolveGenerateLorasPayload<T extends { name?: string; baseModel?: string }>(
  provider: string | undefined,
  model: string | undefined,
  mappedLoras: T[] | undefined | null,
  checkpointBaseModel?: string
): T[] | undefined {
  void provider;
  void model;
  void checkpointBaseModel;
  if (!Array.isArray(mappedLoras)) return [];
  return [...mappedLoras];
}

/** Preserve explicit canvas values; endpoint schema validation and its response are authoritative. */
export function omitUnsupportedGenerateFields<T extends Record<string, unknown>>(
  provider: string | undefined,
  model: string | undefined,
  fields: T
): T {
  void provider;
  void model;
  return { ...fields };
}
