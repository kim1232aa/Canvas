/**
 * 服务商字段/取值表 —— 唯一声明。server.ts 校验与前端 UI 都从这里 import，不许另写列表。
 * 纯 TS，无 React / Node 依赖。自检：src/schemas/providerSchema.test.ts（npm test）。
 *
 * 所有事实 2026-09-29 抓取官方页核实；每个字段带 source。
 * providerDefault = 官方文档写明的默认值，只用于界面显示「服务商默认：x」，
 * 绝不许发给上游、绝不许写进历史；文档没写就是 undefined。
 */

/** supported = 官方列出；unverified = 官方未说明是否生效；unsupported = 该服务商不支持；deprecated = 已下线 */
export type FieldStatus = 'supported' | 'unverified' | 'unsupported' | 'deprecated';
export const FIELD_STATUSES: readonly FieldStatus[] = ['supported', 'unverified', 'unsupported', 'deprecated'];

export type Provider = 'gemini' | 'fal' | 'civitai' | 'openai_compat' | 'grok_compat' | 'agnes' | 'huggingface' | 'nanogpt' | 'tensorart';

/** 画布侧字段名；上游字段名不同时写在 FieldSpec.wire */
export type FieldKey =
  | 'width' | 'height' | 'aspect_ratio' | 'image_size' | 'resolution'
  | 'seed' | 'negative_prompt' | 'steps' | 'cfg' | 'sampler' | 'scheduler' | 'denoise' | 'loras' | 'num_images'
  | 'size' | 'quality' | 'output_format' | 'background' | 'moderation';

export interface FieldValue {
  value: string;
  status: 'supported' | 'unverified';
  /** 该取值的来源与字段来源不同时填写 */
  source?: string;
}

export interface FieldSpec {
  status: FieldStatus;
  source: string;
  wire?: string;
  type?: 'integer' | 'number' | 'string' | 'enum' | 'object';
  enum?: FieldValue[];
  min?: number;
  max?: number;
  exclusiveMin?: number;
  multipleOf?: number;
  providerDefault?: string | number;
  note?: string;
}

export interface ModelSpec {
  provider: Provider;
  /** Gemini / Fal：模型或端点 id；Civitai：`${engine}:${ecosystem}` */
  id: string;
  label: string;
  source: string;
  /** YYYY-MM-DD；undefined = 官方未公布下线日 */
  shutdownDate?: string;
  shutdownSource?: string;
  fields: Partial<Record<FieldKey, FieldSpec>>;
}

export type GeminiSelectField = 'aspect_ratio' | 'image_size';

// ---------- helpers ----------

const vals = (values: string[], status: FieldValue['status']): FieldValue[] => values.map((value) => ({ value, status }));

const enumField = (source: string, values: FieldValue[], extra: Partial<FieldSpec> = {}): FieldSpec => ({
  status: values.every((v) => v.status === 'supported') ? 'supported' : 'unverified',
  source,
  type: 'enum',
  enum: values,
  ...extra,
});

const unsupported = (source: string, keys: FieldKey[], note?: string) =>
  Object.fromEntries(keys.map((k) => [k, { status: 'unsupported', source, ...(note ? { note } : {}) } satisfies FieldSpec]));

const dims = (spec: FieldSpec) => ({ width: spec, height: spec });

// ---------- Gemini ----------

const G_DOC = 'https://ai.google.dev/gemini-api/docs/image-generation';
const G_DEPR = 'https://ai.google.dev/gemini-api/docs/deprecations';
const G_API_V1 = 'https://generativelanguage.googleapis.com/$discovery/rest?version=v1';

// 3.1 Flash Image 表 14 个比例（与 v1 discovery ImageConfig.aspectRatio 描述一致）
const RATIOS_14 = ['1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3', '4:5', '5:4', '8:1', '9:16', '16:9', '21:9'];
// 3.1 Flash Lite / 3.1 Pro / 2.5 Flash Image 表的 10 个比例
const RATIOS_10 = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
const SIZES = ['1K', '2K', '4K'];
// 512 档：指南正文写「512px (0.5K)」；v1 discovery 描述写 `512`，但 https://ai.google.dev/api/generate-content
// 本次抓取未见 ImageConfig 段 → 两个候选都 unverified
const SIZE_512: FieldValue = { value: '512', status: 'unverified', source: G_API_V1 };
const SIZE_512PX: FieldValue = { value: '512px', status: 'unverified' };

function gemini(
  id: string,
  label: string,
  ratios: FieldValue[],
  sizes: FieldValue[],
  opts: { sizeDefault?: string; shutdownDate?: string; ratioNote?: string; sizeNote?: string } = {},
): ModelSpec {
  return {
    provider: 'gemini',
    id,
    label,
    source: G_DOC,
    ...(opts.shutdownDate ? { shutdownDate: opts.shutdownDate, shutdownSource: G_DEPR } : {}),
    fields: {
      aspect_ratio: enumField(G_DOC, ratios, { wire: 'imageConfig.aspectRatio', note: opts.ratioNote ?? '未指定时模型按参考图决定，否则 1:1' }),
      // v1 discovery：「If not specified, the model will use default value `1K`」
      image_size: enumField(G_DOC, sizes, { wire: 'imageConfig.imageSize', providerDefault: opts.sizeDefault, note: opts.sizeNote ?? '必须大写 K' }),
      // ImageConfig 官方仅 aspectRatio + imageSize（无 seed）；GenerationConfig.seed 出现在文本 migrate 例，生图指南未列。
      // 画布/PI 按 unsupported 灰显，不把 Civitai 导入 seed 当作生效，不发上游。
      seed: {
        status: 'unsupported',
        source: G_DOC,
        wire: 'generationConfig.seed',
        type: 'integer',
        note: '生图指南 ImageConfig 仅 aspectRatio/imageSize（https://ai.google.dev/gemini-api/docs/image-generation）；无 imageConfig.seed。GenerationConfig.seed 见于文本例，生图路径不生效 → 灰显且不发上游',
      },
      ...unsupported(G_DOC, ['width', 'height', 'negative_prompt', 'steps', 'cfg', 'sampler', 'scheduler', 'denoise', 'loras'], '官方可选配置只有 aspect_ratio / image_size'),
    },
  };
}

