import {tracedFetch as fetch} from '../../services/executionTrace';
import { BaseEngineDriver } from '../BaseEngineDriver';
import {
  NormalizedGenerateParams,
  NormalizedGenerateResult,
  ModelSpec,
} from '../types';

/**
 * AI 视频生成专用引擎驱动 (VideoDriver)
 * 职责：
 * 1. 托管电影级动态视频生成 (Wan 2.1, LTX-Video, Kling 1.5, MiniMax, CogVideoX)
 * 2. 严谨区分并自动化解算 文生视频 (text2video) 与 图生视频 (img2video)
 * 3. 严格遵循官方端点规约，杜绝黑盒猜测
 */
export class VideoDriver extends BaseEngineDriver {
  readonly id = 'video';
  readonly name = 'AI 视频生成路由';
  readonly label = 'AI 视频多供应商路由';
  readonly badgeColor = '#a3e635';
  readonly description = '视频执行必须显式选择 provider 与 model；当前预置只保留已重新核实的 Fal 与 Agnes 视频端点，以及用户显式配置的 Grok 兼容中转。';
  readonly capabilities = ['text2video', 'img2video'] as const;

  readonly supportedModels: ModelSpec[] = [
    {
      id: 'fal-ai/wan-t2v',
      name: 'Fal · Wan 2.1 Text-to-Video (legacy)',
      type: 'video',
      description: 'Fal 官方仍提供的 Wan 2.1 文生视频端点；仅按其独立 Schema 发送参数。',
      supportsLora: false,
    },
    {
      id: 'fal-ai/wan/v2.7/text-to-video',
      name: 'Fal · Wan 2.7 Text-to-Video',
      type: 'video',
      description: 'Fal 官方当前 Wan 2.7 文生视频端点。',
      supportsLora: false,
    },
    {
      id: 'fal-ai/wan/v2.7/image-to-video',
      name: 'Fal · Wan 2.7 Image-to-Video',
      type: 'video',
      description: 'Fal 官方当前 Wan 2.7 图生视频端点。',
      supportsLora: false,
    },
    {
      id: 'fal-ai/kling-video/v3/standard/text-to-video',
      name: 'Fal · Kling V3 Standard Text-to-Video',
      type: 'video',
      description: 'Fal 官方 Kling V3 Standard 文生视频端点。',
      supportsLora: false,
    },
    {
      id: 'fal-ai/kling-video/v3/standard/image-to-video',
      name: 'Fal · Kling V3 Standard Image-to-Video',
      type: 'video',
      description: 'Fal 官方 Kling V3 Standard 图生视频端点。',
      supportsLora: false,
    },
    {
      id: 'fal-ai/minimax/video-01',
      name: 'Fal · MiniMax Video-01 Text-to-Video',
      type: 'video',
      description: 'Fal 官方 MiniMax Video-01 文生视频端点。',
      supportsLora: false,
    },
    {
      id: 'fal-ai/minimax/video-01/image-to-video',
      name: 'Fal · MiniMax Video-01 Image-to-Video',
      type: 'video',
      description: 'Fal 官方 MiniMax Video-01 图生视频端点。',
      supportsLora: false,
    },
    {
      id: 'fal-ai/ltx-video',
      name: 'Fal · LTX Video (research-only endpoint)',
      type: 'video',
      description: 'Fal 当前仍提供的 LTX Video 端点；官方页面标记 Research only。',
      supportsLora: false,
    },
    {
      id: 'agnes-video-2.5',
      name: 'Agnes Video 2.5',
      type: 'video',
      description: 'Agnes 官方当前视频模型；POST /v1/videos，支持 720P–2K。',
      supportsLora: false,
    },
    {
      id: 'agnes-video-2.5-flash',
      name: 'Agnes Video 2.5 Flash',
      type: 'video',
      description: 'Agnes 官方当前快速视频模型；POST /v1/videos，Flash 仅 720P。',
      supportsLora: false,
    },
    {
      id: 'grok-imagine-video',
      name: 'Grok 兼容中转 · Imagine Video',
      type: 'video',
      description: '仅在用户明确配置兼容 Base URL 时使用；兼容中转不等于官方 xAI 路由。',
      supportsLora: false,
    },
    {
      id: 'grok-imagine-video-1.5',
      name: 'Grok 兼容中转 · Imagine Video 1.5',
      type: 'video',
      description: '仅在用户明确配置兼容 Base URL 时使用；模型 ID 是否可用由该中转实际 /models 或响应决定。',
      supportsLora: false,
    },
  ];

