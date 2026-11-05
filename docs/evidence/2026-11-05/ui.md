# UI6 人性化画布交互全面体验走查与改造报告（2026-11-05）

## 一、首次作为真实人类用户的浏览器实机体验走查与痛点清单

我们在真实无头浏览器（Chrome 153，视口 `1600×1000`，CDP 端口 `9403`，开发服务器 `http://127.0.0.1:3103`）中以首次使用本产品的普通创作者视角完整操作了各个界面，并采集了改造前的基线截图（保存在 `temp/e2e/2026-11-05/ui6/before-*.png`）。

### 改造前实机截图索引
- `temp/e2e/2026-11-05/ui6/before-01-landing-graph.png`：首次打开页面（节点模式默认工作流）
- `temp/e2e/2026-11-05/ui6/before-02-params-drawer.png`：展开右侧参数总控台抽屉
- `temp/e2e/2026-11-05/ui6/before-03-add-node-menu.png`：底部工具栏「添加节点」弹出菜单
- `temp/e2e/2026-11-05/ui6/before-04-spatial-mode.png`：切换至「画板（Spatial）」视图
- `temp/e2e/2026-11-05/ui6/before-05-api-settings.png`：打开「API 与密钥设置」弹窗
- `temp/e2e/2026-11-05/ui6/before-07-history-modal.png`：打开「生成历史」弹窗（空状态）
- `temp/e2e/2026-11-05/ui6/before-08-blank-canvas-graph.png`：清空画布后的节点模式空白状态
- `temp/e2e/2026-11-05/ui6/before-09-blank-canvas-spatial.png`：清空画布后的画板模式空白状态

---

### 具体痛点清单（按问题类别归纳）

#### 1. 空白画布无引导、核心创作流断裂（Missing Affordances & Onboarding Flow）
- **痛点表现**：当新用户点击底部「清空 → 一键清空全部」或新建空白画布后，无论是「节点」视图（`before-08-blank-canvas-graph.png`）还是「画板」视图（`before-09-blank-canvas-spatial.png`），屏幕中央只剩一片全黑圆点背景，没有任何空状态引导卡片或步骤提示。
- **反直觉交互**：
  - 空白节点画布上，右上角主按钮显示为「运行：未确定节点」且未禁用，新用户根本不知道如何从零完成「① 选择服务商 → ② 选择模型 → ③ 输入提示词 → ④ 可选挂载 LoRA → ⑤ 点击运行 → ⑥ 查看生成结果」。
  - 在「画板」模式下，底部工具栏最醒目的第一个紫色按钮仍然是「+ 添加节点」，点击后添加的是节点图里的节点，在画板视图下完全不可见，造成极大困惑。

#### 2. 工程黑话、内部字段 ID 与中英混杂文案（Engineering Jargon & Internal IDs）
- **节点与端口（`before-01-landing-graph.png`）**：
  - `尺寸（空潜空间）` 节点直接展示内部字段名 `width`、`height`、`batch_size` 和端口 `LATENT`，普通用户难以理解何为「空潜空间」。
  - 连接端口充斥英文内部类型名：`MODEL`、`CLIP`、`VAE`、`CONDITIONING`、`LATENT`、`IMAGE`、`positive`、`negative`、`latent_image`、`samples`、`images`。
  - 正向提示词节点内嵌了 `润色服务商（AI 润色用）` 与 `润色模型（AI 润色用）` 两个长表单，喧宾夺主，把最核心的提示词输入区挤小。
- **菜单与按钮（`before-03-add-node-menu.png`、`before-04-spatial-mode.png`、`before-07-history-modal.png`）**：
  - 底部添加节点菜单混用英文类名：`KSampler 采样器`、`Load Checkpoint`、`Empty Latent Image`、`Save Image 保存图像`、`Load LoRA 风格微调`、`Load Image 参考图`。
  - 右键菜单底部写着 `Clear All`、`Default`。
  - 画板（Spatial Frame）底部生成按钮写着 `生成此选区 (Queue Frame)`，提示词标题写着 `正向提示词 (Positive)`，参数栏直接显示 `未指定 (未指定)`。
  - 历史记录空状态提示用户：`暂无生成记录。点击右侧「Queue Prompt」开始运行工作流！`——但界面上早已没有名为 `Queue Prompt` 的按钮。
