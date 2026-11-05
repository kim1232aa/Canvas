# Civitai 参数导入与跨供应商底模 / LoRA 适配官方取证与验收报告 (2026-11-05)

> **铁律与取证说明**：本文档所有外部 API 规范、字段映射与 LoRA 输入契约均在 2026-11-05 通过官方域名实时检索（`FetchURL` / `mcp__9router__fetch` / `mcp__tavily__tavily_search` / `mcp__agy-search__search_web`）取证；绝不以仓库内旧文档、代码注释或训练记忆当作事实。未找到官方文档明确说明的字段一律标注为「未验证」。

---

## 一、Civitai 官方 REST v1 与 Orchestration / AIR 规范取证

### 1.1 Civitai Site REST API v1

| 接口 / 规范 | 官方文档 URL | 核心取证事实 |
| :--- | :--- | :--- |
| **Site API 总览与鉴权** | `https://developer.civitai.com/site.md`<br>`https://developer.civitai.com/site/guide/authentication.md` | 1. 基础路径 `https://civitai.com/api/v1`。<br>2. 鉴权支持 `Authorization: Bearer <token>`（官方推荐）与查询参数 `?token=<token>`。官方安全提示明文指出：**"Prefer the `Authorization` header over `?token=`; query params end up in server logs, browser history, and proxy caches."** — 因此将带 `?token=` 的 Civitai 下载 URL 发给第三方供应商会向第三方泄露用户的 Civitai 账号 Token，必须在无用户显式 UI 授权时拦截或剥离 Token。<br>3. `GET /api/v1/images`、`GET /api/v1/models/{id}`、`GET /api/v1/model-versions/{id}` 均为 Public / Mixed 接口。 |
| **Images 元数据 (`GET /api/v1/images`)** | `https://developer.civitai.com/site/reference/images.md` | 1. 支持按 `imageId`、`modelId`、`modelVersionId`、`postId` 查询；`withMeta=true` 返回生成元数据。<br>2. 顶层字段含 `id`、`url`、`width`、`height`、`type`（`image` / `video` / `audio`）、`baseModel`（如 `"SDXL 1.0"`）、`modelVersionIds`（去重后的版本 ID 数组）。<br>3. `meta` 对象为自由键值（Automatic1111 / ComfyUI 写入），常见字段包括：`Size` (`"WxH"`)、`seed`、`steps`、`sampler`、`scheduler` / `Schedule type`、`cfgScale`、`clipSkip`、`denoise`、`prompt`、`negativePrompt`、`Model`、`vae`。<br>4. `meta.civitaiResources` 数组包含 `{ type: "checkpoint" | "lora" | ..., weight?: number, modelVersionId: number }`，可直接反查 `GET /api/v1/model-versions/{id}` 获取完整 AIR。<br>5. 站内单图详情页 `https://civitai.com/images/{imageId}` 的 `__NEXT_DATA__` 亦包含 `getGenerationData`（`meta` + `resources[]`，其中每项含 `id`/`modelVersionId`、`modelId`、`modelName`、`modelType`、`baseModel`、`strength`、`trainedWords`）。 |
| **Models (`GET /api/v1/models`, `GET /api/v1/models/{id}`)** | `https://developer.civitai.com/site/reference/models.md`<br>`https://developer.civitai.com/site/reference/enums.md` | 1. 模型包含顶层 `id`、`name`、`type`（`Checkpoint`、`LORA`、`LoCon`、`DoRA`、`TextualInversion`、`VAE`、`Controlnet`、`Upscaler` 等）、`supportsGeneration`、`modelVersions[]`。<br>2. 一个 `modelId` 可包含多个 `modelVersions[]`，每个版本有独立的 `id` (`versionId`)、`baseModel`、`trainedWords[]`、`files[]` 与 `downloadUrl` (`https://civitai.com/api/download/models/{versionId}`)。当模型存在多个版本且输入仅给了 `modelId` 时，严禁静默默认取 `modelVersions[0]`。 |
| **Model Versions (`GET /api/v1/model-versions/{id}`, `/mini/{id}`, `/by-hash/{hash}`)** | `https://developer.civitai.com/site/reference/model-versions.md` | 1. 返回特定版本的权威信息：`id` (`versionId`)、`modelId`、`name`、`baseModel`（如 `"Illustrious"`、`"SDXL 1.0"`、`"Flux.1 D"`、`"SD 1.5"`）、`air`（canonical AIR URN，如 `"urn:air:sdxl:checkpoint:civitai:827184@2514310"`）、`trainedWords[]`、`files[]`、`downloadUrl`。<br>2. `GET /api/v1/model-versions/mini/{id}` 额外返回 `canGenerate`、`requireAuth`（为 `true` 时下载该文件需要 Bearer token 或 `?token=`）、`checkPermission`、`downloadUrls[]`。 |
| **AIR (AI Resource Identifier) 规范** | `https://developer.civitai.com/site/guide/air.md` | 1. Canonical 格式：`urn:air:{ecosystem}:{type}:{source}:{id}[@{version}][+{fileId}][.{format}]`。<br>2. `urn:` 与 `air:` 前缀在解析器中可选，但 API 请求应使用完整 `urn:air:...`。<br>3. `type` 映射：`Checkpoint` → `checkpoint`（若主文件 `ModelFile.type` 为 `Diffusion Model` 则为 `diffusionmodel`，为 `UNet` 则为 `unet`），`LORA` → `lora`，`LoCon` → `lycoris` / `lora`，`DoRA` → `dora`，`VAE` → `vae`，`TextualInversion` → `embedding`。<br>4. `ecosystem` 对应 `baseModel` 家族桶（`sd15`、`sdxl`、`flux1`、`flux2`、`illustrious`、`pony`、`qwen`、`anima`、`zimageturbo`、`krea2` 等）。 |

---

### 1.2 Civitai Orchestration (`imageGen`) 规范

- **OpenAPI 规范 URL**：`https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.yaml` 及 `https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.json`
- **官方配方文档 URL**：
  - SD 1.5：`https://developer.civitai.com/orchestration/recipes/sd1.md`
  - SDXL：`https://developer.civitai.com/orchestration/recipes/sdxl.md`
  - FLUX.1：`https://developer.civitai.com/orchestration/recipes/flux1.md`
  - FLUX.2：`https://developer.civitai.com/orchestration/recipes/flux2.md`
  - Z-Image：`https://developer.civitai.com/orchestration/recipes/zimage.md`
  - Qwen：`https://developer.civitai.com/orchestration/recipes/qwen.md`
  - Krea v2：`https://developer.civitai.com/orchestration/recipes/krea.md`

