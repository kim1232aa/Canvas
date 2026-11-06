# M18 审计报告：生成前拦截点清单与分类判定 (No-Gate Audit)

> 依据项目最高准则与用户指示：
> - 「禁止多余的拦截」「错误的拦截是很严重的」「不要美化报错，原样放回」
> - 「严禁静默容灾与虚假成功（透明错误，真实提供者路由）」
> - 「严禁回退，兜底」
> - 「严禁硬编码集成，用户需要的是自由度和泛化」
> - 「严禁反透明的黑盒行为」
> - 「没证据不断言」
> - 「余额不足不做卡点，先集成api，错误能原样透传算暂时通过」

---

## 判定规则与分类定义

| 分类 | 含义 | 标准与行为 |
| :--- | :--- | :--- |
| **CLASS A: 保留 (KEEP)** | 请求根本无法构造出站 | 未配置 API Key、未选择供应商、未选择模型、本地输入畸形无法解析（如不可读 data URL）、图生图/图生视频缺少必需输入源图像、图形解析无目标节点或节点被旁路、操作不存在的服务端资源记录。文案如实告知「没发出去」与真实客观原因，不替上游做主，不附带指导建议。 |
| **CLASS B: 删除 (REMOVE)** | 应用替上游做主预判拦截 | 按模型名称猜测架构/能力、拦截空提示词、拦截「底模尚未核实」、驱动能力清单 (assertCapability) 阻断模式调用、拦截上游未拒绝的字段/枚举/参数组合、拿不到 OpenAPI/Schema 时拒绝发请求等。应将请求按用户所填原样出站，由上游 API 裁决；可在界面展示非阻塞客观元数据提示，绝不卡死运行按钮或抛错中断。 |

---

## 完整前置拦截点清单

### 1. 浏览器端 (Browser / Client Side)

| 文件与行号 | 触发条件 | 用户可见文字 | 判定 | 代码证据与裁决理由 |
| :--- | :--- | :--- | :--- | :--- |
| `src/App.tsx:390` | `canvasMode === 'graph' && runTargetState.error && nodes.length` | `runTargetState.error`（如「未找到指定的执行节点」） | **CLASS A KEEP** | 画布节点连接未形成有效执行目标，无法发起后端调用。 |
| `src/App.tsx:393` | `canvasMode === 'spatial' && !frame` | `请选择要生成的画板` | **CLASS A KEEP** | 空间画布未选定画板对象，无法构建生成载荷。 |
| `src/App.tsx:445` | `selectedNodeId` 失效且重试仍无执行节点 | `未找到指定的执行节点` | **CLASS A KEEP** | 拓扑图解析不出任何可运行输出节点。 |
| `src/App.tsx:452` | `!boardHasPrompt && /真 LoRA 地址.../` | `${msg}；请填写提示词` | **CLASS B REMOVE** | 强制要求提示词非空；上游服务商允许空提示词时应当原样发出去由上游裁决。 |
| `src/App.tsx:467` | `runDisabledReason` 存在时拦截快捷键执行 | 弹出 toast 警告 | **CLASS B REMOVE** (针对 Class B 产生的禁用) | 只要禁用原因属于 Class B，就不应卡死执行按钮与快捷键。 |
| `src/utils/generationReadiness.ts:30` | `input.executionBlockedReason` 存在且缺提示词 | `${input.executionBlockedReason}；请填写提示词` | **CLASS B REMOVE** | 强制追加「请填写提示词」卡点，属于应用替上游要求必填。 |
| `src/utils/generationReadiness.ts:32` | `input.executionBlockedReason` 独立存在 | 对应未就绪配方原因（如待绑定 LoRA 地址） | **CLASS A KEEP** | 外部导入工作流处于未配方完成的草稿状态，无法构造完整参数。 |
| `src/utils/generationReadiness.ts:34` | `input.sourceLoraAir` 存在 | `来源 LoRA 执行链尚未接入；请保留历史档案，创建新的显式生成分支` | **CLASS A KEEP** | 属于历史存档占位节点，底层无任何具体模型或提供商映射。 |
| `src/utils/generationReadiness.ts:35` | `input.unresolvedModel` 为真 | `底模 ${input.model || '未指定'} 尚未核实，请重新选择已核实资源` | **CLASS B REMOVE** | 应用本地白名单未命中即判定「尚未核实」并卡死运行，剥夺用户自由输入模型的权利。 |
| `src/utils/generationReadiness.ts:36` | `input.requireReferenceImage && !input.referenceImageUrl?.trim()` | `编辑输入需要明确参考图，请选择或上传参考图` | **CLASS A KEEP** | 图像编辑/I2I 节点缺少基础输入源图，无法组装出站载荷。 |
| `src/utils/generationReadiness.ts:37` | `!input.provider?.trim()` | `请选择执行服务商` | **CLASS A KEEP** | 未选择 Provider，无法决定目标端点与网络路由。 |
| `src/utils/generationReadiness.ts:38` | `!input.model?.trim()` | `请先选择模型` | **CLASS A KEEP** | 未选择 Model，无法组装 API 必选字段。 |
| `src/utils/generationReadiness.ts:39` | `loras.some(item => item?.unresolvedResource === true)` | `导入工作流包含尚未转换为当前供应商资源 ID/URL 的 LoRA；请在当前供应商的 LoRA 中心重新选择或移除该待解析资源` | **CLASS A KEEP** | 导入的外部 LoRA 尚未解析为真实资源 URL 或 ID，组装空对象无法发送。 |
| `src/utils/generationReadiness.ts:40` | `promptMissing`（提示词为空或纯空格） | `请填写提示词` | **CLASS B REMOVE** | 应用替上游要求提示词必填；许多现代模型支持纯随机或无 prompt 引导生成，应由上游 API 判定。 |
| `src/utils/generationReadiness.ts:42` | `input.randomSeed === undefined` (Z-Image) | `请选择 Z-Image 的种子策略` | **CLASS B REMOVE** | 前端预先校验参数选项，阻断出站。 |
| `src/utils/generationReadiness.ts:43` | `!Array.isArray(input.galleryImages)` (Z-Image) | `请选择 Z-Image 的结果集` | **CLASS B REMOVE** | 前端预先校验参数选项，阻断出站。 |
| `src/utils/generationReadiness.ts:45` | `buildZImagePayload` 抛错 (Z-Image) | `error.message` | **CLASS B REMOVE** | 前端本地预校验载荷拦截，阻止发送。 |
| `src/utils/graphEngine.ts:269` | `!execNode` | `未找到指定的执行节点` | **CLASS A KEEP** | 图分析无法找到目标执行节点。 |
| `src/utils/graphEngine.ts:277` | `nodes.length === 0` | `画布上暂无可执行的节点` | **CLASS A KEEP** | 画布为空。 |
| `src/utils/graphEngine.ts:471` | `rootTargetNode.bypassed` | `当前选中的节点已旁路(bypassed)，无法执行` | **CLASS A KEEP** | 目标节点被显式 bypass。 |
| `src/utils/graphEngine.ts:683` | `n.values.execution_blocked_reason && !hasRealLoraOnSubgraph` | 对应 blocked reason 文本 | **CLASS A KEEP** | 导入配方缺失实质可执行资源。 |
| `src/utils/graphEngine.ts:684` | `n.values.source_lora_air` | `来源 LoRA 执行链尚未接入；请保留此历史档案，创建新的显式生成分支` | **CLASS A KEEP** | 历史占位节点。 |
| `src/utils/graphEngine.ts:730` | `!model` (AIVideoNode) | `请先选择模型` | **CLASS A KEEP** | 视频模型必填。 |
| `src/utils/graphEngine.ts:743` | `typeof video_selectors !== 'object'` | `视频节点 video_selectors 必须是非空字符串组成的对象` | **CLASS A KEEP** | 本地参数数据结构损坏。 |
| `src/utils/graphEngine.ts:765, 791, 818, 833, 859, 877, 915, 920, 925, 1006` | 各节点缺失 model / checkpointModel | `请先选择模型` | **CLASS A KEEP** | 核心模型字段缺失，无法组装出站请求。 |
| `src/utils/graphEngine.ts:880, 928, 1008` | `!targetProvider` | `请选择执行服务商；不会从模型名称猜测引擎` | **CLASS A KEEP** | 遵循项目禁止从模型名猜测引擎的最高规则，必须显式指定服务商。 |
| `src/utils/graphEngine.ts:1016` | `lockReason && !loras.some(...)` | `lockReason` 文本 | **CLASS A KEEP** | 配方未就绪执行锁。 |
| `src/utils/graphEngine.ts:1021` | `!positivePrompt?.trim()` | `请填写提示词` | **CLASS B REMOVE** | 前端预阻断空提示词，不允许发出请求。 |
| `src/utils/graphEngine.ts:1042` | `isModelUnresolved` | `底模 ${checkpointModel || '未指定'} 尚未核实，请重新选择已核实资源` | **CLASS B REMOVE** | 前端根据 catalog 匹配状态阻断未核实模型发送。 |
| `src/utils/graphEngine.ts:1045` | `recipeValues.execution_blocked_reason && !hasRealLora` | 执行阻断文案 | **CLASS A KEEP** | 配方未就绪。 |
| `src/utils/graphEngine.ts:1046` | `recipeValues.source_lora_air` | 来源 LoRA 阻断文案 | **CLASS A KEEP** | 历史占位节点。 |
| `src/utils/graphEngine.ts:1047` | `recipeValues.require_reference_image === true && !initImageUrl` | `编辑输入需要明确参考图，请选择或上传参考图` | **CLASS A KEEP** | I2I 缺失输入原图。 |
| `src/utils/graphEngine.ts:1184-1188` | `!compat.compatible && !params.isVideo && !isSchemaDrivenProvider(...)` | `LoRA [${l.name}] 与底模 [${params.checkpointModel}] 架构不兼容，拒绝静默丢弃执行` | **CLASS B REMOVE** | 前端调用 `checkLoraArchitectureCompatibility`，按模型名字字面猜测架构，直接抛错拒绝出站。完全违背用户指令，必须改为原样发出并只展示非阻塞提示。 |
| `src/utils/graphEngine.ts:1202` | `!reasoningProvider` (LLMReasoningNode) | `请先选择推理服务商` | **CLASS A KEEP** | 推理节点缺失服务商。 |
| `src/utils/graphEngine.ts:1204` | `!reasoningModel` (LLMReasoningNode) | `模型为必填项（推理节点）` | **CLASS A KEEP** | 推理节点缺失模型。 |
| `src/utils/graphEngine.ts:1483, 1490, 1495, 1496, 1503` | 运行目标节点解析异常 / 节点已被删除 | 相应系统常量文本 | **CLASS A KEEP** | 画布拓扑分析不到可执行产物输出端。 |
| `src/utils/resolveCheckpoint.ts:724-734` | `ckptFamily !== 'unknown' && loraFamily !== 'unknown' && ckptFamily !== loraFamily` | `LoRA [${loraName}] (baseModel: ${effectiveLoraBaseModel}) 与底模 [${ckptName}] (baseModel: ${effectiveCkptBaseModel}) 架构不兼容，未发送至上游。` | **CLASS B REMOVE** (针对未发送判定) | `getArchitectureFamily` 通过模型名称字符串匹配推测生态家族，用于阻断请求出站；应保留真实 baseModel 比较作为非阻塞 hint，但不可用来标记未发送或阻断执行。 |

