import {registerSchemaProviderRoutes,makeSchemaProviderReader,fetchSchemaProviderRows,normalizeSchemaProviderItems,resolveSchemaRefs} from './src/server/schemaProviders.ts';
import { buildModelScopeImagePayload } from './src/server/modelScopeImageContract';
import { MODELSCOPE_REGIONS, buildLoraListRequest, parseLoraListResponse } from './src/server/modelScopeLoraList.ts';
import {isHuggingFaceLora} from './src/utils/hfResource.ts';
import {isLoraWeightResource} from './src/utils/isLoraWeightResource.ts';
import {buildCivitaiVideoInput} from './src/schemas/civitaiVideo.ts';
import express from 'express';
import { AsyncLocalStorage } from 'node:async_hooks';
import { describeKeySelection, keyUsagesFromTrace, type KeyUsage } from './src/server/keyUsage.ts';
import { sanitizeGenerationMetadata } from './src/utils/generationMetadata.ts';
import { applyCustomParameters, parseCustomObject } from './src/server/customParameters.ts';
import { runWithBillingKeyRotate, buildKeyRotationPayload, type KeyAttemptRecord } from './src/server/billingKeyRotate.ts';
import { persistGeneratedImages, normalizeGeneratedImages } from './src/server/multiImageHistory.ts';
import { collectCivitaiImageOutputs } from './src/server/civitaiOutputs.ts';
import { buildZImagePayload } from './src/schemas/zImageSpace.ts';
import { buildModelScopeLoras } from './src/schemas/modelScopeLoras.ts';
import { buildTensorModelJob, tensorModelId, validateTensorModelDimensions, TENSOR_MODEL_API } from './src/schemas/tensorModelApi.ts';
import { isOpenWorksAccessKey, pickTamsBearerKey, parseTensorArtKeys, TAMS_BEARER_REQUIRED_HINT } from './src/schemas/tensorArtCredentials.ts';
import { registerOpenWorksRoutes } from './src/server/openWorksProvider.ts';
import {buildNanoImagePayload} from './src/schemas/nanoImageApi.ts';
import { registerSenseNovaRoutes } from './src/server/routes/sensenovaRoutes.ts';
import {buildRunwareImageRequest, parseRunwareImageResponse} from './src/server/runwareImageContract.ts';
import {buildModelsLabImageRequest, parseModelsLabResponse, buildModelsLabFetchRequest, sanitizeModelsLabPayload} from './src/server/modelsLabImageContract.ts';
import {falImageFieldGate} from './src/server/falImageContract.ts';
import {buildCivitaiImageRequest, CivitaiAmbiguousError} from './src/server/civitaiImageContract.ts';
import {civitaiImageHistory} from './src/server/civitaiHistoryContract.ts';
import { handleCivitaiModels, handleHuggingFaceModelInfo, handleTensorArtModelInfo, handleCredentialPresence, handleCivitaiModelDetail, handleCivitaiModelVersion } from './src/server/routes/civitaiModelRoutes.ts';
import { handleExtractCivitaiWorkflow } from './src/server/routes/civitaiWorkflowRoute.ts';
import { registerReplicateRoutes } from './src/server/routes/replicateRoutes.ts';
import { registerVideoGenerateRoutes } from './src/server/routes/videoGenerateRoute.ts';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fieldOptions, getFieldSpec, getModelSpec, modelStatus, valueStatus, type FieldKey, type Provider as SchemaProvider } from './src/schemas/providerSchema.ts';
import {
  extractCompatImageUrl,
  normalizeGrokCompatBaseUrl,
  normalizeOpenAICompatBaseUrl,
  resolveAgainstBaseOrigin,
} from './src/engines/compatRelay.ts';
import { enrichPoolStatsWithServerBaseUrl } from './src/utils/poolStatsEnrich.ts';
import { mapSampler, mapScheduler, resolveImportedNegativePrompt, resolveImportedCheckpointRef, resolveRawImportNegativeSamplerScheduler } from './src/utils/civitaiImportMap.ts';
import { persistRemoteUrlAsDataUrl as persistRemoteUrlAsDataUrlRaw, requireDurableHistoryMediaUrl as requireDurableHistoryMediaUrlRaw } from './src/utils/persistMediaAsDataUrl.ts';
import { createMediaStore } from './src/server/mediaStore.ts';
import { buildFailedAttemptHistoryItem, buildLocalRejectionHistoryItem, buildPrefetchFailureHistoryItem, isGenerationRoute } from './src/server/failedAttemptHistory.ts';
import {MEDIA_INPUT_ROUTES, MEDIA_SANDBOX_CSP, storageError} from './src/server/mediaContract.ts';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

dotenv.config();

// Configure undici global dispatcher to extend headersTimeout to 5 minutes (prevents UND_ERR_HEADERS_TIMEOUT on long Civitai GPU renders)
setGlobalDispatcher(
  new EnvHttpProxyAgent({
    headersTimeout: 300000,
    bodyTimeout: 300000,
    connectTimeout: 30000,
    ...(process.env.CANVAS_PROXY_CA ? {requestTls:{ca:fs.readFileSync(process.env.CANVAS_PROXY_CA)}} : {}),
  })
);

