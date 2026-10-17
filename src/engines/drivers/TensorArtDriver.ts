import { BaseEngineDriver } from '../BaseEngineDriver';
import { NormalizedGenerateParams, NormalizedGenerateResult, ModelSpec } from '../types';

export class TensorArtDriver extends BaseEngineDriver {
  readonly id = 'tensorart';
  readonly name = 'Tensor.Art (模型 API)';
  readonly label = 'Tensor.Art 模型与 LoRA';
  readonly badgeColor = '#8b5cf6';
  readonly description = 'Tensor.Art TAMS 出图接口已下线；OpenWorks 是独立服务商。';
  readonly capabilities = ['text2img', 'img2img', 'text2video', 'img2video'] as const;
  readonly defaultKey = '';

  readonly supportedModels: ModelSpec[] = [];

  protected async executeGenerate(
    params: NormalizedGenerateParams,
    _keys: Record<string, string>
  ): Promise<NormalizedGenerateResult> {
    if (!params.model?.trim()) throw new Error('模型为必填项（model is required）');

    // 2026-10-17 规则：清掉失效 TAMS 路由调用，失败原样报，严禁静默切换 provider / 换端点
    throw new Error(
      'Tensor.Art TAMS 出图入口已下线。请在底模选服务商「Tensor.Art OpenWorks」，走 /api/schema-provider/openworks/submit → 官方 POST https://openapi.tensor.art/openworks/v1/task（Echo-Access-Key / ak_tensor_…）。未出站，本地拦截。'
    );
  }
}
