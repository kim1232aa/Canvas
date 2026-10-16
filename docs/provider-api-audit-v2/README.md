# 供应商 API 审计 v2 — 总表
2026-10-15 重新调查，与旧版无关。03:26–04:45 北京时间（box 时钟；中途 box 时钟从 03:3x 跳到 04:3x，以文件记录为准）。
方法：每家 agy-search → WebSearch → curl 官方原页/OpenAPI/公开接口。**搜索摘要不计为证据**。原始抓取存于 `/workspace/audit-v2-raw/`。
调查期间未读取旧版审计、schema 草案、evidence 或其他 bot 结论；未用任何 key。

| 供应商 | 机器可读 Schema | 模型目录(无key) | LoRA 目录 | LoRA 字段 / 范围 | 参数位置 | 异步 | 无key/欠费返回 |
|---|---|---|---|---|---|---|---|
| together | ✅ docs.together.ai/openapi.yaml | ❌ 需 key | 未找到 | `image_loras[{path,scale}]` **官方称已不可用** | 根层 | 同步；视频 /v1/videos/{id} | 401 JSON；402=月度上限（补查） |
| krea | ✅ api.krea.ai/openapi.json（每模型一 path） | 无列表接口（模型=paths） | `GET /styles`（需 key） | `styles[{id,strength}]` **[-2,2]** | 根层 | /jobs/{id} | 402 "run out of credits" |
| replicate | ✅ 平台 openapi.json + 模型 `openapi_schema` | 需 key（网页 schema 可读） | 未找到 | 模型自定，例 `lora_weights`+`lora_scale[-1,3]` | **`input` 内** | /predictions/{id} | 401 RFC7807；欠费未找到 |
| aimlapi | ✅ 模型级 docsJson（无 key） | ✅ /models 932 条 | 未找到 | `loras[{path,scale 0–4}]` ≤3 | 根层 | 视频 /v2/video/generations | **403** = 欠费 |
| novita | 未找到（仅 HTML） | ✅ /v3/model | ✅ /v3/model?filter.types=lora | `loras[{model_name=sd_name_in_api,strength}]` [0,1] | **`request` 内** | /v3/async/task-result | 缺 key **400**；欠费 **403** |
| venice | ✅ api.venice.ai/api/v1/swagger.yaml | ✅ /models（含 constraints） | 未找到（不可自挂） | `lora_strength` int **0–100**（仅内置） | 根层 | 视频 /video/retrieve | 未鉴权 **402(x402)**；欠费也 402 |
| muapi | ✅ api.muapi.ai/openapi.json | ✅ /api/v1/models | 未找到（/app/lora-data 非文档） | **每端点不同**：`model_id[{model,weight}]` / `lora_list[{path,scale}]` 0–4 | 根层 | /predictions/{id}/result | **403**；欠费未找到 |
| wavespeed | 未找到文件（MCP 有） | ❌ 需 key | 未找到 | `loras[{path,scale 0–4}]` ≤3 | 根层；**size="W*H"** | /predictions/{id}/result | 401；欠费 1407（补查） |
| sogni | 未找到 OpenAPI | ✅ /v1/model-catalog | ✅ /v1/loras/comfy?modelId=（含 ui.min/max） | `loras:string[]`+`loraStrengths:number[]`，≤8，**服务端 clamp** | **`input.steps[].arguments` 内** | workflows/:id 或 SSE | 402（Premium Spark）；`/v1/images/generations` 实测 404 |
| fal | ✅ queue openapi（无 key，模型级） | ✅ api.fal.ai/v1/models | 未找到 | `loras[{path,scale 0–4}]` | 根层 | requests/{id}/status | 401；欠费 1407（补查） |
| modelscope | 未找到（HTML SPA） | /v1/models 不含文生图 | 未找到 | `loras`: string 或 `{repo:weight}`，≤6，**权重和=1** | 根层 + 异步头 | /v1/tasks/{id} | 401 `errors`；欠费未找到 |
| huggingface | ✅ 任务级 JSON Schema（huggingface.js） | ✅ Hub API + inferenceProviderMapping | ✅ `filter=base_model:adapter:<base>` | 规范层无强度字段 | **`parameters` 内** | 同步 bytes | 401 **HTML** |
| civitai | ✅ orchestration v2-consumers.json | ✅ civitai.com/api/v1/models | ✅ `types=LORA` | `additionalNetworks` **map 以 AIR 为键** `{strength}` 无范围 | 根层 | workflows/{id} | Buzz 用尽 → step canceled |
| tensorart-tams | ✅ swagger（aliyuncs OSS） | 仅单 ID 查询 | 未找到 | `diffusion.lora.items[{loraModel,weight}]` | **stages[].diffusion 内** | /v1/jobs/{id} | 400 code 100002 |
| tensorart-openworks | 工具级 `tool/list`（无 key） | 23 个 tool | 未找到 | **无**（无 LoRA/seed/steps） | `inputs[]` 位置数组 | task/query | 401 code 16；头 `Echo-Access-Key` |
| nanogpt | 端点 md 内嵌 OpenAPI；全站 404 | ✅ /api/v1/image-models | 未找到 | 未找到 LoRA 字段 | 根层 | 视频 /api/video/status | 401；402=欠费或 x402 |

## 搜索摘要被原文推翻的记录（本轮）
novita（根层/数字 status）、wavespeed（width/height）、sogni（虚构 OpenAI 兼容端点；我第一版据此误判「无 REST」，已修正）、fal（"input 内"）、civitai（数组）、tensorart-openworks（两个搜索都答成 TAMS）、modelscope（WebSearch 字段名）。
