export type ProviderId = 'civitai' | 'fal' | 'agnes' | 'sensenova' | 'huggingface' | 'modelscope' | 'modelscope_ai' | 'nanogpt' | 'gemini' | 'tensorart' | 'video' | 'openai_compat' | 'grok_compat' | 'muapi' | 'wavespeed' | 'sogni';

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  badge: string;
  docsUrl: string;
  description: string;
  apiUrl: string;
  keyName: string;
  keyPlaceholder: string;
  status: 'unconfigured' | 'testing' | 'connected' | 'error';
  latencyMs?: number;
  lastTested?: number;
  errorMessage?: string;
  popularModels: string[];
}

export interface KeyPoolItemStats {
  key: string;
  maskedKey: string;
  status: 'active' | 'rate_limited' | 'invalid' | 'testing';
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  consecutiveFailures?: number;
  avgLatencyMs: number;
  lastUsed: number;
  lastError?: string;
  rateLimitResetAt?: number;
}

export interface ProviderPoolStats {
  totalKeys: number;
  activeKeys: number;
  rateLimitedKeys: number;
  invalidKeys: number;
  strategy: 'round_robin' | 'failover' | 'latency_best';
  keys: KeyPoolItemStats[];
}

export interface ProviderBalanceInfo {
  status: 'ok' | 'low' | 'exhausted' | 'unknown' | 'error';
  amount?: number | string;
  unit?: string;
  detail?: string;
}

export interface ApiKeysState {
  civitaiKey: string;
  falKey: string;
  agnesKey?: string;
  agnesBaseUrl?: string;
  openaiCompatKey?: string;
  openaiCompatBaseUrl?: string;
  grokCompatKey?: string;
  grokCompatBaseUrl?: string;
  sensenovaKey?: string;
  sensenovaBaseUrl?: string;
  hfToken: string;
  modelscopeToken: string;
  modelscopeAiToken?: string;
  nanogptKey: string;
  geminiKey: string;
  tensorartKey?: string;
  muapiKey?: string;
  wavespeedKey?: string;
  sogniKey?: string;
  [key: string]: any;
}

export interface CivitaiModelItem {
  id: number;
  name: string;
  type: string;
  nsfw: boolean;
  creator: {
    username: string;
    image?: string;
  };
  modelVersions: Array<{
    id: number;
    name: string;
    baseModel: string;
    trainedWords?: string[];
    files?: Array<{ name: string; sizeKB: number; downloadUrl: string }>;
    images?: Array<{ url: string; nsfwLevel: number }>;
  }>;
  stats: {
    downloadCount: number;
    favoriteCount: number;
    rating: number;
    ratingCount: number;
  };
}

export interface CivitaiSearchResult {
  items: CivitaiModelItem[];
  metadata?: {
    totalItems?: number;
    currentPage?: number;
    pageSize?: number;
    nextCursor?: string | null;
    nextPage?: string;
  };
}

export interface GenerationHistoryItem {
  id: string;
  url: string;
  imageUrl?: string;
  mediaType?: 'image' | 'video';
  prompt: string | null;
  negativePrompt?: string | null;
  provider?: string | null;
  actualProvider?: string | null;
  model?: string | null;
  actualModel?: string | null;
  seed: number | null;
  steps: number | null;
  cfg: number | null;
  sampler?: string | null;
  scheduler?: string | null;
  width?: number | null;
  height?: number | null;
  timestamp: number;
  loras?: Array<{ name: string; strength: number; civitaiId?: string }>;
  workflowSnapshot?: Record<string, unknown>;
  requestMetadata?: {
    route?: string;
    submissions?: Array<{ endpoint: string; parameters: unknown; status: number }>;
    executionTrace?: unknown[];
    requestedParameters?: Record<string, unknown>;
    actualParameters?: Record<string, unknown>;
    effectiveParameters?: Record<string, unknown>;
    [key: string]: unknown;
  };
}
