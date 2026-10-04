# MuAPI、WaveSpeed、Sogni 接入记录

核实日期：2026-10-04。此文档描述当前代码与证据，不代表网页出图验收通过。

| 供应商 | 模型来源 | 提交 | 轮询 | LoRA 请求 |
| --- | --- | --- | --- | --- |
| MuAPI | `GET https://api.muapi.ai/api/v1/models` + `/openapi.json` | 目录 `endpoint_url` 对应的 `/api/v1/…` POST；`x-api-key` | `/api/v1/predictions/{request_id}/result` | 按 Schema 使用 `loras` / `lora_list` 的 `{path,scale}`，或 `model_id` 的 `{model,weight}`，或单个 `lora_url,lora_weight` |
| WaveSpeed | `GET https://api.wavespeed.ai/api/v3/models` 中每个端点的 `api_schema` | `model_run` 指定的原生 POST 路径；Bearer | `/api/v3/predictions/{id}/result` | 所选端点声明的 `loras:[{path,scale}]`；例如 `wavespeed-ai/krea-v2/turbo-lora` |
| Sogni | 官方 `@sogni-ai/sogni-protocol@1.0.0-alpha.46` 的 `generate_image` Schema | `POST https://api.sogni.ai/v1/creative-agent/workflows`；Bearer；明确的 `generate_image` step | `/v1/creative-agent/workflows/{workflowId}` | 官方资源 ID 数组 `loras` 与对应位置的 `loraStrengths`；公开资源目录 `/v1/loras/comfy` |

## 目录身份与分页

- MuAPI 本轮官方目录实测返回 765 行，包含图片、视频、训练等产品；图片下拉框使用 `group_of=image`，不把训练端点和其他类型全部当底模。显示名与实际执行 ID 分开。例如显示名 `flux-dev-lora` 对应 OpenAPI 路径 `/api/v1/flux_dev_lora_image`，不能按显示名拼一个未声明路径。
- WaveSpeed 本轮使用提供的 key 读取目录返回 HTTP 200、1054 行。下拉框按图片生成类型筛选，完整目录每次实时读取，前端本地切页，分页响应标明 `local-slice-of-live-catalog`，不是虚构上游分页。
- Sogni 实时 worker 模型 ID 和 hosted workflow model selector 是不同命名空间。没有官方跨表映射时不能改写 ID。当前下拉框的 27 个 selector 来自固定版本官方 Schema，`schemaVersion=2026-07-18.1`；来源与版本在 Schema 面板可见。可输入自定义 selector，让真实上游验证。
- MuAPI / WaveSpeed 的“支持 LoRA 的生成端点”不是 LoRA 权重资源库。资源目录未有已核实接口时展示说明，不把工具或生成端点冒充可挂载权重；LoRA 节点可明确输入权重 URL。

## 参数、工作流与错误

画布节点保持通用。协议转换位于服务端适配模块。默认可见的 Schema 匹配模式只提交有官方字段对应的普通画布参数；未提交项逐项记录来源、值和原因。可取消该模式以让上游验证所有参数。手写参数 JSON 原样合并，覆盖前后值及最终请求可查。非空 LoRA 意图不会被 Schema 模式删除；不兼容由上游返回事实。

`_canvas` 是 Canvas 控制字段，不发给供应商：

```json
{
  "_canvas": {"schemaFieldsOnly": true},
  "seed": 42,
  "loras": [{"path": "https://your-host/style.safetensors", "scale": 0.8}]
}
```

上述 LoRA 格式仅适用于声明此结构的模型。Sogni 使用 `loras:["official-resource-id"]` 与 `loraStrengths:[0.8]`。选择“仅提交 JSON 与提示词”时，其他画布参数及 LoRA 节点明确不参加本次请求；不要误认为节点仍被提交。

Sogni 参考图位于工作流外层 `media_references:[{kind:"image",url:"https://…"}]`，工具参数引用 `sourceImageIndex:-1`；需要供应商可读取的图片 URL。外层参数可放在 `_canvas.workflowOptions`，例如 `token_type` 或 `billing_mode`。本轮没有实现私有媒体到 Sogni 的自动上传，不暗换为 chat 或 SDK 路由。

一次运行只有一次生成 POST，不重试提交、不换模型或供应商。轮询保留完整任务响应；`waiting_for_user` 与 `partial_failure` 等状态不会冒充完成。图像生成成功不等于已验证 LoRA 在 GPU 生效：实际权重、兼容性、上游参数记录须分别审查，独立 CLIP 强度无字段时不假称生效。

历史记录按实际提交 JSON 保存 seed、尺寸、步数、CFG 和 LoRA，连同画布快照、请求映射、提交响应与轮询响应。每个输出单独持久化；保存失败是独立的 storage 阶段，保留上游临时 URL 与完整错误，不改写生成结果。

执行记录展示客户端请求、实际端点、参数转换、真实 HTTP 状态与完整响应、异常 stack/cause。网络异常没有上游 HTTP 响应时，调用链 `status=null`，不得把本服务 HTTP 500 声称为供应商返回 500。鉴权凭证不显示。

## 本轮验证边界

- 前端已实际选择 Sogni `krea-2-turbo`、配置 LoRA 参数并点击“运行工作流”。目录加载、参数编辑、提交路由及失败状态已观察。预览执行在上游返回 HTTP 之前遇到 `ECONNREFUSED`；没有新图，网页出图验收未通过。
- 执行环境直接只读请求 Sogni workflows 与公开 LoRA 目录返回 HTTP 403，其中 workflows 正文为 `error code: 1010`。无法由此确定是余额、key 权限、边缘规则还是其他限制，不能写成欠费或错误 key。
- 旧 `public/verification/` 图片是历史 API 调用样本，已更正入口文案，不能用来替代本轮前端验收。
- 单元契约夹具只验证路由、映射与错误处理，明确不是上游真实生成证据。
- 网页实测记录：[`frontend-sogni-2026-10-04.json`](../evidence/frontend-sogni-2026-10-04.json)；界面截图：[`frontend-sogni-2026-10-04.jpg`](../evidence/frontend-sogni-2026-10-04.jpg)。文件来自真实网页执行 DOM 与截图，不是夹具。

## 官方证据

- https://muapi.ai/docs/models
- https://muapi.ai/docs/authentication
- https://api.muapi.ai/openapi.json
- https://muapi.ai/playground/z-image-turbo-text-to-image-lora/api
- https://wavespeed.ai/docs/get-started-api
- https://wavespeed.ai/docs/docs-api/wavespeed-ai/krea-v2-turbo-lora
- https://api.wavespeed.ai/api/v3/models
- https://docs.sogni.ai/sogni-sdk/sogni-protocol/
- https://docs.sogni.ai/sogni-intelligence/creative-agent-workflows/
- https://docs.sogni.ai/api-reference/direct-generation/

端点目录会变更，运行时以所选原生模型返回的最新 Schema 为准；Sogni 的固定版本升级需要复核官方工具协议。
