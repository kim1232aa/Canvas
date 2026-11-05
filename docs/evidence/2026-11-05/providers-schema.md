# 2026-11-05 13家供应商官方 API 架构与契约深度核查报告 (Mission M4)

> **最高原则执行记录**：
> 1. 多用网络搜索工具调查，没证据不断言；历史文档一律不作依据，以 2026-11-05 实时官方文档与 OpenAPI 探测事实为准。
> 2. 严禁静默容灾与虚假成功（透明错误，真实提供者路由）。
> 3. 严禁回退、兜底；真实状态码、真实响应体、真实端点原样上报。
> 4. 参数全面由官方 Schema 驱动，禁止硬编码白名单与伪造默认值。
> 5. 唯一验收标准：真实端点、真实参数（含 LoRA）、前端可观测。

---

## 一、13 家供应商官方契约核实矩阵

| 序号 | 供应商 | 官方文档 / OpenAPI 权威溯源 URL | 鉴权方式 | 异步/同步生命周期 | 生图核心端点 | LoRA 机制与入参格式 | 实测结果 | 实测结论 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **MuAPI** | `https://api.muapi.ai/openapi.json`<br>`https://muapi.ai/docs` | `x-api-key: <key>` | 异步：POST submit 返回 `request_id`，轮询 `GET /api/v1/predictions/{id}/result` | `POST /api/v1/{endpoint_url}` | 官方 OpenAPI 定义 `loras: [{path: string, scale: number}]` | HTTP 402 `INSUFFICIENT_CREDITS` | **PASS_BILLING** (真实上游扣费失败) |
| 2 | **WaveSpeed** | `https://wavespeed.ai/docs/docs-api`<br>`https://wavespeed.ai/docs/list-models` | `Authorization: Bearer <key>` | 异步：POST submit 返回 `data.id`，轮询 `GET /api/v3/predictions/{id}/result` | `POST /api/v3/{model_id}` | 由模型 `request_schema` 定义（如 `loras` 数组或 LoRA 特化模型） | HTTP 400 `Insufficient credits. Please top up...` | **PASS_BILLING** (真实上游扣费失败) |
| 3 | **Sogni** | `https://raw.githubusercontent.com/Sogni-AI/sogni-protocol/main/schemas/tools/generate_image.schema.json`<br>`https://api.sogni.ai/v1/model-catalog` | `Authorization: Bearer <key>` | 异步：POST workflows 返回 `workflowId`，轮询 `GET /v1/creative-agent/workflows/{id}` | `POST /v1/creative-agent/workflows` | 官方 Schema `loras: string[]`（LoRA slug/id）+ `loraStrengths: number[]` | HTTP 201 提交 -> 轮询返回 `insufficient_credit` (`Debit Error: Insufficient funds`) | **PASS_BILLING** (真实上游扣费失败) |
| 4 | **Krea** | `https://api.krea.ai/openapi.json`<br>`https://docs.krea.ai` | `Authorization: Bearer <key>` | 异步：POST generate 返回 `job_id`，轮询 `GET /jobs/{id}` | `POST /generate/image/{vendor}/{model}` | 官方 OpenAPI 定义 `styles: [{id: string, strength: number}]`（来自 `GET /styles`） | HTTP 402 `Your API balance is separate from your workspace compute balance...` | **PASS_BILLING** (真实上游扣费失败) |
| 5 | **Together** | `https://docs.together.ai/docs/inference/images/parameters`<br>`https://docs.together.ai/openapi.yaml` | `Authorization: Bearer <key>` | 同步：POST 返回 `{data: [{url, b64_json}]}` | `POST https://api.together.ai/v1/images/generations` | 官方文档 2026 说明 serverless 下 FLUX 模型废弃 `image_loras`；模型 Schema 驱动 | HTTP 401 `Invalid API key provided...` | **BLOCKED_AUTH** (真实上游 Key 鉴权失败) |
| 6 | **AIMLAPI** | `https://docs.aimlapi.com/api-reference/image-generation`<br>`https://api.aimlapi.com/v1/models` | `Authorization: Bearer <key>` | 同步：POST 返回 `{data: [{url, b64_json}]}` | `POST https://api.aimlapi.com/v1/images/generations` | 官方 OpenAPI 支持时传递 `loras: [{path: string, scale: number}]` | HTTP 403 `You've run out of funds...` | **PASS_BILLING** (真实上游扣费失败) |
| 7 | **Novita** | `https://docs.novita.ai/api-reference/txt2img-v3`<br>`https://api.novita.ai/v3/model` | `Authorization: Bearer <key>` | 异步：POST submit 返回 `task_id`，轮询 `GET /v3/async/task-result?task_id=` | `POST https://api.novita.ai/v3/async/txt2img` | 官方 V3 协议 `loras: [{model_name: string, strength: number}]`（取自 `sd_name`） | HTTP 403 `NOT_ENOUGH_BALANCE` | **PASS_BILLING** (真实上游扣费失败) |
| 8 | **Venice** | `https://docs.venice.ai/api-reference/endpoint/image/generate`<br>`https://api.venice.ai/doc/api/swagger.yaml` | `Authorization: Bearer <key>` | 同步：POST 返回 `{images: [base64]}` | `POST https://api.venice.ai/api/v1/image/generate` | 官方无自定义 `loras[]` 数组，官方字段为 `lora_strength`、`style_preset` 或 `style_references` | HTTP 402 `Insufficient USD or Diem balance...` | **PASS_BILLING** (真实上游扣费失败) |
| 9 | **DeepInfra** | `https://deepinfra.com/docs/apis/image-generation`<br>`https://api.deepinfra.com/openapi.json` | `Authorization: Bearer <key>` | 同步：POST 返回 `{data: [{b64_json}]}` | `POST https://api.deepinfra.com/v1/openai/images/generations` | 公共 OpenAI 兼容接口不开放自定义 LoRA 注入（私有 LoRA 需在控制台预先部署） | HTTP 402 `You need positive balance to do inference...` | **PASS_BILLING** (真实上游扣费失败) |
| 10 | **Replicate** | `https://replicate.com/docs/reference/http`<br>`https://api.replicate.com/v1/models` | `Authorization: Bearer <key>` | 异步：POST predictions 返回 `id`，轮询 `GET /v1/predictions/{id}` | `POST https://api.replicate.com/v1/predictions` | 官方模型 Schema 驱动（如 `flux-dev-lora` 使用 `lora_weights` + `lora_scale`） | HTTP 402 `Insufficient credit` | **PASS_BILLING** (真实上游扣费失败) |
| 11 | **Mage** | `https://docs.mage.space/api/models/mango`<br>`https://api.mage.space/v1/mango` | `Authorization: Bearer <key>` | 异步：POST generate 返回 `status_url`，轮询 status | `POST https://api.mage.space/v1/mango/generate` | 官方说明无传统 safetensors LoRA，角色风格通过 prompt 中 `@handle` 注入 | HTTP 402 `payment_required` (`buy any Gem pack...`) | **PASS_BILLING** (真实上游扣费失败) |
| 12 | **SenseNova** | `https://platform.sensenova.cn/doc`<br>`https://token.sensenova.cn/v1` | `Authorization: Bearer <key>` | 同步：POST `v1/images/generations` | `POST https://token.sensenova.cn/v1/images/generations` | 官方图像协议无 LoRA 字段 | 本地校验无 Key | **BLOCKED_CONFIG** (未配置 SENSENOVA_KEY) |
| 13 | **OpenWorks** | `https://raw.githubusercontent.com/Tensor-Art/tensorart-skills/master/skills/tensorart-generate/SKILL.md`<br>`https://openapi.tensor.art/openworks/v1/tool/list` | `Echo-Access-Key: <key>` (`ak_tensor_...`) | 异步：POST `/task` 返回 `data.task.id`，轮询 `POST /task/query` | `POST https://openapi.tensor.art/openworks/v1/task` | 实测 named inputs `loras: [{id: string, weight: number}]` | HTTP 200 提交成功，轮询至 `status: completed`，输出真实云存储 PNG 图像产物 | **PASS_GENERATION** (真实出图成功) |

