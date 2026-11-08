# M46 真实浏览器点击验收与全量截图取证报告 (UIACCEPT46 Real Browser Click-Through Acceptance)
> ⚠️ **M105 证据纠正与真实性校准说明 (2026-11-08)**:
> 本文档记录 M46 原始浏览器点击执行情况，现依据 M99 前端与证据只读审计报告（`docs/evidence/2026-11-08/` 审计）、Tower 主控实查结论及 M100 证据修正全面校准：
> 1. 逐条更正不可由截图证明的断言（05 图实为 CivitaiModal 0 结果加载，非 ModelHub 全部服务商或 AIVideo 已挂载；12 图仅证明按钮存在，非底模已应用；13 图出站仅 3 字段，无满参数/LoRA 证据）；
> 2. 纠正将未执行 UI 测试的视频路由推断为 `NOT_SENT` 的错误逻辑（`EngineRegistry` 真实分派 `SchemaProviderDriver`，不受旧 `VIDEO_PROVIDERS` 限制，无本轮点击证据应标为「未验证」；TAMS 数字模型与 OpenWorks 视频路径已存在，仍须 UI 产物验收）；
> 3. 依据 M100 证据纠正事实更新 OpenWorks 物理图像产物存在与 LoRA 采用未验证边界；明确欠费 402/403 仅证明请求出站与错误透传，不是最终 UI 产物验收。

- **执行日期**: 2026-11-08
- **测试环境**: Headless Chromium (Playwright Chromium, `--no-proxy-server`, 视口 `1920×1080`)
- **本地服务**: `http://127.0.0.1:4546` (`PORT=4546 npx tsx server.ts`)
- **执行分支**: `feat/uiaccept46-real-browser-click-through-ac` (基于已合并 M77, M81, M82, M83 的主分支 `dadb08f`)
- **执行 Agent**: `worker-m46-ui-operator` (M105 文档纠正: `worker-m105-evidence-docs-flash`)

---

## 一、搜索记录 (Mandatory 3-MCP Web Search Cross-Verification)

根据项目最高工程准则 `AGENTS.md`，涉及外部 API 规范与关键事实时，必须在同一轮并行调用至少 3 个 WebSearch MCP 工具进行三方交叉比对，并通过官方一手文档抓取原文核实。

### 1. 并行调用搜索工具与查询词
- **MCP 工具 1**: `mcp__tavily__tavily_search`
- **MCP 工具 2**: `mcp__9router__search` (brave)
- **MCP 工具 3**: `mcp__agy-search__search_web` (Google Grounding)
- **查询主题 1 (Runware API & Civitai AIR)**:
  - 查询词: `Runware API AIR URN format lora civitai`
  - Tavily 结果: `https://developer.civitai.com/site/guide/air` 与 `https://runware.ai/docs/learn/loras`，指明 Civitai 规范 AIR 格式为 `urn:air:{ecosystem}:{type}:{source}:{id}[@{version}]`，Runware API 原生支持该 URN 作为 LoRA 标识符。
  - 9Router 结果: 确认 Runware SDK 支持从 Civitai 引用 LoRA，格式为 `urn:air:...` 或 `civitai:modelId@versionId`。
  - Agy-Search 结果: 交叉证实 Runware 的 `imageInference` 接口接受 `lora: [{ model: "urn:air:...", weight: 0.8 }]`。
- **查询主题 2 (Sogni Protocol & Personal LoRA)**:
  - 查询词: `Sogni protocol import source URL project ID or generation ID`
  - Tavily 结果: `https://docs.sogni.ai/api-reference/` 与 `https://github.com/Sogni-AI/sogni-client`，确认 Sogni personal LoRAs 通过 `POST /v1/loras/personal` 异步导入，生成时使用的是确认 ready 后的 `personal-<uuid>` 或官方目录 ID，而原始 Civitai/HF 下载 URL 仅作为导入来源元数据。
  - 9Router 结果: 确认 Sogni Protocol 工具定义与项目执行结构。
  - Agy-Search 结果: 确认 Sogni 上传与任务追踪机制，区分 source URL 与内部 generation/job ID。
