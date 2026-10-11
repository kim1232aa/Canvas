# T7 Google Gemini 验收报告 — BLOCKED_CONFIG

## 2026-10-12 官方契约复审（不新增生成验收）

本轮只读代码与官方正文，不改生产代码、配置、测试，不调用付费生成/上传。agent-117 指定日志没有成功读取 Gemini 正文的结果证据、没有 Edit/Write；本节 Google 依据均为新读取。历史本地缺 key 400 保留，未检查当前凭据，不能断言此刻仍缺配置。

### 实际打开官方正文

- [generateContent API](https://ai.google.dev/api/generate-content)：`POST https://generativelanguage.googleapis.com/v1beta/{model=models/*}:generateContent`，Part 支持 `inlineData` 和 `fileData`。`server.ts:6714-6734` inlineData、SDK generateContent、imageConfig 路径匹配该 v1beta 契约；不需要轮询。
- 同页 ImageConfig 原文 “Supported values are `512`, `1K`, `2K`, `4K`”；aspectRatio 列出 14 个比例。官方 [v1beta discovery](https://generativelanguage.googleapis.com/$discovery/rest?version=v1beta) 本轮只读 urllib HTTP 200 重复确认这些字段（FetchURL 不能提取 JSON）。因此 `512` 不是仍未知的候选拼写，`512px` 是指南描述而非 API 字符串。
- 同页 GenerationConfig 原文 “`seed` integer. Optional. Seed used in decoding.” ImageConfig 没 seed 不等于 GenerationConfig 禁 seed。图像模型实际 seed 效果未实测，不能声称该生图路径“官方不支持/不生效”。
- [Gemini 3.1 Flash Image](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-image)：原文 “New support for 0.5K, 2K and 4K, default 1K”；稳定 model code `gemini-3.1-flash-image`、Image generation Supported，与 `GeminiDriver.ts:21` 一致。
- [Gemini 3 Pro Image](https://ai.google.dev/gemini-api/docs/models/gemini-3-pro-image)：稳定 model code `gemini-3-pro-image`、Image generation Supported，与 `GeminiDriver.ts:28` 一致。
- [deprecations](https://ai.google.dev/gemini-api/docs/deprecations)：`gemini-2.5-flash-image` Shutdown date **March 15, 2027**；两个 image-preview 为 June 25, 2026。当前 `providerSchema.ts:134` 写 2026-10-02 并经 `server.ts:6681` 拦截正式 2.5，是明确过时错误，不是用户要求换模型。
- [Imagen](https://ai.google.dev/gemini-api/docs/imagen)：原文 “It is now shut down and no longer available in the Gemini API.” 当前禁自动迁移/不走 generateImages 方向正确；不能将目录里误分类 Imagen 当作当前可生成模型。
- [Models](https://ai.google.dev/api/models)：models.list 分页为 `pageToken` / `nextPageToken`，模型 `supportedGenerationMethods` 声明可用方法。`server.ts:3114-3153` 用 x-goog-api-key 取第一页，却按名字 image/flash/pro 猜类别，未遍历分页、未用方法元数据。
- [当前图像指南](https://ai.google.dev/gemini-api/docs/image-generation) 默认文档已转 Interactions API；实际 generateContent 对应 [legacy guide](https://ai.google.dev/gemini-api/docs/generate-content/image-generation)。后者本轮 FetchURL 重定向失败，you-contents 成功：JS/REST 样例用 `responseFormat.image`，Java/Go/C# 仍用 `imageConfig`；标题仍有 “3.1 Pro Image”，而模型页为 `gemini-3-pro-image`。列明官方文档内部不一致，不猜表标题等同 model ID，也不暗换 API；v1beta reference/discovery 仍明确 imageConfig。

### 需串行修复

1. HIGH：`providerSchema.ts:134` 正式 2.5 下线日期改为本次官方 2027-03-15；保留 preview 已下线事实。只读实测 `modelStatus(...,'2026-10-12')` 当前返回 deprecated，与官方不符。
2. HIGH：`server.ts:6688-6692` 将 unverified 和 unsupported 一起 400，错误称“官方仅支持”。`Gemini 3 Pro + 4:3` 只读 valueStatus 实测 unverified；`512` 当前也标 unverified。建议仅明确不支持才拒绝，unknown 明示并保留发送；按 model-specific 依据标注 512。
3. HIGH：`providerSchema.ts:110-119`、`GeminiDriver.ts:16,100`、`server.ts:6675-6676` 错把 ImageConfig 无 seed 推导为整个 generateContent 不支持 seed。建议 generationConfig.seed 用户显式值透传并记录实际请求；不宣称可复现性/图像效果已验。其他未在文档出现的 LoRA/steps 等同样应标未核实，不能仅凭缺字段当全服务官方不支持。
4. HIGH：三个生成 Driver 中 Gemini (`GeminiDriver.ts:55-80`) 没传 custom_parameters，server 亦不合并；`server.ts:2365` 的“原样提交”承诺不实且 source 指向 ModelScope。建议统一显式自定义参数通道，记录覆盖，禁止路由覆盖；不可为测试绿改测试。
5. MEDIUM：`server.ts:6677-6678` 将本地仅接内联参考图说成 Google 官方仅接受 base64，Part.fileData 官方存在。建议错误改为“本站此路径尚未接入该输入”，再串行讨论 URL/fileData 接线，不自动上传。`server.ts:6739-6749` 只取第一张 inlineData、无图时未附候选/safety 原文；需保留真实空图/安全终态依据。
6. MEDIUM：目录取分页/方法元数据、响应错误正文：`server.ts:3157` 没读非 2xx body；`server.ts:6790` 的 SDK errorDetails/response.data 是否完整需针对所装 @google/genai 验证，不能声称完整原始 HTTP body 已透传。历史 parameterOmissions (`GeminiDriver.ts:58`, `server.ts:6766`) 当前已有合并改动，已检查且保留。

### 未完成

保持历史 BLOCKED_CONFIG，不升级 PASS。待有效配置后的前端文生图/参考图、512、正式 2.5、unknown 字段、显式 seed、无图/安全/网络失败、历史刷新与请求字段复核。官方 guide 的新旧示例冲突按版本记录；本轮不切 provider/model/endpoint，不生成、不上传。

## 2026-10-08 历史前端证据（保留）
日期：2026-10-08。验收方式：本地真实前端 `http://127.0.0.1:3000/`，通过浏览器点击工作流运行；不是终端直调 API。

## 结论

**BLOCKED_CONFIG**。前端真实提交到了本地 `/api/gemini/generate` 路由，但服务端在本地配置阶段返回 HTTP 400：`未配置 Google Gemini API Key。请在设置中配置 GEMINI_API_KEY。`

这不是上游 Gemini 的 HTTP 响应，不是余额不足，也不是图片生成成功。它证明的是：当前前端能选中 Gemini 生图节点、能提交 prompt / model / aspect_ratio / image_size，且本地错误被透明显示；但在配置 GEMINI_API_KEY 前不能判定 Gemini 上游接线或生成能力。

## 本次独立样本参数

- Prompt：`Isometric cutaway of a tiny retro-futurist ramen shop inside a red train carriage, rainy Tokyo platform outside, warm lantern light, precise miniature details, product-visualization clarity`
- Model：`gemini-3.1-flash-image`
- aspect_ratio：`4:3`
- image_size：`1K`
- Negative Prompt / Steps / CFG / Sampler / Seed / LoRA：Gemini 路由未发送，UI 也明确显示这些 ComfyUI 扩散参数不应伪装成 Gemini 字段。

## 前端证据链

1. 从真实网页添加 `Google Gemini 生图 (官方直连引擎)` 节点。
2. 选择模型 `gemini-3.1-flash-image`、aspect_ratio `4:3`、image_size `1K`。
3. 新增独立正向 Prompt 节点并连到 Gemini 节点的 positive 输入。
4. 点击网页 `运行工作流`。
5. 执行记录新增 `HTTP 400 · POST /api/gemini/generate`。
6. 请求体包含 prompt、model、aspect_ratio、image_size、workflowSnapshot；`loras: []`，没有旧 HF LoRA 被错误发送。
7. 完整响应体为本地配置错误：`未配置 Google Gemini API Key。请在设置中配置 GEMINI_API_KEY。`，`errorSource: local`，`executionTrace: []`。
8. KSampler / SaveImage / Gemini 节点均无图片输出，没有用旧图冒充本次结果。

## 边界

该结果只能记 `BLOCKED_CONFIG`。配置有效 GEMINI_API_KEY 后，需要用新的参考样本重新从前端运行，拿到真实上游响应后才能分类为 PASS_GENERATION、PASS_BILLING、BLOCKED_AUTH 或 FAIL_INTEGRATION。
