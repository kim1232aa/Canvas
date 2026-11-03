import { applyCustomParameters, parseCustomObject, type CustomOverride } from './customParameters';

/** Official docs: https://docs.mage.space/api/models/mango */
export const MAGE_DOC = 'https://docs.mage.space/api/models/mango';
export const MAGE_DEFAULT_BASE = 'https://api.mage.space';
export interface MageImageRequest {
  endpoint: string;
  /** Canvas fields forwarded unchanged though the official schema does not list them. */
  passThroughFields: string[];
  schemaFields: string[];
  payload: Record<string, unknown>;
  overrides: CustomOverride[];
  actualModel: string;
}

export interface MageParsedResponse {
  requestId?: string;
  status: string;
  isPending: boolean;
  imageUrl?: string;
  seed?: number | null;
  /** Official Request.result.width/height — upstream actual output pixels. */
  width?: number;
  height?: number;
  statusUrl?: string;
  cancelUrl?: string;
  raw: unknown;
}

const isProvided = (value: unknown): boolean => value !== undefined && value !== null && value !== '';

/** Official Mango wire fields (docs.mage.space/api/models/mango OpenAPI properties). */
export const MAGE_SCHEMA_FIELDS = [
  'prompt',
  'model_id',
  'seed',
  'aspect_ratio',
  'resolution',
  'image',
  'additional_images',
] as const;

/**
 * Canvas fields the Mango Schema does not list. The official request schema is
 * `additionalProperties: true` and the doc says "Fields the schema does not list pass
 * through to the model unchanged." — so these are forwarded as filled (never dropped,
 * never renamed, never refused locally). Whether they take effect is decided upstream.
 */
const CANVAS_PASS_THROUGH_FIELDS = [
  'negative_prompt',
  'steps',
  'cfg',
  'guidance_scale',
  'sampler',
  'sampler_name',
  'scheduler',
  'denoise',
  'width',
  'height',
] as const;

export const MAGE_PASS_THROUGH_NOTE = '官方参数表未列，已原样转交，是否生效以出图为准';

/** Mango has no LoRA fields — refuse non-empty loras[] instead of silently dropping. */
export function assertNoMageLoras(body: Record<string, unknown>): void {
  const loras = body.loras;
  if (Array.isArray(loras) && loras.length > 0) {
    throw new Error(
      'Mage Mango 官方文档无 LoRA 字段；一致性请用 prompt 里的 @handle 或参考图。禁止发送 loras[]。'
    );
  }
}

export function buildMageImageRequest(
  body: Record<string, unknown>,
  baseUrl = MAGE_DEFAULT_BASE
): MageImageRequest {
  assertNoMageLoras(body);

  const prompt = String(body.prompt || '').trim();
  if (!prompt) throw new Error('Mage Prompt 必填（prompt is required）');

  const modelId = String(body.model_id || body.model || '').trim();
  if (!modelId) throw new Error('模型为必填项（model is required）');

  const payload: Record<string, unknown> = {
    prompt,
    model_id: modelId,
  };

  if (body.seed !== undefined && body.seed !== null) {
    if (typeof body.seed !== 'number' || !Number.isSafeInteger(body.seed)) throw new Error('Mage seed 必须是安全整数或 null，未发送生成请求');
    payload.seed = body.seed;
  } else if (body.seed === null) {
    payload.seed = null;
  }

  const aspect =
    typeof body.aspect_ratio === 'string'
      ? body.aspect_ratio.trim()
      : typeof body.aspectRatio === 'string'
        ? body.aspectRatio.trim()
        : '';
  if (aspect) {
    payload.aspect_ratio = aspect;
  }

  const resolution =
    typeof body.resolution === 'string'
      ? body.resolution.trim()
      : typeof body.imageSize === 'string'
        ? body.imageSize.trim()
        : typeof body.size === 'string'
          ? body.size.trim()
          : '';
  if (resolution) {
    payload.resolution = resolution;
  }

  const image =
    typeof body.image === 'string'
      ? body.image.trim()
      : typeof body.image_url === 'string'
        ? body.image_url.trim()
        : '';
  if (image) {
    if (!/^https?:\/\//i.test(image) && !/^data:[^;,]+(?:;[^;,]+)*;base64,/i.test(image)) {
      throw new Error('Mage image 仅接受 https URL 或 data URL');
    }
    payload.image = image;
  }

  if (Array.isArray(body.additional_images) && body.additional_images.length > 0) {
    const extras: string[] = [];
    for (const item of body.additional_images) {
      const url = String(item || '').trim();
      if (!url) continue;
      if (!/^https?:\/\//i.test(url) && !/^data:[^;,]+(?:;[^;,]+)*;base64,/i.test(url)) {
        throw new Error('Mage additional_images 仅接受 https URL 或 data URL');
      }
      extras.push(url);
    }
    if (extras.length) payload.additional_images = extras;
  }

  const passThroughFields: string[] = [];
  for (const name of CANVAS_PASS_THROUGH_FIELDS) {
    if (isProvided(body[name])) {
      payload[name] = body[name];
      passThroughFields.push(name);
    }
  }

  const customObject = parseCustomObject(body.custom_parameters);
  if (customObject) {
    for (const banned of ['loras', 'lora', 'lora_weights', 'lora_model']) {
      if (Object.hasOwn(customObject, banned)) {
        throw new Error(`自定义 JSON 不可注入 Mage 不支持的 LoRA 字段：${banned}`);
      }
    }
  }
  const custom = applyCustomParameters(payload, customObject);
  if (Object.hasOwn(custom.payload, 'loras') || Object.hasOwn(custom.payload, 'lora_weights')) {
    throw new Error('Mage Mango 禁止在上游载荷中出现 LoRA 字段');
  }

  const cleanBase = String(baseUrl || MAGE_DEFAULT_BASE).replace(/\/+$/, '');
  return {
    endpoint: `${cleanBase}/v1/mango/generate`,
    payload: custom.payload,
    passThroughFields,
    schemaFields: [...MAGE_SCHEMA_FIELDS],
    overrides: custom.overrides,
    actualModel: String(custom.payload.model_id || modelId),
  };
}

export function parseMageRequestResponse(data: unknown): MageParsedResponse {
  const raw = (data && typeof data === 'object' ? data : {}) as Record<string, any>;
  const status = String(raw.status || '').trim();
  const result = raw.result && typeof raw.result === 'object' ? raw.result : null;
  const imageUrl = typeof result?.url === 'string' && result.url.trim() ? result.url.trim() : undefined;
  const isPending = status === 'queued' || status === 'in_progress' || status === '';
  if (status === 'failed') {
    const code = raw.error?.code || 'generation_failed';
    const message = raw.error?.message || 'Mage 生成失败';
    throw new Error(`Mage 任务失败 [${code}]: ${message}`);
  }
  if (status === 'cancelled') {
    throw new Error('Mage 任务已取消');
  }
  if (status === 'completed' && !imageUrl) {
    throw new Error('Mage 返回 completed 但缺少 result.url');
  }
  return {
    requestId: typeof raw.request_id === 'string' ? raw.request_id : undefined,
    status: status || 'unknown',
    isPending: status === 'completed' ? false : isPending,
    imageUrl,
    seed: typeof result?.seed === 'number' ? result.seed : null,
    width: typeof result?.width === 'number' && result.width > 0 ? result.width : undefined,
    height: typeof result?.height === 'number' && result.height > 0 ? result.height : undefined,
    statusUrl: typeof raw.status_url === 'string' ? raw.status_url : undefined,
    cancelUrl: typeof raw.cancel_url === 'string' ? raw.cancel_url : undefined,
    raw,
  };
}
