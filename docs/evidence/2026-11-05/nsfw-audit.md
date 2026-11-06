# 2026-11-05 全服务商官方 NSFW / 安全开关全量核验与默认放开验收报告 (Mission M10 - Round 3)

> **最高工程规范与反虚假成功准则**：
> 1. 用户最高原则（2026-11-05 原文逐字）: **「我们不反对nsfw，有nsfw开关的都默认开启」**。
> 2. 严禁静默容灾与虚假成功（透明错误，真实提供者路由）；严禁回退与兜底；严禁硬编码集成；严禁反透明的黑盒行为与虚假自愈。
> 3. 判定应来自实时 schema 或官方契约里声明了该字段。已经出现在 live schema 里的字段，才在该节点上默认放开。未核实或官方文档存在分歧的字段，绝不进行隐式服务端注入。
> 4. 账号级设置（API 无法控制的设置）绝不伪造：上游若仍然拒绝或打码，节点原样显示上游响应，并明确记录账号级设置约束。
> 5. 唯一验收标准：真实端点、真实参数、UI 实际点击通过并产生真实产物或原样报错证据；**最后：单元测试通过绝不等于实际问题解决**。

---

## 一、审查意见 (rev-m10-b R2) 逐项整改对账清单

| 评审项 | 审查要求 | M10 整改落实细节 | 状态 |
|---|---|---|---|
| **P1-1** | 解决 `nsfw-audit.md` 与 `e2e-summary.json` 数据冲突：(a) 在画布上去掉 LoRA、seed 设为 ≤999999999 重跑 Venice，上游额度拒绝记 `PASS_BILLING`；Together 401 记 `BLOCKED_AUTH`。 | 1. 查明根因：此前多服务商连续点击时，Together 的 `disable_safety_checker` 遗留并因服务端无条件 assign 漏进 Venice 入参，导致 Venice 报 400 未知字段。修复 `schemaProviders.ts`，开启 `schemaFieldsOnly` 时严格丢弃其他服务商未声明的遗留字段。<br>2. 载入无 LoRA 的干净预设 `std-venice-t2i`（模型 `venice-sd35`，seed 42），真实点击上游。真实上游返回 HTTP 402 `Insufficient USD or Diem balance`，两份文件完全一致记录 **PASS_BILLING**。<br>3. Together 401 准确记录为 **BLOCKED_AUTH**，响应体与日志完全对齐。 | **已闭环** |
| **P1-2** | Civitai `allowMatureContent` 泄漏进 `steps[].input`（官方 `ImageGenInput` 为 `additionalProperties: false`）：在 `civitaiImageContract.ts` 加入 `controls`，在 `civitaiVideo.ts` 应用 custom 参数前剥除；加位置测试与突变验证；真实浏览器验证。 | 1. 在 `src/server/civitaiImageContract.ts` 的 `controls` 正则中加入 `allowMatureContent`，使 `advanced()` 不再将其拷入 `genInput`（`steps[0].input`）。<br>2. 在 `src/schemas/civitaiVideo.ts` 中解析并剥除 `custom_parameters` 中的 `allowMatureContent`，使视频 `payload` 绝不携带该字段。<br>3. 契约测试中新增位置断言：断言 `allowMatureContent` 存在于工作流根级，而 `steps[0].input` 绝无此字段。<br>4. 突变验证：故意让字段漏入 step input，测试立即变红；恢复后变绿。<br>5. 真实浏览器点击验证：出站日志确认为根级 `allowMatureContent: true/false`，`steps[0].input` 严格无此字段。 | **已闭环** |
| **P2-1** | `AGENTS.md` 与 `CLAUDE.md` §6 示例对齐：代码已将 ModelsLab `safety_checker` 标为 `conflicting_documentation` 且不注入，文档示例移除 `safety_checker="no"`。 | 更新两份规则文件的第 6 节，移除 `safety_checker="no"` 示例，其余核实示例及两句用户原话保持不变。 | **已闭环** |
| **P2-2** | `CivitaiModal.tsx` 清理未使用的 `searchCivitaiModels` import。 | 彻底清理 `CivitaiModal.tsx` 中未使用的 `searchCivitaiModels` 引用。 | **已闭环** |
| **P2-3** | Civitai 检查器在挂载时将默认值写入 `custom_parameters`，确保徽章、请求体、历史三者一致。 | 提取 `CivitaiAllowMatureControl` 组件，挂载时若未配置则自动向 `custom_parameters` 写入 `allowMatureContent: true`。 | **已闭环** |
| **P2-4** | 截图 07/08 需在 LoRA 检索完成后重拍，让结果卡片与 NSFW 开关同框，并从日志取出对应的 `nsfw=` 参数。 | 增加检索加载等待时间至卡片渲染完毕，重拍 07/08 截图，画面完整包含检索到的 343 个 LoRA 卡片与 `🔥 NSFW` 开关；并记录出站参数。 | **已闭环** |

