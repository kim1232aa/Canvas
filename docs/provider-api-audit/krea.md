# Krea — Provider API Audit

- **抓取日期**: 2026-10-15（Asia/Shanghai）
- **研究方法**: `https://docs.krea.ai/llms.txt`、`https://api.krea.ai/openapi.json`、开发者文档页直拉；Grok CLI 401 失败，以官方 OpenAPI/docs 为准。
- **钥匙**: 勿写入本文件。

---

## 1) 官方 docs / OpenAPI URL

| 资源 | URL |
|------|-----|
| docs.krea.ai llms | https://docs.krea.ai/llms.txt |
| 开发者介绍 | https://www.krea.ai/docs/developers/introduction.md |
| API keys & billing | https://www.krea.ai/docs/developers/api-keys-and-billing.md |
| Job lifecycle | https://www.krea.ai/docs/developers/job-lifecycle.md |
| Text-to-video 示例 | https://www.krea.ai/docs/developers/examples/text-to-video.md |
| **OpenAPI** | https://api.krea.ai/openapi.json |
| Model APIs 索引 | https://www.krea.ai/docs/_llms/en/model-apis.txt |

Base: `https://api.krea.ai`

---

## 2) 鉴权方式

- OpenAPI `security`: `bearerAuth`（HTTP Bearer）
- Header: `Authorization: Bearer YOUR_API_TOKEN`
- 可选: `X-Webhook-URL`；`X-Api-Zero-Data-Retention: 1`
- 出处: openapi.json、api-keys-and-billing.md

---

## 3) 模型目录端点

- OpenAPI **无**单独的「全局模型 list」端点；生成按 **per-model path** 暴露（如 `/generate/image/krea/krea-2/medium`、`/generate/video/...`）。
- **Styles（LoRA）目录**: **GET** `/styles` — cursor 分页、`limit` 1–1000、filter（`all`|`user`|`community`|`krea`|…）、`model`、`ids` 等。
- **Jobs 列表**: **GET** `/jobs` — cursor / limit / types / status。
- **Assets**: **GET** `/assets` 分页。
- 出处: openapi.json

---

## 4) 生图 / 生视频端点与异步轮询

### 模式

- 所有生成 POST 返回 **job**（pending），用 **GET** `/jobs/{id}` 轮询至 `completed` / `failed` / …
- Status enum: `backlogged`|`queued`|`scheduled`|`processing`|`sampling`|`intermediate-complete`|`completed`|`failed`|`cancelled`
- 完成结果: `result.urls`（及训练时 `style_id`）
- 出处: openapi `/jobs/{id}`、job-lifecycle.md

### 生图（节选，OpenAPI 实测存在 styles/seed）

| Path | 备注 |
|------|------|
| `/generate/image/krea/krea-2/medium` | Krea 2 Medium；`styles` LoRA |
| `/generate/image/krea/krea-2/large` | Krea 2 Large |
| `/generate/image/krea/krea-2/medium-turbo` | Turbo |
| `/generate/image/bfl/flux-1-dev` | “Best for LoRAs”；steps/guidance |
| `/generate/image/bfl/flux-1-kontext-dev` | 编辑向；**无** styles 字段 |
| `/generate/image/ideogram/ideogram-4.5` | seed；无 styles |
| 等更多 Image 标签路径 | |

### 生视频 — **有公开 API**（OpenAPI 约 40+ 路径）

示例（均 POST，异步 job）:

- `/generate/video/bytedance/seedance-2` — `duration` 4–15（default 5）、`resolution` 480p/720p/1080p/4k、`seed`、`aspect_ratio`
- `/generate/video/kling/kling-2.5` — `duration` 5|10；**无 seed 字段**（该 schema）
- `/generate/video/minimax/hailuo-02` — `duration` 6–10、`resolution` 512p/768p/1080p；**无 seed**
- `/generate/video/google/veo-3` — `duration` 4|6|8、`resolution` 720p/1080p；**无 seed**
- 另有 wan / flux-3-video / runway / luma / ltx / seedance 系列等

**fps**: 上述抽样 schema **未出现 `fps` 字段** → 官方未在这些路径文档化 fps（若某模型页有再补）。

轮询: **GET** `/jobs/{id}`；可选 webhook。

---

## 5) LoRA

### 生成时挂载（Styles）

- 字段名: **`styles`**（description: “Styles (typically LoRAs) to use for the generation”）
- 形状: `[{ "id": string, "strength": number }]`，**id + strength 均 required**
- `strength` 范围: **minimum -2, maximum 2**（Krea 2 / Flux.1 Dev 等）
- **无默认 strength**：未给 strength 则 schema 校验失败（必填）——**禁止前端静默补 0.8**
- 适用: Krea 2 medium/large/turbo、Flux.1 Dev 等带 `styles` 的端点
- 不适用: Ideogram、部分 Kontext / Seedream 等 **无 `styles`** 的端点 → **不应露出挂载控件，不应塞假强度**

### 训练 / 管理

- **POST** `/styles/train` — 训练 custom style (LoRA)；base `flux_dev`|`flux_schnell`|`wan`|`wan22`|`qwen`|`z-image`|`k2`|`k2-large` 等
- **GET** `/styles`、`/styles/{id}`；分享 workspace 等
- 训练完成 job result 含 `style_id`

---

## 6) seed 及其他关键参数

### 生图（Krea 2 示例）

| 字段 | 说明 |
|------|------|
| `seed` | `number \| null` — **支持** |
| `aspect_ratio` | enum 1:1, 4:3, … 9:16 等（必填于 K2） |
| `resolution` | K2: `1K` |
| `steps` | Flux.1 Dev: integer 1–100，default 25 |
| `guidance_scale` | Flux.1 Dev: number 0–24，default 3 |
| `width`/`height` | Flux.1 Dev: 512–2368，default 1024 |
| `creativity` / `intensity` / `complexity` / `movement` | K2 特有 |

Ideogram 4.5: `seed` integer 0–2147483647；`quality`；无 steps/cfg 同名。

### 生视频

- **seed**: 因模型而异（Seedance-2 有；Kling 2.5 / Veo-3 / Hailuo-02 抽样 schema **无**）
- **duration** / **resolution** / **aspect_ratio**: 见上表
- **fps**: 抽样路径官方 OpenAPI **未文档化**

---

## 7) 计费 / 402 / 余额线索

- API 使用 **独立 USD API balance**（与网页 compute units 分开）。
- 余额耗尽: **HTTP 402 Payment Required**，原文线索:
  > “Your API balance is separate from your workspace compute balance. Please top up your API balance…”
- OpenAPI 生成端点响应含 **402** “You have run out of credits.” / “Insufficient credits”
- **429** 并发上限
- 无公开 balance 查询端点（文档写 monitor in-app）；Usage API `/usage` 为企业 entitlement。
- 出处: https://www.krea.ai/docs/developers/api-keys-and-billing.md 、 openapi.json

---

## 验收注意

1. LoRA = `styles[].id` + **必填** `strength`（-2..2），无默认 0.8。
2. 仅对 OpenAPI 声明 `styles` 的模型露出 LoRA。
3. 一律异步 job + `/jobs/{id}`。
4. 视频参数按具体 path 的 schema，勿全局假定 seed/fps。
