import { BaseEngineDriver } from '../BaseEngineDriver';
import { NormalizedGenerateParams, NormalizedGenerateResult, ModelSpec } from '../types';

export class HuggingFaceDriver extends BaseEngineDriver {
  readonly id = 'huggingface';
  readonly name = 'Hugging Face (Serverless)';
  readonly label = 'Hugging Face 开源平台';
  readonly badgeColor = '#ffbb00';
  readonly description = 'HF Inference、官方 Z-Image Space，以及显式选择的 HF → fal-ai 路由；目录资源不等于在线推理能力。';
  readonly capabilities = ['text2img'] as const;

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
        workflowSnapshot: params.workflowSnapshot,
        prompt: params.prompt,
        negative_prompt: params.negative_prompt,
        model: params.model,
        width: params.width,
        height: params.height,
        steps: params.steps,
        guidance: params.cfg,
        seed: params.seed,
        scheduler: params.scheduler ?? params.extraParams?.scheduler,
        sampler_name: params.sampler_name,
        denoise: params.denoise,
        inference_provider: params.extraParams?.hf_provider || (params.model === 'XLabs-AI/flux-RealismLora' ? 'fal-ai' : undefined),
        image_url: params.image_url,
        loras: params.loras?.length ? params.loras : undefined,
        // All seven Space arguments come from explicit canvas state.
        resolution: params.extraParams?.resolution,
        shift: params.extraParams?.shift,
        random_seed: params.extraParams?.random_seed,
        gallery_images: params.extraParams?.gallery_images,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: `Hugging Face 请求失败 (${resp.status})` }));
      const details = typeof err.details === 'string' ? err.details : err.details ? JSON.stringify(err.details) : '';
      const reason = [err.error, details].filter(Boolean).join(': ') || 'Hugging Face 错误';
      throw new Error(`HTTP ${resp.status}: ${reason}`);
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
