import { WorkflowPreset, NodeInstance, Connection, SpatialFrame } from '../types/graph';
import { NODE_DEFINITIONS } from './nodes';
import { PROVIDER_TITLE_LABEL } from '../utils/providerLabels';
import { PRESET_RECIPE_PROMPTS } from './presetRecipePrompts';

/** Prompt text allowed in standard presets — never invent creative prompts. */
export const STD_PROMPT_PLACEHOLDER = '填入配方/用户指定';

type StdSpec = {
  provider: string;
  /** Checkpoint targetProvider; defaults to provider. tensorart → openworks (OpenWorks-only). */
  targetProvider?: string;
  ckpt: string;
  hasLora: boolean;
  /** Real LoRAs proven in an accepted run (evidence path in comment at the spec). Chained in order. Empty/missing → no LoRALoader node. */
  loras?: Array<{ name: string; strength: number; source: string }>;
  /** Extra Checkpoint values (civitai engine fields, agnes size, etc.) */
  checkpointExtra?: Record<string, unknown>;
  steps?: number;
  cfg?: number;
  sampler?: string;
  scheduler?: string;
  width?: number;
  height?: number;
  /** false when the endpoint's Schema has no negative prompt field (no 负向提示词 node). Default true. */
  hasNegative?: boolean;
  /**
   * KSampler/frame params the provider's local Schema marks unsupported (providerSchema.ts /
   * provider evidence). Omitted fields are not stored, so graphEngine's numOrUndef never sends them.
   */
  omit?: Array<'seed' | 'steps' | 'cfg' | 'sampler' | 'scheduler' | 'denoise' | 'width' | 'height'>;
  /** Where the model / Schema facts come from (shown nowhere; audit trail for reviewers). */
  source?: string;
  /** Extra KSampler defaults from the endpoint Schema (e.g. seed). */
  seed?: number;
  /** Preset card guidance for configuration that must come from a live provider catalog. */
  description?: string;
  /** Empty LoRA node (mount point) when the official Schema takes a LoRA but no accepted recipe has one. */
  loraMount?: { strength: number; source: string };
  /** Official Schema requires a resource no accepted-run recipe has (e.g. MuAPI lora_url). Card is 待配方, run disabled; never filled with a made-up value. */
  pendingRecipe?: string;
};

function presetId(provider: string): string {
  return provider === 'modelscope_ai' ? 'std-modelscope-ai-t2i' : `std-${provider}-t2i`;
}

function friendly(provider: string): string {
  return PROVIDER_TITLE_LABEL[provider] || provider;
}

/**
 * Seed Checkpoint custom_parameters._canvas.schemaProperties from StdSpec.omit (MuAPI path).
 * Listed props = fields the endpoint accepts (including sampler/scheduler/denoise when NOT omitted).
 * Omitted sampler/scheduler/denoise stay off the list so NodeItem hideSamplerShell can hide empty
 * widgets before a live Schema GET. Never overwrites an existing schemaProperties array (MuAPI / hand-seeded).
 */
function schemaPropertiesForOmit(spec: StdSpec, omit: Set<NonNullable<StdSpec['omit']>[number]>): string[] {
  const props: string[] = ['prompt'];
  if (!omit.has('seed')) props.push('seed');
  if (!omit.has('steps')) props.push('steps', 'num_inference_steps');
  if (!omit.has('cfg')) props.push('guidance', 'guidance_scale', 'cfg', 'cfg_scale');
  if (!omit.has('width') && !omit.has('height')) props.push('width', 'height', 'size', 'image_size');
  if (typeof spec.checkpointExtra?.aspect_ratio === 'string') props.push('aspect_ratio');
  if (typeof spec.checkpointExtra?.resolution === 'string') props.push('resolution');
  if (typeof spec.checkpointExtra?.size === 'string' && !props.includes('size')) props.push('size');
  if (spec.hasNegative !== false) props.push('negative_prompt');
  const hasRealLora = (spec.loras ?? []).some((l) => Boolean(l.name));
  if (hasRealLora || spec.hasLora) props.push('loras', 'lora_url', 'lora_weight', 'lora_weights');
  // Include ONLY non-omitted sampler/scheduler/denoise. Omitting them keeps them off the
  // list so hideSamplerShell can hide empty widgets. Seeding a supported value while leaving
  // the field off this list falsely triggers 「已填，此模型不支持」amber (ModelsLab/Civitai/Novita).
  if (!omit.has('sampler')) props.push('sampler', 'sampler_name');
  if (!omit.has('scheduler')) props.push('scheduler');
  if (!omit.has('denoise')) props.push('denoise', 'strength');
  return props;
}

function mergeOmitSchemaProperties(
  existing: unknown,
  spec: StdSpec,
  omit: Set<NonNullable<StdSpec['omit']>[number]>,
  target: string,
): string | undefined {
  if (omit.size === 0) {
    return typeof existing === 'string' ? existing : existing != null ? JSON.stringify(existing) : undefined;
  }
  let base: Record<string, unknown> = {};
  if (typeof existing === 'string' && existing.trim()) {
    try { base = JSON.parse(existing); } catch { base = {}; }
  } else if (existing && typeof existing === 'object') {
    base = { ...(existing as Record<string, unknown>) };
  }
  const canvas = (base._canvas && typeof base._canvas === 'object' ? { ...(base._canvas as Record<string, unknown>) } : {}) as Record<string, unknown>;
  const already = canvas.schemaProperties;
  if (Array.isArray(already) && already.length > 0) {
    return JSON.stringify(base);
  }
  canvas.scope = { provider: target, model: spec.ckpt };
  canvas.schemaProperties = schemaPropertiesForOmit(spec, omit);
  base._canvas = canvas;
  return JSON.stringify(base);
}

