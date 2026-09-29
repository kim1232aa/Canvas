/**
 * ComfyCanvas - Intelligent Base Model & LoRA Architecture Matching Engine
 * 
 * Accurately normalizes Civitai/HuggingFace base models and dynamically matches
 * compatible Checkpoint models from the Base Model Library across all providers (Fal.ai, ModelScope, NanoGPT, Gemini).
 */

import { isLoraUnsupportedOnEndpoint } from './resolveCheckpoint';

export type ModelArchitectureFamily =
  | 'flux'
  | 'sdxl'
  | 'pony'
  | 'illustrious'
  | 'sd15'
  | 'sd35'
  | 'krea2'
  | 'wan21'
  | 'video'
  | 'imagen'
  | 'unknown';

export interface BaseArchitectureInfo {
  family: ModelArchitectureFamily;
  displayName: string;
  recommendedCheckpoint: string;
  alternativeCheckpoints: string[];
  recommendedSteps: number;
  recommendedCfg: number;
  recommendedSampler: string;
  recommendedScheduler: string;
  defaultWidth: number;
  defaultHeight: number;
  description: string;
}

/**
 * Base Model Family Profiles with tuned defaults
 */
export const ARCHITECTURE_PROFILES: Record<ModelArchitectureFamily, BaseArchitectureInfo> = {
  flux: {
    family: 'flux',
    displayName: 'FLUX.1 扩散引擎',
    recommendedCheckpoint: 'flux-dev',
    alternativeCheckpoints: ['flux-schnell', 'flux-dev', 'black-forest-labs/FLUX.1-dev', 'AI-ModelScope/flux.1-dev'],
    recommendedSteps: 28,
    recommendedCfg: 3.5,
    recommendedSampler: 'euler',
    recommendedScheduler: 'simple',
    defaultWidth: 1024,
    defaultHeight: 1024,
    description: 'Black Forest Labs FLUX.1 架构，专配 Flux.1 D / Flux.1 S LoRA',
  },
  sdxl: {
    family: 'sdxl',
    displayName: 'SDXL 1.0 高清基底',
    recommendedCheckpoint: 'sdxl-base-1.0',
    alternativeCheckpoints: ['sdxl', 'stabilityai/stable-diffusion-xl-base-1.0', 'AI-ModelScope/stable-diffusion-xl-base-1.0'],
    recommendedSteps: 30,
    recommendedCfg: 6.0,
    recommendedSampler: 'dpmpp_2m',
    recommendedScheduler: 'karras',
    defaultWidth: 1024,
    defaultHeight: 1024,
    description: 'Stability AI SDXL 1.0 标准架构，兼容万款 SDXL 系列 LoRA',
  },
  pony: {
    family: 'pony',
    displayName: 'Pony Diffusion XL 架构',
    recommendedCheckpoint: 'pony-diffusion-v6',
    alternativeCheckpoints: ['pony', 'sdxl-base-1.0'],
    recommendedSteps: 30,
    recommendedCfg: 5.5,
    recommendedSampler: 'dpmpp_2m',
    recommendedScheduler: 'karras',
    defaultWidth: 1024,
    defaultHeight: 1024,
    description: 'Pony V6/Realism 架构，使用 score_9/source_real 标签体系',
  },
  illustrious: {
    family: 'illustrious',
    displayName: 'Illustrious / NoobAI 动漫大模型',
    recommendedCheckpoint: 'illustrious-xl',
    alternativeCheckpoints: ['noobai-xl', 'sdxl-base-1.0'],
    recommendedSteps: 28,
    recommendedCfg: 5.0,
    recommendedSampler: 'euler_ancestral',
    recommendedScheduler: 'normal',
    defaultWidth: 1024,
    defaultHeight: 1024,
    description: 'Illustrious-XL 及 NoobAI 架构，二次元/游戏机甲专用',
  },
  sd15: {
    family: 'sd15',
    displayName: 'Stable Diffusion 1.5 经典生态',
    recommendedCheckpoint: 'stable-diffusion-v1-5',
    alternativeCheckpoints: ['sd15', 'runwayml/stable-diffusion-v1-5'],
    recommendedSteps: 25,
    recommendedCfg: 7.0,
    recommendedSampler: 'dpmpp_2m',
    recommendedScheduler: 'karras',
    defaultWidth: 512,
    defaultHeight: 768,
    description: 'SD 1.5 经典轻量生态，专配 SD 1.5 LoRA',
  },
  sd35: {
    family: 'sd35',
    displayName: 'SD 3.5 Large / Medium',
    recommendedCheckpoint: 'stable-diffusion-v35-large',
    alternativeCheckpoints: ['sd3.5-large', 'sd3.5-medium'],
    recommendedSteps: 28,
    recommendedCfg: 4.5,
    recommendedSampler: 'dpmpp_2m',
    recommendedScheduler: 'karras',
    defaultWidth: 1024,
    defaultHeight: 1024,
    description: 'Stability AI 8B 多模态 DiT 架构',
  },
  krea2: {
    family: 'krea2',
    displayName: 'Krea 2 Turbo 极速架构',
    recommendedCheckpoint: 'krea2-turbo',
    alternativeCheckpoints: ['krea-2-turbo', 'damo/krea2_turbo_fp8_scaled'],
    recommendedSteps: 10,
    recommendedCfg: 2.0,
    recommendedSampler: 'euler_ancestral',
    recommendedScheduler: 'simple',
    defaultWidth: 1024,
    defaultHeight: 1024,
    description: 'Civitai 官方原生与 Krea 2 Turbo 毫秒级极速推理架构 (8~12 steps)',
  },
  wan21: {
    family: 'wan21',
    displayName: 'Wan 2.1 (通义万相 2.1 中文生图/生视频)',
    recommendedCheckpoint: 'wan2.1-t2i',
    alternativeCheckpoints: ['damo/wan2.1-t2i', 'wan2.1-t2v'],
    recommendedSteps: 30,
    recommendedCfg: 6.0,
    recommendedSampler: 'euler',
    recommendedScheduler: 'normal',
    defaultWidth: 1024,
    defaultHeight: 1024,
    description: '阿里通义万相 2.1 中文理解与电影级视频大模型',
  },
  video: {
    family: 'video',
    displayName: 'AI 视频大模型 (Wan 2.1 / LTX / Kling)',
    recommendedCheckpoint: 'wan2.1-video',
    alternativeCheckpoints: ['ltx-video', 'minimax-video'],
    recommendedSteps: 30,
    recommendedCfg: 6.0,
    recommendedSampler: 'euler',
    recommendedScheduler: 'normal',
    defaultWidth: 1280,
    defaultHeight: 720,
    description: '动态视频流生成，支持 720p/1080p 影视运镜',
  },
  imagen: {
    family: 'imagen',
    displayName: 'Google Gemini 生图 (官方直连引擎)',
    // G4: 不推荐具体 Gemini 模型（由用户在 schema 列出的模型中选择）
    recommendedCheckpoint: '',
    alternativeCheckpoints: [],
    recommendedSteps: 28,
    recommendedCfg: 4.0,
    recommendedSampler: 'euler',
    recommendedScheduler: 'normal',
    defaultWidth: 1024,
    defaultHeight: 1024,
    description: 'Google 官方 Gemini 生图 (generateContent)，不支持 steps/CFG/sampler/LoRA',
  },
  unknown: {
    family: 'unknown',
    displayName: '自定义/原生架构',
    recommendedCheckpoint: '', 
    alternativeCheckpoints: [],
    recommendedSteps: 28,
    recommendedCfg: 5.0,
    recommendedSampler: 'euler',
    recommendedScheduler: 'normal',
    defaultWidth: 1024,
    defaultHeight: 1024,
    description: '采用 Civitai 原始元数据定义的架构，未经过预设规则拦截或兜底。',
  },
};

