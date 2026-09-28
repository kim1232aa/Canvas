import { BaseEngineDriver } from '../BaseEngineDriver';
import { NormalizedGenerateParams, NormalizedGenerateResult, ModelSpec } from '../types';

export class FalDriver extends BaseEngineDriver {
  readonly id = 'fal';
  readonly name = 'Fal.ai (GPU 云端加速)';
  readonly label = 'Fal.ai 旗舰引擎';
  readonly badgeColor = '#00f0ff';
  readonly description = '业界顶级扩散推理算力，支持 FLUX.1 全系列、SDXL 1.0、通义万相 Wan 2.1 动态视频及 Civitai LoRA 挂载。';
  readonly capabilities = ['text2img', 'img2img', 'text2video', 'img2video'] as const;
  readonly defaultKey = '';

  readonly supportedModels: ModelSpec[] = [];

  protected async executeGenerate(
    params: NormalizedGenerateParams,
    keys: Record<string, string>
  ): Promise<NormalizedGenerateResult> {
    const effectiveKey = params.apiKey || keys.falKey || this.defaultKey;
    const isVideo = Boolean(
      params.isVideo ||
      params.model.includes('video') ||
      params.model.includes('wan2.1-t2v') ||
      params.model.includes('image-to-video') ||
      params.model.includes('text-to-video')
    );

    // 图生视频 (img2video) 规范分流
    let finalModel = params.model;
    let wasAdapted = false;
    let adaptationNotice = '';
    if (isVideo && params.image_url && !finalModel.includes('image-to-video')) {
      finalModel = 'fal-ai/wan/v2.1/image-to-video';
      wasAdapted = true;
      adaptationNotice = '已检测到输入源图，按照官方规范自动适配为 Wan 2.1 Image-to-Video 图生视频端点。';
    }

    if (isVideo) {
      const resp = await fetch('/api/video/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-fal-key': effectiveKey,
        },
        body: JSON.stringify({
          prompt: params.prompt,
          model: finalModel,
          duration: params.videoDuration || 5,
          fps: params.videoFps || 16,
          aspect_ratio: params.aspectRatio || '16:9',
          image_url: params.image_url,
          seed: params.seed,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Fal.ai 视频生成失败' }));
        throw new Error(err.details || err.error || `Fal 视频失败 (${resp.status})`);
      }

      const vData = await resp.json();
      return {
        mediaUrl: vData.videoUrl,
        mediaType: 'video',
        provider: vData.provider || this.name,
        providerId: this.id,
        model: vData.model || finalModel,
        requestedModel: params.model,
        seed: vData.seed ?? params.seed ?? 42,
        wasAdapted: vData.wasAdapted ?? wasAdapted,
        adaptationNotice: vData.adaptationNotice ?? adaptationNotice,
        rawResponse: vData,
      };
    }

    // 图像生成（含文生图与图生图）
    const resp = await fetch('/api/fal/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-fal-key': effectiveKey,
      },
      body: JSON.stringify({
        prompt: params.prompt,
        negative_prompt: params.negative_prompt,
        model: finalModel,
        image_size: { width: params.width || 1024, height: params.height || 1024 },
        num_inference_steps: params.steps,
        guidance_scale: params.cfg,
        seed: params.seed,
        sampler_name: params.sampler_name,
        scheduler: params.scheduler,
        image_url: params.image_url,
        denoise: params.denoise,
        loras: (params.loras || []).map((l) => ({
          path: l.path || l.url || l.name,
          scale: l.strength ?? l.modelStrength ?? 0.8,
          civitaiId: l.civitaiId,
        })),
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Fal.ai 生成失败' }));
      throw new Error(err.details || err.error || `Fal.ai 错误 (${resp.status})`);
    }

    const data = await resp.json();
    return {
      mediaUrl: data.imageUrl,
      mediaType: 'image',
      provider: this.name,
      providerId: this.id,
      model: data.model || finalModel,
      requestedModel: params.model,
      seed: data.seed ?? (params.seed || 136947637),
      wasAdapted: data.wasAdapted,
      adaptationNotice: data.adaptationNotice,
      timings: data.timings,
      rawResponse: data,
    };
  }
}
