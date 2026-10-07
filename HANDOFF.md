# ComfyCanvas Studio：开发交接、产品缺口与验收手册

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

### 0.7 2026-10-08 最新状态——后文旧结论与本节冲突时，以本节为准

完整收尾证据：[`docs/evidence/handoff-closeout-2026-10-08.md`](docs/evidence/handoff-closeout-2026-10-08.md)。

当前明确终态：

| Provider | 当前等级 | 边界 |
| --- | --- | --- |
| Civitai | **PASS_GENERATION** | 当前网页基础图与 LoRA 图真实生成；只证明已测 AIR/LoRA 组合 |
| WaveSpeed | **PASS_GENERATION** | krea-v2/turbo-lora 带 LoRA 真出图 |
| MuAPI | **PASS_BILLING** | 普通路由和 LoRA 专用路由都到真实上游 402；LoRA URL + 0.65 已进入 actualRequest |
| Sogni | **PASS_BILLING** | LoRA ID/strengths 透传，task created，insufficient_credit 原样展示 |
| Fal.ai | **PASS_BILLING** | fal-ai/flux-lora 到真实上游，403 TOP_UP 原样展示 |
| ModelScope CN | **PASS_BILLING** | 429 响应体明确 insufficient balance |
| ModelScope AI | **BLOCKED_AUTH** | 401 原文要求绑定 Alibaba Cloud account |
| NanoGPT | **BLOCKED_AUTH** | 真实上游 401 Invalid session / invalid_api_key |
| Tensor.Art / TAMS | **BLOCKED_AUTH** | 真实模型 ID 查询返回 unauthorized / app not found |
| Hugging Face | **PASS_BILLING** | 2026-10-08 前端显式 HF→fal-ai：FLUX.1-dev + HF LoRA 0.55 真实到 HF Router，HTTP 402 no remaining credits；旧 Z-Image Space BLOCKED_ENV 仅保留为该旧路由历史证据 |

**已取得明确终态的供应商不再为了“刷测试”重复消耗。** Hugging Face 的 HF→fal-ai 路由现已取得 PASS_BILLING；后续未验供应商必须换一套参考作品参数，不复用上一家的 Prompt；有图时必须与参考原图比较主体、构图、材质/服装、色调、光影和 LoRA 特征。Prompt、Negative Prompt、底模、LoRA、权重、Steps、CFG、Sampler、Scheduler、Seed、尺寸等来源缺字段不得猜。公网参考元数据优先直接走公开 API；CDP 只用于本地 Canvas 前端工作流或确实需要浏览器登录态的场景。

本轮另外完成：失败重跑不再残留上一张图片；workflowSnapshot 不再携带旧 outputData/errorMessage/progress；History 已区分 requested / sent / upstream/effective 参数来源，未发送/上游未返回/旧记录未保存不再统一显示“未填写”；A03 MuAPI LoRA 接线缺口已关闭。A09 代码契约和回归已补，剩余只是真实有额度的多图/持久化失败外部场景证据。

## 1. 交接结论：不是已经完整集成

**仍不能宣称“所有供应商、所有模型、所有模式都完成前端验收”。** 但 2026-10-08 已不再是“只有 Civitai 有证据”的状态；具体等级以 0.7 最新状态表为准。下面 2026-10-04/10-05 的记录保留用于追溯，不得覆盖后续更高优先级证据。

本文件中的“已实现”仅表示亲自读到相应代码；“历史证据”表示仓库已有记录；“本轮前端实测”只指本次从页面点击产生的记录。三者严格分开。

### 1.1 仓库、版本与环境

| 项目 | 交接基线 |
| --- | --- |
| GitHub | https://github.com/kim1232aa/Canvas ，分支 `main` |
| 本次交接前 GitHub 提交 | `af68228241e335a53d560e92c750a945949777e1` |
| 对应 Sites 源提交 | `2b986c9cb58132f6107fc630e4860f1a36781f67` |
| 两者相同的源码 tree | `70e0f5e5370173b75754d0c748c725b88ce18550` |
| 网站 | https://comfycanvas-studio.quilts-nock-0mb.chatgpt.site |
| Sites project_id | `appgprj_6abf7823b9648191aed7e4c4f10bbea8` |
| 已成功发布的部署 | `appgdep_6ac22888c5708191ab2bb63304361b66`，环境 revision 4 |
| 活跃工作目录 | `/workspace/scratch/41e4078474ce/comfycanvas-resume` |
| 历史验证 | 35 个测试文件、267 个测试通过；TypeScript 与生产构建通过，均不是出图验收 |

