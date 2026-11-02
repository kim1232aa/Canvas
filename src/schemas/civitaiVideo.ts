import { applyCustomParameters, parseCustomObject } from '../server/customParameters';

export const CIVITAI_VIDEO_OPENAPI_URL = 'https://orchestration.civitai.com/v2/consumer/recipes/videoGen/openapi.json';

type JsonObject = Record<string, any>;
type SelectedSchema = {
  properties: Record<string, any>;
  required: Set<string>;
  additionalProperties?: boolean | Record<string, any>;
  selected: string[];
};

function schemaAt(document: any, ref: string): JsonObject | undefined {
  if (!ref.startsWith('#/components/schemas/')) return undefined;
  return document?.components?.schemas?.[ref.slice('#/components/schemas/'.length)];
}

/** Resolve the user-selected branch of the official VideoGenInput discriminator tree. */
function resolveSelectedSchema(
  document: any,
  ref: string,
  selectors: Record<string, unknown>,
  active = new Set<string>(),
): SelectedSchema {
  if (active.has(ref)) return { properties: {}, required: new Set(), selected: [] };
  const raw = schemaAt(document, ref);
  if (!raw) throw new Error(`官方 Civitai 视频 Schema 缺少引用 ${ref}`);
  const nextActive = new Set(active).add(ref);
  const result: SelectedSchema = { properties: {}, required: new Set(), selected: [ref] };
  const merge = (part: SelectedSchema) => {
    Object.assign(result.properties, part.properties);
    part.required.forEach((name) => result.required.add(name));
    result.selected.push(...part.selected);
    if (part.additionalProperties === false) result.additionalProperties = false;
    else if (part.additionalProperties !== undefined && result.additionalProperties === undefined) result.additionalProperties = part.additionalProperties;
  };
  const mergeInline = (part: JsonObject) => {
    if (part.properties && typeof part.properties === 'object') Object.assign(result.properties, part.properties);
    for (const name of part.required || []) result.required.add(name);
    if (part.additionalProperties === false) result.additionalProperties = false;
    else if (part.additionalProperties !== undefined && result.additionalProperties === undefined) result.additionalProperties = part.additionalProperties;
  };

  // In Civitai's schema, version/provider and operation discriminators may occur in successive
  // allOf members. Walk each selected branch; cycle protection handles the shared base schema.
  const parts = Array.isArray(raw.allOf) ? raw.allOf : [];
  for (const part of parts) {
    if (part.$ref) merge(resolveSelectedSchema(document, part.$ref, selectors, nextActive));
    else {
      mergeInline(part);
      if (part.discriminator) merge(selectDiscriminator(document, part.discriminator, selectors, nextActive));
    }
  }
  mergeInline(raw);
  if (raw.discriminator) merge(selectDiscriminator(document, raw.discriminator, selectors, nextActive));
  return result;
}

function selectDiscriminator(
  document: any,
  discriminator: JsonObject,
  selectors: Record<string, unknown>,
  active: Set<string>,
): SelectedSchema {
  const key = String(discriminator.propertyName || '');
  const selected = selectors[key];
  if (typeof selected !== 'string' || !selected.trim()) {
    throw new Error(`Civitai 官方视频 Schema 要求显式选择 ${key}；未使用 Schema 默认值`);
  }
  const mapping = discriminator.mapping || {};
  const target = mapping[selected];
  if (typeof target !== 'string') {
    throw new Error(`Civitai 官方视频 Schema 不含用户选择的 ${key}=${selected}`);
  }
  return resolveSelectedSchema(document, target, selectors, active);
}

function selectVideoInputSchema(document: any, body: Record<string, any>): SelectedSchema {
  const root = document?.components?.schemas?.VideoGenInput;
  if (!root || !root.discriminator) throw new Error('官方 Civitai OpenAPI 未提供 VideoGenInput engine discriminator');
  const engine = String(body.engine || '').trim();
  if (!engine) throw new Error('engine 是 Civitai VideoGenInput 的必填选择项');
  const target = root.discriminator.mapping?.[engine];
  if (typeof target !== 'string') throw new Error(`当前官方 Civitai VideoGenInput Schema 未列出 engine=${engine}`);
  return resolveSelectedSchema(document, target, body);
}

