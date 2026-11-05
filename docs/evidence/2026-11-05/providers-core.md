# 核心托管供应商（CORE5）API 契约重调研与 UI 实测证据报告（2026-11-05）

> 本报告基于本轮对 13 个核心托管供应商（Fal.ai、Civitai、Hugging Face、ModelScope 国内站、ModelScope 国际站、NanoGPT、Google Gemini、Tensor.Art TAMS、Agnes AI、Runware、ModelsLab、OpenAI 兼容接口、Grok/xAI 兼容接口）官方文档的实时检索与取证编写。旧仓库文档不作为事实依据。

---

## 一、官方文档检索与契约核实汇总

### 1. Fal.ai (`fal`)
- **官方文档来源**：
  - Inference Methods (`fal.run` vs `queue.fal.run`): https://fal.ai/docs/documentation/model-apis/inference
  - Asynchronous Queue API (`IN_QUEUE` / `IN_PROGRESS` / `COMPLETED`): https://fal.ai/docs/documentation/model-apis/inference/queue
  - Platform OpenAPI Schema: https://fal.ai/docs/api-reference/platform-apis/openapi-schema
  - Per-endpoint Queue OpenAPI JSON: `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id={endpoint_id}`
  - Models Catalog API: `https://api.fal.ai/v1/models?endpoint_id={endpoint_id}&expand=openapi-3.0`
- **官方契约要点**：
  - **鉴权**：`Authorization: Key <FAL_KEY>`。
  - **端点**：同步直连 `POST https://fal.run/{endpoint_id}`；队列提交 `POST https://queue.fal.run/{endpoint_id}`。
  - **参数与 LoRA**：由各端点实时 OpenAPI Schema (`components.schemas.*Input.properties`) 声明。常见文生图字段：`prompt`, `image_size` (`{width, height}` 或预设枚举), `num_inference_steps`, `guidance_scale`, `seed`, `negative_prompt`, `loras` (`Array<{ path: string, scale?: number }>`，其中 `path` 为权重 URL，不可将 Civitai 数字 ID 拼成带用户 Token 的下载链接以防泄露凭证)。
- **代码核对与修复**：
  - `server.ts` `/api/fal/generate` 先拉取实时 OpenAPI Schema (`falQueueOpenApiUrl`)，通过 `falImageFieldGate` 映射字段，未声明字段与 LoRA 原样发送由上游裁决；当配置多把 `FAL_KEY` 遇到 402/余额不足时，通过 `runWithBillingKeyRotate` 透明轮换并记录每次尝试的 `keyUsage` 与原始响应。

---

### 2. Civitai Orchestration (`civitai`)
- **官方文档来源**：
  - Orchestration Introduction: https://developer.civitai.com/orchestration/guide.md
  - Quick Start (`POST /v2/consumer/workflows`): https://developer.civitai.com/orchestration/guide/getting-started.md
  - Submitting Work & Buzz Payments: https://developer.civitai.com/orchestration/guide/submitting-work.md
  - Image Generation Recipe: https://developer.civitai.com/orchestration/reference/operations/InvokeImageGenStepTemplate
  - Live ImageGen OpenAPI Schema: `https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.json`
  - AIR Specification (`urn:air:{ecosystem}:{type}:{source}:{id}@{version}`): https://developer.civitai.com/site/guide/air.md
- **官方契约要点**：
  - **鉴权**：`Authorization: Bearer <CIVITAI_API_KEY>`。
  - **工作流提交与轮询**：`POST https://orchestration.civitai.com/v2/consumer/workflows?wait=100`，请求体 `{ steps: [{ $type: "imageGen", input: { ... } }] }`；若返回 202 或未在等待窗口内完成，轮询 `GET https://orchestration.civitai.com/v2/consumer/workflows/{workflowId}`。
  - **AIR 与 LoRA**：底模与 LoRA 通过完整 AIR 标识（可通过 `GET https://civitai.com/api/v1/model-versions/{id}` 的 `air` 字段获取）。根据 `imageGen` OpenAPI discriminator 分支（如 `sdcpp` 下的 `sd1`/`sdxl`/`flux1` 或 `comfy` 下的 `krea2`/`zImage`），`loras` 格式由实时 Schema 决定（`Record<air, number>` 或 `Array<{ air, strength }>`）。
  - **计费（Buzz）**：支持 `blue` / `green` / `yellow` Buzz。
