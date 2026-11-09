import { fieldCapability, schemaScopeMatches, type FieldCapabilityContext, type SchemaProperties } from './fieldCapability';
export { CANVAS_TO_SCHEMA_ALIASES, canvasFieldMatchesSchema } from './fieldCapability';

const SCHEMA_DRIVEN = new Set(['muapi', 'wavespeed', 'sogni', 'krea', 'together', 'aimlapi', 'novita', 'venice', 'openworks']);
const OMIT_CANDIDATE = new Set([
  'steps', 'cfg', 'cfg_scale', 'sampler', 'sampler_name', 'scheduler', 'denoise',
  'width', 'height', 'size', 'seed', 'negative_prompt', 'aspect_ratio', 'resolution',
  'duration', 'num_frames', 'fps', 'output_format', 'format', 'loras', 'styles',
]);

export const SCHEMA_OMIT_REASON = '';

export function isSchemaFieldsOnlyEnabled(customParameters?: string | null): boolean {
  try {
    return JSON.parse(customParameters || '{}')?._canvas?.schemaFieldsOnly !== false;
  } catch {
    return true;
  }
}

export function isSchemaDrivenProvider(provider: string | undefined | null): boolean {
  return SCHEMA_DRIVEN.has(String(provider || '').toLowerCase().trim());
}

const SCHEMA_SCOPED_BADGES = new Set([...SCHEMA_DRIVEN, 'replicate']);
const SCHEMA_FETCH_ONLY = new Set(['fal']);
export function hasModelSchemaFetch(provider: string | undefined | null): boolean {
  const p = String(provider || '').toLowerCase().trim();
  return SCHEMA_SCOPED_BADGES.has(p) || SCHEMA_FETCH_ONLY.has(p);
}
export function hasSchemaSendBadges(provider: string | undefined | null): boolean {
  return SCHEMA_SCOPED_BADGES.has(String(provider || '').toLowerCase().trim());
}

export function readDeclaredSchemaProperties(customParameters?: string | null): Set<string> | null {
  try {
    const raw = JSON.parse(customParameters || '{}')?._canvas?.schemaProperties;
    if (Array.isArray(raw) && raw.length) return new Set(raw.map(String));
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return new Set(Object.keys(raw));
  } catch { /* Invalid JSON is reported by the parameter editor. */ }
  return null;
}

export function schemaFieldContext(
  customParameters?: string | null,
  schemaProperties?: SchemaProperties | null,
  ctx?: FieldCapabilityContext & { provider?: string | null; model?: string | null },
): FieldCapabilityContext {
  const scoped = schemaScopeMatches(customParameters, ctx?.provider, ctx?.model);
  const effectiveCustom = scoped ? customParameters : undefined;
  if (ctx?.schemaEntry !== undefined) return { ...ctx, customParameters: effectiveCustom };
  try {
    const canvas = scoped ? JSON.parse(customParameters || '{}')?._canvas : undefined;
    if (canvas?.schemaUnavailable) return { customParameters: effectiveCustom, schemaEntry: { status: 'error' } };
    if (canvas?.schemaLoading) return { customParameters: effectiveCustom, schemaEntry: { status: 'loading' } };
  } catch { /* Invalid JSON is reported by the parameter editor. */ }
  const declared = schemaProperties ?? (scoped ? readDeclaredSchemaProperties(customParameters) : null);
  const keys = declared && (Symbol.iterator in Object(declared) ? Array.from(declared as Iterable<string>, String) : Object.keys(declared));
  return { customParameters: effectiveCustom, ...(keys?.length ? { schemaEntry: { status: 'ready', propertiesObj: Object.fromEntries(keys.map((key) => [key, {}])) } } : {}) };
}

export function isDeclaredSchemaFieldOmitted(
  fieldOrWidget: string,
  customParameters?: string | null,
  schemaProperties?: Set<string> | string[] | Record<string, unknown> | null,
  ctx?: FieldCapabilityContext & { provider?: string | null; model?: string | null },
): boolean {
  if (!isSchemaFieldsOnlyEnabled(customParameters) || !OMIT_CANDIDATE.has(String(fieldOrWidget || '').toLowerCase().trim())) return false;
  return fieldCapability(ctx?.provider, ctx?.model, fieldOrWidget, schemaFieldContext(customParameters, schemaProperties, ctx)).capability === 'unsupported';
}

export function isSchemaOmitCandidate(
  provider: string | undefined | null,
  fieldOrWidget: string,
  customParameters?: string | null,
  schemaProperties?: Set<string> | string[] | Record<string, unknown> | null,
  ctx?: FieldCapabilityContext & { model?: string | null },
): boolean {
  if (!isSchemaFieldsOnlyEnabled(customParameters) || !OMIT_CANDIDATE.has(String(fieldOrWidget || '').toLowerCase().trim())) return false;
  // Legacy OpenWorks badges describe named extras sent in addition to catalog inputs.
  if (String(provider || '').toLowerCase().trim() === 'openworks' && ['seed', 'steps', 'cfg', 'cfg_scale', 'negative_prompt', 'loras', 'styles'].includes(String(fieldOrWidget || '').toLowerCase().trim())) return false;
  return fieldCapability(provider, ctx?.model, fieldOrWidget, schemaFieldContext(customParameters, schemaProperties, { ...ctx, provider })).capability === 'unsupported';
}