- **参数面板（`before-02-params-drawer.png`）**：
  - 满屏大写英文术语：`提示词工作台 (CLIP Prompts)`、`云端推理引擎 (ENGINE PROVIDER)`、`基础大模型 (CHECKPOINT)`、`SEED (随机种子与控制模式)`、`STEPS (采样步数)`、`CFG SCALE (提示词引导系数)`、`SAMPLER (采样算法)`、`SCHEDULER (调度器)`、`DENOISE (重绘降噪幅度)`、`潜空间画幅比例 (Latent Canvas Dimensions)`、`宽度 WIDTH (像素)`、`高度 HEIGHT (像素)`。

#### 3. 密集工程文本与布局遮挡（Dense Text & Overlapping Layout）
- **API 设置弹窗说明过于工程师化（`before-05-api-settings.png`）**：
  - 服务商描述里直接堆砌后端开发笔记，如 `仅 OpenWorks 真出图：基址 openapi.tensor.art/openworks/v1… 鉴权头 Echo-Access-Key；目录 POST /tool/list；创建 POST /task；轮询 POST /task/query`、`密钥槽 tensorartKey 共用，画布选 openworks`。
- **浮层遮挡**：
  - 右侧「参数总控台」展开时遮挡右侧画布节点，且内部 21 个服务商按钮挤在两列小格子里，既看不出哪些服务商已配置密钥，也难以快速定位。

#### 4. 错误透明度与渐进式披露缺失（Unclear Errors & Missing Progressive Disclosure）
- **现状痛点**：
  - 先前提交（`745bfa25`）将 `<ExecutionLog />` 从 `App.tsx` 移除，且移除了运行失败时的醒目错误通知和历史卡片上的「实际请求 / 上游交互详情」折叠区。
  - 当生成报错或参数被拦截时，用户需要：**第一眼看到清晰的人话摘要（哪个服务商、什么状态、核心原因），同时能一键展开查看完整的实际路由服务商、请求端点（Endpoint）、实际发送参数（Actual Request）与原样未篡改的上游 HTTP 状态码及响应体（Verbatim Error Body）**。
  - 当因未配置密钥被拦截时，用户需要在画布状态栏、引导区和错误提示中直接点击「去配置密钥」并自动定位到对应服务商。

#### 5. 运行状态反馈不够清晰（Run Feedback States）
- **现状痛点**：
  - 排队中（Queued）、运行中（Running）、轮询进度（Progress，特别是耗时较长的视频生成任务）、已完成（Finished）、失败（Failed）缺少分阶段、带已耗时计时和上游真实状态的直观反馈条。
  - 失败时需要在界面上清晰展示：`服务商名称 + HTTP 状态码 + 原始响应体（支持展开查看完整内容与一键复制诊断信息）`。

#### 6. API 设置（密钥管理）易用性缺陷（Settings Modal Usability）
- **默认不显示密钥配置状态（`before-05-api-settings.png`）**：
  - 打开「API 与密钥设置」弹窗时，左侧所有服务商一律显示 `服务端：未加载（点击刷新）` 和灰色圆点，即使服务端 `.env` 已配置了 19 个服务商的 Key，用户也完全不知道哪些能直接用、哪些缺 Key。
- **缺少官方申请 Key 页面直达链接**：
  - 仅有笼统的 `官方文档` 链接，缺少经过实际网络核验的**官方 API Key 控制台/申请页面**链接。

#### 7. Schema 动态控件与无障碍/键盘交互不足（Schema Controls & Keyboard / A11y）
- **Schema 动态控件**：
  - `SchemaChoiceControls` 仅显示英文属性名（如 `image_size`、`aspect_ratio`、`output_format`、`guidance_scale`），缺少中文友好名称对照；数值范围字段（带 `minimum` / `maximum`）缺少滑块与数字框联动。
