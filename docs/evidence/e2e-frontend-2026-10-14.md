# Canvas 前端 E2E 验收汇总（2026-10-14）

> 验收方式：浏览器从前端选模型 → 点运行 → 观察画布 / 执行记录 / 历史上游响应。  
> 证据目录：`/workspace/canvas/temp/canvas-e2e-<provider>/`（有 `outcome.json` 的以该文件为准；WaveSpeed 无 LoRA 那轮无 `outcome.json`，依据历史导出与截图）。

## 铁律说明

| 判定 | 含义 | 不能证明什么 |
|------|------|----------------|
| **PASS_GENERATION** | 前端请求到达正确上游，有额度且实际出图，并可见于画布/历史 | — |
| **PASS_BILLING** | 前端请求到达正确上游，上游明确返回余额不足 / 锁定 / 免费档不可用等，页面原样展示 | **不等于** LoRA 生效、轮询全链路、媒体持久化、outpaint 等已通过 |
| **BLOCKED_AUTH** | 路由到达真实上游，但 Key/会话无效（如 401） | 不算出图，也不算欠费路由通过 |

- **用户规则（2026-10-14）**：**PASS_BILLING**（余额不足等计费错误真实透传到前端）**算接线通过**；有额度前出图验收可跳过，充值后再补 PASS_GENERATION。
- **欠费可证明路由接线，不能证明后续链路**（LoRA 生效、轮询、持久化等仍须有额度时实测）。
- **禁止假通过**：未出图不得写 PASS_GENERATION；未实测不得写 LoRA/存储通过。
- **Tensor.Art**：本机仅配置 OpenWorks `ak_tensor_…`，**不宣称 TAMS 模型出图**（需 TAMS Bearer）。
- **未测 / 无 Key**：Gemini、Agnes（及本轮未跑的兼容中转、SenseNova、ModelsLab、Runware、Replicate 等）——**本表不编造行**。

## 汇总表

| 供应商 | 结果 | 模型 | 上游状态 / 原文摘要 | LoRA | 出图 | 证据目录 |
|--------|------|------|---------------------|------|------|----------|
| WaveSpeed | **PASS_GENERATION** | `wavespeed-ai/krea-v2/turbo` | 上游 200；任务提交并出图，持久化至 `/api/media/…`，画布与历史可见 | 本轮未挂（`loras: []`） | 有 | `/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-wavespeed/`（无 outcome.json；有截图 + `history-export.json`） |
| WaveSpeed + LoRA | **PASS_GENERATION** | `wavespeed-ai/krea-v2/turbo-lora` | 上游 poll **200** / `completed`；taskId `506ee54f45754a0d85cf0063c04f807c`；图 `/api/media/aeb8449762648e7d792111df359e8d94fad120bb401a2e392523fa78a8bd6701` | URL `…/krea2_darkbrush.safetensors`；强度 **0.75** 经 `loras[].scale` 进请求（`wireIncludedLora: true`）；节点粘贴成功 | 有 | `/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-wavespeed-lora/`（`outcome.json` + 截图 + `history-export.json`） |
| Fal + LoRA | **PASS_BILLING** | `fal-ai/krea-2/turbo/lora` | HTTP **403** · `User is locked. Reason: TOP_UP.` · `https://fal.run/fal-ai/krea-2/turbo/lora` | HF realism LoRA URL；强度 **0.7** 经 `loras[].scale` 进请求（`wireIncludedLora: true`）；目录搜不到含 lora 的生图模型，手填自定义 ID | 无 | `/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-fal-lora/`（`outcome.json` + 截图） |
| Fal | **PASS_BILLING** | `fal-ai/flux/dev`（目录 FLUX.1 [dev]） | HTTP **403** · `User is locked. Reason: TOP_UP.` · `https://fal.run/fal-ai/flux/dev` | 界面无 LoRA 节点/强度；请求 `loras=[]` | 无 | `/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-fal/` |
| Civitai | **PASS_BILLING** | `133005@1759168`（Juggernaut XL / Ragnarok，AIR `…:133005@1759168`） | Orchestration **400** · `insufficientBuzz` | 未挂 | 无 | `/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-civitai/` |
| 魔搭 CN | **PASS_BILLING** | `Tongyi-MAI/Z-Image-Turbo` | **429** · `insufficient balance` · `api-inference.modelscope.cn` | 未挂 | 无 | `/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-modelscope-cn/` |
| 魔搭 AI（国际站） | **PASS_BILLING** | `Tongyi-MAI/Z-Image-Turbo` | **429** · `insufficient balance` · `api-inference.modelscope.ai` | 未挂 | 无 | `/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-modelscope-ai/` |
| Hugging Face | **PASS_BILLING** | `stabilityai/stable-diffusion-xl-base-1.0` | 显式路由 **fal-ai**；**402** · no remaining credits · `router.huggingface.co/fal-ai/…` | 未挂 | 无 | `/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-huggingface/` |
| Sogni | **PASS_BILLING** | `z-turbo` | 提交 **201** 后轮询 failed：`Free tier: … subscribe to Unlimited` | 未挂；请求无 loras | 无 | `/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-sogni/` |
| MuAPI | **PASS_BILLING** | `qwen-text-to-image-2512` | **402** · `INSUFFICIENT_CREDITS` · `api.muapi.ai/api/v1/qwen-text-to-image-2512` | 未挂；Schema 匹配下仅发 prompt | 无 | `/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-muapi/` |
| NanoGPT | **BLOCKED_AUTH** | `qwen-image-2.1/text-to-image` | **401** · `Invalid session` / `invalid_api_key` · `api.nano-gpt.com` | 未挂 | 无 | `/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-nanogpt/` |

