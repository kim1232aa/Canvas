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

（待第二阶段代码审计与单元测试完成后补充明细）

## 四、真实浏览器 UI 点击端到端（E2E）验收记录

（待第六阶段真实浏览器点击导入与付费生图完成后补充截图路径、History ID、请求体与上游状态码）
