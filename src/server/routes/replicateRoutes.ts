import type { Request, Response } from 'express';
import {
  buildReplicatePredictionRequest,
  parseReplicatePredictionResponse,
  parseReplicateModelRef,
  extractReplicateInputProperties,
  extractReplicateModelRoute,
  type ReplicateLiveModelRoute,
  ReplicateSchemaMissingError,
  type ReplicateSchemaFetchFailure,
} from '../replicateImageContract';
import { clearVideoJobStatus, updateVideoJobStatus } from '../videoJobStatus.ts';

export interface ReplicateRouteDeps {
  resolveProviderAuth: (
    req: Request,
    provider: any
  ) => { apiKey: string; baseUrl: string; error?: string };
  upstreamFetch: (meta: any, url: string, options?: any) => Promise<any>;
  keyPoolManager: {
    recordResult: (
      provider: string,
      key: string,
      success: boolean,
      latencyMs?: number,
      lastError?: string,
      statusCode?: number
    ) => void;
  };
  respondWithGeneratedImages: (
    res: Response,
    images: unknown[],
    metadata: any,
    options: any
  ) => Promise<any>;
  recordHistoryItem?: (item: any) => any;
  sanitizeGenerationMetadata?: (value: any) => any;
  sleep?: (ms: number) => Promise<void>;
}

