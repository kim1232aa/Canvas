# Canvas Provider API 接线修复进度表

## 0c. F5 — Gemini canvas seed grey (f5-gemini-seed-grey) — 2026-09-29

Tip hash: 1ad82fa44764056407754f6d72274ca0be02aa1b (branch f5-gemini-seed-grey, not pushed)

### 完成项
- [x] Schema：Gemini 生图模型 `seed` → `unsupported`（cite 生图指南 ImageConfig 仅 aspectRatio/imageSize；https://ai.google.dev/gemini-api/docs/image-generation）
- [x] `isCanvasFieldUnsupported('gemini', …, 'seed')` = true（含空 model）；NodeItem KSampler seed 灰显空值 + placeholder「该服务商不支持」+ 随机骰子禁用；SpatialFrame 同路径
- [x] ParameterInspector：`greySeed` 含 `isGemini`；空值 + placeholder「该服务商不支持」
- [x] generate 路径：`graphEngine` omitSeed for gemini；`GeminiDriver` 不写 body.seed，结果 seed 恒 null；server `/api/gemini/generate` `rejectUnsupported(…, seed)` + history seed null
- [x] 单测：schema / resolveCheckpoint / graphEngine（Civitai 长 seed 导入）/ GeminiDriver；`npx tsc --noEmit`；`npm test`

### 范围外（本 tip 未改）
- Grok editable aspect_ratio / resolution
- Node title stuck as GROK_COMPAT when OpenAI/Gemini selected
- SpatialFrame panel vs canvas prompt mismatch
- 未合并 staging-local / 未重启 3417

---

## 0b. F5 — stop forging seed/sampler defaults (f5-fake-defaults) — 2026-09-29

Tip hash: 5084ddc03661937ec9680ed4b6843d9f929ac137 (F5 code 8de30250de36664d925687dfd63783138e891ce4; branch f5-fake-defaults, not pushed)

### 完成项
- [x] `extractWorkflowParameters` 不再用 `Math.random` / 25 / 5.0 / euler / normal / 1024 初始化所有目标
- [x] GoogleImagenNode：无 seed widget → 不发明 seed；generate body 省略 seed；历史 null
- [x] FalAIEngineNode：空值不再回填 steps=28 / cfg=3.5 / 1024x1024；仅透传节点上真实有的字段
- [x] KSampler：仅 `control_after_generate===randomize` 时随机 seed；fixed/unset 不伪造；去掉 img2img denoise=0.65 编造
- [x] Soft：schema `denoise` FieldKey；gemini / openai_compat / grok_compat 标 unsupported；画布 KSampler denoise + ParameterInspector 灰「该服务商不支持」（Fal/Civitai 未臆造）
- [x] 单测 F5：unset seed → generate 无 seed / res.seed null；无 Math.random（Gemini）；Fal 空值不伪造；`npx tsc --noEmit` 0；`npm test` 57/57

### 残留（QA）
- SpatialFrame 无 denoise 控件 → 无需灰显
- AIVideoNode duration/fps/aspect 默认回填属 F3/F4，本轮未改
- 资产/预设恢复路径若仍有 random seed，属 F5 范围外残留

---

## 0. compat-relays（OpenAI 兼容中转 + Grok 兼容中转）— 2026-09-29

Tip hash: 6426ab6e98ff877eba631203cb3ab26dcbf3ca06 (feat commit d4da15d2c41ff9b14a4d4964fc771d78ebd0e7b4; branch compat-relays / staging-local, not pushed)

