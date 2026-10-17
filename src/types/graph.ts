export type DataType =
  | 'MODEL'
  | 'CLIP'
  | 'VAE'
  | 'CONDITIONING'
  | 'LATENT'
  | 'IMAGE'
  | 'VIDEO'
  | 'CONTROL_NET'
  | 'STRING'
  | 'INT'
  | 'FLOAT'
  | 'ANY';

export interface Socket {
  id: string;
  name: string;
  type: DataType;
  label?: string;
  description?: string;
}

export const SOCKET_COLORS: Record<DataType, string> = {
  MODEL: '#00f0ff',        // Cyan
  CLIP: '#ffd000',         // Bright Yellow
  VAE: '#ff3366',          // Rose Red
  CONDITIONING: '#ff8800',  // Orange
  LATENT: '#b347ff',       // Purple
  IMAGE: '#38bdf8',        // Sky Blue
  VIDEO: '#a3e635',        // Lime Green (AI Video)
  CONTROL_NET: '#14b8a6',  // Teal
  STRING: '#10b981',       // Emerald
  INT: '#94a3b8',          // Slate Gray
  FLOAT: '#64748b',        // Slate
  ANY: '#cbd5e1',          // Light Slate
};

export interface WidgetOption {
  label: string;
  value: any;
  provider?: string;
  description?: string;
}

export interface WidgetDef {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'slider' | 'select' | 'toggle' | 'seed';
  /** Optional: omit when the field must be set explicitly (e.g. LoRA strength — no silent 0.8). */
  default?: any;
  options?: WidgetOption[];
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  /** Hover hint (e.g. strength rules). */
  title?: string;
  /** fix10: display-only unit suffix next to number inputs (e.g. 秒); never sent. */
  unit?: string;
}

export interface NodeDefinition {
  type: string;
  title: string;
  category: 'loaders' | 'conditioning' | 'sampling' | 'latent' | 'image' | 'providers' | 'utils';
  description: string;
  inputs: Socket[];
  outputs: Socket[];
  widgets: WidgetDef[];
  defaultValues: Record<string, any>;
  colorTag?: string;
}

export interface NodeInstance {
  id: string;
  type: string;
  title: string;
  pos: { x: number; y: number };
  width?: number;
  inputs: Socket[];
  outputs: Socket[];
  values: Record<string, any>;
  collapsed?: boolean;
  bypassed?: boolean;
  state?: 'idle' | 'running' | 'success' | 'error';
  errorMessage?: string;
  /** ISO time the upstream failure was recorded (clean-1651: badge shows 「上一次」+ 北京时间). */
  errorAt?: string;
  /** 'schema' = model-schema lookup failed before any generation request; shown on the model node as a plain headline + raw body. */
  errorKind?: 'schema';
  /** Model id (ckpt_name) that caused the schema-miss; used to clear when the user changes the model. */
  errorModel?: string;
  /** Set on downstream branch nodes when this run failed upstream (no media produced). */
  upstreamFailed?: boolean;
  /** Display title of the node that failed this run; downstream shows 「没出图，原因见<title>」. */
  upstreamFailedTitle?: string;
  /** Node id whose failure set upstreamFailed on this node. */
  upstreamFailedFromId?: string;
  /** The failure was a local block (no request left the machine), not an upstream failure. */
  upstreamLocalBlocked?: boolean;
  /** clean-1333 #6: set ONLY on the node that caused a local block — the specific reason (same text as the toast). */
  localBlockReason?: string;
  /** 「本地拦截 · 未发请求」 (zero requests) or 「本地拦截 · 已读 Schema、未发生成」 — matches the request log. */
  localBlockTitle?: string;
  /** trace-fix2 #10: Schema field that caused the local block (e.g. 'loras') and the active LoRA node count at block time. */
  localBlockField?: string;
  localBlockLoraCount?: number;
  executionProgress?: number; // 0 - 100
  outputData?: any; // e.g. generated image URL
  /** ISO time this output arrived (set when a run delivers it). */
  outputAt?: string;
  /** Output restored from the workspace cache after a page refresh (not produced by this session). */
  restoredFromPreviousSession?: { at: string | null };
  /** Legacy flag: prior image kept with「上次结果，不是本次」. Prefer clearing outputData (saveempty) instead. */
  stalePriorOutput?: boolean;
}