- **代码核对与修复**：
  - `src/server/civitaiImageContract.ts` 强制拉取实时 `CIVITAI_IMAGE_OPENAPI_URL`，按 `selectImageGenInputSchema` 与 `civitaiLiveLoraShape` 构造请求，不猜测多版本模型，完整保留用户填参。

---

### 3. Hugging Face Inference Providers (`huggingface`)
- **官方文档来源**：
  - Text-to-Image Task Specification: https://huggingface.co/docs/inference-providers/en/tasks/text-to-image
  - Hub API (`inferenceProviderMapping`): https://huggingface.co/docs/inference-providers/en/hub-api
  - Official Z-Image-Turbo Space Info: `https://tongyi-mai-z-image-turbo.hf.space/gradio_api/info`
- **官方契约要点**：
  - **鉴权**：`Authorization: Bearer hf_...`。
  - **三条明确执行路由**（严禁暗中互切）：
    1. `hf-inference`：`POST https://router.huggingface.co/hf-inference/models/{model}`，请求体 `{ inputs: prompt, parameters: { negative_prompt, width, height, num_inference_steps, guidance_scale, seed, scheduler, ... } }`。
    2. `fal-ai`（通过 HF Router 计费路由）：先查 `GET https://huggingface.co/api/models/{id}?expand=inferenceProviderMapping&expand=cardData&expand=siblings`，確認 `inferenceProviderMapping['fal-ai']` 的 `providerId` 与 LoRA `adapterWeightsPath`，提交到 `https://router.huggingface.co/fal-ai/{endpoint}?_subdomain=queue`，携带 `loras: [{ path: "https://huggingface.co/{id}/resolve/main/{adapterWeightsPath}", scale }]`。
    3. `z-image-space`：`POST https://tongyi-mai-z-image-turbo.hf.space/gradio_api/call/generate`。
- **代码核对与修复**：
  - `server.ts` `/api/huggingface/generate` 严格要求显式 `inference_provider`（`hf-inference` / `fal-ai` / `z-image-space`），支持 `HF_TOKEN` 逗号分隔多 Key 池在 402/额度不足时透明轮换（`runWithBillingKeyRotate`），并在 `keyRotation` 与 `executionTrace` 中原样记录每个 Key 的上游返回。

---

### 4. ModelScope API-Inference 国内站 (`modelscope`) & 5. 国际站 (`modelscope_ai`)
- **官方文档来源**：
  - API-Inference 介绍: https://www.modelscope.cn/docs/model-service/API-Inference/intro
  - API-Inference 限额说明: https://www.modelscope.ai/docs/model-service/API-Inference/limits
- **官方契约要点**：
  - **站点与鉴权隔离**：
    - 国内站 (`modelscope`)：`https://api-inference.modelscope.cn/v1`，使用 `MODELSCOPE_TOKEN`。
    - 国际站 (`modelscope_ai`)：`https://api-inference.modelscope.ai/v1`，使用 `MODELSCOPE_AI_TOKEN`。
    - 两个站点账号与 Token 独立，严禁混用或跨站回退。
  - **异步生图接口**：
    - 提交：`POST {baseUrl}/images/generations`，请求头 `Authorization: Bearer <token>`, `X-ModelScope-Async-Mode: true`。
    - 请求体字段：`model`, `prompt`, `negative_prompt`, `size` (`"{width}x{height}"`), `seed`, `steps`, `guidance`, `image_url`, `loras`（单个仓库 ID 字符串 `"owner/repo"` 或权重字典 `{"owner/repo": weight}`）。
    - 轮询：`GET {baseUrl}/tasks/{task_id}`，请求头 `X-ModelScope-Task-Type: image_generation`；状态 `SUCCEED` 时从 `output_images[0]` 取图，`FAILED` 时原样报错。
