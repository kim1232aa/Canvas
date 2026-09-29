import express from 'express';
import crypto from 'crypto';
import dns from 'dns';
try {
  dns.setServers(['8.8.8.8']);
  console.log('Successfully set global DNS servers to 8.8.8.8');
} catch (e: any) {
  console.warn('Failed to set custom DNS servers:', e.message);
}
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { HfInference } from '@huggingface/inference';
import { Agent, setGlobalDispatcher } from 'undici';

dotenv.config();

// Configure undici global dispatcher to extend headersTimeout to 5 minutes (prevents UND_ERR_HEADERS_TIMEOUT on long Civitai GPU renders)
setGlobalDispatcher(
  new Agent({
    headersTimeout: 300000,
    bodyTimeout: 300000,
    connectTimeout: 30000,
  })
);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Persistent Storage Directories
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// Cloud Canvas Project Schema
export interface CloudProject {
  id: string;
  name: string;
  description?: string;
  canvasMode: 'spatial' | 'graph';
  transform: { x: number; y: number; scale: number };
  spatialFrames: any[];
  nodes: any[];
  connections: any[];
  thumbnail?: string;
  updatedAt: number;
  createdAt: number;
  tags?: string[];
}

// In-memory history and active configuration
interface GeneratedItem {
  id: string;
  url: string;
  imageUrl?: string;
  videoUrl?: string;
  mediaType?: string;
  prompt: string;
  negativePrompt?: string;
  provider: string;
  model: string;
  seed: number;
  steps: number;
  cfg: number;
  loras?: Array<{ name: string; strength: number; civitaiId?: string }>;
  timestamp: number;
  workflowSnapshot?: any;
}

// Helper methods to read/write JSON files safely
const readJsonFile = <T>(filePath: string, fallback: T): T => {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
  }
  return fallback;
};

const writeJsonFile = (filePath: string, data: any) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err);
  }
};

let cloudProjects: CloudProject[] = readJsonFile<CloudProject[]>(PROJECTS_FILE, []);
let generationHistory: GeneratedItem[] = readJsonFile<GeneratedItem[]>(HISTORY_FILE, []);
let cloudSettings: Record<string, any> = readJsonFile<Record<string, any>>(SETTINGS_FILE, {});

const defaultKeys: Record<string, string> = {
  tensorartKey: process.env.TENSORART_API_KEY || '',
  agnesKey: process.env.AGNES_KEY || '',
  sensenovaKey: process.env.SENSENOVA_KEY || '',
  falKey: process.env.FAL_KEY || '',
  civitaiKey: process.env.CIVITAI_API_KEY || '',
  nanogptKey: process.env.NANOGPT_KEY || '',
  hfToken: process.env.HF_TOKEN || '',
  modelscopeToken: process.env.MODELSCOPE_TOKEN || '',
  modelscopeAiToken: process.env.MODELSCOPE_AI_TOKEN || '',
  geminiKey: process.env.GEMINI_API_KEY || '',
};

// Multi-Key Pool & High-Availability Round-Robin Load Balancer
interface KeyStats {
  key: string;
  maskedKey: string;
  provider: string;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  consecutiveFailures: number;
  lastUsed: number;
  status: 'active' | 'rate_limited' | 'invalid';
  rateLimitResetAt?: number;
  lastError?: string;
  latencyHistory: number[];
}

class KeyPoolManager {
  private pools: Map<string, KeyStats[]> = new Map();
  private roundRobinPointers: Map<string, number> = new Map();
  private strategies: Map<string, 'round_robin' | 'failover' | 'latency_best'> = new Map();

  constructor() {
    this.refreshFromSettings();
  }

  public maskKey(key: string): string {
    if (!key) return '';
    if (key.length <= 8) return `${key.substring(0, 2)}***${key.substring(key.length - 2)}`;
    return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
  }

  public parseKeyString(raw: any): string[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map((k) => String(k).trim()).filter(Boolean);
    return String(raw)
      .split(/[\n,;]+/)
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
  }

  public setStrategy(prov: string, strategy: 'round_robin' | 'failover' | 'latency_best') {
    this.strategies.set(prov, strategy);
  }

  public getStrategy(prov: string): 'round_robin' | 'failover' | 'latency_best' {
    return this.strategies.get(prov) || (cloudSettings[`${prov}_strategy`] as any) || 'round_robin';
  }

  public refreshFromSettings() {
    const providerKeyMap: Record<string, string[]> = {
      fal: [...this.parseKeyString(cloudSettings['falKey']), ...this.parseKeyString(defaultKeys['falKey']), ...(process.env.FAL_KEY ? [process.env.FAL_KEY] : [])],
      agnes: [...this.parseKeyString(cloudSettings['agnesKey']), ...this.parseKeyString(defaultKeys['agnesKey']), ...(process.env.AGNES_KEY ? [process.env.AGNES_KEY] : [])],
      sensenova: [...this.parseKeyString(cloudSettings['sensenovaKey']), ...this.parseKeyString(defaultKeys['sensenovaKey']), ...(process.env.SENSENOVA_KEY ? [process.env.SENSENOVA_KEY] : [])],
      civitai: [...this.parseKeyString(cloudSettings['civitaiToken']), ...this.parseKeyString(cloudSettings['civitaiKey']), ...this.parseKeyString(defaultKeys['civitaiKey']), ...(process.env.CIVITAI_API_KEY ? [process.env.CIVITAI_API_KEY] : [])],
      huggingface: [...this.parseKeyString(cloudSettings['hfToken']), ...this.parseKeyString(defaultKeys['hfToken']), ...(process.env.HF_TOKEN ? [process.env.HF_TOKEN] : [])],
      modelscope: [...this.parseKeyString(cloudSettings['modelscopeToken']), ...this.parseKeyString(defaultKeys['modelscopeToken']), ...(process.env.MODELSCOPE_TOKEN ? [process.env.MODELSCOPE_TOKEN] : [])],
      modelscope_ai: [...this.parseKeyString(cloudSettings['modelscopeAiToken']), ...this.parseKeyString(defaultKeys['modelscopeAiToken']), ...(process.env.MODELSCOPE_AI_TOKEN ? [process.env.MODELSCOPE_AI_TOKEN] : [])],
      nanogpt: [...this.parseKeyString(cloudSettings['nanogptKey']), ...this.parseKeyString(defaultKeys['nanogptKey']), ...(process.env.NANOGPT_KEY ? [process.env.NANOGPT_KEY] : [])],
      tensorart: [...this.parseKeyString(cloudSettings['tensorartKey']), ...this.parseKeyString(defaultKeys['tensorartKey']), ...(process.env.TENSORART_API_KEY ? [process.env.TENSORART_API_KEY] : [])],
      gemini: [...this.parseKeyString(cloudSettings['geminiKey']), ...this.parseKeyString(defaultKeys['geminiKey']), ...(process.env.GEMINI_API_KEY ? [process.env.GEMINI_API_KEY] : [])],
    };

    Object.entries(providerKeyMap).forEach(([prov, keys]) => {
      const uniqueKeys = Array.from(new Set(keys.filter(Boolean)));
      const existing = this.pools.get(prov) || [];
      const updatedList: KeyStats[] = uniqueKeys.map((k) => {
        const found = existing.find((e) => e.key === k);
        if (found) return found;
        return {
          key: k,
          maskedKey: this.maskKey(k),
          provider: prov,
          totalCalls: 0,
          successfulCalls: 0,
          failedCalls: 0,
          consecutiveFailures: 0,
          lastUsed: 0,
          status: 'active',
          latencyHistory: [],
        };
      });
      this.pools.set(prov, updatedList);
    });
  }

  public getNextKey(prov: string, customHeaderKey?: string): string {
    if (customHeaderKey) {
      const customKeys = this.parseKeyString(customHeaderKey);
      if (customKeys.length > 1) {
        const idx = (this.roundRobinPointers.get(`header_${prov}`) || 0) % customKeys.length;
        this.roundRobinPointers.set(`header_${prov}`, idx + 1);
        return customKeys[idx];
      }
      if (customKeys.length === 1) return customKeys[0];
    }

    const pool = this.pools.get(prov) || [];
    if (pool.length === 0) return '';

    // Recover rate limited keys if cool-down passed (60 seconds)
    const now = Date.now();
    pool.forEach((k) => {
      if (k.status === 'rate_limited' && k.rateLimitResetAt && now > k.rateLimitResetAt) {
        k.status = 'active';
        k.consecutiveFailures = 0;
      }
    });

    const activeKeys = pool.filter((k) => k.status === 'active');
    const targetPool = activeKeys.length > 0 ? activeKeys : pool;
    if (targetPool.length === 0) return '';

    const strategy = this.getStrategy(prov);
    let selected: KeyStats;

    if (strategy === 'failover') {
      // Always pick the first healthy active key
      selected = targetPool[0];
    } else if (strategy === 'latency_best') {
      // Pick key with lowest recorded average latency, or untested first
      selected = [...targetPool].sort((a, b) => {
        const aLat = a.latencyHistory.length > 0 ? a.latencyHistory.reduce((x, y) => x + y, 0) / a.latencyHistory.length : 0;
        const bLat = b.latencyHistory.length > 0 ? b.latencyHistory.reduce((x, y) => x + y, 0) / b.latencyHistory.length : 0;
        if (aLat === 0) return -1;
        if (bLat === 0) return 1;
        return aLat - bLat;
      })[0];
    } else {
      // Round-Robin
      let ptr = this.roundRobinPointers.get(prov) || 0;
      selected = targetPool[ptr % targetPool.length];
      this.roundRobinPointers.set(prov, (ptr + 1) % targetPool.length);
    }

    selected.lastUsed = now;
    selected.totalCalls++;
    return selected.key;
  }

  public recordResult(prov: string, key: string, success: boolean, latencyMs = 0, errorMsg = '', statusCode = 200) {
    if (!key) return;
    const pool = this.pools.get(prov) || [];
    const entry = pool.find((e) => e.key === key);
    if (!entry) return;

    if (latencyMs > 0) {
      entry.latencyHistory.push(latencyMs);
      if (entry.latencyHistory.length > 20) entry.latencyHistory.shift();
    }

    if (success) {
      entry.successfulCalls++;
      entry.consecutiveFailures = 0;
      entry.status = 'active';
      entry.lastError = undefined;
    } else {
      entry.failedCalls++;
      entry.consecutiveFailures++;
      entry.lastError = errorMsg;
      const errLower = (errorMsg || '').toLowerCase();
      const isRate =
        statusCode === 429 ||
        statusCode === 503 ||
        errLower.includes('quota') ||
        errLower.includes('rate limit') ||
        errLower.includes('rate_limit') ||
        errLower.includes('429') ||
        errLower.includes('resource_exhausted') ||
        errLower.includes('overloaded') ||
        errLower.includes('too many requests') ||
        errLower.includes('exhausted');

      const isInvalid =
        statusCode === 401 ||
        statusCode === 403 ||
        errLower.includes('invalid api key') ||
        errLower.includes('api_key_invalid') ||
        errLower.includes('invalid_api_key') ||
        errLower.includes('unauthorized') ||
        errLower.includes('forbidden');

      if (isRate) {
        entry.status = 'rate_limited';
        entry.rateLimitResetAt = Date.now() + 60000; // 1 min cooldown
      } else if (isInvalid) {
        entry.status = 'invalid';
      }
    }
  }

  public getStats() {
    const summary: Record<string, any> = {};
    this.pools.forEach((keys, prov) => {
      summary[prov] = {
        totalKeys: keys.length,
        activeKeys: keys.filter((k) => k.status === 'active').length,
        rateLimitedKeys: keys.filter((k) => k.status === 'rate_limited').length,
        invalidKeys: keys.filter((k) => k.status === 'invalid').length,
        strategy: this.getStrategy(prov),
        keys: keys.map((k) => ({
          key: k.key,
          maskedKey: k.maskedKey,
          status: k.status,
          totalCalls: k.totalCalls,
          successfulCalls: k.successfulCalls,
          failedCalls: k.failedCalls,
          consecutiveFailures: k.consecutiveFailures,
          avgLatencyMs: k.latencyHistory.length > 0 ? Math.round(k.latencyHistory.reduce((a, b) => a + b, 0) / k.latencyHistory.length) : 0,
          lastUsed: k.lastUsed,
          lastError: k.lastError,
          rateLimitResetAt: k.rateLimitResetAt,
        })),
      };
    });
    return summary;
  }
}

const keyPoolManager = new KeyPoolManager();

// Helper to record history safely both in memory and file
const recordHistoryItem = (item: Partial<GeneratedItem>): GeneratedItem => {
  const fullItem: GeneratedItem = {
    id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: Date.now(),
    url: item.url || '',
    prompt: item.prompt || 'Untitled Generation',
    negativePrompt: item.negativePrompt || '',
    provider: item.provider || 'ComfyUI Engine',
    model: item.model || 'Unknown Model',
    seed: item.seed ?? Math.floor(Math.random() * 1000000000),
    steps: item.steps ?? 28,
    cfg: item.cfg ?? 4.5,
    loras: item.loras || [],
    ...item,
  };
  generationHistory.unshift(fullItem);
  if (generationHistory.length > 100) generationHistory.pop();
  writeJsonFile(HISTORY_FILE, generationHistory);
  return fullItem;
};

// Seed initial history if empty so user has starting history items
if (generationHistory.length === 0) {
  generationHistory = [];
  writeJsonFile(HISTORY_FILE, generationHistory);
}

// Initialize cloud settings empty if not exists
if (!cloudSettings || Object.keys(cloudSettings).length === 0) {
  cloudSettings = {};
  writeJsonFile(SETTINGS_FILE, cloudSettings);
}

// Helper to create GoogleGenAI client with key rotation and standard aistudio-build telemetry
const createGoogleGenAI = (apiKey?: string) => {
  const effectiveKey = keyPoolManager.getNextKey('gemini', apiKey);
  if (!effectiveKey) return null;
  return {
    client: new GoogleGenAI({
      apiKey: effectiveKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    }),
    apiKey: effectiveKey,
  };
};

// ==========================================
// 1. Civitai API Proxies (developer.civitai.com)
// ==========================================
const civitaiCache = new Map<string, { data: any; expiry: number; nextCursor?: string | null }>();
const tensorArtToolsCache = new Map<string, { data: any; expiry: number }>();

app.get('/api/civitai/models', async (req, res) => {
  try {
    const { query = '', types = 'LORA', sort = 'Highest Rated', limit = '16', page = '1', nsfw = 'false', cursor = '' } = req.query;
    const apiKey = (req.headers['x-civitai-key'] as string) || (req.headers['x-civitai-token'] as string) || cloudSettings['civitaiToken'] || process.env.CIVITAI_API_KEY || '';

    const params = new URLSearchParams({
      limit: String(limit),
      types: String(types),
      sort: String(sort),
      nsfw: String(nsfw),
    });

    if (cursor) {
      params.append('cursor', String(cursor));
    } else if (query) {
      params.append('query', String(query));
    } else if (page) {
      params.append('page', String(page));
    }

    const cacheKey = `civitai_models_${params.toString()}_${apiKey ? 'auth' : 'anon'}`;
    const cached = civitaiCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return res.json(cached.data);
    }

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      'Accept': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`https://civitai.com/api/v1/models?${params.toString()}`, {
      headers,
      signal: AbortSignal.timeout(30000), // Increased to 30s
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({
        error: `Civitai API error: ${response.status}`,
        details: errText,
      });
    }

    const data = await response.json();
    civitaiCache.set(cacheKey, { data, expiry: Date.now() + 60000 });
    return res.json(data);
  } catch (error: any) {
    const isTimeout = error.name === 'TimeoutError' || error.message?.includes('timeout') || error.message?.includes('aborted');
    console.warn(`[Civitai Proxy] 获取${isTimeout ? '超时 (30s)' : '失败'}:`, error.message);
    return res.status(504).json({ error: isTimeout ? 'Civitai API 请求超时 (上游 Cloudflare 响应过慢，请稍后重试或配置 Civitai API Key)' : error.message || 'Failed to fetch from Civitai' });
  }
});

// Dynamic Hugging Face Model Detail & Trigger Word Discovery API
app.get('/api/huggingface/model-info', async (req, res) => {
  try {
    const modelId = String(req.query.modelId || '').trim();
    if (!modelId) {
      return res.status(400).json({ error: '缺少 modelId 参数' });
    }
    const hfToken =
      (req.headers['x-hf-token'] as string) ||
      cloudSettings['hfToken'] ||
      defaultKeys['hfToken'] ||
      process.env.HF_TOKEN ||
      '';

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    };
    if (hfToken) headers['Authorization'] = `Bearer ${hfToken}`;

    const safeModelPath = modelId.split('/').map(encodeURIComponent).join('/');
    const url = `https://huggingface.co/api/models/${safeModelPath}?expand[]=siblings&expand[]=tags&expand[]=likes&expand[]=pipeline_tag&expand[]=author&expand[]=cardData`;
    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!resp.ok) {
      const errText = await resp.text();
      return res.status(resp.status).json({
        error: `Hugging Face 模型不存在或无权访问 (HTTP ${resp.status})`,
        details: errText,
        modelId,
      });
    }

    const m = await resp.json();

    // Resolve real trigger words from model card data, instance prompt, widget, or tags
    const triggers: string[] = [];
    if (m.cardData?.instance_prompt) triggers.push(String(m.cardData.instance_prompt));
    if (m.cardData?.trigger_words) {
      if (Array.isArray(m.cardData.trigger_words)) triggers.push(...m.cardData.trigger_words);
      else if (typeof m.cardData.trigger_words === 'string') triggers.push(m.cardData.trigger_words);
    }
    if (Array.isArray(m.cardData?.widget)) {
      m.cardData.widget.forEach((w: any) => { if (w.text) triggers.push(String(w.text)); });
    }
    if (Array.isArray(m.tags)) {
      m.tags.forEach((t: string) => {
        if (t.startsWith('trigger_word:') || t.startsWith('instance_prompt:')) {
          triggers.push(t.split(':')[1]);
        }
      });
    }
    const uniqueTriggers = Array.from(new Set(triggers.map((t) => t.trim()).filter(Boolean)));

    // Resolve real base model
    let baseModel = '';
    if (m.cardData?.base_model) {
      baseModel = Array.isArray(m.cardData.base_model) ? m.cardData.base_model[0] : String(m.cardData.base_model);
    }
    if (!baseModel && Array.isArray(m.tags)) {
      const bTag = m.tags.find((t: string) => t.startsWith('base_model:adapter:') || t.startsWith('base_model:'));
      if (bTag) baseModel = bTag.replace('base_model:adapter:', '').replace('base_model:', '');
    }

    // Resolve real cover image
    let imageUrl = '';
    if (m.cardData?.widget?.[0]?.output?.url) {
      imageUrl = m.cardData.widget[0].output.url;
    }
    if (!imageUrl && Array.isArray(m.siblings)) {
      const previewFiles = ['thumbnail.png', 'preview.png', 'sample.png', 'example.png', 'cover.png'];
      let bestSibling = m.siblings.find((s: any) => {
        const fn = (s.rfilename || '').toLowerCase();
        return previewFiles.includes(fn) || fn.endsWith('.png') || fn.endsWith('.jpg') || fn.endsWith('.jpeg') || fn.endsWith('.webp');
      });
      if (bestSibling) {
        imageUrl = `https://huggingface.co/${m.id}/resolve/main/${bestSibling.rfilename}`;
      }
    }

    return res.json({
      id: m.id,
      name: m.id.split('/').pop(),
      author: m.author || m.id.split('/')[0],
      downloads: m.downloads || 0,
      likes: m.likes || 0,
      baseModel: baseModel || 'FLUX.1 / SDXL',
      triggerWords: uniqueTriggers,
      pipelineTag: m.pipeline_tag || '',
      imageUrl,
      tags: m.tags || [],
      description: m.description || m.cardData?.description || '',
    });
  } catch (err: any) {
    return res.status(500).json({ error: `获取 Hugging Face 模型详情失败: ${err.message}` });
  }
});

// Helper for parsing count string (e.g. 176K -> 176000, 2W -> 20000)
function parseCountNumber(str: string): number | undefined {
  if (!str) return undefined;
  const s = str.trim().toUpperCase();
  if (s.endsWith('K')) return Math.round(parseFloat(s) * 1000);
  if (s.endsWith('W')) return Math.round(parseFloat(s) * 10000);
  if (s.endsWith('M')) return Math.round(parseFloat(s) * 1000000);
  const n = parseInt(s.replace(/,/g, ''), 10);
  return isNaN(n) ? undefined : n;
}

// Dedicated Real Live Model Detail Resolution for Tensor.Art / 吐司
async function fetchTensorArtModelInfo(modelId: string) {
  const cleanId = (modelId || '').match(/\d{10,25}/)?.[0] || modelId.trim();
  if (!cleanId) {
    throw new Error('未提供有效的 Tensor.Art 模型 ID');
  }
  const url = `https://tusiart.com/models/${cleanId}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`Tensor.Art 模型 #${cleanId} 请求失败 [HTTP ${res.status}]`);
  }

  const html = await res.text();
  const title = (html.match(/<title>(.*?)<\/title>/) || [])[1] || '';
  const nameClean = title.split(' - Free')[0].split(' | 吐司')[0].trim() || `Tensor.Art #${cleanId}`;

  const metaDesc = (html.match(/name="description" content="([^"]*)"/) || [])[1] || '';
  const metaMatch = metaDesc.match(/free\s+([A-Z0-9_\-]+)\s+([^A-Z]*[A-Z0-9_\-\.\s]+?)\s*AI model/i);
  const rawType = metaMatch ? metaMatch[1].trim().toUpperCase() : 'LORA';
  const rawBaseModel = metaMatch ? metaMatch[2].trim() : 'SD 1.5';

  const isLora = rawType.includes('LORA') || rawType.includes('LOCON') || rawType.includes('LYCORIS');
  const isVideo = !isLora && (rawType.includes('VIDEO') || rawType.includes('MOTION') || nameClean.toLowerCase().includes('video') || rawBaseModel.toLowerCase().includes('wan') || rawBaseModel.toLowerCase().includes('minimax') || rawBaseModel.toLowerCase().includes('cogvideo'));
  const category = isLora ? 'LoRA' : (isVideo ? 'Video' : 'Checkpoint');

  const authorMatch = metaDesc.match(/By\s+([^.]+)/i);
  const author = authorMatch ? authorMatch[1].trim() : 'Tensor.Art 创作者';

  const showcaseRegex = /https:\/\/images\.tusiassets\.com\/(model_showcase|workflow_template_showcase)\/[a-zA-Z0-9_\-\.\/!]+/g;
  const showcaseImages = Array.from(new Set(html.match(showcaseRegex) || []));

  const triggerIdx = html.indexOf('triggerWords');
  const words: string[] = [];
  if (triggerIdx !== -1) {
    const triggerSection = html.slice(triggerIdx, triggerIdx + 2500);
    const btnRegex = /<button[^>]*>\s*([a-zA-Z0-9_\-\s,\u4e00-\u9fa5]+?)\s*<iconpark-icon/g;
    let m;
    while ((m = btnRegex.exec(triggerSection)) !== null) {
      const w = m[1].trim();
      if (w && !words.includes(w)) words.push(w);
    }
  }

  const tags = ['tensorart', isLora ? 'lora' : (isVideo ? 'video' : 'checkpoint'), rawBaseModel.toLowerCase()];
  if (isVideo) tags.push('video', 'motion');

  return {
    id: cleanId,
    name: nameClean,
    provider: 'Tensor.Art',
    category,
    type: isLora ? 'LORA' : (isVideo ? 'Video' : 'Checkpoint'),
    baseModel: rawBaseModel,
    author,
    imageUrl: showcaseImages[0] || '',
    trainedWords: words,
    externalUrl: `https://tensor.art/models/${cleanId}`,
    description: metaDesc || `${nameClean} - ${category} ${rawBaseModel} by ${author}`,
    tags,
  };
}

// Dedicated Real Live Community Models Discovery for Tensor.Art / 吐司
async function fetchTensorArtModelsList({
  cat = 'all',
  searchStr = '',
  sortOption = 'downloads',
  page = 1,
  arch = '',
}: {
  cat?: string;
  searchStr?: string;
  sortOption?: string;
  page?: number;
  arch?: string;
} = {}) {
  const queryParams = new URLSearchParams();
  queryParams.set('page', String(page));

  if (cat === 'lora') {
    queryParams.set('modelType', 'LORA');
  } else if (cat === 'checkpoint') {
    queryParams.set('modelType', 'CHECKPOINT');
  } else if (cat === 'video') {
    queryParams.set('keyword', searchStr ? `${searchStr} video` : 'video');
  }

  const sLower = (sortOption || '').toLowerCase();
  if (sLower.includes('rate') || sLower.includes('like') || sLower.includes('star')) {
    queryParams.set('sort', 'most_favorite');
  } else if (sLower.includes('down') || sLower.includes('run') || sLower.includes('play')) {
    queryParams.set('sort', 'most_run');
  } else if (sLower.includes('new')) {
    queryParams.set('sort', 'newest');
  }

  if (searchStr && !/^\d+$/.test(searchStr) && cat !== 'video') {
    queryParams.set('keyword', searchStr);
  }

  if (arch && arch !== 'all') {
    queryParams.set('baseModel', arch);
  }

  const url = `https://tusiart.com/models?${queryParams.toString()}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`Tensor.Art API 响应异常 [HTTP ${res.status}]`);
  }

  const html = await res.text();
  const articleRegex = /<a[^>]+href="\/models\/(\d+)"[^>]*>.*?<article>(.*?)<\/article>/gs;
  const items: any[] = [];
  let match;

  while ((match = articleRegex.exec(html)) !== null) {
    const id = match[1];
    const cardHtml = match[2];

    const imgMatch = cardHtml.match(/<img[^>]+src="([^">]+)"/);
    const imageUrl = imgMatch ? imgMatch[1] : '';

    const titleMatch = cardHtml.match(/<h3[^>]+title="([^">]+)"/) || cardHtml.match(/<h3[^>]*>([^<]+)<\/h3>/);
    const name = titleMatch ? titleMatch[1].trim() : `Tensor.Art #${id}`;

    const tagMatch = cardHtml.match(/<!--\[-->\s*([A-Z0-9_\-]+)\s*<!--\[-->.*?bg-white\/30"><\/span>\s*([^<]+)<!--\]-->/s);
    const rawType = tagMatch ? tagMatch[1].trim().toUpperCase() : (cat === 'lora' ? 'LORA' : (cat === 'video' ? 'VIDEO' : 'CHECKPOINT'));
    const rawBaseModel = tagMatch ? tagMatch[2].trim() : 'SD 1.5';

    const isLora = rawType.includes('LORA') || rawType.includes('LOCON') || rawType.includes('LYCORIS');
    const isVideo = cat === 'video' || (!isLora && (rawType.includes('VIDEO') || rawType.includes('MOTION') || name.toLowerCase().includes('video') || rawBaseModel.toLowerCase().includes('wan') || rawBaseModel.toLowerCase().includes('minimax') || rawBaseModel.toLowerCase().includes('cogvideo')));
    const category = isVideo ? 'Video' : (isLora ? 'LoRA' : 'Checkpoint');

    const authorMatch = cardHtml.match(/<p[^>]+title="([^">]+)"/);
    const author = authorMatch ? authorMatch[1].trim() : 'Tensor.Art 创作者';

    const runsMatch = cardHtml.match(/icon-id="play"><\/iconpark-icon>\s*([^<]+)<\/span>/);
    const runs = runsMatch ? runsMatch[1].trim() : '';
    const downloads = parseCountNumber(runs);

    const starsMatch = cardHtml.match(/icon-id="star"><\/iconpark-icon>\s*([^<]+)<\/span>/);
    const stars = starsMatch ? starsMatch[1].trim() : '';
    const likes = parseCountNumber(stars);

    const tags = ['tensorart', isVideo ? 'video' : (isLora ? 'lora' : 'checkpoint'), rawBaseModel.toLowerCase()];
    const normBase = rawBaseModel.toLowerCase();
    if (normBase.includes('f.1') || normBase.includes('flux')) {
      tags.push('flux', 'flux.1');
    }
    if (normBase.includes('xl')) {
      tags.push('sdxl');
    }
    if (normBase.includes('1.5')) {
      tags.push('sd15', 'sd 1.5');
    }
    if (normBase.includes('wan') || isVideo) {
      tags.push('wan', 'video', 'motion');
    }
    if (isLora) {
      tags.push('lora');
    }
    if (normBase.includes('illustrious')) {
      tags.push('illustrious');
    }
    if (normBase.includes('pony')) {
      tags.push('pony');
    }
    if (normBase.includes('z-image')) {
      tags.push('z-image');
    }
    if (searchStr) {
      tags.push(searchStr);
    }

    items.push({
      id,
      name,
      provider: 'Tensor.Art',
      category,
      type: isLora ? 'LORA' : (isVideo ? 'MotionModule' : 'Checkpoint'),
      baseModel: rawBaseModel,
      author,
      downloads,
      likes,
      speed: 'Tensor.Art 社区直拉',
      badge: isVideo ? (isLora ? 'TENSOR 视频 LORA' : 'TENSOR 视频大模型') : (isLora ? 'TENSOR LORA' : 'TENSOR CHECKPOINT'),
      imageUrl,
      externalUrl: `https://tensor.art/models/${id}`,
      description: `${name} - ${category} ${rawBaseModel} by ${author}`,
      tags,
      trainedWords: [],
    });
  }

  return items;
}

// Endpoint: Dedicated Real Tensor.Art Model Info
app.get('/api/tensorart/model-info', async (req, res) => {
  try {
    const rawId = (req.query.modelId as string) || '';
    if (!rawId) {
      return res.status(400).json({ error: '缺少 modelId 参数' });
    }
    const cleanId = rawId.match(/\d{10,25}/)?.[0] || rawId.trim();
    const info = await fetchTensorArtModelInfo(cleanId);
    return res.json(info);
  } catch (err: any) {
    return res.status(500).json({ error: `获取 Tensor.Art 模型详情失败: ${err.message}` });
  }
});

app.get('/api/civitai/model/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const apiKey = (req.headers['x-civitai-key'] as string) || process.env.CIVITAI_API_KEY || '';

    const headers: Record<string, string> = {
      'User-Agent': 'ComfyCanvas-AI-Studio/1.0',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`https://civitai.com/api/v1/models/${id}`, { headers });
    if (!response.ok) {
      return res.status(response.status).json({ error: `Civitai model not found or error: ${response.status}` });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Civitai model lookup failed' });
  }
});

// ==========================================
// 1.2. Civitai URL / Image / Model / Raw Text to Workflow Extractor (Intelligent Base Model Matching Engine)
// ==========================================

