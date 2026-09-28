import { BaseEngineDriver } from '../BaseEngineDriver';
import { NormalizedGenerateParams, NormalizedGenerateResult, ModelSpec } from '../types';

export class TensorArtDriver extends BaseEngineDriver {
  readonly id = 'tensorart';
  readonly name = 'Tensor.Art (OpenWorks 算力)';
  readonly label = 'Tensor.Art 官方 OpenAPI 端点';
  readonly badgeColor = '#8b5cf6';
  readonly description = 'Tensor.Art OpenWorks 官方 OpenAPI，支持 ak_tensor 与 ak_tusi 密钥及 23 款 AI 工具链。';
  readonly capabilities = ['text2img', 'img2img', 'text2video', 'img2video'] as const;
  readonly defaultKey = '';

  readonly supportedModels: ModelSpec[] = [];

  protected async executeGenerate(
    params: NormalizedGenerateParams,
    keys: Record<string, string>
  ): Promise<NormalizedGenerateResult> {
    const effectiveKey = params.apiKey || keys.tensorartKey || this.defaultKey;

    const resp = await fetch('/api/tensorart/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tensorart-key': effectiveKey,
      },
      body: JSON.stringify({
        prompt: params.prompt,
        negative_prompt: params.negative_prompt,
        model: params.model,
        toolName: params.model,
        width: params.width || 1024,
        height: params.height || 1024,
        steps: params.steps || 25,
        cfg: params.cfg || 5.0,
        seed: params.seed,
        loras: params.loras,
        image_url: params.image_url,
        duration: params.videoDuration || 5,
        ratio: params.aspectRatio || '16:9',
        size: params.width && params.width >= 1080 ? '1080P' : '720P',
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Tensor.Art 生成失败' }));
      throw new Error(err.details || err.error || `Tensor.Art 接口错误 (${resp.status})`);
    }

    const data = await resp.json();
    return {
      mediaUrl: data.mediaUrl || data.imageUrl || data.videoUrl,
      mediaType: data.mediaType || 'image',
      provider: data.provider || 'Tensor.Art (OpenWorks)',
      providerId: this.id,
      model: data.toolName || data.model || params.model,
      requestedModel: params.model,
      seed: data.seed || params.seed || 0,
      rawResponse: data,
    };
  }
}
