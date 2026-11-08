import { randomUUID } from 'node:crypto';
import { applyCustomParameters, type CustomOverride } from './customParameters';

export interface RunwareLora {
  model: string;
  weight?: number;
}

export interface RunwareTask {
  taskType: 'imageInference';
  taskUUID: string;
  model: string;
  positivePrompt: string;
  negativePrompt?: string;
  seedImage?: string;
  strength?: number;
  width?: number;
  height?: number;
  steps?: number;
  CFGScale?: number;
  seed?: number;
  numberResults?: number;
  outputFormat?: unknown;
  outputType?: unknown;
  scheduler?: string;
  lora?: RunwareLora[];
}

export interface RunwareImageRequest {
  endpoint: string; // 'https://api.runware.ai/v1' or custom baseUrl
  payload: RunwareTask[];
  overrides: CustomOverride[];
  mapping: Array<{ from: string; to: string; value: unknown; source: string }>;
  actualModel: string;
  unmappedLoras?: Array<{ item: unknown; reason: string }>;
}

function extractRunwareAir(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const urnMatch = s.match(/^(?:urn:)?air:[^:]+:[^:]+:([a-z0-9_.-]+:[a-z0-9_.-]+@[a-z0-9_.-]+)$/i);
  if (urnMatch) return urnMatch[1].toLowerCase();
  const shortMatch = s.match(/^([a-z0-9_.-]+:[a-z0-9_.-]+@[a-z0-9_.-]+)$/i);
  if (shortMatch) return shortMatch[1].toLowerCase();
  return '';
}

