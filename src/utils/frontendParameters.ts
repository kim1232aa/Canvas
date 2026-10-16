import { normalizeLoraPayloadItem } from './resourceSelection';
import type { SpatialFrame } from '../types/graph';
import type { NormalizedGenerateParams } from '../engines/types';

export function explicitLoraPath(lora: {name:string;downloadUrl?:string}): string | undefined {
  return lora.downloadUrl || (/^(https?:\/\/|\/|\.\/)/.test(lora.name) || /\.(safetensors|ckpt|pt)$/i.test(lora.name) ? lora.name : undefined);
}

export function videoDurationBounds(provider: string | undefined, model: string): {min?: number; max?: number} {
  if (provider !== 'fal') return {};
  if (/^fal-ai\/kling-video\/v3\/standard\/(image|text)-to-video$/.test(model)) return {min:3,max:15};
  if (/^fal-ai\/wan\/v2\.7\/(image|text)-to-video$/.test(model)) return {min:2,max:15};
  return {};
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
    seed:isGemini ? undefined : p.seedControl === 'randomize' ? Math.floor(Math.random()*1000000000) : p.seed,
    image_url:frame.referenceImageUrl,denoise:!isGemini && frame.referenceImageUrl ? p.denoise : undefined,
    sampler_name:p.sampler,scheduler:p.scheduler,isVideo,
    videoDuration:isVideo ? (Object.hasOwn(p,'videoDuration') ? p.videoDuration : frame.videoDuration) : undefined,
    videoFps:isVideo ? (Object.hasOwn(p,'videoFps') ? p.videoFps : frame.videoFps) : undefined,videoFrames:isVideo ? p.videoFrames : undefined,
    aspectRatio:Object.hasOwn(p,'aspectRatio') ? p.aspectRatio : frame.videoAspectRatio,imageSize:p.imageSize,extraParams,
    loras:p.loras.map(l => normalizeLoraPayloadItem({name:l.name,path:explicitLoraPath(l),...(l.downloadUrl?{downloadUrl:l.downloadUrl}:{}),strength:l.modelStrength,modelStrength:l.modelStrength,clipStrength:l.clipStrength,civitaiId:l.civitaiId,triggers:l.triggerWords})),
  };
}