### 完成项
- [x] 新增一等公民 provider：`openai_compat`（仅生图/改图）、`grok_compat`（推理+生图+改图+生视频）
- [x] 设置面板标签「兼容中转」；可编辑 Base URL + 掩码 Key（Agnes 同款 `resolveProviderAuth`：header > settings > env；无硬编码域名）
- [x] 设置面板「服务端密钥池」展示掩码 key + 来源徽章；只读「当前服务端 Base URL」（stats.serverBaseUrl，不把 .env URL 写入可编辑浏览器字段）
- [x] Env：`OPENAI_COMPAT_IMAGE_BASE_URL` / `OPENAI_COMPAT_IMAGE_API_KEY`、`GROK_COMPAT_BASE_URL` / `GROK_COMPAT_API_KEY`（见 `.env.example`；测试密钥在仓库外 `/workspace/canvas-secrets/compat-relays.env`，永不提交）
- [x] Grok Base URL 缺 `/v1` 时服务端补全；相对视频 URL 相对 base origin 解析
- [x] providerSchema + UI 灰显「该服务商不支持」：
  - OpenAI 兼容：灰 seed / negative / steps / CFG / sampler / LoRA；保留 size / quality / output_format / background / moderation / n
  - Grok 兼容：灰 seed / negative / steps / CFG / LoRA / width·height；保留 aspect_ratio / resolution（图 1k/1.5k/2k，视频 480p/720p/1080p）/ 图生图 / 视频 duration
- [x] 服务端 `rejectUnsupported` 对上述字段 400；绝不静默丢弃或换商
- [x] Hard QA：画布 NodeItem 对 KSampler seed(+骰子) / EmptyLatent WH / CLIPTextEncodeNegative 按 providerSchema 灰显「该服务商不支持」（Canvas 传入 resolveCheckpointForNode 的 provider，含 openai_compat/grok_compat）
- [x] Hard QA Two-Pass：画布 NodeItem KSampler steps / CFG / sampler / scheduler 与 ParameterInspector 同一套 `isCanvasFieldUnsupported` 灰显「该服务商不支持」（widget 名 `cfg_scale`→`cfg`、`sampler_name`→`sampler`）；SpatialFrame 快捷条同样灰显
- [x] SpatialFrame 种子骰子与宽高徽章同样 schema 灰显
- [x] Modal N（batchSize→extraParams.n）写入请求；size/quality/aspect/resolution 等 compat 选项回写 CheckpointLoader + frame.params（非 UI-only）
- [x] Canvas LoRA 文案统一为「该服务商不支持」（原「该端点不支持」）
- [x] Grok 视频 503 `grok_media_no_eligible_account` 原样返回 status+body；`respect_moderation=false` 无 URL 当失败原样报出
- [x] `npx tsc --noEmit` 0；`npm test` 51/51 pass

### QA 配置步骤（勿把真实 key 写进仓库）
```bash
cd /workspace/Canvas-ui
git checkout compat-relays   # tip 6426ab6e98ff877eba631203cb3ab26dcbf3ca06
set -a; source /workspace/canvas-secrets/compat-relays.env; set +a
# 或在设置面板「OpenAI 兼容中转」「Grok 兼容中转」手填 Base URL + Key
npm run dev   # 勿占用 3417 / 勿动 Canvas-b1-fix
```
设置面板 → 选对应「兼容中转」→ 填 Base URL（OpenAI 通常以 `/v1` 结尾；Grok host 可无 `/v1`，服务端会补）→ 添加 API Key → 保存 → 连通测试（只读 GET /models）。

### 关键文件
- `src/engines/drivers/OpenAICompatDriver.ts` / `GrokCompatDriver.ts` + tests
- `src/engines/compatRelay.ts`（normalize base URL / extract image / resolve relative URL）
- `server.ts`（auth 扩展、generate/chat/video 路由）
- `src/schemas/providerSchema.ts` + test
- `src/components/BackendSettingsModal.tsx` / `ParameterInspector.tsx`