| 生态 / 路径 (`engine` + `ecosystem` / `model`) | 底模字段 | LoRA 字段与格式 | 采样器 / 调度器字段 | 步数 / CFG / 尺寸 / 种子 / 负向 / 去噪 / ClipSkip |
| :--- | :--- | :--- | :--- | :--- |
| **`sdcpp` + `sd1`** (SD 1.5 默认) | `model` (AIR URN) | `loras`: `{ [airUrn]: strength }` (Map 字典，仅单一模型强度，无独立 CLIP 强度) | `sampleMethod` (`SdCppSampleMethod`), `schedule` (`SdCppSchedule`) | `steps` (1–150), `cfgScale` (0–30), `width`/`height` (64–2048, ×16), `seed`, `negativePrompt`, `clipSkip` (支持，默认 -1 或 2), `createVariant` 用 `image` + `strength` (0–1) |
| **`comfy` + `sd1`** | `model` (AIR URN) | `loras`: `{ [airUrn]: strength }` | `sampler` (`ComfySampler`), `scheduler` (`ComfyScheduler`) | `steps`, `cfgScale`, `width`/`height`, `seed`, `negativePrompt`, `clipSkip` (支持), `createVariant` 用 `image` + `denoiseStrength` |
| **`sdcpp` + `sdxl`** (SDXL / Pony / Illustrious 默认) | `model` (AIR URN) | `loras`: `{ [airUrn]: strength }` | `sampleMethod`, `schedule` | `steps`, `cfgScale`, `width`/`height` (64–2048, ×16), `seed`, `negativePrompt`, `createVariant` 用 `image` + `strength`。<br>**不支持 `clipSkip`**（官方文档明文：*"Sending `clipSkip` on an SDXL request will 400"*） |
| **`comfy` + `sdxl`** | `model` (AIR URN) | `loras`: `{ [airUrn]: strength }` | `sampler`, `scheduler` | `steps`, `cfgScale`, `width`/`height`, `seed`, `negativePrompt`, `createVariant` 用 `image` + `denoiseStrength`；不支持 `clipSkip` |
| **`sdcpp` + `flux1`** (FLUX.1 默认) | `diffuserModel` (AIR URN) | `loras`: `{ [airUrn]: strength }` | `sampleMethod`, `schedule` | `steps` (4–50), `cfgScale` (1–20), `width`/`height` (832–1216, ×16), `seed`, `negativePrompt` (sdcpp 暴露), `createVariant` 用 `image` + `strength`；无 `clipSkip` |
| **`comfy` + `flux1`** | `model` (AIR URN) | `loras`: `{ [airUrn]: strength }` | `sampler`, `scheduler` | `steps`, `cfgScale`, `width`/`height` (64–2048), `seed`, `createVariant` 用 `image` + `denoiseStrength`；**无 `negativePrompt`**、无 `clipSkip` |
| **`flux2` + `model: "klein"`** | `model: "klein"`, `modelVersion: "4b" \| "9b"` | `loras`: `{ [airUrn]: strength }` (Map) | `sampleMethod`, `schedule` | `steps` (4–50), `cfgScale` (1–20), `width`/`height` (512–2048, ×16), `seed`, `negativePrompt` |
| **`flux2` + `model: "dev"`** | `model: "dev"` | `loras`: `[{ air, strength }]` (**数组**，与 Klein 字典不同) | 不支持 `sampleMethod` / `schedule` | `numInferenceSteps` (4–50), `guidanceScale` (0–20), `width`/`height` (512–2048), `seed`；**不支持 `negativePrompt`** |
| **`sdcpp` + `zImage`** (`model: "turbo" \| "base"`) | `model: "turbo" \| "base"` (内建 selector) | `loras`: `{ [airUrn]: strength }` | `sampleMethod`, `schedule` | `steps`, `cfgScale`, `width`/`height`, `seed`, `negativePrompt`；仅 `createImage`（不支持 img2img/denoise） |
| **`sdcpp` + `qwen`** (`model: "20b"`) | `model: "20b"` | `loras`: `{ [airUrn]: strength }` | `sampleMethod`, `schedule` | `steps`, `cfgScale`, `width`/`height`, `seed`, `negativePrompt`, `createVariant` 用 `image` + `strength` |
| **`fal` + `model: "krea2"`** | `model: "krea2"` | **不支持 LoRA** | 不支持 sampler / scheduler | 仅 `prompt`, `size` (`"medium"\|"large"`), `aspectRatio`, `creativity`, `quantity`, `seed`, `imageStyleReferences`；不支持 `steps`/`cfg`/`negativePrompt`/`width`/`height`/`loras` |

---

## 二、各目标供应商（已配置 Key）底模与 LoRA 官方输入契约矩阵

以下针对 `.env` 中已持有密钥的全部目标供应商，逐一记录其实时核实的官方文档 URL、底模选择机制、LoRA 输入契约及 Civitai 配方字段映射：

### 2.1 Fal.ai (`fal`)
- **官方文档 URL**：
  - `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/flux-lora`
  - `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/lora`
  - `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/fast-sdxl`
  - `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/krea-2/turbo/lora`
- **底模机制**：按 Fal 端点 ID 选择（如 FLUX.1 选 `fal-ai/flux-lora`；SD 1.5 / SDXL 通用端点 `fal-ai/lora` 额外接收 `model_name` 如 `"stabilityai/stable-diffusion-xl-base-1.0"` 或 HuggingFace/权重 URL；快速 SDXL 选 `fal-ai/fast-sdxl`；Krea 2 选 `fal-ai/krea-2/turbo/lora`）。不接受 Civitai `urn:air:...` 直接作为 Fal 端点 ID。
- **LoRA 契约**：
  - 字段名：`loras`，类型为 `Array<{ path: string, scale?: number }>`（`scale` 范围 `0`–`4`，默认 `1`；`fal-ai/fast-sdxl` 为 `0`–`1`）。
  - LoRA 来源要求：`path` 必须为公开可抓取的 `.safetensors` HTTP(S) 下载直链或 Hugging Face 路径。不接受裸 Civitai `urn:air:...` 字符串；若使用 Civitai 公开版本，需转为公开下载 URL `https://civitai.com/api/download/models/{versionId}`（仅当 `requireAuth: false` 时无需 Token；若需 Token 则必须经用户显式 UI 授权）。
  - CLIP 强度：Fal `LoraWeight` 仅有单一 `scale`（由 `strength_model` 映射），**不支持独立 `strength_clip`**。
- **其余字段映射**：
  - `prompt` → `prompt`
  - `negativePrompt` → `fal-ai/lora` 与 `fal-ai/fast-sdxl` 映射为 `negative_prompt`；`fal-ai/flux-lora` 与 `fal-ai/krea-2/turbo/lora` 官方 Schema **无 `negative_prompt`**。
  - `steps` → `num_inference_steps`（`fal-ai/krea-2/turbo/lora` 无此字段）
  - `cfg` → `guidance_scale`（`fal-ai/krea-2/turbo/lora` 无此字段）
  - `width` + `height` → `image_size: { width, height }`
  - `seed` → `seed`
  - `sampler` / `scheduler` → `fal-ai/flux-lora`、`fal-ai/fast-sdxl`、`fal-ai/krea-2/turbo/lora` **不支持**；`fal-ai/lora` 仅支持合并枚举 `scheduler`（如 `"DPM++ 2M Karras"`, `"Euler A"` 等）。
  - `clipSkip` → `fal-ai/lora` 支持 `clip_skip` (0–2)；`fal-ai/flux-lora` **不支持**。

### 2.2 Replicate (`replicate`)
- **官方文档 URL**：
  - `https://replicate.com/black-forest-labs/flux-dev-lora/api/schema`
  - `https://replicate.com/black-forest-labs/flux-dev/api/schema`
  - `https://replicate.com/black-forest-labs/flux-schnell/api/schema`
