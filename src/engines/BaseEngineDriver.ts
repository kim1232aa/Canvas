import {
  IEngineDriver,
  ProviderId,
  EngineCapability,
  ModelSpec,
  NormalizedGenerateParams,
  NormalizedGenerateResult,
  NormalizedChatParams,
  NormalizedChatResult,
} from './types';

/**
 * 统一引擎基础壳类 (BaseEngineDriver)
 * 遵循开闭原则 (Open-Closed Principle)，实现模块化、归一化与异构参数安全包络。
 * 新增任何模型服务商只需继承此类，实现 executeGenerate 与可选的 executeChat，杜绝全局代码污染与回归 Bug。
 */
export abstract class BaseEngineDriver implements IEngineDriver {
  abstract readonly id: ProviderId;
  abstract readonly name: string;
  abstract readonly label: string;
  abstract readonly badgeColor: string;
  abstract readonly description: string;
  abstract readonly capabilities: readonly EngineCapability[];
  abstract readonly supportedModels: ModelSpec[];
  readonly defaultBaseUrl?: string;
  readonly defaultKey?: string;

  /**
   * 生成参数异构归一化 (Normalization Filter)
   */
  protected normalizeGenerateParams(params: NormalizedGenerateParams): NormalizedGenerateParams {
    if (!params.model?.trim()) throw new Error('模型为必填项（model is required）');
    const isVideo = params.isVideo ?? (this.id === 'video' || params.videoDuration != null);

    return {
      prompt: (params.prompt || '').trim(),
      negative_prompt: params.negative_prompt?.trim() || undefined,
      model: params.model,
      // V2: pass through only caller-provided values; server decides what's required per provider
      width: params.width !== undefined ? Number(params.width) : undefined,
      height: params.height !== undefined ? Number(params.height) : undefined,
      steps: params.steps !== undefined ? Number(params.steps) : undefined,
      cfg: params.cfg !== undefined ? Number(params.cfg) : undefined,
      seed: typeof params.seed === 'number' ? params.seed : undefined,
      batchSize: typeof params.batchSize === 'number' ? params.batchSize : undefined,
      denoise: typeof params.denoise === 'number' ? params.denoise : undefined,
      image_url: params.image_url?.trim() || undefined,
      isVideo,
      videoDuration: isVideo && params.videoDuration !== undefined ? Number(params.videoDuration) : undefined,
      videoFps: isVideo && params.videoFps !== undefined ? Number(params.videoFps) : undefined,
      videoFrames: isVideo && params.videoFrames !== undefined ? Number(params.videoFrames) : undefined,
      aspectRatio: params.aspectRatio || undefined,
      imageSize: params.imageSize || undefined,
      sampler_name: params.sampler_name,
      scheduler: params.scheduler,
      provider: params.provider || params.targetProvider || undefined,
      targetProvider: params.targetProvider || params.provider || undefined,
      loras: (params.loras || []).map((l) => ({
        name: l.name,
        path: l.path || l.url,
        url: l.url,
        strength: l.strength != null || l.modelStrength != null ? Number(l.strength ?? l.modelStrength) : undefined,
        modelStrength: l.modelStrength != null || l.strength != null ? Number(l.modelStrength ?? l.strength) : undefined,
        clipStrength: l.clipStrength != null ? Number(l.clipStrength) : undefined,
        civitaiId: l.civitaiId,
        triggers: l.triggers,
      })),
      apiKey: params.apiKey,
      baseUrl: params.baseUrl,
      extraParams: params.extraParams,
      workflowSnapshot: params.workflowSnapshot,
    };
  }

  /**
   * 对话/推理参数归一化
   */
  protected normalizeChatParams(params: NormalizedChatParams): NormalizedChatParams {
    return {
      messages: params.messages.map((m) => ({
        role: m.role,
        content: m.content.trim(),
      })),
      model: params.model,
      temperature: typeof params.temperature === 'number' ? params.temperature : undefined,
      maxTokens: typeof params.maxTokens === 'number' ? params.maxTokens : undefined,
      apiKey: params.apiKey,
      baseUrl: params.baseUrl,
    };
  }

  /**
   * 模板方法：统一调度入口 (Shell Entrypoint for Generation)
   */
  async generate(
    rawParams: NormalizedGenerateParams,
    keys: Record<string, string>
  ): Promise<NormalizedGenerateResult> {
    if (!rawParams.model?.trim()) throw new Error('模型为必填项（model is required）');
    const hasImage = Boolean(rawParams.image_url);
    const isVideo = rawParams.isVideo ?? (this.id === 'video' || rawParams.videoDuration != null);

    const requiredCap: EngineCapability = isVideo
      ? hasImage ? 'img2video' : 'text2video'
      : hasImage ? 'img2img' : 'text2img';

    const normalized = this.normalizeGenerateParams(rawParams);
    return this.executeGenerate(normalized, keys);
  }

  /**
   * 模板方法：统一推理大模型调度入口 (Shell Entrypoint for Reasoning/Chat)
   */
  async chat(
    rawParams: NormalizedChatParams,
    keys: Record<string, string>
  ): Promise<NormalizedChatResult> {
    const normalized = this.normalizeChatParams(rawParams);

    if (!this.executeChat) {
      throw new Error(`引擎 [${this.name}] 声明支持 reasoning 但未实现 executeChat 方法。`);
    }

    return this.executeChat(normalized, keys);
  }

  /**
   * 子类必须实现的生图/生视频具体执行逻辑
   */
  protected abstract executeGenerate(
    params: NormalizedGenerateParams,
    keys: Record<string, string>
  ): Promise<NormalizedGenerateResult>;

  /**
   * 子类可选实现的文本推理执行逻辑 (用于文本大模型与提示词深度思考)
   */
  protected executeChat?(
    params: NormalizedChatParams,
    keys: Record<string, string>
  ): Promise<NormalizedChatResult>;
}

/** 2026-11-04 (雁): every user-filled canvas param goes out as-is. Adds the listed canvas fields the driver did not already map. */
export function withFilledCanvasParams(body: Record<string, unknown>, params: NormalizedGenerateParams, keys: Array<keyof NormalizedGenerateParams>): Record<string, unknown> {
  for (const k of keys) {
    const v = params[k];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    if (body[k as string] === undefined) body[k as string] = v;
  }
  return body;
}
