# T7 Hugging Face 验收报告 — PASS_BILLING

## 2026-10-08 远端保留的 LoRA 路由验收

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
## 2026-10-12 本地接线修复记录与官方契约复审（未调用生成/上传）

以下保留本地 incoming 72f5372 的复审、接线问题与待修边界，和上方 2026-10-08 LoRA 路由验收按时间并列。2026-10-08 记录针对 `fal-ai/flux-lora`；下方 2026-10-10 历史记录针对 `fal-ai/flux/dev`。两条路由均只达到 PASS_BILLING，不能互相外推生成成功；本节列出的待修项仍是待修项，不视为已完成修复。

继承 agent-115 实际成功工具结果；旧 agent 没有文档/生产代码 Edit/Write。以下不升级历史 PASS_BILLING。

- https://huggingface.co/docs/inference-providers/hub-api （旧 FetchURL 成功正文）：“`Add --expand inferenceProviderMapping to see which provider serves each model and the provider-specific model id`”。`server.ts:6191,6255-6258` 使用 live/task 元数据区分下载仓库与推理能力，正确；旧公开模型 API 实际返回 fal-ai live / providerId=fal-ai/flux/dev。
- https://raw.githubusercontent.com/huggingface/huggingface.js/main/packages/inference/src/providers/fal-ai.ts （旧成功正文）：`return /${params.model}?_subdomain=queue`、Bearer 鉴权、`response.response_url` 的 pathname 拼 status/result URL、LoRA `resolve/main/${adapterWeightsPath}`。`server.ts:6203-6247` 核心路由和轮询匹配；没有因 Space 失败切换路由。该来源是 main，不当固定版本；本轮另亲见已安装 `node_modules/@huggingface/inference/dist/esm/providers/fal-ai.js:79-101,162-170` 同形逻辑。
- https://raw.githubusercontent.com/huggingface/huggingface.js/main/packages/inference/src/providers/hf-inference.ts （旧成功正文）：`super("hf-inference", .../hf-inference)`；https://huggingface.co/docs/inference-providers/tasks/text-to-image （旧成功正文）列出 inputs/parameters。本站 `server.ts:6270-6274` 的 Router/inputs/parameters 结构匹配。
- 新读 https://huggingface.co/spaces/Tongyi-MAI/Z-Image-Turbo/raw/main/app.py ：绑定 `inputs=[prompt_input, resolution, seed, steps, shift, random_seed, output_gallery]`，输出 gallery、seed string、seed int。固定 Space 是独立服务，不是 Router；当前源码每次使用 `MODEL_PATH` 所指模型，不接受用户任意 model ID。

串行待修：

- HIGH：`server.ts:2365` 声称自定义 JSON 原样提交；`HuggingFaceDriver.ts:30` 发送它，但 hf-inference `server.ts:6259-6275` 与 Space `6095-6110` 没读取 custom_parameters。JSON 被静默丢弃。建议各路由单独记录转换/覆盖/遗漏，不能静默转成其他路由；Space 只按已公开 positional inputs 转换，未映射项透明报告。
- HIGH：Space `server.ts:6072,6092-6110,6304` 不校验用户 model 与固定 Space 模型一致，可能提交 Z-Image 却历史记任意 model。建议公开固定 Space identity / 要求显式匹配，保留用户请求值，不替换底模。
- MEDIUM：HF SDK 对 adapter providerId=`fal-ai/lora` 显式带 model_name；本站 `6217-6228` 无通用对应映射。此端点的底模 selector 仍未验证，不能用 FLUX 成功外推；建议按所选端点 Schema 显式提供，不照抄 SDK 的硬编码默认。
- `server.ts:6318-6319` 局部 catch 只给 message；全局 `267-288` 会注入 executionTrace/errorSource/stack，故不能笼统说错误完全丢失。仍需单独保证 metadata/无 HTTP 异常原始 cause 可见。

本轮只解析 `temp/acceptance-20261010/hf/terminal.json` 已存记录：metadata 200，Router 402 “You have no remaining credits”；不做新额度探针。生成、LoRA 效果、多图、实际 queue 完成、Space 网络恢复和云历史仍未验。

## 以下为保留的历史前端记录

日期：2026-10-10 (UTC+8)。真实前端 + 真实 Hugging Face API，专用无头浏览器（CDP）驱动完整 UI 流程。

## 结论

**PASS_BILLING** — 真实通过 Hugging Face 官方推理提供商路由（Inference Providers）调用 `fal-ai/flux/dev`，上游返回 HTTP 402 `You have no remaining credits`，前端执行记录面板原样透传状态码与错误信息，无静默容灾、无虚假成功、无端点偷换。

## 证据链

1. **底模选定**：
   - 供应商：`huggingface`
   - 模型 ID：`black-forest-labs/FLUX.1-dev`
   - 路由提供商：`fal-ai`
2. **元数据与路由解析**：
   - 请求：`GET https://huggingface.co/api/models/black-forest-labs/FLUX.1-dev?expand=inferenceProviderMapping&expand=cardData&expand=siblings`
   - 响应：HTTP 200 OK，解析出 `inferenceProviderMapping.fal-ai` (status: `live`, providerId: `fal-ai/flux/dev`)。
3. **真实提交**：
   - 端点：`POST https://router.huggingface.co/fal-ai/fal-ai/flux/dev?_subdomain=queue`
   - 认证：`Bearer [REDACTED_HF_TOKEN]...Kdks`
   - 载荷参数：
     ```json
     {
       "prompt": "a tiny brass lighthouse on a moss-covered island, indigo twilight, silver ripples, intricate miniature diorama, cinematic macro photography",
       "num_inference_steps": 8,
       "seed": 42
     }
     ```
4. **上游响应**：
   - 状态码：**HTTP 402 Payment Required**
   - 响应体：
     ```json
     {
       "error": "You have no remaining credits. Purchase pre-paid credits to continue using Inference Providers. Alternatively, subscribe to PRO to get monthly included credits."
     }
     ```
5. **前端原样透传与执行记录**：
   - 前端执行记录面板完整展示客户端请求、目标端点与上游 HTTP 402 错误。
   - `data/history.json` 不记录虚假历史，无 mock 数据注入，不降级其他模型。
6. **Space 路由状态对照**：
   - 针对社区 Space 直连路由，实测上游网络表现为 ECONNRESET，系统如实暴露网络状态，不静默伪造通过。

## 产物与证据文件

- 验收数据保存在：`temp/acceptance-20261010/hf/`
  - `terminal.json`：完整执行轨迹与上游 HTTP 402 原始报文
  - `ready.png`：运行前画布与连线就绪截图
  - `billing.png`：执行后透传 402 欠费提示的前端界面截图
