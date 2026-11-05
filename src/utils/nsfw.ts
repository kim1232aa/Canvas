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
    description: 'Fal.ai / AIMLAPI 官方安全过滤开关：false 为放开内容（禁用检查器），true 为启用过滤。注：Fal 账号需在控制台开启成人内容授权。',
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
    description: 'Fal.ai FLUX Pro 官方安全容忍度：1 最严格，5 最宽松放开（官方 description 明确说明 5 为最宽松）。',
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
    description: 'Venice (/images/generations) 与 OpenAI Images 官方图像审核等级：low 为最低审核（不模糊/放开），auto 为自动严格过滤。',
  },
  allowMatureContent: {
    field: 'allowMatureContent',
    type: 'boolean',
    permissiveValue: true,
    upstreamDefault: false,
    restrictedValue: false,
    permissiveLabel: '允许成人内容（项目默认放开）',
    restrictedLabel: '禁止成人内容',
    docUrl: 'https://developer.civitai.com/orchestration/guide/submitting-work',
    description: 'Civitai Orchestration 官方工作流 JSON body 根级字段（与 steps 同级）：true 为允许成熟内容。注：账号需具备对应浏览等级与 Yellow Buzz。',
  },
  nsfw: {
    field: 'nsfw',
    type: 'boolean',
    permissiveValue: true,
    upstreamDefault: false,
    restrictedValue: false,
    permissiveLabel: '包含 NSFW 模型（项目默认放开）',
    restrictedLabel: '仅 SFW 模型',
    docUrl: 'https://developer.civitai.com/site/reference/models',
    description: 'Civitai 目录检索官方 API 参数（GET /api/v1/models?nsfw=true）：true 为包含成人内容模型。',
  },
};

/**
 * Switch fields that are marked unverified, documented with discrepancies, or not declared in live schemas.
 * Strictly NOT implemented / NOT injected to uphold project rules:
 * 没证据不断言；官方文档有分歧或未声明字段不自动注入。
 */
export const UNVERIFIED_NSFW_FIELDS = {
  checkNSFW: {
    field: 'checkNSFW',
    status: 'unverified',
    reason: 'Runware 官方当前文档 https://docs.runware.ai/en/image-inference/api-reference 返回 404；代码 RunwareTask 不支持也不发送该字段；标记为未验证，不注入。',
  },
  nsfw_detection: {
    field: 'nsfw_detection',
    status: 'unverified_schema_mismatch',
    reason: 'Novita 官方 V3 文档为嵌套 extra.enable_nsfw_detection，非顶层 nsfw_detection；未在顶层 live schema 声明，标记为未验证，不注入。',
  },
  safety_checker: {
    field: 'safety_checker',
    status: 'conflicting_documentation',
    reason: 'ModelsLab 官方多处示例类型不一致（企业版 text2img 用 "no"，Flux 用布尔 false，pony 用 "yes"）；文档存在分歧，标记为部分核实/存在分歧，不作为确定规则硬编码。',
  },
  safetySettings: {
    field: 'safetySettings',
    status: 'unverified_in_schema',
    reason: 'Google Gemini 官方安全页面 https://ai.google.dev/gemini-api/docs/safety-settings 阈值枚举与旧版不同，且未在生图 Schema 中声明，不进行隐式服务端注入。',
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
