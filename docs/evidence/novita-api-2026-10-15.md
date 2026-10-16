# Novita 接入证据 · 2026-10-15

结论：**PASS_BILLING（服务端 live smoke）**。接线与官方文档 / tinkabot Schema 草案对齐；`.env` 中 `NOVITA_API_KEY` 有效（目录 200、余额可读 `availableBalance=0`）。付费生图 `POST /v3/async/txt2img` 在 `{extra,request}` 内携带真实 LoRA `loras[{model_name,strength}]` 及 seed/steps/guidance_scale/width/height/sampler_name/negative_prompt 后，上游返回 **HTTP 403**（`NOT_ENOUGH_BALANCE` / insufficient balance）。缺 strength 的 LoRA → 本地 **400**（禁止静默 0.8）。目录 checkpoint≈100、LoRA≈100（单页 limit=100）。**未做前端浏览器 E2E**（桌面归画布），不是 PASS_GENERATION。

## 官方来源（本次实时抓取）
- 索引：https://docs.novita.ai/llms.txt
- 审计：`docs/provider-api-audit/novita.md`（2026-10-15）
- Schema 草案：`docs/provider-schema-drafts/novita.json`（tinkabot）
- V2→V3 迁移（txt2img + LoRA）：https://docs.novita.ai/guides/model-apis-v2-to-v3-migration
- Task Result：https://docs.novita.ai/api-reference/model-apis-task-result
- Get Model：https://docs.novita.ai/api-reference/model-apis-get-model
- Auth / Balance / Error：basic-authentication · basic-get-user-balance · basic-error-code
- 欠费：官方 Image 表写 `BILLING_BALANCE_NOT_ENOUGH`→400；本次冒烟上游返回 **403 `NOT_ENOUGH_BALANCE`**（与 LLM 表一致），原样上报

## 用到的官方端点
| 用途 | 端点 |
|---|---|
| 模型中心目录 | `GET https://api.novita.ai/v3/model?filter.types=checkpoint&filter.visibility=public&pagination.limit=100`（调用 ID=`sd_name_in_api`） |
| LoRA 中心 | `GET /v3/model?filter.types=lora&filter.visibility=public&pagination.limit=100` |
| 图像生成 | `POST /v3/async/txt2img`（body `{extra, request}`，返回 `task_id`；**禁止当同步出图**） |
| 图生图 | `POST /v3/async/img2img`（同轮询；本冒烟未跑） |
| 异步轮询 | `GET /v3/async/task-result?task_id=` → `task.status` ∈ QUEUED/PROCESSING/SUCCEED/FAILED；成功 `images[].image_url` |
| Key 测试 / 余额 | `GET /openapi/v1/billing/balance/detail`（单位 1/10000 USD） |
| 视频（已接线端点，目录暂无独立视频页） | `POST /v3/async/txt2video` · `POST /v3/async/img2video` + 同上 task-result（SDK 证实；Mintlify 专页部分 404） |

## LoRA：官方能力
| 路径 | LoRA | 字段 |
|---|---|---|
| SD async txt2img / img2img | 是 | `request.loras[{model_name,strength}]`，strength **[0,1]**，须显式传，最多 5 |
| SDK txt2video | 是 | 同上（schema 已声明） |
| Ming OpenAI images | 否 | **未接入**本 adapter（无 LoRA/seed）；若未来挂载须本地 400 |

付费冒烟 **必须带真实 LoRA**（本集成已做到）：`model_name=more_details_59655`（目录 `sd_name_in_api`），`strength=0.75`。

## 代码改动
- `src/server/schemaProviders.ts`：`novita` 供应商；`novitaCatalogRows` / `novitaLoraCatalogRows` / `novitaLoras` / `novitaTaskStatus` / `novitaOutputs`；submit 包装 `{extra,request}`；poll `task-result`；缺 strength / 超范围 / 无 loras 字段 → 400
- `server.ts`：`NOVITA_API_KEY`→`novitaKey`、Key 池、白名单、大包路由、`provider=all`、Key 测试（balance/detail）
- 前端：`SchemaProviderDriver`（读 `parameters.request`）、`EngineRegistry`、`types/*`、`constants/nodes`、`providerLabels`、`services/api`（`x-novita-key`）、`BackendSettingsModal`、`ModelHubModal`、`CivitaiModal`（粘贴 `sd_name_in_api`）、`ParameterInspector`、`NodeItem`、`ApiParameterEditor`、`isLoraWeightResource`、`schemaSendHint`、`graphEditing`
- `.env.example`：`NOVITA_API_KEY`
- 测试：`src/server/novitaProvider.test.ts`（8）；`modelHubCatalog.test.ts` 期望含 novita
- 冒烟：`scripts/novita-live-smoke.ts`（临时 express，不重启画布长跑服务）

## Vitest
- `novitaProvider.test.ts` 8/8 通过
- 相关：`modelHubCatalog` / `aimlapiProvider` / `togetherProvider` 均通过

## Live smoke（服务端，临时 express + 真实上游）
结果：`/workspace/canvas-e2e-novita/smoke-result.json`
| 步骤 | 结果 |
|---|---|
| 目录 `GET /v3/model` checkpoint | **200**，count≈100；例：`dreamshaper_8_93211.safetensors` supportsLora=true |
| LoRA 目录 | **200**，count≈100；例：`more_details_59655` |
| 生成 + LoRA 缺 strength | **400** local refuse（未发上游） |
| 生成 + LoRA `more_details_59655` strength=0.75 | **403** `NOT_ENOUGH_BALANCE`；`actualRequest.parameters.request` 含 `loras`、`seed=42`、`steps=20`、`guidance_scale=7`、`width/height=512`、`sampler_name`、`negative_prompt`、`model_name` |

Key 元数据（不回显密钥）：`keyPresent=true`，`keyLen=46`，前缀脱敏。余额实测 `availableBalance=0`。

## 恢复包
- 改前：`/workspace/canvas-restore/pre-novita-0156.tgz`

## 未完成 / 待办（给画布 FE）
- **充值 `NOVITA_API_KEY` 对应账户** 后重跑 `npx tsx scripts/novita-live-smoke.ts`，争取 PASS_GENERATION（须继续带真实 LoRA + 填齐 seed/steps/cfg/size）。
- 前端浏览器 E2E：设置→填 Novita Key→模型中心 Novita→选 checkpoint→LoRA 中心选/粘贴 `sd_name_in_api`→参数面板填齐→执行→历史「实际发送」不得对可发项标「未发送」；403/欠费文案可见。
- 视频：端点与 Schema 已备，目录暂无独立视频模型列表；有余额后再冒烟 txt2video/img2video。
- 分页：当前单页 `pagination.limit=100`；需要更多模型时再跟 `pagination.next_cursor`。
