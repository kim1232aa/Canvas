/**
 * Symmetric send badge derived from the single source of truth in schemaSendHint.ts.
 * - not_sent : isSchemaOmitCandidate() says the declared Schema lacks the field (and aliases) → 「Schema 不支持」
 * - will_send: Schema loaded, field (or alias) declared, and canvas value is filled → 「会发送」
 * - pending  : schema-driven provider, Schema not loaded yet, value filled → 「Schema 未读取」
 * - (unprobed official HTML/OpenAPI no longer gates badges: once declared+filled → 会发送; empty → 未填写，不发送 via SchemaChoiceControls)
 * - null     : no badge
 */
import {
  canvasFieldMatchesSchema,
  hasSchemaSendBadges,
  isSchemaFieldsOnlyEnabled,
  isSchemaOmitCandidate,
  readDeclaredSchemaProperties,
} from './schemaSendHint';
import { planCanvasField, GENERIC_PAYLOAD_ALIASES } from './schemaPayloadPlan';
// Server packs width/height into a declared image_size object or size string (Schema-driven), so those are valid targets too.
const BADGE_ALIASES = { ...GENERIC_PAYLOAD_ALIASES, width: ['width', 'image_size', 'size'], height: ['height', 'image_size', 'size'], loras: [...GENERIC_PAYLOAD_ALIASES.loras, 'lora_weights', 'hf_lora'] };

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
  ctx?: { hasReferenceImage?: boolean },
): SchemaSendStatus {
  if (!hasSchemaSendBadges(provider)) return null;
  if (isSchemaOmitCandidate(provider, field, customParameters, schemaProperties)) return 'not_sent';
  if (!isSchemaFieldsOnlyEnabled(customParameters)) return null;
  const declared = schemaProperties != null
    ? (schemaProperties instanceof Set ? schemaProperties : Array.isArray(schemaProperties) ? new Set(schemaProperties.map(String)) : new Set(Object.keys(schemaProperties)))
    : readDeclaredSchemaProperties(customParameters);
  if (!filled(value)) return null;
    // Schema GET failed for this model: the run's Schema GET fails the same way and no generation request is sent.
  // clean-1351 #2: unavailable wins over loading; read the flag from the node's own JSON AND the engine Schema meta (node badges).
  if ((!declared || declared.size === 0) && (canvasFlag(customParameters, 'schemaUnavailable') || canvasFlag(schemaMeta, 'schemaUnavailable'))) return 'schema_unavailable';
  if ((!declared || declared.size === 0) && (canvasFlag(customParameters, 'schemaLoading') || canvasFlag(schemaMeta, 'schemaLoading'))) return 'loading';
  if (!declared || declared.size === 0) return 'pending';
  if (!canvasFieldMatchesSchema(field, declared)) return null;
  // Same function the server uses to build the scoped payload: omitted there ⇒ never 会发送 here.
  const hasRef = ctx?.hasReferenceImage ?? (canvasFlag(customParameters, 'hasReferenceImage') || canvasFlag(schemaMeta, 'hasReferenceImage'));
  if (!planCanvasField(field, { declared, hasReferenceImage: hasRef, schemaFieldsOnly: true, aliases: BADGE_ALIASES }).send) return 'not_sent';
  // Declared + filled → 会发送 (official HTML/OpenAPI declaration is enough for the badge;
  // 对照表 x-liveConfirmed / schemaConfirmedFields 仍可由 tinkabot 在 FE 实拍后升级，不再挡 UI).
  return 'will_send';
}

/** Generic: Schema came from an official spec but no live probe has confirmed the upstream honours the fields. */
export function isSchemaUnprobed(customParameters?: string | null): boolean {
  try { return JSON.parse(customParameters || '{}')?._canvas?.schemaUnprobed === true; } catch { return false; }
}

function canvasFlag(cp: string | null | undefined, key: string): boolean {
  try { return JSON.parse(cp || '{}')?._canvas?.[key] === true; } catch { return false; }
}
