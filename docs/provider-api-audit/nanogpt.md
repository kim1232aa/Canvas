# NanoGPT API 审计

抓取日期：2026-10-15 Asia/Shanghai  
研究方法：官方 Mintlify 文档（docs.nano-gpt.com）llms.txt + Image API + Video Generation + Video Status；Grok CLI **401**。  
主文档入口（任务指定）：https://docs.nano-gpt.com/api-reference/image-generation

## 1) 官方 docs / OpenAPI URL

| 资源 | URL |
|------|-----|
| 文档索引 | https://docs.nano-gpt.com/llms.txt |
| Image API（归一化生图） | https://docs.nano-gpt.com/api-reference/image-generation |
| Generate Images | https://docs.nano-gpt.com/api-reference/endpoint/image-api-generate.md |
| List Image Models | https://docs.nano-gpt.com/api-reference/endpoint/image-api-models.md |
| Image Model Endpoints/定价 | https://docs.nano-gpt.com/api-reference/endpoint/image-api-model-endpoints.md |
| 旧版 OpenAI 兼容生图 | https://docs.nano-gpt.com/api-reference/endpoint/image-generation-openai.md |
| Video Generation 指南 | https://docs.nano-gpt.com/api-reference/video-generation |
| Video Generation 端点 | https://docs.nano-gpt.com/api-reference/endpoint/video-generation.md |
| Video Models | https://docs.nano-gpt.com/api-reference/endpoint/video-models.md |
| Video Status（统一） | https://docs.nano-gpt.com/api-reference/endpoint/video-status-unified.md |
| Authentication | https://docs.nano-gpt.com/authentication.md |
| Pricing | https://docs.nano-gpt.com/api-reference/miscellaneous/pricing.md |

API Host：`https://api.nano-gpt.com`

## 2) 鉴权方式

官方支持：

```
Authorization: Bearer YOUR_API_KEY
```
或
```
x-api-key: YOUR_API_KEY
```

- 模型发现类 GET **可不鉴权**
- 生成类请求 **需要** API key
- 视频 status：文档亦接受 session cookie（Web）；API 集成用 key

## 3) 模型目录端点

### 图像

```
GET /api/v1/images/models
→ { object:"list", data:[{ id, supported_parameters, capabilities, endpoints, … }], meta }
```

```
GET /api/v1/images/models/{modelId}/endpoints
→ pricing、supported_parameters、input_reference_constraints
```

- `id` 可含斜杠（如 `openai/gpt-image-2.5/flare/text-to-image`）
- **参数因模型而异**，以 `supported_parameters` 为准（官方强调 discoverable，非全局字段）
- 兼容旧列表：`GET /api/v1/image-models`

### 视频

```
GET /api/v1/video-models?detailed=true
```

- 返回 capabilities / supported_parameters / pricing
- 官方：**不要硬编码**视频模型能力；列表可缓存但会变

## 4) 生图 / 生视频端点与异步轮询

### 生图（同步 JSON；新集成优先）

```
POST /api/v1/images
Content-Type: application/json
Body: {
  "model": "<id>",
  "prompt": "…",
  "resolution": "1k",
  "quality": "high",
  "n": 1,
  "input_references": [ … ]   // 可选图生图
}
```

兼容旧路由：

- `POST /api/v1/images/generations`
- `POST /api/v1/images/edits` / `…/edit`

限制（官方）：

- `stream: true` → `unsupported_stream`
- 非空 `provider` 路由对象 → `unsupported_provider_options`
- 勿混用 `input_references` 与旧 alias（`imageDataUrl` 等）→ `conflicting_image_inputs`

### 生视频（官方有公开 API；异步）

```
POST https://api.nano-gpt.com/api/generate-video
→ { runId, status: pending|…, remainingBalance?, … }

GET https://api.nano-gpt.com/api/video/status?requestId=<runId>
（或 runId 别名参数）
→ data.status: COMPLETED | FAILED | …
COMPLETED → data.output.video.url
```

Quickstart 示例与 Video Status 文档一致；轮询间隔示例 5s。  
另有 Video Recover / Extend / Content 等专用路由（llms.txt）。

视频常用请求字段（指南表；**仅当模型 supported_parameters 允许时发送**）：

