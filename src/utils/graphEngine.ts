import { Connection, DataType, NodeInstance, Socket } from '../types/graph';
import { ApiKeysState } from '../types/providers';
import { resolveLoraPathOrUrl } from './engineParameterNormalizer';
import { getStoredApiKeys, saveToHistory } from '../services/api';
import { EngineRegistry } from '../engines/EngineRegistry';
import { NormalizedGenerateParams } from '../engines/types';

export interface WorkflowExtraction {
  checkpointModel: string;
  positivePrompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  batchSize: number;
  seed: number;
  steps: number;
  cfg: number;
  sampler: string;
  scheduler: string;
  denoise: number;
  loras: Array<{
    name: string;
    modelStrength: number;
    clipStrength: number;
    triggerWords: string;
    civitaiId?: string;
  }>;
  targetProvider: 'civitai' | 'fal' | 'agnes' | 'sensenova' | 'huggingface' | 'modelscope' | 'modelscope_ai' | 'nanogpt' | 'gemini' | 'video' | 'tensorart';
  isVideo?: boolean;
  videoDuration?: number;
  videoFps?: number;
  videoAspectRatio?: string;
  initImageUrl?: string;
  saveImageNodeId?: string;
  saveVideoNodeId?: string;
  ksamplerNodeId?: string;
}

/**
 * Validates whether two socket types can be connected.
 */
export function areSocketsCompatible(fromType: DataType, toType: DataType): boolean {
  if (fromType === 'ANY' || toType === 'ANY') return true;
  if (fromType === 'IMAGE' && toType === 'VIDEO') return true;
  if (fromType === 'VIDEO' && toType === 'IMAGE') return true;
  // 智能拓扑兼容：允许图像直连潜空间（自动插入虚拟 VAE 编码器），或文本大模型输出直连 Conditioning
  if (fromType === 'IMAGE' && toType === 'LATENT') return true;
  if (fromType === 'STRING' && toType === 'CONDITIONING') return true;
  return fromType === toType;
}

/**
 * Traces backwards and collects node values according to graph connections
 */
