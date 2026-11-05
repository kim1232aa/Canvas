/**
 * Official NSFW & Safety Policy Grounding
 *
 * Grounded in verified API documentation across Fal.ai, Together AI, Venice AI,
 * Civitai, Replicate, ModelsLab, Novita AI, Runware, and Google Gemini.
 *
 * User directive (verbatim 2026-11-05):
 * "我们不反对nsfw，有nsfw开关的都默认开启"
 *
 * Top rules:
 * - 严禁静默容灾与虚假成功；严禁回退，兜底；严禁硬编码集成；严禁反透明的黑盒行为。
 * - 判定应来自实时 schema 或官方契约里声明了该字段。已经出现在 live schema 里的字段，才在该节点上默认放开。
 * - 默认值公开透明可见，可由用户按节点一键切回，实际请求体与历史记录如实体现。
 */

export interface NsfwFieldPolicy {
  field: string;
  type: 'boolean' | 'enum' | 'string';
  /** The permissive value that opens NSFW / disables filtering (project default). */
  permissiveValue: unknown;
  /** Upstream default (usually restrictive). */
  upstreamDefault: unknown;
  /** Restrictive value when user toggles back to strict filtering. */
  restrictedValue?: unknown;
  /** UI label for permissive state. */
  permissiveLabel: string;
  /** UI label for restrictive state. */
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
    permissiveLabel: '关闭安全检查（项目默认放开）',
    restrictedLabel: '开启安全检查',
    docUrl: 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/flux-lora',
    description: 'Fal.ai / AIMLAPI 官方安全过滤开关：false 为放开内容（禁用检查器），true 为启用过滤。注：账号需在控制台允许成人内容。',
  },
  disable_safety_checker: {
    field: 'disable_safety_checker',
    type: 'boolean',
    permissiveValue: true,
    upstreamDefault: false,
    restrictedValue: false,
    permissiveLabel: '禁用安全检查（项目默认放开）',
    restrictedLabel: '启用安全检查',
    docUrl: 'https://docs.together.ai/openapi.yaml',
    description: 'Together AI / Replicate 官方安全过滤开关：true 为禁用检查器（放开 NSFW），false 为启用过滤。',
  },
  safe_mode: {
    field: 'safe_mode',
    type: 'boolean',
    permissiveValue: false,
    upstreamDefault: true,
    restrictedValue: true,
    permissiveLabel: '关闭安全模式（项目默认放开未打码）',
    restrictedLabel: '开启安全模式（打码）',
    docUrl: 'https://api.venice.ai/api/v1/swagger.yaml',
    description: 'Venice AI 官方成人内容模糊开关：false 为返回未打码原图，true 为打码模糊。',
  },
  safety_tolerance: {
    field: 'safety_tolerance',
    type: 'enum',
    permissiveValue: '5',
    upstreamDefault: '2',
    restrictedValue: '2',
    permissiveLabel: '宽松度 5（项目默认最宽松放开）',
    restrictedLabel: '严格度 1-2（过滤严格）',
    docUrl: 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/flux-pro/v1.1',
    description: 'Fal.ai FLUX Pro 官方安全容忍度：1 最严格，5 最宽松放开。',
  },
  moderation: {
    field: 'moderation',
    type: 'enum',
    permissiveValue: 'low',
    upstreamDefault: 'auto',
    restrictedValue: 'auto',
    permissiveLabel: '最低审核 low（项目默认放开）',
    restrictedLabel: '自动严格审核 auto',
    docUrl: 'https://api.venice.ai/api/v1/swagger.yaml',
    description: 'Venice / OpenAI 官方图像审核等级：low 为最低审核（不模糊），auto 为严格自动过滤。',
  },
  safety_checker: {
    field: 'safety_checker',
    type: 'enum',
    permissiveValue: 'no',
    upstreamDefault: 'yes',
    restrictedValue: 'yes',
    permissiveLabel: '关闭检查器 no（项目默认放开）',
    restrictedLabel: '开启检查器 yes',
    docUrl: 'https://modelslab.com/docs/image-generation/text2img',
    description: 'ModelsLab 官方安全检查器：no 为关闭检查（放开），yes 为启用过滤。注：需付费订阅。',
  },
  nsfw_detection: {
    field: 'nsfw_detection',
    type: 'boolean',
    permissiveValue: false,
    upstreamDefault: true,
    restrictedValue: true,
    permissiveLabel: '关闭审查检测（项目默认放开）',
    restrictedLabel: '开启审查检测',
    docUrl: 'https://docs.novita.ai/guides/model-apis-v2-to-v3-migration',
    description: 'Novita AI 官方审查检测开关：false 为关闭检测（放开），true 为开启检测。',
  },
  allowMatureContent: {
    field: 'allowMatureContent',
    type: 'boolean',
    permissiveValue: true,
    upstreamDefault: false,
    restrictedValue: false,
    permissiveLabel: '允许成人内容（项目默认放开）',
    restrictedLabel: '禁止成人内容',
    docUrl: 'https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.json',
    description: 'Civitai Orchestration 官方成熟内容开关：true 为允许成熟内容。注：账号需具备相应浏览等级与 Yellow Buzz。',
  },
  checkNSFW: {
    field: 'checkNSFW',
    type: 'boolean',
    permissiveValue: false,
    upstreamDefault: false,
    restrictedValue: true,
    permissiveLabel: '不检查 NSFW（项目默认放开）',
    restrictedLabel: '检查 NSFW',
    docUrl: 'https://docs.runware.ai',
    description: 'Runware 官方 NSFW 检测开关：false 为不审查内容。',
  },
  nsfw: {
    field: 'nsfw',
    type: 'boolean',
    permissiveValue: true,
    upstreamDefault: false,
    restrictedValue: false,
    permissiveLabel: '包含 NSFW 模型（项目默认放开）',
    restrictedLabel: '仅 SFW 模型',
    docUrl: 'https://civitai.com/api/v1/models',
    description: 'Civitai 目录 API 官方成人内容检索开关：true 为包含成人内容。',
  },
};

