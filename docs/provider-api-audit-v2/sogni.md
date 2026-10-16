# Sogni AI — API 审计
2026-10-15 重新调查，与旧版无关。调查时间 03:34–03:36，**04:43–04:45 补查修正**（北京时间，box 时钟）。

> ⚠ 修正说明：本文件第一版（03:36）结论「以 SDK + WebSocket 为主，无公开 REST 图像端点」**是错的**——当时只查了 `docs.sogni.ai/llms.txt`(404) 和 agy-search 虚构的 `/v1/images/generations`(404)，没查 `docs.sogni.ai/api-reference/`。写 DIFF 时发现分歧，04:43 起对下列 REST 接口逐一 curl 实测后重写。

| 项 | 结论 | 等级 | 证据 |
|---|---|---|---|
| 文档入口 | REST：https://docs.sogni.ai/api-reference/ （200；分 direct-generation / workflows / model-discovery / personal-loras / project-status / wallet…，每页有 `index.md`）；SDK：https://sdk-docs.sogni.ai | 实测 | |
| ⚠ 搜索摘要错误 | agy-search 称有 OpenAI 兼容 `POST /v1/images/generations` → 实测 **404 "Cannot POST"** | 实测 | |
| 机器可读 Schema | 未找到 OpenAPI 文件（已查 api-reference 页、llms-full.txt，关键词 openapi/swagger）。机器可读替代：模型目录与 LoRA 目录 JSON（见下，含 LoRA 强度范围） | 未找到 / 实测 | |
| 模型目录 | `GET https://api.sogni.ai/v1/model-catalog?mediaType=image` **无 key 200**，count=426。原文：「The OpenAI-compatible `/v1/models` endpoint lists LLMs, not image models」 | 实测 + 官方原文 | direct-generation/index.md |
| LoRA 目录 | `GET https://api.sogni.ai/v1/loras/comfy?modelId=krea2_turbo_fp8_scaled` **无 key 200**，25 条；每条 `loraId` + **`ui:{min:-5,max:5,default:1,step:0.1,recommendedMin,recommendedMax}`**（逐条范围）+ modelIds；私有库 personal-loras（需认证 + Unlimited） | 实测 | |
| 图像生成（REST） | `POST https://api.sogni.ai/v1/creative-agent/workflows`，体 `{"input":{"title", "steps":[{"id","toolName":"generate_image","arguments":{prompt, model, ...}}]}}`——**参数嵌套在 `input.steps[].arguments` 内** | 官方原文 | direct-generation/index.md |
| 图像生成（SDK） | `sogni.projects.create({type:'image', modelId, positivePrompt, steps, guidance, seed, loras, loraStrengths…})` | 官方原文(TypeDoc) | |
| LoRA 字段 | `loras: string[]`（ID，有序，≤8）+ `loraStrengths: number[]` 按位对应，默认 1.0，可负。TypeDoc 原文：「values outside the valid range are **clamped server-side**」 | 官方原文 | BaseProjectParams |
| guidance | SD 最佳 7.5；视频 0.7–8.0，lightx2v 0.7–1.6 | 官方原文 | |
| 异步/轮询 | workflow：`GET /v1/creative-agent/workflows/:id` 或 SSE `/events/stream`；status queued/running/waiting_for_user/completed/partial_failure/failed/cancelled；结果 `workflow.steps[0].artifacts[0].url`。project：`GET /v2/projects/:id`（原文：200 只表示项目存在，需读 `data.project.status`） | 官方原文 | workflows / project-status |
| 视频 | 同 workflows，videoModel：ltx25/ltx23/wan22/minimax-h3-*/seedance2…；**其他值返回 400**；WAN 2.2 内部恒 16fps | 官方原文 | |
| 鉴权 | `Authorization: Bearer $SOGNI_API_KEY`；无 key 访问 `/v1/models` 实测 401 `{"error":{"message","type":"authentication_error",...}}` | 官方原文 + 实测 | |
| 错误/欠费 | 原文：无 Premium Spark 却用 vendor 模型 → **402**（任何 step 运行前）；暂停态 `waitingReason: insufficient_credit` | 官方原文 | workflows/index.md |

坑：服务端静默 clamp LoRA 强度——画布须按 `/v1/loras/comfy` 的 ui.min/max 本地校验；workflow 状态可能是 `waiting_for_user`（成本确认）而非失败。