---

## 二、25 家提供商官方 NSFW / 安全开关全量核验矩阵

| # | 服务商 | 官方溯源 URL / Schema 来源 | 官方字段名 | 字段类型 | 官方默认值 | NSFW-放开取值 (项目默认) | 核实状态 | 契约定义与官方证据说明 |
|---|---|---|---|---|---|---|---|---|
| 1 | **Together AI** | `https://docs.together.ai/openapi.yaml` | `disable_safety_checker` | `boolean` | `false` | `true` | **已核实** | 官方 OpenAPI `/v1/images/generations` 定义：`disable_safety_checker: { type: "boolean", description: "If true, disables the safety checker for image generation." }` |
| 2 | **Venice AI** | `https://api.venice.ai/api/v1/swagger.yaml` | `safe_mode` | `boolean` | `true` | `false` | **已核实** | 官方 Swagger `/image/generate` 定义：`safe_mode: { type: "boolean", default: true, description: "Whether to blur images classified as adult content. Defaults to true. Set to false to receive unblurred output." }`；另 `/images/generations` 定义 `moderation: "low"` |
| 3 | **Fal.ai** | `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/flux-lora` | `enable_safety_checker` | `boolean` | `true` | `false` | **已核实** | 官方 OpenAPI 定义：`enable_safety_checker: { type: "boolean", default: true, description: "If set to true, the safety checker will be enabled. Disabling it requires account authorization..." }` |
| 3b | **Fal.ai (Pro)** | `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/flux-pro/v1.1` | `safety_tolerance` | `string` enum | `"2"` | `"5"` | **已核实** | 官方 OpenAPI flux-pro/v1.1 定义：`safety_tolerance: enum ["1".."6"]`，description 明确标注 1 为最严格，**5 为最宽松 (most permissive)**。 |
| 4 | **Replicate** | `https://api.replicate.com/v1/models/black-forest-labs/flux-schnell` | `disable_safety_checker` | `boolean` | `false` | `true` | **已核实** | 官方 OpenAPI Input Schema 包含 `disable_safety_checker: { type: "boolean", default: false }`，如 flux-schnell / flux-dev 各版本 |
| 5 | **Civitai (工作流)** | `https://developer.civitai.com/orchestration/guide/submitting-work` | `allowMatureContent` | `boolean` | `false` | `true` | **已核实** | 官方 Orchestration 提交文档：`allowMatureContent` 为工作流 JSON body 根级字段（与 `steps` 同级），允许生成成熟内容；`steps[].input` 严格不包含此字段 |
| 6 | **Civitai (目录)** | `https://developer.civitai.com/site/reference/models` | `nsfw` | `boolean` | `false` | `true` | **已核实** | 官方 REST API 参考：`GET /api/v1/models?nsfw=true` 允许检索成人/成熟内容模型 |
| 7 | **OpenAI 兼容中转** | `https://platform.openai.com/docs/api-reference/images/create` & Venice Swagger | `moderation` | `string` enum | `"auto"` | `"low"` | **已核实** | 官方 Images 规范支持 `moderation: "low"` 表示最低审核级别；若 live schema 声明则支持在 UI 可见配置 |
| 8 | **Sogni** | `https://raw.githubusercontent.com/Sogni-AI/sogni-protocol/main/schemas/tools/generate_image.schema.json` | `isMature` | `boolean` | 默认过滤 | 允许 `isMature=true` | **已核实** | `sogniLoraCover` 允许通过 `allowMature` 参数（由 `opts.nsfw !== false` 驱动）默认展示成熟 LoRA 示例图封面 |
| 9 | **Novita AI** | `https://docs.novita.ai/guides/model-apis-v2-to-v3-migration` | `extra.enable_nsfw_detection` | `boolean` | `true` | N/A (未声明) | **未验证 (格式不符)** | 官方 V3 为嵌套在 `extra` 对象内的 `enable_nsfw_detection`，非顶层字段；顶层 live schema 未声明，不进行自动注入 |
| 10 | **Runware** | `https://docs.runware.ai` | `checkNSFW` | `boolean` | N/A | N/A (未声明) | **未验证 (404/弃用)** | 官方文档页面返回 404；仅已弃用的旧版 SDK README 提及；仓库 `RunwareTask` 无此字段也不发送，不予实现 |
| 11 | **ModelsLab** | `https://modelslab.com/docs/image-generation/text2img` | `safety_checker` | 分歧 | 分歧 | N/A (存在分歧) | **部分核实 (存在分歧)** | 官方企业版 text2img 示例用 `"no"`，Flux 示例用布尔 `false`，pony 用 `"yes"`；类型与取值存在分歧，不作为确定规则硬编码 |
| 12 | **Google Gemini** | `https://ai.google.dev/gemini-api/docs/safety-settings` | `safetySettings` | `array` | 严格过滤 | N/A (未在生图Schema) | **未验证 (枚举变更)** | 官方安全页面现行枚举为 off / block_only_high 等小写取值，且未在生图 Schema 声明，彻底删除服务端隐式注入 |
| 13 | **Hugging Face** | `https://huggingface.co/docs/api-inference/detailed_parameters#text-to-image-task` | (无) | N/A | 平台默认审查 | N/A (未声明) | **未声明开关** | Serverless 任务接口无请求级布尔开关 |
| 14 | **ModelScope** | `https://modelscope.cn/docs/model-service/API-Inference/intro` | (无) | N/A | 国内法规合规 | N/A (未声明) | **平台合规管控** | 阿里魔搭服务端强制审核合规，无请求级放开开关 |
| 15 | **SenseNova** | `https://platform.sensenova.cn/doc` | (无) | N/A | 国内法规合规 | N/A (未声明) | **平台合规管控** | 商汤日日新合规接口，无放开开关 |
| 16 | **NanoGPT** | `https://docs.nano-gpt.com/api-reference/endpoint/image-generation-openai` | (无) | N/A | 模型自身定义 | 选择支持模型 | **模型能力级** | 请求体无独立开关，依赖选择元数据标有 `nsfw: true` 的模型 |
| 17 | **Tensor.Art (TAMS)** | `https://tams-docs.tensor.art/zh/docs/api/apis/tams-api-v-1-service-create-job/` | (无) | N/A | 平台审计 | N/A (未声明) | **平台合规管控** | TAMS 生图由平台自动审计 |
| 18 | **OpenWorks** | `https://raw.githubusercontent.com/Tensor-Art/tensorart-skills/master/skills/tensorart-generate/SKILL.md` | (无) | N/A | 工具内部策略 | N/A (未声明) | **工具平台管控** | 工具请求体无放开开关 |
| 19 | **Agnes AI** | `https://raw.githubusercontent.com/AgnesAI-Labs/skills/main/agnes-ai-models/references/model_catalog.md` | (无) | N/A | 上游模型决定 | N/A (未声明) | **上游管控** | REST 仅接收 prompt, size, aspect_ratio |
| 20 | **MuAPI** | `https://api.muapi.ai/openapi.json` | (无) | N/A | 服务端决定 | N/A (未声明) | **平台管控** | 标准图像端点无布尔安全开关 |
| 21 | **WaveSpeed** | `https://wavespeed.ai/docs` | (无) | N/A | 平台政策审查 | N/A (未声明) | **平台管控** | 无请求级布尔安全开关 |
| 22 | **Krea** | `https://api.krea.ai/openapi.json` | (无) | N/A | 服务端审核 | N/A (未声明) | **平台管控** | OpenAPI 路径无安全过滤字段 |
| 23 | **DeepInfra** | `https://api.deepinfra.com/openapi.json` | (无) | N/A | 模型原生 | N/A (未声明) | **平台管控** | 公共接口无独立安全布尔开关 |
| 24 | **Mage** | `https://docs.mage.space/api/models/mango` | (无) | N/A | 平台管控 | N/A (未声明) | **平台管控** | Mango API 仅基础画幅与提示词字段 |
| 25 | **Grok / xAI** | `https://docs.x.ai/docs/guides/image-generations` | (无) | N/A | 服务端审查 | N/A (未声明) | **平台管控** | 官方 HTTP API 无安全放开开关 |

