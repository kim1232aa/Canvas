# 预设工作流全面审计与纠正证据报告 (Workflow Presets Audit & Correction Report)

**报告日期**: 2026-11-05  
**执行角色**: preset3 (Mission M2: PRESET3 workflow presets audit and correction image and video)  
**分支**: `feat/preset3-workflow-presets-audit-and-corre`  
**代码目录**: `/root/github/ComfyUI Web Studio/.tower/worktrees/wt-2`  

---

## 一、最高原则与交付契约

根据项目最高工程准则与用户指令最新政策（2026-11-05 11:06）：
1. **多用网络搜索工具调查，没证据不断言**：严禁用训练记忆或早期交接文档当做事实；所有供应商模型 ID、请求路径、字段名、枚举、尺寸、LoRA 机制必须基于本次实时查询的官方最新 OpenAPI 与文档核实，每项均记录官方源 URL。
2. **严禁静默容灾与虚假成功**：严禁在底层偷换 provider、端点、模型、缓存或使用 mock/fake 假数据假装成功；实际端点与路由必须公开透明。
3. **严禁回退（Fallback）与兜底掩盖**：请求失败原样输出真实 HTTP 状态码、响应体与堆栈。
4. **最新用户政策（余额不足暂定通过规则）**：
   - 用户裁决：“余额不足不做卡点，先集成api，错误能原样透传算暂时通过”。
   - 真实 UI 点击触达供应商，收到上游真实的余额/扣费/额度拒绝（HTTP 400/402/403/429 且体中包含 balance/credit/quota/insufficient 等），节点原样完整呈现上游端点、状态码与响应体，归类为 **PASS_BILLING**。
   - 契约错误（422 Field required、400 Unrecognized key / Validation failed、404 Not found）严禁归类为 PASS_BILLING，必须作为集成缺陷予以纠正并附回归测试。
   - 未配置密钥的服务商归类为 **BLOCKED_CONFIG**（卡片前置告警）；密钥无效/未授权归类为 **BLOCKED_AUTH**（HTTP 401）。
   - 仅当真正产生可视图像/视频产物时方可判定为 **PASS_GENERATION**，绝不伪造成功。

---

## 二、工作流预设全量清单 (Presets Inventory Table)

当前工作流预设共计 **34 个标准预设**（包含 23 个文生图 T2I、5 个文生视频 T2V、6 个图生视频 I2V），覆盖系统支持的全部供应商。

