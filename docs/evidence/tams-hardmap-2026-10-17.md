# TAMS 硬套核对 — 2026-10-17 Asia/Tokyo

结论：**seed / steps / CFG / width / height / LoRA→diffusion.lora.items 均已在 `buildTensorModelJob` 硬套**，本批未再改代码。

完整探针矩阵（含 actualRequest 全文）见：

`docs/evidence/tams-matrix-2026-10-17/`

代码路径摘要：

- Builder：`src/schemas/tensorModelApi.ts` `buildTensorModelJob`
- 路由：`server.ts` `POST /api/tensorart/generate` → `buildTensorModelJob(req.body)` → `POST {tamsOrigin}/v1/jobs` + `Authorization: Bearer`（`TENSORART_TAMS_TOKEN`）
- 驱动转发：`src/engines/drivers/TensorArtDriver.ts`（seed/steps/cfg/width/height/loras）
- 张数：`batchSize` → `extraParams.count` → `inputInitialize.count`

①–③ 欠费原文 `credits not enough`；③ 含 `lora.items`。OpenWorks 未改。
