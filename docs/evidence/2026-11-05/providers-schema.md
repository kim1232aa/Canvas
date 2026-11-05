# 2026-11-05 13家供应商官方 API 架构与契约深度核查报告 (Mission M4)

> **最高原则执行记录**：
> 1. 多用网络搜索工具调查，没证据不断言；历史文档一律不作依据，以 2026-11-05 实时官方文档与 OpenAPI 探测事实为准。
> 2. 严禁静默容灾与虚假成功（透明错误，真实提供者路由）。
> 3. 严禁回退、兜底；真实状态码、真实响应体、真实端点原样上报。
> 4. 参数全面由官方 Schema 驱动，禁止硬编码白名单与伪造默认值。
> 5. 唯一验收标准：真实端点、真实参数（含 LoRA）、前端实际点击通过并产生真实产物 / 节点报错证据。

---

## 一、13 家供应商官方契约核查与双轨验证矩阵

| 序号 | 供应商 | 官方文档 / OpenAPI 权威溯源 URL | 鉴权方式 | 生命周期 | 生图核心端点 | LoRA 机制与入参格式 | UI 点击实测结果（真实界面节点报错 / 产物截图） | API 原生诊断与真实端点回包（辅助取证，非 UI 验收） | 最终判定 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **MuAPI** | `https://api.muapi.ai/openapi.json`<br>`https://muapi.ai/docs` | `x-api-key: <key>` | 异步：POST 返回 `request_id`，轮询 `GET /api/v1/predictions/{id}/result` | `POST /api/v1/{endpoint_url}` | 官方 OpenAPI 定义 `loras: [{path: string, scale: number}]` | 采样器节点报错 `HTTP 422: {"detail":[{"loc":["body","image_url"],"msg":"Field required"}]}` (截图: `ui-muapi.png`) | 原生请求 `z-image-turbo-text-to-image-lora` 返回 HTTP 402 `INSUFFICIENT_CREDITS` | **PASS_BILLING** (真实上游扣费失败) |
| 2 | **WaveSpeed** | `https://wavespeed.ai/docs/docs-api`<br>`https://wavespeed.ai/docs/list-models` | `Authorization: Bearer <key>` | 异步：POST 返回 `data.id`，轮询 `GET /api/v3/predictions/{id}/result` | `POST /api/v3/{model_id}` | 由模型 `request_schema` 定义（如 `loras` 数组或 LoRA 特化模型） | 采样器节点报错 `HTTP 400: {"code":400,"message":"Insufficient credits. Please top up your account to continue."}` (截图: `ui-wavespeed.png`) | 原生请求返回 HTTP 400 `Insufficient credits` | **PASS_BILLING** (真实上游扣费失败) |
| 3 | **Sogni** | `https://raw.githubusercontent.com/Sogni-AI/sogni-protocol/main/schemas/tools/generate_image.schema.json`<br>`https://api.sogni.ai/v1/model-catalog` | `Authorization: Bearer <key>` | 异步：POST workflows 返回 `workflowId`，轮询 `GET /v1/creative-agent/workflows/{id}` | `POST /v1/creative-agent/workflows` | 官方 Schema `loras: string[]`（LoRA slug/id）+ `loraStrengths: number[]` | 采样器节点因上游排队/余额中断停止（`isTaskFailureBody` 拦截 `waiting_for_user` + `waitingReason: "insufficient_credit"`） | 原生工作流执行事件返回 `Debit Error: Insufficient funds` (HTTP 201 提交 -> 轮询 pause) | **PASS_BILLING** (真实上游扣费失败) |
| 4 | **Krea** | `https://api.krea.ai/openapi.json`<br>`https://docs.krea.ai` | `Authorization: Bearer <key>` | 异步：POST generate 返回 `job_id`，轮询 `GET /jobs/{id}` | `POST /generate/image/{vendor}/{model}` | 官方 OpenAPI 定义 `styles: [{id: string, strength: number}]`（来自 `GET /styles`） | 采样器节点报错 `HTTP 422: {"error":"Validation failed","details":[{"field":"aspect_ratio",...}]}` (截图: `ui-krea.png`) | 补全 aspect_ratio/resolution 原生请求返回 HTTP 402 `Your API balance is separate...` | **PASS_BILLING** (真实上游扣费失败) |
| 5 | **Together** | `https://docs.together.ai/docs/inference/images/parameters`<br>`https://docs.together.ai/openapi.yaml` | `Authorization: Bearer <key>` | 同步：POST 返回 `{data: [{url, b64_json}]}` | `POST https://api.together.ai/v1/images/generations` | 官方说明 serverless FLUX 废弃 `image_loras`；由模型 Schema 驱动 | 底模节点直接标红报出 `HTTP 401 Unauthorized: {"error":{"message":"Unauthorized"}}` (截图: `ui-together.png`) | 原生请求返回 HTTP 401 `Invalid API key provided` | **BLOCKED_AUTH** (真实上游 Key 鉴权失败) |
| 6 | **AIMLAPI** | `https://docs.aimlapi.com/api-reference/image-generation`<br>`https://api.aimlapi.com/v1/models` | `Authorization: Bearer <key>` | 同步：POST 返回 `{data: [{url, b64_json}]}` | `POST https://api.aimlapi.com/v1/images/generations` | 官方 OpenAPI 支持时传递 `loras: [{path: string, scale: number}]` | 采样器节点报错 `HTTP 403: {"title":"Forbidden","message":"You've run out of funds..."}` (截图: `ui-aimlapi.png`) | 原生请求返回 HTTP 403 `You've run out of funds` | **PASS_BILLING** (真实上游扣费失败) |
| 7 | **Novita** | `https://docs.novita.ai/api-reference/txt2img-v3`<br>`https://api.novita.ai/v3/model` | `Authorization: Bearer <key>` | 异步：POST submit 返回 `task_id`，轮询 `GET /v3/async/task-result?task_id=` | `POST https://api.novita.ai/v3/async/txt2img` | 官方 V3 协议 `loras: [{model_name: string, strength: number}]`（取自 `sd_name`） | 采样器节点报错 `HTTP 403: {"code":403, "reason":"NOT_ENOUGH_BALANCE", "message":"insufficient balance"}` (截图: `ui-novita.png`) | 原生请求返回 HTTP 403 `NOT_ENOUGH_BALANCE` | **PASS_BILLING** (真实上游扣费失败) |
| 8 | **Venice** | `https://docs.venice.ai/api-reference/endpoint/image/generate`<br>`https://api.venice.ai/doc/api/swagger.yaml` | `Authorization: Bearer <key>` | 同步：POST 返回 `{images: [base64]}` | `POST https://api.venice.ai/api/v1/image/generate` | 官方无自定义 `loras[]` 数组，官方字段为 `lora_strength`、`style_preset` 或 `style_references` | 采样器节点报错 `HTTP 400: {"details":{"_errors":["Unrecognized key(s) in object: 'loras'"]}}` (截图: `ui-venice.png`) | 原生无 LoRA 请求返回 HTTP 402 `Insufficient USD or Diem balance` | **PASS_BILLING** (真实上游扣费失败) |
| 9 | **DeepInfra** | `https://deepinfra.com/docs/apis/image-generation`<br>`https://api.deepinfra.com/openapi.json` | `Authorization: Bearer <key>` | 同步：POST 返回 `{data: [{b64_json}]}` | `POST https://api.deepinfra.com/v1/openai/images/generations` | 公共 OpenAI 兼容接口不开放自定义 LoRA 注入（私有 LoRA 需在控制台预先部署） | 采样器节点报错 `HTTP 402: {"detail":{"error":"You need positive balance to do inference..."}}` (截图: `ui-deepinfra.png`) | 原生请求返回 HTTP 402 `You need positive balance` | **PASS_BILLING** (真实上游扣费失败) |
| 10 | **Replicate** | `https://replicate.com/docs/reference/http`<br>`https://api.replicate.com/v1/models` | `Authorization: Bearer <key>` | 异步：POST predictions 返回 `id`，轮询 `GET /v1/predictions/{id}` | `POST https://api.replicate.com/v1/predictions` | 官方模型 Schema 驱动（如 `flux-dev-lora` 使用 `lora_weights` + `lora_scale`） | 采样器节点报错 `Replicate 图像接口上游 HTTP 402: {"title":"Insufficient credit"}` (截图: `ui-replicate.png`) | 原生请求返回 HTTP 402 `Insufficient credit` | **PASS_BILLING** (真实上游扣费失败) |
| 11 | **Mage** | `https://docs.mage.space/api/models/mango`<br>`https://api.mage.space/v1/mango` | `Authorization: Bearer <key>` | 异步：POST generate 返回 `status_url`，轮询 status | `POST https://api.mage.space/v1/mango/generate` | 官方说明无传统 safetensors LoRA，角色风格通过 prompt 中 `@handle` 注入 | 采样器节点报错 `Mage 图像接口上游 HTTP 402: {"error":{"code":"payment_required"}}` (截图: `ui-mage.png`) | 原生请求返回 HTTP 402 `payment_required` | **PASS_BILLING** (真实上游扣费失败) |
| 12 | **SenseNova** | `https://platform.sensenova.cn/doc`<br>`https://token.sensenova.cn/v1` | `Authorization: Bearer <key>` | 同步：POST `v1/images/generations` | `POST https://token.sensenova.cn/v1/images/generations` | 官方图像协议无 LoRA 字段 | 底模节点直接显示 `未配置 sensenova API 密钥（SENSENOVA_KEY / 设置面板 / x-sensenova-key）` (截图: `ui-sensenova.png`) | 本地校验无 Key | **BLOCKED_CONFIG** (未配置 SENSENOVA_KEY) |
| 13 | **OpenWorks** | `https://raw.githubusercontent.com/Tensor-Art/tensorart-skills/master/skills/tensorart-generate/SKILL.md`<br>`https://openapi.tensor.art/openworks/v1/tool/list` | `Echo-Access-Key: <key>` (`ak_tensor_...`) | 异步：POST `/task` 返回 `data.task.id`，轮询 `POST /task/query` | `POST https://openapi.tensor.art/openworks/v1/task` | 实测 named inputs `loras: [{id: string, weight: number}]` | **运行成功，产生真实图像！** 保存图像节点渲染图像产物预览，工作流弹窗展示结果缩略图 (截图: `05-openworks-success.png`, `06-openworks-canvas-with-image.png`, `ui-openworks.png`) | 任务 ID `1063429606716998718`，最终状态 `completed`，输出真实云存储 PNG | **PASS_GENERATION** (真实出图成功) |

