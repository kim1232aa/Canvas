/**
 * Civitai import field mappers.
 * Empty / Undefined / unknown must NOT forge euler or sgm_uniform.
 */
import {
  normalizeEcosystem as targetNormalizeEcosystem,
  inspectTargetSchemaForLoras,
  buildSendableLoraUrl,
  buildCivitaiCanonicalAir,
  type TargetLoraFormat,
  type TargetSchemaLoraSpec,
} from './civitaiTargetSchema';

const EMPTY_TOKENS = new Set(['', 'undefined', 'none', 'null', 'n/a', 'na']);

function normalizeToken(s: string): string {
  return (s || '').toLowerCase().trim();
}

export function mapSampler(s: string, engineOrProvider?: string): string {
  const lower = normalizeToken(s);
  if (!lower || EMPTY_TOKENS.has(lower)) return '';
  const isComfy = engineOrProvider === 'comfy';

  if (isComfy) {
    if (lower.includes('dpm++ 2m') || lower.includes('dpmpp_2m')) return 'dpmpp_2m';
    if (lower.includes('dpm++ sde') || lower.includes('dpmpp_sde')) return 'dpmpp_sde';
    if (lower.includes('dpm++ 3m sde') || lower.includes('dpmpp_3m_sde')) return 'dpmpp_3m_sde';
    if (lower.includes('euler a') || lower.includes('euler_ancestral') || lower.includes('euler_a')) return 'euler_ancestral';
    if (lower.includes('er_sde_simple')) return 'er_sde_simple';
    if (lower.includes('er_sde')) return 'er_sde';
    if (lower.includes('heun')) return 'heun';
    if (lower.includes('ddim')) return 'ddim';
    if (lower.includes('euler')) return 'euler';
    if (lower.includes('uni_pc')) return 'uni_pc';
    if (lower.includes('lms')) return 'lms';
    return '';
  }

  // Official Civitai sdcpp SdCppSampleMethod enum:
  // euler, heun, dpm2, dpm++2s_a, dpm++2m, dpm++2mv2, ipndm, ipndm_v, ddim_trailing, euler_a, lcm, res_multistep, res_2s, tcd, er_sde
  if (lower.includes('dpm++ 2m v2') || lower.includes('dpm++2mv2') || lower.includes('dpmpp_2m_v2')) return 'dpm++2mv2';
  if (lower.includes('dpm++ 2m') || lower.includes('dpm++2m') || lower.includes('dpmpp_2m')) return 'dpm++2m';
  if (lower.includes('dpm++ 2s a') || lower.includes('dpm++2s_a') || lower.includes('dpmpp_2s_ancestral') || lower.includes('dpmpp_2s_a')) return 'dpm++2s_a';
  if (lower.includes('dpm2') || lower.includes('dpm_2')) return 'dpm2';
  if (lower.includes('euler a') || lower.includes('euler_a') || lower.includes('euler_ancestral')) return 'euler_a';
  if (lower.includes('heun')) return 'heun';
  if (lower.includes('lcm')) return 'lcm';
  if (lower.includes('tcd')) return 'tcd';
  if (lower.includes('res_multistep') || lower.includes('res multistep')) return 'res_multistep';
  if (lower.includes('res_2s') || lower.includes('res 2s')) return 'res_2s';
  if (lower.includes('ipndm_v') || lower.includes('ipndm v')) return 'ipndm_v';
  if (lower.includes('ipndm')) return 'ipndm';
  if (lower.includes('ddim_trailing') || lower.includes('ddim trailing')) return 'ddim_trailing';
  if (lower.includes('er_sde') || lower.includes('er sde') || lower.includes('er_sde_simple')) return 'er_sde';
  if (lower.includes('euler')) return 'euler';
  return '';
}

export function mapScheduler(s: string): string {
  const lower = normalizeToken(s);
  if (!lower || EMPTY_TOKENS.has(lower)) return '';
  if (lower.includes('karras')) return 'karras';
  if (lower.includes('sgm_uniform')) return 'sgm_uniform';
  if (lower.includes('exponential')) return 'exponential';
  if (lower.includes('simple')) return 'simple';
  if (lower.includes('normal')) return 'normal';
  // Unrecognized → empty, never forge a schedule
  return '';
}

/** Image-import: empty/missing negative must stay empty (no blurry template). */
export function resolveImportedNegativePrompt(
  metaNegative: unknown,
  templateDefault: string
): string {
  if (typeof metaNegative === 'string') return metaNegative;
  if (metaNegative == null) return '';
  // Non-string unexpected → empty rather than template fill
  void templateDefault;
  return '';
}

const isCheckpointType = (t: unknown) => String(t ?? '').toLowerCase() === 'checkpoint';
const idStr = (v: unknown) => (v == null ? '' : String(v).trim());

/**
 * Image-import checkpoint ref for resolveCivitaiAir. Prefers unique ids so we never
 * create ambiguity (e.g. "Flux.1 D") when modelId@versionId existed.
 * Name/architecture fallbacks may still be ambiguous — resolver reports that honestly.
 */
export function resolveImportedCheckpointRef(
  resources: unknown,
  meta: any,
  fallbackName: string,
  baseModel: string
): string {
  const ckpt: any = Array.isArray(resources)
    ? resources.find((r: any) => r && (isCheckpointType(r.modelType) || isCheckpointType(r.type)))
    : null;
  if (ckpt) {
    const air = idStr(ckpt.air);
    if (air) return air;
    const modelId = idStr(ckpt.modelId);
    const versionId = idStr(ckpt.versionId) || idStr(ckpt.modelVersionId);
    if (modelId && versionId) return `${modelId}@${versionId}`;
    if (/^\d+$/.test(versionId)) return versionId;
  }
  const metaCkpt: any = Array.isArray(meta?.civitaiResources)
    ? meta.civitaiResources.find((r: any) => r && isCheckpointType(r.type) && idStr(r.modelVersionId))
    : null;
  if (metaCkpt) return idStr(metaCkpt.modelVersionId);
  return idStr(meta?.Model) || idStr(ckpt?.modelName) || idStr(fallbackName) || idStr(baseModel);
}

/**
 * Plain-text / WebUI "Copy Generation Data" field resolution.
 * Never keeps template blurry-negative or forged sampler/scheduler defaults.
 * Scheduler only from an explicit Schedule/Scheduler field — never from Sampler name.
 */
export function resolveRawImportNegativeSamplerScheduler(fullText: string): {
  negativePrompt: string;
  sampler: string;
  scheduler: string;
} {
  const text = fullText || '';

  // Missing "Negative prompt:" line → undefined → ''; blank line → ''
  const negMatch = text.match(/Negative prompt:\s*([\s\S]*?)(?=(?:Steps:|$))/i);
  const negativePrompt = resolveImportedNegativePrompt(
    negMatch ? negMatch[1].trim() : undefined,
    ''
  );

  let sampler = '';
  const samplerMatch = text.match(/Sampler:\s*([^,\n]+)/i);
  if (samplerMatch) {
    sampler = mapSampler(samplerMatch[1]);
  }

  // Explicit schedule/scheduler only — do not derive from Sampler token
  let scheduler = '';
  const scheduleMatch = text.match(/(?:Schedule type|Scheduler|Schedule):\s*([^,\n]+)/i);
  if (scheduleMatch) {
    scheduler = mapScheduler(scheduleMatch[1]);
  }

  return { negativePrompt, sampler, scheduler };
}

/**
 * Detects if a model identifier string is merely a raw architecture family name
 * (such as "SDXL 1.0", "SD 1.5", "Flux.1 D", "Pony") rather than a concrete
 * checkpoint filename or Civitai URN / AIR / modelId@versionId reference.
 */
export function isRawBaseModelArchitectureText(text: string): boolean {
  if (!text) return false;
  const s = text.trim();
  if (!s) return false;
  // Concrete filenames with weights extensions
  if (/\.(?:safetensors|ckpt|pt|bin)$/i.test(s)) return false;
  // Explicit URNs or ID references
  if (s.startsWith('urn:air:') || s.startsWith('civitai:') || s.includes('@') || /^\d+$/.test(s)) return false;

  const RAW_ARCHITECTURES = new Set([
    'sdxl 1.0',
    'sdxl 0.9',
    'sdxl turbo',
    'sdxl lightning',
    'sdxl',
    'sd 1.5',
    'sd 1.4',
    'sd 2.0',
    'sd 2.1',
    'sd 3',
    'sd 3.5',
    'sd 3.5 large',
    'sd 3.5 medium',
    'flux.1',
    'flux.1 d',
    'flux.1 s',
    'flux.1 dev',
    'flux.1 schnell',
    'flux',
    'pony',
    'pony v6',
    'illustrious',
    'illustrious xl',
    'noobai',
    'noobai xl',
    'wan 2.1',
    'hunyuan video',
    'krea 2',
    'zimageturbo',
  ]);
  const lower = s.toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
  if (RAW_ARCHITECTURES.has(lower)) return true;

  if (/^(?:sdxl|sd|flux|pony|illustrious|wan)\b/i.test(lower) && !/\b(?:checkpoint|model|v\d{2,}|v\d+\.\d+\.\d+)\b/i.test(lower)) {
    if (/^(?:sdxl(?:\s*1\.0)?|sd\s*(?:1\.5|1\.4|2\.1|3\.5)|flux(?:\.1)?(?:\s*[ds])?|pony)$/i.test(lower)) {
      return true;
    }
  }
  return false;
}

