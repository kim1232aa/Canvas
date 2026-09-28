#!/usr/bin/env python3
import sys

with open("server.ts", "r", encoding="utf-8") as f:
    content = f.read()

target_block = """    // ==========================================
    // Multi-Engine Adapter & Resolution (User Choice Supported!)
    // ==========================================
    let targetProvider = engine || 'civitai';
    let chosenEngineName = 'Civitai 官方原生生成引擎';
    let engineExplanation = '';

    if (isVideo && (engine === 'video' || engine === 'civitai')) {
      targetProvider = 'video';
      chosenEngineName = 'AI Video 视频生成引擎 (MiniMax H3 / Wan 2.1)';
      checkpoint = rawModelName || '';
      engineExplanation = '检测到 Civitai 电影级视频作品（时长约 10 秒）。已自动为您组装专用 AI 视频工作流管线 (AIVideoNode + VideoDriver)。';
    } else if (engine === 'civitai') {
      targetProvider = 'civitai';
      chosenEngineName = 'Civitai 官方原生生成引擎 (Civitai Generator)';
      checkpoint = normalizeCkpt(rawModelName, detectedBaseModel);
      baseModelArchitecture = detectedBaseModel || '';
      engineExplanation = '🌟 Civitai 官方原生引擎：100% 原生支持 Civitai 社区发布的所有模型与全量 LoRA，无需任何转译或底模替换，原汁原味极速出片！';
    } else if (engine === 'fal') {
      targetProvider = 'fal';
      chosenEngineName = 'Fal.ai 极速云引擎';
      const l = (rawModelName || '').toLowerCase() + ' ' + (detectedBaseModel || '').toLowerCase();
      if (l.includes('flux')) {
        checkpoint = 'fal-ai/flux/dev';
        baseModelArchitecture = 'FLUX.1 [dev]';
        engineExplanation = '已适配 Fal.ai FLUX.1 [dev] 官方高画质渲染端点。';
      } else {
        // Transparently use the raw model name if no specific Fal endpoint is matched
        checkpoint = rawModelName || detectedBaseModel || 'unknown_fal_checkpoint';
        baseModelArchitecture = detectedBaseModel || 'Unknown';
        engineExplanation = `尝试使用 Fal.ai 基础生图接口，请求模型: ${checkpoint}。`;
      }
    } else if (engine === 'agnes') {
      targetProvider = 'agnes';
      chosenEngineName = 'Agnes AI 极速生图引擎';
      checkpoint = 'agnes-image-2.5-flash';
      baseModelArchitecture = 'Agnes 2.5 Flash';
      engineExplanation = '已适配 Agnes AI 秒级极速生成通道。';
    } else {
      targetProvider = 'civitai';
      chosenEngineName = 'Civitai 官方原生生成引擎 (Civitai Generator)';
      checkpoint = normalizeCkpt(rawModelName, detectedBaseModel);
      baseModelArchitecture = detectedBaseModel || '';
      engineExplanation = '🌟 Civitai 官方原生引擎：100% 原生支持 Civitai 社区发布的所有模型与全量 LoRA，原汁原味极速出片！';
    }"""

