/** Human-readable provider labels for node titles (never raw ids like GROK_COMPAT). */
export const PROVIDER_TITLE_LABEL: Record<string, string> = {
  grok_compat: 'Grok 兼容中转',
  openai_compat: 'OpenAI 兼容中转',
  gemini: 'Gemini',
  fal: 'Fal.ai',
  civitai: 'Civitai',
  huggingface: 'Hugging Face',
  modelscope: '魔搭 CN',
  modelscope_ai: '魔搭 AI',
  agnes: 'Agnes',
  nanogpt: 'NanoGPT',
  sensenova: 'SenseNova',
  tensorart: 'Tensor.Art',
  video: 'AI Video',
};

/** Closed-source / non-Comfy cloud engines that must not show leftover Comfy sampler badges. */
export const NON_COMFY_CLOUD_PROVIDERS = new Set(['gemini', 'openai_compat', 'grok_compat']);

export function isNonComfyCloudProvider(provider: string | undefined | null): boolean {
  return NON_COMFY_CLOUD_PROVIDERS.has(String(provider || '').trim());
}

export function friendlyProviderLabel(provider: string | undefined | null): string {
  const prov = String(provider || '').trim();
  if (!prov) return '';
  return PROVIDER_TITLE_LABEL[prov] || prov;
}

/**
 * True when checkpoint looks like it belongs to the active closed-source engine.
 * Leftover MODELSCOPE / FLUX / fal-ai ids must NOT count as Gemini/OpenAI/Grok models.
 */
export function checkpointMatchesCloudProvider(
  provider: string | undefined | null,
  checkpoint: string | undefined | null
): boolean {
  const prov = String(provider || '').trim();
  const c = String(checkpoint || '').trim().toLowerCase();
  if (!prov || !c) return false;
  if (prov === 'gemini') return c.includes('gemini') || c.includes('imagen');
  if (prov === 'openai_compat') {
    return c.includes('gpt-image') || c.includes('dall-e') || c.includes('chatgpt-image') || c.includes('openai');
  }
  if (prov === 'grok_compat') return c.includes('grok');
  return true;
}

/** SpatialFrame header model chip: never advertise leftover MODELSCOPE/FLUX under Gemini/compat. */
export function spatialFrameModelLabel(
  provider: string | undefined | null,
  checkpoint: string | undefined | null
): string {
  const prov = String(provider || '').trim();
  const ckpt = String(checkpoint || '').trim();
  if (isNonComfyCloudProvider(prov)) {
    if (checkpointMatchesCloudProvider(prov, ckpt)) {
      return ckpt.split('/').pop() || friendlyProviderLabel(prov);
    }
    return ckpt ? '未选择模型' : '未选择模型';
  }
  if (!ckpt) return '未选择模型';
  return ckpt.split('/').pop() || ckpt;
}

/** CheckpointLoader node title that tracks the current provider (or model short name). */
export function checkpointNodeTitle(provider: string | undefined | null, checkpoint?: string | undefined | null): string {
  const prov = String(provider || '').trim();
  if (prov) {
    const label = PROVIDER_TITLE_LABEL[prov] || prov;
    return `加载底模 (${label})`;
  }
  const ckpt = String(checkpoint || '').trim();
  if (ckpt) return `加载底模 (${ckpt.split('/').pop()})`;
  return '加载底模';
}

const STEP_AD_RE = /\d+\s*步/;
const SPEED_AD_RE = /极速/;

/**
 * KSampler title must not advertise step counts when steps are unsupported for the
 * active provider/model (same spirit as soft3 provider title tracking).
 */
export function ksamplerNodeTitle(
  existingTitle: string | undefined | null,
  stepsUnsupported: boolean
): string {
  const raw = String(existingTitle || '').trim() || 'KSampler';
  if (!stepsUnsupported) return raw;
  if (!STEP_AD_RE.test(raw) && !SPEED_AD_RE.test(raw)) return raw;
  let cleaned = raw
    .replace(/\s*\(\s*\d+\s*步[^)]*\)/g, '')
    .replace(/\s*\d+\s*步极速采样?/g, '')
    .replace(/\s*\d+\s*步极速/g, '')
    .replace(/\s*\d+\s*步/g, '')
    .replace(/\s*极速采样/g, '')
    .replace(/\s*极速/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\(\s*\)/g, '')
    .trim();
  cleaned = cleaned.replace(/\s+$/, '').replace(/\(\s*$/, '').trim();
  if (!cleaned || cleaned === 'KSampler' || /^KSampler\s*$/i.test(cleaned)) return 'KSampler';
  if (/^KSampler/i.test(cleaned)) return cleaned.replace(/\s{2,}/g, ' ').trim();
  return cleaned || 'KSampler';
}

/** Global top-bar pill when a SpatialFrame is active — must match the frame header chips. */
export function spatialFrameTopBarLabel(
  provider: string | undefined | null,
  checkpoint: string | undefined | null
): string {
  const prov = String(provider || '').trim();
  const modelLabel = spatialFrameModelLabel(prov, checkpoint);
  if (isNonComfyCloudProvider(prov)) {
    const eng = friendlyProviderLabel(prov) || prov;
    return `${eng} · ${modelLabel}`;
  }
  if (modelLabel && modelLabel !== '未选择模型') return modelLabel;
  if (prov) return friendlyProviderLabel(prov) || prov;
  return '未选择模型';
}

/** Drawer chrome prefix: cloud engines say 引擎参数, Comfy paths keep ComfyUI 参数. */
export function paramsDrawerFramePrefix(provider: string | undefined | null): string {
  return isNonComfyCloudProvider(provider) ? '引擎参数' : 'ComfyUI 参数';
}

/**
 * Drop marketing LoRA titles when the stack is cleared, and keep cloud-engine
 * auto titles tracking engine · model (so "Gemini · 未选择模型" updates once a
 * real model is chosen). Custom human titles are left alone.
 */
export function sanitizeFrameMarketingTitle(
  provider: string | undefined | null,
  checkpoint: string | undefined | null,
  title: string | undefined | null,
  nextLorasLength: number
): string {
  const raw = String(title || '').trim();
  const desired = spatialFrameTopBarLabel(provider, checkpoint);
  const advertisesLoraOrPack =
    /LoRA/i.test(raw) ||
    /\+\s*美胸/.test(raw) ||
    (/魔搭/.test(raw) && /Z-Image-Turbo/i.test(raw));

  if (isNonComfyCloudProvider(provider)) {
    const tracksEngine =
      advertisesLoraOrPack ||
      /未选择模型/.test(raw) ||
      raw === '取景生成框' ||
      /^(Gemini|Grok 兼容中转|OpenAI 兼容中转)\s*·/.test(raw);
    if (tracksEngine) return desired;
  }

  if (nextLorasLength === 0 && advertisesLoraOrPack) {
    if (desired && desired !== '未选择模型') return desired;
    return '取景生成框';
  }
  return raw;
}

