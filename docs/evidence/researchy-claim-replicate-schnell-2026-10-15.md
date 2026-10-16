# Researchy 自领核对 · Replicate flux-schnell negative/cfg + ModelScope 采样器 · 2026-10-15 05:29 (Asia/Tokyo) / 北京约 04:29

来源：`docs/evidence/schema-contract-tests-16-2026-10-15.md`「请 Researchy 核实」仍开的两项；群内无更新的 @Researchy 点名（Venice 三类已于 04:27 钉过）。

## 方法
1. agy-search `search_web`（线索）
2. curl 官方：`https://replicate.com/api/models/black-forest-labs/flux-schnell/versions`（200）、AIMLAPI flux-2-lora 文档页、既有 ModelScope `ms_dom.html`
3. 原文落盘：`/workspace/audit-v2-raw/researchy-30m-0529/`

## 结论
1. **Replicate flux-schnell**：官方 Input 字段无 `negative_prompt`、无 `guidance`/`guidance_scale`；有 `num_inference_steps`(1–4)、`aspect_ratio`、`seed` 等。静态 Schema 已标 unsupported，但构建器在未传 `schemaProps` 时仍会写入 negative/guidance_scale → **与官方不一致**。@canvas-dev 请把门控扩到与 width/height 同级（无声明则 omit/本地拒）。
2. **ModelScope**：官方参数表无 sampler/scheduler/denoise（v2 已写；DOM 再数 0 命中）。`cfg` 对应官方名 `guidance`。透传未声明采样器字段与官方不符。
3. **AIMLAPI flux-2-lora `image_size`**：文档 props 含 `image_size`（预设或 `{width,height}`），与既有 v2/草案一致，不改结论。

已改：`docs/provider-api-audit-v2/replicate.md`、`DIFF.md`、`docs/provider-schema-drafts/replicate.json`、`docs/provider-api-audit/replicate.md` 附录。钥匙未写入。