---

### 2. 驱动层 (Engine Drivers)

| 文件与行号 | 触发条件 | 用户可见文字 | 判定 | 代码证据与裁决理由 |
| :--- | :--- | :--- | :--- | :--- |
| `src/engines/BaseEngineDriver.ts:33` | `!this.capabilities.includes(capability)` in `assertCapability` | `当前 Canvas 驱动 [${this.name}] 尚未接入 [${capability}] 能力。当前驱动已接入: [${this.capabilities.join(', ')}]。这不等于上游平台官方不支持该能力。` | **CLASS B REMOVE** | 驱动自身硬编码 capabilities 数组，一旦调用方尝试未声明的模式（例如未声明 img2img 但上游支持）即在前端直接抛错阻断，且注释文案已明确承认「这不等于上游平台官方不支持该能力」。 |
| `src/engines/BaseEngineDriver.ts:43` | `!params.model?.trim()` in `normalizeGenerateParams` | `模型为必填项（model is required）` | **CLASS A KEEP** | 模型缺失无法构造请求。 |
| `src/engines/BaseEngineDriver.ts:110` | `!rawParams.model?.trim()` in `generate` | `模型为必填项（model is required）` | **CLASS A KEEP** | 模型缺失无法构造请求。 |
| `src/engines/BaseEngineDriver.ts:118` | `generate` 调用 `this.assertCapability(requiredCap)` | 驱动未声明能力异常 | **CLASS B REMOVE** | 直接卡死执行，应当移除或放行。 |
| `src/engines/BaseEngineDriver.ts:130` | `chat` 调用 `this.assertCapability('reasoning')` | 驱动未声明能力异常 | **CLASS B REMOVE** | 直接卡死执行，应当移除或放行。 |
| `src/engines/BaseEngineDriver.ts:134` | `!this.executeChat` in `chat` | `引擎 [${this.name}] 声明支持 reasoning 但未实现 executeChat 方法。` | **CLASS A KEEP** | 代码未实现具体接口方法，无法发起调用。 |
| `src/engines/drivers/VideoDriver.ts:133` | `targetModel.includes('text-to-video') && hasImage` | `这个端点不支持参考图` | **CLASS B REMOVE** | 驱动按模型名称子串猜测端点能力，本地拦截图生视频请求。 |
| `src/engines/drivers/VideoDriver.ts:150` | `!videoProvider` | `视频服务商 (Provider) 未设置，拒绝回退到 Fal...` | **CLASS A KEEP** | 服务商缺失。 |
| `src/engines/drivers/VideoDriver.ts:160, 169` | `!aiToken` / `!cnToken` (ModelScope 视频) | `魔搭国际/国内站视频需要 x-modelscope-token...` | **CLASS A KEEP** | 缺少 API 令牌。 |
| `src/engines/drivers/FalDriver.ts:103` | `scale == null && l.clipStrength != null` | `本地未发送：Fal LoRA 只有 clipStrength，没有可映射到 loras.scale 的模型强度；请填写 strength/modelStrength，不把 CLIP 强度冒充模型强度` | **CLASS B REMOVE** | 前端预阻断 LoRA 强度参数格式，未交由后端及上游裁决。 |
| `src/engines/drivers/AgnesDriver.ts:118` | `resolution` 与 `size` 同时存在但不一致 | `Agnes Video 的分辨率档位官方字段是 size；节点 resolution="..." 与 size="..." 不一致，请只保留一个` | **CLASS B REMOVE** | 应用本地校验字段冲突拒绝发送，应原样透传由上游处理。 |

