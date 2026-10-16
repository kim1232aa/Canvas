# AI/ML API (aimlapi.com) — API 审计
2026-10-15 重新调查，与旧版无关。调查时间 03:29–03:31 北京时间。

| 项 | 结论 | 等级 | 证据 |
|---|---|---|---|
| 文档入口 | https://docs.aimlapi.com ；llms.txt 200 | 实测 | |
| 机器可读 Schema | **有，模型级**：`GET /models` 每条带 `info.docsJson`，如 `https://api.aimlapi.com/docs-json?model=blackforestlabs%2Fflux-2-lora&endpoint=openai%2Fimage-generations` → 无 key 200，OpenAPI 3.0 单模型 schema。932/932 条都有 docsJson。文档页 `.md` 版也内嵌同一 OpenAPI | 实测 | |
| 模型目录 | `GET https://api.aimlapi.com/models`（= /v1/models）**无 key 200**，932 条，字段 id/info/type/aliases/tags；type 含 `openai/image-generations`(125)、`internal/video-generations/submit`(187) | 实测 | |
| LoRA 目录 | 未找到 LoRA 目录接口（已查 llms.txt、/models 字段，关键词 lora）。LoRA 由用户给 URL/HF repo | 未找到 | |
| 图像端点 | `POST /v1/images/generations`，同步；字段**根层** | 官方原文(docsJson) | |
| flux-2-lora 字段 | model, prompt(≤4000), image_size(预设 square_hd/square/portrait_4_3/portrait_16_9/landscape_4_3/landscape_16_9 **或** `{width,height}` 512–2048、32 倍数), num_inference_steps(4–50), guidance_scale(0–20), seed(int ≥1), num_images(1–4), output_format, acceleration, enable_safety_checker, **loras[{path, scale 0–4}] 最多 3**；无采样器 | 实测(docsJson 200) | |
| 按模型范围差异 | 同一端点不同模型范围不同（搜索见某模型 steps 1–8），必须按模型取 docsJson | 仅搜索（api-evangelist 镜像，非官方） | |
| 视频 | `POST /v2/video/generations` 提交，`GET /v2/video/generations?generation_id=` 轮询，status ∈ queued/generating/completed/error。wan-2.6-t2v：aspect_ratio, resolution(720p/1080p), duration∈{5,10,15}, seed, negative_prompt, generate_audio… | 官方原文(页内 OpenAPI) | wan-2.6-text-to-video.md |
| 鉴权 | Bearer | 实测 401 | |
| 错误格式 | 实测 401：`{"title","status","message","instance","requestId","timestamp","error":{"name","message"}}`；**欠费 = HTTP 403**，官方原文："You've run out of credits. Please top up your balance..."（不是 402） | 实测 + 官方原文 | https://docs.aimlapi.com/errors-and-messages/errors-with-status-code-4xx.md | |

坑：image_size 是 anyOf（字符串预设或对象），历史/回显要按实际发送形态显示；范围随模型变，勿用一套全局范围。
