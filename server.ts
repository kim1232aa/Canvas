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
import { fieldOptions, getFieldSpec, modelStatus, valueStatus, type FieldKey, type Provider as SchemaProvider } from './src/schemas/providerSchema.ts';
import {
  extractCompatImageUrl,
  normalizeGrokCompatBaseUrl,
  normalizeOpenAICompatBaseUrl,
  resolveAgainstBaseOrigin,
} from './src/engines/compatRelay.ts';
import { enrichPoolStatsWithServerBaseUrl } from './src/utils/poolStatsEnrich.ts';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
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
app.set('case sensitive routing', true);
const PORT = Number(process.env.PORT) || 3000;

// ==========================================
// Upstream request log: one JSON line per provider call → logs/upstream.log
// Never logs keys, Authorization headers, or query strings that carry tokens.
// ==========================================
const UPSTREAM_LOG_FILE = path.join(__dirname, 'logs', 'upstream.log');

const maskSecret = (key: string): string => {
  if (!key) return '';
  if (key.length <= 8) return `${key.substring(0, 2)}***${key.substring(key.length - 2)}`;
  return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
};

interface UpstreamMeta {
  provider: string;
  route: string; // this server's route (req.path)
  model?: string; // model actually sent upstream
  key?: string; // only its masked form is logged
}

const sanitizeUpstreamUrl = (raw: string): string => {
  try {
    const u = new URL(raw);
    const q = /token|key|auth|secret|sig|credential|password/i.test(u.search) ? '' : u.search;
    return `${u.host}${u.pathname}${q}`;
  } catch {
    return raw.split('?')[0];
  }
};

const logUpstream = (meta: UpstreamMeta, upstream: string, status: number, startedAt: number, error?: string) => {
  try {
    fs.mkdirSync(path.dirname(UPSTREAM_LOG_FILE), { recursive: true });
    fs.appendFileSync(
      UPSTREAM_LOG_FILE,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        provider: meta.provider,
        route: meta.route,
        upstream,
        model: meta.model ?? null,
        maskedKey: meta.key ? maskSecret(meta.key) : null,
        status,
        durationMs: Date.now() - startedAt,
        error: error ?? null,
      }) + '\n'
    );
  } catch (e: any) {
    console.error('upstream.log 写入失败:', e.message);
  }
};

// All provider HTTP calls go through here.
async function upstreamFetch(meta: UpstreamMeta, url: string, init?: RequestInit): Promise<Response> {
  const startedAt = Date.now();
  const upstream = sanitizeUpstreamUrl(url);
  try {
    const res = await fetch(url, init);
    let error: string | undefined;
    if (!res.ok) {
      error = `HTTP ${res.status}: ${(await res.clone().text().catch(() => '')).slice(0, 500)}`;
    }
    logUpstream(meta, upstream, res.status, startedAt, error);
    return res;
  } catch (e: any) {
    logUpstream(meta, upstream, 0, startedAt, e?.message || String(e));
    throw e;
  }
}

// Owner rule: params a provider does not support → explicit 400, never silently dropped.
const isProvided = (v: any) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);
const rejectUnsupported = (res: express.Response, provider: string, body: any, fields: string[]): boolean => {
  const bad = fields.filter((f) => isProvided(body?.[f]));
  if (bad.length === 0) return false;
  res.status(400).json({ error: `该服务商不支持: ${bad.join(', ')}（${provider}）`, unsupported: bad });
  return true;
};

// SDK calls (@google/genai, @huggingface/inference) are logged through the same sink.
async function upstreamSdkCall<T>(meta: UpstreamMeta & { upstream: string }, fn: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    const out = await fn();
    logUpstream(meta, meta.upstream, 200, startedAt);
    return out;
  } catch (e: any) {
    logUpstream(meta, meta.upstream, Number(e?.status || e?.statusCode || e?.httpResponse?.status || 0), startedAt, e?.message || String(e));
    throw e;
  }
}

// Request body limit configuration:
// Large limit (50mb) is reserved strictly for routes that legitimately process image/video payloads or full canvas graphs.
// Default limit (1mb) applies to all other routes.
const jsonParserDefault = express.json({ limit: '1mb' });
const jsonParserLarge = express.json({ limit: '50mb' });

const LARGE_BODY_ROUTES = new Set([
  // Generation & editing endpoints with base64 images / init images / video frames
  '/api/fal/generate',
  '/api/generate',
  '/api/video/generate',
  '/api/engine/video/generate',
  '/api/engine/civitai/generate',
  '/api/civitai/generate',
  '/api/engine/agnes/generate',
  '/api/agnes/generate',
  '/api/tensorart/upload',
  '/api/engine/tensorart/upload',
  '/api/tensorart/generate',
  '/api/engine/tensorart/generate',
  '/api/huggingface/generate',
  '/api/engine/huggingface/generate',
  '/api/modelscope/generate',
  '/api/engine/modelscope/generate',
  '/api/modelscope_ai/generate',
  '/api/engine/modelscope_ai/generate',
  '/api/nanogpt/generate',
  '/api/engine/nanogpt/generate',
  '/api/gemini/generate',
  '/api/engine/gemini/generate',
  '/api/engine/openai_compat/generate',
  '/api/openai_compat/generate',
  '/api/engine/grok_compat/generate',
  '/api/grok_compat/generate',
  // Canvas project saving (includes embedded frame image data and full canvas state)
  '/api/cloud/projects',
]);

const isLargeBodyRoute = (req: express.Request): boolean => {
  return LARGE_BODY_ROUTES.has(req.path);
};

const isApiPath = (p: string): boolean => {
  const lower = (p || '').toLowerCase();
  return lower === '/api' || lower.startsWith('/api/');
};

// Anti CSRF / DNS rebinding: /api only answers requests addressed to this local server.
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const ALLOWED_ORIGINS = new Set([`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`]);

app.use((req, res, next) => {
  if (!isApiPath(req.path)) return next();
  const host = req.headers.host;
  if (!host || !ALLOWED_HOSTS.has(host)) {
    return res.status(403).json({
      error: `Host 请求头被拒绝：收到 ${JSON.stringify(host ?? null)}，仅允许 ${[...ALLOWED_HOSTS].join(' / ')}`,
    });
  }
  const origin = req.headers.origin;
  if (origin !== undefined && !ALLOWED_ORIGINS.has(origin)) {
    return res.status(403).json({
      error: `Origin 请求头被拒绝：收到 ${JSON.stringify(origin)}，仅允许 ${[...ALLOWED_ORIGINS].join(' / ')}`,
    });
  }
  next();
});

// Only application/json request bodies are accepted on mutating /api requests.
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
app.use((req, res, next) => {
  if (!isApiPath(req.path) || !BODY_METHODS.has(req.method)) return next();
  const hasBody = Number(req.headers['content-length'] || 0) > 0 || req.headers['transfer-encoding'] !== undefined;
  if (!hasBody) return next();
  const contentType = req.headers['content-type'];
  const mediaType = (contentType || '').split(';')[0].trim().toLowerCase();
  if (mediaType !== 'application/json') {
    return res.status(415).json({
      error: `不支持的请求体类型：收到 Content-Type ${JSON.stringify(contentType ?? null)}，/api 仅接受 application/json`,
    });
  }
  next();
});

app.use((req, res, next) => {
  const parser = isLargeBodyRoute(req) ? jsonParserLarge : jsonParserDefault;
  parser(req, res, next);
});

// Admin authentication & CSRF validation helpers
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

const checkSecFetchSite = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const fetchSite = req.headers['sec-fetch-site'];
  if (fetchSite && typeof fetchSite === 'string') {
    const site = fetchSite.toLowerCase();
    if (site === 'cross-site' || site === 'same-site') {
      return res.status(403).json({ error: `跨站请求被拒绝: Sec-Fetch-Site 为 ${fetchSite}` });
    }
    if (site === 'same-origin' || site === 'none') {
      return next();
    }
    return res.status(403).json({ error: `跨站请求被拒绝: Sec-Fetch-Site 为 ${fetchSite}` });
  }

  // 缺省时回退到 Origin 判断
  const origin = req.headers.origin;
  if (origin !== undefined && !ALLOWED_ORIGINS.has(origin)) {
    return res.status(403).json({
      error: `Origin 请求头被拒绝：收到 ${JSON.stringify(origin)}，仅允许 ${[...ALLOWED_ORIGINS].join(' / ')}`,
    });
  }
  next();
};

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
  prompt: string | null;
  negativePrompt?: string | null;
  provider: string | null;
  actualProvider?: string | null;
  model: string | null;
  actualModel?: string | null;
  // null = not sent upstream; never fabricate
  seed: number | null;
  steps: number | null;
  cfg: number | null;
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
  agnesBaseUrl: process.env.AGNES_BASE_URL || '',
  sensenovaBaseUrl: process.env.SENSENOVA_BASE_URL || '',
  openaiCompatKey: process.env.OPENAI_COMPAT_IMAGE_API_KEY || '',
  openaiCompatBaseUrl: process.env.OPENAI_COMPAT_IMAGE_BASE_URL || '',
  grokCompatKey: process.env.GROK_COMPAT_API_KEY || '',
  grokCompatBaseUrl: process.env.GROK_COMPAT_BASE_URL || '',
};