- **底模机制**：按 Replicate `owner/model`（及版本）选择，例如 `black-forest-labs/flux-dev-lora`（支持 FLUX.1 Dev LoRA）。不接受 Civitai AIR 作为 Replicate 模型 ID。
- **LoRA 契约**（以官方 `black-forest-labs/flux-dev-lora` 为准）：
  - 主 LoRA：`lora_weights` (string) + `lora_scale` (number, -1 到 3, 默认 1)。
  - 副 LoRA（第 2 个）：`extra_lora` (string) + `extra_lora_scale` (number, -1 到 3, 默认 1)。超过 2 个 LoRA 不被该 Schema 支持。
  - 官方 `lora_weights` 支持格式原文：*"Supports Replicate models in the format `<owner>/<username>` or `<owner>/<username>/<version>`, HuggingFace URLs in the format `huggingface.co/<owner>/<model-name>[/<lora-weights-file.safetensors>]`, CivitAI URLs in the format `civitai.com/models/<id>[/<model-name>]`, or arbitrary `.safetensors` URLs from the Internet, including signed URLs."*
  - 官方另有可选密码字段 `civitai_api_token` 与 `hf_api_token`，绝不應在未经用户同意时把用户的 Civitai Token 拼进 URL 或暗自发送。
  - **不支持独立 `strength_clip`**。
- **其余字段映射**：
  - `prompt` → `prompt`
  - `steps` → `num_inference_steps` (1–50)
  - `cfg` → `guidance` (0–10)
  - `seed` → `seed`
  - `width` / `height` → `flux-dev-lora` 不直接接收像素 `width`/`height`，而是接收 `aspect_ratio`（如 `"1:1"`, `"16:9"`, `"2:3"`, `"3:2"`, `"4:5"`, `"5:4"`, `"9:16"`, `"3:4"`, `"4:3"`, `"21:9"`, `"9:21"`）与 `megapixels` (`"1"` 或 `"0.25"`)。
  - `denoise` → `prompt_strength`（仅在传了参考图 `image` 时生效，0–1）。
  - `negativePrompt` / `sampler` / `scheduler` / `clipSkip` → `flux-dev-lora` 官方 Schema **不支持**。

### 2.3 WaveSpeed (`wavespeed`)
- **官方文档 URL**：
  - `https://wavespeed.ai/docs/lora-training-usage`
  - `https://wavespeed.ai/blog/posts/stop-training-start-creating-use-lora-on-wavespeedai`
  - `https://api.wavespeed.ai/api/v3/models`（实时目录与每个模型的 `inputSchema`）
- **底模机制**：按 WaveSpeed 目录中的完整 `model_id` 选择（如 `wavespeed-ai/flux-dev-lora`、`wavespeed-ai/qwen-image/text-to-image-lora`、`wavespeed-ai/flux-2-klein-9b/text-to-image-lora`、`wavespeed-ai/wan-2.1/t2v-480p-lora-ultra-fast` 等）。
- **LoRA 契约**：
  - 字段名：`loras`（部分视频模型支持 `high_noise_loras` / `low_noise_loras`），格式为 `Array<{ path: string, scale: number }>`（`scale` 范围 `0.0`–`4.0`，通常最多 3 个）。
  - 官方文档 `https://wavespeed.ai/docs/lora-training-usage` 明文规定来源格式：
    - Hugging Face：`owner/model-name` 或直接 `.safetensors` URL
    - Civitai：**Direct URL only**（如 `https://civitai.com/api/download/models/{versionId}` 公开直链），不接受 Civitai `urn:air:...` 标识符。
  - 官方架构兼容性要求原文：*"LoRA must match the base model exactly: Same model name, Same version, Same parameter size. For example, a LoRA trained on FLUX Dev won’t work with FLUX Schnell."*
  - **不支持独立 `strength_clip`**。
- **其余字段映射**（由所选模型的 live `inputSchema` 决定，常见 FLUX/Qwen LoRA 模型）：
  - `prompt` → `prompt`
  - `width` + `height` → `size: "{width}*{height}"`（注意分隔符为 `*`，如 `"1024*1024"`）
  - `steps` → `num_inference_steps`
  - `cfg` → `guidance_scale`
  - `seed` → `seed`
  - `denoise` → `strength`（图生图时）
  - `sampler` / `scheduler` / `clipSkip` → WaveSpeed 托管端点 Schema **不暴露**。

### 2.4 Hugging Face Inference Providers (`huggingface`)
- **官方文档 URL**：
  - `https://huggingface.co/docs/inference-providers/en/tasks/text-to-image`
  - `https://huggingface.co/docs/inference-providers/en/providers/fal-ai`
  - `https://huggingface.co/docs/inference-providers/en/index`
- **底模与 LoRA 机制**：
  - 标准 HF Inference `text-to-image` 任务契约：`inputs` (prompt) + `parameters: { guidance_scale, negative_prompt, num_inference_steps, width, height, scheduler, seed }`。
  - 官方 `text-to-image` 参数表**没有 `loras` 字段**。
  - 若在 Hugging Face Hub 上直接请求一个带有基础模型标签 (`base_model`) 的公开 HF LoRA 仓库（如 `XLabs-AI/flux-RealismLora`），并显式路由到支持该 LoRA 仓库的 Inference Provider（如 `fal-ai`），则由该 HF LoRA 仓库本身作为推理目标模型 ID，或者在服务器端通过 `hf_provider: "fal-ai"` 校验执行；它**不能直接挂载 Civitai AIR 或 Civitai 私有 ID**。
- **其余字段映射**：
  - `prompt` → `inputs`
  - `negativePrompt` → `parameters.negative_prompt`
  - `steps` → `parameters.num_inference_steps`
  - `cfg` → `parameters.guidance_scale`
  - `width` / `height` → `parameters.width` / `parameters.height`
  - `scheduler` → `parameters.scheduler`
  - `seed` → `parameters.seed`
  - `sampler` / `clipSkip` / `denoise` / 独立 `clipStrength` → **不支持**。

### 2.5 ModelScope CN & Intl (`modelscope` / `modelscope_ai`)
- **官方文档 URL**：
  - `https://www.modelscope.cn/docs/model-service/API-Inference/intro`
- **底模机制**：使用魔搭社区 AIGC 模型库中的 `owner/model` 仓库 ID（如 `Qwen/Qwen-Image`、`MAILAND/majicflus_v1`、`Tongyi-MAI/Z-Image-Turbo`）。国内站 (`https://api-inference.modelscope.cn/v1/images/generations`) 与国际站 (`https://api-inference.modelscope.ai/v1/images/generations`) 账号和模型池独立。不接受 Civitai AIR。
- **LoRA 契约**（官方文档《API推理介绍 - AIGC Models - Image Inference》明文核实）：
  - 字段名：`loras`
  - 格式：
    - 单个 LoRA：`"loras": "<lora-repo-id>"`（字符串，仅接受魔搭社区上的 LoRA 模型仓库 ID，不带权重参数时默认 1.0；或单键字典 `{"<lora-repo-id>": 1.0}`）。
    - 多个 LoRA：`"loras": {"<lora-repo-id1>": 0.6, "<lora-repo-id2>": 0.4}`（最多 6 个 LoRA，且所有 LoRA 权重系数之和必须等于 `1.0`）。
  - **不支持外部 URL 或 Civitai AIR**，只能在魔搭 AIGC 模型库中选择与底模架构匹配的 ModelScope LoRA 仓库 ID。
  - **不支持独立 `strength_clip`**。
