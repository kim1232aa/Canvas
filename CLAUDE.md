# 项目核心最高规则（用户于 2026-10-04 明确指定，优先于下文历史约束）
1. 调查与断言：第三方 API / 库 / 官方行为必须先网络检索官方证据；本地事实必须亲见代码和实测输出。未证实不得断言。
2. 透明错误与真实路由：禁止暗换 provider、端点、模型、缓存，禁止 mock/fake 冒充成功。完整报告真实 HTTP 状态、响应体、异常堆栈；无 HTTP 响应必须标为网络错误，本地错误必须标明本地。
3. 禁止 fallback 掩盖：失败目录不得填静态快捷项冒充远端模型，禁止因失败悄悄更换服务或路由。
4. 自由度与泛化：画布节点不写死私有端点和模型白名单；支持自定义参数和动态 API Schema。未找到官方字段说明不等于官方明确不支持，不得用“未核实”本地 gate 阻止上游返回事实。
5. 全程可见：本地参数整理不能冒充模型加载、LoRA 在 GPU 上挂载或上游执行成功；公开实际请求、转换与节点状态。
6. 本次用户授权真实生成，按前端完整链路验收。直调 API 和单元测试不能替代网页生成验收。余额不足单独记录，不算出图成功也不据此判定集成失败。
7. Schema 匹配模式必须在 UI 明示并可关闭，未提交的普通画布字段逐项记录值与原因；手写 JSON 保留字段与覆盖值，非空 LoRA 意图不删除。当前模式是请求前的公开协议映射，不是错误后的回退。只有真实上游图片返回才能进入图像成功状态。

### 2026-10-13 架构重构、Replicate 引擎与双轨架构 E2E 落地
- server.ts 模块化解耦：提取 `civitaiWorkflowRoute.ts` 与 `civitaiModelRoutes.ts` 到 `src/server/routes/`，移除超 1000 行庞大单文件堆砌代码，保持与 `hosting/build.mjs` 以及 Vitest 契约切片严格兼容。
- Replicate 官方推理引擎全链路接入：新增 `ReplicateDriver`、`replicateImageContract`、`replicateRoutes`，支持 FLUX.1、SDXL、Ideogram 等模型。后端 `/api/model-schema` 对接 Replicate 官方 OpenAPI Schema 提取 Input 规范。
- 双轨并存补全（方案 B）：彻底打通 `ReplicateEngineNode`、`ModelScopeNode`、`ModelScopeAiNode`、`NanoGPTNode`、`FalAIEngineNode`、`GoogleImagenNode`。`ModernToolDock` 新设「云端一体化加速引擎」分类，`ModelHubModal` 提供「添加一体化引擎节点」专属动作，打通 `NodeItem` 参数白名单与节点级出图渲染。
- 跨模型架构 LoRA 强校验：在 `graphEngine.ts` 建立架构兼容性断言；严禁跨架构挂载时（如 FLUX.1 挂载 SDXL/Krea2 LoRA）静默剔除 LoRA 伪造成功，强制在执行前阻断并抛出架构不兼容错误。
- 无头浏览器 E2E 走查与真实上游实机核验：
  - 无头 Chrome（端口 9225）实测：Dock 成功添加 Replicate 与 NanoGPT 引擎节点；ModelHub 成功添加预填充的 FalAI 引擎节点。
  - 真实网络执行透明回传：FalAI 403 `TOP_UP` 欠费、NanoGPT 401 会话失效、Replicate 402 余额不足、ModelScope 国内 400 模型下线、ModelScope 国际 401 需绑定账号，全链路 0 Mock / 100% 透明。
  - Agnes AI 真实出图成功：产出 1.91 MB PNG 原图（`/api/media/e65c...`），`/api/history` 成功持久化完整快照与 executionTrace。
