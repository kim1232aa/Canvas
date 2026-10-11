# T7 NanoGPT 验收报告 — BLOCKED_AUTH

## origin/main 已有验收摘要（2026-10-06）

日期：2026-10-06。验收方式：真实前端。

## 结论

**BLOCKED_AUTH**。模型 `qwen-image-2.1/text-to-image` 第一次因画布残留的旧 resolution 被本地能力校验拦截；改为该 endpoint 允许的 `1k` 后，真实请求到达 `https://api.nano-gpt.com/api/v1/images`，上游返回 HTTP 401：`Invalid session` / `invalid_api_key`。

因此当前只证明模型级参数校验与真实路由接通；凭据修复后仍需换一套新的参考作品参数做真实出图与原图对比。

## 本地 incoming 72f5372 的 2026-10-12 记录

范围说明：以下保留该提交的官方契约复审及历史前端证据；复审列出的待修复项属于当时的代码核对范围，不替代上方 2026-10-06 的真实前端验收结论，也不新增生成验收。

## 2026-10-12 官方契约复审（不新增生成验收）

旧 agent-117 的指定 wire 已只读恢复：成功读取 NanoGPT 官方索引，并下载正文、解析 OpenAPI；仅下载字节数不是契约证据，本节已亲读保存正文。日志未发现 Edit/Write 或生产代码写入调用，也没有完成回传；不能把它的调研视为已修复。历史 401 记录原样保留，本轮未用密钥、未生成、未上传、未改变服务或配置。

### 官方依据与当前代码

