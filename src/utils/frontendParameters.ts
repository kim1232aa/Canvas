import { getModelSchemaEntry } from '../services/modelSchemaCache';
import { getLiveVideoSchema } from '../hooks/useLiveVideoModelMatch';
import { normalizeLoraPayloadItem } from './resourceSelection';
import { randomSeedFor } from './seedRange';
import type { SpatialFrame } from '../types/graph';
import type { NormalizedGenerateParams } from '../engines/types';

export function explicitLoraPath(lora: {name:string;downloadUrl?:string}): string | undefined {
  return lora.downloadUrl || (/^(https?:\/\/|\/|\.\/)/.test(lora.name) || /\.(safetensors|ckpt|pt)$/i.test(lora.name) ? lora.name : undefined);
}

/**
 * cleanup-2026-10-17 #3 / 2026-11-02: video field bounds come ONLY from the endpoint's official Schema
 * (GET /api/model-schema cache). Unwraps anyOf for min/max/enum (fal wan num_frames / frames_per_second).
 * No per-model hardcoded ranges. Schema not read yet → {} (free input, nothing invented).
 */
function schemaPropParts(d: any): {min?: number; max?: number; options?: Array<string | number>} {
  if (!d || typeof d !== 'object') return {};
  const out: {min?: number; max?: number; options?: Array<string | number>} = {};
  const collectEnum = (node: any): Array<string | number> => {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node.enum)) return node.enum.filter((v: unknown) => typeof v === 'string' || typeof v === 'number');
    // OpenAPI composition (Replicate/Cog: allOf:[{enum}]; Fal: anyOf; oneOf) — same rule for every provider.
    return ['anyOf', 'oneOf', 'allOf'].flatMap((k) => Array.isArray(node[k]) ? node[k].flatMap(collectEnum) : []);
  };
  const opts = collectEnum(d);
  if (opts.length) out.options = opts;
  const takeMinMax = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (out.min === undefined && typeof node.minimum === 'number') out.min = node.minimum;
    if (out.max === undefined && typeof node.maximum === 'number') out.max = node.maximum;
  };
  takeMinMax(d);
  for (const k of ['anyOf', 'oneOf', 'allOf']) if (Array.isArray(d[k])) for (const branch of d[k]) {
    if (branch && typeof branch === 'object' && branch.type !== 'null') takeMinMax(branch);
  }
  return out;
}

/** Canvas widget name → official Schema property names (fps ↔ frames_per_second; duration ↔ seconds). */
const VIDEO_SCHEMA_ALIASES: Record<string, string[]> = {
  duration: ['duration', 'seconds'],
  aspect_ratio: ['aspect_ratio', 'aspectRatio'],
  num_frames: ['num_frames', 'frames_num', 'frames'],
  fps: ['fps', 'frames_per_second'],
  resolution: ['resolution'],
};

export function videoDurationBounds(provider: string | undefined, model: string): {min?: number; max?: number; options?: Array<string | number>} {
  const f = videoSchemaField(provider, model, 'duration');
  if (f.state !== 'declared') return {};
  const out: {min?: number; max?: number; options?: Array<string | number>} = {};
  if (f.options?.length) out.options = f.options;
  if (f.min !== undefined) out.min = f.min;
  if (f.max !== undefined) out.max = f.max;
  return out;
}

export function assertResolvedResources(loras: Array<{name: string; civitaiId?: string; unresolvedResource?: boolean; resourceVerified?: boolean}>) {
  const unresolved = loras.filter(l => l.unresolvedResource && l.resourceVerified !== true).map(l => l.civitaiId || l.name);
  if (unresolved.length) throw new Error(`未核实资源 ID：${unresolved.join('、')}；请重新选择资源后运行`);
}

export function parseCustomParameters(value?: string): Record<string, unknown> | undefined {
  if (!value?.trim()) return undefined;
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('自定义参数必须是 JSON 对象');
  return parsed as Record<string, unknown>;
}

