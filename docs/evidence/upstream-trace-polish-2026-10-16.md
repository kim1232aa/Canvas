# 上游交互区打磨（2026-10-16）— CODE_ONLY

状态：CODE_ONLY，待画布前端重拍 + 挑刺看图。还原包：/workspace/canvas-restore/pre-upstream-trace-20261016-114934.tgz（不含 node_modules/.git）。

## 改动
- `src/components/HistoryModal.tsx` `UpstreamExchanges`/`UpstreamBody`
  1. 每段标「第 n / N 段」+ 调用时间（Asia/Shanghai，取 trace 自带 `startedAt`；缺失显示「未记录时间」，不推测）。
  2. 终态高亮（规则见下）+ 徽标「终态 · 本次出图」。
  3. 相邻且 method + endpoint + HTTP 状态 + 响应体身份（外置原文 sha256 / 内联原文）完全相同的调用折成一行：「第 2–10 / 11 段 · RUNNING ×9」，可展开逐段查看（每段独立标号/时间/原文）。
  4. endpoint、task_id、JSON 原文：`white-space: pre` + 横向滚动，不再 `overflow-wrap:anywhere` 中间断词。
  5. 原文开关文案随状态：收起时「（N 字节，点开读取）」，展开时「（收起）」。
- `src/utils/historyParameters.ts`：`upstreamCallTime`、`upstreamBodyKey`、`upstreamBodyStatus`、`groupUpstreamExchanges`、`terminalSuccessIndex`、`upstreamSegmentLabel`；行带 `startedAt`。
- `server.ts`：所有 provider 共用的 trace 记录（成功与异常两处）新增 `startedAt`（ISO，请求发起时刻）。

## 规则（通用，不认 provider）
- 状态显示：读响应原文顶层第一个名为 `status`/`state` 或以 `_status`/`_state` 结尾的字符串字段（如 task_status）。原文原样，不翻译不映射；无此字段则只显示 HTTP 状态。
- 终态高亮：卡片有输出媒体（hasOutputMedia）且**最后一次**上游交互为 HTTP 2xx 时，高亮最后一段；否则不高亮。不匹配 SUCCEED 等供应商字符串。
- 外置原文在展开「上游交互」时从本地 /api/media/raw 读取（无上游调用、无计费）。

## 已知限制
- 1121/1137 记录生成于本改动前，trace 无 `startedAt`，因此 11 段都显示「未记录时间」（如实）。新时间只在重启后的新出图里出现。

## 测试
- 新增 `src/utils/upstreamTracePolish.test.tsx` 7 条（用真实 1137 记录 fixture `src/utils/__fixtures__/modelscopeSuccess1137.json`：11 段、分组 1 | 2–10×9 | 11、终态索引 10、时间、开关文案、无断词 class）全过。
- 全量：155 文件，1345 条，1343 过，2 失败均为已知 `mediaHostedReview`。