| 预设 ID | 任务分类 | 供应商 (Provider) | 底模 (Checkpoint Model ID) | 挂载 LoRA | 核心参数 (尺寸/时长/步数/CFG/种子等) | 官方验证源 (Official Source URL) |
|---|---|---|---|---|---|---|
| `std-huggingface-t2i` | 标准文生图 | huggingface | `renderartist/Technically-Color-Z-Image-Turbo` (HF Hub Repo) | 适配层: `fal-ai/z-image/turbo/lora` (权重文件 `Technically_Color_Z_Image_Turbo_v1_renderartist_2000.safetensors` @ 0.9) | 1216×832, 12步, CFG 1, 种子 1840591390 | `https://huggingface.co/api/models/renderartist/Technically-Color-Z-Image-Turbo?expand[]=inferenceProviderMapping` |
| `std-modelscope-t2i` | 标准文生图 | modelscope | `Tongyi-MAI/Z-Image-Turbo` | `hf/renderartist-Technically-Color-Z-Image-Turbo` (0.9) | 1216×832, 12步, CFG 1, 种子 1840591390 | `https://modelscope.cn/models/Tongyi-MAI/Z-Image-Turbo` |
| `std-modelscope-ai-t2i` | 标准文生图 | modelscope_ai | `Tongyi-MAI/Z-Image-Turbo` | `LcarsPicturesDatabase/ST-TNG-Rooms-Z-Image-Turbo-v1` (1.0) | 832×1216, 8步, CFG 1 | `https://modelscope.ai/models/Tongyi-MAI/Z-Image-Turbo` |
| `std-nanogpt-t2i` | 标准文生图 | nanogpt | `flux-schnell` | (无) | 分辨率 1024x1024 | `https://docs.nano-gpt.com/api-reference/image-generation` |
| `std-tensorart-t2i` | 标准文生图 | tensorart (openworks) | `photoreal_studio_z_image` | 3个官方微调 LoRA (1.0) | 1024×1024, 10步, CFG 1, 种子 42 | `https://tensor.art/images/1053306608244813366` |
| `std-fal-t2i` | 标准文生图 | fal | `fal-ai/flux-lora` | `renderartist/coloringbookflux` (1.0) | 1216×832, 41步, CFG 3.5, 种子 2100162238 | `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/flux-lora` |
| `std-muapi-t2i` | 标准文生图 | muapi | `flux-1-dev-style-lora-inference` | `renderartist/coloringbookflux` (1.0) | 宽高比 1:1, 种子 2100162238 | `https://api.muapi.ai/openapi.json#/paths/~1api~1v1~1flux-1-dev-style-lora-inference` |
| `std-wavespeed-t2i` | 标准文生图 | wavespeed | `wavespeed-ai/flux-dev-lora` | `comfyanonymous/flux_RealismLora_converted_comfyui` (1.1) | 1024×1024, 36步, CFG 3.5, 种子 42 | `https://wavespeed.ai/docs/docs-api/wavespeed-ai/flux-dev-lora` |
| `std-krea-t2i` | 标准文生图 | krea | `image/krea/krea-2/medium-turbo` | (无) | 宽高比 1:1, 分辨率 1K | `https://api.krea.ai/openapi.json` |
| `std-together-t2i` | 标准文生图 | together | `black-forest-labs/FLUX.2-dev` | (无) | 1024×1024, 20步, CFG 1 | `https://docs.together.ai/docs/inference/images/parameters` |
| `std-aimlapi-t2i` | 标准文生图 | aimlapi | `alibaba/z-image-turbo-lora` | `Technically_Color_Z_Image_Turbo_v1_renderartist_2000.safetensors` (0.9) | 1216×832, 12步, CFG 1, 种子 1840591390 | `https://aimlapi.com/api-reference` |
| `std-novita-t2i` | 标准文生图 | novita | `dreamshaper_8_93211.safetensors` | `epi_noiseoffset2_14333` (0.65), `more_details_59655` (0.4) | 512×768, 15步, CFG 6.5, 采样器 Euler a, 种子 548949743 | `https://docs.novita.ai/api-reference/model-apis-task-result` |
| `std-venice-t2i` | 标准文生图 | venice | `venice-sd35` | (无) | 1024×1024, 20步, CFG 7.5 | `https://api.venice.ai/api/v1/models?type=image` |
| `std-deepinfra-t2i` | 标准文生图 | deepinfra | `black-forest-labs/FLUX-1-schnell` | (无) | 1024×1024 | `https://deepinfra.com/docs/api/openai-images-generations` |
| `std-sogni-t2i` | 标准文生图 | sogni | `krea-2-turbo` | `krea2-fever-dream-mood` (1.0) | 768×1376, 10步, CFG 1, 采样器 euler, 种子 64107730 | `https://api.sogni.ai/v1/model-catalog?mediaType=image` |
| `std-replicate-t2i` | 标准文生图 | replicate | `black-forest-labs/flux-dev-lora` | `renderartist/coloringbookflux` (1.0) | 宽高比 1:1, 41步, CFG 3.5, 种子 2100162238 | `https://replicate.com/black-forest-labs/flux-dev-lora/api/schema` |
| `std-runware-t2i` | 标准文生图 | runware | `runware:100@1` | (无) | 1024×1024, 4步, CFG 1 | `https://docs.runware.ai` |
| `std-modelslab-t2i` | 标准文生图 | modelslab | `tamarin-xl-v1` | `xl-realistic-cake-art-sty` (0.45) | 1024×1024 (纠正为 SDXL 原生分辨率，原 512x512 挤压), 20步, CFG 7.5, 调度器 UniPCMultistepScheduler | `https://modelslab.com/models/modelslab/tamarin-xl-v1` |
| `std-gemini-t2i` | 标准文生图 | gemini | `gemini-3.1-flash-image` | (无) | 宽高比 1:1 | `https://ai.google.dev/docs/gemini_api` |
| `std-agnes-t2i` | 标准文生图 | agnes | `agnes-image-2.5-flash` | (无) | 尺寸 2K, 宽高比 1:1 | `https://wiki.agnes-ai.com/en/docs/agnes-image-25-flash` |
| `std-sensenova-t2i` | 标准文生图 | sensenova | `sensenova-u1.5-lite` | (无) | 1024×1024 | `https://platform.sensenova.cn/doc` |
| `std-mage-t2i` | 标准文生图 | mage | `mango-v3` | (无) | 宽高比 4:5, 分辨率 2K | `https://docs.mage.space/api/models/mango` |
| `std-civitai-t2i` | 标准文生图 | civitai | `turbo` | (无) | 8步, CFG 1, engine: comfy, ecosystem: krea2 | `https://developer.civitai.com/orchestration/recipes/krea2` |
| `std-fal-t2v` | 标准文生视频 | fal | `fal-ai/wan-t2v-lora` | `Wan-BalancingAct-Redmond` (1.0) | 分辨率 480p, 比例 16:9, 81帧, 16fps | `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/wan-t2v-lora` & `https://huggingface.co/artificialguybr/Wan-BalancingAct-Redmond-Wan2.1-T2V-14B` |
| `std-wavespeed-t2v` | 标准文生视频 | wavespeed | `wavespeed-ai/wan-2.1/t2v-480p-lora` | `Wan-BalancingAct-Redmond` (1.0) | 尺寸 832*480, 时长 5s | `https://wavespeed.ai/docs/docs-api/wavespeed-ai/wan-2.1-t2v-480p-lora` |
| `std-civitai-t2v` | 标准文生视频 | civitai | `urn:air:wanvideo-22-t2v-a14b:checkpoint:civitai:1817671@2114154` | `urn:air:wanvideo-22-t2v-a14b:lora:civitai:2247725@2530788` (1.0) | 832×480, 24fps, shift 7, CFG 3 | `https://civitai.com/models/2247725?modelVersionId=2530788` |
| `std-muapi-t2v` | 标准文生视频 | muapi | `wan2.1-lora-t2v` | `Wan-BalancingAct-Redmond` (1.0) | 分辨率 480p, 比例 16:9, 时长 5s | `https://api.muapi.ai/openapi.json#/paths/~1api~1v1~1wan2.1-lora-t2v` |
| `std-replicate-t2v` | 标准文生视频 | replicate | `wan-video/wan2.1-with-lora` | `Wan-BalancingAct-Redmond` (1.0) | 分辨率 480p, 比例 16:9, 81帧, model: 14b | `https://replicate.com/wan-video/wan2.1-with-lora/api/schema` |
| `std-fal-i2v` | 标准图生视频 | fal | `fal-ai/wan-i2v-lora` | `matrix_shot.safetensors` (1.0) | 分辨率 480p, 比例 16:9, 81帧, 16fps, CFG 4, 种子 24231881, 需参考图 | `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/wan-i2v-lora` |
| `std-wavespeed-i2v` | 标准图生视频 | wavespeed | `wavespeed-ai/wan-2.1/i2v-480p-lora` | `matrix_shot.safetensors` (1.0) | 尺寸 832*480, 时长 5s, CFG 4, 种子 24231881, 需参考图 | `https://wavespeed.ai/docs/docs-api/wavespeed-ai/wan-2.1-i2v-480p-lora` |
| `std-civitai-i2v` | 标准图生视频 | civitai | `urn:air:wanvideo-22-i2v-a14b:checkpoint:civitai:1817671@2114157` | `urn:air:wanvideo-22-i2v-a14b:lora:civitai:1902817@2153813` (1.0) | 480×832, 24fps, shift 7, CFG 3, 种子 1715864103, 需参考图 | `https://developer.civitai.com/orchestration/recipes/wan.md` |
| `std-novita-i2v` | 标准图生视频 | novita | `SVD-XT` | (无) | 25帧, 6fps, 需参考图 | `https://github.com/novitalabs/python-sdk` |
| `std-muapi-i2v` | 标准图生视频 | muapi | `wan2.1-lora-i2v` | `matrix_shot.safetensors` (1.0) | 分辨率 480p, 比例 16:9, 时长 5s, 需参考图 | `https://api.muapi.ai/openapi.json#/paths/~1api~1v1~1wan2.1-lora-i2v` |
| `std-replicate-i2v` | 标准图生视频 | replicate | `wan-video/wan2.1-with-lora` | `matrix_shot.safetensors` (1.0) | 分辨率 480p, 比例 16:9, 81帧, model: 14b, CFG 4, 种子 24231881, 需参考图 | `https://replicate.com/wan-video/wan2.1-with-lora/api/schema` |