function buildStandardT2i(spec: StdSpec): WorkflowPreset {
  const provider = spec.provider;
  const target = spec.targetProvider || provider;
  const id = presetId(provider);
  const prefix = id.replace(/[^a-z0-9]+/gi, '-');
  // Empty LoRA path/id = empty shell (forbidden). Only real accepted-run LoRAs become nodes.
  const loraList = (spec.loras ?? []).filter(l => Boolean(l.name));
  // Schema requires a LoRA but no recipe has a real one: show ONE visible mount point (official default weight)
  // so the user can paste the real resource; never a made-up value.
  if (loraList.length === 0 && spec.loraMount) loraList.push({ name: '', strength: spec.loraMount.strength, source: spec.loraMount.source });
  const hasLora = loraList.length > 0;
  const steps = spec.steps ?? 20;
  const cfg = spec.cfg ?? 7;
  const sampler = spec.sampler ?? 'euler';
  const scheduler = spec.scheduler ?? 'simple';
  const width = spec.width ?? 1024;
  const height = spec.height ?? 1024;
  const hasNegative = spec.hasNegative !== false;
  const recipe = PRESET_RECIPE_PROMPTS[id];
  const seed = spec.seed ?? 42;
  const omit = new Set(spec.omit ?? []);
  const keep = <T,>(k: NonNullable<StdSpec['omit']>[number], v: T): T | undefined => (omit.has(k) ? undefined : v);
  const prefixName = `std_${target}`;
  // Card + save prefix tell the same story: OpenWorks (not Tensor.Art) when target is openworks.
  const cardLabel = target === 'openworks' ? 'OpenWorks' : friendly(provider);

  const ckptId = `${prefix}-ckpt`;
  const loraId = `${prefix}-lora`;
  const posId = `${prefix}-pos`;
  const negId = `${prefix}-neg`;
  const latId = `${prefix}-lat`;
  const sampId = `${prefix}-samp`;
  const vaeId = `${prefix}-vae`;
  const saveId = `${prefix}-save`;

  const loraIds = loraList.map((_, i) => (i === 0 ? loraId : `${loraId}-${i + 1}`));
  const lastLora = loraIds[loraIds.length - 1];
  const modelSrc = hasLora ? lastLora : ckptId;
  const clipSrc = hasLora ? lastLora : ckptId;

  const extra = { ...(spec.checkpointExtra || {}) } as Record<string, unknown>;
  const mergedCp = mergeOmitSchemaProperties(extra.custom_parameters, spec, omit, target);
  if (mergedCp !== undefined) extra.custom_parameters = mergedCp;
  else delete extra.custom_parameters;

  const checkpoint: NodeInstance = {
    id: ckptId,
    type: 'CheckpointLoaderSimple',
    title: `加载底模 (${friendly(target)})`,
    pos: { x: 50, y: 120 },
    width: 300,
    inputs: [],
    outputs: NODE_DEFINITIONS.CheckpointLoaderSimple.outputs,
    values: {
      ckpt_name: spec.ckpt,
      targetProvider: target,
      ...extra,
      // 待配方: also gate TopBar run after 仅载入 (card button alone is not enough).
      ...(spec.pendingRecipe ? { execution_blocked_reason: spec.pendingRecipe } : {}),
    },
  };

  const nodes: NodeInstance[] = [checkpoint];
  const connections: Connection[] = [];

  loraList.forEach((l, i) => {
    const id = loraIds[i];
    const from = i === 0 ? ckptId : loraIds[i - 1];
    nodes.push({
      id,
      type: 'LoRALoader',
      title: '加载 LoRA',
      pos: { x: 400, y: 80 + i * 340 },
      width: 300,
      inputs: NODE_DEFINITIONS.LoRALoader.inputs,
      outputs: NODE_DEFINITIONS.LoRALoader.outputs,
      values: {
        lora_name: l.name,
        strength_model: l.strength,
        strength_clip: l.strength,
        trigger_words: '',
      },
    });
    const sfx = i === 0 ? '' : `-${i + 1}`;
    connections.push(
      { id: `${prefix}-c-model-lora${sfx}`, fromNodeId: from, fromSocketId: 'MODEL', toNodeId: id, toSocketId: 'model', type: 'MODEL' },
      { id: `${prefix}-c-clip-lora${sfx}`, fromNodeId: from, fromSocketId: 'CLIP', toNodeId: id, toSocketId: 'clip', type: 'CLIP' },
    );
  });

  nodes.push({
    id: posId,
    type: 'CLIPTextEncode',
    title: '正向提示词',
    pos: { x: hasLora ? 760 : 400, y: 140 },
    width: 400,
    inputs: NODE_DEFINITIONS.CLIPTextEncode.inputs,
    outputs: NODE_DEFINITIONS.CLIPTextEncode.outputs,
    values: { text: recipe?.prompt ?? '' },
  });
  connections.push({
    id: `${prefix}-c-clip-pos`,
    fromNodeId: clipSrc,
    fromSocketId: 'CLIP',
    toNodeId: posId,
    toSocketId: 'clip',
    type: 'CLIP',
  });

  {
    if (hasNegative) nodes.push({
        id: negId,
        type: 'CLIPTextEncodeNegative',
        title: '负向提示词',
        pos: { x: hasLora ? 760 : 400, y: 620 },
        width: 400,
        inputs: NODE_DEFINITIONS.CLIPTextEncodeNegative.inputs,
        outputs: NODE_DEFINITIONS.CLIPTextEncodeNegative.outputs,
        values: { text: (hasNegative && recipe?.negative) || '' },
      });
    nodes.push(
      {
        id: latId,
        type: 'EmptyLatentImage',
        title: '尺寸（空潜空间）',
        // Loader column, well below the loader card (挑刺: must not touch 加载底模).
        pos: { x: 50, y: 640 },
        width: 280,
        inputs: [],
        outputs: NODE_DEFINITIONS.EmptyLatentImage.outputs,
        values: Object.fromEntries(Object.entries({
          width: keep('width', width),
          height: keep('height', height),
          // Endpoint sizes via checkpoint size/aspect_ratio (Agnes/Mage): no pixel fields → no batch_size shell either
          // (not in that Schema, never sent). Omit-empty rule: the node shows no blank/unsent widgets.
          batch_size: omit.has('width') && omit.has('height') ? undefined : 1,
        }).filter(([, v]) => v !== undefined)),
      },
      {
        id: sampId,
        type: 'KSampler',
        title: '采样器',
        pos: { x: hasLora ? 1220 : 860, y: 200 },
        width: 300,
        inputs: NODE_DEFINITIONS.KSampler.inputs,
        outputs: NODE_DEFINITIONS.KSampler.outputs,
        values: Object.fromEntries(Object.entries({
          seed: keep('seed', seed),
          control_after_generate: omit.has('seed') ? undefined : 'fixed',
          steps: keep('steps', steps),
          cfg: keep('cfg', cfg),
          sampler_name: keep('sampler', sampler),
          scheduler: keep('scheduler', scheduler),
          denoise: keep('denoise', 1),
        }).filter(([, v]) => v !== undefined)),
      },
      {
        id: vaeId,
        type: 'VAEDecode',
        title: 'VAE 解码',
        pos: { x: hasLora ? 1580 : 1220, y: 200 },
        width: 260,
        inputs: NODE_DEFINITIONS.VAEDecode.inputs,
        outputs: NODE_DEFINITIONS.VAEDecode.outputs,
        values: {},
      },
      {
        id: saveId,
        type: 'SaveImage',
        title: '保存图像',
        pos: { x: hasLora ? 1900 : 1540, y: 200 },
        width: 300,
        inputs: NODE_DEFINITIONS.SaveImage.inputs,
        outputs: [],
        values: { filename_prefix: prefixName },
      },
    );
    connections.push(
      { id: `${prefix}-c-model-samp`, fromNodeId: modelSrc, fromSocketId: 'MODEL', toNodeId: sampId, toSocketId: 'model', type: 'MODEL' },
      { id: `${prefix}-c-pos-samp`, fromNodeId: posId, fromSocketId: 'CONDITIONING', toNodeId: sampId, toSocketId: 'positive', type: 'CONDITIONING' },
      { id: `${prefix}-c-lat-samp`, fromNodeId: latId, fromSocketId: 'LATENT', toNodeId: sampId, toSocketId: 'latent_image', type: 'LATENT' },
      { id: `${prefix}-c-samp-vae`, fromNodeId: sampId, fromSocketId: 'LATENT', toNodeId: vaeId, toSocketId: 'samples', type: 'LATENT' },
      { id: `${prefix}-c-ckpt-vae`, fromNodeId: ckptId, fromSocketId: 'VAE', toNodeId: vaeId, toSocketId: 'vae', type: 'VAE' },
      { id: `${prefix}-c-vae-save`, fromNodeId: vaeId, fromSocketId: 'IMAGE', toNodeId: saveId, toSocketId: 'images', type: 'IMAGE' },
    );
    if (hasNegative) connections.push(
      { id: `${prefix}-c-clip-neg`, fromNodeId: clipSrc, fromSocketId: 'CLIP', toNodeId: negId, toSocketId: 'clip', type: 'CLIP' },
      { id: `${prefix}-c-neg-samp`, fromNodeId: negId, fromSocketId: 'CONDITIONING', toNodeId: sampId, toSocketId: 'negative', type: 'CONDITIONING' },
    );
  }

  const spatialFrames: SpatialFrame[] = [
    {
      id: `${prefix}-frame`,
      title: `${cardLabel} · 标准文生图`,
      pos: { x: 260, y: 160 },
      width: 480,
      height: 480,
      prompt: recipe?.prompt ?? '',
      negativePrompt: (hasNegative && recipe?.negative) || '',
      params: {
        checkpoint: spec.ckpt,
        targetProvider: target as SpatialFrame['params']['targetProvider'],
        ...(spec.pendingRecipe ? { executionBlockedReason: spec.pendingRecipe } : {}),
        seed: keep('seed', seed),
        seedControl: 'fixed',
        steps: keep('steps', steps),
        cfg: keep('cfg', cfg),
        sampler: keep('sampler', sampler),
        scheduler: keep('scheduler', scheduler),
        denoise: keep('denoise', 1),
        width: keep('width', width),
        height: keep('height', height),
        batchSize: 1,
        loras: loraList.map(l => ({ name: l.name, modelStrength: l.strength, clipStrength: l.strength, triggerWords: '' })),
        ...(spec.checkpointExtra?.civitai_engine
          ? {
              civitaiEngine: spec.checkpointExtra.civitai_engine as string,
              civitaiEcosystem: spec.checkpointExtra.civitai_ecosystem as string,
              civitaiModel: spec.checkpointExtra.civitai_model as string,
            }
          : {}),
        // Size tokens from checkpointExtra when the endpoint uses aspect/resolution (Agnes/Mage), not EmptyLatent pixels.
        ...((spec.checkpointExtra?.size || spec.checkpointExtra?.aspect_ratio || spec.checkpointExtra?.resolution)
          ? {
              ...(typeof spec.checkpointExtra.size === 'string' ? { size: spec.checkpointExtra.size } : {}),
              ...(typeof spec.checkpointExtra.resolution === 'string' ? { resolution: spec.checkpointExtra.resolution } : {}),
              ...(typeof spec.checkpointExtra.aspect_ratio === 'string' ? { aspectRatio: spec.checkpointExtra.aspect_ratio } : {}),
            }
          : {}),
        ...(typeof checkpoint.values.custom_parameters === 'string'
          ? { customParameters: checkpoint.values.custom_parameters as string }
          : {}),
      },
      status: 'idle',
      imageUrl: '',
      createdAt: Date.now(),
    },
  ];

  nodes.forEach(n => { n.titleSource = 'template'; });

  return {
    id,
    name: `${cardLabel} · 标准文生图`,
    category: '标准文生图',
    provider,
    previewImage: '',
    tags: [provider, '标准', '文生图'],
    description: spec.description || '该供应商标准文生图流程；提示词请填配方或用户指定。',
    loraNames: loraList.map(l => l.name).filter(Boolean),
    ...(spec.pendingRecipe ? { pendingRecipe: spec.pendingRecipe } : {}),
    nodes,
    connections,
    spatialFrames,
  };
}

