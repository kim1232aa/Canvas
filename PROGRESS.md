# Canvas Provider API 接线修复进度表

## 1. 计划与执行路线
- [x] 13. 上游请求日志 helper（server.ts `upstreamFetch` / `upstreamSdkCall`，写 logs/upstream.log，key 掩码，URL 去 query 敏感参数；logs/ 已加入 .gitignore）
- [x] 1. Gemini（删除 Imagen 分支与 imagen-3.0-generate-002 全部默认值；统一 generateContent；model 缺失 400；删除 2.5→3.8 静默换模；negative_prompt/seed/cfg/guidance_scale/steps/loras → 400；非 data: 参考图 → 400；前端节点/预设/面板/normalizer 同步；normalizeForGemini 不再把 LoRA 触发词拼进提示词）
- [x] 2. Agnes（视频: POST /v1/videos + 轮询 /agnesapi，mode=text/keyframe，seconds 字符串，size 720P；生图: extra_body.image 参考图；reject unsupported seed/negative_prompt/steps/cfg/loras；history 使用 null；upstreamFetch + keyPoolManager）
- [x] 3. Tensor.Art（删除全部 fuzzy/substring/intent 模糊匹配与 tools[0] 兜底，只接受与 /tool/list 完全一致的 name；model/toolName 必填，缺失 400；key 优先级改为 header>env>settings；buildTensorArtInputs 重写：按工具 schema 描述关键字精确映射请求字段、请求中未被映射的已知字段（steps/cfg/loras/…）→ 400 列出不支持字段名、工具 schema 所需输入在请求体中无值 → 400 列出缺失项；upload 路由转发完整请求体、增加 upstreamFetch + 错误处理；视频路由同步修复；前端 TensorArtDriver model 必填、seed 不再编造 0）
- [x] 4. SenseNova（reasoning 字段 message.reasoning 而非 reasoning_content；model required；resolveProviderAuth + keyPoolManager + upstreamFetch）
- [x] 5. NanoGPT（生图: POST api.nano-gpt.com/api/v1/images，resolution 仅限 "1k"/"2k"/"4k" 不再发像素尺寸，input_references 替代 imageUrl/imageDataUrl；移除全部 LoRA 支持(同时修复 M2)；reject negative_prompt/steps/cfg/guidance_scale/loras/denoise/width/height/size；seed pass-through；视频: polling /api/video/status?requestId= + COMPLETED/FAILED + data.output.video.url；NanoGPTDriver 前端去掉 unsupported params、seed 不再编造 12345；normalizeForNanoGPT 去掉 LoRA/steps/cfg/size；api.ts 类型签名同步）
- [x] 6. ModelScope（生图: X-ModelScope-Async-Mode: true 替代 X-ModelScope-Async: enable；删除 parameters 嵌套包装改为顶层字段；字段名 num_inference_steps 非 steps；删除默认 model；删除不存在的视频端点改为 400 提示切换引擎；reject loras/cfg/denoise/image_url；seed/steps/cfg 历史不再编造；upstreamFetch + keyPoolManager；前端 ModelScopeDriver + ModelScopeAiDriver 去 LoRA/seed 编造/model required；normalizeForModelScope 去 parameters 嵌套 + LoRA + 触发词注入）
- [x] 7. Fal（删除静默 LoRA 端点切换：fal-ai/flux/dev→flux-lora、fast-sdxl→lora 改为 400 + 说明；删除 Civitai token 拼入 LoRA URL 泄漏给 Fal；V2 LoRA scale 不再 ?? 0.8 兜底，缺少 path/scale 则 400；测试/余额路由改为 GET /v1/account/billing 只读不生成；FLUX 端点不接受 negative_prompt → 400；model required；history seed 来自 Fal 返回/payload，不编造 136947637；steps/cfg 仅记录实际发送值；upstreamFetch + keyPoolManager；sampler_name/scheduler → 400）
- [x] 8. HF（删除 SDK→router.huggingface.co 静默重试，只走一条路径 router hf-inference + upstreamFetch；移除未再使用的 HfInference 导入；model 必填；keyPoolManager 轮转+记录成败；parameters 只转发调用方提供的字段，不再注入 25 步 / 7.5 CFG / 1024 尺寸；loras/cfg/denoise/image_url → 400（text-to-image 无这些字段），不再把 LoRA 触发词拼进提示词、不再发 cross_attention_kwargs；Z-Image Space 额外拒绝 negative_prompt/guidance；不再按 LoRA 名称推断 Z-Image；历史只记录实际发送的 seed/steps/cfg（去掉 876105816987345 / 8 / 1.0 / LoRA 0.7 编造）；Z-Image Gradio 位置参数必须有值，其 seed/steps 默认值是真实发给上游的，故如实记录；前端 HuggingFaceDriver model 必填、seed 不再编造 12345、LoRA 不再兜底 0.8；normalizeForHuggingFace 去 LoRA/触发词；api.ts 类型签名同步）
- [x] 9. Civitai（提交改为 POST /v2/consumer/workflows?wait=100，body 为 steps[{$type,input}]，删除未经文档证实的 /recipes/imageGen、/recipes/videoGen 与 wait=true；视频不再强制 engine:minimax，也不默认 wan —— engine 必须由调用方显式提供，否则 400，version/provider/operation 透传；视频轮询识别 failed/expired/canceled；model 必填；keyPoolManager + upstreamFetch）
- [x] 10. 跨 provider 路由（/api/video/generate: model 必填，删除默认 'fal-ai/wan/v2.1/text-to-video' 与 duration/fps/aspect_ratio 默认值；provider 字段为最高优先级分发依据，model 子串推断仅在 provider 缺失时生效；不在白名单中的 provider → 400；civitai 视频走自己的路由 → 400 提示；NanoGPT/Agnes 视频路由不再发未提供的 duration/aspect_ratio；Fal 视频 rejectUnsupported duration/fps/steps/cfg/negative_prompt/loras；VideoDriver 前端删除 videoDuration=5/videoFps=16/aspectRatio='16:9' 默认值、seed 不再编造 42）
- [x] 11. NanoGPT 余额/测试 key（两处 key 测试路由改为 POST api.nano-gpt.com/api/check-balance，只读不生图；upstreamFetch 包装；成功时显示 $余额）
- [x] 12. 假成功（refine-prompt Tier 4 模板兜底删除 → 所有 LLM 层均失败时返回 502 + 明确错误信息；余额查询 balances 路由: Gemini/ModelScope 仅凭 key 存在就报 ok → 改为 unknown + 提示"未发请求"；Imagen 3 文案 → generateContent）
- [x] V1. normalizeFalEndpoint 默认值（视频分支不再默认 wan/v2.1/text-to-video，无法识别的模型返回空串 → 调用方返回 400；fal-ai/ 前缀端点直接透传不做子串降级）
- [x] V2. LoRA 强度兜底（BaseEngineDriver normalizeGenerateParams: strength/modelStrength/clipStrength 不再 ?? 0.8 编造；seed/steps/cfg/width/height/denoise/videoDuration/videoFps/aspectRatio 不再编造默认值 → undefined 透传；normalizeForFal scale 不再 ?? 0.8；normalizeForComfyUI strength_model/strength_clip 不再 ?? 0.8；ImageDetailModal 显示 '—' 当强度未记录；refine-prompt loraContext 强度不再 ?? 0.8）
- [x] K1. 密钥前缀清理（BackendSettingsModal 两处 keyPlaceholder → sk-xxxx；ProviderMatrixModal Fal keyFormat 示例；ComfyGuideModal FAQ 中 5 个 key 前缀与一个用户名；rg 复扫无残留）
- [x] C1. Civitai seed（服务端与 CivitaiDriver 均不再 Math.random 编造；未传则不发、历史为 null）
- [x] C2. Civitai 字段名（sdcpp: sampleMethod/schedule，operation 必填 createImage/createVariant，loras 为 {AIR: 强度} 映射替代 resources 数组；flux1 用 diffuserModel；图生图 image + strength；comfy 分支: sampler/scheduler/denoiseStrength）
- [x] C3. Civitai 默认值（删除 1024/28/6.0/dpmpp_2m/karras/euler/simple/denoise 1.0/LoRA 0.8 兜底，只转发调用方提供的字段；LoRA 缺强度 → 400；无 image_url 时 denoise → 400）
- [x] C4. Civitai 结果提取（优先 steps[].output.images[].url 与 steps[].output.video.url，旧结构仅作后备；wait 整数 100）
- [x] C5. Tensor.Art 参数丢弃（新 buildTensorArtInputs 对请求中的每个已知字段检查是否映射到了工具 schema 输入，未映射的一律 400；历史只记录实际映射到工具的字段值，不编造 seed/steps/cfg；视频响应不再回显未发送的 duration/fps 默认值）
- [x] A1. Agnes/SenseNova key 池（resolveProviderAuth 统一使用 keyPoolManager.getNextKey 轮转，recordResult 记录成败延迟）
- [x] A2. Base URL helper（resolveProviderAuth 统一从 header > settings > env 解析，无 hardcoded 默认值，缺失则 400）
- [x] M1. ModelScope 字段名（num_inference_steps 非 steps；顶层字段无 parameters 嵌套；LoRA 格式未经官方文档核实，暂 400）
- [x] M2. Civitai token 泄漏到 NanoGPT（NanoGPT 生图路由已删除全部 LoRA 下载 URL 拼接；官方不支持 LoRA）
- [x] M3. Tensor.Art LoRA（loras 字段映射不到任何 OpenWorks 工具输入 → 400「该服务商不支持」，与 C5 同一处实现；前端不再对 LoRA 静默透传后被丢弃）
- [x] F1. Civitai AIR 解析（删除按名字猜生态与 SDXL fallbackEcosystem 参数；通过 Civitai 官方 REST API `/api/v1/model-versions/{id}` 与 `/api/v1/models/{id}` 动态解析真实 AIR、baseModel 与 type；未找到时返回 404 及上游真实状态码和响应体）
- [x] F2. 上游日志与请求全量收敛（logs/upstream.log 记录实际发送 model 与返回 actualModel；所有路由返回 actualModel/actualProvider，前端展示实际值；全量替换直接 fetch 为 upstreamFetch；Gemini 模型列表改用 x-goog-api-key 标头；NanoGPT 模型列表删除 .catch 静默降级域名，原样报错）
- [x] F3. normalizeFalEndpoint 保留 fal-ai/flux-lora（不改写为 fal-ai/flux/dev，仅显式选择时使用）
- [x] F4. normalizeFalEndpoint 视频模型校验（不认识的模型返回 400「不认识这个模型: <模型名>」，彻底移除默认视频模型）
- [x] F5. Fal 尺寸结构标准化（发往 Fal 的生图请求全面遵循官方 image_size 结构，支持预设枚举及 {width, height} 对象，不支持的尺寸明确 400）
- [x] F6. Fal model_name 必填校验（移除 SDXL base 写死默认值，模型缺失直接 400）
- [x] F7. 移除 Fal 视频与图像端点自动改写与版本折叠（删除 kling/minimax 版本降级与 SD1.5/Pony 改写为 fast-sdxl，原样透传用户选择）
- [x] F8. 严格校验 LoRA 端点能力（移除 flux/schnell 与 fast-sdxl 自动换端点逻辑，不支持 LoRA 的端点直接返回 400「该端点不支持 LoRA」）
- [x] F9. /api/fal/generate 缺失 model 强制 400（禁止默认 fal-ai/flux/dev）
- [x] V4. 视频参考图校验（带参考图时 Wan/Kling 文生视频端点不再自动偷换为图生视频端点，直接返回 400「这个端点不支持参考图」）
- [x] E1. Gemini 生图尺寸规范（彻底删除 width/height 映射比例逻辑；仅支持官方 aspect_ratio / image_size；接收 width/height 显式 400）
- [x] E2. 视频节点默认模型清理（src/constants/nodes.ts 及预设中的默认视频模型全部清空，用户必须显式选择）
- [x] L1. CheckpointLoaderSimple 节点 targetProvider 清理（删除默认 huggingface；graphEngine 仅显式设置生效；App.tsx 移除兜底；参数面板不再回写推断 provider）
- [x] T1. 移除 LoRA 下载 URL 拼接 Civitai token（防止密钥通过 ?token= 泄露给第三方）
- [x] T2. Fal 账单接口权限处理（核实 GET /v1/account/billing 要求 admin key；401/403 返回 status: unknown，保留原始状态码及解释文案）
- [x] T3. ModelScope 文档核实尝试（WebFetch 确认官方页面客户端渲染；异步头与 LoRA 格式标记为「未能核实」，代码保持 400 明确报错）
- [x] T4. Tensor.Art 官方 OpenWorks 流程核实（对照 GitHub 官方仓库 Tensor-Art/tensorart-skills：/file/upload 请求体与 PUT 流程，任务轮询终态 FINISH/EXCEPTION/CANCELED，CANCELED 记为错误，轮询失败不吞错）
- [x] H2. Hugging Face Z-Image Turbo 空间规范化（whitelisted 33 个官方 resolution，拒绝 width/height，必填 seed/steps，仅支持精确模型 ID）
- [x] Y1. 历史记录透明化（移除 recordHistoryItem 的假 provider 兜底，未发送的 seed/steps/cfg/provider 均记录为 null）
- [x] W1. key 池 bug（A1）：清理 `refreshFromSettings` 重复添加 env 未解析逗号串导致的假 key；所有 provider 均统一走 `parseKeyString`
- [x] W2. Base URL 与多 key 测试解耦：彻底移除 `server.ts` 8 处 SenseNova/Agnes 写死 base URL，未配置显式 400；`/api/test-provider` 与 `/api/cloud-keys/test-single` 逗号多 key 分离逐个测试并返回掩码结果
- [x] W3. refine-prompt 全链路重构：后端强制显式传 provider 与 model（缺少 400「模型为必填项」），只调单一 provider，失败原样返回上游状态码与响应体，移除层级静默降级，移除 style 默认值；前端 `refinePromptWithGemini` 及 `SpatialFrameItem` / `ParameterInspector` / `NodeItem` 从界面/节点/设置读取，未选择提示「请先选择润色模型」
- [x] W4. 视频 `targetProvider` 全链路透传：`NormalizedGenerateParams` 扩展 `provider`/`targetProvider`，`BaseEngineDriver.normalizeGenerateParams` 完整保留，`VideoDriver` 优先使用，`graphEngine.ts` 与 `App.tsx` 取景框透传视频节点的 `targetProvider`
- [x] W5. 轮询吞错修复：Tensor.Art video、NanoGPT video、Agnes video、Civitai video、Tensor.Art image、ModelScope image 等全部 6 处轮询循环遇到非 200 或网络异常立即终止并返回真实状态码和响应体，彻底清除静默 continue / catch
- [x] W6. NanoGPT 测试 key 报错暴露：两处 key 测试路由非 200 时暴露真实上游响应体
- [x] W7. POST /api/history 虚假默认值清除：移除 seed 0、steps 20、cfg 7.0、provider 'Canvas Generated'、model 'unknown'、prompt 'Untitled Generation' 编造默认值，全量改为 null（类型定义及 HistoryModal/ImageDetailModal 同步）
- [x] W8. Agnes 视频参数核实：对照官方文档（https://wiki.agnes-ai.com/en/docs/agnes-video-25-flash.md）核实 `n: 1` 与 `seed` 均为官方支持字段，保留透传；不支持的字段严格 400
- [x] W9. 余额与可用性接口文案修正：`/api/cloud-keys/balances` 彻底消除非 200 误标 `status: 'low'`，非 200 一律 `status: 'error'` 附带真实状态码与响应体；无余额查询接口的服务商统一返回「key 可用（该服务商无余额接口 / 未能核实余额接口）」
- [x] W10. ModelScope LoRA 格式与异步头核实：尝试 WebFetch/WebSearch 抓取官方文档；因页面客户端渲染未能独立核实，保持严格 400 明确报错并标记为「未能核实」
- [x] E1-Finish. Gemini 生图尺寸与比例按模型取值表严格校验：gemini-3.1-flash-image 校验 14 种官方比例与 1K/2K/4K（512px/0.5K 报未能核实 400）；gemini-3.1-flash-lite-image 校验 10 种比例与 1K；gemini-3-pro-image 仅允许 1K/2K/4K，传 aspect_ratio 报未能核实 400；其它模型传尺寸参数一律 400 未能核实；前端移除宽高换算比例逻辑，未选不发；清理视频路由无用 wasAdapted / adaptationNotice 变量与响应字段
- [x] S1. Express 大小写路径绕过修复：注册路由前配置 `app.set('case sensitive routing', true)`；`isApiPath` 转小写再行匹配；确认绑定回环地址 `127.0.0.1`（server.ts:32, 164, 7234）
- [x] S2. `GET /api/cloud-keys/stats` 明文密钥移除与鉴权：`getStats()` 移除明文 `key` 字段，前端仅使用 `maskedKey`；挂载 `requireAdminAuth` 管理令牌鉴权，前端同步带 Bearer token；`lastError` 仅保留状态码与简短分类（HTTP xxx, timeout 等），并经 `maskSecret` 过滤；确认 `GET/POST /api/cloud/settings` 挂载 `requireAdminAuth`（server.ts:221, 555, 6587; src/services/api.ts:706; src/components/BackendSettingsModal.tsx:120）
- [x] S3. `POST /api/cloud/settings` 字段白名单与掩码回写防御：服务端维护 `ALLOWED_SETTINGS_SECRET` 与 `ALLOWED_SETTINGS_PLAIN` 白名单，未知字段 400；值强制 string 类型；空字符串/undefined 视为不修改；拒绝保存掩码值或与当前掩码相同的值；返回对象脱敏掩码（server.ts:7120-7210）
- [x] S4. `/api/cloud-keys/balances` 防御 CSRF / 跨站 `<img>` 触发：GET 请求返回 405 Method Not Allowed；切换为 POST，挂载 `requireAdminAuth` 与 `checkSecFetchSite`（只允许 same-origin / none，跨站拒绝 403，缺省回退 Origin 校验）；确认余额检查全部为只读，绝不发起生成调用；前端调用改为 POST 并携带 Bearer token（server.ts:253, 6668; src/services/api.ts:758; src/components/BackendSettingsModal.tsx:125）
- [x] S5. `/api/cloud-keys/strategy` 鉴权校验、历史记录淘汰与云端同步清洗：挂载 `requireAdminAuth`，校验 provider 属于已知列表且 strategy ∈ `['round_robin', 'failover', 'latency_best']`，前端带 Bearer token；历史记录上限改为淘汰最旧的记录 (`splice(MAX_HISTORY_COUNT)`)，移除满 500 条拒绝 400，共用 `MAX_HISTORY_COUNT = 500` 常量；Admin「同步至云端」按钮过滤已知字段，排除空字符串、掩码值及未改动字段（server.ts:604, 6593, 6853, 6965; src/services/api.ts:721; src/components/BackendSettingsModal.tsx:39, 1055）

