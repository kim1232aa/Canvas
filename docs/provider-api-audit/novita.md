# Novita AI — Provider API Audit

> 抓取日期：2026-10-15（Asia/Shanghai）  
> 方法：官方 docs / llms.txt / llms-full.txt / OpenAPI 相关页面 WebFetch+curl；官方 Python SDK 源码核对端点。  
> **Grok CLI**：本机 `grok -m grok-4.6` 两次均 exit 1（401 Auth recovery failed），未写入任何密钥。下列结论均来自可核对的官方页面/SDK。

## 1) 官方 docs / OpenAPI URL

| 资源 | URL | 抓取结果 |
|---|---|---|
| Docs 入口 / llms | https://docs.novita.ai/llms.txt | 200 |
| 完整文档 dump | https://docs.novita.ai/llms-full.txt | 200 |
| Auth | https://docs.novita.ai/api-reference/basic-authentication | 200 |
| Error codes | https://docs.novita.ai/api-reference/basic-error-code | 200 |
| Balance | https://docs.novita.ai/api-reference/basic-get-user-balance | 200 |
| Task Result（异步轮询） | https://docs.novita.ai/api-reference/model-apis-task-result | 200 |
| Get Model（目录） | https://docs.novita.ai/api-reference/model-apis-get-model | 200 |
| V2→V3 迁移（含 txt2img LoRA/seed） | https://docs.novita.ai/guides/model-apis-v2-to-v3-migration | 200 |
| 自定义 LoRA 上传 | https://docs.novita.ai/guides/model-apis-custom-model | 200 |
| Ming Image（OpenAI images 协议） | https://docs.novita.ai/api-reference/model-apis-ming-image-txt2img | 200 |
| 用户给定页 | https://novita.ai/docs/api-reference/model-apis-txt2img | **HTTP 404**（SPA 壳，正文已下线；能力改由迁移指南+Task Result+SDK 佐证） |
| OpenAPI | 未发现统一公开 openapi.json；以 Mintlify 文档 + SDK 为准 | — |

Base URL：`https://api.novita.ai`（OpenAI 兼容：`https://api.novita.ai/openai`）。

## 2) 鉴权方式

- Header：`Authorization: Bearer {API Key}`
- 出处：https://docs.novita.ai/api-reference/basic-authentication

## 3) 模型目录端点

**GET** `https://api.novita.ai/v3/model`

Query（文档字段）：
- `filter.visibility`：`public` | `private`
- `filter` source：`civitai` | `training` | `uploading`
- `filter.types`：`checkpoint` | `lora` | `vae` | `controlnet` | `upscaler` | `textualinversion`
- `filter` SDXL 布尔、搜索 `sd_name`/`name`/`tags`
- 分页：`pagination.limit`（(0,100]）、`pagination.cursor`（下一页用响应 `pagination.next_cursor`）

返回模型含 `sd_name` / `sd_name_in_api`（调用时用）、`type`、`status`、`base_model` 等。

出处：https://docs.novita.ai/api-reference/model-apis-get-model  
另有 LLM 目录：OpenAI 兼容 List Models（见 llms.txt），与 SD/媒体目录分离。

## 4) 生图 / 生视频端点与异步轮询

### 生图（SD 异步 V3）

- **POST** `https://api.novita.ai/v3/async/txt2img`  
  Body 常用结构（V3）：`{ "extra": {...}, "request": { model_name, prompt, ..., loras, seed, ... } }`  
  （自定义 LoRA 指南示例里也有扁平字段写法，以迁移指南的 `request` 包装为准。）
- **POST** `https://api.novita.ai/v3/async/img2img`
- 返回 `task_id`，**不直接出图**。

### 生图（OpenAI images 协议 / Ming）

- **POST** `https://api.novita.ai/openai/v1/images/generations`  
  模型例：`ming-image-0.1-design`；同步式返回 `b64_json`/`url`；**文档未列 LoRA / seed 字段**。

### 生视频（官方 SDK 与 Task Result 证实存在）

官方 Python SDK（https://github.com/novitalabs/python-sdk）实打端点：
- **POST** `/v3/async/txt2video` — `async_txt2video` / `txt2video`
- **POST** `/v3/async/img2video` — `async_img2video` / `img2video`（示例模型 `SVD-XT`）

参数线索（SDK 签名，非 Mintlify 独立页；部分专页 2026-10-15 抓取 404）：
- txt2video：`model_name`, `height`, `width`, `steps`, `prompts[]`（含 `prompt`+`frames`）, `guidance_scale`, `seed`, `negative_prompt`, **`loras`**, `embeddings`, `clip_skip`, `response_video_type`（如 `mp4`）
- img2video：`image`, `model_name`, `steps`, `frames_num`, `frames_per_second`（默认 6）, `seed`, resize mode, `motion_bucket_id`, `cond_aug`, `enable_frame_interpolation`

