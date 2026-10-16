# Together API 接入证据 · 2026-10-15

结论：**BLOCKED_AUTH（服务端 live smoke）**。接线与官方文档对齐；`.env` 中 `TOGETHER_API_KEY` 存在但上游 `GET /v1/models` 与生成均返回 **HTTP 401 Unauthorized**。LoRA：官方明确 serverless `image_loras` 已不可用 → 挂 LoRA 本地 **400 拒绝**（已冒烟）；无 LoRA 的生成请求因鉴权失败未到达出图。**未做前端浏览器 E2E**（桌面归画布），不是 PASS_GENERATION / PASS_BILLING。

## 官方来源（本次实时抓取）
- 索引：https://docs.together.ai/llms.txt
- 图像总览：https://docs.together.ai/docs/inference/images/overview
- 图像参数：https://docs.together.ai/docs/inference/images/parameters
- 图像 OpenAPI：https://docs.together.ai/reference/post-images-generations
- 模型列表：https://docs.together.ai/reference/models-1
- 视频总览：https://docs.together.ai/docs/inference/videos/overview
- 视频创建 / 查询：https://docs.together.ai/reference/create-videos · https://docs.together.ai/reference/get-videos-id
- Serverless 目录：https://docs.together.ai/docs/serverless-models
- OpenAI 兼容说明：https://docs.together.ai/docs/inference/openai-compatibility
- 本地摘录：`/workspace/together-docs/SOURCES.md`、`llms.txt`

## 用到的官方端点
| 用途 | 端点 |
|---|---|
| 模型中心目录 | `GET https://api.together.ai/v1/models`（过滤 `type=image` / `type=video`） |
| LoRA 中心 | **无 serverless 目录**（官方停用 `image_loras`；Dedicated Endpoint adapter 不在本集成范围） |
| 图像生成 | `POST https://api.together.ai/v1/images/generations`（**同步**返回 `data[].url` / `b64_json`） |
| 视频生成 | `POST https://api.together.ai/v2/videos` → 任务 `id` |
| 视频轮询 | `GET https://api.together.ai/v2/videos/{id}`，`status` ∈ in_progress/completed/failed，结果 `outputs.video_url` |
| 设置页 Key 测试 | `GET https://api.together.ai/v1/models` |

## LoRA：官方能力
官方参数页（2026-10-15）原文：
> `image_loras`: **No longer available.** The FLUX models that accepted LoRA adapters have been deprecated, and the current FLUX.2 models reject this parameter. To serve a LoRA-adapted image model, use a dedicated endpoint.

| 模型簇 | serverless LoRA | 本集成行为 |
|---|---|---|
| FLUX.2 / 当前 serverless 图像模型 | **否**（拒绝 `image_loras`） | `supportsLora=false`；提交含 LoRA → **400**，不静默剥离 |
| Dedicated Endpoint + uploaded adapter | 是（`endpoint:adapter_id`） | **未接**：需用户自建 endpoint，不自动部署 |

因此：**付费冒烟不带 LoRA 是符合官方能力的**；带 LoRA 的请求必须被拒绝（已验证 400）。

## 代码改动
- `src/server/schemaProviders.ts`：`together` 供应商；`togetherCatalogRows` / `togetherImageOutputs` / `togetherVideoOutputs`；图像同步任务内存轮询；视频走 `videoRoot` v2；LoRA 早拒绝
- `server.ts`：`TOGETHER_API_KEY`→`togetherKey`、Key 池、白名单、大包路由、`provider=all`、Key 测试
- 前端：`SchemaProviderDriver`、`EngineRegistry`、`types/*`、`constants/nodes`、`providerLabels`、`services/api`（`x-together-key`）、`BackendSettingsModal`、`ModelHubModal`、`CivitaiModal`、`ParameterInspector`、`NodeItem`、`ApiParameterEditor`、`isLoraWeightResource`、`schemaSendHint`、`graphEditing`
- `.env.example`：`TOGETHER_API_KEY`（及补 `KREA_API_KEY`）
- 测试：`src/server/togetherProvider.test.ts`（6）；`modelHubCatalog.test.ts` 期望含 together
- 冒烟：`scripts/together-live-smoke.ts`（临时 express，不重启画布长跑服务）

## Vitest
- `togetherProvider.test.ts` 6/6 通过
- 相关：`modelHubCatalog` / `kreaProvider` / `schemaProviders` / `schemaProviderWireReview` / `providerSchema` / `schemaSendHint` / `providerLabels` / `isLoraWeightResource` 均通过

## Live smoke（服务端，临时 express + 真实上游）
结果：`/workspace/canvas-e2e-together/smoke-result.json`
| 步骤 | 结果 |
|---|---|
| 目录 `GET /v1/models` | **401** `{"error":{"message":"Unauthorized"}}` |
| LoRA 目录 | 200，notice 说明无 serverless LoRA；count=0 |
| 生成 + LoRA | **400** local refuse（未发上游） |
| 生成无 LoRA `POST …/submit` model=`black-forest-labs/FLUX.2-dev` | **401** Unauthorized |

Key 元数据（不回显密钥）：`keyPresent=true`，`keyLen=25`，前缀 `key_…`。Together 控制台签发的有效 Key 通常更长；当前值被上游直接判 Unauthorized。

## 恢复包
- 改前：`/workspace/canvas-restore/pre-together-0143.tgz`

## 未完成 / 待办
- **换有效 `TOGETHER_API_KEY`** 后重跑 `npx tsx scripts/together-live-smoke.ts`，争取 PASS_GENERATION（无 LoRA；图像同步）。
- 前端浏览器 E2E（设置→模型中心 Together→画布→执行记录 / 401·欠费展示）待画布在空闲浏览器复验。
- 视频端点已进目录与 Schema，未做视频生成冒烟（需有效 Key）。
- Dedicated Endpoint LoRA 不在本次范围。