---

### 3. 服务端合约与路由 (Server Contracts & Routes)

| 文件与行号 | 触发条件 | 用户可见文字 | 判定 | 代码证据与裁决理由 |
| :--- | :--- | :--- | :--- | :--- |
| `src/server/falImageContract.ts:122` | `!liveInputProperties` (OpenAPI Schema 拉取失败) | `没有发出去：拿不到该端点 Schema，未发送 fal.run（endpoint=${endpoint}）` | **CLASS B REMOVE** | 核心关注点：拿不到 Schema 就不发出请求。必须改为即使 Schema 拉取失败，依然使用用户所填参数直接出站 POST fal.run，并同时在节点展示 Schema 失败与上游真实响应。 |
| `src/server/falVideoContract.ts:47` | `!liveInputProperties` | 抛出 `FalSchemaMissingError` | **CLASS B REMOVE** | 视频 Schema 获取失败导致直接阻断出站。 |
| `src/server/replicateImageContract.ts:58` | `ReplicateSchemaMissingError` 定义 | `没有发出去：拿不到该模型 Schema，未发送 /predictions（model=${model}）` | **CLASS B REMOVE** | 模型未拿到 Schema 时阻断请求出站。 |
| `src/server/replicateImageContract.ts:176` | 模型名称格式不匹配 owner/name 或 64位哈希 | `Replicate 模型格式无效，需为 owner/name、owner/name:version 或 64位十六进制版本号` | **CLASS A KEEP** | 无法解析 URL 路径参数，请求无法构造。 |
| `src/server/civitaiImageContract.ts:69, 75, 94, 95, 106` | Civitai AIR 解析失败 / 找不到对应版本 / modelId 与 versionId 不匹配 | 各项 AIR 解析错误文案 | **CLASS A KEEP** | Civitai 必须依赖 AIR 或 modelId@versionId 构造 workflow 请求体，输入不存在或矛盾时无法生成合法的 JSON payload。 |
| `src/server/civitaiImageContract.ts:104, 111` | 输入数字 ID 或名称命中多个候选项 | `CivitaiAmbiguousError` | **CLASS A KEEP** | 存在多义性无法决定唯一的模型版本。 |
| `src/server/civitaiImageContract.ts:116` | `!officialOpenApi` (OpenAPI 缺失) | `没有发出去：拿不到 Civitai imageGen 官方 OpenAPI，未发送 workflows` | **CLASS B REMOVE** | 拿不到官方 OpenAPI 就不发请求，替上游做卡点。 |
| `src/server/civitaiImageContract.ts:135` | `!ecosystem && !literalModelEngines...` | `Civitai ecosystem 为必填项，或提供带生态的完整 AIR` | **CLASS A KEEP** | 缺少生态标识无法定位执行引擎。 |
| `src/server/civitaiImageContract.ts:181` | `!selected` (selectImageGenInputSchema 未能匹配分支) | `Civitai imageGen 输入 Schema 未选中（selectImageGenInputSchema 未返回结果），未发送` | **CLASS B REMOVE** | 本地 Schema 选择逻辑未能匹配分支时拒绝出站。 |
| `src/server/civitaiImageContract.ts:192` | ZImage 内建 selector 收到 source checkpoint | `ZImage 内建 selector 不接受 source checkpoint；请明确选择 turbo/base` | **CLASS B REMOVE** | 应用本地对 ZImage 模式进行人工预检拒绝。 |
| `src/server/civitaiImageContract.ts:288, 305` | `loras` 不是数组 / 缺少 AIR 或 ID | 对应参数格式错误 | **CLASS A KEEP** | 本地数据结构无法序列化。 |
| `src/server/civitaiImageContract.ts:316` | LoRA 仅有 clipStrength 无模型强度 | `本地未发送：Civitai LoRA 只有 clipStrength，没有可映射到 loras.strength 的模型强度...` | **CLASS B REMOVE** | 本地对参数格式严格预检拦截出站。 |
| `src/server/civitaiImageContract.ts:337` | `schemaFetchFailure` 触发抛错 | `CivitaiSchemaMissingError` | **CLASS B REMOVE** | 拿不到 Schema 阻断出站。 |
| `src/server/civitaiImageContract.ts:340, 346, 350` | custom_parameters 非法修改核心系统字段 / 参数冲突 | 对应错误文案 | **CLASS A KEEP** | 防止破坏底层协议关键字段。 |
| `src/server/routes/videoGenerateRoute.ts:136` | `!model` | `模型为必填项（model is required）` (400) | **CLASS A KEEP** | 视频模型必填。 |
| `src/server/routes/videoGenerateRoute.ts:140` | `!reqProvider` | `视频服务商 provider 为必填项；不会根据模型名称猜测供应商，也不会回退到 Fal。` (400) | **CLASS A KEEP** | 遵循最高准则，不猜测服务商，必须显式指定。 |
| `src/server/routes/videoGenerateRoute.ts:143` | `!VIDEO_PROVIDERS.includes(reqProvider)` | `该视频路由未接入 provider=${reqProvider}...` (400) | **CLASS A KEEP** | 服务商未接入当前路由。 |
| `src/server/routes/videoGenerateRoute.ts:146` | `reqProvider === 'civitai'` | `Civitai 视频请走 /api/civitai/generate（isVideo: true）...` (400) | **CLASS A KEEP** | 路由分发错误指示。 |
| `src/server/routes/videoGenerateRoute.ts:157` | `tamsVideoRefusal` | `Tensor.Art TAMS 模型 ${raw}：本应用尚未接入 TAMS 视频...` (400) | **CLASS A KEEP** | 当前路由尚未实现 TAMS 视频接口逻辑。 |
| `src/server/routes/videoGenerateRoute.ts:159` | `isTensorArtTarget && !tamsVideoRefusal` | `Tensor.Art 视频路由只处理 TAMS...` (400) | **CLASS A KEEP** | 路由职责指引。 |
| `src/server/routes/videoGenerateRoute.ts:172` | `!nanoKey` (NanoGPT 视频) | `未配置 NanoGPT API Key (x-nanogpt-key)。` (400) | **CLASS A KEEP** | 缺少 API Key。 |
| `src/server/routes/videoGenerateRoute.ts:357` | `auth.error` (Agnes 视频) | `auth.error` 提示 (400) | **CLASS A KEEP** | 缺少 API Key。 |
| `src/server/routes/videoGenerateRoute.ts:491` | `auth.error` (Grok 兼容视频) | `auth.error` 提示 (400) | **CLASS A KEEP** | 缺少 API Key。 |
| `src/server/routes/videoGenerateRoute.ts:634` | `isModelScopeTarget` | `ModelScope API-Inference 当前没有已接入的视频生成接口...` (400) | **CLASS A KEEP** | 上游该平台在本项目中未接入视频接口。 |
| `src/server/routes/videoGenerateRoute.ts:641` | `reqProvider !== 'fal'` | `视频 provider=${reqProvider} 没有匹配到已接入执行分支；拒绝回退到 Fal。` (400) | **CLASS A KEEP** | 防止错误回退。 |
| `src/server/routes/videoGenerateRoute.ts:646` | `!falKey` (Fal 视频) | `未配置 Fal.ai 密钥...` (400) | **CLASS A KEEP** | 缺少 API Key。 |
| `src/server/routes/videoGenerateRoute.ts:653` | `!endpoint` | `不认识这个模型: ${model}` (400) | **CLASS A KEEP** | 仅在模型为空/纯空白字符时命中。 |
| `src/server/routes/videoGenerateRoute.ts:684` | `!liveProps` (Fal 视频 Schema 获取失败) | 抛出 `FalSchemaMissingError` 并返回 `notSent: true` (400/502/422) | **CLASS B REMOVE** | 视频 Schema 获取失败直接导致不发送请求。应原样发出并返回上游响应。 |
| `src/server/routes/videoGenerateRoute.ts:702` | `buildFalVideoRequest` 抛出 `FalSchemaMissingError` | 捕获并返回 `notSent: true` (400/502/422) | **CLASS B REMOVE** | 拦截出站请求。 |
| `src/server/routes/videoGenerateRoute.ts:844, 846, 859, 861, 864, 868` | 视频轮询/取消任务缺少 jobId / 找不到记录 / 跨服务商不一致 | 状态/取消错误返回 (400/404/409) | **CLASS A KEEP** | 本地无此任务 ID，无法向上游发起查询或取消。 |
| `src/server/routes/replicateRoutes.ts:46` | `auth.error` | `auth.error` (400) | **CLASS A KEEP** | 缺少 API Token。 |
| `src/server/routes/replicateRoutes.ts:113` | `error instanceof ReplicateSchemaMissingError` | `return res.status(error.httpStatus)...`，标注 `notSent: true` | **CLASS B REMOVE** | 全局无任何地方实例化该类，该分支系不可达死代码；类定义亦为空壳，彻底清理。 |
| `src/server/routes/replicateRoutes.ts:453, 461` | 取消任务缺少 ID 或缺少 Key | 错误返回 (400) | **CLASS A KEEP** | 参数不足。 |