---


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
| U-E2 | 已完成（tsc 0 错误，npm test 16 pass） | 视频节点空模型拦截：model === '' 时生成/运行按钮禁用，按钮及旁白可见「请先选择模型」；NodeItem 控件添加空选项及未选警示旁白；TopBar 运行按钮在视频节点未选模型时禁用并显示旁白；SpatialFrameItem 同步禁用与旁白提示；新建 AIVideoNode 控件与 values 默认 model 统一设为 '' | src/components/NodeItem.tsx；src/components/TopBar.tsx；src/components/SpatialFrameItem.tsx；src/App.tsx；src/constants/nodes.ts |
| U-E3 | 已并入 U-E2 | 视频节点未选模型时禁用与旁白提示 | 见 U-E2 |
| B3 | 已完成（tsc 0 错误，npm test 16 pass） | Gemini 出现在添加菜单：ModernToolDock 添加「Gemini 生图」精选条目（GoogleImagenNode），描述写明官方 Gemini 图像模型（不是已下线 Imagen），无默认模型预选（model default 为 ''） | src/components/ModernToolDock.tsx |
| 404端点删除 | 已完成（tsc 0 错误，npm test 16 pass） | 彻底从下拉与预设中删除已核实 Fal 404 的端点 id（fal-ai/wan/t2v、fal-ai/wan/v2.1/text-to-video、fal-ai/wan/v2.1/image-to-video、fal-ai/stable-diffusion-xl-base-1.0、fal-ai/animagine-xl 等），替换为官方存在端点（fal-ai/wan-t2v、fal-ai/wan-i2v、fal-ai/fast-sdxl），保留手填自定义入口，不给模型贴参数专用的「官方未说明是否生效」标签 | src/constants/nodes.ts；src/engines/drivers/VideoDriver.ts；src/constants/presets.ts；src/utils/baseModelMatcher.ts；src/utils/graphEngine.test.ts |
| Y1-UI (U-E4) | 已完成（tsc 0 错误，npm test 19 pass） | 历史面板空字段显示「未填写」：seed / steps / cfg / model / prompt / negative 等字段若为 null、undefined 或空字符串，显示「未填写」，不要空白，也不把 null 显示成 0；seed 为 0 时如实显示 0；核对服务端 recordHistoryItem 及各 generate 路由，严格存真实发送值，未发送字段记为 null，杜绝假值 | src/components/HistoryModal.tsx；src/components/ImageDetailModal.tsx；src/components/AssetManagerModal.tsx；src/types/providers.ts；server.ts:312,621-645,6902-6908；src/components/HistoryModal.test.ts |
| B1 | 已完成（r2b：tsc 0 错误，npm test 31 pass） | Fal schnell + Koda LoRA **r2b**：`resolveTargetNode` 在 Fal 为唯一/选中云引擎时优先 FalAIEngineNode，不再被僵尸 KSampler+CheckpointLoaderSimple 拐去 Hugging Face；`resolveCheckpointForNode` 对 orphan LoRA 用 sole Fal schnell，永不发明 Z-Image；Fal LoRA 从 socket + 解析到该 Fal 的 LoRALoader 收集；去掉 FalDriver / BaseEngineDriver / extractWorkflowParameters 的客户端预发拦截，真实 POST `/api/fal/generate`，Fal 节点展示 `HTTP 400: 该端点不支持 LoRA…`；HuggingFaceDriver 错误也加 `HTTP ${status}:` 前缀；App catch 只用 Fal/端点文案刷 Fal 节点，不把 HF `该服务商不支持: loras（Hugging Face）` 广播到 Fal。 | src/utils/graphEngine.ts；src/utils/resolveCheckpoint.ts；src/engines/BaseEngineDriver.ts；src/engines/drivers/FalDriver.ts；src/engines/drivers/HuggingFaceDriver.ts；src/App.tsx；tests |

### B1 / 历史种子备注（2026-09-29）
- `fal-ai/wan-t2v` / `fal-ai/wan-i2v` 保留：官方 OpenAPI schema 存在（见 `/workspace/canvas-schema/provider-params.md`）；仅删除无 schema 的 `fal-ai/wan/t2v` 与 `fal-ai/wan/v2.1/*`。
- 历史「未填写」种子（不提交密钥）：
  ```bash
  CANVAS_BASE_URL=http://127.0.0.1:3418 /workspace/canvas-audit/seed-history-weitianxie.sh
  ```
  等价 curl（seed/steps/cfg 省略 → 服务端存 null）：
  ```bash
  curl -sS -X POST "$CANVAS_BASE_URL/api/history" -H 'Content-Type: application/json' \
    -d '{"url":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==","mediaType":"image","prompt":"QA seed：空字段应显示未填写","provider":"fal","model":"fal-ai/flux/schnell"}'
  ```