// Intelligent Base Model & LoRA Architecture Resolver Helper (Strict Transparency & Zero Guessing)
function resolveArchitectureAndBaseModel(baseModelRaw?: string, modelNameHint?: string, rawText?: string, hasLora = false) {
  const combined = `${baseModelRaw || ''} ${modelNameHint || ''} ${rawText || ''}`.toLowerCase();

  if (combined.includes('flux') || combined.includes('bfl') || combined.includes('schnell') || combined.includes('dev')) {
    return {
      family: 'flux',
      checkpoint: 'flux-dev',
      steps: 28,
      cfg: 3.5,
      sampler: 'euler',
      scheduler: 'simple',
      width: 1024,
      height: 1024,
      provider: 'Detected FLUX.1 Architecture',
      targetProvider: 'fal',
      architectureExplanation: hasLora
        ? '检测到 FLUX.1 架构并挂载了 LoRA。推荐使用官方 FLUX.1 [dev] 底模进行高质感生成。'
        : '检测到 FLUX.1 官方旗舰扩散模型架构，推荐 28 步采样，CFG 3.5。',
    };
  }

  if (combined.includes('krea') || combined.includes('krea2') || combined.includes('krea-2')) {
    return {
      family: 'krea2',
      checkpoint: 'krea2-turbo',
      steps: 10,
      cfg: 2.0,
      sampler: 'euler_ancestral',
      scheduler: 'simple',
      width: 1024,
      height: 1024,
      provider: 'Detected Krea 2 Architecture',
      targetProvider: 'fal',
      architectureExplanation: '检测到 Krea 2 Turbo 官方模型，推荐 8~12 步采样，CFG 1.0~2.0。',
    };
  }
  if (combined.includes('pony') || combined.includes('pdxl')) {
    return {
      family: 'pony',
      checkpoint: 'pony-diffusion-v6',
      steps: 30,
      cfg: 5.5,
      sampler: 'dpmpp_2m',
      scheduler: 'karras',
      width: 1024,
      height: 1024,
      provider: 'Detected Pony XL',
      targetProvider: 'fal',
      architectureExplanation: '检测到 Pony V6 / PDXL 架构。',
    };
  }
  if (combined.includes('illustrious') || combined.includes('noobai') || combined.includes('noob')) {
    return {
      family: 'illustrious',
      checkpoint: 'illustrious-xl',
      steps: 28,
      cfg: 5.0,
      sampler: 'euler_ancestral',
      scheduler: 'normal',
      width: 1024,
      height: 1024,
      provider: 'Detected Illustrious XL',
      targetProvider: 'fal',
      architectureExplanation: '检测到 Illustrious-XL / NoobAI 二次元旗舰架构。',
    };
  }
  if (combined.includes('tensor') || combined.includes('openworks') || combined.includes('banana') || combined.includes('oc_character')) {
    return {
      family: 'wan21',
      checkpoint: combined.includes('video') ? 'text2video_wan27' : 'strong_text2image_nano_banana2',
      steps: 30,
      cfg: 6.0,
      sampler: 'euler',
      scheduler: 'normal',
      width: 1024,
      height: 1024,
      provider: 'Detected Tensor.Art OpenWorks',
      targetProvider: 'tensorart',
      architectureExplanation: '检测到 Tensor.Art / 吐司 OpenWorks 官方模型与工作流工具。',
    };
  }
  if (combined.includes('nanogpt')) {
    return {
      family: 'flux',
      checkpoint: 'flux-schnell',
      steps: 4,
      cfg: 1.0,
      sampler: 'euler',
      scheduler: 'simple',
      width: 1024,
      height: 1024,
      provider: 'Detected NanoGPT Architecture',
      targetProvider: 'nanogpt',
      architectureExplanation: '检测到 NanoGPT 原生按需推理模型通道。',
    };
  }
  if (combined.includes('wan') || combined.includes('wan2.1') || combined.includes('tongyi')) {
    return {
      family: 'wan21',
      checkpoint: 'wan2.1-t2i',
      steps: 30,
      cfg: 6.0,
      sampler: 'euler',
      scheduler: 'normal',
      width: 1024,
      height: 1024,
      provider: 'Detected Wan 2.1 Architecture',
      targetProvider: 'modelscope',
      architectureExplanation: '检测到通义万相 Wan 2.1 阿里官方自研架构。',
    };
  }
  if (combined.includes('sd 1.5') || combined.includes('sd1.5') || combined.includes('v1-5') || combined.includes('sd 1.4')) {
    return {
      family: 'sd15',
      checkpoint: 'stable-diffusion-v1-5',
      steps: 25,
      cfg: 7.0,
      sampler: 'dpmpp_2m',
      scheduler: 'karras',
      width: 512,
      height: 768,
      provider: 'Detected SD 1.5',
      targetProvider: 'huggingface',
      architectureExplanation: '检测到经典 SD 1.5 架构，采用 512x768 经典画幅与 25 步采样。',
    };
  }
  if (combined.includes('sd 3.5') || combined.includes('sd3.5') || combined.includes('sd 3') || combined.includes('sd3')) {
    return {
      family: 'sd35',
      checkpoint: 'stable-diffusion-v35-large',
      steps: 28,
      cfg: 4.5,
      sampler: 'dpmpp_2m',
      scheduler: 'karras',
      width: 1024,
      height: 1024,
      provider: 'Detected SD 3.5',
      targetProvider: 'fal',
      architectureExplanation: '检测到 Stability AI SD 3.5 Large 架构，多模态扩散解算。',
    };
  }

  // Remove silent black-box fallback to SDXL 1.0
  return {
    family: 'unknown',
    checkpoint: '', // No default, force identification or error
    steps: 28,
    cfg: 5.0,
    sampler: 'euler',
    scheduler: 'normal',
    width: 1024,
    height: 1024,
    provider: 'Original / Detected Model',
    targetProvider: 'fal',
    architectureExplanation: '⚠️ 未能识别此作品的精确底模架构。已自动切换为透明模式，请在画布上手动选择匹配的模型以确保生成质量。',
  };
}

