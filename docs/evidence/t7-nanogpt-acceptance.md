# T7 NanoGPT 验收报告 — BLOCKED_AUTH

日期：2026-10-06。验收方式：真实前端。

## 结论

**BLOCKED_AUTH**。模型 `qwen-image-2.1/text-to-image` 第一次因画布残留的旧 resolution 被本地能力校验拦截；改为该 endpoint 允许的 `1k` 后，真实请求到达 `https://api.nano-gpt.com/api/v1/images`，上游返回 HTTP 401：`Invalid session` / `invalid_api_key`。

因此当前只证明模型级参数校验与真实路由接通；凭据修复后仍需换一套新的参考作品参数做真实出图与原图对比。
