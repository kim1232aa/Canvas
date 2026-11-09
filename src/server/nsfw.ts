import {
  OFFICIAL_NSFW_FIELD_POLICIES,
  findNsfwPolicy,
  isNsfwField,
  getNsfwPermissiveDefault,
  extractDeclaredNsfwDefaults,
  applyNsfwDefaultsToCustomParameters,
  readNsfwSeeded,
  writeNsfwSeeded,
  type NsfwFieldPolicy,
} from '../utils/nsfw';

export {
  OFFICIAL_NSFW_FIELD_POLICIES,
  findNsfwPolicy,
  isNsfwField,
  getNsfwPermissiveDefault,
  extractDeclaredNsfwDefaults,
  applyNsfwDefaultsToCustomParameters,
  readNsfwSeeded,
  writeNsfwSeeded,
  type NsfwFieldPolicy,
};

export interface AppliedNsfwDefault {
  field: string;
  value: unknown;
  docUrl: string;
  description: string;
}

/**
 * Audit only: the backend never adds a safety field the user did not send (AGENTS.md #5).
 * Permissive defaults are seeded in the visible UI (SchemaChoiceControls / Civitai control), where the user can
 * switch them to true / false / 不发送; the wire carries exactly what the saved parameters contain.
 * Returns the declared safety fields the request carries at their permissive value; the payload is not modified.
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
