import type { Request, Response } from 'express';
import { buildSenseNovaImageRequest } from '../senseNovaImageContract';

export interface SenseNovaRouteDeps {
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
}

export function handleSenseNovaChat(deps: SenseNovaRouteDeps) {
  return async (req: Request, res: Response) => {
    const startTime = Date.now();
    const auth = deps.resolveProviderAuth(req, 'sensenova');
    if (auth.error) return res.status(400).json({ error: auth.error });

    try {
      const { messages = [], model, temperature, max_tokens } = req.body;
      if (!model) return res.status(400).json({ error: '模型为必填项（model is required）' });
      const chatPayload: Record<string, unknown> = {
        model,
        messages,
        ...(typeof temperature === 'number' ? { temperature } : {}),
        ...(typeof max_tokens === 'number' ? { max_tokens } : {}),
      };

      const upstream = await deps.upstreamFetch(
        { provider: 'sensenova', route: req.path, model, key: auth.apiKey },
        `${auth.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${auth.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(chatPayload),
        }
      );

      if (!upstream.ok) {
        const errorText = await upstream.text();
        deps.keyPoolManager.recordResult('sensenova', auth.apiKey, false, Date.now() - startTime, errorText, upstream.status);
        return res.status(upstream.status).json({ error: `SenseNova 深度推理失败 [${upstream.status}]: ${errorText}` });
      }

      deps.keyPoolManager.recordResult('sensenova', auth.apiKey, true, Date.now() - startTime);
      const data = await upstream.json();
      const message = data.choices?.[0]?.message;
      return res.json({
        content: message?.content || '',
        // SenseNova returns chain-of-thought in message.reasoning (not reasoning_content)
        reasoningContent: message?.reasoning || '',
        model: data.model || model,
        usage: data.usage,
      });
    } catch (error: any) {
      deps.keyPoolManager.recordResult('sensenova', auth.apiKey, false, Date.now() - startTime, error.message);
      return res.status(500).json({ error: `SenseNova 推理异常: ${error.message}` });
    }
  };
}

export function handleSenseNovaGenerate(deps: SenseNovaRouteDeps) {
  return async (req: Request, res: Response) => {
    const startTime = Date.now();
    let mapped: ReturnType<typeof buildSenseNovaImageRequest>;
    try {
      mapped = buildSenseNovaImageRequest(req.body || {});
    } catch (error: any) {
      return res.status(400).json({error: error.message, errorSource:'local', unsupported: 'see error'});
    }
    const auth = deps.resolveProviderAuth(req, 'sensenova');
    if (auth.error) return res.status(400).json({error:auth.error,errorSource:'local'});
    const {apiKey,baseUrl} = auth;
    const endpoint = `${baseUrl}${mapped.endpoint}`;
    try {
      const upstream = await deps.upstreamFetch(
        {provider:'sensenova',route:req.path,model:String(mapped.payload.model),key:apiKey},
        endpoint,
        {method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(mapped.payload)},
      );
      if (!upstream.ok) {
        const rawResponse = await upstream.text();
        deps.keyPoolManager.recordResult('sensenova',apiKey,false,Date.now()-startTime,rawResponse,upstream.status);
        return res.status(upstream.status).json({error:`SenseNova 图像接口上游 HTTP ${upstream.status}: ${rawResponse}`,upstreamStatus:upstream.status,errorSource:'upstream',endpoint,rawResponse,actualRequest:mapped.payload});
      }
      const data = await upstream.json();
      const images = Array.isArray(data?.data) ? data.data : [];
      if (!images.some((image: any) => (typeof image?.b64_json === 'string' && image.b64_json) || (typeof image?.url === 'string' && image.url))) {
        deps.keyPoolManager.recordResult('sensenova',apiKey,false,Date.now()-startTime,'upstream response missing image',502);
        return res.status(502).json({error:'SenseNova 上游返回成功状态但 data[] 不含 b64_json / url；不记图片成功',errorSource:'upstream',endpoint,rawResponse:data});
      }
      deps.keyPoolManager.recordResult('sensenova',apiKey,true,Date.now()-startTime);
      const sanitize = deps.sanitizeGenerationMetadata || ((v: any) => v);
      return await deps.respondWithGeneratedImages(res, images, {
        prompt:String(mapped.payload.prompt),
        provider:'SenseNova U1.5 Lite',
        model:mapped.actualModel,
        actualModel:mapped.actualModel,
        seed:null,steps:null,cfg:null,
        width:typeof req.body.width==='number'?req.body.width:null,
        height:typeof req.body.height==='number'?req.body.height:null,
        loras:[],
        requestMetadata:{requestedParameters:sanitize(Object.fromEntries(Object.entries(req.body).filter(([key]) => key !== 'workflowSnapshot'))),actualParameters:mapped.payload,overrides:mapped.overrides,upstreamEndpoint:endpoint},
      }, {
        label:'SenseNova',
        outputFormat:typeof mapped.payload.output_format === 'string' ? mapped.payload.output_format : 'png',
        response:{provider:'SenseNova',model:mapped.actualModel,requestedModel:req.body.model,actualModel:mapped.actualModel,seed:null,actualRequest:mapped.payload,overrides:mapped.overrides,upstreamEndpoint:endpoint},
      });
    } catch (error:any) {
      deps.keyPoolManager.recordResult('sensenova',apiKey,false,Date.now()-startTime,error.message);
      return res.status(502).json({error:`SenseNova 图像接口网络/协议错误：${error.message}`,errorSource:'network',endpoint,stack:error.stack});
    }
  };
}

export function registerSenseNovaRoutes(app: any, deps: SenseNovaRouteDeps) {
  app.post(['/api/engine/sensenova/chat', '/api/sensenova/chat'], handleSenseNovaChat(deps));
  app.post(['/api/engine/sensenova/generate', '/api/sensenova/generate'], handleSenseNovaGenerate(deps));
}
