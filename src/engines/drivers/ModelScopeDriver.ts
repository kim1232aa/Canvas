import { BaseEngineDriver } from '../BaseEngineDriver';
import { NormalizedGenerateParams, NormalizedGenerateResult, ModelSpec } from '../types';

export class ModelScopeDriver extends BaseEngineDriver {
  readonly id = 'modelscope';
  readonly name = 'ModelScope (阿里魔搭社区)';
  readonly label = '阿里魔搭 ModelScope';
  readonly badgeColor = '#8b5cf6';
  readonly description = '阿里巴巴开源大模型开源社区，原生搭载通义万相 Wan 2.1 大模型及千问系列生图模型。';
  readonly capabilities = ['text2img', 'img2img'] as const;

  readonly supportedModels: ModelSpec[] = [];

  protected async executeGenerate(
    params: NormalizedGenerateParams,
    keys: Record<string, string>
  ): Promise<NormalizedGenerateResult> {
    if (!params.model) throw new Error('模型为必填项（model is required）');
    const effectiveToken = params.apiKey || keys.modelscopeToken;

    const resp = await fetch('/api/modelscope/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(effectiveToken ? { 'x-modelscope-token': effectiveToken } : {}),
        'x-modelscope-site': 'cn',
      },
      body: JSON.stringify({
        prompt: params.prompt,
        negative_prompt: params.negative_prompt,
        model: params.model,
        steps: params.steps,
        guidance: params.cfg,
        seed: params.seed,
        width: params.width,
        height: params.height,
        site: 'cn',
        loras: params.loras,
        image_url: params.image_url,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: `魔搭国内站请求失败 (${resp.status})` }));
      const detailStr = err.error || (typeof err.details === 'object' ? JSON.stringify(err.details) : err.details) || `魔搭国内站错误 (${resp.status})`;
      throw new Error(detailStr);
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