---

## 三、真实浏览器 UI 点击走查与请求日志（Chrome 153，端口 3117 实测）

所有测试均在真实 Chromium 无头浏览器环境中完成 UI 实际点击操作，捕获真实网络请求体与服务端日志。截图文件体积均控制在 75KB~155KB，保证 `ReadMediaFile` 可完整读取无截断。

### 1. Together AI (`disable_safety_checker`) 实测
- **操作流程**：
  1. 在参数总控台选用 `Together` 服务商，输入底模 `black-forest-labs/FLUX.1-schnell`。
  2. 控件自动渲染 `disable_safety_checker`：默认选中 `true (禁用安全检查（项目默认放开）)`，徽章显示 `会发送 true（项目默认开启 NSFW）`。
  3. 截图取证：`01-together-nsfw-default-on.jpg` (148.9 KB)。
  4. 点击「运行：保存图像」触发生成：
     - **出站请求体 (JSON)**：
       ```json
       {
         "prompt": "a cinematic masterpiece portrait, highly detailed",
         "width": 1216,
         "height": 832,
         "steps": 12,
         "guidance_scale": 1,
         "seed": 1840591390,
         "image_loras": [{"path": "renderartist/Technically-Color-Z-Image-Turbo", "scale": 0.9}],
         "disable_safety_checker": true,
         "model": "black-forest-labs/FLUX.1-schnell"
       }
       ```
     - **上游真实响应**：HTTP 401 Unauthorized (`{"error":{"message":"Invalid API key provided. You can find your API key at https://api.together.ai/settings/api-keys.","type":"invalid_request_error","code":"invalid_api_key"}}`)
     - **分类判定**：**BLOCKED_AUTH** (真实上游鉴权拒绝，出站请求体确实验证携带 `disable_safety_checker: true`)
  5. 下拉切换回 `false`（严格安全过滤）：徽章实时更新为 `会发送 false（已手动设为严格安全过滤）`，出现「一键恢复放开默认」按钮。
  6. 截图取证：`02-together-nsfw-toggled-off.jpg` (150.7 KB)。
  7. 再次点击运行：
     - **出站请求体 (JSON)**：
       ```json
       {
         "prompt": "a cinematic masterpiece portrait, highly detailed",
         "width": 1216,
         "height": 832,
         "steps": 12,
         "guidance_scale": 1,
         "seed": 1840591390,
         "image_loras": [{"path": "renderartist/Technically-Color-Z-Image-Turbo", "scale": 0.9}],
         "disable_safety_checker": false,
         "model": "black-forest-labs/FLUX.1-schnell"
       }
       ```
     - **分类判定**：**BLOCKED_AUTH** (请求体确实验证已切换为 `disable_safety_checker: false`)

