# OpenWorks 去工具层：方案 C 实施（2026-10-15 UTC+8）

状态：CODE_ONLY（只有单元/契约测试，没有做浏览器端到端，也没有调用真实 /task）。未提交 commit。

还原包：
- `/workspace/canvas/temp/backups/canvas-restore/pre-openworks-detool-0238.tgz`：02:38 打的，早于第一轮。
- `/workspace/canvas/temp/backups/canvas-restore/pre-openworks-optionC-0240.tgz`：02:40 重新打的，开始方案 C 改动之前。

## 方案 C 是什么
OpenWorks 是一个普通的 Schema 驱动服务商，provider id 为 `openworks`，在 UI 上显示为「Tensor.Art OpenWorks」。
- **目录**：模型中心实时读取上游目录。`outputs[].format` 为 image 或 video 的条目，都当作普通模型列出，内部 id 就是上游 name。
- **参数 Schema**：每个模型的 Schema 由上游 `inputs[]` 生成。属性名 = 上游 description 原文，重名时加 `#位置`；位置记在 `x-openworks-position`，上游类型记在 `x-openworks-type`；所有属性都是必填。
- **渲染与发送**：Schema 通过 `/api/model-schema` 进入通用 Schema 面板（ApiParameterEditor）和 会发送/不会发送 徽标（schemaSendHint/schemaSendStatus）。发送走通用 `SchemaProviderDriver` → `/api/schema-provider/openworks/submit` → 上游 `POST /task`，轮询走 `POST /task/query`。
- **画布字段映射**：只有当 Schema 属性名等于画布字段名，或是 `CANVAS_TO_SCHEMA_ALIASES` 中的别名时，画布字段才会发送。这张别名表和徽标用的是同一张。其余字段在 mapping 里记为 `sent:false`（不会发送）。
- **手写 JSON**：键必须是 Schema 属性名，否则本地 400。值按 Schema 类型校验；ARRAY 按 `items.required` 校验。不推断，不占位。
- **线上请求体**：上游请求体的字段名仍是 `toolName`，这是上游协议的事实。它会原样出现在执行记录的 actualRequest 里，以保证透明，但界面文案中不出现。

## 官方文档 URL（02:38 实时抓取，详细结果见上一轮）
- https://raw.githubusercontent.com/Tensor-Art/tensorart-skills/master/skills/tensorart-generate/SKILL.md （200）
- https://raw.githubusercontent.com/Tensor-Art/tensorart-skills/master/README.md （200）
- https://raw.githubusercontent.com/Tensor-Art/tensorart-skills/master/skills/tensorart-generate/scripts/_api.py （200）：基址，以及 `Echo-Access-Key` 鉴权头
- https://raw.githubusercontent.com/Tensor-Art/tensorart-skills/master/skills/tensorart-generate/scripts/create_task.py （200）：`POST task {toolName, inputs}`
- https://openapi.tensor.art/openworks/docs 返回 404；https://openapi.tensor.art/openworks/v1 返回 301

## 实测探针（第 4 项）：/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-tensorart-probe/README.md，02:39–02:50
测试对象是 photoreal_studio_z_image，512×512。
- seed：传 seed=42 两次，分别以 positional、named、顶层字段三种方式发送。上游都返回 200、不报错，但两次输出的 sha256 都不同，说明上游忽略了 seed。
- steps/cfg/sampler/loras：上游 200，task/query 不回显这些值，输出没有可验证的变化。
- 23 个目录条目都没有声明 seed/steps/cfg/LoRA。
- 处理方式：`OPENWORKS_PROBE_RESULTS.photoreal_studio_z_image` 中这四个字段都标为 `ignored`。只要用户填了这些字段，就本地 400，报错中引用上游 200 原文 `{"code":"0", "message":"", "data":{"task":{... "status":"WAITING" ...}}}` 和探针证据。其余 22 个模型没有探针结果，同样本地 400（「没有『上游接受且出图变化』的实测结果」）。
- 缺口：只测了 1 个模型，视频模型一个都没测。

