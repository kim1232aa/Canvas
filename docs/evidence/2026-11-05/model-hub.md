# 2026-11-05 模型中心 (Model Hub) 完整性、兼容性与官方目录检索验证报告

> **执行原则**：本项目最高准则（多用网络搜索调查、没证据不断言；严禁静默容灾与虚假成功；严禁回退兜底掩盖；严禁硬编码集成；前端真实点击运行产物为唯一验收标准；依用户最新决议「余额不足不做卡点，错误能原样透传算暂时通过 PASS_BILLING」）。

---

## 一、所有服务商官方模型列表与检索 API 详查表

本表覆盖系统集成的所有 26 个 AI 服务商，详细调查并记录了各官方接口规范、分页协议、筛选支持以及无列表接口状态：

| 服务商 ID | 服务商名称 | 官方模型列表/检索 API | 分页方式 | 支持分类/筛选 | 官方文档来源 URL | 状态声明 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `civitai` | Civitai | `GET https://civitai.com/api/v1/models` | `cursor` (游标) / `page` + `limit` (最大 100) | `types` (Checkpoint, LORA, MotionModule, Controlnet), `baseModels`, `query`, `sort` | https://developer.civitai.com/docs/api-reference/models-api | 支持实时官方目录 |
| `huggingface` | Hugging Face | `GET https://huggingface.co/api/models` | `Link` 标头 `cursor` (`nextCursor`) | `pipeline_tag` (text-to-image, text-to-video, image-to-image), `filter` (lora, diffusers), `search`, `sort`, `expand[]` | https://huggingface.co/docs/hub/api | 支持实时官方目录 |
| `modelscope` | 魔搭社区国内站 | `GET https://modelscope.cn/openapi/v1/models` | `page_number` + `page_size` | `search` (关键词/任务/架构), `sort` (downloads, likes, last_modified) | https://modelscope.cn/docs | 支持实时官方目录 |
| `modelscope_ai` | 魔搭社区国际站 | `GET https://www.modelscope.ai/openapi/v1/models` | `page_number` + `page_size` | `search`, `sort` | https://www.modelscope.ai/docs | 支持实时官方目录 |
| `fal` | Fal.ai | `GET https://api.fal.ai/v1/models` | `cursor` + `limit`, 返回 `next_cursor`, `has_more` | `q` (关键词), `category` (text-to-image, text-to-video, image-to-image), `status` | https://docs.fal.ai/api-reference/models | 端点目录可用；无公开社区 LoRA 权重库 |
| `nanogpt` | NanoGPT | `GET /image-models`, `GET /video-models` | 实时全量端点列表，网关按页切片 | 图像端点与视频端点分流 | https://nano-gpt.com/api | 端点目录可用；无社区 LoRA 权重库 |
| `gemini` | Google Gemini | `GET https://generativelanguage.googleapis.com/v1beta/models` | `pageSize` + `pageToken`, 返回 `nextPageToken` | 图像生成模型筛选 (imagen-3.0 等) | https://ai.google.dev/api/rest/v1beta/models/list | 需 API 密钥；官方模型列表 |
| `replicate` | Replicate | `GET /v1/collections/{slug}` (`text-to-image`, `text-to-video`, `flux-fine-tunes`) & `GET /v1/search?query=...` | `next` URL 游标分页 | 集合集合过滤与社区搜索过滤 | https://replicate.com/docs/reference/http#collections.get | 支持实时官方目录 |
| `runware` | Runware | `POST https://api.runware.ai/v1` (`taskType: "modelSearch"`) | `limit` + `offset`, 返回 `totalResults` | `search`, `category` (checkpoint / lora), `architecture` | https://docs.runware.ai | 需 API 密钥与检索词；支持 LoRA 检索 |
| `modelslab` | ModelsLab | `POST https://modelslab.com/api/v4/dreambooth/model_list` | 数组响应切片 | `model_subcategory === 'lora'` 区分 LoRA 与 Checkpoint | https://docs.modelslab.com/image-generation/community-models/model-list | 需 API 密钥；支持模型列表 |
| `sensenova` | SenseNova (商汤日日新) | `GET https://token.sensenova.cn/v1/models` | 数组响应切片 | 图像模型筛选 (`sensenova-u1.5-lite` 等) | 官方开放平台 REST API | 需 API 密钥；支持官方模型列表 |
| `openworks` | Tensor.Art OpenWorks | `GET /v1/workflow/tools` | 实时工具元数据 | 工具类别与模型描述筛选 | Tensor.Art 官方 OpenAPI | 支持实时工作流工具目录 |
| `tensorart` | Tensor.Art (TAMS) | **无模型列表 API** (官方 Integration FAQ 明确) | 无列表分页；仅支持精确模型 ID 查询 (`GET /v1/model/{model_id}`) | 仅单模型 ID / 链接解析 | https://tams-docs.tensor.art/docs/api/guide/integration-faq/ | **无列表 API，需输入 ID** |
| `sogni` | Sogni | Checkpoint: `generate_image.schema.json` `model` 枚举; LoRA: `GET /v1/loras/comfy` | 实时协议 Schema / LoRA 数组 | 图像模型端点枚举 / 官方公开 LoRA 库 | https://docs.sogni.ai/api-reference/ | 支持实时模型与 LoRA 目录 |
| `muapi` | MuAPI | `GET https://api.muapi.ai/api/v1/models` | 数组切片 | `group_of === 'image'` vs `group_of === 'video'` | https://api.muapi.ai/openapi.json | 模型目录可用；无独立 LoRA 目录 |
| `wavespeed` | WaveSpeed | `GET https://api.wavespeed.ai/api/v3/models` | 数组切片 | `category` / `type` (`video`, `image`) | https://wavespeed.ai/docs | 模型目录可用；无独立 LoRA 目录 |
| `krea` | Krea | Checkpoint/Video: `GET /openapi.json` 路径; LoRA: `GET /styles` | `limit` + `cursor` (`next_cursor`) | `/generate/image/...` vs `/generate/video/...`, styles 模型关联 | https://api.krea.ai/openapi.json | 支持实时模型与 LoRA/Style 目录 |
| `together` | Together AI | `GET https://api.together.ai/v1/models` | 数组切片 | `type: 'image'` vs `type: 'video'` | https://docs.together.ai/reference/models-1 | 模型目录可用；已下线 serverless LoRA |
| `aimlapi` | AIMLAPI | `GET https://api.aimlapi.com/v1/models?include=modalities,capabilities` | 数组切片 | `modalities.output` (image, video) | https://docs.aimlapi.com/api-reference/models/list-all-models | 模型目录可用；无独立 LoRA 目录 |
| `novita` | Novita AI | `GET https://api.novita.ai/v3/model` (`filter.types=checkpoint` / `filter.types=lora`) | `pagination.limit` + `pagination.cursor` (`pagination.next_cursor`) | `filter.types` (checkpoint, lora), `filter.visibility=public` | https://novita.ai/docs/api-reference/model-apis-get-model | 支持实时 Checkpoint 与 LoRA 目录 |
| `venice` | Venice AI | `GET https://api.venice.ai/api/v1/models?type=all` | 数组切片 | `type: 'image'` vs `type: 'video'` | https://docs.venice.ai/api-reference/endpoint/models/list | 模型目录可用；无自定义 LoRA 目录 |
| `deepinfra` | DeepInfra | `GET https://api.deepinfra.com/models/list` | 数组切片 | `type=text-to-image` | https://deepinfra.com/docs/api/models | 模型目录可用；私有 LoRA 需控制台部署 |
| `mage` | Mage | **无公开远端模型检索目录 API** | 无分页；按官方文档 model_id 枚举 | `model_id` (mango, mango-v2, mango-v3s, mango-v3, mango-v3-turbo) | https://docs.mage.space/api/models/mango | **无列表 API，需输入 ID** |
| `agnes` | Agnes AI | **无公开远端模型检索目录 API** | 无分页 | 按官方模型 ID 选用 (如 `agnes-image-2.5-flash`) | 官方服务文档 | **无列表 API，需输入 ID** |
| `openai_compat` | OpenAI 兼容中转 | **无全网统一目录** | 无分页 | 用户配置 Base URL 后的指定模型 ID | OpenAI API 规范 | **无列表 API，需输入 ID** |
| `grok_compat` | Grok 兼容中转 | **无全网统一目录** | 无分页 | 用户配置 Base URL 后的指定模型 ID | xAI API 规范 | **无列表 API，需输入 ID** |

