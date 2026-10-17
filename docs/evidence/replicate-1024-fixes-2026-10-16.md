# Replicate 1024 修复（CODE_ONLY，待前端 E2E）— 2026-10-16 Asia/Shanghai
改前快照：/workspace/canvas/temp/backups/canvas-restore/pre-replicate-1024fix-20261016-103242.tgz
Server 重启 1 次：2563005 → **2587844，lstart Fri Oct 16 10:34:32 2026（Asia/Shanghai）**，GET / 200。未 commit、未开浏览器。
根因见 replicate-1024-rootcause-2026-10-16.md。

| # | 改动 | 文件 |
|---|---|---|
| 3 | 包 `{input}` 前把根 `_canvas` 剥出、留在根（守卫豁免、applyCustomParameters 剥离）；真实路由键如 `input.provider` 仍拦 | src/server/replicateImageContract.ts（~357） |
| 2 | 本地 400 回 `proposedRequest`＝同一个 `buildReplicatePredictionRequest` 产出的 body（schemaFields、mapping、requestedLoras）；若是自定义 JSON 本身被拒，则不带它重建并明示 `customParametersExcluded: <原错误>`；建不出则不给（卡片仍显示原始快照，不伪造） | src/server/routes/replicateRoutes.ts（~98） |
| 2 | 历史解析展开 `{input}`/`{request}` 信封，种子/步数/CFG 正确读到拟发送值 | src/utils/historyParameters.ts |
| 4 | failed 卡也读路由顶层 `schemaFields`（Replicate 402 放在 actualRequest 旁边，之前丢了→灰「未发送」）；两种卡共用 `absentSource`：Schema 缺→「该端点不支持 · 未发送」，Schema 有但没发→「未发送」，没记录 Schema→新状态「未发送（Schema 未记录）」 | src/server/failedAttemptHistory.ts, src/utils/historyParameters.ts, HistoryModal.tsx（新芯片样式） |
| 1/6 | 每个 LoRA 一个状态 `notSentLoraLabel`：在拟发送 body 里→「拟发送（未出站）」；Schema 记录且无任何 lora 字段→「该端点不支持 · 未发送」；Schema 未记录→「未发送（Schema 未记录）」。文案「LoRA · 状态: 名 (强度)」。未出站卡不再渲染紫色「LoRA: …」芯片 | historyParameters.ts, HistoryModal.tsx |
| 5 | 种子/步数/CFG 行改 inline-flex+gap，徽章 shrink-0，数值与芯片不重叠（需截图验证） | HistoryModal.tsx |

测试：新增 `src/server/replicate1024Fix.test.ts`（6 例，用 live Schema 快照：_canvas 不进 input、路由 402 正常出站、拦截时 proposedRequest 无 negative/width/sampler/_canvas、拟发送=builder body、LoRA 拟发送、402 卡与旧记录文案）。按新语义更新 3 个旧测试（clean0611、aimlapiKreaReverify3、historyParameters 4 处 not-sent→schema-unrecorded：这些记录本来就没存 Schema）。全量 vitest：1312 过 / 2 败，均为 `mediaHostedReview.test.ts`（缺 hosting/server.generated，与本批改动无关；改前未单独复跑）。

注意：旧历史卡不会变好，需要新生成一张。#5 只靠截图确认。第 6 条（base_model）仍无证据未查。