/** GeminiDriver.ts:21 + providerSchema.ts:128; docs/evidence/t7-gemini-acceptance.md (official model code). */
const GEMINI_DEFAULT_MODEL = 'gemini-3.1-flash-image';

function buildGeminiT2i(): WorkflowPreset {
  const provider = 'gemini';
  const id = 'std-gemini-t2i';
  return {
    id,
    name: `${friendly(provider)} · 标准文生图`,
    category: '标准文生图',
    provider,
    previewImage: '',
    tags: [provider, '标准', '文生图'],
    description: '该供应商标准文生图流程；提示词请填配方或用户指定。',
    loraNames: [],
    nodes: [
      {
        id: 'std-gemini-pos',
        type: 'CLIPTextEncode',
        title: '正向提示词',
        titleSource: 'template',
        pos: { x: 80, y: 120 },
        width: 400,
        inputs: NODE_DEFINITIONS.CLIPTextEncode.inputs,
        outputs: NODE_DEFINITIONS.CLIPTextEncode.outputs,
        values: { text: PRESET_RECIPE_PROMPTS[id]?.prompt ?? '' },
      },
      {
        id: 'std-gemini-imagen',
        type: 'GoogleImagenNode',
        title: 'Gemini generateContent',
        titleSource: 'template',
        pos: { x: 540, y: 140 },
        width: 320,
        inputs: NODE_DEFINITIONS.GoogleImagenNode.inputs,
        outputs: NODE_DEFINITIONS.GoogleImagenNode.outputs,
        values: { model: GEMINI_DEFAULT_MODEL, aspect_ratio: '1:1', targetProvider: 'gemini' },
      },
      {
        id: 'std-gemini-save',
        type: 'SaveImage',
        title: '保存图像',
        titleSource: 'template',
        pos: { x: 920, y: 140 },
        width: 300,
        inputs: NODE_DEFINITIONS.SaveImage.inputs,
        outputs: [],
        values: { filename_prefix: 'std_gemini' },
      },
    ],
    connections: [
      { id: 'std-gemini-c1', fromNodeId: 'std-gemini-pos', fromSocketId: 'CONDITIONING', toNodeId: 'std-gemini-imagen', toSocketId: 'positive', type: 'CONDITIONING' },
      { id: 'std-gemini-c2', fromNodeId: 'std-gemini-imagen', fromSocketId: 'IMAGE', toNodeId: 'std-gemini-save', toSocketId: 'images', type: 'IMAGE' },
    ],
    spatialFrames: [
      {
        id: 'std-gemini-frame',
        title: 'Gemini · 标准文生图',
        pos: { x: 260, y: 160 },
        width: 480,
        height: 480,
        prompt: PRESET_RECIPE_PROMPTS[id]?.prompt ?? '',
        negativePrompt: '',
        params: {
          checkpoint: GEMINI_DEFAULT_MODEL,
          targetProvider: 'gemini',
          seedControl: 'fixed',
          width: 1024,
          height: 1024,
          batchSize: 1,
          loras: [],
        },
        status: 'idle',
        imageUrl: '',
        createdAt: Date.now(),
      },
    ],
  };
}

/**
 * I2V providers locked by Researchy field-check (2026-10-17).
 * Seed ONLY official duration / resolution / frames fields (live OpenAPI or provider docs, 2026-11-03).
 * Unsupported keys are omitted entirely (no empty shells). schemaProperties lets NodeItem hide
 * duration/aspect/fps/num_frames/resolution before a live Schema GET (same pattern as T2I omit).
 */
type I2vSpec = {
  provider: string;
  model: string;
  /** Official seconds when the endpoint declares duration (not invent). */
  duration?: number;
  /** Official resolution tier when the endpoint declares resolution. */
  resolution?: string;
  /** Official aspect when the endpoint declares aspect_ratio / aspectRatio for this I2V mode. */
  aspect_ratio?: string;
  /** Official frame count (e.g. Novita SVD-XT frames_num=25). */
  num_frames?: number;
  /** Official fps / frames_per_second (e.g. Novita = 6). */
  fps?: number;
  /** Declared Schema property names for hide-before-Schema (aliases included). */
  schemaProperties: string[];
  /** Declared upstream variant selectors sent as-is (e.g. Civitai videoGen engine/version/provider/operation). */
  selectors?: Record<string, string>;
  /** Evidence URL / path — audit trail only. */
  source: string;
  /** Recipe values copied verbatim (temp/audit-2026-11-04/recipe-mapping-log.md); sent as filled. */
  seed?: number;
  cfg?: number;
  size?: string;
  /** Extra recipe fields sent as-is via custom_parameters (e.g. Civitai comfy width/height/shift). */
  recipeExtra?: Record<string, unknown>;
  /** Recipe LoRAs (URL or provider-hosted id) → LoRALoader chained into AIVideoNode.lora. */
  loras?: Array<{ name: string; strength: number; source: string }>;
};