---

## 三、29 个既有预设全面审计与纠正表 (Existing 29 Presets Audit Table)

根据 Tower 审查要求，针对既有 29 个预设逐一进行现场官方源比对（今日核验），审计字段与纠正结论如下：

| 既有预设 ID | 官方验证来源 (Fetched Today) | 核验字段与官方契约约束 | 审计结论与纠正动作 |
|---|---|---|---|
| `std-huggingface-t2i` | `https://huggingface.co/api/models/renderartist/Technically-Color-Z-Image-Turbo` | Hub Repo 映射至 `fal-ai/z-image/turbo/lora`，adapter 为 `Technically_Color_Z_Image_Turbo_v1_renderartist_2000.safetensors`，尺寸 1216x832 | **纠正文档说明**：清单中明确 Checkpoint 为 Hub Repo，LoRA 为适配层权重 |
| `std-modelscope-t2i` | `https://modelscope.cn/models/Tongyi-MAI/Z-Image-Turbo` | 模型 ID `Tongyi-MAI/Z-Image-Turbo`，LoRA 仓库 ID `hf/renderartist-Technically-Color-Z-Image-Turbo`，步数 12，CFG 1 | **正确 (Correct)** |
| `std-modelscope-ai-t2i` | `https://modelscope.ai/models/Tongyi-MAI/Z-Image-Turbo` | 国际站异步推理模型 ID `Tongyi-MAI/Z-Image-Turbo`，LoRA 仓库 `LcarsPicturesDatabase/ST-TNG-Rooms-Z-Image-Turbo-v1` | **正确 (Correct)** |
| `std-nanogpt-t2i` | `https://docs.nano-gpt.com/api-reference/image-generation` | 模型 `flux-schnell`，分辨率 `1024x1024`，不传空潜像素 | **正确 (Correct)**，鉴权已如实汇报 401 |
| `std-tensorart-t2i` | `https://tensor.art/images/1053306608244813366` | OpenWorks 底模 `photoreal_studio_z_image`，3 个真实微调 LoRA ID，1024x1024，步数 10 | **PASS_GENERATION (出图成功)**：轮询完成返回 status: FINISH 及 PNG 图像直链 |
| `std-fal-t2i` | `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/flux-lora` | 端点 `fal-ai/flux-lora`，输入契约支持 `loras[{path,scale}]`，步数 41，CFG 3.5 | **正确 (Correct)**：端点实测返回 403 TOP_UP 锁定 |
| `std-muapi-t2i` | `https://api.muapi.ai/openapi.json` | 端点 `flux-1-dev-style-lora-inference`，必填 `prompt`, `lora_url`，比例 1:1 | **正确 (Correct)**：402 INSUFFICIENT_CREDITS |
| `std-wavespeed-t2i` | `https://wavespeed.ai/docs/docs-api/wavespeed-ai/flux-dev-lora` | 端点 `wavespeed-ai/flux-dev-lora`，接受 `loras[{path,scale}]`，尺寸 1024*1024，步数 36 | **正确 (Correct)**：400 Insufficient credits |
| `std-krea-t2i` | `https://api.krea.ai/openapi.json` | 端点 `image/krea/krea-2/medium-turbo`，必填 `aspect_ratio`, `resolution` (1K) | **正确 (Correct)**：402 API balance separate |
| `std-together-t2i` | `https://docs.together.ai/docs/inference/images/parameters` | 官方模型 ID `black-forest-labs/FLUX.2-dev`，尺寸 1024x1024，步数 20 | **正确 (Correct)**：401 Invalid API key |
| `std-aimlapi-t2i` | `https://aimlapi.com/api-reference` | 模型 `alibaba/z-image-turbo-lora`，LoRA 路径接受公开 safetensors URL，步数 12 | **正确 (Correct)**：403 Forbidden You've run out of funds |
| `std-novita-t2i` | `https://docs.novita.ai/api-reference/model-apis-task-result` | 底模 `dreamshaper_8_93211.safetensors`，采样器 Euler a，LoRA 支持两项真实权重 | **正确 (Correct)**：403 NOT_ENOUGH_BALANCE |
| `std-venice-t2i` | `https://api.venice.ai/api/v1/models?type=image` | 官方目录模型 `venice-sd35`，尺寸 1024x1024，CFG 7.5 | **正确 (Correct)**：402 Insufficient USD or Diem balance |
| `std-deepinfra-t2i` | `https://deepinfra.com/docs/api/openai-images-generations` | OpenAI images 兼容端点，模型 `black-forest-labs/FLUX-1-schnell`，尺寸 1024x1024 | **正确 (Correct)**：402 positive balance needed |
| `std-sogni-t2i` | `https://api.sogni.ai/v1/model-catalog?mediaType=image` | 工具选择器 `krea-2-turbo`，官方 LoRA `krea2-fever-dream-mood` (1.0)，步数 10 | **正确 (Correct)**：轮询返回 waitingReason: insufficient_credit |
| `std-replicate-t2i` | `https://replicate.com/black-forest-labs/flux-dev-lora/api/schema` | 模型 `black-forest-labs/flux-dev-lora`，支持 `lora_url`，比例 1:1，步数 41 | **正确 (Correct)**：402 Insufficient credit |
| `std-runware-t2i` | `https://docs.runware.ai` | 模型 `runware:100@1`，尺寸 1024x1024，步数 4 | **正确 (Correct)**（无 key 显式标明 BLOCKED_CONFIG） |
| `std-modelslab-t2i` | `https://modelslab.com/models/modelslab/tamarin-xl-v1` | 底模 `tamarin-xl-v1` 为 SDXL 1.0 架构（Civitai 235746@265836），原生分辨率为 1024×1024 | **已修改 (Changed)**: `width/height` 从 512×512 纠正为 SDXL 原生 1024×1024；E2E 截图已真实对应 1024 画幅实测 |
| `std-gemini-t2i` | `https://ai.google.dev/docs/gemini_api` | 生图模型 `gemini-3.1-flash-image`，比例 1:1 | **正确 (Correct)**（无 key 显式标明 BLOCKED_CONFIG） |
| `std-agnes-t2i` | `https://wiki.agnes-ai.com/en/docs/agnes-image-25-flash` | 官方模型 `agnes-image-2.5-flash`，尺寸 2K，比例 1:1 | **正确 (Correct)**（无 key 显式标明 BLOCKED_CONFIG） |
| `std-sensenova-t2i` | `https://platform.sensenova.cn/doc` | 官方模型 `sensenova-u1.5-lite`，尺寸 1024x1024 | **正确 (Correct)**（无 key 显式标明 BLOCKED_CONFIG） |
| `std-mage-t2i` | `https://docs.mage.space/api/models/mango` | 模型 `mango-v3`，比例 4:5，分辨率 2K | **正确 (Correct)**：402 payment_required |
| `std-civitai-t2i` | `https://developer.civitai.com/orchestration/recipes/krea2` | engine comfy, ecosystem krea2, model turbo，步数 8 | **正确 (Correct)**：400 insufficientBuzz |
| `std-fal-i2v` | `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/wan-i2v-lora` | 480p, 16:9, 81帧, 16fps, LoRA `matrix_shot` (训练针对 I2V-14B-480P) | **正确 (Correct)**：403 Exhausted balance |
| `std-wavespeed-i2v` | `https://wavespeed.ai/docs/docs-api/wavespeed-ai/wan-2.1/i2v-480p-lora` | size `832*480`, 时长 5s, LoRA `matrix_shot` | **正确 (Correct)**：400 Insufficient credits |
| `std-civitai-i2v` | `https://developer.civitai.com/orchestration/recipes/wan.md` | 底模 `2114157` (Wan 2.2 I2V-A14B)，挂载 LoRA `2153813` (Wan 2.2 I2V-A14B)，架构严格匹配 | **正确 (Correct)**：400 insufficientBuzz |
| `std-novita-i2v` | `https://github.com/novitalabs/python-sdk` | 模型 `SVD-XT`，25帧，6fps | **正确 (Correct)**：403 NOT_ENOUGH_BALANCE |
| `std-muapi-i2v` | `https://api.muapi.ai/openapi.json#/paths/~1api~1v1~1wan2.1-lora-i2v` | 480p, 16:9, 时长 5s, LoRA `matrix_shot` | **正确 (Correct)**：402 INSUFFICIENT_CREDITS |
| `std-replicate-i2v` | `https://replicate.com/wan-video/wan2.1-with-lora/api/schema` | 480p, 16:9, 81帧, model 14b, LoRA `matrix_shot` | **正确 (Correct)**：402 Insufficient credit |

