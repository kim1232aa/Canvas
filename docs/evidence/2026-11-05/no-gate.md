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
| **CLASS A: 保留 (KEEP)** | 请求根本无法构造出站 | 未配置 API Key、未选择供应商、未选择模型、本地输入畸形无法解析（如不可读 data URL）、图生图/图生视频缺少必需输入源图像、图形解析无目标节点或节点被旁路、操作不存在的服务端资源记录、TAMS uint64 路径参数防注入、Fal/Civitai 缺少 live OpenAPI Schema 时无法推断异构参数字段（无 Schema 强行发送会引发臆测字段，违反「没证据不断言」与「严禁硬编码」；文案如实客观报告「没发出去：<真实原因>」，若 Schema 端点返回 HTTP 4xx/5xx 则原样透传上游状态码与响应体，网络失败原样带网络错误原文，不加建议）。 |
| **CLASS B: 删除 (REMOVE)** | 应用替上游做主预判拦截 | 按模型名称猜测架构/能力、拦截空提示词、拦截「底模尚未核实」、驱动能力清单 (`assertCapability`) 阻断模式调用、拦截上游未拒绝的字段/枚举/参数组合等。应将请求按用户所填原样出站，由上游 API 裁决；可在界面展示非阻塞客观元数据提示，绝不卡死运行按钮或抛错中断。 |
| **转 M23 (Out of M18 Scope)** | 驱动层字段处理，归属 M23 | 位于 `src/engines/drivers/` 目录下的拦截逻辑，由主控分配给 Mission M23 处理。 |

---

## 完整前置拦截点清单

### 1. 浏览器端 (Browser / Client Side)

| 文件与行号 | 触发条件 | 用户可见文字 | 判定 | 代码证据与裁决理由 |
| :--- | :--- | :--- | :--- | :--- |
| `src/App.tsx:390` | `canvasMode === 'graph' && runTargetState.error && nodes.length` | `runTargetState.error`（如「未找到指定的执行节点」） | **CLASS A KEEP** | 画布节点连接未形成有效执行目标，无法发起后端调用。 |
| `src/App.tsx:393` | `canvasMode === 'spatial' && !frame` | `请选择要生成的画板` | **CLASS A KEEP** | 空间画布未选定画板对象，无法构建生成载荷。 |
| `src/App.tsx:445` | `selectedNodeId` 失效且重试仍无执行节点 | `未找到指定的执行节点` | **CLASS A KEEP** | 拓扑图解析不出任何可运行输出节点。 |
| `src/App.tsx:452` | `!boardHasPrompt && /真 LoRA 地址.../` | `${msg}；请填写提示词` | **CLASS B REMOVE (已删除)** | 强制要求提示词非空；上游服务商允许空提示词时应当原样发出去由上游裁决。代码中已删除该强行追加后缀逻辑。 |
| `src/App.tsx:467` | `runDisabledReason` 存在时拦截快捷键执行 | 弹出 toast 警告 | **CLASS B REMOVE (已放行)** | 只要禁用原因属于 Class B，就不应卡死执行按钮与快捷键。M18 解除 Class B 卡点后，快捷键与按钮恢复可用。 |
| `src/utils/generationReadiness.ts:30` | `input.executionBlockedReason` 存在且缺提示词 | `${input.executionBlockedReason}；请填写提示词` | **CLASS B REMOVE (已删除)** | 强制追加「请填写提示词」卡点，属于应用替上游要求必填。代码已删除该逻辑，仅返回原始 executionBlockedReason。 |
| `src/utils/generationReadiness.ts:32` | `input.executionBlockedReason` 独立存在 | 对应未就绪配方原因（如待绑定 LoRA 地址） | **CLASS A KEEP** | 外部导入工作流处于未配方完成的草稿状态，无法构造完整参数。 |
| `src/utils/generationReadiness.ts:34` | `input.sourceLoraAir` 存在 | `来源 LoRA 执行链尚未接入；请保留历史档案，创建新的显式生成分支` | **CLASS A KEEP** | 属于历史存档占位节点，底层无任何具体模型或提供商映射。 |
| `src/utils/generationReadiness.ts:35` | `input.unresolvedModel` 为真 | `底模 ${input.model || '未指定'} 尚未核实，请重新选择已核实资源` | **CLASS B REMOVE (已删除)** | 应用本地白名单未命中即判定「尚未核实」并卡死运行，剥夺用户自由输入模型的权利。代码已删除该检查。 |
| `src/utils/generationReadiness.ts:36` | `input.requireReferenceImage && !input.referenceImageUrl?.trim()` | `编辑输入需要明确参考图，请选择或上传参考图` | **CLASS A KEEP** | 图像编辑/I2I 节点缺少基础输入源图，无法组装出站载荷。 |
| `src/utils/generationReadiness.ts:37` | `!input.provider?.trim()` | `请选择执行服务商` | **CLASS A KEEP** | 未选择 Provider，无法决定目标端点与网络路由。 |
| `src/utils/generationReadiness.ts:38` | `!input.model?.trim()` | `请先选择模型` | **CLASS A KEEP** | 未选择 Model，无法组装 API 必选字段。 |
| `src/utils/generationReadiness.ts:39` | `loras.some(item => item?.unresolvedResource === true)` | `导入工作流包含尚未转换为当前供应商资源 ID/URL 的 LoRA；请在当前供应商的 LoRA 中心重新选择或移除该待解析资源` | **CLASS A KEEP** | 导入的外部 LoRA 尚未解析为真实资源 URL 或 ID，组装空对象无法发送。 |
| `src/utils/generationReadiness.ts:40` | `promptMissing`（提示词为空或纯空格） | `请填写提示词` | **CLASS B REMOVE (已删除)** | 应用替上游要求提示词必填；许多现代模型支持纯随机或无 prompt 引导生成，应由上游 API 判定。代码已删除。 |
| `src/utils/generationReadiness.ts:42` | `input.randomSeed === undefined` (Z-Image) | `请选择 Z-Image 的种子策略` | **CLASS B REMOVE (已删除)** | 前端预先校验参数选项阻断出站。代码已删除该检查，放行至上游由 Space 裁决。 |
| `src/utils/generationReadiness.ts:43` | `!Array.isArray(input.galleryImages)` (Z-Image) | `请选择 Z-Image 的结果集` | **CLASS B REMOVE (已删除)** | 前端预先校验参数选项阻断出站。代码已删除该检查。 |
| `src/utils/generationReadiness.ts:45` | `buildZImagePayload` 抛错 (Z-Image) | `error.message` | **CLASS B REMOVE (已删除)** | 前端本地预校验载荷拦截，阻止发送。代码已删除该检查。 |
| `src/utils/frontendParameters.ts:75` | `if (p.unresolvedModel)` in `spatialRequestParameters` | `底模 ${p.checkpoint || '未指定'} 尚未核实，请重新选择已核实资源` | **CLASS B REMOVE (已删除)** | 空间画板模式在点击运行时因 `unresolvedModel` 抛错阻断，导致图运行放行但画板被卡。代码中已彻底删除该抛错。 |

