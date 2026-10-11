# T7 Grok 兼容中转 验收报告 — PASS_GENERATION

## 2026-10-12 契约复审与等级边界

保留 2026-10-11 历史请求/响应/媒体/截图，不新增 PASS。历史单例仅为所记第三方中转 `grok-imagine-image` + 1k 单张文生图；本轮未从 agent-117 日志恢复其原始生成响应，未调用付费生成/上传。xAI 官方契约仅作协议基线，不证明该中转所有模型、编辑、视频、参数能力相同。

### 已实际读到的官方正文

旧 agent-117 的 curl 结果检查到 docs.x.ai HTTP 200，随后已亲读保存的正文，不以下载字节数作契约依据：

- [Images REST](https://docs.x.ai/developers/rest-api-reference/inference/images.md)：原文 `POST /v1/images/generations`，`Authorization: Bearer`，data[] 的 url / b64_json / mime_type。`server.ts:5526-5553` 的用户 Base URL、Bearer、单图解析匹配基本协议。
- [Image Editing](https://docs.x.ai/developers/model-capabilities/images/editing.md)：原文 “xAI API requires application/json”；curl 为 `image:{url:...,type:'image_url'}`。`server.ts:5532-5542` 匹配，不能误判其应 multipart。支持 URL/data URI/file_id；本站目前仅接单个 image_url，第三方该编辑 shape 未验。
- [Image Generation](https://docs.x.ai/developers/model-capabilities/images/generation.md)：原文 “n parameter (`1`–`10`)”；aspect_ratio 含 `21:9`, `5:2`, `2:1`, `1:2`, 手机宽高等。`providerSchema.ts:509,520` 却限制旧八值和最多 4。只读 valueStatus 对 21:9 实测 unsupported；服务端 n 未校验且只取第一图 (`server.ts:5529,5552,5571`)。
- 官方分歧：同 generation 指南 resolution 正文仅列 `1k` / `2k`，但 Images REST 与旧 [OpenAPI](https://docs.x.ai/openapi.json) enum 包含 `1.5k`。记录为官方内部分歧，不擅自删除 1.5k，不据此声称所有中转模型支持。
- [Videos REST](https://docs.x.ai/developers/rest-api-reference/inference/videos.md) 为本轮 you-contents 新读取：原文提交异步 request_id，`GET /v1/videos/{request_id}` 返回 pending/done/failed、video.url、respect_moderation；duration 1–15，resolution 480p/720p/1080p。`server.ts:4264-4301,4315-4339` 提交/轮询路径与基本 terminal shape 匹配，不暗切 provider。
- Videos REST aspect_ratio 明确九值含 21:9/5:2，不含 auto。当前 `providerSchema.ts:533` 复用图像八值，误允许 auto 又漏合法比例；只读 valueStatus 实测 auto=supported。
- 旧 OpenAPI 的 GetDeferredVideoResponse 含 `response` 包装，与 Videos REST 示例顶层 video 不同；当前 `server.ts:4321` 仅顶层。需要保留官方冲突及实测真实形状，不能凭一种官方示例外推第三方。失败 response/error 的原文应可追踪。
- `/api/models` `server.ts:3508-3511` 明示 lookup-only custom endpoint，不冒充实时远端目录；`GrokCompatDriver.ts:26-34` 的本地选项不证明任意中转已提供该模型。

### 待串行修复

1. HIGH：`GrokCompatDriver.ts:54-68,87-101` 不传 loras/seed/negative/steps 等显式用户参数、不传 custom_parameters；`server.ts:5522,4259` 再把官方未声明等同该中转不支持。至少保留非空 LoRA 意图，未知能力应显式送上游或记录本站限制，不能静默删。
2. HIGH：`server.ts:2365` model-schema 错指 ModelScope 且承诺 JSON 原样提交；图像/视频 builders `server.ts:5526-5533,4264-4268` 均不合并 JSON。建议统一安全自定义通道、覆盖前后值、真实 provider source，不改路由。
3. HIGH：`providerSchema.ts:509-535` 分离 image/video 的比例、数量与能力标签，去掉未经第三方验证的“该服务商不支持”推论；官方合法比例不能本地旧 enum 拦截。不要把 guide/REST 的 1.5k 分歧猜成不可用。
4. HIGH：`server.ts:5552-5588` 保存完整图片批次；`compatRelay.ts:19` 的 b64 固定 PNG 应尊重 xAI mime_type（例如 image/jpeg）。视频轮询应记录 raw body，针对已确认的顶层/包装形状兼容，不以 5 分钟超时证明集成失败或建议未经用户操作重复付费提交。
5. MEDIUM：`server.ts:5554-5556` 的 HTTP 200 无图只报通用错误，没有原始 body；视频已识别 HTTP 200 failed，但失败本地返回 500，必须同时保留上游实际 HTTP 状态 200，不能把两者混称。

### 未完成

第三方模型目录/能力、编辑、多图、视频/参考图/轮询、duration/ratio/resolution 的模型级约束、自定义 JSON、非空 LoRA 意图、无图和网络失败、历史刷新复用未验；没有视频产物。继续保留历史单例 PASS_GENERATION，不能外推全组接通。

## 2026-10-11 历史前端证据（保留）

日期：2026-10-11 (UTC+8)。真实前端 + 真实中转 API，专用独立无头浏览器驱动完整 UI 流程。

## 结论

**PASS_GENERATION** — 真实通过 Canvas 网页端在“API 设置”填入自定义中转 Base URL 与 API 密钥，在画布上选择“Grok 兼容中转”并指定模型 `grok-imagine-image`，在底模节点明确选择官方支持的 resolution `1k`，点击“运行工作流”。服务端向 `POST https://sub.alibb123.ccwu.cc/v1/images/generations` 发送请求，上游返回 HTTP 200 并携带图片数据，系统持久化至本地媒体存储并在画布 SaveImage 节点成功渲染。

## 证据链

1. **设置与鉴权**：
   - 目标执行引擎：`Grok 兼容中转` (`grok_compat`)
   - 中转 Base URL：`https://sub.alibb123.ccwu.cc/v1`
   - API 密钥掩码：`sk-aceb...8c12`
   - 密钥仅保存在当前测试浏览器的本地配置中，未硬编码至任何代码或环境配置。
2. **工作流节点与载荷**：
   - 选定底模：`grok-imagine-image`
   - 分辨率参数：`resolution: "1k"`（注：首次因保留旧工作流 `1024x1024 ( 1:1 )` 被服务端拦截并明确报错 400，在界面纠正为 `1k` 后通过，已同步修复 UI 使不兼容旧值与提示可见）
   - 提示词：`A tiny blue ceramic teapot with a yellow handle on a white table, product photo.`
   - 客户端路由：`POST /api/engine/grok_compat/generate`
3. **上游调用契约**：
   - 实际上游端点：`POST https://sub.alibb123.ccwu.cc/v1/images/generations`
   - 载荷参数：
     ```json
     {
       "prompt": "A tiny blue ceramic teapot with a yellow handle on a white table, product photo.",
       "model": "grok-imagine-image",
       "resolution": "1k",
       "n": 1
     }
     ```
   - 上游响应状态：**HTTP 200 OK**
4. **媒体持久化与历史**：
   - 媒体存储路径：`/api/media/d4d1bebabd2676a331015870a2efd495e002349419c0d6b5622a924f6986db86`
   - 本地媒体验证：HTTP 200，大小 111,603 字节，MIME 类型 `image/jpeg`，图像真实尺寸 1280x720。
   - 画布渲染：KSampler 与 SaveImage 节点成功展示黄色把手的蓝色茶壶生成图，支持点击放大看大图。
5. **截图与产物**：
   - 运行前配置：`temp/acceptance-20261011/compat-browser/grok-before.png`
   - 节点出图结果：`temp/acceptance-20261011/compat-browser/grok-result.png`
   - 画布整体视图：`temp/acceptance-20261011/compat-browser/grok-result-fit.png`
   - 查看大图灯箱：`temp/acceptance-20261011/compat-browser/grok-lightbox.png`