/**
 * Parses raw baseModel string from Civitai API or model name and identifies the architectural family
 */
export function identifyArchitectureFamily(baseModelRaw?: string, modelNameHint?: string): ModelArchitectureFamily {
  const raw = `${baseModelRaw || ''} ${modelNameHint || ''}`.toLowerCase();

  if (raw.includes('flux') || raw.includes('bfl') || raw.includes('schnell') || raw.includes('dev') || raw.includes('618692') || raw.includes('613730')) {
    return 'flux';
  }
  if (raw.includes('krea') || raw.includes('krea2') || raw.includes('krea-2') || raw.includes('zimage') || raw.includes('z-image') || raw.includes('z_image') || raw.includes('3290120')) {
    return 'krea2';
  }
  if (raw.includes('pony') || raw.includes('pdxl') || raw.includes('257749')) {
    return 'pony';
  }
  if (raw.includes('illustrious') || raw.includes('noobai') || raw.includes('noob')) {
    return 'illustrious';
  }
  if (raw.includes('wan') || raw.includes('wan2.1') || raw.includes('wan-2.1') || raw.includes('tongyi') || raw.includes('damo')) {
    return 'wan21';
  }
  if (raw.includes('video') || raw.includes('ltx') || raw.includes('kling') || raw.includes('minimax') || raw.includes('hailuo') || raw.includes('cogvideox')) {
    return 'video';
  }
  if (raw.includes('sd 3.5') || raw.includes('sd3.5') || raw.includes('sd 3') || raw.includes('sd3')) {
    return 'sd35';
  }
  if (raw.includes('sd 1.5') || raw.includes('sd1.5') || raw.includes('v1-5') || raw.includes('sd 1.4') || raw.includes('sd15') || raw.includes('runwayml') || raw.includes('4201')) {
    return 'sd15';
  }
  if (raw.includes('imagen') || raw.includes('gemini') || raw.includes('google')) {
    return 'imagen';
  }
  if (raw.includes('sdxl') || raw.includes('xl') || raw.includes('animagine') || raw.includes('juggernaut') || raw.includes('133005') || raw.includes('101055')) {
    return 'sdxl';
  }

  // IMPORTANT: Return 'unknown' so raw model identifiers are preserved transparently.
  return 'unknown';
}

