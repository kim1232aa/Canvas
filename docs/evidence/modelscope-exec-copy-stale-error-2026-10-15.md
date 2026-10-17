# 魔搭执行记录人话 + 残留错误清理（2026-10-15）

## 结论
对照 `/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-modelscope-cn-lora/`（上游 500「模型不存在」，请求已正确带 `loras`）：
1. **执行记录 / 节点主视线**改为人话结论，不再把 `[500]`、完整 JSON、`request_id` 堆在首行。
2. **换引擎 / 重跑**清掉节点与取景框残留红框错误（如旧 Civitai）。
3. **客户端请求快照**里 CheckpointLoader 标题按当前 `targetProvider` / 路由重写，禁止 WaveSpeed 标题对着魔搭请求。

上游接线与 LoRA 发送逻辑未改；不 mock 成功。

## Before（证据截图）
- 执行记录首行：`魔搭国内站 (modelscope.cn) API 提交失败 [500]: {"errors":{"message":"…模型不存在"},"request_id":"…"}`
- KSampler 红框同上 JSON 黑话
- 客户端请求 JSON 内 `CheckpointLoaderSimple.title` 仍为 `加载基础模型 (WaveSpeed)` / WaveSpeed 字样，而 `route` 为 `/api/modelscope/generate`
- 换供应商后旧错误可能仍挂在节点上

## After（精确新字符串）
| 表面 | 新文案 |
|------|--------|
| 执行记录首行 / 节点主视线（国内站 模型不存在） | `魔搭国内站找不到这个模型或 LoRA` |
| 执行记录首行（国际站 模型不存在） | `魔搭国际站找不到这个模型或 LoRA` |
| 底栏短摘要 | `这次 · 魔搭国内站找不到这个模型或 LoRA`（整句可进 28 字切片，保留「找不到模型/LoRA」要点） |
| 客户端请求折叠标题 | `客户端请求 JSON · 魔搭 CN`（按 route，不是节点旧 title） |
| 快照内 CheckpointLoader.title | `加载底模 (魔搭 CN)`（由 `targetProvider=modelscope` 推导） |
| 技术细节折叠 | 保留 HTTP 500、上游 JSON、`request_id`、完整路径 |
| 执行记录顶栏说明 | `这里能查每次生成发了什么、哪里出错。密钥不会显示。有没有出图，以画布上的结果为准。` |
| LoRA 节点标题悬停 | `title` = 完整 `lora_name` |

## 改动文件
- `src/utils/apiFailure.ts` — `MODELSCOPE_MODEL_MISSING_CN/AI` + `plainFailureConclusion` 识别「模型不存在」
- `src/utils/graphEngine.ts` — `sanitizeExecutionSnapshotNodes` 同步 Checkpoint 标题；新增 `clearNodeExecutionErrors`
- `src/App.tsx` — 换 `targetProvider` / 开跑清残留错误；失败文案用人话；Inspector 换引擎同样清理
- `src/components/ExecutionLog.tsx` — `providerLabelFromRoute` / `alignRequestSnapshotProvider`
- `src/components/NodeItem.tsx` — 红框人话；LoRA 标题悬停全名
- `src/components/SpatialFrameItem.tsx` — 取景框错误人话
- 测试：`apiFailure.test.ts`、`graphEngine.test.ts`、`ExecutionLog.summary.test.ts`

## 测试
```
npx vitest run \
  src/utils/apiFailure.test.ts \
  src/utils/graphEngine.test.ts \
  src/components/ExecutionLog.summary.test.ts
→ Test Files 3 passed | Tests 80 passed
```

## 未做
- 未 commit / push
- 未抢浏览器重截（桌面留给画布 Realism LoRA E2E）
- 未改 ModelScope 上游接线 / 未静默剥 LoRA / 未假装出图

## 还原包
`/workspace/canvas/temp/backups/canvas-restore/Canvas-main-pre-ms-exec-copy-20261015-013115.tar.gz`