### 1.1 拓扑引擎 (Graph Engine)

| 文件与行号 | 触发条件 | 用户可见文字 | 判定 | 代码证据与裁决理由 |
| :--- | :--- | :--- | :--- | :--- |
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
| `src/utils/graphEngine.ts:1021` | `!positivePrompt?.trim()` | `请填写提示词` | **CLASS B REMOVE (已删除)** | 前端预阻断空提示词，不允许发出请求。代码已删除，正向提示词为空时提取为 `""` 并正常出站。 |
| `src/utils/graphEngine.ts:1042` | `isModelUnresolved` | `底模 ${checkpointModel || '未指定'} 尚未核实，请重新选择已核实资源` | **CLASS B REMOVE (已删除)** | 前端根据 catalog 匹配状态阻断未核实模型发送。代码已删除，允许用户填入模型直接出站。 |
| `src/utils/graphEngine.ts:1045` | `recipeValues.execution_blocked_reason && !hasRealLora` | 执行阻断文案 | **CLASS A KEEP** | 配方未就绪。 |
| `src/utils/graphEngine.ts:1046` | `recipeValues.source_lora_air` | 来源 LoRA 阻断文案 | **CLASS A KEEP** | 历史占位节点。 |
| `src/utils/graphEngine.ts:1047` | `recipeValues.require_reference_image === true && !initImageUrl` | `编辑输入需要明确参考图，请选择或上传参考图` | **CLASS A KEEP** | I2I 缺失输入原图。 |
| `src/utils/graphEngine.ts:1184-1188` | `!compat.compatible && !params.isVideo && !isSchemaDrivenProvider(...)` | `LoRA [${l.name}] 与底模 [${params.checkpointModel}] 架构不兼容，拒绝静默丢弃执行` | **CLASS B REMOVE (已删除)** | 前端调用 `checkLoraArchitectureCompatibility`，按模型名字字面猜测架构并抛错阻断出站。代码已删除抛错，所有 LoRA 原样通过 `compatibleLoras` 提交给服务商。 |
| `src/utils/graphEngine.ts:1202` | `!reasoningProvider` (LLMReasoningNode) | `请先选择推理服务商` | **CLASS A KEEP** | 推理节点缺失服务商。 |
| `src/utils/graphEngine.ts:1204` | `!reasoningModel` (LLMReasoningNode) | `模型为必填项（推理节点）` | **CLASS A KEEP** | 推理节点缺失模型。 |
| `src/utils/graphEngine.ts:1483, 1490, 1495, 1496, 1503` | 运行目标节点解析异常 / 节点已被删除 | 相应系统常量文本 | **CLASS A KEEP** | 画布拓扑分析不到可执行产物输出端。 |

### 1.2 架构比对 (Resolve Checkpoint)

| 文件与行号 | 触发条件 | 用户可见文字 | 判定 | 代码证据与裁决理由 |
| :--- | :--- | :--- | :--- | :--- |
| `src/utils/resolveCheckpoint.ts:724-734` | `ckptFamily !== 'unknown' && loraFamily !== 'unknown' && ckptFamily !== loraFamily` | `LoRA [${loraName}] (baseModel: ${effectiveLoraBaseModel}) 与底模 [${ckptName}] (baseModel: ${effectiveCkptBaseModel}) 架构可能不兼容，已提交上游裁决。` | **CLASS B REMOVE (已解除阻断并去除非元数据猜测)** | `getArchitectureFamily` 通过模型名称字符串匹配推测生态家族，用于阻断请求出站。代码已彻底去除非元数据名称猜测路径，仅在目录元数据确实返回不同 baseModel 时产出非阻塞 hint，文案不再宣称未发送，不阻断执行。 |

---

### 2. 驱动层 (Engine Drivers)

| 文件与行号 | 触发条件 | 用户可见文字 | 判定 | 代码证据与裁决理由 |
| :--- | :--- | :--- | :--- | :--- |
| `src/engines/BaseEngineDriver.ts:33` | `!this.capabilities.includes(capability)` in `assertCapability` | `当前 Canvas 驱动 [${this.name}] 尚未接入 [${capability}] 能力...` | **CLASS B REMOVE (已彻底删除该空壳方法)** | 驱动自身硬编码 capabilities 数组，一旦调用方尝试未声明的模式（例如未声明 img2img 但上游支持）即在前端直接抛错阻断。代码已彻底删除 `assertCapability` 及其两处调用，不留空壳。 |
| `src/engines/BaseEngineDriver.ts:43` | `!params.model?.trim()` in `normalizeGenerateParams` | `模型为必填项（model is required）` | **CLASS A KEEP** | 模型缺失无法构造请求。 |
| `src/engines/BaseEngineDriver.ts:110` | `!rawParams.model?.trim()` in `generate` | `模型为必填项（model is required）` | **CLASS A KEEP** | 模型缺失无法构造请求。 |
| `src/engines/BaseEngineDriver.ts:118` | `generate` 调用 `this.assertCapability(requiredCap)` | 驱动未声明能力异常 | **CLASS B REMOVE (已彻底删除该调用)** | 直接卡死执行，已彻底删除。 |
| `src/engines/BaseEngineDriver.ts:130` | `chat` 调用 `this.assertCapability('reasoning')` | 驱动未声明能力异常 | **CLASS B REMOVE (已彻底删除该调用)** | 直接卡死执行，已彻底删除。 |
| `src/engines/BaseEngineDriver.ts:134` | `!this.executeChat` in `chat` | `引擎 [${this.name}] 声明支持 reasoning 但未实现 executeChat 方法。` | **CLASS A KEEP** | 代码未实现具体接口方法，无法发起调用。 |
| `src/engines/drivers/VideoDriver.ts:133` | `targetModel.includes('text-to-video') && hasImage` | `这个端点不支持参考图` | **转 M23 (非 M18 范围)** | 驱动按模型名称子串猜测端点能力，本地拦截图生视频请求。文件位于 `src/engines/drivers/`，已由主控划归 Mission M23。 |
| `src/engines/drivers/FalDriver.ts:103` | `scale == null && l.clipStrength != null` | `本地未发送：Fal LoRA 只有 clipStrength，没有可映射到 loras.scale 的模型强度...` | **转 M23 (非 M18 范围)** | 前端预阻断 LoRA 强度参数格式。文件位于 `src/engines/drivers/`，已由主控划归 Mission M23。 |
| `src/engines/drivers/AgnesDriver.ts:118` | `resolution` 与 `size` 同时存在但不一致 | `Agnes Video 的分辨率档位官方字段是 size...` | **转 M23 (非 M18 范围)** | 驱动本地校验字段冲突拒绝发送。文件位于 `src/engines/drivers/`，已由主控划归 Mission M23。 |

