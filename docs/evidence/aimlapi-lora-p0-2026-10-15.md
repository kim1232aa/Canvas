# AIMLAPI z-image-turbo-lora P0（+ Krea 共用修复）— 2026-10-15 — CODE_ONLY + 本地 curl 实证
回滚包：`/workspace/canvas/temp/backups/canvas-restore/pre-aiml-lora-0229.tgz`。未提交。前端复验待画布。

## 根因
1. **LoRA 其实已出站，只是看不到。** `data/history.json` 中 02:23:22（画布 FE 那次）的 submissions：上游 body 含 `loras:[{path:"ostris/z_image_turbo_childrens_drawings",scale:0.85}]`（同时含 `num_inference_steps:17`、`guidance_scale:3.5`）。
   看不到的原因：
   - 执行记录只存内存，复验时硬刷新后 POST 记录丢失，只剩刷新后的 `GET /api/models`（截图「执行记录 · 1」，时间 18:26Z 晚于 18:23Z 的提交）。
   - 历史卡 LoRA 行只读 `item.loras`（失败条目为 []），不读 actualRequest。
   - 历史尺寸只认 width/height，不认 `image_size{width,height}` 别名 → 显示「未发送」。
2. **steps 17 / CFG 3.5 出站 = 用了错的静态 Schema。** AIMLAPI 分支用代码内共享静态 `aimlapiImageInputSchema`（steps max 50、含 guidance_scale），且服务端不校验 min/max。官方 per-model OpenAPI 实际是：num_inference_steps 1–8，无 guidance_scale、无 negative_prompt。目录 `info.docsJson` 里本就给了这份官方 Schema（`api.aimlapi.com/docs-json?model=…`）。
3. **徽标「待确认」**：画布只在打开「API 参数」编辑器时才拉 Schema；KSampler/检查器从不自动加载 → Krea 与 AIMLAPI 同因。

## 修复（通用，非供应商特化 UI）
- `src/server/schemaProviders.ts`：AIMLAPI model-schema 读目录 `info.docsJson` 官方 OpenAPI（`openApiRequestSchema()`），`schemaStatus:'official-docs-json'` + `schemaSource`；拉取失败则用静态快照并标 `static-docs-snapshot` + `docsJsonError`（不静默）。新增通用 `schemaConstraintViolation()`：submit 时对画布映射字段按已声明 Schema 校验 min/max/integer/enum/maxItems（含 image_size 嵌套），越界 → 本地 400，原因带来源 URL，**不改值**。所有 schema 供应商生效。
- `src/services/modelSchemaCache.ts`（新）：按 (provider, model) 拉 `/api/model-schema`（与提交同源），`Canvas.tsx`/`ParameterInspector.tsx` 用其 properties 判会发送/不会发送；失败保持「待确认」。`App.tsx`/`Canvas.tsx` 订阅以重渲染。
- `src/utils/apiFailure.ts` `upstreamHttpFirstLine()`：所有上游失败首行 = `HTTP <code> <上游 body 原文>`（节点红框、执行记录、toast）。
- `src/services/executionTrace.ts`：执行记录存 sessionStorage（刷新不丢；单条 >20KB 截断并注明）；`isNonGenerationRecord()`、`formatRecordTime()`（本地时区）。`ExecutionLog.tsx`：目录/Schema GET 归入折叠组「目录 / Schema 请求（非生成）」，不再显示「完成」。
- `src/utils/historyParameters.ts`：`image_size` 别名回填宽高；`sentHistoryLoras()` 从 actualRequest 读 loras/styles/lora_list。`HistoryModal.tsx` 用之；失败/本地拦截卡内容在方块内滚动，不再挤下方行。
- `App.tsx`：失败节点的下游（VAE→保存图像）标 upstreamFailed，显示「这次没有出图」而非「等待生成图像…」。
- 「Civitai 编号」：已仅在 civitai 供应商渲染（NodeItem 既有判断），复验截图 0 处。

