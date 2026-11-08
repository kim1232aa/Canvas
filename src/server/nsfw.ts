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
 * DEPRECATED: Backend no longer supplements omitted fields (AGENTS.md #5 anti-blackbox).
 * Permissive defaults are seeded only in the UI (SchemaChoiceControls, ParameterInspector)
 * where they are publicly visible and can be toggled back by the user.
 * The wire sends exactly what the user set; omitted fields stay omitted.
 * 
 * This function now only audits NSFW fields the user explicitly set to permissive values.
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
    if (payload[field] !== undefined && payload[field] === permissiveValue) {
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