---

### 3. 服务端合约与路由 (Server Contracts & Routes)

| 文件与行号 | 触发条件 | 用户可见文字 | 判定 | 代码证据与裁决理由 |
| :--- | :--- | :--- | :--- | :--- |
| `src/server/falImageContract.ts:122` | `!liveInputProperties` (OpenAPI Schema 拉取失败) | `没有发出去：拿不到该端点 Schema，未发送 fal.run（endpoint=${endpoint}）` | **CLASS A KEEP** | Fal 各端点入参字段名异构（如 `num_inference_steps` vs `steps`，`guidance_scale` vs `cfg`），依赖 live OpenAPI Input properties 组装。缺少 Schema 时无法在不猜测字段名的情况下可靠构造出站载荷（遵守「严禁硬编码集成」「没证据不断言」最高准则）。文案如实客观报告「没发出去：拿不到该端点 Schema，未发送 fal.run」，若 Schema 端点返回 HTTP 4xx/5xx 则原样透传上游状态码与响应体。 |
| `src/server/falVideoContract.ts:47` | `!liveInputProperties` | 抛出 `FalSchemaMissingError` | **CLASS A KEEP** | 与 Fal 图像一致，Fal 视频各端点（如 Kling, Wan, CogVideoX）依赖 live OpenAPI Schema 映射参数字段（如 `duration` vs `num_frames`），缺少 Schema 时无法可靠构造出站请求。 |
| `src/server/replicateImageContract.ts:58` | `ReplicateSchemaMissingError` 定义 | `没有发出去：拿不到该模型 Schema，未发送 /predictions（model=${model}）` | **CLASS B REMOVE (已彻底清理该类定义)** | 全库没有任何地方实例化该错误类，代码为历史残留空壳，已彻底清理类定义。 |
| `src/server/replicateImageContract.ts:93` | `!prompt` in `buildReplicatePredictionRequest` | `Replicate 提示词为必填项（prompt is required）` | **CLASS B REMOVE (已删除)** | 应用在发送前强制校验 prompt 必填，代码已删除该 throw，允许空 prompt 正常组装至 `input.prompt` 发往 Replicate 由上游 API 判定。 |
| `src/server/replicateImageContract.ts:176` | 模型名称格式不匹配 owner/name 或 64位哈希 | `Replicate 模型格式无效，需为 owner/name、owner/name:version 或 64位十六进制版本号` | **CLASS A KEEP** | 无法解析 URL 路径参数，请求无法构造。 |
| `src/server/mageImageContract.ts:69` | `!prompt` in `buildMageImageRequest` | `Mage Prompt 必填（prompt is required）` | **CLASS B REMOVE (已删除)** | 应用在发送前强制校验 prompt 必填，代码已删除该 throw，允许空 prompt 正常出站由 Mage 上游 API 判定。 |
| `src/server/runwareImageContract.ts:58` | `!prompt` in `buildRunwareImageRequest` | `Runware 提示词为必填项（prompt is required）` | **CLASS B REMOVE (已删除)** | 应用在发送前强制校验 prompt 必填，代码已删除该 throw，允许空 prompt 正常出站由 Runware 上游 API 判定。 |
| `src/server/modelsLabImageContract.ts:64` | `!prompt` in `buildModelsLabImageRequest` | `ModelsLab 提示词为必填项（prompt is required）` | **CLASS B REMOVE (已删除)** | 应用在发送前强制校验 prompt 必填，代码已删除该 throw，允许空 prompt 正常出站由 ModelsLab 上游 API 判定。 |
| `src/schemas/zImageSpace.ts:53` | 缺失 6 个必填参数之一 in `buildZImagePayload` | `Z-Image 必须填写 ${field}` | **CLASS A KEEP** | Gradio Space `/gradio_api/call/generate` 接口是严格的位置参数数组（7 个必选位置参数，包括 prompt, resolution, seed, steps, shift, random_seed, gallery_images），缺失任一字段会导致位置数组错位，属于请求无法构造的 A 类。 |
| `src/server/civitaiImageContract.ts:69, 75, 94, 95, 106` | Civitai AIR 解析失败 / 找不到对应版本 / modelId 与 versionId 不匹配 | 各项 AIR 解析错误文案 | **CLASS A KEEP** | Civitai 必须依赖 AIR 或 modelId@versionId 构造 workflow 请求体，输入不存在或矛盾时无法生成合法的 JSON payload。 |
| `src/server/civitaiImageContract.ts:104, 111` | 输入数字 ID 或名称命中多个候选项 | `CivitaiAmbiguousError` | **CLASS A KEEP** | 存在多义性无法决定唯一的模型版本。 |
| `src/server/civitaiImageContract.ts:116` | `!officialOpenApi` (OpenAPI 缺失) | `没有发出去：拿不到 Civitai imageGen 官方 OpenAPI，未发送 workflows` | **CLASS A KEEP** | Civitai 图像生成必须依赖官方 OpenAPI 动态匹配 engine（如 comfy/diffusers）与 workflow 步骤树节点结构。缺少 OpenAPI 时无法组装合法的 Civitai orchestration 语法树，属于客观上请求无法构造。保留为 A 类，文案如实客观透传。 |
| `src/server/civitaiImageContract.ts:135` | `!ecosystem && !literalModelEngines...` | `Civitai ecosystem 为必填项，或提供带生态的完整 AIR` | **CLASS A KEEP** | 缺少生态标识无法定位执行引擎。 |
| `src/server/civitaiImageContract.ts:181` | `!selected` (selectImageGenInputSchema 未能匹配分支) | `Civitai imageGen 输入 Schema 未选中（selectImageGenInputSchema 未返回结果），未发送` | **CLASS A KEEP** | 当官方 OpenAPI 中未能通过 `selectImageGenInputSchema` 选定输入 Schema 分支时，底层 workflow JSON 缺少合法的 step 输入规范，请求无法构造。 |
| `src/server/civitaiImageContract.ts:192` | ZImage 内建 selector 收到 source checkpoint | `ZImage 内建 selector 不接受 source checkpoint；请明确选择 turbo/base` | **CLASS A KEEP** | Civitai ZImage 模型的内建 selector 仅接受 turbo/base 模式，传入 source checkpoint 无法映射到官方 OpenAPI 载荷，属于非法参数导致无法构造请求。 |
| `src/server/civitaiImageContract.ts:288, 305` | `loras` 不是数组 / 缺少 AIR 或 ID | 对应参数格式错误 | **CLASS A KEEP** | 本地数据结构无法序列化。 |
| `src/server/civitaiImageContract.ts:316` | LoRA 仅有 clipStrength 无模型强度 | `本地未发送：Civitai LoRA 只有 clipStrength，没有可映射到 loras.strength 的模型强度...` | **CLASS A KEEP** | 官方 Civitai OpenAPI 的 loras 入参规范仅接受 `{ air: string, strength: number }`，无任何 clipStrength 参数；严禁将 clipStrength 假冒为 strength（违反「严禁反透明假数据」最高准则），属于缺少合法模型强度导致请求无法构造。保留该拦截。 |
| `src/server/civitaiImageContract.ts:337` | `schemaFetchFailure` 触发抛错 | `CivitaiSchemaMissingError` | **CLASS A KEEP** | 缺少 Schema 导致无法构建 Civitai workflow。保留为 A 类。 |
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
| `src/server/routes/videoGenerateRoute.ts:684` | `!liveProps` (Fal 视频 Schema 获取失败) | 抛出 `FalSchemaMissingError` 并返回 `notSent: true` (400/502/422) | **CLASS A KEEP** | 缺少 Schema 时无法推断视频参数字段，保留为 A 类。文案如实客观透传真实状态与错误体。 |
| `src/server/routes/videoGenerateRoute.ts:702` | `buildFalVideoRequest` 抛出 `FalSchemaMissingError` | 捕获并返回 `notSent: true` (400/502/422) | **CLASS A KEEP** | 缺少 Schema 导致无法构建视频请求。保留为 A 类。 |
| `src/server/routes/videoGenerateRoute.ts:844, 846, 859, 861, 864, 868` | 视频轮询/取消任务缺少 jobId / 找不到记录 / 跨服务商不一致 | 状态/取消错误返回 (400/404/409) | **CLASS A KEEP** | 本地无此任务 ID，无法向上游发起查询或取消。 |
| `src/server/routes/replicateRoutes.ts:46` | `auth.error` | `auth.error` (400) | **CLASS A KEEP** | 缺少 API Token。 |
| `src/server/routes/replicateRoutes.ts:113` | `error instanceof ReplicateSchemaMissingError` | `return res.status(error.httpStatus)...`，标注 `notSent: true` | **CLASS B REMOVE (已删除不可达死分支)** | 全局无任何地方实例化该类，该分支系不可达死代码；已彻底删除。 |
| `src/server/routes/replicateRoutes.ts:453, 461` | 取消任务缺少 ID 或缺少 Key | 错误返回 (400) | **CLASS A KEEP** | 参数不足。 |

