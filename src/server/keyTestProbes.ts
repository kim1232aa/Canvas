// Read-only key probes for the providers whose "test connection" used to return a
// hardcoded status without ever contacting the upstream.
//
// Probe sources (read 2026-11-07):
// - ModelScope CN: https://www.modelscope.cn/docs/model-service/API-Inference/intro
//   documents base_url https://api-inference.modelscope.cn/v1/ with Authorization: Bearer.
// - ModelScope AI: https://www.modelscope.ai/docs/model-service/API-Inference/intro
//   documents base_url https://api-inference.modelscope.ai/v1/.
//   Neither page lists GET /v1/models; the probe is the OpenAI-compatible model list on
//   the documented base, and whatever the upstream answers is returned verbatim.
// - Agnes: https://wiki.agnes-ai.com/en/docs/quickstart documents only
//   POST https://apihub.agnes-ai.com/v1/chat/completions. No models endpoint is documented.
//   The probe is the same GET ${baseUrl}/models the balance check already sends.
// - SenseNova: https://github.com/OpenSenseNova/SenseNova6.7/blob/main/API.md documents only
//   POST https://token.sensenova.cn/v1/chat/completions. No models endpoint is documented.
//   The probe is the same GET ${baseUrl}/models the balance check already sends.
// - TAMS: https://tams-docs.tensor.art/docs/use-cases/model/simple/ documents
//   GET /v1/models/{modelId} returning { model: { id, name, ... } }. A missing model.name
//   is reported as missing; it is never replaced with a name the upstream did not send.

export interface KeyProbeFetchMeta {
  provider: string;
  route: string;
  model?: string;
  key?: string;
}

export type KeyProbeFetch = (meta: KeyProbeFetchMeta, url: string, init?: RequestInit) => Promise<Response>;

export interface KeyProbeResult {
  status: 'ok' | 'error' | 'rate_limited';
  latency: number;
  message: string;
}

export interface KeyProbeDeps {
  upstreamFetch: KeyProbeFetch;
  /** Server-configured base URL (settings > env > declared default). Never a request header. */
  resolveBaseUrl: (provider: 'agnes' | 'sensenova') => { baseUrl: string; error?: string };
  /** TAMS model API origin, already stripped of a trailing /v1. */
  resolveTamsOrigin: () => string;
  now?: () => number;
}

const MODEL_LIST = 'models';

/** Documented API-Inference bases. modelscope_cn is an alias of the CN site. */
export const MODELSCOPE_PROBE_URLS: Record<'modelscope' | 'modelscope_cn' | 'modelscope_ai', string> = {
  modelscope: 'https://api-inference.modelscope.cn/v1/models',
  modelscope_cn: 'https://api-inference.modelscope.cn/v1/models',
  modelscope_ai: 'https://api-inference.modelscope.ai/v1/models',
};

/** Same model id the TAMS model-info lookup already queries; the name comes from the response. */
export const TAMS_PROBE_MODEL_ID = '613045163490732233';

function elapsed(startedAt: number, now: () => number): number {
  return Math.max(0, now() - startedAt);
}

async function readBody(resp: Response): Promise<string> {
  try {
    return await resp.text();
  } catch (error: any) {
    return `响应体读取失败: ${error?.message || error}`;
  }
}

function upstreamMessage(label: string, url: string, status: number, body: string, okNote: string): string {
  return `HTTP ${status} · ${url} · ${okNote ? okNote : `原始响应：${body}`}`;
}

/**
 * GET the documented ModelScope inference base's /v1/models with the user's token.
 * modelscope and modelscope_cn share the CN host; modelscope_ai uses the AI host.
 */
