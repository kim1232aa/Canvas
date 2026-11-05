# 2026-11-05 13家供应商官方 API 架构与契约深度核查报告 (Mission M4)

> **最高工程规范与反虚假成功准则**：
> 1. 多用网络搜索工具调查，没证据不断言；历史文档一律不作依据，以 2026-11-05 实时官方文档与 OpenAPI 探测事实为准。
> 2. 严禁静默容灾与虚假成功（透明错误，真实提供者路由）。严禁将上游契约校验失败（400/422）假称为扣费成功（PASS_BILLING）。
> 3. 按照 Tower 最新策略："余额不足不做卡点，先集成api，错误能原样透传算暂时通过"。真实 UI 点击到达上游并原样报出余额不足（400/402/403 等）判定为 **PASS_BILLING**。契约校验失败（422 参数缺失、400 未知字段）严格如实定性为 **CONTRACT_REJECTED**。
> 4. 参数全面由官方 Schema 驱动，禁止硬编码白名单与伪造默认值。
> 5. 唯一验收标准：真实端点、真实参数、前端实际点击通过并产生真实产物 / 节点报错证据。

---

## 一、13 家供应商官方契约核查与双轨实测矩阵

| 序号 | 供应商 | 官方文档 / OpenAPI 权威溯源 URL | 鉴权方式 | 生命周期 | 生图核心端点 | LoRA 机制与入参格式 | UI 点击实测结果（真实界面节点报错 / 产物截图） | API 原生诊断与真实端点回包（辅助取证，非 UI 验收） | 最终判定分类 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **MuAPI** | `https://api.muapi.ai/openapi.json`<br>`https://muapi.ai/docs` | `x-api-key: <key>` | 异步：POST 返回 `request_id`，轮询 `GET /api/v1/predictions/{id}/result` | `POST /api/v1/{endpoint_url}` | 官方 OpenAPI 定义 `loras: [{path: string, scale: number}]` | **UI 验证通过**：选择文生图模型 `z-image-turbo-text-to-image-lora` 并连接 LoRA 节点点击运行，采样器节点原样报出 `HTTP 402: {"detail":{"error":{"code":"INSUFFICIENT_CREDITS","message":"Insufficient credit balance"}},"error":{"code":"INSUFFICIENT_CREDITS","message":"Insufficient credit balance","topup_url":"https://muapi.ai/topup","balance_endpoint":"/api/v1/account/balance"}}` (截图: `ui-muapi.png`)。<br>*注：首次测试因在下拉误选图生图模型 `bytedance-seededit-image` 未输入参考图，报 422 `image_url Field required` (CONTRACT_REJECTED)。* | 原生测试 `z-image-turbo-text-to-image-lora` 返回 HTTP 402 `INSUFFICIENT_CREDITS`。 | **PASS_BILLING** (真实上游扣费失败) |
| 2 | **WaveSpeed** | `https://wavespeed.ai/docs/docs-api`<br>`https://wavespeed.ai/docs/list-models` | `Authorization: Bearer <key>` | 异步：POST 返回 `data.id`，轮询 `GET /api/v3/predictions/{id}/result` | `POST /api/v3/{model_id}` | 由模型 `request_schema` 定义（如 `loras` 数组或 LoRA 特化模型） | **UI 验证通过**：采样器节点原样报出 `HTTP 400: {"code":400,"message":"Insufficient credits. Please top up your account to continue."}` (截图: `ui-wavespeed.png`)。 | 原生请求返回 HTTP 400 `Insufficient credits`。 | **PASS_BILLING** (真实上游扣费失败) |
| 3 | **Sogni** | `https://raw.githubusercontent.com/Sogni-AI/sogni-protocol/main/schemas/tools/generate_image.schema.json`<br>`https://api.sogni.ai/v1/model-catalog` | `Authorization: Bearer <key>` | 异步：POST workflows 返回 `workflowId`，轮询 `GET /v1/creative-agent/workflows/{id}` | `POST /v1/creative-agent/workflows` | 官方 Schema `loras: string[]`（LoRA slug/id）+ `loraStrengths: number[]` | **UI 验证通过**：选用 `krea-2-turbo` 点击运行，工作流提交成功后轮询捕获上游中断，采样器节点如实显示 `waiting_for_user` 暂停原因：`waitingReason: "insufficient_credit"`，事件包含 `Debit Error: Insufficient funds` (截图: `ui-sogni.png`)。 | 原生工作流事件记录 `Debit Error: Insufficient funds` (HTTP 201 提交 -> 轮询 pause)。 | **PASS_BILLING** (真实上游扣费失败) |
| 4 | **Krea** | `https://api.krea.ai/openapi.json`<br>`https://docs.krea.ai` | `Authorization: Bearer <key>` | 异步：POST generate 返回 `job_id`，轮询 `GET /jobs/{id}` | `POST /generate/image/{vendor}/{model}` | 官方 OpenAPI 定义 `styles: [{id: string, strength: number}]`（来自 `GET /styles`） | 采样器节点报错 `HTTP 422: {"error":"Validation failed","details":[{"field":"aspect_ratio",...},{"field":"resolution",...}]}` (截图: `ui-krea.png`)。<br>**根因分析**：Krea 2 官方 OpenAPI (`/generate/image/krea/krea-2/medium`) 规定 `required: [prompt, aspect_ratio, resolution]`，其中 `resolution.enum = ["1K"]`。由于 `SchemaChoiceControls.tsx` (属于 M3) 跳过了单值枚举控件导致未提供 resolution 控件。修复已路由至 ui6b (M3)，待 M8 联合回归。 | 传入有效 `aspect_ratio`/`resolution` 时原生请求返回 HTTP 402 `Your API balance is separate...`。 | **CONTRACT_REJECTED** (上游入参契约拒收；根因已排查并路由) |
| 5 | **Together** | `https://docs.together.ai/docs/inference/images/parameters`<br>`https://docs.together.ai/openapi.yaml` | `Authorization: Bearer <key>` | 同步：POST 返回 `{data: [{url, b64_json}]}` | `POST https://api.together.ai/v1/images/generations` | 官方说明 serverless FLUX 废弃 `image_loras`；由模型 Schema 驱动 | **UI 验证通过**：底模节点直接标红报出 `HTTP 401 Unauthorized: {"error":{"message":"Unauthorized"}}` (截图: `ui-together.png`)。 | 原生请求返回 HTTP 401 `Invalid API key provided`。 | **BLOCKED_AUTH** (真实上游 Key 鉴权失败) |
| 6 | **AIMLAPI** | `https://docs.aimlapi.com/api-reference/image-generation`<br>`https://api.aimlapi.com/v1/models` | `Authorization: Bearer <key>` | 同步：POST 返回 `{data: [{url, b64_json}]}` | `POST https://api.aimlapi.com/v1/images/generations` | 官方 OpenAPI 支持时传递 `loras: [{path: string, scale: number}]` | **UI 验证通过**：采样器节点原样报出 `HTTP 403: {"title":"Forbidden","message":"You've run out of funds..."}` (截图: `ui-aimlapi.png`)。 | 原生请求返回 HTTP 403 `You've run out of funds`。 | **PASS_BILLING** (真实上游扣费失败) |
| 7 | **Novita** | `https://docs.novita.ai/api-reference/txt2img-v3`<br>`https://api.novita.ai/v3/model` | `Authorization: Bearer <key>` | 异步：POST submit 返回 `task_id`，轮询 `GET /v3/async/task-result?task_id=` | `POST https://api.novita.ai/v3/async/txt2img` | 官方 V3 协议 `loras: [{model_name: string, strength: number}]`（取自 `sd_name`） | **UI 验证通过**：采样器节点原样报出 `HTTP 403: {"code":403, "reason":"NOT_ENOUGH_BALANCE", "message":"insufficient balance"}` (截图: `ui-novita.png`)。 | 原生请求返回 HTTP 403 `NOT_ENOUGH_BALANCE`。 | **PASS_BILLING** (真实上游扣费失败) |
| 8 | **Venice** | `https://docs.venice.ai/api-reference/endpoint/image/generate`<br>`https://api.venice.ai/doc/api/swagger.yaml` | `Authorization: Bearer <key>` | 同步：POST 返回 `{images: [base64]}` | `POST https://api.venice.ai/api/v1/image/generate` | 官方无自定义 `loras[]` 数组，官方字段为 `lora_strength`、`style_preset` 或 `style_references` | **UI 验证通过**：清除 LoRA 并设置 seed 为 42 (在 ±999999999 内)，采样器节点原样报出 `HTTP 402: {"error":"Insufficient USD or Diem balance to complete request. Visit https://venice.ai/settings/api to add credits."}` (截图: `ui-venice.png`)。<br>*注：首次测试时因画布包含 LoRA 节点且 seed 超出范围 (1840591390 > 999999999)，上游报 400 校验拒收。* | 原生无 LoRA 请求返回 HTTP 402 `Insufficient USD or Diem balance`。 | **PASS_BILLING** (真实上游扣费失败) |
| 9 | **DeepInfra** | `https://deepinfra.com/docs/apis/image-generation`<br>`https://api.deepinfra.com/openapi.json` | `Authorization: Bearer <key>` | 同步：POST 返回 `{data: [{b64_json}]}` | `POST https://api.deepinfra.com/v1/openai/images/generations` | 公共 OpenAI 兼容接口不开放自定义 LoRA 注入（私有 LoRA 需在控制台预先部署） | **UI 验证通过**：采样器节点原样报出 `HTTP 402: {"detail":{"error":"You need positive balance to do inference..."}}` (截图: `ui-deepinfra.png`)。 | 原生请求返回 HTTP 402 `You need positive balance`。 | **PASS_BILLING** (真实上游扣费失败) |
| 10 | **Replicate** | `https://replicate.com/docs/reference/http`<br>`https://api.replicate.com/v1/models` | `Authorization: Bearer <key>` | 异步：POST predictions 返回 `id`，轮询 `GET /v1/predictions/{id}` | `POST https://api.replicate.com/v1/predictions` | 官方模型 Schema 驱动（如 `flux-dev-lora` 使用 `lora_weights` + `lora_scale`） | **UI 验证通过**：采样器节点原样报出 `Replicate 图像接口上游 HTTP 402: {"title":"Insufficient credit"}` (截图: `ui-replicate.png`)。 | 原生请求返回 HTTP 402 `Insufficient credit`。 | **PASS_BILLING** (真实上游扣费失败) |
| 11 | **Mage** | `https://docs.mage.space/api/models/mango`<br>`https://api.mage.space/v1/mango` | `Authorization: Bearer <key>` | 异步：POST generate 返回 `status_url`，轮询 status | `POST https://api.mage.space/v1/mango/generate` | 官方说明无传统 safetensors LoRA，角色风格通过 prompt 中 `@handle` 注入 | **UI 验证通过**：在自定义模型输入框输入 `mango-v3` 点击运行，采样器节点原样报出 `Mage 图像接口上游 HTTP 402: {"error":{"code":"payment_required"}}` (截图: `ui-mage.png`)。注：Mage 官方无公网 catalog 接口，已提交 TowerFinding。 | 原生请求返回 HTTP 402 `payment_required`。 | **PASS_BILLING** (真实上游扣费失败) |
| 12 | **SenseNova** | `https://platform.sensenova.cn/doc`<br>`https://token.sensenova.cn/v1` | `Authorization: Bearer <key>` | 同步：POST `v1/images/generations` | `POST https://token.sensenova.cn/v1/images/generations` | 官方图像协议无 LoRA 字段 | **UI 验证通过**：底模节点直接显示 `未配置 sensenova API 密钥（SENSENOVA_KEY / 设置面板 / x-sensenova-key）` (截图: `ui-sensenova.png`)。 | 本地校验无 Key。 | **BLOCKED_CONFIG** (未配置 SENSENOVA_KEY) |
| 13 | **OpenWorks** | `https://raw.githubusercontent.com/Tensor-Art/tensorart-skills/master/skills/tensorart-generate/SKILL.md`<br>`https://openapi.tensor.art/openworks/v1/tool/list` | `Echo-Access-Key: <key>` (`ak_tensor_...`) | 异步：POST `/task` 返回 `data.task.id`，轮询 `POST /task/query` | `POST https://openapi.tensor.art/openworks/v1/task` | 实测 named inputs `loras: [{id: string, weight: number}]` | **UI 验证通过，产生真实产物！** 真实 UI 运行任务 ID `1063433428164212076`，状态 `completed` (upstreamStatus: `FINISH`)，前端保存图像节点渲染本地拉取的图像预览，工作流弹窗展示图像缩略图 (截图: `05-openworks-success.png`, `06-openworks-canvas-with-image.png`, `ui-openworks.png`)。注：本次 UI 运行使用画布默认连接的 HF LoRA 节点 (`renderartist/Technically-Color-Z-Image-Turbo`)，未挂载 OpenWorks 专用 LoRA。 | 真实 UI 任务 `1063433428164212076`，输出图像 URL `/api/media/b872d0cf6fc14d077d0a39f08b1012b292425e2dd94bf4a1144cecec7c861722`。 | **PASS_GENERATION** (真实出图成功) |

