export type EngineCapability = 'text2img' | 'img2img' | 'text2video' | 'img2video' | 'reasoning';

export type ProviderId =
  | 'civitai'
  | 'fal'
  | 'agnes'
  | 'sensenova'
  | 'modelscope'
  | 'modelscope_ai'
  | 'nanogpt'
  | 'gemini'
  | 'huggingface'
  | 'tensorart'
  | 'video';

export interface ModelSpec {
  id: string;
  name: string;
  type: 'image' | 'video' | 'reasoning';
  description?: string;
  defaultSteps?: number;
  defaultCfg?: number;
  supportsLora?: boolean;
}

export interface NormalizedGenerateParams {
  prompt: string;
  negative_prompt?: string;
  model: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  seed?: number;
  denoise?: number;
  image_url?: string; // 核心：图生图 (img2img) 或 图生视频 (img2video) 的输入源图 URL
  loras?: Array<{
    name: string;
    path?: string;
    url?: string;
    strength?: number;
    modelStrength?: number;
    clipStrength?: number;
    civitaiId?: string;
    triggers?: string;
  }>;
  // 视频特定参数
  isVideo?: boolean;
  videoDuration?: number;
  videoFps?: number;
  aspectRatio?: string;
  // 采样器与调度器 (精细控制)
  sampler_name?: string;
  scheduler?: string;
  // 动态密钥与自定义端点
  apiKey?: string;
  baseUrl?: string;
  extraParams?: Record<string, any>;
}

export interface NormalizedGenerateResult {
  mediaUrl: string;
  mediaType: 'image' | 'video';
  provider: string;
  providerId: ProviderId;
  model: string;
  requestedModel?: string;
  seed: number;
  wasAdapted?: boolean;
  adaptationNotice?: string;
  timings?: any;
  rawResponse?: any;
}

export interface NormalizedChatParams {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  apiKey?: string;
  baseUrl?: string;
}

export interface NormalizedChatResult {
  content: string;
  reasoningContent?: string;
  provider: string;
  providerId: ProviderId;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface IEngineDriver {
  readonly id: ProviderId;
  readonly name: string;
  readonly label: string;
  readonly badgeColor: string;
  readonly description: string;
  readonly capabilities: readonly EngineCapability[];
  readonly defaultBaseUrl?: string;
  readonly defaultKey?: string;
  readonly supportedModels: ModelSpec[];

  generate(params: NormalizedGenerateParams, keys: Record<string, string>): Promise<NormalizedGenerateResult>;
  chat?(params: NormalizedChatParams, keys: Record<string, string>): Promise<NormalizedChatResult>;
}
