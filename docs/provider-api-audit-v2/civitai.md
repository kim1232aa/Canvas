# Civitai — API 审计
2026-10-15 重新调查，与旧版无关。调查时间 04:39–04:42 北京时间（box 时钟）。

| 项 | 结论 | 等级 | 证据 |
|---|---|---|---|
| 文档入口 | https://developer.civitai.com （llms.txt 200）；分 Site API（模型库）与 Orchestration API（生成） | 实测 | |
| 机器可读 Schema | **有**：`https://orchestration.civitai.com/openapi/v2-consumers.json`（200，OpenAPI 3.1.1，1.4 MB）。llms.txt 原文「reference pages are generated from a committed snapshot of the v2-consumers OpenAPI spec」。（`v2-consumer.json` 单数 404） | 实测 | |
| 模型/LoRA 目录 | Site API `GET https://civitai.com/api/v1/models?types=LORA&limit=…` **无 key 200**；条目描述里作者给的权重范围（如 Detail Tweaker XL「weights [-3, 3]」）只是自由文本 | 实测 | |
| 资源标识 | AIR URN，如 `urn:air:sd1:lora:civitai:82098@87153` | 仅搜索（官方 t2i 页写「keyed by their AIR」，格式细则未逐条核） | |
| 图像端点 | `POST https://orchestration.civitai.com/v2/consumer/recipes/textToImage`（或通用 `POST /v2/consumer/workflows` + steps）；字段根层 | 官方原文 | InvokeTextToImageStepTemplate.md |
| 字段 | model(AIR), prompt, negativePrompt, **scheduler**（枚举 eulerA/euler/dpM2MKarras/…/lcm/ddpm/deis…）, steps(1–150, def 30), **cfgScale(1–30, def 7.5)**, width/height(64–4084, def 512), seed(0–4294967295), clipSkip(def 2) | 官方原文 | |
| ⚠ LoRA 字段 | **`additionalNetworks` 是 map，以 AIR 为键**：`{"<AIR>": {"strength": number|null, "triggerWord", "type"}}`；OpenAPI `ImageJobNetworkParams.strength` **无 min/max**。agy-search 摘要说是数组 `[{air,strength}]`——与官方不符 | 官方原文(OpenAPI) | |
| 异步/轮询 | `GET /v2/consumer/workflows/{id}`、`/steps/{name}`；状态 unassigned → preparing → scheduled → processing → succeeded / failed / expired / canceled；支持 webhook | 官方原文 | guide/workflows.md |
| 视频 | `POST /v2/consumer/recipes/videoGen`（engine, prompt…；按 engine 的 recipe 页：wan/ltx2/kling/veo3/seedance…），同 workflow 轮询 | 官方原文 | |
| 鉴权 | Bearer token（securitySchemes ApiKey bearer/JWT） | 官方原文 + 实测401（空体） | |
| 错误/欠费 | ProblemDetails（`status`, `errors` 等）；400/401/403/404/409 分类；**Buzz 不足**：原文「orchestrator also cancels … when your Buzz runs out」→ 表现为 step `canceled`，不是专门的 402 | 官方原文 | guide/errors-and-retries.md |

坑：欠费可能表现为 step 被 canceled 而非 HTTP 错误——前端必须展示 step 状态和原因；submit 200/202 不代表成功。

## 补查 2026-10-15 04:58（Researchy 30m）· Flux2 双路径与 flux1-kontext
OpenAPI 来源（实测 200）：`https://developer.civitai.com/openapi/v2-consumers.json`（与 orchestration 同源镜像均可）。配方页：`https://developer.civitai.com/orchestration/recipes/flux2.md`、`flux1.md`。

| 路径 | engine / 鉴别 | steps/CFG 字段 | LoRA 形状 | 备注 |
|---|---|---|---|---|
| Flux2 Dev 原生 | `engine:flux2` + `model:dev` | `numInferenceSteps` 4–50 def28；`guidanceScale` 0–20 def2.5 | `loras[]` = `[{air,strength}]` | 官方推荐文生图 |
| Flux2 Dev sdcpp | `engine:sdcpp` + `ecosystem:flux2Dev` | **`steps` 4–50 def20；`cfgScale` 1–20 def1**（+ sampleMethod/schedule/negativePrompt） | **`loras` object map** | createVariant 需此路径；文生图也可用但字段名不同 |
| Flux2 Klein 原生/sdcpp | flux2+klein / sdcpp+flux2Klein | 两边都是 `steps`/`cfgScale` | object map | sdcpp 配方写明 same field shapes |
| Flux2 Pro / Max | `flux2` + `pro`/`max` | **无** | **无** | 仅 prompt/宽高/seed/quantity/enablePromptExpansion；发 loras/cfgScale → 400 |
| flux1-kontext | `engine:flux1-kontext` + model dev/pro/max | 无 steps；有 `guidanceScale` 1–20 def3.5 | **无**（排错表：`loras` → 400） | 另有 aspectRatio、images[] |

schema 名：`Flux2DevCreateImageInput`、`Flux2DevSdCppCreateImageInput` / `Flux2DevSdCppVariantImageGenInput`、`Flux1Kontext*ImageGenInput`。原文抓取：`/workspace/audit-v2-raw/researchy-30m-0458/`。