- [Generate Images](https://docs.nano-gpt.com/api-reference/endpoint/image-api-generate.md)：原文 “Use `POST /api/v1/images`”；鉴权 “`Authorization: Bearer YOUR_API_KEY`” 或 “`x-api-key: YOUR_API_KEY`”。`server.ts:6535-6542` 的固定官方端点、JSON 和 x-api-key 匹配；`src/engines/drivers/NanoGPTDriver.ts:30-50` 将画布 prompt/model/resolution/aspect_ratio/seed/reference 等交给本站。
- 同页原文 “`input_references` accepts an array of image references”，支持 URL、data URL、`{type:'image_url',image_url:{url}}`；`src/schemas/nanoImageApi.ts:75-78` 单参考图映射匹配。多参考图虽官方存在，本驱动/构建器尚未完整接入。
- [Endpoint metadata](https://docs.nano-gpt.com/api-reference/endpoint/image-api-model-endpoints.md)：原文 “Currently one public endpoint is returned per model”；认证可选。`server.ts:6526-6531` 查询并校验 id/单 endpoint 匹配，不需付费生成。
- [List Image Models](https://docs.nano-gpt.com/api-reference/endpoint/image-api-models.md)：原文 “Build clients from the returned metadata instead of hardcoding model capability tables.” 当前 `/api/models` 仍在 `server.ts:2976` 查询旧 `/api/v1/image-models`。旧目录不是非法端点：[Image API](https://docs.nano-gpt.com/api-reference/image-generation.md) 明确允许 legacy list；但新归一化目录的 capabilities、supported_parameters、endpoints 未保留进当前列表条目（`server.ts:3023-3039`）。
- 本轮无鉴权只读 GET `https://api.nano-gpt.com/api/v1/images/models` 和 `https://api.nano-gpt.com/api/v1/images/models/minimax-h3/text-to-image/endpoints` 均 HTTP 200。后者真实原文片段：`"loras":{"max_items":3,"item":{"path":"HTTPS URL","scale":"number"}}`，`"resolutions":["1k","2k"]`，`"max_output_images":4`，`"image_to_image":false`。因此“NanoGPT 一概不支持 LoRA”错误；只证明此模型元数据声明，不证明 LoRA 真正执行/挂载。FetchURL 无法提取 JSON，随后用只读 urllib 取得并解析真实 JSON。
- [Video Generation](https://docs.nano-gpt.com/api-reference/endpoint/video-generation.md)：原文 duration 为 string、resolution 为 model-dependent、提交返回 runId/id；`server.ts:4019-4047` 端点/鉴权/时长/任务 ID 基本匹配。
- [Video Status](https://docs.nano-gpt.com/api-reference/endpoint/video-status-unified.md)：正文 `data.status=COMPLETED` → `data.output.video.url` 与 `server.ts:4074-4077` 匹配；同页嵌入 OpenAPI 却是顶层 `status:completed` / `videoUrl`。这是官方内部冲突，不猜哪种实际生效；当前代码无法解析 OpenAPI 的顶层 videoUrl。

### 需串行修复，不在本轮改代码

1. HIGH：`NanoGPTDriver.ts:32` 已发送 custom_parameters，但 `nanoImageApi.ts:7-80` 完全不读取该对象；官方 background（Image API 指南列出）及用户任意 JSON 被静默丢弃。只读 tsx 实测 `{custom_parameters:{background:'transparent'}}` 构建结果只含 model/prompt、notes=[]。建议统一合并自定义值、禁止覆盖路由、记录覆盖前后值，再按实时元数据处理；不能靠新增静态白名单代替。
2. HIGH：`server.ts:4019-4027` 的 Nano 视频 payload 丢掉 req.body.resolution、size/custom_parameters，虽然 `VideoDriver.ts:163-166` 已送到本站，官方视频正文列 resolution。建议显式映射 resolution 并保留 JSON/覆盖记录；对官方状态两种形状保留原响应并分别支持，不暗换端点。
3. HIGH：`providerSchema.ts:567,573` 把未声明当 unsupported、并静态禁 flux-schnell seed；与 `nanoImageApi.ts:31-35,45-66` 的 unknown 透传和实时 LoRA 声明不一致。建议 UI/Schema 接实时元数据，unknown 保留用户意图，不能宣称官方不支持。
4. MEDIUM：`/api/model-schema` 的非 fal 分支 `server.ts:2365` 对 NanoGPT 返回 ModelScope 文档 source，并承诺“自定义 JSON 会原样提交”，而本组实现未做到。建议 provider 对应 source，实际可取 Nano metadata 时返回真实字段，未接入就明示本地限制。
5. 错误 HTTP body 在 `server.ts:6527,6545-6548` 保留；驱动 `NanoGPTDriver.ts:54-56` 未总是包含 HTTP 状态，视频失败只取 data.error 时可能漏顶层 error。端到端错误透明仍需验收。

### 未完成与等级

保持历史 BLOCKED_AUTH；当前凭据是否已改变未检查。待有效凭据后从前端独立样本验收文生图、参考图、多图/历史刷新、LoRA 实际推理、视频轮询终态、参数覆盖与失败原文。公共目录 200、契约测试或本地 builder 实测不提高生成/计费等级。

## 2026-10-06 历史前端证据（保留）

日期：2026-10-06（UTC+8）。验收方式：真实前端 ComfyCanvas Studio @ 127.0.0.1:3000。

## 结论

**BLOCKED_AUTH** — 前端真实请求已经到达 NanoGPT 图像 API，但当前凭据返回 HTTP 401 `Invalid session` / `invalid_api_key`。这不是余额不足，也不是网络问题，因此不能记 PASS_BILLING 或 PASS_GENERATION。

## 证据链

1. Provider 显式选择 `nanogpt`。
2. 模型选择 `qwen-image-2.1/text-to-image`。
3. 第一次运行被本地能力校验正确拦住：旧画布残留 `1024x1024 (1:1)`，该模型当前 endpoint 元数据要求 `1k / 1.5k / 2k` 一类 resolution 值；这次本地 400 不算供应商验收结果。
4. 将 resolution 改为 `1k` 后再次从网页运行。
5. 真实上游 endpoint：`https://api.nano-gpt.com/api/v1/images`。
6. 上游返回 HTTP 401：
   - message: `Invalid session`
   - code: `invalid_api_key`
7. 前端显示真实上游错误，运行按钮恢复，没有图片、没有成功历史，也没有改模型或改供应商重试。

## 判定边界

当前只证明 NanoGPT 路由已接到真实上游、模型级 resolution 校验生效，以及鉴权错误透明展示。凭据修复后仍需使用新的参考作品参数做一次完整生成与原图对比。

本轮 Prompt 属于用户新增“每家更换完整参考参数”规则之前的旧样本；不得在后续供应商继续复用。

### 2026-10-12 接线修复提交范围

本地 incoming 提交 `72f5372`（`fix: 对齐已复现的供应商接线并保留未验收边界`）的记录保留如上。提交主题不等于本文件列出的待修复项全部完成；官方契约复审、历史接线证据与生成验收分别记录，验收等级仍为 **BLOCKED_AUTH**。