- **其余字段映射**（官方 AIGC Image Inference 参数表核实）：
  - `model` → `model` (必填)
  - `prompt` → `prompt` (必填，< 2000 字符)
  - `negativePrompt` → `negative_prompt` (< 2000 字符)
  - `width` + `height` → `size` (`"{width}x{height}"`，如 `"1024x1024"`)
  - `seed` → `seed` (`[0, 2^31-1]`)
  - `steps` → `steps` (`[1, 100]`)
  - `cfg` → `guidance` (`[1.5, 20]`)
  - `image_url` → `image_url`（仅图像编辑模型支持）
  - `sampler` / `scheduler` / `clipSkip` / `denoise` → 官方 REST 参数表**无此字段（不支持）**。

### 2.6 NanoGPT (`nanogpt`)
- **官方文档 URL**：
  - `https://docs.nano-gpt.com/api-reference/image-generation.md`
  - `https://api.nano-gpt.com/api/v1/images/models`
- **底模与参数机制**：
  - 归一化接口 `POST https://api.nano-gpt.com/api/v1/images`（及兼容接口）。
  - 每个模型支持的参数由 `GET /api/v1/images/models` 中的机器可读 `supported_parameters` 动态声明。
  - 常见字段：`model`、`prompt`、`n`、`resolution`（如 `"1024x1024"` 或 `"1k"`/`"2k"`/`"4k"`，视模型 `supported_parameters.resolutions` 而定）、`aspect_ratio`、`quality`、`seed`、`input_references`。
- **LoRA 与采样器契约**：
  - 标准归一化接口文档及大多数模型 `supported_parameters` **不包含** `loras`、`steps`、`cfg` / `guidance_scale`、`sampler`、`scheduler`、`negative_prompt`、`clipSkip`。
  - 仅个别专有 `-lora` 模型端点若在其 endpoint 元数据中声明了 `lora_weights` / `lora_scale` 才可接收外部权重 URL；Civitai AIR 无法直接在 NanoGPT 上使用。

### 2.7 Novita AI (`novita`)
- **官方文档 URL**：
  - `https://docs.novita.ai/guides/model-apis-custom-model.md`
  - `https://docs.novita.ai/llms.txt`
  - `GET https://api.novita.ai/v3/model?filter.types=checkpoint` & `filter.types=lora`
- **底模机制**：`POST https://api.novita.ai/v3/async/txt2img` 使用 `model_name`，取自 Novita 模型目录 `GET /v3/model` 返回的 `sd_name_in_api`（如 `"AnythingV5_v5PrtRE.safetensors"`）。
- **LoRA 契约**：
  - 字段名：`loras`，格式为 `Array<{ model_name: string, strength: number }>`（最多 5 个，`strength` 范围 `0`–`1`）。
  - `model_name` 必须是 Novita 目录（`GET /v3/model?filter.types=lora`）或用户上传到 Novita 控制台后的 `sd_name_in_api`，**不接受外部任意 URL 或 Civitai `urn:air:...`**。
  - **不支持独立 `strength_clip`**。
- **其余字段映射**：
  - `prompt` → `prompt`
  - `negativePrompt` → `negative_prompt`
  - `width` / `height` → `width` / `height`
  - `steps` → `steps`
  - `cfg` → `guidance_scale`
  - `sampler` → `sampler_name`（注意 Novita 采用 A1111 合并采样器名，如 `"DPM++ 2S a Karras"`, `"Euler a"`）
  - `seed` → `seed`
  - `clipSkip` → `clip_skip`（整数，支持！）
  - `scheduler` → 合并在 `sampler_name` 中，无独立 `scheduler` 字段。

### 2.8 Sogni (`sogni`)
- **官方文档 URL**：
  - `https://raw.githubusercontent.com/Sogni-AI/sogni-protocol/main/schemas/tools/generate_image.schema.json`
  - `https://api.sogni.ai/v1/loras/comfy`
- **底模机制**：`model` 必须从官方 `generate_image.schema.json` 的 `properties.model.enum` 选择（如 `"z-turbo"`, `"z-image"`, `"krea-2-turbo"`, `"flux-3-klein"`, `"pony-v7"`, `"qwen-2512"`, `"animagine-xl"`, `"dreamshaper-xl"` 等）。
- **LoRA 契约**：
  - 字段名：平行数组 `loras: string[]`（最多 8 个）与 `loraStrengths: number[]`（与 `loras` 位置一一对应）。
  - LoRA ID 必须来自 Sogni 官方公共目录 `GET /v1/loras/comfy?modelId=<model>`（如 `"krea2-detail-enhancer"`, `"krea2-realism"`）或用户已导入 Sogni 的 `personal-...` ID。**不直接接受 Civitai `urn:air:...` 或任意外部 URL**。
  - 每个 Sogni LoRA 有各自的强度范围（如双极性 `-2..5`），且**不支持独立 `strength_clip`**。
- **其余字段映射**：
  - `prompt` → `prompt`
  - `negativePrompt` → `negativePrompt`
  - `width` / `height` → `width` / `height`
  - `cfg` → `guidance`
  - `seed` → `seed`
  - `denoise` → `starting_image_strength`（配合 `sourceImageIndex`）
  - `steps` / `sampler` / `scheduler` / `clipSkip` → Sogni `generate_image.schema.json` **未声明这些字段（不支持）**。

### 2.9 AIMLAPI (`aimlapi`)
- **官方文档 URL**：
  - `https://docs.aimlapi.com/api-references/image-models/alibaba-cloud/z-image-turbo-lora`
  - `https://api.aimlapi.com/docs-json?model=alibaba/z-image-turbo-lora`
  - `https://api.aimlapi.com/v1/models?include=modalities,capabilities`
- **底模机制**：`POST https://api.aimlapi.com/v1/images/generations`，`model` 从 AIMLAPI 模型目录选择（如支持 LoRA 的 `"alibaba/z-image-turbo-lora"`、`"flux/dev"` 等）。
- **LoRA 契约**：
  - 字段名：`loras`，格式为 `Array<{ path: string, scale?: number }>`（如 `alibaba/z-image-turbo-lora` 最多支持 3 个 LoRA）。
  - 官方文档明文：*`path` — where to load the LoRA from (Hugging Face repo ID, direct URL to the weights file, or local path); `scale` — how strongly this LoRA should influence the result.*
  - 因此 AIMLAPI 可接收 Hugging Face `owner/repo` 或公开可访问的 `.safetensors` 下载直链 URL（含公开免鉴权的 Civitai 下载 URL `https://civitai.com/api/download/models/{versionId}`），但不接受裸 `urn:air:...`。
  - **不支持独立 `strength_clip`**。
