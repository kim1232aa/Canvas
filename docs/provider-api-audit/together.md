# Together AI — Provider API Audit

- **抓取日期**: 2026-10-15（Asia/Shanghai）
- **研究方法**: 官方 docs / OpenAPI 页面直拉（`docs.together.ai`）；Grok CLI `-m grok-4.6` 联网检索因 OAuth/401 连续失败（exit 1），本文件以官方文档为准，不凭训练记忆断言。
- **钥匙**: 勿写入本文件；环境变量名见下。

---

## 1) 官方 docs / OpenAPI URL

| 资源 | URL |
|------|-----|
| 文档首页 | https://docs.together.ai/intro |
| llms 索引 | https://docs.together.ai/llms.txt |
| 生图概览 | https://docs.together.ai/docs/inference/images/overview.md |
| 生图参数 | https://docs.together.ai/docs/inference/images/parameters.md |
| 生图 OpenAPI | https://docs.together.ai/reference/post-images-generations.md |
| 生视频概览 | https://docs.together.ai/docs/inference/videos/overview.md |
| 生视频参数 | https://docs.together.ai/docs/inference/videos/parameters.md |
| 创建视频 | https://docs.together.ai/reference/create-videos.md |
| 查询视频 | https://docs.together.ai/reference/get-videos-id.md |
| 模型列表 | https://docs.together.ai/reference/models.md |
| 鉴权 | https://docs.together.ai/docs/api-keys-authentication.md |
| Credits | https://docs.together.ai/docs/billing-credits.md |
| Error codes | https://docs.together.ai/docs/error-codes.md |
| OpenAPI 源 | https://docs.together.ai/openapi.yaml |

Base: `https://api.together.ai/v1`（另有 `https://api-inference.together.ai/v2`）

---

## 2) 鉴权方式

- Header: `Authorization: Bearer $TOGETHER_API_KEY`
- 环境变量名: `TOGETHER_API_KEY`
- 项目作用域 API key（控制台创建）；勿提交源码。
- 出处: https://docs.together.ai/docs/api-keys-authentication.md

---

## 3) 模型目录端点

- **GET** `/models` → `https://api.together.ai/v1/models`
- Query: `dedicated` (boolean，过滤 dedicated 模型)
- **有 list**；官方 OpenAPI **未写分页 / 搜索 query**（一次返回列表）。
- 响应项含 `id`, `type`（含 `image` / `video` 等）, `pricing` 等。
- 出处: https://docs.together.ai/reference/models.md

Serverless 图像模型目录说明另见文档表格（FLUX.2 等），出处: images overview。

---

## 4) 生图 / 生视频端点与异步轮询

### 生图（同步式响应）

- **POST** `/images/generations`
- 请求体必填: `prompt`, `model`
- 响应直接带 `data[].url` 或 `b64_json`（`response_format`），**非**「先建 job 再轮询」模式（相对视频而言为同步返回结果）。
- 示例模型: `black-forest-labs/FLUX.2-dev`
- 出处: https://docs.together.ai/reference/post-images-generations.md 、 images/overview.md

### 生视频（异步 + 轮询）— **有公开 API**

- **创建**: **POST** `/videos`（SDK: `client.videos.create(...)`）
- **轮询**: **GET** `/videos/{id}`（SDK: `client.videos.retrieve(job.id)`）
- 官方说明: “Video generation is asynchronous: you create a job, receive a job ID, and poll for completion.”
- 文档示例轮询间隔约 60s。
- **Job status**: `queued` | `in_progress` | `completed` | `failed` | `cancelled`
- 完成时 `outputs.video_url`；失败时 `error.message` / `error.code`
- 出处: https://docs.together.ai/docs/inference/videos/overview.md 、 get-videos-id.md

---

## 5) LoRA

### Serverless 生图

- OpenAPI 仍列出字段 **`image_loras`**: array of `{ path: string (URL), scale: number }`，`path`+`scale` 必填；说明 “Most LoRA's recommend a value of 1.”
  - 出处: https://docs.together.ai/reference/post-images-generations.md
- **参数文档明确更正（以 parameters 页为准）**:
  > `image_loras`: **No longer available.** The FLUX models that accepted LoRA adapters have been deprecated, and the **current FLUX.2 models reject this parameter**. To serve a LoRA-adapted image model, use a **dedicated endpoint**.
  - 出处: https://docs.together.ai/docs/inference/images/parameters.md （Capability-specific parameters）
- overview 表格对 `FLUX.2 Dev` 写 “Supports guidance, steps, and LoRAs” — **与 parameters 页「reject image_loras」冲突**；**验收应以 parameters.md「reject」为准**，接线勿对 FLUX.2 serverless 静默塞 `image_loras`。
- **不支持时**: 官方写 **reject**（应拒绝/报错），不是静默忽略。
- **Dedicated / 微调路径**: 有 Upload LoRA adapter、multi-LoRA deployment 等（非 serverless 图像 generations 的 `image_loras`）。见 dedicated-endpoints / post-training 文档索引。

