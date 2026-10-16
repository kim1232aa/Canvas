# Replicate 1035 修复（CODE_ONLY，待前端 E2E）— 2026-10-16 Asia/Shanghai
改前快照：/workspace/canvas-restore/pre-replicate-1035fix-20261016-104740.tgz
Server 重启 1 次：2587844 → **2620869，lstart Fri Oct 16 10:48:41 2026（Asia/Shanghai）**，GET / 200。未 commit、未开浏览器。

## 1) 「实际发送」里的 schemaFields —— 核实：**没有发给 Replicate**
- 真实出站 body（data/history.json，hist_1792118302344_28jeu 的 executionTrace.requestBody，即 upstreamFetch 实际 POST 的 body）：
  `{"input":{"prompt":"a red apple on a wooden table, studio light","seed":7,"num_inference_steps":28,"guidance":3,"lora_weights":"fofr/flux-pixar-cars","lora_scale":0.85}}` —— 无 schemaFields。
- 同一条的 requestMetadata.actualRequest 却是 `{input:{…}, schemaFields:[aspect_ratio, seed, …]}`。
- logs/upstream.log 第 1970 行（2026-10-16T02:38:22Z = 10:38:22 Asia/Shanghai）：POST …/flux-dev-lora/predictions → 402 Insufficient credit（该日志不记 body）。
- 代码：replicateRoutes.ts 发送 `body: JSON.stringify(mapped.payload)`；schemaFields 是 builder 的独立返回值，不在 payload 内。
- 根因：src/server/failedAttemptHistory.ts:53（1024 批起顶层 schemaFields 也能读到）把 schemaFields 写进了 actualRequest，而 Replicate 的 actualRequest 是裸 body 不是 `{endpoint,parameters}` 信封。本地拦截快照也有同样的回写（原 :120）。

改动（通用）：
- failedAttemptHistory.ts：只对 `{endpoint, parameters}` 信封附带诊断；裸 body 原样保存。schemaFields 存 `requestMetadata.schemaFields`。本地拦截的原始快照也不再追加。
- actualRequestDisplay.ts `splitActualRequest`：旧记录（裸 body 旁挂 schemaFields 数组）显示时把它移到 meta，body 只显示真实出站内容。值不改写。
- HistoryModal.tsx：失败卡、本地拦截卡新增「本地记录（未发给上游）：Schema 字段清单（N）」折叠区（data-testid=history-local-record）。
- 芯片判定继续读 `requestMetadata.schemaFields`（historyParameters 原本就有这条路径）。

## 2) 只有尺寸带粉色虚线框
根因：HistoryModal.tsx 尺寸行单独实现：没有值时也渲染 `⊘` 芯片（sourceClass.unsupported = 粉色虚线框）。采样器/调度器/负向走 sourceBadge，没有值不出芯片、只写纯文字。
改：尺寸只有显示了画布值时才出芯片，否则写纯文字，与其他行同一规则。

## 测试
新增 src/utils/replicate1035Fix.test.tsx（6 例：裸 body 原样保存、schemaFields 存本地记录、芯片判定仍为「该端点不支持」、本地拦截快照不追加、旧记录拆分、弹窗 HTML 中实际发送不含 schemaFields 且有本地记录区、尺寸与采样器同为纯文字）。replicate1024Fix.test.ts 1 处断言改为读 requestMetadata.schemaFields。
全量 vitest：1318 过 / 2 败（mediaHostedReview.test.ts，缺 hosting/server.generated，与本批无关）。
旧历史卡显示上已拆分；新卡要新生成一张才是新结构。
