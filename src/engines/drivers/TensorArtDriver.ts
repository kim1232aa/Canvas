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
    const isProvided = (v: any) => v !== undefined && v !== null && v !== '';
    const extra = params.extraParams || {};
    if (isProvided(params.negative_prompt)) body.negative_prompt = params.negative_prompt;
    if (isProvided(params.width)) body.width = params.width;
    if (isProvided(params.height)) body.height = params.height;
    if (isProvided(params.seed)) body.seed = params.seed;
    if (isProvided(params.image_url)) body.image_url = params.image_url;
    if (isProvided(params.denoise)) body.denoise = params.denoise;
    if (isProvided(params.videoDuration)) body.duration = params.videoDuration;
    if (isProvided(params.aspectRatio)) body.ratio = params.aspectRatio;
    if (isProvided(extra.size)) body.size = extra.size;
    if (isProvided(extra.count)) body.count = extra.count;
    if (isProvided(extra.inputs)) body.inputs = extra.inputs;
    if (isProvided(extra.custom_parameters)) body.custom_parameters = extra.custom_parameters;
    if (isProvided(params.steps)) body.steps = params.steps;
    if (isProvided(params.cfg)) body.cfg = params.cfg;
    if (params.loras?.length) body.loras = params.loras;
    const sampler = isProvided(params.sampler_name) ? params.sampler_name : extra.sampler_name;
    if (isProvided(sampler)) body.sampler_name = sampler;
    const scheduler = isProvided(params.scheduler) ? params.scheduler : extra.scheduler;
    if (isProvided(scheduler)) body.scheduler = scheduler;

    const endpoint = params.isVideo ? '/api/video/generate' : '/api/tensorart/generate';
    if (params.isVideo) body.provider = 'tensorart';
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
      if (params.isVideo) {
        try {
          const err = JSON.parse(rawBody);
          throw new Error(err.details || err.error || rawBody);
        } catch (e: any) {
          if (e instanceof SyntaxError) throw new Error(rawBody || `HTTP ${resp.status}`);
          throw e;
        }
      }
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