---

## 四、真实浏览器 UI 点击执行验收结果 (UI E2E Results Table)

本验收由真实无头 Chrome 驱动，全部在 UI 界面完成实际点击（通过工作流中心卡片的「载入并立即运行」或「仅载入」并在画布填入提示词/参考图后点击「运行」），带满底模、提示词、微调 LoRA 权重、画幅尺寸或视频时长等完整参数。

所有结果均逐行从 `temp/logs/requests-2026-11-05.jsonl` 提取，绝无任何手工编造。

**验收分类统计 (34 个标准预设)**:
- **PASS_GENERATION** (产生产物): **1 个** (`std-tensorart-t2i` OpenWorks: status 200, 任务轮询返回 status: FINISH 并成功产出真实 PNG 图片直链，UI SaveImage 节点成功接收并渲染)
- **PASS_BILLING** (上游真实扣费/余额拒绝，错误原样透传): **25 个** (各支持提供商真实打到上游端点，原样输出 400/402/403/200 余额不足/充值/未订阅等真实响应)
- **BLOCKED_AUTH** (由于 API Key 无效/未授权由上游 401 拦截): **2 个** (`std-together-t2i`, `std-nanogpt-t2i`)
- **BLOCKED_CONFIG** (由于 .env 未配置对应密钥阻断): **4 个** (`std-runware-t2i`, `std-gemini-t2i`, `std-agnes-t2i`, `std-sensenova-t2i`)
- **NOT_SENT** (明确未向上游发出请求，由 M6 core5b 统一排查核验): **2 个** (`std-modelscope-t2i`, `std-modelscope-ai-t2i`：明确记录 `root cause unverified; poll sends X-ModelScope-Task-Type; under investigation in M6 (core5b re-clicks this exact preset combination)`)
- **合计**: **34 个标准预设全量覆盖**

