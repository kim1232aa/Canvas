import type { Request, Response } from 'express';
import { buildMageImageRequest, parseMageRequestResponse, MAGE_DEFAULT_BASE } from '../mageImageContract';

export interface MageRouteDeps {
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
  sanitizeGenerationMetadata?: (value: any) => any;
  sleep?: (ms: number) => Promise<void>;
}

export function handleMageGenerate(deps: MageRouteDeps) {
  return async (req: Request, res: Response) => {
    const startTime = Date.now();
    const auth = deps.resolveProviderAuth(req, 'mage');
    if (auth.error) {
      return res.status(400).json({ error: auth.error, errorSource: 'local' });
    }
    const { apiKey, baseUrl } = auth;

    let mapped: ReturnType<typeof buildMageImageRequest>;
    try {
      mapped = buildMageImageRequest(req.body || {}, baseUrl || MAGE_DEFAULT_BASE);
    } catch (error: any) {
      return res.status(400).json({
        error: error.message,
        errorSource: 'local',
      });
    }

    const endpoint = mapped.endpoint;
    const actualRequest = mapped.payload;
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    try {
      const upstream = await deps.upstreamFetch(
        { provider: 'mage', route: req.path, model: mapped.actualModel, key: apiKey },
        endpoint,
        { method: 'POST', headers, body: JSON.stringify(mapped.payload) }
      );

      if (!upstream.ok) {
        const rawResponse = await upstream.text().catch(() => '');
        deps.keyPoolManager.recordResult(
          'mage',
          apiKey,
          false,
          Date.now() - startTime,
          rawResponse,
          upstream.status
        );
        return res.status(upstream.status).json({
          error: `Mage 图像接口上游 HTTP ${upstream.status}: ${rawResponse}`,
          upstreamStatus: upstream.status,
          errorSource: 'upstream',
          endpoint,
          rawResponse,
          actualRequest,
          passThroughFields: mapped.passThroughFields,
          schemaFields: mapped.schemaFields,
        });
      }

      const upstreamRaw = await upstream.text();
      let data: any;
      try {
        data = JSON.parse(upstreamRaw);
      } catch (parseErr: any) {
        const error = `Mage 上游 JSON 解析失败: ${parseErr.message}`;
        deps.keyPoolManager.recordResult('mage', apiKey, false, Date.now() - startTime, error, upstream.status);
        return res.status(502).json({
          error,
          upstreamStatus: upstream.status,
          errorSource: 'upstream',
          endpoint,
          rawResponse: upstreamRaw,
          actualRequest,
          passThroughFields: mapped.passThroughFields,
          schemaFields: mapped.schemaFields,
        });
      }
      let parsed: ReturnType<typeof parseMageRequestResponse>;
      try {
        parsed = parseMageRequestResponse(data);
      } catch (parseErr: any) {
        deps.keyPoolManager.recordResult('mage', apiKey, false, Date.now() - startTime, parseErr.message, upstream.status);
        return res.status(502).json({
          error: parseErr.message,
          upstreamStatus: upstream.status,
          errorSource: 'upstream',
          endpoint,
          rawResponse: upstreamRaw,
          actualRequest,
          passThroughFields: mapped.passThroughFields,
          schemaFields: mapped.schemaFields,
        });
      }

      const sleep = deps.sleep || ((ms: number) => new Promise((r) => setTimeout(r, ms)));
      const pollStartTime = Date.now();
      const maxPollDuration = 60000;
      let pollData: any = data;

      if (parsed.isPending) {
        const pollUrl =
          parsed.statusUrl ||
          (parsed.requestId
            ? `${(baseUrl || MAGE_DEFAULT_BASE).replace(/\/+$/, '')}/v1/requests/${parsed.requestId}/status`
            : '');
        if (!pollUrl) {
          deps.keyPoolManager.recordResult('mage', apiKey, false, Date.now() - startTime, 'missing status_url', 502);
          return res.status(502).json({
            error: 'Mage 返回异步任务但缺少 status_url / request_id',
            errorSource: 'upstream',
            endpoint,
            rawResponse: data,
            actualRequest,
            passThroughFields: mapped.passThroughFields,
            schemaFields: mapped.schemaFields,
          });
        }

        while (parsed.isPending && Date.now() - pollStartTime < maxPollDuration) {
          await sleep(1000);
          let pollResp: any;
          try {
            pollResp = await deps.upstreamFetch(
              { provider: 'mage', route: req.path, model: mapped.actualModel, key: apiKey },
              pollUrl,
              { method: 'GET', headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' } }
            );
          } catch (pollNetErr: any) {
            deps.keyPoolManager.recordResult('mage', apiKey, false, Date.now() - startTime, pollNetErr.message);
            return res.status(502).json({
              error: `Mage 轮询网络/协议错误: ${pollNetErr.message}`,
              errorSource: 'network',
              endpoint: pollUrl,
              actualRequest,
              passThroughFields: mapped.passThroughFields,
              schemaFields: mapped.schemaFields,
              stack: pollNetErr.stack,
            });
          }

          if (!pollResp.ok) {
            const pollErrText = await pollResp.text().catch(() => '');
            deps.keyPoolManager.recordResult(
              'mage',
              apiKey,
              false,
              Date.now() - startTime,
              pollErrText,
              pollResp.status
            );
            return res.status(pollResp.status).json({
              error: `Mage 轮询 HTTP ${pollResp.status}: ${pollErrText}`,
              upstreamStatus: pollResp.status,
              errorSource: 'upstream',
              rawResponse: pollErrText,
              endpoint: pollUrl,
              actualRequest,
              passThroughFields: mapped.passThroughFields,
              schemaFields: mapped.schemaFields,
            });
          }

          const pollRaw = await pollResp.text();
          try {
            pollData = JSON.parse(pollRaw);
          } catch (pollJsonErr: any) {
            const error = `Mage 轮询上游 JSON 解析失败: ${pollJsonErr.message}`;
            deps.keyPoolManager.recordResult('mage', apiKey, false, Date.now() - startTime, error, pollResp.status);
            return res.status(502).json({
              error,
              upstreamStatus: pollResp.status,
              errorSource: 'upstream',
              endpoint: pollUrl,
              rawResponse: pollRaw,
              actualRequest,
              passThroughFields: mapped.passThroughFields,
              schemaFields: mapped.schemaFields,
            });
          }
          try {
            parsed = parseMageRequestResponse(pollData);
          } catch (pollParseErr: any) {
            deps.keyPoolManager.recordResult('mage', apiKey, false, Date.now() - startTime, pollParseErr.message, pollResp.status);
            return res.status(502).json({
              error: pollParseErr.message,
              upstreamStatus: pollResp.status,
              errorSource: 'upstream',
              endpoint: pollUrl,
              rawResponse: pollRaw,
              actualRequest,
              passThroughFields: mapped.passThroughFields,
              schemaFields: mapped.schemaFields,
            });
          }
        }

        if (parsed.isPending) {
          const timeoutMsg = 'Mage 图像生成超时 (60s)';
          deps.keyPoolManager.recordResult('mage', apiKey, false, Date.now() - startTime, timeoutMsg, 504);
          return res.status(504).json({
            error: timeoutMsg,
            errorSource: 'upstream',
            endpoint: pollUrl,
            rawResponse: pollData,
            actualRequest,
            passThroughFields: mapped.passThroughFields,
            schemaFields: mapped.schemaFields,
          });
        }
      }

      if (parsed.status !== 'completed' || !parsed.imageUrl) {
        deps.keyPoolManager.recordResult('mage', apiKey, false, Date.now() - startTime, '未成功生成', 502);
        return res.status(502).json({
          error: 'Mage 任务未成功完成',
          errorSource: 'upstream',
          endpoint,
          rawResponse: pollData,
          actualRequest,
          passThroughFields: mapped.passThroughFields,
          schemaFields: mapped.schemaFields,
        });
      }

      deps.keyPoolManager.recordResult('mage', apiKey, true, Date.now() - startTime);
      const sanitize = deps.sanitizeGenerationMetadata || ((v: any) => v);

      return await deps.respondWithGeneratedImages(
        res,
        [parsed.imageUrl],
        {
          prompt: String(actualRequest.prompt || req.body?.prompt || ''),
          provider: 'Mage',
          model: mapped.actualModel,
          actualModel: mapped.actualModel,
          seed: typeof actualRequest.seed === 'number' ? actualRequest.seed : parsed.seed ?? null,
          steps: null,
          cfg: null,
          // Official Request.result.width/height = upstream actual output pixels (not the canvas value).
          width: parsed.width ?? null,
          height: parsed.height ?? null,
          loras: [],
          requestMetadata: {
            requestedParameters: sanitize(
              Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => k !== 'workflowSnapshot'))
            ),
            actualParameters: actualRequest,
            schemaFields: mapped.schemaFields,
            passThroughFields: mapped.passThroughFields,
            ...(parsed.width && parsed.height ? { effectiveParameters: { width: parsed.width, height: parsed.height } } : {}),
            overrides: mapped.overrides,
            upstreamEndpoint: endpoint,
          },
        },
        {
          label: 'Mage',
          response: {
            provider: 'Mage',
            model: mapped.actualModel,
            requestedModel: req.body?.model || req.body?.model_id,
            actualModel: mapped.actualModel,
            requestId: parsed.requestId ?? null,
            actualRequest,
            passThroughFields: mapped.passThroughFields,
            schemaFields: mapped.schemaFields,
            overrides: mapped.overrides,
            upstreamEndpoint: endpoint,
          },
        }
      );
    } catch (error: any) {
      deps.keyPoolManager.recordResult('mage', apiKey, false, Date.now() - startTime, error.message);
      return res.status(502).json({
        error: `Mage 图像接口网络/协议错误：${error.message}`,
        errorSource: 'network',
        endpoint,
        stack: error.stack,
      });
    }
  };
}

export function registerMageRoutes(app: any, deps: MageRouteDeps) {
  const generateHandler = handleMageGenerate(deps);
  app.post(['/api/engine/mage/generate', '/api/mage/generate'], generateHandler);
}
