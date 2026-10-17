# 执行记录成功人话 + 空请求快照隐藏（2026-10-15）

## 结论
对照 Realism LoRA 成功态截图 `/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-modelscope-cn-lora-realism/03-execution-log-desktop.png`（首行仅「完成」、客户端请求 JSON 下空白黑框）：

1. **成功首行**改为人话结论，不再只写「完成」。
2. **客户端请求 JSON** 在对齐/脱敏后为空、`{}`、`null` 时**整块不渲染**（不留空黑 `<pre>`）。
3. Tensor.Art (OpenWorks) 历史角标**未改**（产品确认保留）。
4. 顺带：节点字段去黑话、历史标题、LoRA 兼容性脚注文案。

未抢浏览器；未 commit / push；未 mock 出图。

## Before
- 执行记录成功首行：`完成`
- 客户端请求 JSON 展开：空白黑框（`request` 空/`{}`/`undefined` 时 `JSON.stringify` 无可见内容）
- LoRA 卡：`lora_name` / `strength_model（必填…）` / `Civitai 模型编号`
- 历史标题：`生成历史记录 (Generation Queue History)`
- LoRA 脚注：`兼容性待验证：…metadata…`

## After（精确新字符串）
| 表面 | 新文案 |
|------|--------|
| 执行记录成功首行（魔搭 CN + Realism LoRA ×1） | `魔搭国内站出图 1 张，挂了 Realism LoRA，强度 1` |
| 成功无 LoRA | `魔搭国内站出图 1 张` |
| 空客户端请求 | **不渲染**「客户端请求 JSON」折叠（无空黑框） |
| 有内容时折叠标题 | `客户端请求 JSON · 魔搭 CN`（按 route） |
| 底模字段 | `底模` |
| LoRA 名称 / 强度 | `LoRA 名称` / `LoRA 强度`（悬停：`必填，禁止默认 0.8`） |
| 模型编号占位 | `模型编号（可选）` |
| 历史标题 | `生成历史` |
| LoRA 未验证脚注 | `还不确定这个 LoRA 和底模能不能配合，出图后再看效果` |

## 改动文件
- `src/components/ExecutionLog.tsx` — `plainSuccessConclusion` / `shortLoraDisplayName` / `extractLorasFromRequest` / `countGeneratedImages` / `isEmptyClientRequestSnapshot` / `clientRequestSnapshotText`；成功首行人话；空快照隐藏；`providerLabelFromRoute` 兼容 `/api/engine/modelscope`
- `src/components/ExecutionLog.summary.test.ts` — 成功结论 + 空快照用例
- `src/constants/nodes.ts` — 字段标签/占位中性化；`strength_model.title`
- `src/types/graph.ts` — `WidgetDef.title?`
- `src/components/NodeItem.tsx` — label/slider 悬停 title；兼容性脚注人话
- `src/components/HistoryModal.tsx` — 标题「生成历史」
- `src/components/nodeUI.test.tsx` — 对齐新脚注

## 测试
```
npx vitest run \
  src/components/ExecutionLog.summary.test.ts \
  src/components/nodeUI.test.tsx \
  src/utils/apiFailure.test.ts \
  src/utils/graphEngine.test.ts
→ Test Files 4 passed | Tests 88 passed
```

## 未做
- 未 commit / push
- 未抢浏览器重截（请画布 / 挑刺用新人话成功屏复核）
- 未改 Tensor.Art (OpenWorks) 角标
- 未改上游接线 / 未静默剥 LoRA

## 还原包
`/workspace/canvas/temp/backups/canvas-restore/Canvas-main-pre-exec-success-plain-20261015-014200.tar.gz`

## 对照证据（合前）
- `/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-modelscope-cn-lora-realism/03-execution-log-desktop.png`
- `/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-modelscope-cn-lora-realism/02-after-run.png`
- `/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-modelscope-cn-lora-realism/05-history.png`
- outcome：`PASS_GENERATION`
