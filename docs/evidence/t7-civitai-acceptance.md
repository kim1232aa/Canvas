# T7 Civitai 验收报告 — 本轮 CODE_ONLY / CONTRACT_TESTED；历史 SD1 精确组合 PASS_GENERATION

## 2026-10-12 官方正文与当前源码复核（incoming 72f5372 接线记录范围）

本节为 2026-10-12 只读源码审计；下文 2026-10-09 修复/复审及 2026-10-06 生成验收分别保留其当时范围。若审计待修项与历史修复记录不同，按日期并列，不以其中一段覆盖另一段，也不据此新增生成成功结论。

本轮只读审计，不生成/上传，不修改生产代码。旧 agent-114 仅完成 Runware/ModelsLab 官方正文与代码探索，没有 Civitai 网络读取、Edit/Write、完成测试或最终交付消息；不能把旧调用当三家修复已完成。10-06 精确 SD1 + LoRA 历史 PASS 保留，10-09 代码/浏览器证据仍为历史，不提高等级。

本轮实际 You Contents / FetchURL 打开的官方正文：
- https://developer.civitai.com/site/guide/air.md ：`id` 为“model ID”、version 为“model version ID”；“urn: and air: prefixes are both optional”；site 返回的 air 优先。当前 resolver 区分 model/version 与 full AIR 基本符合，但 bare AIR 支持有遗漏（见下）。
- https://developer.civitai.com/site/reference/models.md ：`GET /api/v1/models`，query 要 cursor 分页，`metadata.nextCursor`；“combining query with page returns 400”。模型支持下载与 supportsGeneration 分开。`server.ts:921-974` 端点/鉴权/基本列表形状匹配。
- https://developer.civitai.com/orchestration/guide/submitting-work.md ：POST `/v2/consumer/workflows`，Bearer，steps/$type/input；wait 受 100 秒超时限制，202 时“keep the id … polling”。当前 `server.ts:4779-4819` 的 wait=100 和 pending 路径匹配。该指南最小例仍写 engine=flux；具体 SD1/Flux1 recipe 与 imageGen OpenAPI 用 sdcpp/comfy + ecosystem，本轮按具体目标 recipe 核对，不自动换引擎。
- https://developer.civitai.com/orchestration/recipes/sd1.md ：SD1 sdcpp 为 sampleMethod/schedule/strength；comfy 为 sampler/scheduler/denoiseStrength；`loras` 是 AIR→strength；`output.images[]` 每 quantity 一项，signed URL 会过期。与 builder `src/server/civitaiImageContract.ts:95-126` 的主映射匹配。
- https://developer.civitai.com/orchestration/recipes/flux1.md ：sdcpp 需要 diffuserModel，comfy 用 model；当前 `:92-93` 匹配；未外推 managed Kontext engine 已接通。
- https://developer.civitai.com/orchestration/recipes/zimage.md ：engine=sdcpp、ecosystem=zImage、model=turbo/base，仅 createImage；当前 `:84-86` 匹配，但 LoCon 推理仍未验。
- https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.yaml ：ComfyKrea2TurboCreateImageGenInput 为 comfy/krea2/turbo/createImage；sampler/scheduler、loras AIR map。当前 Krea selector 主形状匹配，具体 LoRA 身份/效果不由通用 schema 保证。
- https://developer.civitai.com/orchestration/guide/results-and-webhooks.md ：终态 `succeeded/failed/expired/canceled`；“Stop when status is one of …”。当前 poll 主路径识别这些状态，但提交已终态失败时仍回 pending。普通 workflow 30 天留存与 special ephemeral workflow 完成即404是不同场景，不混记为所有任务会立即删除。

需主 agent 串行修（本轮未改生产代码）：
1. **HIGH 多图** `server.ts:4529-4530` 只取 images[0]，quantity>1 的其余真实产物没有逐张持久化/历史。官方 SD1 输出每 quantity 一项；不能称 quantity 全链已完成。建议提取全部 output.images 并逐张持久化，逐图 seed 未返回就 null。
2. **HIGH 终态/错误** `server.ts:4808-4819` 无图但有 id 就 pending，已 failed/expired/canceled 亦入轮询；`:4797-4799`、`:4589` 只有拼接 error，无 rawResponse/upstreamStatus/errorSource/endpoint。`:4825` 将协议异常泛称网络。建议先判官方终态并透传完整 body/status；客户端别在已失败状态继续等。
3. **MEDIUM bare AIR** `src/server/civitaiImageContract.ts:15,43-44` 仅识别 urn:air/air 前缀；官方合法 bare `sdxl:checkpoint:civitai:827184@2514310` 被当关键词搜索。已用无网络替身响应实测 resolver 发 `/api/v1/models?query=sdxl%3Acheckpoint...` 后报歧义；建议完整 AIR parser canonicalize，保持 id/version/file/format，不再搜索猜资源。
4. **MEDIUM 搜索分页** `server.ts:933-938` cursor 存在时不再带 query，与首批 query 的搜索条件不一致。建议 query 与 cursor 同时发送，只有无 query/cursor 才发 page。鉴权缓存以 auth/anon 分组而不隔离调用者 (`:941`、`:2812`)，需评估私有结果跨调用者复用。
5. **MEDIUM 持久化** `server.ts:4595-4597` poll 下载失败仍把临时签名 URL 返回给前端作成功；建议显式 storage error，保留 transient URL，不冒充已持久化。Driver `:47,57-60` 只传 engine/ecosystem/comfyModel/custom/quantity，img2img 的 operation 等高级显式普通字段仍待逐项对照。

