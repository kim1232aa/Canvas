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
   * 能力边界断言保护：防止调用引擎不支持的模式 (例如对纯推理大模型强行调用像素生成)
   */
  protected assertCapability(capability: EngineCapability): void {
    if (!this.capabilities.includes(capability)) {
      throw new Error(
        `引擎 [${this.name}] 不支持 [${capability}] 能力。当前支持的能力清单: [${this.capabilities.join(', ')}]。`
      );
    }
  }

  /**
   * 生成参数异构归一化 (Normalization Filter)
   */
  protected normalizeGenerateParams(params: NormalizedGenerateParams): NormalizedGenerateParams {
    const isVideo = Boolean(
      params.isVideo ||
      params.videoDuration ||
      params.model.includes('video') ||
      params.model.includes('wan2.1-t2v') ||
      params.model.includes('wan/v2.1')
    );

    return {
      prompt: (params.prompt || '').trim(),
      negative_prompt: params.negative_prompt?.trim() || undefined,
      model: params.model,
      // V2: pass through only caller-provided values; server decides what's required per provider
      width: params.width ? Number(params.width) : undefined,
      height: params.height ? Number(params.height) : undefined,
      steps: params.steps ? Number(params.steps) : undefined,
      cfg: params.cfg ? Number(params.cfg) : undefined,
      seed: typeof params.seed === 'number' ? params.seed : undefined,
      denoise: typeof params.denoise === 'number' ? Math.max(0.01, Math.min(1.0, params.denoise)) : undefined,
      image_url: params.image_url?.trim() || undefined,
      isVideo: params.isVideo || isVideo || undefined,
      videoDuration: isVideo && params.videoDuration ? Number(params.videoDuration) : undefined,
      videoFps: isVideo && params.videoFps ? Number(params.videoFps) : undefined,
      aspectRatio: params.aspectRatio || undefined,
      imageSize: params.imageSize || undefined,
      sampler_name: params.sampler_name,
      scheduler: params.scheduler,
      provider: params.provider || params.targetProvider || undefined,
      targetProvider: params.targetProvider || params.provider || undefined,
      loras: (params.loras || []).map((l) => ({
        name: l.name,
        path: l.path || l.url || l.name,
        url: l.url,
        strength: l.strength != null || l.modelStrength != null ? Number(l.strength ?? l.modelStrength) : undefined,
        modelStrength: l.modelStrength != null || l.strength != null ? Number(l.modelStrength ?? l.strength) : undefined,
        clipStrength: l.clipStrength != null || l.strength != null ? Number(l.clipStrength ?? l.strength) : undefined,
        civitaiId: l.civitaiId,
        triggers: l.triggers,
      })),
      apiKey: params.apiKey,
      baseUrl: params.baseUrl,
      extraParams: params.extraParams,
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
      temperature: typeof params.temperature === 'number' ? params.temperature : 0.7,
      maxTokens: typeof params.maxTokens === 'number' ? params.maxTokens : 2048,
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
    const hasImage = Boolean(rawParams.image_url);
    const isVideo = Boolean(
      rawParams.isVideo ||
      rawParams.videoDuration ||
      rawParams.model.includes('video') ||
      rawParams.model.includes('wan2.1-t2v')
    );

    const requiredCap: EngineCapability = isVideo
      ? hasImage ? 'img2video' : 'text2video'
      : hasImage ? 'img2img' : 'text2img';

    this.assertCapability(requiredCap);
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
    this.assertCapability('reasoning');
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