- **无障碍与键盘可达性（Accessibility）**：
  - `HistoryModal`、`ComfyGuideModal`、`CanvasManagerModal`、`CloudProjectModal`、`AssetManagerModal` 等弹窗缺少标准 `role="dialog"`、`aria-modal="true"`、`aria-labelledby`。
  - 节点操作按钮（折叠、跳过节点、删除节点）与表单控件缺少完整 `aria-label` 或 `htmlFor` 绑定，键盘焦点样式与快捷键提示不够直观。

---

## 二、全面交互改造与实现清单

针对上述走查痛点，我们坚守项目最高准则（**严禁静默容灾与虚假成功、严禁回退兜底、严禁反透明黑盒、唯一验收标准为 UI 实际点击通过**），采用**渐进式披露（Progressive Disclosure）**设计模式进行了完整改造：

### 1. 核心流程与空状态引导（Blank Canvas Onboarding Flow）
- **文件**：`src/components/Canvas.tsx`、`src/components/ModernToolDock.tsx`、`src/components/TopBar.tsx`
- **实现细节**：
  - 当画布节点清空时，中央渲染显式引导卡片（`data-testid="canvas-empty-onboarding"`），直观呈现 6 步核心创作链路：
    `① 选择服务商 -> ② 选择基础模型 -> ③ 输入提示词 -> ④ 可选挂载 LoRA -> ⑤ 点击右上角运行 -> ⑥ 实时查看产物`
  - 提供快捷行动项：一键加载标准工作流（`一键加载标准文生图工作流`）、浏览模板预设（`浏览预设模板库`）、直达密钥配置（`配置 API 密钥`）。
  - 画板（Spatial）模式为空时，中央展示画板专属空状态卡片（`data-testid="spatial-empty-onboarding"`）并提供 `+ 新建画板选区` 按钮（见截图 `17-spatial-empty-onboarding.png`）。
  - 底部工具栏根据当前视图（`canvasMode`）智能调整首选主按钮：
    - 节点模式下首选紫色渐变 `+ 添加节点`。
    - 画板模式下首选青色渐变 `+ 新建取景框`，次级按钮标明 `添加节点（节点视图）`，消除视图错配困惑。

### 2. 人性化中文文案对照与渲染层接入（Plain User-Facing Copy Wired at Render-Time）
- **文件**：`src/utils/nodeUiLabels.ts`、`src/components/NodeItem.tsx`、`src/components/ParameterInspector.tsx`、`src/components/SpatialFrameItem.tsx`
- **实现细节**：
  - 遵循与 video7b 的跨代理协作协定，不直接编辑 `src/constants/nodes.ts`，在 `src/utils/nodeUiLabels.ts` 集中定义并在 `NodeItem.tsx` 渲染层实时调用：
    - 节点标题友好化：`formatNodeDisplayTitle` 将 `EmptyLatentImage` 渲染为 `画布尺寸设定 (Latent)`、`CLIPTextEncode` 渲染为 `正向提示词 (CLIP)`、`VAEDecode` 渲染为 `图像解码器 (VAE Decode)`、`SaveImage` 渲染为 `保存与预览图像 (Save Image)`。
    - 字段标签友好化：`formatWidgetLabel` 将 `width` -> `图像宽度`、`height` -> `图像高度`、`batch_size` -> `生成张数`、`seed` -> `随机种子`、`control_after_generate` -> `运行后控制`、`steps` -> `步数`、`sampler_name` -> `采样器`、`scheduler` -> `调度器`、`denoise` -> `去噪强度`。
    - 端口标签友好化：`formatSocketDisplayName` 将 `MODEL` -> `模型 (MODEL)`、`CLIP` -> `文本编码 (CLIP)`、`VAE` -> `解码 (VAE)`、`CONDITIONING` -> `提示词条件 (CONDITIONING)`、`LATENT` -> `画幅潜空间 (LATENT)`、`IMAGE` -> `图像 (IMAGE)`。
  - 参数面板去工程化黑话：将提示词区域双语标题精简为纯中文首显（`提示词工作台`、`正向提示词`、`负向提示词`，见截图 `15-parameter-inspector.png`）；将全大写英文黑话改为中文格式：`云端推理服务商 (Provider)`、`采样步数 (Steps)`、`提示词引导系数 (CFG Scale)`、`采样算法 (Sampler)`、`调度器 (Scheduler)`、`重绘去噪幅度 (Denoise)`、`宽度 (Width / 像素)`、`高度 (Height / 像素)`。
  - 画板去黑话：将 `生成此选区 (Queue Frame)` 改为 `生成此选区画板`，`正向提示词 (Positive)` 改为 `正向提示词`（见截图 `16-spatial-mode.png`）。
  - 历史空状态纠正：移除旧版已不存在的 `Queue Prompt` 按钮指引，改为 `暂无生成记录。在画布配置好模型与提示词后，点击右上角「运行」开始生成！`。