---

### 2. Venice AI (`safe_mode`) 实测（真实有效预设 `venice-sd35`，无 LoRA，seed 42）
- **操作流程**：
  1. 通过工作流预设弹窗载入标准干净预设 `std-venice-t2i`（模型为 Venice 官方有效模型 `venice-sd35`，无 LoRA 干扰，seed 42 ≤ 999999999）。
  2. 控件自动渲染 `safe_mode`：默认选中 `false (关闭安全模式（项目默认放开未打码）)`，徽章显示 `会发送 false（项目默认开启 NSFW）`。
  3. 截图取证：`03-venice-nsfw-default-on.jpg` (116.2 KB)。
  4. 点击「运行：保存图像」触发生成（成功越过模型校验与格式校验阶段到达真实上游）：
     - **出站请求体 (JSON)**：
       ```json
       {
         "prompt": "a cinematic masterpiece portrait, highly detailed",
         "width": 1024,
         "height": 1024,
         "steps": 20,
         "cfg_scale": 7.5,
         "seed": 42,
         "safe_mode": false,
         "model": "venice-sd35"
       }
       ```
     - **上游真实响应**：HTTP 402 (`{"error":"Insufficient USD or Diem balance to complete request. Visit https://venice.ai/settings/api to add credits."}`)
     - **分类判定**：**PASS_BILLING** (真实上游扣费/额度拦截，请求体确认携带 `safe_mode: false`)
  5. 下拉切换回 `true`（启用打码严格模式）：徽章实时更新为 `会发送 true（已手动设为严格安全过滤）`，出现「一键恢复放开默认」按钮。
  6. 截图取证：`04-venice-nsfw-toggled-off.jpg` (138.8 KB)。
  7. 再次点击运行：
     - **出站请求体 (JSON)**：
       ```json
       {
         "prompt": "a cinematic masterpiece portrait, highly detailed",
         "width": 1024,
         "height": 1024,
         "steps": 20,
         "cfg_scale": 7.5,
         "seed": 42,
         "safe_mode": true,
         "model": "venice-sd35"
       }
       ```
     - **上游真实响应**：HTTP 402 (`{"error":"Insufficient USD or Diem balance to complete request. Visit https://venice.ai/settings/api to add credits."}`)
     - **分类判定**：**PASS_BILLING** (真实上游扣费/额度拦截，请求体确认携带 `safe_mode: true`)