- **查询主题 3 (Google Gemini 原生图像生成)**:
  - 查询词: `Google Gemini API gemini-3.1-flash-image or imagen-3.0-generate-002 image generation`
  - Tavily 结果: `https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-image`，说明 Imagen 独立模型已下线，当前由原生多模态 `gemini-3.1-flash-image` (Nano Banana 2) 提供图像生成。
  - 9Router 结果: 确认 `gemini-3.1-flash-image` 支持原生文本生图、1K/2K/4K 分辨率、Search Grounding 与 Thinking。
  - Agy-Search 结果: 交叉证实 Google 官方 API 中不再走独立 Imagen 接口，而是统一通过 `client.models.generateContent` 透传提示词生成图像。
- **查询主题 4 (Tensor.Art OpenWorks photoreal_studio_z_image 工具契约与 LoRA 输入)**:
  - 查询词: `Tensor.Art OpenWorks photoreal_studio_z_image tool schema inputs lora`
  - Tavily 结果: `https://medium.com/@ballinlab2023/tensor-art-workspace-precise-lora-training-techniques-69dfe10b1496`，检索到 Tensor.Art 工具与 LoRA 教程。
  - 9Router 结果: 检索到官方仓库与模型文档 `PhotoReal | KREA 2 - Z Image | Tensor.Art`。
  - Agy-Search 结果: 查明 OpenWorks OpenAPI 工具调用采用结构化位置 inputs；官方工具 `photoreal_studio_z_image` 在 OpenAPI 工具目录中仅定义 4 个位置输入（`prompt`, `image width`, `image height`, `result image count`），扩展字段与 LoRA 是否被底层采用无契约保证。
- **查询主题 5 (Novita AI 视频生成端点与路由契约)**:
  - 查询词: `Novita AI video generation api docs endpoints`
  - Tavily 结果: `https://docs.novita.ai/api-reference/api-reference-overview` 与 `https://github.com/api-evangelist/novita-ai`，确认 Novita AI 提供统一异步视频任务生成接口。
  - 9Router 结果: 确认 `https://docs.novita.ai/api-reference/api-reference-overview` 与 Kling / Wan / MiniMax 异步视频路由。
  - Agy-Search 结果: 交叉证实 Novita AI 视频生成端点为异步任务创建与状态轮询，由 OpenAPI / Model API 提供支持。

### 2. 实际抓取一手官方文档原文 (FetchURL & 9Router Fetch)
- **URL 1**: `https://developer.civitai.com/site/guide/air` (通过 `FetchURL` 成功抓取)
  - 官方原文: *An AI Resource Identifier (AIR) is the canonical URN-style string Civitai uses to reference any AI resource... Format: `urn:air:{ecosystem}:{type}:{source}:{id}[@{version}][+{fileId}][.{format}]`... The site-generated air field already handles this mapping — prefer it over hand-construction.*
- **URL 2**: `https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-image` (通过 `mcp__9router__fetch` 成功抓取)
  - 官方原文: *Nano Banana 2 (gemini-3.1-flash-image) provides high-quality image generation and conversational editing... Supported data types: Inputs Text, Image, Video; Output Image and Text... Image generation Supported... Stable: `gemini-3.1-flash-image`.*
- **URL 3**: `https://raw.githubusercontent.com/Tensor-Art/tensorart-skills/master/skills/tensorart-generate/SKILL.md` (通过 `FetchURL` 成功抓取)
  - 官方原文: *## Step 4: Create a Generation Task... python3 scripts/create_task.py "toolName" '[{"type":"STRING","value":"your prompt"}, ...]'... The second argument is a JSON array string. Each element corresponds to the input at the same position in the tool definition: type: one of STRING, INTEGER, NUMBER, BOOLEAN, ARRAY, OBJECT, FILE... All inputs are required: Every input defined by the tool must have a meaningful value... ## Step 5: Poll Task Status... Task status reference: WAITING / QUEUE_WAIT / PARSING / START / PROCESSING: In progress; FINISH: Completed; EXCEPTION: Failed; CANCELED: Canceled.*
- **URL 4**: `https://docs.novita.ai/api-reference/api-reference-overview` (通过 `FetchURL` 成功抓取)
  - 官方原文: *Welcome to Novita AI API Reference... Multimodal AI APIs for content generation and editing. Core Endpoints: Task Result (Get async task results), Image Generation, Image Editing, Video Generation... Authentication: All API requests require authentication using Bearer tokens.*

---

## 二、真实 UI 点击运行实测 (Real UI Run Acceptance: DeepInfra 402 PASS_BILLING)