const GEMINI_MODELS: ModelSpec[] = [
  gemini('gemini-3.1-flash-image', 'Gemini 3.1 Flash Image', vals(RATIOS_14, 'supported'), [SIZE_512, SIZE_512PX, ...vals(SIZES, 'supported')], {
    sizeDefault: '1K',
    sizeNote: '必须大写 K；512 档确切字符串未能核实（512 / 512px）',
  }),
  gemini('gemini-3.1-flash-lite-image', 'Gemini 3.1 Flash Lite Image', vals(RATIOS_10, 'supported'), vals(['1K'], 'supported'), { sizeDefault: '1K' }),
  gemini('gemini-3-pro-image', 'Gemini 3 Pro Image', vals(RATIOS_10, 'unverified'), vals(SIZES, 'supported'), {
    sizeDefault: '1K',
    ratioNote: '官方表标题为「3.1 Pro Image」，是否对应此 id 有歧义 → unverified',
  }),
  gemini('gemini-2.5-flash-image', 'Gemini 2.5 Flash Image', vals(RATIOS_10, 'supported'), vals(['1K'], 'unverified'), {
    shutdownDate: '2026-10-02',
    sizeNote: '官方表未列 image_size（正文：generates images at 1024px）→ 候选 1K，unverified',
  }),
  // preview：只有下线日期经核实，取值官方未单独列出 → 以正式版为候选，全部 unverified
  gemini('gemini-3.1-flash-image-preview', 'Gemini 3.1 Flash Image Preview', vals(RATIOS_14, 'unverified'), vals(['512', ...SIZES], 'unverified'), {
    shutdownDate: '2026-06-25',
  }),
  gemini('gemini-3-pro-image-preview', 'Gemini 3 Pro Image Preview', vals(RATIOS_10, 'unverified'), vals(SIZES, 'unverified'), {
    shutdownDate: '2026-06-25',
  }),
];

// ---------- Fal ----------
// 只收录官方 OpenAPI 可取到的端点；已核实 404 的 id（fal-ai/wan/v2.1/*、fal-ai/wan/t2v、fal-ai/flux-dev、
// fal-ai/flux-schnell、fal-ai/stable-diffusion-xl-base-1.0、fal-ai/animagine-xl）不写进来。

const falSrc = (id: string) => `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=${id}`;
const FAL_PRESETS = ['square_hd', 'square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9'];
const FAL_CUSTOM_SIZE = '也可传 {width, height} 对象（各 >0 且 ≤14142）';

function fal(id: string, label: string, build: (src: string) => ModelSpec['fields']): ModelSpec {
  const src = falSrc(id);
  return { provider: 'fal', id, label, source: src, fields: build(src) };
}

const falImageSize = (src: string, providerDefault?: string, note = FAL_CUSTOM_SIZE, wire?: string): FieldSpec =>
  enumField(src, vals(FAL_PRESETS, 'supported'), { providerDefault, note, ...(wire ? { wire } : {}) });
const falSeed = (src: string): FieldSpec => ({ status: 'supported', source: src, type: 'integer' });
const falSteps = (src: string, min: number, max: number, providerDefault: number): FieldSpec =>
  ({ status: 'supported', source: src, wire: 'num_inference_steps', type: 'integer', min, max, providerDefault });
const falCfg = (src: string, wire: string, min: number, max: number, providerDefault: number): FieldSpec =>
  ({ status: 'supported', source: src, wire, type: 'number', min, max, providerDefault });
const falNum = (src: string, max: number): FieldSpec =>
  ({ status: 'supported', source: src, wire: 'num_images', type: 'integer', min: 1, max, providerDefault: 1 });
const falLoras = (src: string, note?: string): FieldSpec =>
  ({ status: 'supported', source: src, type: 'object', ...(note ? { note } : {}) });
const falNeg = (src: string, providerDefault?: string, note?: string): FieldSpec =>
  ({ status: 'supported', source: src, type: 'string', providerDefault, ...(note ? { note } : {}) });

const FAL_LORA_SCHEDULERS = [
  'DPM++ 2M', 'DPM++ 2M Karras', 'DPM++ 2M SDE', 'DPM++ 2M SDE Karras', 'Euler', 'Euler A',
  'Euler (trailing timesteps)', 'LCM', 'LCM (trailing timesteps)', 'DDIM', 'TCD',
];
const WAN_NEG_NOTE = '官方有默认值（一长串负向词），本次抓取被截断未能逐字核实';

