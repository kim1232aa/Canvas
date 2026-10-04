import {tracedFetch as fetch} from '../../services/executionTrace';
import { BaseEngineDriver } from '../BaseEngineDriver';
import { NormalizedGenerateParams, NormalizedGenerateResult, ModelSpec } from '../types';
import { httpErrorMessage } from '../compatRelay';
import { filterRealLoraEntries } from '../../utils/resolveCheckpoint';

/**
 * OpenAI 兼容中转（images/generations + images/edits）。
 * Base URL 用户自填，不硬编码 openai.com / birdsun 等域名。
 */
export class OpenAICompatDriver extends BaseEngineDriver {
  readonly id = 'openai_compat';
  readonly name = 'OpenAI 兼容中转';
  readonly label = 'OpenAI 兼容中转（自填 Base URL）';
  readonly badgeColor = '#10a37f';
  readonly description = 'OpenAI Images 兼容中转：gpt-image-2 文生图 / 图生图。须自填 Base URL 与 API Key，不是官方 OpenAI。';
  readonly capabilities = ['text2img', 'img2img'] as const;
  readonly defaultBaseUrl = '';
  readonly defaultKey = '';

  readonly supportedModels: ModelSpec[] = [
    {
      id: 'gpt-image-2',
      name: 'GPT Image 2',
      type: 'image',
      description: 'OpenAI 兼容中转生图（探针已确认）',
      supportsLora: false,
    },
  ];

  protected async executeGenerate(
    params: NormalizedGenerateParams,
    keys: Record<string, string>
  ): Promise<NormalizedGenerateResult> {
    if (!params.model) throw new Error('模型为必填项（model is required）');
    const effectiveKey = params.apiKey || keys.openaiCompatKey || '';
    const effectiveBaseUrl = params.baseUrl || keys.openaiCompatBaseUrl || '';

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (effectiveKey) headers['x-openai-compat-key'] = effectiveKey;
    if (effectiveBaseUrl) headers['x-openai-compat-base-url'] = effectiveBaseUrl;

    const extra = params.extraParams || {};
    const body: Record<string, unknown> = {
      prompt: params.prompt,
      model: params.model,
    };
    if (params.image_url) body.image_url = params.image_url;
    const size =
      extra.size ||
      params.imageSize ||
      (params.width && params.height ? `${params.width}x${params.height}` : undefined);
    if (size) body.size = size;
    if (extra.quality) body.quality = extra.quality;
    if (extra.output_format) body.output_format = extra.output_format;
    if (extra.background) body.background = extra.background;
    if (extra.moderation) body.moderation = extra.moderation;
    if (extra.n != null) body.n = extra.n;
    const realLoras = filterRealLoraEntries(params.loras);
    if (realLoras.length > 0) {
      body.loras = realLoras;
    }

    const resp = await fetch('/api/engine/openai_compat/generate', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...body, workflowSnapshot: params.workflowSnapshot }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: `OpenAI 兼容中转失败 (${resp.status})` }));
      throw new Error(httpErrorMessage(resp.status, err.details || err.error || err));
    }

    const data = await resp.json();
    return {
      mediaUrl: data.mediaUrl || data.imageUrl,
      mediaType: 'image',
      provider: this.name,
      providerId: this.id,
      model: data.model || params.model,
      requestedModel: params.model,
      seed: null,
      rawResponse: data,
    };
  }
}