/** Match an official NSFW field policy by property name. */
export function findNsfwPolicy(fieldName: string): NsfwFieldPolicy | undefined {
  if (!fieldName) return undefined;
  return OFFICIAL_NSFW_FIELD_POLICIES[fieldName];
}

/** Check if a field name is a recognized official NSFW / safety switch. */
export function isNsfwField(fieldName: string): boolean {
  return Boolean(findNsfwPolicy(fieldName));
}

/** Get the project NSFW-permissive default value for an official field. */
export function getNsfwPermissiveDefault(fieldName: string): unknown | undefined {
  return findNsfwPolicy(fieldName)?.permissiveValue;
}

/**
 * Inspects declared properties of a live schema and extracts defaults only
 * for declared official NSFW/safety fields.
 * Grounded in: 已经出现在 live schema 里的字段，才在该节点上默认放开。
 */
export function extractDeclaredNsfwDefaults(schemaProps: Record<string, any> | undefined): Record<string, unknown> {
  if (!schemaProps || typeof schemaProps !== 'object') return {};
  const defaults: Record<string, unknown> = {};
  for (const key of Object.keys(schemaProps)) {
    const policy = findNsfwPolicy(key);
    if (policy) {
      defaults[key] = policy.permissiveValue;
    }
  }
  return defaults;
}

/**
 * Transparently seeds the NSFW-permissive defaults into custom_parameters
 * for all declared official NSFW fields that the user has not explicitly set.
 *
 * User overrides are strictly preserved.
 */
export function applyNsfwDefaultsToCustomParameters(
  customParamsStr: string | undefined,
  schemaProps: Record<string, any> | undefined
): string {
  let body: Record<string, any> = {};
  try {
    const parsed = JSON.parse(customParamsStr || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed;
  } catch {
    return customParamsStr || '{}';
  }

  const nsfwDefaults = extractDeclaredNsfwDefaults(schemaProps);
  let changed = false;

  for (const [key, defaultValue] of Object.entries(nsfwDefaults)) {
    if (body[key] === undefined) {
      body[key] = defaultValue;
      changed = true;
    }
  }

  return changed ? JSON.stringify(body, null, 2) : (customParamsStr || '{}');
}
