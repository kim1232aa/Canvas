# Provider Schema 契约测试 — 2026-10-15

- 测试文件: `src/server/schemaContract.test.ts`（7 个用例）
- 夹具: `docs/provider-schema-drafts/{krea,together,aimlapi,novita,venice}.json`（声明字段从草案读取，不手写）
- 走真实构建器: `POST /api/schema-provider/:provider/submit`（`registerSchemaProviderRoutes`），上游为本地 fixture（不联网、无密钥）；同时断言 `src/utils/schemaSendHint.ts::isSchemaOmitCandidate` 不对已声明字段标「不会发送」。
- 断言: 画布填了且草案声明的字段 → 必须出现在 `actualRequest.parameters`（按官方名映射）、上游实际 body 与之一致、mapping 中无 `sent:false`。
- 级别: CODE_ONLY（单测）。不等于前端 E2E。

## 结果（`npx vitest run src/server/schemaContract.test.ts` → 7/7 PASS）

| 供应商/端点 | 映射断言 | 结果 |
|---|---|---|
| Krea `bfl/flux-1-dev` | seed, steps, cfg→guidance_scale, width, height, LoRA→styles[{id,strength}] | PASS |
| Krea `ideogram-4.5`（反例） | steps/cfg 未声明 → 允许标「不会发送」；seed 不标 | PASS |
| Together image | seed, steps, cfg→guidance_scale, width, height, negative_prompt；LoRA 本地拒绝(image_loras 已停用) | PASS |
| AIMLAPI `alibaba/z-image-turbo-lora` | seed, steps→num_inference_steps, width/height→image_size{width,height}, loras[{path,scale}] | 修复前 FAIL → 修复后 PASS |
| AIMLAPI `blackforestlabs/flux-2-lora` | 同上 + cfg→guidance_scale | 修复前 FAIL → 修复后 PASS |
| Novita txt2img | request.{seed,steps,guidance_scale,width,height,negative_prompt,loras[{model_name,strength}]} | PASS |
| Venice image/generate | seed, steps, cfg→cfg_scale, width, height, negative_prompt；自定义 LoRA 本地拒绝 | PASS |

## 发现并修复的问题（AIMLAPI 尺寸）
现象: 画布 width/height 实际已打包为 `image_size{width,height}` 发送，但执行记录 mapping 同时写 `width/height sent:false`（“没有对应官方 Schema 字段”），`schemaSendHint` 也会把 width/height 标「不会发送」——显示与实际发送不符（违反“发什么显示什么”）。
修复（最小、Schema 驱动）:
1. `src/server/schemaProviders.ts` submit: 当 Schema 的 `image_size` 声明了 `{width,height}` 对象形状、且无顶层 width/height 时，循环内跳过 width/height 的 sent:false，由 `width+height → image_size` 映射记录；该打包逻辑从 `provider==='aimlapi'` 分支改为按 Schema 形状判断。
2. `src/utils/schemaSendHint.ts`: `width/height` 别名加入 `image_size`。

## 备注
- 草案 `aimlapi.json` 的 `flux-2-lora` 未列 `image_size`，代码 Schema（共享 aimlapiImageInputSchema）有；测试以 UI 实际收到的 inputSchema 为提示依据，并断言草案字段 ⊆ inputSchema。建议 Researchy/tinkabot 核对 flux-2-lora 官方是否有 image_size。
- 全量 vitest: 102/103 文件通过；唯一失败 `src/server/mediaHostedReview.test.ts`（缺 `/hosting/server.generated.ts`，改动前即失败，无关）。
- 未改 ExecutionLog / apiFailure；未提交/推送；未读取 .env。
