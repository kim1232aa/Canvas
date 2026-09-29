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
    if (!params.model) throw new Error('模型（toolName）为必填项（model is required）');
    const effectiveKey = params.apiKey || keys.tensorartKey || this.defaultKey;

    // Forward only caller-provided values — no width=1024/steps=25/cfg=5 defaults (C5).
    const body: Record<string, any> = {
      prompt: params.prompt,
      model: params.model,
      toolName: params.model,
    };
    if (params.negative_prompt) body.negative_prompt = params.negative_prompt;
    if (params.width) body.width = params.width;
    if (params.height) body.height = params.height;
    if (params.seed != null) body.seed = params.seed;
    if (params.image_url) body.image_url = params.image_url;
    if (params.videoDuration) body.duration = params.videoDuration;
    if (params.aspectRatio) body.ratio = params.aspectRatio;
    // Steps/cfg/loras: Tensor.Art OpenWorks tools don't have these as named schema fields;
    // the server will 400 if they don't match an input description keyword (C5).
    if (params.steps) body.steps = params.steps;
    if (params.cfg) body.cfg = params.cfg;
    if (params.loras?.length) body.loras = params.loras;

    const resp = await fetch('/api/tensorart/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(effectiveKey ? { 'x-tensorart-key': effectiveKey } : {}),
      },
      body: JSON.stringify(body),
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
      seed: data.historyItem?.seed ?? null,
      rawResponse: data,
    };
  }
}
