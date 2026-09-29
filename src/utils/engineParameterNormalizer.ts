import { ComfyParameters } from '../types/graph';

/**
 * Engine Parameter & LoRA Schema Normalizer
 *
 * Grounded in verified API documentation across Fal.ai, ComfyUI, ModelScope,
 * Hugging Face, NanoGPT, and Google Gemini / Imagen 3.
 */

export interface UnifiedLoraInput {
  name: string;
  modelStrength: number;
  clipStrength: number;
  triggerWords?: string;
  civitaiId?: string;
  downloadUrl?: string;
  baseModel?: string;
}

export interface EngineNormalizationResult<T = any> {
  engine: string;
  payload: T;
  transformedPrompt: string;
  transformedNegativePrompt?: string;
  loraShapeDescription: string;
  parameterMappings: Record<string, string>;
}

/**
 * Resolves a LoRA model reference to an absolute URL or normalized ID.
 * If Civitai ID is present, generates official Civitai download URL.
 */
export function resolveLoraPathOrUrl(lora: UnifiedLoraInput): string {
  if (lora.downloadUrl && lora.downloadUrl.startsWith('http')) {
    return lora.downloadUrl;
  }
  if (lora.civitaiId && /^\d+$/.test(lora.civitaiId.trim())) {
    return `https://civitai.com/api/download/models/${lora.civitaiId.trim()}`;
  }
  if (lora.name.startsWith('http://') || lora.name.startsWith('https://')) {
    return lora.name;
  }
  // Hugging Face repository or file path
  if (lora.name.includes('/') && !lora.name.endsWith('.safetensors')) {
    return lora.name;
  }
  return lora.name;
}

/**
 * 1. Fal.ai Normalization
 * Shape:
 *   loras: Array<{ path: string; url: string; scale: number }>
 *   guidance_scale: number (FLUX: 3.5, SDXL: 6.0~7.5)
 *   image_size: { width: number; height: number }
 *   num_inference_steps: number
 */
export function normalizeForFal(
  params: ComfyParameters,
  positivePrompt: string,
  negativePrompt: string
): EngineNormalizationResult {
  const loras = (params.loras || []).map((l) => {
    const resolved = resolveLoraPathOrUrl(l);
    return {
      path: resolved,
      url: resolved,
      scale: l.modelStrength != null ? Number(l.modelStrength) : undefined,
      civitaiId: l.civitaiId,
    };
  });

  // Append trigger words to positive prompt if not already present
  const allTriggers = (params.loras || [])
    .map((l) => l.triggerWords)
    .filter(Boolean)
    .join(', ');
  let finalPrompt = positivePrompt;
  if (allTriggers && !finalPrompt.includes(allTriggers)) {
    finalPrompt = `${allTriggers}, ${finalPrompt}`.trim();
  }

  const payload = {
    prompt: finalPrompt,
    negative_prompt: negativePrompt || undefined,
    image_size: { width: params.width, height: params.height },
    num_inference_steps: params.steps,
    guidance_scale: params.cfg,
    seed: params.seed,
    loras: loras.length > 0 ? loras : undefined,
    enable_safety_checker: false,
  };

  return {
    engine: 'fal',
    payload,
    transformedPrompt: finalPrompt,
    transformedNegativePrompt: negativePrompt,
    loraShapeDescription: 'loras: [{ path: URL/SafeTensors, scale: float (0.1~2.0) }]',
    parameterMappings: {
      steps: 'num_inference_steps',
      cfg: 'guidance_scale',
      dimensions: 'image_size { width, height }',
      loraStrength: 'scale (取 strength_model)',
    },
  };
}

/**
 * 2. ComfyUI Native Prompt API Format (JSON graph for /prompt)
 * Shape:
 *   Chained node dictionary with class_type & inputs.
 *   Dual-strength LoRA: strength_model and strength_clip.
 */
export function normalizeForComfyUI(
  params: ComfyParameters,
  positivePrompt: string,
  negativePrompt: string
): Record<string, any> {
  const promptGraph: Record<string, any> = {};

  // 1. Checkpoint Loader
  promptGraph['1'] = {
    class_type: 'CheckpointLoaderSimple',
    inputs: {
      ckpt_name: params.checkpoint || '',
    },
  };

  let lastModelNode = '1';
  let lastModelSlot = 0;
  let lastClipNode = '1';
  let lastClipSlot = 1;

  // 2. Chained LoRA Loaders
  (params.loras || []).forEach((lora, idx) => {
    const loraNodeId = String(10 + idx);
    promptGraph[loraNodeId] = {
      class_type: 'LoraLoader',
      inputs: {
        model: [lastModelNode, lastModelSlot],
        clip: [lastClipNode, lastClipSlot],
        lora_name: lora.name.endsWith('.safetensors') ? lora.name : `${lora.name}.safetensors`,
        strength_model: lora.modelStrength != null ? Number(lora.modelStrength) : undefined,
        strength_clip: lora.clipStrength != null ? Number(lora.clipStrength) : undefined,
      },
    };
    lastModelNode = loraNodeId;
    lastModelSlot = 0;
    lastClipNode = loraNodeId;
    lastClipSlot = 1;
  });

  // 3. Positive CLIPTextEncode
  const allTriggers = (params.loras || [])
    .map((l) => l.triggerWords)
    .filter(Boolean)
    .join(', ');
  const finalPos = allTriggers && !positivePrompt.includes(allTriggers)
    ? `${allTriggers}, ${positivePrompt}`.trim()
    : positivePrompt;

  promptGraph['2'] = {
    class_type: 'CLIPTextEncode',
    inputs: {
      text: finalPos,
      clip: [lastClipNode, lastClipSlot],
    },
  };

  // 4. Negative CLIPTextEncode
  promptGraph['3'] = {
    class_type: 'CLIPTextEncode',
    inputs: {
      text: negativePrompt || '',
      clip: [lastClipNode, lastClipSlot],
    },
  };

  // 5. EmptyLatentImage
  promptGraph['4'] = {
    class_type: 'EmptyLatentImage',
    inputs: {
      width: params.width,
      height: params.height,
      batch_size: params.batchSize || 1,
    },
  };

  // 6. KSampler
  promptGraph['5'] = {
    class_type: 'KSampler',
    inputs: {
      model: [lastModelNode, lastModelSlot],
      positive: ['2', 0],
      negative: ['3', 0],
      latent_image: ['4', 0],
      seed: params.seed,
      steps: params.steps,
      cfg: params.cfg,
      sampler_name: params.sampler || 'euler',
      scheduler: params.scheduler || 'normal',
      denoise: params.denoise ?? 1.0,
    },
  };

  // 7. VAEDecode
  promptGraph['6'] = {
    class_type: 'VAEDecode',
    inputs: {
      samples: ['5', 0],
      vae: ['1', 2],
    },
  };

  // 8. SaveImage
  promptGraph['7'] = {
    class_type: 'SaveImage',
    inputs: {
      filename_prefix: 'ComfyCanvas',
      images: ['6', 0],
    },
  };

  return promptGraph;
}

