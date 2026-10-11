# T7 Fal.ai 验收报告 — PASS_BILLING

## origin/main 保留记录：2026-10-06 flux-lora 验收

日期：2026-10-06。验收方式：真实前端。

## 结论

**PASS_BILLING**。前端显式选择 Fal，模型为 `fal-ai/flux-lora`，挂载完整 HTTP(S) LoRA URL，并从网页运行工作流。真实上游返回 HTTP 403，业务原文为 `User is locked. Reason: TOP_UP.`。

这证明当前 Fal 路由、LoRA path/scale 接线和错误透传成立；它不是图片生成成功。

## 关键事实

- Provider：`fal`
- 模型：`fal-ai/flux-lora`
- LoRA：完整 Hugging Face safetensors URL
- LoRA strength：0.8
- 实际目标：Fal `fal-ai/flux-lora` 路由
- 上游终态：403 TOP_UP
- 没有失败后静默切换 provider/model/key，也没有假图片。

## incoming 72f5372 保留记录：图生图与 Kling V3 图生视频均已到计费终态，未出图

以上 origin/main 记录仅限 2026-10-06 `fal-ai/flux-lora` 请求；以下 incoming 72f5372 记录按各自日期和端点保留。2026-10-10 的 URL 输入路径复验不改写 2026-10-09 本地上传路径的历史 BLOCKED_UI；2026-10-12 的官方契约复审与接线核对未调用生成/上传，不新增生成成功或提高验收等级。

## 2026-10-12 官方契约复审（只读代码，未调用生成/上传）

本轮接续 agent-115：检查其 wire 的工具结果而非只看调用，成功正文可继承；旧 agent 没有 Edit/Write 或最终交付，只保存了 `temp/doccheck-fal/` 的官方 Schema。历史 403 与 PASS_BILLING 不升为生成成功。

### 官方正文与当前接线

- 新读 https://fal.ai/docs/platform-apis/v1/models.md ：“`openapi-3.0 — full OpenAPI 3.0 schema in the openapi field`”；目录 GET `/v1/models`、q/category/status/cursor 与 `server.ts:2366-2375,2879-2907` 匹配。官方 `openapi` 也可能是 expansion_failed 错误对象；当前 `2369-2375` 未检查这种结构，可能返回 200 且 inputSchema 缺失。
- 继承旧成功正文 https://docs.fal.ai/model-apis/model-endpoints/synchronous-requests ：“`There is no queue and no status polling`”。`server.ts:3700,4442` 同步 `fal.run` 合法，不把缺 queue 判作错误。旧成功 OpenAPI https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/flux-lora 的 LoRA 是 `{path,scale}`；图像请求 `server.ts:3690-3707` 与 Key 鉴权匹配。
- 新读 https://fal.ai/models/fal-ai/flux/dev/image-to-image/api ：必填 `image_url`、`prompt`；`strength`，输出 `images` 与实际 `seed`。`server.ts:3666-3673,3731-3735` 核心映射匹配；该 Input 没列 image_size/scheduler/negative_prompt/loras，缺字段不等于明示禁止，仍须保持 unknown，403 不证明接受。
- 新读 https://fal.ai/models/fal-ai/kling-video/v3/standard/image-to-video/api ：“`start_image_url ... required`”；duration 3–15，输出 `video.url`。`falVideoContract.ts:46-60,86-105` 与 `server.ts:4466-4469` 匹配；cfg→cfg_scale 与当前 `providerSchema.ts:243-245` 匹配。音频、多镜头、实际视频结果未验。

### 串行待修（本轮不修改生产代码）

- HIGH：`server.ts:2942-2959` 对 Promise.allSettled 的 rejected 分支不处理；所有目录网络请求 reject 时会返回空数组，而非网络错误。建议显式记录 rejected.reason / status:null / endpoint / stack，不填静态模型。
- HIGH：`FalDriver.ts:99` 发送 sampler_name，但 `server.ts:3599-3696` 没映射或未发送记录；显式画布采样器静默丢失。建议记录原值/原因，或按所选实时 Schema 公开映射；不要把未知称不支持。
- MEDIUM：`providerSchema.ts:179-269` 没有两个 FLUX image-to-image 项，而服务端已可提交；图生图能力保持未核实，不凭 text-to-image 项外推。`server.ts:3667` 按端点后缀阻止参考图，不适用于所有动态编辑端点，建议实时 Schema 解析而非后缀推断。
- MEDIUM：`server.ts:4457-4458` 只要 body 包含 Exhausted balance 就把文案写成 [403]，实际 HTTP 可能非403；建议插入 `upstreamResp.status`，不改真实状态。

定向现有测试 5 files / 31 tests PASS（FalDriver、falVideoContract、falVideoRequest、schemaProviders、schemaProviderWireReview）；仅本地回归，非上游验收。未做全量 build/lint 或网页生成；仍待真实图像/视频、参数接受性、效果、刷新/复用/云项目。