replacement_block = """    // ==========================================
    // Multi-Engine Adapter & Resolution (User Choice Supported!)
    // ==========================================
    let targetProvider = engine || 'civitai';
    let chosenEngineName = 'Civitai 官方原生生成引擎';
    let engineExplanation = '';

    if (isVideo && (engine === 'video' || engine === 'civitai')) {
      targetProvider = 'video';
      chosenEngineName = 'AI Video 视频生成引擎 (MiniMax / Wan 2.1)';
      checkpoint = rawModelName || 'damo/wan2.1-i2v';
      engineExplanation = '检测到 Civitai 电影级视频作品。已自动为您组装专用 AI 视频工作流管线 (AIVideoNode + VideoDriver)。';
    } else if (engine === 'civitai') {
      targetProvider = 'civitai';
      chosenEngineName = 'Civitai 官方原生生成引擎';
      checkpoint = normalizeCkpt(rawModelName, detectedBaseModel);
      baseModelArchitecture = detectedBaseModel || '';
      engineExplanation = '🌟 Civitai 官方原生引擎：100% 原生支持 Civitai 社区发布的所有模型与全量 LoRA，无需任何转译或底模替换，原汁原味极速出片！';
    } else if (engine === 'fal') {
      targetProvider = 'fal';
      chosenEngineName = 'Fal.ai 极速云引擎';
      const l = (rawModelName || '').toLowerCase() + ' ' + (detectedBaseModel || '').toLowerCase();
      if (l.includes('flux')) {
        checkpoint = 'fal-ai/flux/dev';
        baseModelArchitecture = 'FLUX.1 [dev]';
        engineExplanation = '⚡ Fal.ai 极速云引擎：已适配 Fal.ai FLUX.1 [dev] 官方高画质渲染端点。';
      } else if (l.includes('sdxl') || l.includes('pony')) {
        checkpoint = 'fal-ai/fast-sdxl';
        baseModelArchitecture = 'SDXL 1.0';
        engineExplanation = '⚡ Fal.ai 极速云引擎：已适配 Fal.ai SDXL 1.0 加速渲染接口。';
      } else {
        checkpoint = rawModelName || detectedBaseModel || 'fal-ai/flux/dev';
        baseModelArchitecture = detectedBaseModel || 'FLUX.1';
        engineExplanation = `⚡ Fal.ai 极速云引擎：尝试使用 Fal.ai 基础生图接口，请求模型: ${checkpoint}。`;
      }
    } else if (engine === 'agnes') {
      targetProvider = 'agnes';
      chosenEngineName = 'Agnes AI 极速生图引擎';
      checkpoint = 'agnes-image-2.5-flash';
      baseModelArchitecture = 'Agnes 2.5 Flash';
      engineExplanation = '🚀 Agnes AI 极速生图引擎：已适配 Agnes AI 秒级极速生成通道。';
    } else if (engine === 'sensenova') {
      targetProvider = 'sensenova';
      chosenEngineName = 'SenseNova 商汤日日新引擎';
      checkpoint = 'sensenova-v5';
      baseModelArchitecture = 'SenseNova V5 CoT';
      engineExplanation = '🧠 SenseNova 商汤日日新引擎：已为您完成跨引擎真实模型与权重映射，直连商汤大模型思维链生图。';
    } else if (engine === 'modelscope') {
      targetProvider = 'modelscope';
      chosenEngineName = 'ModelScope 魔搭社区引擎';
      const l = (rawModelName || '').toLowerCase() + ' ' + (detectedBaseModel || '').toLowerCase();
      if (l.includes('wan') || isVideo) {
        checkpoint = 'damo/wan2.1-t2i';
        baseModelArchitecture = 'Wan 2.1';
      } else {
        checkpoint = 'damo/cv_sd_text-to-image_synthesis-v1.0';
        baseModelArchitecture = 'ModelScope Wan / SD';
      }
      engineExplanation = '🌌 ModelScope 魔搭社区引擎：已为您完成跨引擎真实模型与权重映射，直连通义万相与魔搭社区开源通道。';
    } else if (engine === 'huggingface') {
      targetProvider = 'huggingface';
      chosenEngineName = 'Hugging Face Diffusers 引擎';
      const l = (rawModelName || '').toLowerCase() + ' ' + (detectedBaseModel || '').toLowerCase();
      if (l.includes('flux')) {
        checkpoint = 'black-forest-labs/FLUX.1-dev';
        baseModelArchitecture = 'FLUX.1 [dev]';
      } else if (l.includes('sdxl') || l.includes('pony')) {
        checkpoint = 'stabilityai/stable-diffusion-xl-base-1.0';
        baseModelArchitecture = 'SDXL 1.0';
      } else {
        checkpoint = 'runwayml/stable-diffusion-v1-5';
        baseModelArchitecture = 'SD 1.5';
      }
      engineExplanation = '🤗 Hugging Face Diffusers 引擎：已为您完成跨引擎开源权重映射，直连 Hugging Face Hub。';
    } else if (engine === 'video') {
      targetProvider = 'video';
      chosenEngineName = 'AI Video 视频生成引擎 (MiniMax / Wan 2.1)';
      checkpoint = rawModelName || 'damo/wan2.1-i2v';
      isVideo = true;
      engineExplanation = '🎬 AI Video 视频引擎：已自动为您组装专用 AI 视频工作流管线 (AIVideoNode + VideoDriver)。';
    } else {
      targetProvider = engine || 'civitai';
      chosenEngineName = `${engine || 'Civitai'} 引擎`;
      checkpoint = normalizeCkpt(rawModelName, detectedBaseModel);
      baseModelArchitecture = detectedBaseModel || '';
      engineExplanation = `已指定跨引擎接入: ${engine}。`;
    }"""

if target_block in content:
    content = content.replace(target_block, replacement_block)
    with open("server.ts", "w", encoding="utf-8") as f:
        f.write(content)
    print("SUCCESS: server.ts multi-engine adapter patched.")
else:
    print("ERROR: Target block not found in server.ts!")
    sys.exit(1)