export interface Connection {
  id: string;
  fromNodeId: string;
  fromSocketId: string;
  toNodeId: string;
  toSocketId: string;
  type: DataType;
}

export interface CanvasTransform {
  x: number;
  y: number;
  scale: number;
}

export interface WorkflowPreset {
  id: string;
  name: string;
  description: string;
  category: string;
  provider: string;
  previewImage?: string;
  tags?: string[];
  loraNames?: string[];
  /** 待配方: the endpoint needs a real resource (e.g. a required lora_url) the recipes do not provide yet. Card shows 待配方 and 立即运行 stays disabled. */
  pendingRecipe?: string;
  architectureExplanation?: string;
  otherMetadata?: {
    baseModel?: string;
    modelFile?: string;
    vae?: string;
    sampler?: string;
    scheduler?: string;
    steps?: number;
    cfgScale?: number;
    seed?: number;
    denoise?: number;
    width?: number;
    height?: number;
    resolution?: string;
    aspectRatio?: string;
    mediaType?: 'image' | 'video';
    duration?: number | null;
    engine?: string;
    resources?: Array<{
      name: string;
      fileName?: string;
      versionId?: string;
      strength?: number;
      baseModel?: string;
    }>;
    [key: string]: any;
  };
  nodes: NodeInstance[];
  connections: Connection[];
  spatialFrames?: SpatialFrame[];
}

export interface DraggingWire {
  fromNodeId: string;
  fromSocketId: string;
  isOutput: boolean;
  type: DataType;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export type CanvasMode = 'spatial' | 'graph';

export interface ComfyParameters {
  retiredToolSelection?: Record<string,string>;
  requireReferenceImage?: boolean;
  unresolvedModel?: boolean;
  executionBlockedReason?: string;
  sourceLoraAir?: string;
  checkpoint: string;
  vae?: string;
  seed?: number;
  seedControl?: 'randomize' | 'fixed' | 'increment' | 'decrement';
  steps?: number;
  cfg?: number;
  sampler?: string;
  scheduler?: string;
  denoise?: number;
  width?: number;
  height?: number;
  batchSize?: number;
  loras: Array<{
    name: string;
    modelStrength?: number;
    clipStrength?: number;
    triggerWords: string;
    civitaiId?: string;
    downloadUrl?: string;
    unresolvedResource?: boolean;
    resourceVerified?: boolean;
    resource_source?: string;
    resource_kind?: string;
  }>;
  videoProvider?: string;
  civitaiEngine?: string;
  civitaiEcosystem?: string;
  civitaiModel?: string;
  targetProvider: 'civitai' | 'fal' | 'agnes' | 'sensenova' | 'huggingface' | 'modelscope' | 'modelscope_ai' | 'nanogpt' | 'gemini' | 'video' | 'tensorart' | 'openai_compat' | 'grok_compat' | 'muapi' | 'wavespeed' | 'sogni' | 'krea' | 'together' | 'aimlapi' | 'novita' | 'venice' | 'runware' | 'modelslab' | 'replicate';
  tensorArtInputs?: any[];
  videoDuration?: number;
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
  customParameters?: string;
  hfProvider?: 'hf-inference' | 'fal-ai' | 'z-image-space';
  videoFrames?: number;
  videoFps?: number;
  falModelName?: string;
  shift?: number;
  randomSeed?: boolean;
  galleryImages?: unknown[];
}

export interface SpatialFrame {
  id: string;
  title: string;
  pos: { x: number; y: number };
  width: number;
  height: number;
  prompt: string;
  negativePrompt: string;
  params: ComfyParameters;
  status: 'idle' | 'generating' | 'success' | 'error';
  errorMessage?: string;
  executionProgress?: number; // 0 - 100
  executionStage?: string; // Staged phase description
  imageUrl?: string;
  referenceImageUrl?: string;
  videoUrl?: string; // Output MP4 video URL
  mediaType?: 'image' | 'video'; // Toggle between static image & AI video
  videoDuration?: number; // Video length in seconds (e.g. 3, 5)
  videoFps?: number; // Video frames per second (e.g. 16, 24)
  videoAspectRatio?: string; // Aspect ratio for video (e.g. "16:9")
  historyImages?: string[];
  createdAt: number;
}