export async function probeModelScopeKey(
  deps: KeyProbeDeps,
  provider: string,
  key: string,
  routePath: string,
): Promise<KeyProbeResult> {
  const startedAt = (deps.now ?? Date.now)();
  const prov = provider.toLowerCase().trim() as keyof typeof MODELSCOPE_PROBE_URLS;
  const url = MODELSCOPE_PROBE_URLS[prov];
  if (!url) {
    return { status: 'error', latency: 0, message: `未知 ModelScope 站点: ${provider}（未发送请求）` };
  }
  if (!key) {
    return { status: 'error', latency: 0, message: `未配置 ${provider} Token（未发送请求）` };
  }
  const resp = await deps.upstreamFetch(
    { provider: prov === 'modelscope_cn' ? 'modelscope' : prov, route: routePath, model: MODEL_LIST, key },
    url,
    { headers: { Authorization: `Bearer ${key}` } },
  );
  const body = await readBody(resp);
  const latency = elapsed(startedAt, deps.now ?? Date.now);
  if (resp.ok) {
    return {
      status: 'ok',
      latency,
      message: upstreamMessage(provider, url, resp.status, '', '只读 GET /v1/models 可访问；尚未验证生成权限'),
    };
  }
  return {
    status: resp.status === 429 ? 'rate_limited' : 'error',
    latency,
    message: upstreamMessage(provider, url, resp.status, body, ''),
  };
}

/**
 * GET ${baseUrl}/models — the same read-only call the balance endpoint already makes.
 * Official docs for both providers list only generation/chat endpoints, so a non-2xx
 * answer (including 404) is the real result, not a reason to skip the request.
 */
export async function probeOpenAICompatModelsKey(
  deps: KeyProbeDeps,
  provider: 'agnes' | 'sensenova',
  key: string,
  routePath: string,
): Promise<KeyProbeResult> {
  const startedAt = (deps.now ?? Date.now)();
  const label = provider === 'agnes' ? 'Agnes' : 'SenseNova';
  if (!key) {
    return { status: 'error', latency: 0, message: `未配置 ${label} API 密钥（未发送请求）` };
  }
  const { baseUrl, error } = deps.resolveBaseUrl(provider);
  if (error || !baseUrl) {
    return { status: 'error', latency: 0, message: `${error || `未配置 ${label} Base URL`}（未发送请求）` };
  }
  const url = `${baseUrl.replace(/\/+$/, '')}/models`;
  const resp = await deps.upstreamFetch(
    { provider, route: routePath, model: MODEL_LIST, key },
    url,
    { headers: { Authorization: `Bearer ${key}` } },
  );
  const body = await readBody(resp);
  const latency = elapsed(startedAt, deps.now ?? Date.now);
  if (resp.ok) {
    return {
      status: 'ok',
      latency,
      message: upstreamMessage(label, url, resp.status, '', '只读 GET /models 可访问；尚未验证生成权限，也未查询余额'),
    };
  }
  return {
    status: resp.status === 429 ? 'rate_limited' : 'error',
    latency,
    message: upstreamMessage(label, url, resp.status, body, ''),
  };
}

/**
 * GET {tams origin}/v1/models/{id}. The model name printed on success is model.name
 * from the response; when the upstream omits it, the message says so instead of
 * inventing one.
 */
export async function probeTamsKey(
  deps: KeyProbeDeps,
  key: string,
  routePath: string,
): Promise<KeyProbeResult> {
  const startedAt = (deps.now ?? Date.now)();
  if (!key) {
    return { status: 'error', latency: 0, message: '未配置 TAMS Bearer Key（未发送请求）' };
  }
  const origin = String(deps.resolveTamsOrigin() || '').replace(/\/+$/, '');
  if (!origin) {
    return { status: 'error', latency: 0, message: '未配置 TAMS 模型 API 地址（未发送请求）' };
  }
  const url = `${origin}/v1/models/${TAMS_PROBE_MODEL_ID}`;
  const resp = await deps.upstreamFetch(
    { provider: 'tensorart', route: routePath, model: TAMS_PROBE_MODEL_ID, key },
    url,
    { headers: { Authorization: `Bearer ${key}` } },
  );
  const body = await readBody(resp);
  const latency = elapsed(startedAt, deps.now ?? Date.now);
  if (!resp.ok) {
    return {
      status: resp.status === 429 ? 'rate_limited' : 'error',
      latency,
      message: `HTTP ${resp.status} · ${url} · 原始响应：${body}`,
    };
  }
  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = undefined;
  }
  const name = typeof parsed?.model?.name === 'string' ? parsed.model.name.trim() : '';
  const nameNote = name
    ? `上游返回模型名：${name}`
    : '上游未返回 model.name（不会用本地默认名冒充）';
  return {
    status: 'ok',
    latency,
    message: `HTTP ${resp.status} · ${url} · TAMS 模型 API 鉴权成功（${nameNote}）· 原始响应：${body}`,
  };
}
