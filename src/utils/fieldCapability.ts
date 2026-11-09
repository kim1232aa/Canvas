import { getFieldSpec, type FieldKey, type Provider } from '../schemas/providerSchema';

export type FieldCapability = {
  capability: 'supported' | 'unsupported' | 'unknown';
  source: 'live-schema' | 'static-spec' | 'none';
};

export type FieldCapabilitySchemaEntry = {
  status: 'loading' | 'ready' | 'error';
  properties?: string[];
  propertiesObj?: Record<string, unknown>;
  inputSchema?: Record<string, unknown>;
};

export type FieldCapabilityContext = {
  schemaEntry?: FieldCapabilitySchemaEntry | null;
  customParameters?: string | null;
};

let schemaLookup: ((provider: string, model: string) => FieldCapabilitySchemaEntry | undefined) | undefined;
export function setFieldCapabilitySchemaLookup(lookup: NonNullable<typeof schemaLookup>): void {
  schemaLookup = lookup;
}

export const CANVAS_TO_SCHEMA_ALIASES: Record<string, string[]> = {
  steps: ['steps', 'num_inference_steps'],
  cfg: ['guidance_scale', 'guidance', 'cfg', 'cfg_scale'],
  cfg_scale: ['guidance_scale', 'guidance', 'cfg', 'cfg_scale'],
  seed: ['seed'],
  width: ['width', 'image_size', 'size', 'image width'],
  height: ['height', 'image_size', 'size', 'image height'],
  size: ['size'],
  negative_prompt: ['negative_prompt', 'negativePrompt'],
  image_url: ['image', 'image_url'],
  denoise: ['strength', 'denoise'],
  sampler: ['sampler_name', 'sampler'],
  sampler_name: ['sampler_name', 'sampler'],
  scheduler: ['scheduler'],
  aspect_ratio: ['aspect_ratio', 'aspectRatio'],
  resolution: ['resolution'],
  duration: ['duration', 'seconds'],
  num_frames: ['num_frames', 'frames_num'],
  fps: ['fps', 'frames_per_second'],
  output_format: ['output_format', 'outputFormat', 'format'],
  format: ['format', 'output_format', 'outputFormat'],
  loras: ['styles', 'loras', 'image_loras', 'lora_list', 'lora_url', 'lora_weights', 'hf_lora'],
  styles: ['styles', 'loras', 'image_loras', 'lora_list'],
};

export type SchemaProperties = Set<string> | Iterable<string> | Record<string, unknown>;

export function canvasFieldMatchesSchema(fieldOrWidget: string, schemaProperties: SchemaProperties | null | undefined): boolean {
  if (!schemaProperties) return false;
  const field = String(fieldOrWidget || '').toLowerCase().trim();
  const declared = new Set<string>(Symbol.iterator in Object(schemaProperties)
    ? Array.from(schemaProperties as Iterable<string>, String)
    : Object.keys(schemaProperties));
  return declared.has(field) || (CANVAS_TO_SCHEMA_ALIASES[field] || []).some((name) => declared.has(name));
}

export function schemaScopeMatches(customParameters: string | null | undefined, provider: string | null | undefined, model: string | null | undefined): boolean {
  try {
    const scope = JSON.parse(customParameters || '{}')?._canvas?.scope;
    return !scope || ((!provider || String(scope.provider || '').toLowerCase().trim() === String(provider).toLowerCase().trim()) &&
      (!model || scope.model === model));
  } catch { return true; }
}

function isClosedInputSchema(schema?: Record<string, unknown>): boolean {
  return !!schema && schema.additionalProperties === false &&
    !['$ref', 'allOf', 'anyOf', 'oneOf', 'if', 'then', 'else', 'patternProperties'].some((key) => Object.hasOwn(schema, key));
}

export function fieldCapability(
  provider: string | null | undefined,
  model: string | null | undefined,
  field: string,
  ctx?: FieldCapabilityContext,
): FieldCapability {
  const p = String(provider || '').toLowerCase().trim();
  const m = String(model || '').trim();
  const name = String(field || '').toLowerCase().trim();
  const unknown: FieldCapability = { capability: 'unknown', source: 'none' };
  const entry = ctx?.schemaEntry === undefined ? schemaLookup?.(p, m) : ctx.schemaEntry;
  if (entry?.status === 'loading' || entry?.status === 'error') return unknown;
  const spec = [name, ...(CANVAS_TO_SCHEMA_ALIASES[name] || [])]
    .map((k) => getFieldSpec(p as Provider, m, k as FieldKey))
    .find(Boolean);
  const hasLive = entry?.status === 'ready' && entry.propertiesObj;
  const result: FieldCapability = hasLive && canvasFieldMatchesSchema(name, entry.propertiesObj)
    ? { capability: 'supported', source: 'live-schema' }
    : hasLive && isClosedInputSchema(entry.inputSchema)
      ? { capability: 'unsupported', source: 'live-schema' }
      : spec && (!hasLive || spec.status === 'unsupported')
        ? { capability: spec.status === 'supported' ? 'supported' : spec.status === 'unsupported' ? 'unsupported' : 'unknown', source: 'static-spec' }
        : unknown;
  if (result.capability !== 'unsupported' || !schemaScopeMatches(ctx?.customParameters, p, m)) return result;
  try {
    const custom = JSON.parse(ctx?.customParameters || '{}');
    if (custom && typeof custom === 'object' && !Array.isArray(custom) && Object.keys(custom).some((key) =>
      key !== '_canvas' && custom[key] !== undefined && custom[key] !== null &&
      !(typeof custom[key] === 'string' && custom[key].trim() === '') && canvasFieldMatchesSchema(name, [key]),
    )) return unknown;
  } catch { /* Invalid JSON is reported by the parameter editor. */ }
  return result;
}