---

## 二、官方无列表 API 服务商的专属「输入 ID 选用」状态与反硬编码规范

针对用户最高规则 **严禁硬编码集成**：
1. **彻底移除硬编码 ID 药丸**：彻底移除原 `PROVIDER_EXAMPLE_IDS` 硬编码模型 ID 药丸，防止陈旧写死数据误导用户并破坏泛化能力。
2. **专属卡片透明展示**：在模型中心展示紫色的「官方无列表 API · 需输入 ID 查询」专属交互卡片。
3. **格式说明与官方直链**：提供 `getProviderFormatHint(provider)` 函数，向用户清晰解释各平台的 ID 组织形式（如 "Tensor.Art 模型页 URL 里的纯数字模型 ID"、"Hugging Face 仓库 ID (owner/repo)" 等），并提供对应服务商官方模型页的外部直链（如 `https://tensor.art`、`https://huggingface.co/models`），引导用户直接去官方获取实时 ID。
4. **内嵌 ID 选用通道**：保留输入框与「选用此 ID」按钮，输入后直接通过真实 API 检验并挂载到画布。

实测截图凭证：[02-tensorart-tams-no-list-api.png](./model-hub/02-tensorart-tams-no-list-api.png)

---

## 三、元数据驱动的底模与 LoRA 架构兼容性校验与芯片逻辑