const I2V_SPECS: I2vSpec[] = [
  // Recipe https://civitai.red/images/84050423 (Wan 2.1 I2V 14B 480p + Matrix Bullet Time LoRA) → Fal same-family fal-ai/wan-i2v-lora.
  // Live OpenAPI 2026-11-04: loras[LoraWeight{path,scale}], seed, guide_scale, frames_per_second, num_frames, resolution 480p|720p.
  {
    provider: 'fal',
    model: 'fal-ai/wan-i2v-lora',
    // video-param-table.md §1: Schema has no duration/size → num_frames 81 (integer 81–100), resolution 480p (default 720p), aspect_ratio 16:9.
    num_frames: 81,
    resolution: '480p',
    aspect_ratio: '16:9',
    fps: 16,
    seed: 24231881,
    cfg: 4,
    loras: [{ name: 'https://huggingface.co/Remade-AI/matrix-shot/resolve/main/matrix_shot.safetensors', strength: 1, source: 'https://civitai.red/images/84050423' }],
    schemaProperties: [
      'prompt', 'image_url', 'negative_prompt', 'loras', 'seed', 'guide_scale', 'frames_per_second', 'num_frames',
      'resolution', 'aspect_ratio', 'num_inference_steps', 'shift', 'enable_prompt_expansion', 'reverse_video', 'turbo_mode', 'enable_safety_checker',
    ],
    source: 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/wan-i2v-lora',
  },
  // Same recipe → WaveSpeed same-family wavespeed-ai/wan-2.1/i2v-480p-lora (docs: loras[].path/scale, size, duration 5|10, guidance_scale, seed).
  {
    provider: 'wavespeed',
    model: 'wavespeed-ai/wan-2.1/i2v-480p-lora',
    duration: 5,
    // video-param-table.md §2: request_schema has no fps (additionalProperties:false) → not filled.
    seed: 24231881,
    cfg: 4,
    // Recipe 688x480 → WaveSpeed live Schema size enum ["832*480","480*832"] (upstream 400 on 688x480): closest landscape 832*480.
    size: '832*480',
    loras: [{ name: 'https://huggingface.co/Remade-AI/matrix-shot/resolve/main/matrix_shot.safetensors', strength: 1, source: 'https://civitai.red/images/84050423' }],
    schemaProperties: ['prompt', 'image', 'negative_prompt', 'loras', 'size', 'num_inference_steps', 'duration', 'guidance_scale', 'flow_shift', 'seed'],
    source: 'https://wavespeed.ai/docs/docs-api/wavespeed-ai/wan-2.1-i2v-480p-lora',
  },
  // Recipe https://civitai.red/images/111400580 (Wan 2.2 I2V-A14B checkpoint 1817671@2114157 + Cinematic Flare low LoRA)
  // → Civitai videoGen wan v2.2 comfy (wan.md: only v2.2 comfy takes loras[{air,strength}]; diffusionModel AIR; width/height; cfgScale; seed).
  {
    provider: 'civitai',
    model: 'urn:air:wanvideo-22-i2v-a14b:checkpoint:civitai:1817671@2114157',
    fps: 24,
    seed: 1715864103,
    cfg: 3,
    recipeExtra: { width: 480, height: 832, shift: 7 },
    selectors: { engine: 'wan', version: 'v2.2', provider: 'comfy' },
    loras: [{ name: 'urn:air:wanvideo-22-i2v-a14b:lora:civitai:1902817@2153813', strength: 1, source: 'https://civitai.red/images/111400580' }],
    schemaProperties: [
      'prompt', 'sourceImage', 'images', 'diffusionModel', 'width', 'height', 'cfgScale', 'seed', 'steps', 'fps', 'duration',
      'loras', 'negativePrompt', 'sampler', 'scheduler', 'shift',
    ],
    source: 'https://developer.civitai.com/orchestration/recipes/wan.md',
  },
  // Novita img2video SVD-XT: no recipe (Researchy: no Novita video LoRA endpoint found) — unchanged.
  {
    provider: 'novita',
    model: 'SVD-XT',
    num_frames: 25,
    fps: 6,
    schemaProperties: [
      'model_name', 'image_file', 'frames_num', 'frames_per_second', 'seed',
      'image_file_resize_mode', 'steps', 'motion_bucket_id', 'cond_aug',
    ],
    source: 'https://github.com/novitalabs/python-sdk examples/img2video + docs/provider-schema-drafts/novita.json',
  },
  // Recipe https://civitai.red/images/84050423 → MuAPI same-family wan2.1-lora-i2v (openapi.json WanLoRAI2VRequest: lora_list[LoraItem{path,scale}], duration 5|10, resolution).
  {
    provider: 'muapi',
    model: 'wan2.1-lora-i2v',
    duration: 5,
    // video-param-table.md §3: WanLoRAI2VRequest has no seed/cfg/fps/size/negative → not filled; resolution 480p, aspect_ratio 16:9.
    resolution: '480p',
    aspect_ratio: '16:9',
    loras: [{ name: 'https://huggingface.co/Remade-AI/matrix-shot/resolve/main/matrix_shot.safetensors', strength: 1, source: 'https://civitai.red/images/84050423' }],
    schemaProperties: ['prompt', 'image_url', 'lora_list', 'aspect_ratio', 'resolution', 'quality', 'duration'],
    source: 'https://api.muapi.ai/openapi.json#/paths/~1api~1v1~1wan2.1-lora-i2v',
  },
  // Recipe https://civitai.red/images/84050423 → Replicate same-family wan-video/wan2.1-with-lora (llms.txt: image, lora_url, lora_strength_model, seed, sample_guide_scale, frames).
  {
    provider: 'replicate',
    model: 'wan-video/wan2.1-with-lora',
    // video-param-table.md §4: Schema has no fps/duration/size → frames 81 (enum 17|33|49|65|81), resolution 480p, aspect_ratio 16:9, model 14b.
    num_frames: 81,
    resolution: '480p',
    aspect_ratio: '16:9',
    recipeExtra: { model: '14b' },
    seed: 24231881,
    cfg: 4,
    loras: [{ name: 'https://huggingface.co/Remade-AI/matrix-shot/resolve/main/matrix_shot.safetensors', strength: 1, source: 'https://civitai.red/images/84050423' }],
    schemaProperties: ['prompt', 'negative_prompt', 'image', 'aspect_ratio', 'frames', 'resolution', 'lora_url', 'lora_strength_model', 'lora_strength_clip', 'sample_steps', 'sample_guide_scale', 'sample_shift', 'seed'],
    source: 'https://replicate.com/wan-video/wan2.1-with-lora/llms.txt',
  },
];

export type T2vSpec = I2vSpec;

const T2V_SPECS: T2vSpec[] = [
  // Fal Wan 2.1 T2V: live OpenAPI (2026-11-04) WanT2vLoraInput: prompt (required), negative_prompt, loras[LoraWeight{path,scale}],
  // seed, frames_per_second (default 16), num_frames (default 81), resolution 480p|580p|720p, aspect_ratio 16:9|9:16.
  // Real verified LoRA trained specifically on base_model Wan-AI/Wan2.1-T2V-14B:
  // https://huggingface.co/artificialguybr/Wan-BalancingAct-Redmond-Wan2.1-T2V-14B (tags: base_model:Wan-AI/Wan2.1-T2V-14B, diffusers, text-to-video)
  {
    provider: 'fal',
    model: 'fal-ai/wan-t2v-lora',
    num_frames: 81,
    resolution: '480p',
    aspect_ratio: '16:9',
    fps: 16,
    loras: [{ name: 'https://huggingface.co/artificialguybr/Wan-BalancingAct-Redmond-Wan2.1-T2V-14B/resolve/main/Wan-BalancingAct-Redmond.safetensors', strength: 1, source: 'https://huggingface.co/artificialguybr/Wan-BalancingAct-Redmond-Wan2.1-T2V-14B' }],
    schemaProperties: [
      'prompt', 'negative_prompt', 'loras', 'seed', 'frames_per_second', 'num_frames',
      'resolution', 'aspect_ratio', 'num_inference_steps', 'enable_prompt_expansion', 'reverse_video', 'turbo_mode', 'enable_safety_checker',
    ],
    source: 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/wan-t2v-lora',
  },
  // WaveSpeed Wan 2.1 T2V 480p: live Schema api.wavespeed.ai/api/v3/models: prompt (required), negative_prompt,
  // loras[].path/scale, size ["832*480","480*832"], duration 5|10, guidance_scale, flow_shift, seed.
  // Real verified LoRA trained on Wan-AI/Wan2.1-T2V-14B:
  {
    provider: 'wavespeed',
    model: 'wavespeed-ai/wan-2.1/t2v-480p-lora',
    duration: 5,
    size: '832*480',
    loras: [{ name: 'https://huggingface.co/artificialguybr/Wan-BalancingAct-Redmond-Wan2.1-T2V-14B/resolve/main/Wan-BalancingAct-Redmond.safetensors', strength: 1, source: 'https://huggingface.co/artificialguybr/Wan-BalancingAct-Redmond-Wan2.1-T2V-14B' }],
    schemaProperties: ['prompt', 'negative_prompt', 'loras', 'size', 'num_inference_steps', 'duration', 'guidance_scale', 'flow_shift', 'seed'],
    source: 'https://wavespeed.ai/docs/docs-api/wavespeed-ai/wan-2.1-t2v-480p-lora',
  },
  // Civitai videoGen wan v2.2 comfy: Wan Video 2.2 14B Text-to-Video checkpoint (AIR urn:air:wanvideo-22-t2v-a14b:checkpoint:civitai:1817671@2114154).
  // Real neutral T2V LoRA trained on exact baseModel Wan Video 2.2 T2V-A14B:
  // Stylized PBR Animation [WAN 2.2 T2V] (Civitai 2247725@2530788, nsfwLevel: 1, baseModel: Wan Video 2.2 T2V-A14B).
  // Swapped from 1837542 per Tower P1-d (neutral public default content).
  {
    provider: 'civitai',
    model: 'urn:air:wanvideo-22-t2v-a14b:checkpoint:civitai:1817671@2114154',
    fps: 24,
    cfg: 3,
    recipeExtra: { width: 832, height: 480, shift: 7 },
    selectors: { engine: 'wan', version: 'v2.2', provider: 'comfy' },
    loras: [{ name: 'urn:air:wanvideo-22-t2v-a14b:lora:civitai:2247725@2530788', strength: 1, source: 'https://civitai.com/models/2247725?modelVersionId=2530788' }],
    schemaProperties: [
      'prompt', 'diffusionModel', 'width', 'height', 'cfgScale', 'seed', 'steps', 'fps', 'duration',
      'loras', 'negativePrompt', 'sampler', 'scheduler', 'shift',
    ],
    source: 'https://developer.civitai.com/orchestration/recipes/wan.md',
  },
  // MuAPI Wan 2.1 T2V: live OpenAPI https://api.muapi.ai/openapi.json WanLoRAT2VRequest: prompt (required),
  // lora_list[LoraItem{path,scale}], duration 5|10, resolution 480p|720p, aspect_ratio 16:9|9:16.
  // Real verified LoRA trained on Wan-AI/Wan2.1-T2V-14B:
  {
    provider: 'muapi',
    model: 'wan2.1-lora-t2v',
    duration: 5,
    resolution: '480p',
    aspect_ratio: '16:9',
    loras: [{ name: 'https://huggingface.co/artificialguybr/Wan-BalancingAct-Redmond-Wan2.1-T2V-14B/resolve/main/Wan-BalancingAct-Redmond.safetensors', strength: 1, source: 'https://huggingface.co/artificialguybr/Wan-BalancingAct-Redmond-Wan2.1-T2V-14B' }],
    schemaProperties: ['prompt', 'lora_list', 'aspect_ratio', 'resolution', 'quality', 'duration'],
    source: 'https://api.muapi.ai/openapi.json#/paths/~1api~1v1~1wan2.1-lora-t2v',
  },
  // Replicate Wan 2.1 with LoRA (text-to-video mode: no image input).
  // Live schema: prompt (required), negative_prompt, aspect_ratio, frames, resolution, lora_url, lora_strength_model, sample_steps, sample_guide_scale, seed.
  // Real verified LoRA trained on Wan-AI/Wan2.1-T2V-14B:
  {
    provider: 'replicate',
    model: 'wan-video/wan2.1-with-lora',
    num_frames: 81,
    resolution: '480p',
    aspect_ratio: '16:9',
    recipeExtra: { model: '14b' },
    loras: [{ name: 'https://huggingface.co/artificialguybr/Wan-BalancingAct-Redmond-Wan2.1-T2V-14B/resolve/main/Wan-BalancingAct-Redmond.safetensors', strength: 1, source: 'https://huggingface.co/artificialguybr/Wan-BalancingAct-Redmond-Wan2.1-T2V-14B' }],
    schemaProperties: ['prompt', 'negative_prompt', 'aspect_ratio', 'frames', 'resolution', 'lora_url', 'lora_strength_model', 'lora_strength_clip', 'sample_steps', 'sample_guide_scale', 'sample_shift', 'seed'],
    source: 'https://replicate.com/wan-video/wan2.1-with-lora/api/schema',
  },
];