## UI 跟进轮（分支 ui-followup，基于 83f5c23）
| 编号 | 状态 | 内容 | 文件:行 |
|:---|:---|:---|:---|
| U-E1 | 已完成（tsc 待跑） | Gemini 取值表抽成唯一共享声明；服务端校验改为读取它（行为不变，unverified 仍 400）；节点与参数面板中 width/height 置灰并标「该服务商不支持」，aspect_ratio/image_size 下拉按模型取值，未选模型时禁用并提示「请先选择模型」；三种状态样式放在一处 | src/shared/providerFieldSpecs.ts:38,82；server.ts:11,5913-5926；src/components/FieldStatusBadge.tsx:7-23；src/components/GeminiFieldSelect.tsx:7；src/components/NodeItem.tsx:553-600；src/components/ParameterInspector.tsx:140,727-797；src/constants/nodes.ts:2,788-795；src/App.tsx:1735,1748-1749,2010-2011 |
| U-E2 | 未开始 | unverified 取值透传上游，已下线的模型标「已下线」 | — |
| U-E3 | 未开始 | 视频节点未选模型时禁用 | — |
| U-E4 | 未开始 | 历史面板显示「未填写」 | — |
| U-E5 | 未开始 | ParameterInspector 切换到 gemini 时不再预设默认模型（ParameterInspector.tsx:317 仍会写 gemini-2.5-flash-image） | — |
| U-E6 | 未开始 | test-single 加 admin token 和 base URL 限制 | — |