function isWeightFilenameOrUrlOrBareDigits(raw: string): boolean {
  const s = raw.trim();
  if (!s) return true;
  if (/^https?:\/\//i.test(s)) return true;
  if (/^\d+$/.test(s)) return true;
  if (/\.(?:safetensors|ckpt|pt|bin|pth|onnx)(?:$|[?#])/i.test(s)) return true;
  return false;
}

function resolveRunwareLoraModel(item: Record<string, any>): { model: string; reason?: string } {
  const rawExplicitModel = String(item.model ?? '').trim();
  if (rawExplicitModel) {
    const airFromModel = extractRunwareAir(rawExplicitModel);
    if (airFromModel) return { model: airFromModel };
    if (!isWeightFilenameOrUrlOrBareDigits(rawExplicitModel)) {
      return { model: rawExplicitModel };
    }
  }

  for (const primary of [item.lora_name, item.name, item.id, item.path]) {
    const air = extractRunwareAir(primary);
    if (air) return { model: air };
  }

  const resourceSource = String(item.resource_source ?? '').trim().toLowerCase();
  const hasCivitaiId = Boolean(String(item.civitaiId ?? item.civitai_id ?? '').trim());
  const isReselectedNonCivitai = Boolean(resourceSource && resourceSource !== 'civitai' && !hasCivitaiId);

  if (isReselectedNonCivitai) {
    for (const candidate of [item.lora_name, item.name, item.id]) {
      const s = String(candidate ?? '').trim();
      if (s && !isWeightFilenameOrUrlOrBareDigits(s)) {
        return { model: s };
      }
    }
    return {
      model: '',
      reason:
        'Runware LoRA 需要有效的 AIR 标识（如 civitai:modelId@versionId 或 runware:id@version），不能直接发送权重文件名、下载链接或缺少 modelId 的纯数字版本 ID',
    };
  }

  const airFromAirField = extractRunwareAir(item.air);
  if (airFromAirField) return { model: airFromAirField };

  const airFromCivitaiId = extractRunwareAir(item.civitaiId ?? item.civitai_id);
  if (airFromCivitaiId) return { model: airFromCivitaiId };

  const modelId = String(item.modelId ?? item.model_id ?? '').trim();
  const rawVersionCandidate = String(item.versionId ?? item.version_id ?? item.civitaiId ?? item.civitai_id ?? '').trim();
  const versionId = /^\d+$/.test(rawVersionCandidate)
    ? rawVersionCandidate
    : String(item.versionId ?? item.version_id ?? '').trim();
  if (/^\d+$/.test(modelId) && /^\d+$/.test(versionId)) {
    return { model: `civitai:${modelId}@${versionId}` };
  }

  const isForeignCivitai = Boolean(
    hasCivitaiId ||
      String(item.downloadUrl ?? item.download_url ?? '').trim() ||
      item.import_source_provider === 'civitai' ||
      resourceSource === 'civitai'
  );
  if (!isForeignCivitai) {
    for (const candidate of [item.lora_name, item.id, item.name]) {
      const s = String(candidate ?? '').trim();
      if (s && !isWeightFilenameOrUrlOrBareDigits(s)) {
        return { model: s };
      }
    }
  }

  return {
    model: '',
    reason:
      'Runware LoRA 需要有效的 AIR 标识（如 civitai:modelId@versionId 或 runware:id@version），不能直接发送权重文件名、下载链接或缺少 modelId 的纯数字版本 ID',
  };
}

export interface RunwareImageResponse {
  data?: Array<{
    taskType: string;
    taskUUID: string;
    imageUUID?: string;
    imageURL?: string;
    imageBase64Data?: string;
    imageDataURI?: string;
    seed?: number;
    cost?: number;
  }>;
  errors?: Array<{
    code?: string;
    message: string;
    taskUUID?: string;
  }>;
}

export function buildRunwareImageRequest(body: Record<string, unknown>, baseUrl = 'https://api.runware.ai/v1'): RunwareImageRequest {
  const model = String(body.model || '').trim();
  if (!model) throw new Error('Runware 模型为必填项（model is required）');
  const prompt = String(body.prompt || body.positivePrompt || '').trim();

  const taskUUID = typeof body.taskUUID === 'string' && body.taskUUID.trim() ? body.taskUUID.trim() : randomUUID();

  const rawNumResults = body.numberResults ?? body.num_images;
  const filled = (value: unknown) => value !== undefined && value !== null && value !== '';
  const formatSource = filled(body.outputFormat) ? 'outputFormat' : filled(body.output_format) ? 'output_format' : undefined;
  const typeSource = filled(body.outputType) ? 'outputType' : filled(body.output_type) ? 'output_type' : undefined;

  const task: RunwareTask = {
    taskType: 'imageInference',
    taskUUID,
    model,
    positivePrompt: prompt,
    numberResults: typeof rawNumResults === 'number' && Number.isFinite(rawNumResults) && rawNumResults > 0 ? Math.round(rawNumResults) : 1,
    outputFormat: formatSource ? body[formatSource] : 'PNG',
    outputType: typeSource ? body[typeSource] : 'URL',
  };

  if (typeof body.negative_prompt === 'string' && body.negative_prompt.trim()) {
    task.negativePrompt = body.negative_prompt.trim();
  } else if (typeof body.negativePrompt === 'string' && body.negativePrompt.trim()) {
    task.negativePrompt = body.negativePrompt.trim();
  }

  const seedImage = String(body.seedImage || body.image_url || '').trim();
  if (seedImage) {
    task.seedImage = seedImage;
    const strength = body.strength ?? body.denoise;
    if (typeof strength === 'number' && Number.isFinite(strength)) {
      task.strength = Number(strength);
    }
  }

  if (typeof body.width === 'number' && Number.isFinite(body.width) && body.width > 0) {
    task.width = Math.round(body.width);
  }
  if (typeof body.height === 'number' && Number.isFinite(body.height) && body.height > 0) {
    task.height = Math.round(body.height);
  }
  if (typeof body.steps === 'number' && Number.isFinite(body.steps) && body.steps > 0) {
    task.steps = Math.round(body.steps);
  }
  const cfgVal = body.cfg ?? body.CFGScale ?? body.cfgScale ?? body.guidance_scale;
  if (typeof cfgVal === 'number' && Number.isFinite(cfgVal) && cfgVal >= 0) {
    task.CFGScale = Number(cfgVal);
  }
  if (typeof body.seed === 'number' && Number.isFinite(body.seed) && body.seed >= 0) {
    task.seed = Math.round(body.seed);
  }
  if (typeof body.scheduler === 'string' && body.scheduler.trim()) {
    task.scheduler = body.scheduler.trim();
  }

  const unmappedLoras: Array<{ item: unknown; reason: string }> = [];
  if (Array.isArray(body.loras) && body.loras.length > 0) {
    const loras: RunwareLora[] = [];
    for (const item of body.loras) {
      if (typeof item === 'object' && item !== null) {
        const resolved = resolveRunwareLoraModel(item as Record<string, any>);
        if (!resolved.model) {
          unmappedLoras.push({
            item,
            reason: resolved.reason || 'Runware LoRA 缺少有效的 AIR 标识',
          });
          continue;
        }
        const rawWeight =
          typeof (item as any).strength === 'number'
            ? (item as any).strength
            : typeof (item as any).modelStrength === 'number'
            ? (item as any).modelStrength
            : typeof (item as any).weight === 'number'
            ? (item as any).weight
            : typeof (item as any).scale === 'number'
            ? (item as any).scale
            : undefined;
        loras.push(
          typeof rawWeight === 'number' && Number.isFinite(rawWeight)
            ? { model: resolved.model, weight: rawWeight }
            : { model: resolved.model }
        );
      }
    }
    if (loras.length > 0) {
      task.lora = loras;
    }
  }

  const endpoint = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl.replace(/\/+$/, '')}/v1`;

  const custom = applyCustomParameters(task as unknown as Record<string, unknown>, body.custom_parameters);
  const sentTask = custom.payload as unknown as RunwareTask;
  if (sentTask.taskType !== 'imageInference') throw new Error('Runware 自定义 JSON 不能修改 taskType；当前路由只执行 imageInference');

  return {
    endpoint,
    payload: [sentTask],
    overrides: custom.overrides,
    mapping: (['outputFormat', 'outputType'] as const).map(field => {
      const source = custom.overrides.some(override => override.field === field) ? 'custom_parameters.' + field : (field === 'outputFormat' ? formatSource : typeSource) ?? 'project-default';
      return { from: source, to: field, value: sentTask[field], source };
    }),
    actualModel: String(sentTask.model),
    ...(unmappedLoras.length > 0 ? { unmappedLoras } : {}),
  };
}

export function parseRunwareImageResponse(response: RunwareImageResponse, outputFormat: unknown = 'PNG'): { imageUrl: string; imageUrls: string[]; images: Array<{ url: string; seed?: number }>; cost?: number; taskUUID: string } {
  if (Array.isArray(response.errors) && response.errors.length > 0) {
    const firstErr = response.errors[0];
    throw new Error(`Runware 上游错误: ${firstErr.message || firstErr.code || '未知错误'}`);
  }

  const images = (response.data || [])
    .map((item) => ({ url: item.imageURL || item.imageDataURI || (item.imageBase64Data ? `data:image/${String(outputFormat).toLowerCase() === 'jpg' ? 'jpeg' : String(outputFormat).toLowerCase()};base64,${item.imageBase64Data}` : ''), ...(typeof item.seed === 'number' ? { seed: item.seed } : {}) }))
    .filter((image) => image.url);
  const first = (response.data || []).find((item) => item.imageURL || item.imageDataURI || item.imageBase64Data);
  if (!first || !images.length) {
    throw new Error('Runware 未返回图像 URL');
  }

  return {
    imageUrl: images[0].url,
    imageUrls: images.map((image) => image.url),
    images,
    cost: (response.data || []).reduce<number | undefined>((sum, item) => typeof item.cost === 'number' ? (sum ?? 0) + item.cost : sum, undefined),
    taskUUID: first.taskUUID,
  };
}

export type RunwareImageBodyInspection =
  | { kind: 'success'; upstreamStatus: number; rawResponse: string; data: RunwareImageResponse; parsed: ReturnType<typeof parseRunwareImageResponse> }
  | { kind: 'semantic-error' | 'protocol-error'; upstreamStatus: number; rawResponse: string; error: string; data?: RunwareImageResponse };

/** Parse one received HTTP body while retaining its actual status and exact text for the caller. */
export function inspectRunwareImageResponseBody(responseBody: string, upstreamStatus: number, outputFormat: unknown = 'PNG', secret?: string): RunwareImageBodyInspection {
  const rawResponse = secret ? responseBody.split(secret).join('[credential redacted]') : responseBody;
  let data: RunwareImageResponse;
  try {
    data = JSON.parse(rawResponse) as RunwareImageResponse;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { kind: 'protocol-error', upstreamStatus, rawResponse, error: `Runware 上游 HTTP ${upstreamStatus} 返回无效 JSON: ${message}` };
  }
  try {
    return { kind: 'success', upstreamStatus, rawResponse, data, parsed: parseRunwareImageResponse(data, outputFormat) };
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    return {
      kind: Array.isArray(data?.errors) && data.errors.length > 0 ? 'semantic-error' : 'protocol-error',
      upstreamStatus,
      rawResponse,
      error,
      data,
    };
  }
}
