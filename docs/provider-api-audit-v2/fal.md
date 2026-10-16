# fal.ai — API 审计
2026-10-15 重新调查，与旧版无关。调查时间 03:35–03:37 北京时间。

| 项 | 结论 | 等级 | 证据 |
|---|---|---|---|
| 文档入口 | https://fal.ai/docs ；llms.txt 200 | 实测 | https://fal.ai/docs/llms.txt |
| 机器可读 Schema | **有，模型级，无 key**：`https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<id>`（flux-lora、seedance-2.5 实测 200）；平台 OpenAPI `https://api.fal.ai/v1/openapi.json`（200）；`GET /v1/models?endpoint_id=…&expand=openapi-3.0` 也可，但**部分端点返回 `expansion_failed: OpenAPI schema not available`**（kling v2.1 实测） | 实测 | |
| 模型目录 | `GET https://api.fal.ai/v1/models`（q, category, status, limit, cursor, expand）**无 key 200** | 实测 | |
| LoRA 目录 | 未找到 LoRA 目录接口（已查平台 openapi.json paths 关键词 lora → 0 条、llms.txt） | 未找到 | |
| 图像端点 | `POST https://queue.fal.run/fal-ai/flux-lora`，**字段在根层**（不是 `input` 内——agy-search 摘要说「inside an input payload」不准确） | 官方原文(OpenAPI requestBody=FluxLoraInput) | |
| flux-lora 字段 | prompt, image_size(预设 square_hd…landscape_16_9 **或** ImageSize{width,height}), num_inference_steps(1–50, def 28), guidance_scale(0–35, def 3.5), seed(int|null), num_images(1–4), **loras[LoraWeight{path, scale 0–4 def 1}]，数量不限**（原文 "any number of LoRAs"）, output_format, acceleration, sync_mode；无采样器 | 实测(schema 200) | |
| 异步/轮询 | `GET /fal-ai/flux-lora/requests/{id}/status`（QueueStatus: IN_QUEUE/IN_PROGRESS/COMPLETED）→ `GET .../requests/{id}` 取结果；`PUT .../cancel` | 实测(schema paths) | |
| 视频 | 同队列机制；例 bytedance/seedance-2.5/text-to-video：duration 字符串枚举 "auto","4".."30"、resolution 480p/720p/1080p、aspect_ratio、generate_audio；**该模型 schema 无 seed** | 实测(schema 200) | |
| 鉴权 | `Authorization: Key <FAL_KEY>`（securitySchemes apiKeyAuth, header Authorization "Fal Key"） | 官方原文 | |
| 错误/欠费 | 实测无 key 401：`{"detail":"Cannot access application \"fal-ai/flux-lora\". Authentication is required..."}`；**DIFF 补查（04:44）**：FAQ 原文「When your credit balance drops below your account's lock threshold, your account is locked and API requests will be rejected.」具体 HTTP 码仍未找到 | 实测 / 官方原文(补查) / 未找到(码) | https://fal.ai/docs/documentation/model-apis/faq.md | |

坑：部分端点目录 expand 拿不到 schema，要回退到 queue openapi URL（这是**另一个官方来源**，不算兜底，但需记录来源）。