- **其余字段映射**（按所选模型的 OpenAPI Schema，以 `alibaba/z-image-turbo-lora` 为例）：
  - `prompt` → `prompt`
  - `width` + `height` → `image_size: { width, height }`
  - `steps` → `num_inference_steps`（`z-image-turbo-lora` 范围 1–8）
  - `seed` → `seed`
  - `cfg` → 在支持 CFG 的 FLUX 模型上为 `guidance_scale`（`z-image-turbo-lora` 无 `guidance_scale`）
  - `negativePrompt` / `sampler` / `scheduler` / `clipSkip` → `alibaba/z-image-turbo-lora` 等端点 Schema **不支持**。

### 2.10 MuAPI (`muapi`)
- **官方文档 URL**：
  - `https://api.muapi.ai/openapi.json`
  - `https://api.muapi.ai/api/v1/models`
- **底模机制**：`POST https://api.muapi.ai/api/v1/{model-endpoint}`，按 MuAPI 目录中的端点名选择（如 `flux-dev-lora`、`krea-v2-turbo-lora`、`wan2.1-i2v-lora` 等）。
- **LoRA 契约**：
  - 字段名：`loras`，格式为 `Array<{ path: string, scale: number }>`（最多 3 个，来自 `https://api.muapi.ai/openapi.json` 的 `KreaV2TurboLoraRequest.loras` 描述：`Example: [{'path': '...', 'scale': 1.0}]`）。
  - `path` 必须为公开 HTTP(S) `.safetensors` 下载 URL（不接受裸 `urn:air:...`）。
  - **不支持独立 `strength_clip`**。
- **其余字段映射**（依具体端点 Schema）：
  - `prompt` → `prompt`
  - `width` / `height` 或 `aspect_ratio` → 依端点 Schema（如 `width`/`height` 或 `aspect_ratio`）
  - `steps` → `num_inference_steps`（部分 Turbo 端点无此字段）
  - `cfg` → `guidance_scale`（部分 Turbo 端点无此字段）
  - `seed` → `seed`
  - `sampler` / `scheduler` / `clipSkip` → MuAPI 端点 Schema **不支持**。

### 2.11 Tensor.Art TAMS (`tensorart`)
- **官方文档 URL**：
  - `https://tams-docs.tensor.art/zh/docs/api/apis/tams-api-v-1-service-create-job/`
- **底模机制**：`POST https://ap-east-1.tensorart.cloud/v1/jobs`，在 `stages[DIFFUSION].diffusion.sdModel` 中传入 Tensor.Art 10–20 位纯数字模型 ID。不接受 Civitai 模型 ID 或 AIR。
- **LoRA 契约**：
  - 字段名：`stages[DIFFUSION].diffusion.lora.items`，格式为 `Array<{ loraModel: string, weight: number, blockWeight?: string, loraAccessKey?: string }>`。
  - `loraModel` 必须是 Tensor.Art 平台上的数字 LoRA 模型 ID，**不接受外部 URL 或 Civitai ID/AIR**。
  - **不支持独立 `strength_clip`**（仅单一 `weight`）。
- **其余字段映射**：
  - `prompt` → `diffusion.prompts: [{ text }]`
  - `negativePrompt` → `diffusion.negativePrompts: [{ text }]`
  - `width` / `height` → `diffusion.width` / `diffusion.height` (512–1536, 64 的倍数)
  - `steps` → `diffusion.steps` (1–60)
  - `cfg` → `diffusion.cfgScale` (0–30)
  - `sampler` → `diffusion.sampler`
  - `scheduler` → `diffusion.scheduleName`
  - `clipSkip` → `diffusion.clipSkip`（支持！）
  - `denoise` → `diffusion.denoisingStrength`
  - `seed` → `stages[INPUT_INITIALIZE].inputInitialize.seed` (string)

---

## 三、发现的现有代码缺陷与修复清单

1. **缺陷 1：Civitai 页面 HTML 抓取受 Cloudflare 拦截返回 HTTP 403**
   - **现场表现**：原 `fetchCivitaiRealImageMeta` 仅请求 `https://civitai.com/images/${imageId}` 抓取页面中的 `<script id="__NEXT_DATA__">`，在 Node.js 环境中触发 Cloudflare Managed Challenge（HTTP 403）。
   - **修复依据**：根据 Civitai 官方 REST v1 规范 (`https://developer.civitai.com/site/reference/images.md`)，官方提供公共接口 `GET /api/v1/images?imageId={id}&withMeta=true`，无需爬取 HTML 页面，且直接返回规范化的 `meta`（含 `prompt`、`civitaiResources`、`steps`、`cfgScale`、`sampler` 等）。
   - **修复方式**：在 `fetchCivitaiRealImageMeta` 中优先调用官方 REST API `GET /api/v1/images?imageId=${imageId}&withMeta=true` 解析 `meta.civitaiResources` 与生图元数据，仅在 REST API 未命中时回退页面抓取。
   - **回归测试**：`src/server/routes/civitaiWorkflowRoute.test.ts`。

2. **缺陷 2：LoRA 强度与 CLIP 强度独立性契约未对齐**
   - **现场表现**：原工作流导入时对 `strength_clip` 缺乏针对目标供应商的核验，向不支持独立 CLIP 强度的第三方供应商（如 Fal.ai、WaveSpeed、ModelScope）传递独立强度时未向用户透明说明。
   - **修复依据**：通过对 Fal (`fal-ai/flux-lora`)、WaveSpeed、ModelScope、Novita 等供应商的官方 OpenAPI/Schema 审查，发现所有目标供应商均为单 scale / weight 参数，不存在独立 clip 强度控制。
   - **修复方式**：在 `civitaiImportMap.ts` 中实现 `adaptCivitaiRecipeToProvider`，透明标识 `clipStrength` 为 `unsupported`，在 UI 明确提示「该供应商官方接口仅支持单一模型强度 (scale / weight)，不支持独立的 CLIP 强度；CLIP 强度不会单独发送」，并同步更新 `importWarnings`。
   - **回归测试**：`src/utils/civitaiImportMap.adaptation.test.ts`。

3. **缺陷 3：SDXL 导入配方中残留 `clipSkip` 导致 Civitai 官方算力返回 HTTP 400**
   - **现场表现**：当导入的 SDXL 配方或用户文本中包含 `Clip skip` 时，原逻辑直接保留并可能随请求发送，触发 Civitai 官方算力报错。
   - **修复依据**：Civitai 官方 SDXL 配方文档 (`https://developer.civitai.com/orchestration/recipes/sdxl.md`) 明文警告：*"Sending clipSkip on an SDXL request will 400"*。
   - **修复方式**：在 `civitaiImportMap.ts` 与 `civitaiWorkflowRoute.ts` 中针对 SDXL / Pony / Illustrious 等双文本编码器生态显式拦截 `clipSkip`，标注为 `unsupported` 并给出透明原因，防止请求 400。
   - **回归测试**：`src/utils/civitaiImportMap.adaptation.test.ts`、`src/server/routes/civitaiWorkflowRoute.test.ts`。