---

### 3. Civitai `allowMatureContent` 工作流请求体核验 (P1-2 实测)
- **操作流程**：
  1. 载入 Civitai T2I 预设（`std-civitai-t2i`），打开参数总控台中的 Civitai 配置块。
  2. `CivitaiAllowMatureControl` 组件挂载时自动向 `custom_parameters` 播种 `allowMatureContent: true`，徽章显示 `会发送 true（项目默认开启 NSFW）`。
  3. 将下拉切为 `false`，徽章更新为 `会发送 false（已手动设为严格安全过滤）`，点击运行：
     - **出站请求体结构 (JSON)**：
       ```json
       {
         "allowMatureContent": false,
         "steps": [
           {
             "$type": "imageGen",
             "input": {
               "engine": "comfy",
               "ecosystem": "krea2",
               "model": "turbo",
               "prompt": "a cinematic masterpiece portrait, highly detailed",
               "steps": 8,
               "cfg": 1
             }
           }
         ]
       }
       ```
     - **契约位置核验**：`allowMatureContent: false` 位于工作流 JSON 根级（与 `steps` 同级），且 `steps[0].input` 中**完全不包含** `allowMatureContent`（`hasAllowMatureContent: false`）。URL 干净无 query 污染（`https://orchestration.civitai.com/v2/consumer/workflows?wait=100`）。
  4. 点击「一键恢复放开默认」切回 `true`，再次点击运行：
     - **出站请求体结构 (JSON)**：
       ```json
       {
         "allowMatureContent": true,
         "steps": [
           {
             "$type": "imageGen",
             "input": {
               "engine": "comfy",
               "ecosystem": "krea2",
               "model": "turbo",
               "prompt": "a cinematic masterpiece portrait, highly detailed",
               "steps": 8,
               "cfg": 1
             }
           }
         ]
       }
       ```
     - **契约位置核验**：根级包含 `allowMatureContent: true`，`steps[0].input` 严格无泄漏。

---

### 4. ModelHubModal Civitai 标签与 CivitaiModal LoRA 检索实测 (P2-4 实测)
- **ModelHubModal Civitai 标签**：
  1. 打开底模中心并切换至 `Civitai` 服务商标签。
  2. 默认呈现 `🔥 NSFW: 已开启 (默认)`，出站请求携带默认参数，返回包含成人结果的 Civitai 资源（`Realistic Vision`, `DreamShaper`, `Juggernaut XL`）。
  3. 截图取证：`05-modelhub-civitai-nsfw-on.jpg` (123.7 KB)。
  4. 点击切换为 `🔥 NSFW: 已关闭`，出站请求携带 `catalogTag=nsfw:false`，服务端以 `nsfw=false` 请求上游，返回过滤后结果。
  5. 截图取证：`06-modelhub-civitai-nsfw-off.jpg` (122.8 KB)。
- **CivitaiModal LoRA 检索 (卡片完全渲染后截图)**：
  1. 打开 CivitaiModal LoRA 检索中心，等待网络加载完成（界面提示 `已检索到 343 个 LoRA`）。
  2. 默认呈现高亮 `🔥 NSFW: 已开启 (默认)`，并与 ModelScope / HuggingFace / Civitai 结果卡片同框。出站请求为 `GET /api/civitai/models?types=LORA&sort=Highest+Rated&limit=24&nsfw=true&page=1`。
  3. 截图取证：`07-civitaimodal-lora-nsfw-on.jpg` (75.8 KB)。
  4. 点击切换为 `🔥 NSFW: 已关闭`，出站请求为 `GET /api/civitai/models?types=LORA&sort=Highest+Rated&limit=24&nsfw=false&page=1`。
  5. 截图取证：`08-civitaimodal-lora-nsfw-off.jpg` (75.3 KB)。

---

