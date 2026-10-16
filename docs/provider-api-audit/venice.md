# Venice AI — Provider API Audit

> 抓取日期：2026-10-15（Asia/Shanghai）  
> 方法：https://docs.venice.ai/llms.txt + 各 endpoint `.md`（含 OpenAPI 片段）WebFetch。  
> **Grok CLI**：401 失败（见 novita.md 说明）。无密钥写入。

## 1) 官方 docs / OpenAPI URL

| 资源 | URL |
|---|---|
| Docs index | https://docs.venice.ai/llms.txt |
| Models overview | https://docs.venice.ai/models/overview |
| Image generate | https://docs.venice.ai/api-reference/endpoint/image/generate |
| Image generations（OpenAI 兼容） | https://docs.venice.ai/api-reference/endpoint/image/generations |
| Video queue | https://docs.venice.ai/api-reference/endpoint/video/queue |
| Video retrieve | https://docs.venice.ai/api-reference/endpoint/video/retrieve |
| Video quote / complete | `/video/quote`, `/video/complete`（同 llms 索引） |
| List models | https://docs.venice.ai/api-reference/endpoint/models/list |
| Billing balance | https://docs.venice.ai/api-reference/endpoint/billing/balance |
| OpenAPI/Swagger | https://docs.venice.ai/swagger.yaml |
| API 版本标注 | OpenAPI info `version: '20261012.214344'` |

Base：`https://api.venice.ai/api/v1`

## 2) 鉴权方式

1. **API Key**：`Authorization: Bearer <key>`
2. **x402 钱包**：`SIGN-IN-WITH-X`（legacy `X-Sign-In-With-X`）；余额不足时 **HTTP 402** + top-up 说明

出处：各 endpoint 页 Authentication 段；llms.txt「Authentication Options」。

## 3) 模型目录端点

- **GET** `/api/v1/models`  
  Query `type`：`text` | `image` | `video` | `tts` | `asr` | `embedding` | `music` | `upscale` | `inpaint` | `decision` | `all` | …
- 公开可匿名调用（security 允许空 + Bearer）
- 返回每模型 `id`、`type`、`model_spec`（capabilities / constraints / pricing）
- 图像约束含 `steps.default/max`、`widthHeightDivisor`、`aspectRatios`、`resolutions` 等
- 视频约束含 `durations[]`、`resolutions[]`、`aspect_ratios[]`、`model_type`（text-to-video / image-to-video / video）、`audio` / `audio_configurable`
- 另有 `/models/traits`、`/models/compatibility_mapping`

无传统「分页 cursor」；一次 list + type 过滤。overview 页声明数百模型（含 Image Generation / Video 分类表）。

## 4) 生图 / 生视频与轮询

### 生图（同步）

- **POST** `/api/v1/image/generate`  
  成功 **200** 直接返回 `images[]`（base64）或 binary（`return_binary`）  
  **无异步 task 轮询**（与视频不同）

### 生视频（异步队列）

1. （可选）**POST** `/video/quote` 估价  
2. **POST** `/video/queue` → `queue_id`（+ 部分私有模型 `download_url`）  
3. **POST** `/video/retrieve` 用 `queue_id` 轮询直至完成（或 `/video/complete` 一次等完）

Queue 请求关键字段（OpenAPI `QueueVideoRequest`）：
- **必填**：`model`, `duration`（枚举如 `5s`/`10s`/…/`auto`/`-1`）
- 常用：`prompt`, `negative_prompt`, `aspect_ratio`, `resolution`（`480p`/`720p`/`1080p`/…）, `image_url` / `end_image_url`, reference 媒体数组, `audio`, `upscale_factor`（增强模型）等
- **`seed`：QueueVideoRequest 属性列表中未出现**（以 OpenAPI 为准；勿臆造视频 seed）
- **`fps`：无通用 fps 字段**；增强模型有 `target_fps`（16–120）

## 5) LoRA

| 项 | 官方事实 |
|---|---|
| 自定义 LoRA URL/`path` 数组 | **Image Generate OpenAPI 无 `loras[]`** |
| 相关字段 | `lora_strength`：integer **0–100**，「Only applies if the model uses additional Loras」 |
| 含义 | 仅对**已捆绑附加 LoRA 的模型**调强度；**不是**挂载任意 Civitai/HF LoRA |
| style_references | `style_references[].image` + optional `strength` 0.1–1（需模型 `supportsStyleReferences`）— **不是 LoRA 权重文件** |
| 不支持时 | 用户挂自定义 LoRA → **应拒绝**；勿静默丢弃或伪造 `loras` 进请求 |

出处：https://docs.venice.ai/api-reference/endpoint/image/generate （GenerateImageRequest）

## 6) seed / steps / cfg / size（生图）

均在 **POST /image/generate** requestBody：

| 字段 | 类型 | 范围/说明 |
|---|---|---|
| `seed` | integer | **-999999999 … 999999999**，default `0`；未提供则随机（描述） |
| `steps` | integer | default 8；**文档注明部分模型忽略 steps** |
| `cfg_scale` | number | **(0, 20]**（exclusiveMinimum 0） |
| `width` / `height` | integer | **(0, 1280]**，default 1024；**像素模型**用 |
| `aspect_ratio` | string | 部分模型（如 Qwen/Nano Banana）；Qwen 族 **拒绝 width/height** |
| `resolution` | string | 如 `1K`/`2K`/`4K`（分辨率档模型） |
| `quality` | `low`\|`medium`\|`high` | 如 gpt-image-2 |
| `variants` | 1–4 | 仅 `return_binary=false` |
| `negative_prompt` | string | maxLength 7500（模型另有 promptCharacterLimit） |

视频尺寸/时长走 `duration` + `resolution` + `aspect_ratio`（见上），**无 steps/cfg**。

## 7) 计费 / 402 / 余额

- **GET** `/api/v1/billing/balance` — DIEM/USD 余额（Bearer）
- x402：`GET /x402/balance/{wallet}`；推理响应头 `X-Balance-Remaining`
- **HTTP 402** 明确存在：
  - API Key：`INSUFFICIENT_BALANCE`
  - x402：`PAYMENT_REQUIRED` + `topUpInstructions` / `PAYMENT-REQUIRED` header
- Image/Video generate 与 queue 的 OpenAPI 均列出 402 响应

出处：image/generate、video/queue、billing/balance 文档。

## 接线核对要点

1. 图像同步、视频异步 — 勿混用轮询模型。  
2. **无通用自定义 LoRA**；只有 `lora_strength`。  
3. 视频 **不要发 seed**（除非将来 OpenAPI 新增）。  
4. 按 `/models` 的 constraints 切换 width/height vs aspect_ratio/resolution。  
5. 欠费展示按真实 **402** 正文，勿改写成成功。
