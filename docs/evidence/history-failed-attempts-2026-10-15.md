# 失败尝试写入历史（全供应商统一） — 2026-10-15

状态：**CODE_ONLY**（单测通过；未做前端 E2E，待画布复验）。
回滚包：`/workspace/canvas-restore/pre-history-failed-021523.tgz`（改动前，已校验不含新代码）。

## 唯一写入路径
`server.ts` `recordHistoryItem()` → `history.json`。成功走它；失败现在也走它。

## 失败挂点（统一，不按供应商写）
`server.ts` API 中间件里包装的 `res.json`：当 `POST` 且 `status>=400` 或 `ok===false`，且本请求确实向上游发过请求
（`upstreamFetch` 记录的 submissions / 非 GET trace）时，`buildFailedAttemptHistoryItem()`（`src/server/failedAttemptHistory.ts`）组条目 → `recordHistoryItem` → 响应体带 `historyItem`。
没发到上游的本地校验 400 不写。写入失败不吞：响应带 `historyWarning`。

## 失败条目字段
- `status: "failed"`，`url: ""`
- `upstreamStatus`（如 403 / 402；网络错误为 null + `networkError`）、`upstreamStatusText`、`upstreamEndpoint`
- `upstreamResponseBody`：上游返回的**原始字符串**，不改写不截断
- `requestMetadata.actualRequest = {endpoint, parameters}`：最后一次真实提交（含 `loras[{path,scale}]`）；另含 `submissions`、`executionTrace`
- `httpStatus`、`error`、`errorSource`、`stack`、`prompt`、`provider`、`model`

## History UI（`src/components/HistoryModal.tsx`）
失败卡片替换预览图：红色「失败」徽标 + `HTTP 403 Forbidden` + 端点 + 上游原文全文（pre-wrap，可滚动，无 …）+ 折叠「实际发送」（actualRequest JSON）+ 折叠「堆栈」。
参数行走 `resolveHistoryParameters`，actualRequest 里有的字段显示「实际发送」，不显示「未发送」。

## KSampler 发送标识
`Canvas.tsx` 把连接的 Checkpoint/引擎节点 `custom_parameters`（含 `_canvas.schemaProperties`）传给 `NodeItem`（新 prop `schemaCustomParameters`），
`isSchemaOmitCandidate` 第 4 参用它；`schemaSendHint.ts` 未改。Schema 未声明 sampler/scheduler → 显示「不会发送」；已声明 → 不显示（系统无「会发送」徽标）。

## 测试
`src/server/failedAttemptHistory.test.ts`（4 例：AIML 403 含 loras + 原文、Venice 402、网络错误、本地错误不写）。
`npx vitest run src/server src/utils src/components`：722 通过，2 失败均为既有 `mediaHostedReview.test.ts`（缺 `hosting/server.generated.ts` 构建产物，与本改动无关）。
`tsc`：无新增错误（6 个既有）。

---
# 追加（02:30）：会发送徽标 / 本地拦截文案 / LoRA 警告遮挡 — 全部 CODE_ONLY
回滚包：`/workspace/canvas-restore/pre-sendbadge-*.tgz`

## 1) 对称「会发送」徽标（单一真相源）
`src/utils/schemaSendStatus.ts` 只调用 `schemaSendHint.ts` 已有导出（`isSchemaOmitCandidate` / `canvasFieldMatchesSchema` / `readDeclaredSchemaProperties`…）；`schemaSendHint.ts` **零改动**。
- Schema 不含字段（含别名）→「不会发送」（与原逻辑一致）
- Schema 已加载 + 声明 + 已填 →「会发送」（绿）
- Schema 未加载 + 已填 →「待确认」（灰）；绝不假「会发送」
- 未填 / 非 schema 驱动 / schemaFieldsOnly=false → 无徽标
接入：`NodeItem.tsx` slider/combo/number（KSampler steps/cfg/denoise/sampler/scheduler、宽高等；Schema 取连接的 Checkpoint 节点），`ParameterInspector.tsx` steps/cfg/sampler/scheduler/denoise/宽高。`FieldStatusBadge.tsx` 新增 will_send / pending + `SchemaSendBadge`。
注：seed / 负向提示词原本就没有「不会发送」徽标位置，本次未新增。

## 2) 本地 400 未出站
`apiFailure.ts`：`isLocalNotOutbound(data)` = `errorSource==='local'` 且 executionTrace 无任何非 GET 上游请求。
节点红框首行 / 执行记录首行 / describe 行 = `未出站，本地拦截：<本地错误原文>`（不截断、不经 plainFailureConclusion 改写）；describe 行带「（未调用任何上游）」。
行为变更：Civitai Krea LoRA 本地拒绝原来显示「请换支持 LoRA 的模型或先不用这条」，现在显示前缀 + 原文；两条旧测试已按新硬规更新。

## 3) LoRA 警告框遮挡下方节点
警告框本就在节点 DOM 流内（节点自适应高度）；遮挡原因是下方节点绝对定位不动。
`src/utils/nodeOverlap.ts` `overlapPushes()` + `NodeItem` callback-ref ResizeObserver（高度增长时上报）+ `Canvas.tsx` 用 `onUpdateNodePos` 把顶边落入其内的同列节点下移到其底部 +16px（可见位移，非隐藏）。

## 测试
新增 `schemaSendStatus.test.ts`(6)、`apiFailure.localNotOutbound.test.ts`(4)、`nodeOverlap.test.ts`(3)。`vitest run src`：953 过，2 失败均为既有 `mediaHostedReview`（缺 hosting 构建产物）。tsc 无新增错误。

---
# 追加（02:35）：本地拦截写入历史 + seed/负向徽标 — CODE_ONLY
回滚包：`/workspace/canvas-restore/pre-localhistory-0227.tgz`。改前 vitest：954 过 / 2 既有失败；改后 957 过 / 同 2 既有失败（mediaHostedReview）。

## 本地拦截写历史（全供应商统一）
- `src/server/failedAttemptHistory.ts`：`buildLocalRejectionHistoryItem()`、`isGenerationRoute()`（路径以 `/generate` 或 `/submit` 结尾，覆盖 `/api/schema-provider/:p/submit`）。
- `server.ts` 中间件：失败且无出站 → 本地拦截条目；`custom_parameters` JSON 解析失败的提前 400 也写入。未改 `/api/video/generate` 路由体与 `tensorOpenWorksInputs.ts`。
- 条目：`status:"local_blocked"`、`statusLabel:"未出站，本地拦截"`、`error`=本地原因原文、`httpStatus`、`stack`、`requestMetadata.intendedRequest`=请求快照（经 sanitizeGenerationMetadata 去密钥，去掉 workflowSnapshot——它另存在 workflowSnapshot 字段）。**无** upstreamStatus / upstreamResponseBody / actualRequest。
- `HistoryModal.tsx`：独立灰色虚线卡（区别于红色上游失败卡）：「未出站，本地拦截」徽标 +「未调用任何上游 · 无上游状态码」+ 路由 + 原因原文 + 折叠「拟发送（未出站）」+ 堆栈。参数行显示「未发送」（如实）。

## seed / 负向提示词徽标
`NodeItem.tsx`：seed 控件、CLIPTextEncodeNegative/negative 文本框；`ParameterInspector.tsx`：seed、负向。同 `schemaSendStatus()` 规则。

## 测试
`failedAttemptHistory.test.ts` +2，`schemaSendStatus.test.ts` +1。