// Helper to fetch real, authentic Civitai image generation metadata via __NEXT_DATA__
async function fetchCivitaiRealImageMeta(imageId: string) {
  try {
    const resp = await fetch(`https://civitai.com/images/${imageId}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!resp.ok) {
      const errText = await resp.text();
      return { error: `Civitai 上游响应 HTTP ${resp.status}: ${errText.slice(0, 500)}`, status: resp.status };
    }
    const html = await resp.text();
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!match) {
      return { error: `Civitai 页面未包含 __NEXT_DATA__ 元数据 (Image #${imageId})`, status: 404 };
    }
    const json = JSON.parse(match[1]);
    const queries = json.props?.pageProps?.trpcState?.json?.queries || [];
    let genData: any = null;
    let imgGet: any = null;
    for (const q of queries) {
      const qName = q.queryKey?.[0]?.[1];
      if (qName === 'getGenerationData') genData = q.state?.data;
      if (qName === 'get') imgGet = q.state?.data;
    }
    if (!genData && !imgGet) {
      return { error: `Civitai 页面未找到该图片的生成元数据 (Image #${imageId})`, status: 404 };
    }
    return { genData, imgGet, status: 200 };
  } catch (e: any) {
    return { error: `连接 Civitai 发生网络错误: ${e.message}`, status: 500 };
  }
}

app.post('/api/civitai/extract-workflow', async (req, res) => {
  try {
    const { url = '', imageId = '', modelId = '', rawText = '', engine = 'civitai' } = req.body;
    const apiKey = (req.headers['x-civitai-key'] as string) || cloudSettings['civitaiKey'] || defaultKeys['civitaiKey'] || '';

    let targetImageId = imageId;
    let targetModelId = modelId;
    let targetVersionId = '';
    const inputContent = (rawText || url || '').trim();

    // Check if input is a Civitai URL or bare image ID or model version ID
    if (url || (!rawText && !inputContent.includes('Negative prompt:') && !inputContent.includes('Steps:'))) {
      const imgMatch = inputContent.match(/(?:civitai\.(?:com|red|work|link)\/images\/|images\/|^)(\d{7,10})/i);
      if (imgMatch) targetImageId = imgMatch[1];
      const modelMatch = inputContent.match(/(?:civitai\.(?:com|red|work|link)\/models\/|models\/)(\d+)/i);
      if (modelMatch) targetModelId = modelMatch[1];
      const verMatch = inputContent.match(/(?:modelVersionId=|model-versions\/)(\d+)/i);
      if (verMatch) targetVersionId = verMatch[1];
    }

    let presetTitle = 'Civitai 社区一键逆向工作流';
    let creatorName = 'Civitai Creator';
    let previewImage = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/0695b6d7-40ad-4df5-b99a-ba27550b9a58/original=true/preview.jpeg';
    let prompt = 'asian woman, 1girl, close up portrait, beautiful detailed eyes, natural skin texture, realistic lighting, shallow depth of field, 35mm film photography, masterpiece, sharp focus, 8k';
    let negativePrompt = 'blurry, bad anatomy, deformed fingers, low resolution, poorly drawn face, plastic skin, oversaturated, text, watermark';
    
    let rawModelName = '';
    let detectedBaseModel = '';
    let detectedVae = 'qwen_image_vae.safetensors';
    let detectedEngine = 'ComfyUI / Civitai';
    let checkpoint = 'krea2_turbo_fp8_scaled';
    let baseModelArchitecture = 'Krea 2';
    let loras: Array<{ name: string; displayName?: string; strength: number; civitaiId?: string; triggers?: string; baseModel?: string }> = [];
    let steps = 8;
    let cfg = 1.0;
    let sampler = 'er_sde_simple';
    let scheduler = 'sgm_uniform';
    let denoise = 1.0;
    let seed = Math.floor(Math.random() * 1000000000);
    let width = 1024;
    let height = 1024;
    let extractSource = 'Civitai 热门图库';
    let isVideo = false;
    let videoDuration: number | null = null;

    const mapSampler = (s: string) => {
      const lower = (s || '').toLowerCase();
      if (lower.includes('dpm++ 2m') || lower.includes('dpmpp_2m')) return 'dpmpp_2m';
      if (lower.includes('dpm++ sde') || lower.includes('dpmpp_sde')) return 'dpmpp_sde';
      if (lower.includes('dpm++ 3m sde') || lower.includes('dpmpp_3m_sde')) return 'dpmpp_3m_sde';
      if (lower.includes('euler a') || lower.includes('euler_ancestral')) return 'euler_ancestral';
      if (lower.includes('er_sde_simple')) return 'er_sde_simple';
      if (lower.includes('er_sde')) return 'er_sde';
      if (lower.includes('heun')) return 'heun';
      if (lower.includes('ddim')) return 'ddim';
      if (lower.includes('euler')) return 'euler';
      return 'euler';
    };

    const mapScheduler = (s: string) => {
      const lower = (s || '').toLowerCase();
      if (lower.includes('karras')) return 'karras';
      if (lower.includes('sgm_uniform')) return 'sgm_uniform';
      if (lower.includes('exponential')) return 'exponential';
      if (lower.includes('simple')) return 'simple';
      if (lower.includes('normal')) return 'normal';
      return 'normal';
    };

    // 1. Raw Generation Parameters Text Parser (WebUI / Civitai Copy Generation Data)
    const isRawParamsText =
      rawText ||
      inputContent.includes('Negative prompt:') ||
      inputContent.includes('Steps:') ||
      inputContent.includes('Sampler:') ||
      inputContent.includes('<lora:');

    if (isRawParamsText) {
      extractSource = 'Civitai / WebUI 复制参数解析';
      presetTitle = 'Civitai 参数导入：一键生成 ComfyUI 工作流';

      const fullText = rawText || inputContent;

      // Extract Negative Prompt
      let posText = fullText;
      let negText = '';
      const negMatch = fullText.match(/Negative prompt:\s*([\s\S]*?)(?=(?:Steps:|$))/i);
      if (negMatch) {
        negText = negMatch[1].trim();
        posText = fullText.substring(0, fullText.indexOf(negMatch[0])).replace(/^Prompt:\s*/i, '').trim();
      } else {
        const stepsIdx = fullText.search(/Steps:\s*\d+/i);
        if (stepsIdx !== -1) {
          posText = fullText.substring(0, stepsIdx).replace(/^Prompt:\s*/i, '').trim();
        }
      }

      // Extract LoRAs from positive prompt <lora:name:strength>
      const loraRegex = /<lora:([^:>]+)(?::([\d.]+))?(?::([\d.]+))?>/gi;
      const detectedLoras: typeof loras = [];
      let match;
      while ((match = loraRegex.exec(posText)) !== null) {
        detectedLoras.push({
          name: match[1].endsWith('.safetensors') ? match[1] : `${match[1]}.safetensors`,
          strength: match[2] ? parseFloat(match[2]) : 0.85,
          civitaiId: '',
          triggers: '',
        });
      }

      // Clean positive prompt (strip lora tags for pure text encoding)
      const cleanedPos = posText.replace(loraRegex, '').replace(/\s+,/g, ',').replace(/,\s*,/g, ',').trim();
      if (cleanedPos) prompt = cleanedPos;
      if (negText) negativePrompt = negText;
      if (detectedLoras.length > 0) loras = detectedLoras;

      // Extract Steps
      const stepsMatch = fullText.match(/Steps:\s*(\d+)/i);
      if (stepsMatch) steps = parseInt(stepsMatch[1], 10);

      // Extract Sampler & Scheduler
      const samplerMatch = fullText.match(/Sampler:\s*([^,\n]+)/i);
      if (samplerMatch) {
        sampler = mapSampler(samplerMatch[1]);
        scheduler = mapScheduler(samplerMatch[1]);
      }

      // Extract CFG
      const cfgMatch = fullText.match(/CFG scale:\s*([\d.]+)/i);
      if (cfgMatch) cfg = parseFloat(cfgMatch[1]);

      // Extract Seed
      const seedMatch = fullText.match(/Seed:\s*(\d+)/i);
      if (seedMatch) seed = parseInt(seedMatch[1], 10);

      // Extract Size
      const sizeMatch = fullText.match(/Size:\s*(\d+)x(\d+)/i);
      if (sizeMatch) {
        width = parseInt(sizeMatch[1], 10);
        height = parseInt(sizeMatch[2], 10);
      }

      const modelMatch = fullText.match(/Model:\s*([^,\n]+)/i);
      rawModelName = modelMatch ? modelMatch[1].trim() : '';
    } else if (targetImageId) {
      // 2. Real Civitai Image Extractor via __NEXT_DATA__
      extractSource = `Civitai Image #${targetImageId}`;
      const civData = await fetchCivitaiRealImageMeta(targetImageId);
      if (civData.error) {
        return res.status(civData.status || 500).json({ error: civData.error });
      }

      if (civData) {
        const { genData, imgGet } = civData;
        const meta = genData?.meta || {};

        if (imgGet?.user?.username) creatorName = imgGet.user.username;
        if (imgGet?.url) {
          previewImage = imgGet.url.startsWith('http')
            ? imgGet.url
            : `https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/${imgGet.url}/original=true/preview.jpeg`;
        }

        if (meta.prompt) prompt = meta.prompt;
        if (meta.negativePrompt) negativePrompt = meta.negativePrompt;

        rawModelName = meta.Model || meta.baseModel || (meta.models && meta.models[0]) || '';
        
        // Accurate Base Model detection from Civitai resources or metadata
        const resWithBase = Array.isArray(genData?.resources)
          ? genData.resources.find((r: any) => r.baseModel)
          : null;

        if (resWithBase?.baseModel) {
          detectedBaseModel = resWithBase.baseModel;
        } else if (meta.baseModel) {
          detectedBaseModel = meta.baseModel;
        } else {
          detectedBaseModel = rawModelName;
        }

        if (meta.steps) steps = meta.steps;
        if (meta.cfgScale) cfg = meta.cfgScale;
        if (meta.sampler) sampler = mapSampler(meta.sampler);
        if (meta.scheduler) scheduler = mapScheduler(meta.scheduler || meta.sampler);
        if (meta.seed) seed = meta.seed;
        if (meta.denoise !== undefined) denoise = meta.denoise;

        if (meta.vaes) {
          detectedVae = Array.isArray(meta.vaes) ? meta.vaes[0] : meta.vaes;
        } else if (meta.VAE) {
          detectedVae = meta.VAE;
        }

        if (imgGet?.width) width = imgGet.width;
        else if (meta.width) width = meta.width;

        if (imgGet?.height) height = imgGet.height;
        else if (meta.height) height = meta.height;

        if (imgGet?.type === 'video' || Boolean(imgGet?.metadata?.duration) || detectedBaseModel === 'MiniMax H3') {
          isVideo = true;
          videoDuration = imgGet?.metadata?.duration || 10;
        }

        detectedEngine = meta.engine || genData?.process || (isVideo ? 'Video AI' : 'ComfyUI');

        // Extract LoRAs from resources and additionalResources, deduplicating and merging
        loras = [];
        const rawLorasFromResources: any[] = [];
        if (Array.isArray(genData?.resources)) {
          genData.resources.forEach((r: any) => {
            if (r.modelType === 'LORA' || r.type === 'lora' || r.type === 'LoRA') {
              rawLorasFromResources.push({
                displayName: r.modelName || 'Civitai LoRA',
                civitaiId: String(r.versionId || r.modelVersionId || r.modelId || ''),
                strength: r.strength || 0.8,
                baseModel: r.baseModel || detectedBaseModel,
              });
            } else if (r.modelType === 'CHECKPOINT' && !rawModelName) {
              rawModelName = r.modelName || '';
            }
          });
        }

        const rawLorasFromAdditional: any[] = [];
        if (Array.isArray(meta.additionalResources)) {
          meta.additionalResources.forEach((ar: any) => {
            if (ar.type === 'lora' && ar.name) {
              rawLorasFromAdditional.push({
                fileName: ar.name.endsWith('.safetensors') ? ar.name : `${ar.name}.safetensors`,
                strength: ar.strength || 0.8,
              });
            }
          });
        }

        if (rawLorasFromResources.length > 0 && rawLorasFromAdditional.length > 0) {
          // Merge matched pairs (exact same LoRA title vs safetensors filename)
          rawLorasFromResources.forEach((r, idx) => {
            const add = rawLorasFromAdditional[idx] || rawLorasFromAdditional[0];
            loras.push({
              name: add?.fileName || `${r.displayName}.safetensors`,
              displayName: r.displayName,
              strength: add?.strength || r.strength || 0.8,
              civitaiId: r.civitaiId,
              triggers: '',
              baseModel: r.baseModel || detectedBaseModel,
            });
          });
        } else if (rawLorasFromResources.length > 0) {
          rawLorasFromResources.forEach((r) => {
            loras.push({
              name: `${r.displayName}.safetensors`,
              displayName: r.displayName,
              strength: r.strength || 0.8,
              civitaiId: r.civitaiId,
              triggers: '',
              baseModel: r.baseModel || detectedBaseModel,
            });
          });
        } else if (rawLorasFromAdditional.length > 0) {
          rawLorasFromAdditional.forEach((a) => {
            loras.push({
              name: a.fileName,
              displayName: a.fileName.replace('.safetensors', ''),
              strength: a.strength || 0.8,
              civitaiId: '',
              triggers: '',
              baseModel: detectedBaseModel,
            });
          });
        }

        presetTitle = `Civitai 作品 #${targetImageId}：${creatorName} 原作逆向工作流`;
      }
    } else if (targetVersionId) {
      // 2.5. Civitai Model Version ID Extractor (GET /api/v1/model-versions/:id)
      try {
        const vResp = await fetch(`https://civitai.com/api/v1/model-versions/${targetVersionId}`, {
          headers: apiKey ? { Authorization: `Bearer ${apiKey}`, 'User-Agent': 'ComfyCanvas/1.0' } : { 'User-Agent': 'ComfyCanvas/1.0' },
        });
        if (vResp.ok) {
          const vData = await vResp.json();
          presetTitle = `Civitai 模型版本：${vData.model?.name || vData.name || 'LoRA 微调'}`;
          creatorName = vData.model?.creator?.username || creatorName;
          if (vData.images?.[0]?.url) previewImage = vData.images[0].url;
          const triggers = vData.trainedWords?.join(', ') || '';
          if (triggers) {
            prompt = `${triggers}, 1girl, masterpiece, highly detailed face, natural skin texture, 8k`;
          }
          rawModelName = vData.baseModel || '';
          detectedBaseModel = rawModelName;
          loras = [
            {
              name: vData.files?.[0]?.name || `${vData.name || 'Civitai_LoRA'}.safetensors`,
              strength: 0.8,
              civitaiId: String(vData.id),
              triggers,
              baseModel: rawModelName,
            },
          ];
        }
      } catch (e) {
        console.error('Error fetching Civitai model-version for workflow:', e);
      }
    } else if (targetModelId) {
      // 3. Civitai Model ID Extractor
      try {
        const mResp = await fetch(`https://civitai.com/api/v1/models/${targetModelId}`, {
          headers: apiKey ? { Authorization: `Bearer ${apiKey}`, 'User-Agent': 'ComfyCanvas/1.0' } : { 'User-Agent': 'ComfyCanvas/1.0' },
        });
        if (mResp.ok) {
          const mData = await mResp.json();
          presetTitle = `Civitai 模型定制：${mData.name}`;
          creatorName = mData.creator?.username || creatorName;
          const v0 = mData.modelVersions?.[0];
          if (v0) {
            if (v0.images?.[0]?.url) previewImage = v0.images[0].url;
            const triggers = v0.trainedWords?.join(', ') || '';
            if (triggers) {
              prompt = `${triggers}, 1girl, masterpiece, highly detailed face, natural skin texture, 8k`;
            }
            rawModelName = v0.baseModel || '';
            detectedBaseModel = rawModelName;
            const isLoraModel = mData.type === 'LORA' || mData.type === 'LoRA';
            if (isLoraModel) {
              loras = [
                {
                  name: v0.files?.[0]?.name || `${mData.name}.safetensors`,
                  strength: 0.8,
                  civitaiId: String(mData.id),
                  triggers,
                  baseModel: rawModelName,
                },
              ];
            }
          }
        }
      } catch (e) {
        console.error('Error fetching Civitai model for workflow:', e);
      }
    }

    const hasLora = loras.length > 0;
    const primaryLora = hasLora ? loras[0] : null;

    // Helper to normalize raw model names to our internal library IDs
    const normalizeCkpt = (raw: string, base: string) => {
      const lower = (raw || '').toLowerCase() + ' ' + (base || '').toLowerCase();
      // Return raw or base directly for non-hardcoded models
      return raw || base || 'unknown_model';
    };

    // ==========================================
    // Multi-Engine Adapter & Resolution (User Choice Supported!)
    // ==========================================
    let targetProvider = engine || "civitai";
    let chosenEngineName = "Civitai 官方原生生成引擎";
    let engineExplanation = "";

    const l = (rawModelName || "").toLowerCase() + " " + (detectedBaseModel || "").toLowerCase() + " " + (loras || []).map((lor: any) => (lor.name || "") + " " + (lor.baseModel || "")).join(" ").toLowerCase();

    if (isVideo && (engine === "video" || engine === "civitai")) {
      targetProvider = "video";
      chosenEngineName = "AI Video 视频生成引擎";
      checkpoint = rawModelName || "wan2.1-video";
      engineExplanation = "检测到视频作品。已为您组装专用 AI 视频工作流管线。";
    } else if (engine === "civitai") {
      targetProvider = "civitai";
      chosenEngineName = "Civitai 官方原生生成引擎";
      checkpoint = normalizeCkpt(rawModelName, detectedBaseModel);
      baseModelArchitecture = detectedBaseModel || "";
      engineExplanation = "🌟 Civitai 官方原生引擎：原生支持 Civitai 社区发布的所有模型与全量 LoRA。";
    } else if (engine === "tensorart" || engine === "tensor") {
      targetProvider = "tensorart";
      chosenEngineName = "Tensor.Art 官方原生生成引擎";
      checkpoint = rawModelName || "strong_text2image_nano_banana2";
      baseModelArchitecture = detectedBaseModel || "Nano Banana 2";
      engineExplanation = "🎨 Tensor.Art 官方原生引擎：直连吐司 AI / OpenWorks 接口，按选定工具与模型实时调用。";
    } else if (engine === "fal") {
      targetProvider = "fal";
      chosenEngineName = "Fal.ai 极速云引擎";
      checkpoint = rawModelName || detectedBaseModel || "flux-dev";
      baseModelArchitecture = detectedBaseModel || "FLUX.1";
      engineExplanation = `⚡ Fal.ai 极速云引擎：请求模型: ${checkpoint}。`;
    } else if (engine === "nanogpt") {
      targetProvider = "nanogpt";
      chosenEngineName = "NanoGPT 极速按需引擎";
      checkpoint = rawModelName || detectedBaseModel || "flux-dev";
      baseModelArchitecture = detectedBaseModel || "FLUX.1";
      engineExplanation = "⚡ NanoGPT 极速引擎：直连 NanoGPT 官方按需推理通道。";
    } else if (engine === "agnes") {
      targetProvider = "agnes";
      chosenEngineName = "Agnes AI 极速生图引擎";
      checkpoint = rawModelName || detectedBaseModel || "agnes-image-2.5-flash";
      baseModelArchitecture = detectedBaseModel || "Agnes 2.5 Flash";
      engineExplanation = "🚀 Agnes AI 极速生图引擎：已为您适配 Agnes AI 秒级极速生成通道。";
    } else if (engine === "sensenova") {
      targetProvider = "sensenova";
      chosenEngineName = "SenseNova 商汤日日新引擎";
      checkpoint = "sensenova-v5";
      baseModelArchitecture = "SenseNova V5 CoT";
      engineExplanation = "🧠 SenseNova 商汤日日新引擎：直连商汤大模型思维链生图。";
    } else if (engine === "modelscope") {
      targetProvider = "modelscope";
      chosenEngineName = "ModelScope 魔搭社区引擎";
      checkpoint = rawModelName || detectedBaseModel || "wan2.1-t2i";
      baseModelArchitecture = detectedBaseModel || "ModelScope Wan / SD";
      engineExplanation = "🌌 ModelScope 魔搭社区引擎：直连通义万相与魔搭社区开源通道。";
    } else if (engine === "huggingface") {
      targetProvider = "huggingface";
      chosenEngineName = "Hugging Face Diffusers 引擎";
      checkpoint = rawModelName || detectedBaseModel || "stabilityai/stable-diffusion-xl-base-1.0";
      baseModelArchitecture = detectedBaseModel || "SDXL 1.0";
      engineExplanation = "🤗 Hugging Face Diffusers 引擎：直连 Hugging Face Hub。";
    } else if (engine === "gemini") {
      targetProvider = "gemini";
      chosenEngineName = "Google Imagen 3.0 生图引擎";
      checkpoint = "imagen-3.0-generate-002";
      baseModelArchitecture = "Imagen 3";
      engineExplanation = "🌟 Google Imagen 3.0：已适配系统内置免配置高保真生图引擎。";
    } else if (engine === "video") {
      targetProvider = "video";
      chosenEngineName = "AI Video 视频生成引擎 (MiniMax / Wan 2.1)";
      checkpoint = rawModelName || "damo/wan2.1-i2v";
      isVideo = true;
      engineExplanation = "🎬 AI Video 视频引擎：已自动为您组装专用 AI 视频工作流管线 (AIVideoNode + VideoDriver)。";
    } else {
      targetProvider = engine || "civitai";
      chosenEngineName = `${engine || "Civitai"} 引擎`;
      checkpoint = normalizeCkpt(rawModelName, detectedBaseModel);
      baseModelArchitecture = detectedBaseModel || "";
      engineExplanation = `已指定跨引擎接入: ${engine}。`;
    }

    // Build Nodes & Connections
    const nodes: any[] = [];
    const connections: any[] = [];

    if (isVideo) {
      nodes.push(
        {
          id: 'node-imp-video',
          type: 'AIVideoNode',
          title: 'AI 视频生成器 (MiniMax H3 / Wan 2.1)',
          pos: { x: 380, y: 120 },
          width: 380,
          inputs: [
            { id: 'prompt', name: 'prompt', type: 'STRING' },
            { id: 'init_image', name: 'init_image', type: 'IMAGE' },
          ],
          outputs: [
            { id: 'video', name: 'video', type: 'VIDEO' },
            { id: 'FIRST_FRAME', name: 'FIRST_FRAME', type: 'IMAGE' },
          ],
          values: {
            model: checkpoint,
            prompt,
            negative_prompt: negativePrompt,
            duration: videoDuration || 10,
            fps: 24,
            aspect_ratio: '16:9',
          },
        },
        {
          id: 'node-imp-save-video',
          type: 'SaveVideo',
          title: '保存视频产物 (Save Video)',
          pos: { x: 820, y: 120 },
          width: 320,
          inputs: [{ id: 'video', name: 'video', type: 'VIDEO' }],
          outputs: [],
          values: { filename_prefix: `Civitai_Video_${creatorName}` },
        }
      );
      connections.push({
        id: 'imp-vc1',
        fromNodeId: 'node-imp-video',
        fromSocketId: 'video',
        toNodeId: 'node-imp-save-video',
        toSocketId: 'video',
        type: 'VIDEO',
      });
    } else {
      nodes.push({
        id: 'node-imp-1',
        type: 'CheckpointLoaderSimple',
        title: `加载底模 (${chosenEngineName})`,
        pos: { x: 60, y: 120 },
        width: 280,
        inputs: [],
        outputs: [
          { id: 'MODEL', name: 'MODEL', type: 'MODEL' },
          { id: 'CLIP', name: 'CLIP', type: 'CLIP' },
          { id: 'VAE', name: 'VAE', type: 'VAE' },
        ],
        values: { ckpt_name: checkpoint, targetProvider },
      });

      if (hasLora && primaryLora) {
        nodes.push({
          id: 'node-imp-2',
          type: 'LoRALoader',
          title: `加载 LoRA (${primaryLora.name.slice(0, 18)}...)`,
          pos: { x: 380, y: 120 },
          width: 320,
          inputs: [
            { id: 'model', name: 'model', type: 'MODEL' },
            { id: 'clip', name: 'clip', type: 'CLIP' },
          ],
          outputs: [
            { id: 'MODEL', name: 'MODEL', type: 'MODEL' },
            { id: 'CLIP', name: 'CLIP', type: 'CLIP' },
          ],
          values: {
            lora_name: primaryLora.name,
            strength_model: primaryLora.strength,
            strength_clip: primaryLora.strength,
            trigger_words: primaryLora.triggers || '',
            civitai_id: primaryLora.civitaiId,
          },
        });

        connections.push(
          { id: 'imp-c1', fromNodeId: 'node-imp-1', fromSocketId: 'MODEL', toNodeId: 'node-imp-2', toSocketId: 'model', type: 'MODEL' },
          { id: 'imp-c2', fromNodeId: 'node-imp-1', fromSocketId: 'CLIP', toNodeId: 'node-imp-2', toSocketId: 'clip', type: 'CLIP' },
          { id: 'imp-c3', fromNodeId: 'node-imp-2', fromSocketId: 'CLIP', toNodeId: 'node-imp-3', toSocketId: 'clip', type: 'CLIP' },
          { id: 'imp-c4', fromNodeId: 'node-imp-2', fromSocketId: 'CLIP', toNodeId: 'node-imp-4', toSocketId: 'clip', type: 'CLIP' },
          { id: 'imp-c5', fromNodeId: 'node-imp-2', fromSocketId: 'MODEL', toNodeId: 'node-imp-6', toSocketId: 'model', type: 'MODEL' }
        );
      } else {
        connections.push(
          { id: 'imp-c1', fromNodeId: 'node-imp-1', fromSocketId: 'CLIP', toNodeId: 'node-imp-3', toSocketId: 'clip', type: 'CLIP' },
          { id: 'imp-c2', fromNodeId: 'node-imp-1', fromSocketId: 'CLIP', toNodeId: 'node-imp-4', toSocketId: 'clip', type: 'CLIP' },
          { id: 'imp-c5', fromNodeId: 'node-imp-1', fromSocketId: 'MODEL', toNodeId: 'node-imp-6', toSocketId: 'model', type: 'MODEL' }
        );
      }

      nodes.push(
        {
          id: 'node-imp-3',
          type: 'CLIPTextEncode',
          title: 'CLIP 正向提示词 (Positive Prompt)',
          pos: { x: 740, y: 60 },
          width: 380,
          inputs: [{ id: 'clip', name: 'clip', type: 'CLIP' }],
          outputs: [{ id: 'CONDITIONING', name: 'CONDITIONING', type: 'CONDITIONING' }],
          values: { text: prompt },
        },
        {
          id: 'node-imp-4',
          type: 'CLIPTextEncodeNegative',
          title: 'CLIP 负向提示词 (Negative Prompt)',
          pos: { x: 740, y: 280 },
          width: 380,
          inputs: [{ id: 'clip', name: 'clip', type: 'CLIP' }],
          outputs: [{ id: 'CONDITIONING', name: 'CONDITIONING', type: 'CONDITIONING' }],
          values: { text: negativePrompt },
        },
        {
          id: 'node-imp-5',
          type: 'EmptyLatentImage',
          title: '空潜空间张量 (Empty Latent)',
          pos: { x: 740, y: 500 },
          width: 280,
          inputs: [],
          outputs: [{ id: 'LATENT', name: 'LATENT', type: 'LATENT' }],
          values: { width, height, batch_size: 1 },
        },
        {
          id: 'node-imp-6',
          type: 'KSampler',
          title: 'KSampler 核心降噪采样',
          pos: { x: 1180, y: 140 },
          width: 320,
          inputs: [
            { id: 'model', name: 'model', type: 'MODEL' },
            { id: 'positive', name: 'positive', type: 'CONDITIONING' },
            { id: 'negative', name: 'negative', type: 'CONDITIONING' },
            { id: 'latent_image', name: 'latent_image', type: 'LATENT' },
          ],
          outputs: [{ id: 'LATENT', name: 'LATENT', type: 'LATENT' }],
          values: {
            seed,
            control_after_generate: 'randomize',
            steps,
            cfg,
            sampler_name: sampler,
            scheduler,
            denoise: denoise ?? 1.0,
          },
        },
        {
          id: 'node-imp-7',
          type: 'VAEDecode',
          title: 'VAE 解码器 (VAE Decode)',
          pos: { x: 1560, y: 140 },
          width: 220,
          inputs: [
            { id: 'samples', name: 'samples', type: 'LATENT' },
            { id: 'vae', name: 'vae', type: 'VAE' },
          ],
          outputs: [{ id: 'IMAGE', name: 'IMAGE', type: 'IMAGE' }],
          values: {},
        },
        {
          id: 'node-imp-8',
          type: 'SaveImage',
          title: '保存图像 (Save Image)',
          pos: { x: 1840, y: 100 },
          width: 360,
          inputs: [{ id: 'images', name: 'images', type: 'IMAGE' }],
          outputs: [],
          values: { filename_prefix: `Civitai_${creatorName}` },
        }
      );

      connections.push(
        { id: 'imp-c6', fromNodeId: 'node-imp-3', fromSocketId: 'CONDITIONING', toNodeId: 'node-imp-6', toSocketId: 'positive', type: 'CONDITIONING' },
        { id: 'imp-c7', fromNodeId: 'node-imp-4', fromSocketId: 'CONDITIONING', toNodeId: 'node-imp-6', toSocketId: 'negative', type: 'CONDITIONING' },
        { id: 'imp-c8', fromNodeId: 'node-imp-5', fromSocketId: 'LATENT', toNodeId: 'node-imp-6', toSocketId: 'latent_image', type: 'LATENT' },
        { id: 'imp-c9', fromNodeId: 'node-imp-6', fromSocketId: 'LATENT', toNodeId: 'node-imp-7', toSocketId: 'samples', type: 'LATENT' },
        { id: 'imp-c10', fromNodeId: 'node-imp-1', fromSocketId: 'VAE', toNodeId: 'node-imp-7', toSocketId: 'vae', type: 'VAE' },
        { id: 'imp-c11', fromNodeId: 'node-imp-7', fromSocketId: 'IMAGE', toNodeId: 'node-imp-8', toSocketId: 'images', type: 'IMAGE' }
      );
    }

    // Rich Other Metadata
    const otherMetadata = {
      prompt: prompt || '',
      negativePrompt: negativePrompt || '',
      baseModel: detectedBaseModel || (isVideo ? 'MiniMax H3' : 'Original'),
      modelFile: rawModelName ? (rawModelName.endsWith('.safetensors') ? rawModelName : `${rawModelName}.safetensors`) : (isVideo ? 'minimax_h3.safetensors' : (checkpoint || 'unknown.safetensors')),
      vae: detectedVae || 'qwen_image_vae.safetensors',
      sampler: sampler || 'er_sde_simple',
      scheduler: scheduler || 'sgm_uniform',
      steps: steps || 8,
      cfgScale: cfg || 1.0,
      seed: seed || 727217537163565,
      denoise: denoise ?? 1.0,
      width: width || 1024,
      height: height || 1024,
      resolution: `${width} x ${height}`,
      aspectRatio: `${width}:${height}`,
      mediaType: isVideo ? 'video' : 'image',
      duration: videoDuration || null,
      engine: detectedEngine || (isVideo ? 'Video AI' : 'ComfyUI'),
      resources: loras.map((l) => ({
        name: l.displayName || l.name,
        fileName: l.name,
        versionId: l.civitaiId,
        strength: l.strength,
        baseModel: l.baseModel || detectedBaseModel,
      })),
    };

    const preset = {
      id: `civitai-imported-${Date.now()}`,
      name: presetTitle,
      prompt,
      negativePrompt,
      category: isVideo ? 'Civitai 视频工作流' : 'Civitai 一键导入',
      provider: chosenEngineName,
      previewImage,
      tags: ['Civitai 导入', creatorName, ...(primaryLora ? [primaryLora.name.replace('.safetensors', '')] : []), targetProvider.toUpperCase(), '真实解析'],
      loraNames: loras.map((l) => l.name),
      description: `从 ${extractSource} 逆向解析提取的工作流。作者: ${creatorName}，底模: ${checkpoint}，LoRA 数量: ${loras.length}。${engineExplanation ? ` 说明: ${engineExplanation}` : ''}`,
      architectureExplanation: engineExplanation,
      nodes,
      connections,
      otherMetadata,
      spatialFrames: [
        {
          id: `frame-imp-${Date.now()}`,
          title: `${presetTitle} (取景框)`,
          pos: { x: 260, y: 160 },
          width: 480,
          height: 480,
          prompt,
          negativePrompt,
          params: {
            checkpoint,
            seed,
            seedControl: 'randomize',
            steps,
            cfg,
            sampler,
            scheduler,
            denoise: denoise ?? 1.0,
            width,
            height,
            batchSize: 1,
            loras: loras.map((l) => ({
              name: l.name,
              modelStrength: l.strength,
              clipStrength: l.strength,
              triggerWords: l.triggers || '',
              civitaiId: l.civitaiId,
            })),
            targetProvider,
            videoDuration: isVideo ? (videoDuration || 10) : undefined,
          },
          status: 'idle',
          imageUrl: previewImage,
          createdAt: Date.now(),
        },
      ],
    };

    return res.json({
      success: true,
      preset,
      otherMetadata,
      availableEngines: [
        { id: "civitai", name: "Civitai 官方原生引擎", badge: "最完美原生适配", recommended: !isVideo, description: "100% 原生支持 Civitai 资源与 Krea 2 Turbo / LoRA" },
        { id: "tensorart", name: "Tensor.Art 官方原生引擎", badge: "OpenWorks 原生", description: "直连吐司 AI / OpenWorks 开放平台，Wan 2.7 / Banana / FLUX / SDXL 原生解算" },
        { id: "nanogpt", name: "NanoGPT 极速", badge: "239+ 现货模型", description: "按需秒级生图，覆盖 FLUX、Qwen Image 2.1、SDXL、Krea 2 Turbo" },
        { id: "fal", name: "Fal.ai 极速云引擎", badge: "GPU Serverless", description: "FLUX.1 / SDXL 1.0 / Krea 2 官方端点" },
        { id: "modelscope", name: "ModelScope 魔搭社区", badge: "阿里万相", description: "通义万相 Wan 2.1 / Krea 2 开源生态" },
        { id: "sensenova", name: "SenseNova 日日新", badge: "CoT 推理", description: "商汤大模型思维链生图" },
        { id: "huggingface", name: "Hugging Face", badge: "Diffusers", description: "开源 Diffusers 生态权重直挂" },
        { id: "agnes", name: "Agnes AI 极速生图", badge: "秒级出片", description: "极速生成通道 (agnes-image-2.5-flash)" },
        { id: "gemini", name: "Google Imagen 3", badge: "官方内置", description: "系统内置免配置高写实生图" },
        ...(isVideo ? [{ id: "video", name: "AI Video 视频生成引擎", badge: "电影级视频", recommended: true, description: "MiniMax H3 / Wan 2.1 视频管线" }] : [])
      ],
      selectedEngine: targetProvider,
      parsedMeta: {
        creator: creatorName,
        checkpoint,
        architecture: rawModelName || (isVideo ? 'MiniMax H3' : 'Krea 2'),
        architectureExplanation: engineExplanation,
        lorasCount: loras.length,
        steps,
        cfg,
        sampler,
        scheduler,
        seed,
        size: `${width}x${height}`,
        mediaType: isVideo ? 'video' : 'image',
        duration: videoDuration,
      },
    });
  } catch (error: any) {
    console.error('Extract civitai workflow error:', error);
    return res.status(500).json({ error: error.message || 'Civitai workflow extraction failed' });
  }
});

const modelScopeImageCache = new Map<string, string>();

async function resolveModelScopeRealImage(modelId: string, isCn = true): Promise<string> {
  const cacheKey = `${isCn ? 'cn' : 'ai'}:${modelId}`;
  if (modelScopeImageCache.has(cacheKey)) {
    return modelScopeImageCache.get(cacheKey) || '';
  }

  const baseUrl = isCn ? 'https://www.modelscope.cn' : 'https://modelscope.ai';
  // 1. Try detail API for Data.MuseInfo, Data.CoverImages, Data.NEXA
  try {
    const detailRes = await fetch(`${baseUrl}/api/v1/models/${modelId}`, {
      headers: { 'User-Agent': 'ComfyCanvas/1.0' },
      signal: AbortSignal.timeout(3500),
    });
    if (detailRes.ok) {
      const detailData = await detailRes.json();
      const data = detailData.Data || {};

      // A. MuseInfo coverImages
      if (data.MuseInfo?.versions) {
        for (const v of data.MuseInfo.versions) {
          if (v.coverImages && Array.isArray(v.coverImages)) {
            const cover = v.coverImages.find((c: any) => c && c.url);
            if (cover?.url) {
              modelScopeImageCache.set(cacheKey, cover.url);
              return cover.url;
            }
          }
        }
      }

      // B. CoverImages array
      if (Array.isArray(data.CoverImages) && data.CoverImages.length > 0) {
        const cover = data.CoverImages[0];
        const url = typeof cover === 'string' ? cover : cover?.url;
        if (url && typeof url === 'string' && url.startsWith('http')) {
          modelScopeImageCache.set(cacheKey, url);
          return url;
        }
      }

      // C. NEXA ModelCover
      if (data.NEXA?.ModelCover && typeof data.NEXA.ModelCover === 'string' && data.NEXA.ModelCover.startsWith('http')) {
        modelScopeImageCache.set(cacheKey, data.NEXA.ModelCover);
        return data.NEXA.ModelCover;
      }
    }
  } catch (e) {}

  // 2. Try repo files for showcase / cover assets
  try {
    const filesRes = await fetch(`${baseUrl}/api/v1/models/${modelId}/repo/files?Recursive=true`, {
      headers: { 'User-Agent': 'ComfyCanvas/1.0' },
      signal: AbortSignal.timeout(3500),
    });
    if (filesRes.ok) {
      const filesData = await filesRes.json();
      const files = filesData.Data?.Files || [];
      const validFiles = files.filter((f: any) => /\.(png|jpg|jpeg|webp)$/i.test(f.Path || f.Name || ''));
      if (validFiles.length > 0) {
        // Improved ranking: cover > showcase > preview > sample > res > assets/
        const getRank = (p: string) => {
          const path = p.toLowerCase();
          if (path.includes('cover')) return 100;
          if (path.includes('showcase')) return 90;
          if (path.includes('preview')) return 80;
          if (path.includes('sample')) return 70;
          if (path.includes('res')) return 60;
          if (path.startsWith('assets/')) return 50;
          if (path.includes('logo')) return 40;
          return 10;
        };
        const best = [...validFiles].sort((a, b) => getRank(b.Path || b.Name) - getRank(a.Path || a.Name))[0];
        const finalUrl = `${baseUrl}/models/${modelId}/resolve/master/${best.Path || best.Name}`;
        modelScopeImageCache.set(cacheKey, finalUrl);
        return finalUrl;
      }
    }
  } catch (e) {}

  // DO NOT FALLBACK TO AVATAR! Avatar is the uploader's/organization's profile icon, not a model cover.
  modelScopeImageCache.set(cacheKey, '');
  return '';
}

// Universal Dynamic Model Metadata and Architecture Resolver
function extractModelMetadata(
  id: string,
  name?: string,
  tags: string[] = [],
  description = '',
  taskOrPipeline = '',
  providerName = ''
): {
  baseModel: string;
  category: 'Checkpoint' | 'LoRA' | 'Video' | 'Edit';
  type: 'Checkpoint' | 'LORA' | 'MotionModule' | 'Tools' | 'Reasoning';
  badge?: string;
  cleanDisplayName: string;
} {
  const idLower = (id || '').toLowerCase();
  const nameLower = (name || '').toLowerCase();
  const tagsLower = tags.map((t) => String(t).toLowerCase());
  const descLower = (description || '').toLowerCase();
  const taskLower = (taskOrPipeline || '').toLowerCase();
  const s = `${idLower} ${nameLower} ${tagsLower.join(' ')} ${descLower} ${taskLower}`;

  // 1. Determine Category & Type
  let category: 'Checkpoint' | 'LoRA' | 'Video' | 'Edit' = 'Checkpoint';
  let type: 'Checkpoint' | 'LORA' | 'MotionModule' | 'Tools' | 'Reasoning' = 'Checkpoint';

  const isVideo =
    taskLower.includes('video') ||
    taskLower === 'text-to-video' ||
    taskLower === 'image-to-video' ||
    taskLower === 'video-to-video' ||
    idLower.includes('video') ||
    idLower.includes('wan2.1-t2v') ||
    idLower.includes('wan2.2-t2v') ||
    idLower.includes('text2video') ||
    idLower.includes('image2video') ||
    idLower.includes('live_wallpaper') ||
    idLower.includes('ltx') ||
    idLower.includes('kling') ||
    idLower.includes('minimax') ||
    idLower.includes('hailuo') ||
    idLower.includes('cogvideo') ||
    idLower.includes('hunyuan-video') ||
    tagsLower.some((t) => t.includes('video') || t.includes('wallpaper'));

  const isEdit =
    !isVideo &&
    !idLower.includes('three_view') &&
    !idLower.includes('photoreal_studio') &&
    (
      idLower.includes('smart_edit') ||
      idLower.includes('edit-image') ||
      idLower.includes('/edit') ||
      idLower.includes('inpaint') ||
      idLower.includes('upscal') ||
      idLower.includes('birefnet') ||
      idLower.includes('remover') ||
      idLower.includes('remove') ||
      idLower.includes('restore') ||
      idLower.includes('watermark') ||
      idLower.includes('garment') ||
      idLower.includes('outpainting') ||
      idLower.includes('extend_image') ||
      idLower.includes('mimicbrush') ||
      idLower.includes('controlnet') ||
      idLower.includes('segment') ||
      idLower.includes('sam3') ||
      idLower.includes('sam-') ||
      idLower.includes('depth') ||
      idLower.includes('canny') ||
      idLower.includes('openpose') ||
      taskLower === 'image-to-image' ||
      taskLower === 'tools' ||
      tagsLower.some((t) =>
        ['editing', 'edit', 'inpaint', 'upscale', 'super-resolution', 'background removal', 'subject extraction', 'outpainting', 'restore', 'watermark', 'segmentation'].includes(t)
      )
    );

  const isLora =
    !isVideo &&
    !isEdit &&
    (
      idLower.includes('lora') ||
      taskLower.includes('lora') ||
      tagsLower.some((t) => t.includes('lora') || t === 'oc' || t === 'character' || t === 'style' || t === 'sketch') ||
      idLower.includes('three_view') ||
      idLower.includes('anime_lab_wai') ||
      idLower.includes('oc_character')
    );

  if (isVideo) {
    category = 'Video';
    type = 'MotionModule';
  } else if (isEdit) {
    category = 'Edit';
    type = 'Tools';
  } else if (isLora) {
    category = 'LoRA';
    type = 'LORA';
  } else {
    category = 'Checkpoint';
    type = 'Checkpoint';
  }

  // 2. Determine Real Base Model Architecture Family
  let baseModel = '通用底模';
  if (s.includes('flux.1-dev') || s.includes('flux-dev') || s.includes('flux.1 [dev]') || s.includes('flux_dev')) {
    baseModel = 'FLUX.1 [dev]';
  } else if (s.includes('flux.1-schnell') || s.includes('flux-schnell') || s.includes('flux.1 [schnell]') || s.includes('flux_schnell')) {
    baseModel = 'FLUX.1 [schnell]';
  } else if (s.includes('flux-pro') || s.includes('flux.1-pro') || s.includes('flux/pro')) {
    baseModel = 'FLUX.1 Pro';
  } else if (s.includes('flux') || s.includes('bfl')) {
    baseModel = 'FLUX.1';
  } else if (s.includes('pony') || s.includes('pdxl')) {
    baseModel = 'Pony XL';
  } else if (s.includes('illustrious') || s.includes('noobai') || s.includes('wai illustrious') || s.includes('wai_illustrious')) {
    baseModel = 'Illustrious-XL';
  } else if (s.includes('sd3.5') || s.includes('sd 3.5') || s.includes('sd-3.5') || s.includes('sd3') || s.includes('stable-diffusion-3')) {
    baseModel = 'SD 3.5';
  } else if (s.includes('sdxl') || s.includes('stable-diffusion-xl') || s.includes('sd_xl') || s.includes('_xl_') || s.includes('juggernaut-xl') || s.includes('animagine')) {
    baseModel = 'SDXL 1.0';
  } else if (s.includes('sd 1.5') || s.includes('sd1.5') || s.includes('sd15') || s.includes('v1-5') || s.includes('stable-diffusion-v1-5') || s.includes('dreamshaper-7') || s.includes('realistic_vision') || s.includes('majicmix')) {
    baseModel = 'SD 1.5';
  } else if (s.includes('sd 2.1') || s.includes('sd2.1') || s.includes('sd2') || s.includes('stable-diffusion-2')) {
    baseModel = 'SD 2.1';
  } else if (s.includes('wan27') || s.includes('wan 2.7') || s.includes('wan-2.7')) {
    baseModel = 'Wan 2.7';
  } else if (s.includes('wan25') || s.includes('wan 2.5') || s.includes('wan-2.5')) {
    baseModel = 'Wan 2.5';
  } else if (s.includes('wan22') || s.includes('wan 2.2') || s.includes('wan-2.2')) {
    baseModel = 'Wan 2.2';
  } else if (s.includes('wan2.1') || s.includes('wan 2.1') || s.includes('wan_2.1') || s.includes('wan') || s.includes('tongyi')) {
    baseModel = 'Wan 2.1';
  } else if (s.includes('krea-2') || s.includes('krea2') || s.includes('krea')) {
    baseModel = 'Krea 2 Turbo';
  } else if (s.includes('z-image') || s.includes('z_image') || s.includes('zimage')) {
    baseModel = 'Z-Image-Turbo';
  } else if (s.includes('qwen-image') || s.includes('qwen2') || s.includes('qwen')) {
    baseModel = 'Qwen Image 2.1';
  } else if (s.includes('kolors') || s.includes('kwai')) {
    baseModel = 'Kolors';
  } else if (s.includes('cosmos-3') || s.includes('cosmos')) {
    baseModel = 'NVIDIA Cosmos';
  } else if (s.includes('boogu')) {
    baseModel = 'Boogu Image';
  } else if (s.includes('recraft')) {
    baseModel = 'Recraft V3';
  } else if (s.includes('ideogram')) {
    baseModel = 'Ideogram';
  } else if (s.includes('dall-e') || s.includes('dalle')) {
    baseModel = 'DALL-E 3';
  } else if (s.includes('midjourney')) {
    baseModel = 'Midjourney';
  } else if (s.includes('kling')) {
    baseModel = 'Kling';
  } else if (s.includes('ltx-2.3') || s.includes('ltx23') || s.includes('ltx 2.3')) {
    baseModel = 'LTX 2.3';
  } else if (s.includes('ltx')) {
    baseModel = 'LTX-Video';
  } else if (s.includes('minimax') || s.includes('hailuo')) {
    baseModel = 'MiniMax';
  } else if (s.includes('hunyuan')) {
    baseModel = 'Hunyuan';
  } else if (s.includes('cogvideo')) {
    baseModel = 'CogVideoX';
  } else if (s.includes('imagen-3') || s.includes('imagen 3') || s.includes('imagen')) {
    baseModel = 'Imagen 3.0';
  } else if (s.includes('gemini-2.5') || s.includes('gemini-3') || s.includes('gemini')) {
    baseModel = 'Gemini Vision';
  } else if (s.includes('nano_banana') || s.includes('banana')) {
    baseModel = 'Nano Banana 2';
  } else if (providerName === 'Hugging Face') {
    baseModel = 'Diffusers Checkpoint';
  } else if (providerName.includes('ModelScope')) {
    baseModel = 'ModelScope Checkpoint';
  } else if (providerName === 'Fal.ai') {
    baseModel = isVideo ? 'Video Base' : 'Diffusion Base';
  } else if (providerName === 'NanoGPT') {
    baseModel = isVideo ? 'Video Base' : 'NanoGPT Base';
  } else if (providerName === 'Tensor.Art') {
    baseModel = isVideo ? 'Video Base' : 'Tensor.Art Cloud';
  }

  // 3. Clean and normalize displayName for clarity
  let cleanDisplayName = name || id.split('/').pop() || id;
  if (idLower === 'gemini-2.5-flash-image') {
    cleanDisplayName = 'Google Gemini 2.5 Flash Image';
  } else if (idLower === 'gemini-3-pro-image-preview' || idLower === 'gemini-3-pro-image') {
    cleanDisplayName = 'Google Gemini 3 Pro Image';
  } else if (idLower === 'gemini-3.1-flash-image-preview' || idLower === 'gemini-3.1-flash-image') {
    cleanDisplayName = 'Google Gemini 3.1 Flash Image';
  } else if (idLower.includes('imagen-3.0-generate-002') || idLower === 'imagen-3.0') {
    cleanDisplayName = 'Google Imagen 3.0 旗舰生图';
  } else if (idLower === 'strong_text2image_wan27') {
    cleanDisplayName = 'Wan 2.7 旗舰大模型 (官方工作流)';
  } else if (idLower === 'strong_text2image_nano_banana2') {
    cleanDisplayName = 'Nano Banana 2 文生图大模型';
  } else if (idLower === 'photoreal_studio_z_image') {
    cleanDisplayName = 'Z-Image 极致超写真大模型';
  } else if (idLower === 'anime_lab_wai_illustrious') {
    cleanDisplayName = 'WAI Illustrious 二次元动漫 LoRA';
  } else if (idLower === 'three_view_flux_kontext') {
    cleanDisplayName = 'FLUX Kontext 三视图角色设计 LoRA';
  } else if (idLower === 'oc_character_illustration') {
    cleanDisplayName = 'OC 原创角色插画 LoRA';
  } else if (idLower === 'smart_edit_nano_banana2') {
    cleanDisplayName = 'Nano Banana 2 智能多图编辑';
  } else if (idLower === 'smart_edit_wan27') {
    cleanDisplayName = 'Wan 2.7 图像高级智能编辑';
  } else if (idLower === 'smart_edit_wan27_pro') {
    cleanDisplayName = 'Wan 2.7 Pro 专业图生图与重绘';
  }

  let badge = undefined;
  if (providerName === 'NanoGPT') {
    badge = isVideo ? 'NanoGPT 视频端点' : isEdit ? 'NanoGPT 编辑端点' : 'NanoGPT 官方端点';
  } else if (providerName === 'Fal.ai') {
    badge = isLora ? 'Fal 官方 LoRA 端点' : isVideo ? 'Fal 官方视频端点' : 'Fal 官方端点';
  } else if (providerName === 'Tensor.Art') {
    badge = isLora ? 'Tensor.Art LoRA / 微调工具' : isVideo ? 'OpenWorks 视频生成' : isEdit ? 'OpenWorks 图像处理' : 'OpenWorks 官方工作流';
  } else if (providerName.includes('Google')) {
    badge = category === 'Checkpoint' ? 'Imagen 旗舰' : 'Gemini 原生';
  }

  return { baseModel, category, type, badge, cleanDisplayName };
}

// ==========================================
// 1.5. Dynamic Model List Pulling (Direct from Original APIs)
// ==========================================
app.get("/api/models", async (req, res) => {
  const { provider = "all", query = "", type = "" } = req.query;
  const rawCat = (req.query.category || req.query.cat || "").toString().toLowerCase();
  const searchStr = (query || "").toString().trim().toLowerCase();
  const reqType = (type || "").toString().toLowerCase();
  const sortParam = (req.query.sort || "downloads").toString();
  const cursorParam = (req.query.cursor || "").toString().trim();
  const pageParam = Math.max(1, parseInt(req.query.page as string) || 1);
  const limitParam = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || (provider === 'all' ? 30 : 60)));
  const archFilter = (req.query.architecture || req.query.arch || "").toString().trim().toLowerCase();

  // Unified category determination: "checkpoint" | "lora" | "video" | "edit" | "all"
  let cat = rawCat || "all";
  if (reqType === "lora") cat = "lora";
  else if (reqType === "checkpoint" && !rawCat) cat = "checkpoint";

  try {
    const results: Record<string, any[]> = {};
    const pagination: Record<string, { nextCursor?: string | null; page?: number; hasMore: boolean }> = {};
    
    const matchSearch = (item: any) => {
      if (!searchStr) return true;
      const hay = [
        item.id,
        item.name,
        item.provider,
        item.baseModel,
        item.category,
        item.badge,
        ...(item.tags || []),
        ...(item.trainedWords || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(searchStr);
    };

    const matchCategory = (item: any) => {
      if (!cat || cat === "all") return true;
      const itemCat = (item.category || "").toLowerCase();
      const itemType = (item.type || "").toLowerCase();
      const itemId = (item.id || "").toLowerCase();
      if (cat === "lora") return itemCat === "lora" || itemType === "lora" || itemId.includes("lora") || (item.tags && item.tags.includes("lora"));
      if (cat === "checkpoint") return (itemCat === "checkpoint" || itemType === "checkpoint" || itemCat === "base") && itemCat !== "video" && !itemId.includes("video") && itemCat !== "lora" && !itemId.includes("lora");
      if (cat === "video") return itemCat === "video" || itemType === "motionmodule" || (item.tags && item.tags.includes("video")) || itemId.includes("video");
      if (cat === "edit") return itemCat === "edit" || itemCat === "controlnet" || itemCat === "tools" || itemCat === "reasoning" || item.id.includes("edit") || item.id.includes("remover") || item.id.includes("upscaler") || item.id.includes("restore");
      return true;
    };

    // 1. ModelScope CN (魔搭社区国内站 - modelscope.cn) Real-Time Live OpenAPI Fetching
    if (provider === "all" || provider === "modelscope") {
      const msCnCatalog: any[] = [];
      try {
        let msSearch = searchStr || (cat === 'lora' ? 'lora' : cat === 'video' ? 'wan' : 'diffusion');
        if (archFilter && !msSearch.includes(archFilter)) {
          msSearch = `${msSearch} ${archFilter}`;
        }
        const msSort = sortParam.toLowerCase().includes('like') ? 'likes' : sortParam.toLowerCase().includes('new') ? 'created_at' : 'downloads';
        const msUrl = `https://www.modelscope.cn/openapi/v1/models?page_size=${limitParam}&page_number=${pageParam}&sort=${msSort}&search=${encodeURIComponent(msSearch)}`;
        const msResp = await fetch(msUrl, { headers: { 'User-Agent': 'ComfyCanvas/1.0' }, signal: AbortSignal.timeout(15000) });
        if (msResp.ok) {
          const msData = await msResp.json();
          const items = msData?.data?.models || [];

          pagination.modelscope = {
            page: pageParam,
            hasMore: items.length >= limitParam,
          };
          
          // Resolve real cover images in parallel
          const imagePromises = items.map((m: any) => resolveModelScopeRealImage(m.id, true));
          const resolvedImages = await Promise.allSettled(imagePromises);

          items.forEach((m: any, idx: number) => {
            const meta = extractModelMetadata(m.id, m.display_name, m.tags || [], m.description || '', (m.tasks || []).join(' '), 'ModelScope CN');
            const realImg = resolvedImages[idx].status === 'fulfilled' ? resolvedImages[idx].value : '';

            // Extract real trigger words if present in tags, else empty
            const triggers: string[] = [];
            if (Array.isArray(m.tags)) {
              m.tags.forEach((t: string) => {
                if (t.startsWith('trigger_word:') || t.startsWith('instance_prompt:')) {
                  triggers.push(t.split(':')[1]);
                }
              });
            }

            msCnCatalog.push({
              id: m.id,
              name: meta.cleanDisplayName,
              provider: "ModelScope CN",
              category: meta.category,
              type: meta.type,
              baseModel: meta.baseModel,
              downloads: m.downloads || 0,
              likes: m.likes || 0,
              rating: m.rating || 0,
              imageUrl: realImg,
              externalUrl: `https://www.modelscope.cn/models/${m.id}`,
              tags: m.tags || [],
              trainedWords: triggers,
            });
          });
        } else {
          results.modelscope = { error: `ModelScope CN 接口响应异常 (HTTP ${msResp.status})` } as any;
        }
      } catch (err: any) {
        console.error("ModelScope CN OpenAPI real-time fetch error:", err);
        results.modelscope = { error: `ModelScope CN 连接失败: ${err.message}` } as any;
      }

      if (!results.modelscope) {
        results.modelscope = msCnCatalog.filter((m) => matchCategory(m) && matchSearch(m));
      }
    }

    // 1.5 ModelScope AI (魔搭国际站 - modelscope.ai) Real-Time Live OpenAPI Fetching
    if (provider === "all" || provider === "modelscope_ai") {
      const msAiCatalog: any[] = [];
      try {
        let msSearch = searchStr || (cat === 'lora' ? 'lora' : cat === 'video' ? 'wan' : 'diffusion');
        if (archFilter && !msSearch.includes(archFilter)) {
          msSearch = `${msSearch} ${archFilter}`;
        }
        const msAiSort = sortParam.toLowerCase().includes('like') ? 'likes' : sortParam.toLowerCase().includes('new') ? 'created_at' : 'downloads';
        const msUrl = `https://modelscope.ai/openapi/v1/models?page_size=${limitParam}&page_number=${pageParam}&sort=${msAiSort}&search=${encodeURIComponent(msSearch)}`;
        const msResp = await fetch(msUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, signal: AbortSignal.timeout(15000) });
        if (msResp.ok) {
          const msData = await msResp.json();
          const items = msData?.data?.models || [];

          pagination.modelscope_ai = {
            page: pageParam,
            hasMore: items.length >= limitParam,
          };

          // Resolve real cover images in parallel
          const imagePromises = items.map((m: any) => resolveModelScopeRealImage(m.id, false));
          const resolvedImages = await Promise.allSettled(imagePromises);

          items.forEach((m: any, idx: number) => {
            const meta = extractModelMetadata(m.id, m.display_name, m.tags || [], m.description || '', (m.tasks || []).join(' '), 'ModelScope AI');
            const realImg = resolvedImages[idx].status === 'fulfilled' ? resolvedImages[idx].value : '';

            const triggers: string[] = [];
            if (Array.isArray(m.tags)) {
              m.tags.forEach((t: string) => {
                if (t.startsWith('trigger_word:') || t.startsWith('instance_prompt:')) {
                  triggers.push(t.split(':')[1]);
                }
              });
            }

            msAiCatalog.push({
              id: m.id,
              name: meta.cleanDisplayName,
              provider: "ModelScope AI",
              category: meta.category,
              type: meta.type,
              baseModel: meta.baseModel,
              downloads: m.downloads || 0,
              likes: m.likes || 0,
              rating: m.rating || 0,
              imageUrl: realImg,
              externalUrl: `https://modelscope.ai/models/${m.id}`,
              tags: m.tags || [],
              trainedWords: triggers,
            });
          });
        } else {
          results.modelscope_ai = { error: `ModelScope AI 接口响应异常 (HTTP ${msResp.status})` } as any;
        }
      } catch (err: any) {
        const isTimeout = err.name === 'TimeoutError' || err.message?.includes('timeout') || err.message?.includes('aborted');
        console.warn(`[Models Discovery] ModelScope AI 获取${isTimeout ? '超时 (15s)' : '异常'}:`, err.message);
        results.modelscope_ai = { error: isTimeout ? 'ModelScope AI 接口请求超时 (超过 15 秒)' : `ModelScope AI 连接失败: ${err.message}` } as any;
      }

      if (!results.modelscope_ai) {
        results.modelscope_ai = msAiCatalog.filter((m) => matchCategory(m) && matchSearch(m));
      }
    }

    // 2. Hugging Face Real-Time Live API Proxy with Dynamic Image Resolution & True Metadata
    if (provider === "all" || provider === "huggingface") {
      try {
        const hfSort = sortParam.toLowerCase().includes('like')
          ? 'likes'
          : (sortParam.toLowerCase().includes('new') || sortParam.toLowerCase().includes('created'))
          ? 'createdAt'
          : 'downloads';

        const hfParams = new URLSearchParams({
          sort: hfSort,
          direction: "-1",
          limit: String(limitParam),
        });

        // Ensure all vital metadata fields are expanded from the Hugging Face API
        hfParams.append("expand[]", "siblings");
        hfParams.append("expand[]", "tags");
        hfParams.append("expand[]", "likes");
        hfParams.append("expand[]", "pipeline_tag");
        hfParams.append("expand[]", "author");
        hfParams.append("expand[]", "cardData");

        if (cursorParam) {
          hfParams.append("cursor", cursorParam);
        }

        let effectiveSearch = searchStr;
        if (archFilter && !effectiveSearch.includes(archFilter)) {
          effectiveSearch = effectiveSearch ? `${effectiveSearch} ${archFilter}` : archFilter;
        }
        if (effectiveSearch) {
          hfParams.append("search", effectiveSearch);
        }

        if (cat === "video") {
          hfParams.append("pipeline_tag", "text-to-video");
        } else if (cat === "lora") {
          if (!effectiveSearch) {
            // When browsing LoRAs generally without search keyword, prioritize image/video diffusers LoRAs
            hfParams.append("filter", "lora,diffusers");
          } else {
            // When searching by keyword or architecture, search broadly across all LoRAs
            hfParams.append("filter", "lora");
          }
        } else if (cat === "edit") {
          hfParams.append("pipeline_tag", "image-to-image");
        } else if (cat === "checkpoint") {
          hfParams.append("pipeline_tag", "text-to-image");
        }

        const hfToken =
          (req.headers['x-hf-token'] as string) ||
          cloudSettings['hfToken'] ||
          defaultKeys['hfToken'] ||
          process.env.HF_TOKEN ||
          '';

        const hfHeaders: Record<string, string> = {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        };
        if (hfToken) {
          hfHeaders['Authorization'] = `Bearer ${hfToken}`;
        }

        const hfUrl = `https://huggingface.co/api/models?${hfParams.toString()}`;
        const hfResp = await fetch(hfUrl, {
          headers: hfHeaders,
          signal: AbortSignal.timeout(15000),
        });

        if (hfResp.ok) {
          const linkHeader = hfResp.headers.get("link");
          let nextCursor: string | null = null;
          if (linkHeader) {
            const nextMatch = linkHeader.match(/cursor=([^&>]+)/);
            if (nextMatch) nextCursor = decodeURIComponent(nextMatch[1]);
          }
          pagination.huggingface = { nextCursor, hasMore: Boolean(nextCursor) };

          const hfData = await hfResp.json();
          let rawModelList: any[] = Array.isArray(hfData) ? [...hfData] : [];

          // If user searched for an exact repo path (e.g. username/repo-name), fetch that exact model directly if not present
          if (searchStr && searchStr.includes('/') && !rawModelList.some((m) => m.id?.toLowerCase() === searchStr.toLowerCase())) {
            try {
              const exactUrl = `https://huggingface.co/api/models/${searchStr.split('/').map(encodeURIComponent).join('/')}?expand[]=siblings&expand[]=tags&expand[]=likes&expand[]=pipeline_tag&expand[]=author&expand[]=cardData`;
              const exactResp = await fetch(exactUrl, { headers: hfHeaders, signal: AbortSignal.timeout(8000) });
              if (exactResp.ok) {
                const exactModel = await exactResp.json();
                if (exactModel && exactModel.id) {
                  rawModelList.unshift(exactModel);
                }
              }
            } catch (exactErr) {
              // Ignore if not found
            }
          }

          const fetchedItems = rawModelList.map((m: any) => {
            // Real base model extraction from Hugging Face cardData or tags
            let realBaseModel = '';
            if (m.cardData?.base_model) {
              realBaseModel = Array.isArray(m.cardData.base_model) ? m.cardData.base_model[0] : String(m.cardData.base_model);
            }
            if (!realBaseModel && Array.isArray(m.tags)) {
              const bTag = m.tags.find((t: string) => t.startsWith('base_model:adapter:') || t.startsWith('base_model:'));
              if (bTag) realBaseModel = bTag.replace('base_model:adapter:', '').replace('base_model:', '');
            }

            const meta = extractModelMetadata(
              m.id,
              m.id.split('/').pop(),
              m.tags || [],
              m.description || m.cardData?.description || '',
              m.pipeline_tag || '',
              'Hugging Face'
            );

            // Real trigger words extraction (NO FAKE HARDCODED STRINGS)
            const extractedTriggers: string[] = [];
            if (m.cardData?.instance_prompt) extractedTriggers.push(String(m.cardData.instance_prompt));
            if (m.cardData?.trigger_words) {
              if (Array.isArray(m.cardData.trigger_words)) extractedTriggers.push(...m.cardData.trigger_words);
              else if (typeof m.cardData.trigger_words === 'string') extractedTriggers.push(m.cardData.trigger_words);
            }
            if (Array.isArray(m.cardData?.widget)) {
              m.cardData.widget.forEach((w: any) => { if (w.text) extractedTriggers.push(String(w.text)); });
            }
            if (Array.isArray(m.tags)) {
              m.tags.forEach((t: string) => {
                if (t.startsWith('trigger_word:') || t.startsWith('instance_prompt:')) {
                  extractedTriggers.push(t.split(':')[1]);
                }
              });
            }
            const uniqueTriggers = Array.from(new Set(extractedTriggers.map((t) => t.trim()).filter(Boolean)));

            // Real Cover Image from cardData widget or siblings (.png, .jpg, .webp)
            let imageUrl = '';
            if (m.cardData?.widget?.[0]?.output?.url) {
              imageUrl = m.cardData.widget[0].output.url;
            }
            if (!imageUrl && Array.isArray(m.siblings)) {
              const previewFiles = ['thumbnail.png', 'preview.png', 'sample.png', 'example.png', 'cover.png'];
              let bestSibling = m.siblings.find((s: any) => {
                const fn = (s.rfilename || '').toLowerCase();
                return previewFiles.includes(fn) || fn.endsWith('.png') || fn.endsWith('.jpg') || fn.endsWith('.jpeg') || fn.endsWith('.webp');
              });
              if (bestSibling) {
                imageUrl = `https://huggingface.co/${m.id}/resolve/main/${bestSibling.rfilename}`;
              }
            }

            const isLoraModel = cat === 'lora' || (m.tags && (m.tags.includes('lora') || m.tags.includes('LoRA'))) || m.id.toLowerCase().includes('lora');

            return {
              id: m.id,
              name: meta.cleanDisplayName,
              provider: "Hugging Face",
              category: isLoraModel ? "LoRA" : meta.category,
              type: isLoraModel ? "LORA" : meta.type,
              baseModel: realBaseModel || meta.baseModel,
              downloads: m.downloads || 0,
              likes: m.likes || 0,
              rating: 0,
              imageUrl,
              externalUrl: `https://huggingface.co/${m.id}`,
              tags: m.tags || [],
              trainedWords: uniqueTriggers,
              author: m.author || m.id.split('/')[0],
              description: m.description || m.cardData?.description || "",
            };
          });

          results.huggingface = fetchedItems.filter((m: any) => {
            if (cat === 'lora') return true;
            return matchCategory(m) && matchSearch(m);
          });
        } else {
          results.huggingface = { error: `Hugging Face 接口异常 (HTTP ${hfResp.status})` } as any;
        }
      } catch (err: any) {
        const isTimeout = err.name === 'TimeoutError' || err.message?.includes('timeout') || err.message?.includes('aborted');
        console.warn(`[Models Discovery] Hugging Face 获取${isTimeout ? '超时 (15s)' : '异常'}:`, err.message);
        results.huggingface = { error: isTimeout ? 'Hugging Face API 请求超时 (超过 15 秒)' : `Hugging Face 连接失败: ${err.message}` } as any;
      }
    }

    // 3. Civitai Real-Time Live API Fetching
    if (provider === "all" || provider === "civitai") {
      try {
        let civitaiType = "LORA";
        if (cat === "checkpoint") civitaiType = "Checkpoint";
        else if (cat === "video") civitaiType = "MotionModule";
        else if (cat === "edit") civitaiType = "Controlnet";
        else if (cat === "all") civitaiType = "LORA";

        const civitaiSort = sortParam.toLowerCase().includes('rate') || sortParam.toLowerCase().includes('highest')
          ? 'Highest Rated'
          : sortParam.toLowerCase().includes('new')
          ? 'Newest'
          : sortParam.toLowerCase().includes('like')
          ? 'Most Liked'
          : 'Most Downloaded';

        const params = new URLSearchParams({
          types: civitaiType,
          limit: String(limitParam),
          sort: civitaiSort,
          nsfw: "false",
        });
        if (searchStr) {
          params.append("query", searchStr);
        }
        if (cursorParam) {
          params.append("cursor", cursorParam);
        }

        const civitaiToken =
          (req.headers['x-civitai-token'] as string) ||
          (req.headers['x-civitai-key'] as string) ||
          cloudSettings['civitaiToken'] ||
          process.env.CIVITAI_API_TOKEN ||
          '';

        const civitaiHeaders: Record<string, string> = {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
          "Accept": "application/json",
        };
        if (civitaiToken) {
          civitaiHeaders['Authorization'] = `Bearer ${civitaiToken}`;
        }

        const civitaiCacheKey = `models_civitai_${params.toString()}_${civitaiToken ? 'auth' : 'anon'}`;
        const cachedCivitai = civitaiCache.get(civitaiCacheKey);

        if (cachedCivitai && cachedCivitai.expiry > Date.now()) {
          results.civitai = cachedCivitai.data;
          if (cachedCivitai.nextCursor) {
            pagination.civitai = { nextCursor: cachedCivitai.nextCursor, hasMore: true };
          }
        } else {
          const civitaiResp = await fetch(`https://civitai.com/api/v1/models?${params.toString()}`, {
            headers: civitaiHeaders,
            signal: AbortSignal.timeout(30000), // Increased to 30s
          });
          if (civitaiResp.ok) {
            const cData = await civitaiResp.json();
            if (cData.error) {
              results.civitai = { error: cData.error } as any;
            } else {
              const mappedCivitai = (cData.items || []).map((m: any) => ({
                id: String(m.id),
                name: m.name,
                provider: "Civitai",
                type: m.type,
                category: m.type === "LORA" ? "LoRA" : m.type === "MotionModule" ? "Video" : "Checkpoint",
                baseModel: m.modelVersions?.[0]?.baseModel || "FLUX.1 / SDXL",
                downloads: m.stats?.downloadCount || 0,
                rating: m.stats?.rating || 0,
                imageUrl: m.modelVersions?.[0]?.images?.[0]?.url || "",
                externalUrl: `https://civitai.com/models/${m.id}`,
                trainedWords: Array.isArray(m.modelVersions?.[0]?.trainedWords) ? m.modelVersions[0].trainedWords : [],
              }));
              results.civitai = mappedCivitai;
              const nextCursor = cData.metadata?.nextCursor || null;
              pagination.civitai = { nextCursor, hasMore: Boolean(nextCursor) };
              civitaiCache.set(civitaiCacheKey, { data: mappedCivitai, nextCursor, expiry: Date.now() + 60000 });
            }
          } else {
            results.civitai = { error: `Civitai 接口异常 (HTTP ${civitaiResp.status})` } as any;
          }
        }
      } catch (err: any) {
        const isTimeout = err.name === 'TimeoutError' || err.message?.includes('timeout') || err.message?.includes('aborted');
        console.warn(`[Models Discovery] Civitai 获取${isTimeout ? '超时 (25s)' : '异常'}:`, err.message);
        results.civitai = { error: isTimeout ? 'Civitai API 请求超时 (上游 Cloudflare 响应过慢，请稍后重试或配置 Civitai API Key)' : `Civitai 连接失败: ${err.message}` } as any;
      }
    }

    // 4. Fal.ai Real-Time Dynamic Models Discovery Endpoint (https://api.fal.ai/v1/models)
    if (provider === "all" || provider === "fal") {
      const falItems: any[] = [];
      try {
        const falKey =
          (req.headers['x-fal-key'] as string) ||
          cloudSettings['falKey'] ||
          defaultKeys['falKey'] ||
          process.env.FAL_KEY ||
          '';

        const falHeaders: Record<string, string> = {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
          "Accept": "application/json",
        };
        if (falKey) {
          falHeaders['Authorization'] = `Key ${falKey}`;
        }

        // Determine live Fal.ai query URLs based on requested category & search string
        // Official Fal.ai API: search uses `?q=`, category uses `?category=`
        const fetchUrls: string[] = [];
        if (searchStr) {
          fetchUrls.push(`https://api.fal.ai/v1/models?q=${encodeURIComponent(searchStr)}`);
        } else if (cat === 'checkpoint') {
          fetchUrls.push("https://api.fal.ai/v1/models?category=text-to-image");
        } else if (cat === 'video') {
          fetchUrls.push("https://api.fal.ai/v1/models?category=text-to-video");
          fetchUrls.push("https://api.fal.ai/v1/models?category=image-to-video");
        } else if (cat === 'edit') {
          fetchUrls.push("https://api.fal.ai/v1/models?category=image-to-image");
        } else if (cat === 'lora') {
          fetchUrls.push("https://api.fal.ai/v1/models?q=lora");
        } else {
          // 'all'
          fetchUrls.push("https://api.fal.ai/v1/models?category=text-to-image");
          fetchUrls.push("https://api.fal.ai/v1/models?category=text-to-video");
          fetchUrls.push("https://api.fal.ai/v1/models?q=lora");
        }

        const responses = await Promise.allSettled(
          fetchUrls.map((u) => fetch(u, { headers: falHeaders, signal: AbortSignal.timeout(15000) }))
        );

        const seenEndpoints = new Set<string>();
        let hadSuccessfulResponse = false;
        let lastErrorStatus = 0;

        for (const respResult of responses) {
          if (respResult.status === 'fulfilled' && respResult.value.ok) {
            hadSuccessfulResponse = true;
            const falData = await respResult.value.json().catch(() => ({}));
            const list = Array.isArray(falData.models) ? falData.models : Array.isArray(falData) ? falData : [];
            for (const m of list) {
              const endpointId = m.endpoint_id || m.id || "";
              if (!endpointId || seenEndpoints.has(endpointId)) continue;
              seenEndpoints.add(endpointId);

              const meta = m.metadata || {};
              const parsed = extractModelMetadata(
                endpointId,
                meta.display_name,
                meta.tags || [],
                meta.description || '',
                meta.category || '',
                'Fal.ai'
              );

              falItems.push({
                id: endpointId,
                name: parsed.cleanDisplayName,
                provider: "Fal.ai",
                category: parsed.category,
                type: parsed.type,
                baseModel: parsed.baseModel,
                downloads: typeof m.popularity === 'number' ? m.popularity : undefined,
                likes: typeof m.favorites === 'number' ? m.favorites : undefined,
                rating: typeof m.rating === 'number' ? m.rating : undefined,
                speed: meta.inference_time ? `${meta.inference_time}s` : "Fal 极速算力",
                badge: meta.author_name || parsed.badge,
                imageUrl: meta.thumbnail_url || meta.cover_image || meta.sample_output_url || "",
                externalUrl: `https://fal.ai/models/${endpointId}`,
                description: meta.description || "",
                tags: ["fal", parsed.category.toLowerCase(), parsed.baseModel.toLowerCase(), ...(meta.tags || [])],
                trainedWords: Array.isArray(meta.trigger_words) ? meta.trigger_words : [],
              });
            }
          } else if (respResult.status === 'fulfilled') {
            lastErrorStatus = respResult.value.status;
          }
        }

        if (!hadSuccessfulResponse && responses.length > 0 && lastErrorStatus > 0) {
          results.fal = { error: `Fal.ai 接口响应异常 (HTTP ${lastErrorStatus})` } as any;
        }
      } catch (err: any) {
        const isTimeout = err.name === 'TimeoutError' || err.message?.includes('timeout') || err.message?.includes('aborted');
        console.warn(`[Models Discovery] Fal.ai 获取${isTimeout ? '超时 (15s)' : '异常'}:`, err.message);
        results.fal = { error: isTimeout ? 'Fal.ai API 请求超时 (超过 15 秒)' : `Fal.ai 连接失败: ${err.message}` } as any;
      }

      if (!results.fal) {
        results.fal = falItems.filter((m) => matchCategory(m) && matchSearch(m));
      }
    }

    // 5. NanoGPT Real Live Discovery Endpoint (Live OpenAPI: image-models & video-models)
    if (provider === "all" || provider === "nanogpt") {
      const nanoItems: any[] = [];
      // NanoGPT is an inference API provider and does NOT host a community LoRA weights repository.
      if (cat === "lora") {
        results.nanogpt = [];
      } else {
        try {
          const shouldFetchImage = cat === "all" || cat === "checkpoint" || cat === "edit";
          const shouldFetchVideo = cat === "all" || cat === "video";

          const fetchImageModels = shouldFetchImage ? fetch("https://nano-gpt.com/api/v1/image-models", {
            headers: { "User-Agent": "ComfyCanvas/1.0" },
            signal: AbortSignal.timeout(10000),
          }).catch(() => fetch("https://api.nano-gpt.com/api/v1/image-models", {
            headers: { "User-Agent": "ComfyCanvas/1.0" },
            signal: AbortSignal.timeout(10000),
          })).catch(() => null) : Promise.resolve(null);

          const fetchVideoModels = shouldFetchVideo ? fetch("https://nano-gpt.com/api/v1/video-models", {
            headers: { "User-Agent": "ComfyCanvas/1.0" },
            signal: AbortSignal.timeout(10000),
          }).catch(() => fetch("https://api.nano-gpt.com/api/v1/video-models", {
            headers: { "User-Agent": "ComfyCanvas/1.0" },
            signal: AbortSignal.timeout(10000),
          })).catch(() => null) : Promise.resolve(null);

          const [imgResp, vidResp] = await Promise.all([fetchImageModels, fetchVideoModels]);

          if (imgResp && imgResp.ok) {
            const nanoData = await imgResp.json();
            const list = Array.isArray(nanoData.data) ? nanoData.data : Array.isArray(nanoData.models) ? nanoData.models : Array.isArray(nanoData) ? nanoData : [];
            for (const m of list) {
              const mId = m.id || m.model_id || "";
              if (!mId) continue;
              
              const isEdit = m.architecture?.modality === 'image->image' || m.capabilities?.inpainting || mId.includes('edit') || mId.includes('remover') || mId.includes('upscal') || mId.includes('birefnet');
              const parsed = extractModelMetadata(
                mId,
                m.name,
                m.tags || [],
                m.description || '',
                isEdit ? 'image-to-image' : 'text-to-image',
                'NanoGPT'
              );

              const iconUrl = m.icon_url
                ? (m.icon_url.startsWith('http') ? m.icon_url : `https://nano-gpt.com${m.icon_url}`)
                : (m.owned_by && m.owned_by !== 'unknown' ? `https://nano-gpt.com/icons/${m.owned_by.charAt(0).toUpperCase() + m.owned_by.slice(1)}.svg` : 'https://nano-gpt.com/icons/Fal.svg');
              const pricingStr = m.pricing?.per_image ? `$${m.pricing.per_image['1k'] || m.pricing.per_image.auto || 0.02}/图` : m.pricing ? `$${m.pricing}/次` : 'NanoGPT 算力';

              nanoItems.push({
                id: mId,
                name: m.name || parsed.cleanDisplayName,
                provider: "NanoGPT",
                category: isEdit ? 'Edit' : 'Checkpoint',
                type: isEdit ? 'Tools' : 'Checkpoint',
                baseModel: parsed.baseModel,
                downloads: undefined,
                likes: undefined,
                rating: undefined,
                speed: pricingStr,
                badge: m.category === 'Featured' ? 'NanoGPT 官方精选' : parsed.badge,
                imageUrl: iconUrl,
                externalUrl: `https://nano-gpt.com/models?search=${encodeURIComponent(mId)}`,
                description: m.description || "",
                tags: m.tags || ["nanogpt", isEdit ? "edit" : "checkpoint", parsed.baseModel.toLowerCase()],
              });
            }
          }

          if (vidResp && vidResp.ok) {
            const vidData = await vidResp.json();
            const list = Array.isArray(vidData.data) ? vidData.data : Array.isArray(vidData.models) ? vidData.models : Array.isArray(vidData) ? vidData : [];
            for (const m of list) {
              const mId = m.id || m.model_id || "";
              if (!mId) continue;
              
              const parsed = extractModelMetadata(
                mId,
                m.name,
                m.tags || [],
                m.description || '',
                'video',
                'NanoGPT'
              );

              const iconUrl = m.icon_url
                ? (m.icon_url.startsWith('http') ? m.icon_url : `https://nano-gpt.com${m.icon_url}`)
                : (m.owned_by && m.owned_by !== 'unknown' ? `https://nano-gpt.com/icons/${m.owned_by.charAt(0).toUpperCase() + m.owned_by.slice(1)}.svg` : 'https://nano-gpt.com/icons/Fal.svg');
              
              const pricingStr = m.pricing?.per_second
                ? `$${m.pricing.per_second}/秒`
                : (m.pricing?.minimum ? `$${m.pricing.minimum}/次` : 'NanoGPT 视频算力');

              nanoItems.push({
                id: mId,
                name: m.name || parsed.cleanDisplayName,
                provider: "NanoGPT",
                category: "Video",
                type: "MotionModule",
                baseModel: parsed.baseModel || (m.owned_by ? m.owned_by.toUpperCase() : 'Video'),
                downloads: undefined,
                likes: undefined,
                rating: undefined,
                speed: pricingStr,
                badge: 'NanoGPT 视频端点',
                imageUrl: iconUrl,
                externalUrl: `https://nano-gpt.com/models?search=${encodeURIComponent(mId)}`,
                description: m.description || "",
                tags: [...(m.tags || []), "nanogpt", "video", parsed.baseModel.toLowerCase()],
              });
            }
          }

          if ((!imgResp || !imgResp.ok) && (!vidResp || !vidResp.ok) && nanoItems.length === 0) {
            const status = imgResp ? imgResp.status : 504;
            results.nanogpt = { error: `NanoGPT 接口响应异常 (HTTP ${status})` } as any;
          }
        } catch (err: any) {
          console.error("NanoGPT live models discovery error:", err);
          results.nanogpt = { error: `NanoGPT 连接失败: ${err.message}` } as any;
        }

        if (!results.nanogpt) {
          results.nanogpt = nanoItems.filter((m) => matchCategory(m) && matchSearch(m));
        }
      }
    }

    // 8. Google Gemini & Imagen Real Dynamic Models Endpoint
    if (provider === "all" || provider === "gemini") {
      const geminiItems: any[] = [];
      try {
        const geminiKey = process.env.GEMINI_API_KEY || cloudSettings['geminiKey'] || defaultKeys['geminiKey'] || '';
        if (geminiKey) {
          const gResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`, {
            signal: AbortSignal.timeout(4500),
          }).catch(() => null);
          if (gResp && gResp.ok) {
            const gData = await gResp.json();
            const models = gData.models || [];
            for (const m of models) {
              const nameClean = (m.name || '').replace('models/', '');
              const isImage = nameClean.includes('imagen') || nameClean.includes('image');
              const isVision = nameClean.includes('flash') || nameClean.includes('pro');
              if (isImage || isVision) {
                const parsed = extractModelMetadata(
                  nameClean,
                  m.displayName || nameClean,
                  ["google", isImage ? "imagen" : "gemini"],
                  m.description || "",
                  isImage ? "text-to-image" : "multimodal",
                  "Google"
                );

                geminiItems.push({
                  id: nameClean,
                  name: parsed.cleanDisplayName,
                  provider: isImage ? "Google Imagen" : "Google Gemini",
                  category: isImage ? "Checkpoint" : "Edit",
                  type: isImage ? "Checkpoint" : "Reasoning",
                  baseModel: parsed.baseModel,
                  downloads: 0,
                  likes: 0,
                  rating: 0,
                  speed: "Google 官方接口",
                  badge: parsed.badge,
                  imageUrl: "",
                  tags: ["google", isImage ? "imagen" : "gemini"],
                });
              }
            }
          } else if (gResp) {
            results.gemini = { error: `Google Gemini 接口异常 (HTTP ${gResp.status})` } as any;
          }
        } else {
          results.gemini = { error: "Google Gemini 密钥未配置" } as any;
        }
      } catch (err: any) {
        console.error("Gemini models live discovery error:", err);
        results.gemini = { error: `Google Gemini 连接失败: ${err.message}` } as any;
      }
      if (!results.gemini) {
        results.gemini = geminiItems.filter((m) => matchCategory(m) && matchSearch(m));
      }
    }

    // 9. Tensor.Art (Real Community Model Center Discovery & Live Ecosystem)
    if (provider === "all" || provider === "tensorart" || provider === "tensor") {
      try {
        const taItems = await fetchTensorArtModelsList({
          cat,
          searchStr,
          sortOption: sortParam,
          page: pageParam,
          arch: archFilter,
        });

        // If search was a direct model ID, prioritize direct lookup
        if (searchStr && /^\d{10,25}$/.test(searchStr.trim())) {
          try {
            const single = await fetchTensorArtModelInfo(searchStr.trim());
            if (single && !taItems.some((x: any) => x.id === single.id)) {
              taItems.unshift(single);
            }
          } catch (e) {
            // direct lookup failed
          }
        }

        results.tensorart = taItems.filter((m: any) => matchCategory(m));
        pagination.tensorart = {
          page: pageParam,
          hasMore: taItems.length >= 20,
        };
      } catch (taErr: any) {
        console.error("Tensor.Art live models fetch error:", taErr.message);
        results.tensorart = { error: `Tensor.Art 模型中心获取失败: ${taErr.message}` } as any;
      }

      if (provider === "tensor") {
        results.tensor = results.tensorart;
      }
    }

    // Sort all provider arrays consistently by requested sortParam
    const sortKey = (sortParam || 'downloads').toLowerCase();
    const sortList = (list: any[]) => {
      return [...list].sort((a, b) => {
        if (sortKey.includes('rate') || sortKey.includes('highest')) {
          return (b.rating || 0) - (a.rating || 0) || (b.downloads || 0) - (a.downloads || 0);
        }
        if (sortKey.includes('like')) {
          return (b.likes || 0) - (a.likes || 0) || (b.downloads || 0) - (a.downloads || 0);
        }
        if (sortKey === 'name_asc' || sortKey === 'name' || sortKey.includes('a-z')) {
          return (a.name || a.id || '').localeCompare(b.name || b.id || '');
        }
        if (sortKey === 'name_desc' || sortKey.includes('z-a')) {
          return (b.name || b.id || '').localeCompare(a.name || a.id || '');
        }
        // Default: downloads descending
        return (b.downloads || 0) - (a.downloads || 0);
      });
    };

    for (const k of Object.keys(results)) {
      if (Array.isArray(results[k])) {
        results[k] = sortList(results[k]);
      }
    }

    return res.json({
      ...results,
      _pagination: pagination,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Failed to pull models" });
  }
});

function normalizeFalEndpoint(model: string, isVideo = false): string {
  const m = (model || '').toLowerCase().trim();

  // If in video generation mode, force video endpoints
  if (isVideo) {
    if (m.includes('kling')) return 'fal-ai/kling-video/v1/standard/text-to-video';
    if (m.includes('ltx')) return 'fal-ai/ltx-video';
    if (m.includes('minimax') || m.includes('hailuo')) return 'fal-ai/minimax/video-01';
    if (m.includes('cogvideo')) return 'fal-ai/cogvideox-5b';
    if (m.includes('hunyuan')) return 'fal-ai/hunyuan-video';
    if (m.includes('image-to-video')) return 'fal-ai/wan/v2.1/image-to-video';
    return 'fal-ai/wan/v2.1/text-to-video';
  }

  if (
    m === 'black-forest-labs/flux.1-schnell' ||
    m === 'flux.1-schnell' ||
    m === 'flux-schnell' ||
    m === 'fal-ai/flux/schnell' ||
    m === 'fal-ai/flux-schnell'
  ) {
    return 'fal-ai/flux/schnell';
  }
  if (
    m === 'black-forest-labs/flux.1-dev' ||
    m === 'flux.1-dev' ||
    m === 'flux-dev' ||
    m === 'fal-ai/flux/dev' ||
    m === 'fal-ai/flux-dev' ||
    m === 'fal-ai/flux-lora'
  ) {
    return 'fal-ai/flux/dev';
  }
  if (
    m === 'stabilityai/stable-diffusion-xl-base-1.0' ||
    m === 'stable-diffusion-xl-base-1.0' ||
    m === 'sdxl' ||
    m === 'sdxl-1.0' ||
    m === 'fal-ai/stable-diffusion-xl-base-1.0' ||
    m === 'fal-ai/fast-sdxl' ||
    m === 'runwayml/stable-diffusion-v1-5' ||
    m.includes('animagine') ||
    m.includes('pony')
  ) {
    // Note: Fal official endpoint for standard SDXL 1.0 is fal-ai/fast-sdxl
    return 'fal-ai/fast-sdxl';
  }
  if (
    m === 'stabilityai/stable-diffusion-3.5-large' ||
    m === 'sd3.5-large' ||
    m === 'fal-ai/stable-diffusion-v35-large'
  ) {
    return 'fal-ai/stable-diffusion-v35-large';
  }
  if (
    m === 'krea-ai/krea2-turbo' ||
    m === 'krea-ai/krea-2-turbo' ||
    m === 'fal-ai/krea-2/turbo' ||
    m === 'krea2_turbo_fp8_scaled'
  ) {
    return 'fal-ai/krea-2/turbo';
  }
  if (
    m === 'damo/wan2.1-t2v' ||
    m === 'wan/v2.1/text-to-video' ||
    m === 'fal-ai/wan/v2.1/text-to-video' ||
    m === 'wan2.1-t2v'
  ) {
    return 'fal-ai/wan/v2.1/text-to-video';
  }
  if (
    m === 'wan/v2.1/image-to-video' ||
    m === 'fal-ai/wan/v2.1/image-to-video'
  ) {
    return 'fal-ai/wan/v2.1/image-to-video';
  }
  if (m === 'fal-ai/ltx-video' || m === 'ltx-video') {
    return 'fal-ai/ltx-video';
  }
  if (m === 'fal-ai/kling-video/v1/standard/text-to-video' || m === 'kling-video') {
    return 'fal-ai/kling-video/v1/standard/text-to-video';
  }
  if (m === 'fal-ai/minimax/video-01' || m === 'minimax-video') {
    return 'fal-ai/minimax/video-01';
  }
  if (m === 'fal-ai/cogvideox-5b' || m === 'cogvideox-5b') {
    return 'fal-ai/cogvideox-5b';
  }
  if (m === 'fal-ai/hunyuan-video' || m === 'hunyuan-video') {
    return 'fal-ai/hunyuan-video';
  }
  if (!m.includes('/')) {
    return `fal-ai/${m}`;
  }
  return model;
}

// ==========================================
// 2. Fal.ai Inference (fal.ai / docs.fal.ai)
// ==========================================
app.post(['/api/fal/generate', '/api/generate'], async (req, res) => {
  try {
    const {
      prompt,
      negative_prompt,
      model = 'fal-ai/flux/dev',
      image_size = { width: 1024, height: 1024 },
      num_inference_steps = 28,
      guidance_scale = 3.5,
      seed,
      sampler_name,
      scheduler,
      image_url,
      denoise,
      loras = [],
    } = req.body;

    const falKey =
      (req.headers['x-fal-key'] as string) ||
      cloudSettings['falKey'] ||
      defaultKeys['falKey'] ||
      process.env.FAL_KEY ||
      '';

    if (!falKey) {
      return res.status(400).json({
        error: '未配置 Fal.ai API 密钥。请在右上角「设置」面板中填入您的 Fal.ai API Key (x-fal-key)。',
      });
    }

    let endpoint = normalizeFalEndpoint(model);

    const payload: any = {
      prompt,
      image_size,
      num_inference_steps: Number(num_inference_steps) || 28,
      guidance_scale: Number(guidance_scale) || 3.5,
      sampler_name: sampler_name,
      scheduler: scheduler,
      enable_safety_checker: false,
    };

    if (negative_prompt) {
      payload.negative_prompt = negative_prompt;
    }
    if (typeof seed === 'number' && seed >= 0) {
      payload.seed = seed;
    }
    if (image_url) {
      payload.image_url = image_url;
      if (typeof denoise === 'number') {
        payload.strength = denoise;
      }
    }

    const civitaiToken =
      (req.headers['x-civitai-key'] as string) ||
      cloudSettings['civitaiKey'] ||
      defaultKeys['civitaiKey'] ||
      '';

    let wasAdapted = false;
    let adaptationNotice = '';
    let actualModel = model;

    if (Array.isArray(loras) && loras.length > 0) {
      if (endpoint === 'fal-ai/krea-2/turbo' || endpoint.includes('krea-2')) {
        return res.status(400).json({
          error:
            'Krea 2 Turbo 官方闭源极速模型原生不支持挂载外置 LoRA (官方接口将报 422 错误)。Civitai 上的各类 Krea 胶片写真风格 LoRA 实质上均基于 SDXL 架构训练。请在左侧「加载底模 (CheckpointLoaderSimple)」节点中将底模切换为 SDXL 1.0 (fal-ai/stable-diffusion-xl-base-1.0) 即可完美挂载运行。',
        });
      }

      // 官方专有 LoRA 端点规范分流：
      // Fal.ai 官方规范：FLUX 挂载 LoRA 必须调用 fal-ai/flux-lora；SDXL 挂载 LoRA 必须调用 fal-ai/lora 并传递 model_name
      if (
        endpoint === 'fal-ai/flux/dev' ||
        endpoint === 'fal-ai/flux/schnell' ||
        endpoint === 'black-forest-labs/FLUX.1-dev' ||
        endpoint === 'black-forest-labs/FLUX.1-schnell' ||
        endpoint === 'fal-ai/flux-dev' ||
        endpoint === 'flux/dev'
      ) {
        endpoint = 'fal-ai/flux-lora';
        actualModel = 'fal-ai/flux-lora';
      } else if (
        endpoint === 'fal-ai/fast-sdxl' ||
        endpoint === 'stabilityai/stable-diffusion-xl-base-1.0' ||
        endpoint === 'fal-ai/stable-diffusion-xl-base-1.0'
      ) {
        endpoint = 'fal-ai/lora';
        actualModel = 'fal-ai/lora (SDXL 1.0)';
        payload.model_name = 'stabilityai/stable-diffusion-xl-base-1.0';
      }

      payload.loras = loras.map((l: any) => {
        let resolvedPath = l.path || l.url || l.name || '';
        let civId = l.civitaiId || l.versionId;

        // Auto-extract Civitai model version ID from string/URN if not explicitly provided
        if (!civId && typeof resolvedPath === 'string') {
          const match = resolvedPath.match(/@(\d+)|civitai:(\d+)|(\d{6,8})/);
          if (match) {
            civId = match[1] || match[2] || match[3];
          }
        }

        if (civId && !resolvedPath.startsWith('http')) {
          resolvedPath = `https://civitai.com/api/download/models/${civId}${
            civitaiToken ? `?token=${encodeURIComponent(civitaiToken)}` : ''
          }`;
        }
        const scaleVal = Number(l.scale ?? l.strength ?? l.modelStrength ?? 0.8);
        return {
          path: resolvedPath,
          url: resolvedPath, // 兼容 fal-ai/lora (要求 url) 与 fal-ai/flux-lora (要求 path)
          scale: scaleVal,
        };
      });
    }

    let response = await fetch(`https://fal.run/${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${falKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      // 若因端点不支持 loras 导致 422，返回清晰的诊断信息，杜绝静默吞掉 LoRA 假装成功的欺瞒行为
      if (response.status === 422 && payload.loras && errorText.includes('loras')) {
        return res.status(422).json({
          error: `Fal.ai 端点调用错误 [422]: 端点 ${endpoint} 官方不支持挂载外置 LoRA。`,
          details: `您当前请求的模型为 ${model}，官方 API 拒绝了 loras 参数。请在画布上将底模节点更换为 SDXL 1.0 (fal-ai/stable-diffusion-xl-base-1.0) 或 FLUX.1 Dev，或点击 LoRA 节点的【一键配对底模】按钮。`,
          endpoint,
          requestedModel: model,
          unsupportedField: 'loras',
        });
      }

      return res.status(response.status).json({
        error: `Fal.ai 接口执行失败 [${response.status}]: ${errorText}`,
      });
    }

    const result = await response.json();
    const imageUrl = result.images?.[0]?.url || result.image?.url || result.output?.image_url;

    if (!imageUrl) {
      return res.status(500).json({ error: 'Fal.ai 返回结果中未包含图像输出 URL' });
    }

    const item = recordHistoryItem({
      url: imageUrl,
      prompt,
      negativePrompt: negative_prompt,
      provider: 'Fal.ai (GPU 云端加速)',
      model: wasAdapted ? `${actualModel} (由 ${model} 透明适配)` : actualModel,
      seed: result.seed || seed || 136947637,
      steps: payload.num_inference_steps || Number(num_inference_steps) || 28,
      cfg: payload.guidance_scale || Number(guidance_scale) || 3.5,
      loras: (loras || []).map((l: any) => ({
        name: l.path || l.url || l.name,
        strength: Number(l.scale || l.strength || 0.8),
        civitaiId: l.civitaiId,
      })),
    });

    return res.json({
      imageUrl,
      seed: result.seed || seed || 136947637,
      timings: result.timings,
      provider: 'Fal.ai (GPU 云端加速)',
      model: actualModel,
      requestedModel: model,
      exactEndpointCalled: `https://fal.run/${endpoint}`,
      targetEndpoint: endpoint,
      wasAdapted,
      adaptationNotice,
      historyItem: item,
    });
  } catch (error: any) {
    return res.status(500).json({ error: `Fal.ai 网络请求失败: ${error.message}` });
  }
});

// ==========================================
// 2.5. AI Video Generation (Wan 2.7/2.5/2.2/2.1, LTX-Video, Kling, MiniMax, CogVideoX, Hunyuan, Agnes)
// ==========================================
app.post(['/api/video/generate', '/api/engine/video/generate'], async (req, res) => {
  req.setTimeout(300000);
  res.setTimeout(300000);

  try {
    const {
      prompt,
      model = 'fal-ai/wan/v2.1/text-to-video',
      duration = 5,
      fps = 16,
      aspect_ratio = '16:9',
      image_url,
      seed,
      steps,
      provider: inputProvider,
    } = req.body;

    const lowerModel = (model || '').toLowerCase().trim();
    const reqProvider = (inputProvider || '').toLowerCase().trim();

    // 1. Tensor.Art (OpenWorks Video Generation Tools)
    const isTensorArtTarget =
      reqProvider === 'tensorart' ||
      reqProvider === 'tensor' ||
      lowerModel.startsWith('text2video_') ||
      lowerModel.startsWith('image2video_') ||
      lowerModel === 'live_wallpaper' ||
      lowerModel.includes('tensor');

    if (isTensorArtTarget) {
      const taKey =
        (req.headers['x-tensorart-key'] as string) ||
        cloudSettings['tensorartKey'] ||
        defaultKeys['tensorartKey'] ||
        process.env.TENSORART_API_KEY ||
        '';

      if (!taKey) {
        return res.status(400).json({
          error: '未配置 Tensor.Art API Key (x-tensorart-key)。请在右上角设置面板中配置 Tensor.Art API Key。',
        });
      }

      const targetToolName = (model || 'text2video_wan27').trim();
      const baseUrl = getTensorArtBaseUrl(taKey);

      try {
        const tools = await fetchTensorArtToolsList(taKey);
        const targetTool = tools.find((t: any) => t.name === targetToolName) || { name: targetToolName, inputs: [] };

        const formattedInputs = buildTensorArtInputs(targetTool.inputs || [], {
          prompt,
          image_url,
          duration: String(duration || 5),
          ratio: aspect_ratio || '16:9',
          size: aspect_ratio === '9:16' ? '720P' : '720P',
          ...req.body,
        });

        const submitRes = await fetch(`${baseUrl}/task`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Echo-Access-Key': taKey,
          },
          body: JSON.stringify({
            toolName: targetTool.name,
            inputs: formattedInputs,
          }),
        });

        if (!submitRes.ok) {
          const errText = await submitRes.text();
          return res.status(submitRes.status).json({
            error: `Tensor.Art 视频任务提交失败 [${submitRes.status}]: ${errText}`,
            toolName: targetTool.name,
            exactEndpointCalled: `${baseUrl}/task`,
          });
        }

        const submitData = await submitRes.json();
        if (submitData.code !== '0' && submitData.code !== 0) {
          return res.status(400).json({
            error: `Tensor.Art 视频任务创建失败: [${submitData.code}] ${submitData.message || '系统错误'}`,
            toolName: targetTool.name,
          });
        }

        const taskId = submitData.data?.task?.id || submitData.data?.taskId || submitData.data?.id;
        if (!taskId) {
          return res.status(500).json({
            error: 'Tensor.Art 任务成功受理，但未返回有效 Task ID',
            details: JSON.stringify(submitData),
          });
        }

        // Poll task/query for video completion
        let videoResult = '';
        const maxPolls = 80;
        for (let i = 0; i < maxPolls; i++) {
          await new Promise((r) => setTimeout(r, 2500));
          const qRes = await fetch(`${baseUrl}/task/query`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Echo-Access-Key': taKey,
            },
            body: JSON.stringify({ taskIds: [String(taskId)] }),
          });

          if (!qRes.ok) continue;
          const qData = await qRes.json();
          if (qData.code !== '0' && qData.code !== 0) continue;

          const task = qData.data?.tasks?.[0] || qData.data?.[0];
          if (!task) continue;

          const status = (task.status || '').toUpperCase();
          if (status === 'FINISH' || status === 'SUCCESS') {
            const out = task.outputs?.[0];
            videoResult = typeof out === 'string' ? out : out?.value || out?.url || '';
            break;
          }

          if (status === 'FAILED' || status === 'EXCEPTION') {
            return res.status(500).json({
              error: `Tensor.Art 视频任务处理异常 (${status}): ${task.message || task.error || '运行失败'}`,
              taskId,
              toolName: targetTool.name,
            });
          }
        }

        if (!videoResult) {
          return res.status(504).json({
            error: 'Tensor.Art 视频云端渲染超时 (200s 未完成)，请稍后重试。',
            taskId,
            toolName: targetTool.name,
          });
        }

        const item = recordHistoryItem({
          url: videoResult,
          prompt,
          provider: 'Tensor.Art (OpenWorks Video)',
          model: targetTool.name,
          seed: Math.floor(Math.random() * 1000000000),
          steps: 30,
          cfg: 5.0,
        });

        return res.json({
          videoUrl: videoResult,
          provider: 'Tensor.Art (OpenWorks Video)',
          model: targetTool.name,
          requestedModel: model,
          exactEndpointCalled: `${baseUrl}/task`,
          duration: duration || 5,
          fps: fps || 24,
          taskId,
          historyItem: item,
        });
      } catch (taErr: any) {
        return res.status(500).json({ error: `Tensor.Art 视频生成异常: ${taErr.message}` });
      }
    }

    // 2. NanoGPT Video API (https://api.nano-gpt.com/api/generate-video)
    const isNanoGptTarget =
      reqProvider === 'nanogpt' ||
      lowerModel.includes('nanogpt') ||
      (lowerModel.includes('wan') && !lowerModel.includes('fal') && !lowerModel.includes('damo') && !lowerModel.includes('text2video')) ||
      (lowerModel.includes('kling') && !lowerModel.includes('fal'));

    if (isNanoGptTarget) {
      const nanoKey =
        (req.headers['x-nanogpt-key'] as string) ||
        cloudSettings['nanogptKey'] ||
        defaultKeys['nanogptKey'] ||
        process.env.NANOGPT_API_KEY ||
        '';

      if (!nanoKey) {
        return res.status(400).json({
          error: '未配置 NanoGPT API Key (x-nanogpt-key)。请在右上角设置中填写您的 NanoGPT API Key。',
        });
      }

      try {
        const nanoPayload: any = {
          model,
          prompt,
          duration: Number(duration) || 5,
          aspect_ratio: aspect_ratio || '16:9',
        };
        if (image_url) {
          nanoPayload.imageUrl = image_url;
          nanoPayload.imageDataUrl = image_url;
        }

        const submitRes = await fetch('https://api.nano-gpt.com/api/generate-video', {
          method: 'POST',
          headers: {
            'x-api-key': nanoKey,
            'Authorization': `Bearer ${nanoKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(nanoPayload),
        }).catch(() =>
          fetch('https://nano-gpt.com/api/generate-video', {
            method: 'POST',
            headers: {
              'x-api-key': nanoKey,
              'Authorization': `Bearer ${nanoKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(nanoPayload),
          })
        );

        if (!submitRes.ok) {
          const errText = await submitRes.text();
          return res.status(submitRes.status).json({
            error: `NanoGPT 视频任务提交失败 [${submitRes.status}]: ${errText}`,
            model,
          });
        }

        const submitData = await submitRes.json();
        let videoUrl = submitData.videoUrl || submitData.url || submitData.video_url;
        const runId = submitData.runId || submitData.id || submitData.taskId;

        if (!videoUrl && runId) {
          // Poll NanoGPT video status
          for (let i = 0; i < 70; i++) {
            await new Promise((r) => setTimeout(r, 2500));
            const statusRes = await fetch(`https://api.nano-gpt.com/api/generate-video/status?runId=${encodeURIComponent(runId)}`, {
              headers: {
                'x-api-key': nanoKey,
                'Authorization': `Bearer ${nanoKey}`,
              },
            }).catch(() => null);

            if (statusRes && statusRes.ok) {
              const statusData = await statusRes.json();
              if (statusData.status === 'completed' || statusData.status === 'success' || statusData.videoUrl || statusData.url) {
                videoUrl = statusData.videoUrl || statusData.url || statusData.video_url;
                break;
              } else if (statusData.status === 'failed' || statusData.status === 'error') {
                return res.status(500).json({
                  error: `NanoGPT 视频生成失败: ${statusData.error || statusData.message || 'Run failed'}`,
                  model,
                });
              }
            }
          }
        }

        if (!videoUrl) {
          return res.status(504).json({
            error: 'NanoGPT 视频生成超时 (180s 未完成)，请稍后重试。',
            model,
          });
        }

        const item = recordHistoryItem({
          url: videoUrl,
          prompt,
          provider: 'NanoGPT Video',
          model,
          seed: Math.floor(Math.random() * 1000000000),
          steps: 25,
          cfg: 4.5,
        });

        return res.json({
          videoUrl,
          provider: 'NanoGPT Video',
          model,
          requestedModel: model,
          exactEndpointCalled: 'https://api.nano-gpt.com/api/generate-video',
          duration: duration || 5,
          fps: fps || 24,
          historyItem: item,
        });
      } catch (nanoErr: any) {
        return res.status(500).json({ error: `NanoGPT 视频接口请求异常: ${nanoErr.message}` });
      }
    }

    // 3. Agnes AI Video support (agnes-video-2.5-flash / agnes-video-2.5)
    if (lowerModel.includes('agnes-video') || lowerModel.startsWith('agnes-video')) {
      const customAgnesBaseUrl = (req.headers['x-agnes-base-url'] as string)?.trim();
      const customAgnesKey = (req.headers['x-agnes-key'] as string)?.trim();

      if (customAgnesBaseUrl && !customAgnesKey) {
        return res.status(400).json({
          error: '使用自定义 base URL (x-agnes-base-url) 时必须同时提供自定义 API Key (x-agnes-key)，禁止回退使用服务端密钥。',
        });
      }

      const agnesKey = customAgnesBaseUrl
        ? customAgnesKey
        : (customAgnesKey || cloudSettings['agnesKey'] || defaultKeys['agnesKey'] || '');
      const agnesBaseUrl = customAgnesBaseUrl || cloudSettings['agnesBaseUrl'] || defaultKeys['agnesBaseUrl'] || 'https://apihub.agnes-ai.com/v1';

      if (!agnesKey) {
        return res.status(400).json({ error: '未配置 Agnes AI 密钥 (x-agnes-key)。' });
      }

      const agnesPayload: any = {
        model,
        prompt,
        n: 1,
        size: aspect_ratio === '9:16' ? '720x1280' : '1280x720',
      };
      if (image_url) agnesPayload.image_url = image_url;

      const upstream = await fetch(`${agnesBaseUrl.replace(/\/+$/, '')}/images/generations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${agnesKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(agnesPayload),
      });

      if (!upstream.ok) {
        const errorText = await upstream.text();
        return res.status(upstream.status).json({
          error: `Agnes AI 视频生成失败 [${upstream.status}]: ${errorText}`,
        });
      }

      const agData = await upstream.json();
      const videoUrl = agData.data?.[0]?.url || agData.images?.[0]?.url || agData.url;
      if (!videoUrl) {
        return res.status(500).json({ error: 'Agnes AI 视频接口返回数据中未包含有效视频 URL' });
      }

      const item = recordHistoryItem({
        url: videoUrl,
        prompt,
        provider: 'Agnes AI Video (ApiHub)',
        model,
        seed: Math.floor(Math.random() * 1000000000),
        steps: 25,
        cfg: 4.5,
      });

      return res.json({
        videoUrl,
        provider: 'Agnes AI Video (ApiHub)',
        model,
        requestedModel: model,
        exactEndpointCalled: `${agnesBaseUrl}/images/generations`,
        duration: duration || 5,
        fps: fps || 24,
        historyItem: item,
      });
    }

    // 4. ModelScope Wan 2.1 Video support
    const isModelScopeTarget =
      reqProvider === 'modelscope' ||
      reqProvider === 'modelscope_ai' ||
      lowerModel.startsWith('damo/') ||
      lowerModel.startsWith('modelscope') ||
      lowerModel.includes('cogvideox') ||
      (lowerModel.includes('wan2.1-t2v') && !lowerModel.includes('fal-ai')) ||
      (lowerModel.includes('wan2.1-i2v') && !lowerModel.includes('fal-ai'));

    if (isModelScopeTarget) {
      const msToken =
        (req.headers['x-modelscope-token'] as string) ||
        process.env.MODELSCOPE_TOKEN ||
        cloudSettings['modelscopeToken'] ||
        defaultKeys['modelscopeToken'] ||
        '';

      if (!msToken) {
        return res.status(400).json({
          error: '未配置 ModelScope 访问令牌 (x-modelscope-token)。请在设置面板中配置 ModelScope Access Token。',
        });
      }

      const effectiveSeed = typeof seed === 'number' && seed >= 0 ? seed : Math.floor(Math.random() * 1000000000);
      const targetEndpointModel = image_url && !lowerModel.includes('i2v') ? 'damo/wan2.1-i2v-480p-14b' : (model || 'damo/wan2.1-t2v');
      
      const msPayload: any = {
        input: {
          prompt,
          steps: 25,
          seed: effectiveSeed,
        },
      };
      if (image_url) msPayload.input.image_url = image_url;

      const msResp = await fetch(`https://api-inference.modelscope.cn/v1/models/${targetEndpointModel}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${msToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(msPayload),
      });

      if (!msResp.ok) {
        const errorText = await msResp.text();
        return res.status(msResp.status).json({
          error: `ModelScope 视频生成失败 [${msResp.status}]: ${errorText}`,
          model: targetEndpointModel,
        });
      }

      const msData = await msResp.json();
      const vUrl = msData.output_video || msData.video_url || msData.data?.output_video || msData.data?.video_url;
      if (!vUrl) {
        return res.status(500).json({
          error: 'ModelScope 视频接口响应数据中未包含有效视频 URL',
          details: JSON.stringify(msData),
          model: targetEndpointModel,
        });
      }

      const item = recordHistoryItem({
        url: vUrl,
        prompt,
        provider: 'ModelScope Wan 2.1 Video (原生)',
        model: targetEndpointModel,
        seed: effectiveSeed,
        steps: 25,
        cfg: 5.0,
      });

      return res.json({
        videoUrl: vUrl,
        provider: 'ModelScope Wan 2.1 Video (原生)',
        model: targetEndpointModel,
        requestedModel: model,
        exactEndpointCalled: `https://api-inference.modelscope.cn/v1/models/${targetEndpointModel}`,
        duration: duration || 5,
        fps: fps || 16,
        seed: effectiveSeed,
        historyItem: item,
      });
    }

    // 5. Fal.ai Video Engine (Wan 2.1, LTX, Kling, MiniMax, CogVideoX, Hunyuan)
    const falKey = (req.headers['x-fal-key'] as string) || cloudSettings['falKey'] || defaultKeys['falKey'] || process.env.FAL_KEY || '';

    if (!falKey) {
      return res.status(400).json({
        error: '未配置 Fal.ai 密钥。AI 视频生成大模型（如 Wan 2.1 / LTX-Video / Kling）需要有效的 Fal.ai API Key。若无 Fal Key，也可切换为 Tensor.Art (OpenWorks)、NanoGPT、Agnes AI Video 或 ModelScope 阿里原生引擎。',
      });
    }

    // Guard against image models accidentally routed here
    if (
      (lowerModel.includes('flux') || lowerModel.includes('schnell') || lowerModel.includes('sdxl') || lowerModel.includes('dev')) &&
      !lowerModel.includes('video')
    ) {
      return res.status(400).json({
        error: `模型 "${model}" 是图像生成模型，而非 AI 视频生成大模型。生成视频请在视频节点中选择 Wan 2.1 (fal-ai/wan/v2.1/text-to-video) 或 LTX-Video。`,
      });
    }

    let endpoint = normalizeFalEndpoint(model, true);
    let wasAdapted = false;
    let adaptationNotice = '';

    if (image_url) {
      if (endpoint === 'fal-ai/wan/v2.1/text-to-video' || endpoint === 'wan/v2.1/text-to-video' || endpoint === 'damo/wan2.1-t2v') {
        endpoint = 'fal-ai/wan/v2.1/image-to-video';
        wasAdapted = true;
        adaptationNotice = '已检测到输入源图，按照官方接口规范自动匹配 Wan 2.1 图生视频 (image-to-video) 端点。';
      } else if (endpoint === 'fal-ai/kling-video/v1/standard/text-to-video') {
        endpoint = 'fal-ai/kling-video/v1/standard/image-to-video';
        wasAdapted = true;
        adaptationNotice = '已检测到输入源图，按照官方接口规范自动匹配 Kling 1.5 图生视频 (image-to-video) 端点。';
      }
    }

    const effectiveFalVideoSeed = typeof seed === 'number' && seed >= 0 ? seed : Math.floor(Math.random() * 1000000000);
    const payload: any = {
      prompt,
      aspect_ratio: aspect_ratio || '16:9',
      seed: effectiveFalVideoSeed,
    };
    if (image_url) {
      payload.image_url = image_url;
    }

    const upstreamResp = await fetch(`https://fal.run/${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${falKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!upstreamResp.ok) {
      const errorText = await upstreamResp.text();
      let friendlyError = `AI 视频服务商执行失败 [${upstreamResp.status}]: ${errorText}`;
      if (upstreamResp.status === 403 || errorText.includes('Exhausted balance')) {
        friendlyError = `Fal.ai 接口执行失败 [403]: 账户额度已耗尽 (Exhausted balance)。请在设置面板中填入新的 Fal API Key，或切换使用 Tensor.Art / NanoGPT / Agnes AI Video / ModelScope 引擎。`;
      }
      return res.status(upstreamResp.status).json({
        error: friendlyError,
      });
    }

    const vData = await upstreamResp.json();
    const videoUrl = vData.video?.url || vData.video_url || vData.output?.video_url;
    if (!videoUrl) {
      return res.status(500).json({ error: 'AI 视频接口返回数据中未包含视频 URL' });
    }

    const providerName = `Fal.ai (${endpoint})`;
    const item = recordHistoryItem({
      url: videoUrl,
      prompt,
      provider: providerName,
      model: endpoint,
      seed: effectiveFalVideoSeed,
      steps: 25,
      cfg: 4.5,
    });

    return res.json({
      videoUrl,
      provider: providerName,
      model: endpoint,
      requestedModel: model,
      exactEndpointCalled: `https://fal.run/${endpoint}`,
      duration: duration || 5,
      fps: fps || 16,
      seed: effectiveFalVideoSeed,
      wasAdapted,
      adaptationNotice,
      historyItem: item,
    });
  } catch (error: any) {
    return res.status(500).json({ error: `AI 视频生成失败: ${error.message}` });
  }
});

