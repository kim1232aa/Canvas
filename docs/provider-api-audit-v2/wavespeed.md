# WaveSpeedAI — API 审计
2026-10-15 重新调查，与旧版无关。调查时间 03:33–03:35 北京时间。

| 项 | 结论 | 等级 | 证据 |
|---|---|---|---|
| 文档入口 | https://wavespeed.ai/docs ；llms.txt 200 | 实测 | https://wavespeed.ai/llms.txt |
| 机器可读 Schema | 未找到公开 OpenAPI 文件（已查 llms.txt、docs/rest-api，关键词 openapi/swagger/schema）。llms.txt 原文：官方 MCP 提供「per-model schema introspection」；每模型有 markdown `https://wavespeed.ai/models/<id>/llms.txt`（非 JSON Schema） | 官方原文 / 未找到 | |
| 模型目录 | `GET https://api.wavespeed.ai/api/v3/models`，**需 key**（实测 401 `{"code":401,"message":"Missing API key..."}`）；返回内容是否带 schema 未能无 key 核实；**DIFF 补查**：list-models 文档页有「api_schema Object」小节（200），即目录条目带模型级 schema，但未实测返回体 | 实测(401) / 官方原文(补查) | |
| LoRA 目录 | 未找到 LoRA 目录接口（已查 llms.txt、rest-api、flux-dev-lora 页，关键词 lora list/catalog）。LoRA 由用户给 URL/路径 | 未找到 | |
| 图像端点 | `POST /api/v3/wavespeed-ai/flux-dev-lora`，字段**根层**，异步（`enable_sync_mode` 可同步） | 官方原文 | https://wavespeed.ai/docs/docs-api/wavespeed-ai/flux-dev-lora |
| 字段（原页参数表） | prompt, image, mask_image, strength(0–1, def 0.8), **loras[{path, scale 0–4 def 1}] 0–3 个**, **size 字符串 "1024*1024"（256–1536），不是 width/height**, num_inference_steps(1–50, def 28), guidance_scale(0–20, def 3.5), num_images(1–4), seed(-1=随机), output_format；无采样器 | 官方原文 | 同上 |
| 异步/轮询 | 提交返回 `{"code":200,"data":{"id","status":"created","urls":{"get":".../predictions/{id}/result"}}}`；`GET /api/v3/predictions/{id}/result`；status: created/processing/completed/failed/cancelled/timeout（另提 deleted）；建议 ≥2s 一次 | 官方原文 | https://wavespeed.ai/docs/rest-api |
| 视频 | 同 predictions 机制，字段按模型页；未逐模型核 | 官方原文（机制）/ 未核具体字段 | |
| 鉴权 | `Authorization: Bearer` | 实测 401 原文 | |
| 错误/欠费 | 体 `{"code":…, "message":…}`（实测 401）；**DIFF 补查（04:44）**：error-codes 页原文「1407 insufficient_credits — The account does not have enough credits to run the request.」（业务码，非 HTTP 402）——首轮只查了 rest-api 页，漏查 | 实测 + 官方原文 | https://wavespeed.ai/docs/error-codes | |

坑：agy-search 摘要把尺寸写成 width/height，原页是 `size:"W*H"` 字符串——搜索摘要不可用。


## 补查 2026-10-15 06:02（Researchy 30m）· 尺寸字段按模型分两族（勿一律 size）

方法：agy-search 线索 → curl 官方模型页 200 → 原文落盘 `/workspace/audit-v2-raw/researchy-30m-0602/`。