/**
 * Matches the optimal base model and recommended generation parameters given a LoRA or Checkpoint
 */
export function matchBaseModelFromArchitecture(
  baseModelRaw?: string,
  modelNameHint?: string,
  preferredProvider?: string
): BaseArchitectureInfo {
  const family = identifyArchitectureFamily(baseModelRaw, modelNameHint);
  const baseProfile = { ...ARCHITECTURE_PROFILES[family] };

  // Always prefer the exact raw base model if provided
  if (baseModelRaw) {
    baseProfile.recommendedCheckpoint = baseModelRaw;
  } else if (modelNameHint) {
    baseProfile.recommendedCheckpoint = modelNameHint;
  }

  if (family === 'unknown') {
    if (baseModelRaw) baseProfile.displayName = `原生: ${baseModelRaw}`;
    else if (modelNameHint) baseProfile.displayName = `模型: ${modelNameHint}`;
    baseProfile.recommendedCheckpoint = baseModelRaw || modelNameHint || '';
  }

  return baseProfile;
}

/**
 * Validates whether a Checkpoint and LoRA are architecturally compatible
 */
export function validateModelCompatibility(
  checkpointName: string,
  loraBaseModelRaw?: string,
  loraName?: string,
  preferredProvider?: string
): { isCompatible: boolean; message: string; recommendedCheckpoint?: string } {
  const ckptLower = (checkpointName || '').toLowerCase();
  const loraLower = (loraBaseModelRaw || '').toLowerCase();

  // 1. Direct string match or containment means 100% compatible
  if (ckptLower && loraLower && (ckptLower === loraLower || ckptLower.includes(loraLower) || loraLower.includes(ckptLower))) {
    return {
      isCompatible: true,
      message: `底模与 LoRA 架构精准匹配 (${loraBaseModelRaw || checkpointName})`,
    };
  }

  const ckptFamily = identifyArchitectureFamily(checkpointName, checkpointName);
  const loraFamily = identifyArchitectureFamily(loraBaseModelRaw, loraName);

  // 2. Unknown architecture or matching family is compatible
  if (ckptFamily === 'unknown' || loraFamily === 'unknown' || ckptFamily === loraFamily) {
    return {
      isCompatible: true,
      message: `底模与 LoRA 架构已知兼容 (${loraBaseModelRaw || checkpointName})`,
    };
  }

  // 3. SDXL cross-compatibility with Pony & Illustrious
  const isSdxlCross =
    (ckptFamily === 'sdxl' && (loraFamily === 'pony' || loraFamily === 'illustrious')) ||
    (ckptFamily === 'pony' && loraFamily === 'sdxl') ||
    (ckptFamily === 'illustrious' && loraFamily === 'sdxl');

  if (isSdxlCross) {
    return {
      isCompatible: true,
      message: `底模与 LoRA 架构衍生兼容 (${ARCHITECTURE_PROFILES[ckptFamily].displayName})`,
    };
  }

  const rec = ARCHITECTURE_PROFILES[loraFamily];
  let targetRecCheckpoint = rec.recommendedCheckpoint;
  const prov = (preferredProvider || "").toLowerCase();
  
  // Dynamic mapping based on provider if possible, but don't force a provider switch here
  if (loraFamily === "krea2") {
    if (prov === "huggingface") targetRecCheckpoint = "krea-ai/krea-2-turbo";
    else if (prov === "fal") targetRecCheckpoint = "fal-ai/krea-2/turbo";
    else if (prov === "modelscope") targetRecCheckpoint = "damo/krea2_turbo_fp8_scaled";
  } else if (loraFamily === "flux") {
    if (prov === "huggingface") targetRecCheckpoint = "black-forest-labs/FLUX.1-dev";
    else if (prov === "modelscope") targetRecCheckpoint = "AI-ModelScope/flux.1-dev";
    else if (prov === "nanogpt") targetRecCheckpoint = "flux-dev";
    else if (prov === "fal") targetRecCheckpoint = "fal-ai/flux/dev";
  } else if (loraFamily === "sdxl" || loraFamily === "pony" || loraFamily === "illustrious") {
    if (prov === "huggingface") targetRecCheckpoint = "stabilityai/stable-diffusion-xl-base-1.0";
    else if (prov === "modelscope") targetRecCheckpoint = "AI-ModelScope/stable-diffusion-xl-base-1.0";
    else if (prov === "fal") targetRecCheckpoint = "fal-ai/fast-sdxl";
    else if (prov === "nanogpt") targetRecCheckpoint = "sdxl";
  } else if (loraFamily === "sd15") {
    if (prov === "huggingface") targetRecCheckpoint = "runwayml/stable-diffusion-v1-5";
  }
  
  return {
    isCompatible: false,
    message: `⚠️ 架构不匹配：当前底模为【${checkpointName}】，但 LoRA 基于【${loraBaseModelRaw || rec.displayName}】。`,
    recommendedCheckpoint: targetRecCheckpoint,
  };
}

