# T7 ModelScope AI 验收报告 — BLOCKED_AUTH

## 2026-10-06 远端已有验收结论

日期：2026-10-06。验收方式：真实前端。

**BLOCKED_AUTH**。前端请求真实到达 ModelScope AI 国际站图像生成路由，上游返回 HTTP 401，原文要求先绑定 Alibaba Cloud 账户。

这不是余额不足，不能记 PASS_BILLING。CN 与 AI 国际站账户/域名继续保持隔离，禁止换域名或换 Key 掩盖该错误。

以下 2026-10-12 记录属于本地 incoming 72f5372 的官方正文与接线复核范围，不替代上述历史验收结论，也不表示后续待修项已完成。
## 2026-10-12 官方正文与当前代码复核（不升级验收）

旧 agent-116 的普通国际站 URL 曾只返回页脚；该结果不是 API 契约证据。但其成功读取的 https://www.modelscope.ai/docs/model-service/API-Inference/intro?lang=en 有完整 AIGC 示例与参数表，本次已检查实际结果正文并继承。

- 原文 `base_url = 'https://api-inference.modelscope.ai/'`、`"Authorization": f"Bearer {api_key}"`、`"X-ModelScope-Async-Mode": "true"`；POST `v1/images/generations`、GET `v1/tasks/{task_id}`（`X-ModelScope-Task-Type: image_generation`）、`SUCCEED` / `output_images` 与 `FAILED`。与 `server.ts:6372–6466` 国际站主契约匹配。`x-modelscope-ai-token` / `x-modelscope-site` 是本站 Driver→server 头，不是官方上游鉴权头。
- 同页原文 `size | Generated image resolution | No | string | 1024x1024`、`seed ... [0,2^31-1]`、`steps ... [1,100]`、`guidance ... [1.5,20]`，还有 negative_prompt、image_url、loras。因此旧“最小请求”证据不能证明这些字段未获官方说明。`ModelScopeAiDriver.ts:38–39` / `server.ts:6365` 直接发 width/height，不映射官方 size，是需串行修的画布路径缺口；共用 `providerSchema.ts:634–640` 仍引用 CN 模型卡并笼统标 unverified，应改成对应站点云 REST 依据。
- LoRA 原文：单仓库 ID string 或 dict 权重映射，`Total weight of multiple LoRAs must sum to 1.0, up to 6 LoRAs`。当前 `modelScopeLoras.ts:2–19` 格式匹配；具体模型/LoRA 执行仍未验。
- 官方输入分歧：参数表 image_url 为 string，Base64 示例却是数组；不推断所有编辑模型一致。sampler/scheduler/denoise 云 REST 支持仍未核实，不本地 gate 为“不支持”。
- https://modelscope.ai/docs/model-service/API-Inference/limits 成功正文要求查看 `API-Inference` 标识与模型页对应调用示例。当前 `server.ts:2512–2555` 的 OpenAPI 结果是仓库发现，不证明在线推理；国际站 OpenAPI 页面旧读取只得到站点壳，完整目录字段/分页仍未核实。
- 共享路由风险：`server.ts:6342–6354` 允许 body.site/header 改站点且 AI token 缺失时兼用 CN header；应以明确路由绑定站点，冲突显式拒绝，不暗切 provider。`server.ts:6366–6369` custom model 覆盖与 LoRA 覆盖优先级、6464 失败任务体截断、6419/6456 仅第一张图片，与 CN 相同，需串行修复。

保留历史 HTTP 401 Alibaba Cloud 绑定阻碍，不解释为余额不足或集成已失败。本次无生成/上传调用；账户绑定、真实前端图像、编辑/LoRA、轮询完成与历史持久化均未完成。

日期:2026-10-06(UTC+8)。验收方式:真实前端 ComfyCanvas Studio @ 127.0.0.1:3000，通过 CDP 单独选择 ModelScope AI、模型并点击网页「运行工作流」一次。

## 结论

**BLOCKED_AUTH** — 请求确实到达 ModelScope AI 国际站图像路由，但上游返回 **HTTP 401 Unauthorized**，原文要求先绑定 Alibaba Cloud 账户。该结果不是余额不足，不记 PASS_BILLING；也没有图片，不记 PASS_GENERATION。

## 前端与路由证据

1. Provider 显式选择 `modelscope_ai`，不是 CN。
2. 驱动 `ModelScopeAiDriver` 使用独立请求头 `x-modelscope-ai-token` 与 `x-modelscope-site: ai`；服务端据此选择独立 `modelscope_ai` key pool 和 `api-inference.modelscope.ai` 域名。
3. 模型中心按原始 ID 选用 `Tongyi-MAI/Z-Image-Turbo`，provider 保持 `modelscope_ai`。
4. 沿用上一 CN 样本的最小请求原则；seed/steps/cfg/sampler/scheduler/denoise 均为空，实际 requestBody 只有 model + prompt。
5. 点击网页「运行工作流」一次，没有失败后轮换 provider/model/endpoint 再试。
6. 实际上游:
   - method: `POST`
   - endpoint: `https://api-inference.modelscope.ai/v1/images/generations`
   - requestBody: `{"model":"Tongyi-MAI/Z-Image-Turbo","prompt":"A small ceramic robot tending a bonsai tree on a clean wooden desk, warm morning window light, product photography"}`
7. 上游真实响应:
   - status: **401**
   - statusText: `Unauthorized`
   - responseBody: `{"errors":{"message":"Please bind your Alibaba Cloud account before use. You can bind it at: https://modelscope.ai/my/settings/account"},"request_id":"83d21ac6-2117-4f2b-af81-2f1fa4c04c3f"}`
   - masked credential: `ms-7...72cb`
   - duration: 400ms
8. 应用前端原样展示该 401、实际 endpoint、raw body、errorSource=upstream 与 stack；运行按钮恢复。
9. 没有生成图片、没有成功历史，也没有把 401 归类为余额不足。

## 判定边界

该证据证明 ModelScope AI 路由与独立账户已实际到达上游，但当前账户缺少 Alibaba Cloud 绑定，因此记 `BLOCKED_AUTH`。账户完成绑定后仍需重新从前端验证生成、参数、LoRA、轮询和持久化。
