import { getModelSpec } from '../schemas/providerSchema';
import { applyCustomParameters, parseCustomObject, type CustomOverride } from './customParameters';

export interface ReplicatePredictionRequest {
  omitted?: Array<{ from: string; to: null; value: unknown; sent: false; reason: string }>;
  /** Wire names the model schema declares (live OpenAPI or PROVIDER_SCHEMA row); undefined = unknown. */
  schemaFields?: string[];
  endpoint: string;
  payload: Record<string, unknown>;
  headers: Record<string, string>;
  overrides: CustomOverride[];
  actualModel: string;
  isVersionBased: boolean;
  /** Why this endpoint was chosen (live model GET is_official / latest_version, or the model ref itself). */
  routeReason?: string;
}

/** Route facts read from the live GET /v1/models/{owner}/{name} object (no model-name branching). */
export interface ReplicateLiveModelRoute {
  isOfficial?: boolean;
  latestVersionId?: string;
}

/** Reads is_official + latest_version.id from a live Replicate model object. */
export function extractReplicateModelRoute(data: unknown): ReplicateLiveModelRoute | undefined {
  const d = data as any;
  if (!d || typeof d !== 'object') return undefined;
  const isOfficial = typeof d.is_official === 'boolean' ? d.is_official : undefined;
  const id = d.latest_version?.id;
  const latestVersionId = typeof id === 'string' && id.trim() ? id.trim() : undefined;
  if (isOfficial === undefined && !latestVersionId) return undefined;
  return { isOfficial, latestVersionId };
}

export type ReplicateParsedResponse =
  | {
      isPending: true;
      predictionId: string;
      pollUrl: string;
      status: 'starting' | 'processing';
    }
  | {
      isPending: false;
      status: 'succeeded';
      predictionId?: string;
      output: unknown;
      imageUrl: string;
      imageUrls: string[];
    };

export interface ReplicateSchemaFetchFailure {
  url: string;
  status: number | null;
  body: string;
}

/** Thrown when neither a live OpenAPI Input schema nor caller-supplied inputSchemaProperties exists: nothing is sent upstream. Static PROVIDER_SCHEMA is UI clue only and never alone authorizes outbound. */
export class ReplicateSchemaMissingError extends Error {
  model: string;
  schemaFetch?: ReplicateSchemaFetchFailure;
  /** HTTP status the route must answer with: upstream status when the schema GET got a non-2xx answer. */
  httpStatus: number;
  constructor(model: string, schemaFetch?: ReplicateSchemaFetchFailure) {
    const local = `没有发出去：拿不到该模型 Schema，未发送 /predictions（model=${model}）`;
    let first: string;
    let httpStatus: number;
    if (!schemaFetch) {
      first = '无上游请求：该模型标识无法定位 Schema（无 owner/name），未向上游发出任何请求';
      httpStatus = 400;
    } else if (schemaFetch.status === null) {
      first = `无上游响应：Schema 拉取网络错误 ${schemaFetch.url}: ${schemaFetch.body}`;
      httpStatus = 502;
    } else if (schemaFetch.status >= 400 || schemaFetch.status < 200) {
      first = `HTTP ${schemaFetch.status}: ${schemaFetch.body} (${schemaFetch.url})`;
      httpStatus = schemaFetch.status;
    } else {
      // Upstream answered 2xx but the body has no Input properties: first line shows that upstream body verbatim; local 422.
      first = `HTTP ${schemaFetch.status}: ${schemaFetch.body} (${schemaFetch.url})`;
      httpStatus = 422;
    }
    super(`${first}\n${local}`);
    this.httpStatus = httpStatus;
    this.name = 'ReplicateSchemaMissingError';
    this.model = model;
    this.schemaFetch = schemaFetch;
  }
}

/** Parses owner/name[:version] (or bare 64-hex version) without any model-name branching. */
export function parseReplicateModelRef(rawModel: string): { owner?: string; name?: string; version?: string } {
  const m = String(rawModel || '').trim();
  if (/^[0-9a-fA-F]{64}$/.test(m)) return { version: m };
  const [modelName, version] = m.split(':');
  const [owner, name] = modelName.split('/');
  return { owner: owner || undefined, name: name || undefined, version: version || undefined };
}

