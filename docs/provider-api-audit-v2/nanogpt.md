# NanoGPT — API 审计
2026-10-15 重新调查，与旧版无关。调查时间 04:42–04:45 北京时间（box 时钟）。

| 项 | 结论 | 等级 | 证据 |
|---|---|---|---|
| 文档入口 | https://docs.nano-gpt.com ；llms.txt 200 | 实测 | |
| 机器可读 Schema | 无全站 OpenAPI 文件（docs.nano-gpt.com/openapi.json → 404 "Asset not found"）；**但每个端点 `.md` 页内嵌 OpenAPI 片段**（如 image-generation-openai.md 含 requestBody schema、402 schema）；模型级约束在目录接口 `supported_parameters` | 实测 | |
| 图像模型目录 | `GET https://api.nano-gpt.com/api/v1/image-models` **无 key 200**，243 条，含 capabilities、**supported_parameters**（resolutions、aspect_ratio、max_images、input_image_constraints…）、pricing | 实测 | |
| LoRA 目录 | 未找到 LoRA 目录接口；目录里有 25 个「*-lora」模型 id（如 `qwen-image-2.1/text-to-image-lora`），但其 supported_parameters **未列出 LoRA 字段**；文档全文（llms.txt、image-generation.md、image-generation-openai.md）关键词 lora 仅见 inpainting 模型名 | 未找到 | |
| 图像端点 | `POST https://nano-gpt.com/v1/images/generations`（OpenAI 兼容）与 `POST /api/v1/images`（专用 Image API）；字段**根层** | 官方原文 | |
| 字段（OpenAI 兼容端点内嵌 schema） | prompt, model, n, size, response_format, strength(0–1, def 0.8), **guidance_scale(0–20, def 7.5)**, **num_inference_steps(1–100, def 30)**, seed（原文：model-specific hint，「Identical results are not guaranteed」）, imageDataUrl(s), maskDataUrl；无采样器；**无 LoRA 字段** | 官方原文 | image-generation-openai.md |
| 视频 | `POST /api/generate-video`（model, prompt, duration 字符串如 "5s"/"5", resolution 480p/720p/1080p, seed 可选）；轮询 `GET /api/video/status?requestId=vid_...`（或 runId）；视频模型目录见 video-models 页 | 官方原文 | video-generation.md / video-status-unified.md |
| 鉴权 | `Authorization: Bearer` 或 `x-api-key` | 官方原文 + 实测401 | |
| 错误/欠费 | 实测 401：`{"error":{"message":"Invalid Authentication","type":"invalid_request_error","code":"missing_api_key"}}`；**402 原文「Payment Required - authenticated insufficient balance or opted-in accountless x402 quote」**，体可能是 X402PaymentRequiredResponse | 实测 + 官方原文 | |

坑：402 同时用于「欠费」和「x402 报价」，需按体区分；seed 官方明说不保证可复现。

## 补查 2026-10-15 04:58（Researchy 30m）· supported_parameters 发送规则
官方 Image API（`docs.nano-gpt.com/api-reference/image-generation` / llms-full）：「Treat parameter support as discoverable through `supported_parameters`, not globally available」；seed 原文要求「Check the selected model's `supported_parameters` metadata before using this field」；模型列表页要求「Check `supported_parameters` before deciding which request controls to show」。

实测 `GET https://nano-gpt.com/api/v1/image-models?detailed=true`（200，243 条）：仅 `nano-banana-2.1` 的 supported_parameters 含 `seed`；**无模型**声明 `num_inference_steps` / `guidance_scale`。OpenAI 兼容页内嵌 schema 仍列出这两个可选字段——那是端点级文档，不等于模型级支持。

官方**未写**图像接口对未声明字段「一律 HTTP 拒绝」。与 `schema-contract-tests-16` 分歧：草案「只按 supported_parameters 发送」对齐发现指引；代码「未声明照样发 + capabilityNotes」偏宽。建议对齐草案（未声明标不会发送 / 不发），除非有上游实测证明照发安全。
