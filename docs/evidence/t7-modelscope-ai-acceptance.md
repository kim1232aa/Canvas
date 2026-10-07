# T7 ModelScope AI 验收报告 — BLOCKED_AUTH

日期：2026-10-06。验收方式：真实前端。

## 结论

**BLOCKED_AUTH**。前端请求真实到达 ModelScope AI 国际站图像生成路由，上游返回 HTTP 401，原文要求先绑定 Alibaba Cloud 账户。

这不是余额不足，不能记 PASS_BILLING。CN 与 AI 国际站账户/域名继续保持隔离，禁止换域名或换 Key 掩盖该错误。