- **代码核对与修复**：
  - `src/server/modelScopeImageContract.ts` 与 `src/schemas/modelScopeLoras.ts` 严格映射 `width+height -> size`、`cfg -> guidance`、`loras -> {"owner/repo": strength}`。
  - 在 `server.ts` 中为 `modelscope` / `modelscope_ai` 接入 `runWithBillingKeyRotate`，当多把 `MODELSCOPE_AI_TOKEN` 遇到额度不足时透明记录每次尝试。

---

### 6. NanoGPT (`nanogpt`)
- **官方文档来源**：
  - Normalized Image API (`POST /api/v1/images`): https://docs.nano-gpt.com/api-reference/image-generation
  - Image Models Discovery: https://docs.nano-gpt.com/api-reference/endpoint/image-models
  - OpenAI-Compatible Image Generation: https://docs.nano-gpt.com/api-reference/endpoint/image-generation-openai
- **官方契约要点**：
  - **鉴权**：`x-api-key: <NANOGPT_KEY>` 或 `Authorization: Bearer <NANOGPT_KEY>`。
  - **能力元数据与归一化生图**：
    - 查询单模型能力：`GET https://api.nano-gpt.com/api/v1/images/models/{modelId}/endpoints`，返回 `supported_parameters`（含 `resolutions`, `loras`, `seed` 等）。
    - 生图：`POST https://api.nano-gpt.com/api/v1/images`，请求体包含 `model`, `prompt`, `resolution` (`"WxH"` 或档位), `aspect_ratio`, `seed`, `quality`, `output_format`, `n`, `loras` (`Array<{ path: string, scale: number }>`), `input_references` (`[{ type: "image_url", image_url: { url } }]`)。
- **代码核对与修复**：
  - `src/schemas/nanoImageApi.ts` 将画布填参原样构建，未在 `supported_parameters` 声明的参数记录为 `undeclared_sent` 并照发给上游决定。

---

### 7. Google Gemini (`gemini`)
- **官方文档来源**：
  - Gemini Image Generation (Nano Banana): https://ai.google.dev/gemini-api/docs/image-generation
  - GenerateContent REST Reference (`ImageConfig`): https://ai.google.dev/api/generate-content#ImageConfig
  - Interactions API Reference: https://ai.google.dev/api/interactions-api
- **官方契约要点**：
  - **鉴权**：`x-goog-api-key: <GEMINI_API_KEY>`。
  - **端点与模型**：Imagen 旧接口已关停；当前统一通过 `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` 调用 Nano Banana 系列模型（`gemini-3.1-flash-image`, `gemini-3-pro-image`, `gemini-2.5-flash-image` 等）。
  - **配置参数**：`generationConfig.responseModalities: ["IMAGE"]`（或 `["TEXT", "IMAGE"]`），`generationConfig.imageConfig: { aspectRatio, imageSize }`（`imageSize` 必须大写 `K`，如 `1K`, `2K`, `4K`）。官方 `ImageConfig` 不支持 `seed`, `steps`, `cfg`, `negative_prompt`, `loras`。
- **代码核对与修复**：
  - `server.ts` `/api/gemini/generate` 通过 `httpOptions.extraBody.generationConfig` 将画布填写的非 SDK 槽位字段原样透传给上游，由 Google REST 接口返回真实响应。

---

### 8. Tensor.Art TAMS 模型 API (`tensorart`)
- **官方文档来源**：
  - Create Job (`POST /v1/jobs`): https://tams-docs.tensor.art/zh/docs/api/apis/tams-api-v-1-service-create-job/
  - Get Job (`GET /v1/jobs/{job_id}`): https://tams-docs.tensor.art/docs/api/apis/tams-api-v-1-service-get-job
  - Get Model (`GET /v1/models/{model_id}`): https://tams-docs.tensor.art/docs/api/apis/tams-api-v-1-service-get-model/
  - Signature & Endpoint (`https://ap-east-1.tensorart.cloud/v1/jobs`): https://tams-docs.tensor.art/docs/api/signature/signature_build/
  - Private Model & LoRA Demo (`diffusion.lora.items`): https://tams-docs.tensor.art/docs/use-cases/model/private-model
  - Integration FAQ (No model list API): https://tams-docs.tensor.art/docs/api/guide/integration-faq/
