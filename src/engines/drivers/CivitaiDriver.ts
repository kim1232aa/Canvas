import {tracedFetch as fetch} from '../../services/executionTrace';
import { BaseEngineDriver } from '../BaseEngineDriver';
import {
  NormalizedGenerateParams,
  NormalizedGenerateResult,
  ModelSpec,
} from '../types';

/**
 * Civitai 官方原生生成引擎驱动 (CivitaiDriver)
 * 职责：
 * 1. 官方原生直连 Civitai Orchestration / Generator 平台
 * 2. 按模型生态与官方 recipe 提交请求；在线生成权限以服务商响应为准
 * 3. 绝无跨平台不兼容报错，原汁原味执行 Civitai 官方参数
 */
export class CivitaiDriver extends BaseEngineDriver {
  readonly id = 'civitai';
  readonly name = 'Civitai 官方原生生成引擎';
  readonly label = 'Civitai 官方原生';
  readonly badgeColor = '#2563eb';
  readonly description = 'Civitai 官方生成服务 (Orchestration API)，按官方 recipe 提交所选模型与 LoRA；模型须启用在线生成，具体能力与权限以服务商响应为准。';
  readonly capabilities = ['text2img', 'img2img', 'text2video'] as const;

    readonly supportedModels: ModelSpec[] = [];