在真实浏览器中载入并运行预设，捕获界面呈现的真实出站实参、上游 HTTP 状态码与原始响应体。

### 1. 请求实参 (Actual Request Parameters from UI)
- **目标服务商 (Target Provider)**: `deepinfra`
- **执行端点 (Route)**: `POST /api/schema-provider/deepinfra/submit` -> `https://api.deepinfra.com/v1/openai/images/generations`
- **底模 (Checkpoint)**: `black-forest-labs/FLUX-2-klein-9b`
- **正向提示词 (Positive Prompt)**: `A stunning cinematic cyberpunk portrait of a female warrior under neon rain, octane render, intricate details, 8k resolution, photorealistic masterpiece` (完整主体+风格+构图，无任何占位词)
- **画幅尺寸 (Dimensions)**: `1024 × 1024` (Empty Latent 设定)
- **实测参数边界说明 (M105 纠正)**: 实际出站 payload (`actualRequest`) 仅包含 `endpoint`、`prompt`、`model`、`size` 三项参数。KSampler 的 `seed` 与 `steps` 在实际出站 payload 中为空，未挂载 LoRA 节点，无负向提示词；非全参数或 LoRA 运行。
- **实际上游发出的请求体 (actualRequest from ExecutionLog)**:
  ```json
  {
    "endpoint": "https://api.deepinfra.com/v1/openai/images/generations",
    "parameters": {
      "prompt": "A stunning cinematic cyberpunk portrait of a female warrior under neon rain, octane render, intricate details, 8k resolution, photorealistic masterpiece",
      "model": "black-forest-labs/FLUX-2-klein-9b",
      "size": "1024x1024"
    }
  }
  ```

### 2. 上游响应 (Verbatim Upstream HTTP Response)
- **HTTP 状态码**: `402 Payment Required`
- **上游原始响应体原文**:
  ```json
  {"detail":{"error":"You need positive balance to do inference. Please add balance manually or setup top-up"}}
  ```
- **界面可见呈现验证**:
  1. 顶部状态栏: 显式展示 `【deepinfra】HTTP 402 Payment Required: {"detail":{"error":"You need positive balance to do inference. Please add balance manually or setup top-up"}}`；
  2. 底部浮动 Toast: 显式呈现 `【deepinfra】HTTP 402 Payment Required` 与原始响应体；
  3. KSampler 采样器节点: 内部渲染红色告警容器，同步完整展示 HTTP 402 及上游原文；
  4. ExecutionLog 抽屉: 完整记录该次出站 trace，展开可见 `actuallyRequest` 与完整调用链路；
  5. 判定结论: **`PASS_BILLING`**（三字段出站请求抵达上游 DeepInfra 接口，上游明确因余额不足拒答 HTTP 402 并原样透传，无本地假拦截，无黑盒 fallback；但此结论仅证实三字段请求出站与错误透传，**未验证**满参数与 LoRA 采用，且未产生界面可见最终图像产物，绝不等于最终 UI 产物验收）。

---

## 三、产物清单与截图证据 (Visible UI Artifacts & Checksums)

所有 14 张高保真截图保存在 `docs/evidence/2026-11-08/` 目录下，经实机重新定位核取并经检验，每张截图的实际像素内容与下表描述 100% 对应：

