# T7 MuAPI 验收报告 — PASS_BILLING

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
- 画布真实请求的 actualRequest：
  - endpoint：`https://api.muapi.ai/api/v1/flux-1-dev-style-lora-inference`
  - `prompt`：上述独立 Prompt
  - `lora_url`：上述 safetensors URL
  - `lora_weight`: `0.65`
  - mapping 明确为 `loras -> lora_url + lora_weight`
- 上游仍返回 HTTP 402 `INSUFFICIENT_CREDITS`，前端原样展示 endpoint、状态码、响应体和 topup_url；没有换 Provider / 模型 / Key。

因此 **MuAPI LoRA 接线也满足用户的 PASS_BILLING 标准**：真实前端已经证明 LoRA URL 与权重按该端点 Schema 映射到实际请求；账户余额阻止的是生成结果，不再把 A03 保留为“LoRA 接线未验证”。充值后若要判断 LoRA 视觉效果，仍需真实出图并与参考图比较。

## 备注

- 2026-10-05 第一条普通模型请求曾携带上一 WaveSpeed 用例遗留的 custom_parameters；该旧记录只用于普通路由计费结论。
- 2026-10-06 的专用 LoRA 补验收使用全新的 Prompt / LoRA / 权重与 `flux-1-dev-style-lora-inference`，actualRequest 已证明 LoRA 字段映射，不再依赖旧残留参数。