| U-E5 | 已并入 G4 | 见下方 G4 行 | — |
| U-E6 | 已并入 S6 | test-single 加 admin token 和 base URL 限制 | 见 S6 |
| S6 | 已完成（tsc 0 错误，运行时待验证） | 修复评审 B1：`/api/test-provider` 与 `/api/cloud-keys/test-single` 挂载 `requireAdminAuth`；两路由不再读取 `x-agnes-base-url`/`x-sensenova-base-url`；`getProviderBaseUrl` 删除 `customBaseUrl` 参数，只读 settings/env；测试只打只读接口：Gemini 从 `generateContent` 改为 `models.list`；Agnes/SenseNova/ModelScope 没有可核实的只读接口，返回 `unsupported`「该服务商没有只读测试接口」，不发请求，不记入 key 池；前端两个测试函数带 admin Bearer，失败时显示真实状态码和响应体 | server.ts:675-684,6186-6192,6276-6280,6312-6336,6371,6393-6402,6461,6478-6486；src/services/api.ts:95-121,754-772；src/components/BackendSettingsModal.tsx:317,336,364 |

S6 测试接口核实（2026-09-29 WebFetch）：
| provider | 测试接口 | 只读 | 官方来源 |
|:---|:---|:---|:---|
| civitai | GET https://civitai.com/api/v1/models?limit=1&types=LORA | 是 | https://developer.civitai.com/site/reference/models.md |
| fal | GET https://api.fal.ai/v1/account/billing | 是（需 admin key） | https://fal.ai/docs/platform-apis/v1/account/billing |
| huggingface | GET https://huggingface.co/api/whoami-v2 | 是 | https://huggingface.co/.well-known/openapi.md |
| nanogpt | POST https://api.nano-gpt.com/api/check-balance | 是（查余额） | https://docs.nano-gpt.com/api-reference/endpoint/check-balance.md |
| gemini | GET https://generativelanguage.googleapis.com/v1beta/models（x-goog-api-key） | 是 | https://ai.google.dev/api/models |
| tensorart | POST {base}/tool/list，body `{}`，Echo-Access-Key | 是（列出工具） | https://github.com/Tensor-Art/tensorart-skills（scripts/list_tools.py、_api.py） |
| agnes | 不发请求 → unsupported | — | https://wiki.agnes-ai.com/llms.txt 只有模型/生成页，没有 models/余额接口 |
| sensenova | 不发请求 → unsupported | — | https://github.com/OpenSenseNova/SenseNova6.8/blob/main/API.md 只有 /v1/chat/completions |
| modelscope(_cn/_ai) | 不发请求 → unsupported | — | modelscope.cn 文档由 JS 渲染，未能核实 /v1/models |

遗留：balances 路由（server.ts:6562、6591）对 Agnes/SenseNova 仍然调 `${baseUrl}/models`，这个接口未能核实。base URL 只取服务端配置，没有泄露风险。不在 S6 范围内，待后续指派。