## 2026-10-10 当前前端复验（独立无头 Chrome 151 / CDP 9411）

- **F1 `fal-ai/flux/dev/image-to-image`：`PASS_BILLING`（限定路由与请求）**。真实网页连接 LoadImage → KSampler `latent_image`，上游 `https://fal.run/fal-ai/flux/dev/image-to-image`。实际请求含 `image_url=https://picsum.photos/id/1005/512/512.jpg`、`strength=1`、人物照片油画转换 prompt、steps=4、guidance=1、seed=12345678、num_images=1，以及 scheduler=normal。HTTP 403，原文 `{"detail":"User is locked. Reason: TOP_UP."}`；未生成图片、未新增成功历史。
- **F1 初次尝试无效部分保留**：LoadImage 只接 CLIP 的 image 入口，KSampler 分支实际未抽取到参考图，第一次请求没有 image_url。随后将参考图接入执行节点，才在第二次实际上游请求里看到 image_url/strength。第一次欠费响应不能证明参考图透传。
- **K1 `fal-ai/kling-video/v3/standard/image-to-video`：`PASS_BILLING`（限定路由与请求）**。真实网页 AIVideoNode 显式选 Fal/Kling、参考图接 init_image、海风与推镜 prompt、duration=5。本站 `image_url` 转成上游 `start_image_url`，`duration` 转字符串 `"5"`；上游 `https://fal.run/fal-ai/kling-video/v3/standard/image-to-video` HTTP 403，同样 TOP_UP，约 1.565s。没有 accepted/task/video，不能证明轮询、视频播放或存储。
- 两项失败都展示实际 endpoint/status/body/errorSource=upstream，没有换 provider/model/key 重提兜底；之前的 BLOCKED_UI 是历史状态，不再作为当前这两条 URL 输入路径的阻塞。
- 官方原文已 FetchURL 核对：[FLUX dev 图生图](https://fal.ai/models/fal-ai/flux/dev/image-to-image/api)、[Kling V3 图生视频](https://fal.ai/models/fal-ai/kling-video/v3/standard/image-to-video/api)。图生图官方参数表没有列 scheduler；该字段本轮仍发送，403 计费校验不能证明其接受性，不据此宣称所有参数已正确验证。
- 临时证据：`temp/fal/log2-raw.txt`、`temp/fal/log3-raw.txt`。未验：真实结果、图生图强度效果、Kling 音频/终态/历史、空间模式与云项目；不能把 PASS_BILLING 写成完整供应商集成完毕。

## 以下为历史记录

## 2026-10-09 当前连接修复状态（后续修复，优先于下文历史）

本轮只修已确定连接域，不证明 Fal 所有端点/模式通过。新增修复记 `CODE_ONLY / CONTRACT_TESTED`，没有新的生成或余额终态；下文 10-06 `PASS_BILLING` 和 10-09 13:30 F1/K1 `BLOCKED_UI` 是各自当时实测，原文保留。新增源码上传控件不能直接把旧 `BLOCKED_UI` 改成已解除。

### 确定错误与当前源码

- 根因：此前 graph→VideoDriver 发送上游字段 `start_image_url`，本站只读取 `image_url`，导致参考图丢失。当前 `src/engines/drivers/VideoDriver.ts` 使用本站 `image_url`；`src/server/falVideoContract.ts` 的 `buildFalVideoRequest` 兼容旧 `start_image_url`，两者不一致拒绝；最终 Kling V3 image-to-video wire 才由 builder 生成 `start_image_url`，不残留 `image_url`。这是站内/上游两层契约，不可只看站内字段就判错。
- builder 返回 `beforeCustom / customParameters / overrides / payload / fieldStatus`；custom video JSON 保留未知字段并追踪覆盖前后值，路由/model 不可被 JSON 覆盖。只有明确 unsupported 才拒绝，未声明字段保持 unknown/unverified，不笼统称不支持。
- `src/utils/frontendParameters.ts` 空间请求只取显式 `referenceImageUrl`；展示结果 `imageUrl` 不自动输入。`SpatialFrameItem` 明确点击「图生视频」才把 result 写为首帧；端点与 provider 仍需显式选择并完整验链。
- `src/components/NodeItem.tsx` 当前源码已有 `input type="file"`。这是源码检查，不是新浏览器上传成功证据；F1/K1 旧截图和卡点不得抹掉。

### 本轮官方证据（实际 WebSearch + 官方原文阅读）

- [Fal 同步请求](https://docs.fal.ai/model-apis/model-endpoints/synchronous-requests)：原文明确 `run` 直接请求 `fal.run`，无 queue、无 status polling；`subscribe` 才在内部使用 queue。**撤销「未用 queue = 接线错」推论**；队列可靠性建议不等于禁止同步请求。
- [Kling V3 standard image-to-video API](https://fal.ai/models/fal-ai/kling-video/v3/standard/image-to-video/api)：Input 明确必填 `start_image_url`，duration enum 为 3–15 秒；本轮源码契约映射依据此文，不是凭模型名猜字段。此文不能证明其他 Kling 版本相同。
- 检索实际调用内置 WebSearch；Civitai 独立资料另调用 Google Grounding。上述两页通过 FetchURL 读取原文，未调用 provider 生成 API。保留历史 payload false/失败请求事实，代码修正不倒写成历史请求已正确。

### 验证与下一步（待主 agent 填真实结果）

主 agent 最终 fresh 回传：`npm run lint` 退出 0；`npm test` 61 files / 497 tests 全 PASS，无 localStorage stderr；frontend + hosting Worker build 成功；`git diff --check` 退出 0。既有 Vite `__dirname`、dynamic import 无效、>500KB chunk 警告保留。49/383、55/453 仅为历史轮次，不作最终数量；仍非 Fal 生成证据。

review42 已 close；review53 原 2 MEDIUM、review54 final 3 HIGH + quantity MEDIUM 全 close；review55 最后 3 must-fix 闭环，定向 24+4 PASS。此前 cloud JSON UI→extract、上传键盘、duration/FPS legacy clear、空 video provider 不猜等指定 scope 已修/独立复审关闭，旧 review43 scope close，不宣称 hooks ESLint。Fal 9:16 actual width=720/height=1280、quantity 3/0 三路径一致为本地契约证据，不是上游接受性证明。

主 agent pm2 restart canvas 成功，PID 176587 / restarts 11；fresh 本地 health online / uptime 14s / history 8 / executionTrace=[]，主页 HTTP 200；未公开 deploy、未 commit/push，不声明公开站同步。Chrome 154 / CDP 9224 refresh 最新 loaded；原 native upload focus @ref 实测 activeElement BUTTON / label「上传本地图片」/ tabIndex 0，确认焦点可达，未实际上传生成。performance generationRequests=[]，本轮无生成/付费；历史 F1/K1 BLOCKED_UI 不倒写成成功。

- F1/K1 当前前端上传控件可见、实际上传与连线，真实点击生成或明确余额终态：**待验**。
- Kling 站内 image_url→builder start_image_url、双输入冲突本地拒绝、JSON 覆盖实际 wire、text-to-video 参考图拒绝：**最终版本前端待验**（不能仅凭契约单测升 PASS）。
- referenceImageUrl 图生图/结果显式图生视频整链、历史记录、刷新、复用与云端项目：**待验**。
- 本轮没有 Fal 新图片/视频，不记 PASS_GENERATION；10-06 flux-lora TOP_UP PASS_BILLING 仍只限原请求。

---

## 以下为保留的历史验收记录

日期:2026-10-06(UTC+8)。验收方式:真实前端 ComfyCanvas Studio @ 127.0.0.1:3000 + 真实 Fal.ai API，通过 CDP 驱动完整 UI 流程；不是终端直调 API。

## 结论

**PASS_BILLING** — 页面选择 Fal.ai、底模 `fal-ai/flux-lora`，从独立 LoRA 中心挂载公开 Hugging Face safetensors URL，点击网页「运行工作流」后真实请求到达 `https://fal.run/fal-ai/flux-lora`。上游返回 **HTTP 403 Forbidden**，业务原文为 `User is locked. Reason: TOP_UP.`；前端执行记录准确显示上游状态、响应体、端点和 stack，无 provider/model/endpoint 自动切换，无假图片和成功历史。

## 官方契约核实

Fal 官方 `fal-ai/flux-lora` API 文档本轮重新核实：支持 `prompt`、`image_size`、`num_inference_steps`、`seed`、`guidance_scale` 和 `loras`；LoRA 元素为 `{path, scale}`，其中 path 是 LoRA 权重 URL 或路径。来源:https://fal.ai/models/fal-ai/flux-lora/api 。

## 证据链

1. 模型中心显式选择 Provider=Fal.ai，按自定义原始 ID 选用 `fal-ai/flux-lora`；节点保持 `targetProvider=fal`，没有按模型名改到其他供应商。
2. LoRA 中心切到 Fal.ai，输入公开权重 URL:
   `https://huggingface.co/XLabs-AI/flux-lora-collection/resolve/main/realism_lora.safetensors`。
3. 修复 LoRA Hub URL 导入缺陷后，完整 `https://...` 不再被误当 Hugging Face Repo ID 查询，而是作为 Fal LoRA path 原样挂载；强度 0.8。
4. 同轮修复删除已挂载 LoRA 会断开 MODEL/CLIP 链的问题；前端实测「挂载→删除」后自动恢复 `Checkpoint MODEL → KSampler` 与 `Checkpoint CLIP → Prompt`，再挂载一次后只保留 1 个 LoRA。
5. 最终画布样本: model=`fal-ai/flux-lora`；prompt 为当前画布正向提示词；seed=42；steps=8；LoRA path 如上；strength=0.8。
6. 点击网页「运行工作流」一次；客户端 `POST /api/fal/generate`，服务端实际上游请求:
   - endpoint: `https://fal.run/fal-ai/flux-lora`
   - requestBody.prompt: 当前画布提示词
   - `num_images:1`
   - `num_inference_steps:8`
   - `seed:42`
   - `loras:[{"path":"https://huggingface.co/XLabs-AI/flux-lora-collection/resolve/main/realism_lora.safetensors","scale":0.8}]`
7. 上游真实响应:
   - status: **403 Forbidden**
   - responseBody: `{"detail":"User is locked. Reason: TOP_UP."}`
   - errorSource: `upstream`
   - 网站 HTTP 同为 403
8. 页面执行记录保留了 endpoint、requestBody、status/statusText、responseBody、掩码 key、duration 和完整异常栈。失败后「运行工作流」按钮恢复可用，没有生成图片、没有写成成功。

## 判定边界

本次只证明 Fal `fal-ai/flux-lora` 路由的前端接线、LoRA 参数透传和计费限制展示正确，因此记 **PASS_BILLING**。账户充值前没有真实图片，不能把它写成 PASS_GENERATION，也不能据此证明 Fal 其他模型、视频、图生图或 LoRA 权重实际推理效果全部通过。

## 本轮同时修复的产品缺陷

- LoRA Hub 自定义导入:完整 HTTP(S) URL 在已选供应商标签下作为原始 LoRA path 保留，不再误走 HF Repo 详情查询。
- HF Repo 作为用户明确 LoRA 意图时，不再因为 Hub 元数据缺少 LoRA 标签就本地拒绝；上游能力仍由实际执行端点验证。
- 删除已挂载 LoRA:新增图结构复连，恢复 MODEL/CLIP 上下游；对应 `src/utils/attachLora.test.ts` 回归测试通过。


## 2026-10-09 接线修复后前端复验

记录时间：2026-10-09 13:25 北京时间（CST）。仓库 HEAD `d75d1d4`，工作区有未提交改动。环境：本地 127.0.0.1:3000，画布「验收-接线-2」。

### F1 Fal 图生图 — BLOCKED_UI

- 结论：BLOCKED_UI。未点击「运行工作流」，未发出任何本地或上游请求，未消耗 Fal 额度。
- 页面：http://127.0.0.1:3000/，标签 t14，画布「验收-接线-2」，北京时间 2026-10-09 13:30 CST。
- 已完成的真实点击：Provider 切换为 Fal.ai；模型 ID 输入 `fal-ai/flux-lora`；添加 Load Image 节点；参考图 `/tmp/canvas-acceptance-2026-10-09/ref-small.png`（512x384，204,683 字节，由 1024x768 探测图缩小生成）已生成。
- 卡点：Load Image 节点在本页面只暴露「输入图像 URL 或从资产库选择」文本框，弹层仅有 "Loaded Reference" 预览，未找到本地文件上传控件（页面无 `input[type=file]`）。在不改 DOM、不换 URL 的约束下无法把参考图放入节点。
- 误操作记录：一次点击把 Load Image 节点折叠，已展开恢复，未改动节点内容。
- 截图：`docs/evidence/t7-fal-2026-10-09-F1.jpg`（原图 `/tmp/canvas-acceptance-2026-10-09/f1-urlfocus.jpg`，2358x1358）。
- 后续需做：提供可用的本地上传入口或允许使用资产库中的参考图后，再执行：`fal-ai/flux-lora` 本地 400 校验；再切换 `fal-ai/flux-lora/image-to-image` 真实提交 1 次，核对上游 `https://fal.run/fal-ai/flux-lora/image-to-image` 与 `image_url`。

### K1 Kling V3 图生视频 — BLOCKED_UI

- 结论：BLOCKED_UI。未执行，未打上游。
- 原因：K1 需要同一张参考图（start_image_url），与 F1 共用同一卡点：页面 Load Image 节点无本地上传控件，无法把参考图放入节点。
- 后续需做：解决 F1 的上传入口问题后，选择 `fal-ai/kling-video/v3/standard/image-to-video`，时长 5 秒，不设画幅，真实提交 1 次；核对 `start_image_url`、`"duration":"5"`，且不含 `image_url`、`aspect_ratio`；再做 2 秒本地 400 与 text-to-video 参考图本地拦截两项校验。

### 未验证阶段

本轮所有 Fal 阶段（图生图、LoRA、历史、刷新、云端项目）均未验证。既有 PASS_BILLING 结论（2026-10-06，403 TOP_UP）未被本轮改写。
