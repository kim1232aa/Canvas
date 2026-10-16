import { tracedFetch as fetch } from '../../services/executionTrace';
import { BaseEngineDriver } from '../BaseEngineDriver';
import {
  NormalizedGenerateParams,
  NormalizedGenerateResult,
  ModelSpec,
} from '../types';

export class ReplicateDriver extends BaseEngineDriver {
  readonly id = 'replicate';
  readonly name = 'Replicate';
  readonly label = 'Replicate 官方云平台';
  readonly badgeColor = '#ea580c';
  readonly description = 'Replicate 官方模型运行平台，支持 FLUX.1、SDXL、Ideogram、Wan 等社区与官方模型。';
  readonly capabilities = ['text2img', 'img2img'] as const;
  readonly defaultBaseUrl = 'https://api.replicate.com/v1';
  readonly defaultKey = '';

  readonly supportedModels: ModelSpec[] = [
    {
      id: 'black-forest-labs/flux-schnell',
      name: 'FLUX.1 [schnell] (Replicate)',
      type: 'image',
      description: 'Black Forest Labs 极速 4 步生图模型',
      defaultSteps: 4,
      defaultCfg: 3.5,
      supportsLora: false,
    },
    {
      id: 'black-forest-labs/flux-dev',
      name: 'FLUX.1 [dev] (Replicate)',
      type: 'image',
      description: 'Black Forest Labs 旗舰 28 步生图模型（无 LoRA 字段；LoRA 请用 flux-dev-lora）',
      defaultSteps: 28,
      defaultCfg: 3.5,
      supportsLora: false,
    },
    {
      id: 'black-forest-labs/flux-dev-lora',
      name: 'FLUX.1 [dev] LoRA (Replicate)',
      type: 'image',
      description: '官方 Input：lora_weights + lora_scale（及 extra_lora）；guidance / num_inference_steps',
      defaultSteps: 28,
      defaultCfg: 3,
      supportsLora: true,
    },
    {
      id: 'ideogram-ai/ideogram-v2a',
      name: 'Ideogram v2a (Replicate)',
      type: 'image',
      description: 'Ideogram 官方高质量图像与排版文本生成模型',
      defaultSteps: 20,
      defaultCfg: 5.0,
      supportsLora: false,
    },
    {
      id: 'minimax/image-01',
      name: 'MiniMax Image-01 (Replicate)',
      type: 'image',
      description: 'MiniMax 官方高质量图像生成模型',
      defaultSteps: 25,
      defaultCfg: 7.0,
      supportsLora: false,
    },
    {
      id: 'bytedance/seedream-3',
      name: 'ByteDance Seedream 3 (Replicate)',
      type: 'image',
      description: '字节跳动 Seedream 3 图像生成模型',
      defaultSteps: 25,
      defaultCfg: 7.0,
      supportsLora: false,
    },
  ];

  protected async executeGenerate(
    params: NormalizedGenerateParams,
    keys: Record<string, string>
  ): Promise<NormalizedGenerateResult> {
    if (!params.model?.trim()) {
      throw new Error('模型为必填项（model is required）');
    }

    const effectiveKey = params.apiKey || keys.replicateKey || '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (effectiveKey) headers['x-replicate-key'] = effectiveKey;
    if (params.baseUrl) headers['x-replicate-base-url'] = params.baseUrl;

    const body = {
      model: params.model,
      prompt: params.prompt,
      negative_prompt: params.negative_prompt,
      image_url: params.image_url,
      denoise: params.denoise,
      width: params.width,
      height: params.height,
      steps: params.steps,
      cfg: params.cfg,
      seed: params.seed,
      loras: Array.isArray(params.loras)
        ? params.loras.map((l: any) => (typeof l === 'object' && l !== null ? {
            ...l,
            ...(l.path || l.downloadUrl || l.url ? { path: l.path || l.downloadUrl || l.url } : {}),
            ...(typeof (l.strength ?? l.modelStrength ?? l.scale) === 'number' ? { strength: l.strength ?? l.modelStrength ?? l.scale } : {}),
          } : l))
        : params.loras,
      custom_parameters: params.extraParams?.custom_parameters,
      workflowSnapshot: params.workflowSnapshot,
      ...params.extraParams,
    };

    const resp = await fetch('/api/engine/replicate/generate', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const raw = await resp.text();
      let msg = `Replicate 路由 HTTP ${resp.status}`;
      try {
        const errJson = JSON.parse(raw);
        msg = errJson.details || errJson.error || msg;
      } catch {
        msg = `${msg}: ${raw}`;
      }
      throw new Error(msg);
    }

    const data = await resp.json();
    const mediaUrl = data.mediaUrl || data.imageUrl;
    if (!mediaUrl) {
      throw new Error('Replicate 返回缺少图像输出 URL');
    }

    return {
      mediaUrl,
      mediaType: 'image',
      provider: 'Replicate',
      providerId: 'replicate',
      model: data.model || params.model,
      actualModel: data.actualModel || data.model || params.model,
      actualProvider: data.actualProvider || 'Replicate',
      requestedModel: params.model,
      seed: typeof data.seed === 'number' ? data.seed : (params.seed ?? null),
      rawResponse: data,
    };
  }
}
