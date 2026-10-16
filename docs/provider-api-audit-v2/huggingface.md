# Hugging Face Inference Providers — API 审计
2026-10-15 重新调查，与旧版无关。调查时间 04:38–04:40 北京时间（box 时钟）。

| 项 | 结论 | 等级 | 证据 |
|---|---|---|---|
| 文档入口 | https://huggingface.co/docs/inference-providers ；任务页 `.md` 版可直接取 | 实测 | |
| 机器可读 Schema | **有（任务级，非模型级）**：huggingface.js 仓库 `packages/tasks/src/tasks/text-to-image/spec/input.json`（200，JSON Schema，TextToImageParameters）；各 provider 模型级 schema 需去对应 provider 取（如 fal/replicate） | 实测 | https://raw.githubusercontent.com/huggingface/huggingface.js/main/packages/tasks/src/tasks/text-to-image/spec/input.json |
| 模型目录 | Hub API `GET https://huggingface.co/api/models?pipeline_tag=text-to-image&inference=warm…`；单模型 `?expand[]=inferenceProviderMapping` **无 key 200**，返回各 provider 的 status(live/error)、providerId、task | 实测 | FLUX.1-dev 实测：fal-ai/replicate/wavespeed live，deepinfra **error** |
| LoRA 目录 | `GET /api/models?filter=base_model:adapter:<base>&expand[]=inferenceProviderMapping` **无 key 200**；条目 mapping 带 `adapter:"lora"`、`adapterWeightsPath`，路由到 fal-ai/flux-lora、replicate flux-dev-lora、wavespeed flux-dev-lora | 实测 | |
| 图像端点 | 经 router：`https://router.huggingface.co/<provider>/...`；HF 规范 payload `{"inputs": "<prompt>", "parameters": {...}}`——**参数嵌套在 `parameters` 内** | 官方原文 | https://huggingface.co/docs/inference-providers/tasks/text-to-image.md |
| 字段 | parameters.guidance_scale, negative_prompt, num_inference_steps, width, height, **scheduler**（采样调度覆盖）, seed；规范内**无 LoRA 强度字段**（LoRA 以「选 LoRA 仓库作 model」方式使用）；无范围 | 官方原文 + 实测(spec JSON) | |
| 异步 | 文档响应为原始字节（同步）；未找到通用轮询协议（已查 text-to-image/text-to-video 任务页） | 官方原文 / 未找到 | |
| 视频 | text-to-video：inputs + parameters{num_frames, guidance_scale, negative_prompt(string[]), num_inference_steps, seed}；无时长/分辨率字段；响应 raw bytes | 官方原文 | tasks/text-to-video.md |
| 鉴权 | `Authorization: Bearer hf_…`（需 "Inference Providers" 权限的 fine-grained token） | 官方原文 | |
| 错误/欠费 | 实测 router 无 key：401 **HTML 页**（非 JSON）；计费：免费用户无月度额度需买 credits（pricing.md）；欠费 HTTP 码/体格式未找到（已查 pricing.md 关键词 402/credits/exceed） | 实测 / 官方原文 / 未找到 | |

坑：401 返回 HTML，错误展示需原样处理非 JSON；inferenceProviderMapping 可能出现 status=error 的 provider，必须过滤展示而非静默换；LoRA 强度在 HF 规范层不可设。
