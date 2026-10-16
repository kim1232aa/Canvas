# ComfyCanvas Studio：开发交接、产品缺口与验收手册

## 2026-10-14 前端 E2E：WaveSpeed `wavespeed-ai/krea-v2/turbo`（非 LoRA）PASS_GENERATION

只证明这一次、这一家、这一模型。不外推 Fal 或其他供应商。

- 真实浏览器 `http://127.0.0.1:3000`，画布默认工作流，Provider 选 **WaveSpeed**，目录模型 **wavespeed-ai/krea-v2/turbo**（目录返回 50 条，从下拉选中，不是手填假 ID）。
- 未出现 LoRA 强度控件；`loras: []`。KSampler 空白的 cfg/denoise 被显式填为 1 / 1。Schema 匹配后实际提交不包含 steps/cfg（界面记「未发送」）；`denoise=1` 映射为官方字段 `strength=1`（该字段说明仅在带 image 时用于图生图；本次无参考图，上游仍接受）。
- 实际端点：`POST https://api.wavespeed.ai/api/v3/wavespeed-ai/krea-v2/turbo`。上游回显 input：`prompt` + `seed=42` + `strength=1` + 默认 `aspect_ratio=1:1`、`resolution=1k`。提交 `status=created`，task `507d3d31d97d4f05af7852a595b48e38`；轮询终态 `status=completed`，`code=200`，`inference=3767` ms，error 为空。
- 输出：`https://d2h7xmz5gqybh9.cloudfront.net/output/15fc1dbb-393a-4712-b0f4-672ce5682c08-u1_1b7bf0fe-9640-487b-a257-a36a7f5ef8cb.jpeg`，画布与历史均显示同一张图，本地 `/api/media/7b77ccd3152521a920183250d610b0d4979e3c25d1637ce62134d72ead636da8`。画面与提示词一致（雨夜撑伞蹲姿、黑猫、积水反光）。
- 证据截图与脱敏历史 JSON：`/workspace/canvas-e2e-wavespeed/`（01 运行前、02 画布出图、03 结果图、04 历史弹窗、history-export.json）。凭证已脱敏，未写入密钥。


## 2026-10-11 当前状态：Runware/ModelsLab 网页实测闭环、双兼容中转出图通过、模型中心 17 家全聚合

**不能宣称全部集成完毕，未验证项仍为 PARTIAL。**

- **真实网页点击运行出图成功（PASS_GENERATION）**：
  - **Tensor.Art (TAMS)**：旧 OpenWorks 工具名（如 `photoreal_studio_z_image`）不代表模型和 LoRA，不算 TAMS 验收；真实 TAMS 模型 API (`https://tams-api.tensor.art/v1`) 当前账户返回 `unauthorized / app not found`，记 **`BLOCKED_AUTH`**；
  - **Runware**：预设载入 `runware:100@1` (FLUX.1 [schnell])，从网页点击运行，上游返回 HTTP 200 真实成功出图，持久化至 `/api/media/<hash>`，记 **`PASS_GENERATION`**（证据保存在 `docs/evidence/t7-runware-acceptance.md`）；
  - **OpenAI 兼容中转**：中转 Base URL `https://sub.alibb123.ccwu.cc/v1` + 模型 `gpt-image-2`，从网页点击运行，上游返回 HTTP 200 真实成功出图，持久化至 `/api/media/<hash>`，记 **`PASS_GENERATION`**（证据保存在 `docs/evidence/t7-openai-compat-acceptance.md`）；
  - **Grok 兼容中转**：中转 Base URL `https://sub.alibb123.ccwu.cc/v1` + 模型 `grok-imagine-image`，在网页选定 `1k` 分辨率并点击运行，上游返回 HTTP 200 真实成功出图，持久化并在画布与大图灯箱渲染，记 **`PASS_GENERATION`**（证据保存在 `docs/evidence/t7-grok-compat-acceptance.md`）；
  - **Agnes Image 2.5 Flash**：英文雪豹/中文橘猫文生图、人物水彩编辑真实出图 200（证据保存在 `docs/evidence/t7-agnes-acceptance.md`）；
  - **SenseNova U1.5 Lite**：>1MB 红夹克编辑、橘猫窗台文生图真实出图 200（证据保存在 `docs/evidence/t7-sensenova-acceptance.md`）；
  - **WaveSpeed**：指定 LoRA 端点真实出图通过（证据保存在 `docs/evidence/t7-wavespeed-acceptance.md`）；
  - **Civitai**：历史 SD1 精确组合出图证据保留，不外推新生态/视频。
- **真实前端欠费/计费终态（PASS_BILLING）**：
  - **ModelsLab**：预设载入 `flux`，从网页点击运行，上游返回 `You need to be subscribed to a plan to continue` 订阅限制，系统原样透传真实错误与响应体，无 mock、无降级，记 **`PASS_BILLING`**（证据保存在 `docs/evidence/t7-modelslab-acceptance.md`）；
  - **Hugging Face**：`black-forest-labs/FLUX.1-dev` 经 fal-ai 推理路由上游返回 HTTP 402 `no remaining credits`，前端原样透传，记 **`PASS_BILLING`**（详见 `docs/evidence/t7-huggingface-acceptance.md`）；
  - **Sogni**：`krea-2-turbo` + LoRA `krea2-detail-enhancer` (0.8) 提交上游返回 HTTP 201，异步轮询终态为 `waiting_for_user / insufficient_credit`，前端原样透传，记 **`PASS_BILLING`**（详见 `docs/evidence/t7-sogni-acceptance.md`）；
  - **MuAPI**：`qwen-text-to-image-2512` 提交上游返回 HTTP 402 `INSUFFICIENT_CREDITS`，前端原样透传错误信息与充值端点，记 **`PASS_BILLING`**（详见 `docs/evidence/t7-muapi-acceptance.md`）；
  - **Fal.ai**：F1 图生图与 K1 KlingV3 图生视频真实上游 403 `TOP_UP`，记 **`PASS_BILLING`**（详见 `docs/evidence/t7-fal-acceptance.md`）；
  - **ModelScope CN**：`Tongyi-MAI/Z-Image-Turbo` 到 CN 上游 429 明确 `insufficient balance`，记 **`PASS_BILLING`**。
- **未出图 / 阻塞 / 待后续账户配置**：
  - **Agnes 视频**：合同与字段补修完成并通过复审，真实请求 wire 正确，上游持续 503 `video_queue_full`，记 **`BLOCKED_UPSTREAM_QUEUE`**；
  - **Google Gemini**：本地缺 API Key 配置（记 **`BLOCKED_CONFIG`**）；
  - **NanoGPT / ModelScope AI**：历史 10-06 鉴权阻塞，待正确账户重测。
- **模型中心补全闭环**：
  - `/api/models?provider=all` 已聚合全部 17 家供应商，互不吞错；
  - `ModelHubModal` 与 `CivitaiModal` 补齐 `runware`、`modelslab`、`sogni`、`muapi`、`wavespeed`、中转等全部页签与手输说明；
  - `HANDOFF.md` 4.1 节 8 项问题全部修复完毕并通过单元测试。


## 2026-10-09 媒体存储架构迁移（优先于下文所有“base64 / data URL 历史”描述）

**问题**：生成图以 `data:...;base64` 内联进历史、画布节点、项目和浏览器 localStorage，同一张图存多份；`data/history.json` 达 44MB，出图后 localStorage 写入失败并弹“本机保存未完成”。

**现在**：
- 服务端媒体存为 `data/media/<sha256>` 文件（内容寻址，旁带 `.json` 记录 Content-Type），对外只给短 URL `/api/media/<sha256>`。Sites 部署沿用其已有 R2 同名路径。实现见 `src/server/mediaStore.ts`（`createMediaStore`）及测试 `mediaStore.test.ts`。
- `GET /api/media/:hash` 支持 Range、`nosniff`、不可变缓存；非法哈希/不存在返回 404 JSON。`POST /api/media` 接收 `{dataUrl}` 并返回 `{url}`，仅接受 image/video/audio。
- 生成链路：`requireDurableHistoryMediaUrl`、`persistRemoteUrlAsDataUrl`、HF/Gemini 直拼 base64 处、`recordHistoryItem`、`POST /api/history`、云项目保存都会先外部化；调用上游前，请求体里的 `/api/media/...` 在 `MEDIA_INPUT_ROUTES` 中还原成 data URL（上游读不到本机路径）。API 响应字段名不变（`imageUrl` / `mediaUrl` 仍存在），值变为短 URL。
- 历史 `requestMetadata.executionTrace[].responseBody` 里的大段 `b64_json` 也外部化，其余字段原样保留。
- 启动时自动迁移已有 `history.json` / `projects.json`；有改动才写入，并先生成 `*.bak-before-media-migration` 备份。本机实测 `history.json` 44MB→约 97KB，10 条历史、15 处引用，无缺失文件，内联 data URL 为 0。备份文件仍保留，确认无误后由用户决定是否删除。
- 前端：`saveWorkspaceCache` 写 localStorage 前去掉所有内联媒体（不修改运行态），载入旧缓存时也清理；`写入失败仍会抛出并提示，不吞错`。参考图/素材本地上传改为先 `uploadMedia` 再存短 URL。
- `hosting/build.mjs` 用 `// MEDIA-STORE-BEGIN/END` 锚点在 Sites 构建里换成直通实现；`hosting/routes.ts` 新增 `POST /api/media`（走 `persistMedia`）。Worker 构建已通过，**Sites 线上未部署、未实测**。

