import { BaseEngineDriver } from '../BaseEngineDriver';
import {
  NormalizedGenerateParams,
  NormalizedGenerateResult,
  NormalizedChatParams,
  NormalizedChatResult,
  ModelSpec,
} from '../types';

/**
 * SenseNova (商汤日日新) 引擎驱动
 * 顶级深度推理思考大模型平台:
 * - DeepSeek V4 Flash (带百万上下文与思维链 reasoning_content)
 * - DeepSeek V4 Pro (满血旗舰架构推演)
 * - GLM-5.2 (清华智谱旗舰通用大模型)
 * - SenseNova 6.8 Flash Lite (商汤自研旗舰多模态)
 * - Kimi K3 (长文本推理)
 */
export class SenseNovaDriver extends BaseEngineDriver {
  readonly id = 'sensenova';
  readonly name = 'SenseNova (商汤日日新)';
  readonly label = '商汤日日新官方平台';
  readonly badgeColor = '#6366f1';
  readonly description = '商汤科技 SenseTime 旗舰大模型平台，集成 DeepSeek V4 深度思考推理、GLM-5.2、SenseNova 6.8 及多模态视觉理解。';
  readonly capabilities = ['reasoning'] as const;
  readonly defaultBaseUrl = 'https://token.sensenova.cn/v1';
  readonly defaultKey = '';

  readonly supportedModels: ModelSpec[] = [];

  protected async executeGenerate(
    params: NormalizedGenerateParams,
    _keys: Record<string, string>
  ): Promise<NormalizedGenerateResult> {
    // 严格意图遵从：绝不未经允许暗中切换至第三方服务商
    throw new Error(
      `商汤日日新 (SenseNova) 是专长于深度思考与推理的文本大模型平台 (${params.model || 'DeepSeek V4'})。若需将概念扩散为图像或视频，请使用画布上的「LLM 推理思考节点」或提示词面板中的「深度思考扩写」，再通过连线将正向条件注入至 FLUX.1、Agnes 2.5 或 Wan 2.1 扩散引擎。`
    );
  }

  protected async executeChat(
    params: NormalizedChatParams,
    keys: Record<string, string> = {}
  ): Promise<NormalizedChatResult> {
    const effectiveKey = params.apiKey || keys?.sensenovaKey || this.defaultKey;
    const effectiveBaseUrl = params.baseUrl || keys?.sensenovaBaseUrl || this.defaultBaseUrl;

    if (!effectiveKey) {
      throw new Error('未配置商汤日日新 API 密钥 (x-sensenova-key)。请在右上角设置面板中配置。');
    }

    const resp = await fetch('/api/engine/sensenova/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sensenova-key': effectiveKey,
        'x-sensenova-base-url': effectiveBaseUrl,
      },
      body: JSON.stringify(params),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'SenseNova 文本推理失败' }));
      throw new Error(err.details || err.error || `SenseNova 错误 (${resp.status})`);
    }

    const data = await resp.json();
    return {
      content: data.content || data.choices?.[0]?.message?.content || '',
      reasoningContent: data.reasoningContent || data.choices?.[0]?.message?.reasoning_content || '',
      provider: this.name,
      providerId: this.id,
      model: data.model || params.model || 'deepseek-v4-flash',
      usage: data.usage,
    };
  }
}