/** Extracts Input properties from a Replicate model / version object (latest_version.openapi_schema or openapi_schema). */
export function extractReplicateInputProperties(data: unknown): Record<string, unknown> | undefined {
  const d = data as any;
  const schema = d?.openapi_schema ?? d?.latest_version?.openapi_schema;
  const props = schema?.components?.schemas?.Input?.properties;
  return props && typeof props === 'object' && !Array.isArray(props) ? props : undefined;
}

export function hasReplicateStaticSpec(rawModel: string): boolean {
  const { owner, name } = parseReplicateModelRef(rawModel);
  return Boolean(owner && name && getModelSpec('replicate', `${owner}/${name}`));
}

export function buildReplicatePredictionRequest(
  body: Record<string, unknown>,
  baseUrl = 'https://api.replicate.com/v1',
  inputSchemaProperties?: Record<string, unknown>,
  schemaFetchFailure?: ReplicateSchemaFetchFailure,
  liveModel?: ReplicateLiveModelRoute
): ReplicatePredictionRequest {
  const rawModel = String(body.model || '').trim();
  if (!rawModel) {
    throw new Error('Replicate 模型为必填项（model is required）');
  }

  const prompt = String(body.prompt || '').trim();
  if (!prompt) {
    throw new Error('Replicate 提示词为必填项（prompt is required）');
  }

  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
  const isHex64 = /^[0-9a-fA-F]{64}$/.test(rawModel);

  let endpoint: string;
  let actualModel = rawModel;
  let isVersionBased = false;
  let versionToSet: string | undefined;
  let canonicalModelName = rawModel;
  let routeReason: string | undefined;

  if (isHex64) {
    endpoint = `${cleanBaseUrl}/predictions`;
    isVersionBased = true;
    versionToSet = rawModel;
  } else if (rawModel.includes(':')) {
    const [modelName, versionPart] = rawModel.split(':');
    const [owner, name] = modelName.split('/');
    if (!owner || !name) {
      throw new Error('Replicate 模型格式无效，需为 owner/name、owner/name:version 或 64位十六进制版本号');
    }
    canonicalModelName = `${owner}/${name}`;
    // Replicate's model-name route accepts only its latest-version request schema.
    // A pinned model/version must use POST /predictions with version in the body.
    endpoint = `${cleanBaseUrl}/predictions`;
    isVersionBased = Boolean(versionPart);
    if (versionPart) versionToSet = rawModel;
  } else if (rawModel.includes('/')) {
    const [owner, name] = rawModel.split('/');
    if (!owner || !name) {
      throw new Error('Replicate 模型格式无效，需为 owner/name、owner/name:version 或 64位十六进制版本号');
    }
    canonicalModelName = `${owner}/${name}`;
    // Replicate docs: POST /models/{owner}/{name}/predictions is for official models only; every other model
    // needs POST /predictions with a version. Decided up front from the live model object — never retried on 404.
    if (liveModel?.isOfficial === false) {
      if (!liveModel.latestVersionId) {
        throw new Error(`Replicate 社区模型 ${canonicalModelName} 需要 version，但上游模型信息没有 latest_version.id，未发送`);
      }
      endpoint = `${cleanBaseUrl}/predictions`;
      versionToSet = liveModel.latestVersionId;
      isVersionBased = true;
      routeReason = `is_official=false → POST /predictions version=latest_version.id ${liveModel.latestVersionId}`;
    } else {
      endpoint = `${cleanBaseUrl}/models/${owner}/${name}/predictions`;
      isVersionBased = false;
      routeReason = liveModel?.isOfficial === true ? 'is_official=true → POST /models/{owner}/{name}/predictions' : 'model ref owner/name (no live is_official)';
    }
  } else {
    throw new Error('Replicate 模型格式无效，需为 owner/name、owner/name:version 或 64位十六进制版本号');
  }

  if (body.version && typeof body.version === 'string' && body.version.trim()) {
    versionToSet = body.version.trim();
    isVersionBased = true;
    endpoint = `${cleanBaseUrl}/predictions`;
  }

  const schemaPropsIn =
    inputSchemaProperties ||
    (body.inputSchemaProperties && typeof body.inputSchemaProperties === 'object' && !Array.isArray(body.inputSchemaProperties)
      ? (body.inputSchemaProperties as Record<string, unknown>)
      : undefined);

  const input: Record<string, unknown> = {
    prompt,
  };
  const omitted: Array<{ from: string; to: null; value: unknown; sent: false; reason: string }> = [];

  // Wire-name mapping (generic, no per-model branches): when the live OpenAPI Input props or caller-supplied
  // inputSchemaProperties declare a matching name, the filled value is sent under that name. A filled field the
  // schema does not declare is still sent unchanged under its canvas name, and with no live/caller schema the
  // request is sent as built; Replicate decides and its raw reply is shown. Nothing filled is dropped here.
  void schemaFetchFailure;
  const schemaProps: Record<string, unknown> = schemaPropsIn ?? {};
  const schemaFields: string[] = Object.keys(schemaProps);
  /** Returns the wire name to send, or null when the live/caller schema does not declare this field. */
  const declaredWire = (_fieldKey: string, candidates: string[], _legacy: string): string | null => {
    return candidates.find((w) => w in schemaProps) ?? null;
  };
  // Field the schema does not declare: sent unchanged under the canvas name; upstream decides.
  const omit = (from: string, value: unknown, _wires: string[]) => { input[from] = value; };
  const place = (fieldKey: string, from: string, value: unknown, candidates: string[], legacy: string) => {
    const wire = declaredWire(fieldKey, candidates, legacy);
    if (!wire) { omit(from, value, candidates); return; }
    input[wire] = value;
  };

  const neg = String(body.negative_prompt || body.negativePrompt || '').trim();
  if (neg) place('negative_prompt', 'negative_prompt', neg, ['negative_prompt'], 'negative_prompt');

  for (const field of ['width', 'height'] as const) {
    const v = body[field];
    if (!(typeof v === 'number' && Number.isFinite(v) && v > 0)) continue;
    place(field, field, Math.round(v), [field], field);
  }

  const aspectRatio = String(body.aspect_ratio || body.aspectRatio || '').trim();
  if (aspectRatio) place('aspect_ratio', 'aspect_ratio', aspectRatio, ['aspect_ratio'], 'aspect_ratio');

  if (typeof body.seed === 'number' && Number.isFinite(body.seed)) {
    place('seed', 'seed', Math.round(body.seed), ['seed'], 'seed');
  }

  // Iron: send the canvas steps as-is. Never substitute live Schema default (flux-dev-lora default 28)
  // when the UI shows another value, and never invent steps when the board omitted them.
  const steps = body.steps ?? body.num_inference_steps ?? body.numInferenceSteps;
  if (typeof steps === 'number' && Number.isFinite(steps) && steps > 0) {
    place('steps', 'steps', Math.round(steps), ['num_inference_steps', 'steps', 'sample_steps'], 'num_inference_steps');
  }

  const cfg = body.cfg ?? body.guidance ?? body.guidance_scale ?? body.guidanceScale ?? body.cfgScale;
  if (typeof cfg === 'number' && Number.isFinite(cfg) && cfg > 0) {
    // Wire name comes from live/caller Input schema only (guidance vs guidance_scale); no model-name branch.
    place('cfg', 'cfg', Number(cfg), ['guidance', 'guidance_scale', 'sample_guide_scale'], 'guidance');
  }

  // Video fields (filled values only): wire name from the live/caller Input schema, else sent under the canvas name.
  for (const [from, candidates] of [['num_frames', ['num_frames', 'frames']], ['fps', ['fps', 'frames_per_second']], ['duration', ['duration']]] as const) {
    const v = body[from];
    if (typeof v === 'number' && Number.isFinite(v)) place(from, from, v, [...candidates], candidates[0]);
  }

  const imageUrl = String(body.image_url || body.imageUrl || body.image || body.input_image || '').trim();
  if (imageUrl) {
    // Prefer the wire the live/caller schema declares (image vs input_image); never guess undeclared names.
    const preferInputImage = Boolean(body.input_image && !body.image && !body.image_url && !body.imageUrl);
    const imgCandidates = preferInputImage ? ['input_image', 'image'] : ['image', 'input_image'];
    place('image', 'image_url', imageUrl, imgCandidates, imgCandidates[0]);
    // denoise / prompt_strength only when declared by live/caller schema (wire prompt_strength or strength).
    const strength = body.prompt_strength ?? body.denoise ?? body.strength;
    if (typeof strength === 'number' && Number.isFinite(strength)) {
      place('denoise', 'denoise', Number(strength), ['prompt_strength', 'strength'], 'prompt_strength');
    }
  }

  const resolveReplicateLoraEntry = (entry: unknown): { path: string; scale?: number } => {
    if (typeof entry === 'string' && entry.trim()) return { path: entry.trim() };
    if (!entry || typeof entry !== 'object') {
      throw new Error('Replicate LoRA 条目格式无效');
    }
    const obj = entry as Record<string, any>;
    const rawId = String(obj.civitaiId || obj.civitai_id || obj.versionId || '').trim();
    const explicitPath = String(
      obj.path ||
        obj.downloadUrl ||
        obj.download_url ||
        obj.url ||
        obj.lora_weights ||
        obj.hf_lora ||
        ''
    ).trim();
    const rawName = String(obj.name || obj.model || '').trim();

    if (!explicitPath && (rawId || /(?:civitai:|\b)\d+@\d+/i.test(rawName) || /^\d+$/.test(rawName))) {
      throw new Error(
        'Replicate LoRA 必须提供显式权重直链 URL 或 HuggingFace 仓库标识 (owner/repo)，严禁从 Civitai ID 或 AIR 猜测拼接下载链接'
      );
    }

    const loraPath = explicitPath || rawName;
    if (!loraPath) {
      throw new Error('Replicate LoRA 缺少有效权重路径 (path / downloadUrl / lora_weights / hf_lora)');
    }

    const rawStrength =
      typeof obj.strength === 'number'
        ? obj.strength
        : typeof obj.modelStrength === 'number'
        ? obj.modelStrength
        : typeof obj.scale === 'number'
        ? obj.scale
        : typeof obj.lora_scale === 'number'
        ? obj.lora_scale
        : undefined;

    // No strength filled: send the path only (no invented scale); upstream decides.
    return typeof rawStrength === 'number' && Number.isFinite(rawStrength) ? { path: loraPath, scale: rawStrength } : { path: loraPath };
  };

  // Single-URL LoRA slot declared by the model Schema (e.g. wan-video/wan2.1-with-lora: lora_url + lora_strength_model).
  const urlSlotStrengthKey = ['lora_strength_model', 'lora_strength', 'lora_scale'].find((k) => k in schemaProps);
  if (Array.isArray(body.loras) && body.loras.length > 0 && 'lora_url' in schemaProps
    && !('lora_weights' in schemaProps || 'hf_lora' in schemaProps || 'loras' in schemaProps)) {
    const primary = resolveReplicateLoraEntry(body.loras[0]);
    input.lora_url = primary.path;
    if (primary.scale !== undefined && urlSlotStrengthKey) input[urlSlotStrengthKey] = primary.scale;
    // More LoRAs than the one declared slot: the rest go out unchanged in `loras`; upstream decides.
    if (body.loras.length > 1) input.loras = body.loras.slice(1);
  } else if (Array.isArray(body.loras) && body.loras.length > 0) {
    const schemaAllowsLora = (
      'lora_weights' in schemaProps || 'hf_lora' in schemaProps || 'loras' in schemaProps
    );
    if (!schemaAllowsLora) {
      // Schema lists no LoRA field: send the canvas LoRA list as built; upstream decides.
      input.loras = body.loras;
    }
    const useLoraWeightsField = 'lora_weights' in schemaProps && !('hf_lora' in schemaProps);

    // Two-slot LoRA contract (lora_weights|hf_lora + extra_lora): never silently drop the 3rd+ LoRA.
    // Shape follows live/caller schema only — never invent slots from a static PROVIDER_SCHEMA row.
    const maxLoras = 'loras' in schemaProps ? Infinity : ('extra_lora' in schemaProps ? 2 : 1);
    if (schemaAllowsLora && body.loras.length > maxLoras) {
      // More LoRAs than the schema slots: the rest go out unchanged in `loras`; upstream decides.
      input.loras = body.loras.slice(maxLoras);
    }
    if (schemaAllowsLora) {
    const primary = resolveReplicateLoraEntry(body.loras[0]);
    if (useLoraWeightsField) {
      input.lora_weights = primary.path;
      if (primary.scale !== undefined) input.lora_scale = primary.scale;
    } else {
      input.hf_lora = primary.path;
      if (primary.scale !== undefined) input.lora_scale = primary.scale;
    }

    if (body.loras.length > 1) {
      const secondary = resolveReplicateLoraEntry(body.loras[1]);
      if (body.extra_lora === undefined) {
        input.extra_lora = secondary.path;
        if (secondary.scale !== undefined) input.extra_lora_scale = secondary.scale;
      }
    }
    }
  } else if (body.lora_weights && typeof body.lora_weights === 'string' && body.lora_weights.trim()) {
    // Direct wire passthrough only when live/caller schema declares lora_weights.
    if (!('lora_weights' in schemaProps)) {
      omit('lora_weights', body.lora_weights, ['lora_weights']);
    } else {
      input.lora_weights = body.lora_weights.trim();
      if (typeof body.lora_scale === 'number' && Number.isFinite(body.lora_scale)) {
        input.lora_scale = body.lora_scale;
      }
    }
  } else if (body.hf_lora && typeof body.hf_lora === 'string' && body.hf_lora.trim()) {
    if (!('hf_lora' in schemaProps)) {
      omit('hf_lora', body.hf_lora, ['hf_lora']);
    } else {
      input.hf_lora = body.hf_lora.trim();
      if (typeof body.lora_scale === 'number' && Number.isFinite(body.lora_scale)) {
        input.lora_scale = body.lora_scale;
      }
    }
  }

  const basePayload: Record<string, unknown> = {
    ...(versionToSet ? { version: versionToSet } : {}),
    input,
  };

  let customInput = body.custom_parameters;
  if (customInput && typeof customInput === 'object' && !Array.isArray(customInput)) {
    const customObj = customInput as Record<string, unknown>;
    if (!('input' in customObj) && !('version' in customObj)) {
      // Root `_canvas` is canvas UI metadata: keep it at the root (guard skips it, applyCustomParameters strips it);
      // wrapping it into `input` turned it into input._canvas.scope.provider → routing-guard local block.
      const { _canvas, ...sendable } = customObj;
      customInput = { ...(_canvas !== undefined ? { _canvas } : {}), input: sendable };
    }
  }

  const custom = applyCustomParameters(basePayload, customInput);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Prefer': 'wait',
  };

  return {
    endpoint,
    payload: custom.payload,
    headers,
    overrides: custom.overrides,
    actualModel: custom.actualModel || actualModel,
    isVersionBased,
    omitted,
    schemaFields,
    ...(routeReason ? { routeReason } : {}),
  };
}

