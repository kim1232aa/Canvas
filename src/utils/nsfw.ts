/**
 * Official NSFW & Safety field policies.
 *
 * Grounded in verified official API documentation and live OpenAPI schemas across
 * Fal.ai, Together AI, Venice AI, Civitai, and Replicate.
 *
 * Rules (AGENTS.md #6):
 * - A safety switch is recognized only when it is in OFFICIAL_NSFW_FIELD_POLICIES AND
 *   declared by the live schema of the model/endpoint being used.
 * - Declared safety switches default to their permissive (open) value.
 * - Defaults are publicly visible in the UI controls and custom_parameters, can be
 *   toggled back (true / false / not sent) by the user, and user explicit values
 *   always take precedence.
 */

export interface NsfwFieldPolicy {
  field: string;
  type: 'boolean' | 'enum' | 'string';
  /** Open value (safety filter off) used as the permissive default when declared by live schema. */
  permissiveValue: unknown;
  /** Value the upstream uses when the field is omitted. Shown in the unfilled badge. */
  upstreamDefault: unknown;
  /** Restrictive value when the user turns filtering on. */
  restrictedValue?: unknown;
  /** UI label for the open value. */
  permissiveLabel: string;
  /** UI label for the restrictive value. */
  restrictedLabel: string;
  /** Official doc URL verbatim. */
  docUrl: string;
  /** Verified description citing official source. */
  description: string;
}

export const OFFICIAL_NSFW_FIELD_POLICIES: Record<string, NsfwFieldPolicy> = {
  enable_safety_checker: {
    field: 'enable_safety_checker',
    type: 'boolean',
    permissiveValue: false,
    upstreamDefault: true,
    restrictedValue: true,
    permissiveLabel: 'false',
    restrictedLabel: 'true',
    docUrl: 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/flux-lora',
    description: 'Fal.ai live schema (flux-lora, flux-2-flex, 2026-11-07): boolean, default true. false disables the checker and requires account authorization; unauthorized requests are always checked.',
  },
  disable_safety_checker: {
    field: 'disable_safety_checker',
    type: 'boolean',
    permissiveValue: true,
    upstreamDefault: false,
    restrictedValue: false,
    permissiveLabel: 'true',
    restrictedLabel: 'false',
    docUrl: 'https://docs.together.ai/docs/inference/images/parameters',
    description: 'Together AI images API: typical default false (checker on; flagged requests return 422). Replicate flux-dev OpenAPI default false ("Disable safety checker for generated images"). true disables the checker.',
  },
  safe_mode: {
    field: 'safe_mode',
    type: 'boolean',
    permissiveValue: false,
    upstreamDefault: true,
    restrictedValue: true,
    permissiveLabel: 'false',
    restrictedLabel: 'true',
    docUrl: 'https://docs.venice.ai/guides/media/image-generation',
    description: 'Venice POST /image/generate (docs + live swagger 2026-11-07): boolean, default true. true blurs adult output; false returns it unblurred. Native endpoint only.',
  },
  safety_tolerance: {
    field: 'safety_tolerance',
    type: 'enum',
    permissiveValue: '5',
    upstreamDefault: '2',
    restrictedValue: '2',
    permissiveLabel: '5',
    restrictedLabel: '2',
    docUrl: 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/flux-2-flex',
    description: 'Fal.ai flux-2-flex live schema (2026-11-07): enum "1".."5", default "2". Description: 1 most strict, 5 most permissive.',
  },
  moderation: {
    field: 'moderation',
    type: 'enum',
    permissiveValue: 'low',
    upstreamDefault: 'auto',
    restrictedValue: 'auto',
    permissiveLabel: 'low',
    restrictedLabel: 'auto',
    docUrl: 'https://docs.venice.ai/guides/media/image-generation',
    description: 'Venice POST /images/generations (docs + live swagger 2026-11-07): enum low|auto, default auto. auto blurs adult output; low returns it unblurred. OpenAI-compatible endpoint only; safe_mode is rejected there.',
  },
  allowMatureContent: {
    field: 'allowMatureContent',
    type: 'boolean',
    permissiveValue: true,
    upstreamDefault: undefined,
    restrictedValue: false,
    permissiveLabel: 'true',
    restrictedLabel: 'false',
    docUrl: 'https://developer.civitai.com/orchestration/guide/submitting-work',
    description: 'Civitai Orchestration workflow body field beside steps. Unset: orchestrator decides from the Buzz currency charged. true forces yellow Buzz and allows mature output; false restricts to SFW.',
  },
  nsfw: {
    field: 'nsfw',
    type: 'boolean',
    permissiveValue: true,
    upstreamDefault: false,
    restrictedValue: false,
    permissiveLabel: 'true',
    restrictedLabel: 'false',
    docUrl: 'https://developer.civitai.com/site/reference/models',
    description: 'Civitai GET /api/v1/models query parameter. Default false. true includes mature models; ignored on SFW-gated regions. Catalog query, not a generation body field.',
  },
};

