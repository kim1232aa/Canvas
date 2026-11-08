import {tracedFetch as fetch} from '../../services/executionTrace';
import { BaseEngineDriver, withFilledCanvasParams } from '../BaseEngineDriver';
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
      // Supported fields: model, prompt, imageUrl (image_url), duration, aspect_ratio, seed, negative_prompt, cfg_scale, num_inference_steps.
      const isProvided = (v: any) => v !== undefined && v !== null && v !== '';
      const videoPayload: Record<string, any> = {
        workflowSnapshot: params.workflowSnapshot,
        custom_parameters: params.extraParams?.custom_parameters,
        prompt: params.prompt,
        model: params.model,
        provider: 'nanogpt',
      };
      if (isProvided(params.aspectRatio)) videoPayload.aspect_ratio = params.aspectRatio;
      if (isProvided(params.image_url)) videoPayload.image_url = params.image_url;
      if (isProvided(params.seed)) videoPayload.seed = params.seed;
      if (isProvided(params.videoDuration)) videoPayload.duration = params.videoDuration;
      if (isProvided(params.negative_prompt)) videoPayload.negative_prompt = params.negative_prompt;
      if (isProvided(params.steps)) videoPayload.num_inference_steps = params.steps;
      if (isProvided(params.cfg)) videoPayload.cfg_scale = params.cfg;
      const fpsVal = params.videoFps ?? params.extraParams?.fps;
      if (isProvided(fpsVal)) videoPayload.fps = fpsVal;
      const framesVal = params.videoFrames ?? params.extraParams?.num_frames;
      if (isProvided(framesVal)) videoPayload.num_frames = framesVal;
      const resVal = params.extraParams?.resolution ?? params.imageSize;
      if (isProvided(resVal)) videoPayload.resolution = resVal;
      withFilledCanvasParams(videoPayload, params, ['loras', 'width', 'height']);

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
        throw new Error(`NanoGPT 视频路由 ${endpoint} 返回 HTTP ${resp.status}: ${rawBody}`);
      }

      const vData = await resp.json();
      if (!vData.videoUrl) {
        throw new Error(`NanoGPT 视频路由返回缺少 videoUrl: ${JSON.stringify(vData)}`);
      }
      if (!vData.model) {
        throw new Error(`NanoGPT 视频路由返回缺少 model: ${JSON.stringify(vData)}`);
      }
      if (!vData.provider) {
        throw new Error(`NanoGPT 视频路由返回缺少 provider: ${JSON.stringify(vData)}`);
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
    const endpoint = '/api/nanogpt/generate';
    const resp = await fetch(endpoint, {
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
        n: params.batchSize != null && params.batchSize > 0 ? params.batchSize : params.extraParams?.n,
      }),
    });

    if (!resp.ok) {
      const rawBody = await resp.text().catch(() => '');
      throw new Error(`NanoGPT 图像路由 ${endpoint} 返回 HTTP ${resp.status}: ${rawBody}`);
    }

    const data = await resp.json();
    if (!data.imageUrl) {
      throw new Error(`NanoGPT 图像路由返回缺少 imageUrl: ${JSON.stringify(data)}`);
    }
    if (!data.model) {
      throw new Error(`NanoGPT 图像路由返回缺少 model: ${JSON.stringify(data)}`);
    }
    if (!data.provider) {
      throw new Error(`NanoGPT 图像路由返回缺少 provider: ${JSON.stringify(data)}`);
    }

    return {
      mediaUrl: data.imageUrl,
      mediaType: 'image',
      provider: data.provider,
      providerId: this.id,
      model: data.model,
      actualModel: data.actualModel,
      actualProvider: data.actualProvider,
      requestedModel: params.model,
      seed: data.historyItem?.seed ?? null,
      rawResponse: data,
    };
  }
}
