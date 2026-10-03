import { ApiKeysState, CivitaiSearchResult, GenerationHistoryItem, ProviderId } from '../types/providers';

const API_KEYS_STORAGE_KEY = 'comfycanvas_api_keys';

// Browser-local keys only ("本浏览器"); empty when nothing was saved. No placeholder keys or base URLs.
const EMPTY_KEYS: ApiKeysState = {
  civitaiKey: '',
  falKey: '',
  agnesKey: '',
  sensenovaKey: '',
  hfToken: '',
  modelscopeToken: '',
  modelscopeAiToken: '',
  nanogptKey: '',
  geminiKey: '',
  tensorartKey: '',
  openaiCompatKey: '',
  openaiCompatBaseUrl: '',
  grokCompatKey: '',
  grokCompatBaseUrl: '',
};

export const getStoredApiKeys = (): ApiKeysState => {
  try {
    const raw = localStorage.getItem(API_KEYS_STORAGE_KEY);
    if (raw) return { ...EMPTY_KEYS, ...JSON.parse(raw) };
  } catch (e) {
    console.error('Error reading stored keys:', e);
  }
  return { ...EMPTY_KEYS };
};

export const saveStoredApiKeys = (keys: ApiKeysState) => {
  try {
    localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(keys));
  } catch (e) {
    console.error('Error saving keys:', e);
  }
};

export const searchCivitaiModels = async (
  query: string = '',
  types: string = 'LORA',
  sort: string = 'Highest Rated',
  page: number = 1,
  limit: number = 16,
  apiKey?: string,
  cursor?: string
): Promise<CivitaiSearchResult> => {
  const keys = getStoredApiKeys();
  const effectiveKey = apiKey || keys.civitaiKey;

  const params = new URLSearchParams({
    types,
    sort,
    limit: String(limit),
  });

  if (cursor) {
    params.append('cursor', cursor);
  } else if (query) {
    params.append('query', query);
  } else if (page) {
    params.append('page', String(page));
  }

  const headers: Record<string, string> = {};
  if (effectiveKey) {
    headers['x-civitai-key'] = effectiveKey;
  }

  const response = await fetch(`/api/civitai/models?${params.toString()}`, { headers });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Civitai API failed' }));
    throw new Error(err.error || `Civitai query failed: ${response.status}`);
  }

  return response.json();
};

export const testProviderConnection = async (
  provider: ProviderId,
  key: string,
  token?: string
): Promise<{ status: 'ok' | 'error' | 'warning' | 'unsupported'; latency?: number; message?: string }> => {
  try {
    const effectiveToken = (token !== undefined ? token : getStoredAdminToken()).trim();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (effectiveToken) {
      headers['Authorization'] = `Bearer ${effectiveToken}`;
    }
    const resp = await fetch('/api/test-provider', {
      method: 'POST',
      headers,
      body: JSON.stringify({ provider, key }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return { status: 'error', message: `HTTP ${resp.status}: ${text}` };
    }
    return await resp.json();
  } catch (err: any) {
    return { status: 'error', message: err.message || 'Connection failed' };
  }
};

export const generateWithFal = async (params: {
  prompt: string;
  negative_prompt?: string;
  model?: string;
  image_size?: { width: number; height: number };
  num_inference_steps?: number;
  guidance_scale?: number;
  seed?: number;
  loras?: Array<{ path: string; scale: number }>;
}) => {
  const keys = getStoredApiKeys();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (keys.falKey) headers['x-fal-key'] = keys.falKey;

  const resp = await fetch('/api/fal/generate', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Fal.ai generation error' }));
    throw new Error(err.details || err.error || `Fal.ai failed (${resp.status})`);
  }

  return resp.json();
};

export const generateWithHuggingFace = async (params: {
  prompt: string;
  negative_prompt?: string;
  model: string;
  width?: number;
  height?: number;
  steps?: number;
  guidance?: number;
  seed?: number;
}) => {
  const keys = getStoredApiKeys();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (keys.hfToken) headers['x-hf-token'] = keys.hfToken;

  const resp = await fetch('/api/huggingface/generate', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Hugging Face error' }));
    throw new Error(err.details || err.error || `Hugging Face failed (${resp.status})`);
  }

  return resp.json();
};

export const generateWithModelScope = async (params: {
  prompt: string;
  negative_prompt?: string;
  model?: string;
  steps?: number;
  width?: number;
  height?: number;
  guidance?: number;
  loras?: Array<{ name: string; strength: number; civitaiId?: string; triggers?: string }>;
  targetProvider?: string;
}) => {
  const keys = getStoredApiKeys();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  
  const isAi = params.targetProvider === 'modelscope_ai';
  const token = isAi ? keys.modelscopeAiToken : keys.modelscopeToken;
  
  if (token) headers['x-modelscope-token'] = token;
  if (isAi) headers['x-modelscope-site'] = 'ai';

  const resp = await fetch('/api/modelscope/generate', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...params,
      site: isAi ? 'ai' : 'cn'
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'ModelScope error' }));
    throw new Error(err.details || err.error || `ModelScope failed (${resp.status})`);
  }

  return resp.json();
};