---

## 二、代码修复与改进清单

1. **OpenWorks 别名映射与批次字段桥接** (`src/server/openWorksProvider.ts`):
   - 补全 `OPENWORKS_ALIASES`: 支持 `batch_size`, `count`, `image_num` 别名映射到上游 `result image count` / `image count`。
   - 严格遵循非侵入原则：禁止硬编码注入默认 `count = 1`；当画布提供 `batch_size: 1` 时正规映射，未提供时由上游决定并返回原始报错。新增独立单测验证。
2. **Venice 实时 Schema 驱动的非阻塞前置提示** (`src/server/schemaProviders.ts`):
   - 在 `modelSchema` 中基于动态加载的 `inputSchema.properties` 判定是否声明 `loras`，未声明时生成通用的 `schemaNotice` / `loraNotice` 返回给前端，用于 UI 提示而绝不在服务端拦截或静默改写请求。已通过 `TowerSend` 告知 ui6b (M3)。
3. **SenseNova 模型目录视频分类修复** (`src/server/senseNovaCatalog.ts`):
   - 根据 hub4 提交的 Finding，增加 `outputModalities.includes('video')` 识别，正确将视频输出模型归类为 `'video'` 而非 `'unknown'`。并在 `src/server/senseNovaCatalog.test.ts` 中补充了针对视频模态的测试用例。
4. **Mage 无 Catalog 体验改善 Finding 提交**:
   - 针对 Mage.space 官方无公网模型目录端点、导致 Loader 下拉为空的问题，已规范记录并提交 `TowerFinding` 建议后续进行 UI 引导优化。

---

## 三、真实出图产物审计 (OpenWorks UI 运行)

- **执行模型**：`photoreal_studio_z_image`
- **真实 UI 任务 ID**：`1063433428164212076`（18:44:49 JST，携带画布 prompt 与 seed 1840591390）
- **执行状态**：`completed` (upstreamStatus: `FINISH`)
- **生成产物本地服务路径**：`/api/media/b872d0cf6fc14d077d0a39f08b1012b292425e2dd94bf4a1144cecec7c861722`
- **UI 呈现状态**：界面下方提示「工作流运行成功！ 完成」，右下角「保存图像」节点完成图像拉取并显示预览，历史记录正常归档。
- **说明**：公开交付物中已脱敏移除私有云存储 host 及账号用户 ID。
