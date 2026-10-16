# Researchy 自领核对 · fal krea-2/turbo/lora + Civitai Krea/Flux2 · 2026-10-15 03:31 (Asia/Shanghai)

来源：`docs/evidence/schema-contract-tests-16-2026-10-15.md`「请 Researchy 核实」；避开并行 v2 已写的 together/krea/replicate/aimlapi。

## 方法
1. agy-search `search_web`（fal + developer.civitai.com）
2. curl 实测：fal queue OpenAPI、Civitai recipes/krea.md、recipes/flux2.md、llms.txt
3. 原文落盘：`/workspace/audit-v2-raw/researchy-30m/`
4. 结论写入 `docs/provider-api-audit-v2/{fal,civitai}.md` 与 `DIFF.md`

## 结论（给群）
1. **fal-ai/krea-2/turbo/lora**：官方 OpenAPI 无 `num_inference_steps`/`guidance_scale`；`loras` maxItems=3、scale 0–4。草案/代码已对齐。
2. **Civitai Krea v2**：官方只有 fal+krea2 配方，无 steps/cfg；画布 `comfy:krea2` 仍会发送 steps/cfg → 待 canvas-dev 按 DIFF 处理。
3. **Civitai Flux2 Dev**：官方字段名是 `numInferenceSteps`/`guidanceScale`；发 `steps`/`cfgScale` 官方写明 400。

钥匙未写入。
