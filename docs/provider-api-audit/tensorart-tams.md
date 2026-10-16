# Tensor.Art TAMS API 审计

抓取日期：2026-10-15 Asia/Shanghai  
研究方法：官方 TAMS 文档站 + OpenAPI JSON + Integration FAQ / Signature / LoRA use-case；Grok CLI **401**。  
**严禁与 OpenWorks 混淆**：本文件只覆盖 **TAMS Model / Jobs API**（Bearer 或 RSA 签名）。OpenWorks（`ak_tensor_` + `Echo-Access-Key`）见 `tensorart-openworks.md`。

## 1) 官方 docs / OpenAPI URL

| 资源 | URL | 备注 |
|------|-----|------|
| TAMS API（Swagger UI 壳） | https://tams-docs.tensor.art/docs/api/apis/tams-api/ | 2026-10-15 可访问；正文主要为 Spec 入口 |
| OpenAPI Spec（官方链接） | https://echoing-swagger.oss-cn-shanghai.aliyuncs.com/tams/tams_api.swagger.online.json | swagger 2.0，title「TAMS API」v1 |
| Signature 介绍 | https://tams-docs.tensor.art/docs/api/signature/signature_intro/ | 需尾斜杠；无签名 → **401** |
| Signature 生成 | https://tams-docs.tensor.art/docs/api/signature/signature_build/ | Simple Bearer + Standard RSA |
| Integration FAQ | https://tams-docs.tensor.art/docs/api/guide/integration-faq/ | **无 list models 接口**；积分价 |
| LoRA 组件 | https://tams-docs.tensor.art/docs/use-cases/basic/component/lora/ | `lora.items[]` |
| Private model | https://tams-docs.tensor.art/docs/use-cases/model/private-model/ | `loraAccessKey` / `modelAccessKey` |
| 应用控制台 | https://tams.tensor.art/ / https://tams.tensor.art/app | 创建应用、取 Token |
| 文档站 sitemap | https://tams-docs.tensor.art/sitemap.xml | 条目现指向 docs-tams / tams-docs 系 |

**Host / 端点别名（官方与生态并存，接线须显式配置，禁止暗切）：**

| Host | 出处 |
|------|------|
| `https://ap-east-1.tensorart.cloud` | Signature 文档请求示例 `POST …/v1/jobs` |
| `https://tams-api.tensor.art` | 画布/社区常用 Model API 基址（与 OpenAPI host 占位 `{endpoint}` 同属 TAMS 族） |
| OpenAPI `host` | `{endpoint}` 占位 |

## 2) 鉴权方式

官方两种（signature_build）：

### Simple Authentication（文档称易用）

```
Authorization: Bearer {your_token}
Content-Type: application/json; charset=UTF-8
```

Token 在应用侧获取（Get Token 节）。

### Standard Authentication（生产推荐）

- RSA 2048+ 私钥签名；公钥上传 TAMS
- `Authorization: TAMS-SHA256-RSA appid=…,nonce_str=…,timestamp=…,signature=…`（类型名以文档为准，文档写可能变更）
- StringToSign = `HTTPMethod\n` + `URL(无域名)\n` + `timestamp\n` + `nonce\n` + `body`
- 失败：signature_intro 写明 **401 Unauthorized**

**不是** OpenWorks 的 `Echo-Access-Key: ak_tensor_…`。用 OpenWorks key 当 Bearer 调 TAMS → 官方/实测族错误（如 app not found），**禁止**当作 TAMS 已打通。

## 3) 模型目录端点

- FAQ 原文：**「Can you provide an interface for listing models? Currently not available.」**
- 有：`GET /v1/models/{modelId}`（OpenAPI：`TamsApiV1Service_GetModel`）→ 单模型详情（id/name/baseModel/modelType/triggerWords…）
- `modelType` 枚举含 `CHECKPOINT`、`LORA`、`LOCON`、`LYCORIS`、`VAE`、`MOTION_LORA` 等（OpenAPI `ProjectModelTypeT`）
- **无**官方全量 list / 分页 / 搜索 API → 画布须用已知数字模型 ID 或站外目录，禁止伪造「全站 catalog」端点

## 4) 生图 / 生视频端点与异步轮询

### 生图（核心）

```
POST /v1/jobs
Body: {
  "requestId"|"request_id": "<idempotent id>",
  "stages": [
    { "type": "INPUT_INITIALIZE", "inputInitialize": { "seed": -1|"-1", "count": 1 } },
    { "type": "DIFFUSION", "diffusion": { "width", "height", "prompts", "sdModel"|"sd_model", … } }
  ],
  "notifyUrl"?: "…"
}
→ { "job": { "id", "status", "credits", … } }

GET /v1/jobs/{jobId}   # 轮询
DELETE /v1/jobs/{jobId}  # 取消
```

状态枚举（OpenAPI）：`CREATED|PENDING|RUNNING|WAITING|SUCCESS|FAILED|CANCELED|…`  
成功：`successInfo.images[]`（及可选 `videos[]`）。  
demo/轮询习惯：约 1s 间隔直到 SUCCESS/FAILED（官方 GitHub signature demo 模式）。

其它生图相关：

