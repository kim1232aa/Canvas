import type { Request, Response } from 'express';
import { isOpenWorksAccessKey, pickTamsBearerKey, TAMS_BEARER_REQUIRED_HINT } from '../../schemas/tensorArtCredentials.ts';

export interface CivitaiModelRouteDeps {
  getSettings: () => Record<string, any>;
  defaultKeys: Record<string, string>;
  upstreamFetch: (meta: any, url: string, options?: any) => Promise<any>;
}

const civitaiCache = new Map<string, { data: any; expiry: number; nextCursor?: string | null }>();

export function handleCivitaiModels(deps: CivitaiModelRouteDeps) {
  return async (req: Request, res: Response) => {
    try {
      const { query = '', types = 'LORA', sort = 'Highest Rated', limit = '16', page = '1', nsfw = 'false', cursor = '' } = req.query;
      const cloudSettings = deps.getSettings();
      const apiKey =
        (req.headers['x-civitai-key'] as string) ||
        (req.headers['x-civitai-token'] as string) ||
        cloudSettings['civitaiToken'] ||
        process.env.CIVITAI_API_KEY ||
        '';

      const params = new URLSearchParams({
        limit: String(limit),
        types: String(types),
        sort: String(sort),
        nsfw: String(nsfw),
      });

      if (cursor) {
        params.append('cursor', String(cursor));
      } else if (query) {
        params.append('query', String(query));
      } else if (page) {
        params.append('page', String(page));
      }

      const cacheKey = `civitai_models_${params.toString()}_${apiKey ? 'auth' : 'anon'}`;
      const cached = civitaiCache.get(cacheKey);
      if (cached && cached.expiry > Date.now()) {
        return res.json(cached.data);
      }

      const headers: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        Accept: 'application/json',
      };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const targetEndpoint = `https://civitai.com/api/v1/models?${params.toString()}`;
      const response = await deps.upstreamFetch(
        { provider: 'civitai', route: req.path, key: apiKey },
        targetEndpoint,
        {
          headers,
          signal: AbortSignal.timeout(30000),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({
          error: `Civitai API error: ${response.status}`,
          details: errText,
          rawResponse: errText,
          endpoint: targetEndpoint,
          status: response.status,
          errorSource: 'upstream',
        });
      }

      const rawText = await response.text();
      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch (parseErr: any) {
        return res.status(502).json({
          error: `Civitai 模型列表上游响应 JSON 解析失败: ${parseErr.message}`,
          status: response.status || 502,
          endpoint: targetEndpoint,
          rawResponse: rawText,
          errorSource: 'upstream',
          stack: parseErr.stack,
        });
      }
      civitaiCache.set(cacheKey, { data, expiry: Date.now() + 60000 });
      return res.json(data);
    } catch (error: any) {
      const isTimeout =
        error.name === 'TimeoutError' ||
        error.message?.includes('timeout') ||
        error.message?.includes('aborted');
      console.warn(`[Civitai Proxy] 获取${isTimeout ? '超时 (30s)' : '失败'}:`, error.message);
      return res.status(504).json({
        error: isTimeout
          ? 'Civitai API 请求超时 (上游 Cloudflare 响应过慢，请稍后重试或配置 Civitai API Key)'
          : error.message || 'Failed to fetch from Civitai',
        errorSource: 'network',
        stack: error.stack,
      });
    }
  };
}

export function handleHuggingFaceModelInfo(deps: CivitaiModelRouteDeps) {
  return async (req: Request, res: Response) => {
    try {
      const modelId = String(req.query.modelId || '').trim();
      if (!modelId) {
        return res.status(400).json({ error: '缺少 modelId 参数', errorSource: 'local' });
      }
      const cloudSettings = deps.getSettings();
      const hfToken =
        (req.headers['x-hf-token'] as string) ||
        cloudSettings['hfToken'] ||
        deps.defaultKeys['hfToken'] ||
        process.env.HF_TOKEN ||
        '';

      const headers: Record<string, string> = {
        'User-Agent': 'ComfyCanvas-AI-Studio/1.0',
        Accept: 'application/json',
      };
      if (hfToken) {
        headers['Authorization'] = `Bearer ${hfToken}`;
      }

      const targetEndpoint = `https://huggingface.co/api/models/${modelId}`;
      const response = await deps.upstreamFetch(
        { provider: 'huggingface', route: req.path, model: modelId, key: hfToken },
        targetEndpoint,
        { headers }
      );

      if (!response.ok) {
        const details = await response.text();
        return res.status(response.status).json({
          error: `Hugging Face 模型元数据查询失败 HTTP ${response.status}`,
          details,
          rawResponse: details,
          endpoint: targetEndpoint,
          status: response.status,
          errorSource: 'upstream',
        });
      }

      const data = await response.json();
      return res.json(data);
    } catch (error: any) {
      return res.status(502).json({
        error: `Hugging Face 模型元数据网络错误: ${error.message || 'unknown error'}`,
        errorSource: 'network',
        stack: error.stack,
      });
    }
  };
}

