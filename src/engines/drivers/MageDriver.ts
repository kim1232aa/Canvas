import { tracedFetch as fetch } from '../../services/executionTrace';
import { BaseEngineDriver, withFilledCanvasParams } from '../BaseEngineDriver';
import {
  NormalizedGenerateParams,
  NormalizedGenerateResult,
  ModelSpec,
} from '../types';

/** Mage.space Mango image API. Official: https://docs.mage.space/api/models/mango — no LoRA fields. */
export class MageDriver extends BaseEngineDriver {
  readonly id = 'mage';
  readonly name = 'Mage';
  readonly label = 'Mage (Mango)';
  readonly badgeColor = '#a855f7';
  readonly description =
    'Mage.space Mango 图像生成：POST /v1/mango/generate，异步轮询 status_url；无传统 LoRA，角色用 prompt 里 @handle。';
  readonly capabilities = ['text2img', 'img2img'] as const;
  readonly defaultBaseUrl = 'https://api.mage.space';
  readonly defaultKey = '';

  readonly supportedModels: ModelSpec[] = [
    {
      id: 'mango-v3',
      name: 'Mango 3 (default)',
      type: 'image',
      description: '官方默认；resolution 1K|2K；无 LoRA',
      supportsLora: false,
    },
    {
      id: 'mango-v3-turbo',
      name: 'Mango 3 Turbo',
      type: 'image',
      description: '最快最便宜；resolution 1K|2K；无 LoRA',
      supportsLora: false,
    },
    {
      id: 'mango-v3s',
      name: 'Mango 3S',
      type: 'image',
      description: '可达 3K；resolution 2K|3K；无 LoRA',
      supportsLora: false,
    },
    {
      id: 'mango-v2',
      name: 'Mango 2',
      type: 'image',
      description: 'resolution 2K|3K|4K；无 LoRA',
      supportsLora: false,
    },
    {
      id: 'mango',
      name: 'Mango',
      type: 'image',
      description: '初代；resolution 1K–4K；无 LoRA',
      supportsLora: false,
    },
  ];

  protected async executeGenerate(
    params: NormalizedGenerateParams,
    keys: Record<string, string>
  ): Promise<NormalizedGenerateResult> {
    if (!params.model?.trim()) throw new Error('模型为必填项（model is required）');

    const effectiveKey = params.apiKey || keys.mageKey || '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (effectiveKey) headers['x-mage-key'] = effectiveKey;
    if (params.baseUrl) headers['x-mage-base-url'] = params.baseUrl;

    const extra = params.extraParams || {};
    // Mango request schema is additionalProperties:true ("Fields the schema does not list pass
    // through to the model unchanged") — forward user-filled width/height as-is; route labels them.
    const body: Record<string, unknown> = {
      model: params.model,
      model_id: params.model,
      prompt: params.prompt,
      seed: params.seed,
      ...(params.width !== undefined && params.width !== null && !Number.isNaN(Number(params.width)) ? { width: params.width } : {}),
      ...(params.height !== undefined && params.height !== null && !Number.isNaN(Number(params.height)) ? { height: params.height } : {}),
      aspect_ratio: params.aspectRatio || extra.aspect_ratio,
      resolution: extra.resolution || params.imageSize,
      image_url: params.image_url,
      image: extra.image,
      additional_images: extra.additional_images,
      custom_parameters: extra.custom_parameters,
      workflowSnapshot: params.workflowSnapshot,
      loras: Array.isArray(params.loras) ? params.loras : [],
    };

    withFilledCanvasParams(body, params, ['negative_prompt','seed','steps','cfg','width','height','sampler_name','scheduler','denoise','loras']);
    const resp = await fetch('/api/engine/mage/generate', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const raw = await resp.text();
      let msg = `Mage 路由 HTTP ${resp.status}`;
      let errJson: any;
      try {
        errJson = JSON.parse(raw);
        msg = errJson.details || errJson.error || msg;
      } catch {
        msg = `${msg}: ${raw}`;
      }
      const err = new Error(msg);
      (err as any).status = resp.status;
      (err as any).data = errJson;
      throw err;
    }

    const data = await resp.json();
    const mediaUrl = data.mediaUrl || data.imageUrl;
    if (!mediaUrl) {
      throw new Error('Mage 返回缺少图像输出 URL');
    }

    return {
      mediaUrl,
      mediaType: 'image',
      provider: this.name,
      providerId: this.id,
      model: data.model || params.model,
      requestedModel: params.model,
      seed: typeof data.seed === 'number' ? data.seed : params.seed ?? null,
      rawResponse: data,
      actualRequest: data.actualRequest,
    };
  }
}
