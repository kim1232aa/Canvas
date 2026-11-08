# M46 真实浏览器点击验收与全量截图取证报告 (UIACCEPT46 Real Browser Click-Through Acceptance)

- **执行日期**: 2026-11-08
- **测试环境**: Headless Chromium (Playwright Chromium, `--no-proxy-server`, 视口 `1920×1080`)
- **本地服务**: `http://127.0.0.1:4546` (`PORT=4546 npx tsx server.ts`)
- **执行分支**: `feat/uiaccept46-real-browser-click-through-ac` (基于已合并 M77, M81, M82, M83 的主分支 `dadb08f`)
- **执行 Agent**: `worker-m46-ui-operator`

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

### 2. 实际抓取一手官方文档原文 (FetchURL & 9Router Fetch)
- **URL 1**: `https://developer.civitai.com/site/guide/air` (通过 `FetchURL` 成功抓取)
  - 官方原文: *An AI Resource Identifier (AIR) is the canonical URN-style string Civitai uses to reference any AI resource... Format: `urn:air:{ecosystem}:{type}:{source}:{id}[@{version}][+{fileId}][.{format}]`... The site-generated air field already handles this mapping — prefer it over hand-construction.*
- **URL 2**: `https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-image` (通过 `mcp__9router__fetch` 成功抓取)
  - 官方原文: *Nano Banana 2 (gemini-3.1-flash-image) provides high-quality image generation and conversational editing... Supported data types: Inputs Text, Image, Video; Output Image and Text... Image generation Supported... Stable: `gemini-3.1-flash-image`.*

---

## 二、真实 UI 点击运行实测 (Real UI Run Acceptance: DeepInfra 402 PASS_BILLING)

在真实浏览器中载入并运行预设，捕获界面呈现的真实出站实参、上游 HTTP 状态码与原始响应体。

### 1. 请求实参 (Actual Request Parameters from UI)
- **目标服务商 (Target Provider)**: `deepinfra`
- **执行端点 (Route)**: `POST /api/schema-provider/deepinfra/submit` -> `https://api.deepinfra.com/v1/openai/images/generations`
- **底模 (Checkpoint)**: `black-forest-labs/FLUX-2-klein-9b`
- **正向提示词 (Positive Prompt)**: `A stunning cinematic cyberpunk portrait of a female warrior under neon rain, octane render, intricate details, 8k resolution, photorealistic masterpiece` (完整主体+风格+构图，无任何占位词)
- **画幅尺寸 (Dimensions)**: `1024 × 1024` (Empty Latent 设定)
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
  5. 判定结论: **`PASS_BILLING`**（全参数真实抵达上游 DeepInfra 接口，上游明确因余额不足拒答并原样透传，无本地假拦截，无黑盒 fallback）。

---

## 三、产物清单与截图证据 (Visible UI Artifacts & Checksums)

所有 14 张高保真截图均保存在 `docs/evidence/2026-11-08/` 目录下，经实机渲染并经检验，哈希互不重复。

