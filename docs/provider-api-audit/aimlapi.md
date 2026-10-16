# AIMLAPI (AI/ML API) — Provider API Audit

- **抓取日期**: 2026-10-15（Asia/Shanghai）
- **研究方法**: https://docs.aimlapi.com/ 、llms.txt、模型页 `.md` OpenAPI 片段、GitBook ask 接口；Grok CLI 401 失败。
- **钥匙**: 勿写入；占位 `<YOUR_AIMLAPI_KEY>`。

---

## 1) 官方 docs / OpenAPI URL

| 资源 | URL |
|------|-----|
| 文档首页 | https://docs.aimlapi.com/ |
| llms 索引 | https://docs.aimlapi.com/llms.txt |
| Z Image Turbo LoRA | https://docs.aimlapi.com/api-references/image-models/alibaba-cloud/z-image-turbo-lora.md |
| Flux 2 LoRA | https://docs.aimlapi.com/api-references/image-models/flux/flux-2-lora.md |
| Pixverse V5.5 i2v | https://docs.aimlapi.com/api-references/video-models/pixverse/v5-5-image-to-video.md |
| Complete model list | https://docs.aimlapi.com/api-references/service-endpoints/complete-model-list.md |
| Account balance | https://docs.aimlapi.com/api-references/service-endpoints/account-balance.md |
| 4xx errors | https://docs.aimlapi.com/errors-and-messages/errors-with-status-code-4xx.md |

Base: `https://api.aimlapi.com`  
OpenAI 兼容示例 `base_url="https://api.aimlapi.com/v1"`。

---

## 2) 鉴权方式

- Header: `Authorization: Bearer <YOUR_AIMLAPI_KEY>`
- Content-Type: `application/json`
- 出处: 各模型页示例、4xx 文档（401 文案要求 Bearer key）

---

## 3) 模型目录端点

- **GET** `https://api.aimlapi.com/v1/models`  
  - 文档称 list models；ask 接口称 **可不带 key**；可用 query 如 `capabilities=image_to_video` / `output_modalities=video` 过滤（出处: docs ask + complete-model-list）
- 另有文档库「All Model IDs」「Complete Model List」页面。
- **有 list**；分页细节以 complete-model-list / OpenAPI 为准（本次以 list + filter 为主）。

---

## 4) 生图 / 生视频端点与异步轮询

### 生图

- **POST** `/v1/images/generations`
- 响应含 `data[].url` / `b64_json`；LoRA 模型页示例为同步式拿到 URL（**未**要求 generation_id 轮询）。
- 模型 ID 例: `alibaba/z-image-turbo-lora`、`blackforestlabs/flux-2-lora`

### 生视频 — **有公开 API**

- **创建**: **POST** `/v2/video/generations`
- **轮询**: **GET** `/v2/video/generations?generation_id=<id>`
- Status enum（OpenAPI）: `queued` | `generating` | `completed` | `error`  
  （示例代码还判断 `waiting`；完成示例日志曾出现 `succeeded`——**以 OpenAPI enum 为主，实测兼容多值**）
- 文档建议约 **每 15 秒** 轮询。
- 示例模型: `pixverse/v5.5/image-to-video`
- 出处: https://docs.aimlapi.com/api-references/video-models/pixverse/v5-5-image-to-video.md

另有大量 Video Models（Veo / Kling / Wan / Seedance 等）列于 llms.txt，各自有独立 schema 页。

---

## 5) LoRA

以官方模型页 OpenAPI 为准（非所有图像模型都支持）。

### `alibaba/z-image-turbo-lora` / `blackforestlabs/flux-2-lora`

- 字段: **`loras`**: array，**maxItems: 3**
- 元素: `{ "path": string, "scale": number }`
  - `path` **required**（URL 或 HuggingFace `owner/repo`）
  - `scale`: number，**minimum 0, maximum 4**；description “Scale factor for LoRA application.”
  - **`scale` 无 default**（未写 default）→ UI 须显式传；勿静默 0.8
- 影响字段名是 **`scale`，不是 `strength`**
- 不支持 LoRA 的模型（schema 无 `loras`）→ 拒绝挂载 / 不塞假参数

### 生视频 LoRA

- Pixverse V5.5 i2v OpenAPI **无 `loras` 字段** → 该端点 **不支持** LoRA；勿挂。

---

## 6) seed 及其他关键参数

### 生图（Z Image Turbo LoRA）

| 字段 | 说明 |
|------|------|
| `seed` | integer，**minimum 1**；同 seed+prompt+版本可复现 — **支持** |
| `num_inference_steps` | integer **1–8** |
| `image_size` | 对象 width/height（512–2048，倍数 32）或 preset 字符串 |
| `num_images` | 1–4，default 1 |
| `output_format` | jpeg/png/webp |
| `enable_prompt_expansion` | bool，default true |
| `acceleration` | none/regular/high |

### Flux 2 LoRA 额外

| 字段 | 说明 |
|------|------|
| `guidance_scale` | number 0–20（CFG） |
| `num_inference_steps` | integer **4–50** |
| `seed` | integer minimum 1 — **支持** |
| `loras` | 同上 path + scale 0–4 |

### 生视频（Pixverse V5.5 i2v）

| 字段 | 说明 |
|------|------|
| `seed` | integer — **支持**（未指定则随机） |
| `duration` | integer enum **5, 8, 10**（秒）；1080p 不支持 8s（文档说明） |
| `resolution` | `360p`\|`540p`\|`720p`\|`1080p`，default `720p` |
| `fps` | **该 schema 未文档化** → 官方未公开 fps 字段（此模型） |
| `prompt` + `image_url` | required |
| `negative_prompt` / `style` / audio & multi-clip switches | 可选 |

---

## 7) 计费 / 402 / 余额线索

- **余额 API**: **GET** `/v2/billing` → `current_balance`（USD）、`currency`  
  另有 `/v2/billing/detail`、`/v2/billing/transactions`；legacy `/v1/billing/balance`  
  出处: account-balance.md
- **欠费错误**: 官方 4xx 文档写的是 **HTTP 403**（不是 402）:
  > “You've run out of credits. Please top up your balance or update your payment method to continue: https://aimlapi.com/app/billing/”
- 401: 无效/缺失 API key  
- 429: Too Many Requests  
- GitBook ask 结论: **不返回 402**，用 **403** 表示欠费。  
- 响应 `meta.usage.credits_used` 出现在生成结果 schema。

---

## 验收注意

1. LoRA: `loras[].path` + `loras[].scale`（0–4），最多 3；无默认 scale。
2. 图像 `/v1/images/generations` vs 视频 `/v2/video/generations` + `generation_id` 轮询。
3. 欠费按文档验 **403**（勿只认 402）。
4. 按模型 schema 决定是否露出 LoRA / seed / duration；禁止张冠李戴。