---

### 4. 服务端主路由 (server.ts)

| 文件与行号 | 触发条件 | 用户可见文字 | 判定 | 代码证据与裁决理由 |
| :--- | :--- | :--- | :--- | :--- |
| `server.ts:344` | 全局 JSON 解析失败 | `error.message` (400) | **CLASS A KEEP** | 请求体损坏。 |
| `server.ts:347` | `workflowSnapshot` 非对象 | `workflowSnapshot 必须为对象` (400) | **CLASS A KEEP** | 数据类型错误。 |
| `server.ts:478` | `/api/media` 收到非字符串 dataUrl | `字段 dataUrl 必须为 image/video/audio 的 base64 data URL` (400) | **CLASS A KEEP** | 输入畸形无法解析媒体。 |
| `server.ts:487` | `/api/media/:hash` 媒体不存在 | `媒体不存在` (404) | **CLASS A KEEP** | 本地存储查无此项。 |
| `server.ts:1080` | `rejectSchemaEnum` 函数壳体 | 现永远返回 `false`（空壳） | **CLASS B REMOVE (已删除)** | 历史残留枚举拦截壳体，已彻底删除函数定义与调用。 |
| `server.ts:1455` | `GET /api/model-schema` Replicate 格式非 owner/name | `Replicate 模型格式必须为 owner/name` (400) | **CLASS A KEEP** | 元数据查询端点，非生图出站。 |
| `server.ts:3058` | `!falKey` in `/api/fal/generate` | `未配置 Fal.ai API 密钥...` (400) | **CLASS A KEEP** | 缺少 API Key。 |
| `server.ts:3062` | `!model` in `/api/fal/generate` | `模型为必填项（model is required）` (400) | **CLASS A KEEP** | 缺少模型参数。 |
| `server.ts:3111` | `!liveProps` in `/api/fal/generate` | 抛出 `FalSchemaMissingError` 并返回 `notSent: true` (400/502/422) | **CLASS A KEEP** | Fal 生图缺少 liveProps 时无法组装异构字段，保留为 A 类。如实返回「没发出去：拿不到该端点 Schema，未发送 fal.run」，完整透传 Schema 端点的真实错误与状态码。 |
| `server.ts:3129` | `falImageFieldGate` 抛出 `FalSchemaMissingError` | 捕获并返回 `notSent: true` (400/502/422) | **CLASS A KEEP** | 缺少 liveProps 无法构造参数，保留为 A 类。 |
| `server.ts:3168` | `loras.find(l => !(l?.path || l?.url))` | `LoRA 没有可直接访问的 path/url，无法发送` (400) | **CLASS A KEEP** | Fal.ai 官方接口要求 LoRA 必须包含直链下载 URL 或官方端点 path；若既无 path 又无 url，请求参数为 undefined，且为防止泄露 Civitai Token 不做隐式改写，属于请求无法构造。 |
| `server.ts:3200` | `custom_parameters` JSON 语法错误 | `custom_parameters parse error` (422) | **CLASS A KEEP** | 用户填写的自定义 JSON 语法错误，无法合并出站。 |
| `server.ts:3338` | `GET /api/civitai/workflow/:id` 缺 Key | `Civitai API key is required` (400) | **CLASS A KEEP** | 工作流查询缺 Key。 |
| `server.ts:3410` | `!model` in Civitai generate | `模型为必填项（model is required）` (400) | **CLASS A KEEP** | 缺少模型参数。 |
| `server.ts:3423` | `!apiKey` in Civitai generate | `【未配置 Civitai API Key】...` (400) | **CLASS A KEEP** | 缺少 API Key。 |
| `server.ts:3474` | Civitai 视频 Schema 不可用 (`!openApi`) | `HTTP ${status}: ${body}\n没有发出去：拿不到 Civitai 视频官方 Schema，未发送 workflows` (502) | **CLASS A KEEP** | Civitai 视频必须依赖官方 OpenAPI 构造 workflow 树，保留为 A 类。文案已规范完整包含上游响应体与状态码。 |
| `server.ts:3495` | `buildCivitaiVideoInput` 映射失败 | 错误信息 (400) | **CLASS A KEEP** | 本地 Schema 校验失败导致无法构造有效 workflow 载荷。 |
| `server.ts:3705` | Civitai 生图 `CivitaiSchemaMissingError` | `notSent: true` (400/502/422) | **CLASS A KEEP** | Civitai 官方 OpenAPI 获取失败导致无法构造 workflow，保留为 A 类。完整透传真实错误体。 |
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
| `server.ts:4483` | `!isNumericModelId` in TensorArt generate | `没发出去：TAMS 模型接口需要数字 ID（收到: "${requestedModelOrTool}"）` (400) | **CLASS A KEEP** | 官方文档 (`https://tams-docs.tensor.art/docs/api/apis/tams-api-v-1-service-get-model`) 明确规定 `GET /v1/models/:modelId` 的 `modelId` 必须是 `uint64` 路径参数。若将任意非数字字符串直接拼入 `${origin}/v1/models/${modelId}` 会导致 URL 路径注入；且 `src/schemas/tensorModelApi.ts` 的 `tensorModelId()` 亦对非数字抛错。属于请求无法构造的 A 类。保留校验，文案已改为纯客观描述，无说教建议。 |
| `server.ts:4518` | `checkpoint?.modelType && checkpoint.modelType !== 'CHECKPOINT'` | `所选模型不是 CHECKPOINT，不能作为底模` (400) | **CLASS B REMOVE (已删除)** | 官方 TAMS API 文档 (`https://tams-docs.tensor.art/docs/api/apis/tams-api-v-1-service-get-model`) 显示 `modelType` 枚举包含 `[DEFAULT, CHECKPOINT, LORA, ...]` 且默认值为 `DEFAULT`。本地仅认 `CHECKPOINT` 会错杀默认模型与新类型；代码已删除本地阻断，直接向 `/v1/jobs` 发起任务由上游 TAMS 裁决。 |
| `server.ts:4625` | `!model` in HuggingFace generate | `模型为必填项（model is required）` (400) | **CLASS A KEEP** | 缺少模型参数。 |
| `server.ts:4649` | `!['hf-inference','fal-ai','z-image-space'].includes(hfProvider)` | `未知的 HuggingFace 接入模式` (400) | **CLASS A KEEP** | 内部模式路由无效。 |
| `server.ts:4653` | `isZImage && !hfKey` | `Z-Image Space 属于私有 Space，必须配置 Hugging Face Token...` (400) | **CLASS A KEEP** | 缺少 API Token。 |
| `server.ts:4681` | `buildZImagePayload` catch | `error.message` (400) | **CLASS A KEEP** | Z-Image Gradio `/gradio_api/call/generate` 是位置参数数组，缺少必选位置参数会导致载荷无法构造。保留为 A 类。 |
| `server.ts:5112` | `!model` in ModelScope generate | `模型为必填项（model is required）` (400) | **CLASS A KEEP** | 缺少模型参数。 |
| `server.ts:5121` | `headerSite && ((routeIsAi && headerSite === 'cn') || (!routeIsAi && headerSite === 'ai'))` | `魔搭站点冲突：路由为 ${routeIsAi ? '国际站 modelscope_ai' : '国内站 modelscope'}，但请求标注 site=${headerSite}；CN 与 AI 令牌/域名隔离，未出站。` (400) | **CLASS A KEEP** | 严格防范跨站点/域名令牌泄露安全底线（国内站 Token 绝对不能发到国际站，反之亦然），属于请求构造时的安全隔离约束。 |
| `server.ts:5134` | `!msAttemptPlan.keys.length` in ModelScope generate | `未配置魔搭... Token` (400) | **CLASS A KEEP** | 缺少 API Token。 |
| `server.ts:5158` | `buildModelScopeImagePayload` catch | `error.message` (400) | **CLASS A KEEP** | 载荷序列化错误。 |
| `server.ts:5329` | `!nanoKey` in NanoGPT generate | `未配置 NanoGPT API Key (x-nanogpt-key)。` (400) | **CLASS A KEEP** | 缺少 API Key。 |
| `server.ts:5336` | `!model` in NanoGPT generate | `模型为必填项（model is required）` (400) | **CLASS A KEEP** | 缺少模型参数。 |
| `server.ts:5344` | NanoGPT 无法解析对应端点 | `NanoGPT 无法解析该模型对应端点` (400) | **CLASS A KEEP** | 缺少目标端点映射。 |
| `server.ts:5453` | `!model` in Gemini generate | `模型为必填项（model is required）` (400) | **CLASS A KEEP** | 缺少模型参数。 |
| `server.ts:5477` | `!effectiveKey` in Gemini generate | `未配置 Google Gemini API 密钥...` (400) | **CLASS A KEEP** | 缺少 API Key。 |

