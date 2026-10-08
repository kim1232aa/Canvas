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
  readonly description = 'SenseNova 6.8 文本推理与 U1.5 Lite 官方图像生成/编辑，分别使用 chat 与 images 路由；图像端点不接受 ComfyUI 扩散参数。';
  readonly capabilities = ['reasoning', 'text2img', 'img2img'] as const;
  readonly defaultBaseUrl = 'https://token.sensenova.cn/v1';
  readonly defaultKey = '';

  readonly supportedModels: ModelSpec[] = [{id:'sensenova-u1.5-lite',name:'SenseNova U1.5 Lite (文生图/图像编辑)',type:'image',supportsLora:false,description:'官方 images/generations 与 images/edits JSON 协议'}];

  protected async executeGenerate(
    params: NormalizedGenerateParams,
    keys: Record<string, string>
  ): Promise<NormalizedGenerateResult> {
    const effectiveKey = params.apiKey || keys.sensenovaKey || '';
    const headers: Record<string, string> = {'Content-Type':'application/json'};
    if (effectiveKey) headers['x-sensenova-key'] = effectiveKey;
    if (params.baseUrl) headers['x-sensenova-base-url'] = params.baseUrl;

    const unsupported: Array<[string, unknown]> = [
      ['negative_prompt',params.negative_prompt],['seed',params.seed],['steps',params.steps],['cfg',params.cfg],
      ['sampler_name',params.sampler_name],['scheduler',params.scheduler],['denoise',params.denoise],
      ['loras',params.loras?.length ? params.loras : undefined],
    ];
    const parameterOmissions=unsupported.filter(([,value])=>value !== undefined && value !== null && value !== '').map(([field,value])=>({field,value,reason:'SenseNova U1.5 Lite 图像接口没有该扩散字段；未发送上游'}));
    const extra=params.extraParams || {};
    const body={
      model:params.model,prompt:params.prompt,image_url:params.image_url,
      width:params.width,height:params.height,
      ...(extra.size ? {size:extra.size} : {}),
      ...(extra.watermark !== undefined ? {watermark:extra.watermark} : {}),
      ...(extra.prompt_extend !== undefined ? {prompt_extend:extra.prompt_extend} : {}),
      ...(extra.output_format !== undefined ? {output_format:extra.output_format} : {}),
      response_format:'b64_json',
      workflowSnapshot:params.workflowSnapshot,
      parameterOmissions,
    };
    const resp=await fetch('/api/engine/sensenova/generate',{method:'POST',headers,body:JSON.stringify(body)});
    if (!resp.ok) {
      const raw=await resp.text();
      throw new Error(`SenseNova 图像路由 HTTP ${resp.status}: ${raw}`);
    }
    const data=await resp.json();
    if (!data.mediaUrl && !data.imageUrl) throw new Error('SenseNova 图像接口成功响应缺少图像，不记成功');
    return {
      mediaUrl:data.mediaUrl || data.imageUrl,mediaType:'image',provider:this.name,providerId:this.id,
      model:data.model || params.model,requestedModel:params.model,seed:null,
      rawResponse:data,actualRequest:data.actualRequest,
    };
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