## 删除
- `src/schemas/tensorOpenWorksInputs.ts`：整个文件删除，包括 `planOpenWorksVideoTask`、`buildTensorArtInputs`、按关键词把画布字段匹配到上游 description 的映射表、`buildSchemaArrayValue`、`isOpenWorksVideoTool` 和 `parseOpenWorksToolList`。新代码中没有任何按 description 关键词匹配的逻辑，测试会断言这一点。
- server.ts：
  - `/api/tensorart/tools` 和 `/api/tensorart/upload` 两条路由（含 `/api/engine/...` 别名，以及 LARGE_BODY_ROUTES 中的条目）；
  - `getTensorArtBaseUrl`、`fetchTensorArtToolsList` 和 `tensorArtToolsCache`；
  - `/api/video/generate` 中 tensorart 分支的 OpenWorks 部分（工具列表 → planOpenWorksVideoTask → /task → 轮询）；
  - `/api/tensorart/generate` 中的非 TAMS 路径（工具列表 → buildTensorArtInputs → /task → 轮询 → 写历史）。
- 契约测试：删掉 3 条旧的 OpenWorks 工具层用例（photoreal 工具、视频格式门控、SKILL.md Step 4 输入构造）。
- UI 文案：
  - BackendSettingsModal 中「OpenWorks ak_tensor 工具不能当 Checkpoint」「仅用于工具」；
  - ParameterInspector 中「OpenWorks 工具名和密钥不能代用」「旧工具选择已清除」；
  - ProviderMatrixModal 中「与 OpenWorks 工具接口分开」；
  - server.ts 模型中心显示名中的「（OpenWorks 工具）」，以及 badge「OpenWorks 工具 / 图像处理 / 工作流工具 / LoRA 微调工具」、baseModel「OpenWorks Tool」、「(官方工作流)」；
  - TensorArtDriver 的描述文字和 `data.toolName` 兜底；
  - 密钥测试和余额查询中的「工具 API … 个工具」；
  - server.ts 和 civitaiModelRoutes 中「OpenWorks 工具 Key」→「OpenWorks Access Key」，只改文字，判断逻辑不变；
  - App.tsx、videoProvider.ts、generationReadiness.ts 中的「旧 OpenWorks 工具」错误文案。

## 新增 / 修改
- **新增** `src/server/openWorksProvider.ts`，内容包括：
  - 目录解析 `parseOpenWorksCatalog`：非 2xx 或 code≠0 时原文透传；
  - `openWorksMediaKind` 和 `openWorksCatalogItems`；
  - `openWorksInputSchema`；
  - 通用请求构造 `buildOpenWorksRequest`；
  - `OPENWORKS_PROBE_RESULTS`；
  - 路由：`/api/model-schema?provider=openworks`、`/api/schema-provider/openworks/{submit,tasks/:id,save-result}`。轮询只用提交时的那个 Key，任务不属于本会话时返回 409。
- **server.ts**：
  - 在 `registerSchemaProviderRoutes` 之前注册 OpenWorks 路由；
  - 新增模型中心目录 `provider=openworks`；
  - Key 解析：优先用请求头里的 Key，否则从 tensorart Key 池中挑 `ak_tensor`/`ak_tusi` 开头的 Key。如果拿到的是 TAMS Key，本地 400；
  - `/api/video/generate` 中的 tensorart 分支：保留 TAMS 本地拒绝，之后对非 TAMS 模型本地 400，并提示改用「Tensor.Art OpenWorks」服务商；
  - `/api/tensorart/generate`：TAMS 路径不变，非数字 id 本地 400；
  - 密钥测试和余额查询改为读目录条目数。