Changelog（llms-full）仍提及 Wan / Seedance / Kling 等视频产品名与下线计划；但 **`model-apis-wan2.6-t2v` / `wan2.7-i2v` 等独立文档 URL 在 2026-10-15 返回 404**，接线时以 Task Result + 实际冒烟响应为准，勿凭记忆硬编码已下线路径。

### 异步轮询（图/视频/音频共用）

- **GET** `https://api.novita.ai/v3/async/task-result?task_id={id}`
- 状态：`TASK_STATUS_QUEUED` | `TASK_STATUS_PROCESSING` | `TASK_STATUS_SUCCEED` | `TASK_STATUS_FAILED`
- 成功时：`images[]` / `videos[]`（`video_url`, `video_type`: mp4|gif）/ `audios[]`
- `task.progress_percent`：文档写明适用于 Video Generator + Text-to-Image / Image-to-Image
- `extra.seed`：回显种子（string）

出处：https://docs.novita.ai/api-reference/model-apis-task-result

## 5) LoRA

| 项 | 官方事实 |
|---|---|
| 字段形状 | `request.loras[]`：`{ "model_name": "<sd_name_in_api>", "strength": <float> }` |
| strength 范围 | 迁移指南：`[0, 1]` |
| 数量 | 旧 txt2img 文档（搜索索引/历史）写「Currently supports up to 5 LoRAs」；自定义上传限额「每用户最多 5 个上传」 |
| 名称来源 | `GET /v3/model?filter.types=lora` → 用 `sd_name_in_api` |
| 支持端点 | **txt2img / img2img（V3 async）明确支持**；SDK **txt2video 也接受 `loras`**；Ming OpenAI images **文档无 LoRA** |
| 不支持时 | 应拒绝挂载：勿对无官方 LoRA 字段的端点静默塞 `loras`；Ming 路径勿冒充 SD LoRA |

出处：
- https://docs.novita.ai/guides/model-apis-v2-to-v3-migration  
- https://docs.novita.ai/guides/model-apis-custom-model  
- SDK `Txt2ImgV3LoRA` / `Txt2VideoLoRA` 用法

## 6) seed / steps / cfg / size

| 字段 | 位置 | 类型/范围（文档） |
|---|---|---|
| `seed` | `request.seed`（txt2img/img2img）；Task Result `extra.seed` | integer；文档写 minimum **-1**（随机）；示例常用正整数或 -1 |
| `steps` | `request.steps` | integer（示例 20–30） |
| `guidance_scale` | `request.guidance_scale`（V2 的 `cfg_scale` 已改名） | number(float32) |
| `width` / `height` | `request` | **[128, 2048]**（迁移指南） |
| `image_num` | `request.image_num` | 一次出图张数 |
| `sampler_name` | `request.sampler_name` | 字符串（如 `Euler a`, `DPM++ 2M Karras`） |

视频：SDK 暴露 `seed`、`steps`、`guidance_scale`、`frames`/`frames_num`/`frames_per_second`；**fps 字段名为 `frames_per_second`（img2video）**，不是 `fps`。

Ming images：`size` 为 `{w}x{h}` 字符串（≥1k），**无 seed/steps/cfg/LoRA**。

## 7) 计费 / 402 / 余额

- **GET** `https://api.novita.ai/openapi/v1/billing/balance/detail`  
  字段：`availableBalance`, `cashBalance`, `creditLimit`, `pendingCharges`, `outstandingInvoices`  
  单位：**1/10000 USD**（`10000` = $1.00）
- 错误码（Image/Video/Audio 表，**非 HTTP 402**）：
  - `BILLING_BALANCE_NOT_ENOUGH` → **HTTP 400**「Insufficient balance」
  - `BILLING_AUTH_FAILED` → 403
  - `BILLING_FAILED` → 500
- LLM 表另有 `NOT_ENOUGH_BALANCE` → **403**
- **未在错误码表中见到 HTTP 402**；欠费按上表状态码展示即可（PASS_BILLING）。

出处：https://docs.novita.ai/api-reference/basic-get-user-balance 、basic-error-code

## 接线核对要点（给 canvas-dev）

1. SD 出图必须走 async + task-result，禁止把单次 POST 当同步出图。  
2. LoRA 用 `model_name`+`strength`，**不是** URL/`path`+`scale`。  
3. seed=-1 合法；勿默认静默 0.8 strength。  
4. 视频至少核对 `/v3/async/txt2video` 与 `/v3/async/img2video`；新 Wan 专页 404，勿写死未证实路径。  
5. 余额单位是万分之一美元。
