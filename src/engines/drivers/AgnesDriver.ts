import { BaseEngineDriver } from '../BaseEngineDriver';
import {
  NormalizedGenerateParams,
  NormalizedGenerateResult,
  NormalizedChatParams,
  NormalizedChatResult,
  ModelSpec,
} from '../types';

/**
 * Agnes AI (ApiHub) 引擎驱动
 * 聚合中心提供:
 * 1. 2.5 Flash / 2.1 Flash / 2.0 Flash 极速文生图与图生图 (通过 /images/generations)
 * 2. 2.5 Flash / 2.5 / v2.0 动态视频 (支持图生视频)
 * 3. 3.0 Flash / 2.5 Pro / 2.5 Flash 深度推理文本大模型 (通过 /chat/completions)
 */
export class AgnesDriver extends BaseEngineDriver {
  readonly id = 'agnes';
  readonly name = 'Agnes AI (ApiHub)';
  readonly label = 'Agnes AI 官方聚合中心';
  readonly badgeColor = '#f43f5e';
  readonly description = 'Agnes AI 高并发模型聚合中心，支持 2.5 Flash 极速生图、动态运镜视频及 3.0 Flash 深度推理大模型。';
  readonly capabilities = ['text2img', 'img2img', 'text2video', 'img2video', 'reasoning'] as const;
  readonly defaultBaseUrl = 'https://apihub.agnes-ai.com/v1';
  readonly defaultKey = '';

  readonly supportedModels: ModelSpec[] = [
    {
      id: 'agnes-image-2.5-flash',
      name: 'Agnes Image 2.5 Flash (秒级闪电生图)',
      type: 'image',
      description: '次世代极速扩散模型，画质细腻，极速 1.5 秒出片，支持图生图',
      defaultSteps: 20,
      defaultCfg: 6.0,
      supportsLora: false,
    },
    {
      id: 'agnes-image-2.1-flash',
      name: 'Agnes Image 2.1 Flash (通用旗舰写实)',
      type: 'image',
      description: '通用稳定写实出图，平衡速度与毛孔细节',
      defaultSteps: 25,
      defaultCfg: 5.5,
      supportsLora: false,
    },
    {
      id: 'agnes-image-2.0-flash',
      name: 'Agnes Image 2.0 Flash (经典轻量)',
      type: 'image',
      description: '经典轻量级扩散生图',
      defaultSteps: 20,
      defaultCfg: 5.0,
      supportsLora: false,
    },
    {
      id: 'agnes-video-2.5-flash',
      name: 'Agnes Video 2.5 Flash (图生视频 / 动态运镜)',
      type: 'video',
      description: '支持纯文本或输入源图生成 5 秒高清流畅运镜视频',
      defaultSteps: 25,
      defaultCfg: 4.5,
      supportsLora: false,
    },
    {
      id: 'agnes-video-2.5',
      name: 'Agnes Video 2.5 (高精影视级视频)',
      type: 'video',
      description: '电影质感动态生成',
      defaultSteps: 30,
      defaultCfg: 5.0,
      supportsLora: false,
    },
    {
      id: 'agnes-3.0-flash',
      name: 'Agnes 3.0 Flash (深度推理文本大模型)',
      type: 'reasoning',
      description: '高智商推理文本模型，精通反推提示词、Prompt 深度扩写与工作流架构分析',
    },
    {
      id: 'agnes-2.5-pro-alpha',
      name: 'Agnes 2.5 Pro (逻辑分析与长上下文)',
      type: 'reasoning',
      description: '具备极强逻辑推理能力的专业大模型，擅长视觉与复杂节点链推演',
    },
    {
      id: 'agnes-2.5-flash',
      name: 'Agnes 2.5 Flash (通用轻快对话)',
      type: 'reasoning',
      description: '超低延迟文本模型，用于即时提示词微调',
    },
  ];

  protected async executeGenerate(
    params: NormalizedGenerateParams,
    keys: Record<string, string>
  ): Promise<NormalizedGenerateResult> {
    if (!params.model) throw new Error('模型为必填项（model is required）');
    // No key here → server resolves from its pool (AGNES_KEY / settings)
    const effectiveKey = params.apiKey || keys.agnesKey || '';
    const effectiveBaseUrl = params.baseUrl || keys.agnesBaseUrl || this.defaultBaseUrl;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (effectiveKey) headers['x-agnes-key'] = effectiveKey;
    if (params.baseUrl || (keys.agnesBaseUrl && keys.agnesBaseUrl !== this.defaultBaseUrl)) {
      headers['x-agnes-base-url'] = effectiveBaseUrl;
    }

    const isVideo=Boolean(params.isVideo || params.model.includes('video'));
    const requestBody=isVideo ? {workflowSnapshot:params.workflowSnapshot,provider:'agnes',model:params.model,prompt:params.prompt,duration:params.videoDuration,aspect_ratio:params.aspectRatio,image_url:params.image_url,seed:params.seed,steps:params.steps,cfg:params.cfg,loras:params.loras,size:params.extraParams?.size || params.imageSize} : params;
    const resp = await fetch(isVideo ? '/api/video/generate' : '/api/engine/agnes/generate', {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Agnes AI 执行失败' }));
      throw new Error(err.details || err.error || `Agnes AI 错误 (${resp.status})`);
    }

    const data = await resp.json();
    return {
      mediaUrl: data.mediaUrl || data.imageUrl || data.videoUrl,
      mediaType: data.mediaType || (params.model.includes('video') ? 'video' : 'image'),
      provider: this.name,
      providerId: this.id,
      model: data.model || params.model,
      requestedModel: params.model,
      seed: null, // Agnes API has no seed support
      wasAdapted: data.wasAdapted,
      adaptationNotice: data.adaptationNotice,
      timings: data.timings,
      rawResponse: data,
    };
  }

  protected async executeChat(
    params: NormalizedChatParams,
    keys: Record<string, string>
  ): Promise<NormalizedChatResult> {
    if (!params.model) throw new Error('模型为必填项（model is required）');
    // No key here → server resolves from its pool (AGNES_KEY / settings)
    const effectiveKey = params.apiKey || keys.agnesKey || '';
    const effectiveBaseUrl = params.baseUrl || keys.agnesBaseUrl || this.defaultBaseUrl;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (effectiveKey) headers['x-agnes-key'] = effectiveKey;
    if (params.baseUrl || (keys.agnesBaseUrl && keys.agnesBaseUrl !== this.defaultBaseUrl)) {
      headers['x-agnes-base-url'] = effectiveBaseUrl;
    }

    const resp = await fetch('/api/engine/agnes/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Agnes AI 文本推理失败' }));
      throw new Error(err.details || err.error || `Agnes AI 错误 (${resp.status})`);
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
