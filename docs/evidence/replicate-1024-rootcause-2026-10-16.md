# Replicate 1024 根因（只读阶段，2026-10-16 Asia/Shanghai）
证据：/workspace/canvas-e2e-replicate-1024/（PID 2563005 前后一致）。第 6 条（base_model→SD 1.5）在该目录**无**报错原文/节点 JSON，未查。

1. 拦截卡「LoRA（未发送）」：`src/components/HistoryModal.tsx:68` 写死文案；`src/utils/historyParameters.ts:469` 在没有 proposedRequest 时退回原始 `intendedRequest.loras`。同卡另有 `HistoryModal.tsx:331-335` 紫芯片「LoRA: …」（sentHistoryLoras 对 local_blocked 退回 intendedRequest），自相矛盾。
2. 拟发送 JSON 带 negative/width/sampler/_canvas：`src/server/routes/replicateRoutes.ts:98` 本地 400 只回 `{error}`，不带 `proposedRequest`；`src/server/failedAttemptHistory.ts:115-118` 于是退回原始画布 body 快照。
3. `_canvas` 被拦：`src/server/replicateImageContract.ts:357-358` 把整个 custom JSON（含根 `_canvas`）包进 `{input: …}`，`_canvas` 不再是根键，`src/server/customParameters.ts:27` 的根豁免失效，`input._canvas.scope.provider` 命中 BOUNDARY。写入方（设计如此）：`src/App.tsx:266`（读 Schema 后写 scope+schemaProperties）、`src/App.tsx:1587`、`src/utils/customParameterScope.ts:22-27`（ApiParameterEditor 每次读 Schema 回写 scope）。它随节点 custom_parameters 持久化，所以每次都"回来"——问题不在写入，在 Replicate 包装。
