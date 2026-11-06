/**
 * Preset Model Selection and Verification Helper.
 * Tracks model currency, official verification sources, and explicit selection requirements.
 * Used by WorkflowPresetsModal and preset audits without hardcoding global bans.
 */

export interface PresetModelVerification {
  presetId: string;
  provider: string;
  model: string;
  task: 't2i' | 't2v' | 'i2v';
  status: 'verified_current' | 'needs_selection';
  verificationDate: string;
  officialSource: string;
  notes?: string;
}

export const PRESET_MODEL_VERIFICATIONS: Record<string, PresetModelVerification> = {
  'std-huggingface-t2i': {
    presetId: 'std-huggingface-t2i',
    provider: 'huggingface',
    model: 'renderartist/Technically-Color-Z-Image-Turbo',
    task: 't2i',
    status: 'verified_current',
    verificationDate: '2026-11-06',
    officialSource: 'https://huggingface.co/api/models/Tongyi-MAI/Z-Image-Turbo (inferenceProviderMapping fal-ai)',
    notes: 'Z-Image-Turbo 现代开源模型，配方 civitai.red/images/113739497',
  },
  'std-modelscope-t2i': {
    presetId: 'std-modelscope-t2i',
    provider: 'modelscope',
    model: 'Tongyi-MAI/Z-Image-Turbo',
    task: 't2i',
    status: 'verified_current',
    verificationDate: '2026-11-06',
    officialSource: 'https://www.modelscope.cn/models/Tongyi-MAI/Z-Image-Turbo',
    notes: '魔搭官方 API Token 模型页，配方 civitai.red/images/113739497',
  },
  'std-modelscope-ai-t2i': {
    presetId: 'std-modelscope-ai-t2i',
    provider: 'modelscope_ai',
    model: 'Tongyi-MAI/Z-Image-Turbo',
    task: 't2i',
    status: 'verified_current',
    verificationDate: '2026-11-06',
    officialSource: 'https://modelscope.ai/models/Tongyi-MAI/Z-Image-Turbo',
    notes: '魔搭国际站官方模型，LoRA ST-TNG-Rooms-Z-Image-Turbo-v1',
  },
  'std-nanogpt-t2i': {
    presetId: 'std-nanogpt-t2i',
    provider: 'nanogpt',
    model: 'moss-image',
    task: 't2i',
    status: 'verified_current',
    verificationDate: '2026-11-06',
    officialSource: 'https://api.nano-gpt.com/api/v1/images/models/moss-image/endpoints',
    notes: 'OpenMOSS 官方开源 MOSS Image 模型在 NanoGPT 在线推理端点',
  },
  'std-fal-t2i': {
    presetId: 'std-fal-t2i',
    provider: 'fal',
    model: 'fal-ai/krea-2/turbo/lora',
    task: 't2i',
    status: 'verified_current',
    verificationDate: '2026-11-06',
    officialSource: 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/krea-2/turbo/lora',
    notes: 'Krea 2 Turbo LoRA 现代端点，配方 civitai.red/images/142361732',
  },
  'std-tensorart-t2i': {
    presetId: 'std-tensorart-t2i',
    provider: 'tensorart',
    model: 'photoreal_studio_z_image',
    task: 't2i',
    status: 'verified_current',
    verificationDate: '2026-11-06',
    officialSource: 'OpenWorks API',
    notes: 'Z-Image 基于 OpenWorks 现代出图流程',
  },
  'std-muapi-t2i': {
    presetId: 'std-muapi-t2i',
    provider: 'muapi',
    model: 'krea-v2-turbo-lora',
    task: 't2i',
    status: 'needs_selection',
    verificationDate: '2026-11-06',
    officialSource: 'https://api.muapi.ai/openapi.json',
    notes: '已更新至 Krea 2 Turbo LoRA 端点；因无实测 LoRA 配方诚实标待配方',
  },
  'std-wavespeed-t2i': {
    presetId: 'std-wavespeed-t2i',
    provider: 'wavespeed',
    model: 'wavespeed-ai/krea-v2/turbo-lora',
    task: 't2i',
    status: 'needs_selection',
    verificationDate: '2026-11-06',
    officialSource: 'https://api.wavespeed.ai/api/v3/models',
    notes: '已更新至 Krea 2 Turbo LoRA 端点；因无实测 LoRA 配方诚实标待配方',
  },
  'std-krea-t2i': {
    presetId: 'std-krea-t2i',
    provider: 'krea',
    model: 'image/krea/krea-2/medium-turbo',
    task: 't2i',
    status: 'verified_current',
    verificationDate: '2026-11-06',
    officialSource: 'https://api.krea.ai/openapi.json',
    notes: 'Krea 2 官方端点',
  },
  'std-together-t2i': {
    presetId: 'std-together-t2i',
    provider: 'together',
    model: 'black-forest-labs/FLUX.2-dev',
    task: 't2i',
    status: 'verified_current',
    verificationDate: '2026-11-06',
    officialSource: 'https://docs.together.ai/reference/models',
    notes: 'Together FLUX.2 现代基模',
  },
  'std-aimlapi-t2i': {
    presetId: 'std-aimlapi-t2i',
    provider: 'aimlapi',
    model: 'alibaba/z-image-turbo-lora',
    task: 't2i',
    status: 'verified_current',
    verificationDate: '2026-11-06',
    officialSource: 'https://docs.aimlapi.com',
    notes: 'Z-Image Turbo 现代端点',
  },
  'std-novita-t2i': {
    presetId: 'std-novita-t2i',
    provider: 'novita',
    model: '',
    task: 't2i',
    status: 'needs_selection',
    verificationDate: '2026-11-06',
    officialSource: 'https://api.novita.ai/v3/model',
    notes: '已下线 SD1.5 老旧预设推荐，保留完整文生图工作流拓扑供用户在模型库中显式选择',
  },
  'std-venice-t2i': {
    presetId: 'std-venice-t2i',
    provider: 'venice',
    model: 'venice-sd35',
    task: 't2i',
    status: 'verified_current',
    verificationDate: '2026-11-06',
    officialSource: 'https://docs.venice.ai/api-reference/endpoint/image/generate',
    notes: 'Stable Diffusion 3.5 Large 基模',
  },
  'std-deepinfra-t2i': {
    presetId: 'std-deepinfra-t2i',
    provider: 'deepinfra',
    model: 'black-forest-labs/FLUX-2-klein-9b',
    task: 't2i',
    status: 'verified_current',
    verificationDate: '2026-11-06',
    officialSource: 'https://api.deepinfra.com/models/list?type=text-to-image',
    notes: 'DeepInfra 官方精选 FLUX.2 Klein 9B 现代模型',
  },
  'std-sogni-t2i': {
    presetId: 'std-sogni-t2i',
    provider: 'sogni',
    model: 'krea-2-turbo',
    task: 't2i',
    status: 'verified_current',
    verificationDate: '2026-11-06',
    officialSource: 'https://raw.githubusercontent.com/Sogni-AI/sogni-protocol/main/schemas/tools/generate_image.schema.json',
    notes: 'Krea 2 Turbo + krea2-fever-dream-mood 配方 142361732',
  },
  'std-replicate-t2i': {
    presetId: 'std-replicate-t2i',
    provider: 'replicate',
    model: '',
    task: 't2i',
    status: 'needs_selection',
    verificationDate: '2026-11-06',
    officialSource: 'https://api.replicate.com/v1/models',
    notes: '已下线 FLUX.1 dev 老旧预设推荐，保留完整文生图工作流拓扑供用户显式选择',
  },
  'std-runware-t2i': {
    presetId: 'std-runware-t2i',
    provider: 'runware',
    model: '',
    task: 't2i',
    status: 'needs_selection',
    verificationDate: '2026-11-06',
    officialSource: 'https://docs.runware.ai',
    notes: '已下线 runware:100@1 老旧推荐，保留完整文生图拓扑供用户显式选择',
  },
  'std-modelslab-t2i': {
    presetId: 'std-modelslab-t2i',
    provider: 'modelslab',
    model: '',
    task: 't2i',
    status: 'needs_selection',
    verificationDate: '2026-11-06',
    officialSource: 'https://docs.modelslab.com',
    notes: '已下线 SDXL 1.0 tamarin-xl 老旧推荐，保留完整文生图拓扑供用户显式选择',
  },
  'std-agnes-t2i': {
    presetId: 'std-agnes-t2i',
    provider: 'agnes',
    model: 'agnes-image-2.5-flash',
    task: 't2i',
    status: 'verified_current',
    verificationDate: '2026-11-06',
    officialSource: 'https://wiki.agnes-ai.com',
    notes: 'Agnes 2.5 Flash 现代端点',
  },
  'std-mage-t2i': {
    presetId: 'std-mage-t2i',
    provider: 'mage',
    model: 'mango-v3',
    task: 't2i',
    status: 'verified_current',
    verificationDate: '2026-11-06',
    officialSource: 'https://docs.mage.space/api/models/mango',
    notes: 'Mango 3 现代端点',
  },
  'std-sensenova-t2i': {
    presetId: 'std-sensenova-t2i',
    provider: 'sensenova',
    model: 'sensenova-u1.5-lite',
    task: 't2i',
    status: 'verified_current',
    verificationDate: '2026-11-06',
    officialSource: 'SenseNova Token Plan',
    notes: 'SenseNova 1.5 Lite 现代端点',
  },
  'std-civitai-t2i': {
    presetId: 'std-civitai-t2i',
    provider: 'civitai',
    model: 'turbo',
    task: 't2i',
    status: 'verified_current',
    verificationDate: '2026-11-06',
    officialSource: 'https://orchestration.civitai.com/v2/consumer',
    notes: 'Civitai Krea 2 Turbo 原生 ComfyUI 引擎',
  },
  'std-gemini-t2i': {
    presetId: 'std-gemini-t2i',
    provider: 'gemini',
    model: 'gemini-3.1-flash-image',
    task: 't2i',
    status: 'verified_current',
    verificationDate: '2026-11-06',
    officialSource: 'https://ai.google.dev/gemini-api/docs/image-generation',
    notes: 'Gemini 3.1 Flash Image 官方图像模型',
  },
  'std-fal-t2v': {
    presetId: 'std-fal-t2v',
    provider: 'fal',
    model: 'fal-ai/kling-video/v3/standard/text-to-video',
    task: 't2v',
    status: 'verified_current',
    verificationDate: '2026-11-06',
    officialSource: 'https://api.fal.ai/v1/models',
    notes: 'Kling Video v3 Standard 文生视频',
  },
  'std-fal-i2v': {
    presetId: 'std-fal-i2v',
    provider: 'fal',
    model: 'fal-ai/kling-video/v3/standard/image-to-video',
    task: 'i2v',
    status: 'verified_current',
    verificationDate: '2026-11-06',
    officialSource: 'https://fal.run/fal-ai/kling-video/v3/standard/image-to-video',
    notes: 'Kling Video v3 Standard 图生视频',
  },
  'std-civitai-t2v': {
    presetId: 'std-civitai-t2v',
    provider: 'civitai',
    model: 'urn:air:wanvideo-22-t2v-a14b:checkpoint:civitai:1817671@2114154',
    task: 't2v',
    status: 'verified_current',
    verificationDate: '2026-11-06',
    officialSource: 'https://developer.civitai.com/orchestration/recipes/wan.md',
    notes: 'Civitai 官方原生 Wan 2.2 文本视频生成',
  },
  'std-civitai-i2v': {
    presetId: 'std-civitai-i2v',
    provider: 'civitai',
    model: 'urn:air:wanvideo-22-i2v-a14b:checkpoint:civitai:1817671@2114157',
    task: 'i2v',
    status: 'verified_current',
    verificationDate: '2026-11-06',
    officialSource: 'https://developer.civitai.com/orchestration/recipes/wan.md',
    notes: 'Civitai 官方原生 Wan 2.2 图生视频',
  },
  'std-wavespeed-t2v': {
    presetId: 'std-wavespeed-t2v',
    provider: 'wavespeed',
    model: '',
    task: 't2v',
    status: 'needs_selection',
    verificationDate: '2026-11-06',
    officialSource: 'https://api.wavespeed.ai/api/v3/models',
    notes: '已下线 Wan 2.1 老旧推荐，保留完整视频工作流拓扑供用户显式选择',
  },
  'std-wavespeed-i2v': {
    presetId: 'std-wavespeed-i2v',
    provider: 'wavespeed',
    model: '',
    task: 'i2v',
    status: 'needs_selection',
    verificationDate: '2026-11-06',
    officialSource: 'https://api.wavespeed.ai/api/v3/models',
    notes: '已下线 Wan 2.1 老旧推荐，保留完整视频工作流拓扑供用户显式选择',
  },
  'std-muapi-t2v': {
    presetId: 'std-muapi-t2v',
    provider: 'muapi',
    model: '',
    task: 't2v',
    status: 'needs_selection',
    verificationDate: '2026-11-06',
    officialSource: 'https://api.muapi.ai/openapi.json',
    notes: '已下线 Wan 2.1 老旧推荐，保留完整视频工作流拓扑供用户显式选择',
  },
  'std-muapi-i2v': {
    presetId: 'std-muapi-i2v',
    provider: 'muapi',
    model: '',
    task: 'i2v',
    status: 'needs_selection',
    verificationDate: '2026-11-06',
    officialSource: 'https://api.muapi.ai/openapi.json',
    notes: '已下线 Wan 2.1 老旧推荐，保留完整视频工作流拓扑供用户显式选择',
  },
  'std-replicate-t2v': {
    presetId: 'std-replicate-t2v',
    provider: 'replicate',
    model: '',
    task: 't2v',
    status: 'needs_selection',
    verificationDate: '2026-11-06',
    officialSource: 'https://api.replicate.com/v1/models',
    notes: '已下线 Wan 2.1 老旧推荐，保留完整视频工作流拓扑供用户显式选择',
  },
  'std-replicate-i2v': {
    presetId: 'std-replicate-i2v',
    provider: 'replicate',
    model: '',
    task: 'i2v',
    status: 'needs_selection',
    verificationDate: '2026-11-06',
    officialSource: 'https://api.replicate.com/v1/models',
    notes: '已下线 Wan 2.1 老旧推荐，保留完整视频工作流拓扑供用户显式选择',
  },
  'std-novita-i2v': {
    presetId: 'std-novita-i2v',
    provider: 'novita',
    model: '',
    task: 'i2v',
    status: 'needs_selection',
    verificationDate: '2026-11-06',
    officialSource: 'https://api.novita.ai/v3/model',
    notes: '已彻底下线 2023 年老旧 SVD-XT 推荐，保留完整图生视频拓扑供用户显式选择',
  },
};

