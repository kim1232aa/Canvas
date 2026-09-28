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
export function resolveLoraPathOrUrl(lora: UnifiedLoraInput, civitaiToken?: string): string {
  if (lora.downloadUrl && lora.downloadUrl.startsWith('http')) {
    return lora.downloadUrl;
  }
  if (lora.civitaiId && /^\d+$/.test(lora.civitaiId.trim())) {
    const tokenParam = civitaiToken ? `?token=${encodeURIComponent(civitaiToken)}` : '';
    return `https://civitai.com/api/download/models/${lora.civitaiId.trim()}${tokenParam}`;
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
      scale: Number(l.modelStrength ?? 0.8),
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
        strength_model: Number(lora.modelStrength ?? 0.8),
        strength_clip: Number(lora.clipStrength ?? 0.8),
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
 * 3. ModelScope (魔搭社区) Normalization
 * Shape:
 *   input: { prompt, negative_prompt, steps }
 *   parameters: { loras: [{ lora_model_id: string, lora_weight: number }] }
 *   + Trigger Words automatically injected to prompt
 */
export function normalizeForModelScope(
  params: ComfyParameters,
  positivePrompt: string,
  negativePrompt: string
): EngineNormalizationResult {
  const triggers = (params.loras || [])
    .map((l) => l.triggerWords)
    .filter(Boolean)
    .join(', ');
  let finalPrompt = positivePrompt;
  if (triggers && !finalPrompt.includes(triggers)) {
    finalPrompt = `${triggers}, ${finalPrompt}`.trim();
  }

  const modelscopeLoras = (params.loras || []).map((l) => ({
    lora_model_id: l.name,
    lora_weight: Number(l.modelStrength ?? 0.8),
  }));

  const payload = {
    input: {
      prompt: finalPrompt,
      negative_prompt: negativePrompt || '',
      steps: params.steps || 30,
    },
    parameters: {
      loras: modelscopeLoras.length > 0 ? modelscopeLoras : undefined,
    },
  };

  return {
    engine: 'modelscope',
    payload,
    transformedPrompt: finalPrompt,
    transformedNegativePrompt: negativePrompt,
    loraShapeDescription: 'parameters.loras: [{ lora_model_id: string, lora_weight: float }]',
    parameterMappings: {
      steps: 'input.steps',
      prompt: 'input.prompt (+ triggers)',
      negativePrompt: 'input.negative_prompt',
      loraId: 'parameters.loras[].lora_model_id',
      loraWeight: 'parameters.loras[].lora_weight',
    },
  };
}

/**
 * 4. Hugging Face Inference API Normalization
 * Shape:
 *   inputs: prompt (+ triggers)
 *   parameters: { negative_prompt, width, height, num_inference_steps, guidance_scale, cross_attention_kwargs: { scale: lora_scale } }
 */
export function normalizeForHuggingFace(
  params: ComfyParameters,
  positivePrompt: string,
  negativePrompt: string
): EngineNormalizationResult {
  const triggers = (params.loras || [])
    .map((l) => l.triggerWords)
    .filter(Boolean)
    .join(', ');
  let finalPrompt = positivePrompt;
  if (triggers && !finalPrompt.includes(triggers)) {
    finalPrompt = `${triggers}, ${finalPrompt}`.trim();
  }

  const maxStrength = (params.loras || []).length > 0
    ? Math.max(...params.loras.map((l) => l.modelStrength))
    : 0.8;

  const payload = {
    inputs: finalPrompt,
    parameters: {
      negative_prompt: negativePrompt || undefined,
      width: params.width,
      height: params.height,
      num_inference_steps: params.steps,
      guidance_scale: params.cfg,
      cross_attention_kwargs: (params.loras || []).length > 0 ? { scale: maxStrength } : undefined,
    },
  };

  return {
    engine: 'huggingface',
    payload,
    transformedPrompt: finalPrompt,
    transformedNegativePrompt: negativePrompt,
    loraShapeDescription: 'parameters.cross_attention_kwargs: { scale: float } + prompt triggers',
    parameterMappings: {
      steps: 'parameters.num_inference_steps',
      cfg: 'parameters.guidance_scale',
      dimensions: 'parameters.width / height',
      loraScale: 'parameters.cross_attention_kwargs.scale',
    },
  };
}

/**
 * 5. NanoGPT Normalization
 * Shape:
 *   prompt (+ triggers)
 *   model: string
 *   size: "${width}x${height}"
 *   num_inference_steps: number
 *   guidance_scale: number
 *   loras: Array<{ path: string; scale: number }>
 */
export function normalizeForNanoGPT(
  params: ComfyParameters,
  positivePrompt: string,
  negativePrompt: string
): EngineNormalizationResult {
  const triggers = (params.loras || [])
    .map((l) => l.triggerWords)
    .filter(Boolean)
    .join(', ');
  let finalPrompt = positivePrompt;
  if (triggers && !finalPrompt.includes(triggers)) {
    finalPrompt = `${triggers}, ${finalPrompt}`.trim();
  }

  const loras = (params.loras || []).map((l) => ({
    path: resolveLoraPathOrUrl(l),
    scale: Number(l.modelStrength ?? 0.8),
  }));

  const payload = {
    prompt: finalPrompt,
    model: params.checkpoint,
    size: `${params.width}x${params.height}`,
    num_inference_steps: params.steps,
    guidance_scale: params.cfg,
    loras: loras.length > 0 ? loras : undefined,
  };

  return {
    engine: 'nanogpt',
    payload,
    transformedPrompt: finalPrompt,
    transformedNegativePrompt: negativePrompt,
    loraShapeDescription: 'loras: [{ path: string, scale: float }]',
    parameterMappings: {
      steps: 'num_inference_steps',
      size: 'size ("WxH")',
      cfg: 'guidance_scale',
      loras: 'loras[].{ path, scale }',
    },
  };
}

/**
 * 6. Google Gemini / Imagen 3 Normalization
 * Shape:
 *   Prompt semantic concept distillation (LoRA triggers & style weighting injected into prompt text)
 *   config: { aspectRatio, negativePrompt, guidanceScale, seed }
 */
export function normalizeForGemini(
  params: ComfyParameters,
  positivePrompt: string,
  negativePrompt: string
): EngineNormalizationResult {
  // Calculate closest supported aspect ratio: 1:1, 16:9, 9:16, 4:3, 3:4
  let aspectRatio: '1:1' | '3:4' | '4:3' | '9:16' | '16:9' = '1:1';
  const ratio = params.width / (params.height || 1);
  if (ratio > 1.5) aspectRatio = '16:9';
  else if (ratio > 1.2) aspectRatio = '4:3';
  else if (ratio < 0.65) aspectRatio = '9:16';
  else if (ratio < 0.85) aspectRatio = '3:4';

  // Semantic concept distillation: extract triggers or LoRA name keywords
  const triggerList = (params.loras || [])
    .map((l) => {
      if (l.triggerWords) return l.triggerWords;
      // Synthesize clean concept from name
      const cleanName = l.name.replace(/\.safetensors$/i, '').replace(/[-_]/g, ' ');
      return `${cleanName} style`;
    })
    .filter(Boolean);

  let finalPrompt = positivePrompt;
  if (triggerList.length > 0) {
    const combined = triggerList.join(', ');
    if (!finalPrompt.includes(combined)) {
      finalPrompt = `${combined}, ${finalPrompt}`.trim();
    }
  }

  const payload = {
    prompt: finalPrompt,
    config: {
      aspectRatio,
      negativePrompt: negativePrompt || undefined,
      guidanceScale: params.cfg || 5.0,
      seed: params.seed,
    },
    loras: params.loras,
  };

  return {
    engine: 'gemini',
    payload,
    transformedPrompt: finalPrompt,
    transformedNegativePrompt: negativePrompt,
    loraShapeDescription: '语义触发词注入与指导尺度调制 (Semantic Trigger Distillation)',
    parameterMappings: {
      dimensions: `aspectRatio ("${aspectRatio}")`,
      cfg: 'guidanceScale',
      negativePrompt: 'config.negativePrompt',
      loras: '提示词前置注入 (Prefix Conditioning)',
    },
  };
}