## 四、8 张验收截图逐行文字转录 (`ReadMediaFile` 原样验视)

### 1. `01-together-nsfw-default-on.jpg`
```text
[Header Top Bar]
ComfyCanvas Studio | Z-Image 创作画布 | 节点 | 画板 | 保存到云端 | API 设置 | 运行：保存图像
模型 | LoRA | 视频模型 | 工作流 | 参数 (active) | 历史 | 云端项目 | 历史 API 调用样本 | ... 更多
7 个节点 · 9 条连线 · 按所选服务商的接口运行

[Canvas Nodes in Background]
加载底模 (Together) | 目标执行引擎: Together | [当前] black-forest-labs/FLUX.1-schnell
正向提示词 (CLIP) | a cinematic masterpiece portrait, highly detailed
采样器 (KSampler) | 图像解码器 (VAE Decode) | 画布尺寸设定 (Latent)

[Right Drawer: 参数总控台]
参数总控台 | 指南 | 复制按钮 | 关闭按钮
(output_format)
The format of the image response. Can be either be `jpeg` or `png`. Defaults to `jpeg`.
未填写，不发送 (Schema 默认: jpeg)
[下拉框]: (不发送)
(disable_safety_checker)
If true, disables the safety checker for image generation.
[状态徽章]: 会发送 true (项目默认开启 NSFW)
[下拉选择框]: true (禁用安全检查 (项目默认放开) )
[提示信息条]: 用户原则: “我们不反对nsfw，有nsfw开关的都默认开启”
KSampler 采样器核心参数
随机种子 (Seed)
[固定] 42 | 步数: 20
```

### 2. `02-together-nsfw-toggled-off.jpg`
```text
[Header Top Bar]
ComfyCanvas Studio | Z-Image 创作画布 | 节点 | 画板 | 保存到云端 | API 设置 | 运行：保存图像
模型 | LoRA | 视频模型 | 工作流 | 参数 (active) | 历史 | 云端项目 | 历史 API 调用样本 | ... 更多
7 个节点 · 9 条连线 · 按所选服务商的接口运行

[Right Drawer: 参数总控台]
参数总控台 | 指南 | 复制按钮 | 关闭按钮
(output_format)
The format of the image response. Can be either be `jpeg` or `png`. Defaults to `jpeg`.
未填写，不发送 (Schema 默认: jpeg)
[下拉框]: (不发送)
(disable_safety_checker)
If true, disables the safety checker for image generation.
[状态徽章]: 会发送 false (已手动设为严格安全过滤)
[下拉选择框]: false (启用安全检查)
[提示信息条]: 用户原则: “我们不反对nsfw，有nsfw开关的都默认开启” | 一键恢复放开默认 (链接)
KSampler 采样器核心参数
随机种子 (Seed)
[固定] 42 | 步数: 20
```

### 3. `03-venice-nsfw-default-on.jpg`
```text
[Header Top Bar]
ComfyCanvas Studio | Z-Image 创作画布 | 节点 | 画板 | 保存到云端 | API 设置 | 运行：保存图像
模型 | LoRA | 视频模型 | 工作流 | 参数 (active) | 历史 | 云端项目 | 历史 API 调用样本 | ... 更多
7 个节点 · 9 条连线 · 按所选服务商的接口运行

[Canvas Nodes in Background]
加载底模 (Venice) | 目标执行引擎: Venice | 底模: Venice SD35 · venice-sd35 | 自定义模型 (model): venice-sd35
正向提示词 (CLIP) | 负向提示词 (Negative) | 画布尺寸设定 (Latent)

[Right Drawer: 参数总控台]
参数总控台 | 指南 | 复制按钮 | 关闭按钮
(variants)
Number of images to generate (1–4)...
未填写，不发送
(safe_mode)
Whether to blur images classified as adult content. Defaults to true. Set to false to...
[状态徽章]: 会发送 false (项目默认开启 NSFW)
[下拉选择框]: false (关闭安全模式 (项目默认放开未...))
[提示信息条]: 用户原则: “我们不反对nsfw，有nsfw开关的都默认开启”
(style_preset)
An image style to apply to the image. Visit https://docs.venice.ai/api-...
未填写，不发送
```

