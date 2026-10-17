# Krea 挑刺 UI P0 — 2026-10-15

对照 `/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-krea-fe/{04-before-run,05-error}.png` 与画布挑刺严重项。  
**「不会发送」/ schemaSendHint 未动。** 未改 `schemaProviders.ts` / `server.ts`。

## 结论

| # | 现象 | 处理 |
|---|------|------|
| 1 | KSampler 同一条 HTTP 402 红框叠两层 + 半截 JSON；底栏/toast 同样裁切 | 去掉节点内重复红框；`plainFailureConclusion` / `userFacingApiFailure` 把 Krea `HTTP 402: {"message":…}` 收成 **`API 余额不足，请充值后重试`**；完整原文仍在执行记录「技术细节」 |
| 2 | 失败后 KSampler/SaveImage 仍挂旧猫图 | 失败分支 `shouldClearExecutionOutput` 清 `outputData`；`clearNodeExecutionErrors` 对 error 媒体节点也清预览；若残留则半透明 + 「上次预览 · 本次未出图」 |
| 3 | 淡黄无关浮层（挑刺写「未找到可用模型」；本仓无该字面量，实为顶栏/toast 残留与节点缺失文案） | 开跑 / 开模型·LoRA·视频中心时 `setToast(null)`；过期 `selectedNodeId` 不再用 `node-…` 锁死顶栏 |
| 4 | 顶栏「未找到指定的执行节点: node-1791…」露内部 ID | `resolveTargetNode` 不再拼 id；UI 映射为 **`请重新选择要运行的节点`**；过期选中则回退无 target 再算 readiness |
| 5 | LoRA/KSampler 等控件露 EN 键名 | `nodes.ts` 标签：触发词 / Civitai 编号 / 提示词 / 种子 / 步数 / 采样器 / 调度器 / 去噪强度 / 文件名前缀 等 |

产品硬规：402 不美化成假成功；状态仍是 error/402；人话只在首行，上游 JSON 在执行记录。

## 改动文件

- `src/utils/apiFailure.ts` (+ test) — `API_BALANCE_INSUFFICIENT` / `EXEC_NODE_MISSING` / `plainErrorMessage`
- `src/utils/graphEngine.ts` (+ test) — resolve 文案；error 节点清 `outputData`
- `src/App.tsx` — 失败清预览；plain 错误；清 toast；过期选中回退
- `src/components/NodeItem.tsx` — 去重红框；失败预览标记
- `src/constants/nodes.ts` — 中文 widget.label
- `src/components/ExecutionLog.summary.test.ts` / `nodeUI.test.tsx` — 覆盖

## 测试

```
npx vitest run \
  src/utils/apiFailure.test.ts \
  src/utils/graphEngine.test.ts \
  src/components/ExecutionLog.summary.test.ts \
  src/components/nodeUI.test.tsx
→ Test Files 4 passed | Tests 95 passed
```

## 未做

- 未 commit / push
- 未抢浏览器复截（桌面归画布）；请画布用修好的 FE 复跑 Krea 402 再丢图给挑刺
- 未改 Novita/Venice wiring、未动 schemaSendHint、「不会发送」逻辑

## 还原包

`/workspace/canvas/temp/backups/canvas-restore/Canvas-main-pre-krea-tiaoci-ui-p0-20261015-020223.tar.gz`

## 修订 · 402 首行改回透传（产品硬规 · 雁）

此前首行被改写成 `API 余额不足，请充值后重试`。硬规：**上游传回什么就透传什么**，禁止人话摘要改写。

- 已删除 `API_BALANCE_INSUFFICIENT`；`plainFailureConclusion` / `userFacingApiFailure` 对 402 优先抽上游 JSON `message`，否则保留原文首行。
- 例：Krea `HTTP 402: {"message":"Your API balance is separate…"}` → 首行 **`Your API balance is separate from your workspace compute balance. Please top up your API balance to continue using the API.`**
- 完整 `HTTP 402: {…}` 仍可在执行记录技术细节中保留。

