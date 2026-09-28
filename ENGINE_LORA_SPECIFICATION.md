# 引擎与 LoRA 规范说明 (ENGINE_LORA_SPECIFICATION.md)

## 支持引擎列表

1. **Civitai 官方原生引擎**：
   - 原生支持 Civitai 算力集群调度，模型表达形式为 `urn:air:<family>:<type>:civitai:<modelVersionId>@<versionId>`。
   - 包含 Krea 2 Turbo (`urn:air:krea2:checkpoint:civitai:2726029@3091481`)、FLUX.1 Dev (`urn:air:flux1:checkpoint:civitai:618692@691639`)、Pony V6 (`urn:air:sdxl:checkpoint:civitai:257749@290640`) 等。
2. **Agnes AI (ApiHub) 引擎**：
   - 支持 `agnes-image-2.5-flash` 闪电生图，及 `agnes-3.0-flash` 深度推理。
3. **Fal.ai 极速 Serverless 引擎**：
   - 支持 FLUX.1 [dev] / [schnell] 极速出片。

## 错误处理规范
- 上游引擎执行报错时，直接透传 HTTP 状态码与响应体，严禁伪造默认图像或提示词。

---
*更新时间：2026-09-26*
