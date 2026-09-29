import { BaseEngineDriver } from '../BaseEngineDriver';
import { NormalizedGenerateParams, NormalizedGenerateResult, ModelSpec } from '../types';

export class HuggingFaceDriver extends BaseEngineDriver {
  readonly id = 'huggingface';
  readonly name = 'Hugging Face (Serverless)';
  readonly label = 'Hugging Face 开源平台';
  readonly badgeColor = '#ffbb00';
  readonly description = '全球最大开源 AI 模型社区，直连 Hugging Face Inference API，支持海量开源微调底模。';
  readonly capabilities = ['text2img', 'img2img'] as const;

  readonly supportedModels: ModelSpec[] = [];

  protected async executeGenerate(
    params: NormalizedGenerateParams,
    keys: Record<string, string>
  ): Promise<NormalizedGenerateResult> {
    if (!params.model) throw new Error('模型为必填项（model is required）');
    const effectiveToken = params.apiKey || keys.hfToken;

    const resp = await fetch('/api/huggingface/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(effectiveToken ? { 'x-hf-token': effectiveToken } : {}),
      },
      body: JSON.stringify({
        prompt: params.prompt,
        negative_prompt: params.negative_prompt,
        model: params.model,
        width: params.width,
        height: params.height,
        steps: params.steps,
        guidance: params.cfg,
        seed: params.seed,
        // Forwarded so the server can 400 on them (HF text-to-image has no image input / LoRA field).
        image_url: params.image_url,
        loras: params.loras?.length ? params.loras.map((l) => l.name) : undefined,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: `Hugging Face 请求失败 (${resp.status})` }));
      throw new Error(err.error || err.details || `Hugging Face 错误 (${resp.status})`);
    }

    const data = await resp.json();
    return {
      mediaUrl: data.imageUrl,
      mediaType: 'image',
      provider: this.name,
      providerId: this.id,
      model: data.model || params.model,
      actualModel: data.actualModel || data.model || params.model,
      actualProvider: data.actualProvider || this.name,
      requestedModel: params.model,
      seed: data.historyItem?.seed ?? null,
      rawResponse: data,
    };
  }
}