/**
 * 3. ModelScope (魔搭社区) Normalization — POST /v1/images/generations
 * Shape (top-level, no `parameters` wrapper):
 *   { model, prompt, negative_prompt?, num_inference_steps?, guidance_scale?, seed?, width?, height? }
 *   LoRA: body format unverified against official docs → server rejects with 400.
 */
export function normalizeForModelScope(
  params: ComfyParameters,
  positivePrompt: string,
  negativePrompt: string
): EngineNormalizationResult {
  const payload = {
    model: params.checkpoint,
    prompt: positivePrompt,
    negative_prompt: negativePrompt || undefined,
    num_inference_steps: params.steps,
    guidance_scale: params.cfg,
    seed: params.seed,
    width: params.width,
    height: params.height,
  };

  return {
    engine: 'modelscope',
    payload,
    transformedPrompt: positivePrompt,
    transformedNegativePrompt: negativePrompt,
    loraShapeDescription: '不支持 (LoRA 格式未经官方文档核实，服务端返回 400)',
    parameterMappings: {
      steps: 'num_inference_steps',
      cfg: 'guidance_scale',
      negativePrompt: 'negative_prompt',
    },
  };
}

/**
 * 4. Hugging Face Inference API Normalization
 * Shape:
 *   inputs: prompt
 *   parameters: { negative_prompt, width, height, num_inference_steps, guidance_scale, seed }
 *   LoRA: text-to-image task schema has no LoRA field → server rejects with 400.
 */
export function normalizeForHuggingFace(
  params: ComfyParameters,
  positivePrompt: string,
  negativePrompt: string
): EngineNormalizationResult {
  const payload = {
    inputs: positivePrompt,
    parameters: {
      negative_prompt: negativePrompt || undefined,
      width: params.width,
      height: params.height,
      num_inference_steps: params.steps,
      guidance_scale: params.cfg,
      seed: params.seed,
    },
  };

  return {
    engine: 'huggingface',
    payload,
    transformedPrompt: positivePrompt,
    transformedNegativePrompt: negativePrompt,
    loraShapeDescription: '不支持 (HF text-to-image 任务无 LoRA 字段，服务端返回 400)',
    parameterMappings: {
      steps: 'parameters.num_inference_steps',
      cfg: 'parameters.guidance_scale',
      dimensions: 'parameters.width / height',
    },
  };
}

/**
 * 5. NanoGPT Normalization
 * Shape:
 *   prompt
 *   model: string
 *   seed: number (optional)
 *   resolution: "1k" | "2k" | "4k" (optional, model-dependent)
 *   aspect_ratio: string (optional, model-dependent)
 *   NanoGPT does NOT support: steps, cfg/guidance_scale, LoRA, negative_prompt, pixel dimensions
 */
export function normalizeForNanoGPT(
  params: ComfyParameters,
  positivePrompt: string,
  negativePrompt: string
): EngineNormalizationResult {
  const payload: Record<string, any> = {
    prompt: positivePrompt,
    model: params.checkpoint,
    seed: params.seed,
  };

  return {
    engine: 'nanogpt',
    payload,
    transformedPrompt: positivePrompt,
    transformedNegativePrompt: '',
    loraShapeDescription: '不支持 (NanoGPT 无 LoRA)',
    parameterMappings: {
      seed: 'seed',
    },
  };
}

/**
 * 6. Google Gemini Normalization
 * Shape:
 *   Prompt only + aspectRatio (Gemini generateContent has no negativePrompt/guidanceScale/seed/LoRA support)
 */
export function normalizeForGemini(
  params: ComfyParameters,
  positivePrompt: string,
  negativePrompt: string
): EngineNormalizationResult {
  const finalPrompt = positivePrompt;

  const payload: any = {
    prompt: finalPrompt,
    // ponytail: width/height, negativePrompt, guidanceScale, seed, loras are NOT supported by Gemini generateContent.
    // Official doc accepts aspect_ratio ('1:1', '3:2', '2:3', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9') and image_size ('1K', '2K', '4K').
  };

  return {
    engine: 'gemini',
    payload,
    transformedPrompt: finalPrompt,
    transformedNegativePrompt: '',
    loraShapeDescription: '不支持 (Gemini generateContent 无 LoRA)',
    parameterMappings: {},
  };
}