/**
 * Fields that are not declared, or whose official docs disagree.
 * They are never shown as safety controls and never written.
 */
export const UNVERIFIED_NSFW_FIELDS = {
  checkNSFW: {
    field: 'checkNSFW',
    status: 'unverified',
    reason: 'Runware 官方当前文档 https://docs.runware.ai/en/image-inference/api-reference 返回 404；代码 RunwareTask 不支持也不发送该字段；标记为未验证，不写入。',
  },
  nsfw_detection: {
    field: 'nsfw_detection',
    status: 'unverified_schema_mismatch',
    reason: 'Novita 官方 V3 文档为嵌套 extra.enable_nsfw_detection，非顶层 nsfw_detection；未在顶层 live schema 声明，标记为未验证，不写入。',
  },
  safety_checker: {
    field: 'safety_checker',
    status: 'conflicting_documentation',
    reason: 'ModelsLab 官方多处示例类型不一致（企业版 text2img 用 "no"，Flux 用布尔 false，pony 用 "yes"）；文档存在分歧，标记为部分核实/存在分歧，不作为确定规则写入。',
  },
  safetySettings: {
    field: 'safetySettings',
    status: 'unverified_in_schema',
    reason: 'Google Gemini 官方安全页面 https://ai.google.dev/gemini-api/docs/safety-settings 阈值枚举与旧版不同，且未在生图 Schema 中声明，不写入。',
  },
} as const;

/** Match an official NSFW field policy by property name. */
export function findNsfwPolicy(fieldName: string): NsfwFieldPolicy | undefined {
  if (!fieldName) return undefined;
  return OFFICIAL_NSFW_FIELD_POLICIES[fieldName];
}

/** Check if a field name is a recognized official NSFW / safety switch. */
export function isNsfwField(fieldName: string): boolean {
  return Boolean(findNsfwPolicy(fieldName));
}

/** Permissive (open) default value for a recognized official safety field. */
export function getNsfwPermissiveDefault(fieldName: string): unknown | undefined {
  return findNsfwPolicy(fieldName)?.permissiveValue;
}

/**
 * Official safety fields that the given live schema actually declares,
 * mapped to their verified permissive default values.
 */
export function extractDeclaredNsfwDefaults(schemaProps: Record<string, any> | undefined): Record<string, unknown> {
  if (!schemaProps || typeof schemaProps !== 'object') return {};
  const declared: Record<string, unknown> = {};
  for (const key of Object.keys(schemaProps)) {
    const policy = findNsfwPolicy(key);
    if (policy) declared[key] = policy.permissiveValue;
  }
  return declared;
}

/**
 * Seeds permissive defaults into visible custom_parameters JSON for any official
 * safety switch declared by the live schema that the user has not explicitly set.
 * User-specified keys (including restrictive values) are never overwritten.
 */
export function applyNsfwDefaultsToCustomParameters(
  customParamsStr: string | undefined,
  schemaProps: Record<string, any> | undefined
): string {
  let body: Record<string, any> = {};
  try {
    const parsed = JSON.parse(customParamsStr || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      body = parsed;
    } else {
      return customParamsStr ?? '{}';
    }
  } catch {
    return customParamsStr ?? '{}';
  }

  const nsfwDefaults = extractDeclaredNsfwDefaults(schemaProps);
  let changed = false;
  for (const [key, permissiveValue] of Object.entries(nsfwDefaults)) {
    if (body[key] === undefined) {
      body[key] = permissiveValue;
      changed = true;
    }
  }

  return changed ? JSON.stringify(body, null, 2) : (customParamsStr ?? '{}');
}
