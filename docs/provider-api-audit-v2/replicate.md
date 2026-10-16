# Replicate — API 审计
2026-10-15 重新调查，与旧版无关。调查时间 03:29–03:31 北京时间。

| 项 | 结论 | 等级 | 证据 |
|---|---|---|---|
| 文档入口 | https://replicate.com/docs/reference/http | 官方原文 | |
| 平台 Schema | https://api.replicate.com/openapi.json（200，26 paths：/models, /models/{o}/{n}, /versions, /predictions, /predictions/{id}, /search, /collections, /trainings…） | 实测 | |
| 模型级 Schema | **有**：模型版本对象 `openapi_schema.components.schemas.Input`（`GET /v1/models/{o}/{n}` → `latest_version.openapi_schema`）。需 key（实测 401）。公开网页 `replicate.com/{o}/{n}/api/schema` 无 key 可读（实测 200，HTML 内嵌 JSON） | 实测 | |
| 模型目录 | `GET /v1/models`、`GET /v1/search`、`/v1/collections`，需 key | 官方原文(OpenAPI) | |
| LoRA 目录 | 未找到专门的 LoRA 目录接口（已查 openapi.json 全部 paths，关键词 lora）。LoRA 是**每个模型自己的 input 字段** | 未找到 | |
| 图像端点 | `POST /v1/predictions` `{version, input:{...}}` 或官方模型 `POST /v1/models/{o}/{n}/predictions`；**参数嵌套在 `input` 对象内**；`Prefer: wait` 可同步等最多 60 s | 官方原文 | |
| 字段示例（black-forest-labs/flux-dev-lora，网页 schema 实测） | num_inference_steps(1–50, def 28), guidance(0–10, def 3), seed(int), aspect_ratio(enum 1:1…9:21), **lora_weights(string，Replicate/HF/Civitai/URL)**, **lora_scale(-1–3, def 1)**；字段名随模型变化，无统一 sampler | 实测(网页 schema) | https://replicate.com/black-forest-labs/flux-dev-lora/api/schema |

| 字段示例（black-forest-labs/flux-schnell，2026-10-15 05:29 补查） | 公开 `GET https://replicate.com/api/models/black-forest-labs/flux-schnell/versions` 200 → 最新版 `openapi_schema.Input.properties`：**有** prompt, seed, num_inference_steps(1–4,def4), aspect_ratio(enum), num_outputs(1–4), output_format, output_quality, megapixels, go_fast, disable_safety_checker；**无** negative_prompt / guidance / guidance_scale / width / height / loras。静态 PROVIDER_SCHEMA 已标 cfg/negative unsupported，但 `replicateImageContract` **未传 schemaProps 时仍会把 negative_prompt 与 guidance_scale 写入 input** → 与官方 Schema 不一致 | 实测(versions JSON) | 原文落盘 `/workspace/audit-v2-raw/researchy-30m-0529/flux_schnell_input.json` |
| 异步/轮询 | `GET /v1/predictions/{id}`，status: starting/processing/succeeded/failed/canceled；可 webhook | 官方原文 | /docs/topics/predictions/lifecycle |
| 视频 | 同一 predictions 机制，按视频模型自身 schema（时长/分辨率字段名因模型而异）；未逐个模型核 | 官方原文（机制）/ 未核具体字段 | |
| 鉴权 | `Authorization: Bearer r8_...` | 官方原文+实测401 | |
| 错误格式 | 实测 401：`{"title":"Unauthenticated","detail":"...","status":401}`（RFC7807 风格）；欠费 402 格式未找到（已查 openapi.json 关键词 402/insufficient/billing） | 实测 / 未找到 | |

坑：参数在 `input` 内且每模型字段名不同（num_inference_steps vs steps, guidance vs guidance_scale）；LoRA strength 范围是模型自定（本例 [-1,3]）。