  protected async executeGenerate(
    params: NormalizedGenerateParams,
    keys: Record<string, string>
  ): Promise<NormalizedGenerateResult> {
    const effectiveKey = params.apiKey || keys.falKey || '';
    const hasImage = Boolean(params.image_url);

    // 严谨端点判定与图生视频规范分流
    let targetModel = params.model;
    let wasAdapted = false;
    let adaptationNotice = '';

    if (hasImage) {
      if (
        targetModel === 'fal-ai/wan-t2v' ||
        targetModel === 'fal-ai/wan/v2.1/text-to-video' || // legacy alias
        targetModel === 'fal-ai/wan/t2v' ||
        targetModel === 'wan2.1-t2v' ||
        targetModel === 'damo/wan2.1-t2v' ||
        targetModel === 'fal-ai/kling-video/v1/standard/text-to-video' ||
        targetModel.includes('text-to-video')
      ) {
        throw new Error('这个端点不支持参考图');
      }
    }

    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (keys.falKey || effectiveKey) reqHeaders['x-fal-key'] = keys.falKey || effectiveKey;
    if (keys.agnesKey || keys.agnes) reqHeaders['x-agnes-key'] = keys.agnesKey || keys.agnes;
    if (keys.tensorartKey || keys.tensorart) reqHeaders['x-tensorart-key'] = keys.tensorartKey || keys.tensorart;
    if (keys.nanogptKey || keys.nanogpt) reqHeaders['x-nanogpt-key'] = keys.nanogptKey || keys.nanogpt;
    if (keys.grokCompatKey) reqHeaders['x-grok-compat-key'] = keys.grokCompatKey;
    if (keys.grokCompatBaseUrl) reqHeaders['x-grok-compat-base-url'] = keys.grokCompatBaseUrl;

    const videoProvider = params.targetProvider || params.provider;
    // F4: never send empty provider (server must not default to Fal)
    if (!videoProvider || !String(videoProvider).trim()) {
      throw new Error(
        '视频服务商 (Provider) 未设置，拒绝回退到 Fal。请先选择服务商或从带服务商标注的模型列表中选择模型。'
      );
    }

    // Match ModelScope image drivers: site-specific token + site header; never swap CN↔AI tokens.
    const msProvider = String(videoProvider).toLowerCase().trim();
    if (msProvider === 'modelscope_ai' || msProvider === 'modelscope-ai') {
      const aiToken = keys.modelscopeAiToken || keys.modelscope_ai || '';
      if (!aiToken) {
        throw new Error(
          '魔搭国际站视频需要 x-modelscope-ai-token（MODELSCOPE_AI_TOKEN / modelscopeAiToken）；当前未配置，不会改用国内站 Token 或切换站点。'
        );
      }
      reqHeaders['x-modelscope-ai-token'] = aiToken;
      reqHeaders['x-modelscope-site'] = 'ai';
    } else if (msProvider === 'modelscope' || msProvider === 'modelscope_cn' || msProvider === 'modelscope-cn') {
      const cnToken = keys.modelscopeToken || keys.modelscope || '';
      if (!cnToken) {
        throw new Error(
          '魔搭国内站视频需要 x-modelscope-token（MODELSCOPE_TOKEN / modelscopeToken）；当前未配置，不会改用国际站 Token 或切换站点。'
        );
      }
      reqHeaders['x-modelscope-token'] = cnToken;
      reqHeaders['x-modelscope-site'] = 'cn';
    }
    const extra = params.extraParams || {};
    const videoBody: Record<string, unknown> = {
      prompt: params.prompt,
      model: targetModel,
      provider: videoProvider,
      duration: params.videoDuration,
      aspect_ratio: params.aspectRatio,
      ...(params.image_url ? { image_url: params.image_url } : {}),
      custom_parameters: extra.custom_parameters,
    };
    if (extra.resolution !== undefined) videoBody.resolution = extra.resolution;
    if (extra.size !== undefined || params.imageSize !== undefined) videoBody.size = extra.size ?? params.imageSize;
    for (const [key, value] of Object.entries({fps: params.videoFps ?? extra.fps, num_frames: params.videoFrames, negative_prompt: params.negative_prompt, steps: params.steps, cfg: params.cfg, loras: params.loras?.length ? params.loras : undefined})) {
      if (value !== undefined && value !== '') videoBody[key] = value;
    }
    // Grok 兼容中转不支持 seed；其它视频商仍透传调用方 seed
    if (videoProvider !== 'grok_compat' && params.seed != null) videoBody.seed = params.seed;

    const resp = await fetch('/api/video/generate', {
      method: 'POST',
      headers: reqHeaders,
      body: JSON.stringify({ ...videoBody, workflowSnapshot: params.workflowSnapshot }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'AI 视频生成服务商响应失败' }));
      throw new Error(`HTTP ${resp.status}: ${err.details || err.error || '视频生成失败'}`);
    }

    const data = await resp.json();
    return {
      mediaUrl: data.videoUrl,
      mediaType: 'video',
      provider: data.provider || this.name,
      providerId: this.id,
      model: data.model || targetModel,
      actualModel: data.actualModel || data.model || targetModel,
      actualProvider: data.actualProvider || data.provider || this.name,
      requestedModel: params.model,
      seed: data.seed ?? data.historyItem?.seed ?? null,
      wasAdapted: data.wasAdapted ?? wasAdapted,
      adaptationNotice: data.adaptationNotice ?? adaptationNotice,
      timings: data.timings,
      rawResponse: data,
    };
  }
}