export function extractWorkflowParameters(
  nodes: NodeInstance[],
  connections: Connection[]
): WorkflowExtraction {
  // Find key specialized nodes
  const saveNode = nodes.find((n) => n.type === 'SaveImage' && !n.bypassed);
  const saveVideoNode = nodes.find((n) => n.type === 'SaveVideo' && !n.bypassed);
  const ksamplerNode = nodes.find((n) => n.type === 'KSampler' && !n.bypassed);
  const vaeEncodeNode = nodes.find((n) => n.type === 'VAEEncode' && !n.bypassed);
  const googleImagenNode = nodes.find((n) => n.type === 'GoogleImagenNode' && !n.bypassed);
  const modelScopeNode = nodes.find((n) => n.type === 'ModelScopeNode' && !n.bypassed);
  const modelScopeAiNode = nodes.find((n) => n.type === 'ModelScopeAiNode' && !n.bypassed);
  const nanoGptNode = nodes.find((n) => n.type === 'NanoGPTNode' && !n.bypassed);
  const falEngineNode = nodes.find((n) => n.type === 'FalAIEngineNode' && !n.bypassed);
  const videoNode = nodes.find((n) => n.type === 'AIVideoNode' && !n.bypassed);
  const loadImageNode = nodes.find((n) => n.type === 'LoadImage' && !n.bypassed);
  const promptRefinerNode = nodes.find((n) => n.type === 'PromptRefinerLLM' && !n.bypassed);
  const llmReasoningNode = nodes.find((n) => n.type === 'LLMReasoningNode' && !n.bypassed);

  // 1. Checkpoint Loader inspection & dynamic model detection
  const ckptNodes = nodes.filter((n) => n.type === 'CheckpointLoaderSimple' && !n.bypassed);
  let checkpointModel = ckptNodes[0]?.values?.ckpt_name ||
    googleImagenNode?.values?.model ||
    modelScopeAiNode?.values?.model_endpoint ||
    modelScopeNode?.values?.model_endpoint ||
    nanoGptNode?.values?.model ||
    falEngineNode?.values?.model ||
    videoNode?.values?.model ||
    '';
  let positivePrompt = '';
  let negativePrompt = '';
  let width = 1024;
  let height = 1024;
  let batchSize = 1;
  let seed = Math.floor(Math.random() * 1000000000);
  let steps = 25;
  let cfg = 5.0;
  let sampler = 'euler';
  let scheduler = 'normal';
  let denoise = 1.0;
  const loras: WorkflowExtraction['loras'] = [];
  let isVideo = Boolean(videoNode || saveVideoNode);
  let videoDuration = isVideo ? Number(videoNode?.values.duration || 5) : undefined;
  let videoFps = isVideo ? Number(videoNode?.values.fps || 16) : undefined;
  let videoAspectRatio = isVideo ? (videoNode?.values.aspect_ratio || '16:9') : undefined;

  // 严格拓扑反向追踪：图生图 (img2img) 与图生视频 (img2video) 参考源图链路
  let initImageUrl: string | undefined = undefined;

  // 1. 图生图严格溯源：优先检查连入 KSampler 的链路
  if (ksamplerNode) {
    // 检查是否有线缆连入 KSampler 的 latent_image 端口
    const latentConn = connections.find(
      (c) => c.toNodeId === ksamplerNode.id && (c.toSocketId === 'latent_image' || c.toSocketId === 'image')
    );

    if (latentConn) {
      const directSourceNode = nodes.find((n) => n.id === latentConn.fromNodeId && !n.bypassed);
      
      // 情况 A: 经典 ComfyUI 拓扑 (LoadImage -> VAEEncode -> KSampler)
      if (directSourceNode?.type === 'VAEEncode') {
        const pixelConn = connections.find(
          (c) => c.toNodeId === directSourceNode.id && (c.toSocketId === 'pixels' || c.toSocketId === 'image')
        );
        if (pixelConn) {
          const imgNode = nodes.find((n) => n.id === pixelConn.fromNodeId && !n.bypassed);
          if (imgNode?.type === 'LoadImage' && imgNode.values.image_url) {
            initImageUrl = imgNode.values.image_url;
          }
        }
      }
      // 情况 B: 便捷直连拓扑 (LoadImage -> KSampler)
      else if (directSourceNode?.type === 'LoadImage' && directSourceNode.values.image_url) {
        initImageUrl = directSourceNode.values.image_url;
      }
    }
  }

  // 2. 图生视频严格溯源：检查连入 AIVideoNode 的 init_image 端口
  if (videoNode && !initImageUrl) {
    const videoImgConn = connections.find(
      (c) => c.toNodeId === videoNode.id && (c.toSocketId === 'init_image' || c.toSocketId === 'image')
    );
    if (videoImgConn) {
      const srcNode = nodes.find((n) => n.id === videoImgConn.fromNodeId && !n.bypassed);
      if (srcNode?.type === 'LoadImage' && srcNode.values.image_url) {
        initImageUrl = srcNode.values.image_url;
      } else if (srcNode?.type === 'SaveImage' && srcNode.outputData) {
        initImageUrl = typeof srcNode.outputData === 'string' ? srcNode.outputData : srcNode.outputData.imageUrl;
      }
    }
  }

  // 3. 画布上存在活跃的 LoadImage 节点兜底
  if (!initImageUrl && loadImageNode?.values.image_url) {
    initImageUrl = loadImageNode.values.image_url;
  }

  // 2. Determine target provider with strict faithfulness (NO silent fallback to Fal!)
  let targetProvider: WorkflowExtraction['targetProvider'] = 'civitai';

  if (videoNode || (checkpointModel && (checkpointModel.includes('wan2.1-t2v') || checkpointModel.includes('ltx-video')))) {
    targetProvider = 'video';
    isVideo = true;
    checkpointModel = videoNode?.values.model || checkpointModel || '';
  } else if (ckptNodes[0]?.values?.targetProvider) {
    // Explicit provider chosen by user on CheckpointLoaderSimple node
    targetProvider = ckptNodes[0].values.targetProvider;
  } else if (googleImagenNode) {
    targetProvider = 'gemini';
    checkpointModel = googleImagenNode.values.model || checkpointModel || '';
    const aspect = googleImagenNode.values.aspect_ratio || '1:1';
    if (aspect === '16:9') { width = 1280; height = 720; }
    else if (aspect === '9:16') { width = 720; height = 1280; }
    else if (aspect === '4:3') { width = 1024; height = 768; }
    else if (aspect === '3:4') { width = 768; height = 1024; }
    else { width = 1024; height = 1024; }
  } else if (
    checkpointModel.includes('gemini') ||
    checkpointModel.includes('imagen') ||
    checkpointModel.includes('google')
  ) {
    targetProvider = 'gemini';
  } else if (modelScopeAiNode) {
    targetProvider = 'modelscope_ai';
    checkpointModel = modelScopeAiNode.values.model_endpoint || checkpointModel || '';
  } else if (modelScopeNode) {
    targetProvider = 'modelscope';
    checkpointModel = modelScopeNode?.values.model_endpoint || checkpointModel || '';
  } else if (nanoGptNode || checkpointModel.includes('nanogpt')) {
    targetProvider = 'nanogpt';
    checkpointModel = nanoGptNode?.values.model || checkpointModel || '';
  } else if (falEngineNode) {
    targetProvider = 'fal';
    checkpointModel = falEngineNode.values.model || checkpointModel || '';
    steps = Number(falEngineNode.values.steps) || steps;
    cfg = Number(falEngineNode.values.guidance_scale) || cfg;
    const resParts = (falEngineNode.values.resolution || '1024x1024').split('x');
    if (resParts.length === 2) {
      width = Number(resParts[0]) || width;
      height = Number(resParts[1]) || height;
    }
  } else {
    // Faithful provider deduction from architecture and endpoint format
    const isTaTool = [
      'strong_text2image', 'photoreal_studio', 'anime_lab', 'oc_character',
      'text2video_wan', 'text2video_ltx', 'image2video_wan', 'image2video_ltx',
      'smart_edit', 'image_upscaler', 'background_remover', 'extend_image_sd15',
      'live_wallpaper', 'old_photo_restore', 'three_view_flux_kontext', 'watermark_remove',
      'oc_garment'
    ].some((prefix) => checkpointModel.includes(prefix));

    if (checkpointModel.includes('tensor') || /^\d{10,25}$/.test(checkpointModel) || isTaTool) {
      targetProvider = 'tensorart';
    } else if (checkpointModel.startsWith('damo/') || checkpointModel.startsWith('AI-ModelScope/') || checkpointModel.includes('modelscope')) {
      targetProvider = 'modelscope';
    } else if (checkpointModel.startsWith('fal-ai/')) {
      targetProvider = 'fal';
    } else if (checkpointModel.startsWith('urn:air:') || checkpointModel.includes('civitai')) {
      targetProvider = 'civitai';
    } else if (checkpointModel.includes('agnes')) {
      targetProvider = 'agnes';
    } else if (checkpointModel.includes('sensenova') || checkpointModel.includes('deepseek') || checkpointModel.includes('glm')) {
      targetProvider = 'sensenova';
    } else if (checkpointModel.includes('nanogpt')) {
      targetProvider = 'nanogpt';
    } else if (checkpointModel.includes('imagen') || checkpointModel.includes('gemini')) {
      targetProvider = 'gemini';
    } else if (checkpointModel.includes('/')) {
      // Any custom repository path (e.g. Lykon/dreamshaper-7, black-forest-labs/FLUX.1-dev, Kwai-Kolors/Kolors) routes to Hugging Face
      targetProvider = 'huggingface';
    } else {
      targetProvider = 'civitai';
    }
  }

  // 3. LoRA Loaders
  const loraNodes = nodes.filter((n) => n.type === 'LoRALoader' && !n.bypassed);
  for (const ln of loraNodes) {
    loras.push({
      name: ln.values.lora_name || 'LoRA',
      modelStrength: Number(ln.values.strength_model ?? 0.8),
      clipStrength: Number(ln.values.strength_clip ?? 0.8),
      triggerWords: ln.values.trigger_words || '',
      civitaiId: ln.values.civitai_id || '',
    });
  }

  // Check CivitaiLoRABrowserNode if present
  const civitaiBrowserNodes = nodes.filter((n) => n.type === 'CivitaiLoRABrowserNode' && !n.bypassed);
  for (const cbn of civitaiBrowserNodes) {
    if (cbn.values.selected_model_name) {
      loras.push({
        name: cbn.values.selected_model_name,
        modelStrength: 0.8,
        clipStrength: 0.8,
        triggerWords: cbn.values.selected_triggers || '',
      });
    }
  }

  // 4. Prompts (Positive & Negative)
  const posNodes = nodes.filter((n) => n.type === 'CLIPTextEncode' && !n.bypassed);
  if (posNodes.length > 0) {
    positivePrompt = posNodes.map((p) => p.values.text || '').filter(Boolean).join(', ');
  } else if (videoNode && videoNode.values.prompt) {
    positivePrompt = videoNode.values.prompt;
  } else if (llmReasoningNode && (llmReasoningNode.values.refined_output || llmReasoningNode.values.prompt)) {
    positivePrompt = llmReasoningNode.values.refined_output || llmReasoningNode.values.prompt;
  } else if (googleImagenNode && googleImagenNode.values.prompt) {
    positivePrompt = googleImagenNode.values.prompt;
  } else if (promptRefinerNode && promptRefinerNode.values.concept) {
    positivePrompt = promptRefinerNode.values.concept;
  }

  const negNodes = nodes.filter((n) => n.type === 'CLIPTextEncodeNegative' && !n.bypassed);
  if (negNodes.length > 0) {
    negativePrompt = negNodes.map((p) => p.values.text || '').filter(Boolean).join(', ');
  } else if (videoNode && videoNode.values.negative_prompt) {
    negativePrompt = videoNode.values.negative_prompt;
  } else if (googleImagenNode && googleImagenNode.values.negative_prompt) {
    negativePrompt = googleImagenNode.values.negative_prompt;
  }

  // 5. Latent Dimensions (if EmptyLatentImage is present and not overridden by GoogleImagen/FalEngine)
  const latentNodes = nodes.filter((n) => n.type === 'EmptyLatentImage' && !n.bypassed);
  if (latentNodes.length > 0 && !googleImagenNode && !falEngineNode) {
    width = Number(latentNodes[0].values.width) || width;
    height = Number(latentNodes[0].values.height) || height;
    batchSize = Number(latentNodes[0].values.batch_size) || 1;
  }

  // 6. KSampler parameters
  if (ksamplerNode) {
    const vals = ksamplerNode.values;
    if (vals.control_after_generate === 'randomize') {
      seed = Math.floor(Math.random() * 1000000000);
    } else {
      seed = Number(vals.seed) || seed;
    }
    steps = Number(vals.steps) || steps;
    cfg = Number(vals.cfg) || cfg;
    sampler = vals.sampler_name || sampler;
    scheduler = vals.scheduler || scheduler;
    denoise = Number(vals.denoise ?? 1.0);
  }

  // Append LoRA triggers if needed
  const triggerWordsAll = loras
    .map((l) => l.triggerWords)
    .filter(Boolean)
    .join(', ');

  let finalPositive = positivePrompt;
  if (triggerWordsAll && !finalPositive.includes(triggerWordsAll)) {
    finalPositive = `${triggerWordsAll}, ${finalPositive}`.trim();
  }

  // 图生视频 (img2video) 规范端点校准：若存在参考底图，必须使用专门的 image-to-video 端点
  if (isVideo && initImageUrl && checkpointModel === 'fal-ai/wan/v2.1/text-to-video') {
    checkpointModel = 'fal-ai/wan/v2.1/image-to-video';
  }

  // 图生图 (img2img) 默认降噪比控制：若有输入参考底图且未手动调整 denoise (仍为 1.0)，建议降为 0.65 变体
  if (initImageUrl && !isVideo && denoise === 1.0 && ksamplerNode?.values.denoise === undefined) {
    denoise = 0.65;
  }

  return {
    checkpointModel,
    positivePrompt: finalPositive || 'a vibrant cosmic landscape, ultra detailed masterpiece',
    negativePrompt,
    width,
    height,
    batchSize,
    seed,
    steps,
    cfg,
    sampler,
    scheduler,
    denoise,
    loras,
    targetProvider,
    isVideo,
    videoDuration,
    videoFps,
    videoAspectRatio,
    initImageUrl,
    saveImageNodeId: saveNode?.id,
    saveVideoNodeId: saveVideoNode?.id,
    ksamplerNodeId: ksamplerNode?.id,
  };
}