export const generateWithNanoGPT = async (params: {
  prompt: string;
  model: string;
  seed?: number;
  image_url?: string;
}) => {
  const keys = getStoredApiKeys();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (keys.nanogptKey) headers['x-nanogpt-key'] = keys.nanogptKey;

  const resp = await fetch('/api/nanogpt/generate', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'NanoGPT error' }));
    throw new Error(err.details || err.error || `NanoGPT failed (${resp.status})`);
  }

  return resp.json();
};

export const generateVideo = async (params: {
  prompt: string;
  model?: string;
  duration?: number;
  fps?: number;
  aspect_ratio?: string;
  image_url?: string;
}): Promise<{ videoUrl: string; provider: string; model: string; duration: number; fps: number }> => {
  const keys = getStoredApiKeys();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (keys.falKey) headers['x-fal-key'] = keys.falKey;

  const resp = await fetch('/api/video/generate', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Video generation error' }));
    throw new Error(err.details || err.error || `Video generation failed (${resp.status})`);
  }

  return resp.json();
};

export const generateWithTensorArt = async (params: {
  prompt: string;
  negative_prompt?: string;
  model?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  seed?: number;
  loras?: Array<{ name: string; strength: number; civitaiId?: string }>;
  image_url?: string;
}) => {
  const keys = getStoredApiKeys();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (keys.tensorartKey) headers['x-tensorart-key'] = keys.tensorartKey;

  const resp = await fetch('/api/tensorart/generate', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Tensor.Art generation error' }));
    throw new Error(err.details || err.error || `Tensor.Art failed (${resp.status})`);
  }

  return resp.json();
};

export const generateWithGemini = async (params: {
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  seed?: number;
  cfg?: number;
  guidance_scale?: number;
  loras?: Array<{ name: string; strength: number }>;
}) => {
  const keys = getStoredApiKeys();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (keys.geminiKey) headers['x-gemini-key'] = keys.geminiKey;

  const resp = await fetch('/api/gemini/generate', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Gemini generation error' }));
    throw new Error(err.details || err.error || `Gemini failed (${resp.status})`);
  }

  return resp.json();
};

export interface RefinePromptOptions {
  provider?: string;
  model?: string;
  style?: string;
  loras?: any[];
}

export const getRefineModelSelection = (): { provider?: string; model?: string } => {
  try {
    const rawKeys = localStorage.getItem('comfycanvas_api_keys');
    if (rawKeys) {
      const parsed = JSON.parse(rawKeys);
      if (parsed.refineModel && parsed.refineProvider) {
        return { provider: parsed.refineProvider, model: parsed.refineModel };
      }
    }
    const localProvider = localStorage.getItem('comfycanvas_refine_provider');
    const localModel = localStorage.getItem('comfycanvas_refine_model');
    if (localModel && localProvider) {
      return { provider: localProvider, model: localModel };
    }
  } catch {}
  return {};
};

