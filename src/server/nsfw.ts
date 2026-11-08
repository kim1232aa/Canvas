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
 * For any official NSFW/safety field declared in the live schema (`schemaProps`),
 * if the request payload does not already have an explicit value from the user,
 * fill the verified permissive default and return the audit record (with `docUrl`)
 * so `mapping` can publicly disclose the default policy and official source.
 */
export function applyNsfwDefaultsToPayload(
  payload: Record<string, any>,
  schemaProps: Record<string, any> | undefined
): AppliedNsfwDefault[] {
  if (!schemaProps || typeof schemaProps !== 'object' || !payload || typeof payload !== 'object') {
    return [];
  }

  const applied: AppliedNsfwDefault[] = [];
  const declaredDefaults = extractDeclaredNsfwDefaults(schemaProps);

  for (const [field, permissiveValue] of Object.entries(declaredDefaults)) {
    if (payload[field] === undefined) {
      payload[field] = permissiveValue;
      const policy = findNsfwPolicy(field)!;
      applied.push({
        field,
        value: permissiveValue,
        docUrl: policy.docUrl,
        description: policy.description,
      });
    }
  }

  return applied;
}