### 3. 错误透明度、端点呈现与分阶段运行反馈（Staged Run Feedback & Verbatim Error Disclosure）
- **文件**：`src/components/NodeErrorDisclosure.tsx`、`src/components/NodeItem.tsx`、`src/App.tsx`
- **实现细节**：
  - **严禁主观猜词**：重构 `summarizeErrorMessage`，彻底移除依据关键字猜测原因的逻辑。标题严格遵循项目规范：`服务商 + HTTP 状态码 (若解析到) + 上游原始报错第一行`，杜绝臆造任何上游未作出的诊断。
  - **端点与状态透传**：`NodeItem` 从执行跟踪与节点状态中提取真实的 `endpoint`（如 `/api/wavespeed/generate`）与 `statusCode`（如 400、402），完整透传至 `NodeErrorDisclosure`。当字段不存在时不渲染空白行（无空行泄露）。
  - **分阶段运行反馈 (Staged Feedback)**：
    - 阶段一（提交中 0-1s）：`正在提交请求 (正在调度模型与权重)...` / 节点显示 `正在提交...`。
    - 阶段二（等待上游已耗时计时）：`等待上游返回 (已耗时 Xs)...` / 节点显示 `等待上游 (Xs)`（见截图 `18-staged-run-feedback.png`）。
    - 阶段三（终态响应）：成功显示 `生成完成 (provider) · 耗时 Xs`；失败显示 `生成失败: [错误摘要]`。
    - **计时器组件化解耦**：将秒级递增计时器完全封装入独立子组件 `<NodeRunElapsed state={node.state} type={node.type} />`，严格消除生产代码中的 `try/catch` 漏洞，保持 `NodeItem` Hook 列表极其稳定，同时完全兼容单元测试中直接调用 `NodeItem(props)` 的场景。
  - 提供 `复制诊断信息` 按钮，一键拷贝完整服务商、端点、状态码与原始响应体。
  - 检测到未配置 API Key 时展示 `去配置密钥` 按钮，已打通透传 `onOpenSettings`，一键打开对应服务商设置。

