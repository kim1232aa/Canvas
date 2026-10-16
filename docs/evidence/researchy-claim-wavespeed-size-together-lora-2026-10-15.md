# Researchy 自领核对 · WaveSpeed 尺寸两族 + Together image_loras · 2026-10-15 06:02 (Asia/Tokyo) / 北京约 05:02

来源：群本地 transcript 空；`schema-contract-tests-16` 待核项已于 05:29 及更早钉完。本轮扫草案/v2：发现 (1) v2 `wavespeed.md` 只写了 flux-dev-lora 的 `size` 族，与草案 krea 的 `aspect_ratio`+`resolution` 以及 CLAIM「aspect_ratio 被丢」对不上；(2) Together 草案仍写 image_loras「待确认等实测」，代码已本地拒。

## 方法
1. agy-search `search_web`（线索）
2. curl 官方页 200：Krea V2 Turbo(±LoRA)、z-image/turbo(±LoRA)、flux-dev-lora；Together parameters.md + openapi.yaml
3. 原文落盘：`/workspace/audit-v2-raw/researchy-30m-0602/`

## 结论
1. **WaveSpeed 尺寸按模型分两族**（官方原文）：
   - Krea V2 Turbo / turbo-lora：`resolution`∈{1k,2k} + `aspect_ratio` 预设；**无** `size` / steps / guidance_scale / output_format。
   - z-image/turbo(±LoRA)、flux-dev-lora：`size`=`"W*H"`（+ output_format 等）；**无** aspect_ratio / resolution(1k|2k)。
   - @canvas-dev：按该模型 schema 发送；Krea 已填 aspect_ratio/resolution 不得丢；勿给 Krea 塞 size。
2. **Together image_loras**：参数页仍写 No longer available / FLUX.2 reject；OpenAPI 仍列未 deprecated（滞后）。本地拒对齐参数页官方原文；无 key 未测 HTTP 码。草案「待确认等实测」易被读成「不要本地拒」——已改为以参数页为准。

已改：`docs/provider-api-audit-v2/{wavespeed,together}.md`、`DIFF.md`、`docs/provider-schema-drafts/{wavespeed,together}.json`、`README.md` 对应行。钥匙未写入。
