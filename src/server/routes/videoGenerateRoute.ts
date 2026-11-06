import type { Request, Response as ExpressResponse } from 'express';
import { tamsVideoUnsupported } from '../../schemas/tensorModelApi.ts';
import { buildFalVideoRequest } from '../falVideoContract.ts';
import { falQueueOpenApiUrl, extractFalInputProperties, inlineFalItemRefs, FalSchemaMissingError, type FalSchemaFetchFailure } from '../falImageContract.ts';
import { FAL_VIDEO_POLL_BUDGET_MS, falQueueSubmitUrl, runFalQueueLifecycle } from '../falQueueLifecycle.ts';
import { buildAgnesVideoRequest, agnesVideoId } from '../agnesVideoRequest.ts';
import { classifyNanoGptVideoStatus, NANO_GPT_VIDEO_POLL_BUDGET_MS, NANO_GPT_VIDEO_POLL_INTERVAL_MS } from '../nanoGptVideoStatus.ts';
import { videoCancelPlan, videoProgressLine } from '../videoJobControl.ts';
import { canvasNodeId, clearVideoJobStatus, readVideoJobByNode, readVideoJobCredential, readVideoJobStatus, updateVideoJobStatus } from '../videoJobStatus.ts';
import { applyCustomParameters } from '../customParameters.ts';
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
  rejectSchemaEnum?: (
    res: ExpressResponse,
    provider: SchemaProvider,
    model: string,
    field: FieldKey,
    value: unknown,
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
      rejectSchemaEnum,
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

    if (!model) return res.status(400).json({ error: '模型为必填项（model is required）' });
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
      // TAMS numeric model IDs have no generic video job API → local refusal before key lookup or any upstream call.
      const tamsVideoRefusal = tamsVideoUnsupported(model);
      if (tamsVideoRefusal) return res.status(400).json({ error: tamsVideoRefusal, errorSource: 'local', provider: reqProvider, model });
      // OpenWorks video models are served by the generic schema provider `openworks` (POST /api/schema-provider/openworks/submit).
      return res.status(400).json({
        error: `Tensor.Art 视频路由只处理 TAMS；模型 ${model || '(空)'} 不是 TAMS 视频接口。OpenWorks 视频模型请在模型中心选择「Tensor.Art OpenWorks」服务商（通用 Schema 路由）。`,
        errorSource: 'local', provider: reqProvider, model,
      });
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
        if (forwardUnmappedFields(res, 'NanoGPT Video', req.body, ['loras'])) return;
        const nanoPayload: any = { model, prompt };
        if (isProvided(duration)) nanoPayload.duration = String(duration);
        if (isProvided(aspect_ratio)) nanoPayload.aspect_ratio = aspect_ratio;
        if (isProvided(seed)) nanoPayload.seed = Number(seed);
        if (isProvided(req.body.negative_prompt)) nanoPayload.negative_prompt = req.body.negative_prompt;
        if (isProvided(fps)) nanoPayload.frames_per_second = Number(fps);
        if (isProvided(req.body.num_frames)) nanoPayload.num_frames = Number(req.body.num_frames);
        if (isProvided(req.body.resolution)) nanoPayload.resolution = req.body.resolution;
        if (isProvided(steps)) nanoPayload.num_inference_steps = Number(steps);
        if (isProvided(req.body.cfg)) nanoPayload.cfg_scale = Number(req.body.cfg);
        else if (isProvided(req.body.guidance_scale)) nanoPayload.cfg_scale = Number(req.body.guidance_scale);
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
      if (forwardUnmappedFields(res, 'Agnes AI Video', req.body, ['negative_prompt', 'steps', 'cfg', 'guidance_scale', 'loras'])) return;

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
      if (forwardUnmappedFields(res, 'grok_compat', req.body, ['seed', 'negative_prompt', 'steps', 'cfg', 'guidance_scale', 'loras', 'width', 'height', 'fps'])) return;
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

    // ModelScope API-Inference has no video generation endpoint (Item 6) → explicit 400, never fall through to another provider.
    if (isModelScopeTarget) {
      return res.status(400).json({
        error: `ModelScope API-Inference 当前没有已接入的视频生成接口（model: ${model || '(空)'}）。本请求保持 provider=${reqProvider}。`,
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
