import { BaseEngineDriver } from '../BaseEngineDriver';
import { NormalizedGenerateParams, NormalizedGenerateResult, ModelSpec } from '../types';

export class NanoGPTDriver extends BaseEngineDriver {
  readonly id = 'nanogpt';
  readonly name = 'NanoGPT (按次即付)';
  readonly label = 'NanoGPT 极速接口';
  readonly badgeColor = '#f59e0b';
  readonly description = 'NanoGPT 闪电按需推理 API，无需订阅，秒级出片。';
  readonly capabilities = ['text2img', 'img2img'] as const;
  readonly defaultKey = '';

    readonly supportedModels: ModelSpec[] = [];

  protected async executeGenerate(
    params: NormalizedGenerateParams,
    keys: Record<string, string>
  ): Promise<NormalizedGenerateResult> {
    if (!params.model) throw new Error('模型为必填项（model is required）');
    const effectiveKey = params.apiKey || keys.nanogptKey || this.defaultKey;

    // Normalized Image API: server validates fields against live model endpoint metadata.
    const resp = await fetch('/api/nanogpt/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(effectiveKey ? { 'x-nanogpt-key': effectiveKey } : {}),
      },
      body: JSON.stringify({
        workflowSnapshot: params.workflowSnapshot,
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
        loras: params.loras?.length ? params.loras : undefined,
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
