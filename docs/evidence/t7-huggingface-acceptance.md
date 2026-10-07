# T7 Hugging Face 验收报告 — PASS_BILLING

日期：2026-10-08。验收方式：本地真实前端 `http://127.0.0.1:3000/`，通过浏览器点击工作流运行；不是终端直调 API。

## 结论

**PASS_BILLING**。本轮选择 Hugging Face，显式路由为 `HF Inference Providers → fal-ai`，底模 `black-forest-labs/FLUX.1-dev`，并挂载 Hugging Face LoRA `Shakker-Labs/FLUX.1-dev-LoRA-add-details`。修复一处本地路由污染后，前端真实请求到达 Hugging Face Router 的 fal-ai LoRA 端点，最终收到 HTTP 402，响应体明确为账户没有剩余额度，因此按用户规则记为“接线通过，生成受额度限制”，不是图片生成成功。

## 本次独立样本参数

- Prompt：`A weathered alpine observatory at blue hour, brass telescope beneath a crystal dome, windblown snow across stone steps, dramatic volumetric moonlight, ultra-detailed cinematic photograph`
- Negative Prompt：`cartoon, anime, oversaturated, blurry, warped architecture, duplicate telescope, text, watermark`
- Base model：`black-forest-labs/FLUX.1-dev`
- Inference provider：`fal-ai`
- LoRA repo：`Shakker-Labs/FLUX.1-dev-LoRA-add-details`
- LoRA weight：`0.55`
- Seed：`314159`
- Steps：`24`
- CFG / guidance：`3.2`
- Sampler / Scheduler：本次路由未发送，未伪造默认值

LoRA Hub 元数据返回：
- base model：`black-forest-labs/FLUX.1-dev`
- adapter：`lora`
- fal-ai providerId：`fal-ai/flux-lora`
- adapterWeightsPath：`FLUX-dev-lora-add_details.safetensors`

## 实际上游请求

前端请求：`POST /api/huggingface/generate`

服务端先读取 Hugging Face 官方模型元数据和 LoRA 元数据，然后实际提交到：

`https://router.huggingface.co/fal-ai/fal-ai/flux-lora?_subdomain=queue`

提交体中明确包含：

- `num_inference_steps: 24`
- `guidance_scale: 3.2`
- `seed: 314159`
- 独立 `negative_prompt`
- LoRA：
  - path：`https://huggingface.co/Shakker-Labs/FLUX.1-dev-LoRA-add-details/resolve/main/FLUX-dev-lora-add_details.safetensors`
  - scale：`0.55`

上游返回：

- HTTP `402`
- `{"error":"You have no remaining credits. Purchase pre-paid credits to continue using Inference Providers. Alternatively, subscribe to PRO to get monthly included credits."}`

前端执行记录保留 endpoint、状态码、业务响应体与调用链；KSampler 与 SaveImage 没有新图片，也没有把失败写成成功。

## 本轮同时修复的接线错误

第一次运行被本地 HTTP 400 拦截，原因是节点从旧 Z-Image Space 流程残留了 `resolution / shift / random_seed / gallery_images`，而 HF→fal-ai 不接受这些 Z-Image Space 专属字段。

修复后：
- `resolution / shift / random_seed / gallery_images` 只在显式 `z-image-space` 路由发送。
- `hf-inference` 与 `HF→fal-ai` 不再被旧 Space 字段污染。
- 增加回归测试，保证 HF→fal-ai 只保留 `hf_provider` 和该路由真实支持的通用字段。

这次第二次前端运行成功跨过本地校验并到达 Hugging Face Router，所以这不是“测试绿灯”，而是实际前端路由验收。

## 边界

本次只证明 `black-forest-labs/FLUX.1-dev` + `Shakker-Labs/FLUX.1-dev-LoRA-add-details` + HF Inference Provider `fal-ai` 这一条路由的接线与计费终态。旧 `z-image-space` 的 BLOCKED_ENV 记录仍是那个旧 Space 路由的历史事实，但不再代表整个 Hugging Face provider 的当前状态。充值后若要判 PASS_GENERATION，仍需重新用独立样本真实出图并做视觉对比。
