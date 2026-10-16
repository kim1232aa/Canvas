# Together AI — API 审计
2026-10-15 重新调查，与旧版无关。调查时间 03:26–03:28 北京时间。方法：agy-search → WebSearch → curl 原页/OpenAPI。等级：实测 / 官方原文 / 仅搜索 / 未找到。

| 项 | 结论 | 等级 | 证据 |
|---|---|---|---|
| 文档入口 | https://docs.together.ai ；llms.txt 200 | 实测 | https://docs.together.ai/llms.txt |
| 机器可读 Schema | 有 OpenAPI：https://docs.together.ai/openapi.yaml（200，873 KB，llms.txt「## OpenAPI Specs」列出）。servers `https://api.together.ai/v1` | 实测 | 同左 |
| 模型目录 | `GET /v1/models`（参数 `dedicated`），需 key；无 key 实测 401 `Missing API key` | 实测 | OpenAPI paths./models |
| LoRA 目录 | 未找到公开 LoRA 目录接口（已查 OpenAPI paths、llms.txt，关键词 lora/adapter）。仅有上传 `POST /models` `model_type: adapter` 与专用端点挂 adapter `POST /v1/endpoints/{id}/adapters` | 官方原文 / 未找到 | docs/dedicated-endpoints/v1/lora-adapter |
| 图像端点 | `POST /v1/images/generations`，同步返回；字段全在**根层** | 官方原文(OpenAPI) | |
| 图像字段 | prompt, model, steps(int, default 20), seed(int), width/height(default 1024), guidance_scale(number, default 3.5), negative_prompt, n, output_format(jpeg/png), response_format(base64/url), image_url, reference_images, disable_safety_checker；**无采样器字段**；OpenAPI 无 min/max 范围 | 官方原文(OpenAPI) | |
| ⚠ LoRA 字段 | OpenAPI 仍列 `image_loras[{path(URL), scale}]`，但参数页原文：「`image_loras`: No longer available. The FLUX models that accepted LoRA adapters have been deprecated, and the current FLUX.2 models reject this parameter.」→ serverless 不可用 LoRA | 官方原文 | https://docs.together.ai/docs/inference/images/parameters.md |
| 按模型支持 | 参数页表格：steps 不适用 FLUX.1.1 Pro/FLUX.2 Pro；guidance_scale 仅 FLUX.2 Dev/Flex | 官方原文 | 同上 |
| 视频 | `POST /v1/videos`（model,prompt,width,height,resolution,ratio,seconds(string),fps,steps[10,50],seed,guidance_scale(int),negative_prompt,frame_images,reference_images,generate_audio）；轮询 `GET /v1/videos/{id}`，status ∈ in_progress/completed/failed | 官方原文(OpenAPI) | |
| 鉴权 | `Authorization: Bearer` | 实测(401 原文) | |
| 错误格式 | `{"id":..,"error":{"message","type","param","code"}}`（实测 401 code=`missing_api_key`）；OpenAPI ErrorData 同结构；**DIFF 补查（04:44 实测 200）**：error-codes 页原文「402 - Payment Required: The account associated with the API key has reached its maximum allowed monthly spending limit.」——首轮只查了 OpenAPI，漏了此页 | 实测 + 官方原文 | https://docs.together.ai/docs/error-codes.md | |

坑：OpenAPI 与参数页矛盾（image_loras）；无采样器；尺寸部分模型用 aspect_ratio。


## 补查 2026-10-15 06:02（Researchy 30m）· image_loras 参数页 vs OpenAPI

今日再 curl：
1. https://docs.together.ai/docs/inference/images/parameters.md（200）原文仍写：`image_loras`: **No longer available.** The FLUX models that accepted LoRA adapters have been deprecated, and the current FLUX.2 models reject this parameter. To serve a LoRA-adapted image model, use a dedicated endpoint.
2. https://docs.together.ai/openapi.yaml（200，873537 B）`/images/generations` 仍列 `image_loras[{path,scale}]`，**未**标 `deprecated`。

**结论**：官方参数页（Mintlify 文档正文）明确 serverless 不可用；OpenAPI 滞后。无有效 key，未拿到「带 image_loras 的 HTTP 实测码」。画布对 serverless 挂 LoRA **本地拒**与参数页原文一致；不得因 OpenAPI 仍列字段就当成会发送。实测仅用于补错误响应形状，不改变「参数页已写 reject」这一事实。

原文摘录：`/workspace/audit-v2-raw/researchy-30m-0602/tg_image_loras_excerpt.md`


## 补查 2026-10-15 07:01（Researchy 30m）· 官方未变；草案/接线与 UI 文案分裂

今日再 curl（原文 `/workspace/audit-v2-raw/researchy-30m-0701/`）：
1. parameters.md（200）第 430 行仍写：`image_loras`: **No longer available.** … current FLUX.2 models **reject** this parameter. → dedicated endpoint。
2. openapi.yaml（200，873537 B）仍列 `image_loras[{path,scale}]`，**未**标 deprecated。
3. dedicated-endpoints/overview.md（200）仍只走 adapter / Multi-LoRA 专用部署。
4. agy-search 线索与上一致（serverless LoRA 已停，改 Dedicated）。

**官方事实（不变）**：参数页 prose 与 OpenAPI 声明冲突；无有效 key，仍无「带 image_loras 的 HTTP 实测码」（06:38 live probe 仅 401 `invalid_api_key`，有无 LoRA 同码，不能当 reject 形状证据）。

**画布现状（相对 06:02 本文件「本地拒」结论已过时）**：
- 草案 `docs/provider-schema-drafts/together.json`（tinkabot 06:13 起按房间规则）：OpenAPI 未 deprecated → **待确认**，`localReject:false`，不以参数页 prose 作本地拦截依据。
- 接线 `schemaProviders.together`：**无** `loraLocalBlock`；挂 LoRA 按 OpenAPI 发 `image_loras`，上游原文透传（`wavespeedKreaTogetherLora.test.ts` 断言）。
- **不一致 UI（需 @canvas-dev，Researchy 不改代码）**：
  - `BackendSettingsModal.tsx` 仍写「官方已停用 serverless image_loras，挂 LoRA 会 **400 拒绝**」——本地 submit 已不拒，且 **400 未经有效 key 实测**。
  - `CivitaiModal.tsx` 粘贴路径仍对 `together` 硬拦截（单家特殊规则）——与 submit 透传、草案待确认冲突。
  - `ApiParameterEditor.tsx` 文案已是「待确认 / 以上游原文为准」，与接线一致。

**Researchy 裁定**：审计层只陈述官方矛盾 + 未实测 HTTP；**不把 06:02「应本地拒」再当现行接线要求**。徽章勿标「会发送」或「不发」直至有效 key 实测。UI 两处旧文案/粘贴拦截交给画布改齐，不在审计里发明 HTTP 码。

原文摘录：`/workspace/audit-v2-raw/researchy-30m-0701/tg_image_loras_excerpt.md`