---

## 统计汇总与重数核对 (Exact Recount)

表格逐行重新清点统计结果完全一致：
- **总审计条目数**: 128 条
- **CLASS A 保留项**: 101 条（真实无法构建请求、缺失 Key、缺失 Provider、缺失 Model、TAMS uint64 路径校验、Fal/Civitai 缺少 Schema 无法构造载荷、本地输入数据格式损坏、AIR 歧义、安全隔离保护、缺少模型强度无法组装 Civitai loras 规范载荷）
- **CLASS B 删除/解除阻断项**: 24 条（全部已在当前代码中删除或彻底清理，代码中不再有任何一条处于拦截状态的 Class B 门禁）
- **转 M23 项**: 3 条（`VideoDriver.ts:133`, `FalDriver.ts:103`, `AgnesDriver.ts:118`，位于 `src/engines/drivers/` 目录，已由主控划归 Mission M23）

---

## 既有测试修改说明与核对 (Test Modifications)

依主控要求，凡修改既有测试断言之处，逐条登记比对：

| 文件与行号 | 旧断言行为 | 新断言行为 | 旧断言守护目标 | 新断言意义与为何不削弱 |
| :--- | :--- | :--- | :--- | :--- |
| `src/constants/presetsDryRun.test.ts:38-44` | `extractWorkflowParameters(...)` 必须抛出「请填写提示词」 | `extractWorkflowParameters(...)` 不再抛错，且提取的 `positivePrompt === ''` | 确保预设无 recipe 时未硬编码兜底/默认提示词 | 新断言继续守住「没有默认提示词塞入」的不变量，同时验证 M18 允许空提示词提取出站的规则。 |
| `src/utils/graphEngine.test.ts:25-29` | `extractWorkflowParameters` 遇到 `import_unresolved_resource:true` 必须抛出「底模...尚未核实」 | 不再抛出异常，返回对象包含 `unresolvedModel: true` | 原用于阻断未核实底模出站 | 守住元数据标记能力，但解除本地粗暴抛错中断，由上游裁决。 |
| `src/utils/graphEngine.test.ts:670-682` | 空提示词提取必须抛出「请填写提示词」 | 空提示词提取正常完成，提取结果 `positivePrompt === ''` | 强制前端禁止空提示词 | 确保空提示词被真实保留为 `''` 出站，绝不插入任何默认文本。 |
| `src/utils/graphEngine.test.ts:1205-1230` | FLUX + Krea2 Turbo (SDXL) LoRA 不兼容时抛错拒绝执行且未调用 `EngineRegistry.generate` | `executeWorkflow` 成功调用 `EngineRegistry.generate`，所有 LoRA 均送出，LoRA 节点不被置为 error | 旧断言由应用按名字判断并阻止出站 | 贯彻用户「禁止多余拦截」指令，异构 LoRA 不再被本地拦截，由服务商真实 API 裁决。 |
| `src/utils/generationReadiness.test.ts:5-8` | `unresolvedModel: true` 返回包含「底模」阻断文案 | `unresolvedModel: true` 返回 `undefined`（不阻止运行） | 按钮禁用逻辑 | 确保运行按钮不因底模未核实被禁用。 |
| `src/utils/generationReadiness.test.ts:14-17` | `prompt: ''` 返回「请填写提示词」 | `prompt: ''` 返回 `undefined`（不阻止运行） | 按钮禁用逻辑 | 确保运行按钮不因空提示词被禁用。 |
| `src/utils/generationReadiness.test.ts:18-22` | 缺 LoRA 且缺提示词时追加「；请填写提示词」 | 仅返回配方本身执行锁原因，不追加提示词后缀 | 提示词强制必填 | 移除应用强加给用户的提示词必填要求。 |
| `src/utils/resolveCheckpoint.test.ts:378-390` | 异构 LoRA 结论包含「未发送至上游」 | 结论包含「已提交上游裁决」，提供非阻塞 hint | 旧断言宣称未发送 | 如实反映当前架构比对仅作为非阻塞提示，请求已正常提交上游。 |
| `src/utils/frontendParameters.test.ts:11` | `spatialRequestParameters(frame({unresolvedModel:true}))` 必须抛出「底模...尚未核实」 | 不再抛出异常，顺利返回归一化请求参数 | 画板模式阻断未核实底模 | 解除画板模式运行按钮与执行的本地卡点。 |