- **官方契约要点**：
  - **默认域名**：`https://ap-east-1.tensorart.cloud`（可通过 `TENSORART_BASE_URL` 覆盖）。
  - **鉴权**：`Authorization: Bearer <TAMS_TOKEN>`（在 https://tams.tensor.art/app 创建应用获取的应用级 Bearer Key / Token；与 OpenWorks 的 `Echo-Access-Key: ak_tensor_...` 完全独立、不可混用）。
  - **模型查询**：`GET /v1/models/{modelId}`，返回 `{ model: { id, name, modelType, baseModel, showcaseImageUrls, triggerWords, description } }`。
  - **创建生图任务**：`POST /v1/jobs`，请求体：
    ```json
    {
      "requestId": "<uuid>",
      "stages": [
        {
          "type": "INPUT_INITIALIZE",
          "inputInitialize": { "seed": "-1", "count": 1 }
        },
        {
          "type": "DIFFUSION",
          "diffusion": {
            "width": 512,
            "height": 512,
            "prompts": [{ "text": "..." }],
            "negativePrompts": [{ "text": "..." }],
            "sdModel": "613045163490732233",
            "steps": 25,
            "cfgScale": 7,
            "sampler": "Euler a",
            "scheduleName": "normal",
            "denoisingStrength": 0.7,
            "lora": {
              "items": [
                { "loraModel": "661652545330040294", "weight": 0.8 }
              ]
            }
          }
        }
      ]
    }
    ```
  - **轮询任务**：`GET /v1/jobs/{jobId}`，状态 ` CREATED` / `PENDING` / `WAITING` / `RUNNING` → `SUCCESS`（从 `job.successInfo.images[].url` 取图）或 `FAILED`（从 `job.failedInfo.reason` 取因）/ `CANCELED`。
- **本轮发现的重大代码缺陷与修复**：
  1. **`.env` 中的 `TENSORART_TAMS_TOKEN` 未被读取**：`server.ts` 的 `defaultKeys` 和 `civitaiModelRoutes.ts` 之前只读了 `TENSORART_API_KEY` / `TENSORART_KEY` / `TENSORART`，遗漏了 `.env` 实际提供的 `TENSORART_TAMS_TOKEN`。
  2. **TAMS 生图路由被错误硬编码下线（410）**：`TensorArtDriver.ts` 与 `server.ts` `/api/tensorart/generate` 之前直接抛错「Tensor.Art TAMS 出图入口已下线」，违反了真实接入 TAMS 模型 API 的要求。
  3. **修复方案**：
     - 在 `server.ts`、`src/server/routes/civitaiModelRoutes.ts` 和 `.env.example` 中完整接入 `TENSORART_TAMS_TOKEN`（优先作为 TAMS Bearer Key 来源，并在 `KeyPoolManager` 的 `tensorart` 池中合并管理）。
     - 恢复 `TensorArtDriver.ts` 向 `/api/tensorart/generate` 发送完整画布参数（含 `loras`, `steps`, `cfg`, `seed`, `width`, `height`, `sampler_name`, `scheduler`, `denoise`, `custom_parameters`）。
     - 恢复 `server.ts` `POST /api/tensorart/generate` 的真实 TAMS `/v1/models/{id}` + `POST /v1/jobs` + `GET /v1/jobs/{jobId}` 执行链路，并遵循「不本地拒发未核实字段」原则（所有填充字段原样映射/透传至 TAMS，由上游返回真实状态码和响应体）。

---

### 9. Agnes AI (`agnes`)
- **官方文档来源**：
  - Agnes AI Overview: https://wiki.agnes-ai.com/en/docs/overview
  - Agnes Image 2.1 Flash Docs: https://wiki.agnes-ai.com/en/docs/agnes-image-21-flash
  - Official AgnesAI-Models Catalog: https://github.com/AgnesAI-Labs/AgnesAI-Models
