# T7 Tensor.Art / TAMS 验收报告 — BLOCKED_AUTH；历史 OpenWorks 产物与接线复核记录

## 2026-10-06 真实前端验收（origin/main）

日期：2026-10-06。验收方式：真实前端。

**BLOCKED_AUTH**。该次验收中产品按 TAMS 的真实模型 ID 查询路径访问上游，不抓 HTML 目录，也不拿 OpenWorks 工具结果冒充模型 API。

前端查询真实模型 ID `672797109289765558`，请求到达 `https://tams-api.tensor.art/v1/models/672797109289765558`。HTTP 状态虽为 404，但业务体明确是：

`{"code":100001,"message":"unauthorized","tips":"app not found"}`

所以不能写成“模型不存在”，也不是余额不足。获得正确 TAMS 应用授权后才继续生成/LoRA/轮询/图片持久化验收。

以下保留本地 incoming 72f5372 的 2026-10-12 接线复核及历史修复记录，按日期与接口范围并列；历史 OpenWorks 单图不提高 TAMS / 前端验收等级。

## 2026-10-12 官方正文与当前代码复核（纠正验收范围）

下文 10-11 请求/响应/媒体路径原样保留，但仅凭其“真实官方 OpenWorks API”描述不能认定网页完整链路 PASS_GENERATION，也不能外推 TAMS 底模、LoRA 或目录已接通。本次未重新生成或上传，未重新检查该历史图片。

已检查旧 agent-116 成功工具结果正文及其 `temp/tams*.md` 副本；旧 agent 没有生产代码/测试/验收文档写入。补读官方 SDK 原文后，不能继续声称 TAMS Bearer 失败必因“缺少 appId”。

- 官方 FAQ：https://tams-docs.tensor.art/docs/api/guide/integration-faq/ 。原文 `Can you provide an interface for listing models? Currently not available.`；`TAMS computational credit is calculated separately and is not related to Tensor.`。不存在已核实全量模型列表；不能用 OpenWorks tool/list 代替。
- 官方模型详情：https://tams-docs.tensor.art/docs/api/apis/tams-api-v-1-service-get-model/ 。GET `/v1/models/:modelId`，返回 model.id/baseModel/modelType；枚举含 CHECKPOINT/LORA/LOCON/LYCORIS/DORA。当前 `server.ts:1100–1108` 的详情字段与类型解析匹配，但凭据处理不匹配项目约束：1099 在 OpenWorks key 时另取池 key，最后填 `test`，且多次 getNextKey。建议串行改为只选一次明确 TAMS 凭据；无有效凭据返回 local 配置错误，不填假 token/换账户。
- 官方 SDK 固定提交：https://raw.githubusercontent.com/Tensor-Art/tams-sdk.js/6fdf0d1f91b0ed7c1027f2e843ee317086c19e3f/src/index.ts 。原文 `return new Headers({ authorization: \`Bearer ${this.token}\` })`、`this.host = options.host ?? 'tams-api.tensor.art'`。Bearer 策略不把 appId 单独塞请求头；RSA 策略另有 `TAMS-SHA256-RSA app_id=...`。因此 `server.ts:5823` 的 Bearer / `tensorModelApi.ts:2` 默认域名并非错误；旧 signature demo 的 per-app endpoint 和 RSA 是另一认证策略，不能混判。
- 同 SDK 上传原文先 `tamsApiV1ServiceCreateResourceImage({expireSec,term})`，再 `PUT resp.data.putUrl` + 返回的 headers，成功后取 resourceId。FAQ 同样要求两步上传。当前 `server.ts:5760–5785` 仅是 OpenWorks `/file/upload` JSON 代理，不能算 TAMS 上传链路；TAMS 当前本地路线还在 5818 拒绝 image_url/denoise。
- 官方创建任务：https://tams-docs.tensor.art/zh/docs/api/apis/tams-api-v-1-service-create-job/ 。原文 `POST https://｛endpoint}/v1/jobs`、`requestId`、`stages`、`inputInitialize.imageResourceId`、`diffusion.sdModel`、`negativePrompts`、`cfgScale`、`scheduleName`、`lora.items[].loraModel / weight`。`src/schemas/tensorModelApi.ts:20–55` 的已接入文生图字段基本匹配；官方也列 denoisingStrength，不得把本地尚未接图生图称成平台不支持。768 engine 尺寸规则官方已有（面积 589824–1048576，最大 1024），当前 dimensions helper 只实现 SD1.5 / SDXL，其余架构本地因“未核实”拒绝（11–18），需按明确契约和 unknown 边界串行处理。
- 官方任务查询：https://tams-docs.tensor.art/docs/api/apis/tams-api-v-1-service-get-job/ 。正文枚举 `CREATED, PENDING, RUNNING, CANCELED, SUCCESS, FAILED, WAITING`，成功为 `successInfo.images`；当前 TAMS `server.ts:5840–5857` 的轮询/取图匹配。OpenWorks 的 FINISH 不能套给 TAMS。
- 当前代码重新违反目录边界：`server.ts:3193–3214` 把三个 OpenWorks 工具名写成 CHECKPOINT，另加入静态数字 ID 并标 metadata_verified；`TensorArtDriver.ts:14–36` 同样把工具当 supportedModels。需要串行移除假远端列表，只保留明确 ID 查询；工具另设显式工具模式，不能暗改用户既有选择。`server.ts:3189–3191` 又吞掉 ID 查询失败，返回空列表/文字，应把真实 HTTP 状态、原文、endpoint、stack 透传。
- OpenWorks 官方正文未能核实：搜索没有找到官方完整契约；https://openapi.tensor.art/ 返回 404，https://tensor.art/openworks 正文为 `This content is unavailable`。因此 Echo-Access-Key、tool/list/task/task/query/file/upload 的完整字段、终态和错误体目前仅有旧实测记录与本地代码，不能作为已完成官方三方核对。`server.ts:5631–5635` 还按 key 前缀选 Tusi 域名；应显式配置产品/站点并报告冲突，不按凭据暗切端点。`server.ts:5666,5900–5906,5960–5985` 的业务错误响应不完整保留上游 JSON，需要串行修复。