旧 `canvas/`、`canvas-source/` 副本不是当前代码。接手人在新环境应以 GitHub 最新 main 为起点。Site 与 GitHub 使用独立 Git 提交历史，不能仅比较 commit SHA 判断内容不同，应比较 tree 或具体文件。此次交接只追加文档和真实证据，不改产品代码、不因文档更新重新发布网站。

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
| 5 | **独立 LoRA 中心** | `CivitaiModal.tsx`、`attachLora.ts` | Civitai/HF/Tensor/魔搭/Fal/MuAPI/WaveSpeed/Sogni 入口；URL/ID 与目录资源分开处理 | MuAPI/WaveSpeed 无已核实权重目录时只接受目标端点可读取的 URL；Sogni 保留真实资源 ID；all 标签不猜供应商 |
| 6 | 视频模型与视频生成 | `ModelHubModal.tsx`、`VideoDriver.ts`、`/api/video/generate` | 独立分类入口和旧驱动 | 新三家的图像驱动不等于视频已接入；目录出现视频端点不等于执行、参数、轮询已正确 |
| 7 | 参数检查器 / JSON Schema | `ParameterInspector.tsx`、`ApiParameterEditor.tsx`、`providerSchema.ts` | 新三家动态 Schema、JSON、映射模式 | 老供应商还有静态规范与“未核实即不支持”；完整 Schema 组合字段、oneOf 等覆盖未全验 |
| 8 | API 设置 / Key 池 | `BackendSettingsModal.tsx`、`server.ts` KeyPoolManager | 新三家 Key 项、服务端环境与加密设置 | 连接测试不等于生成；Key 池在 schema/submit/poll 各次选 Key，任务凭据绑定需审计；环境示例过时 |
| 9 | 工作流预设 / 导入 / 导出 | `WorkflowPresetsModal.tsx`、`presets.ts`、导入函数 | 预设、图像参数提取、保存和导入拓扑 | `selectedEngine`/部分按钮枚举遗漏新三家；现有通用 JSON 导入能力与专属提取入口必须分别验证 |
| 10 | 生成历史 | `HistoryModal.tsx`、`recordHistoryItem`、`hosting/store.ts` | 参数、快照、多图记录和媒体保存 | 每家真实输出、逐图参数、刷新恢复、复用后请求一致未全验；历史样图不是本轮通过证明 |
| 11 | 云端项目 | `CloudProjectModal.tsx`、`hosting/store.ts` | 保存、加载、克隆、D1/R2 | 所有新参数/ID/LoRA 能否无损 round-trip；私有身份和环境差异须验 |
| 12 | 资产管理 / 复用 | `AssetManagerModal.tsx`、`App.tsx` | 媒体与参数复用、筛选 | 未找到新三家完整专属筛选项；跨画布复用不能重新猜 provider，不能将资源名代 ID |
| 13 | 供应商能力矩阵 | `ProviderMatrixModal.tsx` | 旧供应商说明，Tensor 文案已修 | 新三家尚未完整列入；静态宣传式能力和速度不应当事实，需来源与实测状态 |
| 14 | 执行记录 / 错误详情 | `ExecutionLog.tsx`、`executionTrace.ts`、`apiFailure.ts` | 真实路由、请求、响应、stack/cause | 新三家驱动错误分类与新异常格式不兼容；部分老目录仍 HTTP 200 包错误；长端点 UI 仍有溢出 |
| 15 | 图像详情 / 参数查看 | `ImageDetailModal.tsx` | 图像与元信息查看 | 逐图 seed、实际提交参数、LoRA 与工作流是否完整，原请求与展示值是否一致 |
| 16 | 使用指南 / 说明 | `ComfyGuideModal.tsx`、README、CLAUDE、PROGRESS | 指南和历史审计 | 历史自动回退、全量模型、全支持、验收完成等说法仍有残留；不能直接照旧文档实施 |

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

~~**按用户最新的前端标准，目前没有足够证据把任何一家在本轮直接勾为完整 PASS_GENERATION 或 PASS_BILLING。**~~（2026-10-05 修正：此句已被推翻——WaveSpeed/MuAPI/Sogni 已按该标准完成前端验收，见下行修正说明与 PROGRESS.md 2026-10-05 节。修正理由：本句写于 10-04，当时三家仅 CODE_ONLY/BLOCKED_ENV；10-05 已补齐真实前端证据。）Civitai 的相对完善和历史出图是真的有记录；差的是按此标准补一次当前网页闭环证据。

### 3.2 用户提供 Key 的 10 个集成目标