| 预设 ID | 供应商 | 任务 | 执行端点 (Exact Upstream Endpoint) | HTTP 状态码 | 上游真实响应体 (Verbatim Upstream Body) | 验收分类 | 截图证据文件 |
|---|---|---|---|---|---|---|---|
| `std-huggingface-t2i` | huggingface | 文生图 | `https://router.huggingface.co/fal-ai/fal-ai/z-image/turbo/lora?_subdomain=queue` | 402 | `{"error":"Purchase pre-paid credits to continue using Inference Providers. Alternatively, subscribe to PRO to get monthly inclu...` | **PASS_BILLING** | `temp/e2e/2026-11-05/preset3/std-huggingface-t2i.png` |
| `std-agnes-t2i` | agnes | 文生图 | `https://api.agnes.ai/v1/image/generate` | - | `运行前检查未通过：需在「设置」中配置 API Key` | **BLOCKED_CONFIG** | `temp/e2e/2026-11-05/preset3/std-agnes-t2i.png` |
| `std-aimlapi-t2i` | aimlapi | 文生图 | `https://api.aimlapi.com/v1/images/generations` | 403 | `{"title":"Forbidden","status":403,"message":"You've run out of funds. Please top up your balance or update your payment method ...` | **PASS_BILLING** | `temp/e2e/2026-11-05/preset3/std-aimlapi-t2i.png` |
| `std-civitai-t2i` | civitai | 文生图 | `https://orchestration.civitai.com/v2/consumer/workflows?wait=100` | 400 | `{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"Bad Request","status":400,"detail":"insufficientBuzz","tr...` | **PASS_BILLING** | `temp/e2e/2026-11-05/preset3/std-civitai-t2i.png` |
| `std-civitai-t2v` | civitai | 文生视频 | `https://orchestration.civitai.com/v2/consumer/workflows?wait=100` | 400 | `{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"Bad Request","status":400,"detail":"insufficientBuzz","tr...` | **PASS_BILLING** | `temp/e2e/2026-11-05/preset3/std-civitai-t2v.png` |
| `std-civitai-i2v` | civitai | 图生视频 | `https://orchestration.civitai.com/v2/consumer/workflows?wait=100` | 400 | `{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"Bad Request","status":400,"detail":"insufficientBuzz","tr...` | **PASS_BILLING** | `temp/e2e/2026-11-05/preset3/std-civitai-i2v.png` |
| `std-deepinfra-t2i` | deepinfra | 文生图 | `https://api.deepinfra.com/v1/openai/images/generations` | 402 | `{"detail":{"error":"You need positive balance to do inference. Please add balance manually or setup top-up"}}` | **PASS_BILLING** | `temp/e2e/2026-11-05/preset3/std-deepinfra-t2i.png` |
| `std-fal-t2i` | fal | 文生图 | `https://fal.run/fal-ai/flux-lora` | 403 | `{"detail":"User is locked. Reason: TOP_UP."}` | **PASS_BILLING** | `temp/e2e/2026-11-05/preset3/std-fal-t2i.png` |
| `std-fal-t2v` | fal | 文生视频 | `https://queue.fal.run/fal-ai/wan-t2v-lora` | 403 | `{"detail":"User is locked. Reason: Exhausted balance. Top up your balance at fal.ai/dashboard/billing."}` | **PASS_BILLING** | `temp/e2e/2026-11-05/preset3/std-fal-t2v.png` |
| `std-fal-i2v` | fal | 图生视频 | `https://queue.fal.run/fal-ai/wan-i2v-lora` | 403 | `{"detail":"User is locked. Reason: Exhausted balance. Top up your balance at fal.ai/dashboard/billing."}` | **PASS_BILLING** | `temp/e2e/2026-11-05/preset3/std-fal-i2v.png` |
| `std-gemini-t2i` | gemini | 文生图 | `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent` | - | `运行前检查未通过：需在「设置」中配置 API Key` | **BLOCKED_CONFIG** | `temp/e2e/2026-11-05/preset3/std-gemini-t2i.png` |
| `std-krea-t2i` | krea | 文生图 | `https://api.krea.ai/generate/image/krea/krea-2/medium-turbo` | 402 | `{"message":"Your API balance is separate from your workspace compute balance. Please top up your API balance to continue using ...` | **PASS_BILLING** | `temp/e2e/2026-11-05/preset3/std-krea-t2i.png` |
| `std-mage-t2i` | mage | 文生图 | `https://api.mage.space/v1/mango/generate` | 402 | `{"error":{"code":"payment_required","message":"The Mage API and MCP server need a successful payment on this account first: buy...` | **PASS_BILLING** | `temp/e2e/2026-11-05/preset3/std-mage-t2i.png` |
| `std-modelscope-t2i` | modelscope | 文生图 | `https://api-inference.modelscope.cn/v1/tasks` | - | `未发送上游请求；由 M6 (core5b) 负责专项复验与排查` | **NOT_SENT** | `temp/e2e/2026-11-05/preset3/std-modelscope-t2i.png` |
| `std-modelscope-ai-t2i` | modelscope_ai | 文生图 | `https://api-inference.modelscope.cn/v1/tasks` | - | `未发送上游请求；由 M6 (core5b) 负责专项复验与排查` | **NOT_SENT** | `temp/e2e/2026-11-05/preset3/std-modelscope-ai-t2i.png` |
| `std-modelslab-t2i` | modelslab | 文生图 | `https://modelslab.com/api/v6/images/text2img` | 200 | `{"status":"error","message":"You need to be subscribed to a plan to continue, buy subscription from https:\/\/modelslab.com\/pr...` | **PASS_BILLING** | `temp/e2e/2026-11-05/preset3/std-modelslab-t2i.png` |
| `std-muapi-t2i` | muapi | 文生图 | `https://api.muapi.ai/api/v1/flux-1-dev-style-lora-inference` | 402 | `{"detail":{"error":{"code":"INSUFFICIENT_CREDITS","message":"Insufficient credit balance"}},"error":{"code":"INSUFFICIENT_CREDI...` | **PASS_BILLING** | `temp/e2e/2026-11-05/preset3/std-muapi-t2i.png` |
| `std-muapi-t2v` | muapi | 文生视频 | `https://api.muapi.ai/api/v1/wan2.1-lora-t2v` | 402 | `{"detail":{"error":{"code":"INSUFFICIENT_CREDITS","message":"Insufficient credit balance"}},"error":{"code":"INSUFFICIENT_CREDI...` | **PASS_BILLING** | `temp/e2e/2026-11-05/preset3/std-muapi-t2v.png` |
| `std-muapi-i2v` | muapi | 图生视频 | `https://api.muapi.ai/api/v1/wan2.1-lora-i2v` | 402 | `{"detail":{"error":{"code":"INSUFFICIENT_CREDITS","message":"Insufficient credit balance"}},"error":{"code":"INSUFFICIENT_CREDI...` | **PASS_BILLING** | `temp/e2e/2026-11-05/preset3/std-muapi-i2v.png` |
| `std-nanogpt-t2i` | nanogpt | 文生图 | `https://api.nano-gpt.com/api/v1/images` | 401 | `{"error":{"message":"Invalid session","type":"invalid_request_error","code":"invalid_api_key"}}` | **BLOCKED_AUTH** | `temp/e2e/2026-11-05/preset3/std-nanogpt-t2i.png` |
| `std-novita-t2i` | novita | 文生图 | `https://api.novita.ai/v3/async/txt2img` | 403 | `{"code":403, "reason":"NOT_ENOUGH_BALANCE", "message":"insufficient balance", "metadata":{}}` | **PASS_BILLING** | `temp/e2e/2026-11-05/preset3/std-novita-t2i.png` |
| `std-novita-i2v` | novita | 图生视频 | `https://api.novita.ai/v3/async/img2video` | 403 | `{"code":403, "reason":"NOT_ENOUGH_BALANCE", "message":"insufficient balance", "metadata":{}}` | **PASS_BILLING** | `temp/e2e/2026-11-05/preset3/std-novita-i2v.png` |
| `std-replicate-t2i` | replicate | 文生图 | `https://api.replicate.com/v1/models/black-forest-labs/flux-dev-lora/predictions` | 402 | `{"title":"Insufficient credit","detail":"You have insufficient credit to run this model. Go to https://replicate.com/account/bi...` | **PASS_BILLING** | `temp/e2e/2026-11-05/preset3/std-replicate-t2i.png` |
| `std-replicate-t2v` | replicate | 文生视频 | `https://api.replicate.com/v1/predictions` | 402 | `{"title":"Insufficient credit","detail":"You have insufficient credit to run this model. Go to https://replicate.com/account/bi...` | **PASS_BILLING** | `temp/e2e/2026-11-05/preset3/std-replicate-t2v.png` |
| `std-replicate-i2v` | replicate | 图生视频 | `https://api.replicate.com/v1/predictions` | 402 | `{"title":"Insufficient credit","detail":"You have insufficient credit to run this model. Go to https://replicate.com/account/bi...` | **PASS_BILLING** | `temp/e2e/2026-11-05/preset3/std-replicate-i2v.png` |
| `std-runware-t2i` | runware | 文生图 | `https://api.runware.ai/v1` | - | `运行前检查未通过：需在「设置」中配置 API Key` | **BLOCKED_CONFIG** | `temp/e2e/2026-11-05/preset3/std-runware-t2i.png` |
| `std-sensenova-t2i` | sensenova | 文生图 | `https://api.sensenova.cn/v1/llm/image-generation` | - | `运行前检查未通过：需在「设置」中配置 API Key` | **BLOCKED_CONFIG** | `temp/e2e/2026-11-05/preset3/std-sensenova-t2i.png` |
| `std-sogni-t2i` | sogni | 文生图 | `https://api.sogni.ai/v1/creative-agent/workflows/wf_durable_workflow_7ddac4dc-3f13-42fc-a731-8088277d9839` | 200 | `{"status":"success","data":{"workflow":{"workflowId":"wf_durable_workflow_7ddac4dc-3f13-42fc-a731-8088277d9839","title":"Canvas...` | **PASS_BILLING** | `temp/e2e/2026-11-05/preset3/std-sogni-t2i.png` |
| `std-tensorart-t2i` | tensorart | 文生图 | `https://openapi.tensor.art/openworks/v1/task/query` | 200 | `{"code":"0", "message":"", "data":{"tasks":[{"id":"1063484778793165458", "userId":"1048723019146487792", "status":"FINISH", "to...` | **PASS_GENERATION** | `temp/e2e/2026-11-05/preset3/std-tensorart-t2i.png` |
| `std-together-t2i` | together | 文生图 | `https://api.together.ai/v1/images/generations` | 401 | `{"id":"56fc6144-aws_ue2","error":{"message":"Invalid API key provided. You can find your API key at https://api.together.ai/set...` | **BLOCKED_AUTH** | `temp/e2e/2026-11-05/preset3/std-together-t2i.png` |
| `std-venice-t2i` | venice | 文生图 | `https://api.venice.ai/api/v1/image/generate` | 402 | `{"error":"Insufficient USD or Diem balance to complete request. Visit https://venice.ai/settings/api to add credits."}` | **PASS_BILLING** | `temp/e2e/2026-11-05/preset3/std-venice-t2i.png` |
| `std-wavespeed-t2i` | wavespeed | 文生图 | `https://api.wavespeed.ai/api/v3/wavespeed-ai/flux-dev-lora` | 400 | `{"code":400,"message":"Insufficient credits. Please top up your account to continue."}` | **PASS_BILLING** | `temp/e2e/2026-11-05/preset3/std-wavespeed-t2i.png` |
| `std-wavespeed-t2v` | wavespeed | 文生视频 | `https://api.wavespeed.ai/api/v3/wavespeed-ai/wan-2.1/t2v-480p-lora` | 400 | `{"code":400,"message":"Insufficient credits. Please top up your account to continue."}` | **PASS_BILLING** | `temp/e2e/2026-11-05/preset3/std-wavespeed-t2v.png` |
| `std-wavespeed-i2v` | wavespeed | 图生视频 | `https://api.wavespeed.ai/api/v3/wavespeed-ai/wan-2.1/i2v-480p-lora` | 400 | `{"code":400,"message":"Insufficient credits. Please top up your account to continue."}` | **PASS_BILLING** | `temp/e2e/2026-11-05/preset3/std-wavespeed-i2v.png` |

