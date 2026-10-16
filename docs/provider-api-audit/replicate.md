# Replicate — Provider API Audit

- **抓取日期**: 2026-10-15（Asia/Shanghai）
- **研究方法**: 官方 HTTP 参考 md、predictions 文档、模型页 `black-forest-labs/flux-dev-lora` OpenAPI Input schema；Grok CLI 401 失败。
- **钥匙**: 勿写入；环境变量 `REPLICATE_API_TOKEN`。

---

## 1) 官方 docs / OpenAPI URL

| 资源 | URL |
|------|-----|
| HTTP API 参考 | https://replicate.com/docs/reference/http （md: `.../http.md`） |
| Create prediction | https://replicate.com/docs/topics/predictions/create-a-prediction |
| Python 入门 | https://replicate.com/docs/get-started/python |
| Flux Dev LoRA API 页 | https://replicate.com/black-forest-labs/flux-dev-lora/api |
| 账号 Token | https://replicate.com/account/api-tokens |

Base: `https://api.replicate.com/v1`

模型输入 schema **按模型版本** 的 `openapi_schema` 定义（非全局统一 body）。

---

## 2) 鉴权方式

- Header: `Authorization: Bearer $REPLICATE_API_TOKEN`
- 出处: https://replicate.com/docs/reference/http.md （Authentication 段）

---

## 3) 模型目录端点

| 操作 | 方法 / 路径 |
|------|-------------|
| List public models | **GET** `/v1/models` |
| Search models | **GET** `/v1/models` search 相关（`models.search`） |
| Get model | **GET** `/v1/models/{owner}/{name}` |
| List versions | **GET** `/v1/models/{owner}/{name}/versions` |
| Get version (+ openapi_schema) | **GET** `/v1/models/{owner}/{name}/versions/{id}` |
| Collections | **GET** `/v1/collections` 等 |

有 list / search；分页细节见 HTTP 参考各操作。

---

## 4) 生图 / 生视频端点与异步轮询

### 统一 Prediction API（图像与视频共用）

创建（三选一，视模型类型）:

- **POST** `/v1/predictions` — community（常需 `version`）
- **POST** `/v1/models/{owner}/{name}/predictions` — official models（可用 `black-forest-labs/flux-schnell` 这种名）
- **POST** `/v1/deployments/{owner}/{name}/predictions` — deployments

轮询:

- **GET** `/v1/predictions/{prediction_id}`
- 取消: **POST** `/v1/predictions/{id}/cancel`

**Sync**: Header `Prefer: wait`（默认等 60s，可 `Prefer: wait=5`）  
**Async（默认）**: 立即返回 id，再 GET 轮询。

**status**: `starting` | `processing` | `succeeded` | `failed` | `canceled`（文档描述）

Webhook: body 字段 `webhook` / `webhook_events_filter`。

出处: http.md、create-a-prediction 文档。

### 生图示例模型

- `black-forest-labs/flux-dev-lora`（本审计重点）
- `black-forest-labs/flux-schnell` 等

### 生视频 — **有公开 API（经同一 predictions 机制）**

- 官方 HTTP 文档示例使用 **`minimax/video-01`**:  
  `POST https://api.replicate.com/v1/models/minimax/video-01/predictions`  
  出处: http.md cancel 示例段
- **无**单独的「全局 /v1/videos」产品端点；视频 = 选视频模型 + predictions。
- 各视频模型的 `duration` / `fps` / `seed` **以该模型 version 的 openapi_schema 为准**（不可假定与 flux-dev-lora 相同）。
- 若某模型 schema 无视频相关字段 → 该模型不支持视频，而非「平台无视频」。

---

## 5) LoRA（以 flux-dev-lora 官方 Input schema 为准）

来源: 模型 API 页内嵌 OpenAPI `Input.properties`（2026-10-15 抓取）。

| 字段 | 类型 | 默认 | 范围 | 说明 |
|------|------|------|------|------|
| `lora_weights` | string | — | — | LoRA 权重：Replicate `owner/name[/version]`、HF URL、CivitAI URL、或 `.safetensors` URL |
| `lora_scale` | number | **1** | -1 … 3 | 主 LoRA 强度；说明建议基线 0–1；`go_fast` 时内部约 ×1.5 |
| `extra_lora` | string | — | — | 第二路 LoRA，格式同 weights |
| `extra_lora_scale` | number | **1** | -1 … 3 | 第二路强度 |

- **有文档化默认 strength**: `lora_scale` / `extra_lora_scale` **default 1**
- 非 LoRA 模型（如纯 flux-schnell）schema 无这些字段 → **不要挂载假 LoRA**

---

## 6) seed 及其他关键参数（flux-dev-lora）

| 字段 | 类型 | 默认 | 范围 / 说明 |
|------|------|------|-------------|
| `seed` | integer | — | **支持**；“Random seed. Set for reproducible generation” |
| `go_fast` | boolean | true | 开启时 **即使设 seed 也不保证确定性**（文档原文） |
| `guidance` | number | 3 | 0–10 |
| `num_inference_steps` | integer | 28 | 1–50；建议 28–50 |
| `aspect_ratio` | string enum | `1:1` | 含 16:9、9:16 等；**无独立 width/height** |
| `megapixels` | `1` \| `0.25` | `1` | |
| `prompt_strength` | number | 0.8 | img2img 0–1 |
| `output_format` | webp/jpg/png | webp | |
| `output_quality` | int | 80 | 0–100 |
| `num_outputs` | — | — | schema 中有 |
| `disable_safety_checker` | bool | false | |

**视频参数**: 不在本模型 schema；查目标视频模型的 Input（常见可能含 duration 等，需按模型页）。

---

## 7) 计费 / 402 / 余额线索

- 按预测用量计费（`metrics.predict_time` 等）；HTTP 参考未在本次抓取中给出与 Together/Krea 同款的 **402** 专表。
- 鉴权失败典型为无效 Token（Bearer）；具体余额耗尽状态码以账户/账单文档与实测响应为准——**官方 http.md 本次未摘到明确 “402” 字样**。
- 输出文件下载可能需带 Authorization（文档对 file URLs 的说明）。

接线建议: 对 4xx 原样上报 status/body，勿吞错；欠费以实测码为准记入 evidence。

---

## 验收注意

1. LoRA 字段是 `lora_weights` + `lora_scale`（及 extra_*），不是 Comfy `strength_model`。
2. 默认 scale=1 有官方文档；仍应在 UI 显式展示用户值。
3. `go_fast=true` 时 seed 不可靠。
4. 视频走同一 predictions API + 具体视频模型，勿硬编码单一 video 端点。

---

## 附录 · Researchy 2026-10-15 05:29（flux-schnell）

以 `docs/provider-api-audit-v2/replicate.md` 为准。公开 versions API 实测 `black-forest-labs/flux-schnell` Input **无** `negative_prompt` / `guidance` / `guidance_scale`。原文：`/workspace/audit-v2-raw/researchy-30m-0529/flux_schnell_input.json`。