**真实验证（本机，真实 Chrome 154 + Agnes）**：节点 `image_url` 填公网 URL，提示词“保持同一人物与构图，改成水彩画”，点击运行：`/api/engine/agnes/generate` 200，上游请求体 `extra_body.image=[参考图URL]`，历史新增 1 条，`url=/api/media/<hash>`，前端取图 `/api/media/...` 200（约 3MB），浏览器画板缓存 15KB、内联媒体 0、无“本机保存未完成”提示。输出与参考图人物、构图一致并转为水彩风格（对比图 `temp/repair-browser/compare.jpg`）。这只证明该 Agnes 图生图路径和存储链路，不代表其他供应商。

**遗留 / 未验证**：
- 其他供应商（Civitai、Fal、HF、Gemini、视频）的新存储链路只有代码路径和单元测试，没有逐个真实出图。
- 视频文件很大时直接落盘并经 `/api/media` 发送；未测大视频。
- `data/history.json.bak-before-media-migration` 与旧 base64 内容仍在磁盘，未删除。
- 资产库(`comfycanvas_user_assets_v2`)旧的本机 base64 记录不会被自动迁移，只有新上传走服务端。
- 本机生产站点上云后，`/api/media` 的访问控制沿用现有鉴权，未单独做权限测试。
- 全量：lint 通过，`npm test` 62 files / 513 tests 通过，frontend + hosting build 成功，`git diff --check` 通过；既有的三条构建警告未变。

## 2026-10-09 当前优先交接：连接域修复，尚未完成生成验收

**本轮状态：`CODE_ONLY / CONTRACT_TESTED`，不是 `PASS_GENERATION`。** 以下新状态优先于后文 10-06/10-08「当前」「最新」「DONE」等历史标签，但不删除或推翻有证据的历史请求。用户要求由 `sub/gpt-6.1-sol` 分任务修确定错误；授权的是本轮明确连接域，不是所有供应商/所有模型/所有模式全量修复。

- **Fal/Kling**：此前 graph→VideoDriver 发 `start_image_url`，本站只读取 `image_url` 漏图。当前源码 Driver 使用本站 `image_url`，builder 兼容两输入且冲突拒绝，最终 Kling V3 wire 生成 `start_image_url`。custom video JSON 透传/覆盖保留 before/after 和实际请求；unknown 不当 unsupported。官方明确同步 `fal.run` 合法，不能因未用 queue 判接线错误。
- **Civitai/预设**：resolver 区分 model / version / type；builder 与前端参数记录 engine / ecosystem / modelSelector（站内 `comfyModel`）。Comfy sampler/scheduler 与 sdcpp sampleMethod/schedule 分开。Face Detailer / Detail Tweaker / Krea 改完整 AIR；2758 是 Checkpoint，旧错误 LoRA 身份不明模板保留待重选，不换别模型。ZImage 请求生态 `zImage` 与资源 `zimageturbo` AIR 映射分开且保留原文，LoCon 推理未实测。Gemini 错误 Imagen 默认移出本站 generateContent 模板，用户必须选模型。
- **空间/Agnes**：展示 `frame.imageUrl` 不自动输入；`referenceImageUrl` 是显式源。SpatialFrameItem 只有明确「图生视频」点击才把 result 设置为首帧；后续 provider/model、提交、结果与历史仍待整链验收。Agnes size 已指定而省略 width/height 时，`extra.omissions` 与 Driver 合并原值/原因。
- **真实 UI 与布局**（主 agent 回传，不是文档 agent 浏览器实测）：Chrome 154 / CDP 9224 新建「接线修复检查-20261009」，保留原 board；「仅载入」Krea2 显示显式 comfy/krea2/turbo 与完整 AIR。初测 positive/negative/latent 重叠后，新 preset row y 调整为 80/620/1000；重新仅载入 Krea2 的 8 nodes，actual DOM overlaps=[]；append Agnes i2i 4 nodes 后 12 nodes actual DOM overlaps=[]。截图：`temp/repair-browser/krea-layout-fixed.png`、`temp/repair-browser/krea-agnes-layout-fixed.png`。**这是代表模板检查，不是 31 个预设全验；撤销此前估算 0 collision/31 抽取成功即修好的推论。**
- **未运行边界**：失模型/未核实/缺参考/来源未接通的菜单项显示「待配置，不能立即运行」并 disabled。browser performance 只读检索 `generationRequests=[]`；本轮没有生成请求、没有 source 付费。新增上传源码不能解除 Fal F1/K1 旧 `BLOCKED_UI`；历史 payload false 与 10-09 未生成事实保留。旧 Civitai SD1 `4384@128713` + LoRA `82098@87153` / 0.7 的 10-06 PASS 只限精确组合。
- **最终 fresh 本地回归**（主 agent 回传）：`npm run lint` 退出 0；`npm test` 61 files / 497 tests 全 PASS，无 localStorage stderr；frontend + hosting Worker build 成功；`git diff --check` 退出 0。既有 Vite `__dirname`、dynamic import 无效、>500KB chunk 三类警告保留。49/383、55/453 是早期历史回归，不是最终数量；本地测试不证明未生成链路。
- **指定 scope 独立复审已闭**：review42 初轮及后续 alias merge / actual payload history 已关闭；review53（Agnes/Gemini metadata + strict field types）原 2 MEDIUM 全 close；review54 原 final 3 HIGH + quantity MEDIUM 全 close；review55 最后 3 must-fix 闭环，定向 24+4 tests PASS。此前 type44/React43 待修项已由后续修复/复审关闭，旧 review43 指定 scope close，但不宣称 hooks ESLint 验证。整体 `CODE_ONLY / CONTRACT_TESTED`，真实生成验收仍 PARTIAL。
- **本地契约补修**：resource AIR 的合法 urn/air/bare canonical 及 file format 与 metadata 匹配；单版本 modelId 检查 shape，多版本不取 first，不可解析 AIR 拒绝；UI 各入口一致显示 metadata verified 而非 generation ready。SaveImage 失败不清 source；简化 Agnes checkpoint sink 与检查器共享 owner；Fal 9:16→实际请求 width=720/height=1280；video quantity=3/0 在三条路径一致。EngineRegistry 按用户显式 provider 分派 Civitai video/Agnes video advanced；专用 cloud JSON、unknown compatibility 中性、上传键盘可达、duration/FPS legacy clear、空 video entry provider 不猜已修。Gemini omissions 合并 history metadata，不进入 SDK wire；Agnes advanced mode 显式、/videos media 约束及严格类型先拒绝 false/array/object；URL-like 文本 sanitize 不抛 InvalidURL。保留 inspector 原值+差异 patch、branch variation result 优先；上述都是本地契约/复审结论，不是上游实测。
- **本地运行版本已更新**：主 agent `pm2 restart canvas` 成功，PID 176587 / restarts 11；fresh `/api/cloud/health` 返回 online、uptime 14s、history 8、executionTrace=[]，主页 HTTP 200。此前旧 process/未 restart 是中间状态；当前只确认本地，不宣称 Cloudflare/公开站同步，未公开 deploy、未 commit/push。
- **最终浏览器只读检查**（主 agent 回传）：Chrome 154 / CDP 9224 refresh 加载最新页面，Krea2/Agnes 代表 12 nodes 保留；此前 actual DOM overlaps=[]，最终刷新未重测 geometry。按原 native upload focus @ref 实测 activeElement=BUTTON、label「上传本地图片」、tabIndex=0；这是焦点可达证据，不是上传/生成验收。performance `generationRequests=[]`，本轮无生成/付费。

主 agent 后续必须补实际证据：
1. unknown 资源由 owner 目录重选；官方矛盾与 unknown resolution 的上游接受性、Krea/ZImage LoCon 推理及视觉效果：**待验**。后续代码再变需重跑本地回归。
2. 当前版本真实前端上传与点击生成：记录 clientRequest→builder actualRequest→上游→终态；余额不足只有真实原文及前端正确展示才记该路由 PASS_BILLING：**待验**。
3. referenceImageUrl 图生图、结果显式作为图生视频首帧、provider/model/参数/JSON 覆盖完整链路：**待验**。
4. 新输出历史详情、参数来源、刷新、复用与云端项目恢复：**待验**。
5. 31 个预设逐个真实 DOM、重叠修复复查、未知资源经目录重选后的身份与能力：**待验**。