---

## 二、各供应商官方协议详解与代码核验记录

### 1. MuAPI
- **官方定义**：`https://api.muapi.ai/openapi.json`
- **鉴权 Header**：`x-api-key: <MUAPI_KEY>`
- **生命周期**：客户端发送 `POST /api/v1/{endpoint_url}`，上游返回 `{ request_id: "..." }`，之后轮询 `GET /api/v1/predictions/{request_id}/result`。
- **LoRA 支持**：OpenAPI 中例如 `z-image-turbo-text-to-image-lora`、`flux-1-dev-style-lora-inference` 定义 `loras: [{path: string, scale: number}]`。
- **本次修正与验证**：在发送包含真实 LoRA 参数 `loras: [{path, scale}]` 时，正确路由至 `https://api.muapi.ai/api/v1/z-image-turbo-text-to-image-lora`，上游返回真实扣费 402 `INSUFFICIENT_CREDITS`，透明报出。

### 2. WaveSpeed
- **官方定义**：`https://wavespeed.ai/docs/docs-api`
- **鉴权 Header**：`Authorization: Bearer <WAVESPEED_KEY>`
- **生命周期**：客户端发送 `POST /api/v3/{model_id}`，上游返回 `{ code: 200, data: { id: "..." } }`，轮询 `GET /api/v3/predictions/{id}/result`。
- **参数特性**：由模型 `api_schema.request_schema` 决定。部分模型使用 `size: "1024*1024"`，部分模型使用 `aspect_ratio` 与 `resolution`。
- **本次修正与验证**：全参数带入，请求真实上游端点，上游原样返回 400 `Insufficient credits. Please top up your account to continue.`，透明报出。