- 安全底线（CRITICAL）：`.gitignore` 增加 `temp/` 规则，严防浏览器自动化测试中会话凭证及 Cookie 泄露进版本库。
- 契约与透传修复（HIGH 1-8, MEDIUM 1-2）：
  1. Civitai modelId/versionId 纯数字校验 (`/^\d+$/`)，非法字符直接报 400，杜绝向 Civitai 发送无效路径。
  2. extract-workflow 严格互斥校验 `rawText` / `url` / `modelId` / `imageId`，避免模式混淆与静默优先。
  3. Civitai 上游错误透传保留原始 status、errorSource、endpoint 与完整错误体，严禁截断吞错。
  4. extract-workflow 严格可执行性校验，缺失正向提示词或模型信息时 400 拦截，杜绝虚假成功。
  5. Civitai 资源严格区分 Checkpoint 与 LoRA 类型，不把 LoRA 误标为底模。
  6. extract-workflow 移除写死默认值（duration 10, fps 24, aspect 16:9, denoise 1.0, 自动拼接 .safetensors）。
  7. LLM prompt 改写保留前置 LoRA trigger words，在 `promptTransform` 中完整公开原始词、LLM 词与 wire 终态词。
  8. Hugging Face 非 z-image-space 路由遗漏追踪，完整记录 `shift`、`random_seed`、`gallery_images` 及原因。
  9. CivitaiModal 缺失 baseModel 时保留 null，严禁凭模型名称强猜架构，badge 仅作为视觉提示。
  10. NanoGPT 模型目录接口错误原样透传真实 HTTP status 与上游详情，不以空列表掩盖。
- 本地验证状态：`npm run lint` 0 错误；`npm test` 89 files / 773 tests 全绿；`node hosting/check-hosting.mjs` 全过。

### 2026-10-12 接线修复边界
- Runware `lora`、ModelsLab 图生图、ModelScope `size`、异步历史保存、Tensor 目录和兼容中转字段限制已有代码与测试修复。真实上游复验仍受余额或订阅状态阻断，不升级为 PASS_GENERATION。
- 当前本地验证为 75 个测试文件 / 640 个测试通过，类型检查 0 错误。测试通过不代表所有供应商网页生成已验收。

### 2026-10-10 当前验收与禁止误判（优先于下文历史状态）
- 用户已明确授权真实生图，并要求优先 HF → Sogni → MuAPI；生成必须前端点击。仅为 SenseNova size 文档分歧，用户另允许本站端口诊断；诊断不替代网页验收。
- Agnes Video 官方字段为 size，不是 resolution。已见真实上游400拒绝空loras和resolution字段；节点resolution→size修复后真实wire正确，但Flash text仍503 video_queue_full。没有video_id/视频，不记PASS_GENERATION/PASS_BILLING。视频seed、size完整节点提取和映射来源仍在独立复审/修复中。
- SenseNova官方参数表写2K/4K，而本次上游拒绝字面2K和4K，auto与显式2048x2048成功。保留官方与实测分歧；不得静默改参数/端点重试。仓库没有U1.5图像预设写2K，相关失败值来自从Agnes切provider后的旧size残留。Agnes合法2K预设不能因此被改掉。
- SenseNova本次网页文生图和>1MB参考图编辑出图，Agnes图像文生图/相关人物编辑有成功产物；Fal图生图与KlingV3只到403 TOP_UP。精确证据分别在现有t7文档顶节，不扩大为所有模式/所有模型已集成。
- 4个HF token逐个whoami有效；把逗号分隔整个池当单Token的只读401是错误探针，不能当HF账户无效证据。HF Space的status:null/ECONNRESET与Router计费路由必须分开记录，禁止暗切路由。
- 媒体迁移与本轮新增Agnes修复必须独立评审。npm测试通过不等于运行所有供应商；旧记录/磁盘备份/画布参数不得未经授权清除，不能为了迁移或比较版本使用git stash/reset覆盖未知既有改动。

