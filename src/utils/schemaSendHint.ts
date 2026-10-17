/**
 * UI hints for schema-driven providers (muapi / wavespeed / sogni / krea / together / aimlapi).
 *
 * Hard rule: display exactly what will be sent — never invent「不会发送」when the
 * official Schema declares a matching field (or alias). Without declared Schema
 * properties, do not claim omission (execution-record mapping is the source of truth).
 */

const SCHEMA_DRIVEN = new Set(['muapi', 'wavespeed', 'sogni', 'krea', 'together', 'aimlapi', 'novita', 'venice', 'openworks']);

/** Canvas widget / inspector field names that schemaFieldsOnly may drop. */
const OMIT_CANDIDATE = new Set([
  'steps',
  'cfg',
  'cfg_scale',
  'sampler',
  'sampler_name',
  'scheduler',
  'denoise',
  'width',
  'height',
  'size',
  'seed',
  'negative_prompt',
  'aspect_ratio',
  'resolution',
  'output_format',
  'format',
  'loras',
  'styles',
]);

/**
 * Canvas field → official Schema property names (same aliases as schemaProviders submit).
 * If ANY of these exist on the model Schema, the field will be sent — do not badge「不会发送」.
 */
export const CANVAS_TO_SCHEMA_ALIASES: Record<string, string[]> = {
  steps: ['steps', 'num_inference_steps'],
  cfg: ['guidance_scale', 'guidance', 'cfg', 'cfg_scale'],
  cfg_scale: ['guidance_scale', 'guidance', 'cfg', 'cfg_scale'],
  seed: ['seed'],
  // image_size {width,height} object (e.g. AIMLAPI) receives canvas width/height.
  // size "W*H" string (e.g. WaveSpeed z-image / flux-dev-lora) also receives canvas width/height (server packs them).
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
  output_format: ['output_format', 'outputFormat', 'format'],
  format: ['format', 'output_format', 'outputFormat'],
  // Krea LoRA = styles[{id,strength}]; other schema-driven providers use loras / image_loras / lora_list.
  loras: ['styles', 'loras', 'image_loras', 'lora_list', 'lora_url', 'lora_weights', 'hf_lora'],
  styles: ['styles', 'loras', 'image_loras', 'lora_list'],
};

export const SCHEMA_OMIT_REASON =
  '官方 Schema 未声明对应字段（含别名）时不会发送；以执行记录 mapping（sent:false）为准。Schema 已声明的字段会原样发送，不显示本标记。';

export function isSchemaFieldsOnlyEnabled(customParameters?: string | null): boolean {
  try {
    const parsed = JSON.parse(customParameters || '{}');
    return parsed?._canvas?.schemaFieldsOnly !== false;
  } catch {
    return true;
  }
}

export function isSchemaDrivenProvider(provider: string | undefined | null): boolean {
  return SCHEMA_DRIVEN.has(String(provider || '').toLowerCase().trim());
}

/**
 * Providers whose server scopes the request to the live OpenAPI Input (declared fields only), so send badges and the
 * Schema cache apply. Replicate qualifies (replicateImageContract builds input from declared props) but keeps its own
 * frontend LoRA architecture gate, so it is not in SCHEMA_DRIVEN.
 */
const SCHEMA_SCOPED_BADGES = new Set([...SCHEMA_DRIVEN, 'replicate']);
/**
 * videoschema-2026-10-17: providers whose GET /api/model-schema returns the endpoint's official machine-readable
 * input Schema (fal: OpenAPI per endpoint_id). Loaded into the Schema cache on model selection so video duration /
 * aspect_ratio controls follow the selected endpoint. Does NOT turn on send badges for these providers.
 */
const SCHEMA_FETCH_ONLY = new Set(['fal']);
export function hasModelSchemaFetch(provider: string | undefined | null): boolean {
  const p = String(provider || '').toLowerCase().trim();
  return SCHEMA_SCOPED_BADGES.has(p) || SCHEMA_FETCH_ONLY.has(p);
}
export function hasSchemaSendBadges(provider: string | undefined | null): boolean {
  return SCHEMA_SCOPED_BADGES.has(String(provider || '').toLowerCase().trim());
}

/** Read declared Schema property names from custom_parameters._canvas.schemaProperties. */
export function readDeclaredSchemaProperties(customParameters?: string | null): Set<string> | null {
  try {
    const parsed = JSON.parse(customParameters || '{}');
    const raw = parsed?._canvas?.schemaProperties;
    if (Array.isArray(raw) && raw.length) return new Set(raw.map((x: unknown) => String(x)));
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return new Set(Object.keys(raw));
  } catch {
    /* ignore */
  }
  return null;
}

export function canvasFieldMatchesSchema(
  fieldOrWidget: string,
  schemaProperties: Set<string> | Iterable<string> | Record<string, unknown> | null | undefined,
): boolean {
  if (!schemaProperties) return false;
  const field = String(fieldOrWidget || '').toLowerCase().trim();
  const declared =
    schemaProperties instanceof Set
      ? schemaProperties
      : new Set(
          Array.isArray(schemaProperties)
            ? schemaProperties.map(String)
            : Object.keys(schemaProperties as Record<string, unknown>),
        );
  if (declared.has(field)) return true;
  const aliases = CANVAS_TO_SCHEMA_ALIASES[field] || [field];
  return aliases.some((name) => declared.has(name));
}

/**
 * True only when we KNOW the official Schema will not accept this canvas field.
 * - No declared Schema props → false (never fake「不会发送」).
 * - Declared props include field or alias → false (will send).
 * - Declared props omit field and aliases → true.
 */
export function isSchemaOmitCandidate(
  provider: string | undefined | null,
  fieldOrWidget: string,
  customParameters?: string | null,
  schemaProperties?: Set<string> | string[] | Record<string, unknown> | null,
): boolean {
  if (!hasSchemaSendBadges(provider)) return false;
  if (!isSchemaFieldsOnlyEnabled(customParameters)) return false;
  const field = String(fieldOrWidget || '').toLowerCase().trim();
  if (!OMIT_CANDIDATE.has(field)) return false;

  const declared =
    schemaProperties != null
      ? schemaProperties instanceof Set
        ? schemaProperties
        : Array.isArray(schemaProperties)
          ? new Set(schemaProperties.map(String))
          : new Set(Object.keys(schemaProperties))
      : readDeclaredSchemaProperties(customParameters);

  // Hard rule: without Schema evidence, do not claim omission.
  if (!declared || declared.size === 0) return false;
  // OpenWorks live extras (雁 2026-10-17): seed/steps/cfg/neg/loras are appended as named inputs even when catalog omits them.
  if (String(provider || '').toLowerCase().trim() === 'openworks' && ['seed', 'steps', 'cfg', 'cfg_scale', 'negative_prompt', 'loras', 'styles'].includes(field)) {
    return false;
  }
  return !canvasFieldMatchesSchema(field, declared);
}