U-E1 说明：
- 服务端行为：只有两处错误文案变了，状态码仍是 400。① 对表内模型，不在列表里的值（例如 3.1-flash 传 `0.5K`、2.5 传 `7:3`）现在报「该服务商不支持此取值」，以前报「未能核实」。② 列表内标为 unverified 的值（`512px`、3-pro / 2.5 / preview 的全部候选值）报「未能核实」。
- 前端下拉里 unverified 选项先设为 disabled，因为服务端现在仍会对它返回 400。U-E2 放开后改为可选。
- NodeItem 原来的 select 分支里只有 CheckpointLoaderSimple 和 AIVideoNode 两个特例，没有通用 fallback，所以 GoogleImagenNode 的 model、aspect_ratio、image_size 三个下拉在画布节点上根本没渲染（`return null`）。本项已补上。
- `-preview` 模型只放进共享表（用于下线日期），暂时不进 model 下拉。
- 预设 `gemini-imagen-zero-config` 现在是 model=gemini-2.5-flash-image、aspect_ratio=1:1，UI 会给它标「官方未说明是否生效」。服务端仍会 400（与之前一致），留到 U-E2 / U-E5 处理。

事实核实（2026-09-29 WebFetch）：
| 事实 | URL | 结果 |
|:---|:---|:---|
| 3.1-flash-lite-image 的 aspect_ratio 为 1:1 3:2 2:3 3:4 4:3 4:5 5:4 9:16 16:9 21:9，image_size 只有 1K | https://ai.google.dev/gemini-api/docs/image-generation | 已核实 |
| 3.1-flash-image 的 image_size 为「512px (0.5K)」、1K、2K、4K | 同上 | 已核实；512px 在请求里的确切字符串未能核实 → 标 unverified |
| 3.1-flash-image 的 14 个 aspect_ratio | 同上 | 本次抓取在比例表之前被截断，未能独立核实，沿用 provider-params.md §6 与 d84076f |
| 3-pro-image 支持 1K/2K/4K；它和 2.5-flash-image 的 aspect_ratio 均未列出 | 同上 | 已核实（未列出 → 候选值全部标 unverified） |
| 下线日：2.5-flash-image 为 2026-10-02；3.1-flash-image-preview 与 3-pro-image-preview 为 2026-06-25；3.1-flash-image 与 3-pro-image 未公布 | https://ai.google.dev/gemini-api/docs/deprecations | 已核实（3.1-flash-lite-image 未出现在该页） |