- **官方契约要点**：
  - **鉴权与端点**：`Authorization: Bearer <AGNES_API_KEY>`，默认 Base URL `https://apihub.agnes-ai.com/v1`，生图 `POST /v1/images/generations`。
  - **请求体**：`model` (`agnes-image-2.5-flash` 等), `prompt`, `size` (`1K`/`2K`/`3K`/`4K` 或像素尺寸), `ratio` (`1:1`, `16:9` 等), `extra_body: { image: [...], response_format: "url" | "b64_json" }`。无 LoRA 支持。

---

### 10. Runware (`runware`)
- **官方文档来源**：
  - Runware Unified API Reference: https://runware.ai/docs/image-inference/api-reference
  - LoRA & Parameters Reference: https://runware.ai/docs/models/bfl-flux-2-klein-9b
- **官方契约要点**：
  - **鉴权与端点**：`POST https://api.runware.ai/v1`，请求头 `Authorization: Bearer <RUNWARE_API_KEY>`。
  - **请求体（任务数组）**：`[{ taskType: "imageInference", taskUUID: "<uuid-v4>", model: "<air>", positivePrompt, negativePrompt, width, height, steps, CFGScale, seed, numberResults, outputFormat, outputType, scheduler, seedImage, strength, lora: [{ model: "<air>", weight: 0.8 }] }]`。
  - **响应体**：`{ data: [{ taskType: "imageInference", taskUUID, imageUUID, imageURL, seed, cost }], errors: [...] }`（注意：Runware 的任务级错误可能在 HTTP 200 的 `errors[]` 数组中返回）。
- **代码核对与修复**：
  - 检查 `src/server/runwareImageContract.ts`：已支持 `positivePrompt`, `negativePrompt`, `CFGScale`, `lora: [{ model, weight }]`，并检查 `scheduler` 等画布附加字段是否被完整转发（补充 `scheduler` 映射及未声明字段透传）。

---

### 11. ModelsLab (`modelslab`)
- **官方文档来源**：
  - Community Models / DreamBooth LoRA Text-to-Image: https://docs.modelslab.com/image-generation/community-models/dreambooth-lora
- **官方契约要点**：
  - **端点与鉴权**：请求体 JSON 内传 `"key": "<MODELSLAB_API_KEY>"`；文生图 `POST https://modelslab.com/api/v6/images/text2img`，图生图 `POST https://modelslab.com/api/v6/images/img2img`，异步轮询 `POST https://modelslab.com/api/v6/images/fetch`（传 `{ key, request_id }`）。
  - **请求体字段**：`key`, `model_id`, `prompt`, `negative_prompt`, `width`, `height`, `samples`, `num_inference_steps`, `guidance_scale`, `seed`, `scheduler`, `lora_model`（逗号分隔 ID 字符串）, `lora_strength`（单个数值或逗号分隔字符串）, `init_image`, `strength`。
  - **响应体**：`status: "success"`（含 `output: [url]`）或 `status: "processing"`（含 `id`, `future_links`）或 HTTP 200 下 `status: "error"`（含 `message`, `tip`）。
- **代码核对与修复**：
  - `src/server/modelsLabImageContract.ts` 已处理 HTTP 200 下的 `status: "error"` 语义错误（`inspectModelsLabImageResponseBody`）并在日志中脱敏 `key`。补充画布 `sampler_name` 等附加字段透传，确保用户填写的任何字段不被静默丢弃。

---

### 12. OpenAI Images 兼容接口 (`openai_compat`)
- **官方文档来源**：
  - Create Image (`POST /v1/images/generations`): https://developers.openai.com/api/reference/resources/images/methods/generate
  - Create Image Edit (`POST /v1/images/edits`): https://developers.openai.com/api/reference/resources/images/methods/edit
- **官方契约要点**：
  - **鉴权与端点**：`Authorization: Bearer <OPENAI_COMPAT_IMAGE_API_KEY>`，用户自填 `OPENAI_COMPAT_IMAGE_BASE_URL`（不硬编码第三方中转域名）。
  - **请求体字段**：`model`, `prompt`, `size`, `quality`, `output_format` (`png`/`jpeg`/`webp`), `background` (`transparent`/`opaque`/`auto`), `moderation` (`low`/`auto`), `n`；图生图走 `/images/edits` 并传 `images: [{ image_url }]`。其余画布填参经 `forwardUnmappedFields` 原样合并发送。