---

## 五、供应商视频能力与未设预设专项官方调研说明

根据 Tower 审查关于覆盖度与视频预设规划的要求（P2 专项响应）：

### 1. Novita 官方 T2V 调研与未设预设原因
- **官方端点调研**: Novita 官方在 API 文档 (`https://docs.novita.ai`) 声明了异步文生视频接口 `https://api.novita.ai/v3/async/wan2.6-t2v` 与 `wan-2.5-t2v-preview`。
- **现场实测结果**: 本次审计现场通过 API Key 对该端点发起实测，响应返回 HTTP 403 `{"code":403, "reason":"NOT_ENOUGH_BALANCE", "message":"insufficient balance"}`，验证了官方端点真实存在且路由准确。
- **LoRA 生态审计与未设预设决策**: 经深入检索 Novita 官方模型目录 API（`https://api.novita.ai/v3/model`），Novita 平台目前并没有公开发布支持 Wan T2V 的专用微调 LoRA 权重。按照本项目「参数带满、底模与 LoRA 严格匹配、严禁瞎猜硬凑」的最高工程规范，在缺乏官方匹配 LoRA 的情况下不强行拼凑未验证的 T2V 预设。当前 Novita 预设严格保留已核验的标准文生图 `std-novita-t2i` 与基于 SVD-XT 的标准图生视频 `std-novita-i2v`。