### 2026-10-09 本轮连接域修复与验收边界（优先于下文历史结论）
- 用户要求由 `sub/gpt-6.1-sol` 分任务修确定错误；授权范围是下列连接域，不等于其他供应商全量已修。本轮文档负责人仅更新六份既有文档，不改代码、配置或 keys，不执行 API 测试、浏览器、PM2、commit/push。
- 当前新增修复记 `CODE_ONLY / CONTRACT_TESTED`，生成验收仍 PARTIAL，不记 `PASS_GENERATION`。主 agent 最终 fresh 回传：`npm run lint` 退出 0；`npm test` 61 files / 497 tests 全 PASS，无 localStorage stderr；frontend + hosting Worker build 成功；`git diff --check` 退出 0。既有 Vite `__dirname`、dynamic import 无效、>500KB chunk 警告保留。49/383、55/453 仅为早期历史回归，不作最终数字。
- 独立复审：review42 已关闭；review53（Agnes/Gemini metadata + strict field types）原 2 MEDIUM 全 close；review54 原 final 3 HIGH + quantity MEDIUM 全 close；review55 最后 3 must-fix 闭环，定向 24+4 tests PASS。旧 review43 指定 scope 已闭，不宣称 hooks ESLint 验证。此前待修的 Civitai video dispatch、Agnes video advanced/resolution、专用 cloud JSON UI→extract、上传键盘可达、duration/FPS legacy clear 与空 video entry provider 不猜、Gemini omissions history metadata 合并现为本地契约修复/独立复审关闭，不再列为待修；仍不能外推真实上游通过。
- Kling 图生视频：Driver→本站统一传 `image_url`；server builder 兼容 `image_url` 与旧 `start_image_url`，二者冲突拒绝；最终 Fal Kling V3 wire 使用官方 `start_image_url`。custom video JSON 透传与覆盖必须记录前后值，不可覆盖路由；unknown 字段不是 unsupported。Fal 官方同步 `fal.run` 合法，未使用 queue 不能单独判接线错误。
- Civitai：区分 modelId / versionId / 资源 type，resolver 与 builder 保留完整 AIR，显式记录 engine / ecosystem / modelSelector（站内 `comfyModel`）。Comfy 的 sampler / scheduler 与 sdcpp 的 sampleMethod / schedule 不混用。Face Detailer、Detail Tweaker、Krea 预设使用完整 AIR；2758 是 Checkpoint 而非 LoRA。旧 LoRA 身份不明保留原意图并标待目录重选，不换其他模型。
- ZImage 请求生态为 `zImage`，资源 AIR 的 `zimageturbo` namespace 不改写；请求映射与资源身份分开，未实测 LoCon 推理。Gemini 错误 Imagen 默认不再填入 generateContent 模板，要求用户显式选模型。
- 空间帧 `imageUrl` 是展示结果，不自动作为 input；`referenceImageUrl` 是显式参考源。只有用户明确点击「图生视频」等输入意图操作，才将 result 设为首帧。Agnes 省略 width / height 时由 `extra.omissions` 与 Driver 合并保留原值和原因；不得把未发送字段记作实际生效。
- 主 agent Chrome 154 / CDP 9224 新建「接线修复检查-20261009」保留原 board；仅载入 Krea2 显示 explicit comfy/krea2/turbo 与完整 AIR。初测 positive/negative/latent 重叠，修新 preset row y=80/620/1000 后，重新仅载入 Krea2 8 nodes actual DOM overlaps=[]，append Agnes i2i 4 nodes 后 12 nodes actual DOM overlaps=[]；截图 `temp/repair-browser/krea-layout-fixed.png`、`temp/repair-browser/krea-agnes-layout-fixed.png`。仅代表模板，31 个预设实际 DOM 未全验；明确撤销估算 0 collision/31 抽取成功即全修好的推论。
- 菜单失模型/未核实/缺参考/来源未接通项显示「待配置，不能立即运行」并 disabled；browser performance 只读检索 `generationRequests=[]`。本轮没有生成请求、没有 source 付费；源码新增上传控件不自动解除旧 `BLOCKED_UI`。历史 payload false、10-09 未生成记录保留；10-06 SD1 `4384@128713` + LoRA `82098@87153` / 0.7 的 PASS 只限该组合。
- 主 agent 最终 pm2 restart canvas 成功，PID 176587 / restarts 11；fresh 本地 health online / uptime 14s / history 8 / executionTrace=[]、主页 HTTP 200。旧 process id 2/未 restart 为中间状态；未公开 deploy、未 commit/push，不声明公开站同步。Chrome 154 / CDP 9224 refresh 最新 loaded，代表 12 nodes 保留；此前 actual DOM overlaps=[]，最终刷新未重测 geometry。原 native upload focus @ref 实测 activeElement BUTTON / label「上传本地图片」/ tabIndex 0，只确认焦点可达，不是上传生成。
- 本地补修还包括 AIR canonical/file format metadata 匹配、单版本 modelId shape、多版本不 first、不可解析 AIR reject、入口 metadata verified≠generation ready；SaveImage fail 不清 source、Agnes checkpoint sink/检查器共享 owner、Fal 9:16→720×1280、quantity 3/0 三路径一致；Gemini omissions history metadata 不进 SDK wire；Agnes mode explicit、/videos media 严格类型先拒绝 false/array/object、URL-like sanitize 不抛 InvalidURL。详见 HANDOFF。
- 真正待验：前端上游生成/明确余额终态、reference/图生视频整链、历史刷新/复用/云、31 DOM 全验、unknown resource owner 选择、官方矛盾与 unknown resolution 上游接受性、Krea/ZImage LoCon 推理及视觉效果。测试绿不升 PASS_GENERATION，剩余不裁范围。官方原文与待验清单见三份 `docs/evidence/t7-{fal,civitai,agnes}-acceptance.md`。