| 字段 | 说明 |
|------|------|
| `model` | 视频模型 id |
| `prompt` | 文本 |
| `duration` / `seconds` | 时长（字符串秒；Sora 用 `seconds`） |
| `resolution` | `480p`/`720p`/`1080p` 等 |
| `aspect_ratio` / `aspect` | 画幅 |
| `frames_per_second` / `num_frames` | 部分 Wan 等模型 |
| `imageUrl` / `imageDataUrl` | I2V（上传 ≤4MB） |
| `seed` | 可选，见下 |
| `negative_prompt` / `cfg_scale` / `num_inference_steps` | 模型相关 |

## 5) LoRA

**官方 Image API / Video Generation 文档索引与正文未提供通用 LoRA 字段（无 `loras` / `lora` 专章）。**

证据：

- Image API「Common fields」列出 model/prompt/n/resolution/aspect_ratio/quality/output_format/background/**seed**/input_references——**无 LoRA**
- `allowed_passthrough_parameters` 当前文档示例为空数组
- Video 指南参数表同样无通用 LoRA

**画布规则**：对 NanoGPT **默认视为不支持 LoRA** → UI 不露出挂载；若未来某模型 `supported_parameters` 出现 LoRA 类字段，再按发现结果启用。禁止把 Civitai/TAMS LoRA 形状塞进 NanoGPT。

## 6) seed / steps / cfg / size

### 图像（Image API）

| 字段 | 说明 |
|------|------|
| `seed` | 可选；「model-specific hint」；**不保证**同 seed 同图；用前查该模型 `supported_parameters` |
| `resolution` | 常见 enum `1k`/`2k`/`4k`（随模型） |
| `quality` | 如 `low|medium|high|xhigh|max` |
| `n` / `nImages` | 张数；两者皆有时 `nImages` 优先 |
| `aspect_ratio` | 随模型 |
| steps/cfg | **非全局**；若模型声明则在 supported_parameters / passthrough |

### 视频

| 字段 | 说明 |
|------|------|
| `seed` | number 或 string；可选；「may improve reproducibility but does not guarantee identical output」 |
| `duration` | 如 `"5"` / `"5s"` / `"10"`——**按模型** |
| `resolution` | 480p/720p/1080p 等 |
| `frames_per_second` | 例 Wan：5–24 |
| `num_frames` | 例 81–100 |
| `cfg_scale` / `num_inference_steps` | 部分模型 |

## 7) 计费 / 402 / 余额线索

- Image endpoints 元数据含 `pricing[]`（`cost_usd` / resolution 等）——公开 NanoGPT 价，非上游成本价
- Video 提交响应可含 `remainingBalance`（账户扣费后余额）
- 错误类型文档示例含 **`INSUFFICIENT_BALANCE`**；示例代码分支：`response.status === 402 || error.error?.type === 'INSUFFICIENT_BALANCE'`
- 管理用 Usage-only token 可读用量但不消费（authentication.md）
- 欠费且前端准确展示 → 可按产品铁律记 PASS_BILLING；有余额则必须真实出片

## 核对接线注意

1. 新集成优先 `/api/v1/images` + models/endpoints 发现，勿只死接旧 generations。  
2. 视频必须异步：`generate-video` → `video/status`，不要当同步生图。  
3. 无官方 LoRA → 拒绝挂载。  
4. `seed` 可选且弱保证，勿承诺像素级复现。

## 本轮失败记录

| 工具 | 结果 |
|------|------|
| Grok CLI | **401** |
| WebFetch/curl 官方 md | 成功 |

## 实测核对（2026-10-15 02:4x (Asia/Shanghai)）

来源：`curl https://nano-gpt.com/api/v1/image-models?detailed=true`（243 个模型）；https://docs.nano-gpt.com/api-reference/endpoint/image-api-generate.md ；https://docs.nano-gpt.com/api-reference/endpoint/image-generation-openai.md

- 文档原文：`seed` "Check the selected model's `supported_parameters` metadata before using this field." / "Treat parameter support as discoverable through `supported_parameters`, not globally available."；OpenAI 兼容端点把 `guidance_scale`、`num_inference_steps` 列为 "Generation controls (model-specific)"。
- 实测 supported_parameters 键统计：`seed` 仅 1 个模型声明（nano-banana-2.1，default -1）；**无任何模型**声明 steps / guidance / cfg。
- **更正**：`loras` 已有 2 个模型声明（minimax-h3/text-to-image、minimax-h3/image-edit：max_items 3，item {path: HTTPS URL, scale: number}）。"默认不支持 LoRA" 改为：按 supported_parameters.loras 发现后启用，未声明一律本地拒绝。
- 结论：seed/steps/cfg 未在该模型 supported_parameters 声明时不得发送（草案正确；按全局照发的代码错误）。