export const refinePromptWithGemini = async (
  prompt: string,
  options?: RefinePromptOptions | string,
  legacyLoras: any[] = []
): Promise<string> => {
  let style: string | undefined;
  let loras: any[] = [];
  let provider: string | undefined;
  let model: string | undefined;

  if (typeof options === 'string') {
    style = options.trim() ? options.trim() : undefined;
    loras = legacyLoras || [];
    const selection = getRefineModelSelection();
    provider = selection.provider;
    model = selection.model;
  } else if (options) {
    style = options.style?.trim() ? options.style.trim() : undefined;
    loras = options.loras || [];
    provider = options.provider;
    model = options.model;
    if (!provider || !model) {
      const selection = getRefineModelSelection();
      provider = provider || selection.provider;
      model = model || selection.model;
    }
  } else {
    const selection = getRefineModelSelection();
    provider = selection.provider;
    model = selection.model;
  }

  if (!provider || !model) {
    throw new Error('请先选择润色模型');
  }

  const keys = getStoredApiKeys();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (keys.geminiKey) headers['x-gemini-key'] = keys.geminiKey;
  if (keys.sensenovaKey) headers['x-sensenova-key'] = keys.sensenovaKey;
  if (keys.agnesKey) headers['x-agnes-key'] = keys.agnesKey;

  const resp = await fetch('/api/gemini/refine-prompt', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt,
      provider,
      model,
      ...(style ? { style } : {}),
      loras,
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Prompt refiner failed' }));
    throw new Error(err.upstreamBody || err.error || `润色失败 [${resp.status}]`);
  }

  const data = await resp.json();
  return data.refinedPrompt;
};

