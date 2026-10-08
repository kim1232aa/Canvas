import {tracedFetch as fetch} from '../../services/executionTrace';
import { BaseEngineDriver } from '../BaseEngineDriver';
import {
  NormalizedGenerateParams,
  NormalizedGenerateResult,
  NormalizedChatParams,
  NormalizedChatResult,
  ModelSpec,
} from '../types';

/** Official SenseNova chat contract. Model availability is not inferred from other vendors. */
export class SenseNovaDriver extends BaseEngineDriver {
  readonly id = 'sensenova';
  readonly name = 'SenseNova (商汤日日新)';
  readonly label = '商汤日日新官方平台';
  readonly badgeColor = '#6366f1';
  readonly description = '当前 Canvas 只接入 SenseNova chat/reasoning。SenseNova 官方平台已提供独立图像生成/编辑模型，但本项目尚未核实并接入其图像 OpenAPI Schema，因此生图路由必须明确报未接入，不能伪装成“平台不支持生图”。';
  readonly capabilities = ['reasoning'] as const;
  readonly defaultBaseUrl = 'https://token.sensenova.cn/v1';
  readonly defaultKey = '';

  readonly supportedModels: ModelSpec[] = [];

  protected async executeGenerate(
    params: NormalizedGenerateParams,
    _keys: Record<string, string>
  ): Promise<NormalizedGenerateResult> {
    throw new Error(
      `SenseNova 官方平台存在独立图像生成/编辑模型，但当前 Canvas 尚未核实并接入其图像 OpenAPI Schema（当前模型: ${params.model || '未指定'}）。此处不会自动改用 FLUX、Agnes、Gemini 或其他供应商；请在完成官方图像端点与字段接线后再从 SenseNova 生图分支执行。`
    );
  }

  protected async executeChat(
    params: NormalizedChatParams,
    keys: Record<string, string> = {}
  ): Promise<NormalizedChatResult> {
    if (!params.model) throw new Error('模型为必填项（model is required）');
    // No key here → server resolves from its pool (SENSENOVA_KEY / settings)
    const effectiveKey = params.apiKey || keys?.sensenovaKey || '';
    const effectiveBaseUrl = params.baseUrl || keys?.sensenovaBaseUrl || this.defaultBaseUrl;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (effectiveKey) headers['x-sensenova-key'] = effectiveKey;
    if (params.baseUrl || (keys?.sensenovaBaseUrl && keys.sensenovaBaseUrl !== this.defaultBaseUrl)) {
      headers['x-sensenova-base-url'] = effectiveBaseUrl;
    }

    const resp = await fetch('/api/engine/sensenova/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'SenseNova 文本推理失败' }));
      throw new Error(err.details || err.error || `SenseNova 错误 (${resp.status})`);
    }

    const data = await resp.json();
    return {
      content: data.content || '',
      reasoningContent: data.reasoningContent || '',
      provider: this.name,
      providerId: this.id,
      model: data.model || params.model,
      usage: data.usage,
    };
  }
}