## 本地 curl 实证（:3000，服务端 .env key，未打印）
`docs/evidence/aimlapi-lora-p0-2026-10-15/aiml-steps17.json`、`aiml-steps8.json`
- (a) steps 17 → **HTTP 400 local**：`aimlapi 模型 alibaba/z-image-turbo-lora：num_inference_steps=17 超出官方 Schema 范围 [1, 8]（来源：https://api.aimlapi.com/docs-json?model=alibaba%2Fz-image-turbo-lora&endpoint=openai%2Fimage-generations）；未发送请求，未自动改值。` trace 仅两条 GET（目录 + docs-json），无 POST；history `local_blocked`。
- (b) steps 8 + cfg 3.5 + LoRA 0.85 → 上游 POST `https://api.aimlapi.com/v1/images/generations` **403**；上游 body：
  `{"prompt":"a childrens drawing of a red boat","num_inference_steps":8,"seed":424242,"loras":[{"path":"ostris/z_image_turbo_childrens_drawings","scale":0.85}],"model":"alibaba/z-image-turbo-lora","image_size":{"width":1024,"height":768}}`（无 guidance_scale）；响应原文 `{"title":"Forbidden","status":403,"message":"You've run out of funds. …","kind":"err_insufficent_credits"…}`；history `failed`、upstreamStatus 403、actualRequest 含 loras。→ PASS_BILLING 级别证据。

## 测试
- `src/server/aimlapiLoraP0.test.ts`（官方 docs-json fixture `src/server/__fixtures__/aimlapi-z-image-turbo-lora.docs-json.json`）：画布图 → extractWorkflowParameters → submit。**改前 3/3 失败，改后 3/3 通过。**
- `src/services/modelSchemaCache.test.ts`（AIMLAPI + Krea 徽标）、`historyParameters.test.ts` +2、`apiFailure.localNotOutbound.test.ts` +2（HTTP 首行）；按新硬规更新 4 条旧断言（首行由裸 message 改为 `HTTP <code> <body>`）。
- `vitest run src`：968 过，2 失败为既有 mediaHostedReview（缺 hosting 构建产物）。tsc 无新增错误。

---
## 追加（02:45）：AIMLAPI 去掉静态 Schema 兜底（铁律 3）— CODE_ONLY
回滚包：`/workspace/canvas/temp/backups/canvas-restore/pre-aiml-nofallback-*.tgz`
- `schemaProviders.ts` AIMLAPI model-schema：只用目录 `info.docsJson` 官方 OpenAPI。目录项无 docsJson / 主机不属 AIMLAPI / GET 失败 / 无 POST requestBody schema → 本地 400：
  `未出站，本地拦截：AIMLAPI 模型 <id> 官方 Schema 不可用（GET <docsJson URL> → HTTP <code> <上游 body 原文>）；未发送生成请求，不使用内置 Schema 兜底。`，附 `schemaUrl`、`upstreamStatus`、`upstreamResponseBody`。submit 前即拦截 → 中间件写 `local_blocked` 历史；`/api/model-schema` 同样 400 → 徽标缓存 error → 「待确认」。
  静态 `aimlapi*InputSchema` 常量仍导出（旧单测引用），**不再被任何 AIMLAPI 路径使用**。
- `apiFailure.ts`：`localNotOutboundText` 不重复加前缀。
- 测试：`aimlapiLoraP0.test.ts` +2（docs-json 503 → 本地 400 含 URL + `HTTP 503 {"error":"Service Unavailable"}`、无 POST；目录无 docsJson → 本地 400）；`apiFailure.localNotOutbound.test.ts` +1；`schemaContract.test.ts` AIMLAPI 夹具补 `info.docsJson` + 官方形状 OpenAPI（原夹具依赖已删除的兜底）。
  `vitest run src`：970 过；3 失败 = 2 既有 mediaHostedReview + 1 `schemaContract` OpenWorks video（还原本次两文件后仍失败 → 属另一 executor 正在改的 server.ts/OpenWorks 分支，非本次）。
- 实测 :3000：steps 8 + LoRA → GET 目录 200、GET docs-json 200、POST 403（正常路径未受影响）。

### 其他 schema 供应商同类静默兜底（仅列出，未修）
- **Together**：`inputSchema: entry.parameters || (isVideo ? togetherVideoInputSchema : togetherImageInputSchema)` — 目录无 parameters 时用代码内静态 Schema，schemaStatus 仍标 `docs-openapi`。
- **Novita**：`entry.parameters || (isVideo ? novitaVideoInputSchema : novitaImageInputSchema)` — 同上，标 `docs-openapi`。
- **Venice**：`entry.parameters || (isVideo ? veniceVideoInputSchema : veniceImageInputSchema)` — 同上，标 `docs-openapi`。
- **WaveSpeed**：无 model_run 定义时端点回退为 `root + '/api/v3/' + model`，inputSchema=null、schemaStatus `unknown`（有 note 说明，非完全静默，但仍是端点兜底）。
- **Sogni**：固定版本协议 Schema（有 note 说明版本，非运行时兜底）。
- **Krea**：`entry.parameters || null`（无兜底）。