/**
 * Automatically calculates the recommended base model and parameter adjustments
 * when a user selects a LoRA from Civitai, HuggingFace, ModelScope or Fal.
 */
export function getRecommendedBaseModelForLora(
  loraBaseModelRaw?: string,
  loraName?: string,
  preferredProvider?: string
): BaseArchitectureInfo {
  return matchBaseModelFromArchitecture(loraBaseModelRaw, loraName, preferredProvider);
}

/**
 * LoRA compatibility for UI banners.
 * If the *current* node's Fal/Gemini/Civitai endpoint marks loras unsupported,
 * return that message — never compare against an unrelated canvas checkpoint (e.g. Z-Image-Turbo).
 */
export function validateLoraCompatibility(
  checkpointName: string,
  loraBaseModelRaw?: string,
  loraName?: string,
  preferredProvider?: string
): { isCompatible: boolean; message: string; recommendedCheckpoint?: string; endpointUnsupported?: boolean } {
  const endpoint = isLoraUnsupportedOnEndpoint(preferredProvider, checkpointName);
  if (endpoint.unsupported && endpoint.message) {
    return {
      isCompatible: false,
      message: endpoint.message,
      endpointUnsupported: true,
    };
  }
  return validateModelCompatibility(checkpointName, loraBaseModelRaw, loraName, preferredProvider);
}