---

### 4. 服务端主路由 (server.ts)

| 文件与行号 | 触发条件 | 用户可见文字 | 判定 | 代码证据与裁决理由 |
| :--- | :--- | :--- | :--- | :--- |
| `server.ts:344` | 全局 JSON 解析失败 | `error.message` (400) | **CLASS A KEEP** | 请求体损坏。 |
| `server.ts:347` | `workflowSnapshot` 非对象 | `workflowSnapshot 必须为对象` (400) | **CLASS A KEEP** | 数据类型错误。 |
| `server.ts:478` | `/api/media` 收到非字符串 dataUrl | `字段 dataUrl 必须为 image/video/audio 的 base64 data URL` (400) | **CLASS A KEEP** | 输入畸形无法解析媒体。 |
| `server.ts:487` | `/api/media/:hash` 媒体不存在 | `媒体不存在` (404) | **CLASS A KEEP** | 本地存储查无此项。 |
| `server.ts:1080` | `rejectSchemaEnum` 函数壳体 | 现永远返回 `false`（空壳） | **CLASS B REMOVE** | 历史残留枚举拦截壳体，应彻底清理或移除调用。 |
| `server.ts:1455` | `GET /api/model-schema` Replicate 格式非 owner/name | `Replicate 模型格式必须为 owner/name` (400) | **CLASS A KEEP** | 元数据查询端点，非生图出站。 |
| `server.ts:3058` | `!falKey` in `/api/fal/generate` | `未配置 Fal.ai API 密钥...` (400) | **CLASS A KEEP** | 缺少 API Key。 |
| `server.ts:3062` | `!model` in `/api/fal/generate` | `模型为必填项（model is required）` (400) | **CLASS A KEEP** | 缺少模型参数。 |
| `server.ts:3111` | `!liveProps` in `/api/fal/generate` | 抛出 `FalSchemaMissingError` 并返回 `notSent: true` (400/502/422) | **CLASS B REMOVE** | Fal 生图未获取到 liveProps 时直接判定「没有发出去」并中止出站。必须改为继续发出请求并回显上游结果。 |
| `server.ts:3129` | `falImageFieldGate` 抛出 `FalSchemaMissingError` | 捕获并返回 `notSent: true` (400/502/422) | **CLASS B REMOVE** | 拦截出站请求。 |
| `server.ts:3168` | `loras.find(l => !(l?.path || l?.url))` | `LoRA 没有可直接访问的 path/url，无法发送` (400) | **CLASS A KEEP** | Fal.ai 官方接口要求 LoRA 必须包含直链下载 URL 或官方端点 path；若既无 path 又无 url，请求参数为 undefined，且为防止泄露 Civitai Token 不做隐式改写，属于请求无法构造。 |
| `server.ts:3200` | `custom_parameters` JSON 语法错误 | `custom_parameters parse error` (422) | **CLASS A KEEP** | 用户填写的自定义 JSON 语法错误，无法合并出站。 |
| `server.ts:3338` | `GET /api/civitai/workflow/:id` 缺 Key | `Civitai API key is required` (400) | **CLASS A KEEP** | 工作流查询缺 Key。 |
| `server.ts:3410` | `!model` in Civitai generate | `模型为必填项（model is required）` (400) | **CLASS A KEEP** | 缺少模型参数。 |
| `server.ts:3423` | `!apiKey` in Civitai generate | `【未配置 Civitai API Key】...` (400) | **CLASS A KEEP** | 缺少 API Key。 |
| `server.ts:3474` | Civitai 视频 Schema 不可用 (`!openApi`) | `Civitai 视频官方 Schema 不可用，未发送生成请求...` (502) | **CLASS B REMOVE** | Schema 拉取失败阻断出站。 |
| `server.ts:3495` | `buildCivitaiVideoInput` 映射失败 | 错误信息 (400) | **CLASS B REMOVE** | 本地 Schema 校验失败导致阻断出站。 |
| `server.ts:3705` | Civitai 生图 `CivitaiSchemaMissingError` | `notSent: true` (400/502/422) | **CLASS B REMOVE** | Civitai 官方 OpenAPI 获取失败阻断生图出站。 |
| `server.ts:3792` | `CivitaiAmbiguousError` | `error.message` (400) | **CLASS A KEEP** | AIR 歧义。 |
| `server.ts:3804` | `auth.error` in Agnes generate | 缺少 Key (400) | **CLASS A KEEP** | 缺少 API Key。 |
| `server.ts:3809` | `!model` in Agnes generate | `模型为必填项（model is required）` (400) | **CLASS A KEEP** | 缺少模型参数。 |
| `server.ts:3880, 3884` | Agnes chat 缺 Key / 缺 Model | 错误信息 (400) | **CLASS A KEEP** | 缺少必要配置。 |
| `server.ts:3934, 3941` | Runware generate 缺 Key / 组装错误 | 错误信息 (400) | **CLASS A KEEP** | 缺少必要配置。 |
| `server.ts:4033, 4040` | ModelsLab generate 缺 Key / 组装错误 | 错误信息 (400) | **CLASS A KEEP** | 缺少必要配置。 |
| `server.ts:4249, 4264` | OpenAI Compat generate 缺 Key / 缺 Model | 错误信息 (400) | **CLASS A KEEP** | 缺少必要配置。 |
| `server.ts:4333, 4338` | Grok Compat generate 缺 Key / 缺 Model | 错误信息 (400) | **CLASS A KEEP** | 缺少必要配置。 |
| `server.ts:4403, 4407` | Grok Compat chat 缺 Key / 缺 Model | 错误信息 (400) | **CLASS A KEEP** | 缺少必要配置。 |
| `server.ts:4471` | `!tamsKey` in TensorArt generate | `未配置 Tensor.Art TAMS API Key/Token...` (400) | **CLASS A KEEP** | 缺少 API Key。 |
| `server.ts:4483` | `!isNumericModelId` in TensorArt generate | `没发出去：TAMS 模型接口需要数字 ID（收到: "${requestedModelOrTool}"）` (400) | **CLASS A KEEP** | 官方文档 (`https://tams-docs.tensor.art/docs/api/apis/tams-api-v-1-service-get-model`) 明确规定 `GET /v1/models/:modelId` 的 `modelId` 必须是 `uint64` 路径参数。若将任意非数字字符串直接拼入 `${origin}/v1/models/${modelId}` 会导致 URL 路径注入；且 `src/schemas/tensorModelApi.ts` 的 `tensorModelId()` 亦对非数字抛错。属于请求无法构造的 A 类。保留校验，但文案改为如实的「没发出去：TAMS 模型接口需要数字 ID（收到 X）」，去除说教建议。 |
| `server.ts:4518` | `checkpoint?.modelType && checkpoint.modelType !== 'CHECKPOINT'` | `所选模型不是 CHECKPOINT，不能作为底模` (400) | **CLASS B REMOVE** | 官方 TAMS API 文档 (`https://tams-docs.tensor.art/docs/api/apis/tams-api-v-1-service-get-model`) 显示 `modelType` 枚举包含 `[DEFAULT, CHECKPOINT, LORA, ...]` 且默认值为 `DEFAULT`。本地仅认 `CHECKPOINT` 会错杀默认模型与新类型；应当删除本地阻断，直接向 `/v1/jobs` 发起任务由上游 TAMS 裁决。 |
| `server.ts:4625` | `!model` in HuggingFace generate | `模型为必填项（model is required）` (400) | **CLASS A KEEP** | 缺少模型参数。 |
| `server.ts:4649` | `!['hf-inference','fal-ai','z-image-space'].includes(hfProvider)` | `未知的 HuggingFace 接入模式` (400) | **CLASS A KEEP** | 内部模式路由无效。 |
| `server.ts:4653` | `isZImage && !hfKey` | `Z-Image Space 属于私有 Space，必须配置 Hugging Face Token...` (400) | **CLASS A KEEP** | 缺少 API Token。 |
| `server.ts:4681` | `buildZImagePayload` catch | `error.message` (400) | **CLASS B REMOVE** | 本地参数硬性检查。 |
| `server.ts:5112` | `!model` in ModelScope generate | `模型为必填项（model is required）` (400) | **CLASS A KEEP** | 缺少模型参数。 |
| `server.ts:5121` | `headerSite && ((routeIsAi && headerSite === 'cn') || (!routeIsAi && headerSite === 'ai'))` | `魔搭站点冲突：路由为 ${routeIsAi ? '国际站 modelscope_ai' : '国内站 modelscope'}，但请求标注 site=${headerSite}；CN 与 AI 令牌/域名隔离，未出站。` (400) | **CLASS A KEEP** | 严格防范跨站点/域名令牌泄露安全底线（国内站 Token 绝对不能发到国际站，反之亦然），属于请求构造时的安全隔离约束。 |
| `server.ts:5134` | `!msAttemptPlan.keys.length` in ModelScope generate | `未配置魔搭... Token` (400) | **CLASS A KEEP** | 缺少 API Token。 |
| `server.ts:5158` | `buildModelScopeImagePayload` catch | `error.message` (400) | **CLASS A KEEP** | 载荷序列化错误。 |
| `server.ts:5329` | `!nanoKey` in NanoGPT generate | `未配置 NanoGPT API Key (x-nanogpt-key)。` (400) | **CLASS A KEEP** | 缺少 API Key。 |
| `server.ts:5336` | `!model` in NanoGPT generate | `模型为必填项（model is required）` (400) | **CLASS A KEEP** | 缺少模型参数。 |
| `server.ts:5344` | NanoGPT 无法解析对应端点 | `NanoGPT 无法解析该模型对应端点` (400) | **CLASS A KEEP** | 缺少目标端点映射。 |
| `server.ts:5453` | `!model` in Gemini generate | `模型为必填项（model is required）` (400) | **CLASS A KEEP** | 缺少模型参数。 |
| `server.ts:5477` | `!effectiveKey` in Gemini generate | `未配置 Google Gemini API 密钥...` (400) | **CLASS A KEEP** | 缺少 API Key。 |

