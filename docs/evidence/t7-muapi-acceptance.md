# T7 MuAPI 验收报告 — PASS_BILLING

## 2026-10-12 官方契约复审（未调用生成/上传）

恢复旧 agent-115 的成功工具结果：官方目录/OpenAPI GET200、模型别名与执行路径差异、LoRA 多种 shape 已读取；旧 agent 无 Edit/Write 或最终报告。本轮只更新独占文档，保留既有 MuAPI 未提交变化与所有历史402证据。

- https://muapi.ai/docs/quick-start 与 https://muapi.ai/docs/api-reference （旧成功正文）：“`Save the returned request_id`”；`POST https://api.muapi.ai/api/v1/{endpoint}`、`x-api-key`、`GET .../predictions/{request_id}/result`。`schemaProviders.ts:9,24,219-229,325-345` 匹配。
- https://muapi.ai/docs/models （旧成功正文）公开 `curl https://api.muapi.ai/api/v1/models`。旧 GET200 https://api.muapi.ai/api/v1/models 返回 models/total/currency、766个目录条目；其中 group_of=image 147条。当前 `schemaProviders.ts:63,254-266` 为过滤后本地切片，不是官方服务端分页，旧 50/147 不应被写成全平台总数。
- https://api.muapi.ai/openapi.json （旧 GET200 正文，本轮从原保存 JSON 解析）：qwen-text-to-image-2512 只声明 prompt/width/height/webhook_url；flux-1-dev-style-lora-inference 的 `lora_url` 原文为“`The LoRA file URL returned in outputs from a completed flux-1-dev-style-lora-trainer job.`”，weight 0–4。旧外部 XLabs URL 得到402只能证明字段提交/计费限制，不能证明官方对任意外部权重的承诺或实际挂载；不新加 unknown 本地 gate。
- 同一 OpenAPI：flux_dev_lora_image 用 model_id[{model,weight}]；sdxl-lora-image/wan2.1-lora-* 用 lora_list[{path,scale}]；z-image-turbo-text-to-image-lora 用 loras（max3，path/scale示例）。`schemaProviders.ts:310-317` 按 Schema 的形状映射，与这些项匹配，不能把 model_id 一概当“底模ID”。
- https://muapi.ai/docs/authentication （旧成功正文）cURL/JS 使用 muapi.ai 主域而 Python/API reference/OpenAPI 使用 api.muapi.ai；列明官方示例主机分歧。当前保持 api.muapi.ai，未暗切。官方“Sandbox Keys ... return mock data instantly”不作真实生成验收。

串行待修与边界：

- HIGH：`schemaProviders.ts:357` 对 `server.ts:763,2359` 的 async recordHistoryItem 未 await，save-result 的 historyItems 为 Promise。本轮无网络 fixture 实测 `{"historyItems":[{}],"transientOutputs":[]}`。建议 `saved.push(await dep.record(...))` 并保留失败 URL 与 warning；不能用 fixture 同步 record 测试冒充真实存储已验。
- MEDIUM：`schemaProviders.ts:284,322` parametersOnly=true 时非空 LoRA 节点整个不处理；历史只泛写“canvas parameters and LoRA nodes”。与非空 LoRA 意图不删除规则不符。建议要求显式选择 LoRA 是否由 JSON 覆盖，并逐项记录原节点与最终字段，不能清空或静默换模型。
- MEDIUM：旧官方 catalog/OpenAPI 有5个 image项缺 POST operation；当前 `schemaProviders.ts:228-229` 返回 inputSchema:null，继续同一 endpoint 由上游裁决，符合 unknown 不 gate 原则；UI仍须说明未核实，不当已支持。
- `SchemaProviderDriver.ts:51,136` 固定图像能力/媒体类型；MuAPI 视频目录出现不证明视频执行已接入。

本轮定向既有 5 files / 31 tests PASS，仅本地回归；未做新网页生成。PASS_BILLING 限历史 Qwen 与 LoRA 字段请求；余额、LoRA 实际推理、终态、多图、历史刷新/云项目当前仍未验。

## 以下为保留的历史记录

日期:2026-10-05(UTC+8)。真实前端 + 真实 MuAPI API,browser-harness(CDP)驱动完整 UI 流程。

## 结论

**PASS_BILLING** — 账户余额 0.0000 USD,提交按官方协议发出后上游返回 402 INSUFFICIENT_CREDITS,
前端执行记录面板原样透传状态码与响应体,无静默容灾、无虚假成功。

## 证据链

1. 余额核实:`GET https://api.muapi.ai/api/v1/account/balance`(x-api-key 认证)→ HTTP 200,
   响应头 `X-Account-Balance: 0.0000`,响应体 `{"balance":0.0,...,"currency":"USD"}`。
