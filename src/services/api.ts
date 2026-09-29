import { ApiKeysState, CivitaiSearchResult, GenerationHistoryItem, ProviderId } from '../types/providers';

const API_KEYS_STORAGE_KEY = 'comfycanvas_api_keys';

export const DEFAULT_TEST_KEYS: ApiKeysState = {
  civitaiKey: '',
  falKey: '',
  agnesKey: '',
  agnesBaseUrl: 'https://apihub.agnes-ai.com/v1',
  sensenovaKey: '',
  sensenovaBaseUrl: 'https://token.sensenova.cn/v1',
  hfToken: '',
  modelscopeToken: '',
  modelscopeAiToken: '',
  nanogptKey: '',
  geminiKey: '',
  tensorartKey: '',
};

export const getStoredApiKeys = (): ApiKeysState => {
  try {
    const raw = localStorage.getItem(API_KEYS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Merge with defaults so newly provided test keys are present if field was empty
      return {
        civitaiKey: parsed.civitaiKey || DEFAULT_TEST_KEYS.civitaiKey,
        falKey: parsed.falKey || DEFAULT_TEST_KEYS.falKey,
        agnesKey: parsed.agnesKey || DEFAULT_TEST_KEYS.agnesKey,
        agnesBaseUrl: parsed.agnesBaseUrl || DEFAULT_TEST_KEYS.agnesBaseUrl,
        sensenovaKey: parsed.sensenovaKey || DEFAULT_TEST_KEYS.sensenovaKey,
        sensenovaBaseUrl: parsed.sensenovaBaseUrl || DEFAULT_TEST_KEYS.sensenovaBaseUrl,
        hfToken: parsed.hfToken || DEFAULT_TEST_KEYS.hfToken,
        modelscopeToken: parsed.modelscopeToken || DEFAULT_TEST_KEYS.modelscopeToken,
        modelscopeAiToken: parsed.modelscopeAiToken || DEFAULT_TEST_KEYS.modelscopeAiToken,
        nanogptKey: parsed.nanogptKey || DEFAULT_TEST_KEYS.nanogptKey,
        geminiKey: parsed.geminiKey || '',
        tensorartKey: parsed.tensorartKey || DEFAULT_TEST_KEYS.tensorartKey,
      };
    }
  } catch (e) {
    console.error('Error reading stored keys:', e);
  }
  return { ...DEFAULT_TEST_KEYS };
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
  key: string
): Promise<{ status: 'ok' | 'error'; latency?: number; message?: string }> => {
  try {
    const resp = await fetch('/api/test-provider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, key }),
    });
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
  model?: string;
  width?: number;
  height?: number;
  steps?: number;
  guidance?: number;
  seed?: number;
  loras?: Array<{ name: string; strength: number; civitaiId?: string; triggers?: string }>;
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
  negative_prompt?: string;
  model?: string;
  size?: string;
  steps?: number;
  guidance_scale?: number;
  seed?: number;
  loras?: Array<{ name: string; strength: number; civitaiId?: string; triggers?: string }>;
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

export const refinePromptWithGemini = async (prompt: string, style?: string, loras: any[] = []) => {
  const keys = getStoredApiKeys();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (keys.geminiKey) headers['x-gemini-key'] = keys.geminiKey;

  const resp = await fetch('/api/gemini/refine-prompt', {
    method: 'POST',
    headers,
    body: JSON.stringify({ prompt, style, loras }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Prompt refiner failed' }));
    throw new Error(err.error || 'Failed to refine prompt');
  }

  const data = await resp.json();
  return data.refinedPrompt;
};

export const fetchHistory = async (): Promise<GenerationHistoryItem[]> => {
  try {
    const resp = await fetch('/api/history');
    if (resp.ok) return await resp.json();
  } catch (e) {
    console.error('History fetch error:', e);
  }
  return [];
};

export const saveToHistory = async (item: Partial<GenerationHistoryItem>) => {
  try {
    const resp = await fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    if (resp.ok) return await resp.json();
  } catch (e) {
    console.error('History save error:', e);
  }
};

export const deleteHistoryItem = async (id: string) => {
  try {
    const encodedId = encodeURIComponent(id);
    const resp = await fetch(`/api/history/${encodedId}`, { method: 'DELETE' });
    return resp.ok;
  } catch (e) {
    console.error('History delete error:', e);
  }
  return false;
};

export const deleteHistoryBatch = async (ids: string[]) => {
  try {
    const resp = await fetch('/api/history/delete-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    return resp.ok;
  } catch (e) {
    console.error('History batch delete error:', e);
  }
  return false;
};

export const clearHistory = async () => {
  try {
    const resp = await fetch('/api/history', { method: 'DELETE' });
    return resp.ok;
  } catch (e) {
    console.error('History clear error:', e);
  }
  return false;
};

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

export const fetchCloudProjects = async (): Promise<CloudProjectSummary[]> => {
  try {
    const resp = await fetch('/api/cloud/projects');
    if (resp.ok) return await resp.json();
  } catch (e) {
    console.error('Fetch cloud projects error:', e);
  }
  return [];
};

export const loadCloudProject = async (id: string): Promise<any> => {
  try {
    const resp = await fetch(`/api/cloud/projects/${id}`);
    if (resp.ok) return await resp.json();
  } catch (e) {
    console.error(`Load cloud project ${id} error:`, e);
  }
  return null;
};

export const saveCloudProject = async (projectData: any): Promise<{ success: boolean; project?: any }> => {
  try {
    const resp = await fetch('/api/cloud/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(projectData),
    });
    if (resp.ok) return await resp.json();
  } catch (e) {
    console.error('Save cloud project error:', e);
  }
  return { success: false };
};

export const deleteCloudProject = async (id: string): Promise<boolean> => {
  try {
    const resp = await fetch(`/api/cloud/projects/${id}`, { method: 'DELETE' });
    if (resp.ok) return true;
  } catch (e) {
    console.error(`Delete cloud project ${id} error:`, e);
  }
  return false;
};

export const cloneCloudProject = async (id: string): Promise<any> => {
  try {
    const resp = await fetch(`/api/cloud/projects/${id}/clone`, { method: 'POST' });
    if (resp.ok) return await resp.json();
  } catch (e) {
    console.error(`Clone cloud project ${id} error:`, e);
  }
  return null;
};

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

export const fetchKeyPoolStats = async (): Promise<Record<string, any>> => {
  try {
    const resp = await fetch('/api/cloud-keys/stats');
    if (resp.ok) return await resp.json();
  } catch (e) {
    console.error('Fetch key pool stats error:', e);
  }
  return {};
};

export const updateKeyPoolStrategy = async (provider: string, strategy: 'round_robin' | 'failover' | 'latency_best'): Promise<boolean> => {
  try {
    const resp = await fetch('/api/cloud-keys/strategy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, strategy }),
    });
    return resp.ok;
  } catch (e) {
    console.error('Update key pool strategy error:', e);
  }
  return false;
};

export const testSingleKey = async (provider: string, key: string): Promise<{ status: string; latency?: number; message: string }> => {
  try {
    const resp = await fetch('/api/cloud-keys/test-single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, key }),
    });
    if (resp.ok) return await resp.json();
    return { status: 'invalid', message: `HTTP ${resp.status}` };
  } catch (e: any) {
    return { status: 'invalid', message: e.message || '测试失败' };
  }
};

export const fetchCloudBalances = async (): Promise<Record<string, { status: string; detail: string; amount?: number | string }>> => {
  try {
    const resp = await fetch('/api/cloud-keys/balances');
    if (resp.ok) return await resp.json();
  } catch (e) {
    console.error('Fetch cloud balances error:', e);
  }
  return {};
};



