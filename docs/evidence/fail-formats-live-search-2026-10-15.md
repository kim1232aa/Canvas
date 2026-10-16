# Prior FAIL · 官方尺寸/格式字段（live web 2026-10-15）

用户要求：失败案例按官方支持格式查，不暴力套。

| 供应商 / FAIL | 官方尺寸/格式（live） | 来源 | 我们的问题 |
|---|---|---|---|
| Venice FAIL_PARAM_DROP → 已 PASS_BILLING reverify | `format` jpeg\|png\|webp 默认 webp；尺寸按模型：宽高 / aspect_ratio / aspect_ratio+resolution | https://docs.venice.ai/api-reference/endpoint/image/generate | 曾统一塞宽高；Qwen 发宽高会 400 |
| WaveSpeed aspect_ratio 丢 | **按模型**：z-image-turbo 用 `size`+`output_format`；krea-v2-turbo 用 `aspect_ratio`+`resolution`；不得混 | https://wavespeed.ai/docs/docs-api/wavespeed-ai/krea-v2-turbo 等 | Schema-provider 丢弃已填 aspect_ratio（CLAIM） |
| AIMLAPI z-image-turbo-lora | `image_size` enum 或 {w,h}；`output_format` jpeg\|png\|webp | https://docs.aimlapi.com/api-references/image-models/alibaba-cloud/z-image-turbo-lora | 历史曾误读 505 字节为尺寸；须按 Schema 填 |
| Fal krea-2/turbo/lora | `image_size` enum 或 {w,h}；`output_format` jpeg\|png | https://fal.ai/models/fal-ai/krea-2/turbo/lora/api | PASS_BILLING(TOP_UP)；字段本身对 |
| Novita | SD txt2img：width/height；Seedream：`size` 字符串；Ming：`output_format` png\|jpeg | https://novita.ai/docs/api-reference/model-apis-text-to-image 等 | 不能一套 width/height 打所有 Novita 端点 |

原则：读该模型 Schema / model_spec，只露出并发送声明字段。