const FAL_MODELS: ModelSpec[] = [
  fal('fal-ai/flux-lora', 'FLUX.1 [dev] + LoRA', (s) => ({
    seed: falSeed(s), steps: falSteps(s, 1, 50, 28), cfg: falCfg(s, 'guidance_scale', 0, 35, 3.5),
    loras: falLoras(s, 'LoraWeight {path, scale 0–4 默认 1}'), image_size: falImageSize(s, 'landscape_4_3'), num_images: falNum(s, 4),
    ...unsupported(s, ['negative_prompt', 'sampler', 'scheduler']),
  })),
  fal('fal-ai/flux/dev', 'FLUX.1 [dev]', (s) => ({
    seed: falSeed(s), steps: falSteps(s, 1, 50, 28), cfg: falCfg(s, 'guidance_scale', 1, 20, 3.5),
    image_size: falImageSize(s, 'landscape_4_3'), num_images: falNum(s, 4),
    ...unsupported(s, ['negative_prompt', 'sampler', 'scheduler', 'loras']),
  })),
  fal('fal-ai/flux/schnell', 'FLUX.1 [schnell]', (s) => ({
    seed: falSeed(s), steps: falSteps(s, 1, 12, 4), cfg: falCfg(s, 'guidance_scale', 1, 20, 3.5),
    image_size: falImageSize(s, 'landscape_4_3'), num_images: falNum(s, 4),
    ...unsupported(s, ['negative_prompt', 'sampler', 'scheduler', 'loras']),
  })),
  fal('fal-ai/fast-sdxl', 'Fast SDXL', (s) => ({
    seed: falSeed(s), negative_prompt: falNeg(s, ''), steps: falSteps(s, 1, 50, 25), cfg: falCfg(s, 'guidance_scale', 0, 20, 7.5),
    loras: falLoras(s, 'LoraWeight {path, scale 0–1 默认 1, force}'), image_size: falImageSize(s, 'square_hd'), num_images: falNum(s, 8),
    ...unsupported(s, ['sampler', 'scheduler']),
  })),
  fal('fal-ai/lora', 'SD/SDXL + LoRA（model_name 必填）', (s) => ({
    seed: falSeed(s), negative_prompt: falNeg(s, ''), steps: falSteps(s, 1, 150, 30), cfg: falCfg(s, 'guidance_scale', 0, 20, 7.5),
    scheduler: enumField(s, vals(FAL_LORA_SCHEDULERS, 'supported'), { note: 'A1111 合并命名（采样器+调度器一个名字）；可为 null，官方无默认' }),
    loras: falLoras(s, 'LoraWeight {path, scale 0–4 默认 1}'),
    image_size: falImageSize(s, 'square_hd', `${FAL_CUSTOM_SIZE}；自定义宽高须为 8 的倍数`), num_images: falNum(s, 8),
    ...unsupported(s, ['sampler']),
  })),
  fal('fal-ai/stable-diffusion-v35-large', 'Stable Diffusion 3.5 Large', (s) => ({
    seed: falSeed(s), negative_prompt: falNeg(s, ''), steps: falSteps(s, 1, 50, 28), cfg: falCfg(s, 'guidance_scale', 0, 20, 3.5),
    loras: falLoras(s), image_size: falImageSize(s, undefined, `${FAL_CUSTOM_SIZE}；可为 null，官方无默认`), num_images: falNum(s, 4),
    ...unsupported(s, ['sampler', 'scheduler']),
  })),
  fal('fal-ai/krea-2/turbo', 'Krea 2 Turbo', (s) => ({
    seed: falSeed(s), image_size: falImageSize(s, 'square_hd'), num_images: falNum(s, 4),
    ...unsupported(s, ['negative_prompt', 'steps', 'cfg', 'sampler', 'scheduler', 'loras']),
  })),
  fal('fal-ai/wan-t2v', 'Wan 2.1 文生视频', (s) => ({
    seed: falSeed(s), negative_prompt: falNeg(s, undefined, WAN_NEG_NOTE), steps: falSteps(s, 2, 40, 30),
    aspect_ratio: enumField(s, vals(['9:16', '16:9'], 'supported'), { providerDefault: '16:9' }),
    resolution: enumField(s, vals(['480p', '580p', '720p'], 'supported'), { providerDefault: '720p' }),
    ...unsupported(s, ['cfg', 'sampler', 'scheduler', 'loras', 'num_images']),
  })),
  fal('fal-ai/wan-i2v', 'Wan 2.1 图生视频', (s) => ({
    seed: falSeed(s), negative_prompt: falNeg(s, undefined, WAN_NEG_NOTE), steps: falSteps(s, 2, 40, 30),
    cfg: falCfg(s, 'guide_scale', 1, 10, 5),
    aspect_ratio: enumField(s, vals(['auto', '16:9', '9:16', '1:1'], 'supported'), { providerDefault: 'auto' }),
    resolution: enumField(s, vals(['480p', '720p'], 'supported'), { providerDefault: '720p' }),
    ...unsupported(s, ['sampler', 'scheduler', 'loras', 'num_images']),
  })),
  fal('fal-ai/kling-video/v1/standard/text-to-video', 'Kling v1 Standard 文生视频', (s) => ({
    negative_prompt: falNeg(s, 'blur, distort, and low quality', 'maxLength 2500'), cfg: falCfg(s, 'cfg_scale', 0, 1, 0.5),
    aspect_ratio: enumField(s, vals(['16:9', '9:16', '1:1'], 'supported'), { providerDefault: '16:9' }),
    ...unsupported(s, ['seed', 'steps', 'sampler', 'scheduler', 'loras', 'num_images']),
  })),
  fal('fal-ai/kling-video/v1/standard/image-to-video', 'Kling v1 Standard 图生视频', (s) => ({
    negative_prompt: falNeg(s, 'blur, distort, and low quality', 'maxLength 2500'), cfg: falCfg(s, 'cfg_scale', 0, 1, 0.5),
    ...unsupported(s, ['seed', 'steps', 'sampler', 'scheduler', 'loras', 'num_images', 'aspect_ratio', 'image_size']),
  })),
  fal('fal-ai/minimax/video-01', 'MiniMax Video-01', (s) => ({
    ...unsupported(s, ['seed', 'negative_prompt', 'steps', 'cfg', 'sampler', 'scheduler', 'loras', 'aspect_ratio', 'image_size', 'num_images'], '官方 input 只有 prompt / prompt_optimizer'),
  })),
  fal('fal-ai/ltx-video', 'LTX-Video', (s) => ({
    seed: falSeed(s),
    negative_prompt: falNeg(s, 'low quality, worst quality, deformed, distorted, disfigured, motion smear, motion artifacts, fused fingers, bad anatomy, weird hand, ugly'),
    steps: falSteps(s, 1, 50, 30),
    cfg: { status: 'supported', source: s, wire: 'guidance_scale', type: 'number', exclusiveMin: 1, max: 10, providerDefault: 3 },
    ...unsupported(s, ['sampler', 'scheduler', 'loras', 'aspect_ratio', 'image_size', 'num_images']),
  })),
  fal('fal-ai/hunyuan-video', 'Hunyuan Video', (s) => ({
    seed: falSeed(s),
    aspect_ratio: enumField(s, vals(['16:9', '9:16'], 'supported'), { providerDefault: '16:9' }),
    resolution: enumField(s, vals(['480p', '580p', '720p'], 'supported'), { providerDefault: '720p' }),
    ...unsupported(s, ['negative_prompt', 'steps', 'cfg', 'sampler', 'scheduler', 'loras', 'num_images']),
  })),
  fal('fal-ai/cogvideox-5b', 'CogVideoX-5B', (s) => ({
    seed: falSeed(s), negative_prompt: falNeg(s, ''), steps: falSteps(s, 1, 50, 50), cfg: falCfg(s, 'guidance_scale', 0, 20, 7),
    loras: falLoras(s, 'LoraWeight {path, scale 0–4 默认 1}'),
    image_size: falImageSize(s, undefined, `${FAL_CUSTOM_SIZE}；官方默认为对象 {width: 720, height: 480}`, 'video_size'),
    ...unsupported(s, ['sampler', 'scheduler', 'num_images']),
  })),
];

