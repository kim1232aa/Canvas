# Shared-trace batch — 2026-10-16 · 状态：CODE_ONLY

未做前端 E2E。没有 commit，也没有 push。恢复包：`/workspace/canvas/temp/backups/canvas-restore/pre-sharedtrace-20261016-123558.tgz`。
重启一次：旧 PID 2765449 → 新 PID **2840993**，/proc stat 第 22 字段 ticks 为 **12478036**，lstart 为 Fri Oct 16 12:42:27 2026。启动命令和 cwd 跟旧进程完全一样（tsx loader server.ts，cwd 是 /workspace/canvas/Canvas-main），环境变量从旧进程原样继承，没有打印出来。日志在 /tmp/canvas-dev-sharedtrace.log。端口 3000 返回 HTTP 200。

## 1 共用 schema-provider 路径：上游调用记录与 Key 记录
- `src/server/schemaProviders.ts`
  - 新增 `taskTraces`，以 `provider:taskId` 为键。
  - 新增 `appendTaskTraces`：submit 返回 taskId 时，把这次请求里的上游调用段记进去；之后每一次 poll 也追加进去，不会只留首尾两次。同一个对象不会重复记，最多存 500 个任务。
  - 失败卡：poll 失败时写历史，`requestMetadata.executionTrace` 用这个任务累积下来的全部调用段。
  - save-result：任务 id 取 `taskId`，没有时取 `metadata.requestMetadata.submit.taskId`。成功写历史时把累积的调用段并进 executionTrace。
  - 原有的 actualRequest、submit、poll 一字不动，只新增 executionTrace。
- `server.ts`
  - `registerSchemaProviderRoutes` 新增依赖 `traces:()=>generationContext.getStore()?.traces`。
  - `recordHistoryItem` 改为：如果 item 自带 executionTrace，就用它，再补上本次请求里还没记过的段；`keyUsages` 从合并后的结果用 `keyUsagesFromTrace` 算出。每一段的 keyUsage 由 upstreamFetch 里的 `keyPoolManager.describeKey` 生成，内容是「第几个 Key / 共几个」。
- `src/engines/drivers/SchemaProviderDriver.ts`：save-result 请求体里多带一个 `taskId`。
- 前端渲染沿用原来的 HistoryModal：Key 行、「上游交互」区和折叠逻辑都没改。

## 2 Sogni 的「本次请求未含 LoRA」误报
- 这条提示在 `src/App.tsx:1090`，靠 `countActualRequestLoras` 判断有没有 LoRA。
- 原因：这个计数函数只往对象里面找，不进数组。Sogni 的 LoRA 在 `parameters.input.steps[0].arguments.loras` 里，中间隔着 steps 这个数组，所以数出来是 0。
- `src/utils/actualRequestLoras.ts`：改成也往数组里的对象元素继续找。这是通用改法，没有针对 Sogni。改完后 Sogni 的实际请求数为 1。

## 3 失败没进历史（Sogni waiting_for_user）
- `isTaskFailureBody` 是通用判断，判为失败的情况有三种：
  - 状态在 TASK_FAILURE_STATUSES 里；
  - 状态是 `waiting_for_user`（前端 driver 遇到这个状态就停止轮询）；
  - 状态不是成功态，并且带 `error` 或 `waitingReason`。
- `firstUpstreamMessage`：在任意嵌套深度里找 message、msg、error、detail、reason 这些字段，取原文第一行。Sogni 这次能取到 `Debit Error: Insufficient funds`。
- 失败卡的 `upstreamStatusText` 写成 `task status=waiting_for_user · insufficient_credit`。
- 代码里没有写死任何 Sogni 字段名。

## 4 LoRA 来源与当前供应商不同
- 新增 `src/utils/loraSourceMismatch.ts`，在 `src/components/NodeItem.tsx` 的 LoRA 节点里显示中性提示（`data-testid=lora-source-mismatch`）。
- 只在 `resource_source` 是一个纯 provider id 时才比较。原有的值不清除，也不改写。

## 5 排版待办（`src/components/HistoryModal.tsx`）
- a. 折叠行的标题去掉 `whitespace-nowrap overflow-x-auto`，改成 flex-wrap，标题行不再出现自己的滚动条，括号说明能完整显示。展开后提示文字是「（响应相同，收起）」。另外，源码里找不到「段明细」这几个字。实际渲染的文字来自 `upstreamGroupHint` 的「（响应相同，点开逐段查看）」，挑刺截图里看到的「（调段明细，2…」应该是这句被截断后的样子。
- b. 每段的 URL 统一用横向滚动。组标题的 head 改成 `break-all`，不再出现省略号。原来「第 11 段显示省略号」应该是组标题被截断，这一点需要重拍确认。
- c. 每段的标题行（序号、时间、状态）固定为一行（flex-nowrap），状态不会单独换行。「终态」徽章固定放在下一行。
- d. 卡片 grid 加 `items-start`，展开一张卡不会把同排的卡拉成一样高。
- e. 每段左边加一条色条（border-l-4），第二段起加上分隔线，组内的段再加一条缩进竖线。
- f. 步数和 CFG 各占一行（basis-full）。

## 6 LoRA 数量上限（Schema 里的 maxItems）
- 新增 `schemaLoraMaxItems`，到名字含 lora 的数组字段里找 `maxItems`，anyOf / oneOf 里面的也算。
- 超过上限时，在本地返回 400，不发请求。提示为「该端点 Schema 限制最多 N 个 LoRA，当前 M 个（Schema 字段 X.maxItems，来源：<sourceUrl>）」。
- 12:4x CST 实际拿到的 Schema：
  - **WaveSpeed**（https://api.wavespeed.ai/api/v3/models）：`loras.maxItems: 3`，会拦截。
  - **MuAPI**（https://api.muapi.ai/openapi.json）：`loras` 是 `anyOf[array, null]`，**没有 maxItems**，只有 description 里写了「maximum 3」。所以不拦，也不从这段文字去猜上限。
- 遗留问题，本批没有改：`schemaProviders.ts:187` 的内置 loras 定义里写死了 maxItems:3，`:324` 写死了「AIMLAPI LoRA 最多 3 个」。这两处是 AIMLAPI 的旧代码，要不要清理需要另外决定。

## 7 「实际发送」JSON 里的长 URL
- RequestEnvelope 的 pre 改成 `whitespace-pre` 加横向滚动（CODE_NOWRAP），URL 不会从中间断开。

## 8 LoRA 芯片
- 新增 `src/utils/loraDisplayName.ts`：URL 类的 LoRA 只显示最后一段文件名，完整 URL 放在 `title` 里，悬停可见。HistoryModal 里两处芯片都改了。

## 测试
- 新增 `src/server/sharedTrace.test.ts`，共 12 条。
- 用到的 fixture：
  - `src/server/__fixtures__sharedtrace-2026-10-16.json`：MuAPI 和 WaveSpeed 的 loras 字段原样数据，以及 3 张真实历史卡的 requestMetadata；
  - 现有的 WaveSpeed live 目录 fixture。
- 覆盖的场景：submit 加 3 次 poll 全部记进历史；Key 记为 #1，共 2 个；actualRequest、submit、poll 不变；失败卡带完整调用记录；maxItems 拦截时的提示文字和 Schema 来源；Sogni 的 LoRA 数为 1；URL 文件名显示；来源不匹配提示。
- 全量 vitest：1360 条通过，2 条失败，失败的就是已知的 mediaHostedReview。`vite build` 通过。

## 不在本批
- 英文字段名、「未支持」行合并：留给产品决定。