async function historyRequest(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const body = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${body}`);
  return body ? JSON.parse(body) : undefined;
}
export const fetchHistory = async (): Promise<GenerationHistoryItem[]> => historyRequest('/api/history');
export const saveToHistory = async (item: Partial<GenerationHistoryItem>) => historyRequest('/api/history', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(item)});
export const deleteHistoryItem = async (id: string) => {await historyRequest(`/api/history/${encodeURIComponent(id)}`, {method: 'DELETE'}); return true;};
export const deleteHistoryBatch = async (ids: string[]) => {await historyRequest('/api/history/delete-batch', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ids})}); return true;};
export const clearHistory = async () => {await historyRequest('/api/history', {method: 'DELETE'}); return true;};

export const fetchLiveModels = async (
  provider: 'all' | 'civitai' | 'fal' | 'modelscope' | 'agnes' | 'sensenova' | 'huggingface' | 'nanogpt' | 'gemini' | string = 'all',
  query = '',
  type = 'Checkpoint',
  category = 'all',
  sort = 'downloads',
  cursor = '',
  page = 1,
  limit = 50,
  architecture = ''
): Promise<Record<string, any[]> & { _pagination?: Record<string, { nextCursor?: string | null; page?: number; hasMore: boolean }> }> => {
  const keys = getStoredApiKeys();
  const headers: Record<string, string> = {};
  if (keys.tensorartKey) headers['x-tensorart-key'] = keys.tensorartKey;
  if (keys.civitaiKey) headers['x-civitai-key'] = keys.civitaiKey;
  if (keys.falKey) headers['x-fal-key'] = keys.falKey;
  if (keys.hfToken) headers['x-hf-token'] = keys.hfToken;
  if (keys.modelscopeToken) headers['x-modelscope-token'] = keys.modelscopeToken;
  if (keys.modelscopeAiToken) headers['x-modelscope-site'] = 'ai';
  if (keys.nanogptKey) headers['x-nanogpt-key'] = keys.nanogptKey;
  if (keys.sensenovaKey) headers['x-sensenova-key'] = keys.sensenovaKey;
  if (keys.agnesKey) headers['x-agnes-key'] = keys.agnesKey;

  const params = new URLSearchParams({ provider, query, type, category, sort });
  if (cursor) params.append('cursor', cursor);
  if (page) params.append('page', String(page));
  if (limit) params.append('limit', String(limit));
  if (architecture) params.append('architecture', architecture);

  const resp = await fetch(`/api/models?${params.toString()}`, { headers });
  
  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
    throw new Error(errorData.details || errorData.error || `Failed to fetch models (Status: ${resp.status})`);
  }
  
  return await resp.json();
};

export const fetchHuggingFaceModelInfo = async (modelId: string) => {
  const keys = getStoredApiKeys();
  const headers: Record<string, string> = {};
  if (keys.hfToken) headers['x-hf-token'] = keys.hfToken;

  const resp = await fetch(`/api/huggingface/model-info?modelId=${encodeURIComponent(modelId)}`, { headers });
  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
    throw new Error(errorData.details || errorData.error || `HF model query failed (${resp.status})`);
  }
  return await resp.json();
};

export const fetchTensorArtModelInfo = async (modelId: string) => {
  const keys = getStoredApiKeys();
  const headers: Record<string, string> = {};
  if (keys.tensorartKey) headers['x-tensorart-key'] = keys.tensorartKey;

  const resp = await fetch(`/api/tensorart/model-info?modelId=${encodeURIComponent(modelId)}`, { headers });
  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
    throw new Error(errorData.details || errorData.error || `Tensor.Art 模型详情获取失败 (${resp.status})`);
  }
  return await resp.json();
};

// ==========================================
// Cloud Server-Side Persistence APIs
// ==========================================
export interface CloudProjectSummary {
  id: string;
  name: string;
  description?: string;
  canvasMode: 'spatial' | 'graph';
  frameCount: number;
  nodeCount: number;
  thumbnail?: string;
  updatedAt: number;
  createdAt: number;
}

export async function cloudProjectRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${data.error || data.details || response.statusText}`);
  return data;
}
export const fetchCloudProjects = async (): Promise<CloudProjectSummary[]> => cloudProjectRequest('/api/cloud/projects');
export const loadCloudProject = async (id: string): Promise<any> => cloudProjectRequest(`/api/cloud/projects/${encodeURIComponent(id)}`);
export const saveCloudProject = async (projectData: any): Promise<{success: boolean; project?: any}> => cloudProjectRequest('/api/cloud/projects', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(projectData)});
export const deleteCloudProject = async (id: string): Promise<boolean> => {
  await cloudProjectRequest(`/api/cloud/projects/${encodeURIComponent(id)}`, {method: 'DELETE'}); return true;
};
export const cloneCloudProject = async (id: string): Promise<any> => cloudProjectRequest(`/api/cloud/projects/${encodeURIComponent(id)}/clone`, {method: 'POST'});

export const fetchCloudServerHealth = async (): Promise<{
  status: string;
  serverType: string;
  uptimeSeconds: number;
  projectsCount: number;
  historyCount: number;
  hasGeminiKey: boolean;
}> => {
  try {
    const resp = await fetch('/api/cloud/health');
    if (resp.ok) return await resp.json();
  } catch (e) {
    console.error('Health check error:', e);
  }
  return {
    status: 'offline',
    serverType: 'Local Mode',
    uptimeSeconds: 0,
    projectsCount: 0,
    historyCount: 0,
    hasGeminiKey: false,
  };
};

export const ADMIN_TOKEN_STORAGE_KEY = 'canvas_admin_token';

export const getStoredAdminToken = (): string => {
  try {
    return localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
};

export const saveStoredAdminToken = (token: string): void => {
  try {
    localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token.trim());
  } catch (e) {
    console.error('Error saving admin token:', e);
  }
};

export interface CloudSettingsResponse {
  ok: boolean;
  status: number;
  data?: Record<string, any>;
  error?: string;
}

