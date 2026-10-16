# LoRA 不支持：卡片/执行记录改人话（2026-10-15）

## 结论
用户可见的 LoRA 卡 / 横幅 / 徽章与执行记录**首行**改为人话；`comfy:krea2` /「官方 schema」/「loras 字段」/ HTTP·local·API 路径堆叠只进可展开技术细节。拒发逻辑未削弱。

## Before（截图 `/workspace/canvas-e2e-civitai-krea-nolora/`）
- 卡标题：`该服务商不支持`
- 卡正文：`该服务商不支持（civitai / comfy:krea2 的官方 schema 无 loras 字段）`
- 按钮：`旁路此 LoRA 节点`
- 占位：`Civitai trigger words` / `Civitai Model ID (optional)`
- 执行记录首行：`HTTP 400 · local · Civitai Krea v2 官方不接受…（见 https://…）· /api/engine/civitai/generate`
- 底栏被截成半截「见」；同屏另有 Fal 403 未标「这次」

## After（精确新字符串）
| 表面 | 新文案 |
|------|--------|
| 卡/横幅标题 | `当前模型不支持 LoRA` |
| 卡/横幅正文（已选模型且 schema 禁 LoRA） | `这模型不能挂 LoRA，请换支持 LoRA 的模型或先不用这条` |
| 空 checkpoint | `请先选好模型，才能判断能不能挂 LoRA` |
| 未识别模型 | `无法确认这模型能不能挂 LoRA，请先选好模型` |
| 旁路按钮 | `暂时不用这个 LoRA` |
| 占位 | `Civitai 触发词` / `Civitai 模型编号（可选）` |
| 执行记录首行（Krea 拒发） | `这次：这模型不能挂 LoRA，请换支持 LoRA 的模型或先不用这条` |
| 执行记录更早失败 | `更早：…`（与「这次」区分，避免和别次 Fal 失败打架） |
| 底栏按钮摘要 | `这次 ·` + 人话短句（整词截断，不砍「见」） |
| 可展开技术细节 | 保留 civitaiImageContract 官方原文（含 recipe URL）、HTTP/路径/stack |

## 改动文件
- `src/utils/resolveCheckpoint.ts` — `LORA_UNSUPPORTED_*` / `LORA_BYPASS_LABEL`；`isLoraUnsupportedOnEndpoint` 只返回人话
- `src/utils/spatialFrameLoraBanner.ts` — 标题用人话常量
- `src/components/NodeItem.tsx` — 卡标题 + 旁路按钮
- `src/components/ParameterInspector.tsx` / `SpatialFrameItem.tsx` — LoRA 徽章/提示
- `src/constants/nodes.ts` — 占位中文
- `src/utils/apiFailure.ts` — `plainFailureConclusion` / `userFacingApiFailure` / `unicodeSafeSlice`
- `src/services/executionTrace.ts` — ApiTraceError 首行人话
- `src/components/ExecutionLog.tsx` — 首行「这次/更早」；技术细节折叠；stack 不与响应 JSON 重复

## 未改（路由事实）
- `civitaiImageContract` 仍对 krea2+LoRA/负面/宽高 `fail()`，官方拒绝原文保留在响应 `error` 字段
- 不静默剥 LoRA；不换 provider/端点

## 测试
```
npx vitest run \
  src/utils/resolveCheckpoint.test.ts \
  src/utils/apiFailure.test.ts \
  src/components/SpatialFrameItem.loraCopy.test.ts \
  src/components/ExecutionLog.summary.test.ts \
  src/server/civitaiImageContract.test.ts \
  src/schemas/providerSchema.test.ts
→ Test Files 6 passed | Tests 93 passed
```

## 未做
- 未 commit/push
- 未用本机浏览器重截（桌面让给画布）