---

## 全量 16 项变异测试检验报告 (Full Mutation Test Battery)

在 `/tmp/m18-mut-verify` 临时工作区中，对全部已删除的门禁逐项加回原始代码，运行相关测试套件，验证其全部变红 (FAIL)；反向移除 A 类门禁确认其同样变红：

| 变异编号与测试项 | 加回的门禁代码 | 运行命令 | 实际退出码 | 真实输出特征 |
| :--- | :--- | :--- | :--- | :--- |
| **Mutation (i)**: `graphEngine.ts` 空提示词抛错 | `if (!positivePrompt?.trim()) throw new Error('请填写提示词');` | `npx vitest run src/utils/graphEngine.test.ts -t "L2b: 提示词为空"` | **1 (RED)** | `Error: 请填写提示词` |
| **Mutation (ii)**: `graphEngine.ts` 底模未核实抛错 | `if (isModelUnresolved) throw new Error('底模 ... 尚未核实');` | `npx vitest run src/utils/graphEngine.test.ts -t "guards unresolved models"` | **1 (RED)** | `底模 original 尚未核实` |
| **Mutation (iii)**: `graphEngine.ts` 跨架构 LoRA 抛错 | `if (!compat.compatible) throw new Error(...)` | `npx vitest run src/utils/graphEngine.test.ts -t "Krea2 Turbo mismatch"` | **1 (RED)** | `LoRA [Krea2 Turbo] AsianMix Lora 与底模 ... 架构不兼容` |
| **Mutation (iv-a)**: `generationReadiness.ts` 提示词检查 | `if (!input.prompt?.trim()) return '请填写提示词';` | `npx vitest run src/utils/generationReadiness.test.ts -t "requires a selected provider and allows empty prompt"` | **1 (RED)** | `expected '请填写提示词' to be undefined` |
| **Mutation (iv-b)**: `generationReadiness.ts` 未核实底模检查 | `if (input.unresolvedModel) return '底模 ... 尚未核实';` | `npx vitest run src/utils/generationReadiness.test.ts -t "prioritizes serialized blocking reasons"` | **1 (RED)** | `expected '底模 ... 尚未核实' to be undefined` |
| **Mutation (iv-c)**: `generationReadiness.ts` pendingRecipe 提示词后缀 | `return promptMissing ? `${input.executionBlockedReason}；请填写提示词` : ...` | `npx vitest run src/utils/generationReadiness.test.ts -t "pendingRecipe does not append"` | **1 (RED)** | `expected '...；请填写提示词' to be '...'` |
| **Mutation (iv-d)**: `generationReadiness.ts` Z-Image 检查 | `if (input.randomSeed === undefined) return '请选择 Z-Image 的种子策略';` | `npx vitest run src/utils/generationReadiness.test.ts -t "allows Z-Image Space requests"` | **1 (RED)** | `expected '请选择 Z-Image 的种子策略' to be undefined` |
| **Mutation (v)**: `BaseEngineDriver.ts` assertCapability 阻断 | `if (!this.capabilities.includes(requiredCap)) throw new Error(...)` | `npx vitest run src/engines/BaseEngineDriver.test.ts -t "capability list no longer throws"` | **1 (RED)** | `Error: 当前 Canvas 驱动 [test] 尚未接入 [img2img] 能力` |
| **Mutation (vi)**: `server.ts` TAMS `modelType !== 'CHECKPOINT'` | `if (checkpoint?.modelType !== 'CHECKPOINT') return res.status(400)...` | `npx vitest run src/server/tensorArtModelTypeGate.test.ts -t "TAMS modelType !== CHECKPOINT regression"` | **1 (RED)** | `AssertionError: expected calls to include 'https://tams.tensor.art/v1/jobs'` |
| **Mutation (vii)**: `replicateImageContract.ts` 空提示词抛错 | `if (!prompt) throw new Error('Replicate 提示词为必填项（prompt is required）');` | `npx vitest run src/server/replicateImageContract.test.ts -t "throws when model is missing"` | **1 (RED)** | `Error: Replicate 提示词为必填项（prompt is required）` |
| **Mutation (viii)**: `frontendParameters.ts` spatial 未核实底模 | `if (p.unresolvedModel) throw new Error('底模 ... 尚未核实');` | `npx vitest run src/utils/frontendParameters.test.ts -t "enforces serialized model"` | **1 (RED)** | `Error: 底模 未指定 尚未核实，请重新选择已核实资源` |
| **Mutation (ix)**: `mageImageContract.ts` 空提示词抛错 | `if (!prompt) throw new Error('Mage Prompt 必填（prompt is required）');` | `npx vitest run src/server/mageImageContract.test.ts -t "allows empty prompt"` | **1 (RED)** | `Error: Mage Prompt 必填（prompt is required）` |
| **Mutation (x)**: `runwareImageContract.ts` 空提示词抛错 | `if (!prompt) throw new Error('Runware 提示词为必填项（prompt is required）');` | `npx vitest run src/server/runwareImageContract.test.ts -t "allows empty prompt"` | **1 (RED)** | `Error: Runware 提示词为必填项（prompt is required）` |
| **Mutation (xi)**: `modelsLabImageContract.ts` 空提示词抛错 | `if (!prompt) throw new Error('ModelsLab 提示词为必填项（prompt is required）');` | `npx vitest run src/server/modelsLabImageContract.test.ts -t "allows empty prompt"` | **1 (RED)** | `Error: ModelsLab 提示词为必填项（prompt is required）` |
| **Reverse A1**: 移除 `generationReadiness` 缺服务商检查 | 注释掉 `if (!input.provider?.trim()) return '请选择执行服务商';` | `npx vitest run src/utils/generationReadiness.test.ts -t "requires a selected provider"` | **1 (RED)** | `expected undefined to include '服务商'` |
| **Reverse A2**: 移除 `graphEngine.ts` 缺模型检查 | 注释掉 `throw new Error('请先选择模型');` | `npx vitest run src/utils/graphEngine.test.ts -t "B2: 节点未选模型时抛出"` | **1 (RED)** | `expected [Function] to throw an error` |