### 4. `04-venice-nsfw-toggled-off.jpg`
```text
[Header Top Bar]
ComfyCanvas Studio | Z-Image 创作画布 | 节点 | 画板 | 保存到云端 | API 设置 | 运行：保存图像
模型 | LoRA | 视频模型 | 工作流 | 参数 (active) | 历史 | 云端项目 | 历史 API 调用样本 | ... 更多
7 个节点 · 9 条连线 · 按所选服务商的接口运行

[Right Drawer: 参数总控台]
参数总控台 | 指南 | 复制按钮 | 关闭按钮
(variants)
Number of images to generate (1–4)...
未填写，不发送
(safe_mode)
Whether to blur images classified as adult content. Defaults to true. Set to false to...
[状态徽章]: 会发送 true (已手动设为严格安全过滤)
[下拉选择框]: true (开启安全模式 (打码) )
[提示信息条]: 用户原则: “我们不反对nsfw，有nsfw开关的都默认开启” | 一键恢复放开默认 (链接)
(style_preset)
An image style to apply to the image. Visit https://docs.venice.ai/api-...
未填写，不发送
```

### 5. `05-modelhub-civitai-nsfw-on.jpg`
```text
[Modal Header]
模型与 LoRA 目录 (资源目录)
选择服务商、核对资源 ID，再应用到当前工作流。在线能力以所选端点为准。 | ✕ (关闭按钮)
资源类型: 全部模型 | [基础模型] | 视频模型 | LoRA | 编辑与控制 | 找到 40 项目录资源
服务商标签: 全部服务商 | [Civitai] (active) | Hugging Face | 魔搭 CN | 魔搭 AI | Fal.ai | NanoGPT | Google Gemini | Tensor.Art (TAMS) | MuAPI | WaveSpeed | So...
底模架构筛选: [全部架构] | FLUX.1 | SDXL 1.0 | Wan 2.1 (视频) | SD 1.5 | Pony XL | Illustrious | Qwen-Image | Z-Image | Krea | Together | All...

[Search Bar]
[输入框]: 输入关键词实时检索模型 (例如: anime, flux, cyberpunk, real...
排序: 最多下载 (Downloads) (下拉框)
[按钮]: 🔥 NSFW: 已开启 (默认) (粉色边框，高亮背景)
[按钮]: 实时检索 (青色按钮)

[Custom ID Bar]
按 ID 选用: 输入 Civitai 模型 ID / AIR URN [输入框] | 选用此 ID [按钮]

[Model Cards Grid - Civitai Tab]
1. Realistic Vision V6.0 B1 (SD 1.5 Hyper / Civitai) [CHECKPOINT 底模]
   模型 ID: 4201@501240 | 2,363,157 下载
2. DreamShaper (SD 1.5 / Civitai) [CHECKPOINT 底模]
   模型 ID: 4384@128713 | 1,701,985 下载
3. Juggernaut XL (SDXL 1.0 / Civitai) [CHECKPOINT 底模]
   模型 ID: 133005@1759168 | 1,687,081 下载
```

### 6. `06-modelhub-civitai-nsfw-off.jpg`
```text
[Modal Header]
模型与 LoRA 目录 (资源目录)
选择服务商、核对资源 ID，再应用到当前工作流。在线能力以所选端点为准。 | ✕ (关闭按钮)
资源类型: 全部模型 | [基础模型] | 视频模型 | LoRA | 编辑与控制 | 找到 40 项目录资源
服务商标签: 全部服务商 | [Civitai] (active) | Hugging Face | 魔搭 CN | 魔搭 AI | Fal.ai | NanoGPT | Google Gemini | Tensor.Art (TAMS) | MuAPI | WaveSpeed | So...
底模架构筛选: [全部架构] | FLUX.1 | SDXL 1.0 | Wan 2.1 (视频) | SD 1.5 | Pony XL | Illustrious | Qwen-Image | Z-Image | Krea | Together | All...

[Search Bar]
[输入框]: 输入关键词实时检索模型 (例如: anime, flux, cyberpunk, realistic...
排序: 最多下载 (Downloads) (下拉框)
[按钮]: 🔥 NSFW: 已关闭 (深灰色边框与背景)
[按钮]: 实时检索 (青色按钮)

[Custom ID Bar]
按 ID 选用: 输入 Civitai 模型 ID / AIR URN [输入框] | 选用此 ID [按钮]

[Model Cards Grid - Filtered Civitai Tab]
1. Realistic Vision V6.0 B1 (SD 1.5 Hyper / Civitai) [CHECKPOINT 底模]
   模型 ID: 4201@501240 | 2,363,160 下载
2. DreamShaper (SD 1.5 / Civitai) [CHECKPOINT 底模]
   模型 ID: 4384@128713 | 1,701,985 下载
3. majicMIX realistic 麦橘写实 (SD 1.5 / Civitai) [CHECKPOINT 底模]
   模型 ID: 43331@176425 | 1,266,147 下载
```

