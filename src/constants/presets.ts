import { WorkflowPreset, NodeInstance, Connection, SpatialFrame } from '../types/graph';
import { NODE_DEFINITIONS } from './nodes';
import { PROVIDER_TITLE_LABEL } from '../utils/providerLabels';

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
  omit?: Array<'seed' | 'steps' | 'cfg' | 'sampler' | 'scheduler' | 'denoise'>;
  /** Where the model / Schema facts come from (shown nowhere; audit trail for reviewers). */
  source?: string;
  /** Extra KSampler defaults from the endpoint Schema (e.g. seed). */
  seed?: number;
  /** Skip EmptyLatent+KSampler+VAE; Checkpoint→CLIP→Save (agnes). */
  compact?: boolean;
  /** Official Schema requires a resource no accepted-run recipe has (e.g. MuAPI lora_url). Card is 待配方, run disabled; never filled with a made-up value. */
  pendingRecipe?: string;
};

function presetId(provider: string): string {
  return provider === 'modelscope_ai' ? 'std-modelscope-ai-t2i' : `std-${provider}-t2i`;
}

function friendly(provider: string): string {
  return PROVIDER_TITLE_LABEL[provider] || provider;
}

function buildStandardT2i(spec: StdSpec): WorkflowPreset {
  const provider = spec.provider;
  const target = spec.targetProvider || provider;
  const id = presetId(provider);
  const prefix = id.replace(/[^a-z0-9]+/gi, '-');
  // Empty LoRA path/id = empty shell (forbidden). Only real accepted-run LoRAs become nodes.
  const loraList = (spec.loras ?? []).filter(l => Boolean(l.name));
  const hasLora = loraList.length > 0;
  const steps = spec.steps ?? 20;
  const cfg = spec.cfg ?? 7;
  const sampler = spec.sampler ?? 'euler';
  const scheduler = spec.scheduler ?? 'simple';
  const width = spec.width ?? 1024;
  const height = spec.height ?? 1024;
  const hasNegative = spec.hasNegative !== false;
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
      ...(spec.checkpointExtra || {}),
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
    pos: { x: hasLora ? 760 : 400, y: 80 },
    width: 400,
    inputs: NODE_DEFINITIONS.CLIPTextEncode.inputs,
    outputs: NODE_DEFINITIONS.CLIPTextEncode.outputs,
    values: { text: STD_PROMPT_PLACEHOLDER },
  });
  connections.push({
    id: `${prefix}-c-clip-pos`,
    fromNodeId: clipSrc,
    fromSocketId: 'CLIP',
    toNodeId: posId,
    toSocketId: 'clip',
    type: 'CLIP',
  });

  if (spec.compact) {
    nodes.push({
      id: saveId,
      type: 'SaveImage',
      title: '保存图像',
      pos: { x: hasLora ? 1220 : 860, y: 120 },
      width: 300,
      inputs: NODE_DEFINITIONS.SaveImage.inputs,
      outputs: [],
      values: { filename_prefix: prefixName },
    });
    // Agnes-style: CLIP conditioning → SaveImage (driver reads prompt from CLIP node)
    connections.push({
      id: `${prefix}-c-pos-save`,
      fromNodeId: posId,
      fromSocketId: 'CONDITIONING',
      toNodeId: saveId,
      toSocketId: 'images',
      type: 'CONDITIONING',
    });
  } else {
    if (hasNegative) nodes.push({
        id: negId,
        type: 'CLIPTextEncodeNegative',
        title: '负向提示词',
        pos: { x: hasLora ? 760 : 400, y: 620 },
        width: 400,
        inputs: NODE_DEFINITIONS.CLIPTextEncodeNegative.inputs,
        outputs: NODE_DEFINITIONS.CLIPTextEncodeNegative.outputs,
        values: { text: '' },
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
        values: { width, height, batch_size: 1 },
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
      prompt: STD_PROMPT_PLACEHOLDER,
      negativePrompt: '',
      params: {
        checkpoint: spec.ckpt,
        targetProvider: target as SpatialFrame['params']['targetProvider'],
        ...(spec.pendingRecipe ? { executionBlockedReason: spec.pendingRecipe } : {}),
        seed: spec.compact ? undefined : keep('seed', seed),
        seedControl: 'fixed',
        steps: spec.compact ? undefined : keep('steps', steps),
        cfg: spec.compact ? undefined : keep('cfg', cfg),
        sampler: spec.compact ? undefined : keep('sampler', sampler),
        scheduler: spec.compact ? undefined : keep('scheduler', scheduler),
        denoise: spec.compact ? undefined : keep('denoise', 1),
        width,
        height,
        batchSize: 1,
        loras: loraList.map(l => ({ name: l.name, modelStrength: l.strength, clipStrength: l.strength, triggerWords: '' })),
        ...(spec.checkpointExtra?.civitai_engine
          ? {
              civitaiEngine: spec.checkpointExtra.civitai_engine as string,
              civitaiEcosystem: spec.checkpointExtra.civitai_ecosystem as string,
              civitaiModel: spec.checkpointExtra.civitai_model as string,
            }
          : {}),
        ...(spec.checkpointExtra?.size ? { size: spec.checkpointExtra.size as string, aspectRatio: (spec.checkpointExtra.aspect_ratio as string) || '1:1' } : {}),
        ...(typeof spec.checkpointExtra?.custom_parameters === 'string'
          ? { customParameters: spec.checkpointExtra.custom_parameters as string }
          : {}),
      },
      status: 'idle',
      imageUrl: '',
      createdAt: Date.now(),
    },
  ];

  return {
    id,
    name: `${cardLabel} · 标准文生图`,
    category: '标准文生图',
    provider,
    previewImage: '',
    tags: [provider, '标准', '文生图'],
    description: '该供应商标准文生图骨架；提示词请填入配方或用户指定。',
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
    description: '该供应商标准文生图骨架；提示词请填入配方或用户指定。',
    loraNames: [],
    nodes: [
      {
        id: 'std-gemini-pos',
        type: 'CLIPTextEncode',
        title: '正向提示词',
        pos: { x: 80, y: 120 },
        width: 400,
        inputs: NODE_DEFINITIONS.CLIPTextEncode.inputs,
        outputs: NODE_DEFINITIONS.CLIPTextEncode.outputs,
        values: { text: STD_PROMPT_PLACEHOLDER },
      },
      {
        id: 'std-gemini-imagen',
        type: 'GoogleImagenNode',
        title: 'Gemini generateContent',
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
        prompt: STD_PROMPT_PLACEHOLDER,
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

/** I2V providers locked by Researchy field-check (2026-10-17). */
const I2V_SPECS: Array<{ provider: string; model: string }> = [
  // fal: nodes.ts / field-check
  { provider: 'fal', model: 'fal-ai/wan/v2.7/image-to-video' },
  // wavespeed: field-check docs URL wan-2.2-image-to-video → model_id slash form (audit POST /api/v3/{model_id})
  { provider: 'wavespeed', model: 'wavespeed-ai/wan-2.2/image-to-video' },
  // civitai: Orchestration videoGen engine id (audit wan.md / civitaiVideo.ts OFFICIAL engines)
  { provider: 'civitai', model: 'wan' },
  // novita: audit img2video exampleModel SVD-XT
  { provider: 'novita', model: 'SVD-XT' },
  // muapi: field-check wan2.7-image-to-video (endpoint id without /api/v1/)
  { provider: 'muapi', model: 'wan2.7-image-to-video' },
  // replicate: audit/official HTTP example minimax/video-01
  { provider: 'replicate', model: 'minimax/video-01' },
];

function buildStandardI2v(spec: { provider: string; model: string }): WorkflowPreset {
  const provider = spec.provider;
  const id = `std-${provider}-i2v`;
  const prefix = id;
  const loadId = `${prefix}-load`;
  const vidId = `${prefix}-vid`;
  const saveId = `${prefix}-save`;
  // Single prompt source: AIVideoNode.values.prompt (「视频描述」).
  // graphEngine reads CLIP→positive first when wired; a separate CLIP node would shadow this field.
  // Runtime submit uses params.prompt from that one field (SchemaProviderDriver / WaveSpeed).
  return {
    id,
    name: `${friendly(provider)} · 标准图生视频`,
    category: '标准图生视频',
    provider,
    previewImage: '',
    tags: [provider, '标准', '图生视频'],
    description: '该供应商标准图生视频骨架；提示词请填入配方或用户指定。',
    loraNames: [],
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
        values: {
          targetProvider: provider,
          model: spec.model,
          prompt: '',
          negative_prompt: '',
          duration: '',
          fps: '',
          aspect_ratio: '',
        },
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
        prompt: STD_PROMPT_PLACEHOLDER,
        negativePrompt: '',
        params: {
          checkpoint: spec.model,
          targetProvider: provider as SpatialFrame['params']['targetProvider'],
          seedControl: 'fixed',
          width: 1024,
          height: 1024,
          batchSize: 1,
          loras: [],
          videoProvider: provider,
        },
        status: 'idle',
        imageUrl: '',
        createdAt: Date.now(),
      },
    ],
  };
}

/**
 * 21 standard text-to-image + 6 standard image-to-video.
 * SenseNova/Sogni stay on the roster (雁: every listed provider keeps a standard card).
 * Sogni: protocol selector krea-2-turbo (LoRA via loras+loraStrengths; no steps/cfg in schema).
 * SenseNova: sensenova-u1.5-lite (official Token Plan; no LoRA in image Schema).
 * OpenWorks T2I: full params + LoRA (雁 2026-10-17 15:27 override of the old four-field rule).
 * WaveSpeed T2I: wavespeed-ai/flux-dev-lora (accepted board hist_1792224305224_meynb); Schema has no negative.
 * I2V: fal/wavespeed/civitai/novita/muapi/replicate.
 */
const STD_SPECS: StdSpec[] = [
  // Preset model = Tongyi-MAI/Z-Image-Turbo Space (providerSchema.ts:495-505): steps supported, cfg unsupported; server.ts:4211/4216 rejects cfg/guidance for this route → cfg omitted (would 400). HF Inference rows (num_inference_steps+guidance_scale) apply to other HF models.
  { provider: 'huggingface', ckpt: 'Tongyi-MAI/Z-Image-Turbo', hasLora: false, hasNegative: false, steps: 8, omit: ['cfg', 'sampler', 'scheduler', 'denoise'] },
  // providerSchema.ts modelscope-hosted-image: loras supported in Schema but no accepted-run LoRA id → no LoRA node.
  { provider: 'modelscope', ckpt: 'Tongyi-MAI/Z-Image-Turbo', hasLora: false, steps: 8, cfg: 1 },
  { provider: 'modelscope_ai', ckpt: 'Tongyi-MAI/Z-Image-Turbo', hasLora: false, steps: 8, cfg: 1 },
  // providerSchema.ts flux-schnell: resolution/num_images only; seed/negative/steps/cfg/sampler/scheduler/denoise/loras unsupported.
  { provider: 'nanogpt', ckpt: 'flux-schnell', hasLora: false, hasNegative: false, omit: ['seed', 'steps', 'cfg', 'sampler', 'scheduler', 'denoise'] },
  // providerSchema.ts fal-ai/flux/schnell: seed, steps 1–12, cfg 1–20, image_size; negative/sampler/scheduler/loras unsupported.
  { provider: 'fal', ckpt: 'fal-ai/flux/schnell', hasLora: false, hasNegative: false, steps: 4, cfg: 1, omit: ['sampler', 'scheduler', 'denoise'] },
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
    hasLora: false,
    hasNegative: false,
    omit: ['seed', 'steps', 'cfg', 'sampler', 'scheduler', 'denoise'],
    // Official OpenAPI: lora_url REQUIRED (trainer task URL). No accepted-run recipe → pendingRecipe (plain UI copy, no API field names).
    pendingRecipe: '官方要真 LoRA 地址（训练任务返回的那种），配方里还没有；载入后挂上再运行。',
  },
  // Schema (temp/e2e/wavespeed/recipe-33530948/wavespeed-flux-dev-lora-schema.json): steps 1–50; accepted run hist_1792224305224_meynb used 36 steps / CFG 3.5 (Schema default was 28), size, seed, loras; no negative/sampler/scheduler.
  { provider: 'wavespeed', ckpt: 'wavespeed-ai/flux-dev-lora', hasLora: true, hasNegative: false, steps: 36, cfg: 3.5, omit: ['sampler', 'scheduler', 'denoise'],
    // Accepted run hist_1792224305224_meynb (temp/e2e/wavespeed/recipe-33530948/recipe.json): HF mirror, SHA256 == Civitai 706528.
    loras: [{ name: 'https://huggingface.co/comfyanonymous/flux_RealismLora_converted_comfyui/resolve/main/flux_realism_lora.safetensors', strength: 1.1, source: 'hist_1792224305224_meynb' }] },
  // Preset model krea-2-turbo → Krea 2 API body has no steps/guidance_scale (https://www.krea.ai/docs/developers/krea-2/overview.md; krea.json krea/krea-2/*). steps 25 / guidance_scale 3 belong to bfl/flux-1-dev only → omitted here. No accepted-run LoRA → no LoRA node.
  { provider: 'krea', ckpt: 'krea-2-turbo', hasLora: false, omit: ['steps', 'cfg', 'sampler', 'scheduler', 'denoise'] },
  { provider: 'together', ckpt: 'black-forest-labs/FLUX.2-dev', hasLora: false, steps: 20, cfg: 1, omit: ['sampler', 'scheduler', 'denoise'] },
  // docs/evidence/aimlapi-lora-p0-2026-10-15.md + aimlapi.json: steps 1–8, no guidance_scale → omit cfg. No accepted-run LoRA → no LoRA node.
  { provider: 'aimlapi', ckpt: 'alibaba/z-image-turbo-lora', hasLora: false, hasNegative: false, steps: 8, omit: ['cfg', 'sampler', 'scheduler', 'denoise'] },
  // docs/evidence/novita-api-2026-10-15.md:51/54: catalog model; Schema has steps/cfg; no accepted-run LoRA → no LoRA node.
  { provider: 'novita', ckpt: 'dreamshaper_8_93211.safetensors', hasLora: false, steps: 20, cfg: 7, omit: ['scheduler', 'denoise'] },
  // docs/evidence/venice-api-2026-10-15.md:51/54: catalog 200 lists venice-sd35; seed/steps/cfg_scale/size/negative sent; no custom loras.
  { provider: 'venice', ckpt: 'venice-sd35', hasLora: false, steps: 20, cfg: 7.5, omit: ['sampler', 'scheduler', 'denoise'] },
  // Sogni: catalog krea2_turbo_fp8_scaled (temp/e2e/sogni/model-catalog.json) guidance min=max=default=1, steps default 8.
  // Driver (schemaProviders.ts:971 cfg→guidance) sends guidance; generate_image tool Schema has no steps → steps sent:false (schemaContract.test.ts:351-361) → steps omitted to avoid an empty shell.
  { provider: 'sogni', ckpt: 'krea-2-turbo', hasLora: false, cfg: 1, omit: ['steps', 'sampler', 'scheduler', 'denoise'] },
  // providerSchema.ts flux-schnell: seed, steps 1–4, aspect_ratio; cfg/negative/size/sampler/scheduler/denoise/loras unsupported.
  { provider: 'replicate', ckpt: 'black-forest-labs/flux-schnell', hasLora: false, hasNegative: false, steps: 4, omit: ['cfg', 'sampler', 'scheduler', 'denoise'] },
  // providerSchema.ts runware:100@1: steps/cfg supported; no accepted-run LoRA → no LoRA node.
  { provider: 'runware', ckpt: 'runware:100@1', hasLora: false, steps: 4, cfg: 1, omit: ['sampler', 'scheduler', 'denoise'] },
  // providerSchema.ts flux + t7-modelslab-acceptance.md: steps/cfg supported; no accepted-run LoRA → no LoRA node.
  { provider: 'modelslab', ckpt: 'flux', hasLora: false, hasNegative: false, steps: 20, cfg: 7, omit: ['sampler', 'denoise'] },
  { provider: 'agnes', ckpt: 'agnes-image-2.5-flash', hasLora: false, compact: true, checkpointExtra: { size: '2K', aspect_ratio: '1:1' } },
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
    omit: ['denoise'],
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
  ...I2V_SPECS.map(buildStandardI2v),
];

// Ensure huggingface is index 0 for App default canvas
WORKFLOW_PRESETS.sort((a, b) => {
  if (a.id === 'std-huggingface-t2i') return -1;
  if (b.id === 'std-huggingface-t2i') return 1;
  return a.id.localeCompare(b.id);
});
