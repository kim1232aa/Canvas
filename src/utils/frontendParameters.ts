import { getModelSchemaEntry } from '../services/modelSchemaCache';
import { normalizeLoraPayloadItem } from './resourceSelection';
import { randomSeedFor } from './seedRange';
import type { SpatialFrame } from '../types/graph';
import type { NormalizedGenerateParams } from '../engines/types';

export function explicitLoraPath(lora: {name:string;downloadUrl?:string}): string | undefined {
  return lora.downloadUrl || (/^(https?:\/\/|\/|\.\/)/.test(lora.name) || /\.(safetensors|ckpt|pt)$/i.test(lora.name) ? lora.name : undefined);
}

/**
 * cleanup-2026-10-17 #3: video duration bounds/choices come ONLY from the endpoint's official Schema
 * (GET /api/model-schema cache: properties.duration enum / minimum / maximum). No per-model hardcoded ranges.
 * Schema not read yet → {} (free input, nothing invented).
 */
export function videoDurationBounds(provider: string | undefined, model: string): {min?: number; max?: number; options?: Array<string | number>} {
  const d = getModelSchemaEntry(provider, model)?.propertiesObj?.duration as any;
  if (!d || typeof d !== 'object') return {};
  const out: {min?: number; max?: number; options?: Array<string | number>} = {};
  if (Array.isArray(d.enum) && d.enum.length) out.options = d.enum.filter((v: unknown) => typeof v === 'string' || typeof v === 'number');
  if (typeof d.minimum === 'number') out.min = d.minimum;
  if (typeof d.maximum === 'number') out.max = d.maximum;
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
  if (p.unresolvedModel) throw new Error(`底模 ${p.checkpoint || '未指定'} 尚未核实，请重新选择已核实资源`);
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
    if (p.hfProvider === 'z-image-space') {
      for (const [key,value] of Object.entries({shift:p.shift,random_seed:p.randomSeed,gallery_images:p.galleryImages})) if (value !== undefined) extraParams[key] = value;
    }
  }
  const isGemini = provider === 'gemini';
  const omitDimensions = isGemini || (provider === 'agnes' && Boolean(p.size));
  if (omitDimensions) extraParams.omissions = ['width','height'].map(field => ({field,value:p[field as 'width' | 'height'],reason:isGemini ? 'Gemini 使用 aspect_ratio / image_size；保留展示像素尺寸，不作为请求参数' : 'Agnes size 已指定；此路由不提交像素宽高'}));
  if (isGemini) {
    const omitted = Object.entries({seed:p.seed,seedControl:p.seedControl === 'randomize' ? p.seedControl : undefined,denoise:frame.referenceImageUrl ? p.denoise : undefined}).filter(([,value])=>value !== undefined).map(([field,value])=>({field,value,reason:'此 Gemini 图像路由未接入该控制；保留原值，不制造随机种子或重绘值'}));
    extraParams.omissions = [...(extraParams.omissions as unknown[]),...omitted];
  }
  const isVideo = frame.mediaType === 'video' || p.targetProvider === 'video';
  return {prompt:frame.prompt,negative_prompt:frame.negativePrompt,model:p.checkpoint,provider,targetProvider:provider,
    width:omitDimensions ? undefined : p.width,height:omitDimensions ? undefined : p.height,steps:p.steps,cfg:p.cfg,
    seed:isGemini ? undefined : p.seedControl === 'randomize' ? randomSeedFor(provider, p.checkpoint) : p.seed,
    image_url:frame.referenceImageUrl,denoise:!isGemini && frame.referenceImageUrl ? p.denoise : undefined,
    sampler_name:p.sampler,scheduler:p.scheduler,isVideo,
    videoDuration:isVideo ? (Object.hasOwn(p,'videoDuration') ? p.videoDuration : frame.videoDuration) : undefined,
    videoFps:isVideo ? (Object.hasOwn(p,'videoFps') ? p.videoFps : frame.videoFps) : undefined,videoFrames:isVideo ? p.videoFrames : undefined,
    aspectRatio:Object.hasOwn(p,'aspectRatio') ? p.aspectRatio : frame.videoAspectRatio,imageSize:p.imageSize,extraParams,
    loras:p.loras.map(l => normalizeLoraPayloadItem({name:l.name,path:explicitLoraPath(l),...(l.downloadUrl?{downloadUrl:l.downloadUrl}:{}),strength:l.modelStrength,modelStrength:l.modelStrength,clipStrength:l.clipStrength,civitaiId:l.civitaiId,triggers:l.triggerWords})),
  };
}

/**
 * videoschema-2026-10-17: per-field view of the selected endpoint's official Schema (/api/model-schema cache).
 * state: 'unknown' (Schema not read → caller keeps its generic control, nothing invented),
 *        'absent'  (Schema read, field not declared → hide the control; never a fake 「不发送」 row),
 *        'declared' (options from enum, or min/max).
 */
export type VideoSchemaField = {state:'unknown'} | {state:'absent'} | {state:'declared'; options?: Array<string|number>; min?: number; max?: number};
export function videoSchemaField(provider: string | undefined, model: string | undefined, field: string): VideoSchemaField {
  const e = getModelSchemaEntry(provider, model);
  if (!e || e.status !== 'ready' || !e.propertiesObj) return {state:'unknown'};
  const d = e.propertiesObj[field] as any;
  if (!d || typeof d !== 'object') return {state:'absent'};
  const out: VideoSchemaField = {state:'declared'};
  const en = Array.isArray(d.enum) ? d.enum : Array.isArray(d.anyOf) ? d.anyOf.flatMap((x: any) => Array.isArray(x?.enum) ? x.enum : []) : [];
  const opts = en.filter((v: unknown) => typeof v === 'string' || typeof v === 'number');
  if (opts.length) out.options = opts;
  if (typeof d.minimum === 'number') out.min = d.minimum;
  if (typeof d.maximum === 'number') out.max = d.maximum;
  return out;
}

const VIDEO_FIELD_LABEL: Record<string,string> = {duration:'视频时长（秒）', aspect_ratio:'画面比例'};
/** Stored value vs Schema. Never clamps: returns a human reason when the stored value is not allowed (run must be blocked). */
export function videoSchemaValueIssue(provider: string | undefined, model: string | undefined, field: string, value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  const f = videoSchemaField(provider, model, field);
  const label = VIDEO_FIELD_LABEL[field] || field;
  if (f.state === 'absent') return `${label}：这个模型不接收此参数，画布上还存着「${String(value)}」，请清除后再运行`;
  if (f.state !== 'declared') return null;
  if (f.options && !f.options.some((o) => String(o) === String(value))) return `${label}：「${String(value)}」不在这个模型的可选值里（${f.options.join(' / ')}），请重新选择`;
  const n = Number(value);
  if (!f.options && Number.isFinite(n) && ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max))) return `${label}：「${String(value)}」超出这个模型的范围（${f.min ?? ''}–${f.max ?? ''}），请重新填写`;
  return null;
}

/** All video Schema issues on AIVideoNodes among `nodes` (for pre-run blocking). */
export function videoSchemaIssues(nodes: Array<{type:string; title?:string; bypassed?:boolean; values?:Record<string,any>}>): string | null {
  for (const n of nodes) {
    if (n.type !== 'AIVideoNode' || n.bypassed) continue;
    const p = String(n.values?.targetProvider || ''); const m = String(n.values?.model || '');
    for (const f of ['duration', 'aspect_ratio']) {
      const r = videoSchemaValueIssue(p, m, f, n.values?.[f]);
      if (r) return r;
    }
  }
  return null;
}
