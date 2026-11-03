/** Shared Civitai orchestration OpenAPI discriminator walk (imageGen / videoGen). */

export const CIVITAI_IMAGE_OPENAPI_URL =
  'https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.json';

export type CivitaiSelectedSchema = {
  properties: Record<string, any>;
  required: Set<string>;
  additionalProperties?: boolean | Record<string, any>;
  selected: string[];
};

export function schemaAt(document: any, ref: string): Record<string, any> | undefined {
  if (!ref.startsWith('#/components/schemas/')) return undefined;
  return document?.components?.schemas?.[ref.slice('#/components/schemas/'.length)];
}

export function resolveSelectedSchema(
  document: any,
  ref: string,
  selectors: Record<string, unknown>,
  active = new Set<string>(),
): CivitaiSelectedSchema {
  if (active.has(ref)) return { properties: {}, required: new Set(), selected: [] };
  const raw = schemaAt(document, ref);
  if (!raw) throw new Error(`官方 Civitai Schema 缺少引用 ${ref}`);
  const nextActive = new Set(active).add(ref);
  const result: CivitaiSelectedSchema = { properties: {}, required: new Set(), selected: [ref] };
  const merge = (part: CivitaiSelectedSchema) => {
    Object.assign(result.properties, part.properties);
    part.required.forEach((name) => result.required.add(name));
    result.selected.push(...part.selected);
    if (part.additionalProperties === false) result.additionalProperties = false;
    else if (part.additionalProperties !== undefined && result.additionalProperties === undefined) {
      result.additionalProperties = part.additionalProperties;
    }
  };
  const mergeInline = (part: Record<string, any>) => {
    if (part.properties && typeof part.properties === 'object') Object.assign(result.properties, part.properties);
    for (const name of part.required || []) result.required.add(name);
    if (part.additionalProperties === false) result.additionalProperties = false;
    else if (part.additionalProperties !== undefined && result.additionalProperties === undefined) {
      result.additionalProperties = part.additionalProperties;
    }
  };

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
  discriminator: Record<string, any>,
  selectors: Record<string, unknown>,
  active: Set<string>,
): CivitaiSelectedSchema {
  const key = String(discriminator.propertyName || '');
  const selected = selectors[key];
  if (typeof selected !== 'string' || !selected.trim()) {
    // Nested discriminator without a selector: skip rather than invent a default.
    return { properties: {}, required: new Set(), selected: [] };
  }
  const mapping = discriminator.mapping || {};
  const target = mapping[selected];
  if (typeof target !== 'string') {
    throw new Error(`Civitai 官方 Schema 不含用户选择的 ${key}=${selected}`);
  }
  return resolveSelectedSchema(document, target, selectors, active);
}

/** Resolve ImageGenInput branch for the caller's engine (+ nested ecosystem/model/operation/version). */
export function selectImageGenInputSchema(document: any, selectors: Record<string, unknown>): CivitaiSelectedSchema {
  const root = document?.components?.schemas?.ImageGenInput;
  if (!root || !root.discriminator) throw new Error('官方 Civitai OpenAPI 未提供 ImageGenInput engine discriminator');
  const engine = String(selectors.engine || '').trim();
  if (!engine) throw new Error('engine 是 Civitai ImageGenInput 的必填选择项');
  const target = root.discriminator.mapping?.[engine];
  if (typeof target !== 'string') throw new Error(`当前官方 Civitai ImageGenInput Schema 未列出 engine=${engine}`);
  return resolveSelectedSchema(document, target, selectors);
}

/** Infer LoRA wire shape from a live `loras` property schema. */
export function civitaiLiveLoraShape(
  lorasSchema: any,
  document: any,
): 'array' | 'map' | 'unsupported' {
  if (!lorasSchema) return 'unsupported';
  const itemSchema = lorasSchema.items?.$ref
    ? schemaAt(document, lorasSchema.items.$ref)
    : lorasSchema.items;
  if (lorasSchema.type === 'array' && itemSchema?.properties?.air && itemSchema?.properties?.strength) return 'array';
  if (lorasSchema.type === 'object' && lorasSchema.additionalProperties?.type === 'number') return 'map';
  // object additionalProperties $ref ImageJobNetworkParams → still not used in imageGen; treat unknown as unsupported
  return 'unsupported';
}