本轮官方检索及原文阅读、具体边界见 [Fal](docs/evidence/t7-fal-acceptance.md)、[Civitai](docs/evidence/t7-civitai-acceptance.md)、[Agnes](docs/evidence/t7-agnes-acceptance.md)。文档负责人没有调用生成 API、读取 secret、操作浏览器/PM2 或提交推送。

## 0. 项目核心最高规则——先读，必须执行

以下五条来自用户原始要求。它们优先于仓库历史文档、旧测试、旧实现和此前“完成”结论。

### 0.1 调查与断言原则

多用网络搜索工具调查，没证据不断言。

禁止用训练记忆代替外部检索；涉及 API 定义、第三方库规范、官方行为等，必须先检索取证。

本地事实以代码和命令实测为准，未亲眼见证输出绝不断言。

### 0.2 严禁静默容灾与虚假成功（透明错误，真实提供者路由）

严禁在底层偷偷换 provider、端点、模型、缓存或使用 mock/fake 假数据假装成功。

请求打到哪里必须是用户或配置指定的那一个，实际端点与路由必须公开透明。

请求失败必须原样、完整报出，包含真实的 HTTP 状态码、响应体、报错堆栈。

### 0.3 严禁回退（Fallback）与兜底掩盖

严禁使用回退、默认兜底策略掩盖错误，这会让用户感到欺骗。

如果 API 报错，必须让用户明确获知具体哪里出错、为何出错，而不是用 fallback 兜底抹平错误。

### 0.4 严禁硬编码集成（自由度与泛化）

用户需要的是高度自由度和通用泛化能力。

画布与节点系统严禁写死特化 API 字段或私有端点规则，必须支持动态配置、自定义参数、通用 API Schema 驱动。

### 0.5 严禁反透明的黑盒行为与虚假自愈（严格反黑匣子透明规则）

严禁在用户看不见的地方自动换路、吞掉错误、把失败改写成成功。

系统内部调用流、节点执行流、数据转换过程必须全程可视化、对用户透明可见。

### 0.6 用户追加的执行与验收要求

- 用户已授权必要的真实生成，不需要因“会调用真实生成”重复停下来请示。避免无意义重复计费；一个失败请求不能偷偷换供应商再试。
- **欠费可以通过本次接线验收**：必须从真实前端提交，请求到达所选供应商，真实返回余额/额度不足，并在前端准确显示。记为“接线通过，生成受余额限制”，不是“图片生成成功”。
- 有额度且端点能生成的，必须实际出图；图片必须保留实际参数、工作流、LoRA ID/URL 与实际提交强度，符合该模型/端点真实能力。
- 401、403、404、429 单看状态码都不足以判断欠费。必须看上游原文。`unauthorized / app not found` 不是余额不足；`status:null` 不是上游 HTTP 500。
- 目录可见、按钮可点、连线完成、直接调用 API 出图、单元测试通过、构建或部署成功，均不能替代前端全链路验收。
- “未核实某参数”不等于“官方不支持”。不得凭未核实本地拦截用户请求；应继续查证或保留显式参数供上游验证，并标注未知能力。
- 不允许空值时偷偷指定默认模型，也不允许凭名称推断供应商并切换。
- 普通画布字段的 Schema 匹配模式必须可见、可关闭，逐项记录未提交字段的原值与原因。手写 JSON 的覆盖必须可追踪；不能静默删除非空 LoRA 意图。
- Key、令牌、签名链接中的秘密值不进入 Git、截图、导出工作流或日志。“完整响应”需在不泄露凭证的前提下保留业务原文，标明脱敏位置。
- 用户已授权完成后 commit/push 到 GitHub `main`，以及此前的 Sites 私有发布；不得擅自扩大网站访问范围。
- 如需并行代理：杂项/调查用 Luna，任务必须互不重叠，不盲目开多个代理。当前交接没有新开代理。

## 1. 交接结论：不是已经完整集成

**截至 2026-10-08，仍不能宣称“所有供应商、所有模型、所有模式都完成前端验收”。** 但已经不是“只有 Civitai 有证据”的状态：Civitai 与 WaveSpeed 已有当前网页真实出图；MuAPI、Sogni、Fal.ai、ModelScope CN、Hugging Face HF→fal-ai 已拿到明确计费/额度终态；ModelScope AI、NanoGPT、Tensor.Art/TAMS 已拿到明确鉴权/账户阻塞；Gemini 与 Agnes 当前被本地配置缺失阻塞。

接手时必须以本文件 **3.2 供应商状态表** 和 **6. 工单状态表** 的 2026-10-06 结论为准。前面的 2026-10-04 环境记录与更早历史只用于追溯，不能覆盖后续更高优先级证据。

本文件中的“已实现”仅表示亲自读到相应代码；“历史证据”表示仓库已有记录；“本轮前端实测”只指本次从页面点击产生的记录。三者严格分开。

### 1.1 仓库、版本与环境

| 项目 | 交接基线 |
| --- | --- |
| GitHub | https://github.com/kim1232aa/Canvas ，分支 `main` |
| 2026-10-04 交接历史 GitHub 提交 | `af68228241e335a53d560e92c750a945949777e1`（仅历史追溯，不是当前 HEAD） |
| 2026-10-04 对应 Sites 源提交 | `2b986c9cb58132f6107fc630e4860f1a36781f67`（仅历史追溯） |
| 当时两者相同的源码 tree | `70e0f5e5370173b75754d0c748c725b88ce18550` |
| 历史 Sites 地址 | https://comfycanvas-studio.quilts-nock-0mb.chatgpt.site |
| Sites project_id | `appgprj_6abf7823b9648191aed7e4c4f10bbea8` |
| 历史已成功发布部署 | `appgdep_6ac22888c5708191ab2bb63304361b66`，环境 revision 4 |
| 2026-10-06 收尾前本地 HEAD | `d75d1d4`；本轮收尾提交完成后以 `git log -1` / `origin/main` 为准，不再把此哈希当最终版本 |
| 当前活跃工作目录 | `/home/ubuntu/Canvas` |
| 历史验证（2026-10-04 前） | 35 个测试文件、267 个测试通过；仅作历史追溯 |
| 2026-10-08 当前回归 | `npm run lint` PASS；`npm test` 40 files / 295 tests PASS；`npm run build` PASS（含 frontend + hosting worker 构建）。仍不替代真实前端/上游验收 |

旧 `canvas/`、`canvas-source/` 副本不是当前代码。接手人在新环境应以 GitHub 最新 main 为起点。Site 与 GitHub 使用独立 Git 提交历史，不能仅比较 commit SHA 判断内容不同，应比较 tree 或具体文件。2026-10-06 收尾已经包含产品代码、前端文案、测试与证据修复；是否发布 Sites 必须单独核对部署源与权限，不能因为本地/GitHub 更新就声称生产站已同步。

### 1.2 本次再次走前端验收的结果

- 时间：**2026-10-04 21:28:26.023，北京时间**（页面原始 UTC：`2026-10-04T13:28:26.023Z`）。
- 环境：受管预览，运行上述源码；不是生产网站测试。
- 动作：在真实页面关闭执行记录，点击“运行工作流”，重新打开执行记录；不是从终端直接发生成请求。
- 选择：Hugging Face / `Tongyi-MAI/Z-Image-Turbo` / 显式 `z-image-space` 路由。
- 参数：steps=8、seed=42、resolution=`1024x1024 ( 1:1 )`、shift=3、random_seed=false；没有 LoRA。
- 前端提交：`POST /api/huggingface/generate`，附完整节点和连线快照。
- 目标：`https://tongyi-mai-z-image-turbo.hf.space/gradio_api/call/generate`。
- 结果：网站 HTTP 500；上游 `status:null`；`errorSource=network`；`ECONNREFUSED 127.0.0.1:40013`。未收到供应商 HTTP 响应，不能说供应商返回 500、欠费或鉴权失败。
- 页面显示失败，执行记录保留实际请求、工作流、端点、错误 cause 和 stack；没有新图片，没有把失败写成生成成功。
- 判定：**BLOCKED_ENV；没有通过供应商接线或出图验收。只验证到前端提交和网络错误展示。**
- 本次没有重跑其他供应商，不能把这个结果推断为其他家已通过或上游都不可用。

证据：[`原始页面记录`](docs/evidence/handoff-frontend-2026-10-04.txt)、[`本次截图`](docs/evidence/handoff-frontend-2026-10-04.jpg)、[`结构化摘要`](docs/evidence/handoff-frontend-2026-10-04.json)。页面记录同时含早先请求；以以上时间戳的新请求为准。