| 序号 | 截图文件名 | 磁盘物理路径 | 文件大小 | SHA256 哈希 | 核心功能与验收验证要点（已落实 R1 审核修复） |
| :---: | :--- | :--- | :---: | :--- | :--- |
| **01** | `01-civitai-import-runware-air.png` | `docs/evidence/2026-11-08/01-civitai-import-runware-air.png` | 277,183 B | `db362f748324f9aa80490b036ce3c41538dfdc30632fb612b78885125d53ab1d` | **M77 验证 (M105 边界修正)**：Civitai 导入弹窗切换到 Runware，未选定具体目标模型时呈现「未选择目标模型；请在上方选用目标模型以加载其实时 Schema 规范」，LoRA 状态标为「未核实」，保留来源架构 Krea 2 Turbo；此图仅证明弹窗在未选模型时的提示展示，由于目标模型未选且 LoRA 未核实，不能作为 Runware 端到端 AIR 映射通过证据。 |
| **02** | `02-civitai-import-sogni-source-vs-id.png` | `docs/evidence/2026-11-08/02-civitai-import-sogni-source-vs-id.png` | 310,871 B | `11cc85abfad90568f408bab057bf6353c82f923eb0b1ce7d26586a54bab40eae` | **M77 验证**：Civitai 导入弹窗切换到 Sogni，明确区分 Civitai/HF 下载 URL 是 personal-LoRA 导入来源，生成时必须使用 ready personal ID 或目录 ID。 |
| **03** | `03-canvas-add-node-menu-aivideonode.png` | `docs/evidence/2026-11-08/03-canvas-add-node-menu-aivideonode.png` | 311,437 B | `6674eed38fc1596f839f615685eb8e001852993b75d40f0be9aa41e08e1f3bda` | **R1 修复**：画布右键添加节点菜单已向下滚动，中央清晰完整呈现 `AI 视频（显式 Provider/Model）` (`AIVideoNode`)。 |
| **04** | `04-aivideonode-targetprovider-dropdown.png` | `docs/evidence/2026-11-08/04-aivideonode-targetprovider-dropdown.png` | 348,929 B | `63e6779860117eef4ffe09f14a4090d0a3d15d99708451c4131ed1257843a593` | **M81 & M82 验证**：画布 `AIVideoNode` 节点展开 `targetProvider` 下拉，完整包含 `nanogpt`、`novita`、`tensorart` 选项。 |
| **05** | `05-aivideonode-lorahub-mount-allproviders.png` | `docs/evidence/2026-11-08/05-aivideonode-lorahub-mount-allproviders.png` | 179,487 B | `3bad059b101f3a2d9a87e103c3ec427638be278dfa5a79025c5501a30ca36ca4` | **M105 证据纠正**：截图实际展示的是 CivitaiModal（窗口标题「全生态 LoRA & 微调模型中心」，激活 tab 为「全生态聚合」，对应 `CivitaiModal.tsx:854,913`），处于 0 条结果加载中状态；而非 `ModelHubModal.tsx` 的「全部服务商」页签，且未见选用/挂载后与 AIVideoNode 连线的状态；不能证明 ModelHub all-tab 功能或 AIVideo 已挂载 LoRA。 |
| **06** | `06-providermatrix-gemini-native.png` | `docs/evidence/2026-11-08/06-providermatrix-gemini-native.png` | 337,773 B | `79a0cc2a71c8345d680831e92ef840dc982bf9c18acd48fac21c46bdf29addd2` | **M83 验证**：供应商全景矩阵第 1 标签页，完整呈现 `Google Gemini 原生图像`、`gemini-3.1-flash-image`、Imagen 已下线说明与提示词原样透传规范。 |
| **07** | `07-civitai-lora-preset-loraloader.png` | `docs/evidence/2026-11-08/07-civitai-lora-preset-loraloader.png` | 312,651 B | `eb4d7191b180cee970a6b6f48ad1bf464a71d579ca1a8b89c27ac536ddf1e45a` | **R1 修复**：真正载入 Civitai LoRA 预设（`Civitai · 花饰人像`），画布项目名为 `Civitai · 花饰人像`，呈现完好连线的 Civitai 底模节点（`urn:air:krea2:diffusionmodel:civitai:2732656@3072332`）与 Civitai LoRALoader 节点（`urn:air:krea2:lora:civitai:929497@3077110`，权重 0.85），与 08 号 HF 图彻底独立。 |
| **08** | `08-huggingface-node-no-routing-dropdown.png` | `docs/evidence/2026-11-08/08-huggingface-node-no-routing-dropdown.png` | 294,264 B | `2b5ec8acbabd104987f6bcc52e3782826be0c996c77468225420d4aee03d16ba` | Hugging Face CheckpointLoaderSimple 节点清晰可见，已彻底剥离内部 `hf_provider` 路由下拉框。 |
| **09** | `09-lorahub-autopair-tensorart-crossbar.png` | `docs/evidence/2026-11-08/09-lorahub-autopair-tensorart-crossbar.png` | 280,719 B | `c24b05b873722b3d24552bb53a21986a707174aa9eb4bf5ef36f6a3040eac98e` | **R1 修复**：模型与 LoRA 目录常驻跨服务商横栏滚动到位，同时完整呈现 `Tensor.Art (TAMS)` 与 `Tensor.Art OpenWorks`；各卡片呈现 `选用 LoRA 并自动配对底模` 按钮，由于上游目录未提供明确架构元数据，实事求是标注 `架构未知，无法判断兼容`，不虚报兼容。 |
| **10** | `10-executionlog-drawer-open.png` | `docs/evidence/2026-11-08/10-executionlog-drawer-open.png` | 358,220 B | `7ea7021aaa898e1856d746ae136384785f515c8a95c8ae28c60bef36431b21a6` | **M105 边界修正**：在真实运行出站后展开底部 `ExecutionLog` 抽屉，展示真实出站生成记录行（`POST /api/schema-provider/deepinfra/submit · HTTP 402 · 失败` 及 `actualRequest`）；出站参数实际仅含 prompt、model、size 三项。 |
| **11** | `11-api-parameter-editor-json.png` | `docs/evidence/2026-11-08/11-api-parameter-editor-json.png` | 352,303 B | `759ccf9f095070e57e73017d66895ec75d7f789d3571207ba43d71110ad1ed9b` | 参数总控台内的 `ApiParameterEditor` 自由 JSON 文本编辑框，支持自定义键值覆盖与官方 Schema 一键读取。 |
| **12** | `12-lora-autopair-checkpoint-button.png` | `docs/evidence/2026-11-08/12-lora-autopair-checkpoint-button.png` | 274,130 B | `a649db2e1c9c40ac82a12fbee3a9e13d89e54abd37071c243064b08ae2a37f0d` | **M105 边界修正**：LoRALoader 节点上明确呈现已验证底模配对按钮（`应用已验证底模 black-forest-labs/FLUX.1-dev`）；此图仅证实按钮在节点 UI 渲染存在，按钮点击后的底模实际应用与工作流参数变更未在截图中体现（未验证）。 |
| **13** | `13-real-run-actualrequest-upstream-response.png` | `docs/evidence/2026-11-08/13-real-run-actualrequest-upstream-response.png` | 343,453 B | `9b0da7b91bb37df51213993c719cc5fa9b7537917aa8df6fdf0f2f20f92ebab1` | **核心运行验收 (M105 边界修正)**：真实点击运行按钮出站抵达 DeepInfra，界面原样无损展示 HTTP 402 及 `{"detail":{"error":"You need positive balance to do inference. Please add balance manually or setup top-up"}}` (`PASS_BILLING`)。图 13 本身未展开 actualRequest（出站参数见 10/14），实际出站仅含 prompt/model/size 三字段，无满参数（steps/seed 为空）与 LoRA 证据，仅证明三字段请求与错误透传，不构成全量或产物最终验收。 |
| **14** | `14-real-run-executionlog-trace.png` | `docs/evidence/2026-11-08/14-real-run-executionlog-trace.png` | 358,732 B | `38891faddd6f7c1bfa355fe40d1166735318444bb51cadfcc862d0499f2c3a4f` | **执行追踪证据 (M105 边界修正)**：展开 ExecutionLog 真实追踪详情，展示实际请求端点、Key 轮换序号、HTTP 402 原始响应体与包含 `actualRequest`（仅含 prompt/model/size 三项）的完整调用链路。 |