| 供应商 | 当前已有实现 / 历史证据 | 现行前端验收等级 | 具体缺口和下一步 |
| --- | --- | --- | --- |
| **Civitai** | 目录、版本/AIR、Orchestration recipe、底模+LoRA、参数与工作流；历史 `civitai`、`civitai-lora` 为 generated 并有图片 | **相对最完善；DIRECT_EVIDENCE；本轮前端 NOT_TESTED** | 先保留已有实现，用历史已成功的确切 AIR/LoRA 组合从网页复验；核对版本 ID、权重、持久化和历史复用。不能假定所有下载模型都允许在线生成 |
| **Hugging Face** | Hub 目录；显式 HF Inference / Z-Image Space / HF→fal-ai；2026-10-08 前端复验 FLUX.1-dev + HF LoRA | **PASS_BILLING（HF→fal-ai）** | 实际请求到 HF Router `fal-ai/flux-lora`，LoRA safetensors URL + 0.55、Steps 24、CFG 3.2、Seed 314159 进入请求，上游 402 no remaining credits。旧 Z-Image Space BLOCKED_ENV 只代表旧 Space 路由；证据：docs/evidence/t7-huggingface-acceptance.md |
| **Fal.ai** | 原生端点、图像尺寸/LoRA 参数、目录/Schema；历史 `fal-ai/flux-lora` 返回 403 `TOP_UP` | **DIRECT_EVIDENCE；前端 NOT_TESTED** | 优先从前端重现同路由。若仍是原文 `User is locked. Reason: TOP_UP.` 且界面正确显示，即可记 PASS_BILLING；不得因为旧直调曾欠费直接勾通过 |
| **ModelScope CN** | CN 域名、Token、异步任务、LoRA 映射；历史 429 记录 | **DIRECT_EVIDENCE；前端 NOT_TESTED** | 核对响应体是否明确额度，不能只看 429；前端提交字段与云 REST 契约复核；模型目录与在线权限分离；按当前代码核验，不照旧文档“全部不支持”处理 |
| **ModelScope AI** | AI 域名独立路由；历史一把 Key 额度/限额，另一把账户配置 401 | **DIRECT_EVIDENCE；前端 NOT_TESTED** | CN/AI 不混 Key、不换域名；分别验证用户指定账户。绑定账户问题是 BLOCKED_AUTH，不是欠费；完善目录→选择→实际 task 链路 |
| **NanoGPT** | `/api/v1/images`、模型 endpoint 元数据、尺寸/输入转换；历史 401 `invalid_api_key` | **DIRECT_EVIDENCE；前端 NOT_TESTED** | 当前授权未通过。`nanoImageApi.ts` 仍把“未核实”写成“不支持”并拦截一批字段，须查官方能力后整改；LoRA 不能一概声称可用或不支持 |
| **Tensor.Art / TAMS** | 真实数字模型 ID、模型详情、job、LoRA ID/weight；删除工具底模预设与 HTML 抓取；历史 TAMS 404 unauthorized/app not found | **DIRECT_EVIDENCE；TAMS 前端 NOT_TESTED** | 列表 API 缺失与生成授权分开处理。当前按 ID 查询；不能抓被挑战页面冒充稳定目录。旧 OpenWorks 图片不证明 TAMS 模型或 LoRA 成功；需要正确 TAMS 应用授权并复核端点/鉴权 |
| **MuAPI** | 设置、实时目录/OpenAPI、submit/poll/save-result、Schema 参数与 LoRA 映射；2026-10-06 补测 LoRA 专用端点 | **PASS_BILLING** | 普通路由与 `flux-1-dev-style-lora-inference` 均真实到上游 402；LoRA actualRequest 为 `lora_url + lora_weight=0.65`。充值后出图只用于视觉效果确认，不再是接线缺口 |
| **WaveSpeed** | 单家目录及 model_run Schema、原生端点、Bearer、任务轮询、LoRA path/scale | **PASS_GENERATION（2026-10-05 前端实测）** | krea-v2/turbo-lora 带 LoRA 出图×2，同 seed 复现。证据：docs/evidence/t7-wavespeed-acceptance.md |
| **Sogni** | 固定版本官方工具 Schema selectors、Creative Agent workflow、轮询、LoRA ID/strengths | **PASS_BILLING（2026-10-05 前端实测重做）** | 27 selector=官方 schema enum；LoRA 目录 32 个=官方实时数；loras+loraStrengths 协议透传；201 created；欠费 waiting_for_user/insufficient_credit 原样展示。证据：docs/evidence/t7-sogni-acceptance.md。历史 403（error code 1010）为旧网络环境结果，已被取代 |

