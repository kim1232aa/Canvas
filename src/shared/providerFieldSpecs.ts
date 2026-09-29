/**
 * 服务商字段/取值表 —— 唯一声明。server.ts 校验与前端 UI 都从这里 import，不许另写列表。
 * 纯 TS，无 React / Node 依赖。
 *
 * 来源（2026-09-29 抓取核实）：
 *   - aspect_ratio / image_size: https://ai.google.dev/gemini-api/docs/image-generation
 *   - 下线日期:                  https://ai.google.dev/gemini-api/docs/deprecations
 *   - 本地规范: /workspace/canvas-schema/provider-params.md §6
 */

/** supported = 官方列出；unverified = 官方未说明是否生效；unsupported = 该服务商不支持；shutdown = 已下线 */
export type FieldStatus = 'supported' | 'unverified' | 'unsupported' | 'shutdown';

export interface FieldValue {
  value: string;
  status: 'supported' | 'unverified';
}

export interface GeminiImageModelSpec {
  label: string;
  /** YYYY-MM-DD；undefined = 官方未公布下线日 */
  shutdownDate?: string;
  aspect_ratio: FieldValue[];
  image_size: FieldValue[];
}

export type GeminiSelectField = 'aspect_ratio' | 'image_size';

const mark = (values: string[], status: FieldValue['status']): FieldValue[] =>
  values.map((value) => ({ value, status }));

// gemini-3.1-flash-image 官方列出的 14 个比例
const RATIOS_14 = ['1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3', '4:5', '5:4', '8:1', '9:16', '16:9', '21:9'];
// gemini-3.1-flash-lite-image 官方列出的 10 个比例
const RATIOS_10 = ['1:1', '3:2', '2:3', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
const SIZES = ['1K', '2K', '4K'];

export const GEMINI_IMAGE_MODELS: Record<string, GeminiImageModelSpec> = {
  'gemini-2.5-flash-image': {
    label: 'Gemini 2.5 Flash Image',
    shutdownDate: '2026-10-02',
    // 官方未列出取值 → 以 3.1-flash-image 为候选，全部 unverified
    aspect_ratio: mark(RATIOS_14, 'unverified'),
    image_size: mark(SIZES, 'unverified'),
  },
  'gemini-3.1-flash-image': {
    label: 'Gemini 3.1 Flash Image',
    aspect_ratio: mark(RATIOS_14, 'supported'),
    // 官方文字为「512px (0.5K)」，请求里的确切字符串未能核实
    image_size: [{ value: '512px', status: 'unverified' }, ...mark(SIZES, 'supported')],
  },
  'gemini-3.1-flash-lite-image': {
    label: 'Gemini 3.1 Flash Lite Image',
    aspect_ratio: mark(RATIOS_10, 'supported'),
    image_size: mark(['1K'], 'supported'),
  },
  'gemini-3-pro-image': {
    label: 'Gemini 3 Pro Image',
    // 官方未列出 aspect_ratio → 以 3.1-flash-image 为候选，全部 unverified
    aspect_ratio: mark(RATIOS_14, 'unverified'),
    image_size: mark(SIZES, 'supported'),
  },
  // preview 版本：只有下线日期经过核实，取值官方未单独列出 → 全部 unverified
  'gemini-3.1-flash-image-preview': {
    label: 'Gemini 3.1 Flash Image Preview',
    shutdownDate: '2026-06-25',
    aspect_ratio: mark(RATIOS_14, 'unverified'),
    image_size: mark(['512px', ...SIZES], 'unverified'),
  },
  'gemini-3-pro-image-preview': {
    label: 'Gemini 3 Pro Image Preview',
    shutdownDate: '2026-06-25',
    aspect_ratio: mark(RATIOS_14, 'unverified'),
    image_size: mark(SIZES, 'unverified'),
  },
};

/** Gemini 生图不接受的字段（generateContent 无像素尺寸） */
export const GEMINI_UNSUPPORTED_FIELDS = ['width', 'height'] as const;

/** 查某模型某字段的取值状态：模型不在表内 → 'unverified'；取值不在列表 → 'unsupported' */
export function geminiValueStatus(model: string, field: GeminiSelectField, value: string): FieldStatus {
  const spec = GEMINI_IMAGE_MODELS[model];
  if (!spec) return 'unverified';
  return spec[field].find((v) => v.value === value)?.status ?? 'unsupported';
}
