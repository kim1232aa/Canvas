# ModelScope 魔搭 API-Inference — API 审计
2026-10-15 重新调查，与旧版无关。调查时间 04:36–04:40 北京时间（box 时钟）。

| 项 | 结论 | 等级 | 证据 |
|---|---|---|---|
| 文档入口 | https://modelscope.cn/docs/model-service/API-Inference/intro （SPA；curl 只得 5 KB 壳，用 headless Chrome 渲染后取原文）；另有「Usage Limits」页 | 实测(渲染) | |
| 机器可读 Schema | 未找到（已查：文档页、`/v1/models` 返回字段，关键词 openapi/schema/swagger；导航里的「OpenAPI」是 Hub 管理接口，非推理参数 Schema）。参数仅 HTML 表格 | 未找到 | |
| 模型目录 | `GET https://api-inference.modelscope.cn/v1/models` **无 key 200**，但只有 36 条、仅 id/owned_by/created；文生图模型基本不在列表（只见 Qwen-Image-Edit 两条）→ **不能当图像模型目录** | 实测 | |
| LoRA 目录 | 未找到推理侧 LoRA 目录接口（已查文档页关键词 lora list/catalog、/v1/models）。LoRA 用 ModelScope 模型仓库 repo-id | 未找到 | |
| 图像端点 | `POST https://api-inference.modelscope.cn/v1/images/generations`，头 `X-ModelScope-Async-Mode: true`，字段**根层** | 官方原文(渲染页) | |
| 字段（原页参数表） | model, prompt(<2000), negative_prompt(<2000), size "1024x1024"（范围随模型：SD [64,2048]、FLUX [64,1024]、Qwen-Image [64,1664]、Z-Image-Turbo [512,2048]）, seed [0,2^31-1], steps [1,100], guidance [1.5,20]（字段名就是 `guidance`）, image_url（编辑模型）；无采样器 | 官方原文 | |
| LoRA 字段 | `loras`：单个为字符串 `"<repo-id>"`；多个为对象 `{"<repo-id1>":0.6,"<repo-id2>":0.4}`，原文「Upto 6 LoRAs, all weight-coeffients must sum to 1.0」 | 官方原文 | |
| 异步/轮询 | `GET /v1/tasks/{task_id}`，头 `X-ModelScope-Task-Type: image_generation`；`task_status` SUCCEED/FAILED（其余中间态值原页示例未列全），结果 `output_images[]` | 官方原文 | |
| 视频 | 未找到（已查 API-Inference intro 渲染页关键词 video/视频） | 未找到 | |
| 鉴权 | `Authorization: Bearer <ModelScope token>`；原文「API-Inference is provided free of charge to registered ModelScope users」，配额见 Usage Limits | 官方原文 + 实测401 | |
| 错误格式 | 实测 401：`{"errors":{"message":"Authentication failed..."},"request_id":"..."}`（键名是 `errors` 复数）；超额/欠费格式未找到 | 实测 / 未找到 | |

坑：LoRA 权重须和为 1.0（与其它家「强度」语义不同）；loras 字段是 string 或 map 两种形态；对 WebSearch 摘要里 `width/height/num_inference_steps` 的说法，原页是 `size/steps/guidance`——搜索摘要不准。