// Pool key sources per provider: settings.json fields (in order), then the defaultKeys (env) field.
const POOL_KEY_FIELDS: Record<string, { settings: string[]; env: string }> = {
  fal: { settings: ['falKey'], env: 'falKey' },
  agnes: { settings: ['agnesKey'], env: 'agnesKey' },
  sensenova: { settings: ['sensenovaKey'], env: 'sensenovaKey' },
  civitai: { settings: ['civitaiToken', 'civitaiKey'], env: 'civitaiKey' },
  huggingface: { settings: ['hfToken'], env: 'hfToken' },
  modelscope: { settings: ['modelscopeToken'], env: 'modelscopeToken' },
  modelscope_ai: { settings: ['modelscopeAiToken'], env: 'modelscopeAiToken' },
  nanogpt: { settings: ['nanogptKey'], env: 'nanogptKey' },
  tensorart: { settings: ['tensorartKey'], env: 'tensorartKey' },
  gemini: { settings: ['geminiKey'], env: 'geminiKey' },
  openai_compat: { settings: ['openaiCompatKey'], env: 'openaiCompatKey' },
  grok_compat: { settings: ['grokCompatKey'], env: 'grokCompatKey' },
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
    const providerKeyMap: Record<string, string[]> = {};
    for (const [prov, { settings, env }] of Object.entries(POOL_KEY_FIELDS)) {
      providerKeyMap[prov] = [...settings.flatMap((f) => this.parseKeyString(cloudSettings[f])), ...this.parseKeyString(defaultKeys[env])];
    }

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

  public getKeys(prov: string): string[] {
    return (this.pools.get(prov) || []).map((k) => k.key);
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

      let errorSummary = 'error';
      if (errLower.includes('timeout') || errLower.includes('etimedout')) {
        errorSummary = 'timeout';
      } else if (errLower.includes('econnrefused') || errLower.includes('econnreset') || errLower.includes('fetch failed')) {
        errorSummary = 'network_error';
      } else if (statusCode > 0) {
        errorSummary = `HTTP ${statusCode}`;
      } else if (isRate) {
        errorSummary = 'rate_limited';
      } else if (isInvalid) {
        errorSummary = 'invalid_key';
      }
      if (key && errorSummary.includes(key)) {
        errorSummary = errorSummary.replaceAll(key, maskSecret(key));
      }
      entry.lastError = errorSummary;

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
          maskedKey: k.maskedKey,
          source: this.keySource(prov, k.key),
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

  // S7: where each pool key came from (settings.json wins when a key is in both).
  private keySource(prov: string, key: string): 'settings' | 'env' {
    const fields = POOL_KEY_FIELDS[prov]?.settings || [];
    return fields.some((f) => this.parseKeyString(cloudSettings[f]).includes(key)) ? 'settings' : 'env';
  }
}

const keyPoolManager = new KeyPoolManager();

const MAX_HISTORY_COUNT = 500;

// Helper to record history safely both in memory and file
const recordHistoryItem = (item: Partial<GeneratedItem>): GeneratedItem => {
  const fullItem: GeneratedItem = {
    ...item,
    id: item.id || `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: item.timestamp || Date.now(),
    url: item.url || '',
    prompt: typeof item.prompt === 'string' && item.prompt.trim() ? item.prompt.trim() : null,
    negativePrompt: typeof item.negativePrompt === 'string' && item.negativePrompt.trim() ? item.negativePrompt.trim() : null,
    // Y1: 未知就 null，绝不用 'ComfyUI Engine' 这类假标签
    provider: typeof item.provider === 'string' && item.provider.trim() ? item.provider.trim() : null,
    actualProvider: typeof item.actualProvider === 'string' && item.actualProvider.trim() ? item.actualProvider.trim() : (typeof item.provider === 'string' && item.provider.trim() ? item.provider.trim() : null),
    model: typeof item.model === 'string' && item.model.trim() ? item.model.trim() : null,
    actualModel: typeof item.actualModel === 'string' && item.actualModel.trim() ? item.actualModel.trim() : (typeof item.model === 'string' && item.model.trim() ? item.model.trim() : null),
    // null = not sent upstream. Never fabricate random seeds or default steps/cfg.
    seed: typeof item.seed === 'number' ? item.seed : null,
    steps: typeof item.steps === 'number' ? item.steps : null,
    cfg: typeof item.cfg === 'number' ? item.cfg : null,
    loras: Array.isArray(item.loras) ? item.loras : [],
  };
  generationHistory.unshift(fullItem);
  if (generationHistory.length > MAX_HISTORY_COUNT) {
    generationHistory.splice(MAX_HISTORY_COUNT);
  }
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

// Agnes / SenseNova / OpenAI-compat / Grok-compat key + base URL resolution (A1/A2).
// Key: header (comma-separated rotates) > pool (settings + env, comma-separated). Base URL: header > settings > env. No hardcoded default.
// A custom base URL requires a custom key — server keys are never sent to a user-supplied host.
type AuthProvider = 'agnes' | 'sensenova' | 'openai_compat' | 'grok_compat';
const AUTH_META: Record<AuthProvider, { headerPrefix: string; settingsBaseName: string; envName: string }> = {
  agnes: { headerPrefix: 'x-agnes', settingsBaseName: 'agnesBaseUrl', envName: 'AGNES' },
  sensenova: { headerPrefix: 'x-sensenova', settingsBaseName: 'sensenovaBaseUrl', envName: 'SENSENOVA' },
  openai_compat: { headerPrefix: 'x-openai-compat', settingsBaseName: 'openaiCompatBaseUrl', envName: 'OPENAI_COMPAT_IMAGE' },
  grok_compat: { headerPrefix: 'x-grok-compat', settingsBaseName: 'grokCompatBaseUrl', envName: 'GROK_COMPAT' },
};

function normalizeAuthBaseUrl(provider: AuthProvider, raw: string): string {
  if (provider === 'openai_compat') return normalizeOpenAICompatBaseUrl(raw);
  if (provider === 'grok_compat') return normalizeGrokCompatBaseUrl(raw);
  return String(raw || '').trim().replace(/\/+$/, '');
}

function resolveProviderAuth(
  req: express.Request,
  provider: AuthProvider
): { apiKey: string; baseUrl: string; error?: string } {
  const { headerPrefix, settingsBaseName, envName } = AUTH_META[provider];

  const customBaseUrl = (req.headers[`${headerPrefix}-base-url`] as string)?.trim() || '';
  const customKey = (req.headers[`${headerPrefix}-key`] as string)?.trim() || '';

  if (customBaseUrl && !customKey) {
    return { apiKey: '', baseUrl: '', error: `使用自定义 base URL (${headerPrefix}-base-url) 时必须同时提供自定义 API Key (${headerPrefix}-key)，禁止回退使用服务端密钥。` };
  }
  const baseUrl = normalizeAuthBaseUrl(
    provider,
    String(customBaseUrl || cloudSettings[settingsBaseName] || defaultKeys[settingsBaseName] || ''),
  );
  if (!baseUrl) {
    return { apiKey: '', baseUrl: '', error: `未配置 ${provider} Base URL（${envName}_BASE_URL / 设置面板 / ${headerPrefix}-base-url）。` };
  }
  const apiKey = keyPoolManager.getNextKey(provider, customKey || undefined);
  if (!apiKey) {
    return { apiKey: '', baseUrl, error: `未配置 ${provider} API 密钥（${envName}_KEY / 设置面板 / ${headerPrefix}-key）。` };
  }
  return { apiKey, baseUrl };
}

// Server-side base URL only (settings > env) — never from request headers, since callers use pool keys.
function getProviderBaseUrl(provider: AuthProvider): { baseUrl: string; error?: string } {
  const { settingsBaseName, envName } = AUTH_META[provider];
  const baseUrl = normalizeAuthBaseUrl(
    provider,
    String(cloudSettings[settingsBaseName] || defaultKeys[settingsBaseName] || ''),
  );
  if (!baseUrl) {
    return { baseUrl: '', error: `未配置 ${provider} Base URL（${envName}_BASE_URL / 设置面板）。` };
  }
  return { baseUrl };
}

function rejectSchemaEnum(
  res: express.Response,
  provider: SchemaProvider,
  model: string,
  field: FieldKey,
  value: unknown,
): boolean {
  if (!isProvided(value)) return false;
  const status = valueStatus(provider, model, field, value as string | number);
  if (status !== 'unsupported') return false;
  const listed = fieldOptions(provider, model, field).map((v) => v.value);
  res.status(400).json({
    error: `该服务商不支持此 ${field} 取值: "${value}"。${model} 官方仅支持: ${listed.join(', ') || '（官方未列出）'}`,
    unsupported: [field],
  });
  return true;
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

    const response = await upstreamFetch(
      { provider: 'civitai', route: req.path, key: apiKey },
      `https://civitai.com/api/v1/models?${params.toString()}`,
      {
        headers,
        signal: AbortSignal.timeout(30000), // Increased to 30s
      }
    );

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
    const resp = await upstreamFetch(
      { provider: 'huggingface', route: req.path, model: modelId, key: hfToken },
      url,
      { headers, signal: AbortSignal.timeout(15000) }
    );
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
  const res = await upstreamFetch(
    { provider: 'tensorart', route: 'model-info', model: cleanId },
    url,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
    }
  );

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
  const res = await upstreamFetch(
    { provider: 'tensorart', route: 'models-scrape', model: arch || searchStr || 'list' },
    url,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
    }
  );

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

    const response = await upstreamFetch(
      { provider: 'civitai', route: req.path, model: id, key: apiKey },
      `https://civitai.com/api/v1/models/${id}`,
      { headers }
    );
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
    const resp = await upstreamFetch(
      { provider: 'civitai', route: 'image-metadata', model: imageId },
      `https://civitai.com/images/${imageId}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      }
    );
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
    let seed: number | null = null;
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
        const vResp = await upstreamFetch(
          { provider: 'civitai', route: 'workflow-extract-version', model: String(targetVersionId), key: apiKey },
          `https://civitai.com/api/v1/model-versions/${targetVersionId}`,
          {
            headers: apiKey ? { Authorization: `Bearer ${apiKey}`, 'User-Agent': 'ComfyCanvas/1.0' } : { 'User-Agent': 'ComfyCanvas/1.0' },
          }
        );
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
        const mResp = await upstreamFetch(
          { provider: 'civitai', route: 'workflow-extract-model', model: String(targetModelId), key: apiKey },
          `https://civitai.com/api/v1/models/${targetModelId}`,
          {
            headers: apiKey ? { Authorization: `Bearer ${apiKey}`, 'User-Agent': 'ComfyCanvas/1.0' } : { 'User-Agent': 'ComfyCanvas/1.0' },
          }
        );
        if (mResp.ok) {
          const mData = await mResp.json();
          presetTitle = `Civitai 模型定制：${mData.name}`;
          creatorName = mData.creator?.username || creatorName;
          const v0 = (mData.modelVersions || [])[0];
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
      chosenEngineName = "Google Gemini 生图引擎";
      checkpoint = rawModelName;
      baseModelArchitecture = "Gemini Image";
      engineExplanation = "🌟 Google Gemini 官方生图（generateContent）。";
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
      seed: seed,
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
        { id: "gemini", name: "Google Gemini", badge: "官方直连", description: "Gemini 官方生图 (generateContent)" },
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
    const detailRes = await upstreamFetch(
      { provider: isCn ? 'modelscope_cn' : 'modelscope_ai', route: 'model-detail', model: modelId },
      `${baseUrl}/api/v1/models/${modelId}`,
      {
        headers: { 'User-Agent': 'ComfyCanvas/1.0' },
        signal: AbortSignal.timeout(3500),
      }
    );
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
    const filesRes = await upstreamFetch(
      { provider: isCn ? 'modelscope_cn' : 'modelscope_ai', route: 'repo-files', model: modelId },
      `${baseUrl}/api/v1/models/${modelId}/repo/files?Recursive=true`,
      {
        headers: { 'User-Agent': 'ComfyCanvas/1.0' },
        signal: AbortSignal.timeout(3500),
      }
    );
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
    badge = category === 'Checkpoint' ? 'Gemini Image' : 'Gemini 原生';
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
        const msResp = await upstreamFetch(
          { provider: 'modelscope_cn', route: req.path, model: msSearch },
          msUrl,
          { headers: { 'User-Agent': 'ComfyCanvas/1.0' }, signal: AbortSignal.timeout(15000) }
        );
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
        const msResp = await upstreamFetch(
          { provider: 'modelscope_ai', route: req.path, model: msSearch },
          msUrl,
          { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, signal: AbortSignal.timeout(15000) }
        );
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
        const hfResp = await upstreamFetch(
          { provider: 'huggingface', route: req.path, model: searchStr || 'list', key: hfToken },
          hfUrl,
          {
            headers: hfHeaders,
            signal: AbortSignal.timeout(15000),
          }
        );

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
              const exactResp = await upstreamFetch(
                { provider: 'huggingface', route: req.path, model: searchStr, key: hfToken },
                exactUrl,
                { headers: hfHeaders, signal: AbortSignal.timeout(8000) }
              );
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
          const civitaiResp = await upstreamFetch(
            { provider: 'civitai', route: req.path, model: (params.get('query') || params.get('types') || 'list'), key: civitaiToken },
            `https://civitai.com/api/v1/models?${params.toString()}`,
            {
              headers: civitaiHeaders,
              signal: AbortSignal.timeout(30000), // Increased to 30s
            }
          );
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
                baseModel: (m.modelVersions || [])[0]?.baseModel || "FLUX.1 / SDXL",
                downloads: m.stats?.downloadCount || 0,
                rating: m.stats?.rating || 0,
                imageUrl: (m.modelVersions || [])[0]?.images?.[0]?.url || "",
                externalUrl: `https://civitai.com/models/${m.id}`,
                trainedWords: Array.isArray((m.modelVersions || [])[0]?.trainedWords) ? (m.modelVersions || [])[0].trainedWords : [],
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
          fetchUrls.map((u) =>
            upstreamFetch(
              { provider: 'fal', route: req.path, model: u.includes('text-to-video') ? 'category:video' : 'category:image', key: falKey },
              u,
              { headers: falHeaders, signal: AbortSignal.timeout(15000) }
            )
          )
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

          const fetchImageModels = shouldFetchImage
            ? upstreamFetch(
                { provider: 'nanogpt', route: req.path, model: 'image-models' },
                'https://api.nano-gpt.com/api/v1/image-models',
                {
                  headers: { 'User-Agent': 'ComfyCanvas/1.0' },
                  signal: AbortSignal.timeout(10000),
                }
              )
            : Promise.resolve(null);

          const fetchVideoModels = shouldFetchVideo
            ? upstreamFetch(
                { provider: 'nanogpt', route: req.path, model: 'video-models' },
                'https://api.nano-gpt.com/api/v1/video-models',
                {
                  headers: { 'User-Agent': 'ComfyCanvas/1.0' },
                  signal: AbortSignal.timeout(10000),
                }
              )
            : Promise.resolve(null);

          const [imgResp, vidResp] = await Promise.all([fetchImageModels, fetchVideoModels]);

          if (imgResp) {
            if (!imgResp.ok) {
              const errText = await imgResp.text().catch(() => '');
              throw new Error(`NanoGPT image-models 失败 [${imgResp.status}]: ${errText.slice(0, 200)}`);
            }
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

          if (vidResp) {
            if (!vidResp.ok) {
              const errText = await vidResp.text().catch(() => '');
              throw new Error(`NanoGPT video-models 失败 [${vidResp.status}]: ${errText.slice(0, 200)}`);
            }
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
          const gResp = await upstreamFetch(
            { provider: 'gemini', route: req.path, model: 'models', key: geminiKey },
            'https://generativelanguage.googleapis.com/v1beta/models',
            {
              headers: {
                'x-goog-api-key': geminiKey,
              },
              signal: AbortSignal.timeout(4500),
            }
          );
          if (gResp.ok) {
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
                  provider: "Google Gemini",
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

// Item 7: read-only Fal key check — GET api.fal.ai/v1/account/billing (no generation, no cost).
// 200 → key valid + balance; 401 → invalid; 403 → authenticated but not an Admin key (billing needs Admin).
async function falReadOnlyKeyCheck(key: string, route: string): Promise<{ status: 'active' | 'invalid' | 'unknown' | 'error'; message: string; balance?: string }> {
  const resp = await upstreamFetch(
    { provider: 'fal', route, model: 'account/billing', key },
    'https://api.fal.ai/v1/account/billing',
    { headers: { 'Authorization': `Key ${key}` } }
  );
  if (resp.ok) {
    const data: any = await resp.json().catch(() => ({}));
    const bal = data?.credits?.current_balance;
    const balance = typeof bal === 'number' ? `${bal} ${data?.credits?.currency || ''}`.trim() : undefined;
    return { status: 'active', message: `Fal.ai Key 有效${balance ? `，余额 ${balance}` : ''}`, balance };
  }
  const errBody = await resp.text().catch(() => '');
  if (resp.status === 401 || resp.status === 403) {
    return {
      status: 'unknown',
      message: `Fal.ai 账单接口返回 [${resp.status}]: ${errBody.slice(0, 300)}。该接口需要 admin key，无法据此判断普通 key 是否有效。`,
    };
  }
  return { status: 'error', message: `Fal.ai 账单接口返回 [${resp.status}]: ${errBody.slice(0, 300)}` };
}

function normalizeFalEndpoint(model: string, isVideo = false): string {
  const m = (model || '').toLowerCase().trim();

  // If in video generation mode, force video endpoints
  if (isVideo) {
    // Rewrite known-dead Wan ids before the fal-ai/ passthrough
    if (m === 'fal-ai/wan/v2.1/text-to-video' || m === 'fal-ai/wan/t2v') return 'fal-ai/wan-t2v';
    if (m === 'fal-ai/wan/v2.1/image-to-video') return 'fal-ai/wan-i2v';
    // Full Fal endpoint IDs are passed through verbatim
    if (m.startsWith('fal-ai/')) return model.trim();
    if (m === 'kling-video/v1/standard/text-to-video') return 'fal-ai/kling-video/v1/standard/text-to-video';
    if (m === 'kling-video/v1/standard/image-to-video') return 'fal-ai/kling-video/v1/standard/image-to-video';
    if (m === 'ltx-video') return 'fal-ai/ltx-video';
    if (m === 'minimax/video-01') return 'fal-ai/minimax/video-01';
    if (m === 'cogvideox-5b') return 'fal-ai/cogvideox-5b';
    if (m === 'hunyuan-video') return 'fal-ai/hunyuan-video';
    if (
      m === 'wan/v2.1/image-to-video' ||
      m === 'fal-ai/wan/v2.1/image-to-video' ||
      m === 'wan-i2v' ||
      m === 'fal-ai/wan-i2v'
    ) return 'fal-ai/wan-i2v';
    if (
      m === 'damo/wan2.1-t2v' ||
      m === 'wan2.1-t2v' ||
      m === 'wan/v2.1/text-to-video' ||
      m === 'fal-ai/wan/v2.1/text-to-video' ||
      m === 'wan/t2v' ||
      m === 'fal-ai/wan/t2v' ||
      m === 'wan-t2v' ||
      m === 'fal-ai/wan-t2v'
    ) return 'fal-ai/wan-t2v';
    // F4: unrecognized video model → empty string signals caller to 400
    return '';
  }

  // F3: fal-ai/flux-lora is an independent endpoint, NOT rewritten to fal-ai/flux/dev
  if (m === 'fal-ai/flux-lora' || m === 'flux-lora') {
    return 'fal-ai/flux-lora';
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
    m === 'fal-ai/flux-dev'
  ) {
    return 'fal-ai/flux/dev';
  }
  // F7: Only standard SDXL 1.0 aliases map to fast-sdxl; SD1.5/Pony/Animagine are NOT replaced
  if (
    m === 'stabilityai/stable-diffusion-xl-base-1.0' ||
    m === 'stable-diffusion-xl-base-1.0' ||
    m === 'sdxl' ||
    m === 'sdxl-1.0' ||
    m === 'fal-ai/stable-diffusion-xl-base-1.0' ||
    m === 'fal-ai/fast-sdxl'
  ) {
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
    m === 'wan2.1-t2v' ||
    m === 'wan/t2v' ||
    m === 'fal-ai/wan/t2v' ||
    m === 'wan-t2v' ||
    m === 'fal-ai/wan-t2v'
  ) {
    return 'fal-ai/wan-t2v';
  }
  if (
    m === 'wan/v2.1/image-to-video' ||
    m === 'fal-ai/wan/v2.1/image-to-video' ||
    m === 'wan-i2v' ||
    m === 'fal-ai/wan-i2v'
  ) {
    return 'fal-ai/wan-i2v';
  }
  if (m === 'fal-ai/ltx-video' || m === 'ltx-video') {
    return 'fal-ai/ltx-video';
  }
  if (m === 'fal-ai/kling-video/v1/standard/text-to-video' || m === 'kling-video/v1/standard/text-to-video') {
    return 'fal-ai/kling-video/v1/standard/text-to-video';
  }
  if (m === 'fal-ai/minimax/video-01' || m === 'minimax/video-01') {
    return 'fal-ai/minimax/video-01';
  }
  if (m === 'fal-ai/cogvideox-5b' || m === 'cogvideox-5b') {
    return 'fal-ai/cogvideox-5b';
  }
  if (m === 'fal-ai/hunyuan-video' || m === 'hunyuan-video') {
    return 'fal-ai/hunyuan-video';
  }
  if (m.startsWith('fal-ai/')) {
    return model.trim();
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
  const startTime = Date.now();
  const falKey = keyPoolManager.getNextKey('fal', (req.headers['x-fal-key'] as string) || undefined) || '';
  try {
    const {
      prompt,
      negative_prompt,
      model,
      image_size,
      num_inference_steps,
      guidance_scale,
      seed,
      image_url,
      denoise,
      loras = [],
    } = req.body;

    if (!falKey) {
      return res.status(400).json({
        error: '未配置 Fal.ai API 密钥。请在右上角「设置」面板中填入您的 Fal.ai API Key (x-fal-key)。',
      });
    }
    if (!model) return res.status(400).json({ error: '模型为必填项（model is required）' });
    // sampler_name/scheduler: not in fal-ai/flux/dev, flux-lora or fast-sdxl input schemas.
    if (rejectUnsupported(res, 'Fal.ai', req.body, ['sampler_name', 'scheduler'])) return;

    let endpoint = normalizeFalEndpoint(model);
    // FLUX endpoints (flux/dev, flux/schnell, flux-lora) have no negative_prompt in their schema.
    if (endpoint.includes('flux') && rejectUnsupported(res, `Fal.ai ${endpoint}`, req.body, ['negative_prompt'])) return;

    // H6: 只发用户传了的字段；不写死 enable_safety_checker 等
    const payload: any = { prompt };

    // F5: image_size must be official enum or { width, height } object
    let finalImageSize: any = undefined;
    if (isProvided(image_size)) {
      if (typeof image_size === 'string') {
        const allowedEnums = ['square_hd', 'square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9'];
        if (!allowedEnums.includes(image_size)) {
          return res.status(400).json({
            error: `该服务商不支持此 image_size 枚举: "${image_size}"。允许值为: ${allowedEnums.join(', ')}，或提供 {width, height} 对象`,
          });
        }
        finalImageSize = image_size;
      } else if (typeof image_size === 'object' && image_size !== null) {
        const w = Number(image_size.width);
        const h = Number(image_size.height);
        if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0 || w > 14142 || h > 14142) {
          return res.status(400).json({
            error: `无法表达的尺寸: image_size { width: ${image_size.width}, height: ${image_size.height} }。宽高必须为 1~14142 之间的正数。`,
          });
        }
        finalImageSize = { width: Math.round(w), height: Math.round(h) };
      } else {
        return res.status(400).json({ error: '无效的 image_size 格式，必须为枚举字符串或 {width, height} 对象' });
      }
    } else if (isProvided(req.body.width) || isProvided(req.body.height)) {
      if (!isProvided(req.body.width) || !isProvided(req.body.height)) {
        return res.status(400).json({ error: '提供尺寸时 width 与 height 必须同时提供' });
      }
      const w = Number(req.body.width);
      const h = Number(req.body.height);
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0 || w > 14142 || h > 14142) {
        return res.status(400).json({
          error: `无法表达的尺寸: width=${req.body.width}, height=${req.body.height}。宽高必须为 1~14142 之间的正数。`,
        });
      }
      finalImageSize = { width: Math.round(w), height: Math.round(h) };
    }
    if (finalImageSize) payload.image_size = finalImageSize;

    if (isProvided(num_inference_steps)) payload.num_inference_steps = Number(num_inference_steps);
    if (isProvided(guidance_scale)) payload.guidance_scale = Number(guidance_scale);
    if (negative_prompt) payload.negative_prompt = negative_prompt;
    if (isProvided(seed)) payload.seed = Number(seed);
    if (image_url) {
      payload.image_url = image_url;
      if (typeof denoise === 'number') {
        payload.strength = denoise;
      }
    } else if (isProvided(denoise)) {
      return res.status(400).json({ error: 'denoise 仅在提供 image_url（图生图）时有效', unsupported: ['denoise'] });
    }

    const actualModel = endpoint;

    if (Array.isArray(loras) && loras.length > 0) {
      // F8: 所选端点不支持 LoRA 时返回「该端点不支持 LoRA」
      const LORA_ENDPOINTS = ['fal-ai/flux-lora', 'fal-ai/fast-sdxl', 'fal-ai/lora', 'fal-ai/stable-diffusion-v35-large'];
      const loraSpec = getFieldSpec('fal', endpoint, 'loras');
      const isUnsupported = loraSpec ? loraSpec.status === 'unsupported' : !LORA_ENDPOINTS.includes(endpoint);
      if (isUnsupported) {
        return res.status(400).json({
          error: `该端点不支持 LoRA（Fal.ai 端点 ${endpoint} 的官方 schema 无 loras 字段）。请显式选择支持 LoRA 的端点：${LORA_ENDPOINTS.join(' / ')}`,
          unsupported: ['loras'],
          endpoint,
        });
      }
      if (endpoint === 'fal-ai/lora' && !req.body.model_name) {
        return res.status(400).json({ error: 'fal-ai/lora 需要 model_name（底模 URL 或 HF ID），不会代为填写默认值' });
      }
      if (endpoint === 'fal-ai/lora') payload.model_name = req.body.model_name;

      const badLora = loras.find((l: any) => !(l?.path || l?.url) || !isProvided(l?.scale ?? l?.strength ?? l?.modelStrength));
      if (badLora) {
        // V2: no `?? 0.8` strength fallback, no Civitai-ID → download-URL rewriting (would leak the Civitai token to Fal).
        return res.status(400).json({
          error: '每个 LoRA 必须提供可直接访问的 path/url 与 scale（强度）；服务端不会代填强度，也不会把 Civitai token 拼进下载链接发给 Fal',
          lora: badLora,
        });
      }
      payload.loras = loras.map((l: any) => ({
        path: l.path || l.url,
        scale: Number(l.scale ?? l.strength ?? l.modelStrength),
      }));
    }

    const response = await upstreamFetch(
      { provider: 'fal', route: req.path, model: endpoint, key: falKey },
      `https://fal.run/${endpoint}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Key ${falKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      keyPoolManager.recordResult('fal', falKey, false, Date.now() - startTime, errorText, response.status);
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

    keyPoolManager.recordResult('fal', falKey, true, Date.now() - startTime);
    const result = await response.json();
    const imageUrl = result.images?.[0]?.url;

    if (!imageUrl) {
      return res.status(502).json({ error: 'Fal.ai 返回结果中未包含图像输出 URL (images[0].url)' });
    }

    // Fal output schema returns the actual `seed` used; steps/cfg only if we sent them.
    const usedSeed = typeof result.seed === 'number' ? result.seed : (payload.seed ?? null);
    const item = recordHistoryItem({
      url: imageUrl,
      prompt,
      negativePrompt: negative_prompt,
      provider: 'Fal.ai (GPU 云端加速)',
      model: actualModel,
      seed: usedSeed,
      steps: payload.num_inference_steps ?? null,
      cfg: payload.guidance_scale ?? null,
      loras: (payload.loras || []).map((l: any) => ({ name: l.path, strength: l.scale })),
    });

    return res.json({
      imageUrl,
      seed: usedSeed,
      timings: result.timings,
      provider: 'Fal.ai (GPU 云端加速)',
      actualProvider: 'Fal.ai (GPU 云端加速)',
      model: actualModel,
      actualModel,
      requestedModel: model,
      exactEndpointCalled: `https://fal.run/${endpoint}`,
      targetEndpoint: endpoint,
      historyItem: item,
    });
  } catch (error: any) {
    if (falKey) keyPoolManager.recordResult('fal', falKey, false, Date.now() - startTime, error.message);
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
      model,
      duration,
      fps,
      aspect_ratio,
      image_url,
      seed,
      steps,
      provider: inputProvider,
    } = req.body;

    if (!model) return res.status(400).json({ error: '模型为必填项（model is required）' });
    const lowerModel = String(model).toLowerCase().trim();
    const reqProvider = (inputProvider || '').toLowerCase().trim();
    // Item 10: explicit provider is authoritative; model-name inference only when provider is absent.
    const VIDEO_PROVIDERS = ['tensorart', 'tensor', 'nanogpt', 'agnes', 'modelscope', 'modelscope_ai', 'fal', 'civitai', 'grok_compat'];
    if (reqProvider && !VIDEO_PROVIDERS.includes(reqProvider)) {
      return res.status(400).json({ error: `该服务商不支持视频生成: provider=${reqProvider}（支持: ${VIDEO_PROVIDERS.join(', ')}）` });
    }
    if (reqProvider === 'civitai') {
      return res.status(400).json({ error: 'Civitai 视频请走 /api/civitai/generate（isVideo: true），本路由不代理。' });
    }
    const byModel = !reqProvider;

    // 1. Tensor.Art (OpenWorks Video Generation Tools)
    const isTensorArtTarget =
      reqProvider === 'tensorart' ||
      reqProvider === 'tensor' ||
      (byModel && (
        lowerModel.startsWith('text2video_') ||
        lowerModel.startsWith('image2video_') ||
        lowerModel === 'live_wallpaper' ||
        lowerModel.includes('tensor')));

    if (isTensorArtTarget) {
      const startTime = Date.now();
      const taKey = resolveTensorArtKey(req);

      if (!taKey) {
        return res.status(400).json({
          error: '未配置 Tensor.Art API Key (x-tensorart-key)。请在右上角设置面板中配置 Tensor.Art API Key。',
        });
      }

      const targetToolName = (model || '').trim();
      if (!targetToolName) return res.status(400).json({ error: '模型为必填项（Tensor.Art 视频工具需要 toolName / model）' });
      const baseUrl = getTensorArtBaseUrl(taKey);

      try {
        const tools = await fetchTensorArtToolsList(taKey);
        // Exact match only (Item 3).
        const targetTool = tools.find((t: any) => t.name === targetToolName);
        if (!targetTool) {
          return res.status(400).json({
            error: `未找到指定的 Tensor.Art 工具: ${targetToolName}（需与 /tool/list 返回的 name 完全一致）`,
            availableTools: tools.map((t: any) => t.name),
          });
        }

        const built = buildTensorArtInputs(targetTool.inputs || [], req.body);
        if (built.error) {
          return res.status(400).json({ error: built.error, unsupported: built.unsupported, toolName: targetTool.name, toolInputs: targetTool.inputs });
        }

        const submitRes = await upstreamFetch(
          { provider: 'tensorart', route: req.path, model: targetTool.name, key: taKey },
          `${baseUrl}/task`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Echo-Access-Key': taKey },
            body: JSON.stringify({ toolName: targetTool.name, inputs: built.inputs }),
          }
        );

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
          let qRes: Response;
          try {
            qRes = await upstreamFetch(
              { provider: 'tensorart', route: req.path, model: targetTool.name, key: taKey },
              `${baseUrl}/task/query`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Echo-Access-Key': taKey,
                },
                body: JSON.stringify({ taskIds: [String(taskId)] }),
              }
            );
          } catch (netErr: any) {
            keyPoolManager.recordResult('tensorart', taKey, false, Date.now() - startTime, netErr.message);
            return res.status(502).json({
              error: `Tensor.Art 任务状态查询网络异常: ${netErr.message}`,
              taskId,
              toolName: targetTool.name,
            });
          }

          if (!qRes.ok) {
            const errText = await qRes.text();
            return res.status(qRes.status).json({
              error: `Tensor.Art 任务状态查询失败 [${qRes.status}]: ${errText}`,
              taskId,
              toolName: targetTool.name,
            });
          }
          const qData = await qRes.json();
          if (qData.code !== '0' && qData.code !== 0) {
            return res.status(500).json({
              error: `Tensor.Art 任务状态查询返回错误: [${qData.code}] ${qData.message || '系统错误'}`,
              taskId,
              toolName: targetTool.name,
            });
          }

          const task = qData.data?.tasks?.[0] || qData.data?.[0];
          if (!task) continue;

          const status = (task.status || '').toUpperCase();
          if (status === 'FINISH' || status === 'SUCCESS') {
            const out = task.outputs?.[0];
            videoResult = typeof out === 'string' ? out : out?.value || out?.url || '';
            break;
          }

          if (status === 'FAILED' || status === 'EXCEPTION' || status === 'CANCELED') {
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
          prompt: built.used?.has('prompt') ? prompt : '',
          provider: 'Tensor.Art (OpenWorks Video)',
          model: targetTool.name,
          seed: built.used?.has('seed') ? Number(req.body.seed) : null,
          steps: null,
          cfg: null,
        });

        return res.json({
          videoUrl: videoResult,
          provider: 'Tensor.Art (OpenWorks Video)',
          model: targetTool.name,
          requestedModel: model,
          exactEndpointCalled: `${baseUrl}/task`,
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
      (byModel && (
        lowerModel.includes('nanogpt') ||
        (lowerModel.includes('wan') && !lowerModel.includes('fal') && !lowerModel.includes('damo') && !lowerModel.includes('text2video')) ||
        (lowerModel.includes('kling') && !lowerModel.includes('fal'))));

    if (isNanoGptTarget) {
      const nanoKey = keyPoolManager.getNextKey('nanogpt', (req.headers['x-nanogpt-key'] as string) || undefined);
      if (!nanoKey) {
        return res.status(400).json({ error: '未配置 NanoGPT API Key (x-nanogpt-key)。' });
      }
      const startTime = Date.now();

      try {
        // NanoGPT video submit: POST api.nano-gpt.com/api/generate-video
        // duration is a STRING, seed/negative_prompt are passed through
        if (rejectUnsupported(res, 'NanoGPT Video', req.body, ['steps', 'cfg', 'guidance_scale', 'loras'])) return;
        const nanoPayload: any = { model, prompt };
        if (isProvided(duration)) nanoPayload.duration = String(duration);
        if (isProvided(aspect_ratio)) nanoPayload.aspect_ratio = aspect_ratio;
        if (isProvided(seed)) nanoPayload.seed = Number(seed);
        if (isProvided(req.body.negative_prompt)) nanoPayload.negative_prompt = req.body.negative_prompt;
        if (image_url) {
          if (image_url.startsWith('data:')) nanoPayload.imageDataUrl = image_url;
          else nanoPayload.imageUrl = image_url;
        }

        const submitRes = await upstreamFetch(
          { provider: 'nanogpt', route: req.path, model, key: nanoKey },
          'https://api.nano-gpt.com/api/generate-video',
          {
            method: 'POST',
            headers: { 'x-api-key': nanoKey, 'Content-Type': 'application/json' },
            body: JSON.stringify(nanoPayload),
          }
        );

        if (!submitRes.ok) {
          const errText = await submitRes.text();
          keyPoolManager.recordResult('nanogpt', nanoKey, false, Date.now() - startTime, errText, submitRes.status);
          return res.status(submitRes.status).json({ error: `NanoGPT 视频任务提交失败 [${submitRes.status}]: ${errText}` });
        }

        const submitData = await submitRes.json();
        let videoUrl = '';
        const runId = submitData.runId || submitData.id;

        if (runId) {
          // Poll: GET /api/video/status?requestId= → data.status → COMPLETED/FAILED, data.output.video.url
          for (let i = 0; i < 70; i++) {
            await new Promise((r) => setTimeout(r, 2500));
            let statusRes: Response;
            try {
              statusRes = await upstreamFetch(
                { provider: 'nanogpt', route: 'video/poll', model, key: nanoKey },
                `https://api.nano-gpt.com/api/video/status?requestId=${encodeURIComponent(runId)}`,
                { headers: { 'x-api-key': nanoKey } }
              );
            } catch (netErr: any) {
              keyPoolManager.recordResult('nanogpt', nanoKey, false, Date.now() - startTime, netErr.message);
              return res.status(502).json({ error: `NanoGPT 视频状态查询网络异常: ${netErr.message}`, runId });
            }

            if (!statusRes.ok) {
              const errBody = await statusRes.text().catch(() => '');
              keyPoolManager.recordResult('nanogpt', nanoKey, false, Date.now() - startTime, errBody, statusRes.status);
              return res.status(statusRes.status).json({
                error: `NanoGPT 视频状态查询失败 [${statusRes.status}]: ${errBody}`,
                runId,
              });
            }

            const statusData = await statusRes.json();
            const st = String(statusData.data?.status || statusData.status || '').toUpperCase();
            if (st === 'COMPLETED') {
              videoUrl = statusData.data?.output?.video?.url || statusData.data?.output?.url || '';
              break;
            } else if (st === 'FAILED' || st === 'CANCELED' || st === 'CANCELLED') {
              keyPoolManager.recordResult('nanogpt', nanoKey, false, Date.now() - startTime, statusData.data?.error || 'FAILED');
              return res.status(500).json({ error: `NanoGPT 视频生成失败: ${statusData.data?.error || statusData.data?.userFriendlyError || st}` });
            }
          }
        }

        if (!videoUrl) {
          keyPoolManager.recordResult('nanogpt', nanoKey, false, Date.now() - startTime, 'Polling timeout');
          return res.status(504).json({ error: 'NanoGPT 视频生成超时 (175s 未完成)，请稍后重试。' });
        }

        keyPoolManager.recordResult('nanogpt', nanoKey, true, Date.now() - startTime);
        const item = recordHistoryItem({
          url: videoUrl,
          prompt,
          negativePrompt: nanoPayload.negative_prompt,
          provider: 'NanoGPT Video',
          model,
          seed: nanoPayload.seed ?? null,
          steps: null,
          cfg: null,
        });

        return res.json({
          videoUrl,
          provider: 'NanoGPT Video',
          model,
          requestedModel: model,
          exactEndpointCalled: 'https://api.nano-gpt.com/api/generate-video',
          duration,
          historyItem: item,
        });
      } catch (nanoErr: any) {
        keyPoolManager.recordResult('nanogpt', nanoKey, false, Date.now() - startTime, nanoErr.message);
        return res.status(500).json({ error: `NanoGPT 视频接口请求异常: ${nanoErr.message}` });
      }
    }

    // 3. Agnes AI Video: POST /v1/videos → poll GET /agnesapi?video_id=&model_name=
    if (reqProvider === 'agnes' || (byModel && lowerModel.startsWith('agnes-video'))) {
      const auth = resolveProviderAuth(req, 'agnes');
      if (auth.error) return res.status(400).json({ error: auth.error });
      const { apiKey: agnesKey, baseUrl: agnesBaseUrl } = auth;
      const startTime = Date.now();
      if (rejectUnsupported(res, 'Agnes AI Video', req.body, ['negative_prompt', 'steps', 'cfg', 'guidance_scale', 'loras'])) return;

      // mode: text (no image) or keyframe (image as first_frame)
      const agnesPayload: any = {
        model,
        prompt,
        n: 1,
        size: '720P',
      };
      if (isProvided(duration)) agnesPayload.seconds = String(duration);
      if (isProvided(aspect_ratio)) agnesPayload.aspect_ratio = aspect_ratio;
      if (isProvided(seed)) agnesPayload.seed = Number(seed);
      if (image_url) {
        agnesPayload.mode = 'keyframe';
        agnesPayload.first_frame = image_url;
      } else {
        agnesPayload.mode = 'text';
      }

      try {
        // Submit
        const submitResp = await upstreamFetch(
          { provider: 'agnes', route: req.path, model, key: agnesKey },
          `${agnesBaseUrl}/videos`,
          {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${agnesKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(agnesPayload),
          }
        );

        if (!submitResp.ok) {
          const errorText = await submitResp.text();
          keyPoolManager.recordResult('agnes', agnesKey, false, Date.now() - startTime, errorText, submitResp.status);
          return res.status(submitResp.status).json({ error: `Agnes AI 视频提交失败 [${submitResp.status}]: ${errorText}` });
        }

        const submitData = await submitResp.json();
        const videoId = submitData.video_id || submitData.id;
        if (!videoId) {
          keyPoolManager.recordResult('agnes', agnesKey, false, Date.now() - startTime, 'No video_id in submit response', 500);
          return res.status(500).json({ error: 'Agnes AI 视频接口未返回 video_id' });
        }

        // Poll until completed or failed (max 5 min)
        // Agnes polling lives at the domain root, not under /v1
        const agnesOrigin = new URL(agnesBaseUrl).origin;
        const pollUrl = `${agnesOrigin}/agnesapi?video_id=${encodeURIComponent(videoId)}&model_name=${encodeURIComponent(model)}`;
        const pollDeadline = Date.now() + 5 * 60 * 1000;
        let videoUrl = '';
        while (Date.now() < pollDeadline) {
          await new Promise((r) => setTimeout(r, 5000));
          let pollResp: Response;
          try {
            pollResp = await upstreamFetch(
              { provider: 'agnes', route: 'video/poll', model, key: agnesKey },
              pollUrl,
              { headers: { 'Authorization': `Bearer ${agnesKey}` } }
            );
          } catch (netErr: any) {
            keyPoolManager.recordResult('agnes', agnesKey, false, Date.now() - startTime, netErr.message);
            return res.status(502).json({ error: `Agnes AI 视频轮询网络异常: ${netErr.message}`, videoId });
          }
          if (!pollResp.ok) {
            const errBody = await pollResp.text().catch(() => '');
            keyPoolManager.recordResult('agnes', agnesKey, false, Date.now() - startTime, errBody, pollResp.status);
            return res.status(pollResp.status).json({
              error: `Agnes AI 视频轮询失败 [${pollResp.status}]: ${errBody}`,
              videoId,
            });
          }
          const pollData = await pollResp.json();
          if (pollData.status === 'failed') {
            keyPoolManager.recordResult('agnes', agnesKey, false, Date.now() - startTime, 'Video generation failed');
            return res.status(500).json({ error: `Agnes AI 视频生成失败: ${JSON.stringify(pollData)}`, videoId });
          }
          if (pollData.status === 'completed' && pollData.url) {
            videoUrl = pollData.url;
            break;
          }
        }
        if (!videoUrl) {
          keyPoolManager.recordResult('agnes', agnesKey, false, Date.now() - startTime, 'Polling timeout');
          return res.status(504).json({ error: 'Agnes AI 视频生成轮询超时 (5 min)' });
        }

        keyPoolManager.recordResult('agnes', agnesKey, true, Date.now() - startTime);
        const item = recordHistoryItem({
          url: videoUrl,
          prompt,
          provider: 'Agnes AI Video (ApiHub)',
          model,
          seed: agnesPayload.seed ?? null,
          steps: null,
          cfg: null,
        });

        return res.json({
          videoUrl,
          provider: 'Agnes AI Video (ApiHub)',
          model,
          requestedModel: model,
          exactEndpointCalled: `${agnesBaseUrl}/videos`,
          duration,
          historyItem: item,
        });
      } catch (agErr: any) {
        keyPoolManager.recordResult('agnes', agnesKey, false, Date.now() - startTime, agErr.message);
        return res.status(500).json({ error: `Agnes AI 视频请求异常: ${agErr.message}` });
      }
    }

    // 3b. Grok / xAI 兼容中转视频：POST /videos/generations → poll GET /videos/{request_id}
    // 503 grok_media_no_eligible_account 必须原样返回，绝不静默换商。
    if (reqProvider === 'grok_compat' || (byModel && lowerModel.startsWith('grok-imagine-video'))) {
      const auth = resolveProviderAuth(req, 'grok_compat');
      if (auth.error) return res.status(400).json({ error: auth.error });
      const { apiKey: grokKey, baseUrl: grokBase } = auth;
      const startTime = Date.now();
      if (rejectUnsupported(res, 'grok_compat', req.body, ['seed', 'negative_prompt', 'steps', 'cfg', 'guidance_scale', 'loras', 'width', 'height', 'fps'])) return;
      const grokResolution = req.body.resolution;
      if (rejectSchemaEnum(res, 'grok_compat', model, 'aspect_ratio', aspect_ratio)) return;
      if (rejectSchemaEnum(res, 'grok_compat', model, 'resolution', grokResolution)) return;

      const grokPayload: Record<string, unknown> = { model, prompt };
      if (isProvided(duration)) grokPayload.duration = Number(duration);
      if (isProvided(aspect_ratio)) grokPayload.aspect_ratio = aspect_ratio;
      if (isProvided(grokResolution)) grokPayload.resolution = grokResolution;
      if (image_url) grokPayload.image = { url: image_url };

      try {
        const submitResp = await upstreamFetch(
          { provider: 'grok_compat', route: req.path, model, key: grokKey },
          `${grokBase}/videos/generations`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${grokKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(grokPayload),
          },
        );
        if (!submitResp.ok) {
          const errorText = await submitResp.text();
          keyPoolManager.recordResult('grok_compat', grokKey, false, Date.now() - startTime, errorText, submitResp.status);
          return res.status(submitResp.status).json({ error: `Grok 兼容中转视频提交失败 [${submitResp.status}]: ${errorText}` });
        }
        const submitData = await submitResp.json();
        const requestId = submitData.request_id || submitData.id;
        if (!requestId) {
          keyPoolManager.recordResult('grok_compat', grokKey, false, Date.now() - startTime, 'No request_id in submit response', 500);
          return res.status(500).json({ error: 'Grok 兼容中转视频接口未返回 request_id', details: submitData });
        }

        const pollDeadline = Date.now() + 5 * 60 * 1000;
        let videoUrl = '';
        while (Date.now() < pollDeadline) {
          await new Promise((r) => setTimeout(r, 3000));
          let pollResp: Response;
          try {
            pollResp = await upstreamFetch(
              { provider: 'grok_compat', route: 'video/poll', model, key: grokKey },
              `${grokBase}/videos/${encodeURIComponent(requestId)}`,
              { headers: { Authorization: `Bearer ${grokKey}` } },
            );
          } catch (netErr: any) {
            keyPoolManager.recordResult('grok_compat', grokKey, false, Date.now() - startTime, netErr.message);
            return res.status(502).json({ error: `Grok 兼容中转视频轮询网络异常: ${netErr.message}`, request_id: requestId });
          }
          if (!pollResp.ok) {
            const errBody = await pollResp.text().catch(() => '');
            keyPoolManager.recordResult('grok_compat', grokKey, false, Date.now() - startTime, errBody, pollResp.status);
            return res.status(pollResp.status).json({
              error: `Grok 兼容中转视频轮询失败 [${pollResp.status}]: ${errBody}`,
              request_id: requestId,
            });
          }
          const pollData = await pollResp.json();
          const status = String(pollData.status || '').toLowerCase();
          if (status === 'failed' || status === 'error') {
            keyPoolManager.recordResult('grok_compat', grokKey, false, Date.now() - startTime, JSON.stringify(pollData));
            return res.status(500).json({ error: `Grok 兼容中转视频生成失败: ${JSON.stringify(pollData)}`, request_id: requestId });
          }
          const rawUrl = pollData.video?.url || pollData.url;
          // Spec: respect_moderation === false → url empty → fail with raw body (no silent success)
          if ((status === 'done' || status === 'completed' || status === 'succeeded') && pollData.video && pollData.video.respect_moderation === false && !rawUrl) {
            keyPoolManager.recordResult('grok_compat', grokKey, false, Date.now() - startTime, JSON.stringify(pollData));
            return res.status(500).json({
              error: `Grok 兼容中转视频被审核拦截（respect_moderation=false）: ${JSON.stringify(pollData)}`,
              request_id: requestId,
            });
          }
          if ((status === 'done' || status === 'completed' || status === 'succeeded') && rawUrl) {
            videoUrl = resolveAgainstBaseOrigin(String(rawUrl), grokBase);
            break;
          }
          if ((status === 'done' || status === 'completed' || status === 'succeeded') && !rawUrl) {
            keyPoolManager.recordResult('grok_compat', grokKey, false, Date.now() - startTime, JSON.stringify(pollData));
            return res.status(500).json({
              error: `Grok 兼容中转视频完成但无 URL: ${JSON.stringify(pollData)}`,
              request_id: requestId,
            });
          }
        }
        if (!videoUrl) {
          keyPoolManager.recordResult('grok_compat', grokKey, false, Date.now() - startTime, 'Polling timeout');
          return res.status(504).json({ error: 'Grok 兼容中转视频生成轮询超时 (5 min)', request_id: requestId });
        }

        keyPoolManager.recordResult('grok_compat', grokKey, true, Date.now() - startTime);
        const item = recordHistoryItem({
          url: videoUrl,
          prompt,
          provider: 'Grok 兼容中转',
          model,
          seed: null,
          steps: null,
          cfg: null,
        });
        return res.json({
          videoUrl,
          mediaUrl: videoUrl,
          provider: 'Grok 兼容中转',
          model,
          requestedModel: model,
          exactEndpointCalled: `${grokBase}/videos/generations`,
          duration: isProvided(duration) ? duration : null,
          historyItem: item,
        });
      } catch (grokErr: any) {
        keyPoolManager.recordResult('grok_compat', grokKey, false, Date.now() - startTime, grokErr.message);
        return res.status(500).json({ error: `Grok 兼容中转视频请求异常: ${grokErr.message}` });
      }
    }

    // 4. ModelScope Wan 2.1 Video support
    const isModelScopeTarget =
      reqProvider === 'modelscope' ||
      reqProvider === 'modelscope_ai' ||
      (byModel && (
        lowerModel.startsWith('damo/') ||
        lowerModel.startsWith('modelscope') ||
        lowerModel.includes('cogvideox') ||
        (lowerModel.includes('wan2.1-t2v') && !lowerModel.includes('fal-ai')) ||
        (lowerModel.includes('wan2.1-i2v') && !lowerModel.includes('fal-ai'))));

    // ModelScope API-Inference has no video generation endpoint (Item 6) → explicit 400, never fall through to another provider.
    if (isModelScopeTarget) {
      return res.status(400).json({
        error: `ModelScope API-Inference 不提供视频生成接口（model: ${model || '(空)'}）。该服务商不支持视频生成，请改用 Fal / NanoGPT / Agnes / Civitai 视频引擎。`,
      });
    }

    // 5. Fal.ai Video Engine — default for reqProvider=fal or when no other provider matched (Wan 2.1, LTX, Kling, MiniMax, CogVideoX, Hunyuan)
    const falKey = keyPoolManager.getNextKey('fal', (req.headers['x-fal-key'] as string) || undefined) || '';

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
    if (!endpoint) {
      return res.status(400).json({ error: `不认识这个模型: ${model}` });
    }

    if (image_url) {
      if (
        endpoint === 'fal-ai/wan/v2.1/text-to-video' ||
        endpoint === 'wan/v2.1/text-to-video' ||
        endpoint === 'damo/wan2.1-t2v' ||
        endpoint === 'fal-ai/kling-video/v1/standard/text-to-video' ||
        endpoint.includes('text-to-video')
      ) {
        return res.status(400).json({ error: '这个端点不支持参考图' });
      }
    }

    // U2: 按 providerSchema（fal 端点）判定：unsupported → 400；supported / unverified / 不在表内 → 原样发送；没传不发。
    // [请求字段, schema 字段, 缺省上游字段名]；上游字段名优先取 schema 的 wire（cfg_scale / guide_scale / num_inference_steps…）
    const FAL_VIDEO_FIELDS = [
      ['duration', undefined, 'duration'],
      ['fps', undefined, 'fps'],
      ['negative_prompt', 'negative_prompt', 'negative_prompt'],
      ['steps', 'steps', 'num_inference_steps'],
      ['cfg', 'cfg', 'guidance_scale'],
      ['guidance_scale', 'cfg', 'guidance_scale'],
      ['loras', 'loras', 'loras'],
    ] as const;
    const fieldStatus: Record<string, string> = {};
    const falUnsup: string[] = [];
    for (const [f, key] of FAL_VIDEO_FIELDS) {
      if (!isProvided(req.body[f])) continue;
      const status = (key && getFieldSpec('fal', endpoint, key)?.status) || 'unverified';
      fieldStatus[f] = status;
      if (status === 'unsupported') falUnsup.push(f);
    }
    if (falUnsup.length > 0) {
      return res.status(400).json({ error: `该服务商不支持: ${falUnsup.join(', ')}（Fal.ai Video ${endpoint}）`, unsupported: falUnsup });
    }
    const payload: any = { prompt };
    if (isProvided(req.body.aspect_ratio)) payload.aspect_ratio = aspect_ratio;
    if (isProvided(seed)) payload.seed = Number(seed);
    for (const [f, key, fallbackWire] of FAL_VIDEO_FIELDS) {
      if (!isProvided(req.body[f])) continue;
      payload[(key && getFieldSpec('fal', endpoint, key)?.wire) || fallbackWire] = req.body[f];
    }
    if (image_url) {
      payload.image_url = image_url;
    }

    const falVideoStart = Date.now();
    const upstreamResp = await upstreamFetch(
      { provider: 'fal', route: req.path, model: endpoint, key: falKey },
      `https://fal.run/${endpoint}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Key ${falKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    if (!upstreamResp.ok) {
      const errorText = await upstreamResp.text();
      keyPoolManager.recordResult('fal', falKey, false, Date.now() - falVideoStart, errorText, upstreamResp.status);
      let friendlyError = `AI 视频服务商执行失败 [${upstreamResp.status}]: ${errorText}`;
      if (upstreamResp.status === 403 || errorText.includes('Exhausted balance')) {
        friendlyError = `Fal.ai 接口执行失败 [403]: 账户额度已耗尽 (Exhausted balance)。请在设置面板中填入新的 Fal API Key，或切换使用 Tensor.Art / NanoGPT / Agnes AI Video / ModelScope 引擎。`;
      }
      return res.status(upstreamResp.status).json({
        error: friendlyError,
      });
    }

    keyPoolManager.recordResult('fal', falKey, true, Date.now() - falVideoStart);
    const vData = await upstreamResp.json();
    const videoUrl = vData.video?.url;
    if (!videoUrl) {
      return res.status(502).json({ error: 'AI 视频接口返回数据中未包含视频 URL (video.url)' });
    }

    const providerName = `Fal.ai (${endpoint})`;
    const usedVideoSeed = typeof vData.seed === 'number' ? vData.seed : (payload.seed ?? null);
    const item = recordHistoryItem({
      url: videoUrl,
      prompt,
      provider: providerName,
      model: endpoint,
      seed: usedVideoSeed,
      steps: null,
      cfg: null,
    });

    return res.json({
      videoUrl,
      provider: providerName,
      actualProvider: providerName,
      model: endpoint,
      actualModel: endpoint,
      requestedModel: model,
      exactEndpointCalled: `https://fal.run/${endpoint}`,
      seed: usedVideoSeed,
      historyItem: item,
    });
  } catch (error: any) {
    return res.status(500).json({ error: `AI 视频生成失败: ${error.message}` });
  }
});