function buildStandardT2v(spec: T2vSpec): WorkflowPreset {
  const provider = spec.provider;
  const id = `std-${provider}-t2v`;
  const prefix = id;
  const vidId = `${prefix}-vid`;
  const saveId = `${prefix}-save`;
  const vidValues: Record<string, unknown> = {
    targetProvider: provider,
    model: spec.model,
    prompt: PRESET_RECIPE_PROMPTS[id]?.prompt ?? '',
    require_reference_image: false,
    custom_parameters: JSON.stringify({
      ...(spec.recipeExtra ?? {}),
      _canvas: {
        scope: { provider, model: spec.model },
        schemaProperties: spec.schemaProperties,
      },
    }),
  };
  if (spec.seed !== undefined) { vidValues.seed = spec.seed; vidValues.control_after_generate = 'fixed'; }
  if (spec.cfg !== undefined) vidValues.cfg = spec.cfg;
  if (spec.size !== undefined) vidValues.size = spec.size;
  const t2vLoras = spec.loras ?? [];
  const loraNodeIds = t2vLoras.map((_, i) => `${prefix}-lora${i === 0 ? '' : `-${i + 1}`}`);
  if (spec.schemaProperties.includes('negative_prompt')) vidValues.negative_prompt = PRESET_RECIPE_PROMPTS[id]?.negative ?? '';
  if (spec.duration !== undefined) vidValues.duration = spec.duration;
  if (spec.resolution !== undefined) vidValues.resolution = spec.resolution;
  if (spec.aspect_ratio !== undefined) vidValues.aspect_ratio = spec.aspect_ratio;
  if (spec.num_frames !== undefined) vidValues.num_frames = spec.num_frames;
  if (spec.fps !== undefined) vidValues.fps = spec.fps;
  if (spec.selectors) vidValues.video_selectors = { ...spec.selectors };

  const frameParams: SpatialFrame['params'] = {
    checkpoint: spec.model,
    targetProvider: provider as SpatialFrame['params']['targetProvider'],
    seedControl: 'fixed',
    batchSize: 1,
    loras: t2vLoras.map(l => ({ name: l.name, modelStrength: l.strength, clipStrength: l.strength, triggerWords: '' })),
    videoProvider: provider,
    requireReferenceImage: false,
  };
  if (spec.duration !== undefined) frameParams.videoDuration = spec.duration;
  if (spec.fps !== undefined) frameParams.videoFps = spec.fps;
  if (spec.num_frames !== undefined) frameParams.videoFrames = spec.num_frames;
  if (spec.aspect_ratio !== undefined) frameParams.aspectRatio = spec.aspect_ratio;

  const preset: WorkflowPreset = {
    id,
    name: `${friendly(provider)} · 标准文生视频`,
    category: '标准文生视频',
    provider,
    previewImage: '',
    tags: [provider, '标准', '文生视频'],
    description: '该供应商标准文生视频流程；提示词请填配方或用户指定。',
    loraNames: t2vLoras.map(l => l.name),
    nodes: [
      {
        id: vidId,
        type: 'AIVideoNode',
        title: `AI 视频 (${friendly(provider)})`,
        pos: { x: 400, y: 100 },
        width: 340,
        inputs: NODE_DEFINITIONS.AIVideoNode.inputs,
        outputs: NODE_DEFINITIONS.AIVideoNode.outputs,
        values: vidValues,
      },
      {
        id: saveId,
        type: 'SaveVideo',
        title: '保存视频',
        pos: { x: 800, y: 120 },
        width: 280,
        inputs: NODE_DEFINITIONS.SaveVideo.inputs,
        outputs: [],
        values: { filename_prefix: `std_${provider}_t2v` },
      },
    ],
    connections: [
      {
        id: `${prefix}-c-vid-save`,
        fromNodeId: vidId,
        fromSocketId: 'VIDEO',
        toNodeId: saveId,
        toSocketId: 'video',
        type: 'VIDEO',
      },
    ],
    spatialFrames: [
      {
        id: `${prefix}-frame`,
        title: `${friendly(provider)} · 标准文生视频`,
        pos: { x: 260, y: 160 },
        width: 480,
        height: 480,
        prompt: PRESET_RECIPE_PROMPTS[id]?.prompt ?? '',
        negativePrompt: '',
        params: frameParams,
        status: 'idle',
        imageUrl: '',
        createdAt: Date.now(),
      },
    ],
  };

  t2vLoras.forEach((l, i) => {
    preset.nodes.push({
      id: loraNodeIds[i],
      type: 'LoRALoader',
      title: '加载 LoRA',
      pos: { x: 50, y: 320 + i * 340 },
      width: 300,
      inputs: NODE_DEFINITIONS.LoRALoader.inputs,
      outputs: NODE_DEFINITIONS.LoRALoader.outputs,
      values: { lora_name: l.name, strength_model: l.strength, strength_clip: l.strength, trigger_words: '' },
    });
    if (i > 0) preset.connections.push({ id: `${prefix}-c-lora-chain-${i + 1}`, fromNodeId: loraNodeIds[i - 1], fromSocketId: 'MODEL', toNodeId: loraNodeIds[i], toSocketId: 'model', type: 'MODEL' });
  });
  if (loraNodeIds.length) {
    preset.connections.push({ id: `${prefix}-c-lora-vid`, fromNodeId: loraNodeIds[loraNodeIds.length - 1], fromSocketId: 'MODEL', toNodeId: vidId, toSocketId: 'lora', type: 'MODEL' });
  }
  preset.nodes.forEach(n => { n.titleSource = 'template'; });
  return preset;
}

