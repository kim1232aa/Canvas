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

    // NanoGPT image API has no negative_prompt/steps/cfg/LoRA/pixel size; only send what it accepts.
    const resp = await fetch('/api/nanogpt/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(effectiveKey ? { 'x-nanogpt-key': effectiveKey } : {}),
      },
      body: JSON.stringify({
        prompt: params.prompt,
        model: params.model,
        seed: params.seed,
        image_url: params.image_url,
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
