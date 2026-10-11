export interface ModelsLabImageRequest {
  endpoint: string; // 'https://modelslab.com/api/v6/images/text2img'
  payload: Record<string, unknown>;
}

export interface ModelsLabSuccessResponse {
  status: 'success';
  generationTime?: number;
  id?: number | string;
  output: string[];
  proxy_links?: string[];
  meta?: Record<string, unknown>;
}

export interface ModelsLabProcessingResponse {
  status: 'processing';
  id: number | string;
  eta?: number;
  message?: string;
}

export interface ModelsLabErrorResponse {
  status: 'error';
  message?: string;
  tip?: string;
}

export type ModelsLabResponse = ModelsLabSuccessResponse | ModelsLabProcessingResponse | ModelsLabErrorResponse;

export function buildModelsLabImageRequest(
  body: Record<string, unknown>,
  apiKey: string,
  baseUrl = 'https://modelslab.com'
): ModelsLabImageRequest {
  if (!apiKey) throw new Error('ModelsLab API Key 必填');
  const prompt = String(body.prompt || '').trim();
  if (!prompt) throw new Error('ModelsLab 提示词为必填项（prompt is required）');
  const modelId = String(body.model_id || body.model || '').trim();
  if (!modelId) throw new Error('ModelsLab 模型为必填项（model_id is required）');

  const payload: Record<string, unknown> = {
    key: apiKey,
    prompt,
    model_id: modelId,
    samples: 1,
  };

  const neg = String(body.negative_prompt || body.negativePrompt || '').trim();
  if (neg) payload.negative_prompt = neg;

  const width = typeof body.width === 'number' && body.width > 0 ? Math.round(body.width) : 512;
  const height = typeof body.height === 'number' && body.height > 0 ? Math.round(body.height) : 512;
  payload.width = width;
  payload.height = height;

  if (typeof body.steps === 'number' && body.steps > 0) {
    payload.num_inference_steps = Math.min(Math.round(body.steps), 50);
  }
  const cfg = body.cfg ?? body.guidance_scale ?? body.cfgScale;
  if (typeof cfg === 'number' && cfg > 0) {
    payload.guidance_scale = Number(cfg);
  }
  if (typeof body.seed === 'number' && body.seed >= 0) {
    payload.seed = Math.round(body.seed);
  } else {
    payload.seed = null;
  }
  if (typeof body.scheduler === 'string' && body.scheduler.trim()) {
    payload.scheduler = body.scheduler.trim();
  }

  if (Array.isArray(body.loras) && body.loras.length > 0) {
    const loraModels: string[] = [];
    const loraStrengths: number[] = [];
    for (const item of body.loras) {
      if (typeof item === 'object' && item !== null) {
        const name = String((item as any).name || (item as any).civitaiId || (item as any).model || '').trim();
        const str = typeof (item as any).strength === 'number' ? (item as any).strength : 0.8;
        if (name) {
          loraModels.push(name);
          loraStrengths.push(str);
        }
      }
    }
    if (loraModels.length > 0) {
      payload.lora_model = loraModels.join(',');
      payload.lora_strength = loraStrengths.length === 1 ? loraStrengths[0] : loraStrengths.join(',');
    }
  }

  const initImage = String(body.init_image || body.image_url || '').trim();
  if (initImage) {
    payload.init_image = initImage;
    const strength = body.strength ?? body.denoise;
    if (typeof strength === 'number' && Number.isFinite(strength)) payload.strength = Number(strength);
  }
  const route = initImage ? 'img2img' : 'text2img';
  const endpoint = baseUrl.includes(`/api/v6/images/${route}`)
    ? baseUrl
    : `${baseUrl.replace(/\/api\/v6\/images\/(?:text2img|img2img)$/, '').replace(/\/+$/, '')}/api/v6/images/${route}`;

  return {
    endpoint,
    payload,
  };
}

export function buildModelsLabFetchRequest(
  taskId: string | number,
  apiKey: string,
  baseUrl = 'https://modelslab.com'
): { endpoint: string; payload: { key: string; request_id: string } } {
  if (!apiKey) throw new Error('ModelsLab API Key 必填');
  const base = baseUrl.replace(/\/api\/v6\/images\/text2img$/, '').replace(/\/+$/, '');
  const endpoint = `${base}/api/v6/images/fetch`;
  return {
    endpoint,
    payload: {
      key: apiKey,
      request_id: String(taskId),
    },
  };
}

export function sanitizeModelsLabPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...payload };
  if (typeof sanitized.key === 'string' && sanitized.key.length > 8) {
    sanitized.key = `${sanitized.key.substring(0, 4)}...${sanitized.key.substring(sanitized.key.length - 4)}`;
  } else if (sanitized.key) {
    sanitized.key = '***';
  }
  return sanitized;
}

export function parseModelsLabResponse(data: unknown): { status: 'success' | 'processing'; imageUrl?: string; taskId?: string | number; eta?: number } {
  if (!data || typeof data !== 'object') {
    throw new Error('ModelsLab 响应格式无效');
  }

  const res = data as ModelsLabResponse;
  if (res.status === 'error') {
    throw new Error(`ModelsLab 错误: ${res.message || '未知错误'}${res.tip ? ` (${res.tip})` : ''}`);
  }

  if (res.status === 'processing') {
    return {
      status: 'processing',
      taskId: res.id,
      eta: res.eta,
    };
  }

  if (res.status === 'success') {
    const url = res.output?.[0] || res.proxy_links?.[0];
    if (!url) {
      throw new Error('ModelsLab 响应成功但未返回图像 URL');
    }
    return {
      status: 'success',
      imageUrl: url,
      taskId: res.id,
    };
  }

  throw new Error(`ModelsLab 未知响应状态: ${(res as any).status}`);
}