/**
 * Executes the workflow with real providers and manages visual node progress
 */
export async function executeWorkflow(
  nodes: NodeInstance[],
  connections: Connection[],
  onNodeStateChange: (nodeId: string, state: NodeInstance['state'], progress?: number, output?: any, errorMessage?: string) => void,
  onProgress?: (percent: number, statusText: string) => void
): Promise<{ imageUrl: string; provider: string; model: string; seed: number; isVideo?: boolean }> {
  const params = extractWorkflowParameters(nodes, connections);

  const activeNodes = nodes.filter((n) => !n.bypassed);
  const ckptNodes = activeNodes.filter((n) => n.type === 'CheckpointLoaderSimple');
  const clipNodes = activeNodes.filter((n) => n.type === 'CLIPTextEncode' || n.type === 'CLIPTextEncodeNegative');
  const loraNodes = activeNodes.filter((n) => n.type === 'LoRALoader');
  const latentNodes = activeNodes.filter((n) => n.type === 'EmptyLatentImage' || n.type === 'VAEEncode' || n.type === 'LoadImage');
  const ksamplerNodes = activeNodes.filter((n) => n.type === 'KSampler' || n.type === 'AIVideoNode');
  const vaeNodes = activeNodes.filter((n) => n.type === 'VAEDecode');
  const saveNodes = activeNodes.filter(
    (n) =>
      n.type === 'SaveImage' ||
      n.type === 'SaveVideo' ||
      n.type === 'PreviewImage' ||
      n.type === 'VAEDecode' ||
      n.type === 'KSampler' ||
      n.type === 'AIVideoNode'
  );

  // Stage 1: Checkpoint Model Setup
  onProgress?.(10, `[1/5] 正在调度底模架构权重 (${params.targetProvider.toUpperCase()}: ${params.checkpointModel.split('/').pop()})...`);
  ckptNodes.forEach((n) => onNodeStateChange(n.id, 'running', 60));
  await new Promise((r) => setTimeout(r, 120));
  ckptNodes.forEach((n) => onNodeStateChange(n.id, 'success', 100));

  // Stage 2: CLIP Text Embeddings
  onProgress?.(25, `[2/5] 正在计算正负向提示词特征语义潜向量...`);
  clipNodes.forEach((n) => onNodeStateChange(n.id, 'running', 70));
  await new Promise((r) => setTimeout(r, 100));
  clipNodes.forEach((n) => onNodeStateChange(n.id, 'success', 100));

  // Stage 3: LoRA & Latent Initialization
  const loraDesc = params.loras.length > 0 ? `已装载 ${params.loras.length} 组 LoRA 适配层` : '纯底模无外挂权重';
  onProgress?.(40, `[3/5] 拓扑张量与 LoRA 适配层融合 (${loraDesc})...`);
  loraNodes.forEach((n) => onNodeStateChange(n.id, 'running', 80));
  latentNodes.forEach((n) => onNodeStateChange(n.id, 'running', 80));
  await new Promise((r) => setTimeout(r, 100));
  loraNodes.forEach((n) => onNodeStateChange(n.id, 'success', 100));
  latentNodes.forEach((n) => onNodeStateChange(n.id, 'success', 100));

  let stepInterval: any = null;

  try {
    let resultMedia = '';
    let usedProvider: string = params.targetProvider;
    let usedModel = params.checkpointModel;
    const isVideo = Boolean(params.isVideo);

    // 统一引擎壳分发执行 (Normalized Modular Engine Shell)
    const storedKeys = getStoredApiKeys() as unknown as Record<string, string>;

    // 0. 前置大模型深度推理思考阶段 (LLM Reasoning Pre-Execution Pipeline)
    const llmNode = nodes.find((n) => n.type === 'LLMReasoningNode' && !n.bypassed);
    if (llmNode && (llmNode.values.prompt || llmNode.values.input_text)) {
      onNodeStateChange(llmNode.id, 'running', 40);
      try {
        const reasoningProvider = llmNode.values.provider || 'sensenova';
        const reasoningModel = llmNode.values.model || 'deepseek-v4-flash';
        const taskType = llmNode.values.task_type || 'cinematic_photoreal';

        let sysPrompt = 'You are an elite prompt engineer and AI visual director. Expand the user concept into a rich, detailed photorealistic prompt with lighting, 8k resolution, camera details. Output ONLY the final expanded prompt in English, with no meta preamble.';
        if (taskType === 'anime_aesthetic') {
          sysPrompt = 'You are an elite prompt engineer. Expand the user concept into a stunning Japanese anime art prompt (Makoto Shinkai / Studio Ghibli aesthetic) with vibrant lighting and painterly sky. Output ONLY the final expanded prompt in English, with no meta preamble.';
        } else if (taskType === 'commercial_product') {
          sysPrompt = 'You are a master commercial product photographer. Expand the user concept into an immaculate commercial studio product photography prompt with softbox lighting, clean backdrop, and sharp micro textures. Output ONLY the final expanded prompt in English.';
        } else if (taskType === 'dark_fantasy') {
          sysPrompt = 'You are a dark fantasy concept artist. Expand the user concept into an epic dark fantasy concept art prompt (Unreal Engine 5) with dramatic volumetric lighting, gothic architecture, and mist. Output ONLY the final expanded prompt in English.';
        }

        const chatResult = await EngineRegistry.chat(
          reasoningProvider,
          {
            messages: [
              { role: 'system', content: sysPrompt },
              { role: 'user', content: llmNode.values.prompt || llmNode.values.input_text },
            ],
            model: reasoningModel,
            temperature: 0.6,
          },
          storedKeys
        );

        if (chatResult.content) {
          params.positivePrompt = chatResult.content;
          onNodeStateChange(llmNode.id, 'success', 100, {
            refined_output: chatResult.content,
            reasoning_output: chatResult.reasoningContent || '',
          });
        }
      } catch (reasoningErr: any) {
        console.warn('LLM reasoning node non-fatal fallback:', reasoningErr);
        onNodeStateChange(llmNode.id, 'error', 0, reasoningErr.message);
      }
    }

    const normParams: NormalizedGenerateParams = {
      prompt: params.positivePrompt,
      negative_prompt: params.negativePrompt,
      model: params.checkpointModel,
      width: params.width,
      height: params.height,
      steps: params.steps,
      cfg: params.cfg,
      seed: params.seed,
      denoise: params.denoise,
      image_url: params.initImageUrl,
      isVideo: params.isVideo,
      videoDuration: params.videoDuration,
      videoFps: params.videoFps,
      aspectRatio: params.videoAspectRatio,
      sampler_name: params.sampler,
      scheduler: params.scheduler,
      extraParams: {
        sampler_name: params.sampler,
        scheduler: params.scheduler,
      },
      loras: params.loras.map((l) => ({
        name: l.name,
        path: resolveLoraPathOrUrl(l),
        strength: l.modelStrength,
        modelStrength: l.modelStrength,
        clipStrength: l.clipStrength,
        civitaiId: l.civitaiId,
        triggers: l.triggerWords,
      })),
    };

    // Stage 4: KSampler / Video Generation with Honest Elapsed Time Tracker
    ksamplerNodes.forEach((n) => onNodeStateChange(n.id, 'running', 50));
    onProgress?.(50, `[4/5] 正在向 ${params.targetProvider.toUpperCase()} 官方算力提交任务并等待渲染回传...`);

    const startTime = Date.now();
    stepInterval = setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
      onProgress?.(
        65,
        `[4/5] ${params.targetProvider.toUpperCase()} 云端计算中 (已耗时 ${elapsedSec}s，等待产物就绪)...`
      );
    }, 1000);

    const execResult = await EngineRegistry.generate(
      params.targetProvider,
      normParams,
      storedKeys
    );

    if (stepInterval) clearInterval(stepInterval);

    resultMedia = execResult.mediaUrl;
    usedProvider = execResult.provider;
    usedModel = execResult.model;

    // Stage 5: VAE Decode and Final Save
    ksamplerNodes.forEach((n) => onNodeStateChange(n.id, 'success', 100));
    onProgress?.(92, `[5/5] VAE 潜空间解码与图像产物回传...`);
    vaeNodes.forEach((n) => onNodeStateChange(n.id, 'running', 80));
    await new Promise((r) => setTimeout(r, 120));
    vaeNodes.forEach((n) => onNodeStateChange(n.id, 'success', 100));

    saveNodes.forEach((n) => onNodeStateChange(n.id, 'success', 100, resultMedia));
    onProgress?.(100, `工作流生成完成 (${usedProvider})`);

    return {
      imageUrl: resultMedia,
      provider: usedProvider,
      model: usedModel,
      seed: params.seed,
      isVideo,
    };
  } catch (error: any) {
    if (stepInterval) clearInterval(stepInterval);
    onProgress?.(0, `执行失败: ${error.message}`);
    // Mark failing node specifically
    if (error.message.includes('Key') || error.message.includes('令牌')) {
      ckptNodes.forEach((n) => onNodeStateChange(n.id, 'error', 0, undefined, error.message));
    } else {
      ksamplerNodes.forEach((n) => onNodeStateChange(n.id, 'error', 0, undefined, error.message));
    }
    throw error;
  }
}
