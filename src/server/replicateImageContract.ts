import { applyCustomParameters, parseCustomObject, type CustomOverride } from './customParameters';

export interface ReplicatePredictionRequest {
  endpoint: string;
  payload: Record<string, unknown>;
  headers: Record<string, string>;
  overrides: CustomOverride[];
  actualModel: string;
  isVersionBased: boolean;
}

export type ReplicateParsedResponse =
  | {
      isPending: true;
      predictionId: string;
      pollUrl: string;
      status: 'starting' | 'processing';
    }
  | {
      isPending: false;
      status: 'succeeded';
      predictionId?: string;
      output: unknown;
      imageUrl: string;
      imageUrls: string[];
    };

export function buildReplicatePredictionRequest(
  body: Record<string, unknown>,
  baseUrl = 'https://api.replicate.com/v1'
): ReplicatePredictionRequest {
  const rawModel = String(body.model || '').trim();
  if (!rawModel) {
    throw new Error('Replicate 模型为必填项（model is required）');
  }

  const prompt = String(body.prompt || '').trim();
  if (!prompt) {
    throw new Error('Replicate 提示词为必填项（prompt is required）');
  }

  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
  const isHex64 = /^[0-9a-fA-F]{64}$/.test(rawModel);

  let endpoint: string;
  let actualModel = rawModel;
  let isVersionBased = false;
  let versionToSet: string | undefined;

  if (isHex64) {
    endpoint = `${cleanBaseUrl}/predictions`;
    isVersionBased = true;
    versionToSet = rawModel;
  } else if (rawModel.includes(':')) {
    const [modelName, versionPart] = rawModel.split(':');
    const [owner, name] = modelName.split('/');
    if (!owner || !name) {
      throw new Error('Replicate 模型格式无效，需为 owner/name、owner/name:version 或 64位十六进制版本号');
    }
    endpoint = `${cleanBaseUrl}/models/${owner}/${name}/predictions`;
    isVersionBased = Boolean(versionPart);
    if (versionPart) versionToSet = versionPart;
  } else if (rawModel.includes('/')) {
    const [owner, name] = rawModel.split('/');
    if (!owner || !name) {
      throw new Error('Replicate 模型格式无效，需为 owner/name、owner/name:version 或 64位十六进制版本号');
    }
    endpoint = `${cleanBaseUrl}/models/${owner}/${name}/predictions`;
    isVersionBased = false;
  } else {
    throw new Error('Replicate 模型格式无效，需为 owner/name、owner/name:version 或 64位十六进制版本号');
  }

  if (body.version && typeof body.version === 'string' && body.version.trim()) {
    versionToSet = body.version.trim();
    isVersionBased = true;
  }

  const input: Record<string, unknown> = {
    prompt,
  };

  const neg = String(body.negative_prompt || body.negativePrompt || '').trim();
  if (neg) {
    input.negative_prompt = neg;
  }

  if (typeof body.width === 'number' && Number.isFinite(body.width) && body.width > 0) {
    input.width = Math.round(body.width);
  }
  if (typeof body.height === 'number' && Number.isFinite(body.height) && body.height > 0) {
    input.height = Math.round(body.height);
  }

  const aspectRatio = String(body.aspect_ratio || body.aspectRatio || '').trim();
  if (aspectRatio) {
    input.aspect_ratio = aspectRatio;
  }

  if (typeof body.seed === 'number' && Number.isFinite(body.seed) && body.seed >= 0) {
    input.seed = Math.round(body.seed);
  }

  const steps = body.steps ?? body.num_inference_steps ?? body.numInferenceSteps;
  if (typeof steps === 'number' && Number.isFinite(steps) && steps > 0) {
    input.num_inference_steps = Math.round(steps);
  }

  const cfg = body.cfg ?? body.guidance_scale ?? body.guidanceScale ?? body.cfgScale;
  if (typeof cfg === 'number' && Number.isFinite(cfg) && cfg > 0) {
    input.guidance_scale = Number(cfg);
  }

  const imageUrl = String(body.image_url || body.imageUrl || body.image || body.input_image || '').trim();
  if (imageUrl) {
    if (body.input_image && !body.image) {
      input.input_image = imageUrl;
    } else {
      input.image = imageUrl;
    }
  }

  if (Array.isArray(body.loras) && body.loras.length > 0) {
    const firstLora = body.loras[0];
    if (typeof firstLora === 'string' && firstLora.trim()) {
      input.hf_lora = firstLora.trim();
      input.lora_scale = 1.0;
    } else if (typeof firstLora === 'object' && firstLora !== null) {
      const rawId = String((firstLora as any).civitaiId || (firstLora as any).civitai_id || (firstLora as any).versionId || '').trim();
      let loraPath = String(
        (firstLora as any).path ||
          (firstLora as any).url ||
          (firstLora as any).hf_lora ||
          (firstLora as any).name ||
          (firstLora as any).model ||
          ''
      ).trim();
      if (!loraPath && rawId) {
        loraPath = rawId.startsWith('http')
          ? rawId
          : /^\d+$/.test(rawId)
          ? `https://civitai.com/api/download/models/${rawId}`
          : rawId;
      } else if (rawId && /^\d+$/.test(rawId) && !loraPath.startsWith('http')) {
        loraPath = `https://civitai.com/api/download/models/${rawId}`;
      }
      if (loraPath) input.hf_lora = loraPath;
      const strength =
        typeof (firstLora as any).strength === 'number'
          ? (firstLora as any).strength
          : typeof (firstLora as any).scale === 'number'
          ? (firstLora as any).scale
          : typeof (firstLora as any).lora_scale === 'number'
          ? (firstLora as any).lora_scale
          : 1.0;
      if (loraPath && typeof strength === 'number' && Number.isFinite(strength)) {
        input.lora_scale = strength;
      }
    }
  } else if (body.hf_lora && typeof body.hf_lora === 'string' && body.hf_lora.trim()) {
    input.hf_lora = body.hf_lora.trim();
    if (typeof body.lora_scale === 'number' && Number.isFinite(body.lora_scale)) {
      input.lora_scale = body.lora_scale;
    }
  }

  const basePayload: Record<string, unknown> = {
    ...(versionToSet ? { version: versionToSet } : {}),
    input,
  };

  let customInput = body.custom_parameters;
  if (customInput && typeof customInput === 'object' && !Array.isArray(customInput)) {
    const customObj = customInput as Record<string, unknown>;
    if (!('input' in customObj) && !('version' in customObj)) {
      customInput = { input: customObj };
    }
  }

  const custom = applyCustomParameters(basePayload, customInput);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Prefer': 'wait',
  };

  return {
    endpoint,
    payload: custom.payload,
    headers,
    overrides: custom.overrides,
    actualModel: custom.actualModel || actualModel,
    isVersionBased,
  };
}