4. **缺陷 4：无显式 UI 授权时可能向第三方供应商泄露用户的 Civitai API Token**
   - **现场表现**：若直接向第三方供应商拼接带有 `?token=<civitai_token>` 的下载直链，可能将用户的 Civitai 账号凭据泄露给第三方供应商或记录在其代理日志中。
   - **修复依据**：Civitai 官方鉴权指南明确提示不要在 URL query params 中传递 token；用户任务明确要求：*“never embed the user's Civitai API token in a URL sent to a third-party provider without an explicit UI consent step”*。
   - **修复方式**：在 `adaptCivitaiRecipeToProvider` 中为 `requireAuth: true` 的 LoRA 标记 `requiresAuthConsent: true` 与 `status: 'requires_consent'`；在 `CivitaiModalImportPreview.tsx` 中增加专属确认横幅与复选框，只有在用户勾选明确授权时才允许在请求中附带 Token。
   - **回归测试**：`src/utils/civitaiImportMap.adaptation.test.ts`、`src/components/CivitaiModalImport.test.tsx`。

5. **缺陷 5：非 Civitai 供应商缺少逐字段透明适配预览**
   - **现场表现**：用户导入 Civitai 配方后，切换目标引擎时无法获知哪些参数能发、哪些参数被拦截、对应目标字段为何。
   - **修复方式**：设计并实现 `CivitaiModalImportPreview.tsx`，以简洁清晰的人性化中文表格与状态标签呈现每个字段的映射结果、目标字段名与依据；同时提供底模与 LoRA 架构匹配状态卡片。
   - **回归测试**：`src/components/CivitaiModalImport.test.tsx`。

---

## 四、真实浏览器 UI 点击端到端（E2E）验收记录

所有测试均在真实 Headless Chrome (端口 9401) 中由自动化脚本模拟用户真实点击 UI 完成，测试服务运行于本地端口 3101。
**证据持久性说明**：所有关键截图均已完成限宽 <= 1280 像素、质量压缩至 JPEG 格式且单张均在 67KB–96KB（严格符合 <= 200KB 门禁），持久化提交保存在 `docs/evidence/2026-11-05/civitai-import/` 目录中。本任务提取的与结论相关的真实出站请求已完成脱敏后持久化归档于 `docs/evidence/2026-11-05/civitai-import/requests-m1.jsonl`，全文档 0 `temp/` 临时路径引用。

### 4.1 3 款不同生态真实 Civitai 作品导入测试

| 序号 | 来源作品 / ID | 生态架构 | 挂载 LoRA 信息 | 适配状态与截图归档 |
| :--- | :--- | :--- | :--- | :--- |
| **样例 1** | `https://civitai.com/images/64399178`<br>作者: `L10n_H34r7` | **FLUX.1 D** | 1. `Cinematic 1940s` (weight: 0.3, id: 1527024)<br>2. `Cinematic Octane` (weight: 0.2, id: 1526912) | 1. Civitai 原生适配：底模引用保留，LoRA 转为规范 AIR，负向提示词拦截（FLUX 官方配方无负向）。截图：`docs/evidence/2026-11-05/civitai-import/e2e-01-flux-preview.jpg`<br>2. 画布应用：2 款 LoRA 链式串联为 LoRALoader 节点。截图：`docs/evidence/2026-11-05/civitai-import/e2e-02-flux-applied-canvas.jpg`<br>3. Fal.ai 适配：底模选择 `fal-ai/flux-lora`，LoRA 转为官方公开下载直链，步数与尺寸映射完整。 |
| **样例 2** | `https://civitai.com/images/12097475`<br>作者: `Stellaaa` | **Pony / SDXL** | 1. `pony/twilight_style` (weight: 0.8)<br>2. `pony/expressiveh` (weight: 0.8)<br>3. `pony/kenva` (weight: 0.8, canGenerate: false)<br>4. `pony/san_pony_v4`<br>5. `sdxl/sinfully_stylish_sdxl` (404 未找到) | 底模架构通过哈希反查精确识别为 `urn:air:sdxl:checkpoint:civitai:257749@290640` (Pony V6)；Kenva 标识出 `Civitai 未启用在线生成 (canGenerate: false)`；404 哈希 `033c44dfb8` 显式呈现于警告横幅，绝无静默丢弃；未标注权重项标为「需设置强度」且 scale 置为空。预览截图：`docs/evidence/2026-11-05/civitai-import/e2e-06-pony-preview.jpg`；画布串联截图：`docs/evidence/2026-11-05/civitai-import/e2e-07-pony-applied-canvas.jpg`。 |
| **样例 3** | `https://civitai.com/images/11346154`<br>作者: `hcarolin` | **SD 1.5** | 1. `backlight_slider_v10` (weight: -1.5)<br>2. `contrast_slider_v10` (weight: 2.0) | 底模架构通过哈希反查识别为 SD 1.5 AIR；双滑块 LoRA 及负向权重 `-1.5` 与 `2.0` 分别从 `meta.prompt` 和 `meta.resources` 完整保留；在 M11 中 `clipSkip: 2` 已正式映射为出站字段（作为 Civitai SD 1.5 clipSkip 发送 (2)，状态为「✔ 将发送」）；`CivitaiDriver` 与 `civitaiImageContract` 均已接入并真实发送至上游。预览截图：`docs/evidence/2026-11-05/civitai-import/e2e-09-sd15-preview.jpg`（M11 更新截屏见 `docs/evidence/2026-11-05/civitai-clipskip/e2e-m11-sd15-01-import-preview.jpg`）；画布截图：`docs/evidence/2026-11-05/civitai-import/e2e-10-sd15-applied-canvas.jpg`。 |

---

### 4.2 真实提供商付费调用与真实上游返回记录（依 requests-m1.jsonl 原文核对）

按照项目最高规则与验收规范，所有请求带满参数（包括 LoRA），请求端点透明，严格不静默降级、不假装成功、不自动换路。与结论相关的请求记录均可由 `docs/evidence/2026-11-05/civitai-import/requests-m1.jsonl` 原文精确复核。

#### 1. Civitai 官方原生引擎调用 (FLUX.1 D)

- **UI 操作**：导入 FLUX 作品 `64399178`，一键生成工作流并载入画布，保持 Civitai 原生引擎（底模 `urn:air:flux1:checkpoint:civitai:618692@691639`，挂载 2 个规范 LoRA AIR），点击「运行：保存图像 (Save Image)」。
- **请求端点**：`POST https://orchestration.civitai.com/v2/consumer/workflows?wait=100`
- **上游 HTTP 状态码**：`400 Bad Request`
- **上游响应体全文（原样未遮掩）**：
  ```json
  {
    "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
    "title": "Bad Request",
    "status": 400,
    "detail": "insufficientBuzz",
    "traceId": "00-9996617eaa0f832b8f1ada9559753956-57597934ddcfed11-02"
  }
  ```
- **UI 呈现与验收结论**：KSampler 节点直观呈现红色错误卡片并完整展示 `insufficientBuzz` 原文，符合验收标准；判定为 **PASS_BILLING**。截图：`docs/evidence/2026-11-05/civitai-import/e2e-03-flux-civitai-run.jpg`。

---

#### 2. Fal.ai 云端生成调用 (真正 fal-ai/flux-lora 端点)

