type Json = Record<string, unknown>;

export interface CustomOverride {
  field: string;
  requested: unknown;
  custom: unknown;
  applied: true;
}

// Routing and credentials are chosen by explicit provider/base-URL settings; custom JSON never changes them.
// Model is a request field: an explicit JSON model override is sent and recorded as the actual model.
const BOUNDARY = /^(?:provider|endpoint|route|url|base_?url|baseurl|inference_provider|headers?|__proto__|prototype|constructor|(?:access|refresh|auth|bearer|hf|api)[_-]?token|token)$|api.?key|authorization|credential|password|secret/i;

const isObject = (value: unknown): value is Json => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const CANVAS_META_KEY = '_canvas';

function assertNoBoundary(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoBoundary(item, `${path}[${index}]`));
    return;
  }
  if (!isObject(value)) return;
  for (const key of Object.keys(value)) {
    // Root `_canvas` is canvas UI metadata (scope/schemaProperties/schemaFieldsOnly);
    // it is never merged into the upstream payload, so its keys are not routing fields.
    if (!path && key === CANVAS_META_KEY) continue;
    const field = path ? `${path}.${key}` : key;
    if (BOUNDARY.test(key)) throw new Error(`自定义 JSON 不可修改路由/凭据字段：${field}；请在供应商设置中修改`);
    assertNoBoundary(value[key], field);
  }
}

function merge(base: unknown, custom: Json, path: string, overrides: CustomOverride[]): Json {
  const result: Json = isObject(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(custom)) {
    const field = path ? `${path}.${key}` : key;
    const current = result[key];
    if (isObject(value) && isObject(current)) {
      result[key] = merge(current, value, field, overrides);
      continue;
    }
    if (current !== undefined && JSON.stringify(current) !== JSON.stringify(value)) {
      overrides.push({ field, requested: current, custom: value, applied: true });
    }
    result[key] = isObject(value) ? merge({}, value, field, overrides) : value;
  }
  return result;
}

export function parseCustomObject(custom: unknown): Json | undefined {
  if (custom === undefined || custom === null) return undefined;
  if (!isObject(custom)) throw new Error('自定义参数必须为 JSON 对象');
  assertNoBoundary(custom, '');
  return custom;
}

export function applyCustomParameters<T extends Json>(payload: T, custom: unknown): { payload: T; overrides: CustomOverride[]; actualModel?: string; customParameters?: Json } {
  const parsed = parseCustomObject(custom);
  if (!parsed) return { payload: { ...payload }, overrides: [], ...(typeof payload.model === 'string' ? { actualModel: payload.model } : {}) };
  const overrides: CustomOverride[] = [];
  const { [CANVAS_META_KEY]: _meta, ...sendable } = parsed;
  const merged = merge(payload, sendable, '', overrides) as T;
  return {
    payload: merged,
    overrides,
    customParameters: parsed,
    ...(typeof merged.model === 'string' ? { actualModel: merged.model } : {}),
  };
}
