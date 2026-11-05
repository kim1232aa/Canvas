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

仓库里已有 schema 路由代码（WaveSpeed、MuAPI、Novita、AIMLAPI、Krea、Sogni、Replicate、HF、ModelScope）。那些路由的字段与生命周期**未在本次重新抓取官方页**，不把前一任草稿或代码注释当成事实。下表是「代码里指向的路径」，不是核实结论。

| 服务商 | 密钥 | 本次核实 |
| --- | --- | --- |
| WaveSpeed | 有 | 未验证 |
| MuAPI | 有 | 未验证 |
| Novita | 有 | 未验证 |
| AIMLAPI | 有 | 未验证 |
| Krea | 有 | 未验证 |
| Sogni | 有 | 未验证 |
| Replicate | 有 | 未验证 |
| HF Inference Providers | 有 | 未验证 |
| ModelScope（国内 / 国际） | 有 | 未验证 |
| Tensor.Art TAMS / OpenWorks | 有 | 未验证 |

## 代码改动（对照当前文件，不假设前人已修）

1. NanoGPT `/api/video/generate`：去掉 `for i < 70; sleep 2500`（175 秒）。改为官方示例的 5 秒间隔、10 分钟本地预算。`COMPLETED` 无 URL → 502 `upstream-protocol`。预算耗尽 → 504 `local`。同时转发官方页列出的 `frames_per_second`、`num_frames`、`resolution`、`num_inference_steps`、`cfg_scale`、`shift`。测试：`src/server/nanoGptVideoStatus.test.ts`、`videoGenerateRoute.test.ts` 新增 3 例。
2. Civitai 视频分支（`/api/civitai/generate` 且 `isVideo === true`）：socket 从 120 秒改为 10 分钟（图像路径仍 120 秒）。提交 `wait=100` 改为 `wait=60`（低于官方点名的 100 秒客户端超时）。轮询改为 2/5/10/15/30 秒，本地预算 10 分钟。预算耗尽返回 504 `errorSource: local`，带 `workflowId` 与 endpoint，不再用 500 笼统句。测试：`src/server/civitaiVideoPollSchedule.test.ts`。
3. 全局 undici：`headersTimeout` / `bodyTimeout` 300 秒 → 600 秒，`connectTimeout` 30 秒 → 60 秒。原因：单次冷启动读取会在 300 秒被 `UND_ERR_HEADERS_TIMEOUT` 掐断，看起来像上游失败。已通知 core5b。
4. AIVideoNode 服务商下拉增加 together、aimlapi、venice、krea、sogni。这五家的 SchemaProviderDriver 已声明 text2video/img2video，提交与轮询走已有 `/api/schema-provider/:id`。未加入 nanogpt：其注册驱动只有图像能力，点击会被 `assertCapability` 拒绝。已记 finding 给 core5b。

## UI 点击（2026-11-05，本机 PORT=3107，Chrome CDP 9407）

三次都是画布点击，不是脚本直打上游。每次都带了参考图、种子、cfg、帧数或时长，以及官方 schema 声明的 LoRA。三家都在提交阶段拒绝，原因是账户余额，没有生成视频，没有 history id。按规则记 PASS_BILLING，不换模型、不换密钥重试。掩码记录在 `temp/e2e/2026-11-05/video7b/`（该目录被 gitignore，不入库）。

| 点击 | 预设 | 本站路由 | 上游端点 | 状态 | 上游原文 |
| --- | --- | --- | --- | --- | --- |
| 1 | Fal.ai · 标准图生视频 | POST /api/video/generate | https://queue.fal.run/fal-ai/wan-i2v-lora | 403 | User is locked. Reason: Exhausted balance |
| 2 | WaveSpeed · 标准图生视频 | POST /api/schema-provider/wavespeed/submit | https://api.wavespeed.ai/api/v3/wavespeed-ai/wan-2.1/i2v-480p-lora | 400 | Insufficient credits. Please top up your account to continue. |
| 3 | Replicate · 标准图生视频 | POST /api/engine/replicate/generate | https://api.replicate.com/v1/predictions | 402 | Insufficient credit |

三次发出的字段（提示词已截断，参考图是上传后的本站 `/api/media/…`，不是外链）：

- Fal：model `fal-ai/wan-i2v-lora`，num_frames 81，fps 16，resolution 480p，aspect_ratio 16:9，seed 24231881，cfg 4，loras `[{path: https://huggingface.co/Remade-AI/matrix-shot/resolve/main/matrix_shot.safetensors, scale: 1}]`。节点原文：`Fal.ai 接口执行失败 [403]`，errorSource upstream。
- WaveSpeed：model `wavespeed-ai/wan-2.1/i2v-480p-lora`，duration 5，size `832*480`，seed 24231881，cfg 4，同一 LoRA。节点原文：`HTTP 400: {"code":400,"message":"Insufficient credits..."}`。
- Replicate：model `wan-video/wan2.1-with-lora`，num_frames 81，resolution 480p，aspect_ratio 16:9，seed 24231881，cfg 4，同一 LoRA。节点原文：`Replicate 视频接口上游 HTTP 402`，upstreamStatus 402。

没有视频产物。节点预览、SaveVideo、历史播放因而没有可验证的成功样本。

## 尚未完成

- 付费点击已做 3 家（都带 LoRA），全部余额不足，没有可播放的视频。文生视频点击未做：图生视频预设已覆盖三家且都被账单拦住，再点文生视频会打到同一批账户。需要充值后重跑。
- Together 的 `seconds` / `ratio` / `media.frame_images` 别名还没落地（等 tower 对 `schemaPayloadPlan.ts` 的回复）。在此之前，Together 视频会把画布 `duration` 原样送出；若 schema 只声明 `seconds`，该字段是否被上游拒绝由上游响应决定，不在本地改值重试。
