import {tracedFetch as fetch} from '../../services/executionTrace';
import { BaseEngineDriver } from '../BaseEngineDriver';
import { NormalizedGenerateParams, NormalizedGenerateResult, ModelSpec } from '../types';

export class NanoGPTDriver extends BaseEngineDriver {
  readonly id = 'nanogpt';
  readonly name = 'NanoGPT (按次即付)';
  readonly label = 'NanoGPT 极速接口';
  readonly badgeColor = '#f59e0b';
  readonly description = 'NanoGPT 闪电按需推理 API，无需订阅，秒级出片。';
  readonly capabilities = ['text2img', 'img2img', 'text2video', 'img2video'] as const;
  readonly defaultKey = '';

    readonly supportedModels: ModelSpec[] = [];

  protected async executeGenerate(
    params: NormalizedGenerateParams,
    keys: Record<string, string>
  ): Promise<NormalizedGenerateResult> {
    if (!params.model) throw new Error('模型为必填项（model is required）');
    const effectiveKey = params.apiKey || keys.nanogptKey || this.defaultKey;

    const isVideo = Boolean(params.isVideo || params.videoDuration != null);
    if (isVideo) {
      // Official NanoGPT Video API (https://docs.nano-gpt.com/api-reference/endpoint/video-generation):
      // Supported fields: model, prompt, imageUrl (image_url), duration, aspect_ratio, seed.
      // Steps, cfg, sampler_name, scheduler are not in the official specification and are omitted.
      const videoPayload: Record<string, any> = {
        workflowSnapshot: params.workflowSnapshot,
        custom_parameters: params.extraParams?.custom_parameters,
        prompt: params.prompt,
        model: params.model,
        provider: 'nanogpt',
      };
      if (params.aspectRatio) videoPayload.aspect_ratio = params.aspectRatio;
      if (params.image_url) videoPayload.image_url = params.image_url;
      if (params.seed != null) videoPayload.seed = params.seed;
      if (params.videoDuration != null) videoPayload.duration = params.videoDuration;

      const endpoint = '/api/video/generate';
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(effectiveKey ? { 'x-nanogpt-key': effectiveKey } : {}),
        },
        body: JSON.stringify(videoPayload),
      });

      if (!resp.ok) {
        const rawBody = await resp.text().catch(() => '');
        let errMessage = `NanoGPT 视频路由 ${endpoint} 返回 HTTP ${resp.status}: ${rawBody}`;
        try {
          const errObj = JSON.parse(rawBody);
          const detail = errObj.details || errObj.error;
          if (detail) {
            errMessage = `NanoGPT 视频路由 ${endpoint} 返回 HTTP ${resp.status}: ${typeof detail === 'object' ? JSON.stringify(detail) : detail}`;
          }
        } catch {}
        throw new Error(errMessage);
      }

      const vData = await resp.json();
      if (!vData.videoUrl) {
        throw new Error(`NanoGPT 视频路由返回缺少 videoUrl: ${JSON.stringify(vData)}`);
      }

      return {
        mediaUrl: vData.videoUrl,
        mediaType: 'video',
        provider: vData.provider,
        providerId: this.id,
        model: vData.model,
        actualModel: vData.actualModel,
        actualProvider: vData.actualProvider,
        requestedModel: params.model,
        seed: vData.seed ?? null,
        rawResponse: vData,
      };
    }

    // Normalized Image API: server validates fields against live model endpoint metadata.
    const resp = await fetch('/api/nanogpt/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(effectiveKey ? { 'x-nanogpt-key': effectiveKey } : {}),
      },
      body: JSON.stringify({
        workflowSnapshot: params.workflowSnapshot,
        custom_parameters: params.extraParams?.custom_parameters,
        prompt: params.prompt,
        model: params.model,
        seed: params.seed,
        image_url: params.image_url,
        resolution: params.extraParams?.resolution || params.extraParams?.size || params.imageSize,
        aspect_ratio: params.aspectRatio,
        width: params.width,
        height: params.height,
        negative_prompt: params.negative_prompt,
        steps: params.steps,
        cfg: params.cfg,
        denoise: params.denoise,
        sampler_name: params.sampler_name,
        scheduler: params.scheduler,
        loras: params.loras?.length ? params.loras.map((l: any) => (typeof l === 'object' && l !== null ? { ...l, path: l.path || l.downloadUrl || l.url, strength: l.strength ?? l.modelStrength ?? l.scale } : l)) : undefined,
        quality: params.extraParams?.quality,
        output_format: params.extraParams?.output_format,
        n: params.extraParams?.n,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'NanoGPT 生成失败' }));
      throw new Error(err.details || err.error || `NanoGPT 错误 (${resp.status})`);
    }

    const data = await resp.json();
    return {
      mediaUrl: data.imageUrl,
      mediaType: 'image',
      provider: this.name,
      providerId: this.id,
      model: data.model || params.model,
      requestedModel: params.model,
      seed: data.historyItem?.seed ?? null,
      rawResponse: data,
    };
  }
}