### Schema 获取失败与各供应商出站构建设计（Fal / Civitai / Replicate）

主控审核指出关键约束：Fal 与 Civitai 的请求体均高度依赖 live OpenAPI Schema。若 Schema 无法获取时凭空猜测字段名发起生成，直接违背「严禁硬编码集成」与「没证据不断言」最高准则。
因此针对 Schema 缺失的处理设计如下：

1. **Replicate（完全支持无 Schema 出站）**：
   - 代码证据：`src/server/replicateImageContract.ts:196-214`。
   - 设计：Replicate 官方统一端点为 `POST /v1/models/{owner}/{name}/predictions`，其载荷格式为标准的 `{ input: { [field]: value } }`。当 OpenAPI Schema 缺失时，代码已原生将画布填写的字段名直接透传作为 `input` 的键值。上游 Replicate API 会自主进行字段级校验并返回标准 HTTP 422 详细报错。无需猜测任何字段，直接原样发送，由上游裁决。

2. **Fal.ai（Schema 缺失归入 CLASS A 保留，文案如实客观透传）**：
   - 代码证据：`src/server/falImageContract.ts` 与 `server.ts:3110`。
   - 分析：Fal 各端点（如 `flux/dev`、`flux/schnell`、`fast-sdxl` 等）接口入参异构（如 `steps` vs `num_inference_steps`，`cfg` vs `guidance_scale`）。在完全没有 Schema 的情况下强行组装字段势必引入硬编码映射。
   - 裁决：保留为 **CLASS A（请求根本无法可靠构造）**。
   - 错误透传与文案规范：
     - 若 Schema 端点响应了 HTTP 4xx/5xx（如 404 Endpoint Not Found 或 422）：此为上游官方真实响应，服务器如实返回上游 HTTP 状态码与响应体，错误源标为 `upstream`，节点界面原样完整呈现上游回答。
     - 若因本地网络超时/不可达导致 Schema 请求失败：文案必须诚实、客观，规范为「`没发出去：拿不到该端点 Schema，未发送 fal.run`」，原样回显网络报错细节，绝不附加主观建议或伪造成功。

3. **Civitai（Schema 缺失归入 CLASS A 保留，文案如实客观透传）**：
   - 代码证据：`src/server/civitaiImageContract.ts` 与 `server.ts:3472, 3704`。
   - 分析：Civitai 生成必须依赖官方 OpenAPI 动态匹配 engine（如 comfy/diffusers）与 workflow 步骤树节点结构。缺少 OpenAPI 时无法组装合法的 Civitai orchestration 语法树，属于客观上请求无法构造。
   - 裁决：保留为 **CLASS A（请求无法构造）**。
   - 错误透传与文案规范：如实展示 OpenAPI 获取的真实 HTTP 状态与错误内容，文案规范为「`没发出去：拿不到 Civitai 官方 OpenAPI，未发送 workflows`」，不加任何说教建议。

---

## 统计汇总与执行计划