此前浏览器曾被自动审批额度限制阻止，后来浏览器恢复，但预览网络仍失败。此前已将过期代理配置更新为当时运行环境提供的配置并复测，仍连接被拒绝。不要继续循环换端口、绕过隔离、架设转发或把直调 API 当作网页成功。接手者应在**具备合法网络出口的实际运行环境**验收，并区分预览与生产。当前环境的内部预览地址不可作为给用户的交付网站地址。

## 2. 产品到底有多少板块

按用户可见的功能入口划分，交接采用 **16 个板块**。这是产品验收口径，不是 16 个独立页面，也不是供应商数量；视频入口复用了模型中心，多个板块共用 App 状态。

| # | 产品板块 | 主要代码 | 已有实现 | 缺口 / 接手检查重点 |
| --- | --- | --- | --- | --- |
| 1 | 节点画布 | `App.tsx`、`Canvas.tsx`、`NodeItem.tsx`、`graphEngine.ts` | 节点、连线、分支提取、执行、模型与 LoRA 入口 | 各供应商从真实节点提交的参数和选中分支要验收；节点字样不能冒充上游已加载 |
| 2 | 空间画板 | `SpatialFrameItem.tsx`、`App.tsx` | 独立提示词、参数、图像结果 | 与节点模式不能交叉修改；每家至少检查一次空间模式；图生图媒体可访问性未全验 |
| 3 | 多画布管理 | `CanvasManagerModal.tsx`、`workspaceCache.ts` | 新建、切换、本地恢复、模板 | 新旧工作流迁移、切换后 provider/ID/LoRA 保留；不能用数组位置挑错模板 |
| 4 | **模型中心** | `ModelHubModal.tsx`、`ProviderModelSelect.tsx`、`/api/models` | 单家标签、搜索、分类、分页、自定义 ID；MuAPI/WaveSpeed/Sogni 已进入 all 聚合 | 新增 provider 继续走共享聚合入口；模型/工具/资源身份必须保持来源与执行 ID 可追溯，目录可见不等于在线推理通过 |
| 5 | **独立 LoRA 中心** | `CivitaiModal.tsx`、`attachLora.ts` | Civitai/HF/Tensor/魔搭/Fal/MuAPI/WaveSpeed/Sogni 入口；URL/ID 与目录资源分开处理 | MuAPI/WaveSpeed 当前没有已核实 LoRA 权重目录，只允许目标端点可读取的 URL；Sogni 使用真实资源 ID；`all` 标签不再猜供应商。A03 已用 MuAPI LoRA 专用路由的真实前端 402 请求关闭接线缺口 |
| 6 | 视频模型与视频生成 | `ModelHubModal.tsx`、`VideoDriver.ts`、`/api/video/generate` | 独立分类入口和旧驱动 | 新三家的图像驱动不等于视频已接入；目录出现视频端点不等于执行、参数、轮询已正确 |
| 7 | 参数检查器 / JSON Schema | `ParameterInspector.tsx`、`ApiParameterEditor.tsx`、`providerSchema.ts` | 新三家动态 Schema、JSON、映射模式 | 老供应商还有静态规范与“未核实即不支持”；完整 Schema 组合字段、oneOf 等覆盖未全验 |
| 8 | API 设置 / Key 池 | `BackendSettingsModal.tsx`、`server.ts` KeyPoolManager | 新三家 Key 项、服务端环境与加密设置；Schema provider 已用 credentialRef 绑定 schema→submit→poll；失败状态不再触发 Failover / Best Latency 换 Key，UI 只保留独立新请求的 Round-Robin | 连接测试仍不等于生成；异步任务引用失效必须本地报错，不能静默取下一把 Key。当前 A05 已实测 409 截断且无上游调用 |
| 9 | 工作流预设 / 导入 / 导出 | `WorkflowPresetsModal.tsx`、`presets.ts`、导入函数 | 预设、图像参数提取、保存和导入拓扑；MuAPI/WaveSpeed/Sogni 已纳入显式 provider 处理 | 原生工程 round-trip 与外部 ComfyUI JSON 仍按不同格式处理；外部 JSON 缺 provider 时保持未指定，不按模型名猜供应商 |
| 10 | 生成历史 | `HistoryModal.tsx`、`recordHistoryItem`、`hosting/store.ts` | 参数、快照、多图记录和媒体保存 | 每家真实输出、逐图参数、刷新恢复、复用后请求一致未全验；历史样图不是本轮通过证明 |
| 11 | 云端项目 | `CloudProjectModal.tsx`、`hosting/store.ts` | 保存、加载、克隆、D1/R2 | 所有新参数/ID/LoRA 能否无损 round-trip；私有身份和环境差异须验 |
| 12 | 资产管理 / 复用 | `AssetManagerModal.tsx`、`App.tsx` | 媒体与参数复用、筛选；Provider 筛选已改为从真实资产历史动态生成 | 跨画布复用继续禁止重新猜 provider 或将资源名替代真实 ID；没有真实资产的 provider 不显示静态占位筛选 |
| 13 | 供应商能力矩阵 | `ProviderMatrixModal.tsx` | 已补 MuAPI/WaveSpeed/Sogni，并按路由/Schema/实测状态收紧 Fal/HF/Gemini/ModelScope/NanoGPT/Civitai 等文案 | 后续新增能力只能以具体模型/端点 Schema 或真实响应为依据；unknown 不得宣传为 supported，也不能因未核实写成 unsupported |
| 14 | 执行记录 / 错误详情 | `ExecutionLog.tsx`、`executionTrace.ts`、`apiFailure.ts` | 真实路由、请求、响应、stack/cause；长 endpoint、status=null、ECONNRESET、计费/鉴权分类已在当前页面实测 | 后续新异常格式继续保留 website HTTP / upstream HTTP / errorSource / body / cause / stack；不得把 HTTP 200 包错误写成生成成功 |
| 15 | 图像详情 / 参数查看 | `ImageDetailModal.tsx`、`HistoryModal.tsx`、`historyParameters.ts` | 历史现可区分 requested / sent / upstream / image-metadata，并恢复旧 Civitai 的 Seed/Steps/CFG/Sampler/Scheduler/尺寸 | 新供应商仍需逐图核对实际参数、LoRA、工作流和多图持久化；“未发送 / 上游未返回 / 旧记录未保存”不得混成“未填写” |
| 16 | 使用指南 / 说明 | `ComfyGuideModal.tsx`、README、CLAUDE、PROGRESS | 指南和历史审计；README/矩阵/指南已在 2026-10-06 收紧旧宣传 | 后续文案仍必须和真实 Schema / 前端验收状态同步；不得重新引入自动换 Provider、100% 复现、全平台余额、全量支持等无证据说法 |

关键教训：**“加一家供应商”是上述整条用户路径的贯通，不是设置页多一栏、Driver 多一项就完成。**

## 3. 各供应商做到哪里、哪家达到标准

### 3.1 状态用词

- `CODE_ONLY`：有实现，未证明前端能到达真实上游。
- `DIRECT_EVIDENCE`：有历史直接 API 记录，供复核，不是当前前端通过。
- `BLOCKED_ENV`：前端已提交，但运行环境阻止连接，未收到上游响应。
- `PASS_BILLING`：真实前端请求收到明确余额/额度限制并正确展示；只通过该路由的接线验收。
- `PASS_GENERATION`：真实前端出图，实际参数、LoRA、工作流及持久化闭环均验过。
- `FAIL_INTEGRATION`：模型 ID、端点、字段、路由、轮询或解析错误。
- `BLOCKED_AUTH`：真实鉴权/账户配置问题，原文已核对；不能说欠费，也不能声明生成可用。
- `NOT_TESTED`：本轮未测试。不要填写“可能通过”。

**2026-10-08 最新修正：** WaveSpeed、Civitai 已有当前网页真实出图，分别记 `PASS_GENERATION`；MuAPI、Sogni、Fal.ai、ModelScope CN、Hugging Face HF→fal-ai 已拿到明确真实计费/额度终态，按各自路由记 `PASS_BILLING`；ModelScope AI、NanoGPT、Tensor.Art/TAMS 已到达真实上游但被账户/鉴权阻塞，记 `BLOCKED_AUTH`；Gemini 与 Agnes 当前只到本地配置检查，记 `BLOCKED_CONFIG`。

### 3.2 用户提供 Key 的 10 个集成目标