export function handleReplicateGenerate(deps: ReplicateRouteDeps) {
  return async (req: Request, res: Response) => {
    const startTime = Date.now();
    const auth = deps.resolveProviderAuth(req, 'replicate');
    if (auth.error) {
      return res.status(400).json({ error: auth.error, errorSource: 'local' });
    }
    const { apiKey, baseUrl } = auth;

    const reqBody = (req.body || {}) as Record<string, any>;
    let liveProps: Record<string, unknown> | undefined;
    let schemaFetch: ReplicateSchemaFetchFailure | undefined;
    let liveModel: ReplicateLiveModelRoute | undefined;
    const hasClientProps = reqBody.inputSchemaProperties && typeof reqBody.inputSchemaProperties === 'object' && !Array.isArray(reqBody.inputSchemaProperties);
    if (reqBody.model) {
      // Generic live-schema lookup (visible GET in executionTrace); no model-name branches.
      const ref = parseReplicateModelRef(String(reqBody.model));
      const explicitVersion = ref.version || (typeof reqBody.version === 'string' ? reqBody.version.trim() : '');
      // Exact-version schema lookup is possible only when the request identifies its owner/name.
      // A bare version hash remains usable with caller-provided schema properties.
      const mustReadPinnedVersionSchema = Boolean(explicitVersion && ref.owner && ref.name);
      const cleanBase = baseUrl.replace(/\/+$/, '');
      const schemaUrl = ref.owner && ref.name
        ? `${cleanBase}/models/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.name)}${explicitVersion ? `/versions/${encodeURIComponent(explicitVersion)}` : ''}`
        : null;
      // ALWAYS read live openapi_schema for outbound when we can form a schema URL, unless this
      // request already carries inputSchemaProperties from /api/model-schema (reuse). A pinned
      // version still forces the exact-version GET. Static PROVIDER_SCHEMA must NEVER skip live.
      // Unpinned owner/name: the model GET also decides the route (is_official / latest_version), so always read it.
      const needsRouteInfo = Boolean(ref.owner && ref.name && !explicitVersion);
      const shouldReadLiveSchema = Boolean(schemaUrl) && (mustReadPinnedVersionSchema || !hasClientProps || needsRouteInfo);
      if (shouldReadLiveSchema && schemaUrl) {
        try {
          const sr = await deps.upstreamFetch(
            { provider: 'replicate', route: req.path, model: String(reqBody.model), key: apiKey },
            schemaUrl,
            { method: 'GET', headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' } }
          );
          const raw = await sr.text().catch(() => '');
          if (!sr.ok) {
            schemaFetch = { url: schemaUrl, status: sr.status, body: raw };
          } else {
            let parsedSchema: unknown;
            try { parsedSchema = JSON.parse(raw); } catch { parsedSchema = undefined; }
            if (needsRouteInfo) liveModel = extractReplicateModelRoute(parsedSchema);
            if (!hasClientProps || mustReadPinnedVersionSchema) liveProps = extractReplicateInputProperties(parsedSchema);
            if (!liveProps && !hasClientProps) schemaFetch = { url: schemaUrl, status: sr.status, body: raw };
          }
        } catch (e: any) {
          schemaFetch = { url: schemaUrl, status: null, body: String(e?.message || e) };
        }
      }
      // Fail closed: live (or caller-supplied) schema required for outbound. Static table is UI clue only —
      // never authorize /predictions from a stale PROVIDER_SCHEMA row alone.
      if (!liveProps && !hasClientProps && schemaFetch) console.warn(`[replicate] schema GET ${schemaFetch.url} → ${schemaFetch.status ?? 'network'} ${schemaFetch.body}`);
    }

    const schemaSource = liveProps
      ? 'replicate-live-schema'
      : hasClientProps
        ? 'caller-inputSchemaProperties'
        : 'unknown';
    const schemaValidation = liveProps
      ? 'live schema loaded for the requested model/version'
      : hasClientProps
        ? 'caller-supplied schema; not verified against the requested version'
        : 'unknown';

    let mapped: ReturnType<typeof buildReplicatePredictionRequest>;
    try {
      mapped = buildReplicatePredictionRequest(reqBody, baseUrl, liveProps, schemaFetch, liveModel);
    } catch (error: any) {
      if (error instanceof ReplicateSchemaMissingError) {
        const sf = error.schemaFetch;
        const upstreamAnswered = Boolean(sf && sf.status !== null && (sf.status < 200 || sf.status >= 300));
        return res.status(error.httpStatus).json({
          error: error.message,
          errorSource: upstreamAnswered ? 'upstream' : sf && sf.status === null ? 'network' : 'local',
          upstreamStatus: sf?.status ?? null,
          blocked: 'schema_missing',
          model: error.model,
          schemaFetch: error.schemaFetch ?? null,
          actualRequest: null,
          notSent: true,
        });
      }
      // 「拟发送（未出站）」 = the Schema-mapped body from the same builder a real submit uses. If the rejection came from the
      // custom JSON itself, the proposal is built without it and says so explicitly (customParametersExcluded).
      let proposedRequest: Record<string, unknown> | undefined;
      let excluded: string | undefined;
      let preview: ReturnType<typeof buildReplicatePredictionRequest> | undefined;
      try { preview = buildReplicatePredictionRequest(reqBody, baseUrl, liveProps, schemaFetch, liveModel); } catch {
        if (reqBody.custom_parameters !== undefined) {
          try { preview = buildReplicatePredictionRequest({ ...reqBody, custom_parameters: undefined }, baseUrl, liveProps, schemaFetch, liveModel); excluded = error.message; } catch { /* no buildable proposal: card shows raw canvas snapshot */ }
        }
      }
      if (preview) {
        const loras = Array.isArray(reqBody.loras) ? reqBody.loras : [];
        proposedRequest = {
          endpoint: preview.endpoint, parameters: preview.payload, mapping: preview.omitted ?? [],
          ...(preview.schemaFields ? { schemaFields: preview.schemaFields } : {}),
          ...(excluded ? { customParametersExcluded: excluded } : {}),
          ...(loras.length ? { requestedLoras: loras.map((l: any) => ({ name: String(l?.path || l?.url || l?.civitaiId || l?.name || ''), strength: l?.strength ?? l?.modelStrength ?? null })) } : {}),
        };
      }
      return res.status(400).json({ error: error.message, errorSource: 'local', ...(proposedRequest ? { proposedRequest, schemaFields: proposedRequest.schemaFields } : {}) });
    }

    const endpoint = mapped.endpoint;
    const actualRequest = mapped.payload;
    const headers = {
      ...mapped.headers,
      Authorization: `Bearer ${apiKey}`,
    };

    try {
      const upstream = await deps.upstreamFetch(
        { provider: 'replicate', route: req.path, model: mapped.actualModel, key: apiKey },
        endpoint,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(mapped.payload),
        }
      );

      if (!upstream.ok) {
        const rawResponse = await upstream.text().catch(() => '');
        deps.keyPoolManager.recordResult(
          'replicate',
          apiKey,
          false,
          Date.now() - startTime,
          rawResponse,
          upstream.status
        );
        return res.status(upstream.status).json({
          error: `Replicate ${reqBody.isVideo ? '视频' : '图像'}接口上游 HTTP ${upstream.status}: ${rawResponse}`,
          upstreamStatus: upstream.status,
          errorSource: 'upstream',
          endpoint,
          rawResponse,
          actualRequest,
          parameterOmissions: mapped.omitted,
            schemaFields: mapped.schemaFields,
        });
      }

      const upstreamRaw = await upstream.text();
      let data: any;
      try {
        data = JSON.parse(upstreamRaw);
      } catch (parseErr: any) {
        const error = `Replicate 上游 JSON 解析失败: ${parseErr.message}`;
        deps.keyPoolManager.recordResult('replicate', apiKey, false, Date.now() - startTime, error, upstream.status);
        return res.status(502).json({
          error,
          upstreamStatus: upstream.status,
          errorSource: 'upstream',
          endpoint,
          rawResponse: upstreamRaw,
          actualRequest,
          parameterOmissions: mapped.omitted,
          schemaFields: mapped.schemaFields,
        });
      }
      let parsed: ReturnType<typeof parseReplicatePredictionResponse>;
      try {
        parsed = parseReplicatePredictionResponse(data, baseUrl);
      } catch (parseErr: any) {
        deps.keyPoolManager.recordResult('replicate', apiKey, false, Date.now() - startTime, parseErr.message, upstream.status);
        return res.status(502).json({
          error: parseErr.message,
          upstreamStatus: upstream.status,
          errorSource: 'upstream',
          endpoint,
          rawResponse: upstreamRaw,
          actualRequest,
        });
      }

      const sleep = deps.sleep || ((ms: number) => new Promise((r) => setTimeout(r, ms)));
      const pollStartTime = Date.now();
      // Video predictions run for minutes; images keep the 60s window.
      const isVideo = reqBody.isVideo === true;
      const maxPollDuration = isVideo ? 10 * 60 * 1000 : 60000;
      let pollData: any = data;

      if (parsed.isPending) {
        const pollUrl = parsed.pollUrl || `${baseUrl.replace(/\/+$/, '')}/predictions/${parsed.predictionId}`;
        const noteReplicate = () => {
          if (!isVideo || !parsed.predictionId) return;
          updateVideoJobStatus({ jobId: parsed.predictionId, provider: 'replicate', phase: 'running', upstreamStatus: parsed.status, budgetMs: maxPollDuration });
        };
        noteReplicate();
        while (parsed.isPending && Date.now() - pollStartTime < maxPollDuration) {
          await sleep(1000);
          let pollResp: any;
          try {
            pollResp = await deps.upstreamFetch(
              { provider: 'replicate', route: req.path, model: mapped.actualModel, key: apiKey },
              pollUrl,
              {
                method: 'GET',
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  Accept: 'application/json',
                },
              }
            );
          } catch (pollNetErr: any) {
            deps.keyPoolManager.recordResult(
              'replicate',
              apiKey,
              false,
              Date.now() - startTime,
              pollNetErr.message
            );
            return res.status(502).json({
              error: `Replicate 轮询网络/协议错误: ${pollNetErr.message}`,
              errorSource: 'network',
              endpoint: pollUrl,
              actualRequest,
              stack: pollNetErr.stack,
            });
          }

          if (!pollResp.ok) {
            const pollErrText = await pollResp.text().catch(() => '');
            const pollErrMsg = `Replicate 轮询 HTTP ${pollResp.status}: ${pollErrText}`;
            deps.keyPoolManager.recordResult(
              'replicate',
              apiKey,
              false,
              Date.now() - startTime,
              pollErrText,
              pollResp.status
            );
            return res.status(pollResp.status).json({
              error: pollErrMsg,
              upstreamStatus: pollResp.status,
              errorSource: 'upstream',
              rawResponse: pollErrText,
              endpoint: pollUrl,
              actualRequest,
            });
          }

          const pollRaw = await pollResp.text();
          try {
            pollData = JSON.parse(pollRaw);
          } catch (pollJsonErr: any) {
            const error = `Replicate 轮询上游 JSON 解析失败: ${pollJsonErr.message}`;
            deps.keyPoolManager.recordResult('replicate', apiKey, false, Date.now() - startTime, error, pollResp.status);
            return res.status(502).json({
              error,
              upstreamStatus: pollResp.status,
              errorSource: 'upstream',
              endpoint: pollUrl,
              rawResponse: pollRaw,
              actualRequest,
            });
          }
          try {
            parsed = parseReplicatePredictionResponse(pollData);
            noteReplicate();
          } catch (pollParseErr: any) {
            if (isVideo && parsed.predictionId) clearVideoJobStatus(parsed.predictionId);
            const errMsg = `Replicate 任务失败: ${pollParseErr.message}`;
            deps.keyPoolManager.recordResult('replicate', apiKey, false, Date.now() - startTime, errMsg, pollResp.status);
            return res.status(502).json({
              error: errMsg,
              upstreamStatus: pollResp.status,
              errorSource: 'upstream',
              endpoint: pollUrl,
              rawResponse: pollRaw,
              actualRequest,
            });
          }
        }

        if (parsed.isPending) {
          if (isVideo && parsed.predictionId) clearVideoJobStatus(parsed.predictionId);
          const timeoutMsg = isVideo ? 'Replicate 视频生成超时 (10min)' : 'Replicate 图像生成超时 (60s)';
          deps.keyPoolManager.recordResult('replicate', apiKey, false, Date.now() - startTime, timeoutMsg, 504);
          return res.status(504).json({
            error: timeoutMsg,
            errorSource: 'upstream',
            endpoint: pollUrl,
            rawResponse: pollData,
            actualRequest,
          });
        }
      }

      if (parsed.status !== 'succeeded') {
        deps.keyPoolManager.recordResult('replicate', apiKey, false, Date.now() - startTime, '未成功生成', 502);
        return res.status(502).json({
          error: 'Replicate 任务未成功完成',
          errorSource: 'upstream',
          endpoint,
          actualRequest,
        });
      }

      const imageUrls = parsed.imageUrls?.length ? parsed.imageUrls : [parsed.imageUrl];
      if (isVideo && parsed.predictionId) clearVideoJobStatus(parsed.predictionId);
      deps.keyPoolManager.recordResult('replicate', apiKey, true, Date.now() - startTime);

      const inputObj = (mapped.payload.input as Record<string, any>) || {};
      const sanitize = deps.sanitizeGenerationMetadata || ((v: any) => v);
      const primaryLoraName = inputObj.lora_weights || inputObj.hf_lora;

      return await deps.respondWithGeneratedImages(
        res,
        imageUrls,
        {
          prompt: String(inputObj.prompt || req.body?.prompt || ''),
          negativePrompt: typeof inputObj.negative_prompt === 'string' ? inputObj.negative_prompt : undefined,
          provider: 'Replicate',
          model: mapped.actualModel,
          actualModel: mapped.actualModel,
          seed: typeof inputObj.seed === 'number' ? inputObj.seed : null,
          steps: typeof inputObj.num_inference_steps === 'number' ? inputObj.num_inference_steps : null,
          cfg:
            typeof inputObj.guidance === 'number'
              ? inputObj.guidance
              : typeof inputObj.guidance_scale === 'number'
              ? inputObj.guidance_scale
              : null,
          width: typeof inputObj.width === 'number' ? inputObj.width : null,
          height: typeof inputObj.height === 'number' ? inputObj.height : null,
          loras: primaryLoraName
            ? [{ name: primaryLoraName, strength: typeof inputObj.lora_scale === 'number' ? inputObj.lora_scale : null }]
            : [],
          requestMetadata: {
            requestedParameters: sanitize(
              Object.fromEntries(
                Object.entries(req.body || {}).filter(([k]) => k !== 'workflowSnapshot')
              )
            ),
            actualParameters: actualRequest,
            overrides: mapped.overrides,
            parameterOmissions: mapped.omitted,
            schemaFields: mapped.schemaFields,
            schemaSource,
            schemaValidation,
            schemaFetch: schemaFetch ?? null,
            upstreamEndpoint: endpoint,
          },
        },
        {
          label: 'Replicate',
          response: {
            provider: 'Replicate',
            model: mapped.actualModel,
            requestedModel: req.body?.model,
            actualModel: mapped.actualModel,
            predictionId: parsed.predictionId ?? null,
            actualRequest,
            overrides: mapped.overrides,
            parameterOmissions: mapped.omitted,
            schemaFields: mapped.schemaFields,
            schemaSource,
            schemaValidation,
            schemaFetch: schemaFetch ?? null,
            upstreamEndpoint: endpoint,
          },
        }
      );
    } catch (error: any) {
      deps.keyPoolManager.recordResult('replicate', apiKey, false, Date.now() - startTime, error.message);
      return res.status(502).json({
        error: `Replicate ${reqBody.isVideo ? '视频' : '图像'}接口网络/协议错误：${error.message}`,
        errorSource: 'network',
        endpoint,
        stack: error.stack,
      });
    }
  };
}