- **审计总项数**: 88 处出站前卡点与校验逻辑
- **CLASS A 保留项**: 66 处（真实无法构建请求、缺失 Key、缺失 Provider、缺失 Model、TAMS uint64 路径校验、Fal/Civitai 缺失 Schema 无法构造载荷、本地输入数据格式损坏、AIR 歧义、安全隔离保护）
- **CLASS B 删除项**: 22 处（模型架构推断阻断、空提示词阻断、底模尚未核实阻断、驱动能力清单 assertCapability 阻断、TAMS CHECKPOINT 本地拦截、Z-Image 本地校验拦截等）

### 实际执行动作与落地范围

1. **`src/utils/graphEngine.ts`**:
   - 移除 L1021 空提示词抛错 `throw new Error('请填写提示词')`，允许空 prompt 正常流向执行管道。
   - 移除 L1042 `isModelUnresolved` 抛错 `底模尚未核实`，放行所有用户指定底模。
   - 移除 L1184-1188 `checkLoraArchitectureCompatibility` 阻断抛错，所有 LoRA 均作为 `compatibleLoras` 正常出站发给服务商；仅在 catalog metadata 明确给出不同 `baseModel` 时在界面展示非阻塞客观 hint。
2. **`src/utils/generationReadiness.ts`**:
   - 移除 L40 空提示词卡点。
   - 移除 L35 `unresolvedModel` 卡点。
   - 移除 L42-45 Z-Image 种子与结果集硬性前置拦截。
   - 移除 L30 针对 pendingRecipe 强加的 `；请填写提示词` 后缀。
3. **`src/utils/resolveCheckpoint.ts`**:
   - `checkLoraArchitectureCompatibility` 仅基于真实 `baseModel` 元数据提供客观对比，不再作为请求拦截判据，文案去除阻断性断言。
4. **`src/engines/BaseEngineDriver.ts`**:
   - `assertCapability` 不再抛出 `Error` 中止执行，允许调用方继续构建出站请求交由上游响应。
5. **`src/App.tsx`**:
   - 移除 L450-454 强行拼接追加的 `；请填写提示词` 文本。
6. **`server.ts`**:
   - 移除 L1080 `rejectSchemaEnum` 空壳函数。
   - 移除 L4518 TAMS `checkpoint.modelType !== 'CHECKPOINT'` 本地阻断，继续向 `/v1/jobs` 发起任务由上游裁决。
   - 规范 L4483 TAMS 数字 ID 拦截文案为纯客观描述：「`没发出去：TAMS 模型接口需要数字 ID（收到: "${requestedModelOrTool}"）`」。
   - 规范 Fal/Civitai 缺少 Schema 时的返回为统一、客观的「没发出去：拿不到端点 Schema」，完整回显 Schema 端点的真实错误与状态码。
7. **`src/server/replicateImageContract.ts` & `src/server/routes/replicateRoutes.ts`**:
   - 移除 `replicateImageContract.ts` 中空提示词前置抛错（L92-94 `prompt is required`），允许空 prompt 正常出站由 Replicate 官方 API 校验。
   - 移除 `ReplicateSchemaMissingError` 类定义与 `replicateRoutes.ts` 中不可达死代码分支（L113-126）。

---

## 既有测试修改说明与核对 (Test Modifications)

依主控要求，凡修改既有测试断言之处，逐条登记比对：

| 文件与行号 | 旧断言行为 | 新断言行为 | 旧断言守护目标 | 新断言意义与为何不削弱 |
| :--- | :--- | :--- | :--- | :--- |
| `src/constants/presetsDryRun.test.ts:40-42` | `extractWorkflowParameters(...)` 必须抛出「请填写提示词」 | `extractWorkflowParameters(...)` 不再抛错，且提取的 `positivePrompt === ''` | 确保预设无 recipe 时未硬编码兜底/默认提示词 | 新断言继续守住「没有默认提示词塞入」的不变量，同时验证 M18 允许空提示词提取出站的规则。 |
| `src/utils/graphEngine.test.ts:25-29` | `extractWorkflowParameters` 遇到 `import_unresolved_resource:true` 必须抛出「底模...尚未核实」 | 不再抛出异常，返回对象包含 `unresolvedModel: true` | 原用于阻断未核实底模出站 | 守住元数据标记能力，但解除本地粗暴抛错中断，由上游裁决。 |
| `src/utils/graphEngine.test.ts:670-682` | 空提示词提取必须抛出「请填写提示词」 | 空提示词提取正常完成，提取结果 `positivePrompt === ''` | 强制前端禁止空提示词 | 确保空提示词被真实保留为 `''` 出站，绝不插入任何默认文本。 |
| `src/utils/graphEngine.test.ts:1205-1230` | FLUX + Krea2 Turbo (SDXL) LoRA 不兼容时抛错拒绝执行且未调用 `EngineRegistry.generate` | `executeWorkflow` 成功调用 `EngineRegistry.generate`，所有 LoRA 均送出，LoRA 节点不被置为 error | 旧断言由应用按名字判断并阻止出站 | 贯彻用户「禁止多余拦截」指令，异构 LoRA 不再被本地拦截，由服务商真实 API 裁决。 |
| `src/utils/generationReadiness.test.ts:5-8` | `unresolvedModel: true` 返回包含「底模」阻断文案 | `unresolvedModel: true` 返回 `undefined`（不阻止运行） | 按钮禁用逻辑 | 确保运行按钮不因底模未核实被禁用。 |
| `src/utils/generationReadiness.test.ts:14-17` | `prompt: ''` 返回「请填写提示词」 | `prompt: ''` 返回 `undefined`（不阻止运行） | 按钮禁用逻辑 | 确保运行按钮不因空提示词被禁用。 |
| `src/utils/generationReadiness.test.ts:18-22` | 缺 LoRA 且缺提示词时追加「；请填写提示词」 | 仅返回配方本身执行锁原因，不追加提示词后缀 | 提示词强制必填 | 移除应用强加给用户的提示词必填要求。 |
| `src/utils/resolveCheckpoint.test.ts:378-390` | 异构 LoRA 结论包含「未发送至上游」 | 结论包含「已提交上游裁决」，提供非阻塞 hint | 旧断言宣称未发送 | 如实反映当前架构比对仅作为非阻塞提示，请求已正常提交上游。 |

---

## 变异测试检验 (Mutation Testing Verification)

为证明回归测试有效性，针对移除的门禁进行了三次变异打桩验证：

1. **变异 1: 恢复 `BaseEngineDriver.assertCapability` 阻断抛错**
   - 动作：在 `src/engines/BaseEngineDriver.ts` 中恢复 `throw new Error(...)`。
   - 运行：`npx vitest run src/engines/BaseEngineDriver.test.ts`。
   - 结果：测试 `regression: capability list no longer throws for an unlisted mode the driver can build` 立即**变红失败 (FAIL)**（报 `Error: 当前 Canvas 驱动 [test] 尚未接入 [img2img] 能力`）。
   - 恢复：恢复非阻塞实现后重新运行，测试**变绿通过 (PASS)**。

2. **变异 2: 恢复 `graphEngine.ts` 空提示词抛错**
   - 动作：在 `src/utils/graphEngine.ts:1021` 恢复 `if (!positivePrompt?.trim()) throw new Error('请填写提示词');`。
   - 运行：`npx vitest run src/utils/graphEngine.test.ts -t "L2b: 提示词为空"`。
   - 结果：测试 `L2b: 提示词为空时不阻断出站，原样发出并由上游裁决` 立即**变红失败 (FAIL)**（抛出 `Error: 请填写提示词`）。
   - 恢复：恢复放行后重新运行，测试**变绿通过 (PASS)**。