function buildStandardI2v(spec: I2vSpec): WorkflowPreset {
  const provider = spec.provider;
  const id = `std-${provider}-i2v`;
  const prefix = id;
  const loadId = `${prefix}-load`;
  const vidId = `${prefix}-vid`;
  const saveId = `${prefix}-save`;
  // Single prompt source: AIVideoNode.values.prompt (「视频描述」).
  // graphEngine reads CLIP→positive first when wired; a separate CLIP node would shadow this field.
  // Runtime submit uses params.prompt from that one field (SchemaProviderDriver / WaveSpeed).
  // Only seed official fields — never write empty duration/fps/aspect_ratio shells.
  const vidValues: Record<string, unknown> = {
    targetProvider: provider,
    model: spec.model,
    prompt: PRESET_RECIPE_PROMPTS[id]?.prompt ?? '',
    // Front-door: I2V needs a real reference image; LoadImage starts empty so readiness / node note fire.
    require_reference_image: true,
    custom_parameters: JSON.stringify({
      ...(spec.recipeExtra ?? {}),
      _canvas: {
        scope: { provider, model: spec.model },
        schemaProperties: spec.schemaProperties,
      },
    }),
  };
  if (spec.seed !== undefined) { vidValues.seed = spec.seed; vidValues.control_after_generate = 'fixed'; }
  if (spec.cfg !== undefined) vidValues.cfg = spec.cfg;
  if (spec.size !== undefined) vidValues.size = spec.size;
  const i2vLoras = spec.loras ?? [];
  const loraNodeIds = i2vLoras.map((_, i) => `${prefix}-lora${i === 0 ? '' : `-${i + 1}`}`);
  // Only seed negative when the endpoint Schema lists it — avoid empty Replicate negative shell.
  if (spec.schemaProperties.includes('negative_prompt')) vidValues.negative_prompt = PRESET_RECIPE_PROMPTS[id]?.negative ?? '';
  if (spec.duration !== undefined) vidValues.duration = spec.duration;
  if (spec.resolution !== undefined) vidValues.resolution = spec.resolution;
  if (spec.aspect_ratio !== undefined) vidValues.aspect_ratio = spec.aspect_ratio;
  if (spec.num_frames !== undefined) vidValues.num_frames = spec.num_frames;
  if (spec.fps !== undefined) vidValues.fps = spec.fps;
  if (spec.selectors) vidValues.video_selectors = { ...spec.selectors };

  const frameParams: SpatialFrame['params'] = {
    checkpoint: spec.model,
    targetProvider: provider as SpatialFrame['params']['targetProvider'],
    seedControl: 'fixed',
    batchSize: 1,
    loras: i2vLoras.map(l => ({ name: l.name, modelStrength: l.strength, clipStrength: l.strength, triggerWords: '' })),
    videoProvider: provider,
    requireReferenceImage: true,
  };
  if (spec.duration !== undefined) frameParams.videoDuration = spec.duration;
  if (spec.fps !== undefined) frameParams.videoFps = spec.fps;
  if (spec.num_frames !== undefined) frameParams.videoFrames = spec.num_frames;
  if (spec.aspect_ratio !== undefined) frameParams.aspectRatio = spec.aspect_ratio;
  // No fake width/height 1024 — video size is resolution / source image, not EmptyLatent pixels.

  const preset: WorkflowPreset = {
    id,
    name: `${friendly(provider)} · 标准图生视频`,
    category: '标准图生视频',
    provider,
    previewImage: '',
    tags: [provider, '标准', '图生视频'],
    description: '该供应商标准图生视频流程；提示词请填配方或用户指定。须先在「加载参考图」放入图片。',
    loraNames: i2vLoras.map(l => l.name),
    nodes: [
      {
        id: loadId,
        type: 'LoadImage',
        title: '加载参考图',
        pos: { x: 50, y: 200 },
        width: 280,
        inputs: [],
        outputs: NODE_DEFINITIONS.LoadImage.outputs,
        values: { image_url: '' },
      },
      {
        id: vidId,
        type: 'AIVideoNode',
        title: `AI 视频 (${friendly(provider)})`,
        pos: { x: 400, y: 100 },
        width: 340,
        inputs: NODE_DEFINITIONS.AIVideoNode.inputs,
        outputs: NODE_DEFINITIONS.AIVideoNode.outputs,
        values: vidValues,
      },
      {
        id: saveId,
        type: 'SaveVideo',
        title: '保存视频',
        pos: { x: 800, y: 120 },
        width: 280,
        inputs: NODE_DEFINITIONS.SaveVideo.inputs,
        outputs: [],
        values: { filename_prefix: `std_${provider}_i2v` },
      },
    ],
    connections: [
      {
        id: `${prefix}-c-load-vid`,
        fromNodeId: loadId,
        fromSocketId: 'IMAGE',
        toNodeId: vidId,
        toSocketId: 'init_image',
        type: 'IMAGE',
      },
      {
        id: `${prefix}-c-vid-save`,
        fromNodeId: vidId,
        fromSocketId: 'VIDEO',
        toNodeId: saveId,
        toSocketId: 'video',
        type: 'VIDEO',
      },
    ],
    spatialFrames: [
      {
        id: `${prefix}-frame`,
        title: `${friendly(provider)} · 标准图生视频`,
        pos: { x: 260, y: 160 },
        width: 480,
        height: 480,
        prompt: PRESET_RECIPE_PROMPTS[id]?.prompt ?? '',
        negativePrompt: '',
        params: frameParams,
        status: 'idle',
        imageUrl: '',
        createdAt: Date.now(),
      },
    ],
  };
  // Recipe LoRAs: LoRALoader chain → AIVideoNode.lora (graphEngine traces it; server maps into the endpoint's declared LoRA field).
  i2vLoras.forEach((l, i) => {
    preset.nodes.push({
      id: loraNodeIds[i],
      type: 'LoRALoader',
      title: '加载 LoRA',
      pos: { x: 50, y: 520 + i * 340 },
      width: 300,
      inputs: NODE_DEFINITIONS.LoRALoader.inputs,
      outputs: NODE_DEFINITIONS.LoRALoader.outputs,
      values: { lora_name: l.name, strength_model: l.strength, strength_clip: l.strength, trigger_words: '' },
    });
    if (i > 0) preset.connections.push({ id: `${prefix}-c-lora-chain-${i + 1}`, fromNodeId: loraNodeIds[i - 1], fromSocketId: 'MODEL', toNodeId: loraNodeIds[i], toSocketId: 'model', type: 'MODEL' });
  });
  if (loraNodeIds.length) {
    preset.connections.push({ id: `${prefix}-c-lora-vid`, fromNodeId: loraNodeIds[loraNodeIds.length - 1], fromSocketId: 'MODEL', toNodeId: vidId, toSocketId: 'lora', type: 'MODEL' });
  }
  preset.nodes.forEach(n => { n.titleSource = 'template'; });
  return preset;
}

/**
 * 23 standard text-to-image + 6 standard image-to-video.
 * SenseNova/Sogni stay on the roster (雁: every listed provider keeps a standard card).
 * Sogni: protocol selector krea-2-turbo (LoRA via loras+loraStrengths; no steps/cfg in schema).
 * SenseNova: sensenova-u1.5-lite (official Token Plan; no LoRA in image Schema).
 * OpenWorks T2I: full params + LoRA (雁 2026-10-17 15:27 override of the old four-field rule).
 * WaveSpeed T2I: wavespeed-ai/flux-dev-lora (accepted board hist_1792224305224_meynb); Schema has no negative.
 * I2V: fal/wavespeed/civitai/novita/muapi/replicate.
 */