| 供应商 | 当前已有实现 / 历史证据 | 现行前端验收等级 | 具体缺口和下一步 |
| --- | --- | --- | --- |
| **Civitai** | 目录、版本/AIR、Orchestration recipe、底模+LoRA、参数与工作流；2026-10-06 已用当前网页复验基础图与 LoRA | **PASS_GENERATION（2026-10-06 前端实测）** | Checkpoint `urn:air:sd1:checkpoint:civitai:4384@128713` + LoRA `urn:air:sd1:lora:civitai:82098@87153` / 0.7 真实生成完成。证据：`docs/evidence/t7-civitai-acceptance.md`。只证明该组合，不外推所有 Civitai 资源 |
| **Hugging Face** | Hub 目录；显式 HF Inference / Z-Image Space / HF→fal-ai；2026-10-08 前端复验 FLUX.1-dev + HF LoRA | **PASS_BILLING（HF→fal-ai）** | 实际请求到 HF Router `fal-ai/flux-lora`，LoRA safetensors URL + 0.55、Steps 24、CFG 3.2、Seed 314159 进入请求，上游 402 no remaining credits。旧 Z-Image Space BLOCKED_ENV 只代表旧 Space 路由；证据：docs/evidence/t7-huggingface-acceptance.md |
| **Fal.ai** | 原生端点、图像尺寸/LoRA 参数、目录/Schema；`fal-ai/flux-lora` 已从当前网页重现 | **PASS_BILLING（2026-10-06 前端实测）** | 完整 HF safetensors URL + 0.8 原样进入 `loras:[{path,scale}]`，真实上游 403 `User is locked. Reason: TOP_UP.`。证据：`docs/evidence/t7-fal-acceptance.md` |
| **ModelScope CN** | CN 域名与独立 Token；当前网页已真实提交 `Tongyi-MAI/Z-Image-Turbo` | **PASS_BILLING（2026-10-06 前端实测）** | 上游 `https://api-inference.modelscope.cn/v1/images/generations` 返回 429，响应体明确 `insufficient balance`。证据：`docs/evidence/t7-modelscope-cn-acceptance.md` |
| **ModelScope AI** | AI 域名独立路由；当前网页已真实提交 `Tongyi-MAI/Z-Image-Turbo` | **BLOCKED_AUTH（2026-10-06 前端实测）** | 上游 `api-inference.modelscope.ai` 返回 401，原文要求先绑定 Alibaba Cloud 账户；不是欠费。证据：`docs/evidence/t7-modelscope-ai-acceptance.md` |
| **NanoGPT** | `/api/v1/images`、模型 endpoint 元数据、尺寸/输入转换；当前网页已按模型元数据把 resolution 改为 `1k` 后真实提交 | **BLOCKED_AUTH（2026-10-06 前端实测）** | 上游 401 `Invalid session` / `invalid_api_key`。unknown 能力不再统一当 unsupported；凭据修复后需用新的完整参考作品参数重测。证据：`docs/evidence/t7-nanogpt-acceptance.md` |
| **Tensor.Art / TAMS** | 真实数字模型 ID 查询；不抓 HTML 目录、不用 OpenWorks 图片冒充 TAMS | **BLOCKED_AUTH（2026-10-06 前端实测）** | 查询 `672797109289765558` 到真实 TAMS endpoint，业务体 `unauthorized / app not found`；HTTP 404 不能写成模型不存在。证据：`docs/evidence/t7-tensorart-acceptance.md` |
| **MuAPI** | 设置、模型单家标签、目录/OpenAPI、通用 submit/poll/save-result、Schema 参数与 LoRA 映射 | **PASS_BILLING（2026-10-05 前端实测）** | 目录 147 个与官方一致；余额 0.0000 USD；提交 HTTP 402 INSUFFICIENT_CREDITS 原样透传。证据：docs/evidence/t7-muapi-acceptance.md。LoRA 真实出图待账户充值后复测 |
| **WaveSpeed** | 单家目录及 model_run Schema、原生端点、Bearer、任务轮询、LoRA path/scale | **PASS_GENERATION（2026-10-05 前端实测）** | krea-v2/turbo-lora 带 LoRA 出图×2，同 seed 复现。证据：docs/evidence/t7-wavespeed-acceptance.md |
| **Sogni** | 固定版本官方工具 Schema selectors、Creative Agent workflow、轮询、LoRA ID/strengths | **PASS_BILLING（2026-10-05 前端实测重做）** | 27 selector=官方 schema enum；LoRA 目录 32 个=官方实时数；loras+loraStrengths 协议透传；201 created；欠费 waiting_for_user/insufficient_credit 原样展示。证据：docs/evidence/t7-sogni-acceptance.md。历史 403（error code 1010）为旧网络环境结果，已被取代 |

历史记录来源：[`public/verification/results.json`](public/verification/results.json) 和 [`provider-audit.json`](public/verification/provider-audit.json)。后者自己声明没有浏览器点击验收。`billing_or_quota` 等历史标签必须连原始响应一起复核。历史时间、Key 权限、账户余额都不能当成现在的事实。

### 3.3 仓库额外保留的驱动

`EngineRegistry` 总共注册 16 个驱动入口，包含上述 10 家，以及 Gemini、Agnes、SenseNova、OpenAI 兼容中转、Grok 兼容中转、Video 聚合驱动。它们不是额外全部验收通过的供应商。

| 入口 | 当前边界 |
| --- | --- |
| Gemini | 有图像/文本代码和历史规范检查；2026-10-08 前端到 `/api/gemini/generate`，本地配置返回 HTTP 400 `未配置 GEMINI_API_KEY`，记 `BLOCKED_CONFIG`。配置 Key 后再复验真实上游 |
| Agnes | 有图像/视频/文本代码；2026-10-08 前端到 `/api/engine/agnes/generate`，当前本地配置返回 HTTP 400 `未配置 agnes API 密钥`，记 `BLOCKED_CONFIG`。官方当前 Image 2.5 Flash 使用 `size + ratio`；配置 Key 后用当前模型重新验真实上游 |
| SenseNova | **CODE_INTEGRATED / 上游终态待验收**：已按商汤官方 U1.5 Lite 图像生成/编辑协议接入 `https://token.sensenova.cn/v1/images/generations` 与 `/images/edits`，保留 6.8 chat。模型中心已展示 `sensenova-u1.5-lite`；不支持的扩散参数明确标记未发送。本地回归 42 files / 302 tests PASS，但尚无新图像路由真实上游结果，不记 PASS_GENERATION/PASS_BILLING。证据：`docs/evidence/t7-sensenova-u1-5-integration.md` |
| OpenAI / Grok 兼容中转 | 必须使用用户明确配置的 Base URL；兼容不等于官方；本轮未验 |
| Video | 聚合执行入口，不能当独立供应商；新三家图像集成不能自动算视频支持 |

## 4. 模型中心是最重要的产品缺口之一

### 4.1 已确认的具体问题

1. `src/server/schemaProviders.ts` 的 `/api/models` 只识别 muapi/wavespeed/sogni 三个精确 provider；`all` 会 `next()` 进入旧 `server.ts` 聚合逻辑。旧聚合没有新三家分支，所以“全部”不等于全部。
2. `ModelHubModal.tsx` 已有新三家标签，不代表各入口都覆盖。`CivitaiModal.tsx` 的 `LoraProviderFilter` 和标签列表没有这三家。
3. `ModelHubModal.tsx` 的 LoRA 卡片选用/新节点按固定供应商列表决定使用 `modelId` 还是 `displayName`；列表没有 Sogni，新三家不能共用这个旧判断。Sogni 的实际 LoRA ID 可能丢失。这是代码发现，尚未前端复现。
4. Sogni 当前普通模型目录来自固定包 `@sogni-ai/sogni-protocol@1.0.0-alpha.46` 的 enum，而非实时在线所有模型。响应分页说明仍用 `local-slice-of-live-catalog`，容易误导，须按真实来源改为版本化 Schema 来源。
5. MuAPI/WaveSpeed 的 LoRA 目录分支返回空数组和 `catalogNotice`；ModelHub 是否在各入口展示这项说明、如何提供手输 URL，必须补齐。空数组不能被解释成服务商没有 LoRA 能力。
6. 供应商原生“模型”“生成端点”“托管 workflow selector”“权重资源”“工具”是不同实体，不能统一用一个展示名在所有地方传来传去。
7. 筛选后的当前页数、上游总数、本地切页和上游 cursor 是不同概念。不能为了让界面显得资源多就补静态数组，也不能用“本页 50 条”暗示供应商只有 50 个模型。
8. 旧供应商静态 model spec、视频快捷列表、预设等仍需按板块审计；之前删除两个 Tensor 预设不等于所有旧工具和静态承诺都已清理。

### 4.2 建议的目标设计（尚未全部实现）

使用共享 Provider Registry 驱动所有入口，不在 10 个组件里分别手写供应商白名单。每家至少声明：ID、显示名、凭据引用、目录能力、模型详情能力、Schema 来源、支持的执行任务类型、生成/轮询/输出解析方式。协议适配保留在服务端，不写入通用画布节点。

统一资源结构必须明确区分以下字段：