针对模型名称字符串猜测与跨架构挂载问题：
1. **反硬编码与反名称猜测**：
   - 彻底删除 `dreamshaper`, `meinahentai`, `juggernaut-xl` 等模型名称白名单。
   - 彻底删除 `includes('wan')` 等子串模糊判断（避免误伤 swan, wand 等无关词）。
   - 彻底废除 `bfl` 厂商前缀映射为 `flux` 的猜测。
   - 严格版本隔离：FLUX.1 (`flux-1`) 与 FLUX.2 (`flux-2`) 不兼容、不折叠；Wan 2.1 (`wan-2.1`) 与 Wan 2.2 (`wan-2.2`) 不兼容、不折叠。
2. **元数据字段来源规范**：
   - **Civitai**：官方元数据字段 `modelVersion.baseModel`（例如 `'SDXL 1.0'`, `'SD 1.5'`, `'SD 1.5 Hyper'`, `'Pony'`, `'Flux.1 D'`, `'Flux.2 D'`）。
   - **Hugging Face**：官方元数据字段 `cardData.base_model` / `tags` 中的 `base_model:`（例如 `'black-forest-labs/FLUX.1-dev'`, `'Qwen/Qwen-Image'`）。
   - **Novita**：官方元数据字段 `model.base_model`（例如 `'SD 1.5'`, `'SDXL 1.0'`）。
   - **Krea**：官方 GET /styles 响应元数据字段 `item.models`（例如 `['flux_dev']` 对应 FLUX.1，`['k1']` 对应 k1）。
   - **Runware**：官方 `modelSearch` 响应元数据字段 `item.architecture`。
   - **ModelsLab**：官方元数据字段 `item.model_category`。
3. **中立未知状态（架构未知，无法判断兼容）**：
   - 当 Checkpoint 或 LoRA 任何一方上游目录未提供明确底模架构元数据时，返回 `status: 'unknown'`。
   - 按钮显示中立文案 `挂载到所选底模`，胶囊芯片显示中立灰色标签 `架构未知，无法判断兼容`，**绝不擅自断言兼容或不兼容**。
4. **元数据匹配与跨架构拦截**：
   - 当双方元数据完备且架构一致时：显示青色/绿色芯片 `兼容 ${loraBaseModel}`，按钮为紫色渐变。
   - 当双方元数据完备但架构不一致时：
     - 显示警示色芯片 `架构不兼容 (${loraBaseModel} ≠ ${ckptBaseModel})`。
     - 按钮变更为警示色红/玫瑰色渐变，按钮文字显示 `底模架构不匹配`，悬停给出完整架构冲突警告。