export type FieldAdaptationStatus =
  | 'mapped'
  | 'unsupported'
  | 'unverified'
  | 'requires_consent'
  | 'manual_selection'
  | 'not_applicable';

export interface FieldAdaptationDetail {
  field: string;
  originalValue: any;
  targetField?: string;
  mappedValue?: any;
  status: FieldAdaptationStatus;
  humanMessage: string;
  source?: string;
}

export interface ProviderLoraAdaptation {
  name: string;
  originalStrength?: number | null;
  originalClipStrength?: number | null;
  civitaiId?: string;
  modelId?: number | string;
  versionId?: number | string;
  air?: string;
  baseModel?: string;
  canGenerate?: boolean;
  targetFormat?: TargetLoraFormat;
  sendableUrlOrId?: string;
  requiresAuthConsent?: boolean;
  scale?: number;
  inferredFromPrompt?: boolean;
  status: 'compatible' | 'architecture_mismatch' | 'requires_reselection' | 'requires_consent' | 'unsupported' | 'unverified';
  reason: string;
  unresolvedReason?: string;
}

export interface ProviderAdaptationResult {
  provider: string;
  displayName: string;
  isCompatible: boolean;
  baseModelArchitecture: string;
  baseModelStatus: 'direct' | 'requires_selection' | 'incompatible';
  baseModelMessage: string;
  fields: Record<string, FieldAdaptationDetail>;
  loras: ProviderLoraAdaptation[];
  unsupportedFields: string[];
  warnings: string[];
}

export type ProviderAdaptationMap = Record<string, ProviderAdaptationResult>;

export interface CivitaiRecipeInput {
  checkpoint?: string;
  baseModel?: string;
  engine?: string;
  loras?: Array<{
    name: string;
    displayName?: string;
    civitaiId?: string;
    modelId?: number | string;
    versionId?: number | string;
    air?: string;
    strength?: number | null;
    clipStrength?: number | null;
    triggers?: string;
    baseModel?: string;
    downloadUrl?: string;
    requireAuth?: boolean;
    canGenerate?: boolean;
    inferredFromPrompt?: boolean;
    unresolvedReason?: string;
    resolutionError?: any;
  }>;
  hash404Warnings?: string[];
  prompt?: string;
  negativePrompt?: string;
  steps?: number | null;
  cfg?: number | null;
  sampler?: string;
  scheduler?: string;
  seed?: number | null;
  clipSkip?: number | null;
  width?: number | null;
  height?: number | null;
  denoise?: number | null;
  hasInitImage?: boolean;
}

export const PROVIDER_LORA_CAPS: Record<string, { cap: number; source: string }> = {};

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  civitai: 'Civitai (原生生成引擎)',
  fal: 'Fal.ai (云端托管端点)',
  replicate: 'Replicate (云端模型平台)',
  wavespeed: 'WaveSpeed (极速推理)',
  huggingface: 'Hugging Face (Inference Providers)',
  modelscope: 'ModelScope CN (魔搭社区国内站)',
  modelscope_ai: 'ModelScope AI (魔搭国际站)',
  nanogpt: 'NanoGPT (轻量 API 聚合)',
  novita: 'Novita AI (Stable Diffusion 云端 API)',
  sogni: 'Sogni (去中心化推理网络)',
  aimlapi: 'AIMLAPI (多模型 API 网关)',
  muapi: 'MuAPI (极速模型 API)',
  tensorart: 'Tensor.Art (TAMS 官方开放平台)',
  video: 'AI Video (视频工作流引擎)',
  krea: 'Krea (AI 创意设计平台)',
  runware: 'Runware (超低延迟生成平台)',
  modelslab: 'ModelsLab (多模型 API 网关)',
};

export interface CivitaiAdaptationOptions {
  allowTokenInUrl?: boolean;
  civitaiToken?: string;
  targetModel?: string;
  targetSchema?: Record<string, any>;
  targetEndpoint?: string;
  customLoraCap?: number;
}

/**
 * Normalizes an architecture string into standard family (sdxl, flux1, sd15, etc.)
 */
export function normalizeEcosystem(baseModel?: string): string {
  return targetNormalizeEcosystem(baseModel);
}

/**
 * Calculate best-fit aspect ratio string for Replicate flux-dev-lora
 */
function toReplicateAspectRatio(width?: number | null, height?: number | null): string {
  if (!width || !height) return '1:1';
  const ratio = width / height;
  const candidates = [
    { label: '1:1', val: 1.0 },
    { label: '16:9', val: 16 / 9 },
    { label: '9:16', val: 9 / 16 },
    { label: '4:3', val: 4 / 3 },
    { label: '3:4', val: 3 / 4 },
    { label: '3:2', val: 3 / 2 },
    { label: '2:3', val: 2 / 3 },
    { label: '4:5', val: 4 / 5 },
    { label: '5:4', val: 5 / 4 },
    { label: '21:9', val: 21 / 9 },
    { label: '9:21', val: 9 / 21 },
  ];
  let best = candidates[0];
  let minDiff = Math.abs(ratio - best.val);
  for (let i = 1; i < candidates.length; i++) {
    const diff = Math.abs(ratio - candidates[i].val);
    if (diff < minDiff) {
      minDiff = diff;
      best = candidates[i];
    }
  }
  return best.label;
}

/**
 * Adapts an imported Civitai recipe to a specific target provider with complete transparency.
 */