const STD_SPECS: StdSpec[] = [
  // HF route = fal-ai: live https://huggingface.co/api/models/Tongyi-MAI/Z-Image-Turbo?expand[]=inferenceProviderMapping
  // (2026-11-04) lists fal-ai (fal-ai/z-image/turbo) status live, task text-to-image; hf-inference is not listed.
  // server.ts fal-ai branch sends width/height → image_size, steps → num_inference_steps, seed. Route preset so it runs unchanged.
  // Recipe https://civitai.red/images/113739497 (verbatim: seed/steps/cfg/size/LoRA@0.9; sampler 'Undefined' → none). HF LoRA route: model = the LoRA repo
  // (inferenceProviderMapping fal-ai live, providerId fal-ai/z-image/turbo/lora); server sends the same-repo LoRA scale.
  { provider: 'huggingface', ckpt: 'renderartist/Technically-Color-Z-Image-Turbo', hasLora: true, hasNegative: false,
    loras: [{ name: 'renderartist/Technically-Color-Z-Image-Turbo', strength: 0.9, source: 'https://civitai.red/images/113739497' }],
    seed: 1840591390, steps: 12, cfg: 1, width: 1216, height: 832,
    omit: ['sampler', 'scheduler', 'denoise'],
    checkpointExtra: { hf_provider: 'fal-ai' },
  },
  // Official API-Inference: size/steps/guidance/seed/negative_prompt/loras; sampler/scheduler/denoise not on REST table → omit (no empty shells).
  // Recipe https://civitai.red/images/113739497 (verbatim): Technically Color Z LoRA@0.9 via the 魔搭 mirror hf/renderartist-Technically-Color-Z-Image-Turbo (sha256 = civitai).
  {
    provider: 'modelscope',
    ckpt: 'Tongyi-MAI/Z-Image-Turbo',
    hasLora: true,
    loras: [{ name: 'hf/renderartist-Technically-Color-Z-Image-Turbo', strength: 0.9, source: 'https://civitai.red/images/113739497' }],
    seed: 1840591390,
    steps: 12,
    cfg: 1,
    width: 1216,
    height: 832,
    omit: ['sampler', 'scheduler', 'denoise'],
  },
  // Intl accepted temp/e2e/modelscope-intl-lora-2026-11-02: Lcars LoRA@1 (CN rejects this id).
  {
    provider: 'modelscope_ai',
    ckpt: 'Tongyi-MAI/Z-Image-Turbo',
    hasLora: true,
    loras: [{ name: 'LcarsPicturesDatabase/ST-TNG-Rooms-Z-Image-Turbo-v1', strength: 1, source: 'temp/e2e/modelscope-intl-lora-2026-11-02' }],
    steps: 8,
    cfg: 1,
    width: 832,
    height: 1216,
    omit: ['sampler', 'scheduler', 'denoise'],
  },
  // providerSchema.ts flux-schnell: resolution/num_images only; seed/negative/steps/cfg/sampler/scheduler/denoise/loras unsupported.
  { provider: 'nanogpt', ckpt: 'flux-schnell', hasLora: false, hasNegative: false,
    // providerSchema flux-schnell: resolution enum + num_images; seed/steps/cfg/sampler unsupported; pixels not the wire field.
    omit: ['seed', 'steps', 'cfg', 'sampler', 'scheduler', 'denoise', 'width', 'height'],
    checkpointExtra: { resolution: '1024x1024' },
  },
  // providerSchema.ts fal-ai/flux/schnell: seed, steps 1–12, cfg 1–20, image_size; negative/sampler/scheduler/loras unsupported.
  // Recipe https://civitai.red/images/31247708 (verbatim; base FLUX.1-dev → fal-ai/flux-lora, live OpenAPI 2026-11-04: prompt/loras/seed/num_inference_steps/guidance_scale/image_size).
  { provider: 'fal', ckpt: 'fal-ai/flux-lora', hasLora: true, hasNegative: false, seed: 2100162238, steps: 41, cfg: 3.5, width: 1216, height: 832,
    loras: [{ name: 'https://huggingface.co/renderartist/coloringbookflux/resolve/main/c0l0ringb00k_Flux_v1_renderartist.safetensors', strength: 1, source: 'https://civitai.red/images/31247708' }],
    omit: ['sampler', 'scheduler', 'denoise'] },
  // OpenWorks-only: full params + LoRA (openWorksProvider.ts OPENWORKS_LIVE_EXTRAS: seed/steps/cfg/negative_prompt/loras/checkpoint).
  // Accepted run hist_1792223105137_bhlop: sampler/scheduler「该端点不支持，未发送」.
  {
    provider: 'tensorart',
    targetProvider: 'openworks',
    ckpt: 'photoreal_studio_z_image',
    hasLora: true,
    // Accepted OpenWorks LoRA run hist_1792223105137_bhlop (temp/e2e/openworks/recipe-1053306608244813366/sent-actual.txt): 3 LoRA ids, weight 1, all 实际发送.
    loras: [
      { name: '1015214543296590260', strength: 1, source: 'hist_1792223105137_bhlop' },
      { name: '1029661490430387503', strength: 1, source: 'hist_1792223105137_bhlop' },
      { name: '1015863436619315552', strength: 1, source: 'hist_1792223105137_bhlop' },
    ],
    steps: 10,
    cfg: 1,
    omit: ['sampler', 'scheduler', 'denoise'],
    width: 1024,
    height: 1024,
    // ws-sizenode: size lives only on the board's Empty Latent node (no hidden width/height copy on the loader).
    checkpointExtra: {
      batch_size: 1,
      custom_parameters: JSON.stringify({ 'result image count': 1 }),
    },
  },
  // MuAPI: catalog model from t7-muapi-acceptance; no accepted-run LoRA id → no LoRA node.
  // Live https://api.muapi.ai/openapi.json (2026-10-17) flux-1-dev-style-lora-inference body: prompt/lora_url/lora_weight/aspect_ratio/webhook_url only → no seed/steps/cfg/sampler/scheduler/denoise.
  // Official table (openapi.json 2026-10-17 16:46, temp/e2e/workflow-hub/muapi-openapi-20261017-1646.json): prompt, lora_url (REQUIRED), lora_weight, aspect_ratio. No negative prompt, no seed.
  {
    provider: 'muapi',
    ckpt: 'flux-1-dev-style-lora-inference',
    hasNegative: false,
    // Official OpenAPI Flux1DevStyleLoraInferenceRequest: prompt/lora_url/lora_weight/aspect_ratio(default 1:1)/webhook_url — no width/height pixels.
    // Recipe https://civitai.red/images/31247708: seed kept and sent as-is (official body has no seed; upstream answer shown verbatim — 雁 room 2026-11-04).
    seed: 2100162238,
    omit: ['steps', 'cfg', 'sampler', 'scheduler', 'denoise', 'width', 'height'],
    checkpointExtra: {
      aspect_ratio: '1:1',
      custom_parameters: JSON.stringify({
        _canvas: {
          scope: { provider: 'muapi', model: 'flux-1-dev-style-lora-inference' },
          // 'seed' is NOT in the official body: listed so the recipe seed that is sent stays visible (no hidden send).
          schemaProperties: ['prompt', 'lora_url', 'lora_weight', 'aspect_ratio', 'webhook_url', 'seed'],
        },
      }),
    },
    // Official OpenAPI: lora_url REQUIRED (trainer task URL), lora_weight default 1.0. No accepted-run URL → empty visible LoRA node to mount one.
    hasLora: true,
    loras: [{ name: 'https://huggingface.co/renderartist/coloringbookflux/resolve/main/c0l0ringb00k_Flux_v1_renderartist.safetensors', strength: 1, source: 'https://civitai.red/images/31247708' }],
  },
  // Schema (temp/e2e/wavespeed/recipe-33530948/wavespeed-flux-dev-lora-schema.json): steps 1–50; accepted run hist_1792224305224_meynb used 36 steps / CFG 3.5 (Schema default was 28), size, seed, loras; no negative/sampler/scheduler.
  { provider: 'wavespeed', ckpt: 'wavespeed-ai/flux-dev-lora', hasLora: true, hasNegative: false, steps: 36, cfg: 3.5, omit: ['sampler', 'scheduler', 'denoise'],
    // Accepted run hist_1792224305224_meynb (temp/e2e/wavespeed/recipe-33530948/recipe.json): HF mirror, SHA256 == Civitai 706528.
    loras: [{ name: 'https://huggingface.co/comfyanonymous/flux_RealismLora_converted_comfyui/resolve/main/flux_realism_lora.safetensors', strength: 1.1, source: 'hist_1792224305224_meynb' }] },
  // Krea model IDs are live OpenAPI operation paths (e.g. image/krea/krea-2/medium-turbo), not Sogni's krea-2-turbo selector.
  // Leave the model empty so the user chooses an exact current endpoint from Krea's live catalog; do not alias across providers.
  // Live https://api.krea.ai/openapi.json (2026-11-04) POST /generate/image/krea/krea-2/medium-turbo: required prompt+aspect_ratio+resolution(enum 1K);
  // seed optional; no width/height/negative/steps/cfg/sampler. LoRA = styles (no accepted-run style id → none).
  { provider: 'krea', ckpt: 'image/krea/krea-2/medium-turbo', hasLora: false, hasNegative: false,
    omit: ['steps', 'cfg', 'sampler', 'scheduler', 'denoise', 'width', 'height'],
    checkpointExtra: { aspect_ratio: '1:1', resolution: '1K' } },
  { provider: 'together', ckpt: 'black-forest-labs/FLUX.2-dev', hasLora: false, steps: 20, cfg: 1, omit: ['sampler', 'scheduler', 'denoise'] },
  // docs/evidence/aimlapi-lora-p0-2026-10-15.md + aimlapi.json: steps 1–8, no guidance_scale → omit cfg. No accepted-run LoRA → no LoRA node.
  // Recipe https://civitai.red/images/113739497 (verbatim incl. cfg 1 — sent as-is; upstream decides).
  { provider: 'aimlapi', ckpt: 'alibaba/z-image-turbo-lora', hasLora: true, hasNegative: false, seed: 1840591390, steps: 12, cfg: 1, width: 1216, height: 832,
    loras: [{ name: 'https://huggingface.co/renderartist/Technically-Color-Z-Image-Turbo/resolve/main/Technically_Color_Z_Image_Turbo_v1_renderartist_2000.safetensors', strength: 0.9, source: 'https://civitai.red/images/113739497' }],
    omit: ['sampler', 'scheduler', 'denoise'] },
  // docs/evidence/novita-api-2026-10-15.md:51/54: catalog model; Schema has steps/cfg; no accepted-run LoRA → no LoRA node.
  // Recipe https://civitai.red/images/28785255 (verbatim; Hires fix + klF8Anime2 VAE in the recipe are not preset fields).
  { provider: 'novita', ckpt: 'dreamshaper_8_93211.safetensors', hasLora: true, seed: 548949743, steps: 15, cfg: 6.5, sampler: 'Euler a', width: 512, height: 768,
    loras: [
      { name: 'epi_noiseoffset2_14333', strength: 0.65, source: 'https://civitai.red/images/28785255' },
      { name: 'more_details_59655', strength: 0.4, source: 'https://civitai.red/images/28785255' },
    ],
    omit: ['scheduler', 'denoise'] },
  // docs/evidence/venice-api-2026-10-15.md:51/54: catalog 200 lists venice-sd35; seed/steps/cfg_scale/size/negative sent; no custom loras.
  { provider: 'venice', ckpt: 'venice-sd35', hasLora: false, steps: 20, cfg: 7.5, omit: ['sampler', 'scheduler', 'denoise'] },
  // DeepInfra public T2I: docs.deepinfra.com/apis/image-generation + OpenAPI OpenAIImagesGenerationsIn — prompt/model/size/n/response_format only; hasLora:false (private LoRA needs dashboard deploy).
  // Official OpenAI images path: prompt/model/size/n/response_format (+quality/style); no seed/steps/cfg/sampler/LoRA on public FLUX-schnell.
  { provider: 'deepinfra', ckpt: 'black-forest-labs/FLUX-1-schnell', hasLora: false, hasNegative: false, omit: ['seed', 'steps', 'cfg', 'sampler', 'scheduler', 'denoise'] },
  // Sogni hosted-tool selector: live official generate_image.schema.json enum includes krea-2-turbo (verified 2026-11-03, 30 models). Not a Krea API path.
  // Driver maps cfg→guidance; Schema has no steps → omit steps. LoRA via loras+loraStrengths when catalog confirms.
  // Recipe https://civitai.red/images/142361732 (verbatim seed/steps 10/cfg 1/euler/768x1376; Sogni schema has no steps, sent as-is). Single recipe LoRA civitai 3129219 (weight 1) = Sogni catalog krea2-fever-dream-mood.
  { provider: 'sogni', ckpt: 'krea-2-turbo', hasLora: true, seed: 64107730, steps: 10, cfg: 1, sampler: 'euler', width: 768, height: 1376,
    loras: [{ name: 'krea2-fever-dream-mood', strength: 1, source: 'https://civitai.red/images/142361732' }],
    omit: ['scheduler', 'denoise'] },
  // Live OpenAPI GET /v1/models/black-forest-labs/flux-dev-lora + default_example: lora_weights=fofr/flux-80s-cyberpunk, lora_scale=1, guidance=3, steps=28.
  // Official docs example also cites fofr/flux-pixar-cars; default_example LoRA is the acceptance recipe id.
  // Recipe https://civitai.red/images/31247708 (verbatim seed/steps/cfg/LoRA; size 1216x832 not a field on flux-dev-lora → aspect_ratio stays).
  { provider: 'replicate', ckpt: 'black-forest-labs/flux-dev-lora', hasLora: true, hasNegative: false, seed: 2100162238, steps: 41, cfg: 3.5,
    // providerSchema + draft: aspect_ratio (+ megapixels); width/height unsupported on flux-dev-lora.
    omit: ['sampler', 'scheduler', 'denoise', 'width', 'height'],
    checkpointExtra: { aspect_ratio: '1:1' },
    loras: [{ name: 'renderartist/coloringbookflux', strength: 1, source: 'https://civitai.red/images/31247708' }] },
  // providerSchema.ts runware:100@1: steps/cfg supported; no accepted-run LoRA → no LoRA node.
  { provider: 'runware', ckpt: 'runware:100@1', hasLora: false, steps: 4, cfg: 1, omit: ['sampler', 'scheduler', 'denoise'] },
  // docs.modelslab.com/.../dreambooth-lora body example: model_id tamarin-xl-v1 + lora_model xl-realistic-cake-art-sty @ 0.45.
  // Tamarin XL V1 (civitai.com/models/235746?modelVersionId=265836) is SDXL 1.0 architecture; native resolution is 1024x1024.
  // Corrected from 512x512 to native SDXL 1024x1024 (modelslab.com/models/modelslab/tamarin-xl-v1).
  { provider: 'modelslab', ckpt: 'tamarin-xl-v1', hasLora: true, hasNegative: true, steps: 20, cfg: 7.5, width: 1024, height: 1024, scheduler: 'UniPCMultistepScheduler', omit: ['sampler', 'denoise'],
    loras: [{ name: 'xl-realistic-cake-art-sty', strength: 0.45, source: 'https://docs.modelslab.com/image-generation/community-models/dreambooth-lora' }] },
  // providerSchema.ts agnesUnsupported (wiki.agnes-ai.com agnes-image-25-flash): only prompt + size + ratio. Same full
  // topology as Mage (image output → SaveImage); compact CLIP CONDITIONING→SaveImage was a wrong-type edge.
  { provider: 'agnes', ckpt: 'agnes-image-2.5-flash', hasLora: false, hasNegative: false,
    omit: ['seed', 'steps', 'cfg', 'sampler', 'scheduler', 'denoise', 'width', 'height'],
    checkpointExtra: { size: '2K', aspect_ratio: '1:1' } },
  // docs.mage.space/api/models/mango OpenAPI (fetched 2026-11-03): prompt + seed + model_id + aspect_ratio + resolution (+ refs); no LoRA/steps/cfg/sampler; no width/height pixels.
  // Board keeps sampler+VAE topology (雁: no compact) but omits EmptyLatent pixel size — size lives on checkpoint aspect_ratio/resolution.
  { provider: 'mage', ckpt: 'mango-v3', hasLora: false, hasNegative: false, omit: ['steps', 'cfg', 'sampler', 'scheduler', 'denoise', 'width', 'height'], checkpointExtra: { aspect_ratio: '4:5', resolution: '2K' } },
  // providerSchema.ts sensenova-u1.5-lite: width/height/size only.
  { provider: 'sensenova', ckpt: 'sensenova-u1.5-lite', hasLora: false, hasNegative: false, omit: ['seed', 'steps', 'cfg', 'sampler', 'scheduler', 'denoise'] },
  // providerSchema.ts comfy:krea2: sampler/scheduler/seed supported, steps/cfg unverified; loras + negative unsupported (docs/evidence/civitai-krea-no-lora-2026-10-14.md).
  {
    provider: 'civitai',
    ckpt: 'turbo',
    hasLora: false,
    hasNegative: false,
    steps: 8,
    cfg: 1,
    // providerSchema comfy:krea2: width/height unsupported (official Krea recipe); omit pixels so EmptyLatent has no 假 1024 壳.
    omit: ['denoise', 'width', 'height'],
    checkpointExtra: { civitai_engine: 'comfy', civitai_ecosystem: 'krea2', civitai_model: 'turbo' },
  },
];