export function handleTensorArtModelInfo(deps: CivitaiModelRouteDeps) {
  return async (req: Request, res: Response) => {
    try {
      const modelId = String(req.query.modelId || '').trim();
      if (!modelId) {
        return res.status(400).json({ error: '缺少 modelId 参数', errorSource: 'local' });
      }
      const cloudSettings = deps.getSettings();
      const apiKey = pickTamsBearerKey(
        req.headers['x-tensorart-key'],
        cloudSettings['tensorartKey'],
        deps.defaultKeys['tensorartKey'],
        process.env.TENSORART_API_KEY,
        process.env.TENSORART_KEY,
        process.env.TENSORART
      );
      const baseUrl = String(cloudSettings['tensorartBaseUrl'] || deps.defaultKeys['tensorartBaseUrl'] || 'https://ap-east-1.tensorart.cloud/v1').replace(/\/+$/, '');
      const targetEndpoint = `${baseUrl}/models/${encodeURIComponent(modelId)}`;
      if (!apiKey) {
        const hadAny =
          !!(req.headers['x-tensorart-key'] || cloudSettings['tensorartKey'] || deps.defaultKeys['tensorartKey'] || process.env.TENSORART_API_KEY || process.env.TENSORART_KEY || process.env.TENSORART);
        return res.status(400).json({
          error: hadAny
            ? '当前配置的是 OpenWorks Access Key (ak_tensor_...)，不能用于 TAMS 模型 API 查询'
            : '缺少 TAMS 模型 API Key',
          details: TAMS_BEARER_REQUIRED_HINT,
          endpoint: targetEndpoint,
          status: 400,
          errorSource: 'local',
        });
      }
      if (isOpenWorksAccessKey(apiKey)) {
        return res.status(400).json({
          error: '当前配置的是 OpenWorks Access Key (ak_tensor_...)，不能用于 TAMS 模型 API 查询',
          details: TAMS_BEARER_REQUIRED_HINT,
          endpoint: targetEndpoint,
          status: 400,
          errorSource: 'local',
        });
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      };

      const response = await deps.upstreamFetch(
        { provider: 'tensorart', route: req.path, model: modelId, key: apiKey },
        targetEndpoint,
        { headers }
      );

      if (!response.ok) {
        const details = await response.text();
        return res.status(response.status).json({
          error: `Tensor.Art 模型元数据查询失败 HTTP ${response.status}`,
          details,
          rawResponse: details,
          endpoint: targetEndpoint,
          status: response.status,
          errorSource: 'upstream',
        });
      }

      const data = await response.json();
      return res.json(data);
    } catch (error: any) {
      return res.status(502).json({
        error: `Tensor.Art 模型元数据网络错误: ${error.message || 'unknown error'}`,
        errorSource: 'network',
        stack: error.stack,
      });
    }
  };
}