本轮定向三家现有 6 files / 44 tests PASS，随后 `npm test` 74 files / 633 tests PASS，不证明上游成功。`npx tsc --noEmit` 失败，涉及 ModelHubModal 隐式 any 与 temp/tams-sdk 缺依赖；没有越界修或调整测试。本轮尝试 `/orchestration/api.md` 返回404，不列为证据。Krea/ZImage LoCon、reference、图生视频、新多图/刷新历史、31预设 DOM 和旧 unknown 资源重选仍待真实前端验收。

## 2026-10-09 当前连接修复状态（优先于下文历史标签）

**本轮未运行、未生成，记 `CODE_ONLY / CONTRACT_TESTED`，不记新的 PASS_GENERATION。** 10-06 SD1 Checkpoint `4384@128713` + LoRA `82098@87153` / 0.7 的历史 PASS 保持，只限该组合；不覆盖 Krea、ZImage、LoCon、其他模板或新资源。历史 payload false 与错误身份记录保留，不因修后契约正确倒写历史请求。

### 当前源码与修复边界

- `src/server/civitaiImageContract.ts` 新 resolver/builder 区分 modelId、versionId、type；数字歧义返回候选，modelId@versionId 检查归属，完整 AIR 原文优先。资源身份不能由调用位置猜成 LoRA，下载可见不等于在线推理。
- `src/constants/presetResources.ts` 和前端参数链明确 engine / ecosystem / modelSelector（站内字段 `comfyModel`、画布 `civitai_model`）。Comfy 使用 sampler / scheduler，sdcpp 使用 sampleMethod / schedule；不把 Comfy 参数名发进 sdcpp。
- 已读源码的完整资源 AIR：Face Detailer `urn:air:sdxl:lora:civitai:234556@285546`；Detail Tweaker `urn:air:sdxl:lora:civitai:122359@135867`；Krea `urn:air:krea2:lora:civitai:2746042@3130750`、`urn:air:krea2:lora:civitai:2323765@3071582`。这些当前模板身份/来源不是本轮推理成功证明。
- 2758（模型 705606）是 Checkpoint，不是 LoRA，错误 LoRA 挂载移除，原版版本待目录重选；不选 latest 替代原作。其他旧 LoRA 身份未确定，保留名称/ID/权重/提示词历史意图、标未核实待重选，不能换别模型冒充修复。
- ZImage 请求使用 `engine=sdcpp / ecosystem=zImage / model=turbo`；AsianMix 资源 AIR 保留 `urn:air:zimageturbo:lycoris:civitai:2328130@2920318` 原文。resource namespace 与 request ecosystem 分开映射，**LoCon 实际加载与推理未实测**。
- `frame.imageUrl` 是展示结果，`referenceImageUrl` 才是显式输入；旧模板预览不自动作为图生图参考。Gemini 模板错误 Imagen 默认删除并要求用户选当前模型，不外推为 Google 所有产品的生命周期结论。

### 实际浏览器证据边界（主 agent 回传）

Chrome 154 / CDP 9224 新建「接线修复检查-20261009」保留原 board；「仅载入」Krea2 显示 explicit comfy/krea2/turbo 与完整 AIR。初测 positive/negative/latent 重叠后，新 preset row y 改为 80/620/1000；重新仅载入 Krea2 8 nodes actual DOM overlaps=[]；append Agnes i2i 4 nodes 后 12 nodes actual DOM overlaps=[]。截图 `temp/repair-browser/krea-layout-fixed.png`、`temp/repair-browser/krea-agnes-layout-fixed.png`。**仅代表模板，31 个预设实际 DOM 未全验；撤销估算 0 collision/31 抽取成功即全修好的推论。**

失模型/未核实/缺参考/来源未接通菜单项显示「待配置，不能立即运行」并 disabled。最终 Chrome 154 / CDP 9224 refresh 最新 loaded，代表 Krea2/Agnes 12 nodes 保留；此前 actual DOM overlaps=[]，最终刷新未重测 geometry。原 native upload focus @ref activeElement BUTTON / label「上传本地图片」/ tabIndex 0，仅焦点可达。performance generationRequests=[]；本轮无生成/付费。文档 agent 未操作浏览器。