历史记录来源：[`public/verification/results.json`](public/verification/results.json) 和 [`provider-audit.json`](public/verification/provider-audit.json)。后者自己声明没有浏览器点击验收。`billing_or_quota` 等历史标签必须连原始响应一起复核。历史时间、Key 权限、账户余额都不能当成现在的事实。

### 3.3 仓库额外保留的驱动

`EngineRegistry` 总共注册 16 个驱动入口，包含上述 10 家，以及 Gemini、Agnes、SenseNova、OpenAI 兼容中转、Grok 兼容中转、Video 聚合驱动。它们不是额外全部验收通过的供应商。

| 入口 | 当前边界 |
| --- | --- |
| Gemini | 有图像/文本代码和历史规范检查；本轮无真实 Key 的前端验收 |
| Agnes | 有图像/视频/文本相关旧代码；本轮未验，不承诺能力或模型仍有效 |
| SenseNova | 主要为 chat/reasoning；不能当已经支持图片生成 |
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
| A01 | ✅ **DONE 2026-10-08** | SchemaProviderDriver 使用结构化 `ApiTraceError`；真实前端已分别看到 Fal 403/TOP_UP、ModelScope AI 401/account bind、ModelScope CN 429/insufficient balance、Sogni 201 + waiting_for_user、HF status=null/ECONNRESET；失败重跑不再保留上一张图 | 执行记录保留 endpoint/status/body/source/cause/stack；HTTP 200 网站状态不等于生成成功。新 workflowSnapshot 剔除旧 `outputData/errorMessage/executionProgress` |
| A02 | ✅ **DONE 2026-10-08** | MuAPI/WaveSpeed/Sogni 已进入共享模型聚合；单家目录与 per-provider error 保持独立 | all 聚合不以静态模型补数；某家失败不吞其他家成功结果 |
| A03 | ✅ **DONE 2026-10-08** | LoRA 中心已含 MuAPI/WaveSpeed/Sogni；Sogni 保留真实 ID；MuAPI/WaveSpeed 无权重目录时只接受真实 URL；MuAPI `flux-1-dev-style-lora-inference` 已把 LoRA URL + `0.65` 映射为 `lora_url + lora_weight` 并真实到达上游 | MuAPI 返回 402 `INSUFFICIENT_CREDITS`，按用户规则属于 PASS_BILLING；充值后出图只用于视觉效果确认，不再是接线缺口 |
| A04 | ✅ **DONE 2026-10-08** | 当前前端已到达 Civitai/Fal/ModelScope/NanoGPT/TAMS/MuAPI/WaveSpeed/Sogni 等真实上游，且 Civitai/WaveSpeed 已真实出图 | 单个 HF 路由网络失败只记该 route 的 network，不外推整个环境/供应商 |
| A05 | ✅ **DONE 2026-10-08** | Schema provider 使用 opaque `credentialRef` 绑定 schema→submit→poll；同一 task 绑定原始引用，driver 自动沿用 | 引用缺失/失效本地 409，明确“未自动切换 Key”，不再为同一任务重新 `getNextKey()` |
| A06 | ✅ **DONE 2026-10-08** | NanoGPT 等能力处理已改为 `unknown ≠ unsupported`；未声明字段不再统一当“不支持” | 只有明确 enum/range/false 才本地拒绝；用户显式参数与 capability note 保持可追溯 |
| A07 | ✅ **DONE 2026-10-08** | MuAPI 使用真实 `endpoint_url`；WaveSpeed 只有目录提供 `model_run` 才将 Schema 标成已核实；Sogni hosted-tool selector 与 worker namespace 分离 | 自定义 ID 不替换成其他模型；Schema 缺失保持 unknown，不装作完整 |
| A08 | ✅ **DONE 2026-10-08** | 工作流导入/导出保留 MuAPI/WaveSpeed/Sogni provider；外部 JSON 缺 provider 时保持未指定，不按模型名猜供应商 | 原生工程 round-trip 保留 nodes/connections/spatialFrames；旧 Tensor/OpenWorks 工具不会复活 |
| A09 | 🟡 **PARTIAL** | `save-result` 已逐图持久化；部分失败返回 `historyWarning + transientOutputs`，不改写上游生成成功；Sogni 对 data/blob/local/private URL 本地拒绝；历史参数 provenance 已可追溯 | 代码契约与回归已补。剩余仅真实有额度情况下的“多图 + 某图持久化失败”前端实景证据；不能故意制造生产故障冒充验收 |
| A10 | ✅ **DONE 2026-10-08** | 执行日志支持长 endpoint/完整 body/stack；History 区分 requested/sent/upstream；失败重跑清旧图，MuAPI 402 请求快照不再夹带旧 Civitai base64 | 欠费/鉴权/网络/参数错误分开；“未发送/上游未返回/旧记录未保存”不再混成“未填写” |
| A11 | ✅ **DONE 2026-10-08（当前范围）** | 资产 Provider 筛选已按真实历史动态生成；LoRA/模型入口新三家已覆盖；矩阵/指南需持续以 Schema/实测同步 | 后续新增 provider 不再维护静态资产白名单；任何新能力必须有来源/实测，不写假速度、假支持 |
| A12 | ✅ **DONE 2026-10-08（文档口径）** | HANDOFF 顶部与 PROGRESS 已以 2026-10-08 为最新；旧段落明确标历史；README/矩阵/指南正在按本收尾同步去除 failover、自愈、100%复现与未核实能力宣传 | 最新状态区优先级最高；旧证据不能覆盖当前实测；动态目录数量不写成永久承诺 |

