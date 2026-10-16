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

/** Thrown when neither a live OpenAPI Input schema nor a PROVIDER_SCHEMA row exists: nothing is sent upstream. */
export class ReplicateSchemaMissingError extends Error {
  model: string;
  schemaFetch?: ReplicateSchemaFetchFailure;
  /** HTTP status the route must answer with: upstream status when the schema GET got a non-2xx answer. */
  httpStatus: number;
  constructor(model: string, schemaFetch?: ReplicateSchemaFetchFailure) {
    const local = `本地拦截：拿不到该模型 Schema，未发送 /predictions（model=${model}）`;
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
  schemaFetchFailure?: ReplicateSchemaFetchFailure
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
    endpoint = `${cleanBaseUrl}/models/${owner}/${name}/predictions`;
    isVersionBased = Boolean(versionPart);
    if (versionPart) versionToSet = versionPart;
  } else if (rawModel.includes('/')) {
    const [owner, name] = rawModel.split('/');
    if (!owner || !name) {
      throw new Error('Replicate 模型格式无效，需为 owner/name、owner/name:version 或 64位十六进制版本号');
    }
    canonicalModelName = `${owner}/${name}`;
    endpoint = `${cleanBaseUrl}/models/${owner}/${name}/predictions`;
    isVersionBased = false;
  } else {
    throw new Error('Replicate 模型格式无效，需为 owner/name、owner/name:version 或 64位十六进制版本号');
  }

  if (body.version && typeof body.version === 'string' && body.version.trim()) {
    versionToSet = body.version.trim();
    isVersionBased = true;
  }

  const schemaProps =
    inputSchemaProperties ||
    (body.inputSchemaProperties && typeof body.inputSchemaProperties === 'object' && !Array.isArray(body.inputSchemaProperties)
      ? (body.inputSchemaProperties as Record<string, unknown>)
      : undefined);

  const input: Record<string, unknown> = {
    prompt,
  };
  const omitted: Array<{ from: string; to: null; value: unknown; sent: false; reason: string }> = [];

  // Declared-field gate (generic, no per-model branches): live OpenAPI Input props win; else the
  // PROVIDER_SCHEMA row for this model. A filled field the schema does not declare is NOT sent and is
  // recorded in `omitted` with reason 「该端点不支持」. When neither source exists the request is blocked locally.
  const staticSpec = getModelSpec('replicate', canonicalModelName);
  const schemaFields: string[] | undefined = schemaProps
    ? Object.keys(schemaProps)
    : staticSpec
    ? Object.entries(staticSpec.fields)
        .filter(([, f]) => (f as any)?.status === 'supported')
        .map(([k, f]) => String((f as any)?.wire || k))
    : undefined;
  // Iron rule 4: no live schema and no table row → block locally, never send guessed legacy field names.
  if (!schemaFields) throw new ReplicateSchemaMissingError(rawModel, schemaFetchFailure);
  /** Returns the wire name to send, or null when the schema does not declare this field. */
  const declaredWire = (fieldKey: string, candidates: string[], legacy: string): string | null => {
    if (schemaProps) return candidates.find((w) => w in schemaProps) ?? null;
    if (staticSpec) {
      const f = (staticSpec.fields as Record<string, any>)[fieldKey];
      if (!f || f.status !== 'supported') return null;
      return String(f.wire || candidates[0]);
    }
    return legacy;
  };
  const omit = (from: string, value: unknown, wires: string[]) =>
    omitted.push({
      from,
      to: null,
      value,
      sent: false,
      reason: `该端点不支持：Replicate ${canonicalModelName} 官方 Input Schema 未声明 ${wires.join(' / ')}；未发送`,
    });
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

  if (typeof body.seed === 'number' && Number.isFinite(body.seed) && body.seed >= 0) {
    place('seed', 'seed', Math.round(body.seed), ['seed'], 'seed');
  }

  const steps = body.steps ?? body.num_inference_steps ?? body.numInferenceSteps;
  if (typeof steps === 'number' && Number.isFinite(steps) && steps > 0) {
    place('steps', 'steps', Math.round(steps), ['num_inference_steps', 'steps'], 'num_inference_steps');
  }

  const cfg = body.cfg ?? body.guidance ?? body.guidance_scale ?? body.guidanceScale ?? body.cfgScale;
  if (typeof cfg === 'number' && Number.isFinite(cfg) && cfg > 0) {
    // Wire name comes from live Input / PROVIDER_SCHEMA only (guidance vs guidance_scale); no model-name branch.
    place('cfg', 'cfg', Number(cfg), ['guidance', 'guidance_scale'], 'guidance');
  }

