import {tracedFetch as fetch} from '../../services/executionTrace';
import { BaseEngineDriver } from '../BaseEngineDriver';
import {
  NormalizedGenerateParams,
  NormalizedGenerateResult,
  NormalizedChatParams,
  NormalizedChatResult,
  ModelSpec,
} from '../types';

/** Agnes AI (ApiHub) driver. Model/field claims are limited to the current AgnesAI-Labs catalog and per-model docs. */
export class AgnesDriver extends BaseEngineDriver {
  readonly id = 'agnes';
  readonly name = 'Agnes AI (ApiHub)';
  readonly label = 'Agnes AI';
  readonly badgeColor = '#f43f5e';
  readonly description = 'Agnes AI 图像、视频与文本路由；具体字段以所选模型当前官方契约为准。';
  readonly capabilities = ['text2img', 'img2img', 'text2video', 'img2video', 'reasoning'] as const;
  readonly defaultBaseUrl = 'https://apihub.agnes-ai.com/v1';
  readonly defaultKey = '';

  readonly supportedModels: ModelSpec[] = [
    {
      id: 'agnes-image-2.5-flash',
      name: 'Agnes Image 2.5 Flash',
      type: 'image',
      description: '当前 Agnes 图像生成/编辑模型；使用 size 1K–4K 与可选 ratio，参考图通过 extra_body.image。',
      supportsLora: false,
    },
    {
      id: 'agnes-image-2.1-flash',
      name: 'Agnes Image 2.1 Flash (legacy)',
      type: 'image',
      description: '官方当前模型目录标记为 legacy compatibility；运行字段需按旧模型契约或真实响应核实。',
      supportsLora: false,
    },
    {
      id: 'agnes-image-2.0-flash',
      name: 'Agnes Image 2.0 Flash (legacy)',
      type: 'image',
      description: '官方当前模型目录标记为 legacy compatibility；运行字段需按旧模型契约或真实响应核实。',
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
    const rawKey = params.apiKey || keys.agnesKey || '';
    const effectiveKey = (rawKey || '').split(/[\r\n,]/)[0].trim();
    const effectiveBaseUrl = params.baseUrl || keys.agnesBaseUrl || this.defaultBaseUrl;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (effectiveKey) headers['x-agnes-key'] = effectiveKey;
    if (params.baseUrl || (keys.agnesBaseUrl && keys.agnesBaseUrl !== this.defaultBaseUrl)) {
      headers['x-agnes-base-url'] = effectiveBaseUrl;
    }

    const isVideo=Boolean(params.isVideo || params.model.includes('video'));
    const omissionEntries = [
      ['width', params.width],
      ['height', params.height],
      ['negative_prompt', params.negative_prompt],
      ['seed', params.seed],
      ['steps', params.steps],
      ['cfg', params.cfg],
      ['sampler_name', params.sampler_name],
      ['scheduler', params.scheduler],
      ['denoise', params.denoise],
      ['resolution', params.extraParams?.resolution],
    ].filter(([, value]) => value !== undefined && value !== null && value !== '');
    const upstreamOmissions = Array.isArray(params.extraParams?.omissions) ? params.extraParams.omissions : [];
    const parameterOmissions = [
      ...upstreamOmissions,
      ...omissionEntries.map(([field, value]) => ({field,value,reason:'Agnes image endpoint schema does not accept this canvas field'})),
    ].filter((entry, index, entries) => entries.findIndex(candidate => candidate.field === entry.field) === index);
    const imageRequestBody = {
      workflowSnapshot: params.workflowSnapshot,
      model: params.model,
      prompt: params.prompt,
      image_url: params.image_url,
      aspect_ratio: params.aspectRatio,
      size: params.extraParams?.size || params.imageSize,
      ...(Array.isArray(params.loras) && params.loras.length > 0 ? { loras: params.loras } : {}),
      parameterOmissions,
      ...(params.extraParams?.custom_parameters && typeof params.extraParams.custom_parameters === 'object' ? { custom_parameters: params.extraParams.custom_parameters } : {}),
    };
    const videoResolution = params.extraParams?.resolution;
    const videoSizeField = params.extraParams?.size ?? params.imageSize;
    if (isVideo && videoResolution !== undefined && videoResolution !== '' && videoSizeField !== undefined && videoSizeField !== '' && String(videoResolution) !== String(videoSizeField)) {
      throw new Error(`Agnes Video 的分辨率档位官方字段是 size；节点 resolution="${videoResolution}" 与 size="${videoSizeField}" 不一致，请只保留一个`);
    }
    const videoSize = videoSizeField !== undefined && videoSizeField !== '' ? videoSizeField : (videoResolution !== undefined && videoResolution !== '' ? videoResolution : undefined);
    const videoSizeSources = {resolution:videoResolution,size:params.extraParams?.size,imageSize:params.imageSize};
    const requestBody=isVideo ? {workflowSnapshot:params.workflowSnapshot,provider:'agnes',model:params.model,prompt:params.prompt,duration:params.videoDuration,aspect_ratio:params.aspectRatio,image_url:params.image_url,seed:params.seed,steps:params.steps,cfg:params.cfg,...(Array.isArray(params.loras) && params.loras.length > 0 ? {loras:params.loras} : {}),size:videoSize,extraParams:videoSizeSources,custom_parameters:params.extraParams?.custom_parameters,fps:params.videoFps,num_frames:params.videoFrames,negative_prompt:params.negative_prompt} : imageRequestBody;
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
    const videoSeed = [data.actualRequest?.seed,data.historyItem?.seed,data.seed].find(value=>typeof value === 'number' && Number.isFinite(value));
    return {
      mediaUrl: data.mediaUrl || data.imageUrl || data.videoUrl,
      mediaType: data.mediaType || (isVideo ? 'video' : 'image'),
      provider: this.name,
      providerId: this.id,
      model: data.model || params.model,
      requestedModel: params.model,
      seed: isVideo ? videoSeed ?? null : null,
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
    const rawKey = params.apiKey || keys.agnesKey || '';
    const effectiveKey = (rawKey || '').split(/[\r\n,]/)[0].trim();
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