export function spatialRequestParameters(frame: SpatialFrame): NormalizedGenerateParams {
  const p = frame.params;
  if (p.executionBlockedReason) throw new Error(p.executionBlockedReason);
  if (p.sourceLoraAir) throw new Error('来源 LoRA 执行链尚未接入；请保留此历史档案，创建新的显式生成分支');
  if (p.requireReferenceImage && !frame.referenceImageUrl?.trim()) throw new Error('编辑输入需要明确参考图，请选择或上传参考图');
  const provider = p.targetProvider === 'video' ? p.videoProvider : p.targetProvider;
  if (!provider || provider === 'video') throw new Error('请选择实际视频服务商 videoProvider；不会从模型名称猜测');
  assertResolvedResources(p.loras);
  const extraParams: Record<string, unknown> = {};
  const fields = {size:p.size,quality:p.quality,output_format:p.outputFormat,background:p.background,moderation:p.moderation,resolution:p.resolution,model_name:p.falModelName,custom_parameters:parseCustomParameters(p.customParameters)};
  for (const [key,value] of Object.entries(fields)) if (value !== undefined && value !== '') extraParams[key] = value;
  if (p.targetProvider === 'sensenova') {
    if (typeof p.watermark === 'boolean') extraParams.watermark = p.watermark;
    if (typeof p.promptExtend === 'boolean') extraParams.prompt_extend = p.promptExtend;
  }
  if (provider === 'civitai') {
    for (const [key,value] of Object.entries({engine:p.civitaiEngine,ecosystem:p.civitaiEcosystem,comfyModel:p.civitaiModel,quantity:p.batchSize})) if (value !== undefined && value !== '') extraParams[key] = value;
  }
  if (['fal','nanogpt','openai_compat','grok_compat'].includes(provider)) extraParams.n = p.batchSize;
  if (provider === 'tensorart') extraParams.count = p.batchSize;
  if (provider === 'huggingface') {
    if (p.hfProvider) extraParams.hf_provider = p.hfProvider;
    for (const [key,value] of Object.entries({shift:p.shift,random_seed:p.randomSeed,gallery_images:p.galleryImages})) if (value !== undefined) extraParams[key] = value;
  }
  // 雁 rule: every filled value is sent as filled (no per-provider withholding of pixels/seed/denoise).
  const isVideo = frame.mediaType === 'video' || p.targetProvider === 'video';
  return {prompt:frame.prompt,negative_prompt:frame.negativePrompt,model:p.checkpoint,provider,targetProvider:provider,
    width:p.width,height:p.height,steps:p.steps,cfg:p.cfg,
    seed:p.seedControl === 'randomize' ? randomSeedFor(provider, p.checkpoint) : p.seed,
    image_url:frame.referenceImageUrl,denoise:p.denoise,
    sampler_name:p.sampler,scheduler:p.scheduler,isVideo,
    videoDuration:isVideo ? (Object.hasOwn(p,'videoDuration') ? p.videoDuration : frame.videoDuration) : undefined,
    videoFps:isVideo ? (Object.hasOwn(p,'videoFps') ? p.videoFps : frame.videoFps) : undefined,videoFrames:isVideo ? p.videoFrames : undefined,
    aspectRatio:Object.hasOwn(p,'aspectRatio') ? p.aspectRatio : frame.videoAspectRatio,imageSize:p.imageSize,extraParams,
    loras:p.loras.map(l => normalizeLoraPayloadItem({
      ...l,
      name:l.name,
      path:explicitLoraPath(l),
      ...(l.downloadUrl?{downloadUrl:l.downloadUrl}:{}),
      ...(l.air?{air:l.air}:{}),
      ...(l.modelId?{modelId:l.modelId}:{}),
      ...(l.versionId?{versionId:l.versionId}:{}),
      ...(l.styleId?{styleId:l.styleId}:{}),
      ...(l.catalogId?{catalogId:l.catalogId}:{}),
      ...(l.sd_name_in_api?{sd_name_in_api:l.sd_name_in_api}:{}),
      strength:l.modelStrength,
      modelStrength:l.modelStrength,
      clipStrength:l.clipStrength,
      civitaiId:l.civitaiId,
      triggers:l.triggerWords
    })),
  };
}

/**
 * videoschema-2026-10-17: per-field view of the selected endpoint's official Schema (/api/model-schema cache).
 * state: 'unknown' (Schema not read → caller keeps its generic control, nothing invented),
 *        'absent'  (Schema read, field not declared → hide only an empty control; a filled value stays editable and is sent as-is),
 *        'declared' (options from enum, or min/max).
 */
export type VideoSchemaField = {state:'unknown'} | {state:'absent'} | {state:'declared'; options?: Array<string|number>; min?: number; max?: number};
export function videoSchemaField(provider: string | undefined, model: string | undefined, field: string): VideoSchemaField {
  const live = getLiveVideoSchema(provider, model);
  const e = getModelSchemaEntry(provider, model);
  const propertiesObj = live?.properties || (e?.status === 'ready' ? e.propertiesObj : undefined);
  if (!propertiesObj) return {state:'unknown'};
  const names = VIDEO_SCHEMA_ALIASES[field] || [field];
  let d: any;
  for (const name of names) {
    const cand = propertiesObj[name];
    if (cand && typeof cand === 'object') { d = cand; break; }
  }
  if (!d) return {state:'absent'};
  const parts = schemaPropParts(d);
  const out: VideoSchemaField = {state:'declared'};
  if (parts.options?.length) out.options = parts.options;
  if (parts.min !== undefined) out.min = parts.min;
  if (parts.max !== undefined) out.max = parts.max;
  return out;
}