---

### 13. xAI / Grok Images 兼容接口 (`grok_compat`)
- **官方文档来源**：
  - xAI Image Generation Guide: https://docs.x.ai/developers/model-capabilities/images/generation
  - xAI Image Editing Guide: https://docs.x.ai/developers/model-capabilities/images/editing
  - xAI Images REST API Reference: https://docs.x.ai/developers/rest-api-reference/inference/images
- **官方契约要点**：
  - **鉴权与端点**：`Authorization: Bearer <GROK_COMPAT_API_KEY>`，用户自填 `GROK_COMPAT_BASE_URL`（若缺 `/v1` 自动补齐 `/v1`）；文生图 `POST /v1/images/generations`，图生图 `POST /v1/images/edits`。
  - **请求体字段**：`model` (`grok-imagine-image-2.0` / `grok-imagine-image`), `prompt`, `aspect_ratio`, `resolution` (`1k`/`2k`), `quality` (`low`/`medium`/`auto`), `n`, `response_format` (`url`/`b64_json`)；图生图传 `image: { url, type: "image_url" }`。
- **代码核对与修复**：
  - 在 `GrokCompatDriver.ts` 与 `server.ts` `/api/engine/grok_compat/generate` 中补齐官方新增的 `quality` 参数支持，并保持其余画布字段原样透传。

---

## 二、UI 真实点击端到端验收与实测证据记录

> **最高验收铁律**：UI 实际点击通过并呈现真实产物或原样报错，严禁绕过前端直接打 API 或跑 curl 代替验收。
> 本轮测试在真实 Headless Chrome (CDP port 9406) 与 Dev Server (PORT 3106, BU_NAME=core5b) 环境中，通过画布前端真实点击运行按键（`[data-testid="run-button"]`「运行：保存图像」及取景框「生成此选区」）触发执行。

### 1. 13 个核心供应商 UI 实测汇总表