process.on('unhandledRejection', (reason) => {
  console.error('[ComfyCanvas Studio] Unhandled Promise Rejection:', reason);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const requestOriginOf = (req: express.Request): 'browser' | 'direct' => String(req.headers['x-canvas-origin'] || '') === 'browser-ui' ? 'browser' : 'direct';
const generationContext = new AsyncLocalStorage<{ workflowSnapshot?: Record<string, unknown>; route: string; schemaFields?: string[]; requestOrigin?: 'browser' | 'direct'; traces: any[]; submissions: Array<{ endpoint: string; parameters: unknown; status: number }> }>();
/** Route declares the endpoint's Schema field wires for this request, so every history record (success or failure) can tell 该端点不支持 from Schema 未记录. */
const declareSchemaFields = (fields: unknown) => { const c = generationContext.getStore(); if (c && Array.isArray(fields)) c.schemaFields = fields.map(String); };
app.set('case sensitive routing', true);
const cliPortIndex=process.argv.indexOf('--port');
if(cliPortIndex>=0) process.env.PORT=process.argv[cliPortIndex+1];
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
  /** Catalog / Schema reads sent as POST (e.g. OpenWorks /tool/list) — not a generation request. */
  readOnly?: boolean;
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
        keyUsage: meta.key ? keyPoolManager.describeKey(meta.provider, meta.key) : null,
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
  let receivedStatus:number | undefined;
  try {
    const res = await fetch(url, init);
    receivedStatus=res.status;
    const trace = generationContext.getStore();
    if (trace) {
      const contentType = res.headers.get('content-type') || '';
      const responseBody = !res.ok || /json|text|event-stream/.test(contentType)
        ? await res.clone().text().catch(() => '') : `[${contentType || 'binary'}]`;
      trace.traces.push({provider:meta.provider, model:meta.model, ...(meta.readOnly?{readOnly:true}:{}), method:init?.method || 'GET', endpoint:sanitizeGenerationMetadata(url), requestBody:typeof init?.body==='string' ? sanitizeGenerationMetadata((()=>{try{return JSON.parse(init.body as string)}catch{return init.body}})()) : undefined, status:res.status, statusText:res.statusText, responseBody:meta.key?responseBody.split(meta.key).join('[credential redacted]'):responseBody,maskedKey:meta.key?maskSecret(meta.key):undefined, keyUsage:meta.key?keyPoolManager.describeKey(meta.provider, meta.key):undefined, durationMs:Date.now()-startedAt, startedAt:new Date(startedAt).toISOString()});
    }
    const provenance = generationContext.getStore();
    if (provenance && init?.method === 'POST' && typeof init.body === 'string' && !/\/tool\/list|\/task\/query|\/file\//.test(url)) {
      try { provenance.submissions.push({endpoint: sanitizeGenerationMetadata(url), parameters: sanitizeGenerationMetadata(JSON.parse(init.body)), status: res.status}); } catch { /* Non-JSON bodies have no verified parameter metadata. */ }
    }
    let error: string | undefined;
    if (!res.ok) {
      error = `HTTP ${res.status}: ${await res.clone().text().catch(() => '')}`;
    }
    logUpstream(meta, upstream, res.status, startedAt, error);
    return res;
  } catch (e: any) {
    if(receivedStatus!==undefined){e.status=receivedStatus;e.errorSource='upstream-protocol';}
    generationContext.getStore()?.traces.push({provider:meta.provider,model:meta.model,...(meta.readOnly?{readOnly:true}:{}),endpoint:sanitizeGenerationMetadata(url),method:init?.method || 'GET',status:receivedStatus ?? null,keyUsage:meta.key?keyPoolManager.describeKey(meta.provider, meta.key):undefined,error:e?.message,stack:e?.stack,cause:e?.cause?{message:e.cause.message,code:e.cause.code}:undefined,durationMs:Date.now()-startedAt, startedAt:new Date(startedAt).toISOString()});
    logUpstream(meta, upstream, receivedStatus ?? 0, startedAt, e?.message || String(e));
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
async function upstreamSdkCall<T>(meta: UpstreamMeta & { upstream: string; parameters?:unknown }, fn: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    const out = await fn();
    if (meta.parameters) generationContext.getStore()?.submissions.push({endpoint:meta.upstream,parameters:sanitizeGenerationMetadata(meta.parameters),status:200});
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
  '/api/schema-provider/muapi/submit',
  '/api/schema-provider/wavespeed/submit',
  '/api/schema-provider/sogni/submit',
  '/api/schema-provider/krea/submit',
  '/api/schema-provider/together/submit',
  '/api/schema-provider/aimlapi/submit',
  '/api/schema-provider/novita/submit',
  '/api/schema-provider/venice/submit',
  '/api/schema-provider/openworks/submit',
  '/api/schema-provider/muapi/save-result',
  '/api/schema-provider/wavespeed/save-result',
  '/api/schema-provider/sogni/save-result',
  '/api/schema-provider/krea/save-result',
  '/api/schema-provider/together/save-result',
  '/api/schema-provider/aimlapi/save-result',
  '/api/schema-provider/novita/save-result',
  '/api/schema-provider/venice/save-result',
  '/api/schema-provider/openworks/save-result',
  '/api/fal/generate',
  '/api/engine/fal/generate',
  '/api/generate',
  '/api/video/generate',
  '/api/engine/video/generate',
  '/api/engine/civitai/generate',
  '/api/civitai/generate',
  '/api/engine/agnes/generate',
  '/api/agnes/generate',
  '/api/engine/sensenova/generate',
  '/api/sensenova/generate',
  '/api/engine/runware/generate',
  '/api/engine/modelslab/generate',
  '/api/engine/replicate/generate',
  '/api/replicate/generate',
  '/api/media',
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
const EXTRA_HOSTS = (process.env.ALLOWED_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean);
const EXTRA_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`, ...EXTRA_HOSTS, ...(PORT===4173?[`terminal.local:${PORT}`]:[])]);
const ALLOWED_ORIGINS = new Set([`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`, ...EXTRA_ORIGINS, ...(PORT===4173?[`http://terminal.local:${PORT}`]:[])]);

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
app.use((req, res, next) => {
  if (!isApiPath(req.path)) return next();
  try { parseCustomObject(req.body?.custom_parameters); }
  catch (error: any) {
    const payload = {error:error.message,errorSource:'local'};
    // Only a user's run from the canvas UI writes a local-rejection card; scripts / smoke checks / non-UI calls never do.
    if (req.method !== 'POST' || !isGenerationRoute(req.path) || requestOriginOf(req) !== 'browser') return res.status(400).json(payload);
    // Local rejection before any upstream call — still history (未出站，本地拦截).
    return void recordHistoryItem({...buildLocalRejectionHistoryItem(req.path, sanitizeGenerationMetadata(req.body), 400, payload), requestOrigin: requestOriginOf(req)} as any)
      .then(item => res.status(400).json({...payload, historyItem: item}))
      .catch((e:any) => res.status(400).json({...payload, historyWarning:`本地拦截记录写入历史失败：${e?.message || e}`}));
  }
  const snapshot = req.body?.workflowSnapshot;
  if (snapshot !== undefined && (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot))) return res.status(400).json({error: 'workflowSnapshot 必须为对象',errorSource:'local'});
  // Canvas frontend tags its own requests (tracedFetch → x-canvas-origin: browser-ui); anything else is a direct call (curl / script) → 「本机直调」.
  const context = {route:req.path,requestOrigin:requestOriginOf(req),submissions:[],traces:[],workflowSnapshot:snapshot ? sanitizeGenerationMetadata(snapshot) : undefined};
  const json = res.json.bind(res);
  res.json = ((body:any) => {
    // Route-provided provenance (before the middleware fills defaults) — history must mirror it.
    const routeProvenance = body && typeof body==='object' && !Array.isArray(body)
      ? {errorSource: typeof body.errorSource==='string' ? body.errorSource : undefined, upstreamStatus: typeof body.upstreamStatus==='number' ? body.upstreamStatus : undefined}
      : undefined;
    if (body && typeof body==='object' && !Array.isArray(body)) {
      body.executionTrace=context.traces;
      if (req.path !== '/api/models' && Object.entries(body).some(([k,v]:any)=>k!=='executionTrace' && v?.error))body.ok=false;
      if (res.statusCode>=400 || (req.path !== '/api/models' && body.ok===false)) {
        body.errorSource ||= context.traces.some((t:any)=>t.status>=400) ? 'upstream' : context.traces.some((t:any)=>t.status===null) ? 'network' : 'local';
        body.stack ||= new Error(body.error || 'Request failed').stack;
      }
    }
    const isFailure = body && typeof body==='object' && !Array.isArray(body) && (res.statusCode>=400 || body.ok===false) && req.method==='POST' && !/^\/api\/history/.test(req.path);
    const failedItem = isFailure
      ? (buildFailedAttemptHistoryItem(context, req.body, res.statusCode, body)
        ?? (isGenerationRoute(req.path) && context.requestOrigin === 'browser' ? buildLocalRejectionHistoryItem(req.path, sanitizeGenerationMetadata(req.body), res.statusCode, body, routeProvenance) : null))
      : null;
    const recorded = failedItem
      ? generationContext.run(context, () => recordHistoryItem(failedItem as any)).then(item => {body.historyItem ||= item;}).catch((e:any) => {body.historyWarning = `失败记录写入历史失败：${e?.message || e}`;})
      : Promise.resolve();
    void recorded.then(() => externalizeMedia(body)).then(stored => json(stored)).catch(next);
    return res;
  }) as typeof res.json;
  return generationContext.run(context,next);
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

// MEDIA-STORE-BEGIN (the hosting build swaps this block for R2-backed storage)
const mediaStore = createMediaStore(path.join(DATA_DIR, 'media'));
const externalizeMedia = async <T,>(value: T): Promise<T> => mediaStore.externalize(value);
const resolveStoredMedia = <T,>(value: T): T => mediaStore.resolveInput(value);
app.use((req, _res, next) => {
  try {
    if (req.method === 'POST' && MEDIA_INPUT_ROUTES.test(req.path)) req.body = resolveStoredMedia(req.body);
    next();
  } catch (error) {next(error);}
});
app.post('/api/media', (req, res, next) => {
  const dataUrl = req.body?.dataUrl;
  if (typeof dataUrl !== 'string') return res.status(400).json({ error: '字段 dataUrl 必须为 image/video/audio 的 base64 data URL', errorSource: 'local' });
  try {return res.json({url:mediaStore.saveDataUrl(dataUrl)});} catch (error: any) {
    if (error.errorSource === 'storage') return next(error);
    return res.status(400).json({error:error.message,errorSource:'local',stack:error.stack});
  }
});
const serveStoredMedia = (raw: boolean): express.RequestHandler => (req, res, next) => {
  try {
    const located = raw ? mediaStore.locateRaw(String(req.params.hash)) : mediaStore.locate(String(req.params.hash));
    if (!located) return res.status(404).json({error:'媒体不存在',errorSource:'local'});
    res.setHeader('Content-Type', raw ? 'application/octet-stream' : located.contentType);
    res.setHeader('Cache-Control','private, max-age=86400, immutable');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',MEDIA_SANDBOX_CSP);
    if (raw) res.setHeader('Content-Disposition','attachment');
    return res.sendFile(located.file,{acceptRanges:true},error => {if (error) next(storageError(error));});
  } catch (error) {next(error);}
};
app.get('/api/media/raw/:hash',serveStoredMedia(true));
app.get('/api/media/:hash',serveStoredMedia(false));
// MEDIA-STORE-END

// Generated media is stored once as a file and referenced by a short /api/media URL,
// so history, canvas state, API responses and browser storage never carry base64 payloads.
const requireDurableHistoryMediaUrl: typeof requireDurableHistoryMediaUrlRaw = async (remoteUrl) => {
  const result = await requireDurableHistoryMediaUrlRaw(remoteUrl);
  return result.ok ? { ...result, dataUrl: await externalizeMedia(result.dataUrl) } : result;
};
const persistRemoteUrlAsDataUrl: typeof persistRemoteUrlAsDataUrlRaw = async (remoteUrl) => {
  const result = await persistRemoteUrlAsDataUrlRaw(remoteUrl);
  return result ? externalizeMedia(result) : result;
};

// In-memory history and active configuration
interface GeneratedItem {
  status?: 'failed' | 'local_blocked';
  upstreamStatus?: number | null;
  upstreamResponseBody?: string | null;
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
  sampler?: string | null;
  scheduler?: string | null;
  width?: number | null;
  height?: number | null;
  loras?: Array<{ name: string; strength: number; civitaiId?: string }>;
  timestamp: number;
  workflowSnapshot?: any;
  requestMetadata?: any;
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
  const temporary = `${filePath}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(data,null,2),{encoding:'utf8',flag:'wx'});
    fs.renameSync(temporary,filePath);
  } catch (error) {throw storageError(error);} finally {
    try {fs.unlinkSync(temporary);} catch (error: any) {if (error.code !== 'ENOENT') throw storageError(error);}
  }
};

let cloudProjects: CloudProject[] = readJsonFile<CloudProject[]>(PROJECTS_FILE, []);
let generationHistory: GeneratedItem[] = readJsonFile<GeneratedItem[]>(HISTORY_FILE, []);
let cloudSettings: Record<string, any> = readJsonFile<Record<string, any>>(SETTINGS_FILE, {});

const migrateStoredMedia = <T,>(label: string, file: string, items: T[]): T[] => {
  const result = mediaStore.migrateItems(items);
  if (result.migrated > 0) {
    try {fs.copyFileSync(file,`${file}.bak-before-media-migration`,fs.constants.COPYFILE_EXCL);} catch (error: any) {
      if (error.code !== 'EEXIST') throw storageError(error);
      try {fs.copyFileSync(file,`${file}.bak-before-media-migration.${crypto.randomUUID()}`,fs.constants.COPYFILE_EXCL);} catch (error) {throw storageError(error);}
    }
    writeJsonFile(file, result.items);
    console.log(`[media] ${label}: ${result.migrated} 个内联 base64 已迁移为 /api/media 文件（备份 ${path.basename(file)}.bak-before-media-migration）`);
  }
  return result.items;
};
generationHistory = migrateStoredMedia('history', HISTORY_FILE, generationHistory);
cloudProjects = migrateStoredMedia('projects', PROJECTS_FILE, cloudProjects);

const TENSORART_KEY_ENV_SOURCE = (['TENSORART_API_KEY', 'TENSORART_KEY', 'TENSORART'] as const).find((n) => String(process.env[n] || '').trim()) || '';
const defaultKeys: Record<string, string> = {
  muapiKey: process.env.MUAPI_KEY || '',
  wavespeedKey: process.env.WAVESPEED_KEY || '',
  sogniKey: process.env.SOGNI_KEY || '',
  kreaKey: process.env.KREA_API_KEY || '',
  togetherKey: process.env.TOGETHER_API_KEY || '',
  aimlapiKey: process.env.AIMLAPI_KEY || '',
  novitaKey: process.env.NOVITA_API_KEY || '',
  veniceKey: process.env.VENICE_API_KEY || '',
  // Traceable: TENSORART_KEY_ENV_SOURCE records which env name supplied the key (first non-empty of the chain).
  tensorartKey: process.env.TENSORART_API_KEY || process.env.TENSORART_KEY || process.env.TENSORART || '',
  tensorartBaseUrl: process.env.TENSORART_BASE_URL || '',
  agnesKey: process.env.AGNES_API_KEY || process.env.AGNES_KEY || '',
  sensenovaKey: process.env.SENSENOVA_KEY || '',
  falKey: process.env.FAL_KEY || '',
  civitaiKey: process.env.CIVITAI_API_KEY || '',
  nanogptKey: process.env.NANOGPT_KEY || '',
  nanogptBaseUrl: process.env.NANOGPT_BASE_URL || '',
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
  runwareKey: process.env.RUNWARE_API_KEY || process.env.RUNWARE_KEY || '',
  runwareBaseUrl: process.env.RUNWARE_BASE_URL || '',
  modelslabKey: process.env.MODELSLAB_API_KEY || process.env.MODELSLAB_KEY || '',
  modelslabBaseUrl: process.env.MODELSLAB_BASE_URL || '',
  replicateKey: process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY || '',
  replicateBaseUrl: process.env.REPLICATE_BASE_URL || '',
};

// Pool key sources per provider: settings.json fields (in order), then the defaultKeys (env) field.
const POOL_KEY_FIELDS: Record<string, { settings: string[]; env: string }> = {
  muapi: {settings:['muapiKey'],env:'muapiKey'},
  wavespeed: {settings:['wavespeedKey'],env:'wavespeedKey'},
  sogni: {settings:['sogniKey'],env:'sogniKey'},
  krea: {settings:['kreaKey'],env:'kreaKey'},
  together: {settings:['togetherKey'],env:'togetherKey'},
  aimlapi: {settings:['aimlapiKey'],env:'aimlapiKey'},
  novita: {settings:['novitaKey'],env:'novitaKey'},
  venice: {settings:['veniceKey'],env:'veniceKey'},
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
  runware: { settings: ['runwareKey'], env: 'runwareKey' },
  modelslab: { settings: ['modelslabKey'], env: 'modelslabKey' },
  replicate: { settings: ['replicateKey'], env: 'replicateKey' },
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
  private strategies: Map<string, 'round_robin'> = new Map();
  // Last header-supplied rotation list per provider (memory only) so a header key's position can be reported.
  private headerLists: Map<string, string[]> = new Map();

  /** Position of `key` in the rotation list it was taken from (index + count only). null when unknown. */
  public describeKey(prov: string, key: string): KeyUsage | null {
    return describeKeySelection(prov, key, this.headerLists.get(prov) || [], 'header')
      ?? describeKeySelection(prov, key, this.getKeys(prov), 'pool');
  }

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

  public setStrategy(prov: string, strategy: 'round_robin') {
    this.strategies.set(prov, strategy);
  }

  public getStrategy(prov: string): 'round_robin' {
    return 'round_robin';
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
      this.headerLists.set(prov, customKeys);
      if (customKeys.length > 1) {
        const idx = (this.roundRobinPointers.get(`header_${prov}`) || 0) % customKeys.length;
        this.roundRobinPointers.set(`header_${prov}`, idx + 1);
        return customKeys[idx];
      }
      if (customKeys.length === 1) return customKeys[0];
    }

    const pool = this.pools.get(prov) || [];
    if (pool.length === 0) return '';

    const now = Date.now();
    pool.forEach((k) => {
      if (k.status === 'rate_limited' && k.rateLimitResetAt && now > k.rateLimitResetAt) {
        k.status = 'active';
        k.consecutiveFailures = 0;
      }
    });

    // Selection is deliberately independent of prior failures. A failed/limited key may remain marked in stats,
    // but the system must not silently route a later request to a different account because of that failure.
    let ptr = this.roundRobinPointers.get(prov) || 0;
    const selected = pool[ptr % pool.length];
    this.roundRobinPointers.set(prov, (ptr + 1) % pool.length);

    selected.lastUsed = now;
    selected.totalCalls++;
    return selected.key;
  }


  /**
   * Keys to try for one request. Single x-*-token/key header = pinned (no rotate).
   * Multi header or env/settings pool = ordered list starting at current round-robin pointer.
   * Advances the pointer once (same as getNextKey) for the first candidate.
   */
  public getAttemptKeys(prov: string, customHeaderKey?: string): { keys: string[]; pinned: boolean } {
    if (customHeaderKey) {
      const customKeys = Array.from(new Set(this.parseKeyString(customHeaderKey)));
      this.headerLists.set(prov, customKeys);
      if (customKeys.length === 1) return { keys: customKeys, pinned: true };
      if (customKeys.length > 1) {
        const ptr = this.roundRobinPointers.get(`header_${prov}`) || 0;
        const ordered = customKeys.map((_, i) => customKeys[(ptr + i) % customKeys.length]);
        this.roundRobinPointers.set(`header_${prov}`, (ptr + 1) % customKeys.length);
        return { keys: ordered, pinned: false };
      }
    }

    const pool = this.pools.get(prov) || [];
    if (pool.length === 0) return { keys: [], pinned: false };

    const now = Date.now();
    pool.forEach((k) => {
      if (k.status === 'rate_limited' && k.rateLimitResetAt && now > k.rateLimitResetAt) {
        k.status = 'active';
        k.consecutiveFailures = 0;
      }
    });

    let ptr = this.roundRobinPointers.get(prov) || 0;
    const ordered = pool.map((_, i) => pool[(ptr + i) % pool.length].key);
    const unique = Array.from(new Set(ordered));
    this.roundRobinPointers.set(prov, (ptr + 1) % pool.length);

    const selected = pool.find((e) => e.key === unique[0]);
    if (selected) {
      selected.lastUsed = now;
      selected.totalCalls++;
    }
    return { keys: unique, pinned: false };
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
const recordHistoryItem = async (rawItem: Partial<GeneratedItem>): Promise<GeneratedItem> => {
  const item = rawItem;
  const provenance = generationContext.getStore();
  const fullItem: GeneratedItem = await externalizeMedia({
    ...item,
    ...(provenance?.requestOrigin && !(item as any).requestOrigin ? {requestOrigin: provenance.requestOrigin} : {}),
    ...(provenance ? {workflowSnapshot: provenance.workflowSnapshot, requestMetadata: {...(provenance.schemaFields && !Array.isArray((item.requestMetadata as any)?.schemaFields) ? {schemaFields: provenance.schemaFields} : {}),...item.requestMetadata,route: provenance.route, submissions: provenance.submissions,...(()=>{const own=(item.requestMetadata as any)?.executionTrace;const trace=Array.isArray(own) && own.length?[...own,...provenance.traces.filter((t:any)=>!own.includes(t))]:provenance.traces;return {executionTrace:trace,keyUsages:keyUsagesFromTrace(trace)};})()}} : {}),
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
    sampler: typeof item.sampler === 'string' && item.sampler.trim() ? item.sampler.trim() : null,
    scheduler: typeof item.scheduler === 'string' && item.scheduler.trim() ? item.scheduler.trim() : null,
    width: typeof item.width === 'number' ? item.width : null,
    height: typeof item.height === 'number' ? item.height : null,
    loras: Array.isArray(item.loras) ? item.loras : [],
  });
  const nextHistory = [fullItem,...generationHistory].slice(0,MAX_HISTORY_COUNT);
  writeJsonFile(HISTORY_FILE,nextHistory);
  generationHistory = nextHistory;
  return fullItem;
};

// Persist every returned image; the canvas shows the first, history retains the entire batch.
// Persist the full upstream image list (each with its own format, seed and model), show the first on the canvas,
// and report every image that could not be stored with its real stage and source instead of failing the batch.
async function respondWithGeneratedImages(
  res: express.Response,
  images: unknown[],
  metadata: Partial<GeneratedItem> & Record<string, any>,
  options: { label: string; outputFormat?: string; response?: Record<string, unknown> },
) {
  const result = await persistGeneratedImages(images, metadata, {persist: requireDurableHistoryMediaUrl, record: recordHistoryItem}, {outputFormat: options.outputFormat});
  if (!result.first) {
    const failure = result.transientOutputs[0];
    const status = failure?.stage === 'response' ? 502 : failure?.errorSource === 'storage' || failure?.errorSource === 'local' ? 500 : 502;
    return res.status(status).json({
      error: `${options.label} 返回 ${images.length} 张图片，但没有任何一张保存成功：${failure?.error || '未返回图片'}`,
      errorSource: failure?.errorSource || 'upstream',
      ...(failure?.status != null ? {persistStatus: failure.status} : {}),
      ...(failure?.url ? {transientMediaUrl: failure.url} : {}),
      transientOutputs: result.transientOutputs,
      ...options.response,
    });
  }
  return res.json({
    ...options.response,
    imageUrl: result.first.url,
    mediaUrl: result.first.url,
    mediaType: 'image',
    historyItem: result.first,
    historyItems: result.historyItems,
    transientOutputs: result.transientOutputs,
    ...(result.historyWarning ? {historyWarning: result.historyWarning} : {}),
  });
}

async function recordAdditionalImages(images: any[], first: GeneratedItem, options: { outputFormat?: string } = {}) {
  const {id, timestamp, url, ...metadata} = first;
  const rest = await persistGeneratedImages(images, metadata, {persist: requireDurableHistoryMediaUrl, record: recordHistoryItem}, {...options, skipIndexes: [0]});
  return {historyItems: [first, ...rest.historyItems], transientOutputs: rest.transientOutputs, ...(rest.historyWarning ? {historyWarning: rest.historyWarning} : {})};
}

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
// Key: header (comma-separated rotates) > pool (settings + env, comma-separated). Base URL: header > settings > env > verified official default (only where declared below).
// A custom base URL requires a custom key — server keys are never sent to a user-supplied host.
type AuthProvider = 'agnes' | 'sensenova' | 'openai_compat' | 'grok_compat' | 'runware' | 'modelslab' | 'replicate' | 'nanogpt';
const AUTH_META: Record<AuthProvider, { headerPrefix: string; settingsBaseName: string; envName: string; keyEnvName?: string; defaultBaseUrl?: string }> = {
  agnes: { headerPrefix: 'x-agnes', settingsBaseName: 'agnesBaseUrl', envName: 'AGNES', keyEnvName: 'AGNES_API_KEY', defaultBaseUrl: 'https://apihub.agnes-ai.com/v1' },
  sensenova: { headerPrefix: 'x-sensenova', settingsBaseName: 'sensenovaBaseUrl', envName: 'SENSENOVA', defaultBaseUrl: 'https://token.sensenova.cn/v1' },
  openai_compat: { headerPrefix: 'x-openai-compat', settingsBaseName: 'openaiCompatBaseUrl', envName: 'OPENAI_COMPAT_IMAGE' },
  grok_compat: { headerPrefix: 'x-grok-compat', settingsBaseName: 'grokCompatBaseUrl', envName: 'GROK_COMPAT' },
  runware: { headerPrefix: 'x-runware', settingsBaseName: 'runwareBaseUrl', envName: 'RUNWARE', keyEnvName: 'RUNWARE_API_KEY', defaultBaseUrl: 'https://api.runware.ai/v1' },
  modelslab: { headerPrefix: 'x-modelslab', settingsBaseName: 'modelslabBaseUrl', envName: 'MODELSLAB', keyEnvName: 'MODELSLAB_API_KEY', defaultBaseUrl: 'https://modelslab.com' },
  replicate: { headerPrefix: 'x-replicate', settingsBaseName: 'replicateBaseUrl', envName: 'REPLICATE', keyEnvName: 'REPLICATE_API_TOKEN', defaultBaseUrl: 'https://api.replicate.com/v1' },
  nanogpt: { headerPrefix: 'x-nanogpt', settingsBaseName: 'nanogptBaseUrl', envName: 'NANOGPT', keyEnvName: 'NANOGPT_KEY', defaultBaseUrl: 'https://api.nano-gpt.com/api/v1' },
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
  const { headerPrefix, settingsBaseName, envName, keyEnvName, defaultBaseUrl } = AUTH_META[provider];

  const customBaseUrl = (req.headers[`${headerPrefix}-base-url`] as string)?.trim() || '';
  const customKey = (req.headers[`${headerPrefix}-key`] as string)?.trim() || '';

  if (customBaseUrl && !customKey) {
    return { apiKey: '', baseUrl: '', error: `使用自定义 base URL (${headerPrefix}-base-url) 时必须同时提供自定义 API Key (${headerPrefix}-key)，禁止回退使用服务端密钥。` };
  }
  const baseUrl = normalizeAuthBaseUrl(
    provider,
    String(customBaseUrl || cloudSettings[settingsBaseName] || defaultKeys[settingsBaseName] || defaultBaseUrl || ''),
  );
  if (!baseUrl) {
    return { apiKey: '', baseUrl: '', error: `未配置 ${provider} Base URL（${envName}_BASE_URL / 设置面板 / ${headerPrefix}-base-url）。` };
  }
  const apiKey = keyPoolManager.getNextKey(provider, customKey || undefined);
  if (!apiKey) {
    return { apiKey: '', baseUrl, error: `未配置 ${provider} API 密钥（${keyEnvName || `${envName}_KEY`} / 设置面板 / ${headerPrefix}-key）。` };
  }
  return { apiKey, baseUrl };
}

// Server-side base URL only (settings > env) — never from request headers, since callers use pool keys.
function getProviderBaseUrl(provider: AuthProvider): { baseUrl: string; error?: string } {
  const { settingsBaseName, envName, defaultBaseUrl } = AUTH_META[provider];
  const baseUrl = normalizeAuthBaseUrl(
    provider,
    String(cloudSettings[settingsBaseName] || defaultKeys[settingsBaseName] || defaultBaseUrl || ''),
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

/** Default ap-east-1; console / settings tensorartBaseUrl overrides (origin or …/v1). */
function resolveTamsModelApiOrigin(): string {
  const override = String(cloudSettings['tensorartBaseUrl'] || defaultKeys['tensorartBaseUrl'] || '')
    .trim()
    .replace(/\/+$/, '');
  if (!override) return TENSOR_MODEL_API;
  return override.replace(/\/v1$/i, '') || TENSOR_MODEL_API;
}

// Dedicated Real Live Model Detail Resolution for Tensor.Art / 吐司
async function fetchTensorArtModelInfo(modelId: string, apiKey?: string) {
  const cleanId = tensorModelId(modelId);
  const key =
    pickTamsBearerKey(apiKey, keyPoolManager.getKeys('tensorart'), defaultKeys.tensorartKey) ||
    '';
  if (!key) {
    const anyKey = pickTamsBearerKey(apiKey) === null && (parseTensorArtKeys(apiKey).length > 0 || keyPoolManager.getKeys('tensorart').some(isOpenWorksAccessKey));
    throw Object.assign(
      new Error(anyKey
        ? '当前配置的是 OpenWorks Access Key (ak_tensor_...)，不能用于 TAMS 模型 API 查询。画布模型查询需要 TAMS Bearer Key（可在 https://tams.tensor.art/app 获取）。'
        : '缺少 TAMS 模型 API Key'),
      { status: 400, details: TAMS_BEARER_REQUIRED_HINT, exactEndpointCalled: `${resolveTamsModelApiOrigin()}/v1/models/${cleanId}` }
    );
  }
  if (isOpenWorksAccessKey(key)) {
    throw Object.assign(
      new Error('当前配置的是 OpenWorks Access Key (ak_tensor_...)，不能用于 TAMS 模型 API 查询。画布模型查询需要 TAMS Bearer Key（可在 https://tams.tensor.art/app 获取）。'),
      { status: 400, details: TAMS_BEARER_REQUIRED_HINT }
    );
  }
  const response = await upstreamFetch(
    { provider: 'tensorart', route: 'model-info', model: cleanId, key },
    `${resolveTamsModelApiOrigin()}/v1/models/${cleanId}`,
    { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) }
  );
  if (!response.ok) {
    throw Object.assign(
      new Error(`Tensor.Art 模型 API [${response.status}]: ${await response.text()}。需要 TAMS 模型 API Key，OpenWorks Access Key 不能作为模型授权`),
      { status: response.status }
    );
  }
  const raw = (await response.json()).model;
  if (!raw?.id || !raw.modelType || !raw.baseModel) {
    throw Object.assign(new Error('Tensor.Art 模型 API 未返回完整模型 ID、类型或架构'), { status: 502 });
  }
  const isLora = ['LORA', 'LOCON', 'LYCORIS', 'DORA'].includes(raw.modelType);
  return {
    id: raw.id,
    name: raw.name,
    provider: 'Tensor.Art',
    category: isLora ? 'LoRA' : raw.modelType === 'CHECKPOINT' ? 'Checkpoint' : raw.modelType,
    type: raw.modelType,
    baseModel: raw.baseModel,
    imageUrl: raw.showcaseImageUrls?.[0] || '',
    trainedWords: raw.triggerWords ? [raw.triggerWords] : [],
    externalUrl: `https://tensor.art/models/${raw.id}`,
    description: raw.description,
    generationStatus: 'metadata_verified',
    tags: ['tensorart', isLora ? 'lora' : 'checkpoint', raw.baseModel.toLowerCase()],
  };
}

// ==========================================
// 1. Civitai API Proxies (developer.civitai.com)
// ==========================================
const civitaiCache = new Map<string, { data: any; expiry: number; nextCursor?: string | null }>();

app.get('/api/civitai/models', handleCivitaiModels({ getSettings: () => cloudSettings, defaultKeys, upstreamFetch }));
app.get('/api/huggingface/model-info', handleHuggingFaceModelInfo({ getSettings: () => cloudSettings, defaultKeys, upstreamFetch }));
app.get('/api/tensorart/model-info', handleTensorArtModelInfo({ getSettings: () => cloudSettings, defaultKeys, upstreamFetch }));
app.get('/api/credential-presence', handleCredentialPresence({ getSettings: () => cloudSettings, defaultKeys, upstreamFetch }));

/** cleanup-2026-10-17: per-provider configured:true/false only — NEVER returns key material.
 * Driven by POOL_KEY_FIELDS (same pool the generate routes use). Client-supplied keys arrive as the usual x-*-key / x-*-token headers.
 * Display names are resolved on the client via friendlyProviderLabel — this endpoint only reports ids + configured. */
app.get('/api/provider-key-status', (req, res) => {
  const headerFor = (prov: string): string => {
    if (prov === 'huggingface') return 'x-hf-token';
    if (prov === 'modelscope') return 'x-modelscope-token';
    if (prov === 'modelscope_ai') return 'x-modelscope-ai-token';
    return `x-${prov.replace(/_/g, '-')}-key`;
  };
  const providers: Record<string, { configured: boolean }> = {};
  for (const prov of Object.keys(POOL_KEY_FIELDS)) {
    const custom = String(req.headers[headerFor(prov)] || '').trim();
    providers[prov] = { configured: Boolean(keyPoolManager.getNextKey(prov, custom || undefined)) };
  }
  res.json({ providers });
});
app.get('/api/civitai/model/:id', handleCivitaiModelDetail({ getSettings: () => cloudSettings, defaultKeys, upstreamFetch }));
app.get(['/api/civitai/model-version/:id', '/api/civitai/model-version'], handleCivitaiModelVersion({ getSettings: () => cloudSettings, defaultKeys, upstreamFetch }));

// ==========================================
// 1.2. Civitai URL / Image / Model / Raw Text to Workflow Extractor (Modular Route)
// ==========================================
app.post('/api/civitai/extract-workflow', handleExtractCivitaiWorkflow({ getSettings: () => cloudSettings, defaultKeys, upstreamFetch }));

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

  // Prefer metadata helper: Fal/NanoGPT/etc. endpoint catalogs must NOT treat
  // id/name containing "lora" (e.g. fal-ai/krea-2/turbo/lora) as LoRA *weights*.
  const isLora =
    !isVideo &&
    !isEdit &&
    isLoraWeightResource({ id, name, tags }, providerName);

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

  // Tensor.Art provider rows are TAMS numeric-ID lookups; a non-numeric id is never a TAMS checkpoint / LoRA.
  if (providerName === 'Tensor.Art' && !/^\d{10,25}$/.test(String(id || '').trim())) {
    if (category === 'Checkpoint' || category === 'LoRA') {
      category = 'Edit';
      type = 'Tools';
    }
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
    baseModel = isLora ? '未核实底模' : isVideo ? 'Diffusers Video' : 'Diffusers Checkpoint';
  } else if (providerName.includes('ModelScope')) {
    baseModel = isLora ? '未核实底模' : isVideo ? 'ModelScope Video' : 'ModelScope Checkpoint';
  } else if (providerName === 'Fal.ai') {
    baseModel = isLora ? '未核实底模' : isVideo ? 'Video Base' : 'Diffusion Base';
  } else if (providerName === 'NanoGPT') {
    baseModel = isLora ? '未核实底模' : isVideo ? 'Video Base' : 'NanoGPT Base';
  } else if (providerName === 'Tensor.Art') {
    baseModel = isLora ? '未核实底模' : isVideo ? 'Video Base' : '未核实底模';
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
    cleanDisplayName = 'Wan 2.7 旗舰大模型';
  } else if (idLower === 'strong_text2image_nano_banana2') {
    cleanDisplayName = 'Nano Banana 2 文生图大模型';
  } else if (idLower === 'photoreal_studio_z_image') {
    cleanDisplayName = 'Z-Image 极致超写真大模型';
  } else if (idLower === 'anime_lab_wai_illustrious') {
    cleanDisplayName = 'WAI Illustrious 二次元动漫';
  } else if (idLower === 'three_view_flux_kontext') {
    cleanDisplayName = 'FLUX Kontext 三视图角色设计';
  } else if (idLower === 'oc_character_illustration') {
    cleanDisplayName = 'OC 原创角色插画';
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
    badge = isLora ? 'Tensor.Art LoRA' : isVideo ? 'Tensor.Art 视频' : 'Tensor.Art 模型';
  } else if (providerName.includes('Google')) {
    badge = category === 'Checkpoint' ? 'Gemini Image' : 'Gemini 原生';
  }

  return { baseModel, category, type, badge, cleanDisplayName };
}

// ==========================================
// 1.5. Dynamic Model List Pulling (Direct from Original APIs)
// ==========================================
const openWorks = registerOpenWorksRoutes(app as any,{fetch:upstreamFetch as any,resolveKey:(req)=>{const h=String(req.headers['x-openworks-key']||req.headers['x-tensorart-key']||'').trim();if(h)return h;return [...keyPoolManager.getKeys('tensorart'),...parseTensorArtKeys(String(defaultKeys.tensorartKey||'')),...parseTensorArtKeys(String(cloudSettings['tensorartKey']||''))].map((k:any)=>String(typeof k==='string'?k:k?.key||'').trim()).find((k:string)=>isOpenWorksAccessKey(k)||k.startsWith('ak_tusi'))||'';},keySource:(req)=>{const h=String(req.headers['x-openworks-key']||req.headers['x-tensorart-key']||'').trim();if(h)return req.headers['x-openworks-key']?'请求头 x-openworks-key':'请求头 x-tensorart-key（设置页 tensorartKey 槽）';const pick=(k:any)=>{const s=String(typeof k==='string'?k:k?.key||'').trim();return isOpenWorksAccessKey(s)||s.startsWith('ak_tusi');};if(keyPoolManager.getKeys('tensorart').some(pick)){const pooled=keyPoolManager.getKeys('tensorart').map((k:any)=>String(typeof k==='string'?k:k?.key||'').trim()).find((s:string)=>pick(s));const envKeys=parseTensorArtKeys(String(defaultKeys.tensorartKey||''));const ei=pooled?envKeys.indexOf(pooled):-1;return ei>=0?`Key 池 tensorart（env ${TENSORART_KEY_ENV_SOURCE||'TENSORART_*'} 第 ${ei+1}/${envKeys.length} 个）`:'Key 池 tensorart（设置页）';}if(parseTensorArtKeys(String(defaultKeys.tensorartKey||'')).some(pick))return `env ${TENSORART_KEY_ENV_SOURCE||'TENSORART_*'}`;return '设置文件 tensorartKey';},record:recordHistoryItem,durable:requireDurableHistoryMediaUrl});
registerSchemaProviderRoutes(app,{fetch:upstreamFetch,key:(p,k)=>keyPoolManager.getNextKey(p,k),record:recordHistoryItem,durable:requireDurableHistoryMediaUrl,traces:()=>generationContext.getStore()?.traces || []});

app.get('/api/model-schema', async (req,res)=>{
  try {
    const provider=String(req.query.provider || ''),model=String(req.query.model || '');
    if (provider === 'replicate') {
      let owner = '';
      let name = '';
      if (model.includes('/')) {
        const parts = model.split('/');
        owner = parts[0];
        name = parts[1].split(':')[0];
      }
      if (!owner || !name) {
        return res.status(400).json({ error: 'Replicate 模型格式必须为 owner/name', provider, model });
      }
      const repBase = String(req.headers['x-replicate-base-url'] || cloudSettings['replicateBaseUrl'] || defaultKeys['replicateBaseUrl'] || '').trim().replace(/\/+$/, '');
      const endpoint = repBase ? `${repBase}/models/${encodeURIComponent(owner)}/${encodeURIComponent(name)}` : `https://api.replicate.com/v1/models/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
      const key = keyPoolManager.getNextKey('replicate', req.headers['x-replicate-key'] as string);
      const response = await upstreamFetch(
        { provider: 'replicate', route: req.path, model, key },
        endpoint,
        {
          headers: key ? { Authorization: `Bearer ${key}`, Accept: 'application/json' } : { Accept: 'application/json' },
          signal: AbortSignal.timeout(30000),
        }
      );
      if (!response.ok) return res.status(response.status).json({ error: `HTTP ${response.status}`, details: await response.text(), endpoint });
      const data = await response.json();
      const openapi = data.latest_version?.openapi_schema;
      // Generic OpenAPI $ref/allOf resolution against the same document (e.g. aspect_ratio: allOf:[{$ref:'#/components/schemas/aspect_ratio'}]).
      const inputSchema = openapi?.components?.schemas?.Input ? resolveSchemaRefs(openapi.components.schemas.Input, openapi) : null;
      return res.json({ provider, model, source: endpoint, inputSchema, openapi });
    }
    if(provider!=='fal'){
      const spec = getModelSpec(provider as SchemaProvider, model);
      if (spec) {
        return res.json({ provider, model, source: spec.source, inputSchema: { type: 'object', properties: spec.fields }, fields: spec.fields });
      }
      const fallbackDocSource = provider === 'huggingface'
        ? 'https://huggingface.co/docs/inference-providers/tasks/text-to-image'
        : (provider === 'modelscope' || provider === 'modelscope_ai')
        ? 'https://www.modelscope.cn/docs/model-service/API-Inference/intro'
        : null;
      return res.json({ provider, model, source: fallbackDocSource, inputSchema: null, note: '此处尚未取得该模型的机器可读 Schema；自定义 JSON 会原样提交，由上游返回参数结果。' });
    }
    const endpoint=`https://api.fal.ai/v1/models?endpoint_id=${encodeURIComponent(model)}&expand=openapi-3.0`;
    const key=keyPoolManager.getNextKey('fal',req.headers['x-fal-key'] as string);
    const response=await upstreamFetch({provider,route:req.path,model,key},endpoint,{headers:key?{Authorization:`Key ${key}`}:{},signal:AbortSignal.timeout(30000)});
    if(!response.ok)return res.status(response.status).json({error:`HTTP ${response.status}`,details:await response.text(),endpoint});
    const data=await response.json();const record=data.models?.find((m:any)=>m.endpoint_id===model);
    const schema=record?.openapi || record?.['openapi-3.0'] || record?.openapi_schema;
    if(!schema)return res.status(502).json({error:'上游未返回所选模型的 OpenAPI',details:data,endpoint});
    const input:any=Object.values(schema.paths || {}).map((p:any)=>p.post?.requestBody?.content?.['application/json']?.schema).find(Boolean);
    const inputSchema=input?.$ref ? schema.components?.schemas?.[input.$ref.split('/').pop()] : input;
    res.json({provider,model,source:endpoint,inputSchema,openapi:schema});
  }catch(error:any){res.status(500).json({error:error.message,stack:error.stack});}
});

app.get("/api/models", async (req, res) => {
  const { provider = "all", query = "", type = "" } = req.query;
  const rawCat = (req.query.category || req.query.cat || "").toString().toLowerCase();
  const rawSearch = (query || "").toString().trim();
  const searchStr = rawSearch.toLowerCase();
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
    const catalogNoticesAccum: Record<string, string> = {};
    const pagination: Record<string, { nextCursor?: string | null; page?: number; limit?: number; total?: number; hasMore: boolean; sourceUrl?: string; sourceNotice?: string; paging?: string; [k: string]: any }> = {};
    
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
      const providerHint = item.provider || item._sourceProvider || provider;
      // Do NOT drop Checkpoint rows solely because endpoint id contains "lora"
      // (fal-ai/krea-2/turbo/lora, fal-ai/flux-lora are gen endpoints that accept LoRA).
      if (cat === "lora") return isLoraWeightResource(item, providerHint);
      if (cat === "checkpoint") {
        if (isLoraWeightResource(item, providerHint)) return false;
        return (itemCat === "checkpoint" || itemType === "checkpoint" || itemCat === "base") && itemCat !== "video" && !itemId.includes("video");
      }
      if (cat === "video") return itemCat === "video" || itemType === "motionmodule" || (item.tags && item.tags.includes("video")) || itemId.includes("video");
      if (cat === "edit") return itemCat === "edit" || itemCat === "controlnet" || itemCat === "tools" || itemCat === "reasoning" || item.id.includes("edit") || item.id.includes("remover") || item.id.includes("upscaler") || item.id.includes("restore");
      return true;
    };

    const tasks: Promise<void>[] = [];

    // 1. ModelScope CN (魔搭社区国内站 - modelscope.cn) Real-Time Live OpenAPI Fetching
    if (provider === "all" || provider === "modelscope") {
      tasks.push((async () => {
        const msCnCatalog: any[] = [];
        try {
          let msSearch = rawSearch;
          if (!msSearch) {
            msSearch = cat === 'lora' ? 'lora' : cat === 'video' ? 'video' : 'diffusion';
          } else if (archFilter && !msSearch.includes(archFilter)) {
            msSearch = `${msSearch} ${archFilter}`;
          }
          const msSort = sortParam.toLowerCase().includes('like') ? 'likes' : sortParam.toLowerCase().includes('new') ? 'last_modified' : 'downloads';
          const msUrl = `https://modelscope.cn/openapi/v1/models?page_size=${Math.min(limitParam,50)}&page_number=${pageParam}&sort=${msSort}&search=${encodeURIComponent(msSearch)}`;
          const msResp = await upstreamFetch(
            { provider: 'modelscope_cn', route: req.path, model: msSearch },
            msUrl,
            { headers: {Authorization:`Bearer ${keyPoolManager.getNextKey('modelscope',req.headers['x-modelscope-token'] as string) || ''}`}, signal: AbortSignal.timeout(30000) }
          );
          if (msResp.ok) {
            const msData = await msResp.json();
            const items = msData?.data?.models || [];

            pagination.modelscope = {
              page: pageParam,
              hasMore: pageParam*Math.min(limitParam,50)<Math.min(msData?.data?.total_count ?? Infinity,3000) && items.length>=Math.min(limitParam,50),
            };

            items.forEach((m: any, idx: number) => {
              const meta = extractModelMetadata(m.id, m.display_name, m.tags || [], m.description || '', (m.tasks || []).join(' '), 'ModelScope CN');
              const realImg = m.cover || m.image_url || '';

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
            results.modelscope = { error: `HTTP ${msResp.status}`, status:msResp.status, details:await msResp.text(),endpoint:msUrl } as any;
          }
        } catch (err: any) {
          console.error("ModelScope CN OpenAPI real-time fetch error:", err);
          results.modelscope = { error: `ModelScope CN 连接失败: ${err.message}` } as any;
        }

        if (!results.modelscope) {
          results.modelscope = msCnCatalog.filter((m) => matchCategory(m) && matchSearch(m));
        }
      })());
    }

    // 1.5 ModelScope AI (魔搭国际站 - modelscope.ai) Real-Time Live OpenAPI Fetching
    if (provider === "all" || provider === "modelscope_ai") {
      tasks.push((async () => {
        const msAiCatalog: any[] = [];
        // LoRA list: the region's own LoRA list endpoint (config-driven); only this site's rows, errors verbatim, no fallback.
        if (cat === 'lora' && MODELSCOPE_REGIONS.modelscope_ai.loraListEndpoint) {
          const cfg = MODELSCOPE_REGIONS.modelscope_ai;
          const size = Math.min(limitParam, 50);
          const { url, init } = buildLoraListRequest(cfg, { name: [rawSearch, archFilter].filter(Boolean).join(' ').trim(), page: pageParam, pageSize: size, sort: sortParam });
          try {
            const r = await upstreamFetch({ provider: 'modelscope_ai', route: req.path, model: 'lora-list' }, url, { ...init, signal: AbortSignal.timeout(30000) });
            const text = await r.text();
            if (!r.ok) { results.modelscope_ai = { error: `HTTP ${r.status}`, status: r.status, details: text, endpoint: url } as any; return; }
            const parsed = parseLoraListResponse(cfg, JSON.parse(text));
            pagination.modelscope_ai = { page: pageParam, hasMore: pageParam * size < parsed.total && parsed.items.length >= size, total: parsed.total } as any;
            results.modelscope_ai = parsed.items;
          } catch (err: any) {
            results.modelscope_ai = { error: `ModelScope AI LoRA 列表失败: ${err.message}`, endpoint: url } as any;
          }
          return;
        }
        try {
          let msSearch = rawSearch;
          if (!msSearch) {
            msSearch = cat === 'lora' ? 'lora' : cat === 'video' ? 'video' : 'diffusion';
          } else if (archFilter && !msSearch.includes(archFilter)) {
            msSearch = `${msSearch} ${archFilter}`;
          }
          const msAiSort = sortParam.toLowerCase().includes('like') ? 'likes' : sortParam.toLowerCase().includes('new') ? 'last_modified' : 'downloads';
          const msUrl = `https://www.modelscope.ai/openapi/v1/models?page_size=${Math.min(limitParam,50)}&page_number=${pageParam}&sort=${msAiSort}&search=${encodeURIComponent(msSearch)}`;
          const msResp = await upstreamFetch(
            { provider: 'modelscope_ai', route: req.path, model: msSearch },
            msUrl,
            { headers: {Authorization:`Bearer ${keyPoolManager.getNextKey('modelscope_ai',req.headers['x-modelscope-ai-token'] as string) || ''}`}, signal: AbortSignal.timeout(30000) }
          );
          if (msResp.ok) {
            const msData = await msResp.json();
            const items = msData?.data?.models || [];

            pagination.modelscope_ai = {
              page: pageParam,
              hasMore: pageParam*Math.min(limitParam,50)<Math.min(msData?.data?.total_count ?? Infinity,3000) && items.length>=Math.min(limitParam,50),
            };

            items.forEach((m: any, idx: number) => {
              const meta = extractModelMetadata(m.id, m.display_name, m.tags || [], m.description || '', (m.tasks || []).join(' '), 'ModelScope AI');
              const realImg = m.cover || m.image_url || '';

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
            results.modelscope_ai = { error: `HTTP ${msResp.status}`, status:msResp.status, details:await msResp.text(),endpoint:msUrl } as any;
          }
        } catch (err: any) {
          const isTimeout = err.name === 'TimeoutError' || err.message?.includes('timeout') || err.message?.includes('aborted');
          console.warn(`[Models Discovery] ModelScope AI 获取${isTimeout ? '超时 (15s)' : '异常'}:`, err.message);
          results.modelscope_ai = { error: isTimeout ? 'ModelScope AI 接口请求超时 (超过 15 秒)' : `ModelScope AI 连接失败: ${err.message}` } as any;
        }

        if (!results.modelscope_ai) {
          results.modelscope_ai = msAiCatalog.filter((m) => matchCategory(m) && matchSearch(m));
        }
      })());
    }

    // 2. Hugging Face Real-Time Live API Proxy with Dynamic Image Resolution & True Metadata
    if (provider === "all" || provider === "huggingface") {
      tasks.push((async () => {
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
        hfParams.append("expand[]", "inferenceProviderMapping");
        if(req.query.inferenceProvider) hfParams.set("inference_provider",String(req.query.inferenceProvider));

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
            hfParams.append("filter", "lora");
            hfParams.append("filter", "diffusers");
          } else {
            // When searching by keyword or architecture, search broadly across all LoRAs
            hfParams.append("filter", "lora");
          }
        } else if (cat === "edit") {
          hfParams.append("pipeline_tag", "image-to-image");
        } else if (cat === "checkpoint") {
          hfParams.append("pipeline_tag", "text-to-image");
        }

        const hfToken = keyPoolManager.getNextKey('huggingface',req.headers['x-hf-token'] as string) || '';

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
              const exactUrl = `https://huggingface.co/api/models/${rawSearch.split('/').map(encodeURIComponent).join('/')}?expand[]=siblings&expand[]=tags&expand[]=likes&expand[]=pipeline_tag&expand[]=author&expand[]=cardData`;
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

            const isLoraModel = isHuggingFaceLora(m);

            return {
              id: m.id,
              name: meta.cleanDisplayName,
              provider: "Hugging Face",
              inferenceProviderMapping: m.inferenceProviderMapping,
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
            return matchCategory(m) && matchSearch(m);
          });
        } else {
          results.huggingface = { error: `HTTP ${hfResp.status}`,status:hfResp.status,details:await hfResp.text(),endpoint:hfUrl } as any;
        }
      } catch (err: any) {
        const isTimeout = err.name === 'TimeoutError' || err.message?.includes('timeout') || err.message?.includes('aborted');
        console.warn(`[Models Discovery] Hugging Face 获取${isTimeout ? '超时 (15s)' : '异常'}:`, err.message);
        results.huggingface = { error: isTimeout ? 'Hugging Face API 请求超时 (超过 15 秒)' : `Hugging Face 连接失败: ${err.message}` } as any;
      }
    })());
  }

    // 3. Civitai Real-Time Live API Fetching
    if (provider === "all" || provider === "civitai") {
      tasks.push((async () => {
        try {
          const civitaiTypes: string[] = [];
          if (cat === "checkpoint") civitaiTypes.push("Checkpoint");
          else if (cat === "lora") civitaiTypes.push("LORA");
          else if (cat === "video") civitaiTypes.push("MotionModule");
          else if (cat === "edit") civitaiTypes.push("Controlnet");
          else if (cat === "all") civitaiTypes.push("Checkpoint", "LORA");

          const civitaiSort = sortParam.toLowerCase().includes('rate') || sortParam.toLowerCase().includes('highest')
            ? 'Highest Rated'
            : sortParam.toLowerCase().includes('new')
            ? 'Newest'
            : sortParam.toLowerCase().includes('like')
            ? 'Most Liked'
            : 'Most Downloaded';

          const params = new URLSearchParams({
            limit: String(limitParam),
            sort: civitaiSort,
            nsfw: "false",
          });
          for (const t of civitaiTypes) {
            params.append("types", t);
          }
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
                  baseModel: (m.modelVersions || [])[0]?.baseModel || null,
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
      })());
    }

    // 4. Fal.ai Real-Time Dynamic Models Discovery Endpoint (https://api.fal.ai/v1/models)
    if (provider === "all" || provider === "fal") {
      tasks.push((async () => {
        if (cat === 'lora') {
          results.fal = [];
          pagination.fal = { page: pageParam, hasMore: false, sourceUrl: 'https://api.fal.ai/v1/models', sourceNotice: 'lookup-only (no public lora weight directory)' };
          catalogNoticesAccum.fal = 'Fal.ai 模型目录 (https://api.fal.ai/v1/models) 只列出推理端点，没有公开的 LoRA 权重目录；以 "lora" 搜到的是"可加载 LoRA 的生成端点"，其缩略图是端点示例，不是 LoRA 封面，因此不在 LoRA 目录中展示。请在上方输入 LoRA 权重 URL，并在模型中心选择支持 LoRA 的 Fal 端点。';
        } else {
          const falItems: any[] = [];
          try {
            const falKey = keyPoolManager.getNextKey('fal',req.headers['x-fal-key'] as string) || '';

            const falHeaders: Record<string, string> = {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
              "Accept": "application/json",
            };
            if (falKey) {
              falHeaders['Authorization'] = `Key ${falKey}`;
            }

            // Determine live Fal.ai query URLs based on requested category & search string
            // Official Fal.ai API: search uses `?q=`, category uses `?category=`
            const falParams=new URLSearchParams({limit:String(limitParam),status:'active'});
            if(cursorParam) falParams.set('cursor',cursorParam);
            if(rawSearch) falParams.set('q',rawSearch);
            if(cat==='checkpoint') falParams.set('category','text-to-image');
            if(cat==='video') falParams.set('category','text-to-video');
            if(cat==='edit') falParams.set('category','image-to-image');
            if(cat==='lora' && !rawSearch) falParams.set('q','lora');
            const fetchUrls=[`https://api.fal.ai/v1/models?${falParams}`];

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
                const falData = await respResult.value.json();
                pagination.fal={page:pageParam,nextCursor:falData.next_cursor,hasMore:falData.has_more===true};
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
                    // Fal /api/v1/models lists generation endpoints only — never LoRA weight files.
                    resourceKind: 'model-endpoint',
                  });
                }
              } else if (respResult.status === 'fulfilled') {
                lastErrorStatus = respResult.value.status;
                results.fal={error:`HTTP ${lastErrorStatus}`,status:lastErrorStatus,details:await respResult.value.text(),endpoint:fetchUrls[0]} as any;
              }
            }

            if (!results.fal && !hadSuccessfulResponse && responses.length > 0 && lastErrorStatus > 0) {
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
      })());
    }

    // 5. NanoGPT Real Live Discovery Endpoint (Live OpenAPI: image-models & video-models)
    if (provider === "all" || provider === "nanogpt") {
      tasks.push((async () => {
        const nanoItems: any[] = [];
        // NanoGPT is an inference API provider and does NOT host a community LoRA weights repository.
        if (cat === "lora") {
          results.nanogpt = [];
          pagination.nanogpt = {
            page: 1,
            limit: limitParam,
            total: 0,
            hasMore: false,
            sourceUrl: 'https://nano-gpt.com',
            sourceNotice: 'lookup-only (no public lora directory)',
          };
          catalogNoticesAccum.nanogpt = 'NanoGPT 为在线推理 API 服务商，不托管社区 LoRA 权重；支持在上方输入框按 ID 选用。';
        } else {
          const shouldFetchImage = cat === "all" || cat === "checkpoint" || cat === "edit";
          const shouldFetchVideo = cat === "all" || cat === "video";
          const nanoBase = getProviderBaseUrl('nanogpt');
          if (!nanoBase.baseUrl) {
            results.nanogpt = {
              error: nanoBase.error || '未配置 NanoGPT Base URL',
              status: 400,
              endpoint: '',
              errorSource: 'local',
            } as any;
          } else {
          const nanoV1 = nanoBase.baseUrl.replace(/\/+$/, '');
          const nanoImageModelsUrl = `${nanoV1}/image-models`;
          const nanoVideoModelsUrl = `${nanoV1}/video-models`;
          try {
            const fetchImageModels = shouldFetchImage
              ? upstreamFetch(
                  { provider: 'nanogpt', route: req.path, model: 'image-models' },
                  nanoImageModelsUrl,
                  {
                    headers: { 'User-Agent': 'ComfyCanvas/1.0' },
                    signal: AbortSignal.timeout(10000),
                  }
                )
              : Promise.resolve(null);

            const fetchVideoModels = shouldFetchVideo
              ? upstreamFetch(
                  { provider: 'nanogpt', route: req.path, model: 'video-models' },
                  nanoVideoModelsUrl,
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
                const err: any = new Error(`NanoGPT image-models 失败 [${imgResp.status}]: ${errText.slice(0, 200)}`);
                err.status = imgResp.status;
                err.endpoint = nanoImageModelsUrl;
                err.rawResponse = errText;
                err.errorSource = 'upstream';
                throw err;
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
                  : (m.owned_by && m.owned_by !== 'unknown' ? `https://nano-gpt.com/icons/${m.owned_by.charAt(0).toUpperCase() + m.owned_by.slice(1)}.svg` : '');
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
                const err: any = new Error(`NanoGPT video-models 失败 [${vidResp.status}]: ${errText.slice(0, 200)}`);
                err.status = vidResp.status;
                err.endpoint = nanoVideoModelsUrl;
                err.rawResponse = errText;
                err.errorSource = 'upstream';
                throw err;
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
                  : (m.owned_by && m.owned_by !== 'unknown' ? `https://nano-gpt.com/icons/${m.owned_by.charAt(0).toUpperCase() + m.owned_by.slice(1)}.svg` : '');
                
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
              const rawResponse = imgResp ? await imgResp.text().catch(() => '') : '';
              results.nanogpt = {
                error: `NanoGPT 接口响应异常 (HTTP ${status})`,
                status,
                endpoint: nanoImageModelsUrl,
                rawResponse: rawResponse || null,
                errorSource: 'upstream',
              } as any;
            }
          } catch (err: any) {
            console.error("NanoGPT live models discovery error:", err);
            results.nanogpt = {
              error: `NanoGPT 连接失败: ${err.message}`,
              status: err.status || 502,
              endpoint: err.endpoint || (() => { const b = getProviderBaseUrl('nanogpt').baseUrl; return b ? `${b.replace(/\/+$/, '')}/image-models` : ''; })(),
              rawResponse: err.rawResponse || err.details || null,
              errorSource: err.errorSource || 'network',
              stack: err.stack,
            } as any;
          }

          if (!results.nanogpt) {
            const filtered = nanoItems.filter((m) => matchCategory(m) && matchSearch(m));
            const offset = (pageParam - 1) * limitParam;
            results.nanogpt = filtered.slice(offset, offset + limitParam);
            pagination.nanogpt = {
              page: pageParam,
              limit: limitParam,
              total: filtered.length,
              hasMore: offset + limitParam < filtered.length,
              sourceUrl: nanoV1,
              sourceNotice: 'live-api (image-models & video-models)',
            };
          }
          } // nanoBase.baseUrl
        }
      })());
    }

    // 8. Google Gemini & Imagen Real Dynamic Models Endpoint
    if (provider === "all" || provider === "gemini") {
      tasks.push((async () => {
        const geminiItems: any[] = [];
        try {
          const geminiKey =
            keyPoolManager.getNextKey('gemini', req.headers['x-gemini-key'] as string) ||
            process.env.GEMINI_API_KEY ||
            cloudSettings['geminiKey'] ||
            defaultKeys['geminiKey'] ||
            '';
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
      })());
    }

    // 9. TAMS has no list API (official Integration FAQ); only explicit ID lookup.
    if (provider === "all" || provider === "tensorart" || provider === "tensor") {
      tasks.push((async () => {
        try {
          const numericSearch = searchStr.match(/(?:^|\/models\/)(\d{10,25})(?:$|[/?#])/);
          const taCatalog = numericSearch
            ? {items:[await fetchTensorArtModelInfo(numericSearch[1],resolveTensorArtKey(req))],nextCursor:null,sourceUrl:resolveTamsModelApiOrigin()}
            : {items:[],nextCursor:null,sourceUrl:'https://tams-docs.tensor.art/docs/api/guide/integration-faq/'};
          const taItems=taCatalog.items;
          const filteredTensorItems = taItems.filter((m:any)=> (!searchStr || numericSearch || `${m.name} ${m.baseModel}`.toLowerCase().includes(searchStr.toLowerCase())) && (!archFilter || archFilter==='all' || m.baseModel.toLowerCase().includes(archFilter.toLowerCase())));
          results.tensorart = filteredTensorItems.filter((m: any) => matchCategory(m));
          pagination.tensorart = {
            page: pageParam,
            hasMore: !!taCatalog.nextCursor,
            nextCursor:taCatalog.nextCursor,
            sourceUrl:taCatalog.sourceUrl,
            paging:numericSearch ? 'model-id-lookup' : 'lookup-only',
            catalogAvailable:false,
            message:'TAMS 官方不提供模型列表 API；请在官方模型库选择底模或 LoRA，复制 ID 查询。未发起网页抓取。',
          } as any;
        } catch (taErr: any) {
          console.error("Tensor.Art live models fetch error:", taErr.message);
          results.tensorart = { error: taErr.message,status:taErr.status,details:taErr.details,exactEndpointCalled:taErr.exactEndpointCalled,stack:taErr.stack } as any;
        }

        if (provider === "tensor") {
          results.tensor = results.tensorart;
        }
      })());
    }

    // Tensor.Art OpenWorks: live upstream catalog; image/video entries are ordinary models (src/server/openWorksProvider.ts).
    if (provider === 'openworks') {
      tasks.push((async () => {
        try {
          const { items, sourceUrl } = await openWorks.catalogItems(req as any);
          const filtered = items.filter((m: any) => matchCategory(m) && (!searchStr || `${m.id} ${m.description}`.toLowerCase().includes(searchStr.toLowerCase())));
          results.openworks = filtered;
          pagination.openworks = { page: 1, hasMore: false, sourceUrl, paging: 'full-live-upstream-catalog' } as any;
        } catch (owErr: any) {
          results.openworks = { error: owErr.message, status: owErr.status, details: owErr.rawResponse } as any;
        }
      })());
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

    // Schema-driven providers (MuAPI / WaveSpeed / Sogni) join the "all" aggregation or direct query.
    // Each keeps its own source and error; one provider's failure never drops the others.
    if (provider === "all" || provider === 'muapi' || provider === 'wavespeed' || provider === 'sogni' || provider === 'krea' || provider === 'together' || provider === 'aimlapi' || provider === 'novita' || provider === 'venice') {
      tasks.push((async () => {
        const sps = (provider === 'all' ? ['muapi', 'wavespeed', 'sogni', 'krea', 'together', 'aimlapi', 'novita', 'venice'] : [provider]) as ('muapi' | 'wavespeed' | 'sogni' | 'krea' | 'together' | 'aimlapi' | 'novita' | 'venice')[];
        await Promise.allSettled(
          sps.map(async (sp) => {
            try {
              const spKey = keyPoolManager.getNextKey(sp, undefined) || '';
              const spRead = makeSchemaProviderReader(sp, upstreamFetch, spKey, req.path);
              const wantsLora = cat === 'lora';
              const spRows = await fetchSchemaProviderRows(sp, spRead, { lora: wantsLora });
              const { rows, sourceUrl, notice } = spRows;
              const noLoraCatalog = 'noLoraCatalog' in spRows && spRows.noLoraCatalog === true;
              const spItems = normalizeSchemaProviderItems(sp, rows, {
                lora: wantsLora,
                sourceUrl,
                category: cat === 'all' ? 'checkpoint' : cat,
                query: '',
              });
              const filtered = spItems.filter((m: any) => matchCategory(m) && matchSearch(m));
              results[sp] = filtered.slice((pageParam - 1) * limitParam, pageParam * limitParam);
              const spNotice = sp === 'sogni' && !wantsLora
                ? 'versioned-official-schema-selectors (@sogni-ai/sogni-protocol@1.0.0-alpha.46)'
                : sp === 'sogni' && wantsLora
                ? 'lookup-only (no public lora directory)'
                : 'local-slice-of-live-upstream-catalog';
              pagination[sp] = {
                page: pageParam,
                limit: limitParam,
                total: filtered.length,
                hasMore: pageParam * limitParam < filtered.length,
                sourceUrl,
                sourceNotice: spNotice,
                paging: spNotice,
                // Declared absence of a LoRA catalog → front end shows this provider's own notice, no endpoint.
                ...(noLoraCatalog ? { noLoraCatalog: true, message: notice } : {}),
              };
              if (notice) catalogNoticesAccum[sp] = notice;
            } catch (spErr: any) {
              results[sp] = {
                error: spErr.message,
                status: spErr.status ?? null,
                details: typeof spErr.rawResponse === 'string' ? spErr.rawResponse.slice(0, 500) : spErr.rawResponse,
                endpoint: spErr.endpoint,
              } as any;
            }
          })
        );
      })());
    }

    // Runware live model search or lookup-only notice
    if (provider === 'all' || provider === 'runware') {
      tasks.push((async () => {
        try {
          const runwareKey = (req.headers['x-runware-key'] as string) || keyPoolManager.getNextKey('runware', undefined) || defaultKeys.runwareKey;
          if (!runwareKey) {
            results.runware = [];
            pagination.runware = {
              page: pageParam,
              limit: limitParam,
              total: 0,
              hasMore: false,
              sourceUrl: 'https://docs.runware.ai',
              sourceNotice: 'lookup-only (no api key configured)',
            };
            catalogNoticesAccum.runware = 'Runware 实时模型搜索需要配置 API Key (RUNWARE_API_KEY)；支持直接在上方输入框中输入 AIR 标识符 (如 civitai:xxxx@yyyy 或 runware:xx@y) 按 ID 选用。';
          } else if (!rawSearch) {
            results.runware = [];
            pagination.runware = {
              page: pageParam,
              limit: limitParam,
              total: 0,
              hasMore: false,
              sourceUrl: 'https://docs.runware.ai',
              sourceNotice: 'lookup-only (search query required for live catalog)',
            };
            catalogNoticesAccum.runware = 'Runware 实时模型目录需要搜索关键词；请输入关键词后查询真实上游目录。';
          } else {
            const searchTask = {
              taskType: 'modelSearch',
              taskUUID: crypto.randomUUID(),
              search: rawSearch,
              category: cat === 'lora' ? 'lora' : 'checkpoint',
              limit: limitParam,
              offset: (pageParam - 1) * limitParam,
              ...(archFilter && archFilter !== 'all' ? { architecture: archFilter } : {}),
            };
            const rwBaseUrl = String(req.headers['x-runware-base-url'] || cloudSettings['runwareBaseUrl'] || defaultKeys.runwareBaseUrl || 'https://api.runware.ai/v1').trim().replace(/\/+$/, '');
            const rwResp = await upstreamFetch(
              { provider: 'runware', route: req.path, model: 'modelSearch', key: runwareKey },
              rwBaseUrl,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${runwareKey}`,
                },
                body: JSON.stringify([searchTask]),
                signal: AbortSignal.timeout(8000),
              }
            );
            if (!rwResp.ok) {
              const errText = await rwResp.text().catch(() => '');
              results.runware = {
                error: `Runware 上游请求失败 (${rwResp.status})`,
                status: rwResp.status,
                details: errText.slice(0, 300),
                endpoint: 'https://api.runware.ai/v1',
              } as any;
            } else {
              const rwData = await rwResp.json().catch(() => ({}));
              const taskResult = Array.isArray(rwData?.data) ? rwData.data[0] : null;
              const rawList = Array.isArray(taskResult?.results) ? taskResult.results : [];
              const mapped = rawList.map((r: any) => ({
                id: r.air || r.id || r.name,
                name: r.name || r.air,
                category: 'model',
                provider: 'runware',
                type: r.category === 'lora' || cat === 'lora' ? 'lora' : 'checkpoint',
                architecture: r.architecture || null,
                tags: Array.isArray(r.tags) ? r.tags : [],
                imageUrl: r.heroImage || r.image || r.thumbnail || null,
                description: r.description || (r.air ? `AIR: ${r.air}` : null),
                sourceUrl: typeof r.air === 'string' && r.air.startsWith('civitai:')
                  ? `https://civitai.com/models/${r.air.split(':')[1]?.split('@')[0]}`
                  : 'https://runware.ai',
                rawAir: r.air,
              }));
              const filtered = mapped.filter((m: any) => matchCategory(m) && matchSearch(m));
              results.runware = filtered;
              const total = typeof taskResult?.totalResults === 'number' ? taskResult.totalResults : filtered.length;
              pagination.runware = {
                page: pageParam,
                limit: limitParam,
                total,
                hasMore: pageParam * limitParam < total,
                sourceUrl: 'https://api.runware.ai/v1',
                sourceNotice: 'live-api (modelSearch)',
              };
            }
          }
        } catch (rwErr: any) {
          results.runware = {
            error: rwErr.message || 'Runware 请求失败',
            status: rwErr.status ?? null,
            endpoint: 'https://api.runware.ai/v1',
          } as any;
        }
      })());
    }

    // ModelsLab live models list or lookup-only notice
    if (provider === 'all' || provider === 'modelslab') {
      tasks.push((async () => {
        try {
          if (cat === 'lora') {
            results.modelslab = [];
            pagination.modelslab = {
              page: 1,
              limit: limitParam,
              total: 0,
              hasMore: false,
              sourceUrl: 'https://modelslab.com',
              sourceNotice: 'lookup-only (no public lora directory)',
            };
            catalogNoticesAccum.modelslab = 'ModelsLab 暂无公开 LoRA 实时检索目录；如需使用 LoRA，请在生成节点中直接填入 lora_model ID（或用户微调模型 ID）。';
          } else {
            const modelslabKey = (req.headers['x-modelslab-key'] as string) || keyPoolManager.getNextKey('modelslab', undefined) || defaultKeys.modelslabKey;
            if (!modelslabKey) {
              results.modelslab = [];
              pagination.modelslab = {
                page: pageParam,
                limit: limitParam,
                total: 0,
                hasMore: false,
                sourceUrl: 'https://modelslab.com/api/v4/dreambooth/model_list',
                sourceNotice: 'lookup-only (no api key configured)',
              };
              catalogNoticesAccum.modelslab = 'ModelsLab 官方模型列表需要 API Key (MODELSLAB_API_KEY)；支持直接在上方输入框中输入模型 ID (如 midjourney、anything-v3 等) 按 ID 选用。';
            } else {
              const mlBaseUrl = String(req.headers['x-modelslab-base-url'] || cloudSettings['modelslabBaseUrl'] || defaultKeys.modelslabBaseUrl || 'https://modelslab.com').trim().replace(/\/+$/, '');
              const mlListEndpoint = `${mlBaseUrl}/api/v4/dreambooth/model_list`;
              const mlResp = await upstreamFetch(
                { provider: 'modelslab', route: req.path, model: 'dreambooth/model_list', key: modelslabKey },
                mlListEndpoint,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ key: modelslabKey }),
                  signal: AbortSignal.timeout(15000),
                }
              );
              if (!mlResp.ok) {
                const errText = await mlResp.text().catch(() => '');
                results.modelslab = {
                  error: `ModelsLab 上游请求失败 (${mlResp.status})`,
                  status: mlResp.status,
                  details: errText.slice(0, 300),
                  endpoint: 'https://modelslab.com/api/v4/dreambooth/model_list',
                } as any;
              } else {
                const mlData = await mlResp.json().catch(() => []);
                const rawList = Array.isArray(mlData) ? mlData : [];
                const mapped = rawList.map((m: any) => ({
                  id: m.model_id,
                  name: m.model_name || m.model_id,
                  category: 'checkpoint',
                  provider: 'modelslab',
                  type: 'Checkpoint',
                  imageUrl: m.screenshots || null,
                  description: m.description || null,
                  sourceUrl: `https://modelslab.com/models/${m.model_id}`,
                }));
                const filtered = mapped.filter((m: any) => matchCategory(m) && matchSearch(m));
                const offset = (pageParam - 1) * limitParam;
                results.modelslab = filtered.slice(offset, offset + limitParam);
                pagination.modelslab = {
                  page: pageParam,
                  limit: limitParam,
                  total: filtered.length,
                  hasMore: offset + limitParam < filtered.length,
                  sourceUrl: 'https://modelslab.com/api/v4/dreambooth/model_list',
                  sourceNotice: 'live-api (dreambooth/model_list)',
                };
              }
            }
          }
        } catch (mlErr: any) {
          results.modelslab = {
            error: mlErr.message || 'ModelsLab 请求失败',
            status: mlErr.status ?? null,
            endpoint: 'https://modelslab.com/api/v4/dreambooth/model_list',
          } as any;
        }
      })());
    }

    // Replicate live models discovery (collections/text-to-image with fallback to /v1/models)
    if (provider === "all" || provider === "replicate") {
      tasks.push((async () => {
        const replicateItems: any[] = [];
        try {
          const replicateKey = (req.headers['x-replicate-key'] as string) || keyPoolManager.getNextKey('replicate', undefined) || defaultKeys.replicateKey || process.env.REPLICATE_API_TOKEN || '';
          const replicateBase = (cloudSettings['replicateBaseUrl'] || defaultKeys['replicateBaseUrl'] || 'https://api.replicate.com/v1').replace(/\/+$/, '');
          const repHeaders: Record<string, string> = {
            'User-Agent': 'ComfyCanvas/1.0',
            'Accept': 'application/json',
          };
          if (replicateKey) {
            repHeaders['Authorization'] = `Bearer ${replicateKey}`;
          }

          let collectionModels: any[] = [];
          let collectionFetched = false;

          const collectionSlug = cat === 'video' ? 'text-to-video' : cat === 'lora' ? 'flux-fine-tunes' : 'text-to-image';
          const colEndpoint = `${replicateBase}/collections/${collectionSlug}`;
          const colResp = await upstreamFetch(
            { provider: 'replicate', route: req.path, model: `collection:${collectionSlug}`, key: replicateKey },
            colEndpoint,
            {
              headers: repHeaders,
              signal: AbortSignal.timeout(10000),
            }
          );
          if (colResp.ok) {
            const colData = await colResp.json();
            collectionModels = Array.isArray(colData.models) ? colData.models : [];
            collectionFetched = true;
          } else {
            const rawErr = await colResp.text().catch(() => '');
            results.replicate = {
              error: `Replicate 集合接口响应异常 (HTTP ${colResp.status})${rawErr ? `: ${rawErr}` : ''}`,
              status: colResp.status,
              rawResponse: rawErr,
              endpoint: colEndpoint,
            } as any;
          }

            if (!results.replicate) {
              for (const m of collectionModels) {
                const modelId = m.owner && m.name ? `${m.owner}/${m.name}` : m.id || m.name || '';
                if (!modelId) continue;

                const parsed = extractModelMetadata(
                  modelId,
                  m.name || modelId,
                  [],
                  m.description || '',
                  cat === 'video' ? 'video' : 'text-to-image',
                  'Replicate'
                );

                replicateItems.push({
                  id: modelId,
                  name: m.name ? `${m.owner ? `${m.owner}/` : ''}${m.name}` : parsed.cleanDisplayName,
                  provider: "Replicate",
                  category: cat === 'video' ? 'Video' : cat === 'lora' ? 'LoRA' : 'Checkpoint',
                  type: cat === 'video' ? 'MotionModule' : cat === 'lora' ? 'lora' : 'Checkpoint',
                  baseModel: parsed.baseModel,
                  downloads: typeof m.run_count === 'number' ? m.run_count : undefined,
                  likes: undefined,
                  rating: undefined,
                  speed: "Replicate 官方算力",
                  badge: m.owner || parsed.badge,
                  imageUrl: m.cover_image_url || m.default_example?.output || "",
                  externalUrl: `https://replicate.com/${modelId}`,
                  description: m.description || "",
                  tags: ["replicate", cat === 'video' ? 'video' : cat === 'lora' ? 'lora' : 'checkpoint', parsed.baseModel.toLowerCase()],
                });
              }

              const filtered = replicateItems.filter((m) => matchCategory(m) && matchSearch(m));
              const offset = (pageParam - 1) * limitParam;
              results.replicate = filtered.slice(offset, offset + limitParam);
              pagination.replicate = {
                page: pageParam,
                limit: limitParam,
                total: filtered.length,
                hasMore: offset + limitParam < filtered.length,
                sourceUrl: `${replicateBase}/collections/${collectionSlug}`,
                sourceNotice: collectionFetched ? `live-api (collections/${collectionSlug})` : 'live-api (models fallback)',
              };
            }
          } catch (repErr: any) {
            console.error("Replicate live models discovery error:", repErr);
            results.replicate = {
              error: `Replicate 连接失败: ${repErr.message}`,
              status: repErr.status || 502,
              endpoint: `${cloudSettings['replicateBaseUrl'] || defaultKeys['replicateBaseUrl'] || 'https://api.replicate.com/v1'}/collections/text-to-image`,
            } as any;
          }
      })());
    }

    if (provider === 'all' || provider === 'openai_compat') {
      results.openai_compat = [];
      pagination.openai_compat = { page: 1, limit: limitParam, total: 0, hasMore: false, sourceUrl: '', sourceNotice: 'lookup-only (custom endpoint)' };
      catalogNoticesAccum.openai_compat = 'OpenAI 兼容接口使用您配置的 Base URL 与模型名称，暂无全网统一目录；支持在上方输入框中直接输入模型 ID (如 dall-e-3) 按 ID 选用。';
    }
    if (provider === 'all' || provider === 'grok_compat') {
      results.grok_compat = [];
      pagination.grok_compat = { page: 1, limit: limitParam, total: 0, hasMore: false, sourceUrl: '', sourceNotice: 'lookup-only (custom endpoint)' };
      catalogNoticesAccum.grok_compat = 'Grok 兼容接口使用您配置的 Base URL 与模型名称，暂无公开目录；支持在上方输入框中直接输入模型 ID 按 ID 选用。';
    }
    if (provider === 'all' || provider === 'agnes') {
      results.agnes = [];
      pagination.agnes = { page: 1, limit: limitParam, total: 0, hasMore: false, sourceUrl: 'https://agnes.ai', sourceNotice: 'lookup-only (specialized image/video service; no public remote catalog)' };
      catalogNoticesAccum.agnes = 'Agnes 无公开远端模型检索目录；请在上方输入框按官方模型 ID 选用（如 agnes-image-2.5-flash）。空列表不是“没有能力”，而是 lookup-only。';
    }

    if (provider === 'all' || provider === 'sensenova') {
      results.sensenova = [];
      pagination.sensenova = {
        page: pageParam,
        limit: limitParam,
        total: 0,
        hasMore: false,
        sourceUrl: 'https://www.sensetime.com',
        sourceNotice: 'lookup-only (catalogAvailable:false; official public model list API unavailable)',
        catalogAvailable: false,
      };
      catalogNoticesAccum.sensenova = 'SenseNova 官方没有公开模型列表 API；支持按模型 ID 选用，不能把本地白名单当作远端目录。';
    }

    await Promise.allSettled(tasks);

    for (const k of Object.keys(results)) {
      if (Array.isArray(results[k])) {
        results[k] = sortList(results[k]);
      }
    }

    const finalCatalogNotices: Record<string, string> = { ...catalogNoticesAccum };
    const finalErrors: Record<string, string> = {};
    for (const [k, v] of Object.entries(results)) {
      if (k.endsWith('Notice')) {
        // Legacy sibling notices must not live inside results (array|{error} only).
        if (typeof v === 'string' && !finalCatalogNotices[k.replace(/Notice$/, '')]) {
          finalCatalogNotices[k.replace(/Notice$/, '')] = v;
        }
        delete (results as any)[k];
        continue;
      }
      if (v && typeof v === 'object' && !Array.isArray(v) && (v as any).error) {
        finalErrors[k] = (v as any).error + ((v as any).details ? `: ${(v as any).details}` : '');
      }
    }

    return res.json({
      ok: true,
      ...results,
      _pagination: pagination,
      results,
      pagination,
      ...(Object.keys(finalCatalogNotices).length > 0 ? { catalogNotices: finalCatalogNotices } : {}),
      ...(Object.keys(finalErrors).length > 0 ? { errors: finalErrors } : {}),
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

function normalizeFalEndpoint(model: string, _isVideo = false): string {
  // The selected native endpoint is the route. Never replace aliases or dead IDs.
  return (model || '').trim();
}

// ==========================================
// 2. Fal.ai Inference (fal.ai / docs.fal.ai)
// ==========================================
app.post(['/api/fal/generate', '/api/generate', '/api/engine/fal/generate'], async (req, res) => {
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
    const endpoint = String(model).trim();
    const payload: any = { prompt };
    if (endpoint==='fal-ai/lora') payload.model_name=req.body.model_name;
    if (isProvided(req.body.num_images)) payload.num_images=Number(req.body.num_images);
    if (isProvided(req.body.scheduler)) payload.scheduler=req.body.scheduler;
    if (isProvided(req.body.aspect_ratio)) payload.aspect_ratio=req.body.aspect_ratio;
    if (isProvided(req.body.output_format)) payload.output_format=req.body.output_format;
    if (isProvided(req.body.safety_tolerance)) payload.safety_tolerance=req.body.safety_tolerance;
    if (typeof req.body.enable_safety_checker === 'boolean') payload.enable_safety_checker=req.body.enable_safety_checker;
    if (typeof req.body.raw === 'boolean') payload.raw=req.body.raw;

    // F5: image_size must be official enum (when endpoint is in static schema) or { width, height } object
    let finalImageSize: any = undefined;
    if (isProvided(image_size)) {
      if (typeof image_size === 'string') {
        const allowedEnums = ['square_hd', 'square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9'];
        const knownSpec = getModelSpec('fal', endpoint);
        if (knownSpec && !allowedEnums.includes(image_size)) {
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

    let falGate: ReturnType<typeof falImageFieldGate>;
    try { falGate = falImageFieldGate(endpoint, { steps: num_inference_steps, cfg: guidance_scale, seed, negative_prompt: negative_prompt || undefined }, loras); }
    catch (error: any) { return res.status(400).json({ error: error.message, errorSource: 'local', endpoint }); }
    Object.assign(payload, falGate.send);
    if (falGate.omitted.length) generationContext.getStore()?.traces.push(sanitizeGenerationMetadata({ stage: 'parameter-omissions', provider: 'fal', endpoint, omitted: falGate.omitted }));
    if (image_url) {
      const isKnownTextOnly = Boolean(getModelSpec('fal', endpoint)) && !/(?:image-to-image|img2img|edit|inpaint|redux|kontext|controlnet|upscal|outpaint|relight)/i.test(endpoint);
      if (isKnownTextOnly) {
        return res.status(400).json({ error: '图生图必须使用官方 image-to-image / edit / kontext / redux 端点，例如 fal-ai/flux-lora/image-to-image' });
      }
      payload.image_url = image_url;
      if (typeof denoise === 'number') {
        payload.strength = denoise;
      }
    } else if (isProvided(denoise)) {
      return res.status(400).json({ error: 'denoise 仅在提供 image_url（图生图）时有效', unsupported: ['denoise'] });
    }

    const actualModel = endpoint;

    if (Array.isArray(loras) && loras.length > 0) {
      // F8: 所选端点不支持 LoRA 时返回「该服务商不支持」
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

    const custom = applyCustomParameters(payload, req.body.custom_parameters);
    const sentPayload = custom.payload as Record<string, any>;

    const response = await upstreamFetch(
      { provider: 'fal', route: req.path, model: endpoint, key: falKey },
      `https://fal.run/${endpoint}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Key ${falKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sentPayload),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      keyPoolManager.recordResult('fal', falKey, false, Date.now() - startTime, errorText, response.status);
      // 若因端点不支持 loras 导致 422，返回清晰的诊断信息，杜绝静默吞掉 LoRA 假装成功的欺瞒行为
      if (response.status === 422 && sentPayload.loras && errorText.includes('loras')) {
        return res.status(422).json({
          error: `Fal.ai 端点调用错误 [422]: ${endpoint}`,
          details: errorText,
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
    const images = Array.isArray(result.images) ? result.images : [];
    if (!images.some((image: any) => image?.url)) {
      return res.status(502).json({ error: 'Fal.ai 返回结果中未包含图像输出 URL (images[].url)', errorSource: 'upstream', rawResponse: result });
    }

    // Fal output schema returns the actual `seed` used for the request; steps/cfg only if we sent them.
    const usedSeed = typeof result.seed === 'number' ? result.seed : (sentPayload.seed ?? null);
    return await respondWithGeneratedImages(res, images, {
      prompt: typeof sentPayload.prompt === 'string' ? sentPayload.prompt : prompt,
      negativePrompt: typeof sentPayload.negative_prompt === 'string' ? sentPayload.negative_prompt : negative_prompt,
      provider: 'Fal.ai (GPU 云端加速)',
      model: actualModel,
      actualModel,
      seed: usedSeed,
      steps: sentPayload.num_inference_steps ?? null,
      cfg: sentPayload.guidance_scale ?? null,
      loras: (sentPayload.loras || []).map((l: any) => ({ name: l.path, strength: l.scale })),
      requestMetadata: { requestedParameters: sanitizeGenerationMetadata(Object.fromEntries(Object.entries(req.body).filter(([key]) => key !== 'workflowSnapshot'))), customParameters: custom.customParameters, overrides: custom.overrides, actualParameters: sentPayload, upstreamSeed: result.seed ?? null },
    }, {
      label: 'Fal.ai',
      response: {
        seed: usedSeed,
        timings: result.timings,
        provider: 'Fal.ai (GPU 云端加速)',
        actualProvider: 'Fal.ai (GPU 云端加速)',
        model: actualModel,
        actualModel,
        requestedModel: model,
        exactEndpointCalled: `https://fal.run/${endpoint}`,
        targetEndpoint: endpoint,
        overrides: custom.overrides,
      },
    });
  } catch (error: any) {
    if (falKey) keyPoolManager.recordResult('fal', falKey, false, Date.now() - startTime, error.message);
    return res.status(500).json({ error: `Fal.ai 网络请求失败: ${error.message}` });
  }
});

// ==========================================
// 2.5. AI Video Generation (Wan 2.7/2.5/2.2/2.1, LTX-Video, Kling, MiniMax, CogVideoX, Hunyuan, Agnes)
// ==========================================
registerVideoGenerateRoutes(app, {
  isProvided,
  rejectUnsupported,
  rejectSchemaEnum,
  normalizeFalEndpoint,
  resolveProviderAuth,
  upstreamFetch,
  keyPoolManager,
  recordHistoryItem,
  requireDurableHistoryMediaUrl,
  generationContext,
});


// ==========================================
// 2.75. Civitai Official Orchestration Engine (Native Generator & Dynamic AIR Resolver)
// ==========================================
// C9: 名称/模型 id 无法唯一确定一个版本 → 路由返回 400 + candidates，不替用户挑
const civitaiPublicGet = (route: string, model: string) => (url: string) => upstreamFetch(
  { provider: 'civitai', route, model }, url, { headers: { 'User-Agent': 'ComfyCanvas/1.0' } }
);


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
    const images = collectCivitaiImageOutputs(data);
    const durableImages: Array<{ url: string; seed?: number }> = [];
    const transientOutputs: Array<Record<string, unknown>> = [];
    for (const [index, image] of images.entries()) {
      const durable = await requireDurableHistoryMediaUrl(image.url);
      if (durable.ok) durableImages.push({ ...image, url: durable.dataUrl });
      else transientOutputs.push({ index, url: image.url, error: durable.message, errorSource: durable.errorSource });
    }
    let mediaUrl = durableImages[0]?.url || '';
    if (!images.length) {
      const videoUrl = extractCivitaiBlobUrl(data);
      if (videoUrl) {
        const durable = await requireDurableHistoryMediaUrl(videoUrl);
        if (durable.ok) mediaUrl = durable.dataUrl;
        else transientOutputs.push({ index: 0, url: videoUrl, error: durable.message, errorSource: durable.errorSource });
      }
    }
    return res.json({
      id,
      status: data.status,
      mediaUrl,
      images: durableImages,
      transientOutputs,
      ...(transientOutputs.length ? { historyWarning: `${transientOutputs.length} 项生成结果保存失败，临时地址已保留`, error: !mediaUrl ? '生成完成，但全部结果持久化失败' : undefined } : {}),
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

    const requestedParameters = sanitizeGenerationMetadata(Object.fromEntries(Object.entries(req.body).filter(([key]) => key !== 'workflowSnapshot')));

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
    let completedImages: Array<{ url: string; seed?: number }> = [];
    let effectiveParameters: Record<string, any> | undefined;
    let submittedImageParameters: Record<string, any> = {};
    const usedProvider = 'Civitai 官方原生生成引擎';
    const startTime = Date.now();
    // C9-4: 实际发出的 AIR（解析后）；历史与响应记它而不是用户原始输入
    let airModel = String(model);

    try {
      if (isVideo) {
        let videoInput;
        try {videoInput=buildCivitaiVideoInput(req.body);} catch(error:any) {return res.status(400).json({error:error.message});}

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

        const durableVideoUrl = await persistRemoteUrlAsDataUrl(completedMediaUrl);
        if (!durableVideoUrl) {
          return res.status(500).json({
            error: 'Civitai 视频已生成，但无法下载并持久化为本地历史副本（data URL）。请重试。',
            transientMediaUrl: completedMediaUrl,
          });
        }
        completedMediaUrl = durableVideoUrl;

        const item = await recordHistoryItem({
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
      const builtImage = await buildCivitaiImageRequest(req.body, civitaiPublicGet(req.path, String(model)));
      const genInput = builtImage.payload;
      submittedImageParameters = genInput;
      generationContext.getStore()?.traces.push(sanitizeGenerationMetadata({ stage: 'parameter-mapping', provider: 'civitai', beforeCustom: builtImage.beforeCustom, customParameters: builtImage.customParameters, overrides: builtImage.overrides, actualParameters: genInput }));
      airModel = String(genInput.diffuserModel ?? genInput.diffusionModel ?? genInput.model);

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
      completedImages = collectCivitaiImageOutputs(orchData);
      completedMediaUrl = completedImages[0]?.url || extractCivitaiBlobUrl(orchData);
      const upstreamInput = orchData?.steps?.[0]?.input;
      if (upstreamInput && typeof upstreamInput === 'object' && !Array.isArray(upstreamInput)) effectiveParameters = upstreamInput;

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
          actualModel: civitaiImageHistory(genInput, effectiveParameters).model,
          requestedModel: model,
          pendingHistory: { ...civitaiImageHistory(genInput, effectiveParameters), provider: usedProvider },
          requestMetadata: {route: req.path, requestedParameters, customParameters: req.body.custom_parameters, actualParameters: genInput, submissions: generationContext.getStore()?.submissions || []},
        });
      }
    } catch (orchErr: any) {
      if (orchErr instanceof CivitaiAmbiguousError) throw orchErr;
      if (orchErr.status) return res.status(orchErr.status).json({ error: orchErr.message, errorSource: orchErr.errorSource ?? 'local', ...(orchErr.rawResponse !== undefined ? { rawResponse: orchErr.rawResponse } : {}) });
      keyPoolManager.recordResult('civitai', apiKey, false, Date.now() - startTime, orchErr.message);
      return res.status(500).json({ error: `Civitai 网络请求失败: ${orchErr.message}` });
    }

    if (!completedMediaUrl) {
      return res.status(500).json({ error: 'Civitai 原生算力未能按时返回有效图像，可能由于排队超时，请稍后在历史记录中查看或重试。' });
    }

    keyPoolManager.recordResult('civitai', apiKey, true, Date.now() - startTime);

    const actualHistory = civitaiImageHistory(submittedImageParameters, effectiveParameters);
    return await respondWithGeneratedImages(res, completedImages.length ? completedImages : [completedMediaUrl], {
      ...actualHistory, provider: usedProvider, actualModel: actualHistory.model,
      requestMetadata: {requestedParameters, customParameters: req.body.custom_parameters, actualParameters: submittedImageParameters, effectiveParameters},
    }, { label: 'Civitai', response: { success: true, provider: usedProvider, model: actualHistory.model, actualModel: actualHistory.model, requestedModel: model } });
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
    const { prompt, model, image_url } = req.body;
    if (!model) return res.status(400).json({ error: '模型为必填项（model is required）' });
    if (model === 'agnes-image-2.5-flash' && rejectUnsupported(res, 'Agnes AI', req.body, ['width', 'height', 'negative_prompt', 'seed', 'cfg', 'guidance_scale', 'steps', 'loras','sampler_name','scheduler','denoise'])) return;

    const explicitSize = req.body.extraParams?.size || req.body.size || (model !== 'agnes-image-2.5-flash' && isProvided(req.body.width) && isProvided(req.body.height) ? `${req.body.width}x${req.body.height}` : undefined);
    const payload: any = {
      model,
      prompt,
      ...(isProvided(explicitSize) ? { size: explicitSize } : {}),
      ...(typeof req.body.return_base64 === 'boolean' ? { return_base64: req.body.return_base64 } : {}),
    };
    if (model !== 'agnes-image-2.5-flash') {
      for (const f of ['width', 'height', 'negative_prompt', 'seed', 'cfg', 'guidance_scale', 'steps', 'loras', 'sampler_name', 'scheduler', 'denoise']) {
        if (isProvided(req.body[f])) payload[f] = req.body[f];
      }
    }
    const ratio = req.body.aspectRatio || req.body.aspect_ratio || req.body.ratio;
    if (isProvided(ratio)) payload.ratio = ratio;
    const extraBody: Record<string, unknown> = {};
    if (Array.isArray(req.body.images) && req.body.images.length > 0) extraBody.image = req.body.images;
    else if (image_url) extraBody.image = [image_url];
    if (isProvided(req.body.response_format)) extraBody.response_format = req.body.response_format;
    if (Object.keys(extraBody).length) payload.extra_body = extraBody;
    const custom = applyCustomParameters(payload, req.body.custom_parameters);
    const sentPayload = custom.payload;
    const actualModel = custom.actualModel || model;
    if (actualModel === 'agnes-image-2.5-flash' && !sentPayload.size) return res.status(400).json({error:'Agnes size 为必填项：当前 Image 2.5 Flash 请选择 1K / 2K / 3K / 4K',errorSource:'local'});
    const requestedParameters = sanitizeGenerationMetadata(Object.fromEntries(Object.entries(req.body).filter(([key]) => key !== 'workflowSnapshot')));

    const upstream = await upstreamFetch(
      { provider: 'agnes', route: req.path, model: actualModel, key: apiKey },
      `${baseUrl}/images/generations`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(sentPayload),
      }
    );

    if (!upstream.ok) {
      const errorText = await upstream.text();
      keyPoolManager.recordResult('agnes', apiKey, false, Date.now() - startTime, errorText, upstream.status);
      return res.status(upstream.status).json({ error: `Agnes AI 接口执行失败 [${upstream.status}]: ${errorText}` });
    }

    const data = await upstream.json();
    const images = Array.isArray(data.data) ? data.data : [];
    if (!images.some((image: any) => extractCompatImageUrl(image))) {
      keyPoolManager.recordResult('agnes', apiKey, false, Date.now() - startTime, 'No image in response', 500);
      return res.status(502).json({ error: 'Agnes AI 返回结果中未包含图像输出 URL', errorSource: 'upstream', rawResponse: data });
    }
    keyPoolManager.recordResult('agnes', apiKey, true, Date.now() - startTime);

    return await respondWithGeneratedImages(res, images, {
      prompt: typeof sentPayload.prompt === 'string' ? sentPayload.prompt : prompt,
      provider: 'Agnes AI (ApiHub)',
      model: actualModel,
      actualModel,
      seed: null,
      steps: null,
      cfg: null,
      loras: [],
      requestMetadata: { requestedParameters, customParameters: custom.customParameters, overrides: custom.overrides, actualParameters: sentPayload },
    }, {
      label: 'Agnes AI',
      response: { provider: 'Agnes AI (ApiHub)', model: actualModel, requestedModel: model, actualModel, overrides: custom.overrides },
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
    const { messages = [], model, temperature, max_tokens } = req.body;
    if (!model) return res.status(400).json({ error: '模型为必填项（model is required）' });
    const chatPayload: Record<string, unknown> = {
      model,
      messages,
      ...(typeof temperature === 'number' ? { temperature } : {}),
      ...(typeof max_tokens === 'number' ? { max_tokens } : {}),
    };

    const upstream = await upstreamFetch(
      { provider: 'agnes', route: req.path, model, key: auth.apiKey },
      `${auth.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${auth.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(chatPayload),
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
// 2.9. SenseNova (商汤日日新) chat + generate (Modular Route)
// ==========================================
registerSenseNovaRoutes(app, {
  resolveProviderAuth,
  upstreamFetch,
  keyPoolManager,
  respondWithGeneratedImages,
  sanitizeGenerationMetadata,
});

// ==========================================
// 2.9a1. Runware 官方云平台 (api.runware.ai/v1)
// ==========================================
app.post('/api/engine/runware/generate', async (req, res) => {
  const startTime = Date.now();
  const auth = resolveProviderAuth(req, 'runware');
  if (auth.error) return res.status(400).json({ error: auth.error, errorSource: 'local' });
  const { apiKey, baseUrl } = auth;

  let mapped: ReturnType<typeof buildRunwareImageRequest>;
  try {
    mapped = buildRunwareImageRequest(req.body || {}, baseUrl);
  } catch (error: any) {
    return res.status(400).json({ error: error.message, errorSource: 'local' });
  }

  const endpoint = mapped.endpoint;
  try {
    const upstream = await upstreamFetch(
      { provider: 'runware', route: req.path, model: mapped.actualModel, key: apiKey },
      endpoint,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mapped.payload),
      }
    );

    if (!upstream.ok) {
      const rawResponse = await upstream.text();
      keyPoolManager.recordResult('runware', apiKey, false, Date.now() - startTime, rawResponse, upstream.status);
      return res.status(upstream.status).json({
        error: `Runware 图像接口上游 HTTP ${upstream.status}: ${rawResponse}`,
        upstreamStatus: upstream.status,
        errorSource: 'upstream',
        endpoint,
        rawResponse,
        actualRequest: mapped.payload,
      });
    }

    const data = await upstream.json();
    let parsed: ReturnType<typeof parseRunwareImageResponse>;
    try {
      parsed = parseRunwareImageResponse(data, mapped.payload[0]?.outputFormat);
    } catch (parseErr: any) {
      keyPoolManager.recordResult('runware', apiKey, false, Date.now() - startTime, parseErr.message, 502);
      return res.status(502).json({
        error: parseErr.message,
        errorSource: 'upstream',
        endpoint,
        rawResponse: data,
        actualRequest: mapped.payload,
      });
    }

    keyPoolManager.recordResult('runware', apiKey, true, Date.now() - startTime);

    const task = mapped.payload[0];
    return await respondWithGeneratedImages(res, parsed.images, {
      prompt: task.positivePrompt,
      negativePrompt: task.negativePrompt,
      provider: 'Runware',
      model: mapped.actualModel,
      actualModel: mapped.actualModel,
      seed: task.seed ?? null,
      steps: task.steps ?? null,
      cfg: task.CFGScale ?? null,
      width: task.width ?? null,
      height: task.height ?? null,
      loras: (task.lora || []).map(l => ({ name: l.model, strength: l.weight })),
      requestMetadata: { requestedParameters: sanitizeGenerationMetadata(Object.fromEntries(Object.entries(req.body).filter(([key]) => key !== 'workflowSnapshot'))), actualParameters: mapped.payload, overrides: mapped.overrides, upstreamEndpoint: endpoint },
    }, {
      label: 'Runware',
      response: { provider: 'Runware', model: mapped.actualModel, requestedModel: req.body.model, actualModel: mapped.actualModel, seed: task.seed ?? null, cost: parsed.cost, taskUUID: parsed.taskUUID, actualRequest: mapped.payload, overrides: mapped.overrides, upstreamEndpoint: endpoint },
    });
  } catch (error: any) {
    keyPoolManager.recordResult('runware', apiKey, false, Date.now() - startTime, error.message);
    return res.status(502).json({
      error: `Runware 图像接口网络/协议错误：${error.message}`,
      errorSource: 'network',
      endpoint,
      stack: error.stack,
    });
  }
});

// ==========================================
// 2.9a2. ModelsLab 官方模型库 (modelslab.com)
// ==========================================
app.post('/api/engine/modelslab/generate', async (req, res) => {
  const startTime = Date.now();
  const auth = resolveProviderAuth(req, 'modelslab');
  if (auth.error) return res.status(400).json({ error: auth.error, errorSource: 'local' });
  const { apiKey, baseUrl } = auth;

  let mapped: ReturnType<typeof buildModelsLabImageRequest>;
  try {
    mapped = buildModelsLabImageRequest(req.body || {}, apiKey, baseUrl);
  } catch (error: any) {
    return res.status(400).json({ error: error.message, errorSource: 'local' });
  }

  const endpoint = mapped.endpoint;
  const actualRequest = sanitizeModelsLabPayload(mapped.payload);
  try {
    const upstream = await upstreamFetch(
      { provider: 'modelslab', route: req.path, model: mapped.actualModel, key: apiKey },
      endpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mapped.payload),
      }
    );

    if (!upstream.ok) {
      const rawResponse = await upstream.text();
      keyPoolManager.recordResult('modelslab', apiKey, false, Date.now() - startTime, rawResponse, upstream.status);
      return res.status(upstream.status).json({
        error: `ModelsLab 图像接口上游 HTTP ${upstream.status}: ${rawResponse}`,
        upstreamStatus: upstream.status,
        errorSource: 'upstream',
        endpoint,
        rawResponse,
        actualRequest,
      });
    }

    const data = await upstream.json();
    let parsed: ReturnType<typeof parseModelsLabResponse>;
    try {
      parsed = parseModelsLabResponse(data);
    } catch (parseErr: any) {
      keyPoolManager.recordResult('modelslab', apiKey, false, Date.now() - startTime, parseErr.message, 502);
      return res.status(502).json({
        error: parseErr.message,
        errorSource: 'upstream',
        endpoint,
        rawResponse: data,
        actualRequest,
      });
    }

    let finalImageUrl = parsed.imageUrl;

    if (parsed.status === 'processing' && parsed.taskId) {
      const fetchReq = buildModelsLabFetchRequest(parsed.taskId, apiKey, baseUrl);
      let lastPollError: string | undefined;
      for (let attempt = 0; attempt < 30 && !finalImageUrl; attempt++) {
        await new Promise((r) => setTimeout(r, 2000));
        let polled: Response;
        try {
          polled = await upstreamFetch(
            { provider: 'modelslab', route: req.path, model: mapped.actualModel, key: apiKey },
            fetchReq.endpoint,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(fetchReq.payload),
            }
          );
        } catch (pollNetErr: any) {
          keyPoolManager.recordResult('modelslab', apiKey, false, Date.now() - startTime, pollNetErr.message);
          return res.status(502).json({
            error: `ModelsLab 轮询网络/协议错误: ${pollNetErr.message}`,
            errorSource: 'network',
            endpoint: fetchReq.endpoint,
            actualRequest,
            stack: pollNetErr.stack,
          });
        }
        if (!polled.ok) {
          const pollErrText = await polled.text().catch(() => '');
          lastPollError = `ModelsLab 轮询 HTTP ${polled.status}: ${pollErrText}`;
          keyPoolManager.recordResult('modelslab', apiKey, false, Date.now() - startTime, pollErrText, polled.status);
          return res.status(polled.status).json({
            error: lastPollError,
            upstreamStatus: polled.status,
            errorSource: 'upstream',
            rawResponse: pollErrText,
            endpoint: fetchReq.endpoint,
            actualRequest,
          });
        }
        const pollData = await polled.json().catch(() => ({}));
        if (pollData.status === 'success') {
          parsed = parseModelsLabResponse(pollData);
          finalImageUrl = parsed.imageUrl;
          break;
        } else if (pollData.status === 'error') {
          const errMsg = `ModelsLab 异步任务失败: ${pollData.message || '未知错误'}${pollData.tip ? ` (${pollData.tip})` : ''}`;
          keyPoolManager.recordResult('modelslab', apiKey, false, Date.now() - startTime, errMsg, 502);
          return res.status(502).json({
            error: errMsg,
            upstreamStatus: 502,
            errorSource: 'upstream',
            endpoint: fetchReq.endpoint,
            rawResponse: pollData,
            actualRequest,
          });
        }
      }
      if (!finalImageUrl && lastPollError) {
        keyPoolManager.recordResult('modelslab', apiKey, false, Date.now() - startTime, lastPollError, 504);
        return res.status(504).json({
          error: `ModelsLab 图像生成超时，最后轮询错误: ${lastPollError}`,
          errorSource: 'upstream',
          endpoint: fetchReq.endpoint,
          actualRequest,
        });
      }
    }

    if (!finalImageUrl) {
      keyPoolManager.recordResult('modelslab', apiKey, false, Date.now() - startTime, 'timeout or missing image', 504);
      return res.status(504).json({
        error: 'ModelsLab 图像生成超时或未返回图片输出',
        errorSource: 'upstream',
        endpoint,
        actualRequest,
      });
    }

    keyPoolManager.recordResult('modelslab', apiKey, true, Date.now() - startTime);
    const imageUrls = parsed.imageUrls?.length ? parsed.imageUrls : [finalImageUrl];
    const sent = mapped.payload as Record<string, any>;
    return await respondWithGeneratedImages(res, imageUrls, {
      prompt: String(sent.prompt),
      negativePrompt: typeof sent.negative_prompt === 'string' ? sent.negative_prompt : undefined,
      provider: 'ModelsLab',
      model: mapped.actualModel,
      actualModel: mapped.actualModel,
      seed: typeof sent.seed === 'number' ? sent.seed : null,
      steps: typeof sent.num_inference_steps === 'number' ? sent.num_inference_steps : null,
      cfg: typeof sent.guidance_scale === 'number' ? sent.guidance_scale : null,
      width: typeof sent.width === 'number' ? sent.width : null,
      height: typeof sent.height === 'number' ? sent.height : null,
      loras: typeof sent.lora_model === 'string' && sent.lora_model ? sent.lora_model.split(',').map((name: string, index: number) => ({ name, strength: Number(String(sent.lora_strength ?? '').split(',')[index] ?? sent.lora_strength) })) : [],
      requestMetadata: { requestedParameters: sanitizeGenerationMetadata(Object.fromEntries(Object.entries(req.body).filter(([key]) => key !== 'workflowSnapshot'))), actualParameters: actualRequest, overrides: mapped.overrides, upstreamEndpoint: endpoint },
    }, {
      label: 'ModelsLab',
      response: { provider: 'ModelsLab', model: mapped.actualModel, requestedModel: req.body.model ?? req.body.model_id, actualModel: mapped.actualModel, taskId: parsed.taskId ?? null, actualRequest, overrides: mapped.overrides, upstreamEndpoint: endpoint },
    });
  } catch (error: any) {
    keyPoolManager.recordResult('modelslab', apiKey, false, Date.now() - startTime, error.message);
    return res.status(502).json({
      error: `ModelsLab 图像接口网络/协议错误：${error.message}`,
      errorSource: 'network',
      endpoint,
      stack: error.stack,
    });
  }
});

// ==========================================
// 2.9c. Replicate 引擎 (Modular Route)
// ==========================================
registerReplicateRoutes(app, {
  resolveProviderAuth,
  upstreamFetch,
  keyPoolManager,
  respondWithGeneratedImages,
  recordHistoryItem,
  sanitizeGenerationMetadata,
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
    // Current official JSON edits contract uses images:[{image_url}], not image:string.
    if (isEdit) payload.images = [{image_url}];
    const custom = applyCustomParameters(payload, req.body.custom_parameters);
    const sentPayload = custom.payload;
    const actualModel = custom.actualModel || model;
    const requestedParameters = sanitizeGenerationMetadata(Object.fromEntries(Object.entries(req.body).filter(([key]) => key !== 'workflowSnapshot')));

    const upstream = await upstreamFetch(
      { provider: 'openai_compat', route: req.path, model: actualModel, key: apiKey },
      `${baseUrl}${isEdit ? '/images/edits' : '/images/generations'}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(sentPayload),
      },
    );

    if (!upstream.ok) {
      const errorText = await upstream.text();
      keyPoolManager.recordResult('openai_compat', apiKey, false, Date.now() - startTime, errorText, upstream.status);
      return res.status(upstream.status).json({ error: `OpenAI 兼容中转失败 [${upstream.status}]: ${errorText}` });
    }

    const data = await upstream.json();
    const images = Array.isArray(data.data) ? data.data : [];
    if (!images.some((image: any) => extractCompatImageUrl(image))) {
      keyPoolManager.recordResult('openai_compat', apiKey, false, Date.now() - startTime, 'No image in response', 500);
      return res.status(502).json({ error: 'OpenAI 兼容中转返回结果中未包含图像（data[].b64_json / data[].url）', errorSource: 'upstream', rawResponse: data });
    }
    keyPoolManager.recordResult('openai_compat', apiKey, true, Date.now() - startTime);

    return await respondWithGeneratedImages(res, images, {
      prompt: typeof sentPayload.prompt === 'string' ? sentPayload.prompt : prompt,
      provider: 'OpenAI 兼容中转',
      model: actualModel,
      actualModel,
      seed: null,
      steps: null,
      cfg: null,
      loras: [],
      requestMetadata: { requestedParameters, customParameters: custom.customParameters, overrides: custom.overrides, actualParameters: sentPayload },
    }, {
      label: 'OpenAI 兼容中转',
      outputFormat: typeof sentPayload.output_format === 'string' ? sentPayload.output_format : undefined,
      response: { provider: 'OpenAI 兼容中转', model: actualModel, requestedModel: model, actualModel, overrides: custom.overrides },
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
    if (isEdit) payload.image = { url: image_url, type:'image_url' };
    const custom = applyCustomParameters(payload, req.body.custom_parameters);
    const sentPayload = custom.payload;
    const actualModel = custom.actualModel || model;
    const requestedParameters = sanitizeGenerationMetadata(Object.fromEntries(Object.entries(req.body).filter(([key]) => key !== 'workflowSnapshot')));

    const upstream = await upstreamFetch(
      { provider: 'grok_compat', route: req.path, model: actualModel, key: apiKey },
      `${baseUrl}${isEdit ? '/images/edits' : '/images/generations'}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(sentPayload),
      },
    );

    if (!upstream.ok) {
      const errorText = await upstream.text();
      keyPoolManager.recordResult('grok_compat', apiKey, false, Date.now() - startTime, errorText, upstream.status);
      return res.status(upstream.status).json({ error: `Grok 兼容中转失败 [${upstream.status}]: ${errorText}` });
    }

    const data = await upstream.json();
    // Relative URLs from a relay are resolved against the configured base origin only; b64 stays inline.
    const images = (Array.isArray(data.data) ? data.data : []).map((image: any) =>
      image && typeof image === 'object' && typeof image.url === 'string' && image.url ? { ...image, url: resolveAgainstBaseOrigin(image.url, baseUrl) } : image);
    if (!images.some((image: any) => extractCompatImageUrl(image))) {
      keyPoolManager.recordResult('grok_compat', apiKey, false, Date.now() - startTime, 'No image in response', 500);
      return res.status(502).json({ error: 'Grok 兼容中转返回结果中未包含图像（data[].url / data[].b64_json）', errorSource: 'upstream', rawResponse: data });
    }
    keyPoolManager.recordResult('grok_compat', apiKey, true, Date.now() - startTime);

    return await respondWithGeneratedImages(res, images, {
      prompt: typeof sentPayload.prompt === 'string' ? sentPayload.prompt : prompt,
      provider: 'Grok 兼容中转',
      model: actualModel,
      actualModel,
      seed: null,
      steps: null,
      cfg: null,
      loras: [],
      requestMetadata: { requestedParameters, customParameters: custom.customParameters, overrides: custom.overrides, actualParameters: sentPayload },
    }, {
      label: 'Grok 兼容中转',
      response: { provider: 'Grok 兼容中转', model: actualModel, requestedModel: model, actualModel, overrides: custom.overrides },
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
    const { messages = [], model, temperature, max_tokens } = req.body;
    if (!model) return res.status(400).json({ error: '模型为必填项（model is required）' });
    const chatPayload: Record<string, unknown> = {
      model,
      messages,
      ...(typeof temperature === 'number' ? { temperature } : {}),
      ...(typeof max_tokens === 'number' ? { max_tokens } : {}),
    };

    const upstream = await upstreamFetch(
      { provider: 'grok_compat', route: req.path, model, key: auth.apiKey },
      `${auth.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(chatPayload),
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

// Key priority: request header > env > saved settings (Item 3).
function resolveTensorArtKey(req: express.Request): string {
  return keyPoolManager.getNextKey('tensorart', (req.headers['x-tensorart-key'] as string) || undefined) || '';
}

/** TAMS Model API only — never returns ak_tensor OpenWorks keys. */
function resolveTamsBearerKey(req: express.Request): string {
  return (
    pickTamsBearerKey(
      req.headers['x-tensorart-key'],
      keyPoolManager.getKeys('tensorart'),
      defaultKeys.tensorartKey,
      cloudSettings['tensorartKey']
    ) || ''
  );
}


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

    // 2026-10-17 产品改口：Tensor.Art 只保留 OpenWorks 真出图；本路由不再执行 TAMS /v1/jobs。
    const requestedModelOrTool = String(req.body.toolName || req.body.model || '').trim();
    return res.status(410).json({
      error: 'Tensor.Art TAMS 出图入口已下线。请在底模选服务商「Tensor.Art OpenWorks」，走 /api/schema-provider/openworks/submit → 官方 POST https://openapi.tensor.art/openworks/v1/task（Echo-Access-Key / ak_tensor_…）。未出站，本地拦截。',
      errorSource: 'local',
      requestedModel: requestedModelOrTool,
      openWorksSubmit: '/api/schema-provider/openworks/submit',
      docsUrl: 'https://github.com/Tensor-Art/tensorart-skills/tree/master/skills/tensorart-generate',
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

    // Billing-only key rotate: single x-hf-token = pinned (no rotate); env/settings multi-key pool rotates on 402/credits only.
    const hfHeaderToken = (req.headers['x-hf-token'] as string) || undefined;
    const hfAttemptPlan = keyPoolManager.getAttemptKeys('huggingface', hfHeaderToken);
    let hfToken = hfAttemptPlan.keys[0] || '';
    let hfKeyRotation: ReturnType<typeof buildKeyRotationPayload> | undefined;
    const pushHfKeyAttempt = (rec: KeyAttemptRecord, key: string) => {
      generationContext.getStore()?.traces.push({
        stage: 'key-attempt',
        provider: 'huggingface',
        maskedKey: rec.maskedKey,
        result: rec.result,
        status: rec.status,
        responseBody: rec.responseBody,
        outcome: rec.outcome,
        pinned: hfAttemptPlan.pinned,
      });
      if (rec.outcome === 'success') keyPoolManager.recordResult('huggingface', key, true);
      else keyPoolManager.recordResult('huggingface', key, false, 0, rec.responseBody || '', rec.status || 0);
    };

    const normalizedModel = (model || '').trim().toLowerCase();
    const hfProvider = req.body.inference_provider;
    if (!['hf-inference','fal-ai','z-image-space'].includes(hfProvider)) return res.status(400).json({error:'请选择 HF 实际执行路由',errorSource:'local'});
    const isZImage = hfProvider==='z-image-space';

    if (!hfToken && !isZImage) {
      return res.status(400).json({
        error: '未配置 Hugging Face Token，请在右上角设置中填写您的 User Access Token (hf_...)。',
      });
    }

    // HF text-to-image and this Z-Image Space have no LoRA argument. Never silently drop.
    if (rejectUnsupported(res, 'Hugging Face', req.body, ['cfg', 'denoise', 'image_url','sampler_name'])) return;
    if (hfProvider !== 'fal-ai' && rejectUnsupported(res, 'HF Inference / Z-Image Space', req.body, ['loras'])) return;
    // Z-Image Space has seven live /generate arguments; no negative prompt / guidance.
    if (isZImage && rejectUnsupported(res, 'Hugging Face Z-Image Space', req.body, ['negative_prompt', 'guidance'])) return;

    const finalPrompt = prompt || '';
    let dataUrl = '';
    let sentSeed: number | null = null;
    let sentSteps: number | null = null;
    let sentCfg: number | null = null;
    let zImageRequest: { actualParameters: Record<string, unknown>; overrides: unknown[] } | undefined;
    let hfInferenceRequest: { actualParameters: Record<string, unknown>; overrides: unknown[]; customParameters?: unknown } | undefined;

    if (isZImage) {
      // H2: 🌟 Direct integration with verified official Tongyi-MAI/Z-Image-Turbo Gradio Space on Hugging Face (Public Space)
      if (rejectUnsupported(res, 'Hugging Face Z-Image Space', req.body, ['width', 'height', 'sampler_name', 'scheduler'])) return;
      let gradioPayload;
      try {
        gradioPayload = buildZImagePayload(req.body);
      } catch (error: any) {
        return res.status(400).json({error: error.message});
      }
      const zActual = gradioPayload.actualParameters as Record<string, any>;
      sentSeed = zActual.random_seed || zActual.seed === -1 ? null : zActual.seed;
      sentSteps = zActual.steps;
      zImageRequest = { actualParameters: zActual, overrides: gradioPayload.overrides };

      const gradioHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (hfToken) gradioHeaders['Authorization'] = `Bearer ${hfToken}`;

      const initResp = await upstreamFetch(
        { provider: 'huggingface', route: '/api/huggingface/generate', model, key: hfToken },
        'https://tongyi-mai-z-image-turbo.hf.space/gradio_api/call/generate',
        { method: 'POST', headers: gradioHeaders, body: JSON.stringify({ data: gradioPayload.data }) }
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
              if (typeof parsed[2] === 'number' && Number.isSafeInteger(parsed[2])) sentSeed = parsed[2];
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
        { headers: hfToken ? { 'Authorization': `Bearer ${hfToken}` } : {} }
      );
      if (imgResp.ok) {
        const buf = await imgResp.arrayBuffer();
        const base64 = Buffer.from(buf).toString('base64');
        const mimeType = imgResp.headers.get('content-type') || 'image/png';
        dataUrl = await externalizeMedia(`data:${mimeType};base64,${base64}`);
      } else {
        dataUrl = genUrl;
      }
    } else if (hfProvider === 'fal-ai') {
      // Official HF SDK routing + live inferenceProviderMapping.
      // No provider failover. Billing/402 may try the next KeyPool key (billingKeyRotate); other errors stop.
      if (rejectUnsupported(res,'HF → fal-ai',req.body,['scheduler','resolution','shift','random_seed','gallery_images'])) return;

      const falRotated = await runWithBillingKeyRotate({
        keys: hfAttemptPlan.keys,
        pinned: hfAttemptPlan.pinned,
        maskKey: (k) => keyPoolManager.maskKey(k),
        onAttempt: pushHfKeyAttempt,
        attempt: async (token) => {
          hfToken = token;
          const metadata = async (id: string) => {
            if (!/^[\w.-]+\/[\w.-]+$/.test(id)) {
              return { local: true as const, status: 400, payload: { error: `无效 HF 仓库 ID：${id}` } };
            }
            const response = await upstreamFetch(
              { provider: 'huggingface', route: req.path, model: id, key: token },
              `https://huggingface.co/api/models/${id}?expand=inferenceProviderMapping&expand=cardData&expand=siblings`,
              { headers: { Authorization: `Bearer ${token}` } },
            );
            if (!response.ok) {
              const body = await response.text();
              return { upstream: true as const, status: response.status, body };
            }
            return { ok: true as const, json: await response.json() };
          };

          const modelMetaResult = await metadata(model);
          if ('local' in modelMetaResult) return { ok: false, local: true, status: modelMetaResult.status, payload: modelMetaResult.payload };
          if ('upstream' in modelMetaResult) return { ok: false, status: modelMetaResult.status, body: modelMetaResult.body };
          const modelMetadata = modelMetaResult.json;
          const mainMapping = modelMetadata.inferenceProviderMapping?.['fal-ai'];
          const baseModel = mainMapping?.adapter === 'lora' ? modelMetadata.cardData?.base_model : model;
          if (typeof baseModel !== 'string') return { ok: false, local: true, status: 400, payload: { error: 'HF 模型底模架构未能核实' } };
          const loraEntries = Array.isArray(req.body.loras) ? req.body.loras : [];
          if (mainMapping?.adapter === 'lora' && !loraEntries.some((l: any) => l.name === model)) {
            return { ok: false, local: true, status: 400, payload: { error: `模型 ${model} 是 LoRA 推理管线，请连接同名 LoRA 并设置实际强度；不会代填权重` } };
          }
          const loraFiles: any[] = [];
          let mapping = mainMapping;
          for (const lora of loraEntries) {
            const id = String(lora.name || '');
            const infoResult = id === model ? modelMetaResult : await metadata(id);
            if (id !== model) {
              if ('local' in (infoResult as any)) return { ok: false, local: true, status: (infoResult as any).status, payload: (infoResult as any).payload };
              if ('upstream' in (infoResult as any)) return { ok: false, status: (infoResult as any).status, body: (infoResult as any).body };
            }
            const info = id === model ? modelMetadata : (infoResult as any).json;
            const adapter = info.inferenceProviderMapping?.['fal-ai'];
            if (adapter?.status !== 'live' || adapter?.task !== 'text-to-image' || adapter?.adapter !== 'lora' || !adapter.adapterWeightsPath) {
              return { ok: false, local: true, status: 400, payload: { error: `HF → fal-ai 未提供 ${id} 的在线 LoRA 映射；可下载不等于可在线生成` } };
            }
            const bases = Array.isArray(info.cardData?.base_model) ? info.cardData.base_model : [info.cardData?.base_model];
            if (!bases.includes(baseModel)) return { ok: false, local: true, status: 400, payload: { error: `LoRA ${id} 与底模 ${baseModel} 架构不匹配`, details: { base_model: bases } } };
            const scale = lora.strength ?? lora.modelStrength;
            if (!Number.isFinite(scale)) return { ok: false, local: true, status: 400, payload: { error: `LoRA ${id} 强度必填` } };
            if (loraFiles.length && mapping?.providerId !== adapter.providerId) return { ok: false, local: true, status: 400, payload: { error: '这些 LoRA 需要不同的推理端点，不能混用' } };
            mapping = adapter;
            loraFiles.push({ path: `https://huggingface.co/${id}/resolve/main/${adapter.adapterWeightsPath}`, scale });
          }
          if (mapping?.status !== 'live' || mapping?.task !== 'text-to-image') {
            return { ok: false, local: true, status: 400, payload: { error: `HF 未给 ${model} 提供 fal-ai 生图映射` } };
          }
          const endpoint = mapping.providerId;
          const payload: any = { prompt: finalPrompt };
          if (isProvided(width) || isProvided(height)) {
            if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
              return { ok: false, local: true, status: 400, payload: { error: 'width / height 必须同时为正整数' } };
            }
            payload.image_size = { width, height };
          }
          if (isProvided(steps)) payload.num_inference_steps = steps;
          if (isProvided(guidance)) payload.guidance_scale = guidance;
          if (isProvided(seed) && seed >= 0) payload.seed = seed;
          if (isProvided(negative_prompt)) payload.negative_prompt = negative_prompt;
          if (loraFiles.length) payload.loras = loraFiles;
          let hfCustom;
          try {
            hfCustom = applyCustomParameters(payload, req.body.custom_parameters);
          } catch (error: any) {
            return { ok: false, local: true, status: 400, payload: { error: error.message } };
          }
          const sentPayload = hfCustom.payload as Record<string, any>;
          const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
          const url = `https://router.huggingface.co/fal-ai/${endpoint}?_subdomain=queue`;
          const submit = await upstreamFetch(
            { provider: 'huggingface', route: req.path, model: baseModel, key: token },
            url,
            { method: 'POST', headers, body: JSON.stringify(sentPayload) },
          );
          if (!submit.ok) return { ok: false, status: submit.status, body: await submit.text() };
          let result = await submit.json();
          if (!result.request_id || !result.response_url) {
            return { ok: false, local: true, status: 502, payload: { error: 'HF → fal-ai 未返回任务 ID / 结果地址', details: result } };
          }
          const responsePath = new URL(result.response_url);
          if (responsePath.hostname !== 'queue.fal.run' || !responsePath.pathname.startsWith('/fal-ai/') || !responsePath.pathname.includes('/requests/')) {
            return { ok: false, local: true, status: 502, payload: { error: 'HF → fal-ai 返回未核实的任务地址', details: result } };
          }
          const resultUrl = `https://router.huggingface.co/fal-ai${responsePath.pathname}?_subdomain=queue`;
          for (let attempt = 0; attempt < 120 && result.status !== 'COMPLETED'; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            const status = await upstreamFetch(
              { provider: 'huggingface', route: 'HF fal-ai poll', model: baseModel, key: token },
              resultUrl.replace('?_', '/status?_'),
              { headers },
            );
            if (!status.ok) return { ok: false, status: status.status, body: await status.text() };
            result = await status.json();
          }
          if (result.status !== 'COMPLETED') {
            return { ok: false, local: true, status: 504, payload: { error: 'HF → fal-ai 任务未在等待时间内完成', details: result } };
          }
          const output = await upstreamFetch(
            { provider: 'huggingface', route: 'HF fal-ai result', model: baseModel, key: token },
            resultUrl,
            { headers },
          );
          if (!output.ok) return { ok: false, status: output.status, body: await output.text() };
          const generated = await output.json();
          const generatedImages = Array.isArray(generated.images) ? generated.images : [];
          if (!generatedImages.some((image: any) => image?.url)) {
            return { ok: false, local: true, status: 502, payload: { error: 'HF → fal-ai 未返回图像', errorSource: 'upstream', details: generated } };
          }
          return {
            ok: true,
            value: { generatedImages, sentPayload, hfCustom, baseModel, endpoint, url, generated, loraEntries },
          };
        },
      });

      hfKeyRotation = falRotated.keyRotation;
      if (!falRotated.ok) {
        if (falRotated.localPayload) {
          return res.status(falRotated.lastStatus).json({ ...falRotated.localPayload, keyRotation: falRotated.keyRotation });
        }
        return res.status(falRotated.lastStatus).json({
          error: falRotated.keyRotation.summary,
          details: falRotated.lastBody,
          model,
          keyRotation: falRotated.keyRotation,
          errorSource: 'upstream',
        });
      }

      const { generatedImages, sentPayload, hfCustom, baseModel, endpoint, url, generated, loraEntries } = falRotated.value;
      return await respondWithGeneratedImages(
        res,
        generatedImages,
        {
          prompt: typeof sentPayload.prompt === 'string' ? sentPayload.prompt : finalPrompt,
          negativePrompt: typeof sentPayload.negative_prompt === 'string' ? sentPayload.negative_prompt : negative_prompt,
          provider: 'Hugging Face → fal-ai',
          model: baseModel,
          actualModel: baseModel,
          seed: generated.seed ?? sentPayload.seed ?? null,
          steps: sentPayload.num_inference_steps ?? null,
          cfg: sentPayload.guidance_scale ?? null,
          loras: loraEntries.map((l: any) => ({ name: l.name, strength: l.strength ?? l.modelStrength })),
          requestMetadata: {
            requestedParameters: sanitizeGenerationMetadata(Object.fromEntries(Object.entries(req.body).filter(([key]) => key !== 'workflowSnapshot'))),
            customParameters: hfCustom.customParameters,
            overrides: hfCustom.overrides,
            actualParameters: sentPayload,
            upstreamEndpoint: url,
            keyRotation: falRotated.keyRotation,
          },
        },
        {
          label: 'HF → fal-ai',
          response: {
            provider: 'Hugging Face',
            actualProvider: 'Hugging Face Inference Providers → fal-ai',
            model,
            actualModel: baseModel,
            endpoint,
            overrides: hfCustom.overrides,
            keyRotation: falRotated.keyRotation,
          },
        },
      );
    } else {
      // HF text-to-image task: only forward what the caller provided; no defaults, no SDK→router / provider retry.
      // Billing/402 may try the next KeyPool key (billingKeyRotate).
      const infRotated = await runWithBillingKeyRotate({
        keys: hfAttemptPlan.keys,
        pinned: hfAttemptPlan.pinned,
        maskKey: (k) => keyPoolManager.maskKey(k),
        onAttempt: pushHfKeyAttempt,
        attempt: async (token) => {
          hfToken = token;
          const metadata = await upstreamFetch(
            { provider: 'huggingface', route: 'hf-inference capabilities', model, key: token },
            `https://huggingface.co/api/models/${model}?expand=inferenceProviderMapping`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (!metadata.ok) return { ok: false, status: metadata.status, body: await metadata.text() };
          const mapping = (await metadata.json()).inferenceProviderMapping?.['hf-inference'];
          if (mapping?.status !== 'live' || mapping?.task !== 'text-to-image') {
            return {
              ok: false,
              local: true,
              status: 400,
              payload: {
                error: `${model} 没有已核实的 hf-inference 文生图服务。Hub 下载仓库不等于可调用模型；请明确选择该模型实际提供的推理端点`,
                model,
                mapping,
              },
            };
          }
          const parameters: Record<string, any> = {};
          if (isProvided(negative_prompt)) parameters.negative_prompt = negative_prompt;
          if (isProvided(width)) parameters.width = Number(width);
          if (isProvided(height)) parameters.height = Number(height);
          if (isProvided(steps)) parameters.num_inference_steps = Number(steps);
          if (isProvided(guidance)) parameters.guidance_scale = Number(guidance);
          if (typeof seed === 'number' && seed >= 0) parameters.seed = seed;
          if (isProvided(req.body.scheduler)) parameters.scheduler = req.body.scheduler;
          let hfCustom;
          try {
            hfCustom = applyCustomParameters({ inputs: finalPrompt, parameters }, req.body.custom_parameters);
          } catch (error: any) {
            return { ok: false, local: true, status: 400, payload: { error: error.message } };
          }
          const hfBody = hfCustom.payload as { inputs: unknown; parameters?: Record<string, any> };
          const resp = await upstreamFetch(
            { provider: 'huggingface', route: '/api/huggingface/generate', model, key: token },
            `https://router.huggingface.co/hf-inference/models/${model}`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(hfBody),
            },
          );
          if (!resp.ok) return { ok: false, status: resp.status, body: await resp.text() };
          const buffer = await resp.arrayBuffer();
          const mimeType = resp.headers.get('content-type') || 'image/jpeg';
          const url = await externalizeMedia(`data:${mimeType};base64,${Buffer.from(buffer).toString('base64')}`);
          return {
            ok: true,
            value: {
              dataUrl: url,
              hfBody,
              hfCustom,
              sentSeed: hfBody.parameters?.seed ?? null,
              sentSteps: hfBody.parameters?.num_inference_steps ?? null,
              sentCfg: hfBody.parameters?.guidance_scale ?? null,
            },
          };
        },
      });

      hfKeyRotation = infRotated.keyRotation;
      if (!infRotated.ok) {
        if (infRotated.localPayload) {
          return res.status(infRotated.lastStatus).json({ ...infRotated.localPayload, keyRotation: infRotated.keyRotation });
        }
        let parsedError: any;
        try {
          parsedError = JSON.parse(infRotated.lastBody);
        } catch {
          parsedError = { error: infRotated.lastBody };
        }
        return res.status(infRotated.lastStatus).json({
          error: infRotated.keyRotation.summary,
          details: parsedError.error || parsedError.message || infRotated.lastBody,
          model,
          keyRotation: infRotated.keyRotation,
          errorSource: 'upstream',
        });
      }

      dataUrl = infRotated.value.dataUrl;
      hfInferenceRequest = {
        actualParameters: infRotated.value.hfBody,
        overrides: infRotated.value.hfCustom.overrides,
        customParameters: infRotated.value.hfCustom.customParameters,
      };
      sentSeed = infRotated.value.sentSeed;
      sentSteps = infRotated.value.sentSteps;
      sentCfg = infRotated.value.sentCfg;
    }

    const hfActual = (zImageRequest || hfInferenceRequest)?.actualParameters as Record<string, any> | undefined;
    const sentPrompt = isZImage ? hfActual?.prompt : hfActual?.inputs;
    const hfOverrides = (zImageRequest || hfInferenceRequest)?.overrides || [];
    const item = await recordHistoryItem({
      url: dataUrl,
      prompt: typeof sentPrompt === 'string' ? sentPrompt : finalPrompt,
      negativePrompt: isZImage ? undefined : (hfActual?.parameters?.negative_prompt ?? negative_prompt),
      provider: 'Hugging Face',
      model,
      seed: sentSeed,
      steps: sentSteps,
      cfg: sentCfg,
      width: typeof hfActual?.parameters?.width === 'number' ? hfActual.parameters.width : null,
      height: typeof hfActual?.parameters?.height === 'number' ? hfActual.parameters.height : null,
      requestMetadata: { requestedParameters: sanitizeGenerationMetadata(Object.fromEntries(Object.entries(req.body).filter(([key]) => key !== 'workflowSnapshot'))), actualParameters: hfActual, overrides: hfOverrides, route: isZImage ? 'z-image-space /gradio_api/call/generate' : 'hf-inference', ...(hfKeyRotation ? { keyRotation: hfKeyRotation } : {}) },
    });

    return res.json({
      imageUrl: dataUrl,
      provider: 'Hugging Face',
      actualProvider: 'Hugging Face',
      model,
      actualModel: model,
      historyItem: item,
      overrides: hfOverrides,
      ...(hfKeyRotation ? { keyRotation: hfKeyRotation } : {}),
    });
  } catch (error: any) {
    return res.status(error.status || 500).json({ error: `Hugging Face 调用失败: ${error.message}` });
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
    // LoRA repository ID / weighted map format verified from the official model example.
      // cfg / denoise / image_url: 仍 400（不在本项范围）。


      // Site is bound to the route (CN vs AI). Never mix CN Token into AI (or the reverse).
      const routeIsAi = /modelscope_ai/.test(String(req.originalUrl || req.path || ''));
      const headerSite = String(req.headers['x-modelscope-site'] || req.body?.site || '').toLowerCase();
      if (headerSite && ((routeIsAi && headerSite === 'cn') || (!routeIsAi && headerSite === 'ai'))) {
        return res.status(400).json({
          error: `魔搭站点冲突：路由为 ${routeIsAi ? '国际站 modelscope_ai' : '国内站 modelscope'}，但请求标注 site=${headerSite}；CN 与 AI 令牌/域名隔离，未出站。`,
          errorSource: 'local',
        });
      }
      const isAiSite = routeIsAi;
      const poolName = isAiSite ? 'modelscope_ai' : 'modelscope';
      // AI: only x-modelscope-ai-token / modelscope_ai pool. CN: only x-modelscope-token. No cross-fallback.
      const headerToken = isAiSite
        ? (req.headers['x-modelscope-ai-token'] as string)
        : (req.headers['x-modelscope-token'] as string);
      const token = keyPoolManager.getNextKey(poolName, headerToken || undefined) || '';

      if (!token) {
        return res.status(400).json({
          error: `未配置魔搭${isAiSite ? '国际站 (modelscope.ai)' : '国内站 (modelscope.cn)'} Token，请在右上角设置中填写您的 API Token。`,
          errorSource: 'local',
        });
      }

      const finalPrompt = prompt || '';
      let msBuilt: ReturnType<typeof buildModelScopeImagePayload>;
      try { msBuilt = buildModelScopeImagePayload({ ...req.body, prompt: finalPrompt }); }
      catch (error: any) { return res.status(400).json({error: error.message}); }
      const payload: any = msBuilt.payload;
      const parameterMappings = msBuilt.parameterMappings;
      const msOmissions = msBuilt.omitted;
      const msSchemaFields = msBuilt.schemaFields;
      declareSchemaFields(msSchemaFields);
      const msCustom = applyCustomParameters(payload, req.body.custom_parameters);
      const msPayload = msCustom.payload as Record<string, any>;
      const msActualModel = String(msCustom.actualModel || model);

      const primaryDomain = isAiSite
        ? 'https://api-inference.modelscope.ai/v1'
        : 'https://api-inference.modelscope.cn/v1';

      let submitResp;
      try {
        submitResp = await upstreamFetch(
          { provider: poolName, route: req.path, model: msActualModel, key: token },
          `${primaryDomain}/images/generations`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'X-ModelScope-Async-Mode': 'true',
            },
            body: JSON.stringify(msPayload),
          }
        );

        if (!submitResp.ok) {
          const errorText = await submitResp.text();
          keyPoolManager.recordResult(poolName, token, false, Date.now() - startTime, errorText, submitResp.status);
          let errObj: any = null;
          try { errObj = JSON.parse(errorText); } catch {}
          const errMsg = errObj?.Message || errObj?.message || errorText;
          const isBalance = /insufficient balance|balance insufficient|余额不足|quota.*exceed|额度不足/i.test(errMsg);

          const friendlyErr = isBalance
            ? `魔搭${isAiSite ? '国际站 (modelscope.ai)' : '国内站 (modelscope.cn)'} 账户额度不足 [${submitResp.status}]: ${errMsg}`
            : `魔搭${isAiSite ? '国际站 (modelscope.ai)' : '国内站 (modelscope.cn)'} API 提交失败 [${submitResp.status}]: ${errMsg}`;

          return res.status(submitResp.status).json({
            error: friendlyErr,
            details: errorText,
            model,
            provider: isAiSite ? 'ModelScope AI' : 'ModelScope CN',
            actualRequest: {
              endpoint: `${primaryDomain}/images/generations`,
              parameters: msPayload,
            },
            requestMetadata: {
              actualParameters: msPayload,
              schemaFields: msSchemaFields,
              parameterMappings,
              parameterOmissions: msOmissions,
              upstreamEndpoint: `${primaryDomain}/images/generations`,
            },
          });
        }
      } catch (e: any) {
        return res.status(500).json({
          error: `魔搭${isAiSite ? '国际站 (modelscope.ai)' : '国内站 (modelscope.cn)'} 网络请求失败: ${e.message}`,
        });
      }

      keyPoolManager.recordResult(poolName, token, true, Date.now() - startTime);
      const submitData = await submitResp.json();
      let outputImages: string[] = Array.isArray(submitData.output_images) ? submitData.output_images : [];
      let imageUrl = outputImages[0];

      if (!imageUrl && submitData.task_id) {
        const taskId = submitData.task_id;
        for (let i = 0; i < 45; i++) {
          await new Promise((r) => setTimeout(r, 2500));
          let pollResp: Response;
          try {
            pollResp = await upstreamFetch(
              { provider: poolName, route: req.path, model: msActualModel, key: token },
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
              outputImages = Array.isArray(pollData.output_images) ? pollData.output_images : [];
              imageUrl = outputImages[0];
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
      return await respondWithGeneratedImages(res, outputImages.length ? outputImages : [imageUrl], {
        prompt: typeof msPayload.prompt === 'string' ? msPayload.prompt : finalPrompt,
        negativePrompt: typeof msPayload.negative_prompt === 'string' ? msPayload.negative_prompt : negative_prompt,
        provider: providerName,
        model: msActualModel,
        actualModel: msActualModel,
        seed: msPayload.seed ?? null,
        steps: msPayload.steps ?? null,
        cfg: msPayload.guidance ?? null,
        loras: typeof msPayload.loras === 'string' ? [{name: msPayload.loras, strength: 1}] : Object.entries(msPayload.loras || {}).map(([name, strength]) => ({name, strength: Number(strength)})),
        requestMetadata: { requestedParameters: sanitizeGenerationMetadata(Object.fromEntries(Object.entries(req.body).filter(([key]) => key !== 'workflowSnapshot'))), actualParameters: msPayload, actualModel: msActualModel, customParameters: msCustom.customParameters, overrides: msCustom.overrides, parameterMappings, parameterOmissions: msOmissions, schemaFields: msSchemaFields, upstreamEndpoint: `${primaryDomain}/images/generations` },
      }, {
        label: `魔搭${isAiSite ? '国际站' : '国内站'}`,
        response: { provider: providerName, model: msActualModel, requestedModel: model, actualModel: msActualModel, overrides: msCustom.overrides, parameterMappings, parameterOmissions: msOmissions },
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
  const nanoAuth = resolveProviderAuth(req, 'nanogpt');
  const nanoKey = nanoAuth.apiKey || keyPoolManager.getNextKey('nanogpt', (req.headers['x-nanogpt-key'] as string) || undefined);
  if (!nanoKey) {
    return res.status(400).json({ error: '未配置 NanoGPT API Key (x-nanogpt-key)。' });
  }
  const nanoBase = (nanoAuth.baseUrl || 'https://api.nano-gpt.com/api/v1').replace(/\/+$/, '');
  const nanoApiV1 = nanoBase.endsWith('/api/v1') ? nanoBase : nanoBase.endsWith('/v1') ? nanoBase.replace(/\/v1$/, '/api/v1') : `${nanoBase}/api/v1`;

  try {
    const { prompt, model, resolution, aspect_ratio, seed, image_url } = req.body;
    if (!model) return res.status(400).json({ error: '模型为必填项（model is required）' });
    const capabilityResponse = await upstreamFetch({provider:'nanogpt',route:'model-capabilities',model},`${nanoApiV1}/images/models/${encodeURI(model)}/endpoints`,{});
    if (!capabilityResponse.ok) return res.status(capabilityResponse.status).json({error:`NanoGPT 模型能力查询失败 [${capabilityResponse.status}]`,details:await capabilityResponse.text()});
    const capabilities = await capabilityResponse.json();
    if (capabilities.id!==model || !Array.isArray(capabilities.endpoints) || capabilities.endpoints.length<1) return res.status(400).json({error:'NanoGPT 模型能力元数据未能核实',details:capabilities});
    let built;
    try {built=buildNanoImagePayload(req.body,capabilities.endpoints[0]);} catch (error:any) {return res.status(400).json({error:error.message});}
    const {payload,capabilityNotes}=built;

    // POST api.nano-gpt.com/api/v1/images
    const response = await upstreamFetch(
      { provider: 'nanogpt', route: req.path, model, key: nanoKey },
      `${nanoApiV1}/images`,
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
    const images = Array.isArray(data.data) ? data.data : Array.isArray(data.images) ? data.images : [data.image_url || data.url].filter(Boolean);
    const actualModel = String(payload.model || model);
    return await respondWithGeneratedImages(res, images, {
      prompt: payload.prompt ?? prompt, provider: 'NanoGPT', model: actualModel, actualModel,
      seed: payload.seed ?? null, steps: payload.steps ?? null, cfg: payload.guidance_scale ?? null,
      requestMetadata: { requestedParameters: sanitizeGenerationMetadata(req.body), customParameters: req.body.custom_parameters, actualParameters: payload, capabilityNotes },
    }, { label: 'NanoGPT', response: { provider: 'NanoGPT', model: actualModel, actualModel, requestedModel: model, capabilityNotes, actualRequest: { endpoint: `${nanoApiV1}/images`, parameters: payload } } });
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
    // which has no negative prompt / cfg / steps / LoRA / seed（ImageConfig 仅 aspectRatio+imageSize）。
    if (rejectUnsupported(res, 'Google Gemini', req.body, ['negative_prompt', 'cfg', 'guidance_scale', 'steps', 'loras', 'seed','sampler_name','scheduler','denoise'])) return;
    if (image_url && !(typeof image_url === 'string' && image_url.startsWith('data:'))) {
      return res.status(400).json({ error: '该服务商不支持: image_url 为非 data: URL（Google Gemini 仅接受内联 base64 参考图）', unsupported: ['image_url'] });
    }

    if (modelStatus('gemini',model,new Date().toISOString().slice(0,10))==='deprecated') return res.status(400).json({error:`${model} 已由 Google 下线，请明确选择当前可用模型；不会自动替换`,model,source:'https://ai.google.dev/gemini-api/docs/deprecations'});
    // 按所选模型验证参数；未知能力不猜测。
    const fieldStatus: Record<string, string> = {};
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

    const parameterOmissions = sanitizeGenerationMetadata(req.body.parameterOmissions || []);
    const requestedParameters = sanitizeGenerationMetadata(Object.fromEntries(Object.entries(req.body).filter(([key]) => key !== 'workflowSnapshot')));
    generationContext.getStore()?.traces.push({ stage: 'parameter-omissions', parameterOmissions });
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

    // 只放用户实际传了的字段；seed 该服务商不支持（不写入 generationConfig）
    const config: Record<string, any> = {};
    if (Object.keys(imageConfig).length > 0) config.imageConfig = imageConfig;
    // Custom JSON accepts the REST shape (generationConfig) or SDK shape (config); other top-level fields are
    // SDK config fields too. Nested objects such as imageConfig are deep-merged so unedited fields survive.
    const geminiCustom = parseCustomObject(req.body.custom_parameters) || {};
    const { model: customModel, generationConfig: customGenerationConfig, config: customConfig, ...customTopLevel } = geminiCustom as Record<string, any>;
    const geminiCustomRequest = {
      ...(customModel !== undefined ? { model: customModel } : {}),
      config: { ...customTopLevel, ...(customConfig || {}), ...(customGenerationConfig || {}) },
    };
    const custom = applyCustomParameters({ model, config }, Object.keys(geminiCustomRequest.config).length || customModel !== undefined ? geminiCustomRequest : undefined);
    const actualModel = String(custom.actualModel || model);
    const sentConfig = (custom.payload.config || {}) as Record<string, any>;
    const geminiOverrides = custom.overrides;
    const actualRequest = { model: actualModel, contents: { parts }, config: sentConfig };
    const contentResponse = await upstreamSdkCall(
      { provider: 'gemini', route: req.path, model: actualModel, key: gen.apiKey, upstream: `generativelanguage.googleapis.com/v1beta/models/${actualModel}:generateContent`, parameters: actualRequest },
      () => gen!.client.models.generateContent({
        model: actualModel,
        contents: { parts },
        ...(Object.keys(sentConfig).length > 0 ? { config: sentConfig } : {}),
      })
    );

    const imageParts = (contentResponse.candidates?.[0]?.content?.parts || []).filter((part: any) => part.inlineData?.data);
    if (!imageParts.length) {
      keyPoolManager.recordResult('gemini', gen.apiKey, false, Date.now() - startTime, 'No image returned from Gemini', 500);
      return res.status(502).json({ error: 'Google Gemini 图像模型未返回生成数据', errorSource: 'upstream', rawResponse: sanitizeGenerationMetadata(contentResponse) });
    }
    keyPoolManager.recordResult('gemini', gen.apiKey, true, Date.now() - startTime);

    const mStatus = modelStatus('gemini', actualModel, new Date().toISOString().slice(0, 10));
    return await respondWithGeneratedImages(res, imageParts, {
      prompt,
      provider: 'Google Gemini (官方直连)',
      model: actualModel,
      actualModel,
      actualProvider: 'Google Gemini (官方直连)',
      seed: null, // ImageConfig 无 seed；历史 Seed: 未填写
      steps: null,
      cfg: null,
      loras: [],
      requestMetadata: { requestedParameters, parameterOmissions, customParameters: custom.customParameters, overrides: geminiOverrides, actualRequest },
    }, {
      label: 'Google Gemini',
      response: {
        provider: 'Google Gemini (官方直连)',
        actualProvider: 'Google Gemini (官方直连)',
        model: actualModel,
        requestedModel: model,
        actualModel,
        aspectRatio: sentConfig.imageConfig?.aspectRatio ?? aspect_ratio,
        actualRequest,
        parameterOmissions,
        overrides: geminiOverrides,
        requestMetadata: { requestedParameters, parameterOmissions, overrides: geminiOverrides },
        fieldStatus,
        ...(mStatus !== 'supported' ? { modelStatus: mStatus } : {}),
      },
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
    if (['muapi','wavespeed','sogni','krea','together','aimlapi','novita','venice'].includes(prov)) {
      const urls:Record<string,string>={muapi:'https://api.muapi.ai/api/v1/models',wavespeed:'https://api.wavespeed.ai/api/v3/models',sogni:'https://api.sogni.ai/v1/creative-agent/workflows?limit=1',krea:'https://api.krea.ai/styles?limit=1',together:'https://api.together.ai/v1/models',aimlapi:'https://api.aimlapi.com/v2/billing',novita:'https://api.novita.ai/openapi/v1/billing/balance/detail',venice:'https://api.venice.ai/api/v1/models?type=image'};
      const resp=await upstreamFetch({provider:prov,route:routePath,key:singleKey},urls[prov],{headers:prov==='muapi'?{'x-api-key':singleKey}:{Authorization:`Bearer ${singleKey}`}});
      const raw=await resp.text();
      return {maskedKey,status:resp.ok?(prov==='muapi'?'warning':'ok'):'error',latency:Date.now()-startTime,message:`HTTP ${resp.status} · ${urls[prov]} · ${resp.ok?'只读接口可访问；尚未验证生成权限':'原始响应：'+raw}`};
    }
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
        status: 'warning',
        latency,
        message: 'Civitai 公共模型检索可用；该公开接口不能证明密钥有效或具备生成权限',
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
          message: `Hugging Face Token 鉴权通过：@${whoami.name || 'User'}；模型访问、推理权限与额度需以生成接口结果为准`,
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
      const nanoBase = getProviderBaseUrl('nanogpt');
      if (!nanoBase.baseUrl) {
        return { maskedKey, status: 'error', latency: 0, message: nanoBase.error || '未配置 NanoGPT Base URL' };
      }
      const nanoBalanceUrl = `${new URL(nanoBase.baseUrl).origin}/api/check-balance`;
      const resp = await upstreamFetch(
        { provider: 'nanogpt', route: routePath, key: singleKey },
        nanoBalanceUrl,
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

    if (prov === 'tensorart' || prov === 'openworks') {
      if (!singleKey) return {maskedKey,status:'error',latency:0,message:'未配置 Tensor.Art OpenWorks Access Key（ak_tensor_…）'};
      if (!(isOpenWorksAccessKey(singleKey) || singleKey.startsWith('ak_'))) {
        return {maskedKey,status:'error',latency:0,message:'本产品 Tensor.Art 仅 OpenWorks：请填 ak_tensor_… / ak_tusi…（Echo-Access-Key）。非 OpenWorks Key 不会当作 TAMS Bearer 使用。'};
      }
      const base = singleKey.startsWith('ak_tusi') ? 'https://openapi.tusiart.cn/openworks/v1' : 'https://openapi.tensor.art/openworks/v1';
      const resp = await upstreamFetch(
        { provider: 'openworks', route: routePath, model: 'catalog', key: singleKey },
        `${base}/tool/list`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'Echo-Access-Key': singleKey }, body: '{}' }
      );
      const latency = Date.now() - startTime;
      const raw = await resp.text().catch(() => '');
      let count = 0;
      try { const j = JSON.parse(raw); count = Array.isArray(j?.data?.tools) ? j.data.tools.length : 0; } catch { /* raw */ }
      if (resp.ok && (raw.includes('"code":"0"') || raw.includes('"code":0'))) {
        return {maskedKey,status:'ok',latency,message:`OpenWorks 目录连通（POST ${base}/tool/list；${count} 个工具）`};
      }
      return {maskedKey,status:resp.status===429?'rate_limited':'error',latency,message:`OpenWorks 鉴权/目录失败 [${resp.status}]: ${raw.slice(0,300)}`};
    }

    if (prov === 'replicate') {
      if (!singleKey) {
        return { maskedKey, status: 'error', latency: 0, message: '未配置 Replicate API 密钥' };
      }
      const resp = await upstreamFetch(
        { provider: 'replicate', route: routePath, model: 'account', key: singleKey },
        `${getProviderBaseUrl('replicate').baseUrl || 'https://api.replicate.com/v1'}/account`,
        { headers: { Authorization: `Bearer ${singleKey}` } }
      );
      const latency = Date.now() - startTime;
      if (resp.ok) {
        const data = await resp.json().catch(() => ({}));
        const username = data.username || data.name || '';
        return {
          maskedKey,
          status: 'ok',
          latency,
          message: `Replicate 认证成功${username ? `（用户: ${username}）` : ''}`,
        };
      }
      const errText = await resp.text().catch(() => '');
      return {
        maskedKey,
        status: resp.status === 429 ? 'rate_limited' : 'error',
        latency,
        message: `Replicate 鉴权失败 [${resp.status}]: ${errText.slice(0, 200)}`,
      };
    }

    if (prov === 'runware' || prov === 'modelslab') {
      return {
        maskedKey,
        status: 'unsupported',
        latency: 0,
        message: `${NO_READONLY_TEST}（官方仅提供生成任务端点，无独立只读鉴权探针）`,
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
    const isSuccess = r.status === 'ok' || r.status === 'active';
    if (k && r.status !== 'unsupported' && r.status !== 'warning') {
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
      status: single.status === 'warning' ? 'warning' : single.status === 'ok' || single.status === 'active' ? 'ok' : 'error',
      latency: single.latency,
      message: single.message,
      results,
    });
  }

  const allOk = results.every((r) => r.status === 'ok' || r.status === 'active' || r.status === 'warning');
  const summaryMsg = `共测试 ${results.length} 个密钥：\n` + results.map((r) => `• [${r.maskedKey || '未设Key'}]: ${r.message} (${r.latency}ms)`).join('\n');
  const avgLatency = Math.round(results.reduce((acc, r) => acc + r.latency, 0) / results.length);
  return res.json({
    status: allOk ? results.some((r) => r.status === 'warning') ? 'warning' : 'ok' : 'error',
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
  'runware',
  'modelslab',
  'replicate',
]);
const VALID_STRATEGIES = new Set(['round_robin']);

// Update Key Pool Strategy
app.post('/api/cloud-keys/strategy', requireAdminAuth, (req, res) => {
  const { provider, strategy } = req.body;
  if (!provider || typeof provider !== 'string' || !VALID_STRATEGY_PROVIDERS.has(provider)) {
    return res.status(400).json({ error: `未知或不支持的 provider: "${provider}"` });
  }
  if (!strategy || typeof strategy !== 'string' || !VALID_STRATEGIES.has(strategy)) {
    return res.status(400).json({ error: `不支持的策略: "${strategy}"。为避免失败后自动换 Key，当前只允许 round_robin` });
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
    const isSuccess = r.status === 'ok' || r.status === 'active';
    if (r.status !== 'unsupported' && r.status !== 'warning') {
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

    // Tensor.Art = OpenWorks only（密钥槽 tensorartKey / ak_tensor_…）
    (async () => {
      const taKeys = keyPoolManager.getKeys('tensorart');
      const hasOw = taKeys.some((k) => isOpenWorksAccessKey(k) || String(k).startsWith('ak_'))
        || isOpenWorksAccessKey(String(defaultKeys.tensorartKey || ''))
        || isOpenWorksAccessKey(String(cloudSettings['tensorartKey'] || ''));
      if (hasOw) {
        balances.tensorart = { status: 'unknown', detail: 'OpenWorks Access Key 已配置（官方无独立余额接口；以 /tool/list 连通与出图为准）' };
        balances.openworks = { status: 'unknown', detail: '与 tensorartKey 共用；画布选「Tensor.Art OpenWorks」' };
      }
    })(),

    // NanoGPT
    (async () => {
      const nanoKey = keyPoolManager.getNextKey('nanogpt');
      if (nanoKey) {
        try {
          const nanoBase = getProviderBaseUrl('nanogpt');
          if (!nanoBase.baseUrl) {
            balances.nanogpt = { status: 'error', detail: nanoBase.error || '未配置 NanoGPT Base URL' };
            return;
          }
          const nanoBalanceUrl = `${new URL(nanoBase.baseUrl).origin}/api/check-balance`;
          const resp = await upstreamFetch(
            { provider: 'nanogpt', route: '/api/cloud-keys/balances', key: nanoKey },
            nanoBalanceUrl,
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
/** List payload: drop workflowSnapshot + bulky traces/raw bodies so opening History does not ship multi‑MB JSON. */
function slimHistoryForList(item: any) {
  if (!item || typeof item !== 'object') return item;
  const {
    workflowSnapshot,
    stack,
    upstreamResponseBody,
    ...rest
  } = item;
  const md = rest.requestMetadata && typeof rest.requestMetadata === 'object' ? rest.requestMetadata : undefined;
  if (!md) {
    return {
      ...rest,
      hasWorkflowSnapshot: !!workflowSnapshot,
      hasStack: typeof stack === 'string' && stack.length > 0,
      hasUpstreamResponseBody: upstreamResponseBody != null && upstreamResponseBody !== '',
    };
  }
  const {
    executionTrace,
    submissions,
    submit,
    poll,
    persistence,
    ...mdRest
  } = md as any;
  return {
    ...rest,
    hasWorkflowSnapshot: !!workflowSnapshot,
    hasStack: typeof stack === 'string' && stack.length > 0,
    hasUpstreamResponseBody: upstreamResponseBody != null && upstreamResponseBody !== '',
    requestMetadata: {
      ...mdRest,
      // Keep actualRequest for seed/prompt chips; omit poll/submit/trace blobs from the list.
      actualRequest: md.actualRequest,
      route: md.route,
      hasExecutionTrace: Array.isArray(executionTrace) && executionTrace.length > 0,
    },
  };
}

app.get('/api/history', (req, res) => {
  const rawLimit = req.query.limit;
  const rawOffset = req.query.offset;
  const wantsPage = rawLimit != null || rawOffset != null || String(req.query.format || '') === 'page';
  const full = String(req.query.full || '') === '1';
  const total = generationHistory.length;
  if (!wantsPage) {
    // Default: full chronology, slim records (no workflowSnapshot dump).
    return res.json(full ? generationHistory : generationHistory.map(slimHistoryForList));
  }
  const limit = Math.min(100, Math.max(1, parseInt(String(rawLimit ?? '40'), 10) || 40));
  const offset = Math.max(0, parseInt(String(rawOffset ?? '0'), 10) || 0);
  const slice = generationHistory.slice(offset, offset + limit);
  const items = full ? slice : slice.map(slimHistoryForList);
  return res.json({ items, total, limit, offset, hasMore: offset + items.length < total });
});

app.get('/api/history/:id', (req, res) => {
  const item = generationHistory.find((h: any) => h && h.id === req.params.id);
  if (!item) return res.status(404).json({ error: '未找到该历史记录', errorSource: 'local' });
  return res.json(item);
});

const MAX_HISTORY_ITEM_BYTES = 500 * 1024; // 500KB

app.post('/api/history', async (req, res, next) => {
  try {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: '请求体必须为有效的 JSON 对象' });
  }

  // Media bytes live in the media store; the size limit applies to the record itself.
  req.body = await externalizeMedia(req.body);
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
    sampler,
    scheduler,
    width,
    height,
    loras,
    workflowSnapshot,
    requestMetadata,
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

  let durableUrl = await externalizeMedia(effectiveUrl);
  if (
    typeof durableUrl === 'string' &&
    !durableUrl.startsWith('data:') &&
    /orchestration[^/]*\.civitai\.com/i.test(durableUrl)
  ) {
    const persisted = await persistRemoteUrlAsDataUrl(durableUrl);
    if (persisted) durableUrl = persisted;
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
  if (seed != null && typeof seed !== 'number') {
    return res.status(400).json({ error: '字段 seed 必须为数字' });
  }
  if (steps != null && typeof steps !== 'number') {
    return res.status(400).json({ error: '字段 steps 必须为数字' });
  }
  if (cfg != null && typeof cfg !== 'number') {
    return res.status(400).json({ error: '字段 cfg 必须为数字' });
  }
  if (sampler != null && typeof sampler !== 'string') return res.status(400).json({error:'字段 sampler 必须为字符串'});
  if (scheduler != null && typeof scheduler !== 'string') return res.status(400).json({error:'字段 scheduler 必须为字符串'});
  if (width != null && typeof width !== 'number') return res.status(400).json({error:'字段 width 必须为数字'});
  if (height != null && typeof height !== 'number') return res.status(400).json({error:'字段 height 必须为数字'});
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
  if (requestMetadata !== undefined && (!requestMetadata || typeof requestMetadata !== 'object' || Array.isArray(requestMetadata))) return res.status(400).json({error: 'requestMetadata 必须为对象'});

  // Construct sanitized item with only whitelisted fields
  const item: GeneratedItem = {
    id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: Date.now(),
    url: durableUrl,
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
    sampler: typeof sampler === 'string' && sampler.trim() ? sampler.trim() : null,
    scheduler: typeof scheduler === 'string' && scheduler.trim() ? scheduler.trim() : null,
    width: typeof width === 'number' ? width : null,
    height: typeof height === 'number' ? height : null,
    ...(Array.isArray(loras) ? { loras } : {}),
    ...(workflowSnapshot && typeof workflowSnapshot === 'object' ? { workflowSnapshot: sanitizeGenerationMetadata(workflowSnapshot) } : {}),
    ...(requestMetadata ? {requestMetadata: sanitizeGenerationMetadata(requestMetadata)} : {}),
  };

  const nextHistory = [item,...generationHistory].slice(0,MAX_HISTORY_COUNT);
  writeJsonFile(HISTORY_FILE,nextHistory);
  generationHistory = nextHistory;
  return res.json(item);
  } catch (error) {return next(error);}
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

// Catalog/Schema GET failed before generation → failed history card (POST never sent).
app.post('/api/history/prefetch-failure', async (req, res) => {
  let item: Record<string, any>;
  // Written only by a user's run in the canvas UI (driver sets x-canvas-origin); never by load / hydrate / scripts.
  if (requestOriginOf(req) !== 'browser') return res.status(403).json({ error: '仅画布界面里的一次运行可写入预取失败记录（缺少 x-canvas-origin: browser-ui）；未写入历史', errorSource: 'local' });
  try { item = buildPrefetchFailureHistoryItem(req.body); } catch (e: any) { return res.status(400).json({ error: e.message }); }
  try { const saved = await recordHistoryItem({ ...item, requestOrigin: requestOriginOf(req) } as any); return res.json({ ok: true, historyItem: saved }); }
  catch (e: any) { return res.status(500).json({ error: `失败记录写入历史失败：${e?.message || e}` }); }
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

app.post('/api/cloud/projects', async (req, res, next) => {
  try {
    const { id, name = '未命名无限画布项目', description, canvasMode = 'spatial', transform, connections = [] } = req.body;
    const { spatialFrames = [], nodes = [], thumbnail } = await externalizeMedia({ spatialFrames: req.body.spatialFrames, nodes: req.body.nodes, thumbnail: req.body.thumbnail });

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

    const nextProjects = existingIndex >= 0 ? cloudProjects.map((item,index) => index === existingIndex ? projectData : item) : [projectData,...cloudProjects];
    writeJsonFile(PROJECTS_FILE,nextProjects);
    cloudProjects = nextProjects;
    return res.json({success:true,project:projectData});
  } catch (error) {return next(error);}
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
  'muapiKey', 'wavespeedKey', 'sogniKey', 'kreaKey', 'togetherKey', 'aimlapiKey', 'novitaKey', 'veniceKey',
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
  'runwareKey',
  'modelslabKey',
  'replicateKey',
]);

const ALLOWED_SETTINGS_PLAIN = new Set([
  'agnesBaseUrl',
  'sensenovaBaseUrl',
  'openaiCompatBaseUrl',
  'grokCompatBaseUrl',
  'runwareBaseUrl',
  'modelslabBaseUrl',
  'replicateBaseUrl',
  'nanogptBaseUrl',
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

  // Global Express JSON error middleware - replaces default HTML error page, returns structured error without swallowing
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) {
      console.error('[ComfyCanvas Studio] Error after headers sent:', err);
      return res.end();
    }
    const status = Number.isInteger(err?.status) && err.status >= 400 && err.status <= 599
      ? err.status
      : Number.isInteger(err?.statusCode) && err.statusCode >= 400 && err.statusCode <= 599
      ? err.statusCode
      : 500;
    const errorSource = err?.errorSource || (err?.rawResponse ? 'upstream' : 'local');
    const payload: Record<string, any> = {
      error: err?.message || '服务器内部异常',
      errorSource,
    };
    if (err?.stack) payload.stack = err.stack;
    if (err?.details !== undefined) payload.details = err.details;
    if (err?.rawResponse !== undefined) payload.rawResponse = err.rawResponse;
    res.status(status).json(payload);
  });

  const HOST = '127.0.0.1';
  app.listen(PORT, process.argv.includes('--host') ? process.argv[process.argv.indexOf('--host')+1] : '127.0.0.1', () => {
    console.log(`[ComfyCanvas Studio] Server listening on 127.0.0.1:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
