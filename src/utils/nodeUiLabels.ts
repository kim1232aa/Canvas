/**
 * Human-friendly Chinese display labels for ComfyUI nodes, widgets, sockets, and schema fields.
 * Follows the project progressive disclosure principle:
 * plain, accessible Chinese summary for human users, while keeping internal IDs / English codes
 * visible in subtext, tooltips, or expandable details.
 *
 * NOTE: As per team agreement, this file maps labels at render time without modifying src/constants/nodes.ts.
 */

/** Node title friendly display mappings */
export const NODE_TITLE_MAP: Record<string, string> = {
  KSampler: 'KSampler 采样器',
  EmptyLatentImage: '画布尺寸设定 (Latent)',
  CLIPTextEncode: '正向提示词 (CLIP)',
  CLIPTextEncodeNegative: '负向提示词 (Negative)',
  VAEDecode: '图像解码器 (VAE Decode)',
  SaveImage: '保存与预览图像 (Save Image)',
  LoRALoader: 'LoRA 风格微调 (LoRA)',
  LoraLoader: 'LoRA 风格微调 (LoRA)',
  LoraLoaderModelOnly: 'LoRA 风格微调 (仅模型)',
  SaveVideo: '保存与预览视频 (Save Video)',
  LoadImage: '参考底图加载 (Load Image)',
  CivitaiLoRABrowserNode: 'Civitai LoRA 浏览器',
  LLMReasoningNode: 'AI 深度思考扩写 (LLM Reasoning)',
  FalAIEngineNode: 'Fal.ai GPU 加速引擎',
  ReplicateEngineNode: 'Replicate 官方推理引擎',
  ModelScopeNode: '魔搭国内加速引擎',
  ModelScopeAiNode: '魔搭国际加速引擎',
  NanoGPTNode: 'NanoGPT 极速引擎',
  GoogleImagenNode: 'Gemini 图像生成',
};

/** Widget friendly display mappings */
export const WIDGET_LABEL_MAP: Record<string, string> = {
  width: '图像宽度',
  height: '图像高度',
  batch_size: '生成张数',
  seed: '随机种子',
  control_after_generate: '运行后控制',
  steps: '步数',
  cfg: '提示词相关性 (CFG)',
  sampler_name: '采样器',
  scheduler: '调度器',
  denoise: '去噪强度',
  filename_prefix: '文件名前缀',
  trigger_words: '触发词',
  lora_name: 'LoRA 名称',
  strength_model: 'LoRA 强度',
  strength_clip: '文本权重',
  aspect_ratio: '画幅比例',
  resolution: '分辨率',
  size: '画幅尺寸',
  output_format: '输出格式',
};

/** Socket port friendly display mappings */
export const SOCKET_LABEL_MAP: Record<string, string> = {
  MODEL: '模型 (MODEL)',
  CLIP: '文本编码 (CLIP)',
  VAE: '解码 (VAE)',
  CONDITIONING: '提示词条件 (CONDITIONING)',
  LATENT: '画幅潜空间 (LATENT)',
  IMAGE: '图像 (IMAGE)',
  VIDEO: '动态视频 (VIDEO)',
  positive: '正向条件',
  negative: '负向条件',
  latent_image: '潜空间输入',
  samples: '潜空间输出',
  images: '图像输出',
  model: '模型',
  clip: '文本编码',
  vae: '解码器',
};

/** Common Schema choice field friendly translations */
export const SCHEMA_FIELD_LABEL_MAP: Record<string, { label: string; desc?: string }> = {
  image_size: { label: '图像画幅', desc: '预设宽高比例与像素尺寸' },
  aspect_ratio: { label: '画面比例', desc: '生成图像或视频的宽高比' },
  output_format: { label: '输出格式', desc: '生成产物的媒体格式 (png / jpeg / webp / mp4)' },
  output_quality: { label: '图像质量', desc: '压缩质量等级 (通常为 1-100)' },
  guidance_scale: { label: '引导系数', desc: '提示词贴合度 (CFG Scale)' },
  num_inference_steps: { label: '推理步数', desc: '去噪迭代步数' },
  lora_scale: { label: 'LoRA 权重', desc: '风格微调模型的融合系数' },
  lora_strength: { label: 'LoRA 强度', desc: '风格微调模型的强度系数' },
  negative_prompt: { label: '负向提示词', desc: '希望从图像中过滤的不良特征' },
  safety_tolerance: { label: '安全过滤等级', desc: '内容安全审查等级' },
  watermark: { label: '官方水印', desc: '是否在产物上保留提供商水印' },
  prompt_extend: { label: '提示词智能扩写', desc: '使用模型对提示词进行细节丰富' },
  seed: { label: '随机种子', desc: '保持画面一致性的随机数' },
  quality: { label: '画质模式', desc: '标准或高清模式' },
  raw: { label: '原始模式', desc: '生成写实未润色原图风格' },
  enable_safety_checker: { label: '安全审查器', desc: '开启或关闭内容合规审查' },
};

export function formatNodeDisplayTitle(type: string, currentTitle?: string): string {
  if (NODE_TITLE_MAP[type]) {
    return NODE_TITLE_MAP[type];
  }
  return currentTitle || type;
}

export function formatWidgetLabel(name: string, fallbackLabel?: string): string {
  if (WIDGET_LABEL_MAP[name]) {
    return WIDGET_LABEL_MAP[name];
  }
  return fallbackLabel || name;
}

export function formatSocketDisplayName(name: string, type?: string): string {
  if (SOCKET_LABEL_MAP[name]) {
    return SOCKET_LABEL_MAP[name];
  }
  if (type && SOCKET_LABEL_MAP[type]) {
    return SOCKET_LABEL_MAP[type];
  }
  return name;
}

export function formatSchemaFieldLabel(key: string): { label: string; desc?: string } {
  return SCHEMA_FIELD_LABEL_MAP[key] || { label: key };
}