// Verified mapping from Civitai official baseModel to Orchestration ecosystem enum
// Source: https://orchestration.civitai.com/openapi/v2-consumers.json and https://developer.civitai.com/orchestration/recipes/
const BASE_MODEL_TO_ECOSYSTEM: Record<string, string> = {
  'sd 1.5': 'sd1',
  'sd 1.4': 'sd1',
  'sd1': 'sd1',
  'sd15': 'sd1',
  'sdxl 1.0': 'sdxl',
  'sdxl': 'sdxl',
  'pony': 'sdxl',
  'illustrious': 'sdxl',
  'flux.1 d': 'flux1',
  'flux.1 dev': 'flux1',
  'flux.1 s': 'flux1',
  'flux.1 schnell': 'flux1',
  'flux1': 'flux1',
  'flux2 dev': 'flux2Dev',
  'flux2dev': 'flux2Dev',
  'flux2 klein': 'flux2Klein',
  'flux2klein': 'flux2Klein',
  'krea': 'krea2',
  'krea 2': 'krea2',
  'krea2': 'krea2',
  'qwen': 'qwen',
  'qwen 2': 'qwen',
  'qwen2': 'qwen',
  'anima': 'anima',
  'pony v7': 'ponyV7',
  'ponyv7': 'ponyV7',
  'zimage': 'zImage',
  'zimageturbo': 'zImage',
  'z-image': 'zImage',
};

