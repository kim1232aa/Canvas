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

## 备注

- 本次提交携带了上一 WaveSpeed 用例遗留的 custom_parameters(loras 等);402 发生在参数校验之前,不影响计费结论。
  MuAPI 的 LoRA 真实出图需账户充值后复测(欠费不作为失败,按用户规则记 PASS_BILLING)。