/** Card summary derived ONLY from preset nodes (same data the board loads). */
export type PresetSummary = {
  model: string;
  steps?: number;
  cfg?: number;
  sampler?: string;
  width?: number;
  height?: number;
  loras: Array<{ name: string; strength: number }>;
};
export function presetSummary(preset: WorkflowPreset): PresetSummary {
  const byType = (t: string) => preset.nodes.find(n => n.type === t);
  const model = String(
    byType('CheckpointLoaderSimple')?.values.ckpt_name ??
      byType('GoogleImagenNode')?.values.model ??
      byType('AIVideoNode')?.values.model ??
      '',
  );
  const ks = byType('KSampler')?.values;
  const lat = byType('EmptyLatentImage')?.values;
  const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
  return {
    model,
    steps: num(ks?.steps),
    cfg: num(ks?.cfg),
    sampler: typeof ks?.sampler_name === 'string' ? ks.sampler_name : undefined,
    width: num(lat?.width),
    height: num(lat?.height),
    loras: preset.nodes
      .filter(n => n.type === 'LoRALoader')
      .map(n => ({ name: String(n.values.lora_name ?? ''), strength: Number(n.values.strength_model) })),
  };
}

export const WORKFLOW_PRESETS: WorkflowPreset[] = [
  ...STD_SPECS.map(buildStandardT2i),
  buildGeminiT2i(),
  ...T2V_SPECS.map(buildStandardT2v),
  ...I2V_SPECS.map(buildStandardI2v),
];

// Ensure huggingface is index 0 for App default canvas
WORKFLOW_PRESETS.sort((a, b) => {
  if (a.id === 'std-huggingface-t2i') return -1;
  if (b.id === 'std-huggingface-t2i') return 1;
  return a.id.localeCompare(b.id);
});
