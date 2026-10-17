/**
 * History 「应用到画布」：把成功记录的图、参数、（若有）工作流快照还原到画布。
 * 无快照时仍应用图与已有参数，并返回 notice「这条没存工作流」——绝不假装整图已还原。
 */
import type { Connection, NodeInstance, SpatialFrame } from '../types/graph';
import { saveImagePrefixFor } from './saveImagePrefix';
import { providerIdFromHistory } from './providerLabels';
import type { GenerationHistoryItem } from '../types/providers';

export const NO_WORKFLOW_SNAPSHOT_MSG = '这条没存工作流';

export type HistoryApplyItem = GenerationHistoryItem & {
  /** Slim list flag: full snapshot lives on GET /api/history/:id */
  hasWorkflowSnapshot?: boolean;
};

export type ApplyHistoryInput = {
  item: HistoryApplyItem;
  nodes: NodeInstance[];
  connections: Connection[];
  spatialFrames?: SpatialFrame[];
};

export type ApplyHistoryOutput = {
  nodes: NodeInstance[];
  connections: Connection[];
  spatialFrames?: SpatialFrame[];
  /** One-line zh-Hans notice when snapshot is missing */
  notice?: string;
  restoredFromSnapshot: boolean;
  imageApplied: boolean;
  /** Params that were written onto nodes (for tests / callers) */
  applied: {
    prompt?: string;
    negativePrompt?: string;
    model?: string;
    provider?: string;
    seed?: number | null;
    steps?: number | null;
    cfg?: number | null;
    width?: number | null;
    height?: number | null;
    imageUrl?: string;
    loraCount: number;
  };
};

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

const imageUrlOf = (item: HistoryApplyItem): string | undefined => {
  const u = item.url || item.imageUrl;
  return u && String(u).trim() ? String(u) : undefined;
};

type SnapShape = {
  nodes?: NodeInstance[];
  connections?: Connection[];
  canvasMode?: string;
  frame?: SpatialFrame;
};

/** True when the record carries a usable graph or spatial snapshot object. */
export function historyHasUsableSnapshot(item: HistoryApplyItem): boolean {
  const snap = item.workflowSnapshot as SnapShape | undefined;
  if (!snap || typeof snap !== 'object') return false;
  if (Array.isArray(snap.nodes) && snap.nodes.length > 0) return true;
  if (snap.frame && typeof snap.frame === 'object') return true;
  return false;
}

/** Put result image on Save Image (all of them); if none, on PreviewImage. */
export function putHistoryImageOnSaveNodes(nodes: NodeInstance[], imageUrl: string | undefined): {
  nodes: NodeInstance[];
  imageApplied: boolean;
} {
  if (!imageUrl) return { nodes, imageApplied: false };
  const hasSave = nodes.some((n) => n.type === 'SaveImage');
  let imageApplied = false;
  const next = nodes.map((n) => {
    const hit = hasSave ? n.type === 'SaveImage' : n.type === 'PreviewImage';
    if (!hit) return n;
    imageApplied = true;
    return {
      ...n,
      outputData: imageUrl,
      state: 'success' as NodeInstance['state'],
      outputAt: new Date().toISOString(),
      restoredFromPreviousSession: undefined,
      stalePriorOutput: undefined,
      errorMessage: undefined,
      errorAt: undefined,
      upstreamFailed: false,
    };
  });
  return { nodes: next, imageApplied };
}

