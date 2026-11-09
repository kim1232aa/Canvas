import { fieldCapability, type FieldCapabilityContext } from './fieldCapability';
import { hasSchemaSendBadges, isSchemaFieldsOnlyEnabled, schemaFieldContext } from './schemaSendHint';

export type SchemaSendStatus = 'will_send' | 'not_sent' | 'pending' | 'loading' | 'schema_unavailable' | null;

const filled = (v: unknown) =>
  v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '') && !(typeof v === 'number' && Number.isNaN(v));

export function schemaSendStatus(
  provider: string | undefined | null,
  field: string,
  value: unknown,
  customParameters?: string | null,
  schemaProperties?: Set<string> | string[] | Record<string, unknown> | null,
  schemaMeta?: string | null,
  ctx?: FieldCapabilityContext & { model?: string | null; hasReferenceImage?: boolean },
): SchemaSendStatus {
  const legacyBadges = hasSchemaSendBadges(provider);
  if (!legacyBadges && !ctx?.model) return null;
  if (!isSchemaFieldsOnlyEnabled(customParameters) || !filled(value)) return null;
  const context = schemaFieldContext(customParameters, schemaProperties, { ...ctx, provider });
  const meta = schemaFieldContext(schemaMeta, undefined, { provider, model: ctx?.model });
  const entry = context.schemaEntry;
  const capability = fieldCapability(provider, ctx?.model, field, context);
  if (entry?.status === 'error' || meta.schemaEntry?.status === 'error') return 'schema_unavailable';
  if (entry?.status === 'loading' || meta.schemaEntry?.status === 'loading') return 'loading';
  if (capability.capability === 'supported') return 'will_send';
  if (!legacyBadges) return capability.capability === 'unsupported' ? 'not_sent' : null;
  if (!entry?.propertiesObj || !Object.keys(entry.propertiesObj).length) return 'pending';
  // Preserve send badges for the existing OpenWorks named extras.
  if (String(provider || '').toLowerCase().trim() === 'openworks' && ['seed', 'steps', 'cfg', 'cfg_scale', 'negative_prompt', 'loras', 'styles'].includes(String(field || '').toLowerCase().trim())) return 'will_send';
  return null;
}

export function isSchemaUnprobed(customParameters?: string | null): boolean {
  try { return JSON.parse(customParameters || '{}')?._canvas?.schemaUnprobed === true; } catch { return false; }
}