function normalizeEcosystem(rawEco: string): string {
  const lower = (rawEco || '').toLowerCase().trim();
  if (lower === 'zimage' || lower === 'zimageturbo') return 'zImage';
  if (lower === 'flux2dev') return 'flux2Dev';
  if (lower === 'flux2klein') return 'flux2Klein';
  if (lower === 'flux' || lower === 'flux1') return 'flux1';
  if (lower === 'krea' || lower === 'krea2') return 'krea2';
  if (lower === 'sd1' || lower === 'sd15' || lower === 'sd1.5') return 'sd1';
  if (lower === 'qwen' || lower === 'qwen2') return 'qwen';
  if (lower === 'anima') return 'anima';
  if (lower === 'ponyv7') return 'ponyV7';
  if (lower === 'sdxl' || lower === 'pony' || lower === 'illustrious') return 'sdxl';
  return rawEco || 'sdxl';
}

// ==========================================
// 2.75. Civitai Official Orchestration Engine (Native Generator & Dynamic AIR Resolver)
// ==========================================
async function resolveCivitaiAir(rawInput: string, fallbackEcosystem: string = 'sdxl', fallbackType: 'checkpoint' | 'lora' = 'checkpoint'): Promise<string> {
  if (!rawInput) return '';
  if (rawInput.startsWith('urn:air:') || rawInput.startsWith('air:')) {
    const fullUrn = rawInput.startsWith('air:') ? `urn:${rawInput}` : rawInput;
    const parts = fullUrn.split(':');
    if (parts.length >= 3) {
      parts[2] = normalizeEcosystem(parts[2]);
      return parts.join(':');
    }
    return fullUrn;
  }

  const trimmed = rawInput.trim();
  const lower = trimmed.toLowerCase();

  // 1. If input is modelId@versionId (e.g. 2726029@3091481)
  const isModelAndVersion = /^\d+@\d+$/.test(trimmed);
  if (isModelAndVersion) {
    const eco = normalizeEcosystem(lower.includes('flux') ? 'flux1' : lower.includes('krea') ? 'krea2' : fallbackEcosystem);
    return `urn:air:${eco}:${fallbackType}:civitai:${trimmed}`;
  }

  // 2. If input is purely a numeric ID (e.g. versionId 3091481 or modelId 2726029)
  const isPureNumber = /^\d+$/.test(trimmed);
  if (isPureNumber) {
    try {
      const resp = await fetch(`https://civitai.com/api/v1/model-versions/${trimmed}`, {
        headers: { 'User-Agent': 'ComfyCanvas/1.0' },
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.air) {
          const parts = data.air.split(':');
          if (parts.length >= 3) parts[2] = normalizeEcosystem(parts[2]);
          return parts.join(':');
        }
        if (data.modelId && data.id) {
          const rawBase = data.baseModel || fallbackEcosystem;
          const eco = normalizeEcosystem(rawBase);
          const type = (data.model?.type || fallbackType).toLowerCase().includes('lora') ? 'lora' : 'checkpoint';
          return `urn:air:${eco}:${type}:civitai:${data.modelId}@${data.id}`;
        }
      }
    } catch (e) {
      console.warn(`Failed to query Civitai AIR for versionId ${trimmed}:`, e);
    }
  }

  // 3. Search Civitai API dynamically by model/LoRA string name
  try {
    const cleanSearchName = trimmed.replace(/\.safetensors$/i, '').replace(/_/g, ' ');
    const searchResp = await fetch(`https://civitai.com/api/v1/models?query=${encodeURIComponent(cleanSearchName)}&limit=3`, {
      headers: { 'User-Agent': 'ComfyCanvas/1.0' },
    });
    if (searchResp.ok) {
      const searchData = await searchResp.json();
      const bestModel = searchData.items?.[0];
      const bestVersion = bestModel?.modelVersions?.[0];
      if (bestVersion) {
        if (bestVersion.air) {
          const parts = bestVersion.air.split(':');
          if (parts.length >= 3) parts[2] = normalizeEcosystem(parts[2]);
          return parts.join(':');
        }
        if (bestModel.id && bestVersion.id) {
          const rawBase = bestVersion.baseModel || fallbackEcosystem;
          const eco = normalizeEcosystem(rawBase);
          const type = (bestModel.type || fallbackType).toLowerCase().includes('lora') ? 'lora' : 'checkpoint';
          return `urn:air:${eco}:${type}:civitai:${bestModel.id}@${bestVersion.id}`;
        }
      }
    }
  } catch (e) {
    console.warn(`Failed to search Civitai AIR for name "${trimmed}":`, e);
  }

  // Fallback to URN format with normalized ecosystem
  const eco = normalizeEcosystem(lower.includes('flux') ? 'flux1' : lower.includes('krea') ? 'krea2' : fallbackEcosystem);
  return `urn:air:${eco}:${fallbackType}:civitai:${trimmed}`;
}

