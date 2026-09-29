import { BaseEngineDriver } from '../BaseEngineDriver';
import { NormalizedGenerateParams, NormalizedGenerateResult, ModelSpec } from '../types';
import { getFieldSpec } from '../../schemas/providerSchema';

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
    if (!params.model) throw new Error('模型为必填项（model is required）');
    const effectiveKey = params.apiKey || keys.falKey || this.defaultKey;
    const keyHeader: Record<string, string> = effectiveKey ? { 'x-fal-key': effectiveKey } : {};
    const isVideo = Boolean(
      params.isVideo ||
      params.model.includes('video') ||
      params.model.includes('wan2.1-t2v') ||
      params.model.includes('image-to-video') ||
      params.model.includes('text-to-video')
    );

    // No client-side model swap; the server reports any documented t2v→i2v endpoint mapping via wasAdapted.
    const finalModel = params.model;

    // 发送前按 providerSchema 校验：若该端点 loras 为 unsupported，前端拦截，不发出请求
    if (params.loras && params.loras.length > 0) {
      const loraSpec = getFieldSpec('fal', finalModel, 'loras');
      if (loraSpec?.status === 'unsupported') {
        throw new Error(`该端点不支持 LoRA（Fal.ai 端点 ${finalModel} 的官方 schema 无 loras 字段）`);
      }
    }

    if (isVideo) {
      const resp = await fetch('/api/video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...keyHeader },
        body: JSON.stringify({
          prompt: params.prompt,
          model: finalModel,
          provider: 'fal',
          aspect_ratio: params.aspectRatio,
          image_url: params.image_url,
          seed: params.seed,
        }),
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
    const resp = await fetch('/api/fal/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...keyHeader },
      body: JSON.stringify({
        prompt: params.prompt,
        negative_prompt: params.negative_prompt,
        model: finalModel,
        image_size: params.width && params.height ? { width: params.width, height: params.height } : undefined,
        num_inference_steps: params.steps,
        guidance_scale: params.cfg,
        seed: params.seed,
        image_url: params.image_url,
        denoise: params.image_url ? params.denoise : undefined,
        // V2: no strength fallback — server 400s if scale/path missing.
        loras: (params.loras || []).map((l) => ({
          path: l.path || l.url,
          scale: l.strength ?? l.modelStrength,
        })),
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