// ---------- Civitai ----------
// 采样器/调度器枚举成员：本次 OpenAPI 抓取在 components.schemas 之前截断，未能核实 → 不写 enum，只写 recipe 页的默认值。

const CV_OPENAPI = 'https://orchestration.civitai.com/openapi/v2-consumers.json';
const CV_YAML = 'https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.yaml';
const cvRecipe = (r: string) => `https://developer.civitai.com/orchestration/recipes/${r}.md`;
const ENUM_NOTE = '枚举成员未能从 OpenAPI 核实（抓取截断），不列取值';

function civitai(engine: 'sdcpp' | 'comfy', ecosystem: string, label: string, source: string, fields: ModelSpec['fields']): ModelSpec {
  return { provider: 'civitai', id: `${engine}:${ecosystem}`, label, source, fields };
}

const cvDim = (source: string, min: number, max: number, multipleOf: number | undefined, providerDefault: number | undefined, status: FieldStatus = 'supported') =>
  dims({ status, source, type: 'integer', min, max, ...(multipleOf ? { multipleOf } : {}), ...(providerDefault !== undefined ? { providerDefault } : {}) });
const cvInt = (source: string, wire: string, min: number, max: number, providerDefault?: number, status: FieldStatus = 'supported', note?: string): FieldSpec =>
  ({ status, source, wire, type: 'integer', min, max, providerDefault, ...(note ? { note } : {}) });
const cvNum = (source: string, min: number, max: number, providerDefault?: number, status: FieldStatus = 'supported', note?: string): FieldSpec =>
  ({ status, source, wire: 'cfgScale', type: 'number', min, max, providerDefault, ...(note ? { note } : {}) });
const cvEnum = (source: string, wire: string, providerDefault?: string, status: FieldStatus = 'supported'): FieldSpec =>
  ({ status, source, wire, type: 'string', providerDefault, note: ENUM_NOTE });
const cvSeed = (source: string, status: FieldStatus = 'supported'): FieldSpec =>
  ({ status, source, type: 'integer', note: 'int64；不传 = 随机' });
const cvNeg = (source: string, status: FieldStatus = 'supported'): FieldSpec =>
  ({ status, source, wire: 'negativePrompt', type: 'string', note: '≤10000 字符' });
const cvLoras = (source: string, status: FieldStatus = 'supported'): FieldSpec =>
  ({ status, source, type: 'object', note: '{ AIR: strength } 映射，默认 {}' });
const unv = (source: string, keys: FieldKey[], note: string) =>
  Object.fromEntries(keys.map((k) => [k, { status: 'unverified', source, note } satisfies FieldSpec]));

/** sdcpp 通用：sampleMethod / schedule 字段名 */
function sdcpp(ecosystem: string, label: string, recipe: string, o: {
  dim: [number, number, number | undefined, number | undefined];
  steps: [number, number, number | undefined];
  cfg: [number, number, number | undefined];
  schedule: string;
  quantityMax?: number;
  loras?: FieldStatus;
  note?: string;
}): ModelSpec {
  const s = cvRecipe(recipe);
  return civitai('sdcpp', ecosystem, label, s, {
    ...cvDim(s, ...o.dim),
    steps: cvInt(s, 'steps', o.steps[0], o.steps[1], o.steps[2], 'supported', o.note),
    cfg: cvNum(s, o.cfg[0], o.cfg[1], o.cfg[2], 'supported', o.note),
    sampler: cvEnum(s, 'sampleMethod', 'euler'),
    scheduler: cvEnum(s, 'schedule', o.schedule),
    seed: cvSeed(s),
    negative_prompt: cvNeg(s),
    loras: cvLoras(s, o.loras ?? 'supported'),
    num_images: o.quantityMax
      ? cvInt(s, 'quantity', 1, o.quantityMax, 1)
      : { status: 'unverified', source: s, wire: 'quantity', note: 'recipe 页未写 quantity 范围' },
  });
}

const FLUX2_NOTE = 'recipe 页描述的是 engine "flux2"；本应用发 engine "sdcpp" + 此 ecosystem，两者是否同一 schema 未能核实';