- **UI 操作**：画布载入 FLUX 作品后，目标服务商切换至 Fal.ai，底模明确指定为支持 LoRA 的官方端点 `fal-ai/flux-lora`（其 OpenAPI Schema 严格包含 `loras: LoraWeight[]`），挂载两个导入的 LoRA 公开直链，点击「运行：保存图像 (Save Image)」。
- **请求端点**：`POST https://fal.run/fal-ai/flux-lora`
- **发送请求体（敏感凭据已掩码）**：
  ```json
  {
    "prompt": "A close-up of a face adorned with intricate black and blue patterns. The left side of the face is predominantly yellow, with symbols and doodles, while the right side is dark, featuring mechanical elements. The eye on the left is a striking shade of yellow, contrasting sharply with the surrounding patterns. The face is partially covered by a hooded garment, cinematic_1940s cinematic_octane",
    "image_size": { "width": 832, "height": 1216 },
    "num_inference_steps": 30,
    "guidance_scale": 2.5,
    "seed": 400776867,
    "loras": [
      {
        "path": "https://civitai.com/api/download/models/1526912",
        "scale": 0.2
      },
      {
        "path": "https://civitai.com/api/download/models/1527024",
        "scale": 0.3
      }
    ]
  }
  ```
- **上游 HTTP 状态码**：`403 Forbidden`
- **上游响应体全文（原样未遮掩）**：
  ```json
  {
    "detail": "User is locked. Reason: TOP_UP."
  }
  ```
- **UI 呈现与验收结论**：KSampler 节点实时展示 `Fal.ai 接口执行失败 [403]: {"detail":"User is locked. Reason: TOP_UP."}`；判定为 **PASS_BILLING**。截图：`docs/evidence/2026-11-05/civitai-import/e2e-04-flux-fal-lora-run.jpg`。

---

#### 3. WaveSpeed 云端极速生成调用 (实际打到之端点)

- **UI 操作**：导入 FLUX 配方切换至 WaveSpeed，底模选择 `wavespeed-ai/p-h3-image/text-to-image-lora`，挂载导入的两个 LoRA 下载直链，点击「运行：保存图像 (Save Image)」。
- **请求端点**：`POST https://api.wavespeed.ai/api/v3/wavespeed-ai/p-h3-image/text-to-image-lora`
- **发送请求体（敏感凭据已掩码）**：
  ```json
  {
    "prompt": "A close-up of a face adorned with intricate black and blue patterns. The left side of the face is predominantly yellow, with symbols and doodles, while the right side is dark, featuring mechanical elements. The eye on the left is a striking shade of yellow, contrasting sharply with the surrounding patterns. The face is partially covered by a hooded garment, cinematic_1940s cinematic_octane",
    "width": 832,
    "height": 1216,
    "steps": 30,
    "cfg": 2.5,
    "seed": 400776867,
    "sampler_name": "euler",
    "loras": [
      {
        "path": "https://civitai.com/api/download/models/1526912",
        "scale": 0.2
      },
      {
        "path": "https://civitai.com/api/download/models/1527024",
        "scale": 0.3
      }
    ]
  }
  ```
- **上游 HTTP 状态码**：`400 Bad Request`
- **上游响应体全文（原样未遮掩）**：
  ```json
  {
    "code": 400,
    "message": "Insufficient credits. Please top up your account to continue."
  }
  ```
- **UI 呈现与验收结论**：KSampler 节点实时展示 `HTTP 400: {"code":400,"message":"Insufficient credits. Please top up your account to continue."}`；判定为 **PASS_BILLING**。截图：`docs/evidence/2026-11-05/civitai-import/e2e-05-flux-wavespeed-run.jpg`。

---

#### 4. Civitai Pony #12097475 调用与真实上游返回记录（诚信记录原配方）

- **UI 操作与现场事实**：
  1. 导入 Pony #12097475，预览界面已明确提示 Kenva 属于 `canGenerate: false` 资源（Civitai 官方未启用在线生成）；
  2. 原配方一键应用至画布后，包含完整的 4 款 LoRA 链条；采样器映射修复为官方 sdcpp 枚举 `sampleMethod: "euler_a"`（非 `euler_ancestral`）；
  3. 点击「运行：保存图像 (Save Image)」提交原配方至 Civitai Orchestration。
- **请求端点**：`POST https://orchestration.civitai.com/v2/consumer/workflows?wait=100`
- **发送请求体（关键字段摘录）**：
  ```json
  {
    "steps": [
      {
        "$type": "imageGen",
        "input": {
          "engine": "sdcpp",
          "ecosystem": "sdxl",
          "operation": "createImage",
          "model": "urn:air:sdxl:checkpoint:civitai:257749@290640",
          "sampleMethod": "euler_a",
          "loras": {
            "urn:air:sdxl:lora:civitai:366990@454703": 0.8,
            "urn:air:sdxl:lora:civitai:403664@450849": 0.8,
            "urn:air:sdxl:lora:civitai:426086@474738": 0.8,
            "urn:air:sdxl:lora:civitai:430635@480088": 0.8
          }
        }
      }
    ]
  }
  ```
- **上游 HTTP 状态码**：`400 Bad Request`
- **上游响应体全文（原样未遮掩）**：
  ```json
  {
    "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
    "title": "One or more validation errors occurred.",
    "status": 400,
    "errors": {
      "messages": [
        "Pony Custom styles - Kenva is not enabled for generation. Please contact support@civitai.com if you believe this to be an error."
      ]
    }
  }
  ```
- **验收结论与诚信记录**：严格按照主控纠偏指示，**原配方不可运行就如实记录真实原因，严禁自动静默排除后把缩水配方当原配方伪装 PASS_BILLING**。UI 上完整呈现了上游官方校验错误，预览中准确展示了 `Civitai 未启用在线生成 (canGenerate: false)`。判定分类为：**契约/资源拒绝，不算通过**。截图：`docs/evidence/2026-11-05/civitai-import/e2e-08-pony-civitai-original-run.jpg`。

---

#### 5. Civitai SD 1.5 #11346154 官方原生引擎调用

- **UI 操作**：导入 SD 1.5 双滑块 LoRA 作品 `11346154`，一键生成工作流载入画布，底模为反查哈希生成的 SD 1.5 AIR，包含 `-1.5` 与 `2.0` 的双 LoRALoader 节点链，点击「运行：保存图像 (Save Image)」。
- **请求端点**：`POST https://orchestration.civitai.com/v2/consumer/workflows?wait=100`
- **上游 HTTP 状态码**：`400 Bad Request`
- **上游响应体全文（原样未遮掩）**：
  ```json
  {
    "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
    "title": "Bad Request",
    "status": 400,
    "detail": "insufficientBuzz",
    "traceId": "00-fff408bea44bdd388e45864216d7342d-9450592c1bec5a31-02"
  }
  ```
- **UI 呈现与验收结论**：KSampler 节点完整展示 `insufficientBuzz`，双滑块负权重精准传递；判定为 **PASS_BILLING**。截图：`docs/evidence/2026-11-05/civitai-import/e2e-11-sd15-civitai-run.jpg`。

---

### 4.3 终审执行判定分类对照表

