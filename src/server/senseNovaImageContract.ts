import { applyCustomParameters, type CustomOverride } from './customParameters';
type Json = Record<string, unknown>;

export interface SenseNovaImageRequest {
  endpoint: '/images/generations' | '/images/edits';
  payload: Json;
  overrides: CustomOverride[];
  actualModel: string;
}

const isProvided = (value: unknown): boolean => value !== undefined && value !== null && value !== '';
const sizePattern = /^(\d{3,4})x(\d{3,4})$/;

function imageSize(value: unknown): string {
  const raw = String(value ?? 'auto').trim();
  if (raw === 'auto' || raw === '2K' || raw === '4K') return raw;
  void sizePattern;
  return raw;
}

export function buildSenseNovaImageRequest(body: Json): SenseNovaImageRequest {
  const model = typeof body.model === 'string' ? body.model.trim() : '';
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!model) throw new Error('SenseNova 图像模型 ID 必填');
  if (!prompt) throw new Error('SenseNova Prompt 必填');

  const unsupported = ['negative_prompt','seed','steps','cfg','sampler','sampler_name','scheduler','denoise','loras'];
  const sentUnsupported = unsupported.filter((name) => {
    const val = body[name];
    return isProvided(val) && !(Array.isArray(val) && val.length === 0);
  });
  // Fields the official schema does not declare are still sent as filled (upstream decides).
  const passThrough: Json = Object.fromEntries(sentUnsupported.map((k) => [k, body[k]]));

  const imageUrl = typeof body.image_url === 'string' ? body.image_url.trim() : '';
  if (imageUrl && !/^https?:\/\//i.test(imageUrl) && !/^data:image\/[\w.+-]+;base64,/i.test(imageUrl)) {
    throw new Error('SenseNova 图像编辑只接受公开 HTTP(S) URL 或带 MIME 前缀的 Base64 Data URL');
  }
  if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
    const url = new URL(imageUrl);
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || /^127\./.test(hostname) || hostname === '::1' || hostname === '[::1]') {
      throw new Error('SenseNova 上游无法读取本机/回环地址的参考图');
    }
  }

  const width = body.width;
  const height = body.height;
  const dimensionSize = isProvided(width) && isProvided(height) ? `${width}x${height}` : undefined;
  if (isProvided(width) !== isProvided(height)) { if (isProvided(width)) passThrough.width = width; if (isProvided(height)) passThrough.height = height; }
  const size = imageSize(body.size ?? dimensionSize ?? 'auto');

  const n = body.n === undefined ? 1 : Number(body.n);
  const outputFormat = body.output_format ?? 'png';
  const responseFormat = body.response_format ?? 'b64_json';

  const payload: Json = {
    model,
    prompt,
    size,
    n,
    output_format: outputFormat,
    response_format: responseFormat,
    ...(isProvided(body.watermark) ? { watermark: body.watermark } : {}),
    ...(isProvided(body.prompt_extend) ? { prompt_extend: body.prompt_extend } : {}),
    ...passThrough,
  };
  const base = imageUrl ? { ...payload, images: [{image_url:imageUrl}] } : payload;
  const custom = applyCustomParameters(base, body.custom_parameters);
  return {
    endpoint: imageUrl ? '/images/edits' : '/images/generations',
    payload: custom.payload,
    overrides: custom.overrides,
    actualModel: String(custom.payload.model),
  };
}
