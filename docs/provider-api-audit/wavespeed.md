# WaveSpeedAI — Provider API Audit

> 抓取日期：2026-10-15（Asia/Shanghai）  
> 方法：https://wavespeed.ai/docs/overview 、get-started-api、api-authentication、list-models、check-balance、submit-task、get-result、error-codes、lora-training-usage、create-video-from-image、以及 **krea-v2-turbo-lora** 模型页。  
> `GET https://api.wavespeed.ai/api/v3/models` 无 key 返回 **401**（需 Bearer）。  
> **Grok CLI**：401 失败。无密钥写入。

## 1) 官方 docs / OpenAPI URL

| 资源 | URL |
|---|---|
| Overview | https://wavespeed.ai/docs/overview |
| Get Started API | https://wavespeed.ai/docs/get-started-api |
| Auth | https://wavespeed.ai/docs/api-authentication |
| List Models | https://wavespeed.ai/docs/list-models |
| Submit Task | https://wavespeed.ai/docs/submit-task |
| Get Result | https://wavespeed.ai/docs/get-result |
| Check Balance | https://wavespeed.ai/docs/check-balance |
| Error Codes | https://wavespeed.ai/docs/error-codes |
| LoRA Training & Usage | https://wavespeed.ai/docs/lora-training-usage |
| I2V 指南 | https://wavespeed.ai/docs/create-video-from-image |
| Krea V2 Turbo LoRA（含 LoRA/seed） | https://wavespeed.ai/docs/docs-api/wavespeed-ai/krea-v2-turbo-lora |
| Models API | `GET https://api.wavespeed.ai/api/v3/models` |

无单独公开 openapi.json；模型级 schema 嵌在 **List Models** 的 `api_schema`。

Base：`https://api.wavespeed.ai/api/v3`

## 2) 鉴权方式

- Header：`Authorization: Bearer YOUR_API_KEY`
- 缺 key → **401**（List Models 实测：`Missing API key. Send it as: Authorization: Bearer <your API key>.`）
- 团队角色：Owner/Admin/Developer/Billing 权限不同；越权 **403** + `API_KEY_PERMISSION_FORBIDDEN`

出处：https://wavespeed.ai/docs/api-authentication

## 3) 模型目录端点

- **GET** `/api/v3/models`（需 Bearer）
- 返回 `data[]`：`model_id`, `name`, `base_price`, `description`, `type`, **`api_schema`**（含 `api_path` + `request_schema.properties`）
- `type` 例：`text-to-image` | `image-to-image` | `text-to-video` | `image-to-video` | `video-to-video` | `text-to-audio` …
- **分页/搜索**：公共文档未描述 query 分页参数；以整表 + 客户端过滤为主（以 List Models 页为准）

## 4) 生图 / 生视频与异步轮询

### 提交

- **POST** `https://api.wavespeed.ai/api/v3/{model_id}`  
  例：`/wavespeed-ai/z-image/turbo`、`/wavespeed-ai/krea-v2/turbo-lora`、`/wavespeed-ai/minimax-h3/image-to-video`
- 响应：`data.id`（task id）, `status` 初始常为 `created`, `urls.get` 指向 result URL
- 可选 webhook query；`enable_sync_mode` 部分模型支持同响应等待

### 轮询

- **GET** `https://api.wavespeed.ai/api/v3/predictions/{task-id}/result`
- 成功：`status=completed`，读 `outputs[]`（多为 URL）
- 终态失败：`failed` | `cancelled` | `timeout` | `deleted`
- 建议间隔 ≥2s

### 生视频

- 模型 type `text-to-video` / `image-to-video` 走**同一套** submit+poll
- I2V 指南常见 body：`prompt`, `image`（URL）, `duration`（秒，例 5）, `resolution`（例 `768p`）
- List Models 示例 hunyuan t2v schema：`size` 枚举 `1280*720`/`720*1280`，`seed`，`num_inference_steps` 2–30
- Wan 2.2 I2V LoRA 文档示例：`duration`、`high_noise_loras` / `low_noise_loras` / `loras`
- **fps**：公共 I2V 指南**未**给通用 `fps` 字段；以各模型 `api_schema` 为准

## 5) LoRA

官方形状（LoRA Usage + Krea 页一致）：

```json
"loras": [ { "path": "<HF owner/name 或 .safetensors URL>", "scale": 1.0 } ]
```

| 项 | 事实 |
|---|---|
| `path` | Hugging Face `owner/model-name` 或直接 URL；Civitai 需 Files 直链；仅 `.safetensors` |
| `scale` | **0.0–4.0**（Krea 文档 range 0–4，default 1） |
| 数量 | **Krea V2 Turbo LoRA：最多 3** |
| 变体 | 部分模型 `high_noise_loras` / `low_noise_loras`（Wan 2.2 i2v-lora 示例） |
| 兼容性 | LoRA 必须匹配底模 name/version/参数量，否则报错 |
| Trigger word | 需写入 prompt，否则可能无效果 |
| 不支持 LoRA 的模型 | **不要暴露挂载控件 / 不要塞 `loras`**；应拒绝 |

出处：https://wavespeed.ai/docs/lora-training-usage 、krea-v2-turbo-lora 页

## 6) seed / steps / cfg / size

| 来源 | 字段 |
|---|---|
| Submit Task 通用说明 | `prompt`, `size`, **`seed`**, `enable_sync_mode` — 「Check the model’s documentation」 |
| Krea V2 Turbo LoRA | **`seed`** integer，**-1 = random**；`aspect_ratio`；`resolution` `1k`\|`2k`；**无 classic steps/cfg**；i2i `strength` 0–1 |
| Hunyuan t2v schema 例 | `seed`；`num_inference_steps`（非名 `steps`）；`size` |
| I2V 指南 | `duration`, `resolution` — 未列 seed（但其他视频 schema 常有 seed） |

**结论**：seed 普遍进 requestBody；steps/cfg **按模型 schema**，Krea turbo-lora **没有** steps/cfg。

## 7) 计费 / 402 / 余额

- **GET** `/api/v3/balance` → `data.balance`（USD）
- Error codes（任务失败体）：
  - **`1407` `insufficient_credits`** — 「The account does not have enough credits… Top up…」
  - 非 HTTP 402 语义；Submit 文档列 HTTP 400/401/403/429/500
- Auth 页：`429 Too Many Requests`；账户档位影响并发（overview：Bronze/Silver/Gold/Ultra）
- Krea 定价例：1k **$0.018** / 2k **$0.03** per image

**未在错误码文档中见到 HTTP 402**；欠费以 **1407 / 余额接口 / 支付提示** 原样展示（PASS_BILLING）。

## 接线核对要点

1. Bearer + per-model POST path 来自 `/models` 的 `api_schema.api_path`。  
2. LoRA = **`path` + `scale`**，最多 3（Krea）；与 Novita 字段名不同。  
3. seed=-1 随机（Krea）；勿静默默认强度 0.8。  
4. 视频与图片同一预测轮询模型。  
5. 欠费看 **1407**，不要假设 402。

## 附录 · Researchy 2026-10-15 06:02（尺寸两族）
见 `docs/provider-api-audit-v2/wavespeed.md` 补查：Krea=`aspect_ratio`+`resolution`；z-image/flux-dev-lora=`size`。勿一律 size。