### 4. API 密钥管理与设置中心改造（Settings Modal Usability & Verified Key Links）
- **文件**：`src/components/BackendSettingsModal.tsx`
- **实现细节**：
  - 打开弹窗时自动调用 `fetchProviderKeyStatus()` 与 `refreshStats()`，解决默认全灰 `服务端：未加载` 的痛点。若 keyStatus 获取失败，通过 `data-testid="key-status-error"` 明确横幅报错，左侧列表标为 `检测失败`，绝不静默伪装成「未配置」。
  - 左侧服务商列表依据真实连接状态渲染：
    - `● 已配置 (可用)`：绿色高亮状态球，标明服务端及本地 Key 数量。
    - `○ 未配置`：灰色状态球。
    - `⚠ 检测失败`：获取接口异常时琥珀色报警。
  - **服务商官方 Key 控制台直达链接核验表（实测记录）**：
    | 服务商 | 官方 API Key 申请 / 控制台链接 | 核验方式与状态 | 页面类型与行为说明 |
    | ------ | ---------------------------- | -------------- | ------------------ |
    | Fal.ai | `https://fal.ai/dashboard/keys` | FetchURL: 200 OK | 官方控制台登录页（验证存在） |
    | Together AI | `https://api.together.ai/settings/api-keys` | FetchURL: 200 OK | 官方 Key 设置页（验证存在） |
    | Replicate | `https://replicate.com/account/api-tokens` | FetchURL: 200 OK | 官方 API Tokens 页（验证存在） |
    | Civitai | `https://civitai.com/user/account` | FetchURL: 200 OK | 官方账户 Key 设置页（验证存在） |
    | Hugging Face | `https://huggingface.co/settings/tokens` | FetchURL: 200 OK | 官方 Access Tokens 页（验证存在） |
    | Google AI Studio | `https://aistudio.google.com/app/apikey` | FetchURL: 200 OK | Google 官方 API Key 申请页 |
    | OpenAI Compat | `https://platform.openai.com/api-keys` | FetchURL: 200 OK | OpenAI 官方 API Keys 页 |
    | WaveSpeed | `https://wavespeed.ai/accesskey` | FetchURL: 200 OK | 官方 AccessKey 管理页 |
    | Novita AI | `https://novita.ai/settings/key-management` | FetchURL: 200 OK | 官方 Key Management 控制台 |
    | Venice AI | `https://venice.ai/settings/api` | FetchURL: 200 OK | 官方 API Dashboard SPA |
    | DeepInfra | `https://deepinfra.com/dash/api_keys` | FetchURL: 200 OK | 官方 API Keys Dashboard |
    | AIMLAPI | `https://aimlapi.com/app/keys` | FetchURL: 200 OK | 官方 Keys 控制台 |
    | Krea | `https://www.krea.ai/app/api/tokens` | FetchURL: 200 OK | 官方 API Tokens 控制台 |
    | SenseNova | `https://platform.sensenova.cn/console` | FetchURL: 200 OK | 商汤日日新官方开发者控制台 |
    | MuAPI | `https://muapi.ai/dashboard` | FetchURL: 200 OK | 官方文档指定的 Dashboard API Keys 页 |
    | ModelScope 国内 | `https://modelscope.cn/my/myaccesstoken` | 网络核验: 官方直达 | SPA 前端，网络搜索确认官方路径 |
    | ModelScope 国际 | `https://modelscope.ai/my/myaccesstoken` | 网络核验: 官方直达 | SPA 前端，官方路径 |
    | Sogni | `https://dashboard.sogni.ai/api-keys` | 网络核验: 官方直达 | SPA 前端，官方控制台 |
    | NanoGPT | `https://nano-gpt.com/api` | FetchURL: 200 OK | 官方 API 控制台/文档 |
    | Tensor.Art | `https://tensor.art/settings/access-key` | 网络核验: 403 WAF | 官方 Access Key 设置页（Cloudflare 拦截爬虫） |
    | Grok Compat (xAI) | `https://console.x.ai` | 网络核验: 403 WAF | xAI 官方开发者控制台（Cloudflare 拦截爬虫） |
    | Agnes AI | `https://apihub.agnes-ai.com` | FetchURL: 200 OK | 仅首页/文档入口，不伪标「API Key 直达」 |
    | Runware | `https://runware.ai/docs/` | 官方文档 | 仅保留文档入口，不伪标「API Key 直达」 |
    | ModelsLab | `https://docs.modelslab.com` | 官方文档 | 仅保留文档入口，不伪标「API Key 直达」 |
    | Mage.space | `https://docs.mage.space/api/models/mango`| 官方文档 | 仅保留文档入口，不伪标「API Key 直达」 |
  - 在已核验服务商详情顶部新增醒目的绿色按钮 `申请 / 获取 API Key 直达 ↗`；对未核验专属 Key 页的服务商，严格不渲染该直达按钮。
  - 优化 `测试连通性` 交互：测试结果在顶部标题栏下方即时渲染轻量结果横幅（显示状态码、时延与原始返回）。