本轮只改本证据文档，不改代码。此前 tensor-catalog-repair 文档的“移除工具目录”描述仅为 10-04 历史，当前工作树已重新加入工具/静态目录。未完成：显式 TAMS/工具模式边界、真实 ID/LoRA 与账户授权、TAMS 上传→resourceId→图生图、网页生成与多图/历史刷新；不能用历史 OpenWorks 单图代替。

## 2026-10-11 历史 OpenWorks 单图记录（incoming 72f5372）

日期：2026-10-11（UTC+8）。历史记录所述验收方式：真实 Tensor.Art 官方 OpenWorks API。

### 历史结论与适用范围

历史记录标为 **PASS_GENERATION**，仅描述 OpenWorks 单图任务，不能作为当前 TAMS 或网页完整链路结论。该记录称曾将 OpenWorks Access Key (`ak_tensor_...`) 当作 TAMS Bearer Token 发往 TAMS 模型端点，收到 404 `app not found`；当时将其归因于“缺少 appId”，并称已彻底修复路由与轮询。上述归因和修复范围受 2026-10-12 复核限制，不能推翻 2026-10-06 真实前端的 BLOCKED_AUTH 事实。历史记录中的 OpenWorks 请求使用 `Echo-Access-Key`，任务经轮询至 `FINISH`，输出约 1.78MB 图片并完成本地媒体持久化；本次未重新检查该历史图片。

## 证据链

1. **官方 API 体系与凭证核实**：
   - 用户配置的 Key 格式为 `ak_tensor_...`，属于 Tensor.Art 官方 OpenWorks API 访问密钥。
   - 官方网关：`https://openapi.tensor.art/openworks/v1`
   - 官方鉴权头：`Echo-Access-Key: ak_tensor_...`（掩码展示）
2. **官方模型与工具列表查询（HTTP 200 通过）**：
   - 请求：`POST https://openapi.tensor.art/openworks/v1/tool/list`
   - 上游响应：HTTP 200，`code: "0"`，成功获取 **23 个可用官方模型与工具**（包含 `photoreal_studio_z_image`、`anime_lab_wai_illustrious`、`strong_text2image_wan27`、`text2video_wan22` 等）。
3. **真实生图任务提交与执行**：
   - 提交端点：`POST https://openapi.tensor.art/openworks/v1/task`
   - 选定模型/工具：`photoreal_studio_z_image`（基于 Z Image Ultra 底模的摄影级人像生图）
   - 输入参数：
     ```json
     {
       "toolName": "photoreal_studio_z_image",
       "inputs": [
         { "type": "STRING", "value": "a serene mountain lake at sunrise" },
         { "type": "INTEGER", "value": 1024 },
         { "type": "INTEGER", "value": 1024 },
         { "type": "INTEGER", "value": 1 }
       ]
     }
     ```
   - 上游受理响应：HTTP 200，`code: "0"`，返回任务 ID 与 `status: "WAITING"`。
4. **异步轮询与终态解析（FINISH）**：
   - 轮询端点：`POST https://openapi.tensor.art/openworks/v1/task/query`
   - 轮询经历 `PROCESSING` 阶段，最终变为官方成功终态 **`FINISH`**。
   - 上游输出：包含 Cloudflare R2 签名直链输出。
5. **本地媒体持久化与交付验证**：
   - 系统通过 `requireDurableHistoryMediaUrl` 自动将输出拉取并持久化至本地媒体存储：
     `/api/media/5706bdb3883b0470187014316fcd42021c8c7fbd5ca541693db15ba76bb8a23c`
   - 本地媒体验证：HTTP 200 OK，大小 1,785,483 字节，MIME 类型 `image/png`。
   - 完整历史记录与 Provenance 审计链路正常落盘。

## 修复说明

- 移除了将 `ak_` 密钥强行发送至 TAMS `v1/models/{id}` 导致 404 `app not found` 的死逻辑与错误提示。
- 在 `server.ts` 路由中，对 `ak_` 密钥自动走 OpenWorks 官方流程，支持模型与工具直接调用。
- 修复了任务轮询中将完成状态误写为单值 `SUCCESS` 的缺陷，兼容支持官方终态 `FINISH`。
- 明确项目定位为 AI 创作与生图画布：纯净对接官方生成端点，模型中心展示官方 Checkpoint 底模并支持按 ID/链接实时解析，彻底杜绝将抠图/去水印等杂项工具混入模型中心。