const CIVITAI_MODELS: ModelSpec[] = [
  sdcpp('sd1', 'SD 1.5（sdcpp）', 'sd1', { dim: [64, 2048, 16, 512], steps: [1, 150, 20], cfg: [0, 30, 7], schedule: 'discrete', quantityMax: 12 }),
  sdcpp('sdxl', 'SDXL / Illustrious（sdcpp）', 'sdxl', { dim: [64, 2048, 16, 1024], steps: [1, 150, 20], cfg: [0, 30, 7], schedule: 'discrete', quantityMax: 12 }),
  sdcpp('flux1', 'FLUX.1（sdcpp，diffuserModel）', 'flux1', { dim: [832, 1216, 16, 1024], steps: [4, 50, 28], cfg: [1, 20, 3.5], schedule: 'simple', quantityMax: 4 }),
  sdcpp('qwen', 'Qwen 20B（sdcpp）', 'qwen', { dim: [64, 2048, 8, 1024], steps: [1, 150, 20], cfg: [0, 30, 2.5], schedule: 'simple', loras: 'unverified' }),
  sdcpp('anima', 'Anima（sdcpp）', 'anima', { dim: [64, 2048, 16, 1024], steps: [1, 150, 30], cfg: [0, 30, 4], schedule: 'simple', quantityMax: 12, loras: 'unverified' }),
  // Turbo / Base 默认不同（steps 9/20，cfgScale 1/4）→ providerDefault 不写
  sdcpp('zImage', 'Z-Image（sdcpp）', 'zimage', {
    dim: [64, 2048, 16, 1024], steps: [1, 150, undefined], cfg: [0, 30, undefined], schedule: 'simple', quantityMax: 12,
    note: 'Turbo / Base 官方默认不同（steps 9/20，cfgScale 1/4）',
  }),
  civitai('sdcpp', 'flux2Klein', 'FLUX.2 Klein（sdcpp）', cvRecipe('flux2'), {
    ...cvDim(cvRecipe('flux2'), 512, 2048, 16, 1024),
    steps: cvInt(cvRecipe('flux2'), 'steps', 4, 50, 20, 'unverified', FLUX2_NOTE),
    cfg: cvNum(cvRecipe('flux2'), 1, 20, 5, 'unverified', FLUX2_NOTE),
    sampler: cvEnum(cvRecipe('flux2'), 'sampleMethod', 'euler', 'unverified'),
    scheduler: cvEnum(cvRecipe('flux2'), 'schedule', 'simple', 'unverified'),
    seed: cvSeed(cvRecipe('flux2')),
    negative_prompt: cvNeg(cvRecipe('flux2'), 'unverified'),
    loras: cvLoras(cvRecipe('flux2'), 'unverified'),
    num_images: cvInt(cvRecipe('flux2'), 'quantity', 1, 4, 1),
  }),
  civitai('sdcpp', 'flux2Dev', 'FLUX.2 Dev（sdcpp）', cvRecipe('flux2'), {
    // 「Klein requires divisible by 16; other models have no divisibility constraint」（排障段另写 divisible by 8，矛盾 → 不写 multipleOf）
    ...cvDim(cvRecipe('flux2'), 512, 2048, undefined, 1024),
    seed: cvSeed(cvRecipe('flux2')),
    num_images: cvInt(cvRecipe('flux2'), 'quantity', 1, 4, 1),
    ...unv(cvRecipe('flux2'), ['steps', 'cfg', 'sampler', 'scheduler', 'negative_prompt', 'loras'],
      `${FLUX2_NOTE}；recipe 的 Dev 用 numInferenceSteps / guidanceScale，无 negativePrompt`),
  }),
  civitai('comfy', 'flux1', 'FLUX.1（comfy）', CV_YAML, {
    // comfy 生态倍数要求官方未写 → 不写 multipleOf，status unverified
    ...cvDim(CV_YAML, 64, 2048, undefined, 1024, 'unverified'),
    steps: cvInt(CV_YAML, 'steps', 1, 150, 20),
    cfg: cvNum(CV_YAML, 0, 30, 3.5),
    sampler: cvEnum(CV_YAML, 'sampler'),
    scheduler: cvEnum(CV_YAML, 'scheduler'),
    seed: cvSeed(CV_YAML),
    num_images: cvInt(CV_YAML, 'quantity', 1, 12, 1),
    loras: cvLoras(CV_YAML, 'unverified'),
    ...unsupported(cvRecipe('flux1'), ['negative_prompt'], 'Comfy Flux1 不暴露 negativePrompt'),
  }),
  // recipes/krea2.md 404；OpenAPI 抓取截断，未见 krea2 schema → 全部 unverified
  civitai('comfy', 'krea2', 'Krea 2（comfy）', CV_OPENAPI, {
    ...unv(CV_OPENAPI, ['width', 'height', 'steps', 'cfg', 'sampler', 'scheduler', 'seed', 'negative_prompt', 'loras', 'num_images'],
      '官方 recipe 页 404，OpenAPI 未能核实'),
  }),
];

// ---------- Agnes AI (OpenAI-compatible /images/generations) ----------
// Official docs: https://wiki.agnes-ai.com/en/docs/agnes-image-21-flash
// Request params: model, prompt, size (tier or WxH), ratio, image, return_base64, extra_body.
// No seed / negative_prompt / steps / CFG / sampler / scheduler / denoise / loras.
const AGNES_DOC = 'https://wiki.agnes-ai.com/en/docs/agnes-image-21-flash';
const AGNES_RATIO = vals(['1:1', '3:4', '4:3', '16:9', '9:16', '2:3', '3:2', '21:9'], 'supported');
const AGNES_SIZE = vals(['1K', '2K', '3K', '4K'], 'supported');