### 2026-10-04 Tensor 目录纠正
- TAMS 官方 FAQ 明确暂无模型列表 API。不得继续抓取被 Cloudflare 403 拒绝的网页来伪装目录；当前为明确标注的 ID 单项查询，空列表必须附 lookup-only / catalogAvailable:false。
- OpenWorks 不得作为底模预设或模型 Schema 项。旧选择迁移保留原值，不替换成其他模型；底模驱动禁止按名称自动转工具 API。
- Tensor LoRA 使用真实资源 ID，不能换成展示名加 .safetensors；查询失败不得继续创建占位资源。

以下为历史规则与审计记录；有冲突时以上述用户最新规则为准。

# Project Instructions & Rules

## 仓库所有者的硬性规则
1. 所有 API 事实都必须在本次运行中用 WebFetch/WebSearch 抓取官方文档来核实（只认官方域名）。不许凭记忆。如果找不到文档或文档相互矛盾，在报告里标注「未能核实」，并且让代码返回明确清楚的报错，而不是去猜。
2. 不许静默回退，不许偷换 provider / 模型 / 端点，不许 mock 或伪造成功。错误必须原样暴露，带上真实的上游 HTTP 状态码和响应体。
3. 不许硬编码默认模型（`model || 'xxx'`）：如果缺少模型，返回 400，写明「模型为必填项」。
4. 运行过程中不许调用任何真实的 provider 生成端点，不许使用真实密钥。
5. `npx tsc --noEmit` 必须保持 0 错误。
6. 仓库根目录的 `CLAUDE.md`（上述固定项目规则）和 `PROGRESS.md`（计划、进度、踩坑记录、下一步）必须持续更新；不存在就创建。

## 本次用户授权例外（2026-10-03，北京时间）
- 用户明确授权：有需要可直接调用真实生成，欠费不作为集成失败；可用接口须实际出图，附实际参数、工作流和 LoRA 记录，并符合端点真实能力。该授权仅覆盖本次验证，优先于第 4 条；固定规则原文保留，今后没有同等用户授权时仍执行第 4 条。
- 使用真实 key 前核实官方端点；不在源码、产物或日志中写入完整 key。Sites 运行环境使用加密 secret，浏览器只看到掩码。

## 参数处理规则（适用于所有路由）
- 请求里带了服务商官方不支持的参数（LoRA、seed、负向提示词、steps、CFG、尺寸等）时，返回明确的 400，写出字段名并注明「该服务商不支持」，不许静默丢弃。
- 绝不许把负向提示词合并进正向提示词。
- 绝不许把没有真正发给上游的值（随机 seed、默认 steps/cfg 等）写进历史记录。

## Sites 部署副本
- 原始服务商处理逻辑保留在 `server.ts`；在线环境适配由 `hosting/build.mjs` 生成，生成文件不提交。
- D1 仅保存索引与加密设置，媒体及项目正文使用 R2。数据库变更通过 Drizzle 迁移进行。
- 生产环境通过 Sites 转发的认证邮箱匹配原生 Sites 所有者元数据，并绑定固定账号 ID；不依赖缺失的 user-id 请求头。没有固定邮箱配置的旧部署保留首次访问原子绑定逻辑。保持网站私有访问。
- 运行环境的 `CANVAS_SETTINGS_SECRET` 不得写入源码或日志。

