# 视频生成官方 API 核实与本轮修复（2026-11-05）

本文只记录本次抓取到的官方页面。前一任草稿里未在本次重新打开的说法，一律标「未验证」，不当作事实。

抓取日期：2026-11-05。密钥只记有无，不记值。

## 已重新打开的官方页

### Civitai Orchestration videoGen

- 提交：`POST https://orchestration.civitai.com/v2/consumer/workflows?wait=<秒>`。`wait` 默认 0；官方写明 API 不截断 wait，但 HTTP 客户端常见 100 秒超时，wait 必须低于它，否则连接先断、拿不到 workflow id，任务仍在跑并计费。来源：[Quick start](https://developer.civitai.com/orchestration/guide/getting-started.md)。
- 状态：`unassigned → preparing → scheduled → processing`，终态 `succeeded / failed / expired / canceled`。同上。
- 视频任务「can take several minutes」。未在 wait 内完成时返回 202 + `status: processing`，再用 `GET /v2/consumer/workflows/{workflowId}` 轮询。同上。
- 轮询节奏（webhook 不可用时的 fallback）：2s、5s、10s、15s，之后每 30s，直到终态。来源：[Results & Webhooks](https://developer.civitai.com/orchestration/guide/results-and-webhooks.md)。
- videoGen 输出在 `output.video`（imageGen 才是 `output.blobs[]` / `output.images[]`）。同上。
- 示例 body：`$type: videoGen`，`engine/version/operation/prompt/resolution/duration`。同上。
- 取消、LoRA 字段形状、fps：本次未打开对应 recipe / OpenAPI，标「未验证」。代码仍按实时 OpenAPI（`/v2/consumer/recipes/videoGen/openapi.json`）建 input，不在本地猜字段。

### NanoGPT 视频

- 提交：`POST https://api.nano-gpt.com/api/generate-video`，头 `x-api-key`。页面示例字段含 `model`、`prompt`、`duration`（示例 `"5s"`）、`aspect_ratio`、`negative_prompt`、`cfg_scale`、`imageDataUrl`、`imageUrl`、`resolution`、`num_frames`、`frames_per_second`、`seed`、`num_inference_steps`、`shift`。来源：[Video Generation](https://docs.nano-gpt.com/api-reference/endpoint/video-generation)。
- 轮询：`GET https://api.nano-gpt.com/api/video/status?requestId=`。官方示例循环 120 次、每次 sleep 5 秒（约 10 分钟），读 `data.status === COMPLETED` 后取 `data.output.video.url`。来源：[Video Status (Unified)](https://docs.nano-gpt.com/api-reference/endpoint/video-status-unified)。
- 同一页的 OpenAPI 200 响应是另一套：顶层 `status` 枚举 `queued | processing | completed | failed | cancelled | unknown`，顶层 `videoUrl: string | null`（status 为 completed 时给出）。示例段又写 `data.status` 为 `IN_QUEUE | IN_PROGRESS | COMPLETED | FAILED | CANCELED`。两套都在同一官方页，代码两边都认。
- `COMPLETED` 且没有任何视频 URL：这是协议缺口，不是超时。旧代码把它报成 `504 … 175s`，本轮改为 502 `errorSource: upstream-protocol`，附 rawResponse、runId、endpoint。
- 本地 10 分钟预算用尽仍非终态：504 `errorSource: local`，附 runId、lastStatus、lastResponse、endpoint。不是上游错误。
- 取消端点：该页未给出，标「未验证」。
- 顶层通用 `loras[]`：本次打开的 generate-video 页没有该字段（只有脚本流程里的 `imageConfig.loraConfig`）。标「未验证」，不在本地删用户填的 LoRA。

### Fal queue

- 长任务走 `https://queue.fal.run`：提交后用返回的 `status_url` 轮询 `IN_QUEUE | IN_PROGRESS | COMPLETED`，再用 `response_url` 取结果。不要手写带完整 endpoint 子路径的 status URL（405）。来源：[Queue](https://docs.fal.ai/model-endpoints/queue)。
- 取消：`PUT` cancel。`IN_QUEUE` 直接移除（200 `OK`）；`IN_PROGRESS` 只发信号（202 `CANCELLATION_REQUESTED`）；已完成 400 `ALREADY_COMPLETED`。同上。
- 字段（duration、loras、首尾帧）按端点实时 OpenAPI，不在本文写死。Wan LoRA 单价本次只见到第三方转述，标「未验证」。

### Together 视频

- `POST /v2/videos` 请求体字段（官方参考页 curl）：`model`、`prompt`、`height`、`width`、`resolution`、`ratio`、`seconds`（string）、`fps`、`steps`、`seed`、`guidance_scale`、`output_quality`、`negative_prompt`、`generate_audio`、`media.frame_images[{input_image, frame}]`、`media.reference_images`。来源：[Create video](https://docs.together.ai/reference/create-videos)。
- 画布字段名是 `duration` / `aspect_ratio` / `image_url`。映射必须落到 schema 声明的 `seconds` / `ratio` / `media`，不能猜。该别名表在 `src/utils/schemaPayloadPlan.ts`，不在本任务文件范围内，已向 tower 申请改动，未改。

### Venice 视频

- `POST /api/v1/video/queue`，示例字段 `model`、`duration`（`"5s"` / `"10s"`）、`prompt`、`negative_prompt`、`aspect_ratio`、`resolution`。返回 `model`、`queue_id`，可有 `download_url`。来源：[Video Generation](https://docs.venice.ai/guides/media/video-generation)、[Video Queue](https://docs.venice.ai/api-reference/endpoint/video/queue)。
- 轮询：`POST /api/v1/video/retrieve`，body `{ model, queue_id }`。完成时 `Content-Type` 含 `video/mp4`，体是二进制。同上。
- seed、自定义 loras：本次打开的 queue 页示例没有这两字段，标「未验证」。

## 本次未重新打开、只标未验证的服务商

下表是写文档前半段时的状态，**不要再当事实**。后文「本轮补开的官方页」与「2026-11-05 再次抓取」已重新打开的服务商，以那些节为准。

## 代码改动（对照当前文件，不假设前人已修）

1. NanoGPT `/api/video/generate`：去掉 `for i < 70; sleep 2500`（175 秒）。改为官方示例的 5 秒间隔、10 分钟本地预算。`COMPLETED` 无 URL → 502 `upstream-protocol`。预算耗尽 → 504 `local`。同时转发官方页列出的 `frames_per_second`、`num_frames`、`resolution`、`num_inference_steps`、`cfg_scale`、`shift`。测试：`src/server/nanoGptVideoStatus.test.ts`、`videoGenerateRoute.test.ts` 新增 3 例。
2. Civitai 视频分支（`/api/civitai/generate` 且 `isVideo === true`）：socket 从 120 秒改为 10 分钟（图像路径仍 120 秒）。提交 `wait=100` 改为 `wait=60`（低于官方点名的 100 秒客户端超时）。轮询改为 2/5/10/15/30 秒，本地预算 10 分钟。预算耗尽返回 504 `errorSource: local`，带 `workflowId` 与 endpoint，不再用 500 笼统句。测试：`src/server/civitaiVideoPollSchedule.test.ts`。
3. 全局 undici：`headersTimeout` / `bodyTimeout` 300 秒 → 600 秒，`connectTimeout` 30 秒 → 60 秒。原因：单次冷启动读取会在 300 秒被 `UND_ERR_HEADERS_TIMEOUT` 掐断，看起来像上游失败。已通知 core5b。
4. AIVideoNode 服务商下拉增加 together、aimlapi、venice、krea、sogni。Together / AIMLAPI / Venice / Krea 走各自官方视频端点。Sogni 在 r4 之前把视频节点打到 `generate_image`（见 jsonl 第 98 行）；r4 改为按实时 hosted-tool Schema 选 `generate_video` / `animate_photo`。未加入 nanogpt：其注册驱动只有图像能力，点击会被 `assertCapability` 拒绝。已记 finding 给 core5b。
5. r4：Sogni 视频 submit 不再写死 `toolName:'generate_image'`。toolName 取自所用 Schema 的 `$id`（`/tools/<name>.schema.json`）。T2V 拉 [generate_video.schema.json](https://raw.githubusercontent.com/Sogni-AI/sogni-protocol/main/schemas/tools/generate_video.schema.json)，参数字段是 `videoModel`。I2V（有 `image_url`）拉 [animate_photo.schema.json](https://raw.githubusercontent.com/Sogni-AI/sogni-protocol/main/schemas/tools/animate_photo.schema.json)，继续 `media_references` + `sourceImageIndex:-1`。Seedance `referenceImageIndices` 未接通。图像节点仍走 `generate_image`。Driver 只在产物 URL 是视频（mp4/webm/mov 或 `data:video/`）或 poll `mediaType==='video'` 时标 VIDEO，不再因 `params.isVideo` 标 VIDEO。

## UI 点击（2026-11-05，本机 PORT=3107，Chrome CDP 9407）

三次都是画布点击，不是脚本直打上游。每次都带了参考图、种子、cfg、帧数或时长，以及官方 schema 声明的 LoRA。三家都在提交阶段拒绝，原因是账户余额，没有生成视频，没有 history id。按规则记 PASS_BILLING，不换模型、不换密钥重试。掩码 JSON 在 `docs/evidence/2026-11-05/video/`。r4 补浏览器截图，见后文「UI 截图」。分类以 jsonl 脚本为准，不手写。

| 点击 | 预设 | 本站路由 | 上游端点 | 状态 | 上游原文 |
| --- | --- | --- | --- | --- | --- |
| 1 | Fal.ai · 标准图生视频 | POST /api/video/generate | https://queue.fal.run/fal-ai/wan-i2v-lora | 403 | User is locked. Reason: Exhausted balance |
| 2 | WaveSpeed · 标准图生视频 | POST /api/schema-provider/wavespeed/submit | https://api.wavespeed.ai/api/v3/wavespeed-ai/wan-2.1/i2v-480p-lora | 400 | Insufficient credits. Please top up your account to continue. |
| 3 | Replicate · 标准图生视频 | POST /api/engine/replicate/generate | https://api.replicate.com/v1/predictions | 402 | Insufficient credit |
| 4 | Civitai · 标准图生视频 | POST /api/civitai/generate（isVideo） | orchestration.civitai.com videoGen | 400 | insufficientBuzz（traceId 00-19a6267860a085a3ac2c7d19a51d4b7a-6c15bfce02a1a825-02） |
| 5 | MuAPI · 标准图生视频 | 参考图上传（生成 POST 未发出） | MuAPI upload_file | 403 | INSUFFICIENT_CREDITS |
| 6 | Novita · 标准图生视频 | POST /api/schema-provider/novita/submit | Novita SVD-XT | 403 | NOT_ENOUGH_BALANCE |

Civitai 模型 `urn:air:wanvideo-22-i2v-a14b:checkpoint:civitai:1817671@2114157`，LoRA `urn:air:wanvideo-22-i2v-a14b:lora:civitai:1902817@2153813`，cfg 3，480×832，fps 24，seed 1715864103，prompt `summer`。官方 [wan.md](https://developer.civitai.com/orchestration/recipes/wan.md) 写明 LoRA 只在 v2.2 Comfy。拒绝发生在提交，没有 workflow id，所以 10 分钟轮询没有被这次点击覆盖到。

MuAPI 模型 `wan2.1-lora-i2v`，480p，5 秒，16:9，同一 matrix-shot LoRA。403 出在参考图上传，生成请求没有发出。

Novita 预设是 `SVD-XT`，25 帧、6 fps。jsonl 第 49 行（18:46:10）和第 65 行（18:52:32）是两次相同的上游 `POST /v3/async/img2video` 403 `NOT_ENOUGH_BALANCE`，不是「只有一次」。该预设没有 LoRA 字段。

## 第二轮：此前未点过的五家（文生视频，各点一次）

模型取自本次重新打开的官方页，不取仓库草稿。每家都是画布点击。

| 服务商 | 模型 | 上游端点 | 状态 | 原文 |
| --- | --- | --- | --- | --- |
| Together | `Wan-AI/wan2.7-t2v` | https://api.together.ai/v2/videos（jsonl 77） | 401 | invalid api key → **BLOCKED_AUTH** |
| AIMLAPI | `alibaba/wan-2-6-t2v` | https://api.aimlapi.com/v2/video/generations | 403 | You've run out of funds → PASS_BILLING |
| Venice | `wan-2.5-preview-text-to-video` | https://api.venice.ai/api/v1/video/queue | 402 | Insufficient USD or Diem balance → PASS_BILLING |
| Krea | `video/kling/kling-2.5` | https://api.krea.ai/generate/video/kling/kling-2.5（jsonl 93） | 402 | API balance is separate… → PASS_BILLING（jsonl 90 的 404 是接线错误，不算余额） |
| Sogni | `ltx25` | https://api.sogni.ai/v1/creative-agent/workflows（jsonl 98） | 201 | **接线错误**：请求体 `toolName: generate_image`、`arguments.model: ltx25`。jsonl 99–100 的 `waiting_for_user / insufficient_credit` 是该**图像**工作流，不是视频证据。 |

来源：Together [Wan 2.7 quickstart](https://docs.together.ai/docs/wan2.7-t2v-quickstart)，AIMLAPI [Wan 2.6 text-to-video](https://docs.aimlapi.com/api-references/video-models/alibaba-cloud/wan-2.6-text-to-video)，Venice [Video Generation](https://docs.venice.ai/guides/media/video-generation)，Krea [Text to Video](https://docs.krea.ai/developers/examples/text-to-video)，Sogni [generate_video.schema.json](https://raw.githubusercontent.com/Sogni-AI/sogni-protocol/main/schemas/tools/generate_video.schema.json)。

Together 在打到 `/v2/videos` 之前，jsonl 第 59、61、67、69、71 行共 **5 次** POST `https://api.together.ai/v1/images/generations`，都是 401 invalid api key。原因：目录 401 后没有行，占位记录没有 type，服务端猜成图像端点。这 5 次是接线错误，不算视频 billing pass。修后 jsonl 第 77 行才是 `/v2/videos` 401，记 **BLOCKED_AUTH**。测试：`src/server/schemaCatalogFailureSends.test.ts`。

Krea jsonl 第 90 行：`POST https://api.krea.ai/generate/kling/kling-2.5` → 404 Endpoint not found（路径少了 `/video/`，接线错误）。第 93 行：`POST https://api.krea.ai/generate/video/kling/kling-2.5` → 402 API balance…（余额拒绝，PASS_BILLING）。两次都是这一家，未超两次。

Sogni jsonl 第 98 行请求体是 `steps[0].toolName = generate_image`、`arguments.model = ltx25`、`duration: 5`。官方 T2V 要求 `toolName: generate_video`、`arguments.videoModel: ltx25`（[direct-generation](https://docs.sogni.ai/api-reference/direct-generation/)）。第 99–100 行 GET 同一 workflow，`waiting_for_user / insufficient_credit` 属于这次**图像**提交，不能当作视频 PASS_BILLING。r4 修好后再点一次，见后文截图。

五家里当时没有一家返回视频。节点播放、SaveVideo、历史因此仍然没有可验证的成功样本。

## 本轮补开的官方页（取消与是否有视频接口）

- Replicate 有取消：`POST /v1/predictions/{id}/cancel`。[HTTP API](https://replicate.com/docs/reference/http) 的 “Cancel a prediction”。
- Civitai 取消是官方 `PUT /v2/consumer/workflows/{workflowId}`，请求体 `{ "status": "canceled" }`。`UpdateWorkflowRequest.status` 的枚举只有 `canceled`。来源：[Update workflow](https://developer.civitai.com/orchestration/reference/operations/UpdateWorkflow)，以及本次下载的 `https://orchestration.civitai.com/openapi/v2-consumers.json`（operationId `UpdateWorkflow`）。之前发到 `POST .../workflows/{id}/cancel` 是本地拼的，已删除，不再发送。
- Krea 取消：`DELETE /jobs/{id}`，仅 queued / processing。[Job lifecycle](https://docs.krea.ai/developers/job-lifecycle) 原文 “To cancel a job: Send a DELETE request to /jobs/{id}… only while queued or processing”。OpenAPI 同路径，bearerAuth。轮询仍是 `GET /jobs/{job_id}`，文档写每 5 秒。
- Sogni 取消：`POST /v1/creative-agent/workflows/:id/cancel`，无请求体。[Workflows](https://docs.sogni.ai/api-reference/workflows) 原文 “Cancel a workflow — POST /v1/creative-agent/workflows/:id/cancel … Takes no body”。
- Fal 取消见此前的 queue 页：`PUT {cancel_url}`。
- MuAPI 参考页只有提交和轮询，状态值含 `cancelled`，没有列出取消调用。[API Reference](https://muapi.ai/docs/api-reference)。所以不发取消。
- Novita 总览有 Video Generation 和 Task Result，取消只出现在 LLM batch。[API Reference Overview](https://docs.novita.ai/api-reference/api-reference-overview)。视频任务不发取消。
- NanoGPT、Together、AIMLAPI、Venice：本次打开的页面没有取消接口。不发取消，界面说明没有该接口。
- HF Inference Providers 有文生视频：`InferenceClient.text_to_video`，示例 `provider="fal-ai"`，响应是原始视频字节，没有任务号，因此没有取消。[Text to Video](https://huggingface.co/docs/inference-providers/tasks/text-to-video)。

## 2026-11-05 再次抓取（WaveSpeed / Tensor.Art / ModelScope）

### WaveSpeed

- 提交：`POST https://api.wavespeed.ai/api/v3/{model_id}`，`Authorization: Bearer`。字段按模型页 / 实时 catalog `model_run` schema，不在本地写死。全局可选 `enable_sync_mode`、`enable_base64_output`。返回 prediction `id`。来源：[Submit Task](https://wavespeed.ai/docs/submit-task)（抓取 2026-11-05）。
- 轮询：`GET https://api.wavespeed.ai/api/v3/predictions/{task-id}/result`。终态 `completed` 取 `outputs`；`failed` / `cancelled` / `timeout` / `deleted` 停。间隔 ≥2s。来源：[Get Result](https://wavespeed.ai/docs/get-result)。
- 删除（不是运行中取消）：`POST https://api.wavespeed.ai/api/v3/predictions/delete` body `{ids:[...]}`，只删已结束任务。来源：[Delete Task](https://wavespeed.ai/docs/delete-task)。运行中的视频任务**没有**官方 cancel 调用，UI 不发取消。
- I2V 例：`wavespeed-ai/wan-2.1/i2v-480p-lora`。页面列出 `prompt`、`image`（必填）、`negative_prompt`、`loras[{path,scale}]` 最多 3、`size`、`num_inference_steps`、`duration`（5s 或 10s）、`guidance_scale`、`flow_shift`、`seed`。来源：[模型页](https://wavespeed.ai/models/wavespeed-ai/wan-2.1/i2v-480p-lora)（抓取 2026-11-05）。首尾帧：该页只要一张起始 `image`；end frame 未在该页列出。
- LoRA：通用训练页 [LoRA Training & Usage](https://wavespeed.ai/docs/lora-training-usage)；该 I2V 模型页声明 `loras` 数组。

### Tensor.Art TAMS

- 提交：`POST https://{endpoint}/v1/jobs`，鉴权 `TAMS-SHA256-RSA`。视频 stage 类型是 `VIDEO_DIFFUSION` / `video_diffusion`。来源：[Workspace API Example · TextToVideo / ImageToVideo](https://tams-docs.tensor.art/docs/api/guide/workspace-api-example/)（抓取 2026-11-05）。
- T2V 示例字段：`sdModel`、`generationMode`（`STABLE`）、`width`、`height`、`fps`、`totalFrames`、`prompts[].text`、`negativePrompts[].text`、`lora.items[{lora_model,weight}]`。I2V 在 `INPUT_INITIALIZE.imageResourceId` 放首帧。首尾帧：`VideoInpaint` 用 `inp.args[{startImageResourceId,endImageResourceId}]`。ControlNet 视频：`controlnet.args[{inputVideoResourceId,preprocessor}]`。
- 取消：`DELETE https://{endpoint}/v1/jobs/:jobId`。[cancel job](https://tams-docs.tensor.art/docs/api/apis/tams-api-v-1-service-cancel-job/)（抓取 2026-11-05）。
- 轮询：OpenAPI 列出 job `status` 枚举 `DEFAULT | CREATED | PENDING | RUNNING | CANCELED | SUCCESS | FAILED | WAITING`（[v1/jobs/workflow](https://tams-docs.tensor.art/docs/api/apis/tams-api-v-1-service-workflow-job-create/)）。`GET /v1/jobs/:id` 的英文页本次抓取只返回导航壳，具体 path 以 OpenAPI 为准，未把路径写死进代码。
- **UI 未接通**：AIVideoNode 下拉里没有 `tensorart` / `openworks`。官方有视频 API，但本轮没有把 TAMS VIDEO_DIFFUSION 接到画布，不得在 UI 当已接通。

### ModelScope API-Inference

- 官方介绍页 [API推理介绍](https://www.modelscope.cn/docs/model-service/API-Inference/intro) 与限制页 [API-Inference使用限制](https://www.modelscope.cn/docs/model-service/API-Inference/limits) 本次抓取（2026-11-05）只返回站点壳（页脚/导航），**没有**列出文生视频/图生视频 HTTP 端点、字段或终态。
- 社区有开源 T2V 模型页（如 `damo/text-to-video-synthesis`），那是本地 pipeline，不是 API-Inference。
- **结论：本轮未能从官方 API-Inference 文档核实到视频 HTTP API。** UI 不得把 ModelScope 标成已接通视频供应商（下拉里本来也没有）。

## jsonl 对账（脚本生成，禁止手写）

命令：`node docs/evidence/2026-11-05/video/ledger-from-jsonl.mjs temp/logs/requests-2026-11-05.jsonl`

```
source: temp/logs/requests-2026-11-05.jsonl
upstream POST count: 18
Together /v1/images/generations wiring posts: 59, 61, 67, 69, 71
Together /v2/videos posts: 77:401
Novita POST count: 2 lines 49, 65
Krea posts: 90:404:WIRING, 93:402:PASS_BILLING
Sogni posts: 98:201:WIRING
PASS_BILLING: 10
BLOCKED_AUTH: 1
WIRING: 7
```

| jsonl line | time | provider | endpoint | HTTP | verdict | note |
| --- | --- | --- | --- | --- | --- | --- |
| 7 | 2026-11-05T18:30:18+09:00 | fal | https://queue.fal.run/fal-ai/wan-i2v-lora | 403 | PASS_BILLING | Fal 403 Exhausted balance |
| 10 | 2026-11-05T18:32:13+09:00 | wavespeed | https://api.wavespeed.ai/api/v3/wavespeed-ai/wan-2.1/i2v-480p-lora | 400 | PASS_BILLING | WaveSpeed 400 Insufficient credits |
| 25 | 2026-11-05T18:32:53+09:00 | replicate | https://api.replicate.com/v1/predictions | 402 | PASS_BILLING | Replicate 402 Insufficient credit |
| 43 | 2026-11-05T18:44:24+09:00 | civitai | https://orchestration.civitai.com/v2/consumer/workflows?wait=60 | 400 | PASS_BILLING | Civitai 400 insufficientBuzz |
| 47 | 2026-11-05T18:44:59+09:00 | muapi | https://api.muapi.ai/api/v1/upload_file | 403 | PASS_BILLING | MuAPI upload 403 INSUFFICIENT_CREDITS; generate POST not sent |
| 49 | 2026-11-05T18:46:10+09:00 | novita | https://api.novita.ai/v3/async/img2video | 403 | PASS_BILLING | Novita 403 NOT_ENOUGH_BALANCE |
| 59 | 2026-11-05T18:50:42+09:00 | together | https://api.together.ai/v1/images/generations | 401 | WIRING | Together video click sent to /v1/images/generations (catalog 401, image endpoint guessed) |
| 61 | 2026-11-05T18:51:36+09:00 | together | https://api.together.ai/v1/images/generations | 401 | WIRING | Together video click sent to /v1/images/generations (catalog 401, image endpoint guessed) |
| 65 | 2026-11-05T18:52:32+09:00 | novita | https://api.novita.ai/v3/async/img2video | 403 | PASS_BILLING | Novita 403 NOT_ENOUGH_BALANCE |
| 67 | 2026-11-05T18:53:04+09:00 | together | https://api.together.ai/v1/images/generations | 401 | WIRING | Together video click sent to /v1/images/generations (catalog 401, image endpoint guessed) |
| 69 | 2026-11-05T18:53:31+09:00 | together | https://api.together.ai/v1/images/generations | 401 | WIRING | Together video click sent to /v1/images/generations (catalog 401, image endpoint guessed) |
| 71 | 2026-11-05T18:54:10+09:00 | together | https://api.together.ai/v1/images/generations | 401 | WIRING | Together video click sent to /v1/images/generations (catalog 401, image endpoint guessed) |
| 77 | 2026-11-05T18:55:11+09:00 | together | https://api.together.ai/v2/videos | 401 | BLOCKED_AUTH | Together /v2/videos 401 invalid api key |
| 81 | 2026-11-05T18:55:50+09:00 | aimlapi | https://api.aimlapi.com/v2/video/generations | 403 | PASS_BILLING | AIMLAPI 403 out of funds |
| 87 | 2026-11-05T18:56:49+09:00 | venice | https://api.venice.ai/api/v1/video/queue | 402 | PASS_BILLING | Venice 402 Insufficient USD or Diem |
| 90 | 2026-11-05T18:57:40+09:00 | krea | https://api.krea.ai/generate/kling/kling-2.5 | 404 | WIRING | Krea path missing /video/ prefix → 404 Endpoint not found |
| 93 | 2026-11-05T18:58:07+09:00 | krea | https://api.krea.ai/generate/video/kling/kling-2.5 | 402 | PASS_BILLING | Krea 402 API balance separate from workspace compute |
| 98 | 2026-11-05T18:58:41+09:00 | sogni | https://api.sogni.ai/v1/creative-agent/workflows | 201 | WIRING | Sogni video node submitted generate_image (image hosted-tool), not generate_video |

## UI 截图（r4 修好后的 Sogni T2V 点击）

画布：`http://127.0.0.1:3107/`。操作：添加 AI 视频节点 → 视频服务商选 Sogni → 自定义模型 `ltx25` → 提示词 `a paper boat crossing a quiet pond, gentle ripples, daylight` → 时长 5 → 点「运行：AI 视频」。

- 运行前节点：`docs/evidence/2026-11-05/video/sogni-t2v-schema-before-run.jpg`。可见 `schemaStatus hosted-tool:generate_video · toolName generate_video · videoModel`。
- 运行后节点：`docs/evidence/2026-11-05/video/sogni-t2v-generate-video-ui.jpg`。错误框已脱敏（盖住 wallet / SID / fingerprint），摘要为 `status=failed`、`toolName=generate_video`、`videoModel=ltx25`、`Free tier: this model is not available on the free tier via the API — subscribe to Unlimited`。
- 全画布：`docs/evidence/2026-11-05/video/sogni-t2v-canvas-run.jpg`。可见运行按钮「运行：AI 视频（显式 Provider/Model）」、画布上的 AI 视频节点、脱敏后的上游失败摘要。

对应请求：`temp/logs/requests-2026-11-06.jsonl` 第 7 行 `POST https://api.sogni.ai/v1/creative-agent/workflows` 201，请求体 `steps[0].toolName=generate_video`、`arguments.videoModel=ltx25`、`duration=5`。第 8 行 GET 同 workflow，`status=failed`，事件原文 `Free tier: this model is not available on the free tier via the API — subscribe to Unlimited`。记 **PASS_BILLING**（免费档/订阅门闸，无视频 URL）。JSON：`docs/evidence/2026-11-05/video/sogni-t2v-generate-video.json`。

截图里没有密钥、token、本机绝对路径。身份字段已打码。

## UI 截图（rebase 到含 M1–M6 的 main 后再次点击，未点运行）

画布仍是 `http://127.0.0.1:3107/`。操作：添加节点 → AI 视频生成节点 → 视频服务商选 Sogni → 自定义模型 `ltx25`。本次只确认横幅与选择器，没有点运行（上次同一账户已是免费档门闸 PASS_BILLING）。

- 节点标题与 hosted-tool 横幅：`docs/evidence/2026-11-05/video/sogni-t2v-schema-banner-rebase.jpg`。标题「AI 视频（显式 Provider/Model）」。横幅原文：`schemaStatus hosted-tool:generate_video · toolName generate_video · videoModel · 有参考图时提交走 animate_photo（实时 Schema）；Seedance 参考图字段未接通`。
- 全画布（节点顶部 + 运行按钮）：`docs/evidence/2026-11-05/video/sogni-t2v-schema-canvas-rebase.jpg`。右上角按钮「运行：AI 视频（显式 Provider/Model）」。画布上同时可见默认图像工作流节点，无密钥、无钱包、无 SID。
- 运行按钮特写：`docs/evidence/2026-11-05/video/sogni-t2v-run-button-rebase.jpg`。文案「运行：AI 视频（显式 Provider/Model）」。
- 滚到选择器后：`docs/evidence/2026-11-05/video/sogni-t2v-provider-model-rebase.jpg`。可见「视频服务商 (Provider)」= Sogni，「model (AI视频大模型)」= `ltx25`，其下只读标签也是 `ltx25`。

三次发出的字段（提示词已截断，参考图是上传后的本站 `/api/media/…`，不是外链）：

- Fal：model `fal-ai/wan-i2v-lora`，num_frames 81，fps 16，resolution 480p，aspect_ratio 16:9，seed 24231881，cfg 4，loras `[{path: https://huggingface.co/Remade-AI/matrix-shot/resolve/main/matrix_shot.safetensors, scale: 1}]`。节点原文：`Fal.ai 接口执行失败 [403]`，errorSource upstream。
- WaveSpeed：model `wavespeed-ai/wan-2.1/i2v-480p-lora`，duration 5，size `832*480`，seed 24231881，cfg 4，同一 LoRA。节点原文：`HTTP 400: {"code":400,"message":"Insufficient credits..."}`。
- Replicate：model `wan-video/wan2.1-with-lora`，num_frames 81，resolution 480p，aspect_ratio 16:9，seed 24231881，cfg 4，同一 LoRA。节点原文：`Replicate 视频接口上游 HTTP 402`，upstreamStatus 402。

没有视频产物。节点预览、SaveVideo、历史播放因而没有可验证的成功样本。

## 状态行与取消（评审第二轮）

运行中的视频节点挂 `<VideoJobStatus>`。它自己每 3 秒读 `GET /api/video/status`（优先 `jobId`，否则 `nodeId`；缺少二者返回 400，不再按 provider 查）。显示阶段、上游状态原文、本地已等待秒数和本地预算。网络失败和非 JSON 响应写进状态行（HTTP 状态、正文前若干字符、端点），取消包 try/catch，成功行写 `upstreamStatus` 和 `rawResponse`。轮询 hook 在子组件里：把 `NodeItem` 当函数调用的测试只会拿到这个元素的描述，不会执行 hook。

状态由各家服务端轮询写入：Fal（`runFalQueueLifecycle` 的 onStatus，路由 try/finally 清除）、NanoGPT（`/api/video/generate`）、Civitai（`runCivitaiVideoPoll`，`server.ts` 的 isVideo 分支调用它）、Replicate（视频预测轮询）、schema-provider 路由（`isVideo === true` 的 submit / tasks/:taskId，覆盖 Krea、Sogni 以及其余走该驱动的视频任务）。浏览器里的 SchemaProviderDriver 不再写这张表。任务成功、失败或本地预算耗尽时删除记录；超过预算加 60 秒仍无人清理的记录由 TTL 删除。取消复用提交时存下的 key，不调 `getNextKey`。Fal 的 cancel_url 只读服务端任务记录，客户端传来的 URL 不用。

取消按钮「停止这个视频任务」打 `POST /api/video/cancel`。没有服务端任务记录、或客户端 `provider` 与记录不一致，都是 409 且不发上游。有文档的才发：Fal `PUT {cancel_url}`（只读服务端记录），Replicate `POST` 存储的 `urls.cancel`（或按提交时的 baseUrl 拼出），Civitai `PUT /v2/consumer/workflows/{id}` body `{ "status": "canceled" }`，Krea `DELETE /jobs/{id}`，Sogni `POST /v1/creative-agent/workflows/{id}/cancel`。NanoGPT、WaveSpeed、MuAPI、Novita、Together、AIMLAPI、Venice 返回 409，正文写明没有取消接口，不发上游请求。

## Sogni 视频 Schema hasReference 联动与横幅对比验证（M12 闭环）

在真实 Chrome 浏览器（CDP 端口 9412，本地开发服务 127.0.0.1:3112，视口宽度 1280×900）中实操测试，拍摄包含节点标题、连线、参考图底图与横幅的整段画布截图，验证 `useLiveVideoSchema` 在带参考图时首帧即加载 `animate_photo` Schema：

1. **未接参考图（文生视频 T2V）**：
   - 载入标准文生视频工作流，将视频服务商切换为 Sogni，模型输入 `ltx25`。
   - 画布上仅有 AI 视频节点与保存视频节点，AI 视频节点左侧 `图像 (IMAGE)`（`init_image`）插槽无任何输入连线。
   - `useLiveVideoSchema` 发出 `GET /api/model-schema?provider=sogni&model=ltx25&isVideo=true`（不带 hasReference 参数）。
   - 节点横幅即时呈现：`schemaStatus hosted-tool:generate_video · toolName generate_video · videoModel · 有参考图时提交走 animate_photo（实时 Schema）；Seedance 参考图字段未接通`。
   - 截图存盘：`docs/evidence/2026-11-05/video/sogni-t2v-generate-video-banner-m12.png`（整段画布 1280×757，可见节点标题、无参考图连线事实与 generate_video 横幅）。

2. **边界验证：已接连线但参考图为空**：
   - 载入标准图生视频工作流，`参考底图加载 (Load Image)` 节点与 AI 视频节点通过青色连线相连，但 LoadImage 内尚未填入图片（`image_url` 为空，显示占位符「输入图像 URL 或从资产库选择...」，且无图片缩略图）。
   - 按照 `hasReferenceImageInput` 规则（要求必须有连线且来源节点图片非空），由于图片为空，`useLiveVideoSchema` 仍发送 `hasReference=false`。
   - 节点横幅如实保持：`schemaStatus hosted-tool:generate_video · toolName generate_video · videoModel · ...`。
   - 截图存盘：`docs/evidence/2026-11-05/video/sogni-i2v-empty-ref-generate-video-m12.png`（整段画布 1280×757，可见连线、空图状态与 generate_video 横幅）。

3. **已接参考图（图生视频 I2V，LoadImage 含有效图片）**：
   - 在已连线的 `参考底图加载 (Load Image)` 节点中填入真实参考图 URL（`/seed-ok-preview.png`），节点内呈现出真实的蓝色参考图预览卡片。
   - 青色贝塞尔连线从 LoadImage 的 `图像 (IMAGE)` 端口直连 AI 视频节点的 `图像 (IMAGE)`（`init_image`）端口。
   - `useLiveVideoSchema` 立即捕获到有效参考图输入，向服务端发出 `GET /api/model-schema?provider=sogni&model=ltx25&isVideo=true&hasReference=true`。
   - 节点横幅从首帧即显示 `animate_photo`（无需等待提交或后端驱动覆盖）：`schemaStatus hosted-tool:animate_photo · toolName animate_photo · videoModel · 有参考图时提交走 animate_photo（实时 Schema）；Seedance 参考图字段未接通`。
   - 截图存盘：`docs/evidence/2026-11-05/video/sogni-i2v-animate-photo-banner-m12.png`（整段画布 1280×757，可见 AI 视频节点标题、直连参考图输入连线、LoadImage 内真实预览图及 animate_photo 横幅）。

4. **提供商 Sogni 与模型 ltx25 完整下拉及回显特写证据**：
   - 截图存盘：`docs/evidence/2026-11-05/video/sogni-i2v-sogni-provider-model-evidence.png`（整节点 1280×1750，图宽 1280）。
   - **同一张截图中完整呈现**：
     - 顶部节点标题 `AI 视频 (Fal.ai)` 及 `图像 (IMAGE)` 连线（来自 LoadImage 的 `/seed-ok-preview.png` 预览图）。
     - 横幅原文：`schemaStatus hosted-tool:animate_photo · toolName animate_photo · videoModel · 有参考图时提交走 animate_photo（实时 Schema）；Seedance 参考图字段未接通`。
     - 下方「视频服务商 (Provider)」下拉选择框明确选中并显示 `Sogni`。
     - 「model (AI视频大模型)」下拉框明确选中并显示 `ltx25`，只读回显标签明确显示 `ltx25`。
   - **关于节点标题「(Fal.ai)」的来源说明**：
     - 在本应用数据模型中，工作流预设在载入时写入静态属性 `node.title = 'AI 视频 (Fal.ai)'`（`src/constants/presets.ts` 第 845 行，`git blame` 证实于 2026-10-17 引入，属于预设遗留静态标题，绝非 M12 引入）。
     - 用户在控件中修改「视频服务商 (Provider)」时，触发更新的是运行时参数 `node.values.targetProvider = 'sogni'` 与 `node.values.provider = 'sogni'`，但前端不会自动修改用户卡片的静态标题。
     - `useLiveVideoSchema` 与底层执行路由均严格基于真实参数 `node.values.targetProvider`（`sogni`）与 `node.values.model`（`ltx25`）运行，标题仅为展示文本。主控与审查者已确认此机制。

所有截图均通过 `ReadMediaFile` 审查确认，图宽 1280，文字清晰可读，无 API Key、无钱包地址、无 SID 与签名 URL。

## 尚未完成

- 付费点击：图生视频 6 家（Fal、WaveSpeed、Replicate、Civitai、MuAPI、Novita）和文生视频里 AIMLAPI / Venice / Krea（第二次）被账单拒绝（PASS_BILLING）。Together `/v2/videos` 是 401 BLOCKED_AUTH；此前 5 次 `/v1/images/generations` 与 Krea 首次 404、Sogni jsonl 98 的 `generate_image` 是接线错误。没有任何视频 URL，所以节点播放、SaveVideo、历史都没有可验证的成功样本。这两个任务按 tower 决定保持 dropped。
- Civitai 的 `runCivitaiVideoPoll` 是 `server.ts` isVideo 分支调用的循环。测试用假时钟：前 7 次 `processing`、第 8 次返回视频（累计等待超过旧的 60 秒）；一直 `scheduled` 直到 10 分钟预算，结果是本地超时，带 workflowId 和 endpoint，路由把它写成 504 `errorSource: local`。图像请求的 socket 仍是 `civitaiGenerateSocketMs(false) === 120000`。