function agnesImage(id: string, label: string): ModelSpec {
  return {
    provider: 'agnes',
    id,
    label,
    source: AGNES_DOC,
    fields: {
      // App maps canvas width/height → size "WxH" (legacy exact-size accepted by Agnes).
      width: { status: 'supported', source: AGNES_DOC, type: 'integer', note: 'mapped to size WxH / tier' },
      height: { status: 'supported', source: AGNES_DOC, type: 'integer', note: 'mapped to size WxH / tier' },
      aspect_ratio: enumField(AGNES_DOC, AGNES_RATIO, { wire: 'ratio', providerDefault: '1:1' }),
      size: enumField(AGNES_DOC, AGNES_SIZE, { note: 'tier 1K–4K or legacy WxH' }),
      num_images: { status: 'supported', source: AGNES_DOC, wire: 'n', type: 'integer', min: 1, max: 1, providerDefault: 1 },
      ...unsupported(AGNES_DOC, ['seed', 'negative_prompt', 'steps', 'cfg', 'sampler', 'scheduler', 'denoise', 'loras'], '该服务商不支持'),
    },
  };
}

const AGNES_MODELS: ModelSpec[] = [
  agnesImage('agnes-image-2.5-flash', 'Agnes Image 2.5 Flash'),
  agnesImage('agnes-image-2.1-flash', 'Agnes Image 2.1 Flash'),
  agnesImage('agnes-image-2.0-flash', 'Agnes Image 2.0 Flash'),
];

// ---------- Hugging Face Inference (text-to-image) ----------
// Official: https://huggingface.co/docs/inference-providers/main/tasks/text-to-image
// Supported parameters: guidance_scale, negative_prompt, num_inference_steps, width, height, scheduler, seed.
// No LoRA / denoise / image_url / Comfy sampler_name on this route (server 400s loras/cfg-key/denoise/image_url).
const HF_DOC = 'https://huggingface.co/docs/inference-providers/main/tasks/text-to-image';

function hfTextToImage(id: string, label: string): ModelSpec {
  return {
    provider: 'huggingface',
    id,
    label,
    source: HF_DOC,
    fields: {
      seed: { status: 'supported', source: HF_DOC, type: 'integer' },
      negative_prompt: { status: 'supported', source: HF_DOC, type: 'string' },
      steps: { status: 'supported', source: HF_DOC, wire: 'num_inference_steps', type: 'integer', min: 1, max: 150 },
      cfg: { status: 'supported', source: HF_DOC, wire: 'guidance_scale', type: 'number', note: 'sent as guidance / guidance_scale' },
      width: { status: 'supported', source: HF_DOC, type: 'integer' },
      height: { status: 'supported', source: HF_DOC, type: 'integer' },
      scheduler: { status: 'supported', source: HF_DOC, type: 'string', note: 'HF parameters.scheduler' },
      ...unsupported(HF_DOC, ['sampler', 'denoise', 'loras'], '该服务商不支持（text-to-image 无 LoRA / denoise / Comfy sampler）'),
    },
  };
}

const HUGGINGFACE_MODELS: ModelSpec[] = [
  // Canonical row used when checkpoint is empty or leftover from another provider.
  hfTextToImage('huggingface-text-to-image', 'Hugging Face Text-to-Image'),
  hfTextToImage('black-forest-labs/FLUX.1-dev', 'FLUX.1 [dev] (HF)'),
  hfTextToImage('stabilityai/stable-diffusion-xl-base-1.0', 'SDXL 1.0 (HF)'),
  {
    provider: 'huggingface',
    id: 'Tongyi-MAI/Z-Image-Turbo',
    label: 'Z-Image-Turbo (HF Space)',
    source: 'https://huggingface.co/spaces/Tongyi-MAI/Z-Image-Turbo',
    fields: {
      seed: { status: 'supported', source: 'https://huggingface.co/spaces/Tongyi-MAI/Z-Image-Turbo', type: 'integer' },
      steps: { status: 'supported', source: 'https://huggingface.co/spaces/Tongyi-MAI/Z-Image-Turbo', type: 'integer' },
      resolution: { status: 'supported', source: 'https://huggingface.co/spaces/Tongyi-MAI/Z-Image-Turbo', type: 'string' },
      ...unsupported('https://huggingface.co/spaces/Tongyi-MAI/Z-Image-Turbo', ['negative_prompt', 'cfg', 'width', 'height', 'sampler', 'scheduler', 'denoise', 'loras'], 'Z-Image Space 仅 prompt/resolution/seed/steps'),
    },
  },
];

// ---------- 唯一表与查询函数 ----------

// ---------- OpenAI-compat image relay (gpt-image-2) ----------
// 官方字段表：https://platform.openai.com/docs/api-reference/images/create
// 与 https://platform.openai.com/docs/guides/image-generation
// 本轮未能抓取官方 HTML（网关空响应）；取值以 Images API 文档字段名为准，
// gpt-image-2 存活由 2026-09-29 中转 GET /models + POST /images/generations 探针确认。
const OAI_IMG = 'https://platform.openai.com/docs/api-reference/images/create';
const OAI_GUIDE = 'https://platform.openai.com/docs/guides/image-generation';

