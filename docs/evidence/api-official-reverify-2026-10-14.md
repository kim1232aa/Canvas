# 官方 API 再核（2026-10-14，进行中）

规则：只记本轮亲自 WebFetch/检索到的官方页；仓库 markdown 仅作对照，不作权威。

## 已现抓（本轮）

### WaveSpeed `wavespeed-ai/krea-v2/turbo-lora`
- 官方：https://wavespeed.ai/docs/docs-api/wavespeed-ai/krea-v2-turbo-lora
- 提交：`POST https://api.wavespeed.ai/api/v3/wavespeed-ai/krea-v2/turbo-lora`
- 轮询：`GET https://api.wavespeed.ai/api/v3/predictions/{id}/result`
- 认证：`Authorization: Bearer …`
- LoRA：`loras` 数组，0–3；每项 **`path`（.safetensors URL）+ `scale`（0–4，默认 1）**
- `strength` = 图生图 denoise，**不是** LoRA 强度
- 前端 E2E 已证：`actualRequest.parameters.loras=[{path, scale:0.75}]` → PASS_GENERATION（Hub 粘贴路径）

### Fal `fal-ai/krea-2/turbo/lora`
- 官方：https://fal.ai/models/fal-ai/krea-2/turbo/lora/api
- 模型 id：`fal-ai/krea-2/turbo/lora`；认证 `FAL_KEY`
- LoRA：`loras` 最多 3；每项 **`path`（URL / HF owner/repo / local）+ `scale`（0–4，默认 1）**（schema 名 `LoRAInput`）
- 先前 E2E 打的是 `fal-ai/flux/dev` 且 **未带 LoRA** → 按新标准不算 LoRA 接线验收；需改打 `krea-2/turbo/lora` 并带 `loras`

## 待核（执行中）
Sogni / Civitai / ModelScope / MuAPI / HF / NanoGPT — 完整表见本文件后续更新。

## 用户标准（2026-10-14）
官方支持 LoRA 的供应商：付费请求必须带真实 LoRA 参数；素材优先 https://civitai.red/images（配方：`/workspace/canvas-e2e-krea2-recipes/recipes.json`）。