export function adaptCivitaiRecipeToProvider(
  recipe: CivitaiRecipeInput,
  targetProvider: string,
  options?: CivitaiAdaptationOptions
): ProviderAdaptationResult {
  const provider = (targetProvider || 'civitai').toLowerCase();
  const displayName = PROVIDER_DISPLAY_NAMES[provider] || `${targetProvider} 目标引擎`;
  const baseModelRaw = recipe.baseModel || '';
  const ecosystem = normalizeEcosystem(baseModelRaw);
  const loras = recipe.loras || [];
  const fields: Record<string, FieldAdaptationDetail> = {};
  const unsupportedFields: string[] = [];
  const warnings: string[] = [];

  if (Array.isArray(recipe.hash404Warnings)) {
    for (const hw of recipe.hash404Warnings) {
      warnings.push(hw);
    }
  }

  // Target schema and LoRA capability inspection
  const targetSpec = inspectTargetSchemaForLoras(provider, options?.targetModel, options?.targetSchema);
  const effectiveCap = options?.customLoraCap ?? targetSpec.maxItems ?? PROVIDER_LORA_CAPS[provider]?.cap;
  if (typeof effectiveCap === 'number' && loras.length > effectiveCap) {
    const excessCount = loras.length - effectiveCap;
    const excessNames = loras.slice(effectiveCap).map((l) => l.displayName || l.name).join('、');
    warnings.push(
      `目标供应商 ${displayName} 官方接口最多支持 ${effectiveCap} 个 LoRA；当前导入了 ${loras.length} 个 LoRA，超过上限的 ${excessCount} 个 LoRA（${excessNames}）在该供应商运行时将无法出站发送（依据：${targetSpec.docSource || PROVIDER_LORA_CAPS[provider]?.source || '端点 Schema 声明'}）。`
    );
  }

  // 1. Checkpoint / Base model adaptation
  let baseModelStatus: 'direct' | 'requires_selection' | 'incompatible' = 'direct';
  let baseModelMessage = '';
  const sourceModel = recipe.checkpoint || baseModelRaw || '';
  const isArchUnknown = ecosystem === 'unknown' || !baseModelRaw;

  if (isArchUnknown) {
    baseModelStatus = 'requires_selection';
    baseModelMessage = `架构未知，无法确认兼容；来源元数据未标注基础架构，请从目标供应商目录明确选择真实模型。`;
    fields.checkpoint = {
      field: 'checkpoint',
      originalValue: sourceModel,
      status: 'manual_selection',
      humanMessage: baseModelMessage,
      source: '来源元数据缺失基础架构 (baseModel)',
    };
  } else if (provider === 'civitai') {
    const isRawArch = isRawBaseModelArchitectureText(sourceModel);
    if (isRawArch || !sourceModel) {
      baseModelStatus = 'requires_selection';
      baseModelMessage = `来源模型标识“${sourceModel || '未提供'}”仅为基础架构标签，非具体 Checkpoint 模型文件或 Civitai AIR；需在底模节点明确选择具体模型版本方可运行。`;
      fields.checkpoint = {
        field: 'checkpoint',
        originalValue: sourceModel,
        status: 'manual_selection',
        humanMessage: baseModelMessage,
        source: 'Civitai Orchestration API Spec (model 必须为具体 AIR URN，如 urn:air:sdxl:checkpoint:civitai:...)',
      };
    } else {
      baseModelStatus = 'direct';
      baseModelMessage = `保留 Civitai 原始模型/版本引用 (${sourceModel})；是否具备在线生成权限以上游校验为准。`;
      fields.checkpoint = {
        field: 'checkpoint',
        originalValue: sourceModel,
        targetField: 'model',
        mappedValue: sourceModel,
        status: 'mapped',
        humanMessage: `作为 Civitai 官方底模 model 传递: ${sourceModel}`,
        source: 'Civitai Orchestration recipes (sdcpp / comfy)',
      };
    }
  } else if (provider === 'video') {
    baseModelStatus = 'requires_selection';
    baseModelMessage = `检测到视频工作流；已保留来源模型“${sourceModel || '未提供'}”，但不把 Civitai 模型名猜测为其他视频供应商模型 ID。请在视频节点明确选择目标供应商与模型。`;
    fields.checkpoint = {
      field: 'checkpoint',
      originalValue: sourceModel,
      status: 'manual_selection',
      humanMessage: baseModelMessage,
      source: 'AI Video 视频模型独立命名空间',
    };
  } else {
    baseModelStatus = 'requires_selection';
    baseModelMessage = `Civitai 模型引用不能跨平台直接作为 ${displayName} 的模型端点/ID；已保留来源架构 (${baseModelRaw || '未知'})，必须从 ${displayName} 的模型目录选择真实模型。`;
    fields.checkpoint = {
      field: 'checkpoint',
      originalValue: sourceModel,
      status: 'manual_selection',
      humanMessage: baseModelMessage,
      source: `${displayName} 官方模型输入契约（各供应商拥有独立的模型仓库命名空间）`,
    };
  }

  // 2. LoRAs adaptation
  const adaptedLoras: ProviderLoraAdaptation[] = [];
  for (let i = 0; i < loras.length; i++) {
    const l = loras[i];
    const loraName = l.displayName || l.name;
    const loraBaseModel = l.baseModel || baseModelRaw || '';
    const loraEcosystem = normalizeEcosystem(loraBaseModel);
    const originalStrength = l.strength !== null && l.strength !== undefined ? Number(l.strength) : null;
    const originalClipStrength = l.clipStrength !== null && l.clipStrength !== undefined ? Number(l.clipStrength) : null;

    const modelFromAir = l.air ? l.air.match(/:civitai:(\d+)@/)?.[1] : '';
    const versionFromAir = l.air ? l.air.split('@')[1]?.split('+')[0]?.split('.')[0] : '';
    const versionId = versionFromAir || (l.versionId ? String(l.versionId) : (l.civitaiId && !l.civitaiId.includes('@') && !l.civitaiId.startsWith('urn:') ? String(l.civitaiId) : ''));
    const modelId = modelFromAir || (l.modelId ? String(l.modelId) : (l.civitaiId && l.civitaiId.includes('@') ? l.civitaiId.split('@')[0] : ''));

    // Check unresolvable or resolution failure first (P1-2: do not rewrite 404 into canGenerate:false or fabricate download URL)
    if (l.unresolvedReason || l.resolutionError) {
      adaptedLoras.push({
        name: loraName,
        originalStrength,
        originalClipStrength,
        civitaiId: undefined,
        modelId: undefined,
        versionId: undefined,
        baseModel: loraBaseModel,
        targetFormat: 'unsupported',
        status: 'unsupported',
        unresolvedReason: l.unresolvedReason,
        reason: l.unresolvedReason || '模型版本解析失败，未获得有效的官方资源信息；请在目标库重新选择已验证资源。',
      });
      continue;
    }

    // Check cap first (P1-3)
    if (typeof effectiveCap === 'number' && i >= effectiveCap) {
      adaptedLoras.push({
        name: loraName,
        originalStrength,
        originalClipStrength,
        civitaiId: versionId,
        modelId,
        versionId,
        baseModel: loraBaseModel,
        targetFormat: 'unsupported',
        status: 'unsupported',
        reason: `超出目标供应商 ${displayName} 官方接口 LoRA 数量上限（最多仅支持 ${effectiveCap} 个 LoRA，当前为第 ${i + 1} 个；依据：${targetSpec.docSource || PROVIDER_LORA_CAPS[provider]?.source || '端点 Schema 声明'}）。`,
      });
      continue;
    }

    // Check prompt-inferred LoRA (P2-2)
    if (l.inferredFromPrompt) {
      adaptedLoras.push({
        name: loraName,
        originalStrength,
        originalClipStrength,
        civitaiId: versionId,
        modelId,
        versionId,
        baseModel: loraBaseModel,
        targetFormat: 'unsupported',
        inferredFromPrompt: true,
        status: 'requires_reselection',
        reason: '从提示词标签 <lora:...> 推断，未经验证；未提供官方版本 ID 或下载直链，需在目标库中选用真实 LoRA。',
      });
      continue;
    }

    // Check missing explicit strength (P1-4: no version id or no weight must not appear as "可直接发送" with scale 1)
    if (originalStrength === null || originalStrength === undefined || !Number.isFinite(originalStrength)) {
      const isKenvaNoGen = l.canGenerate === false && provider === 'civitai';
      adaptedLoras.push({
        name: loraName,
        originalStrength: null,
        originalClipStrength,
        civitaiId: versionId,
        modelId,
        versionId,
        air: l.air,
        canGenerate: l.canGenerate,
        baseModel: loraBaseModel,
        targetFormat: isKenvaNoGen ? 'unsupported' : 'download_url',
        status: isKenvaNoGen ? 'unsupported' : 'requires_reselection',
        reason: isKenvaNoGen
          ? '该资源在 Civitai 官方未启用在线生成 (canGenerate: false)，无法通过 Civitai Orchestration 官方算力执行；可在第三方供应商使用其直链，或在画布中移除该 LoRA。'
          : '缺少显式 LoRA 权重参数，禁止静默兜底 1.0；需在节点中设置强度后方可运行。',
      });
      if (isKenvaNoGen) {
        warnings.push(`LoRA "${loraName}" 未在 Civitai 官方启用在线生成 (canGenerate: false)，无法使用 Civitai 官方算力运行。`);
      }
      continue;
    }

    // Check missing versionId for URL/AIR based providers
    if (!versionId && provider !== 'modelscope' && provider !== 'modelscope_ai' && provider !== 'tensorart' && provider !== 'sogni' && provider !== 'novita') {
      adaptedLoras.push({
        name: loraName,
        originalStrength,
        originalClipStrength,
        modelId,
        baseModel: loraBaseModel,
        targetFormat: 'unsupported',
        status: 'requires_reselection',
        reason: '缺少官方模型版本 ID，无法定位真实权重文件；请在目标库中选择具体版本。',
      });
      continue;
    }

    // Check architecture compatibility between base model and LoRA
    const isArchMismatch =
      !isArchUnknown &&
      loraEcosystem !== 'unknown' &&
      ecosystem !== loraEcosystem;

    const directDownloadUrl = l.downloadUrl || '';
    const canonicalAir = buildCivitaiCanonicalAir(
      modelId,
      versionId,
      loraEcosystem !== 'unknown' ? loraEcosystem : (ecosystem !== 'unknown' ? ecosystem : undefined),
      l.air
    );

    if (provider === 'civitai') {
      if (l.canGenerate === false) {
        adaptedLoras.push({
          name: loraName,
          originalStrength,
          originalClipStrength,
          civitaiId: versionId,
          modelId,
          versionId,
          air: canonicalAir || l.air,
          baseModel: loraBaseModel,
          canGenerate: false,
          targetFormat: 'unsupported',
          status: 'unsupported',
          reason: `该资源在 Civitai 官方未启用在线生成 (canGenerate: false)，无法通过 Civitai Orchestration 官方算力执行；可在第三方供应商使用其直链，或在画布中移除该 LoRA。`,
        });
        warnings.push(`LoRA "${loraName}" 未在 Civitai 官方启用在线生成 (canGenerate: false)，无法使用 Civitai 官方算力运行。`);
      } else if (isArchMismatch) {
        adaptedLoras.push({
          name: loraName,
          originalStrength,
          originalClipStrength,
          civitaiId: versionId,
          modelId,
          versionId,
          air: l.air,
          baseModel: loraBaseModel,
          targetFormat: 'air',
          scale: originalStrength,
          status: 'architecture_mismatch',
          reason: `LoRA 架构 (${loraBaseModel || loraEcosystem}) 与底模架构 (${baseModelRaw || ecosystem}) 不匹配；Civitai 上游会拒绝跨架构 LoRA 组合 (HTTP 400)。`,
        });
      } else if (!canonicalAir) {
        adaptedLoras.push({
          name: loraName,
          originalStrength,
          originalClipStrength,
          civitaiId: versionId,
          modelId,
          versionId,
          baseModel: loraBaseModel,
          targetFormat: 'air',
          status: 'requires_reselection',
          reason: '基础架构未知或缺少母模型编号，无法构建规范 Civitai AIR (urn:air:{eco}:lora:civitai:{modelId}@{versionId})；请选择具体模型版本。',
        });
      } else {
        adaptedLoras.push({
          name: loraName,
          originalStrength,
          originalClipStrength,
          civitaiId: versionId,
          modelId,
          versionId,
          air: canonicalAir,
          baseModel: loraBaseModel,
          targetFormat: 'air',
          sendableUrlOrId: canonicalAir,
          scale: originalStrength,
          status: 'compatible',
          reason: `以 Civitai AIR 规范传入 loras 映射字典 (权重: ${originalStrength})`,
        });
      }
    } else if (targetSpec.status === 'unverified') {
      adaptedLoras.push({
        name: loraName,
        originalStrength,
        originalClipStrength,
        civitaiId: versionId,
        modelId,
        versionId,
        baseModel: loraBaseModel,
        targetFormat: targetSpec.format || 'custom',
        status: 'unverified',
        reason: targetSpec.reason || `未获取到 ${displayName} 实时 Schema；生成时将按原值提交上游裁决。`,
      });
    } else if (targetSpec.status === 'requires_reselection') {
      let reselectReason = targetSpec.reason || '目标模型需要从目录重新选用 LoRA';
      if (provider === 'modelscope' || provider === 'modelscope_ai') {
        reselectReason = `${displayName} 仅支持魔搭社区内部的 LoRA 仓库 ID (如 owner/model-lora)，不支持外部 URL 或 Civitai AIR，需从魔搭模型库选用对应 LoRA。`;
      } else if (provider === 'sogni') {
        reselectReason = `Sogni 仅支持其官方目录公布的 LoRA ID (如 krea2-detail-enhancer)，不支持外部 URL 或 Civitai AIR。`;
      } else if (provider === 'novita') {
        reselectReason = `Novita AI 仅支持其模型库已录入或用户自定义上传的 sd_name_in_api，不支持外部直链或 Civitai AIR，需在 Novita 目录选用。`;
      } else if (provider === 'tensorart') {
        reselectReason = `Tensor.Art TAMS 仅支持平台内部的纯数字 LoRA ID，不支持外部 URL 或 Civitai AIR。`;
      } else if (provider === 'krea') {
        reselectReason = `Krea 官方生图接口通过 styles 挂载 LoRA，需要其样式目录公布的 style ID。`;
      } else if (provider === 'modelslab') {
        reselectReason = `ModelsLab 接受 lora_model 目录模型名与 lora_strength。`;
      }
      adaptedLoras.push({
        name: loraName,
        originalStrength,
        originalClipStrength,
        civitaiId: versionId,
        modelId,
        versionId,
        baseModel: loraBaseModel,
        targetFormat: targetSpec.format || 'catalog_id',
        status: 'requires_reselection',
        reason: reselectReason,
      });
    } else if (targetSpec.format === 'air') {
      if (provider === 'runware') {
        const runwareAir = modelId && versionId ? `civitai:${modelId}@${versionId}` : canonicalAir || directDownloadUrl;
        if (!runwareAir) {
          adaptedLoras.push({
            name: loraName,
            originalStrength,
            originalClipStrength,
            civitaiId: versionId,
            modelId,
            versionId,
            baseModel: loraBaseModel,
            targetFormat: 'air',
            status: 'requires_reselection',
            reason: '缺少模型标识或 AIR，无法构造 Runware LoRA；需在目标库中重新选用。',
          });
        } else {
          adaptedLoras.push({
            name: loraName,
            originalStrength,
            originalClipStrength,
            civitaiId: versionId,
            modelId,
            versionId,
            baseModel: loraBaseModel,
            targetFormat: 'air',
            sendableUrlOrId: runwareAir,
            scale: originalStrength,
            status: 'compatible',
            reason: `将作为 Runware lora[].model AIR 传入 (weight: ${originalStrength})`,
          });
        }
      } else {
        adaptedLoras.push({
          name: loraName,
          originalStrength,
          originalClipStrength,
          civitaiId: versionId,
          modelId,
          versionId,
          baseModel: loraBaseModel,
          targetFormat: 'air',
          sendableUrlOrId: canonicalAir,
          scale: originalStrength,
          status: 'compatible',
          reason: `将作为 ${displayName} ${targetSpec.pathOrKeyProp || 'air'} 传入 (strength: ${originalStrength})`,
        });
      }
    } else if ((targetSpec.format === 'download_url' && provider !== 'replicate') || ['fal', 'wavespeed', 'aimlapi', 'muapi'].includes(provider)) {
      if (isArchMismatch) {
        adaptedLoras.push({
          name: loraName,
          originalStrength,
          originalClipStrength,
          civitaiId: versionId,
          modelId,
          versionId,
          baseModel: loraBaseModel,
          targetFormat: 'download_url',
          scale: originalStrength,
          status: 'architecture_mismatch',
          reason: `LoRA 架构 (${loraBaseModel}) 与目标 ${displayName} 端点架构 (${baseModelRaw || ecosystem}) 不匹配。`,
        });
      } else {
        const sendable = buildSendableLoraUrl(directDownloadUrl, {
          allowTokenInUrl: options?.allowTokenInUrl,
          civitaiToken: options?.civitaiToken,
          requireAuth: l.requireAuth,
        });
        if (sendable.requiresConsent) {
          adaptedLoras.push({
            name: loraName,
            originalStrength,
            originalClipStrength,
            civitaiId: versionId,
            modelId,
            versionId,
            baseModel: loraBaseModel,
            targetFormat: 'download_url',
            requiresAuthConsent: true,
            scale: originalStrength,
            status: 'requires_consent',
            reason: `该 Civitai LoRA 上游标记为需登录鉴权下载 (requireAuth=true)；严禁在未经用户显式 UI 授权时向 ${displayName} 附带 Civitai API Token（避免个人凭据泄露）。需在界面点击授权后方可附加 Token 发送。`,
          });
        } else if (!sendable.url) {
          adaptedLoras.push({
            name: loraName,
            originalStrength,
            originalClipStrength,
            civitaiId: versionId,
            modelId,
            versionId,
            baseModel: loraBaseModel,
            targetFormat: 'unsupported',
            status: 'requires_reselection',
            reason: `缺少官方真实下载链接 (downloadUrl)，无法向 ${displayName} 发送权重直链；需在目标库中重新选用。`,
          });
        } else {
          adaptedLoras.push({
            name: loraName,
            originalStrength,
            originalClipStrength,
            civitaiId: versionId,
            modelId,
            versionId,
            baseModel: loraBaseModel,
            targetFormat: 'download_url',
            sendableUrlOrId: sendable.url,
            requiresAuthConsent: Boolean(l.requireAuth),
            scale: originalStrength,
            status: 'compatible',
            reason: l.requireAuth && options?.allowTokenInUrl
              ? `已获用户显式 UI 授权，向 ${displayName} 发送带 Civitai Token 的下载链接 (scale: ${originalStrength})`
              : `将作为 ${displayName} ${targetSpec.pathOrKeyProp || 'loras[].path'} 权重直链传入 (scale: ${originalStrength})`,
          });
        }
      }
    } else if (provider === 'replicate') {
      const fieldName = i === 0 ? 'lora_weights' : 'extra_lora';
      if (isArchMismatch) {
        adaptedLoras.push({
          name: loraName,
          originalStrength,
          originalClipStrength,
          civitaiId: versionId,
          modelId,
          versionId,
          baseModel: loraBaseModel,
          targetFormat: 'download_url',
          status: 'architecture_mismatch',
          reason: `LoRA 架构 (${loraBaseModel}) 与 Replicate 目标模型架构 (${baseModelRaw || ecosystem}) 不匹配。`,
        });
      } else {
        const sendable = buildSendableLoraUrl(directDownloadUrl, {
          allowTokenInUrl: options?.allowTokenInUrl,
          civitaiToken: options?.civitaiToken,
          requireAuth: l.requireAuth,
        });
        if (sendable.requiresConsent) {
          adaptedLoras.push({
            name: loraName,
            originalStrength,
            originalClipStrength,
            civitaiId: versionId,
            modelId,
            versionId,
            baseModel: loraBaseModel,
            targetFormat: 'download_url',
            scale: originalStrength,
            requiresAuthConsent: true,
            status: 'requires_consent',
            reason: `该 Civitai LoRA 需登录鉴权；未获显式授权不向 Replicate 发送凭据。`,
          });
        } else if (sendable.url) {
          adaptedLoras.push({
            name: loraName,
            originalStrength,
            originalClipStrength,
            civitaiId: versionId,
            modelId,
            versionId,
            baseModel: loraBaseModel,
            targetFormat: 'download_url',
            sendableUrlOrId: sendable.url,
            scale: originalStrength,
            status: 'compatible',
            reason: `将作为 Replicate ${fieldName} 传入 (scale: ${originalStrength})`,
          });
        } else {
          adaptedLoras.push({
            name: loraName,
            originalStrength,
            originalClipStrength,
            civitaiId: versionId,
            modelId,
            versionId,
            baseModel: loraBaseModel,
            targetFormat: 'unsupported',
            status: 'requires_reselection',
            reason: `缺少官方真实下载链接或模型编号，无法向 Replicate 发送权重；需在目标库中重新选用。`,
          });
        }
      }
    } else if (provider === 'modelscope' || provider === 'modelscope_ai') {
      adaptedLoras.push({
        name: loraName,
        originalStrength,
        originalClipStrength,
        civitaiId: versionId,
        modelId,
        versionId,
        baseModel: loraBaseModel,
        targetFormat: 'repo_id',
        status: 'requires_reselection',
        reason: `${displayName} 仅支持魔搭社区内部的 LoRA 仓库 ID (如 owner/model-lora)，不支持外部 URL 或 Civitai AIR，需从魔搭模型库选用对应 LoRA。`,
      });
    } else if (provider === 'novita') {
      adaptedLoras.push({
        name: loraName,
        originalStrength,
        originalClipStrength,
        civitaiId: versionId,
        modelId,
        versionId,
        baseModel: loraBaseModel,
        targetFormat: 'catalog_id',
        status: 'requires_reselection',
        reason: 'Novita AI 仅支持其模型库已录入或用户自定义上传的 sd_name_in_api，不支持外部直链或 Civitai AIR，需在 Novita 目录选用。',
      });
    } else if (provider === 'sogni') {
      adaptedLoras.push({
        name: loraName,
        originalStrength,
        originalClipStrength,
        civitaiId: versionId,
        modelId,
        versionId,
        baseModel: loraBaseModel,
        targetFormat: 'catalog_id',
        status: 'requires_reselection',
        reason: 'Sogni 仅支持其官方目录公布的 LoRA ID (如 krea2-detail-enhancer)，不支持外部 URL 或 Civitai AIR。',
      });
    } else if (provider === 'tensorart') {
      adaptedLoras.push({
        name: loraName,
        originalStrength,
        originalClipStrength,
        civitaiId: versionId,
        modelId,
        versionId,
        baseModel: loraBaseModel,
        targetFormat: 'catalog_id',
        status: 'requires_reselection',
        reason: 'Tensor.Art TAMS 仅支持平台内部的纯数字 LoRA ID，不支持外部 URL 或 Civitai AIR。',
      });
    } else if (provider === 'runware') {
      if (modelId && versionId) {
        const runwareAir = `civitai:${modelId}@${versionId}`;
        adaptedLoras.push({
          name: loraName,
          originalStrength,
          originalClipStrength,
          civitaiId: versionId,
          modelId,
          versionId,
          baseModel: loraBaseModel,
          targetFormat: 'air',
          sendableUrlOrId: runwareAir,
          scale: originalStrength,
          status: 'compatible',
          reason: `以 Runware 原生支持的 Civitai AIR (${runwareAir}) 传入 (weight: ${originalStrength})`,
        });
      } else if (l.air) {
        adaptedLoras.push({
          name: loraName,
          originalStrength,
          originalClipStrength,
          civitaiId: versionId,
          modelId,
          versionId,
          air: l.air,
          baseModel: loraBaseModel,
          targetFormat: 'air',
          sendableUrlOrId: l.air,
          scale: originalStrength,
          status: 'compatible',
          reason: `以 Runware 原生支持的 AIR (${l.air}) 传入 (weight: ${originalStrength})`,
        });
      } else {
        adaptedLoras.push({
          name: loraName,
          originalStrength,
          originalClipStrength,
          civitaiId: versionId,
          modelId,
          versionId,
          baseModel: loraBaseModel,
          targetFormat: 'air',
          status: 'requires_reselection',
          reason: '缺少母模型与版本编号，无法构建 Runware AIR 引用；需在 Runware 模型库中重新选用。',
        });
      }
    } else if (provider === 'krea') {
      adaptedLoras.push({
        name: loraName,
        originalStrength,
        originalClipStrength,
        civitaiId: versionId,
        modelId,
        versionId,
        baseModel: loraBaseModel,
        targetFormat: 'styles',
        status: 'requires_reselection',
        reason: 'Krea 官方生图接口通过 styles 挂载 LoRA，需要其样式目录公布的 style ID；不能将外部 URL 或 Civitai 编号直接作为 Krea style ID。',
      });
    } else if (provider === 'modelslab') {
      adaptedLoras.push({
        name: loraName,
        originalStrength,
        originalClipStrength,
        civitaiId: versionId,
        modelId,
        versionId,
        baseModel: loraBaseModel,
        targetFormat: 'catalog_id',
        status: 'requires_reselection',
        reason: 'ModelsLab 仅支持其官方模型库中的 lora_model 名称与 lora_strength，需在目标库中重新选用。',
      });
    } else {
      adaptedLoras.push({
        name: loraName,
        originalStrength,
        originalClipStrength,
        civitaiId: versionId,
        modelId,
        versionId,
        baseModel: loraBaseModel,
        targetFormat: targetSpec.format || 'custom',
        status: targetSpec.status === 'supported' ? 'compatible' : (targetSpec.status || 'unverified'),
        reason: targetSpec.reason || `${displayName} 未配置显式 LoRA Schema，将按用户填写原样提交上游裁决。`,
      });
    }
  }

  // Check clipStrength across all providers:
  const hasClipStrength = loras.some((l) => l.clipStrength !== undefined && l.clipStrength !== null);
  if (hasClipStrength) {
    fields.clipStrength = {
      field: 'clipStrength',
      originalValue: loras.map((l) => l.clipStrength),
      status: 'unsupported',
      humanMessage: `${displayName} 官方接口不支持独立的 CLIP 强度 (strength_clip)；仅能生效单一模型强度。`,
      source: '各供应商官方 LoRA 契约审计（Fal / Replicate / WaveSpeed / ModelScope / Novita / Civitai 均无独立 clip strength 字段）',
    };
    unsupportedFields.push('clipStrength');
    warnings.push(`${displayName} 不支持独立的 CLIP 强度调节，仅保留单一模型强度。`);
  }

  // 3. Prompt
  fields.prompt = {
    field: 'prompt',
    originalValue: recipe.prompt || '',
    targetField: provider === 'huggingface' ? 'inputs' : provider === 'tensorart' ? 'diffusion.prompts[0].text' : 'prompt',
    mappedValue: recipe.prompt || '',
    status: 'mapped',
    humanMessage: `作为正向提示词发送至 ${provider === 'huggingface' ? 'inputs' : 'prompt'}`,
  };

  // 4. Negative prompt (P2-4)
  const neg = recipe.negativePrompt || '';
  if (provider === 'civitai') {
    if (ecosystem === 'flux1') {
      const isComfyEngine = recipe.engine === 'comfy';
      fields.negativePrompt = {
        field: 'negativePrompt',
        originalValue: neg,
        targetField: isComfyEngine ? undefined : 'negativePrompt',
        mappedValue: isComfyEngine ? undefined : neg,
        status: isComfyEngine ? 'unsupported' : 'mapped',
        humanMessage: isComfyEngine
          ? 'Civitai FLUX.1 comfy 引擎官方配方不支持负向提示词，已拦截未发送。'
          : 'Civitai FLUX.1 sdcpp 引擎官方配方支持 negativePrompt，可直接发送。',
        source: 'https://developer.civitai.com/orchestration/recipes/flux1.md',
      };
      if (isComfyEngine && neg) {
        unsupportedFields.push('negativePrompt');
        warnings.push('Civitai FLUX.1 comfy 官方配方不支持负向提示词，已拦截未发送。');
      }
    } else {
      fields.negativePrompt = {
        field: 'negativePrompt',
        originalValue: neg,
        targetField: 'negativePrompt',
        mappedValue: neg,
        status: 'mapped',
        humanMessage: '作为 negativePrompt 发送至 Civitai',
        source: 'https://developer.civitai.com/orchestration/recipes/sdxl.md',
      };
    }
  } else if (provider === 'fal') {
    if (ecosystem === 'flux1') {
      fields.negativePrompt = {
        field: 'negativePrompt',
        originalValue: neg,
        status: 'unsupported',
        humanMessage: 'Fal.ai fal-ai/flux-lora 官方 Schema 无 negative_prompt 字段，不会发送。',
        source: 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/flux-lora',
      };
      if (neg) {
        unsupportedFields.push('negativePrompt');
        warnings.push('Fal.ai flux-lora 官方 Schema 不支持负向提示词，已拦截未发送。');
      }
    } else {
      fields.negativePrompt = {
        field: 'negativePrompt',
        originalValue: neg,
        targetField: 'negative_prompt',
        mappedValue: neg,
        status: 'mapped',
        humanMessage: '作为 negative_prompt 发送至 Fal.ai',
        source: 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/lora',
      };
    }
  } else if (provider === 'replicate') {
    if (ecosystem === 'flux1') {
      fields.negativePrompt = {
        field: 'negativePrompt',
        originalValue: neg,
        status: 'unsupported',
        humanMessage: 'Replicate black-forest-labs/flux-dev-lora 官方 Schema 无 negative_prompt 字段，不会发送。',
        source: 'https://replicate.com/black-forest-labs/flux-dev-lora/api/schema',
      };
      if (neg) {
        unsupportedFields.push('negativePrompt');
        warnings.push('Replicate flux-dev-lora 不支持负向提示词。');
      }
    } else {
      fields.negativePrompt = {
        field: 'negativePrompt',
        originalValue: neg,
        targetField: 'negative_prompt',
        mappedValue: neg,
        status: 'mapped',
        humanMessage: '作为 negative_prompt 发送至 Replicate',
        source: 'Replicate SD/SDXL 官方 API',
      };
    }
  } else if (provider === 'wavespeed') {
    if (ecosystem === 'flux1') {
      fields.negativePrompt = {
        field: 'negativePrompt',
        originalValue: neg,
        status: 'unsupported',
        humanMessage: 'WaveSpeed FLUX 系列官方端点无 negative_prompt 字段，不会发送。',
        source: 'https://api.wavespeed.ai/api/v3/models (flux-dev-lora inputSchema)',
      };
      if (neg) {
        unsupportedFields.push('negativePrompt');
        warnings.push('WaveSpeed FLUX 官方端点不支持负向提示词。');
      }
    } else {
      fields.negativePrompt = {
        field: 'negativePrompt',
        originalValue: neg,
        targetField: 'negative_prompt',
        mappedValue: neg,
        status: 'mapped',
        humanMessage: '作为 negative_prompt 发送至 WaveSpeed',
      };
    }
  } else if (provider === 'nanogpt') {
    fields.negativePrompt = {
      field: 'negativePrompt',
      originalValue: neg,
      status: 'unsupported',
      humanMessage: 'NanoGPT 标准图像接口无负向提示词字段。',
      source: 'https://docs.nano-gpt.com/api-reference/image-generation.md',
    };
    if (neg) {
      unsupportedFields.push('negativePrompt');
      warnings.push('NanoGPT 官方接口未提供负向提示词字段。');
    }
  } else {
    // Other providers supporting negative prompt: huggingface, modelscope, novita, sogni, tensorart
    const targetName = provider === 'huggingface' ? 'parameters.negative_prompt' : provider === 'sogni' ? 'negativePrompt' : provider === 'tensorart' ? 'diffusion.negativePrompts[0].text' : 'negative_prompt';
    fields.negativePrompt = {
      field: 'negativePrompt',
      originalValue: neg,
      targetField: targetName,
      mappedValue: neg,
      status: 'mapped',
      humanMessage: `作为负向提示词发送至 ${targetName}`,
    };
  }

  // 5. Steps
  const stepsVal = recipe.steps;
  const hasSteps = stepsVal !== null && stepsVal !== undefined && Number.isFinite(stepsVal);
  if (['civitai', 'modelscope', 'modelscope_ai', 'novita', 'tensorart', 'runware', 'krea'].includes(provider)) {
    const targetField = provider === 'tensorart' ? 'diffusion.steps' : 'steps';
    fields.steps = {
      field: 'steps',
      originalValue: stepsVal,
      targetField,
      mappedValue: stepsVal,
      status: hasSteps ? 'mapped' : 'not_applicable',
      humanMessage: `作为步数 ${targetField} 发送 (${hasSteps ? stepsVal : '默认'})`,
    };
  } else if (['fal', 'replicate', 'wavespeed', 'aimlapi', 'muapi', 'modelslab'].includes(provider)) {
    fields.steps = {
      field: 'steps',
      originalValue: stepsVal,
      targetField: 'num_inference_steps',
      mappedValue: stepsVal,
      status: hasSteps ? 'mapped' : 'not_applicable',
      humanMessage: `作为步数 num_inference_steps 发送 (${hasSteps ? stepsVal : '默认'})`,
    };
  } else if (provider === 'huggingface') {
    fields.steps = {
      field: 'steps',
      originalValue: stepsVal,
      targetField: 'parameters.num_inference_steps',
      mappedValue: stepsVal,
      status: hasSteps ? 'mapped' : 'not_applicable',
      humanMessage: `作为步数 parameters.num_inference_steps 发送 (${hasSteps ? stepsVal : '默认'})`,
    };
  } else {
    fields.steps = {
      field: 'steps',
      originalValue: stepsVal,
      status: 'unsupported',
      humanMessage: `${displayName} 官方生图 Schema 未提供步数调节参数。`,
      source: `${displayName} 官方 OpenAPI / Schema`,
    };
    if (hasSteps) {
      unsupportedFields.push('steps');
      warnings.push(`${displayName} 官方接口不支持步数调节。`);
    }
  }

  // 6. CFG / Guidance scale
  const cfgVal = recipe.cfg;
  const hasCfg = typeof cfgVal === 'number' && Number.isFinite(cfgVal);
  if (['civitai', 'tensorart'].includes(provider)) {
    const targetField = provider === 'tensorart' ? 'diffusion.cfgScale' : 'cfgScale';
    fields.cfg = {
      field: 'cfg',
      originalValue: cfgVal,
      targetField,
      mappedValue: cfgVal,
      status: hasCfg ? 'mapped' : 'not_applicable',
      humanMessage: `作为引导系数 ${targetField} 发送 (${hasCfg ? cfgVal : '默认'})`,
    };
  } else if (provider === 'runware') {
    fields.cfg = {
      field: 'cfg',
      originalValue: cfgVal,
      targetField: 'CFGScale',
      mappedValue: cfgVal,
      status: hasCfg ? 'mapped' : 'not_applicable',
      humanMessage: `作为引导系数 CFGScale 发送 (${hasCfg ? cfgVal : '默认'})`,
    };
  } else if (['fal', 'wavespeed', 'novita', 'aimlapi', 'muapi', 'modelslab', 'krea'].includes(provider)) {
    fields.cfg = {
      field: 'cfg',
      originalValue: cfgVal,
      targetField: 'guidance_scale',
      mappedValue: cfgVal,
      status: hasCfg ? 'mapped' : 'not_applicable',
      humanMessage: `作为引导系数 guidance_scale 发送 (${hasCfg ? cfgVal : '默认'})`,
    };
  } else if (['replicate', 'modelscope', 'modelscope_ai', 'sogni'].includes(provider)) {
    fields.cfg = {
      field: 'cfg',
      originalValue: cfgVal,
      targetField: 'guidance',
      mappedValue: cfgVal,
      status: hasCfg ? 'mapped' : 'not_applicable',
      humanMessage: `作为引导系数 guidance 发送 (${hasCfg ? cfgVal : '默认'})`,
    };
  } else if (provider === 'huggingface') {
    fields.cfg = {
      field: 'cfg',
      originalValue: cfgVal,
      targetField: 'parameters.guidance_scale',
      mappedValue: cfgVal,
      status: hasCfg ? 'mapped' : 'not_applicable',
      humanMessage: `作为引导系数 parameters.guidance_scale 发送 (${hasCfg ? cfgVal : '默认'})`,
    };
  } else {
    fields.cfg = {
      field: 'cfg',
      originalValue: cfgVal,
      status: 'unsupported',
      humanMessage: `${displayName} 官方生图 Schema 未提供 CFG / 引导系数调节参数。`,
      source: `${displayName} 官方 Schema`,
    };
    if (hasCfg) {
      unsupportedFields.push('cfg');
      warnings.push(`${displayName} 官方接口不支持 CFG 引导系数调节。`);
    }
  }

  // 7. Sampler & Scheduler (P2-4)
  const samplerVal = recipe.sampler || '';
  const schedulerVal = recipe.scheduler || '';
  if (provider === 'civitai') {
    const isComfy = (recipe.engine || '').toLowerCase() === 'comfy';
    const mapped = mapSampler(samplerVal, isComfy ? 'comfy' : 'sdcpp');
    const isUnmapped = Boolean(samplerVal && !mapped);
    const mappedSampler = mapped;
    fields.sampler = {
      field: 'sampler',
      originalValue: samplerVal,
      targetField: isComfy ? 'sampler' : 'sampleMethod',
      mappedValue: mappedSampler || undefined,
      status: isUnmapped ? 'unsupported' : (samplerVal ? 'mapped' : 'not_applicable'),
      humanMessage: isUnmapped
        ? `采样器 "${samplerVal}" 不在 Civitai ${isComfy ? 'Comfy' : 'sdcpp'} 官方枚举内，未映射；上游请求不会发送此未知采样器。`
        : `按 Civitai 引擎映射为 ${isComfy ? 'sampler (comfy)' : 'sampleMethod (sdcpp)'}: ${mappedSampler || '默认'}`,
      source: 'https://developer.civitai.com/orchestration/recipes/sdxl.md',
    };
    if (isUnmapped) {
      unsupportedFields.push('sampler');
      warnings.push(`采样器 "${samplerVal}" 未在 Civitai 官方枚举中，未映射。`);
    }
    fields.scheduler = {
      field: 'scheduler',
      originalValue: schedulerVal,
      targetField: 'schedule / scheduler',
      mappedValue: schedulerVal,
      status: schedulerVal ? 'mapped' : 'not_applicable',
      humanMessage: `按 Civitai 引擎映射为 schedule (sdcpp) 或 scheduler (comfy): ${schedulerVal || '默认'}`,
      source: 'https://developer.civitai.com/orchestration/recipes/sdxl.md',
    };
  } else if (provider === 'fal') {
    if (ecosystem === 'sd15' || ecosystem === 'sdxl') {
      fields.sampler = {
        field: 'sampler',
        originalValue: samplerVal,
        status: 'unsupported',
        humanMessage: 'Fal.ai fal-ai/lora 采用合并调度器枚举，无独立 sampler 字段。',
        source: 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/lora',
      };
      fields.scheduler = {
        field: 'scheduler',
        originalValue: schedulerVal,
        targetField: 'scheduler',
        mappedValue: schedulerVal,
        status: schedulerVal ? 'mapped' : 'not_applicable',
        humanMessage: `作为 Fal.ai fal-ai/lora scheduler 发送: ${schedulerVal}`,
        source: 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/lora',
      };
    } else {
      fields.sampler = {
        field: 'sampler',
        originalValue: samplerVal,
        status: 'unsupported',
        humanMessage: 'Fal.ai fal-ai/flux-lora 官方 Schema 无独立 sampler 调节。',
        source: 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/flux-lora',
      };
      fields.scheduler = {
        field: 'scheduler',
        originalValue: schedulerVal,
        status: 'unsupported',
        humanMessage: 'Fal.ai fal-ai/flux-lora 官方 Schema 无 scheduler 字段。',
        source: 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/flux-lora',
      };
      if (samplerVal) unsupportedFields.push('sampler');
      if (schedulerVal) unsupportedFields.push('scheduler');
    }
  } else if (provider === 'novita') {
    const mergedSampler = samplerVal && schedulerVal && schedulerVal.toLowerCase() === 'karras'
      ? `${samplerVal} Karras`
      : samplerVal;
    fields.sampler = {
      field: 'sampler',
      originalValue: samplerVal,
      targetField: 'sampler_name',
      mappedValue: mergedSampler,
      status: samplerVal ? 'mapped' : 'not_applicable',
      humanMessage: `作为 Novita sampler_name 发送: ${mergedSampler || '默认'}`,
      source: 'https://docs.novita.ai/guides/model-apis-custom-model.md',
    };
    fields.scheduler = {
      field: 'scheduler',
      originalValue: schedulerVal,
      status: 'unsupported',
      humanMessage: 'Novita 无独立 scheduler 字段（Karras 等调度规则合并在 sampler_name 内）。',
      source: 'https://docs.novita.ai/guides/model-apis-custom-model.md',
    };
  } else if (provider === 'tensorart') {
    fields.sampler = {
      field: 'sampler',
      originalValue: samplerVal,
      targetField: 'diffusion.sampler',
      mappedValue: samplerVal,
      status: samplerVal ? 'mapped' : 'not_applicable',
      humanMessage: `作为 Tensor.Art diffusion.sampler 发送: ${samplerVal || '默认'}`,
      source: 'https://tams-docs.tensor.art/zh/docs/api/apis/tams-api-v-1-service-create-job/',
    };
    fields.scheduler = {
      field: 'scheduler',
      originalValue: schedulerVal,
      targetField: 'diffusion.scheduleName',
      mappedValue: schedulerVal,
      status: schedulerVal ? 'mapped' : 'not_applicable',
      humanMessage: `作为 Tensor.Art diffusion.scheduleName 发送: ${schedulerVal || '默认'}`,
      source: 'https://tams-docs.tensor.art/zh/docs/api/apis/tams-api-v-1-service-create-job/',
    };
  } else if (provider === 'huggingface') {
    fields.sampler = {
      field: 'sampler',
      originalValue: samplerVal,
      status: 'unsupported',
      humanMessage: 'Hugging Face Inference Providers 官方参数表无 sampler 字段。',
      source: 'https://huggingface.co/docs/inference-providers/en/tasks/text-to-image',
    };
    fields.scheduler = {
      field: 'scheduler',
      originalValue: schedulerVal,
      targetField: 'parameters.scheduler',
      mappedValue: schedulerVal,
      status: schedulerVal ? 'mapped' : 'not_applicable',
      humanMessage: `作为 parameters.scheduler 发送: ${schedulerVal || '默认'}`,
      source: 'https://huggingface.co/docs/inference-providers/en/tasks/text-to-image',
    };
  } else {
    fields.sampler = {
      field: 'sampler',
      originalValue: samplerVal,
      status: 'unsupported',
      humanMessage: `${displayName} 官方托管端点采用内建采样器，接口不暴露采样器调节。`,
      source: `${displayName} 官方 Schema`,
    };
    fields.scheduler = {
      field: 'scheduler',
      originalValue: schedulerVal,
      status: 'unsupported',
      humanMessage: `${displayName} 官方托管端点接口不暴露调度算法选择。`,
      source: `${displayName} 官方 Schema`,
    };
    if (samplerVal) unsupportedFields.push('sampler');
    if (schedulerVal) unsupportedFields.push('scheduler');
  }

  // 8. Clip skip (P2-1)
  const clipSkipVal = recipe.clipSkip;
  if (provider === 'civitai') {
    if (ecosystem === 'sdxl' || ecosystem === 'pony' || ecosystem === 'illustrious') {
      fields.clipSkip = {
        field: 'clipSkip',
        originalValue: clipSkipVal,
        status: 'unsupported',
        humanMessage: 'Civitai SDXL 官方文档明文指出："Sending clipSkip on an SDXL request will 400"，SDXL 采用双文本编码器，官方配方无 clipSkip 参数，已拦截避免报错。',
        source: 'https://developer.civitai.com/orchestration/recipes/sdxl.md#sdcpp-default-path',
      };
      if (clipSkipVal !== null && clipSkipVal !== undefined) {
        unsupportedFields.push('clipSkip');
        warnings.push('Civitai SDXL 官方接口不支持 clipSkip (发送会触发 400 报错)，已安全拦截未发送。');
      }
    } else if (ecosystem === 'sd15') {
      fields.clipSkip = {
        field: 'clipSkip',
        originalValue: clipSkipVal,
        targetField: 'clipSkip',
        mappedValue: clipSkipVal,
        status: clipSkipVal !== null && clipSkipVal !== undefined ? 'mapped' : 'not_applicable',
        humanMessage: clipSkipVal !== null && clipSkipVal !== undefined
          ? `作为 Civitai SD 1.5 clipSkip 发送 (${clipSkipVal})`
          : 'Civitai SD 1.5 官方配方支持 clipSkip，当前配方未指定原值。',
        source: 'https://developer.civitai.com/orchestration/recipes/sd1.md',
      };
    } else {
      fields.clipSkip = {
        field: 'clipSkip',
        originalValue: clipSkipVal,
        status: 'unsupported',
        humanMessage: `Civitai ${baseModelRaw || 'FLUX'} 官方配方无 clipSkip 参数。`,
        source: 'https://developer.civitai.com/orchestration/recipes/flux1.md',
      };
      if (clipSkipVal !== null && clipSkipVal !== undefined) unsupportedFields.push('clipSkip');
    }
  } else if (provider === 'fal') {
    if (ecosystem === 'sd15' || ecosystem === 'sdxl') {
      fields.clipSkip = {
        field: 'clipSkip',
        originalValue: clipSkipVal,
        targetField: 'clip_skip',
        mappedValue: clipSkipVal,
        status: clipSkipVal !== null ? 'mapped' : 'not_applicable',
        humanMessage: `作为 Fal.ai (fal-ai/lora) clip_skip 发送 (${clipSkipVal})`,
        source: 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/lora',
      };
    } else {
      fields.clipSkip = {
        field: 'clipSkip',
        originalValue: clipSkipVal,
        status: 'unsupported',
        humanMessage: 'Fal.ai fal-ai/flux-lora 官方 Schema 无 clip_skip 字段。',
        source: 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/flux-lora',
      };
      if (clipSkipVal !== null && clipSkipVal !== undefined) unsupportedFields.push('clipSkip');
    }
  } else if (provider === 'novita') {
    fields.clipSkip = {
      field: 'clipSkip',
      originalValue: clipSkipVal,
      targetField: 'clip_skip',
      mappedValue: clipSkipVal,
      status: clipSkipVal !== null ? 'mapped' : 'not_applicable',
      humanMessage: `作为 Novita clip_skip 发送 (${clipSkipVal})`,
      source: 'https://docs.novita.ai/guides/model-apis-custom-model.md',
    };
  } else if (provider === 'tensorart') {
    fields.clipSkip = {
      field: 'clipSkip',
      originalValue: clipSkipVal,
      targetField: 'diffusion.clipSkip',
      mappedValue: clipSkipVal,
      status: clipSkipVal !== null ? 'mapped' : 'not_applicable',
      humanMessage: `作为 Tensor.Art diffusion.clipSkip 发送 (${clipSkipVal})`,
      source: 'https://tams-docs.tensor.art/zh/docs/api/apis/tams-api-v-1-service-create-job/',
    };
  } else {
    fields.clipSkip = {
      field: 'clipSkip',
      originalValue: clipSkipVal,
      status: 'unsupported',
      humanMessage: `${displayName} 官方 API 未提供 clipSkip 参数。`,
      source: `${displayName} 官方 OpenAPI / 参数契约`,
    };
    if (clipSkipVal !== null && clipSkipVal !== undefined) {
      unsupportedFields.push('clipSkip');
    }
  }

  // 9. Size (width & height)
  const w = recipe.width;
  const h = recipe.height;
  if (provider === 'replicate') {
    const aspect = toReplicateAspectRatio(w, h);
    fields.size = {
      field: 'size',
      originalValue: w && h ? `${w}x${h}` : null,
      targetField: 'aspect_ratio, megapixels',
      mappedValue: { aspect_ratio: aspect, megapixels: '1' },
      status: w && h ? 'mapped' : 'not_applicable',
      humanMessage: `Replicate 不直接接收像素宽高，已计算映射为宽高比 aspect_ratio: "${aspect}", megapixels: "1"`,
      source: 'https://replicate.com/black-forest-labs/flux-dev-lora/api/schema',
    };
  } else if (provider === 'wavespeed') {
    fields.size = {
      field: 'size',
      originalValue: w && h ? `${w}x${h}` : null,
      targetField: 'size',
      mappedValue: w && h ? `${w}*${h}` : null,
      status: w && h ? 'mapped' : 'not_applicable',
      humanMessage: `映射为 WaveSpeed 官方格式 size: "${w}*${h}"`,
      source: 'https://wavespeed.ai/docs/lora-training-usage',
    };
  } else if (provider === 'modelscope' || provider === 'modelscope_ai') {
    fields.size = {
      field: 'size',
      originalValue: w && h ? `${w}x${h}` : null,
      targetField: 'size',
      mappedValue: w && h ? `${w}x${h}` : null,
      status: w && h ? 'mapped' : 'not_applicable',
      humanMessage: `映射为魔搭官方格式 size: "${w}x${h}"`,
      source: 'https://www.modelscope.cn/docs/model-service/API-Inference/intro',
    };
  } else if (provider === 'fal' || provider === 'aimlapi') {
    fields.size = {
      field: 'size',
      originalValue: w && h ? `${w}x${h}` : null,
      targetField: 'image_size',
      mappedValue: w && h ? { width: w, height: h } : null,
      status: w && h ? 'mapped' : 'not_applicable',
      humanMessage: `映射为 image_size: { width: ${w}, height: ${h} }`,
      source: 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/flux-lora',
    };
  } else {
    fields.size = {
      field: 'size',
      originalValue: w && h ? `${w}x${h}` : null,
      targetField: provider === 'huggingface' ? 'parameters.width, parameters.height' : 'width, height',
      mappedValue: { width: w, height: h },
      status: w && h ? 'mapped' : 'not_applicable',
      humanMessage: `作为宽高尺寸发送: ${w}x${h}`,
    };
  }

  // 10. Seed
  fields.seed = {
    field: 'seed',
    originalValue: recipe.seed,
    targetField: provider === 'tensorart' ? 'stages[INPUT_INITIALIZE].inputInitialize.seed' : provider === 'huggingface' ? 'parameters.seed' : 'seed',
    mappedValue: recipe.seed,
    status: recipe.seed !== null && recipe.seed !== undefined ? 'mapped' : 'not_applicable',
    humanMessage: `作为随机种子发送: ${recipe.seed ?? '随机'}`,
  };

  // 11. Denoise
  const denoiseVal = recipe.denoise;
  if (recipe.hasInitImage) {
    fields.denoise = {
      field: 'denoise',
      originalValue: denoiseVal,
      targetField: provider === 'civitai' ? 'strength / denoiseStrength' : provider === 'replicate' ? 'prompt_strength' : 'strength',
      mappedValue: denoiseVal,
      status: denoiseVal !== null ? 'mapped' : 'not_applicable',
      humanMessage: `图生图模式：作为去噪/参考图强度发送 (${denoiseVal})`,
    };
  } else {
    fields.denoise = {
      field: 'denoise',
      originalValue: denoiseVal,
      status: 'not_applicable',
      humanMessage: '纯文本生图模式无需去噪强度参数；仅在传入参考图进行图生图时生效。',
    };
  }

  const isCompatible =
    !isArchUnknown &&
    (baseModelStatus as string) !== 'incompatible' &&
    !adaptedLoras.some((l) => l.status === 'architecture_mismatch');

  return {
    provider,
    displayName,
    isCompatible,
    baseModelArchitecture: baseModelRaw || ecosystem,
    baseModelStatus,
    baseModelMessage,
    fields,
    loras: adaptedLoras,
    unsupportedFields,
    warnings,
  };
}

/**
 * Builds adaptation results for all available target engines.
 */
export function buildAllProviderAdaptations(
  recipe: CivitaiRecipeInput,
  options?: CivitaiAdaptationOptions
): ProviderAdaptationMap {
  const supportedProviders = [
    'civitai',
    'fal',
    'replicate',
    'wavespeed',
    'huggingface',
    'modelscope',
    'modelscope_ai',
    'nanogpt',
    'novita',
    'sogni',
    'aimlapi',
    'muapi',
    'tensorart',
    'video',
    'krea',
    'runware',
    'modelslab',
  ];

  const map: ProviderAdaptationMap = {};
  for (const prov of supportedProviders) {
    map[prov] = adaptCivitaiRecipeToProvider(recipe, prov, options);
  }
  return map;
}
