import { BaseEngineDriver } from '../BaseEngineDriver';
import { NormalizedGenerateParams, NormalizedGenerateResult, ModelSpec } from '../types';

export class ModelScopeAiDriver extends BaseEngineDriver {
  readonly id = 'modelscope_ai';
  readonly name = 'ModelScope AI (魔搭国际站)';
  readonly label = '阿里魔搭 ModelScope.ai';
  readonly badgeColor = '#7c3aed';
  readonly description = '阿里巴巴开源大模型国际化社区，支持 Wan 2.1 顶级文生视频与全球开源镜像模型。';
  readonly capabilities = ['text2img', 'img2img'] as const;

  readonly supportedModels: ModelSpec[] = [];

  protected async executeGenerate(
    params: NormalizedGenerateParams,
    keys: Record<string, string>
  ): Promise<NormalizedGenerateResult> {
    const effectiveToken = params.apiKey || keys.modelscopeAiToken;

    const resp = await fetch('/api/modelscope_ai/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-modelscope-ai-token': effectiveToken,
        'x-modelscope-site': 'ai',
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
        site: 'ai',
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
      const err = await resp.json().catch(() => ({ error: `魔搭国际站请求失败 (${resp.status})` }));
      const detailStr = err.error || (typeof err.details === 'object' ? JSON.stringify(err.details) : err.details) || `魔搭国际站错误 (${resp.status})`;
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