export function parseReplicatePredictionResponse(data: unknown, baseUrl = 'https://api.replicate.com/v1'): ReplicateParsedResponse {
  if (!data || typeof data !== 'object') {
    throw new Error('Replicate 响应格式无效');
  }

  const res = data as Record<string, any>;

  if (res.status === 'failed' || res.status === 'canceled') {
    const detail = res.error || res.logs || '任务失败';
    throw new Error(`Replicate 预测任务失败 (${res.status}): ${detail}`);
  }

  if (res.error && !res.status) {
    throw new Error(`Replicate 上游错误: ${res.error}`);
  }

  if (res.status === 'starting' || res.status === 'processing') {
    const predictionId = String(res.id || '');
    const cleanBase = String(baseUrl || 'https://api.replicate.com/v1').trim().replace(/\/+$/, '');
    const pollUrl = res.urls?.get || (predictionId ? `${cleanBase}/predictions/${predictionId}` : '');
    return {
      isPending: true,
      predictionId,
      pollUrl,
      status: res.status,
    };
  }

  if (res.status === 'succeeded') {
    const rawOutput = res.output;
    let urls: string[] = [];

    if (Array.isArray(rawOutput)) {
      urls = rawOutput
        .map((item: any) => {
          if (typeof item === 'string') return item.trim();
          if (item && typeof item === 'object') return String(item.url || item.image || item.file || '').trim();
          return '';
        })
        .filter(Boolean);
    } else if (typeof rawOutput === 'string' && rawOutput.trim()) {
      urls = [rawOutput.trim()];
    } else if (rawOutput && typeof rawOutput === 'object') {
      const single = String((rawOutput as any).url || (rawOutput as any).image || (rawOutput as any).file || '').trim();
      if (single) urls = [single];
    }

    if (urls.length === 0) {
      throw new Error('Replicate 预测成功但未返回有效图像输出');
    }

    return {
      isPending: false,
      status: 'succeeded',
      predictionId: res.id ? String(res.id) : undefined,
      output: rawOutput,
      imageUrl: urls[0],
      imageUrls: urls,
    };
  }

  throw new Error(`Replicate 未知响应状态: ${res.status || 'unknown'}`);
}