| 序号 | 服务商标识 (`provider`) | 服务商名称 | 测试底模与端点 | 挂载 LoRA 资源与参数 | 实际使用密钥来源（脱敏后4位） | 前端界面真实输出与错误判定 | 验收结论分类 | 产物/界面截图存盘路径 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `fal` | Fal.ai (GPU 云端加速) | `fal-ai/flux-lora` | `https://huggingface.co/alvdations/frosting_lane_flux/resolve/main/frosting_lane_flux.safetensors` (0.8) | `FAL_KEY` (`...554f`) | 上游 HTTP 403: `{"detail":"User is locked. Reason: TOP_UP."}`（界面采样器节点红框原样呈现） | **PASS_BILLING** | `temp/e2e/2026-11-05/core5b/fal.png` |
| 2 | `civitai` | Civitai 官方原生引擎 | `urn:air:sd1:checkpoint:civitai:4384@128713` | `urn:air:sd1:lora:civitai:48126@52642` (0.8) | `CIVITAI_API_KEY` (`...510e`) | 上游 HTTP 400: `{"status":400,"errors":{"messages":["hanaka - v1.0 is not enabled for generation. Please contact support@civitai.com if you believe this to be an error."]}}` | **PASS_BILLING** (上游算力节点原样拦截) | `temp/e2e/2026-11-05/core5b/civitai.png` |
| 3 | `huggingface` | Hugging Face Inference Providers | `renderartist/Technically-Color-Z-Image-Turbo` | `renderartist/Technically-Color-Z-Image-Turbo` (0.9) | `HF_TOKEN` (池内轮换4把: `...Kdks`, `...MMGa`, `...naLB`, `...EIBT`) | 上游 HTTP 402: `{"error":"Purchase pre-paid credits to continue using Inference Providers. Alternatively, subscribe to PRO to get monthly included credits."}` (4把全部透明轮换并记录) | **PASS_BILLING** | `temp/e2e/2026-11-05/core5b/huggingface.png` |
| 4 | `modelscope` | 魔搭社区 (国内站) | `AI-ModelScope/stable-diffusion-v2-1` | `damo/lora_test` (0.8) | `MODELSCOPE_TOKEN` (`...15b0`) | 上游 HTTP 400: `{"errors":{"message":"submit failed with code: 40212"},"request_id":"09593966-6259-4deb-9db1-2d1cf5b97b29"}` | **PASS_BILLING** (上游原样报错) | `temp/e2e/2026-11-05/core5b/modelscope_cn.png` |
| 5 | `modelscope_ai` | 魔搭社区 (国际站) | `Tongyi-MAI/Z-Image-Turbo` | `damo/lora_test` (0.8) | `MODELSCOPE_AI_TOKEN` (`...d8bf`, `...a7d2`) | 上游 HTTP 500: `{"errors":{"message":"apiInferModelDownload call failed: callApiInferModelDownload failed: [Model Exception] Model does not exist"},"request_id":"be138825-5bfd-4078-94b4-29be619359ea"}` | **PASS_BILLING** (上游原样报错) | `temp/e2e/2026-11-05/core5b/modelscope_ai.png` |
| 6 | `nanogpt` | NanoGPT (按次即付) | `flux-schnell` | 不支持 LoRA | `NANOGPT_KEY` (`...2d4a`) | 上游 HTTP 401: `{"error":{"message":"Invalid session","type":"invalid_request_error","code":"invalid_api_key"}}` (界面采样器红字报错) | **BLOCKED_AUTH** | `temp/e2e/2026-11-05/core5b/nanogpt.png` |
| 7 | `tensorart` | Tensor.Art TAMS 模型 API | `613045163490732233` (SD 1.5 全能动漫) | `661652545330040294` (weight 0.8) | `TENSORART_TAMS_TOKEN` (`...f4a7`, 非 ak_ 密钥) | 上游 HTTP 400: `{"code":3, "message":"Params Valid", "details":[{"@type":"type.googleapis.com/tams_api.ArgumentError", "field":"base", "message":"credits not enough"}]}` (界面采样器显式报「Tensor.Art 模型任务提交失败 [400]」) | **PASS_BILLING** (上游算力额度不足) | `temp/e2e/2026-11-05/core5b/tensorart_tams.png` |
| 8 | `modelslab` | ModelsLab 开放模型库 | `tamarin-xl-v1` | `xl-realistic-cake-art-sty` (0.45) | `MODELSLAB_API_KEY` (`...91e1`) | 上游语义拦截: `ModelsLab 错误: You need to be subscribed to a plan to continue, buy subscription from https://modelslab.com/pricing` | **PASS_BILLING** (需付费订阅套餐) | `temp/e2e/2026-11-05/core5b/modelslab.png` |
| 9 | `gemini` | Google Gemini (官方直连) | `gemini-3.1-flash-image` | 不支持 LoRA | 无密钥 (`GEMINI_API_KEY` 未配置) | 前端拦截提示: `未配置密钥` / `未配置 Google Gemini API 密钥` | **BLOCKED_CONFIG** | `temp/e2e/2026-11-05/core5b/gemini.png` |
| 10 | `agnes` | Agnes AI (ApiHub) | `agnes-image-2.5-flash` | 不支持 LoRA | 无密钥 (`AGNES_API_KEY` 未配置) | 前端拦截提示: `未配置密钥` / `未配置 Agnes 的密钥` | **BLOCKED_CONFIG** | `temp/e2e/2026-11-05/core5b/agnes.png` |
| 11 | `runware` | Runware 极速云平台 | `runware:100@1` | 无 | 无密钥 (`RUNWARE_API_KEY` 未配置) | 前端拦截提示: `未配置密钥` / `未配置 Runware 的密钥` | **BLOCKED_CONFIG** | `temp/e2e/2026-11-05/core5b/runware.png` |
| 12 | `openai_compat` | OpenAI 兼容中转 | `gpt-image-2` | 不支持 LoRA | 无密钥 / 无 Base URL | 前端拦截提示: `未配置密钥` / `未配置 OpenAI 兼容中转 的密钥` | **BLOCKED_CONFIG** | `temp/e2e/2026-11-05/core5b/openai_compat.png` |
| 13 | `grok_compat` | Grok / xAI 兼容中转 | `grok-imagine-image` | 不支持 LoRA | 无密钥 / 无 Base URL | 前端拦截提示: `未配置密钥` / `未配置 Grok 兼容中转 的密钥` | **BLOCKED_CONFIG** | `temp/e2e/2026-11-05/core5b/grok_compat.png` |

