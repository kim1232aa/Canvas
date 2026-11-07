import {
  OFFICIAL_NSFW_FIELD_POLICIES,
  findNsfwPolicy,
  isNsfwField,
  getNsfwPermissiveDefault,
  extractDeclaredNsfwDefaults,
  applyNsfwDefaultsToCustomParameters,
  type NsfwFieldPolicy,
} from '../utils/nsfw';

export {
  OFFICIAL_NSFW_FIELD_POLICIES,
  findNsfwPolicy,
  isNsfwField,
  getNsfwPermissiveDefault,
  extractDeclaredNsfwDefaults,
  applyNsfwDefaultsToCustomParameters,
  type NsfwFieldPolicy,
};

export interface AppliedNsfwDefault {
  field: string;
  value: unknown;
  docUrl: string;
  description: string;
}

/**
 * Does not write safety fields into the payload.
 * A field reaches the request only when the caller already put it there
 * (the visible control writes the value the user chose).
 */
export function applyNsfwDefaultsToPayload(
  _payload: Record<string, any>,
  _schemaProps: Record<string, any> | undefined
): AppliedNsfwDefault[] {
  return [];
}