function provided(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

function assignCanvasField(
  input: JsonObject,
  properties: Record<string, any>,
  custom: JsonObject,
  source: string,
  candidates: string[],
  value: unknown,
): void {
  if (!provided(value)) return;
  const wire = candidates.find((candidate) => Object.hasOwn(properties, candidate));
  if (!wire) {
    if (candidates.some((candidate) => Object.hasOwn(custom, candidate))) return;
    throw new Error(`当前所选 Civitai 视频 Schema 未声明 ${source} 对应字段；请在 custom_parameters 中显式提供上游字段`);
  }
  input[wire] = value;
}

function mapModel(input: JsonObject, properties: Record<string, any>, custom: JsonObject, body: Record<string, any>): void {
  if (!provided(body.model)) return;
  const wire = ['diffusionModel', 'model'].find((candidate) => Object.hasOwn(properties, candidate));
  if (!wire) {
    if (['diffusionModel', 'model'].some((candidate) => Object.hasOwn(custom, candidate))) return;
    throw new Error('当前所选 Civitai 视频 Schema 未声明 model/diffusionModel；请在 custom_parameters 中显式提供上游字段');
  }
  input[wire] = body.model;
}

function mapImage(input: JsonObject, properties: Record<string, any>, custom: JsonObject, imageUrl: unknown): void {
  if (!provided(imageUrl)) return;
  if (Object.hasOwn(properties, 'sourceImage')) {
    input.sourceImage = imageUrl;
    return;
  }
  if (Object.hasOwn(properties, 'images') && properties.images?.type === 'array') {
    input.images = [imageUrl];
    return;
  }
  if (['sourceImage', 'images'].some((candidate) => Object.hasOwn(custom, candidate))) return;
  throw new Error('当前所选 Civitai 视频 Schema 未声明 sourceImage/images；请在 custom_parameters 中显式提供上游字段');
}

function mapLoras(input: JsonObject, properties: Record<string, any>, custom: JsonObject, loras: unknown, document: any): void {
  if (!Array.isArray(loras) || loras.length === 0) return;
  const schema = properties.loras;
  if (!schema) {
    if (Object.hasOwn(custom, 'loras')) return;
    throw new Error('当前所选 Civitai 视频 Schema 未声明 LoRA；请在 custom_parameters 中显式提供上游字段');
  }
  const normalized = loras.map((entry: any) => {
    const air = entry?.air || entry?.name;
    const strength = entry?.strength ?? entry?.modelStrength;
    if (typeof air !== 'string' || !air.trim() || typeof strength !== 'number' || !Number.isFinite(strength)) {
      throw new Error('视频 LoRA 需要明确的 AIR 与数值 strength');
    }
    return { air, strength };
  });
  const itemSchema = schema.items?.$ref
    ? schemaAt(document, schema.items.$ref)
    : schema.items;
  if (schema.type === 'array' && itemSchema?.properties?.air && itemSchema?.properties?.strength) {
    input.loras = normalized;
    return;
  }
  if (schema.type === 'object' && schema.additionalProperties?.type === 'number') {
    input.loras = Object.fromEntries(normalized.map(({ air, strength }) => [air, strength]));
    return;
  }
  if (Object.hasOwn(custom, 'loras')) return;
  throw new Error('当前 Civitai 视频 Schema 的 LoRA 形状无法确认；请在 custom_parameters 中显式提供原始 loras');
}

export interface CivitaiVideoInputResult {
  payload: JsonObject;
  schemaStatus: 'official-openapi' | 'custom-selector-override';
  customParametersUnvalidated: boolean;
  schemaFields: string[];
  schemaSelected: string[];
  overrides: unknown[];
}

export function buildCivitaiVideoInput(body: Record<string, any>, officialOpenApi: unknown): CivitaiVideoInputResult {
  const document = officialOpenApi as any;
  const selected = selectVideoInputSchema(document, body);
  const properties = selected.properties;
  const customFields = parseCustomObject(body.custom_parameters) ?? {};
  const input: JsonObject = {};

  // Preserve the existing Wan v2.1 mapping through declarations in that exact official variant.
  for (const selector of ['engine', 'version', 'provider', 'operation']) {
    if (provided(body[selector]) && Object.hasOwn(properties, selector)) input[selector] = body[selector];
  }
  if (provided(body.prompt)) input.prompt = body.prompt;
  else if (!Object.hasOwn(customFields, 'prompt')) throw new Error('prompt 是 Civitai VideoGenInput 的必填字段');
  mapModel(input, properties, customFields, body);
  assignCanvasField(input, properties, customFields, 'cfg', ['cfgScale'], body.cfg);
  assignCanvasField(input, properties, customFields, 'steps', ['steps'], body.steps);
  assignCanvasField(input, properties, customFields, 'seed', ['seed'], body.seed);
  assignCanvasField(input, properties, customFields, 'fps', ['fps'], body.fps);
  assignCanvasField(input, properties, customFields, 'width', ['width'], body.width);
  assignCanvasField(input, properties, customFields, 'height', ['height'], body.height);
  assignCanvasField(input, properties, customFields, 'videoDuration', ['duration'], body.videoDuration);
  assignCanvasField(input, properties, customFields, 'aspectRatio', ['aspectRatio'], body.aspectRatio);
  assignCanvasField(input, properties, customFields, 'negative_prompt', ['negativePrompt'], body.negative_prompt);
  assignCanvasField(input, properties, customFields, 'sampler_name', ['sampler', 'samplerName'], body.sampler_name);
  assignCanvasField(input, properties, customFields, 'scheduler', ['scheduler'], body.scheduler);
  assignCanvasField(input, properties, customFields, 'denoise', ['denoise', 'strength'], body.denoise);
  mapImage(input, properties, customFields, body.image_url);
  mapLoras(input, properties, customFields, body.loras, document);

  const custom = applyCustomParameters(input, body.custom_parameters);

  for (const required of selected.required) {
    if (!provided(custom.payload[required])) throw new Error(`当前 Civitai 视频 Schema 要求 ${required}；请显式提供该字段`);
  }

  return {
    payload: custom.payload,
    schemaStatus: custom.overrides.some((override) => ['engine', 'version', 'provider', 'operation'].includes(override.field))
      ? 'custom-selector-override'
      : 'official-openapi',
    customParametersUnvalidated: Object.keys(customFields).some((field) => field !== '_canvas' && !Object.hasOwn(properties, field) && selected.additionalProperties === false),
    schemaFields: Object.keys(properties),
    schemaSelected: [...new Set(selected.selected)],
    overrides: custom.overrides,
  };
}

/** Deliberately blocks: this application has no explicitly selected raw-video-JSON mode. */
export function buildCivitaiVideoInputWithoutSchema(_body: Record<string, any>, schemaError: string): never {
  throw new Error(`Civitai 视频 Schema 未知（${schemaError}）；未发送请求。当前没有显式 raw JSON 模式`);
}