  const imageUrl = String(body.image_url || body.imageUrl || body.image || body.input_image || '').trim();
  if (imageUrl) {
    // Prefer the wire the live/static schema declares (image vs input_image); never guess undeclared names.
    const preferInputImage = Boolean(body.input_image && !body.image && !body.image_url && !body.imageUrl);
    const imgCandidates = preferInputImage ? ['input_image', 'image'] : ['image', 'input_image'];
    place('image', 'image_url', imageUrl, imgCandidates, imgCandidates[0]);
    // denoise / prompt_strength only when declared (PROVIDER_SCHEMA uses field key denoise → wire prompt_strength).
    const strength = body.prompt_strength ?? body.denoise ?? body.strength;
    if (typeof strength === 'number' && Number.isFinite(strength)) {
      place('denoise', 'denoise', Number(strength), ['prompt_strength', 'strength'], 'prompt_strength');
    }
  }

  const resolveReplicateLoraEntry = (entry: unknown): { path: string; scale: number } => {
    if (typeof entry === 'string') {
      throw new Error('Replicate LoRA 条目必须显式提供权重 (strength / lora_scale)，严禁仅传字符串并静默兜底为 1.0');
    }
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

    if (typeof rawStrength !== 'number' || !Number.isFinite(rawStrength)) {
      throw new Error(`Replicate LoRA [${loraPath}] 缺少显式权重 (strength / lora_scale)，严禁静默兜底为 1.0`);
    }

    return { path: loraPath, scale: rawStrength };
  };

  if (Array.isArray(body.loras) && body.loras.length > 0) {
    const staticLora = staticSpec ? (staticSpec.fields as Record<string, any>).loras : undefined;
    const schemaAllowsLora = schemaProps
      ? ('lora_weights' in schemaProps || 'hf_lora' in schemaProps || 'loras' in schemaProps)
      : staticLora?.status === 'supported';
    if (!schemaAllowsLora) {
      throw new Error(`该 Replicate 模型 (${canonicalModelName}) 的官方 OpenAPI Input Schema 不支持挂载 LoRA 参数`);
    }
    const useLoraWeightsField = schemaProps
      ? ('lora_weights' in schemaProps && !('hf_lora' in schemaProps))
      : String(staticLora?.wire || 'lora_weights') === 'lora_weights';

    // Two-slot LoRA contract (lora_weights|hf_lora + extra_lora): never silently drop the 3rd+ LoRA.
    const maxLoras = schemaProps
      ? ('loras' in schemaProps ? Infinity : ('extra_lora' in schemaProps ? 2 : 1))
      : 2; // static PROVIDER_SCHEMA rows that support LoRA document the two-slot official contract
    if (body.loras.length > maxLoras) {
      throw new Error(`该 Replicate 模型 (${canonicalModelName}) 最多 ${maxLoras} 个 LoRA（官方字段 lora_weights${maxLoras > 1 ? ' + extra_lora' : ''}）；本次 ${body.loras.length} 个，未发送请求`);
    }
    const primary = resolveReplicateLoraEntry(body.loras[0]);
    if (useLoraWeightsField) {
      input.lora_weights = primary.path;
      input.lora_scale = primary.scale;
    } else {
      input.hf_lora = primary.path;
      input.lora_scale = primary.scale;
    }

    if (body.loras.length > 1) {
      const secondary = resolveReplicateLoraEntry(body.loras[1]);
      if (body.extra_lora === undefined) {
        input.extra_lora = secondary.path;
        input.extra_lora_scale = secondary.scale;
      }
    }
  } else if (body.lora_weights && typeof body.lora_weights === 'string' && body.lora_weights.trim()) {
    // Direct wire passthrough only when schema/static declares lora_weights.
    const allows =
      (schemaProps && 'lora_weights' in schemaProps) ||
      (!schemaProps && (staticSpec?.fields as any)?.loras?.status === 'supported' &&
        String((staticSpec?.fields as any)?.loras?.wire || 'lora_weights') === 'lora_weights');
    if (!allows) {
      omit('lora_weights', body.lora_weights, ['lora_weights']);
    } else {
      input.lora_weights = body.lora_weights.trim();
      if (typeof body.lora_scale === 'number' && Number.isFinite(body.lora_scale)) {
        input.lora_scale = body.lora_scale;
      }
    }
  } else if (body.hf_lora && typeof body.hf_lora === 'string' && body.hf_lora.trim()) {
    const allows = schemaProps
      ? 'hf_lora' in schemaProps
      : (staticSpec?.fields as any)?.loras?.status === 'supported' &&
        String((staticSpec?.fields as any)?.loras?.wire || '') === 'hf_lora';
    if (!allows) {
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