  protected async executeGenerate(
    params: NormalizedGenerateParams,
    keys: Record<string, string>
  ): Promise<NormalizedGenerateResult> {
    if (!params.model) throw new Error('模型为必填项（model is required）');
    const isVideo =
      params.isVideo === true ||
      params.model.includes('text-to-video') ||
      params.model.includes('image-to-video');
    const civKey = params.apiKey || keys.civitai || keys.CIVITAI_API_TOKEN || keys.civitaiKey || '';

    // Only send values the caller actually provided — no fabricated defaults.
    const payload: Record<string, any> = {
      prompt: params.prompt,
      model: params.model,
      isVideo,
    };
    if (params.negative_prompt) payload.negative_prompt = params.negative_prompt;
    if (params.width) payload.width = params.width;
    if (params.height) payload.height = params.height;
    if (params.steps) payload.steps = params.steps;
    if (params.cfg !== undefined) payload.cfg = params.cfg;
    if (params.seed != null) payload.seed = params.seed;
    if (params.sampler_name || params.extraParams?.sampler_name) payload.sampler_name = params.sampler_name || params.extraParams?.sampler_name;
    if (params.scheduler || params.extraParams?.scheduler) payload.scheduler = params.scheduler || params.extraParams?.scheduler;
    if (params.image_url) {
      payload.image_url = params.image_url;
      if (params.denoise != null) payload.denoise = params.denoise;
    }
    if (params.loras?.length) payload.loras = params.loras;
    // H6: comfy 变体 / 张数由用户指定，没设不发
    if (params.extraParams?.comfyModel) payload.comfyModel = params.extraParams.comfyModel;
    if (params.extraParams?.quantity != null) payload.quantity = params.extraParams.quantity;
    if (isVideo) {
      for (const field of ['engine','version','provider','operation']) if (params.extraParams?.[field] !== undefined) payload[field]=params.extraParams[field];
      if (params.videoFps !== undefined) payload.fps=params.videoFps;
    }
    if (isVideo && params.videoDuration) payload.videoDuration = params.videoDuration;
    if (isVideo && params.aspectRatio) payload.aspectRatio = params.aspectRatio;
    if (civKey) payload.civitaiKey = civKey;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (civKey) {
      headers['x-civitai-key'] = civKey;
    }

    const response = await fetch('/api/engine/civitai/generate', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...payload, workflowSnapshot: params.workflowSnapshot }),
    });

    if (!response.ok) {
      const errText = await response.text();
      let errorMsg = `Civitai 引擎调用失败 (HTTP ${response.status})`;
      try {
        const errJson = JSON.parse(errText);
        errorMsg = errJson.error || errJson.message || errorMsg;
      } catch {
        errorMsg = errText.startsWith('<') ? `服务端接口返回异常 HTML 页面 [HTTP ${response.status}]` : errText;
      }
      throw new Error(errorMsg);
    }

    const resText = await response.text();
    let data: any = {};
    try {
      data = JSON.parse(resText);
    } catch {
      throw new Error(`Civitai 接口响应非有效 JSON 格式 [HTTP ${response.status}]: ${resText.slice(0, 150)}`);
    }

    let mediaUrl = data.mediaUrl || data.imageUrl || data.videoUrl;
    let effectiveParameters: Record<string, any> | undefined;

    if (!mediaUrl && data.pending && data.workflowId) {
      const workflowId = data.workflowId;
      const startTime = Date.now();
      const maxTimeoutMs = 300000; // 5 minutes timeout

      while (Date.now() - startTime < maxTimeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const statusResp = await fetch(`/api/civitai/workflow/${workflowId}`, {
          headers,
        });

        if (!statusResp.ok) {
          const statusErrText = await statusResp.text();
          let statusErrMsg = `Civitai 任务状态查询失败 (HTTP ${statusResp.status})`;
          try {
            const statusErrJson = JSON.parse(statusErrText);
            statusErrMsg = statusErrJson.error || statusErrMsg;
          } catch {
            statusErrMsg = statusErrText.startsWith('<') ? `轮询状态接口返回 HTML 错误页面 [HTTP ${statusResp.status}]` : statusErrText;
          }
          throw new Error(statusErrMsg);
        }

        const pollText = await statusResp.text();
        let statusData: any = {};
        try {
          statusData = JSON.parse(pollText);
        } catch {
          continue;
        }
        const foundUrl = statusData.mediaUrl;
        const status = (statusData.status || '').toLowerCase();

        if (foundUrl || status === 'succeeded') {
          const upstreamInput = statusData?.raw?.steps?.[0]?.input ?? statusData?.steps?.[0]?.input;
          if (upstreamInput && typeof upstreamInput === 'object' && !Array.isArray(upstreamInput)) effectiveParameters = upstreamInput;
          mediaUrl = foundUrl || statusData.mediaUrl;
          if (mediaUrl) break;
        }

        if (status === 'failed' || status === 'expired' || status === 'canceled') {
          throw new Error(
            `Civitai 任务渲染失败 [状态: ${statusData.status}]: ${
              statusData.error || statusData.raw?.error || statusData.raw?.reason || 'Job failed on Civitai cluster'
            }`
          );
        }
      }
    }

    if (!mediaUrl) {
      throw new Error('Civitai 任务未能在规定时间内返回生成结果，请在历史记录中查看或稍后重试。');
    }
    if (data.pending) {
      try {
        const effective = effectiveParameters && typeof effectiveParameters === 'object' ? effectiveParameters : undefined;
        const historyFields = effective ? {
          seed: typeof effective.seed === 'number' ? effective.seed : data.pendingHistory?.seed ?? null,
          steps: typeof effective.steps === 'number' ? effective.steps : data.pendingHistory?.steps ?? null,
          cfg: typeof effective.cfgScale === 'number' ? effective.cfgScale : data.pendingHistory?.cfg ?? null,
          sampler: typeof effective.sampleMethod === 'string' ? effective.sampleMethod : typeof effective.sampler === 'string' ? effective.sampler : data.pendingHistory?.sampler ?? null,
          scheduler: typeof effective.schedule === 'string' ? effective.schedule : typeof effective.scheduler === 'string' ? effective.scheduler : data.pendingHistory?.scheduler ?? null,
          width: typeof effective.width === 'number' ? effective.width : data.pendingHistory?.width ?? null,
          height: typeof effective.height === 'number' ? effective.height : data.pendingHistory?.height ?? null,
        } : {};
        const saved = await fetch('/api/history', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            ...data.pendingHistory,
            ...historyFields,
            url:mediaUrl,
            workflowSnapshot:params.workflowSnapshot,
            requestMetadata:{...data.requestMetadata, effectiveParameters: effective},
          }),
        });
        if (!saved.ok) throw new Error(`HTTP ${saved.status}: ${await saved.text()}`);
        data.historyItem = await saved.json();
      } catch (error: any) {data.historyWarning = `图像已生成，但历史记录保存失败：${error.message}`;}
    }

    return {
      mediaUrl,
      mediaType: isVideo ? 'video' : 'image',
      provider: this.name,
      providerId: 'civitai',
      model: params.model,
      actualModel: data.actualModel || params.model,
      actualProvider: data.actualProvider || this.name,
      requestedModel: params.model,
      seed: data.historyItem?.seed ?? null,
      wasAdapted: Boolean(data.wasAdapted),
      adaptationNotice: data.adaptationNotice,
      timings: data.timings,
      rawResponse: data,
      historyWarning: data.historyWarning,
    };
  }
}