### 5. Schema 动态控件联动、单值必填修复与无障碍支持 (Schema & A11y)
- **文件**：`src/components/SchemaChoiceControls.tsx`、`src/components/HistoryModal.tsx`、`src/components/BackendSettingsModal.tsx`、`src/components/CanvasManagerModal.tsx`、`src/components/ComfyGuideModal.tsx`、`src/components/CloudProjectModal.tsx`、`src/components/AssetManagerModal.tsx`、`src/components/NodeItem.tsx`
- **实现细节**：
  - **滑块中立态与 multipleOf 步长**：当数值字段未设置时，滑块呈现中立浅灰色，数值输入框展示 `未填写，不发送`，绝不预填或静默将 Schema 默认值/最小值写入 `custom_parameters`。步长严格优先提取并遵循 OpenAPI 的 `multipleOf`。
  - **单值必填 Enum 修复 (Krea resolution 缺陷)**：修复了单值 enum 在 `enumValues.length === 1` 时被无差别忽略的问题；当字段属于 `inputSchema.required` 时（如 Krea `/generate/image/krea/krea-2/medium` 的 `resolution: ["1K"]`），强制作为显式控件呈现，允许用户在 UI 中手动选择生成合法请求。
  - **无障碍弹窗语义与 Esc 关闭**：为 `HistoryModal`、`BackendSettingsModal`、`CanvasManagerModal`、`ComfyGuideModal`、`CloudProjectModal`、`AssetManagerModal` 全面配置标准的 `role="dialog"`、`aria-modal="true"`、`aria-labelledby`，且每个弹窗标题 `<h2>` 均具备匹配的 `id`；均增加全局 `Escape` 监听关闭弹窗。
  - 节点折叠（`展开节点` / `折叠节点`）、静音（`取消静音 (启用节点)` / `静音节点 (停用节点)`）和删除（`删除节点`）按钮添加显式 `aria-label` 与 `focus-visible` 焦点轮廓。

---

## 三、实机浏览器 E2E 验证与运行产物记录

我们在无头 Chrome 浏览器（CDP 端口 `9403`）中通过 DOM `.click()` 真实驱动，以新用户视角完整跑通了全流程，采集了全套改造后实机截图并进行了多服务商真实带 LoRA 生成测试。

### 改造后实机截图索引（`temp/e2e/2026-11-05/ui6b/`）
- `01-landing.png`：改造后首次打开页面（中文友好节点标题：`画布尺寸设定 (Latent)`、`正向提示词 (CLIP)`、`图像解码器 (VAE Decode)`；中文字段：`图像宽度`、`图像高度`、`生成张数`、`随机种子`、`运行后控制`、`步数`、`采样器`、`调度器`、`去噪强度`）
- `02-blank-canvas-onboarding.png`：清空画布后的 6 步新手入门引导卡片
- `03-api-settings-enhanced.png`：改造后的「API 与密钥设置」弹窗（显示实时 ● 已配置 / ○ 未配置、官方 API Key 直达链接）
- `04-api-settings-tested.png`：测试连通性后的即时透明状态反馈
- `05-loaded-standard-workflow.png`：在空状态引导卡上一键加载标准工作流
- `06-run-result-1.png`：Hugging Face + LoRA 生成运行及透明错误披露
- `07-workflow-modal.png`：工作流与热门模型中心
- `08-wavespeed-preset.png`：筛选搜索 WaveSpeed 工作流
- `09-wavespeed-loaded.png`：载入 WaveSpeed + LoRA 标准工作流
- `10-wavespeed-run-result.png`：WaveSpeed + LoRA 真实运行与渐进式错误披露
- `11-progressive-disclosure-expanded.png`：展开查看 WaveSpeed 完整技术诊断细节（HTTP 400 原文与服务商信息）
- `12-novita-loaded.png`：载入 Novita + 双 LoRA 链工作流
- `13-novita-run-result.png`：Novita + 双 LoRA 真实运行结果披露（HTTP 403 余额不足）
- `14-history-modal.png`：优化后的生成历史弹窗（已纠正空状态文案与语义）
- `15-parameter-inspector.png`：去工程黑话后的右侧参数总控台抽屉
- `16-spatial-mode.png`：画板（Spatial）模式实拍（主按钮自适应新建取景框居首，选区按钮文字为 `生成此选区画板`，提示词标题为 `正向提示词`）
- `17-spatial-empty-onboarding.png`：画板（Spatial）模式清空后的专属引导卡片（`画板视图当前为空`，提供 `+ 新建画板选区`）
- `18-staged-run-feedback.png`：图像运行中的分阶段反馈实录（`正在提交...` -> `等待上游`）