const OPENAI_COMPAT_MODELS: ModelSpec[] = [
  {
    provider: 'openai_compat',
    id: 'gpt-image-2',
    label: 'GPT Image 2（OpenAI 兼容中转）',
    source: OAI_GUIDE,
    fields: {
      size: enumField(OAI_IMG, vals(['auto', '1024x1024', '1536x1024', '1024x1536'], 'supported'), {
        note: 'WIDTHxHEIGHT 或 auto；未选则不传',
      }),
      quality: enumField(OAI_IMG, vals(['low', 'medium', 'high', 'auto'], 'supported'), {
        note: 'gpt-image-2 不支持 xhigh/max',
      }),
      output_format: enumField(OAI_IMG, vals(['png', 'jpeg', 'webp'], 'supported')),
      background: enumField(OAI_IMG, vals(['transparent', 'opaque', 'auto'], 'supported')),
      moderation: enumField(OAI_IMG, vals(['auto', 'low'], 'supported')),
      num_images: { status: 'supported', source: OAI_IMG, wire: 'n', type: 'integer', min: 1, max: 10 },
      ...unsupported(OAI_IMG, ['seed', 'negative_prompt', 'steps', 'cfg', 'sampler', 'scheduler', 'denoise', 'loras', 'width', 'height'], '该服务商不支持'),
    },
  },
];

// ---------- Grok / xAI-compat relay ----------
const XAI_IMG = 'https://docs.x.ai/docs/guides/image-generations';
const XAI_VID = 'https://docs.x.ai/docs/guides/video-generation';
const GROK_ASPECT = vals(['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', 'auto'], 'supported');

function grokImage(id: string, label: string): ModelSpec {
  return {
    provider: 'grok_compat',
    id,
    label,
    source: XAI_IMG,
    fields: {
      aspect_ratio: enumField(XAI_IMG, GROK_ASPECT),
      resolution: enumField(XAI_IMG, vals(['1k', '1.5k', '2k'], 'supported')),
      num_images: { status: 'supported', source: XAI_IMG, wire: 'n', type: 'integer', min: 1, max: 4 },
      ...unsupported(XAI_IMG, ['seed', 'negative_prompt', 'steps', 'cfg', 'sampler', 'scheduler', 'denoise', 'loras', 'width', 'height'], '该服务商不支持像素宽高 / seed / 负向 / steps / CFG / LoRA'),
    },
  };
}

function grokVideo(id: string, label: string): ModelSpec {
  return {
    provider: 'grok_compat',
    id,
    label,
    source: XAI_VID,
    fields: {
      aspect_ratio: enumField(XAI_VID, GROK_ASPECT),
      resolution: enumField(XAI_VID, vals(['480p', '720p', '1080p'], 'supported')),
      ...unsupported(XAI_VID, ['seed', 'negative_prompt', 'steps', 'cfg', 'sampler', 'scheduler', 'denoise', 'loras', 'width', 'height'], '该服务商不支持像素宽高 / seed / 负向 / steps / CFG / LoRA'),
    },
  };
}

const GROK_COMPAT_MODELS: ModelSpec[] = [
  grokImage('grok-imagine-image', 'Grok Imagine Image（兼容中转）'),
  grokImage('grok-imagine-image-2.0', 'Grok Imagine Image 2.0（兼容中转）'),
  grokImage('grok-imagine-image-quality', 'Grok Imagine Image Quality（兼容中转）'),
  grokVideo('grok-imagine-video', 'Grok Imagine Video（兼容中转）'),
  grokVideo('grok-imagine-video-1.5', 'Grok Imagine Video 1.5（兼容中转）'),
];

// ---------- NanoGPT (/api/v1/images via this app's /api/nanogpt/generate) ----------
// Official OpenAI-compat image schema: https://docs.nano-gpt.com/api-reference/endpoint/image-generation-openai
// (no negative_prompt / loras in OpenAPI). This app's route rejects negative_prompt/steps/cfg/denoise/width/height/size
// and forwards prompt/model/seed/resolution/aspect_ratio (+ optional image_url). LoRA not in official schema → unsupported.
const NANO_DOC = 'https://docs.nano-gpt.com/api-reference/endpoint/image-generation-openai';

function nanoImage(id: string, label: string): ModelSpec {
  return {
    provider: 'nanogpt',
    id,
    label,
    source: NANO_DOC,
    fields: {
      seed: { status: 'supported', source: NANO_DOC, type: 'integer', note: 'optional model-specific hint' },
      aspect_ratio: { status: 'supported', source: NANO_DOC, type: 'string' },
      resolution: enumField(NANO_DOC, vals(['1k', '2k', '4k'], 'supported'), { note: 'app route uses resolution tiers, not pixel WxH' }),
      ...unsupported(NANO_DOC, ['negative_prompt', 'steps', 'cfg', 'sampler', 'scheduler', 'denoise', 'loras', 'width', 'height'], '该服务商不支持'),
    },
  };
}

const NANOGPT_MODELS: ModelSpec[] = [
  nanoImage('flux-schnell', 'FLUX.1 Schnell (NanoGPT)'),
  nanoImage('flux-dev', 'FLUX.1 Dev (NanoGPT)'),
  nanoImage('qwen-image-2.1', 'Qwen Image 2.1 (NanoGPT)'),
  nanoImage('hidream', 'HiDream (NanoGPT)'),
];

// ---------- Tensor.Art OpenWorks (tool/list → /task) ----------
// Official OpenWorks API: POST https://openapi.tensor.art/openworks/v1/tool/list
// Field support is per-tool input descriptions (verified 2026-09-30 live list).
// strong_text2image_nano_banana2 inputs: prompt, size (1K/2K/4K), aspect ratio — NO width/height/seed/steps/cfg/loras.
const TA_DOC = 'https://openapi.tensor.art/openworks/v1/tool/list';
const TA_RATIO = vals(['auto', '21:9', '16:9', '4:3', '3:2', '1:1', '9:16', '3:4', '2:3', '5:4', '4:5'], 'supported');
const TA_SIZE_124 = vals(['1K', '2K', '4K'], 'supported');
const TA_SIZE_12 = vals(['1K', '2K'], 'supported');

