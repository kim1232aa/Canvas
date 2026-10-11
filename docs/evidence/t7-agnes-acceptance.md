# T7 Agnes AI 验收报告 — BLOCKED_CONFIG（2026-10-08 历史配置验收）

验收范围按日期分别保留：2026-10-08 的本地配置阻塞不代表后续样本结果；2026-10-10 图像仅限精确样本通过，视频仍受上游队列阻塞；2026-10-12 官方契约续审仅为只读诊断、无生成，不提高验收等级。

## 2026-10-12 官方契约续审（只读代码、无生成）

- 恢复 agent-113：指定 wire 中 38 次实际工具调用，无 Edit/Write；仅另建 `temp/provider-audit-agnes-sn/` 下载官方正文。其 FetchURL 成功结果与 curl HTTP 200 已检查，不把调用本身当成功。该 agent 被取消，没有最终交付或生产代码改动。本次保留当前所有未提交改动与下方历史请求/响应，不提高生成验收等级。
- 本次重新 FetchURL 打开 [Image 2.5 Flash](https://wiki.agnes-ai.com/en/docs/agnes-image-25-flash.md)：原文 `POST https://apihub.agnes-ai.com/v1/images/generations`、`Authorization: Bearer YOUR_API_KEY`、`Required parameters are model, prompt, and size`、`Provide input ... in extra_body.image`，结果 `data[0].url` / `data[0].b64_json`。`server.ts:4883–4913` 的 size、顶层 ratio、单图 extra_body.image 与解析匹配；官方参数表顶层 image 与示例 extra_body.image 的分歧仍存在。官方还声明多参考图、return_base64、extra_body.response_format；本地 Driver/route 未完整接通这些输入。
- 本次重新打开 [Video 2.5](https://wiki.agnes-ai.com/en/docs/agnes-video-25.md) 与 [Flash](https://wiki.agnes-ai.com/en/docs/agnes-video-25-flash.md)：原文 `Save video_id ... id and task_id identify the asynchronous task`；`Treat status and url as the source of truth ... only when status is completed`。`server.ts:4148–4205` 使用 POST /v1/videos、根路径 GET /agnesapi 带 video_id/model_name、Bearer 与 completed+url，契约匹配。普通 size 为720P/1080P/1K/2K，Flash只720P；Flash图最多5、音最多3、非空视频不支持。`agnesVideoRequest.ts:36–66` 对这些已知模型规则匹配。Flash自身16:9表为1280×704，不能套普通视频1280×720；文件实际像素才是事实。
- 本次打开 [官方模型参考源码](https://raw.githubusercontent.com/AgnesAI-Labs/skills/main/agnes-ai-models/references/model_catalog.md)：原文 `Image generation and editing`、`Text-to-image, image-to-image, multi-image composition`；它是日期标明的公共参考，不是账户实时目录。`server.ts:3513–3516` 空目录提示“专属视频服务/暂无公开检索目录”错误，公开图像/视频模型参考真实存在。不得把参考表冒充已鉴权实时目录，也不得据此猜测一个 GET /models 契约。

### 需串行修复（本组未改生产代码）

1. **HIGH，自定义参数静默丢失**：`AgnesDriver.ts:115–124` 没有携带图像 `extraParams.custom_parameters`；`server.ts:4883–4894` 重建固定 payload，忽略官方 extra_body、return_base64、多图 images/image 及自定义字段；`server.ts:2365` 却声称自定义 JSON 原样提交且 source 错填 ModelScope。建议图像分支按视频 builder 的边界保护建立显式映射/覆盖记录，保留未知手写字段、非空 LoRA 意图，不改 provider/model/endpoint；Schema 未取得时返回本供应商真实来源与准确接线状态。
2. **HIGH，未声明被写成不支持**：`providerSchema.ts:395`、`server.ts:4880–4881` 仅依据文档未列就把 seed/扩散字段标 unsupported 并 gate。建议区分明确官方拒绝与未核实；未知手写字段送上游取得事实，普通画布匹配省略须可见可关闭。视频旧真实400空loras/resolution证据不能外推到所有模型/所有字段。
3. **MEDIUM，图像记录缺失**：`server.ts:4931–4949` 未保存 workflowSnapshot、actualParameters、parameterOmissions，也未回 actualRequest；Driver已产生 omissions但路由不存，不能声称历史完整公开。建议把原始请求、实际payload、端点和省略记录并入历史及响应，未发送值不记生效。
4. **MEDIUM，目录描述错误**：修正上述 /api/models 专属视频措辞；如提供官方静态参考须明确 source/date/catalogAvailable，不伪称动态目录。Driver视频描述固定5秒、defaultSteps/defaultCfg（`AgnesDriver.ts:48–60`）与官方4–12秒及无这些可配置字段不符；移除误导的元数据，不据此改已存画布值。
5. **MEDIUM，错误分类/轮询健壮性**：`server.ts:4161,4189–4211,4248,4909,4952` 多数只返拼接error，没有一致的结构化 rawResponse/endpoint/errorSource/stack；upstream trace可能保留额外证据，不能说原文完全丢失。官方建议网络超时/429 backoff，当前轮询任一429立即终止。建议保留原始HTTP/失败任务/协议异常、超时时带videoId，别把已有HTTP协议错误归无响应网络错误；不改变生成路由或自动重生成。

验证：现有定向回归共6 files /57 tests通过（包含本组及SenseNova UI），仍有Vite `__dirname`警告。进程内假fetch（明确本地 mock，未调用上游）确认 Agnes图像 custom_parameters 未进入本站请求。仅契约诊断，不是生成证据；本轮未运行完整build/lint、未重启、未付费生成/上传。视频终态、参考模式、存储/历史/刷新/云链仍待验，旧503队列阻碍未重新探测。

## 2026-10-10 当前真实结果（优先于后文历史标签）

### 图像

- Image 2.5 Flash 文生图：英文雪豹 prompt 和中文 `一只橘猫`，均真实上游 `/v1/images/generations` HTTP 200，size=2K、ratio=1:1，输出 PNG 2048×2048。历史 `hist_1791559517366_ju49p` / `hist_1791559638948_05734`；分别媒体 hash `89d2fa7d706687ad57df7f74ece877f0ce230a26e21ef2ae983119383ba77f59` / `2660d45028896ddbbd68cf4d0fa822214780457e73e2b8753c18c4fbc418b7f2`。主 agent 下载读图 `temp/agnes/t2i-compare.jpg`，主体分别是雪豹和橘猫。Gemini agent 在取证途中因模型网关 Invalid thought signature 失败；主 agent 仅恢复已有请求/图片，没有为补报告再生成。这只说明本次两条样本正确，不能推翻历史 `小猫咪` 出小孩的事实或断言短中文总稳定。
- 图生图：人物背影参考 `https://picsum.photos/id/1005/512/512.jpg`，指令保持人物与构图、改成水彩，真实网页 `/api/engine/agnes/generate` → `https://apihub.agnes-ai.com/v1/images/generations` HTTP 200，实际 `extra_body.image=[参考URL]`，size=2K/ratio=1:1。结果 `hist_1791556678562_kjhaz`、hash `220d6eac436ffea6bf0ea338af38aa89362dea76f76180754195b07afd9e3989`；对比 `temp/repair-browser/compare.jpg` 显示相同人物/構图改为水彩。本站返回 `/api/media/...`，浏览器后续 GET 200，缓存 15KB、内联媒体0。本次证明示例字段 extra_body.image 可被接受，不证明顶层 image 写法。
- 曾用黑狗参考配战士女孩 prompt 的请求是**验收样本错误**；即使上游 200 也不作为人物保持或编辑逻辑通过依据。后来的相关人物样本才作有效编辑证据。

### 视频与字段修复

- 本轮实际 WebSearch 检索，FetchURL 读取[普通视频](https://wiki.agnes-ai.com/en/docs/agnes-video-25.md)与[Flash](https://wiki.agnes-ai.com/en/docs/agnes-video-25-flash.md)：正式字段是 `size`，普通允许 720P/1080P/1K/2K，Flash只允许720P；seconds为4–12字符串、mode和媒体必须匹配，seed支持。
- 真实网页先出现两个上游 HTTP 400：`loras is not an allowed request field`（空数组）和 `resolution is not an allowed request field`。`AgnesDriver.ts` 后续改为空LoRA不发，非空LoRA不静默删；节点resolution在视频driver公开映射成size，size/resolution冲突本地报错，显式JSON保持独立覆盖。此修复不等于后端收到任意 resolution JSON 都会隐式改写。
- 修复后客户端选择 Agnes Flash、节点resolution=720P、duration=5、aspect_ratio=16:9、text模式、无参考图。真实 wire 为 `{model:"agnes-video-2.5-flash",prompt:"一只橘猫在雨后的街道上慢慢走过，镜头平稳跟拍，霓虹灯倒影，电影感",seconds:"5",aspect_ratio:"16:9",size:"720P",mode:"text"}`，没有loras/resolution。
- `/v1/videos` 连续手动前端尝试返回 HTTP 503、业务码 `video_queue_full`，没有video_id，没有生成或轮询。16:07、16:11、16:17、16:22 UTC的真实请求号分别保存于 `temp/agnes/v3-raw.txt` 至 `v5-raw.txt` 等记录；修复后最后一次 `20261009162214517502865CJwZtDxj`。**`BLOCKED_UPSTREAM_QUEUE`**，不是PASS_BILLING、不是PASS_GENERATION，不把接受前排队失败写作视频功能完整可用。
- 未验：Flash keyframe/reference、普通视频真实终态、视频seed回显、历史/播放/存储、空间模式及云项目。当前修复正在独立复审，不能用测试绿关闭上游队列或这些未验项。

## 以下为历史记录

## 2026-10-09 当前后续修复（优先于下文历史标签）

本节描述后续连接域修复，**本轮未运行、未生成，只记 `CODE_ONLY / CONTRACT_TESTED`**。下文旧 10-08 `BLOCKED_CONFIG`、10-09 A1 `PASS_WIRE`、A2 队列满、A3 直调探测均保留原时间/样本/验证层级，不升级 PASS_GENERATION，也不抹掉历史 payload false/未发送值。

- 当前 `src/utils/frontendParameters.ts`：Agnes 已指定 size 时省略 width/height，同时 `extra.omissions` 保存每项原值与原因；`src/engines/drivers/AgnesDriver.ts` 合并该 omissions 与 Driver 未提交字段并按 field 去重。这使未发送参数可追踪，不把 UI width/height 写作上游实际尺寸。
- 空间请求只取 `referenceImageUrl`；`frame.imageUrl` 是展示结果，不自动变 input。`SpatialFrameItem` 的「图生视频」明确点击写入 result 作为 `referenceImageUrl` 首帧，普通切到视频不自动使用展示图。后续正确 provider/model、提交、视频终态、历史刷新仍未验。
- Agnes 预设参考图必须显式选择，预览不作为编辑输入；其他供应商不因这项修复宣称全量已修。

### 实际官方检索与原文

本轮实际内置 WebSearch 找到 Agnes 官方页，并 FetchURL 阅读 [Agnes Image 2.5 Flash](https://wiki.agnes-ai.com/en/docs/agnes-image-25-flash.md)。原文明确 `POST /v1/images/generations`，size 必填，推荐 1K–4K、ratio 顶层；legacy exact-size 可能归一化。例子与 Important Notes 的图生图输入使用 `extra_body.image`，支持 URL/Data URI。

**原文存在表述分歧**：Request Parameters 表列顶层 `image`，但 Important Notes、图生图示例、Checklist 均写 `extra_body.image`。本站当前沿用后者；本文不伪称官方全篇无歧义，输入位置仍需真实前端整链证据。官方仅列字段不等于所有未列通用字段都是 unsupported；本轮 omissions 是公开匹配与未发送记录，不是未知能力一概拒绝。

### 验证与待验

- **最终 fresh 本地回归（主 agent 回传）**：lint 退出 0；61 files / 497 tests 全 PASS，无 localStorage stderr；frontend + hosting Worker build 成功；git diff --check 退出 0。既有 Vite `__dirname`、dynamic import 无效、>500KB chunk 警告保留；49/383、55/453 只作历史。`CODE_ONLY / CONTRACT_TESTED`，真实生成验收仍 PARTIAL。
- review42 已 close；review53（Agnes/Gemini metadata + strict field types）原 2 MEDIUM、review54 final 3 HIGH + quantity MEDIUM 全 close；review55 最后 3 must-fix 闭环，定向 24+4 PASS；旧 review43 指定 scope close，不宣称 hooks ESLint。此前 Agnes advanced/resolution、Civitai video dispatch、专用 cloud JSON、上传键盘、legacy duration/FPS、空 video provider、Gemini omissions history metadata 等指定项已本地契约修复/独立复审关闭，不再列待修。
- EngineRegistry 按显式 provider 分派 Agnes video advanced；advanced mode explicit、/videos media 约束、严格类型先拒绝 false/array/object；Agnes checkpoint sink/检查器共享 owner；URL-like 文本 sanitize 不抛 InvalidURL。Gemini omissions 合并 history metadata，不进 SDK wire；quantity 3/0 三路径一致。以上不证明未知 resolution 上游接受性；官方输入位置矛盾仍保留待真实验证。
- 主 agent pm2 restart canvas 成功，PID 176587 / restarts 11；fresh 本地 health online / uptime 14s / history 8 / executionTrace=[]、主页 HTTP 200；未公开 deploy、未 commit/push，不声明公开站同步。Chrome 154 / CDP 9224 refresh 最新 loaded，原 native upload focus @ref activeElement BUTTON / label「上传本地图片」/ tabIndex 0；仅焦点可达，非上传生成。performance generationRequests=[]，本轮无生成/付费。
- 当前前端检查 omissions 展示与原值，graph/spatial/reference 参数一致；真实点击生成或上游明确余额终态：**待验**。
- 显式 reference 图生图、明确 result→首帧图生视频的 provider/model/参数/视频终态、历史刷新/云端项目：**待验**。
- **代表模板 DOM（主 agent 回传）**：Chrome 154 / CDP 9224 在新 board「接线修复检查-20261009」保留原 board；初测 positive/negative/latent 重叠后，新 preset row y=80/620/1000。重新仅载入 Krea2 8 nodes actual DOM overlaps=[]；append Agnes i2i 4 nodes 后 12 nodes actual DOM overlaps=[]。截图 `temp/repair-browser/krea-layout-fixed.png`、`temp/repair-browser/krea-agnes-layout-fixed.png`。最终 refresh 最新 loaded 后代表 12 nodes 保留，但未重测 geometry；前述 overlaps=[] 只指此前代表检查。31 预设实际 DOM 未全验，撤销估算 0 collision/31 抽取成功即全修好的推论，不写全量无错位。
- 历史 A1 只验证 2K/1:1 字段与 HTTP 200，没有原图/刷新闭环；旧 A3 是直调，不替代真实前端。当前修复没有新增图片，不记 PASS_GENERATION。

---

## 以下为保留的历史验收记录 — 2026-10-08 BLOCKED_CONFIG


日期：2026-10-08。验收方式：本地真实前端 `http://127.0.0.1:3000/`，通过浏览器点击工作流运行；不是终端直调 API。

## 2026-10-08 origin/main 样本结论（缺 API Key）
**BLOCKED_CONFIG**。前端真实提交到了本地 `/api/engine/agnes/generate` 路由，但当前运行环境没有可用 Agnes API Key。最新一次本地返回：

`未配置 agnes API 密钥（AGNES_KEY / 设置面板 / x-agnes-key）。`

`executionTrace: []`，因此请求没有到达 Agnes 上游。这不是余额不足，也不是 Agnes 上游鉴权失败。

## 当前官方字段核对

2026-10-08 再次核对 AgnesAI-Labs 官方资料：

- 官方模型：`agnes-image-2.5-flash`
- Endpoint：`POST /v1/images/generations`
- 必填：`model`、`prompt`、`size`
- `size`：`1K / 2K / 3K / 4K`
- 可配 `ratio`：`1:1 / 3:4 / 4:3 / 16:9 / 9:16 / 2:3 / 3:2 / 21:9`
- 当前官方资料没有把 ComfyUI `width / height / seed / negative_prompt / steps / cfg / sampler / scheduler / denoise / loras` 列为该图像 endpoint 字段。

来源：
- https://github.com/AgnesAI-Labs/skills/blob/main/agnes-ai-models/references/model_catalog.md
- https://github.com/AgnesAI-Labs/skills/blob/main/agnes-ai-models/SKILL.md

因此本轮同步修正了旧测试中“Agnes width/height 可直接编辑并映射 size”的错误假设：Image 2.5 Flash 应使用 `size + ratio`；旧 `agnes-image-2.1-flash / 2.0-flash` 只保留 legacy compatibility，未核实字段保持 `unverified`。

## 本轮真实前端样本

- Provider：`agnes`
- Model：`agnes-image-2.1-flash`（旧兼容模型，仅用于暴露当前配置终态）
- Prompt：`A glass terrarium library suspended above a mossy canyon at dawn, tiny brass ladders, mist between miniature shelves, soft volumetric sunlight, intricate editorial illustration`
- Width / Height：画布旧值 `1024 × 1024`
- 旧画布残留 Negative Prompt、Seed `314159`、Steps `24`、CFG `3.2`、resolution `1k` 没有被静默当作 Agnes 2.5 官方字段；执行记录逐项写入 `parameterOmissions`。
- 本地配置阶段直接返回缺 Key，没有生成图片。

## 边界

配置有效 Agnes Key 后，应改用官方当前模型 `agnes-image-2.5-flash`，用新的独立样本和 `size + ratio` 从前端重新运行。只有真实图片返回才可进入 PASS_GENERATION；只有上游业务体明确余额/额度不足时才可记 PASS_BILLING。

## 2026-10-08 incoming 72f5372 独立样本结论（缺 Base URL）

本节与上节为不同模型、不同请求的历史配置阻塞记录；同日先后顺序未记录，不合并为同一次请求的终态。后续接线与生成证据按下方各自日期和样本范围保留。

**BLOCKED_CONFIG**。前端真实提交到了本地 `/api/engine/agnes/generate` 路由，但服务端在本地配置阶段返回 HTTP 400：`未配置 agnes Base URL（AGNES_BASE_URL / 设置面板 / x-agnes-base-url）。`

这不是 Agnes 上游 HTTP 响应，不是余额不足，也不是出图成功。它只证明当前前端能按 Agnes provider 选择自定义模型并提交到本站 Agnes 路由；配置有效 Base URL 和 Key 后仍需重新前端验收。

## 本次独立样本参数

- Provider：`agnes`
- Model：`agnes-image-2.5-flash`
- Prompt：`A glass terrarium shaped like a lunar rover, filled with miniature desert succulents and tiny astronauts, clean studio lighting, premium catalog render`
- extraParams：`resolution: 1k`（由旧画布值残留而来，进入请求但未到上游）
- 本次请求体仍携带旧 KSampler 残留的 negative_prompt、seed、steps、cfg；因为本地配置缺失先返回，尚未走到 Agnes 上游或字段校验终态。

## 前端证据链

1. 从真实网页把底模 Provider 切为 `Agnes`。
2. Agnes 目录响应没有返回所选供应商模型列表，因此使用自定义模型 ID：`agnes-image-2.5-flash`。
3. 删除旧 HF LoRA 节点，避免 LoRA 进入 Agnes 请求。
4. 选中 KSampler 执行分支并点击 `运行工作流`。
5. 执行记录新增 `HTTP 400 · POST /api/engine/agnes/generate`。
6. 完整响应体为本地配置错误：`未配置 agnes Base URL（AGNES_BASE_URL / 设置面板 / x-agnes-base-url）。`，`errorSource: local`，`executionTrace: []`。
7. KSampler / SaveImage 均无图片输出，没有把旧图冒充本次结果。

## 边界

该结果只能记 `BLOCKED_CONFIG`。配置 Agnes Base URL / Key 后，需用新的参考样本重新从前端运行。届时若上游明确欠费才可记 PASS_BILLING；若返回图片才可进入 PASS_GENERATION；若字段校验先拦截，则需按 unsupported 字段或路由契约单独修复/记录。


## 2026-10-09 接线修复后前端复验

记录时间：2026-10-09 13:25 北京时间（CST）。仓库 HEAD `d75d1d4`，工作区有未提交改动（约 67 项），本次验收基于该工作区。环境：本地 127.0.0.1:3000 开发服务，画布「验收-接线-2」。

### A1 Agnes 图像（前端点击已提交，requestBody 由主 agent 只读 eval 补读）

- 执行记录标题显示 `HTTP 200 · POST /api/engine/agnes/generate`，对应上游时间戳 2026-10-09T05:10:27Z（logs/upstream.log：`apihub.agnes-ai.com/v1/images/generations`，status 200，maskedKey 后缀 yGZx）。
- 前一轮验收 agent 全量快照执行记录区域超时（该区域含大量 base64，快照 >800 万字节），未读出 requestBody。主 agent 随后用只读 `eval` 精确查询页面 `<pre>` 取得原文（data URL 已截断）：`{"model":"agnes-image-2.5-flash","prompt":"a majestic ethereal snow leopard ...","size":"2K","ratio":"1:1"}`。
- 核对结论：`ratio` 在 JSON **顶层**，没有 `extra_body`，符合官方契约。注意：该次实际设置是 size=`2K`、ratio=`1:1`，**不是**计划里的 `1K` / `16:9`（验收 agent 选了页面上另一组取值），因此 `1K` 与 `16:9` 的前端组合本次仍未验证；上游对 `2K`+`1:1` 返回 200 并给出图片 URL。
- 本节后文所述「未核实」仅指前一轮 agent 的读取失败，已由上一条补读取代。
- 可参考的已核实证据（非本次前端点击）：A3 主 agent 直调后端路由，请求体为 `{"model":"agnes-image-2.5-flash","prompt":"...","size":"1024x768","ratio":"4:3"}`，上游 200，返回 PNG 1152x864（/tmp/canvas-acceptance-2026-10-09/agnes-size-probe-check.txt）。
- 生成图未保存到 /tmp/canvas-acceptance-2026-10-09/outputs/A1.png：未能从历史或图像详情取得 A1 的原图。
- 截图：/tmp/canvas-acceptance-2026-10-09/t7-agnes-2026-10-09-A1.jpg（画布节点显示，已有 Agnes 输出缩略图）。
- 结论：接线字段符合官方契约（`ratio` 顶层，无 `extra_body.ratio`），上游 HTTP 200。图片原图未取到本地副本，故不记 PASS_GENERATION；记「PASS_WIRE（字段核对通过）」，仅限 size=2K、ratio=1:1 这一组。

### A2 Agnes 视频 — 沿用上一轮结果

- 3 秒：本地 400「Agnes Video seconds 只接受 4–12 的整数秒」，executionTrace 为空，未打上游。
- 4 秒：真实提交，上游 `https://apihub.agnes-ai.com/v1/videos`，body `seconds:"4"`、`mode:"text"`，上游 503 `video_queue_full`（服务端队列满）。日志见 logs/upstream.log 2026-10-09T04:38:32Z。
- 结论：接线通过到上游、服务端队列满，未出视频；非本地接线错误。

### A3 Agnes 图像 size 实测 — 主 agent 直调后端路由，非前端点击

- size=`1024x768`，ratio=`4:3`，上游 HTTP 200，返回 PNG 1152x864。见 agnes-size-probe-check.txt。
- 结论：仅说明 Agnes 上游接受像素写法与 ratio 顶层字段，不代表前端路径已验。

### 未验证阶段

刷新后历史、云端项目、空间画板、多图、图生图均未验证。A1 仅验证了 size=2K、ratio=1:1 这一组，`1K`、`16:9` 的前端组合未验证。

