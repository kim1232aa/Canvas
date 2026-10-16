# AIMLAPI FE 执行记录 P0 修复（2026-10-15）

## 结论
状态：CODE_ONLY，待画布前端复验。不是 PASS。
对应失败：`/workspace/canvas-e2e-aimlapi-fe/outcome.json` = `FAIL_EXEC_LOG_NO_LORA_REQUEST`（05-error.png / 06-exec-or-history.png）。
上游证据：`logs/upstream.log`，2026-10-14T18:07:05Z（北京时间 02:07），POST `api.aimlapi.com/v1/images/generations` → 403，`You've run out of funds…`，`err_insufficent_credits`。

## 根因
1. **假成功文案**：`SchemaProviderDriver` 会先发 `GET /api/model-schema`（tracedFetch）→ 执行记录状态为 complete。`plainSuccessConclusion` 在出图张数为 0 时回退到 `出图完成`，站点又回退到 `上游`，于是就显示成「上游出图完成」。
2. **看不到 actualRequest**：submit 返回 403 时，服务端 `fail()` 其实带了 `actualRequest`，但 ExecutionLog 只渲染「客户端请求 JSON」和原始 response，没有单独的 actualRequest 折叠；`humanSummaryText` 也没读 response 里的 loras。
3. **403 被截断**：`plainFailureConclusion` 的透传分支只认 402。AIMLAPI 欠费返回的是 403，于是落到 `unicodeSafeSlice(first,120/80)`，结果带 `…`。

## 修复
- `src/utils/apiFailure.ts`：新增 `isBillingFailureText`（402 / 403+funds / run out of funds / err_insufficent_credits，排除 Cloudflare 的 403）和 `errorBannerText`。欠费时首行用上游 JSON 的 `message` 原文，不截断。`extractUpstreamMessage` 支持 `error.message`。
- `src/components/ExecutionLog.tsx`：`plainSuccessConclusion` 只在真的有图时才写「出图 N 张」；目录或 Schema 请求一律不再写「出图」。新增「实际上游请求 actualRequest」折叠（失败时默认展开，标题带 `loras×N`）。补上 `extractLorasFromRecord` / `actualRequestFromResponse`，新增 AIMLAPI/Krea/Novita/Venice/Together 的站点标签。
- `src/engines/drivers/SchemaProviderDriver.ts`：Schema 查询不再进执行记录（submit/poll/save-result 照常记录）。
- `NodeItem.tsx` / `SpatialFrameItem.tsx`：红框改用 `errorBannerText`。

## 挑刺视觉项
| 项 | 状态 |
|---|---|
| AIMLAPI 流程里出现「Civitai 编号」 | 已修：只有 provider=civitai 时才显示 |
| 失败后 SaveImage 仍显示「等待生成图像…」 | 已修：同一分支失败时显示「这次没有出图 / 上游节点失败，原因见红框与执行记录」（新增 `upstreamFailed` 字段，重跑或成功时清除） |
| LoRA 黄色提示框压住下方提示词节点 | 未修（需要调布局或节点高度，没有浏览器就无法确认） |
| KSampler sampler/scheduler「未指定」没有标记 | 未修：`isSchemaOmitCandidate` 依赖本节点 `custom_parameters._canvas.schemaProperties`，KSampler 本身没有，需要从 Checkpoint 把 Schema 属性传过来 |
| LoRA 标题或模型名被截断 | 未改：LoRA 标题已有 `title` 悬停全名 |

## history.json
未改。SchemaProvider 只在成功后通过 `save-result` 写历史；其他 provider 失败时也不写。要记录失败的计费尝试，需要产品先拍板。现在 actualRequest 在执行记录里可以查到。

## 测试
`npx vitest run src/components src/utils src/services src/engines` → 61 个文件，541 个用例全部通过。
全量跑有 2 个失败，都在 `src/server/mediaHostedReview.test.ts`：缺 `/hosting/server.generated.ts`，属于本次改动之前的环境问题。

## 复验（画布）
硬刷新后用 AIMLAPI `alibaba/z-image-turbo-lora` + LoRA `ostris/z_image_turbo_childrens_drawings` @0.85 跑一次。预期：
- 执行记录里没有「出图完成」；首行为完整的 `You've run out of funds. Please top up your balance or update your payment method to continue: https://aimlapi.com/app/billing/`
- 「实际上游请求 actualRequest · AIMLAPI · loras×1」展开后有 `parameters.loras[{path,scale:0.85}]`
- KSampler 红框是同一句完整原文，没有 `…`
- SaveImage 显示「这次没有出图」，LoRA 卡上没有「Civitai 编号」

## 还原包
`/workspace/canvas-restore/Canvas-main-pre-aimlapi-fe-exec-log-p0-20261015.tar.gz`
未 commit / push，未使用浏览器。
