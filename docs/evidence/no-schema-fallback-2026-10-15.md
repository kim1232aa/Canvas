# 去掉 Schema / 端点兜底（铁律 3）— 2026-10-15 — CODE_ONLY

恢复包：`/workspace/canvas-restore/pre-nofallback-*.tgz`

## 改动（`src/server/schemaProviders.ts`）
- 新增 `schemaUnavailableBlock()`：本地 400，`errorSource:'local'`，首句「未出站，本地拦截：…」，带来源 URL；不 POST。server.ts 现有中间件把生成路由的本地 4xx 写成 `local_blocked` 历史（无 upstreamStatus）。
- Together / Novita / Venice：目录项没有 `parameters` 时，不再用内置 `*InputSchema` 兜底，直接本地拦截。
- WaveSpeed：目录中没有该模型 → 404 本地；没有 `api_schema.api_schemas[type=model_run,method=POST]` 或缺 `request_schema` → 本地拦截。不再猜 `/api/v3/<model>`，不再返回 `schemaStatus:'unknown'`。
- 未改 OpenWorks / tensorart 文件，也未改 server.ts。

## 遗留（未处理，需产品判断）
- `togetherCatalogRows` / novita / venice 的目录行在生成目录时就把内置 Schema 塞进 `parameters`（schemaProviders.ts 约 76/239/320 行），所以上面这条拦截在实际路径上基本触发不到；`schemaStatus` 仍标 `docs-openapi`。要真正去掉内置 Schema，得改成从官方来源获取每模型 Schema，或者全部改成「待确认」。

## 测试
- `src/server/schemaNoFallback.test.ts`：3/3 PASS
- `npx vitest run src`：973 PASS / 2 FAIL（`mediaHostedReview.test.ts` 缺 `/hosting/server.generated.ts`，环境问题，与本次改动无关）

## 实测 :3000 `/api/model-schema`（正常路径）
- Novita `realisticVisionV40_v40VAE-inpainting_81543.safetensors` → docs-openapi，txt2img，11 个字段
- Venice `venice-sd35` → docs-openapi，/image/generate
- WaveSpeed `google/nano-banana-2.1/edit` → catalog-model_run，端点来自 model_run（`WAVESPEED_KEY` 为空，目录可以公开读取）
- Together → `HTTP 401 {"error":{"message":"Unauthorized"}}`（BLOCKED_AUTH，key 无效）

## 2026-10-15 02:50 — 删除内置 Schema，改运行时官方来源（画布决定）— CODE_ONLY

- 已删除：`togetherImageInputSchema/VideoInputSchema`、`novitaImage/VideoInputSchema`、`veniceImage/VideoInputSchema`；三家 `*CatalogRows` 不再注入 `parameters`。
- Together：每次 model-schema/submit 运行时 GET `https://docs.together.ai/openapi.yaml`，取 POST `/images/generations` 或 `/videos` 的 requestBody（$ref 解析）。schemaStatus=`official-openapi-runtime`，schemaSource=该 URL。
- Venice：运行时 GET `https://api.venice.ai/doc/api/swagger.yaml`（`/image/generate`、`/video/queue`），再叠加 `/models` 返回的 `model_spec.constraints`（steps max/default、resolutions、aspectRatios、qualities、promptCharacterLimit；只叠加上游返回的键）。
- Novita：无可拉取的官方 OpenAPI → 无 Schema → 本地 400「未出站，本地拦截」+ local_blocked，无 POST。
- 拉取失败 / 无该路径：本地 400，消息含 URL 与上游 `HTTP <code> <body>` 原文，不用快照兜底。
- 徽章：新增通用 `_canvas.schemaUnprobed`（server 返回 `schemaUnprobed:true` → modelSchemaCache → schemaSendStatus）。仅官方文档声明、未经实测的字段显示「待确认」，不显示「会发送」。
- 不再标 `docs-openapi`（这三家）。

### 实测（box，新代码临时实例 :3011；:3000 的 tsx watch 仍是旧进程，需重启）
- Venice venice-sd35：HTTP 200，official-openapi-runtime，steps `{default:25,maximum:30}`，官方描述：“This model does not support steps - this field is ignored.”
- Venice grok-imagine-image-2-0：HTTP 200，steps max 50，aspect_ratio enum 6 项。
- Novita sd_xl_base_1.0：HTTP 400 本地拦截（目录项没有 parameters）。
- Together：目录 `/v1/models` 401 Unauthorized（BLOCKED_AUTH），没走到 Schema。离线用同一个 helper 解析官方 yaml：`/images/generations` 15 个字段，**包含 `image_loras`**（旧内置版以「已弃用」为由去掉了它）；`/videos` 18 个字段。

### 测试
- vitest src：978 pass / 2 fail（mediaHostedReview，缺 hosting/server.generated，旧问题）。
- tsc：剩下的错误都不来自本次改动：hosting/*.generated 缺失、tensorArtCredentials.test、billingKeyRotate.ts:163。
- 新增依赖：`yaml@2`（package.json / lock）。

## 2026-10-15 02:53 — 「字段被忽略」信号来源核查 — CODE_ONLY
- 原文 “Number of inference steps. This model does not support steps - this field is ignored.” 只出现在 `https://api.venice.ai/doc/api/swagger.yaml` 里通用的 `GenerateImageRequest.properties.steps.description`（约 3434 行）。它对所有模型都一样，没有说是哪个模型（Researchy 也核实了）。
- Venice `/models?type=image` 返回的 45 个模型，`model_spec.constraints.steps` 全部都有 `{default,max}`。没有哪个模型缺 steps，也没有按模型的「忽略」标记。
- 结论：没有结构化的按模型信号。按铁律不做关键词匹配、不做特判，steps 照常走通用逻辑（不经实测就一直显示「待确认」）。真正生效与否交给画布的前端实测。
- 新增通用规则：Schema 字段 `deprecated: true`（OpenAPI 结构化标记）→ 填了就本地拦截，原文引用官方 description。Venice 目前唯一命中的是 `inpaint`。测试：`src/server/schemaDeprecated.test.ts`，里面也断言了描述里的 “is ignored” 文本不会触发拦截。
- 还原包：`/workspace/canvas-restore/pre-ignored-field-0252.tgz`
