# T7 Hugging Face current acceptance — PASS_BILLING

日期：2026-10-08。验收入口：真实前端 ComfyCanvas Studio；显式选择 Hugging Face 的 `HF Inference Providers → fal-ai` 路由，不是直接 API 测试。

## 结论

**PASS_BILLING**。当前 HF Token 能成功读取底模与 LoRA 的 `inferenceProviderMapping`，并将真实请求提交到 Hugging Face Router 的 fal-ai provider；上游返回 HTTP 402，业务原文：

`You have no remaining credits. Purchase pre-paid credits to continue using Inference Providers. Alternatively, subscribe to PRO to get monthly included credits.`

因此当前 Hugging Face 路由已从旧的 BLOCKED_ENV 升级为 **PASS_BILLING**。没有生成图片，所以本轮没有原图视觉一致性结论。

## 本轮独立样本

- route：`fal-ai`
- base model：`black-forest-labs/FLUX.1-dev`
- LoRA：`Shakker-Labs/FLUX.1-dev-LoRA-add-details`
- LoRA strength：`0.55`
- Prompt：`A weathered alpine observatory at blue hour, brass telescope beneath a crystal dome, windblown snow across stone steps, dramatic volumetric moonlight, ultra-detailed cinematic photograph`
- Negative Prompt：`cartoon, anime, oversaturated, blurry, warped architecture, duplicate telescope, text, watermark`
- Seed：`314159`
- Steps：`24`
- CFG：`3.2`
- Sampler / Scheduler：当前 HF→fal-ai 路由未核实为可发送字段，因此未伪造、未发送。
- LoRA 元数据公开 trigger word `a young woman`，当前图工作流按既有触发词机制前置到实际 Prompt。

## 真实映射证据

底模 metadata：

- `black-forest-labs/FLUX.1-dev`
- fal-ai mapping：`status=live`
- providerId：`fal-ai/flux/dev`
- task：`text-to-image`

LoRA metadata：

- `Shakker-Labs/FLUX.1-dev-LoRA-add-details`
- base_model：`black-forest-labs/FLUX.1-dev`
- fal-ai mapping：`status=live`
- providerId：`fal-ai/flux-lora`
- adapter：`lora`
- adapterWeightsPath：`FLUX-dev-lora-add_details.safetensors`

实际提交 endpoint：

`https://router.huggingface.co/fal-ai/fal-ai/flux-lora?_subdomain=queue`

实际 requestBody：

- `num_inference_steps=24`
- `guidance_scale=3.2`
- `seed=314159`
- 完整 Negative Prompt
- LoRA path：`https://huggingface.co/Shakker-Labs/FLUX.1-dev-LoRA-add-details/resolve/main/FLUX-dev-lora-add_details.safetensors`
- LoRA scale：`0.55`

## 同轮修复

第一次前端提交被本地 400 拦住，因为旧 Z-Image Space 状态的 `resolution / shift / random_seed` 被错误带进 HF→fal-ai 路由。这属于接线问题，不记供应商终态。

已修复：

- `resolution / shift / random_seed / gallery_images` 只在显式 `z-image-space` 路由发送。
- HF Inference 与 HF→fal-ai 不再携带这些 Space-only 字段。
- 新增回归测试，确保 HF→fal-ai 只保留自己的 route 参数。
- 强制刷新前端后复验，真实请求到达 Hugging Face Router 并得到上述 402 余额结果。

## 边界

- 本次没有图片，因此不能判断 LoRA 视觉效果或与参考原图一致性。
- 不外推为 Hugging Face 的所有 Inference Provider / Space / 模型均通过。
- 已取得明确终态，不再为凑测试重复消耗 HF 调用；充值后只有在需要视觉验收时再出图。