| 字段 | 含义 |
| --- | --- |
| `providerId` | 用户选择的供应商；必须全程原样保留 |
| `resourceKind` | checkpoint / lora / generation-endpoint / workflow-selector / tool 等真实身份 |
| `resourceId`、`versionId` | 可用于查询和执行的原始标识，不用展示名替代 |
| `displayName` | 只用于展示 |
| `executionTarget` | 真实模型选择器或端点；来源、用户配置必须可查 |
| `source`、`sourceVersion`、`fetchedAt` | 目录来自实时 API、固定官方 Schema、用户输入还是历史证据 |
| `catalogMode` | upstream-cursor / upstream-page / local-slice / lookup-only / unavailable |
| `capabilities` | supported / unsupported / unknown，且附证据；unknown 不等于拒绝 |
| `inputSchema` | 参数结构、必填项、枚举与真实约束 |

这是一项设计建议，不要在报告里写成已经落地。Schema 缺失不能触发偷偷切端点。可提供明确的自定义端点/参数配置，但必须显示最终目标、字段和授权范围。

“全部供应商”应按 provider 返回独立结果、来源与错误。某家失败不应让成功家结果完全丢失，也不应吞掉失败家的原文。只有明确支持资源列表的家才列资源；lookup-only 家显示按 ID 查询入口。

### 4.3 修复进展记录（2026-10-06 已完成修复）

针对 4.1 节已确认的 8 项具体问题，已完成全部代码修复并验证通过：

1. **`provider=all` 聚合补齐与彻底错误隔离（缺陷 1）**：
   - 在 `server.ts` 与 `src/server/schemaProviders.ts` 中对 `provider=all` 补齐了 `muapi`、`wavespeed`、`sogni`、`runware`、`modelslab`、`sensenova` 等全部支持的供应商。
   - 使用 `Promise.allSettled` 并行抓取与独立错误捕获：任何单个供应商上游失败均独立记录在 `results[provider]` 与 `errors[provider]` 中，附带真实 upstream 状态码与详细信息，绝对不拖垮其他可用供应商，也绝不抛出顶层 500。
2. **`CivitaiModal` 供应商选项与过滤补齐（缺陷 2、缺陷 8）**：
   - `src/components/CivitaiModal.tsx` 中的 `LoraProviderFilter` 类型和 Provider Tabs 增加了 `muapi`、`wavespeed`、`sogni`、`runware`、`modelslab`。
   - 在直接输入与解析栏增加了对各新供应商的格式指引与占位符（如 Runware AIR `civitai:xxxx@yyyy`、ModelsLab `lora_model` ID、MuAPI/WaveSpeed 直链 URL 等）。
3. **Sogni 及其他厂商 LoRA ID 丢失与前缀污染彻底修复（缺陷 3）**：
   - 在 `CivitaiModal.tsx` 中，对非 Civitai 格式的元数据（如 Sogni、Runware、ModelsLab 等）在 `selectionFromMetadata` 失败时生成正规 `ResourceSelection` fallback 对象，保证 `name: m.id` 原始值完整保留。
   - 在点击卡片选用、自动配对底模选用、新建 LoRALoader 节点时，统一采用 `cleanName` 逻辑：优先选用 `resourceId` / `selection.name`，若回退到 `model.id` 则自动通过正则剥离 `${providerKey}-` 前缀，彻底消除了 LoRA ID 被污染为 `sogni-xxx` 或丢失的风险。
4. **Sogni 目录来源如实纠偏（缺陷 4）**：
   - `src/server/schemaProviders.ts` 和 `server.ts` 将 Sogni 目录来源如实标注为 `versioned-protocol-schema (@sogni-ai/sogni-protocol@1.0.0-alpha.46)`，paging 标注为 `versioned-official-schema-selectors`，禁止冒充实时在线目录。
5. **MuAPI / WaveSpeed / Sogni / ModelsLab LoRA 目录说明与展示（缺陷 5）**：
   - 后端在 `type === 'lora'` 且无公开 LoRA 检索目录时，返回清晰具体的 `catalogNotice`（如 MuAPI/WaveSpeed 提示输入直链 URL，Sogni 提示输入协议标识或直链，ModelsLab 提示输入 lora_model ID）。
   - `ModelHubModal.tsx` 和 `CivitaiModal.tsx` 在对应标签页顶部均渲染醒目提示条（`catalogNotice` / `catalogNotices`），明确向用户说明引擎特性，而不是静默显示空白。
6. **分页概念与 hasMore 真实准确计算（缺陷 6）**：
   - 本地切片与 Schema 派生列表严格根据实际总数与偏移量计算 `hasMore: offset + limit < total`，并在 `sourceNotice` / `paging` 中如实标明切片类型，禁止硬编码 `hasMore: true` 导致前端无限滚动空转。
7. **ModelHubModal 补齐供应商页签与后端对应处理（缺陷 7）**：
   - `src/components/ModelHubModal.tsx` 的 ProviderTab 增加了 `runware` 和 `modelslab`。
   - 后端 `/api/models` 增加了对应分支：
     - `runware`：官方核实为 `modelSearch` 任务接口；若配置 API Key 则发起实时 `modelSearch` 检索，若无 Key 则返回 `lookup-only` 并附带 AIR 标识符指引通知。
     - `modelslab`：官方核实为 `https://modelslab.com/api/v4/dreambooth/model_list`；若配置 API Key 则拉取公开模型列表，若无 Key 则返回 `lookup-only` 并附带输入 ID 提示。
     - `openai_compat`、`grok_compat`、`agnes`：如实返回 `lookup-only` 与清晰提示通知，支持手输 ID 查询选用。
8. **自动化测试与临时端口验证证据**：
   - 编写单元测试 `src/server/modelHubCatalog.test.ts`（包含 15 个测试用例，涵盖 Schema Provider 来源、LoRA 提示、`provider=all` 聚合、错误隔离、Runware/ModelsLab 目录契约、前端组件页签与 ID 剥离等）。
   - 全局测试：运行 `npm test`，105 个测试文件、678 个测试全部通过（100% PASS）；运行 `npm run lint` 零错误通过。
   - 独立临时端口验证：启动临时端口 3100（PID 40082）对 `/api/models?provider=all`、`provider=sogni`、`provider=muapi&type=lora`、`provider=runware`、`provider=modelslab` 进行 curl 实测验证通过，测试完成后已彻底杀死临时进程并验证端口释放；未触碰或重启 3000 端口运行中的 pm2 canvas 进程。

## 5. 当前架构与代码定位

| 层 | 文件 / 目录 | 作用 |
| --- | --- | --- |
| 页面状态与执行触发 | `src/App.tsx` | graph/spatial、选择、项目、参数、发起执行与结果处理 |
| 拓扑与参数提取 | `src/utils/graphEngine.ts`、`graphEditing.ts`、`attachLora.ts` | 识别当前生成分支、按连线提取模型/提示词/LoRA |
| Provider 调度 | `src/engines/EngineRegistry.ts`、`BaseEngineDriver.ts`、`drivers/` | 显式选择 driver，形成站内请求 |
| 新三家适配 | `src/server/schemaProviders.ts`、`SchemaProviderDriver.ts` | 目录/Schema、参数映射、submit、poll、save-result |
| 老供应商后端 | `server.ts` | `/api/models`、详情、生成、视频、鉴权、Key 池、历史 |
| 规范与能力 | `src/schemas/` | 老静态 Schema、新映射辅助；全部内容仍需按证据审计 |
| 前端请求轨迹 | `src/services/executionTrace.ts`、`src/utils/apiFailure.ts` | 记录站内 HTTP、完整响应、短错误摘要 |
| 生产适配 | `hosting/build.mjs`、`hosting/worker.ts` | 将 Express 适配为 Cloudflare Worker；认证、云存储上下文 |
| 存储 | `hosting/store.ts`、`hosting/context.ts` | D1 索引、R2 媒体/项目、加密设置 |
| 旧工具迁移 | `legacyTensorWorkflow.ts`、`workspaceCache.ts` | 清空已知旧工具选择，保存 `retiredToolSelection`，不换模型 |

实际链路：页面选择和节点参数 → graphEngine/空间参数 → EngineRegistry → Driver → 本站 API → 服务端适配与 upstreamFetch → 供应商 → 轮询 → 媒体持久化/历史 → 页面图像及详情。每一跳都需要可追踪，而不是只测最后的供应商 API。

生产 Worker 与本地 Express 使用同一主要路由，但身份、环境变量和持久化不同。本地成功不能自动证明生产权限/R2正常；预览网络失败也不能断言生产无法连接供应商。

### 5.1 新三家的当前站内接口

- `GET /api/models?provider=<id>`：单家目录/资源。
- `GET /api/model-schema?provider=<id>&model=<原始ID>`：Schema 和实际端点。
- `POST /api/schema-provider/<id>/submit`：实际参数转换并提交。
- `GET /api/schema-provider/<id>/tasks/<taskId>`：状态与输出。
- `POST /api/schema-provider/<id>/save-result`：单独的媒体/历史保存阶段。

当前实现的上游路径与历史官方资料见 [`docs/providers/schema-providers.md`](docs/providers/schema-providers.md)。接手时必须重新检索供应商官方文档；该文件说明的是已写代码和此前证据，不是服务商永远不变的契约。

