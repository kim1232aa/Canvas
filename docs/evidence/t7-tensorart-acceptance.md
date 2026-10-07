# T7 Tensor.Art / TAMS 验收报告 — BLOCKED_AUTH

日期：2026-10-06。验收方式：真实前端。

## 结论

**BLOCKED_AUTH**。当前产品按 TAMS 的真实模型 ID 查询路径访问上游，不抓 HTML 目录，也不拿 OpenWorks 工具结果冒充模型 API。

前端查询真实模型 ID `672797109289765558`，请求到达 `https://tams-api.tensor.art/v1/models/672797109289765558`。HTTP 状态虽为 404，但业务体明确是：

`{"code":100001,"message":"unauthorized","tips":"app not found"}`

所以不能写成“模型不存在”，也不是余额不足。获得正确 TAMS 应用授权后才继续生成/LoRA/轮询/图片持久化验收。