export function parseReplicatePredictionResponse(data: unknown): ReplicateParsedResponse {
  if (!data || typeof data !== 'object') {
    throw new Error('Replicate 响应格式无效');
  }

  const res = data as Record<string, any>;

  if (res.status === 'failed' || res.status === 'canceled') {
    const detail = res.error || res.logs || '任务失败';
    throw new Error(`Replicate 预测任务失败 (${res.status}): ${detail}`);
  }

  if (res.error && !res.status) {
    throw new Error(`Replicate 上游错误: ${res.error}`);
  }

  if (res.status === 'starting' || res.status === 'processing') {
    const predictionId = String(res.id || '');
    const pollUrl = res.urls?.get || (predictionId ? `https://api.replicate.com/v1/predictions/${predictionId}` : '');
    return {
      isPending: true,
      predictionId,
      pollUrl,
      status: res.status,
    };
  }

  if (res.status === 'succeeded') {
    const rawOutput = res.output;
    let urls: string[] = [];

    if (Array.isArray(rawOutput)) {
      urls = rawOutput
        .map((item: any) => {
          if (typeof item === 'string') return item.trim();
          if (item && typeof item === 'object') return String(item.url || item.image || item.file || '').trim();
          return '';
        })
        .filter(Boolean);
    } else if (typeof rawOutput === 'string' && rawOutput.trim()) {
      urls = [rawOutput.trim()];
    } else if (rawOutput && typeof rawOutput === 'object') {
      const single = String((rawOutput as any).url || (rawOutput as any).image || (rawOutput as any).file || '').trim();
      if (single) urls = [single];
    }

    if (urls.length === 0) {
      throw new Error('Replicate 预测成功但未返回有效图像输出');
    }

    return {
      isPending: false,
      status: 'succeeded',
      predictionId: res.id ? String(res.id) : undefined,
      output: rawOutput,
      imageUrl: urls[0],
      imageUrls: urls,
    };
  }

  throw new Error(`Replicate 未知响应状态: ${res.status || 'unknown'}`);
}