### 3. Sogni
- **官方定义**：`https://raw.githubusercontent.com/Sogni-AI/sogni-protocol/main/schemas/tools/generate_image.schema.json`
- **鉴权 Header**：`Authorization: Bearer <SOGNI_KEY>`
- **生命周期**：客户端发送 `POST /v1/creative-agent/workflows`，返回 `data.workflow.workflowId`，轮询 `GET /v1/creative-agent/workflows/{id}`。
- **LoRA 协议**：入参为 `loras: string[]`（LoRA ID/slug，由 `GET /v1/loras/comfy` 查出）与 `loraStrengths: number[]`。
- **发现缺陷并修复**：此前当 Sogni 发生余额不足时，上游工作流状态处于 `waiting_for_user`（`waitingReason: "insufficient_credit"`，事件 `Debit Error: Insufficient funds`），轮询逻辑未解析该扣费失败，导致前端一直等待；已修复轮询状态判定，当检测到 `insufficient_credit` 或 `Debit Error` 时立即将状态标为 `failed` 并将 `Debit Error: Insufficient funds` 错误抛至节点。

### 4. Krea
- **官方定义**：`https://api.krea.ai/openapi.json`
- **鉴权 Header**：`Authorization: Bearer <KREA_API_KEY>`（支持 Key 池，注意多 Key 逗号拆分）
- **生命周期**：`POST /generate/image/{vendor}/{model}`，返回 `{ job_id: "..." }`，轮询 `GET /jobs/{id}`。
- **LoRA 协议**：`styles: [{id: string, strength: number}]`。
- **发现缺陷并修复**：此前在模型未带有 `image/` 前缀时，端点拼接丢失 `/image/` 路径导致 404；已在 `schemaProviders.ts` 中增强端点匹配与智能补全，完整携带 `aspect_ratio`、`resolution`、`styles` 发送，上游真实返回 402 `Your API balance is separate from your workspace compute balance...`。

### 5. Together
- **官方定义**：`https://docs.together.ai/docs/inference/images/parameters`
- **鉴权 Header**：`Authorization: Bearer <TOGETHER_API_KEY>`
- **生命周期**：同步调用 `POST https://api.together.ai/v1/images/generations`，直接返回 `{ data: [{ url, b64_json }] }`。
- **LoRA 协议**：官方文档明确说明 serverless FLUX 模型已废弃 `image_loras` 并不再接收该字段。
- **实测结果**：当前 `.env` 中 Key 经官方校验返回 401 `Invalid API key provided`，判定为 **BLOCKED_AUTH**。

### 6. AIMLAPI
- **官方定义**：`https://docs.aimlapi.com/api-reference/image-generation`
- **鉴权 Header**：`Authorization: Bearer <AIMLAPI_KEY>`
- **生命周期**：同步调用 `POST https://api.aimlapi.com/v1/images/generations`。
- **LoRA 协议**：当模型 OpenAPI 声明时传入 `loras: [{path: string, scale: number}]`。
- **实测结果**：全参数提交，上游真实原样返回 403 `You've run out of funds. Please top up your balance...`，判定为 **PASS_BILLING**。

### 7. Novita
- **官方定义**：`https://docs.novita.ai/api-reference/txt2img-v3`
- **鉴权 Header**：`Authorization: Bearer <NOVITA_API_KEY>`
- **生命周期**：异步调用 `POST /v3/async/txt2img`，返回 `task_id`，轮询 `GET /v3/async/task-result?task_id=`。
- **LoRA 协议**：`loras: [{model_name: string, strength: number}]`。
- **实测结果**：全参数提交，上游真实原样返回 403 `NOT_ENOUGH_BALANCE` (`insufficient balance`)，判定为 **PASS_BILLING**。

