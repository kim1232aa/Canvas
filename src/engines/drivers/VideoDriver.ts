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
  readonly name = 'AI 电影级视频引擎 (Wan 2.1 / LTX / Kling)';
  readonly label = 'AI 视频官方聚合引擎';
  readonly badgeColor = '#a3e635';
  readonly description = '阿里通义万相 Wan 2.1、快手可灵 Kling 1.5、Lightricks LTX-Video 与海螺 MiniMax 电影级视频大模型平台。';
  readonly capabilities = ['text2video', 'img2video'] as const;

  readonly supportedModels: ModelSpec[] = [
    {
      id: 'fal-ai/wan/v2.1/text-to-video',
      name: 'Wan 2.1 Text-to-Video (通义万相电影级文生视频)',
      type: 'video',
      description: '阿里通义万相开源电影级视频大模型，支持 1080p 超高清影视运镜与物理动力学模拟',
      defaultSteps: 30,
      defaultCfg: 5.0,
      supportsLora: false,
    },
    {
      id: 'fal-ai/wan/v2.1/image-to-video',
      name: 'Wan 2.1 Image-to-Video (通义万相图生动态视频)',
      type: 'video',
      description: '根据输入参考底图进行高保真运镜生成，完美保留首帧构图与人脸细节',
      defaultSteps: 30,
      defaultCfg: 5.0,
      supportsLora: false,
    },
    {
      id: 'fal-ai/ltx-video',
      name: 'LTX-Video (Lightricks 极速AI视频生成)',
      type: 'video',
      description: '次世代极速视频扩散模型，高帧率流畅运动',
      defaultSteps: 25,
      defaultCfg: 4.0,
      supportsLora: false,
    },
    {
      id: 'fal-ai/kling-video/v1/standard/text-to-video',
      name: 'Kling 1.5 Video (快手可灵标准文生视频)',
      type: 'video',
      description: '快手可灵 1.5 电影级大动作幅度生成',
      defaultSteps: 30,
      defaultCfg: 5.0,
      supportsLora: false,
    },
    {
      id: 'fal-ai/kling-video/v1/standard/image-to-video',
      name: 'Kling 1.5 Video (快手可灵标准图生视频)',
      type: 'video',
      description: '快手可灵 1.5 基于单张图片生成 5 秒连贯动作运镜',
      defaultSteps: 30,
      defaultCfg: 5.0,
      supportsLora: false,
    },
    {
      id: 'fal-ai/minimax/video-01',
      name: 'MiniMax Hailuo Video-01 (海螺影视运镜)',
      type: 'video',
      description: '电影级镜头语言与光影变换',
      defaultSteps: 25,
      defaultCfg: 4.5,
      supportsLora: false,
    },
    {
      id: 'fal-ai/cogvideox-5b',
      name: 'CogVideoX 5B (智谱清言开源视频大模型)',
      type: 'video',
      description: '清华智谱开源高精度视频生成模型',
      defaultSteps: 28,
      defaultCfg: 6.0,
      supportsLora: false,
    },
    {
      id: 'fal-ai/hunyuan-video',
      name: 'HunyuanVideo (腾讯混元开源视频大模型)',
      type: 'video',
      description: '腾讯混元自研视频扩散大模型，高质感物理碰撞与复杂动态',
      defaultSteps: 30,
      defaultCfg: 5.0,
      supportsLora: false,
    },
    {
      id: 'damo/wan2.1-t2v',
      name: 'Wan 2.1 Video (ModelScope 魔搭阿里官方直连)',
      type: 'video',
      description: '通过 ModelScope 官方通道直连调用的通义万相 2.1 文生视频',
      defaultSteps: 30,
      defaultCfg: 6.0,
      supportsLora: false,
    },
    {
      id: 'damo/wan2.1-i2v-480p-14b',
      name: 'Wan 2.1 Image-to-Video (ModelScope 魔搭官方图生视频)',
      type: 'video',
      description: '通过 ModelScope 官方通道直连调用的通义万相 2.1 图生视频',
      defaultSteps: 30,
      defaultCfg: 6.0,
      supportsLora: false,
    },
    {
      id: 'THUDM/CogVideoX-5b',
      name: 'CogVideoX 5B (ModelScope 魔搭清言开源)',
      type: 'video',
      description: '清华智谱 CogVideoX 5B 开源高清视频模型',
      defaultSteps: 28,
      defaultCfg: 6.0,
      supportsLora: false,
    },
    {
      id: 'text2video_wan27',
      name: 'Wan 2.7 旗舰文生视频 (Tensor.Art OpenWorks)',
      type: 'video',
      description: 'Tensor.Art OpenWorks 原生 Wan 2.7 电影级文生视频官方算力',
      defaultSteps: 30,
      defaultCfg: 5.0,
      supportsLora: false,
    },
    {
      id: 'image2video_wan27',
      name: 'Wan 2.7 旗舰图生视频 (Tensor.Art OpenWorks)',
      type: 'video',
      description: 'Tensor.Art OpenWorks 原生 Wan 2.7 官方图生视频',
      defaultSteps: 30,
      defaultCfg: 5.0,
      supportsLora: false,
    },
    {
      id: 'image2video_wan25',
      name: 'Wan 2.5 官方图生视频 (Tensor.Art OpenWorks)',
      type: 'video',
      description: 'Tensor.Art OpenWorks 原生 Wan 2.5 官方图生视频',
      defaultSteps: 30,
      defaultCfg: 5.0,
      supportsLora: false,
    },
    {
      id: 'text2video_wan22',
      name: 'Wan 2.2 官方文生视频 (Tensor.Art OpenWorks)',
      type: 'video',
      description: 'Tensor.Art OpenWorks 原生 Wan 2.2 官方文生视频',
      defaultSteps: 30,
      defaultCfg: 5.0,
      supportsLora: false,
    },
    {
      id: 'image2video_wan22',
      name: 'Wan 2.2 官方图生视频 (Tensor.Art OpenWorks)',
      type: 'video',
      description: 'Tensor.Art OpenWorks 原生 Wan 2.2 官方图生视频',
      defaultSteps: 30,
      defaultCfg: 5.0,
      supportsLora: false,
    },
    {
      id: 'text2video_ltx23',
      name: 'LTX 2.3 官方文生视频 (Tensor.Art OpenWorks)',
      type: 'video',
      description: 'Tensor.Art OpenWorks 原生 LTX 2.3 官方文生视频',
      defaultSteps: 25,
      defaultCfg: 4.0,
      supportsLora: false,
    },
    {
      id: 'image2video_ltx23',
      name: 'LTX 2.3 官方图生视频 (Tensor.Art OpenWorks)',
      type: 'video',
      description: 'Tensor.Art OpenWorks 原生 LTX 2.3 官方图生视频',
      defaultSteps: 25,
      defaultCfg: 4.0,
      supportsLora: false,
    },
    {
      id: 'live_wallpaper',
      name: '动态壁纸生成 (Tensor.Art OpenWorks)',
      type: 'video',
      description: 'Tensor.Art OpenWorks 动态循环壁纸生成工具',
      defaultSteps: 25,
      defaultCfg: 4.0,
      supportsLora: false,
    },
    {
      id: 'agnes-video-2.5-flash',
      name: 'Agnes AI Video 2.5 Flash (ApiHub 极速视频)',
      type: 'video',
      description: 'Agnes AI ApiHub 极速动态视频生成端点',
      defaultSteps: 25,
      defaultCfg: 4.5,
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
        targetModel === 'fal-ai/wan/v2.1/text-to-video' ||
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
    if (keys.modelscopeToken || keys.modelscope) reqHeaders['x-modelscope-token'] = keys.modelscopeToken || keys.modelscope;
    if (keys.tensorartKey || keys.tensorart) reqHeaders['x-tensorart-key'] = keys.tensorartKey || keys.tensorart;
    if (keys.nanogptKey || keys.nanogpt) reqHeaders['x-nanogpt-key'] = keys.nanogptKey || keys.nanogpt;

    const resp = await fetch('/api/video/generate', {
      method: 'POST',
      headers: reqHeaders,
      body: JSON.stringify({
        prompt: params.prompt,
        model: targetModel,
        provider: params.targetProvider || params.provider,
        duration: params.videoDuration,
        aspect_ratio: params.aspectRatio,
        image_url: params.image_url,
        seed: params.seed,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'AI 视频生成服务商响应失败' }));
      throw new Error(err.details || err.error || `视频生成失败 (${resp.status})`);
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
