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
    const effectiveToken = params.apiKey || keys.modelscopeToken;

    const resp = await fetch('/api/modelscope/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-modelscope-token': effectiveToken,
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
        image_url: params.image_url,
        loras: (params.loras || []).map((l) => ({
          name: l.name,
          strength: l.strength ?? l.modelStrength ?? 0.8,
          civitaiId: l.civitaiId,
          triggers: l.triggers,
        })),
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
      requestedModel: params.model,
      seed: data.seed ?? (params.seed || 12345),
      rawResponse: data,
    };
  }
}