## 当前验收范围
- 完整参数与工作流记录来自请求上下文；实际上游提交 JSON 与画布快照分别保存，不能用 UI 默认值冒充已发送参数。
- 真实图片与验收记录在 `public/verification/`；可复用工作流另存，经拓扑参数提取检查。
- 不支持 LoRA 的接口必须拦截非空 LoRA；不允许静默移除。Civitai 模型可下载不等于已启用在线生成。
- 历史文档中的「100% 支持」「自动切换模型/端点」「全量验证」不代表当前实现或验收结论，以本文件、最新 PROGRESS 和本轮真实响应为准。

## 本轮供应商复核（2026-10-03）
- Tensor.Art 模型 API（TAMS /v1/models、/v1/jobs）与 OpenWorks 工具 API 是不同产品。模型目录不可填工具名，OpenWorks key 不代表模型 API 已鉴权。两把现有 key 对 TAMS 返回 404 unauthorized / app not found。
- TAMS 没有已核实的全量模型列表接口；公共目录仅作资源发现，不承诺在线生成能力。任意真实模型或 LoRA ID 可经详情 API 核实。
- Hugging Face 下载仓库、HF Inference、Space 和 HF Inference Providers 是不同执行路径；必须明确路由。HF → fal-ai 已真实生成 FLUX.1-dev + XLabs Realism LoRA（0.8），禁止把失败 Space 标成成功或静默生成底模。
- NanoGPT 当前使用官方归一化 Image API /api/v1/images；每次提交先读选定模型 endpoint 元数据，按真实 supported_parameters 校验。禁止把 1k/2k/4k 套用于所有模型。
- LoRA 挂载不再根据名称改供应商、底模或采样参数，架构兼容性由对应供应商元数据核实。


### 最终审计约束（2026-10-03）
- ModelScope 本地 Diffusers kwargs 不等于云 REST 契约；当前 width/height/steps/guidance/seed/negative_prompt 标注未核实，显式提交返回 400。Qwen Image Edit 输入图按版本映射。
- 模型发现与在线能力分离。OpenWorks 工具不得再进入模型下拉框；TAMS 经典 DIFFUSION 仅允许已核实架构，不猜测其他架构。
- 多图逐张持久化；批量未返回的逐图 seed 为 null，不按起始 seed 编造。
- 本次出图证明限于 verification/results.json 所列请求；余额不足单独分类。

### 模型目录与 LoRA 挂载补充验收（2026-10-03）
- 节点下拉框与参数检查器共同查询所选供应商目录，不再只显示静态快捷模型。Tensor 分类来自本轮核实的 26 个公共目录链接；每页结果不等于全量模型，不虚构分页。
- 图形模式挂载 LoRA 必须插入当前生成分支的模型链，同时连接对应 CLIP；不得误写空间模式残留选中的画板。多分支目标不明确时要求先选择采样器。
- 挂载保持供应商、底模和既有 LoRA；资源 ID 与权重需经工作流参数提取进入实际请求。目录可见或连线成功不代表 TAMS 已授权。

### Luna 代码复查约束（2026-10-04，北京时间）
- 目录的明确供应商来源优先于模型名称。禁止 Qwen/GLM 等名称覆盖 provider；模型选用和参数检查器只修改所选生成分支，图形编辑不得写入隐藏空间画板。
- HF 的资源类型来自目录元数据，不来自搜索分类；底模不可因在 LoRA 分类下输入而被挂载成 LoRA。
- 共用提示词的生成分支必须先拆开再挂载 LoRA，避免改写共享 CLIP 输入；生成失败状态只影响本次执行子图。
- 资产重用保留真实供应商、seed=0 和固定种子。工作流导入不猜 provider、不填入通用提示词/采样参数；不完整或暂未适配的拓扑保留在图形模式，不伪装成可复现空间画板。