2. 底模中心 → MuAPI 筛选 → 「目录已返回 50 个模型」(实时目录第 1 页;`_pagination.muapi`:
   total=147, hasMore=true, sourceUrl=https://api.muapi.ai/api/v1/models,与官方目录一致,分页加载,无硬编码清单)。
3. 按 ID 选用 `qwen-text-to-image-2512` → 节点变为「加载底模 (MuAPI)」。
4. 读取官方 Schema:`GET https://api.muapi.ai/openapi.json` 200 + 模型目录 200(上游日志掩码 5597...2886)。
5. 点击「运行工作流」→ `POST /api/schema-provider/muapi/submit` → 上游 `POST https://api.muapi.ai/api/v1/qwen-text-to-image-2512`
   → **HTTP 402**,294ms。
6. 前端「执行记录」面板完整展示:
   - 客户端请求(model/prompt/steps/seed/custom_parameters/workflowSnapshot 全量透明)
   - `HTTP 402 · POST /api/schema-provider/muapi/submit`
   - 完整响应:`{"detail":{"error":{"code":"INSUFFICIENT_CREDITS","message":"Insufficient credit balance"}},"error":{...,"topup_url":"https://muapi.ai/topup","balance_endpoint":"/api/v1/account/balance"}}`
7. 失败不产生历史记录(data/history.json 无新增),无 mock 数据、无降级到其他供应商。

## 截图证据(docs/evidence/shots/)

- t7-muapi-10-canvas.png 初始画布;t7-muapi-11-hub.png MuAPI 目录(50/147)
- t7-muapi-12-applied.png 模型已应用;t7-muapi-13-schema.png Schema 面板
- t7-muapi-14-submitted.png 提交后;t7-muapi-15-final.png 最终状态
- t7-muapi-16-trace.png / t7-muapi-17-trace402.png 执行记录面板 402 透传详情

## 2026-10-06 LoRA 中心补验收

为关闭 HANDOFF A03，在不重复测试普通模型的前提下，只补跑了一次 **MuAPI LoRA 专用端点**：

- 前端显式选择 provider `muapi`、模型 `flux-1-dev-style-lora-inference`。
- Prompt 更换为独立样本：`A cute corgi living inside a house made of sushi, vibrant anime illustration, playful expression, crisp cel shading`。
- 从 LoRA 中心的 MuAPI 标签粘贴真实 HTTP(S) LoRA URL：`https://huggingface.co/XLabs-AI/flux-lora-collection/resolve/main/anime_lora.safetensors`。
- LoRA model strength 设置为 `0.65`；独立 CLIP strength 没有目标字段，因此执行记录明确显示它未独立发送。
- 画布真实请求的 `actualRequest`：
  - endpoint：`https://api.muapi.ai/api/v1/flux-1-dev-style-lora-inference`
  - `prompt`：上述独立 Prompt
  - `lora_url`：上述 safetensors URL
  - `lora_weight`: `0.65`
  - mapping 明确为 `loras -> lora_url + lora_weight`
- 上游仍返回 HTTP 402 `INSUFFICIENT_CREDITS`，前端原样展示 endpoint、状态码、响应体和 topup_url；没有换 Provider / 模型 / Key。

因此 **MuAPI LoRA 接线也满足用户的 PASS_BILLING 标准**：真实前端已经证明 LoRA URL 与权重按该端点官方 Schema 映射到实际请求；账户余额阻止的是生成结果，不再把 A03 保留为“LoRA 接线未验证”。充值后若要判断 LoRA 视觉效果，仍需真实出图并与参考图比较。

范围说明：以上为 2026-10-06 的字段映射与计费验收记录；2026-10-12 官方契约复审进一步限定 `lora_url` 为官方训练任务输出 URL。历史外部 XLabs URL 的 402 不证明任意外部权重受支持或实际挂载，两次记录均不构成真实生成成功验收。

## 备注

- 2026-10-05 第一条普通模型请求曾携带上一 WaveSpeed 用例遗留的 custom_parameters；该旧记录只用于普通路由计费结论。
- 2026-10-06 的专用 LoRA 补验收使用全新的 Prompt / LoRA / 权重与 `flux-1-dev-style-lora-inference`，`actualRequest` 已证明 LoRA 字段映射，不再依赖旧残留参数。

## 2026-10-10 前端全链路复测与证据存档

- 实测日期：2026-10-10 (UTC+8)
- 选用模型：`qwen-text-to-image-2512`
- 提交端点：`POST https://api.muapi.ai/api/v1/qwen-text-to-image-2512`
- 上游响应：HTTP 402 `INSUFFICIENT_CREDITS`，响应体 `{"detail":{"error":{"code":"INSUFFICIENT_CREDITS","message":"Insufficient credit balance"}},...}`
- 前端原样展示错误代码、topup_url 与余额端点，历史记录无假数据
- 结论确认：**`PASS_BILLING`**
- 产物目录：`temp/acceptance-20261010/muapi/`（包含 ready.png, billing.png, terminal.json, execution.json 等）