**验证结论**: 全部 14 项前置门禁突变恢复后测试 100% 变红，反向移除 A 类校验测试亦 100% 变红；恢复当前修复代码后全量绿过，临时工作目录已彻底销毁，`git status` 完全干净。

---

## 真实浏览器 UI 验收报告 (Browser Acceptance Verification)

- 执行环境：Node v22.23.2
- 本地服务端口：`3120`（通过 `PORT=3120 npx tsx server.ts` 运行）
- 浏览器：Google Chrome Headless (`/usr/bin/google-chrome --headless=new --remote-debugging-port=9420 --user-data-dir=/tmp/canvas-chrome-nogate18b`)
- 真实密钥来源：仓库根目录真实 `.env` 凭证
- 验收标签定义（仅允许使用以下 7 个标签）：
  - `PASS_GENERATION`: 产物在界面可见
  - `PASS_BILLING`: 到达真实上游服务商并带完整参数，上游余额/点数/额度不足拒绝原样回显
  - `BLOCKED_AUTH`: 401 密钥失效
  - `BLOCKED_CONFIG`: 未配密钥
  - `NOT_SENT`: 没有任何请求离开本机
  - `CONTRACT_REJECT`: 400/422/404 合约拒绝
  - `WIRING_BUG`: 接线缺陷

### 场景 (a): 跨架构 LoRA（SD1.5 LoRA + FLUX 底模）在 Replicate 运行

- **测试用例**: 在 Replicate 服务商下，底模选择 `black-forest-labs/flux-dev-lora`（FLUX 架构族），连接 SD 1.5 架构 LoRA (`latentcat/sd15-realistic-vision`)，填写提示词并点击「运行：保存图像」。
- **前置历史行为**: 在 main 分支旧版本，前端 `graphEngine.ts:1184` 直接抛出 `LoRA [...] 与底模 [...] 架构不兼容，拒绝静默丢弃执行`，LoRA 节点被标红，**零个请求离开本机**。
- **M18 实际运行行为**:
  - 请求顺利出站发往 Replicate 官方 API！
  - 出站请求体完整包含所有参数：`lora_weights: "latentcat/sd15-realistic-vision"`, `lora_scale: 1`, `prompt`, `num_inference_steps: 41`, `guidance: 3.5`。
  - 上游 Replicate 真实返回 HTTP 402 Insufficient credit。
  - 画布采样器节点原生、完整、原样展示上游 HTTP 402 错误体；底部 Toast 同步如实回显。
- **更正说明**: 第 1 轮报告曾将 `black-forest-labs/flux-dev-lora` 误写为 SDXL，现更正为 FLUX 架构底模。由于 Replicate 不在 `SCHEMA_DRIVEN` 中，在 main 上该组合必被旧门禁拦截，本测试严格证明了跨架构 LoRA 不再被本地拦截且已出站。
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

### 场景 (c): 实时 Schema 获取不可用（Fal.ai OpenAPI 端点网络阻断）