- **前端注册**：
  - EngineRegistry 注册 `SchemaProviderDriver('openworks')`，与 tensorart 共用 Key 槽位 `tensorartKey`；
  - SchemaProviderDriver 的 `mediaType` 改为读轮询返回的 `mediaType`，以便输出视频；
  - schemaSendHint 的 SCHEMA_DRIVEN 加入 openworks；
  - modelSchemaCache 和 ApiParameterEditor 让 openworks 使用 x-tensorart-key 请求头；
  - ModelHubModal（新标签页）、ParameterInspector（服务商按钮 + 通用 Schema 面板）、nodes.ts、types.ts、providerLabels、isLoraWeightResource 都加入 openworks；
  - graphEditing 把旧历史里的 provider「Tensor.Art (OpenWorks)」映射到 openworks。
- **草案** `docs/provider-schema-drafts/tensorart-openworks.json`：改写为方案 C，补上 probeGated 和来源 URL。
- **测试**：
  - schemaContract.test.ts 新增 2 条：
    - 第一条用真实目录证据 JSON 做夹具，覆盖：23 个条目、8 个视频；生成的 Schema；位置序列化；徽标结果（seed/steps/cfg/width 为不会发送，prompt 为会发送）；探针拦截；必填缺失、未知键、类型错误、ARRAY 必填项校验；目录 500 原文透传。
    - 第二条检查 server 和 UI 中不再残留工具层，并确认 TAMS 拒绝分支仍在。
  - videoProvider.test.ts：随新文案更新断言。

## 保持不动
- TAMS：tensorModelApi.ts（含 `tamsVideoUnsupported`）、TAMS job 路径、`/api/tensorart/model-info`。
- ak_tensor 守卫：tensorArtCredentials.ts、`isOpenWorksAccessKey` 的调用判断逻辑。
- 并行任务正在改的文件：NodeItem、history 相关、apiFailure、ExecutionLog、AIMLAPI 文件，以及 schemaProviders.ts。schemaProviders.ts 在 02:44 被并行任务修改过，所以 OpenWorks 被做成独立模块，没有改它。

## 冲突 / 残留（按指示列出，未改）
- `src/components/NodeItem.tsx:565`：「已清除误放在底模位置的旧工具」。NodeItem 属于避让文件。
- `src/utils/historyParameters.ts:68-71`：历史记录解析 toolName/inputs，属于 history 文件，避让。它只读旧记录。
- `src/schemas/tensorModelApi.ts:9, 75`：TAMS 报错文案中有「OpenWorks 工具」，按「TAMS 不动」保留。
- `src/schemas/tensorArtCredentials.ts:34` 的 `TAMS_BEARER_REQUIRED_HINT`：「仅用于 openworks 工具接口」。这是 ak_tensor 守卫的提示文字，会显示在 UI 上，按「守卫不动」保留。
- ProviderMatrixModal 167–170 行的「官方工具 Schema」是 Sogni 的 hosted-tool 说法，与 OpenWorks 无关，未改。
- AIVideoNode（`/api/video/generate`）不代理 OpenWorks，会本地 400 并提示换服务商。OpenWorks 视频模型要在图像/通用节点上选「Tensor.Art OpenWorks」，走通用 Schema 路由，输出 mediaType 为 video。这条路径只有单测，没有在浏览器里验证。
- 上游 inputs 的 description 很长（例如视频的 ratio 说明），直接作为 Schema 属性名，在面板里会显示得很长。这是忠实于上游的代价。
- 目录里的处理类条目（background_remover、upscaler 等）输出也是 image，按 outputs 规则同样列为模型，没有按名字过滤。

## 测试
- 改动前（02:41）：`npx vitest run src` 109 个文件，968 通过，2 失败。失败的是 mediaHostedReview，缺少 hosting/server.generated，改动前就存在。
- 改动后（02:46）：110 个文件，972 通过，3 失败：
  - mediaHostedReview 的 2 条，同上，原本就失败；
  - `schemaNoFallback.test.ts` 的 WaveSpeed 用例。这个文件是并行任务 02:45 新建的，对应的 schemaProviders.ts 02:44 刚被改过，我没有动过这两个文件，与本次改动无关。
- schemaContract.test.ts：22/22 通过。
- `tsc --noEmit`：只剩 7 条原本就有的错误（tensorArtCredentials.test、billingKeyRotate、mediaHostedReview），没有新增。