5. **单元测试验证**：在 `src/components/ModelHubModal.compatibility.test.ts` 中编写 18 个测试用例，覆盖：
   - 严格元数据正规化（FLUX.1 vs FLUX.2 分离，Wan 2.1 vs Wan 2.2 分离，SDXL, SD15, Qwen, Z-Image）。
   - 杜绝模型名称白名单与子串假匹配（dreamshaper/bfl/swan/wand 返回 unknown）。
   - 元数据匹配、不匹配与缺失中立未知芯片测试。

---

## 四、UI E2E 前端真实点击验收产物（3 个服务商，纯净画布，无残留 LoRA）

依据唯一验收标准与用户最新决议（余额不足算暂时通过 PASS_BILLING）：在真实 Chrome 浏览器中通过鼠标点击完成模型选用、LoRA 挂载与付费运行，记录背后真实的元数据字段、取值、请求载荷与截屏凭据。

### 1. 服务商 1：Novita（SD 1.5 架构元数据完全匹配）
- **选取的 Checkpoint**：`V4` (`meinahentai_v4_70340.safetensors`)
  - **上游接口**：`GET https://api.novita.ai/v3/model?filter.types=checkpoint`
  - **底模元数据字段与取值**：`model.base_model: "SD 1.5"`（归一化为 `sd15`）。
- **选取的 LoRA**：`weight_slider_v2_91681`
  - **上游接口**：`GET https://api.novita.ai/v3/model?filter.types=lora`
  - **LoRA 元数据字段与取值**：`model.base_model: "SD 1.5"`（归一化为 `sd15`）。
- **兼容性芯片**：双方元数据均为 SD 1.5 架构，芯片显示 `兼容 SD 1.5`。
  - 截图凭证：[novita-chip.png](./model-hub/novita-chip.png)
- **纯净画布与真实请求日志 (temp/logs/requests-2026-11-05.jsonl)**：
  - 时间：`2026-11-05T22:22:39+09:00`
  - 请求端点：`POST https://api.novita.ai/v3/async/txt2img`
  - 请求体：载荷中仅包含唯一的 `weight_slider_v2_91681`，无任何历史残留 LoRA：
    ```json
    {
      "extra": { "response_image_type": "jpeg" },
      "request": {
        "model_name": "meinahentai_v4_70340.safetensors",
        "prompt": "...",
        "width": 1216,
        "height": 832,
        "steps": 12,
        "guidance_scale": 1,
        "seed": 1840591390,
        "loras": [
          {
            "model_name": "weight_slider_v2_91681",
            "strength": 0.8
          }
        ]
      }
    }
    ```
- **运行实测产物 (Verbatim)**：
  - 状态码：`HTTP 403`
  - 响应原文：`{"code":403, "reason":"NOT_ENOUGH_BALANCE", "message":"insufficient balance", "metadata":{}}`
  - 判定结果：**PASS_BILLING**。
  - 截图凭证：[novita-result.png](./model-hub/novita-result.png)

### 2. 服务商 2：Fal.ai 与 Hugging Face（FLUX.1 架构实测与中立未知芯片）
- **Fal.ai 架构元数据规范声明**：
  - Fal.ai 官方接口（`GET https://api.fal.ai/v1/models`）返回的是在线生成/推理端点列表（如 `fal-ai/lora`、`fal-ai/flux-lora`），官方元数据中**不包含任何模型架构或 base_model 字段**。
  - 根据「严禁名称猜测、严禁虚假断言」准则，系统严禁从端点名称子串猜测架构，Fal 卡片一律真实置 `baseModel: undefined`，在模型中心挂载按钮上真实展示中立未知芯片：`挂载到所选底模 架构未知，无法判断兼容`。
  - 截图凭证：[fal-chip.png](./model-hub/fal-chip.png)（清晰呈显 `Stable Diffusion with LoRAs`、`FLUX 3 Klein Text to Image LoRA` 等 Fal 官方端点卡片上的 `挂载到所选底模 架构未知，无法判断兼容` 灰标）。
