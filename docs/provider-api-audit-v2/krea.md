# Krea — API 审计
2026-10-15 重新调查，与旧版无关。调查时间 03:28–03:30 北京时间。方法：agy-search → WebSearch → curl。

| 项 | 结论 | 等级 | 证据 |
|---|---|---|---|
| 文档入口 | https://www.krea.ai/docs ；llms.txt 200，「## OpenAPI Specs」指向 api.krea.ai/openapi.json | 实测 | https://www.krea.ai/docs/llms.txt |
| 机器可读 Schema | **有**：https://api.krea.ai/openapi.json（200，OpenAPI 3.1，123 paths，**每个模型一条 path，带完整 requestBody schema 与 min/max**）。另有官方 MCP（llms.txt：「discover models, inspect schemas」） | 实测 | |
| 模型目录 | 无单独 list 接口；模型 = OpenAPI 中 `/generate/image/{vendor}/{model}`、`/generate/video/{vendor}/{model}` 路径（未找到 `/models` 类接口，已查 OpenAPI 全部非 generate paths） | 实测 / 未找到 | |
| LoRA 目录 | `GET /styles`，query：cursor, limit[1,1000], ids, liked, user, **model**, filter∈{all,user,community,krea,shared,unapproved,editor,gallery,public}；需 key（无 key 实测 401 `{"message":"Unauthorized"}`）。训练 `POST /styles/train`（model∈flux_dev/flux_schnell/wan/wan22） | 实测(401)+官方原文(OpenAPI) | |
| 图像端点 | 例 `POST /generate/image/bfl/flux-1-dev`，字段在**根层**，异步返回 job | 官方原文(OpenAPI) | |
| flux-1-dev 字段 | prompt(必填), seed(number), steps(int 1–100, def 25), width/height(512–2368, def 1024), guidance_scale(0–24, def 3), strength(0–1, img2img), image_url, **LoRA=`styles[{id, strength}]`，strength ∈ [-2, 2]**；无采样器字段 | 官方原文(OpenAPI) | |
| 异步/轮询 | `GET /jobs/{id}`，status ∈ backlogged/queued/scheduled/processing/sampling/intermediate-complete/completed/failed/cancelled；结果 `result.urls`；可用 `X-Webhook-URL` 头。无 key 查假 id 实测 404 `{"message":"Job not found or unauthorized"}` | 实测+官方原文 | |
| 视频 | 约 40 条 `/generate/video/...`；例 wan-2.5：prompt, start_image, aspect_ratio(16:9/9:16/1:1), resolution(480p/720p/1080p), duration(5–10), seed, audio_url, generate_audio；同样 /jobs 轮询 | 官方原文(OpenAPI) | |
| 鉴权 | Bearer（securitySchemes bearerAuth） | 官方原文+实测401 | |
| 错误/欠费 | OpenAPI：400/401/402/429，体 `{"error": string}`；**402 = "You have run out of credits."**；429=并发上限。注意实测 401/404 体字段是 `message` 而非 `error` | 官方原文+实测 | |

坑：错误体字段 `error`（文档）vs `message`（实测 401/404）不一致；LoRA 叫 styles 且 strength 范围 [-2,2] 而非 [0,1]；每模型字段不同，必须按 path 读 schema。
