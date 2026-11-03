import { getModelSpec } from '../schemas/providerSchema';
import { parseCustomObject } from './customParameters';
import {
  CIVITAI_IMAGE_OPENAPI_URL,
  selectImageGenInputSchema,
  civitaiLiveLoraShape,
  schemaAt,
} from '../schemas/civitaiOpenApi';

type Body = Record<string, any>;
export type CivitaiPublicGet = (url: string) => Promise<Response>;
const provided = (value: unknown) => value !== undefined && value !== null && value !== '';

export class CivitaiContractError extends Error {
  readonly status = 400;
}
export class CivitaiAmbiguousError extends CivitaiContractError {
  constructor(message: string, public candidates: Array<Record<string, unknown>>) { super(message); }
}

export interface CivitaiSchemaFetchFailure {
  url: string;
  status: number | null;
  body: string;
}

/** Thrown when live imageGen OpenAPI is missing: nothing is POSTed to orchestration. Static CIVITAI_MODELS is UI clue only. */
export class CivitaiSchemaMissingError extends Error {
  httpStatus: number;
  schemaFetch?: CivitaiSchemaFetchFailure;
  constructor(schemaFetch?: CivitaiSchemaFetchFailure) {
    const local = '本地拦截：拿不到 Civitai imageGen 官方 OpenAPI，未发送 workflows';
    let first: string;
    let httpStatus: number;
    if (!schemaFetch) {
      first = '无上游请求：缺少 live imageGen OpenAPI，未向上游发出任何请求';
      httpStatus = 400;
    } else if (schemaFetch.status === null) {
      first = `无上游响应：Schema 拉取网络错误 ${schemaFetch.url}: ${schemaFetch.body}`;
      httpStatus = 502;
    } else if (schemaFetch.status >= 400 || schemaFetch.status < 200) {
      first = `HTTP ${schemaFetch.status}: ${schemaFetch.body} (${schemaFetch.url})`;
      httpStatus = schemaFetch.status;
    } else {
      first = `HTTP ${schemaFetch.status}: ${schemaFetch.body} (${schemaFetch.url})`;
      httpStatus = 422;
    }
    super(`${first}\n${local}`);
    this.name = 'CivitaiSchemaMissingError';
    this.httpStatus = httpStatus;
    this.schemaFetch = schemaFetch;
  }
}