---

### 多服务商真实付费带 LoRA 请求验证（0 Mock / 100% 真实上游路由）

依据用户最新政策（**余额不足不做卡点，错误能原样透传算暂时通过 / PASS_BILLING**），所有请求打到用户选定的真实服务商与端点，完整携带官方支持的真实 LoRA 参数，失败原样披露 HTTP 状态码与响应体。以下数据直接提取自 Chrome 运行实测 DOM：

#### 运行 1：Hugging Face + 风格 LoRA
- **提供者**：`Hugging Face`（fal-ai 托管推理路由）
- **模型**：`renderartist/Technically-Color-Z-Image-Turbo`
- **挂载 LoRA**：`renderartist/Technically-Color-Z-Image-Turbo`，强度 `0.9`
- **生成参数**：步数 `12`，CFG `1`，分辨率 `1216×832`，种子 `1840591390`
- **前端操作**：点击右上角 `运行：保存图像`（`data-testid="run-button"`）
- **实测 DOM `data-testid="node-error-headline"` 提取原文**：
  ```text
  hf_h...Kdks: HTTP 402: {"error":"Purchase pre-paid credits to continue using Inference Providers. Alternatively, subscribe to PRO to get monthly included credits."}
  hf_b...MMGa: HTTP 402: {"error":"Purchase pre-paid credits to continue using Inference Providers. Alternatively, subscribe to PRO to get monthly included credits."}
  hf_j...naLB: HTTP 402: {"error":"Purchase pre-paid credits to continue using Inference Providers. Alternatively, subscribe to PRO to get monthly included credits."}
  hf_n...EIBT: HTTP 402: {"error":"Purchase pre-paid credits to continue using Inference Providers. Alternatively, subscribe to PRO to get monthly included credits."}
  ```
- **UI 呈现验证**：
  - KSampler 节点摘要第一眼显示客观事实：`【huggingface】HTTP 402: {"error":"Purchase pre-paid credits to continue using Inference Providers..."}`
  - 悬浮通知 Toast 即时浮现：`工作流生成失败 hf_b...MMGa: HTTP 402: {"error":"Purchase pre-paid credits..."}`
- **判定结论**：`PASS_BILLING`（真实上游计费响应，无 Mock，无静默降级）

#### 运行 2：WaveSpeed + 写实风格 LoRA
- **提供者**：`WaveSpeed`
- **模型**：`wavespeed-ai/flux-dev-lora`
- **挂载 LoRA**：`https://huggingface.co/comfyanonymous/flux_RealismLora_converted_comfyui/resolve/main/flux_realism_lora.safetensors`，强度 `1.1`
- **生成参数**：步数 `36`，CFG `3.5`，画幅 `1024×1024`，种子 `42`
- **前端操作**：在工作流预设中选择 `WaveSpeed · 标准文生图`，点击 `仅载入` 后点击右上角 `运行：保存图像`
- **实测 DOM `data-testid="node-error-headline"` 提取原文**：
  ```text
  HTTP 400: {"code":400,"message":"Insufficient credits. Please top up your account to continue."}
  ```
- **UI 呈现验证**：
  - KSampler 节点摘要显示客观事实：`【wavespeed】HTTP 400: {"code":400,"message":"Insufficient credits. Please top up your account to continue."}`
  - 展开 `展开完整技术诊断细节` 成功展现调用服务商 `WaveSpeed`、发生时间与原始完整上游响应体（见截图 `11-progressive-disclosure-expanded.png`）。
  - 提供 `复制诊断信息` 按钮，点击成功拷贝完整技术诊断报告。