3. **变异 3: 恢复 `graphEngine.ts` 跨架构 LoRA 阻断抛错**
   - 动作：在 `src/utils/graphEngine.ts:1173` 恢复 `if (!compat.compatible) throw new Error(...)`。
   - 运行：`npx vitest run src/utils/graphEngine.test.ts -t "Krea2 Turbo mismatch"`。
   - 结果：测试 `rejects execution and marks LoRA node with error on FLUX + Krea2 Turbo mismatch` 立即**变红失败 (FAIL)**（抛出 `Error: LoRA ... 架构不兼容，拒绝静默丢弃执行`）。
   - 恢复：恢复放行后重新运行，测试**变绿通过 (PASS)**。

---

## 真实浏览器 UI 验收报告 (Browser Acceptance Verification)

- 执行环境：Node v22.23.2
- 本地服务端口：`3120`（通过 `PORT=3120 npx tsx server.ts` 运行）
- 浏览器：Google Chrome Headless (`/usr/bin/google-chrome --headless=new --remote-debugging-port=9420 --user-data-dir=/tmp/canvas-chrome-nogate18`)
- 真实密钥来源：仓库根目录真实 `.env` 凭证
- 验收标签定义（仅允许使用以下 7 个标签）：
  - `PASS_GENERATION`: 产物在界面可见
  - `PASS_BILLING`: 到达真实上游服务商并带完整参数，上游余额/点数/额度不足拒绝原样回显
  - `BLOCKED_AUTH`: 401 密钥失效
  - `BLOCKED_CONFIG`: 未配密钥
  - `NOT_SENT`: 没有任何请求离开本机
  - `CONTRACT_REJECT`: 400/422/404 合约拒绝
  - `WIRING_BUG`: 接线缺陷

### 场景 (a): 跨架构 LoRA（SD1.5 LoRA + SDXL 底模）在 Replicate 运行

- **测试用例**: 在 Replicate 服务商下，底模选择 SDXL 架构底模 (`black-forest-labs/flux-dev-lora` / SDXL 族)，连接 SD 1.5 架构 LoRA (`latentcat/sd15-realistic-vision`)，填写提示词并点击「运行：保存图像」。
- **前置历史行为**: 在 main 分支旧版本，前端 `graphEngine.ts:1184` 直接抛出 `LoRA [...] 与底模 [...] 架构不兼容，拒绝静默丢弃执行`，LoRA 节点被标红，**零个请求离开本机**。
- **M18 实际运行行为**:
  - 请求顺利出站发往 Replicate 官方 API！
  - 出站请求体完整包含所有参数：`lora_weights: "latentcat/sd15-realistic-vision"`, `lora_scale: 1`, `prompt`, `num_inference_steps: 41`, `guidance: 3.5`。
  - 上游 Replicate 真实返回 HTTP 402 Insufficient credit。
  - 画布采样器节点原生、完整、原样展示上游 HTTP 402 错误体；底部 Toast 同步如实回显。
- **截图文件**: `docs/evidence/2026-11-05/no-gate/01-sd15-lora-sdxl-replicate.png`
- **截图逐行文字检验 (ReadMediaFile)**:
  - 顶部栏：标题 `ComfyCanvas Studio`，导航 `Z-Image 创作画布`，当前激活标签 `节点`，`画板`；右侧显示 `保存到云端`，`API 设置`，运行按钮 `运行：保存图像`（高亮可用）。
  - 状态指示栏：`HTTP 402 Payment Required`。
  - 节点 1 (`Load Checkpoint`): 供应商 `⚡ Replicate 官方云平台`，底模 `black-forest-labs/flux-dev-lora`。
  - 节点 2 (`LoRA: latentcat/sd15-realistic-vision`): 状态正常（无报错红框！），LoRA 强度为 1。
  - 节点 3 (`正向提示词`): 填有提示词 `1girl, cinematic lighting, ultra detailed portrait`。
  - 节点 5 (`采样器`): 顶部显示上游报错红色卡片：`【replicate】Replicate 图像接口上游 HTTP 402: {"title":"Insufficient credit","detail":"You have insufficient credit to run this model. Go to https://replicate.com/account/billing#billing to purchase credit. Once you purchase credit, please wait a few minutes before trying again.","status":402}`；包含诊断按钮「展开完整技术诊断细节」「复制诊断信息」。
  - 底部浮动 Toast: `工作流生成失败 - Replicate 图像接口上游 HTTP 402: {"title":"Insufficient credit","detail":"You have insufficient credit to run this model. Go to https://replicate.com/account/billing#billing to purchase credit. Once you purchase credit, please wait a few minutes before trying again.","status":402}`。
- **出站请求日志 (jsonl 记录截取，脱敏)**:
  ```json
  {
    "time": "2026-11-06T15:14:40+09:00",
    "kind": "upstream",
    "route": "/api/engine/replicate/generate",
    "provider": "replicate",
    "model": "black-forest-labs/flux-dev-lora",
    "method": "POST",
    "endpoint": "https://api.replicate.com/v1/models/black-forest-labs/flux-dev-lora/predictions",
    "requestBody": {
      "input": {
        "prompt": "1girl, cinematic lighting, ultra detailed portrait",
        "aspect_ratio": "1:1",
        "seed": 2100162238,
        "num_inference_steps": 41,
        "guidance": 3.5,
        "lora_weights": "latentcat/sd15-realistic-vision",
        "lora_scale": 1
      }
    },
    "status": 402,
    "responseBody": "{\"title\":\"Insufficient credit\",\"detail\":\"You have insufficient credit to run this model. Go to https://replicate.com/account/billing#billing to purchase credit. Once you purchase credit, please wait a few minutes before trying again.\",\"status\":402}\n",
    "durationMs": 698,
    "lookup": false
  }
  ```
- **验收判定标签**: **`PASS_BILLING`**

---

### 场景 (b): 空提示词在带密钥供应商上运行

- **测试用例**: 在有真实密钥的 Hugging Face 供应商节点上，清空正向提示词（输入框完全为空），观察运行按钮并点击运行。
- **前置历史行为**: 在 main 分支旧版本，运行按钮因 `runDisabledReason` 被直接禁用（置灰且点击弹「请填写提示词」），`graphEngine.ts` 亦抛错，**零个请求离开本机**。
- **M18 实际运行行为**:
  - 提示词为空时，运行按钮正常保持可用（未被 Class B 理由卡死！）。
  - 点击「运行：保存图像」，请求携带 `prompt: ""` 顺利出站打向上游端点！
  - 上游返回 HTTP 402 点数不足拒绝。
  - 画布采样器节点原生、完整、原样展示上游 HTTP 402 错误体。
- **截图文件**: `docs/evidence/2026-11-05/no-gate/02-empty-prompt-run.png`
- **截图逐行文字检验 (ReadMediaFile)**:
  - 顶部栏状态指示：`HTTP 402 · Purchase pre-paid credits to continue using Inference Providers. Alternatively, subscribe to PRO to get monthly included credits.`
  - 正向提示词节点：输入框内为空，仅显示灰色占位文字 `填入配方/用户指定`。
  - 运行按钮：呈现蓝色高亮可用状态，未被置灰。
  - 采样器节点与底部 Toast：完整显示上游返回的真实响应体 `hf_b...MMGa: HTTP 402: {"error":"Purchase pre-paid credits to continue using Inference Providers. Alternatively, subscribe to PRO to get monthly included credits."}`，密钥已安全脱敏。