function mapBaseModelToEcosystem(rawBase: string): string {
  const clean = (rawBase || '').toLowerCase().trim();
  const matched = BASE_MODEL_TO_ECOSYSTEM[clean];
  if (matched) return matched;
  throw new Error(`无法识别该 Civitai 模型生态 (baseModel: "${rawBase}")，缺少官方映射`);
}

// ==========================================
// 2.75. Civitai Official Orchestration Engine (Native Generator & Dynamic AIR Resolver)
// ==========================================
// C9: 名称/模型 id 无法唯一确定一个版本 → 路由返回 400 + candidates，不替用户挑
class CivitaiAmbiguousError extends Error {
  constructor(message: string, public candidates: Array<Record<string, any>>) {
    super(message);
  }
}

async function resolveCivitaiAir(rawInput: string, fallbackType: 'checkpoint' | 'lora' = 'checkpoint', route: string = '/api/civitai'): Promise<string> {
  if (!rawInput) return '';
  // C9-3: 用户给了完整 AIR → 原样返回，不 normalizeEcosystem、不改写任何段
  if (rawInput.startsWith('urn:air:') || rawInput.startsWith('air:')) {
    return rawInput.startsWith('air:') ? `urn:${rawInput}` : rawInput;
  }

  const trimmed = rawInput.trim();

  // 1. If input is modelId@versionId (e.g. 2726029@3091481)
  const isModelAndVersion = /^(\d+)@(\d+)$/.test(trimmed);
  if (isModelAndVersion) {
    const match = trimmed.match(/^(\d+)@(\d+)$/);
    const versionId = match![2];
    const resp = await upstreamFetch(
      { provider: 'civitai', route, model: trimmed },
      `https://civitai.com/api/v1/model-versions/${versionId}`,
      { headers: { 'User-Agent': 'ComfyCanvas/1.0' } }
    );
    if (resp.ok) {
      const data = await resp.json();
      // C9-3: API 返回的 air 字段原样使用，不 normalizeEcosystem
      if (data.air) return data.air;
      if (data.modelId && data.id && data.baseModel) {
        const eco = mapBaseModelToEcosystem(data.baseModel);
        const type = (data.model?.type || fallbackType).toLowerCase().includes('lora') ? 'lora' : 'checkpoint';
        return `urn:air:${eco}:${type}:civitai:${data.modelId}@${data.id}`;
      }
    }
    const errText = await resp.text().catch(() => '');
    throw new Error(`找不到这个模型 (Civitai API HTTP ${resp.status}): ${errText.slice(0, 300)}`);
  }

  // 2. If input is purely a numeric ID
  const isPureNumber = /^\d+$/.test(trimmed);
  if (isPureNumber) {
    // Try as versionId first
    const resp = await upstreamFetch(
      { provider: 'civitai', route, model: trimmed },
      `https://civitai.com/api/v1/model-versions/${trimmed}`,
      { headers: { 'User-Agent': 'ComfyCanvas/1.0' } }
    );
    if (resp.ok) {
      const data = await resp.json();
      if (data.air) return data.air;
      if (data.modelId && data.id && data.baseModel) {
        const eco = mapBaseModelToEcosystem(data.baseModel);
        const type = (data.model?.type || fallbackType).toLowerCase().includes('lora') ? 'lora' : 'checkpoint';
        return `urn:air:${eco}:${type}:civitai:${data.modelId}@${data.id}`;
      }
    }

    // C9-2: Try as modelId — but don't auto-pick first version; list versions and 400
    const modelResp = await upstreamFetch(
      { provider: 'civitai', route, model: trimmed },
      `https://civitai.com/api/v1/models/${trimmed}`,
      { headers: { 'User-Agent': 'ComfyCanvas/1.0' } }
    );
    if (modelResp.ok) {
      const modelData = await modelResp.json();
      const versions = modelData.modelVersions ?? [];
      if (versions.length > 0) {
        const candidates = versions.slice(0, 10).map((v: any) => ({
          versionId: v.id,
          name: v.name,
          air: v.air || `${modelData.id}@${v.id}`,
        }));
        throw new CivitaiAmbiguousError(
          `只给了模型 ID (${trimmed})，没有版本号。请改用 modelId@versionId 或完整 AIR，从以下版本中选择`,
          candidates,
        );
      }
    }

    const errText = await modelResp.text().catch(() => '');
    throw new Error(`找不到这个模型 (Civitai API HTTP ${modelResp.status}): ${errText.slice(0, 300)}`);
  }

  // 3. Search Civitai API dynamically by model/LoRA string name
  const cleanSearchName = trimmed.replace(/\.safetensors$/i, '').replace(/_/g, ' ');
  const searchResp = await upstreamFetch(
    { provider: 'civitai', route, model: trimmed },
    `https://civitai.com/api/v1/models?query=${encodeURIComponent(cleanSearchName)}&limit=3`,
    { headers: { 'User-Agent': 'ComfyCanvas/1.0' } }
  );
  if (searchResp.ok) {
    const searchData = await searchResp.json();
    const items = searchData.items ?? [];
    // C9-1: 搜索结果不唯一 → 400 列出候选，不替用户选 items[0]
    if (items.length > 1) {
      const candidates = items.slice(0, 10).map((m: any) => ({
        modelId: m.id,
        name: m.name,
        air: (m.modelVersions || [])[0]?.air || `${m.id}@${(m.modelVersions || [])[0]?.id ?? '?'}`,
      }));
      throw new CivitaiAmbiguousError(
        `搜索 "${trimmed}" 返回多个结果，无法确定唯一模型。请从以下候选中选择，或直接使用完整 AIR`,
        candidates,
      );
    }
    const bestModel = items.at(0);
    const versions = bestModel?.modelVersions ?? [];
    // 唯一模型但有多个版本 → 同样不取 modelVersions[0]
    if (versions.length > 1) {
      throw new CivitaiAmbiguousError(
        `搜索 "${trimmed}" 命中模型 ${bestModel.id}（${bestModel.name}），但它有多个版本。请选择版本`,
        versions.slice(0, 10).map((v: any) => ({ versionId: v.id, name: v.name, air: v.air || `${bestModel.id}@${v.id}` })),
      );
    }
    const bestVersion = versions[0];
    if (bestVersion) {
      if (bestVersion.air) return bestVersion.air;
      if (bestModel.id && bestVersion.id && bestVersion.baseModel) {
        const eco = mapBaseModelToEcosystem(bestVersion.baseModel);
        const type = (bestModel.type || fallbackType).toLowerCase().includes('lora') ? 'lora' : 'checkpoint';
        return `urn:air:${eco}:${type}:civitai:${bestModel.id}@${bestVersion.id}`;
      }
    }
  }

  const errText = await searchResp.text().catch(() => '');
  throw new Error(`找不到这个模型 (Civitai API 搜索失败 HTTP ${searchResp.status}): ${errText.slice(0, 300)}`);
}

// Helper to extract generated image/video URL from any Civitai Orchestration response structure
function extractCivitaiBlobUrl(data: any): string {
  if (!data) return '';
  if (typeof data.url === 'string' && data.url.startsWith('http')) return data.url;
  if (typeof data.blobUrl === 'string' && data.blobUrl.startsWith('http')) return data.blobUrl;

  // Canonical output: steps[].output.images[].url (imageGen) or steps[].output.video.url (videoGen)
  if (Array.isArray(data.steps)) {
    for (const step of data.steps) {
      // imageGen output
      if (Array.isArray(step.output?.images) && step.output.images.length > 0) {
        if (step.output.images[0]?.url) return step.output.images[0].url;
      }
      // videoGen output
      if (step.output?.video?.url) return step.output.video.url;
      // Fallback: blobs array
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

  // Legacy flat shapes
  if (Array.isArray(data.images) && data.images.length > 0) {
    const img = data.images[0];
    if (typeof img === 'string' && img.startsWith('http')) return img;
    if (img?.url && typeof img.url === 'string') return img.url;
  }
  if (Array.isArray(data.output?.blobs) && data.output.blobs.length > 0) {
    const b = data.output.blobs[0];
    if (b?.url && typeof b.url === 'string') return b.url;
  }
  if (Array.isArray(data.blobs) && data.blobs.length > 0) {
    const b = data.blobs[0];
    if (b?.url && typeof b.url === 'string') return b.url;
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

    const resp = await upstreamFetch(
      { provider: 'civitai', route: req.path, model: id, key: apiKey },
      `https://orchestration.civitai.com/v2/consumer/workflows/${id}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    );

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
      negative_prompt,
      model,
      width,
      height,
      steps,
      cfg,
      seed,
      sampler_name,
      scheduler,
      denoise,
      image_url,
      loras,
      videoDuration,
      civitaiKey = '',
    } = req.body;
    if (!model) return res.status(400).json({ error: '模型为必填项（model is required）' });

    const apiKey =
      (req.headers['x-civitai-key'] as string) ||
      civitaiKey ||
      keyPoolManager.getNextKey('civitai') ||
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
        (model.includes('text-to-video') ||
          model.includes('image-to-video')));

    let completedMediaUrl = '';
    const usedProvider = 'Civitai 官方原生生成引擎';
    const startTime = Date.now();
    // C9-4: 实际发出的 AIR（解析后）；历史与响应记它而不是用户原始输入
    let airModel = String(model);

    try {
      if (isVideo) {
        // videoGen: engine/version/provider/operation are recipe-specific (e.g. wan: v2.1…v3.0) — caller must choose, no forced engine.
        const { engine: vEngine, version: vVersion, provider: vProvider, operation: vOperation } = req.body;
        if (!isProvided(vEngine)) {
          return res.status(400).json({ error: 'Civitai 视频生成需要显式指定 engine（如 "wan"），服务端不再默认任何引擎。' });
        }
        const videoInput: Record<string, any> = { engine: vEngine, prompt };
        if (isProvided(vVersion)) videoInput.version = vVersion;
        if (isProvided(vProvider)) videoInput.provider = vProvider;
        if (isProvided(vOperation)) videoInput.operation = vOperation;
        if (isProvided(videoDuration)) videoInput.duration = videoDuration;
        if (isProvided(seed)) videoInput.seed = Number(seed);
        if (isProvided(image_url)) videoInput.startImage = image_url;

        const orchResp = await upstreamFetch(
          { provider: 'civitai', route: req.path, model, key: apiKey },
          'https://orchestration.civitai.com/v2/consumer/workflows?wait=100',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              steps: [{ $type: 'videoGen', input: videoInput }],
            }),
          }
        );

        if (!orchResp.ok) {
          const errText = await orchResp.text();
          keyPoolManager.recordResult('civitai', apiKey, false, Date.now() - startTime, errText, orchResp.status);
          return res.status(orchResp.status).json({
            error: `Civitai 视频生成接口返回错误 [${orchResp.status}]: ${errText}`,
          });
        }

        const orchData = await orchResp.json();
        completedMediaUrl = extractCivitaiBlobUrl(orchData);
        if (!completedMediaUrl && (orchData.id || orchData.token)) {
          const workflowId = orchData.id || orchData.token;
          for (let i = 0; i < 20; i++) {
            await new Promise((r) => setTimeout(r, 3000));
            let pollResp: Response;
            try {
              pollResp = await upstreamFetch(
                { provider: 'civitai', route: '/api/civitai/generate/poll', model: String(workflowId), key: apiKey },
                `https://orchestration.civitai.com/v2/consumer/workflows/${workflowId}`,
                {
                  headers: { Authorization: `Bearer ${apiKey}` },
                }
              );
            } catch (netErr: any) {
              keyPoolManager.recordResult('civitai', apiKey, false, Date.now() - startTime, netErr.message);
              return res.status(502).json({ error: `Civitai 视频轮询网络异常: ${netErr.message}`, workflowId });
            }
            if (!pollResp.ok) {
              const errBody = await pollResp.text().catch(() => '');
              keyPoolManager.recordResult('civitai', apiKey, false, Date.now() - startTime, errBody, pollResp.status);
              return res.status(pollResp.status).json({
                error: `Civitai 视频状态查询失败 [${pollResp.status}]: ${errBody}`,
                workflowId,
              });
            }
            const pollData = await pollResp.json();
            const status = (pollData.status || '').toLowerCase();
              if (status === 'failed' || status === 'expired' || status === 'canceled') {
                keyPoolManager.recordResult('civitai', apiKey, false, Date.now() - startTime, `Status: ${pollData.status}`);
                return res.status(500).json({
                  error: `Civitai 视频任务渲染失败 [状态: ${pollData.status}]: ${pollData.error || pollData.reason || 'Job failed on Civitai cluster'}`,
                });
              }
              const url = extractCivitaiBlobUrl(pollData);
              if (url) {
                completedMediaUrl = url;
                break;
              }
            }
          }

        // History for video: only record what was actually sent
        keyPoolManager.recordResult('civitai', apiKey, !!completedMediaUrl, Date.now() - startTime);
        if (!completedMediaUrl) {
          return res.status(500).json({ error: 'Civitai 视频生成未能按时返回，请稍后在历史记录中查看或重试。' });
        }

        const item = recordHistoryItem({
          url: completedMediaUrl,
          prompt,
          provider: usedProvider,
          model,
          seed: isProvided(seed) ? Number(seed) : null,
          steps: null,
          cfg: null,
        });

        return res.json({
          success: true,
          mediaUrl: completedMediaUrl,
          videoUrl: completedMediaUrl,
          provider: usedProvider,
          model,
          historyItem: item,
        });
      }

      // --- ImageGen ---
      if (!airModel.startsWith('urn:air:')) {
        airModel = await resolveCivitaiAir(airModel, 'checkpoint', req.path);
      }

      // Extract ecosystem from the resolved AIR URN
      let ecosystem = '';
      if (airModel.startsWith('urn:air:')) {
        const parts = airModel.split(':');
        if (parts.length >= 3) ecosystem = parts[2];
      }
      if (!ecosystem) {
        return res.status(400).json({ error: `无法确定模型 ${model} 的 ecosystem 生态` });
      }

      // Build LoRA map { urn: strength } — Civitai uses map format for both sdcpp and comfy
      const loraMap: Record<string, number> = {};
      if (Array.isArray(loras) && loras.length > 0) {
        for (const l of loras) {
          const rawId = l.civitaiId || l.versionId || l.id || l.name;
          if (rawId) {
            const loraUrn = await resolveCivitaiAir(String(rawId), 'lora', req.path);
            const strength = Number(l.strength ?? l.modelStrength);
            if (!isFinite(strength)) {
              return res.status(400).json({
                error: `LoRA strength 为必填项（缺少 strength / modelStrength）: ${rawId}`,
              });
            }
            loraMap[loraUrn] = strength;
          }
        }
      }

      if (isProvided(denoise) && !isProvided(image_url)) {
        return res.status(400).json({ error: '该服务商不支持: denoise（Civitai 仅在图生图 createVariant 时接受 strength，需同时提供 image_url）', unsupported: ['denoise'] });
      }
      const sdcppEcosystems = ['sd1', 'sdxl', 'flux1', 'flux2Dev', 'flux2Klein', 'qwen', 'zImage', 'anima'];
      const isFlux = ecosystem === 'flux1';
      const isSdcpp = sdcppEcosystems.includes(ecosystem);

      // C10: 宽高按 providerSchema 中每个生态的约束校验；不在 schema 的生态 → unverified，原样发
      const engine = isSdcpp ? 'sdcpp' : 'comfy';
      const schemaId = `${engine}:${ecosystem}`;
      for (const dim of ['width', 'height'] as const) {
        if (!isProvided(req.body[dim])) continue;
        const v = Number(req.body[dim]);
        const spec = getFieldSpec('civitai', schemaId, dim);
        if (!spec) continue; // 不在 schema → unverified，原样发
        // comfy 生态 schema 里只有 min/max、没写 multipleOf（倍数未能核实）→ 只按范围校验；krea2 连范围都没有 → 原样发
        const { min = -Infinity, max = Infinity, multipleOf } = spec;
        const checks: string[] = [];
        if (isNaN(v) || v < min || v > max) checks.push(`允许范围: ${min}–${max}`);
        if (multipleOf && v % multipleOf !== 0) checks.push(`须为 ${multipleOf} 的倍数`);
        if (checks.length > 0) {
          return res.status(400).json({
            error: `${dim}=${req.body[dim]} 超出 Civitai 生态 ${ecosystem} 的官方允许范围。${checks.join('，')}`,
          });
        }
      }

      let genInput: Record<string, any>;
      const quantity = req.body.quantity;
      if (isProvided(quantity) && !Number.isInteger(Number(quantity))) {
        return res.status(400).json({ error: `quantity 必须为整数（收到 "${quantity}"）` });
      }

      if (isSdcpp) {
        genInput = {
          engine: 'sdcpp',
          ecosystem,
          operation: isProvided(image_url) ? 'createVariant' : 'createImage',
          prompt,
        };
        // flux1 uses diffuserModel; other sdcpp ecosystems use model
        if (isFlux) {
          genInput.diffuserModel = airModel;
        } else {
          genInput.model = airModel;
        }
        // Only send parameters the caller actually provided (C3)
        if (isProvided(negative_prompt)) genInput.negativePrompt = negative_prompt;
        if (isProvided(width)) genInput.width = Number(width);
        if (isProvided(height)) genInput.height = Number(height);
        if (isProvided(steps)) genInput.steps = Number(steps);
        if (isProvided(cfg)) genInput.cfgScale = Number(cfg);
        if (isProvided(seed)) genInput.seed = Number(seed);
        // sdcpp field names: sampleMethod / schedule (C2)
        if (isProvided(sampler_name)) genInput.sampleMethod = sampler_name;
        if (isProvided(scheduler)) genInput.schedule = scheduler;
        if (Object.keys(loraMap).length > 0) genInput.loras = loraMap;
        if (isProvided(image_url)) {
          genInput.image = image_url;
          if (isProvided(denoise)) genInput.strength = Number(denoise);
        }
      } else {
        // comfy engine for other ecosystems (krea2 etc.)
        // H6: comfy 的 model 变体（如 turbo / base）由用户指定，不按生态猜
        if (!isProvided(req.body.comfyModel)) {
          return res.status(400).json({
            error: `Civitai comfy 引擎（生态 ${ecosystem}）需要指定 comfyModel（上游字段 model，如 "turbo" / "base"），服务端不猜测`,
          });
        }
        genInput = {
          engine: 'comfy',
          ecosystem,
          model: req.body.comfyModel,
          operation: isProvided(image_url) ? 'createVariant' : 'createImage',
          diffusionModel: airModel,
          prompt,
        };
        if (isProvided(negative_prompt)) genInput.negativePrompt = negative_prompt;
        if (isProvided(width)) genInput.width = Number(width);
        if (isProvided(height)) genInput.height = Number(height);
        if (isProvided(steps)) genInput.steps = Number(steps);
        if (isProvided(cfg)) genInput.cfgScale = Number(cfg);
        if (isProvided(seed)) genInput.seed = Number(seed);
        // comfy uses sampler / scheduler (not sampleMethod / schedule)
        if (isProvided(sampler_name)) genInput.sampler = sampler_name;
        if (isProvided(scheduler)) genInput.scheduler = scheduler;
        if (Object.keys(loraMap).length > 0) genInput.loras = loraMap;
        if (isProvided(image_url)) {
          genInput.image = image_url;
          if (isProvided(denoise)) genInput.denoiseStrength = Number(denoise);
        }
      }
      // H6: quantity 非必填（recipe 默认 1），用户没传不发
      if (isProvided(quantity)) genInput.quantity = Number(quantity);

      // POST /v2/consumer/workflows?wait=100 (integer seconds, max 100)
      const orchResp = await upstreamFetch(
        { provider: 'civitai', route: req.path, model, key: apiKey },
        'https://orchestration.civitai.com/v2/consumer/workflows?wait=100',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            steps: [{ $type: 'imageGen', input: genInput }],
          }),
        }
      );

      if (!orchResp.ok) {
        const errText = await orchResp.text();
        keyPoolManager.recordResult('civitai', apiKey, false, Date.now() - startTime, errText, orchResp.status);
        return res.status(orchResp.status).json({
          error: `Civitai Orchestration 官方算力返回错误 [${orchResp.status}]: ${errText}`,
        });
      }

      const orchData = await orchResp.json();
      completedMediaUrl = extractCivitaiBlobUrl(orchData);

      // If not completed in wait=100, return pending + workflowId for client-side polling
      if (!completedMediaUrl && (orchData.id || orchData.token)) {
        const workflowId = orchData.id || orchData.token;
        keyPoolManager.recordResult('civitai', apiKey, true, Date.now() - startTime);
        return res.json({
          pending: true,
          workflowId,
          status: orchData.status || 'processing',
          provider: usedProvider,
          model: airModel,
        });
      }
    } catch (orchErr: any) {
      if (orchErr instanceof CivitaiAmbiguousError) throw orchErr;
      keyPoolManager.recordResult('civitai', apiKey, false, Date.now() - startTime, orchErr.message);
      return res.status(500).json({ error: `Civitai 网络请求失败: ${orchErr.message}` });
    }

    if (!completedMediaUrl) {
      return res.status(500).json({ error: 'Civitai 原生算力未能按时返回有效图像，可能由于排队超时，请稍后在历史记录中查看或重试。' });
    }

    keyPoolManager.recordResult('civitai', apiKey, true, Date.now() - startTime);

    // History: only record values actually sent to upstream (C1, C3, C9-4)
    const item = recordHistoryItem({
      url: completedMediaUrl,
      prompt,
      negativePrompt: isProvided(negative_prompt) ? negative_prompt : undefined,
      provider: usedProvider,
      model: airModel,
      seed: isProvided(seed) ? Number(seed) : null,
      steps: isProvided(steps) ? Number(steps) : null,
      cfg: isProvided(cfg) ? Number(cfg) : null,
    });

    return res.json({
      success: true,
      imageUrl: completedMediaUrl,
      mediaUrl: completedMediaUrl,
      provider: usedProvider,
      model: airModel,
      historyItem: item,
    });
  } catch (error: any) {
    if (error instanceof CivitaiAmbiguousError) {
      return res.status(400).json({ error: error.message, candidates: error.candidates });
    }
    return res.status(500).json({ error: `Civitai 生成失败: ${error.message}` });
  }
});

