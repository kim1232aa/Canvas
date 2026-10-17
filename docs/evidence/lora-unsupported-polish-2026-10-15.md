# LoRA 不支持 UI 小修（不挡验收）（2026-10-15）

## 结论
挑刺严重项已过；本轮只改文案/呈现，**拒发路由未改**。

## 截图基线
`/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-civitai-krea-nolora-recheck/01-lora-card-plain.png`
`/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-civitai-krea-nolora-recheck/02-exec-log-plain.png`

## 四条小修

| # | 现象（改前） | 改后 |
|---|--------------|------|
| 1 | 人话结论下直接露 `POST /api/engine/...` | 方法+路径只进折叠「技术细节」；外层只留时间 |
| 2 | 面板顶说明堆「端点 / 参数转换 / HTTP 200」 | `按时间记下每次点运行后发生了什么。密钥不会显示。有没有出图，以画布上的结果为准。` |
| 3 | 卡正文重复标题意：`这模型不能挂 LoRA，请换…` | 正文只留下一步：`请换支持 LoRA 的模型或先不用这条`（标题仍为 `当前模型不支持 LoRA`） |
| 4 | 「这次」写进散文前缀；「查看完整异常堆栈」默认大红 | 「这次」/「更早」为小标签；堆栈折叠为 `text-slate-400` 次要控件 |

## 精确新正文
```
请换支持 LoRA 的模型或先不用这条
```
常量：`LORA_UNSUPPORTED_MESSAGE`（`src/utils/resolveCheckpoint.ts`）
执行记录首行：`[这次]` 小标签 + 同上正文（不再 `这次：这模型不能挂…`）

## 改动文件
- `src/utils/resolveCheckpoint.ts` — 正文常量；`isFalLoraEndpointError` 识别新句
- `src/utils/apiFailure.ts` — `plainFailureConclusion` 复用常量
- `src/utils/apiFailure.test.ts`
- `src/components/ExecutionLog.tsx` — 顶说明、标签、路径进技术细节、堆栈降调
- `src/components/ExecutionLog.summary.test.ts`

## 未改
- `civitaiImageContract` 拒发 / 不静默剥 LoRA
- 未 commit/push；未开浏览器重截

## 测试
```
npx vitest run \
  src/utils/resolveCheckpoint.test.ts \
  src/utils/apiFailure.test.ts \
  src/components/SpatialFrameItem.loraCopy.test.ts \
  src/components/ExecutionLog.summary.test.ts \
  src/server/civitaiImageContract.test.ts
```