**2026-10-08 状态说明：** A01–A08、A10–A12 已按当前范围关闭；A09 仅剩真实有额度外部场景证据。DONE 不代表“所有供应商所有模型/视频/图生图都通过”，具体 provider 等级仍以 §0.7 为准。

## 7. 统一验收标准——逐家、逐路由，不按供应商名字一勾了之

### 7.1 先确定验收样本

每个实际执行路由至少选择一个有官方文档的图像生成端点。支持 LoRA 的另选一个确实支持 LoRA 的模型/端点和可访问的兼容权重。一个模型成功不代表该供应商所有模型、视频或图生图均通过。

优先顺序建议：**不要重测已取得明确终态的 Civitai/WaveSpeed/MuAPI/Sogni/Fal/ModelScope/NanoGPT/TAMS**；优先补 Hugging Face 当前明确推理路由，其次 Gemini/Agnes/兼容中转/Video 等尚未取得当前终态的路由。供应商可并行调查，前端修改/集成最好一个负责人避免冲突。

不要强制套用所有端点统一的 512×512、steps=20、CFG=7。尺寸和参数取当前模型官方允许的值；未提供 seed 的端点历史 seed 应为 null，不能编造。

### 7.2 每个样本的前端步骤

1. 记录 GitHub commit、Site 部署版本、测试环境、北京时间和实际 route；确认当前页面加载的是目标版本。
2. 在页面 API 设置确认所选服务商已配置，仅记录掩码。多个 Key 的情况先显式固定本次用哪个，不依靠隐藏轮换“碰成功”。
3. 从**模型中心**进入：先看单家、搜索/分类/分页，再检查 all 入口。记录资源 ID、版本、显示名、目录来源、是否执行端点。
4. 从模型中心点击“选用”或“新建节点”，确认节点与参数检查器中的 provider/ID 一致。切换到另一画布再回来，检查没有串状态。
5. 为该供应商选择**一套未在其他供应商复用的参考作品参数**。Prompt、Negative Prompt、底模、LoRA、LoRA 权重、Steps、CFG、Sampler/Scheduler、Seed、尺寸等来源可得字段全部记录；缺失字段标缺失，不补猜。有 LoRA 的必须从 LoRA 中心/真实 ID 或 URL 入口添加。
6. 检查连线：LoRA 接入当前生成分支；现有底模、其他 LoRA、提示词及其他分支不被重写。共享 CLIP 分支不得误改其他任务。
7. 查看 Schema 匹配模式和“仅 JSON”模式。记录哪些画布字段不提交、哪些被 JSON 覆盖；LoRA 节点未参与时必须用户明确选过该模式。
8. **点击网页运行按钮一次**。记录浏览器请求、本网站处理、实际上游请求；不能直接用 curl/脚本替代该步骤。
9. 成功时等待真实图像；异步时继续到真实终态。不能把 taskId/accepted、排队或 waiting_for_user 当图像完成。
10. 错误时展开详情，核对上游 status/body/endpoint/stack/cause。账单分类必须来自真实响应，不根据状态码、中文猜测或 UI 自造提示。
11. 有图时打开图像详情和历史，逐项检查最终参数、实际 LoRA ID/URL 与强度、画布快照、提交和轮询元数据；确认多图不丢失。随后与参考原图比较主体、构图、镜头、服装/材质、色调、光影和 LoRA 特征；同模型/LoRA/Seed/Sampler 等复现条件齐全却偏差明显时，不能只因 HTTP 200 或“出了图”就算完整复现通过。
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
