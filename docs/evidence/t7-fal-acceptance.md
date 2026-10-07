# T7 Fal.ai 验收报告 — PASS_BILLING

日期：2026-10-06。验收方式：真实前端。

## 结论

**PASS_BILLING**。前端显式选择 Fal，模型为 `fal-ai/flux-lora`，挂载完整 HTTP(S) LoRA URL，并从网页运行工作流。真实上游返回 HTTP 403，业务原文为 `User is locked. Reason: TOP_UP.`。

这证明当前 Fal 路由、LoRA path/scale 接线和错误透传成立；它不是图片生成成功。

## 关键事实

- Provider：`fal`
- 模型：`fal-ai/flux-lora`
- LoRA：完整 Hugging Face safetensors URL
- LoRA strength：0.8
- 实际目标：Fal `fal-ai/flux-lora` 路由
- 上游终态：403 TOP_UP
- 没有失败后静默切换 provider/model/key，也没有假图片。