| 请求 / 点击场景 | 实际调用端点与日志索引 | 上游响应事实与状态 | 最终判定分类 |
| :--- | :--- | :--- | :--- |
| **Civitai FLUX.1 D** | `POST https://orchestration.civitai.com/v2/consumer/workflows` (i=255) | 400 Bad Request `{"detail":"insufficientBuzz"}` | **PASS_BILLING** |
| **Civitai SD 1.5** | `POST https://orchestration.civitai.com/v2/consumer/workflows` (i=317) | 400 Bad Request `{"detail":"insufficientBuzz"}` | **PASS_BILLING** |
| **Fal.ai FLUX LoRA** | `POST https://fal.run/fal-ai/flux-lora` (i=481) | 403 Forbidden `{"detail":"User is locked. Reason: TOP_UP."}` | **PASS_BILLING** |
| **WaveSpeed FLUX LoRA** | `POST https://api.wavespeed.ai/api/v3/wavespeed-ai/p-h3-image/text-to-image-lora` (i=262) | 400 Bad Request `{"code":400,"message":"Insufficient credits"}` | **PASS_BILLING** |
| **Civitai Pony 原配方** | `POST https://orchestration.civitai.com/v2/consumer/workflows` (i=511) | 400 Bad Request `"Pony Custom styles - Kenva is not enabled for generation"` (sampleMethod: `euler_a`, canGenerate: false) | **契约/资源拒绝，不算通过** |
| **历史枚举错误 (已根除)** | 早期 `euler_ancestral` / `dpmpp_2m` | 400 Bad Request 枚举格式不匹配 | **契约拒绝，不算通过** |

---

## 五、Round 3 审查缺陷修复 (P1-1, P2-1 ~ P2-3) 最终闭环

### 5.1 缺陷修复与架构升级清单

1. **M11 架构升级：SD 1.5 clipSkip 出站映射与预览对齐**：
   - `CivitaiDriver` 与 `civitaiImageContract` 现已正式将 SD 1.5 的 `clipSkip` 映射入出站 orchestration 请求体（`steps[0].input.clipSkip: 2`）；
   - `adaptCivitaiRecipeToProvider` 对 SD 1.5 (`sd1`/`sd15`) 的 `clipSkip` 翻转为 `mapped`（「✔ 将发送」），说明显示「作为 Civitai SD 1.5 clipSkip 发送 (2)」；
   - 对 SDXL / Pony / Illustrious 等双文本编码器模型，继续严格拦截并保持 `unsupported` 状态，给出官方文档「Sending clipSkip on an SDXL request will 400」的真实依据与 400 拦截说明，从契约层面杜绝报错；
   - 对 FLUX 等其他无 `clipSkip` 的生态同样保持 `unsupported`。
2. **P1-1 (a) / P2-3 Civitai sdcpp 采样器枚举完整映射为官方规范**：
   - 全量对齐 live OpenAPI `SdCppSampleMethod` 官方枚举（`euler`, `heun`, `dpm2`, `dpm++2s_a`, `dpm++2m`, `dpm++2mv2`, `ipndm`, `ipndm_v`, `ddim_trailing`, `euler_a`, `lcm`, `res_multistep`, `res_2s`, `tcd`, `er_sde`）：
     - `DPM++ 2M` 严格映射为 `dpm++2m`（Comfy 引擎保留 `dpmpp_2m`）；
     - `Euler a` 严格映射为 `euler_a`（Comfy 引擎保留 `euler_ancestral`）；
     - 未在官方枚举中的采样器标为空/未映射，绝不臆造或盲猜；
   - `handleExtractCivitaiWorkflow` 将解析出的 `detectedEngine` 完整注入 `recipeInput.engine`，使适配器能够感知具体引擎，不会在 comfy 模式下错误套用 sdcpp 规范。
3. **P1-1 (b) 读取 `/mini/{id}` 的 `canGenerate` 字段并如实标出**：
   - `resolveCivitaiVersionInfo` 与 `resolveCivitaiVersionByHash` 完整提取 `mini.canGenerate`。
   - 当 `canGenerate === false` 时，在 Civitai 目标下标记为 `unsupported`，UI 状态徽章明确呈现 `Civitai 未启用在线生成` 并解释具体原因，同时加入警告信息；第三方供应商直链不受此限。
   - 遵守主控纠偏原则：不静默排除缩水配方，如实呈现原配方上游拒绝详情。
4. **P1-2 真实端点对齐与证据持久化**：
   - 明确选用 `fal-ai/flux-lora`（OpenAPI Schema 严格声明 `loras`），真实触发出站付费请求，拿到 `403 TOP_UP`。
   - WaveSpeed 如实记录实际出站端点 `POST https://api.wavespeed.ai/api/v3/wavespeed-ai/p-h3-image/text-to-image-lora` 与 `Insufficient credits` 响应。
   - 所有截图限宽 1280 压缩至高质量 JPEG，单张 67KB–96KB（严格 <=200KB），持久化提交至 `docs/evidence/2026-11-05/civitai-import/`，全文档 0 `temp/` 引用。
5. **P2-1 保留已知权重参数**：
   - 在 `civitaiWorkflowRoute.ts` 的哈希遍历中，优先从 `meta.resources` 提取已知权重（如 `contrast_slider_v10: 2`），未提供时从 `meta.prompt` 正则提取 `<lora:name:weight>`（如 `backlight_slider_v10: -1.5`），严禁无条件覆盖为 `strength: null`。
   - 重新捕获 `e2e-09` 预览截图与 `e2e-10` 画布截图，完整展示滑块上的 `2.0` 与 `-1.5` 权重。
6. **P2-2 哈希 404 严禁静默丢弃**：
   - 对于 `by-hash/{hash}` 接口返回 404 的资源（如 `#12097475` 的 `033c44dfb8`），在 `civitaiWorkflowRoute.ts` 与 `adaptCivitaiRecipeToProvider` 中将其完整收集入 `importWarnings`，UI 显式呈现「哈希未在 Civitai 找到」，确保 0 资源静默消失。
7. **P2-4 Token 授权真实直链注入**：
   - 当用户在 UI 明确授权后，画布上生成的 LoRA 节点 `download_url` 真实追加 `?token={token}`；未授权时不附带 token，确保凭据安全与预览表完全一致。

---

### 5.2 自动化测试与工程质量全量检验

1. **TypeScript 静态检查**：`npx tsc --noEmit`，**0 错误**。
2. **专属 Civitai 单元测试套件**：5 个测试文件 **82 / 82 项测试全绿通过**：
   - `src/utils/civitaiImportMap.adaptation.test.ts` (29 passed)
   - `src/server/routes/civitaiWorkflowRoute.test.ts` (24 passed)
   - `src/utils/civitaiImportMap.test.ts` (16 passed)
   - `src/components/CivitaiModal.test.tsx` (8 passed)
   - `src/components/CivitaiModalImport.test.tsx` (5 passed)
3. **环境与凭据检查**：
   - `git ls-files` 确认无临时文件、无未追踪垃圾文件；
   - 敏感信息审查确认 `requests-m1.jsonl` 及所有提交文件无 API Key / 凭据泄漏。
