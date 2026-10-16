# Venice UI + Krea 四字段 · 2026-10-16

结论：**CODE_ONLY**（无浏览器；不宣称 PASS）。Krea 服务端 live submit 已含 steps/seed/guidance_scale/styles，上游 **HTTP 402**（欠费原文透传）。前端徽章与 Venice 两处瑕疵已改，待画布重拍。

## Restore
`/workspace/canvas-restore/pre-venice-krea-20261016-093004.tgz`

## 后端
- 旧 PID 2084318 已停；本批只重启一次。
- 新 PID **2396826**，启动时间 **Fri Oct 16 09:36:20 2026（Asia/Tokyo）**（`TZ=Asia/Tokyo ps -o lstart=`）。

## A. Venice 界面

### A.1 参数面板模型名关开不一致
- **根因**：`ProviderModelSelect` 关面板后 remount，`armed=false` 不发目录 GET（clean-0903），`live=[]` → 选中项掉进 `[当前] ${id}`，状态从「目录已返回 N」变成「已选底模」。
- **改**：模块级 `catalogMemory` 记住每家目录的 options + count；重开时用缓存填下拉标签与「目录已返回 N 个模型」，不自动 GET。
- **文件**：`src/components/ProviderModelSelect.tsx`

### A.2 收起执行记录压住节点字
- **根因**：收起条 `fixed bottom-4 left-4` 压在画布左下加载器上；仅标 bottom chrome 不够，用户未 Fit 时仍盖字。
- **改**：收起时挪到中下工具岛左侧 `left-[max(0.75rem,calc(50%-26rem))] bottom-6`，chrome 标在 wrapper；展开仍 `left-4`。不恢复整列 left inset。
- **文件**：`src/components/ExecutionLog.tsx`

## B. 文档
- `docs/evidence/venice-p0-fix-2026-10-15.md` 验收第 4 条：撤回「待确认」；空着「未填写，不发送」；填了照实发，以历史 actualRequest 为准（与画布 2026-10-16 拍板一致）。

## C. Krea `image/bfl/flux-1-dev` 四字段

### 根因
1. `withCachedSchemaProperties` 在节点上已有（可能过期/残缺的）`schemaProperties` 时**直接返回**，挡住本会话 ready 的官方 Schema 缓存 → 徽章误成「不会发送」/omit。
2. 下拉选用模型只走 `noteUserModelSelection`，**不**把 Schema 属性写回 Checkpoint（以前只有 Model Hub apply 写）。
3. LoRA/`styles` 未进徽章别名；参数面板 LoRA 区无 SchemaSendBadge。

### 改动
| 文件 | 内容 |
|---|---|
| `src/services/modelSchemaCache.ts` | ready 缓存优先于节点残缺 schemaProperties |
| `src/App.tsx` | Schema 选用成功 → 写回匹配 Checkpoint 的 `schemaProperties` |
| `src/utils/schemaSendHint.ts` | `loras`/`styles` 别名 + OMIT_CANDIDATE |
| `src/utils/schemaPayloadPlan.ts` | 同别名（徽章与 payload 同源） |
| `src/components/ParameterInspector.tsx` | LoRA 区 SchemaSendBadge（会发送 / Schema 不支持） |

### Live 证据（本机 :3000，重启后）
- Schema GET：`properties` 含 `steps, seed, guidance_scale, styles, …`；`schemaStatus=openapi`；endpoint `https://api.krea.ai/generate/image/bfl/flux-1-dev`
- Submit actualRequest.parameters：
  ```json
  {"prompt":"venice-krea batch probe","steps":25,"seed":7,"guidance_scale":3,"styles":[{"id":"79tzf61yz","strength":0.8}]}
  ```
- 上游：**HTTP 402**（API balance 原文）。算接线通 + PASS_BILLING 级别服务端证据；前端 E2E 留给画布重拍。

## 测试
```
npx vitest run src/services/modelSchemaCache.test.ts \
  src/utils/schemaSendStatus.test.ts src/utils/schemaSendHint.test.ts \
  src/utils/clean1651.test.tsx src/server/kreaProvider.test.ts \
  src/components/venicePostfix.test.ts src/components/veniceReverifyUi.test.tsx
→ 7 files / 51 tests passed
```

## 残留风险
- Venice 目录记忆是进程内模块缓存：整页硬刷新会丢，需再开一次目录才恢复「Name · id」（仍不会静默 GET）。
- 收起执行记录改到中下附近：极宽/极窄视口下可能仍贴近节点，Fit 仍应按 bottom chrome 让开。
- Krea 前端徽章依赖 Schema GET 成功；GET 失败仍正确显示「Schema 不可用，字段不会发送」。