export function handleCivitaiModelDetail(deps: CivitaiModelRouteDeps) {
  return async (req: Request, res: Response) => {
    const { id } = req.params;
    const rawVersion = req.query.versionId !== undefined ? String(req.query.versionId) : '';
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ error: `Civitai model ID 必须为纯数字，收到: "${id}"`, errorSource: 'local' });
    }
    if (rawVersion && !/^\d+$/.test(rawVersion)) {
      return res.status(400).json({ error: `Civitai model versionId 必须为纯数字，收到: "${rawVersion}"`, errorSource: 'local' });
    }
    const resourcePath = rawVersion ? `model-versions/${rawVersion}` : `models/${id}`;
    const targetEndpoint = `https://civitai.com/api/v1/${resourcePath}`;
    try {
      const cloudSettings = deps.getSettings();
      const apiKey =
        (req.headers['x-civitai-key'] as string) ||
        cloudSettings['civitaiKey'] ||
        deps.defaultKeys['civitaiKey'] ||
        process.env.CIVITAI_API_KEY ||
        '';

      const headers: Record<string, string> = {
        'User-Agent': 'ComfyCanvas-AI-Studio/1.0',
      };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await deps.upstreamFetch(
        { provider: 'civitai', route: req.path, model: rawVersion || id, key: apiKey },
        targetEndpoint,
        { headers }
      );
      if (!response.ok) {
        const details = await response.text();
        return res.status(response.status).json({
          error: `Civitai 模型元数据查询失败 HTTP ${response.status}`,
          details,
          rawResponse: details,
          endpoint: targetEndpoint,
          status: response.status,
          errorSource: 'upstream',
        });
      }

      const rawText = await response.text();
      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch (parseErr: any) {
        return res.status(502).json({
          error: `Civitai 模型元数据上游响应 JSON 解析失败: ${parseErr.message}`,
          status: response.status || 502,
          endpoint: targetEndpoint,
          rawResponse: rawText,
          errorSource: 'upstream',
          stack: parseErr.stack,
        });
      }
      return res.json(data);
    } catch (error: any) {
      return res.status(502).json({
        error: `Civitai 模型元数据网络错误: ${error.message || 'unknown error'}`,
        endpoint: targetEndpoint,
        stack: error.stack,
        errorSource: 'network',
      });
    }
  };
}

export function handleCivitaiModelVersion(deps: CivitaiModelRouteDeps) {
  return async (req: Request, res: Response) => {
    const rawVersion = String(req.params.versionId ?? req.params.id ?? req.query.versionId ?? req.query.id ?? '').trim();
    if (!rawVersion || !/^\d+$/.test(rawVersion)) {
      return res.status(400).json({
        error: `Civitai model versionId 必须为纯数字，收到: "${rawVersion}"`,
        errorSource: 'local',
      });
    }
    const targetEndpoint = `https://civitai.com/api/v1/model-versions/${rawVersion}`;
    try {
      const cloudSettings = deps.getSettings();
      const apiKey =
        (req.headers['x-civitai-key'] as string) ||
        (req.headers['x-civitai-token'] as string) ||
        cloudSettings['civitaiToken'] ||
        cloudSettings['civitaiKey'] ||
        deps.defaultKeys['civitaiKey'] ||
        process.env.CIVITAI_API_KEY ||
        '';

      const headers: Record<string, string> = {
        'User-Agent': 'ComfyCanvas-AI-Studio/1.0',
      };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await deps.upstreamFetch(
        { provider: 'civitai', route: req.path, model: rawVersion, key: apiKey },
        targetEndpoint,
        { headers }
      );
      if (!response.ok) {
        const details = await response.text();
        return res.status(response.status).json({
          error: `Civitai 模型版本元数据查询失败 HTTP ${response.status}`,
          details,
          rawResponse: details,
          endpoint: targetEndpoint,
          status: response.status,
          errorSource: 'upstream',
        });
      }

      const rawText = await response.text();
      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch (parseErr: any) {
        return res.status(502).json({
          error: `Civitai 模型版本上游响应 JSON 解析失败: ${parseErr.message}`,
          status: response.status || 502,
          endpoint: targetEndpoint,
          rawResponse: rawText,
          errorSource: 'upstream',
          stack: parseErr.stack,
        });
      }
      return res.json(data);
    } catch (error: any) {
      return res.status(502).json({
        error: `Civitai 模型版本元数据网络错误: ${error.message || 'unknown error'}`,
        endpoint: targetEndpoint,
        stack: error.stack,
        errorSource: 'network',
      });
    }
  };
}

/** Credential presence by kind (declared in src/config/loraHubProviders.json requiresCredential.kind). Returns only a boolean, never the key. */
const CREDENTIAL_RESOLVERS: Record<string, (req: Request, deps: CivitaiModelRouteDeps) => string | null> = {
  'tams-bearer': (req, deps) => pickTamsBearerKey(req.headers['x-tensorart-key'], deps.getSettings()['tensorartKey'], deps.defaultKeys['tensorartKey'], process.env.TENSORART_API_KEY, process.env.TENSORART_KEY, process.env.TENSORART),
};
export function handleCredentialPresence(deps: CivitaiModelRouteDeps) {
  return (req: Request, res: Response) => {
    const kind = String(req.query.kind || '');
    const resolve = CREDENTIAL_RESOLVERS[kind];
    if (!resolve) return res.status(400).json({ ok: false, error: `未知凭证类型 ${kind}`, errorSource: 'local' });
    res.json({ ok: true, kind, present: Boolean(resolve(req, deps)) });
  };
}