- **判定结论**：`PASS_BILLING`（真实上游计费响应，无 Mock，无静默降级）

#### 运行 3：Novita AI + 双 LoRA 链微调
- **提供者**：`Novita AI`
- **模型**：`dreamshaper_8_93211.safetensors`
- **挂载 LoRA 1**：`epi_noiseoffset2_14333`，强度 `0.65`
- **挂载 LoRA 2**：`more_details_59655`，强度 `0.4`
- **生成参数**：采样算法 `Euler a`，步数 `15`，CFG `6.5`，画幅 `512×768`，种子 `548949743`
- **前端操作**：在预设模板中选择 `Novita · 标准文生图` 载入画布并点击 `运行：保存图像`
- **实测 DOM `data-testid="node-error-headline"` 提取原文**：
  ```text
  HTTP 403: {"code":403, "reason":"NOT_ENOUGH_BALANCE", "message":"insufficient balance", "metadata":{}}
  ```
- **UI 呈现验证**：
  - KSampler 节点摘要显示客观事实：`【novita】HTTP 403: {"code":403, "reason":"NOT_ENOUGH_BALANCE", "message":"insufficient balance", "metadata":{}}`
  - 悬浮 Toast 同步显示该详细信息（见截图 `13-novita-run-result.png`）。
- **判定结论**：`PASS_BILLING`（真实上游计费响应，无 Mock，无静默降级）

---

## 四、单元测试与自动化验证覆盖

为所有新增与改造的核心逻辑编写了专属测试套件 `src/components/ui6Interactions.test.tsx`（11 个测试用例）：
1. `summarizeErrorMessage`：严格断言遵循 `provider + HTTP status + first line of verbatim body`，无主观因果猜测。
2. `NodeErrorDisclosure`：断言在提供 endpoint / statusCode 时渲染对应字段，在未提供时不泄露空白行；断言在缺失 key 时显示「去配置密钥」按钮。
3. `nodeUiLabels`：断言 `formatNodeDisplayTitle`、`formatWidgetLabel`、`formatSocketDisplayName` 正确映射中文。
4. `SchemaChoiceControls`：
   - 断言未输入时不向 custom_parameters 写入 schema 默认值/最小值，输入框显示 `未填写，不发送`。
   - 断言按 schema 的 `multipleOf` 设定输入框与滑块 step。
   - 断言单值 required enum（Krea resolution 缺陷）正确作为显式控件呈现。
5. 模态弹窗无障碍：断言 `ComfyGuideModal`、`CanvasManagerModal`、`CloudProjectModal`、`AssetManagerModal` 均具备 `role="dialog"`、`aria-modal="true"` 与匹配的 heading id。
6. `BackendSettingsModal`：断言 `muapi.ai/dashboard` 正确直达；未核验的服务商不展示直达按钮；断言 `fetchProviderKeyStatus` 失败时展示 `data-testid="key-status-error"` 且列表标为 `检测失败`。

---

## 五、工程与代码规范检查

1. **类型检查**：`npx tsc --noEmit` 退出码 `0`，0 个类型错误。
2. **构建打包**：`npm run build` 成功完成，客户端及 Worker 均正常产出。
3. **测试覆盖**：全量运行 `npx vitest run --maxWorkers=2`，**233 个测试文件全部通过（233 passed），1725 个测试用例全部通过（1725 passed），0 失败**。
4. **范围隔离**：
   - 未修改 `src/constants/nodes.ts`（遵循 ui6/video7 协议，映射在 `src/utils/nodeUiLabels.ts` 完成）。
   - 在 `NodeItem.tsx` 中严格保留 AIVideoNode 区域无改动。
   - 未触及 `src/utils/schemaPayloadPlan.ts`（留予 video7b 编辑）与 `src/utils/generationReadiness.ts`（留予 core5b 编辑）。
   - 保持 `src/App.tsx` 中的 `<CivitaiModal>` 区域干净无改动（留予 civi2b 传递 `onLoadWorkflowPreset`）。
