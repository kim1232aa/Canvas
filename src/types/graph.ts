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
  default: any;
  options?: WidgetOption[];
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
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
  executionProgress?: number; // 0 - 100
  outputData?: any; // e.g. generated image URL
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
  checkpoint: string;
  vae?: string;
  seed?: number;
  seedControl: 'randomize' | 'fixed' | 'increment' | 'decrement';
  steps?: number;
  cfg?: number;
  sampler?: string;
  scheduler?: string;
  denoise: number;
  width: number;
  height: number;
  batchSize: number;
  loras: Array<{
    name: string;
    modelStrength: number;
    clipStrength: number;
    triggerWords: string;
    civitaiId?: string;
  }>;
  targetProvider: 'civitai' | 'fal' | 'agnes' | 'sensenova' | 'huggingface' | 'modelscope' | 'modelscope_ai' | 'nanogpt' | 'gemini' | 'video' | 'tensorart';
  tensorArtInputs?: any[];
  videoDuration?: number;
  aspectRatio?: string;
  imageSize?: string;
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
  videoUrl?: string; // Output MP4 video URL
  mediaType?: 'image' | 'video'; // Toggle between static image & AI video
  videoDuration?: number; // Video length in seconds (e.g. 3, 5)
  videoFps?: number; // Video frames per second (e.g. 16, 24)
  videoAspectRatio?: string; // Aspect ratio for video (e.g. "16:9")
  historyImages?: string[];
  createdAt: number;
}

