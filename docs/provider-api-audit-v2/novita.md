# Novita AI — API 审计
2026-10-15 重新调查，与旧版无关。调查时间 03:30–03:32 北京时间。

| 项 | 结论 | 等级 | 证据 |
|---|---|---|---|
| 文档入口 | https://docs.novita.ai （novita.ai/docs/* 307→docs.novita.ai）；llms.txt 200，自述「APIs for LLMs, image/video/audio generation…」 | 实测 | https://docs.novita.ai/llms.txt |
| 机器可读 Schema | 未找到（已查：docs.novita.ai/openapi.json → 404；llms.txt 无 OpenAPI 段；/v3/model 目录项 `model_details` 为空数组；关键词 openapi/swagger/schema）。参数说明只有 HTML 页 | 未找到 | |
| 模型目录 | `GET https://api.novita.ai/v3/model?filter.types=checkpoint|lora&pagination.limit=N`，**无 key 200** | 实测 | |
| LoRA 目录 | 同上 `filter.types=lora`；条目有 `sd_name_in_api`、`base_model`(如 "SD 1.5")、`is_sdxl`、`source:"civitai"`、`download_url` | 实测 | |
| 图像端点 | `POST /v3/async/txt2img`，体 = `{"extra":{...}, "request":{...}}`，**参数嵌套在 `request` 内**。原文：「All image generation parameters must be passed via the request in V3」 | 官方原文 | https://docs.novita.ai/guides/model-apis-v2-to-v3-migration（200） |
| 字段 | request.model_name, prompt, negative_prompt, width, height, image_num, steps, seed, guidance_scale(原 cfg_scale), sampler_name, clip_skip, hires_fix, **loras[{model_name=sd_name_in_api, strength}]**，strength 原文「Range [0, 1]」 | 官方原文(迁移指南) | |
| txt2img 独立参考页 | `docs.novita.ai/api-reference/model-apis-txt2img` 现 **404**；「最多 5 个 LoRA」只出现在 txt2video 页的搜索快照 | 仅快照，原页 404，未核实 | |
| 异步/轮询 | `GET /v3/async/task-result?task_id=`，`task.status` ∈ TASK_STATUS_QUEUED/PROCESSING/SUCCEED/FAILED（字符串，非数字），结果在 images[]/videos[] | 官方原文(200) | https://docs.novita.ai/api-reference/model-apis-task-result |
| 视频 | `POST /v3/async/txt2video`，同 task-result 轮询，videos[].video_url | 仅快照，原页 404，未核实 | |
| 鉴权 | `Authorization: Bearer` | 官方原文 | |
| 错误/欠费 | 实测无 key：HTTP 400 `{"code":400,"reason":"MISSING_API_KEY","message":"missing api-key","metadata":{}}`；错误码页：**欠费 = 403 `BILLING_BALANCE_NOT_ENOUGH` / `NOT_ENOUGH_BALANCE`「Insufficient balance」** | 实测 + 官方原文 | https://novita.ai/docs/api-reference/basic-error-code.md |

坑：agy-search 本次**再次**把参数写在根层、status 写成数字 2，均与官方原文不符；缺 key 返回 400 不是 401。
