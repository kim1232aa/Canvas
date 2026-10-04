import {tracedFetch as fetch} from '../../services/executionTrace';
import { BaseEngineDriver } from '../BaseEngineDriver';
import { NormalizedGenerateParams, NormalizedGenerateResult, ModelSpec } from '../types';

export class TensorArtDriver extends BaseEngineDriver {
  readonly id = 'tensorart';
  readonly name = 'Tensor.Art (模型 API)';
  readonly label = 'Tensor.Art 模型与 LoRA';
  readonly badgeColor = '#8b5cf6';
  readonly description = '通过 TAMS 模型 API 指定真实底模 ID 和 LoRA ID；工具接口单独标识。';
  readonly capabilities = ['text2img', 'img2img', 'text2video', 'img2video'] as const;
  readonly defaultKey = '';

  readonly supportedModels: ModelSpec[] = [];

  protected async executeGenerate(
    params: NormalizedGenerateParams,
    keys: Record<string, string>
  ): Promise<NormalizedGenerateResult> {
    if (!params.model) throw new Error('模型 ID 为必填项（model is required）');
    const effectiveKey = params.apiKey || keys.tensorartKey || this.defaultKey;

    // Forward only caller-provided values — no width=1024/steps=25/cfg=5 defaults (C5).
    const body: Record<string, any> = {
      prompt: params.prompt,
      model: params.model,
    };
    if (params.negative_prompt) body.negative_prompt = params.negative_prompt;
    if (params.width) body.width = params.width;
    if (params.height) body.height = params.height;
    if (params.seed != null) body.seed = params.seed;
    if (params.image_url) body.image_url = params.image_url;
    if (params.denoise !== undefined) body.denoise=params.denoise;
    if (params.videoDuration) body.duration = params.videoDuration;
    if (params.aspectRatio) body.ratio = params.aspectRatio;
    if (params.extraParams?.size !== undefined) body.size = params.extraParams.size;
    if (params.extraParams?.count !== undefined) body.count = params.extraParams.count;
    if (params.extraParams?.inputs !== undefined) body.inputs = params.extraParams.inputs;
    // Forward explicit model-job parameters; model IDs never select the tool API.
    if (params.steps) body.steps = params.steps;
    if (params.cfg !== undefined) body.cfg = params.cfg;
    if (params.loras?.length) body.loras = params.loras;
    if (params.sampler_name || params.extraParams?.sampler_name) body.sampler_name = params.sampler_name || params.extraParams?.sampler_name;
    if (params.scheduler || params.extraParams?.scheduler) body.scheduler = params.scheduler || params.extraParams?.scheduler;

    const resp = await fetch('/api/tensorart/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(effectiveKey ? { 'x-tensorart-key': effectiveKey } : {}),
      },
      body: JSON.stringify({ ...body, workflowSnapshot: params.workflowSnapshot }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Tensor.Art 生成失败' }));
      throw new Error(`HTTP ${resp.status}: ${[err.error,typeof err.details==='object'?JSON.stringify(err.details):err.details,err.credentialHint].filter(Boolean).join(' · ')}`);
    }

    const data = await resp.json();
    return {
      mediaUrl: data.mediaUrl || data.imageUrl || data.videoUrl,
      mediaType: data.mediaType || 'image',
      provider: data.provider || 'Tensor.Art (模型 API)',
      providerId: this.id,
      model: data.toolName || data.model || params.model,
      requestedModel: params.model,
      seed: data.historyItem?.seed ?? null,
      rawResponse: data,
    };
  }
}
