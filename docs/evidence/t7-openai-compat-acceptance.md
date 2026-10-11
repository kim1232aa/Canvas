# T7 OpenAI 兼容中转 验收报告 — PASS_GENERATION

## 2026-10-12 契约复审与等级边界

保留下方 2026-10-11 原始请求/响应/媒体/截图记录；其 PASS_GENERATION 仅限所记中转端点、model、单张文生图。本轮未重新生成，未从旧 agent-117 日志恢复到该出图的原始响应；不能将历史文档自身当新的官方证据，也不能扩大为编辑、多图、所有模型和当前代码均已通过。

### 官方正文与代码匹配

agent-117 wire 的 FetchURL **结果**已确认成功读取 [OpenAI JSON edits](https://developers.openai.com/api/reference/resources/images/methods/edit)：原文 “`images: array of object {file_id, image_url}`”、image_url 为 fully qualified URL 或 data URL；“For GPT image models, you can provide up to 16 images.” 当前 `server.ts:5446-5456` 单参考图转换 `images:[{image_url}]`、/images/edits JSON + Bearer 是正确的官方协议基线，不应误改回旧 image:string 或一概判 JSON edits 错误。但第三方中转是否接受该 JSON shape 未验。

旧 FetchURL generate 结果只提取到 background 段，不能当全文；已亲读旧 agent 后续 curl HTTP 200 保存并提取的 [generate 正文](https://developers.openai.com/api/reference/resources/images/methods/generate)（`temp/docs-g3/oa-gen.html.txt`）：

- 原文 “POST /images/generations”；官方 curl `Authorization: Bearer`。`server.ts:5438-5456` prompt/model、size/quality/output_format/background/moderation/n、用户 Base URL + Bearer 匹配协议基线。
- 原文 GPT image models “always return base64-encoded images”；`src/engines/compatRelay.ts:14-22` 解析 b64_json/url。url 兼容仅为第三方兼容实现，不能宣称 OpenAI GPT Image 官方返回 url。
- 原文 gpt-image-2 “arbitrary resolutions are supported as WIDTHxHEIGHT strings, for example 1536x864”，两边 divisible by 16、比例 1:3 至 3:1、其他像素/边限制。`providerSchema.ts:491` 却仅四值 enum，`server.ts:5432` 因此拒绝 1536x864。只读 tsx valueStatus 实测 unsupported。
- 原文 n 为 1–10。`OpenAICompatDriver.ts:58` 和 `server.ts:5444` 接受 n，但 `server.ts:5467,5485-5503` 只保存第一张，没有 recordAdditionalImages；批量返回其它图片被丢。
- `server.ts:841-864` 自定义 Base URL 必须同时自定义 key、缺配置不 fallback；`OpenAICompatDriver.ts:39-41` 对应 header。本组未读取/使用任何 key。
- `/api/models` `server.ts:3503-3506` 明示 custom endpoint lookup-only，不用静态模型冒充远端目录；`OpenAICompatDriver.ts:21-29` 固定选项仅是本地入口，不能外推任意用户中转都支持该模型。

### 待串行修复

1. HIGH：`server.ts:2365` 非 fal 的 model-schema source 错指 ModelScope，且“自定义 JSON 原样提交”不实。`OpenAICompatDriver.ts:43-67` / `server.ts:5438-5448` 不传/合并 custom_parameters，output_compression、user 等官方字段及用户自定义值无法到上游。建议安全合并 + 显式覆盖/省略记录，provider 对应来源；不默换 endpoint。
2. HIGH：`providerSchema.ts:491` 将尺寸固定 enum 改为带官方限制的自由 WIDTHxHEIGHT 输入；第三方能力未知必须交给真实上游，不能称“该中转官方仅支持四种值”。
3. HIGH：`server.ts:5467-5503` 持久化并返回 data[] 全部图片，分别保留真实 seed 或 null，不以起始 seed 编造。
4. HIGH：Driver `OpenAICompatDriver.ts:44-62` 丢显式 seed/negative_prompt/steps/cfg/sampler/scheduler/denoise 等；服务端对有限字段作不支持 gate (`server.ts:5431`)。官方 OpenAI 契约缺字段不证明第三方中转禁止，至少保留用户意图及本地省略原因，unknown 不得伪装为官方不支持。
5. MEDIUM：上游非 2xx `server.ts:5460-5463` 保留状态/body；HTTP 200 无图 `5467-5470` 只报通用错误未保留真实响应。建议无图、JSON 解析失败、持久化失败附原始响应/来源，不冒充成功。b64 mime 当前固定 PNG (`compatRelay.ts:19`) 对请求 jpeg/webp 不准确，需基于响应/格式校正并验实际媒体。

### 未完成

第三方提供的模型目录/能力契约、JSON 编辑、多图、自由尺寸、自定义字段/覆盖、参考图持久化/历史复用和错误终态均未验。本轮没有付费生成/上传；不提高等级，保留历史单例 PASS，不将余额不足当失败或出图。

## 2026-10-11 历史前端证据（保留）

日期：2026-10-11 (UTC+8)。真实前端 + 真实中转 API，专用独立无头浏览器驱动完整 UI 流程。

## 结论

**PASS_GENERATION** — 真实通过 Canvas 网页端在“API 设置”填入自定义中转 Base URL 与 API 密钥，在画布上选择“OpenAI 兼容中转”并指定模型 `gpt-image-2`，点击“运行工作流”。服务端按官方契约向 `POST https://sub.alibb123.ccwu.cc/v1/images/generations` 发送请求，上游返回 HTTP 200 并携带图片数据，系统通过 `requireDurableHistoryMediaUrl` 成功持久化至本地媒体存储并在画布 SaveImage 节点成功渲染。

## 证据链

1. **设置与鉴权**：
   - 目标执行引擎：`OpenAI 兼容中转` (`openai_compat`)
   - 中转 Base URL：`https://sub.alibb123.ccwu.cc/v1`
   - API 密钥掩码：`sk-30cd...b4c2`
   - 密钥仅保存在当前测试浏览器的本地配置中，未硬编码至任何代码或环境配置。
2. **工作流节点与载荷**：
   - 选定底模：`gpt-image-2`
   - 提示词：`A tiny blue ceramic teapot with a yellow handle on a white table, product photo.`
   - 客户端路由：`POST /api/engine/openai_compat/generate`
3. **上游调用契约**：
   - 实际上游端点：`POST https://sub.alibb123.ccwu.cc/v1/images/generations`
   - 上游响应状态：**HTTP 200 OK**
4. **媒体持久化与历史**：
   - 媒体存储路径：`/api/media/13b27430e4243820ab2b4cf9a0fe4b29e6b4add62d2be62d6fb2738fb09410de`
   - 本地媒体验证：HTTP 200，大小 1,682,048 字节，MIME 类型 `image/png`。
   - 画布渲染：SaveImage 节点与历史面板成功展示生成的蓝色黄把手小茶壶图片。
5. **截图与产物**：
   - 运行前配置：`temp/acceptance-20261011/compat-browser/openai-before.png`
   - 画布出图结果：`temp/acceptance-20261011/compat-browser/openai-result.png`
   - 生成历史记录：`temp/acceptance-20261011/compat-browser/openai-history.png`