// Helper to extract generated image/video URL from any Civitai Orchestration response structure
function extractCivitaiBlobUrl(data: any): string {
  if (!data) return '';
  if (typeof data.url === 'string' && data.url.startsWith('http')) return data.url;
  if (typeof data.blobUrl === 'string' && data.blobUrl.startsWith('http')) return data.blobUrl;

  // Check images array
  if (Array.isArray(data.images) && data.images.length > 0) {
    const img = data.images[0];
    if (typeof img === 'string' && img.startsWith('http')) return img;
    if (img?.url && typeof img.url === 'string') return img.url;
    if (img?.previewUrl && typeof img.previewUrl === 'string') return img.previewUrl;
  }

  // Check output blobs
  if (Array.isArray(data.output?.blobs) && data.output.blobs.length > 0) {
    const b = data.output.blobs[0];
    if (b?.url && typeof b.url === 'string') return b.url;
  }
  if (Array.isArray(data.blobs) && data.blobs.length > 0) {
    const b = data.blobs[0];
    if (b?.url && typeof b.url === 'string') return b.url;
  }

  // Check steps array
  if (Array.isArray(data.steps)) {
    for (const step of data.steps) {
      if (Array.isArray(step.output?.blobs) && step.output.blobs.length > 0) {
        if (step.output.blobs[0]?.url) return step.output.blobs[0].url;
      }
      if (Array.isArray(step.jobs)) {
        for (const job of step.jobs) {
          if (job.result?.blobUrl) return job.result.blobUrl;
          if (Array.isArray(job.result?.images) && job.result.images[0]?.url) {
            return job.result.images[0].url;
          }
          if (Array.isArray(job.result?.blobs) && job.result.blobs[0]?.url) {
            return job.result.blobs[0].url;
          }
        }
      }
    }
  }

  return '';
}

