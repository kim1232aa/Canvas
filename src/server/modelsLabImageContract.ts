import { applyCustomParameters, parseCustomObject, type CustomOverride } from './customParameters';

export interface ModelsLabImageRequest {
  endpoint: string; // 'https://modelslab.com/api/v6/images/text2img'
  payload: Record<string, unknown>;
  overrides: CustomOverride[];
  actualModel: string;
  unmappedLoras?: Array<{ item: unknown; reason: string }>;
}

function isInvalidModelsLabCatalogId(raw: string): boolean {
  const s = raw.trim();
  if (!s) return true;
  if (/^https?:\/\//i.test(s)) return true;
  if (/^(?:urn:)?air:/i.test(s)) return true;
  if (/^[a-z0-9_.-]+:\d+@\d+$/i.test(s)) return true;
  if (/^\d+$/.test(s)) return true;
  if (/\.(?:safetensors|ckpt|pt|bin|pth|onnx)(?:$|[?#])/i.test(s)) return true;
  return false;
}

function resolveModelsLabLoraModel(item: Record<string, any>): { model: string; reason?: string } {
  const resourceSource = String(item.resource_source ?? '').trim().toLowerCase();
  const hasCivitaiIdOrDownload = Boolean(
    String(item.civitaiId ?? item.civitai_id ?? item.downloadUrl ?? item.download_url ?? '').trim()
  );
  const isReselectedNonCivitai = Boolean(resourceSource && resourceSource !== 'civitai' && !hasCivitaiIdOrDownload);
  const isForeignCivitai = isReselectedNonCivitai
    ? false
    : Boolean(
        hasCivitaiIdOrDownload ||
          String(item.air ?? '').trim() ||
          item.import_source_provider === 'civitai' ||
          resourceSource === 'civitai'
      );
  const explicitCandidates = [
    item.lora_model,
    item.loraModel,
    item.catalogId,
    item.catalog_id,
    item.loraId,
    item.lora_id,
    item.slug,
    item.model,
    ...(!isForeignCivitai ? [item.lora_name, item.id, item.name] : []),
  ];
  for (const candidate of explicitCandidates) {
    const s = String(candidate ?? '').trim();
    if (s && !isInvalidModelsLabCatalogId(s)) {
      return { model: s };
    }
  }
  return {
    model: '',
    reason:
      'ModelsLab LoRA 需要目标平台目录中的 lora_model 标识符，不能直接发送 Civitai 权重文件名、下载链接、AIR 或纯数字版本 ID',
  };
}

export interface ModelsLabSuccessResponse {
  status: 'success';
  generationTime?: number;
  id?: number | string;
  output: string[];
  proxy_links?: string[];
  meta?: Record<string, unknown>;
}

export interface ModelsLabProcessingResponse {
  status: 'processing';
  id: number | string;
  eta?: number;
  message?: string;
  future_links?: string[];
}

export interface ModelsLabErrorResponse {
  status: 'error';
  message?: string;
  tip?: string;
}

export type ModelsLabResponse = ModelsLabSuccessResponse | ModelsLabProcessingResponse | ModelsLabErrorResponse;

export type ModelsLabPollBodyInspection =
  | { kind: 'invalid-json'; rawResponse: string; parseError: string }
  | { kind: 'task-error'; rawResponse: string; data: Record<string, any> }
  | { kind: 'data'; rawResponse: string; data: Record<string, any> };

/** Keep the original 2xx poll body available when JSON decoding or task execution fails. */
export function inspectModelsLabPollBody(rawResponse: string): ModelsLabPollBodyInspection {
  let data: unknown;
  try {
    data = JSON.parse(rawResponse);
  } catch (error: any) {
    return { kind: 'invalid-json', rawResponse, parseError: String(error?.message || error) };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { kind: 'invalid-json', rawResponse, parseError: '轮询响应必须是 JSON 对象' };
  }
  const record = data as Record<string, any>;
  return record.status === 'error'
    ? { kind: 'task-error', rawResponse, data: record }
    : { kind: 'data', rawResponse, data: record };
}

export function buildModelsLabImageRequest(
  body: Record<string, unknown>,
  apiKey: string,
  baseUrl = 'https://modelslab.com'
): ModelsLabImageRequest {
  if (!apiKey) throw new Error('ModelsLab API Key 必填');
  const prompt = String(body.prompt || '').trim();
  const modelId = String(body.model_id || body.model || '').trim();
  if (!modelId) throw new Error('ModelsLab 模型为必填项（model_id is required）');

  const requestedSamples = body.samples ?? body.num_images;
  if (requestedSamples !== undefined && requestedSamples !== null) {
    if (typeof requestedSamples !== 'number' || !Number.isFinite(requestedSamples) || !Number.isInteger(requestedSamples)) {
      throw new Error('ModelsLab samples 必须是有限整数');
    }
    if (requestedSamples <= 0) {
      throw new Error('ModelsLab samples 必须是正整数');
    }
  }

  const payload: Record<string, unknown> = {
    key: apiKey,
    prompt,
    model_id: modelId,
    samples: requestedSamples === undefined || requestedSamples === null ? 1 : requestedSamples,
  };

  const neg = String(body.negative_prompt || body.negativePrompt || '').trim();
  if (neg) payload.negative_prompt = neg;

  const hasWidth = typeof body.width === 'number' && Number.isFinite(body.width) && body.width > 0;
  const hasHeight = typeof body.height === 'number' && Number.isFinite(body.height) && body.height > 0;
  if (hasWidth) payload.width = Math.round(body.width as number);
  if (hasHeight) payload.height = Math.round(body.height as number);
  if (hasWidth && hasHeight) {
  }

  if (typeof body.steps === 'number' && body.steps > 0) {
    payload.num_inference_steps = Math.round(body.steps);
  }
  const cfg = body.cfg ?? body.guidance_scale ?? body.cfgScale;
  if (typeof cfg === 'number' && cfg >= 0) {
    payload.guidance_scale = Number(cfg);
  }
  if (typeof body.seed === 'number' && Number.isFinite(body.seed) && body.seed >= 0) {
    payload.seed = Math.round(body.seed);
  }
  if (typeof body.scheduler === 'string' && body.scheduler.trim()) {
    payload.scheduler = body.scheduler.trim();
  }

  const unmappedLoras: Array<{ item: unknown; reason: string }> = [];
  if (Array.isArray(body.loras) && body.loras.length > 0) {
    const loraModels: string[] = [];
    const loraStrengths: number[] = [];
    for (const item of body.loras) {
      if (typeof item === 'object' && item !== null) {
        const resolved = resolveModelsLabLoraModel(item as Record<string, any>);
        if (!resolved.model) {
          unmappedLoras.push({
            item,
            reason: resolved.reason || 'ModelsLab LoRA 缺少有效的目录模型标识符',
          });
          continue;
        }
        const rawStr =
          typeof (item as any).strength === 'number'
            ? (item as any).strength
            : typeof (item as any).modelStrength === 'number'
            ? (item as any).modelStrength
            : typeof (item as any).scale === 'number'
            ? (item as any).scale
            : typeof (item as any).weight === 'number'
            ? (item as any).weight
            : undefined;
        loraModels.push(resolved.model);
        loraStrengths.push(typeof rawStr === 'number' && Number.isFinite(rawStr) ? rawStr : (null as any));
      }
    }
    if (loraModels.length > 0) {
      payload.lora_model = loraModels.join(',');
      payload.lora_strength = loraStrengths.length === 1 ? loraStrengths[0] : loraStrengths.join(',');
    }
  }

  const initImage = String(body.init_image || body.image_url || '').trim();
  if (initImage) {
    payload.init_image = initImage;
    const strength = body.strength ?? body.denoise;
    if (typeof strength === 'number' && Number.isFinite(strength)) payload.strength = Number(strength);
  }
  const customObject = parseCustomObject(body.custom_parameters);
  if (customObject && Object.hasOwn(customObject, 'key')) throw new Error('自定义 JSON 不可修改路由/凭据字段：key；请在供应商设置中修改');
  const custom = applyCustomParameters(payload, customObject);
  const route = String(custom.payload.init_image ?? '').trim() ? 'img2img' : 'text2img';
  const endpoint = baseUrl.includes(`/api/v6/images/${route}`)
    ? baseUrl
    : `${baseUrl.replace(/\/api\/v6\/images\/(?:text2img|img2img)$/, '').replace(/\/+$/, '')}/api/v6/images/${route}`;

  return {
    endpoint,
    payload: custom.payload,
    overrides: custom.overrides,
    actualModel: String(custom.payload.model_id),
    ...(unmappedLoras.length > 0 ? { unmappedLoras } : {}),
  };
}

export function buildModelsLabFetchRequest(
  taskId: string | number,
  apiKey: string,
  baseUrl = 'https://modelslab.com'
): { endpoint: string; payload: { key: string; request_id: string } } {
  if (!apiKey) throw new Error('ModelsLab API Key 必填');
  const base = baseUrl.replace(/\/+$/, '').replace(/\/api\/v6\/images\/(?:text2img|img2img|fetch)$/, '');
  const endpoint = `${base}/api/v6/images/fetch`;
  return {
    endpoint,
    payload: {
      key: apiKey,
      request_id: String(taskId),
    },
  };
}

export function sanitizeModelsLabPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...payload };
  if (typeof sanitized.key === 'string' && sanitized.key.length > 8) {
    sanitized.key = `${sanitized.key.substring(0, 4)}...${sanitized.key.substring(sanitized.key.length - 4)}`;
  } else if (sanitized.key) {
    sanitized.key = '***';
  }
  return sanitized;
}

export function parseModelsLabResponse(data: unknown): { status: 'success' | 'processing'; imageUrl?: string; imageUrls?: string[]; futureLinks?: string[]; taskId?: string | number; eta?: number } {
  if (!data || typeof data !== 'object') {
    throw new Error('ModelsLab 响应格式无效');
  }

  const res = data as ModelsLabResponse;
  if (res.status === 'error') {
    throw new Error(`ModelsLab 错误: ${res.message || '未知错误'}${res.tip ? ` (${res.tip})` : ''}`);
  }

  if (res.status === 'processing') {
    return {
      status: 'processing',
      taskId: res.id,
      eta: res.eta,
      ...(Array.isArray(res.future_links) && res.future_links.length ? { futureLinks: res.future_links } : {}),
    };
  }

  if (res.status === 'success') {
    const urls = [...(res.output || []), ...(res.output?.length ? [] : res.proxy_links || [])].filter(Boolean);
    const url = urls[0];
    if (!url) {
      throw new Error('ModelsLab 响应成功但未返回图像 URL');
    }
    return {
      status: 'success',
      imageUrl: url,
      imageUrls: urls,
      taskId: res.id,
    };
  }

  throw new Error(`ModelsLab 未知响应状态: ${(res as any).status}`);
}

export type ModelsLabImageBodyInspection =
  | { kind: 'success'; upstreamStatus: number; rawResponse: string; data: unknown; parsed: ReturnType<typeof parseModelsLabResponse> }
  | { kind: 'semantic-error' | 'protocol-error'; upstreamStatus: number; rawResponse: string; error: string; data?: unknown };

/** Retain the received HTTP status and exact response text for JSON and task-level failures. */
export function inspectModelsLabImageResponseBody(responseBody: string, upstreamStatus: number, secret?: string): ModelsLabImageBodyInspection {
  const rawResponse = secret ? responseBody.split(secret).join('[credential redacted]') : responseBody;
  let data: any;
  try {
    data = JSON.parse(rawResponse);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { kind: 'protocol-error', upstreamStatus, rawResponse, error: `ModelsLab 上游 HTTP ${upstreamStatus} 返回无效 JSON: ${message}` };
  }
  try {
    return { kind: 'success', upstreamStatus, rawResponse, data, parsed: parseModelsLabResponse(data) };
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    return {
      kind: data?.status === 'error' ? 'semantic-error' : 'protocol-error',
      upstreamStatus,
      rawResponse,
      error,
      data,
    };
  }
}
