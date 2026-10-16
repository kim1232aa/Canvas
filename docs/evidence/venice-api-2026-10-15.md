# Venice 接入证据 · 2026-10-15

结论：**PASS_BILLING（服务端 live smoke）**。接线与官方文档 / tinkabot Schema 草案对齐；`.env` 中 `VENICE_API_KEY` 有效（目录 200；付费生图返回 **HTTP 402** 欠费原文）。自定义 LoRA → 本地 **400**（官方无 `loras[]`）。填齐 seed/steps/cfg/size/负向后均进入 `actualRequest`（cfg→`cfg_scale`）。视频 Schema **无 seed**。**未做前端浏览器 E2E**（桌面归画布），不是 PASS_GENERATION。

## 官方来源（本次实时抓取）
- 索引：https://docs.venice.ai/llms.txt
- 审计：`docs/provider-api-audit/venice.md`（2026-10-15）
- Schema 草案：`docs/provider-schema-drafts/venice.json`（tinkabot）
- Image generate：https://docs.venice.ai/api-reference/endpoint/image/generate
- Video queue / retrieve：https://docs.venice.ai/api-reference/endpoint/video/queue · …/retrieve
- Models：https://docs.venice.ai/api-reference/endpoint/models/list
- OpenAPI stamp：`20261012.214344`
- 欠费：官方 **HTTP 402** `INSUFFICIENT_BALANCE` / 文案含 Insufficient USD or Diem balance

## 用到的官方端点
| 用途 | 端点 |
|---|---|
| 模型中心目录 | `GET https://api.venice.ai/api/v1/models?type=all`（过滤 `image`/`video`） |
| LoRA 中心 | **无自定义 LoRA 目录**；仅捆绑模型可选 `lora_strength`（0–100） |
| 图像生成 | `POST /api/v1/image/generate`（**同步** `images[]` base64；无 task 轮询） |
| 视频生成 | `POST /api/v1/video/queue` → `queue_id` |
| 视频轮询 | `POST /api/v1/video/retrieve` body `{model, queue_id}`；进行中 JSON `PROCESSING`；完成可为 `video/mp4` 二进制 |
| Key 测试 | `GET /api/v1/models?type=image`（`/billing/balance` 需 Admin Key，不适合作普通 Key 测试） |

## LoRA：官方能力
| 路径 | LoRA | 字段 |
|---|---|---|
| Image generate | **无自定义** `loras[]` | 仅 `lora_strength`（捆绑附加 LoRA 的模型） |
| style_references | 非 LoRA | `{image, strength?}`，需 `supportsStyleReferences` |
| 用户挂自定义 LoRA | — | **本地 400 拒绝**；不静默丢弃、不伪造 `loras` |
| 视频 | 否 | Schema 无 LoRA |

付费冒烟 **不带自定义 LoRA**（官方能力如此）：模型 `venice-sd35`，seed/steps/cfg_scale/width/height/negative_prompt 全进 actualRequest。

## 代码改动
- `src/server/schemaProviders.ts`：`venice` 供应商；`veniceCatalogRows` / `veniceImageOutputs` / `veniceVideoStatus`；图像同步内存任务；视频 queue+retrieve（含 binary）；自定义 LoRA 400；视频剥 seed；cfg→`cfg_scale`
- `server.ts`：`VENICE_API_KEY`→`veniceKey`、Key 池、白名单、大包路由、`provider=all`、Key 测试（models）
- 前端：`SchemaProviderDriver`、`EngineRegistry`、`types/*`、`constants/nodes`、`providerLabels`、`services/api`（`x-venice-key`）、`BackendSettingsModal`、`ModelHubModal`、`CivitaiModal`（粘贴拒绝）、`ParameterInspector`、`ApiParameterEditor`、`isLoraWeightResource`、`schemaSendHint`、`graphEditing`
- `.env.example`：`VENICE_API_KEY`
- 测试：`src/server/veniceProvider.test.ts`（6）；`modelHubCatalog.test.ts` 期望含 venice
- 冒烟：`scripts/venice-live-smoke.ts`（临时 express，不重启画布长跑服务）

## Vitest
- `veniceProvider.test.ts` 6/6 通过
- 相关：`modelHubCatalog` / `togetherProvider` 通过

## Live smoke（服务端，临时 express + 真实上游）
结果：`/workspace/canvas-e2e-venice/smoke-result.json`
| 步骤 | 结果 |
|---|---|
| 目录 `GET /models?type=all` | **200**，checkpoint≈45；例：`venice-sd35` supportsLora=false |
| LoRA 目录 | **200**，notice 说明无自定义 LoRA；count=0 |
| 生成 + 自定义 LoRA | **400** local refuse（未发上游） |
| 生成 `venice-sd35` + seed/steps/cfg/size/负向 | **402** Insufficient USD or Diem balance；`actualRequest.parameters` 含 `seed=42`、`steps=20`、`cfg_scale=7.5`、`width/height=1024`、`negative_prompt`、`model`；**无** `loras` |

Key 元数据（不回显密钥）：`keyPresent=true`，`keyLen=63`，前缀脱敏。`/billing/balance` 对本 Key 返回 401 Admin API key required（与审计一致：普通推理 Key 用 402 生图体验证欠费）。

## 恢复包
- 改前：`/workspace/canvas-restore/pre-venice-0203.tgz`

## 未完成 / 待办（给画布 FE）
- **充值 `VENICE_API_KEY` 对应账户** 后重跑 `npx tsx scripts/venice-live-smoke.ts`，争取 PASS_GENERATION（仍勿带自定义 LoRA；填齐 seed/steps/cfg/size）。
- 前端浏览器 E2E：设置→填 Venice Key→模型中心 Venice→选 `venice-sd35`（勿挂 LoRA）→参数面板填齐→执行→历史「实际发送」须含 seed/steps/cfg_scale/width/height；402 欠费文案可见；挂 LoRA 应本地 400。
- 视频：端点与 Schema/轮询已备（无 seed）；有余额后再冒烟 queue+retrieve（需 `duration`）。
- 按模型 constraints 切换 width/height vs aspect_ratio/resolution（Qwen 族拒像素尺寸）——Schema 已声明字段；FE 可按目录 constraints 提示。