/**
 * Returns true if a model string corresponds to an outdated model that must not be recommended
 * in built-in default presets (e.g. SD 1.5, legacy FLUX.1 dev/schnell, Wan 2.1, SVD-XT).
 * Note: Users can still manually enter/select these models; this only guards built-in preset recommendations.
 */
export function isLegacyPresetRecommendation(model: string): boolean {
  if (!model) return false;
  const m = model.toLowerCase();
  // SD 1.5 indicators
  if (m.includes('dreamshaper_8') || m.includes('sd_1.5') || m.includes('sd1.5') || m.includes('v1-5')) return true;
  // SVD-XT
  if (m.includes('svd-xt') || m.includes('svd_xt')) return true;
  // FLUX 1 Schnell / Dev recommendations
  if (m === 'flux-schnell' || m === 'fal-ai/flux-lora' || m === 'black-forest-labs/flux-dev-lora' || m === 'black-forest-labs/flux-1-schnell' || m === 'wavespeed-ai/flux-dev-lora') return true;
  // Standalone legacy Wan 2.1 without LoRA
  if (m === 'fal-ai/wan-t2v') return true;
  return false;
}

/**
 * Helper to get verification metadata for a preset id.
 */
export function getPresetModelVerification(presetId: string): PresetModelVerification | undefined {
  return PRESET_MODEL_VERIFICATIONS[presetId];
}
