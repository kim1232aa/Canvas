import type { Request, Response as ExpressResponse } from 'express';
import { buildTamsVideoJob, isTamsNumericModel } from '../../schemas/tensorModelApi.ts';
import { pickTamsBearerKey, TAMS_BEARER_REQUIRED_HINT } from '../../schemas/tensorArtCredentials.ts';
import { buildFalVideoRequest } from '../falVideoContract.ts';
import { falQueueOpenApiUrl, extractFalInputProperties, inlineFalItemRefs, FalSchemaMissingError, type FalSchemaFetchFailure } from '../falImageContract.ts';
import { FAL_VIDEO_POLL_BUDGET_MS, falQueueSubmitUrl, runFalQueueLifecycle } from '../falQueueLifecycle.ts';
import { buildAgnesVideoRequest, agnesVideoId } from '../agnesVideoRequest.ts';
import { classifyNanoGptVideoStatus, NANO_GPT_VIDEO_POLL_BUDGET_MS, NANO_GPT_VIDEO_POLL_INTERVAL_MS } from '../nanoGptVideoStatus.ts';
import { videoCancelPlan, videoProgressLine } from '../videoJobControl.ts';
import { canvasNodeId, clearVideoJobStatus, readVideoJobByNode, readVideoJobCredential, readVideoJobStatus, updateVideoJobStatus } from '../videoJobStatus.ts';
import { applyCustomParameters } from '../customParameters.ts';
import { openWorksInputSchema, buildOpenWorksRequest } from '../openWorksProvider.ts';
import { sanitizeGenerationMetadata } from '../../utils/generationMetadata.ts';
import { resolveAgainstBaseOrigin } from '../../engines/compatRelay.ts';
import type { FieldKey, Provider as SchemaProvider } from '../../schemas/providerSchema.ts';

/** Fal schema GET abort. The route uses AbortSignal.timeout(30000). */
export const VIDEO_GENERATE_SCHEMA_TIMEOUT_MS = 30_000;
/** Room to download the result after the poll budget. */
export const VIDEO_GENERATE_DOWNLOAD_MARGIN_MS = 120_000;
/** Idle socket. Longest provider budget plus schema fetch plus download. Do not shrink the official queue budget. */
export const VIDEO_GENERATE_SOCKET_TIMEOUT_MS = Math.max(NANO_GPT_VIDEO_POLL_BUDGET_MS, FAL_VIDEO_POLL_BUDGET_MS) + VIDEO_GENERATE_SCHEMA_TIMEOUT_MS + VIDEO_GENERATE_DOWNLOAD_MARGIN_MS + 1_000;

