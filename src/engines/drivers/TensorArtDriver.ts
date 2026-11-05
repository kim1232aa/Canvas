import { tracedFetch as fetch } from '../../services/executionTrace';
import { BaseEngineDriver } from '../BaseEngineDriver';
import { NormalizedGenerateParams, NormalizedGenerateResult, ModelSpec } from '../types';

export class TensorArtDriver extends BaseEngineDriver {
  readonly id = 'tensorart';
  readonly name = 'Tensor.Art (模型 API)';
  readonly label = 'Tensor.Art 模型与 LoRA';
  readonly badgeColor = '#8b5cf6';
  readonly description = '通过 TAMS 模型 API 指定真实底模 ID 和 LoRA ID；OpenWorks 是独立服务商。';
  readonly capabilities = ['text2img', 'img2img', 'text2video', 'img2video'] as const;
  readonly defaultKey = '';

  readonly supportedModels: ModelSpec[] = [];

  protected async executeGenerate(
    params: NormalizedGenerateParams,
    keys: Record<string, string>
  ): Promise<NormalizedGenerateResult> {
    if (!params.model?.trim()) throw new Error('模型为必填项（model is required）');
    const effectiveKey = params.apiKey || keys.tensorartTamsToken || keys.tensorartKey || this.defaultKey;

    const body: Record<string, any> = {
      prompt: params.prompt,
      model: params.model,
    };
    if (params.negative_prompt) body.negative_prompt = params.negative_prompt;
    if (params.width) body.width = params.width;
    if (params.height) body.height = params.height;
    if (params.seed != null) body.seed = params.seed;
    if (params.image_url) body.image_url = params.image_url;
    if (params.denoise !== undefined) body.denoise = params.denoise;
    if (params.videoDuration) body.duration = params.videoDuration;
    if (params.aspectRatio) body.ratio = params.aspectRatio;
    if (params.extraParams?.size !== undefined) body.size = params.extraParams.size;
    if (params.extraParams?.count !== undefined) body.count = params.extraParams.count;
    if (params.extraParams?.inputs !== undefined) body.inputs = params.extraParams.inputs;
    if (params.extraParams?.custom_parameters !== undefined) body.custom_parameters = params.extraParams.custom_parameters;
    if (params.steps) body.steps = params.steps;
    if (params.cfg !== undefined) body.cfg = params.cfg;
    if (params.loras?.length) body.loras = params.loras;
    if (params.sampler_name || params.extraParams?.sampler_name) body.sampler_name = params.sampler_name || params.extraParams?.sampler_name;
    if (params.scheduler || params.extraParams?.scheduler) body.scheduler = params.scheduler || params.extraParams?.scheduler;

    const endpoint = '/api/tensorart/generate';
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(effectiveKey ? { 'x-tensorart-key': effectiveKey } : {}),
      },
      body: JSON.stringify({ ...body, workflowSnapshot: params.workflowSnapshot }),
    });

    if (!resp.ok) {
      const rawBody = await resp.text().catch(() => '');
      throw new Error(`Tensor.Art 路由 ${endpoint} 返回 HTTP ${resp.status}: ${rawBody}`);
    }

    const data = await resp.json();
    if (!data.mediaUrl) {
      throw new Error(`Tensor.Art 路由返回缺少 mediaUrl: ${JSON.stringify(data)}`);
    }
    if (!data.model) {
      throw new Error(`Tensor.Art 路由返回缺少 model: ${JSON.stringify(data)}`);
    }
    if (!data.provider) {
      throw new Error(`Tensor.Art 路由返回缺少 provider: ${JSON.stringify(data)}`);
    }

    return {
      mediaUrl: data.mediaUrl,
      mediaType: data.mediaType || 'image',
      provider: data.provider,
      providerId: this.id,
      model: data.model,
      actualModel: data.actualModel,
      actualProvider: data.actualProvider,
      requestedModel: params.model,
      seed: data.seed ?? data.historyItem?.seed ?? null,
      rawResponse: data,
    };
  }
}
