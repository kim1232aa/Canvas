# MuAPI — Provider API Audit

> 抓取日期：2026-10-15（Asia/Shanghai）  
> 方法：https://muapi.ai/docs 、https://muapi.ai/docs/authentication 、**OpenAPI** https://api.muapi.ai/openapi.json（约 2.4MB）解析。  
> **Grok CLI**：401 失败。无密钥写入。

## 1) 官方 docs / OpenAPI URL

| 资源 | URL | 结果 |
|---|---|---|
| Docs 首页 | https://muapi.ai/docs | 200 |
| Authentication | https://muapi.ai/docs/authentication | 200 |
| OpenAPI 3.1 | https://api.muapi.ai/openapi.json | 200 |
| Server | `https://api.muapi.ai` | Production |

OpenAPI info 摘要：统一生成媒体 API；`POST /api/v1/{model-endpoint}` → `request_id`；轮询 `GET /predictions/{id}/result`（完整路径见下）。

## 2) 鉴权方式

- 主方式：Header **`x-api-key: {KEY}`**（文档 curl/Python 示例）
- 亦接受 `Authorization: Bearer`（OpenAPI 多处 optional header；OAuth access_token「exactly like an API key」）
- OAuth2 `client_credentials`：`POST /oauth/token`，token 1h；scopes 含 `generate:write` / `generate:read` / `account:read` 等
- Sandbox / Production keys：Sandbox 返回 mock、不计费

出处：https://muapi.ai/docs/authentication ；openapi info.Auth

## 3) 模型目录端点

- **GET** `/api/v1/models` — 公开目录：name、`endpoint_url`、description、category、cost、`cost_strategy`  
  Query：`category`（如 `Text to Image` / `Text to Video` / `Image to Video`…）、`family`（flux/veo3/kling…）等  
- 另有 `/api/v1/make/models`、`/openai/v1/models`、`/v1/models`、`/anthropic/v1/models`  
- Dashboard：`/app/get_homepage_models`、`/app/get_studio_models`  
- 动态估价：`POST /api/v1/models/{name}/estimate-cost`（openapi 描述）  
- LoRA 浏览（Dashboard）：`/app/lora-models-data?page=&q=&lora_type=`

无统一「一页 cursor」生图目录以外，以 **GET /api/v1/models** 为权威列表。

## 4) 生图 / 生视频与异步轮询

### 约定（OpenAPI info）

- **全部生成异步**：`POST https://api.muapi.ai/api/v1/{endpoint}` → `{ "request_id": "…" }`
- 轮询：**GET** `/api/v1/predictions/{id}/result`  
  状态：`queued` | `pending` | `processing` | `completed` | `failed` | `cancelled`
- 可选 query `?webhook=` 推送
- 取消：Dashboard `POST /app/cancel_prediction/{request_id}`

### 生图（示例端点，非穷尽）

- `/api/v1/flux_dev_lora_image`、`/api/v1/krea-v2-turbo-lora`
- `/api/v1/flux-2-klein-4b-text-to-image-lora`、`…-9b-…`
- `/api/v1/gpt-image-2-text-to-image`、`/api/v1/grok-imagine-text-to-image` 等  
按目录 `endpoint_url` 动态配置，**禁止硬编码一家专用字段到驱动核心**。

### 生视频（OpenAPI 中大量 t2v/i2v）

示例路径（解析自 openapi `paths`，≥100+）：
- `/api/v1/flux-3-text-to-video`、`/api/v1/flux-3-image-to-video`
- `/api/v1/grok-imagine-text-to-video`、`…-image-to-video`
- `/api/v1/kling-o1-text-to-video`、`…-image-to-video`
- `/api/v1/happy-horse-1-text-to-video`、Wan LoRA 视频 schema：`WanLoRAT2VRequest` / `WanLoRAI2VRequest`  
  字段例：`duration` ∈ {5,10}，`resolution` ∈ {480p,720p}，`aspect_ratio`，`lora_list`，**无统一 fps 字段**（以各 schema 为准）

## 5) LoRA

共享 schema **`LoraItem`**（components）：

```json
{ "path": "<string>", "scale": <number 0..4> }
```

（`path`+`scale` 均 required）

常见挂载字段名（因模型而异）：
- `loras`：array（如 `KreaV2TurboLoraRequest`、`ZImageTurboLoraRequest`）— 描述「maximum 3」，例 `{path, scale}`
- `lora_list`：array of `LoraItem`（Flux2 Klein T2I/Edit、SDXL、Wan LoRA T2V/I2V）
- 单 LoRA：`lora_url` + `lora_weight` 0..4（Flux1DevStyleLoraInference）

**支持**：仅文档/OpenAPI 声明了上述字段的 endpoint。  
**不支持**：目录里无 LoRA 字段的模型 → **应拒绝挂载**，禁止塞空 `loras` 或静默剥离。

## 6) seed / steps / cfg / size

- OpenAPI 中 **≥69 个 Request schema 含 `seed`**；常见描述：`Random seed (-1 for random)`，default `-1`（如 ZImageTurboLora、QwenImageT2ILora）
- **steps / guidance(cfg)**：多数现代端点用 `aspect_ratio` + `resolution` 或 width/height，**不暴露 classic SD steps/cfg**；SDXL LoRA schema 有 `width`/`height` 256–1536 default 1024
- Krea V2 Turbo LoRA：`aspect_ratio` 枚举、`resolution` `1k`|`2k`、`strength` 0–1（i2i）、`seed`、`loras` max 3
- Wan LoRA 视频：`duration` 5|10，`resolution` 480p|720p — **无 seed 字段于 WanLoRAT2VRequest**（以 schema 为准）
- Gemini Omni 视频等：`duration` 枚举秒、`aspect_ratio`、`resolution`；部分含 seed

**接线**：按每个 `endpoint_url` 对应 schema 动态映射；禁止全局假定都有 steps/cfg。

## 7) 计费 / 402 / 余额

- **GET** `/api/v1/account/balance` — 「Return the credit balance for the authenticated account.」
- OpenAPI info：`Costs are debited from the wallet on completion`
- 响应头线索：`X-MuAPI-Cost-USD`；body `cost.amount_usd`
- Sandbox key：`is_test` mock、不计费
- Authentication 文档未强调 HTTP 402；余额不足行为以实际响应码/正文为准（实测记录），**勿假设与 Venice 相同 402 结构**

## 接线核对要点

1. Auth 默认 **`x-api-key`**，不是 Bearer-only。  
2. LoRA 形状是 **`path` + `scale`（0–4）**，与 Novita 的 `model_name`+`strength` 不同。  
3. 全异步 + `/api/v1/predictions/{id}/result`。  
4. 视频能力丰富；按目录 category 过滤，参数读 schema。  
5. 通用 Schema 驱动，禁止把 MuAPI 字段写死进画布核心。
