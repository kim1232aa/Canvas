import { tracedFetch as fetch } from '../../services/executionTrace';
import { BaseEngineDriver } from '../BaseEngineDriver';
import {
  NormalizedGenerateParams,
  NormalizedGenerateResult,
  ModelSpec,
} from '../types';

export class ModelsLabDriver extends BaseEngineDriver {
  readonly id = 'modelslab';
  readonly name = 'ModelsLab';
  readonly label = 'ModelsLab 官方云平台';
  readonly badgeColor = '#8b5cf6';
  readonly description = 'ModelsLab 官方图像生成接口，支持 Flux、SDXL 等海量社区与微调模型，支持 LoRA 与步数控制。';
  readonly capabilities = ['text2img', 'img2img'] as const;
  readonly defaultBaseUrl = 'https://modelslab.com';
  readonly defaultKey = '';

  readonly supportedModels: ModelSpec[] = [
    {
      id: 'flux',
      name: 'FLUX.1 ModelsLab',
      type: 'image',
      description: 'ModelsLab 托管 FLUX.1 图像生成',
      supportsLora: true,
    },
    {
      id: 'sdxl',
      name: 'SDXL Base',
      type: 'image',
      description: 'Stable Diffusion XL 基础模型',
      supportsLora: true,
    },
    {
      id: 'dream-shaper-v8',
      name: 'DreamShaper V8',
      type: 'image',
      description: 'DreamShaper V8 社区微调模型',
      supportsLora: true,
    },
  ];

  protected async executeGenerate(
    params: NormalizedGenerateParams,
    keys: Record<string, string>
  ): Promise<NormalizedGenerateResult> {
    if (!params.model?.trim()) throw new Error('模型为必填项（model is required）');

    const effectiveKey = params.apiKey || keys.modelslabKey || '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (effectiveKey) headers['x-modelslab-key'] = effectiveKey;
    if (params.baseUrl) headers['x-modelslab-base-url'] = params.baseUrl;

    const body = {
      model: params.model,
      prompt: params.prompt,
      negative_prompt: params.negative_prompt,
      width: params.width,
      height: params.height,
      steps: params.steps,
      cfg: params.cfg,
      seed: params.seed,
      image_url: params.image_url,
      denoise: params.denoise,
      scheduler: params.scheduler,
      loras: Array.isArray(params.loras)
        ? params.loras.map((l: any) => (typeof l === 'object' && l !== null ? {
            ...l,
            ...(typeof (l.strength ?? l.modelStrength ?? l.scale) === 'number' ? { strength: l.strength ?? l.modelStrength ?? l.scale } : {}),
          } : l))
        : params.loras,
      custom_parameters: params.extraParams?.custom_parameters,
      workflowSnapshot: params.workflowSnapshot,
    };

    let resp: Response;
    try {
      resp = await fetch('/api/engine/modelslab/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new Error(parseModelsLabFailure(error));
    }

    if (!resp.ok) {
      throw new Error(await readModelsLabError(resp));
    }

    const data = await resp.json();
    const mediaUrl = data.mediaUrl || data.imageUrl;
    if (!mediaUrl) {
      throw new Error('ModelsLab 返回缺少图像输出 URL');
    }

    return {
      mediaUrl,
      mediaType: 'image',
      provider: this.name,
      providerId: this.id,
      model: data.model || params.model,
      requestedModel: params.model,
      seed: typeof data.seed === 'number' ? data.seed : (params.seed ?? null),
      rawResponse: data,
    };
  }
}

function parseModelsLabFailure(error: unknown): string {
  const traceError = error as { rawBody?: unknown; message?: unknown };
  if (typeof traceError?.rawBody === 'string' && traceError.rawBody.trim()) {
    return messageFromModelsLabBody(traceError.rawBody, 'ModelsLab 上游请求失败');
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'ModelsLab 上游请求失败';
}

async function readModelsLabError(resp: Response): Promise<string> {
  const raw = await resp.text();
  return messageFromModelsLabBody(raw, `ModelsLab 路由 HTTP ${resp.status}`);
}

function messageFromModelsLabBody(raw: string, fallback: string): string {
  try {
    const errJson = JSON.parse(raw);
    return errJson.details || errJson.error || errJson.message || fallback;
  } catch {
    return raw.trim() ? `${fallback}: ${raw}` : fallback;
  }
}