/** Overlay board-requested history fields onto matching node types. Does not invent LoRA nodes. */
export function patchHistoryParamsOntoNodes(nodes: NodeInstance[], item: HistoryApplyItem): {
  nodes: NodeInstance[];
  applied: ApplyHistoryOutput['applied'];
} {
  const model = (item.actualModel || item.model || undefined) ?? undefined;
  const provider = (item.actualProvider || item.provider || undefined) ?? undefined;
  const providerId = providerIdFromHistory(provider);
  const prompt = item.prompt != null && String(item.prompt).length ? String(item.prompt) : undefined;
  const negativePrompt =
    item.negativePrompt != null && String(item.negativePrompt).length
      ? String(item.negativePrompt)
      : undefined;
  const loras = Array.isArray(item.loras) ? item.loras.filter((l) => l && l.name) : [];
  let loraIdx = 0;
  const imageUrl = imageUrlOf(item);

  const next = nodes.map((n) => {
    if (n.type === 'CLIPTextEncode' && prompt !== undefined) {
      return { ...n, values: { ...n.values, text: prompt } };
    }
    if (n.type === 'CLIPTextEncodeNegative' && negativePrompt !== undefined) {
      return { ...n, values: { ...n.values, text: negativePrompt } };
    }
    if (n.type === 'CheckpointLoaderSimple' && (model || provider || item.width != null || item.height != null)) {
      return {
        ...n,
        values: {
          ...n.values,
          ...(model ? { ckpt_name: model } : {}),
          ...(providerId ? { targetProvider: providerId } : {}),
          ...(item.width != null ? { width: item.width } : {}),
          ...(item.height != null ? { height: item.height } : {}),
        },
      };
    }
    if (n.type === 'SaveImage' && (model || providerId)) {
      return { ...n, values: { ...n.values, filename_prefix: saveImagePrefixFor(providerId, model, n.values?.filename_prefix) } };
    }
    if (n.type === 'EmptyLatentImage' && (item.width != null || item.height != null)) {
      return {
        ...n,
        values: {
          ...n.values,
          ...(item.width != null ? { width: item.width } : {}),
          ...(item.height != null ? { height: item.height } : {}),
        },
      };
    }
    if (n.type === 'KSampler') {
      const values = { ...n.values };
      let touched = false;
      if (item.seed != null) {
        values.seed = item.seed;
        values.control_after_generate = 'fixed';
        touched = true;
      }
      if (item.steps != null) {
        values.steps = item.steps;
        touched = true;
      }
      if (item.cfg != null) {
        values.cfg = item.cfg;
        touched = true;
      }
      if (item.sampler) {
        values.sampler_name = item.sampler;
        touched = true;
      }
      if (item.scheduler) {
        values.scheduler = item.scheduler;
        touched = true;
      }
      return touched ? { ...n, values } : n;
    }
    if ((n.type === 'LoRALoader' || n.type === 'CivitaiLoRABrowserNode') && loras.length > 0 && loraIdx < loras.length) {
      const l = loras[loraIdx++];
      if (n.type === 'LoRALoader') {
        return {
          ...n,
          values: {
            ...n.values,
            lora_name: l.name,
            ...(l.strength != null
              ? { strength_model: l.strength, strength_clip: l.strength }
              : {}),
          },
        };
      }
      return {
        ...n,
        values: {
          ...n.values,
          selected_model_name: l.name,
          ...(l.strength != null ? { strength_model: l.strength } : {}),
        },
      };
    }
    return n;
  });

  return {
    nodes: next,
    applied: {
      prompt,
      negativePrompt,
      model,
      provider,
      seed: item.seed,
      steps: item.steps,
      cfg: item.cfg,
      width: item.width,
      height: item.height,
      imageUrl,
      loraCount: Math.min(loras.length, loraIdx || loras.length),
    },
  };
}

function applySpatialFrame(item: HistoryApplyItem, frame: SpatialFrame): SpatialFrame {
  const imageUrl = imageUrlOf(item);
  const model = item.actualModel || item.model;
  const provider = item.actualProvider || item.provider;
  const loras = Array.isArray(item.loras) ? item.loras : [];
  return {
    ...clone(frame),
    ...(item.prompt != null ? { prompt: String(item.prompt) } : {}),
    ...(item.negativePrompt != null ? { negativePrompt: String(item.negativePrompt) } : {}),
    ...(imageUrl
      ? {
          imageUrl,
          videoUrl: item.mediaType === 'video' || item.videoUrl ? item.videoUrl || imageUrl : frame.videoUrl,
          mediaType: item.mediaType === 'video' || item.videoUrl ? 'video' : 'image',
          status: 'idle' as const,
        }
      : {}),
    params: {
      ...frame.params,
      ...(model ? { checkpoint: model } : {}),
      ...(providerIdFromHistory(provider) ? { targetProvider: providerIdFromHistory(provider) as any } : {}),
      ...(item.seed != null ? { seed: item.seed, seedControl: 'fixed' as const } : {}),
      ...(item.steps != null ? { steps: item.steps } : {}),
      ...(item.cfg != null ? { cfg: item.cfg } : {}),
      ...(item.sampler ? { sampler: item.sampler } : {}),
      ...(item.scheduler ? { scheduler: item.scheduler } : {}),
      ...(item.width != null ? { width: item.width } : {}),
      ...(item.height != null ? { height: item.height } : {}),
      ...(loras.length
        ? {
            loras: loras.map((l) => ({
              name: l.name,
              modelStrength: l.strength,
              clipStrength: l.strength,
              triggerWords: '',
            })),
          }
        : {}),
    },
  };
}