export { CIVITAI_IMAGE_OPENAPI_URL };
const fail = (message: string): never => { throw new CivitaiContractError(message); };
const airParts = (air: string) => air.replace(/^(?:urn:)?air:/, '').split(':');
const canonicalAir = (input: string) => /^(?:urn:)?air:/.test(input) ? (input.startsWith('urn:') ? input : `urn:${input}`) : undefined;
const baseEcosystems: Record<string, string> = {
  'sd 1.5': 'sd15', 'sd 1.4': 'sd15', 'sdxl 1.0': 'sdxl', 'sdxl turbo': 'sdxl', 'sdxl lightning': 'sdxl', 'sdxl hyper': 'sdxl',
  'pony': 'pony', 'pony v7': 'ponyV7', 'illustrious': 'illustrious', 'noobai': 'noobai',
  'flux.1 d': 'flux1', 'flux.1 s': 'flux1', 'flux.1 dev': 'flux1', 'flux.1 schnell': 'flux1', 'flux.1 kontext': 'flux1',
  'flux.2 d': 'flux2Dev', 'flux.2 klein': 'flux2Klein', 'qwen': 'qwen', 'anima': 'anima', 'ernie': 'ernie',
  'zimageturbo': 'zimageturbo', 'zimagebase': 'zimagebase', 'krea 2': 'krea2',
};
function versionAir(data: Body, parent?: Body): string {
  if (typeof data.air === 'string' && data.air) return data.air;
  const rawType = data.model?.type ?? parent?.type;
  if (!rawType) return fail('Civitai API 未返回 air 或资源 type；不能按调用位置猜测 Checkpoint/LoRA');
  const types: Record<string, string> = { Checkpoint: 'checkpoint', LORA: 'lora', LoCon: 'lycoris', DoRA: 'dora', TextualInversion: 'embedding', VAE: 'vae', Controlnet: 'controlnet', Upscaler: 'upscaler' };
  const primary = data.files?.find((file: Body) => file.primary);
  const type = primary?.type === 'Diffusion Model' ? 'diffusionmodel' : primary?.type === 'UNet' ? 'unet' : types[rawType] ?? String(rawType).toLowerCase();
  const base = String(data.baseModel ?? '').toLowerCase();
  const ecosystem = baseEcosystems[base];
  if (!ecosystem || !data.id || !(data.modelId ?? parent?.id)) return fail('Civitai API 未返回完整 AIR，资源生态/ID 未能核实；请提供完整 AIR');
  return `urn:air:${ecosystem}:${type}:civitai:${data.modelId ?? parent?.id}@${data.id}`;
}
async function readApi(get: CivitaiPublicGet, url: string): Promise<Body | undefined> {
  const response = await get(url);
  if (response.status === 404) return undefined;
  if (!response.ok) {
    const rawResponse = await response.text();
    throw Object.assign(new Error(`Civitai API HTTP ${response.status}: ${rawResponse}`), { status: response.status, rawResponse, errorSource: 'upstream' });
  }
  return response.json();
}
export async function resolveCivitaiResource(rawInput: string, get: CivitaiPublicGet): Promise<string> {
  const input = rawInput.trim();
  const air = canonicalAir(input);
  if (air) return air;
  const pair = /^(\d+)@(\d+)$/.exec(input);
  if (pair) {
    const version = await readApi(get, `https://civitai.com/api/v1/model-versions/${pair[2]}`);
    if (!version) return fail(`找不到 Civitai versionId=${pair[2]}`);
    if (String(version.modelId) !== pair[1]) return fail(`modelId=${pair[1]} 与 API versionId=${pair[2]} 的 modelId=${version.modelId} 不匹配`);
    return versionAir(version);
  }
  if (/^\d+$/.test(input)) {
    const [version, model] = await Promise.all([
      readApi(get, `https://civitai.com/api/v1/model-versions/${input}`),
      readApi(get, `https://civitai.com/api/v1/models/${input}`),
    ]);
    const candidates = model?.modelVersions?.map((v: Body) => ({ modelId: model.id, versionId: v.id, name: v.name, air: v.air ?? `${model.id}@${v.id}` })) ?? [];
    if (model) throw new CivitaiAmbiguousError(`数字 ${input} 是模型 ID${version ? '，也命中版本 ID' : ''}；请指定 modelId@versionId 或完整 AIR`, [...(version ? [{ modelId: version.modelId, versionId: version.id, air: version.air ?? `${version.modelId}@${version.id}` }] : []), ...candidates]);
    if (version) return versionAir(version);
    return fail(`找不到 Civitai modelId/versionId=${input}`);
  }
  const search = await readApi(get, `https://civitai.com/api/v1/models?query=${encodeURIComponent(input.replace(/\.safetensors$/i, '').replace(/_/g, ' '))}&limit=3`);
  const models = search?.items ?? [];
  const candidates = models.flatMap((model: Body) => (model.modelVersions ?? []).map((v: Body) => ({ modelId: model.id, versionId: v.id, name: `${model.name} / ${v.name}`, air: v.air ?? `${model.id}@${v.id}` })));
  if (models.length !== 1 || models[0].modelVersions?.length !== 1) throw new CivitaiAmbiguousError(`搜索 "${input}" 未确定唯一模型版本；请提供完整 AIR`, candidates);
  return versionAir(models[0].modelVersions[0], models[0]);
}