- **测试用例**: 在 Fal.ai 工作流 (`fal-ai/flux-lora`) 中，通过 hosts 配置让 `fal.ai` 域名网络不可达（模拟端点 Schema 无法获取的真实网络故障），点击运行。
- **前置历史行为**: 旧版本或不透明实现可能静默降级或吞错伪造。
- **M18 实际运行行为**:
  - 本地请求因无法获取必要 Schema 而停止发送至 `fal.run`（属 CLASS A 正确保留项）。
  - 服务器如实返回 HTTP 502，错误信息完整包含真实的底层网络错误（`fetch failed`）以及诚实客观的停机声明：「`没有发出去：拿不到该端点 Schema，未发送 fal.run（endpoint=fal-ai/flux-lora）`」，绝无任何主观指导说教。
  - 画布采样器节点与底部 Toast 原生、完整回显此真实报错。
  - 测试完毕立即撤销 hosts 改动，网络恢复。
- **截图文件**: `docs/evidence/2026-11-05/no-gate/03-schema-fetch-fail-fal.png`
- **截图逐行文字检验 (ReadMediaFile)**:
  - 顶部栏状态指示：`无上游响应：Schema 拉取网络错误 https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fa...`
  - 节点 1 (`加载底模 (Fal.ai)`): 模型填入 `fal-ai/flux-lora`。
  - 节点 5 (`采样器`): 红色卡片显示：
    `【fal】HTTP 502: 无上游响应：Schema 拉取网络错误 https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai%2Fflux-lora: fetch failed`
    `没有发出去：拿不到该端点 Schema，未发送 fal.run（endpoint=fal-ai/flux-lora）`
  - 底部 Toast: 同步显示完整 HTTP 502 与 `fetch failed` 错误体文本。
- **出站请求日志 (jsonl 记录截取，脱敏)**:
  ```json
  {
    "time": "2026-11-06T17:03:20+09:00",
    "kind": "upstream",
    "route": "/api/fal/generate",
    "provider": "fal",
    "model": "fal-ai/flux-lora",
    "method": "GET",
    "endpoint": "https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai%2Fflux-lora",
    "status": null,
    "responseBody": null,
    "error": "fetch failed",
    "durationMs": 184,
    "keyIndex": {
      "provider": "fal",
      "index": 0,
      "count": 1,
      "source": "pool"
    },
    "lookup": true,
    "startedAt": "2026-11-06T08:03:20.306Z"
  }
  ```
- **验收判定标签**: **`NOT_SENT`**（因 Schema 端点网络错误导致出站阻断，诚实如实回显「没有发出去」与底层网络错误，无任何伪造）

---

### 场景 (d): 运行按钮绝不因 CLASS B 理由被禁用（空提示词交互状态观察）

- **测试用例**: 提示词为空时，检验界面右上角「运行：保存图像」按钮的交互状态。
- **前置历史行为**: 在 main 分支旧版本，空提示词会导致 `runDisabledReason` 被触发，运行按钮被加上 `disabled` 属性并变灰不可点。
- **M18 实际运行行为**:
  - 提示词为空时，运行按钮保持高亮青色激活，`runBtnDisabled === false`。
  - 状态指示栏如实报告当前拓扑：`7 个节点 · 9 条连线 · 按所选服务商的接口运行`，无任何 Class B 黄字阻断警告。
- **更正说明**: 本场景纯为 UI 交互按钮状态检验，此时尚未点击发起请求，不套用 `PASS_GENERATION`（该标签专指已见产物）。
- **截图文件**: `docs/evidence/2026-11-05/no-gate/04-run-button-never-disabled-class-b.png`
- **截图逐行文字检验 (ReadMediaFile)**:
  - 顶部栏右侧：运行按钮 `运行：保存图像` 带有青色渐变背景 (`#0ea5e9` 亮色高光)，播放图标清晰，完全可点击，无 disabled 灰化。
  - 节点 3 (`正向提示词`): 提示词内容完全为空（仅有占位符）。
  - 顶部状态指示栏文字：`7 个节点 · 9 条连线 · 按所选服务商的接口运行`。
- **验收结果**: 按钮可用性检验通过，未被 Class B 理由置灰。

---

## 严格无管道命令真实退出码报告

基于最新本地 main (`c2b1a0f`，已合入 M10、M15、M16、M24) 基线，在当前 `wt-18` 分支上严格按照指令执行，无管道、真实退出码与结果输出如下：

1. **TypeScript 类型检查 (`npx tsc --noEmit`)**:
   - 执行命令: `npx tsc --noEmit`
   - 实际退出码: `0`
   - 结果: 零错误通过。

2. **生产构建检查 (`npm run build`)**:
   - 执行命令: `npm run build`
   - 实际退出码: `0`
   - 结果: Vite 客户端包与 Cloudflare Sites Worker 产物全量构建成功 (`built in 3.54s`)。

3. **全量单元测试 (`npx vitest run --maxWorkers=2 ...`)**:
   - 执行命令: `npx vitest run --maxWorkers=2 --exclude '.tower/**' --exclude '**/node_modules/**' --exclude '**/dist/**'`
   - 实际退出码: `0`
   - 测试文件: **256 个测试文件全量通过 (256 passed)**。
   - 测试用例: **1972 个用例全量通过 (1972 passed)**。
   - 执行耗时: 130.84s，零失败、零超时，全量退出码 0。
   - **修改涉及的全部单测**: `generationReadiness.test.ts` (9/9 PASS), `resolveCheckpoint.test.ts` (27/27 PASS), `BaseEngineDriver.test.ts` (4/4 PASS), `graphEngine.test.ts` (66/66 PASS), `replicateImageContract.test.ts` (17/17 PASS), `frontendParameters.test.ts` (15/15 PASS), `mageImageContract.test.ts` (10/10 PASS), `runwareImageContract.test.ts` (13/13 PASS), `modelsLabImageContract.test.ts` (21/21 PASS), `tensorArtModelTypeGate.test.ts` (1/1 PASS), `presetsDryRun.test.ts` (36/36 PASS)，**全部 100% 绿过**。

4. **系统网络与 hosts 状态核验**:
   - 已通过 `cat /etc/hosts` 严格实测核验，任何测试用的 `fal.ai` 域名劫持均已彻底清除，文件内容仅包含系统默认的 localhost 与本机 host，无残留条目，未对其他 agent 服务造成任何影响。