export const fetchCloudServerSettings = async (token?: string): Promise<CloudSettingsResponse> => {
  const effectiveToken = (token !== undefined ? token : getStoredAdminToken()).trim();
  const headers: Record<string, string> = {};
  if (effectiveToken) {
    headers['Authorization'] = `Bearer ${effectiveToken}`;
  }

  try {
    const resp = await fetch('/api/cloud/settings', { headers });
    if (resp.ok) {
      const data = await resp.json();
      return { ok: true, status: resp.status, data };
    }
    const errJson = await resp.json().catch(() => ({}));
    return {
      ok: false,
      status: resp.status,
      error: errJson.error || `请求失败 [HTTP ${resp.status}]: ${resp.statusText}`,
    };
  } catch (e: any) {
    return {
      ok: false,
      status: 0,
      error: e.message || '网络连接异常',
    };
  }
};

export const saveCloudServerSettings = async (
  settings: Record<string, any>,
  token?: string
): Promise<CloudSettingsResponse> => {
  const effectiveToken = (token !== undefined ? token : getStoredAdminToken()).trim();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (effectiveToken) {
    headers['Authorization'] = `Bearer ${effectiveToken}`;
  }

  try {
    const resp = await fetch('/api/cloud/settings', {
      method: 'POST',
      headers,
      body: JSON.stringify(settings),
    });
    if (resp.ok) {
      const data = await resp.json();
      return { ok: true, status: resp.status, data: data.settings };
    }
    const errJson = await resp.json().catch(() => ({}));
    return {
      ok: false,
      status: resp.status,
      error: errJson.error || `保存失败 [HTTP ${resp.status}]: ${resp.statusText}`,
    };
  } catch (e: any) {
    return {
      ok: false,
      status: 0,
      error: e.message || '网络连接异常',
    };
  }
};

export const fetchKeyPoolStats = async (token?: string): Promise<Record<string, any>> => {
  const effectiveToken = (token !== undefined ? token : getStoredAdminToken()).trim();
  const headers: Record<string, string> = {};
  if (effectiveToken) {
    headers['Authorization'] = `Bearer ${effectiveToken}`;
  }
  const resp = await fetch('/api/cloud-keys/stats', { headers });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
  return resp.json();
};

export const updateKeyPoolStrategy = async (
  provider: string,
  strategy: 'round_robin' | 'failover' | 'latency_best',
  token?: string
): Promise<boolean> => {
  const effectiveToken = (token !== undefined ? token : getStoredAdminToken()).trim();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (effectiveToken) {
    headers['Authorization'] = `Bearer ${effectiveToken}`;
  }
  try {
    const resp = await fetch('/api/cloud-keys/strategy', {
      method: 'POST',
      headers,
      body: JSON.stringify({ provider, strategy }),
    });
    return resp.ok;
  } catch (e) {
    console.error('Update key pool strategy error:', e);
  }
  return false;
};

export const testSingleKey = async (provider: string, key: string, token?: string): Promise<{ status: string; latency?: number; message: string }> => {
  try {
    const effectiveToken = (token !== undefined ? token : getStoredAdminToken()).trim();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (effectiveToken) {
      headers['Authorization'] = `Bearer ${effectiveToken}`;
    }
    const resp = await fetch('/api/cloud-keys/test-single', {
      method: 'POST',
      headers,
      body: JSON.stringify({ provider, key }),
    });
    if (resp.ok) return await resp.json();
    const text = await resp.text().catch(() => '');
    return { status: 'invalid', message: `HTTP ${resp.status}: ${text}` };
  } catch (e: any) {
    return { status: 'invalid', message: e.message || '测试失败' };
  }
};

export const fetchCloudBalances = async (token?: string): Promise<Record<string, { status: string; detail: string; amount?: number | string }>> => {
  const effectiveToken = (token !== undefined ? token : getStoredAdminToken()).trim();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (effectiveToken) {
    headers['Authorization'] = `Bearer ${effectiveToken}`;
  }
    const resp = await fetch('/api/cloud-keys/balances', {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
    return resp.json();
};