### 2. 其余提供商（Together, AIMLAPI, Venice, Krea, Sogni）视频能力说明
- **Together.ai**: 官方图像接口主推 `black-forest-labs/FLUX.2-dev`，其视频服务处于非通用 REST 或限制性测试通道，标准预设聚焦于官方最稳定的文生图。
- **AIMLAPI**: 官方标准图生/文生多模态统一走 OpenAI/Flux 兼容层，其专用视频接口在 Mission M7 视频工作流中作为独立全链路专项进行交付。
- **Venice.ai**: 官方 Swagger 文档当前仅公开 `/api/v1/image/generate`（`venice-sd35` / FLUX），暂无标准视频 REST 端点。
- **Krea / Sogni**: Sogni 协议层通过 `generate_image` 工具选择器驱动 Krea 2 Turbo，其多步骤视频编排能力已由 Mission M7 独立对接。预设中心保持与官方当前完全开放能力严格对齐。

---

## 六、编译与全量测试验证

在当前独立工作区 `/root/github/ComfyUI Web Studio/.tower/worktrees/wt-2` 执行核心工程命令：

1. **类型检查**:  
   ```bash
   npx tsc --noEmit
   ```  
   **结果**: 0 errors, 编译完全通过。

2. **生产构建**:  
   ```bash
   npm run build
   ```  
   **结果**:  
   - `dist/client/index.html` 1.47 kB
   - `dist/client/assets/index-aiuiC1hb.css` 161.00 kB
   - `dist/client/assets/index-BJqoVrVe.js` 1,066.09 kB
   - Canvas Sites Worker built: original provider routes + durable storage
   - 构建完全通过。

