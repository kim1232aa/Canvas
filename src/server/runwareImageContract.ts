import { randomUUID } from 'node:crypto';
import { applyCustomParameters, type CustomOverride } from './customParameters';

export interface RunwareLora {
  model: string;
  weight: number;
}

export interface RunwareTask {
  taskType: 'imageInference';
  taskUUID: string;
  model: string;
  positivePrompt: string;
  negativePrompt?: string;
  seedImage?: string;
  strength?: number;
  width?: number;
  height?: number;
  steps?: number;
  CFGScale?: number;
  seed?: number;
  numberResults?: number;
  outputFormat?: 'PNG' | 'WEBP' | 'JPG';
  outputType?: 'URL' | 'base64Data' | 'dataURI';
  lora?: RunwareLora[];
}

export interface RunwareImageRequest {
  endpoint: string; // 'https://api.runware.ai/v1' or custom baseUrl
  payload: RunwareTask[];
  overrides: CustomOverride[];
  actualModel: string;
}

export interface RunwareImageResponse {
  data?: Array<{
    taskType: string;
    taskUUID: string;
    imageUUID?: string;
    imageURL?: string;
    imageBase64Data?: string;
    imageDataURI?: string;
    seed?: number;
    cost?: number;
  }>;
  errors?: Array<{
    code?: string;
    message: string;
    taskUUID?: string;
  }>;
}

export function buildRunwareImageRequest(body: Record<string, unknown>, baseUrl = 'https://api.runware.ai/v1'): RunwareImageRequest {
  const model = String(body.model || '').trim();
  if (!model) throw new Error('Runware 模型为必填项（model is required）');
  const prompt = String(body.prompt || body.positivePrompt || '').trim();
  if (!prompt) throw new Error('Runware 提示词为必填项（prompt is required）');

  const taskUUID = typeof body.taskUUID === 'string' && body.taskUUID.trim() ? body.taskUUID.trim() : randomUUID();

  const task: RunwareTask = {
    taskType: 'imageInference',
    taskUUID,
    model,
    positivePrompt: prompt,
    numberResults: 1,
    outputFormat: 'PNG',
    outputType: 'URL',
  };

  if (typeof body.negative_prompt === 'string' && body.negative_prompt.trim()) {
    task.negativePrompt = body.negative_prompt.trim();
  } else if (typeof body.negativePrompt === 'string' && body.negativePrompt.trim()) {
    task.negativePrompt = body.negativePrompt.trim();
  }

  const seedImage = String(body.seedImage || body.image_url || '').trim();
  if (seedImage) {
    task.seedImage = seedImage;
    const strength = body.strength ?? body.denoise;
    if (typeof strength === 'number' && Number.isFinite(strength)) {
      task.strength = Math.max(0, Math.min(1, Number(strength)));
    }
  }

  if (typeof body.width === 'number' && Number.isFinite(body.width) && body.width > 0) {
    task.width = Math.round(body.width);
  }
  if (typeof body.height === 'number' && Number.isFinite(body.height) && body.height > 0) {
    task.height = Math.round(body.height);
  }
  if (typeof body.steps === 'number' && Number.isFinite(body.steps) && body.steps > 0) {
    task.steps = Math.round(body.steps);
  }
  const cfgVal = body.cfg ?? body.CFGScale ?? body.cfgScale ?? body.guidance_scale;
  const cfgAllowedAtZero = task.model === 'runware:100@1';
  if (typeof cfgVal === 'number' && Number.isFinite(cfgVal) && (cfgVal > 0 || (cfgVal === 0 && cfgAllowedAtZero))) {
    task.CFGScale = Number(cfgVal);
  }
  if (typeof body.seed === 'number' && Number.isFinite(body.seed) && body.seed >= 0) {
    task.seed = Math.round(body.seed);
  }

  if (Array.isArray(body.loras) && body.loras.length > 0) {
    const loras: RunwareLora[] = [];
    for (const item of body.loras) {
      if (typeof item === 'object' && item !== null) {
        const loraModel = String((item as any).civitaiId || (item as any).path || (item as any).name || (item as any).model || '').trim();
        const weight = typeof (item as any).strength === 'number'
          ? (item as any).strength
          : typeof (item as any).weight === 'number'
          ? (item as any).weight
          : 1.0;
        if (loraModel) {
          loras.push({ model: loraModel, weight });
        }
      }
    }
    if (loras.length > 0) {
      task.lora = loras;
    }
  }

  const endpoint = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl.replace(/\/+$/, '')}/v1`;

  const custom = applyCustomParameters(task as unknown as Record<string, unknown>, body.custom_parameters);
  const sentTask = custom.payload as unknown as RunwareTask;
  if (sentTask.taskType !== 'imageInference') throw new Error('Runware 自定义 JSON 不能修改 taskType；当前路由只执行 imageInference');

  return {
    endpoint,
    payload: [sentTask],
    overrides: custom.overrides,
    actualModel: String(sentTask.model),
  };
}

export function parseRunwareImageResponse(response: RunwareImageResponse, outputFormat = 'PNG'): { imageUrl: string; imageUrls: string[]; images: Array<{ url: string; seed?: number }>; cost?: number; taskUUID: string } {
  if (Array.isArray(response.errors) && response.errors.length > 0) {
    const firstErr = response.errors[0];
    throw new Error(`Runware 上游错误: ${firstErr.message || firstErr.code || '未知错误'}`);
  }

  const images = (response.data || [])
    .map((item) => ({ url: item.imageURL || item.imageDataURI || (item.imageBase64Data ? `data:image/${String(outputFormat).toLowerCase() === 'jpg' ? 'jpeg' : String(outputFormat).toLowerCase()};base64,${item.imageBase64Data}` : ''), ...(typeof item.seed === 'number' ? { seed: item.seed } : {}) }))
    .filter((image) => image.url);
  const first = (response.data || []).find((item) => item.imageURL || item.imageDataURI || item.imageBase64Data);
  if (!first || !images.length) {
    throw new Error('Runware 未返回图像 URL');
  }

  return {
    imageUrl: images[0].url,
    imageUrls: images.map((image) => image.url),
    images,
    cost: (response.data || []).reduce<number | undefined>((sum, item) => typeof item.cost === 'number' ? (sum ?? 0) + item.cost : sum, undefined),
    taskUUID: first.taskUUID,
  };
}