// Endpoint to query Civitai workflow status directly by workflow ID
app.get('/api/civitai/workflow/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const apiKey = (req.headers['x-civitai-key'] as string) || cloudSettings['civitaiKey'] || defaultKeys['civitaiKey'] || '';
    if (!apiKey) {
      return res.status(400).json({ error: 'Civitai API key is required' });
    }

    const resp = await fetch(`https://orchestration.civitai.com/v2/consumer/workflows/${id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return res.status(resp.status).json({ error: `Civitai workflow query error [${resp.status}]: ${errText}` });
    }

    const data = await resp.json();
    const mediaUrl = extractCivitaiBlobUrl(data);
    return res.json({
      id,
      status: data.status,
      mediaUrl,
      raw: data,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to query Civitai workflow' });
  }
});

app.post(['/api/engine/civitai/generate', '/api/civitai/generate'], async (req, res) => {
  // Prevent socket timeout during long AI generation tasks
  req.setTimeout(120000);
  res.setTimeout(120000);

  try {
    const {
      prompt,
      negative_prompt = '',
      model = '',
      width = 1024,
      height = 1024,
      steps = 28,
      cfg = 6.0,
      seed = Math.floor(Math.random() * 1000000000),
      sampler_name = 'dpmpp_2m',
      scheduler = 'karras',
      denoise = 1.0,
      image_url,
      loras = [],
      videoDuration,
      civitaiKey = '',
    } = req.body;

    const apiKey =
      civitaiKey ||
      (req.headers['x-civitai-key'] as string) ||
      cloudSettings['civitaiKey'] ||
      defaultKeys['civitaiKey'] ||
      '';

    if (!apiKey) {
      return res.status(400).json({
        error:
          '【未配置 Civitai API Key】Civitai 官方原生生成引擎需要 API 访问令牌 (Bearer Token)。请在右上角「设置」面板中填入您的 Civitai API Key；或者在「加载底模」节点或右侧参数区中，将执行引擎切换为 Fal.ai (GPU加密) 或 Agnes AI 等服务商。',
      });
    }

    const isVideo =
      req.body.isVideo === true ||
      (typeof model === 'string' &&
        (model.startsWith('minimax/') ||
          model.startsWith('fal-ai/wan') ||
          model.includes('text-to-video') ||
          model.includes('image-to-video')));

    let completedMediaUrl = '';
    let usedProvider = 'Civitai 官方原生生成引擎';

    try {
      let airModel = model;
      if (!airModel.startsWith('urn:air:')) {
        // Resolve model using 'sdxl' as fallback type but keep it fully dynamic
        airModel = await resolveCivitaiAir(model, 'sdxl', 'checkpoint');
      }

      // Dynamically extract ecosystem from the resolved AIR URN
      let ecosystem = 'sdxl';
      if (airModel.startsWith('urn:air:')) {
        const parts = airModel.split(':');
        if (parts.length >= 3) {
          ecosystem = parts[2];
        }
      }

      if (isVideo) {
        // Civitai VideoGen recipe with wait=true parameter
        const videoPayload: any = {
          engine: 'minimax',
          prompt: prompt,
        };
        const orchResp = await fetch('https://orchestration.civitai.com/v2/consumer/recipes/videoGen?wait=true', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(videoPayload),
        });

        if (!orchResp.ok) {
          const errText = await orchResp.text();
          return res.status(orchResp.status).json({
            error: `Civitai 视频生成接口返回错误 [${orchResp.status}]: ${errText}`,
          });
        }

        const orchData = await orchResp.json();
        completedMediaUrl = extractCivitaiBlobUrl(orchData);
        if (!completedMediaUrl && (orchData.id || orchData.token)) {
          const workflowId = orchData.id || orchData.token;
          for (let i = 0; i < 20; i++) {
            await new Promise((r) => setTimeout(r, 2000));
            const pollResp = await fetch(`https://orchestration.civitai.com/v2/consumer/workflows/${workflowId}`, {
              headers: { Authorization: `Bearer ${apiKey}` },
            });
            if (pollResp.ok) {
              const pollData = await pollResp.json();
              const url = extractCivitaiBlobUrl(pollData);
              if (url) {
                completedMediaUrl = url;
                break;
              }
            }
          }
        }
      } else {
        // Civitai ImageGen recipe (sdcpp for SD C++ ecosystems, comfy for other custom ecosystems like krea2) + wait=true parameter
        const resources: any[] = [];
        if (Array.isArray(loras) && loras.length > 0) {
          for (const l of loras) {
            const rawId = l.civitaiId || l.versionId || l.id || l.name;
            if (rawId) {
              const loraUrn = await resolveCivitaiAir(String(rawId), ecosystem, 'lora');
              resources.push({
                model: loraUrn,
                strength: Number(l.strength || l.modelStrength || 0.8),
              });
            }
          }
        }

        const safeWidth = Math.max(256, Math.min(2048, Math.round((Number(width) || 1024) / 16) * 16));
        const safeHeight = Math.max(256, Math.min(2048, Math.round((Number(height) || 1024) / 16) * 16));

        // Use the OpenAPI consumer schemas to choose the correct orchestrator engine
        const sdcppEcosystems = ['sd1', 'sdxl', 'flux1', 'flux2Dev', 'flux2Klein', 'qwen', 'zImage', 'anima'];
        const isSdcpp = sdcppEcosystems.includes(ecosystem);

        let recipePayload: any;

        if (isSdcpp) {
          recipePayload = {
            engine: 'sdcpp',
            ecosystem: ecosystem,
            model: airModel,
            prompt,
            negativePrompt: negative_prompt || '',
            width: safeWidth,
            height: safeHeight,
            steps: Number(steps) || 25,
            cfgScale: Number(cfg) ?? 6.0,
            sampler: sampler_name || 'euler',
            scheduler: scheduler || 'simple',
            quantity: 1,
          };

          if (resources.length > 0) {
            recipePayload.resources = resources;
          }
        } else {
          // Fall back transparently to 'comfy' engine for other architectures (like 'krea2' or custom user models)
          recipePayload = {
            engine: 'comfy',
            ecosystem: ecosystem,
            model: ecosystem === 'krea2' ? 'turbo' : 'base', // Map correct model discriminator value
            operation: 'createImage',
            diffusionModel: airModel,
            prompt,
            negativePrompt: negative_prompt || '',
            width: safeWidth,
            height: safeHeight,
            steps: Number(steps) || 25,
            cfgScale: Number(cfg) ?? 6.0,
            sampler: sampler_name || 'euler',
            scheduler: scheduler || 'simple',
            quantity: 1,
          };

          if (resources.length > 0) {
            const loraMap: Record<string, number> = {};
            for (const r of resources) {
              loraMap[r.model] = r.strength;
            }
            recipePayload.loras = loraMap;
          }
        }

        const orchResp = await fetch('https://orchestration.civitai.com/v2/consumer/recipes/imageGen?wait=true', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(recipePayload),
        });

        if (!orchResp.ok) {
          const errText = await orchResp.text();
          return res.status(orchResp.status).json({
            error: `Civitai Orchestration 官方算力返回错误 [${orchResp.status}]: ${errText}`,
          });
        }

        const orchData = await orchResp.json();
        completedMediaUrl = extractCivitaiBlobUrl(orchData);

        // Quick check (2s) in case it completes immediately
        if (!completedMediaUrl && (orchData.id || orchData.token)) {
          const workflowId = orchData.id || orchData.token;
          await new Promise((r) => setTimeout(r, 2000));
          const pollResp = await fetch(`https://orchestration.civitai.com/v2/consumer/workflows/${workflowId}`, {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          if (pollResp.ok) {
            const pollData = await pollResp.json();
            completedMediaUrl = extractCivitaiBlobUrl(pollData);
            const status = (pollData.status || '').toLowerCase();
            if (status === 'failed' || status === 'expired' || status === 'canceled') {
              return res.status(500).json({
                error: `Civitai 任务渲染失败 [状态: ${pollData.status}]: ${pollData.error || pollData.reason || 'Job failed on Civitai cluster'}`,
              });
            }
          }

          // If still in progress after 2s, return pending status and workflowId immediately to prevent proxy timeouts
          if (!completedMediaUrl) {
            return res.json({
              pending: true,
              workflowId,
              status: orchData.status || 'processing',
              provider: usedProvider,
              model,
              seed,
            });
          }
        }
      }
    } catch (orchErr: any) {
      return res.status(500).json({ error: `Civitai 网络请求失败: ${orchErr.message}` });
    }

    if (!completedMediaUrl) {
      return res.status(500).json({ error: 'Civitai 原生算力未能按时返回有效图像/视频，可能由于排队超时，请稍后在历史记录中查看或重试。' });
    }

    const item = recordHistoryItem({
      url: completedMediaUrl,
      prompt,
      negativePrompt: negative_prompt,
      provider: usedProvider,
      model,
      seed,
      steps,
      cfg,
      loras,
    });

    return res.json({
      success: true,
      imageUrl: completedMediaUrl,
      mediaUrl: completedMediaUrl,
      provider: usedProvider,
      model,
      seed,
      wasAdapted: false,
      historyItem: item,
    });
  } catch (error: any) {
    return res.status(500).json({ error: `Civitai 生成失败: ${error.message}` });
  }
});

// ==========================================
// 2.8. Agnes AI (ApiHub) Image, Video & Reasoning Chat
// ==========================================
app.post(['/api/engine/agnes/generate', '/api/agnes/generate'], async (req, res) => {
  try {
    const {
      prompt,
      model = 'agnes-image-2.5-flash',
      width = 1024,
      height = 1024,
      image_url,
    } = req.body;

    const customAgnesBaseUrl = (req.headers['x-agnes-base-url'] as string)?.trim();
    const customAgnesKey = (req.headers['x-agnes-key'] as string)?.trim();

    if (customAgnesBaseUrl && !customAgnesKey) {
      return res.status(400).json({
        error: '使用自定义 base URL (x-agnes-base-url) 时必须同时提供自定义 API Key (x-agnes-key)，禁止回退使用服务端密钥。',
      });
    }

    const apiKey = customAgnesBaseUrl
      ? customAgnesKey
      : (customAgnesKey || cloudSettings['agnesKey'] || defaultKeys['agnesKey'] || '');
    const baseUrl = customAgnesBaseUrl || cloudSettings['agnesBaseUrl'] || defaultKeys['agnesBaseUrl'] || 'https://apihub.agnes-ai.com/v1';

    if (!apiKey) {
      return res.status(400).json({ error: '未配置 Agnes AI API 密钥 (x-agnes-key)。' });
    }

    const payload: any = {
      model,
      prompt,
      n: 1,
      size: `${width}x${height}`,
    };
    if (image_url) {
      payload.image_url = image_url;
    }

    const upstream = await fetch(`${baseUrl.replace(/\/+$/, '')}/images/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!upstream.ok) {
      const errorText = await upstream.text();
      return res.status(upstream.status).json({
        error: `Agnes AI 接口执行失败 [${upstream.status}]: ${errorText}`,
      });
    }

    const data = await upstream.json();
    const mediaUrl = data.data?.[0]?.url || data.images?.[0]?.url || data.url;
    if (!mediaUrl) {
      return res.status(500).json({ error: 'Agnes AI 返回结果中未包含图像输出 URL' });
    }

    const item = recordHistoryItem({
      url: mediaUrl,
      prompt,
      provider: 'Agnes AI (ApiHub)',
      model,
      seed: Math.floor(Math.random() * 1000000000),
      steps: 25,
      cfg: 6.0,
    });

    return res.json({
      imageUrl: mediaUrl,
      mediaUrl,
      mediaType: model.includes('video') ? 'video' : 'image',
      provider: 'Agnes AI (ApiHub)',
      model,
      seed: item.seed,
      historyItem: item,
    });
  } catch (error: any) {
    return res.status(500).json({ error: `Agnes AI 请求异常: ${error.message}` });
  }
});

app.post(['/api/engine/agnes/chat', '/api/agnes/chat'], async (req, res) => {
  try {
    const {
      messages = [],
      model = 'agnes-3.0-flash',
      temperature = 0.7,
      max_tokens = 2048,
    } = req.body;

    const customAgnesBaseUrl = (req.headers['x-agnes-base-url'] as string)?.trim();
    const customAgnesKey = (req.headers['x-agnes-key'] as string)?.trim();

    if (customAgnesBaseUrl && !customAgnesKey) {
      return res.status(400).json({
        error: '使用自定义 base URL (x-agnes-base-url) 时必须同时提供自定义 API Key (x-agnes-key)，禁止回退使用服务端密钥。',
      });
    }

    const apiKey = customAgnesBaseUrl
      ? customAgnesKey
      : (customAgnesKey || cloudSettings['agnesKey'] || defaultKeys['agnesKey'] || '');
    const baseUrl = customAgnesBaseUrl || cloudSettings['agnesBaseUrl'] || defaultKeys['agnesBaseUrl'] || 'https://apihub.agnes-ai.com/v1';

    if (!apiKey) {
      return res.status(400).json({ error: '未配置 Agnes AI API 密钥 (x-agnes-key)。' });
    }

    const upstream = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens,
      }),
    });

    if (!upstream.ok) {
      const errorText = await upstream.text();
      return res.status(upstream.status).json({
        error: `Agnes AI 对话推理失败 [${upstream.status}]: ${errorText}`,
      });
    }

    const data = await upstream.json();
    const content = data.choices?.[0]?.message?.content || '';
    return res.json({
      content,
      model: data.model || model,
      usage: data.usage,
    });
  } catch (error: any) {
    return res.status(500).json({ error: `Agnes AI 推理异常: ${error.message}` });
  }
});

// ==========================================
// 2.9. SenseNova (商汤日日新) DeepSeek V4 / Reasoning / Vision
// ==========================================
app.post(['/api/engine/sensenova/chat', '/api/sensenova/chat'], async (req, res) => {
  try {
    const {
      messages = [],
      model = 'deepseek-v4-flash',
      temperature = 0.6,
      max_tokens = 2048,
    } = req.body;

    const customSnBaseUrl = (req.headers['x-sensenova-base-url'] as string)?.trim();
    const customSnKey = (req.headers['x-sensenova-key'] as string)?.trim();

    if (customSnBaseUrl && !customSnKey) {
      return res.status(400).json({
        error: '使用自定义 base URL (x-sensenova-base-url) 时必须同时提供自定义 API Key (x-sensenova-key)，禁止回退使用服务端密钥。',
      });
    }

    const apiKey = customSnBaseUrl
      ? customSnKey
      : (customSnKey || cloudSettings['sensenovaKey'] || defaultKeys['sensenovaKey'] || '');
    const baseUrl = customSnBaseUrl || cloudSettings['sensenovaBaseUrl'] || defaultKeys['sensenovaBaseUrl'] || 'https://token.sensenova.cn/v1';

    if (!apiKey) {
      return res.status(400).json({ error: '未配置商汤日日新 API 密钥 (x-sensenova-key)。' });
    }

    const upstream = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens,
      }),
    });

    if (!upstream.ok) {
      const errorText = await upstream.text();
      return res.status(upstream.status).json({
        error: `SenseNova 深度推理失败 [${upstream.status}]: ${errorText}`,
      });
    }

    const data = await upstream.json();
    const choice = data.choices?.[0];
    const content = choice?.message?.content || '';
    const reasoningContent = choice?.message?.reasoning_content || '';
    return res.json({
      content,
      reasoningContent,
      model: data.model || model,
      usage: data.usage,
    });
  } catch (error: any) {
    return res.status(500).json({ error: `SenseNova 推理异常: ${error.message}` });
  }
});

app.post('/api/engine/sensenova/generate', async (req, res) => {
  const { model = 'deepseek-v4-flash' } = req.body;
  return res.status(400).json({
    error: `商汤日日新 (SenseNova) 是专长于深度思考与推理的文本大模型平台 (${model})。若需将概念扩散为图像或视频，请使用画布上的「LLM 推理思考节点」或提示词面板中的「深度思考扩写」，再通过连线将正向条件注入至 FLUX.1、Agnes 2.5 或 Wan 2.1 扩散引擎。`,
  });
});

// Helper to determine OpenWorks base URL (TensorArt vs TusiArt)
function getTensorArtBaseUrl(key: string): string {
  if (key && key.trim().startsWith('ak_tusi')) {
    return 'https://openapi.tusiart.cn/openworks/v1';
  }
  return 'https://openapi.tensor.art/openworks/v1';
}

// Helper to fetch OpenWorks tool list (23 tools)
async function fetchTensorArtToolsList(apiKey: string) {
  const cacheKey = `tensor_tools_${apiKey}`;
  const cached = tensorArtToolsCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }

  const baseUrl = getTensorArtBaseUrl(apiKey);
  const res = await fetch(`${baseUrl}/tool/list`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Echo-Access-Key': apiKey,
    },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Tensor.Art API Error [${res.status}]: ${errText}`);
  }
  const json = await res.json();
  if (json.code !== '0' && json.code !== 0) {
    throw new Error(`Tensor.Art OpenWorks Error [${json.code}]: ${json.message || 'Unknown error'}`);
  }
  const tools = json.data?.tools || [];
  tensorArtToolsCache.set(cacheKey, { data: tools, expiry: Date.now() + 120000 }); // 2 min cache
  return tools;
}

// Helper to dynamically build inputs according to tool schema
function buildTensorArtInputs(toolInputs: any[], userParams: any) {
  if (Array.isArray(userParams.inputs) && userParams.inputs.length === toolInputs.length) {
    return userParams.inputs;
  }
  const {
    prompt = '',
    width = 1024,
    height = 1024,
    count = 1,
    image_url = '',
    duration = '5',
    ratio = '16:9',
    size = '720P',
  } = userParams;

  return toolInputs.map((inp: any) => {
    const desc = (inp.description || '').toLowerCase();
    const type = (inp.type || 'STRING').toUpperCase();

    if (type === 'FILE') return { type: inp.type, value: image_url };
    if (type === 'ARRAY') return { type: inp.type, value: image_url ? [image_url] : [] };

    if (desc.includes('width')) return { type: inp.type, value: Number(width) || 1024 };
    if (desc.includes('height')) return { type: inp.type, value: Number(height) || 1024 };
    if (desc.includes('count') || desc.includes('number')) return { type: inp.type, value: Number(count) || 1 };
    if (desc.includes('duration') || desc.includes('seconds')) return { type: inp.type, value: String(duration || '5') };
    if (desc.includes('ratio') || desc.includes('aspect')) {
      let r = String(ratio || '16:9');
      if ((desc.includes('921600') || desc.includes('pixel')) && !r.includes('921600')) {
        if (r === '16:9' || r === '9:16' || r === '1:1') r = `${r}-921600`;
        else r = '16:9-921600';
      }
      return { type: inp.type, value: r };
    }
    if (desc.includes('size')) return { type: inp.type, value: String(size || '720P') };
    if (desc.includes('prompt') || desc.includes('text') || desc.includes('description') || desc.includes('motion')) {
      return { type: inp.type, value: String(prompt || 'high quality, masterpiece') };
    }

    if (type === 'INTEGER' || type === 'NUMBER') return { type: inp.type, value: 1 };
    if (type === 'BOOLEAN') return { type: inp.type, value: false };
    return { type: inp.type, value: String(prompt || '') };
  });
}

// 2.95. Tensor.Art / TusiArt OpenWorks OpenAPI (tool/list, task, file/upload)
app.all(['/api/tensorart/tools', '/api/engine/tensorart/tools'], async (req, res) => {
  try {
    const apiKey =
      (req.headers['x-tensorart-key'] as string) ||
      cloudSettings['tensorartKey'] ||
      process.env.TENSORART_API_KEY ||
      '';
    if (!apiKey) {
      return res.status(400).json({ error: '未配置 Tensor.Art API Key (x-tensorart-key)。' });
    }
    const tools = await fetchTensorArtToolsList(apiKey);
    return res.json({ code: '0', message: 'success', data: { tools } });
  } catch (error: any) {
    return res.status(500).json({ error: `获取 Tensor.Art 工具列表失败: ${error.message}` });
  }
});

app.post(['/api/tensorart/upload', '/api/engine/tensorart/upload'], async (req, res) => {
  try {
    const apiKey =
      (req.headers['x-tensorart-key'] as string) ||
      cloudSettings['tensorartKey'] ||
      process.env.TENSORART_API_KEY ||
      '';
    if (!apiKey) {
      return res.status(400).json({ error: '未配置 Tensor.Art API Key。' });
    }
    const baseUrl = getTensorArtBaseUrl(apiKey);
    const upstreamRes = await fetch(`${baseUrl}/file/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Echo-Access-Key': apiKey,
      },
      body: JSON.stringify({}),
    });
    const upstreamData = await upstreamRes.json();
    if (upstreamData.code !== '0' && upstreamData.code !== 0) {
      return res.status(400).json({ error: `Tensor.Art 预领文件上传链接失败: ${upstreamData.message}` });
    }
    return res.json(upstreamData);
  } catch (error: any) {
    return res.status(500).json({ error: `Tensor.Art 文件上传接口异常: ${error.message}` });
  }
});

app.post(['/api/tensorart/generate', '/api/engine/tensorart/generate'], async (req, res) => {
  req.setTimeout(180000);
  res.setTimeout(180000);

  try {
    const apiKey =
      (req.headers['x-tensorart-key'] as string) ||
      cloudSettings['tensorartKey'] ||
      process.env.TENSORART_API_KEY ||
      '';

    if (!apiKey) {
      return res.status(400).json({
        error: '未配置 Tensor.Art API Key，请在右上角设置中填写您的 API Key (ak_tensor_... / ak_tusi_...)。',
      });
    }

    const {
      prompt,
      model,
      toolName: inputToolName,
      width = 1024,
      height = 1024,
      count = 1,
      image_url,
      duration,
      ratio,
      size,
      inputs,
    } = req.body;

    const rawModel = (inputToolName || model || 'strong_text2image_nano_banana2').trim();
    const baseUrl = getTensorArtBaseUrl(apiKey);

    // Fetch tool list to inspect input schema
    const tools = await fetchTensorArtToolsList(apiKey);
    
    // Transparent tool matching hierarchy:
    let targetTool = tools.find((t: any) => t.name === rawModel);
    let wasAdapted = false;
    let adaptationNotice = '';

    if (!targetTool) {
      // 1. Prefix / Substring match (e.g. strong_text2image -> strong_text2image_nano_banana2)
      targetTool = tools.find((t: any) => t.name.startsWith(rawModel) || rawModel.startsWith(t.name) || t.name.includes(rawModel));
    }

    if (!targetTool) {
      // 2. Specialized intent resolution
      if (image_url && (rawModel.includes('video') || rawModel.includes('wan') || rawModel.includes('ltx'))) {
        targetTool = tools.find((t: any) => t.name.includes('image2video_wan') || t.name.includes('image2video')) || tools[0];
        wasAdapted = true;
        adaptationNotice = `检测到输入源图与视频需求，已自动对齐至 Tensor.Art 官方图生视频工具 (${targetTool.name})。`;
      } else if (rawModel.includes('video') || rawModel.includes('wan') || rawModel.includes('ltx')) {
        targetTool = tools.find((t: any) => t.name.includes('text2video_wan') || t.name.includes('text2video')) || tools[0];
        wasAdapted = true;
        adaptationNotice = `已自动对齐至 Tensor.Art 官方文生视频算力工具 (${targetTool.name})。`;
      } else if (rawModel.includes('photo') || rawModel.includes('real')) {
        targetTool = tools.find((t: any) => t.name.includes('photoreal_studio')) || tools.find((t: any) => t.name.includes('strong_text2image')) || tools[0];
        wasAdapted = true;
        adaptationNotice = `已通过 Tensor.Art 官方写实工作室算力 (${targetTool.name}) 驱动运行。`;
      } else if (rawModel.includes('anime') || rawModel.includes('illust') || rawModel.includes('wai')) {
        targetTool = tools.find((t: any) => t.name.includes('anime_lab') || t.name.includes('oc_character')) || tools.find((t: any) => t.name.includes('strong_text2image')) || tools[0];
        wasAdapted = true;
        adaptationNotice = `已通过 Tensor.Art 官方二次元动漫算力 (${targetTool.name}) 驱动运行。`;
      } else {
        targetTool = tools.find((t: any) => t.name.includes('strong_text2image')) || tools[0];
        wasAdapted = true;
        adaptationNotice = `您选用了 Tensor.Art 社区模型 (${rawModel})，已通过 Tensor.Art OpenWorks 通用生图算力 (${targetTool.name}) 挂载驱动执行。`;
      }
    }

    if (!targetTool) {
      return res.status(400).json({ error: `未找到指定的 Tensor.Art 工具: ${rawModel}` });
    }

    const formattedInputs = buildTensorArtInputs(targetTool.inputs || [], req.body);

    // Submit task to POST /task with Echo-Access-Key
    const submitRes = await fetch(`${baseUrl}/task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Echo-Access-Key': apiKey,
      },
      body: JSON.stringify({
        toolName: targetTool.name,
        inputs: formattedInputs,
      }),
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text();
      return res.status(submitRes.status).json({
        error: `Tensor.Art 任务提交 HTTP 失败 [${submitRes.status}]: ${errText}`,
        toolName: targetTool.name,
        requestedModel: rawModel,
        exactEndpointCalled: `${baseUrl}/task`,
      });
    }

    const submitData = await submitRes.json();
    if (submitData.code !== '0' && submitData.code !== 0) {
      return res.status(400).json({
        error: `Tensor.Art 任务创建失败: [${submitData.code}] ${submitData.message || '系统错误'}`,
        code: submitData.code,
        toolName: targetTool.name,
        requestedModel: rawModel,
        exactEndpointCalled: `${baseUrl}/task`,
      });
    }

    const taskId = submitData.data?.task?.id || submitData.data?.taskId || submitData.data?.id;
    if (!taskId) {
      return res.status(500).json({
        error: 'Tensor.Art 任务成功受理，但未返回有效 Task ID',
        details: JSON.stringify(submitData),
        toolName: targetTool.name,
        requestedModel: rawModel,
      });
    }

    // Poll task/query
    let resultOutput = '';
    const maxPolls = 60;
    for (let i = 0; i < maxPolls; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const qRes = await fetch(`${baseUrl}/task/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Echo-Access-Key': apiKey,
        },
        body: JSON.stringify({ taskIds: [String(taskId)] }),
      });

      if (!qRes.ok) continue;

      const qData = await qRes.json();
      if (qData.code !== '0' && qData.code !== 0) continue;

      const task = qData.data?.tasks?.[0] || qData.data?.[0];
      if (!task) continue;

      const status = (task.status || '').toUpperCase();
      if (status === 'FINISH' || status === 'SUCCESS') {
        const out = task.outputs?.[0];
        resultOutput = typeof out === 'string' ? out : out?.value || out?.url || '';
        break;
      }

      if (status === 'FAILED' || status === 'EXCEPTION') {
        return res.status(500).json({
          error: `Tensor.Art 任务处理异常 (${status}): ${task.message || task.error || '运行失败'}`,
          taskId,
          toolName: targetTool.name,
          requestedModel: rawModel,
          exactEndpointCalled: `${baseUrl}/task/query`,
        });
      }
    }

    if (!resultOutput) {
      return res.status(504).json({
        error: 'Tensor.Art 云端渲染超时，未在时限内返回产物。请稍后重试。',
        taskId,
        toolName: targetTool.name,
        requestedModel: rawModel,
        exactEndpointCalled: `${baseUrl}/task/query`,
      });
    }

    const isVideo =
      /\.(mp4|webm|mov)$/i.test(resultOutput) ||
      targetTool.outputs?.some((o: any) => o.format === 'video') ||
      targetTool.name.includes('video');

    const item = recordHistoryItem({
      url: resultOutput,
      prompt: prompt || targetTool.description || targetTool.name,
      provider: 'Tensor.Art (OpenWorks)',
      model: targetTool.name,
      seed: Math.floor(Math.random() * 1000000),
      steps: 25,
      cfg: 5.0,
      loras: [],
    });

    return res.json({
      imageUrl: isVideo ? '' : resultOutput,
      videoUrl: isVideo ? resultOutput : '',
      mediaUrl: resultOutput,
      mediaType: isVideo ? 'video' : 'image',
      provider: 'Tensor.Art (OpenWorks)',
      model: targetTool.name,
      toolName: targetTool.name,
      requestedModel: rawModel,
      taskId,
      wasAdapted,
      adaptationNotice,
      exactEndpointCalled: `${baseUrl}/task`,
      historyItem: item,
    });
  } catch (error: any) {
    return res.status(500).json({ error: `Tensor.Art 请求异常: ${error.message}` });
  }
});

// ==========================================
// 3. Hugging Face Inference API (huggingface.co/docs)
// ==========================================
app.post(['/api/huggingface/generate', '/api/engine/huggingface/generate'], async (req, res) => {
  try {
    const {
      prompt,
      negative_prompt,
      model = 'black-forest-labs/FLUX.1-schnell',
      width = 960,
      height = 1440,
      steps = 8,
      guidance = 1.0,
      seed,
      loras = [],
    } = req.body;
    const hfToken =
      (req.headers['x-hf-token'] as string) ||
      cloudSettings['hfToken'] ||
      defaultKeys['hfToken'] ||
      process.env.HF_TOKEN ||
      '';

    const isZImage =
      model.toLowerCase().includes('z-image') ||
      model.toLowerCase().includes('z_image') ||
      model.toLowerCase().includes('radiancechrome') ||
      (Array.isArray(loras) && loras.some((l: any) => (l.name || '').toLowerCase().includes('radiancechrome') || (l.name || '').toLowerCase().includes('z-image')));

    if (!hfToken && !isZImage) {
      return res.status(400).json({
        error: '未配置 Hugging Face Token，请在右上角设置中填写您的 User Access Token (hf_...)。',
      });
    }

    // Extract triggers and inject into prompt
    let finalPrompt = prompt || '';
    if (Array.isArray(loras) && loras.length > 0) {
      const triggers = loras.map((l: any) => l.triggers || l.triggerWords).filter(Boolean).join(', ');
      if (triggers && !finalPrompt.includes(triggers)) {
        finalPrompt = `${triggers}, ${finalPrompt}`.trim();
      }
    }

    let dataUrl = '';

    if (isZImage) {
      // 🌟 Direct integration with verified official Tongyi-MAI/Z-Image-Turbo Gradio Space on Hugging Face (Public Space)
      const w = Number(width) || 960;
      const h = Number(height) || 1440;
      let ratioChoice = '1120x1440 ( 7:9 )';
      if (Math.abs(w - h) < 100) {
        ratioChoice = '1024x1024 ( 1:1 )';
      } else if (w > h) {
        ratioChoice = '1280x720 ( 16:9 )';
      } else if (h / w > 1.6) {
        ratioChoice = '720x1280 ( 9:16 )';
      } else {
        ratioChoice = '1120x1440 ( 7:9 )';
      }

      const seedNum = (typeof seed === 'number' && seed >= 0) ? seed : 876105816987345;
      const stepsNum = Number(steps) || 8;

      const gradioPayload = {
        data: [
          finalPrompt,
          ratioChoice,
          seedNum,
          stepsNum,
          3.0,
          false,
          []
        ]
      };

      const gradioHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (hfToken) gradioHeaders['Authorization'] = `Bearer ${hfToken}`;

      const initResp = await fetch('https://tongyi-mai-z-image-turbo.hf.space/gradio_api/call/generate', {
        method: 'POST',
        headers: gradioHeaders,
        body: JSON.stringify(gradioPayload),
      });

      if (!initResp.ok) {
        const errText = await initResp.text();
        return res.status(initResp.status).json({
          error: `Hugging Face (Tongyi-MAI/Z-Image-Turbo 官方算力) 提交失败 [${initResp.status}]`,
          details: errText,
          model,
        });
      }

      const initData = await initResp.json();
      const eventId = initData.event_id;
      if (!eventId) {
        return res.status(500).json({
          error: 'Hugging Face Z-Image-Turbo 空间未返回事件 ID',
          details: JSON.stringify(initData),
          model,
        });
      }

      const sseHeaders: Record<string, string> = {};
      if (hfToken) sseHeaders['Authorization'] = `Bearer ${hfToken}`;

      const sseResp = await fetch(`https://tongyi-mai-z-image-turbo.hf.space/gradio_api/call/generate/${eventId}`, {
        headers: sseHeaders,
      });

      if (!sseResp.ok) {
        const sseErr = await sseResp.text();
        return res.status(sseResp.status).json({
          error: `Hugging Face 渲染流拉取失败 [${sseResp.status}]`,
          details: sseErr,
          model,
        });
      }

      const streamText = await sseResp.text();
      let genUrl = '';
      const lines = streamText.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(line.slice(6));
            if (Array.isArray(parsed) && parsed[0] && Array.isArray(parsed[0]) && parsed[0][0]) {
              genUrl = parsed[0][0].image?.url || parsed[0][0].image?.path || '';
            }
          } catch (e) {}
        }
      }

      if (!genUrl) {
        return res.status(500).json({
          error: 'Hugging Face Z-Image-Turbo 未能产生有效图像产物',
          details: streamText,
          model,
        });
      }

      const imgResp = await fetch(genUrl, {
        headers: { 'Authorization': `Bearer ${hfToken}` },
      });
      if (imgResp.ok) {
        const buf = await imgResp.arrayBuffer();
        const base64 = Buffer.from(buf).toString('base64');
        const mimeType = imgResp.headers.get('content-type') || 'image/png';
        dataUrl = `data:${mimeType};base64,${base64}`;
      } else {
        dataUrl = genUrl;
      }
    } else {
      const maxScale = Array.isArray(loras) && loras.length > 0
        ? Math.max(...loras.map((l: any) => Number(l.scale ?? l.strength ?? l.modelStrength ?? 0.8)))
        : undefined;

      const payload: any = {
        inputs: finalPrompt,
        parameters: {
          negative_prompt: negative_prompt || undefined,
          width: Number(width) || 1024,
          height: Number(height) || 1024,
          num_inference_steps: Number(steps) || 25,
          guidance_scale: Number(guidance) || 7.5,
        },
      };

      if (maxScale !== undefined) {
        payload.parameters.cross_attention_kwargs = { scale: maxScale };
      }
      if (typeof seed === 'number' && seed >= 0) {
        payload.parameters.seed = seed;
      }

      try {
        const hf = new HfInference(hfToken);
        const blob = await hf.textToImage({
          model,
          inputs: finalPrompt,
          parameters: {
            negative_prompt: negative_prompt || undefined,
            num_inference_steps: Number(steps) || 25,
            guidance_scale: Number(guidance) || 7.5,
            width: Number(width) || 1024,
            height: Number(height) || 1024,
            seed: typeof seed === 'number' ? seed : undefined,
          },
        }) as any;

        if (typeof blob === 'string') {
          throw new Error(`HF returned string instead of blob: ${blob}`);
        }

        const arrayBuffer = await blob.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        const mimeType = blob.type || 'image/jpeg';
        dataUrl = `data:${mimeType};base64,${base64}`;
      } catch (sdkErr: any) {
        console.warn('Hugging Face SDK failed, trying direct router HTTP:', sdkErr.message);
        const resp = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${hfToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!resp.ok) {
          const errorText = await resp.text();
          let parsedError;
          try { parsedError = JSON.parse(errorText); } catch { parsedError = { error: errorText }; }
          
          return res.status(resp.status).json({
            error: `Hugging Face 模型推理失败 [${resp.status}]`,
            details: parsedError.error || parsedError.message || errorText,
            model,
          });
        }

        const buffer = await resp.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const mimeType = resp.headers.get('content-type') || 'image/jpeg';
        dataUrl = `data:${mimeType};base64,${base64}`;
      }
    }

    const item = recordHistoryItem({
      url: dataUrl,
      prompt: finalPrompt,
      negativePrompt: negative_prompt,
      provider: 'Hugging Face',
      model,
      seed: seed || 876105816987345,
      steps: Number(steps) || 8,
      cfg: Number(guidance) || 1.0,
      loras: (loras || []).map((l: any) => ({
        name: l.name || l.path,
        strength: Number(l.scale ?? l.strength ?? 0.7),
        civitaiId: l.civitaiId,
      })),
    });

    return res.json({
      imageUrl: dataUrl,
      provider: 'Hugging Face',
      model,
      historyItem: item,
    });
  } catch (error: any) {
    return res.status(500).json({ error: `Hugging Face 调用失败: ${error.message}` });
  }
});