---

## 四、命令实测与历史文档核查 (Commands Verification & Historical Fixes)

### 1. 全量工程命令执行与输出记录
- **`npm run build`**: Exit code 0。
  - 输出: `dist/client/index.html 1.47 kB`, `dist/client/assets/index-CBFryEqZ.css 172.69 kB`, `dist/client/assets/index-C8kgb8lK.js 1,300.80 kB`, `Canvas Sites Worker built: original provider routes + durable storage`。
- **`npx tsc --noEmit`**: Exit code 1。
  - 实测输出: `src/utils/inspectorParameters.test.ts: error TS2339: Property 'civitaiVersion' does not exist on type 'ComfyParameters'`.
  - 基准核实: 在主分支基线 `dadb08f` 上执行同样命令，报出完全相同的错误。根因系 M82 在新增 Civitai 视频参数测试时，未在 `src/types/graph.ts` 的 `ComfyParameters` 接口中声明 `civitaiVersion`、`civitaiBackend`、`civitaiOperation`。已按 Tower 协议向主控提报 Finding。
- **`npx vitest run`**: Exit code 1 (部分用例因引用已退役预设失败)。
  - 实测输出: 绝大多数测试通过（如 `videoGenerateRoute.test.ts`, `CivitaiModalImportLiveSchema.test.tsx`, `verbatimErrors.test.tsx`, `modelSelection.test.tsx` 等），18 个历史用例因 `WORKFLOW_PRESETS.find(x => x.id === 'std-novita-i2v')` 返回 undefined 导致 `TypeError: Cannot read properties of undefined (reading 'nodes')`。已向主控提报 Finding。