| 路径 | 作用 |
|------|------|
| `POST /v1/jobs/credits` | 估分（stages → credits） |
| `POST /v1/jobs/workflow` | 工作流 job |
| `POST /v1/jobs/workflow/template` | 模板 job |
| `POST /v1/resource/image` | 上传资源拿 putUrl |
| `GET /v1/workflows/{templateId}` | 模板字段 |

FAQ：Rate limit **5 QPS**（可申请调整）。

### 生视频

**结论：官方无独立、完整的「文生视频 / 图生视频」产品级公开 API 文档页（sitemap 无 WAN/Kling 类 recipe）。**

证据与边界：

1. Integration FAQ / Tutorial 分区强调 **image generation** stages（`INPUT_INITIALIZE`、`DIFFUSION` 等），未提供现代 T2V 专用 guide。
2. OpenAPI 存在阶段类型 `IMAGE_TO_ANIMATE_DIFF`，以及 `successInfo.videos[]`、`ProjectModelTypeT.MOTION_LORA`、`AnimateDiff` 结构——属于 **AnimateDiff / 扩散管线衍生视频**，不是独立视频模型网关文档。
3. 工作流 job 可通过 Comfy 节点图产出视频类结果，但是 **workflow 模板驱动**，参数随模板变化，**不能**当成统一 videoGen 契约。

画布：**不要**宣称 TAMS「已接好通用视频 API」；若只用 AnimateDiff/workflow，须按官方阶段/模板字段接线并单独验收。更现代的 Tensor 视频工具链若走 OpenWorks 工具名，属 **另一产品**（见 openworks 文件）。

## 5) LoRA

官方字段（lora use-case + OpenAPI `tams_apiLora` / `tams_apiLoraItem`）：

```json
"lora": {
  "items": [
    {
      "loraModel": "<uint64 model id string>",
      "weight": 1.1,
      "blockWeight": "可选 lbw 字符串",
      "loraAccessKey": "私有 LoRA 时需要"
    }
  ]
}
```

- 挂在 **DIFFUSION**（及 adetailer 等可嵌 diffusion 的结构）下
- 强度字段名：**`weight`**（不是 `strength`）
- 私有资源：`loraAccessKey` / 底模 `modelAccessKey`（private-model 页）
- Workflow 节点：`LoraLoader` 等用 `lora_name` + `strength_model`/`strength_clip` + `access_key`
- **不支持时**：应拒绝伪造 items；无官方「自动剥离」许可

## 6) seed / steps / cfg / size

| 字段 | 位置 | 类型/范围（OpenAPI + 文档例） |
|------|------|-------------------------------|
| `seed` | `inputInitialize.seed` | int64/string；文档例 `-1` 或 `"-1"` 随机；OpenAPI 写 omit/0 随机，maximum 4294967295 |
| `count` | `inputInitialize.count` | 1–4 |
| `width` / `height` | `diffusion` | 默认 512；**64 增量**；OpenAPI min 512 max 1536（另有引擎面积校验文案）；400:`invalid_height_or_width` |
| `steps` | `diffusion.steps` | 1–60 |
| `cfgScale` / 文档例 `cfg_scale` | `diffusion` | 默认 7，maximum 30 |
| `sampler` / `sdVae` | `diffusion` | FAQ/demo：现为必要；常量见 list-of-constants |
| `sdModel` / 文档例 `sd_model` | 底模 ID 字符串 | |
| `clipSkip` | | |
| `denoisingStrength` | img2img 等 | |

注意：文档示例混用 camelCase / snake_case（`request_id` vs `requestId`，`sd_model` vs `sdModel`）。接线以 **OpenAPI 定义 + 当前环境实测** 为准，失败原样上报，禁止静默改字段名伪装成功。

## 7) 计费 / 402 / 余额线索

FAQ 原文要点：

- 「What is the price of each computational credit? **0.003 USD**」
- 失败**不**扣 credits
- 估分：`POST /v1/jobs/credits`（Get Job Credits）；模板：`Workflow Template Check`
- 充值：Application Management → Info → Top Up，再联系客服入账 computational credit

OpenAPI：`job.credits`、CalcCredits 响应 `credits`。  
本轮文档**未**强调 HTTP 402；欠费/余额不足应保留上游 code/body。

## 与 OpenWorks 的硬边界

| | TAMS（本文件） | OpenWorks |
|--|----------------|-----------|
| 基址 | `tams-api.tensor.art` / `ap-east-1.tensorart.cloud` | `openapi.tensor.art/openworks/v1` |
| 鉴权 | Bearer Token 或 RSA 签名 | `Echo-Access-Key: ak_tensor_…` |
| 模型 | 数字 modelId + `/v1/models/{id}` + `/v1/jobs` DIFFUSION | 工具名 `tool/list`，**不是** Checkpoint |
| LoRA | `lora.items[].loraModel`+`weight` | 工具 schema 各自定义；**禁止**当 TAMS LoRA |

## 本轮失败记录

| 工具 | 结果 |
|------|------|
| Grok CLI | **401** |
| `docs-tams.tensor.art` 无尾斜杠部分路径 | 连接失败/301；**带尾斜杠的 tams-docs.tensor.art 成功** |
| OpenAPI JSON curl/WebFetch | 成功 |