| S7 | 已完成（tsc 0 错误，运行时待验证） | ① 设置弹窗不再自动发请求：输入令牌、打开弹窗、切换页签都不触发请求；stats / balances / settings / 测试只在点击按钮时运行（「验证并拉取云端配置」读 settings 和 stats，「刷新服务端 key 池」「刷新监控指标」读 stats，「查询最新余额」查 balances）；② 删除「载入测试密钥」按钮、`handleFillTestKeys`、`DEFAULT_TEST_KEYS`（含写死的 agnes/sensenova base URL），`getStoredApiKeys` 在没有存储时返回空值；③ key 数量统一：服务端数量只读 `/api/cloud-keys/stats`（key 池 = settings.json + .env 合并去重），每个 key 附带 `source: 'settings' \| 'env'`，响应只含掩码、数量和来源；UI 标注「服务端：设置 / 服务端：.env / 本浏览器」 | server.ts:366-379,429-432,593,609-613；src/services/api.ts:5-27；src/components/BackendSettingsModal.tsx:109-114,131-135,273-288,457,468,479,540-542,613-615,642-652,855-857,997-1004,1107-1122,1133 |
| P | 已完成（tsc 0 错误，npm test 6 tests pass） | providerSchema 唯一声明模块：src/shared/providerFieldSpecs.ts → src/schemas/providerSchema.ts，覆盖 Gemini（6 模型）、Fal（15 端点）、Civitai（10 生态，sdcpp 8 + comfy 2）。每个字段有 status/source/constraints/providerDefault。导出 valueStatus / modelStatus / getFieldSpec / fieldOptions / listModels 等查询函数。server.ts 和前端 import 已全部迁移。旧文件已删除。vitest 自检：id 不重复、source 都是 https://、providerDefault 在合法范围内、min≤max、查询函数语义正确。 | src/schemas/providerSchema.ts；src/schemas/providerSchema.test.ts；server.ts:11,5923-5931；src/constants/nodes.ts:2,788-790；src/components/GeminiFieldSelect.tsx:2,13-14,37；src/components/FieldStatusBadge.tsx:2,7-16 |
| U2 | 已完成（tsc 0 错误，npm test 6 pass，运行时待验证） | 「未能核实」≠「不支持」：Gemini seed 从 400 改为透传 `config.seed`（非整数 400），unverified 取值 / 未知模型 / 已下线模型不拦截、原样发送；已知模型上不在 enum 的取值仍 400；negative_prompt/cfg/steps/loras 仍 400；上游失败返回真实状态码 + upstreamBody；响应附 fieldStatus、modelStatus（非 supported 时）；历史只在真实发送时记 seed。Fal 视频按 providerSchema 逐端点判定：unsupported → 400，其余按 schema wire 名转发。ModelScope / NanoGPT 的 loras 改为 unverified 透传。UI：unverified 选项可选并标注；Gemini 模型下拉含 -preview，过下线日标「（已下线）」并显示徽章；GeminiDriver 发送 seed、错误带上游响应体 | server.ts:11,4133-4161,5620-5622,5655,5800-5806,5944-5962,5995-6004,6033,6039,6048-6049,6055-6060；src/components/GeminiFieldSelect.tsx:2,38-40,52-57；src/components/NodeItem.tsx:26,560-563；src/constants/nodes.ts:2,773,787-792；src/engines/drivers/GeminiDriver.ts:15,90-91,104-106,119 |
| G4 | 已完成（tsc 0 错误，npm test 6 pass） | 切换服务商时不再自动填默认模型（11 个 provider 的硬编码全删，checkpoint 清空）；imagen 架构不再推荐 gemini-2.5-flash-image；Gemini 预设 model/checkpoint 置空，删除 seed/steps/cfg/sampler/scheduler；ComfyParameters 这 5 个字段改为可选（避免用占位值冒充） | src/components/ParameterInspector.tsx:317-318,515；src/utils/baseModelMatcher.ts:159-161；src/constants/presets.ts:3588,3617；src/types/graph.ts:158,160-163 |
| C9 | 已完成（tsc 0 错误，npm test 7 pass，运行时待验证） | ① 按名称搜索：结果不唯一 → 400 + candidates（模型 id / 名称 / AIR），不取 items[0]；唯一模型多版本 → 同样 400 列版本。② 纯数字模型 ID 无版本 → 400 + versions 候选。③ 完整 AIR 原样发送（不 normalizeEcosystem）；API 返回的 air 也原样用。④ 历史 / 响应 model 字段记实际解析后的 AIR，不是原始输入。CivitaiAmbiguousError 透传路由级 catch。删除死代码 normalizeEcosystem。 | server.ts:4271-4277,4280-4282,4299-4300,4314,4322,4330,4338-4348,4365-4390,4537-4538,4647,4649,4687-4700,4708-4711,4743-4755,4772-4773,4811,4815,4826,4832,4843,4847-4849 |
| C10 | 已完成（tsc 0 错误，npm test 7 pass） | 宽高校验按 providerSchema 逐生态取 min/max/multipleOf：flux1 sdcpp 832–1216 × 16；sdxl/sd1/anima/zImage 64–2048 × 16；qwen 64–2048 × **8**；flux2Dev 512–2048 无倍数；flux2Klein 512–2048 × 16；comfy（含 krea2）范围 / 倍数 unverified → 原样发。不在 schema 的生态（如 ponyV7）→ 原样发。vitest 新增 C10 约束一致性测试。 | server.ts:4687-4700；src/schemas/providerSchema.test.ts:66-79 |
| H6 | 已完成（tsc 0 错误，npm test 7 pass） | ① Fal `enable_safety_checker: false` → 删除，用户没传不发。② Civitai `quantity: 1` → 仅用户传了才发（recipe 默认 1）。③ Civitai comfy `model: 'turbo'/'base'` → 需用户指定 `comfyModel`，缺了 400。④ HF Z-Image `3.0/false/[]` → 要求用户传 shift / random_seed / gallery_images，缺了 400。前端 Fal/Civitai/HF driver 同步更新。 | server.ts:3481-3482,4708-4711,4718,4743-4755,4772-4773,5462-5481；src/utils/engineParameterNormalizer.ts:91；src/engines/drivers/CivitaiDriver.ts:55-57；src/engines/drivers/HuggingFaceDriver.ts:39-43 |
| B2 | 已完成（tsc 0 错误，npm test 13 pass） | 彻底移除 graphEngine.ts 中全部全局 `nodes.find`，改为以当前被运行节点为根进行拓扑反向追踪入边；模型/参考图/提示词严格从当前节点及专属入边上游获取；缺失必填模型报错「请先选择模型」；执行失败时仅标记当前执行节点错误状态，避免多节点重复报错 | src/utils/graphEngine.ts:1-267；src/App.tsx:1425,1447；src/utils/graphEngine.test.ts:1-339 |
| B1 | 已完成（tsc 0 错误，npm test 16 pass） | Fal + LoRA 错误被吞与空白等待修复：① 发送前按 providerSchema 校验，端点 loras 为 unsupported 时（如 fal-ai/flux/schnell）前端拦截，抛出「该端点不支持 LoRA（...官方 schema 无 loras 字段）」并阻断请求；② 服务端校验同步 providerSchema 判定，不支持时返回 400；FalDriver 不再丢弃状态码与原因，统一抛出「HTTP 400: ...」；③ App 的 handleQueuePrompt 捕获异常后精确定位目标节点与 LoRA 节点回显状态与 errorMessage，并重置 dangling running 状态，杜绝 60 秒空白等待与错误被吞 | src/engines/drivers/FalDriver.ts:34-40,56-59,103-106；src/engines/BaseEngineDriver.ts:121-134；server.ts:3539-3546；src/App.tsx:920-967；src/engines/drivers/FalDriver.test.ts:1-85 |
| L2a | 已完成（tsc 0 错误，npm test 13 pass） | 删除未连参考图时兜底取画布上任意 LoadImage 节点的逻辑；未连接入边时 initImageUrl 严格为 undefined | src/utils/graphEngine.ts:109-122；src/utils/graphEngine.test.ts:265-281 |
| L2b | 已完成（tsc 0 错误，npm test 13 pass） | 删除空 prompt 塞入硬编码 'a vibrant cosmic landscape...' 兜底文案；改为抛出明确错误「请填写提示词」 | src/utils/graphEngine.ts:89-105；src/utils/graphEngine.test.ts:283-294 |