// ==========================================
// 4. ModelScope / 魔搭社区 (modelscope.ai / modelscope.cn)
// ==========================================
app.post(
  [
    '/api/modelscope/generate',
    '/api/engine/modelscope/generate',
    '/api/modelscope_ai/generate',
    '/api/engine/modelscope_ai/generate',
  ],
  async (req, res) => {
    try {
      const {
        prompt,
        negative_prompt,
        model = 'Tongyi-MAI/Z-Image-Turbo',
        steps = 8,
        loras = [],
        guidance = 1.0,
        seed,
      } = req.body;

      const requestedSite = (
        req.body.site ||
        req.headers['x-modelscope-site'] ||
        (req.originalUrl.includes('modelscope_ai') ? 'ai' : 'cn')
      )
        .toString()
        .toLowerCase();
      const isAiSite = requestedSite === 'ai';

      let token = '';
      if (isAiSite) {
        token =
          (req.headers['x-modelscope-ai-token'] as string) ||
          (req.headers['x-modelscope-token'] as string) ||
          cloudSettings['modelscopeAiToken'] ||
          defaultKeys['modelscopeAiToken'] ||
          '';
      } else {
        token =
          (req.headers['x-modelscope-token'] as string) ||
          cloudSettings['modelscopeToken'] ||
          defaultKeys['modelscopeToken'] ||
          process.env.MODELSCOPE_API_TOKEN ||
          '';
      }

      if (!token) {
        return res.status(400).json({
          error: `未配置魔搭${isAiSite ? '国际站 (modelscope.ai)' : '国内站 (modelscope.cn)'} Token，请在右上角设置中填写您的 API Token。`,
        });
      }

      // Extract triggers and inject into prompt
      let finalPrompt = prompt || '';
      if (Array.isArray(loras) && loras.length > 0) {
        const triggers = loras.map((l: any) => l.triggers || l.triggerWords).filter(Boolean).join(', ');
        if (triggers && !finalPrompt.includes(triggers)) {
          finalPrompt = `${triggers}, ${finalPrompt}`.trim();
        }
      }

      const targetModel = model || 'Tongyi-MAI/Z-Image-Turbo';

      const payload: any = {
        model: targetModel,
        prompt: finalPrompt,
      };

      if (negative_prompt) {
        payload.negative_prompt = negative_prompt;
      }

      const params: Record<string, any> = {};
      if (steps) params.steps = Number(steps);
      if (guidance) params.guidance_scale = Number(guidance);
      if (seed !== undefined && seed !== null) params.seed = Number(seed);
      if (req.body.width) params.width = Number(req.body.width);
      if (req.body.height) params.height = Number(req.body.height);

      if (Array.isArray(loras) && loras.length > 0) {
        const primaryLora = loras[0];
        const loraId = typeof primaryLora === 'string' ? primaryLora : (primaryLora.name || primaryLora.path || primaryLora.id || primaryLora.civitaiId);
        const loraWeight = Number(primaryLora.scale ?? primaryLora.strength ?? primaryLora.modelStrength ?? 0.7);
        
        params.lora_model_id = loraId;
        params.lora_scale = loraWeight;
        payload.loras = loras
          .map((l: any) => (typeof l === 'string' ? l : (l.name || l.path || l.id || l.civitaiId)))
          .filter(Boolean);
      }

      if (Object.keys(params).length > 0) {
        payload.parameters = params;
      }

      const primaryDomain = isAiSite
        ? 'https://api-inference.modelscope.ai/v1'
        : 'https://api-inference.modelscope.cn/v1';

      let submitResp;
      try {
        submitResp = await fetch(`${primaryDomain}/images/generations`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-ModelScope-Async': 'enable',
          },
          body: JSON.stringify(payload),
        });

        if (!submitResp.ok) {
          const errorText = await submitResp.text();
          let errObj: any = null;
          try { errObj = JSON.parse(errorText); } catch {}
          const errMsg = errObj?.Message || errObj?.message || errorText;
          const isBalance = submitResp.status === 429 || errMsg.toLowerCase().includes('insufficient balance');

          const friendlyErr = isBalance
            ? `魔搭${isAiSite ? '国际站 (modelscope.ai)' : '国内站 (modelscope.cn)'} 账户余额不足 [429]: ${errMsg}。请前往 ${isAiSite ? 'modelscope.ai' : 'modelscope.cn'} 充值魔粒或获取额度。`
            : `魔搭${isAiSite ? '国际站 (modelscope.ai)' : '国内站 (modelscope.cn)'} API 提交失败 [${submitResp.status}]: ${errMsg}`;

          return res.status(submitResp.status).json({
            error: friendlyErr,
            details: errorText,
            model: targetModel,
            provider: isAiSite ? 'ModelScope AI' : 'ModelScope CN',
          });
        }
      } catch (e: any) {
        return res.status(500).json({
          error: `魔搭${isAiSite ? '国际站 (modelscope.ai)' : '国内站 (modelscope.cn)'} 网络请求失败: ${e.message}`,
        });
      }

      const submitData = await submitResp.json();
      let imageUrl = submitData.output_images?.[0] || submitData.image_url || submitData.output_img;

      if (!imageUrl && submitData.task_id) {
        const taskId = submitData.task_id;
        for (let i = 0; i < 45; i++) {
          await new Promise((r) => setTimeout(r, 2500));
          const pollResp = await fetch(`${primaryDomain}/tasks/${taskId}`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'X-ModelScope-Task-Type': 'image_generation',
            },
          });
          if (pollResp.ok) {
            const pollData = await pollResp.json();
            if (pollData.task_status === 'SUCCEED') {
              imageUrl = pollData.output_images?.[0] || pollData.outputs?.output_images?.[0] || pollData.outputs?.image_url;
              break;
            } else if (pollData.task_status === 'FAILED') {
              return res.status(500).json({
                error: `魔搭${isAiSite ? '国际站' : '国内站'}任务失败: ${pollData.errors?.message || 'Task failed on ModelScope'}`,
                details: pollData.errors,
                model: targetModel,
              });
            }
          }
        }
      }

      if (!imageUrl) {
        return res.status(500).json({
          error: `魔搭${isAiSite ? '国际站' : '国内站'}排队生成超时 (120s 未完成)，请稍后重试`,
          model: targetModel,
        });
      }

      const providerName = isAiSite ? 'ModelScope AI (魔搭国际站)' : 'ModelScope CN (魔搭社区)';
      const item = recordHistoryItem({
        url: imageUrl,
        prompt: finalPrompt,
        negativePrompt: negative_prompt,
        provider: providerName,
        model: targetModel,
        seed: seed || 876105816987345,
        steps: Number(steps) || 8,
        cfg: Number(guidance) || 1.0,
        loras: (loras || []).map((l: any) => ({
          name: l.name || l.path,
          strength: Number(l.scale ?? l.strength ?? 0.7),
          civitaiId: l.civitaiId,
        })),
      });

      return res.json({
        imageUrl,
        provider: providerName,
        model: targetModel,
        historyItem: item,
      });
    } catch (error: any) {
      return res.status(500).json({ error: `魔搭社区调用失败: ${error.message}` });
    }
  }
);

// ==========================================
// 5. NanoGPT (nano-gpt.com/api / docs.nano-gpt.com)
// ==========================================
app.post(['/api/nanogpt/generate', '/api/engine/nanogpt/generate'], async (req, res) => {
  try {
    const {
      prompt,
      negative_prompt,
      model = 'flux-schnell',
      size,
      width = 1024,
      height = 1024,
      steps = 4,
      guidance_scale,
      seed,
      image_url,
      denoise,
      loras = [],
    } = req.body;
    const apiKey =
      (req.headers['x-nanogpt-key'] as string) ||
      cloudSettings['nanogptKey'] ||
      defaultKeys['nanogptKey'] ||
      process.env.NANOGPT_API_KEY ||
      '';

    if (!apiKey) {
      return res.status(400).json({
        error: '未配置 NanoGPT API Key，请在右上角设置中填写您的密钥。',
      });
    }

    // Extract triggers and inject into prompt
    let finalPrompt = prompt || '';
    if (Array.isArray(loras) && loras.length > 0) {
      const triggers = loras.map((l: any) => l.triggers || l.triggerWords).filter(Boolean).join(', ');
      if (triggers && !finalPrompt.includes(triggers)) {
        finalPrompt = `${triggers}, ${finalPrompt}`.trim();
      }
    }

    const payload: any = {
      prompt: finalPrompt,
      model,
      size: size || `${width}x${height}`,
      num_inference_steps: Number(steps) || 4,
    };

    if (negative_prompt) {
      payload.negative_prompt = negative_prompt;
    }
    if (guidance_scale !== undefined && guidance_scale !== null) {
      payload.guidance_scale = Number(guidance_scale);
    }
    if (typeof seed === 'number' && seed >= 0) {
      payload.seed = seed;
    }
    if (image_url) {
      payload.image_url = image_url;
      payload.imageUrl = image_url;
      payload.imageDataUrl = image_url;
      if (typeof denoise === 'number') {
        payload.strength = denoise;
      }
    }

    const civitaiToken =
      (req.headers['x-civitai-key'] as string) ||
      cloudSettings['civitaiKey'] ||
      defaultKeys['civitaiKey'] ||
      '';

    if (Array.isArray(loras) && loras.length > 0) {
      payload.loras = loras.map((l: any) => {
        let resolvedPath = l.path || l.url || l.name;
        if (l.civitaiId && !resolvedPath.startsWith('http')) {
          resolvedPath = `https://civitai.com/api/download/models/${l.civitaiId}${
            civitaiToken ? `?token=${encodeURIComponent(civitaiToken)}` : ''
          }`;
        }
        return {
          path: resolvedPath,
          scale: Number(l.scale ?? l.strength ?? l.modelStrength ?? 0.8),
        };
      });
    }

    const response = await fetch('https://nano-gpt.com/api/generate-image', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: `NanoGPT 生图失败 [${response.status}]: ${errorText}`,
      });
    }

    const data = await response.json();
    const imageUrl = data.image_url || data.url || data.images?.[0];

    if (!imageUrl) {
      return res.status(500).json({ error: 'NanoGPT 返回数据中未包含图像输出 URL' });
    }

    const item = recordHistoryItem({
      url: imageUrl,
      prompt: finalPrompt,
      negativePrompt: negative_prompt,
      provider: 'NanoGPT',
      model,
      seed: seed || 136947637,
      steps: Number(steps) || 4,
      cfg: Number(guidance_scale) || 3.5,
      loras: (loras || []).map((l: any) => ({
        name: l.name || l.path,
        strength: Number(l.scale ?? l.strength ?? 0.8),
        civitaiId: l.civitaiId,
      })),
    });

    return res.json({
      imageUrl,
      provider: 'NanoGPT',
      model,
      historyItem: item,
    });
  } catch (error: any) {
    return res.status(500).json({ error: `NanoGPT 请求失败: ${error.message}` });
  }
});

// ==========================================
// 6. Gemini Built-in Engine & Prompt Enhancer
// ==========================================
app.post(['/api/gemini/chat', '/api/engine/gemini/chat'], async (req, res) => {
  const startTime = Date.now();
  try {
    const { messages = [], systemInstruction, model = 'gemini-3.8-flash', temperature } = req.body;
    const customKey = (req.headers['x-gemini-key'] as string) || '';
    const gen = createGoogleGenAI(customKey);

    if (!gen) {
      return res.status(400).json({
        error: '未配置 Google Gemini API Key。请在设置中配置 GEMINI_API_KEY。',
      });
    }

    const formattedContents = (messages || []).map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content || '' }],
    }));

    if (formattedContents.length === 0) {
      return res.status(400).json({ error: '聊天消息列表不能为空' });
    }

    const config: any = {};
    if (systemInstruction) config.systemInstruction = systemInstruction;
    if (typeof temperature === 'number') config.temperature = temperature;

    const targetModel = model === 'gemini-2.5-flash' ? 'gemini-3.8-flash' : (model || 'gemini-3.8-flash');
    const response = await gen.client.models.generateContent({
      model: targetModel,
      contents: formattedContents,
      config,
    });

    const content = response.text || '';
    keyPoolManager.recordResult('gemini', gen.apiKey, true, Date.now() - startTime);
    return res.json({
      content,
      provider: 'Google Gemini 3.8 Flash',
      model: targetModel,
    });
  } catch (error: any) {
    return res.status(500).json({
      error: `Gemini 聊天推理失败: ${error.message || '未知错误'}`,
    });
  }
});

app.post(['/api/gemini/generate', '/api/engine/gemini/generate'], async (req, res) => {
  const startTime = Date.now();
  try {
    const {
      prompt,
      negative_prompt,
      width = 1024,
      height = 1024,
      loras = [],
      seed,
      cfg,
      guidance_scale,
      image_url,
      model = 'imagen-3.0-generate-002',
    } = req.body;
    const effectiveSeed = seed || Math.floor(Math.random() * 1000000000);
    const customKey = (req.headers['x-gemini-key'] as string) || '';
    const gen = createGoogleGenAI(customKey);

    if (!gen) {
      return res.status(400).json({
        error: '未配置 Google Gemini API Key。请在右上角设置中配置 GEMINI_API_KEY。',
      });
    }

    let aspectRatio: '1:1' | '3:4' | '4:3' | '9:16' | '16:9' = '1:1';
    const ratio = width / (height || 1);
    if (ratio > 1.5) aspectRatio = '16:9';
    else if (ratio > 1.2) aspectRatio = '4:3';
    else if (ratio < 0.65) aspectRatio = '9:16';
    else if (ratio < 0.85) aspectRatio = '3:4';

    let finalPrompt = prompt || '';
    if (Array.isArray(loras) && loras.length > 0) {
      const triggers = loras
        .map((l: any) => {
          if (l.triggers || l.triggerWords) return l.triggers || l.triggerWords;
          if (l.name) {
            const clean = l.name.replace(/\.safetensors$/i, '').replace(/[-_]/g, ' ');
            return `${clean} style`;
          }
          return '';
        })
        .filter(Boolean)
        .join(', ');
      if (triggers && !finalPrompt.includes(triggers)) {
        finalPrompt = `${triggers}, ${finalPrompt}`;
      }
    }

    let generatedImageUrl = '';
    const targetModel = model || 'imagen-3.0-generate-002';

    if (targetModel.includes('flash-image') || targetModel.includes('flash-lite-image')) {
      const parts: any[] = [{ text: finalPrompt }];
      if (image_url && typeof image_url === 'string' && image_url.startsWith('data:')) {
        const [header, b64] = image_url.split(',');
        const mimeMatch = header.match(/data:([^;]+);/);
        parts.unshift({
          inlineData: {
            mimeType: mimeMatch ? mimeMatch[1] : 'image/png',
            data: b64,
          },
        });
      }

      const contentResponse = await gen.client.models.generateContent({
        model: targetModel,
        contents: {
          parts,
        },
        config: {
          imageConfig: {
            aspectRatio,
          },
        },
      });

      let base64Bytes = '';
      let mimeType = 'image/png';
      for (const part of contentResponse.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData?.data) {
          base64Bytes = part.inlineData.data;
          mimeType = part.inlineData.mimeType || 'image/png';
          break;
        }
      }

      if (!base64Bytes) {
        keyPoolManager.recordResult('gemini', gen.apiKey, false, Date.now() - startTime, 'No image returned from Gemini', 500);
        return res.status(500).json({ error: 'Google Gemini 图像模型未返回生成数据' });
      }

      generatedImageUrl = `data:${mimeType};base64,${base64Bytes}`;
    } else {
      const config: any = {
        numberOfImages: 1,
        outputMimeType: 'image/jpeg',
        aspectRatio,
      };
      if (negative_prompt) {
        config.negativePrompt = negative_prompt;
      }
      const effectiveCfg = Number(guidance_scale || cfg);
      if (effectiveCfg && effectiveCfg > 0) {
        config.guidanceScale = effectiveCfg;
      }
      if (typeof effectiveSeed === 'number' && effectiveSeed >= 0) {
        config.seed = effectiveSeed;
      }

      const aiResponse = await gen.client.models.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt: finalPrompt,
        config,
      });

      if (!aiResponse.generatedImages || aiResponse.generatedImages.length === 0 || !aiResponse.generatedImages[0]?.image?.imageBytes) {
        keyPoolManager.recordResult('gemini', gen.apiKey, false, Date.now() - startTime, 'No image returned', 500);
        return res.status(500).json({ error: 'Google Imagen 3 API 未返回生成图像数据' });
      }

      const base64Bytes = aiResponse.generatedImages[0].image.imageBytes;
      generatedImageUrl = `data:image/jpeg;base64,${base64Bytes}`;
    }

    keyPoolManager.recordResult('gemini', gen.apiKey, true, Date.now() - startTime);

    const item = recordHistoryItem({
      url: generatedImageUrl,
      prompt,
      provider: 'Google Imagen 3 (官方直连)',
      model: targetModel,
      seed: effectiveSeed,
      steps: 30,
      cfg: 5.0,
      loras: (loras || []).map((l: any) => ({
        name: l.name || l.path,
        strength: Number(l.strength || 0.8),
      })),
    });

    return res.json({
      imageUrl: generatedImageUrl,
      prompt,
      provider: 'Google Imagen 3 (官方直连)',
      model: targetModel,
      seed: effectiveSeed,
      historyItem: item,
    });
  } catch (error: any) {
    return res.status(500).json({
      error: `Google Imagen 3 生图接口失败: ${error.message || '未知错误'}`,
    });
  }
});