export function handleReplicateModelInfo(deps: ReplicateRouteDeps) {
  return async (req: Request, res: Response) => {
    try {
      let modelParam = String(req.query.model || req.query.name || '').trim();
      let ownerParam = String(req.query.owner || '').trim();

      if (!ownerParam && modelParam.includes('/')) {
        const parts = modelParam.split('/');
        ownerParam = parts[0];
        modelParam = parts[1].split(':')[0];
      }

      if (!ownerParam || !modelParam) {
        return res.status(400).json({
          error: 'owner 和 name (或 model=owner/name) 为必填参数',
          errorSource: 'local',
        });
      }

      const auth = deps.resolveProviderAuth(req, 'replicate');
      if (auth.error) {
        return res.status(400).json({ error: auth.error, errorSource: 'local' });
      }
      const { apiKey, baseUrl } = auth;
      const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
      const targetUrl = `${cleanBaseUrl}/models/${encodeURIComponent(ownerParam)}/${encodeURIComponent(modelParam)}`;

      const upstream = await deps.upstreamFetch(
        { provider: 'replicate', route: req.path, model: `${ownerParam}/${modelParam}`, key: apiKey },
        targetUrl,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
          },
        }
      );

      if (!upstream.ok) {
        const raw = await upstream.text().catch(() => '');
        return res.status(upstream.status).json({
          error: `Replicate 模型查询失败 [${upstream.status}]: ${raw}`,
          upstreamStatus: upstream.status,
          errorSource: 'upstream',
        });
      }

      const data = await upstream.json().catch(() => ({}));
      return res.json(data);
    } catch (err: any) {
      return res.status(502).json({
        error: `Replicate 模型查询网络异常: ${err.message}`,
        errorSource: 'network',
      });
    }
  };
}

export function registerReplicateRoutes(app: any, deps: ReplicateRouteDeps) {
  const generateHandler = handleReplicateGenerate(deps);
  app.post(['/api/engine/replicate/generate', '/api/replicate/generate'], generateHandler);
  app.get('/api/replicate/model-info', handleReplicateModelInfo(deps));
}