S7 三处数量原来的来源：
- 云端设置列表（Admin 页）：`GET /api/cloud/settings` → 只读 `data/settings.json`。env 里的 FAL_KEY / CIVITAI_API_KEY 不在里面，所以显示「未配置」。
- 服务商页（Fal 页面「0 个」）：`parsedKeyList` → 弹窗 `keys` 状态 → `getStoredApiKeys()` → 浏览器 localStorage `comfycanvas_api_keys`。
- stats：`KeyPoolManager.pools` → settings.json 与 .env（`defaultKeys`）合并，所以显示各 1 个。
现在：服务端数量三处都读 stats 的 key 池并按来源拆分；Admin 列表明确标注「服务端：设置」字段是否已填，旁边附上 key 池总数；本浏览器的 key 单独标「本浏览器」，不再冒充服务端数量。

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

P 说明：
- 状态第四个值由 `shutdown` 改名为 `deprecated`（按 P 规格）；FieldStatusBadge 的 key 同步改名，现有代码没有传这个值，所以显示不变。
- 服务端行为差异（仍然全部是 400，只是分类变了）：① `gemini-2.5-flash-image` 的 10 个比例 1:1 2:3 3:2 3:4 4:3 4:5 5:4 9:16 16:9 21:9 由 unverified 改为 supported → 这些值现在会通过校验；1:4 1:8 4:1 8:1 由「未能核实」改为「该服务商不支持」。2.5 的 image_size 只剩候选 1K（unverified），2K/4K 改为「不支持」。② `gemini-3-pro-image` 与 `-preview` 的比例候选由 14 个缩减为 10 个，1:4 1:8 4:1 8:1 改为「不支持」。③ `3.1-flash-image` 的 512 档新增候选值 `512`（与 `512px` 一样是 unverified）。
- 预设 `gemini-imagen-zero-config`（2.5-flash-image + 1:1）现在能通过服务端校验。
- Civitai 采样器/调度器的枚举成员：OpenAPI 抓取被截断，未能核实，所以不写 enum，只写 recipe 页给出的默认值。
- providerDefault 目前没有代码读取；它只用于界面显示，绝不发给上游。

