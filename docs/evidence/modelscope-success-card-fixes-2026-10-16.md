# 魔搭国际站成功卡四处修复（2026-10-16，CODE_ONLY）

状态：CODE_ONLY（单测通过，未做前端 E2E；无付费调用；未 commit/push）。
还原包：/workspace/canvas/temp/backups/canvas-restore/pre-modelscope-success-20261016-113200.tgz（排除 node_modules）
依据：/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-modelscope-ai-lora-1121/（run-notes.txt）与 data/history.json 中 hist_1792121319067_i9lp9。

## 根因与修复（通用，不含供应商特化）
1. 成功卡无原样请求 / 提示条「未返回 actualRequest」
   - 根因：成功卡和提示条只读 `requestMetadata.actualRequest` / 响应里的 `actualRequest`；魔搭等路由成功时只记录 `actualParameters` + `submissions` + `executionTrace`，没有 `actualRequest` 键。
   - 修复：`historyActualRequest(item)`（historyParameters.ts）= 路由自带 actualRequest，否则最后一次出站 submission 的 `{endpoint, parameters}`（原样，不用画布值拼）；生成 POST 未发出时返回空。成功卡「实际发送（原样请求体）」用它；新增 `historyUpstreamExchanges` + `UpstreamExchanges`/`UpstreamBody`（HistoryModal.tsx），列出 submit + poll 每次的方法、端点、状态码，点开按 raw-response URL 读取原始字节。提示条的 LoRA 统计也改读同一条历史记录。
2. 种子说法打架
   - 事实：上游 submit 响应 `{"task_status":"SUCCEED","task_id":…,"request_id":…}`、poll 响应 `{"input":{"outputs":{}},"output_images":[…],…}`，都没有 seed。42 是实际发送值。
   - 根因：路由把发送值放进结果 `seed`，提示条把 `result.seed` 当「上游返回」；卡片读 `upstreamSeed`/trace，判断正确。
   - 修复：提示条按响应里的 `historyItem.id` 在刚拉取的历史中找到本次记录（`findRunHistoryItem`，runHistoryItem.ts），种子文案统一用 `historySeedStatement`；找不到记录时明说无法核对，不猜。
3. 模型行缺「实际发送」芯片
   - 根因：`historyModelSent` 只认 `actualRequest`。修复：改用 `historyActualRequest`，submission 里的 model 与显示一致即出芯片。
4. 「仅填入当前节点」新建了 LoRA 节点
   - 根因：按钮调用 `onSelectLoRA`→`handleSelectLoRAFromCivitai`，非 civitai 供应商（魔搭）直接走 `handleSelectLoRAWithBaseModel`→`handleAddLoRANodeToCanvas`；graph 模式无 targetLoRANodeId 时也走新建。
   - 修复：新增 `onFillCurrentLoRANode` 属性，只供该按钮；App `handleFillCurrentLoRANode` 用 `resolveFillLoraNodeId`（fillLoraNode.ts）定位当前 LoRA 节点（选择器目标，否则选中的 LoRALoader），只改值；没有当前 LoRA 节点就报错提示，不新建。spatial 模式行为不变。

## 文件
src/utils/historyParameters.ts、src/utils/runHistoryItem.ts（新）、src/utils/fillLoraNode.ts（新）、src/components/HistoryModal.tsx、src/components/CivitaiModal.tsx、src/App.tsx、
src/utils/modelscopeSuccessCardFix.test.tsx（新，9 条）、src/utils/__fixtures__/modelscopeSuccess1121.json（真实成功记录，去掉 workflowSnapshot）。

## 测试
- 新增 9 条全过。
- 全量：154 文件 / 1338 条，2 条失败，均为已知 mediaHostedReview（缺 hosting/server.generated），与本次无关。

## 重启（仅一次）
新 PID 2708202，/proc/<pid>/stat 第 22 字段 starttime ticks 12073815，ps lstart Fri Oct 16 11:35:05 2026；日志 /tmp/canvas-dev-msuccess-1135.log；GET / 200。

## 待前端验收
需画布在前端重开 1121 成功卡/重跑：看到原样请求体 + 两次上游交互、提示条与卡片种子一致、模型行芯片、「仅填入当前节点」不新建节点。