async function buildCivitaiBaseInput(body: Body, get: CivitaiPublicGet, officialOpenApi: unknown): Promise<Body> {
  if (!officialOpenApi || typeof officialOpenApi !== 'object') throw new CivitaiSchemaMissingError();
  const document = officialOpenApi as any;

  const builtin = (body.ecosystem === 'zImage' || body.ecosystem === 'krea2') && provided(body.comfyModel);
  const engineHint = String(body.engine || '');
  const literalModelEngines = ['krea', 'krea3', 'fal', 'flux2', 'flux1-kontext', 'flux1-pro', 'gemini', 'google', 'grok', 'openai', 'seedream'];
  const modelLooksLiteral = provided(body.model) && !String(body.model).startsWith('urn:air:') && !/^\d+(@\d+)?$/.test(String(body.model));
  const selectorOnly = (builtin && (!provided(body.model) || body.model === body.comfyModel))
    || (literalModelEngines.includes(engineHint) && modelLooksLiteral);
  const source = selectorOnly ? undefined : await resolveCivitaiResource(String(body.model ?? ''), get);
  const actualEcosystem = source ? airParts(source)[0] : undefined;
  const sourceType = source ? airParts(source)[1]?.toLowerCase() : undefined;
  if (sourceType && ['lora', 'locon', 'lycoris', 'embedding', 'vae', 'controlnet', 'upscaler'].includes(sourceType)) fail(`传统底模资源类型 ${sourceType} 不可用作 checkpoint/diffusion model`);
  // AIR guide uses sd15; imageGen OpenAPI uses sd1 as the request discriminator.
  const requestEcosystem = actualEcosystem === 'sd15' ? 'sd1' : actualEcosystem === 'zimageturbo' && body.comfyModel === 'turbo' || actualEcosystem === 'zimagebase' && body.comfyModel === 'base' ? 'zImage' : actualEcosystem;
  // AIR namespace is "flux2"; request discriminators are flux2Dev / flux2Klein (recipe pages). Static table remains UI clue for airEcosystems aliases.
  const declaredSpec = provided(body.engine) && provided(body.ecosystem) ? getModelSpec('civitai', `${body.engine}:${body.ecosystem}`) : undefined;
  const flux2RecipeOk = actualEcosystem === 'flux2' && (body.ecosystem === 'flux2Dev' || body.ecosystem === 'flux2Klein' || body.ecosystem === 'dev' || body.ecosystem === 'klein') || (!!actualEcosystem && !!declaredSpec?.request?.airEcosystems?.includes(actualEcosystem));
  if (provided(body.ecosystem) && requestEcosystem && body.ecosystem !== requestEcosystem && !flux2RecipeOk) fail(`显式生态 ${body.ecosystem} 与实际资源生态 ${actualEcosystem} 冲突`);
  const ecosystem = body.ecosystem ?? requestEcosystem;
  if (!ecosystem && !literalModelEngines.includes(String(body.engine || ''))) fail('Civitai ecosystem 为必填项，或提供带生态的完整 AIR');
  const engine = body.engine ?? (['sd1', 'sd15', 'sdxl', 'flux1', 'flux2Dev', 'flux2Klein', 'qwen', 'zImage', 'anima'].includes(ecosystem) ? 'sdcpp' : 'comfy');
  // Engines listed by live ImageGenInput discriminator are accepted; comfy/sdcpp always ok.
  const liveEngines = Object.keys(document?.components?.schemas?.ImageGenInput?.discriminator?.mapping || {});
  if (!['comfy', 'sdcpp'].includes(engine) && !liveEngines.includes(engine) && getModelSpec('civitai', `${engine}:${ecosystem}`)?.request?.engine !== engine) {
    fail('Civitai engine 只接受显式 comfy / sdcpp，或官方 ImageGenInput 列出的引擎');
  }
  const operation = body.operation ?? (provided(body.image_url) ? 'createVariant' : 'createImage');
  if (ecosystem === 'zImage' && (operation !== 'createImage' || provided(body.image_url))) fail('ZImage 仅支持 operation=createImage');
  if (ecosystem === 'krea2' && builtin && (engine !== 'comfy' || body.comfyModel !== 'turbo' || operation !== 'createImage')) fail('Krea Comfy turbo 需要 engine=comfy、model=turbo、operation=createImage');
  if (ecosystem === 'zImage' && !['turbo', 'base'].includes(body.comfyModel)) fail('ZImage comfyModel 必须为 turbo 或 base');

  // Static request.wire remains a clue for omitEcosystem / baked model literal; outbound field/LoRA shape comes from live.
  const spec = getModelSpec('civitai', `${engine}:${ecosystem}`);
  const wire = spec?.request ?? {};

  // flux2 engine discriminates on `model` (dev/flex/pro/max/klein). Callers often pass ecosystem:'dev'.
  const flux2ModelLiterals = ['dev', 'flex', 'pro', 'max', 'klein'];
  let modelSelector: string | undefined;
  if (engine === 'flux2') {
    if (flux2ModelLiterals.includes(String(body.ecosystem || ''))) modelSelector = String(body.ecosystem);
    else if (flux2ModelLiterals.includes(String(wire.model || ''))) modelSelector = String(wire.model);
    else if (flux2ModelLiterals.includes(String(body.model || ''))) modelSelector = String(body.model);
  } else if (engine === 'fal' || engine === 'krea' || engine === 'krea3') {
    modelSelector = provided(body.model) ? String(body.model) : (wire.model !== undefined ? String(wire.model) : undefined);
  } else if (wire.model !== undefined) {
    modelSelector = String(wire.model);
  }

  // Nested OpenAPI discriminators (comfy krea2/zImage turbo|base, flux2 model, …) need `model` in selectors.
  if (!modelSelector && builtin && provided(body.comfyModel)) modelSelector = String(body.comfyModel);
  if (!modelSelector && provided(body.model) && !String(body.model).startsWith('urn:air:') && !/^\d+@\d+$/.test(String(body.model))) {
    // Literal selector models (turbo/base/dev/…) — not AIR checkpoints.
    const literal = String(body.model);
    if (['turbo', 'base', 'raw', 'edit', 'dev', 'flex', 'pro', 'max', 'klein'].includes(literal)) modelSelector = literal;
  }
  const selectors: Record<string, unknown> = {
    engine,
    ...(engine === 'flux2' || wire.omitEcosystem ? {} : { ecosystem }),
    operation,
    ...(modelSelector ? { model: modelSelector } : {}),
    ...(provided(body.version) ? { version: body.version } : {}),
    ...(provided(body.provider) ? { provider: body.provider } : {}),
  };

  let selected;
  try {
    selected = selectImageGenInputSchema(document, selectors);
  } catch (e: any) {
    fail(String(e?.message || e));
  }
  const props = selected.properties;

  const input: Body = {
    engine: wire.engine ?? engine,
    ...(wire.omitEcosystem || engine === 'flux2' ? {} : { ecosystem }),
    operation,
  };
  if (builtin) {
    input.model = body.comfyModel;
    if (source && engine === 'comfy') input[ecosystem === 'zImage' ? 'diffuserModel' : 'diffusionModel'] = source;
    else if (source) fail('ZImage 内建 selector 不接受 source checkpoint；请明确选择 turbo/base');
  } else if (selectorOnly && modelLooksLiteral) {
    input.model = body.model;
  } else if (modelSelector && (engine === 'flux2' || wire.model !== undefined)) {
    input.model = modelSelector;
  } else if (ecosystem === 'anima' || (engine === 'sdcpp' && ecosystem === 'flux1')) {
    if ('diffuserModel' in props) input.diffuserModel = source;
    else if ('model' in props) input.model = source;
    else input.diffuserModel = source;
  } else {
    if ('model' in props) input.model = source;
    else if ('diffuserModel' in props) input.diffuserModel = source;
    else if ('diffusionModel' in props) input.diffusionModel = source;
    else input.model = source;
  }

  const schemaId = spec?.id ?? `${engine}:${ecosystem}`;

  // Live-first field gate. Canvas field → candidate wires declared by this branch.
  const fieldMap: Array<[string, string[]]> = [
    ['prompt', ['prompt']],
    ['negative_prompt', ['negativePrompt']],
    ['width', ['width']],
    ['height', ['height']],
    ['steps', ['numInferenceSteps', 'steps']],
    ['cfg', ['guidanceScale', 'cfgScale']],
    ['seed', ['seed']],
    ['quantity', ['quantity']],
    ['sampler_name', engine === 'comfy' ? ['sampler'] : ['sampleMethod', 'sampler']],
    ['scheduler', engine === 'comfy' ? ['scheduler'] : ['schedule', 'scheduler']],
  ];

  const liveEnum = (prop: any): unknown[] | undefined => {
    if (!prop || typeof prop !== 'object') return undefined;
    if (Array.isArray(prop.enum)) return prop.enum;
    if (prop.$ref) {
      const ref = schemaAt(document, prop.$ref);
      if (Array.isArray(ref?.enum)) return ref.enum;
    }
    for (const part of prop.anyOf || prop.oneOf || []) {
      const nested = liveEnum(part);
      if (nested) return nested;
    }
    return undefined;
  };
  const liveBounds = (prop: any): { min?: number; max?: number } => {
    if (!prop || typeof prop !== 'object') return {};
    return {
      min: typeof prop.minimum === 'number' ? prop.minimum : undefined,
      max: typeof prop.maximum === 'number' ? prop.maximum : undefined,
    };
  };

  for (const [field, candidates] of fieldMap) {
    if (!provided(body[field])) continue;
    const wireName = candidates.find((c) => c in props);
    if (!wireName) {
      fail(`Civitai ${schemaId} 官方 OpenAPI 未声明 ${field}（候选 ${candidates.join('/')}）；未发送`);
    }
    const prop = props[wireName];
    const enums = liveEnum(prop);
    if (enums && !enums.includes(body[field])) fail(`${wireName}=${body[field]} 不符合 Civitai ${schemaId} 官方枚举`);
    const { min, max } = liveBounds(prop);
    const numeric = ['width', 'height', 'steps', 'cfg', 'seed', 'quantity'].includes(field);
    const value = numeric ? Number(body[field]) : body[field];
    if (numeric && typeof value === 'number') {
      if (min !== undefined && value < min) fail(`${wireName}=${value} 低于官方最小值 ${min}`);
      if (max !== undefined && value > max) fail(`${wireName}=${value} 高于官方最大值 ${max}`);
    }
    input[wireName] = value;
  }

  if (provided(body.image_url)) {
    if ('image' in props) input.image = body.image_url;
    else if ('images' in props) input.images = [body.image_url];
    else if ('sourceImage' in props) input.sourceImage = body.image_url;
    else fail(`Civitai ${schemaId} 官方 OpenAPI 未声明 image/images；未发送 image_url`);
    if (provided(body.denoise)) {
      const denoiseWire = (['denoiseStrength', 'strength', 'denoise'] as const).find((w) => w in props);
      if (!denoiseWire) fail(`Civitai ${schemaId} 官方 OpenAPI 未声明 denoise/strength`);
      input[denoiseWire] = Number(body.denoise);
    }
  } else if (provided(body.denoise)) fail('denoise 需要同时提供 image_url');

  if (body.loras !== undefined && !Array.isArray(body.loras)) fail('loras 必须为数组');
  const hasLoraIntent = Array.isArray(body.loras) && body.loras.length > 0;

  // additionalNetworks is textToImage-only — never invent it on imageGen.
  if (hasLoraIntent && 'additionalNetworks' in props && !('loras' in props)) {
    fail('当前 imageGen 分支声明了 additionalNetworks；画布 imageGen 路径不发送 additionalNetworks（仅 textToImage）。请换支持 loras 的 engine，或改用 textToImage 配方。');
  }

  const loraShape = civitaiLiveLoraShape(props.loras, document);
  // engine=krea / krea3 (and any live branch without loras) → refuse LoRA intent. comfy:krea2 turbo live DOES declare loras.
  if (loraShape === 'unsupported') {
    if (hasLoraIntent) {
      if (engine === 'krea' || engine === 'krea3' || ecosystem === 'krea2' && !('loras' in props)) {
        fail('Civitai Krea 官方 OpenAPI 未声明 loras（见 engine=krea / krea3 或无 loras 的分支）。请改用 Flux 2 / Qwen 配方，或换到官方支持 LoRA 的供应商端点。');
      }
      fail(`Civitai ${schemaId} 官方 OpenAPI 未声明可用的 loras 形状；未发送 LoRA`);
    }
    return input;
  }

  const lorasMap: Body = {};
  const lorasArr: Array<{ air: string; strength: number }> = [];
  for (const lora of body.loras ?? []) {
    const raw = [lora.civitaiId, lora.versionId, lora.id, lora.air, lora.name, lora.path].find(provided);
    if (!provided(raw)) fail('LoRA 资源 AIR/ID 为必填项');
    const resource = await resolveCivitaiResource(String(raw), get);
    const [resourceEcosystem, type] = airParts(resource);
    if (!['lora', 'locon', 'lycoris'].includes(type.toLowerCase())) fail(`资源 ${resource} 的类型 ${type} 不是 LoRA/LoCon/LyCORIS`);
    const sd1Resource = resourceEcosystem === 'sd15' && ecosystem === 'sd1';
    const zImageTurboResource = resourceEcosystem === 'zimageturbo' && ecosystem === 'zImage' && input.model === 'turbo';
    const zImageBaseResource = resourceEcosystem === 'zimagebase' && ecosystem === 'zImage' && input.model === 'base';
    const flux2Resource = resourceEcosystem === 'flux2' && (ecosystem === 'flux2Dev' || ecosystem === 'flux2Klein' || ecosystem === 'dev' || ecosystem === 'klein' || engine === 'flux2') || !!spec?.request?.airEcosystems?.includes(resourceEcosystem);
    if (resourceEcosystem !== ecosystem && !sd1Resource && !zImageTurboResource && !zImageBaseResource && !flux2Resource) fail(`LoRA 实际生态 ${resourceEcosystem} 与所选生态 ${ecosystem} 冲突`);
    const strength = lora.strength ?? lora.modelStrength;
    if (!provided(strength) || !Number.isFinite(Number(strength))) fail(`LoRA strength 为必填数值: ${raw}`);
    if (loraShape === 'array') lorasArr.push({ air: resource, strength: Number(strength) });
    else lorasMap[resource] = Number(strength);
  }
  if (loraShape === 'array') {
    if (lorasArr.length) input.loras = lorasArr;
  } else if (Object.keys(lorasMap).length) {
    input.loras = lorasMap;
  }
  return input;
}