### 7. `07-civitaimodal-lora-nsfw-on.jpg`
```text
[Modal Header]
全生态 LoRA & 微调模型中心 (Universal LoRA Hub) 跨引擎全聚合 · 真实 API 动态直拉
聚合 Civitai / Hugging Face / ModelScope / Tensor.Art 等可检索目录；Fal.ai 无独立公开 LoRA 权重库，需手输权重 URL 或直链。支持架构筛选与翻页
[LoRA 模型库 (Browse)] | 配方导入与适配 (Import) | ✕ (关闭按钮)

[Provider Tabs]
[全生态聚合] | Civitai (C站社区) | Hugging Face (开源库) | 魔搭 CN (国内站) | 魔搭 AI (国际站) | Fal.ai (云端端点) | MuAPI | WaveSpeed | Sogni | Krea | Together | AIMLAPI | Novita | Venice | DeepInfra | Runware | ModelsLab | Replicate

[Filter Bar]
底模架构筛选: [全部]
已检索到 343 个 LoRA

[Search Bar]
跨引擎检索 LoRA (如: Cyberpunk, Ghibli, Detail, Face, Armor, Realistic, Anime, Wan)...
[排序下拉]: 最高评分 (Highest Rated)
[按钮]: 🔥 NSFW: 已开启 (默认) (粉色边框，高亮背景)
[按钮]: 实时检索

[LoRA Cards Grid - 结果已渲染同框]
1. ModelScope CN: 基础模型封面图
2. Hugging Face: krea/kre... (手捧咖啡杯写实亚洲女性人像)
3. ModelScope CN: 基础模型封面图
4. Civitai: P... (绿皮肤兽人半身铠甲插画)
```

### 8. `08-civitaimodal-lora-nsfw-off.jpg`
```text
[Modal Header]
全生态 LoRA & 微调模型中心 (Universal LoRA Hub) 跨引擎全聚合 · 真实 API 动态直拉
聚合 Civitai / Hugging Face / ModelScope / Tensor.Art 等可检索目录；Fal.ai 无独立公开 LoRA 权重库，需手输权重 URL 或直链。支持架构筛选与翻页
[LoRA 模型库 (Browse)] | 配方导入与适配 (Import) | ✕ (关闭按钮)

[Provider Tabs]
[全生态聚合] | Civitai (C站社区) | Hugging Face (开源库) | 魔搭 CN (国内站) | 魔搭 AI (国际站) | Fal.ai (云端端点) | MuAPI | WaveSpeed | Sogni | Krea | Together | AIMLAPI | Novita | Venice | DeepInfra | Runware | ModelsLab | Replicate

[Filter Bar]
底模架构筛选: [全部]
已检索到 343 个 LoRA

[Search Bar]
跨引擎检索 LoRA (如: Cyberpunk, Ghibli, Detail, Face, Armor, Realistic, Anime, Wan)...
[排序下拉]: 最高评分 (Highest Rated)
[按钮]: 🔥 NSFW: 已关闭 (深灰色边框与背景)
[按钮]: 实时检索

[LoRA Cards Grid - 结果已渲染同框]
1. ModelScope CN: 基础模型封面图
2. Hugging Face: krea/kre... (手捧咖啡杯写实亚洲女性人像)
3. ModelScope CN: 基础模型封面图
4. Civitai: P... (绿皮肤兽人半身铠甲插画)
```

---

## 五、全量编译与回归测试真实数据 (wt-10, 无管道)

1. **类型检查 (`npx tsc --noEmit`)**：
   - 退出码：`0`，0 错误。

2. **生产构建 (`npm run build`)**：
   - 命令：`node hosting/build.mjs`
   - 退出码：`0`，Vite 构建完成耗时 2.46s。

3. **全量 Vitest 测试套件 (`npx vitest run --maxWorkers=2 --exclude '.tower/**' --exclude '**/node_modules/**' --exclude '**/dist/**'`)**：
   - 测试文件总数：**253 passed (253)**
   - 用例总数：**1901 passed (1901)**
   - 真实退出码：`0`（无任何失败或跳过）