export interface VideoGenerateRouteDeps {
  isProvided: (v: any) => boolean;
  forwardUnmappedFields: (
    res: ExpressResponse,
    provider: string,
    body: any,
    fields: string[],
  ) => boolean;
  normalizeFalEndpoint: (model: string, isVideo?: boolean) => string;
  resolveProviderAuth: (
    req: Request,
    provider: any,
  ) => { apiKey: string; baseUrl: string; error?: string };
  upstreamFetch: (meta: any, url: string, options?: any) => Promise<Response>;
  keyPoolManager: {
    getNextKey: (provider: string, preferred?: string) => string | undefined | null;
    recordResult: (
      provider: string,
      key: string,
      success: boolean,
      latencyMs?: number,
      lastError?: string,
      statusCode?: number,
    ) => void;
  };
  recordHistoryItem: (item: any) => Promise<any> | any;
  requireDurableHistoryMediaUrl: (remoteUrl: string) => Promise<any>;
  /** TAMS API origin incl. the configured tensorartBaseUrl override (server.ts resolveTamsModelApiOrigin). Required by the TAMS numeric-model branch: absent → local 500, never a hardcoded default. */
  resolveTamsModelApiOrigin?: () => string;
  /** Test-only clock. Production uses Date.now / the route sleeper. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  generationContext: {
    getStore: () => { traces: any[] } | undefined;
  };
}

export function handleVideoGenerate(deps: VideoGenerateRouteDeps) {
  return async (req: Request, res: ExpressResponse) => {
    const {
      isProvided,
      forwardUnmappedFields,
      normalizeFalEndpoint,
      resolveProviderAuth,
      upstreamFetch,
      keyPoolManager,
      recordHistoryItem,
      requireDurableHistoryMediaUrl,
      generationContext,
    } = deps;
    const now = deps.now ?? Date.now;
    const sleep = deps.sleep;

    // Stop upstream polling when the browser disconnects (fail closed — no further upstream burns).
    // In Node.js HTTP, req emits 'close' as soon as the POST body stream ends.
    // Genuine client disconnection during response waiting is detected via res.on('close') when !res.writableEnded.
    let clientClosed = false;
    const markClientClosed = () => {
      if (!res.writableEnded) clientClosed = true;
    };
    res.on('close', markClientClosed);

    const sleepOrAbort = (ms: number) => new Promise<void>((resolve, reject) => {
      if (clientClosed || (!res.writableEnded && res.destroyed)) {
        reject(Object.assign(new Error('client disconnected'), { clientDisconnected: true }));
        return;
      }
      let settled = false;
      let t: ReturnType<typeof setTimeout> | undefined;
      const onClose = () => {
        if (!res.writableEnded) {
          finish(() => reject(Object.assign(new Error('client disconnected'), { clientDisconnected: true })));
        }
      };
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        if (t !== undefined) clearTimeout(t);
        res.off('close', onClose);
        fn();
      };
      t = setTimeout(() => {
        if (clientClosed || (!res.writableEnded && res.destroyed)) {
          finish(() => reject(Object.assign(new Error('client disconnected'), { clientDisconnected: true })));
        } else {
          finish(() => resolve());
        }
      }, ms);
      res.once('close', onClose);
    });

    try {
      // Video jobs outlast a 300s socket. Fal's local budget is 15 min; NanoGPT's is 10.
      if (typeof (req as any).setTimeout === 'function') (req as any).setTimeout(VIDEO_GENERATE_SOCKET_TIMEOUT_MS);
      if (typeof (res as any).setTimeout === 'function') (res as any).setTimeout(VIDEO_GENERATE_SOCKET_TIMEOUT_MS);

    const {
      prompt,
      model,
      duration,
      fps,
      aspect_ratio,
      image_url,
      seed,
      steps,
      provider: inputProvider,
    } = req.body;

    if (!String(model ?? '').trim()) {
      return res.status(400).json({
        error: '请先选择视频模型 / 工具（模型为必填项，model is required）；服务端不会代入默认模型，请求未发出。',
        errorSource: 'local',
        provider: String(inputProvider || '').toLowerCase().trim() || undefined,
      });
    }
    const reqProvider = (inputProvider || '').toLowerCase().trim();
    const VIDEO_PROVIDERS = ['tensorart', 'tensor', 'nanogpt', 'agnes', 'modelscope', 'modelscope_ai', 'fal', 'civitai', 'grok_compat'];
    if (!reqProvider) {
      return res.status(400).json({ error: '视频服务商 provider 为必填项；不会根据模型名称猜测供应商，也不会回退到 Fal。' });
    }
    if (!VIDEO_PROVIDERS.includes(reqProvider)) {
      return res.status(400).json({ error: `该视频路由未接入 provider=${reqProvider}。当前显式路由: ${VIDEO_PROVIDERS.join(', ')}` });
    }
    if (reqProvider === 'civitai') {
      return res.status(400).json({ error: 'Civitai 视频请走 /api/civitai/generate（isVideo: true），本路由不代理，也不会改用其他供应商。' });
    }

    // 1. Tensor.Art TAMS (OpenWorks video = schema provider `openworks`)
    const isTensorArtTarget =
      reqProvider === 'tensorart' ||
      reqProvider === 'tensor';

    if (isTensorArtTarget) {
      // Numeric TAMS model IDs use VIDEO_DIFFUSION on POST /v1/jobs.
      // OpenWorks tool names (text2video_wan27 / image2video_wan27 / …) stay on the path below.
      if (isTamsNumericModel(model)) {
        const headerKey = req.headers['x-tensorart-key'];
        const pooled = keyPoolManager.getNextKey('tensorart', (headerKey as string) || undefined);
        const tamsKey = pickTamsBearerKey(headerKey, pooled);
        if (!tamsKey) {
          return res.status(400).json({
            error: TAMS_BEARER_REQUIRED_HINT,
            errorSource: 'local',
            provider: 'tensorart',
            model,
          });
        }
        let tamsBody: Record<string, any>;
        try {
          tamsBody = buildTamsVideoJob(req.body, `video-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
        } catch (buildErr: any) {
          return res.status(400).json({
            error: buildErr?.message || String(buildErr),
            errorSource: 'local',
            provider: 'tensorart',
            model,
          });
        }
        if (!deps.resolveTamsModelApiOrigin) {
          return res.status(500).json({
            error: 'server 未注入 TAMS origin resolver（VideoGenerateRouteDeps.resolveTamsModelApiOrigin）；无法确定 TAMS 提交地址，请求未发出。',
            errorSource: 'local',
            provider: 'tensorart',
            model,
          });
        }
        const tamsBase = String(deps.resolveTamsModelApiOrigin()).replace(/\/+$/, '');
        const submitUrl = `${tamsBase}/v1/jobs`;
        const taStart = Date.now();
        const tamsHeaders = { 'Content-Type': 'application/json; charset=UTF-8', Accept: 'application/json', Authorization: `Bearer ${tamsKey}` };
        try {
          const submitRes = await upstreamFetch(
            { provider: 'tensorart', route: req.path, model: String(model), key: tamsKey },
            submitUrl,
            { method: 'POST', headers: tamsHeaders, body: JSON.stringify(tamsBody) },
          );
          const submitRaw = await submitRes.text();
          if (!submitRes.ok) {
            keyPoolManager.recordResult('tensorart', tamsKey, false, Date.now() - taStart, submitRaw, submitRes.status);
            return res.status(submitRes.status).json({
              error: submitRaw,
              errorSource: 'upstream',
              upstreamStatus: submitRes.status,
              rawResponse: submitRaw,
              actualRequest: tamsBody,
              exactEndpointCalled: submitUrl,
              provider: 'tensorart',
              model,
            });
          }
          let submitData: any;
          try { submitData = JSON.parse(submitRaw); } catch { submitData = undefined; }
          const jobId = submitData?.job?.id;
          if (!jobId) {
            keyPoolManager.recordResult('tensorart', tamsKey, false, Date.now() - taStart, submitRaw);
            return res.status(502).json({
              error: submitRaw,
              errorSource: 'upstream',
              rawResponse: submitRaw,
              actualRequest: tamsBody,
              exactEndpointCalled: submitUrl,
              provider: 'tensorart',
              model,
            });
          }
          const queryUrl = `${tamsBase}/v1/jobs/${encodeURIComponent(String(jobId))}`;
          let videoResult = '';
          const pollDeadline = now() + 200_000;
          while (now() < pollDeadline) {
            await (sleep ? sleep(2500) : sleepOrAbort(2500));
            const qRes = await upstreamFetch(
              { provider: 'tensorart', route: 'video/poll', model: String(model), key: tamsKey },
              queryUrl,
              { method: 'GET', headers: tamsHeaders },
            );
            const qRaw = await qRes.text();
            if (!qRes.ok) {
              keyPoolManager.recordResult('tensorart', tamsKey, false, Date.now() - taStart, qRaw, qRes.status);
              return res.status(qRes.status).json({
                error: qRaw,
                errorSource: 'upstream',
                upstreamStatus: qRes.status,
                rawResponse: qRaw,
                jobId,
                actualRequest: tamsBody,
                exactEndpointCalled: queryUrl,
                provider: 'tensorart',
                model,
              });
            }
            let qData: any;
            try { qData = JSON.parse(qRaw); } catch { qData = undefined; }
            const status = String(qData?.job?.status || '').toUpperCase();
            if (status === 'SUCCESS') {
              const videos = qData?.job?.successInfo?.videos;
              const url = Array.isArray(videos) ? videos.find((v: any) => typeof v?.url === 'string' && v.url)?.url : '';
              if (!url) {
                return res.status(502).json({
                  error: qRaw,
                  errorSource: 'upstream',
                  rawResponse: qRaw,
                  jobId,
                  actualRequest: tamsBody,
                  exactEndpointCalled: queryUrl,
                  provider: 'tensorart',
                  model,
                });
              }
              videoResult = url;
              break;
            }
            if (status === 'FAILED' || status === 'CANCELED') {
              keyPoolManager.recordResult('tensorart', tamsKey, false, Date.now() - taStart, qRaw);
              return res.status(502).json({
                error: qRaw,
                errorSource: 'upstream',
                rawResponse: qRaw,
                jobId,
                actualRequest: tamsBody,
                exactEndpointCalled: queryUrl,
                provider: 'tensorart',
                model,
              });
            }
            if (status && !['DEFAULT', 'CREATED', 'PENDING', 'RUNNING', 'WAITING'].includes(status)) {
              keyPoolManager.recordResult('tensorart', tamsKey, false, Date.now() - taStart, qRaw);
              return res.status(502).json({
                error: qRaw,
                errorSource: 'upstream',
                rawResponse: qRaw,
                jobId,
                actualRequest: tamsBody,
                exactEndpointCalled: queryUrl,
                provider: 'tensorart',
                model,
              });
            }
          }
          if (!videoResult) {
            keyPoolManager.recordResult('tensorart', tamsKey, false, Date.now() - taStart, 'poll budget exhausted');
            return res.status(504).json({
              error: 'Tensor.Art TAMS 视频仍未完成：本地等待预算 200000ms 已用尽（不是上游报错）。',
              errorSource: 'local',
              jobId,
              actualRequest: tamsBody,
              exactEndpointCalled: queryUrl,
              provider: 'tensorart',
              model,
            });
          }
          keyPoolManager.recordResult('tensorart', tamsKey, true, Date.now() - taStart);
          const durableVideo = await requireDurableHistoryMediaUrl(videoResult);
          if (!durableVideo.ok) {
            return res.status(500).json({
              error: `Tensor.Art TAMS 视频已生成，但无法下载并持久化为本地历史副本（data URL）: ${durableVideo.message}`,
              ...(durableVideo.status != null ? { persistStatus: durableVideo.status } : {}),
              transientMediaUrl: videoResult,
              jobId,
              actualRequest: tamsBody,
              provider: 'tensorart',
              model,
            });
          }
          const durableVideoUrl = durableVideo.dataUrl;
          const sentStages = Array.isArray(tamsBody.stages) ? tamsBody.stages : [];
          const sentInput = sentStages.find((stage: any) => stage?.type === 'INPUT_INITIALIZE')?.inputInitialize ?? {};
          const sentVideo = sentStages.find((stage: any) => stage?.type === 'VIDEO_DIFFUSION')?.video_diffusion ?? {};
          const sentPrompt = sentVideo.prompts?.[0]?.text;
          const sentNegative = sentVideo.negativePrompts?.[0]?.text;
          const sentModel = sentVideo.sdModel != null ? String(sentVideo.sdModel) : null;
          const sentSeed = sentInput.seed;
          const requestMetadata = {
            actualRequest: tamsBody,
            actualParameters: {
              ...sentInput,
              ...sentVideo,
              ...(sentPrompt !== undefined ? { prompt: sentPrompt } : {}),
              ...(sentNegative !== undefined ? { negative_prompt: sentNegative } : {}),
              ...(sentVideo.scheduleName !== undefined ? { scheduler: sentVideo.scheduleName } : {}),
            },
          };
          const item = await recordHistoryItem({
            url: durableVideoUrl,
            videoUrl: durableVideoUrl,
            mediaType: 'video',
            prompt: sentPrompt ?? null,
            negativePrompt: sentNegative,
            provider: 'tensorart',
            model: sentModel,
            seed: (typeof sentSeed === 'number' || (typeof sentSeed === 'string' && sentSeed.trim() !== '')) && Number.isFinite(Number(sentSeed)) ? Number(sentSeed) : null,
            steps: sentVideo.steps ?? null,
            cfg: sentVideo.cfgScale ?? null,
            width: sentVideo.width,
            height: sentVideo.height,
            sampler: sentVideo.sampler,
            scheduler: sentVideo.scheduleName,
            loras: Array.isArray(sentVideo.lora?.items) ? sentVideo.lora.items.map((lora: any) => ({ name: lora.lora_model, strength: lora.weight })) : undefined,
            requestMetadata,
          });
          return res.json({
            videoUrl: durableVideoUrl,
            mediaUrl: durableVideoUrl,
            mediaType: 'video',
            provider: 'tensorart',
            actualProvider: 'tensorart',
            model: sentModel,
            actualModel: sentModel,
            requestedModel: model,
            exactEndpointCalled: submitUrl,
            queryEndpoint: queryUrl,
            jobId,
            actualRequest: tamsBody,
            requestMetadata,
            historyItem: item,
          });
        } catch (taErr: any) {
          if (taErr?.clientDisconnected) throw taErr;
          keyPoolManager.recordResult('tensorart', tamsKey, false, Date.now() - taStart, taErr?.message || String(taErr));
          return res.status(502).json({
            error: `Tensor.Art TAMS 视频生成异常: ${taErr?.message || taErr}`,
            errorSource: 'network',
            actualRequest: tamsBody,
            exactEndpointCalled: submitUrl,
            provider: 'tensorart',
            model,
          });
        }
      }

      const taKey = keyPoolManager.getNextKey('tensorart', (req.headers['x-tensorart-key'] as string) || undefined) || '';
      if (!taKey) {
        return res.status(400).json({
          error: '未配置 Tensor.Art API Key (x-tensorart-key)。请在右上角设置面板中配置 Tensor.Art API Key。',
          errorSource: 'local', provider: reqProvider, model,
        });
      }
      const targetToolName = String(model).trim();
      const baseUrl = taKey.trim().startsWith('ak_tusi')
        ? 'https://openapi.tusiart.cn/openworks/v1'
        : 'https://openapi.tensor.art/openworks/v1';
      const taStart = Date.now();
      try {
        const listRes = await upstreamFetch(
          { provider: 'tensorart', route: `${req.path}:tools`, model: targetToolName, key: taKey, readOnly: true },
          `${baseUrl}/tool/list`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Echo-Access-Key': taKey },
            body: '{}',
            signal: AbortSignal.timeout(15000),
          },
        );
        if (!listRes.ok) {
          const errText = await listRes.text();
          keyPoolManager.recordResult('tensorart', taKey, false, Date.now() - taStart, errText, listRes.status);
          return res.status(listRes.status).json({
            error: `Tensor.Art OpenWorks 工具列表失败 [${listRes.status}]: ${errText}`,
            errorSource: 'upstream', upstreamStatus: listRes.status, rawResponse: errText,
            exactEndpointCalled: `${baseUrl}/tool/list`, provider: 'tensorart', model: targetToolName,
          });
        }
        const listRaw = await listRes.text();
        let listData: any;
        try { listData = JSON.parse(listRaw); } catch { listData = undefined; }
        if (!listData || (listData.code !== '0' && listData.code !== 0)) {
          keyPoolManager.recordResult('tensorart', taKey, false, Date.now() - taStart, listRaw);
          return res.status(502).json({
            error: `Tensor.Art OpenWorks 工具列表失败: ${listRaw}`,
            errorSource: 'upstream', rawResponse: listRaw,
            exactEndpointCalled: `${baseUrl}/tool/list`, provider: 'tensorart', model: targetToolName,
          });
        }
        const tools: any[] = Array.isArray(listData.data?.tools) ? listData.data.tools : [];
        const bodyInputs = req.body?.inputs;
        const listedTool = tools.find((t: any) => t?.name === targetToolName);
        const clientSuppliedInputs = Array.isArray(bodyInputs) && bodyInputs.length > 0;
        if (!listedTool && !clientSuppliedInputs) {
          const listedNames = tools.map((t: any) => t?.name).filter((n: any) => typeof n === 'string' && n);
          return res.status(400).json({
            error: `Tensor.Art OpenWorks 工具 "${targetToolName}" 不在上游 /tool/list 返回的工具列表中，且请求未提供非空 inputs 数组，无法构造 /task 入参，/task 未发出。上游实际返回的工具（${listedNames.length} 个）: ${listedNames.length ? listedNames.join(', ') : '（空列表）'}。`,
            errorSource: 'local',
            provider: 'tensorart',
            model: targetToolName,
            requestedTool: targetToolName,
            availableTools: listedNames,
            exactEndpointCalled: `${baseUrl}/tool/list`,
          });
        }
        const targetTool = listedTool || { name: targetToolName, inputs: [] };
        const toolInputs: any[] = Array.isArray(targetTool.inputs) ? targetTool.inputs : [];
        // Explicit client inputs (full override) go out verbatim. Otherwise the same Schema-driven builder as the
        // openworks schema provider maps the canvas fields: unmatched slots stay empty and unlisted fields go as named extras.
        const useExplicitInputs = !listedTool || (Array.isArray(bodyInputs) && bodyInputs.length === toolInputs.length);
        let wire: { toolName: string; inputs: any[] };
        let sentParams: Record<string, any> = {};
        let actualRequest: Record<string, any>;
        if (useExplicitInputs) {
          wire = { toolName: targetTool.name, inputs: bodyInputs };
          actualRequest = { endpoint: `${baseUrl}/task`, parameters: wire, mapping: [{ from: 'inputs', to: 'inputs', value: bodyInputs, sent: true, reason: '请求显式提供 inputs，原样发送' }] };
        } else {
          const built = buildOpenWorksRequest(targetTool.name, openWorksInputSchema(targetTool), req.body || {});
          if (!built.ok) {
            return res.status(400).json({
              error: built.error, errorSource: 'local', provider: 'tensorart', model: targetToolName, mapping: built.mapping,
              exactEndpointCalled: `${baseUrl}/tool/list`,
            });
          }
          wire = built.wire;
          sentParams = built.parameters;
          actualRequest = { endpoint: `${baseUrl}/task`, parameters: built.parameters, mapping: built.mapping, schemaFields: built.schemaFields };
        }
        const submitUrl = `${baseUrl}/task`;
        const submitRes = await upstreamFetch(
          { provider: 'tensorart', route: req.path, model: targetTool.name, key: taKey },
          submitUrl,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Echo-Access-Key': taKey },
            body: JSON.stringify(wire),
          },
        );
        const submitRaw = await submitRes.text();
        let submitData: any;
        try { submitData = JSON.parse(submitRaw); } catch { submitData = undefined; }
        if (!submitRes.ok) {
          keyPoolManager.recordResult('tensorart', taKey, false, Date.now() - taStart, submitRaw, submitRes.status);
          return res.status(submitRes.status).json({
            error: `Tensor.Art 视频任务提交失败 [${submitRes.status}]: ${submitRaw}`,
            errorSource: 'upstream', upstreamStatus: submitRes.status, rawResponse: submitRaw,
            toolName: targetTool.name, exactEndpointCalled: submitUrl, provider: 'tensorart', actualRequest,
          });
        }
        if (!submitData || (submitData.code !== '0' && submitData.code !== 0)) {
          keyPoolManager.recordResult('tensorart', taKey, false, Date.now() - taStart, submitRaw);
          return res.status(502).json({
            error: `Tensor.Art 视频任务创建失败: ${submitRaw}`,
            errorSource: 'upstream', rawResponse: submitRaw,
            toolName: targetTool.name, exactEndpointCalled: submitUrl, provider: 'tensorart', actualRequest,
          });
        }
        const taskId = submitData.data?.task?.id || submitData.data?.taskId || submitData.data?.id;
        if (!taskId) {
          keyPoolManager.recordResult('tensorart', taKey, false, Date.now() - taStart, submitRaw);
          return res.status(502).json({
            error: `Tensor.Art 任务成功受理，但未返回有效 Task ID: ${submitRaw}`,
            errorSource: 'upstream', rawResponse: submitRaw,
            toolName: targetTool.name, exactEndpointCalled: submitUrl, provider: 'tensorart', actualRequest,
          });
        }
        let videoResult = '';
        const pollDeadline = now() + 200_000;
        while (now() < pollDeadline) {
          await (sleep ? sleep(2500) : sleepOrAbort(2500));
          const qRes = await upstreamFetch(
            { provider: 'tensorart', route: 'video/poll', model: targetTool.name, key: taKey },
            `${baseUrl}/task/query`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Echo-Access-Key': taKey },
              body: JSON.stringify({ taskIds: [String(taskId)] }),
            },
          );
          if (!qRes.ok) {
            const errText = await qRes.text().catch(() => '');
            keyPoolManager.recordResult('tensorart', taKey, false, Date.now() - taStart, errText, qRes.status);
            return res.status(qRes.status).json({
              error: `Tensor.Art 视频任务查询失败 [${qRes.status}]: ${errText}`,
              errorSource: 'upstream', upstreamStatus: qRes.status, rawResponse: errText,
              taskId, toolName: targetTool.name, exactEndpointCalled: `${baseUrl}/task/query`, provider: 'tensorart',
            });
          }
          const qRaw = await qRes.text();
          let qData: any;
          try { qData = JSON.parse(qRaw); } catch { qData = undefined; }
          if (!qData || (qData.code !== '0' && qData.code !== 0)) {
            keyPoolManager.recordResult('tensorart', taKey, false, Date.now() - taStart, qRaw);
            return res.status(502).json({
              error: `Tensor.Art 视频任务查询失败: ${qRaw}`,
              errorSource: 'upstream', rawResponse: qRaw,
              taskId, toolName: targetTool.name, provider: 'tensorart',
            });
          }
          const task = qData.data?.tasks?.[0] || qData.data?.[0];
          const status = String(task?.status || '').toUpperCase();
          if (status === 'FINISH' || status === 'SUCCESS') {
            const out = task.outputs?.[0];
            videoResult = typeof out === 'string' ? out : out?.value || out?.url || '';
            if (!videoResult) {
              return res.status(502).json({
                error: `Tensor.Art 视频任务完成但未返回视频 URL: ${qRaw}`,
                errorSource: 'upstream', rawResponse: qRaw, taskId, toolName: targetTool.name, provider: 'tensorart',
              });
            }
            break;
          }
          if (status === 'FAILED' || status === 'EXCEPTION' || status === 'CANCELED') {
            keyPoolManager.recordResult('tensorart', taKey, false, Date.now() - taStart, qRaw);
            return res.status(502).json({
              error: `Tensor.Art 视频任务处理异常 (${status}): ${qRaw}`,
              errorSource: 'upstream', rawResponse: qRaw, taskId, toolName: targetTool.name, provider: 'tensorart',
            });
          }
        }
        if (!videoResult) {
          keyPoolManager.recordResult('tensorart', taKey, false, Date.now() - taStart, 'poll budget exhausted');
          return res.status(504).json({
            error: 'Tensor.Art 视频云端渲染超时 (200s 未完成)，请稍后重试。',
            errorSource: 'local', taskId, toolName: targetTool.name, provider: 'tensorart',
          });
        }
        keyPoolManager.recordResult('tensorart', taKey, true, Date.now() - taStart);
        const durableVideo = await requireDurableHistoryMediaUrl(videoResult);
        if (!durableVideo.ok) {
          return res.status(500).json({
            error: `Tensor.Art 视频已生成，但无法下载并持久化为本地历史副本（data URL）: ${durableVideo.message}`,
            ...(durableVideo.status != null ? { persistStatus: durableVideo.status } : {}),
            transientMediaUrl: videoResult, taskId, toolName: targetTool.name, provider: 'tensorart',
          });
        }
        const durableVideoUrl = durableVideo.dataUrl;
        const item = await recordHistoryItem({
          url: durableVideoUrl,
          prompt,
          negativePrompt: sentParams.negative_prompt,
          provider: 'Tensor.Art (OpenWorks Video)',
          model: targetTool.name,
          seed: sentParams.seed ?? null,
          steps: sentParams.steps ?? null,
          cfg: sentParams.cfg ?? null,
          width: sentParams.width,
          height: sentParams.height,
          loras: sentParams.loras,
          requestMetadata: { actualRequest },
        });
        return res.json({
          videoUrl: durableVideoUrl,
          mediaUrl: durableVideoUrl,
          mediaType: 'video',
          provider: 'Tensor.Art (OpenWorks Video)',
          actualProvider: 'Tensor.Art (OpenWorks Video)',
          model: targetTool.name,
          actualModel: targetTool.name,
          requestedModel: model,
          exactEndpointCalled: submitUrl,
          taskId,
          actualRequest,
          historyItem: item,
        });
      } catch (taErr: any) {
        if (taErr?.clientDisconnected) throw taErr;
        keyPoolManager.recordResult('tensorart', taKey, false, Date.now() - taStart, taErr?.message || String(taErr));
        return res.status(502).json({
          error: `Tensor.Art 视频生成异常: ${taErr?.message || taErr}`,
          errorSource: 'network', provider: 'tensorart', model: targetToolName,
        });
      }
    }

    // 2. NanoGPT Video API (https://api.nano-gpt.com/api/generate-video)
    const isNanoGptTarget =
      reqProvider === 'nanogpt';

    if (isNanoGptTarget) {
      const nanoKey = keyPoolManager.getNextKey('nanogpt', (req.headers['x-nanogpt-key'] as string) || undefined);
      if (!nanoKey) {
        return res.status(400).json({ error: '未配置 NanoGPT API Key (x-nanogpt-key)。' });
      }
      const startTime = Date.now();

      try {
        // NanoGPT video submit: POST api.nano-gpt.com/api/generate-video
        // duration is a STRING, seed/negative_prompt are passed through
        if (forwardUnmappedFields(res, 'NanoGPT Video', req.body, ['loras', 'width', 'height', 'sampler_name', 'scheduler', 'denoise'])) return;
        const nanoPayload: any = { model, prompt };
        if (isProvided(duration)) nanoPayload.duration = String(duration);
        if (isProvided(aspect_ratio)) nanoPayload.aspect_ratio = aspect_ratio;
        if (isProvided(seed)) nanoPayload.seed = Number(seed);
        if (isProvided(req.body.negative_prompt)) nanoPayload.negative_prompt = req.body.negative_prompt;
        if (isProvided(fps)) nanoPayload.frames_per_second = Number(fps);
        if (isProvided(req.body.num_frames)) nanoPayload.num_frames = Number(req.body.num_frames);
        if (isProvided(req.body.resolution)) nanoPayload.resolution = req.body.resolution;
        const effectiveSteps = isProvided(steps) ? steps : req.body.num_inference_steps;
        if (isProvided(effectiveSteps)) nanoPayload.num_inference_steps = Number(effectiveSteps);
        const effectiveCfg = isProvided(req.body.cfg) ? req.body.cfg : (isProvided(req.body.cfg_scale) ? req.body.cfg_scale : req.body.guidance_scale);
        if (isProvided(effectiveCfg)) nanoPayload.cfg_scale = Number(effectiveCfg);
        if (isProvided(req.body.shift)) nanoPayload.shift = Number(req.body.shift);
        if (image_url) {
          if (image_url.startsWith('data:')) nanoPayload.imageDataUrl = image_url;
          else nanoPayload.imageUrl = image_url;
        }
        const nanoCustom = applyCustomParameters(nanoPayload, req.body.custom_parameters);
        const sentNanoVideo = nanoCustom.payload;
        const nanoOrigin = new URL(resolveProviderAuth(req, 'nanogpt').baseUrl || 'https://api.nano-gpt.com/api/v1').origin;

        const submitRes = await upstreamFetch(
          { provider: 'nanogpt', route: req.path, model: String(sentNanoVideo.model || model), key: nanoKey },
          `${nanoOrigin}/api/generate-video`,
          {
            method: 'POST',
            headers: { 'x-api-key': nanoKey, 'Content-Type': 'application/json' },
            body: JSON.stringify(sentNanoVideo),
          }
        );

        if (!submitRes.ok) {
          const errText = await submitRes.text();
          keyPoolManager.recordResult('nanogpt', nanoKey, false, Date.now() - startTime, errText, submitRes.status);
          return res.status(submitRes.status).json({ error: `NanoGPT 视频任务提交失败 [${submitRes.status}]: ${errText}` });
        }

        const submitData = await submitRes.json();
        let videoUrl = '';
        const runId = submitData.runId || submitData.id;

        const statusEndpoint = `${nanoOrigin}/api/video/status?requestId=${encodeURIComponent(runId || '')}`;
        let lastStatus = '';
        let lastResponse: unknown = submitData;
        const noteNano = (phase: 'submitted' | 'queued' | 'running', upstreamStatus?: string) => {
          if (!runId) return;
          updateVideoJobStatus({ jobId: String(runId), provider: 'nanogpt', phase, upstreamStatus, budgetMs: NANO_GPT_VIDEO_POLL_BUDGET_MS, credential: nanoKey, nodeId: canvasNodeId(req.body) });
        };
        noteNano('submitted');
        try {
        if (runId) {
          // Official sample: poll ~10 min at 5s. Local budget spent ≠ upstream failure.
          const deadline = now() + NANO_GPT_VIDEO_POLL_BUDGET_MS;
          while (now() < deadline) {
            if (clientClosed) {
              return; // client gone — stop polling, do not keep burning upstream
            }
            try {
              if (sleep) await sleep(NANO_GPT_VIDEO_POLL_INTERVAL_MS);
              else await sleepOrAbort(NANO_GPT_VIDEO_POLL_INTERVAL_MS);
            } catch (e: any) {
              if (e?.clientDisconnected) {
                return;
              }
              throw e;
            }
            if (now() >= deadline) break;
            let statusRes: Response;
            try {
              statusRes = await upstreamFetch(
                { provider: 'nanogpt', route: 'video/poll', model, key: nanoKey },
                statusEndpoint,
                { headers: { 'x-api-key': nanoKey } }
              );
            } catch (netErr: any) {
              keyPoolManager.recordResult('nanogpt', nanoKey, false, Date.now() - startTime, netErr.message);
              return res.status(502).json({ error: `NanoGPT 视频状态查询网络异常: ${netErr.message}`, errorSource: 'network', runId, endpoint: statusEndpoint });
            }

            if (!statusRes.ok) {
              const errBody = await statusRes.text().catch(() => '');
              keyPoolManager.recordResult('nanogpt', nanoKey, false, Date.now() - startTime, errBody, statusRes.status);
              return res.status(statusRes.status).json({
                error: `NanoGPT 视频状态查询失败 [${statusRes.status}]: ${errBody}`,
                errorSource: 'upstream',
                upstreamStatus: statusRes.status,
                runId,
                endpoint: statusEndpoint,
                rawResponse: errBody,
              });
            }

            const statusData = await statusRes.json();
            lastResponse = statusData;
            const classified = classifyNanoGptVideoStatus(statusData);
            lastStatus = classified.status;
            noteNano(/queue/i.test(classified.status) ? 'queued' : 'running', classified.status);
            if (classified.kind === 'completed') {
              videoUrl = classified.url;
              break;
            }
            if (classified.kind === 'completed-without-url') {
              keyPoolManager.recordResult('nanogpt', nanoKey, false, Date.now() - startTime, 'COMPLETED without video URL');
              return res.status(502).json({
                error: 'NanoGPT 视频状态为 COMPLETED，但响应中没有视频 URL（videoUrl / data.output.video.url）。',
                errorSource: 'upstream-protocol',
                runId,
                endpoint: statusEndpoint,
                rawResponse: statusData,
              });
            }
            if (classified.kind === 'failed') {
              keyPoolManager.recordResult('nanogpt', nanoKey, false, Date.now() - startTime, classified.message);
              return res.status(500).json({
                error: `NanoGPT 视频生成失败: ${classified.message}`,
                errorSource: 'upstream-task',
                runId,
                endpoint: statusEndpoint,
                rawResponse: statusData,
              });
            }
          }
        }

        if (!videoUrl) {
          keyPoolManager.recordResult('nanogpt', nanoKey, false, Date.now() - startTime, 'local poll budget exhausted');
          return res.status(504).json({
            error: `NanoGPT 视频仍未完成：本地等待预算 ${NANO_GPT_VIDEO_POLL_BUDGET_MS}ms 已用尽（不是上游报错）。`,
            errorSource: 'local',
            runId: runId || null,
            lastStatus,
            lastResponse,
            endpoint: statusEndpoint,
          });
        }

        keyPoolManager.recordResult('nanogpt', nanoKey, true, Date.now() - startTime);
        const durableVideo = await requireDurableHistoryMediaUrl(videoUrl);
        if (!durableVideo.ok) {
          return res.status(500).json({
            error: `NanoGPT 视频已生成，但无法下载并持久化为本地历史副本（data URL）: ${durableVideo.message}`,
            ...(durableVideo.status != null ? { persistStatus: durableVideo.status } : {}),
            transientMediaUrl: videoUrl,
          });
        }
        const durableVideoUrl = durableVideo.dataUrl;
        const item = await recordHistoryItem({
          url: durableVideoUrl,
          prompt,
          negativePrompt: nanoPayload.negative_prompt,
          provider: 'NanoGPT Video',
          model,
          seed: nanoPayload.seed ?? null,
          steps: null,
          cfg: null,
        });

        return res.json({
          videoUrl: durableVideoUrl,
          provider: 'NanoGPT Video',
          model,
          requestedModel: model,
          exactEndpointCalled: `${nanoOrigin}/api/generate-video`,
          duration,
          historyItem: item,
        });
        } finally {
          if (runId) clearVideoJobStatus(String(runId));
        }
      } catch (nanoErr: any) {
        keyPoolManager.recordResult('nanogpt', nanoKey, false, Date.now() - startTime, nanoErr.message);
        return res.status(500).json({ error: `NanoGPT 视频接口请求异常: ${nanoErr.message}` });
      }
    }

    // 3. Agnes AI Video: POST /v1/videos → poll GET /agnesapi?video_id=&model_name=
    if (reqProvider === 'agnes') {
      const auth = resolveProviderAuth(req, 'agnes');
      if (auth.error) return res.status(400).json({ error: auth.error });
      const { apiKey: agnesKey, baseUrl: agnesBaseUrl } = auth;
      const startTime = Date.now();
      if (forwardUnmappedFields(res, 'Agnes AI Video', req.body, ['negative_prompt', 'steps', 'cfg', 'guidance_scale', 'loras', 'resolution', 'width', 'height', 'sampler_name', 'scheduler', 'denoise'])) return;

      let builtAgnes;
      try { builtAgnes = buildAgnesVideoRequest(model, req.body); }
      catch (error: any) { return res.status(400).json({ error: error.message, errorSource: 'local', stack: error.stack }); }
      const agnesPayload = builtAgnes.payload;
      const requestMetadata = sanitizeGenerationMetadata({
        requestedParameters: builtAgnes.requestedParameters, beforeCustom: builtAgnes.beforeCustom,
        customParameters: builtAgnes.customParameters, overrides: builtAgnes.overrides,
        actualParameters: agnesPayload, fieldStatus: builtAgnes.fieldStatus,
      });
      generationContext.getStore()?.traces.push({ stage: 'parameter-mapping', provider: 'agnes', ...requestMetadata });

      try {
        // Submit
        const submitResp = await upstreamFetch(
          { provider: 'agnes', route: req.path, model, key: agnesKey },
          `${agnesBaseUrl}/videos`,
          {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${agnesKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(agnesPayload),
          }
        );

        if (!submitResp.ok) {
          const errorText = await submitResp.text();
          keyPoolManager.recordResult('agnes', agnesKey, false, Date.now() - startTime, errorText, submitResp.status);
          return res.status(submitResp.status).json({ error: `Agnes AI 视频提交失败 [${submitResp.status}]: ${errorText}` });
        }

        const submitData = await submitResp.json();
        let videoId: string;
        try { videoId = agnesVideoId(submitData); }
        catch (error: any) {
          keyPoolManager.recordResult('agnes', agnesKey, false, Date.now() - startTime, error.message, 502);
          return res.status(502).json({ error: error.message, rawResponse: submitData, actualRequest: agnesPayload });
        }

        // Poll until completed or failed (max 5 min)
        // Agnes polling lives at the domain root, not under /v1
        const agnesOrigin = new URL(agnesBaseUrl).origin;
        const pollUrl = `${agnesOrigin}/agnesapi?video_id=${encodeURIComponent(videoId)}&model_name=${encodeURIComponent(model)}`;
        const pollDeadline = Date.now() + 5 * 60 * 1000;
        let videoUrl = '';
        while (Date.now() < pollDeadline) {
          if (clientClosed) {
            return;
          }
          try { await sleepOrAbort(5000); } catch (e: any) {
            if (e?.clientDisconnected) {
              return;
            }
            throw e;
          }
          let pollResp: Response;
          try {
            pollResp = await upstreamFetch(
              { provider: 'agnes', route: 'video/poll', model, key: agnesKey },
              pollUrl,
              { headers: { 'Authorization': `Bearer ${agnesKey}` } }
            );
          } catch (netErr: any) {
            keyPoolManager.recordResult('agnes', agnesKey, false, Date.now() - startTime, netErr.message);
            return res.status(502).json({ error: `Agnes AI 视频轮询网络异常: ${netErr.message}`, videoId });
          }
          if (!pollResp.ok) {
            const errBody = await pollResp.text().catch(() => '');
            keyPoolManager.recordResult('agnes', agnesKey, false, Date.now() - startTime, errBody, pollResp.status);
            return res.status(pollResp.status).json({
              error: `Agnes AI 视频轮询失败 [${pollResp.status}]: ${errBody}`,
              videoId,
            });
          }
          const pollData = await pollResp.json();
          if (pollData.status === 'failed') {
            keyPoolManager.recordResult('agnes', agnesKey, false, Date.now() - startTime, 'Video generation failed');
            return res.status(500).json({ error: `Agnes AI 视频生成失败: ${JSON.stringify(pollData)}`, videoId });
          }
          if (pollData.status === 'completed' && pollData.url) {
            videoUrl = pollData.url;
            break;
          }
        }
        if (!videoUrl) {
          keyPoolManager.recordResult('agnes', agnesKey, false, Date.now() - startTime, 'Polling timeout');
          return res.status(504).json({ error: 'Agnes AI 视频生成轮询超时 (5 min)' });
        }

        keyPoolManager.recordResult('agnes', agnesKey, true, Date.now() - startTime);
        const durableVideo = await requireDurableHistoryMediaUrl(videoUrl);
        if (!durableVideo.ok) {
          return res.status(500).json({
            error: `Agnes AI 视频已生成，但无法下载并持久化为本地历史副本（data URL）: ${durableVideo.message}`,
            ...(durableVideo.status != null ? { persistStatus: durableVideo.status } : {}),
            transientMediaUrl: videoUrl,
          });
        }
        const durableVideoUrl = durableVideo.dataUrl;
        const item = await recordHistoryItem({
          url: durableVideoUrl,
          prompt: typeof agnesPayload.prompt === 'string' ? agnesPayload.prompt : null,
          provider: 'Agnes AI Video (ApiHub)',
          model,
          seed: typeof agnesPayload.seed === 'number' ? agnesPayload.seed : null,
          steps: null,
          cfg: null,
          requestMetadata,
        });

        return res.json({
          videoUrl: durableVideoUrl,
          provider: 'Agnes AI Video (ApiHub)',
          model,
          requestedModel: model,
          exactEndpointCalled: `${agnesBaseUrl}/videos`,
          duration: agnesPayload.seconds ?? null,
          actualRequest: agnesPayload,
          requestMetadata,
          historyItem: item,
        });
      } catch (agErr: any) {
        keyPoolManager.recordResult('agnes', agnesKey, false, Date.now() - startTime, agErr.message);
        return res.status(500).json({ error: `Agnes AI 视频请求异常: ${agErr.message}` });
      }
    }

    // 3b. Grok / xAI 兼容中转视频：POST /videos/generations → poll GET /videos/{request_id}
    // 503 grok_media_no_eligible_account 必须原样返回，绝不静默换商。
    if (reqProvider === 'grok_compat') {
      const auth = resolveProviderAuth(req, 'grok_compat');
      if (auth.error) return res.status(400).json({ error: auth.error });
      const { apiKey: grokKey, baseUrl: grokBase } = auth;
      const startTime = Date.now();
      if (forwardUnmappedFields(res, 'grok_compat', req.body, ['seed', 'negative_prompt', 'steps', 'cfg', 'guidance_scale', 'loras', 'width', 'height', 'fps', 'num_frames', 'size', 'sampler_name', 'scheduler', 'denoise'])) return;
      const grokResolution = req.body.resolution;

      const grokPayload: Record<string, unknown> = { model, prompt };
      if (isProvided(duration)) grokPayload.duration = Number(duration);
      if (isProvided(aspect_ratio)) grokPayload.aspect_ratio = aspect_ratio;
      if (isProvided(grokResolution)) grokPayload.resolution = grokResolution;
      if (image_url) grokPayload.image = { url: image_url };
      const grokCustom = applyCustomParameters(grokPayload, req.body.custom_parameters);
      const sentGrokVideo = grokCustom.payload;

      try {
        const submitResp = await upstreamFetch(
          { provider: 'grok_compat', route: req.path, model: String(sentGrokVideo.model || model), key: grokKey },
          `${grokBase}/videos/generations`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${grokKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(sentGrokVideo),
          },
        );
        if (!submitResp.ok) {
          const errorText = await submitResp.text();
          keyPoolManager.recordResult('grok_compat', grokKey, false, Date.now() - startTime, errorText, submitResp.status);
          return res.status(submitResp.status).json({ error: `Grok 兼容中转视频提交失败 [${submitResp.status}]: ${errorText}` });
        }
        const submitData = await submitResp.json();
        const requestId = submitData.request_id || submitData.id;
        if (!requestId) {
          keyPoolManager.recordResult('grok_compat', grokKey, false, Date.now() - startTime, 'No request_id in submit response', 500);
          return res.status(500).json({ error: 'Grok 兼容中转视频接口未返回 request_id', details: submitData });
        }

        const pollDeadline = Date.now() + 5 * 60 * 1000;
        let videoUrl = '';
        while (Date.now() < pollDeadline) {
          if (clientClosed) {
            return;
          }
          try { await sleepOrAbort(3000); } catch (e: any) {
            if (e?.clientDisconnected) {
              return;
            }
            throw e;
          }
          let pollResp: Response;
          try {
            pollResp = await upstreamFetch(
              { provider: 'grok_compat', route: 'video/poll', model, key: grokKey },
              `${grokBase}/videos/${encodeURIComponent(requestId)}`,
              { headers: { Authorization: `Bearer ${grokKey}` } },
            );
          } catch (netErr: any) {
            keyPoolManager.recordResult('grok_compat', grokKey, false, Date.now() - startTime, netErr.message);
            return res.status(502).json({ error: `Grok 兼容中转视频轮询网络异常: ${netErr.message}`, request_id: requestId });
          }
          if (!pollResp.ok) {
            const errBody = await pollResp.text().catch(() => '');
            keyPoolManager.recordResult('grok_compat', grokKey, false, Date.now() - startTime, errBody, pollResp.status);
            return res.status(pollResp.status).json({
              error: `Grok 兼容中转视频轮询失败 [${pollResp.status}]: ${errBody}`,
              request_id: requestId,
            });
          }
          const pollData = await pollResp.json();
          const status = String(pollData.status || '').toLowerCase();
          if (status === 'failed' || status === 'error') {
            keyPoolManager.recordResult('grok_compat', grokKey, false, Date.now() - startTime, JSON.stringify(pollData));
            return res.status(500).json({ error: `Grok 兼容中转视频生成失败: ${JSON.stringify(pollData)}`, request_id: requestId });
          }
          const rawUrl = pollData.video?.url || pollData.url;
          // Spec: respect_moderation === false → url empty → fail with raw body (no silent success)
          if ((status === 'done' || status === 'completed' || status === 'succeeded') && pollData.video && pollData.video.respect_moderation === false && !rawUrl) {
            keyPoolManager.recordResult('grok_compat', grokKey, false, Date.now() - startTime, JSON.stringify(pollData));
            return res.status(500).json({
              error: `Grok 兼容中转视频被审核拦截（respect_moderation=false）: ${JSON.stringify(pollData)}`,
              request_id: requestId,
            });
          }
          if ((status === 'done' || status === 'completed' || status === 'succeeded') && rawUrl) {
            videoUrl = resolveAgainstBaseOrigin(String(rawUrl), grokBase);
            break;
          }
          if ((status === 'done' || status === 'completed' || status === 'succeeded') && !rawUrl) {
            keyPoolManager.recordResult('grok_compat', grokKey, false, Date.now() - startTime, JSON.stringify(pollData));
            return res.status(500).json({
              error: `Grok 兼容中转视频完成但无 URL: ${JSON.stringify(pollData)}`,
              request_id: requestId,
            });
          }
        }
        if (!videoUrl) {
          keyPoolManager.recordResult('grok_compat', grokKey, false, Date.now() - startTime, 'Polling timeout');
          return res.status(504).json({ error: 'Grok 兼容中转视频生成轮询超时 (5 min)', request_id: requestId });
        }

        keyPoolManager.recordResult('grok_compat', grokKey, true, Date.now() - startTime);
        // Durable copy before history — same fail-closed pattern as image generate
        const durableVideo = await requireDurableHistoryMediaUrl(videoUrl);
        if (!durableVideo.ok) {
          return res.status(500).json({
            error: `Grok 兼容中转视频已生成，但无法下载并持久化为本地历史副本（data URL）: ${durableVideo.message}`,
            ...(durableVideo.status != null ? { persistStatus: durableVideo.status } : {}),
            transientMediaUrl: videoUrl,
            request_id: requestId,
          });
        }
        const durableVideoUrl = durableVideo.dataUrl;
        const item = await recordHistoryItem({
          url: durableVideoUrl,
          prompt,
          provider: 'Grok 兼容中转',
          model,
          seed: null,
          steps: null,
          cfg: null,
        });
        return res.json({
          videoUrl: durableVideoUrl,
          mediaUrl: durableVideoUrl,
          provider: 'Grok 兼容中转',
          model,
          requestedModel: model,
          exactEndpointCalled: `${grokBase}/videos/generations`,
          duration: isProvided(duration) ? duration : null,
          historyItem: item,
        });
      } catch (grokErr: any) {
        keyPoolManager.recordResult('grok_compat', grokKey, false, Date.now() - startTime, grokErr.message);
        return res.status(500).json({ error: `Grok 兼容中转视频请求异常: ${grokErr.message}` });
      }
    }

    // 4. ModelScope Wan 2.1 Video support
    const isModelScopeTarget =
      reqProvider === 'modelscope' ||
      reqProvider === 'modelscope_ai';

    // Official API-Inference intro (https://www.modelscope.cn/docs/model-service/API-Inference/intro, fetched 2026-11-07)
    // documents LLM, Vision, Image (POST /v1/images/generations) and Audio (POST /v1/audios/generations).
    // It has no video generation endpoint. Do not call a guessed URL and do not switch provider.
    if (isModelScopeTarget) {
      return res.status(400).json({
        error: `ModelScope API-Inference 目前文档化能力为 LLM / Vision / Image / Audio，无视频生成端点（来源：https://www.modelscope.cn/docs/model-service/API-Inference/intro）。本请求保持 provider=${reqProvider}（model: ${model || '(空)'}），不切换到其他供应商。`,
        errorSource: 'local',
        provider: reqProvider,
        model,
        docUrl: 'https://www.modelscope.cn/docs/model-service/API-Inference/intro',
      });
    }

    // 5. Fal.ai Video Engine — reached only for explicit provider=fal after the other explicit provider branches.
    if (reqProvider !== 'fal') {
      return res.status(400).json({ error: `视频 provider=${reqProvider} 没有匹配到已接入执行分支；拒绝回退到 Fal。` });
    }
    const falKey = keyPoolManager.getNextKey('fal', (req.headers['x-fal-key'] as string) || undefined) || '';

    if (!falKey) {
      return res.status(400).json({
        error: '未配置 Fal.ai 密钥。当前视频请求明确选择了 provider=fal；请配置有效 Fal.ai API Key。',
      });
    }

    let endpoint = normalizeFalEndpoint(model, true);
    if (!endpoint) {
      return res.status(400).json({ error: `不认识这个模型: ${model}` });
    }

    if (forwardUnmappedFields(res, 'Fal Video', req.body, ['width', 'height', 'sampler_name', 'scheduler', 'denoise'])) return;

    let liveProps: Record<string, unknown> | undefined;
    let schemaFetch: FalSchemaFetchFailure | undefined;
    const hasClientProps = req.body?.inputSchemaProperties && typeof req.body.inputSchemaProperties === 'object' && !Array.isArray(req.body.inputSchemaProperties);
    if (hasClientProps) {
      liveProps = req.body.inputSchemaProperties as Record<string, unknown>;
    } else {
      const schemaUrl = falQueueOpenApiUrl(endpoint);
      try {
        const sr = await upstreamFetch(
          { provider: 'fal', route: `${req.path}:schema`, model: endpoint, key: falKey, readOnly: true },
          schemaUrl,
          { headers: falKey ? { Authorization: `Key ${falKey}` } : {}, signal: AbortSignal.timeout(30000) },
        );
        const raw = await sr.text().catch(() => '');
        if (!sr.ok) {
          schemaFetch = { url: schemaUrl, status: sr.status, body: raw };
        } else {
          let parsed: unknown;
          try { parsed = JSON.parse(raw); } catch { parsed = undefined; }
          liveProps = extractFalInputProperties(parsed);
          if (liveProps) liveProps = inlineFalItemRefs(liveProps, parsed);
          if (!liveProps) schemaFetch = { url: schemaUrl, status: sr.status, body: raw };
        }
      } catch (e: any) {
        schemaFetch = { url: schemaUrl, status: null, body: String(e?.message || e) };
      }
    }
    if (!liveProps) {
      const error = new FalSchemaMissingError(endpoint, schemaFetch);
      const sf = error.schemaFetch;
      const upstreamAnswered = Boolean(sf && sf.status !== null && (sf.status < 200 || sf.status >= 300));
      return res.status(error.httpStatus).json({
        error: error.message,
        errorSource: upstreamAnswered ? 'upstream' : sf && sf.status === null ? 'network' : 'local',
        upstreamStatus: sf?.status ?? null,
        blocked: 'schema_missing',
        endpoint,
        schemaFetch: error.schemaFetch ?? null,
        actualRequest: null,
        notSent: true,
      });
    }

    let builtVideo;
    try { builtVideo = buildFalVideoRequest(endpoint, req.body, liveProps, schemaFetch); }
    catch (error: any) {
      if (error instanceof FalSchemaMissingError) {
        const sf = error.schemaFetch;
        const upstreamAnswered = Boolean(sf && sf.status !== null && (sf.status < 200 || sf.status >= 300));
        return res.status(error.httpStatus).json({
          error: error.message,
          errorSource: upstreamAnswered ? 'upstream' : sf && sf.status === null ? 'network' : 'local',
          upstreamStatus: sf?.status ?? null,
          blocked: 'schema_missing',
          endpoint: error.endpoint,
          schemaFetch: error.schemaFetch ?? null,
          actualRequest: null,
          notSent: true,
        });
      }
      return res.status(400).json({ error: error.message, errorSource: 'local' });
    }
    const payload = builtVideo.payload;
    // Fal official queue lifecycle for long-running video endpoints:
    // submit to queue.fal.run (202 + request_id) → poll status → fetch stored result.
    // Never use the synchronous https://fal.run host for these long tasks.
    const upstreamEndpoint = falQueueSubmitUrl(endpoint);
    generationContext.getStore()?.traces.push(sanitizeGenerationMetadata({
      stage: 'parameter-mapping', provider: 'fal', endpoint,
      beforeCustom: builtVideo.beforeCustom, customParameters: builtVideo.customParameters,
      overrides: builtVideo.overrides, actualParameters: payload, fieldStatus: builtVideo.fieldStatus,
    }));

    const falVideoStart = Date.now();
    let falJobId: string | undefined;
    let outcome: Awaited<ReturnType<typeof runFalQueueLifecycle>>;
    try {
    outcome = await runFalQueueLifecycle({
      endpoint,
      apiKey: falKey,
      payload,
      fetchFn: (url, options) => upstreamFetch(
        { provider: 'fal', route: req.path, model: endpoint, key: falKey },
        url,
        options,
      ),
      sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
      onStatus: (update) => {
        falJobId = update.requestId;
        if (update.done) return;
        updateVideoJobStatus({
          jobId: update.requestId, provider: 'fal',
          phase: update.status === 'IN_QUEUE' ? 'queued' : 'running',
          upstreamStatus: update.status, budgetMs: FAL_VIDEO_POLL_BUDGET_MS, cancelUrl: update.cancelUrl,
          credential: falKey,
          nodeId: canvasNodeId(req.body),
        });
      },
    });
    } finally {
      if (falJobId) clearVideoJobStatus(falJobId);
    }

    if (!outcome.ok) {
      if (outcome.status !== null) {
        // Real upstream answer (submit/status/result): pass status + raw body through verbatim.
        keyPoolManager.recordResult('fal', falKey, false, Date.now() - falVideoStart, outcome.body, outcome.status);
        let friendlyError = `AI 视频服务商执行失败 [${outcome.status}]: ${outcome.body}`;
        if (outcome.status === 403) {
          friendlyError = `Fal.ai 接口执行失败 [${outcome.status}]: ${outcome.body}`;
        }
        return res.status(outcome.status).json({
          error: friendlyError,
          upstreamStatus: outcome.status,
          rawResponse: outcome.body,
          errorSource: 'upstream',
          endpoint: outcome.url,
          queueStage: outcome.stage,
          ...(outcome.requestId ? { requestId: outcome.requestId } : {}),
        });
      }
      // Client-side timeout: report the request_id, never fabricate a result.
      keyPoolManager.recordResult('fal', falKey, false, Date.now() - falVideoStart, outcome.body);
      return res.status(504).json({
        error: `Fal.ai 视频队列等待超时: ${outcome.body}`,
        errorSource: 'local',
        endpoint: outcome.url,
        queueStage: outcome.stage,
        ...(outcome.requestId ? { requestId: outcome.requestId } : {}),
      });
    }

    keyPoolManager.recordResult('fal', falKey, true, Date.now() - falVideoStart);
    const vData = outcome.data;
    const videoUrl = vData.video?.url;
    if (!videoUrl) {
      return res.status(502).json({ error: 'AI 视频接口返回数据中未包含视频 URL (video.url)' });
    }

    const providerName = `Fal.ai (${endpoint})`;
    const usedVideoSeed = typeof vData.seed === 'number' ? vData.seed : (payload.seed ?? null);
    const durableVideo = await requireDurableHistoryMediaUrl(videoUrl);
    if (!durableVideo.ok) {
      return res.status(500).json({
        error: `Fal.ai 视频已生成，但无法下载并持久化为本地历史副本（data URL）: ${durableVideo.message}`,
        ...(durableVideo.status != null ? { persistStatus: durableVideo.status } : {}),
        transientMediaUrl: videoUrl,
      });
    }
    const durableVideoUrl = durableVideo.dataUrl;
    const item = await recordHistoryItem({
      url: durableVideoUrl,
      prompt,
      provider: providerName,
      model: endpoint,
      seed: usedVideoSeed,
      steps: isProvided(payload.num_inference_steps) ? Number(payload.num_inference_steps) : null,
      cfg: isProvided(payload.cfg_scale ?? payload.guide_scale ?? payload.guidance_scale) ? Number(payload.cfg_scale ?? payload.guide_scale ?? payload.guidance_scale) : null,
      requestMetadata: { beforeCustom: builtVideo.beforeCustom, customParameters: builtVideo.customParameters, overrides: builtVideo.overrides, actualParameters: payload, fieldStatus: builtVideo.fieldStatus },
    });

    return res.json({
      videoUrl: durableVideoUrl,
      provider: providerName,
      actualProvider: providerName,
      model: endpoint,
      actualModel: endpoint,
      requestedModel: model,
      exactEndpointCalled: upstreamEndpoint,
      seed: usedVideoSeed,
      historyItem: item,
    });
  } catch (error: any) {
    if (error?.clientDisconnected || (!res.writableEnded && res.destroyed)) return;
    if (!res.headersSent) return res.status(500).json({ error: `AI 视频生成失败: ${error.message}` });
  } finally {
    res.off('close', markClientClosed);
  }

  };
}

export function registerVideoGenerateRoutes(app: any, deps: VideoGenerateRouteDeps) {
  app.post(['/api/video/generate', '/api/engine/video/generate'], handleVideoGenerate(deps));
  app.post('/api/video/cancel', handleVideoCancel(deps));
  app.get('/api/video/status', (req: Request, res: ExpressResponse) => {
    const jobId = String(req.query.jobId || '').trim();
    const nodeId = String(req.query.nodeId || '').trim();
    if (!jobId && !nodeId) return res.status(400).json({ error: '状态查询需要 jobId 或 nodeId。', errorSource: 'local' });
    const snapshot = jobId ? readVideoJobStatus(jobId) : readVideoJobByNode(nodeId);
    if (!snapshot) return res.status(404).json({ error: '没有正在进行的视频任务状态。', jobId: jobId || undefined, nodeId: nodeId || undefined });
    res.json(snapshot);
  });
}

/**
 * Cancel one running video job. Sends the provider's documented cancel call and
 * returns its status and body unchanged. A provider with no documented cancel
 * gets 409 and no upstream request.
 */
export function handleVideoCancel(deps: Pick<VideoGenerateRouteDeps, 'upstreamFetch'>) {
  return async (req: Request, res: ExpressResponse) => {
    const jobId = String(req.body?.jobId || '').trim();
    if (!jobId) return res.status(400).json({ error: '取消需要 jobId。', errorSource: 'local' });
    const stored = readVideoJobStatus(jobId);
    if (!stored) return res.status(409).json({ error: '没有这条视频任务的服务端记录，没有发送取消请求。', errorSource: 'local', jobId, cancelled: false });
    const claimed = String(req.body?.provider || '').trim().toLowerCase();
    if (claimed && claimed !== stored.provider) {
      return res.status(409).json({ error: `取消请求的 provider=${claimed} 与任务记录的 ${stored.provider} 不一致，没有发送取消请求。`, errorSource: 'local', jobId, cancelled: false });
    }
    const provider = stored.provider;
    const plan = videoCancelPlan({ provider, jobId, cancelUrl: stored.cancelUrl });
    if ('unsupported' in plan) return res.status(409).json({ error: plan.unsupported, errorSource: 'local', provider, jobId, cancelled: false });
    const key = readVideoJobCredential(jobId) || '';
    const headers: Record<string, string> = {};
    if (plan.body) headers['Content-Type'] = 'application/json';
    if (provider === 'fal' && key) headers.Authorization = `Key ${key}`;
    if ((provider === 'replicate' || provider === 'civitai') && key) headers.Authorization = `Bearer ${key}`;
    if ((provider === 'krea' || provider === 'sogni') && key) headers.Authorization = `Bearer ${key}`;
    try {
      const upstream = await deps.upstreamFetch(
        { provider, route: '/api/video/cancel', model: jobId, key },
        plan.url,
        { method: plan.method, headers, ...(plan.body ? { body: JSON.stringify(plan.body) } : {}) },
      );
      const body = await upstream.text();
      return res.status(upstream.ok ? 200 : upstream.status).json({
        cancelled: upstream.ok,
        upstreamStatus: upstream.status,
        endpoint: plan.url,
        method: plan.method,
        rawResponse: body,
        errorSource: upstream.ok ? undefined : 'upstream',
        provider,
        jobId,
      });
    } catch (error: any) {
      return res.status(502).json({ error: `取消请求没有得到上游响应: ${error?.message || error}`, errorSource: 'network', endpoint: plan.url, provider, jobId, cancelled: false });
    }
  };
}

export { videoProgressLine };