- **Hugging Face LoRA 架构元数据匹配**：
  - 真实带有 `cardData.base_model` / `base_model:` tag 的 HF 社区 LoRA（如 `nerogar/lora` 与 `flux-loras`，元数据声明 `base_model: "black-forest-labs/FLUX.1-dev"`），在底模为 FLUX.1 时准确显示 `挂载到所选底模 兼容 black-forest-labs/FLUX.1-dev`；而跨架构 FLUX.2 LoRA（如 `FLux_Klein_9B_NSFW`）则准确呈现拦截警示芯片：`底模架构不匹配 架构不兼容 (black-forest-labs/FLUX.2-klein-base-9B ≠ FLUX.1 [dev])`。
  - 截图凭证：[hf-chip.png](./model-hub/hf-chip.png)。
- **选取的 Checkpoint**：`FLUX.1 [dev] with LoRAs` (`fal-ai/flux-lora`)
- **选取的 LoRA**：`watercolor.safetensors` (`https://huggingface.co/nerogar/lora/resolve/main/watercolor.safetensors`)
- **纯净画布与真实请求日志 (temp/logs/requests-2026-11-05.jsonl)**：
  - 时间：`2026-11-05T22:54:38+09:00`
  - 请求端点：`POST https://fal.run/fal-ai/flux-lora`
  - 请求体：载荷中仅包含唯一的 `watercolor.safetensors`，无任何历史残留 LoRA：
    ```json
    {
      "prompt": "...",
      "num_images": 1,
      "image_size": { "width": 1216, "height": 832 },
      "num_inference_steps": 12,
      "guidance_scale": 1,
      "seed": 1840591390,
      "loras": [
        {
          "path": "https://huggingface.co/nerogar/lora/resolve/main/watercolor.safetensors",
          "scale": 0.8
        }
      ]
    }
    ```
- **运行实测产物 (Verbatim)**：
  - 状态码：`HTTP 403`
  - 响应原文：`{"detail":"User is locked. Reason: TOP_UP."}`
  - 判定结果：**PASS_BILLING**。
  - 截图凭证：[fal-result.png](./model-hub/fal-result.png)

### 3. 服务商 3：Civitai（SD 1.5 架构元数据完全匹配与跨架构负向拦截）
- **选取的 Checkpoint**：`Realistic Vision V5.1 (VAE)` (`4201@130072`)
  - **上游接口**：`GET https://civitai.com/api/v1/model-versions/130072`
  - **底模元数据字段与取值**：`modelVersion.baseModel: "SD 1.5"`（归一化为 `sd15`）。
- **选取的 LoRA**：`Add More Details - Detail Enhancer / Tweaker (细节调整) LoRA` (`82098@87153`)
  - **上游接口**：`GET https://civitai.com/api/v1/model-versions/87153`
  - **LoRA 元数据字段与取值**：`modelVersion.baseModel: "SD 1.5"`（归一化为 `sd15`）。
- **兼容性芯片实测验证**：
  - **同架构匹配**：`Add More Details` (SD 1.5) 与 `Detail Tweaker LoRA` (SD 1.5) 均正确显示 `兼容 SD 1.5`。
  - **跨架构拦截**：`Detail Tweaker XL` (SDXL 1.0) 正确显示警示红标：`底模架构不匹配 架构不兼容 (SDXL 1.0 ≠ SD 1.5)`；`Not Artists Styles` (Pony) 显示 `底模架构不匹配 架构不兼容 (Pony ≠ SD 1.5)`。
  - **中立未知状态（如 Krea 等）**：Krea 芯片严格读取 `items[].models`，当未指明架构或元数据缺失时，显示中立灰标 `架构未知，无法判断兼容`，绝不虚假断言。
  - 截图凭证：[civitai-chip.png](./model-hub/civitai-chip.png)