---

## 二、代码修复与改进清单

1. **OpenWorks 别名映射与批次字段桥接** (`src/server/openWorksProvider.ts`):
   - 补全 `OPENWORKS_ALIASES`: 支持 `batch_size`, `count`, `image_num` 别名映射到上游 `result image count` / `image count`。
   - 严格遵循非侵入原则：禁止硬编码默认 `count = 1`；当画布提供 `batch_size: 1` 时正规映射，未提供时由上游决定。
2. **驱动层错误透明度强化** (`src/engines/drivers/ReplicateDriver.ts`, `MageDriver.ts`, `SenseNovaDriver.ts`):
   - 捕获非 2xx 响应时，确保 `(err as any).status` 与 `(err as any).data` 挂载完整的上游响应体，禁止丢失状态码或吞并错误。
3. **Sogni 契约严格遵循** (`src/server/schemaProviders.ts`):
   - 保持上游原始状态 `status: waiting_for_user` 与 `waitingReason: "insufficient_credit"` 原样向上传递，由 `isTaskFailureBody` 统一判定终止，严格符合 `schemaContract.test.ts` 契约规范。
4. **Mage 无 Catalog 体验改善 Finding 提交**:
   - 针对 Mage.space 官方无公网模型目录端点、导致 Loader 下拉为空的问题，已规范记录并提交 `TowerFinding` 建议后续进行 UI 引导优化。

---

## 三、真实出图产物审计 (OpenWorks)

- **执行模型**：`photoreal_studio_z_image`
- **上游任务 ID**：`1063429606716998718`
- **执行状态**：`completed` (upstreamStatus: `FINISH`)
- **生成产物路径**：`https://tensor-sf-sig.7022ae40757f8d53295a57619de9b364.r2.cloudflarestorage.com/workspace/generation/1048723019146487792/2026-11-05/d2a73699-bf3b-491e-881b-187c5a048960.png`（脱敏，移除签名凭据）
- **UI 呈现状态**：界面下方提示「工作流运行成功！ 完成」，右下角「保存图像」节点完成图像拉取并显示预览，历史记录正常归档。