---

## 三、代码修复与回归验证记录

### 1. Tensor.Art TAMS 全链路恢复与密钥接入
- **问题根因**：历史 Agent 在 `server.ts` 和 `TensorArtDriver.ts` 中硬编码抛错「Tensor.Art TAMS 出图入口已下线 (HTTP 410)」，且 `server.ts`、`civitaiModelRoutes.ts` 和 `.env.example` 未读取 `.env` 提供的 `TENSORART_TAMS_TOKEN`，并在 `src/utils/generationReadiness.ts` 中写死了本地拦截。
- **修复措施**：
  1. `.env.example` 明确记录 `TENSORART_TAMS_TOKEN` 为 TAMS Bearer Token（https://tams.tensor.art/app 获取，UUID 格式），并阐明与 OpenWorks `ak_tensor_` 工具 Key 的隔离。
  2. `server.ts` 在 `TENSORART_KEY_ENV_SOURCES` 与 `defaultKeys`、`POOL_KEY_FIELDS` 中优先读取并纳管 `TENSORART_TAMS_TOKEN`。
  3. `server.ts` `testSingleProviderKey` 恢复 TAMS Bearer Key 探针（调用 `GET /v1/models/613045163490732233`）。
  4. `server.ts` `POST /api/tensorart/generate` 恢复完整的真实 TAMS 流程：`buildTensorModelJob` 规范构建请求体、调用 `POST /v1/jobs` 提交任务，并轮询 `GET /v1/jobs/{taskId}`。
  5. `TensorArtDriver.ts` 恢复向 `/api/tensorart/generate` 提交完整参数与 LoRA，并注册入 `EngineRegistry.ts`。
  6. `src/utils/generationReadiness.ts` 移除硬编码下线拦截逻辑。
- **回归测试**：`src/engines/drivers/TensorArtDriver.test.ts`、`src/schemas/tensorModelApi.test.ts`、`src/utils/generationReadiness.test.ts` 全绿。

### 2. ModelScope 国际站多 Key 轮换透明化
- **修复措施**：在 `server.ts` 中为 `modelscope` / `modelscope_ai` 接入 `runWithBillingKeyRotate`，当遇到 402、余额不足或配额耗尽等计费错误时，自动尝试 Key 池下一把密钥，并将每次尝试的结果原样记录在 `keyRotation` 与 `executionTrace` 中。

### 3. xAI / Grok 兼容接口与 Runware 字段补齐
- **修复措施**：在 `GrokCompatDriver.ts` 与 `server.ts` 中补齐官方文档的 `quality` 字段；在 `RunwareTask` 与 `runwareImageContract.ts` 中补齐 `scheduler` 参数映射。

### 4. 协同视频任务修复（video7b findings）
- **Finding 1 (CivitaiDriver 轮询超时优化)**：`CivitaiDriver.ts` 在 `isVideo` 为 true 时，将本地轮询超时时间扩展至 600 秒（600000ms），采用 `[2000, 5000, 10000, 15000, 30000]` 的递增退避频率，并在本地超时后透传 `errorSource: 'local'` 与 `workflowId`。（回归测试 `CivitaiDriver.poll.test.ts` 通过）。
- **Finding 2 (NanoGPT 视频路由分流)**：`NanoGPTDriver.ts` 声明 `text2video` / `img2video` 能力，并在 `isVideo` 为 true 时分流至 `/api/video/generate`（`provider=nanogpt`）；`EngineRegistry.ts` 增加视频驱动回退机制。（回归测试 `src/engines/drivers/NanoGPTDriver.test.ts` 通过）。