export async function buildCivitaiImageRequest(
  body: Body,
  get: CivitaiPublicGet,
  officialOpenApi?: unknown,
  schemaFetchFailure?: CivitaiSchemaFetchFailure,
) {
  if (!officialOpenApi || typeof officialOpenApi !== 'object') {
    throw new CivitaiSchemaMissingError(schemaFetchFailure);
  }
  const custom = parseCustomObject(body.custom_parameters) ?? {};
  for (const key of ['workflowSnapshot', 'operation']) if (key in custom) fail(`custom_parameters 不可修改应用控制字段: ${key}`);
  const aliases: Record<string, string> = { cfgScale: 'cfg', negativePrompt: 'negative_prompt', sampler: 'sampler_name', sampleMethod: 'sampler_name', schedule: 'scheduler', image: 'image_url', strength: 'denoise', denoiseStrength: 'denoise' };
  const normalize = (source: Body) => {
    const normalized: Body = {};
    for (const [key, value] of Object.entries(source)) {
      const field = aliases[key] ?? key;
      if (Object.hasOwn(normalized, field) && JSON.stringify(normalized[field]) !== JSON.stringify(value)) fail(`${field} 与 ${key} 不一致`);
      normalized[field] = value;
    }
    if (Object.hasOwn(normalized, 'loras') && !Array.isArray(normalized.loras)) {
      if (!normalized.loras || typeof normalized.loras !== 'object') fail('loras 必须为 AIR 权重对象或数组');
      normalized.loras = Object.entries(normalized.loras).map(([civitaiId, strength]) => ({ civitaiId, strength }));
    }
    return normalized;
  };
  const topLevel = normalize(body);
  const normalizedCustom = normalize(custom);
  const effective: Body = { ...topLevel, ...normalizedCustom };
  const translated = new Set([...Object.values(aliases), 'loras', 'prompt', 'width', 'height', 'steps', 'seed', 'quantity']);
  const boundary = /^(?:model|comfyModel|engine|ecosystem|provider|endpoint|base_?url|url|inference_provider|diffuserModel|diffusionModel|workflowSnapshot|operation|version)$/i;
  const controls = /^(?:custom_parameters|isVideo|targetProvider|videoDuration|duration|fps|inputSchemaProperties|officialOpenApi)$|api.?key|authorization|credential|password|secret|token/i;
  const advanced = (source: Body) => Object.fromEntries(Object.entries(source).filter(([key]) => !translated.has(key) && !boundary.test(key) && !controls.test(key)));
  const beforeCustom = { ...await buildCivitaiBaseInput(topLevel, get, officialOpenApi), ...advanced(topLevel) };
  const mapped = await buildCivitaiBaseInput(effective, get, officialOpenApi);
  if (Object.hasOwn(normalizedCustom, 'loras') && mapped.ecosystem !== 'krea2') mapped.loras = mapped.loras ?? {};
  const payload = { ...mapped, ...advanced(effective) };
  const overrides = Object.fromEntries(Object.entries(payload).filter(([key, value]) => Object.hasOwn(beforeCustom, key) && JSON.stringify(beforeCustom[key]) !== JSON.stringify(value)).map(([key, value]) => [key, { before: beforeCustom[key], after: value }]));
  return { payload, beforeCustom, customParameters: { ...custom }, overrides };
}

export async function buildCivitaiImageInput(body: Body, get: CivitaiPublicGet, officialOpenApi?: unknown): Promise<Body> {
  return (await buildCivitaiImageRequest(body, get, officialOpenApi)).payload;
}
