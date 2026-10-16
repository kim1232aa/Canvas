# MuAPI (muapi.ai) — API 审计
2026-10-15 重新调查，与旧版无关。调查时间 03:32–03:34 北京时间。

| 项 | 结论 | 等级 | 证据 |
|---|---|---|---|
| 文档入口 | https://muapi.ai/docs/api-reference ；https://muapi.ai/llms.txt（200，391 KB） | 实测 | |
| 机器可读 Schema | **有**：https://api.muapi.ai/openapi.json（200，OpenAPI 3.1，1254 paths，每模型一条 `/api/v1/{model}` 带 requestBody） | 实测 | |
| 模型目录 | `GET /api/v1/models?category=&family=&group_of=` **无 key 200**（Text to Image 74 条，含 endpoint、input_fields、cost）。`GET /api/v1/models/{name}` 对 `flux_dev_lora_image` 实测 404 `MODEL_NOT_FOUND`——目录名与端点名不一一对应 | 实测 | |
| LoRA 目录 | 未找到公开文档化的 LoRA 目录（已查 llms.txt、openapi paths 关键词 lora）。OpenAPI 里有 `/app/lora-data?name=&lora_type=`（/app 前缀站内接口，无说明；实测缺参 422、`lora_type=flux` 404 `LORA_NOT_FOUND`），不建议当官方目录 | 实测 / 未找到 | |
| 图像端点 | `POST /api/v1/{model}`，字段**根层**；`sync` 布尔可同步 | 官方原文(OpenAPI) | |
| flux_dev_lora_image 字段 | prompt, width, height(def 1024), num_images(1–4), **LoRA=`model_id[{model, weight 0–4, def 1}]`**, sync, webhook_url；**该端点 schema 无 steps/seed/guidance/sampler** | 官方原文(OpenAPI) | |
| ⚠ LoRA 字段名不统一 | wan2.1-lora-t2v 用 `lora_list[{path, scale 0–4}]`，flux 用 `model_id[{model, weight}]`——每端点不同，必须按 path 读 schema | 官方原文(OpenAPI) | |
| 异步/轮询 | 返回 request_id → `GET /api/v1/predictions/{id}/result`，status processing/completed/failed；llms.txt 原文「Failed requests are not charged.」 | 官方原文(llms.txt) | |
| 视频 | 同机制；例 wan2.1-lora-t2v：aspect_ratio(16:9/9:16), resolution(480p/720p), duration∈{5,10}, quality；无 seed 字段 | 官方原文(OpenAPI) | |
| 鉴权 | `x-api-key` 头（也接受 `Authorization: Bearer`）；另有 OAuth2 client_credentials | 官方原文(OpenAPI securitySchemes) | |
| 错误/欠费 | 实测无 key：**HTTP 403** `{"detail":"Not authorized: missing or invalid credentials","error":{"code":"FORBIDDEN",...}}`；422 为 FastAPI 校验格式；欠费格式未找到（已查 llms.txt、openapi 响应码，关键词 402/insufficient/balance——端点只声明 200/422） | 实测 / 未找到 | |

坑：无 key 返回 403 不是 401；目录 name 与端点 path 不一致。