## 计数（截至本文件）

| 类别 | 数量 |
|------|------|
| PASS_GENERATION | 2（WaveSpeed；WaveSpeed + LoRA） |
| PASS_BILLING | 7（Fal / Civitai / 魔搭 CN / 魔搭 AI 国际站 / HF / Sogni / MuAPI）——按用户规则均算接线 OK |
| BLOCKED_AUTH | 1（NanoGPT） |
| 本轮已前端跑通路由的供应商 | 9（WaveSpeed 两轮共用一家） |
| 挂 LoRA 并证明生效 | **1**（WaveSpeed + LoRA：`loras[].scale=0.75` 进请求且出图） |

## 备注

1. **HF 路由**：UI 要求显式选择推理端点；本轮按模型 `inferenceProviderMapping` 选 `fal-ai`（live），未暗换供应商。
2. **Schema 匹配**：WaveSpeed / Sogni / MuAPI / NanoGPT 等在匹配模式下，画布 `steps`/`cfg` 等无官方字段时**不发送**（映射里 `sent: false`），符合「不硬编码乱塞字段」。
3. **LoRA Hub 粘贴 URL 未解决 bug（WaveSpeed）**：同一 HF LoRA URL 在 LoRA Hub 粘贴会设 `unresolvedResource` 并阻断运行；用画布 **LoRALoader 节点** 的 `lora_name` 粘贴同一 URL + 显式 `strength_model` 0.75 可进 `loras[].scale` 并成功出图（见 `/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-wavespeed-lora/outcome.json` notes）。节点路径成功 ≠ Hub 路径已修好。
4. **下一轮建议**：有额度供应商补 PASS_GENERATION（PASS_BILLING 已算接线）；Tensor.Art 仅在有 TAMS Bearer 时测模型出图；换有效 NanoGPT Key 后重测；修 LoRA Hub 粘贴 URL `unresolvedResource`；Gemini / Agnes 等需先配 Key。

*写于 2026-10-14（Asia/Tokyo）；已据 WaveSpeed+LoRA `outcome.json` 与用户「欠费可跳过出图」规则更新。*
