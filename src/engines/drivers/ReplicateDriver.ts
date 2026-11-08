import { tracedFetch as fetch } from '../../services/executionTrace';
import { BaseEngineDriver, withFilledCanvasParams } from '../BaseEngineDriver';
import {
  NormalizedGenerateParams,
  NormalizedGenerateResult,
  ModelSpec,
} from '../types';

/**
 * Official Replicate field is `num_outputs` (image models; default 1). The server contract builder does not map it from a
 * top-level body field, so it travels in custom_parameters (merged into prediction `input`). The user's own JSON wins.
 * ponytail: sent only for batchSize > 1 — 1 is the provider default and some models declare no num_outputs; add schema-gated mapping server-side.
 */
export function withReplicateBatchOutputs(params: NormalizedGenerateParams): Record<string, unknown> | undefined {
  const custom = params.extraParams?.custom_parameters;
  if (params.isVideo || params.batchSize == null || !(params.batchSize > 1)) return custom;
  const base: Record<string, unknown> = custom && typeof custom === 'object' && !Array.isArray(custom) ? custom : {};
  if ('input' in base || 'version' in base) {
    const input = base.input && typeof base.input === 'object' && !Array.isArray(base.input) ? base.input as Record<string, unknown> : {};
    return { ...base, input: { num_outputs: params.batchSize, ...input } };
  }
  return { num_outputs: params.batchSize, ...base };
}

export class ReplicateDriver extends BaseEngineDriver {
  readonly id = 'replicate';
  readonly name = 'Replicate';
  readonly label = 'Replicate 官方云平台';
  readonly badgeColor = '#ea580c';
  readonly description = 'Replicate 官方模型运行平台，支持 FLUX.1、SDXL、Ideogram、Wan 等社区与官方模型。';
  // Video: same live-Schema predictions route (e.g. wan-video/wan2.1-with-lora: image, lora_url, frames).
  readonly capabilities = ['text2img', 'img2img', 'text2video', 'img2video'] as const;
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
      isVideo: params.isVideo || undefined,
      aspect_ratio: params.aspectRatio,
      duration: params.videoDuration,
      fps: params.videoFps,
      num_frames: params.videoFrames,
      loras: Array.isArray(params.loras)
        ? params.loras.map((l: any) => (typeof l === 'object' && l !== null ? {
            ...l,
            ...(l.path || l.downloadUrl || l.url ? { path: l.path || l.downloadUrl || l.url } : {}),
            ...(typeof (l.strength ?? l.modelStrength ?? l.scale) === 'number' ? { strength: l.strength ?? l.modelStrength ?? l.scale } : {}),
          } : l))
        : params.loras,
      workflowSnapshot: params.workflowSnapshot,
      ...params.extraParams,
      custom_parameters: withReplicateBatchOutputs(params),
    };

    const resp = await fetch('/api/engine/replicate/generate', {
      method: 'POST',
      headers,
      body: JSON.stringify(withFilledCanvasParams(body as Record<string, unknown>, params, ['negative_prompt','seed','steps','cfg','width','height','sampler_name','scheduler','denoise','loras'])),
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
      throw new Error(`Replicate 返回缺少${params.isVideo ? '视频' : '图像'}输出 URL`);
    }

    return {
      mediaUrl,
      mediaType: params.isVideo ? 'video' : 'image',
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