| 模型页 | 官方尺寸/格式字段 | **无** | 等级 | 证据 |
|---|---|---|---|---|
| `wavespeed-ai/krea-v2/turbo-lora` | `resolution`∈{1k,2k}；`aspect_ratio` 预设（1:1…21:9）；另有 prompt/image/strength/loras[{path,scale}]≤3/seed | **无** `size` / width/height / steps / guidance_scale / output_format | 官方原文 | https://wavespeed.ai/docs/docs-api/wavespeed-ai/krea-v2-turbo-lora |
| `wavespeed-ai/krea-v2/turbo` | 同上，无 loras | 同上 | 官方原文 | https://wavespeed.ai/docs/docs-api/wavespeed-ai/krea-v2-turbo |
| `wavespeed-ai/z-image/turbo` | `size` 字符串如 `"1024*1024"`；示例另有 `output_format` jpeg|png|webp、seed | **无** aspect_ratio / resolution(1k|2k) | 官方原文 | https://wavespeed.ai/docs/docs-api/wavespeed-ai/z-image-turbo |
| `wavespeed-ai/z-image-turbo-lora`（页路径 z-image-turbo-lora） | `size` `"W*H"` 256–1536；`loras[{path,scale}]`≤3 scale0–4；`output_format`；seed | **无** aspect_ratio / resolution(1k|2k) | 官方原文 | https://wavespeed.ai/docs/docs-api/wavespeed-ai/z-image-turbo-lora |
| `wavespeed-ai/flux-dev-lora`（首轮表） | `size` `"W*H"`；steps/guidance_scale/loras/output_format… | **无** aspect_ratio / resolution(1k|2k) | 官方原文 | https://wavespeed.ai/docs/docs-api/wavespeed-ai/flux-dev-lora |

**对画布**：必须按该模型 `api_schema` / 模型文档发字段。把 Krea 的 `aspect_ratio`+`resolution` 丢弃、或给 Krea 塞 `size`，都与官方不符。首轮 v2 表只写了 flux-dev-lora 的 `size` 族，**不能当成全站通用尺寸字段**。

钥匙未写入。

## 补查 2026-10-15 06:30（Researchy 30m）· LoRA `path` 写法按模型页 + 1402 实例

触发：upstream.log 21:24Z / 21:27Z 两次真实提交（krea-v2/turbo-lora、z-image/turbo-lora）均 `status:failed, code:1402`，原文 "Failed to load LoRA: Could not download the input from huggingface.co (HTTP 401)"。提交体 path=`https://huggingface.co/krea/krea2-realism-lora`。方法：agy-search 线索 → curl 官方页 200 + HF API 实测 → 原文落盘 `/workspace/audit-v2-raw/researchy-30m-0630/`。

| 项 | 结论 | 等级 | 证据 |
|---|---|---|---|
| 通用 LoRA 指南 | Hugging Face 写 `owner/model-name` **或** direct URL；Civitai 只收 Files 直链；只收 `.safetensors`；报 model not found =「Wrong path format」 | 官方原文 | https://wavespeed.ai/docs/lora-training-usage |
| Krea V2 Turbo LoRA 模型页 | 「path is a **direct .safetensors URL**」（该页未写 owner/name） | 官方原文 | https://wavespeed.ai/docs/docs-api/wavespeed-ai/krea-v2-turbo-lora |
| Z-Image Turbo LoRA 模型页 | 「`<owner>/<model-name>` or a direct .safetensors URL」 | 官方原文 | https://wavespeed.ai/docs/docs-api/wavespeed-ai/z-image-turbo-lora |
| 1402 含义 | 「Media Access Failed — Unable to access the provided media URL. Ensure the URL is publicly accessible」 | 官方原文 | https://wavespeed.ai/docs/error-codes |
| 测试用 path 是否存在 | `GET huggingface.co/api/models/krea/krea2-realism-lora` → 401（无 key 时不存在或私有的 repo 都回 401）；krea 官方公开 LoRA 列表只有 `krea/Krea-2-LoRA-{vintagetarot,retroanime,sunsetblur,kidsdrawing,darkbrush,dotmatrix,rainywindow,neondrip,softwatercolor}`，没有 realism；`Comfy-Org/Krea-2/resolve/main/loras/krea2_darkbrush.safetensors` → 200 | 实测 | HF API |

**结论**：两次失败是测试数据问题（repo 不存在 / 不公开，且是 repo 页面 URL，不是 `.safetensors` 直链），不是画布线格式问题。两次提交体的尺寸字段与 06:02 补查一致（Krea=`aspect_ratio`+`resolution`，z-image=`size`），LoRA 原样透传。
**对画布**：继续原样透传 path，不加 WaveSpeed 专用改写；上游 1402 原文照实显示为失败。验收 Krea LoRA 请用公开 `.safetensors` 直链（例 `https://huggingface.co/Comfy-Org/Krea-2/resolve/main/loras/krea2_darkbrush.safetensors`）。

钥匙未写入。
