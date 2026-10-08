type Json = Record<string, unknown>;

export interface SenseNovaImageRequest {
  endpoint: '/images/generations' | '/images/edits';
  payload: Json;
}

const isProvided = (value: unknown): boolean => value !== undefined && value !== null && value !== '';
const sizePattern = /^(\d{3,4})x(\d{3,4})$/;

function imageSize(value: unknown): string {
  const raw = String(value ?? 'auto').trim();
  if (raw === 'auto' || raw === '2K' || raw === '4K') return raw;
  const match = sizePattern.exec(raw);
  if (!match) throw new Error('SenseNova size 必须为 auto、2K、4K 或宽x高（例如 1024x1024）');
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width < 512 || height < 512 || width > 4096 || height > 4096 ||
      width % 32 !== 0 || height % 32 !== 0 || Math.max(width / height, height / width) > 3) {
    throw new Error('SenseNova 尺寸须为 512–4096、32 的倍数且宽高比不超过 3:1');
  }
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
  if (sentUnsupported.length) throw new Error(`SenseNova 图像接口未声明这些扩散字段，不会静默丢弃：${sentUnsupported.join(', ')}`);

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
  if (isProvided(width) !== isProvided(height)) throw new Error('SenseNova width/height 必须同时提供');
  const dimensionSize = isProvided(width) && isProvided(height) ? `${width}x${height}` : undefined;
  const size = imageSize(body.size ?? dimensionSize ?? 'auto');

  const n = body.n === undefined ? 1 : Number(body.n);
  if (n !== 1) throw new Error('SenseNova U1.5 Lite 当前仅支持 n=1');
  const outputFormat = body.output_format ?? 'png';
  if (!['png','jpeg','webp'].includes(String(outputFormat))) throw new Error('SenseNova output_format 仅支持 png/jpeg/webp');
  const responseFormat = body.response_format ?? 'b64_json';
  if (!['url','b64_json'].includes(String(responseFormat))) throw new Error('SenseNova response_format 仅支持 url/b64_json');
  if (isProvided(body.watermark) && typeof body.watermark !== 'boolean') throw new Error('SenseNova watermark 必须为 boolean');
  if (isProvided(body.prompt_extend) && typeof body.prompt_extend !== 'boolean') throw new Error('SenseNova prompt_extend 必须为 boolean');

  const payload: Json = {
    model,
    prompt,
    size,
    n,
    output_format: outputFormat,
    response_format: responseFormat,
    watermark: body.watermark ?? true,
    prompt_extend: body.prompt_extend ?? false,
  };
  return {
    endpoint: imageUrl ? '/images/edits' : '/images/generations',
    payload: imageUrl ? { ...payload, images: [{image_url:imageUrl}] } : payload,
  };
}