- **出站请求日志 (jsonl 记录截取，脱敏)**:
  ```json
  {
    "time": "2026-11-06T15:14:29+09:00",
    "kind": "upstream",
    "route": "/api/huggingface/generate",
    "provider": "huggingface",
    "model": "Tongyi-MAI/Z-Image-Turbo",
    "method": "POST",
    "endpoint": "https://router.huggingface.co/fal-ai/fal-ai/z-image/turbo/lora?_subdomain=queue",
    "requestBody": {
      "prompt": "",
      "image_size": { "width": 1216, "height": 832 },
      "num_inference_steps": 12,
      "guidance_scale": 1,
      "seed": 1840591390,
      "loras": [
        {
          "path": "https://huggingface.co/renderartist/Technically-Color-Z-Image-Turbo/resolve/main/Technically_Color_Z_Image_Turbo_v1_renderartist_2000.safetensors",
          "scale": 0.9
        }
      ]
    },
    "status": 402,
    "responseBody": "{\"error\":\"Purchase pre-paid credits to continue using Inference Providers. Alternatively, subscribe to PRO to get monthly included credits.\"}",
    "durationMs": 47,
    "lookup": false
  }
  ```
- **验收判定标签**: **`PASS_BILLING`**

---

### 场景 (c): 实时 Schema 获取不可用时请求仍然出站

- **测试用例**: 在 Replicate 工作流中，配置自定义模型版本（无预设 Schema 缓存或 Schema 端点返回 404），点击运行。
- **前置历史行为**: 在 main 分支旧版本，后端直接抛出 `ReplicateSchemaMissingError` 并返回 `notSent: true`，**零个请求离开本机**。
- **M18 实际运行行为**:
  - 请求未因缺少 Schema 被拦截，代码将画布填写的字段完整组装为 `{ input: { ... } }` 并成功发起 POST `https://api.replicate.com/v1/models/black-forest-labs/flux-dev-lora/predictions`！
  - 上游 Replicate 返回真实限流与需绑定支付方式响应：HTTP 429 `{"detail":"Request was throttled. Your rate limit for creating predictions is reduced to 6 requests per minute with a burst of 1 requests until you add a payment method..."}`。
  - 采样器节点与 Toast 原生原样完整展示上游回答。
- **截图文件**: `docs/evidence/2026-11-05/no-gate/03-schema-fetch-fail-replicate.png`
- **截图逐行文字检验 (ReadMediaFile)**:
  - 顶部栏状态指示：`HTTP 429 Too Many Requests`。
  - 节点 1 (`Load Checkpoint`): 自定义模型填入指定版本。
  - 节点 5 (`采样器`): 红色卡片显示 `【replicate】Replicate 图像接口上游 HTTP 429: {"detail":"Request was throttled. Your rate limit for creating predictions is reduced to 6 requests per minute with a burst of 1 requests until you add a payment method. Your rate limit resets in ~1s.","status":429,"retry_after":1}`。
  - 底部 Toast: 同步显示完整 HTTP 429 响应体文本。
- **出站请求日志 (jsonl 记录截取，脱敏)**:
  ```json
  {
    "time": "2026-11-06T15:14:50+09:00",
    "kind": "upstream",
    "route": "/api/engine/replicate/generate",
    "provider": "replicate",
    "model": "black-forest-labs/flux-dev-lora",
    "method": "POST",
    "endpoint": "https://api.replicate.com/v1/models/black-forest-labs/flux-dev-lora/predictions",
    "requestBody": {
      "input": {
        "prompt": "1girl, cinematic lighting, ultra detailed portrait",
        "aspect_ratio": "1:1",
        "seed": 2100162238,
        "num_inference_steps": 41,
        "guidance": 3.5,
        "lora_weights": "latentcat/sd15-realistic-vision",
        "lora_scale": 1
      }
    },
    "status": 429,
    "responseBody": "{\"detail\":\"Request was throttled. Your rate limit for creating predictions is reduced to 6 requests per minute with a burst of 1 requests until you add a payment method. Your rate limit resets in ~1s.\",\"status\":429,\"retry_after\":1}\n",
    "durationMs": 413,
    "lookup": false
  }
  ```
- **验收判定标签**: **`PASS_BILLING`**

---

### 场景 (d): 运行按钮绝不因 CLASS B 理由被禁用

- **测试用例**: 提示词为空、存在跨架构 LoRA 引用、或底模处于未核实状态时，检验界面右上角「运行：保存图像」按钮的交互状态。
- **前置历史行为**: 在 main 分支旧版本，以上任一 Class B 条件都会导致 `runDisabledReason` 被触发，运行按钮被加上 `disabled` 属性并变灰不可点。
- **M18 实际运行行为**:
  - 提示词为空时，运行按钮保持高亮青色激活，`runBtnDisabled === false`。
  - 状态指示栏如实报告当前拓扑：`7 个节点 · 9 条连线 · 按所选服务商的接口运行`，无任何 Class B 黄字阻断警告。
- **截图文件**: `docs/evidence/2026-11-05/no-gate/04-run-button-never-disabled-class-b.png`
- **截图逐行文字检验 (ReadMediaFile)**:
  - 顶部栏右侧：运行按钮 `运行：保存图像` 带有青色渐变背景 (`#0ea5e9` 亮色高光)，播放图标清晰，完全可点击，无 disabled 灰化。
  - 节点 3 (`正向提示词`): 提示词内容完全为空（仅有占位符）。
  - 顶部状态指示栏文字：`7 个节点 · 9 条连线 · 按所选服务商的接口运行`。
- **验收判定标签**: **`PASS_GENERATION`**

---

## 严格无管道命令真实退出码报告

严格按照指令执行，无管道、真实退出码与结果输出如下：

1. **TypeScript 类型检查 (`npx tsc --noEmit`)**:
   - 执行命令: `npx tsc --noEmit`
   - 实际退出码: `0`
   - 结果: 零错误通过。

2. **生产构建检查 (`npm run build`)**:
   - 执行命令: `npm run build`
   - 实际退出码: `0`
   - 结果: Vite 客户端包与 Cloudflare Sites Worker 产物全量构建成功 (`built in 6.47s`)。

3. **全量单元测试 (`npx vitest run --maxWorkers=2 ...`)**:
   - 执行命令: `npx vitest run --maxWorkers=2 --exclude '.tower/**' --exclude '**/node_modules/**' --exclude '**/dist/**'`
   - 实际结果:
     - **全量测试总数**: 249 个测试文件，1891 个用例。
     - **248 个测试文件、1890 个用例全量通过 (PASS)**。
     - 仅 1 个用例在 249 个文件高并发排队下因超过 5000ms 默认超时报 timeout (`src/utils/graphEngine.agnesVideo.test.ts` 中的 `executeWorkflow uses the real Agnes driver and final builder for node size and seed 13`)。
     - **单独执行该文件 (`npx vitest run src/utils/graphEngine.agnesVideo.test.ts`)**: 12 个测试用例**全量通过 (PASS)**，执行耗时 1342ms，退出码 `0`。
     - **预设测试 (`src/constants/presetsDryRun.test.ts`)**: 36 个预设用例**全量通过 (PASS)**，退出码 `0`。
     - **修改涉及的全部单测**: `generationReadiness.test.ts` (8/8 PASS), `resolveCheckpoint.test.ts` (27/27 PASS), `BaseEngineDriver.test.ts` (4/4 PASS), `graphEngine.test.ts` (66/66 PASS), `replicateImageContract.test.ts` (17/17 PASS)，**全部一次性绿过**。