| 序号 | 截图文件名 | 磁盘物理路径 | 文件大小 | SHA256 哈希 | 核心功能与验收验证要点 |
| :---: | :--- | :--- | :---: | :--- | :--- |
| **01** | `01-civitai-import-runware-air.png` | `docs/evidence/2026-11-08/01-civitai-import-runware-air.png` | 276,115 B | `95099da1d25441f98f4d41ab5ebb626c5d6cc84beb38bcec79712192c19f4ffd` | **M77 验证**：Civitai 导入弹窗切换到 Runware，明确显示目标平台需要从目录选择真实模型，保留来源架构，LoRA 按 Civitai AIR 规范映射解析。 |
| **02** | `02-civitai-import-sogni-source-vs-id.png` | `docs/evidence/2026-11-08/02-civitai-import-sogni-source-vs-id.png` | 310,871 B | `11cc85abfad90568f408bab057bf6353c82f923eb0b1ce7d26586a54bab40eae` | **M77 验证**：Civitai 导入弹窗切换到 Sogni，明确区分 Civitai/HF 下载 URL 是 personal-LoRA 导入来源，生成时必须使用 ready personal ID 或目录 ID。 |
| **03** | `03-canvas-add-node-menu-aivideonode.png` | `docs/evidence/2026-11-08/03-canvas-add-node-menu-aivideonode.png` | 304,842 B | `e26befe393cd7298d55bad71421d9465f2c12c885b35b02f3506c0525544d247` | 画布右键菜单完整包含 `AI 视频（显式 Provider/Model）` (`AIVideoNode`)。 |
| **04** | `04-aivideonode-targetprovider-dropdown.png` | `docs/evidence/2026-11-08/04-aivideonode-targetprovider-dropdown.png` | 348,929 B | `63e6779860117eef4ffe09f14a4090d0a3d15d99708451c4131ed1257843a593` | **M81 & M82 验证**：画布 `AIVideoNode` 节点展开 `targetProvider` 下拉，完整包含 `nanogpt`、`novita`、`tensorart` 选项。 |
| **05** | `05-aivideonode-lorahub-mount-allproviders.png` | `docs/evidence/2026-11-08/05-aivideonode-lorahub-mount-allproviders.png` | 179,487 B | `3bad059b101f3a2d9a87e103c3ec427638be278dfa5a79025c5501a30ca36ca4` | 模型中心打开 LoRA 库挂载至 `AIVideoNode`，验证 `'全部服务商'` 页签处于激活可点击状态。 |
| **06** | `06-providermatrix-gemini-native.png` | `docs/evidence/2026-11-08/06-providermatrix-gemini-native.png` | 337,773 B | `79a0cc2a71c8345d680831e92ef840dc982bf9c18acd48fac21c46bdf29addd2` | **M83 验证**：供应商全景矩阵第 1 标签页，完整呈现 `Google Gemini 原生图像`、`gemini-3.1-flash-image`、Imagen 已下线说明与提示词原样透传规范。 |
| **07** | `07-civitai-lora-preset-loraloader.png` | `docs/evidence/2026-11-08/07-civitai-lora-preset-loraloader.png` | 294,261 B | `b50e8ccaf1345d66d82271f546f0a899a372c00e620a27982d81f86402a96d73` | Civitai LoRA 预设载入画布，呈现完好连线的 LoRALoader 节点与拓扑结构。 |
| **08** | `08-huggingface-node-no-routing-dropdown.png` | `docs/evidence/2026-11-08/08-huggingface-node-no-routing-dropdown.png` | 294,264 B | `2b5ec8acbabd104987f6bcc52e3782826be0c996c77468225420d4aee03d16ba` | Hugging Face CheckpointLoaderSimple 节点清晰可见，已彻底剥离内部 `hf_provider` 路由下拉框。 |
| **09** | `09-lorahub-autopair-tensorart-crossbar.png` | `docs/evidence/2026-11-08/09-lorahub-autopair-tensorart-crossbar.png` | 283,025 B | `ce286836acd5bf136b24e52e3682ea8c27598a80d93730fb907a87849c58aa56` | 模型中心 LoRA 分类下，顶部常驻跨供应商横栏（含 `Tensor.Art (TAMS)` 与 `Tensor.Art OpenWorks`），各 LoRA 卡片呈现 `🎯 选用 LoRA 并自动配对底模` 按钮。 |
| **10** | `10-executionlog-drawer-open.png` | `docs/evidence/2026-11-08/10-executionlog-drawer-open.png` | 305,116 B | `fab48a668293699dbf0bf6d8605ad2468b6f0c203b0a222873fc90af7133d2c4` | 底部 `ExecutionLog` 抽屉展开，实时展示各次真实网络出站记录。 |
| **11** | `11-api-parameter-editor-json.png` | `docs/evidence/2026-11-08/11-api-parameter-editor-json.png` | 352,303 B | `759ccf9f095070e57e73017d66895ec75d7f789d3571207ba43d71110ad1ed9b` | 参数总控台内的 `ApiParameterEditor` 自由 JSON 文本编辑框，支持自定义键值覆盖与官方 Schema 一键读取。 |
| **12** | `12-lora-autopair-checkpoint-button.png` | `docs/evidence/2026-11-08/12-lora-autopair-checkpoint-button.png` | 274,130 B | `a649db2e1c9c40ac82a12fbee3a9e13d89e54abd37071c243064b08ae2a37f0d` | LoRALoader 节点上明确呈现已验证底模配对按钮（`应用已验证底模 black-forest-labs/FLUX.1-dev`）。 |
| **13** | `13-real-run-actualrequest-upstream-response.png` | `docs/evidence/2026-11-08/13-real-run-actualrequest-upstream-response.png` | 343,453 B | `9b0da7b91bb37df51213993c719cc5fa9b7537917aa8df6fdf0f2f20f92ebab1` | **核心运行验收**：真实点击运行按钮，带满正向提示词、模型与参数，点击运行后真实出站抵达 DeepInfra，界面原样无损展示 HTTP 402 及 `{"detail":{"error":"You need positive balance to do inference. Please add balance manually or setup top-up"}}` (`PASS_BILLING`)。 |
| **14** | `14-real-run-executionlog-trace.png` | `docs/evidence/2026-11-08/14-real-run-executionlog-trace.png` | 358,732 B | `38891faddd6f7c1bfa355fe40d1166735318444bb51cadfcc862d0499f2c3a4f` | **执行追踪证据**：展开 ExecutionLog 真实追踪详情，展示实际请求端点、Key 轮换序号、HTTP 402 原始响应体与包含 `actualRequest` 的完整调用链路。 |

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
- **Tensor.Art (OpenWorks) 图像声明降级**: 原引用 `hist_1793693239642_fo6ux` 同样无磁盘产物，已同步降级为 `PASS_BILLING`。
- **Novita AI 视频状态修正**: 原声称 Novita SVD-XT 视频 `PASS_BILLING`，但在代码中 `RETIRED_PATTERNS` 已将 SVD-XT 判为退役，且 `videoGenerateRoute.ts` 的 `VIDEO_PROVIDERS` 不含 novita，该 403 无法从当前 UI 触达。已诚实修正为 `NOT_SENT`。
- **清理伪产物占位图**: `public/seed-ok-preview.png` 实测为 157 字节占位图（MD5 `8b8fe29e3d9e47c43ce8c42babeb6595`），已彻底从 git 追踪中删除 (`git rm`)。
- **历史截图跳号说明**: `docs/evidence/2026-11-05/final/` 的 41 张截图缺 31/36/37/38/39/41 编号，已在 `final.md` 索引开头明确补充跳号原由（历史分组编号而非顺序计数，全量 41 文件均唯一且有效）。
