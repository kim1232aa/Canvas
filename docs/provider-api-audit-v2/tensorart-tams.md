# Tensor.Art TAMS（官方 TAMS API）— API 审计
2026-10-15 重新调查，与旧版无关。调查时间 04:40–04:43 北京时间（box 时钟）。
**注意：TAMS ≠ OpenWorks**，本文件只记 tams-docs.tensor.art / `*.tensorart.cloud` 体系。

| 项 | 结论 | 等级 | 证据 |
|---|---|---|---|
| 文档入口 | https://tams-docs.tensor.art/docs/api/apis/tams-api/ （Docusaurus，页上有 Export OpenAPI Spec） | 实测 | |
| 机器可读 Schema | **有**：`https://echoing-swagger.oss-cn-shanghai.aliyuncs.com/tams/tams_api.swagger.online.json`（200，Swagger 2.0，host 字段是占位 `｛endpoint}`）。paths：/v1/jobs, /v1/jobs/{jobId}, /v1/jobs/credits, /v1/jobs/workflow…, /v1/models/{modelId}, /v1/resource/image… | 实测 | |
| 模型目录 | **未找到列表接口**（swagger 仅 `GET /v1/models/{modelId}` 单查，返回 id/name/baseModel/modelType/triggerWords）；文档有「How To Get The Model ID」指南页（人工从网站取 ID） | 官方原文 / 未找到 | |
| LoRA 目录 | 未找到（同上，仅单 ID 查询） | 未找到 | |
| 图像端点 | `POST https://ap-east-1.tensorart.cloud/v1/jobs`，体 `{request_id, stages:[...]}`；**参数嵌套在 stage 对象内**：`{type:"INPUT_INITIALIZE", inputInitialize:{seed, count}}` + `{type:"DIFFUSION", diffusion:{...}}` | 官方原文(swagger + 签名页示例) | |
| 字段 | inputInitialize.seed（**字符串** int64，≤4294967295）、count(1–4)；diffusion.width/height(512–1536，400 错误原文要求 64 的倍数)、prompts[{text}]、negativePrompts、sdModel、sdVae、sampler(string)、steps(1–60)、cfgScale(≤30)、clipSkip、denoisingStrength | 官方原文(swagger) | |
| LoRA 字段 | `diffusion.lora.items[{loraModel, weight(float，无范围), blockWeight}]` | 官方原文(swagger) | |
| 异步/轮询 | `GET /v1/jobs/{jobId}`，status ∈ CREATED/PENDING/RUNNING/WAITING/SUCCESS/FAILED/CANCELED；`POST /v1/jobs/credits` 预估 credits | 官方原文(swagger) | |
| 视频 | 未找到独立视频端点（stage 类型只有 INPUT_INITIALIZE/DIFFUSION/IMAGE_TO_UPSCALER/IMAGE_TO_ADETAILER/IMAGE_TO_INPAINT/**IMAGE_TO_ANIMATE_DIFF**；AnimateDiff 是唯一动图途径） | 官方原文 / 未找到 | |
| 鉴权 | ① `Authorization: Bearer {token}`（简易）；② `TAMS-SHA256-RSA appid=…,nonce_str=…,timestamp=…,signature=…`（SHA256withRSA） | 官方原文 | /docs/api/signature/signature_build/ |
| 错误/欠费 | 实测无鉴权：HTTP **400** `{"code":100002,"message":"invalid authorization header"}`；欠费码未找到（已查 swagger 响应，/v1/jobs 只声明 200/400/default） | 实测 / 未找到 | |

坑：签名页示例 JSON 使用 snake_case（`clip_skip`, `cfg_scale`），swagger 定义为 camelCase（`clipSkip`, `cfgScale`）——两份官方来源不一致，需实测确认；seed 是字符串；鉴权失败返回 400 非 401。
