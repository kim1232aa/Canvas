import { BaseEngineDriver } from '../BaseEngineDriver';
import {
  NormalizedGenerateParams,
  NormalizedGenerateResult,
  NormalizedChatParams,
  NormalizedChatResult,
  ModelSpec,
} from '../types';

export class GeminiDriver extends BaseEngineDriver {
  readonly id = 'gemini';
  readonly name = 'Google Gemini (官方直连)';
  readonly label = 'Google 官方 Gemini';
  readonly badgeColor = '#10b981';
  readonly description = 'Google 官方 Gemini 2.5 Flash Image、Gemini 3.1 Flash Image 及 Gemini 3.8 Flash 深度多模态思考推理模型。';
  readonly capabilities = ['text2img', 'reasoning'] as const;

  readonly supportedModels: ModelSpec[] = [
    {
      id: 'gemini-2.5-flash-image',
      name: 'Gemini 2.5 Flash Image (经典生图)',
      type: 'image',
      description: 'Google 官方经典生图模型',
      defaultSteps: 20,
      defaultCfg: 4.5,
      supportsLora: false,
    },
    {
      id: 'gemini-3.1-flash-image',
      name: 'Gemini 3.1 Flash Image (高清图像生成)',
      type: 'image',
      description: 'Google 新一代 Nano Banana 2 高清多画幅图像生成大模型',
      defaultSteps: 20,
      defaultCfg: 4.5,
      supportsLora: false,
    },
    {
      id: 'gemini-3.1-flash-lite-image',
      name: 'Gemini 3.1 Flash Lite Image (极速生图)',
      type: 'image',
      description: '极低延迟快速生图与概念渲染',
      defaultSteps: 15,
      defaultCfg: 4.0,
      supportsLora: false,
    },
    {
      id: 'gemini-3-pro-image',
      name: 'Gemini 3 Pro Image (Nano Banana Pro)',
      type: 'image',
      description: 'Google 高画质旗舰生图大模型',
      defaultSteps: 20,
      defaultCfg: 5.0,
      supportsLora: false,
    },
    {
      id: 'gemini-3.8-flash',
      name: 'Gemini 3.8 Flash (旗舰多模态思考)',
      type: 'reasoning',
      description: 'Google 旗舰级多模态视觉推理与超快文本生成',
    },
    {
      id: 'gemini-3.1-pro-preview',
      name: 'Gemini 3.1 Pro (复杂逻辑推理)',
      type: 'reasoning',
      description: '前沿复杂科学与提示词长链深度推理',
    },
  ];

  protected async executeGenerate(
    params: NormalizedGenerateParams,
    keys: Record<string, string>
  ): Promise<NormalizedGenerateResult> {
    if (!params.model) throw new Error('模型为必填项（model is required）');
    const effectiveKey = params.apiKey || keys.geminiKey || '';

    const body: Record<string, any> = {
      prompt: params.prompt,
      model: params.model,
    };
    if (params.aspectRatio && typeof params.aspectRatio === 'string' && params.aspectRatio.trim() !== '') {
      body.aspect_ratio = params.aspectRatio.trim();
    }
    const imgSize = (params as any).imageSize || (params as any).image_size || params.extraParams?.image_size || params.extraParams?.imageSize;
    if (imgSize && typeof imgSize === 'string' && imgSize.trim() !== '') {
      body.image_size = imgSize.trim();
    }
    if (params.image_url) {
      body.image_url = params.image_url;
    }

    const resp = await fetch('/api/gemini/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(effectiveKey ? { 'x-gemini-key': effectiveKey } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Google Gemini 生成失败' }));
      throw new Error(err.details || err.error || `Google Gemini 错误 (${resp.status})`);
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
      seed: null, // Gemini generateContent has no seed
      rawResponse: data,
    };
  }

  protected async executeChat(
    params: NormalizedChatParams,
    keys: Record<string, string>
  ): Promise<NormalizedChatResult> {
    if (!params.model) throw new Error('模型为必填项（model is required）');
    const effectiveKey = params.apiKey || keys.geminiKey || '';

    const resp = await fetch('/api/gemini/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(effectiveKey ? { 'x-gemini-key': effectiveKey } : {}),
      },
      body: JSON.stringify({
        messages: params.messages,
        model: params.model,
        temperature: params.temperature,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Gemini 聊天推理失败' }));
      throw new Error(err.details || err.error || `Gemini 错误 (${resp.status})`);
    }

    const data = await resp.json();
    return {
      content: data.content || '',
      provider: this.name,
      providerId: this.id,
      model: data.model || params.model,
    };
  }
}