/**
 * Pure apply: either restore graph/spatial from workflowSnapshot, or patch the current canvas
 * and surface NO_WORKFLOW_SNAPSHOT_MSG.
 */
export function applyHistoryToCanvas(input: ApplyHistoryInput): ApplyHistoryOutput {
  const { item } = input;
  const imageUrl = imageUrlOf(item);
  const snap = item.workflowSnapshot as SnapShape | undefined;

  if (historyHasUsableSnapshot(item) && snap) {
    // Spatial-only snapshot (no node graph)
    if (snap.frame && (!Array.isArray(snap.nodes) || snap.nodes.length === 0)) {
      const frame = applySpatialFrame(item, snap.frame);
      const patched = patchHistoryParamsOntoNodes(clone(input.nodes), item);
      const withImage = putHistoryImageOnSaveNodes(patched.nodes, imageUrl);
      return {
        nodes: withImage.nodes,
        connections: input.connections,
        spatialFrames: [frame],
        restoredFromSnapshot: true,
        imageApplied: !!(imageUrl || frame.imageUrl),
        applied: { ...patched.applied, imageUrl, loraCount: Array.isArray(item.loras) ? item.loras.length : 0 },
      };
    }

    if (Array.isArray(snap.nodes) && snap.nodes.length > 0) {
      const baseNodes = clone(snap.nodes) as NodeInstance[];
      const baseConns = clone((snap.connections || []) as Connection[]);
      // Snapshot was sanitized without outputData — reinject this run's image.
      const withImage = putHistoryImageOnSaveNodes(baseNodes, imageUrl);
      // Overlay history card fields (board-requested) so unused-but-shown values still land.
      const patched = patchHistoryParamsOntoNodes(withImage.nodes, item);
      const spatialFrames =
        snap.frame
          ? [applySpatialFrame(item, snap.frame)]
          : input.spatialFrames;
      return {
        nodes: patched.nodes,
        connections: baseConns,
        spatialFrames,
        restoredFromSnapshot: true,
        imageApplied: withImage.imageApplied,
        applied: { ...patched.applied, imageUrl, loraCount: Array.isArray(item.loras) ? item.loras.filter((l) => l?.name).length : 0 },
      };
    }
  }

  // No usable snapshot — patch current canvas; never pretend a full graph restore.
  const patched = patchHistoryParamsOntoNodes(clone(input.nodes), item);
  const withImage = putHistoryImageOnSaveNodes(patched.nodes, imageUrl);
  return {
    nodes: withImage.nodes,
    connections: input.connections,
    spatialFrames: input.spatialFrames,
    notice: NO_WORKFLOW_SNAPSHOT_MSG,
    restoredFromSnapshot: false,
    imageApplied: withImage.imageApplied,
    applied: {
      ...patched.applied,
      imageUrl,
      loraCount: Array.isArray(item.loras) ? item.loras.filter((l) => l?.name).length : 0,
    },
  };
}

/** Build the apply payload ImageDetailModal / HistoryModal share (params + image + snapshot). */
export function historyItemToApplyParams(item: HistoryApplyItem) {
  return {
    prompt: item.prompt || undefined,
    negativePrompt: item.negativePrompt || undefined,
    checkpoint: item.actualModel || item.model || undefined,
    provider: item.actualProvider || item.provider || undefined,
    seed: item.seed != null ? item.seed : undefined,
    steps: item.steps != null ? item.steps : undefined,
    cfg: item.cfg != null ? item.cfg : undefined,
    sampler: item.sampler || undefined,
    scheduler: item.scheduler || undefined,
    width: item.width != null ? item.width : undefined,
    height: item.height != null ? item.height : undefined,
    loras: item.loras,
    imageUrl: imageUrlOf(item),
    workflowSnapshot: item.workflowSnapshot,
    hasWorkflowSnapshot: item.hasWorkflowSnapshot,
    historyItem: item,
  };
}