## 2. 踩坑记录
- 行号偏移：旧报告行号基于 909dc26，当前 HEAD 是 35a1566，按代码内容定位。
- .env 里有真实密钥，绝不读取或打印。
- 历史记录：`GeneratedItem.seed/steps/cfg` 改为 `number | null`，`recordHistoryItem` 不再编造随机 seed / steps 28 / cfg 4.5（影响所有 provider，未传即 null）。前端 `NormalizedGenerateResult.seed` 同步为 `number | null`。
- 节点类型名 `GoogleImagenNode` 与预设 id `gemini-imagen-zero-config` 保留不改名：已保存的工作流按此 id 反序列化，改名会破坏用户数据。仅改显示文案与模型值。
- server.ts 余额/测试路由中残留的 "Imagen 3" 文案属于假状态，在 Item 12 一并处理。已修复。
- HF Z-Image Gradio: seed 位置参数必填，原用 876105816987345 作默认值，改为 0（Gradio Space 的 seed 0 = 随机，语义正确且如实记录）。
- BaseEngineDriver normalizeGenerateParams: 删除 width=1024/height=1024/steps=28/cfg=5.0/seed=Math.random/denoise=1.0/videoDuration=5/videoFps=16/aspectRatio 合成值，全部改为 undefined 透传。
- ComfyUI 节点 widget `?? 0.8`（App.tsx graphLoras、graphEngine.ts、WorkflowPresetsModal.tsx）保留：这些是 ComfyUI LoRA 节点的 slider 默认值，类型 `ComfyParameters.modelStrength: number` 要求非空。它们经 BaseEngineDriver 转入 NormalizedGenerateParams 后已改为 undefined 透传，不影响 API。
- BackendSettingsModal provider 名 `Google Gemini & Imagen` → `Google Gemini`。
- Civitai extract-workflow seed 默认值 `Math.random()` / `727217537163565` → null。

