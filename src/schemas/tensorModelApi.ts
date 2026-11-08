import { applyCustomParameters, parseCustomObject } from '../server/customParameters';
export const TENSOR_MODEL_API = 'https://ap-east-1.tensorart.cloud';
export const TENSOR_JOB_DOC = 'https://tams-docs.tensor.art/zh/docs/api/apis/tams-api-v-1-service-create-job/';
export function tensorModelId(value: unknown): string {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^https:\/\/(?:www\.)?(?:tensor\.art|tusiart\.com)\/models\/(\d{10,20})(?:[/?#].*)?$/);
  const id=match?.[1] ?? raw;
  if (/^\d{10,20}$/.test(id) && BigInt(id)<=18446744073709551615n) return id;
  throw new Error('Tensor.Art 模型为必填项：请输入真实模型 ID 或 tensor.art/models/… 链接；OpenWorks 接口名不是模型 ID');
}
export function validateTensorModelDimensions(body:Record<string,any>,baseModel:string) {
  const base=String(baseModel || '').toLowerCase().replace(/[ _-]/g,'');
  const area=body.width*body.height;
  if (['sd1.5','1.5','sd1','sdv1'].includes(base)) {
    if (body.width>1024 || body.height>1024 || area<262144 || area>1048576) throw new Error('SD1.5 / 512 engine 尺寸须满足边长≤1024、像素面积262144–1048576');
  } else if (base==='sdxl' || base==='sdxl1.0' || base.includes('pony') || base.includes('illustrious') || base.includes('noobai')) {
    if(area<262144 || area>2073600) throw new Error('SDXL 衍生架构像素面积须为262144–2073600');
  }
  // Other architectures: no local range blocking — upstream TAMS decides.
}
export function buildTensorModelJob(body: Record<string, any>, requestId: string) {
  const model = tensorModelId(body.model);
  // width and height are required integers; range and 64-multiple validation is delegated
  // to TAMS upstream (per project rule: no local range blocking).
  for (const field of ['width', 'height']) {
    if (!Number.isInteger(body[field])) throw new Error(`${field} 必填，须为整数`);
  }
  if (!String(body.prompt ?? '').trim()) throw new Error('prompt 为必填项');
  const inputInitialize: Record<string, any> = {};
  if (body.seed !== undefined) {
    if (!Number.isInteger(body.seed)) throw new Error('seed 须为整数');
    inputInitialize.seed = String(body.seed);
  }
  // count: required to be integer >= 1; no upper-bound local block (upstream decides).
  if (body.count !== undefined) {
    if (!Number.isInteger(body.count) || body.count < 1) throw new Error('count 须为正整数');
    inputInitialize.count = body.count;
  }
  // imageResourceId / image_url → inputInitialize.imageResourceId (官方 img2img 契约)
  const imageResourceId = body.imageResourceId || body.image_url;
  if (imageResourceId) inputInitialize.imageResourceId = String(imageResourceId);
  const diffusion: Record<string, any> = {sdModel: model, width: body.width, height: body.height, prompts: [{text: body.prompt}], negativePrompts: body.negative_prompt !== undefined ? [{text: body.negative_prompt}] : []};
  // steps: required to be a positive integer; no upper-bound local block (upstream decides).
  if (body.steps !== undefined) {
    if (!Number.isInteger(body.steps) || body.steps < 1) throw new Error('steps 须为正整数');
    diffusion.steps = body.steps;
  }
  // cfg: required to be finite number; no upper-bound local block (upstream decides).
  if (body.cfg !== undefined) {
    if (!Number.isFinite(body.cfg)) throw new Error('cfg 须为有限数值');
    diffusion.cfgScale = body.cfg;
  }
  if (body.sampler_name) diffusion.sampler = body.sampler_name;
  if (body.scheduler) diffusion.scheduleName = body.scheduler;
  if (typeof body.denoise === 'number' && Number.isFinite(body.denoise)) diffusion.denoisingStrength = body.denoise;
  if (typeof body.sdVae === 'string' && body.sdVae.trim()) diffusion.sdVae = body.sdVae.trim();
  // Support both snake_case (clip_skip) and camelCase (clipSkip); TAMS diffusion field is clipSkip.
  const clipSkipVal = body.clip_skip ?? body.clipSkip;
  if (typeof clipSkipVal === 'number' && Number.isInteger(clipSkipVal)) diffusion.clipSkip = clipSkipVal;
  if (typeof body.modelAccessKey === 'string' && body.modelAccessKey.trim()) diffusion.modelAccessKey = body.modelAccessKey.trim();
  if (body.loras !== undefined) {
    if (!Array.isArray(body.loras)) throw new Error('loras 必须为数组');
    diffusion.lora = {items: body.loras.map((entry: any) => {
      const id = tensorModelId(entry.tensorartId ?? entry.name);
      const weight = entry.strength ?? entry.modelStrength;
      if (!Number.isFinite(weight)) throw new Error(`LoRA ${id} 的 weight 必填，须为有限数值`);
      return {
        loraModel: id,
        weight,
        ...(typeof entry.loraAccessKey === 'string' && entry.loraAccessKey.trim() ? { loraAccessKey: entry.loraAccessKey.trim() } : {}),
      };
    })};
  }
  const custom = parseCustomObject(body.custom_parameters);
  const { model: customModel, ...jobCustom } = custom || {};
  if (customModel !== undefined) diffusion.sdModel = tensorModelId(customModel);
  return applyCustomParameters({requestId, stages: [{type:'INPUT_INITIALIZE', inputInitialize}, {type:'DIFFUSION', diffusion}]}, jobCustom).payload;
}

/** True for a numeric TAMS model id or a tensor.art / tusiart model URL. OpenWorks tool names return false. */
export function isTamsNumericModel(model: unknown): boolean {
  const raw = String(model ?? '').trim();
  return /^\d{10,25}$/.test(raw) || /^https:\/\/(?:www\.)?(?:tensor\.art|tusiart\.com)\/models\/\d{10,25}/.test(raw);
}

/**
 * TAMS video job. Shape is the official workspace example
 * (https://tams-docs.tensor.art/docs/api/guide/workspace-api-example/):
 * stages [INPUT_INITIALIZE, VIDEO_DIFFUSION], body key video_diffusion,
 * LoRA item key lora_model (snake_case — not the image-stage loraModel).
 * Image-to-video is the same stage with inputInitialize.imageResourceId.
 * Submit: POST {TENSOR_MODEL_API}/v1/jobs (https://tams-docs.tensor.art/docs/api/signature/signature_build/).
 * Poll: GET {TENSOR_MODEL_API}/v1/jobs/{jobId} (live OpenAPI TamsApiV1Service_GetJob;
 * page https://tams-docs.tensor.art/docs/api/apis/tams-api-v-1-service-get-job/).
 */
export function buildTamsVideoJob(body: Record<string, any>, requestId: string) {
  const model = tensorModelId(body.model);
  const imageResourceId = typeof body.imageResourceId === 'string' ? body.imageResourceId.trim() : '';
  if (body.image_url && !imageResourceId) {
    throw new Error('TAMS 图生视频需要已上传的 imageResourceId（官方 INPUT_INITIALIZE.imageResourceId）。原始图片 URL 不能代替资源 ID，本请求未发送。');
  }
  // width, height, fps, totalFrames are required positive integers; no local range blocking
  // beyond type/existence — upstream TAMS enforces model-specific resolution and frame constraints.
  for (const field of ['width', 'height', 'fps', 'totalFrames'] as const) {
    if (!Number.isInteger(body[field]) || body[field] < 1) {
      throw new Error(`${field} 必填，须为正整数（官方 VIDEO_DIFFUSION 示例字段，不按图像 512–1536 规则改写）`);
    }
  }
  if (!String(body.prompt ?? '').trim()) throw new Error('prompt 为必填项');
  const inputInitialize: Record<string, any> = {};
  if (imageResourceId) inputInitialize.imageResourceId = imageResourceId;
  if (body.seed !== undefined) {
    if (!Number.isInteger(body.seed)) throw new Error('seed 须为整数');
    inputInitialize.seed = String(body.seed);
  }
  if (body.count !== undefined) {
    if (!Number.isInteger(body.count) || body.count < 1) throw new Error('count 须为正整数');
    inputInitialize.count = body.count;
  }
  const videoDiffusion: Record<string, any> = {
    sdModel: model,
    width: body.width,
    height: body.height,
    fps: body.fps,
    totalFrames: body.totalFrames,
    prompts: [{ text: String(body.prompt) }],
    negativePrompts: body.negative_prompt !== undefined ? [{ text: String(body.negative_prompt) }] : [],
  };
  // generationMode is passed through verbatim: the official enum (DEFAULT, TEXT_TO_VIDEO, IMAGE_TO_VIDEO)
  // and the official examples (STABLE) differ, so no local whitelist; upstream decides.
  if (body.generationMode !== undefined && body.generationMode !== '') videoDiffusion.generationMode = String(body.generationMode);
  // steps: positive integer; no upper-bound local block.
  if (body.steps !== undefined) {
    if (!Number.isInteger(body.steps) || body.steps < 1) throw new Error('steps 须为正整数');
    videoDiffusion.steps = body.steps;
  }
  // cfg → cfgScale; no upper-bound local block.
  if (body.cfg !== undefined) {
    if (!Number.isFinite(body.cfg)) throw new Error('cfg 须为有限数值');
    videoDiffusion.cfgScale = body.cfg;
  }
  if (body.sampler_name) videoDiffusion.sampler = body.sampler_name;
  if (body.scheduler) videoDiffusion.scheduleName = body.scheduler;
  // clipSkip: support both camelCase and snake_case input; TAMS field is clipSkip.
  const videoClipSkip = body.clipSkip ?? body.clip_skip;
  if (typeof videoClipSkip === 'number' && Number.isInteger(videoClipSkip)) videoDiffusion.clipSkip = videoClipSkip;
  if (body.loras !== undefined) {
    if (!Array.isArray(body.loras) || body.loras.length === 0) throw new Error('loras 必须为非空数组');
    videoDiffusion.lora = {
      items: body.loras.map((entry: any) => {
        const id = tensorModelId(entry?.lora_model ?? entry?.tensorartId ?? entry?.name);
        const weight = entry?.weight ?? entry?.strength ?? entry?.modelStrength;
        if (!Number.isFinite(weight)) throw new Error(`LoRA ${id} 的 weight 必填，须为有限数值`);
        return { lora_model: id, weight };
      }),
    };
  }
  const custom = parseCustomObject(body.custom_parameters);
  const { model: customModel, ...jobCustom } = custom || {};
  if (customModel !== undefined) videoDiffusion.sdModel = tensorModelId(customModel);
  return applyCustomParameters(
    { requestId, stages: [{ type: 'INPUT_INITIALIZE', inputInitialize }, { type: 'VIDEO_DIFFUSION', video_diffusion: videoDiffusion }] },
    jobCustom,
  ).payload;
}