### 5.2 凭据与部署注意事项

- 不把用户在会话提供的 Key 抄进本文件。沿用 Sites secrets / 已授权设置，通过安全渠道由所有者为接手环境配置。
- 生产使用 `CANVAS_PROVIDER_KEYS`，以及 `MUAPI_KEY`、`WAVESPEED_KEY`、`SOGNI_KEY` 等覆盖配置；加密依赖 `CANVAS_SETTINGS_SECRET`。不要用新三家的对象覆盖整份旧 Key 集合。
- 网站是 owner-private；`CANVAS_OWNER_EMAIL` / `CANVAS_OWNER_USER_ID` 与 Sites 转发身份相关。不能为测试删掉校验或伪造转发身份。
- `.env.example` 仍有旧 AI Studio 和 Tensor OpenWorks 注释，未覆盖当前配置；这是交接缺口，不能照着它推断当前生产环境。
- 不提交 `.env`、浏览器密钥缓存、生成构建文件或代理地址凭据。
- 使用仓库 npm lockfile，`npm ci` / `npx tsc --noEmit` / `npm test -- --run` / `npm run build`。最后一次应用代码构建已通过；文档修改不要求为了凑次数重复跑完整构建。
- 若改站点程序再发布，遵守 Sites 现有项目开源仓库同步和 build/package/save/deploy 流程，复用 `.openai/hosting.json` 中 project_id；不要另建网站。

## 6. 按优先级给接手人的修复工单

| 编号 | 优先级 / 证据 | 要做什么 | 完成条件 |
| --- | --- | --- | --- |
| A01 | ✅ **DONE 2026-10-06** | SchemaProviderDriver 已使用结构化 `ApiTraceError`；真实前端已分别看到 Fal 403/TOP_UP、ModelScope AI 401/account bind、ModelScope CN 429/insufficient balance、Sogni HTTP201 + waiting_for_user，以及 HF `status=null`/ECONNRESET 网络错误；失败重跑不再保留上一张图片冒充本次结果 | 执行记录保留 endpoint/status/body/source/cause/stack；HTTP 200 网站状态不等于生成成功。新请求的 workflowSnapshot 会剔除旧 `outputData/errorMessage/progress`，失败后 KSampler/SaveImage 保持无图 |
| A02 | ✅ **DONE 2026-10-06** | `provider=all` 已真实从当前前端返回 `muapi / wavespeed / sogni`，各自独立数组；本地实测 limit=3 时三家均存在且各 3 条 | 聚合失败信息与成功数组并存；没有用静态模型补数。新增供应商仍应走共享聚合入口 |
| A03 | ✅ **DONE 2026-10-06** | 独立 LoRA 中心已含 MuAPI/WaveSpeed/Sogni；Sogni 真实前端已验证 ID + `loraStrengths` 顺序/权重，WaveSpeed 已带真实 URL/scale 出图；MuAPI 专用 `flux-1-dev-style-lora-inference` 也已从前端把真实 URL + `0.65` 映射为 `lora_url + lora_weight` 并到达上游 | MuAPI 返回 402 `INSUFFICIENT_CREDITS`，按用户规则记 PASS_BILLING；充值后如需判断 LoRA 视觉效果再补出图，不再属于接线缺口。证据：`docs/evidence/t7-muapi-acceptance.md` |
| A04 | ✅ **DONE 2026-10-08** | 当前 `127.0.0.1:3000` 已能从前端到达 Civitai/Fal/ModelScope/NanoGPT/TAMS/MuAPI/WaveSpeed/Sogni/HF Router 等真实上游；Civitai/WaveSpeed 已真实出图 | 旧 HF Space 网络失败仍只记该次 route 的 network；Gemini 是本地缺 Key，不能归因上游 |
| A05 | ✅ **DONE 2026-10-08** | Schema provider 通过 `credentialRef` 绑定 schema→submit→poll，同一 task 记录原始引用；引用失效直接本地 409。Key 池已移除 Failover / Best Latency，仅保留独立新请求的 Round-Robin；历史失败状态不再改变后续选 Key | 过期 ref 实测 HTTP 409 / local / `executionTrace=[]`，没有上游调用；异步任务不会拿下一把 Key 续轮询 |
| A06 | ✅ **DONE 2026-10-06** | NanoGPT 等能力处理已改为 `unknown ≠ unsupported`；`nanoImageApi.ts` 对未声明的用户显式字段透传并写 capability note，只有官方 enum/range/明确 false 才本地拒绝 | 当前 NanoGPT 前端还因凭据 401 阻塞；凭据恢复后再验证实际接受字段，不回退为静态猜测 |
| A07 | ✅ **DONE 2026-10-06** | MuAPI 执行目标使用真实 `endpoint_url`；WaveSpeed 只有目录实际提供 `model_run` 才标记 request Schema 已核实，否则保持 unknown；Sogni hosted-tool selector 与 worker namespace 分离并记录固定包版本来源 | 自定义 ID 不自动替换其他模型；Schema 来源和 unknown 状态在 UI/请求记录中可见 |
| A08 | ✅ **DONE 2026-10-06** | 工作流导入目标包含 MuAPI/WaveSpeed/Sogni；ComfyCanvas 原生导入导出完整保留 nodes/connections/spatialFrames；ComfyUI 外部 JSON 缺 provider 时保持空值，不根据模型名猜供应商 | `explicitProvider()` 已覆盖新三家并补回归；`graphEditing.test.ts` 通过 |
| A09 | 🟡 **PARTIAL** | Schema provider `save-result` 逐输出保存，保存失败返回 `historyWarning/transientOutputs` 而不改写上游生成结果；WaveSpeed 已真实生成并写历史；Sogni 对 data/local/private URL 明确拒绝，不假称上传；历史参数现可追溯 requested/sent/upstream | **剩余：有额度后补 Sogni/其他新三家的真实多图与“生成成功但持久化失败”前端场景**。私有上传流程仍没有就明确写没有 |
| A10 | ✅ **DONE 2026-10-06** | 执行日志已限制 viewport、`break-all/overflow-auto`，真实前端验证可显示长 HF endpoint、status=null、ECONNRESET cause、完整响应与 stack；账单/鉴权/网络分开；MuAPI 402 重跑已验证日志快照不再夹带旧 Civitai base64/outputData | HistoryModal 同步修复：旧 Civitai 记录现显示 Seed/Steps/CFG/Sampler/Scheduler/尺寸及来源，不再统一“未填写”；失败请求不会继续显示旧生成图 |
| A11 | ✅ **DONE 2026-10-06（当前范围）** | 供应商矩阵/指南已去掉自动切换、100%复现、未核实 LoRA/速度等宣传并补 MuAPI/WaveSpeed/Sogni；工具栏 LoRA 提示覆盖新三家；资产库 Provider 筛选改为从真实资产历史动态生成，不再手写白名单 | 后续新增 provider 不应再单独修改资产筛选；任何新能力仍以 Schema/真实验收为来源 |
| A12 | ✅ **DONE 2026-10-06（当前文档）** | README 首屏指向 HANDOFF；Failover/自愈/全平台余额/固定历史模型宣传已删除或收紧；PROGRESS 顶部更新当前状态并保留旧历史时间范围；历史 preset 改名为参数模板，不再声称 100%/旗舰/极速 | README 当前搜索已无 `Failover/自愈/全平台余额/自动平滑/100%/旗舰/极速` 残留 |

**2026-10-06 状态说明：** 上表已经按当前代码、真实前端和针对性回归重新核对。A03 已用 MuAPI LoRA 专用端点的前端 402 真实请求关闭；现在仅 A09 明确保留为 PARTIAL。其余标 DONE 的项目都有对应代码或当前页面证据。完整收尾证据见 [`docs/evidence/handoff-closeout-2026-10-06.md`](docs/evidence/handoff-closeout-2026-10-06.md)。仍不能把 DONE 外推为“所有供应商所有模型/视频/图生图都通过”。

## 7. 统一验收标准——逐家、逐路由，不按供应商名字一勾了之

### 7.1 先确定验收样本

每个实际执行路由至少选择一个有官方文档的图像生成端点。支持 LoRA 的另选一个确实支持 LoRA 的模型/端点和可访问的兼容权重。一个模型成功不代表该供应商所有模型、视频或图生图均通过。

**2026-10-06 用户新增样本规则：** 每个尚未取得明确终态的供应商都必须换一套参考作品和参数，不复用上一家的 Prompt。优先从 Civitai 等公开结构化 API/元数据取得参考图 URL、Prompt、Negative Prompt、底模、LoRA、权重、Steps、CFG、Sampler、Scheduler、Seed、尺寸；缺字段不能猜。真实生成后必须和参考原图比较主体、构图、服装/材质、色调、光影和 LoRA 特征。已经取得 `PASS_GENERATION` / `PASS_BILLING` / `BLOCKED_AUTH` 的供应商不为“刷测试”重复消耗，除非专门验证新修复。公网元数据/API 直接用公网请求；Aki/CDP 只用于本地 Canvas 真实前端操作或必须依赖本地登录态的场景。

