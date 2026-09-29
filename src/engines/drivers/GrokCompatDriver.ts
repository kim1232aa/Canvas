import { BaseEngineDriver } from '../BaseEngineDriver';
import {
  NormalizedGenerateParams,
  NormalizedGenerateResult,
  NormalizedChatParams,
  NormalizedChatResult,
  ModelSpec,
} from '../types';
import { httpErrorMessage } from '../compatRelay';

/**
 * Grok / xAI 兼容中转：chat + 生图 + 生视频。
 * Base URL 用户自填；服务端缺 /v1 时补 /v1。不是官方 xAI。
 */
export class GrokCompatDriver extends BaseEngineDriver {
  readonly id = 'grok_compat';
  readonly name = 'Grok 兼容中转';
  readonly label = 'Grok / xAI 兼容中转（自填 Base URL）';
  readonly badgeColor = '#e8e8e8';
  readonly description = 'Grok Imagine 兼容中转：生图 / 图生图 / 文生视频 / 图生视频 / 对话。须自填 Base URL 与 API Key，不是官方 xAI。';
  readonly capabilities = ['text2img', 'img2img', 'text2video', 'img2video', 'reasoning'] as const;
  readonly defaultBaseUrl = '';
  readonly defaultKey = '';

  readonly supportedModels: ModelSpec[] = [
    { id: 'grok-imagine-image', name: 'Grok Imagine Image', type: 'image', supportsLora: false },
    { id: 'grok-imagine-image-2.0', name: 'Grok Imagine Image 2.0', type: 'image', supportsLora: false },
    { id: 'grok-imagine-image-quality', name: 'Grok Imagine Image Quality', type: 'image', supportsLora: false },
    { id: 'grok-imagine-video', name: 'Grok Imagine Video', type: 'video', supportsLora: false },
    { id: 'grok-imagine-video-1.5', name: 'Grok Imagine Video 1.5', type: 'video', supportsLora: false },
    { id: 'grok-4.3', name: 'Grok 4.3', type: 'reasoning' },
    { id: 'grok-4.5', name: 'Grok 4.5', type: 'reasoning' },
  ];

  protected async executeGenerate(
    params: NormalizedGenerateParams,
    keys: Record<string, string>
  ): Promise<NormalizedGenerateResult> {
    if (!params.model) throw new Error('模型为必填项（model is required）');
    const effectiveKey = params.apiKey || keys.grokCompatKey || '';
    const effectiveBaseUrl = params.baseUrl || keys.grokCompatBaseUrl || '';

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (effectiveKey) headers['x-grok-compat-key'] = effectiveKey;
    if (effectiveBaseUrl) headers['x-grok-compat-base-url'] = effectiveBaseUrl;

    const isVideo = Boolean(
      params.isVideo ||
      params.videoDuration ||
      params.model.includes('video')
    );

    if (isVideo) {
      const extra = params.extraParams || {};
      const resp = await fetch('/api/video/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt: params.prompt,
          model: params.model,
          provider: 'grok_compat',
          duration: params.videoDuration,
          aspect_ratio: params.aspectRatio || extra.aspect_ratio,
          resolution: extra.resolution || params.imageSize,
          image_url: params.image_url,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: `Grok 兼容中转视频失败 (${resp.status})` }));
        throw new Error(httpErrorMessage(resp.status, err.details || err.error || err));
      }
      const data = await resp.json();
      return {
        mediaUrl: data.videoUrl || data.mediaUrl,
        mediaType: 'video',
        provider: data.provider || this.name,
        providerId: this.id,
        model: data.model || params.model,
        requestedModel: params.model,
        seed: null,
        rawResponse: data,
      };
    }

    const extra = params.extraParams || {};
    const body: Record<string, unknown> = {
      prompt: params.prompt,
      model: params.model,
    };
    if (params.image_url) body.image_url = params.image_url;
    if (params.aspectRatio) body.aspect_ratio = params.aspectRatio;
    if (extra.resolution || params.imageSize) body.resolution = extra.resolution || params.imageSize;
    if (extra.n != null) body.n = extra.n;
    if (extra.response_format) body.response_format = extra.response_format;

    const resp = await fetch('/api/engine/grok_compat/generate', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: `Grok 兼容中转失败 (${resp.status})` }));
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

  protected async executeChat(
    params: NormalizedChatParams,
    keys: Record<string, string>
  ): Promise<NormalizedChatResult> {
    if (!params.model) throw new Error('模型为必填项（model is required）');
    const effectiveKey = params.apiKey || keys.grokCompatKey || '';
    const effectiveBaseUrl = params.baseUrl || keys.grokCompatBaseUrl || '';

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (effectiveKey) headers['x-grok-compat-key'] = effectiveKey;
    if (effectiveBaseUrl) headers['x-grok-compat-base-url'] = effectiveBaseUrl;

    const resp = await fetch('/api/engine/grok_compat/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: `Grok 兼容中转对话失败 (${resp.status})` }));
      throw new Error(httpErrorMessage(resp.status, err.details || err.error || err));
    }
    const data = await resp.json();
    return {
      content: data.content || '',
      provider: this.name,
      providerId: this.id,
      model: data.model || params.model,
      usage: data.usage,
    };
  }
}
