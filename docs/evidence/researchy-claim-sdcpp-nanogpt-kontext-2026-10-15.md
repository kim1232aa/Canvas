# Researchy 自领核对 · Flux2 Dev sdcpp 字段 + flux1-kontext LoRA + NanoGPT supported_parameters · 2026-10-15 04:58 (Asia/Tokyo) / 北京约 03:58

来源：群内草案仍写 sdcpp「steps/cfg 未核实」；`schema-contract-tests-16` 待核 NanoGPT / flux1-kontext。

## 方法
1. agy-search `search_web`（仅作线索，不作证据）
2. curl 官方原文：flux2.md、flux1.md、llms-full.txt、v2-consumers OpenAPI、image-models?detailed=true
3. 原文落盘：`/workspace/audit-v2-raw/researchy-30m-0458/`

## 结论
1. **Flux2 Dev sdcpp**：官方 OpenAPI `Flux2DevSdCpp*ImageGenInput` 字段是 `steps`（4–50，默认 20）与 `cfgScale`（1–20，默认 1），另有 sampleMethod/schedule/negativePrompt；`loras` 是 **object map**。原生 `flux2`+`dev` 仍是 `numInferenceSteps`/`guidanceScale`，`loras` 是 **array**。两条路径字段名与 LoRA 形状都不同，不能混发。
2. **Flux2 Pro/Max**：官方无 LoRA、无 steps/cfg；只有 prompt/宽高/seed/quantity/enablePromptExpansion。
3. **flux1-kontext**：官方写明无 LoRA；排错表 `loras` on flux1-kontext → 400。Schema 有 guidanceScale/aspectRatio/images[]/seed，无 loras。
4. **NanoGPT**：官方要求用模型 `supported_parameters` 决定展示/发送哪些控件；今日目录 243 模仅 `nano-banana-2.1` 声明 seed，无模型声明 num_inference_steps/guidance_scale。未写「未声明字段一律 HTTP 拒绝」。草案「按 supported_parameters 发」对齐文档；代码「未声明照样发」与文档发现指引不一致。

钥匙未写入。
