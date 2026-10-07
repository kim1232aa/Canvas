# T7 Agnes AI 验收报告 — BLOCKED_CONFIG

日期：2026-10-08。验收方式：本地真实前端 `http://127.0.0.1:3000/`，通过浏览器点击工作流运行；不是终端直调 API。

## 结论

**BLOCKED_CONFIG**。前端真实提交到了本地 `/api/engine/agnes/generate` 路由，但服务端在本地配置阶段返回 HTTP 400：`未配置 agnes Base URL（AGNES_BASE_URL / 设置面板 / x-agnes-base-url）。`

这不是 Agnes 上游 HTTP 响应，不是余额不足，也不是出图成功。它只证明当前前端能按 Agnes provider 选择自定义模型并提交到本站 Agnes 路由；配置有效 Base URL 和 Key 后仍需重新前端验收。

## 本次独立样本参数

- Provider：`agnes`
- Model：`agnes-image-2.5-flash`
- Prompt：`A glass terrarium shaped like a lunar rover, filled with miniature desert succulents and tiny astronauts, clean studio lighting, premium catalog render`
- extraParams：`resolution: 1k`（由旧画布值残留而来，进入请求但未到上游）
- 本次请求体仍携带旧 KSampler 残留的 negative_prompt、seed、steps、cfg；因为本地配置缺失先返回，尚未走到 Agnes 上游或字段校验终态。

## 前端证据链

1. 从真实网页把底模 Provider 切为 `Agnes`。
2. Agnes 目录响应没有返回所选供应商模型列表，因此使用自定义模型 ID：`agnes-image-2.5-flash`。
3. 删除旧 HF LoRA 节点，避免 LoRA 进入 Agnes 请求。
4. 选中 KSampler 执行分支并点击 `运行工作流`。
5. 执行记录新增 `HTTP 400 · POST /api/engine/agnes/generate`。
6. 完整响应体为本地配置错误：`未配置 agnes Base URL（AGNES_BASE_URL / 设置面板 / x-agnes-base-url）。`，`errorSource: local`，`executionTrace: []`。
7. KSampler / SaveImage 均无图片输出，没有把旧图冒充本次结果。

## 边界

该结果只能记 `BLOCKED_CONFIG`。配置 Agnes Base URL / Key 后，需用新的参考样本重新从前端运行。届时若上游明确欠费才可记 PASS_BILLING；若返回图片才可进入 PASS_GENERATION；若字段校验先拦截，则需按 unsupported 字段或路由契约单独修复/记录。