/** Banana / Wan text2image tools: size + aspect_ratio only (pixel WxH / seed / steps / cfg / LoRA unsupported). */
function taSizeRatioImage(id: string, label: string, sizes: FieldValue[]): ModelSpec {
  return {
    provider: 'tensorart',
    id,
    label,
    source: TA_DOC,
    fields: {
      aspect_ratio: enumField(TA_DOC, TA_RATIO, { wire: 'ratio' }),
      size: enumField(TA_DOC, sizes, { note: 'OpenWorks size tier — not pixel width/height' }),
      ...unsupported(TA_DOC, ['width', 'height', 'seed', 'negative_prompt', 'steps', 'cfg', 'sampler', 'scheduler', 'denoise', 'loras'], '该服务商不支持（所选 OpenWorks 工具 input schema 无对应项）'),
    },
  };
}

/** Classic OpenWorks tools that expose image width / height (+ count). Still no seed/steps/cfg/LoRA. */
function taWidthHeightImage(id: string, label: string): ModelSpec {
  return {
    provider: 'tensorart',
    id,
    label,
    source: TA_DOC,
    fields: {
      width: { status: 'supported', source: TA_DOC, type: 'integer', note: 'tool input: image width' },
      height: { status: 'supported', source: TA_DOC, type: 'integer', note: 'tool input: image height' },
      num_images: { status: 'supported', source: TA_DOC, wire: 'count', type: 'integer', note: 'result image count' },
      ...unsupported(TA_DOC, ['seed', 'negative_prompt', 'steps', 'cfg', 'sampler', 'scheduler', 'denoise', 'loras'], '该服务商不支持（所选 OpenWorks 工具 input schema 无对应项）'),
    },
  };
}

const TENSORART_MODELS: ModelSpec[] = [
  // First = resolveSchemaModelId fallback when checkpoint empty / leftover from another provider.
  taSizeRatioImage('strong_text2image_nano_banana2', 'Nano Banana 2 文生图 (OpenWorks)', TA_SIZE_124),
  taSizeRatioImage('strong_text2image_wan27', 'Wan 2.7 文生图 (OpenWorks)', TA_SIZE_12),
  taWidthHeightImage('oc_character_illustration', 'OC Character Illustration (OpenWorks)'),
  taWidthHeightImage('anime_lab_wai_illustrious', 'Anime Lab WAI Illustrious (OpenWorks)'),
  taWidthHeightImage('photoreal_studio_z_image', 'Photoreal Studio Z-Image (OpenWorks)'),
];

export const PROVIDER_SCHEMA: readonly ModelSpec[] = [
  ...GEMINI_MODELS,
  ...FAL_MODELS,
  ...CIVITAI_MODELS,
  ...OPENAI_COMPAT_MODELS,
  ...GROK_COMPAT_MODELS,
  ...AGNES_MODELS,
  ...HUGGINGFACE_MODELS,
  ...NANOGPT_MODELS,
  ...TENSORART_MODELS,
];

const INDEX = new Map(PROVIDER_SCHEMA.map((m) => [`${m.provider}/${m.id}`, m]));

export const getModelSpec = (provider: Provider, model: string): ModelSpec | undefined => INDEX.get(`${provider}/${model}`);

export const listModels = (provider: Provider): ModelSpec[] => PROVIDER_SCHEMA.filter((m) => m.provider === provider);

export const getFieldSpec = (provider: Provider, model: string, field: FieldKey): FieldSpec | undefined =>
  getModelSpec(provider, model)?.fields[field];

/** enum 字段的取值列表（下拉选项 / 报错里列出官方取值）；非 enum 或不在表内 → [] */
export const fieldOptions = (provider: Provider, model: string, field: FieldKey): FieldValue[] =>
  getFieldSpec(provider, model, field)?.enum ?? [];

/**
 * 查某取值的状态：模型或字段不在表内 → 'unverified'；enum 字段取值不在列表 → 'unsupported'；
 * 数值字段越界 / 不满足倍数 → 'unsupported'。
 */
export function valueStatus(provider: Provider, model: string, field: FieldKey, value: string | number): FieldStatus {
  const spec = getFieldSpec(provider, model, field);
  if (!spec) return 'unverified';
  if (spec.enum) return spec.enum.find((v) => v.value === String(value))?.status ?? 'unsupported';
  if (spec.status !== 'supported') return spec.status;
  if (spec.type === 'integer' || spec.type === 'number') {
    const n = Number(value);
    if (!Number.isFinite(n)) return 'unsupported';
    if (spec.type === 'integer' && !Number.isInteger(n)) return 'unsupported';
    if (spec.min !== undefined && n < spec.min) return 'unsupported';
    if (spec.max !== undefined && n > spec.max) return 'unsupported';
    if (spec.exclusiveMin !== undefined && n <= spec.exclusiveMin) return 'unsupported';
    if (spec.multipleOf !== undefined && n % spec.multipleOf !== 0) return 'unsupported';
  }
  return 'supported';
}

/** 模型状态：不在表内 → 'unverified'；today（YYYY-MM-DD）≥ shutdownDate → 'deprecated'；否则 'supported' */
export function modelStatus(provider: Provider, model: string, today: string): FieldStatus {
  const spec = getModelSpec(provider, model);
  if (!spec) return 'unverified';
  return spec.shutdownDate && today >= spec.shutdownDate ? 'deprecated' : 'supported';
}

/**
 * Resolve a model id that exists in PROVIDER_SCHEMA for field lookups.
 * If `model` is missing or not in the table for this provider, fall back to the
 * first listed model so supported enum selects (e.g. grok aspect_ratio / resolution)
 * still render instead of disappearing when the checkpoint is empty or leftover
 * from another provider.
 */
export function resolveSchemaModelId(provider: Provider, model: string | undefined | null): string {
  const id = String(model || '').trim();
  if (id && getModelSpec(provider, id)) return id;
  return listModels(provider)[0]?.id ?? id;
}
