# Sogni API 审计

抓取日期：2026-10-15 Asia/Shanghai  
研究方法：官方 docs WebFetch + curl；Grok CLI（grok-4.6）本轮 401 失败，未作训练记忆断言。

## 1) 官方 docs / OpenAPI URL

| 资源 | URL |
|------|-----|
| Docs 首页 | https://docs.sogni.ai |
| Creative-Agent Workflows | https://docs.sogni.ai/sogni-intelligence/creative-agent-workflows/ |
| Generation Recipes（直接生图/视频） | https://docs.sogni.ai/api-reference/direct-generation/ |
| Creative Workflows REST | https://docs.sogni.ai/api-reference/workflows/ |
| Personal LoRAs | https://docs.sogni.ai/api-reference/personal-loras/ |
| SDK ImageProjectParams | https://sdk-docs.sogni.ai/interfaces/ImageProjectParams.html |
| API Base | `https://api.sogni.ai/v1/*` |

无独立 OpenAPI 单文件公开页；以 docs 端点表为准。

## 2) 鉴权方式

- Header：`Authorization: Bearer $SOGNI_API_KEY`
- 文档亦写：`api-key` header 可用（Personal LoRAs 页）
- Workflow 相关路由均需认证；启动 workflow 要求 API-key auth
- 可选：`Idempotency-Key` / `X-Idempotency-Key`

## 3) 模型目录端点

| 端点 | 说明 |
|------|------|
| `GET /v1/model-catalog?mediaType=image` | 图像模型目录（docs：Generation Recipes） |
| `GET /v1/models`（OpenAI 兼容） | **只列 LLM**，不是图像模型 |
| `GET /v1/loras/comfy?modelId=...` | **公开 LoRA 目录，无需认证**；按 worker 模型 id 过滤（如 `krea2_turbo_fp8_scaled`） |
| `GET /v1/loras/personal` / `.../catalog` | 个人 LoRA（需认证 + Unlimited） |

分页/搜索：公开页未给出通用 `page`/`q` 参数细节；`?modelId=` 过滤 LoRA。每条 LoRA 有 `modelIds` / `restrictedModelIds`。

## 4) 生图 / 生视频端点与异步轮询

### 统一入口

- **创建**：`POST /v1/creative-agent/workflows`
- Body：`input: { title, steps: [{ id, toolName, arguments, dependsOn? }] }` + 可选 `token_type` / `billing_mode` / `confirm_cost` / `max_estimated_capacity_units` / `safe_content_filter` / `media_references`
- 响应：`201`（inline steps）或模板跑 `202`（待费用确认）；**不是完成态**

### 轮询 / 流

| 方法 | 路径 |
|------|------|
| GET | `/v1/creative-agent/workflows/:id` |
| GET | `/v1/creative-agent/workflows/:id/events` |
| GET SSE | `/v1/creative-agent/workflows/:id/events/stream` |
| POST | `/v1/creative-agent/workflows/:id/resume` |
| POST | `/v1/creative-agent/workflows/:id/confirm-cost` |
| POST | `/v1/creative-agent/workflows/:id/cancel` |
| POST | `/v1/creative-agent/workflows/:id/reseed` |

状态：`queued` / `running` / `completed` / `partial_failure` / `waiting_for_user` / `failed` / `cancelled`。  
产物：`workflow.steps[i].artifacts[j].url`。

### 生图 step

- `toolName`: `generate_image`
- `arguments` 例：`prompt`, `model`（如 `krea-2-turbo`, `z-turbo`, `dark-beast-krea2`, `gpt-image-2.5-sunburst`…）, `width`/`height`, `loras`, `loraStrengths`

### 生视频 step（官方有公开 API）

| toolName | 用途 |
|----------|------|
| `generate_video` | 文生视频 / 参考生视频 |
| `animate_photo` | 图生视频（首帧等） |
| 另有 | `sound_to_video`, `video_to_video`, `stitch_video`, `orbit_video`, `extend_video` 等 |

关键 `arguments`（文档摘录）：

- `videoModel`：`ltx25`（默认）、`ltx23`、`wan22`、MiniMax H3 系列（`minimax-h3-t2v` / `-turbo` / `-balanced` / `-fasth3-…` / `-r2v-…`）、Premium：`seedance2` / `seedance2-mini` / `seedance2-5`、`happyhorse-1.1-*`、`wan3.0-video` / `wan3.0-spicy-video`
- `duration`：默认约 5s；范围因模型而异（LTX 2–20s；Seedance 2.0/Mini 4–15s；Seedance 2.5 4–30s；HappyHorse 3–15s；Wan 3 2–30s；H3 约夹到 5.2–15.1s @24fps）
- `ratio` / `aspectRatio` / `width`+`height` / `targetResolution`（480/720/1080；Seedance 2.0 可 4K）
- `generateAudio`, `expandPrompt`, `watermark`, `keyframes`, `sourceAudioPolicy`（R2V）
- `loras` + `loraStrengths`（仅部分 H3 模式，见下）