主 agent 最终 pm2 restart canvas 成功，PID 176587 / restarts 11；fresh 本地 health online / uptime 14s / history 8 / executionTrace=[]、主页 HTTP 200。旧未 restart 为中间状态；未公开 deploy、未 commit/push，不声明公开站同步。

### 本轮官方原文核实

实际检索：内置 WebSearch 的 Civitai 查询失败（HTTP 500），随后 Google Grounding 检索官方资料；搜索摘要不当证据。以下原文通过 FetchURL 读取，OpenAPI 的 FetchURL 提取失败后按 search-routing 降级 You Contents 读取并核对 schema：

- [AIR guide](https://developer.civitai.com/site/guide/air.md)：AIR 的 id 是 model ID，version 是 model version ID；优先使用 site 返回 air；Diffusion Model / UNet 的 file kind 与 Checkpoint model type 不可混同。
- [Model versions](https://developer.civitai.com/site/reference/model-versions.md)：`GET /api/v1/model-versions/{id}` 返回 modelId/baseModel/air/model.type；官方要求 air 直接传给 Orchestration。404 也可能因未发布，不可写成资源虚构。
- [SDXL recipe](https://developer.civitai.com/orchestration/recipes/sdxl.md)、[Flux1 recipe](https://developer.civitai.com/orchestration/recipes/flux1.md)：Comfy 的 sampler/scheduler 与 sdcpp sampleMethod/schedule、图生图 denoiseStrength/strength 是不同 wire；须按用户选的 engine。
- [imageGen OpenAPI v2](https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.yaml)：实际读取 `ComfyKrea2TurboImageGenInput` / `ComfyKrea2TurboCreateImageGenInput`：engine=comfy、ecosystem=krea2、model=turbo、operation=createImage，支持 sampler/scheduler 与 loras AIR→strength；不是搜索摘要所述另一条 fal Krea 路由。
- [ZImage recipe](https://developer.civitai.com/orchestration/recipes/zimage.md)：engine=sdcpp、ecosystem=zImage、model=turbo/base，仅 createImage；资源 AIR 具体 `zimageturbo` 身份来自当前源码/主 agent 资源调查，本文通用 recipe 不能单独证明该 LoCon 已能推理。
- 尝试 `/recipes/krea2.md`、旧 `/orchestration/guide/air.md` 得到 404，不能把这些失败链接当支持证据；最终依据为上述成功读取原文。

### 待主 agent 补验（不预填 PASS）

- **最终 fresh 本地回归（主 agent 回传）**：lint 退出 0；61 files / 497 tests 全 PASS，无 localStorage stderr；frontend + hosting Worker build 成功；git diff --check 退出 0。既有 Vite `__dirname`、dynamic import 无效、>500KB chunk 警告保留；49/383、55/453 仅为历史。本地契约通过，生成验收仍 PARTIAL。
- review42 已 close；review53 原 2 MEDIUM、review54 final 3 HIGH + quantity MEDIUM 全 close；review55 最后 3 must-fix 闭环，定向 24+4 PASS；旧 review43 指定 scope close，不宣称 hooks ESLint。此前资源选择/type44、Civitai video dispatch 等指定项为本地契约修复/独立复审关闭，不再列待修。
- 资源 AIR 支持合法 urn/air/bare canonical 并核 file format 与 metadata 匹配；单版本 modelId 检查 shape，多版本不取 first，不可解析 AIR reject。UI 各入口 metadata verified 不是 generation ready；EngineRegistry 按用户显式 provider 分派 Civitai video；quantity 3/0 三路径一致。上述是主 agent 本地修复/复审证据，不证明 Krea/ZImage LoCon 推理或视觉效果。
- 官方矛盾与 unknown resolution 上游接受性、Krea/ZImage LoCon 推理及视觉效果仍待验；unknown 资源须 owner 选择，不因测试绿而升 PASS_GENERATION。
- 当前 Krea/指定 AIR 从真实前端点击到上游生成或明确余额终态，参数与路由完整记录：**待验**。
- 31 预设逐个实际 DOM、布局重叠复查、graph↔spatial 切换与身份保留：**待验**。
- 新图历史参数、刷新持久化、reference 图生图/显式图生视频整链：**待验**。
- unknown 旧资源回到目录重选，核对 type/model/version/生态/在线权限，不自动替换：**待验**。

---

## 以下为保留的 2026-10-06 历史精确组合验收

日期：2026-10-06（UTC+8）。验收入口：真实前端 ComfyCanvas Studio @ 127.0.0.1:3000，通过网页模型中心、LoRA 中心和「运行工作流」完成；不是终端直调。

## 结论

**PASS_GENERATION** — 2026-10-06 后续复验已经推翻本文件早先的 BLOCKED_ENV 中间结论。当前页面使用真实 Civitai SD1 AIR 从前端提交并完成生成，随后使用精确 LoRA AIR + 0.7 权重再次完成生成。画布出现新的 JPEG 结果，任务结束后运行按钮恢复，执行记录中存在 HTTP 200 的 `POST /api/engine/civitai/generate`。

该结论只证明本次特定 Civitai Orchestration 路由、Checkpoint 与 LoRA 组合；不外推为“所有 Civitai 下载资源都能在线生成”。

## 本轮真实资源

- Checkpoint AIR：`urn:air:sd1:checkpoint:civitai:4384@128713`
- LoRA AIR：`urn:air:sd1:lora:civitai:82098@87153`
- LoRA strength：`0.7`
- Provider：`civitai`
- LoRA 节点同时保留原始 `lora_name` 与 `civitai_id`，没有改成展示名或其他供应商 ID。

## origin/main 保留的参数追溯修复与后续规则（2026-10-06 历史验收范围）

旧 History 卡片曾把 Seed / Steps / CFG 等统一显示成“未填写”。复核 Civitai 返回后，上游实际包含 width/height、steps、cfg、sampler/scheduler 等字段；当前 History 已按 requested / sent / upstream/effective 区分来源，并把“未发送 / 上游未返回 / 旧记录未保存”分开显示。

这两张旧验收图的 Seed 不同，因此**不能**作为“只改变 LoRA 的 A/B 视觉对照”；路由 PASS_GENERATION 仍成立，但不把这组图冒充严格复现证据。

Civitai 已取得明确终态，不为刷测试重复消耗。未来若专门做参考图复现，应从公开 API 取得完整作品参数并固定可复现条件后比较原图。

## 前端证据链

1. 模型中心显式选用上述 Checkpoint AIR，provider 保持 `civitai`。
2. 第一次不带 LoRA 运行到真实终态，画布出现新的 `data:image/jpeg;base64,...` 结果，保存节点回到「就绪」。
3. 从 Civitai LoRA 标签输入精确 AIR，前端新增 1 个 LoRA 节点；`civitai_id` 与资源 AIR 一致。
4. 将 `strength_model` 设为 `0.7` 后再次点击网页「运行工作流」。
5. 异步期间页面显示 Civitai 请求进行中；没有把 accepted / polling 当成完成。
6. 任务结束后执行记录出现 `HTTP 200 · POST /api/engine/civitai/generate`，画布 JPEG 数据与上一张基础图不同，运行按钮恢复。
7. 没有失败后自动切换 provider、模型、Key 或端点。

## 同轮修复

- LoRA 中心现在将合法 `urn:air:...` 作为 Civitai 原始资源标识保存到 `civitaiId`，而不是仅识别纯数字 ID。
- Civitai AIR 在非 Civitai 标签下不会被静默跨供应商转换。

## 历史参数追溯修复（2026-10-06）

旧历史卡片最初把 Seed / Steps / CFG 等统一显示成“未填写”。复核原始 Civitai 返回后确认：上游实际返回了 `width=512`、`height=512`、`sampleMethod=euler`、`schedule=discrete`、`steps=20`、`cfgScale=7`；JPEG 嵌入元数据还包含实际 Seed。History 现按 `上游实际 > 图像元数据 > 实际发送 > 请求值 > 旧字段` 解析，并区分“未发送”与“旧记录未保存”。当前两张历史实际显示：

- LoRA 图：Seed `1021568893`（图像元数据），Steps `20` / CFG `7` / euler / discrete / 512×512（上游实际），Negative Prompt `未发送`。
- 基础图：Seed `951383495`（图像元数据），其余上游实际参数相同，Negative Prompt `未发送`。

因此这两张图不能作为 LoRA A/B 效果证据：两次 Seed 不同。路由 `PASS_GENERATION` 仍成立，但不把这组图片冒充“只改变 LoRA 的可比复现”。后续新生成历史还会结构化保存 `requestedParameters / actualParameters / effectiveParameters`。

## 新验收规则说明

本次成功发生在用户随后新增“每家换不同 Prompt / Negative Prompt / LoRA / 权重 / 底模 / Steps / CFG / Sampler，并与参考原图对比”的规则之前。因此：

- **本次 PASS_GENERATION 仍有效，不重复烧 Civitai 调用。**
- 后续新供应商必须使用不同的真实参考样本和完整参数。
- 若未来专门验收 Civitai 的“参考图一致性”，再单独选择公开完整元数据作品；不复用本轮旧测试 Prompt。
