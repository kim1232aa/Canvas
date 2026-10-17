import type { Request, Response as ExpressResponse } from 'express';
import { tamsVideoUnsupported } from '../../schemas/tensorModelApi.ts';
import { buildFalVideoRequest } from '../falVideoContract.ts';
import { buildAgnesVideoRequest, agnesVideoId } from '../agnesVideoRequest.ts';
import { applyCustomParameters } from '../customParameters.ts';
import { sanitizeGenerationMetadata } from '../../utils/generationMetadata.ts';
import { resolveAgainstBaseOrigin } from '../../engines/compatRelay.ts';
import type { FieldKey, Provider as SchemaProvider } from '../../schemas/providerSchema.ts';

export interface VideoGenerateRouteDeps {
  isProvided: (v: any) => boolean;
  rejectUnsupported: (
    res: ExpressResponse,
    provider: string,
    body: any,
    fields: string[],
  ) => boolean;
  rejectSchemaEnum: (
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
  generationContext: {
    getStore: () => { traces: any[] } | undefined;
  };
}

export function handleVideoGenerate(deps: VideoGenerateRouteDeps) {
  return async (req: Request, res: ExpressResponse) => {
    const {
      isProvided,
      rejectUnsupported,
      rejectSchemaEnum,
      normalizeFalEndpoint,
      resolveProviderAuth,
      upstreamFetch,
      keyPoolManager,
      recordHistoryItem,
      requireDurableHistoryMediaUrl,
      generationContext,
    } = deps;

  try {
    // Some test/mocks omit setTimeout; only call when present. Value stays 300s.
    if (typeof (req as any).setTimeout === 'function') (req as any).setTimeout(300000);
    if (typeof (res as any).setTimeout === 'function') (res as any).setTimeout(300000);

    // Stop upstream polling when the browser disconnects (fail closed — no further upstream burns).
    let clientClosed = false;
    const markClientClosed = () => { clientClosed = true; };
    req.on('close', markClientClosed);
    const sleepOrAbort = (ms: number) => new Promise<void>((resolve, reject) => {
      if (clientClosed) {
        reject(Object.assign(new Error('client disconnected'), { clientDisconnected: true }));
        return;
      }
      let settled = false;
      let t: ReturnType<typeof setTimeout> | undefined;
      const onClose = () => finish(() => reject(Object.assign(new Error('client disconnected'), { clientDisconnected: true })));
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        if (t !== undefined) clearTimeout(t);
        req.off('close', onClose);
        fn();
      };
      t = setTimeout(() => {
        if (clientClosed) finish(() => reject(Object.assign(new Error('client disconnected'), { clientDisconnected: true })));
        else finish(() => resolve());
      }, ms);
      req.once('close', onClose);
    });

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
    const lowerModel = String(model).toLowerCase().trim();
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
    const byModel = false;

    // 1. Tensor.Art TAMS (OpenWorks video = schema provider `openworks`)
    const isTensorArtTarget =
      reqProvider === 'tensorart' ||
      reqProvider === 'tensor' ||
      (byModel && (
        lowerModel.startsWith('text2video_') ||
        lowerModel.startsWith('image2video_') ||
        lowerModel === 'live_wallpaper' ||
        lowerModel.includes('tensor')));

    if (isTensorArtTarget) {
      // TAMS numeric model IDs have no generic video job API → local refusal before key lookup or any upstream call.
      const tamsVideoRefusal = tamsVideoUnsupported(model);
      if (tamsVideoRefusal) return res.status(400).json({ error: tamsVideoRefusal, errorSource: 'local', provider: reqProvider, model });
      // OpenWorks video models are served by the generic schema provider `openworks` (POST /api/schema-provider/openworks/submit).
      return res.status(400).json({
        error: `Tensor.Art 视频路由只处理 TAMS；模型 ${model || '(空)'} 不是 TAMS 视频接口。OpenWorks 视频模型请在模型中心选择「Tensor.Art OpenWorks」服务商（通用 Schema 路由）。未出站，本地拦截。`,
        errorSource: 'local', provider: reqProvider, model,
      });
    }

    // 2. NanoGPT Video API (https://api.nano-gpt.com/api/generate-video)
    const isNanoGptTarget =
      reqProvider === 'nanogpt' ||
      (byModel && (
        lowerModel.includes('nanogpt') ||
        (lowerModel.includes('wan') && !lowerModel.includes('fal') && !lowerModel.includes('damo') && !lowerModel.includes('text2video')) ||
        (lowerModel.includes('kling') && !lowerModel.includes('fal'))));

    if (isNanoGptTarget) {
      const nanoKey = keyPoolManager.getNextKey('nanogpt', (req.headers['x-nanogpt-key'] as string) || undefined);
      if (!nanoKey) {
        return res.status(400).json({ error: '未配置 NanoGPT API Key (x-nanogpt-key)。' });
      }
      const startTime = Date.now();

      try {
        // NanoGPT video submit: POST api.nano-gpt.com/api/generate-video
        // duration is a STRING, seed/negative_prompt are passed through
        if (rejectUnsupported(res, 'NanoGPT Video', req.body, ['steps', 'cfg', 'guidance_scale', 'loras'])) return;
        const nanoPayload: any = { model, prompt };
        if (isProvided(duration)) nanoPayload.duration = String(duration);
        if (isProvided(aspect_ratio)) nanoPayload.aspect_ratio = aspect_ratio;
        if (isProvided(seed)) nanoPayload.seed = Number(seed);
        if (isProvided(req.body.negative_prompt)) nanoPayload.negative_prompt = req.body.negative_prompt;
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

        if (runId) {
          // Poll: GET /api/video/status?requestId= → data.status → COMPLETED/FAILED, data.output.video.url
          for (let i = 0; i < 70; i++) {
            if (clientClosed) {
              keyPoolManager.recordResult('nanogpt', nanoKey, false, Date.now() - startTime, 'client disconnected');
              return; // client gone — stop polling, do not keep burning upstream
            }
            try { await sleepOrAbort(2500); } catch (e: any) {
              if (e?.clientDisconnected) {
                keyPoolManager.recordResult('nanogpt', nanoKey, false, Date.now() - startTime, 'client disconnected');
                return;
              }
              throw e;
            }
            let statusRes: Response;
            try {
              statusRes = await upstreamFetch(
                { provider: 'nanogpt', route: 'video/poll', model, key: nanoKey },
                `${nanoOrigin}/api/video/status?requestId=${encodeURIComponent(runId)}`,
                { headers: { 'x-api-key': nanoKey } }
              );
            } catch (netErr: any) {
              keyPoolManager.recordResult('nanogpt', nanoKey, false, Date.now() - startTime, netErr.message);
              return res.status(502).json({ error: `NanoGPT 视频状态查询网络异常: ${netErr.message}`, runId });
            }

            if (!statusRes.ok) {
              const errBody = await statusRes.text().catch(() => '');
              keyPoolManager.recordResult('nanogpt', nanoKey, false, Date.now() - startTime, errBody, statusRes.status);
              return res.status(statusRes.status).json({
                error: `NanoGPT 视频状态查询失败 [${statusRes.status}]: ${errBody}`,
                runId,
              });
            }

            const statusData = await statusRes.json();
            const st = String(statusData.data?.status || statusData.status || '').toUpperCase();
            if (st === 'COMPLETED') {
              videoUrl = statusData.data?.output?.video?.url || statusData.data?.output?.url || '';
              break;
            } else if (st === 'FAILED' || st === 'CANCELED' || st === 'CANCELLED') {
              keyPoolManager.recordResult('nanogpt', nanoKey, false, Date.now() - startTime, statusData.data?.error || 'FAILED');
              return res.status(500).json({ error: `NanoGPT 视频生成失败: ${statusData.data?.error || statusData.data?.userFriendlyError || st}` });
            }
          }
        }

        if (!videoUrl) {
          keyPoolManager.recordResult('nanogpt', nanoKey, false, Date.now() - startTime, 'Polling timeout');
          return res.status(504).json({ error: 'NanoGPT 视频生成超时 (175s 未完成)，请稍后重试。' });
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
      } catch (nanoErr: any) {
        keyPoolManager.recordResult('nanogpt', nanoKey, false, Date.now() - startTime, nanoErr.message);
        return res.status(500).json({ error: `NanoGPT 视频接口请求异常: ${nanoErr.message}` });
      }
    }

    // 3. Agnes AI Video: POST /v1/videos → poll GET /agnesapi?video_id=&model_name=
    if (reqProvider === 'agnes' || (byModel && lowerModel.startsWith('agnes-video'))) {
      const auth = resolveProviderAuth(req, 'agnes');
      if (auth.error) return res.status(400).json({ error: auth.error });
      const { apiKey: agnesKey, baseUrl: agnesBaseUrl } = auth;
      const startTime = Date.now();
      if (rejectUnsupported(res, 'Agnes AI Video', req.body, ['negative_prompt', 'steps', 'cfg', 'guidance_scale', 'loras'])) return;

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
            keyPoolManager.recordResult('agnes', agnesKey, false, Date.now() - startTime, 'client disconnected');
            return;
          }
          try { await sleepOrAbort(5000); } catch (e: any) {
            if (e?.clientDisconnected) {
              keyPoolManager.recordResult('agnes', agnesKey, false, Date.now() - startTime, 'client disconnected');
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
    if (reqProvider === 'grok_compat' || (byModel && lowerModel.startsWith('grok-imagine-video'))) {
      const auth = resolveProviderAuth(req, 'grok_compat');
      if (auth.error) return res.status(400).json({ error: auth.error });
      const { apiKey: grokKey, baseUrl: grokBase } = auth;
      const startTime = Date.now();
      if (rejectUnsupported(res, 'grok_compat', req.body, ['seed', 'negative_prompt', 'steps', 'cfg', 'guidance_scale', 'loras', 'width', 'height', 'fps'])) return;
      const grokResolution = req.body.resolution;
      if (rejectSchemaEnum(res, 'grok_compat', model, 'aspect_ratio', aspect_ratio)) return;
      if (rejectSchemaEnum(res, 'grok_compat', model, 'resolution', grokResolution)) return;

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
            keyPoolManager.recordResult('grok_compat', grokKey, false, Date.now() - startTime, 'client disconnected');
            return;
          }
          try { await sleepOrAbort(3000); } catch (e: any) {
            if (e?.clientDisconnected) {
              keyPoolManager.recordResult('grok_compat', grokKey, false, Date.now() - startTime, 'client disconnected');
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
      reqProvider === 'modelscope_ai' ||
      (byModel && (
        lowerModel.startsWith('damo/') ||
        lowerModel.startsWith('modelscope') ||
        lowerModel.includes('cogvideox') ||
        (lowerModel.includes('wan2.1-t2v') && !lowerModel.includes('fal-ai')) ||
        (lowerModel.includes('wan2.1-i2v') && !lowerModel.includes('fal-ai'))));

    // ModelScope API-Inference has no video generation endpoint (Item 6) → explicit 400, never fall through to another provider.
    if (isModelScopeTarget) {
      return res.status(400).json({
        error: `ModelScope API-Inference 当前没有已接入的视频生成接口（model: ${model || '(空)'}）。本请求保持 provider=${reqProvider}，不会自动改用其他供应商。`,
      });
    }

    // 5. Fal.ai Video Engine — reached only for explicit provider=fal after the other explicit provider branches.
    if (reqProvider !== 'fal') {
      return res.status(400).json({ error: `视频 provider=${reqProvider} 没有匹配到已接入执行分支；拒绝回退到 Fal。` });
    }
    const falKey = keyPoolManager.getNextKey('fal', (req.headers['x-fal-key'] as string) || undefined) || '';

    if (!falKey) {
      return res.status(400).json({
        error: '未配置 Fal.ai 密钥。当前视频请求明确选择了 provider=fal；请配置有效 Fal.ai API Key。系统不会自动改用其他供应商。',
      });
    }

    // Guard against image models accidentally routed here
    if (
      (lowerModel.includes('flux') || lowerModel.includes('schnell') || lowerModel.includes('sdxl') || lowerModel.includes('dev')) &&
      !lowerModel.includes('video')
    ) {
      return res.status(400).json({
        error: `模型 "${model}" 是图像生成模型，而非 AI 视频生成大模型。生成视频请在视频节点中选择 Wan 2.1 (fal-ai/wan/v2.1/text-to-video) 或 LTX-Video。`,
      });
    }

    let endpoint = normalizeFalEndpoint(model, true);
    if (!endpoint) {
      return res.status(400).json({ error: `不认识这个模型: ${model}` });
    }

    let builtVideo;
    try { builtVideo = buildFalVideoRequest(endpoint, req.body); }
    catch (error: any) { return res.status(400).json({ error: error.message, errorSource: 'local' }); }
    const payload = builtVideo.payload;
    generationContext.getStore()?.traces.push(sanitizeGenerationMetadata({
      stage: 'parameter-mapping', provider: 'fal', endpoint,
      beforeCustom: builtVideo.beforeCustom, customParameters: builtVideo.customParameters,
      overrides: builtVideo.overrides, actualParameters: payload, fieldStatus: builtVideo.fieldStatus,
    }));

    const falVideoStart = Date.now();
    const upstreamResp = await upstreamFetch(
      { provider: 'fal', route: req.path, model: endpoint, key: falKey },
      `https://fal.run/${endpoint}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Key ${falKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    if (!upstreamResp.ok) {
      const errorText = await upstreamResp.text();
      keyPoolManager.recordResult('fal', falKey, false, Date.now() - falVideoStart, errorText, upstreamResp.status);
      let friendlyError = `AI 视频服务商执行失败 [${upstreamResp.status}]: ${errorText}`;
      if (upstreamResp.status === 403 || errorText.includes('Exhausted balance')) {
        friendlyError = `Fal.ai 接口执行失败 [403]: ${errorText}。当前请求保持 provider=fal，不会自动改用其他供应商。`;
      }
      return res.status(upstreamResp.status).json({
        error: friendlyError,
      });
    }

    keyPoolManager.recordResult('fal', falKey, true, Date.now() - falVideoStart);
    const vData = await upstreamResp.json();
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
      exactEndpointCalled: `https://fal.run/${endpoint}`,
      seed: usedVideoSeed,
      historyItem: item,
    });
  } catch (error: any) {
    if (error?.clientDisconnected || (typeof req.aborted === 'boolean' && req.aborted)) return;
    if (!res.headersSent) return res.status(500).json({ error: `AI 视频生成失败: ${error.message}` });
  }

  };
}

export function registerVideoGenerateRoutes(app: any, deps: VideoGenerateRouteDeps) {
  app.post(['/api/video/generate', '/api/engine/video/generate'], handleVideoGenerate(deps));
}