P 事实表（2026-09-29 抓取）：
| 范围 | 事实 | 来源 | 结果 |
|:---|:---|:---|:---|
| Gemini 比例 | 3.1-flash 14 个；3.1-flash-lite / 2.5-flash 各 10 个；「3.1 Pro Image」表 10 个 | https://ai.google.dev/gemini-api/docs/image-generation | 已核实；3-pro-image 与该表的对应关系有歧义 → unverified |
| Gemini image_size | 3.1-flash 1K/2K/4K；lite 只有 1K；3-pro 1K/2K/4K；2.5 未列出 | 同上 | 已核实；512 档的确切字符串未能核实（v1 discovery 写 `512`，https://ai.google.dev/api/generate-content 抓取时没有 ImageConfig 段）|
| Gemini seed | GenerationConfig.seed int32 | https://generativelanguage.googleapis.com/$discovery/rest?version=v1beta | 字段存在；对生图是否生效未能核实 → unverified |
| Fal 15 端点 | flux-lora、flux/dev、flux/schnell、fast-sdxl、lora、stable-diffusion-v35-large、krea-2/turbo、wan-t2v、wan-i2v、kling v1 standard t2v/i2v、minimax/video-01、ltx-video、hunyuan-video、cogvideox-5b 的 seed/steps/cfg/image_size/枚举/默认值 | https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<id> | 已核实；wan 默认负向词被截断，未逐字核实 |
| Fal 排除 | fal-ai/wan/t2v、wan/v2.1/*、flux-dev、flux-schnell、stable-diffusion-xl-base-1.0、animagine-xl | 同上 | 404，未收录 |
| Civitai sdcpp 尺寸 | flux1 832–1216 且为 16 的倍数；sd1/sdxl/anima/zImage 64–2048 且为 16 的倍数；qwen 64–2048 且为 8 的倍数；flux2 512–2048，只有 Klein 要求 16 的倍数 | https://developer.civitai.com/orchestration/recipes/{flux1,sdxl,sd1,qwen,flux2,anima,zimage}.md | 已核实；flux2 页描述的是 engine "flux2"，它和 sdcpp 下的 steps/cfg 是否一致未能核实 → unverified |
| Civitai comfy | flux1 steps 1–150、cfg 0–30、quantity 1–12；尺寸倍数官方未写 | https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.yaml | 尺寸 unverified；krea2 的 recipe 返回 404 → 全部 unverified |

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
