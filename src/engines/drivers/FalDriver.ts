import {tracedFetch as fetch} from '../../services/executionTrace';
import { BaseEngineDriver, withFilledCanvasParams } from '../BaseEngineDriver';
import { NormalizedGenerateParams, NormalizedGenerateResult, ModelSpec } from '../types';

export type { FalServerLoraMappingResult, FalServerLoraPayloadItem } from '../../utils/falLoraMapping';
export { mapFalServerLoras } from '../../utils/falLoraMapping';

export class FalDriver extends BaseEngineDriver {
  readonly id = 'fal';
  readonly name = 'Fal.ai (GPU 云端加速)';
  readonly label = 'Fal.ai 旗舰引擎';
  readonly badgeColor = '#00f0ff';
  readonly description = '业界顶级扩散推理算力，支持 Z-Image Turbo、Krea 2、通义万相 Wan 2.2 动态视频及 Civitai LoRA 挂载。';
  readonly capabilities = ['text2img', 'img2img', 'text2video', 'img2video'] as const;
  readonly defaultKey = '';

  readonly supportedModels: ModelSpec[] = [];

  protected async executeGenerate(
    params: NormalizedGenerateParams,
    keys: Record<string, string>
  ): Promise<NormalizedGenerateResult> {
    if (!params.model) throw new Error('模型为必填项（model is required）');
    const effectiveKey = params.apiKey || keys.falKey || this.defaultKey;
    const keyHeader: Record<string, string> = effectiveKey ? { 'x-fal-key': effectiveKey } : {};
    // Prefer the normalized flag from BaseEngineDriver; do not guess from model id strings.
    const isVideo = Boolean(params.isVideo || params.videoDuration != null);
    const isProvided = (v: any) => v !== undefined && v !== null && v !== '';

    // No client-side model swap; the server reports any documented t2v→i2v endpoint mapping via wasAdapted.
    const finalModel = params.model;

    if (isVideo) {
      const videoBody: Record<string, unknown> = {
        workflowSnapshot: params.workflowSnapshot,
        custom_parameters: params.extraParams?.custom_parameters,
        prompt: params.prompt,
        model: finalModel,
        provider: 'fal',
        image_url: params.image_url,
      };
      if (isProvided(params.aspectRatio)) videoBody.aspect_ratio = params.aspectRatio;
      if (isProvided(params.seed)) videoBody.seed = params.seed;
      if (isProvided(params.videoDuration)) videoBody.duration = params.videoDuration;
      const fpsVal = params.videoFps ?? params.extraParams?.fps;
      if (isProvided(fpsVal)) videoBody.fps = fpsVal;
      const framesVal = params.videoFrames ?? params.extraParams?.num_frames;
      if (isProvided(framesVal)) videoBody.num_frames = framesVal;
      const resVal = params.extraParams?.resolution ?? params.imageSize;
      if (isProvided(resVal)) videoBody.resolution = resVal;
      if (isProvided(params.negative_prompt)) videoBody.negative_prompt = params.negative_prompt;
      if (isProvided(params.steps)) videoBody.steps = params.steps;
      if (isProvided(params.cfg)) videoBody.cfg = params.cfg;
      if (isProvided(params.width)) videoBody.width = params.width;
      if (isProvided(params.height)) videoBody.height = params.height;
      if (isProvided(params.denoise)) videoBody.denoise = params.denoise;
      const sampler = isProvided(params.sampler_name) ? params.sampler_name : params.extraParams?.sampler_name;
      if (isProvided(sampler)) videoBody.sampler_name = sampler;
      const scheduler = isProvided(params.scheduler) ? params.scheduler : params.extraParams?.scheduler;
      if (isProvided(scheduler)) videoBody.scheduler = scheduler;
      if (params.loras?.length) videoBody.loras = params.loras;

      const resp = await fetch('/api/video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...keyHeader },
        body: JSON.stringify(videoBody),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Fal.ai 视频生成失败' }));
        const reason = err.details || err.error || (err.unsupported ? `该服务商不支持: ${err.unsupported.join(', ')}` : `Fal 视频失败`);
        throw new Error(`HTTP ${resp.status}: ${reason}`);
      }

      const vData = await resp.json();
      return {
        mediaUrl: vData.videoUrl,
        mediaType: 'video',
        provider: vData.provider || this.name,
        providerId: this.id,
        model: vData.model || finalModel,
        actualModel: vData.actualModel || vData.model || finalModel,
        actualProvider: vData.actualProvider || vData.provider || this.name,
        requestedModel: params.model,
        seed: vData.seed ?? null,
        wasAdapted: vData.wasAdapted,
        adaptationNotice: vData.adaptationNotice,
        rawResponse: vData,
      };
    }

    // 图像生成（含文生图与图生图）
    const hasDims = isProvided(params.width) && isProvided(params.height);
    const image_size = params.imageSize || (hasDims ? { width: params.width, height: params.height } : undefined);

    const resp = await fetch('/api/fal/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...keyHeader },
      body: JSON.stringify({
        workflowSnapshot: params.workflowSnapshot,
        custom_parameters: params.extraParams?.custom_parameters,
        prompt: params.prompt,
        negative_prompt: params.negative_prompt,
        model: finalModel,
        image_size,
        num_inference_steps: params.steps,
        guidance_scale: params.cfg,
        seed: params.seed,
        image_url: params.image_url,
        denoise: params.denoise,
        sampler_name: params.sampler_name,
        scheduler: params.scheduler,
        ...(isProvided(params.width) ? { width: params.width } : {}),
        ...(isProvided(params.height) ? { height: params.height } : {}),
        model_name: params.extraParams?.model_name,
        num_images: params.extraParams?.n,
        // 2026-11-06: 不在驱动层拦截 clipStrength-only，不伪造 scale，保留原 clipStrength 如实发送由上游/服务端裁决
        loras: (params.loras || []).map((l: any) => {
          const resolvedPath = l.path || l.downloadUrl || l.url || (/^https?:\/\//i.test(String(l.name || '')) ? l.name : undefined);
          const scale = l.strength ?? l.modelStrength ?? l.scale;
          return {
            path: resolvedPath,
            ...(!resolvedPath ? { name: l.name, civitaiId: l.civitaiId } : {}),
            ...(scale !== undefined ? { scale } : {}),
            ...(l.clipStrength !== undefined ? { clipStrength: l.clipStrength } : {}),
          };
        }),
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Fal.ai 生成失败' }));
      const reason = err.details || err.error || (err.unsupported ? `该服务商不支持: ${err.unsupported.join(', ')}` : `Fal.ai 错误`);
      throw new Error(`HTTP ${resp.status}: ${reason}`);
    }

    const data = await resp.json();
    return {
      mediaUrl: data.imageUrl,
      mediaType: 'image',
      provider: this.name,
      providerId: this.id,
      model: data.model || finalModel,
      actualModel: data.actualModel || data.model || finalModel,
      actualProvider: data.actualProvider || this.name,
      requestedModel: params.model,
      seed: data.seed ?? null,
      wasAdapted: data.wasAdapted,
      adaptationNotice: data.adaptationNotice,
      timings: data.timings,
      rawResponse: data,
    };
  }
}