// ==========================================
// 2.8. Agnes AI (ApiHub) Image, Video & Reasoning Chat
// ==========================================
app.post(['/api/engine/agnes/generate', '/api/agnes/generate'], async (req, res) => {
  const startTime = Date.now();
  const auth = resolveProviderAuth(req, 'agnes');
  if (auth.error) return res.status(400).json({ error: auth.error });
  const { apiKey, baseUrl } = auth;

  try {
    const { prompt, model, width = 1024, height = 1024, image_url } = req.body;
    if (!model) return res.status(400).json({ error: '模型为必填项（model is required）' });
    // Agnes image API has no seed/negative_prompt/steps/cfg/loras
    if (rejectUnsupported(res, 'Agnes AI', req.body, ['negative_prompt', 'seed', 'cfg', 'guidance_scale', 'steps', 'loras'])) return;

    const payload: any = {
      model,
      prompt,
      n: 1,
      size: `${width}x${height}`,
    };
    // Reference image via extra_body.image (array of URL / data-URI strings)
    if (image_url) {
      payload.extra_body = { image: [image_url] };
    }

    const upstream = await upstreamFetch(
      { provider: 'agnes', route: req.path, model, key: apiKey },
      `${baseUrl}/images/generations`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );

    if (!upstream.ok) {
      const errorText = await upstream.text();
      keyPoolManager.recordResult('agnes', apiKey, false, Date.now() - startTime, errorText, upstream.status);
      return res.status(upstream.status).json({ error: `Agnes AI 接口执行失败 [${upstream.status}]: ${errorText}` });
    }

    const data = await upstream.json();
    const mediaUrl = data.data?.[0]?.url;
    if (!mediaUrl) {
      keyPoolManager.recordResult('agnes', apiKey, false, Date.now() - startTime, 'No image in response', 500);
      return res.status(500).json({ error: 'Agnes AI 返回结果中未包含图像输出 URL' });
    }
    keyPoolManager.recordResult('agnes', apiKey, true, Date.now() - startTime);

    const item = recordHistoryItem({
      url: mediaUrl,
      prompt,
      provider: 'Agnes AI (ApiHub)',
      model,
      seed: null,
      steps: null,
      cfg: null,
      loras: [],
    });

    return res.json({
      imageUrl: mediaUrl,
      mediaUrl,
      mediaType: 'image',
      provider: 'Agnes AI (ApiHub)',
      model,
      historyItem: item,
    });
  } catch (error: any) {
    keyPoolManager.recordResult('agnes', apiKey, false, Date.now() - startTime, error.message);
    return res.status(500).json({ error: `Agnes AI 请求异常: ${error.message}` });
  }
});

app.post(['/api/engine/agnes/chat', '/api/agnes/chat'], async (req, res) => {
  const startTime = Date.now();
  const auth = resolveProviderAuth(req, 'agnes');
  if (auth.error) return res.status(400).json({ error: auth.error });

  try {
    const { messages = [], model, temperature = 0.7, max_tokens = 2048 } = req.body;
    if (!model) return res.status(400).json({ error: '模型为必填项（model is required）' });

    const upstream = await upstreamFetch(
      { provider: 'agnes', route: req.path, model, key: auth.apiKey },
      `${auth.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${auth.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, temperature, max_tokens }),
      }
    );

    if (!upstream.ok) {
      const errorText = await upstream.text();
      keyPoolManager.recordResult('agnes', auth.apiKey, false, Date.now() - startTime, errorText, upstream.status);
      return res.status(upstream.status).json({ error: `Agnes AI 对话推理失败 [${upstream.status}]: ${errorText}` });
    }

    keyPoolManager.recordResult('agnes', auth.apiKey, true, Date.now() - startTime);
    const data = await upstream.json();
    return res.json({ content: data.choices?.[0]?.message?.content || '', model: data.model || model, usage: data.usage });
  } catch (error: any) {
    keyPoolManager.recordResult('agnes', auth.apiKey, false, Date.now() - startTime, error.message);
    return res.status(500).json({ error: `Agnes AI 推理异常: ${error.message}` });
  }
});

// ==========================================
// 2.9. SenseNova (商汤日日新) DeepSeek V4 / Reasoning / Vision
// ==========================================
app.post(['/api/engine/sensenova/chat', '/api/sensenova/chat'], async (req, res) => {
  const startTime = Date.now();
  const auth = resolveProviderAuth(req, 'sensenova');
  if (auth.error) return res.status(400).json({ error: auth.error });

  try {
    const { messages = [], model, temperature = 0.6, max_tokens = 2048 } = req.body;
    if (!model) return res.status(400).json({ error: '模型为必填项（model is required）' });

    const upstream = await upstreamFetch(
      { provider: 'sensenova', route: req.path, model, key: auth.apiKey },
      `${auth.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${auth.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, temperature, max_tokens }),
      }
    );

    if (!upstream.ok) {
      const errorText = await upstream.text();
      keyPoolManager.recordResult('sensenova', auth.apiKey, false, Date.now() - startTime, errorText, upstream.status);
      return res.status(upstream.status).json({ error: `SenseNova 深度推理失败 [${upstream.status}]: ${errorText}` });
    }

    keyPoolManager.recordResult('sensenova', auth.apiKey, true, Date.now() - startTime);
    const data = await upstream.json();
    const message = data.choices?.[0]?.message;
    return res.json({
      content: message?.content || '',
      // SenseNova returns chain-of-thought in message.reasoning (not reasoning_content)
      reasoningContent: message?.reasoning || '',
      model: data.model || model,
      usage: data.usage,
    });
  } catch (error: any) {
    keyPoolManager.recordResult('sensenova', auth.apiKey, false, Date.now() - startTime, error.message);
    return res.status(500).json({ error: `SenseNova 推理异常: ${error.message}` });
  }
});

app.post('/api/engine/sensenova/generate', async (req, res) => {
  const { model } = req.body;
  return res.status(400).json({
    error: `商汤日日新 (SenseNova) 是专长于深度思考与推理的文本大模型平台 (${model})。若需将概念扩散为图像或视频，请使用画布上的「LLM 推理思考节点」或提示词面板中的「深度思考扩写」，再通过连线将正向条件注入至 FLUX.1、Agnes 2.5 或 Wan 2.1 扩散引擎。`,
  });
});

// ==========================================
// 2.9b. OpenAI 兼容中转 (images/generations + images/edits)
// ==========================================
app.post(['/api/engine/openai_compat/generate', '/api/openai_compat/generate'], async (req, res) => {
  const startTime = Date.now();
  const auth = resolveProviderAuth(req, 'openai_compat');
  if (auth.error) return res.status(400).json({ error: auth.error });
  const { apiKey, baseUrl } = auth;

  try {
    const {
      prompt,
      model,
      image_url,
      size,
      quality,
      output_format,
      background,
      moderation,
      n,
    } = req.body;
    if (!model) return res.status(400).json({ error: '模型为必填项（model is required）' });
    if (rejectUnsupported(res, 'openai_compat', req.body, ['seed', 'negative_prompt', 'steps', 'cfg', 'guidance_scale', 'sampler', 'sampler_name', 'scheduler', 'loras'])) return;
    if (rejectSchemaEnum(res, 'openai_compat', model, 'size', size)) return;
    if (rejectSchemaEnum(res, 'openai_compat', model, 'quality', quality)) return;
    if (rejectSchemaEnum(res, 'openai_compat', model, 'output_format', output_format)) return;
    if (rejectSchemaEnum(res, 'openai_compat', model, 'background', background)) return;
    if (rejectSchemaEnum(res, 'openai_compat', model, 'moderation', moderation)) return;

    const payload: Record<string, unknown> = { model, prompt };
    if (isProvided(size)) payload.size = size;
    if (isProvided(quality)) payload.quality = quality;
    if (isProvided(output_format)) payload.output_format = output_format;
    if (isProvided(background)) payload.background = background;
    if (isProvided(moderation)) payload.moderation = moderation;
    if (isProvided(n)) payload.n = n;

    const isEdit = Boolean(image_url);
    if (isEdit) payload.image = image_url;

    const upstream = await upstreamFetch(
      { provider: 'openai_compat', route: req.path, model, key: apiKey },
      `${baseUrl}${isEdit ? '/images/edits' : '/images/generations'}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );

    if (!upstream.ok) {
      const errorText = await upstream.text();
      keyPoolManager.recordResult('openai_compat', apiKey, false, Date.now() - startTime, errorText, upstream.status);
      return res.status(upstream.status).json({ error: `OpenAI 兼容中转失败 [${upstream.status}]: ${errorText}` });
    }

    const data = await upstream.json();
    const mediaUrl = extractCompatImageUrl(data.data?.[0]);
    if (!mediaUrl) {
      keyPoolManager.recordResult('openai_compat', apiKey, false, Date.now() - startTime, 'No image in response', 500);
      return res.status(500).json({ error: 'OpenAI 兼容中转返回结果中未包含图像（data[].b64_json / data[].url）' });
    }
    keyPoolManager.recordResult('openai_compat', apiKey, true, Date.now() - startTime);

    const item = recordHistoryItem({
      url: mediaUrl,
      prompt,
      provider: 'OpenAI 兼容中转',
      model,
      seed: null,
      steps: null,
      cfg: null,
      loras: [],
    });

    return res.json({
      imageUrl: mediaUrl,
      mediaUrl,
      mediaType: 'image',
      provider: 'OpenAI 兼容中转',
      model,
      historyItem: item,
    });
  } catch (error: any) {
    keyPoolManager.recordResult('openai_compat', apiKey, false, Date.now() - startTime, error.message);
    return res.status(500).json({ error: `OpenAI 兼容中转请求异常: ${error.message}` });
  }
});

// ==========================================
// 2.9c. Grok / xAI 兼容中转 (chat + images)
// ==========================================
app.post(['/api/engine/grok_compat/generate', '/api/grok_compat/generate'], async (req, res) => {
  const startTime = Date.now();
  const auth = resolveProviderAuth(req, 'grok_compat');
  if (auth.error) return res.status(400).json({ error: auth.error });
  const { apiKey, baseUrl } = auth;

  try {
    const { prompt, model, image_url, aspect_ratio, resolution, n, response_format } = req.body;
    if (!model) return res.status(400).json({ error: '模型为必填项（model is required）' });
    if (rejectUnsupported(res, 'grok_compat', req.body, ['seed', 'negative_prompt', 'steps', 'cfg', 'guidance_scale', 'loras', 'width', 'height', 'sampler', 'sampler_name', 'scheduler'])) return;
    if (rejectSchemaEnum(res, 'grok_compat', model, 'aspect_ratio', aspect_ratio)) return;
    if (rejectSchemaEnum(res, 'grok_compat', model, 'resolution', resolution)) return;

    const payload: Record<string, unknown> = { model, prompt };
    if (isProvided(aspect_ratio)) payload.aspect_ratio = aspect_ratio;
    if (isProvided(resolution)) payload.resolution = resolution;
    if (isProvided(n)) payload.n = n;
    if (isProvided(response_format)) payload.response_format = response_format;

    const isEdit = Boolean(image_url);
    if (isEdit) payload.image = { url: image_url };

    const upstream = await upstreamFetch(
      { provider: 'grok_compat', route: req.path, model, key: apiKey },
      `${baseUrl}${isEdit ? '/images/edits' : '/images/generations'}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );

    if (!upstream.ok) {
      const errorText = await upstream.text();
      keyPoolManager.recordResult('grok_compat', apiKey, false, Date.now() - startTime, errorText, upstream.status);
      return res.status(upstream.status).json({ error: `Grok 兼容中转失败 [${upstream.status}]: ${errorText}` });
    }

    const data = await upstream.json();
    const rawUrl = extractCompatImageUrl(data.data?.[0]);
    const mediaUrl = rawUrl ? resolveAgainstBaseOrigin(rawUrl, baseUrl) : null;
    if (!mediaUrl) {
      keyPoolManager.recordResult('grok_compat', apiKey, false, Date.now() - startTime, 'No image in response', 500);
      return res.status(500).json({ error: 'Grok 兼容中转返回结果中未包含图像（data[].url / data[].b64_json）' });
    }
    keyPoolManager.recordResult('grok_compat', apiKey, true, Date.now() - startTime);

    const item = recordHistoryItem({
      url: mediaUrl,
      prompt,
      provider: 'Grok 兼容中转',
      model,
      seed: null,
      steps: null,
      cfg: null,
      loras: [],
    });

    return res.json({
      imageUrl: mediaUrl,
      mediaUrl,
      mediaType: 'image',
      provider: 'Grok 兼容中转',
      model,
      historyItem: item,
    });
  } catch (error: any) {
    keyPoolManager.recordResult('grok_compat', apiKey, false, Date.now() - startTime, error.message);
    return res.status(500).json({ error: `Grok 兼容中转请求异常: ${error.message}` });
  }
});

app.post(['/api/engine/grok_compat/chat', '/api/grok_compat/chat'], async (req, res) => {
  const startTime = Date.now();
  const auth = resolveProviderAuth(req, 'grok_compat');
  if (auth.error) return res.status(400).json({ error: auth.error });

  try {
    const { messages = [], model, temperature = 0.7, max_tokens = 2048 } = req.body;
    if (!model) return res.status(400).json({ error: '模型为必填项（model is required）' });

    const upstream = await upstreamFetch(
      { provider: 'grok_compat', route: req.path, model, key: auth.apiKey },
      `${auth.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, temperature, max_tokens }),
      },
    );

    if (!upstream.ok) {
      const errorText = await upstream.text();
      keyPoolManager.recordResult('grok_compat', auth.apiKey, false, Date.now() - startTime, errorText, upstream.status);
      return res.status(upstream.status).json({ error: `Grok 兼容中转对话失败 [${upstream.status}]: ${errorText}` });
    }

    keyPoolManager.recordResult('grok_compat', auth.apiKey, true, Date.now() - startTime);
    const data = await upstream.json();
    return res.json({ content: data.choices?.[0]?.message?.content || '', model: data.model || model, usage: data.usage });
  } catch (error: any) {
    keyPoolManager.recordResult('grok_compat', auth.apiKey, false, Date.now() - startTime, error.message);
    return res.status(500).json({ error: `Grok 兼容中转推理异常: ${error.message}` });
  }
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
  const res = await upstreamFetch(
    { provider: 'tensorart', route: '/tool/list', model: 'tool/list', key: apiKey },
    `${baseUrl}/tool/list`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Echo-Access-Key': apiKey,
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(15000),
    }
  );
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

// Key priority: request header > env > saved settings (Item 3).
function resolveTensorArtKey(req: express.Request): string {
  return (req.headers['x-tensorart-key'] as string) || process.env.TENSORART_API_KEY || cloudSettings['tensorartKey'] || '';
}

// Request fields that can be mapped onto an OpenWorks tool input, matched by keywords in the input's description.
// Order matters: 'negative' must win over 'prompt'.
const TENSORART_FIELD_KEYWORDS: Array<[string, string[]]> = [
  ['negative_prompt', ['negative']],
  ['width', ['width']],
  ['height', ['height']],
  ['seed', ['seed']],
  ['count', ['count', 'number']],
  ['duration', ['duration', 'seconds']],
  ['ratio', ['ratio', 'aspect']],
  ['size', ['size']],
  ['prompt', ['prompt', 'text', 'description', 'motion']],
];
const TENSORART_GENERIC_FIELDS = [
  'prompt', 'negative_prompt', 'width', 'height', 'seed', 'count', 'duration', 'ratio', 'size', 'image_url',
  'steps', 'cfg', 'guidance_scale', 'loras', 'denoise', 'sampler_name', 'scheduler',
];

// Map request fields onto the tool's input schema. No defaults: unfilled tool inputs and unmapped request fields → error (C5).
function buildTensorArtInputs(toolInputs: any[], body: any): { inputs?: any[]; used?: Set<string>; error?: string; unsupported?: string[] } {
  if (Array.isArray(body.inputs)) {
    if (body.inputs.length !== toolInputs.length) {
      return { error: `inputs 数量 (${body.inputs.length}) 与工具输入 schema 数量 (${toolInputs.length}) 不一致` };
    }
    return { inputs: body.inputs, used: new Set() };
  }

  const used = new Set<string>();
  const missing: string[] = [];
  const inputs = toolInputs.map((inp: any, i: number) => {
    const desc = (inp.description || '').toLowerCase();
    const type = (inp.type || 'STRING').toUpperCase();
    const field = type === 'FILE' || type === 'ARRAY'
      ? 'image_url'
      : TENSORART_FIELD_KEYWORDS.find(([, kws]) => kws.some((k) => desc.includes(k)))?.[0];
    if (!field || !isProvided(body[field])) {
      missing.push(inp.description || `#${i} (${inp.type})`);
      return null;
    }
    used.add(field);
    const v = body[field];
    if (type === 'ARRAY') return { type: inp.type, value: Array.isArray(v) ? v : [v] };
    if (type === 'INTEGER' || type === 'NUMBER') return { type: inp.type, value: Number(v) };
    if (type === 'STRING') return { type: inp.type, value: String(v) };
    return { type: inp.type, value: v };
  });

  const unsupported = TENSORART_GENERIC_FIELDS.filter((f) => isProvided(body[f]) && !used.has(f));
  if (unsupported.length > 0) {
    return { error: `该服务商不支持: ${unsupported.join(', ')}（所选 Tensor.Art 工具的输入 schema 中没有对应项）`, unsupported };
  }
  if (missing.length > 0) {
    return { error: `Tensor.Art 工具缺少必需输入: ${missing.join('; ')}。请提供对应字段，或直接传入与 schema 等长的 inputs 数组。` };
  }
  return { inputs, used };
}