### 2. 历史文档虚假与缺失声明核实及修正
- **WaveSpeed 图像声明降级**: `README.md` 原声称 WaveSpeed 图像 `PASS_GENERATION` 并引用 `hist_1792224305224_meynb`。经 `ls data/` 实测只有 `.gitkeep`，`grep -rn "hist_1792224305224_meynb" data/` 结果为 0。已严格按产物诚实原则降级为 `PASS_BILLING`。
- **Tensor.Art (OpenWorks) 图像产物与未证实 LoRA 采用边界 (M105 纠正)**: 早期历史引用 `hist_1793693239642_fo6ux` 无磁盘产物。随后 M96 / M100 已成功生成并持久化真实 1024×1024 PNG 物理产物（`docs/evidence/real-product-2026-11-08/artifact-openworks-bdf77680.png`，1,392,518 字节，SHA256: `0837cd142c3d40cf73374ab17a53d785b360c02705e7e3490c82233a98ef7970`）；但依据 M100 证据纠正结论，官方工具目录（`photoreal_studio_z_image`）仅声明 4 个位置输入（`prompt`, `width`, `height`, `count`），扩展字段与 LoRA 是否被上游底层真正采用未获官方契约证实（未验证），且历史截图跨两次不同运行混杂（06/07 55 秒 vs 07b/c/d 74 秒），缺少同一 taskId 的 rawResponse 展开截图，故完整最终验收未通过。
- **视频路由可达性与能力结论纠正 (M105 纠正)**: 原文档根据 `src/server/routes/videoGenerateRoute.ts:130` 的旧 `VIDEO_PROVIDERS` 名单推断 Novita / AIMLAPI / Venice / Together 视频不可达并标为 `NOT_SENT`，该推断不符合真实代码架构。源码 `src/engines/EngineRegistry.ts:105-117` 统一调度生视频时，将显式 `targetProvider` 分派给对应 driver；`novita`、`aimlapi`、`venice`、`together` 均已注册为 `SchemaProviderDriver` 且声明具有 `text2video` / `img2video` 能力（走 `/api/schema-provider/{provider}/submit` 动态 Schema 路由），不受旧视频路由白名单限制。本轮因未执行上述供应商视频模型的 UI 点击实测，实事求是标注为「**未验证 (Unverified)**」，不能断言整个路由无法从 UI 触达。此外，Tensor.Art (TAMS) 纯数字模型 ID 在 `videoGenerateRoute.ts:159` 实际已接通 `POST /v1/jobs` 的 `VIDEO_DIFFUSION` 路由，OpenWorks 工具亦有视频调用路径（`videoGenerateRoute.ts:366-500+`），并非返回「尚未接入」本地拒绝；但生成产物仍须真实 UI 点击验收。
- **Hugging Face 文档声明校正 (R1 修复)**: 删除无截图证据的「实测 HTTP 400 Model not supported」声明，恢复经过往实测截图 `final/06-hf-zimage-run.png` 验证的 `402 Purchase pre-paid credits` (`PASS_BILLING`) 声明。
- **清理伪产物占位图**: `public/seed-ok-preview.png` 实测为 157 字节占位图（MD5 `8b8fe29e3d9e47c43ce8c42babeb6595`），已彻底从 git 追踪中删除 (`git rm`)。
- **历史截图跳号说明**: `docs/evidence/2026-11-05/final/` 的 41 张截图缺 31/36/37/38/39/41 编号，已在 `final.md` 索引开头明确补充跳号原由（历史分组编号而非顺序计数，全量 41 文件均唯一且有效）。
- **目录重复去重**: `docs/evidence/2026-11-07/` 仅保留指针说明文件 `acceptance.md` 指向 `docs/evidence/2026-11-08/`，彻底删除 14 张重复的 PNG 文件，避免仓库体积膨胀。