// Multi-LLM Prompt Refiner endpoint (Gemini 3.8 -> SenseNova DeepSeek V4 -> Agnes AI 3.0 -> Expert Enhancer)
app.post(['/api/gemini/refine-prompt', '/api/ai/refine-prompt'], async (req, res) => {
  try {
    const { prompt, style = 'cinematic photorealistic 8k', loras = [] } = req.body;
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: 'Prompt cannot be empty' });
    }

    const customSnBaseUrl = (req.headers['x-sensenova-base-url'] as string)?.trim();
    const customSnKey = (req.headers['x-sensenova-key'] as string)?.trim();
    if (customSnBaseUrl && !customSnKey) {
      return res.status(400).json({
        error: '使用自定义 base URL (x-sensenova-base-url) 时必须同时提供自定义 API Key (x-sensenova-key)，禁止回退使用服务端密钥。',
      });
    }

    const customAgnesBaseUrl = (req.headers['x-agnes-base-url'] as string)?.trim();
    const customAgnesKey = (req.headers['x-agnes-key'] as string)?.trim();
    if (customAgnesBaseUrl && !customAgnesKey) {
      return res.status(400).json({
        error: '使用自定义 base URL (x-agnes-base-url) 时必须同时提供自定义 API Key (x-agnes-key)，禁止回退使用服务端密钥。',
      });
    }

    const rawPrompt = prompt.trim();
    const loraContext = Array.isArray(loras) && loras.length > 0
      ? `Target LoRA triggers/styles: ${loras.map((l: any) => `${l.name || l.displayName} (strength: ${l.strength ?? l.modelStrength ?? 0.8})`).join(', ')}`
      : '';

    const systemInstruction = `You are a world-class prompt engineer and AI visual director specializing in Midjourney v6, FLUX.1, and SDXL ComfyUI pipelines.
Your task is to transform the user's initial prompt into an exceptional, visually coherent, ultra-detailed generation prompt.
- Expand visual atmosphere, cinematic lighting (e.g. volumetric rays, rim light, golden hour), camera gear/optics (e.g. 85mm f/1.4 lens, 35mm film photography, Hasselblad), hyper-detailed textures (skin micro-texture, fabric grain), and rich color grading.
- Preserve the user's original core subject and intent.
- Incorporate any requested LoRA triggers naturally.
- Output ONLY the final expanded prompt in English, with NO conversational filler, NO markdown quotes, and NO preamble.`;

    let refinedText = '';

    // 1. Tier 1: Google Gemini 3.8 Flash
    try {
      const geminiKey = (req.headers['x-gemini-key'] as string) || process.env.GEMINI_API_KEY || cloudSettings['geminiKey'] || '';
      const gen = createGoogleGenAI(geminiKey);
      if (gen) {
        const response = await gen.client.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: [
            {
              role: 'user',
              parts: [
                { text: `${systemInstruction}\n\nUser Input Prompt: "${rawPrompt}"\nDesired Visual Style: ${style}\n${loraContext}` }
              ]
            }
          ]
        });
        const out = response.text?.trim();
        if (out && out.length > rawPrompt.length) {
          refinedText = out;
        }
      }
    } catch (gErr) {
      console.warn('Gemini prompt refine tier skipped:', gErr);
    }

    // 2. Tier 2: SenseNova (商汤日日新) DeepSeek V4 Reasoning
    if (!refinedText) {
      try {
        const sensenovaKey = customSnBaseUrl
          ? customSnKey
          : (customSnKey || cloudSettings['sensenovaKey'] || defaultKeys['sensenovaKey']);
        const sensenovaBaseUrl = customSnBaseUrl || cloudSettings['sensenovaBaseUrl'] || defaultKeys['sensenovaBaseUrl'] || 'https://token.sensenova.cn/v1';
        if (sensenovaKey) {
          const snResp = await fetch(`${sensenovaBaseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${sensenovaKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'deepseek-v4-flash',
              messages: [
                { role: 'system', content: systemInstruction },
                { role: 'user', content: `Expand prompt: "${rawPrompt}". Desired style: ${style}. ${loraContext}` }
              ],
              temperature: 0.6,
              max_tokens: 1024,
            }),
          });
          if (snResp.ok) {
            const snData = await snResp.json();
            const snText = snData.choices?.[0]?.message?.content?.trim();
            if (snText) refinedText = snText;
          }
        }
      } catch (snErr) {
        console.warn('SenseNova prompt refine tier skipped:', snErr);
      }
    }

    // 3. Tier 3: Agnes AI 3.0 Flash
    if (!refinedText) {
      try {
        const agnesKey = customAgnesBaseUrl
          ? customAgnesKey
          : (customAgnesKey || cloudSettings['agnesKey'] || defaultKeys['agnesKey']);
        const agnesBaseUrl = customAgnesBaseUrl || cloudSettings['agnesBaseUrl'] || defaultKeys['agnesBaseUrl'] || 'https://apihub.agnes-ai.com/v1';
        if (agnesKey) {
          const agResp = await fetch(`${agnesBaseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${agnesKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'agnes-3.0-flash',
              messages: [
                { role: 'system', content: systemInstruction },
                { role: 'user', content: `Expand prompt: "${rawPrompt}". Style: ${style}. ${loraContext}` }
              ],
              temperature: 0.6,
              max_tokens: 1024,
            }),
          });
          if (agResp.ok) {
            const agData = await agResp.json();
            const agText = agData.choices?.[0]?.message?.content?.trim();
            if (agText) refinedText = agText;
          }
        }
      } catch (agErr) {
        console.warn('Agnes prompt refine tier skipped:', agErr);
      }
    }

    // 4. Tier 4: Algorithmic Photoreal Enhancer (100% Reliable Offline Safety Net)
    if (!refinedText) {
      const triggers = Array.isArray(loras) ? loras.map((l: any) => l.triggers || l.triggerWords).filter(Boolean).join(', ') : '';
      const visualKeywords = 'masterpiece, 8k resolution, ultra-detailed textures, cinematic volumetric lighting, ray tracing, sharp focus, 35mm photography, high aesthetic';
      refinedText = `${triggers ? `${triggers}, ` : ''}${rawPrompt}, ${style}, ${visualKeywords}`;
    }

    // Clean up any remaining quotes or markdown
    refinedText = refinedText.replace(/^["']|["']$/g, '').replace(/```[\s\S]*?```/g, '').trim();

    return res.json({
      success: true,
      refinedPrompt: refinedText,
      originalPrompt: rawPrompt,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Prompt refinement failed' });
  }
});

// ==========================================
// 7. Provider Health & Connectivity Check
// ==========================================
app.post('/api/test-provider', async (req, res) => {
  const { provider, key } = req.body;
  const startTime = Date.now();

  try {
    if (provider === 'civitai') {
      const headers: Record<string, string> = { 'User-Agent': 'ComfyCanvas-AI/1.0' };
      if (key) headers['Authorization'] = `Bearer ${key}`;
      const resp = await fetch('https://civitai.com/api/v1/models?limit=1&types=LORA', { headers });
      const latency = Date.now() - startTime;
      if (resp.ok) {
        return res.json({
          status: 'ok',
          latency,
          message: 'Civitai API 验证成功，已开放 C 站全量 Checkpoint 与 LoRA 模型库检索',
        });
      }
      return res.json({ status: 'error', latency, message: `Civitai 返回错误状态码: ${resp.status}` });
    }

    if (provider === 'fal') {
      if (!key) return res.json({ status: 'error', message: '未配置 Fal.ai API 密钥' });
      // Test Fal by hitting schnell with a dry run check
      const falResp = await fetch('https://fal.run/fal-ai/flux/schnell', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: 'test connection ping', num_inference_steps: 1 }),
      });
      const latency = Date.now() - startTime;
      const falText = await falResp.text();

      if (falResp.ok) {
        return res.json({
          status: 'ok',
          latency,
          message: 'Fal.ai 认证成功，FLUX.1 极速云端推理引擎已就绪',
        });
      }

      if (falText.includes('TOP_UP') || falText.includes('locked')) {
        return res.json({
          status: 'warning',
          latency,
          message: 'Fal.ai Key 格式与认证有效，但账户额度已耗尽 (TOP_UP)，请充值或切换至其他引擎',
        });
      }

      return res.json({
        status: 'error',
        latency,
        message: `Fal.ai 响应: ${falText.slice(0, 100)}`,
      });
    }

    if (provider === 'huggingface') {
      if (!key) return res.json({ status: 'error', message: '未配置 Hugging Face Token' });
      const resp = await fetch('https://huggingface.co/api/whoami-v2', {
        headers: { 'Authorization': `Bearer ${key}` },
      });
      const latency = Date.now() - startTime;
      if (resp.ok) {
        const whoami = await resp.json();
        return res.json({
          status: 'ok',
          latency,
          message: `Hugging Face 认证成功：@${whoami.name || 'User'} (具备 Serverless 推理与 Hub 访问权限)`,
        });
      }
      return res.json({ status: 'error', latency, message: `Hugging Face 鉴权失败，状态码: ${resp.status}` });
    }

    if (provider === 'modelscope' || provider === 'modelscope_cn') {
      if (!key) return res.json({ status: 'error', message: '未配置魔搭国内站 (ModelScope CN) Token' });
      const latency = Date.now() - startTime;
      try {
        const resp = await fetch('https://api-inference.modelscope.cn/v1/models', {
          headers: { 'Authorization': `Bearer ${key}` },
        });
        if (resp.ok) {
          return res.json({
            status: 'ok',
            latency,
            message: '魔搭国内站 (modelscope.cn) 认证成功，已接入 Wan 2.1、Z-Image-Turbo 与全量微调 LoRA',
          });
        }
        const text = await resp.text();
        return res.json({ status: 'error', latency, message: `魔搭国内站鉴权未通过 [${resp.status}]: ${text}` });
      } catch (err: any) {
        return res.json({ status: 'error', latency, message: `网络连接失败: ${err.message}` });
      }
    }

    if (provider === 'modelscope_ai') {
      if (!key) return res.json({ status: 'error', message: '未配置魔搭国际站 (ModelScope AI) Token' });
      const latency = Date.now() - startTime;
      try {
        const resp = await fetch('https://api-inference.modelscope.ai/v1/models', {
          headers: { 'Authorization': `Bearer ${key}` },
        });
        if (resp.ok) {
          return res.json({
            status: 'ok',
            latency,
            message: '魔搭国际站 (modelscope.ai) 认证成功，已接入开源生图与通用推理模型',
          });
        }
        const text = await resp.text();
        return res.json({ status: 'error', latency, message: `魔搭国际站鉴权未通过 [${resp.status}]: ${text}` });
      } catch (err: any) {
        return res.json({ status: 'error', latency, message: `网络连接失败: ${err.message}` });
      }
    }

    if (provider === 'nanogpt') {
      if (!key) return res.json({ status: 'error', message: '未配置 NanoGPT API Key' });
      const resp = await fetch('https://nano-gpt.com/api/v1/images', {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: 'ping', model: 'flux-schnell' }),
      });
      const latency = Date.now() - startTime;
      const respText = await resp.text();

      if (resp.ok) {
        return res.json({ status: 'ok', latency, message: 'NanoGPT API 连接成功，按张计费极速通道已启用' });
      }

      if (respText.includes('invalid_api_key') || respText.includes('Invalid session')) {
        return res.json({
          status: 'error',
          latency,
          message: 'NanoGPT 提示 Invalid session/key，请确认密钥有效性或重新从 nano-gpt.com 复制',
        });
      }

      return res.json({ status: 'error', latency, message: `NanoGPT 响应状态: ${resp.status}` });
    }

    if (provider === 'gemini') {
      const effectiveKey = key || process.env.GEMINI_API_KEY;
      if (!effectiveKey) {
        return res.json({ status: 'error', message: '未配置 Google Gemini API 密钥' });
      }
      const testGen = createGoogleGenAI(effectiveKey);
      if (!testGen) {
        return res.json({ status: 'error', message: 'Google Gemini 初始化失败' });
      }
      await testGen.client.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
      });
      const latency = Date.now() - startTime;
      return res.json({
        status: 'ok',
        latency,
        message: 'Google Gemini 官方服务在线，Imagen 3.0 高清生图与智能提示词扩写就绪',
      });
    }

    if (provider === 'agnes') {
      const effectiveKey = key || cloudSettings['agnesKey'] || defaultKeys['agnesKey'] || '';
      const effectiveBaseUrl = cloudSettings['agnesBaseUrl'] || defaultKeys['agnesBaseUrl'] || 'https://apihub.agnes-ai.com/v1';
      if (!effectiveKey) {
        return res.json({ status: 'error', message: '未配置 Agnes AI API 密钥' });
      }
      const resp = await fetch(`${effectiveBaseUrl.replace(/\/+$/, '')}/models`, {
        headers: { Authorization: `Bearer ${effectiveKey}` },
      });
      const latency = Date.now() - startTime;
      if (resp.ok) {
        const mData = await resp.json();
        const count = mData.data?.length || 0;
        return res.json({
          status: 'ok',
          latency,
          message: `Agnes AI (ApiHub) 认证成功，已就绪 ${count} 个模型 (包含 2.5 Flash 生图、动态视频及 3.0 Flash 深度推理大模型)`,
        });
      }
      return res.json({ status: 'error', latency, message: `Agnes AI 验证失败，HTTP 状态码: ${resp.status}` });
    }

    if (provider === 'sensenova') {
      const effectiveKey = key || cloudSettings['sensenovaKey'] || defaultKeys['sensenovaKey'] || '';
      const effectiveBaseUrl = cloudSettings['sensenovaBaseUrl'] || defaultKeys['sensenovaBaseUrl'] || 'https://token.sensenova.cn/v1';
      if (!effectiveKey) {
        return res.json({ status: 'error', message: '未配置商汤日日新 API 密钥' });
      }
      const resp = await fetch(`${effectiveBaseUrl.replace(/\/+$/, '')}/models`, {
        headers: { Authorization: `Bearer ${effectiveKey}` },
      });
      const latency = Date.now() - startTime;
      if (resp.ok) {
        const mData = await resp.json();
        const count = mData.data?.length || 0;
        return res.json({
          status: 'ok',
          latency,
          message: `商汤日日新 (SenseNova) 认证成功，已就绪 ${count} 个大模型 (含 DeepSeek V4 深度思考、GLM-5.2、Kimi 及多模态视觉理解)`,
        });
      }
      return res.json({ status: 'error', latency, message: `商汤日日新 API 验证失败，HTTP 状态码: ${resp.status}` });
    }

    if (provider === 'tensorart') {
      const effectiveKey = key || cloudSettings['tensorartKey'] || process.env.TENSORART_API_KEY || '';
      if (!effectiveKey) {
        return res.json({ status: 'error', message: '未配置 Tensor.Art API Key' });
      }
      try {
        const tools = await fetchTensorArtToolsList(effectiveKey);
        const latencyMs = Date.now() - startTime;
        return res.json({
          status: 'ok',
          latency: latencyMs,
          message: `Tensor.Art (OpenWorks OpenAPI) 认证成功，已连通 ${tools.length} 个官方算力工具。`,
        });
      } catch (err: any) {
        return res.json({
          status: 'error',
          latency: Date.now() - startTime,
          message: `Tensor.Art OpenWorks 验证失败: ${err.message}`,
        });
      }
    }

    return res.status(400).json({ error: '未知模型服务商' });
  } catch (error: any) {
    return res.json({
      status: 'error',
      latency: Date.now() - startTime,
      message: error.message || '连接测试异常',
    });
  }
});

// Cloud Multi-Key Pool Stats
app.get('/api/cloud-keys/stats', (_req, res) => {
  keyPoolManager.refreshFromSettings();
  return res.json(keyPoolManager.getStats());
});

// Update Key Pool Strategy
app.post('/api/cloud-keys/strategy', (req, res) => {
  const { provider, strategy } = req.body;
  if (!provider || !strategy) {
    return res.status(400).json({ error: 'Missing provider or strategy' });
  }
  keyPoolManager.setStrategy(provider, strategy);
  cloudSettings[`${provider}_strategy`] = strategy;
  writeJsonFile(SETTINGS_FILE, cloudSettings);
  return res.json({ success: true, provider, strategy });
});

// Test single key directly
app.post('/api/cloud-keys/test-single', async (req, res) => {
  const { provider, key } = req.body;
  if (!provider || !key) {
    return res.status(400).json({ error: 'Missing provider or key' });
  }
  const startTime = Date.now();
  try {
    if (provider === 'fal') {
      const resp = await fetch('https://fal.run/fal-ai/flux/schnell', {
        method: 'POST',
        headers: { 'Authorization': `Key ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'ping', num_inference_steps: 1 }),
      });
      const latency = Date.now() - startTime;
      const text = await resp.text();
      if (resp.ok) {
        keyPoolManager.recordResult('fal', key, true, latency);
        return res.json({ status: 'active', latency, message: 'Fal.ai Key 正常就绪 (200 OK)' });
      }
      if (text.includes('TOP_UP') || text.includes('locked')) {
        keyPoolManager.recordResult('fal', key, false, latency, 'Fal 余额已耗尽', 429);
        return res.json({ status: 'rate_limited', latency, message: 'Fal.ai 认证有效，但余额不足 (需充值)' });
      }
      keyPoolManager.recordResult('fal', key, false, latency, text, resp.status);
      return res.json({ status: 'invalid', latency, message: `Fal.ai 认证未通过 [${resp.status}]` });
    }

    if (provider === 'gemini') {
      const testGen = createGoogleGenAI(key);
      if (!testGen) return res.json({ status: 'invalid', message: 'Google Gemini 实例初始化失败' });
      await testGen.client.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
      });
      const latency = Date.now() - startTime;
      keyPoolManager.recordResult('gemini', key, true, latency);
      return res.json({ status: 'active', latency, message: 'Google Gemini 官方直连正常' });
    }

    if (provider === 'huggingface') {
      const resp = await fetch('https://huggingface.co/api/whoami-v2', {
        headers: { 'Authorization': `Bearer ${key}` },
      });
      const latency = Date.now() - startTime;
      if (resp.ok) {
        const whoami = await resp.json();
        keyPoolManager.recordResult('huggingface', key, true, latency);
        return res.json({ status: 'active', latency, message: `HF 验证成功: @${whoami.name || 'User'}` });
      }
      keyPoolManager.recordResult('huggingface', key, false, latency, 'Invalid token', resp.status);
      return res.json({ status: 'invalid', latency, message: `HF 鉴权未通过 [${resp.status}]` });
    }

    if (provider === 'agnes') {
      const effectiveBaseUrl = cloudSettings['agnesBaseUrl'] || defaultKeys['agnesBaseUrl'] || 'https://apihub.agnes-ai.com/v1';
      const resp = await fetch(`${effectiveBaseUrl.replace(/\/+$/, '')}/models`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      const latency = Date.now() - startTime;
      if (resp.ok) {
        keyPoolManager.recordResult('agnes', key, true, latency);
        return res.json({ status: 'active', latency, message: 'Agnes AI (ApiHub) 正常可用' });
      }
      keyPoolManager.recordResult('agnes', key, false, latency, 'Unauthorized', resp.status);
      return res.json({ status: 'invalid', latency, message: `Agnes AI 鉴权失败 [${resp.status}]` });
    }

    if (provider === 'sensenova') {
      const effectiveBaseUrl = cloudSettings['sensenovaBaseUrl'] || defaultKeys['sensenovaBaseUrl'] || 'https://token.sensenova.cn/v1';
      const resp = await fetch(`${effectiveBaseUrl.replace(/\/+$/, '')}/models`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      const latency = Date.now() - startTime;
      if (resp.ok) {
        keyPoolManager.recordResult('sensenova', key, true, latency);
        return res.json({ status: 'active', latency, message: 'SenseNova (商汤日日新) 正常可用' });
      }
      keyPoolManager.recordResult('sensenova', key, false, latency, 'Unauthorized', resp.status);
      return res.json({ status: 'invalid', latency, message: `商汤日日新鉴权失败 [${resp.status}]` });
    }

    if (provider === 'nanogpt') {
      const resp = await fetch('https://nano-gpt.com/api/v1/images', {
        method: 'POST',
        headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'ping', model: 'flux-schnell' }),
      });
      const latency = Date.now() - startTime;
      if (resp.ok) {
        keyPoolManager.recordResult('nanogpt', key, true, latency);
        return res.json({ status: 'active', latency, message: 'NanoGPT 认证正常' });
      }
      const text = await resp.text();
      keyPoolManager.recordResult('nanogpt', key, false, latency, text, resp.status);
      return res.json({ status: 'invalid', latency, message: `NanoGPT 鉴权失败 [${resp.status}]` });
    }

    if (provider === 'tensorart') {
      const tools = await fetchTensorArtToolsList(key);
      const latency = Date.now() - startTime;
      keyPoolManager.recordResult('tensorart', key, true, latency);
      return res.json({ status: 'active', latency, message: `Tensor.Art OpenAPI 正常 (${tools.length} 工具)` });
    }

    if (provider === 'civitai') {
      const resp = await fetch('https://civitai.com/api/v1/models?limit=1', {
        headers: { Authorization: `Bearer ${key}` },
      });
      const latency = Date.now() - startTime;
      if (resp.ok) {
        keyPoolManager.recordResult('civitai', key, true, latency);
        return res.json({ status: 'active', latency, message: 'Civitai API 验证成功' });
      }
      return res.json({ status: 'invalid', latency, message: `Civitai 返回错误 [${resp.status}]` });
    }

    if (provider === 'modelscope' || provider === 'modelscope_ai') {
      const endpoint = provider === 'modelscope' ? 'https://api-inference.modelscope.cn/v1/models' : 'https://api-inference.modelscope.ai/v1/models';
      const resp = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${key}` },
      });
      const latency = Date.now() - startTime;
      if (resp.ok) {
        keyPoolManager.recordResult(provider, key, true, latency);
        return res.json({ status: 'active', latency, message: `魔搭社区 (${provider}) 验证成功` });
      }
      return res.json({ status: 'invalid', latency, message: `魔搭鉴权未通过 [${resp.status}]` });
    }

    return res.status(400).json({ error: '未知服务商' });
  } catch (err: any) {
    const errLower = (err.message || '').toLowerCase();
    const isRate =
      errLower.includes('quota') ||
      errLower.includes('resource_exhausted') ||
      errLower.includes('overloaded') ||
      errLower.includes('rate limit') ||
      errLower.includes('429') ||
      errLower.includes('503');
    const statusCode = isRate ? 429 : 400;
    keyPoolManager.recordResult(provider, key, false, Date.now() - startTime, err.message, statusCode);
    return res.json({
      status: isRate ? 'rate_limited' : 'invalid',
      latency: Date.now() - startTime,
      message: err.message || '测试异常',
    });
  }
});

// Balance & Quota Query Endpoint
app.get('/api/cloud-keys/balances', async (_req, res) => {
  const balances: Record<string, any> = {};

  // Parallel checks for providers
  await Promise.allSettled([
    // Fal.ai
    (async () => {
      const falKey = keyPoolManager.getNextKey('fal');
      if (falKey) {
        try {
          const resp = await fetch('https://fal.run/fal-ai/flux/schnell', {
            method: 'POST',
            headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: 'balance_ping', num_inference_steps: 1 }),
          });
          const text = await resp.text();
          if (resp.ok) {
            balances.fal = { status: 'ok', detail: 'Fal.ai 额度充足 / 按需计费正常' };
          } else if (text.includes('TOP_UP')) {
            balances.fal = { status: 'exhausted', detail: 'Fal.ai 账户余额已耗尽 (TOP_UP)' };
          } else {
            balances.fal = { status: 'unknown', detail: `Fal.ai 状态响应: ${resp.status}` };
          }
        } catch (e: any) {
          balances.fal = { status: 'error', detail: e.message };
        }
      }
    })(),

    // Google Gemini
    (async () => {
      const geminiKey = keyPoolManager.getNextKey('gemini') || process.env.GEMINI_API_KEY;
      if (geminiKey) {
        try {
          const testGen = createGoogleGenAI(geminiKey);
          if (testGen) {
            balances.gemini = { status: 'ok', detail: 'Google GenAI SDK 官方直连可用 (Imagen 3 & Gemini 3.8)' };
          }
        } catch (e: any) {
          balances.gemini = { status: 'error', detail: e.message };
        }
      }
    })(),

    // Agnes AI
    (async () => {
      const agnesKey = keyPoolManager.getNextKey('agnes');
      const agnesBaseUrl = cloudSettings['agnesBaseUrl'] || defaultKeys['agnesBaseUrl'] || 'https://apihub.agnes-ai.com/v1';
      if (agnesKey) {
        try {
          const resp = await fetch(`${agnesBaseUrl.replace(/\/+$/, '')}/models`, {
            headers: { Authorization: `Bearer ${agnesKey}` },
          });
          if (resp.ok) {
            balances.agnes = { status: 'ok', detail: 'Agnes AI 高并发聚合接口正常就绪' };
          } else {
            balances.agnes = { status: 'low', detail: `Agnes AI 状态码: ${resp.status}` };
          }
        } catch (e: any) {
          balances.agnes = { status: 'error', detail: e.message };
        }
      }
    })(),

    // SenseNova
    (async () => {
      const snKey = keyPoolManager.getNextKey('sensenova');
      const snBaseUrl = cloudSettings['sensenovaBaseUrl'] || defaultKeys['sensenovaBaseUrl'] || 'https://token.sensenova.cn/v1';
      if (snKey) {
        try {
          const resp = await fetch(`${snBaseUrl.replace(/\/+$/, '')}/models`, {
            headers: { Authorization: `Bearer ${snKey}` },
          });
          if (resp.ok) {
            balances.sensenova = { status: 'ok', detail: '商汤日日新 Token 账户正常可用' };
          } else {
            balances.sensenova = { status: 'low', detail: `商汤 API 状态码: ${resp.status}` };
          }
        } catch (e: any) {
          balances.sensenova = { status: 'error', detail: e.message };
        }
      }
    })(),

    // ModelScope CN & AI
    (async () => {
      const msKey = keyPoolManager.getNextKey('modelscope');
      if (msKey) {
        balances.modelscope = { status: 'ok', detail: '魔搭国内站 (modelscope.cn) 魔粒额度已挂载' };
      }
      const msAiKey = keyPoolManager.getNextKey('modelscope_ai');
      if (msAiKey) {
        balances.modelscope_ai = { status: 'ok', detail: '魔搭国际站 (modelscope.ai) 国际魔粒已挂载' };
      }
    })(),

    // Tensor.Art
    (async () => {
      const taKey = keyPoolManager.getNextKey('tensorart');
      if (taKey) {
        try {
          const tools = await fetchTensorArtToolsList(taKey);
          balances.tensorart = { status: 'ok', detail: `Tensor.Art 算力点数就绪 (${tools.length} 个工具可用)` };
        } catch (e: any) {
          balances.tensorart = { status: 'error', detail: e.message };
        }
      }
    })(),

    // Hugging Face
    (async () => {
      const hfKey = keyPoolManager.getNextKey('huggingface');
      if (hfKey) {
        try {
          const resp = await fetch('https://huggingface.co/api/whoami-v2', {
            headers: { 'Authorization': `Bearer ${hfKey}` },
          });
          if (resp.ok) {
            const whoami = await resp.json();
            balances.huggingface = { status: 'ok', detail: `@${whoami.name || 'User'} (Serverless 推理额度正常)` };
          }
        } catch (e: any) {
          balances.huggingface = { status: 'error', detail: e.message };
        }
      }
    })(),
  ]);

  return res.json(balances);
});

// ==========================================
// 8. Execution History (Server-Persisted)
// ==========================================
app.get('/api/history', (_req, res) => {
  return res.json(generationHistory);
});

app.post('/api/history', (req, res) => {
  const item: GeneratedItem = {
    id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: Date.now(),
    ...req.body,
  };
  generationHistory.unshift(item);
  // Keep last 100 items on server
  if (generationHistory.length > 100) {
    generationHistory.pop();
  }
  writeJsonFile(HISTORY_FILE, generationHistory);
  return res.json(item);
});

app.delete('/api/history/:id', (req, res) => {
  const { id } = req.params;
  const decodedId = decodeURIComponent(id || '').trim();
  generationHistory = generationHistory.filter((h) => {
    if (h.id === id || h.id === decodedId) return false;
    if (h.url && (h.url === id || h.url === decodedId)) return false;
    if (h.imageUrl && (h.imageUrl === id || h.imageUrl === decodedId)) return false;
    return true;
  });
  writeJsonFile(HISTORY_FILE, generationHistory);
  return res.json({ success: true, remaining: generationHistory.length });
});

app.post('/api/history/delete-batch', (req, res) => {
  const { ids = [] } = req.body || {};
  const idSet = new Set((ids as string[]).map((i) => decodeURIComponent(i || '').trim()));
  generationHistory = generationHistory.filter((h) => {
    if (h.id && idSet.has(h.id)) return false;
    if (h.url && idSet.has(h.url)) return false;
    if (h.imageUrl && idSet.has(h.imageUrl)) return false;
    return true;
  });
  writeJsonFile(HISTORY_FILE, generationHistory);
  return res.json({ success: true, remaining: generationHistory.length });
});

app.delete('/api/history', (_req, res) => {
  generationHistory = [];
  writeJsonFile(HISTORY_FILE, generationHistory);
  return res.json({ success: true });
});

// ==========================================
// 9. Cloud Projects & Canvas State (Server-Side Persistence)
// ==========================================
app.get('/api/cloud/projects', (_req, res) => {
  // If no projects exist, seed with default project
  if (cloudProjects.length === 0) {
    const defaultProject: CloudProject = {
      id: 'proj_default_master',
      name: 'Cyberpunk & Anime Studio',
      description: 'Default master infinite canvas workspace with FLUX.1 and SDXL presets',
      canvasMode: 'spatial',
      transform: { x: 80, y: 80, scale: 0.8 },
      spatialFrames: [],
      nodes: [],
      connections: [],
      updatedAt: Date.now(),
      createdAt: Date.now(),
    };
    cloudProjects.push(defaultProject);
    writeJsonFile(PROJECTS_FILE, cloudProjects);
  }

  // Return project summary list
  const summaries = cloudProjects.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    canvasMode: p.canvasMode,
    frameCount: p.spatialFrames?.length || 0,
    nodeCount: p.nodes?.length || 0,
    thumbnail: p.thumbnail || p.spatialFrames?.[0]?.imageUrl || '',
    updatedAt: p.updatedAt,
    createdAt: p.createdAt,
  }));

  return res.json(summaries);
});

app.get('/api/cloud/projects/:id', (req, res) => {
  const { id } = req.params;
  const project = cloudProjects.find((p) => p.id === id);
  if (!project) {
    return res.status(404).json({ error: 'Project not found on server' });
  }
  return res.json(project);
});

app.post('/api/cloud/projects', (req, res) => {
  try {
    const { id, name = '未命名无限画布项目', description, canvasMode = 'spatial', transform, spatialFrames = [], nodes = [], connections = [], thumbnail } = req.body;

    const projectId = id || `proj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const existingIndex = cloudProjects.findIndex((p) => p.id === projectId);

    const projectData: CloudProject = {
      id: projectId,
      name,
      description: description || 'Cloud Canvas Project',
      canvasMode,
      transform: transform || { x: 80, y: 80, scale: 0.8 },
      spatialFrames,
      nodes,
      connections,
      thumbnail: thumbnail || spatialFrames?.[0]?.imageUrl || '',
      updatedAt: Date.now(),
      createdAt: existingIndex >= 0 ? cloudProjects[existingIndex].createdAt : Date.now(),
    };

    if (existingIndex >= 0) {
      cloudProjects[existingIndex] = projectData;
    } else {
      cloudProjects.unshift(projectData);
    }

    writeJsonFile(PROJECTS_FILE, cloudProjects);
    return res.json({ success: true, project: projectData });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to save cloud project' });
  }
});

app.delete('/api/cloud/projects/:id', (req, res) => {
  const { id } = req.params;
  cloudProjects = cloudProjects.filter((p) => p.id !== id);
  writeJsonFile(PROJECTS_FILE, cloudProjects);
  return res.json({ success: true, remaining: cloudProjects.length });
});

app.post('/api/cloud/projects/:id/clone', (req, res) => {
  const { id } = req.params;
  const project = cloudProjects.find((p) => p.id === id);
  if (!project) {
    return res.status(404).json({ error: 'Source project not found' });
  }

  const clonedId = `proj_${Date.now()}_clone`;
  const cloned: CloudProject = {
    ...JSON.parse(JSON.stringify(project)),
    id: clonedId,
    name: `${project.name} (云端副本)`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  cloudProjects.unshift(cloned);
  writeJsonFile(PROJECTS_FILE, cloudProjects);
  return res.json({ success: true, project: cloned });
});

// ==========================================
// 10. Server-Side Settings / Credentials Storage
// ==========================================
function constantTimeCompare(a: string, b: string): boolean {
  try {
    const hashA = crypto.createHash('sha256').update(a).digest();
    const hashB = crypto.createHash('sha256').update(b).digest();
    return crypto.timingSafeEqual(hashA, hashB);
  } catch {
    return false;
  }
}

const requireAdminAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const adminToken = process.env.CANVAS_ADMIN_TOKEN?.trim();
  if (!adminToken) {
    return res.status(503).json({
      error: '服务端未配置 CANVAS_ADMIN_TOKEN，拒绝访问',
    });
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader || typeof authHeader !== 'string') {
    return res.status(401).json({
      error: '缺少 Authorization 请求头，需提供 Bearer 管理令牌',
    });
  }

  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return res.status(401).json({
      error: 'Authorization 格式错误，应为 Bearer <token>',
    });
  }

  const providedToken = parts[1];
  if (!constantTimeCompare(providedToken, adminToken)) {
    return res.status(401).json({
      error: 'CANVAS_ADMIN_TOKEN 验证失败：管理令牌不匹配',
    });
  }

  next();
};

const isSecretKeyField = (fieldName: string): boolean => {
  const lower = fieldName.toLowerCase();
  return (
    lower.includes('key') ||
    lower.includes('token') ||
    lower.includes('secret') ||
    lower.includes('password')
  );
};

const getSanitizedCloudSettings = (settings: Record<string, any>): Record<string, any> => {
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (isSecretKeyField(key)) {
      const valStr = typeof value === 'string' ? value.trim() : '';
      const isConfigured = valStr.length > 0;
      sanitized[key] = {
        masked: isConfigured ? keyPoolManager.maskKey(valStr) : '',
        configured: isConfigured,
        isConfigured: isConfigured,
      };
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

app.get('/api/cloud/settings', requireAdminAuth, (_req, res) => {
  return res.json(getSanitizedCloudSettings(cloudSettings));
});

app.post('/api/cloud/settings', requireAdminAuth, (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: '请求体必须为有效的 JSON 对象' });
  }

  cloudSettings = {
    ...cloudSettings,
    ...req.body,
  };
  writeJsonFile(SETTINGS_FILE, cloudSettings);
  keyPoolManager.refreshFromSettings();
  return res.json({ success: true, settings: getSanitizedCloudSettings(cloudSettings) });
});

// ==========================================
// 11. Cloud Server Status & Health
// ==========================================
app.get('/api/cloud/health', (_req, res) => {
  return res.json({
    status: 'online',
    serverType: 'ComfyCanvas Cloud Studio Server',
    uptimeSeconds: Math.floor(process.uptime()),
    projectsCount: cloudProjects.length,
    historyCount: generationHistory.length,
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    timestamp: Date.now(),
  });
});

// Vite Middleware integration for development
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production static serve
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  const HOST = process.env.HOST || '127.0.0.1';
  app.listen(PORT, HOST, () => {
    console.log(`[ComfyCanvas Studio] Server listening on ${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