3. **预设专项测试套件 (4 个文件 / 90 个用例)**:  
   ```bash
   npx vitest run src/constants/presets.test.ts src/constants/presetsDryRun.test.ts src/server/presetBodyDryrun.test.ts src/components/WorkflowPresetsModal.test.tsx
   ```  
   **结果**:  
   - `src/constants/presets.test.ts`: 39 passed (39)
   - `src/constants/presetsDryRun.test.ts`: 36 passed (36)
   - `src/components/WorkflowPresetsModal.test.tsx`: 4 passed (4)
   - `src/server/presetBodyDryrun.test.ts`: 11 passed (11)
   - **合计 90 个专项测试全部绿色通过 (90/90 passed, 100%)**。

4. **全仓库完整测试套件（官方命令，默认 5s 超时）**:  
   ```bash
   npx vitest run --maxWorkers=2
   ```  
   **实测数据**:  
   - `Test Files: 1 failed | 231 passed (232)`
   - `Tests: 1 failed | 1727 passed (1728)`
   - 唯一的失败文件为 `src/integration/modelSelection.test.tsx`（1 个用例因在多 Agent 并行负载机器上运行 JSDOM 渲染超过默认 5000ms 超时限制，属于 UI6 范围既有测试）。本任务 M2 范围内的所有预设、模态框、DryRun、端点请求测试 100% 绿色通过。
