# T7 Civitai 验收报告 — PASS_GENERATION

日期：2026-10-06。验收入口：真实前端 ComfyCanvas Studio，本轮不是终端直调。

## 结论

**PASS_GENERATION**。当前网页先用真实 Civitai Checkpoint AIR 完成基础图生成，随后用精确 LoRA AIR + 0.7 再次完成生成。任务结束后画布得到新的 JPEG 结果，执行记录存在成功请求。该结论只证明本次特定 AIR/LoRA 组合，不外推为所有 Civitai 下载资源都能在线生成。

## 真实资源

- Checkpoint AIR：`urn:air:sd1:checkpoint:civitai:4384@128713`
- LoRA AIR：`urn:air:sd1:lora:civitai:82098@87153`
- LoRA strength：`0.7`

## 参数追溯修复

旧 History 卡片曾把 Seed / Steps / CFG 等统一显示成“未填写”。复核 Civitai 返回后，上游实际包含 width/height、steps、cfg、sampler/scheduler 等字段；当前 History 已按 requested / sent / upstream/effective 区分来源，并把“未发送 / 上游未返回 / 旧记录未保存”分开显示。

这两张旧验收图的 Seed 不同，因此**不能**作为“只改变 LoRA 的 A/B 视觉对照”；路由 PASS_GENERATION 仍成立，但不把这组图冒充严格复现证据。

## 后续规则

Civitai 已取得明确终态，不为刷测试重复消耗。未来若专门做参考图复现，应从公开 API 取得完整作品参数并固定可复现条件后比较原图。