## 3. 当前进度
- 当前状态：全部接线项与增补项修复完成（F1–F9、V4、E1、E2、L1、T1–T4、H2、Y1 及前期全部项）；`npx tsc --noEmit` 保持 0 错误。
- 最终扫尾结果：
  - `upstreamFetch` 全面覆盖所有外部 provider 请求（包括各模型列表获取、Civitai 轮询与 REST 查询、Tensor.Art OpenWorks 上传与任务轮询、HF 模型卡与 Gradio、NanoGPT 列表与余额、Gemini 列表等），且自动捕获并传递 `actualModel` 与 `actualProvider`；
  - 彻底清理直接 `fetch` 调用（除 `upstreamFetch` 内部底层调用外）；
  - 彻底移除任何静默降级、域名兜底、模型写死默认值及尺寸比例映射；
  - 严格输入校验：所有不受支持参数均明确返回 HTTP 400 及具体字段名；
  - 历史记录透明化：未发送的字段与伪造的 provider 标签全部置为 null。

## 4. API 事实核实表
| 事实 | 官方文档 URL | 是否核实 | 代码位置 |
|:---|:---|:---|:---|
| Civitai 模型与版本查询: /api/v1/model-versions/{id}, /api/v1/models/{id}，返回真实 air、baseModel、type | https://github.com/civitai/civitai/wiki/REST-API-Reference | 已核实 | server.ts `resolveCivitaiAir` |
| Fal 只读测试: GET api.fal.ai/v1/account/billing 要求 admin API key | https://fal.ai/docs/platform-apis/v1/account/billing | 已核实 | server.ts `falReadOnlyKeyCheck` |
| Fal 生图请求尺寸: image_size 枚举或 {"width": number, "height": number} 对象 | https://fal.ai/models/fal-ai/flux/dev/api | 已核实 | server.ts `/api/fal/generate` |
| Gemini generateContent 尺寸参数: gemini-3.1-flash-image 支持 14 种比例与 1K/2K/4K；gemini-3.1-flash-lite-image 支持 10 种比例与 1K；gemini-3-pro-image 支持 1K/2K/4K，不支持 width/height/seed/steps | https://ai.google.dev/gemini-api/docs/image-generation | 已核实 | server.ts `/api/gemini/generate` |
| Gemini 模型列表授权头: x-goog-api-key | https://ai.google.dev/api/rest | 已核实 | server.ts `/api/hub/models` (gemini) |
| NanoGPT 官方端点: api.nano-gpt.com/api/v1/image-models, video-models，不使用 nano-gpt.com 兜底 | https://docs.nano-gpt.com/ | 已核实 | server.ts `/api/hub/models` (nanogpt) |
| Tensor.Art OpenWorks OpenAPI: PUT 上传流程、任务状态终态 FINISH, EXCEPTION, CANCELED | https://raw.githubusercontent.com/Tensor-Art/tensorart-skills/master/skills/tensorart-generate/SKILL.md | 已核实 | server.ts `/api/tensorart/*` |
| HF Z-Image Turbo Space 接口: resolution 仅限 33 个预设分辨率，seed 与 steps 为必需位置参数 | https://tongyi-mai-z-image-turbo.hf.space/gradio_api/info | 已核实 | server.ts `/api/huggingface/generate` |
| ModelScope 异步头与 LoRA 格式 | modelscope.cn 官方文档客户端渲染，无法核实 | 未能核实（代码 400 明确报错） | server.ts `/api/modelscope/generate` |
|:---|:---|:---|:---|
| Imagen 在 Gemini API 中已关停，用 generateContent | https://ai.google.dev/gemini-api/docs/imagen | 已核实 | — |
| Gemini 当前图像模型: gemini-2.5-flash-image, gemini-3.1-flash-image, gemini-3.1-flash-lite-image, gemini-3-pro-image | https://ai.google.dev/gemini-api/docs/models | 已核实 | — |
| Agnes 视频字段: n (integer, 1), seed (integer), mode ("text" / "keyframe"), seconds ("4"-"12"), Flash size="720P", 轮询 GET /agnesapi?video_id=&model_name= | https://wiki.agnes-ai.com/en/docs/agnes-video-25-flash.md | 已核实 | server.ts /api/video/generate Agnes 分支 |
| Agnes 生图参考图: extra_body.image (字符串数组) | https://wiki.agnes-ai.com/en/docs/agnes-image-25-flash.md | 已核实 | — |
| Agnes /v1/models 是否存在 | 不在官方文档索引中 | 未能核实 | — |
| SenseNova 最终回答 message.content, 推理 message.reasoning | https://github.com/OpenSenseNova/SenseNova6.8/blob/main/API.md | 已核实 | — |
| NanoGPT 余额: POST /api/check-balance, x-api-key | https://docs.nano-gpt.com/api-reference/endpoint/check-balance.md | 已核实 | — |
| NanoGPT 视频状态: GET /api/video/status?requestId=, COMPLETED/FAILED, data.output.video.url | https://docs.nano-gpt.com/api-reference/endpoint/video-status-unified.md | 已核实 | — |
| NanoGPT 生图: POST api.nano-gpt.com/api/v1/images, input_references, 禁止混用 image_url/imageDataUrl | https://docs.nano-gpt.com/api-reference/endpoint/image-api-generate.md | 已核实 | — |
| NanoGPT 生图请求字段: model, prompt, n, resolution("1k"/"2k"/"4k"), aspect_ratio, quality, output_format, seed, input_references；无 size/width/height；成功响应示例文档未给出 | https://docs.nano-gpt.com/api-reference/endpoint/image-api-generate.md | 已核实（响应结构未能核实，代码兼容 data[0].url 等） | server.ts /api/nanogpt/generate |
| NanoGPT 视频提交: POST api.nano-gpt.com/api/generate-video, duration 字符串 | https://docs.nano-gpt.com/api-reference/endpoint/video-generation.md | 已核实 | — |
| Fal 模型列表: GET api.fal.ai/v1/models, Auth optional, 无 401 | https://fal.ai/docs/platform-apis/v1/models | 已核实 | — |
| Civitai wait 参数: 整数秒, 上限 100s | https://developer.civitai.com/orchestration/guide/submitting-work | 已核实 | — |
| Civitai 视频: engine "wan", version, provider, operation | https://developer.civitai.com/orchestration/recipes/wan | 已核实 | — |
| Civitai SDXL sdcpp: sampleMethod/schedule, loras {AIR:weight}, operation 必填 | https://developer.civitai.com/orchestration/recipes/sdxl.md | 已核实 | — |
| Civitai Flux1 sdcpp: diffuserModel (不是 model), sampleMethod/schedule | https://developer.civitai.com/orchestration/recipes/flux1.md | 已核实 | — |
| Civitai 输出: steps[].output.images[].url | https://developer.civitai.com/orchestration/recipes/sdxl.md | 已核实 | server.ts extractCivitaiBlobUrl |
| Civitai 提交: POST /v2/consumer/workflows，body steps[{ "$type": "imageGen", input }] | https://developer.civitai.com/orchestration/recipes/sdxl ; /guide/submitting-work | 已核实（/recipes/imageGen 未在文档中出现） | server.ts /api/civitai/generate |
| Civitai 视频输出: steps[].output.video.url；wan version v2.1–v3.0，provider fal/comfy/civitai | https://developer.civitai.com/orchestration/recipes/wan | 已核实 | 同上 |
| Civitai comfy 引擎: model/sampler/scheduler/denoiseStrength；krea2 的 model 判别值 turbo/base 与 diffusionModel 字段 | https://developer.civitai.com/orchestration/recipes/flux1 仅述及字段名差异 | 未能核实 krea2 细节（保留原逻辑，需人工对照） | 同上 |
| Civitai flux2Dev/flux2Klein/qwen/zImage/anima 在 sdcpp 下用 model 还是 diffuserModel | 未单独查阅各 recipe 页 | 未能核实（目前仅 flux1 用 diffuserModel） | 同上 |
| ModelScope 异步头: X-ModelScope-Async-Mode: true；轮询 /v1/tasks/{id} + X-ModelScope-Task-Type: image_generation；SUCCEED/FAILED；output_images[0] | 间接证据；modelscope.cn 文档页为 JS 渲染，WebFetch 抓不到正文 | 未能核实（需人工对照官方文档） | server.ts /api/modelscope/generate |
| ModelScope 请求体字段 num_inference_steps / guidance_scale / seed / width / height 为顶层 | 同上 | 未能核实（需人工对照官方文档） | 同上 |
| ModelScope LoRA 请求格式 | 同上 | 未能核实 → 服务端 400 拒绝 loras | 同上 |
| ModelScope API-Inference 无视频生成端点 | 任务说明 Item 6 | 未能独立核实 | server.ts /api/video/generate ModelScope 分支改为 400 |
| Fal.ai fal-ai/flux/dev 无 loras 字段、无 negative_prompt | https://fal.ai/models/fal-ai/flux/dev/api | 已核实 | server.ts /api/fal/generate |
| Fal.ai fal-ai/flux-lora 有 loras [{path,scale}]、无 negative_prompt | https://fal.ai/models/fal-ai/flux-lora/api | 已核实 | 同上 |
| Fal.ai fal-ai/fast-sdxl 有 loras [{path,scale}]、有 negative_prompt | https://fal.ai/models/fal-ai/fast-sdxl/api | 已核实 | 同上 |
| Fal.ai fal-ai/lora 有 loras [{path,scale}]、需 model_name | https://fal.ai/models/fal-ai/lora/api | 已核实 | 同上 |
| Fal.ai 只读测试: GET api.fal.ai/v1/account/billing, Auth: Key {key}, 200/401/403, credits.current_balance | https://fal.ai/docs/platform-apis/v1/account/billing | 已核实 | server.ts falReadOnlyKeyCheck |
| HF text-to-image: 返回原始图像字节, inputs/parameters 格式 | https://huggingface.co/docs/inference-providers/tasks/text-to-image | 已核实 | server.ts /api/huggingface/generate |
| Tensor.Art OpenWorks: /tool/list、/task、/task/query、/file/upload，Echo-Access-Key 头，FINISH/SUCCESS/FAILED/EXCEPTION 状态 | tensor.art 下 /openworks、/openworks/docs、/docs/openworks 与 docs.tensor.art/openworks 均 404 | 未能核实（需人工对照官方文档）；代码只做「精确匹配 + 不丢参 + 不编造」，端点与字段沿用原实现 | server.ts /api/tensorart/*、/api/video/generate Tensor.Art 分支 |
| Tensor.Art /file/upload 请求体字段 | 同上 | 未能核实 → 服务端原样转发调用方请求体，不再发送空 {} | server.ts /api/tensorart/upload |