**fps**：H3 参考视频要求源片 **24 fps**；MiniMax H3 按时长×24fps 网格计费。文档未把通用 `fps` 字段列为所有模型的 open argument。

**seed（视频）**：`POST .../reseed` 可 `seed_overrides` 按 step 覆盖；省略则每步新随机种子。SDK/项目层亦有 `seed`（Uint32）。

## 5) LoRA

### 官方字段

- `loras`: `string[]` — LoRA id（目录 slug 或 `personal-…`）
- `loraStrengths`（亦接受 `lora_strengths`）: `number[]` — 与 `loras` **等长、按位对应**
- 省略 `loraStrengths` → 全部强度 **1.0**（不是填 catalog default）
- 最多 **8** 条；`loras: []` / 长度不一致 / 无 loras 却有 strengths → **硬 400**

### 形状与兼容

| 工具 | 可加载 LoRA 的模型参数 |
|------|------------------------|
| `generate_image` | `model: "krea-2-turbo"` 或 `"dark-beast-krea2"` |
| `edit_image` | `krea-identity-edit`；personal 也可配 `"qwen"` |
| `generate_video` | 多个 `minimax-h3-t2v*` / `r2v*`（见 workflows 页表） |
| `animate_photo` | 多个 `minimax-h3-i2v*` / `flf2v*` |

- **公开 LoRA**：发到不能加载的模型 → **静默过滤**掉不兼容 id，剩余仍应用；全灭则不带 LoRA 参数
- **Personal LoRA**：模型不兼容 → **400**（不静默）
- 目录：`GET /v1/loras/comfy?modelId=<workerModelId>`；`restrictedModelIds` 表示测过不可用
- Krea 2 强度可为负（双极滑块）；Personal 强度须 **>0 且 ≤1**
- 不支持 LoRA 的模型：**不要挂控件**；若仍发送，公开 id 会被静默剥离（产品侧应拒绝暴露假能力）

## 6) seed 与 steps / cfg / size

| 字段 | 来源 | 类型 / 范围 |
|------|------|-------------|
| `seed` | SDK `ImageProjectParams`；workflow reseed `seed_overrides` | `number`，**Uint32**；多图时只固定其中一张，其余随机 |
| `steps` | SDK | `number`；多数 SD 最优约 20 |
| `guidance` | SDK（映射 `guidanceScale`） | `number`；多数 SD ~7.5；视频/LoRA 另有区间（如 lightx2v 0.7–1.6） |
| `width` / `height` | workflow `generate_image` arguments；SDK 在 `sizePreset: "custom"` 时 | pixels |
| `sizePreset` | SDK | 查询 `sogni.projects.sizePresets(network, modelId)` |

Creative workflow `generate_image` 示例常只传 `prompt`+`model`；完整采样字段以 SDK / model options 为准，勿硬编码。

## 7) 计费 / 余额线索

- `token_type`: `spark` | `sogni` | `auto`（默认）
- `billing_mode`: `auto` | `subscription` | `tokens`
- Unlimited 计划可覆盖部分 step；外部厂商模型（GPT Image / Seedance / HappyHorse / Wan 3 等）**始终 Premium Spark**
- `waitingReason: "insufficient_credit"`；`cost_approval_required` / `confirm-cost`
- `max_estimated_capacity_units`、`confirm_cost`
- Personal LoRA 无 Unlimited → `403` `errorCode: 179`
- 限流：`429` + `Retry-After`；活跃 workflow 上限 → `409`
- **未在公开 docs 看到 HTTP 402 原文**；余额不足走 `waiting_for_user` / `insufficient_credit`

## 验收对照要点（给 canvas-dev）

1. 生图走 `POST /v1/creative-agent/workflows` + SSE/轮询，勿当同步 chat。  
2. LoRA 必须 `loras`+可选 `loraStrengths`；模型限 `krea-2-turbo`/`dark-beast-krea2`（图）。  
3. seed 用 Uint32；reseed 用官方 `seed_overrides`。  
4. 视频有完整公开 API；按 `videoModel` 真实能力露 duration/resolution，勿张冠李戴。
