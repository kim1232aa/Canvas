import { tracedFetch as fetch } from '../../services/executionTrace';
import { BaseEngineDriver } from '../BaseEngineDriver';
import {
  NormalizedGenerateParams,
  NormalizedGenerateResult,
  ModelSpec,
} from '../types';

export class RunwareDriver extends BaseEngineDriver {
  readonly id = 'runware';
  readonly name = 'Runware';
  readonly label = 'Runware 官方云平台';
  readonly badgeColor = '#3b82f6';
  readonly description = 'Runware 统一高性能推理 API，单接口调用包括 FLUX、SDXL、Qwen 等开源与商用模型。';
  readonly capabilities = ['text2img', 'img2img'] as const;
  readonly defaultBaseUrl = 'https://api.runware.ai/v1';
  readonly defaultKey = '';

  readonly supportedModels: ModelSpec[] = [
    {
      id: 'runware:100@1',
      name: 'FLUX.1 Schnell (Runware 官方托管)',
      type: 'image',
      description: 'Runware 官方托管 FLUX.1 [schnell] 4步极速生图，支持宽、高、步数与 CFG',
      defaultSteps: 4,
      defaultCfg: 3.5,
      supportsLora: true,
    },
    {
      id: 'runware:101@1',
      name: 'FLUX.1 Dev (Runware 官方托管)',
      type: 'image',
      description: 'Runware 官方托管 FLUX.1 [dev] 旗舰画质，支持 LoRA',
      defaultSteps: 25,
      defaultCfg: 3.5,
      supportsLora: true,
    },
    {
      id: 'civitai:101055@128078',
      name: 'SDXL 1.0 Base (Runware Civitai)',
      type: 'image',
      description: '经典 SDXL 1.0 基础模型，支持完整扩散参数与 LoRA',
      defaultSteps: 30,
      defaultCfg: 7.0,
      supportsLora: true,
    },
    {
      id: 'alibaba:qwen-image@3.0',
      name: 'Qwen-Image-3.0 (Runware)',
      type: 'image',
      description: '通义千问 3.0 官方图像生成模型',
      defaultSteps: 25,
      defaultCfg: 5.0,
      supportsLora: false,
    },
  ];

  protected async executeGenerate(
    params: NormalizedGenerateParams,
    keys: Record<string, string>
  ): Promise<NormalizedGenerateResult> {
    if (!params.model) throw new Error('模型为必填项（model is required）');

    const effectiveKey = params.apiKey || keys.runwareKey || '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (effectiveKey) headers['x-runware-key'] = effectiveKey;
    if (params.baseUrl) headers['x-runware-base-url'] = params.baseUrl;

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
      loras: params.loras,
      workflowSnapshot: params.workflowSnapshot,
    };

    const resp = await fetch('/api/engine/runware/generate', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const raw = await resp.text();
      let msg = `Runware 路由 HTTP ${resp.status}`;
      try {
        const errJson = JSON.parse(raw);
        msg = errJson.details || errJson.error || msg;
      } catch {
        msg = `${msg}: ${raw}`;
      }
      throw new Error(msg);
    }

    const data = await resp.json();
    if (!data.mediaUrl && !data.imageUrl) {
      throw new Error('Runware 返回缺少图像输出 URL');
    }

    return {
      mediaUrl: data.mediaUrl || data.imageUrl,
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
