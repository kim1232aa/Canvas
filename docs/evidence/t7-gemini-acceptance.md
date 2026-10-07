# T7 Google Gemini 验收报告 — BLOCKED_CONFIG

日期：2026-10-08。验收方式：本地真实前端 `http://127.0.0.1:3000/`，通过浏览器点击工作流运行；不是终端直调 API。

## 结论

**BLOCKED_CONFIG**。前端真实提交到了本地 `/api/gemini/generate` 路由，但服务端在本地配置阶段返回 HTTP 400：`未配置 Google Gemini API Key。请在设置中配置 GEMINI_API_KEY。`。

这不是上游 Gemini 的 HTTP 响应，不是余额不足，也不是图片生成成功。它证明的是：当前前端能选中 Gemini 生图节点、能提交 prompt / model / aspect_ratio / image_size，且本地错误被透明显示；但在配置 GEMINI_API_KEY 前不能判定 Gemini 上游接线或生成能力。

## 本次独立样本参数

- Prompt：`Isometric cutaway of a tiny retro-futurist ramen shop inside a red train carriage, rainy Tokyo platform outside, warm lantern light, precise miniature details, product-visualization clarity`
- Model：`gemini-3.1-flash-image`
- aspect_ratio：`4:3`
- image_size：`1K`
- Negative Prompt / Steps / CFG / Sampler / Seed / LoRA：Gemini 路由未发送，UI 也明确显示这些 ComfyUI 扩散参数不应伪装成 Gemini 字段。

## 前端证据链

1. 从真实网页添加 `Google Gemini 生图 (官方直连引擎)` 节点。
2. 选择模型 `gemini-3.1-flash-image`、aspect_ratio `4:3`、image_size `1K`。
3. 新增独立正向 Prompt 节点并连到 Gemini 节点的 positive 输入。
4. 点击网页 `运行工作流`。
5. 执行记录新增 `HTTP 400 · POST /api/gemini/generate`。
6. 请求体包含 prompt、model、aspect_ratio、image_size、workflowSnapshot；`loras: []`，没有旧 HF LoRA 被错误发送。
7. 完整响应体为本地配置错误：`未配置 Google Gemini API Key。请在设置中配置 GEMINI_API_KEY。`，`errorSource: local`，`executionTrace: []`。
8. KSampler / SaveImage / Gemini 节点均无图片输出，没有用旧图冒充本次结果。

## 边界

该结果只能记 `BLOCKED_CONFIG`。配置有效 GEMINI_API_KEY 后，需要用新的参考样本重新从前端运行，拿到真实上游响应后才能分类为 PASS_GENERATION、PASS_BILLING、BLOCKED_AUTH 或 FAIL_INTEGRATION。