// 2.95. Tensor.Art / TusiArt OpenWorks OpenAPI (tool/list, task, file/upload)
app.all(['/api/tensorart/tools', '/api/engine/tensorart/tools'], async (req, res) => {
  try {
    const apiKey = resolveTensorArtKey(req);
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
    const apiKey = resolveTensorArtKey(req);
    if (!apiKey) {
      return res.status(400).json({ error: '未配置 Tensor.Art API Key。' });
    }
    const baseUrl = getTensorArtBaseUrl(apiKey);
    // ponytail: OpenWorks /file/upload body schema unverified (docs unreachable) — forward the caller's body verbatim instead of discarding it.
    const upstreamRes = await upstreamFetch(
      { provider: 'tensorart', route: req.path, model: 'file/upload', key: apiKey },
      `${baseUrl}/file/upload`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Echo-Access-Key': apiKey },
        body: JSON.stringify(req.body ?? {}),
      }
    );
    if (!upstreamRes.ok) {
      const errText = await upstreamRes.text();
      return res.status(upstreamRes.status).json({ error: `Tensor.Art 文件上传 HTTP 失败 [${upstreamRes.status}]: ${errText}` });
    }
    const upstreamData = await upstreamRes.json();
    if (upstreamData.code !== '0' && upstreamData.code !== 0) {
      return res.status(400).json({ error: `Tensor.Art 预领文件上传链接失败: [${upstreamData.code}] ${upstreamData.message}` });
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
    const startTime = Date.now();
    const apiKey = resolveTensorArtKey(req);

    if (!apiKey) {
      return res.status(400).json({
        error: '未配置 Tensor.Art API Key，请在右上角设置中填写您的 API Key。',
      });
    }

    const { prompt, model, toolName: inputToolName } = req.body;
    const rawModel = String(inputToolName || model || '').trim();
    if (!rawModel) return res.status(400).json({ error: '模型为必填项（model / toolName is required）' });
    const baseUrl = getTensorArtBaseUrl(apiKey);

    // Exact tool-name match only — no fuzzy / substring / tools[0] fallback (Item 3).
    const tools = await fetchTensorArtToolsList(apiKey);
    const targetTool = tools.find((t: any) => t.name === rawModel);
    if (!targetTool) {
      return res.status(400).json({
        error: `未找到指定的 Tensor.Art 工具: ${rawModel}（需与 /tool/list 返回的 name 完全一致）`,
        availableTools: tools.map((t: any) => t.name),
      });
    }

    const built = buildTensorArtInputs(targetTool.inputs || [], req.body);
    if (built.error) {
      return res.status(400).json({ error: built.error, unsupported: built.unsupported, toolName: targetTool.name, toolInputs: targetTool.inputs });
    }
    const formattedInputs = built.inputs;

    const submitRes = await upstreamFetch(
      { provider: 'tensorart', route: req.path, model: targetTool.name, key: apiKey },
      `${baseUrl}/task`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Echo-Access-Key': apiKey },
        body: JSON.stringify({ toolName: targetTool.name, inputs: formattedInputs }),
      }
    );

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
      let qRes: Response;
      try {
        qRes = await upstreamFetch(
          { provider: 'tensorart', route: req.path, model: targetTool.name, key: apiKey },
          `${baseUrl}/task/query`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Echo-Access-Key': apiKey,
            },
            body: JSON.stringify({ taskIds: [String(taskId)] }),
          }
        );
      } catch (netErr: any) {
        keyPoolManager.recordResult('tensorart', apiKey, false, Date.now() - startTime, netErr.message);
        return res.status(502).json({
          error: `Tensor.Art 任务状态查询网络异常: ${netErr.message}`,
          taskId,
          toolName: targetTool.name,
          requestedModel: rawModel,
        });
      }

      if (!qRes.ok) {
        const errText = await qRes.text();
        return res.status(qRes.status).json({
          error: `Tensor.Art 任务状态查询失败 [${qRes.status}]: ${errText}`,
          taskId,
          toolName: targetTool.name,
          requestedModel: rawModel,
        });
      }

      const qData = await qRes.json();
      if (qData.code !== '0' && qData.code !== 0) {
        return res.status(500).json({
          error: `Tensor.Art 任务状态查询返回错误: [${qData.code}] ${qData.message || '系统错误'}`,
          taskId,
          toolName: targetTool.name,
          requestedModel: rawModel,
        });
      }

      const task = qData.data?.tasks?.[0] || qData.data?.[0];
      if (!task) continue;

      const status = (task.status || '').toUpperCase();
      if (status === 'FINISH' || status === 'SUCCESS') {
        const out = task.outputs?.[0];
        resultOutput = typeof out === 'string' ? out : out?.value || out?.url || '';
        break;
      }

      if (status === 'FAILED' || status === 'EXCEPTION' || status === 'CANCELED') {
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

    // History: only values actually mapped into tool inputs (C5).
    const item = recordHistoryItem({
      url: resultOutput,
      prompt: built.used?.has('prompt') ? prompt : '',
      negativePrompt: built.used?.has('negative_prompt') ? req.body.negative_prompt : undefined,
      provider: 'Tensor.Art (OpenWorks)',
      model: targetTool.name,
      seed: built.used?.has('seed') ? Number(req.body.seed) : null,
      steps: null,
      cfg: null,
    });

    return res.json({
      imageUrl: isVideo ? '' : resultOutput,
      videoUrl: isVideo ? resultOutput : '',
      mediaUrl: resultOutput,
      mediaType: isVideo ? 'video' : 'image',
      provider: 'Tensor.Art (OpenWorks)',
      actualProvider: 'Tensor.Art (OpenWorks)',
      model: targetTool.name,
      actualModel: targetTool.name,
      toolName: targetTool.name,
      requestedModel: rawModel,
      taskId,
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
  const startTime = Date.now();
  try {
    const {
      prompt,
      negative_prompt,
      model,
      width,
      height,
      steps,
      guidance,
      seed,
    } = req.body;
    if (!model) return res.status(400).json({ error: '模型为必填项（model is required）' });

    const hfToken = keyPoolManager.getNextKey('huggingface', (req.headers['x-hf-token'] as string) || undefined) || '';

    const normalizedModel = (model || '').trim().toLowerCase();
    const isZImage =
      normalizedModel === 'tongyi-mai/z-image-turbo' ||
      normalizedModel === 'z-image-turbo';

    if (!hfToken && !isZImage) {
      return res.status(400).json({
        error: '未配置 Hugging Face Token，请在右上角设置中填写您的 User Access Token (hf_...)。',
      });
    }

    // HF text-to-image task schema has no LoRA field; Z-Image Space sends an empty LoRA list. Never silently drop.
    if (rejectUnsupported(res, 'Hugging Face', req.body, ['loras', 'cfg', 'denoise', 'image_url'])) return;
    // Z-Image Space inputs: prompt, resolution, seed, steps (shift fixed) — no negative prompt / guidance.
    if (isZImage && rejectUnsupported(res, 'Hugging Face Z-Image Space', req.body, ['negative_prompt', 'guidance'])) return;

    const finalPrompt = prompt || '';
    let dataUrl = '';
    let sentSeed: number | null = null;
    let sentSteps: number | null = null;
    let sentCfg: number | null = null;

    if (isZImage) {
      // H2: 🌟 Direct integration with verified official Tongyi-MAI/Z-Image-Turbo Gradio Space on Hugging Face (Public Space)
      const Z_IMAGE_RESOLUTIONS = new Set([
        '1024x1024 ( 1:1 )',
        '720x1280 ( 9:16 )',
        '1280x720 ( 16:9 )',
        '1120x1440 ( 7:9 )',
        '1440x1120 ( 9:7 )',
        '960x1440 ( 2:3 )',
        '1440x960 ( 3:2 )',
        '864x1536 ( 9:16 )',
        '1536x864 ( 16:9 )',
        '768x1344 ( 9:16 )',
        '1344x768 ( 16:9 )',
        '896x1152 ( 3:4 )',
        '1152x896 ( 4:3 )',
        '704x1408 ( 1:2 )',
        '1408x704 ( 2:1 )',
        '640x1536 ( 5:12 )',
        '1536x640 ( 12:5 )',
        '1024x1536 ( 2:3 )',
        '1536x1024 ( 3:2 )',
        '1024x1280 ( 4:5 )',
        '1280x1024 ( 5:4 )',
        '1024x1344 ( 3:4 )',
        '1344x1024 ( 4:3 )',
        '1024x1440 ( 5:7 )',
        '1440x1024 ( 7:5 )',
        '960x1280 ( 3:4 )',
        '1280x960 ( 4:3 )',
        '960x1536 ( 5:8 )',
        '1536x960 ( 8:5 )',
        '896x1280 ( 7:10 )',
        '1280x896 ( 10:7 )',
        '896x1344 ( 2:3 )',
        '1344x896 ( 3:2 )',
      ]);

      if (isProvided(width) || isProvided(height)) {
        return res.status(400).json({
          error: 'Tongyi-MAI/Z-Image-Turbo 不支持直接传 width/height，只接受官方接口列出的 resolution 取值（如 "1024x1024 ( 1:1 )"）',
          unsupported: [isProvided(width) ? 'width' : '', isProvided(height) ? 'height' : ''].filter(Boolean),
        });
      }

      const resolution = req.body.resolution;
      if (!resolution || !Z_IMAGE_RESOLUTIONS.has(resolution)) {
        return res.status(400).json({
          error: `不支持或缺失的 resolution 取值 "${resolution || ''}"。Tongyi-MAI/Z-Image-Turbo 仅支持 Space 官方列出的 33 种分辨率选项。`,
        });
      }

      if (!isProvided(seed)) {
        return res.status(400).json({
          error: 'Tongyi-MAI/Z-Image-Turbo 必填 seed 参数（该 Space 位置参数必填，服务端不编造默认值）',
        });
      }
      if (!isProvided(steps)) {
        return res.status(400).json({
          error: 'Tongyi-MAI/Z-Image-Turbo 必填 steps 参数（该 Space 位置参数必填，服务端不编造默认值）',
        });
      }

      // H6: Space /generate 位置参数 shift / random_seed / gallery_images（gradio_api/info 2026-09-29）不再写死；
      // 未标注是否可省略 → 缺了就 400
      const { shift, random_seed, gallery_images } = req.body;
      const missing = [
        !isProvided(shift) && 'shift（1.0–10.0）',
        typeof random_seed !== 'boolean' && 'random_seed（布尔值；true 时 Space 忽略传入的 seed）',
        !Array.isArray(gallery_images) && 'gallery_images（数组，可为 []）',
      ].filter(Boolean);
      if (missing.length > 0) {
        return res.status(400).json({ error: `Tongyi-MAI/Z-Image-Turbo 缺少必填参数: ${missing.join('、')}（服务端不编造默认值）` });
      }

      const seedNum = Number(seed);
      const stepsNum = Number(steps);
      // random_seed=true 时上游不用这个 seed → 不记进历史
      sentSeed = random_seed ? null : seedNum;
      sentSteps = stepsNum;

      const gradioPayload = {
        data: [finalPrompt, resolution, seedNum, stepsNum, Number(shift), random_seed, gallery_images],
      };

      const gradioHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (hfToken) gradioHeaders['Authorization'] = `Bearer ${hfToken}`;

      const initResp = await upstreamFetch(
        { provider: 'huggingface', route: '/api/huggingface/generate', model, key: hfToken },
        'https://tongyi-mai-z-image-turbo.hf.space/gradio_api/call/generate',
        { method: 'POST', headers: gradioHeaders, body: JSON.stringify(gradioPayload) }
      );

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

      const sseResp = await upstreamFetch(
        { provider: 'huggingface', route: '/api/huggingface/generate', model, key: hfToken },
        `https://tongyi-mai-z-image-turbo.hf.space/gradio_api/call/generate/${eventId}`,
        { headers: sseHeaders }
      );

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

      const imgResp = await upstreamFetch(
        { provider: 'huggingface', route: '/api/huggingface/generate', model, key: hfToken },
        genUrl,
        { headers: { 'Authorization': `Bearer ${hfToken}` } }
      );
      if (imgResp.ok) {
        const buf = await imgResp.arrayBuffer();
        const base64 = Buffer.from(buf).toString('base64');
        const mimeType = imgResp.headers.get('content-type') || 'image/png';
        dataUrl = `data:${mimeType};base64,${base64}`;
      } else {
        dataUrl = genUrl;
      }
    } else {
      // HF text-to-image task: only forward what the caller provided; no defaults, no SDK→router retry.
      const parameters: Record<string, any> = {};
      if (isProvided(negative_prompt)) parameters.negative_prompt = negative_prompt;
      if (isProvided(width)) parameters.width = Number(width);
      if (isProvided(height)) parameters.height = Number(height);
      if (isProvided(steps)) parameters.num_inference_steps = Number(steps);
      if (isProvided(guidance)) parameters.guidance_scale = Number(guidance);
      if (typeof seed === 'number' && seed >= 0) parameters.seed = seed;

      const resp = await upstreamFetch(
        { provider: 'huggingface', route: '/api/huggingface/generate', model, key: hfToken },
        `https://router.huggingface.co/hf-inference/models/${model}`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${hfToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputs: finalPrompt, parameters }),
        }
      );

      if (!resp.ok) {
        const errorText = await resp.text();
        keyPoolManager.recordResult('huggingface', hfToken, false, 0, errorText, resp.status);
        let parsedError: any;
        try { parsedError = JSON.parse(errorText); } catch { parsedError = { error: errorText }; }
        return res.status(resp.status).json({
          error: `Hugging Face 模型推理失败 [${resp.status}]`,
          details: parsedError.error || parsedError.message || errorText,
          model,
        });
      }

      keyPoolManager.recordResult('huggingface', hfToken, true);
      const buffer = await resp.arrayBuffer();
      const mimeType = resp.headers.get('content-type') || 'image/jpeg';
      dataUrl = `data:${mimeType};base64,${Buffer.from(buffer).toString('base64')}`;
      sentSeed = parameters.seed ?? null;
      sentSteps = parameters.num_inference_steps ?? null;
      sentCfg = parameters.guidance_scale ?? null;
    }

    const item = recordHistoryItem({
      url: dataUrl,
      prompt: finalPrompt,
      negativePrompt: isZImage ? undefined : negative_prompt,
      provider: 'Hugging Face',
      model,
      seed: sentSeed,
      steps: sentSteps,
      cfg: sentCfg,
    });

    return res.json({
      imageUrl: dataUrl,
      provider: 'Hugging Face',
      actualProvider: 'Hugging Face',
      model,
      actualModel: model,
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
    const startTime = Date.now();
    try {
      const { prompt, negative_prompt, model, steps, guidance, seed, width, height } = req.body;
      if (!model) return res.status(400).json({ error: '模型为必填项（model is required）' });
      // loras: 官方格式未能核实 → unverified，用户传了就原样放进 payload.loras，失败返回上游原文。
      // cfg / denoise / image_url: 仍 400（不在本项范围）。
      if (rejectUnsupported(res, 'ModelScope', req.body, ['cfg', 'denoise', 'image_url'])) return;

      const requestedSite = (
        req.body.site ||
        req.headers['x-modelscope-site'] ||
        (req.originalUrl.includes('modelscope_ai') ? 'ai' : 'cn')
      )
        .toString()
        .toLowerCase();
      const isAiSite = requestedSite === 'ai';

      const poolName = isAiSite ? 'modelscope_ai' : 'modelscope';
      const headerToken = isAiSite
        ? (req.headers['x-modelscope-ai-token'] as string) || (req.headers['x-modelscope-token'] as string)
        : (req.headers['x-modelscope-token'] as string);
      const token = keyPoolManager.getNextKey(poolName, headerToken || undefined) || '';

      if (!token) {
        return res.status(400).json({
          error: `未配置魔搭${isAiSite ? '国际站 (modelscope.ai)' : '国内站 (modelscope.cn)'} Token，请在右上角设置中填写您的 API Token。`,
        });
      }

      // Build payload — top-level fields, no `parameters` wrapper (M1)
      const finalPrompt = prompt || '';
      const payload: any = { model, prompt: finalPrompt };
      if (negative_prompt) payload.negative_prompt = negative_prompt;
      // M1: field is num_inference_steps, not steps
      if (isProvided(steps)) payload.num_inference_steps = Number(steps);
      if (isProvided(guidance)) payload.guidance_scale = Number(guidance);
      if (isProvided(seed)) payload.seed = Number(seed);
      if (isProvided(width)) payload.width = Number(width);
      if (isProvided(height)) payload.height = Number(height);
      if (isProvided(req.body.loras)) payload.loras = req.body.loras; // unverified，原样透传

      const primaryDomain = isAiSite
        ? 'https://api-inference.modelscope.ai/v1'
        : 'https://api-inference.modelscope.cn/v1';

      let submitResp;
      try {
        submitResp = await upstreamFetch(
          { provider: poolName, route: req.path, model, key: token },
          `${primaryDomain}/images/generations`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'X-ModelScope-Async-Mode': 'true',
            },
            body: JSON.stringify(payload),
          }
        );

        if (!submitResp.ok) {
          const errorText = await submitResp.text();
          keyPoolManager.recordResult(poolName, token, false, Date.now() - startTime, errorText, submitResp.status);
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
            model,
            provider: isAiSite ? 'ModelScope AI' : 'ModelScope CN',
          });
        }
      } catch (e: any) {
        return res.status(500).json({
          error: `魔搭${isAiSite ? '国际站 (modelscope.ai)' : '国内站 (modelscope.cn)'} 网络请求失败: ${e.message}`,
        });
      }

      keyPoolManager.recordResult(poolName, token, true, Date.now() - startTime);
      const submitData = await submitResp.json();
      let imageUrl = submitData.output_images?.[0];

      if (!imageUrl && submitData.task_id) {
        const taskId = submitData.task_id;
        for (let i = 0; i < 45; i++) {
          await new Promise((r) => setTimeout(r, 2500));
          let pollResp: Response;
          try {
            pollResp = await upstreamFetch(
              { provider: poolName, route: req.path, model, key: token },
              `${primaryDomain}/tasks/${taskId}`,
              {
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'X-ModelScope-Task-Type': 'image_generation',
                },
              }
            );
          } catch (netErr: any) {
            keyPoolManager.recordResult(poolName, token, false, Date.now() - startTime, netErr.message);
            return res.status(502).json({
              error: `魔搭${isAiSite ? '国际站' : '国内站'}任务状态查询网络异常: ${netErr.message}`,
              taskId,
              model,
            });
          }
          if (!pollResp.ok) {
            const errText = await pollResp.text().catch(() => '');
            keyPoolManager.recordResult(poolName, token, false, Date.now() - startTime, errText, pollResp.status);
            return res.status(pollResp.status).json({
              error: `魔搭${isAiSite ? '国际站' : '国内站'}任务状态查询失败 [${pollResp.status}]: ${errText}`,
              taskId,
              model,
            });
          }
          const pollData = await pollResp.json();
            if (pollData.task_status === 'SUCCEED') {
              imageUrl = pollData.output_images?.[0];
              if (!imageUrl) {
                return res.status(502).json({ error: '魔搭任务成功但响应中无 output_images', details: pollData, model });
              }
              break;
            } else if (pollData.task_status === 'FAILED') {
              return res.status(502).json({
                error: `魔搭${isAiSite ? '国际站' : '国内站'}任务失败: ${pollData.errors?.message || 'Task failed on ModelScope'}`,
                details: pollData.errors,
                model,
              });
            }
          }
        }

      if (!imageUrl) {
        return res.status(504).json({
          error: `魔搭${isAiSite ? '国际站' : '国内站'}排队生成超时 (~112s 未完成)，请稍后重试`,
          model,
        });
      }

      const providerName = isAiSite ? 'ModelScope AI (魔搭国际站)' : 'ModelScope CN (魔搭社区)';
      const item = recordHistoryItem({
        url: imageUrl,
        prompt: finalPrompt,
        negativePrompt: negative_prompt,
        provider: providerName,
        model,
        seed: payload.seed ?? null,
        steps: payload.num_inference_steps ?? null,
        cfg: payload.guidance_scale ?? null,
      });

      return res.json({
        imageUrl,
        provider: providerName,
        model,
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
  const startTime = Date.now();
  const nanoKey = keyPoolManager.getNextKey('nanogpt', (req.headers['x-nanogpt-key'] as string) || undefined);
  if (!nanoKey) {
    return res.status(400).json({ error: '未配置 NanoGPT API Key (x-nanogpt-key)。' });
  }

  try {
    const { prompt, model, resolution, aspect_ratio, seed, image_url } = req.body;
    if (!model) return res.status(400).json({ error: '模型为必填项（model is required）' });
    // NanoGPT /api/v1/images: no negative_prompt/steps/cfg/denoise, and no pixel dimensions
    // (only resolution "1k"/"2k"/"4k" + aspect_ratio, per model — see GET /api/v1/images/models)
    // loras: 按模型是否支持未能核实 → unverified，用户传了就原样放进 payload.loras，失败返回上游原文。
    if (rejectUnsupported(res, 'NanoGPT', req.body, ['negative_prompt', 'steps', 'cfg', 'guidance_scale', 'denoise', 'width', 'height', 'size'])) return;

    const payload: any = { prompt: prompt || '', model };
    if (isProvided(req.body.loras)) payload.loras = req.body.loras;
    if (isProvided(resolution)) payload.resolution = resolution;
    if (isProvided(aspect_ratio)) payload.aspect_ratio = aspect_ratio;
    if (isProvided(seed)) payload.seed = Number(seed);

    // Reference image via input_references (NOT legacy imageUrl/imageDataUrl)
    if (image_url) {
      payload.input_references = [image_url];
    }

    // POST api.nano-gpt.com/api/v1/images
    const response = await upstreamFetch(
      { provider: 'nanogpt', route: req.path, model, key: nanoKey },
      'https://api.nano-gpt.com/api/v1/images',
      {
        method: 'POST',
        headers: { 'x-api-key': nanoKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      keyPoolManager.recordResult('nanogpt', nanoKey, false, Date.now() - startTime, errorText, response.status);
      return res.status(response.status).json({ error: `NanoGPT 生图失败 [${response.status}]: ${errorText}` });
    }

    keyPoolManager.recordResult('nanogpt', nanoKey, true, Date.now() - startTime);
    const data = await response.json();
    const imageUrl = data.data?.[0]?.url || data.image_url || data.url || data.images?.[0];

    if (!imageUrl) {
      return res.status(500).json({ error: 'NanoGPT 返回数据中未包含图像输出 URL' });
    }

    const item = recordHistoryItem({
      url: imageUrl,
      prompt,
      provider: 'NanoGPT',
      model,
      seed: payload.seed ?? null,
      steps: null,
      cfg: null,
    });

    return res.json({
      imageUrl,
      provider: 'NanoGPT',
      model,
      historyItem: item,
    });
  } catch (error: any) {
    keyPoolManager.recordResult('nanogpt', nanoKey, false, Date.now() - startTime, error.message);
    return res.status(500).json({ error: `NanoGPT 请求失败: ${error.message}` });
  }
});

// ==========================================
// 6. Gemini Built-in Engine & Prompt Enhancer
// ==========================================
app.post(['/api/gemini/chat', '/api/engine/gemini/chat'], async (req, res) => {
  const startTime = Date.now();
  let gen: ReturnType<typeof createGoogleGenAI> | null = null;
  try {
    const { messages = [], systemInstruction, model, temperature } = req.body;
    if (!model) {
      return res.status(400).json({ error: '模型为必填项（model is required）' });
    }
    const customKey = (req.headers['x-gemini-key'] as string) || '';
    gen = createGoogleGenAI(customKey);

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

    const response = await upstreamSdkCall(
      { provider: 'gemini', route: req.path, model, key: gen.apiKey, upstream: `generativelanguage.googleapis.com/v1beta/models/${model}:generateContent` },
      () => gen!.client.models.generateContent({ model, contents: formattedContents, config })
    );

    const content = response.text || '';
    keyPoolManager.recordResult('gemini', gen.apiKey, true, Date.now() - startTime);
    return res.json({ content, provider: 'Google Gemini', model });
  } catch (error: any) {
    if (gen?.apiKey) {
      keyPoolManager.recordResult('gemini', gen.apiKey, false, Date.now() - startTime, error.message, error.status || 500);
    }
    return res.status(error.status || 500).json({
      error: `Gemini 聊天推理失败: ${error.message || '未知错误'}`,
    });
  }
});

app.post(['/api/gemini/generate', '/api/engine/gemini/generate'], async (req, res) => {
  const startTime = Date.now();
  let gen: ReturnType<typeof createGoogleGenAI> | null = null;
  try {
    const {
      prompt,
      negative_prompt,
      aspect_ratio,
      image_size,
      loras = [],
      seed,
      cfg,
      guidance_scale,
      image_url,
      model,
    } = req.body;

    if (!model) {
      return res.status(400).json({ error: '模型为必填项（model is required）' });
    }

    // E1: 收到 width/height 返回 400
    if (isProvided(req.body.width) || isProvided(req.body.height)) {
      return res.status(400).json({
        error: '该服务商不支持: width/height。Google Gemini 仅支持 aspect_ratio 或 image_size（按模型取值表）',
        unsupported: [isProvided(req.body.width) ? 'width' : '', isProvided(req.body.height) ? 'height' : ''].filter(Boolean),
      });
    }

    // Imagen is shut down (https://ai.google.dev/gemini-api/docs/imagen); all image models use generateContent,
    // which has no negative prompt / cfg / steps / LoRA. seed: schema unverified → forwarded as generationConfig.seed.
    if (rejectUnsupported(res, 'Google Gemini', req.body, ['negative_prompt', 'cfg', 'guidance_scale', 'steps', 'loras'])) return;
    if (image_url && !(typeof image_url === 'string' && image_url.startsWith('data:'))) {
      return res.status(400).json({ error: '该服务商不支持: image_url 为非 data: URL（Google Gemini 仅接受内联 base64 参考图）', unsupported: ['image_url'] });
    }
    if (isProvided(seed) && !Number.isInteger(Number(seed))) {
      return res.status(400).json({ error: `seed 必须为整数（收到 "${seed}"）` });
    }

    // 取值表唯一来源: src/schemas/providerSchema.ts。unverified（含未知模型）原样发送，上游失败原样返回；
    // 已知模型上不在 enum 的取值 → 400。已下线模型不拦截（modelStatus 只随响应返回）。
    const fieldStatus: Record<string, string> = {};
    if (isProvided(seed)) fieldStatus.seed = getFieldSpec('gemini', model, 'seed')?.status ?? 'unverified';
    for (const [field, value] of [['aspect_ratio', aspect_ratio], ['image_size', image_size]] as const) {
      if (!isProvided(value)) continue;
      const status = valueStatus('gemini', model, field, value);
      fieldStatus[field] = status;
      if (status === 'unsupported') {
        const listed = fieldOptions('gemini', model, field).map((v) => (v.status === 'supported' ? v.value : `${v.value}(未核实)`));
        return res.status(400).json({
          error: `该服务商不支持此 ${field} 取值: "${value}"。${model} 官方仅支持: ${listed.join(', ') || '（官方未列出）'}`,
        });
      }
    }

    const customKey = (req.headers['x-gemini-key'] as string) || '';
    gen = createGoogleGenAI(customKey);

    if (!gen) {
      return res.status(400).json({
        error: '未配置 Google Gemini API Key。请在设置中配置 GEMINI_API_KEY。',
      });
    }

    const imageConfig: Record<string, any> = {};
    if (isProvided(aspect_ratio)) imageConfig.aspectRatio = aspect_ratio;
    if (isProvided(image_size)) imageConfig.imageSize = image_size;

    const finalPrompt = prompt || '';
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

    // 只放用户实际传了的字段；seed → generationConfig.seed（SDK GenerateContentConfig.seed）
    const config: Record<string, any> = {};
    if (Object.keys(imageConfig).length > 0) config.imageConfig = imageConfig;
    if (isProvided(seed)) config.seed = Number(seed);
    const contentResponse = await upstreamSdkCall(
      { provider: 'gemini', route: req.path, model, key: gen.apiKey, upstream: `generativelanguage.googleapis.com/v1beta/models/${model}:generateContent` },
      () => gen!.client.models.generateContent({
        model,
        contents: { parts },
        ...(Object.keys(config).length > 0 ? { config } : {}),
      })
    );

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

    const generatedImageUrl = `data:${mimeType};base64,${base64Bytes}`;
    keyPoolManager.recordResult('gemini', gen.apiKey, true, Date.now() - startTime);

    const item = recordHistoryItem({
      url: generatedImageUrl,
      prompt,
      provider: 'Google Gemini (官方直连)',
      model,
      actualModel: model,
      actualProvider: 'Google Gemini (官方直连)',
      seed: isProvided(seed) ? Number(seed) : null,
      steps: null,
      cfg: null,
      loras: [],
    });

    const mStatus = modelStatus('gemini', model, new Date().toISOString().slice(0, 10));
    return res.json({
      imageUrl: generatedImageUrl,
      provider: 'Google Gemini (官方直连)',
      actualProvider: 'Google Gemini (官方直连)',
      model,
      actualModel: model,
      aspectRatio: aspect_ratio,
      historyItem: item,
      fieldStatus,
      ...(mStatus !== 'supported' ? { modelStatus: mStatus } : {}),
    });
  } catch (error: any) {
    if (gen?.apiKey) {
      keyPoolManager.recordResult('gemini', gen.apiKey, false, Date.now() - startTime, error.message, error.status || 500);
    }
    // U2: 原样暴露上游 HTTP 状态码和响应体
    const upstreamStatus = error.status || error.statusCode || error.httpResponse?.status || 500;
    const upstreamBody = error.errorDetails || error.response?.data || undefined;
    return res.status(upstreamStatus).json({
      error: `Google Gemini 图像生成失败: ${error.message || '未知错误'}`,
      ...(upstreamBody ? { upstreamBody } : {}),
    });
  }
});

// Prompt Refiner endpoint (Gemini / SenseNova / Agnes) - explicit provider and model required (W3)
app.post(['/api/gemini/refine-prompt', '/api/ai/refine-prompt'], async (req, res) => {
  try {
    const { prompt, provider, model, style, loras = [] } = req.body;
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: 'Prompt 为必填项' });
    }
    if (!provider || typeof provider !== 'string' || !provider.trim()) {
      return res.status(400).json({ error: 'provider 为必填项' });
    }
    if (!model || typeof model !== 'string' || !model.trim()) {
      return res.status(400).json({ error: '模型为必填项' });
    }

    const targetProvider = provider.toLowerCase().trim();
    const targetModel = model.trim();
    const rawPrompt = prompt.trim();
    const loraContext = Array.isArray(loras) && loras.length > 0
      ? `Target LoRA triggers/styles: ${loras.map((l: any) => `${l.name || l.displayName}${(l.strength ?? l.modelStrength) != null ? ` (strength: ${l.strength ?? l.modelStrength})` : ''}`).join(', ')}`
      : '';

    const systemInstruction = `You are a world-class prompt engineer and AI visual director specializing in Midjourney v6, FLUX.1, and SDXL ComfyUI pipelines.
Your task is to transform the user's initial prompt into an exceptional, visually coherent, ultra-detailed generation prompt.
- Expand visual atmosphere, cinematic lighting (e.g. volumetric rays, rim light, golden hour), camera gear/optics (e.g. 85mm f/1.4 lens, 35mm film photography, Hasselblad), hyper-detailed textures (skin micro-texture, fabric grain), and rich color grading.
- Preserve the user's original core subject and intent.
- Incorporate any requested LoRA triggers naturally.
- Output ONLY the final expanded prompt in English, with NO conversational filler, NO markdown quotes, and NO preamble.`;

    if (targetProvider === 'gemini') {
      const geminiKey = (req.headers['x-gemini-key'] as string) || '';
      const gen = createGoogleGenAI(geminiKey);
      if (!gen) {
        return res.status(400).json({ error: '未配置 Google Gemini API 密钥（GEMINI_API_KEY / x-gemini-key）' });
      }
      try {
        const response = await gen.client.models.generateContent({
          model: targetModel,
          contents: [
            {
              role: 'user',
              parts: [
                { text: `${systemInstruction}\n\nUser Input Prompt: "${rawPrompt}"\n${style ? `Desired Visual Style: ${style}\n` : ''}${loraContext}` }
              ]
            }
          ]
        });
        const out = response.text?.trim();
        if (!out) {
          return res.status(502).json({ error: 'Gemini 未返回生成内容' });
        }
        const cleaned = out.replace(/^["']|["']$/g, '').replace(/```[\s\S]*?```/g, '').trim();
        return res.json({
          success: true,
          refinedPrompt: cleaned,
          originalPrompt: rawPrompt,
          actualProvider: 'gemini',
          actualModel: targetModel,
        });
      } catch (gErr: any) {
        const statusCode = gErr?.status || gErr?.statusCode || 500;
        return res.status(statusCode).json({
          error: `Gemini 调用失败 [${statusCode}]: ${gErr?.message || gErr}`,
          status: statusCode,
          details: gErr?.errorDetails || gErr?.toString(),
        });
      }
    }

    if (targetProvider === 'sensenova') {
      const auth = resolveProviderAuth(req, 'sensenova');
      if (auth.error) {
        return res.status(400).json({ error: auth.error });
      }
      const snResp = await upstreamFetch(
        { provider: 'sensenova', route: req.path, model: targetModel, key: auth.apiKey },
        `${auth.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${auth.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: targetModel,
            messages: [
              { role: 'system', content: systemInstruction },
              { role: 'user', content: `Expand prompt: "${rawPrompt}".${style ? ` Desired style: ${style}.` : ''} ${loraContext}`.trim() }
            ],
            temperature: 0.6,
            max_tokens: 1024,
          }),
        }
      );
      if (!snResp.ok) {
        const errText = await snResp.text();
        return res.status(snResp.status).json({
          error: `SenseNova 调用失败 [${snResp.status}]: ${errText}`,
          status: snResp.status,
          upstreamBody: errText,
        });
      }
      const snData = await snResp.json();
      const snText = snData.choices?.[0]?.message?.content?.trim();
      if (!snText) {
        return res.status(502).json({ error: 'SenseNova 未返回有效内容', details: snData });
      }
      const cleaned = snText.replace(/^["']|["']$/g, '').replace(/```[\s\S]*?```/g, '').trim();
      return res.json({
        success: true,
        refinedPrompt: cleaned,
        originalPrompt: rawPrompt,
        actualProvider: 'sensenova',
        actualModel: snData.model || targetModel,
      });
    }

    if (targetProvider === 'agnes') {
      const auth = resolveProviderAuth(req, 'agnes');
      if (auth.error) {
        return res.status(400).json({ error: auth.error });
      }
      const agResp = await upstreamFetch(
        { provider: 'agnes', route: req.path, model: targetModel, key: auth.apiKey },
        `${auth.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${auth.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: targetModel,
            messages: [
              { role: 'system', content: systemInstruction },
              { role: 'user', content: `Expand prompt: "${rawPrompt}".${style ? ` Style: ${style}.` : ''} ${loraContext}`.trim() }
            ],
            temperature: 0.6,
            max_tokens: 1024,
          }),
        }
      );
      if (!agResp.ok) {
        const errText = await agResp.text();
        return res.status(agResp.status).json({
          error: `Agnes AI 调用失败 [${agResp.status}]: ${errText}`,
          status: agResp.status,
          upstreamBody: errText,
        });
      }
      const agData = await agResp.json();
      const agText = agData.choices?.[0]?.message?.content?.trim();
      if (!agText) {
        return res.status(502).json({ error: 'Agnes AI 未返回有效内容', details: agData });
      }
      const cleaned = agText.replace(/^["']|["']$/g, '').replace(/```[\s\S]*?```/g, '').trim();
      return res.json({
        success: true,
        refinedPrompt: cleaned,
        originalPrompt: rawPrompt,
        actualProvider: 'agnes',
        actualModel: agData.model || targetModel,
      });
    }

    return res.status(400).json({ error: `不支持的润色 provider: ${targetProvider}（仅支持 gemini, sensenova, agnes）` });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Prompt refinement failed' });
  }
});

// ==========================================
// 7. Provider Health & Connectivity Check
// ==========================================
interface SingleKeyTestResult {
  maskedKey: string;
  // 'unsupported' = provider documents no read-only test endpoint; nothing was sent upstream.
  status: 'ok' | 'error' | 'active' | 'invalid' | 'warning' | 'rate_limited' | 'unsupported';
  latency: number;
  message: string;
}

const NO_READONLY_TEST = '该服务商没有只读测试接口';

// S6: key tests may only hit read-only account / auth / model-list endpoints — never generation or chat.
async function testSingleProviderKey(
  provider: string,
  singleKey: string,
  routePath: string
): Promise<SingleKeyTestResult> {
  const startTime = Date.now();
  const maskedKey = keyPoolManager.maskKey(singleKey);
  const prov = provider.toLowerCase().trim();

  try {
    if (prov === 'civitai') {
      const headers: Record<string, string> = { 'User-Agent': 'ComfyCanvas-AI/1.0' };
      if (singleKey) headers['Authorization'] = `Bearer ${singleKey}`;
      const resp = await upstreamFetch(
        { provider: 'civitai', route: routePath, model: 'key-check', key: singleKey },
        'https://civitai.com/api/v1/models?limit=1&types=LORA',
        { headers }
      );
      const latency = Date.now() - startTime;
      if (resp.ok) {
        return {
          maskedKey,
          status: 'ok',
          latency,
          message: 'Civitai API 验证成功，已开放 C 站全量 Checkpoint 与 LoRA 模型库检索',
        };
      }
      const errText = await resp.text().catch(() => '');
      return {
        maskedKey,
        status: 'error',
        latency,
        message: `Civitai 返回错误 [${resp.status}]: ${errText.slice(0, 200)}`,
      };
    }

    if (prov === 'fal') {
      if (!singleKey) {
        return { maskedKey, status: 'error', latency: 0, message: '未配置 Fal.ai API 密钥' };
      }
      const falTest = await falReadOnlyKeyCheck(singleKey, routePath);
      const latency = Date.now() - startTime;
      const status = falTest.status === 'active' ? 'ok' : falTest.status === 'invalid' ? 'error' : 'warning';
      return {
        maskedKey,
        status,
        latency,
        message: falTest.message || (status === 'ok' ? 'Fal.ai 认证成功' : 'Fal.ai 认证失败'),
      };
    }

    if (prov === 'huggingface') {
      if (!singleKey) {
        return { maskedKey, status: 'error', latency: 0, message: '未配置 Hugging Face Token' };
      }
      const resp = await upstreamFetch(
        { provider: 'huggingface', route: routePath, model: 'whoami-v2', key: singleKey },
        'https://huggingface.co/api/whoami-v2',
        {
          headers: { 'Authorization': `Bearer ${singleKey}` },
        }
      );
      const latency = Date.now() - startTime;
      if (resp.ok) {
        const whoami = await resp.json().catch(() => ({}));
        return {
          maskedKey,
          status: 'ok',
          latency,
          message: `Hugging Face 认证成功：@${whoami.name || 'User'} (具备 Serverless 推理与 Hub 访问权限)`,
        };
      }
      const errText = await resp.text().catch(() => '');
      return {
        maskedKey,
        status: 'error',
        latency,
        message: `Hugging Face 鉴权失败 [${resp.status}]: ${errText.slice(0, 200)}`,
      };
    }

    // ponytail: ModelScope docs are JS-rendered; GET /v1/models could not be verified, so nothing is sent.
    // Restore the model-list call once an official page documents it.
    if (prov === 'modelscope' || prov === 'modelscope_cn' || prov === 'modelscope_ai') {
      return { maskedKey, status: 'unsupported', latency: 0, message: `${NO_READONLY_TEST}（未能核实官方只读接口）` };
    }

    if (prov === 'nanogpt') {
      if (!singleKey) {
        return { maskedKey, status: 'error', latency: 0, message: '未配置 NanoGPT API Key' };
      }
      const resp = await upstreamFetch(
        { provider: 'nanogpt', route: routePath, key: singleKey },
        'https://api.nano-gpt.com/api/check-balance',
        { method: 'POST', headers: { 'x-api-key': singleKey } }
      );
      const latency = Date.now() - startTime;
      if (resp.ok) {
        const bal = await resp.json().catch(() => ({}));
        return {
          maskedKey,
          status: 'ok',
          latency,
          message: `NanoGPT 认证成功，余额 $${bal.usd_balance ?? '?'}`,
        };
      }
      const respText = await resp.text().catch(() => '');
      return {
        maskedKey,
        status: 'error',
        latency,
        message: `NanoGPT 鉴权失败 [${resp.status}]: ${respText.slice(0, 200)}`,
      };
    }

    if (prov === 'gemini') {
      if (!singleKey) {
        return { maskedKey, status: 'error', latency: 0, message: '未配置 Google Gemini API 密钥' };
      }
      // models.list (GET, read-only): https://ai.google.dev/api/models
      const resp = await upstreamFetch(
        { provider: 'gemini', route: routePath, model: 'models.list', key: singleKey },
        'https://generativelanguage.googleapis.com/v1beta/models',
        { headers: { 'x-goog-api-key': singleKey } }
      );
      const latency = Date.now() - startTime;
      if (resp.ok) {
        return { maskedKey, status: 'ok', latency, message: 'Google Gemini 认证成功（models.list）' };
      }
      const errText = await resp.text().catch(() => '');
      return {
        maskedKey,
        status: resp.status === 429 ? 'rate_limited' : 'error',
        latency,
        message: `Google Gemini 鉴权失败 [${resp.status}]: ${errText.slice(0, 200)}`,
      };
    }

    // Official docs list only chat/generation endpoints (Agnes: wiki.agnes-ai.com/llms.txt; SenseNova: OpenSenseNova API.md).
    if (prov === 'agnes' || prov === 'sensenova') {
      return { maskedKey, status: 'unsupported', latency: 0, message: `${NO_READONLY_TEST}（官方文档仅列出生成/对话接口）` };
    }

    if (prov === 'openai_compat' || prov === 'grok_compat') {
      if (!singleKey) {
        return { maskedKey, status: 'error', latency: 0, message: `未配置 ${prov} API 密钥` };
      }
      const { baseUrl, error: urlErr } = getProviderBaseUrl(prov);
      if (urlErr) {
        return { maskedKey, status: 'error', latency: 0, message: urlErr };
      }
      const resp = await upstreamFetch(
        { provider: prov, route: routePath, model: 'models', key: singleKey },
        `${baseUrl}/models`,
        { headers: { Authorization: `Bearer ${singleKey}` } },
      );
      const latency = Date.now() - startTime;
      if (resp.ok) {
        return {
          maskedKey,
          status: 'ok',
          latency,
          message: `${prov === 'openai_compat' ? 'OpenAI 兼容中转' : 'Grok 兼容中转'} GET /models 成功（无余额接口）`,
        };
      }
      const errText = await resp.text().catch(() => '');
      return {
        maskedKey,
        status: 'error',
        latency,
        message: `${prov} 鉴权失败 [${resp.status}]: ${errText.slice(0, 200)}`,
      };
    }

    if (prov === 'tensorart') {
      if (!singleKey) {
        return { maskedKey, status: 'error', latency: 0, message: '未配置 Tensor.Art API Key' };
      }
      const tools = await fetchTensorArtToolsList(singleKey);
      const latency = Date.now() - startTime;
      return {
        maskedKey,
        status: 'ok',
        latency,
        message: `Tensor.Art (OpenWorks OpenAPI) 认证成功，已连通 ${tools.length} 个官方算力工具。`,
      };
    }

    return { maskedKey, status: 'error', latency: 0, message: `未知模型服务商: ${provider}` };
  } catch (err: any) {
    const errLower = (err.message || '').toLowerCase();
    const isRate =
      errLower.includes('quota') ||
      errLower.includes('resource_exhausted') ||
      errLower.includes('overloaded') ||
      errLower.includes('rate limit') ||
      errLower.includes('429') ||
      errLower.includes('503');
    return {
      maskedKey,
      status: isRate ? 'rate_limited' : 'error',
      latency: Date.now() - startTime,
      message: err.message || '连接测试异常',
    };
  }
}

app.post('/api/test-provider', requireAdminAuth, async (req, res) => {
  const { provider, key } = req.body;
  if (!provider) {
    return res.status(400).json({ error: 'provider 为必填项' });
  }

  const prov = String(provider).toLowerCase().trim();
  const rawKeys = keyPoolManager.parseKeyString(key);
  const keysToTest = rawKeys.length > 0 ? rawKeys : keyPoolManager.getKeys(prov);

  if (keysToTest.length === 0) {
    if (prov === 'civitai') {
      keysToTest.push('');
    } else {
      return res.json({ status: 'error', message: `未配置 ${provider} API 密钥` });
    }
  }

  const results: SingleKeyTestResult[] = [];
  for (const k of keysToTest) {
    const r = await testSingleProviderKey(prov, k, req.path);
    const isSuccess = r.status === 'ok' || r.status === 'active' || r.status === 'warning';
    if (k && r.status !== 'unsupported') {
      keyPoolManager.recordResult(prov, k, isSuccess, r.latency, isSuccess ? undefined : r.message);
    }
    results.push(r);
  }

  // Unsupported is per-provider, so either every result is unsupported or none is.
  if (results[0].status === 'unsupported') {
    return res.json({ status: 'unsupported', latency: 0, message: results[0].message, results });
  }

  if (results.length === 1) {
    const single = results[0];
    return res.json({
      status: single.status === 'ok' || single.status === 'active' || single.status === 'warning' ? 'ok' : 'error',
      latency: single.latency,
      message: single.message,
      results,
    });
  }

  const allOk = results.every((r) => r.status === 'ok' || r.status === 'active' || r.status === 'warning');
  const summaryMsg = `共测试 ${results.length} 个密钥：\n` + results.map((r) => `• [${r.maskedKey || '未设Key'}]: ${r.message} (${r.latency}ms)`).join('\n');
  const avgLatency = Math.round(results.reduce((acc, r) => acc + r.latency, 0) / results.length);
  return res.json({
    status: allOk ? 'ok' : 'error',
    latency: avgLatency,
    message: summaryMsg,
    results,
  });
});

// Cloud Multi-Key Pool Stats
app.get('/api/cloud-keys/stats', requireAdminAuth, (_req, res) => {
  keyPoolManager.refreshFromSettings();
  const stats = enrichPoolStatsWithServerBaseUrl(keyPoolManager.getStats(), (prov) => {
    // settings.json wins over env defaultKeys — same resolution as getProviderBaseUrl (no request headers).
    const { settingsBaseName } = AUTH_META[prov];
    return String(cloudSettings[settingsBaseName] || defaultKeys[settingsBaseName] || '');
  });
  return res.json(stats);
});

const VALID_STRATEGY_PROVIDERS = new Set([
  'fal',
  'agnes',
  'sensenova',
  'civitai',
  'huggingface',
  'modelscope',
  'modelscope_ai',
  'nanogpt',
  'tensorart',
  'gemini',
  'openai_compat',
  'grok_compat',
]);
const VALID_STRATEGIES = new Set(['round_robin', 'failover', 'latency_best']);

// Update Key Pool Strategy
app.post('/api/cloud-keys/strategy', requireAdminAuth, (req, res) => {
  const { provider, strategy } = req.body;
  if (!provider || typeof provider !== 'string' || !VALID_STRATEGY_PROVIDERS.has(provider)) {
    return res.status(400).json({ error: `未知或不支持的 provider: "${provider}"` });
  }
  if (!strategy || typeof strategy !== 'string' || !VALID_STRATEGIES.has(strategy)) {
    return res.status(400).json({ error: `不支持的策略: "${strategy}"。仅支持: round_robin, failover, latency_best` });
  }
  keyPoolManager.setStrategy(provider, strategy as any);
  cloudSettings[`${provider}_strategy`] = strategy;
  writeJsonFile(SETTINGS_FILE, cloudSettings);
  return res.json({ success: true, provider, strategy });
});

// Test single key directly
app.post('/api/cloud-keys/test-single', requireAdminAuth, async (req, res) => {
  const { provider, key } = req.body;
  if (!provider || !key) {
    return res.status(400).json({ error: 'Missing provider or key' });
  }

  const prov = String(provider).toLowerCase().trim();
  const keysToTest = keyPoolManager.parseKeyString(key);

  if (keysToTest.length === 0) {
    return res.status(400).json({ error: 'Key 不能为空' });
  }

  const results: SingleKeyTestResult[] = [];
  for (const k of keysToTest) {
    const r = await testSingleProviderKey(prov, k, req.path);
    const isSuccess = r.status === 'ok' || r.status === 'active' || r.status === 'warning';
    if (r.status !== 'unsupported') {
      keyPoolManager.recordResult(prov, k, isSuccess, r.latency, isSuccess ? undefined : r.message);
    }
    results.push(r);
  }

  if (results[0].status === 'unsupported') {
    return res.json({ status: 'unsupported', latency: 0, message: results[0].message, results });
  }

  if (results.length === 1) {
    const single = results[0];
    const status = single.status === 'ok' || single.status === 'active' ? 'active' : single.status === 'warning' ? 'warning' : single.status === 'rate_limited' ? 'rate_limited' : 'invalid';
    return res.json({
      status,
      latency: single.latency,
      message: single.message,
      results,
    });
  }

  const allOk = results.every((r) => r.status === 'ok' || r.status === 'active');
  const hasOk = results.some((r) => r.status === 'ok' || r.status === 'active' || r.status === 'warning');
  const summaryMsg = `共测试 ${results.length} 个密钥：\n` + results.map((r) => `• [${r.maskedKey}]: ${r.message} (${r.latency}ms)`).join('\n');
  const avgLatency = Math.round(results.reduce((acc, r) => acc + r.latency, 0) / results.length);
  return res.json({
    status: allOk ? 'active' : hasOk ? 'warning' : 'invalid',
    latency: avgLatency,
    message: summaryMsg,
    results,
  });
});

// Balance & Quota Query Endpoint
// Only POST may trigger balance checks (a cross-site <img> can only send GET).
app.all('/api/cloud-keys/balances', (req, res, next) => {
  if (req.method === 'POST') return next();
  res.setHeader('Allow', 'POST');
  return res.status(405).json({ error: 'Method Not Allowed: /api/cloud-keys/balances 仅接受 POST 请求' });
});

app.post('/api/cloud-keys/balances', requireAdminAuth, checkSecFetchSite, async (_req, res) => {
  const balances: Record<string, any> = {};

  // Parallel checks for providers
  await Promise.allSettled([
    // Fal.ai
    (async () => {
      const falKey = keyPoolManager.getNextKey('fal');
      if (falKey) {
        try {
          const falTest = await falReadOnlyKeyCheck(falKey, '/api/cloud-keys/balances');
          if (falTest.balance) {
            balances.fal = { status: 'ok', detail: `Fal.ai 余额: ${falTest.balance}` };
          } else {
            // Non-admin keys cannot read billing; report honestly instead of claiming "额度充足".
            balances.fal = { status: 'unknown', detail: falTest.message };
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
            // Item 12: no request is made here, so we can't claim 'ok'
            balances.gemini = { status: 'unknown', detail: 'Gemini Key 已配置（未发起请求，无法确认额度；请用「测试连接」）' };
          }
        } catch (e: any) {
          balances.gemini = { status: 'error', detail: e.message };
        }
      }
    })(),

    // Agnes AI
    (async () => {
      const agnesKey = keyPoolManager.getNextKey('agnes');
      if (agnesKey) {
        const { baseUrl, error: urlErr } = getProviderBaseUrl('agnes');
        if (urlErr) {
          balances.agnes = { status: 'error', detail: urlErr };
          return;
        }
        try {
          const resp = await upstreamFetch(
            { provider: 'agnes', route: '/api/cloud-keys/balances', model: 'models', key: agnesKey },
            `${baseUrl}/models`,
            {
              headers: { Authorization: `Bearer ${agnesKey}` },
            }
          );
          if (resp.ok) {
            balances.agnes = { status: 'ok', detail: 'key 可用（该服务商无余额接口 / 未能核实余额接口）' };
          } else {
            const errBody = await resp.text().catch(() => '');
            balances.agnes = { status: 'error', detail: `Agnes AI 状态码 [${resp.status}]: ${errBody.slice(0, 150)}` };
          }
        } catch (e: any) {
          balances.agnes = { status: 'error', detail: e.message };
        }
      }
    })(),

    // SenseNova
    (async () => {
      const snKey = keyPoolManager.getNextKey('sensenova');
      if (snKey) {
        const { baseUrl, error: urlErr } = getProviderBaseUrl('sensenova');
        if (urlErr) {
          balances.sensenova = { status: 'error', detail: urlErr };
          return;
        }
        try {
          const resp = await upstreamFetch(
            { provider: 'sensenova', route: '/api/cloud-keys/balances', model: 'models', key: snKey },
            `${baseUrl}/models`,
            {
              headers: { Authorization: `Bearer ${snKey}` },
            }
          );
          if (resp.ok) {
            balances.sensenova = { status: 'ok', detail: 'key 可用（该服务商无余额接口 / 未能核实余额接口）' };
          } else {
            const errBody = await resp.text().catch(() => '');
            balances.sensenova = { status: 'error', detail: `商汤日日新 状态码 [${resp.status}]: ${errBody.slice(0, 150)}` };
          }
        } catch (e: any) {
          balances.sensenova = { status: 'error', detail: e.message };
        }
      }
    })(),

    // OpenAI 兼容中转 / Grok 兼容中转：无官方余额接口 → unknown，不声称 ok。
    (async () => {
      for (const [prov, label] of [
        ['openai_compat', 'OpenAI 兼容中转'],
        ['grok_compat', 'Grok 兼容中转'],
      ] as const) {
        const k = keyPoolManager.getNextKey(prov);
        if (!k) continue;
        const { error: urlErr } = getProviderBaseUrl(prov);
        if (urlErr) {
          balances[prov] = { status: 'error', detail: urlErr };
          continue;
        }
        balances[prov] = { status: 'unknown', detail: `${label} Key 已配置（该服务商无余额接口 / 未能核实余额接口；请用「测试连接」打 GET /models）` };
      }
    })(),

    // ModelScope CN & AI
    (async () => {
      const msKey = keyPoolManager.getNextKey('modelscope');
      if (msKey) {
        // Item 12: key presence only — no request made, so status is unknown, not ok
        balances.modelscope = { status: 'unknown', detail: '魔搭国内站 Key 已配置（未查询额度）' };
      }
      const msAiKey = keyPoolManager.getNextKey('modelscope_ai');
      if (msAiKey) {
        balances.modelscope_ai = { status: 'unknown', detail: '魔搭国际站 Key 已配置（未查询额度）' };
      }
    })(),

    // Tensor.Art
    (async () => {
      const taKey = keyPoolManager.getNextKey('tensorart');
      if (taKey) {
        try {
          await fetchTensorArtToolsList(taKey);
          balances.tensorart = { status: 'ok', detail: 'key 可用（该服务商无余额接口 / 未能核实余额接口）' };
        } catch (e: any) {
          balances.tensorart = { status: 'error', detail: e.message };
        }
      }
    })(),

    // NanoGPT
    (async () => {
      const nanoKey = keyPoolManager.getNextKey('nanogpt');
      if (nanoKey) {
        try {
          const resp = await upstreamFetch(
            { provider: 'nanogpt', route: '/api/cloud-keys/balances', key: nanoKey },
            'https://api.nano-gpt.com/api/check-balance',
            { method: 'POST', headers: { 'x-api-key': nanoKey } }
          );
          if (resp.ok) {
            const bal = await resp.json().catch(() => ({}));
            balances.nanogpt = { status: 'ok', detail: `NanoGPT 余额: $${bal.usd_balance ?? '?'}` };
          } else {
            const errBody = await resp.text().catch(() => '');
            balances.nanogpt = { status: 'error', detail: `NanoGPT 状态码 [${resp.status}]: ${errBody.slice(0, 150)}` };
          }
        } catch (e: any) {
          balances.nanogpt = { status: 'error', detail: e.message };
        }
      }
    })(),

    // Hugging Face
    (async () => {
      const hfKey = keyPoolManager.getNextKey('huggingface');
      if (hfKey) {
        try {
          const resp = await upstreamFetch(
            { provider: 'huggingface', route: '/api/cloud-keys/balances', model: 'whoami-v2', key: hfKey },
            'https://huggingface.co/api/whoami-v2',
            {
              headers: { 'Authorization': `Bearer ${hfKey}` },
            }
          );
          if (resp.ok) {
            balances.huggingface = { status: 'ok', detail: 'key 可用（该服务商无余额接口 / 未能核实余额接口）' };
          } else {
            const errBody = await resp.text().catch(() => '');
            balances.huggingface = { status: 'error', detail: `Hugging Face 状态码 [${resp.status}]: ${errBody.slice(0, 150)}` };
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

const MAX_HISTORY_ITEM_BYTES = 500 * 1024; // 500KB

app.post('/api/history', (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: '请求体必须为有效的 JSON 对象' });
  }

  // Check single item payload size limit
  const bodyString = JSON.stringify(req.body);
  if (Buffer.byteLength(bodyString, 'utf8') > MAX_HISTORY_ITEM_BYTES) {
    return res.status(413).json({
      error: '单条历史记录体积超过上限 (最大 500KB)',
    });
  }

  const {
    url,
    imageUrl,
    videoUrl,
    mediaType,
    prompt,
    negativePrompt,
    provider,
    model,
    seed,
    steps,
    cfg,
    loras,
    workflowSnapshot,
  } = req.body;

  // Type validation
  if (url !== undefined && typeof url !== 'string') {
    return res.status(400).json({ error: '字段 url 必须为字符串' });
  }
  if (imageUrl !== undefined && typeof imageUrl !== 'string') {
    return res.status(400).json({ error: '字段 imageUrl 必须为字符串' });
  }
  if (videoUrl !== undefined && typeof videoUrl !== 'string') {
    return res.status(400).json({ error: '字段 videoUrl 必须为字符串' });
  }

  const effectiveUrl =
    (typeof url === 'string' && url.trim()) ||
    (typeof imageUrl === 'string' && imageUrl.trim()) ||
    (typeof videoUrl === 'string' && videoUrl.trim());

  if (!effectiveUrl) {
    return res.status(400).json({ error: '缺少有效的媒体链接 (url / imageUrl / videoUrl)' });
  }

  if (prompt !== undefined && typeof prompt !== 'string') {
    return res.status(400).json({ error: '字段 prompt 必须为字符串' });
  }
  if (negativePrompt !== undefined && typeof negativePrompt !== 'string') {
    return res.status(400).json({ error: '字段 negativePrompt 必须为字符串' });
  }
  if (provider !== undefined && typeof provider !== 'string') {
    return res.status(400).json({ error: '字段 provider 必须为字符串' });
  }
  if (model !== undefined && typeof model !== 'string') {
    return res.status(400).json({ error: '字段 model 必须为字符串' });
  }
  if (seed !== undefined && typeof seed !== 'number') {
    return res.status(400).json({ error: '字段 seed 必须为数字' });
  }
  if (steps !== undefined && typeof steps !== 'number') {
    return res.status(400).json({ error: '字段 steps 必须为数字' });
  }
  if (cfg !== undefined && typeof cfg !== 'number') {
    return res.status(400).json({ error: '字段 cfg 必须为数字' });
  }
  if (mediaType !== undefined && typeof mediaType !== 'string') {
    return res.status(400).json({ error: '字段 mediaType 必须为字符串' });
  }
  if (loras !== undefined) {
    if (!Array.isArray(loras)) {
      return res.status(400).json({ error: '字段 loras 必须为数组' });
    }
    for (let i = 0; i < loras.length; i++) {
      const l = loras[i];
      if (!l || typeof l !== 'object' || Array.isArray(l)) {
        return res.status(400).json({ error: `字段 loras[${i}] 必须为对象` });
      }
    }
  }
  if (workflowSnapshot !== undefined && (typeof workflowSnapshot !== 'object' || workflowSnapshot === null)) {
    return res.status(400).json({ error: '字段 workflowSnapshot 必须为对象' });
  }

  // Construct sanitized item with only whitelisted fields
  const item: GeneratedItem = {
    id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: Date.now(),
    url: effectiveUrl,
    ...(typeof imageUrl === 'string' && imageUrl.trim() ? { imageUrl: imageUrl.trim() } : {}),
    ...(typeof videoUrl === 'string' && videoUrl.trim() ? { videoUrl: videoUrl.trim() } : {}),
    mediaType: typeof mediaType === 'string' && mediaType.trim() ? mediaType.trim() : (videoUrl ? 'video' : 'image'),
    prompt: typeof prompt === 'string' && prompt.trim() ? prompt.trim() : null,
    negativePrompt: typeof negativePrompt === 'string' && negativePrompt.trim() ? negativePrompt.trim() : null,
    provider: typeof provider === 'string' && provider.trim() ? provider.trim() : null,
    model: typeof model === 'string' && model.trim() ? model.trim() : null,
    seed: typeof seed === 'number' ? seed : null,
    steps: typeof steps === 'number' ? steps : null,
    cfg: typeof cfg === 'number' ? cfg : null,
    ...(Array.isArray(loras) ? { loras } : {}),
    ...(workflowSnapshot && typeof workflowSnapshot === 'object' ? { workflowSnapshot } : {}),
  };

  generationHistory.unshift(item);
  // Keep last MAX_HISTORY_COUNT items on server
  if (generationHistory.length > MAX_HISTORY_COUNT) {
    generationHistory.splice(MAX_HISTORY_COUNT);
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
const ALLOWED_SETTINGS_SECRET = new Set([
  'falKey',
  'agnesKey',
  'sensenovaKey',
  'civitaiToken',
  'civitaiKey',
  'hfToken',
  'modelscopeToken',
  'modelscopeAiToken',
  'nanogptKey',
  'tensorartKey',
  'geminiKey',
  'openaiCompatKey',
  'grokCompatKey',
]);

const ALLOWED_SETTINGS_PLAIN = new Set([
  'agnesBaseUrl',
  'sensenovaBaseUrl',
  'openaiCompatBaseUrl',
  'grokCompatBaseUrl',
]);

const ALLOWED_SETTINGS = new Set([...ALLOWED_SETTINGS_SECRET, ...ALLOWED_SETTINGS_PLAIN]);

const isSecretKeyField = (fieldName: string): boolean => {
  if (ALLOWED_SETTINGS_SECRET.has(fieldName)) return true;
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

  // 1. 字段白名单校验
  for (const field of Object.keys(req.body)) {
    if (!ALLOWED_SETTINGS.has(field)) {
      return res.status(400).json({ error: `不支持的设置字段: "${field}"` });
    }
  }

  // 2. 类型检查：值必须为字符串
  for (const [field, val] of Object.entries(req.body)) {
    if (val !== undefined && typeof val !== 'string') {
      return res.status(400).json({ error: `字段 "${field}" 的值必须为字符串` });
    }
  }

  // 3. 处理更新：空字符串/undefined 视为「不修改」；拒绝掩码格式的值或等于当前掩码值的输入
  const updates: Record<string, string> = {};
  for (const [field, val] of Object.entries(req.body)) {
    if (val === undefined || (typeof val === 'string' && val.trim() === '')) {
      continue; // 空字符串/undefined 视为不修改
    }
    const trimmedVal = (val as string).trim();
    if (ALLOWED_SETTINGS_SECRET.has(field)) {
      if (/^.{2,4}(\.\.\.|\*\*\*).{2,4}$/.test(trimmedVal) || trimmedVal.includes('...') || trimmedVal.includes('***')) {
        return res.status(400).json({ error: `拒绝保存掩码值到字段 "${field}"，请提供真实完整密钥或留空表示不修改` });
      }
      const currentVal = cloudSettings[field];
      if (typeof currentVal === 'string' && currentVal.trim()) {
        const currentMasked = keyPoolManager.maskKey(currentVal.trim());
        if (trimmedVal === currentMasked) {
          return res.status(400).json({ error: `拒绝保存与当前掩码相同的值到字段 "${field}"` });
        }
      }
    }
    updates[field] = trimmedVal;
  }

  cloudSettings = {
    ...cloudSettings,
    ...updates,
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

  const HOST = '127.0.0.1';
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`[ComfyCanvas Studio] Server listening on 127.0.0.1:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