- **纯净画布与真实请求日志 (temp/logs/requests-2026-11-05.jsonl 及 temp/extract-e2e-logs.mjs 提取)**：
  - **POST 记录 1 (23:35:10)**：
    - 时间：`2026-11-05T23:35:10+09:00`
    - 请求端点：`POST https://orchestration.civitai.com/v2/consumer/workflows?wait=100`
    - 请求体：
      ```json
      {
        "steps": [
          {
            "$type": "imageGen",
            "input": {
              "engine": "sdcpp",
              "ecosystem": "sd1",
              "operation": "createImage",
              "model": "urn:air:sd1:checkpoint:civitai:4201@130072",
              "prompt": "a tranquil zen garden in morning mist",
              "loras": {
                "urn:air:sd1:lora:civitai:82098@87153": 0.8
              }
            }
          }
        ]
      }
      ```
    - 响应原文：`{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"Bad Request","status":400,"detail":"insufficientBuzz","traceId":"00-416c953ed6ed9fe71da2a18e15a11e66-7e180bddab3e2781-02"}`
  - **POST 记录 2 (00:09:20 / 干净画布)**：
    - 时间：`2026-11-06T00:09:20+09:00`
    - 请求端点：`POST https://orchestration.civitai.com/v2/consumer/workflows?wait=100`
    - 响应原文：`{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"Bad Request","status":400,"detail":"insufficientBuzz","traceId":"00-5e1bd42ce75ad7e952e9d8aff28d49b7-b90e7202bbd70ae0-02"}`
  - **判定结果**：**PASS_BILLING**（Buzz 为 Civitai 平台官方代币，insufficientBuzz 为官方真实算力余额拒绝错误，UI 采样器节点准确呈显真实错误）。
  - **干净画布截图凭证**：[civitai-result.png](./model-hub/civitai-result.png)（画布上 Civitai 节点加载 `urn:air:sd1:checkpoint:civitai:4201@130072`，单个 LoRA 节点清晰展示标题 `LoRA: Add More Details (82098@87153)`，无任何旧的 58390 残留，采样器节点与 Toast 准确呈显真实 400 insufficientBuzz 错误）。

---

## 五、视频模型 Hub 检索与筛选实测

在模型中心切换到「视频模型」分类：
1. **全服务商聚合**：后端实时拉取包括 Civitai (MotionModule + 视频 Checkpoint)、Fal.ai (`category=text-to-video`)、NanoGPT (`GET /video-models`)、Replicate (`collections/text-to-video`)、Hugging Face (`pipeline_tag=text-to-video`)、魔搭社区、Krea (43 个视频端点)、AIMLAPI (203 个视频模型)、Venice (138 个视频模型)、WaveSpeed (499 个视频模型)、MuAPI (405 个视频模型) 等。
2. **实时数量**：在前端全部服务商下实时检索出 **462 个有效视频模型**（截图：[04-all-providers-video.png](./model-hub/04-all-providers-video.png)）。
3. **架构筛选与 Wan 2.2 彻底隔离**：
   - 修复了 `matchesArchitecture` 与 `extractModelMetadata` 中 Wan 2.2 误判为 Wan 2.1 的漏洞。
   - 点击「Wan 2.1 (视频)」底模架构筛选，实时筛选出的所有模型均为 Wan 2.1（例如 `Wan2.1-T2V-1.3B-Diffusers`, `Wan2.1_14B_VACE-GGUF` 等），**Wan 2.2 模型 0 泄露**（验证结果 `Contains any Wan 2.2: False`）。
   - 截图凭证：[05-wan-video-filtered-settled.png](./model-hub/05-wan-video-filtered-settled.png)。
4. **动作支持**：每个视频模型卡片提供「应用为视频模型」与「添加视频节点」（在画布上自动创建并连接 `AIVideoNode`），动作准确路由至对应服务商。

---

## 六、全量测试与回归验证

1. **类型检查**：`npx tsc --noEmit` -> 0 错误。
2. **生产构建**：`npm run build` -> 成功生成 client 产物与 Sites Worker（耗时 2.51s）。
3. **全量测试套件执行**（执行命令：`npx vitest run --maxWorkers=2`，使用默认 5000ms 超时）：
   - **Test Files**: 237 passed, 0 failed (共 237 个测试套件，100% 通过)
   - **Tests**: 1806 passed, 0 failed (共 1806 个测试用例，100% 通过)
   - **耗时**: 133.48s，无任何超时或失败。