### 生视频 LoRA

- 视频参数页 / create-videos OpenAPI **未文档化** LoRA 字段 → **官方文档未说明视频 LoRA**；不支持则不应挂载假强度。

---

## 6) seed 及其他关键参数

### 生图 requestBody（OpenAPI + parameters）

| 字段 | 类型/说明 | 备注 |
|------|-----------|------|
| `seed` | integer | **支持**；固定 seed 可复现。默认 unset（每次新图） |
| `steps` | integer，default 20 | 质量/速度 |
| `guidance_scale` | number，default 3.5 | 典型 1–10 调 |
| `width` / `height` | integer，default 1024 | 建议倍数 of 8；部分模型用 `aspect_ratio` |
| `n` | integer，default 1，范围 1–4 | |
| `negative_prompt` | string | 部分模型 |
| `response_format` | `url` \| `base64` | |
| `output_format` | `jpeg` \| `png` | |
| `disable_safety_checker` | boolean | 触发 NSFW 默认可 422 |

模型兼容表见 parameters.md（Schnell / Pro / Dev / Kontext 等对 steps/guidance/aspect_ratio 支持不同）。

### 生视频 requestBody（parameters + OpenAPI）

| 字段 | 类型/说明 |
|------|-----------|
| `seed` | integer，**支持**；同 seed+参数可复现 |
| `seconds` | string，`"1"`–`"10"`（时长秒，字符串） |
| `fps` | integer，文档表 15–60 |
| `width` / `height` | 像素；Wan 2.7 用 `resolution`（`720P`/`1080P`）+ `ratio` |
| `resolution` | string，Wan 2.7 等 |
| `prompt` | 文本（Kling 等可能要求 `media.frame_images`） |

出处: https://docs.together.ai/docs/inference/videos/parameters.md 、 create-videos.md

---

## 7) 计费 / 402 / 余额线索

- 平台为 **prepaid credits**；余额为 0 则暂停 API，需充值。出处: billing-credits.md
- Error codes 表: **402 Payment Required** — “The account associated with the API key has reached its maximum allowed monthly spending limit.” → 调整 billing 或付款。出处: https://docs.together.ai/docs/error-codes.md
- 另有 401（密钥）、429（限流）等。
- Usage: `GET` billing usage 参考（文档索引 `billing-usage`）。

---

## 8) 2026-10-15 02:58 重核 `image_loras`（curl 官方，非训练记忆）

触发：`docs/provider-schema-drafts/together.json` 出现「OpenAPI 无 deprecated → 文档散文 reject 不作为拦截依据 / 待确认等实测」，与本审计 §5、README「serverless reject」冲突。

| 来源 | HTTP | 结论 |
|------|------|------|
| [parameters.md](https://docs.together.ai/docs/inference/images/parameters.md) Capability-specific | 200 | 原文：`image_loras`: **No longer available.** … current FLUX.2 models **reject** this parameter. Dedicated endpoint only. |
| [post-images-generations.md](https://docs.together.ai/reference/post-images-generations.md) / [openapi.yaml](https://docs.together.ai/openapi.yaml) | 200 | 仍列出 `image_loras[{path,scale}]`，**无** `deprecated: true` |
| [overview.md](https://docs.together.ai/docs/inference/images/overview.md) 模型表 | 200 | FLUX.2 Dev 行仍写 Supports … and **LoRAs**（与 parameters 冲突） |

**接线裁定（不变）**：以 **parameters.md 的 reject** 为准。Serverless 填 LoRA → **本地拦截**并写明原因；勿因 OpenAPI 残留字段标「会发送」或改成「待确认放行」。OpenAPI/overview 冲突只记文档不一致，不作放行依据。

原始抓取：`/tmp/together-reverify/`（parameters.md / post-images.md / overview.md / openapi.yaml）。

---

## 验收注意（画布接线）

1. Serverless 生图：**不要**依赖 `image_loras`；当前文档称 FLUX.2 **reject**。
2. `seed` 生图/生视频均有官方字段。
3. 视频必须走 POST `/videos` + GET `/videos/{id}`，勿当同步。
4. LoRA strength 默认：OpenAPI 仅写 “recommend a value of 1”（对已废弃的 `scale`）；**无 serverless 默认强度可依赖**。

## §8 更正（2026-10-15 03:13 北京时间）
§8「以 parameters.md 的 reject 为准、本地拦截」的结论撤回。按画布通用规则：`image_loras` 在官方 OpenAPI 中有声明且无 `deprecated`，文字说明不作拦截依据；显示「待确认」，以有效 key 实测为准。parameters.md / overview 的矛盾仅作备注。

## 附录 · Researchy 2026-10-15 06:02（image_loras）
见 v2 together.md 补查：参数页仍写 No longer available；OpenAPI 滞后。本地拒对齐参数页。