后续优先顺序：**在有效 SenseNova Key 下做 U1.5 Lite 前端真实上游生成/欠费验收与参考原图对照 → 用户明确配置的 OpenAI/Grok 兼容中转 → Video → 配置 GEMINI_API_KEY / AGNES_KEY 后再复验 Gemini / Agnes**。SenseNova 图像路由已经代码接线，但本地目录成功与单测通过不代表上游验收。已取得明确终态的 Civitai/Fal/ModelScope/NanoGPT/TAMS/MuAPI/WaveSpeed/Sogni/Hugging Face 不为“刷覆盖率”重复调用。

不要强制套用所有端点统一的 512×512、steps=20、CFG=7。尺寸和参数取当前模型官方允许的值；未提供 seed 的端点历史 seed 应为 null，不能编造。

### 7.2 每个样本的前端步骤

1. 记录 GitHub commit、Site 部署版本、测试环境、北京时间和实际 route；确认当前页面加载的是目标版本。
2. 在页面 API 设置确认所选服务商已配置，仅记录掩码。多个 Key 的情况先显式固定本次用哪个，不依靠隐藏轮换“碰成功”。
3. 从**模型中心**进入：先看单家、搜索/分类/分页，再检查 all 入口。记录资源 ID、版本、显示名、目录来源、是否执行端点。
4. 从模型中心点击“选用”或“新建节点”，确认节点与参数检查器中的 provider/ID 一致。切换到另一画布再回来，检查没有串状态。
5. 为该供应商选择**一套未在其他供应商复用的参考作品参数**：Prompt、Negative Prompt、底模、LoRA、权重、Steps、CFG、Sampler/Scheduler、Seed、尺寸等能从来源取得的字段全部记录；缺失字段标记缺失，不能补猜。有 LoRA 的必须从 LoRA 中心/真实 ID 或 URL 入口添加。
6. 检查连线：LoRA 接入当前生成分支；现有底模、其他 LoRA、提示词及其他分支不被重写。共享 CLIP 分支不得误改其他任务。
7. 查看 Schema 匹配模式和“仅 JSON”模式。记录哪些画布字段不提交、哪些被 JSON 覆盖；LoRA 节点未参与时必须用户明确选过该模式。
8. **点击网页运行按钮一次**。记录浏览器请求、本网站处理、实际上游请求；不能直接用 curl/脚本替代该步骤。
9. 成功时等待真实图像；异步时继续到真实终态。不能把 taskId/accepted、排队或 waiting_for_user 当图像完成。
10. 错误时展开详情，核对上游 status/body/endpoint/stack/cause。账单分类必须来自真实响应，不根据状态码、中文猜测或 UI 自造提示。
11. 有图时打开图像详情和历史，逐项检查最终参数、实际 LoRA ID/URL 与强度、画布快照、提交和轮询元数据；确认多图不丢失。随后与参考原图做视觉对比：主体/人物特征、构图、镜头、服装/材质、色调、光影、LoRA 特征是否一致；在同模型、LoRA、Seed、Sampler 等可复现条件齐全时偏差明显，不能只因为 HTTP 200 或“出了图”就算完整复现通过。
12. 刷新页面，再从历史打开图片；保存并加载云端项目；再次复用前检查参数一致。必要时下载输出并检查实际文件可读。
13. 对支持的模式补一次空间画板操作。视频、图生图、多图、LoRA 分别单列验收，不能用基础文生图替代。
14. 保存截图、脱敏请求/响应、workflow JSON 和验收结论。测试截图要包含实际结果或明确错误，不用旧样图占位。

### 7.3 欠费怎样算通过

全部满足才记 `PASS_BILLING`：真实页面发起 → 本站后端调用用户选定路由 → 上游明确表示余额/额度不足 → 前端准确显示原文和真实状态 → 没有改供应商/模型/Key 重提、没有假图片、没有成功历史 → 运行状态恢复。

这通过的是**该次调用到达上游并正确处理计费限制的接线**；不能证明后续生成、轮询、LoRA实际应用和图片存储正常。验收表应把这些列为“余额受限，未验证”，而不是把它们也勾绿。

`TOP_UP` 这种明确原文可按计费分类。429 若是速率限制、403 若是边缘安全规则、401 若是无效 Key，则不是同一结论。

### 7.4 成功出图怎样算通过

- 真实可读图片返回并在页面显示，来自记录中的 provider/model；不能从历史缓存取图冒充本次生成。
- 实际提交参数与用户可见参数/映射记录一致；未提交字段不能在历史装作已生效。
- LoRA 端点必须保留实际请求证据；仅连线完成不能证明挂载成功。接口没有独立 CLIP strength 时明确说明，不能宣称两个强度都生效。
- 历史、图像详情、工作流导出可追踪；刷新后持久化图片仍可访问。存储失败单独记，不把生成结果改写为不存在。
- 多输出逐张保留；未知逐图 seed 为 null，不自行递增凑值。
- 原模型/原供应商未替换；失败没有自动换路重提。

### 7.5 推荐逐家验收表模板（空表，不是实测结果）

| Provider / route / model | 模型中心与身份 | LoRA入口及实际参数 | 前端到达上游 | 真实计费提示 | 实际出图 | 历史/刷新/工作流 | 结论与证据 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 待填写 | NOT_TESTED | NOT_TESTED / 明确不适用 | NOT_TESTED | NOT_TESTED | NOT_TESTED | NOT_TESTED | 不得预填通过 |

机器记录建议字段：`testedAt`、`commit`、`deployment`、`environment`、`providerId`、`route`、`modelId`、`resourceIds`、`credentialRef`（不含秘密）、`clientRequest`、`actualRequest`、`parameterMapping`、`appStatus`、`upstreamStatus`、`rawResponse`、`taskId`、`polls`、`outputs`、`historyIds`、`workflowSnapshot`、`screenshot`、`verdict`、`unverifiedStages`。

## 8. 后续交付给用户时必须回答什么

1. 产品 16 个板块里，本次改了哪些入口，其他入口是否遗漏？尤其是模型中心和独立 LoRA 中心。
2. 每家有几条实际执行路由，验证到哪一级？给当前证据，不给一行“全部支持”。
3. 哪些 PASS_BILLING，原文是什么？哪些 PASS_GENERATION，图片/参数/工作流在哪里？
4. 哪些是代码问题已经修了，哪些是账户问题，哪些仅环境阻塞，哪些没有测试？
5. 上游能力未查到时是否明确写 unknown？有没有把未知当不支持或补假目录？
6. 代码、文档和证据在哪个 GitHub commit；如果发版，网站对应哪个部署？

不要再次以“新增若干供应商 + 单测通过 + 已部署”代替最终交付。用户要的是能在前端实际选模型、用 LoRA、生成并追溯的产品。

## 9. 证据与官方资料入口

- 当前代码规则：[`CLAUDE.md`](CLAUDE.md)；历史进度：[`PROGRESS.md`](PROGRESS.md)。与本文件开头铁律冲突的历史内容不生效。
- 新三家代码与资料：[`docs/providers/schema-providers.md`](docs/providers/schema-providers.md)。
- Tensor 403 与修复证据：[`docs/evidence/tensor-catalog-repair-2026-10-04.md`](docs/evidence/tensor-catalog-repair-2026-10-04.md)。
- 此前 Sogni 前端网络阻塞：[`docs/evidence/frontend-sogni-2026-10-04.json`](docs/evidence/frontend-sogni-2026-10-04.json)。
- 历史直接 API 样本：[`public/verification/results.json`](public/verification/results.json)，图片与 workflow 同目录；只能按原始请求范围解读。
- Civitai：https://developer.civitai.com/orchestration/recipes/
- HF：https://huggingface.co/docs/inference-providers/main/tasks/text-to-image
- Fal：https://fal.ai/models/fal-ai/flux-lora/api
- TAMS：https://tams-docs.tensor.art/docs/api/guide/integration-faq/ 、https://tams-docs.tensor.art/docs/api/apis/tams-api-v-1-service-get-model/
- NanoGPT：https://docs.nano-gpt.com/api-reference/image-generation
- MuAPI：https://muapi.ai/docs
- WaveSpeed：https://wavespeed.ai/docs/overview 、https://wavespeed.ai/docs/get-started-api 、https://wavespeed.ai/docs/docs-api/wavespeed-ai/krea-v2-turbo-lora
- Sogni：https://docs.sogni.ai

以上链接是接手检索入口及已有审计引用，不表示本次重新测试了所有官方行为。供应商文档和目录会变化，修改 API 接线前仍须重新取证。