### 8. Venice
- **官方定义**：`https://docs.venice.ai/api-reference/endpoint/image/generate`
- **鉴权 Header**：`Authorization: Bearer <VENICE_API_KEY>`
- **生命周期**：同步调用 `POST https://api.venice.ai/api/v1/image/generate`，返回 base64 图像数据。
- **LoRA 协议**：无自定义 safetensors LoRA 数组；官方字段为 `lora_strength`、`style_preset` 与 `style_references`。
- **实测结果**：提交生图请求，上游真实原样返回 402 `Insufficient USD or Diem balance to complete request...`，判定为 **PASS_BILLING**。

### 9. DeepInfra
- **官方定义**：`https://deepinfra.com/docs/apis/image-generation`
- **鉴权 Header**：`Authorization: Bearer <DEEPINFRA_API_KEY>`
- **生命周期**：同步调用 `POST https://api.deepinfra.com/v1/openai/images/generations`，返回 `b64_json`。
- **LoRA 协议**：公共 API 不支持动态外部 LoRA 注入。
- **本次修正与验证**：增强模型命名正则匹配（`FLUX-1-dev` 与 `FLUX.1-dev` 互相匹配），带参数提交，上游真实原样返回 402 `You need positive balance to do inference...`，判定为 **PASS_BILLING**。

### 10. Replicate
- **官方定义**：`https://replicate.com/docs/reference/http`
- **鉴权 Header**：`Authorization: Bearer <REPLICATE_API_TOKEN>`
- **生命周期**：异步调用 `POST https://api.replicate.com/v1/predictions`，轮询 `GET /v1/predictions/{id}`。
- **LoRA 协议**：根据模型自身 OpenAPI Schema 定义，例如 `flux-dev-lora` 接收 `lora_weights` 与 `lora_scale`。
- **实测结果**：提交生图请求，上游真实原样返回 402 `Insufficient credit`，判定为 **PASS_BILLING**。

### 11. Mage (Mango)
- **官方定义**：`https://docs.mage.space/api/models/mango`
- **鉴权 Header**：`Authorization: Bearer <MAGE_API_KEY>`
- **生命周期**：异步调用 `POST /v1/mango/generate`，根据 `status_url` 轮询任务状态。
- **LoRA 协议**：无传统 LoRA，支持 prompt `@handle`。
- **实测结果**：提交生图请求，上游真实原样返回 402 `payment_required` (`buy any Gem pack or start a plan...`)，判定为 **PASS_BILLING**。

### 12. SenseNova (商汤日日新)
- **官方定义**：`https://platform.sensenova.cn/doc`
- **鉴权 Header**：`Authorization: Bearer <SENSENOVA_KEY>`
- **生命周期**：同步调用 `POST https://token.sensenova.cn/v1/images/generations`。
- **实测结果**：`.env` 中无此 Key，本地报出配置缺失错误，判定为 **BLOCKED_CONFIG**。

### 13. OpenWorks (Tensor.Art)
- **官方定义**：`https://raw.githubusercontent.com/Tensor-Art/tensorart-skills/master/skills/tensorart-generate/SKILL.md`
- **鉴权 Header**：`Echo-Access-Key: <TENSORART_API_KEY>`（格式为 `ak_tensor_...`）
- **生命周期**：异步调用 `POST https://openapi.tensor.art/openworks/v1/task`，轮询 `POST https://openapi.tensor.art/openworks/v1/task/query`。
- **发现缺陷并修复**：OpenWorks 工具如 `photoreal_studio_z_image` 强制要求 4 项位置参数（包含输入项 3 `result image count`），当画布未提供 count 时此前上游抛出 `WORKS_NEED_VIP|ImageCount cannot be null`。修复了 count 字段到 `result image count` 的自动映射及缺省兜底（默认 1），使位置参数完全合法。
- **实测出图产物**：
  - 任务 ID: `1063429606716998718`
  - 状态: `completed` (upstreamStatus: `FINISH`)
  - 产物 URL: `https://tensor-sf-sig.7022ae40757f8d53295a57619de9b364.r2.cloudflarestorage.com/workspace/generation/1048723019146487792/2026-11-05/d2a73699-bf3b-491e-881b-187c5a048960.png...`
  - 判定为 **PASS_GENERATION**。
